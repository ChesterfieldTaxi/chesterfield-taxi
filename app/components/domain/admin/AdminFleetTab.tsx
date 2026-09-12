import React, { useState } from 'react';
import type { AppSettings, FleetCarConfig, MaintenanceRecord } from '../../../core/types/config';
import { Button } from '../../ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Alert } from '../../ui/Alert';
import { Badge } from '../../ui/Badge';
import {
  CarIcon,
  SparklesIcon,
  UserIcon,
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
  const [fleet, setFleet] = useState<FleetCarConfig[]>(() => {
    if (settings.fleet && settings.fleet.length > 0) {
      return [...settings.fleet];
    }
    return DEFAULT_APP_SETTINGS.fleet ? [...DEFAULT_APP_SETTINGS.fleet] : [];
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchCar, setSearchCar] = useState('');

  // Add Car modal/form state
  const [showAddCarModal, setShowAddCarModal] = useState(false);
  const [newCar, setNewCar] = useState<Omit<FleetCarConfig, 'id'>>({
    unitNumber: '',
    vehicleTypeId: settings.vehicles[0]?.id || 'standard',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    color: 'White',
    licensePlate: '',
    vin: '',
    assignedDriverName: '',
    insurancePolicy: '',
    insuranceExpiry: '',
    mileage: 0,
    status: 'active',
    maintenanceHistory: [],
  });

  // Maintenance Log Modal state
  const [selectedCarForMaintenance, setSelectedCarForMaintenance] = useState<FleetCarConfig | null>(null);
  const [newMaintenanceRecord, setNewMaintenanceRecord] = useState<Omit<MaintenanceRecord, 'id'>>({
    date: new Date().toISOString().slice(0, 10),
    description: '',
    cost: 0,
    odometer: 0,
    performedBy: '',
  });

  // Helpers
  const getVehicleTypeName = (typeId: string) => {
    const v = settings.vehicles.find((tier) => tier.id === typeId);
    return v ? v.name : typeId;
  };

  const handleAddNewCar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCar.unitNumber.trim() || !newCar.make.trim() || !newCar.model.trim()) {
      alert('Unit Number, Make, and Model are required.');
      return;
    }

    const carToAdd: FleetCarConfig = {
      ...newCar,
      id: `fleet-${Date.now().toString(36)}`,
      unitNumber: newCar.unitNumber.trim(),
      make: newCar.make.trim(),
      model: newCar.model.trim(),
      year: Number(newCar.year) || new Date().getFullYear(),
      mileage: Number(newCar.mileage) || 0,
      maintenanceHistory: [],
    };

    setFleet((prev) => [carToAdd, ...prev]);
    setShowAddCarModal(false);
    setNewCar({
      unitNumber: '',
      vehicleTypeId: settings.vehicles[0]?.id || 'standard',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      color: 'White',
      licensePlate: '',
      vin: '',
      assignedDriverName: '',
      insurancePolicy: '',
      insuranceExpiry: '',
      mileage: 0,
      status: 'active',
      maintenanceHistory: [],
    });
  };

  const handleDeleteCar = (carId: string) => {
    if (confirm('Are you sure you want to remove this car from the fleet?')) {
      setFleet((prev) => prev.filter((c) => c.id !== carId));
    }
  };

  const handleUpdateCar = (carId: string, updates: Partial<FleetCarConfig>) => {
    setFleet((prev) =>
      prev.map((c) => (c.id === carId ? { ...c, ...updates } : c))
    );
  };

  const handleAddMaintenanceRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCarForMaintenance || !newMaintenanceRecord.description.trim()) return;

    const record: MaintenanceRecord = {
      ...newMaintenanceRecord,
      id: `m-${Date.now().toString(36)}`,
      cost: Number(newMaintenanceRecord.cost) || 0,
      odometer: Number(newMaintenanceRecord.odometer) || selectedCarForMaintenance.mileage,
    };

    const updatedHistory = [record, ...(selectedCarForMaintenance.maintenanceHistory || [])];
    const newMileage = Math.max(selectedCarForMaintenance.mileage, record.odometer || 0);

    handleUpdateCar(selectedCarForMaintenance.id, {
      maintenanceHistory: updatedHistory,
      mileage: newMileage,
    });

    setSelectedCarForMaintenance((prev) =>
      prev ? { ...prev, maintenanceHistory: updatedHistory, mileage: newMileage } : null
    );

    setNewMaintenanceRecord({
      date: new Date().toISOString().slice(0, 10),
      description: '',
      cost: 0,
      odometer: newMileage,
      performedBy: '',
    });
  };

  const handleSaveFleet = async () => {
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      setSaveError(null);
      await onSave({ fleet });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save fleet inventory.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered cars
  const filteredFleet = fleet.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (typeFilter !== 'all' && c.vehicleTypeId !== typeFilter) return false;
    if (searchCar.trim()) {
      const q = searchCar.toLowerCase();
      const matchUnit = c.unitNumber.toLowerCase().includes(q);
      const matchMake = c.make.toLowerCase().includes(q);
      const matchModel = c.model.toLowerCase().includes(q);
      const matchPlate = c.licensePlate.toLowerCase().includes(q);
      const matchDriver = c.assignedDriverName?.toLowerCase().includes(q);
      const matchVin = c.vin.toLowerCase().includes(q);
      if (!matchUnit && !matchMake && !matchModel && !matchPlate && !matchDriver && !matchVin) {
        return false;
      }
    }
    return true;
  });

  const activeCount = fleet.filter((c) => c.status === 'active').length;
  const maintenanceCount = fleet.filter((c) => c.status === 'maintenance').length;
  const avgMileage =
    fleet.length > 0 ? Math.round(fleet.reduce((sum, c) => sum + (c.mileage || 0), 0) / fleet.length) : 0;

  return (
    <div className="space-y-6">
      {saveSuccess && (
        <Alert variant="success" title="Fleet Inventory Saved">
          Physical cars, assignments, mileage, and maintenance logs successfully synced.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Save Failed">
          {saveError}
        </Alert>
      )}

      {/* Header and Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Total Fleet</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{fleet.length} <span className="text-xs font-semibold text-slate-500">vehicles</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Active in Service</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{activeCount} <span className="text-xs font-semibold text-slate-500">ready</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">In Maintenance</span>
          <div className="text-2xl font-black text-amber-600 mt-1">{maintenanceCount} <span className="text-xs font-semibold text-slate-500">shop</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Avg Fleet Odometer</span>
          <div className="text-2xl font-black text-blue-600 mt-1">{avgMileage.toLocaleString()} <span className="text-xs font-semibold text-slate-500">mi</span></div>
        </div>
      </div>

      {/* Control bar: Filters & Add Car */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <div className="relative">
            <Input
              placeholder="Search unit #, make, plate, VIN..."
              value={searchCar}
              onChange={(e) => setSearchCar(e.target.value)}
              className="w-56 h-9 text-xs pl-3"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="maintenance">In Maintenance</option>
            <option value="out_of_service">Out of Service</option>
            <option value="inspecting">Inspecting</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
          >
            <option value="all">All Vehicle Types</option>
            {settings.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setShowAddCarModal(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 font-bold"
          >
            <PlusIcon className="w-4 h-4" />
            Add Fleet Car
          </Button>
        </div>
      </div>

      {/* Add Car Modal */}
      {showAddCarModal && (
        <Card className="border-blue-200 bg-blue-50/20 shadow-sm animate-in fade-in duration-200">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-blue-900">Add New Fleet Car</CardTitle>
            <CardDescription className="text-xs text-slate-600">
              Register a physical vehicle asset, assign its vehicle type class, and enter registration details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddNewCar} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Unit / Car Number <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Cab #110"
                    value={newCar.unitNumber}
                    onChange={(e) => setNewCar({ ...newCar, unitNumber: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vehicle Type Class <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
                    value={newCar.vehicleTypeId}
                    onChange={(e) => setNewCar({ ...newCar, vehicleTypeId: e.target.value })}
                  >
                    {settings.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} (Tier {v.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Make <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Toyota"
                    value={newCar.make}
                    onChange={(e) => setNewCar({ ...newCar, make: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Model <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Camry Hybrid"
                    value={newCar.model}
                    onChange={(e) => setNewCar({ ...newCar, model: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Year</label>
                  <Input
                    type="number"
                    value={newCar.year}
                    onChange={(e) => setNewCar({ ...newCar, year: parseInt(e.target.value) || 2024 })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Color</label>
                  <Input
                    placeholder="e.g. Silver, Black"
                    value={newCar.color}
                    onChange={(e) => setNewCar({ ...newCar, color: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">License Plate</label>
                  <Input
                    placeholder="e.g. MO-7TX91"
                    value={newCar.licensePlate}
                    onChange={(e) => setNewCar({ ...newCar, licensePlate: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">VIN (Vehicle ID Number)</label>
                  <Input
                    placeholder="17-character VIN"
                    value={newCar.vin}
                    onChange={(e) => setNewCar({ ...newCar, vin: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Driver</label>
                  <Input
                    placeholder="e.g. Mike T."
                    value={newCar.assignedDriverName || ''}
                    onChange={(e) => setNewCar({ ...newCar, assignedDriverName: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Current Mileage</label>
                  <Input
                    type="number"
                    placeholder="e.g. 45000"
                    value={newCar.mileage}
                    onChange={(e) => setNewCar({ ...newCar, mileage: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Insurance Policy</label>
                  <Input
                    placeholder="e.g. ST-902348-COMM"
                    value={newCar.insurancePolicy || ''}
                    onChange={(e) => setNewCar({ ...newCar, insurancePolicy: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                  <select
                    className="w-full h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
                    value={newCar.status}
                    onChange={(e) => setNewCar({ ...newCar, status: e.target.value as any })}
                  >
                    <option value="active">Active</option>
                    <option value="maintenance">In Maintenance</option>
                    <option value="out_of_service">Out of Service</option>
                    <option value="inspecting">Inspecting</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddCarModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" className="bg-blue-600 hover:bg-blue-700 font-bold">
                  Save Car to Fleet
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Fleet Cars List */}
      <div className="space-y-4">
        {filteredFleet.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-500">
            <span className="text-3xl block mb-2">🚕</span>
            <p className="font-bold text-slate-800">No fleet cars match your criteria.</p>
            <p className="text-xs text-slate-400 mt-1">Try clearing filters or adding a new car to the fleet.</p>
          </div>
        ) : (
          filteredFleet.map((car) => {
            const historyCount = car.maintenanceHistory?.length || 0;
            return (
              <div
                key={car.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-sm transition-all p-5 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-black text-sm shadow-xs">
                      🚕
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-extrabold text-slate-900">{car.unitNumber}</h4>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {getVehicleTypeName(car.vehicleTypeId)}
                        </span>
                        {car.status === 'active' && <Badge variant="success">Active</Badge>}
                        {car.status === 'maintenance' && <Badge variant="warning">In Maintenance</Badge>}
                        {car.status === 'out_of_service' && <Badge variant="neutral">Out of Service</Badge>}
                        {car.status === 'inspecting' && <Badge variant="info">Inspecting</Badge>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {car.year} {car.make} {car.model} • <span className="font-mono text-slate-700">{car.color}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={car.status}
                      onChange={(e) => handleUpdateCar(car.id, { status: e.target.value as any })}
                      className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
                    >
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="out_of_service">Out of Service</option>
                      <option value="inspecting">Inspecting</option>
                    </select>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedCarForMaintenance(car);
                        setNewMaintenanceRecord({
                          date: new Date().toISOString().slice(0, 10),
                          description: '',
                          cost: 0,
                          odometer: car.mileage,
                          performedBy: '',
                        });
                      }}
                      className="text-xs h-8 flex items-center gap-1.5"
                    >
                      <span>🔧 Service Log</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                        {historyCount}
                      </span>
                    </Button>

                    <button
                      type="button"
                      onClick={() => handleDeleteCar(car.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      title="Delete car from fleet"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Grid of Car Specs and Tracking */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">License Plate</span>
                    <span className="font-mono font-bold text-slate-900 mt-0.5 block truncate">
                      {car.licensePlate || 'N/A'}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Odometer</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Input
                        type="number"
                        value={car.mileage}
                        onChange={(e) => handleUpdateCar(car.id, { mileage: parseInt(e.target.value) || 0 })}
                        className="h-6 text-xs font-mono font-bold w-20 px-1"
                      />
                      <span className="text-[10px] text-slate-500 font-bold">mi</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Assigned Driver</span>
                    <Input
                      placeholder="Unassigned"
                      value={car.assignedDriverName || ''}
                      onChange={(e) => handleUpdateCar(car.id, { assignedDriverName: e.target.value })}
                      className="h-6 text-xs font-semibold mt-0.5 px-1"
                    />
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">VIN</span>
                    <span className="font-mono text-[11px] text-slate-700 mt-0.5 block truncate" title={car.vin}>
                      {car.vin || 'N/A'}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Insurance</span>
                    <span className="text-[11px] font-semibold text-slate-700 mt-0.5 block truncate" title={car.insurancePolicy}>
                      {car.insurancePolicy || 'Commercial Policy'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Maintenance History Modal */}
      {selectedCarForMaintenance && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-100 text-blue-700 text-lg">🔧</span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Maintenance History: {selectedCarForMaintenance.unitNumber}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedCarForMaintenance.year} {selectedCarForMaintenance.make} {selectedCarForMaintenance.model} (Plate: {selectedCarForMaintenance.licensePlate})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCarForMaintenance(null)}
                className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Content: Form to add record + list of records */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Add record form */}
              <form onSubmit={handleAddMaintenanceRecord} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide block">
                  + Log Service or Maintenance Event
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Date</label>
                    <Input
                      type="date"
                      value={newMaintenanceRecord.date}
                      onChange={(e) => setNewMaintenanceRecord({ ...newMaintenanceRecord, date: e.target.value })}
                      required
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Odometer (mi)</label>
                    <Input
                      type="number"
                      value={newMaintenanceRecord.odometer}
                      onChange={(e) => setNewMaintenanceRecord({ ...newMaintenanceRecord, odometer: parseInt(e.target.value) || 0 })}
                      required
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Cost ($)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newMaintenanceRecord.cost}
                      onChange={(e) => setNewMaintenanceRecord({ ...newMaintenanceRecord, cost: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Service Performed / Description</label>
                    <Input
                      placeholder="e.g. Oil change, brake pads, tire replacement..."
                      value={newMaintenanceRecord.description}
                      onChange={(e) => setNewMaintenanceRecord({ ...newMaintenanceRecord, description: e.target.value })}
                      required
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Shop / Technician</label>
                    <Input
                      placeholder="e.g. Chesterfield Auto Service"
                      value={newMaintenanceRecord.performedBy || ''}
                      onChange={(e) => setNewMaintenanceRecord({ ...newMaintenanceRecord, performedBy: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button type="submit" variant="primary" size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs font-bold">
                    Add Record
                  </Button>
                </div>
              </form>

              {/* Maintenance List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Past Service Logs</span>
                {(!selectedCarForMaintenance.maintenanceHistory || selectedCarForMaintenance.maintenanceHistory.length === 0) ? (
                  <p className="text-xs text-slate-400 italic py-3 text-center">No service records logged yet for this vehicle.</p>
                ) : (
                  selectedCarForMaintenance.maintenanceHistory.map((rec) => (
                    <div key={rec.id} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{rec.description}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          <span>📅 {rec.date}</span>
                          {rec.odometer && <span className="ml-2">🛣️ {rec.odometer.toLocaleString()} mi</span>}
                          {rec.performedBy && <span className="ml-2">🏢 {rec.performedBy}</span>}
                        </div>
                      </div>
                      {rec.cost !== undefined && (
                        <div className="font-mono font-bold text-slate-900 text-sm">
                          ${rec.cost.toFixed(2)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedCarForMaintenance(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Save Actions Bar */}
      <div className="sticky bottom-4 bg-white/95 backdrop-blur-sm p-4 rounded-2xl border border-slate-200 shadow-lg flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-amber-500" />
          <span className="text-xs text-slate-600">
            {fleet.length} fleet cars registered. Updates sync to dispatch operations and fleet database.
          </span>
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleSaveFleet}
          disabled={isSaving || isLoading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 shadow-md font-bold px-6"
        >
          {isSaving ? <CheckIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
          {isSaving ? 'Saving...' : 'Save Fleet Inventory'}
        </Button>
      </div>
    </div>
  );
}
