import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Trip, GeoPoint, CreateTripInput, VehicleTier, PaymentMethod } from '../../../core/types';
import { getBookingService } from '../../../core/services/booking';
import { calculateLiveRoute } from '../../../core/services/maps/live-routing.service';
import { calculateTripPricing } from '../../../core/services/pricing';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { DispatchLocationInput } from './DispatchLocationInput';
import { SpinnerIcon } from '../../ui/Icons';

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
  cardPaymentType: 'terminal' | 'manual';
  cardholderName: string;
  cardNumber: string;
  cardExp: string;
  cardCvc: string;
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
  returnVehicles: Array<'sedan' | 'suv' | 'van'>;
  autoCreateReturnTrip: boolean;
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
  selectedVehicles: Array<'sedan' | 'suv' | 'van'>;
  vehicle: 'any' | 'sedan' | 'suv' | 'van';
  paymentMethod: 'cash' | 'card' | 'account';
  cardDetails: CardDetails;
  corporateDetails: CorporateAccountDetails;
  tariff: string;
  discount: string;
  company: string;
  driverId: string;
  notesForAll: string;
  internalNotes: string;
  returnDetails: ReturnTripDetails;
  repeatDetails: RepeatTripDetails;
  estimatedFare: number;
  manualFare: string;
  isFareOverridden: boolean;
  estimatedDurationMinutes: number;
  estimatedDistanceMiles: number;
}

export interface DispatchBookingEngineProps {
  draftId: string;
  initialTrip?: Trip | null;
  onBookingSuccess?: (trip: Trip, isEdit: boolean) => void;
  onValuesChange?: (values: DispatchFormValues) => void;
  onClearDraft?: () => void;
}

