import { useState, useEffect, useMemo } from 'react';
import type {
  AppSettings,
  NormalizedBillingSettingsConfig,
  PayoutPayeeRecord,
  PayoutPayeeType,
  PayoutSettlementRecord,
  PayoutSettlementStatus,
} from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import { getBookingService } from '../../../../core/services/booking';
import { getInvoicingService } from '../../../../core/services/invoicing.service';
import {
  getOperatorService,
  type DriverRosterItem,
  type OperatorUser,
} from '../../../../core/services/operator.service';
import {
  buildPayoutLedgerEntry,
  computeDriverEarningsRollup,
  computeStaffPayoutPreview,
  exportPayoutsCsv,
  type PayoutPeriodPreset,
  type StaffHoursInputValue,
} from '../../../../core/services/payouts.service';
import { triggerInvoicingBrowserDownload } from './invoicing-helpers.util';

export interface UseAdminPayoutsControllerParams {
  settings: AppSettings;
  billingDraft: NormalizedBillingSettingsConfig;
  isActivePayoutsSub: boolean;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  setIsSaving: (v: boolean) => void;
  showSuccess: (msg: string, ms?: number) => void;
  onLedgerRefresh: () => Promise<void>;
}

export function useAdminPayoutsController({
  settings,
  billingDraft,
  isActivePayoutsSub,
  onSave,
  setIsSaving,
  showSuccess,
  onLedgerRefresh,
}: UseAdminPayoutsControllerParams) {
  const [activePayeeTab, setActivePayeeTab] = useState<PayoutPayeeType>('driver');
  const [payoutPeriod, setPayoutPeriod] = useState<PayoutPeriodPreset>('30d');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<DriverRosterItem[]>([]);
  const [operators, setOperators] = useState<OperatorUser[]>([]);
  const [driverCommissionOverrides, setDriverCommissionOverrides] = useState<Record<string, number>>(
    {}
  );
  const [staffHoursMap, setStaffHoursMap] = useState<Record<string, StaffHoursInputValue>>({});
  const [otherPayeeInputs, setOtherPayeeInputs] = useState<
    Record<string, { volume: number; adjustments: number }>
  >({});

  const customPayees = settings.customPayees || [];
  const payoutSettlements = useMemo(
    () =>
      [...(settings.payoutSettlements || [])].sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      ),
    [settings.payoutSettlements]
  );

  useEffect(() => {
    if (!isActivePayoutsSub) return;
    const opSvc = getOperatorService();
    const unsubDrivers = opSvc.subscribeToDrivers((d) => setDrivers(d));
    const unsubOps = opSvc.subscribeToOperators((ops) => setOperators(ops));
    return () => {
      unsubDrivers();
      unsubOps();
    };
  }, [isActivePayoutsSub]);

  // Date/status-filtered trip query scoped to `payoutPeriod` & `activePayeeTab` (replaces 45k `getAllTrips()`)
  useEffect(() => {
    if (!isActivePayoutsSub) return;
    const bookingSvc = getBookingService();
    const now = new Date();
    let startDateIso: string | undefined;
    if (payoutPeriod === '7d') {
      startDateIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    } else if (payoutPeriod === '14d') {
      startDateIso = new Date(now.getTime() - 14 * 86_400_000).toISOString();
    } else if (payoutPeriod === '30d') {
      startDateIso = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    } else if (payoutPeriod === 'mtd') {
      startDateIso = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
    } else {
      startDateIso = new Date(now.getTime() - 90 * 86_400_000).toISOString();
    }

    let cancelled = false;
    if (bookingSvc.queryTripsPage) {
      bookingSvc
        .queryTripsPage({
          status: activePayeeTab === 'driver' ? 'completed' : 'all',
          startDateIso,
          limit: 250,
          orderField: 'createdAt',
          orderDirection: 'desc',
        })
        .then((page) => {
          if (!cancelled) setTrips(page.trips);
        })
        .catch(() => {});
    } else if (bookingSvc.getActiveAndUpcomingTrips) {
      bookingSvc
        .getActiveAndUpcomingTrips({ pastHours: 24 * 30, futureHours: 24, limit: 250 })
        .then((list) => {
          if (!cancelled) setTrips(list);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [isActivePayoutsSub, payoutPeriod, activePayeeTab]);

  const driverRollups = useMemo(
    () =>
      computeDriverEarningsRollup(
        trips,
        drivers,
        billingDraft.driverDefaultCommissionPercent,
        payoutPeriod,
        payoutSettlements,
        driverCommissionOverrides
      ),
    [
      trips,
      drivers,
      billingDraft.driverDefaultCommissionPercent,
      payoutPeriod,
      payoutSettlements,
      driverCommissionOverrides,
    ]
  );

  const staffPreviews = useMemo(
    () =>
      computeStaffPayoutPreview(
        operators,
        trips,
        staffHoursMap,
        billingDraft,
        payoutPeriod,
        {},
        payoutSettlements
      ),
    [operators, trips, staffHoursMap, billingDraft, payoutPeriod, payoutSettlements]
  );

  const handleSaveCustomPayee = async (payee: PayoutPayeeRecord) => {
    setIsSaving(true);
    try {
      const exists = customPayees.some((p) => p.id === payee.id);
      const next = exists
        ? customPayees.map((p) => (p.id === payee.id ? payee : p))
        : [payee, ...customPayees];
      await onSave({ customPayees: next });
      showSuccess(`Saved payee "${payee.name}".`, 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCustomPayee = async (payeeId: string) => {
    setIsSaving(true);
    try {
      await onSave({ customPayees: customPayees.filter((p) => p.id !== payeeId) });
      showSuccess('Removed custom payee.', 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecordSettlement = async (settlement: PayoutSettlementRecord) => {
    setIsSaving(true);
    try {
      const finalRecord: PayoutSettlementRecord = {
        ...settlement,
        paidAt:
          settlement.status === 'paid'
            ? settlement.paidAt || new Date().toISOString()
            : undefined,
      };
      const nextSettlements = [
        finalRecord,
        ...payoutSettlements.filter((s) => s.id !== finalRecord.id),
      ];
      await onSave({ payoutSettlements: nextSettlements });
      if (finalRecord.status === 'paid' && finalRecord.netPayoutAmount > 0) {
        await getInvoicingService().recordLedgerEntry(buildPayoutLedgerEntry(finalRecord));
        await onLedgerRefresh();
      }
      showSuccess(
        `Recorded ${finalRecord.status.toUpperCase()} payout of $${finalRecord.netPayoutAmount.toFixed(
          2
        )} for ${finalRecord.payeeName}.`,
        3500
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateSettlementStatus = async (
    settlementId: string,
    nextStatus: PayoutSettlementStatus,
    referenceNumber?: string
  ) => {
    const existing = payoutSettlements.find((s) => s.id === settlementId);
    if (!existing) return;
    setIsSaving(true);
    try {
      const wasPaid = existing.status === 'paid';
      const updated: PayoutSettlementRecord = {
        ...existing,
        status: nextStatus,
        referenceNumber: referenceNumber ?? existing.referenceNumber,
        paidAt:
          nextStatus === 'paid' ? existing.paidAt || new Date().toISOString() : existing.paidAt,
      };
      await onSave({
        payoutSettlements: payoutSettlements.map((s) => (s.id === settlementId ? updated : s)),
      });
      if (!wasPaid && nextStatus === 'paid' && updated.netPayoutAmount > 0) {
        await getInvoicingService().recordLedgerEntry(buildPayoutLedgerEntry(updated));
        await onLedgerRefresh();
      }
      showSuccess(`Settlement for ${updated.payeeName} marked ${nextStatus.toUpperCase()}.`, 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPayoutsCsv = () => {
    const source = payoutSettlements.length > 0 ? payoutSettlements : driverRollups;
    const exported = exportPayoutsCsv(source);
    triggerInvoicingBrowserDownload(exported.csvContent, exported.mimeType, exported.fileName);
    showSuccess(`Exported ${exported.rowCount} payout record(s) (${exported.fileName}).`, 3500);
  };

  return {
    activePayeeTab,
    setActivePayeeTab,
    payoutPeriod,
    setPayoutPeriod,
    driverRollups,
    driverCommissionOverrides,
    setDriverCommissionOverrides,
    staffPreviews,
    staffHoursMap,
    setStaffHoursMap,
    customPayees,
    otherPayeeInputs,
    setOtherPayeeInputs,
    payoutSettlements,
    handleSaveCustomPayee,
    handleDeleteCustomPayee,
    handleRecordSettlement,
    handleUpdateSettlementStatus,
    handleExportPayoutsCsv,
  };
}
