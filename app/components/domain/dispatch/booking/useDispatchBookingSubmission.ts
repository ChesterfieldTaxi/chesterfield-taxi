import { useState, useEffect, useRef, useMemo } from 'react';
import type React from 'react';
import {
  evaluateDispatchBookingConflicts,
  type BookingConflictCheckSummary,
} from '../../../../core/services/dispatch/booking-conflict-checker.service';
import { registerStandingOrderFromDispatchBooking } from '../../../../core/services/dispatch/standing-order.service';
import {
  ACTIVE_DRIVER_LIFECYCLE_STATUSES,
  buildPendingDriverUpdateAck,
  resolveAssignedTripEditPreservation,
} from '../../../../core/services/dispatch/trip-update-ack.service';
import type {
  Trip,
  TripPricing,
  GeoPoint,
  CreateTripInput,
  VehicleTier,
  PaymentMethod,
} from '../../../../core/types';
import type {
  NamedPricingRule,
  CorporateAccountConfig,
  UniversalExtrasConfig,
} from '../../../../core/types/config';
import type { FlightTelemetrySnapshot } from '../../../../core/types/flight';
import { parseFlightIdent, type AirportDetectionResult } from '../../../../core/config/airports';
import { getBookingService } from '../../../../core/services/booking';
import { formatInheritedCorporateBillingTerms } from '../../../../core/services/corporate-caller-auth.util';
import {
  getContactService,
  normalizeClientDriverPreferences,
} from '../../../../core/services/customer/contact.service';
import {
  generateMultiCarGroupId,
  distributeAcrossCars,
  buildPerVehiclePricingSpecs,
  buildAssociateEntryFromTrip,
} from '../../../../core/services/booking/multi-car.util';
import { getAdminAuthService } from '../../../../core/services/auth/admin-auth.service';
import {
  getAdminConfigService,
  normalizeDispatchConsoleConfig,
  normalizeStandingOrdersConfig,
  normalizeDriverAppPoliciesConfig,
} from '../../../../core/services/config/admin-config.service';
import { getEmailDispatchService } from '../../../../core/services/email';
import {
  formatDriverAssignmentLabel,
  type DriverRosterItem,
} from '../../../../core/services/operator.service';
import { formatLocalDateStr } from '../../../../core/services/pricing/vehicle-matching';
import {
  DEFAULT_CORPORATE_ACCOUNTS,
  resolveVehicleEngineId,
  generateRecurringDates,
  formatCustomExtrasSummary,
  formatCarSeatSummaryLabel,
  formatDispatchFlightNotesTag,
  buildPersistedPricing,
  computeDispatchRoundTripFares,
  type BookingAdditionalPassenger as AdditionalPassenger,
  type CarSeatsBreakdown,
  type BookingVehicleChoice as VehicleChoice,
  type DispatchVehicleOption,
  type VehicleCapacityInfo,
  type validateDispatchCorporateSubmission,
} from '../../../../core/hooks/booking';

export function resolveTripClientDriverPreferencesMetadata(
  phone?: string,
  email?: string
): {
  clientPreferredDriverIds?: string[];
  clientExcludedDriverIds?: string[];
} {
  const cleanPhone = String(phone || '').trim();
  const cleanEmail = String(email || '').trim();
  const contact =
    (cleanPhone ? getContactService().getContactByPhone(cleanPhone) : null) ||
    (cleanEmail ? getContactService().getContactByEmail(cleanEmail) : null);
  if (!contact) return {};
  const prefs = normalizeClientDriverPreferences(
    contact.preferredDriverIds,
    contact.excludedDriverIds
  );
  return {
    clientPreferredDriverIds:
      prefs.preferredDriverIds.length > 0 ? prefs.preferredDriverIds : undefined,
    clientExcludedDriverIds:
      prefs.excludedDriverIds.length > 0 ? prefs.excludedDriverIds : undefined,
  };
}

export interface ContactPersonDetails {
  isBookerDifferent: boolean;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  contactRole: string;
}

export interface CardDetails {
  cardPaymentType: 'terminal' | 'payment_link' | 'card_on_file' | 'manual';
  cardholderName: string;
  cardNumber: string; // Last-4 reference only (PCI-safe — never stores full PAN)
  cardExp: string;
  cardCvc: string; // Deprecated — always blank for PCI compliance
  saveCardOnFile: boolean;
}

export interface CorporateAccountDetails {
  corporateAccount: string;
  billingPo: string;
  authorizedBy: string;
  invoicingTerms: string;
}

export interface ReturnTripDetails {
  returnTrip: boolean;
  returnPickupAddress: string;
  returnPickupCoordinates?: GeoPoint;
  returnDropoffAddress: string;
  returnDropoffCoordinates?: GeoPoint;
  returnIntermediateStops: Array<{ address: string; coordinates?: GeoPoint }>;
  returnDate: string;
  returnTime: string;
  returnPassengers: number;
  returnCarryOnBags?: number;
  returnCheckedBags?: number;
  returnBags: number;
  returnHasOversizedLuggage?: boolean;
  returnOversizedBags?: Record<string, number>;
  returnOversizedLuggageNotes?: string;
  returnCarSeats: boolean;
  returnCarSeatsBreakdown: CarSeatsBreakdown;
  returnVehicles: Array<VehicleChoice>;
  autoCreateReturnTrip: boolean;
  returnEstimatedFare?: number;
  returnEstimatedDurationMinutes?: number;
  returnEstimatedDistanceMiles?: number;
  returnProvideFlightInfo?: boolean;
  returnAirline?: string;
  returnFlightNumber?: string;
  returnFlightOrigin?: string;
  returnTailNumber?: string;
  returnFboFacility?: string;
  returnHasCheckedLuggage?: boolean;
}

export interface RepeatTripDetails {
  repeat: boolean;
  repeatFrequency: 'daily' | 'weekdays' | 'weekly' | 'custom';
  repeatDays: string[];
  repeatOccurrences: number;
  repeatUntilDate: string;
  repeatWeeksPattern: 'all' | 'odd' | 'even';
  repeatSkipDates?: string[];
  repeatsRoundTrip?: boolean;
}

export interface DispatchFormValues {
  timingType: 'asap' | 'later';
  scheduledDate: string;
  scheduledTime: string;
  pickupAddress: string;
  pickupCoordinates?: GeoPoint;
  pickupPlaceId?: string;
  dropoffAddress: string;
  dropoffCoordinates?: GeoPoint;
  dropoffPlaceId?: string;
  intermediateStops: Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>;
  passengerName: string;
  phone: string;
  email: string;
  additionalPassengers: AdditionalPassenger[];
  contactPerson: ContactPersonDetails;
  passengers: number;
  carryOnBags?: number;
  checkedBags?: number;
  bags: number;
  carSeats: boolean;
  carSeatsBreakdown: CarSeatsBreakdown;
  selectedVehicles: Array<VehicleChoice>;
  vehicle: VehicleChoice;
  paymentMethod: 'cash' | 'card' | 'account';
  cardDetails: CardDetails;
  corporateDetails: CorporateAccountDetails;
  tariff: string;
  pricingRuleId?: string;
  pricingRuleName?: string;
  discount: string;
  company: string;
  driverId: string;
  driverAssignmentMode?: 'send_to_driver' | 'stage_hold';
  notesForAll: string;
  internalNotes: string;
  returnDetails: ReturnTripDetails;
  repeatDetails: RepeatTripDetails;
  estimatedFare: number;
  returnEstimatedFare: number;
  totalCalculatedFare: number;
  manualFare: string;
  isFareOverridden: boolean;
  estimatedDurationMinutes: number;
  estimatedDistanceMiles: number;
  provideFlightInfo?: boolean;
  airline?: string;
  flightNumber?: string;
  flightOrigin?: string;
  tailNumber?: string;
  fboFacility?: string;
  hasCheckedLuggage?: boolean;
}

export interface DispatchBookingEngineProps {
  draftId: string;
  isActiveDraft?: boolean;
  isActive?: boolean;
  initialTrip?: Trip | null;
  allTrips?: Trip[];
  trips?: Trip[];
  drivers?: DriverRosterItem[];
  onBookingSuccess?: (trip: Trip, isEdit: boolean) => void;
  onValuesChange?: (values: DispatchFormValues) => void;
  onClearDraft?: () => void;
  onCloneBooking?: (values: DispatchFormValues) => void;
  onCopyBooking?: (values: DispatchFormValues) => void;
  onOpenLinkedTrip?: (linkedTripId: string) => void;
}

export interface DispatchHydrationSetters {
  setTimingType: (v: 'asap' | 'later') => void;
  setScheduledDate: (v: string) => void;
  setScheduledTime: (v: string) => void;
  setPickupAddress: (v: string) => void;
  setPickupCoordinates: (v: GeoPoint | undefined) => void;
  setPickupPlaceId: (v: string | undefined) => void;
  setDropoffAddress: (v: string) => void;
  setDropoffCoordinates: (v: GeoPoint | undefined) => void;
  setDropoffPlaceId: (v: string | undefined) => void;
  setIntermediateStops: (
    v: Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>
  ) => void;
  setPassengerName: (v: string) => void;
  setPhone: (v: string) => void;
  setEmail: (v: string) => void;
  setAdditionalPassengers: (v: AdditionalPassenger[]) => void;
  setIsBookerDifferent: (v: boolean) => void;
  setContactName: (v: string) => void;
  setContactPhone: (v: string) => void;
  setContactEmail: (v: string) => void;
  setContactRole: (v: string) => void;
  setPassengers: (v: number) => void;
  setCarryOnBags: (v: number) => void;
  setCheckedBags: (v: number) => void;
  setBags: (v: number) => void;
  setHasOversizedLuggage: (v: boolean) => void;
  setOversizedBags: (v: Record<string, number>) => void;
  setOversizedLuggageNotes: (v: string) => void;
  setShowSpecialRequests: (v: boolean) => void;
  setSpecialRequestFlags: (v: {
    petFriendly: boolean;
    quietRide: boolean;
    musicOk: boolean;
  }) => void;
  setGateCode: (v: string) => void;
  setSelectedCustomExtras: (v: Record<string, number>) => void;
  setCarSeats: (v: boolean) => void;
  setRearFacingCount: (v: number) => void;
  setFrontFacingCount: (v: number) => void;
  setBoosterCount: (v: number) => void;
  setSelectedVehicles: (v: Array<VehicleChoice>) => void;
  setPaymentMethod: (v: 'cash' | 'card' | 'account') => void;
  setCardPaymentType: (
    v: 'terminal' | 'payment_link' | 'card_on_file' | 'manual'
  ) => void;
  setCardholderName: (v: string) => void;
  setCardNumber: (v: string) => void;
  setCardExp: (v: string) => void;
  setCorporateAccount: (v: string) => void;
  setBillingPo: (v: string) => void;
  setAuthorizedBy: (v: string) => void;
  setInvoicingTerms: (v: string) => void;
  setSendEmailConfirmation: (v: boolean) => void;
  setTariff: (v: string) => void;
  setSelectedRuleId: (v: string) => void;
  setDiscount: (v: string) => void;
  setManualDiscountDollars: (v: string) => void;
  setWaiveAirportFee: (v: boolean) => void;
  setWaiveMultiStopFees: (v: boolean) => void;
  setBypassSurge: (v: boolean) => void;
  setWaivedSurchargeIds?: (v: string[]) => void;
  setWaivedExtraKeys?: (v: string[]) => void;
  setCompany: (v: string) => void;
  setDriverId: (v: string) => void;
  setDriverAssignmentMode?: (v: 'send_to_driver' | 'stage_hold') => void;
  setNotesForAll: (v: string) => void;
  setInternalNotes: (v: string) => void;
  setReturnTrip: (v: boolean) => void;
  setReturnPickupAddress: (v: string) => void;
  setReturnPickupCoordinates: (v: GeoPoint | undefined) => void;
  setReturnDropoffAddress: (v: string) => void;
  setReturnDropoffCoordinates: (v: GeoPoint | undefined) => void;
  setReturnIntermediateStops: (
    v: Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>
  ) => void;
  setReturnDate: (v: string) => void;
  setReturnTime: (v: string) => void;
  setReturnPassengers: (v: number) => void;
  setReturnCarryOnBags: (v: number) => void;
  setReturnCheckedBags: (v: number) => void;
  setReturnBags: (v: number) => void;
  setReturnHasOversizedLuggage: (v: boolean) => void;
  setReturnOversizedBags: (v: Record<string, number>) => void;
  setReturnOversizedLuggageNotes: (v: string) => void;
  setReturnCarSeats: (v: boolean) => void;
  setReturnRearFacing: (v: number) => void;
  setReturnFrontFacing: (v: number) => void;
  setReturnBooster: (v: number) => void;
  setReturnVehicles: (v: Array<VehicleChoice>) => void;
  setAutoCreateReturnTrip: (v: boolean) => void;
  setRepeat: (v: boolean) => void;
  setRepeatFrequency: (v: 'daily' | 'weekdays' | 'weekly' | 'custom') => void;
  setRepeatDays: (v: string[]) => void;
  setRepeatOccurrences: (v: number) => void;
  setRepeatUntilDate: (v: string) => void;
  setRepeatWeeksPattern: (v: 'all' | 'odd' | 'even') => void;
  setRepeatSkipDates?: (v: string[]) => void;
  setEstimatedFare: (v: number) => void;
  setReturnEstimatedFare: (v: number) => void;
  setManualFare: (v: string) => void;
  setIsFareOverridden: (v: boolean) => void;
  setOutboundPricing: (v: TripPricing | null) => void;
  setEstimatedDistanceMiles: (v: number) => void;
  setEstimatedDurationMinutes: (v: number) => void;
  setProvideFlightInfo: (v: boolean) => void;
  setAirline: (v: string) => void;
  setFlightNumber: (v: string) => void;
  setFlightOrigin: (v: string) => void;
  setTailNumber: (v: string) => void;
  setFboFacility: (v: string) => void;
  setHasCheckedLuggage: (v: boolean) => void;
  setOutboundFlightTelemetry: (v: FlightTelemetrySnapshot | null) => void;
  setReturnProvideFlightInfo: (v: boolean) => void;
  setReturnAirline: (v: string) => void;
  setReturnFlightNumber: (v: string) => void;
  setReturnFlightOrigin: (v: string) => void;
  setReturnTailNumber: (v: string) => void;
  setReturnFboFacility: (v: string) => void;
  setReturnHasCheckedLuggage: (v: boolean) => void;
}

