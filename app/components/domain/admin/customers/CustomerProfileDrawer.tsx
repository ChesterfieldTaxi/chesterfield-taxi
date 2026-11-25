import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { getContactService } from '../../../../core/services/customer/contact.service';
import { getUniversalGovernanceService } from '../../../../core/services/governance/universal-governance.service';
import type { DriverRosterItem } from '../../../../core/services/operator.service';
import type { CorporateAccountConfig, VehicleTierConfig } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import { formatTripVehicleColumnDisplay } from '../../../../core/utils/vehicle-tier-format.util';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  AlertTriangleIcon,
  BanIcon,
  CarIcon,
  CheckIcon,
  ExternalLinkIcon,
  MapPinIcon,
  PencilIcon,
  ShieldIcon,
  TrashIcon,
} from '../../../ui/Icons';
import { ClientProfileEditTab } from '../../dispatch/ClientProfileEditTab';
import { ClientProfileHeaderCard } from '../../dispatch/ClientProfileHeaderCard';
import { ClientSavedPlacesSection, ClientUpcomingRidesStrip } from '../../dispatch/ClientProfileSections';
import {
  partitionClientActiveUpcomingAndPastTrips,
  resolveClientSavedAndFrequentPlaces,
} from '../../dispatch/client-profile-workflows.util';
import {
  CLIENT_TRIPS_PAGE_SIZE,
  paginateClientTrips,
  resolveClientProfileData,
  type ResolvedClientProfileData,
} from '../../dispatch/client-trip-history.util';
import { DispatchStatusBadge } from '../../dispatch/queue/DispatchStatusBadge';
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';
import type { CustomerProfile } from './types';

export type AdminCustomerDrawerTab = 'profile' | 'trips' | 'places' | 'governance';

export interface CustomerProfileDrawerProps {
  selectedCustomer: CustomerProfile | null;
  isEditingCustomer: boolean;
  setIsEditingCustomer: (val: boolean) => void;
  onClose: () => void;
  onCustomerSaved: (updated: CustomerProfile) => void;
  onGovernanceMutated: (updated: CustomerProfile) => void;
  onPurgeCustomer?: (cust: CustomerProfile) => Promise<void>;
  trips?: ReadonlyArray<Trip>;
  corporateAccounts?: ReadonlyArray<CorporateAccountConfig>;
  vehicles?: ReadonlyArray<VehicleTierConfig>;
  drivers?: ReadonlyArray<DriverRosterItem>;
}

