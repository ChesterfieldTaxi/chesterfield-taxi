/**
 * Shared Type Definitions
 * 
 * Base types and interfaces used across the entire application.
 * Ensures consistency between customer app, admin dashboard, and future features.
 */

/**
 * Base entity with common fields
 */
export interface BaseEntity {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Booking Status Lifecycle
 * 
 * pending → confirmed → assigned → en_route → arrived → in_progress → completed
 *                                                                    → cancelled
 */
export type BookingStatus =
    | 'pending'      // Customer submitted, awaiting dispatch review
    | 'confirmed'    // Dispatch confirmed availability
    | 'assigned'     // Driver assigned to booking
    | 'en_route'     // Driver on the way to pickup
    | 'arrived'      // Driver at pickup location
    | 'in_progress'  // Trip in progress
    | 'completed'    // Trip finished successfully
    | 'cancelled';   // Booking cancelled

/**
 * Vehicle Types
 */
export type VehicleType = 'sedan' | 'suv' | 'minivan';

/**
 * Payment Methods
 */
export type PaymentMethod = 'cash' | 'account' | 'prepaid';

/**
 * Location Type (for routing)
 */
export type LocationType = 'pickup' | 'dropoff' | 'stop';

/**
 * Driver Status (for future admin/dispatch features)
 */
export type DriverStatus = 'available' | 'busy' | 'offline';

/**
 * Driver Information (for future features)
 */
export interface Driver extends BaseEntity {
    name: string;
    phone: string;
    vehicleId: string;
    vehicleType: VehicleType;
    status: DriverStatus;
    currentLocation?: {
        latitude: number;
        longitude: number;
    };
}

/**
 * Customer Information
 */
export interface CustomerInfo {
    name: string;
    phone: string;
    email: string;
}

/**
 * Route Information
 */
export interface RouteInfo {
    pickup: {
        address: string;
        coordinates?: { latitude: number; longitude: number };
    };
    dropoff: {
        address: string;
        coordinates?: { latitude: number; longitude: number };
    };
    stops: Array<{
        address: string;
        coordinates?: { latitude: number; longitude: number };
    }>;
    distance?: number; // in yards
}

/**
 * Pricing Information
 */
export interface PricingInfo {
    baseRate: number;
    distanceRate: number;
    total: number;
    breakdown: {
        base: number;
        distance: number;
        fees: number;
        surcharges: number;
    };
}

/**
 * Feature Flags Type
 * Ensures type safety when using feature flags
 */
export type FeatureFlag =
    | 'ENABLE_TRACKING'
    | 'ENABLE_PWA'
    | 'ENABLE_ANALYTICS';

/**
 * API Response Types
 */
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
}

/**
 * Type guard utilities
 */
export const isBookingStatus = (status: string): status is BookingStatus => {
    return ['pending', 'confirmed', 'assigned', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled'].includes(status);
};

export const isVehicleType = (type: string): type is VehicleType => {
    return ['sedan', 'suv', 'minivan'].includes(type);
};

export const isPaymentMethod = (method: string): method is PaymentMethod => {
    return ['cash', 'account', 'prepaid'].includes(method);
};