export function applySavedDraftOverlayToDispatchState(
  parsed: Record<string, any>,
  s: DispatchHydrationSetters,
  universalExtrasConfig?: UniversalExtrasConfig,
  options?: {
    initialTrip?: Trip | null;
    driverExplicitlyChangedByUserRef?: React.MutableRefObject<boolean>;
  }
): void {
  if (parsed.timingType) s.setTimingType(parsed.timingType);
  if (parsed.scheduledDate) s.setScheduledDate(parsed.scheduledDate);
  if (parsed.scheduledTime) s.setScheduledTime(parsed.scheduledTime);
  if (parsed.pickupAddress !== undefined) s.setPickupAddress(parsed.pickupAddress);
  if (parsed.pickupCoordinates) s.setPickupCoordinates(parsed.pickupCoordinates);
  if (parsed.pickupPlaceId !== undefined) s.setPickupPlaceId(parsed.pickupPlaceId);
  if (parsed.dropoffAddress !== undefined) s.setDropoffAddress(parsed.dropoffAddress);
  if (parsed.dropoffCoordinates) s.setDropoffCoordinates(parsed.dropoffCoordinates);
  if (parsed.dropoffPlaceId !== undefined) s.setDropoffPlaceId(parsed.dropoffPlaceId);
  if (parsed.intermediateStops) s.setIntermediateStops(parsed.intermediateStops);
  if (parsed.passengerName !== undefined) s.setPassengerName(parsed.passengerName);
  if (parsed.phone !== undefined) s.setPhone(parsed.phone);
  if (parsed.email !== undefined) s.setEmail(parsed.email);
  if (parsed.additionalPassengers) s.setAdditionalPassengers(parsed.additionalPassengers);

  const cp = parsed.contactPerson;
  if (parsed.isBookerDifferent !== undefined || cp?.isBookerDifferent !== undefined) {
    s.setIsBookerDifferent(parsed.isBookerDifferent ?? cp?.isBookerDifferent);
  }
  if (parsed.contactName || cp?.contactName) s.setContactName(parsed.contactName || cp?.contactName);
  if (parsed.contactPhone || cp?.contactPhone) {
    s.setContactPhone(parsed.contactPhone || cp?.contactPhone);
  }
  if (parsed.contactEmail || cp?.contactEmail) {
    s.setContactEmail(parsed.contactEmail || cp?.contactEmail);
  }
  if (parsed.contactRole || cp?.contactRole) s.setContactRole(parsed.contactRole || cp?.contactRole);

  if (parsed.passengers) s.setPassengers(parsed.passengers);
  if (parsed.carryOnBags !== undefined || parsed.checkedBags !== undefined) {
    const c = Number(parsed.carryOnBags) || 0;
    const ch = Number(parsed.checkedBags) || 0;
    s.setCarryOnBags(c);
    s.setCheckedBags(ch);
    s.setBags(c + ch);
  } else if (parsed.bags !== undefined) {
    const b = Number(parsed.bags) || 0;
    s.setCarryOnBags(b);
    s.setCheckedBags(0);
    s.setBags(b);
  }
  if (parsed.hasOversizedLuggage !== undefined) {
    s.setHasOversizedLuggage(Boolean(parsed.hasOversizedLuggage));
  }
  if (parsed.oversizedBags && typeof parsed.oversizedBags === 'object') {
    s.setOversizedBags(parsed.oversizedBags);
    const totalOv = Object.values(parsed.oversizedBags).reduce(
      (sum: number, v: any) => sum + (Number(v) || 0),
      0
    );
    if (totalOv > 0) s.setHasOversizedLuggage(true);
  } else if (typeof parsed.oversizedBagsCount === 'number' && parsed.oversizedBagsCount > 0) {
    const defaultId = universalExtrasConfig?.oversizedBagsConfig?.[0]?.id || 'golf_bag';
    s.setOversizedBags({ [defaultId]: parsed.oversizedBagsCount });
    s.setHasOversizedLuggage(true);
  }
  if (parsed.oversizedLuggageNotes !== undefined) {
    s.setOversizedLuggageNotes(parsed.oversizedLuggageNotes || '');
  }
  if (parsed.specialRequestFlags && typeof parsed.specialRequestFlags === 'object') {
    s.setSpecialRequestFlags({
      petFriendly: Boolean(parsed.specialRequestFlags.petFriendly),
      quietRide: Boolean(parsed.specialRequestFlags.quietRide),
      musicOk: Boolean(parsed.specialRequestFlags.musicOk),
    });
    if (Object.values(parsed.specialRequestFlags).some(Boolean)) s.setShowSpecialRequests(true);
  }
  if (parsed.gateCode !== undefined) {
    s.setGateCode(parsed.gateCode || '');
    if (parsed.gateCode) s.setShowSpecialRequests(true);
  }
  if (parsed.selectedCustomExtras) s.setSelectedCustomExtras(parsed.selectedCustomExtras);
  if (parsed.carSeats !== undefined) s.setCarSeats(parsed.carSeats);

  const csb = parsed.carSeatsBreakdown;
  if (parsed.rearFacingCount !== undefined || csb?.rearFacing !== undefined) {
    s.setRearFacingCount(parsed.rearFacingCount ?? csb?.rearFacing ?? 0);
  }
  if (parsed.frontFacingCount !== undefined || csb?.frontFacing !== undefined) {
    s.setFrontFacingCount(parsed.frontFacingCount ?? csb?.frontFacing ?? 0);
  }
  if (parsed.boosterCount !== undefined || csb?.booster !== undefined) {
    s.setBoosterCount(parsed.boosterCount ?? csb?.booster ?? 0);
  }
  if (
    parsed.selectedVehicles &&
    Array.isArray(parsed.selectedVehicles) &&
    parsed.selectedVehicles.length > 0
  ) {
    s.setSelectedVehicles(parsed.selectedVehicles);
  }
  if (parsed.paymentMethod) s.setPaymentMethod(parsed.paymentMethod);

  const card = parsed.cardDetails;
  if (parsed.cardPaymentType || card?.cardPaymentType) {
    s.setCardPaymentType(parsed.cardPaymentType || card?.cardPaymentType);
  }
  if (parsed.cardholderName || card?.cardholderName) {
    s.setCardholderName(parsed.cardholderName || card?.cardholderName);
  }

  const corp = parsed.corporateDetails;
  if (parsed.corporateAccount || corp?.corporateAccount) {
    s.setCorporateAccount(parsed.corporateAccount || corp?.corporateAccount);
  }
  if (parsed.billingPo !== undefined || corp?.billingPo !== undefined) {
    s.setBillingPo(parsed.billingPo ?? corp?.billingPo ?? '');
  }
  if (parsed.authorizedBy !== undefined || corp?.authorizedBy !== undefined) {
    s.setAuthorizedBy(parsed.authorizedBy ?? corp?.authorizedBy ?? '');
  }
  if (parsed.invoicingTerms || corp?.invoicingTerms) {
    s.setInvoicingTerms(parsed.invoicingTerms || corp?.invoicingTerms);
  }
  if (parsed.tariff) s.setTariff(parsed.tariff);
  if (parsed.pricingRuleId !== undefined) s.setSelectedRuleId(parsed.pricingRuleId);
  if (parsed.discount) s.setDiscount(parsed.discount);
  if (parsed.manualDiscountDollars !== undefined) {
    s.setManualDiscountDollars(parsed.manualDiscountDollars);
  }
  if (parsed.waiveAirportFee !== undefined) s.setWaiveAirportFee(parsed.waiveAirportFee);
  if (parsed.waiveMultiStopFees !== undefined) s.setWaiveMultiStopFees(parsed.waiveMultiStopFees);
  if (parsed.bypassSurge !== undefined) s.setBypassSurge(parsed.bypassSurge);
  if (Array.isArray(parsed.waivedSurchargeIds)) {
    s.setWaivedSurchargeIds?.(parsed.waivedSurchargeIds);
  }
  if (Array.isArray(parsed.waivedExtraKeys)) {
    s.setWaivedExtraKeys?.(parsed.waivedExtraKeys);
  }
  if (parsed.company) s.setCompany(parsed.company);
  const hasLiveAssignedDriver = Boolean(options?.initialTrip?.assignedDriverId);
  const explicitlyUnassignedInDraft = parsed._explicitlyUnassigned === true;
  const explicitlyChangedDriverInDraft =
    parsed._explicitlyChangedDriver === true || explicitlyUnassignedInDraft;

  if (parsed.driverId) {
    const shouldBlockStaleDriverOverlay =
      hasLiveAssignedDriver &&
      ((parsed.driverId === 'unassigned' && !explicitlyUnassignedInDraft) ||
        (!explicitlyChangedDriverInDraft &&
          parsed.driverId !== options?.initialTrip?.assignedDriverId));

    if (!shouldBlockStaleDriverOverlay) {
      s.setDriverId(parsed.driverId);
      if (options?.driverExplicitlyChangedByUserRef && explicitlyChangedDriverInDraft) {
        options.driverExplicitlyChangedByUserRef.current = true;
      }
    }
  }
  if (
    parsed.driverAssignmentMode === 'stage_hold' ||
    parsed.driverAssignmentMode === 'send_to_driver'
  ) {
    const shouldBlockStaleStageOverlay =
      hasLiveAssignedDriver &&
      parsed.driverAssignmentMode === 'stage_hold' &&
      !explicitlyChangedDriverInDraft;
    if (!shouldBlockStaleStageOverlay) {
      s.setDriverAssignmentMode?.(parsed.driverAssignmentMode);
    }
  }
  if (parsed.notesForAll !== undefined) s.setNotesForAll(parsed.notesForAll);
  if (parsed.internalNotes !== undefined) s.setInternalNotes(parsed.internalNotes);
  if (parsed.sendEmailConfirmation !== undefined) {
    s.setSendEmailConfirmation(parsed.sendEmailConfirmation);
  }

  const ret = parsed.returnDetails;
  if (parsed.returnTrip !== undefined || ret?.returnTrip !== undefined) {
    s.setReturnTrip(parsed.returnTrip ?? ret?.returnTrip);
  }
  if (parsed.returnPickupAddress || ret?.returnPickupAddress) {
    s.setReturnPickupAddress(parsed.returnPickupAddress || ret?.returnPickupAddress);
  }
  if (parsed.returnPickupCoordinates || ret?.returnPickupCoordinates) {
    s.setReturnPickupCoordinates(parsed.returnPickupCoordinates || ret?.returnPickupCoordinates);
  }
  if (parsed.returnDropoffAddress || ret?.returnDropoffAddress) {
    s.setReturnDropoffAddress(parsed.returnDropoffAddress || ret?.returnDropoffAddress);
  }
  if (parsed.returnDropoffCoordinates || ret?.returnDropoffCoordinates) {
    s.setReturnDropoffCoordinates(parsed.returnDropoffCoordinates || ret?.returnDropoffCoordinates);
  }
  if (parsed.returnIntermediateStops || ret?.returnIntermediateStops) {
    s.setReturnIntermediateStops(parsed.returnIntermediateStops || ret?.returnIntermediateStops);
  }
  if (parsed.returnDate || ret?.returnDate) s.setReturnDate(parsed.returnDate || ret?.returnDate);
  if (parsed.returnTime || ret?.returnTime) s.setReturnTime(parsed.returnTime || ret?.returnTime);
  if (parsed.returnPassengers !== undefined || ret?.returnPassengers !== undefined) {
    s.setReturnPassengers(parsed.returnPassengers ?? ret?.returnPassengers);
  }
  if (parsed.returnCarryOnBags !== undefined || parsed.returnCheckedBags !== undefined) {
    const rc = Number(parsed.returnCarryOnBags) || 0;
    const rch = Number(parsed.returnCheckedBags) || 0;
    s.setReturnCarryOnBags(rc);
    s.setReturnCheckedBags(rch);
    s.setReturnBags(rc + rch);
  } else if (parsed.returnBags !== undefined || ret?.returnBags !== undefined) {
    const rb = Number(parsed.returnBags ?? ret?.returnBags) || 0;
    s.setReturnCarryOnBags(rb);
    s.setReturnCheckedBags(0);
    s.setReturnBags(rb);
  }
  if (parsed.returnHasOversizedLuggage !== undefined) {
    s.setReturnHasOversizedLuggage(Boolean(parsed.returnHasOversizedLuggage));
  }
  if (parsed.returnOversizedBags && typeof parsed.returnOversizedBags === 'object') {
    s.setReturnOversizedBags(parsed.returnOversizedBags);
    const totalRetOv = Object.values(parsed.returnOversizedBags).reduce(
      (sum: number, v: any) => sum + (Number(v) || 0),
      0
    );
    if (totalRetOv > 0) s.setReturnHasOversizedLuggage(true);
  }
  if (parsed.returnOversizedLuggageNotes !== undefined) {
    s.setReturnOversizedLuggageNotes(parsed.returnOversizedLuggageNotes || '');
  }
  if (parsed.returnCarSeats !== undefined || ret?.returnCarSeats !== undefined) {
    s.setReturnCarSeats(parsed.returnCarSeats ?? ret?.returnCarSeats);
  }
  if (
    parsed.returnRearFacing !== undefined ||
    ret?.returnCarSeatsBreakdown?.rearFacing !== undefined
  ) {
    s.setReturnRearFacing(parsed.returnRearFacing ?? ret?.returnCarSeatsBreakdown?.rearFacing ?? 0);
  }
  if (
    parsed.returnFrontFacing !== undefined ||
    ret?.returnCarSeatsBreakdown?.frontFacing !== undefined
  ) {
    s.setReturnFrontFacing(
      parsed.returnFrontFacing ?? ret?.returnCarSeatsBreakdown?.frontFacing ?? 0
    );
  }
  if (parsed.returnBooster !== undefined || ret?.returnCarSeatsBreakdown?.booster !== undefined) {
    s.setReturnBooster(parsed.returnBooster ?? ret?.returnCarSeatsBreakdown?.booster ?? 0);
  }
  if (parsed.returnVehicles || ret?.returnVehicles) {
    s.setReturnVehicles(parsed.returnVehicles || ret?.returnVehicles);
  }
  if (parsed.autoCreateReturnTrip !== undefined || ret?.autoCreateReturnTrip !== undefined) {
    s.setAutoCreateReturnTrip(parsed.autoCreateReturnTrip ?? ret?.autoCreateReturnTrip);
  }

  const rep = parsed.repeatDetails;
  if (parsed.repeat !== undefined || rep?.repeat !== undefined) {
    s.setRepeat(parsed.repeat ?? rep?.repeat);
  }
  if (parsed.repeatFrequency || rep?.repeatFrequency) {
    s.setRepeatFrequency(parsed.repeatFrequency || rep?.repeatFrequency);
  }
  if (parsed.repeatDays || rep?.repeatDays) s.setRepeatDays(parsed.repeatDays || rep?.repeatDays);
  if (parsed.repeatOccurrences || rep?.repeatOccurrences) {
    s.setRepeatOccurrences(parsed.repeatOccurrences || rep?.repeatOccurrences);
  }
  if (parsed.repeatUntilDate || rep?.repeatUntilDate) {
    s.setRepeatUntilDate(parsed.repeatUntilDate || rep?.repeatUntilDate);
  }
  if (parsed.repeatWeeksPattern || rep?.repeatWeeksPattern) {
    s.setRepeatWeeksPattern(parsed.repeatWeeksPattern || rep?.repeatWeeksPattern);
  }
  if (Array.isArray(parsed.repeatSkipDates) || Array.isArray(rep?.repeatSkipDates)) {
    s.setRepeatSkipDates?.(parsed.repeatSkipDates || rep?.repeatSkipDates || []);
  }
  if (parsed.estimatedFare) s.setEstimatedFare(parsed.estimatedFare);
  if (parsed.returnEstimatedFare) s.setReturnEstimatedFare(parsed.returnEstimatedFare);
  if (parsed.manualFare !== undefined) s.setManualFare(parsed.manualFare);
  if (parsed.isFareOverridden !== undefined) s.setIsFareOverridden(parsed.isFareOverridden);
  if (parsed.provideFlightInfo !== undefined) s.setProvideFlightInfo(parsed.provideFlightInfo);
  if (parsed.airline !== undefined) s.setAirline(parsed.airline);
  if (parsed.flightNumber !== undefined) s.setFlightNumber(parsed.flightNumber);
  if (parsed.flightOrigin !== undefined) s.setFlightOrigin(parsed.flightOrigin);
  if (parsed.tailNumber !== undefined) s.setTailNumber(parsed.tailNumber);
  if (parsed.fboFacility !== undefined) s.setFboFacility(parsed.fboFacility);
  if (parsed.hasCheckedLuggage !== undefined) s.setHasCheckedLuggage(parsed.hasCheckedLuggage);
  if (parsed.returnProvideFlightInfo !== undefined) {
    s.setReturnProvideFlightInfo(parsed.returnProvideFlightInfo);
  }
  if (parsed.returnAirline !== undefined) s.setReturnAirline(parsed.returnAirline);
  if (parsed.returnFlightNumber !== undefined) s.setReturnFlightNumber(parsed.returnFlightNumber);
  if (parsed.returnFlightOrigin !== undefined) s.setReturnFlightOrigin(parsed.returnFlightOrigin);
  if (parsed.returnTailNumber !== undefined) s.setReturnTailNumber(parsed.returnTailNumber);
  if (parsed.returnFboFacility !== undefined) s.setReturnFboFacility(parsed.returnFboFacility);
  if (parsed.returnHasCheckedLuggage !== undefined) {
    s.setReturnHasCheckedLuggage(parsed.returnHasCheckedLuggage);
  }
}

