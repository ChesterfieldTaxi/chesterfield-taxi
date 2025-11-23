import { useState, useCallback, useEffect } from 'react';
import { debounce } from '../utils/debounce';
import type { PlacePrediction } from '../components/booking_v3/AutocompleteDropdown';
import { loadGoogleMaps } from '../utils/googleMapsLoader';

declare global {
    interface Window {
        google: any;
    }
}

export function useGooglePlaces() {
    const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
    const [loading, setLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadError, setLoadError] = useState<Error | null>(null);

    // 🔥 FIX: Use centralized Google Maps loader (no duplicate scripts)
    useEffect(() => {
        loadGoogleMaps()
            .then(() => {
                setIsLoaded(true);
                console.log('✅ Google Maps API loaded successfully');
            })
            .catch((e) => {
                console.error('❌ Error loading Google Maps API:', e);
                setLoadError(e);
            });
    }, []);

    // 🔥 FIX: Use new AutocompleteService API (no deprecated getPlacePredictions)
    const searchPlaces = useCallback(
        debounce(async (input: string) => {
            if (!isLoaded) {
                return;
            }

            if (!input || input.length < 3) {
                setPredictions([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                // Use the new Places API (Autocomplete) - no deprecated methods
                const { AutocompleteService } = await window.google.maps.importLibrary("places");
                const service = new AutocompleteService();

                const { predictions: results } = await service.getPlacePredictions({
                    input,
                    componentRestrictions: { country: 'us' },
                    types: ['geocode', 'establishment']
                });

                console.log(`📍 Found ${results?.length || 0} place predictions`);
                setPredictions(results || []);
            } catch (error) {
                console.error('❌ Places API error:', error);
                setPredictions([]);
            } finally {
                setLoading(false);
            }
        }, 300),
        [isLoaded]
    );

    const getPlaceDetails = async (placeId: string): Promise<{ coordinates: { lat: number; lng: number }; types?: string[] } | null> => {
        if (!isLoaded) {
            console.warn('⚠️ Google Maps API not loaded');
            return null;
        }

        return new Promise((resolve) => {
            const service = new window.google.maps.places.PlacesService(document.createElement('div'));
            service.getDetails(
                { placeId, fields: ['geometry', 'formatted_address', 'types'] },
                (place: any, status: any) => {
                    if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
                        resolve({
                            coordinates: {
                                lat: place.geometry?.location?.lat() || 0,
                                lng: place.geometry?.location?.lng() || 0
                            },
                            types: place.types
                        });
                    } else {
                        console.error(`❌ Place details error: ${status}`);
                        resolve(null);
                    }
                }
            );
        });
    };

    return { predictions, loading, searchPlaces, getPlaceDetails, isLoaded, loadError };
}
