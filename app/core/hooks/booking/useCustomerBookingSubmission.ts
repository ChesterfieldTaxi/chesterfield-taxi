import { useState, useEffect, useCallback, useRef } from 'react';
import type React from 'react';
import type {
  Trip,
  GeoPoint,
  CreateTripInput,
  VehicleTier,
  PaymentMethod,
  TripLocation,
  TripPricing,
} from '../../types';
import {
  validatePublicCorporateCheckoutGate,
  type CreditLimitEnforcementMode,
  type CustomerBookingConfig,
  type VehicleTierConfig,
} from '../../types/config';
import type { FlightTelemetrySnapshot } from '../../types/flight';
import { parseFlightIdent, type AirportDetectionResult } from '../../config/airports';
import { getBookingService } from '../../services/booking';
import type { QuoteResponse } from '../../services/booking-service';
import {
  generateMultiCarGroupId,
  distributeAcrossCars,
  buildPerVehiclePricingSpecs,
  buildAssociateEntryFromTrip,
} from '../../services/booking/multi-car.util';
import { getFirebaseAuth, isFirebaseConfigured } from '../../services/firebase';
import { getPaymentService } from '../../services/payment.service';
import { getEmailDispatchService } from '../../services/email';
import { formatVehicleTier } from '../../utils/trip-id.util';
import { getAdminConfigService } from '../../services/config/admin-config.service';
import { getAdminAuthService } from '../../services/auth/admin-auth.service';
import {
  sanitizeTextInput,
  VERIFIED_ADDRESS_AUTOCOMPLETE_ERROR,
  hasValidResolvedCoordinates,
  isLikelyGibberishOrNumericName,
  isPublicBookingBotSubmission,
  shouldBlockBookingUnderMaintenance,
} from '../../utils/security-sanitizer.util';
import { hasValidRoutePair } from '../useDebounceRoute';
import {
  DEFAULT_BOOKER_ROLES,
  mapCustomerChoiceToTier,
  resolveAirportZoneId,
  type BookingVehicleChoice as CustomerVehicleChoice,
  type BookingWaypointItem as WaypointItem,
  type BookingAdditionalPassenger as AdditionalPassengerItem,
  type SpecialRequestKey,
  type VehicleCapacityInfo,
} from './booking-form.utils';
import {
  evaluateCorporateCreditLimit,
  validatePoFormatRegex,
} from '../../services/corporate-account.service';
import { useCorporatePoVerification } from './useCorporatePoVerification';

export interface CorporatePortalBookingContext {
  corporateAccountId: string;
  companyName: string;
  accountNumber: string;
  billingCycle?: string;
  discountPercent?: number;
  currentPoNumber?: string;
  poRequired?: boolean;
  poFormatRegex?: string;
  creditLimit?: number;
  currentExposure?: number;
  creditLimitEnforcement?: CreditLimitEnforcementMode;
  costCenter?: string;
  bookerName?: string;
  bookerEmail?: string;
}

export interface BookingEngineV2InitialValues {
  pickupAddress?: string;
  pickupCoordinates?: GeoPoint;
  dropoffAddress?: string;
  dropoffCoordinates?: GeoPoint;
  driverNotes?: string;
  vehicleChoice?: CustomerVehicleChoice;
  passengers?: number;
  timingType?: 'asap' | 'later';
  scheduledDate?: string;
  scheduledTime?: string;
  passengerName?: string;
  passengerPhone?: string;
  passengerEmail?: string;
  paymentMethod?: 'card' | 'cash' | 'account';
  corporateOrgName?: string;
  corporateAccountNumber?: string;
  billingPo?: string;
  authorizedBy?: string;
  costCenter?: string;
  isBookerDifferent?: boolean;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactRole?: string;
}

export interface CustomerBookingFormState {
  // Timing
  timingType: 'asap' | 'later';
  scheduledDate: string;
  scheduledTime: string;

  // Route & Waypoints
  pickupAddress: string;
  pickupPlaceId?: string;
  pickupCoordinates?: GeoPoint;
  dropoffAddress: string;
  dropoffPlaceId?: string;
  dropoffCoordinates?: GeoPoint;
  intermediateStops: WaypointItem[];

  // Airport Assistance
  provideFlightInfo: boolean;
  airline: string;
  flightNumber: string;
  flightOrigin: string;
  tailNumber?: string;
  fboFacility?: string;
  hasCheckedLuggage: boolean;

  // Passenger & Booker
  passengerName: string;
  passengerPhone: string;
  passengerEmail: string;
  additionalPassengers: AdditionalPassengerItem[];

  isBookerDifferent: boolean;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  contactRole: string;

  // Trip Capacity Details
  passengers: number;
  carryOnBags: number;
  checkedBags: number;
  bags: number;
  luggageType: 'standard' | 'carryon_only' | 'oversized';
  hasOversizedLuggage: boolean;
  oversizedLuggageNotes: string;
  oversizedBags: Record<string, number>;
  selectedCustomExtras: Record<string, number>;

  // Child Safety Seats
  carSeats: boolean;
  rearFacingCount: number;
  frontFacingCount: number;
  boosterCount: number;

  // Vehicle
  vehicleChoice: CustomerVehicleChoice;
  isVehicleAutoAssigned: boolean;
  selectedVehicles: CustomerVehicleChoice[];

  // Return Trip (Round Trip)
  returnTrip: boolean;
  returnPickupAddress: string;
  returnPickupCoordinates?: GeoPoint;
  returnDropoffAddress: string;
  returnDropoffCoordinates?: GeoPoint;
  returnIntermediateStops: Array<{
    id?: string;
    address: string;
    coordinates?: GeoPoint;
    placeId?: string;
  }>;
  returnDate: string;
  returnTime: string;
  returnPassengers: number;
  returnCarryOnBags: number;
  returnCheckedBags: number;
  returnBags: number;
  returnHasOversizedLuggage: boolean;
  returnOversizedLuggageNotes: string;
  returnOversizedBags: Record<string, number>;
  returnSelectedCustomExtras: Record<string, number>;
  returnCarSeats: boolean;
  returnRearFacing: number;
  returnFrontFacing: number;
  returnBooster: number;
  returnVehicleChoice: CustomerVehicleChoice;
  returnSelectedVehicles: CustomerVehicleChoice[];

  // Return Trip Airport Assistance
  returnProvideFlightInfo: boolean;
  returnAirline: string;
  returnFlightNumber: string;
  returnFlightOrigin: string;
  returnTailNumber?: string;
  returnFboFacility?: string;
  returnHasCheckedLuggage: boolean;
  returnFlightInfoDismissed?: boolean;

  // Special Requests & Notes
  specialRequests: Record<SpecialRequestKey, boolean>;
  gateCode: string;
  driverNotes: string;
  smsConsent: boolean;

  // Payment
  paymentMethod: 'card' | 'cash' | 'account';
  cardPaymentType: 'terminal' | 'manual';
  cardholderName: string;
  cardNumber: string;
  cardExp: string;
  cardCvc: string;
  cardBrand?: string;
  cardLast4?: string;
  paymentToken?: string;
  saveCardOnFile: boolean;

  corporateOrgName: string;
  corporateAccountNumber: string;
  billingPo: string;
  authorizedBy: string;
  costCenter: string;
  invoicingTerms: string;
  websiteUrl?: string;
  botTrapField?: string;
}

export interface CustomerEmailDeliveryFeedback {
  status: 'idle' | 'sending' | 'sent' | 'simulated' | 'failed';
  recipient?: string;
  messageId?: string;
  error?: string;
}

export function createInitialCustomerBookingFormState(
  initialValues?: BookingEngineV2InitialValues,
  corporatePortalContext?: CorporatePortalBookingContext
): CustomerBookingFormState {
  const initialVehicleChoice = initialValues?.vehicleChoice || 'any';
  const initialPassengers =
    typeof initialValues?.passengers === 'number' &&
    Number.isFinite(initialValues.passengers) &&
    initialValues.passengers >= 1
      ? Math.min(14, Math.max(1, Math.trunc(initialValues.passengers)))
      : 1;

  return {
    timingType: initialValues?.timingType || 'later',
    scheduledDate: initialValues?.scheduledDate || '',
    scheduledTime: initialValues?.scheduledTime || '',

    pickupAddress: initialValues?.pickupAddress || '',
    pickupCoordinates: initialValues?.pickupCoordinates,
    dropoffAddress: initialValues?.dropoffAddress || '',
    dropoffCoordinates: initialValues?.dropoffCoordinates,
    intermediateStops: [],

    provideFlightInfo: false,
    airline: '',
    flightNumber: '',
    flightOrigin: '',
    tailNumber: '',
    fboFacility: '',
    hasCheckedLuggage: false,

    passengerName: initialValues?.passengerName || '',
    passengerPhone: initialValues?.passengerPhone || '',
    passengerEmail: initialValues?.passengerEmail || '',
    additionalPassengers: [],

    isBookerDifferent: initialValues?.isBookerDifferent ?? false,
    contactName: initialValues?.contactName || '',
    contactPhone: initialValues?.contactPhone || '',
    contactEmail: initialValues?.contactEmail || '',
    contactRole: initialValues?.contactRole || DEFAULT_BOOKER_ROLES[0],

    passengers: initialPassengers,
    carryOnBags: 1,
    checkedBags: 0,
    bags: 1,
    luggageType: 'standard',
    hasOversizedLuggage: false,
    oversizedLuggageNotes: '',
    oversizedBags: {},
    selectedCustomExtras: {},

    carSeats: false,
    rearFacingCount: 0,
    frontFacingCount: 0,
    boosterCount: 0,

    vehicleChoice: initialVehicleChoice,
    isVehicleAutoAssigned: initialVehicleChoice === 'any',
    selectedVehicles: [initialVehicleChoice],

    returnTrip: false,
    returnPickupAddress: '',
    returnDropoffAddress: '',
    returnIntermediateStops: [],
    returnDate: '',
    returnTime: '',
    returnPassengers: 1,
    returnCarryOnBags: 1,
    returnCheckedBags: 0,
    returnBags: 1,
    returnHasOversizedLuggage: false,
    returnOversizedLuggageNotes: '',
    returnOversizedBags: {},
    returnSelectedCustomExtras: {},
    returnCarSeats: false,
    returnRearFacing: 0,
    returnFrontFacing: 0,
    returnBooster: 0,
    returnVehicleChoice: 'any',
    returnSelectedVehicles: ['any'],
    returnProvideFlightInfo: false,
    returnAirline: '',
    returnFlightNumber: '',
    returnFlightOrigin: '',
    returnTailNumber: '',
    returnFboFacility: '',
    returnHasCheckedLuggage: false,

    specialRequests: {
      petFriendly: false,
      quietRide: false,
      musicOk: false,
    },
    gateCode: '',
    driverNotes: initialValues?.driverNotes || '',
    smsConsent: true,

    paymentMethod: corporatePortalContext
      ? 'account'
      : initialValues?.paymentMethod || 'card',
    cardPaymentType: 'terminal',
    cardholderName: '',
    cardNumber: '',
    cardExp: '',
    cardCvc: '',
    cardBrand: '',
    cardLast4: '',
    paymentToken: '',
    saveCardOnFile: false,

    corporateOrgName:
      corporatePortalContext?.companyName || initialValues?.corporateOrgName || '',
    corporateAccountNumber:
      corporatePortalContext?.accountNumber || initialValues?.corporateAccountNumber || '',
    billingPo:
      corporatePortalContext?.currentPoNumber || initialValues?.billingPo || '',
    authorizedBy:
      corporatePortalContext?.bookerName ||
      corporatePortalContext?.bookerEmail ||
      initialValues?.authorizedBy ||
      '',
    costCenter:
      corporatePortalContext?.costCenter || initialValues?.costCenter || '',
    invoicingTerms: corporatePortalContext?.billingCycle
      ? `${corporatePortalContext.billingCycle.toUpperCase()} Direct Bill`
      : 'Net 30 Direct Bill',
    websiteUrl: '',
    botTrapField: '',
  };
}

