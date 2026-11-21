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
  HistoryIcon,
  EditIcon,
  WrenchIcon,
  BanIcon,
  CalendarIcon,
  BuildingIcon,
  ActivityIcon,
  SpinnerIcon,
} from '../../ui/Icons';
import { ShiftHistoryModal } from './ShiftHistoryModal';
import { DEFAULT_APP_SETTINGS } from '../../../core/services/config/admin-config.service';
import { getFleetService } from '../../../core/services/fleet/fleet.service';
import { getUniversalGovernanceService } from '../../../core/services/governance/universal-governance.service';
import { UniversalArchiveDrawer, ArchiveBoxIcon } from './UniversalArchiveDrawer';
import { AdminSlideOverDrawer } from './AdminSlideOverDrawer';
import { VehicleImagePicker } from './vehicles/VehicleImagePicker';


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
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [isArchiveDrawerOpen, setIsArchiveDrawerOpen] = useState(false);

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
    imageUrl: '',
  });

  // Edit Car modal state
  const [editingCar, setEditingCar] = useState<FleetCarConfig | null>(null);

  // Maintenance Log Modal state
  const [selectedCarForMaintenance, setSelectedCarForMaintenance] = useState<FleetCarConfig | null>(null);
  const [newMaintenanceRecord, setNewMaintenanceRecord] = useState<Omit<MaintenanceRecord, 'id'>>({
    date: new Date().toISOString().slice(0, 10),
    description: '',
    cost: 0,
    odometer: 0,
    performedBy: '',
  });

  // Shift History Modal state
  const [showShiftHistory, setShowShiftHistory] = useState(false);
  const [shiftHistoryVehicleId, setShiftHistoryVehicleId] = useState<string | undefined>(undefined);
  const [groundingCarId, setGroundingCarId] = useState<string | null>(null);
  const [groundReasonDraft, setGroundReasonDraft] = useState('');

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
      getFleetService().deleteAsset(carId).catch((err) => console.warn('[AdminFleetTab] Fleet delete error:', err));
    }
  };

  const handleUpdateCar = (carId: string, updates: Partial<FleetCarConfig>) => {
    setFleet((prev) =>
      prev.map((c) => (c.id === carId ? { ...c, ...updates } : c))
    );
  };

  const handleSaveEditingCar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCar) return;
    if (!editingCar.unitNumber.trim() || !editingCar.make.trim() || !editingCar.model.trim()) {
      alert('Unit Number, Make, and Model are required.');
      return;
    }

    const updatedCar: FleetCarConfig = {
      ...editingCar,
      unitNumber: editingCar.unitNumber.trim(),
      make: editingCar.make.trim(),
      model: editingCar.model.trim(),
      year: Number(editingCar.year) || new Date().getFullYear(),
      mileage: Number(editingCar.mileage) || 0,
    };

    handleUpdateCar(updatedCar.id, updatedCar);
    getFleetService().saveAsset({
      id: updatedCar.id,
      unitNumber: updatedCar.unitNumber,
      vehicleTypeId: updatedCar.vehicleTypeId,
      make: updatedCar.make,
      model: updatedCar.model,
      year: updatedCar.year,
      color: updatedCar.color,
      licensePlate: updatedCar.licensePlate,
      vin: updatedCar.vin,
      insurancePolicy: updatedCar.insurancePolicy,
      insuranceExpiry: updatedCar.insuranceExpiry,
      mileage: updatedCar.mileage,
      status: updatedCar.status,
      imageUrl: updatedCar.imageUrl,
      assignedDriverName: updatedCar.assignedDriverName,
      maintenanceHistory: updatedCar.maintenanceHistory,
      isArchived: updatedCar.isArchived,
      isBlacklisted: updatedCar.isBlacklisted,
      blacklistReason: updatedCar.blacklistReason,
    }).catch((err) => console.warn('[AdminFleetTab] FleetService saveAsset error:', err));

    setEditingCar(null);
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
      prev
        ? {
            ...prev,
            maintenanceHistory: updatedHistory,
            mileage: newMileage,
          }
        : null
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

      // Sync physical assets to Firestore collection /fleet
      const fleetService = getFleetService();
      for (const car of fleet) {
        fleetService
          .saveAsset({
            id: car.id,
            unitNumber: car.unitNumber,
            vehicleTypeId: car.vehicleTypeId,
            make: car.make,
            model: car.model,
            year: car.year,
            color: car.color,
            licensePlate: car.licensePlate,
            vin: car.vin,
            assignedDriverName: car.assignedDriverName,
            insurancePolicy: car.insurancePolicy || '',
            insuranceExpiry: car.insuranceExpiry || '',
            mileage: car.mileage,
            status: car.status as any,
            imageUrl: car.imageUrl,
            maintenanceHistory: car.maintenanceHistory as any,
          })
          .catch((err) => console.warn('[AdminFleetTab] FleetService sync error:', err));
      }

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block truncate">Total Fleet</span>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tabular-nums">{fleet.length} <span className="text-[11px] sm:text-xs font-semibold text-slate-500">cars</span></div>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block truncate">Active</span>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-1 tabular-nums">{activeCount} <span className="text-[11px] sm:text-xs font-semibold text-slate-500">ready</span></div>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block truncate">Maintenance</span>
          <div className="text-xl sm:text-2xl font-black text-amber-600 mt-1 tabular-nums">{maintenanceCount} <span className="text-[11px] sm:text-xs font-semibold text-slate-500">shop</span></div>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block truncate">Avg Odometer</span>
          <div className="text-xl sm:text-2xl font-black text-blue-600 mt-1 tabular-nums truncate">{avgMileage.toLocaleString()} <span className="text-[11px] sm:text-xs font-semibold text-slate-500">mi</span></div>
        </div>
      </div>

      {/* Control bar: Filters & Add Car */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto">
          <div className="relative w-full sm:w-56">
            <Input
              placeholder="Search unit #, make, plate, VIN..."
              value={searchCar}
              onChange={(e) => setSearchCar(e.target.value)}
              className="w-full h-9 text-xs pl-3"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-2.5 sm:px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 w-full sm:w-auto"
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
              className="h-9 px-2.5 sm:px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 w-full sm:w-auto"
            >
              <option value="all">All Classes</option>
              {settings.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setShiftHistoryVehicleId(undefined);
              setShowShiftHistory(true);
            }}
            className="flex items-center justify-center gap-1.5 border-slate-300 font-bold whitespace-nowrap px-3 text-slate-700 hover:bg-slate-50"
          >
            <HistoryIcon className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Shift Search</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setShowAddCarModal(true)}
            className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 font-bold whitespace-nowrap px-3"
          >
            <PlusIcon className="w-4 h-4 shrink-0" />
            <span>Add Fleet Car</span>
          </Button>
        </div>
      </div>

      {/* Add Fleet Car Slide-Over Drawer */}
      <AdminSlideOverDrawer
        isOpen={showAddCarModal}
        onClose={() => setShowAddCarModal(false)}
        title="Add Fleet Car"
        subtitle="Register a physical vehicle asset, assign its class, and enter registration details"
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowAddCarModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-fleet-car-form"
              variant="primary"
              size="md"
              leftIcon={<PlusIcon className="w-4 h-4" />}
              className="font-bold"
            >
              Add Fleet Car
            </Button>
          </>
        }
      >
        <form id="add-fleet-car-form" onSubmit={handleAddNewCar} className="space-y-5">
          <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <CarIcon className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                Vehicle Identity &amp; Class
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Unit / Car Number <span className="text-rose-500">*</span>
                </label>
                <Input
                  placeholder="e.g. Cab #110"
                  value={newCar.unitNumber}
                  onChange={(e) => setNewCar({ ...newCar, unitNumber: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vehicle Type Class <span className="text-rose-500">*</span>
                </label>
                <select
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Make <span className="text-rose-500">*</span>
                </label>
                <Input
                  placeholder="e.g. Toyota"
                  value={newCar.make}
                  onChange={(e) => setNewCar({ ...newCar, make: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Model <span className="text-rose-500">*</span>
                </label>
                <Input
                  placeholder="e.g. Camry Hybrid"
                  value={newCar.model}
                  onChange={(e) => setNewCar({ ...newCar, model: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Year</label>
                <Input
                  type="number"
                  value={newCar.year}
                  onChange={(e) => setNewCar({ ...newCar, year: parseInt(e.target.value) || 2024 })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Color</label>
                <Input
                  placeholder="e.g. Silver, Black"
                  value={newCar.color}
                  onChange={(e) => setNewCar({ ...newCar, color: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
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
          </section>

          <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <UserIcon className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                Registration, Insurance &amp; Assignment
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">License Plate</label>
                <Input
                  placeholder="e.g. MO-7TX91"
                  value={newCar.licensePlate}
                  onChange={(e) => setNewCar({ ...newCar, licensePlate: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">VIN</label>
                <Input
                  placeholder="17-character VIN"
                  value={newCar.vin}
                  onChange={(e) => setNewCar({ ...newCar, vin: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Driver</label>
                <Input
                  placeholder="e.g. Mike T."
                  value={newCar.assignedDriverName || ''}
                  onChange={(e) => setNewCar({ ...newCar, assignedDriverName: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Odometer (mi)</label>
                <Input
                  type="number"
                  placeholder="e.g. 45000"
                  value={newCar.mileage}
                  onChange={(e) => setNewCar({ ...newCar, mileage: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Insurance Policy</label>
                <Input
                  placeholder="e.g. ST-902348-COMM"
                  value={newCar.insurancePolicy || ''}
                  onChange={(e) => setNewCar({ ...newCar, insurancePolicy: e.target.value })}
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200/90 p-4">
            <VehicleImagePicker
              value={newCar.imageUrl || ''}
              onChange={(url: string) => setNewCar({ ...newCar, imageUrl: url })}
              allowClassImageFallback={true}
              classImageUrl={settings.vehicles.find((v) => v.id === newCar.vehicleTypeId)?.imageUrl}
              helperText="Optional vehicle image asset. Click 'Use Class Photo' to copy the assigned vehicle class image."
            />
          </section>
        </form>
      </AdminSlideOverDrawer>

      {/* Fleet Cars List */}
      <div className="space-y-4">
        {filteredFleet.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-500">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <CarIcon className="w-6 h-6" />
            </div>
            <p className="font-bold text-slate-800">No fleet cars match your criteria.</p>
            <p className="text-xs text-slate-400 mt-1">Try clearing filters or adding a new car to the fleet.</p>
          </div>
        ) : (
          filteredFleet.map((car) => {
            const historyCount = car.maintenanceHistory?.length || 0;
            return (
              <div
                key={car.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-sm transition-all p-3.5 sm:p-5 space-y-3.5 sm:space-y-4"
              >
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3 min-w-0">
                    {car.imageUrl ? (
                      <div className="w-14 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200 shadow-2xs">
                        <img
                          src={car.imageUrl}
                          alt={car.unitNumber}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center shadow-xs shrink-0">
                        <CarIcon className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <h4 className="text-sm sm:text-base font-extrabold text-slate-900">{car.unitNumber}</h4>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {getVehicleTypeName(car.vehicleTypeId)}
                        </span>
                        {car.status === 'active' && !car.isBlacklisted && <Badge variant="success">Active</Badge>}
                        {car.status === 'maintenance' && !car.isBlacklisted && <Badge variant="warning">In Maintenance</Badge>}
                        {car.status === 'out_of_service' && !car.isBlacklisted && <Badge variant="neutral">Out of Service</Badge>}
                        {car.status === 'inspecting' && !car.isBlacklisted && <Badge variant="info">Inspecting</Badge>}
                        {car.isBlacklisted && <Badge variant="error">GROUNDED</Badge>}
                        {car.isArchived && <Badge variant="neutral">ARCHIVED</Badge>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {car.year} {car.make} {car.model} · <span className="font-mono text-slate-700">{car.color}</span>
                        {car.blacklistReason && <span className="text-rose-600 font-bold ml-2">Reason: {car.blacklistReason}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
                        const isCurrentlyBlacklisted = !!car.isBlacklisted;
                        if (!isCurrentlyBlacklisted) {
                          if (groundingCarId === car.id) {
                            setGroundingCarId(null);
                            setGroundReasonDraft('');
                          } else {
                            setGroundingCarId(car.id);
                            setGroundReasonDraft('');
                          }
                        } else {
                          handleUpdateCar(car.id, {
                            isBlacklisted: false,
                            blacklistReason: undefined,
                            groundedReason: undefined,
                            status: 'active',
                          });
                        }
                      }}
                      className={`text-xs h-8 flex items-center gap-1.5 cursor-pointer ${
                        car.isBlacklisted
                          ? 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                          : 'text-rose-600 border-rose-200 hover:bg-rose-50'
                      }`}
                    >
                      {car.isBlacklisted ? (
                        <>
                          <CheckIcon className="w-3.5 h-3.5" />
                          <span>Restore Cab</span>
                        </>
                      ) : (
                        <>
                          <BanIcon className="w-3.5 h-3.5" />
                          <span>Ground / Blacklist</span>
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingCar({ ...car })}
                      className="text-xs h-8 flex items-center gap-1.5 border-blue-200 text-blue-700 bg-blue-50/60 hover:bg-blue-100 font-semibold"
                      title="Edit vehicle details, driver, status, and photo"
                    >
                      <EditIcon className="w-3.5 h-3.5" />
                      <span>Edit Vehicle</span>
                    </Button>

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
                      <WrenchIcon className="w-3.5 h-3.5 text-slate-500" />
                      <span>Service Log</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                        {historyCount}
                      </span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShiftHistoryVehicleId(car.id);
                        setShowShiftHistory(true);
                      }}
                      className="text-xs h-8 flex items-center gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                    >
                      <HistoryIcon className="w-3.5 h-3.5" />
                      <span>Shift History</span>
                    </Button>

                    <button
                      type="button"
                      onClick={() => handleDeleteCar(car.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                      title="Delete car from fleet"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {groundingCarId === car.id && !car.isBlacklisted && (
                  <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 flex flex-col sm:flex-row sm:items-center gap-2 animate-in fade-in duration-150">
                    <input
                      type="text"
                      value={groundReasonDraft}
                      onChange={(e) => setGroundReasonDraft(e.target.value)}
                      placeholder={`Reason to ground / blacklist ${car.unitNumber}...`}
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-rose-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <div className="flex items-center justify-end gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setGroundingCarId(null);
                          setGroundReasonDraft('');
                        }}
                        className="text-xs h-8 cursor-pointer"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          const reason = groundReasonDraft.trim() || 'Grounded by Fleet Admin';
                          handleUpdateCar(car.id, {
                            isBlacklisted: true,
                            blacklistReason: reason,
                            groundedReason: reason,
                            status: 'out_of_service',
                          });
                          setGroundingCarId(null);
                          setGroundReasonDraft('');
                        }}
                        className="text-xs h-8 bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                      >
                        Confirm Ground
                      </Button>
                    </div>
                  </div>
                )}

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

      {/* Service Log Slide-Over Drawer */}
      <AdminSlideOverDrawer
        isOpen={Boolean(selectedCarForMaintenance)}
        onClose={() => setSelectedCarForMaintenance(null)}
        title={
          selectedCarForMaintenance
            ? `Service Log: ${selectedCarForMaintenance.unitNumber}`
            : 'Service Log'
        }
        subtitle={
          selectedCarForMaintenance
            ? `${selectedCarForMaintenance.year} ${selectedCarForMaintenance.make} ${selectedCarForMaintenance.model} · Plate ${selectedCarForMaintenance.licensePlate || 'N/A'}`
            : ''
        }
        size="lg"
        footer={
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => setSelectedCarForMaintenance(null)}
          >
            Close
          </Button>
        }
      >
        {selectedCarForMaintenance && (
          <div className="space-y-5">
            <form
              onSubmit={handleAddMaintenanceRecord}
              className="p-4 rounded-2xl bg-white border border-slate-200/90 space-y-3.5"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <WrenchIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Log Service Event
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <Input
                    type="date"
                    value={newMaintenanceRecord.date}
                    onChange={(e) =>
                      setNewMaintenanceRecord({ ...newMaintenanceRecord, date: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Odometer (mi)
                  </label>
                  <Input
                    type="number"
                    value={newMaintenanceRecord.odometer}
                    onChange={(e) =>
                      setNewMaintenanceRecord({
                        ...newMaintenanceRecord,
                        odometer: parseInt(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cost ($)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newMaintenanceRecord.cost}
                    onChange={(e) =>
                      setNewMaintenanceRecord({
                        ...newMaintenanceRecord,
                        cost: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Service Performed
                  </label>
                  <Input
                    placeholder="e.g. Oil change, brake pads, tires..."
                    value={newMaintenanceRecord.description}
                    onChange={(e) =>
                      setNewMaintenanceRecord({
                        ...newMaintenanceRecord,
                        description: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Shop / Technician
                  </label>
                  <Input
                    placeholder="e.g. Chesterfield Auto Service"
                    value={newMaintenanceRecord.performedBy || ''}
                    onChange={(e) =>
                      setNewMaintenanceRecord({
                        ...newMaintenanceRecord,
                        performedBy: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
                  className="font-bold"
                >
                  Add Service Record
                </Button>
              </div>
            </form>

            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-2.5">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Past Service Logs
              </h3>
              {!selectedCarForMaintenance.maintenanceHistory ||
              selectedCarForMaintenance.maintenanceHistory.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center">
                  No service records logged yet for this vehicle.
                </p>
              ) : (
                selectedCarForMaintenance.maintenanceHistory.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900">{rec.description}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3 text-slate-400" />
                          {rec.date}
                        </span>
                        {rec.odometer && (
                          <span className="inline-flex items-center gap-1">
                            <ActivityIcon className="w-3 h-3 text-slate-400" />
                            {rec.odometer.toLocaleString()} mi
                          </span>
                        )}
                        {rec.performedBy && (
                          <span className="inline-flex items-center gap-1">
                            <BuildingIcon className="w-3 h-3 text-slate-400" />
                            {rec.performedBy}
                          </span>
                        )}
                      </div>
                    </div>
                    {rec.cost !== undefined && (
                      <div className="font-mono font-bold text-slate-900 text-sm shrink-0">
                        ${rec.cost.toFixed(2)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </section>
          </div>
        )}
      </AdminSlideOverDrawer>

      {/* Floating Save Actions Bar */}
      <div className="sticky bottom-16 lg:bottom-4 bg-white/95 backdrop-blur-sm p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <SparklesIcon className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-xs text-slate-600">
            {fleet.length} fleet cars registered. Syncs to dispatch and fleet database.
          </span>
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleSaveFleet}
          disabled={isSaving || isLoading}
          className="w-full sm:w-auto justify-center flex items-center gap-2 bg-blue-600 hover:bg-blue-700 shadow-md font-bold px-6 shrink-0"
        >
          {isSaving ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
          {isSaving ? 'Saving...' : 'Save Fleet Inventory'}
        </Button>
      </div>

      {/* Edit Vehicle Slide-Over Drawer */}
      <AdminSlideOverDrawer
        isOpen={Boolean(editingCar)}
        onClose={() => setEditingCar(null)}
        title={editingCar ? `Edit Vehicle: ${editingCar.unitNumber}` : 'Edit Vehicle'}
        subtitle="Modify vehicle specifications, driver assignment, service status, and photo"
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setEditingCar(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-fleet-car-form"
              variant="primary"
              size="md"
              leftIcon={<CheckIcon className="w-4 h-4" />}
              className="font-bold"
            >
              Save Vehicle
            </Button>
          </>
        }
      >
        {editingCar && (
          <form id="edit-fleet-car-form" onSubmit={handleSaveEditingCar} className="space-y-5">
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <CarIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Vehicle Identity &amp; Class
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unit / Cab Number <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="e.g. CAB-104"
                    value={editingCar.unitNumber}
                    onChange={(e) => setEditingCar({ ...editingCar, unitNumber: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Class</label>
                  <select
                    className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
                    value={editingCar.vehicleTypeId}
                    onChange={(e) => setEditingCar({ ...editingCar, vehicleTypeId: e.target.value })}
                  >
                    {settings.vehicles.map((tier) => (
                      <option key={tier.id} value={tier.id}>
                        {tier.name} ({tier.badge || tier.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
                    value={editingCar.status}
                    onChange={(e) => setEditingCar({ ...editingCar, status: e.target.value as any })}
                  >
                    <option value="active">Active</option>
                    <option value="maintenance">In Maintenance</option>
                    <option value="out_of_service">Out of Service</option>
                    <option value="inspecting">Inspecting</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Make <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="e.g. Toyota"
                    value={editingCar.make}
                    onChange={(e) => setEditingCar({ ...editingCar, make: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Model <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="e.g. Sienna"
                    value={editingCar.model}
                    onChange={(e) => setEditingCar({ ...editingCar, model: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Year</label>
                  <Input
                    type="number"
                    value={editingCar.year}
                    onChange={(e) => setEditingCar({ ...editingCar, year: Number(e.target.value) || 2024 })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Color</label>
                  <Input
                    placeholder="e.g. Silver"
                    value={editingCar.color}
                    onChange={(e) => setEditingCar({ ...editingCar, color: e.target.value })}
                  />
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <UserIcon className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Registration, Insurance &amp; Assignment
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">License Plate</label>
                  <Input
                    placeholder="e.g. 7XYZ99"
                    value={editingCar.licensePlate}
                    onChange={(e) => setEditingCar({ ...editingCar, licensePlate: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">VIN Number</label>
                  <Input
                    placeholder="17-character VIN"
                    value={editingCar.vin}
                    onChange={(e) => setEditingCar({ ...editingCar, vin: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Odometer (mi)</label>
                  <Input
                    type="number"
                    value={editingCar.mileage}
                    onChange={(e) => setEditingCar({ ...editingCar, mileage: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Driver</label>
                  <Input
                    placeholder="Driver name"
                    value={editingCar.assignedDriverName || ''}
                    onChange={(e) => setEditingCar({ ...editingCar, assignedDriverName: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Insurance Policy</label>
                  <Input
                    placeholder="Policy number"
                    value={editingCar.insurancePolicy || ''}
                    onChange={(e) => setEditingCar({ ...editingCar, insurancePolicy: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Insurance Expiry</label>
                  <Input
                    type="date"
                    value={editingCar.insuranceExpiry || ''}
                    onChange={(e) => setEditingCar({ ...editingCar, insuranceExpiry: e.target.value })}
                  />
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200/90 p-4">
              <VehicleImagePicker
                value={editingCar.imageUrl || ''}
                onChange={(url: string) => setEditingCar({ ...editingCar, imageUrl: url })}
                allowClassImageFallback={true}
                classImageUrl={settings.vehicles.find((v) => v.id === editingCar.vehicleTypeId)?.imageUrl}
                helperText="Optional vehicle image asset. You can pick a stock preset, enter a custom URL, or click 'Use Class Photo' to copy from this car's class."
              />
            </section>
          </form>
        )}
      </AdminSlideOverDrawer>

      {/* Shift History Modal */}
      {showShiftHistory && (
        <ShiftHistoryModal 
          vehicleId={shiftHistoryVehicleId} 
          onClose={() => {
            setShowShiftHistory(false);
            setShiftHistoryVehicleId(undefined);
          }} 
        />
      )}
    </div>
  );
}
