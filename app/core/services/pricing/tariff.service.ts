/**
 * Unified Tariff Service
 *
 * Manages self-contained Tariff Profiles (Taximeter step rates, corridor matrices,
 * zip-code rate matrices, hourly charters, and rule triggers) with Firestore persistence,
 * local caching, and pure matching helpers.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import type {
  TariffProfile,
  TariffCorridor,
  TariffTaximeterRate,
  DistanceRoundingMode,
  FareRoundingMode,
  RateRoundingPolicy,
  RateCancellationPolicy,
} from '../../types/tariff';

export const DEFAULT_RATE_ROUNDING: RateRoundingPolicy = {
  distanceMode: 'exact',
  fareMode: 'ceil_dollar',
};

export const DEFAULT_RATE_CANCELLATION_POLICY: RateCancellationPolicy = {
  freeWindowMinutes: 60,
  cancellationFee: 28.0,
  noShowFee: 28.0,
};

/**
 * Quantizes route distance according to a Rate's configured distance rounding setting.
 */
export function applyDistanceRounding(
  miles: number,
  mode: DistanceRoundingMode = 'exact'
): number {
  if (!miles || miles <= 0 || isNaN(miles)) return 0;
  if (mode === 'half_mile_up') {
    return Math.ceil((miles - 1e-9) * 2) / 2;
  }
  if (mode === 'whole_mile_up') {
    return Math.ceil(miles - 1e-9);
  }
  return Number(miles.toFixed(4));
}

/**
 * Rounds a final currency fare according to a Rate's configured fare rounding setting.
 */
export function applyFareRounding(
  amount: number,
  mode: FareRoundingMode = 'ceil_dollar'
): number {
  if (!amount || isNaN(amount)) return 0;
  if (mode === 'exact_cents') {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }
  if (mode === 'nearest_half_dollar') {
    return Math.round(amount * 2) / 2;
  }
  if (mode === 'nearest_dollar') {
    return Math.round(amount);
  }
  // Default: 'ceil_dollar'
  return Math.ceil(amount - 1e-9);
}
import type { PricingInput } from './types';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import { doesVehicleMatchAllowedList } from './vehicle-matching';

const TARIFFS_STORAGE_KEY = 'chesterfield_taxi_tariff_profiles_v6';

const RETIRED_LEGACY_TARIFF_IDS = new Set([
  'tariff-standard-flat',
  'tariff-minivan-flat',
  'tariff-meter-standard',
  'tariff-meter-minivan',
  'tariff-smoke-house-rates',
  'tariff-hourly-charter',
]);

