import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  Trip,
  CreateTripInput,
  TripLocation,
  VehicleTier,
  PaymentMethod,
  TripPricing,
} from '../../core/types';
import { getBookingService, getEmailDispatchService, type QuoteResponse } from '../../core/services';
import {
  detectAirportInAddresses,
  VEHICLE_LUGGAGE_CAPACITY,
  MAJOR_AIRLINES,
} from '../../core/config/airports';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import {
  type BookingRole,
  type RoleBookingConfig,
  getRoleFormConfig,
} from '../../config/roleFormConfig';
import { usePassengerLookup } from '../../core/hooks/usePassengerLookup';
import type { PassengerProfile } from '../../core/services/booking/passenger-lookup.service';
import { LocationAutocomplete, type PlaceSelectedDetails } from './LocationAutocomplete';
import { VehicleTierSelector } from './VehicleTierSelector';
import { AirportDetectedBanner } from './AirportDetectedBanner';
import { LuggageCapacityWarning } from './LuggageCapacityWarning';
import { BookingConfirmation, type EmailDeliveryFeedback } from './BookingConfirmation';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Alert,
  Input,
  Textarea,
  Select,
  RadioGroup,
  Checkbox,
  Switch,
  Counter,
} from '../ui';
import {
  CheckIcon,
  ChevronRightIcon,
  SpinnerIcon,
  ClockIcon,
  MapPinIcon,
  FlagIcon,
  CarIcon,
  SparklesIcon,
  LuggageIcon,
  UserIcon,
  AccessibilityIcon,
  PhoneIcon,
  MailIcon,
  PlaneIcon,
  SearchIcon,
  RepeatIcon,
  DollarSignIcon,
  SlidersIcon,
  InfoIcon,
  UserCheckIcon,
  ShieldCheckIcon,
} from '../ui/Icons';

export interface BookingEngineProps {
  mode?: BookingRole; // 'customer' | 'dispatcher' | 'admin'
  config?: Partial<RoleBookingConfig>;
  initialValues?: Partial<Record<string, unknown>>;
  onBookingSuccess?: (trips: Trip[]) => void;
  className?: string;
}

