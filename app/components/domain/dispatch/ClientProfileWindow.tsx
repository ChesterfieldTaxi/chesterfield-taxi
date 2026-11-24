import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getContactService } from '../../../core/services/customer/contact.service';
import type { DriverRosterItem } from '../../../core/services/operator.service';
import { getWorkspaceBus } from '../../../core/services/workspace-bus.service';
import type { FleetCarConfig, VehicleTierConfig } from '../../../core/types/config';
import type { Trip } from '../../../core/types/trip';
import { formatTripVehicleColumnDisplay } from '../../../core/utils/vehicle-tier-format.util';
import { FloatingWindow } from '../../ui/FloatingWindow';
import {
  BuildingIcon,
  CopyIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  ShieldCheckIcon,
  UserIcon,
} from '../../ui/Icons';
import {
  CLIENT_TRIPS_PAGE_SIZE,
  buildNewTabValuesFromClientTrip,
  paginateClientTrips,
  resolveClientProfileData,
  shouldAutoOpenClientProfileOnCall,
} from './client-trip-history.util';
import type { DispatchFormValues } from './DispatchBookingEngine';
import { DispatchStatusBadge } from './queue/DispatchStatusBadge';

export {
  CLIENT_TRIPS_PAGE_SIZE,
  buildNewTabValuesFromClientTrip,
  paginateClientTrips,
  resolveClientProfileData,
  shouldAutoOpenClientProfileOnCall,
};

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
  nowMs?: number;
  onLoadTripIntoNewTab: (values: DispatchFormValues, trip: Trip) => void;
  onOpenTripDetails?: (trip: Trip) => void;
  onCallClient?: (phone: string, name?: string) => void;
}

