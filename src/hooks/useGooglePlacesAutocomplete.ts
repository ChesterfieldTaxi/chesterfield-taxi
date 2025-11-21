import { useEffect, useRef } from 'react';
import { loadGoogleMaps } from '../utils/googleMapsLoader';

export interface PlaceResult {
    address: string;
    coordinates: { lat: number; lng: number };
    placeId: string;
    isAirport: boolean;
}

interface UseAutocompleteOptions {
    onPlaceSelected: (place: PlaceResult) => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
    enabled?: boolean;
}

export function useGooglePlacesAutocomplete({
    onPlaceSelected,
    inputRef,
    enabled = true
}: UseAutocompleteOptions) {
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

    useEffect(() => {
        if (!enabled || !inputRef.current) return;

        let mounted = true;

        const initAutocomplete = async () => {
            try {
                await loadGoogleMaps();

                if (!mounted || !inputRef.current) return;

                autocompleteRef.current = new google.maps.places.Autocomplete(
                    inputRef.current,
                    {
                        componentRestrictions: { country: 'us' },
                        fields: ['address_components', 'formatted_address', 'geometry', 'place_id', 'types']
                    }
                );

                autocompleteRef.current.addListener('place_changed', () => {
                    const place = autocompleteRef.current?.getPlace();

                    if (!place || !place.geometry || !place.geometry.location) {
                        return;
                    }

                    const isAirport = place.types?.includes('airport') || false;

                    const placeResult: PlaceResult = {
                        address: place.formatted_address || '',
                        coordinates: {
                            lat: place.geometry.location.lat(),
                            lng: place.geometry.location.lng()
                        },
                        placeId: place.place_id || '',
                        isAirport
                    };

                    onPlaceSelected(placeResult);
                });
            } catch (error) {
                console.error('Failed to initialize Google Places Autocomplete:', error);
            }
        };

        initAutocomplete();

        return () => {
            mounted = false;
            if (autocompleteRef.current) {
                google.maps.event.clearInstanceListeners(autocompleteRef.current);
            }
        };
    }, [enabled, inputRef, onPlaceSelected]);

    return { autocomplete: autocompleteRef.current };
}
