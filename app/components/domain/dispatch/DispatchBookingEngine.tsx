import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Trip, GeoPoint, CreateTripInput, VehicleTier, PaymentMethod } from '../../../core/types';
import { getBookingService } from '../../../core/services/booking';
import { calculateLiveRoute } from '../../../core/services/maps/live-routing.service';
import { calculateTripPricing } from '../../../core/services/pricing';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';
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

export interface ReturnTripDetails {
  returnTrip: boolean;
  returnDate: string;
  returnTime: string;
  autoCreateReturnTrip: boolean;
}

export interface RepeatTripDetails {
  repeat: boolean;
  repeatFrequency: 'daily' | 'weekdays' | 'weekly' | 'custom';
  repeatDays: string[];
  repeatOccurrences: number;
  repeatEndDate: string;
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

  // Form State
  const [timingType, setTimingType] = useState<'asap' | 'later'>('asap');
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState('12:00');
  
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

  // Details
  const [passengers, setPassengers] = useState(1);
  const [bags, setBags] = useState(0);
  const [carSeats, setCarSeats] = useState(false);

  // Vehicle
  const [vehicle, setVehicle] = useState<'any' | 'sedan' | 'suv' | 'van'>('any');

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

  // Return & Repeat
  const [returnTrip, setReturnTrip] = useState(false);
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [returnTime, setReturnTime] = useState('17:00');
  const [autoCreateReturnTrip, setAutoCreateReturnTrip] = useState(true);

  const [repeat, setRepeat] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<'daily' | 'weekdays' | 'weekly' | 'custom'>('weekdays');
  const [repeatDays, setRepeatDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [repeatOccurrences, setRepeatOccurrences] = useState(5);
  const [repeatEndDate, setRepeatEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });

  // Pricing
  const [estimatedFare, setEstimatedFare] = useState(0);
  const [manualFare, setManualFare] = useState('');
  const [isFareOverridden, setIsFareOverridden] = useState(false);
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(0);
  const [estimatedDistanceMiles, setEstimatedDistanceMiles] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
        } catch {
          // keep defaults
        }
      }
      setPickupAddress(initialTrip.pickupLocation?.address || '');
      setPickupCoordinates(initialTrip.pickupLocation?.coordinates);
      setDropoffAddress(initialTrip.dropoffLocation?.address || '');
      setDropoffCoordinates(initialTrip.dropoffLocation?.coordinates);
      if (initialTrip.intermediateStops) {
        setIntermediateStops(
          initialTrip.intermediateStops.map((s) => ({ address: s.address, coordinates: s.coordinates }))
        );
      }
      const pName = `${initialTrip.passenger?.firstName || ''} ${initialTrip.passenger?.lastName || ''}`.trim();
      setPassengerName(pName);
      setPhone(initialTrip.passenger?.phone || '');
      setEmail(initialTrip.passenger?.email || '');
      setPassengers(initialTrip.passenger?.passengerCount || 1);
      setBags(initialTrip.passenger?.luggageCount || 0);
      setCarSeats(Boolean(initialTrip.passenger?.specialRequests?.toLowerCase().includes('car seat')));

      // Hydrate metadata extensions
      const meta = (initialTrip.metadata || {}) as any;
      if (meta.additionalPassengers && Array.isArray(meta.additionalPassengers)) {
        setAdditionalPassengers(meta.additionalPassengers);
      }
      if (meta.contactPerson) {
        setIsBookerDifferent(Boolean(meta.contactPerson.isBookerDifferent));
        setContactName(meta.contactPerson.contactName || '');
        setContactPhone(meta.contactPerson.contactPhone || '');
        setContactEmail(meta.contactPerson.contactEmail || '');
        setContactRole(meta.contactPerson.contactRole || 'Hotel Front Desk / Concierge');
      }
      if (meta.cardDetails) {
        setCardPaymentType(meta.cardDetails.cardPaymentType || 'terminal');
        setCardholderName(meta.cardDetails.cardholderName || '');
        setCardNumber(meta.cardDetails.cardNumber || '');
        setCardExp(meta.cardDetails.cardExp || '');
        setSaveCardOnFile(Boolean(meta.cardDetails.saveCardOnFile));
      }
      if (meta.corporateDetails) {
        setCorporateAccount(meta.corporateDetails.corporateAccount || DEFAULT_CORPORATE_ACCOUNTS[0]);
        setBillingPo(meta.corporateDetails.billingPo || '');
        setAuthorizedBy(meta.corporateDetails.authorizedBy || '');
        setInvoicingTerms(meta.corporateDetails.invoicingTerms || 'Net 30 Direct Bill');
      }
      if (meta.returnDetails) {
        setReturnTrip(Boolean(meta.returnDetails.returnTrip));
        setReturnDate(meta.returnDetails.returnDate || new Date().toISOString().split('T')[0]);
        setReturnTime(meta.returnDetails.returnTime || '17:00');
        setAutoCreateReturnTrip(Boolean(meta.returnDetails.autoCreateReturnTrip));
      }
      if (meta.repeatDetails) {
        setRepeat(Boolean(meta.repeatDetails.repeat));
        setRepeatFrequency(meta.repeatDetails.repeatFrequency || 'weekdays');
        setRepeatDays(meta.repeatDetails.repeatDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
        setRepeatOccurrences(meta.repeatDetails.repeatOccurrences || 5);
        setRepeatEndDate(meta.repeatDetails.repeatEndDate || '');
      }

      const tier = initialTrip.vehicleTier;
      if (tier === 'xl') setVehicle('suv');
      else if (tier === 'wheelchair') setVehicle('van');
      else if (tier === 'premium') setVehicle('sedan');
      else setVehicle('any');

      if (initialTrip.payment?.method === 'card') setPaymentMethod('card');
      else if (initialTrip.payment?.method === 'corporate') setPaymentMethod('account');
      else setPaymentMethod('cash');

      setCompany(meta.company || DEFAULT_COMPANIES[0]);
      setDriverId(initialTrip.assignedDriverId || 'unassigned');
      setNotesForAll(initialTrip.driverNotes || initialTrip.pickupLocation?.notes || '');
      setInternalNotes(meta.internalNotes || '');

      const fare = initialTrip.pricing?.totalFare || 0;
      setEstimatedFare(fare);
      setManualFare(fare > 0 ? fare.toFixed(2) : '');
      setIsFareOverridden(fare > 0);
      setEstimatedDistanceMiles(initialTrip.pricing?.distanceMiles || 0);
      setEstimatedDurationMinutes(initialTrip.pricing?.durationMinutes || 0);
    } else {
      // Try restore from localStorage for drafts
      try {
        const saved = localStorage.getItem(draftStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.pickupAddress) setPickupAddress(parsed.pickupAddress);
          if (parsed.pickupCoordinates) setPickupCoordinates(parsed.pickupCoordinates);
          if (parsed.dropoffAddress) setDropoffAddress(parsed.dropoffAddress);
          if (parsed.dropoffCoordinates) setDropoffCoordinates(parsed.dropoffCoordinates);
          if (parsed.passengerName) setPassengerName(parsed.passengerName);
          if (parsed.phone) setPhone(parsed.phone);
          if (parsed.email) setEmail(parsed.email);
          if (parsed.additionalPassengers) setAdditionalPassengers(parsed.additionalPassengers);
          if (parsed.isBookerDifferent !== undefined) setIsBookerDifferent(parsed.isBookerDifferent);
          if (parsed.contactName) setContactName(parsed.contactName);
          if (parsed.contactPhone) setContactPhone(parsed.contactPhone);
          if (parsed.passengers) setPassengers(parsed.passengers);
          if (parsed.bags !== undefined) setBags(parsed.bags);
          if (parsed.vehicle) setVehicle(parsed.vehicle);
          if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
          if (parsed.cardPaymentType) setCardPaymentType(parsed.cardPaymentType);
          if (parsed.corporateAccount) setCorporateAccount(parsed.corporateAccount);
          if (parsed.billingPo) setBillingPo(parsed.billingPo);
          if (parsed.notesForAll) setNotesForAll(parsed.notesForAll);
          if (parsed.internalNotes) setInternalNotes(parsed.internalNotes);
          if (parsed.company) setCompany(parsed.company);
          if (parsed.driverId) setDriverId(parsed.driverId);
          if (parsed.returnTrip !== undefined) setReturnTrip(parsed.returnTrip);
          if (parsed.repeat !== undefined) setRepeat(parsed.repeat);
          if (parsed.estimatedFare) setEstimatedFare(parsed.estimatedFare);
          if (parsed.manualFare) {
            setManualFare(parsed.manualFare);
            setIsFareOverridden(true);
          }
        }
      } catch {
        // ignore
      }
    }
  }, [initialTrip, draftStorageKey]);

  // Persist draft to local storage on changes (only if not editing live trip)
  useEffect(() => {
    if (isEditMode) return;
    try {
      const stateToSave = {
        pickupAddress,
        pickupCoordinates,
        dropoffAddress,
        dropoffCoordinates,
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
        vehicle,
        paymentMethod,
        cardPaymentType,
        cardholderName,
        corporateAccount,
        billingPo,
        authorizedBy,
        notesForAll,
        internalNotes,
        company,
        driverId,
        returnTrip,
        returnDate,
        returnTime,
        autoCreateReturnTrip,
        repeat,
        repeatFrequency,
        repeatDays,
        repeatOccurrences,
        repeatEndDate,
        estimatedFare,
        manualFare,
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(stateToSave));
    } catch {
      // ignore
    }
  }, [
    isEditMode,
    draftStorageKey,
    pickupAddress,
    pickupCoordinates,
    dropoffAddress,
    dropoffCoordinates,
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
    vehicle,
    paymentMethod,
    cardPaymentType,
    cardholderName,
    corporateAccount,
    billingPo,
    authorizedBy,
    notesForAll,
    internalNotes,
    company,
    driverId,
    returnTrip,
    returnDate,
    returnTime,
    autoCreateReturnTrip,
    repeat,
    repeatFrequency,
    repeatDays,
    repeatOccurrences,
    repeatEndDate,
    estimatedFare,
    manualFare,
  ]);

  // Notify parent of values change (for map sync, etc.)
  useEffect(() => {
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
      vehicle,
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
        returnDate,
        returnTime,
        autoCreateReturnTrip,
      },
      repeatDetails: {
        repeat,
        repeatFrequency,
        repeatDays,
        repeatOccurrences,
        repeatEndDate,
      },
      estimatedFare: isFareOverridden && manualFare ? parseFloat(manualFare) || 0 : estimatedFare,
      manualFare,
      isFareOverridden,
      estimatedDurationMinutes,
      estimatedDistanceMiles,
    });
  }, [
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
    vehicle,
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
    returnDate,
    returnTime,
    autoCreateReturnTrip,
    repeat,
    repeatFrequency,
    repeatDays,
    repeatOccurrences,
    repeatEndDate,
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
          let tier: VehicleTier = 'standard';
          if (vehicle === 'suv') tier = 'xl';
          if (vehicle === 'van') tier = 'wheelchair';
          if (vehicle === 'sedan') tier = 'premium';

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
          setEstimatedFare(quote.pricing.totalFare);
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
    vehicle,
    timingType,
    scheduledDate,
    scheduledTime,
    isFareOverridden,
  ]);

  // Reverse route
  const handleSwapRoute = () => {
    const tmpAddr = pickupAddress;
    const tmpCoords = pickupCoordinates;
    setPickupAddress(dropoffAddress);
    setPickupCoordinates(dropoffCoordinates);
    setDropoffAddress(tmpAddr);
    setDropoffCoordinates(tmpCoords);
  };

  // Add extra passenger
  const handleAddPassenger = () => {
    setAdditionalPassengers([...additionalPassengers, { name: '', phone: '' }]);
    setPassengers((p) => p + 1);
  };

  const handleRemovePassenger = (index: number) => {
    setAdditionalPassengers(additionalPassengers.filter((_, i) => i !== index));
    setPassengers((p) => Math.max(1, p - 1));
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
    setVehicle('any');
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
    setRepeat(false);
    setEstimatedFare(0);
    setManualFare('');
    setIsFareOverridden(false);
    setEstimatedDurationMinutes(0);
    setEstimatedDistanceMiles(0);
    setSubmitError(null);

    try {
      localStorage.removeItem(draftStorageKey);
    } catch {
      // ignore
    }

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

    let tier: VehicleTier = 'standard';
    if (vehicle === 'suv') tier = 'xl';
    else if (vehicle === 'van') tier = 'wheelchair';
    else if (vehicle === 'sedan') tier = 'premium';

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

    const metadataPayload = {
      company,
      internalNotes,
      tariff,
      discount,
      additionalPassengers,
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
            returnDate,
            returnTime,
            autoCreateReturnTrip,
          }
        : undefined,
      repeatDetails: repeat
        ? {
            repeat: true,
            repeatFrequency,
            repeatDays,
            repeatOccurrences,
            repeatEndDate,
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
            specialRequests: carSeats ? 'Car Seats Required' : undefined,
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
            specialRequests: carSeats ? 'Car Seats Required' : undefined,
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
          } catch {
            // ignore
          }
        }

        // Auto-create linked return booking if requested
        if (returnTrip && autoCreateReturnTrip && returnDate && returnTime) {
          try {
            const returnScheduledTime = new Date(`${returnDate}T${returnTime}:00`).toISOString();
            const returnPayload: CreateTripInput = {
              ...payload,
              bookingType: 'scheduled',
              scheduledPickupTime: returnScheduledTime,
              pickupLocation: {
                address: dropoffAddress,
                coordinates: dropoffCoordinates,
              },
              dropoffLocation: {
                address: pickupAddress,
                coordinates: pickupCoordinates,
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
        } catch {
          // ignore
        }

        onBookingSuccess?.(createdTrip, false);
      }
    } catch (err: any) {
      console.error('[DispatchBookingEngine] Submit failed:', err);
      setSubmitError(err.message || 'Failed to submit booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayFare =
    isFareOverridden && manualFare
      ? `$${parseFloat(manualFare) || 0}`
      : estimatedFare > 0
      ? `~$${Math.round(estimatedFare)}`
      : '~$0';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full text-slate-800 text-xs">
      {/* Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {submitError && (
          <div className="p-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded font-medium">
            {submitError}
          </div>
        )}

        {/* ─── Timing Toggle & Date/Time ─── */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer shrink-0 select-none font-semibold text-slate-700">
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
            <div className="flex items-center gap-1 flex-1">
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-1/2 px-2 py-1 bg-white border border-slate-300 rounded text-slate-700 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-1/2 px-2 py-1 bg-white border border-slate-300 rounded text-slate-700 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          ) : (
            <div className="flex-1 px-3 py-1 bg-slate-100 border border-slate-200 rounded text-slate-500 text-center font-medium">
              ASAP (Immediate Ride)
            </div>
          )}
        </div>

        {/* ─── Route Section ─── */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Route</label>
          <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2">
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                title="Swap Pickup and Dropoff"
                onClick={handleSwapRoute}
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
              >
                ↕
              </button>
              <div className="flex-1 space-y-1.5">
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

            {/* Estimate & Add Stop */}
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

        {/* ─── Trip Details (Pax, Bags, Car Seats) ─── */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">
            Trip Details
          </label>
          <div className="p-2.5 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                <span>👤</span>
                <span>Total Passengers</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPassengers(Math.max(1, passengers - 1))}
                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                >
                  -
                </button>
                <span className="w-5 text-center font-bold">{passengers}</span>
                <button
                  type="button"
                  onClick={() => setPassengers(Math.min(14, passengers + 1))}
                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                <span>🧳</span>
                <span>Bags</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBags(Math.max(0, bags - 1))}
                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                >
                  -
                </button>
                <span className="w-5 text-center font-bold">{bags}</span>
                <button
                  type="button"
                  onClick={() => setBags(Math.min(10, bags + 1))}
                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                >
                  +
                </button>
              </div>
            </div>

            <div className="pt-1 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                <input
                  type="checkbox"
                  checked={carSeats}
                  onChange={(e) => setCarSeats(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium">Car Seats Required</span>
              </label>
            </div>
          </div>
        </div>

        {/* ─── Vehicles (Segmented) ─── */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Vehicles</label>
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-200/70 border border-slate-300 rounded-lg">
            {(['any', 'sedan', 'suv', 'van'] as const).map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => setVehicle(v)}
                className={`py-1.5 text-center rounded font-semibold capitalize transition-all ${
                  vehicle === v
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {v}
              </button>
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
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    maxLength={19}
                    placeholder="Card Number (•••• •••• •••• ••••)"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      maxLength={5}
                      placeholder="MM/YY"
                      value={cardExp}
                      onChange={(e) => setCardExp(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-center font-mono focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="CVC"
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-center font-mono focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-600 text-[11px] select-none">
                    <input
                      type="checkbox"
                      checked={saveCardOnFile}
                      onChange={(e) => setSaveCardOnFile(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>Save card on file for future rides</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Corporate Account Sub-Panel */}
          {paymentMethod === 'account' && (
            <div className="p-2 mb-2 bg-amber-50/70 border border-amber-200 rounded-lg space-y-1.5">
              <div className="text-[10px] uppercase font-bold text-amber-800 tracking-wide">
                Corporate Direct Bill Account
              </div>
              <div>
                <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">Corporate Client</span>
                <select
                  value={corporateAccount}
                  onChange={(e) => setCorporateAccount(e.target.value)}
                  className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs text-slate-800 font-medium"
                >
                  {DEFAULT_CORPORATE_ACCOUNTS.map((acc) => (
                    <option key={acc} value={acc}>
                      {acc}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
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
              placeholder="e.g., Gate code is #1234, come to the side door..."
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
              placeholder="e.g., VIP client, handle with care..."
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              className="w-full p-2 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* ─── Return Trip & Repeat Toggles with Extended Panels ─── */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            {/* Return Trip */}
            <div>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={returnTrip}
                  onChange={(e) => setReturnTrip(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-bold text-slate-800">Return Trip</span>
              </label>

              {returnTrip && (
                <div className="mt-1.5 p-2 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-1.5">
                  <div className="text-[10px] font-bold text-indigo-900 flex items-center justify-between">
                    <span>🔁 REVERSED ROUTE SCHEDULE</span>
                    <span className="text-[9px] bg-indigo-200 text-indigo-800 px-1 rounded">
                      Dropoff &rarr; Pickup
                    </span>
                  </div>
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
                  <label className="flex items-center gap-2 cursor-pointer text-indigo-900 text-[11px] select-none pt-0.5">
                    <input
                      type="checkbox"
                      checked={autoCreateReturnTrip}
                      onChange={(e) => setAutoCreateReturnTrip(e.target.checked)}
                      className="rounded border-indigo-300 text-indigo-600"
                    />
                    <span>Automatically generate linked return booking in queue</span>
                  </label>
                </div>
              )}
            </div>

            {/* Repeat / Recurring */}
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
                <div className="mt-1.5 p-2 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2">
                  <div className="text-[10px] font-bold text-emerald-900">
                    🔄 RECURRING SCHEDULE
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

                  {/* Occurrences / End Date */}
                  <div className="flex items-center justify-between pt-1 border-t border-emerald-200/70">
                    <span className="text-[10px] font-semibold text-emerald-800">Occurrences</span>
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
                        onClick={() => setRepeatOccurrences(Math.min(30, repeatOccurrences + 1))}
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
                value={manualFare}
                onChange={(e) => setManualFare(e.target.value)}
                className="w-16 px-1.5 py-0.5 border border-blue-400 rounded text-blue-600 font-bold text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setIsFareOverridden(false);
                  setManualFare('');
                }}
                className="text-[10px] text-slate-400 hover:text-slate-600 underline"
              >
                Auto
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsFareOverridden(true);
                setManualFare(estimatedFare.toFixed(2));
              }}
              title="Click to manually override fare"
              className="text-base font-extrabold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              {displayFare}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1 disabled:opacity-50 transition-colors"
          >
            {isSubmitting && <SpinnerIcon className="w-3 h-3 animate-spin text-white" />}
            {isEditMode ? 'Save Changes' : 'Book'}
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 text-slate-600 font-semibold text-xs transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </form>
  );
}