function formatCompactTripDate(trip: Trip): string {
  const iso = trip.scheduledPickupTime || trip.createdAt;
  if (!iso) return 'ASAP';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'ASAP';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function CustomerProfileDrawer({
  selectedCustomer,
  isEditingCustomer: _isEditingCustomer,
  setIsEditingCustomer: _setIsEditingCustomer,
  onClose,
  onCustomerSaved,
  onGovernanceMutated,
  onPurgeCustomer,
  trips = [],
  corporateAccounts = [],
  vehicles = [],
  drivers = [],
}: CustomerProfileDrawerProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminCustomerDrawerTab>('profile');
  const [visibleCount, setVisibleCount] = useState<number>(CLIENT_TRIPS_PAGE_SIZE);
  const [contactsVersion, setContactsVersion] = useState(0);
  const [showBlacklistInput, setShowBlacklistInput] = useState(false);
  const [blacklistReasonDraft, setBlacklistReasonDraft] = useState('');
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  useEffect(() => getContactService().subscribe(() => setContactsVersion((v) => v + 1)), []);

  useEffect(() => {
    if (!selectedCustomer) return;
    setActiveTab('profile');
    setVisibleCount(CLIENT_TRIPS_PAGE_SIZE);
    setShowBlacklistInput(false);
    setBlacklistReasonDraft('');
    setConfirmPurge(false);
    setIsPurging(false);
  }, [selectedCustomer?.id]);

  const isNewClient = Boolean(selectedCustomer?.id?.startsWith('cust_new_'));
  const contacts = useMemo(
    () => getContactService().getAllContacts(),
    [contactsVersion, selectedCustomer?.id]
  );

  const profile = useMemo(
    () =>
      resolveClientProfileData({
        phone: isNewClient ? undefined : selectedCustomer?.phone,
        email: isNewClient || selectedCustomer?.email === 'N/A' ? undefined : selectedCustomer?.email,
        name: isNewClient ? undefined : selectedCustomer?.name,
        contacts,
        trips: trips as Trip[],
      }),
    [isNewClient, selectedCustomer?.phone, selectedCustomer?.email, selectedCustomer?.name, contacts, trips]
  );

  const effectiveProfile = useMemo<ResolvedClientProfileData>(() => {
    if (!selectedCustomer) return profile;
    return {
      ...profile,
      displayName: isNewClient ? 'New Client' : (selectedCustomer.name || profile.displayName),
      isVip: profile.isVip || Boolean(selectedCustomer.isVip),
      isBlacklisted: profile.isBlacklisted || Boolean(selectedCustomer.isBlacklisted),
      customerScore:
        profile.customerScore ??
        (typeof selectedCustomer.customerScore === 'number' ? selectedCustomer.customerScore : null),
      totalTrips: Math.max(profile.totalTrips, selectedCustomer.tripCount || 0),
      totalSpend: Math.max(profile.totalSpend, selectedCustomer.totalSpend || 0),
      corporateAccountName: profile.corporateAccountName || selectedCustomer.corporateAccountName || null,
    };
  }, [profile, isNewClient, selectedCustomer]);

  const { activeUpcomingTrips, pastTrips } = useMemo(
    () => partitionClientActiveUpcomingAndPastTrips(effectiveProfile.sortedTrips),
    [effectiveProfile.sortedTrips]
  );
  const page = useMemo(
    () => paginateClientTrips(pastTrips, visibleCount),
    [pastTrips, visibleCount]
  );
  const places = useMemo(
    () =>
      resolveClientSavedAndFrequentPlaces({
        contact: effectiveProfile.contact,
        corporateAccounts,
        corporateAccountName: effectiveProfile.corporateAccountName,
        sortedTrips: effectiveProfile.sortedTrips,
      }),
    [effectiveProfile.contact, effectiveProfile.corporateAccountName, effectiveProfile.sortedTrips, corporateAccounts]
  );

  if (!selectedCustomer) return null;

  const drawerTitle = isNewClient
    ? 'Add Client'
    : effectiveProfile.displayName || selectedCustomer.name || 'Client Profile';
  const drawerSubtitle = isNewClient
    ? 'Create passenger contact, driver preferences, saved cards & billing'
    : [effectiveProfile.displayPhone, effectiveProfile.displayEmail].filter(Boolean).join(' · ') ||
      'Passenger CRM & Governance';

  const driverList = drivers as DriverRosterItem[];
  const vehicleList = vehicles as VehicleTierConfig[];

  return (
    <AdminSlideOverDrawer
      isOpen={Boolean(selectedCustomer)}
      onClose={onClose}
      title={drawerTitle}
      subtitle={drawerSubtitle}
      size="lg"
      headerBadge={
        <div className="flex items-center gap-1.5">
          {effectiveProfile.isVip && (
            <Badge variant="warning" className="text-[10px] font-extrabold uppercase">
              VIP
            </Badge>
          )}
          {effectiveProfile.isBlacklisted && (
            <Badge variant="danger" className="text-[10px] font-extrabold uppercase">
              Blocked
            </Badge>
          )}
        </div>
      }
    >
      <div className="space-y-3 text-xs">
        {!isNewClient && (
          <ClientProfileHeaderCard
            profile={effectiveProfile}
            onCallClient={(phone) => {
              if (typeof window !== 'undefined') window.location.href = `tel:${phone}`;
            }}
            onOpenThread={(target) => {
              if (target.phone) {
                navigate(`/app/dispatch?phone=${encodeURIComponent(target.phone)}`);
              }
            }}
          />
        )}

        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-200/75 border border-slate-200">
          {([
            {
              id: 'profile' as const,
              label: 'Profile',
              count: null,
              icon: <PencilIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />,
            },
            {
              id: 'trips' as const,
              label: 'Trips',
              count: effectiveProfile.sortedTrips.length,
              icon: <CarIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />,
            },
            {
              id: 'places' as const,
              label: 'Places',
              count: places.length,
              icon: <MapPinIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />,
            },
            {
              id: 'governance' as const,
              label: 'Governance',
              count: null,
              icon: <ShieldIcon className="w-3.5 h-3.5 text-slate-700 shrink-0" />,
            },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count !== null && tab.count > 0 && (
                <span className="px-1.5 rounded-full bg-slate-100 text-slate-600 text-[9.5px] font-bold">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'profile' && (
          <ClientProfileEditTab
            profile={effectiveProfile}
            drivers={driverList}
            vehicles={vehicleList}
            corporateAccounts={corporateAccounts}
            onSaved={(saved) => {
              onCustomerSaved({
                ...selectedCustomer,
                id: saved.id,
                name: saved.name,
                phone: saved.phone,
                email: saved.email || 'N/A',
                corporateAccountName: saved.corporateAccountName,
                hasInvoicesOrCorporate: Boolean(
                  saved.corporateAccountName || selectedCustomer.hasInvoicesOrCorporate
                ),
                isVip: saved.isVip ?? false,
                preferredVehicle: saved.preferredVehicleTier,
                notes: saved.notes,
              });
            }}
            onCancel={() => (isNewClient ? onClose() : setActiveTab('trips'))}
          />
        )}

        {activeTab === 'trips' && (
          <div className="space-y-3">
            {(selectedCustomer.corporateAccountName || selectedCustomer.hasInvoicesOrCorporate) && (
              <div className="p-3 bg-blue-50/50 border border-blue-200/80 rounded-xl flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Corporate / Invoices</span>
                  <span className="font-bold text-slate-900 truncate block">
                    {selectedCustomer.corporateAccountName || 'Invoice History Available'}
                  </span>
                </div>
                <Link
                  to="/app/admin?tab=invoicing&sub=ledger"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 font-bold text-[11px] shrink-0"
                >
                  <span>View Invoices &rarr;</span>
                  <ExternalLinkIcon className="w-3 h-3" />
                </Link>
              </div>
            )}

            <ClientUpcomingRidesStrip trips={activeUpcomingTrips} drivers={driverList} />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                  Recent Trips ({page.visibleTrips.length} of {pastTrips.length})
                </span>
              </div>

              {page.visibleTrips.length === 0 ? (
                <div className="p-6 text-center bg-white rounded-xl border border-slate-200 text-slate-400 font-medium">
                  No historical trips recorded for this client yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-2xs">
                  {page.visibleTrips.map((trip) => {
                    const vehicleLabel = formatTripVehicleColumnDisplay(trip, vehicleList, driverList);
                    const fare = Number(trip.pricing?.totalFare || 0).toFixed(2);
                    const shortId = trip.id.slice(-6).toUpperCase();

                    return (
                      <div
                        key={trip.id}
                        className="p-2.5 hover:bg-slate-50/90 transition-colors flex items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <DispatchStatusBadge status={trip.status} trip={trip} compact />
                            <span className="font-mono font-bold text-[10.5px] text-slate-700">#{shortId}</span>
                            <span className="font-bold text-slate-800 text-[11px]">
                              {formatCompactTripDate(trip)}
                            </span>
                            <span className="text-[10.5px] font-semibold text-slate-500">· {vehicleLabel}</span>
                            <span className="font-mono font-extrabold text-slate-900 text-[11px]">· ${fare}</span>
                          </div>

                          <div className="flex items-center gap-1 text-[11px] text-slate-600 truncate">
                            <MapPinIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span className="truncate">
                              {trip.pickupLocation?.address || 'Pickup'} &rarr;{' '}
                              {trip.dropoffLocation?.address || 'Dropoff'}
                            </span>
                          </div>
                        </div>

                        <Link
                          to={`/app/dispatch?tripId=${encodeURIComponent(trip.id)}`}
                          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-blue-50 text-blue-700 font-bold text-[10.5px] border border-blue-200 transition-colors"
                          title="Open trip in Dispatch Console"
                        >
                          <span>Open in Dispatch</span>
                          <ExternalLinkIcon className="w-3 h-3 shrink-0" />
                        </Link>
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
        )}

        {activeTab === 'places' && (
          <ClientSavedPlacesSection
            key={effectiveProfile.contact?.id || effectiveProfile.rawPhone || effectiveProfile.displayEmail || 'client'}
            places={places}
            contactId={effectiveProfile.contact?.id}
            identity={{
              phone: effectiveProfile.rawPhone,
              email: effectiveProfile.displayEmail,
              name: effectiveProfile.displayName,
            }}
          />
        )}

        {activeTab === 'governance' && (
          <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <ShieldIcon className="w-4 h-4 text-slate-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">Governance</h3>
            </div>

            {selectedCustomer.isBlacklisted && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
                <div className="font-black flex items-center gap-1.5">
                  <AlertTriangleIcon className="w-3.5 h-3.5 text-rose-600" />
                  <span>BLOCKED CLIENT</span>
                </div>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  Reason: {selectedCustomer.blacklistReason || 'Blocked by Admin'}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!selectedCustomer.isBlacklisted) {
                    setShowBlacklistInput((v) => !v);
                    return;
                  }
                  const gov = getUniversalGovernanceService();
                  await gov.setBlacklistStatus('passenger', selectedCustomer.phone, false);
                  if (selectedCustomer.email && selectedCustomer.email !== 'N/A') {
                    await gov.setBlacklistStatus('passenger', selectedCustomer.email, false);
                  }
                  onGovernanceMutated({ ...selectedCustomer, isBlacklisted: false, blacklistReason: undefined });
                }}
                className={`text-xs font-bold cursor-pointer ${
                  selectedCustomer.isBlacklisted
                    ? 'text-emerald-700 border-emerald-300'
                    : 'text-rose-700 border-rose-300'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {selectedCustomer.isBlacklisted ? (
                    <CheckIcon className="w-3.5 h-3.5" />
                  ) : (
                    <BanIcon className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {selectedCustomer.isBlacklisted
                      ? 'Restore Client'
                      : showBlacklistInput
                      ? 'Cancel'
                      : 'Blacklist'}
                  </span>
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  const nextArchived = !selectedCustomer.isArchived;
                  await getUniversalGovernanceService().setArchiveStatus(
                    'passenger',
                    selectedCustomer.phone,
                    nextArchived
                  );
                  onGovernanceMutated({ ...selectedCustomer, isArchived: nextArchived });
                }}
                className="text-xs font-bold text-slate-700 border-slate-300 cursor-pointer"
              >
                {selectedCustomer.isArchived ? 'Unarchive' : 'Archive'}
              </Button>

              {selectedCustomer.isBlacklisted && onPurgeCustomer && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmPurge((v) => !v)}
                  className="text-xs font-bold text-rose-700 border-rose-300 bg-rose-50 hover:bg-rose-100 cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <TrashIcon className="w-3.5 h-3.5" />
                    <span>Purge</span>
                  </span>
                </Button>
              )}
            </div>

            {confirmPurge && selectedCustomer.isBlacklisted && onPurgeCustomer && (
              <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-2">
                <p className="text-[11px] font-semibold text-rose-800">
                  Purging removes saved contact PII and hides this passenger from the directory while keeping
                  historical trip records intact.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPurging}
                    onClick={() => setConfirmPurge(false)}
                    className="text-xs font-bold text-slate-600 border-slate-300 cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPurging}
                    onClick={async () => {
                      setIsPurging(true);
                      try {
                        await onPurgeCustomer(selectedCustomer);
                        setConfirmPurge(false);
                        onClose();
                      } finally {
                        setIsPurging(false);
                      }
                    }}
                    className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                  >
                    {isPurging ? 'Purging...' : 'Confirm Purge'}
                  </Button>
                </div>
              </div>
            )}

            {showBlacklistInput && !selectedCustomer.isBlacklisted && (
              <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-2">
                <input
                  type="text"
                  value={blacklistReasonDraft}
                  onChange={(e) => setBlacklistReasonDraft(e.target.value)}
                  placeholder="Reason for blacklisting..."
                  className="w-full px-3 py-2 text-xs bg-white border border-rose-300 rounded-lg"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      const gov = getUniversalGovernanceService();
                      const reason = blacklistReasonDraft.trim() || 'Blacklisted by Admin';
                      await gov.setBlacklistStatus('passenger', selectedCustomer.phone, true, reason);
                      if (selectedCustomer.email && selectedCustomer.email !== 'N/A') {
                        await gov.setBlacklistStatus('passenger', selectedCustomer.email, true, reason);
                      }
                      setShowBlacklistInput(false);
                      setBlacklistReasonDraft('');
                      onGovernanceMutated({ ...selectedCustomer, isBlacklisted: true, blacklistReason: reason });
                    }}
                    className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                  >
                    Confirm Blacklist
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </AdminSlideOverDrawer>
  );
}
