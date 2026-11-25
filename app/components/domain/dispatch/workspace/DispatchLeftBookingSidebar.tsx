import React from 'react';
import type { DispatchAutomationConfig } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import type { DispatchFormValues } from '../DispatchBookingEngine';
import type { DispatchBookingFeedback } from '../booking/useDispatchBookingSubmission';
import { MemoizedDraftBookingPane } from '../MemoizedDraftBookingPane';
import { getTripCascadeExhaustedTooltip } from '../DispatchCascadeSlaBadges';
import {
  TripActionDropdown,
  type DispatchUniversalTripActions,
} from '../TripActionDropdown';
import { DriverAssignDropdown } from '../queue/DriverAssignDropdown';
import { getDispatchStatusBadge } from '../queue/TripQueueToolbar';
import {
  hasStagedDriver,
  isTripEligibleForStaging,
} from '../../../../core/services/dispatch/staged-driver-planner.service';
import {
  getDraftTabLabel,
  useLiveClockNowMs,
  type DispatchMobileTab,
  type DispatchResizeHandle,
  type DraftTab,
} from '../../../../core/hooks/dispatch';
import {
  DocumentTextIcon,
  ChevronDownIcon,
  XIcon,
  PencilIcon,
  PlusIcon,
} from '../../../ui/Icons';

export interface DispatchLeftBookingSidebarProps {
  isDesktop: boolean;
  sidebarWidth: number;
  activeMobileTab: DispatchMobileTab;
  activeResizeHandle: DispatchResizeHandle;
  onSidebarMouseDown: (e: React.MouseEvent | React.PointerEvent) => void;
  onResetSidebarWidth: () => void;

  // Draft tabs
  drafts: DraftTab[];
  maxDrafts: number;
  activeDraftId: string;
  onActiveDraftIdChange: (id: string) => void;
  onCreateDraft: () => void;
  onCloseDraft: (id: string, e: React.MouseEvent) => void;
  isTabOverflowOpen: boolean;
  onTabOverflowOpenChange: (open: boolean) => void;
  tabOverflowRef: React.RefObject<HTMLDivElement | null>;
  sheetStyle?: React.CSSProperties;
  dragHandlers?: Record<string, any>;

  // Booking pane callbacks
  trips: Trip[];
  drivers: LiveFleetDriver[];
  dispatchAutomation?: DispatchAutomationConfig;
  onValuesChangeByDraft: (draftId: string, vals: DispatchFormValues) => void;
  onBookingSuccessByDraft: (
    draftId: string,
    savedTrip: Trip,
    isEdit: boolean,
    feedback?: DispatchBookingFeedback
  ) => void;
  onClearDraftById: (draftId: string) => void;
  onCloneBooking: (values: DispatchFormValues) => void;
  onOpenLinkedTrip: (linkedTripId: string) => Promise<void>;
  onQuickAssignDriver?: (tripId: string, driverId: string) => void | Promise<void>;
  tripActions?: DispatchUniversalTripActions;
}

