/**
 * Pure Admin Trips Queue & Exception Classification Helper (`admin-trips-exceptions.util.ts` — Phase 59)
 *
 * Classifies Active Queue trips, completable lifecycles, and operational exceptions:
 * 1. `sla_unassigned`: `unassigned_alert`, SLA warning/critical/overdue, or exhausted `offerCascade`
 * 2. `rider_change_request`: Phase 56 `pendingGuestChangeRequest.status === 'pending'`
 * 3. `driver_ack_pending`: Phase 55 unacknowledged `pendingDriverUpdateAck`
 * 4. `cancelled_declined_noshow`: Cancelled, Declined, or No-Show trips
 *
 * 100% pure TypeScript (zero React or DOM dependencies) for SSR, UI, and unit-test parity.
 */

import type { DispatchAutomationConfig } from '../types/config';
import type { Trip, TripSlaLevel } from '../types/trip';
import { evaluateTripSlaUrgency } from '../services/dispatch/sla-monitor.service';
import {
  getPendingDriverUpdateAck,
  hasUnacknowledgedDriverUpdate,
  isDriverUpdateAckOverdue,
} from '../services/dispatch/trip-update-ack.service';

export { isDriverUpdateAckOverdue };
import {
  getPendingGuestChangeRequest,
  hasPendingGuestChangeRequest,
} from '../services/tracking/guest-manage-ride';

export type AdminTripExceptionCategory =
  | 'sla_unassigned'
  | 'rider_change_request'
  | 'driver_ack_pending'
  | 'cancelled_declined_noshow';

export type AdminTripExceptionFilter = 'all' | AdminTripExceptionCategory;

export const ADMIN_ACTIVE_QUEUE_STATUSES = new Set<string>([
  'unconfirmed',
  'UNCONFIRMED',
  'pending',
  'confirmed',
  'CONFIRMED',
  'offered',
  'assigned',
  'accepted',
  'en_route',
  'arrived',
  'in_progress',
  'unassigned_alert',
]);

export const ADMIN_COMPLETABLE_TRIP_STATUSES = new Set<string>([
  'assigned',
  'accepted',
  'en_route',
  'arrived',
  'in_progress',
]);

export function isAdminActiveQueueTrip(trip: Partial<Trip>, isArchived: boolean = false): boolean {
  if (isArchived || trip.isArchived) return false;
  return ADMIN_ACTIVE_QUEUE_STATUSES.has(String(trip.status || ''));
}

export function canAdminCompleteTrip(trip: Partial<Trip>): boolean {
  return ADMIN_COMPLETABLE_TRIP_STATUSES.has(String(trip.status || ''));
}

export interface ClassifiedAdminTripException {
  tripId: string;
  isException: boolean;
  categories: AdminTripExceptionCategory[];
  hasSlaOrCascadeAlert: boolean;
  slaLevel: TripSlaLevel | null;
  isCascadeExhausted: boolean;
  hasPendingRiderChangeRequest: boolean;
  riderChangeSummary: string | null;
  hasUnacknowledgedDriverAck: boolean;
  isDriverAckOverdue: boolean;
  driverAckSummary: string[];
  isCancelledDeclinedOrNoShow: boolean;
}

