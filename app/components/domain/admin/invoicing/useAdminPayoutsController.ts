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
  type DriverPayoutOverrideInput,
  type PayoutPeriodPreset,
  type StaffHoursInputValue,
} from '../../../../core/services/payouts.service';
import { triggerInvoicingBrowserDownload } from './invoicing-helpers.util';

export interface UseAdminPayoutsControllerParams {
  settings: AppSettings;
  billingDraft: NormalizedBillingSettingsConfig;
  activeSub?: string;
  isActivePayoutsSub: boolean;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  setIsSaving: (v: boolean) => void;
  showSuccess: (msg: string, ms?: number) => void;
  onLedgerRefresh: () => Promise<void>;
}

function resolvePayeeTabFromSub(sub?: string): PayoutPayeeType {
  if (sub === 'staff-payouts') return 'staff';
  if (sub === 'other-payees') return 'other';
  return 'driver';
}

export function useAdminPayoutsController({
  settings,
  billingDraft,
  activeSub,
  isActivePayoutsSub,
  onSave,
  setIsSaving,
  showSuccess,
  onLedgerRefresh,
}: UseAdminPayoutsControllerParams) {
  const [activePayeeTab, setActivePayeeTab] = useState<PayoutPayeeType>(() =>
    resolvePayeeTabFromSub(activeSub)
  );
  const [payoutPeriod, setPayoutPeriod] = useState<PayoutPeriodPreset>('30d');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<DriverRosterItem[]>([]);
  const [operators, setOperators] = useState<OperatorUser[]>([]);
  const [driverCommissionOverrides, setDriverCommissionOverrides] = useState<Record<string, number>>(
    {}
  );
  const [driverPayoutOverrides, setDriverPayoutOverrides] = useState<
    Record<string, DriverPayoutOverrideInput>
  >({});
  const [staffHoursMap, setStaffHoursMap] = useState<Record<string, StaffHoursInputValue>>({});
  const [otherPayeeInputs, setOtherPayeeInputs] = useState<
    Record<string, { volume: number; adjustments: number }>
  >({});

  useEffect(() => {
    if (
      activeSub === 'driver-payouts' ||
      activeSub === 'staff-payouts' ||
      activeSub === 'other-payees' ||
      activeSub === 'payouts'
    ) {
      setActivePayeeTab(resolvePayeeTabFromSub(activeSub));
    }
  }, [activeSub]);

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
        driverCommissionOverrides,
        billingDraft,
        driverPayoutOverrides
      ),
    [
      trips,
      drivers,
      billingDraft,
      payoutPeriod,
      payoutSettlements,
      driverCommissionOverrides,
      driverPayoutOverrides,
    ]
  );

  const updateDriverPayoutOverride = (
    driverId: string,
    patch: Partial<DriverPayoutOverrideInput>
  ) => {
    setDriverPayoutOverrides((prev) => {
      const existing = prev[driverId] || {};
      return {
        ...prev,
        [driverId]: {
          ...existing,
          ...patch,
          ...(patch.paymentTypeCommissionRates !== undefined
            ? {
                paymentTypeCommissionRates: {
                  ...(existing.paymentTypeCommissionRates || {}),
                  ...patch.paymentTypeCommissionRates,
                },
              }
            : {}),
        },
      };
    });
  };

  const handleSaveDriverPayoutSettings = async (
    driverId: string,
    patch?: Partial<DriverPayoutOverrideInput>
  ) => {
    const opSvc = getOperatorService();
    const existingOp = operators.find((o) => o.uid === driverId) || opSvc.getOperatorById(driverId);
    const rosterDriver = drivers.find((d) => d.id === driverId);
    if (!existingOp && !rosterDriver) return;

    const mergedOverride: DriverPayoutOverrideInput = {
      ...(driverPayoutOverrides[driverId] || {}),
      ...(patch || {}),
    };

    setIsSaving(true);
    try {
      const baseOp: OperatorUser = existingOp || {
        uid: driverId,
        email: rosterDriver?.email || `${driverId}@chesterfieldtaxi.com`,
        displayName: rosterDriver?.name || driverId,
        firstName: rosterDriver?.firstName,
        lastName: rosterDriver?.lastName,
        cabNumber: rosterDriver?.cabNumber,
        username: rosterDriver?.username,
        role: 'driver',
        roles: ['driver'],
        phone: rosterDriver?.phone || '',
        carOwnership: rosterDriver?.carOwnership || 'owner_operator',
      };

      const nextCommissionRate =
        mergedOverride.commissionPercent !== undefined
          ? mergedOverride.commissionPercent === null
            ? undefined
            : Number(
                Math.min(1, Math.max(0, Number(mergedOverride.commissionPercent) / 100)).toFixed(4)
              )
          : driverCommissionOverrides[driverId] !== undefined
          ? Number(
              Math.min(1, Math.max(0, driverCommissionOverrides[driverId] / 100)).toFixed(4)
            )
          : baseOp.commissionRate;

      const updatedOp: OperatorUser = {
        ...baseOp,
        carOwnership: mergedOverride.carOwnership ?? baseOp.carOwnership ?? 'owner_operator',
        payoutType: mergedOverride.payoutType ?? baseOp.payoutType ?? 'percent',
        flatPayoutPeriod: mergedOverride.flatPayoutPeriod ?? baseOp.flatPayoutPeriod ?? 'week',
        flatPayoutAmount:
          mergedOverride.flatPayoutAmount !== undefined
            ? Math.max(0, Number(mergedOverride.flatPayoutAmount) || 0)
            : baseOp.flatPayoutAmount,
        commissionRate: nextCommissionRate,
        paymentTypeCommissionRates:
          mergedOverride.paymentTypeCommissionRates !== undefined
            ? {
                ...(baseOp.paymentTypeCommissionRates || {}),
                ...mergedOverride.paymentTypeCommissionRates,
              }
            : baseOp.paymentTypeCommissionRates,
      };

      await opSvc.saveOperator(updatedOp);
      setDriverPayoutOverrides((prev) => {
        const next = { ...prev };
        delete next[driverId];
        return next;
      });
      setDriverCommissionOverrides((prev) => {
        const next = { ...prev };
        delete next[driverId];
        return next;
      });
      showSuccess(`Saved payout rule for ${updatedOp.displayName || driverId}.`, 3000);
    } finally {
      setIsSaving(false);
    }
  };

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
    const filteredSettlements = payoutSettlements.filter((s) => s.payeeType === activePayeeTab);
    const source =
      filteredSettlements.length > 0
        ? filteredSettlements
        : activePayeeTab === 'driver'
        ? driverRollups
        : payoutSettlements;
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
    driverPayoutOverrides,
    updateDriverPayoutOverride,
    handleSaveDriverPayoutSettings,
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
