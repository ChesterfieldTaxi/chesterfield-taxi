/**
 * Global & STL-Connected Commercial + Private Aviation Airport Catalog (`airport-catalog.ts`)
 *
 * Pure searchable catalog of >= 145 STL nonstop/direct/seasonal commercial, Midwest regional
 * Cape Air, Canadian, Mexican/Caribbean leisure, European, and private FBO airports (`"IATA City"`).
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

  // Midwest Regional & Cape Air / Southern Airways STL Connections
  { iata: 'DEC', icao: 'KDEC', city: 'Decatur', name: 'Decatur Airport (STL Cape Air)', country: 'US' },
  { iata: 'SPI', icao: 'KSPI', city: 'Springfield IL', name: 'Abraham Lincoln Capital Airport', country: 'US' },
  { iata: 'CGI', icao: 'KCGI', city: 'Cape Girardeau', name: 'Cape Girardeau Regional Airport', country: 'US' },
  { iata: 'UIN', icao: 'KUIN', city: 'Quincy', name: 'Quincy Regional Airport (Baldwin Field)', country: 'US' },
  { iata: 'MWA', icao: 'KMWA', city: 'Marion', name: 'Veterans Airport of Southern Illinois', country: 'US' },
  { iata: 'OWB', icao: 'KOWB', city: 'Owensboro', name: 'Owensboro-Daviess County Regional', country: 'US' },
  { iata: 'FOD', icao: 'KFOD', city: 'Fort Dodge', name: 'Fort Dodge Regional Airport', country: 'US' },
  { iata: 'BRL', icao: 'KBRL', city: 'Burlington', name: 'Southeast Iowa Regional Airport', country: 'US' },
  { iata: 'TBN', icao: 'KTBN', city: 'Fort Leonard Wood', name: 'Waynesville-St. Robert Regional', country: 'US' },
  { iata: 'COU', icao: 'KCOU', city: 'Columbia', name: 'Columbia Regional Airport', country: 'US' },
  { iata: 'SGF', icao: 'KSGF', city: 'Springfield MO', name: 'Springfield-Branson National', country: 'US' },
  { iata: 'JLN', icao: 'KJLN', city: 'Joplin', name: 'Joplin Regional Airport', country: 'US' },
  { iata: 'IRK', icao: 'KIRK', city: 'Kirksville', name: 'Kirksville Regional Airport', country: 'US' },
  { iata: 'LAF', icao: 'KLAF', city: 'West Lafayette', name: 'Purdue University Airport', country: 'US' },
  { iata: 'CMI', icao: 'KCMI', city: 'Champaign', name: 'University of Illinois Willard', country: 'US' },
  { iata: 'BMI', icao: 'KBMI', city: 'Bloomington', name: 'Central Illinois Regional Airport', country: 'US' },
  { iata: 'PIA', icao: 'KPIA', city: 'Peoria', name: 'General Wayne A. Downing Peoria Intl', country: 'US' },
  { iata: 'MLI', icao: 'KMLI', city: 'Moline', name: 'Quad Cities International Airport', country: 'US' },
  { iata: 'CID', icao: 'KCID', city: 'Cedar Rapids', name: 'The Eastern Iowa Airport', country: 'US' },
  { iata: 'EVV', icao: 'KEVV', city: 'Evansville', name: 'Evansville Regional Airport', country: 'US' },
  { iata: 'PAH', icao: 'KPAH', city: 'Paducah', name: 'Barkley Regional Airport', country: 'US' },
  { iata: 'SBN', icao: 'KSBN', city: 'South Bend', name: 'South Bend International Airport', country: 'US' },
  { iata: 'FWA', icao: 'KFWA', city: 'Fort Wayne', name: 'Fort Wayne International Airport', country: 'US' },

  // Major & Seasonal US Commercial STL Connections
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
  { iata: 'SFB', icao: 'KSFB', city: 'Orlando Sanford', name: 'Orlando Sanford International', country: 'US' },
  { iata: 'TPA', icao: 'KTPA', city: 'Tampa', name: 'Tampa International Airport', country: 'US' },
  { iata: 'PIE', icao: 'KPIE', city: 'St. Pete-Clearwater', name: 'St. Pete-Clearwater International', country: 'US' },
  { iata: 'SRQ', icao: 'KSRQ', city: 'Sarasota', name: 'Sarasota Bradenton International', country: 'US' },
  { iata: 'PGD', icao: 'KPGD', city: 'Punta Gorda', name: 'Punta Gorda Airport', country: 'US' },
  { iata: 'RSW', icao: 'KRSW', city: 'Fort Myers', name: 'Southwest Florida International', country: 'US' },
  { iata: 'PBI', icao: 'KPBI', city: 'West Palm Beach', name: 'Palm Beach International Airport', country: 'US', isPrivateFbo: true },
  { iata: 'EYW', icao: 'KEYW', city: 'Key West', name: 'Key West International Airport', country: 'US' },
  { iata: 'VPS', icao: 'KVPS', city: 'Destin', name: 'Destin-Fort Walton Beach Airport', country: 'US' },
  { iata: 'ECP', icao: 'KECP', city: 'Panama City Beach', name: 'Northwest Florida Beaches Intl', country: 'US' },
  { iata: 'PNS', icao: 'KPNS', city: 'Pensacola', name: 'Pensacola International Airport', country: 'US' },
  { iata: 'JAX', icao: 'KJAX', city: 'Jacksonville', name: 'Jacksonville International Airport', country: 'US' },
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
  { iata: 'SAT', icao: 'KSAT', city: 'San Antonio', name: 'San Antonio International Airport', country: 'US' },
  { iata: 'ELP', icao: 'KELP', city: 'El Paso', name: 'El Paso International Airport', country: 'US' },
  { iata: 'SAN', icao: 'KSAN', city: 'San Diego', name: 'San Diego International Airport', country: 'US' },
  { iata: 'SNA', icao: 'KSNA', city: 'Santa Ana', name: 'John Wayne Orange County Airport', country: 'US' },
  { iata: 'BUR', icao: 'KBUR', city: 'Burbank', name: 'Hollywood Burbank Airport', country: 'US' },
  { iata: 'ONT', icao: 'KONT', city: 'Ontario CA', name: 'Ontario International Airport', country: 'US' },
  { iata: 'LGB', icao: 'KLGB', city: 'Long Beach', name: 'Long Beach Airport', country: 'US' },
  { iata: 'PSP', icao: 'KPSP', city: 'Palm Springs', name: 'Palm Springs International Airport', country: 'US' },
  { iata: 'OAK', icao: 'KOAK', city: 'Oakland', name: 'San Francisco Bay Oakland Intl', country: 'US' },
  { iata: 'SJC', icao: 'KSJC', city: 'San Jose', name: 'San Jose Mineta International', country: 'US' },
  { iata: 'SMF', icao: 'KSMF', city: 'Sacramento', name: 'Sacramento International Airport', country: 'US' },
  { iata: 'SLC', icao: 'KSLC', city: 'Salt Lake City', name: 'Salt Lake City International', country: 'US' },
  { iata: 'PDX', icao: 'KPDX', city: 'Portland', name: 'Portland International Airport', country: 'US' },
  { iata: 'MCI', icao: 'KMCI', city: 'Kansas City', name: 'Kansas City International Airport', country: 'US' },
  { iata: 'IND', icao: 'KIND', city: 'Indianapolis', name: 'Indianapolis International Airport', country: 'US' },
  { iata: 'CMH', icao: 'KCMH', city: 'Columbus', name: 'John Glenn Columbus International', country: 'US' },
  { iata: 'CVG', icao: 'KCVG', city: 'Cincinnati', name: 'Cincinnati/Northern Kentucky Intl', country: 'US' },
  { iata: 'CLE', icao: 'KCLE', city: 'Cleveland', name: 'Cleveland Hopkins International', country: 'US' },
  { iata: 'DAY', icao: 'KDAY', city: 'Dayton', name: 'Dayton International Airport', country: 'US' },
  { iata: 'PIT', icao: 'KPIT', city: 'Pittsburgh', name: 'Pittsburgh International Airport', country: 'US' },
  { iata: 'MKE', icao: 'KMKE', city: 'Milwaukee', name: 'Mitchell International Airport', country: 'US' },
  { iata: 'MSN', icao: 'KMSN', city: 'Madison', name: 'Dane County Regional Airport', country: 'US' },
  { iata: 'GRR', icao: 'KGRR', city: 'Grand Rapids', name: 'Gerald R. Ford International', country: 'US' },
  { iata: 'MEM', icao: 'KMEM', city: 'Memphis', name: 'Memphis International Airport', country: 'US' },
  { iata: 'MSY', icao: 'KMSY', city: 'New Orleans', name: 'Louis Armstrong New Orleans Intl', country: 'US' },
  { iata: 'RDU', icao: 'KRDU', city: 'Raleigh', name: 'Raleigh-Durham International', country: 'US' },
  { iata: 'ORF', icao: 'KORF', city: 'Norfolk', name: 'Norfolk International Airport', country: 'US' },
  { iata: 'RIC', icao: 'KRIC', city: 'Richmond', name: 'Richmond International Airport', country: 'US' },
  { iata: 'CHS', icao: 'KCHS', city: 'Charleston', name: 'Charleston International Airport', country: 'US' },
  { iata: 'MYR', icao: 'KMYR', city: 'Myrtle Beach', name: 'Myrtle Beach International Airport', country: 'US' },
  { iata: 'SAV', icao: 'KSAV', city: 'Savannah', name: 'Savannah/Hilton Head International', country: 'US' },
  { iata: 'GSP', icao: 'KGSP', city: 'Greenville', name: 'Greenville-Spartanburg International', country: 'US' },
  { iata: 'AVL', icao: 'KAVL', city: 'Asheville', name: 'Asheville Regional Airport', country: 'US' },
  { iata: 'TYS', icao: 'KTYS', city: 'Knoxville', name: 'McGhee Tyson Airport', country: 'US' },
  { iata: 'SDF', icao: 'KSDF', city: 'Louisville', name: 'Louisville Muhammad Ali Intl', country: 'US' },
  { iata: 'LEX', icao: 'KLEX', city: 'Lexington', name: 'Blue Grass Airport', country: 'US' },
  { iata: 'BHM', icao: 'KBHM', city: 'Birmingham', name: 'Birmingham-Shuttlesworth Intl', country: 'US' },
  { iata: 'OMA', icao: 'KOMA', city: 'Omaha', name: 'Eppley Airfield', country: 'US' },
  { iata: 'DSM', icao: 'KDSM', city: 'Des Moines', name: 'Des Moines International Airport', country: 'US' },
  { iata: 'ICT', icao: 'KICT', city: 'Wichita', name: 'Wichita Dwight D. Eisenhower National', country: 'US' },
  { iata: 'OKC', icao: 'KOKC', city: 'Oklahoma City', name: 'Will Rogers World Airport', country: 'US' },
  { iata: 'TUL', icao: 'KTUL', city: 'Tulsa', name: 'Tulsa International Airport', country: 'US' },
  { iata: 'LIT', icao: 'KLIT', city: 'Little Rock', name: 'Bill and Hillary Clinton National', country: 'US' },
  { iata: 'XNA', icao: 'KXNA', city: 'Bentonville', name: 'Northwest Arkansas National Airport', country: 'US' },
  { iata: 'BUF', icao: 'KBUF', city: 'Buffalo', name: 'Buffalo Niagara International', country: 'US' },
  { iata: 'ROC', icao: 'KROC', city: 'Rochester', name: 'Frederick Douglass Greater Rochester', country: 'US' },
  { iata: 'SYR', icao: 'KSYR', city: 'Syracuse', name: 'Syracuse Hancock International', country: 'US' },
  { iata: 'ALB', icao: 'KALB', city: 'Albany', name: 'Albany International Airport', country: 'US' },
  { iata: 'BDL', icao: 'KBDL', city: 'Hartford', name: 'Bradley International Airport', country: 'US' },
  { iata: 'PVD', icao: 'KPVD', city: 'Providence', name: 'Rhode Island T. F. Green Intl', country: 'US' },
  { iata: 'PWM', icao: 'KPWM', city: 'Portland ME', name: 'Portland International Jetport', country: 'US' },
  { iata: 'BOI', icao: 'KBOI', city: 'Boise', name: 'Boise Airport', country: 'US' },
  { iata: 'BZN', icao: 'KBZN', city: 'Bozeman', name: 'Bozeman Yellowstone International', country: 'US' },
  { iata: 'HDN', icao: 'KHDN', city: 'Steamboat Springs', name: 'Yampa Valley Regional Airport', country: 'US' },
  { iata: 'EGE', icao: 'KEGE', city: 'Vail', name: 'Eagle County Regional Airport', country: 'US' },
  { iata: 'TUS', icao: 'KTUS', city: 'Tucson', name: 'Tucson International Airport', country: 'US' },
  { iata: 'ABQ', icao: 'KABQ', city: 'Albuquerque', name: 'Albuquerque International Sunport', country: 'US' },
  { iata: 'RNO', icao: 'KRNO', city: 'Reno', name: 'Reno-Tahoe International Airport', country: 'US' },
  { iata: 'HNL', icao: 'PHNL', city: 'Honolulu', name: 'Daniel K. Inouye International', country: 'US' },
  { iata: 'OGG', icao: 'PHOG', city: 'Maui', name: 'Kahului Airport', country: 'US' },
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
  { iata: 'BCT', icao: 'KBCT', city: 'Boca Raton', name: 'Boca Raton Airport (Private FBO)', country: 'US', isPrivateFbo: true },
  { iata: 'APF', icao: 'KAPF', city: 'Naples', name: 'Naples Airport (Private FBO)', country: 'US', isPrivateFbo: true },

  // Canada Hubs (YYZ first for STL Air Canada nonstop priority)
  { iata: 'YYZ', icao: 'CYYZ', city: 'Toronto', name: 'Toronto Pearson International', country: 'CA' },
  { iata: 'YTZ', icao: 'CYTZ', city: 'Toronto Island', name: 'Billy Bishop Toronto City Airport', country: 'CA' },
  { iata: 'YVR', icao: 'CYVR', city: 'Vancouver', name: 'Vancouver International Airport', country: 'CA' },
  { iata: 'YUL', icao: 'CYUL', city: 'Montreal', name: 'Montreal-Trudeau International', country: 'CA' },
  { iata: 'YYC', icao: 'CYYC', city: 'Calgary', name: 'Calgary International Airport', country: 'CA' },
  { iata: 'YOW', icao: 'CYOW', city: 'Ottawa', name: 'Ottawa Macdonald-Cartier Intl', country: 'CA' },
  { iata: 'YEG', icao: 'CYEG', city: 'Edmonton', name: 'Edmonton International Airport', country: 'CA' },
  { iata: 'YHZ', icao: 'CYHZ', city: 'Halifax', name: 'Halifax Stanfield International', country: 'CA' },
  { iata: 'YWG', icao: 'CYWG', city: 'Winnipeg', name: 'Winnipeg Richardson International', country: 'CA' },

  // Mexico & Caribbean Leisure (STL Nonstop & Seasonal Gateways)
  { iata: 'CUN', icao: 'MMUN', city: 'Cancun', name: 'Cancun International Airport', country: 'MX' },
  { iata: 'PUJ', icao: 'MDPC', city: 'Punta Cana', name: 'Punta Cana International Airport', country: 'DO' },
  { iata: 'MBJ', icao: 'MKJS', city: 'Montego Bay', name: 'Sangster International Airport', country: 'JM' },
  { iata: 'SJD', icao: 'MMSD', city: 'Los Cabos', name: 'Los Cabos International Airport', country: 'MX' },
  { iata: 'PVR', icao: 'MMPR', city: 'Puerto Vallarta', name: 'Gustavo Diaz Ordaz International', country: 'MX' },
  { iata: 'NAS', icao: 'MYNN', city: 'Nassau', name: 'Lynden Pindling International', country: 'BS' },
  { iata: 'GCM', icao: 'MWCR', city: 'Grand Cayman', name: 'Owen Roberts International Airport', country: 'KY' },
  { iata: 'CZM', icao: 'MMCZ', city: 'Cozumel', name: 'Cozumel International Airport', country: 'MX' },
  { iata: 'MEX', icao: 'MMMX', city: 'Mexico City', name: 'Benito Juarez International', country: 'MX' },
  { iata: 'SJU', icao: 'TJSJ', city: 'San Juan', name: 'Luis Munoz Marin International', country: 'PR' },
  { iata: 'AUA', icao: 'TNCA', city: 'Aruba', name: 'Queen Beatrix International Airport', country: 'AW' },
  { iata: 'PLS', icao: 'MBPV', city: 'Providenciales', name: 'Providenciales International', country: 'TC' },
  { iata: 'LIR', icao: 'MRLB', city: 'Liberia', name: 'Daniel Oduber Quiros International', country: 'CR' },

  // European & Global Hubs (including STL Nonstop FRA Lufthansa & LHR British Airways)
  { iata: 'FRA', icao: 'EDDF', city: 'Frankfurt', name: 'Frankfurt Airport', country: 'DE' },
  { iata: 'LHR', icao: 'EGLL', city: 'London', name: 'London Heathrow Airport', country: 'GB' },
  { iata: 'LGW', icao: 'EGKK', city: 'London', name: 'London Gatwick Airport', country: 'GB' },
  { iata: 'CDG', icao: 'LFPG', city: 'Paris', name: 'Charles de Gaulle Airport', country: 'FR' },
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

const BY_IATA = new Map<string, AirportCatalogEntry>(MAJOR_AIRPORTS.map((e) => [e.iata.toUpperCase(), e]));
const BY_ICAO = new Map<string, AirportCatalogEntry>(MAJOR_AIRPORTS.map((e) => [e.icao.toUpperCase(), e]));

function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/['’.]/g, '').replace(/\s+/g, ' ').trim();
}

export function formatAirportCodeCity(entry: Pick<AirportCatalogEntry, 'iata' | 'city'>): string {
  return `${entry.iata.trim().toUpperCase()} ${entry.city.trim()}`;
}

export function extractAirportIataCode(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  const byIcaoExact = BY_ICAO.get(upper);
  if (byIcaoExact) return byIcaoExact.iata;
  if (BY_IATA.has(upper)) return upper;

  const leadingThree = raw.match(/^([A-Za-z]{3})(?:[\s\-–—·,(/]|$)/);
  if (leadingThree) return leadingThree[1].toUpperCase();

  const leadingFour = raw.match(/^([A-Za-z0-9]{3,4})(?:[\s\-–—·,(/]|$)/);
  if (leadingFour) {
    const code4 = leadingFour[1].toUpperCase();
    return BY_ICAO.get(code4)?.iata || code4;
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

export function resolveAirportDisplayValue(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const code = extractAirportIataCode(raw);
  const entry = code ? BY_IATA.get(code) : undefined;
  if (entry) return formatAirportCodeCity(entry);
  return /^[A-Za-z0-9]{3,4}$/.test(raw) ? raw.toUpperCase() : raw;
}

export function searchAirportCatalog(
  query: string,
  limit = 25,
  options?: { preferPrivateFbo?: boolean }
): AirportCatalogEntry[] {
  const cap = Math.max(1, limit);
  const rawQ = String(query || '').trim();
  if (!rawQ) {
    if (options?.preferPrivateFbo) {
      return [
        ...MAJOR_AIRPORTS.filter((a) => a.isPrivateFbo),
        ...MAJOR_AIRPORTS.filter((a) => !a.isPrivateFbo),
      ].slice(0, cap);
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
    if (iata === qNorm || icao === qNorm || formatted === qNorm) rank = 1;
    else if (iata.startsWith(qNorm) || icao.startsWith(qNorm)) rank = 2;
    else if (formatted.startsWith(qNorm) || (qCode.length === 3 && iata === qCode)) rank = 3;
    else if (city === qNorm) rank = 4;
    else if (city.startsWith(qNorm)) rank = 5;
    else if (city.includes(qNorm)) rank = 6;
    else if (name.startsWith(qNorm)) rank = 7;
    else if (name.includes(qNorm)) rank = 8;

    if (rank < 999) {
      if (options?.preferPrivateFbo && entry.isPrivateFbo) rank -= 0.25;
      scored.push({ entry, rank, index });
    }
  });

  scored.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return scored.slice(0, cap).map((s) => s.entry);
}
