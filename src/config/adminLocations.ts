// Admin-defined locations for quick selection
// These appear first in autocomplete suggestions

export interface AdminLocation {
    id: string;
    name: string;
    address: string;
    type: 'airport' | 'hotel' | 'venue' | 'corporate' | 'other';
    coordinates: { lat: number; lng: number };
    distanceFromAirport?: number; // Pre-calculated in yards (optional)
    aliases?: string[]; // Alternative names for search matching
    icon?: string;
}

export const adminLocations: AdminLocation[] = [
    // ========== AIRPORTS ==========
    {
        id: 'lambert-airport',
        name: 'Lambert-St. Louis International Airport',
        address: '10701 Lambert International Blvd, St. Louis, MO 63145',
        type: 'airport',
        coordinates: { lat: 38.7487, lng: -90.3700 },
        aliases: ['STL', 'Lambert', 'St Louis Airport', 'Lambert Airport'],
        icon: '✈️'
    },
    {
        id: 'spirit-airport',
        name: 'Spirit of St. Louis Airport',
        address: '18270 Edison Ave, Chesterfield, MO 63005',
        type: 'airport',
        coordinates: { lat: 38.6621, lng: -90.6520 },
        aliases: ['SUS', 'Spirit', 'Spirit Airport', 'Chesterfield Airport'],
        icon: '✈️'
    },
    {
        id: 'midamerica-airport',
        name: 'MidAmerica St. Louis Airport',
        address: '10 Terminal Dr, Mascoutah, IL 62258',
        type: 'airport',
        coordinates: { lat: 38.5452, lng: -89.8377 },
        aliases: ['BLV', 'MidAmerica', 'Belleville Airport', 'Scott Air Force Base'],
        icon: '✈️'
    },

    // ========== DOWNTOWN ST. LOUIS HOTELS ==========
    {
        id: 'union-station-hotel',
        name: 'Union Station Hotel, Curio Collection by Hilton',
        address: '1820 Market St, St. Louis, MO 63103',
        type: 'hotel',
        coordinates: { lat: 38.6275, lng: -90.2077 },
        aliases: ['Union Station', 'Curio Hilton'],
        icon: '🏨'
    },
    {
        id: 'hyatt-regency-stl',
        name: 'Hyatt Regency St. Louis at The Arch',
        address: '315 Chestnut St, St. Louis, MO 63102',
        type: 'hotel',
        coordinates: { lat: 38.6301, lng: -90.1884 },
        aliases: ['Hyatt Regency', 'Hyatt Arch'],
        icon: '🏨'
    },
    {
        id: 'four-seasons-stl',
        name: 'Four Seasons Hotel St. Louis',
        address: '999 N 2nd St, St. Louis, MO 63102',
        type: 'hotel',
        coordinates: { lat: 38.6330, lng: -90.1842 },
        aliases: ['Four Seasons'],
        icon: '🏨'
    },
    {
        id: 'live-by-loews',
        name: 'Live! by Loews - St. Louis',
        address: '700 Clark Ave, St. Louis, MO 63102',
        type: 'hotel',
        coordinates: { lat: 38.6252, lng: -90.1931 },
        aliases: ['Loews', 'Live by Loews', 'Ballpark Village Hotel'],
        icon: '🏨'
    },
    {
        id: 'westin-downtown',
        name: 'The Westin St. Louis',
        address: '811 Spruce St, St. Louis, MO 63102',
        type: 'hotel',
        coordinates: { lat: 38.6279, lng: -90.1909 },
        aliases: ['Westin'],
        icon: '🏨'
    },
    {
        id: 'hilton-ballpark',
        name: 'Hilton St. Louis at the Ballpark',
        address: '1 S Broadway, St. Louis, MO 63102',
        type: 'hotel',
        coordinates: { lat: 38.6245, lng: -90.1878 },
        aliases: ['Hilton Ballpark'],
        icon: '🏨'
    },
    {
        id: 'drury-plaza-arch',
        name: 'Drury Plaza Hotel St. Louis at the Arch',
        address: '2 S 4th St, St. Louis, MO 63102',
        type: 'hotel',
        coordinates: { lat: 38.6270, lng: -90.1875 },
        aliases: ['Drury Arch', 'Drury Plaza'],
        icon: '🏨'
    },
    {
        id: 'marriott-grand',
        name: 'St. Louis Marriott Grand',
        address: '800 Washington Ave, St. Louis, MO 63101',
        type: 'hotel',
        coordinates: { lat: 38.6325, lng: -90.1931 },
        aliases: ['Marriott Grand'],
        icon: '🏨'
    },

    // ========== CLAYTON HOTELS ==========
    {
        id: 'ritz-carlton-clayton',
        name: 'The Ritz-Carlton, St. Louis',
        address: '100 Carondelet Plaza, Clayton, MO 63105',
        type: 'hotel',
        coordinates: { lat: 38.6423, lng: -90.3285 },
        aliases: ['Ritz Carlton', 'Ritz Clayton'],
        icon: '🏨'
    },
    {
        id: 'sheraton-clayton',
        name: 'Sheraton Clayton Plaza Hotel St. Louis',
        address: '7730 Bonhomme Ave, Clayton, MO 63105',
        type: 'hotel',
        coordinates: { lat: 38.6471, lng: -90.3388 },
        aliases: ['Sheraton Clayton'],
        icon: '🏨'
    },
    {
        id: 'chase-park-plaza',
        name: 'Chase Park Plaza Royal Sonesta St. Louis',
        address: '212 N Kingshighway Blvd, St. Louis, MO 63108',
        type: 'hotel',
        coordinates: { lat: 38.6396, lng: -90.2632 },
        aliases: ['Chase Park Plaza', 'Royal Sonesta'],
        icon: '🏨'
    },

    // ========== CHESTERFIELD HOTELS ==========
    {
        id: 'doubletree-chesterfield',
        name: 'DoubleTree by Hilton Hotel St. Louis - Chesterfield',
        address: '16625 Swingley Ridge Rd, Chesterfield, MO 63017',
        type: 'hotel',
        coordinates: { lat: 38.6634, lng: -90.5789 },
        aliases: ['DoubleTree Chesterfield', 'Hilton Chesterfield'],
        icon: '🏨'
    },
    {
        id: 'drury-inn-chesterfield',
        name: 'Drury Inn & Suites St. Louis Chesterfield',
        address: '355 Chesterfield Center, Chesterfield, MO 63017',
        type: 'hotel',
        coordinates: { lat: 38.6632, lng: -90.5771 },
        aliases: ['Drury Chesterfield'],
        icon: '🏨'
    },
    {
        id: 'homewood-chesterfield',
        name: 'Homewood Suites by Hilton St. Louis - Chesterfield',
        address: '17431 N Outer 40 Rd, Chesterfield, MO 63005',
        type: 'hotel',
        coordinates: { lat: 38.6630, lng: -90.5520 },
        aliases: ['Homewood Chesterfield'],
        icon: '🏨'
    },
    {
        id: 'hampton-chesterfield',
        name: 'Hampton Inn St. Louis/Chesterfield',
        address: '13971 Olive Blvd, Chesterfield, MO 63017',
        type: 'hotel',
        coordinates: { lat: 38.6675, lng: -90.5438 },
        aliases: ['Hampton Chesterfield'],
        icon: '🏨'
    },

    // ========== AIRPORT AREA HOTELS ==========
    {
        id: 'renaissance-airport',
        name: 'Renaissance St. Louis Airport Hotel',
        address: '9801 Natural Bridge Rd, St. Louis, MO 63134',
        type: 'hotel',
        coordinates: { lat: 38.7318, lng: -90.3489 },
        aliases: ['Renaissance Airport', 'Marriott Airport'],
        icon: '🏨'
    },
    {
        id: 'hilton-airport',
        name: 'Hilton St. Louis Airport',
        address: '10330 Natural Bridge Rd, St. Louis, MO 63134',
        type: 'hotel',
        coordinates: { lat: 38.7383, lng: -90.3558 },
        aliases: ['Hilton Airport'],
        icon: '🏨'
    },
    {
        id: 'drury-inn-airport',
        name: 'Drury Inn & Suites St. Louis Airport',
        address: '10490 Natural Bridge Rd, St. Louis, MO 63134',
        type: 'hotel',
        coordinates: { lat: 38.7418, lng: -90.3589 },
        aliases: ['Drury Airport'],
        icon: '🏨'
    },
    {
        id: 'pear-tree-airport',
        name: 'Pear Tree Inn St. Louis Airport',
        address: '3663 Pennridge Dr, Bridgeton, MO 63044',
        type: 'hotel',
        coordinates: { lat: 38.7520, lng: -90.4085 },
        aliases: ['Pear Tree Airport', 'Drury Pear Tree'],
        icon: '🏨'
    },
    {
        id: 'marriott-airport',
        name: 'St. Louis Airport Marriott',
        address: '10700 Pear Tree Ln, St. Louis, MO 63134',
        type: 'hotel',
        coordinates: { lat: 38.7478, lng: -90.3597 },
        aliases: ['Airport Marriott'],
        icon: '🏨'
    },

    // ========== MARYLAND HEIGHTS / WESTPORT ==========
    {
        id: 'residence-inn-westport',
        name: 'Residence Inn by Marriott St. Louis Westport',
        address: '12815 Westport Pkwy, Maryland Heights, MO 63146',
        type: 'hotel',
        coordinates: { lat: 38.7209, lng: -90.4663 },
        aliases: ['Residence Inn Westport', 'Marriott Westport'],
        icon: '🏨'
    },
    {
        id: 'holiday-inn-westport',
        name: 'Holiday Inn St. Louis-Westport',
        address: '12901 N Forty Dr, St. Louis, MO 63141',
        type: 'hotel',
        coordinates: { lat: 38.7195, lng: -90.4682 },
        aliases: ['Holiday Inn Westport'],
        icon: '🏨'
    },
    {
        id: 'drury-westport',
        name: 'Drury Inn & Suites St. Louis Westport',
        address: '12220 Dorsett Rd, Maryland Heights, MO 63043',
        type: 'hotel',
        coordinates: { lat: 38.7148, lng: -90.4561 },
        aliases: ['Drury Westport'],
        icon: '🏨'
    },

    // ========== CREVE COEUR / OLIVE BLVD ==========
    {
        id: 'four-points-creve-coeur',
        name: 'Four Points by Sheraton St. Louis - Westport',
        address: '11974 Westline Industrial Dr, St. Louis, MO 63146',
        type: 'hotel',
        coordinates: { lat: 38.7130, lng: -90.4378 },
        aliases: ['Four Points Westport', 'Sheraton Westport'],
        icon: '🏨'
    },
    {
        id: 'extended-stay-olive',
        name: 'Extended Stay America - St. Louis - Westport - Central',
        address: '1855 Craigshire Rd, St. Louis, MO 63146',
        type: 'hotel',
        coordinates: { lat: 38.7055, lng: -90.4453 },
        aliases: ['Extended Stay Westport'],
        icon: '🏨'
    },

    // ========== CENTRAL WEST COUNTY ==========
    {
        id: 'moonrise-hotel',
        name: 'Moonrise Hotel',
        address: '6177 Delmar Blvd, St. Louis, MO 63112',
        type: 'hotel',
        coordinates: { lat: 38.6556, lng: -90.2967 },
        aliases: ['Moonrise', 'Loop Hotel'],
        icon: '🏨'
    },
    {
        id: 'parkway-hotel',
        name: 'The Parkway Hotel',
        address: '4550 Forest Park Ave, St. Louis, MO 63108',
        type: 'hotel',
        coordinates: { lat: 38.6451, lng: -90.2756 },
        aliases: ['Parkway'],
        icon: '🏨'
    },

    // ========== SOUTH COUNTY ==========
    {
        id: 'drury-south',
        name: 'Drury Inn & Suites St. Louis South',
        address: '4545 S Lindbergh Blvd, St. Louis, MO 63127',
        type: 'hotel',
        coordinates: { lat: 38.5316, lng: -90.3777 },
        aliases: ['Drury South'],
        icon: '🏨'
    },
    {
        id: 'hampton-south',
        name: 'Hampton Inn St. Louis/South I-55',
        address: '4520 S Lindbergh Blvd, St. Louis, MO 63127',
        type: 'hotel',
        coordinates: { lat: 38.5327, lng: -90.3774 },
        aliases: ['Hampton South'],
        icon: '🏨'
    },

    // ========== EARTH CITY / BRIDGETON ==========
    {
        id: 'holiday-inn-earth-city',
        name: 'Holiday Inn St. Louis-Earth City',
        address: '3400 Rider Trail S, Earth City, MO 63045',
        type: 'hotel',
        coordinates: { lat: 38.7626, lng: -90.4538 },
        aliases: ['Holiday Inn Earth City'],
        icon: '🏨'
    },
    {
        id: 'staybridge-earth-city',
        name: 'Staybridge Suites St. Louis - Westport',
        address: '13031 Worldgate Dr, St. Louis, MO 63146',
        type: 'hotel',
        coordinates: { lat: 38.7238, lng: -90.4693 },
        aliases: ['Staybridge Westport'],
        icon: '🏨'
    },

    // ========== WEST COUNTY (BALLWIN/MANCHESTER) ==========
    {
        id: 'drury-manchester',
        name: 'Drury Inn St. Louis @ Fairview Heights',
        address: '12 Ludwig Dr, Fairview Heights, IL 62208',
        type: 'hotel',
        coordinates: { lat: 38.5965, lng: -89.9908 },
        aliases: ['Drury Fairview'],
        icon: '🏨'
    }
];

/**
 * Search admin locations by query string
 * Matches against name, address, and aliases
 */
export function searchAdminLocations(query: string): AdminLocation[] {
    if (!query || query.length < 2) return [];

    const lowerQuery = query.toLowerCase();

    return adminLocations.filter(location => {
        // Match against name
        if (location.name.toLowerCase().includes(lowerQuery)) return true;

        // Match against address
        if (location.address.toLowerCase().includes(lowerQuery)) return true;

        // Match against aliases
        if (location.aliases?.some(alias =>
            alias.toLowerCase().includes(lowerQuery)
        )) return true;

        return false;
    });
}
