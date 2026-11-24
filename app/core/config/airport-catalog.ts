/**
 * Global Commercial & Private Aviation Airport Catalog (`airport-catalog.ts`)
 *
 * Pure searchable catalog of major US, Canadian, Mexican, Caribbean, International,
 * and private FBO airports, formatted uniformly as `"IATA City"` (e.g. `"YYZ Toronto"`).
 */

export interface AirportCatalogEntry {
  iata: string;
  icao: string;
  city: string;
  name: string;
  country: string;
  isPrivateFbo?: boolean;
}

export const MAJOR_AIRPORTS: readonly AirportCatalogEntry[] = [
  // St. Louis Regional & FBOs
  { iata: 'STL', icao: 'KSTL', city: 'St. Louis', name: 'Lambert-St. Louis International', country: 'US' },
  { iata: 'SUS', icao: 'KSUS', city: 'Chesterfield', name: 'Spirit of St. Louis Airport (FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'CPS', icao: 'KCPS', city: 'Cahokia', name: 'St. Louis Downtown Airport (FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'BLV', icao: 'KBLV', city: 'Belleville', name: 'MidAmerica St. Louis Airport', country: 'US' },
  { iata: 'ALN', icao: 'KALN', city: 'Alton', name: 'St. Louis Regional Airport (FBO)', country: 'US', isPrivateFbo: true },

  // Major US Commercial Hubs
  { iata: 'ORD', icao: 'KORD', city: 'Chicago', name: "O'Hare International Airport", country: 'US' },
  { iata: 'MDW', icao: 'KMDW', city: 'Chicago', name: 'Midway International Airport', country: 'US' },
  { iata: 'ATL', icao: 'KATL', city: 'Atlanta', name: 'Hartsfield-Jackson International', country: 'US' },
  { iata: 'DFW', icao: 'KDFW', city: 'Dallas', name: 'Dallas/Fort Worth International', country: 'US' },
  { iata: 'DAL', icao: 'KDAL', city: 'Dallas', name: 'Dallas Love Field', country: 'US', isPrivateFbo: true },
  { iata: 'DEN', icao: 'KDEN', city: 'Denver', name: 'Denver International Airport', country: 'US' },
  { iata: 'LAX', icao: 'KLAX', city: 'Los Angeles', name: 'Los Angeles International Airport', country: 'US' },
  { iata: 'JFK', icao: 'KJFK', city: 'New York', name: 'John F. Kennedy International', country: 'US' },
  { iata: 'LGA', icao: 'KLGA', city: 'New York', name: 'LaGuardia Airport', country: 'US' },
  { iata: 'EWR', icao: 'KEWR', city: 'Newark', name: 'Newark Liberty International', country: 'US' },
  { iata: 'SFO', icao: 'KSFO', city: 'San Francisco', name: 'San Francisco International', country: 'US' },
  { iata: 'SEA', icao: 'KSEA', city: 'Seattle', name: 'Seattle-Tacoma International', country: 'US' },
  { iata: 'LAS', icao: 'KLAS', city: 'Las Vegas', name: 'Harry Reid International Airport', country: 'US' },
  { iata: 'PHX', icao: 'KPHX', city: 'Phoenix', name: 'Phoenix Sky Harbor International', country: 'US' },
  { iata: 'MIA', icao: 'KMIA', city: 'Miami', name: 'Miami International Airport', country: 'US' },
  { iata: 'FLL', icao: 'KFLL', city: 'Fort Lauderdale', name: 'Fort Lauderdale-Hollywood Intl', country: 'US' },
  { iata: 'MCO', icao: 'KMCO', city: 'Orlando', name: 'Orlando International Airport', country: 'US' },
  { iata: 'TPA', icao: 'KTPA', city: 'Tampa', name: 'Tampa International Airport', country: 'US' },
  { iata: 'BOS', icao: 'KBOS', city: 'Boston', name: 'Logan International Airport', country: 'US' },
  { iata: 'DCA', icao: 'KDCA', city: 'Washington', name: 'Ronald Reagan Washington National', country: 'US' },
  { iata: 'IAD', icao: 'KIAD', city: 'Washington', name: 'Washington Dulles International', country: 'US' },
  { iata: 'BWI', icao: 'KBWI', city: 'Baltimore', name: 'Baltimore/Washington International', country: 'US' },
  { iata: 'CLT', icao: 'KCLT', city: 'Charlotte', name: 'Charlotte Douglas International', country: 'US' },
  { iata: 'DTW', icao: 'KDTW', city: 'Detroit', name: 'Detroit Metropolitan Airport', country: 'US' },
  { iata: 'MSP', icao: 'KMSP', city: 'Minneapolis', name: 'Minneapolis-St. Paul International', country: 'US' },
  { iata: 'PHL', icao: 'KPHL', city: 'Philadelphia', name: 'Philadelphia International Airport', country: 'US' },
  { iata: 'IAH', icao: 'KIAH', city: 'Houston', name: 'George Bush Intercontinental', country: 'US' },
  { iata: 'HOU', icao: 'KHOU', city: 'Houston', name: 'William P. Hobby Airport', country: 'US', isPrivateFbo: true },
  { iata: 'BNA', icao: 'KBNA', city: 'Nashville', name: 'Nashville International Airport', country: 'US' },
  { iata: 'AUS', icao: 'KAUS', city: 'Austin', name: 'Austin-Bergstrom International', country: 'US' },
  { iata: 'SAN', icao: 'KSAN', city: 'San Diego', name: 'San Diego International Airport', country: 'US' },
  { iata: 'SLC', icao: 'KSLC', city: 'Salt Lake City', name: 'Salt Lake City International', country: 'US' },
  { iata: 'PDX', icao: 'KPDX', city: 'Portland', name: 'Portland International Airport', country: 'US' },
  { iata: 'MCI', icao: 'KMCI', city: 'Kansas City', name: 'Kansas City International Airport', country: 'US' },
  { iata: 'IND', icao: 'KIND', city: 'Indianapolis', name: 'Indianapolis International Airport', country: 'US' },
  { iata: 'CMH', icao: 'KCMH', city: 'Columbus', name: 'John Glenn Columbus International', country: 'US' },
  { iata: 'CVG', icao: 'KCVG', city: 'Cincinnati', name: 'Cincinnati/Northern Kentucky Intl', country: 'US' },
  { iata: 'CLE', icao: 'KCLE', city: 'Cleveland', name: 'Cleveland Hopkins International', country: 'US' },
  { iata: 'PIT', icao: 'KPIT', city: 'Pittsburgh', name: 'Pittsburgh International Airport', country: 'US' },
  { iata: 'MKE', icao: 'KMKE', city: 'Milwaukee', name: 'Mitchell International Airport', country: 'US' },
  { iata: 'MEM', icao: 'KMEM', city: 'Memphis', name: 'Memphis International Airport', country: 'US' },
  { iata: 'MSY', icao: 'KMSY', city: 'New Orleans', name: 'Louis Armstrong New Orleans Intl', country: 'US' },
  { iata: 'RDU', icao: 'KRDU', city: 'Raleigh', name: 'Raleigh-Durham International', country: 'US' },
  { iata: 'RSW', icao: 'KRSW', city: 'Fort Myers', name: 'Southwest Florida International', country: 'US' },
  { iata: 'PBI', icao: 'KPBI', city: 'West Palm Beach', name: 'Palm Beach International Airport', country: 'US', isPrivateFbo: true },
  { iata: 'SAT', icao: 'KSAT', city: 'San Antonio', name: 'San Antonio International Airport', country: 'US' },
  { iata: 'OAK', icao: 'KOAK', city: 'Oakland', name: 'San Francisco Bay Oakland Intl', country: 'US' },
  { iata: 'SJC', icao: 'KSJC', city: 'San Jose', name: 'San Jose Mineta International', country: 'US' },
  { iata: 'SMF', icao: 'KSMF', city: 'Sacramento', name: 'Sacramento International Airport', country: 'US' },
  { iata: 'SNA', icao: 'KSNA', city: 'Santa Ana', name: 'John Wayne Orange County Airport', country: 'US' },
  { iata: 'BUR', icao: 'KBUR', city: 'Burbank', name: 'Hollywood Burbank Airport', country: 'US' },
  { iata: 'OMA', icao: 'KOMA', city: 'Omaha', name: 'Eppley Airfield', country: 'US' },
  { iata: 'DSM', icao: 'KDSM', city: 'Des Moines', name: 'Des Moines International Airport', country: 'US' },
  { iata: 'OKC', icao: 'KOKC', city: 'Oklahoma City', name: 'Will Rogers World Airport', country: 'US' },
  { iata: 'TUL', icao: 'KTUL', city: 'Tulsa', name: 'Tulsa International Airport', country: 'US' },
  { iata: 'SDF', icao: 'KSDF', city: 'Louisville', name: 'Louisville Muhammad Ali Intl', country: 'US' },
  { iata: 'JAX', icao: 'KJAX', city: 'Jacksonville', name: 'Jacksonville International Airport', country: 'US' },
  { iata: 'CHS', icao: 'KCHS', city: 'Charleston', name: 'Charleston International Airport', country: 'US' },
  { iata: 'SAV', icao: 'KSAV', city: 'Savannah', name: 'Savannah/Hilton Head International', country: 'US' },
  { iata: 'BUF', icao: 'KBUF', city: 'Buffalo', name: 'Buffalo Niagara International', country: 'US' },
  { iata: 'BDL', icao: 'KBDL', city: 'Hartford', name: 'Bradley International Airport', country: 'US' },
  { iata: 'ABQ', icao: 'KABQ', city: 'Albuquerque', name: 'Albuquerque International Sunport', country: 'US' },
  { iata: 'HNL', icao: 'PHNL', city: 'Honolulu', name: 'Daniel K. Inouye International', country: 'US' },
  { iata: 'ANC', icao: 'PANC', city: 'Anchorage', name: 'Ted Stevens Anchorage International', country: 'US' },

  // Dedicated Private Aviation & Executive FBO Fields
  { iata: 'TEB', icao: 'KTEB', city: 'Teterboro', name: 'Teterboro Airport (NY Private FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'VNY', icao: 'KVNY', city: 'Van Nuys', name: 'Van Nuys Airport (LA Private FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'HPN', icao: 'KHPN', city: 'White Plains', name: 'Westchester County Airport (FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'PWK', icao: 'KPWK', city: 'Chicago Wheeling', name: 'Chicago Executive Airport (FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'APA', icao: 'KAPA', city: 'Centennial', name: 'Centennial Airport (Denver FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'OPF', icao: 'KOPF', city: 'Miami', name: 'Miami-Opa Locka Executive (FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'SDL', icao: 'KSDL', city: 'Scottsdale', name: 'Scottsdale Airport (Private FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'ASE', icao: 'KASE', city: 'Aspen', name: 'Aspen/Pitkin County Airport (FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'FXE', icao: 'KFXE', city: 'Fort Lauderdale', name: 'Fort Lauderdale Executive (FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'PDK', icao: 'KPDK', city: 'Atlanta', name: 'DeKalb-Peachtree Airport (FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'ADS', icao: 'KADS', city: 'Addison', name: 'Addison Airport (Dallas FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'BED', icao: 'KBED', city: 'Bedford', name: 'Hanscom Field (Boston Private FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'BFI', icao: 'KBFI', city: 'Seattle', name: 'Boeing Field / King County Intl (FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'LUK', icao: 'KLUK', city: 'Cincinnati', name: 'Cincinnati Municipal Lunken (FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'JAC', icao: 'KJAC', city: 'Jackson Hole', name: 'Jackson Hole Airport (FBO)', country: 'US', isPrivateFbo: true },

  // Canada
  { iata: 'YYZ', icao: 'CYYZ', city: 'Toronto', name: 'Toronto Pearson International', country: 'CA' },
  { iata: 'YVR', icao: 'CYVR', city: 'Vancouver', name: 'Vancouver International Airport', country: 'CA' },
  { iata: 'YUL', icao: 'CYUL', city: 'Montreal', name: 'Montreal-Trudeau International', country: 'CA' },
  { iata: 'YYC', icao: 'CYYC', city: 'Calgary', name: 'Calgary International Airport', country: 'CA' },
  { iata: 'YOW', icao: 'CYOW', city: 'Ottawa', name: 'Ottawa Macdonald-Cartier Intl', country: 'CA' },
  { iata: 'YEG', icao: 'CYEG', city: 'Edmonton', name: 'Edmonton International Airport', country: 'CA' },

  // Mexico & Caribbean
  { iata: 'SJU', icao: 'TJSJ', city: 'San Juan', name: 'Luis Munoz Marin International', country: 'PR' },
  { iata: 'CUN', icao: 'MMUN', city: 'Cancun', name: 'Cancun International Airport', country: 'MX' },
  { iata: 'MEX', icao: 'MMMX', city: 'Mexico City', name: 'Benito Juarez International', country: 'MX' },
  { iata: 'SJD', icao: 'MMSD', city: 'Los Cabos', name: 'Los Cabos International Airport', country: 'MX' },
  { iata: 'PVR', icao: 'MMPR', city: 'Puerto Vallarta', name: 'Gustavo Diaz Ordaz International', country: 'MX' },
  { iata: 'NAS', icao: 'MYNN', city: 'Nassau', name: 'Lynden Pindling International', country: 'BS' },
  { iata: 'MBJ', icao: 'MKJS', city: 'Montego Bay', name: 'Sangster International Airport', country: 'JM' },
  { iata: 'PUJ', icao: 'MDPC', city: 'Punta Cana', name: 'Punta Cana International Airport', country: 'DO' },

  // Europe, Asia & Middle East Hubs
  { iata: 'LHR', icao: 'EGLL', city: 'London', name: 'London Heathrow Airport', country: 'GB' },
  { iata: 'LGW', icao: 'EGKK', city: 'London', name: 'London Gatwick Airport', country: 'GB' },
  { iata: 'CDG', icao: 'LFPG', city: 'Paris', name: 'Charles de Gaulle Airport', country: 'FR' },
  { iata: 'FRA', icao: 'EDDF', city: 'Frankfurt', name: 'Frankfurt Airport', country: 'DE' },
  { iata: 'MUC', icao: 'EDDM', city: 'Munich', name: 'Munich Airport', country: 'DE' },
  { iata: 'AMS', icao: 'EHAM', city: 'Amsterdam', name: 'Amsterdam Airport Schiphol', country: 'NL' },
  { iata: 'MAD', icao: 'LEMD', city: 'Madrid', name: 'Adolfo Suarez Madrid-Barajas', country: 'ES' },
  { iata: 'FCO', icao: 'LIRF', city: 'Rome', name: 'Leonardo da Vinci-Fiumicino', country: 'IT' },
  { iata: 'ZRH', icao: 'LSZH', city: 'Zurich', name: 'Zurich Airport', country: 'CH' },
  { iata: 'DUB', icao: 'EIDW', city: 'Dublin', name: 'Dublin Airport', country: 'IE' },
  { iata: 'DXB', icao: 'OMDB', city: 'Dubai', name: 'Dubai International Airport', country: 'AE' },
  { iata: 'DOH', icao: 'OTHH', city: 'Doha', name: 'Hamad International Airport', country: 'QA' },
  { iata: 'NRT', icao: 'RJAA', city: 'Tokyo', name: 'Narita International Airport', country: 'JP' },
  { iata: 'HND', icao: 'RJTT', city: 'Tokyo', name: 'Tokyo Haneda Airport', country: 'JP' },
  { iata: 'ICN', icao: 'RKSI', city: 'Seoul', name: 'Incheon International Airport', country: 'KR' },
  { iata: 'SIN', icao: 'WSSS', city: 'Singapore', name: 'Singapore Changi Airport', country: 'SG' },
  { iata: 'GRU', icao: 'SBGR', city: 'Sao Paulo', name: 'Sao Paulo/Guarulhos International', country: 'BR' },
] as const;

const BY_IATA = new Map<string, AirportCatalogEntry>(
  MAJOR_AIRPORTS.map((entry) => [entry.iata.toUpperCase(), entry])
);
const BY_ICAO = new Map<string, AirportCatalogEntry>(
  MAJOR_AIRPORTS.map((entry) => [entry.icao.toUpperCase(), entry])
);

function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/['’.]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Formats a catalog entry into canonical `"IATA City"` display text (e.g. `"YYZ Toronto"`).
 */
export function formatAirportCodeCity(entry: Pick<AirportCatalogEntry, 'iata' | 'city'>): string {
  return `${entry.iata.trim().toUpperCase()} ${entry.city.trim()}`;
}

/**
 * Extracts a clean 3–4 character IATA/ICAO code from `"YYZ Toronto"`, `"Toronto (YYZ)"`,
 * `"CYYZ"`, or `"yyz"` -> `"YYZ"`.
 */
export function extractAirportIataCode(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const upper = raw.toUpperCase();
  const byIcaoExact = BY_ICAO.get(upper);
  if (byIcaoExact) return byIcaoExact.iata;
  if (BY_IATA.has(upper)) return upper;

  const leadingThree = raw.match(/^([A-Za-z]{3})(?:[\s\-–—·,(/]|$)/);
  if (leadingThree) {
    return leadingThree[1].toUpperCase();
  }

  const leadingFour = raw.match(/^([A-Za-z0-9]{3,4})(?:[\s\-–—·,(/]|$)/);
  if (leadingFour) {
    const code4 = leadingFour[1].toUpperCase();
    const mapped = BY_ICAO.get(code4);
    return mapped ? mapped.iata : code4;
  }

  const parenMatch = raw.match(/\(([A-Za-z0-9]{3,4})\)/);
  if (parenMatch) {
    const code = parenMatch[1].toUpperCase();
    return BY_ICAO.get(code)?.iata || code;
  }

  const norm = normalizeSearchToken(raw);
  const exactCity = MAJOR_AIRPORTS.find((a) => normalizeSearchToken(a.city) === norm);
  if (exactCity) return exactCity.iata;

  return upper.slice(0, 4).replace(/[^A-Z0-9]/g, '');
}

/**
 * Resolves a stored code or display label (`"YYZ"` or `"YYZ Toronto"`) to `"YYZ Toronto"`
 * when known in `MAJOR_AIRPORTS`, or preserves custom regional codes.
 */
export function resolveAirportDisplayValue(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const code = extractAirportIataCode(raw);
  const entry = code ? BY_IATA.get(code) : undefined;
  return entry ? formatAirportCodeCity(entry) : raw.toUpperCase();
}

/**
 * Searches `MAJOR_AIRPORTS` ranking:
 * 1. Exact IATA/ICAO code match
 * 2. IATA/ICAO code prefix match
 * 3. City prefix, then city substring match
 * 4. Airport name prefix, then airport name substring match
 */
export function searchAirportCatalog(
  query: string,
  limit = 25,
  options?: { preferPrivateFbo?: boolean }
): AirportCatalogEntry[] {
  const cap = Math.max(1, limit);
  const rawQ = String(query || '').trim();
  if (!rawQ) {
    if (options?.preferPrivateFbo) {
      const fbos = MAJOR_AIRPORTS.filter((a) => a.isPrivateFbo);
      const rest = MAJOR_AIRPORTS.filter((a) => !a.isPrivateFbo);
      return [...fbos, ...rest].slice(0, cap);
    }
    return MAJOR_AIRPORTS.slice(0, cap);
  }

  const qNorm = normalizeSearchToken(rawQ);
  const qCode = qNorm.split(' ')[0] || qNorm;

  const scored: Array<{ entry: AirportCatalogEntry; rank: number; index: number }> = [];
  MAJOR_AIRPORTS.forEach((entry, index) => {
    const iata = entry.iata.toLowerCase();
    const icao = entry.icao.toLowerCase();
    const city = normalizeSearchToken(entry.city);
    const name = normalizeSearchToken(entry.name);
    const formatted = normalizeSearchToken(formatAirportCodeCity(entry));

    let rank = 999;
    if (iata === qNorm || icao === qNorm || formatted === qNorm) {
      rank = 1;
    } else if (iata.startsWith(qNorm) || icao.startsWith(qNorm)) {
      rank = 2;
    } else if (formatted.startsWith(qNorm) || (qCode.length === 3 && iata === qCode)) {
      rank = 3;
    } else if (city === qNorm) {
      rank = 4;
    } else if (city.startsWith(qNorm)) {
      rank = 5;
    } else if (city.includes(qNorm)) {
      rank = 6;
    } else if (name.startsWith(qNorm)) {
      rank = 7;
    } else if (name.includes(qNorm)) {
      rank = 8;
    }

    if (rank < 999) {
      if (options?.preferPrivateFbo && entry.isPrivateFbo) {
        rank -= 0.25;
      }
      scored.push({ entry, rank, index });
    }
  });

  scored.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return scored.slice(0, cap).map((s) => s.entry);
}
