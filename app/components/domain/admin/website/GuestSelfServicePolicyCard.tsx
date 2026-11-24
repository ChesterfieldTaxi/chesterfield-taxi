import React from 'react';
import {
  DEFAULT_GUEST_SELF_SERVICE_POLICY,
  normalizeGuestSelfServicePolicy,
  type GuestSelfServicePolicyConfig,
} from '../../../../core/types/config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  BanIcon,
  CalendarIcon,
  EditIcon,
  LockIcon,
  PlaneIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from '../../../ui/Icons';

export interface GuestSelfServicePolicyCardProps {
  policy?: Partial<GuestSelfServicePolicyConfig> | null;
  onChange: (next: GuestSelfServicePolicyConfig) => void;
}

export function GuestSelfServicePolicyCard({
  policy,
  onChange,
}: GuestSelfServicePolicyCardProps) {
  const cfg = normalizeGuestSelfServicePolicy(policy);

  const updateField = <K extends keyof GuestSelfServicePolicyConfig>(
    key: K,
    value: GuestSelfServicePolicyConfig[K]
  ) => {
    onChange(normalizeGuestSelfServicePolicy({ ...cfg, [key]: value }));
  };

  return (
    <Card variant="elevated" className="border-indigo-200 bg-white shadow-xs">
      <CardHeader className="border-b border-indigo-100 bg-indigo-50/40 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
          <div className="min-w-0">
            <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <EditIcon className="w-5 h-5 text-indigo-600 shrink-0" />
              <span>Guest /track &ldquo;Manage My Ride&rdquo; Self-Service Policy</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Govern 4-digit phone verified self-service edits, pre-dispatch lead windows, assigned change requests, and lookup rate limits on <code>/track</code>.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 self-start shrink-0">
            <Badge
              variant={cfg.enableGuestSelfService ? 'success' : 'warning'}
              size="sm"
              className="font-bold text-[10px]"
            >
              {cfg.enableGuestSelfService ? '/track Self-Service Active' : '/track Read-Only'}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ ...DEFAULT_GUEST_SELF_SERVICE_POLICY })}
              className="text-[11px] font-bold px-2.5 py-1 inline-flex items-center gap-1"
            >
              <RefreshCwIcon className="w-3 h-3" />
              <span>Reset</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Master Kill-Switch */}
        <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/30">
          <div className="space-y-0.5 min-w-0">
            <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
              <ShieldCheckIcon className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Enable Self-Service &ldquo;Manage My Ride&rdquo; on <code>/track</code></span>
            </h4>
            <p className="text-[11px] text-slate-600">
              When turned off, tokenized tracking links show live GPS progress and ETA only, directing riders to call 24/7 Dispatch for changes.
            </p>
          </div>
          <input
            type="checkbox"
            checked={cfg.enableGuestSelfService}
            onChange={(e) => updateField('enableGuestSelfService', e.target.checked)}
            className="w-4 h-4 rounded text-indigo-600 mt-1 shrink-0 cursor-pointer"
          />
        </div>

        {/* Action Toggles Grid */}
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-3.5 transition-opacity ${
            cfg.enableGuestSelfService ? 'opacity-100' : 'opacity-55 pointer-events-none'
          }`}
        >
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5 cursor-pointer">
                <PlaneIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Instant Notes, Gate Code &amp; Flight # Edits</span>
              </label>
              <input
                type="checkbox"
                checked={cfg.allowGuestNotesAndFlightEdits}
                onChange={(e) => updateField('allowGuestNotesAndFlightEdits', e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 shrink-0 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Allows verified passengers to update curb notes, gate codes, and airline/flight numbers (stamping Driver Ack when assigned).
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5 cursor-pointer">
                <CalendarIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Pre-Dispatch Route &amp; Time Auto-Edits</span>
              </label>
              <input
                type="checkbox"
                checked={cfg.allowGuestPreDispatchRouteTimeEdits}
                onChange={(e) =>
                  updateField('allowGuestPreDispatchRouteTimeEdits', e.target.checked)
                }
                className="w-4 h-4 rounded text-blue-600 shrink-0 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Automatically applies pickup time and address changes on unassigned rides outside the minimum lead window.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5 cursor-pointer">
                <EditIcon className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                <span>Assigned Driver Change Requests</span>
              </label>
              <input
                type="checkbox"
                checked={cfg.allowGuestAssignedChangeRequests}
                onChange={(e) =>
                  updateField('allowGuestAssignedChangeRequests', e.target.checked)
                }
                className="w-4 h-4 rounded text-blue-600 shrink-0 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Queues passenger time/route edits for 1-tap Dispatch Approve/Decline once a driver is assigned or pickup is imminent.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5 cursor-pointer">
                <BanIcon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Online Self-Service Cancellation</span>
              </label>
              <input
                type="checkbox"
                checked={cfg.allowGuestCancellation}
                onChange={(e) => updateField('allowGuestCancellation', e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 shrink-0 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Permits verified online cancellation with automatic policy-tier fee preview before ride start.
            </p>
          </div>
        </div>

        {/* Numeric Thresholds */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
            <label className="text-xs font-bold text-slate-800 block">
              Pre-Dispatch Direct Edit Min Lead (Minutes)
            </label>
            <input
              type="number"
              min={0}
              max={720}
              step={5}
              value={cfg.guestDirectEditMinLeadMinutes}
              onChange={(e) =>
                updateField('guestDirectEditMinLeadMinutes', Number(e.target.value))
              }
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold bg-slate-50 focus:bg-white"
            />
            <span className="text-[10px] text-slate-500 block">
              0–720m (Default 30m). Unassigned rides closer than this switch from auto-apply to Dispatch Approval.
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <LockIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Max Lookup &amp; Verify Attempts per 5 Min</span>
            </label>
            <input
              type="number"
              min={3}
              max={30}
              step={1}
              value={cfg.maxLookupAttemptsPer5Min}
              onChange={(e) => updateField('maxLookupAttemptsPer5Min', Number(e.target.value))}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold bg-slate-50 focus:bg-white"
            />
            <span className="text-[10px] text-slate-500 block">
              3–30 attempts per IP + Trip ID (Default 5) enforced by <code>/api/track</code> brute-force shield.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
