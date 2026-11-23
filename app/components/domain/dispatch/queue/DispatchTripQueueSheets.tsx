import React from 'react';
import type { Trip } from '../../../../core/types/trip';
import {
  canTripTriggerAutoOffer,
  isTripCascadeActive,
} from '../DispatchCascadeSlaBadges';
import { formatDriverAssignmentLabel } from '../../../../core/services/operator.service';
import {
  hasStagedDriver,
  isTripEligibleForStaging,
} from '../../../../core/services/dispatch/staged-driver-planner.service';
import {
  getMapStatusLabel,
  type LiveFleetDriver,
} from '../../../../core/hooks/useDispatchFleet';
import type { DispatchStagedPlannerController } from '../../../../core/hooks/dispatch/useDispatchStagedPlanner';
import {
  CheckIcon,
  BoltIcon,
  RadarBroadcastIcon,
  UsersIcon,
  DocumentTextIcon,
  BanIcon,
  XIcon,
  PhoneIcon,
  MapPinIcon,
  CarIcon,
  MailIcon,
  RefreshCwIcon,
  PencilIcon,
  CopyIcon,
  ShieldCheckIcon,
} from '../../../ui/Icons';

export interface DispatchTripQueueSheetsProps {
  trips: Trip[];
  drivers: LiveFleetDriver[];
  isBatchAssignOpen: boolean;
  onCloseBatchAssign: () => void;
  selectedTripIdsCount: number;
  batchAssignDriverId: string;
  onBatchAssignDriverIdChange: (id: string) => void;
  onConfirmBatchAssign: () => void;
  mobileActionSheetTrip: Trip | null;
  onCloseMobileActionSheetTrip: () => void;
  onSendReceiptForTrip: (trip: Trip) => void;
  onReactivateTrip: (trip: Trip) => void;
  onOpenDriverPickerForTrip: (trip: Trip) => void;
  onEditTripFromQueue: (trip: Trip) => void;
  onCloneBookingFromQueue: (trip: Trip) => void;
  onOpenCompleteTripModal: (trip: Trip) => void;
  onOpenReviewModal: (trip: Trip, initialTab?: 'details' | 'audit') => void;
  onCallPassengerFromQueue: (phone: string, passengerFullName: string) => void;
  onOpenDriverModal: (trip: Trip) => void;
  onFocusTripOnMapFromQueue: (trip: Trip) => void;
  onAddTripToMultiSelect: (tripId: string) => void;
  onPromptCancelTrip: (trip: Trip) => void;
  onStartAutoOffer: (trip: Trip) => void | Promise<void>;
  onCancelAutoOffer: (trip: Trip) => void | Promise<void>;
  stagedPlanner?: DispatchStagedPlannerController;
  sheetStyle?: React.CSSProperties;
  dragHandlers?: Record<string, any>;
}

