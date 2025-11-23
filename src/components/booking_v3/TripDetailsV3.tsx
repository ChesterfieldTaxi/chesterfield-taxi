import React from 'react';
import { TripRouteV3 } from './TripRouteV3';
import type { Location } from '../../hooks/useBookingFormV3';

interface TripDetailsV3Props {
    pickup: Location | null;
    dropoff: Location | null;
    stops: Location[];
    onPickupChange: (location: Location | null) => void;
    onDropoffChange: (location: Location | null) => void;
    onStopChange: (id: string, updates: Partial<Location>) => void;
    onAddStop: () => void;
    onRemoveStop: (id: string) => void;
    onSwapLocations: () => void;
    onReorderStops: (fromIndex: number, toIndex: number) => void;
    onFlightDetailsChange: (locationType: 'pickup' | 'dropoff', details: { airline: string; flightNumber: string; origin?: string }) => void;
    distanceInYards?: number;
    isCalculatingDistance?: boolean;
}

/**
 * Main trip details section
 * Pure wrapper around TripRouteV3 (flight info now handled by TripRouteV3)
 */
export const TripDetailsV3: React.FC<TripDetailsV3Props> = ({
    pickup,
    dropoff,
    stops,
    onPickupChange,
    onDropoffChange,
    onStopChange,
    onAddStop,
    onRemoveStop,
    onSwapLocations,
    onReorderStops,
    onFlightDetailsChange,
    distanceInYards,
    isCalculatingDistance
}) => {
    return (
        <TripRouteV3
            pickup={pickup}
            dropoff={dropoff}
            stops={stops}
            onPickupChange={onPickupChange}
            onDropoffChange={onDropoffChange}
            onStopChange={onStopChange}
            onAddStop={onAddStop}
            onRemoveStop={onRemoveStop}
            onSwapLocations={onSwapLocations}
            onReorderStops={onReorderStops}
            onFlightDetailsChange={onFlightDetailsChange}
            distanceInYards={distanceInYards}
            isCalculatingDistance={isCalculatingDistance}
        />
    );
};
