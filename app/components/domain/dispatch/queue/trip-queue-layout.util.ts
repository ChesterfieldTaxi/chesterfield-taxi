import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { DisplayLayout } from '../../../../core/hooks/useDisplayLayout';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';

export type QueueFilterType =
  | 'driver'
  | 'vehicle'
  | 'company'
  | 'payment_type'
  | 'tariff'
  | 'has_car_seat'
  | 'has_stops'
  | 'has_staged_driver';

/**
 * Baseline minimum Trips Queue outer width (in CSS pixels) required in `'auto'` mode
 * to render the compact 10-column Table layout (`min-w-[900px]` + vertical scrollbar)
 * without horizontal clipping. When `'auto'` mode is active and rendered rows contain
 * wider controls pushing `table.scrollWidth` above `clientWidth`, live DOM detection
 * escalates `requiredTableWidthPx` dynamically.
 */
export const TABLE_OVERFLOW_MIN_WIDTH_PX = 920;
export const TABLE_OVERFLOW_HYSTERESIS_PX = 8;

export const CARD_GRID_TWO_COL_MIN_PX = 580;
export const CARD_GRID_THREE_COL_MIN_PX = 900;
export const CARD_GRID_FOUR_COL_MIN_PX = 1220;

export type EffectiveQueueDisplayLayout = Exclude<DisplayLayout, 'auto'>;

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

export interface ResolveEffectiveQueueLayoutParams {
  displayLayout: DisplayLayout;
  isDesktop: boolean;
  queueWidthPx: number;
  requiredTableWidthPx?: number;
  baseMinTableWidthPx?: number;
}

export interface ResolvedEffectiveQueueLayout {
  effectiveDisplayLayout: EffectiveQueueDisplayLayout;
  isAutoCardsFallback: boolean;
  effectiveMinTableWidthPx: number;
}

/**
 * Pure, SSR-deterministic resolver for the active Trips Queue presentation mode.
 * Never mutates the operator's saved `displayLayout` preference.
 *
 * - Mobile (`!isDesktop`) always uses `'cards'` (`isAutoCardsFallback = false`).
 * - Desktop explicit `'table'` ALWAYS returns `'table'` (`isAutoCardsFallback = false`)
 *   regardless of `queueWidthPx` or `requiredTableWidthPx`, giving operators 100% manual
 *   control with clean horizontal scrolling on narrow panes.
 * - Desktop `'auto'` performs responsive overflow switching: renders `'table'`
 *   (`isAutoCardsFallback = false`) when `queueWidthPx === 0 || queueWidthPx >= effectiveMinTableWidthPx`,
 *   and switches to `'cards'` (`isAutoCardsFallback = true`) when
 *   `0 < queueWidthPx < effectiveMinTableWidthPx`.
 * - Desktop `'cards'` and `'compact'` pass through unchanged.
 */
export function resolveEffectiveQueueDisplayLayout({
  displayLayout,
  isDesktop,
  queueWidthPx,
  requiredTableWidthPx,
  baseMinTableWidthPx,
}: ResolveEffectiveQueueLayoutParams): ResolvedEffectiveQueueLayout {
  const baselineFloorPx =
    typeof baseMinTableWidthPx === 'number' &&
    Number.isFinite(baseMinTableWidthPx) &&
    baseMinTableWidthPx > 0
      ? Math.ceil(baseMinTableWidthPx)
      : TABLE_OVERFLOW_MIN_WIDTH_PX;

  const effectiveMinTableWidthPx = Math.max(
    baselineFloorPx,
    typeof requiredTableWidthPx === 'number' &&
      Number.isFinite(requiredTableWidthPx) &&
      requiredTableWidthPx > 0
      ? Math.ceil(requiredTableWidthPx)
      : baselineFloorPx
  );

  if (!isDesktop) {
    return {
      effectiveDisplayLayout: 'cards',
      isAutoCardsFallback: false,
      effectiveMinTableWidthPx,
    };
  }

  if (displayLayout === 'table') {
    return {
      effectiveDisplayLayout: 'table',
      isAutoCardsFallback: false,
      effectiveMinTableWidthPx,
    };
  }

  if (displayLayout === 'auto') {
    if (
      Number.isFinite(queueWidthPx) &&
      queueWidthPx > 0 &&
      queueWidthPx < effectiveMinTableWidthPx
    ) {
      return {
        effectiveDisplayLayout: 'cards',
        isAutoCardsFallback: true,
        effectiveMinTableWidthPx,
      };
    }
    return {
      effectiveDisplayLayout: 'table',
      isAutoCardsFallback: false,
      effectiveMinTableWidthPx,
    };
  }

  return {
    effectiveDisplayLayout: displayLayout,
    isAutoCardsFallback: false,
    effectiveMinTableWidthPx,
  };
}

/**
 * Pure container-width column calculator for `TripQueueCardsGrid`:
 * - `< 580px`     -> 1 column
 * - `580–899px`   -> 2 columns
 * - `900–1219px`  -> 3 columns
 * - `>= 1220px`   -> 4 columns
 */
export function computeResponsiveTripCardColumns(queueWidthPx: number): 1 | 2 | 3 | 4 {
  if (!Number.isFinite(queueWidthPx) || queueWidthPx < CARD_GRID_TWO_COL_MIN_PX) {
    return 1;
  }
  if (queueWidthPx < CARD_GRID_THREE_COL_MIN_PX) {
    return 2;
  }
  if (queueWidthPx < CARD_GRID_FOUR_COL_MIN_PX) {
    return 3;
  }
  return 4;
}

