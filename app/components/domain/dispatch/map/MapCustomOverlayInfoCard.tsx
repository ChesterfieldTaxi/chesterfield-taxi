import React from 'react';
import { CheckIcon, MapPinIcon, XIcon } from '../../../ui/Icons';
import type {
  MapOverlayPlaceItem,
  SelectedCustomOverlayItem,
} from './useLiveMapCustomOverlays';

export interface MapCustomOverlayInfoCardProps {
  selectedOverlay: SelectedCustomOverlayItem | null;
  availableDriversInZone: number;
  appliedEndpointFeedback: 'pickup' | 'dropoff' | null;
  onSetPlaceEndpoint: (place: MapOverlayPlaceItem, endpoint: 'pickup' | 'dropoff') => void;
  onClose: () => void;
}

export const MapCustomOverlayInfoCard = React.memo(function MapCustomOverlayInfoCard({
  selectedOverlay,
  availableDriversInZone,
  appliedEndpointFeedback,
  onSetPlaceEndpoint,
  onClose,
}: MapCustomOverlayInfoCardProps) {
  if (!selectedOverlay) return null;

  if (selectedOverlay.kind === 'zone') {
    const { zone } = selectedOverlay;
    const hasFlat = typeof zone.flatFee === 'number' && zone.flatFee > 0;
    const hasMult = typeof zone.surchargeMultiplier === 'number' && zone.surchargeMultiplier > 1;

    return (
      <div className="absolute top-15 left-2.5 right-2.5 sm:left-3 sm:right-auto sm:w-80 z-30 bg-white/98 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-3 space-y-2 text-xs animate-in fade-in zoom-in-95 duration-150 select-text">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-3 h-3 rounded-full shrink-0 ring-2 ring-black/10"
              style={{ backgroundColor: zone.color || '#3b82f6' }}
            />
            <div className="min-w-0">
              <div className="font-extrabold text-slate-900 truncate">{zone.name}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {zone.type === 'polygon'
                  ? 'Polygon Service Zone'
                  : `Radius Zone (${zone.radiusMiles || 3} mi)`}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
            aria-label="Close zone info"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10.5px] font-extrabold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>
              {availableDriversInZone} Available {availableDriversInZone === 1 ? 'Driver' : 'Drivers'} in Zone
            </span>
          </span>

          {hasFlat && (
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-[10.5px] font-extrabold">
              +${zone.flatFee!.toFixed(2)} Flat
            </span>
          )}
          {hasMult && (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10.5px] font-extrabold">
              {zone.surchargeMultiplier}x Multiplier
            </span>
          )}
          {!hasFlat && !hasMult && (
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10.5px] font-semibold">
              Standard Rate
            </span>
          )}
        </div>

        {zone.description && (
          <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">{zone.description}</p>
        )}
      </div>
    );
  }

  if (selectedOverlay.kind === 'place') {
    const { place } = selectedOverlay;
    return (
      <div className="absolute top-15 left-2.5 right-2.5 sm:left-3 sm:right-auto sm:w-80 z-30 bg-white/98 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-3 space-y-2.5 text-xs animate-in fade-in zoom-in-95 duration-150 select-text">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-extrabold">
              {place.categoryLabel}
            </span>
            <div className="font-extrabold text-slate-900 text-xs leading-snug break-words pt-0.5">
              {place.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
            aria-label="Close place info"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-start gap-1.5 text-[11px] text-slate-600 leading-snug">
          <MapPinIcon className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <span className="break-words">{place.address}</span>
        </div>

        {place.notes && (
          <div className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200/80 text-[10.5px] text-slate-600 line-clamp-2">
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
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
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
                : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300'
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

  const { exclusion } = selectedOverlay;
  const isBlocked = exclusion.action === 'BLACKLIST_BLOCK';

  return (
    <div className="absolute top-15 left-2.5 right-2.5 sm:left-3 sm:right-auto sm:w-80 z-30 bg-white/98 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-3 space-y-2 text-xs animate-in fade-in zoom-in-95 duration-150 select-text">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${
              isBlocked
                ? 'bg-red-100 text-red-900 border-red-300'
                : 'bg-amber-100 text-amber-950 border-amber-300'
            }`}
          >
            {isBlocked ? 'BLOCKED' : 'REVIEW'}
          </span>
          <div className="font-extrabold text-slate-900 text-xs leading-snug break-words">
            {exclusion.name}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
          aria-label="Close exclusion info"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-100">
        <span className="font-semibold text-slate-800 truncate">
          Reason: {exclusion.reasonCode || 'Safety Restriction'}
        </span>
        <span className="font-mono text-[10px] text-slate-500 shrink-0 ml-2">
          {(exclusion.radiusMiles || 0.25).toFixed(2)} mi
        </span>
      </div>
    </div>
  );
});