export const DEFAULT_TARIFF_PROFILES: TariffProfile[] = [
  {
    id: 'tariff-airport-flat',
    name: 'Airport Flat Rate',
    description:
      'Flat rate airport transfer tariff to/from Lambert International (STL) and Spirit of St. Louis (SUS).',
    rateModel: 'taximeter',
    currency: 'USD',
    units: 'imperial',
    fareIncrement: 0.1,
    priority: 95,
    isActive: true,
    isDefault: false,
    rounding: {
      distanceMode: 'exact',
      fareMode: 'ceil_dollar',
    },
    cancellationPolicy: {
      freeWindowMinutes: 60,
      cancellationFee: 30.0,
      noShowFee: 30.0,
    },
    allowSurgeMultiplier: true,
    allowOperationalSurcharges: true,
    triggers: {},
    taximeter: {
      startPrice: 0.0,
      initialDistanceIncluded: 0,
      initialTimeIncluded: 0,
      primaryDistanceStep: 0.1, // 176 yards
      primaryDistanceRate: 0.255, // $0.255/0.1 mi ($2.55/mi)
      primaryDistanceLimit: 20.0, // First 20 miles
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.23, // $0.23/0.1 mi ($2.30/mi after 20 mi)
      freeTrafficMinutes: 9999,
      waitingRatePerStep: 0.0, // No traffic overcharge on airport transfers
      waitingStepSeconds: 60,
      minimumPrice: 28.0, // $28 minimum floor
    },
    taximeterRate: {
      startPrice: 0.0,
      initialDistanceIncluded: 0,
      initialTimeIncluded: 0,
      primaryDistanceStep: 0.1,
      primaryDistanceRate: 0.255,
      primaryDistanceLimit: 20.0,
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.23,
      freeTrafficMinutes: 9999,
      waitingRatePerStep: 0.0,
      waitingStepSeconds: 60,
      minimumPrice: 28.0,
    },
    corridors: [],
    extras: {
      carSeatFeePerUnit: 10.0,
      passengerBaseAllowance: 1,
      extraPassengerFeePerHead: 1.0,
      customSurcharges: [],
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'tariff-point-to-point-meter',
    name: 'METER',
    description:
      'City taximeter tariff for standard non-airport passenger trips across Chesterfield and St. Louis metro ($4.50 first 0.1 mi, $0.30/0.1 mi after with $40.00/hour waiting time).',
    rateModel: 'taximeter',
    currency: 'USD',
    units: 'imperial',
    fareIncrement: 0.1,
    priority: 80,
    isActive: true,
    isDefault: true,
    rounding: {
      distanceMode: 'exact',
      fareMode: 'ceil_dollar',
    },
    cancellationPolicy: {
      freeWindowMinutes: 60,
      cancellationFee: 20.0,
      noShowFee: 20.0,
    },
    allowSurgeMultiplier: true,
    allowOperationalSurcharges: true,
    triggers: {},
    taximeter: {
      startPrice: 4.5, // $4.50 first 0.1 mi
      initialDistanceIncluded: 0.1,
      initialTimeIncluded: 0,
      primaryDistanceStep: 0.1,
      primaryDistanceRate: 0.3, // $0.30/0.1 mi ($3.00/mile)
      primaryDistanceLimit: 999.0,
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.3,
      freeTrafficMinutes: 5,
      waitingRatePerStep: 0.667, // $40.00/hour waiting time ($0.667/minute)
      waitingStepSeconds: 60,
      minimumPrice: 4.5, // $4.50 minimum
    },
    taximeterRate: {
      startPrice: 4.5,
      initialDistanceIncluded: 0.1,
      initialTimeIncluded: 0,
      primaryDistanceStep: 0.1,
      primaryDistanceRate: 0.3,
      primaryDistanceLimit: 999.0,
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.3,
      freeTrafficMinutes: 5,
      waitingRatePerStep: 0.667,
      waitingStepSeconds: 60,
      minimumPrice: 4.5,
    },
    corridors: [],
    extras: {
      carSeatFeePerUnit: 10.0,
      passengerBaseAllowance: 1,
      extraPassengerFeePerHead: 1.0,
      customSurcharges: [],
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

/**
 * Synchronizes legacy alias fields on a TariffProfile so UI editors and engine evaluators
 * always read and write the exact same data.
 */
export function normalizeTariffProfile(tariff: TariffProfile): TariffProfile {
  const taximeter = tariff.taximeter || tariff.taximeterRate;
  const zipMatrix =
    (tariff.zipMatrix && tariff.zipMatrix.length > 0 ? tariff.zipMatrix : tariff.zipMatrixRates) ||
    [];
  const hourlyConfig = tariff.hourlyConfig || tariff.hourlyRate;

  // Unify vehicle type restrictions (eligibleVehicleTypes <-> triggers.vehicleTypes)
  const unifiedVehicleTypes =
    tariff.triggers?.vehicleTypes !== undefined
      ? tariff.triggers.vehicleTypes
      : tariff.eligibleVehicleTypes;
  const unifiedVehicleClasses =
    tariff.triggers?.vehicleClasses !== undefined
      ? tariff.triggers.vehicleClasses
      : tariff.eligibleVehicleClasses;

  const rounding: RateRoundingPolicy = {
    distanceMode: tariff.rounding?.distanceMode || DEFAULT_RATE_ROUNDING.distanceMode,
    fareMode: tariff.rounding?.fareMode || DEFAULT_RATE_ROUNDING.fareMode,
  };

  const cancellationPolicy: RateCancellationPolicy = {
    freeWindowMinutes:
      typeof tariff.cancellationPolicy?.freeWindowMinutes === 'number'
        ? tariff.cancellationPolicy.freeWindowMinutes
        : DEFAULT_RATE_CANCELLATION_POLICY.freeWindowMinutes,
    cancellationFee:
      typeof tariff.cancellationPolicy?.cancellationFee === 'number'
        ? tariff.cancellationPolicy.cancellationFee
        : DEFAULT_RATE_CANCELLATION_POLICY.cancellationFee,
    noShowFee:
      typeof tariff.cancellationPolicy?.noShowFee === 'number'
        ? tariff.cancellationPolicy.noShowFee
        : DEFAULT_RATE_CANCELLATION_POLICY.noShowFee,
  };

  return {
    ...tariff,
    rounding,
    cancellationPolicy,
    taximeter,
    taximeterRate: taximeter,
    zipMatrix: zipMatrix.length > 0 ? zipMatrix : undefined,
    zipMatrixRates: zipMatrix.length > 0 ? zipMatrix : undefined,
    hourlyConfig,
    hourlyRate: hourlyConfig,
    corridors: Array.isArray(tariff.corridors) ? tariff.corridors : [],
    eligibleVehicleTypes: unifiedVehicleTypes,
    eligibleVehicleClasses: unifiedVehicleClasses,
    triggers: {
      ...(tariff.triggers || {}),
      vehicleTypes: unifiedVehicleTypes,
      vehicleClasses: unifiedVehicleClasses,
    },
  };
}

export class TariffService {
  private cache: TariffProfile[] | null = null;

  private cleanLegacyTariffs(rawList: TariffProfile[], db?: any): TariffProfile[] {
    const retiredDocs = rawList.filter((t) => RETIRED_LEGACY_TARIFF_IDS.has(t.id));
    if (retiredDocs.length > 0 && db) {
      for (const retired of retiredDocs) {
        deleteDoc(doc(db, 'tariffs', retired.id)).catch(() => {});
      }
    }

    const validList = rawList
      .filter((t) => !RETIRED_LEGACY_TARIFF_IDS.has(t.id))
      .map(normalizeTariffProfile);

    if (retiredDocs.length > 0 || validList.length === 0) {
      for (const def of DEFAULT_TARIFF_PROFILES) {
        if (!validList.some((t) => t.id === def.id)) {
          validList.push(normalizeTariffProfile({ ...def }));
          if (db) {
            setDoc(doc(db, 'tariffs', def.id), sanitizePayload(def)).catch(() => {});
          }
        }
      }
    }

    return validList;
  }

  public async getTariffs(forceRefresh = false): Promise<TariffProfile[]> {
    if (this.cache && this.cache.length > 0 && !forceRefresh) {
      return [...this.cache];
    }

    const localData = this.loadFromLocalStorage();
    if (localData && localData.length > 0) {
      this.cache = localData;
    }

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const snap = await getDocs(collection(db, 'tariffs'));
          if (!snap.empty) {
            const rawList = snap.docs.map((d) => d.data() as TariffProfile);
            const cleaned = this.cleanLegacyTariffs(rawList, db);
            this.cache = cleaned;
            this.saveToLocalStorage(cleaned);
            return [...cleaned];
          } else {
            for (const def of DEFAULT_TARIFF_PROFILES) {
              setDoc(doc(db, 'tariffs', def.id), sanitizePayload(def)).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.warn('[TariffService] Firestore fetch error, using local fallback:', err);
      }
    }

    if (!this.cache || this.cache.length === 0) {
      this.cache = DEFAULT_TARIFF_PROFILES.map(normalizeTariffProfile);
      this.saveToLocalStorage(this.cache);
    }

    return [...this.cache];
  }

  public getAllTariffProfiles(): TariffProfile[] {
    if (this.cache && this.cache.length > 0) {
      return [...this.cache];
    }
    const local = this.loadFromLocalStorage();
    if (local && local.length > 0) {
      this.cache = local;
      return [...local];
    }
    return DEFAULT_TARIFF_PROFILES.map(normalizeTariffProfile);
  }

  public saveTariffProfile(tariff: TariffProfile): void {
    this.saveTariff(tariff).catch((e) => console.error(e));
  }

  public deleteTariffProfile(id: string): void {
    this.deleteTariff(id).catch((e) => console.error(e));
  }

  public async saveTariff(tariff: TariffProfile): Promise<void> {
    const list = await this.getTariffs();
    const existingIdx = list.findIndex((t) => t.id === tariff.id);
    const updated = normalizeTariffProfile({
      ...tariff,
      updatedAt: new Date().toISOString(),
    });

    if (existingIdx >= 0) {
      list[existingIdx] = updated;
    } else {
      list.push({
        ...updated,
        createdAt: updated.createdAt || new Date().toISOString(),
      });
    }

    this.cache = list;
    this.saveToLocalStorage(list);

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          await setDoc(doc(db, 'tariffs', tariff.id), sanitizePayload(updated));
        }
      } catch (err) {
        console.warn('[TariffService] Firestore setDoc error:', err);
      }
    }
  }

  public async archiveTariff(tariffId: string, reason?: string): Promise<void> {
    const current = this.cache || (await this.getTariffs());
    const tariff = current.find((t) => t.id === tariffId);
    if (!tariff) return;
    await this.saveTariff({
      ...tariff,
      isArchived: true,
      archivedAt: new Date().toISOString(),
      archiveReason: reason || 'Archived by administrator',
    });
  }

  public async restoreTariff(tariffId: string): Promise<void> {
    const current = this.cache || (await this.getTariffs());
    const tariff = current.find((t) => t.id === tariffId);
    if (!tariff) return;
    await this.saveTariff({
      ...tariff,
      isArchived: false,
      archivedAt: undefined,
      archiveReason: undefined,
    });
  }

  public async deleteTariff(tariffId: string): Promise<void> {
    const list = await this.getTariffs();
    const filtered = list.filter((t) => t.id !== tariffId);
    this.cache = filtered;
    this.saveToLocalStorage(filtered);

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          await deleteDoc(doc(db, 'tariffs', tariffId));
        }
      } catch (err) {
        console.warn('[TariffService] Firestore deleteDoc error:', err);
      }
    }
  }

  public subscribeToTariffs(
    onUpdate: (tariffs: TariffProfile[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (!isFirebaseConfigured()) {
      this.getTariffs().then(onUpdate).catch((e) => onError?.(e));
      return () => {};
    }

    try {
      const db = getFirestoreDb();
      if (!db) {
        this.getTariffs().then(onUpdate).catch((e) => onError?.(e));
        return () => {};
      }

      const q = collection(db, 'tariffs');
      const unsubscribe = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            const rawList = snap.docs.map((d) => d.data() as TariffProfile);
            const cleaned = this.cleanLegacyTariffs(rawList, db);
            this.cache = cleaned;
            this.saveToLocalStorage(cleaned);
            onUpdate(cleaned);
          } else {
            this.getTariffs().then(onUpdate);
          }
        },
        (err) => {
          console.warn('[TariffService] Snapshot error:', err);
          onError?.(err);
        }
      );

      return unsubscribe;
    } catch (e: any) {
      console.warn('[TariffService] Setup snapshot failed:', e);
      this.getTariffs().then(onUpdate).catch((err) => onError?.(err));
      return () => {};
    }
  }

  private loadFromLocalStorage(): TariffProfile[] | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      window.localStorage.removeItem('chesterfield_taxi_tariff_profiles');
      window.localStorage.removeItem('chesterfield_taxi_pricing_tariffs_v2');
      window.localStorage.removeItem('chesterfield_taxi_tariff_profiles_v3');
      window.localStorage.removeItem('chesterfield_taxi_tariff_profiles_v4');
      window.localStorage.removeItem('chesterfield_taxi_tariff_profiles_v5');

      const stored = window.localStorage.getItem(TARIFFS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as TariffProfile[];
        const cleaned = parsed
          .filter((t) => !RETIRED_LEGACY_TARIFF_IDS.has(t.id))
          .map(normalizeTariffProfile);
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
    return null;
  }

  private saveToLocalStorage(list: TariffProfile[]): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(TARIFFS_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Ignore quota errors
    }
  }
}