export function hydrateInitialTripIntoDispatchState(
  initialTrip: Trip,
  s: DispatchHydrationSetters,
  options: {
    universalExtrasConfig?: UniversalExtrasConfig;
    vehicleCapacities: Record<string, VehicleCapacityInfo>;
    dispatchVehicleOptions: DispatchVehicleOption[];
  }
): void {
  const { universalExtrasConfig, vehicleCapacities, dispatchVehicleOptions } = options;

  s.setTimingType(initialTrip.bookingType === 'scheduled' ? 'later' : 'asap');
  if (initialTrip.scheduledPickupTime) {
    try {
      const d = new Date(initialTrip.scheduledPickupTime);
      if (!isNaN(d.getTime())) {
        s.setScheduledDate(formatLocalDateStr(d));
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        s.setScheduledTime(`${hh}:${mm}`);
      }
    } catch {}
  }

  s.setPickupAddress(initialTrip.pickupLocation?.address || '');
  s.setPickupCoordinates(initialTrip.pickupLocation?.coordinates);
  s.setPickupPlaceId(initialTrip.pickupLocation?.placeId);
  s.setDropoffAddress(initialTrip.dropoffLocation?.address || '');
  s.setDropoffCoordinates(initialTrip.dropoffLocation?.coordinates);
  s.setDropoffPlaceId(initialTrip.dropoffLocation?.placeId);

  if (initialTrip.intermediateStops && initialTrip.intermediateStops.length > 0) {
    s.setIntermediateStops(
      initialTrip.intermediateStops.map((stop) => ({
        address: stop.address,
        coordinates: stop.coordinates,
        placeId: stop.placeId,
      }))
    );
  }

  s.setPassengerName(
    `${initialTrip.passenger?.firstName || ''} ${initialTrip.passenger?.lastName || ''}`.trim()
  );
  s.setPhone(initialTrip.passenger?.phone || '');
  s.setEmail(initialTrip.passenger?.email || '');

  s.setPassengers(initialTrip.passenger?.passengerCount || 1);
  const meta = (initialTrip.metadata || {}) as Record<string, any>;
  const initialTotalBags = initialTrip.passenger?.luggageCount || 0;
  if (typeof meta.carryOnBags === 'number' || typeof meta.checkedBags === 'number') {
    const initCarry = Number(meta.carryOnBags) || 0;
    const initChecked = Number(meta.checkedBags) || 0;
    s.setCarryOnBags(initCarry);
    s.setCheckedBags(initChecked);
    s.setBags(initCarry + initChecked);
  } else {
    s.setCarryOnBags(initialTotalBags);
    s.setCheckedBags(0);
    s.setBags(initialTotalBags);
  }

  if (meta.oversizedBags && typeof meta.oversizedBags === 'object') {
    const cleanMap: Record<string, number> = {};
    let totalOv = 0;
    for (const [k, v] of Object.entries(meta.oversizedBags)) {
      const n = Number(v) || 0;
      if (n > 0) {
        cleanMap[k] = n;
        totalOv += n;
      }
    }
    s.setOversizedBags(cleanMap);
    s.setHasOversizedLuggage(totalOv > 0 || Boolean(meta.hasOversizedLuggage));
  } else if (typeof meta.oversizedBagsCount === 'number' && meta.oversizedBagsCount > 0) {
    const firstId = universalExtrasConfig?.oversizedBagsConfig?.[0]?.id || 'golf_bag';
    s.setOversizedBags({ [firstId]: meta.oversizedBagsCount });
    s.setHasOversizedLuggage(true);
  } else if (meta.hasOversizedLuggage || meta.oversizedItemsSummary) {
    const firstId = universalExtrasConfig?.oversizedBagsConfig?.[0]?.id || 'golf_bag';
    s.setOversizedBags({ [firstId]: 1 });
    s.setHasOversizedLuggage(true);
  }
  if (typeof meta.oversizedLuggageNotes === 'string' && meta.oversizedLuggageNotes) {
    s.setOversizedLuggageNotes(meta.oversizedLuggageNotes);
    s.setHasOversizedLuggage(true);
  }

  const srLower = (initialTrip.passenger?.specialRequests || '').toLowerCase();
  const hydratedSr = {
    petFriendly: srLower.includes('pet-friendly') || srLower.includes('pet friendly'),
    quietRide: srLower.includes('quiet ride'),
    musicOk: srLower.includes('music ok'),
  };
  s.setSpecialRequestFlags(hydratedSr);
  if (typeof meta.gateCode === 'string' && meta.gateCode.trim()) {
    s.setGateCode(meta.gateCode.trim());
    s.setShowSpecialRequests(true);
  } else if (Object.values(hydratedSr).some(Boolean)) {
    s.setShowSpecialRequests(true);
  }

  if (meta.selectedCustomExtras && typeof meta.selectedCustomExtras === 'object') {
    s.setSelectedCustomExtras(meta.selectedCustomExtras);
  }

  const hasCarSeatReq = Boolean(
    initialTrip.passenger?.specialRequests?.toLowerCase().includes('car seat') ||
      (meta.carSeatsBreakdown &&
        (meta.carSeatsBreakdown.rearFacing || 0) +
          (meta.carSeatsBreakdown.frontFacing || 0) +
          (meta.carSeatsBreakdown.booster || 0) >
          0)
  );
  s.setCarSeats(hasCarSeatReq);
  if (meta.carSeatsBreakdown) {
    s.setRearFacingCount(meta.carSeatsBreakdown.rearFacing || 0);
    s.setFrontFacingCount(meta.carSeatsBreakdown.frontFacing || 0);
    s.setBoosterCount(meta.carSeatsBreakdown.booster || 0);
  } else if (hasCarSeatReq) {
    s.setRearFacingCount(1);
  }

  let initialVehicles: VehicleChoice[] = ['any'];
  if (
    meta.selectedVehicles &&
    Array.isArray(meta.selectedVehicles) &&
    meta.selectedVehicles.length > 0
  ) {
    initialVehicles = meta.selectedVehicles;
  } else if (meta.vehicleTypeId && typeof meta.vehicleTypeId === 'string') {
    initialVehicles = [meta.vehicleTypeId as VehicleChoice];
  } else if (initialTrip.vehicleTier && initialTrip.vehicleTier !== 'standard') {
    initialVehicles = [initialTrip.vehicleTier as VehicleChoice];
  } else if (initialTrip.vehicleTier === 'standard') {
    initialVehicles = ['standard'];
  }

  const initialPax = initialTrip.passenger?.passengerCount || 1;
  const initialCapacity = initialVehicles.reduce(
    (acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4),
    0
  );
  if (initialCapacity < initialPax) {
    const largerOpt = [...dispatchVehicleOptions]
      .filter((o) => o.key !== 'any')
      .sort((a, b) => a.maxPassengers - b.maxPassengers)
      .find((o) => o.maxPassengers >= initialPax);
    if (largerOpt) {
      initialVehicles = [largerOpt.key];
    } else {
      const biggest = [...dispatchVehicleOptions]
        .filter((o) => o.key !== 'any')
        .sort((a, b) => b.maxPassengers - a.maxPassengers)[0];
      const fallbackKey = biggest?.key || 'any';
      while (
        initialVehicles.reduce(
          (acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4),
          0
        ) < initialPax
      ) {
        initialVehicles.push(fallbackKey);
      }
    }
  }
  s.setSelectedVehicles(initialVehicles);

  if (initialTrip.payment?.method === 'card') s.setPaymentMethod('card');
  else if (
    initialTrip.payment?.method === 'corporate' ||
    initialTrip.payment?.method === 'account'
  ) {
    s.setPaymentMethod('account');
  } else s.setPaymentMethod('cash');

  if (meta.contactPerson) {
    s.setIsBookerDifferent(true);
    s.setContactName(meta.contactPerson.contactName || '');
    s.setContactPhone(meta.contactPerson.contactPhone || '');
    s.setContactEmail(meta.contactPerson.contactEmail || '');
    s.setContactRole(meta.contactPerson.contactRole || 'Hotel Front Desk / Concierge');
  }

  if (meta.additionalPassengers && Array.isArray(meta.additionalPassengers)) {
    s.setAdditionalPassengers(meta.additionalPassengers);
  }

  if (meta.cardDetails) {
    s.setCardPaymentType(meta.cardDetails.cardPaymentType || 'terminal');
    s.setCardholderName(meta.cardDetails.cardholderName || '');
    if (meta.cardDetails.cardLast4) s.setCardNumber(String(meta.cardDetails.cardLast4).slice(-4));
    if (meta.cardDetails.cardExp) s.setCardExp(meta.cardDetails.cardExp);
  }

  if (meta.corporateDetails) {
    s.setCorporateAccount(
      meta.corporateDetails.corporateAccount || DEFAULT_CORPORATE_ACCOUNTS[0]
    );
    s.setBillingPo(meta.corporateDetails.billingPo || '');
    s.setAuthorizedBy(meta.corporateDetails.authorizedBy || '');
    s.setInvoicingTerms(meta.corporateDetails.invoicingTerms || 'Net 30 Direct Bill');
  } else if (meta.corporateOrgName) {
    s.setCorporateAccount(meta.corporateOrgName);
  }

  if (initialTrip.assignedDriverId) {
    s.setDriverId(initialTrip.assignedDriverId);
    s.setDriverAssignmentMode?.('send_to_driver');
  } else if (initialTrip.plannedDriverId) {
    s.setDriverId(initialTrip.plannedDriverId);
    s.setDriverAssignmentMode?.('stage_hold');
  } else {
    s.setDriverId('unassigned');
    s.setDriverAssignmentMode?.('send_to_driver');
  }

  if (meta.pricingRuleId) s.setSelectedRuleId(meta.pricingRuleId);
  if (meta.tariff) s.setTariff(meta.tariff);
  if (meta.discount) s.setDiscount(meta.discount);
  if (meta.company) s.setCompany(meta.company);
  if (meta.internalNotes) s.setInternalNotes(meta.internalNotes);
  if (meta.waiveAirportFee !== undefined) s.setWaiveAirportFee(Boolean(meta.waiveAirportFee));
  if (meta.waiveMultiStopFees !== undefined) {
    s.setWaiveMultiStopFees(Boolean(meta.waiveMultiStopFees));
  }
  if (meta.bypassSurge !== undefined) s.setBypassSurge(Boolean(meta.bypassSurge));
  if (Array.isArray(meta.waivedSurchargeIds)) {
    s.setWaivedSurchargeIds?.(meta.waivedSurchargeIds);
  }
  if (Array.isArray(meta.waivedExtraKeys)) {
    s.setWaivedExtraKeys?.(meta.waivedExtraKeys);
  }
  if (meta.manualDiscountDollars) s.setManualDiscountDollars(String(meta.manualDiscountDollars));

  if (initialTrip.driverNotes) {
    s.setNotesForAll(initialTrip.driverNotes);
  }

  if (initialTrip.pricing) {
    s.setOutboundPricing(initialTrip.pricing);
    if (initialTrip.pricing.totalFare) {
      s.setEstimatedFare(initialTrip.pricing.totalFare);
    }
    if (initialTrip.pricing.distanceMiles) {
      s.setEstimatedDistanceMiles(initialTrip.pricing.distanceMiles);
    }
    if (initialTrip.pricing.durationMinutes) {
      s.setEstimatedDurationMinutes(initialTrip.pricing.durationMinutes);
    }
  }

  const hasFlightInfo = Boolean(
    meta.provideFlightInfo ||
      meta.airline ||
      meta.airlineName ||
      meta.flightNumber ||
      meta.tailNumber ||
      meta.fboFacility ||
      meta.isAirportTrip ||
      (initialTrip as any).flightDetails?.airlineName ||
      (initialTrip as any).flightDetails?.flightNumber ||
      (initialTrip as any).flightDetails?.tailNumber
  );
  s.setProvideFlightInfo(hasFlightInfo);
  s.setAirline(
    meta.airline || meta.airlineName || (initialTrip as any).flightDetails?.airlineName || ''
  );
  s.setFlightNumber(
    meta.flightNumber || (initialTrip as any).flightDetails?.flightNumber || ''
  );
  s.setFlightOrigin(
    meta.flightOrigin ||
      meta.departureAirport ||
      (initialTrip as any).flightDetails?.departureAirport ||
      ''
  );
  s.setTailNumber(meta.tailNumber || (initialTrip as any).flightDetails?.tailNumber || '');
  s.setFboFacility(meta.fboFacility || (initialTrip as any).flightDetails?.fboFacility || '');
  s.setHasCheckedLuggage(
    Boolean(meta.hasCheckedLuggage || (initialTrip as any).flightDetails?.hasCheckedLuggage)
  );
  s.setOutboundFlightTelemetry(initialTrip.flightTelemetry || null);

  const returnMeta = (meta.returnTripDetails || meta.returnFlightDetails || {}) as Record<
    string,
    any
  >;
  const hasReturnFlightInfo = Boolean(
    meta.returnProvideFlightInfo ||
      returnMeta.provideFlightInfo ||
      meta.returnAirline ||
      meta.returnFlightNumber ||
      meta.returnTailNumber ||
      returnMeta.airline ||
      returnMeta.flightDetails?.airlineName ||
      returnMeta.flightDetails?.flightNumber ||
      returnMeta.flightDetails?.tailNumber
  );
  s.setReturnProvideFlightInfo(hasReturnFlightInfo);
  s.setReturnAirline(
    meta.returnAirline || returnMeta.airline || returnMeta.flightDetails?.airlineName || ''
  );
  s.setReturnFlightNumber(
    meta.returnFlightNumber ||
      returnMeta.flightNumber ||
      returnMeta.flightDetails?.flightNumber ||
      ''
  );
  s.setReturnFlightOrigin(
    meta.returnFlightOrigin ||
      returnMeta.flightOrigin ||
      returnMeta.departureAirport ||
      returnMeta.flightDetails?.departureAirport ||
      ''
  );
  s.setReturnTailNumber(
    meta.returnTailNumber || returnMeta.tailNumber || returnMeta.flightDetails?.tailNumber || ''
  );
  s.setReturnFboFacility(
    meta.returnFboFacility || returnMeta.fboFacility || returnMeta.flightDetails?.fboFacility || ''
  );
  s.setReturnHasCheckedLuggage(
    Boolean(
      meta.returnHasCheckedLuggage ||
        returnMeta.hasCheckedLuggage ||
        returnMeta.flightDetails?.hasCheckedLuggage
    )
  );
}

