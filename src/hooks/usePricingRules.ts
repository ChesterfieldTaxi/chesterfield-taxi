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
