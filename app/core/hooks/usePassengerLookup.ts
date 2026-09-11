import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPassengerLookupService,
  type PassengerProfile,
} from '../services/booking/passenger-lookup.service';

export interface UsePassengerLookupResult {
  query: string;
  setQuery: (q: string) => void;
  results: PassengerProfile[];
  isLoading: boolean;
  selectedProfile: PassengerProfile | null;
  selectProfile: (profile: PassengerProfile) => void;
  clearSelection: () => void;
  clearAll: () => void;
}

export function usePassengerLookup(): UsePassengerLookupResult {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PassengerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<PassengerProfile | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsLoading(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const service = getPassengerLookupService();
        const matches = await service.searchPassengers(query);
        setResults(matches);
      } catch (err) {
        console.error('[usePassengerLookup] Search failed:', err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query]);

  const selectProfile = useCallback((profile: PassengerProfile) => {
    setSelectedProfile(profile);
    setQuery(`${profile.firstName} ${profile.lastName} (${profile.phone})`);
    setResults([]);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedProfile(null);
  }, []);

  const clearAll = useCallback(() => {
    setSelectedProfile(null);
    setQuery('');
    setResults([]);
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    selectedProfile,
    selectProfile,
    clearSelection,
    clearAll,
  };
}
