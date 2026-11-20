import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  CarIcon,
  ShieldCheckIcon,
  ClockIcon,
  PhoneIcon,
  CheckIcon,
  SparklesIcon,
  MapPinIcon,
  ChevronRightIcon,
  SpinnerIcon,
} from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { COMPANY_CONFIG } from '../config/companyConfig';
import {
  DispatchLocationInput,
  type PlaceSelectedDetails,
} from '../components/domain/dispatch/DispatchLocationInput';
import { getBookingService } from '../core/services/booking';
import type { QuoteResponse } from '../core/services/booking-service';
import type { GeoPoint } from '../core/types';
import { hasValidRoutePair } from '../core/hooks/useDebounceRoute';

export function meta() {
  return [
    { title: `${COMPANY_CONFIG.name} – ${COMPANY_CONFIG.tagline}` },
    {
      name: 'description',
      content:
        'West St. Louis County premier licensed taxi & car service. Airport transfers to Lambert STL & Spirit SUS, corporate accounts, 24/7 dispatch with upfront estimated fares.',
    },
    { property: 'og:title', content: `${COMPANY_CONFIG.name} – ${COMPANY_CONFIG.tagline}` },
    {
      property: 'og:description',
      content:
        'West St. Louis County premier licensed taxi & car service. Airport transfers to Lambert STL & Spirit SUS, corporate accounts, 24/7 dispatch with upfront estimated fares.',
    },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: 'https://chesterfieldtaxi.com/' },
    { property: 'og:image', content: 'https://chesterfieldtaxi.com/icon-512.svg' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ];
}

const LOCAL_BUSINESS_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'TaxiService',
  name: COMPANY_CONFIG.name,
  legalName: COMPANY_CONFIG.legalName,
  telephone: COMPANY_CONFIG.phone.dispatch,
  email: COMPANY_CONFIG.email.dispatch,
  url: 'https://chesterfieldtaxi.com',
  logo: 'https://chesterfieldtaxi.com/icon-512.svg',
  address: {
    '@type': 'PostalAddress',
    streetAddress: COMPANY_CONFIG.address.street,
    addressLocality: COMPANY_CONFIG.address.city,
    addressRegion: COMPANY_CONFIG.address.state,
    postalCode: COMPANY_CONFIG.address.zip,
    addressCountry: 'US',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 38.6531,
    longitude: -90.5732,
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
  ],
  priceRange: '$$',
  areaServed: COMPANY_CONFIG.serviceAreas,
};

const VALUE_PROPOSITIONS = [
  {
    icon: <ClockIcon className="w-6 h-6 text-blue-600" />,
    title: 'Guaranteed Punctuality',
    description:
      'We value your schedule. Whether booking for an early morning flight or late night pickup, our dispatch network guarantees on-time arrival.',
  },
  {
    icon: <ShieldCheckIcon className="w-6 h-6 text-blue-600" />,
    title: 'Transparent Estimated Pricing',
    description:
      'No surprise surge pricing or hidden fees. See an upfront itemized fare estimate before requesting your trip.',
  },
  {
    icon: <CarIcon className="w-6 h-6 text-blue-600" />,
    title: 'Modern & Clean Fleet',
    description:
      'From executive sedans to spacious SUVs, all vehicles undergo daily cleaning and safety inspections.',
  },
  {
    icon: <SparklesIcon className="w-6 h-6 text-blue-600" />,
    title: 'Professional Chauffeurs',
    description:
      'Fully licensed, background-checked, and commercially insured drivers with thorough local knowledge of West County and St. Louis metro.',
  },
];

const POPULAR_DESTINATIONS = [
  {
    destination: 'Lambert-St. Louis International (STL)',
    bookAddress: 'St. Louis Lambert International Airport (STL), St. Louis, MO',
    type: 'Commercial Airport',
    time: 'Approx. 25-35 min from Chesterfield',
    badge: 'Most Popular',
  },
  {
    destination: 'Spirit of St. Louis Airport (SUS)',
    bookAddress: 'Spirit of St. Louis Airport (SUS), Chesterfield, MO',
    type: 'Private & Corporate Aviation',
    time: 'Approx. 5-10 min from Chesterfield Valley',
    badge: 'Executive Hub',
  },
  {
    destination: 'Downtown St. Louis & Busch Stadium',
    bookAddress: 'Downtown St. Louis / Busch Stadium, St. Louis, MO',
    type: 'Sports, Conventions & Dining',
    time: 'Approx. 30-40 min via I-64 / US-40',
    badge: 'Events',
  },
  {
    destination: 'West County Center & Plaza Frontenac',
    bookAddress: 'West County Center, Des Peres, MO',
    type: 'Shopping & Dining Corridors',
    time: 'Approx. 15-20 min',
    badge: 'Local',
  },
];

