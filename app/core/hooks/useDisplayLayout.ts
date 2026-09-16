import { useState, useEffect, useCallback } from 'react';

export type DisplayLayout = 'cards' | 'table' | 'compact';

export interface UseDisplayLayoutOptions {
  storageKey?: string;
  defaultLayout?: DisplayLayout;
  mobileBreakpoint?: number; // default 768px
}

/**
 * Hook for managing layout presentation (cards vs table vs compact list).
 * - Persists operator preference in localStorage
 * - Automatically defaults to 'cards' on viewports narrower than mobileBreakpoint (< 768px)
 *   unless explicitly overridden by the operator.
 */
export function useDisplayLayout(
  storageKey: string = 'ct_display_layout',
  defaultLayout: DisplayLayout = 'table',
  mobileBreakpoint: number = 768
): [DisplayLayout, (mode: DisplayLayout) => void] {
  const [layout, setLayoutState] = useState<DisplayLayout>(() => {
    if (typeof window === 'undefined') {
      return defaultLayout;
    }

    try {
      const stored = localStorage.getItem(storageKey) as DisplayLayout | null;
      if (stored && (stored === 'cards' || stored === 'table' || stored === 'compact')) {
        return stored;
      }
    } catch {
      // Ignore storage errors
    }

    // Default to 'cards' on mobile viewports (< 768px), otherwise provided default
    if (window.innerWidth < mobileBreakpoint) {
      return 'cards';
    }

    return defaultLayout;
  });

  const setLayout = useCallback(
    (newLayout: DisplayLayout) => {
      setLayoutState(newLayout);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, newLayout);
        } catch {
          // Ignore storage errors
        }
      }
    },
    [storageKey]
  );

  return [layout, setLayout];
}
