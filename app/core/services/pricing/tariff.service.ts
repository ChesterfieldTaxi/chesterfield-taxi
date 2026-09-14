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

const TARIFFS_STORAGE_KEY = 'chesterfield_taxi_tariff_profiles';

export const DEFAULT_TARIFF_PROFILES: TariffProfile[] = [
  {
    id: 'tariff-standard-flat',
    name: 'Standard Flat Rate',
    currency: 'USD',
    units: 'imperial',
    fareIncrement: 2.50,
    priority: 90,
    isActive: true,
    isDefault: true,
    triggers: {
      vehicleTiers: ['standard', 'sedan'],
    },
    taximeter: {
      startPrice: 5.00,
      initialDistanceIncluded: 0,
      initialTimeIncluded: 0,
      primaryDistanceStep: 0.1, // 176 yards
      primaryDistanceRate: 0.255, // $2.55/mi
      primaryDistanceLimit: 20.0, // 35200 yards
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.230, // $2.30/mi (open-ended "then" step rate)
      freeTrafficMinutes: 5.0,
      waitingRatePerStep: 0.60,
      waitingStepSeconds: 90,
      minimumPrice: 15.00,
    },
    corridors: [
      {
        id: 'corridor-chesterfield-lambert',
        name: 'Chesterfield Valley ➔ Lambert Airport (STL)',
        fromZoneId: 'zone-chesterfield-valley',
        toZoneId: 'zone-lambert-airport',
        flatPrice: 48.00,
        allowReturn: true,
        priorityRank: 95,
      },
      {
        id: 'corridor-spirit-downtown',
        name: 'Spirit Airport (SUS) ➔ Downtown St. Louis',
        fromZoneId: 'zone-spirit-airport',
        toZoneId: 'zone-downtown-stl',
        flatPrice: 65.00,
        allowReturn: true,
        priorityRank: 90,
      },
      {
        id: 'corridor-chesterfield-spirit',
        name: 'Chesterfield Hub ➔ Spirit Airport (SUS)',
        fromZoneId: 'zone-chesterfield-mall',
        toZoneId: 'zone-spirit-airport',
        flatPrice: 30.00,
        allowReturn: true,
        priorityRank: 85,
      },
    ],
    extras: {
      carSeatFeePerUnit: 5.00,
      passengerBaseAllowance: 2,
      extraPassengerFeePerHead: 3.00,
      customSurcharges: [
        { id: 'extra-gate-stl', name: 'Lambert Terminal Gate Fee', amount: 4.00, type: 'flat' },
      ],
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'tariff-minivan-flat',
    name: 'MiniVan Flat Rate',
    currency: 'USD',
    units: 'imperial',
    fareIncrement: 2.50,
    priority: 85,
    isActive: true,
    isDefault: false,
    triggers: {
      vehicleTiers: ['xl', 'van', 'suv'],
    },
    taximeter: {
      startPrice: 8.00,
      initialDistanceIncluded: 0,
      initialTimeIncluded: 0,
      primaryDistanceStep: 0.1,
      primaryDistanceRate: 0.320, // $3.20/mi
      primaryDistanceLimit: 20.0,
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.280, // $2.80/mi
      freeTrafficMinutes: 5.0,
      waitingRatePerStep: 0.75,
      waitingStepSeconds: 90,
      minimumPrice: 25.00,
    },
    corridors: [
      {
        id: 'corridor-minivan-chesterfield-lambert',
        name: 'MiniVan: Chesterfield Valley ➔ Lambert Airport (STL)',
        fromZoneId: 'zone-chesterfield-valley',
        toZoneId: 'zone-lambert-airport',
        flatPrice: 68.00,
        allowReturn: true,
        priorityRank: 95,
      },
      {
        id: 'corridor-minivan-spirit-downtown',
        name: 'MiniVan: Spirit Airport (SUS) ➔ Downtown St. Louis',
        fromZoneId: 'zone-spirit-airport',
        toZoneId: 'zone-downtown-stl',
        flatPrice: 85.00,
        allowReturn: true,
        priorityRank: 90,
      },
    ],
    extras: {
      carSeatFeePerUnit: 5.00,
      passengerBaseAllowance: 4,
      extraPassengerFeePerHead: 3.00,
      customSurcharges: [
        { id: 'extra-gate-stl', name: 'Lambert Terminal Gate Fee', amount: 4.00, type: 'flat' },
      ],
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'tariff-meter-standard',
    name: 'METER',
    currency: 'USD',
    units: 'imperial',
    fareIncrement: 0.10,
    priority: 80,
    isActive: true,
    isDefault: false,
    triggers: {
      vehicleTiers: ['standard', 'wheelchair'],
    },
    taximeter: {
      startPrice: 4.50,
      initialDistanceIncluded: 0,
      initialTimeIncluded: 0,
      primaryDistanceStep: 0.1,
      primaryDistanceRate: 0.250, // $2.50/mi
      primaryDistanceLimit: 20.0,
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.225, // $2.25/mi
      freeTrafficMinutes: 3.0,
      waitingRatePerStep: 0.60,
      waitingStepSeconds: 90,
      minimumPrice: 10.00,
    },
    corridors: [],
    extras: {
      carSeatFeePerUnit: 5.00,
      passengerBaseAllowance: 2,
      extraPassengerFeePerHead: 3.00,
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'tariff-meter-minivan',
    name: 'MiniVan METER',
    currency: 'USD',
    units: 'imperial',
    fareIncrement: 0.10,
    priority: 75,
    isActive: true,
    isDefault: false,
    triggers: {
      vehicleTiers: ['xl', 'van'],
    },
    taximeter: {
      startPrice: 7.00,
      initialDistanceIncluded: 0,
      initialTimeIncluded: 0,
      primaryDistanceStep: 0.1,
      primaryDistanceRate: 0.300, // $3.00/mi
      primaryDistanceLimit: 20.0,
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.270, // $2.70/mi
      freeTrafficMinutes: 3.0,
      waitingRatePerStep: 0.75,
      waitingStepSeconds: 90,
      minimumPrice: 18.00,
    },
    corridors: [],
    extras: {
      carSeatFeePerUnit: 5.00,
      passengerBaseAllowance: 4,
      extraPassengerFeePerHead: 3.00,
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

    return [...this.cache];
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
      const stored = window.localStorage.getItem(TARIFFS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as TariffProfile[];
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
    const explicit = tariffs.find((t) => t.id === input.selectedRuleId && t.isActive);
    if (explicit) return explicit;
  }

  const activeTariffs = tariffs.filter((t) => t.isActive);
  if (activeTariffs.length === 0) {
    return DEFAULT_TARIFF_PROFILES[0];
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
    // Vehicle tier check
    if (t.triggers.vehicleTiers && t.triggers.vehicleTiers.length > 0) {
      const matchVehicle = t.triggers.vehicleTiers.some((tier) => {
        const lower = tier.toLowerCase();
        return lower === requestedTier || (lower === 'sedan' && requestedTier === 'standard') || (lower === 'van' && requestedTier === 'xl');
      });
      if (!matchVehicle) return false;
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
    const waitRate = taximeter.waitingRatePerStep || 0.60;
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
    isFloorApplied,
    auditDetails,
  };
}

