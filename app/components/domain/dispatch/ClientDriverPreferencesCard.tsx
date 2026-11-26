import React, { useMemo } from 'react';
import { normalizeClientDriverPreferences } from '../../../core/services/customer/contact.service';
import { formatDriverAssignmentLabel, type DriverRosterItem } from '../../../core/services/operator.service';
import { CarIcon } from '../../ui/Icons';
import { Select, type SelectOption } from '../../ui/Select';

export interface DriverPreferenceLists {
  preferredDriverIds: string[];
  excludedDriverIds: string[];
}

export function addPreferredDriver(prefs: DriverPreferenceLists, driverId: string): DriverPreferenceLists {
  const id = String(driverId || '').trim();
  if (!id) return normalizeClientDriverPreferences(prefs.preferredDriverIds, prefs.excludedDriverIds);
  const nextExcluded = prefs.excludedDriverIds.filter((d) => d !== id);
  const nextPreferred = prefs.preferredDriverIds.includes(id) ? prefs.preferredDriverIds : [...prefs.preferredDriverIds, id];
  return normalizeClientDriverPreferences(nextPreferred, nextExcluded);
}

export function movePreferredDriver(preferredDriverIds: ReadonlyArray<string>, index: number, direction: 'up' | 'down'): string[] {
  const list = [...preferredDriverIds];
  const targetIdx = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= list.length || targetIdx < 0 || targetIdx >= list.length) return list;
  const [moved] = list.splice(index, 1);
  list.splice(targetIdx, 0, moved);
  return list;
}

export function removePreferredDriver(preferredDriverIds: ReadonlyArray<string>, driverId: string): string[] {
  return preferredDriverIds.filter((id) => id !== driverId);
}

export function addExcludedDriver(prefs: DriverPreferenceLists, driverId: string): DriverPreferenceLists {
  const id = String(driverId || '').trim();
  if (!id) return normalizeClientDriverPreferences(prefs.preferredDriverIds, prefs.excludedDriverIds);
  const nextPreferred = prefs.preferredDriverIds.filter((d) => d !== id);
  const nextExcluded = prefs.excludedDriverIds.includes(id) ? prefs.excludedDriverIds : [...prefs.excludedDriverIds, id];
  return normalizeClientDriverPreferences(nextPreferred, nextExcluded);
}

export function removeExcludedDriver(excludedDriverIds: ReadonlyArray<string>, driverId: string): string[] {
  return excludedDriverIds.filter((id) => id !== driverId);
}

export interface ClientDriverPreferencesCardProps {
  drivers?: ReadonlyArray<DriverRosterItem>;
  preferredDriverIds: string[];
  excludedDriverIds: string[];
  onChange: (next: DriverPreferenceLists) => void;
}

export function ClientDriverPreferencesCard({
  drivers = [], preferredDriverIds, excludedDriverIds, onChange,
}: ClientDriverPreferencesCardProps) {
  const driverMap = useMemo(() => {
    const map = new Map<string, DriverRosterItem>();
    for (const d of drivers) if (d?.id && !d.isArchived) map.set(d.id, d);
    return map;
  }, [drivers]);

  const resolveLabel = (id: string) => {
    const drv = driverMap.get(id);
    return drv ? drv.formattedLabel || formatDriverAssignmentLabel(drv) : `Driver ${id}`;
  };

  const preferredOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: '', label: '+ Add Preferred Driver (#1..#N)...' }];
    for (const drv of driverMap.values()) {
      if (!preferredDriverIds.includes(drv.id)) opts.push({ value: drv.id, label: drv.formattedLabel || formatDriverAssignmentLabel(drv) });
    }
    return opts;
  }, [driverMap, preferredDriverIds]);

  const excludedOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: '', label: '+ Add Do Not Send Driver...' }];
    for (const drv of driverMap.values()) {
      if (!excludedDriverIds.includes(drv.id)) opts.push({ value: drv.id, label: drv.formattedLabel || formatDriverAssignmentLabel(drv) });
    }
    return opts;
  }, [driverMap, excludedDriverIds]);

  return (
    <div data-client-driver-preferences="true" className="bg-surface-card rounded-xl border border-border-subtle/90 p-3 space-y-2.5 shadow-2xs text-xs">
      <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-fg-muted">
        <CarIcon className="w-3.5 h-3.5 text-emerald-600" /><span>Driver Priority &amp; Exclusions</span>
      </div>

      <div className="space-y-1.5">
        <span className="block text-[10.5px] font-bold text-fg-secondary">Preferred Drivers (Priority Order #1..#N)</span>
        <Select size="xs" searchable searchPlaceholder="Search driver name or cab #..." options={preferredOptions} value="" onValueChange={(val) => { if (val) onChange(addPreferredDriver({ preferredDriverIds, excludedDriverIds }, val)); }} />
        {preferredDriverIds.length > 0 && (
          <div className="space-y-1 pt-0.5">
            {preferredDriverIds.map((id, idx) => (
              <div key={id} data-preferred-driver-row={id} className="px-2 py-1 rounded-lg bg-status-success-bg/70 border border-status-success-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black shrink-0">#{idx + 1}</span>
                  <span className="font-bold text-fg-strong truncate">{resolveLabel(id)}</span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button type="button" disabled={idx === 0} onClick={() => onChange({ preferredDriverIds: movePreferredDriver(preferredDriverIds, idx, 'up'), excludedDriverIds })} className="px-1.5 py-0.5 rounded hover:bg-status-success-bg-strong disabled:opacity-35 text-fg-secondary font-bold cursor-pointer" title="Move up">↑</button>
                  <button type="button" disabled={idx === preferredDriverIds.length - 1} onClick={() => onChange({ preferredDriverIds: movePreferredDriver(preferredDriverIds, idx, 'down'), excludedDriverIds })} className="px-1.5 py-0.5 rounded hover:bg-status-success-bg-strong disabled:opacity-35 text-fg-secondary font-bold cursor-pointer" title="Move down">↓</button>
                  <button type="button" onClick={() => onChange({ preferredDriverIds: removePreferredDriver(preferredDriverIds, id), excludedDriverIds })} className="px-1.5 py-0.5 rounded hover:bg-status-danger-bg-strong text-fg-muted hover:text-status-danger-fg font-bold cursor-pointer" title="Remove preferred driver">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5 pt-1 border-t border-border-faint">
        <span className="block text-[10.5px] font-bold text-status-danger-fg">Excluded Drivers (Do Not Send)</span>
        <Select size="xs" searchable searchPlaceholder="Search driver to exclude..." options={excludedOptions} value="" onValueChange={(val) => { if (val) onChange(addExcludedDriver({ preferredDriverIds, excludedDriverIds }, val)); }} />
        {excludedDriverIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {excludedDriverIds.map((id) => (
              <span key={id} data-excluded-driver-pill={id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-status-danger-bg border border-status-danger-border text-status-danger-fg text-[11px] font-bold">
                <span className="text-[9.5px] font-black uppercase tracking-wide text-rose-600">Do Not Send</span>
                <span>· {resolveLabel(id)}</span>
                <button type="button" onClick={() => onChange({ preferredDriverIds, excludedDriverIds: removeExcludedDriver(excludedDriverIds, id) })} className="text-rose-500 hover:text-status-danger-fg font-black cursor-pointer" title="Remove excluded driver">✕</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
