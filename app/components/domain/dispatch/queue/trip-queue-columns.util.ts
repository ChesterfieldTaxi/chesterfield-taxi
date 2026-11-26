import type {
  QueueColumnSortState,
  QueueSortColumn,
} from '../../../../core/hooks/dispatch/dispatch-workspace.util';

export type TripQueueColumnKey =
  | 'trip_id'
  | 'date_time'
  | 'passenger'
  | 'pickup'
  | 'dropoff'
  | 'driver'
  | 'vehicle'
  | 'price'
  | 'payment'
  | 'status'
  | 'action';

export type TripQueueColumnPresetKey = 'full_desk' | 'standard' | 'compact_dock';

export const DISPATCH_QUEUE_COLUMNS_STORAGE_KEY = 'ct_dispatch_table_columns_v1';
export const DISPATCH_QUEUE_COLUMNS_SYNC_EVENT = 'ct:dispatch-table-columns-sync';
export const QUEUE_CHECKBOX_COLUMN_WIDTH_PX = 32;

export interface TripQueueColumnDefinition {
  key: TripQueueColumnKey;
  headerLabel: string;
  menuLabel: string;
  minWidthPx: number;
  sortColumn: Exclude<QueueSortColumn, 'smart'> | null;
  isPinned: boolean;
}

export const TRIP_QUEUE_COLUMN_DEFINITIONS: ReadonlyArray<TripQueueColumnDefinition> = [
  { key: 'trip_id', headerLabel: 'TRIP #', menuLabel: 'Trip #', minWidthPx: 76, sortColumn: 'trip_id', isPinned: false },
  { key: 'date_time', headerLabel: 'DATE/TIME', menuLabel: 'Date / Time', minWidthPx: 96, sortColumn: 'date', isPinned: false },
  { key: 'passenger', headerLabel: 'PASSENGER', menuLabel: 'Passenger', minWidthPx: 114, sortColumn: 'passenger', isPinned: false },
  { key: 'pickup', headerLabel: 'PICKUP', menuLabel: 'Pickup', minWidthPx: 130, sortColumn: 'pickup', isPinned: false },
  { key: 'dropoff', headerLabel: 'DROPOFF', menuLabel: 'Dropoff', minWidthPx: 130, sortColumn: 'dropoff', isPinned: false },
  { key: 'driver', headerLabel: 'DRIVER', menuLabel: 'Driver', minWidthPx: 138, sortColumn: 'driver', isPinned: false },
  { key: 'vehicle', headerLabel: 'VEHICLE', menuLabel: 'Vehicle', minWidthPx: 78, sortColumn: 'vehicle', isPinned: false },
  { key: 'price', headerLabel: 'PRICE', menuLabel: 'Price', minWidthPx: 58, sortColumn: 'price', isPinned: false },
  { key: 'payment', headerLabel: 'PAYMENT', menuLabel: 'Payment', minWidthPx: 70, sortColumn: 'payment', isPinned: false },
  { key: 'status', headerLabel: 'STATUS', menuLabel: 'Status', minWidthPx: 48, sortColumn: 'status', isPinned: false },
  { key: 'action', headerLabel: 'ACTION', menuLabel: 'Action', minWidthPx: 86, sortColumn: null, isPinned: true },
];

export const ALL_QUEUE_COLUMN_KEYS: ReadonlyArray<TripQueueColumnKey> =
  TRIP_QUEUE_COLUMN_DEFINITIONS.map((d) => d.key);

const VALID_COLUMN_KEY_SET = new Set<string>(ALL_QUEUE_COLUMN_KEYS);
const COLUMN_WIDTH_BY_KEY = new Map<TripQueueColumnKey, number>(
  TRIP_QUEUE_COLUMN_DEFINITIONS.map((d) => [d.key, d.minWidthPx])
);

export const DEFAULT_QUEUE_COLUMNS: ReadonlyArray<TripQueueColumnKey> = [
  'date_time',
  'passenger',
  'pickup',
  'dropoff',
  'driver',
  'vehicle',
  'price',
  'status',
  'action',
];

export const FULL_DESK_QUEUE_COLUMNS: ReadonlyArray<TripQueueColumnKey> = [
  'trip_id',
  'date_time',
  'passenger',
  'pickup',
  'dropoff',
  'driver',
  'vehicle',
  'price',
  'payment',
  'status',
  'action',
];

export const COMPACT_DOCK_QUEUE_COLUMNS: ReadonlyArray<TripQueueColumnKey> = [
  'date_time',
  'passenger',
  'pickup',
  'dropoff',
  'driver',
  'status',
  'action',
];

export const TRIP_QUEUE_COLUMN_PRESETS: ReadonlyArray<{
  key: TripQueueColumnPresetKey;
  label: string;
  columns: ReadonlyArray<TripQueueColumnKey>;
}> = [
  { key: 'full_desk', label: 'Full Desk', columns: FULL_DESK_QUEUE_COLUMNS },
  { key: 'standard', label: 'Standard', columns: DEFAULT_QUEUE_COLUMNS },
  { key: 'compact_dock', label: 'Compact Dock', columns: COMPACT_DOCK_QUEUE_COLUMNS },
];

