/**
 * Pure Local Airport & West County SEO Engine (`local-corridor-seo.service.ts`)
 *
 * Strictly pure, deterministic TypeScript module (zero React, DOM, or `*.server` / `node:*` imports):
 * 1. Curated 8-corridor Greater St. Louis Airport, FBO & West County catalog (`LOCAL_SEO_CORRIDORS`)
 * 2. Instant upfront corridor fare estimator (`computeCorridorFareEstimates`)
 * 3. `/book` query prefill builder & sanitizer (`buildPrepopulatedBookUrl`, `parseBookRouteQueryInitialValues`)
 * 4. Schema.org JSON-LD builders (`TaxiService`, `FAQPage`, `BreadcrumbList`) & XSS-safe script serializer
 * 5. Dynamic `/robots.txt` & `/sitemap.xml` canonical origin & payload generators
 */

import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { detectAirportInAddresses } from '../../config/airports';
import type { BookingEngineV2InitialValues } from '../../hooks/booking/useCustomerBookingSubmission';
import type { AppSettings, CompanyConfig, VehicleTierConfig } from '../../types/config';
import type { GeoPoint } from '../../types/trip';

export type LocalSeoCorridorCategory = 'airport' | 'fbo' | 'corporate' | 'suburban';
export type CorridorDirection = 'outbound' | 'inbound';
export type PrepopulatedBookVehicleChoice = 'any' | 'sedan' | 'suv' | 'van';

export interface LocalSeoCorridorEndpoint {
  label: string;
  address: string;
  coordinates: GeoPoint;
}

export interface LocalSeoFaqItem {
  question: string;
  answer: string;
}

export interface LocalSeoCorridor {
  slug: string;
  shortTitle: string;
  heroHeadline: string;
  heroSubheadline: string;
  metaTitle: string;
  metaDescription: string;
  category: LocalSeoCorridorCategory;
  outboundOrigin: LocalSeoCorridorEndpoint;
  outboundDestination: LocalSeoCorridorEndpoint;
  distanceMiles: number;
  typicalDurationMinutes: number;
  zipCodes: string[];
  landmarks: string[];
  pickupInstructions: string[];
  faqs: LocalSeoFaqItem[];
}

export interface CorridorVehicleFareEstimate {
  tierId: 'standard' | 'premium' | 'xl';
  label: string;
  shortLabel: string;
  description: string;
  badge?: string;
  bookVehicleChoice: PrepopulatedBookVehicleChoice;
  maxPassengers: number;
  maxLuggage: number;
  fitsPassengers: boolean;
  multiplier: number;
  baseAndDistanceSubtotal: number;
  airportSurcharge: number;
  extraPassengersFee: number;
  estimatedFare: number;
  estimatedFareWholeDollars: number;
  bookUrl: string;
}

export interface CorridorFareEstimateSummary {
  corridorSlug: string;
  direction: CorridorDirection;
  passengers: number;
  pickup: LocalSeoCorridorEndpoint;
  dropoff: LocalSeoCorridorEndpoint;
  distanceMiles: number;
  typicalDurationMinutes: number;
  isAirportCorridor: boolean;
  airportCode?: string;
  airportSurcharge: number;
  startingFare: number;
  recommendedTierId: 'standard' | 'premium' | 'xl';
  tiers: CorridorVehicleFareEstimate[];
}

export interface ComputeCorridorFareParams {
  corridor: LocalSeoCorridor;
  direction?: CorridorDirection;
  passengers?: number;
  settings?: Partial<AppSettings>;
}

export interface PrepopulatedBookUrlParams {
  pickupAddress: string;
  pickupCoordinates?: GeoPoint;
  dropoffAddress: string;
  dropoffCoordinates?: GeoPoint;
  vehicleChoice?: PrepopulatedBookVehicleChoice;
  passengers?: number;
  timingType?: 'asap' | 'later';
  driverNotes?: string;
}

export interface BreadcrumbJsonLdInput {
  name: string;
  url: string;
}

export interface BuildTaxiServiceJsonLdParams {
  corridor?: LocalSeoCorridor;
  origin: string;
  company?: Partial<CompanyConfig>;
  estimates?: CorridorFareEstimateSummary;
}

const DEFAULT_CANONICAL_SITE_ORIGIN = 'https://chesterfieldtaxi.com';
const MAX_ADDRESS_QUERY_LENGTH = 240;
const MAX_NOTES_QUERY_LENGTH = 500;
const VALID_BOOK_VEHICLE_CHOICES: ReadonlySet<PrepopulatedBookVehicleChoice> = new Set([
  'any',
  'sedan',
  'suv',
  'van',
]);

// ---------------------------------------------------------------------------
// 1. Curated High-Intent Corridor Catalog (8 Corridors)
// ---------------------------------------------------------------------------

