/**
 * Special Places & Landmarks Service
 * 
 * Manages user-friendly named landmarks, airports, hospitals, shopping centers,
 * and corporate accounts for site-wide autocomplete suggestions and zone association.
 * Stored in Firestore collection `/specialPlaces` with localStorage caching fallback.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  type Firestore,
} from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';

export type SpecialPlaceCategory =
  | 'airport'
  | 'landmark'
  | 'venue'
  | 'hospital'
  | 'shopping'
  | 'transit'
  | 'hotel'
  | 'corporate'
  | 'custom';

export interface SpecialPlace {
  id: string;
  name: string; // e.g. "St. Louis Lambert International Airport (STL)"
  shortName?: string; // e.g. "Lambert Airport (STL)"
  address: string; // e.g. "10701 Lambert International Blvd, St. Louis, MO 63145"
  city: string;
  state: string;
  zip: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  category: SpecialPlaceCategory;
  /** Airport classification when category === 'airport' */
  airportType?: 'commercial' | 'private';
  isPopular: boolean; // Shown prominently in initial suggestions
  isActive: boolean;
  notes?: string;
  aliases?: string[]; // e.g. ["STL", "Lambert", "Terminal 1", "T1", "Terminal 2", "T2"]
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_SPECIAL_PLACES: SpecialPlace[] = [
  // ─── Airports ───
  {
    id: 'place-lambert-airport-stl',
    name: 'St. Louis Lambert International Airport (STL)',
    shortName: 'Lambert Airport (STL)',
    address: '10701 Lambert International Blvd, St. Louis, MO 63145',
    city: 'St. Louis',
    state: 'MO',
    zip: '63145',
    coordinates: { lat: 38.7487, lng: -90.3700 },
    category: 'airport',
    airportType: 'commercial',
    isPopular: true,
    isActive: true,
    aliases: ['STL', 'Lambert', 'Terminal 1', 'T1', 'Terminal 2', 'T2', 'Airport', 'American', 'Delta', 'United', 'Frontier', 'Southwest'],
    notes: 'Unified commercial passenger terminal pickup at Lambert International Blvd.',
  },
  {
    id: 'place-spirit-airport-sus',
    name: 'Spirit of St. Louis Airport (SUS)',
    shortName: 'Spirit Airport (SUS)',
    address: '18270 Edison Ave, Chesterfield, MO 63005',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63005',
    coordinates: { lat: 38.6622, lng: -90.6508 },
    category: 'airport',
    airportType: 'private',
    isPopular: true,
    isActive: true,
    aliases: ['SUS', 'Spirit Airport', 'Chesterfield Airport', 'Tac Air', 'Million Air', 'Executive Air', 'Signature Flight Support'],
    notes: 'Corporate VIP aviation and private hangar zone in Chesterfield Valley.',
  },

  // ─── Hospitals & Medical Centers ───
  {
    id: 'place-st-lukes-hospital',
    name: "St. Luke's Hospital (Chesterfield Main Campus)",
    shortName: "St. Luke's Hospital",
    address: '232 S Woods Mill Rd, Chesterfield, MO 63017',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63017',
    coordinates: { lat: 38.6472, lng: -90.5058 },
    category: 'hospital',
    isPopular: true,
    isActive: true,
    aliases: ['St Lukes', 'Woods Mill Hospital', 'St. Luke Hospital', 'St Lukes Emergency'],
    notes: 'Primary acute care regional hospital and medical office towers in Chesterfield.',
  },
  {
    id: 'place-mercy-hospital-st-louis',
    name: 'Mercy Hospital St. Louis (Main Campus)',
    shortName: 'Mercy Hospital STL',
    address: '615 S New Ballas Rd, St. Louis, MO 63141',
    city: 'Creve Coeur',
    state: 'MO',
    zip: '63141',
    coordinates: { lat: 38.6508, lng: -90.4497 },
    category: 'hospital',
    isPopular: true,
    isActive: true,
    aliases: ['Mercy', 'St. Johns', 'Mercy Ballas', 'Mercy Childrens', 'Mercy Heart Hospital'],
    notes: 'Level 1 Trauma Center and Women\'s & Children\'s Hospital in Creve Coeur.',
  },
  {
    id: 'place-missouri-baptist-medical-center',
    name: 'Missouri Baptist Medical Center (MoBap)',
    shortName: 'MoBap Medical Center',
    address: '3015 N Ballas Rd, St. Louis, MO 63131',
    city: 'Town and Country',
    state: 'MO',
    zip: '63131',
    coordinates: { lat: 38.6366, lng: -90.4492 },
    category: 'hospital',
    isPopular: true,
    isActive: true,
    aliases: ['MoBap', 'Missouri Baptist', 'Ballas Medical Center', 'Mo Bap Hospital'],
    notes: 'Premier West County medical hospital and BJC HealthCare partner in Town and Country.',
  },
  {
    id: 'place-barnes-jewish-hospital',
    name: 'Barnes-Jewish Hospital / Washington University Medical Campus',
    shortName: 'Barnes-Jewish Hospital (BJH)',
    address: '1 Barnes Jewish Hospital Plaza, St. Louis, MO 63110',
    city: 'St. Louis',
    state: 'MO',
    zip: '63110',
    coordinates: { lat: 38.6364, lng: -90.2635 },
    category: 'hospital',
    isPopular: true,
    isActive: true,
    aliases: ['BJH', 'Barnes Jewish', 'WashU Med', 'Central West End Hospital', 'Plaza Tower'],
    notes: 'Nationally recognized academic medical center and Level 1 trauma hub.',
  },
  {
    id: 'place-st-louis-childrens-hospital',
    name: "St. Louis Children's Hospital",
    shortName: "Children's Hospital STL",
    address: '1 Childrens Pl, St. Louis, MO 63110',
    city: 'St. Louis',
    state: 'MO',
    zip: '63110',
    coordinates: { lat: 38.6373, lng: -90.2618 },
    category: 'hospital',
    isPopular: true,
    isActive: true,
    aliases: ["Children's Hospital", 'SLCH', 'BJC Pediatric', 'Childrens Plaza'],
    notes: 'Pediatric specialty hospital located on Kingshighway Blvd.',
  },
  {
    id: 'place-ssm-st-marys-hospital',
    name: "SSM Health St. Mary's Hospital",
    shortName: "St. Mary's Hospital",
    address: '6420 Clayton Rd, Richmond Heights, MO 63117',
    city: 'Richmond Heights',
    state: 'MO',
    zip: '63117',
    coordinates: { lat: 38.6318, lng: -90.3135 },
    category: 'hospital',
    isPopular: false,
    isActive: true,
    aliases: ['St. Marys', 'SSM St Marys', 'Clayton Road Hospital'],
    notes: 'High-risk maternity, cardiac care, and regional hospital center.',
  },
  {
    id: 'place-ssm-st-joseph-hospital',
    name: 'SSM Health St. Joseph Hospital - St. Charles',
    shortName: 'St. Joseph Hospital St. Charles',
    address: '300 1st Capitol Dr, St. Charles, MO 63301',
    city: 'St. Charles',
    state: 'MO',
    zip: '63301',
    coordinates: { lat: 38.7779, lng: -90.4905 },
    category: 'hospital',
    isPopular: false,
    isActive: true,
    aliases: ['St. Joseph St. Charles', 'SSM St. Joe', '1st Capitol Hospital'],
    notes: 'Regional medical campus serving St. Charles County.',
  },
  {
    id: 'place-progress-west-hospital',
    name: 'Progress West Hospital',
    shortName: 'Progress West Hospital',
    address: '2 Progress Point Pkwy, O\'Fallon, MO 63368',
    city: 'O\'Fallon',
    state: 'MO',
    zip: '63368',
    coordinates: { lat: 38.7495, lng: -90.6698 },
    category: 'hospital',
    isPopular: false,
    isActive: true,
    aliases: ['Progress West', 'BJC Progress West', 'OFallon Hospital'],
    notes: 'BJC community hospital campus at I-64 and Technology Drive.',
  },
  {
    id: 'place-siteman-cancer-center-west',
    name: 'Siteman Cancer Center - West County',
    shortName: 'Siteman West County',
    address: '10 Barnes West Dr, Creve Coeur, MO 63141',
    city: 'Creve Coeur',
    state: 'MO',
    zip: '63141',
    coordinates: { lat: 38.6437, lng: -90.4578 },
    category: 'hospital',
    isPopular: false,
    isActive: true,
    aliases: ['Siteman', 'Siteman West', 'Barnes West', 'Cancer Center'],
    notes: 'Dedicated comprehensive oncology center in West County.',
  },

  // ─── Shopping & Lifestyle Hubs ───
  {
    id: 'place-chesterfield-valley',
    name: 'Chesterfield Valley / Chesterfield Commons',
    shortName: 'Chesterfield Valley Commons',
    address: 'Chesterfield Airport Rd, Chesterfield, MO 63005',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63005',
    coordinates: { lat: 38.6631, lng: -90.5771 },
    category: 'shopping',
    isPopular: true,
    isActive: true,
    aliases: ['The Valley', 'Chesterfield Commons', 'Valley Center', 'Airport Road Retail'],
    notes: 'Major 1.5-mile outdoor retail and dining strip in Chesterfield Valley.',
  },
  {
    id: 'place-chesterfield-mall',
    name: 'Chesterfield Mall / Downtown Chesterfield',
    shortName: 'Downtown Chesterfield',
    address: '291 Chesterfield Center, Chesterfield, MO 63017',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63017',
    coordinates: { lat: 38.6534, lng: -90.5621 },
    category: 'shopping',
    isPopular: true,
    isActive: true,
    aliases: ['Chesterfield Mall', 'Chesterfield Center', 'Clarkson & 64', 'Chesterfield Downtown'],
    notes: 'Central business, retail, and municipal corridor off Clarkson Rd.',
  },
  {
    id: 'place-st-louis-premium-outlets',
    name: 'St. Louis Premium Outlets (Chesterfield)',
    shortName: 'Premium Outlets Chesterfield',
    address: '18521 Outlet Blvd, Chesterfield, MO 63005',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63005',
    coordinates: { lat: 38.6729, lng: -90.6653 },
    category: 'shopping',
    isPopular: true,
    isActive: true,
    aliases: ['Chesterfield Outlets', 'Premium Outlets', 'Outlet Mall', 'Simon Outlets'],
    notes: 'Open-air designer outlet shopping village in west Chesterfield Valley.',
  },
  {
    id: 'place-town-country-crossing',
    name: 'Town and Country Crossing',
    shortName: 'Town and Country Crossing',
    address: '1050 Woods Mill Rd, Town and Country, MO 63017',
    city: 'Town and Country',
    state: 'MO',
    zip: '63017',
    coordinates: { lat: 38.6189, lng: -90.5042 },
    category: 'shopping',
    isPopular: true,
    isActive: true,
    aliases: ['Town & Country Crossing', 'Whole Foods Town and Country', 'Target T&C'],
    notes: 'Upscale suburban retail center anchored by Whole Foods Market and Target.',
  },
  {
    id: 'place-saint-louis-galleria',
    name: 'Saint Louis Galleria',
    shortName: 'The Galleria',
    address: '1155 Saint Louis Galleria, Richmond Heights, MO 63117',
    city: 'Richmond Heights',
    state: 'MO',
    zip: '63117',
    coordinates: { lat: 38.6369, lng: -90.3477 },
    category: 'shopping',
    isPopular: true,
    isActive: true,
    aliases: ['Galleria', 'St. Louis Galleria', 'Brentwood Mall', 'Galleria Mall'],
    notes: 'Premier indoor shopping center located at I-64 and Brentwood Blvd.',
  },
  {
    id: 'place-plaza-frontenac',
    name: 'Plaza Frontenac',
    shortName: 'Plaza Frontenac',
    address: '1701 S Lindbergh Blvd, Frontenac, MO 63131',
    city: 'Frontenac',
    state: 'MO',
    zip: '63131',
    coordinates: { lat: 38.6334, lng: -90.4074 },
    category: 'shopping',
    isPopular: true,
    isActive: true,
    aliases: ['Frontenac', 'Saks Frontenac', 'Neiman Marcus STL', 'Frontenac Mall'],
    notes: 'High-end luxury shopping mall with Saks Fifth Avenue and Neiman Marcus.',
  },
  {
    id: 'place-west-county-center',
    name: 'West County Center',
    shortName: 'West County Center',
    address: '80 West County Center, Des Peres, MO 63131',
    city: 'Des Peres',
    state: 'MO',
    zip: '63131',
    coordinates: { lat: 38.5997, lng: -90.4435 },
    category: 'shopping',
    isPopular: true,
    isActive: true,
    aliases: ['West County Mall', 'Des Peres Mall', 'Nordstrom West County', 'Apple West County'],
    notes: 'Major retail hub at Manchester Rd and I-270 featuring Nordstrom and Macy\'s.',
  },
  {
    id: 'place-the-meadows-lake-st-louis',
    name: 'The Meadows at Lake St. Louis',
    shortName: 'The Meadows',
    address: '20 Meadows Circle Dr, Lake St. Louis, MO 63367',
    city: 'Lake St. Louis',
    state: 'MO',
    zip: '63367',
    coordinates: { lat: 38.7758, lng: -90.7712 },
    category: 'shopping',
    isPopular: false,
    isActive: true,
    aliases: ['The Meadows', 'Lake St Louis Mall', 'Meadows Outdoor'],
    notes: 'Open-air lifestyle shopping center in St. Charles County.',
  },
  {
    id: 'place-manchester-highlands',
    name: 'Manchester Highlands Shopping Center',
    shortName: 'Manchester Highlands',
    address: '14200 Manchester Rd, Manchester, MO 63011',
    city: 'Manchester',
    state: 'MO',
    zip: '63011',
    coordinates: { lat: 38.5941, lng: -90.4952 },
    category: 'shopping',
    isPopular: false,
    isActive: true,
    aliases: ['Manchester Highlands', 'Costco Manchester', 'Target Manchester'],
    notes: 'Major retail center featuring Costco Wholesale and Target on Route 100.',
  },

  // ─── Entertainment, Venues & Stadiums ───
  {
    id: 'place-the-factory-chesterfield',
    name: 'The Factory at The District Chesterfield',
    shortName: 'The Factory Chesterfield',
    address: '17105 North Outer 40 Rd, Chesterfield, MO 63005',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63005',
    coordinates: { lat: 38.6657, lng: -90.6272 },
    category: 'venue',
    isPopular: true,
    isActive: true,
    aliases: ['The Factory', 'The District', 'The District Chesterfield', 'The Factory Concerts'],
    notes: '3,000-capacity state-of-the-art concert venue and entertainment center.',
  },
  {
    id: 'place-chesterfield-amphitheater',
    name: 'Chesterfield Amphitheater',
    shortName: 'Chesterfield Amphitheater',
    address: '631 Veterans Place Dr, Chesterfield, MO 63017',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63017',
    coordinates: { lat: 38.6558, lng: -90.5658 },
    category: 'venue',
    isPopular: true,
    isActive: true,
    aliases: ['The Amp', 'Central Park Chesterfield', 'Veterans Place', 'Chesterfield Concerts'],
    notes: 'Outdoor amphitheater and community events pavilion in Central Park.',
  },
  {
    id: 'place-centene-ice-center',
    name: 'Centene Community Ice Center / St. Louis Music Park',
    shortName: 'Centene Ice Center',
    address: '750 Casino Center Dr, Maryland Heights, MO 63043',
    city: 'Maryland Heights',
    state: 'MO',
    zip: '63043',
    coordinates: { lat: 38.7180, lng: -90.4789 },
    category: 'venue',
    isPopular: true,
    isActive: true,
    aliases: ['Centene', 'Blues Practice Rink', 'St. Louis Music Park', 'Maryland Heights Ice'],
    notes: 'Practice facility for the St. Louis Blues and outdoor concert music park.',
  },
  {
    id: 'place-hollywood-casino-amphitheatre',
    name: 'Hollywood Casino Amphitheatre (Riverport)',
    shortName: 'Hollywood Amphitheatre',
    address: '14141 Riverport Dr, Maryland Heights, MO 63043',
    city: 'Maryland Heights',
    state: 'MO',
    zip: '63043',
    coordinates: { lat: 38.7196, lng: -90.4891 },
    category: 'venue',
    isPopular: true,
    isActive: true,
    aliases: ['Riverport', 'Riverport Amphitheatre', 'Hollywood Amphitheatre', 'Riverport Concerts'],
    notes: '20,000-seat outdoor concert amphitheater in Maryland Heights.',
  },
  {
    id: 'place-busch-stadium',
    name: 'Busch Stadium (St. Louis Cardinals)',
    shortName: 'Busch Stadium',
    address: '700 Clark Ave, St. Louis, MO 63102',
    city: 'St. Louis',
    state: 'MO',
    zip: '63102',
    coordinates: { lat: 38.6226, lng: -90.1928 },
    category: 'venue',
    isPopular: true,
    isActive: true,
    aliases: ['Cardinals Stadium', 'Busch', 'Ballpark Village', 'Cardinals Game', 'Clark Ave'],
    notes: 'Home stadium of the St. Louis Cardinals Major League Baseball team.',
  },
  {
    id: 'place-enterprise-center',
    name: 'Enterprise Center (St. Louis Blues)',
    shortName: 'Enterprise Center',
    address: '1401 Clark Ave, St. Louis, MO 63103',
    city: 'St. Louis',
    state: 'MO',
    zip: '63103',
    coordinates: { lat: 38.6268, lng: -90.2027 },
    category: 'venue',
    isPopular: true,
    isActive: true,
    aliases: ['Blues Arena', 'Enterprise', 'Scottrade', 'Kiel Center', 'Blues Hockey'],
    notes: 'Home arena of the NHL St. Louis Blues and premier indoor concert venue.',
  },
  {
    id: 'place-citypark-stadium',
    name: 'Energizer Park / CITYPARK Stadium (St. Louis CITY SC)',
    shortName: 'CITYPARK Stadium',
    address: '2100 Market St, St. Louis, MO 63103',
    city: 'St. Louis',
    state: 'MO',
    zip: '63103',
    coordinates: { lat: 38.6315, lng: -90.2114 },
    category: 'venue',
    isPopular: true,
    isActive: true,
    aliases: ['CITYPARK', 'Soccer Stadium', 'St Louis City SC', 'Market St Stadium', 'MLS Stadium'],
    notes: '22,500-seat soccer-specific stadium for Major League Soccer St. Louis CITY SC.',
  },
  {
    id: 'place-faust-park',
    name: 'Faust Park / Sophia M. Sachs Butterfly House',
    shortName: 'Faust Park',
    address: '15185 Olive Blvd, Chesterfield, MO 63017',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63017',
    coordinates: { lat: 38.6677, lng: -90.5367 },
    category: 'landmark',
    isPopular: true,
    isActive: true,
    aliases: ['Butterfly House', 'Faust Park', 'Sophia Sachs Butterfly House', 'Faust Carousel'],
    notes: 'Historic park, St. Louis Carousel, and tropical botanical butterfly conservatory.',
  },
  {
    id: 'place-downtown-stl-arch',
    name: 'Gateway Arch National Park & Riverfront',
    shortName: 'Gateway Arch STL',
    address: 'Gateway Arch National Park, St. Louis, MO 63102',
    city: 'St. Louis',
    state: 'MO',
    zip: '63102',
    coordinates: { lat: 38.6247, lng: -90.1848 },
    category: 'landmark',
    isPopular: true,
    isActive: true,
    aliases: ['The Arch', 'Gateway Arch', 'Downtown St. Louis', 'St Louis Riverfront', 'Arch Grounds'],
    notes: 'World-famous 630-foot stainless steel monument and national park museum.',
  },
  {
    id: 'place-forest-park-zoo',
    name: 'Forest Park / Saint Louis Zoo',
    shortName: 'Forest Park & Zoo',
    address: '1 Government Dr, St. Louis, MO 63110',
    city: 'St. Louis',
    state: 'MO',
    zip: '63110',
    coordinates: { lat: 38.6358, lng: -90.2905 },
    category: 'landmark',
    isPopular: true,
    isActive: true,
    aliases: ['St. Louis Zoo', 'Forest Park', 'Art Museum', 'The Muny', 'Science Center'],
    notes: '1,300-acre civic park featuring free admission Saint Louis Zoo, Art Museum, and Muny.',
  },
  {
    id: 'place-missouri-botanical-garden',
    name: 'Missouri Botanical Garden (Shaw\'s Garden)',
    shortName: 'Botanical Garden STL',
    address: '4344 Shaw Blvd, St. Louis, MO 63110',
    city: 'St. Louis',
    state: 'MO',
    zip: '63110',
    coordinates: { lat: 38.6128, lng: -90.2590 },
    category: 'landmark',
    isPopular: false,
    isActive: true,
    aliases: ['Botanical Garden', 'Shaws Garden', 'Climatron', 'Tower Grove Park'],
    notes: 'National historic landmark with world-class plant collections and Climatron.',
  },
  {
    id: 'place-fox-theatre',
    name: 'The Fabulous Fox Theatre',
    shortName: 'The Fox Theatre',
    address: '527 N Grand Blvd, St. Louis, MO 63103',
    city: 'St. Louis',
    state: 'MO',
    zip: '63103',
    coordinates: { lat: 38.6402, lng: -90.2341 },
    category: 'venue',
    isPopular: false,
    isActive: true,
    aliases: ['The Fox', 'Fox Theater', 'Grand Center Arts', 'Broadway St Louis'],
    notes: 'Opulent historic theater in Grand Center Arts District hosting Broadway tours.',
  },
  {
    id: 'place-st-louis-union-station',
    name: 'St. Louis Union Station & Wheel',
    shortName: 'Union Station STL',
    address: '1820 Market St, St. Louis, MO 63103',
    city: 'St. Louis',
    state: 'MO',
    zip: '63103',
    coordinates: { lat: 38.6292, lng: -90.2078 },
    category: 'landmark',
    isPopular: false,
    isActive: true,
    aliases: ['Union Station', 'St Louis Aquarium', 'The Wheel', 'Curio Collection Union Station'],
    notes: 'National historic landmark featuring St. Louis Aquarium, 200-ft Wheel, and hotel.',
  },

  // ─── Corporate Hubs & Premier Hotels ───
  {
    id: 'place-smoke-house-market',
    name: 'Smoke House Market & Annie Gunn\'s',
    shortName: 'Smoke House Chesterfield',
    address: '16806 Chesterfield Airport Rd, Chesterfield, MO 63005',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63005',
    coordinates: { lat: 38.6644, lng: -90.6175 },
    category: 'corporate',
    isPopular: true,
    isActive: true,
    aliases: ['Smoke House', 'Smoke House Market', 'Annie Gunns', 'Annie Gunn', 'Smokehouse'],
    notes: 'Historic specialty market and award-winning dining destination.',
  },
  {
    id: 'place-ritz-carlton-st-louis',
    name: 'The Ritz-Carlton, St. Louis (Clayton)',
    shortName: 'The Ritz-Carlton Clayton',
    address: '100 Carondelet Plaza, St. Louis, MO 63105',
    city: 'Clayton',
    state: 'MO',
    zip: '63105',
    coordinates: { lat: 38.6483, lng: -90.3392 },
    category: 'hotel',
    isPopular: true,
    isActive: true,
    aliases: ['Ritz Carlton', 'Ritz', 'Ritz Clayton', 'Carondelet Plaza'],
    notes: 'Luxury 5-star hotel in downtown Clayton financial center.',
  },
  {
    id: 'place-doubletree-chesterfield',
    name: 'DoubleTree by Hilton Hotel St. Louis - Chesterfield',
    shortName: 'DoubleTree Chesterfield',
    address: '16625 Swingley Ridge Rd, Chesterfield, MO 63017',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63017',
    coordinates: { lat: 38.6598, lng: -90.5732 },
    category: 'hotel',
    isPopular: true,
    isActive: true,
    aliases: ['DoubleTree', 'DoubleTree Chesterfield', 'Swingley Ridge Hotel', 'Chesterfield Hilton'],
    notes: 'Full-service conference hotel in central Chesterfield corporate corridor.',
  },
  {
    id: 'place-hyatt-regency-arch',
    name: 'Hyatt Regency St. Louis at The Arch',
    shortName: 'Hyatt Regency Arch',
    address: '315 Chestnut St, St. Louis, MO 63102',
    city: 'St. Louis',
    state: 'MO',
    zip: '63102',
    coordinates: { lat: 38.6256, lng: -90.1882 },
    category: 'hotel',
    isPopular: false,
    isActive: true,
    aliases: ['Hyatt Arch', 'Hyatt Downtown', 'Chestnut Hotel', 'Hyatt Regency'],
    notes: 'Premier downtown convention and riverfront hotel overlooking the Gateway Arch.',
  },
  {
    id: 'place-bayer-us-crop-science',
    name: 'Bayer U.S. Crop Science Headquarters',
    shortName: 'Bayer Crop Science HQ',
    address: '800 N Lindbergh Blvd, St. Louis, MO 63167',
    city: 'Creve Coeur',
    state: 'MO',
    zip: '63167',
    coordinates: { lat: 38.6652, lng: -90.4071 },
    category: 'corporate',
    isPopular: false,
    isActive: true,
    aliases: ['Bayer', 'Monsanto', 'Bayer HQ', 'Lindbergh Campus'],
    notes: 'Major global agricultural science corporate campus.',
  },
  {
    id: 'place-centene-corporation-hq',
    name: 'Centene Corporation Headquarters',
    shortName: 'Centene HQ Clayton',
    address: '7700 Forsyth Blvd, Clayton, MO 63105',
    city: 'Clayton',
    state: 'MO',
    zip: '63105',
    coordinates: { lat: 38.6531, lng: -90.3347 },
    category: 'corporate',
    isPopular: false,
    isActive: true,
    aliases: ['Centene', 'Centene Plaza', 'Forsyth Tower', 'Centene Clayton'],
    notes: 'Fortune 50 healthcare corporate headquarters in Clayton central business district.',
  },
  {
    id: 'place-edward-jones-hq',
    name: 'Edward Jones Headquarters Campus',
    shortName: 'Edward Jones HQ',
    address: '12555 Manchester Rd, Des Peres, MO 63131',
    city: 'Des Peres',
    state: 'MO',
    zip: '63131',
    coordinates: { lat: 38.6012, lng: -90.4534 },
    category: 'corporate',
    isPopular: false,
    isActive: true,
    aliases: ['Edward Jones', 'Jones HQ', 'Des Peres Campus'],
    notes: 'Financial services corporate headquarters campus off Manchester Rd and I-270.',
  },
  {
    id: 'place-rga-headquarters',
    name: 'Reinsurance Group of America (RGA) Headquarters',
    shortName: 'RGA Headquarters',
    address: '16600 Swingley Ridge Rd, Chesterfield, MO 63017',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63017',
    coordinates: { lat: 38.6591, lng: -90.5714 },
    category: 'corporate',
    isPopular: false,
    isActive: true,
    aliases: ['RGA', 'Reinsurance Group', 'RGA Chesterfield'],
    notes: 'Fortune 500 global reinsurance corporate headquarters in Chesterfield.',
  },
  {
    id: 'place-world-wide-technology-hq',
    name: 'World Wide Technology Headquarters',
    shortName: 'WWT Headquarters',
    address: '1 Westport Plaza Dr, St. Louis, MO 63146',
    city: 'Maryland Heights',
    state: 'MO',
    zip: '63146',
    coordinates: { lat: 38.6976, lng: -90.4571 },
    category: 'corporate',
    isPopular: false,
    isActive: true,
    aliases: ['WWT', 'World Wide Technology', 'Westport Plaza WWT'],
    notes: 'Technology solutions corporate campus at Westport Plaza.',
  },
  {
    id: 'place-westport-plaza',
    name: 'Westport Plaza Entertainment & Business District',
    shortName: 'Westport Plaza',
    address: '111 West Port Plaza Dr, St. Louis, MO 63146',
    city: 'Maryland Heights',
    state: 'MO',
    zip: '63146',
    coordinates: { lat: 38.6983, lng: -90.4554 },
    category: 'venue',
    isPopular: false,
    isActive: true,
    aliases: ['Westport', 'West Port Plaza', 'Sheraton Westport', 'Funny Bone'],
    notes: 'Mixed-use business, hotel, dining, and comedy venue district off I-270 and Page Ave.',
  },

  // ─── Transit & Train Stations ───
  {
    id: 'place-gateway-multimodal-amtrak',
    name: 'Gateway Multimodal Transportation Center / Amtrak (STL)',
    shortName: 'Gateway Amtrak Station',
    address: '430 S 15th St, St. Louis, MO 63103',
    city: 'St. Louis',
    state: 'MO',
    zip: '63103',
    coordinates: { lat: 38.6238, lng: -90.2038 },
    category: 'transit',
    isPopular: true,
    isActive: true,
    aliases: ['Amtrak STL', 'Downtown Amtrak', 'Greyhound STL', 'Gateway Center', 'Train Station STL'],
    notes: 'Downtown passenger rail, Amtrak Lincoln Service / Missouri River Runner, and intercity bus station.',
  },
  {
    id: 'place-kirkwood-amtrak-station',
    name: 'Kirkwood Amtrak Station',
    shortName: 'Kirkwood Amtrak',
    address: '110 W Argonne Dr, Kirkwood, MO 63122',
    city: 'Kirkwood',
    state: 'MO',
    zip: '63122',
    coordinates: { lat: 38.5828, lng: -90.4072 },
    category: 'transit',
    isPopular: false,
    isActive: true,
    aliases: ['Kirkwood Station', 'Kirkwood Train', 'Argonne Amtrak'],
    notes: 'Historic suburban passenger rail depot in downtown Kirkwood.',
  },
];

