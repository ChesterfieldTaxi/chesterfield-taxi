import { useEffect, useMemo, useRef } from 'react';
import type { GeoPoint } from '../../types';
import {
  detectAirportInAddresses,
  type AirportDetectionResult,
} from '../../config/airports';
import type { VehicleCapacityInfo } from './booking-form.utils';

export interface RouteEndpointsSlice {
  pickupAddress: string;
  pickupCoordinates?: GeoPoint;
  pickupPlaceId?: string;
  dropoffAddress: string;
  dropoffCoordinates?: GeoPoint;
  dropoffPlaceId?: string;
}

export function swapRouteEndpoints(route: RouteEndpointsSlice): RouteEndpointsSlice {
  return {
    pickupAddress: route.dropoffAddress,
    pickupCoordinates: route.dropoffCoordinates,
    pickupPlaceId: route.dropoffPlaceId,
    dropoffAddress: route.pickupAddress,
    dropoffCoordinates: route.pickupCoordinates,
    dropoffPlaceId: route.pickupPlaceId,
  };
}

export function swapReturnRouteEndpoints<TStop = unknown>(params: {
  returnPickupAddress: string;
  returnPickupCoordinates?: GeoPoint;
  returnPickupPlaceId?: string;
  returnDropoffAddress: string;
  returnDropoffCoordinates?: GeoPoint;
  returnDropoffPlaceId?: string;
  fallbackOutbound?: RouteEndpointsSlice;
  returnIntermediateStops?: TStop[];
  reverseStops?: boolean;
}): {
  returnPickupAddress: string;
  returnPickupCoordinates?: GeoPoint;
  returnPickupPlaceId?: string;
  returnDropoffAddress: string;
  returnDropoffCoordinates?: GeoPoint;
  returnDropoffPlaceId?: string;
  returnIntermediateStops?: TStop[];
} {
  const { fallbackOutbound } = params;
  const currentPickupAddr = fallbackOutbound
    ? params.returnPickupAddress || fallbackOutbound.dropoffAddress
    : params.returnPickupAddress;
  const currentDropoffAddr = fallbackOutbound
    ? params.returnDropoffAddress || fallbackOutbound.pickupAddress
    : params.returnDropoffAddress;
  const currentPickupCoords = fallbackOutbound
    ? params.returnPickupCoordinates || fallbackOutbound.dropoffCoordinates
    : params.returnPickupCoordinates;
  const currentDropoffCoords = fallbackOutbound
    ? params.returnDropoffCoordinates || fallbackOutbound.pickupCoordinates
    : params.returnDropoffCoordinates;
  const currentPickupPid = fallbackOutbound
    ? params.returnPickupPlaceId || fallbackOutbound.dropoffPlaceId
    : params.returnPickupPlaceId;
  const currentDropoffPid = fallbackOutbound
    ? params.returnDropoffPlaceId || fallbackOutbound.pickupPlaceId
    : params.returnDropoffPlaceId;

  return {
    returnPickupAddress: currentDropoffAddr,
    returnPickupCoordinates: currentDropoffCoords,
    returnPickupPlaceId: currentDropoffPid,
    returnDropoffAddress: currentPickupAddr,
    returnDropoffCoordinates: currentPickupCoords,
    returnDropoffPlaceId: currentPickupPid,
    returnIntermediateStops:
      params.reverseStops && params.returnIntermediateStops
        ? [...params.returnIntermediateStops].reverse()
        : params.returnIntermediateStops,
  };
}

export interface OutboundLegSnapshot<TVehicle extends string = string> {
  pickupAddress: string;
  pickupCoordinates?: GeoPoint;
  dropoffAddress: string;
  dropoffCoordinates?: GeoPoint;
  passengers: number;
  carryOnBags: number;
  checkedBags: number;
  bags: number;
  hasOversizedLuggage: boolean;
  oversizedBags: Record<string, number>;
  oversizedLuggageNotes: string;
  selectedCustomExtras?: Record<string, number>;
  carSeats: boolean;
  rearFacingCount: number;
  frontFacingCount: number;
  boosterCount: number;
  vehicleChoice?: TVehicle;
  selectedVehicles: TVehicle[];
}

