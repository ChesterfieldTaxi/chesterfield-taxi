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

    // Load Google Maps API using centralized loader
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

    // Use the standard AutocompleteService (not deprecated when used correctly)
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
                // Use standard API - the callback pattern is still supported
                const service = new window.google.maps.places.AutocompleteService();

                service.getPlacePredictions(
                    {
                        input,
                        componentRestrictions: { country: 'us' },
                        types: ['geocode', 'establishment']
                    },
                    (predictions: any, status: any) => {
                        if (status === window.google.maps.places.PlacesServiceStatus.OK) {
                            console.log(`📍 Found ${predictions?.length || 0} place predictions`);
                            setPredictions(predictions || []);
                        } else {
                            console.log(`⚠️ Places status: ${status}`);
                            setPredictions([]);
                        }
                        setLoading(false);
                    }
                );
            } catch (error) {
                console.error('❌ Places API error:', error);
                setPredictions([]);
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
