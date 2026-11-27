import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getContactService } from '../../../core/services/customer/contact.service';
import type { DriverRosterItem } from '../../../core/services/operator.service';
import { getWorkspaceBus } from '../../../core/services/workspace-bus.service';
import type { CorporateAccountConfig, FleetCarConfig, VehicleTierConfig } from '../../../core/types/config';
import type { Trip } from '../../../core/types/trip';
import { formatTripVehicleColumnDisplay } from '../../../core/utils/vehicle-tier-format.util';
import { FloatingWindow } from '../../ui/FloatingWindow';
import { CarIcon, CopyIcon, MapPinIcon, PencilIcon, UserIcon } from '../../ui/Icons';
import {
  CLIENT_TRIPS_PAGE_SIZE,
  buildNewTabValuesFromClientTrip,
  paginateClientTrips,
  resolveClientProfileData,
  shouldAutoOpenClientProfileOnCall,
} from './client-trip-history.util';
import {
  buildPopulateDraftPayloadFromClientPlace,
  buildReturnTabValuesFromClientTrip,
  partitionClientActiveUpcomingAndPastTrips,
  resolveClientSavedAndFrequentPlaces,
  type ClientPopulatePayload,
  type ClientQuickPlaceItem,
} from './client-profile-workflows.util';
import { ClientProfileEditTab } from './ClientProfileEditTab';
import { ClientProfileHeaderCard } from './ClientProfileHeaderCard';
import { ClientSavedPlacesSection, ClientUpcomingRidesStrip } from './ClientProfileSections';
import type { DispatchFormValues } from './DispatchBookingEngine';
import { DispatchStatusBadge } from './queue/DispatchStatusBadge';

export {
  CLIENT_TRIPS_PAGE_SIZE,
  buildNewTabValuesFromClientTrip,
  paginateClientTrips,
  resolveClientProfileData,
  shouldAutoOpenClientProfileOnCall,
};

export type ClientProfileTab = 'trips' | 'places' | 'profile';
export type LegacyClientProfileTab = ClientProfileTab | 'overview' | 'edit' | 'contact';

export function normalizeClientProfileTab(tab?: LegacyClientProfileTab | null): ClientProfileTab {
  if (tab === 'edit' || tab === 'contact' || tab === 'profile') return 'profile';
  if (tab === 'places') return 'places';
  return 'trips';
}

export interface ClientProfileTarget {
  phone?: string;
  email?: string;
  name?: string;
}

export interface ClientProfileWindowProps {
  trips: Trip[];
  vehicles?: VehicleTierConfig[];
  drivers?: DriverRosterItem[];
  fleetCars?: FleetCarConfig[];
  corporateAccounts?: ReadonlyArray<CorporateAccountConfig>;
  nowMs?: number;
  initialOpen?: boolean;
  initialTarget?: ClientProfileTarget | null;
  initialTab?: LegacyClientProfileTab;
  onLoadTripIntoNewTab: (values: DispatchFormValues, trip: Trip) => void;
  onOpenTripDetails?: (trip: Trip) => void;
  onEditTrip?: (trip: Trip) => void;
  onFocusTripOnMap?: (trip: Trip) => void;
  onPopulateBookingDraft?: (payload: ClientPopulatePayload) => void;
  onCallClient?: (phone: string, name?: string) => void;
}

