import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Trip } from '../../../core/types/trip';
import type { DispatchStagedPlannerController } from '../../../core/hooks/dispatch/useDispatchStagedPlanner';
import {
  canTripTriggerAutoOffer,
  isTripCascadeActive,
} from './DispatchCascadeSlaBadges';
import {
  ChevronDownIcon,
  PencilIcon,
  MapPinIcon,
  DocumentTextIcon,
  BoltIcon,
  RadarBroadcastIcon,
  CarIcon,
  PlusIcon,
  ShieldCheckIcon,
  CheckIcon,
  RefreshCwIcon,
  BanIcon,
  XIcon,
} from '../../ui/Icons';
import {
  hasStagedDriver,
  isTripEligibleForStaging,
} from '../../../core/services/dispatch/staged-driver-planner.service';
import { hasTripLinkedCounterpart } from './client-profile-workflows.util';

export interface DispatchUniversalTripActions {
  onReview: (trip: Trip, initialTab?: 'details' | 'audit') => void;
  onEdit: (trip: Trip) => void;
  onFare: (trip: Trip) => void;
  onClone: (trip: Trip) => void;
  onCreateReturnBooking?: (trip: Trip) => void;
  onFocusMap: (trip: Trip) => void;
  onStartAutoOffer?: (trip: Trip) => void | Promise<void>;
  onCancelAutoOffer?: (trip: Trip) => void | Promise<void>;
  onOpenDriverPicker?: (trip: Trip) => void;
  onCompleteTrip: (trip: Trip) => void;
  onCancelTrip: (trip: Trip) => void;
  onReactivateTrip: (trip: Trip) => void;
  stagedPlanner?: DispatchStagedPlannerController;
}

export interface TripActionDropdownProps {
  trip: Trip;
  isUnconfirmed: boolean;
  isOpen?: boolean;
  isDesktop?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  onReview: () => void;
  onEdit: () => void;
  onFare: () => void;
  onAudit: () => void;
  onClone: () => void;
  onCreateReturnBooking?: () => void;
  isLinkedTrip?: boolean;
  onFocusMap: () => void;
  onStartAutoOffer?: () => void;
  onCancelAutoOffer?: () => void;
  onSendStagedToDriver?: () => void;
  onStageDriver?: () => void;
  onClearStagedDriver?: () => void;
  onCompleteTrip?: () => void;
  onCancelTrip?: () => void;
  onReactivateTrip?: () => void;
  showEditOnDesktop?: boolean;
  showFocusMapOnDesktop?: boolean;
  hideEdit?: boolean;
  hideReview?: boolean;
  compact?: boolean;
  variant?: 'light' | 'dark';
}

