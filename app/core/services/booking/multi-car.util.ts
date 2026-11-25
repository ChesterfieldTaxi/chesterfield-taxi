/**
 * Multi-Vehicle Convoy Utilities
 *
 * Powers linked multi-car bookings so an order requesting N > 1 vehicles creates N separate,
 * independently dispatchable Trip documents that remain linked via `multiCarGroupId` and keep
 * `multiCarAssociates` synchronized across every sibling trip.
 */

import type {
  MultiCarAssociate,
  PriceLineItem,
  Trip,
  TripPricing,
  TripStatus,
} from '../../types/trip';
import { reconcileBreakdownWithoutRounding } from '../../utils/fare-breakdown.util';

export function generateMultiCarGroupId(): string {
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `MC-${ts}-${rand}`;
}

/**
 * Distributes a total count (passengers or bags) evenly across N cars while respecting
 * per-car capacity when available. The returned array ALWAYS sums to `total` (when total >= 0).
 */
export function distributeAcrossCars(
  total: number,
  carCount: number,
  capacities?: number[],
  minPerCar: number = 0
): number[] {
  const n = Math.max(1, Math.floor(carCount));
  const safeTotal = Math.max(0, Math.floor(total));
  if (n === 1) return [safeTotal];

  const caps =
    capacities && capacities.length === n
      ? capacities.map((c) => Math.max(minPerCar, Math.floor(c || 4)))
      : Array.from({ length: n }, () => Math.max(minPerCar, safeTotal));

  const alloc = Array.from({ length: n }, () => 0);
  let remaining = safeTotal;

  // First ensure minPerCar if total permits
  if (minPerCar > 0) {
    for (let i = 0; i < n && remaining > 0; i++) {
      const give = Math.min(minPerCar, remaining);
      alloc[i] += give;
      remaining -= give;
    }
  }

  // Round-robin fill up to capacities so cars are balanced (e.g. 12 pax / 3 cars -> [4, 4, 4])
  let progressed = true;
  while (remaining > 0 && progressed) {
    progressed = false;
    for (let i = 0; i < n && remaining > 0; i++) {
      if (alloc[i] < caps[i]) {
        alloc[i] += 1;
        remaining -= 1;
        progressed = true;
      }
    }
  }

  // If total exceeds combined capacity, distribute overflow round-robin so sum stays exact
  let idx = 0;
  while (remaining > 0) {
    alloc[idx % n] += 1;
    remaining -= 1;
    idx += 1;
  }

  return alloc;
}

export interface PerCarPricingSpec {
  carIndex: number; // 1-based
  vehicleChoice: string;
  vehicleTier: string;
  vehicleDisplayName: string;
  pricing: TripPricing;
  fare: number;
}

