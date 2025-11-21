/**
 * Common St. Louis landmarks for quick selection
 * These appear as suggestions before typing, prioritizing airport and local destinations
 */
export const STL_LANDMARKS = [
    {
        name: 'Lambert-St. Louis International Airport',
        shortName: 'Lambert Airport (STL)',
        coordinates: { lat: 38.7487, lng: -90.3700 },
        placeId: 'ChIJf3y-2TOe2IcRlUv8hcdH1HQ', // Actual Google Place ID
        isAirport: true
    },
    {
        name: 'Spirit of St. Louis Airport',
        shortName: 'Spirit Airport (SUS)',
        coordinates: { lat: 38.6621, lng: -90.6520 },
        placeId: 'ChIJbxm_gTqm2IcRt7xz7Gz-0jk',
        isAirport: true
    },
    {
        name: 'Busch Stadium',
        shortName: 'Busch Stadium',
        coordinates: { lat: 38.6226, lng: -90.1928 },
        placeId: 'ChIJywnf3Pq12ocR_pWWQcKrpnk',
        isAirport: false
    },
    {
        name: 'Gateway Arch',
        shortName: 'Gateway Arch',
        coordinates: { lat: 38.6247, lng: -90.1848 },
        placeId: 'ChIJbwnf3Pq12ocRTMNL-wf2lzk',
        isAirport: false
    },
    {
        name: 'Union Station',
        shortName: 'Union Station',
        coordinates: { lat: 38.6289, lng: -90.2077 },
        placeId: 'ChIJowL-R_y12ocRqWQZqaB8S0E',
        isAirport: false
    },
    {
        name: 'Forest Park',
        shortName: 'Forest Park',
        coordinates: { lat: 38.6361, lng: -90.2864 },
        placeId: 'ChIJrXYB8MSi2IcRqWJf2uu7mhw',
        isAirport: false
    },
    {
        name: 'St. Louis Zoo',
        shortName: 'St. Louis Zoo',
        coordinates: { lat: 38.6352, lng: -90.2906 },
        placeId: 'ChIJ74YqLbyi2IcRDXZ19vY9xsY',
        isAirport: false
    },
    {
        name: 'Missouri Botanical Garden',
        shortName: 'Botanical Garden',
        coordinates: { lat: 38.6129, lng: -90.2594 },
        placeId: 'ChIJPzvfKE-k2IcRxZ6HQFgIK3M',
        isAirport: false
    },
    {
        name: 'The Muny',
        shortName: 'The Muny',
        coordinates: { lat: 38.6423, lng: -90.2792 },
        placeId: 'ChIJZxYB8MSi2IcR6QMx0mBIPZk',
        isAirport: false
    },
    {
        name: 'Enterprise Center',
        shortName: 'Enterprise Center',
        coordinates: { lat: 38.6267, lng: -90.2026 },
        placeId: 'ChIJ8zzP_Pq12ocRVzQzfqH_iw4',
        isAirport: false
    }
];

/**
 * Filter landmarks based on search text
 */
export function filterLandmarks(searchText: string) {
    if (!searchText || searchText.length < 2) {
        // Show airports first when no search
        return STL_LANDMARKS.filter(l => l.isAirport);
    }

    const lower = searchText.toLowerCase();
    return STL_LANDMARKS.filter(landmark =>
        landmark.shortName.toLowerCase().includes(lower) ||
        landmark.name.toLowerCase().includes(lower)
    );
}