const SPECIAL_PLACES_STORAGE_KEY = 'chesterfield_taxi_special_places_v2';

export class SpecialPlacesService {
  private db: Firestore | null = null;
  private cache: SpecialPlace[] = [];

  constructor() {
    this.cache = this.loadFromLocalStorage();
  }

  private initDb() {
    if (!this.db && isFirebaseConfigured()) {
      this.db = getFirestoreDb();
    }
  }

  private loadFromLocalStorage(): SpecialPlace[] {
    if (typeof window === 'undefined') return DEFAULT_SPECIAL_PLACES;
    try {
      const stored = localStorage.getItem(SPECIAL_PLACES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge in any newly added default places that might not yet exist in local cache
          const existingIds = new Set(parsed.map((p) => p.id));
          const missingDefaults = DEFAULT_SPECIAL_PLACES.filter((p) => !existingIds.has(p.id));
          if (missingDefaults.length > 0) {
            const merged = [...parsed, ...missingDefaults];
            this.saveToLocalStorage(merged);
            return merged;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[SpecialPlacesService] Failed to load from localStorage:', e);
    }
    return DEFAULT_SPECIAL_PLACES;
  }

  private saveToLocalStorage(places: SpecialPlace[]) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(SPECIAL_PLACES_STORAGE_KEY, JSON.stringify(places));
    } catch (e) {
      console.warn('[SpecialPlacesService] Failed to save to localStorage:', e);
    }
  }

