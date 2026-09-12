import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Trip, CreateTripInput, TripLocation, VehicleTier, PaymentMethod, TripPricing } from '../../core/types';
import { getBookingService, getEmailDispatchService, type QuoteResponse } from '../../core/services';
import { detectAirportInAddresses, MAJOR_AIRLINES } from '../../core/config/airports';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import { LocationAutocomplete } from './LocationAutocomplete';
import { BookingConfirmation, type EmailDeliveryFeedback } from './BookingConfirmation';
import {
  CarIcon,
  ClockIcon,
  CheckIcon,
  SpinnerIcon,
  ShieldCheckIcon,
  PhoneIcon,
  UserIcon,
} from '../ui/Icons';

export interface BookingEngineV2Props {
  className?: string;
  onBookingSuccess?: (trip: Trip) => void;
}

type SpecialRequestKey = 'petFriendly' | 'wheelchair' | 'quietRide' | 'musicOk';

export interface WaypointItem {
  id: string;
  address: string;
  placeId?: string;
  coordinates?: { lat: number; lng: number };
}

interface FormState {
  // Booking Type & Schedule
  bookingType: 'asap' | 'scheduled';
  scheduledDateTime: string; // ISO / datetime-local format

  // Locations
  pickupAddress: string;
  pickupPlaceId?: string;
  pickupCoordinates?: { lat: number; lng: number };
  dropoffAddress: string;
  dropoffPlaceId?: string;
  dropoffCoordinates?: { lat: number; lng: number };
  intermediateStops: WaypointItem[];
  hasIntermediateStop: boolean;
  intermediateStopAddress: string;
  intermediateStopPlaceId?: string;
  intermediateStopCoordinates?: { lat: number; lng: number };

  // Flight Info
  airline: string;
  flightNumber: string;
  flightOrigin: string;
  hasCheckedLuggage: boolean;

  // Passengers & Luggage
  passengerCount: number;
  luggageCount: number;
  carSeatsCount: number;
  showCarSeats: boolean;

  // Vehicle Preference
  vehicleTier: VehicleTier;

  // Special Requests
  specialRequests: Record<SpecialRequestKey, boolean>;

  // Return Trip
  bookReturnTrip: boolean;

  // Passenger Information
  isBookingForSomeoneElse: boolean;
  passengerName: string;
  passengerPhone: string;
  passengerEmail: string;
  bookerName: string;
  bookerPhone: string;
  bookerEmail: string;
  smsConsent: boolean;

  // Ride Instructions
  driverNotes: string;
  gateCode: string;
  showGateCode: boolean;

  // Payment Method
  paymentMethod: 'cash' | 'card' | 'corporate';
  corporateOrgName: string;
  corporateAccountNumber: string;
  corporateCostCenter: string;
  corporateBookedBy: string;
}