let instance: TariffService | null = null;
export function getTariffService(): TariffService {
  if (!instance) {
    instance = new TariffService();
  }
  return instance;
}

/**
 * Pure Functional Rate Selection:
 * In the 4-pillar firewall architecture, Rules (Step 1) choose specialized Rates via
 * `targetTariffId`. When no Rule or explicit override selects a Rate, this returns
 * the designated Default Rate (`isDefault: true`), or an Hourly Rate if `isHourlyBooking`
 * is requested. Hidden zone/vehicle/schedule triggers on Rates are intentionally ignored
 * so Rules are the single source of truth for conditional routing.
 */
export function matchTariffProfile(
  input: PricingInput,
  rawTariffs: TariffProfile[] = DEFAULT_TARIFF_PROFILES,
  explicitTariffId?: string
): TariffProfile {
  const tariffs = rawTariffs.map(normalizeTariffProfile);
  const activeTariffs = tariffs.filter((t) => t.isActive && !t.isArchived);
  const defaultFallback =
    DEFAULT_TARIFF_PROFILES.find((t) => t.isDefault) ||
    DEFAULT_TARIFF_PROFILES[DEFAULT_TARIFF_PROFILES.length - 1];

  if (activeTariffs.length === 0) {
    return normalizeTariffProfile(defaultFallback);
  }

  // 1. Explicit target Rate from Step 1 Rules or Simulator / Config override
  if (explicitTariffId) {
    const targeted = activeTariffs.find((t) => t.id === explicitTariffId);
    if (targeted) return resolveTariffProfile(targeted, tariffs);
  }

  // 2. Explicit Rate ID requested via selectedRuleId
  if (input.selectedRuleId) {
    const explicit = activeTariffs.find((t) => t.id === input.selectedRuleId);
    if (explicit) return resolveTariffProfile(explicit, tariffs);
  }

  // 3. Hourly charter booking -> active hourly Rate
  if (input.isHourlyBooking) {
    const hourlyTariff = activeTariffs.find(
      (t) => t.rateModel === 'hourly' || t.id === 'tariff-hourly-charter'
    );
    if (hourlyTariff) return resolveTariffProfile(hourlyTariff, tariffs);
  }

  // 4. Default Rate fallback (single predictable fallback — zero hidden auto-hijacking)
  const matched =
    activeTariffs.find((t) => t.isDefault) ||
    activeTariffs.find((t) => t.rateModel !== 'hourly' && t.rateModel !== 'zip_matrix') ||
    activeTariffs[0] ||
    normalizeTariffProfile(defaultFallback);

  return resolveTariffProfile(matched, tariffs);
}