export function BookingEngine({
  mode = 'customer',
  config: configOverrides,
  initialValues = {},
  onBookingSuccess,
  className = '',
}: BookingEngineProps) {
  // 1. Resolve role configuration
  const roleConfig = useMemo(
    () => getRoleFormConfig(mode, configOverrides),
    [mode, configOverrides]
  );
  const { capabilities } = roleConfig;

  // 2. Active focused field for contextual help panel
  const [activeField, setActiveField] = useState<string | null>(null);

  // 3. Passenger Lookup Hook (for dispatcher/admin)
  const passengerLookup = usePassengerLookup();

  // 4. Form state
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() => ({
    // Timing
    bookingType: 'asap',
    scheduledDate: '',
    scheduledTime: '',
    // Locations
    pickupAddress: '',
    pickupNotes: '',
    hasIntermediateStop: false,
    intermediateStopAddress: '',
    intermediateStopNotes: '',
    dropoffAddress: '',
    dropoffNotes: '',
    // Flight Ops
    airlineCode: '',
    flightNumber: '',
    departureAirport: '',
    hasCheckedLuggage: false,
    isAirportTrip: false,
    // Passengers & Luggage
    passengerCount: 1,
    luggageCount: 0,
    // Vehicle
    vehicleTier: 'standard' as VehicleTier,
    // Passenger Info
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    corporateAccountId: '',
    specialRequests: '',
    promoCode: '',
    // Dispatcher Overrides
    driverAssignmentType: 'broadcast',
    assignedDriverId: '',
    isRecurring: false,
    recurringFrequency: 'weekly',
    recurringOccurrences: 4,
    recurringEndDate: '',
    isPriceOverridden: false,
    manualFare: '',
    overrideReason: '',
    lineItemNotes: '',
    bypassPayment: false,
    bypassReason: 'cash_in_cab',
    // Customer Payment
    paymentMethod: 'card' as PaymentMethod,
    termsAccepted: false,
    ...initialValues,
  }));

  // Field validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Quote calculation state
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedTrips, setConfirmedTrips] = useState<Trip[] | null>(null);
  const [emailDelivery, setEmailDelivery] = useState<EmailDeliveryFeedback>({ status: 'idle' });

  // Refs for scrolling to errors
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Airport detection based on pickup and dropoff addresses
  const airportDetection = useMemo(() => {
    const pickup = String(formValues.pickupAddress || '');
    const dropoff = String(formValues.dropoffAddress || '');
    return detectAirportInAddresses(pickup, dropoff);
  }, [formValues.pickupAddress, formValues.dropoffAddress]);

  // Synchronize airport status
  useEffect(() => {
    setFormValues((prev) => {
      if (prev.isAirportTrip === airportDetection.isAirportTrip) return prev;
      return { ...prev, isAirportTrip: airportDetection.isAirportTrip };
    });
  }, [airportDetection.isAirportTrip]);

  // Vehicle luggage capacity calculation
  const currentVehicleTier = (formValues.vehicleTier as VehicleTier) || 'standard';
  const maxAllowedLuggage = VEHICLE_LUGGAGE_CAPACITY[currentVehicleTier] ?? 2;
  const currentLuggageCount = Number(formValues.luggageCount) || 0;
  const isLuggageOverCapacity = currentLuggageCount > maxAllowedLuggage;

  // Handle field change
  const handleFieldChange = (name: string, value: unknown) => {
    let processed = value;
    if (name === 'departureAirport' && typeof value === 'string') {
      processed = value.toUpperCase();
    }

    setFormValues((prev) => {
      const next = { ...prev, [name]: processed };
      if (name === 'pickupAddress' && prev.pickupAddress !== processed) {
        delete next.pickupAddress_placeId;
        delete next.pickupAddress_coordinates;
      } else if (name === 'dropoffAddress' && prev.dropoffAddress !== processed) {
        delete next.dropoffAddress_placeId;
        delete next.dropoffAddress_coordinates;
      } else if (name === 'intermediateStopAddress' && prev.intermediateStopAddress !== processed) {
        delete next.intermediateStopAddress_placeId;
        delete next.intermediateStopAddress_coordinates;
      }
      return next;
    });

    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // Google Places Autocomplete selection
  const handlePlaceSelected = (
    fieldName: string,
    details: PlaceSelectedDetails
  ) => {
    setFormValues((prev) => ({
      ...prev,
      [fieldName]: details.address,
      [`${fieldName}_placeId`]: details.placeId,
      [`${fieldName}_coordinates`]: details.coordinates,
    }));

    if (errors[fieldName]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  // Auto-fill from Passenger Lookup selection
  const handleSelectPassengerProfile = (profile: PassengerProfile) => {
    passengerLookup.selectProfile(profile);
    setFormValues((prev) => ({
      ...prev,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      email: profile.email,
      corporateAccountId: profile.corporateAccountId || prev.corporateAccountId,
      specialRequests: profile.notes || prev.specialRequests,
      vehicleTier: profile.preferredVehicleTier || prev.vehicleTier,
      pickupAddress: profile.recentPickupAddress || prev.pickupAddress,
      dropoffAddress: profile.recentDropoffAddress || prev.dropoffAddress,
    }));
  };

  // Real-time Quote Calculation
  const refreshQuote = useCallback(async () => {
    const pickup = String(formValues.pickupAddress || '').trim();
    const dropoff = String(formValues.dropoffAddress || '').trim();

    if (!pickup || !dropoff) {
      setQuote(null);
      return;
    }

    try {
      setIsQuoteLoading(true);
      setQuoteError(null);
      const bookingService = getBookingService();

      let scheduledPickupTime: string | undefined;
      if (formValues.bookingType === 'scheduled' && formValues.scheduledDate) {
        const timePart = formValues.scheduledTime ? String(formValues.scheduledTime) : '12:00';
        scheduledPickupTime = new Date(`${formValues.scheduledDate}T${timePart}`).toISOString();
      }

      const intermediateStops: TripLocation[] = [];
      if (formValues.hasIntermediateStop && formValues.intermediateStopAddress) {
        intermediateStops.push({
          address: String(formValues.intermediateStopAddress).trim(),
          placeId: formValues.intermediateStopAddress_placeId as string | undefined,
          coordinates: formValues.intermediateStopAddress_coordinates as { lat: number; lng: number } | undefined,
          notes: (formValues.intermediateStopNotes as string) ?? '',
        });
      }

      const calculatedQuote = await bookingService.calculateQuote({
        pickupLocation: {
          address: pickup,
          placeId: formValues.pickupAddress_placeId as string | undefined,
          coordinates: formValues.pickupAddress_coordinates as { lat: number; lng: number } | undefined,
          notes: (formValues.pickupNotes as string) ?? '',
        },
        dropoffLocation: {
          address: dropoff,
          placeId: formValues.dropoffAddress_placeId as string | undefined,
          coordinates: formValues.dropoffAddress_coordinates as { lat: number; lng: number } | undefined,
          notes: (formValues.dropoffNotes as string) ?? '',
        },
        intermediateStops: intermediateStops.length > 0 ? intermediateStops : undefined,
        vehicleTier: (formValues.vehicleTier as VehicleTier) || 'standard',
        bookingType: formValues.bookingType === 'scheduled' ? 'scheduled' : 'asap',
        scheduledPickupTime,
        passengerCount: Number(formValues.passengerCount) || 1,
        luggageCount: Number(formValues.luggageCount) || 0,
        promoCode: formValues.promoCode ? String(formValues.promoCode) : undefined,
      });

      setQuote(calculatedQuote);
    } catch (err: unknown) {
      console.warn('[BookingEngine] Quote calculation error:', err);
      setQuoteError('Unable to generate route quote. Please check your addresses.');
    } finally {
      setIsQuoteLoading(false);
    }
  }, [
    formValues.pickupAddress,
    formValues.pickupAddress_placeId,
    formValues.pickupAddress_coordinates,
    formValues.dropoffAddress,
    formValues.dropoffAddress_placeId,
    formValues.dropoffAddress_coordinates,
    formValues.pickupNotes,
    formValues.dropoffNotes,
    formValues.hasIntermediateStop,
    formValues.intermediateStopAddress,
    formValues.intermediateStopAddress_placeId,
    formValues.intermediateStopAddress_coordinates,
    formValues.intermediateStopNotes,
    formValues.vehicleTier,
    formValues.bookingType,
    formValues.scheduledDate,
    formValues.scheduledTime,
    formValues.passengerCount,
    formValues.luggageCount,
    formValues.promoCode,
  ]);

  // Recalculate quote when relevant fields change
  useEffect(() => {
    if (formValues.pickupAddress && formValues.dropoffAddress) {
      refreshQuote();
    }
  }, [
    formValues.pickupAddress,
    formValues.pickupAddress_coordinates,
    formValues.dropoffAddress,
    formValues.dropoffAddress_coordinates,
    formValues.hasIntermediateStop,
    formValues.intermediateStopAddress,
    formValues.intermediateStopAddress_coordinates,
    formValues.vehicleTier,
    formValues.promoCode,
    refreshQuote,
  ]);

  // Compute final effective fare (accounting for manual price override)
  const effectiveFare = useMemo(() => {
    if (capabilities.canPriceOverride && formValues.isPriceOverridden && formValues.manualFare !== '') {
      const parsed = parseFloat(String(formValues.manualFare));
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
    return quote ? quote.pricing.totalFare : null;
  }, [capabilities.canPriceOverride, formValues.isPriceOverridden, formValues.manualFare, quote]);

  // Recurring dates preview
  const recurringDatesPreview = useMemo(() => {
    if (!formValues.isRecurring) return [];
    const baseDate = formValues.scheduledDate
      ? new Date(`${formValues.scheduledDate}T${formValues.scheduledTime || '12:00'}`)
      : new Date(Date.now() + 86400000);

    const occurrences = Math.min(Math.max(Number(formValues.recurringOccurrences) || 1, 1), 20);
    const dates: Date[] = [];
    const intervalDays = formValues.recurringFrequency === 'daily' ? 1 : 7;

    for (let i = 0; i < occurrences; i++) {
      const d = new Date(baseDate.getTime() + i * intervalDays * 86400000);
      dates.push(d);
    }
    return dates;
  }, [formValues.isRecurring, formValues.scheduledDate, formValues.scheduledTime, formValues.recurringFrequency, formValues.recurringOccurrences]);

  // Comprehensive Single-Page Validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 1. Locations
    if (!formValues.pickupAddress || !String(formValues.pickupAddress).trim()) {
      newErrors.pickupAddress = 'Pickup address is required.';
    }
    if (!formValues.dropoffAddress || !String(formValues.dropoffAddress).trim()) {
      newErrors.dropoffAddress = 'Dropoff destination is required.';
    }
    if (formValues.hasIntermediateStop && (!formValues.intermediateStopAddress || !String(formValues.intermediateStopAddress).trim())) {
      newErrors.intermediateStopAddress = 'Please enter intermediate stop address.';
    }

    // 2. Timing
    if (formValues.bookingType === 'scheduled') {
      if (!formValues.scheduledDate) {
        newErrors.scheduledDate = 'Scheduled date is required.';
      }
      if (!formValues.scheduledTime) {
        newErrors.scheduledTime = 'Scheduled time is required.';
      }
    }

    // 3. Passenger Info
    if (!formValues.firstName || !String(formValues.firstName).trim()) {
      newErrors.firstName = 'First name is required.';
    }
    if (!formValues.lastName || !String(formValues.lastName).trim()) {
      newErrors.lastName = 'Last name is required.';
    }
    if (!formValues.phone || !String(formValues.phone).trim()) {
      newErrors.phone = 'Phone number is required.';
    } else {
      const phoneDigits = String(formValues.phone).replace(/\D/g, '');
      if (phoneDigits.length < 10) {
        newErrors.phone = 'Please enter a valid 10-digit phone number.';
      }
    }
    if (!formValues.email || !String(formValues.email).trim()) {
      newErrors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(formValues.email))) {
      newErrors.email = 'Please enter a valid email address.';
    }

    // 4. Flight Details (if flight # entered)
    if (airportDetection.isAirportTrip && formValues.flightNumber) {
      if (!/^\d{1,4}$/.test(String(formValues.flightNumber).trim())) {
        newErrors.flightNumber = 'Flight number must be 1 to 4 digits (e.g. 1422).';
      }
    }

    // 5. Price Override validation (if active)
    if (capabilities.canPriceOverride && formValues.isPriceOverridden) {
      if (formValues.manualFare === '' || isNaN(Number(formValues.manualFare)) || Number(formValues.manualFare) < 0) {
        newErrors.manualFare = 'Please specify a valid override fare amount ($).';
      }
    }

    // 6. Terms (Customer only)
    if (capabilities.requireTermsAcceptance && !formValues.termsAccepted) {
      newErrors.termsAccepted = 'You must accept the terms before booking.';
    }

    setErrors(newErrors);

    // Auto-scroll to first invalid element if errors exist
    if (Object.keys(newErrors).length > 0) {
      const firstErrorField = Object.keys(newErrors)[0];
      const targetElement = document.querySelector(`[name="${firstErrorField}"]`) || document.getElementById(firstErrorField);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (targetElement as HTMLElement).focus?.();
      }
      return false;
    }

    return true;
  };

  // Submission Handler
  const handleSubmitBooking = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const bookingService = getBookingService();

      // Ensure quote is ready
      let finalQuote = quote;
      if (!finalQuote) {
        let scheduledPickupTime: string | undefined;
        if (formValues.bookingType === 'scheduled' && formValues.scheduledDate) {
          const timePart = formValues.scheduledTime ? String(formValues.scheduledTime) : '12:00';
          scheduledPickupTime = new Date(`${formValues.scheduledDate}T${timePart}`).toISOString();
        }

        finalQuote = await bookingService.calculateQuote({
          pickupLocation: {
            address: String(formValues.pickupAddress ?? ''),
            notes: (formValues.pickupNotes as string) ?? '',
          },
          dropoffLocation: {
            address: String(formValues.dropoffAddress ?? ''),
            notes: (formValues.dropoffNotes as string) ?? '',
          },
          vehicleTier: (formValues.vehicleTier as VehicleTier) || 'standard',
          bookingType: formValues.bookingType === 'scheduled' ? 'scheduled' : 'asap',
          scheduledPickupTime,
          passengerCount: Number(formValues.passengerCount) || 1,
          luggageCount: Number(formValues.luggageCount) || 0,
          promoCode: (formValues.promoCode as string) ?? '',
        });
        setQuote(finalQuote);
      }

      // Calculate effective pricing structure
      let effectivePricing: TripPricing = finalQuote.pricing;
      if (capabilities.canPriceOverride && formValues.isPriceOverridden && effectiveFare !== null) {
        effectivePricing = {
          ...finalQuote.pricing,
          totalFare: effectiveFare,
          subtotal: effectiveFare,
        };
      }

      // Prepare flight remarks
      const matchedAirline = MAJOR_AIRLINES.find((a) => a.code === formValues.airlineCode);
      const airlineName = matchedAirline ? matchedAirline.name : formValues.airlineCode ? String(formValues.airlineCode) : undefined;
      const formattedDepartureAirport = formValues.departureAirport
        ? String(formValues.departureAirport).trim().toUpperCase()
        : undefined;

      let flightRemarks: string | undefined;
      if (airportDetection.isAirportTrip && formValues.flightNumber) {
        const parts: string[] = [];
        if (airlineName) parts.push(`Airline: ${airlineName} (${formValues.airlineCode})`);
        parts.push(`Flight #: ${formValues.flightNumber}`);
        if (formattedDepartureAirport) parts.push(`Origin: ${formattedDepartureAirport}`);
        parts.push(`Checked Luggage: ${formValues.hasCheckedLuggage ? 'Yes' : 'No'}`);
        flightRemarks = `[Airport Dispatch: ${parts.join(', ')}]`;
      }

      const userSpecialRequests = formValues.specialRequests ? String(formValues.specialRequests).trim() : '';
      const mergedSpecialRequests = [flightRemarks, userSpecialRequests].filter(Boolean).join('\n') || undefined;

      const intermediateStops: TripLocation[] = [];
      if (formValues.hasIntermediateStop && formValues.intermediateStopAddress) {
        intermediateStops.push({
          address: String(formValues.intermediateStopAddress).trim(),
          placeId: formValues.intermediateStopAddress_placeId as string | undefined,
          coordinates: formValues.intermediateStopAddress_coordinates as { lat: number; lng: number } | undefined,
          notes: (formValues.intermediateStopNotes as string) ?? '',
        });
      }

      // Handle batch recurring trips or single trip
      const recurringGroupId = formValues.isRecurring
        ? `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        : undefined;

      const datesToSchedule: string[] = [];
      if (formValues.isRecurring && recurringDatesPreview.length > 0) {
        for (const d of recurringDatesPreview) {
          datesToSchedule.push(d.toISOString());
        }
      } else {
        let scheduledPickupTime: string | undefined;
        if (formValues.bookingType === 'scheduled' && formValues.scheduledDate) {
          const timePart = formValues.scheduledTime ? String(formValues.scheduledTime) : '12:00';
          scheduledPickupTime = new Date(`${formValues.scheduledDate}T${timePart}`).toISOString();
        }
        datesToSchedule.push(scheduledPickupTime || new Date().toISOString());
      }

      const createdTrips: Trip[] = [];

      for (let i = 0; i < datesToSchedule.length; i++) {
        const scheduledTime = datesToSchedule[i];
        const inputPayload: CreateTripInput = {
          pickupLocation: {
            address: String(formValues.pickupAddress ?? ''),
            placeId: formValues.pickupAddress_placeId as string | undefined,
            coordinates: formValues.pickupAddress_coordinates as { lat: number; lng: number } | undefined,
            notes: (formValues.pickupNotes as string) ?? '',
          },
          dropoffLocation: {
            address: String(formValues.dropoffAddress ?? ''),
            placeId: formValues.dropoffAddress_placeId as string | undefined,
            coordinates: formValues.dropoffAddress_coordinates as { lat: number; lng: number } | undefined,
            notes: (formValues.dropoffNotes as string) ?? '',
          },
          intermediateStops: intermediateStops.length > 0 ? intermediateStops : undefined,
          bookingType: formValues.bookingType === 'scheduled' ? 'scheduled' : 'asap',
          scheduledPickupTime: formValues.bookingType === 'scheduled' ? scheduledTime : undefined,
          passenger: {
            firstName: String(formValues.firstName ?? ''),
            lastName: String(formValues.lastName ?? ''),
            email: String(formValues.email ?? ''),
            phone: String(formValues.phone ?? ''),
            passengerCount: Number(formValues.passengerCount) || 1,
            luggageCount: Number(formValues.luggageCount) || 0,
            specialRequests: mergedSpecialRequests ?? '',
          },
          vehicleTier: (formValues.vehicleTier as VehicleTier) || 'standard',
          pricing: effectivePricing,
          payment: {
            method: (formValues.paymentMethod as PaymentMethod) || 'card',
            status: capabilities.canBypassPayment && formValues.bypassPayment ? 'authorized' : 'pending',
            amount: effectivePricing.totalFare,
          },
          metadata: {
            bookingRole: mode,
            corporateAccountId: (formValues.corporateAccountId as string) ?? '',
            airlineCode: (formValues.airlineCode as string) ?? '',
            airlineName: airlineName ?? '',
            flightNumber: (formValues.flightNumber as string) ?? '',
            departureAirport: formattedDepartureAirport ?? '',
            hasCheckedLuggage: Boolean(formValues.hasCheckedLuggage),
            isAirportTrip: Boolean(airportDetection.isAirportTrip),
            flightRemarks: flightRemarks ?? '',
            promoCode: (formValues.promoCode as string) ?? '',
            // Recurring info
            recurringGroupId: recurringGroupId ?? '',
            recurringIndex: formValues.isRecurring ? i + 1 : undefined,
            totalRecurringOccurrences: formValues.isRecurring ? datesToSchedule.length : undefined,
            recurringFrequency: formValues.isRecurring ? formValues.recurringFrequency : undefined,
            // Override info
            isPriceOverridden: Boolean(capabilities.canPriceOverride && formValues.isPriceOverridden),
            manualFare: capabilities.canPriceOverride && formValues.isPriceOverridden ? formValues.manualFare : undefined,
            overrideReason: (formValues.overrideReason as string) ?? '',
            lineItemNotes: (formValues.lineItemNotes as string) ?? '',
            bypassPayment: Boolean(capabilities.canBypassPayment && formValues.bypassPayment),
            bypassReason: (formValues.bypassReason as string) ?? '',
            directAssignedDriverId: capabilities.canDirectDriverAssign && formValues.driverAssignmentType === 'direct' ? formValues.assignedDriverId : undefined,
          },
        };

        const trip = await bookingService.createBooking(inputPayload);
        createdTrips.push(trip);
      }

      setConfirmedTrips(createdTrips);
      onBookingSuccess?.(createdTrips);

      // Trigger transactional Resend email dispatch for the primary trip
      const primaryTrip = createdTrips[0];
      if (primaryTrip) {
        setEmailDelivery({ status: 'sending', recipient: primaryTrip.passenger.email });
        try {
          const emailService = getEmailDispatchService();
          const passengerReceiptPromise = emailService.sendBookingConfirmation({
            tripId: primaryTrip.id,
            passenger: {
              firstName: primaryTrip.passenger.firstName,
              lastName: primaryTrip.passenger.lastName,
              email: primaryTrip.passenger.email,
              phone: primaryTrip.passenger.phone,
            },
            pickupAddress: primaryTrip.pickupLocation.address,
            pickupNotes: primaryTrip.pickupLocation.notes ?? '',
            intermediateStops: intermediateStops.length > 0
              ? intermediateStops.map((s) => ({ address: s.address, notes: s.notes }))
              : undefined,
            dropoffAddress: primaryTrip.dropoffLocation.address,
            dropoffNotes: primaryTrip.dropoffLocation.notes ?? '',
            pickupTime: primaryTrip.bookingType === 'scheduled' && primaryTrip.scheduledPickupTime
              ? new Date(primaryTrip.scheduledPickupTime).toLocaleString()
              : 'Immediate Ride (ASAP)',
            bookingType: primaryTrip.bookingType,
            vehicleTier: primaryTrip.vehicleTier,
            passengerCount: primaryTrip.passenger.passengerCount,
            luggageCount: primaryTrip.passenger.luggageCount,
            totalFare: primaryTrip.pricing.totalFare,
            currency: primaryTrip.pricing.currency,
            paymentMethod: primaryTrip.payment.method,
            specialRequests: primaryTrip.passenger.specialRequests,
            flightDetails: {
              airlineName,
              airlineCode: formValues.airlineCode ? String(formValues.airlineCode) : undefined,
              flightNumber: formValues.flightNumber ? String(formValues.flightNumber) : undefined,
              departureAirport: formattedDepartureAirport,
              hasCheckedLuggage: Boolean(formValues.hasCheckedLuggage),
              isAirportTrip: airportDetection.isAirportTrip,
            },
          });

          const dispatcherAlertPromise = emailService.sendAdminDispatchAlert({
            tripId: primaryTrip.id,
            passengerName: `${primaryTrip.passenger.firstName} ${primaryTrip.passenger.lastName}`,
            passengerPhone: primaryTrip.passenger.phone,
            passengerEmail: primaryTrip.passenger.email,
            passengerCount: primaryTrip.passenger.passengerCount,
            luggageCount: primaryTrip.passenger.luggageCount,
            pickupAddress: primaryTrip.pickupLocation.address,
            pickupNotes: primaryTrip.pickupLocation.notes ?? '',
            intermediateStops: intermediateStops.length > 0
              ? intermediateStops.map((s) => ({ address: s.address, notes: s.notes }))
              : undefined,
            dropoffAddress: primaryTrip.dropoffLocation.address,
            dropoffNotes: primaryTrip.dropoffLocation.notes ?? '',
            pickupTime: primaryTrip.bookingType === 'scheduled' && primaryTrip.scheduledPickupTime
              ? new Date(primaryTrip.scheduledPickupTime).toLocaleString()
              : 'Immediate (ASAP)',
            vehicleTier: primaryTrip.vehicleTier,
            totalFare: primaryTrip.pricing.totalFare,
            currency: primaryTrip.pricing.currency,
            bookingType: primaryTrip.bookingType,
            paymentMethod: primaryTrip.payment.method,
            specialRequests: primaryTrip.passenger.specialRequests,
            urgency: primaryTrip.bookingType === 'asap' ? 'high' : 'normal',
            flightDetails: {
              airlineName,
              airlineCode: formValues.airlineCode ? String(formValues.airlineCode) : undefined,
              flightNumber: formValues.flightNumber ? String(formValues.flightNumber) : undefined,
              departureAirport: formattedDepartureAirport,
              hasCheckedLuggage: Boolean(formValues.hasCheckedLuggage),
            },
          });

          const [receiptResult] = await Promise.all([passengerReceiptPromise, dispatcherAlertPromise]);

          if (receiptResult.success) {
            setEmailDelivery({
              status: receiptResult.simulated ? 'simulated' : 'sent',
              recipient: receiptResult.recipient,
              messageId: receiptResult.messageId,
            });
          } else {
            setEmailDelivery({
              status: 'failed',
              recipient: primaryTrip.passenger.email,
              error: receiptResult.error,
            });
          }
        } catch (emailErr) {
          console.warn('[BookingEngine] Email dispatch error:', emailErr);
          setEmailDelivery({
            status: 'failed',
            recipient: primaryTrip.passenger.email,
            error: emailErr instanceof Error ? emailErr.message : 'Email dispatch network error',
          });
        }
      }
    } catch (err: unknown) {
      console.error('[BookingEngine] Submission error:', err);
      setSubmitError(
        err instanceof Error ? err.message : 'An error occurred while creating your reservation.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBookAnother = () => {
    setConfirmedTrips(null);
    setQuote(null);
    setErrors({});
    setSubmitError(null);
    setEmailDelivery({ status: 'idle' });
    passengerLookup.clearAll();
  };

  // If trips confirmed, render confirmation view
  if (confirmedTrips && confirmedTrips.length > 0) {
    const primaryTrip = confirmedTrips[0];
    return (
      <div className="space-y-6">
        {confirmedTrips.length > 1 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-900 flex items-center gap-3">
            <RepeatIcon className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-sm">
                Recurring Batch Booking Confirmed ({confirmedTrips.length} Scheduled Trips)
              </p>
              <p className="text-xs text-emerald-700">
                All trips in this recurring series have been scheduled with Group ID:{' '}
                <span className="font-mono font-bold">
                  {(primaryTrip.metadata?.recurringGroupId as string) || primaryTrip.id}
                </span>
              </p>
            </div>
          </div>
        )}
        <BookingConfirmation
          trip={primaryTrip}
          onBookAnother={handleBookAnother}
          emailDelivery={emailDelivery}
          className={className}
        />
      </div>
    );
  }

  // Contextual Help Guide Content
  const getContextualGuide = () => {
    switch (activeField) {
      case 'pickupAddress':
        return {
          title: 'Pickup Location',
          icon: <MapPinIcon className="w-4 h-4 text-amber-500" />,
          content:
            'Start typing your address, hotel lobby, or landmark in West St. Louis County. Select from Google Places verified suggestions for high-accuracy GPS driver dispatch.',
        };
      case 'dropoffAddress':
        return {
          title: 'Destination',
          icon: <FlagIcon className="w-4 h-4 text-amber-500" />,
          content:
            'Dropoff anywhere in the greater St. Louis metropolitan corridor, Lambert (STL), or Spirit of St. Louis (SUS) airports. Our guaranteed flat rates include all standard tolls.',
        };
      case 'hasIntermediateStop':
      case 'intermediateStopAddress':
        return {
          title: 'Multi-Stop Waypoints',
          icon: <MapPinIcon className="w-4 h-4 text-amber-500" />,
          content:
            'Need to pick up a passenger or run a quick errand? Intermediate waypoints are seamlessly calculated into your driving mileage and road duration in real time.',
        };
      case 'bookingType':
      case 'scheduledDate':
      case 'scheduledTime':
        return {
          title: 'Ride Timing & Punctuality',
          icon: <ClockIcon className="w-4 h-4 text-amber-500" />,
          content:
            'Choose "Ride Now (ASAP)" for immediate dispatch (10–15 min pickup) or "Schedule for Later" up to 90 days in advance. Drivers arrive 5 minutes prior to scheduled pickup.',
        };
      case 'airlineCode':
      case 'flightNumber':
      case 'departureAirport':
      case 'hasCheckedLuggage':
        return {
          title: 'Live Flight Radar Tracking',
          icon: <PlaneIcon className="w-4 h-4 text-amber-500" />,
          content:
            'Our 24/7 dispatch desk tracks your incoming FAA radar in real time. If your commercial flight is delayed or arrives early, your driver pickup adjusts automatically at zero penalty fee!',
        };
      case 'vehicleTier':
        return {
          title: 'Vehicle Fleet Standards',
          icon: <CarIcon className="w-4 h-4 text-amber-500" />,
          content:
            'Standard Sedans seat up to 4 with 2 suitcases. Premium Executive offers luxury black car styling. XL accommodates 6 passengers with 5 bags. WAV features certified motorized wheelchair ramps.',
        };
      case 'passengerCount':
      case 'luggageCount':
        return {
          title: 'Passenger & Luggage Fit',
          icon: <LuggageIcon className="w-4 h-4 text-amber-500" />,
          content:
            'Please select the exact number of bags. If your party exceeds vehicle luggage capacity, our system automatically prompts you to upgrade to an XL Minivan or SUV.',
        };
      case 'corporateAccountId':
        return {
          title: 'Corporate Account Invoicing',
          icon: <UserCheckIcon className="w-4 h-4 text-amber-500" />,
          content:
            'Registered Chesterfield corporate accounts enjoy monthly Net-30 consolidated billing, priority dispatch queueing, and detailed executive ride manifests.',
        };
      case 'paymentMethod':
        return {
          title: 'Payment Flexibility',
          icon: <DollarSignIcon className="w-4 h-4 text-amber-500" />,
          content:
            'Secure credit card on file, cash payment to driver in-cab, or direct corporate invoice. All digital transactions are protected with TLS 256-bit encryption.',
        };
      case 'isRecurring':
      case 'recurringFrequency':
      case 'recurringOccurrences':
        return {
          title: 'Batch Recurring Schedule',
          icon: <RepeatIcon className="w-4 h-4 text-amber-500" />,
          content:
            'Ideal for daily medical commutes, weekly executive office transfers, or ongoing airport schedules. A shared Recurring Group ID links all generated trips.',
        };
      case 'manualFare':
      case 'overrideReason':
        return {
          title: 'Manager Price Override',
          icon: <SlidersIcon className="w-4 h-4 text-amber-500" />,
          content:
            'Dispatchers and managers can set custom agreed flat rates or courtesy discounts. All fare overrides are logged with audit timestamps and reason notes.',
        };
      default:
        return {
          title: '24/7 Dispatch Concierge',
          icon: <ShieldCheckIcon className="w-4 h-4 text-amber-500" />,
          content:
            'Upfront guaranteed pricing with live Google Maps road routing. For special group charter inquiries or immediate roadside dispatch, call (314) 738-0100 anytime.',
        };
    }
  };

  const activeGuide = getContextualGuide();

  return (
    <div className={`w-full max-w-6xl mx-auto ${className}`}>
      {/* Mode Badge for Dispatcher/Admin */}
      {mode !== 'customer' && (
        <div className="mb-6 flex items-center justify-between bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-md border border-slate-800">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <span className="font-bold text-sm tracking-wide uppercase text-amber-400">
                {roleConfig.name}
              </span>
              <p className="text-xs text-slate-300">
                Direct Driver Assignment • Price Overrides • Passenger History Lookup Active
              </p>
            </div>
          </div>
          <Badge variant="warning" size="sm">
            Mode: {mode.toUpperCase()}
          </Badge>
        </div>
      )}

      {/* Main Single-Page Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Seamless Vertical Form Sections */}
        <div className="lg:col-span-8 space-y-6">
          {submitError && (
            <Alert variant="error" title="Reservation Submission Error">
              {submitError}
            </Alert>
          )}

          {/* Section: Passenger Lookup (Dispatcher / Admin only) */}
          {capabilities.hasPassengerLookup && (
            <Card variant="elevated" className="border-amber-300 shadow-xs bg-amber-50/20">
              <CardHeader className="border-b border-amber-100 bg-amber-50/50 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SearchIcon className="w-4 h-4 text-amber-600" />
                    <CardTitle className="text-base text-slate-900">
                      Passenger & Account Lookup
                    </CardTitle>
                  </div>
                  <Badge variant="warning" size="sm">Operations</Badge>
                </div>
                <CardDescription className="text-xs text-slate-600">
                  Search by phone, email, or name to auto-populate passenger info and preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="relative">
                  <Input
                    name="passengerLookup"
                    placeholder="Search phone number (e.g. 314-738-9921) or email..."
                    value={passengerLookup.query}
                    onChange={(e) => passengerLookup.setQuery(e.target.value)}
                    onFocus={() => setActiveField('passengerLookup')}
                  />
                  <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400">
                    {passengerLookup.isLoading ? (
                      <SpinnerIcon className="w-4 h-4 animate-spin text-amber-500" />
                    ) : (
                      <SearchIcon className="w-4 h-4" />
                    )}
                  </div>

                  {/* Autocomplete dropdown */}
                  {passengerLookup.results.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {passengerLookup.results.map((profile) => (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => handleSelectPassengerProfile(profile)}
                          className="w-full text-left p-3 hover:bg-amber-50/80 transition-colors flex items-start justify-between gap-3 text-xs"
                        >
                          <div>
                            <p className="font-bold text-slate-900 text-sm">
                              {profile.firstName} {profile.lastName}{' '}
                              {profile.vipStatus && (
                                <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full uppercase ml-1">
                                  VIP
                                </span>
                              )}
                            </p>
                            <p className="text-slate-500">{profile.phone} • {profile.email}</p>
                            {profile.corporateAccountId && (
                              <p className="text-amber-700 font-medium mt-0.5">
                                Account: {profile.corporateAccountId}
                              </p>
                            )}
                            {profile.recentPickupAddress && (
                              <p className="text-slate-400 truncate max-w-sm mt-0.5">
                                Fav: {profile.recentPickupAddress}
                              </p>
                            )}
                          </div>
                          <span className="text-amber-600 font-semibold shrink-0">Select</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {passengerLookup.selectedProfile && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserCheckIcon className="w-4 h-4 text-emerald-600" />
                      <span>
                        Active Profile: <strong>{passengerLookup.selectedProfile.firstName} {passengerLookup.selectedProfile.lastName}</strong> ({passengerLookup.selectedProfile.phone})
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => passengerLookup.clearAll()}>
                      Clear
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Section 1: Pickup Time */}
          <Card variant="default" className="shadow-xs border-slate-200">
            <CardHeader className="bg-slate-50/60 border-b border-slate-100 py-3.5">
              <div className="flex items-center gap-2">
                <ClockIcon className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base text-slate-900">1. Pickup Time</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div onFocusCapture={() => setActiveField('bookingType')}>
                <RadioGroup
                  name="bookingType"
                  label="Ride Timing"
                  value={formValues.bookingType as string}
                  onChange={(val) => handleFieldChange('bookingType', val)}
                  options={[
                    {
                      value: 'asap',
                      label: 'Ride Now (ASAP)',
                      description: 'Immediate driver broadcast (10–15 min pickup)',
                      badge: 'Fastest',
                    },
                    {
                      value: 'scheduled',
                      label: 'Schedule in Advance',
                      description: 'Reserve for a specific flight, meeting, or event',
                    },
                  ]}
                />
              </div>

              {formValues.bookingType === 'scheduled' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <Input
                    type="date"
                    name="scheduledDate"
                    label="Pickup Date"
                    value={formValues.scheduledDate as string}
                    onChange={(e) => handleFieldChange('scheduledDate', e.target.value)}
                    onFocus={() => setActiveField('scheduledDate')}
                    error={errors.scheduledDate}
                    required
                  />
                  <Input
                    type="time"
                    name="scheduledTime"
                    label="Pickup Time"
                    value={formValues.scheduledTime as string}
                    onChange={(e) => handleFieldChange('scheduledTime', e.target.value)}
                    onFocus={() => setActiveField('scheduledTime')}
                    error={errors.scheduledTime}
                    required
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Trip Details (Locations, Airport Detection, Flight Ops) */}
          <Card variant="default" className="shadow-xs border-slate-200">
            <CardHeader className="bg-slate-50/60 border-b border-slate-100 py-3.5">
              <div className="flex items-center gap-2">
                <MapPinIcon className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base text-slate-900">2. Trip Details & Route</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              {/* Airport Detected Banner */}
              {airportDetection.isAirportTrip && airportDetection.airport && (
                <AirportDetectedBanner
                  airport={airportDetection.airport}
                  isPickupAirport={airportDetection.isPickupAirport}
                  isDropoffAirport={airportDetection.isDropoffAirport}
                />
              )}

              {/* Pickup Address */}
              <div onFocusCapture={() => setActiveField('pickupAddress')}>
                <LocationAutocomplete
                  name="pickupAddress"
                  label="Pickup Address"
                  placeholder="Enter pickup address, hotel, or landmark in West County"
                  helperText="Select from suggested addresses for exact Google Maps routing"
                  value={formValues.pickupAddress as string}
                  onChange={(val) => handleFieldChange('pickupAddress', val)}
                  onPlaceSelected={(details) => handlePlaceSelected('pickupAddress', details)}
                  error={errors.pickupAddress}
                  required
                  icon="map-pin"
                />
              </div>

              <div onFocusCapture={() => setActiveField('pickupNotes')}>
                <Input
                  name="pickupNotes"
                  placeholder="Pickup details: apartment, suite, gate code, or lobby note (optional)"
                  value={formValues.pickupNotes as string}
                  onChange={(e) => handleFieldChange('pickupNotes', e.target.value)}
                />
              </div>

              {/* Intermediate Stop Switch & Input */}
              <div className="pt-1">
                <div onFocusCapture={() => setActiveField('hasIntermediateStop')}>
                  <Switch
                    name="hasIntermediateStop"
                    label="Add an Intermediate Stop Along the Way"
                    helperText="Need to pick up a passenger or make a quick errand before final destination?"
                    checked={Boolean(formValues.hasIntermediateStop)}
                    onChange={(checked) => handleFieldChange('hasIntermediateStop', checked)}
                  />
                </div>

                {Boolean(formValues.hasIntermediateStop) && (
                  <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div onFocusCapture={() => setActiveField('intermediateStopAddress')}>
                      <LocationAutocomplete
                        name="intermediateStopAddress"
                        label="Intermediate Stop Address"
                        placeholder="Enter stop address or venue"
                        value={formValues.intermediateStopAddress as string}
                        onChange={(val) => handleFieldChange('intermediateStopAddress', val)}
                        onPlaceSelected={(details) => handlePlaceSelected('intermediateStopAddress', details)}
                        error={errors.intermediateStopAddress}
                        required
                        icon="map-pin"
                      />
                    </div>
                    <Input
                      name="intermediateStopNotes"
                      placeholder="Stop note: passenger name or errand detail (optional)"
                      value={formValues.intermediateStopNotes as string}
                      onChange={(e) => handleFieldChange('intermediateStopNotes', e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Dropoff Destination */}
              <div onFocusCapture={() => setActiveField('dropoffAddress')}>
                <LocationAutocomplete
                  name="dropoffAddress"
                  label="Dropoff Destination"
                  placeholder="Enter destination address or airport terminal"
                  helperText="Where would you like to be dropped off?"
                  value={formValues.dropoffAddress as string}
                  onChange={(val) => handleFieldChange('dropoffAddress', val)}
                  onPlaceSelected={(details) => handlePlaceSelected('dropoffAddress', details)}
                  error={errors.dropoffAddress}
                  required
                  icon="flag"
                />
              </div>

              <div onFocusCapture={() => setActiveField('dropoffNotes')}>
                <Input
                  name="dropoffNotes"
                  placeholder="Dropoff details: specific entrance, door, or department (optional)"
                  value={formValues.dropoffNotes as string}
                  onChange={(e) => handleFieldChange('dropoffNotes', e.target.value)}
                />
              </div>

              {/* Flight Operations Block (if airport trip detected) */}
              {airportDetection.isAirportTrip && (
                <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-4 mt-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                    <PlaneIcon className="w-4 h-4 text-amber-600" />
                    <span>Airport Dispatch & Flight Tracking Details</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div onFocusCapture={() => setActiveField('airlineCode')}>
                      <Select
                        name="airlineCode"
                        label="Airline Carrier"
                        value={formValues.airlineCode as string}
                        onChange={(e) => handleFieldChange('airlineCode', e.target.value)}
                        options={[
                          { value: '', label: 'Select Airline...' },
                          ...MAJOR_AIRLINES.map((a) => ({
                            value: a.code,
                            label: `${a.name} (${a.code})`,
                          })),
                        ]}
                      />
                    </div>

                    <div onFocusCapture={() => setActiveField('flightNumber')}>
                      <Input
                        name="flightNumber"
                        label="Flight Number"
                        placeholder="e.g. 1422"
                        value={formValues.flightNumber as string}
                        onChange={(e) => handleFieldChange('flightNumber', e.target.value)}
                        error={errors.flightNumber}
                        maxLength={4}
                      />
                    </div>

                    <div onFocusCapture={() => setActiveField('departureAirport')}>
                      <Input
                        name="departureAirport"
                        label="Origin Airport (IATA)"
                        placeholder="e.g. ORD, ATL, DEN"
                        value={formValues.departureAirport as string}
                        onChange={(e) => handleFieldChange('departureAirport', e.target.value.toUpperCase())}
                        maxLength={3}
                      />
                    </div>
                  </div>

                  <div onFocusCapture={() => setActiveField('hasCheckedLuggage')}>
                    <Checkbox
                      name="hasCheckedLuggage"
                      label="Passenger has checked luggage (allows buffer time for baggage claim)"
                      checked={Boolean(formValues.hasCheckedLuggage)}
                      onChange={(checked) => handleFieldChange('hasCheckedLuggage', checked)}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Passengers & Luggage */}
          <Card variant="default" className="shadow-xs border-slate-200">
            <CardHeader className="bg-slate-50/60 border-b border-slate-100 py-3.5">
              <div className="flex items-center gap-2">
                <LuggageIcon className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base text-slate-900">3. Passengers & Luggage</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div onFocusCapture={() => setActiveField('passengerCount')}>
                  <Counter
                    label="Number of Passengers"
                    helperText="Total guests traveling in party"
                    value={Number(formValues.passengerCount) || 1}
                    onChange={(val) => handleFieldChange('passengerCount', val)}
                    min={1}
                    max={14}
                  />
                </div>

                <div onFocusCapture={() => setActiveField('luggageCount')}>
                  <Counter
                    label="Luggage / Suitcases"
                    helperText="Standard checked or carry-on bags"
                    value={Number(formValues.luggageCount) || 0}
                    onChange={(val) => handleFieldChange('luggageCount', val)}
                    min={0}
                    max={10}
                  />
                </div>
              </div>

              {/* Luggage Capacity Warning */}
              {isLuggageOverCapacity && (
                <LuggageCapacityWarning
                  vehicleTier={currentVehicleTier}
                  luggageCount={currentLuggageCount}
                  maxLuggage={maxAllowedLuggage}
                  onUpgradeToXL={() => handleFieldChange('vehicleTier', 'xl')}
                />
              )}
            </CardContent>
          </Card>

          {/* Section 4: Vehicle Selection */}
          <Card variant="default" className="shadow-xs border-slate-200">
            <CardHeader className="bg-slate-50/60 border-b border-slate-100 py-3.5">
              <div className="flex items-center gap-2">
                <CarIcon className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base text-slate-900">4. Select Vehicle Class</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6" onFocusCapture={() => setActiveField('vehicleTier')}>
              <VehicleTierSelector
                value={formValues.vehicleTier as VehicleTier}
                onChange={(tier) => handleFieldChange('vehicleTier', tier)}
              />
            </CardContent>
          </Card>

          {/* Section: Recurring Trip Schedule (Dispatcher / Admin Only) */}
          {capabilities.canRecurringTrips && (
            <Card variant="elevated" className="border-indigo-200 shadow-xs bg-indigo-50/20">
              <CardHeader className="border-b border-indigo-100 bg-indigo-50/50 py-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RepeatIcon className="w-4 h-4 text-indigo-600" />
                    <CardTitle className="text-base text-slate-900">Recurring Trip Schedule</CardTitle>
                  </div>
                  <Badge variant="info" size="sm">Batch Dispatch</Badge>
                </div>
                <CardDescription className="text-xs text-slate-600">
                  Generate repeating daily or weekly bookings sharing a single Recurring Group ID.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <div onFocusCapture={() => setActiveField('isRecurring')}>
                  <Switch
                    name="isRecurring"
                    label="Enable Recurring Itinerary"
                    helperText="Automatically create scheduled trip instances across the specified frequency"
                    checked={Boolean(formValues.isRecurring)}
                    onChange={(checked) => handleFieldChange('isRecurring', checked)}
                  />
                </div>

                {Boolean(formValues.isRecurring) && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div onFocusCapture={() => setActiveField('recurringFrequency')}>
                        <Select
                          name="recurringFrequency"
                          label="Repeat Frequency"
                          value={formValues.recurringFrequency as string}
                          onChange={(e) => handleFieldChange('recurringFrequency', e.target.value)}
                          options={[
                            { value: 'daily', label: 'Daily (Every Day)' },
                            { value: 'weekly', label: 'Weekly (Every 7 Days)' },
                          ]}
                        />
                      </div>

                      <div onFocusCapture={() => setActiveField('recurringOccurrences')}>
                        <Input
                          type="number"
                          name="recurringOccurrences"
                          label="Total Number of Occurrences"
                          min={2}
                          max={20}
                          value={String(formValues.recurringOccurrences)}
                          onChange={(e) => handleFieldChange('recurringOccurrences', parseInt(e.target.value, 10) || 2)}
                        />
                      </div>
                    </div>

                    {/* Schedule Date Preview */}
                    {recurringDatesPreview.length > 0 && (
                      <div className="p-3 bg-white rounded-xl border border-indigo-100 space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                          Scheduled Batch Preview ({recurringDatesPreview.length} trips):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {recurringDatesPreview.map((d, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center text-xs bg-indigo-50 text-indigo-900 px-2 py-0.5 rounded-md border border-indigo-200"
                            >
                              Trip #{idx + 1}: {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Section: Direct Driver Assignment (Dispatcher / Admin Only) */}
          {capabilities.canDirectDriverAssign && (
            <Card variant="elevated" className="border-slate-300 shadow-xs bg-slate-50/40">
              <CardHeader className="border-b border-slate-200 py-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CarIcon className="w-4 h-4 text-slate-700" />
                    <CardTitle className="text-base text-slate-900">Driver Assignment Strategy</CardTitle>
                  </div>
                  <Badge variant="neutral" size="sm">Fleet Ops</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-3">
                <RadioGroup
                  name="driverAssignmentType"
                  value={formValues.driverAssignmentType as string}
                  onChange={(val) => handleFieldChange('driverAssignmentType', val)}
                  options={[
                    {
                      value: 'broadcast',
                      label: 'Broadcast to Regional Fleet Pool',
                      description: 'Trip broadcasts to available driver app queues via offeredToIds.',
                    },
                    {
                      value: 'direct',
                      label: 'Direct Driver Assignment',
                      description: 'Immediately lock and assign trip to specific vehicle/operator ID.',
                    },
                  ]}
                />

                {formValues.driverAssignmentType === 'direct' && (
                  <div className="pt-2">
                    <Input
                      name="assignedDriverId"
                      label="Driver ID or Call Sign"
                      placeholder="e.g. UNIT-104 (Dave Miller) or driver UID"
                      value={formValues.assignedDriverId as string}
                      onChange={(e) => handleFieldChange('assignedDriverId', e.target.value)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Section: Price & Payment Overrides (Dispatcher / Admin Only) */}
          {capabilities.canPriceOverride && (
            <Card variant="elevated" className="border-amber-300 shadow-xs bg-amber-50/20">
              <CardHeader className="border-b border-amber-200 py-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SlidersIcon className="w-4 h-4 text-amber-700" />
                    <CardTitle className="text-base text-slate-900">Fare & Price Overrides</CardTitle>
                  </div>
                  <Badge variant="warning" size="sm">Manager Override</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <div onFocusCapture={() => setActiveField('isPriceOverridden')}>
                  <Switch
                    name="isPriceOverridden"
                    label="Manual Fare Override"
                    helperText="Manually adjust total fare quote with custom rate and line-item notes"
                    checked={Boolean(formValues.isPriceOverridden)}
                    onChange={(checked) => handleFieldChange('isPriceOverridden', checked)}
                  />
                </div>

                {Boolean(formValues.isPriceOverridden) && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div onFocusCapture={() => setActiveField('manualFare')}>
                        <Input
                          type="number"
                          name="manualFare"
                          label="Override Total Fare ($)"
                          placeholder="e.g. 35.00"
                          step="0.01"
                          value={String(formValues.manualFare)}
                          onChange={(e) => handleFieldChange('manualFare', e.target.value)}
                          error={errors.manualFare}
                          required
                        />
                      </div>

                      <div onFocusCapture={() => setActiveField('overrideReason')}>
                        <Input
                          name="overrideReason"
                          label="Override Justification"
                          placeholder="e.g. VIP Negotiated Rate / Weather Discount"
                          value={formValues.overrideReason as string}
                          onChange={(e) => handleFieldChange('overrideReason', e.target.value)}
                        />
                      </div>
                    </div>

                    <Input
                      name="lineItemNotes"
                      label="Line-Item Notes"
                      placeholder="e.g. Includes $10 waiting fee, minus $5 courtesy credit"
                      value={formValues.lineItemNotes as string}
                      onChange={(e) => handleFieldChange('lineItemNotes', e.target.value)}
                    />
                  </div>
                )}

                {capabilities.canBypassPayment && (
                  <div className="pt-2 border-t border-amber-100">
                    <Switch
                      name="bypassPayment"
                      label="Bypass Immediate Digital Payment"
                      helperText="Permit trip creation without credit card authorization"
                      checked={Boolean(formValues.bypassPayment)}
                      onChange={(checked) => handleFieldChange('bypassPayment', checked)}
                    />

                    {Boolean(formValues.bypassPayment) && (
                      <div className="mt-3">
                        <Select
                          name="bypassReason"
                          label="Payment Bypass Mechanism"
                          value={formValues.bypassReason as string}
                          onChange={(e) => handleFieldChange('bypassReason', e.target.value)}
                          options={[
                            { value: 'cash_in_cab', label: 'Driver Collects Cash / Card in Cab' },
                            { value: 'account_billing', label: 'Direct Monthly Corporate Invoicing (Net 30)' },
                            { value: 'complimentary', label: 'Complimentary / Management Courtesy Ride' },
                          ]}
                        />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Section 5: Passenger Contact Information & Instructions */}
          <Card variant="default" className="shadow-xs border-slate-200">
            <CardHeader className="bg-slate-50/60 border-b border-slate-100 py-3.5">
              <div className="flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base text-slate-900">
                  {mode === 'customer' ? '5. Passenger Information' : 'Passenger Information'}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div onFocusCapture={() => setActiveField('firstName')}>
                  <Input
                    name="firstName"
                    label="First Name"
                    placeholder="Jane"
                    value={formValues.firstName as string}
                    onChange={(e) => handleFieldChange('firstName', e.target.value)}
                    error={errors.firstName}
                    required
                  />
                </div>

                <div onFocusCapture={() => setActiveField('lastName')}>
                  <Input
                    name="lastName"
                    label="Last Name"
                    placeholder="Doe"
                    value={formValues.lastName as string}
                    onChange={(e) => handleFieldChange('lastName', e.target.value)}
                    error={errors.lastName}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div onFocusCapture={() => setActiveField('phone')}>
                  <Input
                    type="tel"
                    name="phone"
                    label="Phone Number (SMS Dispatch Alerts)"
                    placeholder="(314) 555-0199"
                    value={formValues.phone as string}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    error={errors.phone}
                    required
                  />
                </div>

                <div onFocusCapture={() => setActiveField('email')}>
                  <Input
                    type="email"
                    name="email"
                    label="Email Address (Receipt & Tracking)"
                    placeholder="jane.doe@example.com"
                    value={formValues.email as string}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    error={errors.email}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div onFocusCapture={() => setActiveField('corporateAccountId')}>
                  <Input
                    name="corporateAccountId"
                    label="Corporate Account Code (Optional)"
                    placeholder="e.g. CORP-WEST-10"
                    value={formValues.corporateAccountId as string}
                    onChange={(e) => handleFieldChange('corporateAccountId', e.target.value)}
                  />
                </div>

                <div onFocusCapture={() => setActiveField('promoCode')}>
                  <Input
                    name="promoCode"
                    label="Promo or Voucher Code (Optional)"
                    placeholder="e.g. CHESTERFIELD10"
                    value={formValues.promoCode as string}
                    onChange={(e) => handleFieldChange('promoCode', e.target.value)}
                  />
                </div>
              </div>

              <div onFocusCapture={() => setActiveField('specialRequests')}>
                <Textarea
                  name="specialRequests"
                  label="Special Instructions for Driver"
                  placeholder="Gate code, passenger pickup notes, child safety seat requests..."
                  value={formValues.specialRequests as string}
                  onChange={(e) => handleFieldChange('specialRequests', e.target.value)}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 6: Payment & Terms */}
          <Card variant="default" className="shadow-xs border-slate-200">
            <CardHeader className="bg-slate-50/60 border-b border-slate-100 py-3.5">
              <div className="flex items-center gap-2">
                <DollarSignIcon className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base text-slate-900">
                  {mode === 'customer' ? '6. Payment Options' : 'Payment Confirmation'}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div onFocusCapture={() => setActiveField('paymentMethod')}>
                <RadioGroup
                  name="paymentMethod"
                  label="Select Payment Method"
                  value={formValues.paymentMethod as string}
                  onChange={(val) => handleFieldChange('paymentMethod', val)}
                  options={[
                    {
                      value: 'card',
                      label: 'Credit or Debit Card',
                      description: 'Pay securely online or tap card in-cab with the driver.',
                    },
                    {
                      value: 'cash',
                      label: 'Pay Driver in Cash',
                      description: 'Exact change appreciated; driver issues printed or digital receipt.',
                    },
                    {
                      value: 'corporate',
                      label: 'Corporate Account Billing',
                      description: 'Direct Net-30 monthly invoicing for registered corporate clients.',
                    },
                  ]}
                />
              </div>

              {capabilities.requireTermsAcceptance && (
                <div onFocusCapture={() => setActiveField('termsAccepted')} className="pt-2">
                  <Checkbox
                    name="termsAccepted"
                    label="I understand that rates are fixed upfront and accept Chesterfield Taxi reservation terms & cancellation policies."
                    checked={Boolean(formValues.termsAccepted)}
                    onChange={(checked) => handleFieldChange('termsAccepted', checked)}
                    error={errors.termsAccepted}
                    required
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Contextual Help & Real-Time Fare Breakdown Panel */}
        <div className="lg:col-span-4 sticky top-6 space-y-5">
          {/* Contextual Guidance Card */}
          <Card variant="default" className="border-amber-200/90 shadow-xs bg-amber-50/30 overflow-hidden transition-all">
            <div className="bg-amber-100/70 px-4 py-2.5 border-b border-amber-200 flex items-center gap-2 text-xs font-bold text-amber-950 uppercase tracking-wide">
              {activeGuide.icon}
              <span>{activeGuide.title}</span>
            </div>
            <CardContent className="p-4 text-xs text-slate-700 leading-relaxed">
              {activeGuide.content}
            </CardContent>
          </Card>

          {/* Itemized Fare Breakdown Card */}
          <Card variant="default" className="border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between text-xs">
              <span className="font-bold tracking-wide flex items-center gap-1.5">
                <ShieldCheckIcon className="w-4 h-4 text-amber-400" />
                Transparent Fare Breakdown
              </span>
              {quote?.isLiveGoogleResult && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Maps Route
                </span>
              )}
            </div>

            <CardContent className="p-4 sm:p-5 space-y-4">
              {/* Distance & Duration Badges */}
              {quote ? (
                <div className="grid grid-cols-2 gap-2 text-center bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Est. Distance
                    </span>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">
                      {quote.estimatedDistanceMiles.toFixed(2)} mi
                    </p>
                  </div>
                  <div className="border-l border-slate-200">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Est. Duration
                    </span>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">
                      ~{Math.round(quote.estimatedDurationMinutes)} mins
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                  Enter pickup & dropoff addresses to calculate guaranteed road mileage and fare.
                </div>
              )}

              {/* Line items */}
              {quote && (
                <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex justify-between">
                    <span>Base Flag Drop</span>
                    <span className="font-semibold text-slate-900">${quote.pricing.baseFare.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Distance & Time</span>
                    <span className="font-semibold text-slate-900">
                      ${((quote.pricing.distanceMiles * quote.pricing.distanceRate) + (quote.pricing.durationMinutes * quote.pricing.timeRate)).toFixed(2)}
                    </span>
                  </div>
                  {quote.pricing.vehicleMultiplier !== 1 && (
                    <div className="flex justify-between">
                      <span>Vehicle Tier Multiplier ({currentVehicleTier})</span>
                      <span className="font-semibold text-slate-900">{quote.pricing.vehicleMultiplier}x</span>
                    </div>
                  )}
                  {airportDetection.isAirportTrip && (
                    <div className="flex justify-between text-amber-800">
                      <span>Airport Hub Access</span>
                      <span className="font-semibold">Included</span>
                    </div>
                  )}
                  {Boolean(formValues.isPriceOverridden) && (
                    <div className="flex justify-between text-indigo-700 font-bold bg-indigo-50 p-1.5 rounded-lg">
                      <span>Manual Override Adjustment</span>
                      <span>Applied</span>
                    </div>
                  )}
                </div>
              )}

              {/* Large Quoted Total Display */}
              <div className="pt-3 border-t border-slate-200 flex items-baseline justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {Boolean(formValues.isPriceOverridden) ? 'OVERRIDE TOTAL' : 'ESTIMATED TOTAL'}
                  </span>
                  {Boolean(formValues.isRecurring) && (
                    <p className="text-[11px] text-indigo-600 font-medium">
                      Per Trip ({recurringDatesPreview.length} Trips Total)
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {isQuoteLoading ? (
                    <div className="flex items-center gap-1.5 text-amber-600">
                      <SpinnerIcon className="w-5 h-5 animate-spin" />
                      <span className="text-sm font-semibold">Calculating...</span>
                    </div>
                  ) : effectiveFare !== null ? (
                    <span className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
                      ${effectiveFare.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-lg font-bold text-slate-400">--</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky Bottom Summary Footer */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl py-3 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Left summary info */}
          <div className="text-left w-full sm:w-auto truncate">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 truncate">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span className="truncate">
                {formValues.pickupAddress ? String(formValues.pickupAddress).split(',')[0] : 'Enter Pickup'}
                {' → '}
                {formValues.dropoffAddress ? String(formValues.dropoffAddress).split(',')[0] : 'Enter Destination'}
              </span>
              <span className="text-slate-400 font-normal shrink-0">
                • {currentVehicleTier.toUpperCase()}
              </span>
              {Boolean(formValues.isRecurring) && (
                <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0">
                  {recurringDatesPreview.length} Recurring Trips
                </span>
              )}
            </div>
          </div>

          {/* Right action area */}
          <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto shrink-0">
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Total Quoted Fare
              </span>
              {isQuoteLoading ? (
                <span className="text-xs text-amber-600 font-semibold animate-pulse">Calculating...</span>
              ) : effectiveFare !== null ? (
                <span className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
                  ${effectiveFare.toFixed(2)}
                </span>
              ) : (
                <span className="text-sm font-bold text-slate-400">Pending route</span>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              onClick={() => handleSubmitBooking()}
              className="px-6 sm:px-8 shadow-md text-sm sm:text-base font-bold whitespace-nowrap"
            >
              {mode === 'customer' ? 'Book Ride Now' : 'Dispatch Booking'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default BookingEngine;
