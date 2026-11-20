import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, Link } from 'react-router';
import type {
  Trip,
  GeoPoint,
  CreateTripInput,
  VehicleTier,
  PaymentMethod,
  TripLocation,
  TripPricing,
} from '../../core/types';
import { getBookingService } from '../../core/services/booking';
import {
  generateMultiCarGroupId,
  distributeAcrossCars,
  buildPerVehiclePricingSpecs,
  buildAssociateEntryFromTrip,
} from '../../core/services/booking/multi-car.util';
import { getFirebaseAuth, isFirebaseConfigured } from '../../core/services/firebase';
import type { QuoteResponse } from '../../core/services/booking-service';
import { getPaymentService } from '../../core/services/payment.service';
import { getEmailDispatchService } from '../../core/services/email';
import {
  getAdminConfigService,
  DEFAULT_CUSTOMER_BOOKING_CONFIG,
} from '../../core/services/config/admin-config.service';
import {
  DEFAULT_OVERSIZED_BAG_CATEGORIES,
  type CustomerBookingConfig,
  type VehicleTierConfig,
  type OversizedBagCategory,
  type UniversalExtrasConfig,
} from '../../core/types/config';
import {
  getUniversalExtrasService,
  DEFAULT_UNIVERSAL_EXTRAS,
} from '../../core/services/pricing/extras.service';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import { formatVehicleTier } from '../../core/utils/trip-id.util';
import { hasValidRoutePair } from '../../core/hooks/useDebounceRoute';
import {
  REGIONAL_AIRPORTS,
  MAJOR_AIRLINES,
  detectAirportInAddresses,
} from '../../core/config/airports';
export const COMMON_FBO_FACILITIES = [
  'Signature Aviation - Lambert (STL)',
  'Signature Aviation - Spirit (SUS)',
  'TAC Air / Million Air - Spirit of St. Louis (SUS)',
  'Jet Aviation - St. Louis Downtown (CPS)',
  'Premier Jet Center (ALN)',
  'West Star Aviation',
  'Private Hangar / Other FBO',
];

import { sanitizeTextInput, isBotHoneypotTriggered } from '../../core/utils/security-sanitizer.util';
import { DispatchLocationInput, type PlaceSelectedDetails } from './dispatch/DispatchLocationInput';
import { BookingConfirmation, type EmailDeliveryFeedback } from './BookingConfirmation';

export function formatUsPhone(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

import {
  SpinnerIcon,
  ShieldCheckIcon,
  ClockIcon,
  CarIcon,
  UserIcon,
  PhoneIcon,
  MailIcon,
  MapPinIcon,
  CheckIcon,
  PlaneLandingIcon,
  InfoIcon,
  PlusIcon,
  LuggageIcon,
  CreditCardIcon,
  DollarSignIcon,
  BuildingIcon,
  HistoryIcon,
  PawPrintIcon,
  VolumeXIcon,
  MusicNoteIcon,
  DevicePhoneMobileIcon,
} from '../ui/Icons';
import { StripePaymentInput } from './payments/StripePaymentInput';
import { PriceBreakdownPanel } from './booking/PriceBreakdownPanel';
import { FlightAssistanceCard } from './booking/FlightAssistanceCard';

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
}

export interface BookingEngineV2Props {
  className?: string;
  onBookingSuccess?: (trip: Trip) => void;
  onConfirmedChange?: (isConfirmed: boolean) => void;
  initialValues?: BookingEngineV2InitialValues;
  editingTripId?: string;
  onCancelEdit?: () => void;
  hideDispatchBanner?: boolean;
  embeddedInApp?: boolean;
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type SpecialRequestKey = 'petFriendly' | 'quietRide' | 'musicOk';
export type CustomerVehicleChoice = 'any' | 'sedan' | 'suv' | 'van' | (string & {});

export function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  if (hStr === undefined || mStr === undefined) return time24;
  let hour = parseInt(hStr, 10);
  if (isNaN(hour)) return time24;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const minute = mStr.padStart(2, '0');
  return `${hour}:${minute} ${ampm}`;
}

export interface WaypointItem {
  id: string;
  address: string;
  placeId?: string;
  coordinates?: GeoPoint;
}

export interface AdditionalPassengerItem {
  name: string;
  phone?: string;
}

interface FormState {
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
  returnIntermediateStops: Array<{ address: string; coordinates?: GeoPoint }>;
  returnDate: string;
  returnTime: string;
  returnPassengers: number;
  returnBags: number;
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
  invoicingTerms: string;
  botTrapField?: string;
}

const DEFAULT_BOOKER_ROLES = [
  'Hotel Front Desk / Concierge',
  'Corporate Travel / Executive Admin',
  'Medical Coordinator / Clinic',
  'Family Member / Caregiver',
  'Event Organizer / Wedding Planner',
  'Other',
];

