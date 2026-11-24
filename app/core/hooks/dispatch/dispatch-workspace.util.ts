import React, { useEffect, useRef } from 'react';
import type { GeoPoint, Trip } from '../../types/trip';
import type { SlaScanSummary } from '../../services/dispatch/sla-monitor.service';
import { formatLocalDateStr } from '../../services/pricing/vehicle-matching';
import { getTripIntermediateStopCount } from '../../utils/route-markers.util';
import type { DispatchFormValues } from '../../../components/domain/dispatch/DispatchBookingEngine';
import type { DateTimeRange } from '../../../components/domain/dispatch/CustomDateTimePicker';
import type { QueueFilterType } from '../../../components/domain/dispatch/DispatchTripQueuePane';

export type DesktopDockTab = 'none' | 'phone' | 'email' | 'drivers' | 'comms' | 'alerts';

export type DispatchMobileTab =
  | 'booking'
  | 'queue'
  | 'map'
  | 'messages'
  | 'phone'
  | 'drivers'
  | 'comms'
  | 'email';

export interface DraftTab {
  id: string;
  isNew: boolean;
  tripId?: string;
  trip?: Trip;
  formValues?: DispatchFormValues;
}

export const VALID_MOBILE_TABS = new Set<string>([
  'booking',
  'queue',
  'map',
  'messages',
  'phone',
  'drivers',
  'comms',
  'email',
]);

export function getDraftTabLabel(draft: DraftTab, totalDraftsCount: number): string {
  const isCompact = totalDraftsCount > 3;
  if (draft.isNew) {
    if (draft.formValues?.passengerName?.trim()) {
      const name = draft.formValues.passengerName.trim();
      return isCompact ? name.split(' ')[0] : name;
    }
    const num = draft.id.replace('new-', '');
    return isCompact ? `#${num}` : `New Booking ${num}`;
  }
  const shortId = draft.trip?.id.slice(-4) || draft.id.replace('edit-', '').slice(-4);
  return isCompact ? `#${shortId}` : `Edit #${shortId}`;
}

export function getDateRangeButtonLabel(dateTimeRange: DateTimeRange): string {
  if (
    dateTimeRange.presetKey &&
    dateTimeRange.presetKey !== 'all_time' &&
    dateTimeRange.presetKey !== 'custom'
  ) {
    const labels: Record<string, string> = {
      today: 'Today',
      tomorrow: 'Tomorrow',
      this_week: 'This Week',
      this_month: 'This Month',
      yesterday: 'Yesterday',
      last_7_days: 'Last 7 Days',
      last_week: 'Last Week',
      last_month: 'Last Month',
      next_7_days: 'Next 7 Days',
      next_week: 'Next Week',
      next_month: 'Next Month',
      year_to_date: 'Year to Date',
      rest_of_the_year: 'Rest of the Year',
    };
    if (labels[dateTimeRange.presetKey]) return labels[dateTimeRange.presetKey];
  }
  if (dateTimeRange.startDate && dateTimeRange.endDate) {
    if (dateTimeRange.startDate === dateTimeRange.endDate) {
      return dateTimeRange.startDate;
    }
    return `${dateTimeRange.startDate} - ${dateTimeRange.endDate}`;
  }
  return 'All Dates';
}