export function buildBookAnotherCustomerResetState(
  prev: CustomerBookingFormState
): CustomerBookingFormState {
  return {
    ...prev,
  pickupAddress: '',
  pickupCoordinates: undefined,
  pickupPlaceId: undefined,
  dropoffAddress: '',
  dropoffCoordinates: undefined,
  dropoffPlaceId: undefined,
    intermediateStops: [],
    returnTrip: false,
    returnPickupAddress: '',
    returnPickupCoordinates: undefined,
    returnDropoffAddress: '',
    returnDropoffCoordinates: undefined,
    returnIntermediateStops: [],
    returnDate: '',
    returnTime: '',
    returnPassengers: 1,
    returnCarryOnBags: 1,
    returnCheckedBags: 0,
    returnBags: 1,
    returnHasOversizedLuggage: false,
    returnOversizedLuggageNotes: '',
    returnOversizedBags: {},
    returnSelectedCustomExtras: {},
    returnCarSeats: false,
    returnRearFacing: 0,
    returnFrontFacing: 0,
    returnBooster: 0,
    returnVehicleChoice: 'any',
    returnSelectedVehicles: ['any'],
    driverNotes: '',
    gateCode: '',
    airline: '',
    flightNumber: '',
    flightOrigin: '',
    hasCheckedLuggage: false,
    provideFlightInfo: false,
    returnProvideFlightInfo: false,
    returnAirline: '',
    returnFlightNumber: '',
    returnFlightOrigin: '',
    returnHasCheckedLuggage: false,
  };
}

export interface UseCustomerBookingSubmissionParams {
  form: CustomerBookingFormState;
  bookingConfig: CustomerBookingConfig;
  companyConfig?: {
    name?: string;
    phone?: string;
    address?: string;
    email?: string;
  };
  activeVehicleTiers: VehicleTierConfig[];
  vehicleCapacities: Record<string, VehicleCapacityInfo>;
  totalMaxPassengers: number;
  totalMaxBags: number;
  returnTotalMaxPassengers: number;
  returnTotalMaxBags: number;
  totalCarSeats: number;
  returnTotalCarSeats: number;
  oversizedItemsSummary?: string;
  returnOversizedItemsSummary?: string;
  selectedCustomExtrasSummary?: string;
  returnSelectedCustomExtrasSummary?: string;
  isSymmetricRoundTrip: boolean;
  airportDetection: AirportDetectionResult;
  returnAirportDetection: AirportDetectionResult;
  outboundFlightTelemetry: FlightTelemetrySnapshot | null;
  returnFlightTelemetry: FlightTelemetrySnapshot | null;
  stripeOnlineEnabled: boolean;
  surchargesVersion: number;
  editingTripId?: string;
  corporatePortalContext?: CorporatePortalBookingContext;
  mountedAtMsRef?: React.RefObject<number>;
  isPublicWebForm?: boolean;
  onBookingSuccess?: (trip: Trip) => void;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export interface UseCustomerBookingSubmissionResult {
  quote: QuoteResponse | null;
  setQuote: React.Dispatch<React.SetStateAction<QuoteResponse | null>>;
  isQuoteLoading: boolean;
  quoteError: string | null;
  returnQuote: QuoteResponse | null;
  setReturnQuote: React.Dispatch<React.SetStateAction<QuoteResponse | null>>;
  isReturnQuoteLoading: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  setSubmitError: React.Dispatch<React.SetStateAction<string | null>>;
  confirmedTrip: Trip | null;
  setConfirmedTrip: React.Dispatch<React.SetStateAction<Trip | null>>;
  emailDelivery: CustomerEmailDeliveryFeedback;
  handleBookRide: (e: React.FormEvent) => Promise<void>;
}

export function useCustomerBookingSubmission({
  form,
  bookingConfig,
  companyConfig,
  activeVehicleTiers,
  vehicleCapacities,
  totalMaxPassengers,
  totalMaxBags,
  returnTotalMaxPassengers,
  returnTotalMaxBags,
  totalCarSeats,
  returnTotalCarSeats,
  oversizedItemsSummary,
  returnOversizedItemsSummary,
  selectedCustomExtrasSummary,
  returnSelectedCustomExtrasSummary,
  isSymmetricRoundTrip,
  airportDetection,
  returnAirportDetection,
  outboundFlightTelemetry,
  returnFlightTelemetry,
  stripeOnlineEnabled,
  surchargesVersion,
  editingTripId,
  corporatePortalContext,
  mountedAtMsRef,
  isPublicWebForm = true,
  onBookingSuccess,
  setErrors,
}: UseCustomerBookingSubmissionParams): UseCustomerBookingSubmissionResult {
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [returnQuote, setReturnQuote] = useState<QuoteResponse | null>(null);
  const [isReturnQuoteLoading, setIsReturnQuoteLoading] = useState(false);

  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedTrip, setConfirmedTrip] = useState<Trip | null>(null);
  const [emailDelivery, setEmailDelivery] = useState<CustomerEmailDeliveryFeedback>({
    status: 'idle',
  });

  const { verifyCustomerAccount } = useCorporatePoVerification({
    paymentMethod: form.paymentMethod,
  });

  const mapChoiceToTier = mapCustomerChoiceToTier;