const DEFAULT_COMPANIES = ['Chesterfield Taxi', 'St. Louis Taxi', 'West County Express'];
const DEFAULT_CORPORATE_ACCOUNTS = [
  'Bayer CropScience',
  'Pfizer Chesterfield',
  'Marriott St. Louis West',
  'Mercy Hospital St. Louis',
  "St. Luke's Hospital",
  'Delmar Gardens Chesterfield',
  'West County Orthopedics',
  'Custom Direct Bill Account',
];
const DEFAULT_DRIVERS = [
  { id: 'unassigned', name: 'Unassigned' },
  { id: 'drv-101', name: 'Driver 101 (Mike T.)' },
  { id: 'drv-104', name: 'Driver 104 (Sarah K.)' },
  { id: 'drv-108', name: 'Driver 108 (David R.)' },
  { id: 'drv-112', name: 'Driver 112 (James W.)' },
];
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function DispatchBookingEngine({
  draftId,
  initialTrip,
  onBookingSuccess,
  onValuesChange,
  onClearDraft,
}: DispatchBookingEngineProps) {
  const isEditMode = Boolean(initialTrip?.id);
  const draftStorageKey = `chesterfield_dispatch_draft_${draftId}`;

  // Form State: Timing
  const [timingType, setTimingType] = useState<'asap' | 'later'>('asap');
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState('12:00');
  
  // Routing: Outbound
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoordinates, setPickupCoordinates] = useState<GeoPoint | undefined>();
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffCoordinates, setDropoffCoordinates] = useState<GeoPoint | undefined>();
  const [intermediateStops, setIntermediateStops] = useState<Array<{ address: string; coordinates?: GeoPoint }>>([]);

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

  // Details: Passengers, Bags, Car Seats with 3 counters
  const [passengers, setPassengers] = useState(1);
  const [bags, setBags] = useState(0);
  const [carSeats, setCarSeats] = useState(false);
  const [rearFacingCount, setRearFacingCount] = useState(0);
  const [frontFacingCount, setFrontFacingCount] = useState(0);
  const [boosterCount, setBoosterCount] = useState(0);

  // Multi-Vehicle Selection
  const [selectedVehicles, setSelectedVehicles] = useState<Array<'sedan' | 'suv' | 'van'>>(['sedan']);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'account'>('cash');
  const [cardPaymentType, setCardPaymentType] = useState<'terminal' | 'manual'>('terminal');
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [saveCardOnFile, setSaveCardOnFile] = useState(false);

  const [corporateAccount, setCorporateAccount] = useState(DEFAULT_CORPORATE_ACCOUNTS[0]);
  const [billingPo, setBillingPo] = useState('');
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [invoicingTerms, setInvoicingTerms] = useState('Net 30 Direct Bill');

  const [tariff, setTariff] = useState('Standard');
  const [discount, setDiscount] = useState('None');
  const [company, setCompany] = useState(DEFAULT_COMPANIES[0]);
  const [driverId, setDriverId] = useState('unassigned');

  // Notes
  const [notesForAll, setNotesForAll] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // Return Trip Details (Full independent leg & fleet)
  const [returnTrip, setReturnTrip] = useState(false);
  const [returnPickupAddress, setReturnPickupAddress] = useState('');
  const [returnPickupCoordinates, setReturnPickupCoordinates] = useState<GeoPoint | undefined>();
  const [returnDropoffAddress, setReturnDropoffAddress] = useState('');
  const [returnDropoffCoordinates, setReturnDropoffCoordinates] = useState<GeoPoint | undefined>();
  const [returnIntermediateStops, setReturnIntermediateStops] = useState<Array<{ address: string; coordinates?: GeoPoint }>>([]);
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [returnTime, setReturnTime] = useState('17:00');
  const [returnPassengers, setReturnPassengers] = useState(1);
  const [returnBags, setReturnBags] = useState(0);
  const [returnCarSeats, setReturnCarSeats] = useState(false);
  const [returnRearFacing, setReturnRearFacing] = useState(0);
  const [returnFrontFacing, setReturnFrontFacing] = useState(0);
  const [returnBooster, setReturnBooster] = useState(0);
  const [returnVehicles, setReturnVehicles] = useState<Array<'sedan' | 'suv' | 'van'>>(['sedan']);
  const [autoCreateReturnTrip, setAutoCreateReturnTrip] = useState(true);

  // Repeat / Recurring Schedule
  const [repeat, setRepeat] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<'daily' | 'weekdays' | 'weekly' | 'custom'>('weekdays');
  const [repeatDays, setRepeatDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [repeatOccurrences, setRepeatOccurrences] = useState(5);
  const [repeatUntilDate, setRepeatUntilDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [repeatWeeksPattern, setRepeatWeeksPattern] = useState<'all' | 'odd' | 'even'>('all');

  // Pricing
  const [estimatedFare, setEstimatedFare] = useState(0);
  const [manualFare, setManualFare] = useState('');
  const [isFareOverridden, setIsFareOverridden] = useState(false);
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(0);
  const [estimatedDistanceMiles, setEstimatedDistanceMiles] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Limits from centralized config
  const carSeatLimits = COMPANY_CONFIG.carSeatLimits || {
    maxRearFacing: 2,
    maxFrontFacing: 3,
    maxBooster: 3,
    maxTotalCarSeats: 4,
  };

  const vehicleCapacities = COMPANY_CONFIG.vehicleCapacities || {
    sedan: { maxPassengers: 4, maxBags: 3 },
    suv: { maxPassengers: 6, maxBags: 5 },
    van: { maxPassengers: 7, maxBags: 6 },
    any: { maxPassengers: 4, maxBags: 3 },
  };

  // Compute fleet capacities from sum of selected vehicles
  const totalMaxPassengers = selectedVehicles.reduce(
    (acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4),
    0
  );
  const totalMaxBags = selectedVehicles.reduce(
    (acc, v) => acc + (vehicleCapacities[v]?.maxBags || 3),
    0
  );
  const totalCarSeats = rearFacingCount + frontFacingCount + boosterCount;

  // Hydrate from initialTrip if provided
  useEffect(() => {
    if (initialTrip) {
      setTimingType(initialTrip.bookingType === 'scheduled' ? 'later' : 'asap');
      if (initialTrip.scheduledPickupTime) {
        try {
          const d = new Date(initialTrip.scheduledPickupTime);
          if (!isNaN(d.getTime())) {
            setScheduledDate(d.toISOString().split('T')[0]);
            setScheduledTime(d.toTimeString().slice(0, 5));
          }
        } catch {}
      }

      setPickupAddress(initialTrip.pickupLocation?.address || '');
      setPickupCoordinates(initialTrip.pickupLocation?.coordinates);
      setDropoffAddress(initialTrip.dropoffLocation?.address || '');
      setDropoffCoordinates(initialTrip.dropoffLocation?.coordinates);

      if (initialTrip.intermediateStops && initialTrip.intermediateStops.length > 0) {
        setIntermediateStops(
          initialTrip.intermediateStops.map((s) => ({
            address: s.address,
            coordinates: s.coordinates,
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

      // Hydrate car seats from specialRequests / metadata
      const hasCarSeatReq = Boolean(
        initialTrip.passenger?.specialRequests?.toLowerCase().includes('car seat')
      );
      setCarSeats(hasCarSeatReq);
      if (meta.carSeatsBreakdown) {
        setRearFacingCount(meta.carSeatsBreakdown.rearFacing || 0);
        setFrontFacingCount(meta.carSeatsBreakdown.frontFacing || 0);
        setBoosterCount(meta.carSeatsBreakdown.booster || 0);
      } else if (hasCarSeatReq) {
        setRearFacingCount(1);
      }

      // Hydrate vehicle
      if (meta.selectedVehicles && Array.isArray(meta.selectedVehicles)) {
        setSelectedVehicles(meta.selectedVehicles);
      } else if (initialTrip.vehicleTier === 'xl') {
        setSelectedVehicles(['suv']);
      } else if (initialTrip.vehicleTier === 'wheelchair') {
        setSelectedVehicles(['van']);
      } else {
        setSelectedVehicles(['sedan']);
      }

      // Hydrate payment
      if (initialTrip.payment?.method === 'card') setPaymentMethod('card');
      else if (initialTrip.payment?.method === 'corporate') setPaymentMethod('account');
      else setPaymentMethod('cash');

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
      }

      if (meta.corporateDetails) {
        setCorporateAccount(meta.corporateDetails.corporateAccount || DEFAULT_CORPORATE_ACCOUNTS[0]);
        setBillingPo(meta.corporateDetails.billingPo || '');
        setAuthorizedBy(meta.corporateDetails.authorizedBy || '');
        setInvoicingTerms(meta.corporateDetails.invoicingTerms || 'Net 30 Direct Bill');
      }

      if (initialTrip.assignedDriverId) {
        setDriverId(initialTrip.assignedDriverId);
      }

      if (initialTrip.driverNotes) {
        setNotesForAll(initialTrip.driverNotes);
      }

      if (initialTrip.pricing?.totalFare) {
        setEstimatedFare(initialTrip.pricing.totalFare);
      }
    } else {
      // Restore from localStorage draft
      try {
        const saved = localStorage.getItem(draftStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.pickupAddress) setPickupAddress(parsed.pickupAddress);
          if (parsed.pickupCoordinates) setPickupCoordinates(parsed.pickupCoordinates);
          if (parsed.dropoffAddress) setDropoffAddress(parsed.dropoffAddress);
          if (parsed.dropoffCoordinates) setDropoffCoordinates(parsed.dropoffCoordinates);
          if (parsed.intermediateStops) setIntermediateStops(parsed.intermediateStops);
          if (parsed.passengerName) setPassengerName(parsed.passengerName);
          if (parsed.phone) setPhone(parsed.phone);
          if (parsed.email) setEmail(parsed.email);
          if (parsed.additionalPassengers) setAdditionalPassengers(parsed.additionalPassengers);
          if (parsed.isBookerDifferent !== undefined) setIsBookerDifferent(parsed.isBookerDifferent);
          if (parsed.contactName) setContactName(parsed.contactName);
          if (parsed.contactPhone) setContactPhone(parsed.contactPhone);
          if (parsed.contactEmail) setContactEmail(parsed.contactEmail);
          if (parsed.contactRole) setContactRole(parsed.contactRole);
          if (parsed.passengers) setPassengers(parsed.passengers);
          if (parsed.bags !== undefined) setBags(parsed.bags);
          if (parsed.carSeats !== undefined) setCarSeats(parsed.carSeats);
          if (parsed.rearFacingCount !== undefined) setRearFacingCount(parsed.rearFacingCount);
          if (parsed.frontFacingCount !== undefined) setFrontFacingCount(parsed.frontFacingCount);
          if (parsed.boosterCount !== undefined) setBoosterCount(parsed.boosterCount);
          if (parsed.selectedVehicles) setSelectedVehicles(parsed.selectedVehicles);
          if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
          if (parsed.corporateAccount) setCorporateAccount(parsed.corporateAccount);
          if (parsed.billingPo) setBillingPo(parsed.billingPo);
          if (parsed.authorizedBy) setAuthorizedBy(parsed.authorizedBy);
          if (parsed.invoicingTerms) setInvoicingTerms(parsed.invoicingTerms);
          if (parsed.tariff) setTariff(parsed.tariff);
          if (parsed.discount) setDiscount(parsed.discount);
          if (parsed.company) setCompany(parsed.company);
          if (parsed.driverId) setDriverId(parsed.driverId);
          if (parsed.notesForAll) setNotesForAll(parsed.notesForAll);
          if (parsed.internalNotes) setInternalNotes(parsed.internalNotes);
          if (parsed.returnTrip !== undefined) setReturnTrip(parsed.returnTrip);
          if (parsed.returnPickupAddress) setReturnPickupAddress(parsed.returnPickupAddress);
          if (parsed.returnDropoffAddress) setReturnDropoffAddress(parsed.returnDropoffAddress);
          if (parsed.repeat !== undefined) setRepeat(parsed.repeat);
          if (parsed.repeatUntilDate) setRepeatUntilDate(parsed.repeatUntilDate);
          if (parsed.repeatWeeksPattern) setRepeatWeeksPattern(parsed.repeatWeeksPattern);
        }
      } catch {}
    }
  }, [initialTrip, draftStorageKey]);

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

  // Persist draft to localStorage & notify parent of values changes
  useEffect(() => {
    if (isEditMode) return;

    const draftData = {
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
      isBookerDifferent,
      contactName,
      contactPhone,
      contactEmail,
      contactRole,
      passengers,
      bags,
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
      tariff,
      discount,
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
      manualFare,
      isFareOverridden,
    };

    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(draftData));
    } catch {}

    onValuesChange?.({
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
        cardNumber,
        cardExp,
        cardCvc,
        saveCardOnFile,
      },
      corporateDetails: {
        corporateAccount,
        billingPo,
        authorizedBy,
        invoicingTerms,
      },
      tariff,
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
      estimatedFare,
      manualFare,
      isFareOverridden,
      estimatedDurationMinutes,
      estimatedDistanceMiles,
    });
  }, [
    draftStorageKey,
    isEditMode,
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
    isBookerDifferent,
    contactName,
    contactPhone,
    contactEmail,
    contactRole,
    passengers,
    bags,
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
    tariff,
    discount,
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
    manualFare,
    isFareOverridden,
    estimatedDurationMinutes,
    estimatedDistanceMiles,
    onValuesChange,
  ]);

  // Live route calculation & pricing
  useEffect(() => {
    if (!pickupAddress || !dropoffAddress) {
      if (!isFareOverridden) {
        setEstimatedFare(0);
        setEstimatedDistanceMiles(0);
        setEstimatedDurationMinutes(0);
      }
      return;
    }

    let isMounted = true;
    const origin = pickupCoordinates || pickupAddress;
    const destination = dropoffCoordinates || dropoffAddress;
    const waypoints = intermediateStops.map((s) => s.coordinates || s.address).filter(Boolean);

    calculateLiveRoute({ origin, destination, waypoints })
      .then((res) => {
        if (!isMounted || !res) return;
        setEstimatedDistanceMiles(res.distanceMiles);
        setEstimatedDurationMinutes(res.durationMinutes);

        if (!isFareOverridden) {
          const config = getAdminConfigService().getCachedSettings().pricing;
          
          // Calculate pricing for each selected vehicle and sum
          let totalCalculated = 0;
          selectedVehicles.forEach((v) => {
            let tier: VehicleTier = 'standard';
            if (v === 'suv') tier = 'xl';
            if (v === 'van') tier = 'wheelchair';
            if (v === 'sedan') tier = 'premium';

            const quote = calculateTripPricing(
              {
                distanceMiles: res.distanceMiles,
                durationMinutes: res.durationMinutes,
                vehicleTier: tier,
                pickupDateTime:
                  timingType === 'later' && scheduledDate && scheduledTime
                    ? new Date(`${scheduledDate}T${scheduledTime}:00`)
                    : new Date(),
                intermediateStopsCount: intermediateStops.length,
              },
              config
            );
            totalCalculated += quote.pricing.totalFare;
          });

          setEstimatedFare(totalCalculated);
        }
      })
      .catch((e) => {
        console.warn('[DispatchBookingEngine] Route calculation failed:', e);
      });

    return () => {
      isMounted = false;
    };
  }, [
    pickupAddress,
    pickupCoordinates,
    dropoffAddress,
    dropoffCoordinates,
    intermediateStops,
    selectedVehicles,
    timingType,
    scheduledDate,
    scheduledTime,
    isFareOverridden,
  ]);

  // Swap outbound route
  const handleSwapRoute = () => {
    const tmpAddr = pickupAddress;
    const tmpCoords = pickupCoordinates;
    setPickupAddress(dropoffAddress);
    setPickupCoordinates(dropoffCoordinates);
    setDropoffAddress(tmpAddr);
    setDropoffCoordinates(tmpCoords);
  };

  // Swap return route
  const handleSwapReturnRoute = () => {
    const tmpAddr = returnPickupAddress;
    const tmpCoords = returnPickupCoordinates;
    setReturnPickupAddress(returnDropoffAddress);
    setReturnPickupCoordinates(returnDropoffCoordinates);
    setReturnDropoffAddress(tmpAddr);
    setReturnDropoffCoordinates(tmpCoords);
  };

  // Passenger increment with automatic vehicle upgrade
  const handleIncrementPassengers = () => {
    const nextPax = passengers + 1;
    // Check if nextPax exceeds capacity of current selected vehicles
    if (nextPax > totalMaxPassengers) {
      // Auto-upgrade:
      // 1 vehicle Sedan -> SUV (cap 6)
      // 1 vehicle SUV -> Van (cap 7)
      // 1 vehicle Van -> add Sedan (cap 7 + 4 = 11)
      if (selectedVehicles.length === 1 && selectedVehicles[0] === 'sedan') {
        setSelectedVehicles(['suv']);
      } else if (selectedVehicles.length === 1 && selectedVehicles[0] === 'suv') {
        setSelectedVehicles(['van']);
      } else {
        setSelectedVehicles([...selectedVehicles, 'sedan']);
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
    setSelectedVehicles([...selectedVehicles, 'sedan']);
  };

  const handleRemoveVehicle = (index: number) => {
    if (selectedVehicles.length <= 1) return;
    const updated = selectedVehicles.filter((_, i) => i !== index);
    setSelectedVehicles(updated);
  };

  const handleUpdateVehicleChoice = (index: number, choice: 'sedan' | 'suv' | 'van') => {
    const updated = [...selectedVehicles];
    updated[index] = choice;
    setSelectedVehicles(updated);
  };

  // Return vehicles management
  const handleAddReturnVehicle = () => {
    setReturnVehicles([...returnVehicles, 'sedan']);
  };

  const handleRemoveReturnVehicle = (index: number) => {
    if (returnVehicles.length <= 1) return;
    setReturnVehicles(returnVehicles.filter((_, i) => i !== index));
  };

  const handleUpdateReturnVehicle = (index: number, choice: 'sedan' | 'suv' | 'van') => {
    const updated = [...returnVehicles];
    updated[index] = choice;
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
    setSelectedVehicles(['sedan']);
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
    setReturnVehicles(['sedan']);
    setRepeat(false);
    setEstimatedFare(0);
    setManualFare('');
    setIsFareOverridden(false);
    setEstimatedDurationMinutes(0);
    setEstimatedDistanceMiles(0);
    setSubmitError(null);

    try {
      localStorage.removeItem(draftStorageKey);
    } catch {}

    onClearDraft?.();
  };

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

    setIsSubmitting(true);
    const service = getBookingService();

    const primaryVehicle = selectedVehicles[0] || 'sedan';
    let tier: VehicleTier = 'standard';
    if (primaryVehicle === 'suv') tier = 'xl';
    else if (primaryVehicle === 'van') tier = 'wheelchair';
    else if (primaryVehicle === 'sedan') tier = 'premium';

    let method: PaymentMethod = 'cash';
    if (paymentMethod === 'card') method = 'card';
    if (paymentMethod === 'account') method = 'corporate';

    const finalFare = isFareOverridden && manualFare ? parseFloat(manualFare) || 0 : estimatedFare;

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

    const specialRequests = carSeats && carSeatSummaryParts.length > 0
      ? `Car Seats: ${carSeatSummaryParts.join(', ')}`
      : undefined;

    const metadataPayload = {
      company,
      internalNotes,
      tariff,
      discount,
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
            }
          : undefined,
      returnDetails: returnTrip
        ? {
            returnTrip: true,
            returnPickupAddress: returnPickupAddress || dropoffAddress,
            returnDropoffAddress: returnDropoffAddress || pickupAddress,
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
    };

    try {
      if (isEditMode && initialTrip) {
        // Update existing trip
        const updates: Partial<Trip> = {
          pickupLocation: {
            ...initialTrip.pickupLocation,
            address: pickupAddress,
            coordinates: pickupCoordinates,
            notes: notesForAll || undefined,
          },
          dropoffLocation: {
            ...initialTrip.dropoffLocation,
            address: dropoffAddress,
            coordinates: dropoffCoordinates,
          },
          intermediateStops:
            intermediateStops.length > 0
              ? intermediateStops.map((s) => ({ address: s.address, coordinates: s.coordinates }))
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
          vehicleTier: tier,
          bookingType: timingType === 'later' ? 'scheduled' : 'asap',
          scheduledPickupTime,
          driverNotes: notesForAll,
          assignedDriverId: driverId === 'unassigned' ? null : driverId,
          status: driverId !== 'unassigned' && initialTrip.status === 'pending' ? 'assigned' : initialTrip.status,
          pricing: {
            ...initialTrip.pricing,
            totalFare: finalFare,
            distanceMiles: estimatedDistanceMiles,
            durationMinutes: estimatedDurationMinutes,
          },
          payment: {
            ...initialTrip.payment,
            method,
            amount: finalFare,
          },
          metadata: {
            ...initialTrip.metadata,
            ...metadataPayload,
          },
        };

        let updatedTrip: Trip;
        if (service.updateTrip) {
          updatedTrip = await service.updateTrip(initialTrip.id, updates);
        } else {
          updatedTrip = { ...initialTrip, ...updates } as Trip;
        }

        onBookingSuccess?.(updatedTrip, true);
      } else {
        // Create new primary trip
        const payload: CreateTripInput = {
          bookingType: timingType === 'later' ? 'scheduled' : 'asap',
          scheduledPickupTime,
          pickupLocation: {
            address: pickupAddress,
            coordinates: pickupCoordinates,
            notes: notesForAll || undefined,
          },
          dropoffLocation: {
            address: dropoffAddress,
            coordinates: dropoffCoordinates,
          },
          intermediateStops:
            intermediateStops.length > 0
              ? intermediateStops.map((s) => ({ address: s.address, coordinates: s.coordinates }))
              : undefined,
          passenger: {
            firstName,
            lastName,
            phone,
            email,
            passengerCount: passengers,
            luggageCount: bags,
            specialRequests,
          },
          vehicleTier: tier,
          driverNotes: notesForAll,
          pricing: {
            baseFare: 5.0,
            distanceMiles: estimatedDistanceMiles,
            durationMinutes: estimatedDurationMinutes,
            distanceRate: 2.5,
            timeRate: 0.5,
            vehicleMultiplier: 1.0,
            surgeMultiplier: 1.0,
            discountAmount: 0,
            subtotal: finalFare,
            totalFare: finalFare,
            currency: 'USD',
          },
          payment: {
            method,
            status: 'pending',
            amount: finalFare,
          },
          metadata: {
            ...metadataPayload,
            createdByRole: 'dispatcher',
          },
        };

        const createdTrip = await service.createBooking(payload);

        // Assign driver if selected
        if (driverId !== 'unassigned' && service.updateTripStatus) {
          try {
            await service.updateTripStatus(createdTrip.id, 'assigned', {
              assignedDriverId: driverId,
              reason: `Directly assigned to ${driverId} by dispatcher`,
            });
          } catch {}
        }

        // Auto-create linked return booking if requested
        if (returnTrip && autoCreateReturnTrip && returnDate && returnTime) {
          try {
            const retPickupAddr = returnPickupAddress.trim() || dropoffAddress;
            const retDropoffAddr = returnDropoffAddress.trim() || pickupAddress;
            const returnScheduledTime = new Date(`${returnDate}T${returnTime}:00`).toISOString();
            
            const returnCarSeatSummaryParts = [
              returnRearFacing > 0 ? `${returnRearFacing} Rear-Facing` : null,
              returnFrontFacing > 0 ? `${returnFrontFacing} Front-Facing` : null,
              returnBooster > 0 ? `${returnBooster} Booster` : null,
            ].filter(Boolean);

            const returnSpecialRequests = returnCarSeats && returnCarSeatSummaryParts.length > 0
              ? `Car Seats: ${returnCarSeatSummaryParts.join(', ')}`
              : undefined;

            const returnPayload: CreateTripInput = {
              bookingType: 'scheduled',
              scheduledPickupTime: returnScheduledTime,
              pickupLocation: {
                address: retPickupAddr,
                coordinates: returnPickupCoordinates || dropoffCoordinates,
              },
              dropoffLocation: {
                address: retDropoffAddr,
                coordinates: returnDropoffCoordinates || pickupCoordinates,
              },
              intermediateStops:
                returnIntermediateStops.length > 0
                  ? returnIntermediateStops.map((s) => ({ address: s.address, coordinates: s.coordinates }))
                  : undefined,
              passenger: {
                firstName,
                lastName,
                phone,
                email,
                passengerCount: returnPassengers,
                luggageCount: returnBags,
                specialRequests: returnSpecialRequests,
              },
              vehicleTier: returnVehicles[0] === 'suv' ? 'xl' : returnVehicles[0] === 'van' ? 'wheelchair' : 'premium',
              driverNotes: notesForAll,
              pricing: {
                baseFare: 5.0,
                distanceMiles: estimatedDistanceMiles,
                durationMinutes: estimatedDurationMinutes,
                distanceRate: 2.5,
                timeRate: 0.5,
                vehicleMultiplier: 1.0,
                surgeMultiplier: 1.0,
                discountAmount: 0,
                subtotal: finalFare,
                totalFare: finalFare,
                currency: 'USD',
              },
              payment: {
                method,
                status: 'pending',
                amount: finalFare,
              },
              metadata: {
                ...metadataPayload,
                linkedTripId: createdTrip.id,
                isReturnRide: true,
                createdByRole: 'dispatcher',
              },
            };
            await service.createBooking(returnPayload);
          } catch (retErr) {
            console.warn('[DispatchBookingEngine] Failed to create linked return trip:', retErr);
          }
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
    <form onSubmit={handleSubmit} className="flex flex-col h-full bg-slate-50 select-none text-xs">
      {/* ─── Scrollable Form Body ─── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {submitError && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs font-semibold flex items-center gap-1.5">
            <span>⚠</span>
            <span>{submitError}</span>
          </div>
        )}

        {/* ─── Timing Selector ─── */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
            Pickup Time
          </label>
          <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setTimingType('asap')}
              className={`py-1.5 text-center rounded font-semibold transition-all ${
                timingType === 'asap'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              ⚡ ASAP (Live)
            </button>
            <button
              type="button"
              onClick={() => setTimingType('later')}
              className={`py-1.5 text-center rounded font-semibold transition-all ${
                timingType === 'later'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              📅 Schedule Later
            </button>
          </div>

          {timingType === 'later' && (
            <div className="grid grid-cols-2 gap-2 pt-1 animate-in fade-in duration-150">
              <div>
                <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Date</span>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  required
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Time</span>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  required
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* ─── Routing Section (Outbound) ─── */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Route</label>
            <button
              type="button"
              onClick={handleSwapRoute}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
              title="Reverse pickup and dropoff locations"
            >
              <span>⇄</span>
              <span>Swap Route</span>
            </button>
          </div>

          <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm space-y-1.5">
            <div className="relative">
              <div className="space-y-1.5">
                <DispatchLocationInput
                  placeholder="Pickup Location"
                  value={pickupAddress}
                  variant="pickup"
                  onChange={setPickupAddress}
                  onPlaceSelected={(p) => {
                    setPickupAddress(p.address);
                    setPickupCoordinates(p.coordinates);
                  }}
                  required
                />

                {intermediateStops.map((stop, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <DispatchLocationInput
                      placeholder={`Stop #${idx + 1}`}
                      value={stop.address}
                      variant="stop"
                      onChange={(val) => {
                        const updated = [...intermediateStops];
                        updated[idx].address = val;
                        setIntermediateStops(updated);
                      }}
                      onPlaceSelected={(p) => {
                        const updated = [...intermediateStops];
                        updated[idx] = { address: p.address, coordinates: p.coordinates };
                        setIntermediateStops(updated);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setIntermediateStops(intermediateStops.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-red-500 px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <DispatchLocationInput
                  placeholder="Dropoff Location"
                  value={dropoffAddress}
                  variant="dropoff"
                  onChange={setDropoffAddress}
                  onPlaceSelected={(p) => {
                    setDropoffAddress(p.address);
                    setDropoffCoordinates(p.coordinates);
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
              <button
                type="button"
                onClick={() => setIntermediateStops([...intermediateStops, { address: '' }])}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                + Add stop
              </button>
            </div>
          </div>
        </div>

        {/* ─── Passengers Section ─── */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Passengers</label>
            <button
              type="button"
              onClick={handleAddPassenger}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-bold"
            >
              + Add passenger
            </button>
          </div>

          <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2">
            {/* Primary Passenger */}
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-slate-400">👤</span>
              <input
                type="text"
                placeholder="Primary Passenger Name"
                value={passengerName}
                onChange={(e) => setPassengerName(e.target.value)}
                required
                className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400">📞</span>
                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400">✉️</span>
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

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
                <span>👤</span>
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
                <span>🧳</span>
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

            {/* Car Seats Master Toggle */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                  <input
                    type="checkbox"
                    checked={carSeats}
                    onChange={(e) => handleToggleCarSeats(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800">Car Seats Required</span>
                </label>
                {carSeats && (
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                    Total: {totalCarSeats} / {carSeatLimits.maxTotalCarSeats} max
                  </span>
                )}
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
                <div className="flex-1 grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded">
                  {(['sedan', 'suv', 'van'] as const).map((tierKey) => {
                    const isSelected = vChoice === tierKey;
                    const cap = vehicleCapacities[tierKey] || { maxPassengers: 4, maxBags: 3 };
                    return (
                      <button
                        type="button"
                        key={tierKey}
                        onClick={() => handleUpdateVehicleChoice(idx, tierKey)}
                        className={`py-1 text-center rounded text-[11px] font-bold capitalize transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                        }`}
                      >
                        {tierKey} <span className="text-[9px] opacity-80">({cap.maxPassengers}p)</span>
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

          {/* Credit Card Sub-Panel */}
          {paymentMethod === 'card' && (
            <div className="p-2 mb-2 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded">
                <button
                  type="button"
                  onClick={() => setCardPaymentType('terminal')}
                  className={`flex-1 py-1 text-center rounded text-[11px] font-bold transition-all ${
                    cardPaymentType === 'terminal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  💳 Terminal (In-Car)
                </button>
                <button
                  type="button"
                  onClick={() => setCardPaymentType('manual')}
                  className={`flex-1 py-1 text-center rounded text-[11px] font-bold transition-all ${
                    cardPaymentType === 'manual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  📝 Card On File / Manual
                </button>
              </div>

              {cardPaymentType === 'manual' && (
                <div className="space-y-1.5 pt-1">
                  <input
                    type="text"
                    placeholder="Cardholder Name"
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                  />
                  <input
                    type="text"
                    placeholder="16-Digit Card Number"
                    maxLength={19}
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      placeholder="MM/YY"
                      maxLength={5}
                      value={cardExp}
                      onChange={(e) => setCardExp(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-center font-mono"
                    />
                    <input
                      type="password"
                      placeholder="CVC"
                      maxLength={4}
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-center font-mono"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveCardOnFile}
                      onChange={(e) => setSaveCardOnFile(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>Save card securely on file for future rides</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Corporate Account Sub-Panel */}
          {paymentMethod === 'account' && (
            <div className="p-2 mb-2 bg-amber-50/80 border border-amber-300 rounded-lg space-y-1.5">
              <div className="text-[10px] font-bold text-amber-900 uppercase">Corporate Account Billing</div>
              <div>
                <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">Corporate Client</span>
                <select
                  value={corporateAccount}
                  onChange={(e) => setCorporateAccount(e.target.value)}
                  className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs text-slate-800"
                >
                  {DEFAULT_CORPORATE_ACCOUNTS.map((acc) => (
                    <option key={acc} value={acc}>
                      {acc}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">Billing PO / Code</span>
                  <input
                    type="text"
                    placeholder="PO-2026-XXXX"
                    value={billingPo}
                    onChange={(e) => setBillingPo(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">Authorized By</span>
                  <input
                    type="text"
                    placeholder="Dept Manager"
                    value={authorizedBy}
                    onChange={(e) => setAuthorizedBy(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs"
                  />
                </div>
              </div>
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
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Tariff</span>
              <select
                value={tariff}
                onChange={(e) => setTariff(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
              >
                <option value="Standard">Standard</option>
                <option value="Flat Rate">Flat Rate</option>
                <option value="Hourly">Hourly</option>
                <option value="Corporate">Corporate</option>
              </select>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Discount</span>
              <select
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
              >
                <option value="None">None</option>
                <option value="5%">5% Off</option>
                <option value="10%">10% Off</option>
                <option value="15%">15% Off</option>
                <option value="20%">20% Off</option>
              </select>
            </div>
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
                {DEFAULT_DRIVERS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
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
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={returnTrip}
                  onChange={(e) => setReturnTrip(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-bold text-slate-800">Return Trip (Round Trip)</span>
              </label>

              {returnTrip && (
                <div className="mt-1.5 p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2.5">
                  <div className="text-[10px] font-bold text-indigo-900 flex items-center justify-between">
                    <span>🔁 RETURN LEG SPECIFICATIONS</span>
                    <button
                      type="button"
                      onClick={handleSwapReturnRoute}
                      className="text-[9px] bg-indigo-200 hover:bg-indigo-300 text-indigo-900 px-1.5 py-0.5 rounded font-bold"
                    >
                      ⇄ Swap Return Route
                    </button>
                  </div>

                  {/* Return Route Locations */}
                  <div className="space-y-1.5 p-2 bg-white border border-indigo-200 rounded">
                    <div className="text-[10px] font-bold text-indigo-800">Return Route</div>
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

                    <button
                      type="button"
                      onClick={() => setReturnIntermediateStops([...returnIntermediateStops, { address: '' }])}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      + Add return stop
                    </button>
                  </div>

                  {/* Return Date & Time */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <span className="block text-[9px] text-indigo-700 font-semibold mb-0.5">Return Date</span>
                      <input
                        type="date"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs"
                      />
                    </div>
                    <div>
                      <span className="block text-[9px] text-indigo-700 font-semibold mb-0.5">Return Time</span>
                      <input
                        type="time"
                        value={returnTime}
                        onChange={(e) => setReturnTime(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs"
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
                        onChange={(e) => setReturnCarSeats(e.target.checked)}
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
                        <div className="flex-1 grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded">
                          {(['sedan', 'suv', 'van'] as const).map((tierKey) => (
                            <button
                              type="button"
                              key={tierKey}
                              onClick={() => handleUpdateReturnVehicle(rIdx, tierKey)}
                              className={`py-0.5 text-center rounded text-[10px] font-bold capitalize ${
                                rv === tierKey ? 'bg-indigo-600 text-white' : 'text-slate-600'
                              }`}
                            >
                              {tierKey}
                            </button>
                          ))}
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
                    <span>🔄 RECURRING SCHEDULE</span>
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
                      <input
                        type="date"
                        value={repeatUntilDate}
                        onChange={(e) => setRepeatUntilDate(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-emerald-300 rounded text-xs text-slate-800 font-medium"
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

      {/* ─── Sticky Action Bar (Pinned Bottom) ─── */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 px-3 py-2 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-1.5">
          {isFareOverridden ? (
            <div className="flex items-center gap-1">
              <span className="font-bold text-blue-600">$</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={manualFare}
                onChange={(e) => setManualFare(e.target.value)}
                className="w-20 px-2 py-1 bg-white border border-blue-400 rounded font-mono font-bold text-sm text-blue-700"
              />
              <button
                type="button"
                onClick={() => setIsFareOverridden(false)}
                className="text-[10px] text-slate-400 hover:text-slate-600 underline"
              >
                Reset
              </button>
            </div>
          ) : (
            <div
              onClick={() => {
                setIsFareOverridden(true);
                setManualFare(estimatedFare ? estimatedFare.toFixed(2) : '');
              }}
              className="cursor-pointer group flex items-baseline gap-1"
              title="Click to manually override fare"
            >
              <span className="text-lg font-mono font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                ${estimatedFare ? estimatedFare.toFixed(2) : '0.00'}
              </span>
              <span className="text-[10px] text-slate-400 group-hover:text-blue-500 font-semibold">
                (Est. ✎)
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isEditMode && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-600 font-bold text-xs transition-colors"
            >
              Clear
            </button>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>{isEditMode ? 'Update Booking' : 'Book Trip'}</span>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