export function mergePopulateBookingIntoDraftForm(
  currentFormRaw: Partial<DispatchFormValues> | undefined,
  payload: Record<string, any>
): DispatchFormValues {
  const currentForm = (currentFormRaw || {}) as DispatchFormValues;
  const corpName =
    payload.corporateAccount ||
    payload.corporateAccountName ||
    payload.accountNumber ||
    currentForm.corporateDetails?.corporateAccount ||
    '';

  return {
    ...currentForm,
    passengerName: payload.passengerName || currentForm.passengerName || '',
    phone: payload.passengerPhone || payload.phone || currentForm.phone || '',
    email: payload.passengerEmail || payload.email || currentForm.email || '',
    pickupAddress: payload.pickupAddress || currentForm.pickupAddress || '',
    pickupCoordinates: payload.pickupAddress
      ? payload.pickupCoordinates
      : currentForm.pickupCoordinates,
    dropoffAddress: payload.dropoffAddress || currentForm.dropoffAddress || '',
    dropoffCoordinates: payload.dropoffAddress
      ? payload.dropoffCoordinates
      : currentForm.dropoffCoordinates,
    vehicle: (payload.vehicleTier || payload.vehicle || currentForm.vehicle || 'any') as any,
    selectedVehicles: payload.vehicleTier
      ? [payload.vehicleTier as any]
      : currentForm.selectedVehicles || ['any'],
    corporateDetails: {
      ...currentForm.corporateDetails,
      corporateAccount: corpName,
      billingPo: payload.billingPo || payload.poNumber || currentForm.corporateDetails?.billingPo || '',
      authorizedBy: currentForm.corporateDetails?.authorizedBy || '',
      invoicingTerms: currentForm.corporateDetails?.invoicingTerms || 'Net 30 Direct Bill',
    },
    paymentMethod:
      payload.corporateAccount || payload.corporateAccountName || payload.accountNumber
        ? 'account'
        : currentForm.paymentMethod || 'cash',
    internalNotes: payload.notes
      ? `${currentForm.internalNotes ? `${currentForm.internalNotes}\n` : ''}${payload.notes}`
      : currentForm.internalNotes,
  };
}

export function cloneTripToDispatchFormValues(trip: Trip): DispatchFormValues {
  const pickupDate = trip.scheduledPickupTime ? new Date(trip.scheduledPickupTime) : new Date();
  const meta = (trip.metadata || {}) as Record<string, any>;
  const clonedVehicle = (
    Array.isArray(meta.selectedVehicles) && meta.selectedVehicles.length > 0
      ? meta.selectedVehicles[0]
      : meta.vehicleTypeId || trip.vehicleTier || 'any'
  ) as any;
  const clonedVehicles =
    Array.isArray(meta.selectedVehicles) && meta.selectedVehicles.length > 0
      ? meta.selectedVehicles
      : [clonedVehicle];
  const hh = String(pickupDate.getHours()).padStart(2, '0');
  const mm = String(pickupDate.getMinutes()).padStart(2, '0');

  return {
    timingType: trip.scheduledPickupTime ? 'later' : 'asap',
    scheduledDate: formatLocalDateStr(pickupDate),
    scheduledTime: `${hh}:${mm}`,
    pickupAddress: trip.pickupLocation?.address || '',
    pickupCoordinates: trip.pickupLocation?.coordinates,
    dropoffAddress: trip.dropoffLocation?.address || '',
    dropoffCoordinates: trip.dropoffLocation?.coordinates,
    intermediateStops: (trip.intermediateStops || []).map((s) => ({
      address: s.address,
      coordinates: s.coordinates,
    })),
    passengerName: `${trip.passenger?.firstName || ''} ${trip.passenger?.lastName || ''}`.trim(),
    phone: trip.passenger?.phone || '',
    email: trip.passenger?.email || '',
    additionalPassengers: Array.isArray(meta.additionalPassengers) ? meta.additionalPassengers : [],
    contactPerson: meta.contactPerson || {
      isBookerDifferent: false,
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      contactRole: '',
    },
    passengers: trip.passenger?.passengerCount || 1,
    bags: trip.passenger?.luggageCount || 0,
    carSeats: Boolean(
      meta.carSeatsBreakdown &&
        (meta.carSeatsBreakdown.rearFacing || 0) +
          (meta.carSeatsBreakdown.frontFacing || 0) +
          (meta.carSeatsBreakdown.booster || 0) >
          0
    ),
    carSeatsBreakdown: meta.carSeatsBreakdown || {
      rearFacing: 0,
      frontFacing: 0,
      booster: 0,
    },
    selectedVehicles: clonedVehicles,
    vehicle: clonedVehicle,
    paymentMethod:
      trip.payment?.method === 'card'
        ? 'card'
        : trip.payment?.method === 'corporate' || trip.payment?.method === 'account'
        ? 'account'
        : 'cash',
    cardDetails: {
      cardPaymentType: 'terminal',
      cardholderName: '',
      cardNumber: '',
      cardExp: '',
      cardCvc: '',
      saveCardOnFile: false,
    },
    corporateDetails: meta.corporateDetails || {
      corporateAccount: meta.corporateOrgName || '',
      billingPo: '',
      authorizedBy: '',
      invoicingTerms: 'Net 30 Direct Bill',
    },
    tariff: meta.tariff || 'Standard',
    pricingRuleId: meta.pricingRuleId,
    discount: meta.discount || 'None',
    company: meta.company || 'Chesterfield Taxi',
    driverId: 'unassigned',
    notesForAll: trip.driverNotes || trip.passenger.specialRequests || '',
    internalNotes: meta.internalNotes || trip.pickupLocation.driverNotes || '',
    returnDetails: {
      returnTrip: false,
      returnPickupAddress: '',
      returnDropoffAddress: '',
      returnIntermediateStops: [],
      returnDate: '',
      returnTime: '',
      returnPassengers: 1,
      returnBags: 0,
      returnCarSeats: false,
      returnCarSeatsBreakdown: {
        rearFacing: 0,
        frontFacing: 0,
        booster: 0,
      },
      returnVehicles: ['any'],
      autoCreateReturnTrip: false,
      returnEstimatedFare: 0,
      returnEstimatedDurationMinutes: 0,
      returnEstimatedDistanceMiles: 0,
    },
    repeatDetails: {
      repeat: false,
      repeatFrequency: 'daily',
      repeatDays: [],
      repeatOccurrences: 1,
      repeatUntilDate: '',
      repeatWeeksPattern: 'all',
    },
    estimatedFare: trip.pricing?.totalFare || 0,
    returnEstimatedFare: 0,
    totalCalculatedFare: trip.pricing?.totalFare || 0,
    manualFare: '',
    isFareOverridden: false,
    estimatedDurationMinutes: trip.pricing?.durationMinutes || 0,
    estimatedDistanceMiles: trip.pricing?.distanceMiles || 0,
  };
}

