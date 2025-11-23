import { useState, useEffect } from 'react';
import type { CompanyConfig } from '../types/companyConfig';
import { mockCompanyConfig } from '../mocks/companyConfigMock';

/**
 * Hook to fetch company configuration
 * Currently uses mock data - will be replaced with Firestore later
 */
export function useCompanyConfig(useMock = true) {
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
            // TODO: Implement Firestore listener
            // const unsubscribe = onSnapshot(doc(db, 'company_config', 'current'), ...);
            // return () => unsubscribe();
            setError(new Error('Firestore not implemented yet'));
            setLoading(false);
        }
    }, [useMock]);

    return { config, loading, error };
}