  public getAllPlaces(): SpecialPlace[] {
    if (this.cache.length === 0) {
      this.cache = this.loadFromLocalStorage();
    }
    return [...this.cache];
  }

  public getActivePlaces(): SpecialPlace[] {
    return this.getAllPlaces().filter((p) => p.isActive);
  }

  public getPopularPlaces(): SpecialPlace[] {
    return this.getActivePlaces().filter((p) => p.isPopular);
  }

  public searchPlaces(query: string): SpecialPlace[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.getPopularPlaces();

    return this.getActivePlaces().filter((place) => {
      const matchName = place.name.toLowerCase().includes(q);
      const matchShort = place.shortName?.toLowerCase().includes(q);
      const matchAddress = place.address.toLowerCase().includes(q);
      const matchCity = place.city.toLowerCase().includes(q);
      const matchZip = place.zip.toLowerCase().includes(q);
      const matchAliases = place.aliases?.some((a) => a.toLowerCase().includes(q));
      return matchName || matchShort || matchAddress || matchCity || matchZip || matchAliases;
    });
  }

  public async savePlace(place: SpecialPlace): Promise<void> {
    const updated = {
      ...place,
      updatedAt: new Date().toISOString(),
    };

    const index = this.cache.findIndex((p) => p.id === place.id);
    if (index >= 0) {
      this.cache[index] = updated;
    } else {
      this.cache.push(updated);
    }

    this.saveToLocalStorage(this.cache);

    // Save to Firestore if connected
    this.initDb();
    if (this.db) {
      try {
        const ref = doc(this.db, 'specialPlaces', place.id);
        await setDoc(ref, sanitizePayload(updated), { merge: true });
      } catch (e) {
        console.warn('[SpecialPlacesService] Failed to save to Firestore:', e);
      }
    }
  }