/**
 * Resolves tariff inheritance if a parentTariffId is present.
 */
export function resolveTariffProfile(
  tariff: TariffProfile,
  allTariffs: TariffProfile[]
): TariffProfile {
  if (!tariff.parentTariffId) {
    return normalizeTariffProfile(tariff);
  }
  const parent = allTariffs.find((t) => t.id === tariff.parentTariffId);
  if (!parent) {
    return normalizeTariffProfile(tariff);
  }
  const resolvedParent = resolveTariffProfile(parent, allTariffs);
  const inh = tariff.inheritance;

  return normalizeTariffProfile({
    ...tariff,
    taximeter: inh?.overrideTaximeter ? tariff.taximeter : resolvedParent.taximeter,
    corridors: inh?.overrideCorridors
      ? tariff.corridors
      : [...resolvedParent.corridors, ...tariff.corridors],
    extras: inh?.overrideExtras
      ? tariff.extras
      : {
          ...resolvedParent.extras,
          ...tariff.extras,
          customSurcharges: [
            ...(resolvedParent.extras.customSurcharges || []),
            ...(tariff.extras.customSurcharges || []),
          ],
        },
    triggers: inh?.overrideTriggers
      ? tariff.triggers
      : {
          ...resolvedParent.triggers,
          ...tariff.triggers,
        },
  });
}

