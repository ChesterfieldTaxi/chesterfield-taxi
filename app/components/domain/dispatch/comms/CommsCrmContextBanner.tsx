import type React from 'react';
import type { CommsCrmContextSummary } from '../../../../core/services/comms/comms-templates.service';
import type { WorkspaceEventMap } from '../../../../core/services/workspace-bus.service';
import {
  AccessibilityIcon,
  AlertTriangleIcon,
  BanIcon,
  BuildingIcon,
  CarIcon,
  ExternalLinkIcon,
  PlaneIcon,
  RepeatIcon,
  StarIcon,
} from '../../../ui/Icons';

export interface CommsCrmContextBannerProps {
  crmContext: CommsCrmContextSummary | null | undefined;
  variant?: 'light' | 'dark';
  /** Hide completely when caller/contact has zero CRM flags, trips, or saved profile */
  hideWhenUnknown?: boolean;
  /** Show resolved caller/contact name row (ideal for live Softphone dialpad lookup) */
  showIdentityHeader?: boolean;
  onOpenTrip?: (tripId: string) => void;
  onRebookLastRide?: (payload: WorkspaceEventMap['POPULATE_BOOKING']) => void;
  onSelectThread?: (selectorTarget: string) => void;
}

const LIGHT_FLIGHT_TONES: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-100 text-amber-900 border-amber-300',
  rose: 'bg-rose-100 text-rose-800 border-rose-300',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

const DARK_FLIGHT_TONES: Record<string, string> = {
  emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/25 text-amber-200 border-amber-400/40',
  rose: 'bg-rose-500/25 text-rose-200 border-rose-400/40',
  blue: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
  slate: 'bg-slate-700/80 text-slate-200 border-slate-600',
};

const LIGHT_STATUS_TONES: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-800',
  blue: 'bg-blue-100 text-blue-800',
  amber: 'bg-amber-100 text-amber-800',
  indigo: 'bg-indigo-100 text-indigo-800',
  slate: 'bg-slate-200 text-slate-700',
};

const DARK_STATUS_TONES: Record<string, string> = {
  emerald: 'bg-emerald-500/20 text-emerald-300',
  blue: 'bg-blue-500/20 text-blue-300',
  amber: 'bg-amber-500/20 text-amber-300',
  indigo: 'bg-indigo-500/20 text-indigo-300',
  slate: 'bg-slate-700 text-slate-300',
};

