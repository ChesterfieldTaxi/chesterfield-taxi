import { useEffect, useMemo } from 'react';
import { useBookingFormV3, BookingFormV3State } from './useBookingFormV3';

/**
 * Wrapper around useBookingFormV3 that adds localStorage persistence
 * 
 * - Restores state from localStorage on mount
 * - Auto-saves form state to localStorage with 500ms debounce
 * - Provides clearSaved() to remove persisted data after successful booking
 * 
 * @param overrideState - State that takes precedence over localStorage (e.g., URL params)
 * @returns Same interface as useBookingFormV3, plus clearSaved() function
 */
export function usePersistedBookingForm(overrideState?: Partial<BookingFormV3State>) {
    const STORAGE_KEY = 'booking_draft_v3';

    // 1. FIRST: Try to restore saved state from localStorage
    const savedState = useMemo(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                console.log(`[usePersistedBooking] Restored state from localStorage`);

                // Convert date strings back to Date objects
                if (parsed.pickupDateTime && typeof parsed.pickupDateTime === 'string') {
                    parsed.pickupDateTime = new Date(parsed.pickupDateTime);
                }
                if (parsed.returnDateTime && typeof parsed.returnDateTime === 'string') {
                    parsed.returnDateTime = new Date(parsed.returnDateTime);
                }
                if (parsed.payment?.timestamp && typeof parsed.payment.timestamp === 'string') {
                    parsed.payment.timestamp = new Date(parsed.payment.timestamp);
                }

                return parsed as Partial<BookingFormV3State>;
            }
        } catch (error) {
            console.warn(`[usePersistedBooking] Failed to parse saved state:`, error);
            // Clear corrupted data
            localStorage.removeItem(STORAGE_KEY);
        }
        return undefined;
    }, []); // Only run once on mount

    // 2. THEN: Merge savedState with overrideState (override takes precedence)
    const initialState = useMemo(() => {
        const merged = {
            ...savedState,
            ...overrideState  // URL params override localStorage
        };
        if (overrideState && Object.keys(overrideState).length > 0) {
            console.log('[usePersistedBooking] Merging override state:', overrideState);
            console.log('[usePersistedBooking] Merged initial state:', merged);
        }
        return merged;
    }, [savedState, overrideState]);

    // 3. Initialize booking form with merged state
    const bookingForm = useBookingFormV3(initialState);

    // 3. Auto-save state to localStorage whenever it changes (debounced)
    useEffect(() => {
        // Only save if user has started filling out form
        const hasData = bookingForm.state.pickup || bookingForm.state.dropoff ||
            bookingForm.state.name || bookingForm.state.phone;

        if (!hasData) return; // Don't save empty state

        const timer = setTimeout(() => {
            try {
                const serialized = JSON.stringify(bookingForm.state);
                localStorage.setItem(STORAGE_KEY, serialized);
                console.log(`[usePersistedBooking] Auto-saved state to localStorage`);
            } catch (error) {
                console.error(`[usePersistedBooking] Failed to save state:`, error);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timer);
    }, [bookingForm.state]);

    // 4. Provide function to clear saved data
    const clearSaved = () => {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log(`[usePersistedBooking] Cleared saved state`);
        } catch (error) {
            console.error(`[usePersistedBooking] Failed to clear saved state:`, error);
        }
    };

    // Return the booking form interface plus the clearSaved function
    return {
        ...bookingForm,
        clearSaved
    };
}

export type PersistedBookingForm = ReturnType<typeof usePersistedBookingForm>;
