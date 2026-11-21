import React, { useState, useEffect } from 'react';
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
  TagIcon,
  SpinnerIcon,
} from '../../ui/Icons';
import { DEFAULT_APP_SETTINGS } from '../../../core/services/config/admin-config.service';
import { AdminFleetTab } from './AdminFleetTab';
import { AdminSlideOverDrawer } from './AdminSlideOverDrawer';
import { VehicleImagePicker } from './vehicles/VehicleImagePicker';

export interface AdminVehiclesTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialSubTab?: 'types' | 'fleet';
}

export function AdminVehiclesTab({
  settings,
  onSave,
  isLoading = false,
  initialSubTab = 'types',
}: AdminVehiclesTabProps) {
  const [subTab, setSubTab] = useState<'types' | 'fleet'>(initialSubTab || 'types');

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const [vehicles, setVehicles] = useState<VehicleTierConfig[]>([...settings.vehicles]);
  const [vehicleFilter, setVehicleFilter] = useState<'active' | 'archived' | 'all'>('active');

  useEffect(() => {
    if (settings.vehicles && settings.vehicles.length > 0) {
      setVehicles([...settings.vehicles]);
    }
  }, [settings.vehicles]);

  const persistVehicles = async (nextVehicles: VehicleTierConfig[]) => {
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      setSaveError(null);
      await onSave({ vehicles: nextVehicles });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save vehicle types configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  // Edit vehicle type modal state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<VehicleTierConfig | null>(null);

  const handleOpenEdit = (index: number) => {
    setEditingIndex(index);
    setEditForm({ ...vehicles[index] });
  };

  const handleCloseEdit = () => {
    setEditingIndex(null);
    setEditForm(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingIndex === null || !editForm) return;

    if (!editForm.name.trim()) {
      alert('Vehicle Class Name cannot be blank.');
      return;
    }

    const next = [...vehicles];
    next[editingIndex] = {
      ...editForm,
      name: editForm.name.trim(),
      baseMultiplier: 1.0,
      maxPassengers: Number(editForm.maxPassengers) || 1,
      maxLuggage: Number(editForm.maxLuggage) || 0,
    };
    setVehicles(next);
    handleCloseEdit();
    await persistVehicles(next);
  };

  const handleToggleArchive = async (index: number) => {
    const next = [...vehicles];
    const cur = next[index];
    const isArchiving = !cur.isArchived;
    next[index] = {
      ...cur,
      isArchived: isArchiving,
      archivedAt: isArchiving ? new Date().toISOString() : undefined,
      archiveReason: isArchiving ? 'Archived by administrator' : undefined,
    };
    setVehicles(next);
    await persistVehicles(next);
  };
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // New vehicle form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTier, setNewTier] = useState<VehicleTierConfig>({
    id: '',
    name: '',
    baseMultiplier: 1.0,
    maxPassengers: 4,
    maxLuggage: 3,
    description: '',
    badge: '',
    iconType: 'standard',
    imageUrl: '',
  });

  const handleUpdateVehicle = (index: number, updates: Partial<VehicleTierConfig>) => {
    setVehicles((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleDeleteVehicle = async (index: number) => {
    if (vehicles.length <= 1) {
      alert('You must have at least one active vehicle type in service.');
      return;
    }
    const next = vehicles.filter((_, i) => i !== index);
    setVehicles(next);
    await persistVehicles(next);
  };

  const handleAddNewTier = async (e: React.FormEvent) => {
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

    const next = [...vehicles, tierToAdd];
    setVehicles(next);
    setShowAddForm(false);
    setNewTier({
      id: '',
      name: '',
      baseMultiplier: 1.0,
      maxPassengers: 4,
      maxLuggage: 3,
      description: '',
      badge: '',
      iconType: 'standard',
      imageUrl: '',
    });
    await persistVehicles(next);
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
    <div className="space-y-4">
      {/* ─── SECTION 2: PHYSICAL FLEET ASSET MANAGEMENT TABLE ─── */}
      {subTab === 'fleet' && (
        <AdminFleetTab settings={settings} onSave={onSave} isLoading={isLoading} />
      )}

      {/* ─── SECTION 1: VEHICLE TYPES (SERVICE CLASSES) ─── */}
      {subTab === 'types' && (
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

          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 font-bold text-sm shrink-0"><CarIcon className="w-4 h-4" /></span>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900">Vehicle Types (Service Classes)</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Define vehicle categories in service (e.g. Compact SUV, Midsize SUV, Minivan), capacities, and client photos. Vehicle upgrade fees and tariffs are managed in <strong>Rates &amp; Tariffs</strong>.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2 sm:gap-3 w-full sm:w-auto shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetDefaults}
                disabled={isSaving}
                className="justify-center"
              >
                Reset Defaults
              </Button>

              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setShowAddForm(true)}
                leftIcon={<PlusIcon className="w-4 h-4" />}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs hover:shadow-sm active:scale-95 justify-center"
              >
                Add Vehicle Type
              </Button>
            </div>
          </div>

          {/* Add Vehicle Type Slide-Over Drawer */}
          <AdminSlideOverDrawer
            isOpen={showAddForm}
            onClose={() => setShowAddForm(false)}
            title="Add Vehicle Type"
            subtitle="Create a new service class that clients can book and fleet vehicles map to"
            size="lg"
            footer={
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="add-vehicle-type-form"
                  variant="primary"
                  size="md"
                  leftIcon={<PlusIcon className="w-4 h-4" />}
                  className="font-bold"
                >
                  Add Vehicle Type
                </Button>
              </>
            }
          >
            <form id="add-vehicle-type-form" onSubmit={handleAddNewTier} className="space-y-5">
              <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <CarIcon className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Class Identity
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Internal Type ID <span className="text-rose-500">*</span>
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Display Name <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      placeholder="e.g. Luxury Executive Sedan"
                      value={newTier.name}
                      onChange={(e) => setNewTier({ ...newTier, name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Marketing Badge
                    </label>
                    <Input
                      placeholder="e.g. VIP Choice, Most Popular"
                      value={newTier.badge || ''}
                      onChange={(e) => setNewTier({ ...newTier, badge: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Icon Silhouette
                    </label>
                    <select
                      className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
                      value={newTier.iconType || 'standard'}
                      onChange={(e) =>
                        setNewTier({ ...newTier, iconType: e.target.value as any })
                      }
                    >
                      <option value="standard">Standard Sedan</option>
                      <option value="premium">Executive Premium</option>
                      <option value="xl">XL / SUV / Van</option>
                      <option value="wheelchair">WAV Accessible</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <UserIcon className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Capacities &amp; Description
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Max Passengers
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={newTier.maxPassengers}
                      onChange={(e) =>
                        setNewTier({ ...newTier, maxPassengers: parseInt(e.target.value) || 1 })
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Max Luggage
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="20"
                      value={newTier.maxLuggage}
                      onChange={(e) =>
                        setNewTier({ ...newTier, maxLuggage: parseInt(e.target.value) || 0 })
                      }
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Client Description
                  </label>
                  <textarea
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-hidden"
                    placeholder="e.g. Spacious premium sedan offering exceptional legroom and trunk space."
                    value={newTier.description || ''}
                    onChange={(e) => setNewTier({ ...newTier, description: e.target.value })}
                  />
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-slate-200/90 p-4">
                <VehicleImagePicker
                  value={newTier.imageUrl || ''}
                  onChange={(url) => setNewTier({ ...newTier, imageUrl: url })}
                  helperText="Optional vehicle image shown to customers on the booking form. Leave blank to use category icon."
                />
              </section>
            </form>
          </AdminSlideOverDrawer>

          {/* Vehicle Types Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 pb-2 border-b border-slate-200">
            <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setVehicleFilter('active')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap cursor-pointer ${
                  vehicleFilter === 'active'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active ({vehicles.filter((v) => !v.isArchived).length})
              </button>
              <button
                type="button"
                onClick={() => setVehicleFilter('archived')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap cursor-pointer ${
                  vehicleFilter === 'archived'
                    ? 'bg-amber-100 text-amber-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Archived ({vehicles.filter((v) => !!v.isArchived).length})
              </button>
              <button
                type="button"
                onClick={() => setVehicleFilter('all')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap cursor-pointer ${
                  vehicleFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({vehicles.length})
              </button>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Archived vehicle classes are hidden from the client booking wizard.
            </div>
          </div>

          {/* Vehicle Tiers Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vehicles
              .filter((v) => {
                if (vehicleFilter === 'active') return !v.isArchived;
                if (vehicleFilter === 'archived') return !!v.isArchived;
                return true;
              })
              .map((v) => {
                const index = vehicles.findIndex((item) => item.id === v.id);
                return (
              <Card
                key={v.id}
                variant="elevated"
                className="border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden"
              >
                {v.imageUrl && (
                  <div className="relative w-full h-36 bg-slate-100 overflow-hidden border-b border-slate-100">
                    <img
                      src={v.imageUrl}
                      alt={v.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      {v.badge && (
                        <span className="bg-amber-500/95 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          {v.badge}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <CardHeader className="p-4 pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      {v.iconType === 'premium' ? (
                        <SparklesIcon className="w-5 h-5" />
                      ) : (
                        <CarIcon className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <CardTitle className="text-sm font-bold text-slate-900 truncate">{v.name}</CardTitle>
                        {v.badge && !v.imageUrl && (
                          <Badge variant="warning" size="sm" className="text-[10px] py-0 px-1.5">
                            {v.badge}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[10px] font-mono text-slate-400">ID: {v.id}</span>
                        {v.isArchived && (
                          <span className="inline-block text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                            ARCHIVED
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(index)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                      title="Edit All Vehicle Class Details"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleArchive(index)}
                      className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition-colors ${
                        v.isArchived
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200'
                      }`}
                      title={v.isArchived ? 'Restore Vehicle Type' : 'Archive Vehicle Type'}
                    >
                      {v.isArchived ? 'Restore' : 'Archive'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteVehicle(index)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove Vehicle Type"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-4 flex-1">
                  <div className="grid grid-cols-2 gap-2">
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
            );
            })}
          </div>

          {/* Floating Save Actions Bar */}
          <div className="sticky bottom-16 lg:bottom-4 bg-white/95 backdrop-blur-sm p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 z-20">
            <div className="flex items-center gap-2 min-w-0">
              <SparklesIcon className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs text-slate-600">
                {vehicles.length} vehicle types configured. Changes apply to new quotes.
              </span>
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSaveVehicles}
              disabled={isSaving || isLoading}
              className="w-full sm:w-auto justify-center flex items-center gap-2 bg-blue-600 hover:bg-blue-700 shadow-md font-bold px-6 shrink-0"
            >
              {isSaving ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {isSaving ? 'Saving...' : 'Save Vehicle Types'}
            </Button>
          </div>
        </div>
      )}

      {/* Edit Vehicle Type Slide-Over Drawer */}
      <AdminSlideOverDrawer
        isOpen={Boolean(editingIndex !== null && editForm)}
        onClose={handleCloseEdit}
        title={editForm ? `Edit Vehicle Type: ${editForm.name}` : 'Edit Vehicle Type'}
        subtitle="Update capacities, icon silhouette, description, and client booking photo"
        size="lg"
        footer={
          <>
            <Button type="button" variant="outline" size="md" onClick={handleCloseEdit}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-vehicle-type-form"
              variant="primary"
              size="md"
              leftIcon={<CheckIcon className="w-4 h-4" />}
              className="font-bold"
            >
              Save Vehicle Type
            </Button>
          </>
        }
      >
        {editingIndex !== null && editForm && (
          <form id="edit-vehicle-type-form" onSubmit={handleSaveEdit} className="space-y-5">
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <CarIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Class Identity
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Display Name <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Marketing Badge
                  </label>
                  <Input
                    placeholder="e.g. Popular, VIP, Family"
                    value={editForm.badge || ''}
                    onChange={(e) => setEditForm({ ...editForm, badge: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Icon Silhouette
                </label>
                <select
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
                  value={editForm.iconType || 'standard'}
                  onChange={(e) =>
                    setEditForm({ ...editForm, iconType: e.target.value as any })
                  }
                >
                  <option value="standard">Standard Sedan</option>
                  <option value="premium">Executive Premium</option>
                  <option value="xl">XL / SUV / Van</option>
                  <option value="wheelchair">WAV Accessible</option>
                </select>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <UserIcon className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Capacities &amp; Description
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Max Passengers
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={editForm.maxPassengers}
                    onChange={(e) =>
                      setEditForm({ ...editForm, maxPassengers: parseInt(e.target.value) || 1 })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Max Luggage
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="20"
                    value={editForm.maxLuggage}
                    onChange={(e) =>
                      setEditForm({ ...editForm, maxLuggage: parseInt(e.target.value) || 0 })
                    }
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client Description
                </label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-hidden"
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Details displayed to clients..."
                />
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200/90 p-4">
              <VehicleImagePicker
                value={editForm.imageUrl || ''}
                onChange={(url) => setEditForm({ ...editForm, imageUrl: url })}
                helperText="Optional image displayed to customers in the vehicle selection cards on the booking form."
              />
            </section>
          </form>
        )}
      </AdminSlideOverDrawer>
    </div>
  );
}
