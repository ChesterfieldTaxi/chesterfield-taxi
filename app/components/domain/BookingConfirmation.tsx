import React from 'react';
import { Link } from 'react-router';
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
import { getAdminConfigService } from '../../core/services/config/admin-config.service';
import { formatVehicleTier } from '../../core/utils/trip-id.util';

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

  const [companyConfig, setCompanyConfig] = React.useState(() => {
    return getAdminConfigService().getCachedSettings().company;
  });
  const [bookingConfig, setBookingConfig] = React.useState(() => {
    return getAdminConfigService().getCachedSettings().customerBookingConfig;
  });

  React.useEffect(() => {
    const configService = getAdminConfigService();
    const unsubscribe = configService.subscribeToSettings((s) => {
      if (s.company) setCompanyConfig(s.company);
      if (s.customerBookingConfig) setBookingConfig(s.customerBookingConfig);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const isScheduled = trip.bookingType === 'scheduled';
  const paymentMethodLabel = {
    card: 'Credit / Debit Card',
    cash: 'Pay in Vehicle (Cash/Card)',
    corporate: 'Corporate Billing Account',
    account: 'Corporate Billing Account',
  }[trip.payment.method];

  const isUnconfirmed = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';

  const pickupLower = (trip.pickupLocation.address || '').toLowerCase();
  const isPickupLambert =
    pickupLower.includes('lambert') ||
    pickupLower.includes('stl airport') ||
    pickupLower.includes('10701 lambert') ||
    pickupLower.includes('st. louis lambert') ||
    pickupLower.includes('st louis lambert') ||
    trip.metadata?.detectedAirportIata === 'STL';

  const lambertInstructions =
    bookingConfig?.lambertPickupInstructions ||
    'Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2. Chauffeur tracks flight arrival in real-time.';

  return (
    <Card variant="elevated" className={`max-w-2xl mx-auto overflow-hidden ${isUnconfirmed ? 'border-amber-200 shadow-lg' : 'border-blue-200/80 shadow-lg'} ${className}`}>
      {/* Top Banner */}
      <div className={`${isUnconfirmed ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white' : 'bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white'} px-6 py-8 text-center relative`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 shadow-md ${isUnconfirmed ? 'bg-amber-100 text-amber-600' : 'bg-white text-blue-600'}`}>
          {isUnconfirmed ? <ClockIcon className="w-8 h-8 stroke-[3]" /> : <CheckIcon className="w-8 h-8 stroke-[3]" />}
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight">
          {isUnconfirmed ? 'Ride Request Received' : 'Reservation Confirmed!'}
        </h2>
        <p className={`${isUnconfirmed ? 'text-amber-50' : 'text-blue-100'} text-sm mt-1 max-w-md mx-auto`}>
          {isUnconfirmed
            ? 'Your request is under review by our dispatch team. We will notify you shortly via SMS/Email.'
            : `Your reservation has entered the ${companyConfig?.name || COMPANY_CONFIG.name} 24/7 dispatch system.`}
        </p>

        <div className={`mt-4 inline-flex items-center gap-2 ${isUnconfirmed ? 'bg-amber-600' : 'bg-blue-800/70 border border-blue-400/30'} px-4 py-1.5 rounded-full text-xs font-mono`}>
          <span className={isUnconfirmed ? 'text-amber-100' : 'text-blue-200'}>Trip Reference:</span>
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
              <span className={`w-2.5 h-2.5 rounded-full ${isUnconfirmed ? 'bg-amber-500 animate-pulse' : 'bg-blue-600'}`} />
              Status: {isUnconfirmed ? 'Pending Review' : 'Confirmed'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
            {isUnconfirmed && (
              <button type="button" className="text-[10px] font-semibold text-slate-600 bg-white border border-slate-300 px-2 py-1 rounded hover:bg-slate-50 flex items-center gap-1">
                Modify
              </button>
            )}
            {isUnconfirmed && (
              <button type="button" className="text-[10px] font-semibold text-red-600 hover:text-red-800 underline bg-white border border-red-200 px-2 py-1 rounded hover:bg-red-50 flex items-center gap-1">
                Cancel Request
              </button>
            )}
            {!isUnconfirmed && isScheduled && (
              <button type="button" className="text-[10px] font-semibold text-slate-600 bg-white border border-slate-300 px-2 py-1 rounded hover:bg-slate-50 flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" /> Add to Calendar
              </button>
            )}
            <Badge variant={isUnconfirmed ? 'warning' : 'info'} size="md">
              {isUnconfirmed ? 'Review Pending' : 'Confirmed'}
            </Badge>
          </div>
        </div>

        {/* Email Delivery Feedback Notification */}
        {emailDelivery && emailDelivery.status !== 'idle' && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
              emailDelivery.status === 'sent'
                ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                : emailDelivery.status === 'failed'
                ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                : emailDelivery.status === 'simulated'
                ? 'bg-blue-50/90 border-blue-200 text-blue-950'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {emailDelivery.status === 'sent' ? (
                <CheckIcon className="w-4 h-4 text-emerald-600" />
              ) : emailDelivery.status === 'failed' ? (
                <ClockIcon className="w-4 h-4 text-amber-600" />
              ) : (
                <MailIcon className="w-4 h-4 text-blue-600" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="font-bold flex items-center justify-between">
                <span>
                  {emailDelivery.status === 'sent' && 'Confirmation Email Dispatched'}
                  {emailDelivery.status === 'failed' && 'Email Confirmation Delivery Notice'}
                  {emailDelivery.status === 'simulated' && 'Simulated Email (Test Mode)'}
                  {emailDelivery.status === 'sending' && 'Sending Confirmation Email...'}
                </span>
                {emailDelivery.messageId && (
                  <span className="font-mono text-[10px] text-slate-500 font-normal">
                    ID: {emailDelivery.messageId}
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">
                {emailDelivery.status === 'sent' && (
                  <>An itemized confirmation and driver tracking receipt was delivered to <strong className="font-semibold">{emailDelivery.recipient || trip.passenger.email}</strong>.</>
                )}
                {emailDelivery.status === 'failed' && (
                  <>
                    Your reservation has been saved in our dispatch system, but the email notification to <strong className="font-semibold">{emailDelivery.recipient || trip.passenger.email}</strong> could not be delivered by Resend.
                    {emailDelivery.error && (
                      <span className="block mt-1.5 p-2 bg-amber-100/70 rounded border border-amber-300/60 font-mono text-[10px] text-amber-950 break-words">
                        {emailDelivery.error}
                      </span>
                    )}
                  </>
                )}
                {emailDelivery.status === 'simulated' && (
                  <>A simulated confirmation was logged for <strong className="font-semibold">{emailDelivery.recipient || trip.passenger.email}</strong> (development test mode).</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Lambert Airport Curbside Instructions Callout */}
        {isPickupLambert && (
          <div className="bg-blue-50/90 border border-blue-200 rounded-xl p-4 flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <PlaneLandingIcon className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 mb-1 flex items-center gap-1.5">
                ✈ STL Lambert Curbside Pickup Instructions
              </h4>
              <p className="text-xs text-blue-950 leading-relaxed font-medium">
                {lambertInstructions}
              </p>
            </div>
          </div>
        )}

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
              <span className="text-xs font-medium text-slate-500 block">Vehicle Preference</span>
              <span className="text-sm font-bold text-slate-900">
                {formatVehicleTier(trip.vehicleTier)}
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
      </CardContent>

      <CardFooter className="bg-slate-50/70 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-xs text-slate-500 text-center sm:text-left">
          Questions about your ride? Call 24/7 Dispatch at{' '}
          <a
            href={`tel:${(companyConfig?.phone || COMPANY_CONFIG.phone.dispatch).replace(/\D/g, '')}`}
            className="font-bold text-blue-600 hover:text-blue-800 underline"
          >
            {companyConfig?.phone || COMPANY_CONFIG.phone.dispatch}
          </a>
          {companyConfig?.address ? (
            <span className="block sm:inline sm:before:content-['•'] sm:before:mx-1.5 text-slate-400">
              {companyConfig.address}
            </span>
          ) : null}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {!isUnconfirmed && trip.id && (
             trip.status === 'en_route' ? (
                <Link
                  to={`/track/${trip.id}`}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors relative overflow-hidden group"
                >
                  <span className="absolute inset-0 w-full h-full bg-blue-400 opacity-20 animate-pulse"></span>
                  Track Live Ride
                </Link>
             ) : (
                <Link
                  to={`/track/${trip.id}`}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                >
                  View Ride Details
                </Link>
             )
          )}
          <Button onClick={onBookAnother} variant="primary" size="md">
            Book Another Ride
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
