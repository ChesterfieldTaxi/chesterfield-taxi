import { useEffect } from 'react';
import { useBookingFormV3 } from './useBookingFormV3';
import { usePersistedState } from './usePersistedState';

/**
 * Wrapper around useBookingFormV3 that adds localStorage persistence
 * 
 * - Auto-saves form state to localStorage with 500ms debounce
 * - Restores state on page load/refresh
 * - Provides clearSaved() to remove persisted data after successful booking
 * 
 * @returns Same interface as useBookingFormV3, plus clearSaved() function
 */
export function usePersistedBookingForm() {
    const STORAGE_KEY = 'booking_draft_v3';

    // Get the booking form hook
    const bookingForm = useBookingFormV3();

    // Persist the state with auto-save
    const [, , clearSaved] = usePersistedState(STORAGE_KEY, bookingForm.state, 500);

    // Return the booking form interface plus the clearSaved function
    return {
        ...bookingForm,
        clearSaved
    };
}

export type PersistedBookingForm = ReturnType<typeof usePersistedBookingForm>;
