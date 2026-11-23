/**
 * Phase 57 Automated Verification Suite (`scripts/test-operational-analytics.ts`)
 *
 * Verifies:
 * 1. `resolveAnalyticsDateWindow`, `filterTripsByAnalyticsWindow` & `computePercentDelta`
 *    across `'today'`, `'7d'`, `'30d'`, `'mtd'`, `'all'`, and `'custom'`.
 * 2. `computeSlaPerformanceMetrics` (10m grace on-time vs late, pickup variance, SLA risk/alert
 *    counters, `cancelledBy` breakdown, and `/track` cancellation policy fee previews).
 * 3. `computeAutoDispatchIntelligence` across all 5 dispatch channels, cascade funnel KPIs,
 *    offer response seconds, Staged holds, Standing Orders, Driver Update Ack, and `/track` edits.
 * 4. `computeRevenueAttributionMetrics` (excludes cancelled/declined fares, canonical waterfall,
 *    zero-double-counting itemized surcharges/rules, and `PricingAuditEvent` provenance correlation).
 * 5. `computeTimeSeriesAndLeaderboards` (distinct calendar date buckets avoiding `Mon..Sun`
 *    multi-week collisions, B2B corporate & driver leaderboards, and real peak windows).
 * 6. `escapeCsvCell` & `exportAnalyticsCsvReport` across all 4 CSV report types (RFC-4180 quoting
 *    + spreadsheet formula-injection neutralization while preserving `-15.50`).
 * 7. Monolith line ceilings, untouched `firestore.rules` & `vercel.json`, and strict UI hygiene.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeAutoDispatchIntelligence,
  computeOperationalIntelligenceSnapshot,
  computePercentDelta,
  computeRevenueAttributionMetrics,
  computeSlaPerformanceMetrics,
  computeTimeSeriesAndLeaderboards,
  escapeCsvCell,
  exportAnalyticsCsvReport,
  filterTripsByAnalyticsWindow,
  resolveAnalyticsDateWindow,
} from '../app/core/services/analytics';
import type { DriverRosterItem } from '../app/core/services/operator.service';
import type { NamedPricingRule, SurchargesConfig } from '../app/core/types/config';
import type { PricingAuditEvent } from '../app/core/types/pricing-audit';
import type { Trip } from '../app/core/types/trip';

// Fixed local anchor: Monday, Nov 23, 2026 14:30:00 local time
const ANCHOR_DATE = new Date(2026, 10, 23, 14, 30, 0, 0);
const NOW_MS = ANCHOR_DATE.getTime();

function localIso(year: number, month1Based: number, day: number, hour = 10, min = 0, sec = 0): string {
  return new Date(year, month1Based - 1, day, hour, min, sec, 0).toISOString();
}

function makeTrip(overrides: Partial<Trip> & { id: string }): Trip {
  const defaultCreated = localIso(2026, 11, 20, 9, 0, 0);
  return {
    id: overrides.id,
    status: overrides.status ?? 'completed',
    offeredToIds: overrides.offeredToIds ?? [],
    rejectedByIds: overrides.rejectedByIds ?? [],
    assignedDriverId: overrides.assignedDriverId !== undefined ? overrides.assignedDriverId : 'drv-1',
    pickupLocation: overrides.pickupLocation ?? {
      address: '16401 Swingley Ridge Rd, Chesterfield, MO 63017',
    },
    dropoffLocation: overrides.dropoffLocation ?? {
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
    },
    bookingType: overrides.bookingType ?? 'scheduled',
    scheduledPickupTime:
      'scheduledPickupTime' in overrides
        ? overrides.scheduledPickupTime
        : localIso(2026, 11, 22, 6, 0, 0),
    actualPickupTime: overrides.actualPickupTime,
    completedAt: overrides.completedAt,
    cancelledAt: overrides.cancelledAt,
    cancelledBy: overrides.cancelledBy,
    cancellationReason: overrides.cancellationReason,
    plannedDriverId: overrides.plannedDriverId,
    plannedDriverLabel: overrides.plannedDriverLabel,
    plannedAt: overrides.plannedAt,
    plannedBy: overrides.plannedBy,
    passenger: overrides.passenger ?? {
      firstName: 'Jordan',
      lastName: 'Miller',
      email: 'jordan@example.com',
      phone: '+13145550111',
      passengerCount: 2,
      luggageCount: 2,
    },
    vehicleTier: overrides.vehicleTier ?? 'standard',
    pricing: overrides.pricing ?? {
      baseFare: 45,
      distanceMiles: 18,
      durationMinutes: 25,
      distanceRate: 2.5,
      timeRate: 0,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 49,
      totalFare: 49,
      currency: 'USD',
    },
    payment: overrides.payment ?? {
      method: 'card',
      status: 'captured',
      amount: 49,
      tipAmount: 10,
    },
    offerCascade: overrides.offerCascade,
    slaStatus: overrides.slaStatus,
    auditLog: overrides.auditLog,
    statusHistory: overrides.statusHistory ?? [],
    createdAt: overrides.createdAt ?? defaultCreated,
    updatedAt: overrides.updatedAt ?? defaultCreated,
    metadata: overrides.metadata,
    corporateAccountId: overrides.corporateAccountId,
    assignedVehicle: overrides.assignedVehicle,
    flightNotes: overrides.flightNotes,
    isArchived: overrides.isArchived,
  };
}

function runPeriodWindowAssertions(): void {
  console.log('1️⃣  Testing Period Window & Prior-Period Delta Engine...');

  const todayWin = resolveAnalyticsDateWindow({ preset: 'today', nowMs: NOW_MS });
  assert.equal(todayWin.bucketGranularity, 'hour');
  assert.ok(todayWin.startMs !== null && todayWin.endMs !== null);
  assert.ok(todayWin.prevStartMs !== null && todayWin.prevEndMs !== null);

  const sevenDayWin = resolveAnalyticsDateWindow({ preset: '7d', nowMs: NOW_MS });
  assert.equal(sevenDayWin.bucketGranularity, 'day');

  const thirtyDayWin = resolveAnalyticsDateWindow({ preset: '30d', nowMs: NOW_MS });
  assert.equal(thirtyDayWin.bucketGranularity, 'day');

  const mtdWin = resolveAnalyticsDateWindow({ preset: 'mtd', nowMs: NOW_MS });
  assert.equal(mtdWin.bucketGranularity, 'day');
  assert.equal(new Date(mtdWin.startMs!).getDate(), 1);

  const allWin = resolveAnalyticsDateWindow({ preset: 'all', nowMs: NOW_MS });
  assert.equal(allWin.startMs, null);
  assert.equal(allWin.endMs, null);
  assert.equal(allWin.prevStartMs, null);
  assert.equal(allWin.bucketGranularity, 'month');

  // Reversed custom dates auto-swap cleanly
  const customWin = resolveAnalyticsDateWindow({
    preset: 'custom',
    customStartDate: '2026-11-20',
    customEndDate: '2026-11-10',
    nowMs: NOW_MS,
  });
  assert.equal(customWin.bucketGranularity, 'day');
  assert.ok(customWin.startMs! < customWin.endMs!);

  const sampleTrips: Trip[] = [
    makeTrip({ id: 't-today', scheduledPickupTime: localIso(2026, 11, 23, 8, 15) }),
    makeTrip({ id: 't-5d', scheduledPickupTime: localIso(2026, 11, 19, 10, 0) }),
    makeTrip({ id: 't-15d', scheduledPickupTime: localIso(2026, 11, 10, 14, 0) }),
    makeTrip({ id: 't-45d', scheduledPickupTime: localIso(2026, 10, 5, 9, 0) }),
    makeTrip({
      id: 't-archived',
      scheduledPickupTime: localIso(2026, 11, 23, 9, 0),
      isArchived: true,
    }),
  ];

  assert.equal(filterTripsByAnalyticsWindow(sampleTrips, todayWin).length, 1);
  assert.equal(filterTripsByAnalyticsWindow(sampleTrips, sevenDayWin).length, 2);
  assert.equal(filterTripsByAnalyticsWindow(sampleTrips, thirtyDayWin).length, 3);
  assert.equal(filterTripsByAnalyticsWindow(sampleTrips, mtdWin).length, 3);
  assert.equal(filterTripsByAnalyticsWindow(sampleTrips, allWin).length, 4);
  assert.equal(filterTripsByAnalyticsWindow(sampleTrips, customWin).length, 2);

  assert.deepEqual(computePercentDelta(150, 100), { deltaPercent: 50, direction: 'up' });
  assert.deepEqual(computePercentDelta(75, 100), { deltaPercent: -25, direction: 'down' });
  assert.deepEqual(computePercentDelta(100, 100), { deltaPercent: 0, direction: 'flat' });
  assert.deepEqual(computePercentDelta(40, 0), { deltaPercent: null, direction: 'up' });
}

function runSlaAndCancellationAssertions(): void {
  console.log('2️⃣  Testing Operational SLA & Cancellation Policy Metrics...');

  // Zero scheduled due sample -> graceful `null` onTimeRatePercent
  const emptySla = computeSlaPerformanceMetrics([], { nowMs: NOW_MS });
  assert.equal(emptySla.evaluatedScheduledCount, 0);
  assert.equal(emptySla.onTimeRatePercent, null);

  const slaTrips: Trip[] = [
    // 1. Early arrival (-5m) via actualPickupTime -> On-Time
    makeTrip({
      id: 'sla-early',
      scheduledPickupTime: localIso(2026, 11, 22, 6, 0),
      actualPickupTime: localIso(2026, 11, 22, 5, 55),
    }),
    // 2. +8m arrival via statusHistory ('arrived') within 10m grace -> On-Time
    makeTrip({
      id: 'sla-grace',
      scheduledPickupTime: localIso(2026, 11, 22, 9, 0),
      actualPickupTime: undefined,
      statusHistory: [
        {
          from: 'en_route',
          to: 'arrived',
          timestamp: localIso(2026, 11, 22, 9, 8),
        },
      ],
    }),
    // 3. +22m late via completedAt minus 20m estimated duration -> Late
    makeTrip({
      id: 'sla-late',
      scheduledPickupTime: localIso(2026, 11, 22, 12, 0),
      actualPickupTime: undefined,
      completedAt: localIso(2026, 11, 22, 12, 42),
      pricing: {
        baseFare: 40,
        distanceMiles: 14,
        durationMinutes: 20,
        distanceRate: 2.5,
        timeRate: 0,
        vehicleMultiplier: 1,
        surgeMultiplier: 1,
        discountAmount: 0,
        subtotal: 40,
        totalFare: 40,
        currency: 'USD',
      },
      slaStatus: {
        level: 'warning',
        warningNotifiedAt: localIso(2026, 11, 22, 11, 15),
      },
    }),
    // 4. Open unassigned scheduled ride inside critical SLA window -> At-Risk, not yet evaluated for pickup
    makeTrip({
      id: 'sla-open-risk',
      status: 'CONFIRMED',
      assignedDriverId: null,
      scheduledPickupTime: localIso(2026, 11, 23, 14, 50), // +20m from NOW_MS
      slaStatus: {
        level: 'critical',
        warningNotifiedAt: localIso(2026, 11, 23, 13, 50),
        criticalNotifiedAt: localIso(2026, 11, 23, 14, 20),
      },
    }),
    // 5. Overdue unassigned scheduled ride
    makeTrip({
      id: 'sla-overdue',
      status: 'pending',
      assignedDriverId: null,
      scheduledPickupTime: localIso(2026, 11, 23, 14, 10),
      slaStatus: { level: 'overdue' },
    }),
    // 6. Passenger /track self-service cancellation with late fee preview ($14.50)
    makeTrip({
      id: 'cxl-passenger-track',
      status: 'cancelled',
      assignedDriverId: null,
      cancelledBy: 'passenger',
      metadata: {
        guestCancellationPolicy: {
          policyTier: 'late_window_fee',
          isFreeCancellation: false,
          cancellationFeeAmount: 14.5,
        },
      },
    }),
    // 7. Passenger /track no-show fee preview ($50.00)
    makeTrip({
      id: 'cxl-passenger-noshow',
      status: 'cancelled',
      assignedDriverId: null,
      cancelledBy: 'passenger',
      metadata: {
        guestCancellationPolicy: {
          policyTier: 'driver_arrived_no_show_fee',
          isFreeCancellation: false,
          cancellationFeeAmount: 50,
        },
      },
    }),
    // 8. Dispatcher cancellation
    makeTrip({
      id: 'cxl-dispatch',
      status: 'cancelled',
      assignedDriverId: null,
      cancelledBy: 'admin',
    }),
  ];

  const metrics = computeSlaPerformanceMetrics(slaTrips, {
    onTimeGraceMinutes: 10,
    nowMs: NOW_MS,
  });

  assert.equal(metrics.evaluatedScheduledCount, 3);
  assert.equal(metrics.onTimeCount, 2);
  assert.equal(metrics.lateCount, 1);
  assert.equal(metrics.onTimeRatePercent, 66.7);
  // (-5 + 8 + 22) / 3 = 25 / 3 = 8.3m
  assert.equal(metrics.avgPickupVarianceMinutes, 8.3);

  assert.equal(metrics.slaWarningCount, 1);
  assert.equal(metrics.slaCriticalCount, 1);
  assert.equal(metrics.slaOverdueCount, 1);
  assert.equal(metrics.warningAlertsSentCount, 2);
  assert.equal(metrics.criticalAlertsSentCount, 1);
  assert.equal(metrics.openUnassignedScheduledAtRiskCount, 2);

  assert.equal(metrics.totalCancelledOrDeclined, 3);
  assert.equal(metrics.cancellationRatePercent, 37.5);
  assert.equal(metrics.cancelledByBreakdown.passenger, 2);
  assert.equal(metrics.cancelledByBreakdown.dispatcher, 1);
  assert.equal(metrics.guestTrackCancellationsCount, 2);
  assert.equal(metrics.previewedCancellationFeesCount, 2);
  assert.equal(metrics.previewedCancellationFeesTotal, 64.5);
}

function runAutoDispatchAndWave4Assertions(): void {
  console.log('3️⃣  Testing Auto-Dispatch Channels, Cascade Funnel & Wave 4 Counters...');

  const trips: Trip[] = [
    // Channel 1: sequential_cascade (accepted on 1st attempt in 12s) + acknowledged driver update (15s latency)
    makeTrip({
      id: 'ad-seq-1',
      status: 'completed',
      assignedDriverId: 'drv-1',
      offerCascade: {
        state: 'accepted',
        mode: 'sequential_cascade',
        activeOfferedDriverId: 'drv-1',
        offerStartedAt: localIso(2026, 11, 22, 8, 0, 0),
        offerExpiresAt: localIso(2026, 11, 22, 8, 0, 45),
        timeoutSeconds: 45,
        cascadeAttempt: 1,
        maxAttempts: 3,
        attemptedDriverIds: ['drv-1'],
        strategy: 'nearest_in_zone',
      },
      auditLog: [
        { action: 'DISPATCH_OFFERED', timestamp: localIso(2026, 11, 22, 8, 0, 0) },
        { action: 'DRIVER_ACCEPTED', timestamp: localIso(2026, 11, 22, 8, 0, 12) },
        {
          action: 'TRIP_MODIFIED',
          actorRole: 'passenger',
          timestamp: localIso(2026, 11, 22, 8, 5, 0),
        },
      ],
      metadata: {
        standingOrderId: 'so_corp_daily_1',
        pendingDriverUpdateAck: {
          revisionId: 'upd_1',
          updatedAt: localIso(2026, 11, 22, 8, 5, 0),
          requiresAck: false,
          acknowledgedAt: localIso(2026, 11, 22, 8, 5, 15),
        },
      },
    }),
    // Channel 2: broadcast_pool (accepted on 2nd attempt in 20s) + pending driver update ack + approved guest req
    makeTrip({
      id: 'ad-pool-1',
      status: 'assigned',
      assignedDriverId: 'drv-2',
      offerCascade: {
        state: 'accepted',
        mode: 'broadcast_pool',
        activeOfferedDriverId: 'drv-2',
        offerStartedAt: localIso(2026, 11, 22, 9, 0, 0),
        offerExpiresAt: localIso(2026, 11, 22, 9, 0, 45),
        timeoutSeconds: 45,
        cascadeAttempt: 2,
        maxAttempts: 3,
        attemptedDriverIds: ['drv-1', 'drv-2'],
        strategy: 'nearest_in_zone',
      },
      auditLog: [
        { action: 'DISPATCH_OFFERED', timestamp: localIso(2026, 11, 22, 9, 0, 0) },
        { action: 'DRIVER_ACCEPTED', timestamp: localIso(2026, 11, 22, 9, 0, 20) },
      ],
      metadata: {
        pendingDriverUpdateAck: {
          revisionId: 'upd_2',
          updatedAt: localIso(2026, 11, 22, 9, 10, 0),
          requiresAck: true,
          acknowledgedAt: null,
        },
        pendingGuestChangeRequest: {
          requestId: 'gcr_1',
          status: 'approved',
        },
      },
    }),
    // Channel 3: direct_auto_assign (1st attempt) + pending guest change request
    makeTrip({
      id: 'ad-direct-1',
      status: 'assigned',
      assignedDriverId: 'drv-1',
      offerCascade: {
        state: 'accepted',
        mode: 'direct_auto_assign',
        activeOfferedDriverId: 'drv-1',
        offerStartedAt: localIso(2026, 11, 22, 10, 0, 0),
        offerExpiresAt: localIso(2026, 11, 22, 10, 0, 0),
        timeoutSeconds: 45,
        cascadeAttempt: 1,
        maxAttempts: 1,
        attemptedDriverIds: ['drv-1'],
        strategy: 'highest_driver_score',
      },
      metadata: {
        pendingGuestChangeRequest: {
          requestId: 'gcr_2',
          status: 'pending',
        },
      },
    }),
    // Exhausted sequential cascade (unassigned after exhaustion) + declined guest change request
    makeTrip({
      id: 'ad-exhausted-1',
      status: 'CONFIRMED',
      assignedDriverId: null,
      offerCascade: {
        state: 'exhausted',
        activeOfferedDriverId: null,
        offerStartedAt: localIso(2026, 11, 22, 11, 0, 0),
        offerExpiresAt: localIso(2026, 11, 22, 11, 2, 15),
        timeoutSeconds: 45,
        cascadeAttempt: 3,
        maxAttempts: 3,
        attemptedDriverIds: ['drv-1', 'drv-2', 'drv-3'],
        strategy: 'nearest_in_zone',
      },
      metadata: {
        pendingGuestChangeRequest: {
          requestId: 'gcr_3',
          status: 'declined',
        },
      },
    }),
    // Channel 4: staged_release (had DRIVER_STAGED in auditLog and then assigned)
    makeTrip({
      id: 'ad-staged-released',
      status: 'completed',
      assignedDriverId: 'drv-2',
      auditLog: [
        { action: 'DRIVER_STAGED', timestamp: localIso(2026, 11, 21, 18, 0, 0) },
        { action: 'DRIVER_ASSIGNED', timestamp: localIso(2026, 11, 22, 5, 15, 0) },
      ],
      metadata: {
        standingOrderId: 'so_corp_daily_1',
      },
    }),
    // Channel 5: manual_assign (assigned directly with no cascade or staging)
    makeTrip({
      id: 'ad-manual-1',
      status: 'completed',
      assignedDriverId: 'drv-3',
    }),
    // Open currently staged shift hold (unassigned, plannedDriverId set -> NOT counted as dispatched yet, counted in currentlyStagedCount)
    makeTrip({
      id: 'ad-open-staged-hold',
      status: 'CONFIRMED',
      assignedDriverId: null,
      plannedDriverId: 'drv-1',
      plannedDriverLabel: '#401, Marcus',
      plannedAt: localIso(2026, 11, 23, 12, 0, 0),
      plannedBy: 'dispatch@chesterfieldtaxi.com',
    }),
  ];

  const intel = computeAutoDispatchIntelligence(trips);

  assert.equal(intel.channelCounts.sequential_cascade, 2); // ad-seq-1 + ad-exhausted-1
  assert.equal(intel.channelCounts.broadcast_pool, 1);
  assert.equal(intel.channelCounts.direct_auto_assign, 1);
  assert.equal(intel.channelCounts.staged_release, 1);
  assert.equal(intel.channelCounts.manual_assign, 1);
  assert.equal(intel.totalDispatchedOrOffered, 6);

  assert.equal(intel.totalCascadesTriggered, 4);
  assert.equal(intel.acceptedCascades, 3);
  assert.equal(intel.exhaustedCascades, 1);
  assert.equal(intel.firstAttemptAcceptCount, 2);
  assert.equal(intel.firstAttemptAcceptRatePercent, 50);
  assert.equal(intel.overallCascadeAcceptRatePercent, 75);
  assert.equal(intel.exhaustionRatePercent, 25);
  // (1 + 2 + 1) / 3 = 1.33
  assert.equal(intel.avgAttemptsPerAcceptedCascade, 1.33);
  // (12s + 20s) / 2 = 16s
  assert.equal(intel.avgOfferResponseSeconds, 16);

  assert.equal(intel.currentlyStagedCount, 1);
  assert.equal(intel.standingOrderTripsCount, 2);

  assert.equal(intel.driverUpdateAckStats.totalUpdatesSent, 2);
  assert.equal(intel.driverUpdateAckStats.acknowledgedCount, 1);
  assert.equal(intel.driverUpdateAckStats.pendingAckCount, 1);
  assert.equal(intel.driverUpdateAckStats.ackRatePercent, 50);
  assert.equal(intel.driverUpdateAckStats.avgAckLatencySeconds, 15);

  assert.equal(intel.guestSelfServiceStats.pendingChangeRequests, 1);
  assert.equal(intel.guestSelfServiceStats.approvedChangeRequests, 1);
  assert.equal(intel.guestSelfServiceStats.declinedChangeRequests, 1);
  assert.equal(intel.guestSelfServiceStats.guestModifiedTripsCount, 2);
}

function runRevenueAndAuditCorrelationAssertions(): void {
  console.log('4️⃣  Testing Revenue Waterfall, Surcharge Attribution & PricingAuditLog Correlation...');

  const surchargesConfig: SurchargesConfig = {
    catalogVersion: 2,
    items: [
      {
        id: 'surcharge-airport-access',
        name: 'Airport Commercial Access Fee',
        enabled: true,
        defaultPolicy: 'rule_only',
        mode: 'flat',
        amount: 4,
      },
      {
        id: 'surcharge-peak-surge',
        name: 'Peak Demand Surge',
        enabled: false,
        defaultPolicy: 'universal',
        mode: 'multiplier',
        amount: 1.25,
      },
    ],
    airportGateFee: 4,
    peakSurgeMultiplier: 1.25,
    outOfAreaRemoteFee: 15,
    outOfAreaThresholdMiles: 15,
    cancellationFeeWithinOneHour: 28,
    noShowFee: 28,
  };

  const pricingRules: NamedPricingRule[] = [
    {
      id: 'rule-suv-upgrade',
      name: 'SUV / Minivan Vehicle Upgrade',
      priority: 85,
      isActive: true,
      allowDriverSelection: false,
      triggers: {},
      modifier: { type: 'surcharge_flat', value: 10 },
    },
  ];

  const pricingAuditEvents: PricingAuditEvent[] = [
    {
      id: 'paud-1',
      timestamp: localIso(2026, 11, 23, 7, 30),
      timestampMs: Date.parse(localIso(2026, 11, 23, 7, 30)),
      pillar: 'surcharges',
      action: 'surcharge_enabled',
      targetId: 'surcharge-airport-access',
      targetName: 'Airport Commercial Access Fee',
      summary: 'Enabled Airport Commercial Access Fee ($4.00)',
      diffs: [{ field: 'enabled', label: 'Enabled', before: false, after: true }],
      operatorId: 'op-1',
      operatorName: 'Sarah Admin',
      operatorEmail: 'sarah@chesterfieldtaxi.com',
    },
    {
      id: 'paud-2',
      timestamp: localIso(2026, 11, 23, 11, 0),
      timestampMs: Date.parse(localIso(2026, 11, 23, 11, 0)),
      pillar: 'surcharges',
      action: 'surcharge_disabled',
      targetId: 'surcharge-peak-surge',
      targetName: 'Peak Demand Surge',
      summary: 'Disabled Peak Demand Surge after 2h',
      diffs: [{ field: 'enabled', label: 'Enabled', before: true, after: false }],
      operatorId: 'op-1',
      operatorName: 'Sarah Admin',
      operatorEmail: 'sarah@chesterfieldtaxi.com',
    },
  ];

  const trips: Trip[] = [
    // 1. Canonical `pricing.breakdown` completed trip ($65.00 + $12 tip, paid via 1-Tap Pay Link)
    // Also carries `airportSurcharge: 4` & `driverExtras` mirrored in breakdown -> MUST NOT double count!
    makeTrip({
      id: 'rev-1',
      status: 'completed',
      pickupLocation: { address: '17000 Baxter Rd, Chesterfield, MO 63005' },
      dropoffLocation: { address: 'STL Lambert International Airport, St. Louis, MO 63145' },
      pricing: {
        baseFare: 50,
        distanceMiles: 20,
        durationMinutes: 26,
        distanceRate: 2.5,
        timeRate: 0,
        vehicleMultiplier: 1,
        surgeMultiplier: 1,
        discountAmount: 5,
        airportSurcharge: 4,
        subtotal: 65,
        totalFare: 65,
        currency: 'USD',
        matchedCorridorName: 'Chesterfield Valley ↔ STL Lambert',
        driverExtras: [{ id: 'stop-wait-1', name: 'Stop #1 Wait', amount: 6, category: 'custom' }],
        breakdown: [
          { id: 'b-base', category: 'base', label: 'Flat Corridor Fare', amount: 50, sourceType: 'corridor' },
          {
            id: 'b-air',
            category: 'surcharge',
            label: 'Airport Commercial Access Fee',
            amount: 4,
            sourceType: 'surcharge',
            sourceId: 'surcharge-airport-access',
          },
          {
            id: 'b-suv',
            category: 'surcharge',
            label: 'SUV / Minivan Vehicle Upgrade',
            amount: 10,
            sourceType: 'rule',
            sourceId: 'rule-suv-upgrade',
          },
          {
            id: 'stop-wait-1',
            category: 'extra',
            label: 'Stop #1 Overtime Wait',
            amount: 6,
            sourceType: 'extra',
          },
          {
            id: 'b-disc',
            category: 'discount',
            label: 'VIP Courtesy Discount',
            amount: -5,
            sourceType: 'discount',
          },
        ],
      },
      payment: {
        method: 'card',
        status: 'captured',
        amount: 77,
        tipAmount: 12,
        payLinkStatus: 'paid',
      },
    }),
    // 2. Legacy scheduled pipeline trip without `breakdown` ($80.00 corporate account to Spirit SUS)
    makeTrip({
      id: 'rev-2',
      status: 'CONFIRMED',
      assignedDriverId: null,
      corporateAccountId: 'corp-bayer',
      pickupLocation: { address: '800 N Lindbergh Blvd, Creve Coeur, MO 63167' },
      dropoffLocation: { address: '18270 Edison Ave, Spirit of St. Louis Airport, Chesterfield, MO 63005' },
      pricing: {
        baseFare: 62,
        distanceMiles: 16,
        durationMinutes: 22,
        distanceRate: 2.5,
        timeRate: 0,
        vehicleMultiplier: 1,
        surgeMultiplier: 1,
        discountAmount: 0,
        carSeatFee: 10,
        itemizedSurcharges: [{ name: 'Peak Demand Surge', amount: 8 }],
        subtotal: 80,
        totalFare: 80,
        currency: 'USD',
      },
      payment: {
        method: 'corporate',
        status: 'pending_invoice',
        amount: 80,
        tipAmount: 0,
      },
    }),
    // 3. Cancelled trip ($120 fare) -> MUST BE EXCLUDED from fare revenue!
    makeTrip({
      id: 'rev-cancelled',
      status: 'cancelled',
      pricing: {
        baseFare: 120,
        distanceMiles: 40,
        durationMinutes: 50,
        distanceRate: 3,
        timeRate: 0,
        vehicleMultiplier: 1,
        surgeMultiplier: 1,
        discountAmount: 0,
        subtotal: 120,
        totalFare: 120,
        currency: 'USD',
      },
      payment: { method: 'card', status: 'refunded', amount: 120, tipAmount: 25 },
    }),
    // 4. Declined trip ($90 fare) -> MUST BE EXCLUDED from fare revenue!
    makeTrip({
      id: 'rev-declined',
      status: 'DECLINED',
      pricing: {
        baseFare: 90,
        distanceMiles: 30,
        durationMinutes: 40,
        distanceRate: 3,
        timeRate: 0,
        vehicleMultiplier: 1,
        surgeMultiplier: 1,
        discountAmount: 0,
        subtotal: 90,
        totalFare: 90,
        currency: 'USD',
      },
      payment: { method: 'cash', status: 'pending', amount: 90 },
    }),
  ];

  const rev = computeRevenueAttributionMetrics({
    trips,
    surchargesConfig,
    pricingRules,
    pricingAuditEvents,
  });

  assert.equal(rev.completedTripsCount, 1);
  assert.equal(rev.pipelineTripsCount, 1);
  assert.equal(rev.billableTripsCount, 2);
  assert.equal(rev.completedRevenue, 65);
  assert.equal(rev.scheduledPipelineRevenue, 80);
  assert.equal(rev.grossBookedRevenue, 145);
  assert.equal(rev.avgFare, 72.5);

  // Waterfall exact reconciliation (zero double-counting):
  // Base: 50 + 62 = 112 | Surcharges: (4 + 10) + 8 = 22 | Extras: 6 + 10 = 16 | Discounts: 5
  // 112 + 22 + 16 - 5 = 145!
  assert.equal(rev.baseAndDistanceRevenue, 112);
  assert.equal(rev.surchargesRevenue, 22);
  assert.equal(rev.extrasAndWaitRevenue, 16);
  assert.equal(rev.discountsTotal, 5);
  assert.equal(rev.tipsTotal, 12);

  assert.equal(rev.paymentMethodMix.card.count, 1);
  assert.equal(rev.paymentMethodMix.corporate.count, 1);
  assert.equal(rev.paymentMethodMix.settledPayLinks.count, 1);
  assert.equal(rev.paymentMethodMix.settledPayLinks.revenue, 77);

  // Check itemized attribution & audit correlation
  const airportAttr = rev.surchargeAttributionRows.find(
    (r) => r.id === 'surcharge-airport-access'
  );
  assert.ok(airportAttr, 'Expected Airport Commercial Access Fee row');
  assert.equal(airportAttr.tripCount, 1);
  assert.equal(airportAttr.attributedRevenue, 4);
  assert.equal(airportAttr.currentState, 'enabled');
  assert.equal(airportAttr.lastAuditAction, 'surcharge_enabled');
  assert.equal(airportAttr.lastActor, 'Sarah Admin');

  const peakAttr = rev.surchargeAttributionRows.find((r) => r.id === 'surcharge-peak-surge');
  assert.ok(peakAttr, 'Expected Peak Demand Surge row');
  assert.equal(peakAttr.tripCount, 1);
  assert.equal(peakAttr.attributedRevenue, 8);
  assert.equal(peakAttr.currentState, 'disabled');
  assert.equal(peakAttr.lastAuditAction, 'surcharge_disabled');

  const suvRuleAttr = rev.surchargeAttributionRows.find((r) => r.id === 'rule-suv-upgrade');
  assert.ok(suvRuleAttr, 'Expected SUV Upgrade rule row');
  assert.equal(suvRuleAttr.itemType, 'rule');
  assert.equal(suvRuleAttr.attributedRevenue, 10);
  assert.equal(suvRuleAttr.currentState, 'enabled');

  assert.equal(rev.corridorAttributionRows.length, 2);
  assert.ok(rev.corridorAttributionRows.some((c) => c.name === 'Spirit of St. Louis (SUS)'));
}

function runTimeSeriesAndLeaderboardsAssertions(): void {
  console.log('5️⃣  Testing Chronological Time-Series & Corporate / Driver Leaderboards...');

  const thirtyDayWin = resolveAnalyticsDateWindow({ preset: '30d', nowMs: NOW_MS });

  const drivers: DriverRosterItem[] = [
    {
      id: 'drv-1',
      name: 'Marcus Vance',
      cabNumber: '401',
      status: 'available',
      vehicle: 'Toyota Sienna',
      tier: 'xl',
      phone: '+13145550401',
      zone: 'Chesterfield',
    },
    {
      id: 'drv-2',
      name: 'Elena Rostova',
      cabNumber: '208',
      status: 'on_trip',
      vehicle: 'Camry Hybrid',
      tier: 'standard',
      phone: '+13145550208',
      zone: 'Clayton',
    },
  ];

  // Two different Mondays: Nov 9, 2026 and Nov 16, 2026 MUST NOT collide into a single 'Mon' bucket!
  const trips: Trip[] = [
    makeTrip({
      id: 'mon-week-1',
      status: 'completed',
      assignedDriverId: 'drv-1',
      scheduledPickupTime: localIso(2026, 11, 9, 5, 30), // Early Airport (04:00-07:59)
      actualPickupTime: localIso(2026, 11, 9, 5, 28),
      corporateAccountId: 'corp-bayer',
      metadata: { corporateOrgName: 'Bayer Crop Science' },
      pricing: {
        baseFare: 60,
        distanceMiles: 20,
        durationMinutes: 25,
        distanceRate: 2.5,
        timeRate: 0,
        vehicleMultiplier: 1,
        surgeMultiplier: 1,
        discountAmount: 0,
        subtotal: 60,
        totalFare: 60,
        currency: 'USD',
      },
      payment: { method: 'corporate', status: 'pending_invoice', amount: 60, tipAmount: 12 },
    }),
    makeTrip({
      id: 'mon-week-2',
      status: 'completed',
      assignedDriverId: 'drv-2',
      rejectedByIds: ['drv-1'],
      scheduledPickupTime: localIso(2026, 11, 16, 17, 15), // Evening Rush (16:00-19:59)
      actualPickupTime: localIso(2026, 11, 16, 17, 35), // +20m late
      pickupLocation: { address: '8000 Forsyth Blvd, Clayton, MO 63105' },
      pricing: {
        baseFare: 45,
        distanceMiles: 12,
        durationMinutes: 20,
        distanceRate: 2.5,
        timeRate: 0,
        vehicleMultiplier: 1,
        surgeMultiplier: 1,
        discountAmount: 0,
        subtotal: 45,
        totalFare: 45,
        currency: 'USD',
      },
      payment: { method: 'card', status: 'captured', amount: 45, tipAmount: 8 },
    }),
  ];

  const boards = computeTimeSeriesAndLeaderboards({
    trips,
    window: thirtyDayWin,
    drivers,
    nowMs: NOW_MS,
  });

  assert.equal(boards.timeSeries.length, 30);
  const nov9Bucket = boards.timeSeries.find((b) => b.key === '2026-11-09');
  const nov16Bucket = boards.timeSeries.find((b) => b.key === '2026-11-16');
  assert.ok(nov9Bucket && nov16Bucket, 'Expected distinct YYYY-MM-DD buckets for both Mondays');
  assert.equal(nov9Bucket.revenue, 60);
  assert.equal(nov16Bucket.revenue, 45);

  const earlyBlock = boards.hourlyDemand.find((h) => h.key === 'early_airport');
  const eveningBlock = boards.hourlyDemand.find((h) => h.key === 'evening_rush');
  assert.equal(earlyBlock?.tripCount, 1);
  assert.equal(eveningBlock?.tripCount, 1);

  assert.equal(boards.corporateLeaderboard.length, 1);
  assert.equal(boards.corporateLeaderboard[0].accountName, 'Bayer Crop Science');
  assert.equal(boards.corporateLeaderboard[0].grossRevenue, 60);
  assert.equal(boards.corporateLeaderboard[0].pendingInvoiceCount, 1);

  assert.equal(boards.driverLeaderboard.length, 2);
  assert.equal(boards.driverLeaderboard[0].driverId, 'drv-1');
  assert.equal(boards.driverLeaderboard[0].grossFare, 60);
  assert.equal(boards.driverLeaderboard[0].tipsEarned, 12);
  assert.equal(boards.driverLeaderboard[0].declinedOffersCount, 1);
  assert.equal(boards.driverLeaderboard[0].onTimeRatePercent, 100);
  assert.equal(boards.driverLeaderboard[1].driverId, 'drv-2');
  assert.equal(boards.driverLeaderboard[1].onTimeRatePercent, 0);

  assert.ok(boards.zoneBreakdown.some((z) => z.zoneLabel === 'Chesterfield'));
  assert.ok(boards.zoneBreakdown.some((z) => z.zoneLabel === 'Clayton'));
}

function runCsvExportAndSecurityAssertions(): void {
  console.log('6️⃣  Testing RFC-4180 Multi-Report CSV Exporter & Formula Neutralization...');

  // Formula-injection neutralization
  assert.equal(escapeCsvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(escapeCsvCell('+cmd'), "'+cmd");
  assert.equal(escapeCsvCell('@evil'), "'@evil");
  assert.equal(escapeCsvCell('-cmd'), "'-cmd");

  // Preserve numeric & plain signed negative numbers
  assert.equal(escapeCsvCell('-15.50'), '-15.50');
  assert.equal(escapeCsvCell(-15.5), '-15.5');

  // RFC-4180 quoting (`"`, `,`, `\n`) + combined formula neutralization
  assert.equal(escapeCsvCell('St. Louis, MO'), '"St. Louis, MO"');
  assert.equal(escapeCsvCell('Cab "VIP" #401'), '"Cab ""VIP"" #401"');
  assert.equal(escapeCsvCell('Line 1\nLine 2'), '"Line 1\nLine 2"');
  assert.equal(escapeCsvCell('=HYPERLINK("http://x","a")'), '"\'=HYPERLINK(""http://x"",""a"")"');

  const win = resolveAnalyticsDateWindow({ preset: '7d', nowMs: NOW_MS });
  const trips: Trip[] = [
    makeTrip({
      id: 'csv-1',
      scheduledPickupTime: localIso(2026, 11, 22, 9, 0),
      actualPickupTime: localIso(2026, 11, 22, 9, 4),
      passenger: {
        firstName: '=EvilFormula',
        lastName: 'Rider, Jr.',
        email: 'rider@example.com',
        phone: '+13145550199',
        passengerCount: 1,
        luggageCount: 1,
      },
    }),
  ];

  const snapshot = computeOperationalIntelligenceSnapshot({
    allTrips: trips,
    window: win,
    nowMs: NOW_MS,
  });

  const reportTypes = [
    'executive_summary',
    'trips_sla_dispatch',
    'surcharge_tariff_attribution',
    'driver_corporate_leaderboard',
  ] as const;

  for (const reportType of reportTypes) {
    const exported = exportAnalyticsCsvReport({
      reportType,
      snapshot,
      nowMs: NOW_MS,
    });
    assert.ok(exported.filename.endsWith('.csv'), `Expected .csv filename for ${reportType}`);
    assert.ok(exported.rowCount > 0, `Expected >0 rows for ${reportType}`);
    const lines = exported.csvContent.split('\r\n');
    assert.equal(lines.length, exported.rowCount + 1);
  }

  const tripCsv = exportAnalyticsCsvReport({
    reportType: 'trips_sla_dispatch',
    snapshot,
    nowMs: NOW_MS,
  });
  assert.ok(
    tripCsv.csvContent.includes('"\'=EvilFormula Rider, Jr."'),
    'Expected passenger formula injection + comma to be neutralized & RFC-4180 quoted'
  );
}

function runStaticGuardrailAssertions(): void {
  console.log('7️⃣  Verifying Monolith Ceilings, Immutable Config & Terminology Hygiene...');

  const rootDir = process.cwd();

  // 1. Pure service file must have zero React / DOM / server-only imports
  const pureServiceSource = fs.readFileSync(
    path.join(rootDir, 'app/core/services/analytics/operational-intelligence.service.ts'),
    'utf8'
  );
  assert.ok(!/from\s+['"]react['"]/.test(pureServiceSource), 'Zero React imports allowed in pure analytics service');
  assert.ok(!/\.server['"]/.test(pureServiceSource), 'Zero *.server imports allowed in pure analytics service');
  assert.ok(
    !/\b(?:document|localStorage|sessionStorage)\b/.test(pureServiceSource) &&
      !/\bwindow\.(?:document|localStorage|location|addEventListener|URL)\b/.test(pureServiceSource),
    'Zero DOM globals allowed in pure analytics service'
  );

  // 2. Monolith line ceilings
  const lineCeilings: ReadonlyArray<{ relPath: string; maxLines: number }> = [
    { relPath: 'app/components/domain/admin/AdminDashboardTab.tsx', maxLines: 450 },
    { relPath: 'app/routes/admin.tsx', maxLines: 1000 },
    { relPath: 'app/routes/dispatch.tsx', maxLines: 1600 },
    { relPath: 'app/routes/driver.tsx', maxLines: 1900 },
    { relPath: 'app/components/domain/driver/DriverLiveMeterCard.tsx', maxLines: 1080 },
    { relPath: 'app/components/domain/dispatch/LiveFleetMap.tsx', maxLines: 1350 },
    { relPath: 'app/components/domain/dispatch/DispatchTripQueuePane.tsx', maxLines: 900 },
    { relPath: 'app/components/domain/dispatch/DispatchBookingEngine.tsx', maxLines: 1800 },
    { relPath: 'app/components/domain/admin/AdminRulesTab.tsx', maxLines: 1350 },
  ];

  for (const item of lineCeilings) {
    const content = fs.readFileSync(path.join(rootDir, item.relPath), 'utf8');
    const lineCount = content.split(/\r?\n/).length;
    assert.ok(
      lineCount < item.maxLines,
      `${item.relPath} has ${lineCount} lines, exceeding ceiling < ${item.maxLines}`
    );
  }

  // Verify SUB_PAGES.dashboard keys in app/routes/admin.tsx
  const adminRouteText = fs.readFileSync(path.join(rootDir, 'app/routes/admin.tsx'), 'utf8');
  for (const subKey of ['overview', 'telemetry', 'analytics']) {
    assert.ok(
      adminRouteText.includes(`key: '${subKey}'`),
      `app/routes/admin.tsx must preserve SUB_PAGES.dashboard key '${subKey}'`
    );
  }

  // 3. Immutable files untouched
  const immutableGitStatus = execSync('git status --porcelain firestore.rules vercel.json', {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    immutableGitStatus,
    '',
    `firestore.rules and vercel.json must remain untouched, got:\n${immutableGitStatus}`
  );

  // 4. Terminology & bracketed driver status hygiene across app/
  const forbiddenTokens = [
    'HUD ' + 'Now',
    '[' + 'Avail]',
    '[' + 'En Route]',
    '[' + 'Busy]',
    '[' + 'Break]',
    '[' + 'Off]',
  ];
  const violations: string[] = [];

  const scanAppDir = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanAppDir(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        const text = fs.readFileSync(fullPath, 'utf8');
        for (const tok of forbiddenTokens) {
          if (text.includes(tok)) {
            violations.push(`${path.relative(rootDir, fullPath)} contains forbidden "${tok}"`);
          }
        }
      }
    }
  };

  scanAppDir(path.join(rootDir, 'app'));
  assert.deepEqual(violations, [], `UI terminology violations found:\n${violations.join('\n')}`);
}

async function main(): Promise<void> {
  console.log('🚀 Running Phase 57 Operational Analytics & CSV Verification Suite...\n');
  runPeriodWindowAssertions();
  runSlaAndCancellationAssertions();
  runAutoDispatchAndWave4Assertions();
  runRevenueAndAuditCorrelationAssertions();
  runTimeSeriesAndLeaderboardsAssertions();
  runCsvExportAndSecurityAssertions();
  runStaticGuardrailAssertions();
  console.log('\n✅ All Phase 57 Operational Intelligence & Guardrail assertions passed!');
}

main().catch((err) => {
  console.error('\n❌ Phase 57 verification failed:', err);
  process.exit(1);
});