function formatCompactTripDate(trip: Trip): string {
  const iso = trip.scheduledPickupTime || trip.createdAt;
  if (!iso) return 'ASAP';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'ASAP';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ClientProfileWindow({
  trips, vehicles, drivers, fleetCars, corporateAccounts, nowMs,
  initialOpen = false, initialTarget = null, initialTab = 'trips',
  onLoadTripIntoNewTab, onOpenTripDetails, onEditTrip, onFocusTripOnMap, onPopulateBookingDraft, onCallClient,
}: ClientProfileWindowProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [target, setTarget] = useState<ClientProfileTarget | null>(initialTarget);
  const [activeTab, setActiveTab] = useState<ClientProfileTab>(() => normalizeClientProfileTab(initialTab));
  const [visibleCount, setVisibleCount] = useState<number>(CLIENT_TRIPS_PAGE_SIZE);
  const [contactsVersion, setContactsVersion] = useState(0);

  const seenCallKeysRef = useRef<Set<string>>(new Set());
  const tripsRef = useRef(trips);
  tripsRef.current = trips;

  useEffect(() => getContactService().subscribe(() => setContactsVersion((v) => v + 1)), []);

  useEffect(() => {
    const bus = getWorkspaceBus();
    return bus.subscribe((msg) => {
      if (msg.type === 'OPEN_CLIENT_PROFILE') {
        const p = msg.payload;
        if (p.source === 'incoming_call' || p.source === 'answered_call' || p.source === 'outbound_call') return;
        setTarget({ phone: p.phone, email: p.email, name: p.name });
        setActiveTab(normalizeClientProfileTab(p.initialTab));
        setVisibleCount(CLIENT_TRIPS_PAGE_SIZE);
        setIsOpen(true);
      }
    });
  }, []);

  const contacts = useMemo(() => getContactService().getAllContacts(), [contactsVersion, isOpen]);
  const profile = useMemo(
    () => resolveClientProfileData({ phone: target?.phone, email: target?.email, name: target?.name, contacts, trips }),
    [target, contacts, trips]
  );
  const { activeUpcomingTrips, pastTrips } = useMemo(
    () => partitionClientActiveUpcomingAndPastTrips(profile.sortedTrips, nowMs),
    [profile.sortedTrips, nowMs]
  );
  const page = useMemo(() => paginateClientTrips(pastTrips, visibleCount), [pastTrips, visibleCount]);
  const places = useMemo(
    () => resolveClientSavedAndFrequentPlaces({ contact: profile.contact, corporateAccounts, corporateAccountName: profile.corporateAccountName, sortedTrips: profile.sortedTrips }),
    [profile.contact, profile.corporateAccountName, profile.sortedTrips, corporateAccounts]
  );

  const handleSetPlaceEndpoint = (place: ClientQuickPlaceItem, endpoint: 'pickup' | 'dropoff') => {
    const payload = buildPopulateDraftPayloadFromClientPlace(place, endpoint, profile);
    getWorkspaceBus().publish('POPULATE_BOOKING', payload);
    onPopulateBookingDraft?.(payload);
  };

  const openTripDetails = (trip: Trip) => {
    getWorkspaceBus().publish('OPEN_TRIP_DETAILS', { tripId: trip.id, initialTab: 'details' });
    onOpenTripDetails?.(trip);
  };

  return (
    <FloatingWindow
      id="client_profile"
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={profile.displayName || 'Client Profile'}
      subtitle={[profile.displayPhone, profile.displayEmail].filter(Boolean).join(' · ') || 'Passenger CRM & Trip History'}
      icon={<UserIcon className="w-4 h-4" />}
      initialSize={{ width: 540, height: 520 }}
      minWidth={400}
      minHeight={340}
      zIndex={220}
    >
      <div className="p-3 space-y-2.5 text-xs">
        <ClientProfileHeaderCard profile={profile} onCallClient={onCallClient} />

        <div data-client-profile-tabs="v2.1" className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-emphasis/75 border border-border-subtle">
          {([
            { id: 'trips' as const, label: 'Trips', count: profile.sortedTrips.length, icon: <CarIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" /> },
            { id: 'places' as const, label: 'Places', count: places.length, icon: <MapPinIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> },
            { id: 'profile' as const, label: 'Profile', count: null, icon: <PencilIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" /> },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === tab.id ? 'bg-surface-card text-fg-primary shadow-2xs ring-1 ring-border-subtle/80' : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count !== null && tab.count > 0 && (
                <span className="px-1.5 rounded-full bg-surface-muted text-fg-secondary text-[9.5px] font-bold">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'profile' ? (
          <ClientProfileEditTab
            profile={profile}
            drivers={drivers}
            vehicles={vehicles}
            corporateAccounts={corporateAccounts}
            onSaved={(saved) => setTarget({ phone: saved.phone, email: saved.email, name: saved.name })}
            onCancel={() => setActiveTab('trips')}
          />
        ) : activeTab === 'places' ? (
          <ClientSavedPlacesSection
            key={profile.contact?.id || profile.rawPhone || profile.displayEmail || 'client'}
            places={places}
            contactId={profile.contact?.id}
            identity={{ phone: profile.rawPhone, email: profile.displayEmail, name: profile.displayName }}
            onSetEndpoint={handleSetPlaceEndpoint}
          />
        ) : (
          <div className="space-y-2.5">
            <ClientUpcomingRidesStrip
              trips={activeUpcomingTrips}
              allTrips={trips}
              nowMs={nowMs}
              drivers={drivers}
              onOpenTripDetails={openTripDetails}
              onEditTrip={onEditTrip}
              onFocusTripOnMap={onFocusTripOnMap}
              onBookReturn={(trip) =>
                onLoadTripIntoNewTab(
                  buildReturnTabValuesFromClientTrip(trip, nowMs, { linkToSourceTrip: true }),
                  trip
                )
              }
            />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-fg-muted">
                  Recent Trips ({page.visibleTrips.length} of {pastTrips.length})
                </span>
              </div>

              {page.visibleTrips.length === 0 ? (
                <div className="p-6 text-center bg-surface-card rounded-xl border border-border-subtle text-fg-subtle font-medium">
                  No historical trips recorded for this client yet.
                </div>
              ) : (
                <div className="divide-y divide-border-faint bg-surface-card rounded-xl border border-border-subtle/90 overflow-hidden shadow-2xs">
                  {page.visibleTrips.map((trip) => {
                    const vehicleLabel = formatTripVehicleColumnDisplay(trip, vehicles, drivers, fleetCars);
                    const fare = Number(trip.pricing?.totalFare || 0).toFixed(2);
                    const shortId = trip.id.slice(-6).toUpperCase();

                    return (
                      <div key={trip.id} className="p-2.5 hover:bg-surface-subtle/90 transition-colors flex items-center justify-between gap-2.5">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <DispatchStatusBadge status={trip.status} trip={trip} nowMs={nowMs} compact />
                            <button
                              type="button"
                              data-open-trip-details={trip.id}
                              onClick={() => openTripDetails(trip)}
                              className="font-mono font-bold text-[10.5px] text-status-info-fg hover:underline cursor-pointer"
                              title="Open Trip Details & Audit"
                            >
                              #{shortId}
                            </button>
                            <span className="font-bold text-fg-strong text-[11px]">{formatCompactTripDate(trip)}</span>
                            <span className="text-[10.5px] font-semibold text-fg-muted">· {vehicleLabel}</span>
                            <span className="font-mono font-extrabold text-fg-primary text-[11px]">· ${fare}</span>
                          </div>

                          <div className="flex items-center gap-1 text-[11px] text-fg-secondary truncate">
                            <MapPinIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span className="truncate">
                              {trip.pickupLocation?.address || 'Pickup'} &rarr; {trip.dropoffLocation?.address || 'Dropoff'}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 flex flex-col items-stretch gap-1">
                          <button
                            type="button"
                            onClick={() => onLoadTripIntoNewTab(buildNewTabValuesFromClientTrip(trip, nowMs), trip)}
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10.5px] shadow-2xs transition-colors cursor-pointer active:scale-95"
                            title="Open a new booking draft tab pre-populated from this trip"
                          >
                            <CopyIcon className="w-3 h-3 shrink-0" />
                            <span>Load into New Tab</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onLoadTripIntoNewTab(buildReturnTabValuesFromClientTrip(trip, nowMs), trip)}
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-surface-card hover:bg-status-info-bg text-status-info-fg font-bold text-[10.5px] border border-status-info-border transition-colors cursor-pointer active:scale-95"
                            title="Open a new draft with the route reversed (pickup ⇄ dropoff)"
                          >
                            <span>⇄ Book Return</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {page.hasMore && (
                <button
                  type="button"
                  onClick={() => setVisibleCount(page.nextVisibleCount)}
                  className="w-full py-2 rounded-xl bg-surface-card hover:bg-status-info-bg text-status-info-fg font-extrabold text-xs border border-status-info-border shadow-2xs transition-colors cursor-pointer"
                >
                  Load More Trips (+{Math.min(CLIENT_TRIPS_PAGE_SIZE, page.remainingCount)})
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </FloatingWindow>
  );
}
