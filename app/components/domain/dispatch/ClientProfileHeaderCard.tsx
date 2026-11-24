import React from 'react';
import { BuildingIcon, MailIcon, PhoneIcon, ShieldCheckIcon } from '../../ui/Icons';
import type { ResolvedClientProfileData } from './client-trip-history.util';

export interface ClientProfileHeaderCardProps {
  profile: ResolvedClientProfileData;
  onCallClient?: (phone: string, name?: string) => void;
}

/** CRM badges, contact lines, metrics, and dispatcher notes for the Client Profile window. */
export function ClientProfileHeaderCard({ profile, onCallClient }: ClientProfileHeaderCardProps) {
  return (
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
  );
}