/**
 * Pure Functional Corridor Match: Checks if trip's origin & destination match a flat corridor.
 */
export function matchTariffCorridor(
  input: PricingInput,
  profile: TariffProfile
): TariffCorridor | undefined {
  if (!profile.corridors || profile.corridors.length === 0) {
    return undefined;
  }

  const originZones = new Set<string>([
    ...(input.originZoneIds || []),
    ...(input.originZoneId ? [input.originZoneId] : []),
  ]);
  const destZones = new Set<string>([
    ...(input.destinationZoneIds || []),
    ...(input.destinationZoneId ? [input.destinationZoneId] : []),
  ]);
  if (originZones.size === 0 && input.zoneIds && input.zoneIds.length > 0) {
    originZones.add(input.zoneIds[0]);
  }
  if (destZones.size === 0 && input.zoneIds && input.zoneIds.length > 1) {
    destZones.add(input.zoneIds[1]);
  }

  const collectionIds = input.locationCollectionIds || [];
  if (originZones.size === 0 && destZones.size === 0 && collectionIds.length === 0) {
    return undefined;
  }

  const sortedCorridors = [...profile.corridors].sort(
    (a, b) => (b.priorityRank ?? 0) - (a.priorityRank ?? 0)
  );

  for (const corridor of sortedCorridors) {
    const hasFilter = Boolean(
      corridor.fromZoneId ||
        corridor.toZoneId ||
        corridor.fromLocationCollectionId ||
        corridor.toLocationCollectionId
    );
    if (!hasFilter) continue;

    const matchesForward =
      (!corridor.fromZoneId || originZones.has(corridor.fromZoneId)) &&
      (!corridor.toZoneId || destZones.has(corridor.toZoneId)) &&
      (!corridor.fromLocationCollectionId ||
        collectionIds.includes(corridor.fromLocationCollectionId)) &&
      (!corridor.toLocationCollectionId ||
        collectionIds.includes(corridor.toLocationCollectionId));

    if (matchesForward) {
      return corridor;
    }

    if (corridor.allowReturn) {
      const matchesReturn =
        (!corridor.fromZoneId || destZones.has(corridor.fromZoneId)) &&
        (!corridor.toZoneId || originZones.has(corridor.toZoneId)) &&
        (!corridor.fromLocationCollectionId ||
          collectionIds.includes(corridor.fromLocationCollectionId)) &&
        (!corridor.toLocationCollectionId ||
          collectionIds.includes(corridor.toLocationCollectionId));

      if (matchesReturn) {
        return corridor;
      }
    }
  }

  return undefined;
}

