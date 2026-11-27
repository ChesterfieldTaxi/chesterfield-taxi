import React, { useMemo, useState } from 'react';
import type { GeoPoint, Trip } from '../../../../core/types';
import type { CorporateAccountConfig } from '../../../../core/types/config';
import {
  getContactService,
  normalizePhone,
} from '../../../../core/services/customer/contact.service';
import { getWorkspaceBus } from '../../../../core/services/workspace-bus.service';
import {
  findMatchingCorporateAccount,
  type BookingAdditionalPassenger as AdditionalPassenger,
} from '../../../../core/hooks/booking';
import { MailIcon, MapPinIcon, PhoneIcon, PlusIcon, UserIcon } from '../../../ui/Icons';
import { Select } from '../../../ui/Select';

export function publishPassengerCandidateTripsProfile(cand: {
  phone?: string;
  email?: string;
  name?: string;
}): void {
  getWorkspaceBus().publish('OPEN_CLIENT_PROFILE', {
    phone: cand.phone || undefined,
    email: cand.email || undefined,
    name: cand.name || undefined,
    initialTab: 'trips',
    source: 'passenger_crm',
  });
}

export interface DispatchPassengerCrmSectionProps {
  bookingCategory?: 'passenger' | 'package';
  setBookingCategory?: (val: 'passenger' | 'package') => void;
  packageDescription?: string;
  setPackageDescription?: (val: string) => void;
  passengerName: string;
  setPassengerName: (val: string) => void;
  phone: string;
  setPhone: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  additionalPassengers: AdditionalPassenger[];
  setAdditionalPassengers: (val: AdditionalPassenger[]) => void;
  isBookerDifferent: boolean;
  setIsBookerDifferent: (val: boolean) => void;
  contactName: string;
  setContactName: (val: string) => void;
  contactPhone: string;
  setContactPhone: (val: string) => void;
  contactEmail: string;
  setContactEmail: (val: string) => void;
  contactRole: string;
  setContactRole: (val: string) => void;
  lookupTrips: Trip[];
  corporateAccountList: CorporateAccountConfig[];
  setCorporateAccount: (val: string) => void;
  setPaymentMethod: (val: 'cash' | 'card' | 'account') => void;
  setBillingPo: (val: string) => void;
  pickupAddress: string;
  dropoffAddress: string;
  setPickupAddress: (val: string) => void;
  setPickupCoordinates: (val: GeoPoint | undefined) => void;
  setDropoffAddress: (val: string) => void;
  setDropoffCoordinates: (val: GeoPoint | undefined) => void;
  onAddPassenger: () => void;
  onRemovePassenger: (index: number) => void;
}

