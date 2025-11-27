import { useState, useEffect } from 'react';
import { FleetConfig } from '../types/fleet';
import { mockFleetConfig } from '../mocks/fleetConfigMock';

export function useFleetConfig(useMock = true) {
    const [fleetConfig, setFleetConfig] = useState<FleetConfig | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (useMock) {
            // Simulate async fetch
            const timer = setTimeout(() => {
                setFleetConfig(mockFleetConfig);
                setLoading(false);
            }, 50);
            return () => clearTimeout(timer);
        } else {
            // TODO: Implement Firestore fetch
            setLoading(false);
        }
    }, [useMock]);

    return { fleetConfig, loading };
}