export function normalizeQueueColumns(
  cols: readonly string[] | null | undefined
): TripQueueColumnKey[] {
  if (!Array.isArray(cols) || cols.length === 0) {
    return [...DEFAULT_QUEUE_COLUMNS];
  }
  const inputSet = new Set(
    cols.map((c) => String(c || '').trim()).filter((c) => VALID_COLUMN_KEY_SET.has(c))
  );
  inputSet.add('action');
  const ordered = ALL_QUEUE_COLUMN_KEYS.filter((k) => inputSet.has(k));
  const nonActionCount = ordered.filter((k) => k !== 'action').length;
  if (nonActionCount === 0) {
    return [...DEFAULT_QUEUE_COLUMNS];
  }
  return ordered;
}

export function parseStoredQueueColumns(raw: string | null | undefined): TripQueueColumnKey[] {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [...DEFAULT_QUEUE_COLUMNS];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const valid = parsed
          .map((item) => String(item || '').trim())
          .filter((item) => VALID_COLUMN_KEY_SET.has(item));
        if (valid.some((k) => k !== 'action')) {
          return normalizeQueueColumns(valid);
        }
      }
      return [...DEFAULT_QUEUE_COLUMNS];
    } catch {
      return [...DEFAULT_QUEUE_COLUMNS];
    }
  }

  const tokens = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => VALID_COLUMN_KEY_SET.has(s));
  if (!tokens.some((k) => k !== 'action')) {
    return [...DEFAULT_QUEUE_COLUMNS];
  }
  return normalizeQueueColumns(tokens);
}

export function serializeQueueColumns(cols: readonly TripQueueColumnKey[]): string {
  return JSON.stringify(normalizeQueueColumns(cols));
}

export function toggleQueueColumnSelection(
  current: readonly TripQueueColumnKey[],
  targetKey: TripQueueColumnKey
): TripQueueColumnKey[] {
  const normalized = normalizeQueueColumns(current);
  if (targetKey === 'action') return normalized;
  if (normalized.includes(targetKey)) {
    const nonActionCount = normalized.filter((k) => k !== 'action').length;
    if (nonActionCount <= 1) return normalized;
    return normalizeQueueColumns(normalized.filter((k) => k !== targetKey));
  }
  return normalizeQueueColumns([...normalized, targetKey]);
}

export function areQueueColumnsEqual(
  a: readonly TripQueueColumnKey[],
  b: readonly TripQueueColumnKey[]
): boolean {
  const normA = normalizeQueueColumns(a);
  const normB = normalizeQueueColumns(b);
  return normA.length === normB.length && normA.every((col, idx) => col === normB[idx]);
}

export function resolveActiveQueueColumnPreset(
  cols: readonly TripQueueColumnKey[]
): TripQueueColumnPresetKey | null {
  for (const preset of TRIP_QUEUE_COLUMN_PRESETS) {
    if (areQueueColumnsEqual(cols, preset.columns)) return preset.key;
  }
  return null;
}

export function computeQueueTableMinWidthPx(cols: readonly TripQueueColumnKey[]): number {
  const normalized = normalizeQueueColumns(cols);
  let total = QUEUE_CHECKBOX_COLUMN_WIDTH_PX;
  for (const key of normalized) {
    total += COLUMN_WIDTH_BY_KEY.get(key) ?? 72;
  }
  return total;
}

export function formatQueuePaymentBadgeMeta(method?: string | null): {
  label: string;
  badgeClass: string;
} {
  const clean = String(method || 'cash').trim().toLowerCase();
  if (clean === 'card') {
    return { label: 'Card', badgeClass: 'bg-status-info-bg text-status-info-fg border-status-info-border' };
  }
  if (clean === 'account' || clean === 'corporate') {
    return { label: 'Account', badgeClass: 'bg-status-staged-bg text-status-staged-fg border-status-staged-border' };
  }
  return { label: 'Cash', badgeClass: 'bg-status-success-bg text-status-success-fg border-status-success-border' };
}

export function getColumnSortTooltip(
  headerLabel: string,
  sortColumn: Exclude<QueueSortColumn, 'smart'>,
  currentSort: QueueColumnSortState
): string {
  if (sortColumn === 'date' && currentSort.column === 'smart') {
    return 'Smart Operational Order (Open ASAP & Soonest Scheduled first, Closed below) — click for Oldest → Newest';
  }
  if (currentSort.column !== sortColumn) {
    return `Sort by ${headerLabel} (Ascending)`;
  }
  return currentSort.direction === 'asc'
    ? `Sorted by ${headerLabel} (Ascending) — click for Descending`
    : `Sorted by ${headerLabel} (Descending) — click to restore Live Smart Order`;
}
