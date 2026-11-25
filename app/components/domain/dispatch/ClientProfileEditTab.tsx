import React, { useEffect, useMemo, useState } from 'react';
import { getCommsThreadService } from '../../../core/services/comms/comms-thread.service';
import {
  getContactService,
  normalizeClientDriverPreferences,
  type AdditionalPhone,
  type ContactRecord,
  type PhoneType,
} from '../../../core/services/customer/contact.service';
import type { DriverRosterItem } from '../../../core/services/operator.service';
import type { CorporateAccountConfig, VehicleTierConfig } from '../../../core/types/config';
import { formatDisplayPhone } from '../../../core/utils/phone';
import { Checkbox } from '../../ui/Checkbox';
import { BuildingIcon, CheckIcon, MapPinIcon, PlusIcon, TrashIcon, UserIcon, WheelchairIcon } from '../../ui/Icons';
import { Select, type SelectOption } from '../../ui/Select';
import { Switch } from '../../ui/Switch';
import { LocationAutocomplete } from '../LocationAutocomplete';
import { ClientDriverPreferencesCard } from './ClientDriverPreferencesCard';
import type { ResolvedClientProfileData } from './client-trip-history.util';

const PHONE_TYPE_OPTIONS: ReadonlyArray<SelectOption> = [
  { value: 'mobile', label: 'Mobile (SMS)' },
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'other', label: 'Other' },
];

const DEFAULT_VEHICLE_OPTIONS: ReadonlyArray<SelectOption> = [
  { value: 'standard', label: 'Standard Sedan (Town Car)' },
  { value: 'executive', label: 'Executive Black Car' },
  { value: 'suv', label: 'Luxury SUV / XL' },
  { value: 'van', label: 'Passenger Van' },
  { value: 'wheelchair', label: 'Wheelchair WAV' },
];

export interface ClientProfileEditTabProps {
  profile: ResolvedClientProfileData;
  drivers?: ReadonlyArray<DriverRosterItem>;
  vehicles?: ReadonlyArray<VehicleTierConfig>;
  corporateAccounts?: ReadonlyArray<CorporateAccountConfig>;
  onSaved?: (saved: ContactRecord) => void;
  onCancel?: () => void;
}

function buildInitialDraft(profile: ResolvedClientProfileData): Partial<ContactRecord> {
  const c = profile.contact;
  const prefs = normalizeClientDriverPreferences(c?.preferredDriverIds, c?.excludedDriverIds);
  return {
    id: c?.id,
    name: c?.name || (profile.displayName !== 'Client Profile' ? profile.displayName : '') || '',
    phone: c?.phone || profile.rawPhone || '',
    primaryPhoneType: c?.primaryPhoneType || 'mobile',
    additionalPhones: c?.additionalPhones ? c.additionalPhones.map((p) => ({ ...p })) : [],
    email: c?.email || profile.displayEmail || '',
    secondaryEmail: c?.secondaryEmail || '',
    smsNotifications: c?.smsNotifications ?? true,
    isVip: Boolean(c?.isVip || profile.isVip),
    vipReason: c?.vipReason || '',
    corporateAccountId: c?.corporateAccountId || '',
    corporateAccountNumber: c?.corporateAccountNumber || '',
    corporateAccountName: c?.corporateAccountName || profile.corporateAccountName || '',
    billingDepartment: c?.billingDepartment || '',
    defaultPoNumber: c?.defaultPoNumber || '',
    homeAddress: c?.homeAddress || '',
    workAddress: c?.workAddress || '',
    preferredVehicleTier: c?.preferredVehicleTier || 'standard',
    preferredDriverIds: prefs.preferredDriverIds,
    excludedDriverIds: prefs.excludedDriverIds,
    accessibilityNeeds: { ...(c?.accessibilityNeeds || {}) },
    notes: c?.notes || profile.dispatcherNotes || '',
  };
}