export function BookingEngineV2({
  className = '',
  onBookingSuccess,
  onConfirmedChange,
  initialValues,
  editingTripId,
  onCancelEdit,
  hideDispatchBanner = false,
  embeddedInApp = false,
}: BookingEngineV2Props) {
  const location = useLocation();

  // Initialize default date (local timezone today) and time (+45 minutes in future)
  const todayLocalDate = useMemo(() => formatLocalDate(new Date()), []);
  const defaultFutureDateTime = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 45);
    const dateStr = formatLocalDate(d);
    const timeStr = d.toTimeString().slice(0, 5);
    return { dateStr, timeStr };
  }, []);

  // Form State
  const [form, setForm] = useState<FormState>({
    timingType: 'later',
    scheduledDate: defaultFutureDateTime.dateStr,
    scheduledTime: defaultFutureDateTime.timeStr,

    pickupAddress: '',
    dropoffAddress: '',
    intermediateStops: [],

    provideFlightInfo: false,
    airline: '',
    flightNumber: '',
    flightOrigin: '',
    tailNumber: '',
    fboFacility: '',
    hasCheckedLuggage: false,

    passengerName: '',
    passengerPhone: '',
    passengerEmail: '',
    additionalPassengers: [],

    isBookerDifferent: false,
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    contactRole: DEFAULT_BOOKER_ROLES[0],

    passengers: 1,
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

    vehicleChoice: 'any',
    isVehicleAutoAssigned: true,
    selectedVehicles: ['any'],

    returnTrip: false,
    returnPickupAddress: '',
    returnDropoffAddress: '',
    returnIntermediateStops: [],
    returnDate: defaultFutureDateTime.dateStr,
    returnTime: defaultFutureDateTime.timeStr,
    returnPassengers: 1,
    returnBags: 1,
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
    driverNotes: '',
    smsConsent: true,

    paymentMethod: 'card',
    cardPaymentType: 'terminal',
    cardholderName: '',
    cardNumber: '',
    cardExp: '',
    cardCvc: '',
    cardBrand: '',
    cardLast4: '',
    paymentToken: '',
    saveCardOnFile: false,

    corporateOrgName: '',
    corporateAccountNumber: '',
    billingPo: '',
    authorizedBy: '',
    invoicingTerms: 'Net 30 Direct Bill',
    botTrapField: '',
  });

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Quote calculation state
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);
  const [showChauffeurNotes, setShowChauffeurNotes] = useState(false);
  const [stripeOnlineEnabled, setStripeOnlineEnabled] = useState(false);
  const [stripePublishableKey, setStripePublishableKey] = useState<string>('');

  // Check if server-side Stripe online payments are active with a valid publishable key
  useEffect(() => {
    fetch('/api/payments')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const localPk =
          typeof window !== 'undefined' ? localStorage.getItem('ct_stripe_pk') || '' : '';
        const resolvedPk = data?.stripePublishableKey || localPk;
        if (data?.stripeConfigured && resolvedPk && resolvedPk.startsWith('pk_')) {
          setStripePublishableKey(resolvedPk);
          setStripeOnlineEnabled(true);
        }
      })
      .catch(() => {});
  }, []);

  // Return trip quote state
  const [returnQuote, setReturnQuote] = useState<QuoteResponse | null>(null);
  const [isReturnQuoteLoading, setIsReturnQuoteLoading] = useState(false);

  // Submission state
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedTrip, setConfirmedTrip] = useState<Trip | null>(null);
  const [emailDelivery, setEmailDelivery] = useState<EmailDeliveryFeedback>({ status: 'idle' });

  // Reset confirmedTrip when user navigates or re-clicks Book Now
  useEffect(() => {
    setConfirmedTrip(null);
  }, [location.key]);

  // Notify parent of confirmedTrip changes
  useEffect(() => {
    onConfirmedChange?.(Boolean(confirmedTrip));
  }, [confirmedTrip, onConfirmedChange]);

  // Listen for navbar/custom 'reset-booking-form' event
  useEffect(() => {
    const handleReset = () => {
      setConfirmedTrip(null);
      setForm((prev) => ({
        ...prev,
        pickupAddress: '',
        dropoffAddress: '',
        intermediateStops: [],
        returnTrip: false,
        driverNotes: '',
        gateCode: '',
      }));
      setQuote(null);
      setReturnQuote(null);
    };
    window.addEventListener('reset-booking-form', handleReset);
    return () => window.removeEventListener('reset-booking-form', handleReset);
  }, []);

  // Pre-fill from URL Search Parameters (e.g. from Passenger App 1-tap rebook or quick destination chips)
  useEffect(() => {
    if (!location.search) return;
    try {
      const params = new URLSearchParams(location.search);
      const pickupParam = params.get('pickup');
      const dropoffParam = params.get('dropoff');
      const notesParam = params.get('notes');
      const vehicleParam = params.get('vehicle') as CustomerVehicleChoice | null;
      const passengersParam = params.get('passengers');
      const timingParam = params.get('timing');
      const pickupLat = params.get('pickupLat');
      const pickupLng = params.get('pickupLng');
      const dropoffLat = params.get('dropoffLat');
      const dropoffLng = params.get('dropoffLng');

      if (pickupParam || dropoffParam || notesParam || vehicleParam || passengersParam || timingParam) {
        setForm((prev) => ({
          ...prev,
          timingType: timingParam === 'asap' || timingParam === 'later' ? timingParam : prev.timingType,
          pickupAddress: pickupParam !== null ? pickupParam : prev.pickupAddress,
          pickupCoordinates: pickupLat && pickupLng ? { lat: parseFloat(pickupLat), lng: parseFloat(pickupLng) } : prev.pickupCoordinates,
          dropoffAddress: dropoffParam !== null ? dropoffParam : prev.dropoffAddress,
          dropoffCoordinates: dropoffLat && dropoffLng ? { lat: parseFloat(dropoffLat), lng: parseFloat(dropoffLng) } : prev.dropoffCoordinates,
          driverNotes: notesParam !== null ? notesParam : prev.driverNotes,
          vehicleChoice: vehicleParam && ['any', 'sedan', 'suv', 'van'].includes(vehicleParam) ? vehicleParam : prev.vehicleChoice,
          selectedVehicles: vehicleParam && ['any', 'sedan', 'suv', 'van'].includes(vehicleParam) ? [vehicleParam] : prev.selectedVehicles,
          passengers: passengersParam ? Math.max(1, parseInt(passengersParam, 10) || 1) : prev.passengers,
        }));
      }
    } catch (err) {
      console.warn('[BookingEngineV2] Error parsing search params:', err);
    }
  }, [location.search]);

  // Pre-fill from initialValues prop (e.g. from Passenger App embedded booking)
  // Always clear confirmedTrip when parent triggers a Rebook / Edit / Saved Place chip!
  useEffect(() => {
    if (!initialValues && !editingTripId) return;
    setConfirmedTrip(null);
    if (!initialValues) return;
    setForm((prev) => ({
      ...prev,
      ...(initialValues.pickupAddress !== undefined && initialValues.pickupAddress !== ''
        ? { pickupAddress: initialValues.pickupAddress }
        : {}),
      ...(initialValues.pickupCoordinates ? { pickupCoordinates: initialValues.pickupCoordinates } : {}),
      ...(initialValues.dropoffAddress !== undefined && initialValues.dropoffAddress !== ''
        ? { dropoffAddress: initialValues.dropoffAddress }
        : {}),
      ...(initialValues.dropoffCoordinates ? { dropoffCoordinates: initialValues.dropoffCoordinates } : {}),
      ...(initialValues.driverNotes !== undefined && initialValues.driverNotes !== ''
        ? { driverNotes: initialValues.driverNotes }
        : {}),
      ...(initialValues.vehicleChoice
        ? {
            vehicleChoice: initialValues.vehicleChoice,
            selectedVehicles: [initialValues.vehicleChoice],
          }
        : {}),
      ...(initialValues.passengers ? { passengers: initialValues.passengers } : {}),
      ...(initialValues.timingType ? { timingType: initialValues.timingType } : {}),
      ...(initialValues.scheduledDate ? { scheduledDate: initialValues.scheduledDate } : {}),
      ...(initialValues.scheduledTime ? { scheduledTime: initialValues.scheduledTime } : {}),
      ...(initialValues.passengerName ? { passengerName: initialValues.passengerName } : {}),
      ...(initialValues.passengerPhone ? { passengerPhone: initialValues.passengerPhone } : {}),
      ...(initialValues.passengerEmail ? { passengerEmail: initialValues.passengerEmail } : {}),
    }));
  }, [initialValues, editingTripId]);

  // Customer Booking Form Config and Active Vehicle Classes from Admin Settings
  const [bookingConfig, setBookingConfig] = useState<CustomerBookingConfig>(() => {
    return (
      getAdminConfigService().getCachedSettings().customerBookingConfig ||
      DEFAULT_CUSTOMER_BOOKING_CONFIG
    );
  });

  const [companyConfig, setCompanyConfig] = useState(() => {
    return getAdminConfigService().getCachedSettings().company;
  });

  const [vehicleTiers, setVehicleTiers] = useState<VehicleTierConfig[]>(() => {
    const cached = getAdminConfigService().getCachedSettings();
    if (cached.vehicles && cached.vehicles.length > 0) {
      return cached.vehicles.filter((v) => !v.isArchived);
    }
    return [];
  });

  const [universalExtras, setUniversalExtras] = useState<UniversalExtrasConfig>(() => {
    try {
      return getUniversalExtrasService().getCached();
    } catch {
      return DEFAULT_UNIVERSAL_EXTRAS;
    }
  });

  useEffect(() => {
    const unsubExtras = getUniversalExtrasService().subscribeToExtras((liveExtras) => {
      setUniversalExtras(liveExtras);
    });
    return () => {
      if (typeof unsubExtras === 'function') unsubExtras();
    };
  }, []);

  useEffect(() => {
    const configService = getAdminConfigService();
    const unsubscribe = configService.subscribeToSettings((s) => {
      if (s.customerBookingConfig) {
        setBookingConfig({ ...DEFAULT_CUSTOMER_BOOKING_CONFIG, ...s.customerBookingConfig });
      }
      if (s.company) {
        setCompanyConfig(s.company);
      }
      if (s.vehicles && s.vehicles.length > 0) {
        setVehicleTiers(s.vehicles.filter((v) => !v.isArchived));
      }
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const activeVehicleTiers: VehicleTierConfig[] = useMemo(() => {
    const anyTier: VehicleTierConfig = {
      id: 'any',
      name: 'Any Vehicle',
      badge: 'Best Value',
      baseMultiplier: 1.0,
      maxPassengers: 4,
      maxLuggage: 3,
      description: 'Nearest available Sedan, SUV, or Minivan',
      iconType: 'standard',
    };

    const baseTiers: VehicleTierConfig[] = vehicleTiers.length > 0 ? vehicleTiers : [
      {
        id: 'standard',
        name: 'Sedan',
        badge: 'Executive',
        baseMultiplier: 1.0,
        maxPassengers: 4,
        maxLuggage: 3,
        description: 'Executive Lincoln / Camry',
        iconType: 'standard',
      },
      {
        id: 'xl',
        name: 'SUV',
        badge: 'Full-Size XL',
        baseMultiplier: 1.3,
        maxPassengers: 6,
        maxLuggage: 5,
        description: 'Full-size Chevy Suburban / Tahoe',
        iconType: 'xl',
      },
    ];

    if (!baseTiers.some((t) => t.id === 'any')) {
      return [anyTier, ...baseTiers];
    }
    return baseTiers;
  }, [vehicleTiers]);

  // Limits from company config
  const { carSeatLimits } = COMPANY_CONFIG;

  // Dynamic capacities derived from active vehicle tiers with fallback defaults
  const vehicleCapacities = useMemo(() => {
    const map: Record<string, { maxPassengers: number; maxBags: number; name?: string }> = {
      sedan: { maxPassengers: 4, maxBags: 3, name: 'Sedan' },
      suv: { maxPassengers: 6, maxBags: 5, name: 'SUV' },
      van: { maxPassengers: 7, maxBags: 6, name: 'Passenger Van' },
      any: { maxPassengers: 4, maxBags: 3, name: 'Any Available' },
    };

    for (const tier of activeVehicleTiers) {
      map[tier.id] = {
        maxPassengers: tier.maxPassengers,
        maxBags: tier.maxLuggage,
        name: tier.name,
      };
    }
    return map;
  }, [activeVehicleTiers]);

  const getFriendlyVehicleName = useCallback(
    (choice: string): string => {
      if (!choice) return 'Standard Fleet';
      if (vehicleCapacities[choice]?.name) {
        return vehicleCapacities[choice].name;
      }
      const found = activeVehicleTiers.find(
        (t) =>
          t.id === choice ||
          (choice === 'any' && t.id === 'any') ||
          (choice === 'sedan' && (t.id === 'standard' || t.id === 'sedan')) ||
          (choice === 'suv' && (t.id === 'xl' || t.id === 'suv')) ||
          (choice === 'van' && (t.id === 'xl' || t.id === 'van'))
      );
      if (found?.name) return found.name;
      return formatVehicleTier(choice);
    },
    [activeVehicleTiers, vehicleCapacities]
  );

  // Fleet capacity based on selected vehicles (multi-vehicle mode) or single vehicle (max based on biggest vehicle in fleet)
  const totalMaxPassengers = useMemo(() => {
    if (bookingConfig.allowMultiVehicle && form.selectedVehicles.length > 1) {
      return form.selectedVehicles.reduce(
        (acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4),
        0
      );
    }
    return Math.max(...Object.values(vehicleCapacities).map((v) => v.maxPassengers || 4), 7);
  }, [bookingConfig.allowMultiVehicle, form.selectedVehicles, vehicleCapacities]);

  const totalMaxBags = useMemo(() => {
    if (bookingConfig.allowMultiVehicle && form.selectedVehicles.length > 1) {
      return form.selectedVehicles.reduce(
        (acc, v) => acc + (vehicleCapacities[v]?.maxBags || 3),
        0
      );
    }
    return Math.max(...Object.values(vehicleCapacities).map((v) => v.maxBags || 3), 6);
  }, [bookingConfig.allowMultiVehicle, form.selectedVehicles, vehicleCapacities]);

  const totalCarSeats = form.carSeats ? (form.rearFacingCount + form.frontFacingCount + form.boosterCount) : 0;
  const returnTotalCarSeats = form.returnCarSeats ? (form.returnRearFacing + form.returnFrontFacing + form.returnBooster) : 0;

  const oversizedCategories: OversizedBagCategory[] = useMemo(() => {
    if (universalExtras.oversizedBagsConfig && universalExtras.oversizedBagsConfig.length > 0) {
      return universalExtras.oversizedBagsConfig;
    }
    return bookingConfig.oversizedBags && bookingConfig.oversizedBags.length > 0
      ? bookingConfig.oversizedBags
      : DEFAULT_OVERSIZED_BAG_CATEGORIES;
  }, [universalExtras.oversizedBagsConfig, bookingConfig.oversizedBags]);

  const bookableCustomExtras = useMemo(() => {
    return (universalExtras.customExtras || []).filter(
      (ce) => ce.isActive !== false && ce.showOnBookingForm !== false && ce.fee >= 0
    );
  }, [universalExtras.customExtras]);

  const selectedCustomExtrasSummary = useMemo(() => {
    return Object.entries(form.selectedCustomExtras || {})
      .filter(([_, qty]) => qty > 0)
      .map(([id, qty]) => {
        const extra = bookableCustomExtras.find((ce) => ce.id === id);
        return qty > 1 ? `${qty}x ${extra?.name || id}` : extra?.name || id;
      })
      .join(', ');
  }, [form.selectedCustomExtras, bookableCustomExtras]);

  const totalOversizedCount = useMemo(() => {
    return Object.values(form.oversizedBags || {}).reduce((sum, count) => sum + count, 0);
  }, [form.oversizedBags]);

  const oversizedRequiresUpgrade = useMemo(() => {
    if (!form.hasOversizedLuggage) return false;
    return Object.entries(form.oversizedBags || {}).some(([id, count]) => {
      if (count <= 0) return false;
      const cat = oversizedCategories.find((c) => c.id === id);
      return cat ? cat.requiresUpgrade : true;
    });
  }, [form.hasOversizedLuggage, form.oversizedBags, oversizedCategories]);

  const oversizedItemsSummary = useMemo(() => {
    const items = Object.entries(form.oversizedBags || {})
      .filter(([_, count]) => count > 0)
      .map(([id, count]) => {
        const cat = oversizedCategories.find((c) => c.id === id);
        return `${count}x ${cat?.label || id}`;
      });
    return items.join(', ');
  }, [form.oversizedBags, oversizedCategories]);

  const handleToggleCarSeats = (checked: boolean) => {
    setForm((prev) => {
      if (!checked) {
        return {
          ...prev,
          carSeats: false,
          rearFacingCount: 0,
          frontFacingCount: 0,
          boosterCount: 0,
        };
      }
      const hasExisting = prev.rearFacingCount > 0 || prev.frontFacingCount > 0 || prev.boosterCount > 0;
      return {
        ...prev,
        carSeats: true,
        rearFacingCount: hasExisting ? prev.rearFacingCount : 1,
      };
    });
  };

  // Multi-vehicle handlers
  const handleAddVehicle = () => {
    const maxAllowed = bookingConfig.maxVehiclesAllowed || 3;
    if (form.selectedVehicles.length >= maxAllowed) return;
    setForm((prev) => ({
      ...prev,
      selectedVehicles: [...prev.selectedVehicles, 'sedan'],
    }));
  };

  const handleRemoveVehicle = (index: number) => {
    if (form.selectedVehicles.length <= 1) return;
    setForm((prev) => {
      const updated = prev.selectedVehicles.filter((_, i) => i !== index);
      return {
        ...prev,
        selectedVehicles: updated,
        vehicleChoice: updated[0] || 'sedan',
      };
    });
  };

  const handleUpdateVehicleChoice = (index: number, choice: CustomerVehicleChoice) => {
    setForm((prev) => {
      const updated = [...prev.selectedVehicles];
      updated[index] = choice;
      return {
        ...prev,
        selectedVehicles: updated,
        vehicleChoice: updated[0] || choice,
        isVehicleAutoAssigned: false,
      };
    });
  };

  // Airport detection for outbound route
  const airportDetection = useMemo(() => {
    return detectAirportInAddresses(form.pickupAddress, form.dropoffAddress);
  }, [form.pickupAddress, form.dropoffAddress]);

  // Airport detection for return route
  const returnAirportDetection = useMemo(() => {
    return detectAirportInAddresses(form.returnPickupAddress || '', form.returnDropoffAddress || '');
  }, [form.returnPickupAddress, form.returnDropoffAddress]);

  // Map vehicle choice to vehicleTier
  const mapChoiceToTier = useCallback((choice: CustomerVehicleChoice): VehicleTier => {
    if (choice === 'any') return 'any';
    if (choice === 'suv' || choice === 'van') return 'xl';
    if (choice === 'sedan') return 'standard';
    return choice as VehicleTier;
  }, []);

  // Enforce customer vehicle auto-selection and capacity restrictions (single-vehicle mode):
  // Automatically choose cheapest vehicle capable of carrying the requested passengers & luggage
  // If child safety car seats are requested, vehicle must automatically upgrade to SUV/Minivan
  useEffect(() => {
    if (!bookingConfig.allowMultiVehicle && activeVehicleTiers.length > 0) {
      const totalLuggage = form.carryOnBags + form.checkedBags;
      const requiresUpgradedVehicle = totalCarSeats > 0 || returnTotalCarSeats > 0 || oversizedRequiresUpgrade;

      // Find capable vehicles sorted by price multiplier ascending
      const capableTiers = [...activeVehicleTiers]
        .filter((tier) => {
          if (form.passengers > tier.maxPassengers) return false;
          if (totalLuggage > tier.maxLuggage) return false;
          if (requiresUpgradedVehicle && (tier.id === 'sedan' || tier.id === 'standard' || tier.maxPassengers <= 4)) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          if (a.id === 'any') return -1;
          if (b.id === 'any') return 1;
          return a.baseMultiplier - b.baseMultiplier;
        });

      const bestTier = capableTiers[0] || activeVehicleTiers[0];
      const minVehicle = (bestTier?.id || 'any') as CustomerVehicleChoice;

      const currentCap = vehicleCapacities[form.vehicleChoice] || { maxPassengers: 4, maxBags: 3 };
      const hasCarSeatConstraint = requiresUpgradedVehicle && (form.vehicleChoice === 'sedan' || form.vehicleChoice === 'standard');
      const canFitCurrent =
        form.passengers <= currentCap.maxPassengers &&
        totalLuggage <= currentCap.maxBags &&
        !hasCarSeatConstraint;

      if (!canFitCurrent) {
        setForm((prev) => ({
          ...prev,
          vehicleChoice: minVehicle,
          selectedVehicles: [minVehicle],
          isVehicleAutoAssigned: true,
        }));
      } else if (form.isVehicleAutoAssigned && form.vehicleChoice !== minVehicle && form.vehicleChoice !== 'any') {
        setForm((prev) => ({
          ...prev,
          vehicleChoice: minVehicle,
          selectedVehicles: [minVehicle],
        }));
      }
    }
  }, [
    bookingConfig.allowMultiVehicle,
    form.passengers,
    form.carryOnBags,
    form.checkedBags,
    form.isVehicleAutoAssigned,
    form.vehicleChoice,
    totalCarSeats,
    returnTotalCarSeats,
    oversizedRequiresUpgrade,
    vehicleCapacities,
    activeVehicleTiers,
  ]);

  // Ensure selected payment method is allowed by admin configuration
  useEffect(() => {
    if (bookingConfig.acceptedPaymentMethods && bookingConfig.acceptedPaymentMethods.length > 0) {
      if (!bookingConfig.acceptedPaymentMethods.includes(form.paymentMethod)) {
        setForm((prev) => ({
          ...prev,
          paymentMethod: bookingConfig.acceptedPaymentMethods[0] as any,
        }));
      }
    }
  }, [bookingConfig.acceptedPaymentMethods, form.paymentMethod]);

  // When return trip is checked, pre-populate return route with swapped outbound addresses if empty
  useEffect(() => {
    if (form.returnTrip) {
      setForm((prev) => ({
        ...prev,
        returnPickupAddress: prev.returnPickupAddress || prev.dropoffAddress,
        returnPickupCoordinates: prev.returnPickupCoordinates || prev.dropoffCoordinates,
        returnDropoffAddress: prev.returnDropoffAddress || prev.pickupAddress,
        returnDropoffCoordinates: prev.returnDropoffCoordinates || prev.pickupCoordinates,
        returnPassengers: prev.passengers,
        returnBags: prev.bags,
        returnVehicleChoice: prev.vehicleChoice,
      }));
    }
  }, [form.returnTrip, form.pickupAddress, form.dropoffAddress, form.pickupCoordinates, form.dropoffCoordinates, form.passengers, form.bags, form.vehicleChoice]);

  // Auto-enable outbound flight info toggle when an airport is detected
  useEffect(() => {
    if (airportDetection.isAirportTrip) {
      setForm((prev) => {
        if (!prev.provideFlightInfo) {
          return { ...prev, provideFlightInfo: true };
        }
        return prev;
      });
    }
  }, [airportDetection.isAirportTrip]);

  // Auto-enable return flight info toggle when return trip is active and an airport is detected
  useEffect(() => {
    if (form.returnTrip && returnAirportDetection.isAirportTrip) {
      setForm((prev) => {
        if (!prev.returnProvideFlightInfo) {
          return { ...prev, returnProvideFlightInfo: true };
        }
        return prev;
      });
    }
  }, [form.returnTrip, returnAirportDetection.isAirportTrip]);

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
      const activeCustomExtras =
        Object.values(form.selectedCustomExtras || {}).some((q) => q > 0)
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
              passengerCount: Math.max(1, Math.ceil(form.passengers / form.selectedVehicles.length)),
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
              originZoneId: airportDetection.isPickupAirport ? (airportDetection.airport?.iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport') : undefined,
              destinationZoneId: airportDetection.isDropoffAirport ? (airportDetection.airport?.iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport') : undefined,
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
          originZoneId: airportDetection.isPickupAirport ? (airportDetection.airport?.iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport') : undefined,
          destinationZoneId: airportDetection.isDropoffAirport ? (airportDetection.airport?.iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport') : undefined,
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
    mapChoiceToTier,
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
          coordinates: s.coordinates,
        }));

      const returnScheduledTime =
        form.returnDate && form.returnTime
          ? new Date(`${form.returnDate}T${form.returnTime}:00`).toISOString()
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
              passengerCount: Math.max(1, Math.ceil(form.returnPassengers / form.returnSelectedVehicles.length)),
              luggageCount: Math.max(0, Math.ceil(form.returnBags / form.returnSelectedVehicles.length)),
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
              },
              isAirportPickup: returnAirportDetection.isPickupAirport,
              isAirportDropoff: returnAirportDetection.isDropoffAirport,
              isAirportTrip: returnAirportDetection.isAirportTrip,
              originZoneId: returnAirportDetection.isPickupAirport ? (returnAirportDetection.airport?.iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport') : undefined,
              destinationZoneId: returnAirportDetection.isDropoffAirport ? (returnAirportDetection.airport?.iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport') : undefined,
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
          oversizedBags: form.hasOversizedLuggage ? form.oversizedBags : undefined,
          selectedCustomExtras: Object.values(form.selectedCustomExtras || {}).some((q) => q > 0)
            ? form.selectedCustomExtras
            : undefined,
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
          },
          isAirportPickup: returnAirportDetection.isPickupAirport,
          isAirportDropoff: returnAirportDetection.isDropoffAirport,
          isAirportTrip: returnAirportDetection.isAirportTrip,
          originZoneId: returnAirportDetection.isPickupAirport ? (returnAirportDetection.airport?.iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport') : undefined,
          destinationZoneId: returnAirportDetection.isDropoffAirport ? (returnAirportDetection.airport?.iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport') : undefined,
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
    form.returnDate,
    form.returnTime,
    form.returnPassengers,
    form.returnBags,
    form.returnRearFacing,
    form.returnFrontFacing,
    form.returnBooster,
    returnTotalCarSeats,
    mapChoiceToTier,
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

  // Swap Outbound Route
  const handleSwapRoute = () => {
    setForm((prev) => ({
      ...prev,
      pickupAddress: prev.dropoffAddress,
      pickupPlaceId: prev.dropoffPlaceId,
      pickupCoordinates: prev.dropoffCoordinates,
      dropoffAddress: prev.pickupAddress,
      dropoffPlaceId: prev.pickupPlaceId,
      dropoffCoordinates: prev.pickupCoordinates,
    }));
  };

  // Swap Return Route
  const handleSwapReturnRoute = () => {
    setForm((prev) => ({
      ...prev,
      returnPickupAddress: prev.returnDropoffAddress,
      returnPickupCoordinates: prev.returnDropoffCoordinates,
      returnDropoffAddress: prev.returnPickupAddress,
      returnDropoffCoordinates: prev.returnPickupCoordinates,
    }));
  };

  // Intermediate Stops Management
  const handleAddStop = () => {
    if (form.intermediateStops.length >= 5) return;
    setForm((prev) => ({
      ...prev,
      intermediateStops: [
        ...prev.intermediateStops,
        {
          id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          address: '',
        },
      ],
    }));
  };

  const handleUpdateStop = (id: string, updates: Partial<WaypointItem>) => {
    setForm((prev) => ({
      ...prev,
      intermediateStops: prev.intermediateStops.map((stop) =>
        stop.id === id ? { ...stop, ...updates } : stop
      ),
    }));
  };

  const handleRemoveStop = (id: string) => {
    setForm((prev) => ({
      ...prev,
      intermediateStops: prev.intermediateStops.filter((stop) => stop.id !== id),
    }));
  };

  // Additional Passengers Management
  const handleAddPassenger = () => {
    if (form.additionalPassengers.length >= 6) return;
    setForm((prev) => ({
      ...prev,
      additionalPassengers: [...prev.additionalPassengers, { name: '', phone: '' }],
    }));
  };

  const handleRemovePassenger = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      additionalPassengers: prev.additionalPassengers.filter((_, i) => i !== idx),
    }));
  };

  // Special Request Toggle
  const handleToggleSpecialRequest = (key: SpecialRequestKey) => {
    setForm((prev) => ({
      ...prev,
      specialRequests: {
        ...prev.specialRequests,
        [key]: !prev.specialRequests[key],
      },
    }));
  };

  // Form Validation with Customer Restrictions
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.pickupAddress.trim()) {
      newErrors.pickupAddress = 'Pickup location is required.';
    }
    if (!form.dropoffAddress.trim()) {
      newErrors.dropoffAddress = 'Dropoff destination is required.';
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
          newErrors.scheduledTime = `Scheduled rides require at least ${minNotice} minutes advance notice.${bookingConfig.allowImmediateAsap ? ' Please select "Now (ASAP)" for immediate dispatch.' : ''}`;
        }
      }
    }

    if (!form.passengerName.trim()) {
      newErrors.passengerName = 'Passenger full name is required.';
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
      }
      if (!form.contactPhone.trim()) {
        newErrors.contactPhone = 'Booker phone number is required.';
      }
      if (!form.contactEmail.trim()) {
        newErrors.contactEmail = 'Booker email address is required for invoices.';
      }
    }

    // Airport flight number guard (only when pickup is an airport and flight tracking is active)
    if (bookingConfig.requireFlightNumberForAirport && airportDetection.isPickupAirport && form.provideFlightInfo) {
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
      }
      if (!form.returnDropoffAddress.trim()) {
        newErrors.returnDropoffAddress = 'Return dropoff address is required.';
      }
      if (!form.returnDate) {
        newErrors.returnDate = 'Return date is required.';
      }
      if (!form.returnTime) {
        newErrors.returnTime = 'Return time is required.';
      }
      if (
        bookingConfig.requireFlightNumberForAirport &&
        returnAirportDetection.isPickupAirport &&
        form.returnProvideFlightInfo
      ) {
        if (returnAirportDetection.isPrivateAviation) {
          if (!form.returnTailNumber?.trim()) {
            newErrors.returnTailNumber = 'Tail number is required for return private aviation pickups.';
          }
        } else {
          if (!form.returnFlightNumber.trim()) {
            newErrors.returnFlightNumber = 'Flight number (1 to 4 digits) is required for return airport pickups.';
          } else if (!/^\d{1,4}$/.test(form.returnFlightNumber.trim())) {
            newErrors.returnFlightNumber = 'Commercial flight number must be 1 to 4 digits only.';
          }
        }
      }
    }

    if (form.paymentMethod === 'card' && stripeOnlineEnabled && form.cardPaymentType === 'manual') {
      if (!form.paymentToken || form.paymentToken === 'pay_in_cab') {
        newErrors.paymentToken = 'Please enter complete card details or select "Pay Driver in Cab (Terminal)".';
      }
    }

    if (form.paymentMethod === 'account') {
      if (!form.corporateOrgName.trim()) {
        newErrors.corporateOrgName = 'Organization / Company name is required.';
      }
      if (!form.corporateAccountNumber.trim()) {
        newErrors.corporateAccountNumber = 'Corporate account number is required.';
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
    if (!validateForm()) return;

    // Security Guard: Invisible Honeypot Anti-Bot Trap
    if (isBotHoneypotTriggered(form.botTrapField)) {
      console.warn('[BookingEngineV2] Bot honeypot triggered. Suppressing automated spam submission.');
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
          lastName: sanitizeTextInput(form.passengerName).split(/\s+/).slice(1).join(' ') || '',
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
        combinedNotes = `[Flight: ${form.airline} #${form.flightNumber} from ${form.flightOrigin || 'N/A'}${form.hasCheckedLuggage ? ' (Checked Luggage)' : ''}] ${combinedNotes}`.trim();
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

      let returnEffectivePricing: TripPricing = returnQuote?.pricing || {
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
        // Roundtrip Reverse-Route Balancing:
        // Round prices to ceiling dollar and ensure equal price taking the higher leg
        const outboundCeil = Math.ceil(effectivePricing.totalFare);
        const returnCeil = Math.ceil(returnEffectivePricing.totalFare);
        const balancedLegFare = Math.max(outboundCeil, returnCeil);

        effectivePricing = {
          ...effectivePricing,
          subtotal: balancedLegFare,
          totalFare: balancedLegFare,
        };

        returnEffectivePricing = {
          ...returnEffectivePricing,
          subtotal: balancedLegFare,
          totalFare: balancedLegFare,
        };
      }

      const scheduledPickupTime =
        form.timingType === 'later' && form.scheduledDate && form.scheduledTime
          ? new Date(`${form.scheduledDate}T${form.scheduledTime}:00`).toISOString()
          : undefined;

      let paymentMethodType: PaymentMethod = 'cash';
      if (form.paymentMethod === 'card') paymentMethodType = 'card';
      if (form.paymentMethod === 'account') paymentMethodType = 'corporate';

      // Verify Corporate Account # & PO anti-fraud via rate-limited server endpoint (never falls back to mock 'corp-1'!)
      let verifiedCorporateAccountId: string | undefined;
      if (form.paymentMethod === 'account') {
        const acctNum = form.corporateAccountNumber.trim();
        if (!acctNum) {
          throw new Error('Please enter your Corporate Account Number to bill a corporate account.');
        }
        const totalProjected = form.returnTrip
          ? effectivePricing.totalFare + returnEffectivePricing.totalFare
          : effectivePricing.totalFare;
        const verifyResp = await fetch('/api/corporate/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountNumber: acctNum,
            poNumber: form.billingPo.trim(),
            estimatedFare: totalProjected,
          }),
        });
        const verifyData = (await verifyResp.json().catch(() => ({}))) as any;
        if (!verifyResp.ok || !verifyData.verified) {
          throw new Error(
            verifyData.error ||
              'Unable to verify Corporate Account / PO Number. Please check your details or call dispatch.'
          );
        }
        if (verifyData.corporateAccountId) {
          verifiedCorporateAccountId = String(verifyData.corporateAccountId);
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
        if (form.cardBrand && ['visa', 'mastercard', 'amex', 'discover'].includes(form.cardBrand)) {
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
      const signedInUid =
        isFirebaseConfigured() ? getFirebaseAuth().currentUser?.uid || undefined : undefined;
      const selectedVehicleTierObj = activeVehicleTiers.find((v) => v.id === form.vehicleChoice);
      const vehicleDisplayName =
        selectedVehicleTierObj?.name || formatVehicleTier(mapChoiceToTier(form.vehicleChoice));

      // Customer web submissions strictly default to 'UNCONFIRMED'
      const inputPayload: CreateTripInput = {
        ...(signedInUid ? { customerId: signedInUid, userId: signedInUid } : {}),
        pickupLocation,
        dropoffLocation,
        intermediateStops: intermediateStopsLocations.length > 0 ? intermediateStopsLocations : undefined,
        bookingType: form.timingType === 'asap' ? 'asap' : 'scheduled',
        scheduledPickupTime,
        vehicleTier: mapChoiceToTier(form.vehicleChoice),
        status: 'UNCONFIRMED',
        passenger: {
          firstName: sanitizeTextInput(form.passengerName.trim().split(/\s+/)[0] || form.passengerName, 50),
          lastName: sanitizeTextInput(form.passengerName.trim().split(/\s+/).slice(1).join(' ') || '', 50),
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
          bookerPhone: form.isBookerDifferent ? sanitizeTextInput(form.contactPhone, 30) : undefined,
          bookerEmail: form.isBookerDifferent ? sanitizeTextInput(form.contactEmail, 120) : undefined,
          bookerRole: form.isBookerDifferent ? sanitizeTextInput(form.contactRole, 60) : undefined,
          corporateOrgName: form.paymentMethod === 'account' ? sanitizeTextInput(form.corporateOrgName, 100) : undefined,
          corporateAccountNumber: form.paymentMethod === 'account' ? sanitizeTextInput(form.corporateAccountNumber, 50) : undefined,
          billingPo: form.paymentMethod === 'account' ? sanitizeTextInput(form.billingPo, 50) : undefined,
          authorizedBy: form.paymentMethod === 'account' ? sanitizeTextInput(form.authorizedBy, 100) : undefined,
          invoicingTerms: form.paymentMethod === 'account' ? sanitizeTextInput(form.invoicingTerms, 50) : undefined,
          additionalPassengers: form.additionalPassengers,
          provideFlightInfo: form.provideFlightInfo,
          airline: form.provideFlightInfo ? sanitizeTextInput(form.airline, 80) : undefined,
          airlineName: form.provideFlightInfo ? sanitizeTextInput(form.airline, 80) : undefined,
          flightNumber: form.provideFlightInfo ? sanitizeTextInput(form.flightNumber, 30) : undefined,
          flightOrigin: form.provideFlightInfo ? sanitizeTextInput(form.flightOrigin, 80) : undefined,
          departureAirport: form.provideFlightInfo ? sanitizeTextInput(form.flightOrigin, 80) : undefined,
          tailNumber: form.provideFlightInfo ? sanitizeTextInput(form.tailNumber, 50) : undefined,
          fboFacility: form.provideFlightInfo ? sanitizeTextInput(form.fboFacility, 80) : undefined,
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
          selectedVehicles: bookingConfig.allowMultiVehicle ? form.selectedVehicles : [form.vehicleChoice],
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
          resolveTier: (c) => String(mapChoiceToTier(c as any)),
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
              preAuthHoldAmount: paymentIntentId && i === 0 ? effectivePricing.totalFare : undefined,
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
      let createdReturnTripObj: any = null;

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
                returnFlightNotes = `[Return Private Aviation: Tail #${form.returnTailNumber || 'N/A'}, FBO: ${form.returnFboFacility || 'N/A'}${form.returnHasCheckedLuggage ? ' (Checked Luggage)' : ''}] `;
              }
            } else {
              if (form.returnAirline || form.returnFlightNumber) {
                returnFlightNotes = `[Return Flight: ${form.returnAirline} #${form.returnFlightNumber} from ${form.returnFlightOrigin || 'N/A'}${form.returnHasCheckedLuggage ? ' (Checked Luggage)' : ''}] `;
              }
            }
          }

          const returnVehicleTierObj = activeVehicleTiers.find((v) => v.id === form.returnVehicleChoice);
          const returnVehicleDisplayName =
            returnVehicleTierObj?.name || formatVehicleTier(mapChoiceToTier(form.returnVehicleChoice));

          const returnPayload: CreateTripInput = {
            ...(signedInUid ? { customerId: signedInUid, userId: signedInUid } : {}),
            pickupLocation: {
              address: form.returnPickupAddress,
              coordinates: form.returnPickupCoordinates || dropoffLocation.coordinates,
            },
            dropoffLocation: {
              address: form.returnDropoffAddress,
              coordinates: form.returnDropoffCoordinates || pickupLocation.coordinates,
            },
            intermediateStops: form.returnIntermediateStops.length > 0
              ? form.returnIntermediateStops.map((s) => ({ address: s.address, coordinates: s.coordinates }))
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
            driverNotes: `[Return Leg of Trip #${createdTrip.id}] ${returnFlightNotes}${form.driverNotes}`.trim(),
            metadata: {
              linkedTripId: createdTrip.id,
              isReturnRide: true,
              vehicleTypeId: form.returnVehicleChoice,
              vehicleDisplayName: returnVehicleDisplayName,
              createdByRole: 'customer_web',
              airline: form.returnProvideFlightInfo ? form.returnAirline : undefined,
              airlineName: form.returnProvideFlightInfo ? form.returnAirline : undefined,
              flightNumber: form.returnProvideFlightInfo ? form.returnFlightNumber : undefined,
              flightOrigin: form.returnProvideFlightInfo ? form.returnFlightOrigin : undefined,
              departureAirport: form.returnProvideFlightInfo ? form.returnFlightOrigin : undefined,
              tailNumber: form.returnProvideFlightInfo ? form.returnTailNumber : undefined,
              fboFacility: form.returnProvideFlightInfo ? form.returnFboFacility : undefined,
              isPrivateAviation: Boolean(returnAirportDetection.isPrivateAviation),
              hasCheckedLuggage: form.returnProvideFlightInfo ? form.returnHasCheckedLuggage : false,
              isAirportTrip: Boolean(returnAirportDetection.isAirportTrip),
              airportIataCode: returnAirportDetection.airport?.iataCode,
              selectedVehicles: bookingConfig.allowMultiVehicle ? form.returnSelectedVehicles : [form.returnVehicleChoice],
              carSeatsBreakdown: {
                rearFacing: form.returnRearFacing,
                frontFacing: form.returnFrontFacing,
                booster: form.returnBooster,
                total: returnTotalCarSeats,
              },
              hasOversizedLuggage: form.hasOversizedLuggage,
              oversizedBags: form.oversizedBags,
              oversizedItemsSummary: oversizedItemsSummary,
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
            createdTrip.metadata.returnFlightNumber = form.returnProvideFlightInfo ? form.returnFlightNumber : undefined;
            createdTrip.metadata.returnAirline = form.returnProvideFlightInfo ? form.returnAirline : undefined;
            createdTrip.metadata.returnFlightOrigin = form.returnProvideFlightInfo ? form.returnFlightOrigin : undefined;
            createdTrip.metadata.returnTailNumber = form.returnProvideFlightInfo ? form.returnTailNumber : undefined;
            createdTrip.metadata.returnFboFacility = form.returnProvideFlightInfo ? form.returnFboFacility : undefined;
            createdTrip.metadata.returnIsPrivateAviation = Boolean(returnAirportDetection.isPrivateAviation);
            createdTrip.metadata.returnHasCheckedLuggage = form.returnProvideFlightInfo ? form.returnHasCheckedLuggage : false;
            createdTrip.metadata.returnIsAirportTrip = Boolean(returnAirportDetection.isAirportTrip);
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
          intermediateStops: createdTrip.intermediateStops?.map((s) => ({ address: s.address, notes: s.notes })),
          dropoffAddress: createdTrip.dropoffLocation.address,
          dropoffNotes: createdTrip.dropoffLocation.notes,
          pickupTime:
            createdTrip.bookingType === 'scheduled' && createdTrip.scheduledPickupTime
              ? new Date(createdTrip.scheduledPickupTime).toLocaleString()
              : 'Immediate Ride (ASAP)',
          bookingType: createdTrip.bookingType,
          vehicleTier: form.vehicleChoice === 'any' ? 'any' : (createdTrip.vehicleTier || 'standard'),
          vehicleDisplayName: (createdTrip.metadata?.vehicleDisplayName as string) || undefined,
          passengerCount: createdTrip.passenger.passengerCount,
          luggageCount: createdTrip.passenger.luggageCount,
          contactPerson: form.isBookerDifferent ? {
            isBookerDifferent: form.isBookerDifferent,
            contactName: form.contactName,
            contactPhone: form.contactPhone,
            contactEmail: form.contactEmail,
            contactRole: form.contactRole,
          } : undefined,
          carSeatsBreakdown: {
            rearFacing: form.rearFacingCount,
            frontFacing: form.frontFacingCount,
            booster: form.boosterCount,
            total: totalCarSeats,
          },
          additionalPassengers: form.additionalPassengers,
          totalFare: createdTrip.pricing.totalFare,
          breakdown: createdTrip.pricing.breakdown,
          tariffProfileName: createdTrip.pricing.matchedCorridorName || createdTrip.pricing.tariffProfileName,
          currency: createdTrip.pricing.currency || 'USD',
          paymentMethod: createdTrip.payment.method,
          specialRequests: createdTrip.passenger.specialRequests,
          oversizedBags: form.oversizedBags,
          oversizedItemsSummary: oversizedItemsSummary,
          customExtrasSummary: (createdTrip.metadata?.customExtrasSummary as string) || undefined,
          flightDetails: form.provideFlightInfo ? {
            airlineName: form.airline,
            flightNumber: form.flightNumber,
            departureAirport: form.flightOrigin,
            tailNumber: form.tailNumber,
            fboFacility: form.fboFacility,
            isPrivateAviation: Boolean(airportDetection.isPrivateAviation),
            hasCheckedLuggage: form.hasCheckedLuggage,
            isAirportTrip: Boolean(airportDetection.isAirportTrip),
          } : undefined,
          returnTripDetails: createdReturnTripObj ? {
            tripId: createdReturnTripObj.id,
            trackingToken: createdReturnTripObj.trackingToken,
            pickupAddress: createdReturnTripObj.pickupLocation.address,
            dropoffAddress: createdReturnTripObj.dropoffLocation.address,
            pickupTime:
              createdReturnTripObj.bookingType === 'scheduled' && createdReturnTripObj.scheduledPickupTime
                ? new Date(createdReturnTripObj.scheduledPickupTime).toLocaleString()
                : 'Scheduled Return',
            vehicleTier: form.returnVehicleChoice === 'any' ? 'any' : (createdReturnTripObj.vehicleTier || 'standard'),
            vehicleDisplayName: (createdReturnTripObj.metadata?.vehicleDisplayName as string) || undefined,
            passengerCount: createdReturnTripObj.passenger?.passengerCount,
            luggageCount: createdReturnTripObj.passenger?.luggageCount,
            totalFare: createdReturnTripObj.pricing.totalFare,
            flightDetails: form.returnProvideFlightInfo ? {
              airlineName: form.returnAirline,
              flightNumber: form.returnFlightNumber,
              departureAirport: form.returnFlightOrigin,
              tailNumber: form.returnTailNumber,
              fboFacility: form.returnFboFacility,
              isPrivateAviation: Boolean(returnAirportDetection.isPrivateAviation),
              hasCheckedLuggage: form.returnHasCheckedLuggage,
              isAirportTrip: Boolean(returnAirportDetection.isAirportTrip),
            } : undefined,
          } : undefined,
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
          passengerName: `${createdTrip.passenger.firstName} ${createdTrip.passenger.lastName}`.trim(),
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
          tariffProfileName: createdTrip.pricing.matchedCorridorName || createdTrip.pricing.tariffProfileName,
          currency: createdTrip.pricing.currency,
          specialRequests: createdTrip.passenger.specialRequests,
          urgency: createdTrip.bookingType === 'asap' ? 'high' : 'normal',
          status: createdTrip.status,
          lambertPickupInstructions: bookingConfig.lambertPickupInstructions,
          returnTripDetails: createdReturnTripObj ? {
            tripId: createdReturnTripObj.id,
            pickupAddress: createdReturnTripObj.pickupLocation.address,
            dropoffAddress: createdReturnTripObj.dropoffLocation.address,
            pickupTime:
              createdReturnTripObj.bookingType === 'scheduled' && createdReturnTripObj.scheduledPickupTime
                ? new Date(createdReturnTripObj.scheduledPickupTime).toLocaleString()
                : 'Scheduled Return',
            vehicleTier: createdReturnTripObj.vehicleTier,
            totalFare: createdReturnTripObj.pricing.totalFare,
            flightDetails: form.returnProvideFlightInfo ? {
              airlineName: form.returnAirline,
              flightNumber: form.returnFlightNumber,
              departureAirport: form.returnFlightOrigin,
              tailNumber: form.returnTailNumber,
              fboFacility: form.returnFboFacility,
              isPrivateAviation: Boolean(returnAirportDetection.isPrivateAviation),
              hasCheckedLuggage: form.returnHasCheckedLuggage,
              isAirportTrip: Boolean(returnAirportDetection.isAirportTrip),
            } : undefined,
          } : undefined,
          companySettings: {
            name: companyConfig?.name,
            phone: companyConfig?.phone,
            address: companyConfig?.address,
            email: companyConfig?.email,
          },
        });

        setEmailDelivery({
          status: confirmResult.simulated ? 'simulated' : confirmResult.success ? 'sent' : 'failed',
          recipient: createdTrip.passenger.email,
          messageId: confirmResult.messageId,
          error: confirmResult.error,
        });
      } catch (err: unknown) {
        console.warn('[BookingEngineV2] Email dispatch error:', err);
        setEmailDelivery({
          status: 'failed',
          recipient: createdTrip.passenger.email,
          error: err instanceof Error ? err.message : 'Unable to send confirmation email right now.',
        });
      }

      setConfirmedTrip(createdTrip);
      onBookingSuccess?.(createdTrip);
    } catch (err: unknown) {
      console.error('[BookingEngineV2] Booking creation failed:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to record reservation. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // If trip is confirmed, show confirmation view
  if (confirmedTrip) {
    return (
      <div className="max-w-3xl mx-auto py-6">
        <BookingConfirmation
          trip={confirmedTrip}
          emailDelivery={emailDelivery}
          onBookAnother={() => {
            setConfirmedTrip(null);
            setForm((prev) => ({
              ...prev,
              pickupAddress: '',
              dropoffAddress: '',
              intermediateStops: [],
              returnTrip: false,
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
            }));
            setQuote(null);
            setReturnQuote(null);
          }}
        />
      </div>
    );
  }

  // Prefer the exact pre-computed vehicle quote for the currently selected vehicle
  // so switching vehicle cards updates the Trip Summary & Breakdown instantaneously
  const activeOutboundPricing =
    (!bookingConfig.allowMultiVehicle && quote?.vehicleQuotes?.[form.vehicleChoice]) ||
    quote?.pricing ||
    null;

  const outboundRawFare = activeOutboundPricing?.totalFare ?? null;
  const returnRawFare = returnQuote?.pricing.totalFare ?? null;

  // Roundtrip Reverse-Route Balancing:
  // Round prices to ceiling dollar, and ensure equal leg price taking the higher leg
  let outboundFare: number | null = outboundRawFare !== null ? Math.ceil(outboundRawFare) : null;
  let returnFare: number | null = returnRawFare !== null ? Math.ceil(returnRawFare) : null;

  if (form.returnTrip && outboundFare !== null && returnFare !== null) {
    const balancedLegFare = Math.max(outboundFare, returnFare);
    outboundFare = balancedLegFare;
    returnFare = balancedLegFare;
  }

  const totalDisplayFare = outboundFare !== null
    ? (form.returnTrip && returnFare !== null ? outboundFare + returnFare : outboundFare)
    : null;

  // Real per-vehicle fare computed directly by the Admin Tariff, Surcharges & Rules engine
  const estimateTierDisplayFare = (tier: VehicleTierConfig): number | null => {
    const exactTierQuote = quote?.vehicleQuotes?.[tier.id];
    if (exactTierQuote && typeof exactTierQuote.totalFare === 'number') {
      return Math.ceil(exactTierQuote.totalFare);
    }
    return null;
  };

  const validationErrorCount = Object.keys(errors).length;

  const handleOpenBreakdownFromMobile = () => {
    setShowPriceBreakdown(true);
    setTimeout(() => {
      const el = document.getElementById('trip-price-breakdown') || document.getElementById('trip-summary-card');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  return (
    <div className={`relative max-w-6xl mx-auto ${className}`}>
      <form onSubmit={handleBookRide} noValidate>
        {/* Invisible Honeypot Anti-Bot Trap */}
        <div style={{ display: 'none', position: 'absolute', left: '-9999px', opacity: 0 }} aria-hidden="true" tabIndex={-1}>
          <label htmlFor="hp_company_sec_field">Leave this field blank</label>
          <input
            id="hp_company_sec_field"
            type="text"
            name="hp_company_sec_field"
            value={form.botTrapField || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, botTrapField: e.target.value }))}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {/* Optional Live Dispatch Banner (honors hideDispatchBanner) */}
        {!hideDispatchBanner && (
          <div className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xs text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold tracking-wide">24/7 Live Chesterfield Dispatch</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-300">
                <span>No Surprise Surge</span>
                <span className="hidden sm:inline text-slate-600">&bull;</span>
                <span className="hidden sm:inline">Live STL Flight Tracking</span>
                <span className="hidden sm:inline text-slate-600">&bull;</span>
                <span className="hidden md:inline">Free Cancellation (2h+)</span>
              </div>
            </div>
          </div>
        )}

        {/* Grid: Left Main Stack (Col 8), Right Sticky Summary (Col 4) */}
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 items-start ${embeddedInApp ? 'pb-36 md:pb-24' : 'pb-24 lg:pb-8'}`}>
          {/* Left Column: Reordered 4-Section Single-Page Progression */}
          <div className="lg:col-span-8 space-y-4">
            {editingTripId && (
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs font-semibold flex items-center justify-between gap-2">
                <span>Editing Existing Reservation #{editingTripId}</span>
                {onCancelEdit && (
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            )}
            {submitError && (
              <div role="alert" className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2">
                <span className="text-base">⚠</span>
                <span>{submitError}</span>
              </div>
            )}

            {/* ─── Section 1: Pickup Time & Route ─── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center justify-center">
                    1
                  </span>
                  <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                    Pickup Time &amp; Route
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  {form.timingType === 'later' ? 'Scheduled Ride' : 'On-Demand Dispatch'}
                </span>
              </div>

              {/* Segmented Timing Switcher */}
              <div className="space-y-2.5">
                {bookingConfig.allowImmediateAsap ? (
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, timingType: 'asap' }))}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        form.timingType === 'asap'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ⚡ Ride Now (ASAP)
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, timingType: 'later' }))}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        form.timingType === 'later'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📅 Schedule for Later
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-700 text-xs font-bold">
                    <ClockIcon className="w-4 h-4 text-blue-600" />
                    <span>Advance Scheduled Pickup</span>
                  </div>
                )}

                {form.timingType === 'later' ? (
                  <div className="grid grid-cols-2 gap-2.5 animate-in fade-in duration-150">
                    <div>
                      <label htmlFor="scheduledDate" className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Pickup Date
                      </label>
                      <input
                        id="scheduledDate"
                        type="date"
                        name="scheduledDate"
                        value={form.scheduledDate}
                        min={todayLocalDate}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, scheduledDate: e.target.value }));
                          if (errors.scheduledDate || errors.scheduledTime) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.scheduledDate;
                              delete next.scheduledTime;
                              return next;
                            });
                          }
                        }}
                        required
                        className={`w-full min-w-0 px-3 py-2.5 bg-slate-50 border ${
                          errors.scheduledDate ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                        } rounded-xl text-slate-900 text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 focus:outline-none`}
                      />
                      {errors.scheduledDate && (
                        <p className="text-[11px] text-red-600 font-semibold mt-1">{errors.scheduledDate}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="scheduledTime" className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Pickup Time
                      </label>
                      <input
                        id="scheduledTime"
                        type="time"
                        name="scheduledTime"
                        value={form.scheduledTime}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, scheduledTime: e.target.value }));
                          if (errors.scheduledTime) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.scheduledTime;
                              return next;
                            });
                          }
                        }}
                        required
                        className={`w-full min-w-0 px-3 py-2.5 bg-slate-50 border ${
                          errors.scheduledTime ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                        } rounded-xl text-slate-900 text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 focus:outline-none`}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="px-3.5 py-2.5 bg-blue-50 border border-blue-200/80 rounded-xl text-blue-900 text-xs font-semibold flex flex-wrap items-center justify-between gap-2">
                    <span>⚡ Immediate Dispatch (Nearest Available Vehicle)</span>
                    <span className="text-[11px] text-blue-700 font-medium">Typical arrival 15–25 mins</span>
                  </div>
                )}

                {errors.scheduledTime && (
                  <p className="text-xs text-red-600 font-semibold">{errors.scheduledTime}</p>
                )}
              </div>

              {/* Route & Stops Container */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="relative flex items-center gap-2">
                  <button
                    type="button"
                    title="Swap Pickup and Dropoff"
                    aria-label="Swap Pickup and Dropoff"
                    onClick={handleSwapRoute}
                    className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-blue-700 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl transition-colors self-center text-sm font-bold shrink-0 shadow-2xs cursor-pointer"
                  >
                    ↕
                  </button>

                  <div className="flex-1 space-y-2.5 min-w-0">
                    {/* Pickup Address */}
                    <div>
                      <DispatchLocationInput
                        name="pickupAddress"
                        size="comfortable"
                        showCurrentLocationButton={true}
                        hasError={Boolean(errors.pickupAddress)}
                        placeholder="Pickup Location (e.g. 17000 Baxter Rd, Chesterfield)"
                        value={form.pickupAddress}
                        variant="pickup"
                        onChange={(addr) => {
                          setForm((prev) => ({ ...prev, pickupAddress: addr }));
                          if (errors.pickupAddress) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.pickupAddress;
                              return next;
                            });
                          }
                        }}
                        onPlaceSelected={(p: PlaceSelectedDetails) => {
                          setForm((prev) => ({
                            ...prev,
                            pickupAddress: p.address,
                            pickupCoordinates: p.coordinates,
                            pickupPlaceId: p.placeId,
                          }));
                          if (errors.pickupAddress) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.pickupAddress;
                              return next;
                            });
                          }
                        }}
                        required
                      />
                      {errors.pickupAddress && (
                        <p className="text-xs text-red-600 font-semibold mt-1 ml-1">
                          {errors.pickupAddress}
                        </p>
                      )}
                    </div>

                    {/* Intermediate Stops */}
                    {form.intermediateStops.map((stop, idx) => (
                      <div key={stop.id} className="flex items-center gap-1.5">
                        <div className="flex-1 min-w-0">
                          <DispatchLocationInput
                            size="comfortable"
                            placeholder={`Intermediate Stop #${idx + 1}`}
                            value={stop.address}
                            variant="stop"
                            onChange={(val) => handleUpdateStop(stop.id, { address: val })}
                            onPlaceSelected={(p: PlaceSelectedDetails) => {
                              handleUpdateStop(stop.id, {
                                address: p.address,
                                coordinates: p.coordinates,
                                placeId: p.placeId,
                              });
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveStop(stop.id)}
                          className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer shrink-0"
                          title="Remove stop"
                          aria-label={`Remove stop ${idx + 1}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    {/* Dropoff Address */}
                    <div>
                      <DispatchLocationInput
                        name="dropoffAddress"
                        size="comfortable"
                        hasError={Boolean(errors.dropoffAddress)}
                        placeholder="Dropoff Destination (e.g. Lambert St. Louis Airport)"
                        value={form.dropoffAddress}
                        variant="dropoff"
                        onChange={(addr) => {
                          setForm((prev) => ({ ...prev, dropoffAddress: addr }));
                          if (errors.dropoffAddress) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.dropoffAddress;
                              return next;
                            });
                          }
                        }}
                        onPlaceSelected={(p: PlaceSelectedDetails) => {
                          setForm((prev) => ({
                            ...prev,
                            dropoffAddress: p.address,
                            dropoffCoordinates: p.coordinates,
                            dropoffPlaceId: p.placeId,
                          }));
                          if (errors.dropoffAddress) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.dropoffAddress;
                              return next;
                            });
                          }
                        }}
                        required
                      />
                      {errors.dropoffAddress && (
                        <p className="text-xs text-red-600 font-semibold mt-1 ml-1">
                          {errors.dropoffAddress}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Route Stats, Quote Error & Add Stop Action */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    {isQuoteLoading ? (
                      <div className="flex items-center gap-1.5 text-blue-600 font-semibold">
                        <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                        <span>Calculating route estimate...</span>
                      </div>
                    ) : quoteError ? (
                      <span className="text-amber-700 font-semibold">{quoteError}</span>
                    ) : quote ? (
                      <div>
                        Est. Route:{' '}
                        <span className="font-bold text-slate-800">
                          {quote.pricing.durationMinutes} min
                        </span>{' '}
                        &bull;{' '}
                        <span className="font-bold text-slate-800">
                          {quote.pricing.distanceMiles.toFixed(1)} mi
                        </span>
                      </div>
                    ) : (
                      <span>Enter pickup &amp; dropoff for live route estimate</span>
                    )}
                  </div>

                  {form.intermediateStops.length < 5 && (
                    <button
                      type="button"
                      onClick={handleAddStop}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200 shadow-2xs active:scale-95 transition-all cursor-pointer"
                    >
                      <PlusIcon className="w-3.5 h-3.5 text-blue-600" />
                      <span>Add Stop</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Outbound Airport Assistance Card */}
              {(airportDetection.isAirportTrip || form.provideFlightInfo) && (
                <FlightAssistanceCard
                  variant="outbound"
                  detection={airportDetection}
                  provideFlightInfo={form.provideFlightInfo}
                  onToggleProvideFlightInfo={(checked) =>
                    setForm((prev) => ({ ...prev, provideFlightInfo: checked }))
                  }
                  airline={form.airline}
                  onAirlineChange={(val) => setForm((prev) => ({ ...prev, airline: val }))}
                  flightNumber={form.flightNumber}
                  onFlightNumberChange={(val) => {
                    setForm((prev) => ({ ...prev, flightNumber: val }));
                    if (errors.flightNumber) {
                      setErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.flightNumber;
                        return copy;
                      });
                    }
                  }}
                  flightOrigin={form.flightOrigin}
                  onFlightOriginChange={(val) => setForm((prev) => ({ ...prev, flightOrigin: val }))}
                  tailNumber={form.tailNumber}
                  onTailNumberChange={(val) => {
                    setForm((prev) => ({ ...prev, tailNumber: val }));
                    if (errors.tailNumber) {
                      setErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.tailNumber;
                        return copy;
                      });
                    }
                  }}
                  fboFacility={form.fboFacility}
                  onFboFacilityChange={(val) => setForm((prev) => ({ ...prev, fboFacility: val }))}
                  hasCheckedLuggage={form.hasCheckedLuggage}
                  onHasCheckedLuggageChange={(checked) =>
                    setForm((prev) => ({ ...prev, hasCheckedLuggage: checked }))
                  }
                  fboFacilities={COMMON_FBO_FACILITIES}
                  lambertPickupInstructions={bookingConfig.lambertPickupInstructions}
                  flightNumberError={errors.flightNumber}
                  tailNumberError={errors.tailNumber}
                />
              )}

              {/* Inline Round-Trip Toggle (Naturally grouped under Route) */}
              {bookingConfig.allowRoundTrip && (
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2.5 cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={form.returnTrip}
                        onChange={(e) => setForm((prev) => ({ ...prev, returnTrip: e.target.checked }))}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-bold text-slate-900 text-xs sm:text-sm">
                        Add Return Trip (Round Trip)
                      </span>
                    </label>
                    {form.returnTrip && (
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                        Round Trip Linked
                      </span>
                    )}
                  </div>

                  {form.returnTrip && (
                    <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-indigo-900 uppercase tracking-wider">
                          Return Leg Route &amp; Schedule
                        </span>
                        <button
                          type="button"
                          title="Swap Return Route"
                          onClick={handleSwapReturnRoute}
                          className="text-xs font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                        >
                          ↕ Swap Return
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        <div>
                          <DispatchLocationInput
                            name="returnPickupAddress"
                            size="comfortable"
                            hasError={Boolean(errors.returnPickupAddress)}
                            placeholder="Return Pickup Location"
                            value={form.returnPickupAddress}
                            variant="pickup"
                            onChange={(addr) => setForm((prev) => ({ ...prev, returnPickupAddress: addr }))}
                            onPlaceSelected={(p: PlaceSelectedDetails) => {
                              setForm((prev) => ({
                                ...prev,
                                returnPickupAddress: p.address,
                                returnPickupCoordinates: p.coordinates,
                              }));
                            }}
                            required={form.returnTrip}
                          />
                          {errors.returnPickupAddress && (
                            <p className="text-xs text-red-600 font-semibold mt-1">{errors.returnPickupAddress}</p>
                          )}
                        </div>

                        <div>
                          <DispatchLocationInput
                            name="returnDropoffAddress"
                            size="comfortable"
                            hasError={Boolean(errors.returnDropoffAddress)}
                            placeholder="Return Dropoff Location"
                            value={form.returnDropoffAddress}
                            variant="dropoff"
                            onChange={(addr) => setForm((prev) => ({ ...prev, returnDropoffAddress: addr }))}
                            onPlaceSelected={(p: PlaceSelectedDetails) => {
                              setForm((prev) => ({
                                ...prev,
                                returnDropoffAddress: p.address,
                                returnDropoffCoordinates: p.coordinates,
                              }));
                            }}
                            required={form.returnTrip}
                          />
                          {errors.returnDropoffAddress && (
                            <p className="text-xs text-red-600 font-semibold mt-1">{errors.returnDropoffAddress}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label htmlFor="returnDate" className="block text-[11px] text-indigo-900 font-semibold mb-1">
                            Return Date
                          </label>
                          <input
                            id="returnDate"
                            name="returnDate"
                            type="date"
                            value={form.returnDate}
                            min={form.scheduledDate || todayLocalDate}
                            onChange={(e) => setForm((prev) => ({ ...prev, returnDate: e.target.value }))}
                            className={`w-full px-3 py-2.5 bg-white border ${
                              errors.returnDate ? 'border-red-400' : 'border-indigo-200'
                            } rounded-xl text-base sm:text-sm text-slate-900`}
                          />
                          {errors.returnDate && (
                            <p className="text-xs text-red-600 font-semibold mt-1">{errors.returnDate}</p>
                          )}
                        </div>
                        <div>
                          <label htmlFor="returnTime" className="block text-[11px] text-indigo-900 font-semibold mb-1">
                            Return Time
                          </label>
                          <input
                            id="returnTime"
                            name="returnTime"
                            type="time"
                            value={form.returnTime}
                            onChange={(e) => setForm((prev) => ({ ...prev, returnTime: e.target.value }))}
                            className={`w-full px-3 py-2.5 bg-white border ${
                              errors.returnTime ? 'border-red-400' : 'border-indigo-200'
                            } rounded-xl text-base sm:text-sm text-slate-900`}
                          />
                          {errors.returnTime && (
                            <p className="text-xs text-red-600 font-semibold mt-1">{errors.returnTime}</p>
                          )}
                        </div>
                      </div>

                      {(returnAirportDetection.isAirportTrip || form.returnProvideFlightInfo) ? (
                        <FlightAssistanceCard
                          variant="return"
                          detection={returnAirportDetection}
                          provideFlightInfo={form.returnProvideFlightInfo}
                          onToggleProvideFlightInfo={(checked) =>
                            setForm((prev) => ({ ...prev, returnProvideFlightInfo: checked }))
                          }
                          airline={form.returnAirline}
                          onAirlineChange={(val) => setForm((prev) => ({ ...prev, returnAirline: val }))}
                          flightNumber={form.returnFlightNumber}
                          onFlightNumberChange={(val) => {
                            setForm((prev) => ({ ...prev, returnFlightNumber: val }));
                            if (errors.returnFlightNumber) {
                              setErrors((prev) => {
                                const copy = { ...prev };
                                delete copy.returnFlightNumber;
                                return copy;
                              });
                            }
                          }}
                          flightOrigin={form.returnFlightOrigin}
                          onFlightOriginChange={(val) =>
                            setForm((prev) => ({ ...prev, returnFlightOrigin: val }))
                          }
                          tailNumber={form.returnTailNumber}
                          onTailNumberChange={(val) => {
                            setForm((prev) => ({ ...prev, returnTailNumber: val }));
                            if (errors.returnTailNumber) {
                              setErrors((prev) => {
                                const copy = { ...prev };
                                delete copy.returnTailNumber;
                                return copy;
                              });
                            }
                          }}
                          fboFacility={form.returnFboFacility}
                          onFboFacilityChange={(val) =>
                            setForm((prev) => ({ ...prev, returnFboFacility: val }))
                          }
                          hasCheckedLuggage={form.returnHasCheckedLuggage}
                          onHasCheckedLuggageChange={(checked) =>
                            setForm((prev) => ({ ...prev, returnHasCheckedLuggage: checked }))
                          }
                          fboFacilities={COMMON_FBO_FACILITIES}
                          lambertPickupInstructions={bookingConfig.lambertPickupInstructions}
                          flightNumberError={errors.returnFlightNumber}
                          tailNumberError={errors.returnTailNumber}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, returnProvideFlightInfo: true }))}
                          className="text-xs text-indigo-700 hover:text-indigo-900 font-semibold flex items-center gap-1 pt-1 cursor-pointer"
                        >
                          + Add Return Flight Information (Airport Tracking)
                        </button>
                      )}

                      <div className="flex items-center justify-between text-xs font-semibold text-indigo-950 pt-2 border-t border-indigo-200">
                        <span>Return Leg Estimated Fare:</span>
                        <span className="font-mono font-bold">
                          {isReturnQuoteLoading
                            ? 'Calculating...'
                            : returnFare !== null
                            ? `$${returnFare.toFixed(2)}`
                            : returnQuote
                            ? `$${Math.ceil(returnQuote.pricing.totalFare).toFixed(2)}`
                            : '$--'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── Section 2: Passengers, Luggage & Vehicle ─── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center justify-center">
                    2
                  </span>
                  <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                    Passengers, Luggage &amp; Vehicle
                  </h2>
                </div>
                <span className="text-xs text-slate-500 font-semibold">
                  {form.passengers} Pax &bull; {form.carryOnBags + form.checkedBags} Bags
                </span>
              </div>

              <div className="space-y-3">
                {/* Passengers & Bags Row - Accessible 36px touch targets */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Passengers Counter */}
                  <div
                    data-field="passengers"
                    className={`p-2.5 bg-slate-50 border ${
                      errors.passengers ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                    } rounded-xl flex items-center justify-between gap-2`}
                  >
                    <div className="flex items-center gap-2 text-slate-700 text-xs">
                      <UserIcon className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="font-bold text-slate-800">Passengers</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Decrease passengers"
                        disabled={form.passengers <= 1}
                        onClick={() => setForm((prev) => ({ ...prev, passengers: Math.max(1, prev.passengers - 1) }))}
                        className="w-9 h-9 rounded-lg bg-white hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-base leading-none disabled:opacity-40 cursor-pointer"
                      >
                        &minus;
                      </button>
                      <span className="w-5 text-center font-extrabold text-sm text-slate-900">{form.passengers}</span>
                      <button
                        type="button"
                        aria-label="Increase passengers"
                        disabled={form.passengers >= totalMaxPassengers}
                        onClick={() => setForm((prev) => ({ ...prev, passengers: Math.min(totalMaxPassengers, prev.passengers + 1) }))}
                        className="w-9 h-9 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 text-base leading-none disabled:opacity-40 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Carry-on Bags */}
                  <div
                    data-field="bags"
                    className={`p-2.5 bg-slate-50 border ${
                      errors.bags ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                    } rounded-xl flex items-center justify-between gap-2`}
                  >
                    <div className="flex items-center gap-2 text-slate-700 text-xs">
                      <LuggageIcon className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="font-bold text-slate-800">Carry-on</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Decrease carry-on bags"
                        disabled={form.carryOnBags <= 0}
                        onClick={() =>
                          setForm((prev) => {
                            const nextCarry = Math.max(0, prev.carryOnBags - 1);
                            return { ...prev, carryOnBags: nextCarry, bags: nextCarry + prev.checkedBags };
                          })
                        }
                        className="w-9 h-9 rounded-lg bg-white hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-base leading-none disabled:opacity-40 cursor-pointer"
                      >
                        &minus;
                      </button>
                      <span className="w-5 text-center font-extrabold text-sm text-slate-900">{form.carryOnBags}</span>
                      <button
                        type="button"
                        aria-label="Increase carry-on bags"
                        disabled={(form.carryOnBags + form.checkedBags) >= totalMaxBags}
                        onClick={() =>
                          setForm((prev) => {
                            const nextCarry = Math.min(totalMaxBags - prev.checkedBags, prev.carryOnBags + 1);
                            return { ...prev, carryOnBags: nextCarry, bags: nextCarry + prev.checkedBags };
                          })
                        }
                        className="w-9 h-9 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 disabled:opacity-40 text-base leading-none cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Checked Bags */}
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-slate-700 text-xs">
                      <LuggageIcon className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="font-bold text-slate-800">Checked</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Decrease checked bags"
                        disabled={form.checkedBags <= 0}
                        onClick={() =>
                          setForm((prev) => {
                            const nextChecked = Math.max(0, prev.checkedBags - 1);
                            return { ...prev, checkedBags: nextChecked, bags: prev.carryOnBags + nextChecked };
                          })
                        }
                        className="w-9 h-9 rounded-lg bg-white hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-base leading-none disabled:opacity-40 cursor-pointer"
                      >
                        &minus;
                      </button>
                      <span className="w-5 text-center font-extrabold text-sm text-slate-900">{form.checkedBags}</span>
                      <button
                        type="button"
                        aria-label="Increase checked bags"
                        disabled={(form.carryOnBags + form.checkedBags) >= totalMaxBags}
                        onClick={() =>
                          setForm((prev) => {
                            const nextChecked = Math.min(totalMaxBags - prev.carryOnBags, prev.checkedBags + 1);
                            return { ...prev, checkedBags: nextChecked, bags: prev.carryOnBags + nextChecked };
                          })
                        }
                        className="w-9 h-9 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 disabled:opacity-40 text-base leading-none cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {errors.passengers && (
                  <p className="text-xs text-red-600 font-semibold">{errors.passengers}</p>
                )}
                {errors.bags && (
                  <p className="text-xs text-red-600 font-semibold">{errors.bags}</p>
                )}

                {/* Collapsible Extras Row (Oversized Cargo + Child Safety Seats) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {bookingConfig.allowOversizedLuggage !== false && (
                    <label
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        form.hasOversizedLuggage
                          ? 'bg-blue-50/70 border-blue-300'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={form.hasOversizedLuggage}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setForm((prev) => ({
                              ...prev,
                              hasOversizedLuggage: checked,
                              oversizedBags: checked ? prev.oversizedBags : {},
                            }));
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Oversized Cargo (Golf / Skis)</span>
                      </span>
                      {form.hasOversizedLuggage && totalOversizedCount > 0 && (
                        <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-md border border-blue-200">
                          {totalOversizedCount} item{totalOversizedCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </label>
                  )}

                  {bookingConfig.allowChildSafetySeats && (
                    <label
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        form.carSeats
                          ? 'bg-amber-50/80 border-amber-300'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={form.carSeats}
                          onChange={(e) => handleToggleCarSeats(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Child Safety Seats</span>
                      </span>
                      {form.carSeats && (
                        <span className="text-[10px] font-bold text-amber-900 bg-white px-2 py-0.5 rounded-md border border-amber-200">
                          {totalCarSeats} / {carSeatLimits.maxTotalCarSeats} max
                        </span>
                      )}
                    </label>
                  )}
                </div>

                {/* Expanded Oversized Cargo Panel */}
                {bookingConfig.allowOversizedLuggage !== false && form.hasOversizedLuggage && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                    <div className="text-[11px] text-slate-600 font-medium">
                      Select oversized equipment so we dispatch the right cargo space:
                    </div>

                    <div className="space-y-1.5">
                      {oversizedCategories.map((cat) => {
                        const count = form.oversizedBags[cat.id] || 0;
                        return (
                          <div
                            key={cat.id}
                            className="flex items-center justify-between text-xs bg-white p-2.5 rounded-xl border border-slate-200"
                          >
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-800">{cat.label}</span>
                              {cat.requiresUpgrade && (
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                  Requires SUV/Van
                                </span>
                              )}
                              {cat.fee > 0 && (
                                <span className="text-[11px] font-bold text-emerald-700">
                                  +${cat.fee.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                aria-label={`Decrease ${cat.label}`}
                                disabled={count <= 0}
                                onClick={() =>
                                  setForm((prev) => ({
                                    ...prev,
                                    oversizedBags: {
                                      ...prev.oversizedBags,
                                      [cat.id]: Math.max(0, (prev.oversizedBags[cat.id] || 0) - 1),
                                    },
                                  }))
                                }
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-sm disabled:opacity-40 cursor-pointer"
                              >
                                &minus;
                              </button>
                              <span className="w-5 text-center font-bold text-slate-900">{count}</span>
                              <button
                                type="button"
                                aria-label={`Increase ${cat.label}`}
                                disabled={count >= (cat.maxCount || 4)}
                                onClick={() =>
                                  setForm((prev) => ({
                                    ...prev,
                                    oversizedBags: {
                                      ...prev.oversizedBags,
                                      [cat.id]: Math.min(cat.maxCount || 4, (prev.oversizedBags[cat.id] || 0) + 1),
                                    },
                                  }))
                                }
                                className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 disabled:opacity-40 text-sm cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <input
                      type="text"
                      placeholder="Additional cargo notes (e.g. dimensions, fragile instruments)"
                      value={form.oversizedLuggageNotes}
                      onChange={(e) => setForm((prev) => ({ ...prev, oversizedLuggageNotes: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-base sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                    />
                  </div>
                )}

                {/* Expanded Car Seats Panel (Single deduplicated Missouri statutory notice) */}
                {bookingConfig.allowChildSafetySeats && form.carSeats && (
                  <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                    <div className="p-2.5 bg-amber-100/80 border border-amber-300/80 rounded-lg text-[11px] text-amber-950 leading-snug">
                      <span className="font-bold">Missouri Child Passenger Safety Law (RSMo § 307.179): </span>
                      Children under 4 or under 40 lbs require an approved car seat; children ages 4–7 and under 80 lbs or 4&apos;9&quot; require a booster seat. All fleet seats are commercially sanitized.
                    </div>

                    {[
                      {
                        label: 'Rear-Facing',
                        sub: 'Infant (Birth–2 yrs, 5–40 lbs)',
                        count: form.rearFacingCount,
                        max: carSeatLimits.maxRearFacing,
                        onDec: () => setForm((prev) => ({ ...prev, rearFacingCount: Math.max(0, prev.rearFacingCount - 1) })),
                        onInc: () => setForm((prev) => ({ ...prev, rearFacingCount: Math.min(carSeatLimits.maxRearFacing, prev.rearFacingCount + 1) })),
                      },
                      {
                        label: 'Front-Facing',
                        sub: 'Toddler (5-pt harness, 22–65 lbs)',
                        count: form.frontFacingCount,
                        max: carSeatLimits.maxFrontFacing,
                        onDec: () => setForm((prev) => ({ ...prev, frontFacingCount: Math.max(0, prev.frontFacingCount - 1) })),
                        onInc: () => setForm((prev) => ({ ...prev, frontFacingCount: Math.min(carSeatLimits.maxFrontFacing, prev.frontFacingCount + 1) })),
                      },
                      {
                        label: 'Youth Booster',
                        sub: 'Belt-positioning (40–100 lbs)',
                        count: form.boosterCount,
                        max: carSeatLimits.maxBooster,
                        onDec: () => setForm((prev) => ({ ...prev, boosterCount: Math.max(0, prev.boosterCount - 1) })),
                        onInc: () => setForm((prev) => ({ ...prev, boosterCount: Math.min(carSeatLimits.maxBooster, prev.boosterCount + 1) })),
                      },
                    ].map((seat) => (
                      <div key={seat.label} className="flex items-center justify-between gap-2 text-xs bg-white/90 p-2.5 rounded-xl border border-amber-200/80">
                        <div>
                          <span className="font-bold text-slate-900">{seat.label}</span>
                          <span className="text-slate-600 block sm:inline sm:ml-1.5 text-[11px]">{seat.sub}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            aria-label={`Decrease ${seat.label} seats`}
                            disabled={seat.count <= 0}
                            onClick={seat.onDec}
                            className="w-8 h-8 rounded-lg bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700 text-sm disabled:opacity-40 cursor-pointer"
                          >
                            &minus;
                          </button>
                          <span className="w-5 text-center font-extrabold text-slate-900">{seat.count}</span>
                          <button
                            type="button"
                            aria-label={`Increase ${seat.label} seats`}
                            disabled={seat.count >= seat.max || totalCarSeats >= carSeatLimits.maxTotalCarSeats}
                            onClick={seat.onInc}
                            className="w-8 h-8 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 font-bold flex items-center justify-center text-amber-950 text-sm disabled:opacity-40 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Admin-Configured Optional Bookable Extras */}
                {bookableCustomExtras.length > 0 && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Optional Add-On Services
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {bookableCustomExtras.map((extra) => {
                        const qty = form.selectedCustomExtras[extra.id] || 0;
                        const isChecked = qty > 0;
                        return (
                          <div
                            key={extra.id}
                            className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs transition-colors ${
                              isChecked
                                ? 'bg-blue-50/70 border-blue-300'
                                : 'bg-white border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <label className="flex items-start gap-2 cursor-pointer flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setForm((prev) => ({
                                    ...prev,
                                    selectedCustomExtras: {
                                      ...prev.selectedCustomExtras,
                                      [extra.id]: checked ? Math.max(1, prev.selectedCustomExtras[extra.id] || 1) : 0,
                                    },
                                  }));
                                }}
                                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-800 flex items-center gap-1.5 flex-wrap">
                                  <span className="truncate">{extra.name}</span>
                                  {extra.fee > 0 && (
                                    <span className="text-[11px] font-bold text-emerald-700">
                                      +${extra.fee.toFixed(2)}{extra.isPerUnit ? '/ea' : ''}
                                    </span>
                                  )}
                                </div>
                                {extra.description && (
                                  <p className="text-[10.5px] text-slate-500 leading-tight mt-0.5">
                                    {extra.description}
                                  </p>
                                )}
                              </div>
                            </label>

                            {extra.isPerUnit && isChecked && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  aria-label={`Decrease ${extra.name}`}
                                  onClick={() =>
                                    setForm((prev) => ({
                                      ...prev,
                                      selectedCustomExtras: {
                                        ...prev.selectedCustomExtras,
                                        [extra.id]: Math.max(0, (prev.selectedCustomExtras[extra.id] || 1) - 1),
                                      },
                                    }))
                                  }
                                  className="w-7 h-7 rounded-lg bg-white border border-slate-300 font-bold flex items-center justify-center text-slate-700 cursor-pointer"
                                >
                                  &minus;
                                </button>
                                <span className="w-4 text-center font-bold text-slate-900">{qty}</span>
                                <button
                                  type="button"
                                  aria-label={`Increase ${extra.name}`}
                                  onClick={() =>
                                    setForm((prev) => ({
                                      ...prev,
                                      selectedCustomExtras: {
                                        ...prev.selectedCustomExtras,
                                        [extra.id]: Math.min(10, (prev.selectedCustomExtras[extra.id] || 0) + 1),
                                      },
                                    }))
                                  }
                                  className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-300 font-bold flex items-center justify-center text-blue-700 cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Vehicle Preference Subsection */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800">
                    Select Vehicle Tier {bookingConfig.allowMultiVehicle && `(${form.selectedVehicles.length} vehicle${form.selectedVehicles.length > 1 ? 's' : ''})`}
                  </span>
                  {bookingConfig.allowMultiVehicle && (
                    <button
                      type="button"
                      disabled={form.selectedVehicles.length >= (bookingConfig.maxVehiclesAllowed || 3)}
                      onClick={handleAddVehicle}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 disabled:opacity-40 cursor-pointer"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      <span>Add Vehicle</span>
                    </button>
                  )}
                </div>

                {bookingConfig.allowMultiVehicle ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                      <span className="text-slate-600 font-medium">
                        Combined Fleet Capacity: <strong className="text-slate-900">{totalMaxPassengers} Pax</strong> &bull; <strong className="text-slate-900">{totalMaxBags} Bags</strong>
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {form.selectedVehicles.length} of max {bookingConfig.maxVehiclesAllowed || 3} vehicle(s)
                      </span>
                    </div>

                    {form.selectedVehicles.map((vChoice, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-xs text-slate-800">Vehicle #{idx + 1} Tier</span>
                          </div>
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveVehicle(idx)}
                              className="text-xs text-red-600 hover:text-red-800 font-semibold cursor-pointer"
                            >
                              ✕ Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                          {activeVehicleTiers.map((tier) => {
                            const isSelected =
                              vChoice === tier.id ||
                              (vChoice === 'any' && tier.id === 'any') ||
                              (vChoice === 'sedan' && (tier.id === 'standard' || tier.id === 'sedan')) ||
                              (vChoice === 'suv' && (tier.id === 'xl' || tier.id === 'suv')) ||
                              (vChoice === 'van' && (tier.id === 'xl' || tier.id === 'van'));
                            const liveTierPrice = estimateTierDisplayFare(tier);

                            return (
                              <button
                                key={tier.id}
                                type="button"
                                onClick={() => handleUpdateVehicleChoice(idx, tier.id as CustomerVehicleChoice)}
                                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-white border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                                    : 'bg-white/70 border-slate-200 hover:bg-white text-slate-600'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="text-xs font-bold text-slate-900">{tier.name}</span>
                                  {liveTierPrice !== null ? (
                                    <span className="text-xs font-mono font-extrabold text-blue-700">
                                      ${liveTierPrice}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                  {tier.maxPassengers}p / {tier.maxLuggage}b
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {oversizedRequiresUpgrade && (
                      <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                        <span className="font-bold">Automatic Vehicle Upgrade:</span>
                        <span>Selected oversized cargo requires SUV or Minivan capacity.</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {activeVehicleTiers.map((tier) => {
                        const isCarSeatRestricted =
                          (totalCarSeats > 0 || returnTotalCarSeats > 0) &&
                          (tier.id === 'sedan' || tier.id === 'standard' || tier.id === 'any' || tier.maxPassengers <= 4);
                        const isOversizedRestricted =
                          oversizedRequiresUpgrade &&
                          (tier.id === 'sedan' || tier.id === 'standard' || tier.id === 'any' || tier.maxPassengers <= 4);
                        const isPaxRestricted = form.passengers > tier.maxPassengers;
                        const isLuggageRestricted = (form.carryOnBags + form.checkedBags) > tier.maxLuggage;
                        const isRestricted =
                          isCarSeatRestricted || isOversizedRestricted || isPaxRestricted || isLuggageRestricted;

                        let restrictionReason = '';
                        if (isOversizedRestricted) {
                          restrictionReason = 'Requires SUV/Van (Oversized cargo)';
                        } else if (isCarSeatRestricted) {
                          restrictionReason = 'Requires SUV/Van (Car seats)';
                        } else if (isPaxRestricted) {
                          restrictionReason = `Max ${tier.maxPassengers} passengers`;
                        } else if (isLuggageRestricted) {
                          restrictionReason = `Max ${tier.maxLuggage} bags`;
                        }

                        const isSelected =
                          form.vehicleChoice === tier.id ||
                          (form.vehicleChoice === 'any' && tier.id === 'any') ||
                          (form.vehicleChoice === 'sedan' && (tier.id === 'standard' || tier.id === 'sedan')) ||
                          (form.vehicleChoice === 'suv' && (tier.id === 'xl' || tier.id === 'suv')) ||
                          (form.vehicleChoice === 'van' && (tier.id === 'xl' || tier.id === 'van'));

                        const liveTierPrice = estimateTierDisplayFare(tier);

                        return (
                          <button
                            key={tier.id}
                            type="button"
                            disabled={isRestricted}
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                vehicleChoice: tier.id as CustomerVehicleChoice,
                                selectedVehicles: [tier.id as CustomerVehicleChoice],
                                isVehicleAutoAssigned: false,
                              }))
                            }
                            className={`p-3.5 rounded-xl border text-left transition-all relative group flex flex-col justify-between ${
                              isRestricted
                                ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                                : isSelected
                                ? 'bg-blue-50/80 border-blue-600 shadow-sm ring-2 ring-blue-500/20 cursor-pointer'
                                : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50 cursor-pointer'
                            }`}
                          >
                            <div>
                              {tier.imageUrl ? (
                                <div className="w-full h-24 mb-2.5 rounded-lg overflow-hidden bg-slate-100 border border-slate-200/80">
                                  <img
                                    src={tier.imageUrl}
                                    alt={tier.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    onError={(e) => {
                                      (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                              ) : null}

                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-extrabold text-slate-900 text-sm">{tier.name}</span>
                                    {tier.badge && (
                                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                                        {tier.badge}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  {liveTierPrice !== null && !isRestricted ? (
                                    <div className="flex flex-col items-end">
                                      <span className="text-sm font-mono font-black text-slate-950">
                                        ${liveTierPrice}
                                      </span>
                                      <span className="text-[9px] text-slate-500 font-semibold uppercase">
                                        est.{form.returnTrip ? '/leg' : ''}
                                      </span>
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              {tier.description && (
                                <p className="text-[11px] text-slate-500 mb-2 leading-snug">{tier.description}</p>
                              )}
                            </div>

                            <div>
                              <div className="flex items-center justify-between text-[11px] text-slate-600 font-semibold mt-2 pt-2 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1">
                                    <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                                    {tier.maxPassengers} Pax
                                  </span>
                                  <span>&bull;</span>
                                  <span className="inline-flex items-center gap-1">
                                    <LuggageIcon className="w-3.5 h-3.5 text-slate-400" />
                                    {tier.maxLuggage} Bags
                                  </span>
                                </div>
                                {isSelected && (
                                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                                    ✓
                                  </span>
                                )}
                              </div>

                              {isRestricted && (
                                <div className="mt-2 text-[10px] text-red-700 font-semibold bg-red-50 p-1.5 rounded-lg border border-red-200 text-center">
                                  {restrictionReason}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Compact Multi-Vehicle Note */}
                    <p className="text-[11px] text-slate-500 pt-1">
                      Need multiple vehicles for a group or event? Call dispatch at{' '}
                      <a
                        href={`tel:${(bookingConfig.multiVehicleCallPhone || COMPANY_CONFIG.phone.primaryRaw).replace(/[^\d+]/g, '')}`}
                        className="font-bold text-blue-700 underline hover:text-blue-900"
                      >
                        {bookingConfig.multiVehicleCallPhone || COMPANY_CONFIG.phone.primary}
                      </a>
                      .
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* ─── Section 3: Passenger Details & Chauffeur Notes ─── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center justify-center">
                    3
                  </span>
                  <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                    Passenger Details &amp; Notes
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleAddPassenger}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                >
                  + Add Passenger
                </button>
              </div>

              {/* Primary Passenger */}
              <div className="space-y-2.5">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    name="passengerName"
                    autoComplete="name"
                    placeholder="Primary Passenger Full Name *"
                    value={form.passengerName}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, passengerName: e.target.value }));
                      if (errors.passengerName) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.passengerName;
                          return next;
                        });
                      }
                    }}
                    required
                    className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border ${
                      errors.passengerName ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                    } rounded-xl text-slate-900 text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 focus:outline-none`}
                  />
                  {errors.passengerName && (
                    <p className="text-xs text-red-600 font-semibold mt-1 ml-1">{errors.passengerName}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <PhoneIcon className="w-4 h-4" />
                      </div>
                      <input
                        type="tel"
                        name="passengerPhone"
                        placeholder="Mobile Phone (SMS updates) *"
                        value={form.passengerPhone}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, passengerPhone: formatUsPhone(e.target.value) }));
                          if (errors.passengerPhone) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.passengerPhone;
                              return next;
                            });
                          }
                        }}
                        required
                        inputMode="tel"
                        autoComplete="tel"
                        className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border ${
                          errors.passengerPhone ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                        } rounded-xl text-slate-900 text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 focus:outline-none`}
                      />
                    </div>
                    {errors.passengerPhone && (
                      <p className="text-xs text-red-600 font-semibold mt-1 ml-1">{errors.passengerPhone}</p>
                    )}
                  </div>
                  <div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <MailIcon className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        name="passengerEmail"
                        placeholder="Email Address (Receipts) *"
                        value={form.passengerEmail}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, passengerEmail: e.target.value.trim() }));
                          if (errors.passengerEmail) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.passengerEmail;
                              return next;
                            });
                          }
                        }}
                        required
                        inputMode="email"
                        autoComplete="email"
                        className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border ${
                          errors.passengerEmail ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                        } rounded-xl text-slate-900 text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 focus:outline-none`}
                      />
                    </div>
                    {errors.passengerEmail && (
                      <p className="text-xs text-red-600 font-semibold mt-1 ml-1">{errors.passengerEmail}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Additional Passengers List */}
              {form.additionalPassengers.map((ap, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2.5 border-t border-slate-100">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-slate-400 text-xs font-bold shrink-0">#{idx + 2}</span>
                    <input
                      type="text"
                      placeholder={`Passenger #${idx + 2} Name`}
                      value={ap.name}
                      onChange={(e) => {
                        const updated = [...form.additionalPassengers];
                        updated[idx].name = e.target.value;
                        setForm((prev) => ({ ...prev, additionalPassengers: updated }));
                      }}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="tel"
                      placeholder="Phone (optional)"
                      value={ap.phone || ''}
                      onChange={(e) => {
                        const updated = [...form.additionalPassengers];
                        updated[idx].phone = formatUsPhone(e.target.value);
                        setForm((prev) => ({ ...prev, additionalPassengers: updated }));
                      }}
                      className="flex-1 sm:w-40 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePassenger(idx)}
                      className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl cursor-pointer shrink-0"
                      title="Remove passenger"
                      aria-label={`Remove passenger ${idx + 2}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              {/* Booker vs Passenger Drawer */}
              <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer text-slate-800">
                  <input
                    type="checkbox"
                    checked={form.isBookerDifferent}
                    onChange={(e) => setForm((prev) => ({ ...prev, isBookerDifferent: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-xs sm:text-sm">
                    Booking on behalf of someone else (Add Coordinator / Booker Contact)
                  </span>
                </label>

                {form.isBookerDifferent && (
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-[11px] uppercase font-bold text-blue-900 tracking-wide">
                        Booker / Travel Coordinator Details
                      </span>
                      <span className="text-[11px] text-blue-700">
                        Invoices &amp; receipts will be sent here
                      </span>
                    </div>

                    <div>
                      <input
                        type="text"
                        name="contactName"
                        placeholder="Booker Name (e.g. Sarah Jenkins, Hotel Concierge) *"
                        value={form.contactName}
                        onChange={(e) => setForm((prev) => ({ ...prev, contactName: e.target.value }))}
                        required={form.isBookerDifferent}
                        className={`w-full px-3 py-2.5 bg-white border ${
                          errors.contactName ? 'border-red-400' : 'border-blue-200'
                        } rounded-xl text-base sm:text-sm`}
                      />
                      {errors.contactName && (
                        <p className="text-xs text-red-600 font-semibold mt-1">{errors.contactName}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <input
                          type="tel"
                          name="contactPhone"
                          placeholder="Booker Phone Number *"
                          value={form.contactPhone}
                          onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: formatUsPhone(e.target.value) }))}
                          required={form.isBookerDifferent}
                          inputMode="tel"
                          autoComplete="tel"
                          className={`w-full px-3 py-2.5 bg-white border ${
                            errors.contactPhone ? 'border-red-400' : 'border-blue-200'
                          } rounded-xl text-base sm:text-sm`}
                        />
                        {errors.contactPhone && (
                          <p className="text-xs text-red-600 font-semibold mt-1">{errors.contactPhone}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="email"
                          name="contactEmail"
                          placeholder="Booker Email Address *"
                          value={form.contactEmail}
                          onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                          required={form.isBookerDifferent}
                          className={`w-full px-3 py-2.5 bg-white border ${
                            errors.contactEmail ? 'border-red-400' : 'border-blue-200'
                          } rounded-xl text-base sm:text-sm`}
                        />
                        {errors.contactEmail && (
                          <p className="text-xs text-red-600 font-semibold mt-1">{errors.contactEmail}</p>
                        )}
                      </div>
                    </div>

                    <select
                      value={form.contactRole}
                      onChange={(e) => setForm((prev) => ({ ...prev, contactRole: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-white border border-blue-200 rounded-xl text-base sm:text-sm text-slate-800"
                    >
                      {DEFAULT_BOOKER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Collapsible Special Requests, Gate Code & Chauffeur Notes */}
              <div className="pt-2.5 border-t border-slate-100 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowChauffeurNotes((prev) => !prev)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-700 hover:text-blue-700 cursor-pointer"
                >
                  <span>
                    Special Requests, Gate Code &amp; Chauffeur Notes{' '}
                    <span className="font-normal text-slate-400">(Optional)</span>
                  </span>
                  <span className="text-blue-600 font-bold">
                    {showChauffeurNotes || form.gateCode || form.driverNotes ? 'Hide ▲' : 'Add Notes ▾'}
                  </span>
                </button>

                {(showChauffeurNotes || Boolean(form.gateCode) || Boolean(form.driverNotes) || Object.values(form.specialRequests).some(Boolean)) && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'petFriendly', label: 'Pet-Friendly', Icon: PawPrintIcon },
                        { key: 'quietRide', label: 'Quiet Ride', Icon: VolumeXIcon },
                        { key: 'musicOk', label: 'Music OK', Icon: MusicNoteIcon },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => handleToggleSpecialRequest(item.key as SpecialRequestKey)}
                          className={`py-2 px-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            form.specialRequests[item.key as SpecialRequestKey]
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <item.Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label htmlFor="gateCode" className="block text-[11px] text-slate-600 font-semibold mb-1">
                          Subdivision / Gate Code
                        </label>
                        <input
                          id="gateCode"
                          type="text"
                          placeholder="e.g. #1234 or Call box"
                          value={form.gateCode}
                          onChange={(e) => setForm((prev) => ({ ...prev, gateCode: e.target.value }))}
                          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor="driverNotes" className="block text-[11px] text-slate-600 font-semibold mb-1">
                          Chauffeur Instructions
                        </label>
                        <input
                          id="driverNotes"
                          type="text"
                          placeholder="e.g. Side entrance pickup, white house with brick driveway..."
                          value={form.driverNotes}
                          onChange={(e) => setForm((prev) => ({ ...prev, driverNotes: e.target.value }))}
                          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ─── Section 4: Payment Method ─── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center justify-center">
                    4
                  </span>
                  <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                    Payment Method
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  {stripeOnlineEnabled ? 'Online or In-Cab' : 'Pay in Vehicle'}
                </span>
              </div>

              {(() => {
                const allowed =
                  bookingConfig.acceptedPaymentMethods && bookingConfig.acceptedPaymentMethods.length > 0
                    ? bookingConfig.acceptedPaymentMethods
                    : ['card', 'cash', 'account'];
                const allMethods = [
                  {
                    key: 'card' as const,
                    label: stripeOnlineEnabled ? 'Card' : 'Card (In Cab)',
                    Icon: CreditCardIcon,
                  },
                  { key: 'cash' as const, label: 'Cash (In Cab)', Icon: DollarSignIcon },
                  { key: 'account' as const, label: 'Corporate', Icon: BuildingIcon },
                ];
                const methodsToRender = allMethods.filter((m) => allowed.includes(m.key));
                const colClass =
                  methodsToRender.length === 1
                    ? 'grid-cols-1'
                    : methodsToRender.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-3';

                return (
                  <div className={`grid ${colClass} gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl`}>
                    {methodsToRender.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            paymentMethod: m.key,
                            cardPaymentType: m.key === 'card' && stripeOnlineEnabled ? prev.cardPaymentType : 'terminal',
                          }))
                        }
                        className={`py-2.5 px-2 text-center rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          form.paymentMethod === m.key
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                        }`}
                      >
                        <m.Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{m.label}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}

              {/* Credit Card Sub-panel */}
              {form.paymentMethod === 'card' && (
                <div className="space-y-2.5 animate-in fade-in duration-150">
                  {stripeOnlineEnabled ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              cardPaymentType: 'terminal',
                              paymentToken: 'pay_in_cab',
                            }))
                          }
                          className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                            form.cardPaymentType === 'terminal'
                              ? 'bg-blue-50 border-blue-500 text-blue-950'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                          }`}
                        >
                          Pay Driver in Cab (Terminal)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              cardPaymentType: 'manual',
                            }))
                          }
                          className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                            form.cardPaymentType === 'manual'
                              ? 'bg-blue-50 border-blue-500 text-blue-950'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                          }`}
                        >
                          Pre-Authorize Card Online
                        </button>
                      </div>

                      {form.cardPaymentType === 'manual' ? (
                        <div data-field="paymentToken" className="space-y-1.5">
                          <StripePaymentInput
                            publishableKey={stripePublishableKey || undefined}
                            amount={totalDisplayFare || 0}
                            saveCardOnFile={form.saveCardOnFile}
                            onSaveCardChange={(save) =>
                              setForm((prev) => ({ ...prev, saveCardOnFile: save }))
                            }
                            onCardChange={({ token, brand, last4, complete, payInCab }) => {
                              setForm((prev) => ({
                                ...prev,
                                paymentToken: complete && token ? token : '',
                                cardBrand: brand || '',
                                cardLast4: last4 || '',
                                cardPaymentType: payInCab ? 'terminal' : prev.cardPaymentType,
                              }));
                              if (complete && errors.paymentToken) {
                                setErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.paymentToken;
                                  return next;
                                });
                              }
                            }}
                          />
                          {errors.paymentToken && (
                            <p className="text-xs text-red-600 font-semibold">{errors.paymentToken}</p>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-start gap-2.5">
                          <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <div className="font-bold text-slate-900 flex flex-wrap items-center gap-2">
                              <span>Pay Driver in Cab (Contactless / Chip / Tap / Square)</span>
                              <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                No Upfront Charge
                              </span>
                            </div>
                            <p className="text-slate-600 text-[11px] leading-relaxed">
                              Pay inside the vehicle using Apple Pay, Google Pay, or any major card. Nothing is charged upfront.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-start gap-2.5">
                      <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-bold text-slate-900 flex flex-wrap items-center gap-2">
                          <span>Pay Driver in Cab (Contactless / Chip / Tap / Square)</span>
                          <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                            No Upfront Charge
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Pay securely inside the vehicle using Apple Pay, Google Pay, or any major credit/debit card on our Square / contactless terminal. No payment is charged upfront.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Cash Sub-panel */}
              {form.paymentMethod === 'cash' && (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex items-center gap-2.5">
                  <DollarSignIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Pay cash directly to your chauffeur upon completion of your trip. Exact change is appreciated.</span>
                </div>
              )}

              {/* Corporate Account Sub-panel */}
              {form.paymentMethod === 'account' && (
                <div className="p-3.5 bg-amber-50/80 border border-amber-300 rounded-xl space-y-3 animate-in fade-in duration-150">
                  <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wide block">
                    Corporate Account Direct Billing
                  </span>

                  <div className="text-[11px] bg-white p-3 rounded-xl border border-amber-200 text-amber-900 flex items-start gap-2 shadow-2xs">
                    <PhoneIcon className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <span className="font-semibold">Need account assistance?</span> Call 24/7 Dispatch at{' '}
                      <a
                        href={`tel:${(COMPANY_CONFIG.phone?.primaryRaw || '+13147380100').replace(/[^\d+]/g, '')}`}
                        className="font-bold underline text-amber-950 hover:text-blue-700"
                      >
                        {COMPANY_CONFIG.phone?.dispatch || COMPANY_CONFIG.phone?.primary || '(314) 738-0100'}
                      </a>{' '}
                      to verify or set up direct corporate billing.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <input
                        type="text"
                        name="corporateOrgName"
                        placeholder="Organization / Company Name *"
                        value={form.corporateOrgName}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, corporateOrgName: e.target.value }));
                          if (errors.corporateOrgName) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.corporateOrgName;
                              return next;
                            });
                          }
                        }}
                        required={form.paymentMethod === 'account'}
                        className={`w-full px-3 py-2.5 bg-white border ${
                          errors.corporateOrgName ? 'border-red-400' : 'border-amber-300'
                        } rounded-xl text-base sm:text-sm`}
                      />
                      {errors.corporateOrgName && (
                        <p className="text-xs text-red-600 font-semibold mt-1">{errors.corporateOrgName}</p>
                      )}
                    </div>
                    <div>
                      <input
                        type="text"
                        name="corporateAccountNumber"
                        placeholder="Corporate Account # (or 'Pending Dispatch') *"
                        value={form.corporateAccountNumber}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, corporateAccountNumber: e.target.value }));
                          if (errors.corporateAccountNumber) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.corporateAccountNumber;
                              return next;
                            });
                          }
                        }}
                        className={`w-full px-3 py-2.5 bg-white border ${
                          errors.corporateAccountNumber ? 'border-red-400' : 'border-amber-300'
                        } rounded-xl text-base sm:text-sm`}
                      />
                      {errors.corporateAccountNumber && (
                        <p className="text-xs text-red-600 font-semibold mt-1">{errors.corporateAccountNumber}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      placeholder="Billing PO / Project Code (Optional)"
                      value={form.billingPo}
                      onChange={(e) => setForm((prev) => ({ ...prev, billingPo: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-white border border-amber-300 rounded-xl text-base sm:text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Authorized By (Manager Name)"
                      value={form.authorizedBy}
                      onChange={(e) => setForm((prev) => ({ ...prev, authorizedBy: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-white border border-amber-300 rounded-xl text-base sm:text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Sticky Summary & Estimated Fare Card */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div
              id="trip-summary-card"
              className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-900 text-base">Trip Summary</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full">
                  {editingTripId ? 'Editing Trip' : 'Estimated Quote'}
                </span>
              </div>

              {/* Itinerary Preview */}
              <div className="space-y-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <ClockIcon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Pickup Time</span>
                    <span className="font-semibold text-slate-800">
                      {form.timingType === 'later'
                        ? `${form.scheduledDate} at ${formatTime12h(form.scheduledTime)}`
                        : 'Immediate On-Demand (ASAP)'}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <MapPinIcon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div className="flex-1 overflow-hidden">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Route</span>
                    <p className="font-semibold text-slate-800 truncate" title={form.pickupAddress || 'Enter pickup'}>
                      {form.pickupAddress || 'Select Pickup Location'}
                    </p>
                    {form.intermediateStops.length > 0 && (
                      <p className="text-[10px] text-blue-600 font-medium">
                        + {form.intermediateStops.length} intermediate stop(s)
                      </p>
                    )}
                    <p className="font-semibold text-slate-800 truncate mt-0.5" title={form.dropoffAddress || 'Enter dropoff'}>
                      &darr; {form.dropoffAddress || 'Select Dropoff Location'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <CarIcon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Vehicle</span>
                    <span className="font-semibold text-slate-800">
                      {bookingConfig.allowMultiVehicle && form.selectedVehicles.length > 1
                        ? `${form.selectedVehicles.length} Vehicles (${form.selectedVehicles.map((v) => getFriendlyVehicleName(v)).join(', ')}) • ${form.passengers} Pax • ${form.bags} Bags`
                        : `${getFriendlyVehicleName(form.vehicleChoice)} • ${form.passengers} Pax • ${form.bags} Bags`}
                    </span>
                  </div>
                </div>

                {form.returnTrip && form.returnDate && (
                  <div className="flex items-start gap-2">
                    <HistoryIcon className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[10px] text-indigo-600 font-bold uppercase block">Return Pickup</span>
                      <span className="font-semibold text-slate-800">
                        {form.returnDate} at {formatTime12h(form.returnTime)}
                      </span>
                    </div>
                  </div>
                )}

                {totalCarSeats > 0 && (
                  <div className="flex items-start gap-2">
                    <ShieldCheckIcon className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[10px] text-blue-700 font-bold uppercase block">Child Safety Seats</span>
                      <span className="font-semibold text-slate-800">{totalCarSeats} Seat(s) Requested</span>
                    </div>
                  </div>
                )}

                {form.hasOversizedLuggage && (totalOversizedCount > 0 || form.oversizedLuggageNotes) && (
                  <div className="flex items-start gap-2">
                    <LuggageIcon className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[10px] text-blue-700 font-bold uppercase block">Oversized Cargo</span>
                      <span className="font-semibold text-slate-800">
                        {oversizedItemsSummary || 'Special Equipment'}
                        {form.oversizedLuggageNotes ? ` (${form.oversizedLuggageNotes})` : ''}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Total Estimated Fare + Interactive Price Breakdown Button */}
              <div className="pt-3 border-t border-slate-200 space-y-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <span className="text-xs text-slate-600 font-extrabold uppercase block">
                      {form.returnTrip ? 'Estimated Round-Trip' : 'Estimated Fare'}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Final fare confirmed by dispatch
                    </span>
                  </div>
                  <div className="text-right">
                    {isQuoteLoading ? (
                      <div className="flex items-center gap-1.5 text-blue-600 font-bold text-sm">
                        <SpinnerIcon className="w-4 h-4 animate-spin" />
                        <span>Calculating...</span>
                      </div>
                    ) : totalDisplayFare !== null ? (
                      <span className="text-2xl font-mono font-black text-slate-950">
                        ${totalDisplayFare.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-xl font-mono font-bold text-slate-400">$--</span>
                    )}
                  </div>
                </div>

                {/* Price Breakdown Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowPriceBreakdown((prev) => !prev)}
                  disabled={!quote && !isQuoteLoading}
                  aria-expanded={showPriceBreakdown}
                  className="w-full py-2 px-3 rounded-xl text-xs font-bold text-blue-700 bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200/80 flex items-center justify-between transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span>{showPriceBreakdown ? 'Hide Price Breakdown' : 'View Price Breakdown'}</span>
                  <span>{showPriceBreakdown ? '▲' : '▾'}</span>
                </button>

                {showPriceBreakdown && (
                  <PriceBreakdownPanel
                    outboundPricing={activeOutboundPricing}
                    returnPricing={returnQuote?.pricing}
                    outboundDisplayFare={outboundFare}
                    returnDisplayFare={returnFare}
                    totalDisplayFare={totalDisplayFare}
                    isRoundTrip={form.returnTrip}
                    vehicleLabel={getFriendlyVehicleName(form.vehicleChoice)}
                  />
                )}
              </div>

              {/* Agreements: SMS, Terms & Privacy */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 space-y-2.5 text-xs text-slate-600">
                <label className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form.smsConsent}
                    onChange={(e) => setForm((prev) => ({ ...prev, smsConsent: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                  />
                  <span className="text-[11px] text-slate-600 leading-tight group-hover:text-slate-900">
                    Receive transactional SMS dispatch &amp; chauffeur arrival updates.
                  </span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    required
                    defaultChecked
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                  />
                  <span className="text-[11px] text-slate-600 leading-tight group-hover:text-slate-900">
                    I agree to the{' '}
                    <Link to="/terms" target="_blank" className="font-semibold text-blue-600 underline hover:text-blue-800">
                      Terms and Conditions
                    </Link>{' '}
                    and{' '}
                    <Link to="/privacy" target="_blank" className="font-semibold text-blue-600 underline hover:text-blue-800">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
              </div>

              {/* Validation Error Summary */}
              {validationErrorCount > 0 && (
                <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
                  Please review {validationErrorCount} highlighted field{validationErrorCount > 1 ? 's' : ''} above before submitting.
                </div>
              )}

              {/* Primary CTA Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  backgroundColor: 'var(--brand-primary)',
                  color: 'var(--btn-primary-text)',
                }}
                className="w-full py-3.5 px-4 hover:opacity-95 active:opacity-90 font-extrabold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <SpinnerIcon className="w-4 h-4 animate-spin" />
                    <span>{editingTripId ? 'Saving Updates...' : 'Submitting Request...'}</span>
                  </>
                ) : (
                  <span>{editingTripId ? 'Save Trip Updates' : 'Request Ride'}</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Sticky Quick-Action Bar (Docked cleanly above /app/passenger nav when embedded) */}
        <div
          className={`fixed left-0 right-0 z-30 lg:hidden bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-4 py-2.5 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] flex items-center justify-between gap-3 ${
            embeddedInApp ? 'bottom-[64px] md:bottom-[72px]' : 'bottom-0'
          }`}
        >
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider truncate">
                {form.returnTrip ? 'Est. Round-Trip' : 'Estimated Fare'}
              </span>
              {totalDisplayFare !== null && !isQuoteLoading && (
                <button
                  type="button"
                  onClick={handleOpenBreakdownFromMobile}
                  className="text-[10px] font-bold text-blue-600 underline hover:text-blue-800 cursor-pointer shrink-0"
                >
                  Breakdown
                </button>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              {isQuoteLoading ? (
                <span className="text-sm font-bold text-blue-600 flex items-center gap-1">
                  <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                  Calculating...
                </span>
              ) : totalDisplayFare !== null ? (
                <>
                  <span className="text-lg font-mono font-black text-slate-950">
                    ${totalDisplayFare.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">est.</span>
                </>
              ) : (
                <span className="text-xs font-semibold text-slate-500">
                  Enter route for estimate
                </span>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              backgroundColor: 'var(--brand-primary)',
              color: 'var(--btn-primary-text)',
            }}
            className="px-5 py-3 hover:opacity-95 active:opacity-90 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
          >
            {isSubmitting ? (
              <>
                <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                <span>{editingTripId ? 'Saving...' : 'Submitting...'}</span>
              </>
            ) : (
              <span>{editingTripId ? 'Save Updates' : 'Request Ride'}</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
