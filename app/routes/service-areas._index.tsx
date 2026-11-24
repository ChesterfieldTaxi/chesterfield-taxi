import React from 'react';
import { Link, useLoaderData, type LoaderFunctionArgs, type MetaArgs } from 'react-router';
import {
  BuildingIcon,
  CarIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
  PhoneIcon,
  PlaneIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { loadPublicSettingsForServer } from '../core/services/config/public-settings.server';
import {
  buildBreadcrumbListJsonLd,
  buildTaxiServiceJsonLd,
  computeCorridorFareEstimates,
  getResolvedLocalSeoCorridors,
  resolveCanonicalSiteOrigin,
  serializeJsonLdScriptPayload,
  type LocalSeoCorridorCategory,
} from '../core/services/seo';
import type { AppSettings, CompanyConfig } from '../core/types/config';

type HubFilterKey = 'all' | 'airports' | 'corporate' | 'west_county';

export async function loader({ request }: LoaderFunctionArgs) {
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

  const company: CompanyConfig = settings?.company ?? {
    name: COMPANY_CONFIG.name,
    phone: COMPANY_CONFIG.phone.dispatch,
    email: COMPANY_CONFIG.email.dispatch,
    address: COMPANY_CONFIG.address.formatted,
  };

  const activeCorridors = getResolvedLocalSeoCorridors(settings, { includeDisabled: false });

  const corridorSummaries = activeCorridors.map((corridor) => {
    const estimates = computeCorridorFareEstimates({
      corridor,
      direction: 'outbound',
      passengers: 1,
      settings,
    });
    const sedanTier = estimates.tiers[0];
    return {
      corridor,
      startingFareWholeDollars: Math.round(estimates.startingFare),
      defaultBookUrl: sedanTier.bookUrl,
    };
  });

  return {
    origin,
    company,
    corridorSummaries,
  };
}

export function meta({ data }: MetaArgs<typeof loader>) {
  const origin = data?.origin || 'https://chesterfieldtaxi.com';
  const companyName = data?.company?.name || COMPANY_CONFIG.name;
  const canonicalUrl = `${origin}/service-areas`;
  const title = `St. Louis Airport & West County Service Areas | Upfront Taxi Rates – ${companyName}`;
  const description =
    'Explore 24/7 upfront taxi and executive SUV corridors across Chesterfield, STL Lambert Airport, Spirit of St. Louis (SUS) FBOs, Clayton, Town & Country, Creve Coeur, Wildwood, Maryland Heights & Downtown St. Louis.';

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonicalUrl },
    { tagName: 'link', rel: 'canonical', href: canonicalUrl },
  ];
}

function getCategoryBadgeMeta(category: LocalSeoCorridorCategory) {
  switch (category) {
    case 'airport':
      return {
        label: 'STL Airport Corridor',
        className: 'bg-blue-50 text-blue-800 border-blue-200',
        icon: <PlaneIcon className="w-4 h-4 text-blue-600" />,
      };
    case 'fbo':
      return {
        label: 'Private FBO Aviation',
        className: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        icon: <SparklesIcon className="w-4 h-4 text-indigo-600" />,
      };
    case 'corporate':
      return {
        label: 'Corporate & Business',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        icon: <BuildingIcon className="w-4 h-4 text-emerald-600" />,
      };
    case 'suburban':
      return {
        label: 'West County Direct',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
        icon: <CarIcon className="w-4 h-4 text-amber-600" />,
      };
  }
}