function formatCompactTripDate(trip: Trip): string {
  const iso = trip.scheduledPickupTime || trip.createdAt;
  if (!iso) return 'ASAP';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'ASAP';
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ClientProfileWindow({
  trips,
  vehicles,
  drivers,
  fleetCars,
  nowMs,
  onLoadTripIntoNewTab,
  onOpenTripDetails,
  onCallClient,
}: ClientProfileWindowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<ClientProfileTarget | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(CLIENT_TRIPS_PAGE_SIZE);
  const [contactsVersion, setContactsVersion] = useState(0);

  const seenCallKeysRef = useRef<Set<string>>(new Set());
  const tripsRef = useRef(trips);
  tripsRef.current = trips;

  useEffect(() => {
    return getContactService().subscribe(() => setContactsVersion((v) => v + 1));
  }, []);

  // Auto-open on incoming/answered calls from existing clients + explicit 1-click OPEN_CLIENT_PROFILE requests
  useEffect(() => {
    const bus = getWorkspaceBus();
    return bus.subscribe((msg) => {
      if (msg.type === 'OPEN_CLIENT_PROFILE') {
        const p = msg.payload;
        if (p.source === 'incoming_call' || p.source === 'answered_call' || p.source === 'outbound_call') {
          const check = shouldAutoOpenClientProfileOnCall({
            phone: p.phone,
            callSid: p.callSid,
            seenCallKeys: seenCallKeysRef.current,
            contacts: getContactService().getAllContacts(),
            trips: tripsRef.current,
          });
          if (!check.shouldOpen) return;
        }
        setTarget({ phone: p.phone, email: p.email, name: p.name });
        setVisibleCount(CLIENT_TRIPS_PAGE_SIZE);
        setIsOpen(true);
      } else if (
        msg.type === 'INCOMING_CALL' ||
        msg.type === 'CALL_INCOMING' ||
        msg.type === 'CALL_ANSWERED'
      ) {
        const callerPhone =
          msg.type === 'INCOMING_CALL' ? msg.payload?.from : msg.payload?.callerNumber;
        const callSid = msg.payload?.callSid;
        const check = shouldAutoOpenClientProfileOnCall({
          phone: callerPhone,
          callSid,
          seenCallKeys: seenCallKeysRef.current,
          contacts: getContactService().getAllContacts(),
          trips: tripsRef.current,
        });
        if (check.shouldOpen) {
          setTarget({
            phone: callerPhone,
            name: check.profile?.displayName,
            email: check.profile?.displayEmail,
          });
          setVisibleCount(CLIENT_TRIPS_PAGE_SIZE);
          setIsOpen(true);
        }
      } else if (msg.type === 'CALL_ENDED') {
        // Always reset (even with callSid) so a repeat call later in the shift re-opens the profile.
        // INCOMING_CALL_DISMISSED intentionally does NOT clear: accept emits it right before CALL_ANSWERED.
        seenCallKeysRef.current.clear();
      }
    });
  }, []);

  const contacts = useMemo(() => getContactService().getAllContacts(), [contactsVersion, isOpen]);

  const profile = useMemo(
    () =>
      resolveClientProfileData({
        phone: target?.phone,
        email: target?.email,
        name: target?.name,
        contacts,
        trips,
      }),
    [target, contacts, trips]
  );

  const page = useMemo(
    () => paginateClientTrips(profile.sortedTrips, visibleCount),
    [profile.sortedTrips, visibleCount]
  );

  return (
    <FloatingWindow
      id="client_profile"
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={profile.displayName || 'Client Profile'}
      subtitle={
        [profile.displayPhone, profile.displayEmail].filter(Boolean).join(' · ') ||
        'Passenger CRM & Trip History'
      }
      icon={<UserIcon className="w-4 h-4" />}
      initialSize={{ width: 540, height: 520 }}
      minWidth={400}
      minHeight={340}
      zIndex={220}
    >
      <div className="p-3 space-y-3 text-xs">
        {/* CRM Badges & Metrics Card */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {profile.isVip && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                  ★ VIP Client
                </span>
              )}
              {profile.isBlacklisted && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                  DO NOT DISPATCH
                </span>
              )}
              {profile.corporateAccountName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                  <BuildingIcon className="w-3 h-3 shrink-0" />
                  <span>{profile.corporateAccountName}</span>
                </span>
              )}
              {profile.customerScore !== null && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <ShieldCheckIcon className="w-3 h-3 shrink-0" />
                  <span>Score {profile.customerScore}</span>
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-800 border border-slate-200">
                {profile.totalTrips} {profile.totalTrips === 1 ? 'Trip' : 'Trips'} · $
                {profile.totalSpend.toFixed(2)} Spend
              </span>
            </div>

            {profile.rawPhone && onCallClient && (
              <button
                type="button"
                onClick={() => onCallClient(profile.rawPhone, profile.displayName)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] border border-blue-200 cursor-pointer"
              >
                <PhoneIcon className="w-3 h-3" />
                <span>Call</span>
              </button>
            )}
          </div>

          {(profile.displayPhone || profile.displayEmail) && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
              {profile.displayPhone && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <PhoneIcon className="w-3 h-3 text-slate-400" />
                  {profile.displayPhone}
                </span>
              )}
              {profile.displayEmail && (
                <span className="inline-flex items-center gap-1">
                  <MailIcon className="w-3 h-3 text-slate-400" />
                  {profile.displayEmail}
                </span>
              )}
            </div>
          )}

          {profile.dispatcherNotes && (
            <div className="p-2 rounded-lg bg-amber-50/80 border border-amber-200 text-[11px] text-amber-950">
              <strong className="font-extrabold uppercase text-[9.5px] tracking-wider text-amber-800 block mb-0.5">
                Dispatcher Notes
              </strong>
              <span>{profile.dispatcherNotes}</span>
            </div>
          )}
        </div>

        {/* Trip History Section */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
              Recent Trips ({page.visibleTrips.length} of {profile.sortedTrips.length})
            </span>
          </div>

          {page.visibleTrips.length === 0 ? (
            <div className="p-6 text-center bg-white rounded-xl border border-slate-200 text-slate-400 font-medium">
              No historical trips recorded for this client yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-2xs">
              {page.visibleTrips.map((trip) => {
                const vehicleLabel = formatTripVehicleColumnDisplay(
                  trip,
                  vehicles,
                  drivers,
                  fleetCars
                );
                const fare = Number(trip.pricing?.totalFare || 0).toFixed(2);
                const shortId = trip.id.slice(-6).toUpperCase();

                return (
                  <div
                    key={trip.id}
                    className="p-2.5 hover:bg-slate-50/90 transition-colors flex items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <DispatchStatusBadge
                          status={trip.status}
                          trip={trip}
                          nowMs={nowMs}
                          compact
                        />
                        {onOpenTripDetails ? (
                          <button
                            type="button"
                            onClick={() => onOpenTripDetails(trip)}
                            className="font-mono font-bold text-[10.5px] text-blue-600 hover:underline cursor-pointer"
                            title="Open Trip Details & Audit"
                          >
                            #{shortId}
                          </button>
                        ) : (
                          <span className="font-mono font-bold text-[10.5px] text-slate-500">
                            #{shortId}
                          </span>
                        )}
                        <span className="font-bold text-slate-800 text-[11px]">
                          {formatCompactTripDate(trip)}
                        </span>
                        <span className="text-[10.5px] font-semibold text-slate-500">
                          · {vehicleLabel}
                        </span>
                        <span className="font-mono font-extrabold text-slate-900 text-[11px]">
                          · ${fare}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-slate-600 truncate">
                        <MapPinIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate">
                          {trip.pickupLocation?.address || 'Pickup'} &rarr;{' '}
                          {trip.dropoffLocation?.address || 'Dropoff'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const cloned = buildNewTabValuesFromClientTrip(trip);
                        onLoadTripIntoNewTab(cloned, trip);
                      }}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10.5px] shadow-2xs transition-colors cursor-pointer active:scale-95"
                      title="Open a new booking draft tab pre-populated from this trip"
                    >
                      <CopyIcon className="w-3 h-3 shrink-0" />
                      <span>Load into New Tab</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {page.hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount(page.nextVisibleCount)}
              className="w-full py-2 rounded-xl bg-white hover:bg-blue-50 text-blue-700 font-extrabold text-xs border border-blue-200 shadow-2xs transition-colors cursor-pointer"
            >
              Load More Trips (+{Math.min(CLIENT_TRIPS_PAGE_SIZE, page.remainingCount)})
            </button>
          )}
        </div>
      </div>
    </FloatingWindow>
  );
}