export function DispatchPassengerCrmSection({
  bookingCategory = 'passenger',
  setBookingCategory,
  packageDescription = '',
  setPackageDescription,
  passengerName,
  setPassengerName,
  phone,
  setPhone,
  email,
  setEmail,
  additionalPassengers,
  setAdditionalPassengers,
  isBookerDifferent,
  setIsBookerDifferent,
  contactName,
  setContactName,
  contactPhone,
  setContactPhone,
  contactEmail,
  setContactEmail,
  contactRole,
  setContactRole,
  lookupTrips,
  corporateAccountList,
  setCorporateAccount,
  setPaymentMethod,
  setBillingPo,
  pickupAddress,
  dropoffAddress,
  setPickupAddress,
  setPickupCoordinates,
  setDropoffAddress,
  setDropoffCoordinates,
  onAddPassenger,
  onRemovePassenger,
}: DispatchPassengerCrmSectionProps) {
  const [showCallerSuggestions, setShowCallerSuggestions] = useState(false);
  const [callerQuickAddresses, setCallerQuickAddresses] = useState<string[]>([]);
  const isPackageMode = bookingCategory === 'package';

  // Instant zero-latency inline caller lookup (ContactService + loaded dispatch trips)
  const callerSuggestions = useMemo(() => {
    const qName = passengerName.trim().toLowerCase();
    const qPhoneDigits = normalizePhone(phone);
    if (!showCallerSuggestions) return [];
    if (qName.length < 2 && qPhoneDigits.length < 3) return [];

    type CallerCandidate = {
      key: string;
      name: string;
      phone: string;
      email: string;
      corporateAccount?: string;
      defaultPo?: string;
      isVip?: boolean;
      isBlacklisted?: boolean;
      tripCount: number;
      addresses: string[];
    };

    const byKey = new Map<string, CallerCandidate>();

    // 1. ContactService records
    try {
      const contacts = getContactService().getAllContacts();
      for (const c of contacts) {
        if (c.isArchived) continue;
        const cDigits = normalizePhone(c.phone);
        const cName = (c.name || '').toLowerCase();
        const matches =
          (qPhoneDigits.length >= 3 && cDigits.includes(qPhoneDigits)) ||
          (qName.length >= 2 && cName.includes(qName));
        if (!matches) continue;
        const k = cDigits || cName;
        const addrs = [c.homeAddress, c.workAddress].filter((a): a is string =>
          Boolean(a && a.trim())
        );
        byKey.set(k, {
          key: k,
          name: c.name,
          phone: c.phone,
          email: c.email || '',
          corporateAccount: c.corporateAccountName || c.corporateAccountId,
          defaultPo: c.defaultPoNumber,
          isVip: c.isVip,
          isBlacklisted: c.isBlacklisted,
          tripCount: c.tripCount || 0,
          addresses: addrs,
        });
      }
    } catch {}

    // 2. Historical dispatch trips already in memory
    for (const t of lookupTrips) {
      const fullName = `${t.passenger?.firstName || ''} ${t.passenger?.lastName || ''}`.trim();
      const tPhone = t.passenger?.phone || '';
      const tDigits = normalizePhone(tPhone);
      if (!fullName && !tDigits) continue;
      const matches =
        (qPhoneDigits.length >= 3 && tDigits.includes(qPhoneDigits)) ||
        (qName.length >= 2 && fullName.toLowerCase().includes(qName));
      if (!matches) continue;

      const k = tDigits || fullName.toLowerCase();
      const existing = byKey.get(k);
      const tripAddrs = [t.pickupLocation?.address, t.dropoffLocation?.address].filter(
        (a): a is string => Boolean(a && a.trim())
      );
      if (existing) {
        existing.tripCount += 1;
        for (const addr of tripAddrs) {
          if (!existing.addresses.includes(addr) && existing.addresses.length < 4) {
            existing.addresses.push(addr);
          }
        }
        if (!existing.email && t.passenger?.email) existing.email = t.passenger.email;
      } else {
        const meta = (t.metadata || {}) as Record<string, any>;
        byKey.set(k, {
          key: k,
          name: fullName || tPhone,
          phone: tPhone,
          email: t.passenger?.email || '',
          corporateAccount: meta.corporateDetails?.corporateAccount || meta.corporateOrgName,
          defaultPo: meta.corporateDetails?.billingPo,
          isVip: Boolean(meta.vipStatus),
          tripCount: 1,
          addresses: tripAddrs.slice(0, 3),
        });
      }
    }

    return Array.from(byKey.values())
      .sort((a, b) => (b.isVip ? 1 : 0) - (a.isVip ? 1 : 0) || b.tripCount - a.tripCount)
      .slice(0, 6);
  }, [showCallerSuggestions, passengerName, phone, lookupTrips]);

  const handleApplyCallerCandidate = (cand: (typeof callerSuggestions)[number]) => {
    if (cand.name) setPassengerName(cand.name);
    if (cand.phone) setPhone(cand.phone);
    if (cand.email) setEmail(cand.email);
    if (cand.corporateAccount) {
      const matched = findMatchingCorporateAccount(
        corporateAccountList,
        cand.corporateAccount,
        { caseInsensitiveName: true }
      );
      setCorporateAccount(matched ? matched.companyName : cand.corporateAccount);
      setPaymentMethod('account');
    }
    if (cand.defaultPo) setBillingPo(cand.defaultPo);
    setCallerQuickAddresses(cand.addresses);
    setShowCallerSuggestions(false);
    publishPassengerCandidateTripsProfile(cand);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-1.5">
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Booking Category"
            className="inline-flex rounded-lg bg-surface-muted p-0.5 border border-border-subtle"
          >
            <button
              type="button"
              onClick={() => setBookingCategory?.('passenger')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                !isPackageMode
                  ? 'bg-surface-card text-fg-primary shadow-2xs'
                  : 'text-fg-muted hover:text-fg-secondary'
              }`}
            >
              Passenger
            </button>
            <button
              type="button"
              onClick={() => setBookingCategory?.('package')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                isPackageMode
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 shadow-2xs'
                  : 'text-fg-muted hover:text-fg-secondary'
              }`}
            >
              Package
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!phone.trim() && !email.trim() && !passengerName.trim()}
            onClick={() =>
              getWorkspaceBus().publish('OPEN_CLIENT_PROFILE', {
                phone: phone.trim() || undefined,
                email: email.trim() || undefined,
                name: passengerName.trim() || undefined,
                source: 'passenger_crm',
              })
            }
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-muted hover:bg-status-staged-bg text-fg-secondary hover:text-status-staged-fg font-bold text-xs border border-border-subtle hover:border-status-staged-border transition-all shadow-2xs disabled:opacity-45 disabled:pointer-events-none cursor-pointer"
            title="Open Client Profile & Past Trips window"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>
          {!isPackageMode && (
            <button
              type="button"
              onClick={onAddPassenger}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-status-info-bg hover:bg-status-info-bg-strong text-status-info-fg font-bold text-xs border border-status-info-border transition-all shadow-2xs active:scale-95"
            >
              <PlusIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>Add passenger</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-2 bg-surface-card border border-border-subtle rounded-lg shadow-sm space-y-2 relative">
        {/* Primary Passenger / Optional Package Contact with Instant Inline Caller Lookup */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-fg-subtle">
            <UserIcon className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            placeholder={
              isPackageMode
                ? 'Contact Name (optional — type to search callers...)'
                : 'Primary Passenger Name (type to search callers...)'
            }
            value={passengerName}
            onFocus={() => setShowCallerSuggestions(true)}
            onBlur={() => setTimeout(() => setShowCallerSuggestions(false), 180)}
            onChange={(e) => {
              setPassengerName(e.target.value);
              setShowCallerSuggestions(true);
            }}
            required={!isPackageMode}
            className="w-full pl-8 pr-2.5 py-1.5 bg-surface-card border border-border-strong rounded text-fg-strong text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-fg-subtle">
              <PhoneIcon className="w-3.5 h-3.5" />
            </div>
            <input
              type="tel"
              placeholder={isPackageMode ? 'Contact Phone (optional)' : 'Phone Number'}
              value={phone}
              onFocus={() => setShowCallerSuggestions(true)}
              onBlur={() => setTimeout(() => setShowCallerSuggestions(false), 180)}
              onChange={(e) => {
                setPhone(e.target.value);
                setShowCallerSuggestions(true);
              }}
              required={!isPackageMode}
              className="w-full pl-8 pr-2 py-1.5 bg-surface-card border border-border-strong rounded text-fg-strong text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-fg-subtle">
              <MailIcon className="w-3.5 h-3.5" />
            </div>
            <input
              type="email"
              placeholder="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 bg-surface-card border border-border-strong rounded text-fg-strong text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Instant Caller Autocomplete Dropdown */}
        {showCallerSuggestions && callerSuggestions.length > 0 && (
          <div className="absolute left-2 right-2 top-[72px] z-40 bg-surface-card border border-status-info-border rounded-xl shadow-xl divide-y divide-border-faint max-h-52 overflow-y-auto">
            <div className="px-2.5 py-1 bg-status-info-bg/70 text-[10px] font-extrabold uppercase tracking-wider text-status-info-fg">
              Matching Returning Callers / CRM Contacts
            </div>
            {callerSuggestions.map((cand) => (
              <button
                key={cand.key}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleApplyCallerCandidate(cand);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-status-info-bg transition-colors cursor-pointer flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-fg-primary truncate">{cand.name}</span>
                    {cand.isVip && (
                      <span className="px-1 py-0.2 rounded text-[9px] font-black bg-status-warning-bg-strong text-status-warning-fg border border-status-warning-border">
                        VIP
                      </span>
                    )}
                    {cand.isBlacklisted && (
                      <span className="px-1 py-0.2 rounded text-[9px] font-black bg-status-danger-bg-strong text-status-danger-fg border border-status-danger-border">
                        BLOCKED
                      </span>
                    )}
                    {cand.corporateAccount && (
                      <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-status-staged-bg text-status-staged-fg border border-status-staged-border truncate max-w-[110px]">
                        {cand.corporateAccount}
                      </span>
                    )}
                  </div>
                  <div className="text-[10.5px] font-mono text-fg-muted truncate">
                    {cand.phone}
                    {cand.email ? ` • ${cand.email}` : ''}
                  </div>
                </div>
                <span className="text-[10px] font-bold text-fg-subtle shrink-0">
                  {cand.tripCount} {cand.tripCount === 1 ? 'ride' : 'rides'}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Quick-Fill Recent Addresses for Selected Caller */}
        {callerQuickAddresses.length > 0 && (
          <div className="pt-1 border-t border-border-faint space-y-1">
            <div className="flex items-center justify-between text-[10px] font-bold text-fg-muted">
              <span>Recent Addresses (click to fill Pickup / Shift+click Dropoff)</span>
              <button
                type="button"
                onClick={() => setCallerQuickAddresses([])}
                className="text-fg-subtle hover:text-fg-secondary cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {callerQuickAddresses.map((addr) => (
                <button
                  key={addr}
                  type="button"
                  onClick={(e) => {
                    if (e.shiftKey || (pickupAddress && !dropoffAddress)) {
                      setDropoffAddress(addr);
                      setDropoffCoordinates(undefined);
                    } else {
                      setPickupAddress(addr);
                      setPickupCoordinates(undefined);
                    }
                  }}
                  className="max-w-full inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-muted hover:bg-status-info-bg-strong text-fg-secondary hover:text-status-info-fg text-[10px] font-semibold border border-border-subtle transition-colors cursor-pointer"
                  title={addr}
                >
                  <MapPinIcon className="w-3 h-3 text-fg-muted shrink-0" />
                  <span className="truncate">{addr}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Package Description / Delivery Notes (Package mode only) */}
        {isPackageMode && (
          <div>
            <input
              type="text"
              placeholder="Package Description / Delivery Notes (optional — e.g., Sealed envelope, Lab sample)"
              value={packageDescription}
              onChange={(e) => setPackageDescription?.(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-surface-card border border-border-strong rounded text-fg-strong text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        )}

        {/* Additional Passengers List */}
        {!isPackageMode && additionalPassengers.map((ap, idx) => (
          <div key={idx} className="flex items-center gap-1.5 pt-1 border-t border-border-faint">
            <span className="text-fg-subtle text-xs">#{idx + 2}</span>
            <input
              type="text"
              placeholder={`Passenger #${idx + 2} Name`}
              value={ap.name}
              onChange={(e) => {
                const updated = [...additionalPassengers];
                updated[idx] = { ...updated[idx], name: e.target.value };
                setAdditionalPassengers(updated);
              }}
              className="flex-1 px-2 py-1 bg-surface-card border border-border-strong rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={ap.phone || ''}
              onChange={(e) => {
                const updated = [...additionalPassengers];
                updated[idx] = { ...updated[idx], phone: e.target.value };
                setAdditionalPassengers(updated);
              }}
              className="w-28 px-2 py-1 bg-surface-card border border-border-strong rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => onRemovePassenger(idx)}
              className="text-fg-subtle hover:text-red-500 px-1"
              title="Remove passenger"
            >
              ✕
            </button>
          </div>
        ))}

        {/* Contact Person / Booker Checkbox & Expansion */}
        {!isPackageMode && (
        <div className="pt-2 border-t border-border-faint">
          <label className="flex items-center gap-2 cursor-pointer select-none text-fg-secondary">
            <input
              type="checkbox"
              checked={isBookerDifferent}
              onChange={(e) => setIsBookerDifferent(e.target.checked)}
              className="rounded border-border-strong text-blue-600 focus:ring-blue-500"
            />
            <span className="font-semibold text-fg-secondary">
              Booker is different from Passenger (Contact Person)
            </span>
          </label>

          {isBookerDifferent && (
            <div className="mt-2 p-2 bg-status-info-bg/60 border border-status-info-border/80 rounded-md space-y-1.5">
              <div className="text-[10px] uppercase font-bold text-status-info-fg tracking-wide">
                Contact Person / Booker Details
              </div>
              <input
                type="text"
                placeholder="Contact Name (e.g., Hotel Concierge, Assistant)"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-2 py-1 bg-surface-card border border-status-info-border rounded text-xs focus:ring-1 focus:ring-blue-500"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="tel"
                  placeholder="Contact Phone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-2 py-1 bg-surface-card border border-status-info-border rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="email"
                  placeholder="Contact Email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-2 py-1 bg-surface-card border border-status-info-border rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <Select
                size="xs"
                value={contactRole}
                onChange={(e) => setContactRole(e.target.value)}
                triggerClassName="border-status-info-border text-fg-secondary"
              >
                <option value="Hotel Front Desk / Concierge">Hotel Front Desk / Concierge</option>
                <option value="Medical Facility / Patient Coordinator">Medical Coordinator</option>
                <option value="Corporate Travel / Executive Admin">
                  Corporate Travel / Executive Admin
                </option>
                <option value="Family Member / Caregiver">Family Member / Caregiver</option>
                <option value="Other">Other</option>
              </Select>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