export type CanonicalQueueStatusKey =
  | 'unconfirmed'
  | 'confirmed'
  | 'pending'
  | 'offered'
  | 'assigned'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'declined';

export const ALL_QUEUE_STATUS_KEYS: ReadonlyArray<CanonicalQueueStatusKey> = [
  'unconfirmed',
  'confirmed',
  'pending',
  'offered',
  'assigned',
  'accepted',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
  'declined',
];

export const ACTIVE_QUEUE_STATUS_KEYS: ReadonlyArray<CanonicalQueueStatusKey> = [
  'unconfirmed',
  'confirmed',
  'pending',
  'offered',
  'assigned',
  'accepted',
  'en_route',
  'arrived',
  'in_progress',
];

const VALID_QUEUE_STATUS_SET = new Set<string>(ALL_QUEUE_STATUS_KEYS);
const TERMINAL_QUEUE_STATUS_SET = new Set<string>([
  'completed',
  'cancelled',
  'declined',
  'DECLINED',
]);

export type QueueSortMode = 'smart' | 'date_asc' | 'date_desc';

export function parseStatusFilterSelection(statusFilter: string): Set<CanonicalQueueStatusKey> {
  const clean = String(statusFilter || '').trim().toLowerCase();
  if (!clean || clean === 'all') {
    return new Set<CanonicalQueueStatusKey>(ALL_QUEUE_STATUS_KEYS);
  }
  if (clean === 'none') {
    return new Set<CanonicalQueueStatusKey>();
  }
  const tokens = clean
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is CanonicalQueueStatusKey => VALID_QUEUE_STATUS_SET.has(s));
  return new Set<CanonicalQueueStatusKey>(tokens);
}

export function serializeStatusFilterSelection(
  selected: ReadonlySet<string> | ReadonlyArray<string>
): string {
  const set = selected instanceof Set ? selected : new Set(selected);
  const ordered = ALL_QUEUE_STATUS_KEYS.filter((k) => set.has(k));
  if (ordered.length === 0) return 'none';
  if (ordered.length >= ALL_QUEUE_STATUS_KEYS.length) return 'all';
  return ordered.join(',');
}

export function matchesQueueStatusFilter(tripStatus: string | undefined, statusFilter: string): boolean {
  const cleanFilter = String(statusFilter || '').trim().toLowerCase();
  if (!cleanFilter || cleanFilter === 'all') return true;
  if (cleanFilter === 'none') return false;
  const selectedSet = parseStatusFilterSelection(cleanFilter);
  const normalizedTripStatus = String(tripStatus || '').trim().toLowerCase();
  return selectedSet.has(normalizedTripStatus as CanonicalQueueStatusKey);
}

