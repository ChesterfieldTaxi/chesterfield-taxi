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

export interface AdminFleetTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
}

export function AdminFleetTab({ settings, onSave, isLoading = false }: AdminFleetTabProps) {
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
      alert('You must have at least one active vehicle tier in the fleet.');
      return;
    }
    setVehicles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddNewTier = (e: React.FormEvent) => {
    e.preventDefault();
    const idSlug = newTier.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!idSlug || !newTier.name.trim()) {
      alert('Tier ID and Name are required.');
      return;
    }

    if (vehicles.some((v) => v.id === idSlug)) {
      alert(`A vehicle tier with ID "${idSlug}" already exists.`);
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
    if (confirm('Reset fleet tiers to default configuration?')) {
      setVehicles([...DEFAULT_APP_SETTINGS.vehicles]);
    }
  };

  const handleSaveFleet = async () => {
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      setSaveError(null);
      await onSave({ vehicles });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save fleet configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {saveSuccess && (
        <Alert variant="success" title="Fleet Configuration Saved">
          Vehicle tiers and rate multipliers are updated and synced across the dispatch pipeline.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Save Failed">
          {saveError}
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">Fleet Management</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage available passenger vehicle tiers, passenger/luggage capacities, and fare multipliers.
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
            onClick={() => setShowAddForm(!showAddForm)}
            leftIcon={<PlusIcon className="w-4 h-4" />}
          >
            {showAddForm ? 'Cancel Add' : 'Add Vehicle Tier'}
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSaveFleet}
            isLoading={isSaving || isLoading}
            leftIcon={<CheckIcon className="w-4 h-4" />}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Save All Changes
          </Button>
        </div>
      </div>

      {/* Add New Tier Drawer / Form */}
      {showAddForm && (
        <Card variant="elevated" className="border-amber-300 bg-amber-50/20 shadow-xs">
          <CardHeader className="border-b border-amber-200/60 pb-3">
            <CardTitle className="text-base text-slate-900">Create New Vehicle Tier</CardTitle>
            <CardDescription className="text-xs text-slate-600">
              Define a custom vehicle category with unique pricing multiplier and capacity rules.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleAddNewTier} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Tier ID (Unique Identifier)"
                  placeholder="e.g., luxury_van"
                  value={newTier.id}
                  onChange={(e) => setNewTier((prev) => ({ ...prev, id: e.target.value }))}
                  helperText="Lower-case alphanumeric (e.g. suv_exec)"
                  required
                />
                <Input
                  label="Display Name"
                  placeholder="e.g., Luxury Executive Van"
                  value={newTier.name}
                  onChange={(e) => setNewTier((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
                <Input
                  label="Fare Multiplier"
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="5.0"
                  value={newTier.baseMultiplier}
                  onChange={(e) => setNewTier((prev) => ({ ...prev, baseMultiplier: parseFloat(e.target.value) || 1.0 }))}
                  helperText="Multiplier applied to mileage and time components"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Max Passengers"
                  type="number"
                  min="1"
                  max="16"
                  value={newTier.maxPassengers}
                  onChange={(e) => setNewTier((prev) => ({ ...prev, maxPassengers: parseInt(e.target.value, 10) || 1 }))}
                  required
                />
                <Input
                  label="Max Luggage Bags"
                  type="number"
                  min="0"
                  max="16"
                  value={newTier.maxLuggage}
                  onChange={(e) => setNewTier((prev) => ({ ...prev, maxLuggage: parseInt(e.target.value, 10) || 0 }))}
                  required
                />
                <Input
                  label="Badge Label (Optional)"
                  placeholder="e.g., Popular or VIP"
                  value={newTier.badge || ''}
                  onChange={(e) => setNewTier((prev) => ({ ...prev, badge: e.target.value }))}
                />
              </div>

              <Input
                label="Customer Description"
                placeholder="Spacious luxury vehicle with premium comfort for groups..."
                value={newTier.description || ''}
                onChange={(e) => setNewTier((prev) => ({ ...prev, description: e.target.value }))}
              />

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" leftIcon={<PlusIcon className="w-4 h-4" />}>
                  Add Tier to Fleet
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Fleet Tiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {vehicles.map((vehicle, idx) => (
          <Card key={vehicle.id} variant="elevated" className="border-slate-200 shadow-xs relative">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
                  <CarIcon className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <CardTitle className="text-base text-slate-900 leading-none">
                    {vehicle.name}
                  </CardTitle>
                  <span className="text-[11px] font-mono text-slate-400">ID: {vehicle.id}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {vehicle.badge && <Badge variant="primary">{vehicle.badge}</Badge>}
                <button
                  type="button"
                  onClick={() => handleDeleteVehicle(idx)}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  title="Remove vehicle tier"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-slate-500">
                    Multiplier
                  </label>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      step="0.05"
                      min="0.5"
                      max="5.0"
                      value={vehicle.baseMultiplier}
                      onChange={(e) =>
                        handleUpdateVehicle(idx, {
                          baseMultiplier: parseFloat(e.target.value) || 1.0,
                        })
                      }
                      className="w-full text-sm font-bold text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5"
                    />
                    <span className="text-xs font-bold text-slate-400">x</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase text-slate-500">
                    Max Passengers
                  </label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="number"
                      min="1"
                      max="16"
                      value={vehicle.maxPassengers}
                      onChange={(e) =>
                        handleUpdateVehicle(idx, {
                          maxPassengers: parseInt(e.target.value, 10) || 1,
                        })
                      }
                      className="w-full text-sm font-bold text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase text-slate-500">
                    Max Luggage
                  </label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="number"
                      min="0"
                      max="16"
                      value={vehicle.maxLuggage}
                      onChange={(e) =>
                        handleUpdateVehicle(idx, {
                          maxLuggage: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full text-sm font-bold text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase text-slate-500">
                  Description
                </label>
                <input
                  type="text"
                  value={vehicle.description || ''}
                  onChange={(e) => handleUpdateVehicle(idx, { description: e.target.value })}
                  placeholder="Tier description for passenger selection..."
                  className="w-full text-xs text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-1"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end pt-4">
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleSaveFleet}
          isLoading={isSaving || isLoading}
          leftIcon={<CheckIcon className="w-4 h-4" />}
          className="bg-amber-600 hover:bg-amber-700 shadow-sm"
        >
          Save Fleet Changes
        </Button>
      </div>
    </div>
  );
}