export interface SeededReturnLegState<TVehicle extends string = string> {
  returnPickupAddress: string;
  returnPickupCoordinates?: GeoPoint;
  returnDropoffAddress: string;
  returnDropoffCoordinates?: GeoPoint;
  returnPassengers: number;
  returnCarryOnBags: number;
  returnCheckedBags: number;
  returnBags: number;
  returnHasOversizedLuggage: boolean;
  returnOversizedBags: Record<string, number>;
  returnOversizedLuggageNotes: string;
  returnSelectedCustomExtras: Record<string, number>;
  returnCarSeats: boolean;
  returnRearFacing: number;
  returnFrontFacing: number;
  returnBooster: number;
  returnVehicleChoice: TVehicle;
  returnSelectedVehicles: TVehicle[];
}

export function buildReturnLegSeedFromOutbound<TVehicle extends string = string>(
  outbound: OutboundLegSnapshot<TVehicle>,
  existingReturn?: {
    returnPickupAddress?: string;
    returnPickupCoordinates?: GeoPoint;
    returnDropoffAddress?: string;
    returnDropoffCoordinates?: GeoPoint;
  },
  options?: { preserveCoordsWhenAddressPresent?: boolean }
): SeededReturnLegState<TVehicle> {
  const hasExistingPickup = Boolean(existingReturn?.returnPickupAddress);
  const hasExistingDropoff = Boolean(existingReturn?.returnDropoffAddress);

  const returnPickupCoordinates = options?.preserveCoordsWhenAddressPresent
    ? hasExistingPickup
      ? existingReturn?.returnPickupCoordinates
      : outbound.dropoffCoordinates ?? existingReturn?.returnPickupCoordinates
    : existingReturn?.returnPickupCoordinates || outbound.dropoffCoordinates;

  const returnDropoffCoordinates = options?.preserveCoordsWhenAddressPresent
    ? hasExistingDropoff
      ? existingReturn?.returnDropoffCoordinates
      : outbound.pickupCoordinates ?? existingReturn?.returnDropoffCoordinates
    : existingReturn?.returnDropoffCoordinates || outbound.pickupCoordinates;

  const fallbackVehicle = (outbound.vehicleChoice ??
    outbound.selectedVehicles[0] ??
    ('any' as TVehicle)) as TVehicle;

  return {
    returnPickupAddress: existingReturn?.returnPickupAddress || outbound.dropoffAddress,
    returnPickupCoordinates,
    returnDropoffAddress: existingReturn?.returnDropoffAddress || outbound.pickupAddress,
    returnDropoffCoordinates,
    returnPassengers: outbound.passengers,
    returnCarryOnBags: outbound.carryOnBags,
    returnCheckedBags: outbound.checkedBags,
    returnBags: outbound.bags,
    returnHasOversizedLuggage: outbound.hasOversizedLuggage,
    returnOversizedBags: { ...(outbound.oversizedBags || {}) },
    returnOversizedLuggageNotes: outbound.oversizedLuggageNotes,
    returnSelectedCustomExtras: { ...(outbound.selectedCustomExtras || {}) },
    returnCarSeats: outbound.carSeats,
    returnRearFacing: outbound.rearFacingCount,
    returnFrontFacing: outbound.frontFacingCount,
    returnBooster: outbound.boosterCount,
    returnVehicleChoice: fallbackVehicle,
    returnSelectedVehicles: [...outbound.selectedVehicles],
  };
}

export interface SymmetricRoundTripCheckParams {
  returnTrip: boolean;
  pickupAddress: string;
  dropoffAddress: string;
  returnPickupAddress: string;
  returnDropoffAddress: string;
  intermediateStops: Array<{ address?: string }>;
  returnIntermediateStops: Array<{ address?: string }>;
  passengers: number;
  returnPassengers: number;
  bags: number;
  returnBags: number;
  selectedVehicles: string[];
  returnSelectedVehicles: string[];
  carSeats: boolean;
  returnCarSeats: boolean;
  rearFacingCount: number;
  returnRearFacing: number;
  frontFacingCount: number;
  returnFrontFacing: number;
  boosterCount: number;
  returnBooster: number;
  hasOversizedLuggage: boolean;
  returnHasOversizedLuggage: boolean;
  oversizedBags?: Record<string, number>;
  returnOversizedBags?: Record<string, number>;
  requireNonEmptyEndpoints?: boolean;
  ignoreBlankStops?: boolean;
  vehicleChoice?: string;
  returnVehicleChoice?: string;
  selectedCustomExtras?: Record<string, number>;
  returnSelectedCustomExtras?: Record<string, number>;
}

