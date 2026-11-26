import React from 'react';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import { CarIcon, CheckIcon, ClockIcon, MapPinIcon, XIcon } from '../../../ui/Icons';
import type {
  MapOverlayPlaceItem,
  SelectedCustomOverlayItem,
} from './useLiveMapCustomOverlays';

export interface MapCustomOverlayInfoCardProps {
  selectedOverlay: SelectedCustomOverlayItem | null;
  availableDriversInZone: number;
  appliedEndpointFeedback: 'pickup' | 'dropoff' | null;
  onSetPlaceEndpoint: (place: MapOverlayPlaceItem, endpoint: 'pickup' | 'dropoff') => void;
  onOpenDriverQueue?: (driver: LiveFleetDriver) => void;
  onClose: () => void;
}

export const MapCustomOverlayInfoCard = React.memo(function MapCustomOverlayInfoCard({
  selectedOverlay,
  availableDriversInZone,
  appliedEndpointFeedback,
  onSetPlaceEndpoint,
  onOpenDriverQueue,
  onClose,
}: MapCustomOverlayInfoCardProps) {
  if (!selectedOverlay) return null;

  if (selectedOverlay.kind === 'zone') {
    const { zone } = selectedOverlay;
    const hasFlat = typeof zone.flatFee === 'number' && zone.flatFee > 0;
    const hasMult = typeof zone.surchargeMultiplier === 'number' && zone.surchargeMultiplier > 1;

    return (
      <div className="absolute top-15 left-2.5 right-2.5 sm:left-3 sm:right-auto sm:w-80 z-30 bg-surface-card/98 backdrop-blur-md rounded-2xl border border-border-subtle shadow-2xl p-3 space-y-2 text-xs animate-in fade-in zoom-in-95 duration-150 select-text">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-3 h-3 rounded-full shrink-0 ring-2 ring-black/10"
              style={{ backgroundColor: zone.color || '#3b82f6' }}
            />
            <div className="min-w-0">
              <div className="font-extrabold text-fg-primary truncate">{zone.name}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                {zone.type === 'polygon'
                  ? 'Polygon Service Zone'
                  : `Radius Zone (${zone.radiusMiles || 3} mi)`}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-fg-subtle hover:text-fg-secondary hover:bg-surface-muted cursor-pointer shrink-0"
            aria-label="Close zone info"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-status-success-bg text-status-success-fg border border-status-success-border text-[10.5px] font-extrabold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>
              {availableDriversInZone} Available {availableDriversInZone === 1 ? 'Driver' : 'Drivers'} in Zone
            </span>
          </span>

          {hasFlat && (
            <span className="px-2 py-0.5 rounded-full bg-status-info-bg text-status-info-fg border border-status-info-border text-[10.5px] font-extrabold">
              +${zone.flatFee!.toFixed(2)} Flat
            </span>
          )}
          {hasMult && (
            <span className="px-2 py-0.5 rounded-full bg-status-warning-bg text-status-warning-fg border border-status-warning-border text-[10.5px] font-extrabold">
              {zone.surchargeMultiplier}x Multiplier
            </span>
          )}
          {!hasFlat && !hasMult && (
            <span className="px-2 py-0.5 rounded-full bg-surface-muted text-fg-secondary border border-border-subtle text-[10.5px] font-semibold">
              Standard Rate
            </span>
          )}
        </div>

        {zone.description && (
          <p className="text-[11px] text-fg-secondary leading-snug line-clamp-2">{zone.description}</p>
        )}
      </div>
    );
  }

  if (selectedOverlay.kind === 'place') {
    const { place } = selectedOverlay;
    return (
      <div className="absolute top-15 left-2.5 right-2.5 sm:left-3 sm:right-auto sm:w-80 z-30 bg-surface-card/98 backdrop-blur-md rounded-2xl border border-border-subtle shadow-2xl p-3 space-y-2.5 text-xs animate-in fade-in zoom-in-95 duration-150 select-text">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${
                place.category === 'hq'
                  ? 'bg-surface-header text-amber-300 border-amber-500/60'
                  : 'bg-status-staged-bg text-status-staged-fg border-status-staged-border'
              }`}
            >
              {place.categoryLabel}
            </span>
            <div className="font-extrabold text-fg-primary text-xs leading-snug break-words pt-0.5">
              {place.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-fg-subtle hover:text-fg-secondary hover:bg-surface-muted cursor-pointer shrink-0"
            aria-label="Close place info"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-start gap-1.5 text-[11px] text-fg-secondary leading-snug">
          <MapPinIcon className="w-3.5 h-3.5 text-fg-subtle shrink-0 mt-0.5" />
          <span className="break-words">{place.address}</span>
        </div>

        {place.notes && (
          <div className="px-2 py-1 rounded-lg bg-surface-subtle border border-border-subtle/80 text-[10.5px] text-fg-secondary line-clamp-2">
            {place.notes}
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => onSetPlaceEndpoint(place, 'pickup')}
            className={`py-1.5 px-2.5 rounded-xl font-extrabold text-[11px] border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
              appliedEndpointFeedback === 'pickup'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-status-success-bg hover:bg-status-success-bg-strong text-status-success-fg border-status-success-border'
            }`}
          >
            {appliedEndpointFeedback === 'pickup' ? (
              <>
                <CheckIcon className="w-3 h-3" />
                <span>Pickup Set</span>
              </>
            ) : (
              <span>Set Pickup</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onSetPlaceEndpoint(place, 'dropoff')}
            className={`py-1.5 px-2.5 rounded-xl font-extrabold text-[11px] border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
              appliedEndpointFeedback === 'dropoff'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-status-danger-bg hover:bg-status-danger-bg-strong text-status-danger-fg border-status-danger-border'
            }`}
          >
            {appliedEndpointFeedback === 'dropoff' ? (
              <>
                <CheckIcon className="w-3 h-3" />
                <span>Dropoff Set</span>
              </>
            ) : (
              <span>Set Dropoff</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (selectedOverlay.kind === 'driver_home') {
    const { driverHome } = selectedOverlay;
    return (
      <div className="absolute top-15 left-2.5 right-2.5 sm:left-3 sm:right-auto sm:w-80 z-30 bg-surface-card/98 backdrop-blur-md rounded-2xl border border-border-subtle shadow-2xl p-3 space-y-2.5 text-xs animate-in fade-in zoom-in-95 duration-150 select-text">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-teal-700 text-white text-[10px] font-black">
                HOME · {driverHome.cabLabel}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-muted text-fg-secondary border border-border-subtle text-[10px] font-bold">
                <CarIcon className="w-3 h-3 text-fg-muted shrink-0" />
                <span>{driverHome.vehicleClassLabel}</span>
              </span>
            </div>
            <div className="font-extrabold text-fg-primary text-sm leading-snug truncate pt-0.5">
              {driverHome.driverName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-fg-subtle hover:text-fg-secondary hover:bg-surface-muted cursor-pointer shrink-0"
            aria-label="Close driver home info"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1.5 text-[11px] text-fg-secondary">
          <div className="flex items-center gap-1.5 font-semibold text-fg-secondary">
            <ClockIcon className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span>Shift: {driverHome.shiftScheduleSummary}</span>
          </div>
          <div className="flex items-start gap-1.5 leading-snug">
            <MapPinIcon className="w-3.5 h-3.5 text-fg-subtle shrink-0 mt-0.5" />
            <span className="break-words">{driverHome.homeAddress}</span>
          </div>
        </div>

        {onOpenDriverQueue && (
          <button
            type="button"
            onClick={() => onOpenDriverQueue(driverHome.driver)}
            className="w-full py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] shadow-2xs transition-colors cursor-pointer"
          >
            Open Driver Queue
          </button>
        )}
      </div>
    );
  }

  const { exclusion } = selectedOverlay;
  const isBlocked = exclusion.action === 'BLACKLIST_BLOCK';

  return (
    <div className="absolute top-15 left-2.5 right-2.5 sm:left-3 sm:right-auto sm:w-80 z-30 bg-surface-card/98 backdrop-blur-md rounded-2xl border border-border-subtle shadow-2xl p-3 space-y-2 text-xs animate-in fade-in zoom-in-95 duration-150 select-text">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${
              isBlocked
                ? 'bg-status-danger-bg-strong text-status-danger-fg border-status-danger-border'
                : 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border'
            }`}
          >
            {isBlocked ? 'BLOCKED' : 'REVIEW'}
          </span>
          <div className="font-extrabold text-fg-primary text-xs leading-snug break-words">
            {exclusion.name}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-fg-subtle hover:text-fg-secondary hover:bg-surface-muted cursor-pointer shrink-0"
          aria-label="Close exclusion info"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-fg-secondary pt-1 border-t border-border-faint">
        <span className="font-semibold text-fg-strong truncate">
          Reason: {exclusion.reasonCode || 'Safety Restriction'}
        </span>
        <span className="font-mono text-[10px] text-fg-muted shrink-0 ml-2">
          {(exclusion.radiusMiles || 0.25).toFixed(2)} mi
        </span>
      </div>
    </div>
  );
});
