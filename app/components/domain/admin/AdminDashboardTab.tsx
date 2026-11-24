import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  computeOperationalIntelligenceSnapshot,
  exportAnalyticsCsvReport,
  resolveAnalyticsDateWindow,
  type AnalyticsCsvReportType,
  type AnalyticsPeriodPreset,
} from '../../../core/services/analytics';
import { getBookingService } from '../../../core/services/booking';
import { subscribeToStandingOrders } from '../../../core/services/dispatch/standing-order.service';
import { isFirebaseConfigured } from '../../../core/services/firebase';
import {
  getOperatorService,
  type DriverRosterItem,
} from '../../../core/services/operator.service';
import { getPricingAuditService } from '../../../core/services/pricing/pricing-audit.service';
import { getPricingRulesService } from '../../../core/services/pricing/pricing-rules.service';
import { getSurchargesService } from '../../../core/services/pricing/surcharges.service';
import type {
  AppSettings,
  NamedPricingRule,
  SurchargesConfig,
} from '../../../core/types/config';
import type { PricingAuditEvent } from '../../../core/types/pricing-audit';
import type { StandingOrderSeries } from '../../../core/types/standing-order';
import type { Trip } from '../../../core/types/trip';
import {
  AnalyticsPeriodToolbar,
  CorporateAndFleetLeaderboardPanel,
  ExecutiveOverviewPanel,
  OperationalSlaAndDispatchPanel,
  SurchargeRevenueAttributionPanel,
  SystemHealthTelemetryPanel,
} from './analytics';

import type { AdminTabKey } from '../../../core/utils/admin-nav.util';

export type DashboardSubTab = 'overview' | 'telemetry' | 'analytics';
export type { AdminTabKey };

export interface AdminDashboardTabProps {
  settings: AppSettings;
  onNavigateTab: (tabKey: AdminTabKey) => void;
  initialSubTab?: DashboardSubTab;
}