export function checkSymmetricRoundTrip(params: SymmetricRoundTripCheckParams): boolean {
  if (!params.returnTrip) return false;

  const outP = params.pickupAddress.trim().toLowerCase();
  const outD = params.dropoffAddress.trim().toLowerCase();
  if (params.requireNonEmptyEndpoints && (!outP || !outD)) return false;

  const retP = (params.returnPickupAddress.trim() || params.dropoffAddress.trim()).toLowerCase();
  const retD = (params.returnDropoffAddress.trim() || params.pickupAddress.trim()).toLowerCase();

  const outStops = params.ignoreBlankStops
    ? params.intermediateStops.filter((s) => s.address?.trim()).length
    : params.intermediateStops.length;
  const retStops = params.ignoreBlankStops
    ? params.returnIntermediateStops.filter((s) => s.address?.trim()).length
    : params.returnIntermediateStops.length;

  if (retP !== outD || retD !== outP) return false;
  if (outStops !== retStops) return false;
  if (params.returnPassengers !== params.passengers) return false;
  if (params.returnBags !== params.bags) return false;

  if (
    params.vehicleChoice !== undefined &&
    params.returnVehicleChoice !== undefined &&
    params.returnVehicleChoice !== params.vehicleChoice
  ) {
    return false;
  }

  if (
    JSON.stringify(params.returnSelectedVehicles) !==
    JSON.stringify(params.selectedVehicles)
  ) {
    return false;
  }

  if (
    params.returnCarSeats !== params.carSeats ||
    params.returnRearFacing !== params.rearFacingCount ||
    params.returnFrontFacing !== params.frontFacingCount ||
    params.returnBooster !== params.boosterCount
  ) {
    return false;
  }

  if (
    params.returnHasOversizedLuggage !== params.hasOversizedLuggage ||
    JSON.stringify(params.returnOversizedBags || {}) !==
      JSON.stringify(params.oversizedBags || {})
  ) {
    return false;
  }

  if (
    params.selectedCustomExtras !== undefined ||
    params.returnSelectedCustomExtras !== undefined
  ) {
    if (
      JSON.stringify(params.returnSelectedCustomExtras || {}) !==
      JSON.stringify(params.selectedCustomExtras || {})
    ) {
      return false;
    }
  }

  return true;
}

export function computeDispatchRoundTripFares(params: {
  returnTrip: boolean;
  autoCreateReturnTrip?: boolean;
  forSubmission?: boolean;
  isSymmetric: boolean;
  estimatedFare: number;
  returnEstimatedFare: number;
  isFareOverridden: boolean;
  manualFare: string;
}): { outboundFare: number; returnLegFare: number; totalFare: number } {
  const {
    returnTrip,
    autoCreateReturnTrip = true,
    forSubmission = false,
    isSymmetric,
    estimatedFare,
    returnEstimatedFare,
    isFareOverridden,
    manualFare,
  } = params;

  if (forSubmission) {
    let outboundFare = Math.ceil(estimatedFare);
    let returnLegFare = Math.ceil(returnEstimatedFare || estimatedFare);

    if (isFareOverridden && manualFare) {
      const overrideVal = Math.max(0, Math.ceil(parseFloat(manualFare) || 0));
      if (returnTrip && autoCreateReturnTrip) {
        outboundFare = Math.ceil(overrideVal / 2);
        returnLegFare = Math.max(0, overrideVal - outboundFare);
      } else {
        outboundFare = overrideVal;
      }
    } else if (returnTrip && isSymmetric) {
      const balancedFare = Math.max(outboundFare, returnLegFare);
      outboundFare = balancedFare;
      returnLegFare = balancedFare;
    }

    return {
      outboundFare,
      returnLegFare,
      totalFare: returnTrip ? outboundFare + returnLegFare : outboundFare,
    };
  }

  const outboundFare =
    isFareOverridden && manualFare
      ? returnTrip
        ? Math.ceil((parseFloat(manualFare) || 0) / 2)
        : Math.ceil(parseFloat(manualFare) || 0)
      : isSymmetric
      ? Math.max(Math.ceil(estimatedFare), Math.ceil(returnEstimatedFare || estimatedFare))
      : Math.ceil(estimatedFare);

  const returnLegFare = returnTrip
    ? isFareOverridden && manualFare
      ? Math.max(0, Math.ceil(parseFloat(manualFare) || 0) - outboundFare)
      : isSymmetric
      ? outboundFare
      : Math.ceil(returnEstimatedFare || estimatedFare)
    : 0;

  return {
    outboundFare,
    returnLegFare,
    totalFare: returnTrip ? outboundFare + returnLegFare : outboundFare,
  };
}

export function appendVehicleChoice<T extends string>(
  vehicles: T[],
  defaultChoice: T,
  maxAllowed?: number
): T[] {
  if (maxAllowed !== undefined && vehicles.length >= maxAllowed) {
    return vehicles;
  }
  return [...vehicles, defaultChoice];
}

