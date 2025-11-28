import { useState, useEffect } from 'react';
import type { CompanyConfig } from '../types/companyConfig';
import { mockCompanyConfig } from '../mocks/companyConfigMock';
import { subscribeToCompanyConfig } from '../services/configService';

/**
 * Hook to fetch company configuration
 * Subscribes to Firestore updates by default
 */
export function useCompanyConfig(useMock = false) {
    const [config, setConfig] = useState<CompanyConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (useMock) {
            // Simulate async fetch with mock data
            const timer = setTimeout(() => {
                setConfig(mockCompanyConfig);
                setLoading(false);
            }, 50);

            return () => clearTimeout(timer);
        } else {
            // Subscribe to Firestore updates
            const unsubscribe = subscribeToCompanyConfig(
                (newConfig) => {
                    setConfig(newConfig);
                    setLoading(false);
                },
                (err) => {
                    setError(err);
                    setLoading(false);
                }
            );

            return () => unsubscribe();
        }
    }, [useMock]);

    return { config, loading, error };
}
