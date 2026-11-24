import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { getContactService } from '../../../../core/services/customer/contact.service';
import { getUniversalGovernanceService } from '../../../../core/services/governance/universal-governance.service';
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  AlertTriangleIcon, BanIcon, CarIcon, CheckIcon, EditIcon,
  ExternalLinkIcon, PlusIcon, ShieldIcon, StarIcon, UserIcon,
} from '../../../ui/Icons';
import type { CustomerProfile } from './types';

export interface CustomerProfileDrawerProps {
  selectedCustomer: CustomerProfile | null;
  isEditingCustomer: boolean;
  setIsEditingCustomer: (val: boolean) => void;
  onClose: () => void;
  onCustomerSaved: (updated: CustomerProfile) => void;
  onGovernanceMutated: (updated: CustomerProfile) => void;
}

export function CustomerProfileDrawer({
  selectedCustomer,
  isEditingCustomer,
  setIsEditingCustomer,
  onClose,
  onCustomerSaved,
  onGovernanceMutated,
}: CustomerProfileDrawerProps) {
  const [editForm, setEditForm] = useState<Partial<CustomerProfile>>({});
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showBlacklistInput, setShowBlacklistInput] = useState(false);
  const [blacklistReasonDraft, setBlacklistReasonDraft] = useState('');

  useEffect(() => {
    if (!selectedCustomer) return;
    setEditForm({
      name: selectedCustomer.name,
      phone: selectedCustomer.phone,
      email: selectedCustomer.email === 'N/A' ? '' : selectedCustomer.email,
      corporateAccountName: selectedCustomer.corporateAccountName || '',
      isVip: selectedCustomer.isVip || false,
      preferredVehicle: selectedCustomer.preferredVehicle || 'Standard Sedan',
      notes: selectedCustomer.notes || '',
    });
    setSaveSuccessMessage(null);
    setFormError(null);
    setShowBlacklistInput(false);
    setBlacklistReasonDraft('');
  }, [selectedCustomer?.id, isEditingCustomer]);

  if (!selectedCustomer) return null;

  const isNewClient = Boolean(selectedCustomer.id?.startsWith('cust_new_'));
  const score = selectedCustomer.customerScore ?? 90;

  const handleSave = () => {
    if (!editForm.name?.trim() || !editForm.phone?.trim()) {
      setFormError('Client full name and mobile phone number are required.');
      return;
    }
    setFormError(null);
    const saved = getContactService().saveContact({
      id: isNewClient ? undefined : selectedCustomer.id,
      name: editForm.name.trim(),
      phone: editForm.phone.trim(),
      email: editForm.email?.trim() || '',
      corporateAccountName: editForm.corporateAccountName?.trim() || undefined,
      isVip: editForm.isVip ?? false,
      preferredVehicleTier: (editForm.preferredVehicle as any) || 'standard',
      notes: editForm.notes || '',
      customerScore: score,
      tripCount: selectedCustomer.tripCount ?? 1,
      totalSpend: selectedCustomer.totalSpend ?? 0,
    });

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
    setIsEditingCustomer(false);
    setSaveSuccessMessage('Client profile saved.');
    setTimeout(() => setSaveSuccessMessage(null), 3500);
  };

  return (
    <AdminSlideOverDrawer
      isOpen={Boolean(selectedCustomer)}
      onClose={onClose}
      title={isEditingCustomer ? (isNewClient ? 'Add Client' : `Edit Client: ${selectedCustomer.name || 'Client'}`) : selectedCustomer.name}
      subtitle={isEditingCustomer ? 'Update passenger contact details, vehicle preferences, and dispatcher notes' : selectedCustomer.email}
      size="lg"
      headerBadge={
        <div className="flex items-center gap-1.5">
          {selectedCustomer.isVip && !isEditingCustomer && (
            <Badge variant="warning" className="text-[10px] font-extrabold uppercase">VIP</Badge>
          )}
          {!isNewClient && (
            <button
              type="button"
              onClick={() => setIsEditingCustomer(!isEditingCustomer)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-700 cursor-pointer"
            >
              {isEditingCustomer ? 'View Profile' : 'Edit Client'}
            </button>
          )}
        </div>
      }
      footer={
        isEditingCustomer ? (
          <>
            <Button type="button" variant="outline" size="md" onClick={() => (isNewClient ? onClose() : setIsEditingCustomer(false))}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSave}
              leftIcon={isNewClient ? <PlusIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
              className="font-bold"
            >
              {isNewClient ? 'Add Client' : 'Save Client'}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" size="md" onClick={() => setIsEditingCustomer(true)} leftIcon={<EditIcon className="w-4 h-4" />}>
              Edit Client
            </Button>
            <Button type="button" variant="primary" size="md" onClick={onClose} className="font-bold">Done</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {saveSuccessMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckIcon className="w-4 h-4 text-emerald-600" />
            <span>{saveSuccessMessage}</span>
          </div>
        )}
        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold">
            {formError}
          </div>
        )}

        {isEditingCustomer ? (
          <div className="space-y-4 text-xs">
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <UserIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Identity &amp; Contact
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Eleanor Davis"
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={editForm.phone || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="(314) 555-0199"
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editForm.email || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="passenger@example.com"
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Corporate Affiliation</label>
                  <input
                    type="text"
                    value={editForm.corporateAccountName || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, corporateAccountName: e.target.value }))}
                    placeholder="Bayer Crop Science"
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <CarIcon className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Preferences &amp; Notes
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Preferred Vehicle</label>
                  <select
                    value={editForm.preferredVehicle || 'Standard Sedan'}
                    onChange={(e) => setEditForm((f) => ({ ...f, preferredVehicle: e.target.value }))}
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                  >
                    <option value="Standard Sedan">Standard Sedan</option>
                    <option value="Premium Executive">Premium Sedan / SUV</option>
                    <option value="XL Minivan / SUV">XL Minivan / SUV</option>
                    <option value="Wheelchair Accessible (WAV)">Wheelchair Accessible (WAV)</option>
                  </select>
                </div>
                <label className="inline-flex items-center gap-2 pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editForm.isVip)}
                    onChange={(e) => setEditForm((f) => ({ ...f, isVip: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span className="font-bold text-slate-800">VIP Priority Client</span>
                </label>
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Dispatcher Notes</label>
                <textarea
                  rows={3}
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Special luggage requests, pickup preferences, mobility needs..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3.5">
              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/80 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] uppercase font-black text-blue-700 block">Reliability Score</span>
                  <div className="text-sm font-black text-slate-900">Client Score: {score} / 100</div>
                  <div className="text-[10px] text-slate-500">Last ride: {selectedCustomer.lastRideDate || 'Recent'}</div>
                </div>
                <div className="text-lg font-black px-3 py-1 rounded-xl border bg-white text-slate-900 border-slate-200 inline-flex items-center gap-1">
                  <StarIcon className="w-4 h-4 text-amber-500" />
                  <span>{score}</span>
                </div>
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

              <div className="grid grid-cols-3 gap-2.5 p-3 bg-slate-50 rounded-xl">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Bookings</span>
                  <span className="text-sm font-black text-slate-900">{selectedCustomer.tripCount} Trips</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Spend</span>
                  <span className="text-sm font-black text-emerald-600">${selectedCustomer.totalSpend.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Vehicle</span>
                  <span className="text-xs font-bold text-slate-800 capitalize truncate block">
                    {selectedCustomer.preferredVehicle || 'Standard'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="font-semibold text-slate-600 block mb-1">Phone</span>
                  <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono">{selectedCustomer.phone}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-600 block mb-1">Email</span>
                  <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl truncate">{selectedCustomer.email || 'N/A'}</p>
                </div>
              </div>

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

              {selectedCustomer.notes && (
                <div>
                  <span className="font-semibold text-slate-600 block mb-1">Dispatcher Notes</span>
                  <p className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-amber-900">
                    {selectedCustomer.notes}
                  </p>
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <ShieldIcon className="w-4 h-4 text-slate-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">Governance</h3>
              </div>
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
                    selectedCustomer.isBlacklisted ? 'text-emerald-700 border-emerald-300' : 'text-rose-700 border-rose-300'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {selectedCustomer.isBlacklisted ? <CheckIcon className="w-3.5 h-3.5" /> : <BanIcon className="w-3.5 h-3.5" />}
                    <span>{selectedCustomer.isBlacklisted ? 'Restore Client' : showBlacklistInput ? 'Cancel' : 'Blacklist'}</span>
                  </span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const nextArchived = !selectedCustomer.isArchived;
                    await getUniversalGovernanceService().setArchiveStatus('passenger', selectedCustomer.phone, nextArchived);
                    onGovernanceMutated({ ...selectedCustomer, isArchived: nextArchived });
                  }}
                  className="text-xs font-bold text-slate-700 border-slate-300 cursor-pointer"
                >
                  {selectedCustomer.isArchived ? 'Unarchive' : 'Archive'}
                </Button>
              </div>

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
          </div>
        )}
      </div>
    </AdminSlideOverDrawer>
  );
}