  // Live Outbound Quote Calculation
  const fetchLiveQuote = useCallback(async () => {
    if (!form.pickupAddress || !form.dropoffAddress) {
      setQuote(null);
      return;
    }

    const hasValidEndpoints = hasValidRoutePair(
      form.pickupCoordinates || form.pickupAddress,
      form.dropoffCoordinates || form.dropoffAddress,
      form.pickupPlaceId,
      form.dropoffPlaceId
    );

    if (!hasValidEndpoints) return;

    setIsQuoteLoading(true);
    setQuoteError(null);

    try {
      const bookingService = getBookingService();
      const validStops = form.intermediateStops
        .filter((s) => s.address && s.address.trim().length > 0)
        .map((s) => ({
          address: s.address,
          placeId: s.placeId,
          coordinates: s.coordinates,
        }));

      const scheduledPickupTime =
        form.timingType === 'later' && form.scheduledDate && form.scheduledTime
          ? new Date(`${form.scheduledDate}T${form.scheduledTime}:00`).toISOString()
          : undefined;

      const allVehicleIds = activeVehicleTiers.map((t) => t.id);
      const activeOversizedBags = form.hasOversizedLuggage ? form.oversizedBags : undefined;
      const activeCustomExtras = Object.values(form.selectedCustomExtras || {}).some((q) => q > 0)
        ? form.selectedCustomExtras
        : undefined;

      if (bookingConfig.allowMultiVehicle && form.selectedVehicles.length > 1) {
        const vehicleQuotes = await Promise.all(
          form.selectedVehicles.map((vChoice) =>
            bookingService.calculateQuote({
              pickupLocation: {
                address: form.pickupAddress,
                placeId: form.pickupPlaceId,
                coordinates: form.pickupCoordinates,
              },
              dropoffLocation: {
                address: form.dropoffAddress,
                placeId: form.dropoffPlaceId,
                coordinates: form.dropoffCoordinates,
              },
              intermediateStops: validStops.length > 0 ? validStops : undefined,
              vehicleTier: mapChoiceToTier(vChoice),
              vehicleType: vChoice,
              bookingType: form.timingType === 'later' ? 'scheduled' : 'asap',
              scheduledPickupTime,
              passengerCount: Math.max(
                1,
                Math.ceil(form.passengers / form.selectedVehicles.length)
              ),
              luggageCount: Math.max(0, Math.ceil(form.bags / form.selectedVehicles.length)),
              oversizedBags: activeOversizedBags,
              selectedCustomExtras: activeCustomExtras,
              evaluateAllVehicleIds: allVehicleIds,
              carSeatsBreakdown: {
                rearFacing: form.rearFacingCount,
                frontFacing: form.frontFacingCount,
                booster: form.boosterCount,
                total: totalCarSeats,
              },
              carSeatsCount: totalCarSeats,
              equipment: {
                carSeats: totalCarSeats,
                luggageCount: form.bags,
                hasOversizedLuggage: form.hasOversizedLuggage,
                luggageType: form.luggageType,
                petCarrier: form.specialRequests.petFriendly,
              },
              isAirportPickup: airportDetection.isPickupAirport,
              isAirportDropoff: airportDetection.isDropoffAirport,
              isAirportTrip: airportDetection.isAirportTrip,
              originZoneId: resolveAirportZoneId(
                airportDetection.isPickupAirport,
                airportDetection.airport?.iataCode
              ),
              destinationZoneId: resolveAirportZoneId(
                airportDetection.isDropoffAirport,
                airportDetection.airport?.iataCode
              ),
            })
          )
        );

        const combinedQuote: QuoteResponse = {
          ...vehicleQuotes[0],
          pricing: {
            ...vehicleQuotes[0].pricing,
            totalFare: vehicleQuotes.reduce((sum, q) => sum + q.pricing.totalFare, 0),
            subtotal: vehicleQuotes.reduce((sum, q) => sum + q.pricing.subtotal, 0),
            baseFare: vehicleQuotes.reduce((sum, q) => sum + q.pricing.baseFare, 0),
          },
        };
        setQuote(combinedQuote);
      } else {
        const quoteRes = await bookingService.calculateQuote({
          pickupLocation: {
            address: form.pickupAddress,
            placeId: form.pickupPlaceId,
            coordinates: form.pickupCoordinates,
          },
          dropoffLocation: {
            address: form.dropoffAddress,
            placeId: form.dropoffPlaceId,
            coordinates: form.dropoffCoordinates,
          },
          intermediateStops: validStops.length > 0 ? validStops : undefined,
          vehicleTier: mapChoiceToTier(form.vehicleChoice),
          vehicleType: form.vehicleChoice,
          bookingType: form.timingType === 'later' ? 'scheduled' : 'asap',
          scheduledPickupTime,
          passengerCount: form.passengers,
          luggageCount: form.bags,
          oversizedBags: activeOversizedBags,
          selectedCustomExtras: activeCustomExtras,
          evaluateAllVehicleIds: allVehicleIds,
          carSeatsBreakdown: {
            rearFacing: form.rearFacingCount,
            frontFacing: form.frontFacingCount,
            booster: form.boosterCount,
            total: totalCarSeats,
          },
          carSeatsCount: totalCarSeats,
          equipment: {
            carSeats: totalCarSeats,
            luggageCount: form.bags,
            hasOversizedLuggage: form.hasOversizedLuggage,
            luggageType: form.luggageType,
            petCarrier: form.specialRequests.petFriendly,
          },
          isAirportPickup: airportDetection.isPickupAirport,
          isAirportDropoff: airportDetection.isDropoffAirport,
          isAirportTrip: airportDetection.isAirportTrip,
          originZoneId: resolveAirportZoneId(
            airportDetection.isPickupAirport,
            airportDetection.airport?.iataCode
          ),
          destinationZoneId: resolveAirportZoneId(
            airportDetection.isDropoffAirport,
            airportDetection.airport?.iataCode
          ),
        });

        setQuote(quoteRes);
      }
    } catch (err: unknown) {
      console.warn('[BookingEngineV2] Quote calculation failed:', err);
      setQuoteError('Unable to calculate upfront route fare. Please verify your addresses.');
    } finally {
      setIsQuoteLoading(false);
    }
  }, [
    form.pickupAddress,
    form.dropoffAddress,
    form.pickupPlaceId,
    form.dropoffPlaceId,
    form.pickupCoordinates,
    form.dropoffCoordinates,
    form.intermediateStops,
    form.vehicleChoice,
    form.selectedVehicles,
    bookingConfig.allowMultiVehicle,
    form.timingType,
    form.scheduledDate,
    form.scheduledTime,
    form.passengers,
    form.bags,
    form.rearFacingCount,
    form.frontFacingCount,
    form.boosterCount,
    totalCarSeats,
    form.hasOversizedLuggage,
    form.oversizedBags,
    form.selectedCustomExtras,
    form.specialRequests.petFriendly,
    form.luggageType,
    activeVehicleTiers,
    airportDetection,
    mapChoiceToTier,
    surchargesVersion,
  ]);

  // Live Return Trip Quote Calculation
  const fetchReturnQuote = useCallback(async () => {
    if (!form.returnTrip || !form.returnPickupAddress || !form.returnDropoffAddress) {
      setReturnQuote(null);
      return;
    }

    setIsReturnQuoteLoading(true);
    try {
      const bookingService = getBookingService();
      const validStops = form.returnIntermediateStops
        .filter((s) => s.address && s.address.trim().length > 0)
        .map((s) => ({
          address: s.address,
          placeId: s.placeId,
          coordinates: s.coordinates,
        }));

      const returnScheduledTime =
        form.returnDate && form.returnTime
          ? new Date(`${form.returnDate}T${form.returnTime}:00`).toISOString()
          : undefined;

      const allVehicleIds = activeVehicleTiers.map((t) => t.id);
      const activeReturnOversizedBags = form.returnHasOversizedLuggage
        ? form.returnOversizedBags
        : undefined;
      const activeReturnCustomExtras = Object.values(form.returnSelectedCustomExtras || {}).some(
        (q) => q > 0
      )
        ? form.returnSelectedCustomExtras
        : undefined;

      if (bookingConfig.allowMultiVehicle && form.returnSelectedVehicles.length > 1) {
        const returnQuotes = await Promise.all(
          form.returnSelectedVehicles.map((vChoice) =>
            bookingService.calculateQuote({
              pickupLocation: {
                address: form.returnPickupAddress,
                coordinates: form.returnPickupCoordinates,
              },
              dropoffLocation: {
                address: form.returnDropoffAddress,
                coordinates: form.returnDropoffCoordinates,
              },
              intermediateStops: validStops.length > 0 ? validStops : undefined,
              vehicleTier: mapChoiceToTier(vChoice),
              vehicleType: vChoice,
              bookingType: 'scheduled',
              scheduledPickupTime: returnScheduledTime,
              passengerCount: Math.max(
                1,
                Math.ceil(form.returnPassengers / form.returnSelectedVehicles.length)
              ),
              luggageCount: Math.max(
                0,
                Math.ceil(form.returnBags / form.returnSelectedVehicles.length)
              ),
              oversizedBags: activeReturnOversizedBags,
              selectedCustomExtras: activeReturnCustomExtras,
              evaluateAllVehicleIds: allVehicleIds,
              carSeatsBreakdown: {
                rearFacing: form.returnRearFacing,
                frontFacing: form.returnFrontFacing,
                booster: form.returnBooster,
                total: returnTotalCarSeats,
              },
              carSeatsCount: returnTotalCarSeats,
              equipment: {
                carSeats: returnTotalCarSeats,
                luggageCount: form.returnBags,
                hasOversizedLuggage: form.returnHasOversizedLuggage,
                petCarrier: form.specialRequests.petFriendly,
              },
              isAirportPickup: returnAirportDetection.isPickupAirport,
              isAirportDropoff: returnAirportDetection.isDropoffAirport,
              isAirportTrip: returnAirportDetection.isAirportTrip,
              originZoneId: resolveAirportZoneId(
                returnAirportDetection.isPickupAirport,
                returnAirportDetection.airport?.iataCode
              ),
              destinationZoneId: resolveAirportZoneId(
                returnAirportDetection.isDropoffAirport,
                returnAirportDetection.airport?.iataCode
              ),
            })
          )
        );

        const combinedRetQuote: QuoteResponse = {
          ...returnQuotes[0],
          pricing: {
            ...returnQuotes[0].pricing,
            totalFare: returnQuotes.reduce((sum, q) => sum + q.pricing.totalFare, 0),
            subtotal: returnQuotes.reduce((sum, q) => sum + q.pricing.subtotal, 0),
            baseFare: returnQuotes.reduce((sum, q) => sum + q.pricing.baseFare, 0),
          },
        };
        setReturnQuote(combinedRetQuote);
      } else {
        const retQuoteRes = await bookingService.calculateQuote({
          pickupLocation: {
            address: form.returnPickupAddress,
            coordinates: form.returnPickupCoordinates,
          },
          dropoffLocation: {
            address: form.returnDropoffAddress,
            coordinates: form.returnDropoffCoordinates,
          },
          intermediateStops: validStops.length > 0 ? validStops : undefined,
          vehicleTier: mapChoiceToTier(form.returnVehicleChoice),
          vehicleType: form.returnVehicleChoice,
          bookingType: 'scheduled',
          scheduledPickupTime: returnScheduledTime,
          passengerCount: form.returnPassengers,
          luggageCount: form.returnBags,
          oversizedBags: activeReturnOversizedBags,
          selectedCustomExtras: activeReturnCustomExtras,
          evaluateAllVehicleIds: allVehicleIds,
          carSeatsBreakdown: {
            rearFacing: form.returnRearFacing,
            frontFacing: form.returnFrontFacing,
            booster: form.returnBooster,
            total: returnTotalCarSeats,
          },
          carSeatsCount: returnTotalCarSeats,
          equipment: {
            carSeats: returnTotalCarSeats,
            luggageCount: form.returnBags,
            hasOversizedLuggage: form.returnHasOversizedLuggage,
            petCarrier: form.specialRequests.petFriendly,
          },
          isAirportPickup: returnAirportDetection.isPickupAirport,
          isAirportDropoff: returnAirportDetection.isDropoffAirport,
          isAirportTrip: returnAirportDetection.isAirportTrip,
          originZoneId: resolveAirportZoneId(
            returnAirportDetection.isPickupAirport,
            returnAirportDetection.airport?.iataCode
          ),
          destinationZoneId: resolveAirportZoneId(
            returnAirportDetection.isDropoffAirport,
            returnAirportDetection.airport?.iataCode
          ),
        });

        setReturnQuote(retQuoteRes);
      }
    } catch (err: unknown) {
      console.warn('[BookingEngineV2] Return quote calculation failed:', err);
    } finally {
      setIsReturnQuoteLoading(false);
    }
  }, [
    form.returnTrip,
    form.returnPickupAddress,
    form.returnDropoffAddress,
    form.returnPickupCoordinates,
    form.returnDropoffCoordinates,
    form.returnIntermediateStops,
    form.returnVehicleChoice,
    form.returnSelectedVehicles,
    bookingConfig.allowMultiVehicle,
    activeVehicleTiers,
    form.returnDate,
    form.returnTime,
    form.returnPassengers,
    form.returnBags,
    form.returnHasOversizedLuggage,
    form.returnOversizedBags,
    form.returnSelectedCustomExtras,
    form.returnRearFacing,
    form.returnFrontFacing,
    form.returnBooster,
    form.specialRequests.petFriendly,
    returnTotalCarSeats,
    returnAirportDetection,
    mapChoiceToTier,
    surchargesVersion,
  ]);

