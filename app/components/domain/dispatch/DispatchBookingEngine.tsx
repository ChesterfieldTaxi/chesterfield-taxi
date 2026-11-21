import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Trip, TripPricing, GeoPoint, CreateTripInput, VehicleTier, PaymentMethod } from '../../../core/types';
import type { NamedPricingRule, CorporateAccountConfig, VehicleTierConfig, UniversalExtrasConfig } from '../../../core/types/config';
import { getBookingService } from '../../../core/services/booking';
import { getPricingRulesService } from '../../../core/services/pricing';
import {
  getUniversalExtrasService,
  getUniversalExtrasConfig,
} from '../../../core/services/pricing/extras.service';
import { getSurchargesService } from '../../../core/services/pricing/surcharges.service';
import { formatLocalDateStr } from '../../../core/services/pricing/vehicle-matching';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';
import { getCorporateAccountService } from '../../../core/services/corporate-account.service';
import { getInvoicingService } from '../../../core/services/invoicing.service';
import { getEmailDispatchService } from '../../../core/services/email';
import { getContactService, normalizePhone } from '../../../core/services/customer/contact.service';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { getWorkspaceBus } from '../../../core/services/workspace-bus.service';
import { DispatchLocationInput } from './DispatchLocationInput';
import { PriceBreakdownPanel } from '../booking/PriceBreakdownPanel';
import {
  SpinnerIcon,
  PlusIcon,
  UserIcon,
  PhoneIcon,
  MailIcon,
  LuggageIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  CheckIcon,
  PlaneIcon,
  PlaneLandingIcon,
  PlaneTakeoffIcon,
  PawPrintIcon,
  VolumeXIcon,
  MusicNoteIcon,
  CopyIcon,
  LockIcon,
  BanIcon,
  MapPinIcon,
  CreditCardIcon,
  RepeatIcon,
  RefreshCwIcon,
} from '../../ui/Icons';
import { DEFAULT_OVERSIZED_BAG_CATEGORIES } from '../../../core/types/config';
import { ConfirmationModal } from '../../ui/ConfirmationModal';
import { ModernDatePicker, ModernTimePicker } from '../../ui/ModernDateTimePicker';
import { detectAirportInAddresses, MAJOR_AIRLINES } from '../../../core/config/airports';
import { getOperatorService, formatDriverAssignmentLabel, type DriverRosterItem } from '../../../core/services/operator.service';
import {
  generateMultiCarGroupId,
  distributeAcrossCars,
  buildPerVehiclePricingSpecs,
  buildAssociateEntryFromTrip,
} from '../../../core/services/booking/multi-car.util';

export const COMMON_FBO_FACILITIES = [
  'Signature Flight Support (STL - Hangar 2)',
  'Signature Aviation (SUS - Spirit of St. Louis)',
  'Million Air (SUS - Spirit of St. Louis)',
  'TAC Air / Signature (CPS - St. Louis Downtown)',
  'Premier Jet Center (SUS)',
  'Helicopter / Private Ramp Area',
  'Other / General Aviation Hangar',
];

export interface AdditionalPassenger {
  name: string;
  phone?: string;
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

export interface CarSeatsBreakdown {
  rearFacing: number;
  frontFacing: number;
  booster: number;
}

export type VehicleChoice = 'any' | 'sedan' | 'suv' | 'van' | (string & {});

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
  returnBags: number;
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
  repeatsRoundTrip?: boolean;
}

