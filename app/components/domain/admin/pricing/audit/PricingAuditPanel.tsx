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
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { Badge } from '~/components/ui/Badge';
import {
  ClockIcon,
  DownloadIcon,
  HistoryIcon,
  SearchIcon,
  UserIcon,
  XIcon,
} from '~/components/ui/Icons';

export interface PricingAuditPanelProps {
  events: PricingAuditEvent[];
  surcharges: SurchargesConfig;
  initialFilterMode?: PricingAuditFilterMode;
  initialSurchargeId?: string;
  onUpdateNote: (eventId: string, note: string) => Promise<void>;
  showHeader?: boolean;
  syncTrigger?: boolean;
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

function getActionBadgeMeta(action: PricingAuditAction): { label: string; className: string } {
  if (action === 'surcharge_enabled' || action === 'rule_enabled') {
    return { label: 'ENABLED', className: 'bg-status-success-bg-strong text-status-success-fg border-status-success-border' };
  }
  if (action === 'surcharge_disabled' || action === 'rule_disabled') {
    return { label: 'DISABLED', className: 'bg-surface-emphasis text-fg-strong border-border-strong' };
  }
  if (action === 'surcharge_created' || action === 'tariff_created' || action === 'rule_created') {
    return { label: 'CREATED', className: 'bg-status-staged-bg-strong text-status-staged-fg border-status-staged-border' };
  }
  if (action === 'surcharge_deleted' || action === 'tariff_deleted' || action === 'rule_deleted') {
    return { label: 'DELETED', className: 'bg-status-danger-bg-strong text-status-danger-fg border-status-danger-border' };
  }
  if (action === 'surcharge_legacy_migrated') {
    return { label: 'MIGRATED', className: 'bg-status-info-bg-strong text-status-info-fg border-status-info-border' };
  }
  return { label: 'UPDATED', className: 'bg-status-info-bg-strong text-status-info-fg border-status-info-border' };
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

export function PricingAuditPanel({
  events,
  surcharges,
  initialFilterMode = 'all',
  initialSurchargeId = '',
  onUpdateNote,
  showHeader = false,
  syncTrigger = true,
}: PricingAuditPanelProps) {
  const [filterMode, setFilterMode] = useState<PricingAuditFilterMode>(initialFilterMode);
  const [selectedSurchargeId, setSelectedSurchargeId] = useState<string>(initialSurchargeId);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<string>('');
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);

  useEffect(() => {
    if (!syncTrigger) return;
    setFilterMode(initialFilterMode);
    setSelectedSurchargeId(initialSurchargeId || '');
    setEditingEventId(null);
  }, [syncTrigger, initialFilterMode, initialSurchargeId]);

  const surchargeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of getSurchargeCatalogItems(surcharges)) map.set(item.id, item.name);
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
      if (filterMode === 'surcharges_on_off') {
        if (ev.action !== 'surcharge_enabled' && ev.action !== 'surcharge_disabled') return false;
      } else if (filterMode !== 'all' && ev.pillar !== filterMode) {
        return false;
      }
      if (selectedSurchargeId && (ev.pillar !== 'surcharges' || ev.targetId !== selectedSurchargeId)) {
        return false;
      }
      if (q) {
        const haystacks = [
          ev.targetName,
          ev.targetId,
          ev.summary,
          ev.operatorName,
          ev.operatorEmail,
          ev.note || '',
          ev.action,
          ...(ev.diffs || []).map((d) => `${d.label} ${d.field} ${d.before ?? ''} ${d.after ?? ''}`),
        ];
        if (!haystacks.some((h) => h.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [events, filterMode, selectedSurchargeId, searchQuery]);

  const handleExportCsv = () => {
    if (typeof window === 'undefined') return;
    const csv = exportPricingAuditCsv(filteredEvents);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chesterfield-pricing-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
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
    <div className="space-y-4">
      {showHeader && (
        <div className="p-4 bg-surface-card rounded-2xl border border-border-subtle shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-fg-primary">Pricing &amp; Surcharge Audit Log</h3>
              <Badge variant="outline" className="text-[10px] font-mono bg-surface-muted text-fg-secondary border-border-subtle">
                {filteredEvents.length} / {events.length} events
              </Badge>
            </div>
            <p className="text-xs text-fg-muted mt-0.5">
              Immutable before/after history of surcharge On/Off toggles, active durations, tariffs, extras &amp; firewall rules.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filteredEvents.length === 0}
            onClick={handleExportCsv}
            className="h-8 text-xs bg-surface-card border-border-strong text-fg-strong hover:bg-surface-subtle shrink-0"
          >
            <DownloadIcon className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
            Export Audit CSV
          </Button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="p-3.5 rounded-xl bg-surface-card border border-border-subtle shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_PILLS.map((pill) => {
              const active = filterMode === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => {
                    setFilterMode(pill.id);
                    if (pill.id === 'rates' || pill.id === 'rules' || pill.id === 'extras') {
                      setSelectedSurchargeId('');
                    }
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                    active
                      ? pill.id === 'surcharges_on_off'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-surface-header text-white border-slate-900 shadow-2xs'
                      : 'bg-surface-subtle text-fg-secondary border-border-subtle hover:bg-surface-muted hover:text-fg-primary'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
          {!showHeader && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={filteredEvents.length === 0}
              onClick={handleExportCsv}
              className="h-7.5 text-xs bg-surface-card border-border-strong text-fg-strong"
            >
              <DownloadIcon className="w-3 h-3 mr-1 text-blue-600" />
              CSV
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
          <div className="sm:col-span-5">
            <Select
              size="sm"
              value={selectedSurchargeId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedSurchargeId(v);
                if (v && (filterMode === 'rates' || filterMode === 'rules' || filterMode === 'extras')) {
                  setFilterMode('surcharges');
                }
              }}
              aria-label="Filter by specific surcharge"
            >
              <option value="">All Surcharges</option>
              {surchargeOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-7 relative">
            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-fg-subtle" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search item, operator, note, or field..."
              className="h-8.5 text-xs pl-8 pr-7 bg-surface-subtle focus:bg-surface-card border-border-subtle text-fg-primary w-full"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-2 text-fg-subtle hover:text-fg-secondary cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Timeline Feed */}
      {filteredEvents.length === 0 ? (
        <div className="p-10 rounded-xl bg-surface-card border border-dashed border-border-subtle text-center space-y-2">
          <HistoryIcon className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-fg-secondary">No matching audit events</p>
          <p className="text-xs text-fg-muted max-w-sm mx-auto">
            Toggle any surcharge On/Off or save changes in Tariffs, Rules, or Extras to record before/after provenance here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((ev) => {
            const badge = getActionBadgeMeta(ev.action);
            const isEditing = editingEventId === ev.id;
            const durationStr =
              ev.activeDurationMinutes !== undefined ? formatActiveDuration(ev.activeDurationMinutes) : '';
            return (
              <div key={ev.id} className="p-4 rounded-xl bg-surface-card border border-border-subtle shadow-2xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide border ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-surface-muted text-fg-secondary border border-border-subtle">
                      {PILLAR_LABELS[ev.pillar] || ev.pillar}
                    </span>
                    {durationStr && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-status-warning-bg text-status-warning-fg border border-status-warning-border inline-flex items-center gap-1">
                        <ClockIcon className="w-3 h-3 text-status-warning-fg" />
                        Active {durationStr}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-fg-muted">{formatTimestampFull(ev.timestamp)}</span>
                </div>
                <div>
                  <div className="text-sm font-bold text-fg-primary">{ev.targetName}</div>
                  <p className="text-xs text-fg-secondary mt-0.5">{ev.summary}</p>
                </div>
                {ev.diffs && ev.diffs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {ev.diffs.map((diff, idx) => (
                      <span
                        key={`${ev.id}-${diff.field}-${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-subtle border border-border-subtle text-[11px] font-mono text-fg-strong"
                      >
                        <span className="font-sans font-semibold text-fg-muted">{diff.label}:</span>
                        <span className="text-fg-muted">{formatDiffValue(diff.before)}</span>
                        <span className="text-fg-subtle">→</span>
                        <span className="font-bold text-fg-primary">{formatDiffValue(diff.after)}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="pt-2 border-t border-border-faint flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 text-fg-muted min-w-0 flex-wrap">
                    <UserIcon className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
                    <span className="font-semibold text-fg-secondary">{ev.operatorName}</span>
                    <span className="text-fg-subtle">({ev.operatorEmail})</span>
                  </div>
                  {!isEditing ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {ev.note && (
                        <span className="px-2 py-0.5 rounded-full bg-status-warning-bg/90 text-status-warning-fg border border-status-warning-border font-medium italic">
                          &ldquo;{ev.note}&rdquo;
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEventId(ev.id);
                          setNoteInput(ev.note || '');
                        }}
                        className="text-blue-600 hover:text-status-info-fg font-semibold hover:underline cursor-pointer"
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
                        placeholder="Add operational reason / note..."
                        autoFocus
                        className="h-7 flex-1 sm:w-56 rounded-md border border-status-info-border bg-surface-card px-2 text-xs text-fg-primary"
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
                        className="px-2 py-1 rounded-md bg-surface-card border border-border-strong text-fg-secondary cursor-pointer"
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
  );
}
