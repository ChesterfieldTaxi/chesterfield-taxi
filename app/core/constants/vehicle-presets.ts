/**
 * Curated vehicle image presets for vehicle types and fleet vehicles.
 * Provides high-quality stock photography for quick selection in the Admin portal.
 */

export interface VehicleImagePreset {
  id: string;
  label: string;
  category: 'sedan' | 'suv' | 'van' | 'wav' | 'luxury' | 'electric';
  url: string;
}

export const VEHICLE_IMAGE_PRESETS: VehicleImagePreset[] = [
  {
    id: 'preset-sedan-silver',
    label: 'Executive Sedan (Silver)',
    category: 'sedan',
    url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'preset-sedan-black',
    label: 'Premium Luxury Sedan (Black)',
    category: 'luxury',
    url: 'https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'preset-suv-black',
    label: 'Full-Size XL SUV (Chevy / Tahoe)',
    category: 'suv',
    url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'preset-van-transit',
    label: 'High-Capacity Passenger Van',
    category: 'van',
    url: 'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'preset-wav-accessible',
    label: 'Wheelchair Accessible (WAV)',
    category: 'wav',
    url: 'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'preset-ev-sedan',
    label: 'Modern Electric Sedan (EV)',
    category: 'electric',
    url: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&w=800&q=80',
  },
];
