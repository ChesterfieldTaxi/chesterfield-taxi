import React, { useState, useMemo } from 'react';
import type { ZipRateMatrixEntry } from '~/core/types/tariff';
import { Input } from '~/components/ui/Input';
import { Button } from '~/components/ui/Button';
import { Badge } from '~/components/ui/Badge';
import {
  SearchIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  DownloadIcon,
  CheckIcon,
  ShieldCheckIcon,
  DollarSignIcon,
} from '~/components/ui/Icons';

export interface ZipRateMatrixEditorProps {
  entries: ZipRateMatrixEntry[];
  onChange: (updated: ZipRateMatrixEntry[]) => void;
  readOnly?: boolean;
}

export function ZipRateMatrixEditor({
  entries = [],
  onChange,
  readOnly = false,
}: ZipRateMatrixEditorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingZip, setEditingZip] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // New entry form state
  const [newZip, setNewZip] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newCar, setNewCar] = useState(28.0);
  const [newTip, setNewTip] = useState(5.75);
  const [newCharge, setNewCharge] = useState(39.5);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase().trim();
    return entries.filter(
      (e) => e.zip.toLowerCase().includes(q) || e.city.toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  // Aggregate stats
  const stats = useMemo(() => {
    if (!entries.length) return { count: 0, min: 0, max: 0, avg: 0 };
    const charges = entries.map((e) => e.customerCharge);
    const min = Math.min(...charges);
    const max = Math.max(...charges);
    const avg = charges.reduce((a, b) => a + b, 0) / entries.length;
    return { count: entries.length, min, max, avg };
  }, [entries]);

  // Save or Add handlers
  const handleAddNewEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZip.trim()) return;

    const total = parseFloat((newCar + newTip).toFixed(2));
    const customerCharge = newCharge > 0 ? newCharge : total;
    const driverPay = customerCharge; // Direct 100% pass-through

    const newEntry: ZipRateMatrixEntry = {
      zip: newZip.trim(),
      city: newCity.trim() || 'St. Louis Metro',
      car: parseFloat(newCar.toFixed(2)),
      tip: parseFloat(newTip.toFixed(2)),
      total,
      customerCharge: parseFloat(customerCharge.toFixed(2)),
      driverPay: parseFloat(driverPay.toFixed(2)),
    };

    const existingIndex = entries.findIndex((item) => item.zip === newEntry.zip);
    let updated: ZipRateMatrixEntry[];
    if (existingIndex >= 0) {
      updated = [...entries];
      updated[existingIndex] = newEntry;
    } else {
      updated = [...entries, newEntry].sort((a, b) => a.zip.localeCompare(b.zip));
    }

    onChange(updated);
    setNewZip('');
    setNewCity('');
    setIsAddingNew(false);
  };

  const handleDeleteEntry = (zipToDelete: string) => {
    const updated = entries.filter((e) => e.zip !== zipToDelete);
    onChange(updated);
    if (editingZip === zipToDelete) setEditingZip(null);
  };

  const handleUpdateField = (
    zip: string,
    field: keyof ZipRateMatrixEntry,
    val: string | number
  ) => {
    const updated = entries.map((entry) => {
      if (entry.zip !== zip) return entry;
      const mod = { ...entry, [field]: val };
      if (field === 'car' || field === 'tip') {
        mod.total = parseFloat(((mod.car || 0) + (mod.tip || 0)).toFixed(2));
      }
      if (field === 'customerCharge') {
        mod.driverPay = mod.customerCharge;
      }
      return mod;
    });
    onChange(updated);
  };

  const handleExportCSV = () => {
    const headers = ['Zip', 'City', 'Car Base', 'Tip', 'Total', 'Customer Charge', 'Driver Pay'];
    const rows = entries.map((e) => [
      e.zip,
      `"${e.city}"`,
      e.car.toFixed(2),
      e.tip.toFixed(2),
      e.total.toFixed(2),
      e.customerCharge.toFixed(2),
      (e.driverPay ?? e.customerCharge).toFixed(2),
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'smoke_house_matrix_rates.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Contract Policy Header Banner */}
      <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-amber-900 font-bold text-sm flex items-center gap-1.5">
              <ShieldCheckIcon className="w-4 h-4 text-amber-700" />
              Corporate Agreement: Smoke House Market Chesterfield
            </span>
            <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-[10px]">
              Single Unified Price (100% Pass-Through)
            </Badge>
          </div>
          <p className="text-xs text-slate-600">
            All 78 agreed zip codes define a unified flat rate. Customer charge and driver payout are identical (single agreed price). Contract tariffs are exempt from surge multipliers and operational surcharges.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
          >
            <DownloadIcon className="w-3.5 h-3.5 mr-1 text-slate-500" />
            Export CSV
          </Button>
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              onClick={() => setIsAddingNew(!isAddingNew)}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs"
            >
              <PlusIcon className="w-3.5 h-3.5 mr-1" />
              Add Zip Rate
            </Button>
          )}
        </div>
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl bg-white border border-slate-200 text-center shadow-2xs">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Defined Zips</span>
          <span className="text-base font-bold text-slate-900">{stats.count}</span>
        </div>
        <div className="p-3 rounded-xl bg-white border border-slate-200 text-center shadow-2xs">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Min Flat Rate</span>
          <span className="text-base font-bold text-emerald-700">${stats.min.toFixed(2)}</span>
        </div>
        <div className="p-3 rounded-xl bg-white border border-slate-200 text-center shadow-2xs">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Average Rate</span>
          <span className="text-base font-bold text-blue-700">${stats.avg.toFixed(2)}</span>
        </div>
        <div className="p-3 rounded-xl bg-white border border-slate-200 text-center shadow-2xs">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Max Flat Rate</span>
          <span className="text-base font-bold text-purple-700">${stats.max.toFixed(2)}</span>
        </div>
      </div>

      {/* Add New Zip Rate Inline Form */}
      {isAddingNew && (
        <form onSubmit={handleAddNewEntry} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 shadow-2xs">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
            <PlusIcon className="w-3.5 h-3.5 text-emerald-600" />
            Add Agreed Zip Code Rate
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 text-xs">
            <div>
              <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Zip Code</label>
              <Input
                type="text"
                placeholder="63005"
                required
                value={newZip}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewZip(e.target.value)}
                className="h-8 text-xs bg-white border-slate-300 text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-600 block mb-0.5">City / Destination</label>
              <Input
                type="text"
                placeholder="Chesterfield"
                value={newCity}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCity(e.target.value)}
                className="h-8 text-xs bg-white border-slate-300 text-slate-900"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Car Base ($)</label>
              <Input
                type="number"
                step="0.5"
                value={newCar}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCar(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs bg-white border-slate-300 text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Tip ($)</label>
              <Input
                type="number"
                step="0.25"
                value={newTip}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTip(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs bg-white border-slate-300 text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Agreed Price / Flat Rate ($)</label>
              <Input
                type="number"
                step="0.5"
                value={newCharge}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCharge(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs bg-white border-emerald-400 text-emerald-950 font-bold font-mono"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddingNew(false)}
              className="h-7 text-xs border-slate-300 bg-white text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Save Rate
            </Button>
          </div>
        </form>
      )}

      {/* Search and Table Container */}
      <div className="space-y-2">
        <div className="relative">
          <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <Input
            type="text"
            placeholder="Search by Zip Code (e.g. 63011) or City (e.g. Ballwin)..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-white border-slate-300 text-slate-900 w-full"
          />
        </div>

        {/* Scrollable Matrix Table */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
          <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 text-[11px] font-semibold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Zip Code</th>
                  <th className="py-2.5 px-3">Destination City</th>
                  <th className="py-2.5 px-2 text-right">Car Base</th>
                  <th className="py-2.5 px-2 text-right">Tip</th>
                  <th className="py-2.5 px-2 text-right">Total</th>
                  <th className="py-2.5 px-3 text-right">Agreed Flat Price</th>
                  {!readOnly && <th className="py-2.5 px-3 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredEntries.map((row) => {
                  const isEditing = editingZip === row.zip;
                  return (
                    <tr key={row.zip} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        {row.zip}
                      </td>
                      <td className="py-2 px-3 text-slate-700 font-sans">
                        {isEditing ? (
                          <Input
                            type="text"
                            value={row.city}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateField(row.zip, 'city', e.target.value)}
                            className="h-6 text-xs bg-white border-slate-300 py-0"
                          />
                        ) : (
                          row.city
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-500">
                        ${row.car.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-500">
                        ${row.tip.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-700">
                        ${row.total.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.5"
                            value={row.customerCharge}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const val = parseFloat(e.target.value) || 0;
                              handleUpdateField(row.zip, 'customerCharge', val);
                              handleUpdateField(row.zip, 'driverPay', val);
                            }}
                            className="h-6 w-24 text-xs bg-white border-slate-300 text-right py-0 ml-auto"
                          />
                        ) : (
                          <span className="font-bold text-emerald-700">
                            ${row.customerCharge.toFixed(2)}
                          </span>
                        )}
                      </td>
                      {!readOnly && (
                        <td className="py-2 px-3 text-center font-sans">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingZip(isEditing ? null : row.zip)}
                              className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                              title={isEditing ? 'Done' : 'Edit Rate'}
                            >
                              {isEditing ? (
                                <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <EditIcon className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(row.zip)}
                              className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                              title="Delete Row"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500 font-sans text-xs">
                      No matching zip codes found for "{searchQuery}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
