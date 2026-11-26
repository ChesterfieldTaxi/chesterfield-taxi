import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../../ui/Badge';
import { Select } from '../../../ui/Select';
import {
  AlertTriangleIcon,
  BoltIcon,
  CarIcon,
  CheckIcon,
  MapPinIcon,
  SparklesIcon,
  StarIcon,
} from '../../../ui/Icons';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import {
  evaluateAutoDispatchCandidates,
  type AutoDispatchDriverInput,
} from '../../../../core/services/dispatch/auto-dispatch-ranking';
import { getDriverService } from '../../../../core/services/driver.service';
import { getOperatorService } from '../../../../core/services/operator.service';
import type {
  DispatchAutomationConfig,
  FleetCarConfig,
  VehicleTierConfig,
} from '../../../../core/types/config';
import type { GeoPoint, Trip } from '../../../../core/types/trip';
import type { ZoneGeofence } from '../../../../core/types/zone';

export interface AdminAutoDispatchSimulatorProps {
  config: DispatchAutomationConfig;
  zones: ZoneGeofence[];
}

const SIM_FIXED_BASE_MS = 1_795_375_200_000; // Deterministic SSR baseline timestamp

const PICKUP_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  address: string;
  coordinates: GeoPoint;
}> = [
  {
    id: 'chesterfield_valley',
    label: 'Chesterfield Valley (Zone)',
    address: '17057 N Outer 40 Rd, Chesterfield, MO 63005',
    coordinates: { lat: 38.6631, lng: -90.5771 },
  },
  {
    id: 'stl_airport',
    label: 'STL Lambert Airport T1',
    address: '10701 Lambert International Blvd, St. Louis, MO 63145',
    coordinates: { lat: 38.7487, lng: -90.37 },
  },
  {
    id: 'downtown_stl',
    label: 'Downtown St. Louis',
    address: '700 Clark Ave, St. Louis, MO 63102',
    coordinates: { lat: 38.6226, lng: -90.1928 },
  },
];

function buildSampleFiveCarFleet(anchorCoord: GeoPoint, nowMs: number): AutoDispatchDriverInput[] {
  return [
    {
      id: 'sim-drv-201',
      name: 'Mike T.',
      cabNumber: '201',
      formattedLabel: '#201, Mike',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 94,
      idleSince: new Date(nowMs - 18 * 60_000).toISOString(),
      currentLocation: {
        coordinates: { lat: anchorCoord.lat + 0.004, lng: anchorCoord.lng - 0.004 },
        timestamp: new Date(nowMs - 15_000).toISOString(),
      },
    },
    {
      id: 'sim-drv-202',
      name: 'Sarah K.',
      cabNumber: '202',
      formattedLabel: '#202, Sarah',
      vehicleTier: 'xl',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 91,
      idleSince: new Date(nowMs - 82 * 60_000).toISOString(),
      currentLocation: {
        coordinates: { lat: anchorCoord.lat - 0.015, lng: anchorCoord.lng - 0.018 },
        timestamp: new Date(nowMs - 25_000).toISOString(),
      },
    },
    {
      id: 'sim-drv-203',
      name: 'David R.',
      cabNumber: '203',
      formattedLabel: '#203, David',
      vehicleTier: 'xl',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 99,
      idleSince: new Date(nowMs - 110 * 60_000).toISOString(),
      currentLocation: {
        coordinates: { lat: anchorCoord.lat + 0.085, lng: anchorCoord.lng + 0.11 },
        timestamp: new Date(nowMs - 20_000).toISOString(),
      },
    },
    {
      id: 'sim-drv-204',
      name: 'Elena M.',
      cabNumber: '204',
      formattedLabel: '#204, Elena',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 86,
      idleSince: new Date(nowMs - 40 * 60_000).toISOString(),
      currentLocation: {
        coordinates: { lat: anchorCoord.lat + 0.31, lng: anchorCoord.lng + 0.34 },
        timestamp: new Date(nowMs - 30_000).toISOString(),
      },
    },
    {
      id: 'sim-drv-205',
      name: 'Chris P.',
      cabNumber: '205',
      formattedLabel: '#205, Chris',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 68,
      idleSince: new Date(nowMs - 55 * 60_000).toISOString(),
      currentLocation: {
        coordinates: { lat: anchorCoord.lat + 0.008, lng: anchorCoord.lng + 0.006 },
        timestamp: new Date(nowMs - 720_000).toISOString(), // 12m stale GPS
      },
    },
  ];
}

