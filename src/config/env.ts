/**
 * Environment configuration
 * Centralized access to environment variables
 */

export const ENV = {
    // Google Maps
    MAPS_API_KEY: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',

    // Firebase (future)
    FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY || '',
    FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',

    // App Configuration
    IS_PRODUCTION: import.meta.env.PROD,
    IS_DEVELOPMENT: import.meta.env.DEV,

    // Feature Flags
    ENABLE_TRACKING: import.meta.env.VITE_ENABLE_TRACKING === 'true',
    ENABLE_PWA: import.meta.env.VITE_ENABLE_PWA === 'true',
    ENABLE_ANALYTICS: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',

    // Business Configuration
    COMPANY_NAME: 'Chesterfield Taxi',
    PHONE_NUMBER: '(636) 123-4567',
    EMAIL: 'info@chesterfieldtaxi.com',
    CONFIRMATION_TIMEOUT_MINUTES: 60,

    // Pricing
    RECENT_LOCATIONS_MAX: 5,
    RECENT_LOCATIONS_EXPIRY_DAYS: 90,
} as const;

// Development-only validation
if (ENV.IS_DEVELOPMENT) {
    if (!ENV.MAPS_API_KEY) {
        console.warn('[ENV] VITE_GOOGLE_MAPS_API_KEY is not set');
    }
}

// Production validation
if (ENV.IS_PRODUCTION) {
    if (!ENV.MAPS_API_KEY) {
        throw new Error('[ENV] VITE_GOOGLE_MAPS_API_KEY is required in production');
    }
}

/**
 * Feature flag hook for components
 * @example const trackingEnabled = useFeature('ENABLE_TRACKING');
 */
export const isFeatureEnabled = (flag: keyof typeof ENV): boolean => {
    const value = ENV[flag];
    return typeof value === 'boolean' ? value : false;
};