/**
 * Pure Functional Taximeter Calculation
 */
export function evaluateTaximeterFare(
  taximeter: TariffTaximeterRate,
  rawDistanceMiles: number,
  durationMinutes: number,
  distanceRoundingMode: DistanceRoundingMode = 'exact'
): {
  baseFare: number;
  distanceFare: number;
  delayFare: number;
  subtotal: number;
  effectiveDistanceMiles: number;
  effectivePerMileRate: number;
  effectivePerMinuteRate: number;
  isFloorApplied: boolean;
  auditDetails: string[];
} {
  const auditDetails: string[] = [];
  const distanceMiles = applyDistanceRounding(rawDistanceMiles, distanceRoundingMode);
  if (distanceRoundingMode !== 'exact' && distanceMiles !== rawDistanceMiles) {
    auditDetails.push(
      `Distance rounding (${distanceRoundingMode}): ${rawDistanceMiles.toFixed(2)} mi -> ${distanceMiles.toFixed(2)} mi`
    );
  }
  const baseFare = Number((taximeter.startPrice ?? 0).toFixed(2));
  auditDetails.push(`Start price (flag drop): $${baseFare.toFixed(2)}`);

  const primaryStep = taximeter.primaryDistanceStep || 0.1;
  const primaryRate = taximeter.primaryDistanceRate ?? 0.255;
  const effectivePerMileRate = Number((primaryRate / primaryStep).toFixed(2));
  const waitStepSecs = taximeter.waitingStepSeconds || 60;
  const waitRate = taximeter.waitingRatePerStep ?? 0;
  const effectivePerMinuteRate =
    waitRate > 0 ? Number(((waitRate / waitStepSecs) * 60).toFixed(2)) : 0;

  // Distance computation
  const chargeableDistance = Math.max(0, distanceMiles - (taximeter.initialDistanceIncluded || 0));
  let distanceFare = 0;

  if (chargeableDistance > 0) {
    // 1. Primary step bracket
    const primaryLimit = taximeter.primaryDistanceLimit || 20.0;
    const primaryMiles = Math.min(chargeableDistance, primaryLimit);
    const primarySteps = Math.ceil(primaryMiles / primaryStep);
    const primaryCost = Number((primarySteps * primaryRate).toFixed(2));
    distanceFare += primaryCost;
    auditDetails.push(
      `Primary distance (0-${primaryLimit.toFixed(1)} mi): ${primaryMiles.toFixed(1)} mi (${primarySteps} steps @ $${primaryRate.toFixed(3)}/step) = $${primaryCost.toFixed(2)}`
    );

    // 2. Intermediate increment brackets
    const increments = [...(taximeter.intermediateIncrements || [])].sort(
      (a, b) => a.upToDistance - b.upToDistance
    );

    let processedDistance = primaryLimit;
    for (let i = 0; i < increments.length; i++) {
      const inc = increments[i];
      if (chargeableDistance > processedDistance) {
        const tierLimit = Math.max(processedDistance, inc.upToDistance);
        const bracketCapacity = tierLimit - processedDistance;
        const milesInTier = Math.min(chargeableDistance - processedDistance, bracketCapacity);
        if (milesInTier > 0) {
          const stepSize = inc.stepDistance || 0.1;
          const steps = Math.ceil(milesInTier / stepSize);
          const rate = inc.ratePerStep;
          const tierCost = Number((steps * rate).toFixed(2));
          distanceFare += tierCost;
          auditDetails.push(
            `Intermediate tier ${i + 1} (${inc.name || `${processedDistance.toFixed(1)}-${tierLimit.toFixed(1)} mi`}): ${milesInTier.toFixed(1)} mi (${steps} steps @ $${rate.toFixed(3)}/step) = $${tierCost.toFixed(2)}`
          );
          processedDistance = tierLimit;
        }
      }
    }

    // 3. Open-ended "Then" tier
    const remainingMiles = Math.max(0, chargeableDistance - processedDistance);
    if (remainingMiles > 0) {
      const thenStep = taximeter.thenDistanceStep || 0.1;
      const thenSteps = Math.ceil(remainingMiles / thenStep);
      const thenRate = taximeter.thenDistanceRate ?? 0.23;
      const thenCost = Number((thenSteps * thenRate).toFixed(2));
      distanceFare += thenCost;
      auditDetails.push(
        `"Then" open-ended distance (after ${processedDistance.toFixed(1)} mi): ${remainingMiles.toFixed(1)} mi (${thenSteps} steps @ $${thenRate.toFixed(3)}/step) = $${thenCost.toFixed(2)}`
      );
    }
  }

  // Delay / Waiting time computation
  let delayFare = 0;
  const freeMins = taximeter.freeTrafficMinutes || 0;
  if (durationMinutes > freeMins && waitRate > 0) {
    const excessSeconds = Math.max(0, (durationMinutes - freeMins) * 60);
    const waitSteps = Math.ceil(excessSeconds / waitStepSecs);
    delayFare = Number((waitSteps * waitRate).toFixed(2));
    auditDetails.push(
      `Waiting delay: ${(excessSeconds / 60).toFixed(1)} min past ${freeMins}m grace (${waitSteps} steps @ $${waitRate.toFixed(2)}) = $${delayFare.toFixed(2)}`
    );
  }

  let calculatedSubtotal = Number((baseFare + distanceFare + delayFare).toFixed(2));
  let isFloorApplied = false;

  if (taximeter.minimumPrice && calculatedSubtotal < taximeter.minimumPrice) {
    auditDetails.push(
      `Minimum price floor enforced ($${taximeter.minimumPrice.toFixed(2)} vs calculated $${calculatedSubtotal.toFixed(2)})`
    );
    calculatedSubtotal = Number(taximeter.minimumPrice.toFixed(2));
    isFloorApplied = true;
  }

  return {
    baseFare,
    distanceFare: Number(distanceFare.toFixed(2)),
    delayFare: Number(delayFare.toFixed(2)),
    subtotal: calculatedSubtotal,
    effectiveDistanceMiles: distanceMiles,
    effectivePerMileRate,
    effectivePerMinuteRate,
    isFloorApplied,
    auditDetails,
  };
}

