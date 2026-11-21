import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseWakeLockOptions {
  enabled: boolean;
}

export interface UseWakeLockResult {
  isSupported: boolean;
  isActive: boolean;
  error: string | null;
  requestLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
}

interface ScreenWakeLockSentinel {
  readonly released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
  removeEventListener?: (type: 'release', listener: () => void) => void;
}

/**
 * Pure SSR-safe check for Screen Wake Lock API availability.
 */
export function isWakeLockSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const nav = navigator as Navigator & {
    wakeLock?: { request?: (type: 'screen') => Promise<ScreenWakeLockSentinel> };
  };
  return Boolean(nav.wakeLock && typeof nav.wakeLock.request === 'function');
}

/**
 * Encapsulates the W3C Screen Wake Lock API (`navigator.wakeLock.request('screen')`)
 * with automatic re-acquisition on `visibilitychange` (e.g., when a driver switches back
 * from Google Maps, Apple Maps, or Waze) and graceful SSR/WebView fallback.
 */
export function useWakeLock({ enabled }: UseWakeLockOptions): UseWakeLockResult {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<ScreenWakeLockSentinel | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const enabledRef = useRef<boolean>(enabled);
  const mountedRef = useRef<boolean>(true);

  enabledRef.current = enabled;

  useEffect(() => {
    mountedRef.current = true;
    setIsSupported(isWakeLockSupported());
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const releaseLock = useCallback(async (): Promise<void> => {
    const current = sentinelRef.current;
    sentinelRef.current = null;
    if (current && !current.released) {
      try {
        await current.release();
      } catch {
        // Ignore benign release errors when OS already released sentinel
      }
    }
    if (mountedRef.current) {
      setIsActive(false);
    }
  }, []);

  const requestLock = useCallback(async (): Promise<boolean> => {
    if (!isWakeLockSupported()) {
      if (mountedRef.current) {
        setIsSupported(false);
        setIsActive(false);
      }
      return false;
    }

    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      // Browsers reject wakeLock.request() while hidden; visibilitychange will acquire on return
      return false;
    }

    if (sentinelRef.current && !sentinelRef.current.released) {
      if (mountedRef.current) {
        setIsActive(true);
        setError(null);
      }
      return true;
    }

    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const requestPromise = (async (): Promise<boolean> => {
      try {
        const nav = navigator as Navigator & {
          wakeLock: { request: (type: 'screen') => Promise<ScreenWakeLockSentinel> };
        };
        const sentinel = await nav.wakeLock.request('screen');

        // Guard against race if component unmounted or `enabled` flipped false mid-flight
        if (!mountedRef.current || !enabledRef.current) {
          await sentinel.release().catch(() => {});
          if (mountedRef.current) {
            setIsActive(false);
          }
          return false;
        }

        const handleSentinelRelease = () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
          }
          if (mountedRef.current) {
            setIsActive(false);
          }
        };

        if (typeof sentinel.addEventListener === 'function') {
          sentinel.addEventListener('release', handleSentinelRelease);
        }

        sentinelRef.current = sentinel;
        if (mountedRef.current) {
          setIsSupported(true);
          setIsActive(true);
          setError(null);
        }
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (mountedRef.current) {
          setIsActive(false);
          setError(msg);
        }
        return false;
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = requestPromise;
    return requestPromise;
  }, []);

  // Acquire or release whenever `enabled` changes, and release on unmount
  useEffect(() => {
    if (enabled) {
      void requestLock();
    } else {
      setError(null);
      void releaseLock();
    }

    return () => {
      if (!enabledRef.current) {
        void releaseLock();
      }
    };
  }, [enabled, requestLock, releaseLock]);

  // Re-acquire lock automatically when returning from external navigation apps (Maps / Waze)
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && enabledRef.current) {
        void requestLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      void releaseLock();
    };
  }, [requestLock, releaseLock]);

  return {
    isSupported,
    isActive,
    error,
    requestLock,
    releaseLock,
  };
}
