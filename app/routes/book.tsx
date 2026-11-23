import React from 'react';
import { useLoaderData, useLocation, type LoaderFunctionArgs } from 'react-router';
import { BookingEngineV2 } from '../components/domain/BookingEngineV2';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { loadPublicSettingsForServer } from '../core/services/config/public-settings.server';
import { parseBookRouteQueryInitialValues } from '../core/services/seo';
import type { AppSettings } from '../core/types/config';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const initialValues = parseBookRouteQueryInitialValues(url.searchParams);

  try {
    const settings = await Promise.race<Partial<AppSettings> | null>([
      loadPublicSettingsForServer(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    return {
      initialSettings: settings ?? undefined,
      initialValues,
    };
  } catch {
    return {
      initialSettings: undefined,
      initialValues,
    };
  }
}

export function meta() {
  return [
    { title: `Book a Ride – ${COMPANY_CONFIG.name}` },
    {
      name: 'description',
      content:
        'Book your taxi or car in Chesterfield, MO. Upfront fare estimates, immediate pickups, or scheduled airport rides.',
    },
  ];
}

export default function BookRoute() {
  const { initialSettings, initialValues } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [isConfirmed, setIsConfirmed] = React.useState(false);

  const effectiveInitialValues = React.useMemo(
    () =>
      initialValues ??
      (location.search
        ? parseBookRouteQueryInitialValues(new URLSearchParams(location.search))
        : undefined),
    [initialValues, location.search]
  );

  const routeQueryKey = location.search || 'default';

  return (
    <div className="py-5 sm:py-8 bg-gradient-to-b from-slate-50 via-white to-blue-50/20 flex-1 pb-28 lg:pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Compact Header Bar - Hidden on Confirmation */}
        {!isConfirmed && (
          <div className="text-center mb-5 space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
              Book Your Ride
            </h1>
            <p className="text-sm text-slate-600 max-w-xl mx-auto">
              Upfront fare estimates, 24/7 local Chesterfield dispatch, and STL flight tracking.
            </p>
          </div>
        )}

        {/* Client Booking Engine */}
        <div className={isConfirmed ? '' : 'mt-4'}>
          <BookingEngineV2
            key={routeQueryKey}
            onConfirmedChange={setIsConfirmed}
            initialSettings={initialSettings}
            initialValues={effectiveInitialValues}
          />
        </div>

        {/* Live Support Footnote */}
        <div className="mt-10 text-center text-xs text-slate-500 space-y-1">
          <p>Need a pickup right away or booking for a large group?</p>
          <p className="font-semibold text-slate-700">
            Call {COMPANY_CONFIG.name} 24/7 at{' '}
            <a
              href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
              className="text-blue-600 hover:text-blue-700 underline font-bold"
            >
              {COMPANY_CONFIG.phone.dispatch}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
