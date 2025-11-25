import { useState, useEffect } from 'react';
import type { PricingRules } from '../types/pricing';
import { mockPricingRules } from '../mocks/pricingRulesMock';

/**
 * Hook to fetch pricing rules
 * Currently uses mock data - will be replaced with Firestore later
 */
export function usePricingRules(useMock = true) {
    const [rules, setRules] = useState<PricingRules | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (useMock) {
            // Simulate async fetch with mock data
            const timer = setTimeout(() => {
                setRules(mockPricingRules);
                setLoading(false);
            }, 100);

            return () => clearTimeout(timer);
        } else {
            // TODO: Implement Firestore listener
            // const unsubscribe = onSnapshot(doc(db, 'pricing_rules', 'current'), ...);
            // return () => unsubscribe();
            setError(new Error('Firestore not implemented yet'));
            setLoading(false);
        }
    }, [useMock]);

    return { rules, loading, error };
}

/**
 * Get vehicle configuration from pricing rules
 * Returns vehicle types with their passenger counts and additional fees
 */
export function getVehicleConfig(rules: PricingRules | null) {
    if (!rules) return null;

    return Object.entries(rules.vehicleModifiers)
        .filter(([_, config]) => config.enabled)
        .map(([id, config]) => ({
            id: id as 'Sedan' | 'SUV' | 'Minivan' | 'Any',
            name: config.name,
            maxPassengers: config.maxPassengers,
            additionalFee: config.modifier.amount
        }));
}

/**
 * Get minimum/base prices for each vehicle type (for "From $X" display)
 * Uses airport minimum as baseline (most common use case)
 */
export function getMinimumPrices(rules: PricingRules | null): Record<string, number> | null {
    if (!rules) return null;

    const airportTrip = rules.tripTypes['airport_transfer'];
    if (!airportTrip) return null;

    // Base minimum is the airport minimum fare
    const baseMinimum = airportTrip.minimumFare;

    // Calculate minimum for each vehicle considering vehicle upgrades
    const minimums: Record<string, number> = {};

    Object.entries(rules.vehicleModifiers)
        .filter(([_, config]) => config.enabled)
        .forEach(([vehicleType, config]) => {
            minimums[vehicleType] = baseMinimum + config.modifier.amount;
        });

    return minimums;
}
