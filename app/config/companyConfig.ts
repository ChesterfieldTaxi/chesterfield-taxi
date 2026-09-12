/**
 * Centralized Brand & Company Configuration
 * 
 * Single source of truth for Chesterfield Taxi branding constants,
 * communication channels, operating hours, and regional service coverage.
 */

export interface CompanyBrandPhone {
  primary: string;
  primaryRaw: string;
  dispatch: string;
}

export interface CompanyBrandEmail {
  dispatch: string;
  support: string;
}

export interface CompanyBrandAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  formatted: string;
}

export interface CompanyBrandColors {
  primary: string;
  secondary: string;
}

export interface CompanyBrandConfig {
  name: string;
  tagline: string;
  legalName: string;
  phone: CompanyBrandPhone;
  email: CompanyBrandEmail;
  operatingHours: string;
  address: CompanyBrandAddress;
  serviceAreas: string[];
  publicFormVersion: 'v1' | 'v2';
  primaryColor: string;
  secondaryColor: string;
  colors?: CompanyBrandColors;
  maxDispatchDrafts?: number;
}

export const COMPANY_CONFIG: CompanyBrandConfig = {
  name: 'Chesterfield Taxi',
  tagline: 'Professional Car Service',
  legalName: 'Chesterfield Taxi & Transportation LLC',
  publicFormVersion: 'v2',
  primaryColor: '#f59e0b',
  secondaryColor: '#0f172a',
  colors: {
    primary: '#f59e0b',
    secondary: '#0f172a',
  },
  maxDispatchDrafts: 10,
  phone: {
    primary: '(314) 738-0100',
    primaryRaw: '+13147380100',
    dispatch: '(314) 738-0100',
  },
  email: {
    dispatch: 'dispatch@chesterfieldtaxi.com',
    support: 'support@chesterfieldtaxi.com',
  },
  operatingHours: '24 Hours a Day, 365 Days a Year',
  address: {
    street: '17200 Chesterfield Airport Rd',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63005',
    formatted: '17200 Chesterfield Airport Rd, Chesterfield, MO 63005',
  },
  serviceAreas: [
    'Chesterfield, MO',
    'Wildwood & Clarkson Valley',
    'Ballwin & Ellisville',
    'Town & Country',
    'Creve Coeur & Maryland Heights',
    'Lambert-St. Louis Airport (STL)',
    'Spirit of St. Louis Airport (SUS)',
    'Downtown St. Louis Metro',
  ],
};

/**
 * Public client-side Google Maps API key fallback.
 * Strictly used for browser Places Autocomplete and Maps rendering.
 * Domain/referrer security is enforced via Google Cloud Console HTTP restrictions.
 */
export const DEFAULT_GOOGLE_MAPS_KEY = 'AIzaSyCFgx7WQAm0TQXPveb9fThEuxyxRdvxgr4';

export default COMPANY_CONFIG;

