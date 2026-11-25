import React, { useCallback } from 'react';
import type { Trip } from '../../../core/types/trip';
import type { DriverRosterItem } from '../../../core/services/operator.service';
import { DispatchBookingEngine, type DispatchFormValues } from './DispatchBookingEngine';
import type { DispatchBookingFeedback } from './booking/useDispatchBookingSubmission';
import { SpinnerIcon } from '../../ui/Icons';

export interface MemoizedDraftBookingPaneProps {
  draftId: string;
  isActive: boolean;
  isNew: boolean;
  trip?: Trip;
  tripId?: string;
  allTrips: Trip[];
  drivers: DriverRosterItem[];
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
}

export const MemoizedDraftBookingPane = React.memo(function MemoizedDraftBookingPane({
  draftId,
  isActive,
  isNew,
  trip,
  tripId,
  allTrips,
  drivers,
  onValuesChangeByDraft,
  onBookingSuccessByDraft,
  onClearDraftById,
  onCloneBooking,
  onOpenLinkedTrip,
}: MemoizedDraftBookingPaneProps) {
  const handleValuesChange = useCallback(
    (vals: DispatchFormValues) => onValuesChangeByDraft(draftId, vals),
    [draftId, onValuesChangeByDraft]
  );
  const handleBookingSuccess = useCallback(
    (savedTrip: Trip, isEdit?: boolean, feedback?: DispatchBookingFeedback) =>
      onBookingSuccessByDraft(draftId, savedTrip, Boolean(isEdit), feedback),
    [draftId, onBookingSuccessByDraft]
  );
  const handleClearDraft = useCallback(
    () => onClearDraftById(draftId),
    [draftId, onClearDraftById]
  );

  return (
    <div className={`h-full w-full ${isActive ? 'block' : 'hidden'}`}>
      {!isNew && !trip && tripId ? (
        <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 gap-2 bg-slate-50">
          <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
          <span className="text-xs font-semibold text-slate-700">
            Restoring trip #{tripId.slice(-6).toUpperCase()}...
          </span>
        </div>
      ) : (
        <DispatchBookingEngine
          draftId={draftId}
          isActiveDraft={isActive}
          initialTrip={trip}
          allTrips={allTrips}
          drivers={drivers}
          onValuesChange={handleValuesChange}
          onBookingSuccess={handleBookingSuccess}
          onClearDraft={handleClearDraft}
          onCopyBooking={onCloneBooking}
          onCloneBooking={onCloneBooking}
          onOpenLinkedTrip={onOpenLinkedTrip}
        />
      )}
    </div>
  );
});