export function classifyAdminTripExceptions(
  trip: Trip,
  options?: {
    slaConfig?: Partial<DispatchAutomationConfig> | null;
    unacknowledgedAlertMinutes?: number;
    nowMs?: number;
  }
): ClassifiedAdminTripException {
  const categories: AdminTripExceptionCategory[] = [];
  const rawStatus = String(trip.status || '');
  const isTerminalCancelledOrDeclined =
    rawStatus === 'cancelled' || rawStatus === 'declined' || rawStatus === 'DECLINED';

  // 1. SLA / Unassigned Alert / Exhausted Offer Cascade
  const storedSlaLevel = trip.slaStatus?.level;
  const computedSla =
    !trip.assignedDriverId && !isTerminalCancelledOrDeclined && rawStatus !== 'completed'
      ? evaluateTripSlaUrgency(trip, options?.slaConfig, options?.nowMs)
      : null;

  const effectiveSlaLevel: TripSlaLevel | null =
    !trip.assignedDriverId &&
    (storedSlaLevel === 'warning' ||
      storedSlaLevel === 'critical' ||
      storedSlaLevel === 'overdue')
      ? storedSlaLevel
      : computedSla && computedSla.isEligible && computedSla.level !== 'normal'
      ? computedSla.level
      : null;

  const isCascadeExhausted = Boolean(
    !trip.assignedDriverId && trip.offerCascade?.state === 'exhausted'
  );
  const isUnassignedAlertStatus = rawStatus === 'unassigned_alert';

  const hasSlaOrCascadeAlert = Boolean(
    !isTerminalCancelledOrDeclined &&
      rawStatus !== 'completed' &&
      (isUnassignedAlertStatus || effectiveSlaLevel !== null || isCascadeExhausted)
  );
  if (hasSlaOrCascadeAlert) {
    categories.push('sla_unassigned');
  }

  // 2. Phase 56 Pending Rider /track Change Request
  const metaAny = (trip.metadata || {}) as Record<string, any>;
  const rawGuestReq = metaAny.pendingGuestChangeRequest;
  const parsedGuestReq = getPendingGuestChangeRequest(trip);
  const hasPendingRiderChangeRequest = Boolean(
    hasPendingGuestChangeRequest(trip) || rawGuestReq?.status === 'pending'
  );

  let riderChangeSummary: string | null = null;
  if (hasPendingRiderChangeRequest) {
    categories.push('rider_change_request');
    const parts: string[] = [];
    const reqObj = parsedGuestReq || rawGuestReq;
    if (reqObj?.requestedPickupTime) {
      parts.push(`Time → ${reqObj.requestedPickupTime}`);
    }
    if (reqObj?.requestedPickupLocation?.address || reqObj?.pickupAddress) {
      parts.push(
        `Pickup → ${reqObj.requestedPickupLocation?.address || reqObj.pickupAddress}`
      );
    }
    if (reqObj?.requestedDropoffLocation?.address || reqObj?.dropoffAddress) {
      parts.push(
        `Dropoff → ${reqObj.requestedDropoffLocation?.address || reqObj.dropoffAddress}`
      );
    }
    if (reqObj?.customerReason) {
      parts.push(`"${reqObj.customerReason}"`);
    }
    riderChangeSummary = parts.length > 0 ? parts.join(' · ') : 'Requested itinerary update on /track';
  }

  // 3. Phase 55 Unacknowledged Driver Update
  const rawAck = metaAny.pendingDriverUpdateAck;
  const parsedAck = getPendingDriverUpdateAck(trip);
  const hasUnacknowledgedDriverAck = Boolean(
    hasUnacknowledgedDriverUpdate(trip) || (rawAck && !rawAck.acknowledgedAt)
  );
  const isDriverAckOverdue =
    hasUnacknowledgedDriverAck &&
    isDriverUpdateAckOverdue(
      trip,
      options?.unacknowledgedAlertMinutes ?? 5,
      options?.nowMs ?? Date.now()
    );
  const driverAckSummary: string[] = Array.isArray(parsedAck?.changesSummary)
    ? parsedAck!.changesSummary
    : Array.isArray(rawAck?.changesSummary)
    ? rawAck.changesSummary.map(String)
    : [];
  if (hasUnacknowledgedDriverAck) {
    categories.push('driver_ack_pending');
  }

  // 4. Cancelled / Declined / No-Show
  const notesLower = `${trip.driverNotes || ''} ${trip.cancellationReason || ''}`.toLowerCase();
  const isNoShow = notesLower.includes('no-show') || notesLower.includes('no show');
  const isCancelledDeclinedOrNoShow = Boolean(isTerminalCancelledOrDeclined || isNoShow);
  if (isCancelledDeclinedOrNoShow) {
    categories.push('cancelled_declined_noshow');
  }

  return {
    tripId: trip.id,
    isException: categories.length > 0,
    categories,
    hasSlaOrCascadeAlert,
    slaLevel: effectiveSlaLevel,
    isCascadeExhausted,
    hasPendingRiderChangeRequest,
    riderChangeSummary,
    hasUnacknowledgedDriverAck,
    isDriverAckOverdue,
    driverAckSummary,
    isCancelledDeclinedOrNoShow,
  };
}