export function ClientProfileEditTab({
  profile, drivers, vehicles, corporateAccounts = [], onSaved, onCancel,
}: ClientProfileEditTabProps) {
  const [form, setForm] = useState<Partial<ContactRecord>>(() => buildInitialDraft(profile));
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    setForm(buildInitialDraft(profile));
    setSavedNotice(null);
  }, [profile.contact?.id, profile.rawPhone, profile.displayEmail]);

  const corpOptions = useMemo<SelectOption[]>(() => {
    const items: SelectOption[] = [{ value: '', label: 'None (Personal / Direct Pay)' }];
    for (const acc of corporateAccounts.filter((a) => a.isActive !== false)) {
      items.push({ value: acc.id, label: `${acc.companyName} (${acc.accountNumber})`, subtitle: acc.poRequired ? 'PO Required' : 'Direct Bill' });
    }
    return items;
  }, [corporateAccounts]);

  const selectedCorpValue = useMemo(() => {
    if (form.corporateAccountId) return form.corporateAccountId;
    if (!form.corporateAccountName && !form.corporateAccountNumber) return '';
    return corporateAccounts.find((a) =>
      (form.corporateAccountNumber && a.accountNumber === form.corporateAccountNumber) ||
      (form.corporateAccountName && a.companyName.toLowerCase() === form.corporateAccountName.toLowerCase())
    )?.id || '';
  }, [form.corporateAccountId, form.corporateAccountName, form.corporateAccountNumber, corporateAccounts]);

  const vehicleOptions = useMemo<SelectOption[]>(() => {
    const active = (vehicles || []).filter((v) => !v.isArchived && v.isActive !== false);
    return active.length > 0 ? active.map((v) => ({ value: v.id, label: v.name })) : [...DEFAULT_VEHICLE_OPTIONS];
  }, [vehicles]);

  const addPhone = () => {
    const next: AdditionalPhone = { id: `ph_${Date.now()}`, type: 'mobile', number: '' };
    setForm((p) => ({ ...p, additionalPhones: [...(p.additionalPhones || []), next] }));
  };

  const updatePhone = (idx: number, patch: Partial<AdditionalPhone>) => {
    setForm((p) => {
      const list = [...(p.additionalPhones || [])];
      if (list[idx]) list[idx] = { ...list[idx], ...patch };
      return { ...p, additionalPhones: list };
    });
  };

  const removePhone = (idx: number) =>
    setForm((p) => ({ ...p, additionalPhones: (p.additionalPhones || []).filter((_, i) => i !== idx) }));

  const handleCorpSelect = (corpId: string) => {
    if (!corpId) {
      setForm((p) => ({ ...p, corporateAccountId: '', corporateAccountNumber: '', corporateAccountName: '', billingDepartment: '', defaultPoNumber: '' }));
      return;
    }
    const acc = corporateAccounts.find((a) => a.id === corpId);
    if (!acc) return;
    setForm((p) => ({
      ...p, corporateAccountId: acc.id, corporateAccountNumber: acc.accountNumber,
      corporateAccountName: acc.companyName, defaultPoNumber: acc.currentPoNumber || p.defaultPoNumber || '',
    }));
  };

  const canSave = Boolean((form.name || '').trim() || (form.phone || '').trim() || (form.email || '').trim());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const cleanPhone = (form.phone || '').trim();
    const cleanEmail = (form.email || '').trim();
    const cleanName = (form.name || '').trim() || (cleanPhone ? formatDisplayPhone(cleanPhone) : cleanEmail) || 'Customer';
    const cleanAdditional = (form.additionalPhones || []).filter((ap) => ap.number && ap.number.trim());
    const prefs = normalizeClientDriverPreferences(form.preferredDriverIds, form.excludedDriverIds);

    const saved = getContactService().upsertContact({
      ...form,
      name: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      additionalPhones: cleanAdditional,
      preferredDriverIds: prefs.preferredDriverIds,
      excludedDriverIds: prefs.excludedDriverIds,
    });
    void getCommsThreadService().mergeThreadsForContact(saved);
    setSavedNotice('✓ Contact profile saved');
    onSaved?.(saved);
  };

  const setMobility = (key: keyof NonNullable<ContactRecord['accessibilityNeeds']>, checked: boolean) =>
    setForm((p) => ({ ...p, accessibilityNeeds: { ...(p.accessibilityNeeds || {}), [key]: checked } }));

  return (
    <form onSubmit={handleSave} className="space-y-2.5 text-xs">
      {savedNotice && (
        <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex items-center gap-1.5">
          <CheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" /><span>{savedNotice}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200/90 p-3 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
            <UserIcon className="w-3.5 h-3.5 text-indigo-600" /><span>Contact Info</span>
          </span>
          <Switch size="sm" tone="amber" label="VIP Priority Client" checked={Boolean(form.isVip)} onChange={(c) => setForm((p) => ({ ...p, isVip: c }))} className="py-0" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[10.5px] font-bold text-slate-600 mb-0.5">Full Name *</label>
            <input type="text" value={form.name || ''} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Eleanor Vance" className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-blue-500 font-semibold" />
          </div>
          <div>
            <label className="block text-[10.5px] font-bold text-slate-600 mb-0.5">VIP Reason</label>
            <input type="text" disabled={!form.isVip} value={form.vipReason || ''} onChange={(e) => setForm((p) => ({ ...p, vipReason: e.target.value }))} placeholder={form.isVip ? 'Executive / Medical Priority' : 'Enable VIP above'} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-blue-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/90 p-3 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">Phones &amp; Digital Contact</span>
          <button type="button" onClick={addPhone} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10.5px] border border-blue-200 cursor-pointer">
            <PlusIcon className="w-3 h-3" /><span>Add Phone</span>
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-32 shrink-0"><Select size="xs" options={PHONE_TYPE_OPTIONS} value={form.primaryPhoneType || 'mobile'} onValueChange={(v) => setForm((p) => ({ ...p, primaryPhoneType: v as PhoneType }))} /></div>
          <input type="tel" value={form.phone || ''} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Primary phone (+1 314-555-0199)" className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono font-semibold focus:outline-blue-500" />
        </div>
        {(form.additionalPhones || []).map((ph, idx) => (
          <div key={ph.id || idx} className="flex items-center gap-1.5">
            <div className="w-28 shrink-0"><Select size="xs" options={PHONE_TYPE_OPTIONS} value={ph.type || 'mobile'} onValueChange={(v) => updatePhone(idx, { type: v as PhoneType })} /></div>
            <input type="tel" value={ph.number || ''} onChange={(e) => updatePhone(idx, { number: e.target.value })} placeholder="Additional phone..." className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-slate-200 font-mono" />
            {ph.type === 'work' && <input type="text" value={ph.extension || ''} onChange={(e) => updatePhone(idx, { extension: e.target.value })} placeholder="Ext" className="w-14 px-2 py-1 rounded-lg border border-slate-200" />}
            <input type="text" value={ph.label || ''} onChange={(e) => updatePhone(idx, { label: e.target.value })} placeholder="Label" className="w-24 px-2 py-1 rounded-lg border border-slate-200" />
            <button type="button" onClick={() => removePhone(idx)} className="p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer" title="Remove phone"><TrashIcon className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <input type="email" value={form.email || ''} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Primary email" className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-blue-500" />
          <input type="email" value={form.secondaryEmail || ''} onChange={(e) => setForm((p) => ({ ...p, secondaryEmail: e.target.value }))} placeholder="Secondary / billing email" className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-blue-500" />
        </div>
        <Checkbox size="sm" label="Send automated SMS dispatch & arrival updates" checked={form.smsNotifications !== false} onChange={(c) => setForm((p) => ({ ...p, smsNotifications: c }))} />
      </div>

      <ClientDriverPreferencesCard
        drivers={drivers}
        preferredDriverIds={form.preferredDriverIds || []}
        excludedDriverIds={form.excludedDriverIds || []}
        onChange={(next) => setForm((p) => ({ ...p, preferredDriverIds: next.preferredDriverIds, excludedDriverIds: next.excludedDriverIds }))}
      />

      <div className="bg-white rounded-xl border border-slate-200/90 p-3 space-y-2 shadow-2xs">
        <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
          <BuildingIcon className="w-3.5 h-3.5 text-indigo-600" /><span>Corporate Account &amp; Billing</span>
        </div>
        <Select size="sm" searchable searchPlaceholder="Search company name or account #..." options={corpOptions} value={selectedCorpValue} onValueChange={handleCorpSelect} />
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={form.billingDepartment || ''} onChange={(e) => setForm((p) => ({ ...p, billingDepartment: e.target.value }))} placeholder="Department / Cost Center" className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-blue-500" />
          <input type="text" value={form.defaultPoNumber || ''} onChange={(e) => setForm((p) => ({ ...p, defaultPoNumber: e.target.value }))} placeholder="Default PO #" className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono focus:outline-blue-500" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/90 p-3 space-y-2 shadow-2xs">
        <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
          <MapPinIcon className="w-3.5 h-3.5 text-emerald-600" /><span>Home &amp; Work Addresses</span>
        </div>
        <div className="space-y-1.5">
          <LocationAutocomplete value={form.homeAddress || ''} onChange={(v) => setForm((p) => ({ ...p, homeAddress: v }))} onPlaceSelected={(d) => setForm((p) => ({ ...p, homeAddress: d.formattedAddress || d.address }))} placeholder="Home address..." />
          <LocationAutocomplete value={form.workAddress || ''} onChange={(v) => setForm((p) => ({ ...p, workAddress: v }))} onPlaceSelected={(d) => setForm((p) => ({ ...p, workAddress: d.formattedAddress || d.address }))} placeholder="Work / office address..." />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/90 p-3 space-y-2 shadow-2xs">
        <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
          <WheelchairIcon className="w-3.5 h-3.5 text-blue-600" /><span>Preferred Vehicle, Mobility &amp; Notes</span>
        </div>
        <Select size="sm" options={vehicleOptions} value={form.preferredVehicleTier || 'standard'} onValueChange={(v) => setForm((p) => ({ ...p, preferredVehicleTier: v as any }))} />
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <Checkbox size="sm" label="Wheelchair Ramp (WAV)" checked={Boolean(form.accessibilityNeeds?.wheelchair)} onChange={(c) => setMobility('wheelchair', c)} />
          <Checkbox size="sm" label="Folding Walker / Trunk" checked={Boolean(form.accessibilityNeeds?.walker)} onChange={(c) => setMobility('walker', c)} />
          <Checkbox size="sm" label="Service Animal" checked={Boolean(form.accessibilityNeeds?.serviceAnimal)} onChange={(c) => setMobility('serviceAnimal', c)} />
          <Checkbox size="sm" label="Door-to-Door Assist" checked={Boolean(form.accessibilityNeeds?.extraAssistance)} onChange={(c) => setMobility('extraAssistance', c)} />
        </div>
        <textarea rows={2} value={form.notes || ''} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Dispatcher & driver notes (gate code, pickup instructions)..." className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-blue-500" />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold cursor-pointer">Cancel</button>}
        <button type="submit" disabled={!canSave} className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-45 text-white font-extrabold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer">
          <CheckIcon className="w-3.5 h-3.5" /><span>Save Profile</span>
        </button>
      </div>
    </form>
  );
}
