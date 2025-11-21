/**
 * Singleton loader for Google Maps API using the new functional API
 */

let loadPromise: Promise<typeof google> | null = null;

/**
 * Load Google Maps API with Places library
 * Ensures the API is loaded only once across the application
 */
export async function loadGoogleMaps(): Promise<typeof google> {
    // Return existing promise if already loading/loaded
    if (loadPromise) return loadPromise;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        throw new Error(
            'Google Maps API key not found. Please add VITE_GOOGLE_MAPS_API_KEY to your .env file.'
        );
    }

    // Use the new functional API instead of Loader class
    loadPromise = (async () => {
        // Dynamically import the Google Maps script
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=Function.prototype`;
        script.async = true;
        script.defer = true;

        // Wait for script to load
        await new Promise<void>((resolve, reject) => {
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Google Maps API'));
            document.head.appendChild(script);
        });

        // Wait for google object to be available
        if (typeof google === 'undefined') {
            throw new Error('Google Maps API failed to initialize');
        }

        return google;
    })();

    return loadPromise;
}

/**
 * Check if Google Maps is loaded
 */
export function isGoogleMapsLoaded(): boolean {
    return typeof google !== 'undefined' && typeof google.maps !== 'undefined';
}
