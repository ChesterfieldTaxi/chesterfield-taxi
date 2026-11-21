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
  LuggageIcon,
  CopyIcon,
  FileTextIcon,
  SparklesIcon,
  PlaneIcon,
  RepeatIcon,
} from '../ui/Icons';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import { getAdminConfigService } from '../../core/services/config/admin-config.service';
import { getAdminAuthService } from '../../core/services/auth/admin-auth.service';
import type { VehicleTierConfig } from '../../core/types/config';
import { formatVehicleTierDisplay } from '../../core/services/email/email-templates';
import { PriceBreakdownPanel } from './booking/PriceBreakdownPanel';

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
    if (trip?.id && trip?.passenger?.phone) {
      try {
        sessionStorage.setItem(`ct_verified_phone_${trip.id}`, trip.passenger.phone);
        sessionStorage.setItem(`ct_verified_phone_${trip.id.toUpperCase()}`, trip.passenger.phone);
      } catch {}
    }
  }, [trip?.id, trip?.passenger?.phone]);

  const [companyConfig, setCompanyConfig] = React.useState(() => {
    return getAdminConfigService().getCachedSettings().company;
  });
  const [bookingConfig, setBookingConfig] = React.useState(() => {
    return getAdminConfigService().getCachedSettings().customerBookingConfig;
  });
  const [adminVehicles, setAdminVehicles] = React.useState<VehicleTierConfig[]>(() => {
    return getAdminConfigService().getCachedSettings().vehicles || [];
  });

  React.useEffect(() => {
    const configService = getAdminConfigService();
    const unsubscribe = configService.subscribeToSettings((s) => {
      if (s.company) setCompanyConfig(s.company);
      if (s.customerBookingConfig) setBookingConfig(s.customerBookingConfig);
      if (s.vehicles) setAdminVehicles(s.vehicles);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const isScheduled = trip.bookingType === 'scheduled';
  const paymentMethodLabel = {
    card: 'Credit / Debit Card',
    cash: 'Pay in Car (Cash or Card)',
    corporate: 'Corporate Account',
    account: 'Corporate Account',
  }[trip.payment.method];

  const isUnconfirmed = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';
  const meta = (trip.metadata || {}) as Record<string, any>;

  const pickupLower = (trip.pickupLocation.address || '').toLowerCase();
  const isPickupLambert =
    pickupLower.includes('lambert') ||
    pickupLower.includes('stl airport') ||
    pickupLower.includes('10701 lambert') ||
    pickupLower.includes('st. louis lambert') ||
    pickupLower.includes('st louis lambert') ||
    meta.airportIataCode === 'STL' ||
    meta.detectedAirportIata === 'STL';

  const resolvedVehicleDisplayName =
    (typeof meta.vehicleDisplayName === 'string' && meta.vehicleDisplayName.trim()) ||
    formatVehicleTierDisplay(trip.vehicleTier, adminVehicles);

  const trackPath = `/track/${encodeURIComponent(trip.trackingToken || trip.id)}`;

  const lambertInstructions =
    bookingConfig?.lambertPickupInstructions ||
    'Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2. Your driver tracks flight arrivals in real time.';

  const [copiedId, setCopiedId] = React.useState(false);
  const [isSignedIn, setIsSignedIn] = React.useState(() =>
    Boolean(getAdminAuthService().getCurrentUser())
  );

  React.useEffect(() => {
    const unsub = getAdminAuthService().onAuthStateChanged((u) => {
      setIsSignedIn(Boolean(u));
    });
    return unsub;
  }, []);

  const hasReturnTrip = Boolean(meta.hasReturnTrip);
  const returnLegFare = hasReturnTrip ? Number(meta.returnFare || 0) : 0;
  const combinedTotalFare = hasReturnTrip
    ? trip.pricing.totalFare + returnLegFare
    : trip.pricing.totalFare;

  const handleCopyId = () => {
    navigator.clipboard?.writeText(trip.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleDownloadCalendar = () => {
    try {
      const pickupTime = trip.bookingType === 'scheduled' && trip.scheduledPickupTime
        ? new Date(trip.scheduledPickupTime)
        : new Date(Date.now() + 15 * 60 * 1000);
      const endTime = new Date(pickupTime.getTime() + (trip.pricing.durationMinutes || 30) * 60 * 1000);

      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const formatIcsDate = (d: Date) =>
        `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

      const summary = `Chesterfield Taxi - Ride #${trip.id}`;
      const description = `Pickup: ${trip.pickupLocation.address}\\nDropoff: ${trip.dropoffLocation.address}\\nTotal Fare: $${trip.pricing.totalFare.toFixed(2)}\\nDispatch Support: ${companyConfig?.phone || COMPANY_CONFIG.phone.dispatch}`;
      const locationStr = trip.pickupLocation.address.replace(/,/g, '\\,');

      const events: string[] = [
        'BEGIN:VEVENT',
        `UID:${trip.id}@chesterfieldtaxi.com`,
        `DTSTAMP:${formatIcsDate(new Date())}`,
        `DTSTART:${formatIcsDate(pickupTime)}`,
        `DTEND:${formatIcsDate(endTime)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        `LOCATION:${locationStr}`,
        'STATUS:CONFIRMED',
        'END:VEVENT',
      ];

      if (hasReturnTrip && meta.returnDate) {
        const retStart = new Date(`${meta.returnDate}T${meta.returnTime || '12:00'}:00`);
        if (!Number.isNaN(retStart.getTime())) {
          const retEnd = new Date(retStart.getTime() + (trip.pricing.durationMinutes || 30) * 60 * 1000);
          events.push(
            'BEGIN:VEVENT',
            `UID:${meta.returnTripId || trip.id + '-return'}@chesterfieldtaxi.com`,
            `DTSTAMP:${formatIcsDate(new Date())}`,
            `DTSTART:${formatIcsDate(retStart)}`,
            `DTEND:${formatIcsDate(retEnd)}`,
            `SUMMARY:Chesterfield Taxi - Return Ride #${meta.returnTripId || trip.id}`,
            `DESCRIPTION:Return Pickup: ${meta.returnPickupAddress || ''}\\nReturn Dropoff: ${meta.returnDropoffAddress || ''}\\nReturn Fare: $${returnLegFare.toFixed(2)}`,
            `LOCATION:${String(meta.returnPickupAddress || '').replace(/,/g, '\\,')}`,
            'STATUS:CONFIRMED',
            'END:VEVENT'
          );
        }
      }

      const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Chesterfield Taxi//EN',
        ...events,
        'END:VCALENDAR',
      ].join('\r\n');

      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `chesterfield-taxi-${trip.id}.ics`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Failed to download calendar .ics:', e);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Card variant="elevated" className={`printable-receipt max-w-2xl mx-auto overflow-hidden ${isUnconfirmed ? 'border-amber-200 shadow-lg' : 'border-blue-200/80 shadow-lg'} ${className}`}>
      {/* Top Banner */}
      <div className={`${isUnconfirmed ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white' : 'bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white'} px-6 py-8 text-center relative`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 shadow-md ${isUnconfirmed ? 'bg-amber-100 text-amber-600' : 'bg-white text-blue-600'}`}>
          {isUnconfirmed ? <ClockIcon className="w-8 h-8 stroke-[3]" /> : <CheckIcon className="w-8 h-8 stroke-[3]" />}
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight">
          {isUnconfirmed ? 'Ride Request Received' : 'Trip Confirmed!'}
        </h2>
        <p className={`${isUnconfirmed ? 'text-amber-50' : 'text-blue-100'} text-sm mt-1 max-w-md mx-auto`}>
          {isUnconfirmed
            ? 'Your request is being reviewed by our dispatch team. We will notify you shortly via text and email.'
            : `Your ride is booked with ${companyConfig?.name || COMPANY_CONFIG.name} 24/7 dispatch.`}
        </p>

        <div className={`mt-4 inline-flex items-center gap-2 ${isUnconfirmed ? 'bg-amber-700/80' : 'bg-blue-800/80 border border-blue-400/30'} px-3.5 py-1.5 rounded-full text-xs font-mono shadow-xs`}>
          <span className={isUnconfirmed ? 'text-amber-200' : 'text-blue-200'}>Trip #:</span>
          <span className="font-bold text-white tracking-wider">{trip.id}</span>
          <button
            type="button"
            onClick={handleCopyId}
            className="ml-1 px-1.5 py-0.5 hover:bg-white/20 rounded text-[11px] font-sans font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer"
            title="Copy Trip #"
          >
            {copiedId ? (
              <>
                <CheckIcon className="w-3 h-3" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <CopyIcon className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      <CardContent className="p-6 sm:p-8 space-y-6">
        {/* Quick Action Bar (Print, Calendar, Copy) */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status:</span>
            <Badge variant={isUnconfirmed ? 'warning' : 'info'} size="sm">
              {isUnconfirmed ? 'Review Pending' : 'Confirmed'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCalendar}
              className="text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>Add to Calendar</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <FileTextIcon className="w-3.5 h-3.5 text-slate-500" />
              <span>Print Receipt</span>
            </button>
          </div>
        </div>

        {/* "What Happens Next?" 3-Step Lifecycle Timeline */}
        <div className="p-4 bg-gradient-to-br from-blue-50/70 via-slate-50 to-indigo-50/50 rounded-xl border border-blue-100 space-y-3">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <SparklesIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>What Happens Next?</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white/80 backdrop-blur p-3 rounded-lg border border-slate-200/80 space-y-1">
              <div className="flex items-center gap-1.5 text-blue-700 font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-extrabold">1</span>
                <span>Dispatch Review</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-tight">
                Our 24/7 team reviews your route and assigns a driver.
              </p>
            </div>
            <div className="bg-white/80 backdrop-blur p-3 rounded-lg border border-slate-200/80 space-y-1">
              <div className="flex items-center gap-1.5 text-blue-700 font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-extrabold">2</span>
                <span>Driver Assigned</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-tight">
                You get a text alert with your driver&apos;s name and car details.
              </p>
            </div>
            <div className="bg-white/80 backdrop-blur p-3 rounded-lg border border-slate-200/80 space-y-1">
              <div className="flex items-center gap-1.5 text-blue-700 font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-extrabold">3</span>
                <span>Live Ride Tracking</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-tight">
                Live driver tracking starts 30 minutes before pickup.
              </p>
            </div>
          </div>
        </div>

        {/* Email Delivery Feedback Notification */}
        {emailDelivery && (
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs ${
              emailDelivery.status === 'sent'
                ? isUnconfirmed
                  ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                  : 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                : emailDelivery.status === 'failed'
                ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                : emailDelivery.status === 'simulated'
                ? 'bg-blue-50/90 border-blue-200 text-blue-950'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {emailDelivery.status === 'sent' ? (
                isUnconfirmed ? (
                  <ClockIcon className="w-4 h-4 text-amber-600" />
                ) : (
                  <CheckIcon className="w-4 h-4 text-emerald-600" />
                )
              ) : emailDelivery.status === 'failed' ? (
                <ClockIcon className="w-4 h-4 text-amber-600" />
              ) : (
                <MailIcon className="w-4 h-4 text-blue-600" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="font-bold flex items-center justify-between">
                <span>
                  {emailDelivery.status === 'sent' && (
                    isUnconfirmed ? 'Request Summary Sent' : 'Confirmation Email Sent'
                  )}
                  {emailDelivery.status === 'failed' && 'Email Notification Notice'}
                  {emailDelivery.status === 'simulated' && 'Simulated Email (Test Mode)'}
                  {emailDelivery.status === 'sending' && (
                    isUnconfirmed ? 'Sending Request Summary...' : 'Sending Confirmation Email...'
                  )}
                </span>
                {emailDelivery.messageId && (
                  <span className="font-mono text-[10px] text-slate-500 font-normal">
                    ID: {emailDelivery.messageId}
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">
                {emailDelivery.status === 'sent' && (
                  isUnconfirmed ? (
                    <>A summary of your ride request was sent to <strong className="font-semibold">{emailDelivery.recipient || trip.passenger.email}</strong>. Our dispatch team is reviewing your request and will confirm shortly.</>
                  ) : (
                    <>Your trip confirmation and live tracking link were sent to <strong className="font-semibold">{emailDelivery.recipient || trip.passenger.email}</strong>.</>
                  )
                )}
                {emailDelivery.status === 'failed' && (
                  <>
                    Your trip is saved with dispatch, though we could not confirm email delivery to <strong className="font-semibold">{emailDelivery.recipient || trip.passenger.email}</strong>. Please save your Trip # above or call 24/7 dispatch if you need a copy.
                  </>
                )}
                {emailDelivery.status === 'simulated' && (
                  <>A simulated notification was logged for <strong className="font-semibold">{emailDelivery.recipient || trip.passenger.email}</strong> (development test mode).</>
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
                <PlaneIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>STL Lambert Curbside Pickup Instructions</span>
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
              <span className="text-xs font-medium text-slate-500 block">Vehicle</span>
              <span className="text-sm font-bold text-slate-900">
                {resolvedVehicleDisplayName}
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
              <span className="text-xs font-medium text-slate-500 block">
                {hasReturnTrip ? 'Estimated Round-Trip Total' : 'Estimated Fare & Payment'}
              </span>
              <span className="text-base font-extrabold text-slate-950">
                ${combinedTotalFare.toFixed(2)}
              </span>
              <span className="text-xs text-slate-500 block mt-0.5">
                {paymentMethodLabel}
                {hasReturnTrip ? ` ($${trip.pricing.totalFare.toFixed(2)} out + $${returnLegFare.toFixed(2)} return)` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Canonical Itemized Fare Breakdown */}
        {trip.pricing && (
          <div className="pt-4 border-t border-slate-100">
            <PriceBreakdownPanel
              outboundPricing={trip.pricing}
              outboundDisplayFare={trip.pricing.totalFare}
              returnDisplayFare={hasReturnTrip ? returnLegFare : null}
              totalDisplayFare={hasReturnTrip ? trip.pricing.totalFare + returnLegFare : trip.pricing.totalFare}
              isRoundTrip={hasReturnTrip}
              vehicleLabel={resolvedVehicleDisplayName}
            />
          </div>
        )}

        {/* Child Safety Seats & Custom Extras Summary */}
        {Boolean(
          meta.carSeatsBreakdown?.total > 0 ||
            meta.carSeatsCount > 0 ||
            meta.customExtrasSummary
        ) && (
          <div className="pt-4 border-t border-slate-100">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 block">
                Selected Equipment &amp; Extras
              </span>
              {Boolean(meta.carSeatsBreakdown?.total > 0 || meta.carSeatsCount > 0) && (
                <p className="text-slate-700">
                  <strong>Child Safety Seats:</strong>{' '}
                  {[
                    meta.carSeatsBreakdown?.rearFacing ? `${meta.carSeatsBreakdown.rearFacing} Rear-Facing` : null,
                    meta.carSeatsBreakdown?.frontFacing ? `${meta.carSeatsBreakdown.frontFacing} Front-Facing` : null,
                    meta.carSeatsBreakdown?.booster ? `${meta.carSeatsBreakdown.booster} Booster` : null,
                  ]
                    .filter(Boolean)
                    .join(', ') || `${meta.carSeatsCount} seat(s)`}
                </p>
              )}
              {Boolean(meta.customExtrasSummary) && (
                <p className="text-slate-700">
                  <strong>Booked Extras:</strong> {String(meta.customExtrasSummary)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Airport & Private Aviation Block (if applicable) */}
        {Boolean(
          trip.metadata?.isAirportTrip ||
            trip.metadata?.flightNumber ||
            trip.metadata?.isPrivateAviation ||
            trip.metadata?.tailNumber ||
            trip.metadata?.fboFacility
        ) ? (
          <div className="pt-4 border-t border-slate-100">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <PlaneLandingIcon className="w-4 h-4 text-blue-600" />
                  {trip.metadata?.isPrivateAviation || trip.metadata?.tailNumber
                    ? 'Private Aviation (FBO / Tail #)'
                    : 'Flight & Airport Details'}
                </span>
                {(trip.metadata?.airportIataCode || trip.metadata?.detectedAirportIata) ? (
                  <Badge variant="info" size="sm">
                    {String(trip.metadata.airportIataCode || trip.metadata.detectedAirportIata)}
                  </Badge>
                ) : null}
              </div>

              {trip.metadata?.isPrivateAviation || trip.metadata?.tailNumber || trip.metadata?.fboFacility ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                  <div>
                    <span className="text-slate-500 block font-medium">Tail Number</span>
                    <span className="font-bold text-slate-800">{String(trip.metadata?.tailNumber || 'N/A')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block font-medium">FBO Facility</span>
                    <span className="font-bold text-slate-800">{String(trip.metadata?.fboFacility || 'N/A')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block font-medium">Checked Bags</span>
                    <span className="font-bold text-slate-800">{trip.metadata?.hasCheckedLuggage ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  <div>
                    <span className="text-slate-500 block font-medium">Airline</span>
                    <span className="font-bold text-slate-800">
                      {String(trip.metadata?.airlineName || trip.metadata?.airline || trip.metadata?.airlineCode || 'N/A')}
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
                      {trip.metadata?.flightOrigin || trip.metadata?.departureAirport
                        ? String(trip.metadata.flightOrigin || trip.metadata.departureAirport).toUpperCase()
                        : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block font-medium">Checked Bags</span>
                    <span className="font-bold text-slate-800">
                      {trip.metadata?.hasCheckedLuggage ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Linked Return Leg Summary (if booked as round trip) */}
        {Boolean(meta.hasReturnTrip) && (
          <div className="pt-4 border-t border-slate-100">
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                  <RepeatIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>Return Trip Scheduled</span>
                  {Boolean(meta.returnTripId) && (
                    <Link
                      to={`/track/${encodeURIComponent(String(meta.returnTripTrackingToken || meta.returnTripId))}`}
                      className="font-mono text-[10px] text-indigo-700 hover:underline font-bold"
                    >
                      (Track #{String(meta.returnTripId)} &rarr;)
                    </Link>
                  )}
                </span>
                <Badge variant="info" size="sm">
                  Round Trip Guaranteed
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 block font-medium">Return Pickup</span>
                  <span className="font-bold text-slate-800 block truncate">
                    {String(meta.returnPickupAddress || 'N/A')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Return Dropoff</span>
                  <span className="font-bold text-slate-800 block truncate">
                    {String(meta.returnDropoffAddress || 'N/A')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Date & Time</span>
                  <span className="font-bold text-slate-800">
                    {meta.returnDate ? `${meta.returnDate} at ${meta.returnTime || 'TBD'}` : 'Scheduled Return'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Return Fare</span>
                  <span className="font-bold text-slate-800">
                    ${Number(meta.returnFare || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {Boolean(meta.returnFlightNumber || meta.returnAirline || meta.returnTailNumber || meta.returnFboFacility) && (
                <div className="pt-2 border-t border-indigo-200/60 bg-white/80 p-2.5 rounded-lg text-xs space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1">
                    <PlaneLandingIcon className="w-3.5 h-3.5 text-indigo-600" />
                    {meta.returnTailNumber || meta.returnFboFacility ? 'Return Private Aviation' : 'Return Flight Information'}
                  </span>
                  {meta.returnTailNumber || meta.returnFboFacility ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500 block font-medium">Tail #</span>
                        <span className="font-bold text-slate-800">{String(meta.returnTailNumber || 'N/A')}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block font-medium">FBO Facility</span>
                        <span className="font-bold text-slate-800">{String(meta.returnFboFacility || 'N/A')}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block font-medium">Checked Bags</span>
                        <span className="font-bold text-slate-800">{meta.returnHasCheckedLuggage ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500 block font-medium">Airline</span>
                        <span className="font-bold text-slate-800">{String(meta.returnAirline || 'N/A')}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block font-medium">Flight #</span>
                        <span className="font-bold text-slate-800">{String(meta.returnFlightNumber || 'N/A')}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block font-medium">Origin</span>
                        <span className="font-bold text-slate-800">{String(meta.returnFlightOrigin || 'N/A')}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block font-medium">Checked Bags</span>
                        <span className="font-bold text-slate-800">{meta.returnHasCheckedLuggage ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Oversized Items Breakdown */}
        {Boolean(trip.metadata?.hasOversizedLuggage || trip.metadata?.oversizedItemsSummary) && (
          <div className="pt-4 border-t border-slate-100">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <LuggageIcon className="w-4 h-4 text-blue-600" />
                  Oversized Items
                </span>
                <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded">
                  Extra Space
                </span>
              </div>
              <p className="text-xs text-slate-800 font-semibold">
                {String(trip.metadata?.oversizedItemsSummary || 'Oversized Items')}
              </p>
              {Boolean(trip.metadata?.oversizedLuggageNotes) && (
                <p className="text-xs text-slate-500 italic">
                  Note: {String(trip.metadata?.oversizedLuggageNotes)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Driver Notes, Gate Code & Preferences */}
        {(trip.driverNotes || meta.gateCode || trip.passenger.specialRequests) && (
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Driver Notes &amp; Preferences
            </h4>
            <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
              {Boolean(meta.gateCode) && (
                <p>
                  <strong className="text-slate-900">Gate / Access Code:</strong> {String(meta.gateCode)}
                </p>
              )}
              {trip.passenger.specialRequests && (
                <p>
                  <strong className="text-slate-900">Ride Preferences:</strong> {trip.passenger.specialRequests}
                </p>
              )}
              {trip.driverNotes && (
                <p className="whitespace-pre-line">
                  <strong className="text-slate-900">Notes for Driver:</strong> {trip.driverNotes}
                </p>
              )}
            </div>
          </div>
        )}
        {/* Guest Account Claiming CTA */}
        {!isSignedIn && trip.id && (
          <div className="pt-4 border-t border-slate-100 print:hidden">
            <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-extrabold text-blue-950">
                  Save This Trip &amp; Rebook in Seconds
                </h4>
                <p className="text-[11px] text-blue-800 mt-0.5">
                  Create a free account to save Trip #{trip.id}, store favorite pickup spots, and view receipts anytime.
                </p>
              </div>
              <Link
                to={`/app/register?claimTrip=${encodeURIComponent(trip.id)}&email=${encodeURIComponent(trip.passenger.email || '')}`}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 text-center"
              >
                Create Account &rarr;
              </Link>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="bg-slate-50/70 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
        <span className="text-xs text-slate-500 text-center sm:text-left">
          Questions about your ride? Call 24/7 Dispatch at{' '}
          <a
            href={`tel:${(companyConfig?.phone || COMPANY_CONFIG.phone.primaryRaw).replace(/[^\d+]/g, '')}`}
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
          {trip.id && (
            trip.status === 'en_route' ? (
              <Link
                to={trackPath}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors relative overflow-hidden group"
              >
                <span className="absolute inset-0 w-full h-full bg-blue-400 opacity-20 animate-pulse"></span>
                Track Live Ride
              </Link>
            ) : (
              <Link
                to={trackPath}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
              >
                {isUnconfirmed ? 'Track Request Status' : 'Track Live Ride'}
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
