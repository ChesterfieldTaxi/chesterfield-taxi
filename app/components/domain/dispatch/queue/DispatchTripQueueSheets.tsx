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
import { FloatingWindow } from '../../../ui/FloatingWindow';
import { Select } from '../../../ui/Select';

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
      {/* ─── Batch Assign / Stage Driver Floating Window ─── */}
      {isBatchAssignOpen && (
        <FloatingWindow
          id="dispatch_batch_assign"
          isOpen={isBatchAssignOpen}
          onClose={onCloseBatchAssign}
          hasBackdrop={false}
          title={
            isStageBatchMode
              ? `Batch Stage Driver (${selectedTripIdsCount} Trips)`
              : `Batch Assign Driver (${selectedTripIdsCount} Trips)`
          }
          subtitle={
            isStageBatchMode
              ? 'Stage a shift placeholder held in Dispatch (zero driver alerts until sent).'
              : `Send immediately to driver across ${selectedTripIdsCount} selected trip(s).`
          }
          icon={<UsersIcon className="w-4 h-4 text-blue-400" />}
          initialSize={{ width: 440, height: 340 }}
          autoHeight
          minWidth={360}
          minHeight={240}
          zIndex={225}
          footer={
            <div className="px-4 sm:px-5 py-3 bg-surface-subtle flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCloseBatchAssign}
                className="px-4 py-1.5 rounded-xl border border-border-strong text-xs font-bold text-fg-secondary hover:bg-surface-muted cursor-pointer"
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
                className={`px-4 py-1.5 rounded-xl disabled:opacity-40 text-white text-xs font-bold shadow-xs cursor-pointer ${
                  isStageBatchMode ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isStageBatchMode
                  ? `Stage Driver (${selectedTripIdsCount})`
                  : `Send to Driver (${selectedTripIdsCount})`}
              </button>
            </div>
          }
        >
          <div className="p-4 sm:p-5 space-y-3">
            {stagedPlanner && (
              <div>
                <span className="block text-[10.5px] font-bold uppercase tracking-wider text-fg-muted mb-1">
                  Placement Mode
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-surface-muted border border-border-subtle">
                  <button
                    type="button"
                    onClick={() => stagedPlanner.setBatchAssignMode('send_to_driver')}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                      !isStageBatchMode
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-fg-secondary hover:text-fg-primary'
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
                        : 'text-fg-secondary hover:text-fg-primary'
                    }`}
                  >
                    📌 Stage (Hold)
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-fg-secondary">
                Driver Operator
              </label>
              <Select
                size="md"
                searchable
                searchPlaceholder="Search driver, cab #, status..."
                value={batchAssignDriverId}
                onChange={(e) => onBatchAssignDriverIdChange(e.target.value)}
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
              </Select>
            </div>
          </div>
        </FloatingWindow>
      )}

      {/* ─── Trip Quick Action Floating Window ─── */}
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
            <FloatingWindow
              id="dispatch_trip_actions"
              isOpen={Boolean(mobileActionSheetTrip)}
              onClose={onCloseMobileActionSheetTrip}
              hasBackdrop={false}
              title={`#${sheetTrip.id.slice(-6).toUpperCase()} · ${sheetTrip.passenger?.firstName || ''} ${sheetTrip.passenger?.lastName || ''}`.trim()}
              subtitle={`${sheetTrip.pickupLocation?.address || 'Pickup'} → ${sheetTrip.dropoffLocation?.address || 'Dropoff'}`}
              icon={<CarIcon className="w-4 h-4 text-blue-400" />}
              headerExtra={
                <span className="font-mono font-black text-[11px] text-emerald-400 mr-1">
                  ${sheetTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
                </span>
              }
              initialSize={{ width: 440, height: 560 }}
              autoHeight
              minWidth={360}
              minHeight={320}
              zIndex={222}
            >
              <div className="p-4 space-y-3">
                {assignedDrv && (
                  <div className="text-[11px] font-bold text-status-info-fg bg-status-info-bg border border-status-info-border px-3 py-1.5 rounded-xl truncate">
                    Assigned: {assignedDrv.formattedLabel || formatDriverAssignmentLabel(assignedDrv)}
                  </div>
                )}
                  {/* Staged Driver Banner + 1-Tap Send to Driver */}
                  {tripHasStaged && stagedPlanner && (
                    <div className="p-3 rounded-2xl border-2 border-dashed border-indigo-400 bg-status-staged-bg/80 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10.5px] font-black uppercase tracking-wider text-status-staged-fg block">
                          📌 Staged (Held in Dispatch)
                        </span>
                        <span className="text-xs font-extrabold text-fg-primary truncate block">
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
                          className="px-2.5 py-1.5 rounded-xl bg-surface-card border border-status-staged-border text-fg-secondary hover:text-rose-600 text-xs font-bold cursor-pointer"
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
                        className="p-3 rounded-2xl bg-status-info-bg hover:bg-status-info-bg-strong border border-status-info-border text-status-info-fg flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
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
                        className="p-3 rounded-2xl bg-status-success-bg hover:bg-status-success-bg-strong border border-status-success-border text-status-success-fg flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
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
                        className="p-3 rounded-2xl bg-status-info-bg hover:bg-status-info-bg-strong border border-status-info-border text-status-info-fg flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
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
                      className="p-3 rounded-2xl bg-surface-subtle hover:bg-surface-muted border border-border-subtle text-fg-primary flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                    >
                      <PencilIcon className="w-4 h-4 text-fg-secondary" />
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
                      className="p-3 rounded-2xl bg-status-info-bg hover:bg-status-info-bg-strong border border-status-info-border text-status-info-fg flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                    >
                      <CopyIcon className="w-4 h-4 text-status-info-fg" />
                      <span className="text-xs font-extrabold">Copy Booking</span>
                    </button>

                    {!isCompleted && !isCancelled ? (
                      <button
                        type="button"
                        onClick={() => {
                          onCloseMobileActionSheetTrip();
                          onOpenCompleteTripModal(sheetTrip);
                        }}
                        className="p-3 rounded-2xl bg-status-success-bg hover:bg-status-success-bg-strong border border-status-success-border text-status-success-fg flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
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
                        className="p-3 rounded-2xl bg-status-staged-bg hover:bg-status-staged-bg-strong border border-status-staged-border text-status-staged-fg flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                      >
                        <ShieldCheckIcon className="w-4 h-4 text-purple-600" />
                        <span className="text-xs font-extrabold">Audit Trail</span>
                      </button>
                    )}
                  </div>

                  {/* Secondary Action List */}
                  <div className="rounded-2xl border border-border-subtle divide-y divide-border-faint overflow-hidden bg-surface-card">
                    {stagedPlanner && isTripEligibleForStaging(sheetTrip) && (
                      <button
                        type="button"
                        onClick={() => {
                          onCloseMobileActionSheetTrip();
                          stagedPlanner.setDriverPickerMode('stage_hold');
                          onOpenDriverPickerForTrip(sheetTrip);
                        }}
                        className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-status-staged-fg bg-status-staged-bg/50 hover:bg-status-staged-bg-strong/70 cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <CarIcon className="w-4 h-4 text-indigo-600" />
                          <span>
                            {tripHasStaged ? 'Change Staged Driver (Hold)' : 'Stage Driver (Hold)'}
                          </span>
                        </span>
                        <span className="text-[10.5px] font-bold text-status-staged-fg">📌 Hold</span>
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
                        className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-fg-strong hover:bg-status-success-bg cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <PhoneIcon className="w-4 h-4 text-emerald-600" />
                          <span>Call Passenger</span>
                        </span>
                        <span className="font-mono text-[11px] text-fg-muted">
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
                        className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-status-danger-fg bg-status-danger-bg/70 hover:bg-status-danger-bg-strong cursor-pointer"
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
                        className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-status-staged-fg bg-status-staged-bg/70 hover:bg-status-staged-bg-strong cursor-pointer"
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
                          ? 'bg-status-warning-bg/80 text-status-warning-fg hover:bg-status-warning-bg-strong'
                          : 'text-fg-strong hover:bg-surface-subtle'
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
                      className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-fg-strong hover:bg-surface-subtle cursor-pointer"
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
                      className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-fg-strong hover:bg-surface-subtle cursor-pointer"
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
                        className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-fg-strong hover:bg-surface-subtle cursor-pointer"
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
                      className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-fg-strong hover:bg-surface-subtle cursor-pointer"
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
                      className="w-full py-3 rounded-2xl bg-status-danger-bg hover:bg-status-danger-bg-strong border border-status-danger-border text-status-danger-fg font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <BanIcon className="w-4 h-4" />
                      <span>Cancel Trip</span>
                    </button>
                  )}
                </div>
            </FloatingWindow>
          );
        })()}
    </>
  );
}
