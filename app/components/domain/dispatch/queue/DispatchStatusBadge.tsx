import React from 'react';
import type { TripStatus } from '../../../../core/types/trip';
import {
  evaluateTripDriverLateStatus,
  type DriverLateEvalTrip,
} from '../../../../core/hooks/dispatch/dispatch-workspace.util';

export interface DispatchStatusBadgeOptions {
  compact?: boolean;
  className?: string;
  trip?: Partial<DriverLateEvalTrip> | null;
  nowMs?: number;
}

export interface DispatchStatusMeta {
  key: string;
  label: string;
  tooltip: string;
  pillClass: string;
}

const STATUS_META_BY_KEY: Record<string, DispatchStatusMeta> = {
  late: { key: 'late', label: 'Late', tooltip: 'Late — Past scheduled pickup time', pillClass: 'bg-rose-600 text-white border-rose-500 animate-pulse' },
  unconfirmed: { key: 'unconfirmed', label: 'Unconfirmed', tooltip: 'Unconfirmed — Awaiting dispatch review', pillClass: 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border animate-pulse' },
  confirmed: { key: 'confirmed', label: 'Confirmed', tooltip: 'Confirmed — Ready for dispatch', pillClass: 'bg-status-info-bg-strong text-status-info-fg border-status-info-border' },
  pending: { key: 'pending', label: 'Pending', tooltip: 'Pending — Queued', pillClass: 'bg-status-warning-bg text-status-warning-fg border-status-warning-border' },
  offered: { key: 'offered', label: 'Offered', tooltip: 'Offered — Waiting for driver response', pillClass: 'bg-status-info-bg-strong text-status-info-fg border-status-info-border dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-700' },
  assigned: { key: 'assigned', label: 'Assigned', tooltip: 'Assigned to driver', pillClass: 'bg-status-success-bg-strong text-status-success-fg border-status-success-border' },
  accepted: { key: 'accepted', label: 'Accepted', tooltip: 'Accepted — Driver acknowledged', pillClass: 'bg-status-staged-bg-strong text-status-staged-fg border-status-staged-border dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-700' },
  en_route: { key: 'en_route', label: 'En Route', tooltip: 'En Route to pickup', pillClass: 'bg-status-staged-bg-strong text-status-staged-fg border-status-staged-border' },
  arrived: { key: 'arrived', label: 'Arrived', tooltip: 'Arrived at pickup', pillClass: 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/80 dark:text-orange-300 dark:border-orange-700' },
  in_progress: { key: 'in_progress', label: 'In Progress', tooltip: 'In Progress — Passenger on board', pillClass: 'bg-status-success-bg-strong text-status-success-fg border-status-success-border' },
  completed: { key: 'completed', label: 'Completed', tooltip: 'Completed', pillClass: 'bg-emerald-700 text-white border-emerald-600' },
  cancelled: { key: 'cancelled', label: 'Cancelled', tooltip: 'Cancelled', pillClass: 'bg-status-danger-bg-strong text-status-danger-fg border-status-danger-border' },
  declined: { key: 'declined', label: 'Declined', tooltip: 'Declined', pillClass: 'bg-surface-emphasis text-fg-secondary border-border-strong' },
};

export function resolveDispatchStatusMeta(
  status: TripStatus | string,
  trip?: Partial<DriverLateEvalTrip> | null,
  nowMs?: number
): DispatchStatusMeta {
  const normalized = String(trip?.status || status || '').trim().toLowerCase();
  if (trip) {
    const lateEval = evaluateTripDriverLateStatus(trip, nowMs);
    if (lateEval.isLate) {
      const underlying = STATUS_META_BY_KEY[normalized]?.label || 'Assigned';
      return {
        ...STATUS_META_BY_KEY.late,
        tooltip: `Late (+${lateEval.lateMinutes}m) — ${underlying}`,
      };
    }
  }
  const matched = STATUS_META_BY_KEY[normalized];
  if (matched) return matched;
  const fallbackLabel = String(status || 'Unknown').replace(/_/g, ' ');
  return {
    key: normalized || 'unknown',
    label: fallbackLabel,
    tooltip: fallbackLabel,
    pillClass: 'bg-surface-muted text-fg-secondary border-border-strong',
  };
}

function renderStatusSvgIcon(key: string): React.ReactElement {
  const svgProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.25,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'w-3.5 h-3.5 shrink-0',
    'aria-hidden': true,
  };

  switch (key) {
    case 'late':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2.5" />
          <path d="M5 3 2 6" />
          <path d="m22 6-3-3" />
        </svg>
      );
    case 'unconfirmed':
      return (
        <svg {...svgProps}>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
      );
    case 'confirmed':
      return (
        <svg {...svgProps} strokeWidth={2.75}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case 'pending':
      return (
        <svg {...svgProps}>
          <path d="M6 2h12" />
          <path d="M6 22h12" />
          <path d="M7 2v4a5 5 0 0 0 5 5 5 5 0 0 0 5-5V2" />
          <path d="M7 22v-4a5 5 0 0 1 5-5 5 5 0 0 1 5 5v4" />
        </svg>
      );
    case 'offered':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="2" />
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
          <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
        </svg>
      );
    case 'assigned':
      return (
        <svg {...svgProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="m16 11 2 2 4-4" />
        </svg>
      );
    case 'accepted':
      return (
        <svg {...svgProps} strokeWidth={2.5}>
          <path d="M18 6 7 17l-5-5" />
          <path d="m22 10-7.5 7.5L13 16" />
        </svg>
      );
    case 'en_route':
      return (
        <svg {...svgProps}>
          <polygon points="3 11 22 2 13 21 11 13 3 11" />
        </svg>
      );
    case 'arrived':
      return (
        <svg {...svgProps}>
          <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case 'in_progress':
      return (
        <svg {...svgProps}>
          <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'completed':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'cancelled':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="m15 9-6 6" />
          <path d="m9 9 6 6" />
        </svg>
      );
    case 'declined':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="m4.93 4.93 14.14 14.14" />
        </svg>
      );
    default:
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      );
  }
}

export function DispatchStatusBadge({
  status,
  compact = true,
  className = '',
  trip,
  nowMs,
}: {
  status: TripStatus | string;
  compact?: boolean;
  className?: string;
  trip?: Partial<DriverLateEvalTrip> | null;
  nowMs?: number;
}): React.ReactElement {
  const meta = resolveDispatchStatusMeta(status, trip, nowMs);
  const baseClass = compact
    ? 'inline-flex items-center justify-center h-6 min-w-[26px] px-1.5 rounded-full border shadow-2xs'
    : 'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-bold border shadow-2xs whitespace-nowrap';

  return (
    <span
      role="status"
      aria-label={meta.tooltip}
      title={meta.tooltip}
      data-status-badge={meta.key}
      className={`${baseClass} ${meta.pillClass} ${className}`.trim()}
    >
      {meta.key === 'in_progress' && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping mr-1 shrink-0" aria-hidden="true" />
      )}
      {renderStatusSvgIcon(meta.key)}
      {!compact && <span>{meta.label}</span>}
    </span>
  );
}

export function getDispatchStatusBadge(
  status: TripStatus | string,
  options?: DispatchStatusBadgeOptions
): React.ReactElement {
  return (
    <DispatchStatusBadge
      status={status}
      compact={options?.compact ?? true}
      className={options?.className}
      trip={options?.trip}
      nowMs={options?.nowMs}
    />
  );
}