/**
 * Evaluates agreed customer charge & driver pay from a Zip-code matrix.
 */
export function evaluateZipMatrixFare(
  tariff: TariffProfile,
  pickupZip?: string,
  dropoffZip?: string
): {
  matchedEntry: import('../../types/tariff').ZipRateMatrixEntry;
  subtotal: number;
  auditDetails: string[];
} | null {
  const matrix =
    tariff.zipMatrix && tariff.zipMatrix.length > 0 ? tariff.zipMatrix : tariff.zipMatrixRates;
  if (!matrix || matrix.length === 0) return null;
  const cleanDropoff = dropoffZip?.trim().slice(0, 5);
  const cleanPickup = pickupZip?.trim().slice(0, 5);

  let entry = cleanDropoff
    ? matrix.find((e) => e.zip.trim().slice(0, 5) === cleanDropoff)
    : undefined;
  if (!entry && cleanPickup) {
    entry = matrix.find((e) => e.zip.trim().slice(0, 5) === cleanPickup);
  }
  if (!entry) return null;

  return {
    matchedEntry: entry,
    subtotal: entry.customerCharge,
    auditDetails: [
      `Zip-Code Flat Matrix (${tariff.name}): Zip ${entry.zip} (${entry.city}) -> Customer Charge $${entry.customerCharge.toFixed(2)} (Driver Pay $${(entry.driverPay ?? entry.customerCharge).toFixed(2)})`,
    ],
  };
}