function stripOrderExtrasFromBreakdown(
  basePricing: TripPricing,
  targetFare: number
): PriceLineItem[] {
  const existing = Array.isArray(basePricing.breakdown) ? basePricing.breakdown : [];
  if (existing.length === 0) {
    return [
      {
        id: 'base-fare',
        category: 'base',
        label: 'Base Fare',
        amount: Number(targetFare.toFixed(2)),
        sourceType: 'tariff',
      },
    ];
  }

  // Keep non-order-level items (base, surcharges, airport, stops, discounts) and drop car seats / oversized / custom extras
  const filtered = existing.filter((item) => {
    if (item.category === 'extra') return false;
    const idLower = (item.id || '').toLowerCase();
    if (
      idLower.includes('car-seat') ||
      idLower.includes('oversized') ||
      idLower.includes('custom-extra')
    ) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    return [
      {
        id: 'base-fare',
        category: 'base',
        label: 'Base Fare',
        amount: Number(targetFare.toFixed(2)),
        sourceType: 'tariff',
      },
    ];
  }

  return reconcileBreakdownWithoutRounding(filtered, targetFare, basePricing);
}

/**
 * Splits a multi-vehicle quote into N independent per-car TripPricing objects.
 *
 * Invariants:
 * 1. Sum of returned per-car `fare` values ALWAYS equals the intended combined order total.
 * 2. Car #1 carries order-level extras (car seats, oversized cargo, custom extras) so extras are
 *    never double-charged across Cars 2..N.
 * 3. Every car has its own canonical `pricing.breakdown[]` summing to that car's `totalFare`.
 */
export function buildPerVehiclePricingSpecs(params: {
  selectedVehicles: string[];
  resolveTier: (choice: string) => string;
  resolveDisplayName: (choice: string, tier: string) => string;
  vehicleQuotes: Record<string, TripPricing>;
  primaryPricing: TripPricing | null;
  distanceMiles: number;
  durationMinutes: number;
  combinedTargetFare: number;
  isFareOverridden: boolean;
}): PerCarPricingSpec[] {
  const {
    selectedVehicles,
    resolveTier,
    resolveDisplayName,
    vehicleQuotes,
    primaryPricing,
    distanceMiles,
    durationMinutes,
    combinedTargetFare,
    isFareOverridden,
  } = params;

  const choices = selectedVehicles.length > 0 ? selectedVehicles : ['any'];
  const n = choices.length;

  // Manual override: split cleanly across N cars so sum === combinedTargetFare
  if (isFareOverridden) {
    const totalCents = Math.max(0, Math.round(combinedTargetFare * 100));
    const baseCents = Math.floor(totalCents / n);
    const remainderCents = totalCents - baseCents * n;

    return choices.map((choice, idx) => {
      const tier = resolveTier(choice);
      const displayName = resolveDisplayName(choice, tier);
      const carFare = Number(((baseCents + (idx === 0 ? remainderCents : 0)) / 100).toFixed(2));
      const baseRef = vehicleQuotes[tier] || primaryPricing;
      const pricing: TripPricing = {
        ...(baseRef || {
          baseFare: carFare,
          distanceMiles,
          durationMinutes,
          distanceRate: 0,
          timeRate: 0,
          vehicleMultiplier: 1,
          surgeMultiplier: 1,
          discountAmount: 0,
          subtotal: carFare,
          totalFare: carFare,
          currency: 'USD',
        }),
        distanceMiles: distanceMiles || baseRef?.distanceMiles || 0,
        durationMinutes: durationMinutes || baseRef?.durationMinutes || 0,
        subtotal: carFare,
        totalFare: carFare,
        currency: 'USD',
        breakdown: [
          {
            id: 'base-fare',
            category: 'base',
            label: 'Base Fare',
            detail:
              n > 1
                ? `Dispatcher agreed rate (Car ${idx + 1} of ${n})`
                : 'Dispatcher agreed rate',
            amount: carFare,
            sourceType: 'rule',
          },
        ],
      };

      return {
        carIndex: idx + 1,
        vehicleChoice: choice,
        vehicleTier: tier,
        vehicleDisplayName: displayName,
        pricing,
        fare: carFare,
      };
    });
  }

  // Engine-quoted pricing: resolve each vehicle's true engine quote cleanly
  const firstTier = resolveTier(choices[0]);
  const car1Engine = vehicleQuotes[firstTier] || primaryPricing;
  const orderExtrasTotal =
    (car1Engine?.carSeatFee || 0) +
    (car1Engine?.oversizedLuggageFee || 0) +
    (car1Engine?.customExtrasFee || 0);

  const rawSpecs = choices.map((choice, idx) => {
    const tier = resolveTier(choice);
    const displayName = resolveDisplayName(choice, tier);
    const quoteForTier = vehicleQuotes[tier] || car1Engine;

    if (!quoteForTier) {
      const fallbackShare = Number((combinedTargetFare / n).toFixed(2));
      return {
        carIndex: idx + 1,
        vehicleChoice: choice,
        vehicleTier: tier,
        vehicleDisplayName: displayName,
        fare: fallbackShare,
        pricing: {
          baseFare: fallbackShare,
          tariffBaseSubtotal: fallbackShare,
          distanceMiles,
          durationMinutes,
          distanceRate: 0,
          timeRate: 0,
          vehicleMultiplier: 1,
          surgeMultiplier: 1,
          discountAmount: 0,
          subtotal: fallbackShare,
          totalFare: fallbackShare,
          currency: 'USD',
          breakdown: [
            {
              id: 'base-fare',
              category: 'base' as const,
              label: 'Base Fare',
              amount: fallbackShare,
              sourceType: 'tariff' as const,
            },
          ],
        } as TripPricing,
      };
    }

    if (idx === 0) {
      const car1Fare = Math.ceil(quoteForTier.totalFare);
      const baseBreakdown = Array.isArray(quoteForTier.breakdown) ? quoteForTier.breakdown : [];
      const breakdown = reconcileBreakdownWithoutRounding(baseBreakdown, car1Fare, quoteForTier);

      return {
        carIndex: 1,
        vehicleChoice: choice,
        vehicleTier: tier,
        vehicleDisplayName: displayName,
        fare: car1Fare,
        pricing: {
          ...quoteForTier,
          distanceMiles: distanceMiles || quoteForTier.distanceMiles,
          durationMinutes: durationMinutes || quoteForTier.durationMinutes,
          totalFare: car1Fare,
          breakdown,
          currency: quoteForTier.currency || 'USD',
        },
      };
    }

    // Car 2..N: strip order-level extras so car seats / golf bags aren't billed on every vehicle
    const netFare = Math.ceil(Math.max(0, quoteForTier.totalFare - orderExtrasTotal));
    const breakdown = stripOrderExtrasFromBreakdown(quoteForTier, netFare);
    return {
      carIndex: idx + 1,
      vehicleChoice: choice,
      vehicleTier: tier,
      vehicleDisplayName: displayName,
      fare: netFare,
      pricing: {
        ...quoteForTier,
        distanceMiles: distanceMiles || quoteForTier.distanceMiles,
        durationMinutes: durationMinutes || quoteForTier.durationMinutes,
        carSeatFee: 0,
        oversizedLuggageFee: 0,
        customExtrasFee: 0,
        subtotal: netFare,
        totalFare: netFare,
        breakdown,
        currency: quoteForTier.currency || 'USD',
      },
    };
  });

  // If a combined target fare was explicitly balanced (e.g. symmetric round-trip) and differs
  // slightly from the sum of rounded individual cars, absorb tiny residual on Car 1 cleanly
  if (combinedTargetFare > 0 && rawSpecs.length > 0) {
    const currentSum = rawSpecs.reduce((s, item) => s + item.fare, 0);
    const residual = Number((combinedTargetFare - currentSum).toFixed(2));
    if (Math.abs(residual) > 0.005 && Math.abs(residual) <= rawSpecs.length + 2) {
      const first = rawSpecs[0];
      const adjustedFare = Math.max(0, Number((first.fare + residual).toFixed(2)));
      first.fare = adjustedFare;
      first.pricing = {
        ...first.pricing,
        totalFare: adjustedFare,
        breakdown: reconcileBreakdownWithoutRounding(
          first.pricing.breakdown,
          adjustedFare,
          first.pricing
        ),
      };
    }
  }

  return rawSpecs;
}

/**
 * Builds a single MultiCarAssociate entry from a Trip document and optional driver roster info.
 */
export function buildAssociateEntryFromTrip(
  trip: Trip,
  driverOverride?: {
    driverId?: string | null;
    driverName?: string;
    driverPhone?: string;
    vehicleUnit?: string;
    licensePlate?: string;
    vehicleModel?: string;
  }
): MultiCarAssociate {
  const meta = (trip.metadata || {}) as Record<string, any>;
  const resolvedDriverId =
    driverOverride?.driverId !== undefined ? driverOverride.driverId : trip.assignedDriverId ?? null;

  return {
    tripId: trip.id,
    carIndex: trip.multiCarIndex || Number(meta.multiCarIndex) || 1,
    vehicleDisplayName:
      (typeof meta.vehicleDisplayName === 'string' && meta.vehicleDisplayName) ||
      String(trip.vehicleTier || 'Standard'),
    vehicleTier: trip.vehicleTier,
    driverId: resolvedDriverId,
    driverName:
      resolvedDriverId === null
        ? undefined
        : driverOverride?.driverName ||
          (typeof meta.assignedDriverName === 'string' ? meta.assignedDriverName : undefined),
    driverPhone:
      resolvedDriverId === null
        ? undefined
        : driverOverride?.driverPhone ||
          (typeof meta.assignedDriverPhone === 'string' ? meta.assignedDriverPhone : undefined),
    vehicleUnit:
      resolvedDriverId === null
        ? undefined
        : driverOverride?.vehicleUnit || trip.assignedVehicle?.vehicleNumber,
    licensePlate:
      resolvedDriverId === null
        ? undefined
        : driverOverride?.licensePlate || trip.assignedVehicle?.licensePlate,
    vehicleModel:
      resolvedDriverId === null
        ? undefined
        : driverOverride?.vehicleModel || trip.assignedVehicle?.model,
    status: trip.status,
  };
}

/**
 * Upserts a single trip's updated associate entry into an existing MultiCarAssociate[] list
 * and computes the deduplicated `multiCarDriverIds` array for Firestore security rules.
 */
export function mergeMultiCarAssociateUpdate(
  existingAssociates: MultiCarAssociate[] | undefined,
  updatedEntry: MultiCarAssociate
): { associates: MultiCarAssociate[]; driverIds: string[] } {
  const list = Array.isArray(existingAssociates) ? [...existingAssociates] : [];
  const idx = list.findIndex((a) => a.tripId === updatedEntry.tripId);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...updatedEntry };
  } else {
    list.push(updatedEntry);
  }
  list.sort((a, b) => (a.carIndex || 0) - (b.carIndex || 0));

  const driverIds = Array.from(
    new Set(
      list
        .map((a) => a.driverId)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    )
  );

  return { associates: list, driverIds };
}
