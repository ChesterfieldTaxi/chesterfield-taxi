import React from 'react';
import { Link, useLoaderData, type LoaderFunctionArgs, type MetaArgs } from 'react-router';
import {
  ArrowLeftRightIcon,
  BuildingIcon,
  CarIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  LandmarkIcon,
  LuggageIcon,
  MapPinIcon,
  PhoneIcon,
  PlaneIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
} from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { loadPublicSettingsForServer } from '../core/services/config/public-settings.server';
import {
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  buildPrepopulatedBookUrl,
  buildTaxiServiceJsonLd,
  computeCorridorFareEstimates,
  getCorridorBySlug,
  getRelatedCorridors,
  getResolvedCorridorBySlug,
  resolveCanonicalSiteOrigin,
  serializeJsonLdScriptPayload,
  type CorridorDirection,
} from '../core/services/seo';
import type { AppSettings, CompanyConfig } from '../core/types/config';

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (!getCorridorBySlug(params.corridorSlug)) {
    throw new Response('Corridor Not Found', { status: 404, statusText: 'Not Found' });
  }

  const origin = resolveCanonicalSiteOrigin(request);
  let settings: Partial<AppSettings> | undefined;

  try {
    const loaded = await Promise.race<Partial<AppSettings> | null>([
      loadPublicSettingsForServer(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    settings = loaded ?? undefined;
  } catch {
    settings = undefined;
  }

  const corridor = getResolvedCorridorBySlug(params.corridorSlug, settings);
  if (!corridor) {
    throw new Response('Corridor Not Found', { status: 404, statusText: 'Not Found' });
  }

  const company: CompanyConfig = settings?.company ?? {
    name: COMPANY_CONFIG.name,
    phone: COMPANY_CONFIG.phone.dispatch,
    email: COMPANY_CONFIG.email.dispatch,
    address: COMPANY_CONFIG.address.formatted,
  };

  const initialEstimates = computeCorridorFareEstimates({
    corridor,
    direction: 'outbound',
    passengers: 1,
    settings,
  });

  const relatedCorridors = getRelatedCorridors(corridor.slug, 3, settings).map((rel) => {
    const relEst = computeCorridorFareEstimates({
      corridor: rel,
      direction: 'outbound',
      passengers: 1,
      settings,
    });
    return {
      corridor: rel,
      startingFareWholeDollars: Math.round(relEst.startingFare),
    };
  });

  return {
    corridor,
    origin,
    company,
    initialSettings: settings,
    initialEstimates,
    relatedCorridors,
  };
}

export function meta({ data }: MetaArgs<typeof loader>) {
  if (!data?.corridor) {
    return [{ title: `Service Area Not Found – ${COMPANY_CONFIG.name}` }];
  }

  const { corridor, origin } = data;
  const canonicalUrl = `${origin}/service-areas/${corridor.slug}`;

  return [
    { title: corridor.metaTitle },
    { name: 'description', content: corridor.metaDescription },
    { property: 'og:title', content: corridor.metaTitle },
    { property: 'og:description', content: corridor.metaDescription },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonicalUrl },
    { tagName: 'link', rel: 'canonical', href: canonicalUrl },
  ];
}

export default function ServiceAreaCorridorRoute() {
  const { corridor, origin, company, initialSettings, initialEstimates, relatedCorridors } =
    useLoaderData<typeof loader>();

  const [direction, setDirection] = React.useState<CorridorDirection>('outbound');
  const [passengers, setPassengers] = React.useState<number>(1);
  const [selectedTierId, setSelectedTierId] = React.useState<'standard' | 'premium' | 'xl'>(
    'standard'
  );

  // Reset interactive calculator state when navigating between corridor slugs
  React.useEffect(() => {
    setDirection('outbound');
    setPassengers(1);
    setSelectedTierId('standard');
  }, [corridor.slug]);

  const liveEstimates = React.useMemo(
    () =>
      computeCorridorFareEstimates({
        corridor,
        direction,
        passengers,
        settings: initialSettings,
      }),
    [corridor, direction, passengers, initialSettings]
  );

  // Ensure selected tier fits passenger count (auto-upgrade 5–6 pax to XL SUV / Minivan)
  const effectiveSelectedTier = React.useMemo(() => {
    const candidate = liveEstimates.tiers.find((t) => t.tierId === selectedTierId);
    if (candidate && candidate.fitsPassengers) {
      return candidate;
    }
    return (
      liveEstimates.tiers.find((t) => t.tierId === liveEstimates.recommendedTierId) ||
      liveEstimates.tiers[liveEstimates.tiers.length - 1]
    );
  }, [liveEstimates, selectedTierId]);

  const activeBookUrl = React.useMemo(
    () =>
      buildPrepopulatedBookUrl({
        pickupAddress: liveEstimates.pickup.address,
        pickupCoordinates: liveEstimates.pickup.coordinates,
        dropoffAddress: liveEstimates.dropoff.address,
        dropoffCoordinates: liveEstimates.dropoff.coordinates,
        vehicleChoice: effectiveSelectedTier.bookVehicleChoice,
        passengers,
        timingType: 'later',
      }),
    [liveEstimates.pickup, liveEstimates.dropoff, effectiveSelectedTier.bookVehicleChoice, passengers]
  );

  const canonicalUrl = `${origin}/service-areas/${corridor.slug}`;
  const companyName = company?.name?.trim() || COMPANY_CONFIG.name;
  const phoneDisplay = company?.phone?.trim() || COMPANY_CONFIG.phone.dispatch;
  const phoneRaw =
    (company?.phone || COMPANY_CONFIG.phone.primaryRaw).replace(/[^\d+]/g, '') ||
    COMPANY_CONFIG.phone.primaryRaw;

  const taxiServiceJsonLd = React.useMemo(
    () =>
      buildTaxiServiceJsonLd({
        corridor,
        origin,
        company,
        estimates: initialEstimates,
      }),
    [corridor, origin, company, initialEstimates]
  );

  const faqPageJsonLd = React.useMemo(() => buildFaqPageJsonLd(corridor.faqs), [corridor.faqs]);

  const breadcrumbJsonLd = React.useMemo(
    () =>
      buildBreadcrumbListJsonLd([
        { name: 'Home', url: `${origin}/` },
        { name: 'Service Areas', url: `${origin}/service-areas` },
        { name: corridor.shortTitle, url: canonicalUrl },
      ]),
    [origin, corridor.shortTitle, canonicalUrl]
  );

  const handlePassengerChange = (nextPax: number) => {
    setPassengers(nextPax);
    if (nextPax > 4 && selectedTierId !== 'xl') {
      setSelectedTierId('xl');
    }
  };

  return (
    <div className="py-8 sm:py-12 bg-gradient-to-b from-surface-subtle via-surface-card to-status-info-bg/25 flex-1">
      {/* Structured Data (XSS-Safe Escaped JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLdScriptPayload(taxiServiceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLdScriptPayload(faqPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLdScriptPayload(breadcrumbJsonLd) }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Breadcrumbs */}
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-xs text-fg-muted"
        >
          <Link to="/" className="hover:text-blue-600 font-medium transition-colors">
            Home
          </Link>
          <ChevronRightIcon className="w-3.5 h-3.5 text-fg-subtle" />
          <Link to="/service-areas" className="hover:text-blue-600 font-medium transition-colors">
            Service Areas
          </Link>
          <ChevronRightIcon className="w-3.5 h-3.5 text-fg-subtle" />
          <span className="font-bold text-fg-primary">{corridor.shortTitle}</span>
        </nav>

        {/* Hero + Instant Corridor Fare Calculator Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          {/* Left Column: Corridor Overview & Highlights */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 bg-status-info-bg text-status-info-fg text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider border border-status-info-border">
              {corridor.category === 'fbo' ? (
                <SparklesIcon className="w-3.5 h-3.5 text-indigo-600" />
              ) : corridor.category === 'corporate' ? (
                <BuildingIcon className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <PlaneIcon className="w-3.5 h-3.5 text-blue-600" />
              )}
              <span>
                {corridor.category === 'fbo'
                  ? 'Private Aviation & FBO Ramp Service'
                  : corridor.category === 'corporate'
                  ? 'Executive Corporate & Airport Corridor'
                  : '24/7 Pre-Quoted Airport & West County Corridor'}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-fg-primary tracking-tight leading-tight">
              {corridor.heroHeadline}
            </h1>

            <p className="text-base text-fg-secondary leading-relaxed">{corridor.heroSubheadline}</p>

            {/* Quick Corridor Telemetry Badges */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-surface-card border border-border-subtle/80 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block">
                  Distance
                </span>
                <span className="text-base sm:text-lg font-extrabold text-fg-primary">
                  {corridor.distanceMiles} mi
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-surface-card border border-border-subtle/80 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block">
                  Typical Time
                </span>
                <span className="text-base sm:text-lg font-extrabold text-fg-primary">
                  ~{corridor.typicalDurationMinutes} min
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-surface-card border border-border-subtle/80 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block">
                  Dispatch
                </span>
                <span className="text-base sm:text-lg font-extrabold text-status-success-fg">
                  24/7 Live
                </span>
              </div>
            </div>

            {/* Service Guarantees */}
            <ul className="space-y-2.5 pt-2 text-sm text-fg-secondary">
              <li className="flex items-start gap-2.5">
                <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Locked Upfront Corridor Rates:</strong> Zero surprise app-surge
                  multipliers during storms, early mornings, or game-day traffic.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Automated STL Flight &amp; SUS Tail-Number Monitoring:</strong> Chauffeur
                  staging adjusts automatically if your aircraft arrives early or delayed.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Self-Service Ride Tracking:</strong> Manage gate codes, flight numbers, or
                  pickup times directly from your SMS/email tracking link.
                </span>
              </li>
            </ul>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href={`tel:${phoneRaw}`}
                className="inline-flex items-center gap-2 text-xs font-bold text-fg-secondary hover:text-blue-600 bg-surface-card border border-border-subtle px-4 py-2.5 rounded-xl shadow-2xs transition-colors"
              >
                <PhoneIcon className="w-4 h-4 text-blue-600" />
                <span>24/7 Dispatch Desk: {phoneDisplay}</span>
              </a>
            </div>
          </div>

          {/* Right Column: Interactive Instant Corridor Fare Calculator Card */}
          <div className="lg:col-span-6">
            <Card
              variant="elevated"
              className="bg-surface-card border-2 border-slate-900/10 rounded-3xl p-5 sm:p-7 shadow-lg space-y-5"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border-faint pb-4">
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600 block">
                    Instant Upfront Quote Calculator
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold text-fg-primary tracking-tight">
                    Select Direction, Passengers &amp; Vehicle
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDirection((prev) => (prev === 'outbound' ? 'inbound' : 'outbound'))
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-status-info-bg hover:bg-status-info-bg-strong text-status-info-fg border border-status-info-border text-xs font-bold transition-colors cursor-pointer shrink-0"
                  title="Swap pickup and dropoff direction"
                >
                  <ArrowLeftRightIcon className="w-3.5 h-3.5" />
                  <span>Swap Direction</span>
                </button>
              </div>

              {/* 2-Way Direction Pills + Active Endpoints */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-muted">
                  <button
                    type="button"
                    onClick={() => setDirection('outbound')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer truncate ${
                      direction === 'outbound'
                        ? 'bg-surface-card text-fg-primary shadow-xs'
                        : 'text-fg-secondary hover:text-fg-primary'
                    }`}
                  >
                    Outbound &rarr;
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('inbound')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer truncate ${
                      direction === 'inbound'
                        ? 'bg-surface-card text-fg-primary shadow-xs'
                        : 'text-fg-secondary hover:text-fg-primary'
                    }`}
                  >
                    &larr; Inbound Return
                  </button>
                </div>

                <div className="rounded-2xl bg-surface-subtle border border-border-subtle/80 p-3.5 space-y-2.5 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15 mt-1 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block">
                        Pickup
                      </span>
                      <span className="font-bold text-fg-primary block truncate">
                        {liveEstimates.pickup.label}
                      </span>
                      <span className="text-fg-muted block truncate">
                        {liveEstimates.pickup.address}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-dashed border-border-subtle" />
                  <div className="flex items-start gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 ring-4 ring-rose-500/15 mt-1 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block">
                        Dropoff
                      </span>
                      <span className="font-bold text-fg-primary block truncate">
                        {liveEstimates.dropoff.label}
                      </span>
                      <span className="text-fg-muted block truncate">
                        {liveEstimates.dropoff.address}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Passenger Selector (1–6) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-fg-secondary inline-flex items-center gap-1.5">
                    <UsersIcon className="w-4 h-4 text-blue-600" />
                    <span>Passengers</span>
                  </span>
                  {passengers > 4 && (
                    <span className="text-[11px] font-semibold text-status-warning-fg bg-status-warning-bg border border-status-warning-border px-2 py-0.5 rounded-md">
                      5–6 riders require XL SUV / Minivan
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((count) => {
                    const active = passengers === count;
                    return (
                      <button
                        key={count}
                        type="button"
                        onClick={() => handlePassengerChange(count)}
                        aria-label={`${count} ${count === 1 ? 'passenger' : 'passengers'}`}
                        className={`py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-surface-card text-fg-secondary border-border-subtle hover:border-blue-400'
                        }`}
                      >
                        {count}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Upfront Vehicle Tier Cards */}
              <div className="space-y-2.5">
                {liveEstimates.tiers.map((tier) => {
                  const isSelected = effectiveSelectedTier.tierId === tier.tierId;
                  const disabled = !tier.fitsPassengers;
                  return (
                    <button
                      key={tier.tierId}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedTierId(tier.tierId)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        disabled
                          ? 'bg-surface-subtle border-border-subtle/70 opacity-55 cursor-not-allowed'
                          : isSelected
                          ? 'bg-status-info-bg/70 border-blue-600 ring-2 ring-blue-600/15 cursor-pointer'
                          : 'bg-surface-card border-border-subtle hover:border-blue-400 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-surface-muted text-fg-secondary'
                          }`}
                        >
                          {tier.tierId === 'xl' || tier.tierId === 'premium' ? (
                            <SparklesIcon className="w-4 h-4" />
                          ) : (
                            <CarIcon className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-extrabold text-fg-primary">
                              {tier.shortLabel}
                            </span>
                            {tier.badge && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-muted text-fg-secondary">
                                {tier.badge}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-fg-muted mt-0.5">
                            <span>Up to {tier.maxPassengers} Pax</span>
                            <span className="inline-flex items-center gap-1">
                              <LuggageIcon className="w-3 h-3" />
                              {tier.maxLuggage} Bags
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-lg sm:text-xl font-extrabold text-fg-primary block leading-none">
                          ${tier.estimatedFareWholeDollars}
                        </span>
                        <span className="text-[10px] font-semibold text-fg-muted block mt-1">
                          {disabled ? `Max ${tier.maxPassengers} Pax` : 'Upfront Est.'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Transparent Surcharge Footnote */}
              <p className="text-[11px] text-fg-muted leading-relaxed">
                {liveEstimates.isAirportCorridor && liveEstimates.airportSurcharge > 0
                  ? `Includes $${liveEstimates.airportSurcharge.toFixed(2)} commercial airport access fee. `
                  : ''}
                Exact street address fine-tunes live mileage on the booking checkout screen.
              </p>

              {/* Primary Pre-Populated Booking CTA */}
              <Link
                to={activeBookUrl}
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm sm:text-base font-extrabold shadow-sm transition-colors"
              >
                <span>
                  Book This Ride (${effectiveSelectedTier.estimatedFareWholeDollars} Upfront) &rarr;
                </span>
              </Link>
            </Card>
          </div>
        </div>

        {/* Airport / FBO / Curbside Pickup Guide & Served Landmarks */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Terminal / FBO / Curbside Pickup Guide */}
          <Card
            variant="elevated"
            className="lg:col-span-7 bg-surface-card border border-border-subtle/80 rounded-3xl p-6 sm:p-8 space-y-5 shadow-xs"
          >
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                Chauffeur Staging &amp; Terminal Protocol
              </span>
              <h2 className="text-2xl font-extrabold text-fg-primary tracking-tight">
                Airport, FBO &amp; Curbside Pickup Guide
              </h2>
            </div>

            <ol className="space-y-4">
              {corridor.pickupInstructions.map((instruction, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3.5 p-4 rounded-2xl bg-surface-subtle border border-border-subtle/70"
                >
                  <span className="w-7 h-7 rounded-xl bg-surface-header text-white text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <p className="text-sm text-fg-secondary leading-relaxed">{instruction}</p>
                </li>
              ))}
            </ol>
          </Card>

          {/* Served ZIP Codes & Local Landmarks */}
          <Card
            variant="elevated"
            className="lg:col-span-5 bg-surface-card border border-border-subtle/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs"
          >
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                Primary Coverage Zones
              </span>
              <h2 className="text-2xl font-extrabold text-fg-primary tracking-tight">
                Served ZIP Codes &amp; Landmarks
              </h2>
              <div className="flex flex-wrap gap-2 pt-1">
                {corridor.zipCodes.map((zip) => (
                  <span
                    key={zip}
                    className="font-mono text-xs font-bold bg-status-info-bg text-status-info-fg border border-status-info-border px-3 py-1.5 rounded-xl"
                  >
                    MO {zip}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-border-faint">
              <h3 className="text-xs font-bold uppercase tracking-wider text-fg-subtle">
                Popular Pickup &amp; Dropoff Landmarks
              </h3>
              <ul className="space-y-2.5">
                {corridor.landmarks.map((landmark) => (
                  <li
                    key={landmark}
                    className="flex items-center gap-2.5 text-sm font-semibold text-fg-strong bg-surface-subtle border border-border-subtle/70 px-3.5 py-2.5 rounded-xl"
                  >
                    <LandmarkIcon className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>{landmark}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>

        {/* Corridor FAQ Section */}
        <section className="bg-surface-card border border-border-subtle/80 rounded-3xl p-6 sm:p-10 space-y-6 shadow-xs">
          <div className="max-w-2xl space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Corridor Frequently Asked Questions
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-fg-primary tracking-tight">
              {corridor.shortTitle} — Travel &amp; Booking FAQs
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {corridor.faqs.map((faq) => (
              <div
                key={faq.question}
                className="p-5 rounded-2xl bg-surface-subtle border border-border-subtle/80 space-y-2"
              >
                <h3 className="text-sm sm:text-base font-extrabold text-fg-primary">
                  {faq.question}
                </h3>
                <p className="text-xs sm:text-sm text-fg-secondary leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Related Service Areas Cross-Links */}
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                Regional St. Louis Network
              </span>
              <h2 className="text-2xl font-extrabold text-fg-primary tracking-tight">
                Related Airport &amp; West County Service Areas
              </h2>
            </div>
            <Link
              to="/service-areas"
              className="text-xs font-extrabold text-blue-600 hover:text-status-info-fg inline-flex items-center gap-1"
            >
              <span>View All 8 Service Corridors</span>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {relatedCorridors.map(({ corridor: rel, startingFareWholeDollars }) => (
              <Link
                key={rel.slug}
                to={`/service-areas/${rel.slug}`}
                className="group p-5 rounded-2xl bg-surface-card border border-border-subtle/80 hover:border-blue-500 shadow-2xs transition-all flex flex-col justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-fg-muted">
                      {rel.distanceMiles} mi · ~{rel.typicalDurationMinutes} min
                    </span>
                    <span className="font-extrabold text-status-info-fg bg-status-info-bg px-2 py-0.5 rounded-md">
                      From ${startingFareWholeDollars}
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-fg-primary group-hover:text-blue-600 transition-colors">
                    {rel.shortTitle}
                  </h3>
                  <p className="text-xs text-fg-secondary line-clamp-2">{rel.heroSubheadline}</p>
                </div>
                <span className="text-xs font-bold text-fg-primary group-hover:text-blue-600 inline-flex items-center gap-1">
                  <span>View {companyName} Rates</span>
                  <ChevronRightIcon className="w-3.5 h-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
