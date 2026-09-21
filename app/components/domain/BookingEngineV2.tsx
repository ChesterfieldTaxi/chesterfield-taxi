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
} from '../../core/types/config';
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

import { DispatchLocationInput, type PlaceSelectedDetails } from './dispatch/DispatchLocationInput';
import { BookingConfirmation, type EmailDeliveryFeedback } from './BookingConfirmation';
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
  WheelchairIcon,
  VolumeXIcon,
  MusicNoteIcon,
  DevicePhoneMobileIcon,
} from '../ui/Icons';
import { StripePaymentInput } from './payments/StripePaymentInput';

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
  hideDispatchBanner?: boolean;
}

export type SpecialRequestKey = 'petFriendly' | 'wheelchair' | 'quietRide' | 'musicOk';
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
  hideDispatchBanner = false,
}: BookingEngineV2Props) {
  const location = useLocation();

  // Initialize default date (today) and time (+45 minutes in future)
  const defaultFutureDateTime = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 45);
    const dateStr = d.toISOString().split('T')[0];
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
      wheelchair: false,
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
  });

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Quote calculation state
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

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
      const pickupLat = params.get('pickupLat');
      const pickupLng = params.get('pickupLng');
      const dropoffLat = params.get('dropoffLat');
      const dropoffLng = params.get('dropoffLng');

      if (pickupParam || dropoffParam || notesParam || vehicleParam || passengersParam) {
        setForm((prev) => ({
          ...prev,
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
  useEffect(() => {
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
      ...(initialValues.vehicleChoice && ['any', 'sedan', 'suv', 'van'].includes(initialValues.vehicleChoice)
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
  }, [initialValues]);

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
      {
        id: 'wheelchair',
        name: 'Van / WAV',
        badge: 'Accessible',
        baseMultiplier: 1.5,
        maxPassengers: 7,
        maxLuggage: 6,
        description: 'Transit / Wheelchair Ramp',
        iconType: 'wheelchair',
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
      van: { maxPassengers: 7, maxBags: 6, name: 'Van / WAV' },
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
          (choice === 'van' && (t.id === 'wheelchair' || t.id === 'van'))
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
    return bookingConfig.oversizedBags && bookingConfig.oversizedBags.length > 0
      ? bookingConfig.oversizedBags
      : DEFAULT_OVERSIZED_BAG_CATEGORIES;
  }, [bookingConfig.oversizedBags]);

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
    if (choice === 'suv') return 'xl';
    if (choice === 'van') return 'wheelchair';
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
      const requiresWheelchair = !!form.specialRequests.wheelchair;

      // Find capable vehicles sorted by price multiplier ascending
      const capableTiers = [...activeVehicleTiers]
        .filter((tier) => {
          if (form.passengers > tier.maxPassengers) return false;
          if (totalLuggage > tier.maxLuggage) return false;
          if (requiresWheelchair && tier.id !== 'wheelchair' && tier.iconType !== 'wheelchair' && tier.id !== 'van') {
            return false;
          }
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
        !hasCarSeatConstraint &&
        (!requiresWheelchair || form.vehicleChoice === 'van' || form.vehicleChoice === 'wheelchair' || form.vehicleChoice === bestTier.id);

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
    form.specialRequests.wheelchair,
    form.isVehicleAutoAssigned,
    form.vehicleChoice,
    totalCarSeats,
    returnTotalCarSeats,
    oversizedRequiresUpgrade,
    vehicleCapacities,
    activeVehicleTiers,
  ]);

  // If wheelchair requested, auto-select Van (WAV)
  useEffect(() => {
    if (form.specialRequests.wheelchair) {
      const wavTier = activeVehicleTiers.find((v) => v.id === 'wheelchair' || v.iconType === 'wheelchair' || v.id === 'van');
      const wavId = (wavTier?.id || 'wheelchair') as CustomerVehicleChoice;
      if (form.vehicleChoice !== wavId && form.vehicleChoice !== 'van' && form.vehicleChoice !== 'wheelchair') {
        setForm((prev) => ({
          ...prev,
          vehicleChoice: wavId,
          selectedVehicles: prev.selectedVehicles.map((v, i) => (i === 0 ? wavId : v)),
        }));
      }
    }
  }, [form.specialRequests.wheelchair, form.vehicleChoice, activeVehicleTiers]);

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
              bookingType: form.timingType === 'later' ? 'scheduled' : 'asap',
              scheduledPickupTime,
              passengerCount: Math.max(1, Math.ceil(form.passengers / form.selectedVehicles.length)),
              luggageCount: Math.max(0, Math.ceil(form.bags / form.selectedVehicles.length)),
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
          bookingType: form.timingType === 'later' ? 'scheduled' : 'asap',
          scheduledPickupTime,
          passengerCount: form.passengers,
          luggageCount: form.bags,
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
    form.luggageType,
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
          bookingType: 'scheduled',
          scheduledPickupTime: returnScheduledTime,
          passengerCount: form.returnPassengers,
          luggageCount: form.returnBags,
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
      const el = document.querySelector(`[name="${firstKey}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const bookingService = getBookingService();

      const pickupLocation: TripLocation = {
        address: form.pickupAddress,
        placeId: form.pickupPlaceId,
        coordinates: form.pickupCoordinates || { lat: 38.6631, lng: -90.5771 },
      };

      const dropoffLocation: TripLocation = {
        address: form.dropoffAddress,
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
          if (k === 'wheelchair') return 'Wheelchair accessible (WAV)';
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

      let effectivePricing: TripPricing = quote?.pricing || {
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

      // Phase 31: Card Tokenization, Vaulting & Pre-authorization Hold
      let paymentIntentId: string | undefined;
      let cardLast4: string | undefined;
      let cardBrand: 'visa' | 'mastercard' | 'amex' | 'discover' = 'visa';

      if (form.paymentMethod === 'card' && form.cardPaymentType === 'manual' && (form.cardNumber || form.paymentToken)) {
        try {
          const paymentService = getPaymentService();
          const cleanNum = form.cardNumber.replace(/\s+/g, '');
          cardLast4 = form.cardLast4 || cleanNum.slice(-4) || '4242';
          if (form.cardBrand) cardBrand = form.cardBrand as any;
          else if (cleanNum.startsWith('5')) cardBrand = 'mastercard';
          else if (cleanNum.startsWith('3')) cardBrand = 'amex';
          else if (cleanNum.startsWith('6')) cardBrand = 'discover';

          const customerId = form.passengerEmail.trim() || `cust_${Date.now().toString(36)}`;
          let vaultedCardId: string | undefined;

          if (form.saveCardOnFile) {
            const vaulted = await paymentService.vaultCard(customerId, {
              cardNumber: form.paymentToken ? `tok_${form.cardLast4 || 'stripe'}` : form.cardNumber,
              cardholderName: form.cardholderName || form.passengerName,
              cardExp: form.cardExp || '12/28',
              cardCvc: form.cardCvc || '123',
              isDefault: true,
            });
            vaultedCardId = vaulted.id;
          }

          const holdIntent = await paymentService.createPreAuthorization(
            `trip_init_${Date.now().toString(36)}`,
            effectivePricing.totalFare,
            customerId,
            vaultedCardId
          );
          paymentIntentId = holdIntent.id;
        } catch (cardErr) {
          console.warn('[BookingEngineV2] Card vaulting/pre-auth warning:', cardErr);
        }
      }

      // Customer web submissions strictly default to 'UNCONFIRMED'
      const inputPayload: CreateTripInput = {
        pickupLocation,
        dropoffLocation,
        intermediateStops: intermediateStopsLocations.length > 0 ? intermediateStopsLocations : undefined,
        bookingType: form.timingType === 'asap' ? 'asap' : 'scheduled',
        scheduledPickupTime,
        vehicleTier: mapChoiceToTier(form.vehicleChoice),
        status: 'UNCONFIRMED',
        passenger: {
          firstName: form.passengerName.trim().split(/\s+/)[0] || form.passengerName,
          lastName: form.passengerName.trim().split(/\s+/).slice(1).join(' ') || '',
          email: form.passengerEmail.trim(),
          phone: form.passengerPhone.trim(),
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
        },
        driverNotes: combinedNotes,
        metadata: {
          isBookingForSomeoneElse: form.isBookerDifferent,
          bookerName: form.isBookerDifferent ? form.contactName : undefined,
          bookerPhone: form.isBookerDifferent ? form.contactPhone : undefined,
          bookerEmail: form.isBookerDifferent ? form.contactEmail : undefined,
          bookerRole: form.isBookerDifferent ? form.contactRole : undefined,
          corporateOrgName: form.paymentMethod === 'account' ? form.corporateOrgName : undefined,
          corporateAccountNumber: form.paymentMethod === 'account' ? form.corporateAccountNumber : undefined,
          billingPo: form.paymentMethod === 'account' ? form.billingPo : undefined,
          authorizedBy: form.paymentMethod === 'account' ? form.authorizedBy : undefined,
          invoicingTerms: form.paymentMethod === 'account' ? form.invoicingTerms : undefined,
          additionalPassengers: form.additionalPassengers,
          provideFlightInfo: form.provideFlightInfo,
          airline: form.provideFlightInfo ? form.airline : undefined,
          airlineName: form.provideFlightInfo ? form.airline : undefined,
          flightNumber: form.provideFlightInfo ? form.flightNumber : undefined,
          flightOrigin: form.provideFlightInfo ? form.flightOrigin : undefined,
          departureAirport: form.provideFlightInfo ? form.flightOrigin : undefined,
          tailNumber: form.provideFlightInfo ? form.tailNumber : undefined,
          fboFacility: form.provideFlightInfo ? form.fboFacility : undefined,
          isPrivateAviation: Boolean(airportDetection.isPrivateAviation),
          hasCheckedLuggage: form.provideFlightInfo ? form.hasCheckedLuggage : false,
          gateCode: form.gateCode,
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
          createdByRole: 'customer_web',
          selectedVehicles: bookingConfig.allowMultiVehicle ? form.selectedVehicles : [form.vehicleChoice],
        },
      };

      const createdTrip = await bookingService.createBooking(inputPayload);
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

          const returnPayload: CreateTripInput = {
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
            },
            driverNotes: `[Return Leg of Trip #${createdTrip.id}] ${returnFlightNotes}${form.driverNotes}`.trim(),
            metadata: {
              linkedTripId: createdTrip.id,
              isReturnRide: true,
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
          currency: createdTrip.pricing.currency || 'USD',
          paymentMethod: createdTrip.payment.method,
          specialRequests: createdTrip.passenger.specialRequests,
          oversizedBags: form.oversizedBags,
          oversizedItemsSummary: oversizedItemsSummary,
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
            pickupAddress: createdReturnTripObj.pickupLocation.address,
            dropoffAddress: createdReturnTripObj.dropoffLocation.address,
            pickupTime:
              createdReturnTripObj.bookingType === 'scheduled' && createdReturnTripObj.scheduledPickupTime
                ? new Date(createdReturnTripObj.scheduledPickupTime).toLocaleString()
                : 'Scheduled Return',
            vehicleTier: form.returnVehicleChoice === 'any' ? 'any' : (createdReturnTripObj.vehicleTier || 'standard'),
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
          pickupAddress: createdTrip.pickupLocation.address,
          dropoffAddress: createdTrip.dropoffLocation.address,
          pickupTime:
            createdTrip.bookingType === 'scheduled' && createdTrip.scheduledPickupTime
              ? new Date(createdTrip.scheduledPickupTime).toLocaleString()
              : 'Immediate Ride (ASAP)',
          bookingType: createdTrip.bookingType,
          vehicleTier: createdTrip.vehicleTier,
          totalFare: createdTrip.pricing.totalFare,
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
        console.warn('[BookingEngineV2] Email dispatch notice:', err);
        setEmailDelivery({
          status: 'sent',
          recipient: createdTrip.passenger.email,
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

  const outboundRawFare = quote?.pricing.totalFare ?? null;
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

  return (
    <div className={`relative max-w-6xl mx-auto ${className}`}>
      <form onSubmit={handleBookRide} className="select-none">
        {/* Grid: Left Main Stack (Col 8), Right Sticky Summary (Col 4) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-20">
          {/* Left Column: Form Section Cards */}
          <div className="lg:col-span-8 space-y-4">
            {submitError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2">
                <span className="text-base">⚠</span>
                <span>{submitError}</span>
              </div>
            )}

            {/* ─── Card 1: Timing Selector ─── */}
            <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Pickup Time
                </label>
                <span className="text-[11px] text-slate-400 font-medium">
                  {form.timingType === 'later' ? 'Advance Scheduled Ride' : 'Immediate On-Demand Dispatch'}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {bookingConfig.allowImmediateAsap ? (
                  <label className="flex items-center gap-2 cursor-pointer shrink-0 select-none font-semibold text-slate-800 text-xs">
                    <input
                      type="checkbox"
                      checked={form.timingType === 'later'}
                      onChange={(e) => setForm((prev) => ({ ...prev, timingType: e.target.checked ? 'later' : 'asap' }))}
                      className="sr-only"
                    />
                    <div
                      className={`w-10 h-5 rounded-full transition-colors relative flex items-center px-0.5 ${
                        form.timingType === 'later' ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                          form.timingType === 'later' ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </div>
                    <span>Schedule for Later</span>
                  </label>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0 text-slate-700 text-xs font-bold">
                    <ClockIcon className="w-4 h-4 text-blue-600" />
                    <span>Advance Scheduled Pickup</span>
                  </div>
                )}

                {form.timingType === 'later' ? (
                  <div className="grid grid-cols-2 gap-2 flex-1 animate-in fade-in duration-150 min-w-0">
                    <input
                      type="date"
                      name="scheduledDate"
                      value={form.scheduledDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setForm((prev) => ({ ...prev, scheduledDate: e.target.value }))}
                      required
                      className="w-full min-w-0 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                    <input
                      type="time"
                      name="scheduledTime"
                      value={form.scheduledTime}
                      onChange={(e) => setForm((prev) => ({ ...prev, scheduledTime: e.target.value }))}
                      required
                      className="w-full min-w-0 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="flex-1 px-3 py-1.5 bg-blue-50 border border-blue-200/80 rounded-lg text-blue-800 text-xs font-semibold flex items-center justify-between">
                    <span>⚡ On-Demand Dispatch (Immediate)</span>
                    <span className="text-[10px] text-blue-600 font-normal">Typical arrival 15–25 mins</span>
                  </div>
                )}
              </div>

              {errors.scheduledTime && (
                <p className="text-[11px] text-red-600 font-semibold">{errors.scheduledTime}</p>
              )}
            </div>

            {/* ─── Card 2: Routing Section (Outbound) ─── */}
            <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Route & Stops
                </label>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="relative flex items-center gap-2">
                  <button
                    type="button"
                    title="Swap Pickup and Dropoff"
                    onClick={handleSwapRoute}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-200/60 rounded-md transition-colors self-center text-sm font-bold shrink-0"
                  >
                    ↕
                  </button>

                  <div className="flex-1 space-y-2">
                    {/* Pickup Address */}
                    <div>
                      <DispatchLocationInput
                        placeholder="Pickup Location (e.g. 17000 Baxter Rd, Chesterfield)"
                        value={form.pickupAddress}
                        variant="pickup"
                        onChange={(addr) => setForm((prev) => ({ ...prev, pickupAddress: addr }))}
                        onPlaceSelected={(p: PlaceSelectedDetails) => {
                          setForm((prev) => ({
                            ...prev,
                            pickupAddress: p.address,
                            pickupCoordinates: p.coordinates,
                            pickupPlaceId: p.placeId,
                          }));
                        }}
                        required
                      />
                      {errors.pickupAddress && (
                        <p className="text-[10px] text-red-600 font-semibold mt-1 ml-1">
                          {errors.pickupAddress}
                        </p>
                      )}
                    </div>

                    {/* Intermediate Stops */}
                    {form.intermediateStops.map((stop, idx) => (
                      <div key={stop.id} className="flex items-center gap-1.5">
                        <div className="flex-1">
                          <DispatchLocationInput
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
                          className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                          title="Remove stop"
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    {/* Dropoff Address */}
                    <div>
                      <DispatchLocationInput
                        placeholder="Dropoff Destination (e.g. Lambert St. Louis Airport Terminal 1)"
                        value={form.dropoffAddress}
                        variant="dropoff"
                        onChange={(addr) => setForm((prev) => ({ ...prev, dropoffAddress: addr }))}
                        onPlaceSelected={(p: PlaceSelectedDetails) => {
                          setForm((prev) => ({
                            ...prev,
                            dropoffAddress: p.address,
                            dropoffCoordinates: p.coordinates,
                            dropoffPlaceId: p.placeId,
                          }));
                        }}
                        required
                      />
                      {errors.dropoffAddress && (
                        <p className="text-[10px] text-red-600 font-semibold mt-1 ml-1">
                          {errors.dropoffAddress}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Route Stats & Add Stop Action */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    {isQuoteLoading ? (
                      <div className="flex items-center gap-1 text-blue-600">
                        <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                        <span>Estimating live route...</span>
                      </div>
                    ) : quote ? (
                      <div>
                        Route:{' '}
                        <span className="font-bold text-slate-800">
                          {quote.pricing.durationMinutes} min
                        </span>{' '}
                        •{' '}
                        <span className="font-bold text-slate-800">
                          {quote.pricing.distanceMiles.toFixed(1)} mi
                        </span>
                      </div>
                    ) : (
                      <span>Enter origin & destination for route estimate</span>
                    )}
                  </div>

                  {form.intermediateStops.length < 5 && (
                    <button
                      type="button"
                      onClick={handleAddStop}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 shadow-2xs hover:shadow-xs active:scale-95 transition-all"
                    >
                      <PlusIcon className="w-3.5 h-3.5 text-blue-600" />
                      <span>Add Stop</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Airport Assistance Box (Auto-detected for airport pickups/dropoffs or user-enabled) */}
              {(airportDetection.isAirportTrip || form.provideFlightInfo) && (
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-2.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                      <PlaneLandingIcon className={`w-4 h-4 text-blue-600 ${airportDetection.isDropoffAirport ? 'rotate-45' : ''}`} />
                      <span>
                        {airportDetection.isPrivateAviation
                          ? (airportDetection.isPickupAirport
                              ? `🛩️ ${airportDetection.airport?.iataCode || 'Private Airport'} Private Aviation Arrival`
                              : `🛩️ ${airportDetection.airport?.iataCode || 'Private Airport'} Private Aviation Dropoff`)
                          : (airportDetection.isPickupAirport
                              ? `✈️ ${airportDetection.airport?.iataCode || 'Airport'} Arrival Details`
                              : `✈️ ${airportDetection.airport?.iataCode || 'Airport'} Dropoff Details`)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-semibold text-blue-900 bg-white/90 px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                        <input
                          type="checkbox"
                          checked={form.provideFlightInfo}
                          onChange={(e) => setForm((prev) => ({ ...prev, provideFlightInfo: e.target.checked }))}
                          className="rounded border-blue-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
                        />
                        <span>
                          {airportDetection.isPickupAirport
                            ? 'Track Inbound Flight'
                            : (airportDetection.isPrivateAviation ? 'Provide Aviation Details' : 'Provide Airline')}
                        </span>
                      </label>
                      <span className="text-[10px] bg-blue-200/80 text-blue-900 px-2 py-0.5 rounded font-bold">
                        {airportDetection.isPrivateAviation
                          ? '🛩️ Private Aviation (FBO)'
                          : (airportDetection.isPickupAirport ? 'Arrival Tracking' : 'Terminal Routing')}
                      </span>
                    </div>
                  </div>

                  {airportDetection.isDropoffAirport && (
                    <div className="text-[10.5px] text-amber-900 bg-amber-50/90 border border-amber-200 rounded-md p-2 flex items-start gap-1.5">
                      <span className="font-bold text-amber-800">ℹ️ Note:</span>
                      <span>Your chauffeur will arrive at your scheduled pickup time. Departing flights are not monitored for pickup adjustments.</span>
                    </div>
                  )}

                  {form.provideFlightInfo && (
                    <div className="space-y-2 pt-0.5">
                      {airportDetection.isPrivateAviation ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                              FBO Facility / Terminal
                            </span>
                            <input
                              type="text"
                              list="outbound-fbo-list"
                              placeholder="e.g. Signature Aviation, TAC Air..."
                              value={form.fboFacility || ''}
                              onChange={(e) => setForm((prev) => ({ ...prev, fboFacility: e.target.value }))}
                              className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs text-slate-800"
                            />
                            <datalist id="outbound-fbo-list">
                              {COMMON_FBO_FACILITIES.map((fbo) => (
                                <option key={fbo} value={fbo} />
                              ))}
                            </datalist>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                              Aircraft Tail Number {airportDetection.isPickupAirport ? '(Required)' : '(Optional)'}
                            </span>
                            <input
                              type="text"
                              placeholder="e.g. N12345"
                              value={form.tailNumber || ''}
                              onChange={(e) => {
                                const val = e.target.value.toUpperCase();
                                setForm((prev) => ({ ...prev, tailNumber: val }));
                                if (errors.tailNumber) {
                                  setErrors((prev) => {
                                    const copy = { ...prev };
                                    delete copy.tailNumber;
                                    return copy;
                                  });
                                }
                              }}
                              className={`w-full px-2 py-1 bg-white border ${
                                errors.tailNumber ? 'border-red-400 bg-red-50/40' : 'border-blue-200'
                              } rounded text-xs uppercase font-mono font-bold`}
                            />
                            {errors.tailNumber && (
                              <p className="text-[10px] text-red-600 font-semibold mt-0.5">{errors.tailNumber}</p>
                            )}
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                              {airportDetection.isPickupAirport ? 'Departing From (Origin - Optional)' : 'Departing To (Destination - Optional)'}
                            </span>
                            <input
                              type="text"
                              placeholder="e.g. TEB, VNY, PWK"
                              value={form.flightOrigin}
                              onChange={(e) => setForm((prev) => ({ ...prev, flightOrigin: e.target.value.toUpperCase() }))}
                              className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs uppercase"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                              Airline {airportDetection.isDropoffAirport ? '(Terminal Door)' : ''}
                            </span>
                            <select
                              value={form.airline}
                              onChange={(e) => setForm((prev) => ({ ...prev, airline: e.target.value }))}
                              className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs text-slate-800"
                            >
                              <option value="">Select Airline</option>
                              {MAJOR_AIRLINES.map((al) => (
                                <option key={al.code} value={al.name}>
                                  {al.name} ({al.code})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                              {airportDetection.isPickupAirport ? 'Flight Number (1–4 digits)' : 'Flight Number (Optional, 1–4 digits)'}
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]{1,4}"
                              maxLength={4}
                              placeholder="e.g. 1234"
                              value={form.flightNumber}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                setForm((prev) => ({ ...prev, flightNumber: val }));
                                if (errors.flightNumber) {
                                  setErrors((prev) => {
                                    const copy = { ...prev };
                                    delete copy.flightNumber;
                                    return copy;
                                  });
                                }
                              }}
                              className={`w-full px-2 py-1 bg-white border ${
                                errors.flightNumber ? 'border-red-400 bg-red-50/40' : 'border-blue-200'
                              } rounded text-xs font-mono font-bold`}
                            />
                            {errors.flightNumber && (
                              <p className="text-[10px] text-red-600 font-semibold mt-0.5">{errors.flightNumber}</p>
                            )}
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                              {airportDetection.isPickupAirport ? 'Departing From (Origin)' : 'Departing To (Destination - Optional)'}
                            </span>
                            <input
                              type="text"
                              placeholder="e.g. ORD, ATL, DEN"
                              value={form.flightOrigin}
                              onChange={(e) => setForm((prev) => ({ ...prev, flightOrigin: e.target.value.toUpperCase() }))}
                              className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs uppercase"
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-blue-200/60 text-[11px] text-blue-950">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.hasCheckedLuggage}
                            onChange={(e) => setForm((prev) => ({ ...prev, hasCheckedLuggage: e.target.checked }))}
                            className="rounded border-blue-300 text-blue-600"
                          />
                          <span>
                            {airportDetection.isPickupAirport
                              ? 'Passenger has checked baggage (allows baggage claim grace period)'
                              : 'Passenger has checked baggage to drop off at curbside'}
                          </span>
                        </label>
                      </div>

                      <div className="text-[10px] text-slate-600 bg-white/80 p-2 rounded border border-blue-100 space-y-0.5">
                        {airportDetection.isPrivateAviation ? (
                          <>
                            <span className="font-bold text-slate-800">Private Aviation FBO Pickup: </span>
                            <span>Your chauffeur coordinates directly with the FBO front desk for ramp-side or lobby greetings. Tail number ensures rapid aircraft arrival verification.</span>
                          </>
                        ) : airportDetection.isPickupAirport ? (
                          <>
                            <span className="font-bold text-slate-800">STL Curbside Pickup Instructions: </span>
                            <span>{bookingConfig.lambertPickupInstructions || 'Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2. Chauffeur tracks flight arrival in real-time.'}</span>
                          </>
                        ) : (
                          <>
                            <span className="font-bold text-slate-800">STL Departures Dropoff Tip: </span>
                            <span>Terminal 1: American, Delta, United, Spirit, Frontier • Terminal 2: Southwest Airlines. Providing your airline helps your chauffeur drop you off directly at your airline departures entrance.</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── Card 3: Passenger & Booker Information ─── */}
            <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Passenger Information
                </label>
                <button
                  type="button"
                  onClick={handleAddPassenger}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                >
                  + Add Passenger
                </button>
              </div>

              {/* Primary Passenger */}
              <div className="space-y-2">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    name="passengerName"
                    placeholder="Primary Passenger Full Name"
                    value={form.passengerName}
                    onChange={(e) => setForm((prev) => ({ ...prev, passengerName: e.target.value }))}
                    required
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  {errors.passengerName && (
                    <p className="text-[10px] text-red-600 font-semibold mt-0.5">{errors.passengerName}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <PhoneIcon className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="tel"
                      name="passengerPhone"
                      placeholder="Mobile Phone (SMS updates)"
                      value={form.passengerPhone}
                      onChange={(e) => setForm((prev) => ({ ...prev, passengerPhone: e.target.value }))}
                      required
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                    {errors.passengerPhone && (
                      <p className="text-[10px] text-red-600 font-semibold mt-0.5">{errors.passengerPhone}</p>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <MailIcon className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="email"
                      name="passengerEmail"
                      placeholder="Email Address (Receipts)"
                      value={form.passengerEmail}
                      onChange={(e) => setForm((prev) => ({ ...prev, passengerEmail: e.target.value }))}
                      required
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                    {errors.passengerEmail && (
                      <p className="text-[10px] text-red-600 font-semibold mt-0.5">{errors.passengerEmail}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Additional Passengers List */}
              {form.additionalPassengers.map((ap, idx) => (
                <div key={idx} className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <span className="text-slate-400 text-xs font-bold">#{idx + 2}</span>
                  <input
                    type="text"
                    placeholder={`Passenger #${idx + 2} Name`}
                    value={ap.name}
                    onChange={(e) => {
                      const updated = [...form.additionalPassengers];
                      updated[idx].name = e.target.value;
                      setForm((prev) => ({ ...prev, additionalPassengers: updated }));
                    }}
                    className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    type="tel"
                    placeholder="Phone (optional)"
                    value={ap.phone || ''}
                    onChange={(e) => {
                      const updated = [...form.additionalPassengers];
                      updated[idx].phone = e.target.value;
                      setForm((prev) => ({ ...prev, additionalPassengers: updated }));
                    }}
                    className="w-32 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePassenger(idx)}
                    className="text-slate-400 hover:text-red-500 px-1"
                    title="Remove passenger"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Booker vs Passenger Drawer */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.isBookerDifferent}
                    onChange={(e) => setForm((prev) => ({ ...prev, isBookerDifferent: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800 text-xs">
                    Booker is different from Passenger (Contact Person)
                  </span>
                </label>

                {form.isBookerDifferent && (
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-2 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-blue-800 tracking-wide">
                        Booker / Travel Coordinator Details
                      </span>
                      <span className="text-[10px] text-blue-600">
                        Invoices & receipts will be sent here
                      </span>
                    </div>

                    <input
                      type="text"
                      name="contactName"
                      placeholder="Booker Name (e.g. Sarah Jenkins, Hotel Concierge)"
                      value={form.contactName}
                      onChange={(e) => setForm((prev) => ({ ...prev, contactName: e.target.value }))}
                      required={form.isBookerDifferent}
                      className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="tel"
                        name="contactPhone"
                        placeholder="Booker Phone Number"
                        value={form.contactPhone}
                        onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                        required={form.isBookerDifferent}
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs"
                      />
                      <input
                        type="email"
                        name="contactEmail"
                        placeholder="Booker Email Address"
                        value={form.contactEmail}
                        onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                        required={form.isBookerDifferent}
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs"
                      />
                    </div>

                    <select
                      value={form.contactRole}
                      onChange={(e) => setForm((prev) => ({ ...prev, contactRole: e.target.value }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs text-slate-700"
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
            </div>

            {/* ─── Card 4: Trip Details (Pax, Bags & Car Seats) ─── */}
            <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Trip Details
                </label>
                <span className="text-[11px] text-slate-400 font-medium">
                  {form.passengers} Pax • {(form.carryOnBags + form.checkedBags)} Bags
                </span>
              </div>

              <div className="space-y-3">
                {/* Passengers & Bags Row - 3 equal width columns */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {/* Passengers Counter */}
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-slate-700 font-medium text-xs">
                      <UserIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div className="font-semibold text-slate-800">Passengers</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, passengers: Math.max(1, prev.passengers - 1) }))}
                        className="w-5 h-5 rounded bg-white hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-xs leading-none"
                      >
                        -
                      </button>
                      <span className="w-4 text-center font-bold text-xs">{form.passengers}</span>
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, passengers: Math.min(totalMaxPassengers, prev.passengers + 1) }))}
                        className="w-5 h-5 rounded bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 text-xs leading-none"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Carry-on Bags */}
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-slate-700 font-medium text-xs">
                      <LuggageIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div className="font-semibold text-slate-800">Carry-on Bags</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => {
                            const nextCarry = Math.max(0, prev.carryOnBags - 1);
                            return { ...prev, carryOnBags: nextCarry, bags: nextCarry + prev.checkedBags };
                          })
                        }
                        className="w-5 h-5 rounded bg-white hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-xs leading-none"
                      >
                        -
                      </button>
                      <span className="w-4 text-center font-bold text-xs">{form.carryOnBags}</span>
                      <button
                        type="button"
                        disabled={(form.carryOnBags + form.checkedBags) >= totalMaxBags}
                        onClick={() =>
                          setForm((prev) => {
                            const nextCarry = Math.min(totalMaxBags - prev.checkedBags, prev.carryOnBags + 1);
                            return { ...prev, carryOnBags: nextCarry, bags: nextCarry + prev.checkedBags };
                          })
                        }
                        className="w-5 h-5 rounded bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 disabled:opacity-40 text-xs leading-none"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Checked Bags */}
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-slate-700 font-medium text-xs">
                      <LuggageIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div className="font-semibold text-slate-800">Checked Bags</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => {
                            const nextChecked = Math.max(0, prev.checkedBags - 1);
                            return { ...prev, checkedBags: nextChecked, bags: prev.carryOnBags + nextChecked };
                          })
                        }
                        className="w-5 h-5 rounded bg-white hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-xs leading-none"
                      >
                        -
                      </button>
                      <span className="w-4 text-center font-bold text-xs">{form.checkedBags}</span>
                      <button
                        type="button"
                        disabled={(form.carryOnBags + form.checkedBags) >= totalMaxBags}
                        onClick={() =>
                          setForm((prev) => {
                            const nextChecked = Math.min(totalMaxBags - prev.carryOnBags, prev.checkedBags + 1);
                            return { ...prev, checkedBags: nextChecked, bags: prev.carryOnBags + nextChecked };
                          })
                        }
                        className="w-5 h-5 rounded bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 disabled:opacity-40 text-xs leading-none"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Oversized / Special Cargo Counters */}
                {bookingConfig.allowOversizedLuggage !== false && (
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600">
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
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-semibold text-slate-800">Oversized / Special Cargo (Golf Bags, Skis, Wheelchairs)</span>
                      </label>
                      {form.hasOversizedLuggage && totalOversizedCount > 0 && (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {totalOversizedCount} Item{totalOversizedCount > 1 ? 's' : ''} Declared
                        </span>
                      )}
                    </div>

                    {form.hasOversizedLuggage && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 animate-in fade-in duration-150">
                        <div className="text-[11px] text-slate-500 leading-tight">
                          Select specific oversized items to guarantee proper vehicle assignment.
                        </div>

                        <div className="space-y-1.5">
                          {oversizedCategories.map((cat) => {
                            const count = form.oversizedBags[cat.id] || 0;
                            return (
                              <div
                                key={cat.id}
                                className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-200 shadow-2xs"
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-slate-800">{cat.label}</span>
                                  {cat.requiresUpgrade && (
                                    <span className="text-[9px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                      Requires SUV/Van
                                    </span>
                                  )}
                                  {cat.fee > 0 && (
                                    <span className="text-[10px] font-bold text-emerald-700">
                                      +${cat.fee.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setForm((prev) => ({
                                        ...prev,
                                        oversizedBags: {
                                          ...prev.oversizedBags,
                                          [cat.id]: Math.max(0, (prev.oversizedBags[cat.id] || 0) - 1),
                                        },
                                      }))
                                    }
                                    className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-xs leading-none"
                                  >
                                    -
                                  </button>
                                  <span className="w-4 text-center font-bold text-slate-800 text-xs">{count}</span>
                                  <button
                                    type="button"
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
                                    className="w-5 h-5 rounded bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 disabled:opacity-40 text-xs leading-none"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div>
                          <input
                            type="text"
                            placeholder="Additional cargo notes (e.g. dimensions, delicate instruments)"
                            value={form.oversizedLuggageNotes}
                            onChange={(e) => setForm((prev) => ({ ...prev, oversizedLuggageNotes: e.target.value }))}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs placeholder:text-slate-400 focus:outline-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Car Seats Master Toggle & 3 Granular Steppers (Admin Configurable) */}
                {bookingConfig.allowChildSafetySeats && (
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-slate-800">
                        <input
                          type="checkbox"
                          checked={form.carSeats}
                          onChange={(e) => handleToggleCarSeats(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-semibold text-xs">Child Safety Seats Required</span>
                      </label>
                      {form.carSeats && (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          Total: {totalCarSeats} / {carSeatLimits.maxTotalCarSeats} max
                        </span>
                      )}
                    </div>

                    {form.carSeats && (
                      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-2 animate-in fade-in duration-150">
                        {/* Rear-Facing (Infant) */}
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-800">Rear-Facing</span>
                            <span className="text-slate-600 ml-1">(Infant: Birth–2 yrs, 5–40 lbs)</span>
                            <span className="text-[10px] text-slate-400 ml-1">max {carSeatLimits.maxRearFacing}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, rearFacingCount: Math.max(0, prev.rearFacingCount - 1) }))}
                              className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700"
                            >
                              -
                            </button>
                            <span className="w-4 text-center font-bold text-slate-800">{form.rearFacingCount}</span>
                            <button
                              type="button"
                              disabled={form.rearFacingCount >= carSeatLimits.maxRearFacing || totalCarSeats >= carSeatLimits.maxTotalCarSeats}
                              onClick={() => setForm((prev) => ({ ...prev, rearFacingCount: Math.min(carSeatLimits.maxRearFacing, prev.rearFacingCount + 1) }))}
                              className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Front-Facing (Toddler) */}
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-800">Front-Facing</span>
                            <span className="text-slate-600 ml-1">(Toddler: 5-pt harness, 22–65 lbs)</span>
                            <span className="text-[10px] text-slate-400 ml-1">max {carSeatLimits.maxFrontFacing}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, frontFacingCount: Math.max(0, prev.frontFacingCount - 1) }))}
                              className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700"
                            >
                              -
                            </button>
                            <span className="w-4 text-center font-bold text-slate-800">{form.frontFacingCount}</span>
                            <button
                              type="button"
                              disabled={form.frontFacingCount >= carSeatLimits.maxFrontFacing || totalCarSeats >= carSeatLimits.maxTotalCarSeats}
                              onClick={() => setForm((prev) => ({ ...prev, frontFacingCount: Math.min(carSeatLimits.maxFrontFacing, prev.frontFacingCount + 1) }))}
                              className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Youth Booster */}
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-800">Youth Booster</span>
                            <span className="text-slate-600 ml-1">(Youth: Belt-positioning, 40–100 lbs)</span>
                            <span className="text-[10px] text-slate-400 ml-1">max {carSeatLimits.maxBooster}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, boosterCount: Math.max(0, prev.boosterCount - 1) }))}
                              className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700"
                            >
                              -
                            </button>
                            <span className="w-4 text-center font-bold text-slate-800">{form.boosterCount}</span>
                            <button
                              type="button"
                              disabled={form.boosterCount >= carSeatLimits.maxBooster || totalCarSeats >= carSeatLimits.maxTotalCarSeats}
                              onClick={() => setForm((prev) => ({ ...prev, boosterCount: Math.min(carSeatLimits.maxBooster, prev.boosterCount + 1) }))}
                              className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Missouri Child Safety Law Helper */}
                        <div className="text-[10px] text-slate-600 bg-white/80 p-2 rounded border border-amber-200">
                          <span className="font-bold text-amber-900">Missouri Child Passenger Safety Law (RSMo § 307.179): </span>
                          <span>Children under 4 or 40 lbs require an approved car seat. Children 4–7 or under 4'9" require a booster seat. All child safety seats in our fleet are commercially sanitized.</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ─── Card 5: Vehicle Preference with Capacity Restrictions ─── */}
            <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Vehicle Preference {bookingConfig.allowMultiVehicle && `(${form.selectedVehicles.length} vehicle${form.selectedVehicles.length > 1 ? 's' : ''})`}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">
                    Guaranteed Clean Fleet
                  </span>
                  {bookingConfig.allowMultiVehicle && (
                    <button
                      type="button"
                      disabled={form.selectedVehicles.length >= (bookingConfig.maxVehiclesAllowed || 3)}
                      onClick={handleAddVehicle}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      <span>Add Vehicle</span>
                    </button>
                  )}
                </div>
              </div>

              {bookingConfig.allowMultiVehicle ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <span className="text-slate-600 font-medium">
                      Aggregate Fleet Capacity: <strong className="text-slate-900">{totalMaxPassengers} Pax</strong> • <strong className="text-slate-900">{totalMaxBags} Bags</strong>
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Configured for {form.selectedVehicles.length} of max {bookingConfig.maxVehiclesAllowed || 3} vehicle(s)
                    </span>
                  </div>

                  {form.selectedVehicles.map((vChoice, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 relative"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                            #{idx + 1}
                          </span>
                          <span className="font-bold text-xs text-slate-800">
                            Vehicle #{idx + 1} Tier
                          </span>
                        </div>
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveVehicle(idx)}
                            className="text-xs text-red-600 hover:text-red-800 font-semibold flex items-center gap-1"
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
                            (vChoice === 'van' && (tier.id === 'wheelchair' || tier.id === 'van'));
                          const multiplierDiff =
                            tier.baseMultiplier > 1.0
                              ? `+${Math.round((tier.baseMultiplier - 1.0) * 100)}%`
                              : null;

                          return (
                            <button
                              key={tier.id}
                              type="button"
                              onClick={() => handleUpdateVehicleChoice(idx, tier.id as CustomerVehicleChoice)}
                              className={`p-2.5 rounded-xl border text-left transition-all ${
                                isSelected
                                  ? 'bg-white border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                                  : 'bg-white/60 border-slate-200 hover:bg-white text-slate-600'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-bold text-slate-900">{tier.name}</span>
                                  {tier.badge && (
                                    <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1 py-0.2 rounded">
                                      {tier.badge}
                                    </span>
                                  )}
                                  {multiplierDiff && (
                                    <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1 py-0.2 rounded">
                                      {multiplierDiff}
                                    </span>
                                  )}
                                </div>
                                {isSelected && (
                                  <span className="text-blue-600 text-xs font-bold">✓</span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium">
                                {tier.maxPassengers}p / {tier.maxLuggage}b
                              </div>
                              {tier.description && (
                                <div className="text-[9px] text-slate-400 truncate mt-0.5">{tier.description}</div>
                              )}
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
                    <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-center gap-2">
                      <span className="font-bold">🚗 Automatic Vehicle Upgrade:</span>
                      <span>Selected oversized cargo requires SUV or Minivan cargo capacity.</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {activeVehicleTiers.map((tier) => {
                      const isCarSeatRestricted =
                        (totalCarSeats > 0 || returnTotalCarSeats > 0) &&
                        (tier.id === 'sedan' || tier.id === 'standard' || tier.id === 'any' || tier.maxPassengers <= 4);
                      const isOversizedRestricted =
                        oversizedRequiresUpgrade &&
                        (tier.id === 'sedan' || tier.id === 'standard' || tier.id === 'any' || tier.maxPassengers <= 4);
                      const isPaxRestricted = form.passengers > tier.maxPassengers;
                      const isLuggageRestricted = (form.carryOnBags + form.checkedBags) > tier.maxLuggage;
                      const isWheelchairRestricted =
                        form.specialRequests.wheelchair &&
                        (tier.id !== 'wheelchair' && tier.iconType !== 'wheelchair' && tier.id !== 'van');
                      const isRestricted =
                        isCarSeatRestricted || isOversizedRestricted || isPaxRestricted || isLuggageRestricted || isWheelchairRestricted;

                      let restrictionReason = '';
                      if (isWheelchairRestricted) {
                        restrictionReason = 'Requires Wheelchair WAV';
                      } else if (isOversizedRestricted) {
                        restrictionReason = 'Requires SUV/Van (Oversized cargo)';
                      } else if (isCarSeatRestricted) {
                        restrictionReason = 'Requires SUV or Van (Car seats)';
                      } else if (isPaxRestricted) {
                        restrictionReason = `Exceeds max ${tier.maxPassengers} passengers`;
                      } else if (isLuggageRestricted) {
                        restrictionReason = `Exceeds max ${tier.maxLuggage} luggage`;
                      }

                      const isSelected =
                        form.vehicleChoice === tier.id ||
                        (form.vehicleChoice === 'any' && tier.id === 'any') ||
                        (form.vehicleChoice === 'sedan' && (tier.id === 'standard' || tier.id === 'sedan')) ||
                        (form.vehicleChoice === 'suv' && (tier.id === 'xl' || tier.id === 'suv')) ||
                        (form.vehicleChoice === 'van' && (tier.id === 'wheelchair' || tier.id === 'van'));

                      const multiplierDiff =
                        tier.baseMultiplier > 1.0
                          ? `+${Math.round((tier.baseMultiplier - 1.0) * 100)}%`
                          : null;

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
                          className={`p-3 rounded-xl border text-left transition-all relative group flex flex-col justify-between ${
                            isRestricted
                              ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                              : isSelected
                              ? 'bg-blue-50/80 border-blue-500 shadow-sm ring-1 ring-blue-500'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
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

                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 text-sm">{tier.name}</span>
                                {tier.badge && (
                                  <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">
                                    {tier.badge}
                                  </span>
                                )}
                                {multiplierDiff && (
                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 border border-amber-200 px-1.5 py-0.2 rounded">
                                    {multiplierDiff}
                                  </span>
                                )}
                              </div>
                              {isSelected && (
                                <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shrink-0">
                                  ✓
                                </span>
                              )}
                            </div>
                            {tier.description && (
                              <p className="text-[11px] text-slate-500 mb-2">{tier.description}</p>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-600 font-semibold mt-2 pt-2 border-t border-slate-100">
                              <span className="inline-flex items-center gap-1">
                                <UserIcon className="w-3 h-3 text-slate-400" />
                                {tier.maxPassengers} Pax
                              </span>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1">
                                <LuggageIcon className="w-3 h-3 text-slate-400" />
                                {tier.maxLuggage} Bags
                              </span>
                            </div>

                            {isRestricted && (
                              <div className="mt-2 text-[10px] text-red-600 font-semibold bg-red-50 p-1 rounded border border-red-200 text-center">
                                {restrictionReason}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Multi-Vehicle Assistance Notice */}
                  <div className="p-3 bg-blue-50/80 border border-blue-200/90 rounded-xl flex items-start gap-2.5 text-xs text-blue-900 mt-2">
                    <InfoIcon className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold">
                        {bookingConfig.multiVehicleCustomNote || 'Need more than one vehicle for your party or event?'}
                      </p>
                      <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                        Please contact our dispatch desk directly at{' '}
                        <a
                          href={`tel:${(bookingConfig.multiVehicleCallPhone || COMPANY_CONFIG.phone.primaryRaw).replace(/[^\d+]/g, '')}`}
                          className="font-bold underline hover:text-blue-900"
                        >
                          {bookingConfig.multiVehicleCallPhone || COMPANY_CONFIG.phone.primary}
                        </a>{' '}
                        or email{' '}
                        <a
                          href={`mailto:${bookingConfig.multiVehicleCallEmail || COMPANY_CONFIG.email.dispatch}`}
                          className="font-bold underline hover:text-blue-900"
                        >
                          {bookingConfig.multiVehicleCallEmail || COMPANY_CONFIG.email.dispatch}
                        </a>{' '}
                        to coordinate multi-vehicle group reservations.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ─── Card 6: Return Trip (Round Trip) ─── */}
            {bookingConfig.allowRoundTrip && (
              <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.returnTrip}
                      onChange={(e) => setForm((prev) => ({ ...prev, returnTrip: e.target.checked }))}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-bold text-slate-900 text-xs">Book Return Trip (Round Trip)</span>
                  </label>
                  {form.returnTrip && (
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      Round Trip Guaranteed
                    </span>
                  )}
                </div>

                {form.returnTrip && (
                  <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-lg space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider">
                        🔁 Return Leg Route & Schedule
                      </span>
                      <button
                        type="button"
                        title="Swap Return Route"
                        onClick={handleSwapReturnRoute}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                      >
                        ↕ Swap Return
                      </button>
                    </div>

                    {/* Return Route Locations */}
                    <div className="space-y-2">
                      <DispatchLocationInput
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

                      <DispatchLocationInput
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
                    </div>

                    {/* Return Date & Time */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-[10px] text-indigo-800 font-semibold mb-0.5">Return Date</span>
                        <input
                          type="date"
                          value={form.returnDate}
                          min={form.scheduledDate || new Date().toISOString().split('T')[0]}
                          onChange={(e) => setForm((prev) => ({ ...prev, returnDate: e.target.value }))}
                          className="w-full px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <span className="block text-[10px] text-indigo-800 font-semibold mb-0.5">Return Time</span>
                        <input
                          type="time"
                          value={form.returnTime}
                          onChange={(e) => setForm((prev) => ({ ...prev, returnTime: e.target.value }))}
                          className="w-full px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>

                    {/* Return Leg Flight Assistance & Delay Tracking */}
                    {(returnAirportDetection.isAirportTrip || form.returnProvideFlightInfo) ? (
                      <div className="p-3 bg-white/90 border border-indigo-200 rounded-lg space-y-2.5 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-indigo-950 font-bold text-xs">
                            <PlaneLandingIcon className={`w-4 h-4 text-indigo-600 ${returnAirportDetection.isDropoffAirport ? 'rotate-45' : ''}`} />
                            <span>
                              {returnAirportDetection.isPrivateAviation
                                ? (returnAirportDetection.isPickupAirport
                                    ? `🛩️ ${returnAirportDetection.airport?.iataCode || 'Private Airport'} Return Private Aviation Arrival`
                                    : `🛩️ ${returnAirportDetection.airport?.iataCode || 'Private Airport'} Return Private Aviation Dropoff`)
                                : (returnAirportDetection.isPickupAirport
                                    ? `✈️ ${returnAirportDetection.airport?.iataCode || 'Airport'} Return Arrival Details`
                                    : `✈️ ${returnAirportDetection.airport?.iataCode || 'Airport'} Return Dropoff Details`)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-semibold text-indigo-900 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-200 shadow-2xs">
                              <input
                                type="checkbox"
                                checked={form.returnProvideFlightInfo}
                                onChange={(e) => setForm((prev) => ({ ...prev, returnProvideFlightInfo: e.target.checked }))}
                                className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                              />
                              <span>
                                {returnAirportDetection.isPickupAirport
                                  ? 'Track Inbound Flight'
                                  : (returnAirportDetection.isPrivateAviation ? 'Provide Aviation Details' : 'Provide Airline')}
                              </span>
                            </label>
                            <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-bold border border-indigo-200">
                              {returnAirportDetection.isPrivateAviation
                                ? '🛩️ Private Aviation (FBO)'
                                : (returnAirportDetection.isPickupAirport ? 'Arrival Tracking' : 'Terminal Routing')}
                            </span>
                          </div>
                        </div>

                        {returnAirportDetection.isDropoffAirport && (
                          <div className="text-[10.5px] text-amber-900 bg-amber-50/90 border border-amber-200 rounded-md p-2 flex items-start gap-1.5">
                            <span className="font-bold text-amber-800">ℹ️ Note:</span>
                            <span>Your chauffeur will arrive at your scheduled pickup time. Departing flights are not monitored for pickup adjustments.</span>
                          </div>
                        )}

                        {form.returnProvideFlightInfo && (
                          <div className="space-y-2 pt-1">
                            {returnAirportDetection.isPrivateAviation ? (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    FBO Facility / Terminal
                                  </span>
                                  <input
                                    type="text"
                                    list="return-fbo-list"
                                    placeholder="e.g. Signature Aviation, TAC Air..."
                                    value={form.returnFboFacility || ''}
                                    onChange={(e) => setForm((prev) => ({ ...prev, returnFboFacility: e.target.value }))}
                                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs text-slate-800"
                                  />
                                  <datalist id="return-fbo-list">
                                    {COMMON_FBO_FACILITIES.map((fbo) => (
                                      <option key={fbo} value={fbo} />
                                    ))}
                                  </datalist>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    Aircraft Tail Number {returnAirportDetection.isPickupAirport ? '(Required)' : '(Optional)'}
                                  </span>
                                  <input
                                    type="text"
                                    placeholder="e.g. N12345"
                                    value={form.returnTailNumber || ''}
                                    onChange={(e) => {
                                      const val = e.target.value.toUpperCase();
                                      setForm((prev) => ({ ...prev, returnTailNumber: val }));
                                      if (errors.returnTailNumber) {
                                        setErrors((prev) => {
                                          const copy = { ...prev };
                                          delete copy.returnTailNumber;
                                          return copy;
                                        });
                                      }
                                    }}
                                    className={`w-full px-2 py-1 bg-white border ${
                                      errors.returnTailNumber ? 'border-red-400 bg-red-50/40' : 'border-indigo-200'
                                    } rounded text-xs uppercase font-mono font-bold`}
                                  />
                                  {errors.returnTailNumber && (
                                    <p className="text-[10px] text-red-600 font-semibold mt-0.5">{errors.returnTailNumber}</p>
                                  )}
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    {returnAirportDetection.isPickupAirport ? 'Departing From (Origin - Optional)' : 'Departing To (Destination - Optional)'}
                                  </span>
                                  <input
                                    type="text"
                                    placeholder="e.g. TEB, VNY, PWK"
                                    value={form.returnFlightOrigin}
                                    onChange={(e) => setForm((prev) => ({ ...prev, returnFlightOrigin: e.target.value.toUpperCase() }))}
                                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs uppercase"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    Airline {returnAirportDetection.isDropoffAirport ? '(Terminal Door)' : ''}
                                  </span>
                                  <select
                                    value={form.returnAirline}
                                    onChange={(e) => setForm((prev) => ({ ...prev, returnAirline: e.target.value }))}
                                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs text-slate-800"
                                  >
                                    <option value="">Select Airline</option>
                                    {MAJOR_AIRLINES.map((al) => (
                                      <option key={al.code} value={al.name}>
                                        {al.name} ({al.code})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    {returnAirportDetection.isPickupAirport ? 'Flight Number (1–4 digits)' : 'Flight Number (Optional, 1–4 digits)'}
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]{1,4}"
                                    maxLength={4}
                                    placeholder="e.g. 1234"
                                    value={form.returnFlightNumber}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                      setForm((prev) => ({ ...prev, returnFlightNumber: val }));
                                      if (errors.returnFlightNumber) {
                                        setErrors((prev) => {
                                          const copy = { ...prev };
                                          delete copy.returnFlightNumber;
                                          return copy;
                                        });
                                      }
                                    }}
                                    className={`w-full px-2 py-1 bg-white border ${
                                      errors.returnFlightNumber ? 'border-red-400 bg-red-50/40' : 'border-indigo-200'
                                    } rounded text-xs font-mono font-bold`}
                                  />
                                  {errors.returnFlightNumber && (
                                    <p className="text-[10px] text-red-600 font-semibold mt-0.5">{errors.returnFlightNumber}</p>
                                  )}
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    {returnAirportDetection.isPickupAirport ? 'Departing From (Origin)' : 'Departing To (Destination - Optional)'}
                                  </span>
                                  <input
                                    type="text"
                                    placeholder="e.g. ORD, ATL, DEN"
                                    value={form.returnFlightOrigin}
                                    onChange={(e) => setForm((prev) => ({ ...prev, returnFlightOrigin: e.target.value.toUpperCase() }))}
                                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs uppercase"
                                  />
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-1 border-t border-indigo-100 text-[11px] text-indigo-950">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={form.returnHasCheckedLuggage}
                                  onChange={(e) => setForm((prev) => ({ ...prev, returnHasCheckedLuggage: e.target.checked }))}
                                  className="rounded border-indigo-300 text-indigo-600"
                                />
                                <span>
                                  {returnAirportDetection.isPickupAirport
                                    ? 'Passenger has checked baggage (allows baggage claim grace period)'
                                    : 'Passenger has checked baggage to drop off at curbside'}
                                </span>
                              </label>
                            </div>

                            <div className="text-[10px] text-slate-600 bg-indigo-50/50 p-2 rounded border border-indigo-100 space-y-0.5">
                              {returnAirportDetection.isPrivateAviation ? (
                                <>
                                  <span className="font-bold text-slate-800">Private Aviation FBO Pickup: </span>
                                  <span>Your chauffeur coordinates directly with the FBO front desk for ramp-side or lobby greetings. Tail number ensures rapid aircraft arrival verification.</span>
                                </>
                              ) : returnAirportDetection.isPickupAirport ? (
                                <>
                                  <span className="font-bold text-slate-800">STL Curbside Pickup Instructions: </span>
                                  <span>{bookingConfig.lambertPickupInstructions || 'Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2. Chauffeur tracks flight arrival in real-time.'}</span>
                                </>
                              ) : (
                                <>
                                  <span className="font-bold text-slate-800">STL Departures Dropoff Tip: </span>
                                  <span>Terminal 1: American, Delta, United, Spirit, Frontier • Terminal 2: Southwest Airlines. Providing your airline helps your chauffeur drop you off directly at your airline departures entrance.</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, returnProvideFlightInfo: true }))}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 pt-1"
                      >
                        ✈️ + Add Return Flight Information (Airport Tracking)
                      </button>
                    )}

                    {/* Return Fare Estimation Status */}
                    <div className="flex items-center justify-between text-xs font-semibold text-indigo-900 pt-1 border-t border-indigo-200">
                      <span>Return Leg Est. Fare:</span>
                      <span>
                        {isReturnQuoteLoading ? (
                          <span className="text-indigo-600">Calculating...</span>
                        ) : returnFare !== null ? (
                          `$${returnFare.toFixed(2)}`
                        ) : returnQuote ? (
                          `$${Math.ceil(returnQuote.pricing.totalFare).toFixed(2)}`
                        ) : (
                          '$--'
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── Card 7: Special Requests & Ride Instructions ─── */}
            <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Special Requests & Instructions
                </label>
                <span className="text-[11px] text-slate-400 font-medium">
                  Chauffeur Notes
                </span>
              </div>

              {/* Special Requests Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: 'petFriendly', label: 'Pet-Friendly', Icon: PawPrintIcon },
                  { key: 'wheelchair', label: 'WAV Ramp', Icon: WheelchairIcon },
                  { key: 'quietRide', label: 'Quiet Ride', Icon: VolumeXIcon },
                  { key: 'musicOk', label: 'Music OK', Icon: MusicNoteIcon },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleToggleSpecialRequest(item.key as SpecialRequestKey)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
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

              {/* Gate Code & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Subdivision / Gate Code</span>
                  <input
                    type="text"
                    placeholder="e.g. #1234 or Call box"
                    value={form.gateCode}
                    onChange={(e) => setForm((prev) => ({ ...prev, gateCode: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Chauffeur Instructions</span>
                  <input
                    type="text"
                    placeholder="e.g. Side entrance pickup, white house with brick driveway..."
                    value={form.driverNotes}
                    onChange={(e) => setForm((prev) => ({ ...prev, driverNotes: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>
            </div>

            {/* ─── Card 8: Payment Method (Segmented) ─── */}
            <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Payment Method
                </label>
                <span className="text-[11px] text-slate-400 font-medium">
                  Secure Checkout
                </span>
              </div>

              {(() => {
                const allowed =
                  bookingConfig.acceptedPaymentMethods && bookingConfig.acceptedPaymentMethods.length > 0
                    ? bookingConfig.acceptedPaymentMethods
                    : ['card', 'cash', 'account'];
                const allMethods = [
                  { key: 'card' as const, label: 'Credit Card', Icon: CreditCardIcon },
                  { key: 'cash' as const, label: 'Cash in Cab', Icon: DollarSignIcon },
                  { key: 'account' as const, label: 'Corporate Direct', Icon: BuildingIcon },
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
                        onClick={() => setForm((prev) => ({ ...prev, paymentMethod: m.key }))}
                        className={`py-2 text-center rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                          form.paymentMethod === m.key
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                        }`}
                      >
                        <m.Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}

              {/* Credit Card Sub-panel */}
              {form.paymentMethod === 'card' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 p-1 bg-slate-200/60 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, cardPaymentType: 'terminal' }))}
                      className={`flex-1 py-1.5 px-2 text-center rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        form.cardPaymentType === 'terminal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <CreditCardIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>Pay in Vehicle (Contactless / Chip Terminal)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, cardPaymentType: 'manual' }))}
                      className={`flex-1 py-1.5 px-2 text-center rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        form.cardPaymentType === 'manual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ShieldCheckIcon className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                      <span>Pre-authorize Card</span>
                    </button>
                  </div>

                  {form.cardPaymentType === 'terminal' ? (
                    <div className="text-[11px] text-slate-600 bg-white p-2.5 rounded border border-slate-200 flex items-center gap-2">
                      <ShieldCheckIcon className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Pay securely inside the vehicle upon arrival using Apple Pay, Google Pay, or any major credit/debit card. No payment is charged upfront.</span>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1">
                      <StripePaymentInput
                        amount={totalDisplayFare || 25}
                        currency="usd"
                        saveCardOnFile={form.saveCardOnFile}
                        onSaveCardChange={(save: boolean) => setForm((prev) => ({ ...prev, saveCardOnFile: save }))}
                        onCardChange={(cardDetails) => {
                          setForm((prev) => ({
                            ...prev,
                            cardNumber: cardDetails.token ? '•••• •••• •••• ' + cardDetails.last4 : prev.cardNumber,
                            cardLast4: cardDetails.last4,
                            cardBrand: cardDetails.brand,
                            paymentToken: cardDetails.token,
                          }));
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Cash Sub-panel */}
              {form.paymentMethod === 'cash' && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-950 flex items-center gap-2">
                  <DollarSignIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>You may pay cash directly to your chauffeur upon completion of your trip. Exact change is appreciated.</span>
                </div>
              )}

              {/* Corporate Account Sub-panel */}
              {form.paymentMethod === 'account' && (
                <div className="p-3 bg-amber-50/80 border border-amber-300 rounded-lg space-y-2 animate-in fade-in duration-150">
                  <div className="text-[10px] font-bold text-amber-900 uppercase">
                    Corporate Account Direct Billing
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      name="corporateOrgName"
                      placeholder="Organization / Company Name"
                      value={form.corporateOrgName}
                      onChange={(e) => setForm((prev) => ({ ...prev, corporateOrgName: e.target.value }))}
                      required={form.paymentMethod === 'account'}
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded text-xs"
                    />
                    <input
                      type="text"
                      name="corporateAccountNumber"
                      placeholder="Corporate Account # (e.g. ACCT-8040)"
                      value={form.corporateAccountNumber}
                      onChange={(e) => setForm((prev) => ({ ...prev, corporateAccountNumber: e.target.value }))}
                      required={form.paymentMethod === 'account'}
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Billing PO / Project Reference Code"
                      value={form.billingPo}
                      onChange={(e) => setForm((prev) => ({ ...prev, billingPo: e.target.value }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Authorized By (Manager Name)"
                      value={form.authorizedBy}
                      onChange={(e) => setForm((prev) => ({ ...prev, authorizedBy: e.target.value }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Sticky Summary & Guaranteed Fare Card */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-900 text-base">Trip Summary</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full">
                  Status: UNCONFIRMED
                </span>
              </div>

              {/* Itinerary Preview */}
              <div className="space-y-2.5 text-xs">
                {/* Timing */}
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

                {/* Route */}
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
                      ↓ {form.dropoffAddress || 'Select Dropoff Location'}
                    </p>
                  </div>
                </div>

                {/* Fleet & Capacity */}
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
                      <span className="font-semibold text-slate-800">
                        {totalCarSeats} Seat(s) Requested
                      </span>
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

              {/* Total Estimated Fare */}
              <div className="pt-3 border-t border-slate-200 flex items-baseline justify-between">
                <div>
                  <span className="text-xs text-slate-500 font-bold uppercase block">Estimated Fare</span>
                  <span className="text-[10px] text-slate-500 font-medium">Final fare will be in confirmation email.</span>
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

              {/* Reassurance Badges */}
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5 text-[11px] text-slate-600">
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                  <ShieldCheckIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Transparent Estimated Fare • No hidden surge</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                  <ClockIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Complimentary Flight Delay Tracking</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                  <CarIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Sanitized Commercial Fleet & Car Seats</span>
                </div>
              </div>

              {/* Mandatory Agreements: SMS, Terms & Privacy */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 space-y-2.5 text-xs text-slate-600">
                <label className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form.smsConsent}
                    onChange={(e) => setForm((prev) => ({ ...prev, smsConsent: e.target.checked }))}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                  />
                  <span className="text-[11px] text-slate-600 leading-tight group-hover:text-slate-800 transition-colors">
                    I agree to receive automated transactional SMS trip dispatch notifications and chauffeur arrival alerts.
                  </span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    required
                    defaultChecked
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                  />
                  <span className="text-[11px] text-slate-600 leading-tight group-hover:text-slate-800 transition-colors">
                    I agree to the{' '}
                    <Link to="/terms" target="_blank" className="font-semibold text-blue-600 underline hover:text-blue-800">
                      Terms and Conditions
                    </Link>{' '}
                    and{' '}
                    <Link to="/privacy" target="_blank" className="font-semibold text-blue-600 underline hover:text-blue-800">
                      Privacy Policy
                    </Link>.
                  </span>
                </label>
              </div>

              {/* Primary CTA Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  backgroundColor: 'var(--brand-primary)',
                  color: 'var(--btn-primary-text)',
                }}
                className="w-full py-3 px-4 hover:opacity-95 active:opacity-90 font-extrabold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <SpinnerIcon className="w-4 h-4 animate-spin" />
                    <span>Submitting Request...</span>
                  </>
                ) : (
                  <span>Request Ride • Awaiting Review</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
