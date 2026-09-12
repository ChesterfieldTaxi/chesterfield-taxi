import React, { useState } from 'react';
import type { AppSettings, VehicleTierConfig } from '../../../core/types/config';
import { Button } from '../../ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Alert } from '../../ui/Alert';
import { Badge } from '../../ui/Badge';
import {
  CarIcon,
  SparklesIcon,
  UserIcon,
  LuggageIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
} from '../../ui/Icons';
import { DEFAULT_APP_SETTINGS } from '../../../core/services/config/admin-config.service';

export interface AdminVehiclesTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
}

export function AdminVehiclesTab({ settings, onSave, isLoading = false }: AdminVehiclesTabProps) {
  const [vehicles, setVehicles] = useState<VehicleTierConfig[]>([...settings.vehicles]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // New vehicle form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTier, setNewTier] = useState<VehicleTierConfig>({
    id: '',
    name: '',
    baseMultiplier: 1.25,
    maxPassengers: 4,
    maxLuggage: 3,
    description: '',
    badge: '',
    iconType: 'standard',
  });

  const handleUpdateVehicle = (index: number, updates: Partial<VehicleTierConfig>) => {
    setVehicles((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleDeleteVehicle = (index: number) => {
    if (vehicles.length <= 1) {
      alert('You must have at least one active vehicle type in service.');
      return;
    }
    setVehicles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddNewTier = (e: React.FormEvent) => {
    e.preventDefault();
    const idSlug = newTier.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!idSlug || !newTier.name.trim()) {
      alert('Vehicle Type ID and Name are required.');
      return;
    }

    if (vehicles.some((v) => v.id === idSlug)) {
      alert(`A vehicle type with ID "${idSlug}" already exists.`);
      return;
    }

    const tierToAdd: VehicleTierConfig = {
      ...newTier,
      id: idSlug,
      name: newTier.name.trim(),
      baseMultiplier: Number(newTier.baseMultiplier) || 1.0,
      maxPassengers: Number(newTier.maxPassengers) || 4,
      maxLuggage: Number(newTier.maxLuggage) || 2,
    };

    setVehicles((prev) => [...prev, tierToAdd]);
    setShowAddForm(false);
    setNewTier({
      id: '',
      name: '',
      baseMultiplier: 1.25,
      maxPassengers: 4,
      maxLuggage: 3,
      description: '',
      badge: '',
      iconType: 'standard',
    });
  };

  const handleResetDefaults = () => {
    if (confirm('Reset vehicle types to default configuration?')) {
      setVehicles([...DEFAULT_APP_SETTINGS.vehicles]);
    }
  };

  const handleSaveVehicles = async () => {
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      setSaveError(null);
      await onSave({ vehicles });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save vehicle types configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {saveSuccess && (
        <Alert variant="success" title="Vehicle Types Saved">
          Vehicle categories, capacities, and rate multipliers updated across public booking and dispatch.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Save Failed">
          {saveError}
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 font-bold text-sm">🚗</span>
            <h3 className="text-base font-extrabold text-slate-900">Vehicle Types (Service Classes)</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Define vehicle categories in service (e.g. Standard Sedan, SUV, Van, WAV), passenger/luggage capacities, and fare multipliers.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            disabled={isSaving}
          >
            Reset Defaults
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700"
          >
            <PlusIcon className="w-4 h-4" />
            Add Vehicle Type
          </Button>
        </div>
      </div>

      {/* Add New Tier Drawer / Inline Form */}
      {showAddForm && (
        <Card className="border-blue-200 bg-blue-50/20 shadow-sm animate-in fade-in duration-200">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-blue-900">Add New Vehicle Type</CardTitle>
            <CardDescription className="text-xs text-slate-600">
              Create a new vehicle class that customers can choose when booking and that physical cars are assigned to.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddNewTier} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Internal Type ID <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g. sedan_luxury"
                    value={newTier.id}
                    onChange={(e) => setNewTier({ ...newTier, id: e.target.value })}
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Unique system key</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Display Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Luxury Executive Sedan"
                    value={newTier.name}
                    onChange={(e) => setNewTier({ ...newTier, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Marketing Badge
                  </label>
                  <Input
                    placeholder="e.g. VIP Choice, Most Popular"
                    value={newTier.badge || ''}
                    onChange={(e) => setNewTier({ ...newTier, badge: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fare Multiplier
                  </label>
                  <Input
                    type="number"
                    step="0.05"
                    min="0.5"
                    max="5.0"
                    value={newTier.baseMultiplier}
                    onChange={(e) => setNewTier({ ...newTier, baseMultiplier: parseFloat(e.target.value) || 1 })}
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">1.0 = Standard base rate</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Max Passengers
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={newTier.maxPassengers}
                    onChange={(e) => setNewTier({ ...newTier, maxPassengers: parseInt(e.target.value) || 4 })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Max Luggage (Bags)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="20"
                    value={newTier.maxLuggage}
                    onChange={(e) => setNewTier({ ...newTier, maxLuggage: parseInt(e.target.value) || 2 })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Icon Styling
                  </label>
                  <select
                    className="w-full h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
                    value={newTier.iconType || 'standard'}
                    onChange={(e) => setNewTier({ ...newTier, iconType: e.target.value as any })}
                  >
                    <option value="standard">Standard (Sedan)</option>
                    <option value="premium">Executive (Luxury)</option>
                    <option value="xl">XL (SUV / Van)</option>
                    <option value="wheelchair">Wheelchair (WAV)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description / Features
                </label>
                <Input
                  placeholder="e.g. Premium leather seating, heated seats, quiet ride..."
                  value={newTier.description || ''}
                  onChange={(e) => setNewTier({ ...newTier, description: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" className="bg-blue-600 hover:bg-blue-700">
                  Save Vehicle Type
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Grid of Existing Vehicle Types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {vehicles.map((v, index) => (
          <Card key={v.id} className="relative group border border-slate-200/90 shadow-2xs hover:shadow-sm transition-all bg-white">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold text-sm shadow-2xs">
                  {v.iconType === 'premium' ? '✨' : v.iconType === 'xl' ? '🚐' : v.iconType === 'wheelchair' ? '♿' : '🚗'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-extrabold text-slate-900">{v.name}</CardTitle>
                    {v.badge && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        {v.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 font-semibold uppercase">ID: {v.id}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleDeleteVehicle(index)}
                className="text-slate-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors"
                title="Delete this vehicle type"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Multiplier</span>
                  <div className="flex items-center justify-center gap-1">
                    <Input
                      type="number"
                      step="0.05"
                      min="0.5"
                      max="5.0"
                      value={v.baseMultiplier}
                      onChange={(e) =>
                        handleUpdateVehicle(index, { baseMultiplier: parseFloat(e.target.value) || 1.0 })
                      }
                      className="w-18 h-7 text-xs text-center font-bold font-mono"
                    />
                    <span className="text-xs font-bold text-slate-600">x</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Passengers</span>
                  <div className="flex items-center justify-center gap-1">
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={v.maxPassengers}
                      onChange={(e) =>
                        handleUpdateVehicle(index, { maxPassengers: parseInt(e.target.value) || 1 })
                      }
                      className="w-14 h-7 text-xs text-center font-bold"
                    />
                    <span className="text-xs font-semibold text-slate-500">pax</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Luggage</span>
                  <div className="flex items-center justify-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      max="20"
                      value={v.maxLuggage}
                      onChange={(e) =>
                        handleUpdateVehicle(index, { maxLuggage: parseInt(e.target.value) || 0 })
                      }
                      className="w-14 h-7 text-xs text-center font-bold"
                    />
                    <span className="text-xs font-semibold text-slate-500">bags</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Description / Features</label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  value={v.description || ''}
                  onChange={(e) => handleUpdateVehicle(index, { description: e.target.value })}
                  placeholder="Details shown to customer when selecting vehicle..."
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Floating Save Actions Bar */}
      <div className="sticky bottom-4 bg-white/95 backdrop-blur-sm p-4 rounded-2xl border border-slate-200 shadow-lg flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-amber-500" />
          <span className="text-xs text-slate-600">
            {vehicles.length} vehicle types configured. Changes take effect on next booking calculation.
          </span>
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleSaveVehicles}
          disabled={isSaving || isLoading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 shadow-md font-bold px-6"
        >
          {isSaving ? <CheckIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
          {isSaving ? 'Saving...' : 'Save Vehicle Types'}
        </Button>
      </div>
    </div>
  );
}