const HIGHLIGHTS = [
  'Instant dispatch or scheduled future bookings',
  'Lambert STL flight tracking — we wait as long as it takes',
  'Executive accounts with monthly invoicing',
  'Local and regional door-to-door transportation',
];

export default function IndexRoute() {
  const navigate = useNavigate();

  // Interactive Quick-Quote Hero State
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoordinates, setPickupCoordinates] = useState<GeoPoint | undefined>(undefined);
  const [pickupPlaceId, setPickupPlaceId] = useState<string | undefined>(undefined);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffCoordinates, setDropoffCoordinates] = useState<GeoPoint | undefined>(undefined);
  const [dropoffPlaceId, setDropoffPlaceId] = useState<string | undefined>(undefined);
  const [timing, setTiming] = useState<'later' | 'asap'>('later');
  const [quickQuote, setQuickQuote] = useState<QuoteResponse | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    if (!pickupAddress.trim() || !dropoffAddress.trim()) {
      setQuickQuote(null);
      setShowBreakdown(false);
      return;
    }

    const validPair = hasValidRoutePair(
      pickupCoordinates || pickupAddress,
      dropoffCoordinates || dropoffAddress,
      pickupPlaceId,
      dropoffPlaceId
    );
    if (!validPair) return;

    const timer = setTimeout(async () => {
      setIsQuoting(true);
      try {
        const res = await getBookingService().calculateQuote({
          pickupLocation: {
            address: pickupAddress.trim(),
            placeId: pickupPlaceId,
            coordinates: pickupCoordinates,
          },
          dropoffLocation: {
            address: dropoffAddress.trim(),
            placeId: dropoffPlaceId,
            coordinates: dropoffCoordinates,
          },
          vehicleTier: 'any',
          bookingType: timing === 'asap' ? 'asap' : 'scheduled',
          passengerCount: 1,
          luggageCount: 1,
        });
        setQuickQuote(res);
      } catch {
        setQuickQuote(null);
      } finally {
        setIsQuoting(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [
    pickupAddress,
    dropoffAddress,
    pickupCoordinates,
    dropoffCoordinates,
    pickupPlaceId,
    dropoffPlaceId,
    timing,
  ]);

  const handleContinueToBook = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (pickupAddress.trim()) params.set('pickup', pickupAddress.trim());
    if (dropoffAddress.trim()) params.set('dropoff', dropoffAddress.trim());
    if (pickupCoordinates) {
      params.set('pickupLat', String(pickupCoordinates.lat));
      params.set('pickupLng', String(pickupCoordinates.lng));
    }
    if (dropoffCoordinates) {
      params.set('dropoffLat', String(dropoffCoordinates.lat));
      params.set('dropoffLng', String(dropoffCoordinates.lng));
    }
    params.set('timing', timing);
    const qs = params.toString();
    navigate(qs ? `/book?${qs}` : '/book');
  };

  const estimatedTotal = quickQuote ? Math.ceil(quickQuote.pricing.totalFare) : null;

  return (
    <div className="flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(LOCAL_BUSINESS_SCHEMA) }}
      />
      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/40 via-white to-slate-50 py-14 sm:py-20 border-b border-slate-200/80">
        <div className="absolute inset-0 pointer-events-none opacity-20 [background-image:radial-gradient(var(--brand-primary,#2563eb)_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column: Headline & Call To Actions */}
            <div className="lg:col-span-7 text-center lg:text-left space-y-6">
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-900 text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider border border-blue-200 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                Serving Chesterfield, Wildwood, Ballwin &amp; St. Louis Metro
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-950 tracking-tight leading-[1.12]">
                Dependable, Professional{' '}
                <span
                  style={{ color: 'var(--brand-primary, #2563eb)' }}
                  className="underline decoration-blue-300 decoration-wavy underline-offset-8"
                >
                  Taxi &amp; Executive
                </span>{' '}
                Car Service
              </h1>

              <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                Book your ride in seconds. Transparent upfront fare estimates, licensed &amp; insured
                chauffeurs, and 24/7 dispatch across West St. Louis County.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <Link
                  to="/book"
                  style={{
                    backgroundColor: 'var(--btn-primary-bg, #2563eb)',
                    color: 'var(--btn-primary-text, #ffffff)',
                  }}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 text-base font-extrabold px-8 py-4 rounded-xl shadow-md hover:shadow-lg hover:opacity-95 transition-all transform hover:-translate-y-0.5"
                >
                  <CarIcon className="w-5 h-5" />
                  <span>Book Your Ride Now</span>
                  <ChevronRightIcon className="w-4 h-4 stroke-[3]" />
                </Link>

                <Link
                  to="/services"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-800 text-base font-bold px-6 py-4 rounded-xl border border-slate-300 shadow-xs transition-colors"
                >
                  <span>Explore Services &amp; Rates</span>
                </Link>
              </div>

              {/* Bullet Features */}
              <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs sm:text-sm text-slate-600">
                {HIGHLIGHTS.map((highlight) => (
                  <div key={highlight} className="flex items-center gap-2 justify-center lg:justify-start">
                    <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
                      <CheckIcon className="w-3 h-3 stroke-[3]" />
                    </div>
                    <span>{highlight}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Interactive Quick-Quote & Handoff Widget */}
            <div className="lg:col-span-5">
              <Card variant="elevated" className="border-slate-200/80 shadow-xl bg-white overflow-visible">
                <div className="bg-slate-950 text-white p-5 sm:p-6 border-b border-slate-800 rounded-t-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                      Instant Fare Estimate
                    </span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 font-bold px-2.5 py-0.5 rounded-full border border-blue-500/30">
                      No Surge Pricing
                    </span>
                  </div>
                  <h2 className="text-xl font-extrabold tracking-tight">
                    Where can we take you today?
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Enter your route for an estimated fare and finish booking in under a minute.
                  </p>
                </div>

                <form onSubmit={handleContinueToBook} className="p-5 sm:p-6 space-y-4">
                  {/* Timing Segmented Control */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setTiming('asap')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        timing === 'asap'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ⚡ Ride Now (ASAP)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTiming('later')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        timing === 'later'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📅 Schedule Later
                    </button>
                  </div>

                  {/* Route Inputs */}
                  <div className="space-y-2.5">
                    <div>
                      <label htmlFor="hero-pickup" className="sr-only">
                        Pickup Location
                      </label>
                      <DispatchLocationInput
                        id="hero-pickup"
                        name="heroPickup"
                        size="comfortable"
                        variant="pickup"
                        showCurrentLocationButton={true}
                        placeholder="Pickup address (or tap GPS)"
                        value={pickupAddress}
                        onChange={(addr) => {
                          setPickupAddress(addr);
                          setPickupCoordinates(undefined);
                          setPickupPlaceId(undefined);
                        }}
                        onPlaceSelected={(p: PlaceSelectedDetails) => {
                          setPickupAddress(p.address);
                          setPickupCoordinates(p.coordinates);
                          setPickupPlaceId(p.placeId);
                        }}
                      />
                    </div>

                    <div>
                      <label htmlFor="hero-dropoff" className="sr-only">
                        Dropoff Destination
                      </label>
                      <DispatchLocationInput
                        id="hero-dropoff"
                        name="heroDropoff"
                        size="comfortable"
                        variant="dropoff"
                        placeholder="Where to? (e.g. Lambert STL Airport)"
                        value={dropoffAddress}
                        onChange={(addr) => {
                          setDropoffAddress(addr);
                          setDropoffCoordinates(undefined);
                          setDropoffPlaceId(undefined);
                        }}
                        onPlaceSelected={(p: PlaceSelectedDetails) => {
                          setDropoffAddress(p.address);
                          setDropoffCoordinates(p.coordinates);
                          setDropoffPlaceId(p.placeId);
                        }}
                      />
                    </div>
                  </div>

                  {/* Live Estimated Fare Preview */}
                  {(isQuoting || quickQuote) && (
                    <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/90 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 block">
                            Estimated Fare (Sedan / Any)
                          </span>
                          {quickQuote && (
                            <span className="text-[11px] text-slate-600 font-medium">
                              {quickQuote.pricing.distanceMiles.toFixed(1)} mi &bull; ~{quickQuote.pricing.durationMinutes} min
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          {isQuoting ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700">
                              <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                              Calculating...
                            </span>
                          ) : estimatedTotal !== null ? (
                            <span className="text-2xl font-mono font-black text-slate-950">
                              ${estimatedTotal.toFixed(2)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {quickQuote && !isQuoting && (
                        <>
                          <div className="flex items-center justify-between pt-1.5 border-t border-blue-200/60">
                            <span className="text-[10px] text-slate-500">
                              Final fare confirmed by dispatch
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowBreakdown((prev) => !prev)}
                              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
                            >
                              {showBreakdown ? 'Hide Breakdown ▲' : 'Price Breakdown ▾'}
                            </button>
                          </div>

                          {showBreakdown && (
                            <div className="pt-2 border-t border-blue-200/60 space-y-1 text-[11px] text-slate-700">
                              <div className="flex justify-between">
                                <span>Base Flag-Drop</span>
                                <span className="font-mono font-semibold">${quickQuote.pricing.baseFare.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Distance ({quickQuote.pricing.distanceMiles.toFixed(1)} mi)</span>
                                <span className="font-mono font-semibold">${(quickQuote.pricing.distanceRate * quickQuote.pricing.distanceMiles).toFixed(2)}</span>
                              </div>
                              {Boolean(quickQuote.pricing.airportSurcharge) && (
                                <div className="flex justify-between">
                                  <span>Airport / Facility Fee</span>
                                  <span className="font-mono font-semibold">${Number(quickQuote.pricing.airportSurcharge).toFixed(2)}</span>
                                </div>
                              )}
                              {quickQuote.pricing.itemizedSurcharges?.map((s, idx) => (
                                <div key={idx} className="flex justify-between">
                                  <span>{s.name}</span>
                                  <span className="font-mono font-semibold">${s.amount.toFixed(2)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between pt-1 border-t border-blue-200/70 font-bold text-slate-900">
                                <span>Estimated Total</span>
                                <span className="font-mono">${estimatedTotal?.toFixed(2)}</span>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <div className="pt-1">
                    <button
                      type="submit"
                      style={{
                        backgroundColor: 'var(--btn-primary-bg, #2563eb)',
                        color: 'var(--btn-primary-text, #ffffff)',
                      }}
                      className="w-full flex items-center justify-center gap-2 font-extrabold text-sm py-3.5 px-4 rounded-xl transition-all shadow-md hover:opacity-95 active:scale-[0.99] cursor-pointer"
                    >
                      <span>
                        {estimatedTotal !== null
                          ? `Continue to Book ($${estimatedTotal.toFixed(2)} est.)`
                          : 'See Estimated Fare & Book'}
                      </span>
                      <ChevronRightIcon className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>

                  <div className="text-center pt-1">
                    <a
                      href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
                      className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 font-semibold"
                    >
                      <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
                      <span>Prefer to call? 24/7 dispatch: {COMPANY_CONFIG.phone.dispatch}</span>
                    </a>
                  </div>
                </form>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Value Propositions ─── */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Why Choose Chesterfield Taxi
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight mt-1">
              Engineered for Reliability &amp; Comfort
            </h2>
            <p className="text-slate-600 text-base mt-3">
              We combine modern booking technology with the seasoned accountability of a dedicated,
              locally-owned car service.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUE_PROPOSITIONS.map((prop) => (
              <Card
                key={prop.title}
                variant="default"
                className="p-6 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all group bg-slate-50/50"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200/70 flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  {prop.icon}
                </div>
                <h3 className="text-base font-extrabold text-slate-900 mb-2">{prop.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{prop.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Popular Destinations / Service Highlights (1-Tap Booking Links) ─── */}
      <section className="py-16 bg-slate-50 border-y border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                Service Coverage Highlights
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight mt-1">
                Frequent Routes &amp; Transfers
              </h2>
            </div>

            <Link
              to="/services"
              className="text-sm font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1.5"
            >
              <span>View all specialized services</span>
              <ChevronRightIcon className="w-4 h-4 stroke-[3]" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {POPULAR_DESTINATIONS.map((dest) => (
              <Link
                key={dest.destination}
                to={`/book?dropoff=${encodeURIComponent(dest.bookAddress)}`}
                className="group bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start justify-between gap-4 hover:border-blue-400 hover:shadow-md transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <MapPinIcon className="w-4 h-4 text-blue-600 shrink-0" />
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                      {dest.destination}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 pl-6">{dest.type}</p>
                  <p className="text-xs text-blue-700 font-semibold pl-6 flex items-center gap-1">
                    <span>{dest.time}</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">&bull; Book this route &rarr;</span>
                  </p>
                </div>

                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 shrink-0">
                  {dest.badge}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Bottom Ready to Ride CTA Banner ─── */}
      <section className="py-16 bg-slate-950 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 space-y-6">
          <div
            style={{
              backgroundColor: 'var(--brand-primary, #2563eb)',
              color: 'var(--btn-primary-text, #ffffff)',
            }}
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto shadow-md"
          >
            <CarIcon className="w-7 h-7" />
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Ready to experience professional transit?
          </h2>

          <p className="text-slate-400 max-w-xl mx-auto text-base">
            Book now for immediate dispatch or schedule your upcoming reservation in advance with
            transparent upfront fare estimates.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              to="/book"
              style={{
                backgroundColor: 'var(--btn-primary-bg, #2563eb)',
                color: 'var(--btn-primary-text, #ffffff)',
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-base font-extrabold px-8 py-3.5 rounded-xl shadow-lg hover:opacity-95 transition-all"
            >
              <span>Book Your Trip Online</span>
              <ChevronRightIcon className="w-4 h-4 stroke-[3]" />
            </Link>

            <a
              href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-base font-bold px-6 py-3.5 rounded-xl border border-slate-800 transition-colors"
            >
              <PhoneIcon className="w-4 h-4 text-blue-400" />
              <span>{COMPANY_CONFIG.phone.dispatch}</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
