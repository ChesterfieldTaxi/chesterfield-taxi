import React, { useEffect, useState } from 'react';
import type { TariffCorridor } from '~/core/types/tariff';
import type { ZoneGeofence } from '~/core/types/zone';
import { getZoneService, DEFAULT_ZONES } from '~/core/services/zones/zone.service';
import { Input } from '~/components/ui/Input';
import { Button } from '~/components/ui/Button';
import { MapPinIcon, PlusIcon, TrashIcon } from '~/components/ui/Icons';

export interface CorridorEditorProps {
  corridors: TariffCorridor[];
  onChange: (updated: TariffCorridor[]) => void;
  readOnly?: boolean;
}

export function CorridorEditor({
  corridors = [],
  onChange,
  readOnly = false,
}: CorridorEditorProps) {
  const [zones, setZones] = useState<ZoneGeofence[]>(() => {
    try {
      const active = getZoneService().getActiveZones();
      return active.length > 0 ? active : DEFAULT_ZONES;
    } catch {
      return DEFAULT_ZONES;
    }
  });

  useEffect(() => {
    try {
      const unsub = getZoneService().subscribeToZones((liveZones) => {
        const active = liveZones.filter((z) => z.isActive && !z.isArchived);
        if (active.length > 0) setZones(active);
      });
      return () => unsub();
    } catch {
      return undefined;
    }
  }, []);

  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [fromZoneId, setFromZoneId] = useState('');
  const [toZoneId, setToZoneId] = useState('');
  const [flatPrice, setFlatPrice] = useState<number>(45);
  const [allowReturn, setAllowReturn] = useState(true);

  const getZoneName = (id?: string) => {
    if (!id) return 'Any Zone';
    return zones.find((z) => z.id === id)?.name || id;
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromZoneId && !toZoneId) return;
    const autoName =
      name.trim() || `${getZoneName(fromZoneId)} ${allowReturn ? '↔' : '→'} ${getZoneName(toZoneId)}`;
    const newItem: TariffCorridor = {
      id: `corridor-${Date.now()}`,
      name: autoName,
      fromZoneId: fromZoneId || undefined,
      toZoneId: toZoneId || undefined,
      flatPrice: Number(flatPrice) || 0,
      allowReturn,
    };
    onChange([...corridors, newItem]);
    setName('');
    setFromZoneId('');
    setToZoneId('');
    setFlatPrice(45);
    setAllowReturn(true);
    setIsAdding(false);
  };

  const handleUpdatePrice = (id: string, nextPrice: number) => {
    onChange(corridors.map((c) => (c.id === id ? { ...c, flatPrice: nextPrice } : c)));
  };

  const handleToggleReturn = (id: string) => {
    onChange(corridors.map((c) => (c.id === id ? { ...c, allowReturn: !c.allowReturn } : c)));
  };

  const handleDelete = (id: string) => {
    onChange(corridors.filter((c) => c.id !== id));
  };

  return (
    <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
            <MapPinIcon className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Fixed Zone-to-Zone Corridors ({corridors.length})
            </h4>
            <p className="text-[11px] text-slate-500">
              Override mileage with a guaranteed flat fare whenever a trip travels between two service zones.
            </p>
          </div>
        </div>

        {!readOnly && (
          <Button
            type="button"
            size="sm"
            onClick={() => setIsAdding((prev) => !prev)}
            className="w-full sm:w-auto justify-center text-xs bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 cursor-pointer"
          >
            <PlusIcon className="w-3.5 h-3.5 mr-1" />
            Add Corridor
          </Button>
        )}
      </div>

      {isAdding && !readOnly && (
        <form
          onSubmit={handleAdd}
          className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-200 space-y-3 text-xs"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Origin Zone
              </label>
              <select
                value={fromZoneId}
                onChange={(e) => setFromZoneId(e.target.value)}
                className="w-full h-8 text-xs rounded-md bg-white border border-slate-300 text-slate-900 px-2"
              >
                <option value="">Any Origin Zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Destination Zone
              </label>
              <select
                value={toZoneId}
                onChange={(e) => setToZoneId(e.target.value)}
                className="w-full h-8 text-xs rounded-md bg-white border border-slate-300 text-slate-900 px-2"
              >
                <option value="">Any Destination Zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Flat Base Price ($)
              </label>
              <Input
                type="number"
                step="1.00"
                min="0"
                required
                value={flatPrice}
                onChange={(e) => setFlatPrice(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs bg-white border-slate-300 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Corridor Label (Optional)
              </label>
              <Input
                type="text"
                placeholder="e.g. Chesterfield Valley ↔ Lambert STL"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-xs bg-white border-slate-300"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 pt-1 md:pt-4">
              <input
                type="checkbox"
                checked={allowReturn}
                onChange={(e) => setAllowReturn(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 shrink-0"
              />
              <span>Bidirectional (applies in both directions)</span>
            </label>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-indigo-200/70">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAdding(false)}
              className="w-full sm:w-auto justify-center text-xs bg-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!fromZoneId && !toZoneId}
              className="w-full sm:w-auto justify-center text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Save Corridor
            </Button>
          </div>
        </form>
      )}

      {corridors.length === 0 ? (
        <div className="p-5 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          No fixed corridors configured. Click &ldquo;+ Add Corridor&rdquo; to set a flat zone-to-zone fare.
        </div>
      ) : (
        <div className="space-y-2">
          {corridors.map((c) => (
            <div
              key={c.id}
              className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="font-bold text-slate-900 truncate">{c.name}</div>
                <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium">{getZoneName(c.fromZoneId)}</span>
                  <span className="text-indigo-600 font-bold">{c.allowReturn ? '↔' : '→'}</span>
                  <span className="font-medium">{getZoneName(c.toZoneId)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0">
                <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={Boolean(c.allowReturn)}
                    onChange={() => handleToggleReturn(c.id)}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span>2-Way</span>
                </label>

                <div className="relative w-24">
                  <span className="absolute left-2 top-1.5 text-slate-400 font-bold">$</span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    disabled={readOnly}
                    value={c.flatPrice}
                    onChange={(e) => handleUpdatePrice(c.id, parseFloat(e.target.value) || 0)}
                    className="h-7 pl-5 text-xs font-mono font-bold bg-white border-slate-300 text-emerald-700"
                  />
                </div>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Delete corridor"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
