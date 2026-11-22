import type { DisplayLayout } from '../../../../core/hooks/useDisplayLayout';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';

export type QueueFilterType =
  | 'driver'
  | 'vehicle'
  | 'company'
  | 'payment_type'
  | 'tariff'
  | 'has_car_seat';

/**
 * Minimum Trips Queue container width (in CSS pixels) required to render the
 * 10-column dense Table layout without horizontal clipping or cramped cells.
 * Below this width on desktop, `'table'` non-destructively falls back to `'cards'`
 * and automatically restores `'table'` once the container widens >= 860px.
 */
export const TABLE_OVERFLOW_MIN_WIDTH_PX = 860;

export const CARD_GRID_TWO_COL_MIN_PX = 580;
export const CARD_GRID_THREE_COL_MIN_PX = 900;
export const CARD_GRID_FOUR_COL_MIN_PX = 1220;

export interface ResolveEffectiveQueueLayoutParams {
  displayLayout: DisplayLayout;
  isDesktop: boolean;
  queueWidthPx: number;
}

export interface ResolvedEffectiveQueueLayout {
  effectiveDisplayLayout: DisplayLayout;
  isAutoCardsFallback: boolean;
}

/**
 * Pure, SSR-deterministic resolver for the active Trips Queue presentation mode.
 * Never mutates the operator's saved `displayLayout` preference.
 *
 * - Mobile (`!isDesktop`) always uses `'cards'` (`isAutoCardsFallback = false`).
 * - Desktop `'table'` with measured `0 < queueWidthPx < 860` switches to `'cards'`
 *   with `isAutoCardsFallback = true`, and automatically returns `'table'` once
 *   `queueWidthPx >= 860` (or `queueWidthPx <= 0` prior to client measurement).
 * - Desktop `'cards'` and `'compact'` pass through unchanged.
 */
export function resolveEffectiveQueueDisplayLayout({
  displayLayout,
  isDesktop,
  queueWidthPx,
}: ResolveEffectiveQueueLayoutParams): ResolvedEffectiveQueueLayout {
  if (!isDesktop) {
    return {
      effectiveDisplayLayout: 'cards',
      isAutoCardsFallback: false,
    };
  }

  if (
    displayLayout === 'table' &&
    Number.isFinite(queueWidthPx) &&
    queueWidthPx > 0 &&
    queueWidthPx < TABLE_OVERFLOW_MIN_WIDTH_PX
  ) {
    return {
      effectiveDisplayLayout: 'cards',
      isAutoCardsFallback: true,
    };
  }

  return {
    effectiveDisplayLayout: displayLayout,
    isAutoCardsFallback: false,
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