export function isUnconfirmedQuickFilterActive(statusFilter: string): boolean {
  const selected = parseStatusFilterSelection(statusFilter);
  return selected.size === 1 && selected.has('unconfirmed');
}

export function computeNextStatusFilterOnUnconfirmedToggle(
  currentStatusFilter: string,
  previousNonUnconfirmedFilter?: string
): { nextStatusFilter: string; savedPreviousFilter: string } {
  if (!isUnconfirmedQuickFilterActive(currentStatusFilter)) {
    const savedPreviousFilter = String(currentStatusFilter || '').trim() || 'all';
    return {
      nextStatusFilter: 'unconfirmed',
      savedPreviousFilter,
    };
  }
  const candidate = String(previousNonUnconfirmedFilter || '').trim();
  const restored =
    !candidate || isUnconfirmedQuickFilterActive(candidate) ? 'all' : candidate;
  return {
    nextStatusFilter: restored,
    savedPreviousFilter: restored,
  };
}

export function resolveTripEffectiveTimeMs(trip: Trip): number {
  if (trip.scheduledPickupTime && trip.bookingType !== 'asap') {
    const schedMs = Date.parse(trip.scheduledPickupTime);
    if (Number.isFinite(schedMs)) return schedMs;
  }
  if (trip.createdAt) {
    const createdMs = Date.parse(trip.createdAt);
    if (Number.isFinite(createdMs)) return createdMs;
  }
  if (trip.scheduledPickupTime) {
    const fallbackSched = Date.parse(trip.scheduledPickupTime);
    if (Number.isFinite(fallbackSched)) return fallbackSched;
  }
  if (trip.updatedAt) {
    const updMs = Date.parse(trip.updatedAt);
    if (Number.isFinite(updMs)) return updMs;
  }
  return 0;
}

/**
 * Deterministic Trips Queue sorter:
 * - `'smart'` (default):
 *   1. Open / Live operational trips first (`ASAP` immediate requests newest-first at top,
 *      followed by scheduled rides in strict chronological `Soonest -> Furthest` pickup order).
 *   2. Closed / Terminal trips (`completed`, `cancelled`, `declined`) below active work,
 *      sorted most-recent first (`Newest -> Oldest`).
 * - `'date_asc'`: Strict chronological ascending (`Oldest -> Newest`) across all filtered rows.
 * - `'date_desc'`: Strict chronological descending (`Newest/Furthest -> Oldest`) across all filtered rows.
 */
export function sortDispatchQueueTrips(
  list: ReadonlyArray<Trip>,
  sortMode: QueueSortMode = 'smart'
): Trip[] {
  const copy = [...list];

  if (sortMode === 'date_asc') {
    return copy.sort((a, b) => {
      const diff = resolveTripEffectiveTimeMs(a) - resolveTripEffectiveTimeMs(b);
      if (diff !== 0) return diff;
      return (a.id || '').localeCompare(b.id || '');
    });
  }

  if (sortMode === 'date_desc') {
    return copy.sort((a, b) => {
      const diff = resolveTripEffectiveTimeMs(b) - resolveTripEffectiveTimeMs(a);
      if (diff !== 0) return diff;
      return (b.id || '').localeCompare(a.id || '');
    });
  }

  // Default: 'smart' operational dispatch order
  return copy.sort((a, b) => {
    const termA = TERMINAL_QUEUE_STATUS_SET.has(String(a.status || ''));
    const termB = TERMINAL_QUEUE_STATUS_SET.has(String(b.status || ''));
    if (termA !== termB) {
      return termA ? 1 : -1;
    }

    // Both terminal/historical: sort newest -> oldest
    if (termA && termB) {
      const diff = resolveTripEffectiveTimeMs(b) - resolveTripEffectiveTimeMs(a);
      if (diff !== 0) return diff;
      return (b.id || '').localeCompare(a.id || '');
    }

    // Both open/live operational trips: ASAP rides first (newest request first), then scheduled chronological ascending
    const isAsapA = a.bookingType === 'asap' || !a.scheduledPickupTime;
    const isAsapB = b.bookingType === 'asap' || !b.scheduledPickupTime;
    if (isAsapA !== isAsapB) {
      return isAsapA ? -1 : 1;
    }

    if (isAsapA && isAsapB) {
      const diff = resolveTripEffectiveTimeMs(b) - resolveTripEffectiveTimeMs(a);
      if (diff !== 0) return diff;
      return (b.id || '').localeCompare(a.id || '');
    }

    // Both scheduled active/upcoming trips: chronological ascending (soonest pickup first)
    const diff = resolveTripEffectiveTimeMs(a) - resolveTripEffectiveTimeMs(b);
    if (diff !== 0) return diff;
    return (a.id || '').localeCompare(b.id || '');
  });
}

