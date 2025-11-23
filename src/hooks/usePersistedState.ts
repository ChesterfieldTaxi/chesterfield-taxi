import { useState, useEffect, Dispatch, SetStateAction } from 'react';

/**
 * Custom hook that persists state to localStorage with automatic save/restore
 * 
 * @param key - localStorage key to store the state under
 * @param initialValue - Default value if no stored value exists
 * @param debounceMs - Milliseconds to wait before saving (default: 500ms)
 * @returns [state, setState, clearSaved] tuple
 * 
 * @example
 * const [formData, setFormData, clearFormData] = usePersistedState('booking_draft', initialState, 500);
 */
export function usePersistedState<T>(
    key: string,
    initialValue: T,
    debounceMs = 500
): [T, Dispatch<SetStateAction<T>>, () => void] {
    // Get initial value from localStorage or use default
    const [state, setState] = useState<T>(() => {
        try {
            const saved = localStorage.getItem(key);
            if (saved) {
                const parsed = JSON.parse(saved);
                console.log(`[usePersistedState] Restored state from localStorage key: "${key}"`);
                return parsed;
            }
        } catch (error) {
            console.warn(`[usePersistedState] Failed to parse saved state for key "${key}":`, error);
        }
        return initialValue;
    });

    // Auto-save to localStorage on state change (debounced)
    useEffect(() => {
        const timer = setTimeout(() => {
            try {
                const serialized = JSON.stringify(state);
                localStorage.setItem(key, serialized);
                console.log(`[usePersistedState] Auto-saved state to localStorage key: "${key}"`);
            } catch (error) {
                console.error(`[usePersistedState] Failed to save state for key "${key}":`, error);

                // Handle quota exceeded error
                if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                    console.error('[usePersistedState] localStorage quota exceeded. Clearing old data...');
                    // Optionally clear the key to prevent data loss
                    localStorage.removeItem(key);
                }
            }
        }, debounceMs);

        return () => clearTimeout(timer);
    }, [key, state, debounceMs]);

    // Function to manually clear saved state
    const clearSaved = () => {
        try {
            localStorage.removeItem(key);
            console.log(`[usePersistedState] Cleared saved state for key: "${key}"`);
        } catch (error) {
            console.error(`[usePersistedState] Failed to clear saved state for key "${key}":`, error);
        }
    };

    return [state, setState, clearSaved];
}
