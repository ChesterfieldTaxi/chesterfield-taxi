import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { bookingFormConfig } from '../../config/formConfig';
import type { FormStepSchema, VehicleTier, PaymentMethod, Trip, CreateTripInput } from '../../core/types';
import { isFieldVisible, isFieldRequired } from '../../core/types/field-schema';
import { getBookingService, getEmailDispatchService, type QuoteResponse } from '../../core/services';
import {
  detectAirportInAddresses,
  VEHICLE_LUGGAGE_CAPACITY,
  MAJOR_AIRLINES,
} from '../../core/config/airports';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/Card';
import { Alert } from '../ui/Alert';
import { CheckIcon, ChevronRightIcon, ChevronLeftIcon, SpinnerIcon } from '../ui/Icons';
import { FieldRenderer } from './FieldRenderer';
import { QuoteSummary } from './QuoteSummary';
import { BookingConfirmation, type EmailDeliveryFeedback } from './BookingConfirmation';
import { AirportDetectedBanner } from './AirportDetectedBanner';
import { LuggageCapacityWarning } from './LuggageCapacityWarning';

export interface BookingFormProps {
  className?: string;
  onBookingSuccess?: (trip: Trip) => void;
}

export function BookingForm({ className = '', onBookingSuccess }: BookingFormProps) {
  // Step state (0-indexed)
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Form values map
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {
      isAirportTrip: false,
    };
    for (const step of bookingFormConfig.steps) {
      for (const field of step.fields) {
        if (field.defaultValue !== undefined) {
          initial[field.name] = field.defaultValue;
        } else {
          initial[field.name] = '';
        }
      }
    }
    return initial;
  });

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Quote calculation state
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Booking submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedTrip, setConfirmedTrip] = useState<Trip | null>(null);
  const [emailDelivery, setEmailDelivery] = useState<EmailDeliveryFeedback>({ status: 'idle' });


  const steps = bookingFormConfig.steps;
  const currentStep = steps[currentStepIndex];

  // Pure airport detection based on entered addresses
  const airportDetection = useMemo(() => {
    const pickup = String(formValues.pickupAddress || '');
    const dropoff = String(formValues.dropoffAddress || '');
    return detectAirportInAddresses(pickup, dropoff);
  }, [formValues.pickupAddress, formValues.dropoffAddress]);

  // Synchronize dynamic isAirportTrip flag into formValues for FieldSchema visibility/requirement evaluation
  useEffect(() => {
    setFormValues((prev) => {
      if (prev.isAirportTrip === airportDetection.isAirportTrip) {
        return prev;
      }
      return {
        ...prev,
        isAirportTrip: airportDetection.isAirportTrip,
      };
    });
  }, [airportDetection.isAirportTrip]);

  // Vehicle luggage capacity calculation
  const currentVehicleTier = (formValues.vehicleTier as VehicleTier) || 'standard';
  const maxAllowedLuggage = VEHICLE_LUGGAGE_CAPACITY[currentVehicleTier] ?? 2;
  const currentLuggageCount = Number(formValues.luggageCount) || 0;
  const isLuggageOverCapacity = currentLuggageCount > maxAllowedLuggage;

  // Helper to update a field value
  const handleFieldChange = (name: string, value: unknown) => {
    let processedValue = value;
    if (name === 'departureAirport' && typeof value === 'string') {
      processedValue = value.toUpperCase();
    }

    setFormValues((prev) => ({
      ...prev,
      [name]: processedValue,
    }));

    // Clear field-specific error when modified
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // Quote calculation handler
  const refreshQuote = useCallback(async () => {
    const pickupAddress = String(formValues.pickupAddress || '').trim();
    const dropoffAddress = String(formValues.dropoffAddress || '').trim();

    if (!pickupAddress || !dropoffAddress) {
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

      const calculatedQuote = await bookingService.calculateQuote({
        pickupLocation: {
          address: pickupAddress,
          notes: formValues.pickupNotes ? String(formValues.pickupNotes) : undefined,
        },
        dropoffLocation: {
          address: dropoffAddress,
          notes: formValues.dropoffNotes ? String(formValues.dropoffNotes) : undefined,
        },
        vehicleTier: (formValues.vehicleTier as VehicleTier) || 'standard',
        bookingType: formValues.bookingType === 'scheduled' ? 'scheduled' : 'asap',
        scheduledPickupTime,
        passengerCount: Number(formValues.passengerCount) || 1,
        luggageCount: Number(formValues.luggageCount) || 0,
        promoCode: formValues.promoCode ? String(formValues.promoCode) : undefined,
      });

      setQuote(calculatedQuote);
    } catch (err: unknown) {
      console.warn('[BookingForm] Failed to calculate quote:', err);
      setQuoteError('Unable to generate route quote. Please check your addresses.');
    } finally {
      setIsQuoteLoading(false);
    }
  }, [
    formValues.pickupAddress,
    formValues.dropoffAddress,
    formValues.pickupNotes,
    formValues.dropoffNotes,
    formValues.vehicleTier,
    formValues.bookingType,
    formValues.scheduledDate,
    formValues.scheduledTime,
    formValues.passengerCount,
    formValues.luggageCount,
    formValues.promoCode,
  ]);

  // Recalculate quote on step navigation if addresses are present
  useEffect(() => {
    if (formValues.pickupAddress && formValues.dropoffAddress) {
      refreshQuote();
    }
  }, [currentStepIndex, formValues.vehicleTier, formValues.promoCode, refreshQuote]);

  // Validate fields for a given step
  const validateStep = (step: FormStepSchema): boolean => {
    const newErrors: Record<string, string> = {};

    for (const field of step.fields) {
      // If field is not currently visible, skip validation
      if (!isFieldVisible(field, formValues)) {
        continue;
      }

      const required = isFieldRequired(field, formValues);
      const val = formValues[field.name];

      // Required validation
      if (required) {
        if (val === undefined || val === null || val === '') {
          newErrors[field.name] = `${field.presentation.label || 'This field'} is required.`;
          continue;
        }
        if (field.type === 'checkbox' && val !== true) {
          newErrors[field.name] = 'You must accept the terms before proceeding.';
          continue;
        }
      }

      // Format validations
      if (val !== undefined && val !== null && val !== '') {
        const strVal = String(val);

        // Pattern validation
        if (field.validation?.pattern) {
          const regex = new RegExp(field.validation.pattern);
          if (!regex.test(strVal)) {
            newErrors[field.name] =
              field.validation.patternMessage || 'Invalid format.';
            continue;
          }
        }

        // Min length
        if (field.validation?.minLength && strVal.length < field.validation.minLength) {
          newErrors[field.name] = `Must be at least ${field.validation.minLength} characters.`;
          continue;
        }

        // Max length
        if (field.validation?.maxLength && strVal.length > field.validation.maxLength) {
          newErrors[field.name] = `Must not exceed ${field.validation.maxLength} characters.`;
          continue;
        }

        // Counter / number min
        if (field.validation?.min !== undefined && typeof val === 'number' && val < field.validation.min) {
          newErrors[field.name] = `Minimum value is ${field.validation.min}.`;
          continue;
        }

        // Counter / number max
        if (field.validation?.max !== undefined && typeof val === 'number' && val > field.validation.max) {
          newErrors[field.name] = `Maximum value is ${field.validation.max}.`;
          continue;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Next step navigation
  const handleNext = () => {
    if (!validateStep(currentStep)) {
      return;
    }

    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Previous step navigation
  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Final booking submission
  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateStep(currentStep)) {
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const bookingService = getBookingService();

      // Ensure quote is available
      let finalQuote = quote;
      if (!finalQuote) {
        let scheduledPickupTime: string | undefined;
        if (formValues.bookingType === 'scheduled' && formValues.scheduledDate) {
          const timePart = formValues.scheduledTime ? String(formValues.scheduledTime) : '12:00';
          scheduledPickupTime = new Date(`${formValues.scheduledDate}T${timePart}`).toISOString();
        }

        finalQuote = await bookingService.calculateQuote({
          pickupLocation: {
            address: String(formValues.pickupAddress),
            notes: formValues.pickupNotes ? String(formValues.pickupNotes) : undefined,
          },
          dropoffLocation: {
            address: String(formValues.dropoffAddress),
            notes: formValues.dropoffNotes ? String(formValues.dropoffNotes) : undefined,
          },
          vehicleTier: (formValues.vehicleTier as VehicleTier) || 'standard',
          bookingType: formValues.bookingType === 'scheduled' ? 'scheduled' : 'asap',
          scheduledPickupTime,
          passengerCount: Number(formValues.passengerCount) || 1,
          luggageCount: Number(formValues.luggageCount) || 0,
          promoCode: formValues.promoCode ? String(formValues.promoCode) : undefined,
        });
        setQuote(finalQuote);
      }

      let scheduledPickupTime: string | undefined;
      if (formValues.bookingType === 'scheduled' && formValues.scheduledDate) {
        const timePart = formValues.scheduledTime ? String(formValues.scheduledTime) : '12:00';
        scheduledPickupTime = new Date(`${formValues.scheduledDate}T${timePart}`).toISOString();
      }

      const matchedAirline = MAJOR_AIRLINES.find((a) => a.code === formValues.airlineCode);
      const airlineName = matchedAirline ? matchedAirline.name : formValues.airlineCode ? String(formValues.airlineCode) : undefined;

      const formattedDepartureAirport = formValues.departureAirport
        ? String(formValues.departureAirport).trim().toUpperCase()
        : undefined;

      // Construct structured flight remarks if airport details were provided
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

      const inputPayload: CreateTripInput = {
        pickupLocation: {
          address: String(formValues.pickupAddress),
          notes: formValues.pickupNotes ? String(formValues.pickupNotes) : undefined,
        },
        dropoffLocation: {
          address: String(formValues.dropoffAddress),
          notes: formValues.dropoffNotes ? String(formValues.dropoffNotes) : undefined,
        },
        bookingType: formValues.bookingType === 'scheduled' ? 'scheduled' : 'asap',
        scheduledPickupTime,
        passenger: {
          firstName: String(formValues.firstName),
          lastName: String(formValues.lastName),
          email: String(formValues.email),
          phone: String(formValues.phone),
          passengerCount: Number(formValues.passengerCount) || 1,
          luggageCount: Number(formValues.luggageCount) || 0,
          specialRequests: mergedSpecialRequests,
        },
        vehicleTier: (formValues.vehicleTier as VehicleTier) || 'standard',
        pricing: finalQuote.pricing,
        payment: {
          method: (formValues.paymentMethod as PaymentMethod) || 'card',
          status: 'pending',
          amount: finalQuote.pricing.totalFare,
        },
        metadata: {
          corporateAccountId: formValues.corporateAccountId ? String(formValues.corporateAccountId) : undefined,
          airlineCode: formValues.airlineCode ? String(formValues.airlineCode) : undefined,
          airlineName,
          flightNumber: formValues.flightNumber ? String(formValues.flightNumber) : undefined,
          departureAirport: formattedDepartureAirport,
          hasCheckedLuggage: Boolean(formValues.hasCheckedLuggage),
          isAirportTrip: airportDetection.isAirportTrip,
          isPickupAirport: airportDetection.isPickupAirport,
          isDropoffAirport: airportDetection.isDropoffAirport,
          detectedAirportIata: airportDetection.airport?.iataCode,
          detectedAirportName: airportDetection.airport?.name,
          flightRemarks,
          promoCode: formValues.promoCode ? String(formValues.promoCode) : undefined,
        },
      };

      const newTrip = await bookingService.createBooking(inputPayload);
      setConfirmedTrip(newTrip);
      onBookingSuccess?.(newTrip);

      // Trigger transactional Resend email dispatch (both passenger receipt and operations alert)
      setEmailDelivery({ status: 'sending', recipient: newTrip.passenger.email });

      try {
        const emailService = getEmailDispatchService();

        // 1. Passenger Confirmation Receipt
        const passengerReceiptPromise = emailService.sendBookingConfirmation({
          tripId: newTrip.id,
          passenger: {
            firstName: newTrip.passenger.firstName,
            lastName: newTrip.passenger.lastName,
            email: newTrip.passenger.email,
            phone: newTrip.passenger.phone,
          },
          pickupAddress: newTrip.pickupLocation.address,
          pickupNotes: newTrip.pickupLocation.notes,
          dropoffAddress: newTrip.dropoffLocation.address,
          dropoffNotes: newTrip.dropoffLocation.notes,
          pickupTime: newTrip.bookingType === 'scheduled' && newTrip.scheduledPickupTime
            ? new Date(newTrip.scheduledPickupTime).toLocaleString()
            : 'Immediate Ride (ASAP)',
          bookingType: newTrip.bookingType,
          vehicleTier: newTrip.vehicleTier,
          passengerCount: newTrip.passenger.passengerCount,
          luggageCount: newTrip.passenger.luggageCount,
          totalFare: newTrip.pricing.totalFare,
          currency: newTrip.pricing.currency,
          paymentMethod: newTrip.payment.method,
          specialRequests: newTrip.passenger.specialRequests,
          flightDetails: {
            airlineName,
            airlineCode: formValues.airlineCode ? String(formValues.airlineCode) : undefined,
            flightNumber: formValues.flightNumber ? String(formValues.flightNumber) : undefined,
            departureAirport: formattedDepartureAirport,
            hasCheckedLuggage: Boolean(formValues.hasCheckedLuggage),
            isAirportTrip: airportDetection.isAirportTrip,
          },
        });

        // 2. Immediate Dispatcher Alert
        const dispatcherAlertPromise = emailService.sendAdminDispatchAlert({
          tripId: newTrip.id,
          passengerName: `${newTrip.passenger.firstName} ${newTrip.passenger.lastName}`,
          passengerPhone: newTrip.passenger.phone,
          passengerEmail: newTrip.passenger.email,
          passengerCount: newTrip.passenger.passengerCount,
          luggageCount: newTrip.passenger.luggageCount,
          pickupAddress: newTrip.pickupLocation.address,
          pickupNotes: newTrip.pickupLocation.notes,
          dropoffAddress: newTrip.dropoffLocation.address,
          dropoffNotes: newTrip.dropoffLocation.notes,
          pickupTime: newTrip.bookingType === 'scheduled' && newTrip.scheduledPickupTime
            ? new Date(newTrip.scheduledPickupTime).toLocaleString()
            : 'Immediate (ASAP)',
          vehicleTier: newTrip.vehicleTier,
          totalFare: newTrip.pricing.totalFare,
          currency: newTrip.pricing.currency,
          bookingType: newTrip.bookingType,
          paymentMethod: newTrip.payment.method,
          specialRequests: newTrip.passenger.specialRequests,
          urgency: newTrip.bookingType === 'asap' ? 'high' : 'normal',
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
            recipient: newTrip.passenger.email,
            error: receiptResult.error,
          });
        }
      } catch (emailErr) {
        console.warn('[BookingForm] Transactional email dispatch exception:', emailErr);
        setEmailDelivery({
          status: 'failed',
          recipient: newTrip.passenger.email,
          error: emailErr instanceof Error ? emailErr.message : 'Email dispatch encountered a network error',
        });
      }
    } catch (err: unknown) {
      console.error('[BookingForm] Submission error:', err);
      setSubmitError(
        err instanceof Error ? err.message : 'An unexpected error occurred while booking your ride.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form to initial state
  const handleBookAnother = () => {
    setConfirmedTrip(null);
    setCurrentStepIndex(0);
    setQuote(null);
    setErrors({});
    setSubmitError(null);
    setEmailDelivery({ status: 'idle' });
  };

  // If trip is successfully booked, render confirmation screen
  if (confirmedTrip) {
    return (
      <BookingConfirmation
        trip={confirmedTrip}
        onBookAnother={handleBookAnother}
        emailDelivery={emailDelivery}
        className={className}
      />
    );
  }

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  return (
    <div className={`w-full max-w-4xl mx-auto ${className}`}>
      {/* Wizard Step Progress Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-2xl mx-auto px-2">
          {steps.map((step, idx) => {
            const isDone = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;

            return (
              <div key={step.id} className="flex flex-col items-center relative flex-1">
                {/* Connecting bar */}
                {idx > 0 && (
                  <div
                    className={`absolute top-4 -left-1/2 right-1/2 h-0.5 -translate-y-1/2 transition-colors ${
                      idx <= currentStepIndex ? 'bg-amber-500' : 'bg-slate-200'
                    }`}
                  />
                )}

                {/* Step Circle */}
                <div
                  className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isDone
                      ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-500'
                      : isCurrent
                      ? 'bg-slate-900 text-white ring-4 ring-amber-200'
                      : 'bg-white border-2 border-slate-300 text-slate-400'
                  }`}
                >
                  {isDone ? <CheckIcon className="w-4 h-4 stroke-[3]" /> : step.stepNumber}
                </div>

                {/* Step Title Label */}
                <span
                  className={`mt-2 text-[11px] font-semibold text-center hidden sm:block truncate max-w-[80px] ${
                    isCurrent ? 'text-slate-900 font-bold' : 'text-slate-400'
                  }`}
                >
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Form Step Card */}
        <div className={quote && currentStepIndex >= 2 ? 'lg:col-span-8' : 'lg:col-span-12'}>
          <Card variant="elevated" className="overflow-hidden shadow-sm border-slate-200">
            {/* Step Header */}
            <CardHeader className="bg-slate-50/70 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                  Step {currentStep.stepNumber} of {steps.length}
                </span>
                <span className="text-xs text-slate-400">
                  {Math.round(((currentStepIndex + 1) / steps.length) * 100)}% Completed
                </span>
              </div>
              <CardTitle className="text-xl sm:text-2xl mt-1 text-slate-900">
                {currentStep.title}
              </CardTitle>
              {currentStep.subtitle && (
                <CardDescription className="text-sm text-slate-600">
                  {currentStep.subtitle}
                </CardDescription>
              )}
            </CardHeader>

            <form onSubmit={isLastStep ? handleSubmitBooking : (e) => { e.preventDefault(); handleNext(); }}>
              <CardContent className="p-6 sm:p-8 space-y-6">
                {submitError && (
                  <Alert variant="error" title="Booking Submission Error">
                    {submitError}
                  </Alert>
                )}

                {quoteError && (
                  <Alert variant="warning" title="Quote Notice">
                    {quoteError}
                  </Alert>
                )}

                {/* Airport transfer auto-detected banner on Step 1 */}
                {currentStepIndex === 0 && airportDetection.isAirportTrip && airportDetection.airport && (
                  <AirportDetectedBanner
                    airport={airportDetection.airport}
                    isPickupAirport={airportDetection.isPickupAirport}
                    isDropoffAirport={airportDetection.isDropoffAirport}
                  />
                )}

                {/* Airport operations indicator on Step 4 */}
                {currentStepIndex === 3 && airportDetection.isAirportTrip && airportDetection.airport && (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                    <span>
                      Airport dispatch active for <strong>{airportDetection.airport.shortName}</strong>. Please specify flight details below so your driver can monitor arrivals.
                    </span>
                  </div>
                )}

                {/* Luggage capacity warning alert on Step 4 */}
                {currentStepIndex === 3 && isLuggageOverCapacity && (
                  <LuggageCapacityWarning
                    vehicleTier={currentVehicleTier}
                    luggageCount={currentLuggageCount}
                    maxLuggage={maxAllowedLuggage}
                    onUpgradeToXL={() => handleFieldChange('vehicleTier', 'xl')}
                  />
                )}

                {/* Config-driven fields rendered dynamically */}
                <div className="grid grid-cols-12 gap-4 sm:gap-6">
                  {currentStep.fields.map((field) => (
                    <FieldRenderer
                      key={field.id}
                      field={field}
                      value={formValues[field.name]}
                      onChange={(val) => handleFieldChange(field.name, val)}
                      error={errors[field.name]}
                      formValues={formValues}
                      disabled={isSubmitting}
                    />
                  ))}
                </div>
              </CardContent>

              {/* Navigation Footer */}
              <CardFooter className="bg-slate-50/50 p-6 flex items-center justify-between gap-4">
                <div>
                  {!isFirstStep && (
                    <Button
                      type="button"
                      variant="outline"
                      size="md"
                      onClick={handleBack}
                      disabled={isSubmitting}
                      leftIcon={<ChevronLeftIcon className="w-4 h-4" />}
                    >
                      Back
                    </Button>
                  )}
                </div>

                <div>
                  {isLastStep ? (
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      isLoading={isSubmitting}
                      className="px-8 shadow-md"
                    >
                      Confirm & Book Taxi
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      rightIcon={<ChevronRightIcon className="w-4 h-4" />}
                    >
                      Continue
                    </Button>
                  )}
                </div>
              </CardFooter>
            </form>
          </Card>
        </div>

        {/* Live Quote Sidebar (visible when quote is generated and step >= 2) */}
        {quote && currentStepIndex >= 2 && (
          <div className="lg:col-span-4 sticky top-6 space-y-4">
            <QuoteSummary quote={quote} isLoading={isQuoteLoading} />
          </div>
        )}
      </div>
    </div>
  );
}