export const CommsCrmContextBanner: React.FC<CommsCrmContextBannerProps> = ({
  crmContext,
  variant = 'light',
  hideWhenUnknown = false,
  showIdentityHeader = false,
  onOpenTrip,
  onRebookLastRide,
  onSelectThread,
}) => {
  if (!crmContext) return null;

  const hasBadgesOrNotes = Boolean(
    crmContext.isBlacklisted ||
      crmContext.isVip ||
      crmContext.isDriver ||
      crmContext.corporateAccountName ||
      crmContext.corporateAccountNumber ||
      crmContext.preferredVehicleLabel ||
      crmContext.accessibilityBadges.length > 0 ||
      crmContext.activeTrips.length > 0 ||
      crmContext.rebookPayload ||
      crmContext.internalNotes
  );

  if (hideWhenUnknown && !crmContext.hasKnownContext) {
    return null;
  }

  if (!showIdentityHeader && !hasBadgesOrNotes) {
    return null;
  }

  const isDark = variant === 'dark';
  const primaryActiveTrip = crmContext.activeTrips[0];
  const extraActiveCount = Math.max(0, crmContext.activeTrips.length - 1);
  const selectorTarget =
    crmContext.primaryPhone || crmContext.primaryEmail || crmContext.threadId || '';

  return (
    <div
      className={`shrink-0 text-left transition-all ${
        isDark
          ? 'rounded-2xl bg-slate-800/90 border border-slate-700/90 p-2.5 space-y-2'
          : showIdentityHeader
          ? 'rounded-2xl bg-slate-50 border border-slate-200 p-2.5 space-y-2 shadow-2xs'
          : 'border-b border-slate-200 bg-slate-50/85 px-3 py-2 space-y-1.5'
      }`}
    >
      {/* 1. Prominent Blacklist Governance Alert */}
      {crmContext.isBlacklisted && (
        <div
          className={`flex items-start gap-2 rounded-xl px-2.5 py-1.5 text-[11px] border ${
            isDark
              ? 'bg-rose-950/80 border-rose-500/60 text-rose-100'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <BanIcon
            className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
              isDark ? 'text-rose-400' : 'text-rose-600'
            }`}
          />
          <div className="min-w-0 flex-1 leading-tight">
            <span className="font-black uppercase tracking-wider">
              Do Not Dispatch · Blacklisted
            </span>
            {crmContext.blacklistReason && (
              <span className={isDark ? 'text-rose-200 ml-1.5' : 'text-rose-800 ml-1.5'}>
                — {crmContext.blacklistReason}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 2. Optional Live Caller / Dialpad Identity Row */}
      {showIdentityHeader && crmContext.hasKnownContext && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-xs font-extrabold truncate ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {crmContext.contactName}
            </span>
            {crmContext.tripCount > 0 && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full ${
                  isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {crmContext.tripCount} {crmContext.tripCount === 1 ? 'ride' : 'rides'}
              </span>
            )}
          </div>

          {onSelectThread && selectorTarget && (
            <button
              type="button"
              onClick={() => onSelectThread(selectorTarget)}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-lg cursor-pointer transition-colors shrink-0 ${
                isDark
                  ? 'bg-slate-700 hover:bg-slate-600 text-blue-300'
                  : 'bg-white hover:bg-blue-50 text-blue-700 border border-slate-200'
              }`}
            >
              Open Thread
            </button>
          )}
        </div>
      )}

      {/* 3. CRM Profile Pills (VIP, Driver, Corporate Account, Accessibility, Vehicle Tier, Rebook) */}
      {(crmContext.isVip ||
        crmContext.isDriver ||
        crmContext.corporateAccountName ||
        crmContext.corporateAccountNumber ||
        crmContext.preferredVehicleLabel ||
        crmContext.accessibilityBadges.length > 0 ||
        crmContext.rebookPayload) && (
        <div className="flex items-center justify-between gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {crmContext.isVip && (
              <span
                title={crmContext.vipReason || 'Priority VIP Passenger'}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide border ${
                  isDark
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                }`}
              >
                <StarIcon className="w-2.5 h-2.5" />
                <span>VIP{crmContext.vipReason ? ` · ${crmContext.vipReason}` : ''}</span>
              </span>
            )}

            {crmContext.isDriver && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
                  isDark
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                }`}
              >
                <CarIcon className="w-2.5 h-2.5" />
                <span>Fleet Driver{crmContext.driverUnit ? ` · ${crmContext.driverUnit}` : ''}</span>
              </span>
            )}

            {(crmContext.corporateAccountName || crmContext.corporateAccountNumber) && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
                  isDark
                    ? 'bg-indigo-500/20 text-indigo-200 border-indigo-400/30'
                    : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                }`}
              >
                <BuildingIcon className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate max-w-[180px]">
                  {crmContext.corporateAccountName || 'Corporate'}
                  {crmContext.corporateAccountNumber
                    ? ` #${crmContext.corporateAccountNumber.replace(/^#/, '')}`
                    : ''}
                </span>
              </span>
            )}

            {crmContext.preferredVehicleLabel && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${
                  isDark
                    ? 'bg-slate-700/80 text-slate-200 border-slate-600'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                <CarIcon className="w-2.5 h-2.5 shrink-0" />
                <span>Pref: {crmContext.preferredVehicleLabel}</span>
              </span>
            )}

            {crmContext.accessibilityBadges.map((badge) => (
              <span
                key={badge}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
                  isDark
                    ? 'bg-sky-500/20 text-sky-200 border-sky-400/30'
                    : 'bg-sky-50 text-sky-800 border-sky-200'
                }`}
              >
                <AccessibilityIcon className="w-2.5 h-2.5 shrink-0" />
                <span>{badge}</span>
              </span>
            ))}
          </div>

          {/* 1-Tap Rebook Last Ride */}
          {crmContext.rebookPayload && onRebookLastRide && (
            <button
              type="button"
              onClick={() => onRebookLastRide(crmContext.rebookPayload!)}
              title={
                crmContext.lastCompletedTrip
                  ? `Rebook ${crmContext.lastCompletedTrip.pickupLocation?.address || ''} -> ${
                      crmContext.lastCompletedTrip.dropoffLocation?.address || ''
                    }`
                  : 'Populate Dispatch Booking from last completed trip'
              }
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold transition-colors cursor-pointer shrink-0 border ${
                isDark
                  ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500'
                  : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200 shadow-2xs'
              }`}
            >
              <RepeatIcon className="w-2.5 h-2.5 shrink-0" />
              <span>Rebook Last Ride</span>
            </button>
          )}
        </div>
      )}

      {/* 4. Active / Upcoming Trip Pill (Car #, Flight Delay Badge & 1-Tap Open Trip) */}
      {primaryActiveTrip && (
        <div
          className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 border ${
            isDark
              ? 'bg-slate-900/90 border-blue-500/30 text-slate-100'
              : 'bg-blue-50/80 border-blue-200/90 text-slate-900'
          }`}
        >
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`text-[10px] font-mono font-black ${
                  isDark ? 'text-blue-300' : 'text-blue-900'
                }`}
              >
                {primaryActiveTrip.tripId}
              </span>
              <span
                className={`text-[9.5px] font-extrabold px-1.5 py-0.2 rounded-md ${
                  isDark
                    ? DARK_STATUS_TONES[primaryActiveTrip.statusTone] || DARK_STATUS_TONES.slate
                    : LIGHT_STATUS_TONES[primaryActiveTrip.statusTone] || LIGHT_STATUS_TONES.slate
                }`}
              >
                {primaryActiveTrip.statusLabel}
              </span>
              <span
                className={`text-[10px] font-bold ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                {primaryActiveTrip.pickupTimeLabel}
              </span>

              {primaryActiveTrip.carUnit && (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.2 rounded-md border ${
                    isDark
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-emerald-100/90 text-emerald-900 border-emerald-300'
                  }`}
                >
                  <CarIcon className="w-2.5 h-2.5 shrink-0" />
                  <span>
                    {primaryActiveTrip.driverName
                      ? `${primaryActiveTrip.driverName} · ${primaryActiveTrip.carUnit}`
                      : primaryActiveTrip.carUnit}
                  </span>
                </span>
              )}

              {primaryActiveTrip.flightBadge && (
                <span
                  title={primaryActiveTrip.flightBadge.pickupDoorGuidance || primaryActiveTrip.flightBadge.label}
                  className={`inline-flex items-center gap-1 text-[9.5px] font-extrabold px-1.5 py-0.2 rounded-md border ${
                    isDark
                      ? DARK_FLIGHT_TONES[primaryActiveTrip.flightBadge.tone] ||
                        DARK_FLIGHT_TONES.slate
                      : LIGHT_FLIGHT_TONES[primaryActiveTrip.flightBadge.tone] ||
                        LIGHT_FLIGHT_TONES.slate
                  }`}
                >
                  {primaryActiveTrip.flightBadge.delayMinutes >= 15 ? (
                    <AlertTriangleIcon className="w-2.5 h-2.5 shrink-0" />
                  ) : (
                    <PlaneIcon className="w-2.5 h-2.5 shrink-0" />
                  )}
                  <span>{primaryActiveTrip.flightBadge.label}</span>
                </span>
              )}

              {extraActiveCount > 0 && (
                <span
                  className={`text-[9.5px] font-bold ${
                    isDark ? 'text-blue-300' : 'text-blue-700'
                  }`}
                >
                  +{extraActiveCount} more
                </span>
              )}
            </div>

            <p
              className={`text-[10.5px] truncate ${
                isDark ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              {primaryActiveTrip.pickupShort} ➔ {primaryActiveTrip.dropoffShort}
            </p>
          </div>

          {onOpenTrip && (
            <button
              type="button"
              onClick={() => onOpenTrip(primaryActiveTrip.tripId)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-extrabold transition-colors cursor-pointer shrink-0 ${
                isDark
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs'
              }`}
            >
              <span>Open Trip</span>
              <ExternalLinkIcon className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}

      {/* 5. Compact Dispatcher Internal Profile Note Hint */}
      {crmContext.internalNotes && (
        <p
          className={`text-[10px] line-clamp-1 italic ${
            isDark ? 'text-amber-200/90' : 'text-amber-900/90'
          }`}
          title={crmContext.internalNotes}
        >
          <span className="font-bold not-italic">CRM Note:</span> {crmContext.internalNotes}
        </p>
      )}
    </div>
  );
};