export default function ServiceAreasHubRoute() {
  const { origin, company, corridorSummaries } = useLoaderData<typeof loader>();
  const [activeFilter, setActiveFilter] = React.useState<HubFilterKey>('all');

  const companyName = company?.name?.trim() || COMPANY_CONFIG.name;
  const phoneDisplay = company?.phone?.trim() || COMPANY_CONFIG.phone.dispatch;
  const phoneRaw =
    (company?.phone || COMPANY_CONFIG.phone.primaryRaw).replace(/[^\d+]/g, '') ||
    COMPANY_CONFIG.phone.primaryRaw;

  const filteredSummaries = React.useMemo(() => {
    if (activeFilter === 'all') return corridorSummaries;
    if (activeFilter === 'airports') {
      return corridorSummaries.filter(
        (item) => item.corridor.category === 'airport' || item.corridor.category === 'fbo'
      );
    }
    if (activeFilter === 'corporate') {
      return corridorSummaries.filter((item) => item.corridor.category === 'corporate');
    }
    return corridorSummaries.filter((item) => item.corridor.category === 'suburban');
  }, [activeFilter, corridorSummaries]);

  const breadcrumbJsonLd = React.useMemo(
    () =>
      buildBreadcrumbListJsonLd([
        { name: 'Home', url: `${origin}/` },
        { name: 'Service Areas', url: `${origin}/service-areas` },
      ]),
    [origin]
  );

  const taxiServiceJsonLd = React.useMemo(
    () =>
      buildTaxiServiceJsonLd({
        origin,
        company,
      }),
    [origin, company]
  );

  const filterOptions: Array<{ key: HubFilterKey; label: string }> = [
    { key: 'all', label: 'All Corridors' },
    { key: 'airports', label: 'STL & Spirit Airports' },
    { key: 'corporate', label: 'Corporate & Business' },
    { key: 'west_county', label: 'West County Cities' },
  ];

  return (
    <div className="py-10 sm:py-14 bg-gradient-to-b from-slate-50 via-white to-blue-50/30 flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLdScriptPayload(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLdScriptPayload(taxiServiceJsonLd) }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
          <Link to="/" className="hover:text-blue-600 font-medium transition-colors">
            Home
          </Link>
          <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-bold text-slate-900">Service Areas &amp; Airport Corridors</span>
        </nav>

        {/* Hero Header */}
        <div className="text-center max-w-4xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-900 text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider border border-blue-200">
            <PlaneIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>24/7 STL Airport, Spirit FBO &amp; West County Coverage</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-950 tracking-tight">
            Pre-Quoted St. Louis Airport &amp; West County Corridors
          </h1>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-3xl mx-auto">
            Transparent upfront taxi, executive sedan, and 6-passenger SUV rates with live STL
            flight tracking, private FBO ramp coordination, and zero rideshare surge multipliers.
          </p>

          {/* Trust Bar */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-xs font-semibold text-slate-700">
            <span className="inline-flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-2xs">
              <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
              Upfront Locked Quotes
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-2xs">
              <PlaneIcon className="w-3.5 h-3.5 text-blue-600" />
              STL Terminal 1 &amp; 2 + Spirit (SUS) FBOs
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-2xs">
              <ShieldCheckIcon className="w-3.5 h-3.5 text-blue-600" />
              Licensed &amp; Insured Local Fleet
            </span>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div
          role="tablist"
          aria-label="Filter service corridors"
          className="flex flex-wrap items-center justify-center gap-2.5"
        >
          {filterOptions.map((pill) => {
            const isSelected = activeFilter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setActiveFilter(pill.key)}
                className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:text-blue-700'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Corridor Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {filteredSummaries.map(({ corridor, startingFareWholeDollars, defaultBookUrl }) => {
            const badge = getCategoryBadgeMeta(corridor.category);
            return (
              <Card
                key={corridor.slug}
                variant="elevated"
                className="bg-white border border-slate-200/90 hover:border-blue-400/90 rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-all shadow-xs"
              >
                <div className="space-y-4">
                  {/* Top Badge + Live Starting Fare */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full border ${badge.className}`}
                      >
                        {badge.icon}
                        <span>{badge.label}</span>
                      </span>
                      {corridor.featured && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          <SparklesIcon className="w-3 h-3 text-amber-600" />
                          <span>Featured</span>
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Upfront From
                      </span>
                      <span className="text-2xl font-extrabold text-slate-950 tracking-tight">
                        ${startingFareWholeDollars}
                      </span>
                    </div>
                  </div>

                  {/* Title & Subheadline */}
                  <div>
                    <h2 className="text-xl sm:text-2xl font-extrabold text-slate-950 tracking-tight">
                      <Link
                        to={`/service-areas/${corridor.slug}`}
                        className="hover:text-blue-600 transition-colors"
                      >
                        {corridor.shortTitle}
                      </Link>
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
                      {corridor.heroSubheadline}
                    </p>
                  </div>

                  {/* Distance / Travel Time / ZIPs */}
                  <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs">
                    <div className="flex items-center gap-2 text-slate-700">
                      <MapPinIcon className="w-4 h-4 text-blue-600 shrink-0" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Corridor Distance
                        </span>
                        <span className="font-bold text-slate-900">
                          {corridor.distanceMiles} miles
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <ClockIcon className="w-4 h-4 text-blue-600 shrink-0" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Typical Travel Time
                        </span>
                        <span className="font-bold text-slate-900">
                          ~{corridor.typicalDurationMinutes} mins
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Landmarks & ZIP Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {corridor.zipCodes.slice(0, 4).map((zip) => (
                      <span
                        key={zip}
                        className="font-mono text-[11px] font-semibold bg-blue-50/80 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md"
                      >
                        ZIP {zip}
                      </span>
                    ))}
                    {corridor.landmarks.slice(0, 2).map((lm) => (
                      <span
                        key={lm}
                        className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-md truncate max-w-[220px]"
                      >
                        {lm}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Dual CTAs */}
                <div className="pt-5 mt-6 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <Link
                    to={`/service-areas/${corridor.slug}`}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 hover:border-slate-900 bg-white text-slate-800 hover:text-slate-950 text-xs font-bold transition-colors"
                  >
                    <span>View Corridor &amp; Terminal Guide</span>
                  </Link>
                  <Link
                    to={defaultBookUrl}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition-colors shadow-xs"
                  >
                    <span>Book Instant Quote &rarr;</span>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Bottom 24/7 Dispatch Callout */}
        <div className="rounded-3xl bg-slate-950 text-white p-7 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md">
          <div className="space-y-1.5 text-center md:text-left max-w-2xl">
            <h2 className="text-2xl font-extrabold tracking-tight">
              Need an immediate pickup, multi-stop itinerary, or corporate account?
            </h2>
            <p className="text-sm text-slate-300">
              {companyName} dispatches 24/7 across St. Louis County, St. Charles, and Metro East
              airports. Book online in 60 seconds or call live dispatch.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 shrink-0">
            <a
              href={`tel:${phoneRaw}`}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-sm px-5 py-3 rounded-xl transition-colors"
            >
              <PhoneIcon className="w-4 h-4 text-blue-400" />
              <span>{phoneDisplay}</span>
            </a>
            <Link
              to="/book"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm px-6 py-3 rounded-xl transition-colors"
            >
              <span>Custom Route Quote &rarr;</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