export interface UseDispatchBookingSubmissionParams {
  isEditMode: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
  initialTrip?: Trip | null;
  draftStorageKey: string;
  timingType: 'asap' | 'later';
  scheduledDate: string;
  scheduledTime: string;
  pickupAddress: string;
  pickupCoordinates?: GeoPoint;
  pickupPlaceId?: string;
  dropoffAddress: string;
  dropoffCoordinates?: GeoPoint;
  dropoffPlaceId?: string;
  intermediateStops: Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>;
  passengerName: string;
  phone: string;
  email: string;
  additionalPassengers: AdditionalPassenger[];
  isBookerDifferent: boolean;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  contactRole: string;
  passengers: number;
  carryOnBags: number;
  checkedBags: number;
  bags: number;
  hasOversizedLuggage: boolean;
  oversizedBagsPayload: Record<string, number> | undefined;
  totalOversizedCount: number;
  oversizedLuggageNotes: string;
  oversizedItemsSummary: string | undefined;
  specialRequestFlags: { petFriendly: boolean; quietRide: boolean; musicOk: boolean };
  gateCode: string;
  selectedCustomExtras: Record<string, number>;
  carSeats: boolean;
  rearFacingCount: number;
  frontFacingCount: number;
  boosterCount: number;
  selectedVehicles: Array<VehicleChoice>;
  paymentMethod: 'cash' | 'card' | 'account';
  cardPaymentType: 'terminal' | 'payment_link' | 'card_on_file' | 'manual';
  cardholderName: string;
  cardNumber: string;
  cardExp: string;
  saveCardOnFile: boolean;
  corporateAccount: string;
  corporateAccountList: CorporateAccountConfig[];
  matchedCorporateAccount: CorporateAccountConfig | null;
  billingPo: string;
  allowPoOverride: boolean;
  enteredBookingPin?: string;
  authorizedBy: string;
  invoicingTerms: string;
  sendEmailConfirmation: boolean;
  tariff: string;
  selectedRuleId: string;
  availableNamedRules: NamedPricingRule[];
  universalExtrasConfig: UniversalExtrasConfig;
  surchargesVersion: number;
  discount: string;
  manualDiscountDollars: string;
  effectiveDiscountInputs: { pct: number; label: string | undefined; flatDollars: number };
  waiveAirportFee: boolean;
  waiveMultiStopFees: boolean;
  bypassSurge: boolean;
  waivedSurchargeIds?: string[];
  waivedExtraKeys?: string[];
  company: string;
  driverId: string;
  driverAssignmentMode?: 'send_to_driver' | 'stage_hold';
  driverExplicitlyChangedByUserRef?: React.MutableRefObject<boolean>;
  driverOptions: DriverRosterItem[];
  notesForAll: string;
  internalNotes: string;
  returnTrip: boolean;
  returnPickupAddress: string;
  returnPickupCoordinates?: GeoPoint;
  returnPickupPlaceId?: string;
  returnDropoffAddress: string;
  returnDropoffCoordinates?: GeoPoint;
  returnDropoffPlaceId?: string;
  returnIntermediateStops: Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>;
  returnDate: string;
  returnTime: string;
  returnPassengers: number;
  returnCarryOnBags: number;
  returnCheckedBags: number;
  returnBags: number;
  returnHasOversizedLuggage: boolean;
  returnOversizedBagsPayload: Record<string, number> | undefined;
  returnTotalOversizedCount: number;
  returnOversizedLuggageNotes: string;
  returnOversizedItemsSummary: string | undefined;
  returnCarSeats: boolean;
  returnRearFacing: number;
  returnFrontFacing: number;
  returnBooster: number;
  returnVehicles: Array<VehicleChoice>;
  autoCreateReturnTrip: boolean;
  repeat: boolean;
  repeatFrequency: 'daily' | 'weekdays' | 'weekly' | 'custom';
  repeatDays: string[];
  repeatOccurrences: number;
  repeatUntilDate: string;
  repeatWeeksPattern: 'all' | 'odd' | 'even';
  repeatSkipDates?: string[];
  manualFare: string;
  isFareOverridden: boolean;
  isSymmetricRoundTrip: boolean;
  provideFlightInfo: boolean;
  airline: string;
  flightNumber: string;
  flightOrigin: string;
  tailNumber: string;
  fboFacility: string;
  hasCheckedLuggage: boolean;
  outboundFlightTelemetry: FlightTelemetrySnapshot | null;
  returnProvideFlightInfo: boolean;
  returnAirline: string;
  returnFlightNumber: string;
  returnFlightOrigin: string;
  returnTailNumber: string;
  returnFboFacility: string;
  returnHasCheckedLuggage: boolean;
  returnFlightTelemetry: FlightTelemetrySnapshot | null;
  airportDetection: AirportDetectionResult;
  returnAirportDetection: AirportDetectionResult;
  activeAdminVehicleIds: string[];
  dispatchVehicleOptions: DispatchVehicleOption[];
  vehicleCapacities: Record<string, VehicleCapacityInfo>;
  validateDispatchAccount: typeof validateDispatchCorporateSubmission;
  allTrips?: ReadonlyArray<Trip>;
  onResetAfterCreate?: () => void;
  onBookingSuccess?: (trip: Trip, isEdit: boolean) => void;
}

