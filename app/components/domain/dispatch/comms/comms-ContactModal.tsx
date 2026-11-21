import type React from 'react';
import type {
  AdditionalPhone,
  ContactRecord,
  PhoneType,
} from '../../../../core/services/customer/contact.service';
import type { CorporateAccountConfig } from '../../../../core/types/config';
import {
  BuildingIcon,
  CheckIcon,
  ExternalLinkIcon,
  MapPinIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
  UserIcon,
  WheelchairIcon,
  XIcon,
} from '../../../ui/Icons';
import type { CommsSheetDragProps } from './comms-types';

export interface CommsContactModalProps {
  isOpen: boolean;
  contactEditForm: Partial<ContactRecord>;
  setContactEditForm: React.Dispatch<React.SetStateAction<Partial<ContactRecord>>>;
  contactSaveFeedback: string | null;
  activeContactPhoneFallback: string;
  corpSearchQuery: string;
  onChangeCorpSearchQuery: (val: string) => void;
  isCorpDropdownOpen: boolean;
  setIsCorpDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  filteredCorpAccounts: CorporateAccountConfig[];
  onAddPhone: () => void;
  onUpdatePhone: (index: number, patch: Partial<AdditionalPhone>) => void;
  onRemovePhone: (index: number) => void;
  onSaveContact: () => void;
  onClose: () => void;
  sheetDrag: CommsSheetDragProps;
}

