import React from 'react';
import type { AdminUser } from '../../../core/services/auth/admin-auth.service';
import type { AppSettings } from '../../../core/types/config';
import type { Trip } from '../../../core/types/trip';
import {
  getContextualEmailMeta,
  sendDispatchContextualTripEmail,
} from '../../../core/services/dispatch/dispatch-trip-email.util';
import type { LiveFleetDriver } from '../../../core/hooks/useDispatchFleet';
import type { DispatchStagedPlannerController } from '../../../core/hooks/dispatch/useDispatchStagedPlanner';
import {
  hasStagedDriver,
  isTripEligibleForStaging,
} from '../../../core/services/dispatch/staged-driver-planner.service';
import { FloatingWindow } from '../../ui/FloatingWindow';
import { TripAuditModal, TripAuditTimeline } from '../admin/TripAuditModal';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  CopyIcon,
  DocumentTextIcon,
  MailIcon,
  PencilIcon,
  RefreshCwIcon,
  RepeatIcon,
  ShieldCheckIcon,
  SpinnerIcon,
} from '../../ui/Icons';
import {
  TripActionDropdown,
  type DispatchUniversalTripActions,
} from './TripActionDropdown';
import {
  DispatchCompleteTripModal,
  DispatchDriverFareModal,
  TripDrawerOverviewSection,
  TripDrawerPricingPaymentSection,
  useTripDrawerReviewActions,
} from './drawer';

export { getContextualEmailMeta, sendDispatchContextualTripEmail };

export interface DispatchTripDetailsDrawerProps {
  isDesktop: boolean;
  user: AdminUser | null;
  settings: AppSettings;
  trips: Trip[];
  onTripsChange: React.Dispatch<React.SetStateAction<Trip[]>>;
  drivers: LiveFleetDriver[];

  // Review / Details FloatingWindow
  reviewTrip: Trip | null;
  reviewOpenSeq: number;
  reviewModalTab: 'details' | 'audit';
  onReviewModalTabChange: (tab: 'details' | 'audit') => void;
  onReviewTripChange: React.Dispatch<React.SetStateAction<Trip | null>>;
  onOpenReviewModal: (trip: Trip, initialTab?: 'details' | 'audit') => void;

  // Audit Trail Modal
  auditTrailTrip: Trip | null;
  onCloseAuditTrailTrip: () => void;

  // Driver Fare Override Modal
  driverModalTrip: Trip | null;
  driverModalOpenSeq: number;
  onCloseDriverModal: () => void;

  // Complete Trip Modal
  completeTripTarget: Trip | null;
  completeModalOpenSeq: number;
  onOpenCompleteTripModal: (trip: Trip) => void;
  onCloseCompleteTripModal: () => void;

  // Shared callbacks
  onQuickAssignDriver: (tripId: string, driverId: string) => void | Promise<void>;
  onStartAutoOffer?: (trip: Trip) => void | Promise<void>;
  onCancelAutoOffer?: (trip: Trip) => void | Promise<void>;
  onPromptCancelTrip: (trip: Trip) => void;
  onReactivateTrip: (trip: Trip) => void;
  onCloneBookingFromReview: (trip: Trip) => void;
  onEditTripFromReview: (trip: Trip) => void;
  onShowToast: (text: string, type: 'success' | 'error' | 'info') => void;
  stagedPlanner?: DispatchStagedPlannerController;
  tripActions?: DispatchUniversalTripActions;
}

