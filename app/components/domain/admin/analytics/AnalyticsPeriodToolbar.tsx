import React, { useState, useRef, useEffect } from 'react';
import type {
  AnalyticsCsvReportType,
  AnalyticsPeriodPreset,
} from '../../../../core/services/analytics';
import { CalendarIcon, ChevronDownIcon, DownloadIcon, FileTextIcon } from '../../../ui/Icons';

export interface AnalyticsPeriodToolbarProps {
  preset: AnalyticsPeriodPreset;
  onSelectPreset: (preset: AnalyticsPeriodPreset) => void;
  customStartDate: string;
  customEndDate: string;
  onChangeCustomStartDate: (value: string) => void;
  onChangeCustomEndDate: (value: string) => void;
  windowLabel: string;
  periodTripsCount: number;
  totalAllTimeTripsCount: number;
  onExportCsv: (reportType: AnalyticsCsvReportType) => void;
}

const PERIOD_OPTIONS: ReadonlyArray<{ key: AnalyticsPeriodPreset; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: 'mtd', label: 'MTD' },
  { key: 'all', label: 'All-Time' },
  { key: 'custom', label: 'Custom' },
];

const CSV_EXPORT_ITEMS: ReadonlyArray<{
  type: AnalyticsCsvReportType;
  title: string;
  subtitle: string;
}> = [
  {
    type: 'executive_summary',
    title: 'Executive Summary CSV',
    subtitle: 'KPI totals, prior-period deltas, SLA & Auto-Dispatch overview',
  },
  {
    type: 'trips_sla_dispatch',
    title: 'Trip SLA & Auto-Dispatch CSV',
    subtitle: 'Per-trip pickup variance, dispatch channel, cascade & fees',
  },
  {
    type: 'surcharge_tariff_attribution',
    title: 'Surcharge & Tariff Attribution CSV',
    subtitle: 'Revenue waterfall, itemized surcharges/rules & audit state',
  },
  {
    type: 'driver_corporate_leaderboard',
    title: 'Driver & Corporate Leaderboard CSV',
    subtitle: 'Driver fares/tips/SLA, B2B spend, zones & peak windows',
  },
];

export function AnalyticsPeriodToolbar({
  preset,
  onSelectPreset,
  customStartDate,
  customEndDate,
  onChangeCustomStartDate,
  onChangeCustomEndDate,
  windowLabel,
  periodTripsCount,
  totalAllTimeTripsCount,
  onExportCsv,
}: AnalyticsPeriodToolbarProps) {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isExportOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExportOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportOpen]);

  return (
    <div className="bg-surface-card border border-border-subtle/90 rounded-2xl p-3 sm:p-3.5 shadow-xs space-y-2.5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        {/* Left: Segmented Period Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0">
          <div className="inline-flex items-center bg-surface-muted p-1 rounded-xl border border-border-subtle/70 shrink-0">
            {PERIOD_OPTIONS.map((opt) => {
              const active = preset === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => onSelectPreset(opt.key)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-surface-card text-blue-600 shadow-xs border border-border-subtle/80'
                      : 'text-fg-secondary hover:text-fg-primary'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Active Window Summary Badge + Export CSV Dropdown */}
        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface-subtle border border-border-subtle/80 text-[11px] font-semibold text-fg-secondary">
            <CalendarIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="font-bold text-fg-strong">{windowLabel}</span>
            <span className="text-slate-300">·</span>
            <span className="tabular-nums">
              <strong className="text-fg-primary">{periodTripsCount}</strong>
              {preset !== 'all' ? ` / ${totalAllTimeTripsCount}` : ''} rides
            </span>
          </div>

          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setIsExportOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-header hover:bg-surface-header-elevated text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              aria-expanded={isExportOpen}
              aria-haspopup="menu"
            >
              <DownloadIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Export CSV</span>
              <ChevronDownIcon
                className={`w-3.5 h-3.5 transition-transform ${isExportOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isExportOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-76 sm:w-84 bg-surface-card rounded-2xl border border-border-subtle shadow-xl p-1.5 z-50 animate-in fade-in"
              >
                <div className="px-2.5 py-1.5 border-b border-border-faint flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-fg-subtle">
                    RFC-4180 Formula-Safe Reports
                  </span>
                  <span className="text-[10px] font-semibold text-blue-600">{windowLabel}</span>
                </div>
                <div className="py-1 space-y-0.5">
                  {CSV_EXPORT_ITEMS.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onExportCsv(item.type);
                        setIsExportOpen(false);
                      }}
                      className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl hover:bg-surface-subtle active:bg-surface-muted text-left transition-colors cursor-pointer"
                    >
                      <span className="p-1.5 rounded-lg bg-status-info-bg text-blue-600 shrink-0 mt-0.5">
                        <FileTextIcon className="w-3.5 h-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-fg-primary">{item.title}</span>
                        <span className="block text-[11px] text-fg-muted leading-snug">
                          {item.subtitle}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Date Range Picker Row */}
      {preset === 'custom' && (
        <div className="pt-2 border-t border-border-faint flex flex-wrap items-center gap-2.5 text-xs">
          <label className="inline-flex items-center gap-1.5 font-semibold text-fg-secondary">
            <span>Start Date:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => onChangeCustomStartDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-border-subtle bg-surface-subtle text-fg-primary font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="inline-flex items-center gap-1.5 font-semibold text-fg-secondary">
            <span>End Date:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => onChangeCustomEndDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-border-subtle bg-surface-subtle text-fg-primary font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <span className="text-[11px] text-fg-subtle">
            Evaluated against canonical scheduled / actual pickup timestamps
          </span>
        </div>
      )}
    </div>
  );
}
