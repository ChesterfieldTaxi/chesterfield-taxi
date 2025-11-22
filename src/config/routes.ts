/**
 * Centralized routing configuration
 * Type-safe route paths for the entire application
 */

export const ROUTES = {
    // Customer-facing routes
    HOME: '/',
    SERVICES: '/services',
    BOOKING: '/v3',
    BOOKING_RECEIVED: '/booking-received',

    // Future: Tracking
    TRACK_RIDE: '/track',

    // Future: Admin (separate app, but documented here)
    ADMIN_LOGIN: '/admin/login',
    ADMIN_DASHBOARD: '/admin/dashboard',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RouteValue = typeof ROUTES[RouteKey];

/**
 * Helper to build route with params
 * @example buildRoute(ROUTES.BOOKING_RECEIVED, { ref: '12345' }) => '/booking-received?ref=12345'
 */
export const buildRoute = (
    path: RouteValue,
    params?: Record<string, string>
): string => {
    if (!params) return path;

    const queryString = new URLSearchParams(params).toString();
    return `${path}?${queryString}`;
};
