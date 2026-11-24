import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useBottomSheetDragToClose } from '~/core/hooks/useBottomSheetDragToClose';
import type {
  SurchargesConfig,
  SurchargeCatalogItem,
  SurchargeCalcMode,
  SurchargeDefaultPolicy,
  NamedPricingRule,
} from '~/core/types/config';
import type { PricingAuditEvent } from '~/core/types/pricing-audit';
import { getSurchargeCatalogItems } from '~/core/services/pricing/surcharges.service';
import {
  formatActiveDuration,
  getLatestSurchargeStatusMap,
} from '~/core/services/pricing/pricing-audit.service';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { Badge } from '~/components/ui/Badge';
import {
  ZapIcon,
  ShieldCheckIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  AlertTriangleIcon,
  SlidersIcon,
  SpinnerIcon,
  HistoryIcon,
  XIcon,
} from '~/components/ui/Icons';

export interface SurchargesPanelProps {
  surcharges: SurchargesConfig;
  rules?: NamedPricingRule[];
  onSave: (
    updated: SurchargesConfig,
    notesBySurchargeId?: Record<string, string>
  ) => Promise<void>;
  onToggleSurcharge?: (
    surchargeId: string,
    nextEnabled: boolean,
    note?: string
  ) => Promise<void>;
  auditEvents?: PricingAuditEvent[];
  onUpdateAuditNote?: (eventId: string, note: string) => Promise<void>;
  onOpenAuditHistory?: (surchargeId?: string) => void;
  onDraftChange?: (draft: SurchargesConfig | null) => void;
  onNavigateToRule?: (ruleId?: string) => void;
  onMigrateLegacyToFirewall?: () => Promise<void>;
  isSaving?: boolean;
}

function formatAmountBadge(item: SurchargeCatalogItem): string {
  if (item.mode === 'multiplier') return `${item.amount.toFixed(2)}×`;
  if (item.mode === 'percent') return `+${item.amount}%`;
  if (item.mode === 'per_mile') return `+$${item.amount.toFixed(2)}/mi`;
  return `+$${item.amount.toFixed(2)}`;
}

function formatAuditTimestampShort(iso?: string): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function stripEnabledField(item: SurchargeCatalogItem): Omit<SurchargeCatalogItem, 'enabled'> {
  const { enabled: _enabled, ...rest } = item;
  return rest;
}