export interface FilterDispatchQueueTripsInput {
  trips: Trip[];
  statusFilter: string;
  pillFilter: 'all' | 'unconfirmed' | 'pending' | 'assigned' | 'completed' | 'cancelled' | 'unassigned';
  dateTimeRange: DateTimeRange;
  filterStartDate: string;
  filterEndDate: string;
  activeFilterKeys: QueueFilterType[];
  selectedDriverFilter: string;
  selectedVehicleFilter: string;
  selectedTariffFilter: string;
  selectedCompanyFilter: string;
  selectedPaymentFilter: string;
  searchTerm: string;
  slaUrgentOnlyFilter: boolean;
  slaSummary: SlaScanSummary;
  sortMode?: QueueSortMode;
}

export function filterDispatchQueueTrips({
  trips,
  statusFilter,
  pillFilter,
  dateTimeRange,
  filterStartDate,
  filterEndDate,
  activeFilterKeys,
  selectedDriverFilter,
  selectedVehicleFilter,
  selectedTariffFilter,
  selectedCompanyFilter,
  selectedPaymentFilter,
  searchTerm,
  slaUrgentOnlyFilter,
  slaSummary,
  sortMode = 'smart',
}: FilterDispatchQueueTripsInput): Trip[] {
  const normSearchDigits = searchTerm.replace(/\D/g, '');
  const term = searchTerm.trim().toLowerCase();

  const to24h = (
    t?: { hour: string; minute: string; period: 'AM' | 'PM' } | null
  ): string | null => {
    if (!t || !t.hour || !t.minute) return null;
    let h = parseInt(t.hour, 10) % 12;
    if (t.period === 'PM') h += 12;
    return `${String(h).padStart(2, '0')}:${String(parseInt(t.minute, 10)).padStart(2, '0')}`;
  };

  const matched = trips.filter((trip) => {
    const meta = (trip.metadata || {}) as Record<string, any>;

    if (slaUrgentOnlyFilter) {
      const sla = slaSummary.byTripId[trip.id];
      if (!sla || !sla.isEligible || sla.level === 'normal') return false;
    }

    if (!matchesQueueStatusFilter(trip.status, statusFilter)) {
      return false;
    }

    if (pillFilter === 'unconfirmed' && trip.status !== 'UNCONFIRMED' && trip.status !== 'unconfirmed') {
      return false;
    }
    if (pillFilter === 'pending' && trip.status !== 'pending') return false;
    if (pillFilter === 'assigned' && trip.status !== 'assigned') return false;
    if (pillFilter === 'completed' && trip.status !== 'completed') return false;
    if (pillFilter === 'cancelled' && trip.status !== 'cancelled') return false;
    if (pillFilter === 'unassigned' && trip.assignedDriverId) return false;

    if (dateTimeRange.startDate || dateTimeRange.endDate) {
      const tripDateStr = trip.scheduledPickupTime || trip.createdAt;
      if (tripDateStr) {
        const d = new Date(tripDateStr);
        if (!isNaN(d.getTime())) {
          const localYmd = formatLocalDateStr(d);
          const localHm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          const startHm = to24h(dateTimeRange.startTime);
          const endHm = to24h(dateTimeRange.endTime);
          if (dateTimeRange.startDate && localYmd < dateTimeRange.startDate) return false;
          if (dateTimeRange.endDate && localYmd > dateTimeRange.endDate) return false;
          if (
            dateTimeRange.startDate &&
            startHm &&
            localYmd === dateTimeRange.startDate &&
            localHm < startHm
          ) {
            return false;
          }
          if (
            dateTimeRange.endDate &&
            endHm &&
            localYmd === dateTimeRange.endDate &&
            localHm > endHm
          ) {
            return false;
          }
        }
      }
    } else if (filterStartDate || filterEndDate) {
      const tripDateStr = trip.scheduledPickupTime || trip.createdAt;
      if (tripDateStr) {
        const d = new Date(tripDateStr);
        if (!isNaN(d.getTime())) {
          const localYmd = formatLocalDateStr(d);
          if (filterStartDate && localYmd < filterStartDate) return false;
          if (filterEndDate && localYmd > filterEndDate) return false;
        }
      }
    }

    if (activeFilterKeys.includes('driver') && selectedDriverFilter !== 'all') {
      const matchesAssigned = trip.assignedDriverId === selectedDriverFilter;
      const matchesStaged =
        !trip.assignedDriverId && trip.plannedDriverId === selectedDriverFilter;
      if (!matchesAssigned && !matchesStaged) return false;
    }

    if (activeFilterKeys.includes('vehicle') && selectedVehicleFilter !== 'all') {
      const vId = String(meta.vehicleTypeId || trip.vehicleTier || '').toLowerCase();
      if (
        vId !== selectedVehicleFilter.toLowerCase() &&
        (trip.vehicleTier || '').toLowerCase() !== selectedVehicleFilter.toLowerCase()
      ) {
        return false;
      }
    }

    if (activeFilterKeys.includes('tariff') && selectedTariffFilter !== 'all') {
      const tariffStr = `${trip.pricing?.tariffProfileName || ''} ${
        trip.pricing?.matchedCorridorName || ''
      } ${meta.tariff || ''} ${meta.pricingRuleName || ''}`.toLowerCase();
      if (!tariffStr.includes(selectedTariffFilter.toLowerCase())) return false;
    }

    if (activeFilterKeys.includes('has_car_seat')) {
      const csb = meta.carSeatsBreakdown;
      const hasStructuredSeats = Boolean(
        csb && (csb.rearFacing || 0) + (csb.frontFacing || 0) + (csb.booster || 0) > 0
      );
      const notesLower = (
        (trip.passenger?.specialRequests || '') +
        ' ' +
        (trip.pickupLocation?.notes || '') +
        ' ' +
        (trip.pickupLocation?.driverNotes || '')
      ).toLowerCase();
      const hasSeat =
        hasStructuredSeats ||
        notesLower.includes('car seat') ||
        notesLower.includes('carseat') ||
        notesLower.includes('booster');
      if (!hasSeat) return false;
    }

    if (activeFilterKeys.includes('has_stops') && getTripIntermediateStopCount(trip) <= 0) {
      return false;
    }

    if (
      activeFilterKeys.includes('has_staged_driver') &&
      (Boolean(trip.assignedDriverId) || !trip.plannedDriverId)
    ) {
      return false;
    }

    if (activeFilterKeys.includes('company') && selectedCompanyFilter !== 'all') {
      const companyStr = `${meta.corporateOrgName || ''} ${
        meta.corporateDetails?.corporateAccount || ''
      } ${meta.company || ''} ${(trip as any).company || ''}`.toLowerCase();
      if (!companyStr.includes(selectedCompanyFilter.toLowerCase())) return false;
    }

    if (activeFilterKeys.includes('payment_type') && selectedPaymentFilter !== 'all') {
      const method = trip.payment?.method || 'cash';
      if (selectedPaymentFilter === 'account' || selectedPaymentFilter === 'corporate') {
        if (method !== 'account' && method !== 'corporate') return false;
      } else if (method !== selectedPaymentFilter) {
        return false;
      }
    }

    if (term) {
      const matchId = (trip.id || '').toLowerCase().includes(term);
      const matchPassenger = `${trip.passenger?.firstName || ''} ${trip.passenger?.lastName || ''}`
        .toLowerCase()
        .includes(term);
      const rawPhone = trip.passenger?.phone || '';
      const matchPhone =
        rawPhone.toLowerCase().includes(term) ||
        (normSearchDigits.length >= 3 && rawPhone.replace(/\D/g, '').includes(normSearchDigits));
      const matchPickup = (trip.pickupLocation?.address || '').toLowerCase().includes(term);
      const matchDropoff = (trip.dropoffLocation?.address || '').toLowerCase().includes(term);
      const matchStops = (trip.intermediateStops || []).some((s) =>
        (s.address || '').toLowerCase().includes(term)
      );
      const matchDriver =
        (trip.assignedDriverId || '').toLowerCase().includes(term) ||
        (trip.plannedDriverId || '').toLowerCase().includes(term) ||
        (trip.plannedDriverLabel || '').toLowerCase().includes(term);
      const matchGroup = (trip.multiCarGroupId || '').toLowerCase().includes(term);
      const matchFlight =
        (trip.flightTelemetry?.flightIdent || '').toLowerCase().includes(term) ||
        (trip.flightTelemetry?.airlineName || '').toLowerCase().includes(term) ||
        String(meta.flightNumber || '').toLowerCase().includes(term) ||
        String(meta.airline || '').toLowerCase().includes(term) ||
        String(meta.tailNumber || '').toLowerCase().includes(term);
      if (
        !matchId &&
        !matchPassenger &&
        !matchPhone &&
        !matchPickup &&
        !matchDropoff &&
        !matchStops &&
        !matchDriver &&
        !matchGroup &&
        !matchFlight
      ) {
        return false;
      }
    }
    return true;
  });

  return sortDispatchQueueTrips(matched, sortMode);
}