export function AdminAutoDispatchSimulator({
  config,
  zones,
}: AdminAutoDispatchSimulatorProps) {
  const [liveDrivers, setLiveDrivers] = useState<AutoDispatchDriverInput[]>([]);
  const [fleetVehicles, setFleetVehicles] = useState<FleetCarConfig[]>([]);
  const [vehicleTiers, setVehicleTiers] = useState<VehicleTierConfig[]>([]);
  const [simClockMs, setSimClockMs] = useState<number>(SIM_FIXED_BASE_MS);
  const [useSampleFleet, setUseSampleFleet] = useState<boolean>(false);

  const [pickupPresetId, setPickupPresetId] = useState<string>('chesterfield_valley');
  const [simTier, setSimTier] = useState<string>('standard');
  const [simPassengers, setSimPassengers] = useState<number>(2);

  useEffect(() => {
    setSimClockMs(Date.now());
    const cached = getAdminConfigService().getCachedSettings();
    if (cached.fleet) setFleetVehicles(cached.fleet);
    if (cached.vehicles) setVehicleTiers(cached.vehicles);

    let latestRoster = getOperatorService().getDriverRoster();
    let latestProfiles: Record<string, any> = {};

    const syncMerged = () => {
      const merged: AutoDispatchDriverInput[] = latestRoster.map((r) => {
        const prof = latestProfiles[r.id];
        const duty =
          prof?.dutyStatus ||
          (r.status === 'offline' ? 'off_duty' : r.status === 'break' ? 'on_break' : 'on_duty');
        return {
          id: r.id,
          name: r.name,
          cabNumber: r.cabNumber,
          formattedLabel: r.formattedLabel,
          vehicle: r.vehicle,
          vehicleTier: prof?.vehicleTier || r.tier?.toLowerCase() || 'standard',
          dutyStatus: duty,
          status: r.status,
          zone: r.zone,
          phone: r.phone,
          driverScore: r.driverScore,
          isBlacklisted: r.isBlacklisted,
          isArchived: r.isArchived,
          currentLocation: prof?.currentLocation || null,
          locationUpdatedAt: prof?.currentLocation?.timestamp || prof?.updatedAt,
          idleSince: prof?.idleSince || prof?.updatedAt,
        };
      });
      setLiveDrivers(merged);
      setSimClockMs(Date.now());
    };

    const unsubRoster = getOperatorService().subscribeToDrivers((r) => {
      latestRoster = r;
      syncMerged();
    });
    const unsubProfiles = getDriverService().subscribeToAllDrivers((p) => {
      latestProfiles = p || {};
      syncMerged();
    });

    return () => {
      unsubRoster();
      unsubProfiles();
    };
  }, []);

  const liveOnDutyCount = useMemo(
    () =>
      liveDrivers.filter(
        (d) => d.dutyStatus === 'on_duty' && d.status !== 'offline' && d.status !== 'break'
      ).length,
    [liveDrivers]
  );

  const selectedPickup = useMemo(() => {
    const preset = PICKUP_PRESETS.find((p) => p.id === pickupPresetId);
    if (preset) return preset;
    const customZone = zones.find((z) => z.id === pickupPresetId);
    if (customZone?.center) {
      return {
        id: customZone.id,
        label: customZone.name,
        address: `${customZone.name}, MO`,
        coordinates: customZone.center,
      };
    }
    return PICKUP_PRESETS[0];
  }, [pickupPresetId, zones]);

  const activeDriversPool = useMemo(() => {
    if (useSampleFleet) {
      return buildSampleFiveCarFleet(selectedPickup.coordinates, simClockMs);
    }
    return liveDrivers;
  }, [useSampleFleet, liveDrivers, selectedPickup.coordinates, simClockMs]);

  const evaluation = useMemo(() => {
    const simulatedTrip: Partial<Trip> = {
      id: 'SIM-DRY-RUN',
      status: 'CONFIRMED',
      bookingType: 'asap',
      pickupLocation: {
        address: selectedPickup.address,
        coordinates: selectedPickup.coordinates,
      },
      dropoffLocation: {
        address: '800 N Lindbergh Blvd, Creve Coeur, MO 63167',
        coordinates: { lat: 38.6714, lng: -90.408 },
      },
      vehicleTier: simTier as any,
      passenger: {
        firstName: 'Dry-Run',
        lastName: 'Rider',
        email: 'sim@chesterfieldtaxi.com',
        phone: '(314) 555-0100',
        passengerCount: simPassengers,
        luggageCount: Math.max(1, Math.min(4, simPassengers)),
      },
      metadata: {
        vehicleTypeId: simTier,
      },
    };

    return evaluateAutoDispatchCandidates(
      simulatedTrip,
      activeDriversPool,
      zones,
      config,
      {
        fleetVehicles: useSampleFleet ? [] : fleetVehicles,
        vehicleTiers,
        nowMs: simClockMs,
      }
    );
  }, [
    selectedPickup,
    simTier,
    simPassengers,
    activeDriversPool,
    zones,
    config,
    useSampleFleet,
    fleetVehicles,
    vehicleTiers,
    simClockMs,
  ]);

  const effectivePreviewMode =
    config.dispatchMode !== 'manual_1tap' ? config.dispatchMode : config.sweepExecutionMode;

  const getRankActionBadge = (idx: number) => {
    if (effectivePreviewMode === 'direct_auto_assign') {
      return idx === 0 ? (
        <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black">
          DIRECT ASSIGN #1
        </span>
      ) : (
        <span className="px-2 py-0.5 rounded-full bg-surface-muted text-fg-secondary text-[10px] font-bold">
          Standby #{idx + 1}
        </span>
      );
    }
    if (effectivePreviewMode === 'broadcast_pool') {
      const inFirstBatch = idx < config.broadcastPoolSize;
      return inFirstBatch ? (
        <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-black">
          POOL BATCH 1 (Top-{config.broadcastPoolSize})
        </span>
      ) : (
        <span className="px-2 py-0.5 rounded-full bg-surface-muted text-fg-secondary text-[10px] font-bold">
          Next Batch #{idx + 1}
        </span>
      );
    }
    if (idx < config.maxCascadeAttempts) {
      return (
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            idx === 0 ? 'bg-blue-600 text-white' : 'bg-status-info-bg-strong text-status-info-fg'
          }`}
        >
          STEP {idx + 1}/{config.maxCascadeAttempts}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full bg-surface-muted text-fg-secondary text-[10px] font-bold">
        {config.fallbackOnExhaustion === 'broadcast_all_eligible' ? 'Fallback Broadcast' : 'Reserve'}
      </span>
    );
  };

  return (
    <div className="rounded-2xl border-2 border-status-staged-border bg-surface-subtle/70 overflow-hidden">
      <div className="px-4 py-3 bg-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 rounded-lg bg-indigo-800 text-indigo-200 shrink-0">
            <SparklesIcon className="w-4 h-4" />
          </span>
          <div>
            <h4 className="text-xs sm:text-sm font-black">
              Interactive Candidate Dry-Run Simulator
            </h4>
            <p className="text-[11px] text-indigo-200">
              Preview exact Ranked Eligible Queue &amp; Excluded Driver Reasons before saving.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setUseSampleFleet((prev) => !prev)}
          className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold border transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
            useSampleFleet
              ? 'bg-amber-400 text-slate-950 border-status-warning-border shadow-xs'
              : 'bg-indigo-900 hover:bg-indigo-800 text-indigo-100 border-indigo-700'
          }`}
        >
          <CarIcon className="w-3.5 h-3.5 shrink-0" />
          <span>
            {useSampleFleet
              ? 'Using Sample 5-Car Fleet (Click for Live)'
              : 'Simulate Sample 5-Car Fleet'}
          </span>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {!useSampleFleet && liveOnDutyCount === 0 && (
          <div className="p-3 rounded-xl bg-status-warning-bg border border-status-warning-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-status-warning-fg">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                0 live drivers currently have active GPS on duty. Toggle the Sample 5-Car Fleet to test guardrails &amp; ranking!
              </span>
            </div>
            <button
              type="button"
              onClick={() => setUseSampleFleet(true)}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shrink-0 cursor-pointer"
            >
              Load Sample 5-Car Fleet
            </button>
          </div>
        )}

        {/* Scenario Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-surface-card border border-border-subtle">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-fg-secondary flex items-center gap-1">
              <MapPinIcon className="w-3.5 h-3.5 text-emerald-600" />
              <span>Simulated Pickup Zone</span>
            </label>
            <Select
              size="sm"
              value={pickupPresetId}
              onChange={(e) => setPickupPresetId(e.target.value)}
            >
              {PICKUP_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              {zones
                .filter((z) => Boolean(z.center))
                .map((z) => (
                  <option key={z.id} value={z.id}>
                    Zone: {z.name}
                  </option>
                ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-fg-secondary block">
              Requested Vehicle Tier
            </label>
            <Select
              size="sm"
              value={simTier}
              onChange={(e) => setSimTier(e.target.value)}
            >
              <option value="standard">Standard Sedan</option>
              <option value="xl">XL SUV / Minivan</option>
              <option value="premium">Executive Premium</option>
              <option value="wheelchair">Wheelchair WAV</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-fg-secondary flex items-center justify-between">
              <span>Passenger Count</span>
              <span className="font-mono font-black text-status-info-fg">{simPassengers} pax</span>
            </label>
            <input
              type="range"
              min={1}
              max={6}
              value={simPassengers}
              onChange={(e) => setSimPassengers(parseInt(e.target.value, 10) || 1)}
              className="w-full accent-blue-600 cursor-pointer mt-1"
            />
          </div>
        </div>

        {/* Side-by-Side Eligible Queue & Excluded Reasons */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Ranked Eligible Queue */}
          <div className="rounded-xl border border-status-success-border bg-surface-card overflow-hidden flex flex-col">
            <div className="px-3.5 py-2.5 bg-status-success-bg/80 border-b border-status-success-border flex items-center justify-between">
              <span className="text-xs font-black text-status-success-fg flex items-center gap-1.5">
                <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>Ranked Eligible Queue ({evaluation.eligible.length})</span>
              </span>
              <Badge variant="success" size="sm" className="text-[10px] font-mono">
                {effectivePreviewMode.replace(/_/g, ' ').toUpperCase()}
              </Badge>
            </div>

            <div className="p-3 space-y-2 flex-1">
              {evaluation.eligible.length === 0 ? (
                <div className="py-6 text-center text-xs text-fg-muted">
                  <p className="font-bold text-fg-secondary">0 eligible drivers matched</p>
                  <p className="text-[11px] mt-0.5">
                    Relax radius, GPS freshness, or score guardrails, or enable the Sample 5-Car Fleet.
                  </p>
                </div>
              ) : (
                evaluation.eligible.map((cand, idx) => (
                  <div
                    key={cand.driverId}
                    className="p-2.5 rounded-xl border border-border-subtle bg-surface-subtle/60 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-surface-header text-white text-[10px] font-black flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-extrabold text-fg-primary truncate">
                          {cand.driverLabel}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-surface-emphasis/80 text-fg-secondary">
                          {cand.vehicleTier}
                        </span>
                      </div>
                      {getRankActionBadge(idx)}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-fg-secondary pl-7">
                      <span className="truncate">{cand.rankReason}</span>
                      <span className="inline-flex items-center gap-0.5 font-bold text-status-warning-fg shrink-0">
                        <StarIcon className="w-3 h-3 text-amber-500" />
                        {cand.driverScore}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Excluded Drivers & Exact Reasons */}
          <div className="rounded-xl border border-status-danger-border bg-surface-card overflow-hidden flex flex-col">
            <div className="px-3.5 py-2.5 bg-status-danger-bg/80 border-b border-status-danger-border flex items-center justify-between">
              <span className="text-xs font-black text-status-danger-fg flex items-center gap-1.5">
                <BoltIcon className="w-3.5 h-3.5 text-rose-600" />
                <span>Excluded Drivers &amp; Exact Reasons ({evaluation.excluded.length})</span>
              </span>
              <span className="text-[10px] font-bold text-status-danger-fg">Guardrail Diagnostics</span>
            </div>

            <div className="p-3 space-y-2 flex-1 max-h-72 overflow-y-auto">
              {evaluation.excluded.length === 0 ? (
                <div className="py-6 text-center text-xs text-fg-muted">
                  <p className="font-bold text-status-success-fg">No drivers excluded</p>
                  <p className="text-[11px] mt-0.5">
                    Every evaluated unit passed duty, capacity, radius, GPS, and score guardrails.
                  </p>
                </div>
              ) : (
                evaluation.excluded.map((ex) => (
                  <div
                    key={ex.driverId}
                    className="p-2.5 rounded-xl border border-rose-100 bg-status-danger-bg/30 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-fg-strong">{ex.driverLabel}</span>
                      <span className="px-2 py-0.5 rounded-md bg-status-danger-bg-strong text-status-danger-fg border border-status-danger-border font-mono text-[9.5px] font-bold">
                        {ex.exclusionCode}
                      </span>
                    </div>
                    <p className="text-[11px] text-fg-secondary font-medium">{ex.exclusionReason}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
