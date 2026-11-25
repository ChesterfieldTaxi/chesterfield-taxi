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

export interface DispatchPassengerCrmSectionProps {
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

  const handleApplyCallerCandidate = (candidate: (typeof callerSuggestions)[number]) => {
    if (candidate.name) setPassengerName(candidate.name);
    if (candidate.phone) setPhone(candidate.phone);
    if (candidate.email) setEmail(candidate.email);
    if (candidate.corporateAccount) {
      const matched = findMatchingCorporateAccount(
        corporateAccountList,
        candidate.corporateAccount,
        { caseInsensitiveName: true }
      );
      setCorporateAccount(matched ? matched.companyName : candidate.corporateAccount);
      setPaymentMethod('account');
    }
    if (candidate.defaultPo) setBillingPo(candidate.defaultPo);
    setCallerQuickAddresses(candidate.addresses);
    setShowCallerSuggestions(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-1.5">
        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
          Passengers
        </label>
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
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-bold text-xs border border-slate-200 hover:border-indigo-200 transition-all shadow-2xs disabled:opacity-45 disabled:pointer-events-none cursor-pointer"
            title="Open Client Profile & Past Trips window"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>
          <button
            type="button"
            onClick={onAddPassenger}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 transition-all shadow-2xs active:scale-95"
          >
            <PlusIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>Add passenger</span>
          </button>
        </div>
      </div>

      <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2 relative">
        {/* Primary Passenger with Instant Inline Caller Lookup */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
            <UserIcon className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            placeholder="Primary Passenger Name (type to search callers...)"
            value={passengerName}
            onFocus={() => setShowCallerSuggestions(true)}
            onBlur={() => setTimeout(() => setShowCallerSuggestions(false), 180)}
            onChange={(e) => {
              setPassengerName(e.target.value);
              setShowCallerSuggestions(true);
            }}
            required
            className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
              <PhoneIcon className="w-3.5 h-3.5" />
            </div>
            <input
              type="tel"
              placeholder="Phone Number"
              value={phone}
              onFocus={() => setShowCallerSuggestions(true)}
              onBlur={() => setTimeout(() => setShowCallerSuggestions(false), 180)}
              onChange={(e) => {
                setPhone(e.target.value);
                setShowCallerSuggestions(true);
              }}
              required
              className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
              <MailIcon className="w-3.5 h-3.5" />
            </div>
            <input
              type="email"
              placeholder="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Instant Caller Autocomplete Dropdown */}
        {showCallerSuggestions && callerSuggestions.length > 0 && (
          <div className="absolute left-2 right-2 top-[72px] z-40 bg-white border border-blue-200 rounded-xl shadow-xl divide-y divide-slate-100 max-h-52 overflow-y-auto">
            <div className="px-2.5 py-1 bg-blue-50/70 text-[10px] font-extrabold uppercase tracking-wider text-blue-800">
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
                className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 transition-colors cursor-pointer flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-900 truncate">{cand.name}</span>
                    {cand.isVip && (
                      <span className="px-1 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                        VIP
                      </span>
                    )}
                    {cand.isBlacklisted && (
                      <span className="px-1 py-0.2 rounded text-[9px] font-black bg-rose-100 text-rose-700 border border-rose-300">
                        BLOCKED
                      </span>
                    )}
                    {cand.corporateAccount && (
                      <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 truncate max-w-[110px]">
                        {cand.corporateAccount}
                      </span>
                    )}
                  </div>
                  <div className="text-[10.5px] font-mono text-slate-500 truncate">
                    {cand.phone}
                    {cand.email ? ` • ${cand.email}` : ''}
                  </div>
                </div>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">
                  {cand.tripCount} {cand.tripCount === 1 ? 'ride' : 'rides'}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Quick-Fill Recent Addresses for Selected Caller */}
        {callerQuickAddresses.length > 0 && (
          <div className="pt-1 border-t border-slate-100 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
              <span>Recent Addresses (click to fill Pickup / Shift+click Dropoff)</span>
              <button
                type="button"
                onClick={() => setCallerQuickAddresses([])}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
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
                  className="max-w-full inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 text-[10px] font-semibold border border-slate-200 transition-colors cursor-pointer"
                  title={addr}
                >
                  <MapPinIcon className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate">{addr}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Additional Passengers List */}
        {additionalPassengers.map((ap, idx) => (
          <div key={idx} className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
            <span className="text-slate-400 text-xs">#{idx + 2}</span>
            <input
              type="text"
              placeholder={`Passenger #${idx + 2} Name`}
              value={ap.name}
              onChange={(e) => {
                const updated = [...additionalPassengers];
                updated[idx] = { ...updated[idx], name: e.target.value };
                setAdditionalPassengers(updated);
              }}
              className="flex-1 px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              className="w-28 px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => onRemovePassenger(idx)}
              className="text-slate-400 hover:text-red-500 px-1"
              title="Remove passenger"
            >
              ✕
            </button>
          </div>
        ))}

        {/* Contact Person / Booker Checkbox & Expansion */}
        <div className="pt-2 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
            <input
              type="checkbox"
              checked={isBookerDifferent}
              onChange={(e) => setIsBookerDifferent(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-semibold text-slate-700">
              Booker is different from Passenger (Contact Person)
            </span>
          </label>

          {isBookerDifferent && (
            <div className="mt-2 p-2 bg-blue-50/60 border border-blue-200/80 rounded-md space-y-1.5">
              <div className="text-[10px] uppercase font-bold text-blue-800 tracking-wide">
                Contact Person / Booker Details
              </div>
              <input
                type="text"
                placeholder="Contact Name (e.g., Hotel Concierge, Assistant)"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs focus:ring-1 focus:ring-blue-500"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="tel"
                  placeholder="Contact Phone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="email"
                  placeholder="Contact Email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <Select
                size="xs"
                value={contactRole}
                onChange={(e) => setContactRole(e.target.value)}
                triggerClassName="border-blue-200 text-slate-700"
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
      </div>
    </div>
  );
}
