import React from 'react';
import {
  DEFAULT_BOOKER_ROLES,
  formatUsPhone,
  type CustomerBookingFormState,
  type SpecialRequestKey,
} from '../../../../core/hooks/booking';
import {
  MailIcon,
  MusicNoteIcon,
  PawPrintIcon,
  PhoneIcon,
  UserIcon,
  VolumeXIcon,
} from '../../../ui/Icons';

export interface CustomerPassengerNotesSectionProps {
  form: CustomerBookingFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomerBookingFormState>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showChauffeurNotes: boolean;
  setShowChauffeurNotes: React.Dispatch<React.SetStateAction<boolean>>;
  onAddPassenger: () => void;
  onRemovePassenger: (index: number) => void;
  onToggleSpecialRequest: (key: SpecialRequestKey) => void;
}

export function CustomerPassengerNotesSection({
  form,
  setForm,
  errors,
  setErrors,
  showChauffeurNotes,
  setShowChauffeurNotes,
  onAddPassenger,
  onRemovePassenger,
  onToggleSpecialRequest,
}: CustomerPassengerNotesSectionProps) {
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-3 sm:p-5 space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center justify-center">
            3
          </span>
          <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
            Passenger Details &amp; Notes
          </h2>
        </div>
        <button
          type="button"
          onClick={onAddPassenger}
          className="text-xs text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
        >
          + Add Passenger
        </button>
      </div>

      {/* Primary Passenger */}
      <div className="space-y-2.5">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <UserIcon className="w-4 h-4" />
          </div>
          <input
            type="text"
            name="passengerName"
            autoComplete="name"
            placeholder="Primary Passenger Full Name *"
            value={form.passengerName}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, passengerName: e.target.value }));
              if (errors.passengerName) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.passengerName;
                  return next;
                });
              }
            }}
            required
            className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border ${
              errors.passengerName ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
            } rounded-xl text-slate-900 text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 focus:outline-none`}
          />
          {errors.passengerName && (
            <p className="text-xs text-red-600 font-semibold mt-1 ml-1">{errors.passengerName}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <PhoneIcon className="w-4 h-4" />
              </div>
              <input
                type="tel"
                name="passengerPhone"
                placeholder="Mobile Phone (SMS updates) *"
                value={form.passengerPhone}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    passengerPhone: formatUsPhone(e.target.value),
                  }));
                  if (errors.passengerPhone) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.passengerPhone;
                      return next;
                    });
                  }
                }}
                required
                inputMode="tel"
                autoComplete="tel"
                className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border ${
                  errors.passengerPhone ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                } rounded-xl text-slate-900 text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 focus:outline-none`}
              />
            </div>
            {errors.passengerPhone && (
              <p className="text-xs text-red-600 font-semibold mt-1 ml-1">
                {errors.passengerPhone}
              </p>
            )}
          </div>
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <MailIcon className="w-4 h-4" />
              </div>
              <input
                type="email"
                name="passengerEmail"
                placeholder="Email Address (Receipts) *"
                value={form.passengerEmail}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, passengerEmail: e.target.value.trim() }));
                  if (errors.passengerEmail) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.passengerEmail;
                      return next;
                    });
                  }
                }}
                required
                inputMode="email"
                autoComplete="email"
                className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border ${
                  errors.passengerEmail ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                } rounded-xl text-slate-900 text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 focus:outline-none`}
              />
            </div>
            {errors.passengerEmail && (
              <p className="text-xs text-red-600 font-semibold mt-1 ml-1">
                {errors.passengerEmail}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Additional Passengers List */}
      {form.additionalPassengers.map((ap, idx) => (
        <div
          key={idx}
          className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2.5 border-t border-slate-100"
        >
          <div className="flex items-center gap-2 flex-1">
            <span className="text-slate-400 text-xs font-bold shrink-0">#{idx + 2}</span>
            <input
              type="text"
              placeholder={`Passenger #${idx + 2} Name`}
              value={ap.name}
              onChange={(e) => {
                const updated = [...form.additionalPassengers];
                updated[idx] = { ...updated[idx], name: e.target.value };
                setForm((prev) => ({ ...prev, additionalPassengers: updated }));
              }}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="tel"
              placeholder="Phone (optional)"
              value={ap.phone || ''}
              onChange={(e) => {
                const updated = [...form.additionalPassengers];
                updated[idx] = { ...updated[idx], phone: formatUsPhone(e.target.value) };
                setForm((prev) => ({ ...prev, additionalPassengers: updated }));
              }}
              className="flex-1 sm:w-40 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm"
            />
            <button
              type="button"
              onClick={() => onRemovePassenger(idx)}
              className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl cursor-pointer shrink-0"
              title="Remove passenger"
              aria-label={`Remove passenger ${idx + 2}`}
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {/* Booker vs Passenger Drawer */}
      <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
        <label className="flex items-center gap-2.5 cursor-pointer text-slate-800">
          <input
            type="checkbox"
            checked={form.isBookerDifferent}
            onChange={(e) => setForm((prev) => ({ ...prev, isBookerDifferent: e.target.checked }))}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="font-semibold text-xs sm:text-sm">
            Booking on behalf of someone else (Add Coordinator / Booker Contact)
          </span>
        </label>

        {form.isBookerDifferent && (
          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-[11px] uppercase font-bold text-blue-900 tracking-wide">
                Booker / Travel Coordinator Details
              </span>
              <span className="text-[11px] text-blue-700">
                Invoices &amp; receipts will be sent here
              </span>
            </div>

            <div>
              <input
                type="text"
                name="contactName"
                placeholder="Booker Name (e.g. Sarah Jenkins, Hotel Concierge) *"
                value={form.contactName}
                onChange={(e) => setForm((prev) => ({ ...prev, contactName: e.target.value }))}
                required={form.isBookerDifferent}
                className={`w-full px-3 py-2.5 bg-white border ${
                  errors.contactName ? 'border-red-400' : 'border-blue-200'
                } rounded-xl text-base sm:text-sm`}
              />
              {errors.contactName && (
                <p className="text-xs text-red-600 font-semibold mt-1">{errors.contactName}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <input
                  type="tel"
                  name="contactPhone"
                  placeholder="Booker Phone Number *"
                  value={form.contactPhone}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      contactPhone: formatUsPhone(e.target.value),
                    }))
                  }
                  required={form.isBookerDifferent}
                  inputMode="tel"
                  autoComplete="tel"
                  className={`w-full px-3 py-2.5 bg-white border ${
                    errors.contactPhone ? 'border-red-400' : 'border-blue-200'
                  } rounded-xl text-base sm:text-sm`}
                />
                {errors.contactPhone && (
                  <p className="text-xs text-red-600 font-semibold mt-1">{errors.contactPhone}</p>
                )}
              </div>
              <div>
                <input
                  type="email"
                  name="contactEmail"
                  placeholder="Booker Email Address *"
                  value={form.contactEmail}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                  required={form.isBookerDifferent}
                  className={`w-full px-3 py-2.5 bg-white border ${
                    errors.contactEmail ? 'border-red-400' : 'border-blue-200'
                  } rounded-xl text-base sm:text-sm`}
                />
                {errors.contactEmail && (
                  <p className="text-xs text-red-600 font-semibold mt-1">{errors.contactEmail}</p>
                )}
              </div>
            </div>

            <select
              value={form.contactRole}
              onChange={(e) => setForm((prev) => ({ ...prev, contactRole: e.target.value }))}
              className="w-full px-3 py-2.5 bg-white border border-blue-200 rounded-xl text-base sm:text-sm text-slate-800"
            >
              {DEFAULT_BOOKER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Collapsible Special Requests, Gate Code & Driver Notes */}
      <div className="pt-2.5 border-t border-slate-100 space-y-3">
        <button
          type="button"
          onClick={() => setShowChauffeurNotes((prev) => !prev)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-700 hover:text-blue-700 cursor-pointer"
        >
          <span>
            Special Requests, Gate Code &amp; Driver Notes{' '}
            <span className="font-normal text-slate-400">(Optional)</span>
          </span>
          <span className="text-blue-600 font-bold">
            {showChauffeurNotes || form.gateCode || form.driverNotes ? 'Hide ▲' : 'Add Notes ▾'}
          </span>
        </button>

        {(showChauffeurNotes ||
          Boolean(form.gateCode) ||
          Boolean(form.driverNotes) ||
          Object.values(form.specialRequests).some(Boolean)) && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'petFriendly', label: 'Pet-Friendly', Icon: PawPrintIcon },
                { key: 'quietRide', label: 'Quiet Ride', Icon: VolumeXIcon },
                { key: 'musicOk', label: 'Music OK', Icon: MusicNoteIcon },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onToggleSpecialRequest(item.key as SpecialRequestKey)}
                  className={`py-2 px-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    form.specialRequests[item.key as SpecialRequestKey]
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <item.Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label
                  htmlFor="gateCode"
                  className="block text-[11px] text-slate-600 font-semibold mb-1"
                >
                  Subdivision / Gate Code
                </label>
                <input
                  id="gateCode"
                  type="text"
                  placeholder="e.g. #1234 or Call box"
                  value={form.gateCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, gateCode: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="driverNotes"
                  className="block text-[11px] text-slate-600 font-semibold mb-1"
                >
                  Notes for Driver
                </label>
                <input
                  id="driverNotes"
                  type="text"
                  placeholder="e.g. Side entrance pickup, white house with brick driveway..."
                  value={form.driverNotes}
                  onChange={(e) => setForm((prev) => ({ ...prev, driverNotes: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