export interface ActiveDraftLocationState {
  signature: string;
  hasAnyLocation: boolean;
}

function formatDraftGeoToken(pt?: GeoPoint | null): string {
  if (
    !pt ||
    typeof pt.lat !== 'number' ||
    typeof pt.lng !== 'number' ||
    !Number.isFinite(pt.lat) ||
    !Number.isFinite(pt.lng) ||
    (pt.lat === 0 && pt.lng === 0)
  ) {
    return '';
  }
  return `${pt.lat.toFixed(5)},${pt.lng.toFixed(5)}`;
}

/**
 * Pure deterministic location signature for the active Dispatch booking draft.
 * Detects changes to `activeDraft.id`, Pickup, Intermediate Stops, or Dropoff
 * (both text addresses and explicit coordinates).
 */
export function computeActiveDraftLocationState(
  activeDraft?: DraftTab | null
): ActiveDraftLocationState {
  if (!activeDraft) {
    return { signature: '', hasAnyLocation: false };
  }
  const fv = activeDraft.formValues;
  const pickupAddr = fv?.pickupAddress?.trim() || '';
  const pickupCoords = formatDraftGeoToken(fv?.pickupCoordinates);
  const dropoffAddr = fv?.dropoffAddress?.trim() || '';
  const dropoffCoords = formatDraftGeoToken(fv?.dropoffCoordinates);
  const stopTokens = Array.isArray(fv?.intermediateStops)
    ? fv.intermediateStops
        .map((s) => {
          const addr = s?.address?.trim() || '';
          const coords = formatDraftGeoToken(s?.coordinates);
          return addr || coords ? `${addr}@${coords}` : '';
        })
        .filter(Boolean)
    : [];

  const hasAnyLocation = Boolean(
    pickupAddr || pickupCoords || dropoffAddr || dropoffCoords || stopTokens.length > 0
  );

  const signature = [
    activeDraft.id,
    pickupAddr,
    pickupCoords,
    dropoffAddr,
    dropoffCoords,
    stopTokens.join('|'),
  ].join('::');

  return {
    signature,
    hasAnyLocation,
  };
}

/**
 * Clears stale `selectedMapTrip` / `selectedQueueTripId` and enables `shouldZoomMap`
 * whenever the active booking draft's location signature changes with >= 1 location,
 * ensuring `LiveFleetMap` immediately renders `'draft_form'` pins & routes.
 */
export function useSyncDraftLocationsToMap(params: {
  activeDraft?: DraftTab | null;
  setSelectedMapTrip: React.Dispatch<React.SetStateAction<Trip | null>>;
  setSelectedQueueTripId: React.Dispatch<React.SetStateAction<string | null>>;
  setShouldZoomMap: React.Dispatch<React.SetStateAction<boolean>>;
}): void {
  const { activeDraft, setSelectedMapTrip, setSelectedQueueTripId, setShouldZoomMap } = params;
  const { signature, hasAnyLocation } = computeActiveDraftLocationState(activeDraft);
  const prevSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevSignatureRef.current === signature) return;
    prevSignatureRef.current = signature;
    if (hasAnyLocation) {
      setSelectedMapTrip(null);
      setSelectedQueueTripId(null);
      setShouldZoomMap(true);
    }
  }, [signature, hasAnyLocation, setSelectedMapTrip, setSelectedQueueTripId, setShouldZoomMap]);
}
