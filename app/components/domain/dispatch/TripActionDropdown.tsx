import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Trip } from '../../../core/types/trip';
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

export interface TripActionDropdownProps {
  trip: Trip;
  isUnconfirmed: boolean;
  isOpen: boolean;
  isDesktop?: boolean;
  onToggle: () => void;
  onClose: () => void;
  onReview: () => void;
  onEdit: () => void;
  onFare: () => void;
  onAudit: () => void;
  onClone: () => void;
  onFocusMap: () => void;
  onStartAutoOffer?: () => void;
  onCancelAutoOffer?: () => void;
  onSendStagedToDriver?: () => void;
  onStageDriver?: () => void;
  onClearStagedDriver?: () => void;
  onCompleteTrip?: () => void;
  onCancelTrip?: () => void;
  onReactivateTrip?: () => void;
}

export function TripActionDropdown({
  trip,
  isUnconfirmed,
  isOpen,
  isDesktop = true,
  onToggle,
  onClose,
  onReview,
  onEdit,
  onFare,
  onAudit,
  onClone,
  onFocusMap,
  onStartAutoOffer,
  onCancelAutoOffer,
  onSendStagedToDriver,
  onStageDriver,
  onClearStagedDriver,
  onCompleteTrip,
  onCancelTrip,
  onReactivateTrip,
}: TripActionDropdownProps) {
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
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
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
  }, [isOpen, onClose, calculatePosition]);

  const isCompleted = trip.status === 'completed';
  const isCancelled = trip.status === 'cancelled';

  return (
    <div className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`px-2.5 py-1 rounded-lg border font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
          isOpen
            ? 'bg-blue-50 border-blue-400 text-blue-700 ring-2 ring-blue-500/20'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border-slate-300'
        }`}
        title="Trip Actions"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span>Actions</span>
        <ChevronDownIcon
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-blue-600' : 'text-slate-500'
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
          className="bg-white rounded-xl shadow-xl border border-slate-200/90 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 text-left divide-y divide-slate-100 select-none"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between bg-slate-50/60 rounded-t-xl">
            <span className="font-mono text-slate-600">Trip #{trip.id.slice(0, 8)}</span>
            <span className={`capitalize px-1.5 py-0.2 rounded-md font-bold text-[10px] ${
              isCompleted
                ? 'bg-emerald-100 text-emerald-800'
                : isCancelled
                ? 'bg-rose-100 text-rose-800'
                : 'bg-blue-100 text-blue-800'
            }`}>
              {trip.status}
            </span>
          </div>

          <div className="py-1">
            {/* On mobile: include Edit and Focus Map */}
            {!isDesktop && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEdit();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700 transition-colors cursor-pointer"
                >
                  <PencilIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>Edit Trip</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onFocusMap();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50/80 hover:text-emerald-700 transition-colors cursor-pointer"
                >
                  <MapPinIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>View on Map</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                onClose();
                onReview();
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                isUnconfirmed
                  ? 'font-bold text-amber-800 bg-amber-50/70 hover:bg-amber-100/80'
                  : 'font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700'
              }`}
            >
              <DocumentTextIcon className={`w-3.5 h-3.5 shrink-0 ${isUnconfirmed ? 'text-amber-600' : 'text-blue-500'}`} />
              <span>{isUnconfirmed ? 'Review Booking' : 'Trip Details & Audit'}</span>
            </button>

            {hasStagedDriver(trip) && onSendStagedToDriver && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSendStagedToDriver();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-extrabold text-indigo-800 bg-indigo-50/80 hover:bg-indigo-100/90 transition-colors cursor-pointer"
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
                  onClose();
                  onStageDriver();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50/80 transition-colors cursor-pointer"
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
                  onClose();
                  onClearStagedDriver();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Clear Staged Driver</span>
              </button>
            )}

            {isTripCascadeActive(trip) && onCancelAutoOffer ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCancelAutoOffer();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50/60 hover:bg-rose-100/80 transition-colors cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Cancel Cascade</span>
              </button>
            ) : canTripTriggerAutoOffer(trip) && onStartAutoOffer ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartAutoOffer();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50/90 transition-colors cursor-pointer"
              >
                <BoltIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>
                  {trip.offerCascade?.state === 'exhausted' ? 'Retry Auto-Offer' : 'Auto-Offer Cascade'}
                </span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                onClose();
                onFare();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-amber-50/80 hover:text-amber-700 transition-colors cursor-pointer"
            >
              <BoltIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Fare &amp; Rules</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onClone();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-cyan-50/80 hover:text-cyan-700 transition-colors cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
              <span>Copy Booking</span>
            </button>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                onAudit();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-purple-50/80 hover:text-purple-700 transition-colors cursor-pointer"
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
                    onClose();
                    onCompleteTrip();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
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
                      onClose();
                      onReactivateTrip();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
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
                      onClose();
                      onCancelTrip();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
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
