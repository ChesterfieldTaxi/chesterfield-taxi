import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { SurchargesConfig, UniversalExtrasConfig } from '../../../../core/types/config';
import type { TripPricing } from '../../../../core/types/trip';
import { BUILTIN_SURCHARGE_IDS } from '../../../../core/services/pricing/surcharges.service';
import { CheckIcon, ChevronDownIcon } from '../../../ui/Icons';
import {
  buildActiveWaivableFeeOptions,
  type WaivableFeeOption,
} from './waive-fees-catalog.util';

export { buildActiveWaivableFeeOptions, type WaivableFeeOption };

function MenuCheckIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
        checked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300'
      }`}
    >
      {checked && <CheckIcon className="w-2.5 h-2.5 stroke-[3]" />}
    </span>
  );
}

export interface DispatchWaiveFeesDropdownProps {
  surchargesConfig?: SurchargesConfig | null;
  universalExtrasConfig?: UniversalExtrasConfig | null;
  outboundPricing?: TripPricing | null;
  waivedSurchargeIds: string[];
  onWaivedSurchargeIdsChange: (next: string[]) => void;
  waivedExtraKeys: string[];
  onWaivedExtraKeysChange: (next: string[]) => void;
  waiveAirportFee: boolean;
  setWaiveAirportFee: React.Dispatch<React.SetStateAction<boolean>>;
  waiveMultiStopFees: boolean;
  setWaiveMultiStopFees: React.Dispatch<React.SetStateAction<boolean>>;
  bypassSurge: boolean;
  setBypassSurge: React.Dispatch<React.SetStateAction<boolean>>;
}

export function DispatchWaiveFeesDropdown({
  surchargesConfig, universalExtrasConfig, outboundPricing,
  waivedSurchargeIds, onWaivedSurchargeIdsChange,
  waivedExtraKeys, onWaivedExtraKeysChange,
  waiveAirportFee, setWaiveAirportFee,
  waiveMultiStopFees, setWaiveMultiStopFees,
  bypassSurge, setBypassSurge,
}: DispatchWaiveFeesDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUpward: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const catalog = useMemo(
    () => buildActiveWaivableFeeOptions({ surchargesConfig, universalExtrasConfig, outboundPricing }),
    [surchargesConfig, universalExtrasConfig, outboundPricing]
  );

  const activeSurchargeSet = useMemo(() => {
    const s = new Set(waivedSurchargeIds);
    if (waiveAirportFee) s.add(BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS);
    if (bypassSurge) s.add(BUILTIN_SURCHARGE_IDS.PEAK_SURGE);
    return s;
  }, [waivedSurchargeIds, waiveAirportFee, bypassSurge]);

  const activeExtraSet = useMemo(() => {
    const s = new Set(waivedExtraKeys);
    if (waiveMultiStopFees) s.add('intermediate_stop');
    return s;
  }, [waivedExtraKeys, waiveMultiStopFees]);

  const selectedChips = useMemo(
    () =>
      catalog.all.filter((o) =>
        o.kind === 'surcharge' ? activeSurchargeSet.has(o.key) : activeExtraSet.has(o.key)
      ),
    [catalog.all, activeSurchargeSet, activeExtraSet]
  );

  const activeCount = selectedChips.length;

  const computeCoords = useCallback(() => {
    if (typeof window === 'undefined' || !btnRef.current) return null;
    const rect = btnRef.current.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 16);
    const estH = popoverRef.current?.offsetHeight || 280;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estH + 10 && rect.top > spaceBelow;
    const top = openUpward
      ? Math.max(8, rect.top - estH - 4)
      : Math.min(window.innerHeight - estH - 8, rect.bottom + 4);
    return { top, left, width, openUpward };
  }, []);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') { setCoords(null); return; }
    const update = () => { const next = computeCoords(); if (next) setCoords(next); };
    update();
    const raf = window.requestAnimationFrame(update);
    const onRepos = (e?: Event) => {
      if (e && popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      update();
    };
    const onOutside = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t || btnRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setIsOpen(false);
      setCoords(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setIsOpen(false); setCoords(null); }
    };
    window.addEventListener('resize', onRepos);
    window.addEventListener('scroll', onRepos, true);
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onRepos);
      window.removeEventListener('scroll', onRepos, true);
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, computeCoords]);

  const toggleOption = (opt: WaivableFeeOption) => {
    if (opt.kind === 'surcharge') {
      const next = new Set(activeSurchargeSet);
      const willCheck = !next.has(opt.key);
      if (willCheck) next.add(opt.key); else next.delete(opt.key);
      onWaivedSurchargeIdsChange(Array.from(next));
      if (opt.key === BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS) setWaiveAirportFee(willCheck);
      if (opt.key === BUILTIN_SURCHARGE_IDS.PEAK_SURGE) setBypassSurge(willCheck);
    } else {
      const next = new Set(activeExtraSet);
      const willCheck = !next.has(opt.key);
      if (willCheck) next.add(opt.key); else next.delete(opt.key);
      onWaivedExtraKeysChange(Array.from(next));
      if (opt.key === 'intermediate_stop') setWaiveMultiStopFees(willCheck);
    }
  };

  const clearAll = () => {
    onWaivedSurchargeIdsChange([]);
    onWaivedExtraKeysChange([]);
    setWaiveAirportFee(false);
    setWaiveMultiStopFees(false);
    setBypassSurge(false);
  };

  const renderGroup = (title: string, items: WaivableFeeOption[]) =>
    items.length > 0 && (
      <div className="py-1">
        <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{title}</div>
        {items.map((opt) => {
          const checked = opt.kind === 'surcharge' ? activeSurchargeSet.has(opt.key) : activeExtraSet.has(opt.key);
          return (
            <button
              key={`${opt.kind}:${opt.key}`}
              type="button"
              onClick={() => toggleOption(opt)}
              className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                checked ? 'bg-blue-50/80 text-blue-700 font-bold' : 'text-slate-700 hover:bg-blue-50/80 hover:text-blue-700'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <MenuCheckIndicator checked={checked} />
                <span className="truncate">{opt.label}</span>
              </span>
              {opt.liveAppliedAmount > 0 ? (
                <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 ${checked ? 'bg-emerald-100 text-emerald-800 line-through' : 'bg-amber-100 text-amber-900'}`}>
                  ${opt.liveAppliedAmount.toFixed(2)}
                </span>
              ) : (
                <span className="font-mono text-[10px] text-slate-400 shrink-0">{opt.rateBadge}</span>
              )}
            </button>
          );
        })}
      </div>
    );

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (isOpen) { setIsOpen(false); setCoords(null); return; }
          const initial = computeCoords();
          if (initial) setCoords(initial);
          setIsOpen(true);
        }}
        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs ${
          activeCount > 0
            ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
        }`}
      >
        <span>{activeCount > 0 ? `Waive Fees (${activeCount})` : 'Waive Fees'}</span>
        <ChevronDownIcon className="w-3 h-3 shrink-0" />
      </button>

      {selectedChips.map((chip) => (
        <span
          key={`${chip.kind}:${chip.key}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-bold"
        >
          <span className="truncate max-w-[140px]">✓ {chip.label}</span>
          <button
            type="button"
            title={`Restore ${chip.label}`}
            onClick={() => toggleOption(chip)}
            className="text-emerald-600 hover:text-red-600 font-bold cursor-pointer leading-none"
          >
            ✕
          </button>
        </span>
      ))}

      {isOpen && coords !== null && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            data-ui-select-portal="true"
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, transformOrigin: coords.openUpward ? 'bottom left' : 'top left' }}
            className="bg-white rounded-xl shadow-xl border border-slate-200/90 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 text-left divide-y divide-slate-100 select-none z-[99999]"
          >
            <div className="px-3 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between bg-slate-50/60 rounded-t-xl min-h-[28px]">
              <span>Waive Active Fees</span>
              <button
                type="button"
                disabled={activeCount === 0}
                onClick={clearAll}
                className="text-[10px] font-bold text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer"
              >
                Clear
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
              {renderGroup('Active Surcharges', catalog.surcharges)}
              {renderGroup('Active Extras', catalog.extras)}
              {catalog.all.length === 0 && (
                <div className="px-3 py-3 text-center text-[11px] text-slate-400">No active fees enabled in Admin</div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
