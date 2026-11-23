import React, { useState, useEffect, useMemo } from 'react';
import type { SurchargesConfig } from '~/core/types/config';
import type {
  PricingAuditAction,
  PricingAuditEvent,
  PricingAuditFilterMode,
  PricingFieldDiff,
} from '~/core/types/pricing-audit';
import { getSurchargeCatalogItems } from '~/core/services/pricing/surcharges.service';
import {
  exportPricingAuditCsv,
  formatActiveDuration,
} from '~/core/services/pricing/pricing-audit.service';
import { AdminSlideOverDrawer } from '../../AdminSlideOverDrawer';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Badge } from '~/components/ui/Badge';
import {
  ClockIcon,
  DownloadIcon,
  HistoryIcon,
  SearchIcon,
  UserIcon,
  XIcon,
} from '~/components/ui/Icons';

export interface PricingAuditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  events: PricingAuditEvent[];
  surcharges: SurchargesConfig;
  initialFilterMode?: PricingAuditFilterMode;
  initialSurchargeId?: string;
  onUpdateNote: (eventId: string, note: string) => Promise<void>;
}

const FILTER_PILLS: Array<{ id: PricingAuditFilterMode; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'surcharges_on_off', label: 'Surcharges On/Off' },
  { id: 'surcharges', label: 'Surcharges (All)' },
  { id: 'rates', label: 'Rates' },
  { id: 'rules', label: 'Rules' },
  { id: 'extras', label: 'Extras' },
];

const PILLAR_LABELS: Record<PricingAuditEvent['pillar'], string> = {
  surcharges: 'Surcharges',
  rates: 'Rates',
  rules: 'Rules',
  extras: 'Extras',
};

function getActionBadgeMeta(action: PricingAuditAction): {
  label: string;
  className: string;
} {
  if (action === 'surcharge_enabled' || action === 'rule_enabled') {
    return {
      label: 'ENABLED',
      className: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    };
  }
  if (action === 'surcharge_disabled' || action === 'rule_disabled') {
    return {
      label: 'DISABLED',
      className: 'bg-slate-200 text-slate-800 border-slate-300',
    };
  }
  if (
    action === 'surcharge_created' ||
    action === 'tariff_created' ||
    action === 'rule_created'
  ) {
    return {
      label: 'CREATED',
      className: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    };
  }
  if (
    action === 'surcharge_deleted' ||
    action === 'tariff_deleted' ||
    action === 'rule_deleted'
  ) {
    return {
      label: 'DELETED',
      className: 'bg-rose-100 text-rose-900 border-rose-300',
    };
  }
  if (action === 'surcharge_legacy_migrated') {
    return {
      label: 'MIGRATED',
      className: 'bg-blue-100 text-blue-900 border-blue-300',
    };
  }
  return {
    label: 'UPDATED',
    className: 'bg-blue-100 text-blue-900 border-blue-300',
  };
}

function formatDiffValue(val: PricingFieldDiff['before']): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'On' : 'Off';
  return String(val);
}