export function SurchargesPanel({
  surcharges,
  rules = [],
  onSave,
  onToggleSurcharge,
  auditEvents = [],
  onUpdateAuditNote,
  onOpenAuditHistory,
  onDraftChange,
  onNavigateToRule,
  onMigrateLegacyToFirewall,
  isSaving = false,
}: SurchargesPanelProps) {
  const initialItems = useMemo(() => getSurchargeCatalogItems(surcharges), [surcharges]);
  const [items, setItems] = useState<SurchargeCatalogItem[]>(() =>
    JSON.parse(JSON.stringify(initialItems))
  );
  const baselineByIdRef = useRef<Map<string, SurchargeCatalogItem>>(
    new Map(
      initialItems.map((it) => [it.id, JSON.parse(JSON.stringify(it)) as SurchargeCatalogItem])
    )
  );

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Instant 1-click toggle per-card state & optional inline note state
  const [togglingById, setTogglingById] = useState<Record<string, boolean>>({});
  const [justToggledById, setJustToggledById] = useState<Record<string, boolean>>({});
  const [noteDraftById, setNoteDraftById] = useState<Record<string, string>>({});

  // Post-toggle inline note editor state for existing provenance events
  const [editingNoteEventId, setEditingNoteEventId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState<string>('');
  const [isSavingEventNote, setIsSavingEventNote] = useState<boolean>(false);

  // Add / Edit Surcharge Modal State (pure catalog definition — zero triggers/tariffs!)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const dismissSurchargeModal = useCallback(() => setIsModalOpen(false), []);
  const surchargeSheetDrag = useBottomSheetDragToClose({ onClose: dismissSurchargeModal });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMode, setFormMode] = useState<SurchargeCalcMode>('flat');
  const [formAmount, setFormAmount] = useState<number>(10);
  const [formPolicy, setFormPolicy] = useState<SurchargeDefaultPolicy>('rule_only');
  const [formEnabled, setFormEnabled] = useState<boolean>(true);

  // Sync persisted updates without discarding unsaved rate/mode/policy edits on other cards
  useEffect(() => {
    setItems((prevLocal) => {
      const prevBaseline = baselineByIdRef.current;
      const nextBaseline = new Map(
        initialItems.map((it) => [it.id, JSON.parse(JSON.stringify(it)) as SurchargeCatalogItem])
      );
      const localById = new Map(prevLocal.map((it) => [it.id, it]));

      const merged: SurchargeCatalogItem[] = initialItems.map((incoming) => {
        const localItem = localById.get(incoming.id);
        const oldBase = prevBaseline.get(incoming.id);
        if (!localItem || !oldBase) {
          return JSON.parse(JSON.stringify(incoming));
        }
        const hasLocalConfigEdits =
          JSON.stringify(stripEnabledField(localItem)) !==
          JSON.stringify(stripEnabledField(oldBase));
        if (hasLocalConfigEdits) {
          return {
            ...localItem,
            enabled: incoming.enabled,
          };
        }
        return JSON.parse(JSON.stringify(incoming));
      });

      // Keep any newly added unsaved catalog items
      for (const localItem of prevLocal) {
        if (!nextBaseline.has(localItem.id) && !prevBaseline.has(localItem.id)) {
          merged.push(localItem);
        }
      }

      baselineByIdRef.current = nextBaseline;
      return merged;
    });
  }, [initialItems]);

  const isDirty = useMemo(
    () => JSON.stringify(items) !== JSON.stringify(initialItems),
    [items, initialItems]
  );

  // Push live unsaved draft to workspace simulator
  useEffect(() => {
    if (!isDirty) {
      onDraftChange?.(null);
      return;
    }
    onDraftChange?.({
      ...surcharges,
      catalogVersion: 2,
      items,
    });
  }, [items, isDirty, surcharges, onDraftChange]);

  // Fast provenance map per surchargeId
  const provenanceBySurcharge = useMemo(
    () => getLatestSurchargeStatusMap(auditEvents),
    [auditEvents]
  );

  // Index rule directives per surchargeId for live firewall visibility
  const ruleRefsBySurcharge = useMemo(() => {
    const map: Record<
      string,
      Array<{
        ruleId: string;
        ruleName: string;
        priority: number;
        isActive: boolean;
        action: string;
        detail?: string;
      }>
    > = {};

    for (const rule of rules) {
      for (const act of rule.modifier?.surchargeActions || []) {
        if (!map[act.surchargeId]) map[act.surchargeId] = [];
        let detail: string | undefined;
        if (act.action === 'override' && typeof act.overrideAmount === 'number') {
          detail =
            act.overrideMode === 'multiplier'
              ? `${act.overrideAmount.toFixed(2)}×`
              : act.overrideMode === 'percent'
              ? `${act.overrideAmount}%`
              : act.overrideMode === 'per_mile'
              ? `$${act.overrideAmount.toFixed(2)}/mi`
              : `$${act.overrideAmount.toFixed(2)}`;
        }
        map[act.surchargeId].push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority,
          isActive: rule.isActive,
          action: act.action,
          detail,
        });
      }
    }
    return map;
  }, [rules]);

  const updateItem = (id: string, patch: Partial<SurchargeCatalogItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  // Instant 1-click Enable/Disable persistence + audit trail recording
  const handleInstantToggle = async (item: SurchargeCatalogItem) => {
    if (togglingById[item.id]) return;

    const prevEnabled = item.enabled;
    const nextEnabled = !prevEnabled;
    const trimmedNote = (noteDraftById[item.id] || '').trim() || undefined;
    const isPersistedItem = initialItems.some((init) => init.id === item.id);

    // If this is a brand-new unsaved item not yet in persisted catalog, toggle locally until saved
    if (!isPersistedItem) {
      updateItem(item.id, { enabled: nextEnabled });
      return;
    }

    setTogglingById((prev) => ({ ...prev, [item.id]: true }));
    updateItem(item.id, { enabled: nextEnabled });
    const existingBase = baselineByIdRef.current.get(item.id);
    if (existingBase) {
      baselineByIdRef.current.set(item.id, { ...existingBase, enabled: nextEnabled });
    }

    try {
      if (onToggleSurcharge) {
        await onToggleSurcharge(item.id, nextEnabled, trimmedNote);
      } else {
        const patchedPersistedItems = initialItems.map((init) =>
          init.id === item.id ? { ...init, enabled: nextEnabled } : init
        );
        await onSave(
          {
            ...surcharges,
            catalogVersion: 2,
            items: patchedPersistedItems,
          },
          trimmedNote ? { [item.id]: trimmedNote } : undefined
        );
      }

      if (trimmedNote) {
        setNoteDraftById((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }

      setJustToggledById((prev) => ({ ...prev, [item.id]: true }));
      setTimeout(() => {
        setJustToggledById((prev) => ({ ...prev, [item.id]: false }));
      }, 2400);
    } catch (err) {
      console.error('[SurchargesPanel] Failed to toggle surcharge:', err);
      updateItem(item.id, { enabled: prevEnabled });
      if (existingBase) {
        baselineByIdRef.current.set(item.id, { ...existingBase, enabled: prevEnabled });
      }
    } finally {
      setTogglingById((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleSaveAll = async () => {
    const cleanNotes: Record<string, string> = {};
    for (const [k, val] of Object.entries(noteDraftById)) {
      if (typeof val === 'string' && val.trim()) {
        cleanNotes[k] = val.trim();
      }
    }

    await onSave(
      {
        ...surcharges,
        catalogVersion: 2,
        items,
      },
      Object.keys(cleanNotes).length > 0 ? cleanNotes : undefined
    );
    setNoteDraftById({});
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleDiscardAll = () => {
    baselineByIdRef.current = new Map(
      initialItems.map((it) => [it.id, JSON.parse(JSON.stringify(it)) as SurchargeCatalogItem])
    );
    setItems(JSON.parse(JSON.stringify(initialItems)));
    setNoteDraftById({});
  };

  const startEditingEventNote = (ev: PricingAuditEvent) => {
    setEditingNoteEventId(ev.id);
    setEditingNoteValue(ev.note || '');
  };

  const handleSaveEventNote = async (eventId: string) => {
    if (!onUpdateAuditNote) {
      setEditingNoteEventId(null);
      return;
    }
    setIsSavingEventNote(true);
    try {
      await onUpdateAuditNote(eventId, editingNoteValue);
      setEditingNoteEventId(null);
    } finally {
      setIsSavingEventNote(false);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormName('');
    setFormDescription('');
    setFormMode('flat');
    setFormAmount(10);
    setFormPolicy('rule_only');
    setFormEnabled(true);
    setIsModalOpen(true);
  };

  const openEditModal = (item: SurchargeCatalogItem) => {
    setEditingId(item.id);
    setFormName(item.name);
    setFormDescription(item.description || '');
    setFormMode(item.mode);
    setFormAmount(item.amount);
    setFormPolicy(item.defaultPolicy);
    setFormEnabled(item.enabled);
    setIsModalOpen(true);
  };

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (editingId) {
      updateItem(editingId, {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        mode: formMode,
        amount: Number(formAmount) || 0,
        defaultPolicy: formPolicy,
        enabled: formEnabled,
      });
    } else {
      const slug = formName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const newItem: SurchargeCatalogItem = {
        id: `surcharge-${slug || Date.now().toString(36)}`,
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        enabled: formEnabled,
        defaultPolicy: formPolicy,
        mode: formMode,
        amount: Number(formAmount) || 0,
        isBuiltIn: false,
      };
      setItems((prev) => [...prev, newItem]);
    }
    setIsModalOpen(false);
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setConfirmDeleteId(null);
  };

  const needsLegacyUpgrade = surcharges.catalogVersion !== 2;

  return (
    <div className="space-y-5">
      {/* Header Save Bar */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-slate-900">Surcharges</h2>
            {isDirty && (
              <Badge
                variant="warning"
                size="sm"
                className="text-[10px] bg-amber-100 text-amber-800 border-amber-300"
              >
                Unsaved Rate/Policy Edits
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Clicking <strong>Enabled / Disabled</strong> saves &amp; logs instantly in 1 click. Use{' '}
            <strong>Save Surcharges</strong> after editing amounts, modes, or default behavior.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {saveSuccess && (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
              <CheckIcon className="w-3.5 h-3.5" />
              Saved
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openAddModal}
            className="h-8 text-xs border-slate-300 bg-white text-slate-800 hover:bg-slate-50 cursor-pointer"
          >
            <PlusIcon className="w-3.5 h-3.5 mr-1 text-blue-600" />
            Add Surcharge
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isDirty}
            onClick={handleDiscardAll}
            className="h-8 text-xs border-slate-300 bg-white text-slate-700 cursor-pointer"
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSaveAll}
            disabled={isSaving || !isDirty}
            className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-2xs cursor-pointer"
          >
            <CheckIcon className="w-3.5 h-3.5 mr-1" />
            {isSaving ? 'Saving...' : 'Save Surcharges'}
          </Button>
        </div>
      </div>

      {/* Legacy Migration Banner (only if Firestore doc is still pre-v2) */}
      {needsLegacyUpgrade && onMigrateLegacyToFirewall && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-blue-950">
            <ShieldCheckIcon className="w-4.5 h-4.5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Update Legacy Surcharges to Pricing Rules</span>
              <span className="text-blue-800">
                Your live database is using older surcharge conditions. Click update to save your surcharges and create matching Pricing Rules (Airport Transfer, SUV/Minivan Upgrade, Out-of-Area &gt; 15 mi) in one click.
              </span>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={isMigrating}
            onClick={async () => {
              setIsMigrating(true);
              try {
                await onMigrateLegacyToFirewall();
              } finally {
                setIsMigrating(false);
              }
            }}
            className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white shrink-0 cursor-pointer"
          >
            {isMigrating ? 'Upgrading...' : 'Upgrade to v2 Now'}
          </Button>
        </div>
      )}

      {/* Surcharges Grid */}
      <div className="grid grid-cols-1 gap-3.5">
        {items.map((item) => {
          const refs = ruleRefsBySurcharge[item.id] || [];
          const hasActiveApplyRule = refs.some(
            (r) => r.isActive && (r.action === 'apply' || r.action === 'override')
          );
          const showUnreferencedRuleOnlyHint =
            item.enabled &&
            item.defaultPolicy === 'rule_only' &&
            !hasActiveApplyRule &&
            !item.legacyAutoCondition;

          const isCardToggling = Boolean(togglingById[item.id]);
          const wasJustToggled = Boolean(justToggledById[item.id]);
          const cardNoteDraft = noteDraftById[item.id] || '';
          const prov = provenanceBySurcharge[item.id];
          const primaryAuditEv = prov?.latestToggleEvent || prov?.latestEvent;
          const isEditingThisEventNote =
            Boolean(primaryAuditEv) && editingNoteEventId === primaryAuditEv?.id;

          return (
            <div
              key={item.id}
              className={`p-4.5 rounded-xl border transition-all shadow-2xs space-y-3.5 ${
                item.enabled
                  ? 'bg-white border-slate-200'
                  : 'bg-slate-50/70 border-slate-200/80 opacity-90'
              }`}
            >
              {/* Top Row: Identity, Optional Note Input, 1-Click Master Switch, Amount Badge, Edit/Delete */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`p-2 rounded-lg border shrink-0 mt-0.5 ${
                      !item.enabled
                        ? 'bg-slate-100 text-slate-400 border-slate-200'
                        : item.defaultPolicy === 'universal'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    <ZapIcon className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">{item.name}</h3>
                      <span className="text-[10px] font-mono text-slate-400">{item.id}</span>
                      {item.isBuiltIn && (
                        <Badge
                          variant="outline"
                          className="text-[9px] py-0 px-1.5 bg-slate-50 text-slate-500 border-slate-200"
                        >
                          Core
                        </Badge>
                      )}
                      {wasJustToggled && (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <CheckIcon className="w-3 h-3" />
                          Saved &amp; logged
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {/* Optional Zero-Friction Audit Note Input */}
                  <input
                    type="text"
                    value={cardNoteDraft}
                    onChange={(e) =>
                      setNoteDraftById((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                      }
                    }}
                    placeholder="Optional reason / note (e.g. Winter storm I-64)..."
                    aria-label={`Optional audit note for ${item.name}`}
                    className="h-8 w-full sm:w-64 rounded-lg border border-slate-200 bg-slate-50/80 focus:bg-white focus:border-blue-400 focus:outline-none px-2.5 text-xs text-slate-800 placeholder:text-slate-400 transition-colors"
                  />

                  <span
                    className={`text-base font-mono font-extrabold px-2.5 py-0.5 rounded-lg border ${
                      item.enabled
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                    }`}
                  >
                    {formatAmountBadge(item)}
                  </span>

                  {/* 1-Click Persisted Master Kill Switch */}
                  <button
                    type="button"
                    disabled={isCardToggling}
                    onClick={() => handleInstantToggle(item)}
                    title="1-click instant save & audit log"
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors inline-flex items-center gap-1.5 ${
                      isCardToggling
                        ? 'opacity-70 cursor-wait'
                        : 'cursor-pointer'
                    } ${
                      item.enabled
                        ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {isCardToggling && <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />}
                    <span>
                      {isCardToggling
                        ? 'Saving...'
                        : item.enabled
                        ? 'Enabled'
                        : 'Disabled'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-300 cursor-pointer"
                    title="Edit name & description"
                  >
                    <EditIcon className="w-3.5 h-3.5" />
                  </button>

                  {!item.isBuiltIn && confirmDeleteId !== item.id && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.id)}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600 hover:border-rose-300 cursor-pointer"
                      title="Delete surcharge"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {confirmDeleteId === item.id && (
                    <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                      <span className="text-[11px] font-semibold text-rose-800">Delete?</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-700 text-[11px] cursor-pointer"
                      >
                        No
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Middle Row: Firewall Default Policy + Calculation Mode + Amount */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-3 border-t border-slate-100 items-end">
                {/* Default Behavior */}
                <div className="lg:col-span-6">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Default Behavior (when Enabled)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-100 border border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => updateItem(item.id, { defaultPolicy: 'universal' })}
                      className={`py-1.5 px-2.5 rounded-md text-xs font-bold transition-all cursor-pointer text-center ${
                        item.defaultPolicy === 'universal'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All Trips
                    </button>
                    <button
                      type="button"
                      onClick={() => updateItem(item.id, { defaultPolicy: 'rule_only' })}
                      className={`py-1.5 px-2.5 rounded-md text-xs font-bold transition-all cursor-pointer text-center ${
                        item.defaultPolicy === 'rule_only'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Rule-Only (Off by Default)
                    </button>
                  </div>
                </div>

                {/* Calculation Mode */}
                <div className="lg:col-span-3">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Calculation Mode
                  </label>
                  <Select
                    size="sm"
                    value={item.mode}
                    onChange={(e) => {
                      const nextMode = e.target.value as SurchargeCalcMode;
                      const nextAmount =
                        nextMode === 'multiplier' && item.amount < 1
                          ? 1.25
                          : nextMode !== 'multiplier' && item.mode === 'multiplier'
                          ? 5.0
                          : item.amount;
                      updateItem(item.id, { mode: nextMode, amount: nextAmount });
                    }}
                  >
                    <option value="flat">Flat Fee ($)</option>
                    <option value="per_mile">Per Mile ($/mi)</option>
                    <option value="percent">% of Base Fare</option>
                    <option value="multiplier">Multiplier (×)</option>
                  </Select>
                </div>

                {/* Amount */}
                <div className="lg:col-span-3">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    {item.mode === 'multiplier'
                      ? 'Multiplier (e.g. 1.25)'
                      : item.mode === 'percent'
                      ? 'Percentage (%)'
                      : item.mode === 'per_mile'
                      ? 'Rate per Mile ($/mi)'
                      : 'Amount ($)'}
                  </label>
                  <Input
                    type="number"
                    step={item.mode === 'multiplier' || item.mode === 'per_mile' ? '0.05' : '0.50'}
                    min={item.mode === 'multiplier' ? '1.0' : '0'}
                    value={item.amount}
                    onChange={(e) =>
                      updateItem(item.id, { amount: parseFloat(e.target.value) || 0 })
                    }
                    className="h-9 text-xs font-mono font-bold bg-white border-slate-300 text-slate-900"
                  />
                </div>
              </div>

              {/* Bottom Row: Live Rules Exceptions Summary */}
              <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                    <SlidersIcon className="w-3 h-3" />
                    Rule Exceptions:
                  </span>
                  {refs.length > 0 ? (
                    refs.map((ref, idx) => (
                      <button
                        key={`${ref.ruleId}-${idx}`}
                        type="button"
                        onClick={() => onNavigateToRule?.(ref.ruleId)}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                          ref.action === 'waive'
                            ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                            : ref.action === 'override'
                            ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        } ${!ref.isActive ? 'opacity-50 line-through' : ''}`}
                      >
                        {ref.action.toUpperCase()}
                        {ref.detail ? ` ${ref.detail}` : ''} · P{ref.priority} {ref.ruleName}
                      </button>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">
                      {item.defaultPolicy === 'universal'
                        ? 'No waiver exceptions (applies to every ride when enabled)'
                        : item.legacyAutoCondition
                        ? 'Using legacy auto-condition until upgraded'
                        : 'No Rules reference this surcharge yet'}
                    </span>
                  )}
                </div>

                {showUnreferencedRuleOnlyHint && (
                  <button
                    type="button"
                    onClick={() => onNavigateToRule?.()}
                    className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-100 flex items-center gap-1 cursor-pointer"
                  >
                    <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-600" />
                    Add an APPLY Rule in Rules &amp; Routing →
                  </button>
                )}
              </div>

              {/* Live Audit Provenance Footer */}
              {(primaryAuditEv || onOpenAuditHistory) && (
                <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                  {primaryAuditEv ? (
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span
                        className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                          item.enabled && primaryAuditEv.action === 'surcharge_enabled'
                            ? 'bg-emerald-500'
                            : !item.enabled && primaryAuditEv.action === 'surcharge_disabled'
                            ? 'bg-slate-400'
                            : 'bg-blue-500'
                        }`}
                        aria-hidden="true"
                      />

                      <span className="text-slate-600">
                        {item.enabled && primaryAuditEv.action === 'surcharge_enabled' ? (
                          <>
                            <strong className="text-emerald-800">Enabled</strong>{' '}
                            {formatAuditTimestampShort(primaryAuditEv.timestamp)} by{' '}
                            <strong className="text-slate-800">{primaryAuditEv.operatorName}</strong>{' '}
                            <span className="text-slate-400">({primaryAuditEv.operatorEmail})</span>
                          </>
                        ) : !item.enabled && primaryAuditEv.action === 'surcharge_disabled' ? (
                          <>
                            <strong className="text-slate-700">Disabled</strong>{' '}
                            {formatAuditTimestampShort(primaryAuditEv.timestamp)} by{' '}
                            <strong className="text-slate-800">{primaryAuditEv.operatorName}</strong>
                            {primaryAuditEv.activeDurationMinutes !== undefined && (
                              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 font-semibold">
                                Was active {formatActiveDuration(primaryAuditEv.activeDurationMinutes)}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <strong className="text-blue-800">Last updated</strong>{' '}
                            {formatAuditTimestampShort(primaryAuditEv.timestamp)} by{' '}
                            <strong className="text-slate-800">{primaryAuditEv.operatorName}</strong>
                          </>
                        )}
                      </span>

                      {!isEditingThisEventNote && primaryAuditEv.note && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-medium italic">
                          &ldquo;{primaryAuditEv.note}&rdquo;
                        </span>
                      )}

                      {!isEditingThisEventNote && onUpdateAuditNote && (
                        <button
                          type="button"
                          onClick={() => startEditingEventNote(primaryAuditEv)}
                          className="text-blue-600 hover:text-blue-800 font-semibold underline-offset-2 hover:underline cursor-pointer"
                        >
                          {primaryAuditEv.note ? 'Edit note' : '+ Add note'}
                        </button>
                      )}

                      {isEditingThisEventNote && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <input
                            type="text"
                            value={editingNoteValue}
                            onChange={(e) => setEditingNoteValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEventNote(primaryAuditEv.id);
                              } else if (e.key === 'Escape') {
                                setEditingNoteEventId(null);
                              }
                            }}
                            placeholder="Reason / operational note..."
                            autoFocus
                            className="h-7 w-52 rounded-md border border-blue-300 bg-white px-2 text-xs text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={isSavingEventNote}
                            onClick={() => handleSaveEventNote(primaryAuditEv.id)}
                            className="px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                          >
                            {isSavingEventNote ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingNoteEventId(null)}
                            className="px-2 py-1 rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400 flex items-center gap-1">
                      <HistoryIcon className="w-3 h-3" />
                      No On/Off history recorded yet
                    </span>
                  )}

                  {onOpenAuditHistory && (
                    <button
                      type="button"
                      onClick={() => onOpenAuditHistory(item.id)}
                      className="text-slate-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer self-start sm:self-auto"
                    >
                      <span>History →</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add / Edit Surcharge Modal (Drag-down bottom sheet on mobile) */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <form
            onSubmit={handleModalSubmit}
            style={surchargeSheetDrag.sheetStyle}
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0"
          >
            <div
              {...surchargeSheetDrag.dragHandlers}
              className="px-5 pt-2.5 sm:pt-4 pb-3.5 sm:pb-4 border-b border-slate-200 shrink-0 touch-none"
            >
              <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  {editingId ? 'Edit Surcharge' : 'New Surcharge'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  aria-label="Close surcharge dialog"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Surcharge Name (shown on customer breakdown)
                </label>
                <Input
                  type="text"
                  required
                  placeholder="e.g., Late-Night Service Fee, Holiday Surcharge"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-9 text-xs bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Description (optional)
                </label>
                <Input
                  type="text"
                  placeholder="Short internal or receipt note"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="h-9 text-xs bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Mode</label>
                  <Select
                    size="sm"
                    value={formMode}
                    onChange={(e) => setFormMode(e.target.value as SurchargeCalcMode)}
                  >
                    <option value="flat">Flat Fee ($)</option>
                    <option value="per_mile">Per Mile ($/mi)</option>
                    <option value="percent">% of Base Fare</option>
                    <option value="multiplier">Multiplier (×)</option>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Amount</label>
                  <Input
                    type="number"
                    step={formMode === 'multiplier' || formMode === 'per_mile' ? '0.05' : '0.50'}
                    min={formMode === 'multiplier' ? '1.0' : '0'}
                    value={formAmount}
                    onChange={(e) => setFormAmount(parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs font-mono font-bold bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Default Behavior
                </label>
                <Select
                  size="sm"
                  value={formPolicy}
                  onChange={(e) => setFormPolicy(e.target.value as SurchargeDefaultPolicy)}
                >
                  <option value="universal">All Trips — Applies to every trip (unless waived by a Rule)</option>
                  <option value="rule_only">Rule-Only — OFF by default (applies only when turned on by a Rule)</option>
                </Select>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600"
                />
                <span>Enabled immediately</span>
              </label>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="h-8 text-xs bg-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                {editingId ? 'Apply Edits' : 'Add to Catalog'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
