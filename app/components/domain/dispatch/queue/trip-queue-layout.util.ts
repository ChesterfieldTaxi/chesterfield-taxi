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
 * Baseline minimum Trips Queue outer width (in CSS pixels) required to render
 * the 10-column Table layout (`min-w-[1020px]` + vertical scrollbar) without
 * horizontal clipping. When rendered rows contain wider controls (e.g. `Auto-Offer`,
 * `SLA`, or `Review` actions pushing `table.scrollWidth` to ~1180–1280px), live DOM
 * `scrollWidth > clientWidth` detection escalates `requiredTableWidthPx` dynamically.
 */
export const TABLE_OVERFLOW_MIN_WIDTH_PX = 1040;
export const TABLE_OVERFLOW_HYSTERESIS_PX = 8;

export const CARD_GRID_TWO_COL_MIN_PX = 580;
export const CARD_GRID_THREE_COL_MIN_PX = 900;
export const CARD_GRID_FOUR_COL_MIN_PX = 1220;

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

export interface ResolveEffectiveQueueLayoutParams {
  displayLayout: DisplayLayout;
  isDesktop: boolean;
  queueWidthPx: number;
  requiredTableWidthPx?: number;
}

export interface ResolvedEffectiveQueueLayout {
  effectiveDisplayLayout: DisplayLayout;
  isAutoCardsFallback: boolean;
  effectiveMinTableWidthPx: number;
}

/**
 * Pure, SSR-deterministic resolver for the active Trips Queue presentation mode.
 * Never mutates the operator's saved `displayLayout` preference.
 *
 * - Mobile (`!isDesktop`) always uses `'cards'` (`isAutoCardsFallback = false`).
 * - Desktop `'table'` with measured `0 < queueWidthPx < effectiveMinTableWidthPx`
 *   (where `effectiveMinTableWidthPx = max(1040, requiredTableWidthPx)`) switches
 *   non-destructively to `'cards'` (`isAutoCardsFallback = true`), and automatically
 *   restores `'table'` once `queueWidthPx >= effectiveMinTableWidthPx`.
 * - Desktop `'cards'` and `'compact'` pass through unchanged.
 */
export function resolveEffectiveQueueDisplayLayout({
  displayLayout,
  isDesktop,
  queueWidthPx,
  requiredTableWidthPx,
}: ResolveEffectiveQueueLayoutParams): ResolvedEffectiveQueueLayout {
  const effectiveMinTableWidthPx = Math.max(
    TABLE_OVERFLOW_MIN_WIDTH_PX,
    typeof requiredTableWidthPx === 'number' &&
      Number.isFinite(requiredTableWidthPx) &&
      requiredTableWidthPx > 0
      ? Math.ceil(requiredTableWidthPx)
      : TABLE_OVERFLOW_MIN_WIDTH_PX
  );

  if (!isDesktop) {
    return {
      effectiveDisplayLayout: 'cards',
      isAutoCardsFallback: false,
      effectiveMinTableWidthPx,
    };
  }

  if (
    displayLayout === 'table' &&
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

  const handleTableOverflowDetected = useCallback((overflowDeltaPx: number) => {
    if (!Number.isFinite(overflowDeltaPx) || overflowDeltaPx <= 1) return;
    const liveOuterWidth = Math.round(
      queueContainerRef.current?.getBoundingClientRect().width || queueWidthRef.current
    );
    if (liveOuterWidth <= 0) return;

    const neededOuterWidth = Math.ceil(
      liveOuterWidth + overflowDeltaPx + TABLE_OVERFLOW_HYSTERESIS_PX
    );
    setRequiredTableWidthPx((prev) => (neededOuterWidth > prev ? neededOuterWidth : prev));
  }, []);

  const resolved = resolveEffectiveQueueDisplayLayout({
    displayLayout,
    isDesktop,
    queueWidthPx,
    requiredTableWidthPx,
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
      return '[Avail]';
    case 'en_route':
      return '[En Route]';
    case 'busy':
      return '[Busy]';
    case 'break':
      return '[Break]';
    default:
      return '[Off]';
  }
}