export const LOCAL_SEO_CORRIDORS: readonly LocalSeoCorridor[] = [
  {
    slug: 'chesterfield-to-stl-airport',
    shortTitle: 'Chesterfield ↔ STL Lambert Airport',
    heroHeadline: 'Chesterfield, MO ↔ St. Louis Lambert International Airport (STL)',
    heroSubheadline:
      'Guaranteed 24/7 airport taxi and executive SUV transfers along the I-64 / US-40 & I-270 corridor with live flight arrival tracking and upfront flat-style pricing.',
    metaTitle: 'Chesterfield to STL Airport Taxi & Car Service | Upfront Rates – Chesterfield Taxi',
    metaDescription:
      'Book reliable 24/7 Chesterfield, MO to St. Louis Lambert International Airport (STL) taxi & SUV transfers. Upfront quotes, flight delay tracking, and Terminal 1 & 2 curbside pickup.',
    category: 'airport',
    outboundOrigin: {
      label: 'Chesterfield Valley & Central Chesterfield',
      address: '400 Chesterfield Center, Chesterfield, MO 63017',
      coordinates: { lat: 38.6531, lng: -90.5539 },
    },
    outboundDestination: {
      label: 'St. Louis Lambert International Airport (STL)',
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    distanceMiles: 20.4,
    typicalDurationMinutes: 26,
    zipCodes: ['63017', '63005', '63145'],
    landmarks: [
      'Chesterfield Commons & Chesterfield Valley',
      'Pfizer & Bayer Chesterfield Research Park',
      'Drury Plaza & Marriott St. Louis West',
      'STL Lambert Terminal 1 & Terminal 2',
    ],
    pickupInstructions: [
      'Outbound from Chesterfield (63017 / 63005): Chauffeur arrives 5–10 minutes early at your residence driveway, gated community entrance, or hotel porte-cochère.',
      'STL Terminal 1 Arrivals (American, Delta, United, Alaska, Spirit, Frontier, Air Canada): Proceed to Lower Level Baggage Claim and exit Door 6 or Door 12 for commercial car service pickup.',
      'STL Terminal 2 Arrivals (Southwest Airlines & Lufthansa): Collect checked bags on the lower level and exit Door 12 directly to the commercial ground transport lane.',
      'Live Flight Monitoring: Enter your flight number on the booking form—dispatch automatically adjusts your driver stage time if your arrival is early or delayed.',
    ],
    faqs: [
      {
        question: 'How long does a taxi ride from Chesterfield to STL Lambert Airport take?',
        answer:
          'Typical travel time between Chesterfield (63017 / 63005) and St. Louis Lambert International Airport is 24 to 30 minutes via I-64 East and I-270 North outside heavy rush-hour construction windows.',
      },
      {
        question: 'Do you track early-morning 5:00 AM departures and late-night STL arrivals?',
        answer:
          'Yes. Chesterfield Taxi operates 24/7/365. Pre-scheduled 4:00 AM–6:00 AM airport departures are staged in advance, and inbound STL flights are tracked automatically for gate delays.',
      },
      {
        question: 'Are upfront Chesterfield to STL Airport fares affected by rideshare surge pricing?',
        answer:
          'No. Your quoted corridor fare is locked upfront before you confirm, with transparent itemization and zero dynamic post-concert or storm rideshare surge multipliers.',
      },
      {
        question: 'Can we book an XL SUV or Minivan with child safety seats for family airport travel?',
        answer:
          'Yes. Select XL SUV / Minivan (up to 6 passengers and 5 suitcases) and add rear-facing, forward-facing, or booster seats directly during online checkout.',
      },
    ],
  },
  {
    slug: 'spirit-of-st-louis-airport-sus',
    shortTitle: 'Spirit of St. Louis Airport (SUS) FBO',
    heroHeadline: 'Spirit of St. Louis Airport (SUS) & FBO Executive Car Service',
    heroSubheadline:
      'Dedicated private aviation ground transport serving Signature Aviation, Million Air, Jet Aviation, and corporate hangars across Chesterfield Valley and Clayton.',
    metaTitle: 'Spirit of St. Louis Airport (SUS) FBO Car Service | Signature & Million Air',
    metaDescription:
      '24/7 private aviation car & executive SUV service at Spirit of St. Louis Airport (SUS) in Chesterfield, MO. Tail-number tracking for Signature Aviation, Million Air & Jet Aviation FBOs.',
    category: 'fbo',
    outboundOrigin: {
      label: 'Spirit of St. Louis Airport (SUS) — FBO Ramp',
      address: '18270 Edison Ave, Spirit of St. Louis Airport, Chesterfield, MO 63005',
      coordinates: { lat: 38.6621, lng: -90.652 },
    },
    outboundDestination: {
      label: 'Clayton Business District & Executive Hotels',
      address: '8000 Forsyth Blvd, Clayton, MO 63105',
      coordinates: { lat: 38.65, lng: -90.3399 },
    },
    distanceMiles: 21.8,
    typicalDurationMinutes: 27,
    zipCodes: ['63005', '63017', '63105', '63131'],
    landmarks: [
      'Signature Aviation — Spirit of St. Louis (SUS)',
      'Million Air / TAC Air Spirit FBO',
      'Jet Aviation & Premier Jet Center',
      'Chesterfield Valley Corporate Hangars',
    ],
    pickupInstructions: [
      'FBO Ramp & Lobby Coordination: Provide your aircraft tail number and FBO facility (Signature Aviation, Million Air, Premier Jet Center, or private hangar) when booking.',
      'Planeside vs. FBO Concierge Desk: Where cleared by FBO line service, chauffeurs stage planeside; otherwise your driver awaits inside the FBO executive lobby 15 minutes prior to wheels-down.',
      'Flight Crew & Multi-Vehicle Transfers: Separate crew sedans and passenger XL SUVs can be coordinated under a single corporate PO or credit card.',
      'Direct Transfers Between SUS and STL Commercial Flights: Rapid 28-minute inter-airport transfers for connecting commercial flights or flight department crews.',
    ],
    faqs: [
      {
        question: 'Which FBO facilities at Spirit of St. Louis Airport (SUS) do you serve?',
        answer:
          'We serve every FBO and corporate hangar at SUS (63005), including Signature Aviation, Million Air (formerly TAC Air), Premier Jet Center, and private Edison Avenue hangars, plus Jet Aviation at CPS.',
      },
      {
        question: 'Can flight departments book with an aircraft tail number instead of a commercial airline code?',
        answer:
          'Yes. Our booking form and dispatch console support private aviation tail numbers, FBO selection, and direct coordination with FBO front-desk concierges.',
      },
      {
        question: 'How fast can a car reach Spirit of St. Louis Airport for an unscheduled charter arrival?',
        answer:
          'Because Chesterfield is our primary home dispatch hub, on-duty sedans and executive SUVs are typically within 8 to 15 minutes of Edison Avenue at SUS.',
      },
    ],
  },
  {
    slug: 'clayton-to-stl-airport',
    shortTitle: 'Clayton Business District ↔ STL Airport',
    heroHeadline: 'Clayton Business District & Hotels ↔ STL Lambert Airport',
    heroSubheadline:
      'Prompt executive taxi and black-car style transfers connecting Forsyth & Maryland Avenue towers, luxury Clayton hotels, and WashU with STL Terminals 1 & 2.',
    metaTitle: 'Clayton MO to STL Airport Taxi & Executive Car Service – Chesterfield Taxi',
    metaDescription:
      'Upfront taxi and executive car service between Clayton, MO (63105) hotels, law firms, and financial towers and St. Louis Lambert International Airport (STL) via I-170.',
    category: 'corporate',
    outboundOrigin: {
      label: 'Downtown Clayton Business District',
      address: '8000 Forsyth Blvd, Clayton, MO 63105',
      coordinates: { lat: 38.65, lng: -90.3399 },
    },
    outboundDestination: {
      label: 'St. Louis Lambert International Airport (STL)',
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    distanceMiles: 10.6,
    typicalDurationMinutes: 17,
    zipCodes: ['63105', '63117', '63124', '63145'],
    landmarks: [
      'The Ritz-Carlton, St. Louis & Le Méridien Clayton',
      'Centene Plaza & Forsyth Financial Towers',
      'St. Louis County Government Center',
      'Washington University Danforth Campus',
    ],
    pickupInstructions: [
      'Clayton Hotels (Ritz-Carlton, Le Méridien, Residence Inn, Seven Gables): Curbside bell-stand pickup with SMS driver arrival link.',
      'Forsyth, Bemiston & Carondelet Office Towers: Specify North/South lobby or valet circle in Driver Notes for zero-delay curb boarding.',
      'Direct I-170 North Airport Routing: Straight 10.6-mile express run to STL Terminal 1 or Terminal 2 in ~15–20 minutes.',
    ],
    faqs: [
      {
        question: 'How long is the ride from Downtown Clayton to STL Lambert Airport?',
        answer:
          'Via I-170 North, Downtown Clayton (63105) to STL Lambert Airport is just 10.6 miles and typically takes 15 to 20 minutes.',
      },
      {
        question: 'Do you support corporate monthly billing and PO numbers for Clayton law and financial firms?',
        answer:
          'Yes. Corporate accounts receive Net-15/Net-30 consolidated invoicing, PO validation, authorized rider rosters, and instant itemized PDF/email receipts.',
      },
      {
        question: 'Can hotel concierges in Clayton book on behalf of VIP guests?',
        answer:
          'Yes. Toggle "Booking for someone else" on the booking page to enter guest name and mobile number so the guest receives live GPS tracking directly.',
      },
    ],
  },
  {
    slug: 'town-and-country-car-service',
    shortTitle: 'Town & Country & Frontenac ↔ STL Airport',
    heroHeadline: 'Town & Country, Frontenac & Mason Corridor ↔ STL Airport',
    heroSubheadline:
      'Discreet door-to-door residential, hospital, and luxury retail car service across Town & Country (63131), Ladue, and Plaza Frontenac.',
    metaTitle: 'Town & Country & Frontenac MO Car Service & STL Airport Taxi',
    metaDescription:
      'Door-to-door Town & Country (63131), Frontenac, and Mason Rd car service & STL Lambert Airport transfers. Upfront quotes, spacious SUVs, and 24/7 dispatch.',
    category: 'suburban',
    outboundOrigin: {
      label: 'Town & Country & Frontenac (Mason / Clayton Rd)',
      address: '13430 Clayton Rd, Town and Country, MO 63131',
      coordinates: { lat: 38.6309, lng: -90.4632 },
    },
    outboundDestination: {
      label: 'St. Louis Lambert International Airport (STL)',
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    distanceMiles: 15.8,
    typicalDurationMinutes: 22,
    zipCodes: ['63131', '63124', '63141', '63145'],
    landmarks: [
      'Plaza Frontenac & Hilton St. Louis Frontenac',
      'Missouri Baptist Medical Center',
      'Maryville University & Woods Mill Corridor',
      'Bellerive Country Club & Mason Rd Estates',
    ],
    pickupInstructions: [
      'Private Estates & Gated Lanes (63131 / 63124): Enter your gate code securely during booking—gate codes are scrubbed from public links and shown only to your assigned chauffeur.',
      'Missouri Baptist & St. Luke’s Campuses: Specify building canopy or outpatient entrance for attentive curbside assistance.',
      'STL Return Pickups: Pre-book round-trip returns with automatic flight arrival monitoring at Terminals 1 and 2.',
    ],
    faqs: [
      {
        question: 'Are gate codes kept private when booking residential pickups in Town & Country or Ladue?',
        answer:
          'Yes. Gate and entry codes are never exposed on public tracking URLs and are transmitted strictly to dispatch and your assigned driver.',
      },
      {
        question: 'How early should I schedule a pickup from Town & Country to STL Airport?',
        answer:
          'The drive is approximately 20–25 minutes via I-270 North or I-64/I-170. We recommend scheduling pickup 2 hours before domestic departures.',
      },
      {
        question: 'Can I book oversized luggage space for golf clubs from Bellerive or Westwood?',
        answer:
          'Yes. Enable Oversized Luggage on the booking page to reserve an XL SUV / Minivan with guaranteed cargo space for golf travel bags.',
      },
    ],
  },
  {
    slug: 'creve-coeur-executive-taxi',
    shortTitle: 'Creve Coeur Corporate & Medical ↔ STL',
    heroHeadline: 'Creve Coeur Corporate & Medical Campus ↔ STL Airport',
    heroSubheadline:
      'Dependable corporate campus, AgTech research, and hospital ground transport along Olive Blvd, North Lindbergh, and I-270.',
    metaTitle: 'Creve Coeur MO Executive Taxi & STL Airport Car Service – Chesterfield Taxi',
    metaDescription:
      '24/7 Creve Coeur (63141 / 63167) corporate & medical taxi service to STL Lambert Airport and Spirit Airport (SUS). Serving Bayer, 39 North, Mercy & Barnes-Jewish West County.',
    category: 'corporate',
    outboundOrigin: {
      label: 'Creve Coeur Corporate Corridor (Olive & Lindbergh)',
      address: '800 N Lindbergh Blvd, Creve Coeur, MO 63141',
      coordinates: { lat: 38.6717, lng: -90.4087 },
    },
    outboundDestination: {
      label: 'St. Louis Lambert International Airport (STL)',
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    distanceMiles: 11.4,
    typicalDurationMinutes: 18,
    zipCodes: ['63141', '63167', '63146', '63145'],
    landmarks: [
      'Bayer Crop Science North America HQ & 39 North District',
      'Mercy Hospital St. Louis (New Ballas)',
      'Barnes-Jewish West County Hospital',
      'CityPlace & Olive/I-270 Corporate Parks',
    ],
    pickupInstructions: [
      'Corporate Visitor Circles (Bayer, 39 North, CityPlace): Include Building Letter or Security Gate in Driver Notes for seamless campus entry.',
      'Mercy & Barnes-Jewish West County Discharges: Coordinate through nursing/concierge desk using our third-party booker fields.',
      'Fast Airport Access: Direct Lindbergh (US-67) or I-270 North routing reaches STL Lambert Terminals 1 & 2 in ~18 minutes.',
    ],
    faqs: [
      {
        question: 'How far is Creve Coeur from St. Louis Lambert International Airport?',
        answer:
          'Creve Coeur (63141) is approximately 11.4 miles from STL Lambert Airport—about an 18-minute drive via I-270 North or North Lindbergh Blvd.',
      },
      {
        question: 'Do you offer recurring standing orders for daily Creve Coeur employee or medical rides?',
        answer:
          'Yes. Our dispatch desk and corporate accounts support daily, weekday, and custom recurring standing orders with preferred driver staging.',
      },
      {
        question: 'Can visiting executives connect directly between Creve Coeur and Spirit Airport (SUS)?',
        answer:
          'Yes. Creve Coeur to Spirit of St. Louis Airport (SUS) is a direct 15–18 minute run west via Olive Blvd or I-64.',
      },
    ],
  },
  {
    slug: 'wildwood-and-ellisville-taxi',
    shortTitle: 'Wildwood, Ballwin & Ellisville ↔ STL',
    heroHeadline: 'Wildwood, Ballwin & Ellisville ↔ STL Lambert & West County',
    heroSubheadline:
      'Guaranteed far-West County pickups where app rideshares cancel—serving Wildwood Town Center, Clarkson Valley, Ellisville, and Ballwin 24/7.',
    metaTitle: 'Wildwood, Ballwin & Ellisville MO Taxi & STL Airport Car Service',
    metaDescription:
      'Pre-scheduled & on-demand taxi and SUV service for Wildwood (63040 / 63038), Ellisville (63011), and Ballwin (63021) to STL Lambert Airport and Spirit Airport.',
    category: 'suburban',
    outboundOrigin: {
      label: 'Wildwood Town Center & Ellisville',
      address: '16860 Main St, Wildwood, MO 63040',
      coordinates: { lat: 38.5809, lng: -90.6629 },
    },
    outboundDestination: {
      label: 'St. Louis Lambert International Airport (STL)',
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    distanceMiles: 27.6,
    typicalDurationMinutes: 35,
    zipCodes: ['63040', '63038', '63011', '63021', '63145'],
    landmarks: [
      'Wildwood Town Center & Highway 100 Corridor',
      'Babler State Park & Hidden Valley Area',
      'Clarkson & Manchester Rd Commercial Hub',
      'Ballwin, Ellisville & Winchester Neighborhoods',
    ],
    pickupInstructions: [
      'Guaranteed Far-West Staging: Unlike on-demand apps with sparse drivers west of Hwy 109, pre-booked Wildwood and Glencoe pickups have a dedicated driver staged ahead of your pickup window.',
      'Rural & Long-Driveway Estates (63038 / 63040): Add driveway landmarks or turnaround notes so your driver pulls directly to your front door.',
      'Manchester & Clarkson Corridor: Rapid 10–15 minute local service across Ellisville, Ballwin, and Chesterfield Valley.',
    ],
    faqs: [
      {
        question: 'Can I count on an early-morning airport pickup in Wildwood (63040 / 63038)?',
        answer:
          'Yes. Because Chesterfield Taxi dispatches directly out of West County and pre-stages scheduled drivers before your pickup lead window, early-morning Wildwood airport rides are guaranteed.',
      },
      {
        question: 'How long does it take to get from Wildwood or Ellisville to STL Airport?',
        answer:
          'Plan for 32 to 40 minutes via Hwy 109 / Clarkson Rd to I-64 East and I-270 North.',
      },
      {
        question: 'Do you also provide local rides between Wildwood, Ballwin, Ellisville, and Chesterfield hospitals?',
        answer:
          'Yes. We run point-to-point local trips 24/7 to St. Luke’s Hospital, Mercy, Chesterfield Valley dining, and West County Center.',
      },
    ],
  },
  {
    slug: 'maryland-heights-westport-taxi',
    shortTitle: 'Maryland Heights & Westport ↔ STL',
    heroHeadline: 'Maryland Heights & Westport Plaza ↔ STL Lambert Airport',
    heroSubheadline:
      'Fast 14-minute airport shuttles, hotel transfers, and convention rides across Westport Plaza, Page Ave, Earth City, and Hollywood Casino.',
    metaTitle: 'Maryland Heights & Westport Plaza to STL Airport Taxi – Chesterfield Taxi',
    metaDescription:
      'Quick 14-minute taxi & SUV transfers between Maryland Heights, Westport Plaza, Hollywood Casino & Riverport (63146 / 63043) and STL Lambert Airport.',
    category: 'airport',
    outboundOrigin: {
      label: 'Westport Plaza & Maryland Heights Hotels',
      address: '111 West Port Plaza Dr, St. Louis, MO 63146',
      coordinates: { lat: 38.7009, lng: -90.4439 },
    },
    outboundDestination: {
      label: 'St. Louis Lambert International Airport (STL)',
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    distanceMiles: 8.9,
    typicalDurationMinutes: 14,
    zipCodes: ['63146', '63043', '63145'],
    landmarks: [
      'Westport Plaza & Sheraton Westport Hotels',
      'Hollywood Casino & St. Louis Music Park',
      'Centene Community Ice Center',
      'Riverport & Earth City Business Parks',
    ],
    pickupInstructions: [
      'Westport Plaza Hotels & Dining: Pickup at main hotel porte-cochère or designated West Port Plaza Drive roundabout.',
      'Concerts & Hockey Tournaments (Music Park / Centene Ice Center): Pre-book post-event pickups at fixed upfront rates—zero event surge.',
      'Express STL Airport Run: Less than 9 miles via I-270 North to I-70 East straight into STL Terminals 1 & 2.',
    ],
    faqs: [
      {
        question: 'How quick is a taxi from Westport Plaza to STL Lambert Airport?',
        answer:
          'Westport Plaza (63146) is under 9 miles from STL Lambert International Airport, averaging just 12 to 16 minutes door-to-terminal.',
      },
      {
        question: 'Do you handle team & family SUV transport for Centene Community Ice Center tournaments?',
        answer:
          'Yes. Our XL SUVs and Minivans accommodate hockey bags and oversized sports gear with upfront flat-rate transparency.',
      },
      {
        question: 'Are pickups available after late-night shows at St. Louis Music Park or Hollywood Casino?',
        answer:
          'Yes—we operate 24/7 with zero late-night surge multipliers.',
      },
    ],
  },
  {
    slug: 'downtown-st-louis-airport-transfer',
    shortTitle: "Downtown St. Louis & America's Center ↔ STL",
    heroHeadline: "Downtown St. Louis, America's Center & Busch Stadium ↔ STL & Chesterfield",
    heroSubheadline:
      'Direct convention, hotel, stadium, and Amtrak/Gateway Station transfers linking Downtown St. Louis with STL Airport and West County.',
    metaTitle: 'Downtown St. Louis to STL Airport Taxi & Convention Car Service',
    metaDescription:
      "Upfront Downtown St. Louis (63101–63103) taxi & SUV transfers between America's Center, Busch Stadium, Union Station, STL Lambert Airport & Chesterfield.",
    category: 'corporate',
    outboundOrigin: {
      label: "Downtown St. Louis & America's Center",
      address: '701 Convention Plaza, St. Louis, MO 63101',
      coordinates: { lat: 38.6327, lng: -90.1912 },
    },
    outboundDestination: {
      label: 'St. Louis Lambert International Airport (STL)',
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    distanceMiles: 14.2,
    typicalDurationMinutes: 20,
    zipCodes: ['63101', '63102', '63103', '63108', '63145'],
    landmarks: [
      "America's Center Convention Complex",
      'Busch Stadium & Ballpark Village',
      'Enterprise Center & St. Louis Union Station',
      'Gateway Arch, Four Seasons & Hilton at the Ballpark',
    ],
    pickupInstructions: [
      "America's Center & Downtown Hotels: Specify Washington Ave, Convention Plaza, or hotel valet entrance for immediate curbside boarding.",
      'Game-Day & Concert Departures (Busch Stadium / Enterprise Center): Chauffeurs coordinate one block clear of closed pedestrian perimeters for fast I-64 / I-70 exit.',
      'Direct Downtown ↔ Chesterfield Corporate Runs: Seamless 25-minute I-64 West connections to Chesterfield Valley and Spirit Airport (SUS).',
    ],
    faqs: [
      {
        question: 'How long is a taxi transfer from Downtown St. Louis to STL Lambert Airport?',
        answer:
          'Downtown St. Louis (63101 / 63102) to STL Lambert Airport is 14.2 miles up I-70 West and typically takes 18 to 22 minutes.',
      },
      {
        question: 'Do you charge surge rates after Cardinals games, Blues games, or Enterprise Center concerts?',
        answer:
          'Never. Pre-booked game-day and convention rides lock in standard upfront rates with zero post-event surge.',
      },
      {
        question: 'Can convention exhibitors book multi-stop or multi-vehicle transfers to STL Airport?',
        answer:
          'Yes. Add up to 5 intermediate hotel stops or coordinate multiple XL SUVs for trade-show teams and equipment.',
      },
    ],
  },
] as const;

export function getCorridorBySlug(slug?: string | null): LocalSeoCorridor | null {
  if (!slug || typeof slug !== 'string') return null;
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  return LOCAL_SEO_CORRIDORS.find((c) => c.slug === normalized) ?? null;
}

export function getRelatedCorridors(currentSlug: string, limit = 3): LocalSeoCorridor[] {
  const safeLimit = Math.max(1, Math.min(LOCAL_SEO_CORRIDORS.length - 1, Math.trunc(limit) || 3));
  const normalized = (currentSlug || '').trim().toLowerCase();
  const current = getCorridorBySlug(normalized);
  const others = LOCAL_SEO_CORRIDORS.filter((c) => c.slug !== normalized);

  if (!current) {
    return others.slice(0, safeLimit);
  }

  const sameCategory = others.filter((c) => c.category === current.category);
  const differentCategory = others.filter((c) => c.category !== current.category);
  return [...sameCategory, ...differentCategory].slice(0, safeLimit);
}

// ---------------------------------------------------------------------------
// 2. Instant Upfront Corridor Fare Estimator & `/book` Query Prefill Helpers
// ---------------------------------------------------------------------------

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isValidGeoPoint(point?: GeoPoint | null): point is GeoPoint {
  if (!point || typeof point !== 'object') return false;
  const { lat, lng } = point;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

function parseCoordinatePair(
  latRaw: string | null,
  lngRaw: string | null
): GeoPoint | undefined {
  if (latRaw === null || lngRaw === null) return undefined;
  const latTrimmed = latRaw.trim();
  const lngTrimmed = lngRaw.trim();
  if (!latTrimmed || !lngTrimmed) return undefined;

  const lat = Number(latTrimmed);
  const lng = Number(lngTrimmed);
  const candidate: GeoPoint = { lat, lng };
  return isValidGeoPoint(candidate) ? candidate : undefined;
}

export function buildPrepopulatedBookUrl(params: PrepopulatedBookUrlParams): string {
  const search = new URLSearchParams();

  const pickup = (params.pickupAddress || '').trim().slice(0, MAX_ADDRESS_QUERY_LENGTH);
  if (pickup) {
    search.set('pickup', pickup);
    if (isValidGeoPoint(params.pickupCoordinates)) {
      search.set('pickupLat', String(params.pickupCoordinates.lat));
      search.set('pickupLng', String(params.pickupCoordinates.lng));
    }
  }

  const dropoff = (params.dropoffAddress || '').trim().slice(0, MAX_ADDRESS_QUERY_LENGTH);
  if (dropoff) {
    search.set('dropoff', dropoff);
    if (isValidGeoPoint(params.dropoffCoordinates)) {
      search.set('dropoffLat', String(params.dropoffCoordinates.lat));
      search.set('dropoffLng', String(params.dropoffCoordinates.lng));
    }
  }

  if (params.vehicleChoice && VALID_BOOK_VEHICLE_CHOICES.has(params.vehicleChoice)) {
    search.set('vehicle', params.vehicleChoice);
  }

  if (typeof params.passengers === 'number' && Number.isFinite(params.passengers)) {
    const clampedPax = Math.min(14, Math.max(1, Math.round(params.passengers)));
    search.set('passengers', String(clampedPax));
  }

  if (params.timingType === 'asap' || params.timingType === 'later') {
    search.set('timing', params.timingType);
  }

  if (params.driverNotes && params.driverNotes.trim()) {
    search.set('notes', params.driverNotes.trim().slice(0, MAX_NOTES_QUERY_LENGTH));
  }

  const qs = search.toString();
  return qs ? `/book?${qs}` : '/book';
}

export function parseBookRouteQueryInitialValues(
  searchParamsInput: URLSearchParams | string
): BookingEngineV2InitialValues | undefined {
  const searchParams =
    typeof searchParamsInput === 'string'
      ? new URLSearchParams(searchParamsInput)
      : searchParamsInput;

  const initial: BookingEngineV2InitialValues = {};
  let hasAnyPrefill = false;

  const rawPickup = searchParams.get('pickup');
  if (rawPickup !== null) {
    const cleanPickup = rawPickup.trim().slice(0, MAX_ADDRESS_QUERY_LENGTH);
    if (cleanPickup) {
      initial.pickupAddress = cleanPickup;
      hasAnyPrefill = true;
    }
  }

  const pickupCoordinates = parseCoordinatePair(
    searchParams.get('pickupLat'),
    searchParams.get('pickupLng')
  );
  if (pickupCoordinates) {
    initial.pickupCoordinates = pickupCoordinates;
    hasAnyPrefill = true;
  }

  const rawDropoff = searchParams.get('dropoff');
  if (rawDropoff !== null) {
    const cleanDropoff = rawDropoff.trim().slice(0, MAX_ADDRESS_QUERY_LENGTH);
    if (cleanDropoff) {
      initial.dropoffAddress = cleanDropoff;
      hasAnyPrefill = true;
    }
  }

  const dropoffCoordinates = parseCoordinatePair(
    searchParams.get('dropoffLat'),
    searchParams.get('dropoffLng')
  );
  if (dropoffCoordinates) {
    initial.dropoffCoordinates = dropoffCoordinates;
    hasAnyPrefill = true;
  }

  const rawVehicle = searchParams.get('vehicle');
  if (rawVehicle !== null) {
    const normalizedVehicle = rawVehicle.trim().toLowerCase() as PrepopulatedBookVehicleChoice;
    if (VALID_BOOK_VEHICLE_CHOICES.has(normalizedVehicle)) {
      initial.vehicleChoice = normalizedVehicle;
      hasAnyPrefill = true;
    }
  }

  const rawPassengers = searchParams.get('passengers');
  if (rawPassengers !== null && rawPassengers.trim() !== '') {
    const parsedPax = Number(rawPassengers.trim());
    if (Number.isFinite(parsedPax) && parsedPax >= 1) {
      initial.passengers = Math.min(14, Math.max(1, Math.trunc(parsedPax)));
      hasAnyPrefill = true;
    }
  }

  const rawTiming = searchParams.get('timing');
  if (rawTiming !== null) {
    const normalizedTiming = rawTiming.trim().toLowerCase();
    if (normalizedTiming === 'asap' || normalizedTiming === 'later') {
      initial.timingType = normalizedTiming;
      hasAnyPrefill = true;
    }
  }

  const rawNotes = searchParams.get('notes');
  if (rawNotes !== null) {
    const cleanNotes = rawNotes.trim().slice(0, MAX_NOTES_QUERY_LENGTH);
    if (cleanNotes) {
      initial.driverNotes = cleanNotes;
      hasAnyPrefill = true;
    }
  }

  return hasAnyPrefill ? initial : undefined;
}

function findConfiguredVehicleTier(
  vehicles: ReadonlyArray<VehicleTierConfig> | undefined,
  kind: 'standard' | 'premium' | 'xl'
): VehicleTierConfig | undefined {
  if (!Array.isArray(vehicles) || vehicles.length === 0) return undefined;
  const active = vehicles.filter((v) => !v.isArchived);
  if (kind === 'standard') {
    return active.find(
      (v) => v.id === 'standard' || v.id === 'sedan' || v.iconType === 'standard'
    );
  }
  if (kind === 'premium') {
    return active.find(
      (v) => v.id === 'premium' || v.id === 'executive' || v.iconType === 'premium'
    );
  }
  return active.find(
    (v) => v.id === 'xl' || v.id === 'suv' || v.id === 'minivan' || v.iconType === 'xl'
  );
}

export function computeCorridorFareEstimates(
  params: ComputeCorridorFareParams
): CorridorFareEstimateSummary;
export function computeCorridorFareEstimates(
  corridor: LocalSeoCorridor,
  direction?: CorridorDirection,
  passengers?: number,
  settings?: Partial<AppSettings>
): CorridorFareEstimateSummary;
export function computeCorridorFareEstimates(
  corridorOrParams: LocalSeoCorridor | ComputeCorridorFareParams,
  directionArg: CorridorDirection = 'outbound',
  passengersArg = 1,
  settingsArg?: Partial<AppSettings>
): CorridorFareEstimateSummary {
  const isParamsObject = 'corridor' in corridorOrParams;
  const corridor = isParamsObject ? corridorOrParams.corridor : corridorOrParams;
  const direction: CorridorDirection =
    (isParamsObject ? corridorOrParams.direction : directionArg) === 'inbound'
      ? 'inbound'
      : 'outbound';
  const rawPax = isParamsObject ? corridorOrParams.passengers : passengersArg;
  const passengers =
    typeof rawPax === 'number' && Number.isFinite(rawPax)
      ? Math.min(6, Math.max(1, Math.round(rawPax)))
      : 1;
  const settings = isParamsObject ? corridorOrParams.settings : settingsArg;

  const pickup = direction === 'outbound' ? corridor.outboundOrigin : corridor.outboundDestination;
  const dropoff = direction === 'outbound' ? corridor.outboundDestination : corridor.outboundOrigin;

  const pricing = settings?.pricing;
  const baseFare =
    typeof pricing?.baseFare === 'number' && Number.isFinite(pricing.baseFare) && pricing.baseFare >= 0
      ? pricing.baseFare
      : 5.0;
  const perMileRate =
    typeof pricing?.perMileRate === 'number' &&
    Number.isFinite(pricing.perMileRate) &&
    pricing.perMileRate >= 0
      ? pricing.perMileRate
      : 2.25;
  const perMinuteRate =
    typeof pricing?.perMinuteRate === 'number' &&
    Number.isFinite(pricing.perMinuteRate) &&
    pricing.perMinuteRate >= 0
      ? pricing.perMinuteRate
      : 0.35;
  const minimumFare =
    typeof pricing?.minimumFare === 'number' &&
    Number.isFinite(pricing.minimumFare) &&
    pricing.minimumFare >= 0
      ? pricing.minimumFare
      : 10.0;
  const surgeMultiplier =
    typeof pricing?.surgeMultiplier === 'number' &&
    Number.isFinite(pricing.surgeMultiplier) &&
    pricing.surgeMultiplier > 0
      ? pricing.surgeMultiplier
      : 1.0;

  const configuredAirportFee =
    typeof pricing?.airportFee === 'number' &&
    Number.isFinite(pricing.airportFee) &&
    pricing.airportFee >= 0
      ? pricing.airportFee
      : 4.0;

  const airportDetection = detectAirportInAddresses(pickup.address, dropoff.address);
  const isAirportCorridor = airportDetection.isAirportTrip;
  const airportSurcharge = isAirportCorridor ? roundUsd(configuredAirportFee) : 0;

  const passengerAllowance =
    typeof pricing?.conditionSurcharges?.passengerBaseAllowance === 'number' &&
    pricing.conditionSurcharges.passengerBaseAllowance >= 1
      ? pricing.conditionSurcharges.passengerBaseAllowance
      : 2;
  const extraPassengerRate =
    typeof pricing?.conditionSurcharges?.extraPassengerFeePerHead === 'number' &&
    pricing.conditionSurcharges.extraPassengerFeePerHead >= 0
      ? pricing.conditionSurcharges.extraPassengerFeePerHead
      : 1.0;
  const extraPassengersFee =
    passengers > passengerAllowance
      ? roundUsd((passengers - passengerAllowance) * extraPassengerRate)
      : 0;

  const stdMatch = findConfiguredVehicleTier(settings?.vehicles, 'standard');
  const premMatch = findConfiguredVehicleTier(settings?.vehicles, 'premium');
  const xlMatch = findConfiguredVehicleTier(settings?.vehicles, 'xl');

  const stdMult =
    typeof stdMatch?.baseMultiplier === 'number' && stdMatch.baseMultiplier > 0
      ? stdMatch.baseMultiplier
      : 1.0;
  const premMult = Math.max(
    stdMult,
    typeof premMatch?.baseMultiplier === 'number' && premMatch.baseMultiplier > 0
      ? premMatch.baseMultiplier
      : 1.5
  );
  const xlMult = Math.max(
    stdMult,
    typeof xlMatch?.baseMultiplier === 'number' && xlMatch.baseMultiplier > 0
      ? xlMatch.baseMultiplier
      : 1.75
  );

  const tierDefinitions: Array<{
    tierId: 'standard' | 'premium' | 'xl';
    label: string;
    shortLabel: string;
    description: string;
    badge?: string;
    bookVehicleChoice: PrepopulatedBookVehicleChoice;
    maxPassengers: number;
    maxLuggage: number;
    multiplier: number;
  }> = [
    {
      tierId: 'standard',
      label: 'Standard Sedan (Up to 4 Pax)',
      shortLabel: 'Sedan',
      description:
        stdMatch?.description || 'Clean full-size hybrid or executive sedan for 1–4 riders.',
      badge: stdMatch?.badge || 'Most Popular',
      bookVehicleChoice: 'sedan',
      maxPassengers: stdMatch?.maxPassengers || 4,
      maxLuggage: stdMatch?.maxLuggage || 3,
      multiplier: stdMult,
    },
    {
      tierId: 'premium',
      label: 'Executive / Premium',
      shortLabel: 'Executive',
      description:
        premMatch?.description ||
        'Quiet executive cabin ideal for corporate travel and VIP FBO pickups.',
      badge: premMatch?.badge || 'Business Class',
      bookVehicleChoice: 'sedan',
      maxPassengers: premMatch?.maxPassengers || 4,
      maxLuggage: premMatch?.maxLuggage || 3,
      multiplier: premMult,
    },
    {
      tierId: 'xl',
      label: 'XL SUV / Minivan (Up to 6 Pax)',
      shortLabel: 'XL SUV / Minivan',
      description:
        xlMatch?.description ||
        'Spacious Suburban / Sienna cargo capacity for families, groups & golf bags.',
      badge: xlMatch?.badge || 'Group & Luggage',
      bookVehicleChoice: 'suv',
      maxPassengers: Math.max(6, xlMatch?.maxPassengers || 6),
      maxLuggage: Math.max(5, xlMatch?.maxLuggage || 5),
      multiplier: xlMult,
    },
  ];

  const rawMeterBase =
    baseFare +
    corridor.distanceMiles * perMileRate +
    corridor.typicalDurationMinutes * perMinuteRate;

  const tiers: CorridorVehicleFareEstimate[] = tierDefinitions.map((def) => {
    const scaledRoute = Math.max(
      minimumFare * def.multiplier,
      rawMeterBase * def.multiplier * surgeMultiplier
    );
    const baseAndDistanceSubtotal = roundUsd(scaledRoute);
    const estimatedFare = roundUsd(
      baseAndDistanceSubtotal + airportSurcharge + extraPassengersFee
    );
    const fitsPassengers = passengers <= def.maxPassengers;
    const bookUrl = buildPrepopulatedBookUrl({
      pickupAddress: pickup.address,
      pickupCoordinates: pickup.coordinates,
      dropoffAddress: dropoff.address,
      dropoffCoordinates: dropoff.coordinates,
      vehicleChoice: def.bookVehicleChoice,
      passengers,
      timingType: 'later',
    });

    return {
      tierId: def.tierId,
      label: def.label,
      shortLabel: def.shortLabel,
      description: def.description,
      badge: def.badge,
      bookVehicleChoice: def.bookVehicleChoice,
      maxPassengers: def.maxPassengers,
      maxLuggage: def.maxLuggage,
      fitsPassengers,
      multiplier: def.multiplier,
      baseAndDistanceSubtotal,
      airportSurcharge,
      extraPassengersFee,
      estimatedFare,
      estimatedFareWholeDollars: Math.round(estimatedFare),
      bookUrl,
    };
  });

  const capableTiers = tiers.filter((t) => t.fitsPassengers);
  const startingFare =
    capableTiers.length > 0
      ? Math.min(...capableTiers.map((t) => t.estimatedFare))
      : Math.min(...tiers.map((t) => t.estimatedFare));

  const recommendedTierId: 'standard' | 'premium' | 'xl' =
    capableTiers[0]?.tierId ?? 'xl';

  return {
    corridorSlug: corridor.slug,
    direction,
    passengers,
    pickup,
    dropoff,
    distanceMiles: corridor.distanceMiles,
    typicalDurationMinutes: corridor.typicalDurationMinutes,
    isAirportCorridor,
    airportCode: airportDetection.airport?.iataCode,
    airportSurcharge,
    startingFare,
    recommendedTierId,
    tiers,
  };
}

// ---------------------------------------------------------------------------
// 3. JSON-LD Structured Data & Safe Script Serialization
// ---------------------------------------------------------------------------

/**
 * Serializes structured data into a JSON string safe for embedding inside
 * `<script type="application/ld+json">`, escaping `<`, `>`, `&`, and Unicode
 * line separators so `</script>` breakout / XSS is impossible.
 */
export function serializeJsonLdScriptPayload(data: unknown): string {
  const raw = JSON.stringify(data) ?? 'null';
  return raw
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function buildTaxiServiceJsonLd(
  params: BuildTaxiServiceJsonLdParams
): Record<string, unknown> {
  const cleanOrigin = stripTrailingSlash(params.origin || DEFAULT_CANONICAL_SITE_ORIGIN);
  const companyName = params.company?.name?.trim() || COMPANY_CONFIG.name;
  const telephone = params.company?.phone?.trim() || COMPANY_CONFIG.phone.dispatch;
  const email = params.company?.email?.trim() || COMPANY_CONFIG.email.dispatch;
  const corridor = params.corridor;

  const pageUrl = corridor
    ? `${cleanOrigin}/service-areas/${corridor.slug}`
    : `${cleanOrigin}/service-areas`;

  const estimates =
    params.estimates ??
    (corridor
      ? computeCorridorFareEstimates({ corridor, direction: 'outbound', passengers: 1 })
      : undefined);

  let priceRange = '$$';
  if (estimates && estimates.tiers.length > 0) {
    const fares = estimates.tiers.map((t) => t.estimatedFareWholeDollars);
    const minPrice = Math.min(...fares);
    const maxPrice = Math.max(...fares);
    priceRange = minPrice === maxPrice ? `$${minPrice}` : `$${minPrice} - $${maxPrice}`;
  }

  const reserveBookPath = corridor
    ? buildPrepopulatedBookUrl({
        pickupAddress: corridor.outboundOrigin.address,
        pickupCoordinates: corridor.outboundOrigin.coordinates,
        dropoffAddress: corridor.outboundDestination.address,
        dropoffCoordinates: corridor.outboundDestination.coordinates,
        vehicleChoice: 'sedan',
        passengers: 1,
        timingType: 'later',
      })
    : '/book?timing=later';

  const reserveTargetUrl = `${cleanOrigin}${reserveBookPath}`;

  const areaServed = corridor
    ? [
        { '@type': 'Place', name: corridor.outboundOrigin.label },
        { '@type': 'Place', name: corridor.outboundDestination.label },
        ...corridor.zipCodes.map((zip) => ({
          '@type': 'PostalAddress',
          postalCode: zip,
          addressRegion: 'MO',
          addressCountry: 'US',
        })),
      ]
    : COMPANY_CONFIG.serviceAreas.map((area) => ({
        '@type': 'Place',
        name: area,
      }));

  return {
    '@context': 'https://schema.org',
    '@type': ['TaxiService', 'LocalBusiness'],
    name: corridor ? `${companyName} — ${corridor.shortTitle}` : companyName,
    description: corridor
      ? corridor.metaDescription
      : '24/7 licensed Chesterfield & St. Louis airport taxi, private FBO car service, and corporate transportation.',
    url: pageUrl,
    telephone,
    email,
    priceRange,
    address: {
      '@type': 'PostalAddress',
      streetAddress: COMPANY_CONFIG.address.street,
      addressLocality: COMPANY_CONFIG.address.city,
      addressRegion: COMPANY_CONFIG.address.state,
      postalCode: COMPANY_CONFIG.address.zip,
      addressCountry: 'US',
    },
    areaServed,
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ],
        opens: '00:00',
        closes: '23:59',
      },
    ],
    potentialAction: {
      '@type': 'ReserveAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: reserveTargetUrl,
        actionPlatform: [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform',
        ],
      },
      result: {
        '@type': 'TaxiReservation',
        name: corridor ? `Book ${corridor.shortTitle}` : `Book ${companyName}`,
      },
    },
  };
}

export function buildFaqPageJsonLd(faqs: ReadonlyArray<LocalSeoFaqItem>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function buildBreadcrumbListJsonLd(
  items: ReadonlyArray<BreadcrumbJsonLdInput>
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ---------------------------------------------------------------------------
// 4. Dynamic `/robots.txt` & `/sitemap.xml` Builders
// ---------------------------------------------------------------------------

function isLocalOrPreviewHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower === '[::1]' ||
    lower.endsWith('.local') ||
    lower.endsWith('.vercel.app')
  );
}

export function resolveCanonicalSiteOrigin(request?: Request): string {
  const envUrl =
    typeof process !== 'undefined' && process?.env?.PUBLIC_SITE_URL
      ? process.env.PUBLIC_SITE_URL.trim()
      : '';

  if (envUrl) {
    try {
      const parsedEnv = new URL(envUrl);
      if (parsedEnv.protocol === 'http:' || parsedEnv.protocol === 'https:') {
        return stripTrailingSlash(parsedEnv.origin);
      }
    } catch {
      if (/^https?:\/\//i.test(envUrl)) {
        return stripTrailingSlash(envUrl);
      }
    }
  }

  if (request) {
    try {
      const reqUrl = new URL(request.url);
      if (reqUrl.hostname && !isLocalOrPreviewHostname(reqUrl.hostname)) {
        const forwardedProto = request.headers?.get('x-forwarded-proto')?.split(',')[0]?.trim();
        const protocol =
          forwardedProto === 'https' || reqUrl.protocol === 'https:' ? 'https:' : reqUrl.protocol;
        return stripTrailingSlash(`${protocol}//${reqUrl.host}`);
      }
    } catch {
      // Fall back to canonical default origin
    }
  }

  return DEFAULT_CANONICAL_SITE_ORIGIN;
}

export function generateRobotsTxt(origin: string): string {
  const cleanOrigin = stripTrailingSlash(origin || DEFAULT_CANONICAL_SITE_ORIGIN);
  const lines = [
    'User-agent: *',
    'Allow: /',
    'Allow: /book',
    'Allow: /track',
    'Allow: /services',
    'Allow: /service-areas',
    'Allow: /about',
    'Allow: /contact',
    'Allow: /apply',
    'Allow: /terms',
    'Allow: /privacy',
    '',
    '# Disallow internal operational consoles, auth surfaces, APIs, and private links',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /dispatch',
    'Disallow: /dispatch/',
    'Disallow: /driver',
    'Disallow: /corporate',
    'Disallow: /app',
    'Disallow: /app/',
    'Disallow: /pay/',
    'Disallow: /booking/status',
    'Disallow: /booking/status/',
    'Disallow: /api/',
    'Disallow: /construction',
    'Disallow: /signin',
    'Disallow: /register',
    '',
    `Sitemap: ${cleanOrigin}/sitemap.xml`,
    '',
  ];
  return lines.join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface SitemapRouteEntry {
  path: string;
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: string;
}

const CORE_PUBLIC_SITEMAP_ROUTES: readonly SitemapRouteEntry[] = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/book', changefreq: 'weekly', priority: '0.9' },
  { path: '/service-areas', changefreq: 'weekly', priority: '0.9' },
  { path: '/services', changefreq: 'monthly', priority: '0.8' },
  { path: '/track', changefreq: 'weekly', priority: '0.8' },
  { path: '/about', changefreq: 'monthly', priority: '0.7' },
  { path: '/contact', changefreq: 'monthly', priority: '0.7' },
  { path: '/apply', changefreq: 'monthly', priority: '0.6' },
  { path: '/terms', changefreq: 'yearly', priority: '0.4' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.4' },
] as const;

export function generateSitemapXml(params: { origin: string; lastmodDate?: string }): string {
  const cleanOrigin = stripTrailingSlash(params.origin || DEFAULT_CANONICAL_SITE_ORIGIN);
  const fallbackIsoDate = new Date().toISOString().slice(0, 10);
  const lastmod =
    params.lastmodDate && /^\d{4}-\d{2}-\d{2}$/.test(params.lastmodDate.trim())
      ? params.lastmodDate.trim()
      : fallbackIsoDate;

  const corridorEntries: SitemapRouteEntry[] = LOCAL_SEO_CORRIDORS.map((corridor) => ({
    path: `/service-areas/${corridor.slug}`,
    changefreq: 'weekly',
    priority: '0.85',
  }));

  const allEntries: SitemapRouteEntry[] = [...CORE_PUBLIC_SITEMAP_ROUTES, ...corridorEntries];

  const urlBlocks = allEntries.map((entry) => {
    const fullUrl = entry.path === '/' ? `${cleanOrigin}/` : `${cleanOrigin}${entry.path}`;
    return [
      '  <url>',
      `    <loc>${escapeXml(fullUrl)}</loc>`,
      `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
      `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`,
      `    <priority>${escapeXml(entry.priority)}</priority>`,
      '  </url>',
    ].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlBlocks,
    '</urlset>',
    '',
  ].join('\n');
}
