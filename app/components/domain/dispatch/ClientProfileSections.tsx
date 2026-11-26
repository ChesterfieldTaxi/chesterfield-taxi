import React, { useEffect, useRef, useState } from 'react';
import { getContactService } from '../../../core/services/customer/contact.service';
import type { DriverRosterItem } from '../../../core/services/operator.service';
import { getWorkspaceBus } from '../../../core/services/workspace-bus.service';
import type { Trip } from '../../../core/types/trip';
import { LocationAutocomplete, type PlaceSelectedDetails } from '../LocationAutocomplete';
import { MapPinIcon, XIcon } from '../../ui/Icons';
import { Select } from '../../ui/Select';
import type { ClientQuickPlaceItem } from './client-profile-workflows.util';
import { DispatchStatusBadge } from './queue/DispatchStatusBadge';

export const SAVE_PLACE_CATEGORY_OPTIONS = [
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'airport', label: 'Airport' },
  { value: 'medical', label: 'Medical' },
  { value: 'favorite', label: 'Favorite' },
] as const;

type SavePlaceCategory = (typeof SAVE_PLACE_CATEGORY_OPTIONS)[number]['value'];

export function formatUpcomingPickupLabel(trip: Trip): string {
  if (trip.bookingType === 'asap' || !trip.scheduledPickupTime) return 'ASAP';
  const d = new Date(trip.scheduledPickupTime);
  if (Number.isNaN(d.getTime())) return 'ASAP';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function resolveDriverBadgeLabel(trip: Trip, drivers?: DriverRosterItem[]): string | null {
  const id = trip.assignedDriverId || trip.plannedDriverId;
  if (!id) return null;
  const d = drivers?.find((x) => x.id === id);
  const who = d ? (d.cabNumber ? `#${d.cabNumber}` : d.name) : 'Driver';
  return trip.assignedDriverId ? who : `${who} (staged)`;
}

export interface ClientUpcomingRidesStripProps {
  trips: ReadonlyArray<Trip>;
  nowMs?: number;
  drivers?: DriverRosterItem[];
  onOpenTripDetails?: (trip: Trip) => void;
  onEditTrip?: (trip: Trip) => void;
  onFocusTripOnMap?: (trip: Trip) => void;
}

export function ClientUpcomingRidesStrip({
  trips,
  nowMs,
  drivers,
  onOpenTripDetails,
  onEditTrip,
  onFocusTripOnMap,
}: ClientUpcomingRidesStripProps) {
  if (trips.length === 0) return null;
  return (
    <div className="rounded-xl border border-status-staged-border bg-status-staged-bg/60 overflow-hidden shadow-2xs">
      <div className="px-2.5 py-1.5 bg-indigo-600 text-white text-[10.5px] font-extrabold uppercase tracking-wider">
        Active &amp; Upcoming Rides ({trips.length})
      </div>
      <div className="divide-y divide-indigo-100 bg-surface-card">
        {trips.map((trip) => {
          const shortId = trip.id.slice(-6).toUpperCase();
          const driverLabel = resolveDriverBadgeLabel(trip, drivers);
          return (
            <div key={trip.id} className="p-2 flex items-center justify-between gap-2 hover:bg-status-staged-bg/50">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <DispatchStatusBadge compact status={trip.status} trip={trip} nowMs={nowMs} />
                  <button
                    type="button"
                    data-open-trip-details={trip.id}
                    onClick={() => {
                      getWorkspaceBus().publish('OPEN_TRIP_DETAILS', { tripId: trip.id, initialTab: 'details' });
                      onOpenTripDetails?.(trip);
                    }}
                    className="font-mono font-bold text-[10.5px] text-status-info-fg hover:underline cursor-pointer"
                    title="Open Trip Details & Audit"
                  >
                    #{shortId}
                  </button>
                  <span className="font-bold text-fg-strong text-[11px]">{formatUpcomingPickupLabel(trip)}</span>
                  {driverLabel && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-surface-muted text-fg-secondary border border-border-subtle">
                      {driverLabel}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-fg-secondary truncate">
                  {trip.pickupLocation?.address || 'Pickup'} &rarr; {trip.dropoffLocation?.address || 'Dropoff'}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                {onEditTrip && (
                  <button
                    type="button"
                    onClick={() => onEditTrip(trip)}
                    className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10.5px] cursor-pointer active:scale-95"
                    title="Open this ride in the Edit sidebar"
                  >
                    Edit
                  </button>
                )}
                {onFocusTripOnMap && (
                  <button
                    type="button"
                    onClick={() => onFocusTripOnMap(trip)}
                    className="px-2 py-1 rounded-md bg-surface-card hover:bg-status-staged-bg text-status-staged-fg font-bold text-[10.5px] border border-status-staged-border cursor-pointer active:scale-95"
                    title="Focus this ride on the Dispatch map"
                  >
                    Map
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function placeBadge(place: ClientQuickPlaceItem): { text: string; cls: string } {
  if (place.source === 'frequent') return { text: `Frequent ×${place.tripCount || 1}`, cls: 'bg-status-staged-bg-strong text-status-staged-fg border-status-staged-border' };
  if (place.source === 'corporate') return { text: 'Company', cls: 'bg-status-staged-bg-strong text-status-staged-fg border-status-staged-border' };
  if (place.category === 'work') return { text: 'Work', cls: 'bg-status-info-bg-strong text-status-info-fg border-status-info-border' };
  if (place.category === 'home') return { text: 'Home', cls: 'bg-status-success-bg-strong text-status-success-fg border-status-success-border' };
  return { text: place.category.charAt(0).toUpperCase() + place.category.slice(1), cls: 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border' };
}

export interface ClientSavedPlacesSectionProps {
  places: ReadonlyArray<ClientQuickPlaceItem>;
  contactId?: string;
  identity: { phone?: string; email?: string; name?: string };
  onSetEndpoint?: (place: ClientQuickPlaceItem, endpoint: 'pickup' | 'dropoff') => void;
}

export function ClientSavedPlacesSection({ places, contactId, identity, onSetEndpoint }: ClientSavedPlacesSectionProps) {
  const [applied, setApplied] = useState<{ id: string; endpoint: 'pickup' | 'dropoff' } | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [category, setCategory] = useState<SavePlaceCategory>('favorite');
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [details, setDetails] = useState<PlaceSelectedDetails | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const apply = (place: ClientQuickPlaceItem, endpoint: 'pickup' | 'dropoff') => {
    if (!onSetEndpoint) return;
    onSetEndpoint(place, endpoint);
    setApplied({ id: place.id, endpoint });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setApplied(null), 1500);
  };

  const canSave = address.trim().length > 3;
  const handleSave = () => {
    if (!canSave) return;
    getContactService().saveContactPlace(
      { contactId, ...identity },
      {
        label: label.trim() || SAVE_PLACE_CATEGORY_OPTIONS.find((o) => o.value === category)?.label || 'Place',
        category,
        address: (details?.formattedAddress || details?.address || address).trim(),
        coordinates: details?.coordinates ? { lat: details.coordinates.lat, lng: details.coordinates.lng } : undefined,
      }
    );
    setLabel(''); setAddress(''); setDetails(null); setIsFormOpen(false);
  };

  const actionBtn = (place: ClientQuickPlaceItem, endpoint: 'pickup' | 'dropoff') => {
    const done = applied?.id === place.id && applied.endpoint === endpoint;
    const title = endpoint === 'pickup' ? 'Pickup' : 'Dropoff';
    return (
      <button
        type="button"
        onClick={() => apply(place, endpoint)}
        className={`px-1.5 py-1 rounded-md font-bold text-[10px] border cursor-pointer active:scale-95 transition-colors ${
          done ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-surface-card hover:bg-status-info-bg text-status-info-fg border-status-info-border'
        }`}
      >
        {done ? `✓ ${title}` : `Set ${title}`}
      </button>
    );
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-fg-muted">Saved &amp; Frequent Places</span>
        <button
          type="button"
          onClick={() => setIsFormOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-card hover:bg-status-info-bg text-status-info-fg font-bold text-[10.5px] border border-status-info-border cursor-pointer"
        >
          <span>+ Save Place</span>
        </button>
      </div>

      {isFormOpen && (
        <div className="p-2 rounded-xl bg-surface-card border border-status-info-border space-y-1.5 shadow-2xs">
          <div className="flex items-center gap-1.5">
            <div className="w-28 shrink-0">
              <Select size="xs" value={category} options={SAVE_PLACE_CATEGORY_OPTIONS} onValueChange={(v) => setCategory(v as SavePlaceCategory)} />
            </div>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Custom label (optional)"
              className="flex-1 min-w-0 px-2 py-1 rounded-md border border-border-subtle text-[11px]"
            />
          </div>
          <LocationAutocomplete
            value={address}
            onChange={(v) => { setAddress(v); setDetails(null); }}
            onPlaceSelected={(d) => { setDetails(d); setAddress(d.formattedAddress || d.address); }}
            placeholder="Search address, venue, or airport..."
          />
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setIsFormOpen(false)} className="px-2 py-1 rounded-md text-fg-secondary hover:bg-surface-muted font-bold text-[10.5px] cursor-pointer">Cancel</button>
            <button
              type="button"
              disabled={!canSave}
              onClick={handleSave}
              className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-[10.5px] cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {places.length === 0 ? (
        <div className="p-3 text-center bg-surface-card rounded-xl border border-border-subtle text-fg-subtle font-medium">
          No saved or frequent places yet.
        </div>
      ) : (
        <div className="divide-y divide-border-faint bg-surface-card rounded-xl border border-border-subtle/90 overflow-hidden shadow-2xs">
          {places.map((place) => {
            const badge = placeBadge(place);
            return (
              <div key={place.id} className="p-2 flex items-center justify-between gap-2 hover:bg-surface-subtle/90">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded-full text-[9.5px] font-extrabold border ${badge.cls}`}>{badge.text}</span>
                    <span className="font-bold text-fg-strong text-[11px] truncate">{place.label}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-fg-secondary truncate">
                    <MapPinIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span className="truncate">{place.address}</span>
                  </div>
                  {place.notes && <div className="text-[10.5px] text-status-warning-fg truncate">{place.notes}</div>}
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {onSetEndpoint && actionBtn(place, 'pickup')}
                  {onSetEndpoint && actionBtn(place, 'dropoff')}
                  {place.removable && contactId && (
                    <button
                      type="button"
                      onClick={() => getContactService().removeContactPlace(contactId, place.id)}
                      className="p-1 rounded-md text-fg-subtle hover:text-rose-600 hover:bg-status-danger-bg cursor-pointer"
                      title="Remove saved place"
                      aria-label="Remove saved place"
                    >
                      <XIcon className="w-3 h-3" />
                      <span className="sr-only">✕</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