export function useDispatchBookingSubmission(params: UseDispatchBookingSubmissionParams) {
  const {
    isEditMode,
    isCompleted,
    isCancelled,
    initialTrip,
    draftStorageKey,
    timingType,
    scheduledDate,
    scheduledTime,
    pickupAddress,
    pickupCoordinates,
    pickupPlaceId,
    dropoffAddress,
    dropoffCoordinates,
    dropoffPlaceId,
    intermediateStops,
    passengerName,
    phone,
    email,
    additionalPassengers,
    isBookerDifferent,
    contactName,
    contactPhone,
    contactEmail,
    contactRole,
    passengers,
    carryOnBags,
    checkedBags,
    bags,
    hasOversizedLuggage,
    oversizedBagsPayload,
    totalOversizedCount,
    oversizedLuggageNotes,
    oversizedItemsSummary,
    specialRequestFlags,
    gateCode,
    selectedCustomExtras,
    carSeats,
    rearFacingCount,
    frontFacingCount,
    boosterCount,
    selectedVehicles,
    paymentMethod,
    cardPaymentType,
    cardholderName,
    cardNumber,
    cardExp,
    saveCardOnFile,
    corporateAccount,
    corporateAccountList,
    matchedCorporateAccount,
    billingPo,
    allowPoOverride,
    enteredBookingPin,
    authorizedBy,
    invoicingTerms,
    sendEmailConfirmation,
    tariff,
    selectedRuleId,
    availableNamedRules,
    universalExtrasConfig,
    surchargesVersion,
    discount,
    manualDiscountDollars,
    effectiveDiscountInputs,
    waiveAirportFee,
    waiveMultiStopFees,
    bypassSurge,
    waivedSurchargeIds = [],
    waivedExtraKeys = [],
    company,
    driverId,
    driverAssignmentMode = 'send_to_driver',
    driverExplicitlyChangedByUserRef,
    driverOptions,
    notesForAll,
    internalNotes,
    returnTrip,
    returnPickupAddress,
    returnPickupCoordinates,
    returnPickupPlaceId,
    returnDropoffAddress,
    returnDropoffCoordinates,
    returnDropoffPlaceId,
    returnIntermediateStops,
    returnDate,
    returnTime,
    returnPassengers,
    returnCarryOnBags,
    returnCheckedBags,
    returnBags,
    returnHasOversizedLuggage,
    returnOversizedBagsPayload,
    returnTotalOversizedCount,
    returnOversizedLuggageNotes,
    returnOversizedItemsSummary,
    returnCarSeats,
    returnRearFacing,
    returnFrontFacing,
    returnBooster,
    returnVehicles,
    autoCreateReturnTrip,
    repeat,
    repeatFrequency,
    repeatDays,
    repeatOccurrences,
    repeatUntilDate,
    repeatWeeksPattern,
    repeatSkipDates = [],
    manualFare,
    isFareOverridden,
    isSymmetricRoundTrip,
    provideFlightInfo,
    airline,
    flightNumber,
    flightOrigin,
    tailNumber,
    fboFacility,
    hasCheckedLuggage,
    outboundFlightTelemetry,
    returnProvideFlightInfo,
    returnAirline,
    returnFlightNumber,
    returnFlightOrigin,
    returnTailNumber,
    returnFboFacility,
    returnHasCheckedLuggage,
    returnFlightTelemetry,
    airportDetection,
    returnAirportDetection,
    activeAdminVehicleIds,
    dispatchVehicleOptions,
    vehicleCapacities,
    validateDispatchAccount,
    allTrips,
    onResetAfterCreate,
    onBookingSuccess,
  } = params;

  const [estimatedFare, setEstimatedFare] = useState(0);
  const [outboundPricing, setOutboundPricing] = useState<TripPricing | null>(null);
  const [returnPricing, setReturnPricing] = useState<TripPricing | null>(null);
  const [vehicleQuotes, setVehicleQuotes] = useState<Record<string, TripPricing>>({});
  const [returnVehicleQuotes, setReturnVehicleQuotes] = useState<Record<string, TripPricing>>({});
  const [isQuoting, setIsQuoting] = useState(false);
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(0);
  const [estimatedDistanceMiles, setEstimatedDistanceMiles] = useState(0);
  const [returnEstimatedDurationMinutes, setReturnEstimatedDurationMinutes] = useState(0);
  const [returnEstimatedDistanceMiles, setReturnEstimatedDistanceMiles] = useState(0);
  const [returnEstimatedFare, setReturnEstimatedFare] = useState(0);

  const skipFirstEditQuoteRef = useRef<boolean>(Boolean(initialTrip));
  const submitErrorRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isConflictPromptOpen, setIsConflictPromptOpen] = useState(false);
  const [liveAppSettings, setLiveAppSettings] = useState(() =>
    getAdminConfigService().getCachedSettings()
  );

  useEffect(() => {
    const unsub = getAdminConfigService().subscribeToSettings((s) => {
      setLiveAppSettings(s);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const dispatchConsoleConfig = useMemo(
    () =>
      normalizeDispatchConsoleConfig(
        liveAppSettings.dispatchConsoleConfig,
        liveAppSettings.enableRealtimeRouting
      ),
    [liveAppSettings.dispatchConsoleConfig, liveAppSettings.enableRealtimeRouting]
  );

  const standingOrdersConfig = useMemo(
    () => normalizeStandingOrdersConfig(liveAppSettings.standingOrdersConfig),
    [liveAppSettings.standingOrdersConfig]
  );

  const driverAppConfig = useMemo(
    () => normalizeDriverAppPoliciesConfig(liveAppSettings.driverAppConfig, universalExtrasConfig),
    [liveAppSettings.driverAppConfig, universalExtrasConfig]
  );

  const bookingConflictSummary: BookingConflictCheckSummary = useMemo(
    () =>
      evaluateDispatchBookingConflicts({
        timingType,
        scheduledDate,
        scheduledTime,
        pickupAddress,
        dropoffAddress,
        estimatedDurationMinutes,
        passengerName,
        phone,
        email,
        driverId,
        driverAssignmentMode,
        drivers: driverOptions,
        returnTrip,
        autoCreateReturnTrip,
        returnDate,
        returnTime,
        returnPickupAddress,
        returnDropoffAddress,
        returnEstimatedDurationMinutes,
        allTrips: allTrips || [],
        excludeTripId: isEditMode ? initialTrip?.id : null,
        excludeMultiCarGroupId: isEditMode ? initialTrip?.multiCarGroupId : null,
        conflictConfig: dispatchConsoleConfig,
      }),
    [
      timingType,
      scheduledDate,
      scheduledTime,
      pickupAddress,
      dropoffAddress,
      estimatedDurationMinutes,
      passengerName,
      phone,
      email,
      driverId,
      driverAssignmentMode,
      driverOptions,
      returnTrip,
      autoCreateReturnTrip,
      returnDate,
      returnTime,
      returnPickupAddress,
      returnDropoffAddress,
      returnEstimatedDurationMinutes,
      allTrips,
      isEditMode,
      initialTrip?.id,
      initialTrip?.multiCarGroupId,
      dispatchConsoleConfig,
    ]
  );

  useEffect(() => {
    if (submitError && submitErrorRef.current) {
      submitErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [submitError]);

  // Unified 4-Pillar Live Route & Pricing Calculation (Outbound via bookingService.calculateQuote)
  useEffect(() => {
    if (!pickupAddress.trim() || !dropoffAddress.trim()) {
      if (!isFareOverridden && !isEditMode) {
        setEstimatedFare(0);
        setOutboundPricing(null);
        setVehicleQuotes({});
      }
      if (!isEditMode) {
        setEstimatedDistanceMiles(0);
        setEstimatedDurationMinutes(0);
      }
      return;
    }

    if (skipFirstEditQuoteRef.current) {
      skipFirstEditQuoteRef.current = false;
      return;
    }

    let isMounted = true;
    setIsQuoting(true);

    const timer = setTimeout(async () => {
      try {
        const bookingService = getBookingService();
        const primaryVehicleId = resolveVehicleEngineId(
          selectedVehicles[0] || 'any',
          activeAdminVehicleIds
        );

        const scheduledIso =
          timingType === 'later' && scheduledDate && scheduledTime
            ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
            : undefined;

        const vehicleCount = Math.max(1, selectedVehicles.length);
        const perVehiclePax = vehicleCount > 1 ? Math.ceil(passengers / vehicleCount) : passengers;

        const quoteRes = await bookingService.calculateQuote({
          pickupLocation: {
            address: pickupAddress,
            coordinates: pickupCoordinates,
            placeId: pickupPlaceId,
          },
          dropoffLocation: {
            address: dropoffAddress,
            coordinates: dropoffCoordinates,
            placeId: dropoffPlaceId,
          },
          intermediateStops: intermediateStops
            .filter((s) => s.address.trim())
            .map((s) => ({ address: s.address, coordinates: s.coordinates, placeId: s.placeId })),
          vehicleTier: primaryVehicleId,
          vehicleType: primaryVehicleId,
          evaluateAllVehicleIds: activeAdminVehicleIds,
          bookingType: timingType === 'later' ? 'scheduled' : 'asap',
          scheduledPickupTime: scheduledIso,
          passengerCount: perVehiclePax,
          luggageCount: bags,
          carSeatsBreakdown: carSeats
            ? {
                rearFacing: rearFacingCount,
                frontFacing: frontFacingCount,
                booster: boosterCount,
                total: rearFacingCount + frontFacingCount + boosterCount,
              }
            : undefined,
          oversizedBags: oversizedBagsPayload,
          selectedCustomExtras,
          corporateAccountId: matchedCorporateAccount?.id,
          accountType: paymentMethod === 'account' ? 'corporate' : 'retail',
          selectedRuleId: selectedRuleId || undefined,
          manualDiscountPercent: effectiveDiscountInputs.pct || undefined,
          manualDiscount: effectiveDiscountInputs.flatDollars || undefined,
          manualDiscountLabel: effectiveDiscountInputs.label,
          waiveAirportFee,
          waiveMultiStopFees,
          bypassSurge,
          waivedSurchargeIds,
          waivedExtraKeys,
          isAirportPickup: airportDetection.isPickupAirport,
          isAirportDropoff: airportDetection.isDropoffAirport,
          isAirportTrip: airportDetection.isAirportTrip,
        });

        if (!isMounted || !quoteRes) return;

        setEstimatedDistanceMiles(quoteRes.estimatedDistanceMiles);
        setEstimatedDurationMinutes(quoteRes.estimatedDurationMinutes);
        setVehicleQuotes(quoteRes.vehicleQuotes || {});

        if (!isFareOverridden) {
          if (selectedVehicles.length <= 1) {
            setOutboundPricing(quoteRes.pricing);
            setEstimatedFare(quoteRes.pricing.totalFare);
          } else {
            let combinedTotal = quoteRes.pricing.totalFare;
            const singleBaseExtras =
              (quoteRes.pricing.carSeatFee || 0) +
              (quoteRes.pricing.oversizedLuggageFee || 0) +
              (quoteRes.pricing.customExtrasFee || 0);
            for (let i = 1; i < selectedVehicles.length; i++) {
              const vId = resolveVehicleEngineId(selectedVehicles[i], activeAdminVehicleIds);
              const vPricing = quoteRes.vehicleQuotes?.[vId] || quoteRes.pricing;
              combinedTotal += Math.max(0, vPricing.totalFare - singleBaseExtras);
            }
            setOutboundPricing({
              ...quoteRes.pricing,
              totalFare: Math.ceil(combinedTotal),
              subtotal: Math.ceil(combinedTotal),
            });
            setEstimatedFare(Math.ceil(combinedTotal));
          }
        }
      } catch (e) {
        console.warn('[DispatchBookingEngine] Unified quote calculation failed:', e);
      } finally {
        if (isMounted) setIsQuoting(false);
      }
    }, 550);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [
    pickupAddress,
    pickupCoordinates,
    pickupPlaceId,
    dropoffAddress,
    dropoffCoordinates,
    dropoffPlaceId,
    intermediateStops,
    selectedVehicles,
    activeAdminVehicleIds,
    timingType,
    scheduledDate,
    scheduledTime,
    isFareOverridden,
    isEditMode,
    carSeats,
    rearFacingCount,
    frontFacingCount,
    boosterCount,
    passengers,
    carryOnBags,
    checkedBags,
    bags,
    oversizedBagsPayload,
    selectedCustomExtras,
    paymentMethod,
    matchedCorporateAccount?.id,
    selectedRuleId,
    effectiveDiscountInputs.pct,
    effectiveDiscountInputs.flatDollars,
    effectiveDiscountInputs.label,
    waiveAirportFee,
    waiveMultiStopFees,
    bypassSurge,
    JSON.stringify(waivedSurchargeIds),
    JSON.stringify(waivedExtraKeys),
    availableNamedRules,
    universalExtrasConfig,
    surchargesVersion,
    airportDetection.isPickupAirport,
    airportDetection.isDropoffAirport,
    airportDetection.isAirportTrip,
  ]);

  // Unified 4-Pillar Return Route & Return Fare Calculation
  useEffect(() => {
    if (!returnTrip) {
      setReturnEstimatedDistanceMiles(0);
      setReturnEstimatedDurationMinutes(0);
      setReturnEstimatedFare(0);
      setReturnPricing(null);
      setReturnVehicleQuotes({});
      return;
    }

    const retPickupAddr = (returnPickupAddress || dropoffAddress).trim();
    const retDropoffAddr = (returnDropoffAddress || pickupAddress).trim();
    if (!retPickupAddr || !retDropoffAddr) {
      setReturnEstimatedDistanceMiles(0);
      setReturnEstimatedDurationMinutes(0);
      setReturnEstimatedFare(0);
      setReturnPricing(null);
      return;
    }

    let isMounted = true;

    const timer = setTimeout(async () => {
      try {
        const bookingService = getBookingService();
        const primaryReturnId = resolveVehicleEngineId(
          returnVehicles[0] || 'any',
          activeAdminVehicleIds
        );

        const returnScheduledIso =
          returnDate && returnTime
            ? new Date(`${returnDate}T${returnTime}:00`).toISOString()
            : undefined;

        const retCount = Math.max(1, returnVehicles.length);
        const perVehReturnPax =
          retCount > 1 ? Math.ceil(returnPassengers / retCount) : returnPassengers;

        const retQuote = await bookingService.calculateQuote({
          pickupLocation: {
            address: retPickupAddr,
            coordinates: returnPickupCoordinates || dropoffCoordinates,
            placeId: returnPickupPlaceId || dropoffPlaceId,
          },
          dropoffLocation: {
            address: retDropoffAddr,
            coordinates: returnDropoffCoordinates || pickupCoordinates,
            placeId: returnDropoffPlaceId || pickupPlaceId,
          },
          intermediateStops: returnIntermediateStops
            .filter((s) => s.address.trim())
            .map((s) => ({ address: s.address, coordinates: s.coordinates, placeId: s.placeId })),
          vehicleTier: primaryReturnId,
          vehicleType: primaryReturnId,
          evaluateAllVehicleIds: activeAdminVehicleIds,
          bookingType: 'scheduled',
          scheduledPickupTime: returnScheduledIso,
          passengerCount: perVehReturnPax,
          luggageCount: returnBags,
          carSeatsBreakdown: returnCarSeats
            ? {
                rearFacing: returnRearFacing,
                frontFacing: returnFrontFacing,
                booster: returnBooster,
                total: returnRearFacing + returnFrontFacing + returnBooster,
              }
            : undefined,
          oversizedBags: returnOversizedBagsPayload,
          selectedCustomExtras,
          corporateAccountId: matchedCorporateAccount?.id,
          accountType: paymentMethod === 'account' ? 'corporate' : 'retail',
          selectedRuleId: selectedRuleId || undefined,
          manualDiscountPercent: effectiveDiscountInputs.pct || undefined,
          manualDiscount: effectiveDiscountInputs.flatDollars || undefined,
          manualDiscountLabel: effectiveDiscountInputs.label,
          waiveAirportFee,
          waiveMultiStopFees,
          bypassSurge,
          waivedSurchargeIds,
          waivedExtraKeys,
          isAirportPickup: returnAirportDetection.isPickupAirport,
          isAirportDropoff: returnAirportDetection.isDropoffAirport,
          isAirportTrip: returnAirportDetection.isAirportTrip,
        });

        if (!isMounted || !retQuote) return;

        setReturnEstimatedDistanceMiles(retQuote.estimatedDistanceMiles);
        setReturnEstimatedDurationMinutes(retQuote.estimatedDurationMinutes);
        setReturnVehicleQuotes(retQuote.vehicleQuotes || {});

        if (returnVehicles.length <= 1) {
          setReturnPricing(retQuote.pricing);
          setReturnEstimatedFare(retQuote.pricing.totalFare);
        } else {
          let retCombined = retQuote.pricing.totalFare;
          const singleExtras =
            (retQuote.pricing.carSeatFee || 0) +
            (retQuote.pricing.oversizedLuggageFee || 0) +
            (retQuote.pricing.customExtrasFee || 0);
          for (let i = 1; i < returnVehicles.length; i++) {
            const vId = resolveVehicleEngineId(returnVehicles[i], activeAdminVehicleIds);
            const vPricing = retQuote.vehicleQuotes?.[vId] || retQuote.pricing;
            retCombined += Math.max(0, vPricing.totalFare - singleExtras);
          }
          setReturnPricing({
            ...retQuote.pricing,
            totalFare: Math.ceil(retCombined),
            subtotal: Math.ceil(retCombined),
          });
          setReturnEstimatedFare(Math.ceil(retCombined));
        }
      } catch (e) {
        console.warn('[DispatchBookingEngine] Unified return quote failed:', e);
      }
    }, 650);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [
    returnTrip,
    returnPickupAddress,
    returnPickupCoordinates,
    returnPickupPlaceId,
    returnDropoffAddress,
    returnDropoffCoordinates,
    returnDropoffPlaceId,
    returnIntermediateStops,
    returnVehicles,
    activeAdminVehicleIds,
    returnDate,
    returnTime,
    pickupAddress,
    pickupCoordinates,
    pickupPlaceId,
    dropoffAddress,
    dropoffCoordinates,
    dropoffPlaceId,
    returnCarSeats,
    returnRearFacing,
    returnFrontFacing,
    returnBooster,
    returnPassengers,
    returnBags,
    returnOversizedBagsPayload,
    selectedCustomExtras,
    paymentMethod,
    matchedCorporateAccount?.id,
    selectedRuleId,
    effectiveDiscountInputs.pct,
    effectiveDiscountInputs.flatDollars,
    effectiveDiscountInputs.label,
    waiveAirportFee,
    waiveMultiStopFees,
    bypassSurge,
    JSON.stringify(waivedSurchargeIds),
    JSON.stringify(waivedExtraKeys),
    availableNamedRules,
    universalExtrasConfig,
    surchargesVersion,
    returnAirportDetection.isPickupAirport,
    returnAirportDetection.isDropoffAirport,
    returnAirportDetection.isAirportTrip,
  ]);

  const executeBookingSubmission = async (allowConflictOverride: boolean) => {
    setSubmitError(null);

    if (!pickupAddress.trim()) {
      setSubmitError('Please enter a pickup address.');
      return;
    }
    if (!dropoffAddress.trim()) {
      setSubmitError('Please enter a dropoff address.');
      return;
    }
    if (!passengerName.trim()) {
      setSubmitError('Please enter passenger name.');
      return;
    }
    if (!phone.trim()) {
      setSubmitError('Please enter passenger phone number.');
      return;
    }

    if (paymentMethod === 'account') {
      const projectedFare =
        isFareOverridden && manualFare
          ? Math.max(0, Math.ceil(parseFloat(manualFare) || 0))
          : returnTrip
          ? Math.ceil(estimatedFare) + Math.ceil(returnEstimatedFare || estimatedFare)
          : Math.ceil(estimatedFare);
      const corpValidation = await validateDispatchAccount({
        corporateAccountList,
        corporateAccount,
        billingPo,
        allowPoOverride,
        projectedFare,
        enteredBookingPin,
      });
      if (!corpValidation.valid) {
        setSubmitError(corpValidation.error);
        return;
      }
    }

    if (!allowConflictOverride && bookingConflictSummary.hasConflicts) {
      setIsConflictPromptOpen(true);
      return;
    }

    setIsConflictPromptOpen(false);
    setIsSubmitting(true);
    const service = getBookingService();

    const primaryVehicle = selectedVehicles[0] || 'any';
    const tier: VehicleTier = resolveVehicleEngineId(primaryVehicle, activeAdminVehicleIds);
    const primaryVehicleOpt = dispatchVehicleOptions.find(
      (o) => o.key === primaryVehicle || o.key === tier
    );
    const primaryVehicleDisplayName =
      primaryVehicle === 'any' ? 'Any' : primaryVehicleOpt?.label || String(tier);

    let method: PaymentMethod = 'cash';
    if (paymentMethod === 'card') method = 'card';
    if (paymentMethod === 'account') method = 'corporate';

    const { outboundFare, returnLegFare } = computeDispatchRoundTripFares({
      returnTrip,
      autoCreateReturnTrip,
      forSubmission: true,
      isSymmetric: isSymmetricRoundTrip,
      estimatedFare,
      returnEstimatedFare,
      isFareOverridden,
      manualFare,
    });
    const finalFare = outboundFare;

    const persistedOutboundPricing = buildPersistedPricing(
      outboundPricing,
      finalFare,
      estimatedDistanceMiles,
      estimatedDurationMinutes,
      Boolean(isFareOverridden && manualFare)
    );

    const customExtrasSummary = formatCustomExtrasSummary(
      selectedCustomExtras,
      universalExtrasConfig?.customExtras,
      { alwaysPrefixQty: true, emptyAsUndefined: true }
    );

    const names = passengerName.trim().split(/\s+/);
    const firstName = names[0] || 'Guest';
    const lastName = names.slice(1).join(' ') || 'Passenger';

    let scheduledPickupTime: string | undefined = undefined;
    if (timingType === 'later' && scheduledDate && scheduledTime) {
      scheduledPickupTime = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
    }

    const carSeatLabel = formatCarSeatSummaryLabel(carSeats, {
      rearFacing: rearFacingCount,
      frontFacing: frontFacingCount,
      booster: boosterCount,
    });

    const activeSpecialRequestLabels = [
      specialRequestFlags.petFriendly ? 'Pet-Friendly' : null,
      specialRequestFlags.quietRide ? 'Quiet Ride' : null,
      specialRequestFlags.musicOk ? 'Music OK' : null,
    ].filter(Boolean) as string[];

    const specialRequestSections = [
      activeSpecialRequestLabels.length > 0 ? activeSpecialRequestLabels.join(', ') : null,
      carSeatLabel || null,
    ].filter(Boolean);

    const specialRequests =
      specialRequestSections.length > 0 ? specialRequestSections.join(' · ') : undefined;

    const outboundFlightNotes = formatDispatchFlightNotesTag({
      enabled: provideFlightInfo,
      isPrivateAviation: airportDetection.isPrivateAviation,
      isReturn: false,
      airline,
      flightNumber,
      flightOrigin,
      tailNumber,
      fboFacility,
      hasCheckedLuggage,
    });

    const returnLegFlightNotes = formatDispatchFlightNotesTag({
      enabled: returnProvideFlightInfo,
      isPrivateAviation: returnAirportDetection.isPrivateAviation,
      isReturn: true,
      airline: returnAirline,
      flightNumber: returnFlightNumber,
      flightOrigin: returnFlightOrigin,
      tailNumber: returnTailNumber,
      fboFacility: returnFboFacility,
      hasCheckedLuggage: returnHasCheckedLuggage,
    });

    const clientDriverPrefsMeta = resolveTripClientDriverPreferencesMetadata(phone, email);

    const metadataPayload = {
      ...clientDriverPrefsMeta,
      company,
      internalNotes,
      tariff,
      pricingRuleId: selectedRuleId || undefined,
      pricingRuleName: availableNamedRules.find((r) => r.id === selectedRuleId)?.name || undefined,
      discount,
      manualDiscountDollars: manualDiscountDollars
        ? parseFloat(manualDiscountDollars) || undefined
        : undefined,
      waiveAirportFee,
      waiveMultiStopFees,
      bypassSurge,
      waivedSurchargeIds: waivedSurchargeIds.length > 0 ? waivedSurchargeIds : undefined,
      waivedExtraKeys: waivedExtraKeys.length > 0 ? waivedExtraKeys : undefined,
      vehicleTypeId: primaryVehicle === 'any' ? 'any' : String(tier),
      vehicleDisplayName: primaryVehicleDisplayName,
      vehiclePreference: primaryVehicle,
      carryOnBags,
      checkedBags,
      oversizedBagsCount: hasOversizedLuggage ? totalOversizedCount : 0,
      oversizedBags: oversizedBagsPayload,
      hasOversizedLuggage:
        hasOversizedLuggage && (totalOversizedCount > 0 || Boolean(oversizedLuggageNotes.trim())),
      oversizedLuggageNotes:
        hasOversizedLuggage && oversizedLuggageNotes.trim()
          ? oversizedLuggageNotes.trim()
          : undefined,
      oversizedItemsSummary,
      gateCode: gateCode.trim() || undefined,
      specialRequestFlags: Object.values(specialRequestFlags).some(Boolean)
        ? { ...specialRequestFlags }
        : undefined,
      selectedCustomExtras:
        Object.keys(selectedCustomExtras || {}).length > 0 ? selectedCustomExtras : undefined,
      customExtrasSummary,
      corporateAccountId: matchedCorporateAccount?.id,
      corporateOrgName: paymentMethod === 'account' ? corporateAccount : undefined,
      hasReturnTrip: Boolean(returnTrip && autoCreateReturnTrip),
      additionalPassengers,
      selectedVehicles,
      carSeatsBreakdown: {
        rearFacing: rearFacingCount,
        frontFacing: frontFacingCount,
        booster: boosterCount,
      },
      contactPerson: isBookerDifferent
        ? {
            isBookerDifferent: true,
            contactName,
            contactPhone,
            contactEmail,
            contactRole,
          }
        : undefined,
      cardDetails:
        paymentMethod === 'card'
          ? {
              cardPaymentType,
              cardholderName,
              cardLast4: cardNumber ? cardNumber.slice(-4) : undefined,
              cardExp,
              saveCardOnFile,
            }
          : undefined,
      corporateDetails:
        paymentMethod === 'account'
          ? {
              corporateAccount,
              billingPo,
              authorizedBy,
              invoicingTerms: formatInheritedCorporateBillingTerms(
                matchedCorporateAccount?.billingCycle
              ),
              billingCycle: matchedCorporateAccount?.billingCycle || 'net30',
              poOverrideAuthorized: allowPoOverride || undefined,
            }
          : undefined,
      returnDetails: returnTrip
        ? {
            returnTrip: true,
            returnPickupAddress: returnPickupAddress || dropoffAddress,
            returnDropoffAddress: returnDropoffAddress || pickupAddress,
            returnIntermediateStops,
            returnDate,
            returnTime,
            returnPassengers,
            returnBags,
            returnCarSeats,
            returnCarSeatsBreakdown: {
              rearFacing: returnRearFacing,
              frontFacing: returnFrontFacing,
              booster: returnBooster,
            },
            returnVehicles,
            autoCreateReturnTrip,
            returnEstimatedFare,
            returnEstimatedDurationMinutes,
            returnEstimatedDistanceMiles,
            returnProvideFlightInfo,
            returnAirline: returnProvideFlightInfo ? returnAirline : undefined,
            returnFlightNumber: returnProvideFlightInfo ? returnFlightNumber : undefined,
            returnFlightOrigin: returnProvideFlightInfo ? returnFlightOrigin : undefined,
            returnTailNumber: returnProvideFlightInfo ? returnTailNumber : undefined,
            returnFboFacility: returnProvideFlightInfo ? returnFboFacility : undefined,
            returnHasCheckedLuggage: returnProvideFlightInfo ? returnHasCheckedLuggage : false,
          }
        : undefined,
      repeatDetails: repeat
        ? {
            repeat: true,
            repeatFrequency,
            repeatDays,
            repeatOccurrences,
            repeatUntilDate,
            repeatWeeksPattern,
            repeatsRoundTrip: returnTrip,
          }
        : undefined,
      flightNotes: outboundFlightNotes || undefined,
      flightDetails: provideFlightInfo
        ? {
            airlineName: airline || undefined,
            flightNumber: flightNumber || undefined,
            departureAirport: flightOrigin || undefined,
            tailNumber: tailNumber || undefined,
            fboFacility: fboFacility || undefined,
            hasCheckedLuggage,
          }
        : undefined,
      provideFlightInfo,
      airline: provideFlightInfo ? airline : undefined,
      airlineName: provideFlightInfo ? airline : undefined,
      flightNumber: provideFlightInfo ? flightNumber : undefined,
      flightOrigin: provideFlightInfo ? flightOrigin : undefined,
      departureAirport: provideFlightInfo ? flightOrigin : undefined,
      tailNumber: provideFlightInfo ? tailNumber : undefined,
      fboFacility: provideFlightInfo ? fboFacility : undefined,
      isPrivateAviation: Boolean(airportDetection.isPrivateAviation),
      hasCheckedLuggage: provideFlightInfo ? hasCheckedLuggage : false,
      isAirportTrip: Boolean(airportDetection.isAirportTrip),
      airportIataCode: airportDetection.airport?.iataCode,
    };

    const parsedDispOutboundFlight = parseFlightIdent(airline, flightNumber);
    const validDispOutboundTelemetry =
      provideFlightInfo &&
      !airportDetection.isPrivateAviation &&
      outboundFlightTelemetry &&
      parsedDispOutboundFlight.isValid &&
      outboundFlightTelemetry.flightIdent === parsedDispOutboundFlight.flightIdent
        ? outboundFlightTelemetry
        : undefined;
    const parsedDispReturnFlight = parseFlightIdent(returnAirline, returnFlightNumber);
    const validDispReturnTelemetry =
      returnProvideFlightInfo &&
      !returnAirportDetection.isPrivateAviation &&
      returnFlightTelemetry &&
      parsedDispReturnFlight.isValid &&
      returnFlightTelemetry.flightIdent === parsedDispReturnFlight.flightIdent
        ? returnFlightTelemetry
        : undefined;

    try {
      const resolveDisplayNameForChoice = (choice: string, resolvedTier: string) => {
        if (choice === 'any') return 'Any';
        const opt = dispatchVehicleOptions.find((o) => o.key === choice || o.key === resolvedTier);
        return opt?.label || String(resolvedTier);
      };

      const selectedDriverInfo =
        driverId !== 'unassigned' ? driverOptions.find((d) => d.id === driverId) : undefined;
      const isStagingSelectedDriver =
        driverId !== 'unassigned' && driverAssignmentMode === 'stage_hold';
      const nowStagingIso = new Date().toISOString();
      const stagingActorUser = (() => {
        try {
          return getAdminAuthService().getCurrentUser();
        } catch {
          return null;
        }
      })();
      const stagingActorName =
        stagingActorUser?.displayName ||
        stagingActorUser?.email ||
        stagingActorUser?.uid ||
        'Dispatcher';
      const resolvedPlannedDriverLabel = selectedDriverInfo
        ? formatDriverAssignmentLabel(selectedDriverInfo)
        : driverId !== 'unassigned'
        ? driverId
        : null;

      if (isEditMode && initialTrip) {
        const editPreservation = resolveAssignedTripEditPreservation({
          initialTrip,
          formDriverId: driverId,
          driverAssignmentMode,
          driverExplicitlyChangedByUser: Boolean(driverExplicitlyChangedByUserRef?.current),
          isCompleted,
          isCancelled,
        });
        const preservedDriverInfo = editPreservation.assignedDriverId
          ? driverOptions.find((d) => d.id === editPreservation.assignedDriverId)
          : undefined;
        const editStagingSelectedDriver = editPreservation.isStagingSelectedDriver;

        const shouldSplitIntoMultiCar =
          !isCompleted &&
          !isCancelled &&
          !initialTrip.multiCarGroupId &&
          selectedVehicles.length > 1;

        if (shouldSplitIntoMultiCar) {
          const groupId = generateMultiCarGroupId();
          const carCount = selectedVehicles.length;
          const carSpecs = buildPerVehiclePricingSpecs({
            selectedVehicles,
            resolveTier: (c) => resolveVehicleEngineId(c, activeAdminVehicleIds),
            resolveDisplayName: resolveDisplayNameForChoice,
            vehicleQuotes,
            primaryPricing: outboundPricing,
            distanceMiles: estimatedDistanceMiles,
            durationMinutes: estimatedDurationMinutes,
            combinedTargetFare: finalFare,
            isFareOverridden: Boolean(isFareOverridden && manualFare),
          });
          const paxCaps = selectedVehicles.map((v) => vehicleCapacities[v]?.maxPassengers || 4);
          const bagCaps = selectedVehicles.map((v) => vehicleCapacities[v]?.maxBags || 3);
          const paxAlloc = distributeAcrossCars(passengers, carCount, paxCaps, 1);
          const bagAlloc = distributeAcrossCars(bags, carCount, bagCaps, 0);

          const car1Spec = carSpecs[0];
          const car1Updates: Partial<Trip> = {
            pickupLocation: {
              ...initialTrip.pickupLocation,
              address: pickupAddress,
              coordinates: pickupCoordinates,
              placeId: pickupPlaceId,
              notes: notesForAll || undefined,
            },
            dropoffLocation: {
              ...initialTrip.dropoffLocation,
              address: dropoffAddress,
              coordinates: dropoffCoordinates,
              placeId: dropoffPlaceId,
            },
            intermediateStops:
              intermediateStops.length > 0
                ? intermediateStops.map((s) => ({
                    address: s.address,
                    coordinates: s.coordinates,
                    placeId: s.placeId,
                  }))
                : undefined,
            passenger: {
              ...initialTrip.passenger,
              firstName,
              lastName,
              phone,
              email,
              passengerCount: paxAlloc[0],
              luggageCount: bagAlloc[0],
              specialRequests,
            },
            vehicleTier: car1Spec.vehicleTier as VehicleTier,
            bookingType: timingType === 'later' ? 'scheduled' : 'asap',
            scheduledPickupTime,
            driverNotes: notesForAll,
            flightNotes: outboundFlightNotes || undefined,
            ...(validDispOutboundTelemetry ? { flightTelemetry: validDispOutboundTelemetry } : {}),
            assignedDriverId: editPreservation.assignedDriverId,
            ...(editStagingSelectedDriver
              ? {
                  offeredToIds: [],
                  plannedDriverId: driverId,
                  plannedDriverLabel: resolvedPlannedDriverLabel,
                  plannedAt: nowStagingIso,
                  plannedBy: stagingActorName,
                }
              : {
                  plannedDriverId: null,
                  plannedDriverLabel: null,
                  plannedAt: null,
                  plannedBy: null,
                }),
            status: editPreservation.status,
            pricing: car1Spec.pricing,
            payment: {
              ...initialTrip.payment,
              method,
              amount: car1Spec.fare,
              corporateAccountId: matchedCorporateAccount?.id,
            },
            multipleVehiclesRequested: true,
            vehicleCount: carCount,
            multiCarGroupId: groupId,
            multiCarIndex: 1,
            multiCarTotal: carCount,
            metadata: {
              ...initialTrip.metadata,
              ...metadataPayload,
              vehicleTypeId: car1Spec.vehicleChoice === 'any' ? 'any' : car1Spec.vehicleTier,
              vehicleDisplayName: car1Spec.vehicleDisplayName,
              vehiclePreference: car1Spec.vehicleChoice,
              selectedVehicles: [car1Spec.vehicleChoice],
              multiCarGroupId: groupId,
              multiCarIndex: 1,
              multiCarTotal: carCount,
              multiCarTotalPassengers: passengers,
              multiCarTotalBags: bags,
              multiCarOrderTotalFare: finalFare,
              ...(editPreservation.shouldClearPendingUpdateAck
                ? { pendingDriverUpdateAck: null }
                : {}),
              ...(preservedDriverInfo && !editStagingSelectedDriver
                ? {
                    assignedDriverName: preservedDriverInfo.name,
                    assignedDriverPhone: preservedDriverInfo.phone,
                  }
                : {}),
            },
          };

          if (
            editPreservation.retainedSameAssignedDriver &&
            editPreservation.assignedDriverId &&
            ACTIVE_DRIVER_LIFECYCLE_STATUSES.has(editPreservation.status)
          ) {
            const car1Ack = buildPendingDriverUpdateAck({
              before: initialTrip,
              after: car1Updates,
              updatedBy: stagingActorName,
              source: 'dispatch_edit',
              requireDriverUpdateAck: driverAppConfig.requireDriverUpdateAck,
            });
            if (car1Ack) {
              car1Updates.metadata = {
                ...(car1Updates.metadata || {}),
                pendingDriverUpdateAck: car1Ack,
              };
              car1Updates.auditLog = [
                ...(initialTrip.auditLog || []),
                {
                  action: 'TRIP_MODIFIED',
                  timestamp: car1Ack.updatedAt,
                  actorId: stagingActorUser?.uid,
                  actorRole:
                    stagingActorUser?.role === 'admin' ? ('admin' as const) : ('dispatcher' as const),
                  referenceNumber: `UPD-${Math.floor(1000 + Math.random() * 9000)}`,
                  referenceType: 'edit' as const,
                  context: `Trip updated by dispatch — awaiting driver acknowledgement: ${car1Ack.changesSummary.join('; ')}`,
                },
              ];
            }
          }

          const car1Updated = service.updateTrip
            ? await service.updateTrip(initialTrip.id, car1Updates)
            : ({ ...initialTrip, ...car1Updates } as Trip);

          const convoyTrips: Trip[] = [car1Updated];

          for (let i = 1; i < carCount; i++) {
            const spec = carSpecs[i];
            const sibPayload: CreateTripInput = {
              bookingType: timingType === 'later' ? 'scheduled' : 'asap',
              scheduledPickupTime,
              pickupLocation: {
                address: pickupAddress,
                coordinates: pickupCoordinates,
                placeId: pickupPlaceId,
                notes: notesForAll || undefined,
              },
              dropoffLocation: {
                address: dropoffAddress,
                coordinates: dropoffCoordinates,
                placeId: dropoffPlaceId,
              },
              intermediateStops:
                intermediateStops.length > 0
                  ? intermediateStops.map((s) => ({
                      address: s.address,
                      coordinates: s.coordinates,
                      placeId: s.placeId,
                    }))
                  : undefined,
              passenger: {
                firstName,
                lastName,
                phone,
                email,
                passengerCount: paxAlloc[i],
                luggageCount: bagAlloc[i],
              },
              vehicleTier: spec.vehicleTier as VehicleTier,
              driverNotes: notesForAll,
              flightNotes: outboundFlightNotes || undefined,
              ...(validDispOutboundTelemetry
                ? { flightTelemetry: validDispOutboundTelemetry }
                : {}),
              pricing: spec.pricing,
              payment: {
                method,
                status: 'pending',
                amount: spec.fare,
                corporateAccountId: matchedCorporateAccount?.id,
              },
              multipleVehiclesRequested: true,
              vehicleCount: carCount,
              multiCarGroupId: groupId,
              multiCarIndex: i + 1,
              multiCarTotal: carCount,
              metadata: {
                ...metadataPayload,
                vehicleTypeId: spec.vehicleChoice === 'any' ? 'any' : spec.vehicleTier,
                vehicleDisplayName: spec.vehicleDisplayName,
                vehiclePreference: spec.vehicleChoice,
                selectedVehicles: [spec.vehicleChoice],
                oversizedBagsCount: 0,
                oversizedBags: undefined,
                hasOversizedLuggage: false,
                oversizedLuggageNotes: undefined,
                oversizedItemsSummary: undefined,
                selectedCustomExtras: undefined,
                customExtrasSummary: undefined,
                carSeatsBreakdown: { rearFacing: 0, frontFacing: 0, booster: 0 },
                multiCarGroupId: groupId,
                multiCarIndex: i + 1,
                multiCarTotal: carCount,
                multiCarTotalPassengers: passengers,
                multiCarTotalBags: bags,
                multiCarOrderTotalFare: finalFare,
                createdByRole: 'dispatcher',
              },
            };
            const sibCreated = await service.createBooking(sibPayload);
            convoyTrips.push(sibCreated);
          }

          const allTripIds = convoyTrips.map((t) => t.id);
          const associates = convoyTrips.map((t, idx) =>
            buildAssociateEntryFromTrip(
              t,
              idx === 0 && preservedDriverInfo && !editStagingSelectedDriver
                ? {
                    driverId: preservedDriverInfo.id,
                    driverName: preservedDriverInfo.name,
                    driverPhone: preservedDriverInfo.phone,
                    vehicleUnit: preservedDriverInfo.cabNumber
                      ? `Car #${preservedDriverInfo.cabNumber}`
                      : preservedDriverInfo.vehicle,
                  }
                : undefined
            )
          );
          const driverIds = associates
            .map((a) => a.driverId)
            .filter((id): id is string => Boolean(id));

          if (service.updateTrip) {
            await Promise.all(
              convoyTrips.map((t) =>
                service.updateTrip!(t.id, {
                  multiCarTripIds: allTripIds,
                  multiCarAssociates: associates,
                  multiCarDriverIds: driverIds,
                })
              )
            );
          }

          if (driverExplicitlyChangedByUserRef) {
            driverExplicitlyChangedByUserRef.current = false;
          }
          try {
            localStorage.removeItem(draftStorageKey);
          } catch {}

          onBookingSuccess?.(
            {
              ...car1Updated,
              multiCarTripIds: allTripIds,
              multiCarAssociates: associates,
              multiCarDriverIds: driverIds,
            },
            true
          );
          return;
        }

        const updates: Partial<Trip> = {
          pickupLocation: isCancelled
            ? initialTrip.pickupLocation
            : {
                ...initialTrip.pickupLocation,
                address: pickupAddress,
                coordinates: pickupCoordinates,
                placeId: pickupPlaceId,
                notes: notesForAll || undefined,
              },
          dropoffLocation: isCancelled
            ? initialTrip.dropoffLocation
            : {
                ...initialTrip.dropoffLocation,
                address: dropoffAddress,
                coordinates: dropoffCoordinates,
                placeId: dropoffPlaceId,
              },
          intermediateStops: isCancelled
            ? initialTrip.intermediateStops
            : intermediateStops.length > 0
            ? intermediateStops.map((s) => ({
                address: s.address,
                coordinates: s.coordinates,
                placeId: s.placeId,
              }))
            : undefined,
          passenger: {
            ...initialTrip.passenger,
            firstName,
            lastName,
            phone,
            email,
            passengerCount: passengers,
            luggageCount: bags,
            specialRequests,
          },
          vehicleTier: isCompleted || isCancelled ? initialTrip.vehicleTier : tier,
          bookingType:
            isCompleted || isCancelled
              ? initialTrip.bookingType
              : timingType === 'later'
              ? 'scheduled'
              : 'asap',
          scheduledPickupTime:
            isCompleted || isCancelled ? initialTrip.scheduledPickupTime : scheduledPickupTime,
          driverNotes: notesForAll,
          flightNotes: outboundFlightNotes || undefined,
          ...(validDispOutboundTelemetry ? { flightTelemetry: validDispOutboundTelemetry } : {}),
          assignedDriverId: editPreservation.assignedDriverId,
          ...(isCompleted || isCancelled
            ? {}
            : editStagingSelectedDriver
            ? {
                offeredToIds: [],
                plannedDriverId: driverId,
                plannedDriverLabel: resolvedPlannedDriverLabel,
                plannedAt: nowStagingIso,
                plannedBy: stagingActorName,
                auditLog: [
                  ...(initialTrip.auditLog || []),
                  {
                    action: 'DRIVER_STAGED',
                    timestamp: nowStagingIso,
                    actorId: stagingActorUser?.uid,
                    actorRole:
                      stagingActorUser?.role === 'admin' ? ('admin' as const) : ('dispatcher' as const),
                    referenceNumber: `STG-${Math.floor(1000 + Math.random() * 9000)}`,
                    referenceType: 'lifecycle' as const,
                    context: `Staged ${resolvedPlannedDriverLabel} as planned driver — held in Dispatch`,
                  },
                ],
              }
            : {
                plannedDriverId: null,
                plannedDriverLabel: null,
                plannedAt: null,
                plannedBy: null,
              }),
          status: editPreservation.status,
          pricing: persistedOutboundPricing,
          payment: {
            ...initialTrip.payment,
            method,
            amount: finalFare,
            corporateAccountId: matchedCorporateAccount?.id,
          },
          metadata: {
            ...initialTrip.metadata,
            ...metadataPayload,
            ...(editPreservation.shouldClearPendingUpdateAck
              ? { pendingDriverUpdateAck: null }
              : {}),
            ...(preservedDriverInfo && !editStagingSelectedDriver
              ? {
                  assignedDriverName: preservedDriverInfo.name,
                  assignedDriverPhone: preservedDriverInfo.phone,
                }
              : !editPreservation.assignedDriverId
              ? {
                  assignedDriverName: null,
                  assignedDriverPhone: null,
                }
              : {}),
          },
        };

        if (
          !isCompleted &&
          !isCancelled &&
          editPreservation.retainedSameAssignedDriver &&
          editPreservation.assignedDriverId &&
          ACTIVE_DRIVER_LIFECYCLE_STATUSES.has(editPreservation.status)
        ) {
          const pendingAck = buildPendingDriverUpdateAck({
            before: initialTrip,
            after: updates,
            updatedBy: stagingActorName,
            source: 'dispatch_edit',
            requireDriverUpdateAck: driverAppConfig.requireDriverUpdateAck,
          });
          if (pendingAck) {
            updates.metadata = {
              ...(updates.metadata || {}),
              pendingDriverUpdateAck: pendingAck,
            };
            updates.auditLog = [
              ...(updates.auditLog || initialTrip.auditLog || []),
              {
                action: 'TRIP_MODIFIED',
                timestamp: pendingAck.updatedAt,
                actorId: stagingActorUser?.uid,
                actorRole:
                  stagingActorUser?.role === 'admin' ? ('admin' as const) : ('dispatcher' as const),
                referenceNumber: `UPD-${Math.floor(1000 + Math.random() * 9000)}`,
                referenceType: 'edit' as const,
                context: `Trip updated by dispatch — awaiting driver acknowledgement: ${pendingAck.changesSummary.join('; ')}`,
              },
            ];
          }
        }

        const updatedTrip = service.updateTrip
          ? await service.updateTrip(initialTrip.id, updates)
          : ({ ...initialTrip, ...updates } as Trip);

        if (driverExplicitlyChangedByUserRef) {
          driverExplicitlyChangedByUserRef.current = false;
        }
        try {
          localStorage.removeItem(draftStorageKey);
        } catch {}

        onBookingSuccess?.(updatedTrip, true);
      } else {
        const isMultiVehicle = selectedVehicles.length > 1;
        const carCount = Math.max(1, selectedVehicles.length);
        const multiCarGroupId = isMultiVehicle ? generateMultiCarGroupId() : undefined;

        const outboundCarSpecs = isMultiVehicle
          ? buildPerVehiclePricingSpecs({
              selectedVehicles,
              resolveTier: (c) => resolveVehicleEngineId(c, activeAdminVehicleIds),
              resolveDisplayName: resolveDisplayNameForChoice,
              vehicleQuotes,
              primaryPricing: outboundPricing,
              distanceMiles: estimatedDistanceMiles,
              durationMinutes: estimatedDurationMinutes,
              combinedTargetFare: finalFare,
              isFareOverridden: Boolean(isFareOverridden && manualFare),
            })
          : [
              {
                carIndex: 1,
                vehicleChoice: primaryVehicle,
                vehicleTier: String(tier),
                vehicleDisplayName: primaryVehicleDisplayName,
                pricing: persistedOutboundPricing,
                fare: finalFare,
              },
            ];

        const paxCaps = selectedVehicles.map((v) => vehicleCapacities[v]?.maxPassengers || 4);
        const bagCaps = selectedVehicles.map((v) => vehicleCapacities[v]?.maxBags || 3);
        const paxAlloc = isMultiVehicle
          ? distributeAcrossCars(passengers, carCount, paxCaps, 1)
          : [passengers];
        const bagAlloc = isMultiVehicle
          ? distributeAcrossCars(bags, carCount, bagCaps, 0)
          : [bags];

        const createdOutboundTrips: Trip[] = [];

        for (let i = 0; i < outboundCarSpecs.length; i++) {
          const spec = outboundCarSpecs[i];
          const isCar1 = i === 0;
          const carPayload: CreateTripInput = {
            bookingType: timingType === 'later' ? 'scheduled' : 'asap',
            scheduledPickupTime,
            pickupLocation: {
              address: pickupAddress,
              coordinates: pickupCoordinates,
              placeId: pickupPlaceId,
              notes: notesForAll || undefined,
            },
            dropoffLocation: {
              address: dropoffAddress,
              coordinates: dropoffCoordinates,
              placeId: dropoffPlaceId,
            },
            intermediateStops:
              intermediateStops.length > 0
                ? intermediateStops.map((s) => ({
                    address: s.address,
                    coordinates: s.coordinates,
                    placeId: s.placeId,
                  }))
                : undefined,
            passenger: {
              firstName,
              lastName,
              phone,
              email,
              passengerCount: paxAlloc[i],
              luggageCount: bagAlloc[i],
              specialRequests: isCar1 ? specialRequests : undefined,
            },
            vehicleTier: spec.vehicleTier as VehicleTier,
            driverNotes: notesForAll,
            flightNotes: outboundFlightNotes || undefined,
            ...(validDispOutboundTelemetry ? { flightTelemetry: validDispOutboundTelemetry } : {}),
            pricing: spec.pricing,
            payment: {
              method,
              status: 'pending',
              amount: spec.fare,
              corporateAccountId: matchedCorporateAccount?.id,
            },
            ...(isMultiVehicle
              ? {
                  multipleVehiclesRequested: true,
                  vehicleCount: carCount,
                  multiCarGroupId,
                  multiCarIndex: i + 1,
                  multiCarTotal: carCount,
                }
              : {}),
            metadata: {
              ...metadataPayload,
              vehicleTypeId: spec.vehicleChoice === 'any' ? 'any' : spec.vehicleTier,
              vehicleDisplayName: spec.vehicleDisplayName,
              vehiclePreference: spec.vehicleChoice,
              selectedVehicles: [spec.vehicleChoice],
              ...(isMultiVehicle && !isCar1
                ? {
                    oversizedBagsCount: 0,
                    oversizedBags: undefined,
                    hasOversizedLuggage: false,
                    oversizedLuggageNotes: undefined,
                    oversizedItemsSummary: undefined,
                    selectedCustomExtras: undefined,
                    customExtrasSummary: undefined,
                    carSeatsBreakdown: { rearFacing: 0, frontFacing: 0, booster: 0 },
                  }
                : {}),
              ...(isMultiVehicle
                ? {
                    multiCarGroupId,
                    multiCarIndex: i + 1,
                    multiCarTotal: carCount,
                    multiCarTotalPassengers: passengers,
                    multiCarTotalBags: bags,
                    multiCarOrderTotalFare: finalFare,
                  }
                : {}),
              createdByRole: 'dispatcher',
            },
          };

          let createdCar = await service.createBooking(carPayload);

          if (isCar1 && driverId !== 'unassigned') {
            if (isStagingSelectedDriver) {
              const stagedPatch: Partial<Trip> = {
                plannedDriverId: driverId,
                plannedDriverLabel: resolvedPlannedDriverLabel,
                plannedAt: nowStagingIso,
                plannedBy: stagingActorName,
                assignedDriverId: null,
                offeredToIds: [],
                auditLog: [
                  ...(createdCar.auditLog || []),
                  {
                    action: 'DRIVER_STAGED',
                    timestamp: nowStagingIso,
                    actorId: stagingActorUser?.uid,
                    actorRole:
                      stagingActorUser?.role === 'admin'
                        ? ('admin' as const)
                        : ('dispatcher' as const),
                    referenceNumber: `STG-${Math.floor(1000 + Math.random() * 9000)}`,
                    referenceType: 'lifecycle' as const,
                    context: `Staged ${resolvedPlannedDriverLabel} as planned driver — held in Dispatch`,
                  },
                ],
              };
              if (service.updateTrip) {
                try {
                  createdCar = await service.updateTrip(createdCar.id, stagedPatch);
                } catch {
                  createdCar = { ...createdCar, ...stagedPatch };
                }
              } else {
                createdCar = { ...createdCar, ...stagedPatch };
              }
            } else if (service.updateTripStatus) {
              try {
                createdCar = await service.updateTripStatus(createdCar.id, 'assigned', {
                  assignedDriverId: driverId,
                  actorRole: 'admin',
                  reason: `Directly assigned to ${
                    selectedDriverInfo?.name || driverId
                  } by dispatcher`,
                });
              } catch {}
            }
          }

          createdOutboundTrips.push(createdCar);
        }

        if (isMultiVehicle && createdOutboundTrips.length > 1) {
          const allTripIds = createdOutboundTrips.map((t) => t.id);
          const associates = createdOutboundTrips.map((t, idx) =>
            buildAssociateEntryFromTrip(
              t,
              idx === 0 && selectedDriverInfo && !isStagingSelectedDriver
                ? {
                    driverId: selectedDriverInfo.id,
                    driverName: selectedDriverInfo.name,
                    driverPhone: selectedDriverInfo.phone,
                    vehicleUnit: selectedDriverInfo.cabNumber
                      ? `Car #${selectedDriverInfo.cabNumber}`
                      : selectedDriverInfo.vehicle,
                  }
                : undefined
            )
          );
          const driverIds = associates
            .map((a) => a.driverId)
            .filter((id): id is string => Boolean(id));

          if (service.updateTrip) {
            await Promise.all(
              createdOutboundTrips.map((t) =>
                service.updateTrip!(t.id, {
                  multiCarTripIds: allTripIds,
                  multiCarAssociates: associates,
                  multiCarDriverIds: driverIds,
                })
              )
            );
          }
          createdOutboundTrips[0] = {
            ...createdOutboundTrips[0],
            multiCarTripIds: allTripIds,
            multiCarAssociates: associates,
            multiCarDriverIds: driverIds,
          };
        }

        const createdTrip = createdOutboundTrips[0];

        let createdReturnTripForEmail: Trip | null = null;
        if (returnTrip && autoCreateReturnTrip && returnDate && returnTime) {
          try {
            const retPickupAddr = returnPickupAddress.trim() || dropoffAddress;
            const retDropoffAddr = returnDropoffAddress.trim() || pickupAddress;
            const returnScheduledTimeIso = new Date(
              `${returnDate}T${returnTime}:00`
            ).toISOString();

            const returnSpecialRequests = formatCarSeatSummaryLabel(returnCarSeats, {
              rearFacing: returnRearFacing,
              frontFacing: returnFrontFacing,
              booster: returnBooster,
            });

            const isReturnMultiCar = returnVehicles.length > 1;
            const retCarCount = Math.max(1, returnVehicles.length);
            const returnGroupId = isReturnMultiCar ? generateMultiCarGroupId() : undefined;

            const returnCarSpecs = isReturnMultiCar
              ? buildPerVehiclePricingSpecs({
                  selectedVehicles: returnVehicles,
                  resolveTier: (c) => resolveVehicleEngineId(c, activeAdminVehicleIds),
                  resolveDisplayName: resolveDisplayNameForChoice,
                  vehicleQuotes: returnVehicleQuotes,
                  primaryPricing: returnPricing,
                  distanceMiles: returnEstimatedDistanceMiles || estimatedDistanceMiles,
                  durationMinutes: returnEstimatedDurationMinutes || estimatedDurationMinutes,
                  combinedTargetFare: returnLegFare,
                  isFareOverridden: Boolean(isFareOverridden && manualFare),
                })
              : (() => {
                  const returnPrimaryVehicle = returnVehicles[0] || 'any';
                  const returnTier = resolveVehicleEngineId(
                    returnPrimaryVehicle,
                    activeAdminVehicleIds
                  );
                  return [
                    {
                      carIndex: 1,
                      vehicleChoice: returnPrimaryVehicle,
                      vehicleTier: String(returnTier),
                      vehicleDisplayName: resolveDisplayNameForChoice(
                        returnPrimaryVehicle,
                        String(returnTier)
                      ),
                      pricing: buildPersistedPricing(
                        returnPricing,
                        returnLegFare,
                        returnEstimatedDistanceMiles || estimatedDistanceMiles,
                        returnEstimatedDurationMinutes || estimatedDurationMinutes,
                        Boolean(isFareOverridden && manualFare)
                      ),
                      fare: returnLegFare,
                    },
                  ];
                })();

            const retPaxCaps = returnVehicles.map(
              (v) => vehicleCapacities[v]?.maxPassengers || 4
            );
            const retBagCaps = returnVehicles.map((v) => vehicleCapacities[v]?.maxBags || 3);
            const retPaxAlloc = isReturnMultiCar
              ? distributeAcrossCars(returnPassengers, retCarCount, retPaxCaps, 1)
              : [returnPassengers];
            const retBagAlloc = isReturnMultiCar
              ? distributeAcrossCars(returnBags, retCarCount, retBagCaps, 0)
              : [returnBags];

            const createdReturnTrips: Trip[] = [];

            for (let rIdx = 0; rIdx < returnCarSpecs.length; rIdx++) {
              const rSpec = returnCarSpecs[rIdx];
              const pairedOutbound = createdOutboundTrips[rIdx] || createdTrip;
              const returnPayload: CreateTripInput = {
                bookingType: 'scheduled',
                scheduledPickupTime: returnScheduledTimeIso,
                pickupLocation: {
                  address: retPickupAddr,
                  coordinates: returnPickupCoordinates || dropoffCoordinates,
                  placeId: returnPickupPlaceId || dropoffPlaceId,
                },
                dropoffLocation: {
                  address: retDropoffAddr,
                  coordinates: returnDropoffCoordinates || pickupCoordinates,
                  placeId: returnDropoffPlaceId || pickupPlaceId,
                },
                intermediateStops:
                  returnIntermediateStops.length > 0
                    ? returnIntermediateStops.map((s) => ({
                        address: s.address,
                        coordinates: s.coordinates,
                        placeId: s.placeId,
                      }))
                    : undefined,
                passenger: {
                  firstName,
                  lastName,
                  phone,
                  email,
                  passengerCount: retPaxAlloc[rIdx],
                  luggageCount: retBagAlloc[rIdx],
                  specialRequests: rIdx === 0 ? returnSpecialRequests : undefined,
                },
                vehicleTier: rSpec.vehicleTier as VehicleTier,
                driverNotes: notesForAll,
                flightNotes: returnLegFlightNotes || undefined,
                ...(validDispReturnTelemetry ? { flightTelemetry: validDispReturnTelemetry } : {}),
                pricing: rSpec.pricing,
                payment: {
                  method,
                  status: 'pending',
                  amount: rSpec.fare,
                  corporateAccountId: matchedCorporateAccount?.id,
                },
                ...(isReturnMultiCar
                  ? {
                      multipleVehiclesRequested: true,
                      vehicleCount: retCarCount,
                      multiCarGroupId: returnGroupId,
                      multiCarIndex: rIdx + 1,
                      multiCarTotal: retCarCount,
                    }
                  : {}),
                metadata: {
                  ...metadataPayload,
                  vehicleTypeId: rSpec.vehicleChoice === 'any' ? 'any' : rSpec.vehicleTier,
                  vehicleDisplayName: rSpec.vehicleDisplayName,
                  selectedVehicles: [rSpec.vehicleChoice],
                  carryOnBags: returnCarryOnBags,
                  checkedBags: returnCheckedBags,
                  oversizedBagsCount: returnHasOversizedLuggage ? returnTotalOversizedCount : 0,
                  oversizedBags: returnOversizedBagsPayload,
                  hasOversizedLuggage:
                    returnHasOversizedLuggage &&
                    (returnTotalOversizedCount > 0 ||
                      Boolean(returnOversizedLuggageNotes.trim())),
                  oversizedLuggageNotes:
                    returnHasOversizedLuggage && returnOversizedLuggageNotes.trim()
                      ? returnOversizedLuggageNotes.trim()
                      : undefined,
                  oversizedItemsSummary: returnOversizedItemsSummary,
                  carSeatsBreakdown: {
                    rearFacing: returnRearFacing,
                    frontFacing: returnFrontFacing,
                    booster: returnBooster,
                  },
                  linkedTripId: pairedOutbound.id,
                  isReturnRide: true,
                  hasReturnTrip: false,
                  createdByRole: 'dispatcher',
                  ...(isReturnMultiCar
                    ? {
                        multiCarGroupId: returnGroupId,
                        multiCarIndex: rIdx + 1,
                        multiCarTotal: retCarCount,
                        multiCarTotalPassengers: returnPassengers,
                        multiCarTotalBags: returnBags,
                        multiCarOrderTotalFare: returnLegFare,
                      }
                    : {}),
                  flightNotes: returnLegFlightNotes || undefined,
                  provideFlightInfo: Boolean(returnProvideFlightInfo),
                  flightDetails: returnProvideFlightInfo
                    ? {
                        airlineName: returnAirline || undefined,
                        flightNumber: returnFlightNumber || undefined,
                        departureAirport: returnFlightOrigin || undefined,
                        tailNumber: returnTailNumber || undefined,
                        fboFacility: returnFboFacility || undefined,
                        hasCheckedLuggage: returnHasCheckedLuggage,
                      }
                    : undefined,
                  airline: returnProvideFlightInfo ? returnAirline : undefined,
                  airlineName: returnProvideFlightInfo ? returnAirline : undefined,
                  flightNumber: returnProvideFlightInfo ? returnFlightNumber : undefined,
                  flightOrigin: returnProvideFlightInfo ? returnFlightOrigin : undefined,
                  departureAirport: returnProvideFlightInfo ? returnFlightOrigin : undefined,
                  tailNumber: returnProvideFlightInfo ? returnTailNumber : undefined,
                  fboFacility: returnProvideFlightInfo ? returnFboFacility : undefined,
                  isPrivateAviation: Boolean(returnAirportDetection.isPrivateAviation),
                  hasCheckedLuggage: returnProvideFlightInfo ? returnHasCheckedLuggage : false,
                  isAirportTrip: Boolean(returnAirportDetection.isAirportTrip),
                  airportIataCode: returnAirportDetection.airport?.iataCode,
                },
              };
              const createdRet = await service.createBooking(returnPayload);
              createdReturnTrips.push(createdRet);

              if (service.updateTrip && createdRet?.id && pairedOutbound?.id) {
                await service.updateTrip(pairedOutbound.id, {
                  linkedReturnTripId: createdRet.id,
                  returnScheduledPickupTime: returnScheduledTimeIso,
                  metadata: {
                    ...pairedOutbound.metadata,
                    hasReturnTrip: true,
                    linkedReturnTripId: createdRet.id,
                    returnScheduledPickupTime: returnScheduledTimeIso,
                  },
                });
              }
            }

            if (isReturnMultiCar && createdReturnTrips.length > 1 && service.updateTrip) {
              const retIds = createdReturnTrips.map((t) => t.id);
              const retAssociates = createdReturnTrips.map((t) => buildAssociateEntryFromTrip(t));
              await Promise.all(
                createdReturnTrips.map((t) =>
                  service.updateTrip!(t.id, {
                    multiCarTripIds: retIds,
                    multiCarAssociates: retAssociates,
                    multiCarDriverIds: [],
                  })
                )
              );
            }

            createdReturnTripForEmail = createdReturnTrips[0] || null;
          } catch (retErr) {
            console.warn('[DispatchBookingEngine] Failed to create linked return trip:', retErr);
          }
        }

        if (repeat && scheduledDate && scheduledTime) {
          const effectiveRecurringSkipDates = standingOrdersConfig.defaultSkipHolidays
            ? Array.from(
                new Set([
                  ...repeatSkipDates,
                  ...standingOrdersConfig.holidayCalendarDates.map((h) => h.date),
                ])
              )
            : repeatSkipDates;
          const extraDates = generateRecurringDates(
            scheduledDate,
            repeatFrequency,
            repeatDays,
            repeatOccurrences,
            repeatUntilDate,
            {
              repeatWeeksPattern,
              skipDates: effectiveRecurringSkipDates,
            }
          );
          const recurringOccurrences: Array<{ date: string; trips: Trip[] }> = [];

          for (let occIdx = 0; occIdx < extraDates.length; occIdx++) {
            const occDate = extraDates[occIdx];
            try {
              const occIso = new Date(`${occDate}T${scheduledTime}:00`).toISOString();
              const occGroupId = isMultiVehicle ? generateMultiCarGroupId() : undefined;
              const occTrips: Trip[] = [];
              for (let cIdx = 0; cIdx < outboundCarSpecs.length; cIdx++) {
                const spec = outboundCarSpecs[cIdx];
                const occCreated = await service.createBooking({
                  bookingType: 'scheduled',
                  scheduledPickupTime: occIso,
                  pickupLocation: {
                    address: pickupAddress,
                    coordinates: pickupCoordinates,
                    placeId: pickupPlaceId,
                    notes: notesForAll || undefined,
                  },
                  dropoffLocation: {
                    address: dropoffAddress,
                    coordinates: dropoffCoordinates,
                    placeId: dropoffPlaceId,
                  },
                  intermediateStops:
                    intermediateStops.length > 0
                      ? intermediateStops.map((s) => ({
                          address: s.address,
                          coordinates: s.coordinates,
                          placeId: s.placeId,
                        }))
                      : undefined,
                  passenger: {
                    firstName,
                    lastName,
                    phone,
                    email,
                    passengerCount: paxAlloc[cIdx],
                    luggageCount: bagAlloc[cIdx],
                    specialRequests: cIdx === 0 ? specialRequests : undefined,
                  },
                  vehicleTier: spec.vehicleTier as VehicleTier,
                  driverNotes: notesForAll,
                  flightNotes: outboundFlightNotes || undefined,
                  pricing: spec.pricing,
                  payment: {
                    method,
                    status: 'pending',
                    amount: spec.fare,
                    corporateAccountId: matchedCorporateAccount?.id,
                  },
                  ...(isMultiVehicle
                    ? {
                        multipleVehiclesRequested: true,
                        vehicleCount: carCount,
                        multiCarGroupId: occGroupId,
                        multiCarIndex: cIdx + 1,
                        multiCarTotal: carCount,
                      }
                    : {}),
                  metadata: {
                    ...metadataPayload,
                    vehicleTypeId: spec.vehicleChoice === 'any' ? 'any' : spec.vehicleTier,
                    vehicleDisplayName: spec.vehicleDisplayName,
                    selectedVehicles: [spec.vehicleChoice],
                    recurringParentTripId: createdTrip.id,
                    recurringOccurrenceIndex: occIdx + 2,
                    createdByRole: 'dispatcher',
                  },
                });
                occTrips.push(occCreated);
              }
              if (isMultiVehicle && occTrips.length > 1 && service.updateTrip) {
                const ids = occTrips.map((t) => t.id);
                const assocs = occTrips.map((t) => buildAssociateEntryFromTrip(t));
                await Promise.all(
                  occTrips.map((t) =>
                    service.updateTrip!(t.id, {
                      multiCarTripIds: ids,
                      multiCarAssociates: assocs,
                      multiCarDriverIds: [],
                    })
                  )
                );
              }
              recurringOccurrences.push({ date: occDate, trips: occTrips });
            } catch (recErr) {
              console.warn(
                `[DispatchBookingEngine] Failed creating recurring occurrence ${occDate}:`,
                recErr
              );
            }
          }

          try {
            await registerStandingOrderFromDispatchBooking({
              primaryTrips: createdOutboundTrips,
              recurringOccurrences,
              passenger: {
                firstName,
                lastName,
                phone,
                email: email || undefined,
                passengerCount: passengers,
                luggageCount: bags,
                specialRequests: specialRequests || undefined,
              },
              route: {
                pickupLocation: {
                  address: pickupAddress,
                  coordinates: pickupCoordinates,
                  placeId: pickupPlaceId,
                  notes: notesForAll || undefined,
                },
                intermediateStops:
                  intermediateStops.length > 0
                    ? intermediateStops.map((s) => ({
                        address: s.address,
                        coordinates: s.coordinates,
                        placeId: s.placeId,
                      }))
                    : undefined,
                dropoffLocation: {
                  address: dropoffAddress,
                  coordinates: dropoffCoordinates,
                  placeId: dropoffPlaceId,
                },
              },
              schedule: {
                startDate: scheduledDate,
                pickupTime: scheduledTime,
                frequency: repeatFrequency,
                repeatDays,
                repeatWeeksPattern,
                untilDate: repeatUntilDate || undefined,
                skipDates: repeatSkipDates,
                skipHolidays: standingOrdersConfig.defaultSkipHolidays,
              },
              skipHolidays: standingOrdersConfig.defaultSkipHolidays,
              standingOrdersConfig,
              vehicleTier: String(tier) as VehicleTier,
              vehicleDisplayName: primaryVehicleDisplayName,
              pricingSnapshot: persistedOutboundPricing,
              paymentMethod: method,
              corporateAccountId: matchedCorporateAccount?.id,
              corporateAccountName:
                paymentMethod === 'account'
                  ? matchedCorporateAccount?.companyName || corporateAccount || undefined
                  : undefined,
              billingPo: paymentMethod === 'account' && billingPo ? billingPo : undefined,
              driverNotes: notesForAll || undefined,
              driverId,
              driverLabel: resolvedPlannedDriverLabel || undefined,
              driverAssignmentMode,
              createdBy: stagingActorUser?.email || stagingActorName,
              metadata: metadataPayload,
              bookingService: service,
            });
          } catch (soErr) {
            console.warn(
              '[DispatchBookingEngine] Non-blocking standing order registration warning:',
              soErr
            );
          }
        }

        if (sendEmailConfirmation && email.trim()) {
          try {
            const cachedAppSettings = getAdminConfigService().getCachedSettings();
            const multiCarEmailLabel = isMultiVehicle
              ? `${carCount} Vehicles (${outboundCarSpecs
                  .map((s) => `${s.vehicleDisplayName} $${s.fare.toFixed(0)}`)
                  .join(', ')})`
              : primaryVehicleDisplayName;
            const multiCarEmailNote = isMultiVehicle
              ? `Multi-Car Convoy (${multiCarGroupId}): ${createdOutboundTrips
                  .map((t, idx) => `Car ${idx + 1} #${t.id.slice(-6).toUpperCase()}`)
                  .join(', ')}.`
              : '';
            const combinedEmailPickupNotes =
              [multiCarEmailNote, notesForAll].filter(Boolean).join(' ') || undefined;

            getEmailDispatchService()
              .sendBookingConfirmation({
                tripId: createdTrip.id,
                trackingToken: createdTrip.trackingToken,
                status: 'CONFIRMED',
                passenger: {
                  firstName,
                  lastName,
                  email: email.trim(),
                  phone,
                },
                pickupAddress,
                pickupNotes: combinedEmailPickupNotes,
                intermediateStops:
                  intermediateStops.length > 0
                    ? intermediateStops.map((s) => ({ address: s.address }))
                    : undefined,
                dropoffAddress,
                pickupTime:
                  timingType === 'later' && scheduledPickupTime
                    ? new Date(scheduledPickupTime).toLocaleString()
                    : 'Immediate Dispatch (ASAP)',
                bookingType: timingType === 'later' ? 'scheduled' : 'asap',
                vehicleTier: String(tier),
                vehicleDisplayName: multiCarEmailLabel,
                passengerCount: passengers,
                luggageCount: bags,
                totalFare: finalFare,
                breakdown: isMultiVehicle
                  ? outboundCarSpecs.map((s) => ({
                      id: `car-${s.carIndex}`,
                      category: 'base' as const,
                      label: `Car ${s.carIndex} of ${carCount} — ${s.vehicleDisplayName}`,
                      amount: s.fare,
                      sourceType: 'tariff' as const,
                    }))
                  : persistedOutboundPricing.breakdown,
                tariffProfileName:
                  persistedOutboundPricing.matchedCorridorName ||
                  persistedOutboundPricing.tariffProfileName,
                currency: 'USD',
                paymentMethod: method,
                specialRequests: specialRequests || undefined,
                carSeatsBreakdown:
                  carSeats && (rearFacingCount > 0 || frontFacingCount > 0 || boosterCount > 0)
                    ? {
                        rearFacing: rearFacingCount,
                        frontFacing: frontFacingCount,
                        booster: boosterCount,
                        total: rearFacingCount + frontFacingCount + boosterCount,
                      }
                    : undefined,
                flightDetails: provideFlightInfo
                  ? {
                      airlineName: airline || undefined,
                      flightNumber: flightNumber || undefined,
                      departureAirport: flightOrigin || undefined,
                      tailNumber: tailNumber || undefined,
                      fboFacility: fboFacility || undefined,
                      isPrivateAviation: Boolean(airportDetection.isPrivateAviation),
                      hasCheckedLuggage,
                      isAirportTrip: Boolean(airportDetection.isAirportTrip),
                    }
                  : undefined,
                returnTripDetails: createdReturnTripForEmail
                  ? {
                      tripId: createdReturnTripForEmail.id,
                      trackingToken: createdReturnTripForEmail.trackingToken,
                      pickupAddress: createdReturnTripForEmail.pickupLocation.address,
                      dropoffAddress: createdReturnTripForEmail.dropoffLocation.address,
                      pickupTime: createdReturnTripForEmail.scheduledPickupTime
                        ? new Date(createdReturnTripForEmail.scheduledPickupTime).toLocaleString()
                        : 'Scheduled Return',
                      vehicleTier: String(createdReturnTripForEmail.vehicleTier),
                      vehicleDisplayName:
                        returnVehicles.length > 1
                          ? `${returnVehicles.length} Return Vehicles`
                          : (createdReturnTripForEmail.metadata?.vehicleDisplayName as string) ||
                            undefined,
                      totalFare: returnLegFare,
                      passengerCount: returnPassengers,
                      luggageCount: returnBags,
                    }
                  : undefined,
                companySettings: {
                  name: cachedAppSettings.company?.name,
                  phone: cachedAppSettings.company?.phone,
                  address: cachedAppSettings.company?.address,
                  email: cachedAppSettings.company?.email,
                },
              })
              .catch((mailErr) => {
                console.warn(
                  '[DispatchBookingEngine] Non-blocking confirmation email warning:',
                  mailErr
                );
              });
          } catch {}
        }

        if (dispatchConsoleConfig.autoClearFormAfterCreate) {
          try {
            localStorage.removeItem(draftStorageKey);
          } catch {}
          onResetAfterCreate?.();
        }
        onBookingSuccess?.(createdTrip, false);
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to save booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeBookingSubmission(false);
  };

  const confirmConflictOverrideAndSubmit = () => {
    void executeBookingSubmission(true);
  };

  const cancelConflictPrompt = () => {
    setIsConflictPromptOpen(false);
  };

  return {
    estimatedFare,
    setEstimatedFare,
    outboundPricing,
    setOutboundPricing,
    returnPricing,
    setReturnPricing,
    vehicleQuotes,
    returnVehicleQuotes,
    isQuoting,
    estimatedDurationMinutes,
    setEstimatedDurationMinutes,
    estimatedDistanceMiles,
    setEstimatedDistanceMiles,
    returnEstimatedDurationMinutes,
    setReturnEstimatedDurationMinutes,
    returnEstimatedDistanceMiles,
    setReturnEstimatedDistanceMiles,
    returnEstimatedFare,
    setReturnEstimatedFare,
    skipFirstEditQuoteRef,
    submitErrorRef,
    isSubmitting,
    submitError,
    setSubmitError,
    bookingConflictSummary,
    isConflictPromptOpen,
    confirmConflictOverrideAndSubmit,
    cancelConflictPrompt,
    handleSubmit,
  };
}