export function CommsContactModal({
  isOpen,
  contactEditForm,
  setContactEditForm,
  contactSaveFeedback,
  activeContactPhoneFallback,
  corpSearchQuery,
  onChangeCorpSearchQuery,
  isCorpDropdownOpen,
  setIsCorpDropdownOpen,
  filteredCorpAccounts,
  onAddPhone,
  onUpdatePhone,
  onRemovePhone,
  onSaveContact,
  onClose,
  sheetDrag,
}: CommsContactModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        style={sheetDrag.sheetStyle}
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-2xl w-full border-t sm:border border-slate-200 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col max-h-[92dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          {...sheetDrag.dragHandlers}
          className="bg-slate-900 text-white px-4 sm:px-6 pt-2 sm:pt-4 pb-3.5 sm:pb-4 shrink-0 touch-none"
        >
          <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white truncate">Passenger &amp; Contact Profile</h3>
                <p className="text-[11px] text-slate-400 truncate">
                  Unified customer record across dispatch, booking &amp; directory
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-full sm:rounded-lg bg-slate-800/80 sm:bg-transparent text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="Close contact profile modal"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Save Toast Feedback */}
        {contactSaveFeedback && (
          <div className="mx-4 sm:mx-6 mt-3 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
            <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{contactSaveFeedback}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5 flex-1 text-xs">
          {/* ── Section 1: Passenger Name & VIP Status ── */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black tracking-wide text-slate-700 uppercase">
                Passenger Identity
              </span>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!contactEditForm.isVip}
                  onChange={(e) =>
                    setContactEditForm((prev) => ({ ...prev, isVip: e.target.checked }))
                  }
                  className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                />
                <span className="font-bold text-amber-800 text-xs">VIP Priority Client</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={contactEditForm.name || ''}
                  onChange={(e) =>
                    setContactEditForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Eleanor Vance"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  VIP Classification / Reason
                </label>
                <input
                  type="text"
                  disabled={!contactEditForm.isVip}
                  value={contactEditForm.vipReason || ''}
                  onChange={(e) =>
                    setContactEditForm((prev) => ({ ...prev, vipReason: e.target.value }))
                  }
                  placeholder={
                    contactEditForm.isVip
                      ? 'e.g. Executive Board Member, Medical Priority'
                      : 'Enable VIP above to add reason'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-blue-500 font-medium"
                />
              </div>
            </div>
          </div>

          {/* ── Section 2: Phone Numbers (by Type) ── */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black tracking-wide text-slate-700 uppercase">
                  Phone Numbers
                </span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px]">
                  {1 + (contactEditForm.additionalPhones?.length || 0)} Total
                </span>
              </div>
              <button
                type="button"
                onClick={onAddPhone}
                className="px-2.5 py-1 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <PlusIcon className="w-3 h-3" />
                <span>Add Phone Number</span>
              </button>
            </div>

            {/* Primary Phone */}
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-blue-700 tracking-wider">
                  <StarIcon className="w-3 h-3 text-blue-600" />
                  <span>Primary Phone</span>
                </span>
                <span className="text-[10px] text-slate-400">Default dispatch &amp; SMS target</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={contactEditForm.primaryPhoneType || 'mobile'}
                  onChange={(e) =>
                    setContactEditForm((prev) => ({
                      ...prev,
                      primaryPhoneType: e.target.value as PhoneType,
                    }))
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700 focus:bg-white focus:outline-blue-500 cursor-pointer text-xs"
                >
                  <option value="mobile">Mobile (SMS)</option>
                  <option value="home">Home Landline</option>
                  <option value="work">Work / Office</option>
                  <option value="other">Other Phone</option>
                </select>

                <div className="sm:col-span-2">
                  <input
                    type="tel"
                    value={contactEditForm.phone || ''}
                    onChange={(e) =>
                      setContactEditForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="+1 (314) 555-0199"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-blue-500 font-mono text-xs font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* Additional Phones List */}
            {contactEditForm.additionalPhones && contactEditForm.additionalPhones.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Additional Numbers
                </span>
                {contactEditForm.additionalPhones.map((phoneItem, idx) => (
                  <div
                    key={phoneItem.id || idx}
                    className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                  >
                    <select
                      value={phoneItem.type || 'mobile'}
                      onChange={(e) =>
                        onUpdatePhone(idx, { type: e.target.value as PhoneType })
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700 focus:bg-white focus:outline-blue-500 cursor-pointer text-xs sm:w-32 shrink-0"
                    >
                      <option value="mobile">Mobile</option>
                      <option value="home">Home</option>
                      <option value="work">Work</option>
                      <option value="other">Other</option>
                    </select>

                    <input
                      type="tel"
                      value={phoneItem.number || ''}
                      onChange={(e) => onUpdatePhone(idx, { number: e.target.value })}
                      placeholder="Phone number..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-blue-500 font-mono text-xs"
                    />

                    {phoneItem.type === 'work' && (
                      <input
                        type="text"
                        value={phoneItem.extension || ''}
                        onChange={(e) => onUpdatePhone(idx, { extension: e.target.value })}
                        placeholder="Ext."
                        className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-blue-500 text-xs shrink-0"
                      />
                    )}

                    <input
                      type="text"
                      value={phoneItem.label || ''}
                      onChange={(e) => onUpdatePhone(idx, { label: e.target.value })}
                      placeholder="Label (e.g. Spouse, Office)"
                      className="sm:w-36 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-blue-500 text-xs shrink-0"
                    />

                    <button
                      type="button"
                      onClick={() => onRemovePhone(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0 self-end sm:self-center"
                      title="Remove phone number"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Section 3: Email Addresses & Notifications ── */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
            <span className="text-[11px] font-black tracking-wide text-slate-700 uppercase block">
              Email &amp; Digital Messaging
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Primary Email
                </label>
                <input
                  type="email"
                  value={contactEditForm.email || ''}
                  onChange={(e) =>
                    setContactEditForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="client@example.com"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Secondary / Invoicing Email
                </label>
                <input
                  type="email"
                  value={contactEditForm.secondaryEmail || ''}
                  onChange={(e) =>
                    setContactEditForm((prev) => ({ ...prev, secondaryEmail: e.target.value }))
                  }
                  placeholder="accounting@company.com"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={contactEditForm.smsNotifications !== false}
                onChange={(e) =>
                  setContactEditForm((prev) => ({ ...prev, smsNotifications: e.target.checked }))
                }
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="text-slate-700 font-semibold text-xs">
                Send automated text dispatch &amp; driver arrival updates to primary mobile
              </span>
            </label>
          </div>

          {/* ── Section 4: Searchable Corporate Account & Direct Billing ── */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BuildingIcon className="w-4 h-4 text-slate-600" />
                <span className="text-[11px] font-black tracking-wide text-slate-700 uppercase">
                  Corporate Account
                </span>
              </div>
              {(contactEditForm.corporateAccountNumber || contactEditForm.corporateAccountName) && (
                <button
                  type="button"
                  onClick={() => {
                    setContactEditForm((prev) => ({
                      ...prev,
                      corporateAccountId: '',
                      corporateAccountNumber: '',
                      corporateAccountName: '',
                      defaultPoNumber: '',
                      billingDepartment: '',
                    }));
                    onChangeCorpSearchQuery('');
                  }}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  ✕ Unlink Corporate Account
                </button>
              )}
            </div>

            {/* Active linked corporate account card */}
            {(contactEditForm.corporateAccountNumber || contactEditForm.corporateAccountName) && (
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-600 text-white font-mono font-bold text-[10px] rounded-md">
                      {contactEditForm.corporateAccountNumber || 'CUSTOM-ACCT'}
                    </span>
                    <span className="font-bold text-blue-900 text-xs">
                      {contactEditForm.corporateAccountName || 'Corporate Account'}
                    </span>
                  </div>
                  <p className="text-[10px] text-blue-700 mt-0.5">
                    Linked for monthly invoicing &amp; corporate account rates.
                  </p>
                </div>
              </div>
            )}

            {/* Searchable Corporate Account Input */}
            <div className="relative">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Search Account Number or Company Name
              </label>
              <div className="relative">
                <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={corpSearchQuery}
                  onChange={(e) => {
                    onChangeCorpSearchQuery(e.target.value);
                    setIsCorpDropdownOpen(true);
                  }}
                  onFocus={() => setIsCorpDropdownOpen(true)}
                  placeholder="Type to search (e.g. CORP-BAY-902, Bayer, Centene, Enterprise...)"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500 font-medium"
                />
              </div>

              {/* Dropdown Suggestions */}
              {isCorpDropdownOpen && (
                <div
                  className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl divide-y divide-slate-100"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {filteredCorpAccounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setContactEditForm((prev) => ({
                          ...prev,
                          corporateAccountId: acc.id,
                          corporateAccountNumber: acc.accountNumber,
                          corporateAccountName: acc.companyName,
                          defaultPoNumber: acc.currentPoNumber || prev.defaultPoNumber || '',
                        }));
                        onChangeCorpSearchQuery(acc.accountNumber);
                        setIsCorpDropdownOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50/70 transition-colors cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 font-mono font-bold text-[10px] rounded border border-slate-200">
                            {acc.accountNumber}
                          </span>
                          <span className="font-bold text-slate-900 text-xs">
                            {acc.companyName}
                          </span>
                        </div>
                        {acc.billingContactName && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Contact: {acc.billingContactName}{' '}
                            {acc.billingContactEmail ? `(${acc.billingContactEmail})` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {acc.discountPercent && acc.discountPercent > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">
                            {acc.discountPercent}% Off
                          </span>
                        )}
                        <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 font-medium rounded">
                          {acc.poRequired ? 'PO Required' : 'PO Optional'}
                        </span>
                      </div>
                    </button>
                  ))}

                  {/* Custom account number fallback option */}
                  {corpSearchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = corpSearchQuery.trim();
                        setContactEditForm((prev) => ({
                          ...prev,
                          corporateAccountNumber: trimmed,
                          corporateAccountName: prev.corporateAccountName || trimmed,
                        }));
                        setIsCorpDropdownOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-100 transition-colors cursor-pointer text-blue-700 font-bold text-[11px] flex items-center gap-2"
                    >
                      <span>+ Use custom account number:</span>
                      <span className="font-mono bg-blue-100 px-1.5 py-0.5 rounded text-blue-900">
                        "{corpSearchQuery.trim()}"
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Department / Cost Center
                </label>
                <input
                  type="text"
                  value={contactEditForm.billingDepartment || ''}
                  onChange={(e) =>
                    setContactEditForm((prev) => ({ ...prev, billingDepartment: e.target.value }))
                  }
                  placeholder="e.g. Sales Division, R&amp;D"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Default PO # / Billing Reference
                </label>
                <input
                  type="text"
                  value={contactEditForm.defaultPoNumber || ''}
                  onChange={(e) =>
                    setContactEditForm((prev) => ({ ...prev, defaultPoNumber: e.target.value }))
                  }
                  placeholder="e.g. PO-88402"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* ── Section 5: Saved Locations & Addresses ── */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <MapPinIcon className="w-4 h-4 text-slate-600" />
              <span className="text-[11px] font-black tracking-wide text-slate-700 uppercase">
                Saved Addresses &amp; Locations
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Home Address
                </label>
                <input
                  type="text"
                  value={contactEditForm.homeAddress || ''}
                  onChange={(e) =>
                    setContactEditForm((prev) => ({ ...prev, homeAddress: e.target.value }))
                  }
                  placeholder="e.g. 14820 Conway Rd, Chesterfield, MO"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Work / Office Address
                </label>
                <input
                  type="text"
                  value={contactEditForm.workAddress || ''}
                  onChange={(e) =>
                    setContactEditForm((prev) => ({ ...prev, workAddress: e.target.value }))
                  }
                  placeholder="e.g. 800 N Lindbergh Blvd, St. Louis, MO"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500"
                />
              </div>
            </div>
          </div>

          {/* ── Section 6: Vehicle Preferences & Accessibility ── */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <WheelchairIcon className="w-4 h-4 text-slate-600" />
              <span className="text-[11px] font-black tracking-wide text-slate-700 uppercase">
                Vehicle Class &amp; Accessibility
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Preferred Vehicle Tier
                </label>
                <select
                  value={contactEditForm.preferredVehicleTier || 'standard'}
                  onChange={(e) =>
                    setContactEditForm((prev) => ({
                      ...prev,
                      preferredVehicleTier: e.target.value as any,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500 cursor-pointer font-medium"
                >
                  <option value="standard">Standard Sedan (Town Car)</option>
                  <option value="executive">Executive Black Car (Lincoln Continental / Mercedes)</option>
                  <option value="suv">Luxury SUV (Cadillac Escalade / Suburban)</option>
                  <option value="van">Passenger Van (High-Capacity)</option>
                  <option value="wheelchair">WAV Wheelchair Accessible Vehicle (Hydraulic Ramp)</option>
                </select>
              </div>

              <div>
                <span className="block text-[11px] font-bold text-slate-700 mb-1">
                  Mobility &amp; Assistance Needs
                </span>
                <div className="space-y-1.5 pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!contactEditForm.accessibilityNeeds?.wheelchair}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({
                          ...prev,
                          accessibilityNeeds: {
                            ...prev.accessibilityNeeds,
                            wheelchair: e.target.checked,
                          },
                        }))
                      }
                      className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    <span className="text-[11px] text-slate-700 font-medium">Wheelchair Ramp Required (WAV)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!contactEditForm.accessibilityNeeds?.walker}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({
                          ...prev,
                          accessibilityNeeds: {
                            ...prev.accessibilityNeeds,
                            walker: e.target.checked,
                          },
                        }))
                      }
                      className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    <span className="text-[11px] text-slate-700 font-medium">Folding Walker / Mobility Trunk Storage</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!contactEditForm.accessibilityNeeds?.serviceAnimal}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({
                          ...prev,
                          accessibilityNeeds: {
                            ...prev.accessibilityNeeds,
                            serviceAnimal: e.target.checked,
                          },
                        }))
                      }
                      className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    <span className="text-[11px] text-slate-700 font-medium">Certified Service Animal Accompanying</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!contactEditForm.accessibilityNeeds?.extraAssistance}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({
                          ...prev,
                          accessibilityNeeds: {
                            ...prev.accessibilityNeeds,
                            extraAssistance: e.target.checked,
                          },
                        }))
                      }
                      className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    <span className="text-[11px] text-slate-700 font-medium">Door-to-Door Arm Assistance Needed</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 7: Dispatcher & Driver Instructions ── */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
            <label className="block text-[11px] font-bold text-slate-700">
              Dispatcher &amp; Driver Notes
            </label>
            <textarea
              rows={3}
              value={contactEditForm.notes || ''}
              onChange={(e) =>
                setContactEditForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Gate code, terminal pickup preferences, baggage assistance instructions, requested drivers..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500 text-xs font-normal"
            />
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-4 sm:px-6 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 shrink-0 bg-slate-50/80">
          <a
            href={`/app/admin?tab=customers&phone=${encodeURIComponent(
              contactEditForm.phone || activeContactPhoneFallback || ''
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <ExternalLinkIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="sm:inline hidden">Open in Admin Client Directory</span>
            <span className="sm:hidden">Client Directory</span>
          </a>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl sm:rounded-lg hover:bg-slate-200/70 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSaveContact}
              className="px-4 py-2 sm:py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl sm:rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <CheckIcon className="w-3.5 h-3.5" />
              <span>Save Contact Profile</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