export interface DispatchFormValues {
  timingType: 'asap' | 'later';
  scheduledDate: string;
  scheduledTime: string;
  pickupAddress: string;
  pickupCoordinates?: GeoPoint;
  dropoffAddress: string;
  dropoffCoordinates?: GeoPoint;
  intermediateStops: Array<{ address: string; coordinates?: GeoPoint }>;
  passengerName: string;
  phone: string;
  email: string;
  additionalPassengers: AdditionalPassenger[];
  contactPerson: ContactPersonDetails;
  passengers: number;
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

/**
 * Resolves a dispatch vehicle choice into the exact Admin VehicleTierConfig ID
 * without flattening custom vehicles (compact_suv, midsize_suv, minivan, xl, etc.) to 'standard'.
 */
function resolveVehicleEngineId(v: VehicleChoice, availableIds?: string[]): VehicleTier {
  if (!v || v === 'any') return 'standard';
  if (availableIds && availableIds.includes(v)) return v as VehicleTier;
  if (v === 'sedan') return 'standard';
  if (v === 'suv') return 'xl';
  if (v === 'van') return availableIds?.includes('minivan') ? 'minivan' : 'wheelchair';
  return v as VehicleTier;
}

/**
 * Generates subsequent local YYYY-MM-DD dates for recurring dispatch schedules (excludes first date).
 */
function generateRecurringDates(
  startDateStr: string,
  frequency: 'daily' | 'weekdays' | 'weekly' | 'custom',
  repeatDays: string[],
  maxOccurrences: number,
  untilDateStr?: string
): string[] {
  const results: string[] = [];
  const cap = Math.min(Math.max(1, maxOccurrences), 20);
  if (cap <= 1 || !startDateStr) return results;

  const [y, m, d] = startDateStr.split('-').map(Number);
  if (!y || !m || !d) return results;
  const cursor = new Date(y, m - 1, d);
  const untilDate = untilDateStr
    ? (() => {
        const [uy, um, ud] = untilDateStr.split('-').map(Number);
        return uy && um && ud ? new Date(uy, um - 1, ud, 23, 59, 59) : null;
      })()
    : null;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let safety = 0;
  while (results.length < cap - 1 && safety < 180) {
    safety += 1;
    cursor.setDate(cursor.getDate() + 1);
    if (untilDate && cursor > untilDate) break;

    const dow = cursor.getDay();
    const dayName = dayNames[dow];
    let include = false;
    if (frequency === 'daily') include = true;
    else if (frequency === 'weekdays') include = dow >= 1 && dow <= 5;
    else if (frequency === 'weekly' || frequency === 'custom') {
      include = repeatDays.length > 0 ? repeatDays.includes(dayName) : dow === new Date(y, m - 1, d).getDay();
    }

    if (include) {
      results.push(formatLocalDateStr(cursor));
    }
  }
  return results;
}

function getDriverStatusEmoji(d: DriverRosterItem): string {
  const mapStatus = (d as any).mapStatus as string | undefined;
  if (mapStatus === 'available') return '[Avail]';
  if (mapStatus === 'en_route') return '[En Route]';
  if (mapStatus === 'busy') return '[Busy]';
  if (mapStatus === 'break') return '[Break]';
  if (mapStatus === 'offline') return '[Off]';
  if (d.status === 'available') return '[Avail]';
  if (d.status === 'on_trip') return '[Busy]';
  if (d.status === 'break') return '[Break]';
  return '[Off]';
}

const DEFAULT_COMPANIES = ['Chesterfield Taxi', 'St. Louis Taxi', 'West County Express'];
const DEFAULT_CORPORATE_ACCOUNTS = [
  'Bayer Crop Science (St. Louis HQ)',
  'Pfizer Chesterfield',
  'Marriott St. Louis West',
  'Mercy Hospital St. Louis',
  "St. Luke's Hospital",
  'Delmar Gardens Chesterfield',
  'West County Orthopedics',
  'Custom Direct Bill Account',
];
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function DispatchBookingEngineComponent({
  draftId,
  isActiveDraft,
  isActive,
  initialTrip,
  allTrips,
  trips: propTrips,
  drivers: propsDrivers,
  onBookingSuccess,
  onValuesChange,
  onClearDraft,
  onCloneBooking,
  onCopyBooking,
  onOpenLinkedTrip,
}: DispatchBookingEngineProps) {
  const resolvedIsActiveDraft = isActiveDraft ?? isActive;
  const lookupTrips = allTrips ?? propTrips ?? [];
  const [driverOptions, setDriverOptions] = useState<DriverRosterItem[]>(() => {
    return propsDrivers && propsDrivers.length > 0
      ? propsDrivers
      : getOperatorService().getDriverRoster();
  });

  useEffect(() => {
    if (propsDrivers && propsDrivers.length > 0) {
      setDriverOptions(propsDrivers);
      return;
    }
    const unsub = getOperatorService().subscribeToDrivers((roster) => {
      setDriverOptions(roster);
    });
    return () => unsub();
  }, [propsDrivers]);

  const isEditMode = Boolean(initialTrip?.id);
  const isCompleted = initialTrip?.status === 'completed';
  const isCancelled = initialTrip?.status === 'cancelled';
  const outboundTripId =
    initialTrip?.linkedTripId ||
    (initialTrip?.metadata as any)?.linkedTripId;
  const explicitReturnTripId =
    initialTrip?.linkedReturnTripId ||
    (initialTrip?.metadata as any)?.linkedReturnTripId ||
    (initialTrip?.metadata as any)?.returnTripId;

  // If first leg doesn't have returnTripId explicitly saved, search allTrips for a paired trip pointing to initialTrip.id
  const discoveredReturnTripId = useMemo(() => {
    if (explicitReturnTripId) return explicitReturnTripId;
    if (!initialTrip?.id || !allTrips || allTrips.length === 0) return undefined;
    const paired = allTrips.find(
      (t) =>
        t.id !== initialTrip.id &&
        (t.linkedTripId === initialTrip.id ||
          (t.metadata as any)?.linkedTripId === initialTrip.id) &&
        (t.isReturnRide || (t.metadata as any)?.isReturnRide)
    );
    return paired?.id;
  }, [explicitReturnTripId, initialTrip?.id, allTrips]);

  const returnTripId = explicitReturnTripId || discoveredReturnTripId;
  const isReturnRide = Boolean(
    initialTrip?.isReturnRide ||
    (initialTrip?.metadata as any)?.isReturnRide ||
    outboundTripId
  );
  const targetLegTripId = isReturnRide ? outboundTripId : returnTripId;
  const linkedTripId = targetLegTripId;
  const returnScheduledTime =
    initialTrip?.returnScheduledPickupTime ||
    (initialTrip?.metadata as any)?.returnScheduledPickupTime ||
    ((initialTrip?.metadata as any)?.returnDate && (initialTrip?.metadata as any)?.returnTime
      ? `${(initialTrip?.metadata as any)?.returnDate}T${(initialTrip?.metadata as any)?.returnTime}:00`
      : undefined);
  const hasLinkedTrip = Boolean(targetLegTripId);
  const draftStorageKey = `chesterfield_dispatch_draft_${draftId}`;

  // Keep latest onValuesChange in a ref to avoid infinite dependency re-triggers
  const onValuesChangeRef = useRef(onValuesChange);
  useEffect(() => {
    onValuesChangeRef.current = onValuesChange;
  }, [onValuesChange]);

  // Form State: Timing (strictly local YYYY-MM-DD — no UTC rollover!)
  const [timingType, setTimingType] = useState<'asap' | 'later'>('asap');
  const [scheduledDate, setScheduledDate] = useState(() => formatLocalDateStr(new Date()));
  const [scheduledTime, setScheduledTime] = useState('12:00');

  // Routing: Outbound (includes placeId so presets & autocomplete never deadlock)
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoordinates, setPickupCoordinates] = useState<GeoPoint | undefined>();
  const [pickupPlaceId, setPickupPlaceId] = useState<string | undefined>();
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffCoordinates, setDropoffCoordinates] = useState<GeoPoint | undefined>();
  const [dropoffPlaceId, setDropoffPlaceId] = useState<string | undefined>();
  const [intermediateStops, setIntermediateStops] = useState<Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>>([]);

  // Flight & Aviation State: Outbound
  const [provideFlightInfo, setProvideFlightInfo] = useState(false);
  const [airline, setAirline] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [flightOrigin, setFlightOrigin] = useState('');
  const [tailNumber, setTailNumber] = useState('');
  const [fboFacility, setFboFacility] = useState('');
  const [hasCheckedLuggage, setHasCheckedLuggage] = useState(false);

  // Passenger & Contact Person
  const [passengerName, setPassengerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [additionalPassengers, setAdditionalPassengers] = useState<AdditionalPassenger[]>([]);
  const [isBookerDifferent, setIsBookerDifferent] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactRole, setContactRole] = useState('Hotel Front Desk / Concierge');

  // Details: Passengers, Bags, Oversized Cargo (matching Customer Form toggle), Car Seats, Special Requests, Admin Custom Extras
  const [passengers, setPassengers] = useState(1);
  const [bags, setBags] = useState(0);
  const [hasOversizedLuggage, setHasOversizedLuggage] = useState(false);
  const [oversizedBags, setOversizedBags] = useState<Record<string, number>>({});
  const [oversizedLuggageNotes, setOversizedLuggageNotes] = useState('');
  const [showSpecialRequests, setShowSpecialRequests] = useState(false);
  const [specialRequestFlags, setSpecialRequestFlags] = useState<{
    petFriendly: boolean;
    quietRide: boolean;
    musicOk: boolean;
  }>({
    petFriendly: false,
    quietRide: false,
    musicOk: false,
  });
  const [gateCode, setGateCode] = useState('');
  const [selectedCustomExtras, setSelectedCustomExtras] = useState<Record<string, number>>({});
  const [carSeats, setCarSeats] = useState(false);
  const [rearFacingCount, setRearFacingCount] = useState(0);
  const [frontFacingCount, setFrontFacingCount] = useState(0);
  const [boosterCount, setBoosterCount] = useState(0);

  // Multi-Vehicle Selection
  const [selectedVehicles, setSelectedVehicles] = useState<Array<VehicleChoice>>(['any']);

  // Payment (PCI-safe — no full PAN or CVC stored)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'account'>('cash');
  const [cardPaymentType, setCardPaymentType] = useState<'terminal' | 'payment_link' | 'card_on_file' | 'manual'>('terminal');
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState(''); // Last 4 digits only
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [saveCardOnFile, setSaveCardOnFile] = useState(false);

  const [corporateAccount, setCorporateAccount] = useState(DEFAULT_CORPORATE_ACCOUNTS[0]);
  const [billingPo, setBillingPo] = useState('');
  const [allowPoOverride, setAllowPoOverride] = useState(false);
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [invoicingTerms, setInvoicingTerms] = useState('Net 30 Direct Bill');
  const [sendEmailConfirmation, setSendEmailConfirmation] = useState(true);

  const [tariff, setTariff] = useState('Standard');
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [availableNamedRules, setAvailableNamedRules] = useState<NamedPricingRule[]>([]);
  const [universalExtrasConfig, setUniversalExtrasConfig] = useState<UniversalExtrasConfig>(() =>
    getUniversalExtrasConfig()
  );
  const [surchargesVersion, setSurchargesVersion] = useState(0);
  const [discount, setDiscount] = useState('None');
  const [manualDiscountDollars, setManualDiscountDollars] = useState('');
  const [waiveAirportFee, setWaiveAirportFee] = useState(false);
  const [waiveMultiStopFees, setWaiveMultiStopFees] = useState(false);
  const [bypassSurge, setBypassSurge] = useState(false);
  const [company, setCompany] = useState(DEFAULT_COMPANIES[0]);
  const [driverId, setDriverId] = useState('unassigned');

  // Inline caller lookup UI state
  const [showCallerSuggestions, setShowCallerSuggestions] = useState(false);
  const [callerQuickAddresses, setCallerQuickAddresses] = useState<string[]>([]);

  // Subscribe to real-time named pricing rules, universal extras & surcharges from Firestore
  useEffect(() => {
    const unsubRules = getPricingRulesService().subscribeToRules((rules) => {
      setAvailableNamedRules(rules.filter((r) => r.isActive));
    });
    const unsubExtras = getUniversalExtrasService().subscribeToExtras((cfg) => {
      if (cfg) setUniversalExtrasConfig(cfg);
    });
    const unsubSurcharges = getSurchargesService().subscribeToSurcharges(() => {
      setSurchargesVersion((v) => v + 1);
    });
    return () => {
      unsubRules();
      unsubExtras();
      unsubSurcharges();
    };
  }, []);

  // Subscribe to real-time corporate accounts and vehicle classes from Firestore / config
  const [corporateAccountList, setCorporateAccountList] = useState<CorporateAccountConfig[]>([]);
  const [vehicleTiers, setVehicleTiers] = useState<VehicleTierConfig[]>(() => {
    const cached = getAdminConfigService().getCachedSettings();
    if (cached?.vehicles && cached.vehicles.length > 0) {
      return cached.vehicles.filter((v) => !v.isArchived);
    }
    return [];
  });

  useEffect(() => {
    const unsub = getAdminConfigService().subscribeToSettings((settings) => {
      if (settings?.corporateAccounts && settings.corporateAccounts.length > 0) {
        setCorporateAccountList(settings.corporateAccounts);
        setCorporateAccount((prev) => {
          const exists = settings.corporateAccounts!.some(
            (c) => c.companyName === prev || c.id === prev || c.accountNumber === prev
          );
          return exists ? prev : settings.corporateAccounts![0].companyName;
        });
      }
      if (settings?.vehicles && settings.vehicles.length > 0) {
        setVehicleTiers(settings.vehicles.filter((v) => !v.isArchived));
      }
    });
    return () => unsub();
  }, []);

  // Notes
  const [notesForAll, setNotesForAll] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // Return Trip Details (Full independent leg & fleet)
  const [returnTrip, setReturnTrip] = useState(false);
  const [returnPickupAddress, setReturnPickupAddress] = useState('');
  const [returnPickupCoordinates, setReturnPickupCoordinates] = useState<GeoPoint | undefined>();
  const [returnPickupPlaceId, setReturnPickupPlaceId] = useState<string | undefined>();
  const [returnDropoffAddress, setReturnDropoffAddress] = useState('');
  const [returnDropoffCoordinates, setReturnDropoffCoordinates] = useState<GeoPoint | undefined>();
  const [returnDropoffPlaceId, setReturnDropoffPlaceId] = useState<string | undefined>();
  const [returnIntermediateStops, setReturnIntermediateStops] = useState<Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>>([]);
  const [returnDate, setReturnDate] = useState(() => formatLocalDateStr(new Date()));
  const [returnTime, setReturnTime] = useState('17:00');
  const [returnPassengers, setReturnPassengers] = useState(1);
  const [returnBags, setReturnBags] = useState(0);
  const [returnCarSeats, setReturnCarSeats] = useState(false);
  const [returnRearFacing, setReturnRearFacing] = useState(0);
  const [returnFrontFacing, setReturnFrontFacing] = useState(0);
  const [returnBooster, setReturnBooster] = useState(0);
  const [returnVehicles, setReturnVehicles] = useState<Array<VehicleChoice>>(['any']);
  const [autoCreateReturnTrip, setAutoCreateReturnTrip] = useState(true);
  const [returnEstimatedDurationMinutes, setReturnEstimatedDurationMinutes] = useState(0);
  const [returnEstimatedDistanceMiles, setReturnEstimatedDistanceMiles] = useState(0);
  const [returnEstimatedFare, setReturnEstimatedFare] = useState(0);

  // Flight & Aviation State: Return
  const [returnProvideFlightInfo, setReturnProvideFlightInfo] = useState(false);
  const [returnAirline, setReturnAirline] = useState('');
  const [returnFlightNumber, setReturnFlightNumber] = useState('');
  const [returnFlightOrigin, setReturnFlightOrigin] = useState('');
  const [returnTailNumber, setReturnTailNumber] = useState('');
  const [returnFboFacility, setReturnFboFacility] = useState('');
  const [returnHasCheckedLuggage, setReturnHasCheckedLuggage] = useState(false);

  // Airport & Aviation auto-detection
  const airportDetection = useMemo(() => {
    return detectAirportInAddresses(pickupAddress, dropoffAddress);
  }, [pickupAddress, dropoffAddress]);

  const returnAirportDetection = useMemo(() => {
    return detectAirportInAddresses(returnPickupAddress || '', returnDropoffAddress || '');
  }, [returnPickupAddress, returnDropoffAddress]);

  // Auto-toggle flight info when airport address is detected on outbound
  useEffect(() => {
    if (airportDetection.isAirportTrip) {
      setProvideFlightInfo(true);
    }
  }, [airportDetection.isAirportTrip]);

  // Auto-toggle return flight info when return airport address is detected
  useEffect(() => {
    if (returnAirportDetection.isAirportTrip) {
      setReturnProvideFlightInfo(true);
    }
  }, [returnAirportDetection.isAirportTrip]);

  // Repeat / Recurring Schedule
  const [repeat, setRepeat] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<'daily' | 'weekdays' | 'weekly' | 'custom'>('weekdays');
  const [repeatDays, setRepeatDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [repeatOccurrences, setRepeatOccurrences] = useState(5);
  const [repeatUntilDate, setRepeatUntilDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return formatLocalDateStr(d);
  });
  const [repeatWeeksPattern, setRepeatWeeksPattern] = useState<'all' | 'odd' | 'even'>('all');

  // Pricing (Canonical TripPricing + per-vehicle live quotes + expandable breakdown)
  const [estimatedFare, setEstimatedFare] = useState(0);
  const [outboundPricing, setOutboundPricing] = useState<TripPricing | null>(null);
  const [returnPricing, setReturnPricing] = useState<TripPricing | null>(null);
  const [vehicleQuotes, setVehicleQuotes] = useState<Record<string, TripPricing>>({});
  const [returnVehicleQuotes, setReturnVehicleQuotes] = useState<Record<string, TripPricing>>({});
  const [isQuoting, setIsQuoting] = useState(false);
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);
  const [manualFare, setManualFare] = useState('');
  const [isFareOverridden, setIsFareOverridden] = useState(false);
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(0);
  const [estimatedDistanceMiles, setEstimatedDistanceMiles] = useState(0);

  // Prevents Edit Mode from silently overwriting a saved trip's fare on initial mount
  const skipFirstEditQuoteRef = useRef<boolean>(Boolean(initialTrip));
  // Prevents mount-order save race (blank initial state overwriting localStorage draft before hydration finishes)
  // and prevents Firestore real-time trip updates from clobbering unsaved edits in an open Edit tab
  const hydratedIdentityRef = useRef<string | null>(null);
  const [hasHydratedDraft, setHasHydratedDraft] = useState<boolean>(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const submitErrorRef = useRef<HTMLDivElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (submitError && submitErrorRef.current) {
      submitErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [submitError]);

  // Limits from centralized config
  const carSeatLimits = COMPANY_CONFIG.carSeatLimits || {
    maxRearFacing: 2,
    maxFrontFacing: 3,
    maxBooster: 3,
    maxTotalCarSeats: 4,
  };

  const dispatchVehicleOptions = useMemo(() => {
    const options: Array<{ key: VehicleChoice; label: string; badge?: string; maxPassengers: number; maxBags: number }> = [
      { key: 'any', label: 'Any', maxPassengers: 4, maxBags: 3 }
    ];

    if (vehicleTiers.length > 0) {
      for (const tier of vehicleTiers) {
        options.push({
          key: tier.id as VehicleChoice,
          label: tier.name,
          badge: tier.badge,
          maxPassengers: tier.maxPassengers,
          maxBags: tier.maxLuggage,
        });
      }
    } else {
      options.push(
        { key: 'sedan', label: 'Sedan', maxPassengers: 4, maxBags: 3 },
        { key: 'suv', label: 'SUV', maxPassengers: 6, maxBags: 5 },
        { key: 'van', label: 'Van', maxPassengers: 7, maxBags: 6 },
      );
    }
    return options;
  }, [vehicleTiers]);

  const vehicleCapacities = useMemo(() => {
    const map: Record<string, { maxPassengers: number; maxBags: number; name?: string }> = {
      any: { maxPassengers: 4, maxBags: 3, name: 'Any' },
      sedan: { maxPassengers: 4, maxBags: 3, name: 'Sedan' },
      suv: { maxPassengers: 6, maxBags: 5, name: 'SUV' },
      van: { maxPassengers: 7, maxBags: 6, name: 'Van' },
    };

    for (const opt of dispatchVehicleOptions) {
      map[opt.key] = {
        maxPassengers: opt.maxPassengers,
        maxBags: opt.maxBags,
        name: opt.label,
      };
    }
    return map;
  }, [dispatchVehicleOptions]);

  // Compute fleet capacities from sum of selected vehicles
  const totalMaxPassengers = selectedVehicles.reduce(
    (acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4),
    0
  );
  const totalMaxBags = selectedVehicles.reduce(
    (acc, v) => acc + (vehicleCapacities[v]?.maxBags || 3),
    0
  );
  const totalCarSeats = carSeats ? (rearFacingCount + frontFacingCount + boosterCount) : 0;
  const returnTotalCarSeats = returnCarSeats ? (returnRearFacing + returnFrontFacing + returnBooster) : 0;

  // Hydrate ONCE per tab identity (prevents real-time Firestore ticks from clobbering unsaved edits
  // AND restores cached unsaved localStorage edits on top of Edit tabs across reloads!)
  useEffect(() => {
    const hydrationIdentity = initialTrip?.id ? `edit:${initialTrip.id}` : `draft:${draftStorageKey}`;
    if (hydratedIdentityRef.current === hydrationIdentity) {
      return;
    }
    hydratedIdentityRef.current = hydrationIdentity;

    const applySavedDraftOverlay = (parsed: any) => {
      // Support both flat draft storage AND nested DispatchFormValues (from Copy Booking)
      if (parsed.timingType) setTimingType(parsed.timingType);
      if (parsed.scheduledDate) setScheduledDate(parsed.scheduledDate);
      if (parsed.scheduledTime) setScheduledTime(parsed.scheduledTime);
      if (parsed.pickupAddress !== undefined) setPickupAddress(parsed.pickupAddress);
      if (parsed.pickupCoordinates) setPickupCoordinates(parsed.pickupCoordinates);
      if (parsed.pickupPlaceId !== undefined) setPickupPlaceId(parsed.pickupPlaceId);
      if (parsed.dropoffAddress !== undefined) setDropoffAddress(parsed.dropoffAddress);
      if (parsed.dropoffCoordinates) setDropoffCoordinates(parsed.dropoffCoordinates);
      if (parsed.dropoffPlaceId !== undefined) setDropoffPlaceId(parsed.dropoffPlaceId);
      if (parsed.intermediateStops) setIntermediateStops(parsed.intermediateStops);
      if (parsed.passengerName !== undefined) setPassengerName(parsed.passengerName);
      if (parsed.phone !== undefined) setPhone(parsed.phone);
      if (parsed.email !== undefined) setEmail(parsed.email);
      if (parsed.additionalPassengers) setAdditionalPassengers(parsed.additionalPassengers);

      const cp = parsed.contactPerson;
      if (parsed.isBookerDifferent !== undefined || cp?.isBookerDifferent !== undefined) {
        setIsBookerDifferent(parsed.isBookerDifferent ?? cp?.isBookerDifferent);
      }
      if (parsed.contactName || cp?.contactName) setContactName(parsed.contactName || cp?.contactName);
      if (parsed.contactPhone || cp?.contactPhone) setContactPhone(parsed.contactPhone || cp?.contactPhone);
      if (parsed.contactEmail || cp?.contactEmail) setContactEmail(parsed.contactEmail || cp?.contactEmail);
      if (parsed.contactRole || cp?.contactRole) setContactRole(parsed.contactRole || cp?.contactRole);

      if (parsed.passengers) setPassengers(parsed.passengers);
      if (parsed.bags !== undefined) setBags(parsed.bags);
      if (parsed.hasOversizedLuggage !== undefined) setHasOversizedLuggage(Boolean(parsed.hasOversizedLuggage));
      if (parsed.oversizedBags && typeof parsed.oversizedBags === 'object') {
        setOversizedBags(parsed.oversizedBags);
        const totalOv = Object.values(parsed.oversizedBags).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
        if (totalOv > 0) setHasOversizedLuggage(true);
      } else if (typeof parsed.oversizedBagsCount === 'number' && parsed.oversizedBagsCount > 0) {
        const defaultId = universalExtrasConfig?.oversizedBagsConfig?.[0]?.id || 'golf_bag';
        setOversizedBags({ [defaultId]: parsed.oversizedBagsCount });
        setHasOversizedLuggage(true);
      }
      if (parsed.oversizedLuggageNotes !== undefined) setOversizedLuggageNotes(parsed.oversizedLuggageNotes || '');
      if (parsed.specialRequestFlags && typeof parsed.specialRequestFlags === 'object') {
        setSpecialRequestFlags({
          petFriendly: Boolean(parsed.specialRequestFlags.petFriendly),
          quietRide: Boolean(parsed.specialRequestFlags.quietRide),
          musicOk: Boolean(parsed.specialRequestFlags.musicOk),
        });
        if (Object.values(parsed.specialRequestFlags).some(Boolean)) setShowSpecialRequests(true);
      }
      if (parsed.gateCode !== undefined) {
        setGateCode(parsed.gateCode || '');
        if (parsed.gateCode) setShowSpecialRequests(true);
      }
      if (parsed.selectedCustomExtras) setSelectedCustomExtras(parsed.selectedCustomExtras);
      if (parsed.carSeats !== undefined) setCarSeats(parsed.carSeats);

      const csb = parsed.carSeatsBreakdown;
      if (parsed.rearFacingCount !== undefined || csb?.rearFacing !== undefined) {
        setRearFacingCount(parsed.rearFacingCount ?? csb?.rearFacing ?? 0);
      }
      if (parsed.frontFacingCount !== undefined || csb?.frontFacing !== undefined) {
        setFrontFacingCount(parsed.frontFacingCount ?? csb?.frontFacing ?? 0);
      }
      if (parsed.boosterCount !== undefined || csb?.booster !== undefined) {
        setBoosterCount(parsed.boosterCount ?? csb?.booster ?? 0);
      }
      if (parsed.selectedVehicles && Array.isArray(parsed.selectedVehicles) && parsed.selectedVehicles.length > 0) {
        setSelectedVehicles(parsed.selectedVehicles);
      }
      if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);

      const card = parsed.cardDetails;
      if (parsed.cardPaymentType || card?.cardPaymentType) {
        setCardPaymentType(parsed.cardPaymentType || card?.cardPaymentType);
      }
      if (parsed.cardholderName || card?.cardholderName) {
        setCardholderName(parsed.cardholderName || card?.cardholderName);
      }

      const corp = parsed.corporateDetails;
      if (parsed.corporateAccount || corp?.corporateAccount) {
        setCorporateAccount(parsed.corporateAccount || corp?.corporateAccount);
      }
      if (parsed.billingPo !== undefined || corp?.billingPo !== undefined) {
        setBillingPo(parsed.billingPo ?? corp?.billingPo ?? '');
      }
      if (parsed.authorizedBy !== undefined || corp?.authorizedBy !== undefined) {
        setAuthorizedBy(parsed.authorizedBy ?? corp?.authorizedBy ?? '');
      }
      if (parsed.invoicingTerms || corp?.invoicingTerms) {
        setInvoicingTerms(parsed.invoicingTerms || corp?.invoicingTerms);
      }
      if (parsed.tariff) setTariff(parsed.tariff);
      if (parsed.pricingRuleId !== undefined) setSelectedRuleId(parsed.pricingRuleId);
      if (parsed.discount) setDiscount(parsed.discount);
      if (parsed.manualDiscountDollars !== undefined) setManualDiscountDollars(parsed.manualDiscountDollars);
      if (parsed.waiveAirportFee !== undefined) setWaiveAirportFee(parsed.waiveAirportFee);
      if (parsed.waiveMultiStopFees !== undefined) setWaiveMultiStopFees(parsed.waiveMultiStopFees);
      if (parsed.bypassSurge !== undefined) setBypassSurge(parsed.bypassSurge);
      if (parsed.company) setCompany(parsed.company);
      if (parsed.driverId) setDriverId(parsed.driverId);
      if (parsed.notesForAll !== undefined) setNotesForAll(parsed.notesForAll);
      if (parsed.internalNotes !== undefined) setInternalNotes(parsed.internalNotes);
      if (parsed.sendEmailConfirmation !== undefined) setSendEmailConfirmation(parsed.sendEmailConfirmation);

      const ret = parsed.returnDetails;
      if (parsed.returnTrip !== undefined || ret?.returnTrip !== undefined) {
        setReturnTrip(parsed.returnTrip ?? ret?.returnTrip);
      }
      if (parsed.returnPickupAddress || ret?.returnPickupAddress) {
        setReturnPickupAddress(parsed.returnPickupAddress || ret?.returnPickupAddress);
      }
      if (parsed.returnPickupCoordinates || ret?.returnPickupCoordinates) {
        setReturnPickupCoordinates(parsed.returnPickupCoordinates || ret?.returnPickupCoordinates);
      }
      if (parsed.returnDropoffAddress || ret?.returnDropoffAddress) {
        setReturnDropoffAddress(parsed.returnDropoffAddress || ret?.returnDropoffAddress);
      }
      if (parsed.returnDropoffCoordinates || ret?.returnDropoffCoordinates) {
        setReturnDropoffCoordinates(parsed.returnDropoffCoordinates || ret?.returnDropoffCoordinates);
      }
      if (parsed.returnIntermediateStops || ret?.returnIntermediateStops) {
        setReturnIntermediateStops(parsed.returnIntermediateStops || ret?.returnIntermediateStops);
      }
      if (parsed.returnDate || ret?.returnDate) setReturnDate(parsed.returnDate || ret?.returnDate);
      if (parsed.returnTime || ret?.returnTime) setReturnTime(parsed.returnTime || ret?.returnTime);
      if (parsed.returnPassengers !== undefined || ret?.returnPassengers !== undefined) {
        setReturnPassengers(parsed.returnPassengers ?? ret?.returnPassengers);
      }
      if (parsed.returnBags !== undefined || ret?.returnBags !== undefined) {
        setReturnBags(parsed.returnBags ?? ret?.returnBags);
      }
      if (parsed.returnCarSeats !== undefined || ret?.returnCarSeats !== undefined) {
        setReturnCarSeats(parsed.returnCarSeats ?? ret?.returnCarSeats);
      }
      if (parsed.returnRearFacing !== undefined || ret?.returnCarSeatsBreakdown?.rearFacing !== undefined) {
        setReturnRearFacing(parsed.returnRearFacing ?? ret?.returnCarSeatsBreakdown?.rearFacing ?? 0);
      }
      if (parsed.returnFrontFacing !== undefined || ret?.returnCarSeatsBreakdown?.frontFacing !== undefined) {
        setReturnFrontFacing(parsed.returnFrontFacing ?? ret?.returnCarSeatsBreakdown?.frontFacing ?? 0);
      }
      if (parsed.returnBooster !== undefined || ret?.returnCarSeatsBreakdown?.booster !== undefined) {
        setReturnBooster(parsed.returnBooster ?? ret?.returnCarSeatsBreakdown?.booster ?? 0);
      }
      if (parsed.returnVehicles || ret?.returnVehicles) {
        setReturnVehicles(parsed.returnVehicles || ret?.returnVehicles);
      }
      if (parsed.autoCreateReturnTrip !== undefined || ret?.autoCreateReturnTrip !== undefined) {
        setAutoCreateReturnTrip(parsed.autoCreateReturnTrip ?? ret?.autoCreateReturnTrip);
      }

      const rep = parsed.repeatDetails;
      if (parsed.repeat !== undefined || rep?.repeat !== undefined) setRepeat(parsed.repeat ?? rep?.repeat);
      if (parsed.repeatFrequency || rep?.repeatFrequency) {
        setRepeatFrequency(parsed.repeatFrequency || rep?.repeatFrequency);
      }
      if (parsed.repeatDays || rep?.repeatDays) setRepeatDays(parsed.repeatDays || rep?.repeatDays);
      if (parsed.repeatOccurrences || rep?.repeatOccurrences) {
        setRepeatOccurrences(parsed.repeatOccurrences || rep?.repeatOccurrences);
      }
      if (parsed.repeatUntilDate || rep?.repeatUntilDate) {
        setRepeatUntilDate(parsed.repeatUntilDate || rep?.repeatUntilDate);
      }
      if (parsed.repeatWeeksPattern || rep?.repeatWeeksPattern) {
        setRepeatWeeksPattern(parsed.repeatWeeksPattern || rep?.repeatWeeksPattern);
      }
      if (parsed.estimatedFare) setEstimatedFare(parsed.estimatedFare);
      if (parsed.returnEstimatedFare) setReturnEstimatedFare(parsed.returnEstimatedFare);
      if (parsed.manualFare !== undefined) setManualFare(parsed.manualFare);
      if (parsed.isFareOverridden !== undefined) setIsFareOverridden(parsed.isFareOverridden);
      if (parsed.provideFlightInfo !== undefined) setProvideFlightInfo(parsed.provideFlightInfo);
      if (parsed.airline !== undefined) setAirline(parsed.airline);
      if (parsed.flightNumber !== undefined) setFlightNumber(parsed.flightNumber);
      if (parsed.flightOrigin !== undefined) setFlightOrigin(parsed.flightOrigin);
      if (parsed.tailNumber !== undefined) setTailNumber(parsed.tailNumber);
      if (parsed.fboFacility !== undefined) setFboFacility(parsed.fboFacility);
      if (parsed.hasCheckedLuggage !== undefined) setHasCheckedLuggage(parsed.hasCheckedLuggage);
      if (parsed.returnProvideFlightInfo !== undefined) setReturnProvideFlightInfo(parsed.returnProvideFlightInfo);
      if (parsed.returnAirline !== undefined) setReturnAirline(parsed.returnAirline);
      if (parsed.returnFlightNumber !== undefined) setReturnFlightNumber(parsed.returnFlightNumber);
      if (parsed.returnFlightOrigin !== undefined) setReturnFlightOrigin(parsed.returnFlightOrigin);
      if (parsed.returnTailNumber !== undefined) setReturnTailNumber(parsed.returnTailNumber);
      if (parsed.returnFboFacility !== undefined) setReturnFboFacility(parsed.returnFboFacility);
      if (parsed.returnHasCheckedLuggage !== undefined) setReturnHasCheckedLuggage(parsed.returnHasCheckedLuggage);
    };

    if (initialTrip) {
      skipFirstEditQuoteRef.current = true;
      setTimingType(initialTrip.bookingType === 'scheduled' ? 'later' : 'asap');
      if (initialTrip.scheduledPickupTime) {
        try {
          const d = new Date(initialTrip.scheduledPickupTime);
          if (!isNaN(d.getTime())) {
            // Strictly local date + local time (fixes +24h CST/CDT evening edit bug!)
            setScheduledDate(formatLocalDateStr(d));
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            setScheduledTime(`${hh}:${mm}`);
          }
        } catch {}
      }

      setPickupAddress(initialTrip.pickupLocation?.address || '');
      setPickupCoordinates(initialTrip.pickupLocation?.coordinates);
      setPickupPlaceId(initialTrip.pickupLocation?.placeId);
      setDropoffAddress(initialTrip.dropoffLocation?.address || '');
      setDropoffCoordinates(initialTrip.dropoffLocation?.coordinates);
      setDropoffPlaceId(initialTrip.dropoffLocation?.placeId);

      if (initialTrip.intermediateStops && initialTrip.intermediateStops.length > 0) {
        setIntermediateStops(
          initialTrip.intermediateStops.map((s) => ({
            address: s.address,
            coordinates: s.coordinates,
            placeId: s.placeId,
          }))
        );
      }

      setPassengerName(
        `${initialTrip.passenger?.firstName || ''} ${initialTrip.passenger?.lastName || ''}`.trim()
      );
      setPhone(initialTrip.passenger?.phone || '');
      setEmail(initialTrip.passenger?.email || '');

      setPassengers(initialTrip.passenger?.passengerCount || 1);
      setBags(initialTrip.passenger?.luggageCount || 0);

      const meta = (initialTrip.metadata || {}) as Record<string, any>;

      // Hydrate oversized cargo, special requests, gate code & custom bookable extras
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
        setOversizedBags(cleanMap);
        setHasOversizedLuggage(totalOv > 0 || Boolean(meta.hasOversizedLuggage));
      } else if (typeof meta.oversizedBagsCount === 'number' && meta.oversizedBagsCount > 0) {
        const firstId = universalExtrasConfig?.oversizedBagsConfig?.[0]?.id || 'golf_bag';
        setOversizedBags({ [firstId]: meta.oversizedBagsCount });
        setHasOversizedLuggage(true);
      } else if (meta.hasOversizedLuggage || meta.oversizedItemsSummary) {
        const firstId = universalExtrasConfig?.oversizedBagsConfig?.[0]?.id || 'golf_bag';
        setOversizedBags({ [firstId]: 1 });
        setHasOversizedLuggage(true);
      }
      if (typeof meta.oversizedLuggageNotes === 'string' && meta.oversizedLuggageNotes) {
        setOversizedLuggageNotes(meta.oversizedLuggageNotes);
        setHasOversizedLuggage(true);
      }

      // Hydrate special requests toggles & gate code
      const srLower = (initialTrip.passenger?.specialRequests || '').toLowerCase();
      const hydratedSr = {
        petFriendly: srLower.includes('pet-friendly') || srLower.includes('pet friendly'),
        quietRide: srLower.includes('quiet ride'),
        musicOk: srLower.includes('music ok'),
      };
      setSpecialRequestFlags(hydratedSr);
      if (typeof meta.gateCode === 'string' && meta.gateCode.trim()) {
        setGateCode(meta.gateCode.trim());
        setShowSpecialRequests(true);
      } else if (Object.values(hydratedSr).some(Boolean)) {
        setShowSpecialRequests(true);
      }

      if (meta.selectedCustomExtras && typeof meta.selectedCustomExtras === 'object') {
        setSelectedCustomExtras(meta.selectedCustomExtras);
      }

      // Hydrate car seats from specialRequests / metadata
      const hasCarSeatReq = Boolean(
        initialTrip.passenger?.specialRequests?.toLowerCase().includes('car seat') ||
          (meta.carSeatsBreakdown &&
            ((meta.carSeatsBreakdown.rearFacing || 0) +
              (meta.carSeatsBreakdown.frontFacing || 0) +
              (meta.carSeatsBreakdown.booster || 0)) > 0)
      );
      setCarSeats(hasCarSeatReq);
      if (meta.carSeatsBreakdown) {
        setRearFacingCount(meta.carSeatsBreakdown.rearFacing || 0);
        setFrontFacingCount(meta.carSeatsBreakdown.frontFacing || 0);
        setBoosterCount(meta.carSeatsBreakdown.booster || 0);
      } else if (hasCarSeatReq) {
        setRearFacingCount(1);
      }

      // Hydrate vehicle preserving exact Admin custom vehicleTypeId
      let initialVehicles: VehicleChoice[] = ['any'];
      if (meta.selectedVehicles && Array.isArray(meta.selectedVehicles) && meta.selectedVehicles.length > 0) {
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
            initialVehicles.reduce((acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4), 0) < initialPax
          ) {
            initialVehicles.push(fallbackKey);
          }
        }
      }
      setSelectedVehicles(initialVehicles);

      // Hydrate payment
      if (initialTrip.payment?.method === 'card') setPaymentMethod('card');
      else if (initialTrip.payment?.method === 'corporate' || initialTrip.payment?.method === 'account') {
        setPaymentMethod('account');
      } else setPaymentMethod('cash');

      if (meta.contactPerson) {
        setIsBookerDifferent(true);
        setContactName(meta.contactPerson.contactName || '');
        setContactPhone(meta.contactPerson.contactPhone || '');
        setContactEmail(meta.contactPerson.contactEmail || '');
        setContactRole(meta.contactPerson.contactRole || 'Hotel Front Desk / Concierge');
      }

      if (meta.additionalPassengers && Array.isArray(meta.additionalPassengers)) {
        setAdditionalPassengers(meta.additionalPassengers);
      }

      if (meta.cardDetails) {
        setCardPaymentType(meta.cardDetails.cardPaymentType || 'terminal');
        setCardholderName(meta.cardDetails.cardholderName || '');
        if (meta.cardDetails.cardLast4) setCardNumber(String(meta.cardDetails.cardLast4).slice(-4));
        if (meta.cardDetails.cardExp) setCardExp(meta.cardDetails.cardExp);
      }

      if (meta.corporateDetails) {
        setCorporateAccount(meta.corporateDetails.corporateAccount || DEFAULT_CORPORATE_ACCOUNTS[0]);
        setBillingPo(meta.corporateDetails.billingPo || '');
        setAuthorizedBy(meta.corporateDetails.authorizedBy || '');
        setInvoicingTerms(meta.corporateDetails.invoicingTerms || 'Net 30 Direct Bill');
      } else if (meta.corporateOrgName) {
        setCorporateAccount(meta.corporateOrgName);
      }

      if (initialTrip.assignedDriverId) {
        setDriverId(initialTrip.assignedDriverId);
      }

      if (meta.pricingRuleId) setSelectedRuleId(meta.pricingRuleId);
      if (meta.tariff) setTariff(meta.tariff);
      if (meta.discount) setDiscount(meta.discount);
      if (meta.company) setCompany(meta.company);
      if (meta.internalNotes) setInternalNotes(meta.internalNotes);
      if (meta.waiveAirportFee !== undefined) setWaiveAirportFee(Boolean(meta.waiveAirportFee));
      if (meta.waiveMultiStopFees !== undefined) setWaiveMultiStopFees(Boolean(meta.waiveMultiStopFees));
      if (meta.bypassSurge !== undefined) setBypassSurge(Boolean(meta.bypassSurge));
      if (meta.manualDiscountDollars) setManualDiscountDollars(String(meta.manualDiscountDollars));

      if (initialTrip.driverNotes) {
        setNotesForAll(initialTrip.driverNotes);
      }

      if (initialTrip.pricing) {
        setOutboundPricing(initialTrip.pricing);
        if (initialTrip.pricing.totalFare) {
          setEstimatedFare(initialTrip.pricing.totalFare);
        }
        if (initialTrip.pricing.distanceMiles) {
          setEstimatedDistanceMiles(initialTrip.pricing.distanceMiles);
        }
        if (initialTrip.pricing.durationMinutes) {
          setEstimatedDurationMinutes(initialTrip.pricing.durationMinutes);
        }
      }

      // Hydrate flight & aviation info
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
      setProvideFlightInfo(hasFlightInfo);
      setAirline(meta.airline || meta.airlineName || (initialTrip as any).flightDetails?.airlineName || '');
      setFlightNumber(meta.flightNumber || (initialTrip as any).flightDetails?.flightNumber || '');
      setFlightOrigin(meta.flightOrigin || meta.departureAirport || (initialTrip as any).flightDetails?.departureAirport || '');
      setTailNumber(meta.tailNumber || (initialTrip as any).flightDetails?.tailNumber || '');
      setFboFacility(meta.fboFacility || (initialTrip as any).flightDetails?.fboFacility || '');
      setHasCheckedLuggage(Boolean(meta.hasCheckedLuggage || (initialTrip as any).flightDetails?.hasCheckedLuggage));

      // Hydrate return flight info if present
      const returnMeta = (meta.returnTripDetails || meta.returnFlightDetails || {}) as Record<string, any>;
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
      setReturnProvideFlightInfo(hasReturnFlightInfo);
      setReturnAirline(meta.returnAirline || returnMeta.airline || returnMeta.flightDetails?.airlineName || '');
      setReturnFlightNumber(meta.returnFlightNumber || returnMeta.flightNumber || returnMeta.flightDetails?.flightNumber || '');
      setReturnFlightOrigin(meta.returnFlightOrigin || returnMeta.flightOrigin || returnMeta.departureAirport || returnMeta.flightDetails?.departureAirport || '');
      setReturnTailNumber(meta.returnTailNumber || returnMeta.tailNumber || returnMeta.flightDetails?.tailNumber || '');
      setReturnFboFacility(meta.returnFboFacility || returnMeta.fboFacility || returnMeta.flightDetails?.fboFacility || '');
      setReturnHasCheckedLuggage(Boolean(meta.returnHasCheckedLuggage || returnMeta.hasCheckedLuggage || returnMeta.flightDetails?.hasCheckedLuggage));

      // Overlay any unsaved local edits for this specific Edit tab so a page reload never loses work
      try {
        const savedEdit = localStorage.getItem(draftStorageKey);
        if (savedEdit) {
          const parsed = JSON.parse(savedEdit);
          if (parsed && parsed._editTripId === initialTrip.id) {
            applySavedDraftOverlay(parsed);
            if (parsed._savedAt) setDraftSavedAt(parsed._savedAt);
          }
        }
      } catch {}
    } else {
      // Restore from localStorage draft
      try {
        const saved = localStorage.getItem(draftStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed) {
            applySavedDraftOverlay(parsed);
            if (parsed._savedAt) setDraftSavedAt(parsed._savedAt);
          }
        }
      } catch {}
    }

    // Flip hydration gate AFTER queueing all state restores so the save effect NEVER overwrites localStorage with blank defaults on mount!
    setHasHydratedDraft(true);
  }, [initialTrip?.id, draftStorageKey]);

  // Listen for POPULATE_BOOKING on workspaceBus to hydrate active draft with complete contact & trip data
  useEffect(() => {
    const bus = getWorkspaceBus();
    const unsub = bus.subscribe((msg) => {
      if (msg.type === 'POPULATE_BOOKING') {
        const payload = msg.payload as any;
        // Only populate if this draft is designated or if this is the active draft (or if no draft targeted)
        if (payload.targetDraftId && payload.targetDraftId !== draftId) {
          return;
        }
        if (resolvedIsActiveDraft === false && !payload.targetDraftId) {
          return;
        }

        if (payload.passengerName) setPassengerName(payload.passengerName);
        const contactPhone = payload.passengerPhone || payload.phone;
        if (contactPhone) setPhone(contactPhone);
        const contactEmail = payload.passengerEmail || payload.email;
        if (contactEmail) setEmail(contactEmail);

        if (payload.pickupAddress) {
          setPickupAddress(payload.pickupAddress);
          setPickupCoordinates(payload.pickupCoordinates);
          setPickupPlaceId(undefined);
        }
        if (payload.dropoffAddress) {
          setDropoffAddress(payload.dropoffAddress);
          setDropoffCoordinates(payload.dropoffCoordinates);
          setDropoffPlaceId(undefined);
        }
        if (payload.date) {
          setTimingType('later');
          setScheduledDate(payload.date);
        }
        if (payload.time) {
          setTimingType('later');
          setScheduledTime(payload.time);
        }

        if (payload.vehicleTier || payload.vehicle) {
          const v = String(payload.vehicleTier || payload.vehicle).toLowerCase();
          setSelectedVehicles([v as VehicleChoice]);
        }

        const acct = payload.corporateAccount || payload.corporateAccountName || payload.accountNumber;
        if (acct) {
          const matchedCorp = corporateAccountList.find(
            (c) => c.id === acct || c.accountNumber === acct || c.companyName.toLowerCase() === String(acct).toLowerCase()
          );
          setCorporateAccount(matchedCorp ? matchedCorp.companyName : acct);
          setPaymentMethod('account');
        }

        const po = payload.billingPo || payload.poNumber;
        if (po) {
          setBillingPo(po);
        }

        if (payload.notes) {
          setInternalNotes((prev) => {
            if (prev && prev.includes(payload.notes)) return prev;
            return prev ? `${prev}\n${payload.notes}` : payload.notes;
          });
        }

        if (payload.accessibilityNeeds) {
          let needsWheelchair = false;
          if (Array.isArray(payload.accessibilityNeeds)) {
            needsWheelchair = payload.accessibilityNeeds.some((n: string) =>
              n.toLowerCase().includes('wheelchair') || n.toLowerCase().includes('ramp')
            );
          } else if (typeof payload.accessibilityNeeds === 'object') {
            needsWheelchair = !!(payload.accessibilityNeeds as any).wheelchair;
          }
          if (needsWheelchair) {
            setSelectedVehicles(['wheelchair']);
          }
        }
      }
    });
    return unsub;
  }, [draftId, resolvedIsActiveDraft, corporateAccountList]);

  // When return trip is enabled, prefill return pickup with dropoff and return dropoff with pickup if empty
  useEffect(() => {
    if (returnTrip) {
      if (!returnPickupAddress && dropoffAddress) {
        setReturnPickupAddress(dropoffAddress);
        setReturnPickupCoordinates(dropoffCoordinates);
      }
      if (!returnDropoffAddress && pickupAddress) {
        setReturnDropoffAddress(pickupAddress);
        setReturnDropoffCoordinates(pickupCoordinates);
      }
      setReturnPassengers(passengers);
      setReturnBags(bags);
      setReturnVehicles(selectedVehicles);
    }
  }, [returnTrip]);

  // Persist draft (AND unsaved Edit-tab changes!) to localStorage & notify parent of values changes
  // Strictly gated by `hasHydratedDraft` so initial mount NEVER overwrites saved drafts with blank state!
  useEffect(() => {
    if (!hasHydratedDraft) return;

    const savedTimestamp = Date.now();
    const draftData = {
      _editTripId: isEditMode ? initialTrip?.id : undefined,
      _savedAt: savedTimestamp,
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
      bags,
      hasOversizedLuggage,
      oversizedBags,
      oversizedLuggageNotes,
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
      corporateAccount,
      billingPo,
      authorizedBy,
      invoicingTerms,
      sendEmailConfirmation,
      tariff,
      pricingRuleId: selectedRuleId,
      discount,
      manualDiscountDollars,
      waiveAirportFee,
      waiveMultiStopFees,
      bypassSurge,
      company,
      driverId,
      notesForAll,
      internalNotes,
      returnTrip,
      returnPickupAddress,
      returnPickupCoordinates,
      returnDropoffAddress,
      returnDropoffCoordinates,
      returnIntermediateStops,
      returnDate,
      returnTime,
      returnPassengers,
      returnBags,
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
      estimatedFare,
      returnEstimatedFare,
      manualFare,
      isFareOverridden,
      provideFlightInfo,
      airline,
      flightNumber,
      flightOrigin,
      tailNumber,
      fboFacility,
      hasCheckedLuggage,
      returnProvideFlightInfo,
      returnAirline,
      returnFlightNumber,
      returnFlightOrigin,
      returnTailNumber,
      returnFboFacility,
      returnHasCheckedLuggage,
    };

    try {
      const hasMeaningfulData = Boolean(
        isEditMode ||
          pickupAddress.trim() ||
          dropoffAddress.trim() ||
          passengerName.trim() ||
          phone.trim() ||
          email.trim() ||
          notesForAll.trim() ||
          internalNotes.trim() ||
          selectedVehicles.length > 1 ||
          intermediateStops.length > 0
      );
      if (hasMeaningfulData) {
        localStorage.setItem(draftStorageKey, JSON.stringify(draftData));
        setDraftSavedAt(savedTimestamp);
      } else {
        localStorage.removeItem(draftStorageKey);
        setDraftSavedAt(null);
      }
    } catch {}

    onValuesChangeRef.current?.({
      timingType,
      scheduledDate,
      scheduledTime,
      pickupAddress,
      pickupCoordinates,
      dropoffAddress,
      dropoffCoordinates,
      intermediateStops,
      passengerName,
      phone,
      email,
      additionalPassengers,
      contactPerson: {
        isBookerDifferent,
        contactName,
        contactPhone,
        contactEmail,
        contactRole,
      },
      passengers,
      bags,
      carSeats,
      carSeatsBreakdown: {
        rearFacing: rearFacingCount,
        frontFacing: frontFacingCount,
        booster: boosterCount,
      },
      selectedVehicles,
      vehicle: selectedVehicles[0] || 'sedan',
      paymentMethod,
      cardDetails: {
        cardPaymentType,
        cardholderName,
        cardNumber: cardNumber ? cardNumber.replace(/\D/g, '').slice(-4) : '',
        cardExp,
        cardCvc: '',
        saveCardOnFile,
      },
      corporateDetails: {
        corporateAccount,
        billingPo,
        authorizedBy,
        invoicingTerms,
      },
      tariff,
      pricingRuleId: selectedRuleId || undefined,
      pricingRuleName: availableNamedRules.find((r) => r.id === selectedRuleId)?.name,
      discount,
      company,
      driverId,
      notesForAll,
      internalNotes,
      returnDetails: {
        returnTrip,
        returnPickupAddress,
        returnPickupCoordinates,
        returnDropoffAddress,
        returnDropoffCoordinates,
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
        returnAirline,
        returnFlightNumber,
        returnFlightOrigin,
        returnTailNumber,
        returnFboFacility,
        returnHasCheckedLuggage,
      },
      repeatDetails: {
        repeat,
        repeatFrequency,
        repeatDays,
        repeatOccurrences,
        repeatUntilDate,
        repeatWeeksPattern,
        repeatsRoundTrip: returnTrip,
      },
      estimatedFare: returnTrip ? Math.max(Math.ceil(estimatedFare), Math.ceil(returnEstimatedFare || estimatedFare)) : Math.ceil(estimatedFare),
      returnEstimatedFare: returnTrip ? Math.max(Math.ceil(estimatedFare), Math.ceil(returnEstimatedFare || estimatedFare)) : Math.ceil(returnEstimatedFare),
      totalCalculatedFare: returnTrip 
        ? Math.max(Math.ceil(estimatedFare), Math.ceil(returnEstimatedFare || estimatedFare)) * 2 
        : Math.ceil(estimatedFare),
      manualFare,
      isFareOverridden,
      estimatedDurationMinutes,
      estimatedDistanceMiles,
      provideFlightInfo,
      airline,
      flightNumber,
      flightOrigin,
      tailNumber,
      fboFacility,
      hasCheckedLuggage,
    });
  }, [
    hasHydratedDraft,
    draftStorageKey,
    isEditMode,
    initialTrip?.id,
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
    bags,
    hasOversizedLuggage,
    oversizedBags,
    oversizedLuggageNotes,
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
    cardCvc,
    saveCardOnFile,
    corporateAccount,
    billingPo,
    authorizedBy,
    invoicingTerms,
    sendEmailConfirmation,
    tariff,
    selectedRuleId,
    discount,
    manualDiscountDollars,
    waiveAirportFee,
    waiveMultiStopFees,
    bypassSurge,
    company,
    driverId,
    notesForAll,
    internalNotes,
    returnTrip,
    returnPickupAddress,
    returnPickupCoordinates,
    returnDropoffAddress,
    returnDropoffCoordinates,
    returnIntermediateStops,
    returnDate,
    returnTime,
    returnPassengers,
    returnBags,
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
    estimatedFare,
    returnEstimatedFare,
    returnEstimatedDurationMinutes,
    returnEstimatedDistanceMiles,
    manualFare,
    isFareOverridden,
    estimatedDurationMinutes,
    estimatedDistanceMiles,
    provideFlightInfo,
    airline,
    flightNumber,
    flightOrigin,
    tailNumber,
    fboFacility,
    hasCheckedLuggage,
    returnProvideFlightInfo,
    returnAirline,
    returnFlightNumber,
    returnFlightOrigin,
    returnTailNumber,
    returnFboFacility,
    returnHasCheckedLuggage,
  ]);

  // Matched corporate account & resolved pricing discount inputs
  const matchedCorporateAccount = useMemo(() => {
    if (paymentMethod !== 'account') return null;
    return (
      corporateAccountList.find(
        (c) =>
          c.companyName === corporateAccount ||
          c.id === corporateAccount ||
          c.accountNumber === corporateAccount
      ) || null
    );
  }, [paymentMethod, corporateAccountList, corporateAccount]);

  const effectiveDiscountInputs = useMemo(() => {
    const parsedDropdownPct =
      discount && discount !== 'None' ? parseFloat(discount.replace('%', '')) || 0 : 0;
    const corpPct = matchedCorporateAccount?.discountPercent || 0;
    const pct = parsedDropdownPct > 0 ? parsedDropdownPct : corpPct;
    const label =
      parsedDropdownPct > 0
        ? `Courtesy Discount (${parsedDropdownPct}%)`
        : corpPct > 0
        ? `${matchedCorporateAccount?.companyName || 'Corporate'} Discount (${corpPct}%)`
        : undefined;
    const flatDollars = manualDiscountDollars ? Math.max(0, parseFloat(manualDiscountDollars) || 0) : 0;
    return { pct, label, flatDollars };
  }, [discount, matchedCorporateAccount, manualDiscountDollars]);

  const activeAdminVehicleIds = useMemo(() => {
    const ids = new Set<string>(['standard']);
    dispatchVehicleOptions.forEach((opt) => {
      if (opt.key && opt.key !== 'any') ids.add(String(opt.key));
    });
    return Array.from(ids);
  }, [dispatchVehicleOptions]);

  const oversizedCategories = useMemo(() => {
    if (universalExtrasConfig?.oversizedBagsConfig && universalExtrasConfig.oversizedBagsConfig.length > 0) {
      return universalExtrasConfig.oversizedBagsConfig;
    }
    return DEFAULT_OVERSIZED_BAG_CATEGORIES;
  }, [universalExtrasConfig]);

  const totalOversizedCount = useMemo(
    () => Object.values(oversizedBags || {}).reduce((sum, count) => sum + (Number(count) || 0), 0),
    [oversizedBags]
  );

  const oversizedBagsPayload = useMemo<Record<string, number> | undefined>(() => {
    if (!hasOversizedLuggage || totalOversizedCount <= 0) return undefined;
    const cleaned: Record<string, number> = {};
    for (const [id, count] of Object.entries(oversizedBags || {})) {
      if (count > 0) cleaned[id] = count;
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }, [hasOversizedLuggage, oversizedBags, totalOversizedCount]);

  const oversizedItemsSummary = useMemo(() => {
    if (!hasOversizedLuggage) return undefined;
    const parts = Object.entries(oversizedBags || {})
      .filter(([, count]) => count > 0)
      .map(([id, count]) => {
        const cat = oversizedCategories.find((c) => c.id === id);
        return `${count}x ${cat?.label || id}`;
      });
    if (oversizedLuggageNotes.trim()) {
      parts.push(oversizedLuggageNotes.trim());
    }
    return parts.length > 0 ? parts.join(', ') : undefined;
  }, [hasOversizedLuggage, oversizedBags, oversizedCategories, oversizedLuggageNotes]);

  // Instant zero-latency inline caller lookup (ContactService + loaded dispatch trips)
  const callerSuggestions = useMemo(() => {
    const qName = passengerName.trim().toLowerCase();
    const qPhoneDigits = normalizePhone(phone);
    if (!showCallerSuggestions) return [];
    if (qName.length < 2 && qPhoneDigits.length < 3) return [];

    type CallerCandidate = {
      key: string;
      name: string;
      phone: string;
      email: string;
      corporateAccount?: string;
      defaultPo?: string;
      isVip?: boolean;
      isBlacklisted?: boolean;
      tripCount: number;
      addresses: string[];
    };

    const byKey = new Map<string, CallerCandidate>();

    // 1. ContactService records
    try {
      const contacts = getContactService().getAllContacts();
      for (const c of contacts) {
        if (c.isArchived) continue;
        const cDigits = normalizePhone(c.phone);
        const cName = (c.name || '').toLowerCase();
        const matches =
          (qPhoneDigits.length >= 3 && cDigits.includes(qPhoneDigits)) ||
          (qName.length >= 2 && cName.includes(qName));
        if (!matches) continue;
        const k = cDigits || cName;
        const addrs = [c.homeAddress, c.workAddress].filter((a): a is string => Boolean(a && a.trim()));
        byKey.set(k, {
          key: k,
          name: c.name,
          phone: c.phone,
          email: c.email || '',
          corporateAccount: c.corporateAccountName || c.corporateAccountId,
          defaultPo: c.defaultPoNumber,
          isVip: c.isVip,
          isBlacklisted: c.isBlacklisted,
          tripCount: c.tripCount || 0,
          addresses: addrs,
        });
      }
    } catch {}

    // 2. Historical dispatch trips already in memory
    for (const t of lookupTrips) {
      const fullName = `${t.passenger?.firstName || ''} ${t.passenger?.lastName || ''}`.trim();
      const tPhone = t.passenger?.phone || '';
      const tDigits = normalizePhone(tPhone);
      if (!fullName && !tDigits) continue;
      const matches =
        (qPhoneDigits.length >= 3 && tDigits.includes(qPhoneDigits)) ||
        (qName.length >= 2 && fullName.toLowerCase().includes(qName));
      if (!matches) continue;

      const k = tDigits || fullName.toLowerCase();
      const existing = byKey.get(k);
      const tripAddrs = [t.pickupLocation?.address, t.dropoffLocation?.address].filter(
        (a): a is string => Boolean(a && a.trim())
      );
      if (existing) {
        existing.tripCount += 1;
        for (const addr of tripAddrs) {
          if (!existing.addresses.includes(addr) && existing.addresses.length < 4) {
            existing.addresses.push(addr);
          }
        }
        if (!existing.email && t.passenger?.email) existing.email = t.passenger.email;
      } else {
        const meta = (t.metadata || {}) as Record<string, any>;
        byKey.set(k, {
          key: k,
          name: fullName || tPhone,
          phone: tPhone,
          email: t.passenger?.email || '',
          corporateAccount: meta.corporateDetails?.corporateAccount || meta.corporateOrgName,
          defaultPo: meta.corporateDetails?.billingPo,
          isVip: Boolean(meta.vipStatus),
          tripCount: 1,
          addresses: tripAddrs.slice(0, 3),
        });
      }
    }

    return Array.from(byKey.values())
      .sort((a, b) => (b.isVip ? 1 : 0) - (a.isVip ? 1 : 0) || b.tripCount - a.tripCount)
      .slice(0, 6);
  }, [showCallerSuggestions, passengerName, phone, lookupTrips]);

  const handleApplyCallerCandidate = (candidate: (typeof callerSuggestions)[number]) => {
    if (candidate.name) setPassengerName(candidate.name);
    if (candidate.phone) setPhone(candidate.phone);
    if (candidate.email) setEmail(candidate.email);
    if (candidate.corporateAccount) {
      const matched = corporateAccountList.find(
        (c) =>
          c.id === candidate.corporateAccount ||
          c.accountNumber === candidate.corporateAccount ||
          c.companyName.toLowerCase() === candidate.corporateAccount!.toLowerCase()
      );
      setCorporateAccount(matched ? matched.companyName : candidate.corporateAccount);
      setPaymentMethod('account');
    }
    if (candidate.defaultPo) setBillingPo(candidate.defaultPo);
    setCallerQuickAddresses(candidate.addresses);
    setShowCallerSuggestions(false);
  };

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

    // Do not overwrite an existing trip's saved fare on initial Edit Mode mount
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
        const perVehiclePax =
          vehicleCount > 1 ? Math.ceil(passengers / vehicleCount) : passengers;

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
            // Multi-vehicle: sum each selected vehicle's true engine quote cleanly
            // without duplicating car seats or custom extras N times
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
    availableNamedRules,
    universalExtrasConfig,
    surchargesVersion,
    returnAirportDetection.isPickupAirport,
    returnAirportDetection.isDropoffAirport,
    returnAirportDetection.isAirportTrip,
  ]);

  // Swap outbound route
  const handleSwapRoute = () => {
    const tmpAddr = pickupAddress;
    const tmpCoords = pickupCoordinates;
    const tmpPid = pickupPlaceId;
    setPickupAddress(dropoffAddress);
    setPickupCoordinates(dropoffCoordinates);
    setPickupPlaceId(dropoffPlaceId);
    setDropoffAddress(tmpAddr);
    setDropoffCoordinates(tmpCoords);
    setDropoffPlaceId(tmpPid);
  };

  // Swap return route
  const handleSwapReturnRoute = () => {
    const currentReturnPickup = returnPickupAddress || dropoffAddress;
    const currentReturnDropoff = returnDropoffAddress || pickupAddress;
    const currentReturnPickupCoords = returnPickupCoordinates || dropoffCoordinates;
    const currentReturnDropoffCoords = returnDropoffCoordinates || pickupCoordinates;
    const currentReturnPickupPid = returnPickupPlaceId || dropoffPlaceId;
    const currentReturnDropoffPid = returnDropoffPlaceId || pickupPlaceId;

    setReturnPickupAddress(currentReturnDropoff);
    setReturnPickupCoordinates(currentReturnDropoffCoords);
    setReturnPickupPlaceId(currentReturnDropoffPid);
    setReturnDropoffAddress(currentReturnPickup);
    setReturnDropoffCoordinates(currentReturnPickupCoords);
    setReturnDropoffPlaceId(currentReturnPickupPid);
  };

  // Passenger increment with dynamic Admin vehicle tier auto-upgrade
  const handleIncrementPassengers = () => {
    const nextPax = passengers + 1;
    if (nextPax > totalMaxPassengers) {
      if (selectedVehicles.length === 1) {
        const nextFit = [...dispatchVehicleOptions]
          .filter((o) => o.key !== 'any' && o.maxPassengers >= nextPax)
          .sort((a, b) => a.maxPassengers - b.maxPassengers)[0];
        if (nextFit) {
          setSelectedVehicles([nextFit.key]);
        } else {
          setSelectedVehicles([...selectedVehicles, 'any']);
        }
      } else {
        setSelectedVehicles([...selectedVehicles, 'any']);
      }
    }
    setPassengers(nextPax);
  };

  const handleDecrementPassengers = () => {
    setPassengers((p) => Math.max(1, p - 1));
  };

  // Add extra passenger with auto-upgrade
  const handleAddPassenger = () => {
    setAdditionalPassengers([...additionalPassengers, { name: '', phone: '' }]);
    handleIncrementPassengers();
  };

  const handleRemovePassenger = (index: number) => {
    setAdditionalPassengers(additionalPassengers.filter((_, i) => i !== index));
    setPassengers((p) => Math.max(1, p - 1));
  };

  // Vehicle management
  const handleAddVehicle = () => {
    setSelectedVehicles([...selectedVehicles, 'any']);
  };

  const handleRemoveVehicle = (index: number) => {
    if (selectedVehicles.length <= 1) return;
    const updated = selectedVehicles.filter((_, i) => i !== index);
    setSelectedVehicles(updated);
  };

  const handleUpdateVehicleChoice = (index: number, choice: VehicleChoice) => {
    const updated = [...selectedVehicles];
    updated[index] = choice;
    const simCap = updated.reduce((acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4), 0);
    if (simCap < passengers) {
      return;
    }
    setSelectedVehicles(updated);
  };

  // Return vehicles management
  const handleAddReturnVehicle = () => {
    setReturnVehicles([...returnVehicles, 'any']);
  };

  const handleRemoveReturnVehicle = (index: number) => {
    if (returnVehicles.length <= 1) return;
    setReturnVehicles(returnVehicles.filter((_, i) => i !== index));
  };

  const handleUpdateReturnVehicle = (index: number, choice: VehicleChoice) => {
    const updated = [...returnVehicles];
    updated[index] = choice;
    const simCap = updated.reduce((acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4), 0);
    if (simCap < returnPassengers) {
      return;
    }
    setReturnVehicles(updated);
  };

  // Toggle Car Seats master switch
  const handleToggleCarSeats = (checked: boolean) => {
    setCarSeats(checked);
    if (checked) {
      if (rearFacingCount === 0 && frontFacingCount === 0 && boosterCount === 0) {
        setRearFacingCount(1);
      }
    } else {
      setRearFacingCount(0);
      setFrontFacingCount(0);
      setBoosterCount(0);
    }
  };

  // Toggle Return Car Seats master switch
  const handleToggleReturnCarSeats = (checked: boolean) => {
    setReturnCarSeats(checked);
    if (checked) {
      if (returnRearFacing === 0 && returnFrontFacing === 0 && returnBooster === 0) {
        setReturnRearFacing(1);
      }
    } else {
      setReturnRearFacing(0);
      setReturnFrontFacing(0);
      setReturnBooster(0);
    }
  };

  // Toggle Repeat Day
  const handleToggleRepeatDay = (day: string) => {
    if (repeatDays.includes(day)) {
      setRepeatDays(repeatDays.filter((d) => d !== day));
    } else {
      setRepeatDays([...repeatDays, day]);
    }
  };

  // Clear Form
  const handleClear = () => {
    setPickupAddress('');
    setPickupCoordinates(undefined);
    setDropoffAddress('');
    setDropoffCoordinates(undefined);
    setIntermediateStops([]);
    setPassengerName('');
    setPhone('');
    setEmail('');
    setAdditionalPassengers([]);
    setIsBookerDifferent(false);
    setContactName('');
    setContactPhone('');
    setContactEmail('');
    setPassengers(1);
    setBags(0);
    setCarSeats(false);
    setRearFacingCount(0);
    setFrontFacingCount(0);
    setBoosterCount(0);
    setHasOversizedLuggage(false);
    setOversizedBags({});
    setOversizedLuggageNotes('');
    setSelectedCustomExtras({});
    setShowSpecialRequests(false);
    setSpecialRequestFlags({ petFriendly: false, quietRide: false, musicOk: false });
    setGateCode('');
    setSelectedVehicles(['any']);
    setPaymentMethod('cash');
    setCardPaymentType('terminal');
    setCardholderName('');
    setCardNumber('');
    setCardExp('');
    setCardCvc('');
    setCorporateAccount(DEFAULT_CORPORATE_ACCOUNTS[0]);
    setBillingPo('');
    setAuthorizedBy('');
    setTariff('Standard');
    setSelectedRuleId('');
    setDiscount('None');
    setDriverId('unassigned');
    setNotesForAll('');
    setInternalNotes('');
    setReturnTrip(false);
    setReturnPickupAddress('');
    setReturnDropoffAddress('');
    setReturnIntermediateStops([]);
    setReturnCarSeats(false);
    setReturnRearFacing(0);
    setReturnFrontFacing(0);
    setReturnBooster(0);
    setReturnVehicles(['any']);
    setRepeat(false);
    setEstimatedFare(0);
    setReturnEstimatedFare(0);
    setReturnEstimatedDurationMinutes(0);
    setReturnEstimatedDistanceMiles(0);
    setManualFare('');
    setIsFareOverridden(false);
    setEstimatedDurationMinutes(0);
    setEstimatedDistanceMiles(0);
    setProvideFlightInfo(false);
    setAirline('');
    setFlightNumber('');
    setFlightOrigin('');
    setTailNumber('');
    setFboFacility('');
    setHasCheckedLuggage(false);
    setReturnProvideFlightInfo(false);
    setReturnAirline('');
    setReturnFlightNumber('');
    setReturnFlightOrigin('');
    setReturnTailNumber('');
    setReturnFboFacility('');
    setReturnHasCheckedLuggage(false);
    setSubmitError(null);

    try {
      localStorage.removeItem(draftStorageKey);
    } catch {}

    onClearDraft?.();
  };

  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  const handleConfirmClear = () => {
    setIsClearModalOpen(true);
  };

  // Copy current booking data into a new draft tab
  const handleCopyBooking = () => {
    const copiedValues: DispatchFormValues = {
      timingType,
      scheduledDate,
      scheduledTime,
      pickupAddress,
      pickupCoordinates,
      dropoffAddress,
      dropoffCoordinates,
      intermediateStops,
      passengerName,
      phone,
      email,
      additionalPassengers,
      contactPerson: {
        isBookerDifferent,
        contactName,
        contactPhone,
        contactEmail,
        contactRole,
      },
      passengers,
      bags,
      carSeats,
      carSeatsBreakdown: {
        rearFacing: rearFacingCount,
        frontFacing: frontFacingCount,
        booster: boosterCount,
      },
      selectedVehicles,
      vehicle: selectedVehicles[0] || 'sedan',
      paymentMethod,
      cardDetails: {
        cardPaymentType,
        cardholderName,
        cardNumber: cardNumber ? cardNumber.replace(/\D/g, '').slice(-4) : '',
        cardExp,
        cardCvc: '',
        saveCardOnFile,
      },
      corporateDetails: {
        corporateAccount,
        billingPo,
        authorizedBy,
        invoicingTerms,
      },
      tariff,
      pricingRuleId: selectedRuleId || undefined,
      discount,
      company,
      driverId: 'unassigned',
      notesForAll,
      internalNotes,
      returnDetails: {
        returnTrip,
        returnPickupAddress,
        returnPickupCoordinates,
        returnDropoffAddress,
        returnDropoffCoordinates,
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
        returnAirline,
        returnFlightNumber,
        returnFlightOrigin,
        returnTailNumber,
        returnFboFacility,
        returnHasCheckedLuggage,
      },
      repeatDetails: {
        repeat,
        repeatFrequency: repeatFrequency as any,
        repeatDays,
        repeatOccurrences,
        repeatUntilDate,
        repeatWeeksPattern: 'all',
        repeatsRoundTrip: returnTrip,
      },
      estimatedFare: returnTrip ? Math.max(Math.ceil(estimatedFare), Math.ceil(returnEstimatedFare || estimatedFare)) : Math.ceil(estimatedFare),
      returnEstimatedFare: returnTrip ? Math.max(Math.ceil(estimatedFare), Math.ceil(returnEstimatedFare || estimatedFare)) : Math.ceil(returnEstimatedFare),
      totalCalculatedFare: returnTrip 
        ? Math.max(Math.ceil(estimatedFare), Math.ceil(returnEstimatedFare || estimatedFare)) * 2 
        : Math.ceil(estimatedFare),
      manualFare,
      isFareOverridden,
      estimatedDurationMinutes,
      estimatedDistanceMiles,
      provideFlightInfo,
      airline,
      flightNumber,
      flightOrigin,
      tailNumber,
      fboFacility,
      hasCheckedLuggage,
    };

    if (onCopyBooking) {
      onCopyBooking(copiedValues);
    } else if (onCloneBooking) {
      onCloneBooking(copiedValues);
    }
  };

  const handleCloneBooking = handleCopyBooking;

  // Submit Booking (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const selectedCorp = corporateAccountList.find(
        (c) => c.companyName === corporateAccount || c.id === corporateAccount || c.accountNumber === corporateAccount
      );
      if (selectedCorp) {
        if (selectedCorp.isActive === false) {
          setSubmitError(
            `Corporate account "${selectedCorp.companyName}" is currently PAUSED / INACTIVE and cannot accept new direct-bill rides.`
          );
          return;
        }
        const poCheck = getCorporateAccountService().validateCorporatePo(selectedCorp, billingPo);
        if (poCheck.status === 'expired_revoked') {
          setSubmitError(
            `FRAUD ALERT: The PO number "${billingPo}" was revoked/rotated on ${
              poCheck.revokedRecord?.rotatedAt ? poCheck.revokedRecord.rotatedAt.slice(0, 10) : 'previously'
            }. Corporate booking cannot proceed with a revoked PO.`
          );
          return;
        }
        if (selectedCorp.poRequired && !billingPo.trim()) {
          setSubmitError(`PO Number is strictly required for corporate client "${selectedCorp.companyName}".`);
          return;
        }
        if (selectedCorp.poRequired && poCheck.status === 'mismatch' && !allowPoOverride) {
          setSubmitError(
            `PO MISMATCH BLOCK: "${billingPo}" does not match the active authorized PO (${selectedCorp.currentPoNumber || 'N/A'}) for "${selectedCorp.companyName}". Verify PO or check Supervisor Override below.`
          );
          return;
        }
        // Check corporate credit limit against live open AR balance
        if (selectedCorp.creditLimit > 0) {
          try {
            const invService = getInvoicingService();
            const openBalance = invService.getCorporateAccountBalance
              ? await invService.getCorporateAccountBalance(selectedCorp.id)
              : 0;
            const projectedFare = isFareOverridden && manualFare
              ? Math.max(0, Math.ceil(parseFloat(manualFare) || 0))
              : returnTrip
              ? Math.ceil(estimatedFare) + Math.ceil(returnEstimatedFare || estimatedFare)
              : Math.ceil(estimatedFare);
            if (openBalance + projectedFare > selectedCorp.creditLimit) {
              setSubmitError(
                `CREDIT LIMIT EXCEEDED: "${selectedCorp.companyName}" open AR ($${openBalance.toFixed(2)}) + this booking ($${projectedFare.toFixed(2)}) exceeds the $${selectedCorp.creditLimit.toLocaleString()} limit.`
              );
              return;
            }
          } catch {
            // Non-blocking if offline
          }
        }
      }
    }

    setIsSubmitting(true);
    const service = getBookingService();

    const primaryVehicle = selectedVehicles[0] || 'any';
    const tier: VehicleTier = resolveVehicleEngineId(primaryVehicle, activeAdminVehicleIds);
    const primaryVehicleOpt = dispatchVehicleOptions.find(
      (o) => o.key === primaryVehicle || o.key === tier
    );
    const primaryVehicleDisplayName =
      primaryVehicle === 'any'
        ? 'Any'
        : primaryVehicleOpt?.label || String(tier);

    let method: PaymentMethod = 'cash';
    if (paymentMethod === 'card') method = 'card';
    if (paymentMethod === 'account') method = 'corporate';

    // Symmetric check: only equalize outbound/return when both legs match in route, stops, vehicles & pax
    const retPickupResolved = (returnPickupAddress.trim() || dropoffAddress.trim()).toLowerCase();
    const retDropoffResolved = (returnDropoffAddress.trim() || pickupAddress.trim()).toLowerCase();
    const isSymmetricRoundTrip =
      returnTrip &&
      retPickupResolved === dropoffAddress.trim().toLowerCase() &&
      retDropoffResolved === pickupAddress.trim().toLowerCase() &&
      returnIntermediateStops.length === intermediateStops.length &&
      returnPassengers === passengers &&
      JSON.stringify(returnVehicles) === JSON.stringify(selectedVehicles);

    let outboundFare = Math.ceil(estimatedFare);
    let returnLegFare = Math.ceil(returnEstimatedFare || estimatedFare);

    if (isFareOverridden && manualFare) {
      const overrideVal = Math.max(0, Math.ceil(parseFloat(manualFare) || 0));
      if (returnTrip && autoCreateReturnTrip) {
        // Override applies to combined round-trip total — split cleanly across legs (NEVER double!)
        outboundFare = Math.ceil(overrideVal / 2);
        returnLegFare = Math.max(0, overrideVal - outboundFare);
      } else {
        outboundFare = overrideVal;
      }
    } else if (returnTrip && isSymmetricRoundTrip) {
      const balancedFare = Math.max(outboundFare, returnLegFare);
      outboundFare = balancedFare;
      returnLegFare = balancedFare;
    }

    const finalFare = outboundFare;
    const totalCalculatedFare = returnTrip ? outboundFare + returnLegFare : outboundFare;

    const buildPersistedPricing = (
      enginePricing: TripPricing | null,
      targetFare: number,
      distMiles: number,
      durMins: number,
      overridden: boolean
    ): TripPricing => {
      if (overridden) {
        return {
          ...(enginePricing || {
            baseFare: targetFare,
            distanceMiles: distMiles,
            durationMinutes: durMins,
            distanceRate: 0,
            timeRate: 0,
            vehicleMultiplier: 1,
            surgeMultiplier: 1,
            discountAmount: 0,
            subtotal: targetFare,
            totalFare: targetFare,
            currency: 'USD',
          }),
          distanceMiles: distMiles || enginePricing?.distanceMiles || 0,
          durationMinutes: durMins || enginePricing?.durationMinutes || 0,
          subtotal: targetFare,
          totalFare: targetFare,
          manualAdjustment: enginePricing ? Number((targetFare - enginePricing.totalFare).toFixed(2)) : 0,
          breakdown: [
            {
              id: 'base-fare',
              category: 'base',
              label: 'Base Fare',
              detail: 'Dispatcher agreed rate',
              amount: targetFare,
              sourceType: 'rule',
            },
          ],
          currency: 'USD',
        };
      }

      if (enginePricing) {
        const diff = Number((targetFare - enginePricing.totalFare).toFixed(2));
        const adjustedBreakdown =
          Math.abs(diff) > 0.005 && enginePricing.breakdown && enginePricing.breakdown.length > 0
            ? [
                ...enginePricing.breakdown,
                {
                  id: 'round-trip-balance',
                  category: 'rounding' as const,
                  label: 'Round-Trip Balance Adjustment',
                  amount: diff,
                  sourceType: 'rounding' as const,
                },
              ]
            : enginePricing.breakdown;
        return {
          ...enginePricing,
          distanceMiles: distMiles || enginePricing.distanceMiles,
          durationMinutes: durMins || enginePricing.durationMinutes,
          totalFare: targetFare,
          breakdown: adjustedBreakdown,
          currency: enginePricing.currency || 'USD',
        };
      }

      return {
        baseFare: targetFare,
        tariffBaseSubtotal: targetFare,
        distanceMiles: distMiles,
        durationMinutes: durMins,
        distanceRate: 0,
        timeRate: 0,
        vehicleMultiplier: 1.0,
        surgeMultiplier: 1.0,
        discountAmount: 0,
        subtotal: targetFare,
        totalFare: targetFare,
        currency: 'USD',
        breakdown: [
          {
            id: 'base-fare',
            category: 'base',
            label: 'Base Fare',
            amount: targetFare,
            sourceType: 'tariff',
          },
        ],
      };
    };

    const persistedOutboundPricing = buildPersistedPricing(
      outboundPricing,
      finalFare,
      estimatedDistanceMiles,
      estimatedDurationMinutes,
      Boolean(isFareOverridden && manualFare)
    );

    const customExtrasSummaryParts: string[] = [];
    for (const [extraId, qty] of Object.entries(selectedCustomExtras || {})) {
      if (!qty || qty <= 0) continue;
      const def = universalExtrasConfig?.customExtras?.find((e) => e.id === extraId);
      customExtrasSummaryParts.push(`${qty}x ${def?.name || extraId}`);
    }
    const customExtrasSummary =
      customExtrasSummaryParts.length > 0 ? customExtrasSummaryParts.join(', ') : undefined;

    const names = passengerName.trim().split(/\s+/);
    const firstName = names[0] || 'Guest';
    const lastName = names.slice(1).join(' ') || 'Passenger';

    let scheduledPickupTime: string | undefined = undefined;
    if (timingType === 'later' && scheduledDate && scheduledTime) {
      scheduledPickupTime = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
    }

    const carSeatSummaryParts = [
      rearFacingCount > 0 ? `${rearFacingCount} Rear-Facing` : null,
      frontFacingCount > 0 ? `${frontFacingCount} Front-Facing` : null,
      boosterCount > 0 ? `${boosterCount} Booster` : null,
    ].filter(Boolean);

    const activeSpecialRequestLabels = [
      specialRequestFlags.petFriendly ? 'Pet-Friendly' : null,
      specialRequestFlags.quietRide ? 'Quiet Ride' : null,
      specialRequestFlags.musicOk ? 'Music OK' : null,
    ].filter(Boolean) as string[];

    const specialRequestSections = [
      activeSpecialRequestLabels.length > 0 ? activeSpecialRequestLabels.join(', ') : null,
      carSeats && carSeatSummaryParts.length > 0 ? `Car Seats: ${carSeatSummaryParts.join(', ')}` : null,
    ].filter(Boolean);

    const specialRequests =
      specialRequestSections.length > 0 ? specialRequestSections.join(' · ') : undefined;

    let outboundFlightNotes = '';
    if (provideFlightInfo) {
      if (airportDetection.isPrivateAviation) {
        if (tailNumber || fboFacility) {
          outboundFlightNotes = `[Private Aviation: Tail #${tailNumber || 'N/A'}, FBO: ${fboFacility || 'N/A'}${hasCheckedLuggage ? ' (Checked Luggage)' : ''}]`;
        }
      } else {
        if (airline || flightNumber) {
          outboundFlightNotes = `[Flight: ${airline || 'N/A'} #${flightNumber || 'N/A'}${flightOrigin ? ` from ${flightOrigin}` : ''}${hasCheckedLuggage ? ' (Checked Luggage)' : ''}]`;
        }
      }
    }

    let returnLegFlightNotes = '';
    if (returnProvideFlightInfo) {
      if (returnAirportDetection.isPrivateAviation) {
        if (returnTailNumber || returnFboFacility) {
          returnLegFlightNotes = `[Return Private Aviation: Tail #${returnTailNumber || 'N/A'}, FBO: ${returnFboFacility || 'N/A'}${returnHasCheckedLuggage ? ' (Checked Luggage)' : ''}]`;
        }
      } else {
        if (returnAirline || returnFlightNumber) {
          returnLegFlightNotes = `[Return Flight: ${returnAirline || 'N/A'} #${returnFlightNumber || 'N/A'}${returnFlightOrigin ? ` from ${returnFlightOrigin}` : ''}${returnHasCheckedLuggage ? ' (Checked Luggage)' : ''}]`;
        }
      }
    }

    const metadataPayload = {
      company,
      internalNotes,
      tariff,
      pricingRuleId: selectedRuleId || undefined,
      pricingRuleName: availableNamedRules.find((r) => r.id === selectedRuleId)?.name || undefined,
      discount,
      manualDiscountDollars: manualDiscountDollars ? parseFloat(manualDiscountDollars) || undefined : undefined,
      waiveAirportFee,
      waiveMultiStopFees,
      bypassSurge,
      vehicleTypeId: primaryVehicle === 'any' ? 'any' : String(tier),
      vehicleDisplayName: primaryVehicleDisplayName,
      vehiclePreference: primaryVehicle,
      oversizedBagsCount: hasOversizedLuggage ? totalOversizedCount : 0,
      oversizedBags: oversizedBagsPayload,
      hasOversizedLuggage:
        hasOversizedLuggage && (totalOversizedCount > 0 || Boolean(oversizedLuggageNotes.trim())),
      oversizedLuggageNotes:
        hasOversizedLuggage && oversizedLuggageNotes.trim() ? oversizedLuggageNotes.trim() : undefined,
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
              invoicingTerms,
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

    try {
      const resolveDisplayNameForChoice = (choice: string, resolvedTier: string) => {
        if (choice === 'any') return 'Any';
        const opt = dispatchVehicleOptions.find((o) => o.key === choice || o.key === resolvedTier);
        return opt?.label || String(resolvedTier);
      };

      const selectedDriverInfo =
        driverId !== 'unassigned'
          ? driverOptions.find((d) => d.id === driverId)
          : undefined;

      if (isEditMode && initialTrip) {
        const shouldSplitIntoMultiCar =
          !isCompleted &&
          !isCancelled &&
          !initialTrip.multiCarGroupId &&
          selectedVehicles.length > 1;

        if (shouldSplitIntoMultiCar) {
          // Splitting an existing unsplit trip into N separate linked multi-car trips:
          // Car 1 updates `initialTrip` in place; Cars 2..N are created as linked sibling trips!
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
                ? intermediateStops.map((s) => ({ address: s.address, coordinates: s.coordinates, placeId: s.placeId }))
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
            assignedDriverId: driverId === 'unassigned' ? null : driverId,
            status:
              driverId !== 'unassigned' && initialTrip.status === 'pending'
                ? 'assigned'
                : initialTrip.status,
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
              ...(selectedDriverInfo
                ? {
                    assignedDriverName: selectedDriverInfo.name,
                    assignedDriverPhone: selectedDriverInfo.phone,
                  }
                : {}),
            },
          };

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
                  ? intermediateStops.map((s) => ({ address: s.address, coordinates: s.coordinates, placeId: s.placeId }))
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
              idx === 0 && selectedDriverInfo
                ? {
                    driverId: selectedDriverInfo.id,
                    driverName: selectedDriverInfo.name,
                    driverPhone: selectedDriverInfo.phone,
                    vehicleUnit: selectedDriverInfo.cabNumber
                      ? `Cab #${selectedDriverInfo.cabNumber}`
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
              convoyTrips.map((t) =>
                service.updateTrip!(t.id, {
                  multiCarTripIds: allTripIds,
                  multiCarAssociates: associates,
                  multiCarDriverIds: driverIds,
                })
              )
            );
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

        // Standard Edit Update for single trip or individual car within an existing multi-car convoy
        const updates: Partial<Trip> = {
          pickupLocation:
            isCompleted || isCancelled
              ? initialTrip.pickupLocation
              : {
                  ...initialTrip.pickupLocation,
                  address: pickupAddress,
                  coordinates: pickupCoordinates,
                  placeId: pickupPlaceId,
                  notes: notesForAll || undefined,
                },
          dropoffLocation:
            isCompleted || isCancelled
              ? initialTrip.dropoffLocation
              : {
                  ...initialTrip.dropoffLocation,
                  address: dropoffAddress,
                  coordinates: dropoffCoordinates,
                  placeId: dropoffPlaceId,
                },
          intermediateStops:
            isCompleted || isCancelled
              ? initialTrip.intermediateStops
              : intermediateStops.length > 0
              ? intermediateStops.map((s) => ({ address: s.address, coordinates: s.coordinates, placeId: s.placeId }))
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
          scheduledPickupTime: isCompleted || isCancelled ? initialTrip.scheduledPickupTime : scheduledPickupTime,
          driverNotes: notesForAll,
          flightNotes: outboundFlightNotes || undefined,
          assignedDriverId: driverId === 'unassigned' ? null : driverId,
          status:
            isCompleted || isCancelled
              ? initialTrip.status
              : driverId !== 'unassigned' && initialTrip.status === 'pending'
              ? 'assigned'
              : initialTrip.status,
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
            ...(selectedDriverInfo
              ? {
                  assignedDriverName: selectedDriverInfo.name,
                  assignedDriverPhone: selectedDriverInfo.phone,
                }
              : {}),
          },
        };

        let updatedTrip: Trip;
        if (service.updateTrip) {
          updatedTrip = await service.updateTrip(initialTrip.id, updates);
        } else {
          updatedTrip = { ...initialTrip, ...updates } as Trip;
        }

        try {
          localStorage.removeItem(draftStorageKey);
        } catch {}

        onBookingSuccess?.(updatedTrip, true);
      } else {
        // ─── NEW BOOKING CREATION (Single Car OR Separate Linked Multi-Car Convoy!) ───
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
                ? intermediateStops.map((s) => ({ address: s.address, coordinates: s.coordinates, placeId: s.placeId }))
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

          // If dispatcher selected a driver on the form, assign to Car 1 (Cars 2..N stay open for individual assignment)
          if (isCar1 && driverId !== 'unassigned' && service.updateTripStatus) {
            try {
              createdCar = await service.updateTripStatus(createdCar.id, 'assigned', {
                assignedDriverId: driverId,
                actorRole: 'admin',
                reason: `Directly assigned to ${selectedDriverInfo?.name || driverId} by dispatcher`,
              });
            } catch {}
          }

          createdOutboundTrips.push(createdCar);
        }

        // Link all outbound multi-car trips together with full associate roster!
        if (isMultiVehicle && createdOutboundTrips.length > 1) {
          const allTripIds = createdOutboundTrips.map((t) => t.id);
          const associates = createdOutboundTrips.map((t, idx) =>
            buildAssociateEntryFromTrip(
              t,
              idx === 0 && selectedDriverInfo
                ? {
                    driverId: selectedDriverInfo.id,
                    driverName: selectedDriverInfo.name,
                    driverPhone: selectedDriverInfo.phone,
                    vehicleUnit: selectedDriverInfo.cabNumber
                      ? `Cab #${selectedDriverInfo.cabNumber}`
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

        // Auto-create linked return booking(s) if requested (supports multi-vehicle returns too!)
        let createdReturnTripForEmail: Trip | null = null;
        if (returnTrip && autoCreateReturnTrip && returnDate && returnTime) {
          try {
            const retPickupAddr = returnPickupAddress.trim() || dropoffAddress;
            const retDropoffAddr = returnDropoffAddress.trim() || pickupAddress;
            const returnScheduledTimeIso = new Date(`${returnDate}T${returnTime}:00`).toISOString();

            const returnCarSeatSummaryParts = [
              returnRearFacing > 0 ? `${returnRearFacing} Rear-Facing` : null,
              returnFrontFacing > 0 ? `${returnFrontFacing} Front-Facing` : null,
              returnBooster > 0 ? `${returnBooster} Booster` : null,
            ].filter(Boolean);

            const returnSpecialRequests =
              returnCarSeats && returnCarSeatSummaryParts.length > 0
                ? `Car Seats: ${returnCarSeatSummaryParts.join(', ')}`
                : undefined;

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
                  const returnTier = resolveVehicleEngineId(returnPrimaryVehicle, activeAdminVehicleIds);
                  return [
                    {
                      carIndex: 1,
                      vehicleChoice: returnPrimaryVehicle,
                      vehicleTier: String(returnTier),
                      vehicleDisplayName: resolveDisplayNameForChoice(returnPrimaryVehicle, String(returnTier)),
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

            const retPaxCaps = returnVehicles.map((v) => vehicleCapacities[v]?.maxPassengers || 4);
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
                    ? returnIntermediateStops.map((s) => ({ address: s.address, coordinates: s.coordinates, placeId: s.placeId }))
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
                  // Strip outbound flight details so outbound flight info never leaks onto return leg
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

        // Generate actual recurring schedule occurrences when Repeat is checked
        if (repeat && scheduledDate && scheduledTime) {
          const extraDates = generateRecurringDates(
            scheduledDate,
            repeatFrequency,
            repeatDays,
            repeatOccurrences,
            repeatUntilDate
          );
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
                      ? intermediateStops.map((s) => ({ address: s.address, coordinates: s.coordinates, placeId: s.placeId }))
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
            } catch (recErr) {
              console.warn(`[DispatchBookingEngine] Failed creating recurring occurrence ${occDate}:`, recErr);
            }
          }
        }

        // Send ONE consolidated passenger confirmation email (summarizing all N vehicles when multi-car!)
        if (sendEmailConfirmation && email.trim()) {
          try {
            const cachedAppSettings = getAdminConfigService().getCachedSettings();
            const multiCarEmailLabel = isMultiVehicle
              ? `${carCount} Vehicles (${outboundCarSpecs.map((s) => `${s.vehicleDisplayName} $${s.fare.toFixed(0)}`).join(', ')})`
              : primaryVehicleDisplayName;
            const multiCarEmailNote = isMultiVehicle
              ? `Multi-Car Convoy (${multiCarGroupId}): ${createdOutboundTrips
                  .map((t, idx) => `Car ${idx + 1} #${t.id.slice(-6).toUpperCase()}`)
                  .join(', ')}.`
              : '';
            const combinedEmailPickupNotes = [multiCarEmailNote, notesForAll].filter(Boolean).join(' ') || undefined;

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
                          : (createdReturnTripForEmail.metadata?.vehicleDisplayName as string) || undefined,
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
                console.warn('[DispatchBookingEngine] Non-blocking confirmation email warning:', mailErr);
              });
          } catch {}
        }

        try {
          localStorage.removeItem(draftStorageKey);
        } catch {}

        onBookingSuccess?.(createdTrip, false);
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to save booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isSubmitting) {
          e.preventDefault();
          (e.currentTarget as HTMLFormElement).requestSubmit();
        } else if (e.altKey && e.key.toLowerCase() === 's' && !isCompleted && !isCancelled) {
          e.preventDefault();
          handleSwapRoute();
        }
      }}
      className="flex flex-col h-full bg-slate-50 select-none text-xs"
    >
      {/* ─── Scrollable Form Body ─── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {isCompleted && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-emerald-900">
              <LockIcon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>Completed Trip (Immutable Route Record)</span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Route and schedule are permanently locked for compliance. You may still adjust driver notes, fare overrides, tips, and payment status.
            </p>
          </div>
        )}

        {isCancelled && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-rose-900">
              <BanIcon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Cancelled Trip</span>
            </div>
            <p className="text-[11px] text-rose-800 leading-relaxed">
              Dispatch operations are halted. You may update internal remarks or click &quot;Copy Booking&quot; below to generate a new active booking.
            </p>
          </div>
        )}

        {submitError && (
          <div
            ref={submitErrorRef}
            className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs font-semibold flex items-center gap-1.5"
          >
            <AlertTriangleIcon className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* ─── Multi-Car Convoy Banner (Edit Mode on Linked Multi-Vehicle Orders) ─── */}
        {isEditMode && initialTrip?.multiCarGroupId && (initialTrip.multiCarTotal || 1) > 1 && (() => {
          const liveSiblings = lookupTrips
            .filter((t) => t.multiCarGroupId === initialTrip.multiCarGroupId)
            .sort((a, b) => (a.multiCarIndex || 0) - (b.multiCarIndex || 0));
          const associatesList =
            liveSiblings.length > 0
              ? liveSiblings.map((t) => ({
                  tripId: t.id,
                  carIndex: t.multiCarIndex || 1,
                  vehicleDisplayName: (t.metadata as any)?.vehicleDisplayName || t.vehicleTier,
                  driverName:
                    driverOptions.find((d) => d.id === t.assignedDriverId)?.formattedLabel ||
                    driverOptions.find((d) => d.id === t.assignedDriverId)?.name ||
                    (t.metadata as any)?.assignedDriverName,
                  driverId: t.assignedDriverId,
                  status: t.status,
                  fare: t.pricing?.totalFare || 0,
                }))
              : (initialTrip.multiCarAssociates || []).map((a) => ({
                  tripId: a.tripId,
                  carIndex: a.carIndex,
                  vehicleDisplayName: a.vehicleDisplayName || a.vehicleTier || 'Standard',
                  driverName: a.driverName,
                  driverId: a.driverId,
                  status: a.status || 'pending',
                  fare: 0,
                }));

          return (
            <div className="p-2.5 bg-violet-50 border border-violet-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-violet-900 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-violet-600 text-white text-[10px] font-black">
                    CAR {initialTrip.multiCarIndex || 1}/{initialTrip.multiCarTotal}
                  </span>
                  <span>Multi-Car Convoy</span>
                </div>
                <span className="font-mono text-[10px] text-violet-600 font-semibold">
                  {initialTrip.multiCarGroupId}
                </span>
              </div>
              <div className="space-y-1">
                {associatesList.map((car) => {
                  const isCurrent = car.tripId === initialTrip.id;
                  return (
                    <div
                      key={car.tripId}
                      className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border text-[11px] ${
                        isCurrent
                          ? 'bg-white border-violet-300 font-bold text-violet-950'
                          : 'bg-violet-100/50 border-violet-200/70 text-slate-700'
                      }`}
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-bold">Car #{car.carIndex}</span>
                        <span className="text-slate-500"> · {car.vehicleDisplayName}</span>
                        <span className="ml-1.5 text-[10px] font-semibold text-blue-700">
                          {car.driverName || (car.driverId ? 'Assigned' : 'Unassigned')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isCurrent ? (
                          <span className="text-[10px] font-black text-violet-700">Editing</span>
                        ) : (
                          onOpenLinkedTrip && (
                            <button
                              type="button"
                              onClick={() => onOpenLinkedTrip(car.tripId)}
                              className="px-2 py-0.5 rounded bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Open
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ─── Multi-Car Split Info Notice when >1 vehicle selected on New or Unsplit Edit ─── */}
        {selectedVehicles.length > 1 && !initialTrip?.multiCarGroupId && (
          <div className="px-2.5 py-2 bg-violet-50/90 border border-violet-200 rounded-lg text-[11px] text-violet-900 flex items-center justify-between gap-2">
            <span>
              <strong>{selectedVehicles.length} separate linked trips</strong> will be created so each car can be assigned individually with associate driver awareness.
            </span>
          </div>
        )}

        {/* ─── Timing Selector (Reverted clean pill switch design) ─── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 text-xs">Pickup Time</span>
              {draftSavedAt && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                  title="Form data is auto-saved locally so you won't lose work on reload"
                >
                  {isEditMode ? 'Edits cached' : 'Draft saved'}
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-medium">
              {timingType === 'later' ? 'Scheduled reservation' : 'On-demand dispatch'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer shrink-0 select-none font-semibold text-slate-700 text-xs">
            <input
              type="checkbox"
              checked={timingType === 'later'}
              onChange={(e) => setTimingType(e.target.checked ? 'later' : 'asap')}
              className="sr-only"
            />
            <div
              className={`w-9 h-5 rounded-full transition-colors relative flex items-center px-0.5 ${
                timingType === 'later' ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  timingType === 'later' ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
            <span>Later</span>
          </label>

          {timingType === 'later' ? (
            <div className="grid grid-cols-2 gap-1.5 flex-1 animate-in fade-in duration-150">
              <ModernDatePicker
                size="sm"
                value={scheduledDate}
                onChange={setScheduledDate}
              />
              <ModernTimePicker
                size="sm"
                value={scheduledTime}
                onChange={setScheduledTime}
              />
            </div>
          ) : (
            <div className="flex-1 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded text-slate-500 text-xs font-medium">
              ASAP (Live / Immediate)
            </div>
          )}
          </div>
        </div>

        {/* ─── Routing Section (Outbound) ─── */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">
            Route
          </label>

          <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2">
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                title="Swap Pickup and Dropoff"
                onClick={handleSwapRoute}
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors self-center text-sm font-bold"
              >
                ↕
              </button>
              <div className="flex-1 space-y-1.5">
                <DispatchLocationInput
                  placeholder="Pickup Location"
                  value={pickupAddress}
                  variant="pickup"
                  disabled={isCompleted || isCancelled}
                  onChange={(val) => {
                    setPickupAddress(val);
                    setPickupPlaceId(undefined);
                  }}
                  onPlaceSelected={(p) => {
                    setPickupAddress(p.address);
                    setPickupCoordinates(p.coordinates);
                    setPickupPlaceId(p.placeId);
                  }}
                  required
                />

                {intermediateStops.map((stop, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <DispatchLocationInput
                      placeholder={`Stop #${idx + 1}`}
                      value={stop.address}
                      variant="stop"
                      disabled={isCompleted || isCancelled}
                      onChange={(val) => {
                        const updated = [...intermediateStops];
                        updated[idx].address = val;
                        updated[idx].placeId = undefined;
                        setIntermediateStops(updated);
                      }}
                      onPlaceSelected={(p) => {
                        const updated = [...intermediateStops];
                        updated[idx] = { address: p.address, coordinates: p.coordinates, placeId: p.placeId };
                        setIntermediateStops(updated);
                      }}
                    />
                    <button
                      type="button"
                      disabled={isCompleted || isCancelled}
                      onClick={() => setIntermediateStops(intermediateStops.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-red-500 px-1 disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <DispatchLocationInput
                  placeholder="Dropoff Location"
                  value={dropoffAddress}
                  variant="dropoff"
                  disabled={isCompleted || isCancelled}
                  onChange={(val) => {
                    setDropoffAddress(val);
                    setDropoffPlaceId(undefined);
                  }}
                  onPlaceSelected={(p) => {
                    setDropoffAddress(p.address);
                    setDropoffCoordinates(p.coordinates);
                    setDropoffPlaceId(p.placeId);
                  }}
                  required
                />
              </div>
            </div>

            {/* Route Stats & Add Stop */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
              <div>
                Estimate: <span className="font-bold text-slate-700">{estimatedDurationMinutes} min</span>,{' '}
                <span className="font-bold text-slate-700">{estimatedDistanceMiles} mi</span>
              </div>
              <div className="flex items-center gap-2">
                {!airportDetection.isAirportTrip && !provideFlightInfo && (
                  <button
                    type="button"
                    onClick={() => setProvideFlightInfo(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold text-xs border border-sky-200 transition-all shadow-2xs active:scale-95"
                  >
                    <PlaneIcon className="w-3.5 h-3.5 text-sky-600" />
                    <span>+ Flight Info</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIntermediateStops([...intermediateStops, { address: '' }])}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 transition-all shadow-2xs active:scale-95"
                >
                  <PlusIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Add stop</span>
                </button>
              </div>
            </div>

            {/* Outbound Flight / Aviation Details Box (Auto-detected for airport pickups/dropoffs or dispatcher-enabled) */}
            {(airportDetection.isAirportTrip || provideFlightInfo) && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                    <PlaneLandingIcon className={`w-4 h-4 text-blue-600 ${airportDetection.isDropoffAirport ? 'rotate-45' : ''}`} />
                    <span>
                      {airportDetection.isPrivateAviation
                        ? (airportDetection.isPickupAirport
                            ? `${airportDetection.airport?.iataCode || 'Private Airport'} Private Aviation Arrival`
                            : `${airportDetection.airport?.iataCode || 'Private Airport'} Private Aviation Dropoff`)
                        : (airportDetection.isPickupAirport
                            ? `${airportDetection.airport?.iataCode || 'Airport'} Arrival Details`
                            : `${airportDetection.airport?.iataCode || 'Airport'} Dropoff Details`)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-semibold text-blue-900 bg-white/90 px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                      <input
                        type="checkbox"
                        checked={provideFlightInfo}
                        onChange={(e) => setProvideFlightInfo(e.target.checked)}
                        className="rounded border-blue-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
                      />
                      <span>
                        {airportDetection.isPickupAirport
                          ? 'Track Inbound Flight'
                          : (airportDetection.isPrivateAviation ? 'Provide Aviation Details' : 'Provide Airline')}
                      </span>
                    </label>
                    <span className="text-[10px] bg-blue-200/80 text-blue-900 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                      {airportDetection.isPrivateAviation ? (
                        <>
                          <PlaneIcon className="w-3 h-3 shrink-0" />
                          <span>Private Aviation (FBO)</span>
                        </>
                      ) : (
                        airportDetection.isPickupAirport ? 'Arrival Tracking' : 'Terminal Routing'
                      )}
                    </span>
                  </div>
                </div>

                {provideFlightInfo && (
                  <div className="space-y-2 pt-0.5">
                    {airportDetection.isPrivateAviation ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                            FBO Facility
                          </span>
                          <input
                            type="text"
                            list="dispatch-outbound-fbo-list"
                            placeholder="e.g. Signature Flight Support"
                            value={fboFacility}
                            onChange={(e) => setFboFacility(e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs text-slate-800"
                          />
                          <datalist id="dispatch-outbound-fbo-list">
                            {COMMON_FBO_FACILITIES.map((fbo) => (
                              <option key={fbo} value={fbo} />
                            ))}
                          </datalist>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                            Tail #
                          </span>
                          <input
                            type="text"
                            placeholder="e.g. N12345"
                            value={tailNumber}
                            onChange={(e) => setTailNumber(e.target.value.toUpperCase())}
                            className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs uppercase font-mono font-bold"
                          />
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                            {airportDetection.isPickupAirport ? 'Origin' : 'Destination'}
                          </span>
                          <input
                            type="text"
                            placeholder="e.g. TEB, VNY, PWK"
                            value={flightOrigin}
                            onChange={(e) => setFlightOrigin(e.target.value.toUpperCase())}
                            className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs uppercase"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                            Airline
                          </span>
                          <select
                            value={airline}
                            onChange={(e) => setAirline(e.target.value)}
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
                            Flight #
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]{1,4}"
                            maxLength={4}
                            placeholder="e.g. 1234"
                            value={flightNumber}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                              setFlightNumber(val);
                            }}
                            className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs font-mono font-bold"
                          />
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                            {airportDetection.isPickupAirport ? 'Origin' : 'Destination'}
                          </span>
                          <input
                            type="text"
                            placeholder="e.g. ORD, ATL, DEN"
                            value={flightOrigin}
                            onChange={(e) => setFlightOrigin(e.target.value.toUpperCase())}
                            className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs uppercase"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-blue-200/60 text-[11px] text-blue-950">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasCheckedLuggage}
                          onChange={(e) => setHasCheckedLuggage(e.target.checked)}
                          className="rounded border-blue-300 text-blue-600"
                        />
                        <span>Checked Baggage</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Passengers Section ─── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Passengers</label>
            <button
              type="button"
              onClick={handleAddPassenger}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 transition-all shadow-2xs active:scale-95"
            >
              <PlusIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>Add passenger</span>
            </button>
          </div>

          <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2 relative">
            {/* Primary Passenger with Instant Inline Caller Lookup */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                <UserIcon className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                placeholder="Primary Passenger Name (type to search callers...)"
                value={passengerName}
                onFocus={() => setShowCallerSuggestions(true)}
                onBlur={() => setTimeout(() => setShowCallerSuggestions(false), 180)}
                onChange={(e) => {
                  setPassengerName(e.target.value);
                  setShowCallerSuggestions(true);
                }}
                required
                className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <PhoneIcon className="w-3.5 h-3.5" />
                </div>
                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={phone}
                  onFocus={() => setShowCallerSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowCallerSuggestions(false), 180)}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setShowCallerSuggestions(true);
                  }}
                  required
                  className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <MailIcon className="w-3.5 h-3.5" />
                </div>
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Instant Caller Autocomplete Dropdown */}
            {showCallerSuggestions && callerSuggestions.length > 0 && (
              <div className="absolute left-2 right-2 top-[72px] z-40 bg-white border border-blue-200 rounded-xl shadow-xl divide-y divide-slate-100 max-h-52 overflow-y-auto">
                <div className="px-2.5 py-1 bg-blue-50/70 text-[10px] font-extrabold uppercase tracking-wider text-blue-800">
                  Matching Returning Callers / CRM Contacts
                </div>
                {callerSuggestions.map((cand) => (
                  <button
                    key={cand.key}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleApplyCallerCandidate(cand);
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 transition-colors cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 truncate">{cand.name}</span>
                        {cand.isVip && (
                          <span className="px-1 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                            VIP
                          </span>
                        )}
                        {cand.isBlacklisted && (
                          <span className="px-1 py-0.2 rounded text-[9px] font-black bg-rose-100 text-rose-700 border border-rose-300">
                            BLOCKED
                          </span>
                        )}
                        {cand.corporateAccount && (
                          <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 truncate max-w-[110px]">
                            {cand.corporateAccount}
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] font-mono text-slate-500 truncate">
                        {cand.phone}{cand.email ? ` • ${cand.email}` : ''}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">
                      {cand.tripCount} {cand.tripCount === 1 ? 'ride' : 'rides'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Quick-Fill Recent Addresses for Selected Caller */}
            {callerQuickAddresses.length > 0 && (
              <div className="pt-1 border-t border-slate-100 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                  <span>Recent Addresses (click to fill Pickup / Shift+click Dropoff)</span>
                  <button
                    type="button"
                    onClick={() => setCallerQuickAddresses([])}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {callerQuickAddresses.map((addr) => (
                    <button
                      key={addr}
                      type="button"
                      onClick={(e) => {
                        if (e.shiftKey || (pickupAddress && !dropoffAddress)) {
                          setDropoffAddress(addr);
                          setDropoffCoordinates(undefined);
                        } else {
                          setPickupAddress(addr);
                          setPickupCoordinates(undefined);
                        }
                      }}
                      className="max-w-full inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 text-[10px] font-semibold border border-slate-200 transition-colors cursor-pointer"
                      title={addr}
                    >
                      <MapPinIcon className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">{addr}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Additional Passengers List */}
            {additionalPassengers.map((ap, idx) => (
              <div key={idx} className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                <span className="text-slate-400 text-xs">#{idx + 2}</span>
                <input
                  type="text"
                  placeholder={`Passenger #${idx + 2} Name`}
                  value={ap.name}
                  onChange={(e) => {
                    const updated = [...additionalPassengers];
                    updated[idx].name = e.target.value;
                    setAdditionalPassengers(updated);
                  }}
                  className="flex-1 px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={ap.phone || ''}
                  onChange={(e) => {
                    const updated = [...additionalPassengers];
                    updated[idx].phone = e.target.value;
                    setAdditionalPassengers(updated);
                  }}
                  className="w-28 px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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

            {/* Contact Person / Booker Checkbox & Expansion */}
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                <input
                  type="checkbox"
                  checked={isBookerDifferent}
                  onChange={(e) => setIsBookerDifferent(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-slate-700">
                  Booker is different from Passenger (Contact Person)
                </span>
              </label>

              {isBookerDifferent && (
                <div className="mt-2 p-2 bg-blue-50/60 border border-blue-200/80 rounded-md space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-blue-800 tracking-wide">
                    Contact Person / Booker Details
                  </div>
                  <input
                    type="text"
                    placeholder="Contact Name (e.g., Hotel Concierge, Assistant)"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="tel"
                      placeholder="Contact Phone"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="email"
                      placeholder="Contact Email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <select
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs text-slate-700"
                  >
                    <option value="Hotel Front Desk / Concierge">Hotel Front Desk / Concierge</option>
                    <option value="Medical Facility / Patient Coordinator">Medical Coordinator</option>
                    <option value="Corporate Travel / Executive Admin">Corporate Travel / Executive Admin</option>
                    <option value="Family Member / Caregiver">Family Member / Caregiver</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Trip Details (Pax, Bags, Car Seats with 3-tier counters) ─── */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
              Trip Details
            </label>
            <span className="text-[10px] text-slate-500 font-medium">
              Capacity: Max {totalMaxPassengers} Pax • {totalMaxBags} Bags
            </span>
          </div>

          <div className="p-2.5 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2">
            {/* Passengers Counter */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Total Passengers</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDecrementPassengers}
                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                >
                  -
                </button>
                <span className="w-5 text-center font-bold">{passengers}</span>
                <button
                  type="button"
                  onClick={handleIncrementPassengers}
                  title="Increments passengers. Auto-upgrades vehicles if capacity exceeded."
                  className="w-6 h-6 rounded bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700"
                >
                  +
                </button>
              </div>
            </div>

            {/* Bags Counter */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                <LuggageIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Bags</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBags((b) => Math.max(0, b - 1))}
                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                >
                  -
                </button>
                <span className="w-5 text-center font-bold">{bags}</span>
                <button
                  type="button"
                  onClick={() => setBags((b) => Math.min(totalMaxBags, b + 1))}
                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                >
                  +
                </button>
              </div>
            </div>

            {/* Collapsible Extras Row (Oversized Cargo + Car Seats — parity with Customer Form) */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="grid grid-cols-1 gap-1.5">
                <label
                  className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border cursor-pointer select-none transition-colors ${
                    hasOversizedLuggage
                      ? 'bg-blue-50/70 border-blue-300'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                  }`}
                >
                  <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={hasOversizedLuggage}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setHasOversizedLuggage(checked);
                        if (!checked) {
                          setOversizedBags({});
                          setOversizedLuggageNotes('');
                        }
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Oversized Cargo (Golf / Skis)</span>
                  </span>
                  {hasOversizedLuggage && totalOversizedCount > 0 && (
                    <span className="text-[10px] font-bold text-blue-700 bg-white px-1.5 py-0.5 rounded border border-blue-200">
                      {totalOversizedCount} item{totalOversizedCount > 1 ? 's' : ''}
                    </span>
                  )}
                </label>

                {/* Expanded Oversized Cargo Panel */}
                {hasOversizedLuggage && (
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 animate-in fade-in duration-150">
                    <div className="text-[10px] text-slate-500 font-medium">
                      Select oversized equipment so the right cargo space is dispatched:
                    </div>
                    <div className="space-y-1">
                      {oversizedCategories.map((cat) => {
                        const count = oversizedBags[cat.id] || 0;
                        return (
                          <div
                            key={cat.id}
                            className="flex items-center justify-between gap-2 text-[11px] bg-white px-2 py-1.5 rounded border border-slate-200"
                          >
                            <div className="flex items-center gap-1 flex-wrap min-w-0">
                              <span className="font-semibold text-slate-800">{cat.label}</span>
                              {cat.requiresUpgrade && (
                                <span className="text-[9px] font-bold text-amber-800 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                                  SUV/Van
                                </span>
                              )}
                              {cat.fee > 0 && (
                                <span className="text-[10px] font-bold font-mono text-emerald-700">
                                  +${cat.fee.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                aria-label={`Decrease ${cat.label}`}
                                disabled={count <= 0}
                                onClick={() =>
                                  setOversizedBags((prev) => ({
                                    ...prev,
                                    [cat.id]: Math.max(0, (prev[cat.id] || 0) - 1),
                                  }))
                                }
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                              >
                                &minus;
                              </button>
                              <span className="w-4 text-center font-bold text-slate-800">{count}</span>
                              <button
                                type="button"
                                aria-label={`Increase ${cat.label}`}
                                disabled={count >= (cat.maxCount || 4)}
                                onClick={() =>
                                  setOversizedBags((prev) => ({
                                    ...prev,
                                    [cat.id]: Math.min(cat.maxCount || 4, (prev[cat.id] || 0) + 1),
                                  }))
                                }
                                className="w-5 h-5 rounded bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 disabled:opacity-40"
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
                      value={oversizedLuggageNotes}
                      onChange={(e) => setOversizedLuggageNotes(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                <label
                  className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border cursor-pointer select-none transition-colors ${
                    carSeats
                      ? 'bg-amber-50/80 border-amber-300'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                  }`}
                >
                  <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={carSeats}
                      onChange={(e) => handleToggleCarSeats(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Child Safety Seats</span>
                  </span>
                  {carSeats && (
                    <span className="text-[10px] font-bold text-amber-900 bg-white px-1.5 py-0.5 rounded border border-amber-200">
                      {totalCarSeats} / {carSeatLimits.maxTotalCarSeats} max
                    </span>
                  )}
                </label>
              </div>

              {/* 3 Car Seat Counters: Rear-Facing, Front-Facing, Booster */}
              {carSeats && (
                <div className="p-2 bg-amber-50/60 border border-amber-200 rounded-lg space-y-1.5 animate-in fade-in duration-150">
                  {/* Rear-Facing (Infant) */}
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="text-slate-700">
                      <span className="font-semibold">Rear-Facing</span> (Infant)
                      <span className="text-[10px] text-slate-400 ml-1">max {carSeatLimits.maxRearFacing}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setRearFacingCount((c) => Math.max(0, c - 1))}
                        className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700"
                      >
                        -
                      </button>
                      <span className="w-4 text-center font-bold text-slate-800">{rearFacingCount}</span>
                      <button
                        type="button"
                        disabled={rearFacingCount >= carSeatLimits.maxRearFacing || totalCarSeats >= carSeatLimits.maxTotalCarSeats}
                        onClick={() => setRearFacingCount((c) => Math.min(carSeatLimits.maxRearFacing, c + 1))}
                        className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Front-Facing (Toddler) */}
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="text-slate-700">
                      <span className="font-semibold">Front-Facing</span> (Toddler)
                      <span className="text-[10px] text-slate-400 ml-1">max {carSeatLimits.maxFrontFacing}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFrontFacingCount((c) => Math.max(0, c - 1))}
                        className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700"
                      >
                        -
                      </button>
                      <span className="w-4 text-center font-bold text-slate-800">{frontFacingCount}</span>
                      <button
                        type="button"
                        disabled={frontFacingCount >= carSeatLimits.maxFrontFacing || totalCarSeats >= carSeatLimits.maxTotalCarSeats}
                        onClick={() => setFrontFacingCount((c) => Math.min(carSeatLimits.maxFrontFacing, c + 1))}
                        className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Booster (Youth) */}
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="text-slate-700">
                      <span className="font-semibold">Booster</span> (Youth)
                      <span className="text-[10px] text-slate-400 ml-1">max {carSeatLimits.maxBooster}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBoosterCount((c) => Math.max(0, c - 1))}
                        className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700"
                      >
                        -
                      </button>
                      <span className="w-4 text-center font-bold text-slate-800">{boosterCount}</span>
                      <button
                        type="button"
                        disabled={boosterCount >= carSeatLimits.maxBooster || totalCarSeats >= carSeatLimits.maxTotalCarSeats}
                        onClick={() => setBoosterCount((c) => Math.min(carSeatLimits.maxBooster, c + 1))}
                        className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Custom Bookable Extras */}
              {universalExtrasConfig?.customExtras &&
                universalExtrasConfig.customExtras.filter((e) => e.isActive).length > 0 && (
                  <div className="space-y-1 pt-1.5 border-t border-slate-100">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Extras &amp; Add-Ons
                    </span>
                    {universalExtrasConfig.customExtras
                      .filter((e) => e.isActive)
                      .map((extra) => {
                        const qty = selectedCustomExtras[extra.id] || 0;
                        const maxQty = extra.isPerUnit ? 4 : 1;
                        return (
                          <div key={extra.id} className="flex items-center justify-between text-[11px]">
                            <div className="min-w-0 pr-2">
                              <span className="font-semibold text-slate-700">{extra.name}</span>
                              <span className="text-[10px] font-mono text-slate-500 ml-1">
                                (+${extra.fee.toFixed(2)})
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedCustomExtras((prev) => {
                                    const next = { ...prev };
                                    const nq = Math.max(0, (next[extra.id] || 0) - 1);
                                    if (nq === 0) delete next[extra.id];
                                    else next[extra.id] = nq;
                                    return next;
                                  })
                                }
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                              >
                                -
                              </button>
                              <span className="w-4 text-center font-bold text-slate-800">{qty}</span>
                              <button
                                type="button"
                                disabled={qty >= maxQty}
                                onClick={() =>
                                  setSelectedCustomExtras((prev) => ({
                                    ...prev,
                                    [extra.id]: Math.min(maxQty, (prev[extra.id] || 0) + 1),
                                  }))
                                }
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

              {/* Collapsible Special Requests & Gate Code Toggle (parity with Customer Form) */}
              <div className="pt-1.5 border-t border-slate-100 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowSpecialRequests((prev) => !prev)}
                  className="w-full flex items-center justify-between text-[11px] font-bold text-slate-700 hover:text-blue-700 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <span>Special Requests &amp; Gate Code</span>
                    <span className="font-normal text-slate-400">(Optional)</span>
                    {(Object.values(specialRequestFlags).some(Boolean) || Boolean(gateCode.trim())) && (
                      <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        {Object.values(specialRequestFlags).filter(Boolean).length + (gateCode.trim() ? 1 : 0)} active
                      </span>
                    )}
                  </span>
                  <span className="text-blue-600 font-bold text-[10px]">
                    {showSpecialRequests ? 'Hide ▲' : 'Add ▾'}
                  </span>
                </button>

                {showSpecialRequests && (
                  <div className="space-y-2 p-2 bg-slate-50 border border-slate-200 rounded-lg animate-in fade-in duration-150">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { key: 'petFriendly', label: 'Pet-Friendly', Icon: PawPrintIcon },
                          { key: 'quietRide', label: 'Quiet Ride', Icon: VolumeXIcon },
                          { key: 'musicOk', label: 'Music OK', Icon: MusicNoteIcon },
                        ] as const
                      ).map((item) => {
                        const active = specialRequestFlags[item.key];
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() =>
                              setSpecialRequestFlags((prev) => ({
                                ...prev,
                                [item.key]: !prev[item.key],
                              }))
                            }
                            className={`py-1.5 px-1.5 rounded-lg text-[10px] font-semibold border flex items-center justify-center gap-1 transition-all cursor-pointer ${
                              active
                                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <item.Icon className="w-3 h-3 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                        Subdivision / Gate Code
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. #1234 or Call box"
                        value={gateCode}
                        onChange={(e) => setGateCode(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Vehicles (Multi-Vehicle Selector with Inline Choices & Add/Remove) ─── */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
              Vehicles ({selectedVehicles.length})
            </label>
            <button
              type="button"
              onClick={handleAddVehicle}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-bold"
            >
              + Add Vehicle
            </button>
          </div>

          <div className="space-y-1.5">
            {selectedVehicles.map((vChoice, idx) => (
              <div
                key={idx}
                className="p-1.5 bg-white border border-slate-300 rounded-lg shadow-2xs flex items-center gap-2"
              >
                <span className="text-[10px] font-bold text-slate-400 w-5">#{idx + 1}</span>
                <div className="flex-1 flex flex-wrap gap-1 p-0.5 bg-slate-100 rounded">
                  {dispatchVehicleOptions.map((opt) => {
                    const isSelected =
                      vChoice === opt.key ||
                      (vChoice === 'sedan' && (opt.key === 'standard' || opt.key === 'sedan')) ||
                      (vChoice === 'suv' && (opt.key === 'xl' || opt.key === 'suv')) ||
                      (vChoice === 'van' && (opt.key === 'wheelchair' || opt.key === 'van'));
                    const simulatedVehicles = [...selectedVehicles];
                    simulatedVehicles[idx] = opt.key;
                    const simulatedCapacity = simulatedVehicles.reduce(
                      (acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4),
                      0
                    );
                    const isCapacityInsufficient = simulatedCapacity < passengers;

                    const engineId = resolveVehicleEngineId(opt.key, activeAdminVehicleIds);
                    const livePrice = vehicleQuotes[engineId]?.totalFare;

                    return (
                      <button
                        type="button"
                        key={opt.key}
                        disabled={isCapacityInsufficient || isCompleted || isCancelled}
                        onClick={() => handleUpdateVehicleChoice(idx, opt.key)}
                        title={
                          isCapacityInsufficient
                            ? `${opt.label} fleet capacity (${simulatedCapacity}p) is insufficient for ${passengers} passengers. Requires larger vehicle or additional vehicles.`
                            : `${opt.label} (${opt.maxPassengers}p / ${opt.maxBags}b)${livePrice ? ` • $${Math.ceil(livePrice)}` : ''}`
                        }
                        className={`flex-1 min-w-[64px] py-1 text-center rounded text-[11px] font-bold transition-all truncate px-1.5 ${
                          isCapacityInsufficient
                            ? 'opacity-35 cursor-not-allowed bg-slate-100 text-slate-400'
                            : isSelected
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                        }`}
                      >
                        <span>{opt.label}</span>{' '}
                        <span className="text-[9px] opacity-80">({opt.maxPassengers}p)</span>
                        {typeof livePrice === 'number' && livePrice > 0 && (
                          <span
                            className={`block text-[10px] font-mono font-extrabold leading-tight ${
                              isSelected ? 'text-blue-100' : 'text-emerald-700'
                            }`}
                          >
                            ${Math.ceil(livePrice)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedVehicles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveVehicle(idx)}
                    className="p-1 text-slate-400 hover:text-red-500 rounded"
                    title="Remove vehicle"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ─── Payment (Segmented) & Detailed Sub-Panels ─── */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Payment</label>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 border border-slate-300 rounded-lg mb-2">
            {(['cash', 'card', 'account'] as const).map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`py-1.5 text-center rounded font-semibold capitalize transition-all ${
                  paymentMethod === m
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {m === 'card' ? 'Credit Card' : m}
              </button>
            ))}
          </div>

          {/* PCI-Safe Credit Card Sub-Panel (Never collects raw 16-digit PAN or CVC) */}
          {paymentMethod === 'card' && (
            <div className="p-2 mb-2 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-200/70 rounded">
                <button
                  type="button"
                  onClick={() => setCardPaymentType('terminal')}
                  className={`py-1 px-1.5 flex items-center justify-center gap-1 rounded text-[10.5px] font-bold transition-all ${
                    cardPaymentType === 'terminal' || cardPaymentType === 'payment_link'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  <CreditCardIcon className="w-3 h-3 shrink-0" />
                  <span>Pay in Cab (Terminal)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCardPaymentType('card_on_file')}
                  className={`py-1 px-1.5 flex items-center justify-center gap-1 rounded text-[10.5px] font-bold transition-all ${
                    cardPaymentType === 'card_on_file' || cardPaymentType === 'manual'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  <LockIcon className="w-3 h-3 shrink-0" />
                  <span>Card On File Reference</span>
                </button>
              </div>

              {(cardPaymentType === 'terminal' || cardPaymentType === 'payment_link') && (
                <div className="p-2 rounded bg-blue-50 border border-blue-200 text-[11px] text-blue-900">
                  Passenger will pay inside the vehicle via the chauffeur&apos;s contactless chip/tap card terminal upon completion.
                </div>
              )}

              {(cardPaymentType === 'card_on_file' || cardPaymentType === 'manual') && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 flex items-center gap-1">
                    <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>PCI-Safe Reference Only — enter cardholder name &amp; last 4 digits (never full PAN/CVC).</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Cardholder Name"
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      placeholder="Last 4 Digits (e.g. 4242)"
                      maxLength={4}
                      value={cardNumber.replace(/\D/g, '').slice(-4)}
                      onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-center font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Exp MM/YY"
                      maxLength={5}
                      value={cardExp}
                      onChange={(e) => setCardExp(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-center font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Corporate Account Sub-Panel */}
          {paymentMethod === 'account' && (() => {
            const selectedCorp = corporateAccountList.find(
              (c) => c.companyName === corporateAccount || c.id === corporateAccount || c.accountNumber === corporateAccount
            );
            const poValidation = selectedCorp
              ? getCorporateAccountService().validateCorporatePo(selectedCorp, billingPo)
              : null;

            return (
              <div className="p-2.5 mb-2 bg-amber-50/80 border border-amber-300 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wide">
                    Corporate Account Billing
                  </span>
                  {selectedCorp && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        selectedCorp.poRequired
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {selectedCorp.poRequired ? 'PO Required on Booking' : 'PO Optional'}
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-slate-600 font-semibold">Corporate Client</span>
                    {selectedCorp && (
                      <span className="text-[10px] font-mono text-slate-500 font-semibold">
                        Acct #{selectedCorp.accountNumber} • Limit: ${selectedCorp.creditLimit.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <select
                    value={corporateAccount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCorporateAccount(val);
                    }}
                    className="w-full px-2 py-1.5 bg-white border border-amber-300 rounded text-xs text-slate-800 font-medium"
                  >
                    {corporateAccountList.length > 0 ? (
                      corporateAccountList.map((acc) => (
                        <option key={acc.id} value={acc.companyName}>
                          {acc.companyName} ({acc.accountNumber}){acc.poRequired ? ' [PO REQ]' : ''}
                        </option>
                      ))
                    ) : (
                      DEFAULT_CORPORATE_ACCOUNTS.map((acc) => (
                        <option key={acc} value={acc}>
                          {acc}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-slate-600 font-semibold">Billing PO / Code</span>
                      {selectedCorp?.currentPoNumber && (
                        <span className="text-[9px] font-mono text-slate-500">
                          Active: {selectedCorp.currentPoNumber}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder={selectedCorp?.currentPoNumber || 'PO-XXXX'}
                      value={billingPo}
                      onChange={(e) => setBillingPo(e.target.value)}
                      className={`w-full px-2 py-1 bg-white border rounded text-xs font-mono font-bold ${
                        poValidation?.status === 'expired_revoked'
                          ? 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-500/20'
                          : poValidation?.status === 'valid'
                          ? 'border-emerald-500 text-emerald-800'
                          : 'border-amber-300'
                      }`}
                    />
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">Authorized By / Contact</span>
                    <input
                      type="text"
                      placeholder="Dept Manager or Email"
                      value={authorizedBy}
                      onChange={(e) => setAuthorizedBy(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs"
                    />
                  </div>
                </div>

                {/* Live Anti-Fraud PO Validation Feedback */}
                {selectedCorp && billingPo.trim().length > 0 && (
                  <div className="text-[10px]">
                    {poValidation?.status === 'valid' && (
                      <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                        <CheckIcon className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                        <span className="font-semibold">Active Authorized PO verified.</span>
                      </div>
                    )}
                    {poValidation?.status === 'expired_revoked' && (
                      <div className="flex items-start gap-1.5 text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-300 font-medium">
                        <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <div>
                          <strong className="block font-bold">FRAUD ALERT: REVOKED PO DETECTED</strong>
                          <span>
                            PO &ldquo;{billingPo}&rdquo; was revoked/rotated on{' '}
                            {poValidation.revokedRecord?.rotatedAt
                              ? poValidation.revokedRecord.rotatedAt.slice(0, 10)
                              : 'previously'}.
                            This booking cannot proceed under this revoked authorization.
                          </span>
                        </div>
                      </div>
                    )}
                    {poValidation?.status === 'mismatch' && (
                      <div className="space-y-1.5 text-rose-800 bg-rose-50 px-2.5 py-2 rounded-lg border border-rose-300">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                          <span>
                            PO Mismatch — Active PO on file: {selectedCorp.currentPoNumber || 'None'}.
                          </span>
                        </div>
                        {selectedCorp.poRequired && (
                          <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-700 cursor-pointer pt-0.5">
                            <input
                              type="checkbox"
                              checked={allowPoOverride}
                              onChange={(e) => setAllowPoOverride(e.target.checked)}
                              className="rounded border-rose-400 text-rose-600 focus:ring-rose-500"
                            />
                            <span>Supervisor Override: authorize mismatched PO (logged in audit trail)</span>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">Invoicing Terms</span>
                  <select
                    value={invoicingTerms}
                    onChange={(e) => setInvoicingTerms(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs text-slate-800"
                  >
                    <option value="Net 30 Direct Bill">Net 30 Direct Bill</option>
                    <option value="Semi-Monthly Invoice">Semi-Monthly Invoice</option>
                    <option value="Monthly Statement">Monthly Statement</option>
                  </select>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="block text-[10px] text-slate-500 font-semibold">Pricing Rule / Tariff</span>
                {selectedRuleId && (
                  <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1 rounded">Rule Active</span>
                )}
              </div>
              <select
                value={selectedRuleId}
                onChange={(e) => {
                  setSelectedRuleId(e.target.value);
                  const matched = availableNamedRules.find((r) => r.id === e.target.value);
                  setTariff(matched ? matched.name : 'Standard');
                }}
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 font-medium"
              >
                <option value="">Auto (Dynamic Rules Matrix)</option>
                {availableNamedRules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (
                    {r.modifier.type === 'flat_override'
                      ? `$${r.modifier.value.toFixed(2)} Flat`
                      : r.modifier.type === 'multiplier'
                      ? `${r.modifier.value}x`
                      : r.modifier.type === 'surcharge_flat'
                      ? `+$${r.modifier.value.toFixed(2)}`
                      : `+${r.modifier.value}%`}
                    )
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Discount (% / $)</span>
              <div className="flex items-center gap-1">
                <select
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="flex-1 px-1.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
                >
                  <option value="None">
                    {matchedCorporateAccount?.discountPercent
                      ? `Corp (${matchedCorporateAccount.discountPercent}%)`
                      : 'None'}
                  </option>
                  <option value="5%">5% Off</option>
                  <option value="10%">10% Off</option>
                  <option value="15%">15% Off</option>
                  <option value="20%">20% Off</option>
                </select>
                <div className="relative w-16 shrink-0">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                    -$
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={manualDiscountDollars}
                    onChange={(e) => setManualDiscountDollars(e.target.value)}
                    title="Flat dollar courtesy credit"
                    className="w-full pl-5 pr-1 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-slate-800 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dispatcher Fee Waivers */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {(
              [
                { label: 'Waive Airport Fee', active: waiveAirportFee, toggle: () => setWaiveAirportFee((v) => !v) },
                { label: 'Waive Stop Fees', active: waiveMultiStopFees, toggle: () => setWaiveMultiStopFees((v) => !v) },
                { label: 'Bypass Surge', active: bypassSurge, toggle: () => setBypassSurge((v) => !v) },
              ] as const
            ).map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={chip.toggle}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                  chip.active
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {chip.active ? '✓ ' : '+ '}
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Assignment (Company & Driver) ─── */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">
            Assignment
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Company</span>
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
              >
                {DEFAULT_COMPANIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Driver</span>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
              >
                <option value="unassigned">Unassigned</option>
                {driverOptions.map((d) => (
                  <option
                    key={d.id}
                    value={d.id}
                    disabled={d.isBlacklisted || d.zone === 'Suspended'}
                  >
                    {getDriverStatusEmoji(d)} {d.formattedLabel || formatDriverAssignmentLabel(d)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ─── Notes (All & Internal) ─── */}
        <div className="space-y-2">
          <div>
            <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Notes for All</label>
            <textarea
              rows={2}
              placeholder="e.g., Gate code is #1234, side door pickup..."
              value={notesForAll}
              onChange={(e) => setNotesForAll(e.target.value)}
              className="w-full p-2 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">
              Internal Notes (for dispatch only)
            </label>
            <textarea
              rows={2}
              placeholder="e.g., VIP client, medical escort..."
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              className="w-full p-2 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* ─── Return Trip & Repeat Toggles with Extended Panels ─── */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            {/* Return Trip (Full Route, Details & Vehicles) */}
            <div>
              {hasLinkedTrip ? (
                <div className="p-3 bg-indigo-50/90 border border-indigo-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 select-none opacity-80 cursor-not-allowed">
                      <input
                        type="checkbox"
                        checked={true}
                        disabled={true}
                        className="rounded border-slate-300 text-indigo-600 cursor-not-allowed"
                      />
                      <span className="font-bold text-indigo-950 text-xs">
                        {isReturnRide ? 'Return Leg (Round Trip)' : 'Outbound Leg (Round Trip)'}
                      </span>
                    </label>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 inline-flex items-center gap-1">
                      <LockIcon className="w-3 h-3 shrink-0" />
                      <span>Linked Round-Trip</span>
                    </span>
                  </div>

                  <div className="text-xs text-indigo-900 leading-relaxed">
                    {isReturnRide ? (
                      <p>
                        This booking represents the <strong>return leg</strong> of a round-trip. Linked to primary outbound trip{' '}
                        <span className="font-mono font-bold bg-indigo-100/70 px-1 py-0.5 rounded">
                          #{linkedTripId?.slice(0, 8) || linkedTripId}
                        </span>.
                      </p>
                    ) : (
                      <p>
                        Linked return leg exists
                        {returnScheduledTime ? ` scheduled for ${new Date(returnScheduledTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                        {' '}(Trip <span className="font-mono font-bold bg-indigo-100/70 px-1 py-0.5 rounded">#{linkedTripId?.slice(0, 8) || linkedTripId}</span>).
                      </p>
                    )}
                  </div>

                  {linkedTripId && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenLinkedTrip?.(linkedTripId);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs active:scale-98"
                    >
                      <span>↗ {isReturnRide ? 'Open Outbound Leg in New Tab' : 'Open Return Leg in New Tab'}</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={returnTrip}
                      disabled={isCompleted || isCancelled}
                      onChange={(e) => setReturnTrip(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <span className="font-bold text-slate-800">Return Trip (Round Trip)</span>
                  </label>

                  {returnTrip && (
                <div className="mt-1.5 p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2.5">
                  <div className="text-[10px] font-bold text-indigo-900 tracking-wide uppercase flex items-center gap-1">
                    <RepeatIcon className="w-3 h-3 text-indigo-700 shrink-0" />
                    <span>RETURN LEG SPECIFICATIONS</span>
                  </div>

                  {/* Return Route Locations - Identical layout to Outbound */}
                  <div className="p-2 bg-white border border-indigo-200 rounded-lg shadow-sm space-y-2">
                    <div className="relative flex items-center gap-2">
                      <button
                        type="button"
                        title="Swap Return Pickup and Dropoff"
                        onClick={handleSwapReturnRoute}
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors self-center text-sm font-bold"
                      >
                        ↕
                      </button>
                      <div className="flex-1 space-y-1.5">
                        <DispatchLocationInput
                          placeholder="Return Pickup Location"
                          value={returnPickupAddress}
                          variant="pickup"
                          onChange={setReturnPickupAddress}
                          onPlaceSelected={(p) => {
                            setReturnPickupAddress(p.address);
                            setReturnPickupCoordinates(p.coordinates);
                          }}
                          required
                        />

                        {returnIntermediateStops.map((stop, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <DispatchLocationInput
                              placeholder={`Return Stop #${idx + 1}`}
                              value={stop.address}
                              variant="stop"
                              onChange={(val) => {
                                const updated = [...returnIntermediateStops];
                                updated[idx].address = val;
                                setReturnIntermediateStops(updated);
                              }}
                              onPlaceSelected={(p) => {
                                const updated = [...returnIntermediateStops];
                                updated[idx] = { address: p.address, coordinates: p.coordinates };
                                setReturnIntermediateStops(updated);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setReturnIntermediateStops(returnIntermediateStops.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-red-500 px-1"
                            >
                              ✕
                            </button>
                          </div>
                        ))}

                        <DispatchLocationInput
                          placeholder="Return Dropoff Location"
                          value={returnDropoffAddress}
                          variant="dropoff"
                          onChange={setReturnDropoffAddress}
                          onPlaceSelected={(p) => {
                            setReturnDropoffAddress(p.address);
                            setReturnDropoffCoordinates(p.coordinates);
                          }}
                          required
                        />
                      </div>
                    </div>

                    {/* Return Route Stats & Add Stop - Identical to Outbound */}
                    <div className="flex items-center justify-between pt-1 border-t border-indigo-100 text-[11px] text-slate-500 font-medium">
                      <div>
                        Estimate:{' '}
                        <span className="font-bold text-slate-700">{returnEstimatedDurationMinutes} min</span>,{' '}
                        <span className="font-bold text-slate-700">{returnEstimatedDistanceMiles} mi</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!returnAirportDetection.isAirportTrip && !returnProvideFlightInfo && (
                          <button
                            type="button"
                            onClick={() => setReturnProvideFlightInfo(true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition-all shadow-2xs active:scale-95"
                          >
                            <PlaneIcon className="w-3.5 h-3.5 text-indigo-600" />
                            <span>+ Flight Info</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setReturnIntermediateStops([...returnIntermediateStops, { address: '' }])}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition-all shadow-2xs active:scale-95"
                        >
                          <PlusIcon className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Add stop</span>
                        </button>
                      </div>
                    </div>

                    {/* Return Flight / Aviation Details Box (Auto-detected for return airport pickups/dropoffs or dispatcher-enabled) */}
                    {(returnAirportDetection.isAirportTrip || returnProvideFlightInfo) && (
                      <div className="p-3 bg-white/90 border border-indigo-200 rounded-lg space-y-2.5 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-indigo-950 font-bold text-xs">
                            <PlaneLandingIcon className={`w-4 h-4 text-indigo-600 ${returnAirportDetection.isDropoffAirport ? 'rotate-45' : ''}`} />
                            <span>
                              {returnAirportDetection.isPrivateAviation
                                ? (returnAirportDetection.isPickupAirport
                                    ? `${returnAirportDetection.airport?.iataCode || 'Private Airport'} Return Private Aviation Arrival`
                                    : `${returnAirportDetection.airport?.iataCode || 'Private Airport'} Return Private Aviation Dropoff`)
                                : (returnAirportDetection.isPickupAirport
                                    ? `${returnAirportDetection.airport?.iataCode || 'Airport'} Return Arrival Details`
                                    : `${returnAirportDetection.airport?.iataCode || 'Airport'} Return Dropoff Details`)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-semibold text-indigo-900 bg-white px-2 py-0.5 rounded border border-indigo-200 shadow-2xs">
                              <input
                                type="checkbox"
                                checked={returnProvideFlightInfo}
                                onChange={(e) => setReturnProvideFlightInfo(e.target.checked)}
                                className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                              />
                              <span>
                                {returnAirportDetection.isPickupAirport
                                  ? 'Track Inbound Flight'
                                  : (returnAirportDetection.isPrivateAviation ? 'Provide Aviation Details' : 'Provide Airline')}
                              </span>
                            </label>
                            <span className="text-[10px] bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                              {returnAirportDetection.isPrivateAviation ? (
                                <>
                                  <PlaneIcon className="w-3 h-3 shrink-0" />
                                  <span>Private Aviation (FBO)</span>
                                </>
                              ) : (
                                returnAirportDetection.isPickupAirport ? 'Arrival Tracking' : 'Terminal Routing'
                              )}
                            </span>
                          </div>
                        </div>

                        {returnProvideFlightInfo && (
                          <div className="space-y-2 pt-0.5">
                            {returnAirportDetection.isPrivateAviation ? (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    FBO Facility
                                  </span>
                                  <input
                                    type="text"
                                    list="dispatch-return-fbo-list"
                                    placeholder="e.g. Signature Flight Support"
                                    value={returnFboFacility}
                                    onChange={(e) => setReturnFboFacility(e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs text-slate-800"
                                  />
                                  <datalist id="dispatch-return-fbo-list">
                                    {COMMON_FBO_FACILITIES.map((fbo) => (
                                      <option key={fbo} value={fbo} />
                                    ))}
                                  </datalist>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    Tail #
                                  </span>
                                  <input
                                    type="text"
                                    placeholder="e.g. N12345"
                                    value={returnTailNumber}
                                    onChange={(e) => setReturnTailNumber(e.target.value.toUpperCase())}
                                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs uppercase font-mono font-bold"
                                  />
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    {returnAirportDetection.isPickupAirport ? 'Origin' : 'Destination'}
                                  </span>
                                  <input
                                    type="text"
                                    placeholder="e.g. TEB, VNY, PWK"
                                    value={returnFlightOrigin}
                                    onChange={(e) => setReturnFlightOrigin(e.target.value.toUpperCase())}
                                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs uppercase"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    Airline
                                  </span>
                                  <select
                                    value={returnAirline}
                                    onChange={(e) => setReturnAirline(e.target.value)}
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
                                    Flight #
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]{1,4}"
                                    maxLength={4}
                                    placeholder="e.g. 1234"
                                    value={returnFlightNumber}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                      setReturnFlightNumber(val);
                                    }}
                                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs font-mono font-bold"
                                  />
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    {returnAirportDetection.isPickupAirport ? 'Origin' : 'Destination'}
                                  </span>
                                  <input
                                    type="text"
                                    placeholder="e.g. ORD, ATL, DEN"
                                    value={returnFlightOrigin}
                                    onChange={(e) => setReturnFlightOrigin(e.target.value.toUpperCase())}
                                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs uppercase"
                                  />
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-1 border-t border-indigo-200/60 text-[11px] text-indigo-950">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={returnHasCheckedLuggage}
                                  onChange={(e) => setReturnHasCheckedLuggage(e.target.checked)}
                                  className="rounded border-indigo-300 text-indigo-600"
                                />
                                <span>Checked Baggage</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Return Date & Time */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <span className="block text-[9px] text-indigo-700 font-semibold mb-0.5">Return Date</span>
                      <ModernDatePicker
                        size="sm"
                        value={returnDate}
                        minDate={scheduledDate || undefined}
                        onChange={(val) => setReturnDate(val)}
                      />
                    </div>
                    <div>
                      <span className="block text-[9px] text-indigo-700 font-semibold mb-0.5">Return Time</span>
                      <ModernTimePicker
                        size="sm"
                        value={returnTime}
                        onChange={(val) => setReturnTime(val)}
                      />
                    </div>
                  </div>

                  {/* Return Trip Details: Pax & Bags */}
                  <div className="p-2 bg-white border border-indigo-200 rounded grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-indigo-900 font-medium">Return Pax:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setReturnPassengers((p) => Math.max(1, p - 1))}
                          className="w-5 h-5 rounded bg-slate-100 border border-slate-300 font-bold"
                        >
                          -
                        </button>
                        <span className="w-4 text-center font-bold">{returnPassengers}</span>
                        <button
                          type="button"
                          onClick={() => setReturnPassengers((p) => p + 1)}
                          className="w-5 h-5 rounded bg-slate-100 border border-slate-300 font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-indigo-900 font-medium">Return Bags:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setReturnBags((b) => Math.max(0, b - 1))}
                          className="w-5 h-5 rounded bg-slate-100 border border-slate-300 font-bold"
                        >
                          -
                        </button>
                        <span className="w-4 text-center font-bold">{returnBags}</span>
                        <button
                          type="button"
                          onClick={() => setReturnBags((b) => b + 1)}
                          className="w-5 h-5 rounded bg-slate-100 border border-slate-300 font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Return Car Seats Toggle & Counters */}
                  <div className="p-2 bg-white border border-indigo-200 rounded space-y-1.5">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-indigo-900 font-medium">
                      <input
                        type="checkbox"
                        checked={returnCarSeats}
                        onChange={(e) => handleToggleReturnCarSeats(e.target.checked)}
                        className="rounded border-indigo-300 text-indigo-600"
                      />
                      <span>Return Car Seats Required</span>
                    </label>

                    {returnCarSeats && (
                      <div className="grid grid-cols-3 gap-1 pt-1 text-[10px]">
                        <div className="p-1 bg-indigo-50/50 rounded border border-indigo-100 text-center">
                          <div className="text-slate-600 font-semibold mb-0.5">Rear-Facing</div>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setReturnRearFacing((c) => Math.max(0, c - 1))}
                              className="w-4 h-4 rounded bg-white border"
                            >
                              -
                            </button>
                            <span className="font-bold">{returnRearFacing}</span>
                            <button
                              type="button"
                              onClick={() => setReturnRearFacing((c) => Math.min(carSeatLimits.maxRearFacing, c + 1))}
                              className="w-4 h-4 rounded bg-white border"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="p-1 bg-indigo-50/50 rounded border border-indigo-100 text-center">
                          <div className="text-slate-600 font-semibold mb-0.5">Front-Facing</div>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setReturnFrontFacing((c) => Math.max(0, c - 1))}
                              className="w-4 h-4 rounded bg-white border"
                            >
                              -
                            </button>
                            <span className="font-bold">{returnFrontFacing}</span>
                            <button
                              type="button"
                              onClick={() => setReturnFrontFacing((c) => Math.min(carSeatLimits.maxFrontFacing, c + 1))}
                              className="w-4 h-4 rounded bg-white border"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="p-1 bg-indigo-50/50 rounded border border-indigo-100 text-center">
                          <div className="text-slate-600 font-semibold mb-0.5">Booster</div>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setReturnBooster((c) => Math.max(0, c - 1))}
                              className="w-4 h-4 rounded bg-white border"
                            >
                              -
                            </button>
                            <span className="font-bold">{returnBooster}</span>
                            <button
                              type="button"
                              onClick={() => setReturnBooster((c) => Math.min(carSeatLimits.maxBooster, c + 1))}
                              className="w-4 h-4 rounded bg-white border"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Return Vehicles Section */}
                  <div className="p-2 bg-white border border-indigo-200 rounded space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                      <span>Return Vehicles ({returnVehicles.length})</span>
                      <button
                        type="button"
                        onClick={handleAddReturnVehicle}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800"
                      >
                        + Add Vehicle
                      </button>
                    </div>
                    {returnVehicles.map((rv, rIdx) => (
                      <div key={rIdx} className="flex items-center gap-1 text-[11px]">
                        <span className="text-slate-400 font-bold text-[9px]">#{rIdx + 1}</span>
                        <div className="flex-1 flex flex-wrap gap-1 p-0.5 bg-slate-100 rounded">
                          {dispatchVehicleOptions.map((opt) => {
                            const isSelected =
                              rv === opt.key ||
                              (rv === 'sedan' && (opt.key === 'standard' || opt.key === 'sedan')) ||
                              (rv === 'suv' && (opt.key === 'xl' || opt.key === 'suv')) ||
                              (rv === 'van' && (opt.key === 'wheelchair' || opt.key === 'van'));
                            const simulatedReturnVehicles = [...returnVehicles];
                            simulatedReturnVehicles[rIdx] = opt.key;
                            const simulatedReturnCapacity = simulatedReturnVehicles.reduce(
                              (acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4),
                              0
                            );
                            const isReturnCapacityInsufficient = simulatedReturnCapacity < returnPassengers;

                            const retEngineId = resolveVehicleEngineId(opt.key, activeAdminVehicleIds);
                            const retLivePrice = returnVehicleQuotes[retEngineId]?.totalFare;

                            return (
                              <button
                                type="button"
                                key={opt.key}
                                disabled={isReturnCapacityInsufficient}
                                onClick={() => handleUpdateReturnVehicle(rIdx, opt.key)}
                                title={
                                  isReturnCapacityInsufficient
                                    ? `${opt.label} fleet capacity (${simulatedReturnCapacity}p) is insufficient for ${returnPassengers} passengers.`
                                    : `${opt.label} (${opt.maxPassengers}p / ${opt.maxBags}b)${retLivePrice ? ` • $${Math.ceil(retLivePrice)}` : ''}`
                                }
                                className={`flex-1 min-w-[54px] py-0.5 px-1 text-center rounded text-[10px] font-bold transition-all truncate ${
                                  isReturnCapacityInsufficient
                                    ? 'opacity-35 cursor-not-allowed bg-slate-100 text-slate-400'
                                    : isSelected
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                                }`}
                              >
                                <span>{opt.label}</span>
                                {typeof retLivePrice === 'number' && retLivePrice > 0 && (
                                  <span
                                    className={`block text-[9.5px] font-mono font-extrabold ${
                                      isSelected ? 'text-indigo-100' : 'text-emerald-700'
                                    }`}
                                  >
                                    ${Math.ceil(retLivePrice)}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {returnVehicles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveReturnVehicle(rIdx)}
                            className="text-slate-400 hover:text-red-500 px-1"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-indigo-900 text-[11px] select-none pt-0.5">
                    <input
                      type="checkbox"
                      checked={autoCreateReturnTrip}
                      onChange={(e) => setAutoCreateReturnTrip(e.target.checked)}
                      className="rounded border-indigo-300 text-indigo-600"
                    />
                    <span className="font-semibold">Automatically generate linked return booking in queue</span>
                  </label>
                </div>
              )}
                </>
              )}
            </div>

            {/* Repeat / Recurring (Until Date & Weeks Pattern) */}
            <div>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-bold text-slate-800">Repeat / Recurring Ride</span>
              </label>

              {repeat && (
                <div className="mt-1.5 p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2">
                  <div className="text-[10px] font-bold text-emerald-900 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1">
                      <RefreshCwIcon className="w-3 h-3 text-emerald-700 shrink-0" />
                      <span>RECURRING SCHEDULE</span>
                    </span>
                    {returnTrip && (
                      <span className="text-[9px] bg-emerald-200 text-emerald-900 px-1.5 py-0.2 rounded font-bold">
                        Repeats Round Trip
                      </span>
                    )}
                  </div>

                  {/* Frequency Pills */}
                  <div className="grid grid-cols-3 gap-1 p-0.5 bg-emerald-200/50 rounded">
                    {(['daily', 'weekdays', 'weekly'] as const).map((freq) => (
                      <button
                        type="button"
                        key={freq}
                        onClick={() => {
                          setRepeatFrequency(freq);
                          if (freq === 'weekdays') {
                            setRepeatDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
                          } else if (freq === 'daily') {
                            setRepeatDays(DAYS_OF_WEEK);
                          }
                        }}
                        className={`py-1 text-center rounded text-[10px] font-bold capitalize transition-all ${
                          repeatFrequency === freq ? 'bg-white text-emerald-900 shadow-xs' : 'text-emerald-700'
                        }`}
                      >
                        {freq}
                      </button>
                    ))}
                  </div>

                  {/* Days Selector */}
                  <div>
                    <span className="block text-[9px] text-emerald-800 font-semibold mb-1">Active Days</span>
                    <div className="flex items-center gap-1">
                      {DAYS_OF_WEEK.map((day) => {
                        const isSelected = repeatDays.includes(day);
                        return (
                          <button
                            type="button"
                            key={day}
                            onClick={() => handleToggleRepeatDay(day)}
                            className={`w-7 h-6 rounded text-[10px] font-bold transition-all ${
                              isSelected
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {day[0]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Until Date Picker & Weeks Dropdown (All, Odd, Even) */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-200/70">
                    <div>
                      <span className="block text-[9px] text-emerald-800 font-semibold mb-0.5">Until Date</span>
                      <ModernDatePicker
                        size="sm"
                        value={repeatUntilDate}
                        minDate={scheduledDate || undefined}
                        onChange={(val) => setRepeatUntilDate(val)}
                      />
                    </div>
                    <div>
                      <span className="block text-[9px] text-emerald-800 font-semibold mb-0.5">Weeks Pattern</span>
                      <select
                        value={repeatWeeksPattern}
                        onChange={(e) => setRepeatWeeksPattern(e.target.value as any)}
                        className="w-full px-2 py-1 bg-white border border-emerald-300 rounded text-xs text-slate-800 font-medium"
                      >
                        <option value="all">All Weeks</option>
                        <option value="odd">Odd Weeks</option>
                        <option value="even">Even Weeks</option>
                      </select>
                    </div>
                  </div>

                  {/* Occurrences Stepper */}
                  <div className="flex items-center justify-between pt-1 border-t border-emerald-200/70">
                    <span className="text-[10px] font-semibold text-emerald-800">Estimated Rides</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRepeatOccurrences(Math.max(2, repeatOccurrences - 1))}
                        className="w-5 h-5 rounded bg-white border border-emerald-300 font-bold flex items-center justify-center text-emerald-800"
                      >
                        -
                      </button>
                      <span className="text-xs font-bold text-emerald-900">{repeatOccurrences} rides</span>
                      <button
                        type="button"
                        onClick={() => setRepeatOccurrences(Math.min(60, repeatOccurrences + 1))}
                        className="w-5 h-5 rounded bg-white border border-emerald-300 font-bold flex items-center justify-center text-emerald-800"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Expandable Canonical Price Breakdown Drawer ─── */}
      {showPriceBreakdown && (() => {
        const retP = (returnPickupAddress.trim() || dropoffAddress.trim()).toLowerCase();
        const retD = (returnDropoffAddress.trim() || pickupAddress.trim()).toLowerCase();
        const isSym =
          returnTrip &&
          retP === dropoffAddress.trim().toLowerCase() &&
          retD === pickupAddress.trim().toLowerCase() &&
          returnIntermediateStops.length === intermediateStops.length &&
          returnPassengers === passengers &&
          JSON.stringify(returnVehicles) === JSON.stringify(selectedVehicles);
        const leg1 = isFareOverridden && manualFare
          ? returnTrip
            ? Math.ceil((parseFloat(manualFare) || 0) / 2)
            : Math.ceil(parseFloat(manualFare) || 0)
          : isSym
          ? Math.max(Math.ceil(estimatedFare), Math.ceil(returnEstimatedFare || estimatedFare))
          : Math.ceil(estimatedFare);
        const leg2 = returnTrip
          ? isFareOverridden && manualFare
            ? Math.max(0, Math.ceil(parseFloat(manualFare) || 0) - leg1)
            : isSym
            ? leg1
            : Math.ceil(returnEstimatedFare || estimatedFare)
          : null;
        const tot = returnTrip ? leg1 + (leg2 || 0) : leg1;
        const primaryOpt = dispatchVehicleOptions.find((o) => o.key === selectedVehicles[0]);

        return (
          <div className="border-t border-slate-200 bg-white px-3 py-2.5 max-h-64 overflow-y-auto shrink-0 shadow-inner">
            <PriceBreakdownPanel
              outboundPricing={outboundPricing}
              returnPricing={returnPricing}
              outboundDisplayFare={leg1}
              returnDisplayFare={leg2}
              totalDisplayFare={tot}
              isRoundTrip={returnTrip}
              vehicleLabel={primaryOpt?.label || String(selectedVehicles[0] || 'Standard')}
            />
          </div>
        );
      })()}

      {/* ─── Sticky Action Bar (Pinned Bottom) ─── */}
      {(() => {
        const retP = (returnPickupAddress.trim() || dropoffAddress.trim()).toLowerCase();
        const retD = (returnDropoffAddress.trim() || pickupAddress.trim()).toLowerCase();
        const isSym =
          returnTrip &&
          retP === dropoffAddress.trim().toLowerCase() &&
          retD === pickupAddress.trim().toLowerCase() &&
          returnIntermediateStops.length === intermediateStops.length &&
          returnPassengers === passengers &&
          JSON.stringify(returnVehicles) === JSON.stringify(selectedVehicles);

        const displayLeg1 =
          isFareOverridden && manualFare
            ? returnTrip
              ? Math.ceil((parseFloat(manualFare) || 0) / 2)
              : Math.ceil(parseFloat(manualFare) || 0)
            : isSym
            ? Math.max(Math.ceil(estimatedFare), Math.ceil(returnEstimatedFare || estimatedFare))
            : Math.ceil(estimatedFare);

        const displayLeg2 = returnTrip
          ? isFareOverridden && manualFare
            ? Math.max(0, Math.ceil(parseFloat(manualFare) || 0) - displayLeg1)
            : isSym
            ? displayLeg1
            : Math.ceil(returnEstimatedFare || estimatedFare)
          : 0;

        const displayTotal = returnTrip ? displayLeg1 + displayLeg2 : displayLeg1;

        return (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-3 py-2 flex items-center justify-between shrink-0 shadow-sm z-20 gap-2">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {isFareOverridden ? (
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-blue-600">$</span>
                    <input
                      type="number"
                      step="1"
                      placeholder="0.00"
                      value={manualFare}
                      onChange={(e) => setManualFare(e.target.value)}
                      className="w-20 px-2 py-1 bg-white border border-blue-400 rounded font-mono font-bold text-sm text-blue-700"
                      title={returnTrip ? 'Combined Round-Trip Override Total' : 'Manual Fare Override'}
                    />
                    <button
                      type="button"
                      onClick={() => setIsFareOverridden(false)}
                      className="text-[10px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      setIsFareOverridden(true);
                      setManualFare(displayTotal ? displayTotal.toFixed(2) : '');
                    }}
                    className="cursor-pointer group flex items-baseline gap-1"
                    title="Click to manually override fare"
                  >
                    <span className="text-lg font-mono font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                      ${displayTotal.toFixed(2)}
                    </span>
                    {isQuoting && (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    )}
                    {repeat && (
                      <span className="text-xs font-bold text-indigo-600">
                        {repeatFrequency === 'daily'
                          ? '/ day'
                          : repeatFrequency === 'weekdays'
                          ? '/ weekday'
                          : repeatFrequency === 'weekly'
                          ? repeatDays.length > 1
                            ? `/ trip (${repeatDays.length}x/wk)`
                            : '/ week'
                          : '/ trip'}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 group-hover:text-blue-500 font-semibold">
                      (Est. ✎)
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowPriceBreakdown((v) => !v)}
                  className={`px-1.5 py-0.5 rounded border text-[10px] font-bold transition-colors cursor-pointer ${
                    showPriceBreakdown
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Toggle itemized Admin Tariff fare breakdown"
                >
                  {showPriceBreakdown ? 'Breakdown ▼' : 'Breakdown ▲'}
                </button>
              </div>

              {returnTrip && (
                <div className="text-[10px] text-slate-500 font-medium">
                  Leg 1: ${displayLeg1.toFixed(2)} | Return Leg: ${displayLeg2.toFixed(2)}
                  {isFareOverridden && ' (Overridden)'}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isEditMode && (
                <label
                  className="hidden sm:flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 cursor-pointer select-none px-1.5 py-1 rounded-lg hover:bg-slate-100"
                  title={email.trim() ? `Send confirmation email to ${email.trim()}` : 'Enter passenger email above to send confirmation'}
                >
                  <input
                    type="checkbox"
                    checked={sendEmailConfirmation}
                    onChange={(e) => setSendEmailConfirmation(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                  />
                  <span>Email Confirm</span>
                </label>
              )}
              {isEditMode ? (
                <button
                  type="button"
                  onClick={handleCopyBooking}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Create a new draft tab pre-populated with these trip details"
                >
                  <CopyIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Booking</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmClear}
                  className="px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors cursor-pointer"
                  title="Clear all booking inputs"
                >
                  Clear
                </button>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                title="Save booking (Ctrl+Enter)"
                className={`rounded-xl font-black text-white shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer ${
                  isEditMode
                    ? 'px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-xs'
                    : 'px-6 py-2 bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30 text-sm active:scale-95'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <SpinnerIcon className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{isEditMode ? 'Update Booking' : 'Book'}</span>
                )}
              </button>
            </div>
          </div>
        );
      })()}

      <ConfirmationModal
        isOpen={isClearModalOpen}
        title="Clear Booking Form"
        message="Are you sure you want to clear this booking form? All unsaved inputs will be reset to default values."
        confirmText="Clear Form"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={() => {
          handleClear();
          setIsClearModalOpen(false);
        }}
        onCancel={() => setIsClearModalOpen(false)}
      />
    </form>
  );
}

export const DispatchBookingEngine = React.memo(DispatchBookingEngineComponent);
