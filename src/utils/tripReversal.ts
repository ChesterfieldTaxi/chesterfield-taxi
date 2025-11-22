import type { Location } from '../hooks/useBookingFormV3';

/**
 * Represents a trip route with pickup, dropoff, and intermediate stops
 */
export interface TripRoute {
    pickup: Location | null;
    dropoff: Location | null;
    stops: Location[];
}

/**
 * Reverses a trip route for return journey
 * 
 * Swaps pickup/dropoff and reverses the order of all stops.
 * Useful for creating return trips that follow the same route in reverse.
 * 
 * @param trip - The original trip route to reverse
 * @returns A new trip route with reversed direction
 * 
 * @example
 * const mainTrip = {
 *   pickup: { address: 'Home', ... },
 *   dropoff: { address: 'Airport', ... },
 *   stops: [{ address: 'Hotel', ... }]
 * };
 * 
 * const returnTrip = reverseTrip(mainTrip);
 * // returnTrip = {
 * //   pickup: { address: 'Airport', ... },
 * //   dropoff: { address: 'Home', ... },
 * //   stops: [{ address: 'Hotel', ... }]
 * // }
 */
export function reverseTrip(trip: TripRoute): TripRoute {
    return {
        pickup: trip.dropoff ? { ...trip.dropoff, type: 'pickup' as const } : null,
        dropoff: trip.pickup ? { ...trip.pickup, type: 'dropoff' as const } : null,
        stops: [...trip.stops].reverse().map(stop => ({ ...stop, type: 'stop' as const }))
    };
}