function formatTimestampFull(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export function PricingAuditDrawer({
  isOpen,
  onClose,
  events,
  surcharges,
  initialFilterMode = 'all',
  initialSurchargeId = '',
  onUpdateNote,
}: PricingAuditDrawerProps) {
  const [filterMode, setFilterMode] = useState<PricingAuditFilterMode>(initialFilterMode);
  const [selectedSurchargeId, setSelectedSurchargeId] = useState<string>(initialSurchargeId);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Inline note editor state
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<string>('');
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);

  // Sync deep-linked filter state whenever the drawer opens
  useEffect(() => {
    if (!isOpen) return;
    setFilterMode(initialFilterMode);
    setSelectedSurchargeId(initialSurchargeId || '');
    setEditingEventId(null);
  }, [isOpen, initialFilterMode, initialSurchargeId]);

  // Build unified surcharge dropdown options (current catalog + historical surcharge audit entries)
  const surchargeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of getSurchargeCatalogItems(surcharges)) {
      map.set(item.id, item.name);
    }
    for (const ev of events) {
      if (ev.pillar === 'surcharges' && ev.targetId && !map.has(ev.targetId)) {
        map.set(ev.targetId, ev.targetName || ev.targetId);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [surcharges, events]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return events.filter((ev) => {
      // 1. Pillar / Focus filter
      if (filterMode === 'surcharges_on_off') {
        if (ev.action !== 'surcharge_enabled' && ev.action !== 'surcharge_disabled') {
          return false;
        }
      } else if (filterMode === 'surcharges') {
        if (ev.pillar !== 'surcharges') return false;
      } else if (filterMode === 'rates') {
        if (ev.pillar !== 'rates') return false;
      } else if (filterMode === 'rules') {
        if (ev.pillar !== 'rules') return false;
      } else if (filterMode === 'extras') {
        if (ev.pillar !== 'extras') return false;
      }

      // 2. Specific Surcharge selector
      if (selectedSurchargeId) {
        if (ev.pillar !== 'surcharges' || ev.targetId !== selectedSurchargeId) {
          return false;
        }
      }

      // 3. Instant text search
      if (q) {
        const haystacks = [
          ev.targetName,
          ev.targetId,
          ev.summary,
          ev.operatorName,
          ev.operatorEmail,
          ev.note || '',
          ev.action,
          ...(ev.diffs || []).map(
            (d) => `${d.label} ${d.field} ${d.before ?? ''} ${d.after ?? ''}`
          ),
        ];
        const matched = haystacks.some((h) => h.toLowerCase().includes(q));
        if (!matched) return false;
      }

      return true;
    });
  }, [events, filterMode, selectedSurchargeId, searchQuery]);

  const handleSelectPillarPill = (nextMode: PricingAuditFilterMode) => {
    setFilterMode(nextMode);
    if (nextMode === 'rates' || nextMode === 'rules' || nextMode === 'extras') {
      setSelectedSurchargeId('');
    }
  };

  const handleSelectSurchargeDropdown = (surchargeId: string) => {
    setSelectedSurchargeId(surchargeId);
    if (
      surchargeId &&
      (filterMode === 'rates' || filterMode === 'rules' || filterMode === 'extras')
    ) {
      setFilterMode('surcharges');
    }
  };

  const handleExportCsv = () => {
    if (typeof window === 'undefined') return;
    const csv = exportPricingAuditCsv(filteredEvents);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chesterfield-pricing-audit-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const startEditNote = (ev: PricingAuditEvent) => {
    setEditingEventId(ev.id);
    setNoteInput(ev.note || '');
  };

  const submitEditNote = async (eventId: string) => {
    setIsSavingNote(true);
    try {
      await onUpdateNote(eventId, noteInput);
      setEditingEventId(null);
    } finally {
      setIsSavingNote(false);
    }
  };

  return (
    <AdminSlideOverDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Pricing & Surcharge Audit Trail"
      subtitle="Staff-only history of surcharge On/Off toggles, active durations, rate updates & firewall rules"
      size="xl"
      headerBadge={
        <Badge
          variant="outline"
          className="text-[10px] font-mono bg-slate-100 text-slate-700 border-slate-200"
        >
          {filteredEvents.length} / {events.length} events
        </Badge>
      }
      footer={
        <div className="w-full flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 truncate">
            Stored securely in staff-only <code>/config/pricingAuditLog</code>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={filteredEvents.length === 0}
              onClick={handleExportCsv}
              className="h-8 text-xs bg-white border-slate-300 text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <DownloadIcon className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
              Export CSV
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
            >
              Done
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Filter Toolbar */}
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
          {/* Pillar / Focus Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_PILLS.map((pill) => {
              const active = filterMode === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => handleSelectPillarPill(pill.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                    active
                      ? pill.id === 'surcharges_on_off'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Surcharge Selector + Search + Quick CSV */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
            <div className="sm:col-span-5">
              <select
                value={selectedSurchargeId}
                onChange={(e) => handleSelectSurchargeDropdown(e.target.value)}
                aria-label="Filter by specific surcharge"
                className="w-full h-8.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-800 px-2.5 font-semibold focus:bg-white focus:border-blue-400 focus:outline-none"
              >
                <option value="">All Surcharges</option>
                {surchargeOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-7 relative">
              <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search item, operator, note, or field..."
                className="h-8.5 text-xs pl-8 pr-7 bg-slate-50 focus:bg-white border-slate-200 text-slate-900 w-full"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Timeline Feed */}
        {filteredEvents.length === 0 ? (
          <div className="p-10 rounded-xl bg-white border border-dashed border-slate-200 text-center space-y-2">
            <HistoryIcon className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No matching audit events</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Toggle any surcharge On/Off or save changes in Rates, Rules, or Extras to record detailed before/after provenance here.
            </p>
            {(filterMode !== 'all' || selectedSurchargeId || searchQuery) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilterMode('all');
                  setSelectedSurchargeId('');
                  setSearchQuery('');
                }}
                className="h-7.5 text-xs bg-white mt-2 cursor-pointer"
              >
                Reset Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map((ev) => {
              const badge = getActionBadgeMeta(ev.action);
              const isEditing = editingEventId === ev.id;
              const durationStr =
                ev.activeDurationMinutes !== undefined
                  ? formatActiveDuration(ev.activeDurationMinutes)
                  : '';

              return (
                <div
                  key={ev.id}
                  className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2.5"
                >
                  {/* Row 1: Action Badge, Pillar Tag, Active Duration Badge & Timestamp */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide border ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                        {PILLAR_LABELS[ev.pillar] || ev.pillar}
                      </span>
                      {durationStr && (
                        <span
                          title={
                            ev.enabledSince
                              ? `Enabled since ${formatTimestampFull(ev.enabledSince)}`
                              : undefined
                          }
                          className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300 inline-flex items-center gap-1"
                        >
                          <ClockIcon className="w-3 h-3 text-amber-700" />
                          Active {durationStr}
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] font-mono text-slate-500">
                      {formatTimestampFull(ev.timestamp)}
                    </span>
                  </div>

                  {/* Row 2: Target Title & Summary */}
                  <div>
                    <div className="text-sm font-bold text-slate-900">{ev.targetName}</div>
                    <p className="text-xs text-slate-600 mt-0.5">{ev.summary}</p>
                  </div>

                  {/* Row 3: Structured { before -> after } Field Diff Chips */}
                  {ev.diffs && ev.diffs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {ev.diffs.map((diff, idx) => (
                        <span
                          key={`${ev.id}-${diff.field}-${idx}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-800"
                        >
                          <span className="font-sans font-semibold text-slate-500">
                            {diff.label}:
                          </span>
                          <span className="text-slate-500">{formatDiffValue(diff.before)}</span>
                          <span className="text-slate-400">→</span>
                          <span className="font-bold text-slate-900">
                            {formatDiffValue(diff.after)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Row 4: Operator Identity + Optional Note / Inline Editor */}
                  <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-500 min-w-0 flex-wrap">
                      <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-700">{ev.operatorName}</span>
                      <span className="text-slate-400">({ev.operatorEmail})</span>
                    </div>

                    {!isEditing ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {ev.note && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50/90 text-amber-950 border border-amber-200 font-medium italic">
                            &ldquo;{ev.note}&rdquo;
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => startEditNote(ev)}
                          className="text-blue-600 hover:text-blue-800 font-semibold hover:underline cursor-pointer"
                        >
                          {ev.note ? 'Edit note' : '+ Add note'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
                        <input
                          type="text"
                          value={noteInput}
                          onChange={(e) => setNoteInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              submitEditNote(ev.id);
                            } else if (e.key === 'Escape') {
                              setEditingEventId(null);
                            }
                          }}
                          placeholder="Add operational reason / note..."
                          autoFocus
                          className="h-7 flex-1 sm:w-56 rounded-md border border-blue-300 bg-white px-2 text-xs text-slate-900 focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={isSavingNote}
                          onClick={() => submitEditNote(ev.id)}
                          className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                        >
                          {isSavingNote ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingEventId(null)}
                          className="px-2 py-1 rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminSlideOverDrawer>
  );
}