export interface UseResponsiveQueueLayoutOptions {
  displayLayout: DisplayLayout;
  isDesktop: boolean;
  activeMobileTab: string;
  filterSignature: string;
  baseMinTableWidthPx?: number;
}

export interface UseResponsiveQueueLayoutResult extends ResolvedEffectiveQueueLayout {
  queueContainerRef: React.RefObject<HTMLDivElement | null>;
  queueWidthPx: number;
  handleTableOverflowDetected: (overflowDeltaPx: number) => void;
}

/**
 * Combines ResizeObserver container width tracking with live `<table>` horizontal
 * overflow detection (`scrollWidth - clientWidth > 1`) + hysteresis (`+8px`) so
 * the Trips Queue switches from Table -> Cards at the exact pixel the table would
 * horizontally overflow, without oscillation or visual flash.
 */
export function useResponsiveQueueLayout({
  displayLayout,
  isDesktop,
  activeMobileTab,
  filterSignature,
  baseMinTableWidthPx,
}: UseResponsiveQueueLayoutOptions): UseResponsiveQueueLayoutResult {
  const queueContainerRef = useRef<HTMLDivElement | null>(null);
  const queueWidthRef = useRef<number>(0);

  // Deterministic SSR initial state (0 = pre-measurement)
  const [queueWidthPx, setQueueWidthPx] = useState<number>(0);
  const [requiredTableWidthPx, setRequiredTableWidthPx] = useState<number>(0);

  useIsomorphicLayoutEffect(() => {
    const el = queueContainerRef.current;
    if (!el || typeof window === 'undefined') return;

    const commitMeasuredWidth = (rawWidth: number) => {
      const rounded = Math.round(rawWidth);
      if (rounded > 0) {
        queueWidthRef.current = rounded;
        setQueueWidthPx((prev) => (prev === rounded ? prev : rounded));
      }
    };

    const initialRect = el.getBoundingClientRect();
    if (initialRect.width > 0) {
      commitMeasuredWidth(initialRect.width);
    }

    if (typeof ResizeObserver === 'undefined') {
      const handleWindowResize = () => commitMeasuredWidth(el.getBoundingClientRect().width);
      window.addEventListener('resize', handleWindowResize);
      return () => window.removeEventListener('resize', handleWindowResize);
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect?.width || el.getBoundingClientRect().width;
        commitMeasuredWidth(width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isDesktop, activeMobileTab]);

  // Reset dynamic escalation when user changes saved layout or deliberate filter set
  useEffect(() => {
    setRequiredTableWidthPx(0);
  }, [displayLayout, filterSignature]);

  const handleTableOverflowDetected = useCallback(
    (overflowDeltaPx: number) => {
      if (displayLayout !== 'auto') return;
      if (!Number.isFinite(overflowDeltaPx) || overflowDeltaPx <= 1) return;
      const liveOuterWidth = Math.round(
        queueContainerRef.current?.getBoundingClientRect().width || queueWidthRef.current
      );
      if (liveOuterWidth <= 0) return;

      const neededOuterWidth = Math.ceil(
        liveOuterWidth + overflowDeltaPx + TABLE_OVERFLOW_HYSTERESIS_PX
      );
      setRequiredTableWidthPx((prev) => (neededOuterWidth > prev ? neededOuterWidth : prev));
    },
    [displayLayout]
  );

  const resolved = resolveEffectiveQueueDisplayLayout({
    displayLayout,
    isDesktop,
    queueWidthPx,
    requiredTableWidthPx,
    baseMinTableWidthPx,
  });

  return {
    ...resolved,
    queueContainerRef,
    queueWidthPx,
    handleTableOverflowDetected,
  };
}

export function getDriverDropdownDot(driver: LiveFleetDriver): string {
  switch (driver.mapStatus) {
    case 'available':
      return 'Available';
    case 'en_route':
      return 'En Route';
    case 'busy':
      return 'Busy';
    case 'break':
      return 'Break';
    default:
      return 'Offline';
  }
}

export interface TwoLineAddressParts {
  primary: string;
  secondary: string | null;
}

/**
 * Splits a street/venue address cleanly for a 2-line Trips Table cell:
 * - Strips redundant trailing ", USA" / ", United States".
 * - When a comma exists, places Street/Venue on line 1 and City/State/ZIP on line 2.
 * - When comma-less, returns `{ primary, secondary: null }` for natural 2-line word wrapping (`line-clamp-2`).
 */
export function splitAddressForTwoLineCell(address?: string | null): TwoLineAddressParts {
  const cleaned = String(address || '')
    .trim()
    .replace(/,\s*(USA|United States)\s*$/i, '')
    .trim();

  if (!cleaned) {
    return { primary: '—', secondary: null };
  }

  const firstCommaIdx = cleaned.indexOf(',');
  if (firstCommaIdx > 0 && firstCommaIdx < cleaned.length - 1) {
    const primary = cleaned.slice(0, firstCommaIdx).trim();
    const secondary = cleaned.slice(firstCommaIdx + 1).trim();
    if (primary && secondary) {
      return { primary, secondary };
    }
  }

  return { primary: cleaned, secondary: null };
}