export function BookingEngineV2({ className = '', onBookingSuccess }: BookingEngineV2Props) {
  // Form State
  const [form, setForm] = useState<FormState>({
    bookingType: 'scheduled',
    scheduledDateTime: '',
    pickupAddress: '',
    dropoffAddress: '',
    intermediateStops: [],
    hasIntermediateStop: false,
    intermediateStopAddress: '',
    airline: '',
    flightNumber: '',
    flightOrigin: '',
    hasCheckedLuggage: false,
    passengerCount: 1,
    luggageCount: 1,
    carSeatsCount: 0,
    showCarSeats: false,
    vehicleTier: 'standard',
    specialRequests: {
      petFriendly: false,
      wheelchair: false,
      quietRide: false,
      musicOk: false,
    },
    bookReturnTrip: false,
    isBookingForSomeoneElse: false,
    passengerName: '',
    passengerPhone: '',
    passengerEmail: '',
    bookerName: '',
    bookerPhone: '',
    bookerEmail: '',
    smsConsent: true,
    driverNotes: '',
    gateCode: '',
    showGateCode: false,
    paymentMethod: 'card',
    corporateOrgName: '',
    corporateAccountNumber: '',
    corporateCostCenter: '',
    corporateBookedBy: '',
  });

  // Waypoint Management Handlers
  const handleAddStop = () => {
    if (form.intermediateStops.length >= 5) return;
    setForm((prev) => {
      const newStops = [
        ...prev.intermediateStops,
        {
          id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          address: '',
        },
      ];
      return {
        ...prev,
        intermediateStops: newStops,
        hasIntermediateStop: true,
      };
    });
  };

  const handleUpdateStop = (id: string, updates: Partial<WaypointItem>) => {
    setForm((prev) => {
      const nextStops = prev.intermediateStops.map((stop) =>
        stop.id === id ? { ...stop, ...updates } : stop
      );
      return {
        ...prev,
        intermediateStops: nextStops,
        hasIntermediateStop: nextStops.length > 0,
        intermediateStopAddress: nextStops[0]?.address ?? '',
      };
    });
  };

  const handleRemoveStop = (id: string) => {
    setForm((prev) => {
      const nextStops = prev.intermediateStops.filter((stop) => stop.id !== id);
      return {
        ...prev,
        intermediateStops: nextStops,
        hasIntermediateStop: nextStops.length > 0,
        intermediateStopAddress: nextStops[0]?.address ?? '',
      };
    });
  };

  const handleMoveStop = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= form.intermediateStops.length) return;
    setForm((prev) => {
      const nextStops = [...prev.intermediateStops];
      const temp = nextStops[index];
      nextStops[index] = nextStops[targetIndex];
      nextStops[targetIndex] = temp;
      return {
        ...prev,
        intermediateStops: nextStops,
        intermediateStopAddress: nextStops[0]?.address ?? '',
      };
    });
  };

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Quote calculation state
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedTrip, setConfirmedTrip] = useState<Trip | null>(null);
  const [emailDelivery, setEmailDelivery] = useState<EmailDeliveryFeedback>({ status: 'idle' });

  // Contextual Help state
  const [activeField, setActiveField] = useState<string>('pickupTime');
  const [isHelpDrawerOpen, setIsHelpDrawerOpen] = useState(false);

  // Airport detection
  const airportDetection = useMemo(() => {
    return detectAirportInAddresses(form.pickupAddress, form.dropoffAddress);
  }, [form.pickupAddress, form.dropoffAddress]);

  // Recalculate quote whenever route or vehicle changes
  const fetchLiveQuote = useCallback(async () => {
    if (!form.pickupAddress || !form.dropoffAddress) {
      setQuote(null);
      return;
    }

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
        vehicleTier: form.vehicleTier,
        bookingType: form.bookingType === 'scheduled' ? 'scheduled' : 'asap',
        scheduledPickupTime: form.bookingType === 'scheduled' && form.scheduledDateTime ? new Date(form.scheduledDateTime).toISOString() : undefined,
        passengerCount: form.passengerCount,
        luggageCount: form.luggageCount,
      });

      setQuote(quoteRes);
    } catch (err: unknown) {
      console.warn('[BookingEngineV2] Quote calculation failed:', err);
      setQuoteError('Unable to calculate upfront route fare. Please check your addresses.');
    } finally {
      setIsQuoteLoading(false);
    }
  }, [
    form.pickupAddress,
    form.dropoffAddress,
    form.intermediateStops,
    form.pickupCoordinates,
    form.dropoffCoordinates,
    form.vehicleTier,
    form.bookingType,
    form.scheduledDateTime,
    form.passengerCount,
    form.luggageCount,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLiveQuote();
    }, 400);
    return () => clearTimeout(timer);
  }, [fetchLiveQuote]);

  // Swap pickup & dropoff
  const handleSwapAddresses = () => {
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

  // Toggle special requests
  const handleToggleSpecialRequest = (key: SpecialRequestKey) => {
    setForm((prev) => ({
      ...prev,
      specialRequests: {
        ...prev.specialRequests,
        [key]: !prev.specialRequests[key],
      },
    }));
  };

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.pickupAddress.trim()) {
      newErrors.pickupAddress = 'Pickup location is required.';
    }
    if (!form.dropoffAddress.trim()) {
      newErrors.dropoffAddress = 'Dropoff destination is required.';
    }
    if (form.intermediateStops.length > 0) {
      form.intermediateStops.forEach((stop, idx) => {
        if (!stop.address.trim()) {
          newErrors[`intermediateStop_${stop.id}`] = `Intermediate Stop #${idx + 1} address is required.`;
        }
      });
    } else if (form.hasIntermediateStop && !form.intermediateStopAddress.trim()) {
      newErrors.intermediateStopAddress = 'Intermediate stop address is required.';
    }
    if (form.bookingType === 'scheduled' && !form.scheduledDateTime) {
      newErrors.scheduledDateTime = 'Please select a pickup date and time.';
    }

    if (!form.passengerName.trim()) {
      newErrors.passengerName = 'Passenger full name is required.';
    }
    if (!form.passengerPhone.trim()) {
      newErrors.passengerPhone = 'Passenger mobile number is required.';
    }
    if (!form.passengerEmail.trim()) {
      newErrors.passengerEmail = 'Passenger email address is required.';
    }

    if (form.isBookingForSomeoneElse) {
      if (!form.bookerName.trim()) {
        newErrors.bookerName = 'Booker name is required.';
      }
      if (!form.bookerPhone.trim()) {
        newErrors.bookerPhone = 'Booker phone number is required.';
      }
      if (!form.bookerEmail.trim()) {
        newErrors.bookerEmail = 'Booker email is required for receipts.';
      }
    }

    if (form.paymentMethod === 'corporate') {
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
  const handleBookRide = async () => {
    if (!validateForm()) return;

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

      const intermediateStopsLocations: TripLocation[] = form.intermediateStops.length > 0
        ? form.intermediateStops
            .filter((s) => s.address && s.address.trim().length > 0)
            .map((s) => ({
              address: s.address.trim(),
              placeId: s.placeId,
              coordinates: s.coordinates || { lat: 38.64, lng: -90.35 },
            }))
        : form.hasIntermediateStop && form.intermediateStopAddress
        ? [
            {
              address: form.intermediateStopAddress.trim(),
              placeId: form.intermediateStopPlaceId,
              coordinates: form.intermediateStopCoordinates || { lat: 38.64, lng: -90.35 },
            },
          ]
        : [];

      // Special requests notes
      const activeSpecialRequests = Object.entries(form.specialRequests)
        .filter(([, active]) => active)
        .map(([k]) => {
          if (k === 'petFriendly') return 'Pet-friendly';
          if (k === 'wheelchair') return 'Wheelchair accessible';
          if (k === 'quietRide') return 'Quiet ride requested';
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
      if (form.airline || form.flightNumber) {
        combinedNotes = `[Flight: ${form.airline} #${form.flightNumber} from ${form.flightOrigin || 'N/A'}${form.hasCheckedLuggage ? ' (Checked Luggage)' : ''}] ${combinedNotes}`.trim();
      }

      const effectivePricing: TripPricing = quote?.pricing || {
        baseFare: 20,
        distanceMiles: 5,
        durationMinutes: 15,
        distanceRate: 2.8,
        timeRate: 0.5,
        vehicleMultiplier: 1.0,
        surgeMultiplier: 1.0,
        discountAmount: 0,
        subtotal: 25,
        totalFare: 25,
        currency: 'USD',
      };

      const inputPayload: CreateTripInput = {
        pickupLocation,
        dropoffLocation,
        intermediateStops: intermediateStopsLocations.length > 0 ? intermediateStopsLocations : undefined,
        bookingType: form.bookingType === 'scheduled' ? 'scheduled' : 'asap',
        scheduledPickupTime:
          form.bookingType === 'scheduled' && form.scheduledDateTime
            ? new Date(form.scheduledDateTime).toISOString()
            : undefined,
        vehicleTier: form.vehicleTier,
        passenger: {
          firstName: form.passengerName.split(' ')[0] || form.passengerName,
          lastName: form.passengerName.split(' ').slice(1).join(' ') || '',
          email: form.passengerEmail,
          phone: form.passengerPhone,
          passengerCount: form.passengerCount,
          luggageCount: form.luggageCount,
          specialRequests: activeSpecialRequests.join(', '),
        },
        pricing: effectivePricing,
        payment: {
          method: form.paymentMethod,
          status: 'pending',
          amount: effectivePricing.totalFare,
        },
        metadata: {
          isBookingForSomeoneElse: form.isBookingForSomeoneElse,
          bookerName: form.isBookingForSomeoneElse ? form.bookerName : undefined,
          bookerPhone: form.isBookingForSomeoneElse ? form.bookerPhone : undefined,
          bookerEmail: form.isBookingForSomeoneElse ? form.bookerEmail : undefined,
          corporateOrgName: form.paymentMethod === 'corporate' ? form.corporateOrgName : undefined,
          corporateAccountNumber: form.paymentMethod === 'corporate' ? form.corporateAccountNumber : undefined,
          corporateCostCenter: form.paymentMethod === 'corporate' ? form.corporateCostCenter : undefined,
          corporateBookedBy: form.paymentMethod === 'corporate' ? form.corporateBookedBy : undefined,
          airline: form.airline,
          flightNumber: form.flightNumber,
          flightOrigin: form.flightOrigin,
          hasCheckedLuggage: form.hasCheckedLuggage,
          gateCode: form.gateCode,
          driverNotes: combinedNotes,
          smsConsent: form.smsConsent,
          isAirportTrip: Boolean(airportDetection.isAirportTrip),
          airportIataCode: airportDetection.airport?.iataCode,
        },
      };

      const createdTrip = await bookingService.createBooking(inputPayload);

      // Trigger transactional confirmation email
      try {
        setEmailDelivery({ status: 'sending', recipient: createdTrip.passenger.email });
        const emailService = getEmailDispatchService();
        const emailResult = await emailService.sendBookingConfirmation({
          tripId: createdTrip.id,
          passenger: {
            firstName: createdTrip.passenger.firstName,
            lastName: createdTrip.passenger.lastName,
            email: createdTrip.passenger.email,
            phone: createdTrip.passenger.phone,
          },
          pickupAddress: createdTrip.pickupLocation.address,
          dropoffAddress: createdTrip.dropoffLocation.address,
          pickupTime:
            createdTrip.bookingType === 'scheduled' && createdTrip.scheduledPickupTime
              ? new Date(createdTrip.scheduledPickupTime).toLocaleString()
              : 'Immediate Ride (ASAP)',
          bookingType: createdTrip.bookingType,
          vehicleTier: createdTrip.vehicleTier,
          passengerCount: createdTrip.passenger.passengerCount,
          luggageCount: createdTrip.passenger.luggageCount,
          totalFare: createdTrip.pricing.totalFare,
          currency: createdTrip.pricing.currency,
          paymentMethod: createdTrip.payment.method,
          specialRequests: createdTrip.passenger.specialRequests,
        });
        if (emailResult.success) {
          setEmailDelivery({ status: 'sent', messageId: emailResult.messageId });
        } else {
          setEmailDelivery({ status: 'failed', error: emailResult.error });
        }
      } catch (err: unknown) {
        console.warn('[BookingEngineV2] Email dispatch failed:', err);
        setEmailDelivery({
          status: 'failed',
          error: err instanceof Error ? err.message : 'Failed to dispatch email.',
        });
      }

      setConfirmedTrip(createdTrip);
      onBookingSuccess?.(createdTrip);
    } catch (err: unknown) {
      console.error('[BookingEngineV2] Booking creation failed:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to record reservation. Please try again.');
    } finally {
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
              hasIntermediateStop: false,
              intermediateStopAddress: '',
              flightNumber: '',
              driverNotes: '',
              gateCode: '',
            }));
            setQuote(null);
          }}
        />
      </div>
    );
  }

  const effectiveFare = quote?.pricing.totalFare ?? null;

  return (
    <div className={`relative max-w-6xl mx-auto ${className}`}>
      {/* Grid: Left Main Stack, Right Contextual Help & Fare Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pb-24">
        {/* Left Column: Form Card Stack */}
        <div className="lg:col-span-8 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Book Your Ride
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Get an instant quote for your trip
            </p>
          </div>

          {/* Error Banner if any */}
          {submitError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start gap-3">
              <span className="text-rose-500 font-bold">✕</span>
              <div>
                <p className="font-bold">Reservation Error</p>
                <p className="text-xs text-rose-700 mt-0.5">{submitError}</p>
              </div>
            </div>
          )}

          {/* Section: Pickup Time */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-900">
              Pickup Time
            </label>
            <div className="bg-slate-100 p-1.5 rounded-xl flex flex-col sm:flex-row gap-1.5 items-stretch sm:items-center">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, bookingType: 'asap' }));
                    setActiveField('pickupTime');
                  }}
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${
                    form.bookingType === 'asap'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, bookingType: 'scheduled' }));
                    setActiveField('pickupTime');
                  }}
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${
                    form.bookingType === 'scheduled'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Schedule
                </button>
              </div>

              {form.bookingType === 'scheduled' && (
                <div className="flex-1">
                  <input
                    type="datetime-local"
                    name="scheduledDateTime"
                    value={form.scheduledDateTime}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, scheduledDateTime: e.target.value }));
                      if (errors.scheduledDateTime) setErrors((prev) => ({ ...prev, scheduledDateTime: '' }));
                    }}
                    onFocus={() => setActiveField('scheduledDateTime')}
                    className={`w-full bg-white border ${
                      errors.scheduledDateTime ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                    } text-slate-800 text-xs sm:text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-2xs`}
                    placeholder="Select date and time"
                  />
                  {errors.scheduledDateTime && (
                    <p className="text-xs text-rose-500 font-medium mt-1">
                      {errors.scheduledDateTime}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section: Trip Details */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-900">
              Trip Details
            </label>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
              <div className="relative space-y-3">
                {/* Swap addresses button */}
                <button
                  type="button"
                  onClick={handleSwapAddresses}
                  title="Swap pickup and dropoff"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 flex items-center justify-center shadow-xs z-10 transition-colors"
                >
                  ⇅
                </button>

                {/* Pickup Location */}
                <div className="relative pr-10" onFocusCapture={() => setActiveField('pickupAddress')}>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                    <div className="flex-1 relative">
                      <LocationAutocomplete
                        name="pickupAddress"
                        placeholder="Pickup location (e.g. Lambert-St. Louis Airport)"
                        value={form.pickupAddress}
                        onChange={(val) => {
                          setForm((prev) => ({ ...prev, pickupAddress: val }));
                          if (errors.pickupAddress) setErrors((prev) => ({ ...prev, pickupAddress: '' }));
                        }}
                        onPlaceSelected={(details) => {
                          setForm((prev) => ({
                            ...prev,
                            pickupAddress: details.formattedAddress || '',
                            pickupPlaceId: details.placeId,
                            pickupCoordinates: details.coordinates,
                          }));
                        }}
                        error={errors.pickupAddress}
                        required
                        icon="map-pin"
                      />
                      {form.pickupAddress && (
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, pickupAddress: '', pickupCoordinates: undefined }))}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                          title="Clear pickup address"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dynamic Multi-Stop Waypoints */}
                {form.intermediateStops.map((stop, index) => (
                  <div
                    key={stop.id}
                    className="relative pl-5 border-l-2 border-dashed border-amber-400 ml-1.5 my-1"
                    onFocusCapture={() => setActiveField('intermediateStopAddress')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-extrabold text-[10px] flex items-center justify-center shrink-0 shadow-xs">
                        {index + 1}
                      </span>
                      <div className="flex-1 relative">
                        <LocationAutocomplete
                          name={`intermediateStop_${stop.id}`}
                          placeholder={`Stop #${index + 1} address or landmark`}
                          value={stop.address}
                          onChange={(val) => {
                            handleUpdateStop(stop.id, { address: val });
                            if (errors[`intermediateStop_${stop.id}`]) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next[`intermediateStop_${stop.id}`];
                                return next;
                              });
                            }
                          }}
                          onPlaceSelected={(details) => {
                            handleUpdateStop(stop.id, {
                              address: details.formattedAddress || '',
                              placeId: details.placeId,
                              coordinates: details.coordinates,
                            });
                          }}
                          error={errors[`intermediateStop_${stop.id}`]}
                          required
                          icon="map-pin"
                        />
                      </div>

                      {/* Waypoint Actions: Up, Down, Delete */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveStop(index, 'up')}
                          disabled={index === 0}
                          title="Move stop earlier in route"
                          className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white text-slate-700 flex items-center justify-center text-xs font-bold transition-colors shadow-2xs"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveStop(index, 'down')}
                          disabled={index === form.intermediateStops.length - 1}
                          title="Move stop later in route"
                          className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white text-slate-700 flex items-center justify-center text-xs font-bold transition-colors shadow-2xs"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveStop(stop.id)}
                          title="Remove waypoint"
                          className="w-7 h-7 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs font-bold transition-colors shadow-2xs"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Dropoff Location */}
                <div className="relative pr-10" onFocusCapture={() => setActiveField('dropoffAddress')}>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
                    <div className="flex-1 relative">
                      <LocationAutocomplete
                        name="dropoffAddress"
                        placeholder="Dropoff location"
                        value={form.dropoffAddress}
                        onChange={(val) => {
                          setForm((prev) => ({ ...prev, dropoffAddress: val }));
                          if (errors.dropoffAddress) setErrors((prev) => ({ ...prev, dropoffAddress: '' }));
                        }}
                        onPlaceSelected={(details) => {
                          setForm((prev) => ({
                            ...prev,
                            dropoffAddress: details.formattedAddress || '',
                            dropoffPlaceId: details.placeId,
                            dropoffCoordinates: details.coordinates,
                          }));
                        }}
                        error={errors.dropoffAddress}
                        required
                        icon="map-pin"
                      />
                      {form.dropoffAddress && (
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, dropoffAddress: '', dropoffCoordinates: undefined }))}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                          title="Clear dropoff address"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Add Stop Button */}
              {form.intermediateStops.length < 5 && (
                <button
                  type="button"
                  onClick={handleAddStop}
                  className="text-amber-600 hover:text-amber-700 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 hover:underline pt-1 transition-colors"
                >
                  <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">+</span>
                  <span>Add Stop {form.intermediateStops.length > 0 ? `(${form.intermediateStops.length}/5)` : ''}</span>
                </button>
              )}

              {/* Flight Information Subcard (Airport Transfer Detected) */}
              {(airportDetection.isAirportTrip || form.airline || form.flightNumber) && (
                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-4 mt-3 space-y-3" onFocusCapture={() => setActiveField('flightInfo')}>
                  <div className="flex items-center gap-2 text-blue-800 font-bold text-xs sm:text-sm">
                    <span>✈</span>
                    <span>Flight Information ({airportDetection.airport?.iataCode || 'STL Airport'})</span>
                  </div>

                  <div>
                    <select
                      value={form.airline}
                      onChange={(e) => setForm((prev) => ({ ...prev, airline: e.target.value }))}
                      className="w-full bg-white border border-blue-200 text-slate-800 text-xs sm:text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">Select Airline</option>
                      {MAJOR_AIRLINES.map((airline) => (
                        <option key={airline.code} value={airline.name}>
                          {airline.name} ({airline.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Flight #"
                      value={form.flightNumber}
                      onChange={(e) => setForm((prev) => ({ ...prev, flightNumber: e.target.value }))}
                      className="w-full bg-white border border-blue-200 text-slate-800 text-xs sm:text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 placeholder:text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Origin (City/Code)"
                      value={form.flightOrigin}
                      onChange={(e) => setForm((prev) => ({ ...prev, flightOrigin: e.target.value }))}
                      className="w-full bg-white border border-blue-200 text-slate-800 text-xs sm:text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 placeholder:text-slate-400"
                    />
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={form.hasCheckedLuggage}
                      onChange={(e) => setForm((prev) => ({ ...prev, hasCheckedLuggage: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                    />
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">
                        Passenger has checked luggage
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Helps us estimate pickup time (usually +20-30 mins for baggage claim)
                      </span>
                    </div>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Section: Passengers & Luggage */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="block text-sm font-bold text-slate-900">
                Passengers &amp; Luggage
              </label>
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">
                ✓
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                {/* Passengers Stepper */}
                <div className="flex items-center justify-between sm:justify-start gap-4">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-800 min-w-[100px]">
                    <UserIcon className="w-4 h-4 text-slate-500" />
                    <span>Passengers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, passengerCount: Math.max(1, prev.passengerCount - 1) }))}
                      className="w-8 h-8 rounded-full border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 font-bold transition-colors"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-bold text-slate-900 text-sm sm:text-base">
                      {form.passengerCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, passengerCount: Math.min(14, prev.passengerCount + 1) }))}
                      className="w-8 h-8 rounded-full border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 font-bold transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Luggage Stepper */}
                <div className="flex items-center justify-between sm:justify-start gap-4">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-800 min-w-[90px]">
                    <span>🧳</span>
                    <span>Luggage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, luggageCount: Math.max(0, prev.luggageCount - 1) }))}
                      className="w-8 h-8 rounded-full border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 font-bold transition-colors"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-bold text-slate-900 text-sm sm:text-base">
                      {form.luggageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, luggageCount: Math.min(10, prev.luggageCount + 1) }))}
                      className="w-8 h-8 rounded-full border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 font-bold transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Optional Car Seats */}
              <div>
                {!form.showCarSeats ? (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, showCarSeats: true, carSeatsCount: 1 }))}
                    className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    <span>+</span> Add Car Seats
                  </button>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">Child Car Seats / Boosters:</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(0, form.carSeatsCount - 1);
                          setForm((prev) => ({ ...prev, carSeatsCount: next, showCarSeats: next > 0 }));
                        }}
                        className="w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="font-bold">{form.carSeatsCount}</span>
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, carSeatsCount: prev.carSeatsCount + 1 }))}
                        className="w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section: Vehicle Preference (Optional) */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-900">
              Vehicle Preference (Optional)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {/* Sedan */}
              <button
                type="button"
                onClick={() => {
                  setForm((prev) => ({ ...prev, vehicleTier: 'standard' }));
                  setActiveField('vehicleTier');
                }}
                className={`p-4 rounded-2xl border text-left transition-all relative ${
                  form.vehicleTier === 'standard'
                    ? 'border-blue-600 ring-2 ring-blue-600/30 bg-blue-50/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="mb-2">
                  <h4 className="font-bold text-slate-900 text-sm">Sedan</h4>
                  <p className="text-xs text-slate-500">👥 Max 4</p>
                </div>
                <div className="w-full h-24 rounded-xl bg-slate-100 flex items-center justify-center p-2 overflow-hidden">
                  <svg className="w-20 h-12 text-slate-700" viewBox="0 0 120 60" fill="currentColor">
                    <path d="M10 38 L25 38 L35 22 L85 22 L100 38 L115 38 C118 38 120 40 120 44 L120 48 C120 50 118 52 115 52 L105 52 C105 45 95 45 95 52 L35 52 C35 45 25 45 25 52 L10 52 C6 52 5 48 5 44 C5 40 7 38 10 38 Z" fill="#e2e8f0" stroke="#64748b" strokeWidth="2" />
                    <circle cx="30" cy="50" r="7" fill="#1e293b" />
                    <circle cx="100" cy="50" r="7" fill="#1e293b" />
                    <path d="M40 24 L60 24 L60 36 L30 36 Z" fill="#94a3b8" />
                    <path d="M64 24 L84 24 L95 36 L64 36 Z" fill="#94a3b8" />
                  </svg>
                </div>
              </button>

              {/* SUV */}
              <button
                type="button"
                onClick={() => {
                  setForm((prev) => ({ ...prev, vehicleTier: 'premium' }));
                  setActiveField('vehicleTier');
                }}
                className={`p-4 rounded-2xl border text-left transition-all relative ${
                  form.vehicleTier === 'premium'
                    ? 'border-blue-600 ring-2 ring-blue-600/30 bg-blue-50/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="mb-2">
                  <h4 className="font-bold text-slate-900 text-sm">SUV</h4>
                  <p className="text-xs text-slate-500">👥 Max 4</p>
                </div>
                <div className="w-full h-24 rounded-xl bg-slate-100 flex items-center justify-center p-2 overflow-hidden">
                  <svg className="w-20 h-12 text-slate-700" viewBox="0 0 120 60" fill="currentColor">
                    <path d="M10 36 L25 36 L32 16 L92 16 L104 36 L116 36 C119 36 120 38 120 42 L120 48 C120 50 118 52 115 52 L105 52 C105 45 93 45 93 52 L37 52 C37 45 25 45 25 52 L10 52 C6 52 5 48 5 42 C5 38 7 36 10 36 Z" fill="#cbd5e1" stroke="#475569" strokeWidth="2" />
                    <circle cx="31" cy="50" r="8" fill="#0f172a" />
                    <circle cx="99" cy="50" r="8" fill="#0f172a" />
                    <path d="M36 19 L62 19 L62 34 L28 34 Z" fill="#64748b" />
                    <path d="M66 19 L90 19 L100 34 L66 34 Z" fill="#64748b" />
                  </svg>
                </div>
              </button>

              {/* Minivan */}
              <button
                type="button"
                onClick={() => {
                  setForm((prev) => ({ ...prev, vehicleTier: 'xl' }));
                  setActiveField('vehicleTier');
                }}
                className={`p-4 rounded-2xl border text-left transition-all relative ${
                  form.vehicleTier === 'xl'
                    ? 'border-blue-600 ring-2 ring-blue-600/30 bg-blue-50/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="mb-2">
                  <h4 className="font-bold text-slate-900 text-sm">Minivan</h4>
                  <p className="text-xs text-slate-500">👥 Max 6</p>
                </div>
                <div className="w-full h-24 rounded-xl bg-slate-100 flex items-center justify-center p-2 overflow-hidden">
                  <svg className="w-20 h-12 text-slate-700" viewBox="0 0 120 60" fill="currentColor">
                    <path d="M8 36 L20 36 L32 14 L98 14 L108 36 L118 36 C120 36 120 38 120 44 L120 48 C120 50 118 52 115 52 L105 52 C105 45 93 45 93 52 L37 52 C37 45 25 45 25 52 L8 52 C5 52 4 48 4 44 C4 38 6 36 8 36 Z" fill="#f1f5f9" stroke="#64748b" strokeWidth="2" />
                    <circle cx="31" cy="50" r="8" fill="#1e293b" />
                    <circle cx="99" cy="50" r="8" fill="#1e293b" />
                    <path d="M36 17 L62 17 L62 34 L25 34 Z" fill="#94a3b8" />
                    <path d="M66 17 L96 17 L104 34 L66 34 Z" fill="#94a3b8" />
                  </svg>
                </div>
              </button>
            </div>
          </div>

          {/* Section: Special Requests */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-900">
              Special Requests
            </label>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
              <div className="flex flex-wrap gap-2.5">
                {[
                  { key: 'petFriendly' as SpecialRequestKey, label: 'Pet-friendly' },
                  { key: 'wheelchair' as SpecialRequestKey, label: 'Wheelchair accessible' },
                  { key: 'quietRide' as SpecialRequestKey, label: 'Quiet ride' },
                  { key: 'musicOk' as SpecialRequestKey, label: 'Music OK' },
                ].map((item) => {
                  const isActive = form.specialRequests[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleToggleSpecialRequest(item.key)}
                      className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
                        isActive
                          ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section: Return Trip */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-900">
              Return Trip
            </label>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Book Return Trip</h4>
                <p className={`text-xs mt-0.5 ${!form.pickupAddress || !form.dropoffAddress ? 'text-rose-500 font-medium' : 'text-slate-500'}`}>
                  {!form.pickupAddress || !form.dropoffAddress
                    ? 'Complete your route first'
                    : 'Reserve matching return transfer'}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.bookReturnTrip}
                  disabled={!form.pickupAddress || !form.dropoffAddress}
                  onChange={(e) => setForm((prev) => ({ ...prev, bookReturnTrip: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* Section: Passenger Information */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-900">
              Passenger Information
            </label>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
              {/* Someone else checkbox */}
              <label className="flex items-center gap-2 cursor-pointer pb-2 border-b border-slate-100">
                <input
                  type="checkbox"
                  checked={form.isBookingForSomeoneElse}
                  onChange={(e) => setForm((prev) => ({ ...prev, isBookingForSomeoneElse: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="text-xs sm:text-sm font-medium text-slate-800">
                  I am booking for someone else (guest or employee)
                </span>
              </label>

              {/* Passenger Details */}
              <div className="space-y-3" onFocusCapture={() => setActiveField('passengerInfo')}>
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Passenger Details (Who is riding?)
                </h5>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">👤</span>
                  <input
                    type="text"
                    name="passengerName"
                    placeholder="Passenger Full Name"
                    value={form.passengerName}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, passengerName: e.target.value }));
                      if (errors.passengerName) setErrors((prev) => ({ ...prev, passengerName: '' }));
                    }}
                    className={`w-full pl-9 pr-3 py-2 bg-white border ${
                      errors.passengerName ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                    } rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600`}
                  />
                  {errors.passengerName && <p className="text-xs text-rose-500 mt-1">{errors.passengerName}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400">📞</span>
                    <input
                      type="tel"
                      name="passengerPhone"
                      placeholder="Passenger Mobile Number"
                      value={form.passengerPhone}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, passengerPhone: e.target.value }));
                        if (errors.passengerPhone) setErrors((prev) => ({ ...prev, passengerPhone: '' }));
                      }}
                      className={`w-full pl-9 pr-3 py-2 bg-white border ${
                        errors.passengerPhone ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                      } rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600`}
                    />
                    {errors.passengerPhone && <p className="text-xs text-rose-500 mt-1">{errors.passengerPhone}</p>}
                  </div>

                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400">✉</span>
                    <input
                      type="email"
                      name="passengerEmail"
                      placeholder="Passenger Email"
                      value={form.passengerEmail}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, passengerEmail: e.target.value }));
                        if (errors.passengerEmail) setErrors((prev) => ({ ...prev, passengerEmail: '' }));
                      }}
                      className={`w-full pl-9 pr-3 py-2 bg-white border ${
                        errors.passengerEmail ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                      } rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600`}
                    />
                    {errors.passengerEmail && <p className="text-xs text-rose-500 mt-1">{errors.passengerEmail}</p>}
                  </div>
                </div>
              </div>

              {/* Booker / Agent Details (Conditional) */}
              {form.isBookingForSomeoneElse && (
                <div className="space-y-3 pt-3 border-t border-slate-100" onFocusCapture={() => setActiveField('bookerInfo')}>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    Booker / Agent Details (For receipts &amp; confirmation)
                  </h5>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400">👤</span>
                    <input
                      type="text"
                      name="bookerName"
                      placeholder="Booker Name"
                      value={form.bookerName}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, bookerName: e.target.value }));
                        if (errors.bookerName) setErrors((prev) => ({ ...prev, bookerName: '' }));
                      }}
                      className={`w-full pl-9 pr-3 py-2 bg-white border ${
                        errors.bookerName ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                      } rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600`}
                    />
                    {errors.bookerName && <p className="text-xs text-rose-500 mt-1">{errors.bookerName}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400">📞</span>
                      <input
                        type="tel"
                        name="bookerPhone"
                        placeholder="Booker Phone"
                        value={form.bookerPhone}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, bookerPhone: e.target.value }));
                          if (errors.bookerPhone) setErrors((prev) => ({ ...prev, bookerPhone: '' }));
                        }}
                        className={`w-full pl-9 pr-3 py-2 bg-white border ${
                          errors.bookerPhone ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                        } rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600`}
                      />
                      {errors.bookerPhone && <p className="text-xs text-rose-500 mt-1">{errors.bookerPhone}</p>}
                    </div>

                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400">✉</span>
                      <input
                        type="email"
                        name="bookerEmail"
                        placeholder="Booker Email (for receipt)"
                        value={form.bookerEmail}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, bookerEmail: e.target.value }));
                          if (errors.bookerEmail) setErrors((prev) => ({ ...prev, bookerEmail: '' }));
                        }}
                        className={`w-full pl-9 pr-3 py-2 bg-white border ${
                          errors.bookerEmail ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                        } rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600`}
                      />
                      {errors.bookerEmail && <p className="text-xs text-rose-500 mt-1">{errors.bookerEmail}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* SMS Consent Checkbox */}
              <label className="flex items-start gap-2 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={form.smsConsent}
                  onChange={(e) => setForm((prev) => ({ ...prev, smsConsent: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="text-[11px] text-slate-500 leading-snug">
                  I agree to receive booking confirmations, updates, and service notifications via phone, email, or SMS. Standard message rates may apply. <a href="/privacy" className="text-blue-600 underline">Privacy Policy</a>
                </span>
              </label>
            </div>
          </div>

          {/* Section: Ride Instructions */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-900">
              Ride Instructions
            </label>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3" onFocusCapture={() => setActiveField('driverNotes')}>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes for Driver (optional)
                </label>
                <textarea
                  rows={3}
                  value={form.driverNotes}
                  onChange={(e) => setForm((prev) => ({ ...prev, driverNotes: e.target.value }))}
                  placeholder="Any special instructions? (e.g. 'Call upon arrival', 'Look for red house')"
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 placeholder:text-slate-400"
                />
              </div>

              {!form.showGateCode ? (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, showGateCode: true }))}
                  className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm font-semibold hover:underline inline-flex items-center gap-1"
                >
                  <span>+</span> Add Gate Code
                </button>
              ) : (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Gate / Subdivision Code (e.g. #1234)"
                    value={form.gateCode}
                    onChange={(e) => setForm((prev) => ({ ...prev, gateCode: e.target.value }))}
                    className="max-w-xs bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, showGateCode: false, gateCode: '' }))}
                    className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section: Payment Method */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-900">
              Payment Method
            </label>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4" onFocusCapture={() => setActiveField('paymentMethod')}>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, paymentMethod: 'cash' }))}
                    className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all border ${
                      form.paymentMethod === 'cash'
                        ? 'border-2 border-blue-600 text-blue-600 bg-white shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, paymentMethod: 'card' }))}
                    className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all border ${
                      form.paymentMethod === 'card'
                        ? 'border-2 border-blue-600 text-blue-600 bg-white shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, paymentMethod: 'corporate' }))}
                    className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all border ${
                      form.paymentMethod === 'corporate'
                        ? 'border-2 border-blue-600 text-blue-600 bg-white shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Corporate Account
                  </button>
                </div>
              </div>

              {/* Corporate Account Fields */}
              {form.paymentMethod === 'corporate' && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Organization Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="corporateOrgName"
                      placeholder="Company Name"
                      value={form.corporateOrgName}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, corporateOrgName: e.target.value }));
                        if (errors.corporateOrgName) setErrors((prev) => ({ ...prev, corporateOrgName: '' }));
                      }}
                      className={`w-full bg-white border ${
                        errors.corporateOrgName ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                      } rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600`}
                    />
                    {errors.corporateOrgName && <p className="text-xs text-rose-500 mt-1">{errors.corporateOrgName}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Account # <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="corporateAccountNumber"
                        placeholder="001"
                        value={form.corporateAccountNumber}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, corporateAccountNumber: e.target.value }));
                          if (errors.corporateAccountNumber) setErrors((prev) => ({ ...prev, corporateAccountNumber: '' }));
                        }}
                        className={`w-full bg-white border ${
                          errors.corporateAccountNumber ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                        } rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600`}
                      />
                      {errors.corporateAccountNumber && <p className="text-xs text-rose-500 mt-1">{errors.corporateAccountNumber}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Cost Center (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Internal Billing Code"
                        value={form.corporateCostCenter}
                        onChange={(e) => setForm((prev) => ({ ...prev, corporateCostCenter: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Booked By (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Name of person booking (for records)"
                      value={form.corporateBookedBy}
                      onChange={(e) => setForm((prev) => ({ ...prev, corporateBookedBy: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {/* Informational Banner */}
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs p-3 rounded-xl flex items-center gap-2">
                    <span>💡</span>
                    <span>Your company will be billed monthly for all rides using this account.</span>
                  </div>

                  {/* Validation notice if errors present */}
                  {(errors.corporateOrgName || errors.corporateAccountNumber) && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-2.5 rounded-xl font-medium">
                      Please complete all required fields
                    </div>
                  )}
                </div>
              )}

              {/* Card Notice */}
              {form.paymentMethod === 'card' && (
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">Secure In-Cab &amp; Digital Terminal:</span> Credit or debit card authorized upon driver pickup or completed in vehicle.
                </div>
              )}

              {/* Cash Notice */}
              {form.paymentMethod === 'cash' && (
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">Direct In-Cab Payment:</span> Pay your licensed chauffeur directly in cash upon dropoff at your destination.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Contextual Help & Fare Breakdown Panel */}
        <div className="hidden lg:block lg:col-span-4 sticky top-6 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Trip Summary &amp; Guidance</h3>
            </div>

            {/* Contextual guide card */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <span>💡</span>
                {activeField === 'flightInfo'
                  ? 'Flight Radar Tracking'
                  : activeField === 'paymentMethod' && form.paymentMethod === 'corporate'
                  ? 'Corporate Billing (Net-30)'
                  : activeField === 'intermediateStopAddress'
                  ? 'Multi-Stop Route Calculation'
                  : activeField === 'vehicleTier'
                  ? 'Guaranteed Vehicle Classes'
                  : 'Instant Upfront Pricing'}
              </p>
              <p className="text-[11px] text-blue-800/90 leading-relaxed">
                {activeField === 'flightInfo'
                  ? 'We continuously monitor inbound flights at STL and Spirit of St. Louis airports. Driver adjusts automatically for early arrivals or delays.'
                  : activeField === 'paymentMethod' && form.paymentMethod === 'corporate'
                  ? 'Direct corporate billing gives your organization consolidated monthly statements with PO/Cost Center codes.'
                  : activeField === 'intermediateStopAddress'
                  ? 'Intermediate stops are calculated into your upfront fixed rate. Drivers allow brief luggage transfers or guest pickups.'
                  : activeField === 'vehicleTier'
                  ? 'All vehicles in our Chesterfield fleet are commercially inspected, non-smoking, and climate controlled.'
                  : 'Your fare is calculated using live Google Maps distance and traffic metrics. What you see is what you pay.'}
              </p>
            </div>

            {/* Itemized Fare Breakdown */}
            {quote && (
              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Base Flag Drop</span>
                  <span className="font-semibold text-slate-900">${quote.pricing.baseFare.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>
                    Estimated Mileage ({quote.pricing.distanceMiles.toFixed(1)} mi)
                  </span>
                  <span className="font-semibold text-slate-900">
                    ${(quote.pricing.distanceMiles * quote.pricing.distanceRate).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Estimated Time ({quote.pricing.durationMinutes} mins)</span>
                  <span className="font-semibold text-slate-900">
                    ${(quote.pricing.durationMinutes * quote.pricing.timeRate).toFixed(2)}
                  </span>
                </div>
                {Boolean(quote.pricing.multiStopSurcharge) && (
                  <div className="flex justify-between text-amber-700 font-medium">
                    <span>Intermediate Stops ({quote.pricing.intermediateStopsCount || form.intermediateStops.length})</span>
                    <span>+${quote.pricing.multiStopSurcharge?.toFixed(2)}</span>
                  </div>
                )}
                {Boolean(quote.pricing.tollsFee) && (
                  <div className="flex justify-between text-slate-700 font-medium">
                    <span>Tolls &amp; Highway Surcharge</span>
                    <span>+${quote.pricing.tollsFee?.toFixed(2)}</span>
                  </div>
                )}
                {quote.pricing.surgeMultiplier > 1.0 && (
                  <div className="flex justify-between text-amber-600 font-medium">
                    <span>Peak Surge Multiplier</span>
                    <span>{quote.pricing.surgeMultiplier.toFixed(2)}x</span>
                  </div>
                )}
                {Boolean(quote.pricing.airportSurcharge) ? (
                  <div className="flex justify-between text-blue-800 font-medium">
                    <span>Airport Terminal Access</span>
                    <span>+${quote.pricing.airportSurcharge?.toFixed(2)}</span>
                  </div>
                ) : airportDetection.isAirportTrip ? (
                  <div className="flex justify-between text-blue-800 font-medium">
                    <span>Airport Terminal Access</span>
                    <span>Included</span>
                  </div>
                ) : null}
              </div>
            )}

            {/* Total display */}
            <div className="pt-3 border-t border-slate-200 flex items-baseline justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Estimated Total
                </span>
                <span className="text-xs font-semibold text-slate-600">
                  {form.vehicleTier.toUpperCase()} Class
                </span>
              </div>
              <div className="text-right">
                {isQuoteLoading ? (
                  <div className="flex items-center gap-1 text-blue-600 text-xs font-semibold">
                    <SpinnerIcon className="w-4 h-4 animate-spin" />
                    <span>Calculating...</span>
                  </div>
                ) : (
                  <span className="text-2xl font-extrabold text-blue-600 tracking-tight">
                    ${effectiveFare !== null ? effectiveFare.toFixed(2) : '0'}
                  </span>
                )}
              </div>
            </div>

            {/* 24/7 hotline badge */}
            <div className="pt-2 text-[11px] text-slate-500 text-center border-t border-slate-100">
              Need assistance? Call Dispatch: <strong className="text-slate-800">{COMPANY_CONFIG.phone.dispatch}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Button for Help (Bottom Right) */}
      <button
        type="button"
        onClick={() => setIsHelpDrawerOpen(!isHelpDrawerOpen)}
        className="fixed bottom-20 right-6 z-30 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center font-bold text-lg transition-transform active:scale-95"
        title="Help & Questions"
      >
        ?
      </button>

      {/* Mobile Help Drawer Modal */}
      {isHelpDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h3 className="font-bold text-slate-900 text-base">Booking Assistance &amp; FAQs</h3>
              <button
                type="button"
                onClick={() => setIsHelpDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-600">
              <div>
                <strong className="text-slate-800 block">Flight Radar Tracking:</strong>
                <p>We monitor commercial flight arrivals at STL in real-time. If your flight is delayed, your driver adjusts your pickup window automatically.</p>
              </div>
              <div>
                <strong className="text-slate-800 block">Cancellation Policy:</strong>
                <p>Free cancellations up to 2 hours prior to scheduled pickup time.</p>
              </div>
              <div>
                <strong className="text-slate-800 block">24/7 Live Dispatch Desk:</strong>
                <p>Call our local Chesterfield dispatch line anytime at <a href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`} className="text-blue-600 font-bold underline">{COMPANY_CONFIG.phone.dispatch}</a>.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsHelpDrawerOpen(false)}
              className="mt-5 w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 rounded-xl text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Sticky Bottom Summary Footer */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-xl py-3 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Left: ESTIMATED TOTAL */}
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              ESTIMATED TOTAL
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-blue-600 tracking-tight leading-none">
              ${effectiveFare !== null ? effectiveFare.toFixed(2) : '0'}
            </span>
          </div>

          {/* Right: Book Ride CTA Button */}
          <button
            type="button"
            onClick={handleBookRide}
            disabled={isSubmitting}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold text-sm sm:text-base px-8 py-3 rounded-lg shadow-sm transition-all active:scale-98 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <SpinnerIcon className="w-4 h-4 animate-spin" />
                <span>Confirming...</span>
              </>
            ) : (
              <span>Book Ride</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BookingEngineV2;