  // Debounce quote calls (800ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLiveQuote();
    }, 800);
    return () => clearTimeout(timer);
  }, [fetchLiveQuote]);

  useEffect(() => {
    if (!form.returnTrip) {
      setReturnQuote(null);
      return;
    }
    const timer = setTimeout(() => {
      fetchReturnQuote();
    }, 800);
    return () => clearTimeout(timer);
  }, [fetchReturnQuote, form.returnTrip]);

  // Form Validation with Customer Restrictions
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.pickupAddress.trim()) {
      newErrors.pickupAddress = 'Pickup location is required.';
    } else if (!hasValidResolvedCoordinates(form.pickupCoordinates)) {
      newErrors.pickupAddress = VERIFIED_ADDRESS_AUTOCOMPLETE_ERROR;
    }
    if (!form.dropoffAddress.trim()) {
      newErrors.dropoffAddress = 'Dropoff destination is required.';
    } else if (!hasValidResolvedCoordinates(form.dropoffCoordinates)) {
      newErrors.dropoffAddress = VERIFIED_ADDRESS_AUTOCOMPLETE_ERROR;
    }

    if (form.timingType === 'later') {
      if (!form.scheduledDate) {
        newErrors.scheduledDate = 'Please select a date.';
      }
      if (!form.scheduledTime) {
        newErrors.scheduledTime = 'Please select a pickup time.';
      }

      // Customer Scheduling Guard: Must be at least X minutes in the future
      if (form.scheduledDate && form.scheduledTime) {
        const scheduledMs = new Date(`${form.scheduledDate}T${form.scheduledTime}:00`).getTime();
        const nowMs = Date.now();
        const diffMinutes = (scheduledMs - nowMs) / (1000 * 60);
        const minNotice = bookingConfig.minAdvanceNoticeMinutes ?? 30;
        if (diffMinutes < minNotice - 5) {
          newErrors.scheduledTime = `Scheduled rides require at least ${minNotice} minutes advance notice.${
            bookingConfig.allowImmediateAsap
              ? ' Please select "Now (ASAP)" for immediate dispatch.'
              : ''
          }`;
        }
      }
    }

    if (!form.passengerName.trim()) {
      newErrors.passengerName = 'Passenger full name is required.';
    } else if (isLikelyGibberishOrNumericName(form.passengerName)) {
      newErrors.passengerName = 'Please enter a valid passenger first and last name.';
    }
    if (!form.passengerPhone.trim()) {
      newErrors.passengerPhone = 'Passenger mobile phone number is required.';
    }
    if (!form.passengerEmail.trim()) {
      newErrors.passengerEmail = 'Passenger email address is required for receipts.';
    }

    if (form.isBookerDifferent) {
      if (!form.contactName.trim()) {
        newErrors.contactName = 'Booker / Contact person name is required.';
      } else if (isLikelyGibberishOrNumericName(form.contactName)) {
        newErrors.contactName = 'Please enter a valid booker / contact name.';
      }
      if (!form.contactPhone.trim()) {
        newErrors.contactPhone = 'Booker phone number is required.';
      }
      if (!form.contactEmail.trim()) {
        newErrors.contactEmail = 'Booker email address is required for invoices.';
      }
    }

    // Airport flight number guard (only when pickup is an airport and flight tracking is active)
    if (
      bookingConfig.requireFlightNumberForAirport &&
      airportDetection.isPickupAirport &&
      form.provideFlightInfo
    ) {
      if (airportDetection.isPrivateAviation) {
        if (!form.tailNumber?.trim()) {
          newErrors.tailNumber = 'Tail number is required for private aviation pickups.';
        }
      } else {
        if (!form.flightNumber.trim()) {
          newErrors.flightNumber = 'Flight number (1 to 4 digits) is required for airport pickups.';
        } else if (!/^\d{1,4}$/.test(form.flightNumber.trim())) {
          newErrors.flightNumber = 'Commercial flight number must be 1 to 4 digits only.';
        }
      }
    }

    // Fleet capacity check
    if (form.passengers > totalMaxPassengers) {
      newErrors.passengers = `Passenger count (${form.passengers}) exceeds fleet capacity (${totalMaxPassengers}). Please add another vehicle or contact dispatch.`;
    }
    if (form.bags > totalMaxBags) {
      newErrors.bags = `Luggage count (${form.bags}) exceeds fleet capacity (${totalMaxBags}). Please add another vehicle or contact dispatch.`;
    }

    if (form.returnTrip) {
      if (!form.returnPickupAddress.trim()) {
        newErrors.returnPickupAddress = 'Return pickup address is required.';
      } else if (!hasValidResolvedCoordinates(form.returnPickupCoordinates)) {
        newErrors.returnPickupAddress = VERIFIED_ADDRESS_AUTOCOMPLETE_ERROR;
      }
      if (!form.returnDropoffAddress.trim()) {
        newErrors.returnDropoffAddress = 'Return dropoff address is required.';
      } else if (!hasValidResolvedCoordinates(form.returnDropoffCoordinates)) {
        newErrors.returnDropoffAddress = VERIFIED_ADDRESS_AUTOCOMPLETE_ERROR;
      }
      if (!form.returnDate) {
        newErrors.returnDate = 'Return date is required.';
      }
      if (!form.returnTime) {
        newErrors.returnTime = 'Return time is required.';
      }
      if (
        form.returnDate &&
        form.returnTime &&
        form.timingType === 'later' &&
        form.scheduledDate &&
        form.scheduledTime
      ) {
        const outboundMs = new Date(`${form.scheduledDate}T${form.scheduledTime}:00`).getTime();
        const returnMs = new Date(`${form.returnDate}T${form.returnTime}:00`).getTime();
        if (returnMs <= outboundMs) {
          newErrors.returnTime = 'Return pickup must be after the outbound pickup time.';
        }
      }
      if (form.returnPassengers > returnTotalMaxPassengers) {
        newErrors.returnPassengers = `Return passenger count (${form.returnPassengers}) exceeds vehicle capacity (${returnTotalMaxPassengers}).`;
      }
      if (form.returnBags > returnTotalMaxBags) {
        newErrors.returnBags = `Return luggage count (${form.returnBags}) exceeds vehicle capacity (${returnTotalMaxBags}).`;
      }
      if (
        bookingConfig.requireFlightNumberForAirport &&
        returnAirportDetection.isPickupAirport &&
        form.returnProvideFlightInfo
      ) {
        if (returnAirportDetection.isPrivateAviation) {
          if (!form.returnTailNumber?.trim()) {
            newErrors.returnTailNumber =
              'Tail number is required for return private aviation pickups.';
          }
        } else {
          if (!form.returnFlightNumber.trim()) {
            newErrors.returnFlightNumber =
              'Flight number (1 to 4 digits) is required for return airport pickups.';
          } else if (!/^\d{1,4}$/.test(form.returnFlightNumber.trim())) {
            newErrors.returnFlightNumber = 'Commercial flight number must be 1 to 4 digits only.';
          }
        }
      }
    }

    if (form.paymentMethod === 'card' && stripeOnlineEnabled && form.cardPaymentType === 'manual') {
      if (!form.paymentToken || form.paymentToken === 'pay_in_cab') {
        newErrors.paymentToken =
          'Please enter complete card details or choose "Pay Driver in Car".';
      }
    }

    if (form.paymentMethod === 'account') {
      const corpGate = validatePublicCorporateCheckoutGate({
        paymentMethod: form.paymentMethod,
        bookingConfig,
        hasCorporatePortalContext: Boolean(corporatePortalContext),
      });
      if (!corpGate.allowed) {
        newErrors.paymentMethod =
          corpGate.error ||
          'Company account rides must be booked through the Corporate Portal (/app/corporate).';
      } else {
        if (!form.corporateOrgName.trim()) {
          newErrors.corporateOrgName = 'Organization / Company name is required.';
        }
        if (!form.corporateAccountNumber.trim()) {
          newErrors.corporateAccountNumber = 'Corporate account number is required.';
        }
      }
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      const firstKey = Object.keys(newErrors)[0];
      const el =
        document.querySelector(`[name="${firstKey}"]`) ||
        document.querySelector(`[data-field="${firstKey}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (el instanceof HTMLElement && typeof el.focus === 'function') {
          el.focus({ preventScroll: true });
        }
      }
      return false;
    }

    return true;
  };

  // Submit Handler
  const handleBookRide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) return;

    // Security Guard 1: Block submissions when global Maintenance Mode is ON for non-staff non-localhost browsers
    try {
      const cachedSettings = getAdminConfigService().getCachedSettings();
      const currentUser = getAdminAuthService().getCurrentUser();
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      if (
        shouldBlockBookingUnderMaintenance({
          constructionMode: cachedSettings?.constructionMode,
          hostname,
          userRole: currentUser?.role,
          userRoles: currentUser?.roles,
        })
      ) {
        setSubmitError(
          'Online booking is temporarily paused for scheduled maintenance. Please call 24/7 Dispatch directly.'
        );
        return;
      }
    } catch {}

    // Security Guard 2: Offscreen Honeypot (`websiteUrl`) & < 4000ms Dwell-Time Bot Trap
    if (
      isPublicBookingBotSubmission({
        honeypotValue: form.botTrapField,
        websiteUrl: form.websiteUrl,
        mountedAtMs: mountedAtMsRef?.current ?? null,
        submittedAtMs: Date.now(),
        isPublicWebForm,
      })
    ) {
      console.warn(
        '[BookingEngineV2] Bot honeypot or sub-4s dwell trap triggered. Suppressing automated spam submission.'
      );
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      const fakeTripId = `CT-${Math.floor(10000 + Math.random() * 90000)}`;
      setConfirmedTrip({
        id: fakeTripId,
        status: 'UNCONFIRMED',
        bookingType: form.timingType === 'later' ? 'scheduled' : 'asap',
        pickupLocation: { address: sanitizeTextInput(form.pickupAddress) },
        dropoffLocation: { address: sanitizeTextInput(form.dropoffAddress) },
        passenger: {
          firstName: sanitizeTextInput(form.passengerName).split(/\s+/)[0] || 'Guest',
          lastName:
            sanitizeTextInput(form.passengerName).split(/\s+/).slice(1).join(' ') || '',
          email: sanitizeTextInput(form.passengerEmail),
          phone: sanitizeTextInput(form.passengerPhone),
          passengerCount: form.passengers,
          luggageCount: form.bags,
        },
        pricing: {
          baseFare: 5.0,
          distanceMiles: 10,
          durationMinutes: 20,
          distanceRate: 2.5,
          timeRate: 0,
          totalFare: 45.0,
          subtotal: 45.0,
          currency: 'USD',
          vehicleMultiplier: 1,
          surgeMultiplier: 1,
          discountAmount: 0,
        },
        payment: { method: 'card', status: 'pending', amount: 45.0 },
      } as Trip);
      return;
    }

    if (!validateForm()) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const bookingService = getBookingService();

      const pickupLocation: TripLocation = {
        address: sanitizeTextInput(form.pickupAddress, 300),
        placeId: form.pickupPlaceId,
        coordinates: form.pickupCoordinates || { lat: 38.6631, lng: -90.5771 },
      };

      const dropoffLocation: TripLocation = {
        address: sanitizeTextInput(form.dropoffAddress, 300),
        placeId: form.dropoffPlaceId,
        coordinates: form.dropoffCoordinates || { lat: 38.627, lng: -90.1994 },
      };

      const intermediateStopsLocations: TripLocation[] = form.intermediateStops
        .filter((s) => s.address && s.address.trim().length > 0)
        .map((s) => ({
          address: s.address.trim(),
          placeId: s.placeId,
          coordinates: s.coordinates || { lat: 38.64, lng: -90.35 },
        }));

      // Special requests labels
      const activeSpecialRequests = Object.entries(form.specialRequests)
        .filter(([, active]) => active)
        .map(([k]) => {
          if (k === 'petFriendly') return 'Pet-friendly';
          if (k === 'quietRide') return 'Quiet ride';
          if (k === 'musicOk') return 'Music OK';
          return k;
        });

      let combinedNotes = form.driverNotes.trim();
      if (form.gateCode.trim()) {
        combinedNotes = `[Gate Code: ${form.gateCode.trim()}] ${combinedNotes}`.trim();
      }
      if (activeSpecialRequests.length > 0) {
        combinedNotes = `[Requests: ${activeSpecialRequests.join(', ')}] ${combinedNotes}`.trim();
      }
      if (form.provideFlightInfo && (form.airline || form.flightNumber)) {
        combinedNotes = `[Flight: ${form.airline} #${form.flightNumber} from ${
          form.flightOrigin || 'N/A'
        }${form.hasCheckedLuggage ? ' (Checked Luggage)' : ''}] ${combinedNotes}`.trim();
      }

      const resolvedOutboundPricing =
        (!bookingConfig.allowMultiVehicle && quote?.vehicleQuotes?.[form.vehicleChoice]) ||
        quote?.pricing;

      let effectivePricing: TripPricing = resolvedOutboundPricing || {
        baseFare: 5.0,
        distanceMiles: 5,
        durationMinutes: 15,
        distanceRate: 2.5,
        timeRate: 0.5,
        vehicleMultiplier: 1.0,
        surgeMultiplier: 1.0,
        discountAmount: 0,
        subtotal: 25.0,
        totalFare: 25.0,
        currency: 'USD',
      };

      const resolvedReturnPricing =
        (!bookingConfig.allowMultiVehicle &&
          returnQuote?.vehicleQuotes?.[form.returnVehicleChoice]) ||
        returnQuote?.pricing;

      let returnEffectivePricing: TripPricing = resolvedReturnPricing || {
        baseFare: 5.0,
        distanceMiles: effectivePricing.distanceMiles,
        durationMinutes: effectivePricing.durationMinutes,
        distanceRate: 2.5,
        timeRate: 0.5,
        vehicleMultiplier: 1.0,
        surgeMultiplier: 1.0,
        discountAmount: 0,
        subtotal: effectivePricing.subtotal,
        totalFare: effectivePricing.totalFare,
        currency: 'USD',
      };

      if (form.returnTrip) {
        // Always round each leg cleanly to ceiling dollar; only balance legs to the higher leg
        // when the return leg is truly symmetric with the outbound leg.
        const outboundCeil = Math.ceil(effectivePricing.totalFare);
        const returnCeil = Math.ceil(returnEffectivePricing.totalFare);
        const finalOutboundFare = isSymmetricRoundTrip
          ? Math.max(outboundCeil, returnCeil)
          : outboundCeil;
        const finalReturnFare = isSymmetricRoundTrip
          ? Math.max(outboundCeil, returnCeil)
          : returnCeil;

        effectivePricing = {
          ...effectivePricing,
          subtotal: finalOutboundFare,
          totalFare: finalOutboundFare,
        };

        returnEffectivePricing = {
          ...returnEffectivePricing,
          subtotal: finalReturnFare,
          totalFare: finalReturnFare,
        };
      }

      const scheduledPickupTime =
        form.timingType === 'later' && form.scheduledDate && form.scheduledTime
          ? new Date(`${form.scheduledDate}T${form.scheduledTime}:00`).toISOString()
          : undefined;

      let paymentMethodType: PaymentMethod = 'cash';
      if (form.paymentMethod === 'card') paymentMethodType = 'card';
      if (form.paymentMethod === 'account') paymentMethodType = 'corporate';

      // Verify Corporate Account # & PO anti-fraud via rate-limited server endpoint (or authenticated Corporate Portal context)
      let verifiedCorporateAccountId: string | undefined;
      if (form.paymentMethod === 'account') {
        if (
          corporatePortalContext?.corporateAccountId &&
          form.corporateAccountNumber.trim().toUpperCase() ===
            corporatePortalContext.accountNumber.trim().toUpperCase()
        ) {
          if (corporatePortalContext.poRequired) {
            const candidatePo = form.billingPo.trim().toUpperCase();
            if (!candidatePo) {
              throw new Error(
                `A valid Purchase Order (PO) number is required for ${corporatePortalContext.companyName}.`
              );
            }
            if (
              corporatePortalContext.currentPoNumber &&
              candidatePo !== corporatePortalContext.currentPoNumber.trim().toUpperCase()
            ) {
              throw new Error(
                `PO "${form.billingPo}" does not match the active PO (${corporatePortalContext.currentPoNumber}) for ${corporatePortalContext.companyName}.`
              );
            }
          }
          if (corporatePortalContext.poFormatRegex && form.billingPo.trim()) {
            const fmtCheck = validatePoFormatRegex(
              form.billingPo.trim(),
              corporatePortalContext.poFormatRegex
            );
            if (!fmtCheck.valid) {
              throw new Error(fmtCheck.error || 'Invalid PO format.');
            }
          }
          if (corporatePortalContext.creditLimit && corporatePortalContext.creditLimit > 0) {
            const totalProjected = form.returnTrip
              ? effectivePricing.totalFare + returnEffectivePricing.totalFare
              : effectivePricing.totalFare;
            const creditCheck = evaluateCorporateCreditLimit({
              creditLimit: corporatePortalContext.creditLimit,
              currentBalance: corporatePortalContext.currentExposure ?? 0,
              projectedFare: totalProjected,
              enforcement: corporatePortalContext.creditLimitEnforcement,
              companyName: corporatePortalContext.companyName,
            });
            if (!creditCheck.allowed) {
              throw new Error(
                creditCheck.error ||
                  `Account credit limit ($${corporatePortalContext.creditLimit.toLocaleString()}) exceeded.`
              );
            }
          }
          verifiedCorporateAccountId = corporatePortalContext.corporateAccountId;
        } else {
          const totalProjected = form.returnTrip
            ? effectivePricing.totalFare + returnEffectivePricing.totalFare
            : effectivePricing.totalFare;
          const verification = await verifyCustomerAccount({
            accountNumber: form.corporateAccountNumber,
            poNumber: form.billingPo,
            estimatedFare: totalProjected,
          });
          verifiedCorporateAccountId = verification.corporateAccountId;
        }
      }

      // Phase 31: PCI-Compliant Stripe Pre-authorization Hold (or In-Cab Payment Fallback)
      let paymentIntentId: string | undefined;
      let cardLast4: string | undefined;
      let cardBrand: 'visa' | 'mastercard' | 'amex' | 'discover' = 'visa';

      if (
        form.paymentMethod === 'card' &&
        form.cardPaymentType === 'manual' &&
        form.paymentToken &&
        form.paymentToken !== 'pay_in_cab'
      ) {
        const paymentService = getPaymentService();
        cardLast4 = form.cardLast4 || '••••';
        if (
          form.cardBrand &&
          ['visa', 'mastercard', 'amex', 'discover'].includes(form.cardBrand)
        ) {
          cardBrand = form.cardBrand as 'visa' | 'mastercard' | 'amex' | 'discover';
        }
        const customerId = form.passengerEmail.trim() || `cust_${Date.now().toString(36)}`;
        const holdIntent = await paymentService.createPreAuthorization(
          `trip_init_${Date.now().toString(36)}`,
          effectivePricing.totalFare,
          customerId,
          form.paymentToken
        );
        paymentIntentId = holdIntent.id;
      }

      // Resolve signed-in Firebase Auth UID (if any) and Admin-configured vehicle display name
      const signedInUid = isFirebaseConfigured()
        ? getFirebaseAuth().currentUser?.uid || undefined
        : undefined;
      const selectedVehicleTierObj = activeVehicleTiers.find((v) => v.id === form.vehicleChoice);
      const vehicleDisplayName =
        selectedVehicleTierObj?.name || formatVehicleTier(mapChoiceToTier(form.vehicleChoice));

      // Resolve validated checked flightTelemetry for outbound leg
      const parsedOutboundFlight = parseFlightIdent(form.airline, form.flightNumber);
      const validOutboundTelemetry =
        form.provideFlightInfo &&
        !airportDetection.isPrivateAviation &&
        outboundFlightTelemetry &&
        parsedOutboundFlight.isValid &&
        outboundFlightTelemetry.flightIdent === parsedOutboundFlight.flightIdent
          ? outboundFlightTelemetry
          : undefined;

      // Customer web submissions strictly default to 'UNCONFIRMED'
      const inputPayload: CreateTripInput = {
        ...(signedInUid ? { customerId: signedInUid, userId: signedInUid } : {}),
        ...(verifiedCorporateAccountId ? { corporateAccountId: verifiedCorporateAccountId } : {}),
        ...(validOutboundTelemetry ? { flightTelemetry: validOutboundTelemetry } : {}),
        pickupLocation,
        dropoffLocation,
        intermediateStops:
          intermediateStopsLocations.length > 0 ? intermediateStopsLocations : undefined,
        bookingType: form.timingType === 'asap' ? 'asap' : 'scheduled',
        scheduledPickupTime,
        vehicleTier: mapChoiceToTier(form.vehicleChoice),
        status: 'UNCONFIRMED',
        passenger: {
          firstName: sanitizeTextInput(
            form.passengerName.trim().split(/\s+/)[0] || form.passengerName,
            50
          ),
          lastName: sanitizeTextInput(
            form.passengerName.trim().split(/\s+/).slice(1).join(' ') || '',
            50
          ),
          email: sanitizeTextInput(form.passengerEmail.trim(), 120),
          phone: sanitizeTextInput(form.passengerPhone.trim(), 30),
          passengerCount: form.passengers,
          luggageCount: form.bags,
          specialRequests: activeSpecialRequests.join(', '),
        },
        pricing: effectivePricing,
        payment: {
          method: paymentMethodType,
          status: paymentIntentId ? 'authorized' : 'pending',
          amount: effectivePricing.totalFare,
          paymentIntentId,
          cardLast4,
          cardBrand,
          preAuthHoldAmount: paymentIntentId ? effectivePricing.totalFare : undefined,
          corporateAccountId: verifiedCorporateAccountId,
        },
        driverNotes: sanitizeTextInput(combinedNotes, 1500),
        metadata: {
          isBookingForSomeoneElse: form.isBookerDifferent,
          bookerName: form.isBookerDifferent ? sanitizeTextInput(form.contactName, 100) : undefined,
          bookerPhone: form.isBookerDifferent
            ? sanitizeTextInput(form.contactPhone, 30)
            : undefined,
          bookerEmail: form.isBookerDifferent
            ? sanitizeTextInput(form.contactEmail, 120)
            : undefined,
          bookerRole: form.isBookerDifferent
            ? sanitizeTextInput(form.contactRole, 60)
            : undefined,
          corporateOrgName:
            form.paymentMethod === 'account'
              ? sanitizeTextInput(form.corporateOrgName, 100)
              : undefined,
          corporateAccountNumber:
            form.paymentMethod === 'account'
              ? sanitizeTextInput(form.corporateAccountNumber, 50)
              : undefined,
          corporateAccountId: verifiedCorporateAccountId,
          billingPo:
            form.paymentMethod === 'account'
              ? sanitizeTextInput(form.billingPo, 50)
              : undefined,
          authorizedBy:
            form.paymentMethod === 'account'
              ? sanitizeTextInput(form.authorizedBy, 100)
              : undefined,
          costCenter:
            form.paymentMethod === 'account' && form.costCenter
              ? sanitizeTextInput(form.costCenter, 60)
              : undefined,
          bookedViaCorporatePortal: Boolean(corporatePortalContext),
          invoicingTerms:
            form.paymentMethod === 'account'
              ? sanitizeTextInput(form.invoicingTerms, 50)
              : undefined,
          additionalPassengers: form.additionalPassengers,
          provideFlightInfo: form.provideFlightInfo,
          airline: form.provideFlightInfo ? sanitizeTextInput(form.airline, 80) : undefined,
          airlineName: form.provideFlightInfo ? sanitizeTextInput(form.airline, 80) : undefined,
          flightNumber: form.provideFlightInfo
            ? sanitizeTextInput(form.flightNumber, 30)
            : undefined,
          flightOrigin: form.provideFlightInfo
            ? sanitizeTextInput(form.flightOrigin, 80)
            : undefined,
          departureAirport: form.provideFlightInfo
            ? sanitizeTextInput(form.flightOrigin, 80)
            : undefined,
          tailNumber: form.provideFlightInfo ? sanitizeTextInput(form.tailNumber, 50) : undefined,
          fboFacility: form.provideFlightInfo
            ? sanitizeTextInput(form.fboFacility, 80)
            : undefined,
          isPrivateAviation: Boolean(airportDetection.isPrivateAviation),
          hasCheckedLuggage: form.provideFlightInfo ? form.hasCheckedLuggage : false,
          gateCode: sanitizeTextInput(form.gateCode, 30),
          smsConsent: form.smsConsent,
          isAirportTrip: Boolean(airportDetection.isAirportTrip),
          airportIataCode: airportDetection.airport?.iataCode,
          carSeatsBreakdown: {
            rearFacing: form.rearFacingCount,
            frontFacing: form.frontFacingCount,
            booster: form.boosterCount,
            total: totalCarSeats,
          },
          carSeatsCount: totalCarSeats,
          luggageType: form.luggageType,
          hasOversizedLuggage: form.hasOversizedLuggage,
          oversizedLuggageNotes: form.oversizedLuggageNotes,
          oversizedBags: form.oversizedBags,
          oversizedItemsSummary: oversizedItemsSummary,
          selectedCustomExtras: form.selectedCustomExtras,
          customExtrasSummary: selectedCustomExtrasSummary,
          vehicleTypeId: form.vehicleChoice,
          vehicleDisplayName,
          createdByRole: 'customer_web',
          selectedVehicles: bookingConfig.allowMultiVehicle
            ? form.selectedVehicles
            : [form.vehicleChoice],
        },
      };

      // If editing an existing reservation, update it in place and flag UNCONFIRMED for dispatch re-review
      if (editingTripId && bookingService.updateTrip) {
        const updatedTrip = await bookingService.updateTrip(editingTripId, {
          status: 'UNCONFIRMED',
          pickupLocation: inputPayload.pickupLocation,
          dropoffLocation: inputPayload.dropoffLocation,
          intermediateStops: inputPayload.intermediateStops,
          bookingType: inputPayload.bookingType,
          scheduledPickupTime: inputPayload.scheduledPickupTime,
          vehicleTier: inputPayload.vehicleTier,
          passenger: inputPayload.passenger,
          pricing: inputPayload.pricing,
          driverNotes: inputPayload.driverNotes,
          ...(inputPayload.flightTelemetry
            ? { flightTelemetry: inputPayload.flightTelemetry }
            : {}),
          metadata: inputPayload.metadata,
        });
        setConfirmedTrip(updatedTrip);
        onBookingSuccess?.(updatedTrip);
        return;
      }

      const isWebMultiCar =
        Boolean(bookingConfig.allowMultiVehicle) && form.selectedVehicles.length > 1;
      let createdTrip: Trip;

      if (isWebMultiCar) {
        const groupId = generateMultiCarGroupId();
        const carCount = form.selectedVehicles.length;
        const resolveWebDisplayName = (choice: string, tier: string) => {
          const found = activeVehicleTiers.find((v) => v.id === choice || v.id === tier);
          return found?.name || formatVehicleTier(tier);
        };
        const carSpecs = buildPerVehiclePricingSpecs({
          selectedVehicles: form.selectedVehicles,
          resolveTier: (c) => String(mapChoiceToTier(c as CustomerVehicleChoice)),
          resolveDisplayName: resolveWebDisplayName,
          vehicleQuotes: quote?.vehicleQuotes || {},
          primaryPricing: effectivePricing,
          distanceMiles: effectivePricing.distanceMiles || 0,
          durationMinutes: effectivePricing.durationMinutes || 0,
          combinedTargetFare: effectivePricing.totalFare || 0,
          isFareOverridden: false,
        });
        const paxCaps = form.selectedVehicles.map((v) => vehicleCapacities[v]?.maxPassengers || 4);
        const bagCaps = form.selectedVehicles.map((v) => vehicleCapacities[v]?.maxBags || 3);
        const paxAlloc = distributeAcrossCars(form.passengers, carCount, paxCaps, 1);
        const bagAlloc = distributeAcrossCars(form.bags, carCount, bagCaps, 0);

        const createdWebCars: Trip[] = [];
        for (let i = 0; i < carSpecs.length; i++) {
          const spec = carSpecs[i];
          const carPayload: CreateTripInput = {
            ...inputPayload,
            vehicleTier: spec.vehicleTier as VehicleTier,
            passenger: {
              ...inputPayload.passenger,
              passengerCount: paxAlloc[i],
              luggageCount: bagAlloc[i],
            },
            pricing: spec.pricing,
            payment: {
              ...inputPayload.payment,
              amount: spec.fare,
              preAuthHoldAmount:
                paymentIntentId && i === 0 ? effectivePricing.totalFare : undefined,
            },
            multipleVehiclesRequested: true,
            vehicleCount: carCount,
            multiCarGroupId: groupId,
            multiCarIndex: i + 1,
            multiCarTotal: carCount,
            metadata: {
              ...(inputPayload.metadata || {}),
              vehicleTypeId: spec.vehicleChoice,
              vehicleDisplayName: spec.vehicleDisplayName,
              selectedVehicles: [spec.vehicleChoice],
              multiCarGroupId: groupId,
              multiCarIndex: i + 1,
              multiCarTotal: carCount,
              multiCarTotalPassengers: form.passengers,
              multiCarTotalBags: form.bags,
              multiCarOrderTotalFare: effectivePricing.totalFare,
            },
          };
          const createdCar = await bookingService.createBooking(carPayload);
          createdWebCars.push(createdCar);
        }

        const allTripIds = createdWebCars.map((t) => t.id);
        const associates = createdWebCars.map((t) => buildAssociateEntryFromTrip(t));
        if (bookingService.updateTrip) {
          await Promise.all(
            createdWebCars.map((t) =>
              bookingService.updateTrip!(t.id, {
                multiCarTripIds: allTripIds,
                multiCarAssociates: associates,
                multiCarDriverIds: [],
              })
            )
          );
        }
        createdTrip = {
          ...createdWebCars[0],
          multiCarTripIds: allTripIds,
          multiCarAssociates: associates,
          multiCarDriverIds: [],
        };
      } else {
        createdTrip = await bookingService.createBooking(inputPayload);
      }

      let createdReturnTripObj: Trip | null = null;

      // Handle linked return trip creation if requested
      if (form.returnTrip) {
        try {
          const returnScheduledPickupTime =
            form.returnDate && form.returnTime
              ? new Date(`${form.returnDate}T${form.returnTime}:00`).toISOString()
              : undefined;

          let returnFlightNotes = '';
          if (form.returnProvideFlightInfo) {
            if (returnAirportDetection.isPrivateAviation) {
              if (form.returnTailNumber || form.returnFboFacility) {
                returnFlightNotes = `[Return Private Aviation: Tail #${
                  form.returnTailNumber || 'N/A'
                }, FBO: ${form.returnFboFacility || 'N/A'}${
                  form.returnHasCheckedLuggage ? ' (Checked Luggage)' : ''
                }] `;
              }
            } else {
              if (form.returnAirline || form.returnFlightNumber) {
                returnFlightNotes = `[Return Flight: ${form.returnAirline} #${
                  form.returnFlightNumber
                } from ${form.returnFlightOrigin || 'N/A'}${
                  form.returnHasCheckedLuggage ? ' (Checked Luggage)' : ''
                }] `;
              }
            }
          }

          const returnVehicleTierObj = activeVehicleTiers.find(
            (v) => v.id === form.returnVehicleChoice
          );
          const returnVehicleDisplayName =
            returnVehicleTierObj?.name ||
            formatVehicleTier(mapChoiceToTier(form.returnVehicleChoice));

          const parsedReturnFlight = parseFlightIdent(form.returnAirline, form.returnFlightNumber);
          const validReturnTelemetry =
            form.returnProvideFlightInfo &&
            !returnAirportDetection.isPrivateAviation &&
            returnFlightTelemetry &&
            parsedReturnFlight.isValid &&
            returnFlightTelemetry.flightIdent === parsedReturnFlight.flightIdent
              ? returnFlightTelemetry
              : undefined;

          const returnPayload: CreateTripInput = {
            ...(signedInUid ? { customerId: signedInUid, userId: signedInUid } : {}),
            ...(verifiedCorporateAccountId
              ? { corporateAccountId: verifiedCorporateAccountId }
              : {}),
            ...(validReturnTelemetry ? { flightTelemetry: validReturnTelemetry } : {}),
            pickupLocation: {
              address: form.returnPickupAddress,
              coordinates: form.returnPickupCoordinates || dropoffLocation.coordinates,
            },
            dropoffLocation: {
              address: form.returnDropoffAddress,
              coordinates: form.returnDropoffCoordinates || pickupLocation.coordinates,
            },
            intermediateStops:
              form.returnIntermediateStops.filter((s) => s.address && s.address.trim()).length > 0
                ? form.returnIntermediateStops
                    .filter((s) => s.address && s.address.trim())
                    .map((s) => ({ address: s.address.trim(), coordinates: s.coordinates }))
                : undefined,
            bookingType: 'scheduled',
            scheduledPickupTime: returnScheduledPickupTime,
            vehicleTier: mapChoiceToTier(form.returnVehicleChoice),
            status: 'UNCONFIRMED',
            passenger: {
              firstName: form.passengerName.trim().split(/\s+/)[0] || form.passengerName,
              lastName: form.passengerName.trim().split(/\s+/).slice(1).join(' ') || '',
              email: form.passengerEmail.trim(),
              phone: form.passengerPhone.trim(),
              passengerCount: form.returnPassengers,
              luggageCount: form.returnBags,
              specialRequests: activeSpecialRequests.join(', '),
            },
            pricing: returnEffectivePricing,
            payment: {
              method: paymentMethodType,
              status: 'pending',
              amount: returnEffectivePricing.totalFare,
              corporateAccountId: verifiedCorporateAccountId,
            },
            driverNotes:
              `[Return Leg of Trip #${createdTrip.id}] ${returnFlightNotes}${form.driverNotes}`.trim(),
            metadata: {
              linkedTripId: createdTrip.id,
              isReturnRide: true,
              vehicleTypeId: form.returnVehicleChoice,
              vehicleDisplayName: returnVehicleDisplayName,
              createdByRole: corporatePortalContext ? 'corporate_manager' : 'customer_web',
              corporateAccountId: verifiedCorporateAccountId,
              corporateOrgName:
                form.paymentMethod === 'account'
                  ? sanitizeTextInput(form.corporateOrgName, 100)
                  : undefined,
              corporateAccountNumber:
                form.paymentMethod === 'account'
                  ? sanitizeTextInput(form.corporateAccountNumber, 50)
                  : undefined,
              billingPo:
                form.paymentMethod === 'account'
                  ? sanitizeTextInput(form.billingPo, 50)
                  : undefined,
              costCenter:
                form.paymentMethod === 'account' && form.costCenter
                  ? sanitizeTextInput(form.costCenter, 60)
                  : undefined,
              bookedViaCorporatePortal: Boolean(corporatePortalContext),
              airline: form.returnProvideFlightInfo ? form.returnAirline : undefined,
              airlineName: form.returnProvideFlightInfo ? form.returnAirline : undefined,
              flightNumber: form.returnProvideFlightInfo ? form.returnFlightNumber : undefined,
              flightOrigin: form.returnProvideFlightInfo ? form.returnFlightOrigin : undefined,
              departureAirport: form.returnProvideFlightInfo ? form.returnFlightOrigin : undefined,
              tailNumber: form.returnProvideFlightInfo ? form.returnTailNumber : undefined,
              fboFacility: form.returnProvideFlightInfo ? form.returnFboFacility : undefined,
              isPrivateAviation: Boolean(returnAirportDetection.isPrivateAviation),
              hasCheckedLuggage: form.returnProvideFlightInfo
                ? form.returnHasCheckedLuggage
                : false,
              isAirportTrip: Boolean(returnAirportDetection.isAirportTrip),
              airportIataCode: returnAirportDetection.airport?.iataCode,
              selectedVehicles: bookingConfig.allowMultiVehicle
                ? form.returnSelectedVehicles
                : [form.returnVehicleChoice],
              carSeatsBreakdown: {
                rearFacing: form.returnRearFacing,
                frontFacing: form.returnFrontFacing,
                booster: form.returnBooster,
                total: returnTotalCarSeats,
              },
              carryOnBags: form.returnCarryOnBags,
              checkedBags: form.returnCheckedBags,
              hasOversizedLuggage: form.returnHasOversizedLuggage,
              oversizedBags: form.returnHasOversizedLuggage ? form.returnOversizedBags : {},
              oversizedItemsSummary: form.returnHasOversizedLuggage
                ? returnOversizedItemsSummary
                : '',
              oversizedLuggageNotes: form.returnHasOversizedLuggage
                ? form.returnOversizedLuggageNotes
                : '',
              selectedCustomExtras: form.returnSelectedCustomExtras,
              customExtrasSummary: returnSelectedCustomExtrasSummary,
            },
          };

          const returnTripObj = await bookingService.createBooking(returnPayload);
          createdReturnTripObj = returnTripObj;

          // Annotate and persist createdTrip with return trip details in Firestore
          if (createdTrip.metadata) {
            createdTrip.metadata.hasReturnTrip = true;
            createdTrip.metadata.returnTripId = returnTripObj.id;
            createdTrip.metadata.returnTripTrackingToken = returnTripObj.trackingToken;
            createdTrip.metadata.linkedReturnTripId = returnTripObj.id;
            createdTrip.metadata.returnDate = form.returnDate;
            createdTrip.metadata.returnTime = form.returnTime;
            createdTrip.metadata.returnPickupAddress = form.returnPickupAddress;
            createdTrip.metadata.returnDropoffAddress = form.returnDropoffAddress;
            createdTrip.metadata.returnFare = returnEffectivePricing.totalFare;
            createdTrip.metadata.returnVehicleChoice = form.returnVehicleChoice;
            createdTrip.metadata.returnFlightNumber = form.returnProvideFlightInfo
              ? form.returnFlightNumber
              : undefined;
            createdTrip.metadata.returnAirline = form.returnProvideFlightInfo
              ? form.returnAirline
              : undefined;
            createdTrip.metadata.returnFlightOrigin = form.returnProvideFlightInfo
              ? form.returnFlightOrigin
              : undefined;
            createdTrip.metadata.returnTailNumber = form.returnProvideFlightInfo
              ? form.returnTailNumber
              : undefined;
            createdTrip.metadata.returnFboFacility = form.returnProvideFlightInfo
              ? form.returnFboFacility
              : undefined;
            createdTrip.metadata.returnIsPrivateAviation = Boolean(
              returnAirportDetection.isPrivateAviation
            );
            createdTrip.metadata.returnHasCheckedLuggage = form.returnProvideFlightInfo
              ? form.returnHasCheckedLuggage
              : false;
            createdTrip.metadata.returnIsAirportTrip = Boolean(
              returnAirportDetection.isAirportTrip
            );
          }

          if (bookingService.updateTrip && returnTripObj?.id) {
            await bookingService.updateTrip(createdTrip.id, {
              linkedReturnTripId: returnTripObj.id,
              metadata: {
                ...createdTrip.metadata,
                linkedReturnTripId: returnTripObj.id,
                returnTripId: returnTripObj.id,
                hasReturnTrip: true,
              },
            });
          }
        } catch (retErr) {
          console.warn('[BookingEngineV2] Linked return trip creation warning:', retErr);
        }
      }

      // Trigger customer booking confirmation & admin alert
      try {
        const emailService = getEmailDispatchService();

        // Single consolidated confirmation email to passenger (includes return trip details if round trip)
        const confirmResult = await emailService.sendBookingConfirmation({
          tripId: createdTrip.id,
          trackingToken: createdTrip.trackingToken,
          passenger: {
            firstName: createdTrip.passenger.firstName,
            lastName: createdTrip.passenger.lastName,
            email: createdTrip.passenger.email,
            phone: createdTrip.passenger.phone,
          },
          pickupAddress: createdTrip.pickupLocation.address,
          pickupNotes: createdTrip.pickupLocation.notes,
          intermediateStops: createdTrip.intermediateStops?.map((s) => ({
            address: s.address,
            notes: s.notes,
          })),
          dropoffAddress: createdTrip.dropoffLocation.address,
          dropoffNotes: createdTrip.dropoffLocation.notes,
          pickupTime:
            createdTrip.bookingType === 'scheduled' && createdTrip.scheduledPickupTime
              ? new Date(createdTrip.scheduledPickupTime).toLocaleString()
              : 'Immediate Ride (ASAP)',
          bookingType: createdTrip.bookingType,
          vehicleTier:
            form.vehicleChoice === 'any' ? 'any' : createdTrip.vehicleTier || 'standard',
          vehicleDisplayName: (createdTrip.metadata?.vehicleDisplayName as string) || undefined,
          passengerCount: createdTrip.passenger.passengerCount,
          luggageCount: createdTrip.passenger.luggageCount,
          contactPerson: form.isBookerDifferent
            ? {
                isBookerDifferent: form.isBookerDifferent,
                contactName: form.contactName,
                contactPhone: form.contactPhone,
                contactEmail: form.contactEmail,
                contactRole: form.contactRole,
              }
            : undefined,
          carSeatsBreakdown: {
            rearFacing: form.rearFacingCount,
            frontFacing: form.frontFacingCount,
            booster: form.boosterCount,
            total: totalCarSeats,
          },
          additionalPassengers: form.additionalPassengers,
          totalFare: createdTrip.pricing.totalFare,
          breakdown: createdTrip.pricing.breakdown,
          tariffProfileName:
            createdTrip.pricing.matchedCorridorName || createdTrip.pricing.tariffProfileName,
          currency: createdTrip.pricing.currency || 'USD',
          paymentMethod: createdTrip.payment.method,
          specialRequests: createdTrip.passenger.specialRequests,
          oversizedBags: form.oversizedBags,
          oversizedItemsSummary: oversizedItemsSummary,
          customExtrasSummary: (createdTrip.metadata?.customExtrasSummary as string) || undefined,
          flightDetails: form.provideFlightInfo
            ? {
                airlineName: form.airline,
                flightNumber: form.flightNumber,
                departureAirport: form.flightOrigin,
                tailNumber: form.tailNumber,
                fboFacility: form.fboFacility,
                isPrivateAviation: Boolean(airportDetection.isPrivateAviation),
                hasCheckedLuggage: form.hasCheckedLuggage,
                isAirportTrip: Boolean(airportDetection.isAirportTrip),
              }
            : undefined,
          returnTripDetails: createdReturnTripObj
            ? {
                tripId: createdReturnTripObj.id,
                trackingToken: createdReturnTripObj.trackingToken,
                pickupAddress: createdReturnTripObj.pickupLocation.address,
                dropoffAddress: createdReturnTripObj.dropoffLocation.address,
                pickupTime:
                  createdReturnTripObj.bookingType === 'scheduled' &&
                  createdReturnTripObj.scheduledPickupTime
                    ? new Date(createdReturnTripObj.scheduledPickupTime).toLocaleString()
                    : 'Scheduled Return',
                vehicleTier:
                  form.returnVehicleChoice === 'any'
                    ? 'any'
                    : createdReturnTripObj.vehicleTier || 'standard',
                vehicleDisplayName:
                  (createdReturnTripObj.metadata?.vehicleDisplayName as string) || undefined,
                passengerCount: createdReturnTripObj.passenger?.passengerCount,
                luggageCount: createdReturnTripObj.passenger?.luggageCount,
                totalFare: createdReturnTripObj.pricing.totalFare,
                flightDetails: form.returnProvideFlightInfo
                  ? {
                      airlineName: form.returnAirline,
                      flightNumber: form.returnFlightNumber,
                      departureAirport: form.returnFlightOrigin,
                      tailNumber: form.returnTailNumber,
                      fboFacility: form.returnFboFacility,
                      isPrivateAviation: Boolean(returnAirportDetection.isPrivateAviation),
                      hasCheckedLuggage: form.returnHasCheckedLuggage,
                      isAirportTrip: Boolean(returnAirportDetection.isAirportTrip),
                    }
                  : undefined,
              }
            : undefined,
          status: createdTrip.status,
          lambertPickupInstructions: bookingConfig.lambertPickupInstructions,
          companySettings: {
            name: companyConfig?.name,
            phone: companyConfig?.phone,
            address: companyConfig?.address,
            email: companyConfig?.email,
          },
        });

        // 2. Send immediate alert to operations / dispatch
        await emailService.sendAdminDispatchAlert({
          tripId: createdTrip.id,
          passengerName:
            `${createdTrip.passenger.firstName} ${createdTrip.passenger.lastName}`.trim(),
          passengerPhone: createdTrip.passenger.phone,
          passengerEmail: createdTrip.passenger.email,
          passengerCount: createdTrip.passenger.passengerCount,
          luggageCount: createdTrip.passenger.luggageCount,
          oversizedBags: form.oversizedBags,
          oversizedItemsSummary: oversizedItemsSummary,
          customExtrasSummary: (createdTrip.metadata?.customExtrasSummary as string) || undefined,
          pickupAddress: createdTrip.pickupLocation.address,
          dropoffAddress: createdTrip.dropoffLocation.address,
          pickupTime:
            createdTrip.bookingType === 'scheduled' && createdTrip.scheduledPickupTime
              ? new Date(createdTrip.scheduledPickupTime).toLocaleString()
              : 'Immediate Ride (ASAP)',
          bookingType: createdTrip.bookingType,
          vehicleTier: createdTrip.vehicleTier,
          vehicleDisplayName: (createdTrip.metadata?.vehicleDisplayName as string) || undefined,
          totalFare: createdTrip.pricing.totalFare,
          breakdown: createdTrip.pricing.breakdown,
          tariffProfileName:
            createdTrip.pricing.matchedCorridorName || createdTrip.pricing.tariffProfileName,
          currency: createdTrip.pricing.currency,
          specialRequests: createdTrip.passenger.specialRequests,
          urgency: createdTrip.bookingType === 'asap' ? 'high' : 'normal',
          status: createdTrip.status,
          lambertPickupInstructions: bookingConfig.lambertPickupInstructions,
          returnTripDetails: createdReturnTripObj
            ? {
                tripId: createdReturnTripObj.id,
                pickupAddress: createdReturnTripObj.pickupLocation.address,
                dropoffAddress: createdReturnTripObj.dropoffLocation.address,
                pickupTime:
                  createdReturnTripObj.bookingType === 'scheduled' &&
                  createdReturnTripObj.scheduledPickupTime
                    ? new Date(createdReturnTripObj.scheduledPickupTime).toLocaleString()
                    : 'Scheduled Return',
                vehicleTier: createdReturnTripObj.vehicleTier,
                totalFare: createdReturnTripObj.pricing.totalFare,
                flightDetails: form.returnProvideFlightInfo
                  ? {
                      airlineName: form.returnAirline,
                      flightNumber: form.returnFlightNumber,
                      departureAirport: form.returnFlightOrigin,
                      tailNumber: form.returnTailNumber,
                      fboFacility: form.returnFboFacility,
                      isPrivateAviation: Boolean(returnAirportDetection.isPrivateAviation),
                      hasCheckedLuggage: form.returnHasCheckedLuggage,
                      isAirportTrip: Boolean(returnAirportDetection.isAirportTrip),
                    }
                  : undefined,
              }
            : undefined,
          companySettings: {
            name: companyConfig?.name,
            phone: companyConfig?.phone,
            address: companyConfig?.address,
            email: companyConfig?.email,
          },
        });

        setEmailDelivery({
          status: confirmResult.simulated
            ? 'simulated'
            : confirmResult.success
            ? 'sent'
            : 'failed',
          recipient: createdTrip.passenger.email,
          messageId: confirmResult.messageId,
          error: confirmResult.error,
        });
      } catch (err: unknown) {
        console.warn('[BookingEngineV2] Email dispatch error:', err);
        setEmailDelivery({
          status: 'failed',
          recipient: createdTrip.passenger.email,
          error:
            err instanceof Error
              ? err.message
              : 'Unable to send confirmation email right now.',
        });
      }

      // Non-blocking unattended Auto-Dispatch trigger when newly created customer booking is CONFIRMED
      if (!editingTripId && typeof fetch === 'function') {
        const confirmedTripIds: string[] = [];
        if (createdTrip.status === 'CONFIRMED' || createdTrip.status === 'confirmed') {
          if (Array.isArray(createdTrip.multiCarTripIds) && createdTrip.multiCarTripIds.length > 1) {
            confirmedTripIds.push(...createdTrip.multiCarTripIds);
          } else {
            confirmedTripIds.push(createdTrip.id);
          }
        }
        if (
          createdReturnTripObj &&
          (createdReturnTripObj.status === 'CONFIRMED' ||
            createdReturnTripObj.status === 'confirmed')
        ) {
          confirmedTripIds.push(createdReturnTripObj.id);
        }

        if (confirmedTripIds.length > 0) {
          fetch('/api/auto-dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              confirmedTripIds.length === 1
                ? { tripId: confirmedTripIds[0] }
                : { tripIds: confirmedTripIds }
            ),
          }).catch(() => {});
        }
      }

      setConfirmedTrip(createdTrip);
      onBookingSuccess?.(createdTrip);
    } catch (err: unknown) {
      console.error('[BookingEngineV2] Booking creation failed:', err);
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to record reservation. Please try again.'
      );
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return {
    quote,
    setQuote,
    isQuoteLoading,
    quoteError,
    returnQuote,
    setReturnQuote,
    isReturnQuoteLoading,
    isSubmitting,
    submitError,
    setSubmitError,
    confirmedTrip,
    setConfirmedTrip,
    emailDelivery,
    handleBookRide,
  };
}
