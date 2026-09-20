/**
 * TaxiCaller-Style Unified Tariff Service
 * 
 * Manages self-contained Tariff Profiles (Taximeter step rates, corridor matrices,
 * rule triggers, and extras) with Firestore persistence, local caching,
 * and pure matching helpers.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import type { TariffProfile, TariffCorridor, TariffTaximeterRate } from '../../types/tariff';
import type { PricingInput } from './types';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import { SMOKE_HOUSE_2023_RATES } from './smoke-house-rates.data';

const TARIFFS_STORAGE_KEY = 'chesterfield_taxi_tariff_profiles_v5';


export const DEFAULT_TARIFF_PROFILES: TariffProfile[] = [
  {
    id: 'tariff-airport-flat',
    name: 'Airport Flat Rate',
    description: 'Flat rate airport transfer tariff to/from Lambert International (STL) and Spirit of St. Louis (SUS).',
    rateModel: 'taximeter',
    currency: 'USD',
    units: 'imperial',
    fareIncrement: 0.10,
    priority: 95,
    isActive: true,
    isDefault: false,
    allowSurgeMultiplier: false,
    allowOperationalSurcharges: false,
    triggers: {

      zoneIds: ['zone-lambert-airport', 'zone-spirit-airport'],
      zoneGroupIds: ['group-regional-aviation', 'group-airports'],
      vehicleTiers: ['standard', 'sedan', 'premium', 'xl', 'van', 'suv', 'wheelchair'],
      vehicleTypes: ['sedan', 'suv', 'minivan', 'van', 'wheelchair_wav'],
      vehicleClasses: ['standard', 'executive', 'xl', 'medical', 'delivery'],
    },

    taximeter: {
      startPrice: 0.00,
      initialDistanceIncluded: 0,
      initialTimeIncluded: 0,
      primaryDistanceStep: 0.1, // 176 yards
      primaryDistanceRate: 0.255, // $0.255/0.1 mi ($2.55/mi)
      primaryDistanceLimit: 20.0, // First 20 miles
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.230, // $0.23/0.1 mi ($2.30/mi after 20 mi)
      freeTrafficMinutes: 9999,
      waitingRatePerStep: 0.00, // No traffic overcharge on airport transfers
      waitingStepSeconds: 60,
      minimumPrice: 28.00, // $28 minimum floor
    },
    taximeterRate: {
      startPrice: 0.00,
      initialDistanceIncluded: 0,
      initialTimeIncluded: 0,
      primaryDistanceStep: 0.1,
      primaryDistanceRate: 0.255,
      primaryDistanceLimit: 20.0,
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.230,
      freeTrafficMinutes: 9999,
      waitingRatePerStep: 0.00,
      waitingStepSeconds: 60,
      minimumPrice: 28.00,
    },
    corridors: [],
    extras: {
      carSeatFeePerUnit: 10.00,
      passengerBaseAllowance: 1,
      extraPassengerFeePerHead: 1.00,
      customSurcharges: [],
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'tariff-point-to-point-meter',
    name: 'METER',
    description: 'City taximeter tariff for standard non-airport passenger trips across Chesterfield and St. Louis metro ($4.50 first 0.1 mi, $0.30/0.1 mi after with $40.00/hour waiting time).',
    rateModel: 'taximeter',
    currency: 'USD',
    units: 'imperial',
    fareIncrement: 0.10,
    priority: 80,
    isActive: true,
    isDefault: true,
    allowSurgeMultiplier: true,
    allowOperationalSurcharges: true,
    triggers: {},
    taximeter: {
      startPrice: 4.50, // $4.50 first 0.1 mi
      initialDistanceIncluded: 0.1,
      initialTimeIncluded: 0,
      primaryDistanceStep: 0.1,
      primaryDistanceRate: 0.30, // $0.30/0.1 mi ($3.00/mile)
      primaryDistanceLimit: 999.0,
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.30,
      freeTrafficMinutes: 5,
      waitingRatePerStep: 0.667, // $40.00/hour waiting time ($0.667/minute)
      waitingStepSeconds: 60,
      minimumPrice: 4.50, // $4.50 minimum
    },
    taximeterRate: {
      startPrice: 4.50,
      initialDistanceIncluded: 0.1,
      initialTimeIncluded: 0,
      primaryDistanceStep: 0.1,
      primaryDistanceRate: 0.30,
      primaryDistanceLimit: 999.0,
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.30,
      freeTrafficMinutes: 5,
      waitingRatePerStep: 0.667,
      waitingStepSeconds: 60,
      minimumPrice: 4.50,
    },
    corridors: [],
    extras: {
      carSeatFeePerUnit: 10.00,
      passengerBaseAllowance: 1,
      extraPassengerFeePerHead: 1.00,
      customSurcharges: [],
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];


export class TariffService {
  private cache: TariffProfile[] | null = null;

  public async getTariffs(): Promise<TariffProfile[]> {
    if (this.cache && this.cache.length > 0) {
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
            const list = snap.docs.map((d) => d.data() as TariffProfile);
            this.cache = list;
            this.saveToLocalStorage(list);
            return list;
          }
        }
      } catch (err) {
        console.warn('[TariffService] Firestore fetch error, using local fallback:', err);
      }
    }

    if (!this.cache || this.cache.length === 0) {
      this.cache = [...DEFAULT_TARIFF_PROFILES];
      this.saveToLocalStorage(this.cache);
    }

    return this.cache.filter((t) => t.id === 'tariff-airport-flat' || t.id === 'tariff-point-to-point-meter');
  }

  public getAllTariffProfiles(): TariffProfile[] {
    const local = this.loadFromLocalStorage();
    const source = local && local.length > 0 ? local : this.cache && this.cache.length > 0 ? this.cache : DEFAULT_TARIFF_PROFILES;
    return source.filter((t) => t.id === 'tariff-airport-flat' || t.id === 'tariff-point-to-point-meter');
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
    const updated = {
      ...tariff,
      updatedAt: new Date().toISOString(),
    };

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
            const list = snap.docs.map((d) => d.data() as TariffProfile);
            this.cache = list;
            this.saveToLocalStorage(list);
            onUpdate(list);
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
      // Clean up legacy keys from earlier iterations
      window.localStorage.removeItem('chesterfield_taxi_tariff_profiles');
      window.localStorage.removeItem('chesterfield_taxi_pricing_tariffs_v2');
      window.localStorage.removeItem('chesterfield_taxi_tariff_profiles_v3');
      window.localStorage.removeItem('chesterfield_taxi_tariff_profiles_v4');

      const stored = window.localStorage.getItem(TARIFFS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as TariffProfile[];
        // Filter strictly to the 2 primary tariffs
        const filtered = parsed.filter(
          (t) => t.id === 'tariff-airport-flat' || t.id === 'tariff-point-to-point-meter'
        );
        // If legacy tariffs were present or missing required profiles, reseed defaults
        if (filtered.length !== 2) {
          this.saveToLocalStorage(DEFAULT_TARIFF_PROFILES);
          return [...DEFAULT_TARIFF_PROFILES];
        }
        return filtered;
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
 * Pure Functional Matching: Finds the active TariffProfile matching the input trip.
 */