export function DispatchTripDetailsDrawer({
  isDesktop,
  user,
  settings,
  trips,
  onTripsChange,
  drivers,
  reviewTrip,
  reviewOpenSeq,
  reviewModalTab,
  onReviewModalTabChange,
  onReviewTripChange,
  onOpenReviewModal,
  auditTrailTrip,
  onCloseAuditTrailTrip,
  driverModalTrip,
  driverModalOpenSeq,
  onCloseDriverModal,
  completeTripTarget,
  completeModalOpenSeq,
  onOpenCompleteTripModal,
  onCloseCompleteTripModal,
  onQuickAssignDriver,
  onStartAutoOffer,
  onCancelAutoOffer,
  onPromptCancelTrip,
  onReactivateTrip,
  onCloneBookingFromReview,
  onEditTripFromReview,
  onShowToast,
  stagedPlanner,
  tripActions,
}: DispatchTripDetailsDrawerProps) {
  const {
    reviewDeclineMode,
    setReviewDeclineMode,
    reviewClarifyMode,
    setReviewClarifyMode,
    selectedDeclineReason,
    setSelectedDeclineReason,
    declineScope,
    setDeclineScope,
    confirmScope,
    setConfirmScope,
    reviewCustomNotes,
    setReviewCustomNotes,
    clarifyTopic,
    setClarifyTopic,
    clarifyMessage,
    setClarifyMessage,
    isProcessingReview,
    reviewAlert,
    overrideRecipientEmail,
    setOverrideRecipientEmail,
    isOverrideEmailEnabled,
    setIsOverrideEmailEnabled,
    shouldUpdatePassengerEmail,
    setShouldUpdatePassengerEmail,
    isOverridingStatus,
    payLinkBusyAction,
    generatedPayUrl,
    isRefreshingFlight,
    isSyncingFlightEta,
    handleRefreshTripFlight,
    handleAdjustPickupToFlightEta,
    handleTripPayLinkAction,
    handleConfirmTrip,
    handleSendContextualTripEmail,
    handleDeclineTrip,
    handleSendClarificationRequest,
    handleManualStatusOverride,
  } = useTripDrawerReviewActions({
    user,
    settings,
    trips,
    drivers,
    reviewTrip,
    reviewOpenSeq,
    onTripsChange,
    onReviewTripChange,
    onStartAutoOffer,
    onOpenCompleteTripModal,
    onPromptCancelTrip,
    onShowToast,
  });

  return (
    <>
      {/* Driver Fare Adjustment & Permitted Rules Modal */}
      <DispatchDriverFareModal
        isDesktop={isDesktop}
        driverModalTrip={driverModalTrip}
        driverModalOpenSeq={driverModalOpenSeq}
        onCloseDriverModal={onCloseDriverModal}
        onTripsChange={onTripsChange}
      />

      {/* ─────────────────────────────────────────────────────────────
          DISPATCHER REVIEW ACTION MODAL (UNCONFIRMED Bookings & Trip Details)
      ───────────────────────────────────────────────────────────── */}
      {reviewTrip &&
        (() => {
          const isUnconfirmedTrip =
            reviewTrip.status === 'UNCONFIRMED' || reviewTrip.status === 'unconfirmed';
          const tripMeta = (reviewTrip.metadata || {}) as Record<string, any>;
          const isReturnRide = Boolean(tripMeta.isReturnRide || tripMeta.linkedTripId);
          const hasReturnTrip = Boolean(tripMeta.hasReturnTrip || tripMeta.returnTripId);
          const returnTripId = tripMeta.returnTripId ? String(tripMeta.returnTripId) : null;
          const linkedTripId = tripMeta.linkedTripId ? String(tripMeta.linkedTripId) : null;
          const linkedLegId = isReturnRide ? linkedTripId : returnTripId;
          const hasLinkedLeg = Boolean(linkedLegId);

          return (
            <FloatingWindow
              id={`trip_review_details_${reviewTrip.id}`}
              isOpen={Boolean(reviewTrip)}
              onClose={() => onReviewTripChange(null)}
              title={isUnconfirmedTrip ? 'Review Web Booking' : 'Trip Details & History'}
              subtitle={`Trip #${reviewTrip.id} • Created ${new Date(
                reviewTrip.createdAt || Date.now()
              ).toLocaleTimeString()}`}
              icon={
                isUnconfirmedTrip ? (
                  <DocumentTextIcon className="w-4 h-4 text-blue-400" />
                ) : (
                  <ShieldCheckIcon className="w-4 h-4 text-purple-400" />
                )
              }
              headerExtra={
                <div className="flex items-center gap-1.5 flex-wrap mr-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                      isUnconfirmedTrip
                        ? 'bg-amber-400 text-slate-950 animate-pulse'
                        : (reviewTrip.status || '').toUpperCase() === 'CONFIRMED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : reviewTrip.status === 'cancelled' ||
                          reviewTrip.status === 'declined' ||
                          reviewTrip.status === 'DECLINED'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    {reviewTrip.status}
                  </span>
                  {isReturnRide ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500 text-white uppercase tracking-wider">
                      <RepeatIcon className="w-3 h-3" />
                      <span>Return Leg {linkedTripId ? `(#${linkedTripId})` : ''}</span>
                    </span>
                  ) : hasReturnTrip ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500 text-white uppercase tracking-wider">
                      <RepeatIcon className="w-3 h-3" />
                      <span>Outbound Leg {returnTripId ? `(Return #${returnTripId})` : ''}</span>
                    </span>
                  ) : null}
                </div>
              }
              initialSize={{ width: 840, height: 740 }}
              minWidth={520}
              minHeight={420}
              hasBackdrop={false}
              isDraggable={true}
              isResizable={true}
              isMinimizable={true}
              isMaximizable={true}
              zIndex={120}
            >
              {/* Navigation Tabs Header + Full Actions Suite */}
              <div className="bg-surface-header/95 px-4 sm:px-6 border-b border-border-header flex items-center justify-between gap-2 shrink-0 sticky top-0 z-10">
                <div className="flex items-center gap-2 overflow-x-auto min-w-0">
                  <button
                    type="button"
                    onClick={() => onReviewModalTabChange('details')}
                    className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer shrink-0 ${
                      reviewModalTab === 'details'
                        ? 'border-blue-500 text-white bg-surface-header-elevated/60'
                        : 'border-transparent text-fg-subtle hover:text-fg-on-header hover:bg-surface-header-elevated/30'
                    }`}
                  >
                    <DocumentTextIcon className="w-3.5 h-3.5 text-blue-400" />
                    <span>Booking Details</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onReviewModalTabChange('audit')}
                    className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer shrink-0 ${
                      reviewModalTab === 'audit'
                        ? 'border-purple-500 text-white bg-surface-header-elevated/60'
                        : 'border-transparent text-fg-subtle hover:text-fg-on-header hover:bg-surface-header-elevated/30'
                    }`}
                  >
                    <ShieldCheckIcon className="w-3.5 h-3.5 text-purple-400" />
                    <span>Audit Trail</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-header-elevated text-slate-300 font-mono">
                      {reviewTrip.auditLog?.length || 0}
                    </span>
                  </button>
                </div>

                <div className="py-1.5 shrink-0">
                  <TripActionDropdown
                    trip={reviewTrip}
                    isUnconfirmed={isUnconfirmedTrip}
                    isDesktop={isDesktop}
                    variant="dark"
                    compact
                    showEditOnDesktop
                    showFocusMapOnDesktop={Boolean(tripActions?.onFocusMap)}
                    hideReview={reviewModalTab === 'details'}
                    onReview={() => onReviewModalTabChange('details')}
                    onEdit={() => {
                      const target = reviewTrip;
                      onReviewTripChange(null);
                      onEditTripFromReview(target);
                    }}
                    onFare={() => tripActions?.onFare(reviewTrip)}
                    onAudit={() => onReviewModalTabChange('audit')}
                    onClone={() => {
                      const target = reviewTrip;
                      onReviewTripChange(null);
                      onCloneBookingFromReview(target);
                    }}
                    onFocusMap={() => tripActions?.onFocusMap(reviewTrip)}
                    onStartAutoOffer={
                      onStartAutoOffer ? () => void onStartAutoOffer(reviewTrip) : undefined
                    }
                    onCancelAutoOffer={
                      onCancelAutoOffer ? () => void onCancelAutoOffer(reviewTrip) : undefined
                    }
                    onSendStagedToDriver={
                      stagedPlanner && hasStagedDriver(reviewTrip)
                        ? () => void stagedPlanner.sendStagedTrip(reviewTrip)
                        : undefined
                    }
                    onStageDriver={
                      stagedPlanner && isTripEligibleForStaging(reviewTrip) && tripActions?.onOpenDriverPicker
                        ? () => {
                            stagedPlanner.setDriverPickerMode('stage_hold');
                            tripActions.onOpenDriverPicker?.(reviewTrip);
                          }
                        : undefined
                    }
                    onClearStagedDriver={
                      stagedPlanner && hasStagedDriver(reviewTrip)
                        ? () => void stagedPlanner.clearTripStage(reviewTrip)
                        : undefined
                    }
                    onCompleteTrip={() => onOpenCompleteTripModal(reviewTrip)}
                    onCancelTrip={() => onPromptCancelTrip(reviewTrip)}
                    onReactivateTrip={() => onReactivateTrip(reviewTrip)}
                  />
                </div>
              </div>

              {/* Notification alert banner */}
              {reviewAlert && (
                <div
                  className={`px-5 py-3 text-xs font-bold flex items-center gap-2 shrink-0 ${
                    reviewAlert.type === 'success'
                      ? 'bg-status-success-bg text-status-success-fg border-b border-status-success-border'
                      : 'bg-status-danger-bg text-status-danger-fg border-b border-status-danger-border'
                  }`}
                >
                  {reviewAlert.type === 'success' ? (
                    <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangleIcon className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{reviewAlert.message}</span>
                </div>
              )}

              {/* Modal Content */}
              {reviewModalTab === 'audit' ? (
                <div className="p-6 overflow-y-auto flex-1">
                  <TripAuditTimeline trip={reviewTrip} hideSummaryBar={false} />
                </div>
              ) : (
                <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
                  <TripDrawerOverviewSection
                    reviewTrip={reviewTrip}
                    trips={trips}
                    drivers={drivers}
                    settings={settings}
                    reviewModalTab={reviewModalTab}
                    isRefreshingFlight={isRefreshingFlight}
                    isSyncingFlightEta={isSyncingFlightEta}
                    onOpenReviewModal={onOpenReviewModal}
                    onReviewTripChange={onReviewTripChange}
                    onQuickAssignDriver={onQuickAssignDriver}
                    onStartAutoOffer={onStartAutoOffer}
                    onCancelAutoOffer={onCancelAutoOffer}
                    onRefreshTripFlight={handleRefreshTripFlight}
                    onAdjustPickupToFlightEta={handleAdjustPickupToFlightEta}
                    stagedPlanner={stagedPlanner}
                    actorEmail={user?.email || 'Dispatcher'}
                    onTripsChange={onTripsChange}
                    onShowToast={onShowToast}
                  />

                  <TripDrawerPricingPaymentSection
                    reviewTrip={reviewTrip}
                    hasLinkedLeg={hasLinkedLeg}
                    reviewDeclineMode={reviewDeclineMode}
                    reviewClarifyMode={reviewClarifyMode}
                    isOverridingStatus={isOverridingStatus}
                    confirmScope={confirmScope}
                    onConfirmScopeChange={setConfirmScope}
                    payLinkBusyAction={payLinkBusyAction}
                    generatedPayUrl={generatedPayUrl}
                    onTripPayLinkAction={handleTripPayLinkAction}
                    isOverrideEmailEnabled={isOverrideEmailEnabled}
                    onOverrideEmailEnabledChange={setIsOverrideEmailEnabled}
                    overrideRecipientEmail={overrideRecipientEmail}
                    onOverrideRecipientEmailChange={setOverrideRecipientEmail}
                    shouldUpdatePassengerEmail={shouldUpdatePassengerEmail}
                    onShouldUpdatePassengerEmailChange={setShouldUpdatePassengerEmail}
                    onManualStatusOverride={handleManualStatusOverride}
                    onOpenCompleteTripModal={onOpenCompleteTripModal}
                    onPromptCancelTrip={onPromptCancelTrip}
                  />

                  {/* Decline View (if toggled) */}
                  {reviewDeclineMode && (
                    <div className="p-4 bg-status-danger-bg rounded-xl border border-status-danger-border space-y-3 animate-in fade-in duration-100">
                      <div className="font-bold text-status-danger-fg flex items-center justify-between">
                        <span>Select Reason for Declining Booking</span>
                        <span className="text-[10px] text-status-danger-fg">
                          Passenger will receive rejection notification
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {[
                          'No driver availability for requested time',
                          'Outside standard operating service area',
                          'Vehicle class unavailable',
                          'Insufficient advance notice',
                          'Customer requested cancellation',
                          'Custom reason',
                        ].map((reason) => (
                          <label
                            key={reason}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                              selectedDeclineReason === reason
                                ? 'bg-surface-card border-red-400 font-bold text-red-950 shadow-2xs'
                                : 'bg-status-danger-bg/50 border-red-100 text-status-danger-fg hover:bg-surface-card'
                            }`}
                          >
                            <input
                              type="radio"
                              name="declineReason"
                              value={reason}
                              checked={selectedDeclineReason === reason}
                              onChange={(e) => setSelectedDeclineReason(e.target.value)}
                              className="text-red-600 focus:ring-red-500"
                            />
                            <span>{reason}</span>
                          </label>
                        ))}
                      </div>

                      {hasLinkedLeg && (
                        <div className="pt-2 border-t border-status-danger-border">
                          <label className="block text-status-danger-fg font-bold mb-1.5 text-xs">
                            Round-Trip Decline Scope:
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label
                              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                                declineScope === 'leg'
                                  ? 'bg-surface-card border-red-400 font-bold text-red-950 shadow-2xs'
                                  : 'bg-status-danger-bg/40 border-red-100 text-status-danger-fg hover:bg-surface-card'
                              }`}
                            >
                              <input
                                type="radio"
                                name="declineScope"
                                value="leg"
                                checked={declineScope === 'leg'}
                                onChange={() => setDeclineScope('leg')}
                                className="text-red-600 focus:ring-red-500"
                              />
                              <span>Decline this leg only (keep #{linkedLegId} active)</span>
                            </label>
                            <label
                              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                                declineScope === 'both'
                                  ? 'bg-surface-card border-red-400 font-bold text-red-950 shadow-2xs'
                                  : 'bg-status-danger-bg/40 border-red-100 text-status-danger-fg hover:bg-surface-card'
                              }`}
                            >
                              <input
                                type="radio"
                                name="declineScope"
                                value="both"
                                checked={declineScope === 'both'}
                                onChange={() => setDeclineScope('both')}
                                className="text-red-600 focus:ring-red-500"
                              />
                              <span>Decline entire round trip (cancel both legs)</span>
                            </label>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-fg-secondary font-semibold mb-1">
                          {selectedDeclineReason === 'Custom reason'
                            ? 'Custom Explanation (Required for passenger email):'
                            : 'Additional Notes / Guidance (Optional):'}
                        </label>
                        <textarea
                          rows={2}
                          value={reviewCustomNotes}
                          onChange={(e) => setReviewCustomNotes(e.target.value)}
                          placeholder={
                            selectedDeclineReason === 'Custom reason'
                              ? 'Explain why this ride request cannot be serviced...'
                              : 'Optional note to customer...'
                          }
                          className="w-full px-3 py-2 bg-surface-card border border-status-danger-border rounded-lg text-fg-primary text-xs focus:ring-1 focus:ring-red-500 focus:outline-hidden"
                        />
                      </div>
                    </div>
                  )}

                  {/* Clarification Request View (if toggled) */}
                  {reviewClarifyMode && (
                    <div className="p-4 bg-status-warning-bg rounded-xl border border-status-warning-border space-y-3 animate-in fade-in duration-100">
                      <div className="font-bold text-status-warning-fg flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <AlertCircleIcon className="w-3.5 h-3.5 text-status-warning-fg shrink-0" />
                          <span>Request More Information / Clarification</span>
                        </span>
                        <span className="text-[10px] text-status-warning-fg">
                          Passenger will receive action-required email
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-fg-secondary font-semibold text-xs">
                          Select Inquiry Topic:
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {[
                            'Pickup or Dropoff location details',
                            'Flight / FBO / Aircraft tail number',
                            'Scheduled pickup timing confirmation',
                            'Passenger count / Luggage capacity',
                            'Child safety seat requirements',
                            'Other / Custom inquiry',
                          ].map((topic) => (
                            <label
                              key={topic}
                              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                                clarifyTopic === topic
                                  ? 'bg-surface-card border-status-warning-border font-bold text-status-warning-fg shadow-2xs'
                                  : 'bg-status-warning-bg/50 border-amber-100 text-status-warning-fg hover:bg-surface-card'
                              }`}
                            >
                              <input
                                type="radio"
                                name="clarifyTopic"
                                value={topic}
                                checked={clarifyTopic === topic}
                                onChange={(e) => setClarifyTopic(e.target.value)}
                                className="text-amber-600 focus:ring-amber-500"
                              />
                              <span>{topic}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-fg-secondary font-semibold mb-1">
                          Message to Passenger (Required):
                        </label>
                        <textarea
                          rows={3}
                          value={clarifyMessage}
                          onChange={(e) => setClarifyMessage(e.target.value)}
                          placeholder={`Please specify what details are needed from ${reviewTrip.passenger.firstName}...`}
                          className="w-full px-3 py-2 bg-surface-card border border-status-warning-border rounded-lg text-fg-primary text-xs focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                        />
                        <div className="text-[11px] text-status-warning-fg mt-1">
                          The passenger will receive an email prompting them to reply or call
                          dispatch directly.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Modal Actions Footer */}
              <div className="bg-surface-subtle border-t border-border-subtle px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 shrink-0 sticky bottom-0 z-10">
                <button
                  type="button"
                  onClick={() => onReviewTripChange(null)}
                  disabled={isProcessingReview}
                  className="px-4 py-2 rounded-xl border border-border-strong text-fg-secondary hover:bg-surface-muted font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  Close
                </button>

                {reviewModalTab === 'audit' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onReviewModalTabChange('details')}
                      className="px-4 py-2 rounded-xl bg-surface-header-elevated hover:bg-surface-header text-white font-bold text-xs transition-colors cursor-pointer"
                    >
                      View Booking Details
                    </button>
                    {!isUnconfirmedTrip &&
                      (() => {
                        const ctxEmail = getContextualEmailMeta(reviewTrip.status);
                        return (
                          <button
                            type="button"
                            disabled={isProcessingReview}
                            onClick={handleSendContextualTripEmail}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isProcessingReview ? (
                              <>
                                <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                                <span>Sending...</span>
                              </>
                            ) : (
                              <>
                                <MailIcon className="w-3.5 h-3.5 shrink-0" />
                                <span>{ctxEmail.label}</span>
                              </>
                            )}
                          </button>
                        );
                      })()}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {!reviewDeclineMode && !reviewClarifyMode ? (
                      <>
                        {isUnconfirmedTrip ? (
                          <>
                            <button
                              type="button"
                              disabled={isProcessingReview}
                              onClick={() => {
                                setReviewDeclineMode(true);
                                setReviewClarifyMode(false);
                              }}
                              className="px-4 py-2 rounded-xl bg-status-danger-bg hover:bg-status-danger-bg-strong border border-status-danger-border text-status-danger-fg font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Decline...
                            </button>
                            <button
                              type="button"
                              disabled={isProcessingReview}
                              onClick={() => {
                                setReviewClarifyMode(true);
                                setReviewDeclineMode(false);
                              }}
                              className="px-4 py-2 rounded-xl bg-status-warning-bg hover:bg-status-warning-bg-strong border border-status-warning-border text-status-warning-fg font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                            >
                              <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" />
                              <span>Request Info...</span>
                            </button>
                            <button
                              type="button"
                              disabled={isProcessingReview}
                              onClick={handleConfirmTrip}
                              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {isProcessingReview ? (
                                <>
                                  <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                                  <span>Confirming...</span>
                                </>
                              ) : (
                                <>
                                  <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                                  <span>
                                    {hasLinkedLeg && confirmScope === 'both'
                                      ? 'Confirm Round-Trip Bookings'
                                      : 'Confirm & Accept Booking'}
                                  </span>
                                </>
                              )}
                            </button>
                          </>
                        ) : (
                          (() => {
                            const normStatus = (reviewTrip.status || '').toLowerCase();
                            const isCancelledOrDeclined =
                              normStatus === 'cancelled' || normStatus === 'declined';
                            const isCompletedStatus = normStatus === 'completed';
                            const ctxEmail = getContextualEmailMeta(reviewTrip.status);
                            return (
                              <>
                                {isCancelledOrDeclined ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={isProcessingReview}
                                      onClick={() => onReactivateTrip(reviewTrip)}
                                      className="px-4 py-2 rounded-xl bg-status-success-bg hover:bg-status-success-bg-strong border border-status-success-border text-status-success-fg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                      <RefreshCwIcon className="w-3.5 h-3.5 shrink-0" />
                                      <span>Reactivate Trip</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isProcessingReview}
                                      onClick={() => {
                                        const target = reviewTrip;
                                        onReviewTripChange(null);
                                        onCloneBookingFromReview(target);
                                      }}
                                      className="px-4 py-2 rounded-xl bg-surface-header-elevated hover:bg-surface-header text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                      <CopyIcon className="w-3.5 h-3.5 shrink-0" />
                                      <span>Copy Booking</span>
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      disabled={isProcessingReview}
                                      onClick={() => {
                                        const target = reviewTrip;
                                        onReviewTripChange(null);
                                        onEditTripFromReview(target);
                                      }}
                                      className="px-3.5 py-2 rounded-xl bg-surface-card hover:bg-surface-muted border border-border-strong text-fg-strong font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                      <PencilIcon className="w-3.5 h-3.5 text-fg-secondary shrink-0" />
                                      <span>
                                        {isCompletedStatus ? 'Edit Details' : 'Edit Trip'}
                                      </span>
                                    </button>

                                    {!isCompletedStatus && (
                                      <>
                                        <button
                                          type="button"
                                          disabled={isProcessingReview}
                                          onClick={() => onPromptCancelTrip(reviewTrip)}
                                          className="px-3.5 py-2 rounded-xl bg-status-danger-bg hover:bg-status-danger-bg-strong border border-status-danger-border text-status-danger-fg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                          <BanIcon className="w-3.5 h-3.5 shrink-0" />
                                          <span>Cancel Trip</span>
                                        </button>

                                        <button
                                          type="button"
                                          disabled={isProcessingReview}
                                          onClick={() => onOpenCompleteTripModal(reviewTrip)}
                                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                          <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                                          <span>Complete Trip</span>
                                        </button>
                                      </>
                                    )}

                                    <button
                                      type="button"
                                      disabled={isProcessingReview}
                                      onClick={handleSendContextualTripEmail}
                                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                      {isProcessingReview ? (
                                        <>
                                          <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                                          <span>Sending...</span>
                                        </>
                                      ) : (
                                        <>
                                          <MailIcon className="w-3.5 h-3.5 shrink-0" />
                                          <span>
                                            {isOverrideEmailEnabled &&
                                            overrideRecipientEmail.trim()
                                              ? `${ctxEmail.shortLabel} → ${overrideRecipientEmail.trim()}`
                                              : ctxEmail.label}
                                          </span>
                                        </>
                                      )}
                                    </button>
                                  </>
                                )}
                              </>
                            );
                          })()
                        )}
                      </>
                    ) : reviewDeclineMode ? (
                      <>
                        <button
                          type="button"
                          disabled={isProcessingReview}
                          onClick={() => setReviewDeclineMode(false)}
                          className="px-3.5 py-2 rounded-xl border border-border-strong text-fg-secondary hover:bg-surface-muted font-bold text-xs transition-colors cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          disabled={
                            isProcessingReview ||
                            (selectedDeclineReason === 'Custom reason' &&
                              !reviewCustomNotes.trim())
                          }
                          onClick={handleDeclineTrip}
                          className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessingReview ? (
                            <>
                              <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                              <span>Declining...</span>
                            </>
                          ) : (
                            <span>Send Rejection &amp; Decline Trip</span>
                          )}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={isProcessingReview}
                          onClick={() => setReviewClarifyMode(false)}
                          className="px-3.5 py-2 rounded-xl border border-border-strong text-fg-secondary hover:bg-surface-muted font-bold text-xs transition-colors cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          disabled={isProcessingReview || !clarifyMessage.trim()}
                          onClick={handleSendClarificationRequest}
                          className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessingReview ? (
                            <>
                              <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                              <span>Sending Email...</span>
                            </>
                          ) : (
                            <span>Send Clarification Email</span>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </FloatingWindow>
          );
        })()}

      {/* Audit Trail Drawer Modal */}
      {auditTrailTrip && (
        <TripAuditModal trip={auditTrailTrip} onClose={onCloseAuditTrailTrip} />
      )}

      {/* ─── Dispatch Console: Complete Trip Modal ─── */}
      <DispatchCompleteTripModal
        isDesktop={isDesktop}
        user={user}
        settings={settings}
        drivers={drivers}
        completeTripTarget={completeTripTarget}
        completeModalOpenSeq={completeModalOpenSeq}
        onTripsChange={onTripsChange}
        onReviewTripChange={onReviewTripChange}
        onCloseCompleteTripModal={onCloseCompleteTripModal}
        onShowToast={onShowToast}
      />
    </>
  );
}