  public async deletePlace(id: string): Promise<void> {
    this.cache = this.cache.filter((p) => p.id !== id);
    this.saveToLocalStorage(this.cache);

    this.initDb();
    if (this.db) {
      try {
        const ref = doc(this.db, 'specialPlaces', id);
        await deleteDoc(ref);
      } catch (e) {
        console.warn('[SpecialPlacesService] Failed to delete from Firestore:', e);
      }
    }
  }

  public async syncWithFirestore(): Promise<SpecialPlace[]> {
    this.initDb();
    if (!this.db) return this.getAllPlaces();

    try {
      const snapshot = await getDocs(collection(this.db, 'specialPlaces'));
      if (!snapshot.empty) {
        const loaded: SpecialPlace[] = [];
        snapshot.forEach((d) => {
          loaded.push({ id: d.id, ...d.data() } as SpecialPlace);
        });
        if (loaded.length > 0) {
          this.cache = loaded;
          this.saveToLocalStorage(loaded);
          return loaded;
        }
      }
    } catch (e) {
      console.warn('[SpecialPlacesService] Failed to sync from Firestore:', e);
    }
    return this.getAllPlaces();
  }

  public async resetToDefaults(): Promise<SpecialPlace[]> {
    this.cache = [...DEFAULT_SPECIAL_PLACES];
    this.saveToLocalStorage(this.cache);
    return this.getAllPlaces();
  }
}

let specialPlacesInstance: SpecialPlacesService | null = null;

export function getSpecialPlacesService(): SpecialPlacesService {
  if (!specialPlacesInstance) {
    specialPlacesInstance = new SpecialPlacesService();
  }
  return specialPlacesInstance;
}