function formatLocalYyyyMmDd(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function AdminDashboardTab({
  settings,
  onNavigateTab,
  initialSubTab = 'overview',
}: AdminDashboardTabProps) {
  const [activeSub, setActiveSub] = useState<DashboardSubTab>(initialSubTab);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<DriverRosterItem[]>([]);
  const [surchargesConfig, setSurchargesConfig] = useState<SurchargesConfig | null>(null);
  const [pricingRules, setPricingRules] = useState<NamedPricingRule[]>([]);
  const [pricingAuditEvents, setPricingAuditEvents] = useState<PricingAuditEvent[]>([]);
  const [standingOrders, setStandingOrders] = useState<StandingOrderSeries[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [periodPreset, setPeriodPreset] = useState<AnalyticsPeriodPreset>('30d');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  useEffect(() => {
    setActiveSub(initialSubTab);
  }, [initialSubTab]);

  const firebaseStatus = isFirebaseConfigured();

  // Subscribe to real-time driver roster
  useEffect(() => {
    const opService = getOperatorService();
    return opService.subscribeToDrivers((updatedDrivers) => {
      setDrivers(updatedDrivers);
    });
  }, []);

  // Subscribe to real-time trips
  useEffect(() => {
    setIsLoading(true);
    const service = getBookingService();

    if (service.subscribeToAllTrips) {
      return service.subscribeToAllTrips(
        (updatedTrips) => {
          setTrips(updatedTrips);
          setIsLoading(false);
        },
        (err) => {
          console.warn('[AdminDashboardTab] Subscription error:', err);
          setIsLoading(false);
        }
      );
    }

    if (service.getAllTrips) {
      service
        .getAllTrips()
        .then((data) => {
          setTrips(data);
          setIsLoading(false);
        })
        .catch(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
    return undefined;
  }, []);

  // Subscribe to live Surcharges, Pricing Rules, Pricing Audit Log & Standing Orders
  useEffect(() => {
    const unsubSurcharges = getSurchargesService().subscribeToSurcharges((cfg) => {
      setSurchargesConfig(cfg);
    });
    const unsubRules = getPricingRulesService().subscribeToRules((rules) => {
      setPricingRules(rules);
    });
    const unsubAudit = getPricingAuditService().subscribe((events) => {
      setPricingAuditEvents(events);
    });
    const unsubStanding = subscribeToStandingOrders((seriesList) => {
      setStandingOrders(seriesList);
    });

    return () => {
      unsubSurcharges();
      unsubRules();
      unsubAudit();
      unsubStanding();
    };
  }, []);

  const handleSelectPreset = useCallback(
    (nextPreset: AnalyticsPeriodPreset) => {
      if (nextPreset === 'custom' && !customStartDate && !customEndDate) {
        const now = Date.now();
        setCustomEndDate(formatLocalYyyyMmDd(now));
        setCustomStartDate(formatLocalYyyyMmDd(now - 6 * 86_400_000));
      }
      setPeriodPreset(nextPreset);
    },
    [customStartDate, customEndDate]
  );

  const activeWindow = useMemo(
    () =>
      resolveAnalyticsDateWindow({
        preset: periodPreset,
        customStartDate,
        customEndDate,
      }),
    [periodPreset, customStartDate, customEndDate]
  );

  const snapshot = useMemo(
    () =>
      computeOperationalIntelligenceSnapshot({
        allTrips: trips,
        window: activeWindow,
        drivers,
        settings,
        surchargesConfig,
        pricingRules,
        pricingAuditEvents,
      }),
    [trips, activeWindow, drivers, settings, surchargesConfig, pricingRules, pricingAuditEvents]
  );

  const handleExportCsv = useCallback(
    (reportType: AnalyticsCsvReportType) => {
      if (typeof window === 'undefined') return;
      const exported = exportAnalyticsCsvReport({
        reportType,
        snapshot,
        drivers,
      });
      const blob = new Blob([`\uFEFF${exported.csvContent}`], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exported.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    },
    [snapshot, drivers]
  );

  const nonArchivedTotalCount = useMemo(
    () => trips.filter((t) => !t.isArchived).length,
    [trips]
  );

  const activeStandingOrdersCount = useMemo(
    () => standingOrders.filter((s) => s.status === 'active').length,
    [standingOrders]
  );

  return (
    <div className="space-y-5">
      {(activeSub === 'overview' || activeSub === 'analytics') && (
        <AnalyticsPeriodToolbar
          preset={periodPreset}
          onSelectPreset={handleSelectPreset}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onChangeCustomStartDate={setCustomStartDate}
          onChangeCustomEndDate={setCustomEndDate}
          windowLabel={activeWindow.label}
          periodTripsCount={snapshot.totalTripsCount}
          totalAllTimeTripsCount={nonArchivedTotalCount}
          onExportCsv={handleExportCsv}
        />
      )}

      {activeSub === 'overview' && (
        <ExecutiveOverviewPanel
          snapshot={snapshot}
          allTrips={trips}
          drivers={drivers}
          isLoading={isLoading}
          onNavigateTab={onNavigateTab}
        />
      )}

      {activeSub === 'analytics' && (
        <div className="space-y-6 animate-in fade-in">
          <OperationalSlaAndDispatchPanel
            sla={snapshot.sla}
            autoDispatch={snapshot.autoDispatch}
            onNavigateTab={onNavigateTab}
          />
          <SurchargeRevenueAttributionPanel
            revenue={snapshot.revenue}
            onNavigateTab={onNavigateTab}
          />
          <CorporateAndFleetLeaderboardPanel
            boards={snapshot.seriesAndBoards}
            onNavigateTab={onNavigateTab}
          />
        </div>
      )}

      {activeSub === 'telemetry' && (
        <SystemHealthTelemetryPanel
          settings={settings}
          firebaseStatus={firebaseStatus}
          activeStandingOrdersCount={activeStandingOrdersCount}
          totalStandingOrdersCount={standingOrders.length}
          pricingAuditEventsCount={pricingAuditEvents.length}
          onNavigateTab={onNavigateTab}
        />
      )}
    </div>
  );
}