/**
 * Evaluates charter hourly fare.
 */
export function evaluateHourlyFare(
  tariff: TariffProfile,
  durationHours: number,
  distanceMiles: number = 0
): { subtotal: number; auditDetails: string[] } {
  const config = tariff.hourlyConfig ||
    tariff.hourlyRate || {
      ratePerHour: 75.0,
      minimumHours: 2,
      includedMilesPerHour: 20,
      excessMileageRate: 2.5,
    };
  const billableHours = Math.max(config.minimumHours, Math.ceil(durationHours || 1));
  const baseHourlyCost = billableHours * config.ratePerHour;

  let excessMileageCost = 0;
  if (config.includedMilesPerHour && config.excessMileageRate) {
    const includedMiles = billableHours * config.includedMilesPerHour;
    if (distanceMiles > includedMiles) {
      const excessMiles = distanceMiles - includedMiles;
      excessMileageCost = excessMiles * config.excessMileageRate;
    }
  }

  const subtotal = Number((baseHourlyCost + excessMileageCost).toFixed(2));
  return {
    subtotal,
    auditDetails: [
      `Hourly Charter (${tariff.name}): ${billableHours} hrs @ $${config.ratePerHour.toFixed(2)}/hr ($${baseHourlyCost.toFixed(2)})${excessMileageCost > 0 ? ` + Excess mileage $${excessMileageCost.toFixed(2)}` : ''} = $${subtotal.toFixed(2)}`,
    ],
  };
}