export function DispatchLeftBookingSidebar({
  isDesktop,
  sidebarWidth,
  activeMobileTab,
  activeResizeHandle,
  onSidebarMouseDown,
  onResetSidebarWidth,
  drafts,
  maxDrafts,
  activeDraftId,
  onActiveDraftIdChange,
  onCreateDraft,
  onCloseDraft,
  isTabOverflowOpen,
  onTabOverflowOpenChange,
  tabOverflowRef,
  sheetStyle,
  dragHandlers,
  trips,
  drivers,
  dispatchAutomation,
  onValuesChangeByDraft,
  onBookingSuccessByDraft,
  onClearDraftById,
  onCloneBooking,
  onOpenLinkedTrip,
  onQuickAssignDriver,
  tripActions,
}: DispatchLeftBookingSidebarProps) {
  const nowMs = useLiveClockNowMs(30_000);
  const activeDraft = drafts.find((d) => d.id === activeDraftId) || null;
  const activeEditTrip =
    activeDraft && !activeDraft.isNew
      ? trips.find((t) => t.id === (activeDraft.tripId || activeDraft.trip?.id)) ||
        activeDraft.trip ||
        null
      : null;
  const stagedPlanner = tripActions?.stagedPlanner;
  return (
    <>
      <aside
        style={{
          width: isDesktop ? `${sidebarWidth}px` : undefined,
        }}
        className={`h-full bg-white border-r border-slate-200 flex flex-col shrink-0 relative z-20 shadow-xs ${
          activeMobileTab === 'booking' ? 'flex w-full' : 'hidden lg:flex'
        }`}
      >
        {/* Browser-style Tab Bar (Pill tabs on mobile, classic tabs on desktop) */}
        <div className="h-11 lg:h-9 bg-slate-100 border-b border-slate-200 flex items-center px-1.5 lg:px-1 shrink-0 select-none relative">
          <div className="flex-1 flex items-center gap-1.5 lg:gap-1 overflow-x-auto h-full scrollbar-none py-1.5 lg:py-1 min-w-0">
            {drafts.map((d) => {
              const isActive = d.id === activeDraftId;
              const label = getDraftTabLabel(d, drafts.length);
              const hasData = Boolean(
                d.formValues?.pickupAddress?.trim() ||
                  d.formValues?.dropoffAddress?.trim() ||
                  d.formValues?.passengerName?.trim() ||
                  d.formValues?.phone?.trim()
              );
              return (
                <div
                  key={d.id}
                  onClick={() => onActiveDraftIdChange(d.id)}
                  title={d.formValues?.passengerName || label}
                  className={`group relative h-8 lg:h-7 px-2.5 lg:px-2 rounded-xl lg:rounded-t-md lg:rounded-b-none text-xs font-semibold flex items-center gap-1.5 lg:gap-1 cursor-pointer border lg:border-b-0 transition-colors shrink-0 max-w-[140px] lg:max-w-[104px] ${
                    isActive
                      ? 'bg-white text-blue-600 border-slate-300 shadow-xs'
                      : 'bg-slate-200/70 text-slate-600 hover:bg-slate-200 border-transparent'
                  }`}
                >
                  {hasData && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                      title="Saved draft data"
                    />
                  )}
                  <span className="truncate flex-1 text-xs lg:text-[11px]">{label}</span>
                  <button
                    type="button"
                    onClick={(e) => onCloseDraft(d.id, e)}
                    className="w-5 h-5 lg:w-3.5 lg:h-3.5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-300/80 cursor-pointer shrink-0"
                    title="Close Tab"
                    aria-label={`Close ${label}`}
                  >
                    <XIcon className="w-3 h-3 lg:w-2.5 lg:h-2.5" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center shrink-0 pl-1.5 lg:pl-1 border-l border-slate-200 gap-1 lg:gap-0.5">
            {drafts.length < maxDrafts && (
              <button
                type="button"
                onClick={onCreateDraft}
                className="h-8 w-8 lg:h-7 lg:w-7 rounded-xl lg:rounded bg-white lg:bg-transparent border border-slate-200 lg:border-transparent hover:bg-slate-200 text-slate-700 lg:text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                title="Open new draft booking tab"
                aria-label="New booking tab"
              >
                <PlusIcon className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
              </button>
            )}

            <div className="relative shrink-0 flex items-center" ref={tabOverflowRef}>
              <button
                type="button"
                onClick={() => onTabOverflowOpenChange(!isTabOverflowOpen)}
                className={`h-8 w-8 lg:h-7 lg:w-auto lg:px-1.5 rounded-xl lg:rounded flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${
                  isTabOverflowOpen
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-white lg:bg-transparent border border-slate-200 lg:border-transparent hover:bg-slate-200 text-slate-600 lg:text-slate-500 hover:text-slate-800'
                }`}
                title="All Open Draft Tabs"
                aria-label="All open tabs"
              >
                <ChevronDownIcon className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
              </button>

              {isTabOverflowOpen && (
                <>
                  {/* Desktop Popover */}
                  <div className="hidden lg:block absolute right-0 top-8 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
                      <span>
                        Open Tabs ({drafts.length}/{maxDrafts})
                      </span>
                      {drafts.length < maxDrafts && (
                        <button
                          type="button"
                          onClick={() => {
                            onCreateDraft();
                            onTabOverflowOpenChange(false);
                          }}
                          className="text-blue-600 hover:text-blue-800 font-bold text-xs capitalize cursor-pointer"
                        >
                          + New Tab
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 py-1">
                      {drafts.map((d) => {
                        const isActive = d.id === activeDraftId;
                        const label = getDraftTabLabel(d, drafts.length);
                        const subtitle =
                          d.formValues?.phone ||
                          (d.isNew ? 'New Draft Reservation' : 'Existing Trip Edit');
                        return (
                          <div
                            key={d.id}
                            className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                              isActive
                                ? 'bg-blue-50/80 text-blue-700'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                            onClick={() => {
                              onActiveDraftIdChange(d.id);
                              onTabOverflowOpenChange(false);
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {d.isNew ? (
                                <DocumentTextIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              ) : (
                                <PencilIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold truncate text-xs flex items-center gap-1.5">
                                  <span>{label}</span>
                                  {isActive && (
                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-bold">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">{subtitle}</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCloseDraft(d.id, e);
                              }}
                              className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-colors ml-2 cursor-pointer"
                              title="Close tab"
                            >
                              <XIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mobile Drag-Down-to-Close Draft Tabs Sheet */}
                  <div
                    className="lg:hidden fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-[2px] flex items-end"
                    onClick={() => onTabOverflowOpenChange(false)}
                  >
                    <div
                      style={sheetStyle}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 max-h-[75dvh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200 pb-[max(1rem,env(safe-area-inset-bottom))]"
                    >
                      <div
                        {...dragHandlers}
                        className="bg-slate-900 text-white px-4 pt-2 pb-3 shrink-0 touch-none"
                      >
                        <div
                          className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5"
                          aria-hidden="true"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-black tracking-tight">
                            Booking Tabs ({drafts.length}/{maxDrafts})
                          </span>
                          <div className="flex items-center gap-2">
                            {drafts.length < maxDrafts && (
                              <button
                                type="button"
                                onClick={() => {
                                  onCreateDraft();
                                  onTabOverflowOpenChange(false);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <PlusIcon className="w-3.5 h-3.5" />
                                <span>New</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onTabOverflowOpenChange(false)}
                              className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                              aria-label="Close tabs sheet"
                            >
                              <XIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 space-y-2 overflow-y-auto">
                        {drafts.map((d) => {
                          const isActive = d.id === activeDraftId;
                          const label = getDraftTabLabel(d, drafts.length);
                          const subtitle =
                            d.formValues?.pickupAddress ||
                            d.formValues?.phone ||
                            (d.isNew ? 'New Draft Reservation' : 'Existing Trip Edit');
                          return (
                            <div
                              key={d.id}
                              onClick={() => {
                                onActiveDraftIdChange(d.id);
                                onTabOverflowOpenChange(false);
                              }}
                              className={`flex items-center justify-between gap-2 p-3 rounded-2xl border cursor-pointer transition-colors ${
                                isActive
                                  ? 'bg-blue-50 border-blue-300 text-blue-900'
                                  : 'bg-slate-50 border-slate-200 text-slate-800 active:bg-slate-100'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                    isActive
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white border border-slate-200 text-slate-500'
                                  }`}
                                >
                                  {d.isNew ? (
                                    <DocumentTextIcon className="w-4 h-4" />
                                  ) : (
                                    <PencilIcon className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-extrabold text-xs flex items-center gap-1.5">
                                    <span className="truncate">{label}</span>
                                    {isActive && (
                                      <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold shrink-0">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {subtitle}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCloseDraft(d.id, e);
                                }}
                                className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 flex items-center justify-center shrink-0 cursor-pointer"
                                aria-label={`Close ${label}`}
                              >
                                <XIcon className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Sticky Edit-Mode Trip Lifecycle & Actions Context Bar */}
        {activeEditTrip && tripActions && (
          <div className="px-2.5 py-1.5 bg-blue-50/90 border-b border-blue-200/80 flex items-center justify-between gap-1.5 shrink-0 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => tripActions.onReview(activeEditTrip, 'details')}
                className="font-mono font-extrabold text-[11px] text-blue-800 hover:text-blue-600 hover:underline cursor-pointer shrink-0"
                title="Open Trip Details & Audit"
              >
                #{activeEditTrip.id.slice(-6).toUpperCase()}
              </button>
              {getDispatchStatusBadge(activeEditTrip.status, { trip: activeEditTrip, nowMs })}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onQuickAssignDriver && (
                <DriverAssignDropdown
                  value={
                    activeEditTrip.assignedDriverId ||
                    (stagedPlanner?.queueAssignMode === 'stage_hold' &&
                    activeEditTrip.plannedDriverId
                      ? activeEditTrip.plannedDriverId
                      : 'unassigned')
                  }
                  drivers={drivers}
                  trip={activeEditTrip}
                  slaConfig={dispatchAutomation}
                  mode={
                    !activeEditTrip.assignedDriverId &&
                    stagedPlanner?.queueAssignMode === 'stage_hold'
                      ? 'stage_hold'
                      : 'send_to_driver'
                  }
                  isAssigned={Boolean(activeEditTrip.assignedDriverId)}
                  fallbackAssignedLabel={
                    String(
                      (activeEditTrip.metadata as Record<string, unknown> | undefined)
                        ?.assignedDriverName ||
                        activeEditTrip.plannedDriverLabel ||
                        ''
                    ).trim() || null
                  }
                  stagedDriverId={
                    hasStagedDriver(activeEditTrip) ? activeEditTrip.plannedDriverId : null
                  }
                  stagedDriverLabel={
                    hasStagedDriver(activeEditTrip) ? activeEditTrip.plannedDriverLabel : null
                  }
                  onSendStaged={
                    stagedPlanner && hasStagedDriver(activeEditTrip)
                      ? () => void stagedPlanner.sendStagedTrip(activeEditTrip)
                      : undefined
                  }
                  onClearStaged={
                    stagedPlanner && hasStagedDriver(activeEditTrip)
                      ? () => void stagedPlanner.clearTripStage(activeEditTrip)
                      : undefined
                  }
                  isSendBusy={Boolean(stagedPlanner?.busyTripIds.has(activeEditTrip.id))}
                  isCascadeExhausted={
                    !activeEditTrip.assignedDriverId &&
                    activeEditTrip.offerCascade?.state === 'exhausted'
                  }
                  cascadeExhaustedTooltip={getTripCascadeExhaustedTooltip(activeEditTrip)}
                  onChange={(val) => {
                    if (
                      !activeEditTrip.assignedDriverId &&
                      stagedPlanner?.queueAssignMode === 'stage_hold'
                    ) {
                      void stagedPlanner.stageTripDriver(activeEditTrip, val);
                    } else {
                      void onQuickAssignDriver(activeEditTrip.id, val);
                    }
                  }}
                  size="xs"
                  maxWidthClass="max-w-[165px]"
                  isDesktop={isDesktop}
                />
              )}

              <TripActionDropdown
                trip={activeEditTrip}
                isUnconfirmed={
                  activeEditTrip.status === 'UNCONFIRMED' ||
                  activeEditTrip.status === 'unconfirmed'
                }
                isDesktop={isDesktop}
                compact
                hideEdit
                showFocusMapOnDesktop
                onReview={() => tripActions.onReview(activeEditTrip, 'details')}
                onEdit={() => tripActions.onEdit(activeEditTrip)}
                onFare={() => tripActions.onFare(activeEditTrip)}
                onAudit={() => tripActions.onReview(activeEditTrip, 'audit')}
                onClone={() => tripActions.onClone(activeEditTrip)}
                onFocusMap={() => tripActions.onFocusMap(activeEditTrip)}
                onStartAutoOffer={
                  tripActions.onStartAutoOffer
                    ? () => void tripActions.onStartAutoOffer?.(activeEditTrip)
                    : undefined
                }
                onCancelAutoOffer={
                  tripActions.onCancelAutoOffer
                    ? () => void tripActions.onCancelAutoOffer?.(activeEditTrip)
                    : undefined
                }
                onSendStagedToDriver={
                  stagedPlanner && hasStagedDriver(activeEditTrip)
                    ? () => void stagedPlanner.sendStagedTrip(activeEditTrip)
                    : undefined
                }
                onStageDriver={
                  stagedPlanner &&
                  isTripEligibleForStaging(activeEditTrip) &&
                  tripActions.onOpenDriverPicker
                    ? () => {
                        stagedPlanner.setDriverPickerMode('stage_hold');
                        tripActions.onOpenDriverPicker?.(activeEditTrip);
                      }
                    : undefined
                }
                onClearStagedDriver={
                  stagedPlanner && hasStagedDriver(activeEditTrip)
                    ? () => void stagedPlanner.clearTripStage(activeEditTrip)
                    : undefined
                }
                onCompleteTrip={() => tripActions.onCompleteTrip(activeEditTrip)}
                onCancelTrip={() => tripActions.onCancelTrip(activeEditTrip)}
                onReactivateTrip={() => tripActions.onReactivateTrip(activeEditTrip)}
              />
            </div>
          </div>
        )}

        {/* Persistent Draft / Edit Form Container */}
        <div className="flex-1 overflow-hidden relative">
          {drafts.map((d) => {
            const liveTrip =
              (!d.isNew && (d.tripId || d.trip?.id)
                ? trips.find((t) => t.id === (d.tripId || d.trip?.id))
                : undefined) || d.trip;
            return (
              <MemoizedDraftBookingPane
                key={d.id}
                draftId={d.id}
                isActive={d.id === activeDraftId}
                isNew={d.isNew}
                trip={liveTrip}
                tripId={d.tripId}
                allTrips={trips}
                drivers={drivers}
                onValuesChangeByDraft={onValuesChangeByDraft}
                onBookingSuccessByDraft={onBookingSuccessByDraft}
                onClearDraftById={onClearDraftById}
                onCloneBooking={onCloneBooking}
                onOpenLinkedTrip={onOpenLinkedTrip}
              />
            );
          })}
        </div>
      </aside>

      {/* Resizer Handle (Left Sidebar — drag to resize, double-click to reset to 430px) */}
      <div
        onPointerDown={onSidebarMouseDown}
        onDoubleClick={onResetSidebarWidth}
        title="Drag to resize booking panel (double-click to reset)"
        className={`hidden lg:flex items-center justify-center w-2 h-full cursor-col-resize transition-colors z-30 shrink-0 select-none group ${
          activeResizeHandle === 'sidebar'
            ? 'bg-blue-500/30'
            : 'bg-slate-200/60 hover:bg-blue-500/20'
        }`}
      >
        <div
          className={`w-0.5 h-10 rounded-full transition-colors ${
            activeResizeHandle === 'sidebar'
              ? 'bg-blue-600'
              : 'bg-slate-300 group-hover:bg-blue-500'
          }`}
        />
      </div>
    </>
  );
}
