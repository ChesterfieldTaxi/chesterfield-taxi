import type { VehicleTierConfig } from '../types/config';

/**
 * Resolves a human-friendly vehicle class label prioritizing:
 * 1. Explicit persisted `vehicleDisplayName`
 * 2. Live Admin `VehicleTierConfig.name` lookup by `id`
 * 3. Clean fallback formatter
 */
export function formatVehicleTier(
  tier: string,
  vehicles?: VehicleTierConfig[],
  explicitDisplayName?: string
): string {
  if (explicitDisplayName && explicitDisplayName.trim()) {
    const trimmed = explicitDisplayName.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'any' || lower.startsWith('any vehicle')) return 'Any';
    return trimmed;
  }
  if (!tier) return 'Standard Sedan';
  if (vehicles && vehicles.length > 0) {
    const matched = vehicles.find((v) => v.id.toLowerCase() === tier.trim().toLowerCase());
    if (matched?.name) return matched.name;
  }
  const clean = tier.trim().toLowerCase().replace(/_/g, ' ');
  if (clean === 'any' || clean.startsWith('any')) return 'Any';
  if (clean === 'standard' || clean === 'sedan') return 'Standard Sedan';
  if (clean === 'premium') return 'Premium Sedan';
  if (clean === 'xl' || clean === 'suv' || clean === 'large suv') return 'Full-Size SUV (XL)';
  if (clean === 'compact suv') return 'Compact SUV';
  if (clean === 'midsize suv') return 'Midsize SUV';
  if (clean === 'minivan') return 'Minivan';
  if (clean === 'van') return 'Passenger Van';
  if (clean === 'wheelchair' || clean === 'wav') return 'Wheelchair Accessible Van (WAV)';
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Concise UI badge formatting for vehicle tiers in tables, queues, and cards
 */
export function formatVehicleTierDisplay(
  tier?: string,
  vehicles?: VehicleTierConfig[],
  explicitDisplayName?: string
): string {
  if (explicitDisplayName && explicitDisplayName.trim()) {
    const trimmed = explicitDisplayName.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'any' || lower.startsWith('any vehicle')) return 'Any';
    return trimmed;
  }
  if (!tier) return 'Standard';
  if (vehicles && vehicles.length > 0) {
    const matched = vehicles.find((v) => v.id.toLowerCase() === tier.trim().toLowerCase());
    if (matched?.name) return matched.name;
  }
  const clean = tier.trim().toLowerCase().replace(/_/g, ' ');
  if (clean === 'any' || clean.startsWith('any vehicle')) return 'Any';
  if (clean === 'compact suv') return 'Compact SUV';
  if (clean === 'midsize suv') return 'Midsize SUV';
  if (clean === 'standard') return 'Standard Sedan';
  if (clean === 'sedan') return 'Sedan';
  if (clean === 'xl') return 'Full-Size SUV (XL)';
  if (clean === 'suv' || clean === 'large suv' || clean === 'full size suv') return 'Full-Size SUV';
  if (clean === 'minivan') return 'Minivan';
  if (clean === 'van') return 'Passenger Van';
  if (clean === 'wheelchair' || clean === 'wav') return 'WAV';
  if (clean === 'premium') return 'Premium';
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}
