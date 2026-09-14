import React from 'react';
import type { Trip } from '../../core/types';
import {
  CheckIcon,
  MapPinIcon,
  FlagIcon,
  CalendarIcon,
  ClockIcon,
  CarIcon,
  UserIcon,
  MailIcon,
  CreditCardIcon,
  CashIcon,
  ShieldCheckIcon,
  PlaneLandingIcon,
} from '../ui/Icons';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { COMPANY_CONFIG } from '../../config/companyConfig';

export interface EmailDeliveryFeedback {
  status: 'idle' | 'sending' | 'sent' | 'simulated' | 'failed';
  recipient?: string;
  messageId?: string;
  error?: string;
}

export interface BookingConfirmationProps {
  trip: Trip;
  onBookAnother: () => void;
  emailDelivery?: EmailDeliveryFeedback;
  className?: string;
}

export function BookingConfirmation({
  trip,
  onBookAnother,
  emailDelivery,
  className = '',
}: BookingConfirmationProps) {
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const isScheduled = trip.bookingType === 'scheduled';
  const paymentMethodLabel = {
    card: 'Credit / Debit Card',
    cash: 'Pay in Vehicle (Cash/Card)',
    corporate: 'Corporate Billing Account',
  }[trip.payment.method];

  const isUnconfirmed = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';

  return (
    <Card variant="elevated" className={`max-w-2xl mx-auto overflow-hidden ${isUnconfirmed ? 'border-blue-200 shadow-lg' : 'border-emerald-200/70 shadow-lg'} ${className}`}>
      {/* Top Banner */}
      <div className={`${isUnconfirmed ? 'bg-slate-900 text-white' : 'bg-emerald-600 text-white'} px-6 py-8 text-center relative`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 shadow-md ${isUnconfirmed ? 'bg-blue-600 text-white font-bold text-2xl' : 'bg-white text-emerald-600'}`}>
          {isUnconfirmed ? <CheckIcon className="w-8 h-8 stroke-[3]" /> : <CheckIcon className="w-8 h-8 stroke-[3]" />}
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight">
          {isUnconfirmed ? 'Ride Request Received!' : 'Booking Confirmed!'}
        </h2>
        <p className={`${isUnconfirmed ? 'text-slate-300' : 'text-emerald-100'} text-sm mt-1 max-w-md mx-auto`}>
          {isUnconfirmed
            ? 'Your request has entered our dispatch queue. Our team will review and confirm your ride shortly.'
            : 'Your reservation has entered the Chesterfield dispatch system.'}
        </p>

        <div className={`mt-4 inline-flex items-center gap-2 ${isUnconfirmed ? 'bg-slate-800' : 'bg-emerald-700/60'} px-4 py-1.5 rounded-full text-xs font-mono`}>
          <span className={isUnconfirmed ? 'text-blue-300' : 'text-emerald-200'}>Trip Reference:</span>
          <span className="font-bold text-white tracking-wider">{trip.id}</span>
        </div>
      </div>

      <CardContent className="p-6 sm:p-8 space-y-6">
        {/* Reservation Status Pill */}
        <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Reservation Status
            </span>
            <span className="text-sm font-bold text-slate-900 uppercase flex items-center gap-1.5 mt-0.5">
              <span className={`w-2.5 h-2.5 rounded-full ${isUnconfirmed ? 'bg-blue-600 animate-pulse' : 'bg-emerald-500'}`} />
              Status: {isUnconfirmed ? 'Pending Review' : 'Confirmed'}
            </span>
          </div>
          <Badge variant={isUnconfirmed ? 'info' : 'success'} size="md">
            {isUnconfirmed ? 'Review Pending' : 'Confirmed'}
          </Badge>
        </div>

        {/* Route Details */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Trip Route
          </h4>

          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {/* Pickup */}
            <div className="relative">
              <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-white">
                <MapPinIcon className="w-2.5 h-2.5" />
              </div>
              <p className="text-xs font-semibold text-slate-500">Pickup Location</p>
              <p className="text-sm font-bold text-slate-900">{trip.pickupLocation.address}</p>
              {trip.pickupLocation.notes && (
                <p className="text-xs text-slate-500 mt-0.5">Note: {trip.pickupLocation.notes}</p>
              )}
            </div>

            {/* Intermediate Stops */}
            {trip.intermediateStops && trip.intermediateStops.length > 0 && trip.intermediateStops.map((stop, idx) => (
              <div key={idx} className="relative">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-slate-500 flex items-center justify-center text-white">
                  <span className="text-[9px] font-bold">{idx + 1}</span>
                </div>
                <p className="text-xs font-semibold text-slate-500">Intermediate Stop {trip.intermediateStops && trip.intermediateStops.length > 1 ? idx + 1 : ''}</p>
                <p className="text-sm font-bold text-slate-900">{stop.address}</p>
                {stop.notes && (
                  <p className="text-xs text-slate-500 mt-0.5">Note: {stop.notes}</p>
                )}
              </div>
            ))}

            {/* Dropoff */}
            <div className="relative">
              <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-white">
                <FlagIcon className="w-2.5 h-2.5" />
              </div>
              <p className="text-xs font-semibold text-slate-500">Dropoff Destination</p>
              <p className="text-sm font-bold text-slate-900">{trip.dropoffLocation.address}</p>
              {trip.dropoffLocation.notes && (
                <p className="text-xs text-slate-500 mt-0.5">Note: {trip.dropoffLocation.notes}</p>
              )}
            </div>
          </div>
        </div>

        {/* Schedule & Vehicle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-600">
              <ClockIcon className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500 block">Pickup Timing</span>
              <span className="text-sm font-bold text-slate-900">
                {isScheduled && trip.scheduledPickupTime
                  ? new Date(trip.scheduledPickupTime).toLocaleString()
                  : 'Immediate Ride (ASAP)'}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-600">
              <CarIcon className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500 block">Vehicle Tier</span>
              <span className="text-sm font-bold text-slate-900 capitalize">
                {trip.vehicleTier} Sedan / SUV
              </span>
            </div>
          </div>
        </div>

        {/* Passenger & Fare Receipt */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-600">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500 block">Passenger</span>
              <span className="text-sm font-bold text-slate-900">
                {trip.passenger.firstName} {trip.passenger.lastName}
              </span>
              <span className="text-xs text-slate-500 block mt-0.5">
                {trip.passenger.phone} • {trip.passenger.passengerCount} passenger(s)
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-600">
              {trip.payment.method === 'cash' ? (
                <CashIcon className="w-4 h-4" />
              ) : (
                <CreditCardIcon className="w-4 h-4" />
              )}
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500 block">Payment Method & Total</span>
              <span className="text-base font-extrabold text-slate-950">
                ${trip.pricing.totalFare.toFixed(2)}
              </span>
              <span className="text-xs text-slate-500 block mt-0.5">
                {paymentMethodLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Airport Flight Operations Block (if applicable) */}
        {Boolean(trip.metadata?.isAirportTrip || trip.metadata?.flightNumber) ? (
          <div className="pt-4 border-t border-slate-100">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <PlaneLandingIcon className="w-4 h-4 text-blue-600" />
                  Flight & Airport Details
                </span>
                {trip.metadata?.detectedAirportIata ? (
                  <Badge variant="info" size="sm">
                    {String(trip.metadata.detectedAirportIata)}
                  </Badge>
                ) : null}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div>
                  <span className="text-slate-500 block font-medium">Airline</span>
                  <span className="font-bold text-slate-800">
                    {String(trip.metadata?.airlineName || trip.metadata?.airlineCode || 'N/A')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Flight Number</span>
                  <span className="font-bold text-slate-800">
                    {String(trip.metadata?.flightNumber || 'N/A')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Origin</span>
                  <span className="font-bold text-slate-800 truncate block">
                    {trip.metadata?.departureAirport ? String(trip.metadata.departureAirport).toUpperCase() : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Checked Bags</span>
                  <span className="font-bold text-slate-800">
                    {trip.metadata?.hasCheckedLuggage ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Special Requests / Driver Notes */}
        {trip.passenger.specialRequests && (
          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Driver Dispatch Notes
            </h4>
            <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 whitespace-pre-line">
              {trip.passenger.specialRequests}
            </p>
          </div>
        )}

        {/* Confirmation Email Delivery Notice */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 flex items-start gap-3 text-xs text-slate-600">
          <div className="mt-0.5 shrink-0">
            {emailDelivery?.status === 'sending' ? (
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : emailDelivery?.status === 'failed' ? (
              <div className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-[10px]">
                !
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
                ✓
              </div>
            )}
          </div>
          <div className="leading-relaxed flex-1">
            {emailDelivery?.status === 'sending' ? (
              <p className="text-slate-700 font-medium">
                Sending confirmation summary to <strong className="text-slate-900">{trip.passenger.email}</strong>...
              </p>
            ) : emailDelivery?.status === 'failed' ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-amber-800">
                    Booking Request Registered
                  </p>
                </div>
                <p className="text-slate-600 mt-1">
                  Your ride request is active in our dispatch queue. Confirmation email delivery to{' '}
                  <strong className="text-slate-800">{emailDelivery?.recipient || trip.passenger.email}</strong> is pending configuration ({emailDelivery?.error || 'Email service offline'}).
                </p>
                <p className="text-slate-500 mt-1">
                  Our dispatchers can view your ride in real-time.
                </p>
              </>
            ) : emailDelivery?.status === 'simulated' ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-blue-800">
                    ✓ Request Queued in Dispatch
                  </p>
                </div>
                <p className="text-slate-600 mt-1">
                  Your reservation is saved and visible on the dispatch console. (Demo mode: live email delivery requires <code className="bg-slate-200/60 px-1 py-0.5 rounded text-[10px]">RESEND_API_KEY</code>).
                </p>
                <p className="text-slate-500 mt-1">
                  You will receive updates directly as your driver is dispatched.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-emerald-800">
                    ✓ Booking Confirmation Dispatched
                  </p>
                </div>
                <p className="text-slate-600 mt-1">
                  A full trip itinerary and receipt summary have been sent to{' '}
                  <strong className="text-slate-800">{emailDelivery?.recipient || trip.passenger.email}</strong>.
                </p>
                <p className="text-slate-500 mt-1">
                  You will also receive updates as your driver is dispatched.
                </p>
              </>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="bg-slate-50/70 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-xs text-slate-500 text-center sm:text-left">
          Questions about your ride? Call 24/7 Dispatch at {COMPANY_CONFIG.phone.dispatch}.
        </span>
        <Button onClick={onBookAnother} variant="primary" size="md">
          Book Another Ride
        </Button>
      </CardFooter>
    </Card>
  );
}