export function TripActionDropdown({
  trip,
  isUnconfirmed,
  isOpen: controlledIsOpen,
  isDesktop = true,
  onToggle,
  onClose,
  onReview,
  onEdit,
  onFare,
  onAudit,
  onClone,
  onCreateReturnBooking,
  isLinkedTrip,
  onFocusMap,
  onStartAutoOffer,
  onCancelAutoOffer,
  onSendStagedToDriver,
  onStageDriver,
  onClearStagedDriver,
  onCompleteTrip,
  onCancelTrip,
  onReactivateTrip,
  showEditOnDesktop = false,
  showFocusMapOnDesktop = false,
  hideEdit = false,
  hideReview = false,
  compact = false,
  variant = 'light',
}: TripActionDropdownProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = typeof controlledIsOpen === 'boolean';
  const isOpen = isControlled ? controlledIsOpen : uncontrolledOpen;

  const handleToggle = useCallback(() => {
    if (onToggle) {
      onToggle();
    } else {
      setUncontrolledOpen((prev) => !prev);
    }
  }, [onToggle]);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      setUncontrolledOpen(false);
    }
  }, [onClose]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; openUpward: boolean } | null>(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuEl = menuRef.current;
    const menuWidth = 208; // width in px
    // Use measured height if mounted, otherwise estimate based on items
    const menuHeight = menuEl?.offsetHeight || (isUnconfirmed ? 200 : 165);
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Overlay directly below if there is enough space, otherwise overlay directly above
    const openUpward = spaceBelow < (menuHeight + 8) && spaceAbove > spaceBelow;

    const top = openUpward
      ? Math.max(8, rect.top - menuHeight - 4)
      : Math.min(viewportHeight - menuHeight - 8, rect.bottom + 4);

    // Align dropdown right edge with the trigger button right edge
    let left = rect.right - menuWidth;
    if (left < 8) {
      left = Math.max(8, rect.left);
    }
    if (left + menuWidth > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - menuWidth - 8);
    }

    return { top, left, openUpward };
  }, [isUnconfirmed]);

  // Synchronously compute trigger coordinates before browser paint to prevent flying from (0,0)
  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }
    const initial = calculatePosition();
    if (initial) {
      setCoords(initial);
    }
  }, [isOpen, calculatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const updated = calculatePosition();
      if (updated) setCoords(updated);
    };

    // Re-measure on next animation frame after portal mounts to ensure exact DOM height
    const rafId = requestAnimationFrame(updatePosition);

    function handleClickOutside(event: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(event.target as Node) &&
        menuRef.current && !menuRef.current.contains(event.target as Node)
      ) {
        handleClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        handleClose();
      }
    }

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose, calculatePosition]);

  const normStatus = String(trip.status || '').toLowerCase();
  const isCompleted = normStatus === 'completed';
  const isCancelled = normStatus === 'cancelled' || normStatus === 'declined';
  const effectiveIsLinkedTrip = isLinkedTrip ?? hasTripLinkedCounterpart(trip);
  const shouldShowEdit = !hideEdit && (!isDesktop || showEditOnDesktop);
  const shouldShowFocusMap = !isDesktop || showFocusMapOnDesktop;

  return (
    <div className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleToggle();
        }}
        className={`${
          compact ? 'px-2 py-0.5 text-[11px] rounded-md gap-1' : 'px-2.5 py-1 text-xs rounded-lg gap-1.5'
        } border font-bold flex items-center transition-all cursor-pointer shadow-2xs ${
          variant === 'dark'
            ? isOpen
              ? 'bg-blue-600 border-blue-500 text-white ring-2 ring-blue-400/30'
              : 'bg-surface-header-elevated hover:bg-surface-header-muted text-fg-on-header border-border-header'
            : isOpen
            ? 'bg-status-info-bg border-blue-400 text-status-info-fg ring-2 ring-blue-500/20'
            : 'bg-surface-muted hover:bg-surface-emphasis text-fg-secondary hover:text-fg-primary border-border-strong'
        }`}
        title="Trip Actions"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span>Actions</span>
        <ChevronDownIcon
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
            isOpen
              ? variant === 'dark'
                ? 'rotate-180 text-white'
                : 'rotate-180 text-blue-600'
              : variant === 'dark'
              ? 'text-slate-300'
              : 'text-fg-muted'
          }`}
        />
      </button>

      {isOpen && coords !== null && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: '208px',
            zIndex: 99999,
            transformOrigin: coords.openUpward ? 'bottom right' : 'top right',
          }}
          className="bg-surface-card rounded-xl shadow-xl border border-border-subtle/90 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 text-left divide-y divide-border-faint select-none"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] font-extrabold text-fg-subtle uppercase tracking-wider flex items-center justify-between bg-surface-subtle/60 rounded-t-xl">
            <span className="font-mono text-fg-secondary">Trip #{trip.id.slice(0, 8)}</span>
            <span className={`capitalize px-1.5 py-0.2 rounded-md font-bold text-[10px] ${
              isCompleted
                ? 'bg-status-success-bg-strong text-status-success-fg'
                : isCancelled
                ? 'bg-status-danger-bg-strong text-status-danger-fg'
                : 'bg-status-info-bg-strong text-status-info-fg'
            }`}>
              {trip.status}
            </span>
          </div>

          <div className="py-1">
            {shouldShowEdit && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onEdit();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-status-info-bg/80 hover:text-status-info-fg transition-colors cursor-pointer"
              >
                <PencilIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>Edit Trip</span>
              </button>
            )}

            {shouldShowFocusMap && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onFocusMap();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-status-success-bg/80 hover:text-status-success-fg transition-colors cursor-pointer"
              >
                <MapPinIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>View on Map</span>
              </button>
            )}

            {!hideReview && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onReview();
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                  isUnconfirmed
                    ? 'font-bold text-status-warning-fg bg-status-warning-bg/70 hover:bg-status-warning-bg-strong/80'
                    : 'font-semibold text-fg-secondary hover:bg-status-info-bg/80 hover:text-status-info-fg'
                }`}
              >
                <DocumentTextIcon className={`w-3.5 h-3.5 shrink-0 ${isUnconfirmed ? 'text-amber-600' : 'text-blue-500'}`} />
                <span>{isUnconfirmed ? 'Review Booking' : 'Trip Details & Audit'}</span>
              </button>
            )}

            {hasStagedDriver(trip) && onSendStagedToDriver && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onSendStagedToDriver();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-extrabold text-status-staged-fg bg-status-staged-bg/80 hover:bg-status-staged-bg-strong/90 transition-colors cursor-pointer"
                title="Send staged placeholder live to driver"
              >
                <CarIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="truncate">
                  Send to Driver ({trip.plannedDriverLabel || 'Staged'})
                </span>
              </button>
            )}

            {isTripEligibleForStaging(trip) && onStageDriver && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onStageDriver();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-status-staged-fg hover:bg-status-staged-bg/80 transition-colors cursor-pointer"
                title="Stage a driver shift placeholder (held in Dispatch)"
              >
                <CarIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>
                  {hasStagedDriver(trip) ? 'Change Staged Driver' : 'Stage Driver (Hold)'}
                </span>
              </button>
            )}

            {hasStagedDriver(trip) && onClearStagedDriver && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onClearStagedDriver();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-status-danger-bg hover:text-status-danger-fg transition-colors cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
                <span>Clear Staged Driver</span>
              </button>
            )}

            {isTripCascadeActive(trip) && onCancelAutoOffer ? (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onCancelAutoOffer();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-status-danger-fg bg-status-danger-bg/60 hover:bg-status-danger-bg-strong/80 transition-colors cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Cancel Cascade</span>
              </button>
            ) : canTripTriggerAutoOffer(trip) && onStartAutoOffer ? (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onStartAutoOffer();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-status-staged-fg hover:bg-status-staged-bg/90 transition-colors cursor-pointer"
              >
                <RadarBroadcastIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>
                  {trip.offerCascade?.state === 'exhausted' ? 'Retry Auto-Offer' : 'Auto-Offer Cascade'}
                </span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                handleClose();
                onFare();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-status-warning-bg/80 hover:text-status-warning-fg transition-colors cursor-pointer"
            >
              <BoltIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Fare &amp; Rules</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleClose();
                onClone();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-status-info-bg/80 hover:text-status-info-fg transition-colors cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
              <span>Copy Booking</span>
            </button>

            {onCreateReturnBooking && !isCancelled && !effectiveIsLinkedTrip && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onCreateReturnBooking();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-status-info-bg/80 hover:text-status-info-fg transition-colors cursor-pointer"
                title="Open a linked return booking with the route reversed"
              >
                <RefreshCwIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>Create Return Booking</span>
              </button>
            )}
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                handleClose();
                onAudit();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-status-staged-bg/80 hover:text-purple-700 transition-colors cursor-pointer"
            >
              <ShieldCheckIcon className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span>Audit Trail Log</span>
            </button>
          </div>

          {!isCompleted && (
            <div className="py-1">
              {!isCancelled && onCompleteTrip && (
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    onCompleteTrip();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-status-success-fg hover:bg-status-success-bg transition-colors cursor-pointer"
                >
                  <CheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Complete Trip</span>
                </button>
              )}
              {isCancelled ? (
                onReactivateTrip && (
                  <button
                    type="button"
                    onClick={() => {
                      handleClose();
                      onReactivateTrip();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-status-success-fg hover:bg-status-success-bg transition-colors cursor-pointer"
                  >
                    <RefreshCwIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Reactivate Trip</span>
                  </button>
                )
              ) : (
                onCancelTrip && (
                  <button
                    type="button"
                    onClick={() => {
                      handleClose();
                      onCancelTrip();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-status-danger-fg hover:bg-status-danger-bg transition-colors cursor-pointer"
                  >
                    <BanIcon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Cancel Trip</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
