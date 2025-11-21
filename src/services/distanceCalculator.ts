import { loadGoogleMaps } from '../utils/googleMapsLoader';

export interface RoutePoint {
    coordinates: { lat: number; lng: number };
}

/**
 * Calculate the total distance of a route using Google Maps Directions API
 * @param pickup Starting point
 * @param dropoff Ending point
 * @param stops Array of intermediate stops
 * @returns Distance in yards
 */
export async function calculateRouteDistance(
    pickup: RoutePoint,
    dropoff: RoutePoint,
    stops: RoutePoint[] = []
): Promise<number> {
    try {
        const google = await loadGoogleMaps();
        const directionsService = new google.maps.DirectionsService();

        // Create waypoints for stops
        const waypoints = stops.map(stop => ({
            location: new google.maps.LatLng(
                stop.coordinates.lat,
                stop.coordinates.lng
            ),
            stopover: true
        }));

        // Request directions
        const result = await directionsService.route({
            origin: new google.maps.LatLng(
                pickup.coordinates.lat,
                pickup.coordinates.lng
            ),
            destination: new google.maps.LatLng(
                dropoff.coordinates.lat,
                dropoff.coordinates.lng
            ),
            waypoints,
            travelMode: google.maps.TravelMode.DRIVING,
            optimizeWaypoints: false // Keep waypoints in order
        });

        if (!result.routes || result.routes.length === 0) {
            throw new Error('No routes found');
        }

        // Sum all leg distances
        const totalMeters = result.routes[0].legs.reduce(
            (sum, leg) => sum + (leg.distance?.value || 0),
            0
        );

        // Convert meters to yards (1 meter = 1.09361 yards)
        const yards = Math.round(totalMeters * 1.09361);

        console.log(`Route distance calculated: ${yards} yards (${totalMeters} meters)`);

        return yards;
    } catch (error) {
        console.error('Failed to calculate route distance:', error);
        throw error;
    }
}

/**
 * Format distance for display
 */
export function formatDistance(yards: number): string {
    const miles = yards / 1760;
    return miles >= 1
        ? `${miles.toFixed(1)} mi`
        : `${yards} yd`;
}