export function DispatchTripQueueSheets({
  trips,
  drivers,
  isBatchAssignOpen,
  onCloseBatchAssign,
  selectedTripIdsCount,
  batchAssignDriverId,
  onBatchAssignDriverIdChange,
  onConfirmBatchAssign,
  mobileActionSheetTrip,
  onCloseMobileActionSheetTrip,
  onSendReceiptForTrip,
  onReactivateTrip,
  onOpenDriverPickerForTrip,
  onEditTripFromQueue,
  onCloneBookingFromQueue,
  onOpenCompleteTripModal,
  onOpenReviewModal,
  onCallPassengerFromQueue,
  onOpenDriverModal,
  onFocusTripOnMapFromQueue,
  onAddTripToMultiSelect,
  onPromptCancelTrip,
  onStartAutoOffer,
  onCancelAutoOffer,
  stagedPlanner,
  sheetStyle,
  dragHandlers,
}: DispatchTripQueueSheetsProps) {
  const isStageBatchMode = stagedPlanner?.batchAssignMode === 'stage_hold';

  return (
    <>
      {/* ─── Batch Assign / Stage Driver Modal ─── */}
      {isBatchAssignOpen && (
        <div
          className="fixed inset-0 z-[125] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={onCloseBatchAssign}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={sheetStyle}
            className="bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90dvh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            <div
              {...dragHandlers}
              className="bg-slate-900 text-white px-4 sm:px-5 pt-2 sm:pt-4 pb-3.5 shrink-0 touch-none"
            >
              <div
                className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden"
                aria-hidden="true"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-black tracking-tight flex items-center gap-2">
                    <UsersIcon className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>
                      {isStageBatchMode
                        ? `Batch Stage Driver (${selectedTripIdsCount} Trips)`
                        : `Batch Assign Driver (${selectedTripIdsCount} Trips)`}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isStageBatchMode
                      ? 'Stage a shift placeholder held in Dispatch (zero driver alerts until sent).'
                      : `Send immediately to driver across ${selectedTripIdsCount} selected trip(s).`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCloseBatchAssign}
                  className="w-9 h-9 sm:w-8 sm:h-8 rounded-full sm:rounded-lg bg-slate-800/80 sm:bg-transparent text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  aria-label="Close batch assign modal"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-3">
              {stagedPlanner && (
                <div>
                  <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Placement Mode
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => stagedPlanner.setBatchAssignMode('send_to_driver')}
                      className={`py-1.5 px-2.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                        !isStageBatchMode
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Send to Driver
                    </button>
                    <button
                      type="button"
                      onClick={() => stagedPlanner.setBatchAssignMode('stage_hold')}
                      className={`py-1.5 px-2.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                        isStageBatchMode
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📌 Stage (Hold)
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Driver Operator
                </label>
                <select
                  value={batchAssignDriverId}
                  onChange={(e) => onBatchAssignDriverIdChange(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a driver...</option>
                  <option value="unassigned">
                    {isStageBatchMode
                      ? 'Clear Staged Driver on Selected Trips'
                      : 'Unassign Selected Trips'}
                  </option>
                  {drivers.map((drv) => (
                    <option
                      key={drv.id}
                      value={drv.id}
                      disabled={drv.isBlacklisted || drv.zone === 'Suspended'}
                    >
                      {drv.formattedLabel || formatDriverAssignmentLabel(drv)} —{' '}
                      {getMapStatusLabel(drv.mapStatus, drv.activeTripStatus)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-4 sm:px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pb-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCloseBatchAssign}
                className="px-4 py-2 sm:py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!batchAssignDriverId}
                onClick={() => {
                  if (stagedPlanner) {
                    void stagedPlanner.confirmBatchStageOrAssign();
                  } else {
                    onConfirmBatchAssign();
                  }
                }}
                className={`px-4 py-2 sm:py-1.5 rounded-xl disabled:opacity-40 text-white text-xs font-bold shadow-xs cursor-pointer ${
                  isStageBatchMode
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isStageBatchMode
                  ? `Stage Driver (${selectedTripIdsCount})`
                  : `Send to Driver (${selectedTripIdsCount})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Mobile-Native Trip Quick Action Bottom Sheet ─── */}
      {mobileActionSheetTrip &&
        (() => {
          const sheetTrip =
            trips.find((t) => t.id === mobileActionSheetTrip.id) || mobileActionSheetTrip;
          const isCompleted = sheetTrip.status === 'completed';
          const isCancelled = sheetTrip.status === 'cancelled';
          const isUnconfirmed =
            sheetTrip.status === 'UNCONFIRMED' || sheetTrip.status === 'unconfirmed';
          const assignedDrv = sheetTrip.assignedDriverId
            ? drivers.find((d) => d.id === sheetTrip.assignedDriverId)
            : undefined;
          const tripHasStaged = hasStagedDriver(sheetTrip);

          return (
            <div
              className="fixed inset-0 z-[122] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
              onClick={onCloseMobileActionSheetTrip}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={sheetStyle}
                className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 w-full max-w-md max-h-[90dvh] overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
              >
                {/* Sheet Header */}
                <div
                  {...dragHandlers}
                  className="bg-slate-900 text-white px-4 pt-2 pb-3.5 shrink-0 touch-none"
                >
                  <div
                    className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden"
                    aria-hidden="true"
                  />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-xs text-blue-400">
                          #{sheetTrip.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-sm font-extrabold text-white truncate">
                          {sheetTrip.passenger?.firstName} {sheetTrip.passenger?.lastName}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {sheetTrip.pickupLocation?.address} → {sheetTrip.dropoffLocation?.address}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] flex-wrap">
                        <span className="font-mono font-black text-emerald-400">
                          ${sheetTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="capitalize text-slate-300 font-semibold">
                          {sheetTrip.status.replace(/_/g, ' ')}
                        </span>
                        {assignedDrv ? (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-blue-300 font-semibold truncate">
                              {assignedDrv.formattedLabel ||
                                formatDriverAssignmentLabel(assignedDrv)}
                            </span>
                          </>
                        ) : tripHasStaged ? (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-indigo-300 font-bold truncate">
                              📌 Staged: {sheetTrip.plannedDriverLabel || sheetTrip.plannedDriverId}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onCloseMobileActionSheetTrip}
                      className="w-9 h-9 rounded-full bg-slate-800/90 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
                      aria-label="Close trip actions"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Scrollable Sheet Actions */}
                <div className="p-4 space-y-3 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                  {/* Staged Driver Banner + 1-Tap Send to Driver */}
                  {tripHasStaged && stagedPlanner && (
                    <div className="p-3 rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-50/80 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10.5px] font-black uppercase tracking-wider text-indigo-800 block">
                          📌 Staged (Held in Dispatch)
                        </span>
                        <span className="text-xs font-extrabold text-slate-900 truncate block">
                          {sheetTrip.plannedDriverLabel || sheetTrip.plannedDriverId}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onCloseMobileActionSheetTrip();
                            void stagedPlanner.sendStagedTrip(sheetTrip);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer shadow-xs"
                        >
                          Send to Driver
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onCloseMobileActionSheetTrip();
                            void stagedPlanner.clearTripStage(sheetTrip);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-white border border-indigo-200 text-slate-600 hover:text-rose-600 text-xs font-bold cursor-pointer"
                        >
                          Unstage
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Primary 2x2 Thumb Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {isCompleted ? (
                      <button
                        type="button"
                        onClick={() => {
                          onCloseMobileActionSheetTrip();
                          onSendReceiptForTrip(sheetTrip);
                        }}
                        className="p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                      >
                        <MailIcon className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-extrabold">Send Receipt</span>
                      </button>
                    ) : isCancelled ? (
                      <button
                        type="button"
                        onClick={() => {
                          onCloseMobileActionSheetTrip();
                          onReactivateTrip(sheetTrip);
                        }}
                        className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                      >
                        <RefreshCwIcon className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-extrabold">Reactivate Trip</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onCloseMobileActionSheetTrip();
                          stagedPlanner?.setDriverPickerMode('send_to_driver');
                          onOpenDriverPickerForTrip(sheetTrip);
                        }}
                        className="p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                      >
                        <CarIcon className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-extrabold">Send to Driver</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onEditTripFromQueue(sheetTrip);
                      }}
                      className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                    >
                      <PencilIcon className="w-4 h-4 text-slate-600" />
                      <span className="text-xs font-extrabold">
                        {isCompleted ? 'Edit Details' : isCancelled ? 'Edit Notes' : 'Edit Trip'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onCloneBookingFromQueue(sheetTrip);
                      }}
                      className="p-3 rounded-2xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                    >
                      <CopyIcon className="w-4 h-4 text-cyan-700" />
                      <span className="text-xs font-extrabold">Copy Booking</span>
                    </button>

                    {!isCompleted && !isCancelled ? (
                      <button
                        type="button"
                        onClick={() => {
                          onCloseMobileActionSheetTrip();
                          onOpenCompleteTripModal(sheetTrip);
                        }}
                        className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                      >
                        <CheckIcon className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-extrabold">Complete Trip</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onCloseMobileActionSheetTrip();
                          onOpenReviewModal(sheetTrip, 'audit');
                        }}
                        className="p-3 rounded-2xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                      >
                        <ShieldCheckIcon className="w-4 h-4 text-purple-600" />
                        <span className="text-xs font-extrabold">Audit Trail</span>
                      </button>
                    )}
                  </div>

                  {/* Secondary Action List */}
                  <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden bg-white">
                    {stagedPlanner && isTripEligibleForStaging(sheetTrip) && (
                      <button
                        type="button"
                        onClick={() => {
                          onCloseMobileActionSheetTrip();
                          stagedPlanner.setDriverPickerMode('stage_hold');
                          onOpenDriverPickerForTrip(sheetTrip);
                        }}
                        className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-indigo-900 bg-indigo-50/50 hover:bg-indigo-100/70 cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <CarIcon className="w-4 h-4 text-indigo-600" />
                          <span>
                            {tripHasStaged ? 'Change Staged Driver (Hold)' : 'Stage Driver (Hold)'}
                          </span>
                        </span>
                        <span className="text-[10.5px] font-bold text-indigo-700">📌 Hold</span>
                      </button>
                    )}

                    {sheetTrip.passenger?.phone && (
                      <button
                        type="button"
                        onClick={() => {
                          onCloseMobileActionSheetTrip();
                          onCallPassengerFromQueue(
                            sheetTrip.passenger.phone,
                            `${sheetTrip.passenger.firstName} ${sheetTrip.passenger.lastName}`
                          );
                        }}
                        className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-emerald-50 cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <PhoneIcon className="w-4 h-4 text-emerald-600" />
                          <span>Call Passenger</span>
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">
                          {sheetTrip.passenger.phone}
                        </span>
                      </button>
                    )}

                    {isTripCascadeActive(sheetTrip) ? (
                      <button
                        type="button"
                        onClick={() => {
                          onCloseMobileActionSheetTrip();
                          onCancelAutoOffer(sheetTrip);
                        }}
                        className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-rose-700 bg-rose-50/70 hover:bg-rose-100 cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <XIcon className="w-4 h-4 text-rose-600" />
                          <span>Cancel Offer Cascade</span>
                        </span>
                        <span className="font-mono text-[10px]">
                          Step {sheetTrip.offerCascade?.cascadeAttempt || 1}/
                          {sheetTrip.offerCascade?.maxAttempts || 3}
                        </span>
                      </button>
                    ) : canTripTriggerAutoOffer(sheetTrip) ? (
                      <button
                        type="button"
                        onClick={() => {
                          onCloseMobileActionSheetTrip();
                          onStartAutoOffer(sheetTrip);
                        }}
                        className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-indigo-800 bg-indigo-50/70 hover:bg-indigo-100 cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <RadarBroadcastIcon className="w-4 h-4 text-indigo-600" />
                          <span>
                            {sheetTrip.offerCascade?.state === 'exhausted'
                              ? 'Retry Auto-Offer Cascade'
                              : 'Start Auto-Offer Cascade'}
                          </span>
                        </span>
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onOpenReviewModal(sheetTrip, 'details');
                      }}
                      className={`w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold cursor-pointer ${
                        isUnconfirmed
                          ? 'bg-amber-50/80 text-amber-900 hover:bg-amber-100'
                          : 'text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <DocumentTextIcon
                          className={`w-4 h-4 ${isUnconfirmed ? 'text-amber-600' : 'text-blue-600'}`}
                        />
                        <span>
                          {isUnconfirmed
                            ? 'Review & Confirm Booking'
                            : 'Trip Details & Status Override'}
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onOpenDriverModal(sheetTrip);
                      }}
                      className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <BoltIcon className="w-4 h-4 text-amber-500" />
                        <span>Fare &amp; Pricing Rules</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onFocusTripOnMapFromQueue(sheetTrip);
                      }}
                      className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <MapPinIcon className="w-4 h-4 text-emerald-600" />
                        <span>View Route on Map</span>
                      </span>
                    </button>

                    {!isCompleted && !isCancelled && (
                      <button
                        type="button"
                        onClick={() => {
                          onCloseMobileActionSheetTrip();
                          onOpenReviewModal(sheetTrip, 'audit');
                        }}
                        className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <ShieldCheckIcon className="w-4 h-4 text-purple-600" />
                          <span>Audit Trail Log</span>
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onAddTripToMultiSelect(sheetTrip.id);
                      }}
                      className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <CheckIcon className="w-4 h-4 text-blue-600" />
                        <span>Select Multiple Trips</span>
                      </span>
                    </button>
                  </div>

                  {/* Destructive Footer Action */}
                  {!isCompleted && !isCancelled && (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onPromptCancelTrip(sheetTrip);
                      }}
                      className="w-full py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <BanIcon className="w-4 h-4" />
                      <span>Cancel Trip</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
    </>
  );
}