export function removeVehicleChoiceAt<T extends string>(
  vehicles: T[],
  index: number
): T[] {
  if (vehicles.length <= 1) return vehicles;
  return vehicles.filter((_, idx) => idx !== index);
}

export function updateVehicleChoiceAt<T extends string>(
  vehicles: T[],
  index: number,
  choice: T,
  options?: {
    minRequiredPassengers?: number;
    vehicleCapacities?: Record<string, VehicleCapacityInfo>;
  }
): T[] | null {
  const updated = [...vehicles];
  updated[index] = choice;

  if (
    options?.minRequiredPassengers !== undefined &&
    options?.vehicleCapacities !== undefined
  ) {
    const simulatedCapacity = updated.reduce(
      (acc, v) => acc + (options.vehicleCapacities![v]?.maxPassengers || 4),
      0
    );
    if (simulatedCapacity < options.minRequiredPassengers) {
      return null;
    }
  }

  return updated;
}

/**
 * Keeps reversed return pickup/dropoff addresses seeded when Return Trip is enabled
 * and either return endpoint is still blank.
 */
export function useReturnTripBlankAddressSync(params: {
  returnTrip: boolean;
  pickupAddress: string;
  pickupCoordinates?: GeoPoint;
  dropoffAddress: string;
  dropoffCoordinates?: GeoPoint;
  returnPickupAddress: string;
  returnDropoffAddress: string;
  onSeedBlankAddresses: () => void;
}): void {
  const {
    returnTrip,
    pickupAddress,
    pickupCoordinates,
    dropoffAddress,
    dropoffCoordinates,
    returnPickupAddress,
    returnDropoffAddress,
    onSeedBlankAddresses,
  } = params;

  const callbackRef = useRef(onSeedBlankAddresses);
  callbackRef.current = onSeedBlankAddresses;

  useEffect(() => {
    if (returnTrip && (!returnPickupAddress || !returnDropoffAddress)) {
      callbackRef.current();
    }
  }, [
    returnTrip,
    pickupAddress,
    dropoffAddress,
    pickupCoordinates,
    dropoffCoordinates,
    returnPickupAddress,
    returnDropoffAddress,
  ]);
}

/**
 * Memoizes outbound and return airport detection and synchronizes flight-info flags.
 */
export function useBookingAirportDetection(params: {
  pickupAddress: string;
  dropoffAddress: string;
  returnPickupAddress?: string;
  returnDropoffAddress?: string;
  returnTrip: boolean;
  clearWhenNoAirport: boolean;
  onSyncOutboundFlightInfo: (shouldEnable: boolean) => void;
  onSyncReturnFlightInfo: (shouldEnable: boolean) => void;
}): {
  airportDetection: AirportDetectionResult;
  returnAirportDetection: AirportDetectionResult;
} {
  const {
    pickupAddress,
    dropoffAddress,
    returnPickupAddress,
    returnDropoffAddress,
    returnTrip,
    clearWhenNoAirport,
    onSyncOutboundFlightInfo,
    onSyncReturnFlightInfo,
  } = params;

  const outboundSyncRef = useRef(onSyncOutboundFlightInfo);
  outboundSyncRef.current = onSyncOutboundFlightInfo;

  const returnSyncRef = useRef(onSyncReturnFlightInfo);
  returnSyncRef.current = onSyncReturnFlightInfo;

  const airportDetection = useMemo(() => {
    return detectAirportInAddresses(pickupAddress, dropoffAddress);
  }, [pickupAddress, dropoffAddress]);

  const returnAirportDetection = useMemo(() => {
    return detectAirportInAddresses(returnPickupAddress || '', returnDropoffAddress || '');
  }, [returnPickupAddress, returnDropoffAddress]);

  useEffect(() => {
    if (clearWhenNoAirport) {
      outboundSyncRef.current(Boolean(airportDetection.isAirportTrip));
    } else if (airportDetection.isAirportTrip) {
      outboundSyncRef.current(true);
    }
  }, [airportDetection.isAirportTrip, clearWhenNoAirport]);

  useEffect(() => {
    if (clearWhenNoAirport) {
      returnSyncRef.current(Boolean(returnTrip && returnAirportDetection.isAirportTrip));
    } else if (returnAirportDetection.isAirportTrip) {
      returnSyncRef.current(true);
    }
  }, [returnTrip, returnAirportDetection.isAirportTrip, clearWhenNoAirport]);

  return {
    airportDetection,
    returnAirportDetection,
  };
}
