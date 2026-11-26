import React, { Suspense } from 'react';
import { useDisplayLayout } from '../../../../core/hooks/useDisplayLayout';
import { LayoutToggle } from '../../../ui/LayoutToggle';
import { Button } from '../../../ui/Button';
import { Checkbox } from '../../../ui/Checkbox';
import { Select } from '../../../ui/Select';
import { Alert } from '../../../ui/Alert';
import { DownloadIcon, SearchIcon, SpinnerIcon } from '../../../ui/Icons';
import { TripAuditModal } from '../TripAuditModal';
import { DispatchCompleteTripModal } from '../../dispatch/drawer/DispatchCompleteTripModal';
import { AdminTripsTablePanel } from '../trips/AdminTripsTablePanel';
import { AdminTripsExceptionsPanel } from '../trips/AdminTripsExceptionsPanel';
import { AdminTripDetailsSlideOver } from '../trips/AdminTripDetailsSlideOver';
import {
  useAdminTripsController,
  type TripsSubTab,
} from '../trips/useAdminTripsController';

const StandingOrdersDrawer = React.lazy(() =>
  import('../../dispatch/StandingOrdersDrawer').then((m) => ({
    default: m.StandingOrdersDrawer,
  }))
);

export type { TripsSubTab };

export interface AdminTripsSubpageProps {
  initialSubTab?: TripsSubTab | string;
}

