import React from 'react';
import { getWorkspaceBus } from '../../../core/services/workspace-bus.service';
import { BuildingIcon, ChatBubbleLeftRightIcon, MailIcon, PhoneIcon, ShieldCheckIcon } from '../../ui/Icons';
import type { ResolvedClientProfileData } from './client-trip-history.util';

export interface ClientProfileHeaderCardProps {
  profile: ResolvedClientProfileData;
  onCallClient?: (phone: string, name?: string) => void;
  onOpenThread?: (target: { phone?: string; email?: string }) => void;
}

/** Persistent CRM badges, contact lines, [Call] + [Thread] actions, and dispatcher notes. */
export function ClientProfileHeaderCard({ profile, onCallClient, onOpenThread }: ClientProfileHeaderCardProps) {
  const canOpenThread = Boolean(profile.rawPhone || profile.displayEmail);
  const handleJumpToThread = () => {
    const bus = getWorkspaceBus();
    bus.publish('OPEN_COMMS_THREAD', {
      phone: profile.rawPhone || undefined,
      email: profile.displayEmail || undefined,
    });
    bus.publish('FOCUS_MODULE', { moduleKey: 'comms' });
    onOpenThread?.({ phone: profile.rawPhone || undefined, email: profile.displayEmail || undefined });
  };

  return (
    <div className="bg-surface-card rounded-xl border border-border-subtle/90 p-2.5 shadow-2xs space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {profile.isVip && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-status-warning-bg-strong text-status-warning-fg border border-status-warning-border">
              ★ VIP Client
            </span>
          )}
          {profile.isBlacklisted && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-status-danger-bg-strong text-status-danger-fg border border-status-danger-border">
              DO NOT DISPATCH
            </span>
          )}
          {profile.corporateAccountName && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-staged-bg text-status-staged-fg border border-status-staged-border">
              <BuildingIcon className="w-3 h-3 shrink-0" />
              <span>{profile.corporateAccountName}</span>
            </span>
          )}
          {profile.customerScore !== null && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-success-bg text-status-success-fg border border-status-success-border">
              <ShieldCheckIcon className="w-3 h-3 shrink-0" />
              <span>Score {profile.customerScore}</span>
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-surface-muted text-fg-strong border border-border-subtle">
            {profile.totalTrips} {profile.totalTrips === 1 ? 'Trip' : 'Trips'} · ${profile.totalSpend.toFixed(2)} Spend
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {profile.rawPhone && onCallClient && (
            <button
              type="button"
              onClick={() => onCallClient(profile.rawPhone, profile.displayName)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-status-success-bg hover:bg-status-success-bg-strong text-status-success-fg font-bold text-[11px] border border-status-success-border cursor-pointer"
            >
              <PhoneIcon className="w-3 h-3" />
              <span>Call</span>
            </button>
          )}
          {canOpenThread && (
            <button
              type="button"
              data-client-profile-thread-btn="true"
              onClick={handleJumpToThread}
              title="Open unified Comms thread"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-status-info-bg hover:bg-status-info-bg-strong text-status-info-fg font-bold text-[11px] border border-status-info-border cursor-pointer"
            >
              <ChatBubbleLeftRightIcon className="w-3 h-3" />
              <span>Thread</span>
            </button>
          )}
        </div>
      </div>

      {(profile.displayPhone || profile.displayEmail) && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-fg-secondary">
          {profile.displayPhone && (
            <span className="inline-flex items-center gap-1 font-mono">
              <PhoneIcon className="w-3 h-3 text-fg-subtle" />
              {profile.displayPhone}
            </span>
          )}
          {profile.displayEmail && (
            <span className="inline-flex items-center gap-1">
              <MailIcon className="w-3 h-3 text-fg-subtle" />
              {profile.displayEmail}
            </span>
          )}
        </div>
      )}

      {profile.dispatcherNotes && (
        <div className="p-2 rounded-lg bg-status-warning-bg/80 border border-status-warning-border text-[11px] text-status-warning-fg">
          <strong className="font-extrabold uppercase text-[9.5px] tracking-wider text-status-warning-fg block mb-0.5">
            Dispatcher Notes
          </strong>
          <span>{profile.dispatcherNotes}</span>
        </div>
      )}
    </div>
  );
}
