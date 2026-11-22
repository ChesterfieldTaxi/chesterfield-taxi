import { useState, useEffect, useCallback } from 'react';

export type DisplayLayout = 'cards' | 'table' | 'compact';

export interface UseDisplayLayoutOptions {
  storageKey?: string;
  defaultLayout?: DisplayLayout;
  mobileBreakpoint?: number; // default 768px
}

/**
 * Hook for managing layout presentation (cards vs table vs compact list).
 * - Initializes deterministically to `defaultLayout` for React 19 SSR hydration parity.
 * - Restores persisted operator preference from `localStorage` (or mobile viewport fallback) post-mount.
 */
export function useDisplayLayout(
  storageKey: string = 'ct_display_layout',
  defaultLayout: DisplayLayout = 'table',
  mobileBreakpoint: number = 768
): [DisplayLayout, (mode: DisplayLayout) => void] {
  const [layout, setLayoutState] = useState<DisplayLayout>(defaultLayout);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(storageKey) as DisplayLayout | null;
      if (stored && (stored === 'cards' || stored === 'table' || stored === 'compact')) {
        setLayoutState(stored);
        return;
      }
    } catch {
      // Ignore storage errors
    }

    if (window.innerWidth < mobileBreakpoint) {
      setLayoutState('cards');
    } else {
      setLayoutState(defaultLayout);
    }
  }, [storageKey, defaultLayout, mobileBreakpoint]);

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
