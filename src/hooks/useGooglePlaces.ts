import { useState, useCallback, useEffect } from 'react';
import { debounce } from '../utils/debounce';
import type { PlacePrediction } from '../components/booking_v3/AutocompleteDropdown';

declare global {
    interface Window {
        google: any;
    }
}

const loadGoogleMapsScript = (apiKey: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (window.google?.maps?.places) {
            resolve();
            return;
        }

        const existingScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve());
            existingScript.addEventListener('error', () => reject(new Error('Google Maps script failed to load')));
            return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Google Maps script failed to load'));
        document.head.appendChild(script);
    });
};

export function useGooglePlaces() {
    const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
    const [loading, setLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadError, setLoadError] = useState<Error | null>(null);

    // Load Google Maps API
    useEffect(() => {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            console.error('VITE_GOOGLE_MAPS_API_KEY is missing in .env');
            setLoadError(new Error('API key missing'));
            return;
        }

        loadGoogleMapsScript(apiKey)
            .then(() => {
                setIsLoaded(true);
                console.log('Google Maps API loaded successfully');
            })
            .catch((e) => {
                console.error('Error loading Google Maps API:', e);
                setLoadError(e);
            });
    }, []);

    const searchPlaces = useCallback(
        debounce(async (input: string) => {
            if (!isLoaded) {
                return;
            }

            if (!input || input.length < 3) {
                setPredictions([]);
                return;
            }

            setLoading(true);
            try {
                const service = new window.google.maps.places.AutocompleteService();
                const result = await service.getPlacePredictions({
                    input,
                    componentRestrictions: { country: 'us' },
                    types: ['geocode', 'establishment']
                });

                console.log('Google Places predictions:', result.predictions);
                setPredictions(result.predictions || []);
            } catch (error) {
                console.error('Places API error:', error);
                setPredictions([]);
            } finally {
                setLoading(false);
            }
        }, 300),
        [isLoaded]
    );

    const getPlaceDetails = async (placeId: string): Promise<{ coordinates: { lat: number; lng: number }; types?: string[] } | null> => {
        if (!isLoaded) {
            console.warn('Google Maps API not loaded');
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
                        console.error(`Place details error: ${status}`);
                        resolve(null);
                    }
                }
            );
        });
    };

    return { predictions, loading, searchPlaces, getPlaceDetails, isLoaded, loadError };
}
