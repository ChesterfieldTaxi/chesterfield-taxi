import React from 'react';
import type { Trip } from '../../../core/types/trip';
import type { DriverDutyStatus } from '../../../core/types/driver';
import type { LiveFleetDriver } from '../../../core/hooks/useDispatchFleet';
import type { DispatchFormValues } from './DispatchBookingEngine';
import { LiveFleetMap, buildFleetCarMarkerDataUrl, type LiveFleetMapProps } from './LiveFleetMap';

export { LiveFleetMap, buildFleetCarMarkerDataUrl, type LiveFleetMapProps };

export interface DispatchLiveMapPaneProps {
  activeMobileTab: string;
  drivers: LiveFleetDriver[];
  trips: Trip[];
  activeFormValues?: DispatchFormValues;
  activeTrip?: Trip | null;
  selectedMapTrip?: Trip | null;
  shouldZoomMap: boolean;
  focusedMapDriverId: string | null;
  activeResizeHandle: 'sidebar' | 'queue' | 'operations' | null;
  onQueueMouseDown: (e: React.MouseEvent | React.PointerEvent) => void;
  onResetQueueHeight: () => void;
  onClearFocusedDriver: () => void;
  onAssignDriverToTrip: (tripId: string, driverId: string) => void | Promise<void>;
  onOpenDriverQueue: (driver: LiveFleetDriver) => void;
  onCallDriver: (phone: string, name?: string) => void;
  onChangeDriverDutyStatus: (driverId: string, dutyStatus: DriverDutyStatus) => void | Promise<void>;
  onSelectTrip: (trip: Trip) => void;
  onClearSelectedTrip?: () => void;
  onOpenTripDetails?: (tripId: string) => void;
  onSwitchToRoster?: () => void;
}

export const DispatchLiveMapPane = React.memo(function DispatchLiveMapPane({
  activeMobileTab,
  drivers,
  trips,
  activeFormValues,
  activeTrip,
  selectedMapTrip,
  shouldZoomMap,
  focusedMapDriverId,
  activeResizeHandle,
  onQueueMouseDown,
  onResetQueueHeight,
  onClearFocusedDriver,
  onAssignDriverToTrip,
  onOpenDriverQueue,
  onCallDriver,
  onChangeDriverDutyStatus,
  onSelectTrip,
  onClearSelectedTrip,
  onOpenTripDetails,
  onSwitchToRoster,
}: DispatchLiveMapPaneProps) {
  return (
    <>
      {/* Live Google Map Stage */}
      <div
        className={`w-full relative z-0 ${
          activeMobileTab === 'map'
            ? 'flex-1 h-full'
            : activeMobileTab === 'queue'
            ? 'hidden lg:flex lg:flex-1 lg:min-h-[160px]'
            : 'flex-1 lg:min-h-[160px]'
        }`}
      >
        <LiveFleetMap
          fleet={drivers}
          trips={trips}
          activeFormValues={activeFormValues}
          activeTrip={activeTrip}
          selectedTrip={selectedMapTrip}
          shouldZoom={shouldZoomMap}
          focusedDriverId={focusedMapDriverId}
          onClearFocusedDriver={onClearFocusedDriver}
          onAssignDriverToTrip={onAssignDriverToTrip}
          onOpenDriverQueue={onOpenDriverQueue}
          onCallDriver={onCallDriver}
          onChangeDriverDutyStatus={onChangeDriverDutyStatus}
          onSelectTrip={onSelectTrip}
          onClearSelectedTrip={onClearSelectedTrip}
          onOpenTripDetails={onOpenTripDetails}
          onSwitchToRoster={activeMobileTab === 'map' ? onSwitchToRoster : undefined}
        />
      </div>

      {/* Resizer Handle (Bottom Queue — drag to resize, double-click to reset to 240px) */}
      <div
        onPointerDown={onQueueMouseDown}
        onDoubleClick={onResetQueueHeight}
        title="Drag to resize trips queue height (double-click to reset)"
        className={`hidden lg:flex items-center justify-center h-2 w-full cursor-row-resize transition-colors z-30 shrink-0 select-none group ${
          activeResizeHandle === 'queue'
            ? 'bg-blue-500/30'
            : 'bg-slate-200/60 hover:bg-blue-500/20'
        }`}
      >
        <div
          className={`h-0.5 w-12 rounded-full transition-colors ${
            activeResizeHandle === 'queue'
              ? 'bg-blue-600'
              : 'bg-slate-300 group-hover:bg-blue-500'
          }`}
        />
      </div>
    </>
  );
});