export function matchTariffProfile(
  input: PricingInput,
  tariffs: TariffProfile[] = DEFAULT_TARIFF_PROFILES
): TariffProfile {
  // If specific tariff ID explicitly requested
  if (input.selectedRuleId) {
    const explicit = tariffs.find((t) => t.id === input.selectedRuleId && t.isActive && !t.isArchived);
    if (explicit) return explicit;
  }

  const activeTariffs = tariffs.filter((t) => t.isActive && !t.isArchived);
  if (activeTariffs.length === 0) {
    return DEFAULT_TARIFF_PROFILES[0];
  }

  // If hourly booking requested
  if (input.isHourlyBooking) {
    const hourlyTariff = activeTariffs.find((t) => t.rateModel === 'hourly' || t.id === 'tariff-hourly-charter');
    if (hourlyTariff) return resolveTariffProfile(hourlyTariff, tariffs);
  }

  // If corporate account requested
  if (input.corporateAccountId) {
    const corporateTariff = activeTariffs.find((t) => t.triggers.accountIds?.includes(input.corporateAccountId!));
    if (corporateTariff) return resolveTariffProfile(corporateTariff, tariffs);
  }

  const requestedTier = (input.vehicleTier || 'standard').toLowerCase();

  // Parse pickup day and time
  let dayOfWeek: number | undefined;
  let timeStr: string | undefined;
  if (input.pickupDateTime) {
    const dt = typeof input.pickupDateTime === 'string' ? new Date(input.pickupDateTime) : input.pickupDateTime;
    if (!isNaN(dt.getTime())) {
      dayOfWeek = dt.getDay();
      const hh = String(dt.getHours()).padStart(2, '0');
      const mm = String(dt.getMinutes()).padStart(2, '0');
      timeStr = `${hh}:${mm}`;
    }
  }

  // Filter candidates matching vehicle tier and schedule
  const candidates = activeTariffs.filter((t) => {
    // Account ID requirement check: If tariff has accountIds, ONLY match if input.corporateAccountId matches
    if (t.triggers.accountIds && t.triggers.accountIds.length > 0) {

      if (!input.corporateAccountId || !t.triggers.accountIds.includes(input.corporateAccountId)) {
        return false;
      }
    }

    // Hourly rate model check: only match if isHourlyBooking
    if (t.rateModel === 'hourly' && !input.isHourlyBooking) {
      return false;
    }

    // Zip matrix rate model check: only match if corporateAccountId is specified
    if (t.rateModel === 'zip_matrix' && !input.corporateAccountId) {
      return false;
    }

    // Zone IDs check (e.g. Airport Transfer flat rate zones)
    if (t.triggers.zoneIds && t.triggers.zoneIds.length > 0) {
      const allTripZones = [
        ...(input.zoneIds || []),
        ...(input.originZoneId ? [input.originZoneId] : []),
        ...(input.destinationZoneId ? [input.destinationZoneId] : []),
      ];
      const isAirportIntent = Boolean(input.isAirportPickup || input.isAirportDropoff || input.isAirportTrip);
      const matchZone =
        allTripZones.some((zid) => t.triggers.zoneIds!.includes(zid)) ||
        (t.id === 'tariff-airport-flat' && isAirportIntent);
      if (!matchZone) return false;
    }

    // Zone Group check
    if (t.triggers.zoneGroupIds && t.triggers.zoneGroupIds.length > 0) {
      const matchGroup = input.zoneGroupIds?.some((gid) => t.triggers.zoneGroupIds!.includes(gid));
      if (!matchGroup) return false;
    }


    // Dual vehicle types & classes check
    if (t.triggers.vehicleTypes && t.triggers.vehicleTypes.length > 0 && input.vehicleType) {
      if (!t.triggers.vehicleTypes.includes(input.vehicleType)) return false;
    }
    if (t.triggers.vehicleClasses && t.triggers.vehicleClasses.length > 0 && input.vehicleClass) {
      if (!t.triggers.vehicleClasses.includes(input.vehicleClass)) return false;
    }


    // Vehicle tier check
    if (t.triggers.vehicleTiers && t.triggers.vehicleTiers.length > 0) {
      if (requestedTier !== 'any') {
        const matchVehicle = t.triggers.vehicleTiers.some((tier) => {
          const lower = tier.toLowerCase();
          return (
            lower === requestedTier ||
            (lower === 'sedan' && (requestedTier === 'standard' || requestedTier === 'premium')) ||
            (lower === 'standard' && (requestedTier === 'sedan' || requestedTier === 'premium')) ||
            (lower === 'van' && (requestedTier === 'xl' || requestedTier === 'wheelchair' || requestedTier === 'suv')) ||
            (lower === 'xl' && (requestedTier === 'van' || requestedTier === 'wheelchair' || requestedTier === 'suv')) ||
            (lower === 'suv' && (requestedTier === 'xl' || requestedTier === 'van' || requestedTier === 'wheelchair')) ||
            (lower === 'wheelchair' && (requestedTier === 'van' || requestedTier === 'xl'))
          );
        });
        if (!matchVehicle) return false;
      }
    }

    // Day of week check
    if (dayOfWeek !== undefined && t.triggers.daysOfWeek && t.triggers.daysOfWeek.length > 0) {
      if (!t.triggers.daysOfWeek.includes(dayOfWeek)) return false;
    }

    // Time window check
    if (timeStr && t.triggers.timeWindows && t.triggers.timeWindows.length > 0) {
      const inWindow = t.triggers.timeWindows.some((w) => timeStr! >= w.start && timeStr! <= w.end);
      if (!inWindow) return false;
    }

    return true;
  });


  let matched: TariffProfile | undefined;
  if (candidates.length > 0) {
    // Sort by priority descending
    candidates.sort((a, b) => b.priority - a.priority);
    matched = candidates[0];
  } else {
    // Fallback to default or first active tariff
    matched = activeTariffs.find((t) => t.isDefault) || activeTariffs[0] || DEFAULT_TARIFF_PROFILES[0];
  }

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
    return tariff;
  }
  const parent = allTariffs.find((t) => t.id === tariff.parentTariffId);
  if (!parent) {
    return tariff;
  }
  // Recursively resolve parent if parent also inherits
  const resolvedParent = resolveTariffProfile(parent, allTariffs);
  const inh = tariff.inheritance;

  return {
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
  };
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

  const originZone = input.originZoneId || (input.zoneIds && input.zoneIds[0]);
  const destZone = input.destinationZoneId || (input.zoneIds && input.zoneIds[1]);

  if (!originZone && !destZone && (!input.locationCollectionIds || input.locationCollectionIds.length === 0)) {
    return undefined;
  }

  const collectionIds = input.locationCollectionIds || [];

  for (const corridor of profile.corridors) {
    const matchesForward =
      (!corridor.fromZoneId || corridor.fromZoneId === originZone) &&
      (!corridor.toZoneId || corridor.toZoneId === destZone) &&
      (!corridor.fromLocationCollectionId || collectionIds.includes(corridor.fromLocationCollectionId)) &&
      (!corridor.toLocationCollectionId || collectionIds.includes(corridor.toLocationCollectionId));

    if (matchesForward && (originZone || destZone || collectionIds.length > 0)) {
      return corridor;
    }

    // Two-way return match
    if (corridor.allowReturn) {
      const matchesReturn =
        (!corridor.fromZoneId || corridor.fromZoneId === destZone) &&
        (!corridor.toZoneId || corridor.toZoneId === originZone) &&
        (!corridor.fromLocationCollectionId || collectionIds.includes(corridor.fromLocationCollectionId)) &&
        (!corridor.toLocationCollectionId || collectionIds.includes(corridor.toLocationCollectionId));

      if (matchesReturn && (originZone || destZone || collectionIds.length > 0)) {
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
  distanceMiles: number,
  durationMinutes: number
): {
  baseFare: number;
  distanceFare: number;
  delayFare: number;
  subtotal: number;
  isFloorApplied: boolean;
  auditDetails: string[];
} {
  const auditDetails: string[] = [];
  const baseFare = Number(taximeter.startPrice.toFixed(2));
  auditDetails.push(`Start price (flag drop): $${baseFare.toFixed(2)}`);

  // Distance computation
  const chargeableDistance = Math.max(0, distanceMiles - (taximeter.initialDistanceIncluded || 0));
  let distanceFare = 0;

  if (chargeableDistance > 0) {
    // 1. Primary step bracket (0 to primaryLimit)
    const primaryLimit = taximeter.primaryDistanceLimit || 20.0;
    const primaryMiles = Math.min(chargeableDistance, primaryLimit);
    const primaryStep = taximeter.primaryDistanceStep || 0.1;
    const primarySteps = Math.ceil(primaryMiles / primaryStep);
    const primaryRate = taximeter.primaryDistanceRate || 0.255;
    const primaryCost = Number((primarySteps * primaryRate).toFixed(2));
    distanceFare += primaryCost;
    auditDetails.push(
      `Primary distance (0-${primaryLimit.toFixed(1)} mi): ${primaryMiles.toFixed(1)} mi (${primarySteps} steps @ $${primaryRate.toFixed(3)}/step) = $${primaryCost.toFixed(2)}`
    );

    // 2. Intermediate increment brackets (between primary limit and then rate)
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

    // 3. Open-ended "Then" tier for all remaining miles
    const remainingMiles = Math.max(0, chargeableDistance - processedDistance);
    if (remainingMiles > 0) {
      const thenStep = taximeter.thenDistanceStep || 0.1;
      const thenSteps = Math.ceil(remainingMiles / thenStep);
      const thenRate = taximeter.thenDistanceRate || 0.230;
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
  if (durationMinutes > freeMins) {
    const excessSeconds = Math.max(0, (durationMinutes - freeMins) * 60);
    const stepSecs = taximeter.waitingStepSeconds || 90;
    const waitSteps = Math.ceil(excessSeconds / stepSecs);
    const waitRate = taximeter.waitingRatePerStep ?? 0.00;
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

  // Ceiling dollar rounding: Round up to next dollar
  const ceilSubtotal = Math.ceil(calculatedSubtotal);
  if (ceilSubtotal > calculatedSubtotal) {
    auditDetails.push(
      `Ceiling dollar rounding: $${calculatedSubtotal.toFixed(2)} -> $${ceilSubtotal.toFixed(2)}`
    );
    calculatedSubtotal = ceilSubtotal;
  }

  return {
    baseFare,
    distanceFare: Number(distanceFare.toFixed(2)),
    delayFare: Number(delayFare.toFixed(2)),
    subtotal: calculatedSubtotal,
    isFloorApplied,
    auditDetails,
  };
}

/**
 * Evaluates agreed customer charge & driver pay from a Zip-code matrix (e.g. Smoke House Chesterfield).
 */
export function evaluateZipMatrixFare(
  tariff: TariffProfile,
  pickupZip?: string,
  dropoffZip?: string
): { matchedEntry: import('../../types/tariff').ZipRateMatrixEntry; subtotal: number; auditDetails: string[] } | null {
  if (!tariff.zipMatrix || tariff.zipMatrix.length === 0) return null;
  const cleanDropoff = dropoffZip?.trim().slice(0, 5);
  const cleanPickup = pickupZip?.trim().slice(0, 5);

  let entry = cleanDropoff ? tariff.zipMatrix.find((e) => e.zip.trim().slice(0, 5) === cleanDropoff) : undefined;
  if (!entry && cleanPickup) {
    entry = tariff.zipMatrix.find((e) => e.zip.trim().slice(0, 5) === cleanPickup);
  }
  if (!entry) return null;


  return {
    matchedEntry: entry,
    subtotal: entry.customerCharge,
    auditDetails: [
      `Zip-Code Flat Matrix (${tariff.name}): Zip ${entry.zip} (${entry.city}) -> Customer Charge $${entry.customerCharge.toFixed(2)} (Driver Pay $${(entry.driverPay ?? entry.customerCharge).toFixed(2)})`
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
  const config = tariff.hourlyConfig || { ratePerHour: 75.0, minimumHours: 2, includedMilesPerHour: 20, excessMileageRate: 2.50 };
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
      `Hourly Charter (${tariff.name}): ${billableHours} hrs @ $${config.ratePerHour.toFixed(2)}/hr ($${baseHourlyCost.toFixed(2)})${excessMileageCost > 0 ? ` + Excess mileage $${excessMileageCost.toFixed(2)}` : ''} = $${subtotal.toFixed(2)}`
    ],
  };
}