export function AdminTripsSubpage({ initialSubTab = 'dispatch' }: AdminTripsSubpageProps) {
  const [displayLayout, setDisplayLayout] = useDisplayLayout('admin-trips-layout');
  const ctrl = useAdminTripsController(initialSubTab);

  return (
    <div className="space-y-4">
      {ctrl.actionSuccessMessage && (
        <Alert variant="success" className="animate-in fade-in text-xs font-semibold">
          {ctrl.actionSuccessMessage}
        </Alert>
      )}
      {ctrl.error && (
        <Alert variant="error" className="animate-in fade-in text-xs">
          {ctrl.error}
        </Alert>
      )}

      {ctrl.activeSub === 'standing-orders' ? (
        <Suspense
          fallback={
            <div className="p-12 bg-surface-card rounded-2xl border border-border-subtle flex items-center justify-center gap-2 text-xs text-fg-muted">
              <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
              <span>Loading Standing Orders Series Manager...</span>
            </div>
          }
        >
          <StandingOrdersDrawer
            mode="embedded"
            isOpen={true}
            trips={ctrl.trips}
            drivers={ctrl.drivers}
          />
        </Suspense>
      ) : (
        <>
          {/* Unified Trips Toolbar */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-surface-card px-4 py-3 rounded-2xl border border-border-subtle/90 shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
              <div className="w-full sm:w-72 relative">
                <SearchIcon className="w-4 h-4 text-fg-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search passenger, phone, address, trip ID..."
                  value={ctrl.searchTerm}
                  onChange={(e) => ctrl.setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-surface-subtle border border-border-subtle rounded-xl text-xs focus:bg-surface-card outline-hidden"
                />
              </div>

              {(ctrl.activeSub === 'dispatch' || ctrl.activeSub === 'exceptions') && (
                <div className="inline-flex rounded-xl border border-border-subtle bg-surface-subtle p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => ctrl.setAssignMode('send_to_driver')}
                    className={`px-2.5 py-1 rounded-lg font-extrabold cursor-pointer transition-colors ${
                      ctrl.assignMode === 'send_to_driver'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-fg-secondary hover:text-fg-primary'
                    }`}
                  >
                    Send to Driver
                  </button>
                  <button
                    type="button"
                    onClick={() => ctrl.setAssignMode('stage_hold')}
                    className={`px-2.5 py-1 rounded-lg font-extrabold cursor-pointer transition-colors ${
                      ctrl.assignMode === 'stage_hold'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-fg-secondary hover:text-fg-primary'
                    }`}
                  >
                    📌 Hold (Stage)
                  </button>
                </div>
              )}

              {ctrl.activeSub === 'history' && (
                <>
                  <Select
                    size="sm"
                    fullWidth={false}
                    value={ctrl.statusFilter}
                    onChange={(e) => ctrl.setStatusFilter(e.target.value)}
                  >
                    <option value="all">All Lifecycles ({ctrl.trips.length})</option>
                    <option value="late">Late (Past Pickup)</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="assigned">Assigned / Active</option>
                    <option value="pending">Pending</option>
                  </Select>
                  <Checkbox
                    size="sm"
                    checked={ctrl.includeArchivedInHistory}
                    onChange={(checked) => ctrl.setIncludeArchivedInHistory(checked)}
                    label={<span className="text-xs font-semibold text-fg-secondary">Include Archived</span>}
                    className="w-auto!"
                  />
                </>
              )}
            </div>

            <div className="flex items-center gap-2 justify-end shrink-0 flex-wrap">
              {ctrl.activeSub !== 'exceptions' && (
                <LayoutToggle layout={displayLayout} onChange={setDisplayLayout} size="sm" />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={ctrl.handleExportCSV}
                className="text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <DownloadIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Export CSV</span>
              </Button>
            </div>
          </div>

          {ctrl.activeSub === 'exceptions' ? (
            <AdminTripsExceptionsPanel
              trips={ctrl.exceptionTrips}
              drivers={ctrl.drivers}
              dispatchAutomation={ctrl.appSettings.dispatchAutomation}
              exceptionByTripId={ctrl.exceptionByTripId}
              assignMode={ctrl.assignMode}
              actionLoadingId={ctrl.actionLoadingId}
              openActionTripId={ctrl.openActionTripId}
              onOpenActionChange={ctrl.setOpenActionTripId}
              onSelectTrip={ctrl.setSelectedTrip}
              onDriverDropdownChange={ctrl.handleDriverDropdownChange}
              onSendStaged={ctrl.handleSendStaged}
              onClearStaged={ctrl.handleClearStaged}
              onStagePrompt={(trip) => {
                ctrl.setAssignMode('stage_hold');
                ctrl.setSelectedTrip(trip);
              }}
              onResolveGuestChangeRequest={ctrl.handleResolveGuestChangeRequest}
              onCompleteTrip={(t) => ctrl.openCompleteTripModal(t)}
              onCancelTrip={(t) =>
                ctrl.handleStatusTransition(t.id, 'cancelled', {
                  reason: 'Admin cancelled from console',
                })
              }
              onReactivateTrip={(t) => ctrl.handleStatusTransition(t.id, 'confirmed')}
              onAuditTrip={ctrl.setAuditModalTrip}
            />
          ) : (
            <AdminTripsTablePanel
              trips={ctrl.activeSub === 'dispatch' ? ctrl.activeQueueTrips : ctrl.historyTrips}
              drivers={ctrl.drivers}
              vehicles={ctrl.vehicles}
              fleetCars={ctrl.fleetCars}
              dispatchAutomation={ctrl.appSettings.dispatchAutomation}
              exceptionByTripId={ctrl.exceptionByTripId}
              isLoading={ctrl.isLoading}
              displayLayout={displayLayout}
              assignMode={ctrl.assignMode}
              selectedTripId={ctrl.selectedTrip?.id || null}
              actionLoadingId={ctrl.actionLoadingId}
              openActionTripId={ctrl.openActionTripId}
              searchTerm={ctrl.searchTerm}
              showArchiveActions={ctrl.activeSub === 'history'}
              isArchivedTrip={ctrl.isArchivedTrip}
              onSelectTrip={ctrl.setSelectedTrip}
              onOpenActionChange={ctrl.setOpenActionTripId}
              onDriverDropdownChange={ctrl.handleDriverDropdownChange}
              onSendStaged={ctrl.handleSendStaged}
              onClearStaged={ctrl.handleClearStaged}
              onStagePrompt={(trip) => {
                ctrl.setAssignMode('stage_hold');
                ctrl.setSelectedTrip(trip);
              }}
              onConfirmTrip={(t) => ctrl.handleStatusTransition(t.id, 'CONFIRMED')}
              onCompleteTrip={(t) => ctrl.openCompleteTripModal(t)}
              onCancelTrip={(t) =>
                ctrl.handleStatusTransition(t.id, 'cancelled', {
                  reason: 'Admin cancelled from console',
                })
              }
              onReactivateTrip={(t) => ctrl.handleStatusTransition(t.id, 'confirmed')}
              onAuditTrip={ctrl.setAuditModalTrip}
              onToggleArchive={ctrl.handleToggleArchiveTrip}
            />
          )}
        </>
      )}

      <AdminTripDetailsSlideOver
        trip={ctrl.selectedTrip}
        drivers={ctrl.drivers}
        dispatchAutomation={ctrl.appSettings.dispatchAutomation}
        exception={ctrl.selectedTrip ? ctrl.exceptionByTripId[ctrl.selectedTrip.id] : undefined}
        assignMode={ctrl.assignMode}
        onAssignModeChange={ctrl.setAssignMode}
        isArchived={ctrl.selectedTrip ? ctrl.isArchivedTrip(ctrl.selectedTrip) : false}
        isBusy={Boolean(ctrl.selectedTrip && ctrl.actionLoadingId === ctrl.selectedTrip.id)}
        onClose={() => ctrl.setSelectedTrip(null)}
        onDriverDropdownChange={ctrl.handleDriverDropdownChange}
        onSendStaged={ctrl.handleSendStaged}
        onClearStaged={ctrl.handleClearStaged}
        onResolveGuestChangeRequest={ctrl.handleResolveGuestChangeRequest}
        onConfirmTrip={(t) => ctrl.handleStatusTransition(t.id, 'CONFIRMED')}
        onCompleteTrip={(t) => ctrl.openCompleteTripModal(t)}
        onCancelTrip={(t) =>
          ctrl.handleStatusTransition(t.id, 'cancelled', {
            reason: 'Admin cancelled from console',
          })
        }
        onAuditTrip={ctrl.setAuditModalTrip}
        onToggleArchive={ctrl.handleToggleArchiveTrip}
      />

      <DispatchCompleteTripModal
        user={ctrl.currentUser}
        settings={ctrl.appSettings}
        drivers={ctrl.drivers}
        completeTripTarget={ctrl.completeTripTarget}
        completeModalOpenSeq={ctrl.completeModalOpenSeq}
        onTripsChange={ctrl.setTrips}
        onReviewTripChange={ctrl.setSelectedTrip}
        onCloseCompleteTripModal={ctrl.closeCompleteTripModal}
        onShowToast={(text, type) => {
          if (type === 'error') ctrl.setError(text);
          else ctrl.showSuccess(text);
        }}
      />

      {ctrl.auditModalTrip && (
        <TripAuditModal
          trip={ctrl.auditModalTrip}
          onClose={() => ctrl.setAuditModalTrip(null)}
        />
      )}
    </div>
  );
}
