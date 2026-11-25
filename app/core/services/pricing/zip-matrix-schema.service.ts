import type {
  ZipColumnRole,
  ZipColumnType,
  ZipMatrixColumn,
  ZipMatrixRow,
} from '../../types/tariff';

export type ZipCellValue = string | number | boolean | null;

export const ZIP_MATRIX_MAX_ROWS = 5000;
export const ZIP_CODE_PATTERN = /^\d{5}$/;

export const ZIP_COLUMN_TYPES: ZipColumnType[] = ['text', 'currency', 'integer', 'boolean', 'select'];
export const ZIP_COLUMN_ROLES: ZipColumnRole[] = ['zip', 'price'];

export interface ZipCellIssue {
  columnKey: string;
  message: string;
}

export type CoerceResult =
  | { ok: true; value: ZipCellValue }
  | { ok: false; error: string };

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0']);

/** Default schema for a new zip-matrix tariff: Zip + Price. */
export function createDefaultZipColumns(): ZipMatrixColumn[] {
  return [
    { key: 'zip', label: 'Zip', type: 'text', role: 'zip', required: true, order: 0 },
    { key: 'price', label: 'Price', type: 'currency', role: 'price', required: true, order: 1 },
  ];
}

export function sortColumns(columns: ZipMatrixColumn[]): ZipMatrixColumn[] {
  return [...columns].sort((a, b) => a.order - b.order);
}

function normalizeOrder(columns: ZipMatrixColumn[]): ZipMatrixColumn[] {
  return sortColumns(columns).map((c, i) => ({ ...c, order: i }));
}

/** Unique, stable slug from a header/label. */
export function slugifyColumnKey(label: string, existingKeys: Iterable<string> = []): string {
  const taken = new Set(existingKeys);
  const base =
    String(label ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'column';
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export function getRoleColumn(
  columns: ZipMatrixColumn[] | undefined,
  role: ZipColumnRole
): ZipMatrixColumn | undefined {
  return (columns || []).find((c) => c.role === role);
}

/** Returns a list of human-readable schema problems (empty when valid). */
export function validateSchema(columns: ZipMatrixColumn[] | undefined): string[] {
  const errors: string[] = [];
  const cols = columns || [];
  const zipCols = cols.filter((c) => c.role === 'zip');
  const priceCols = cols.filter((c) => c.role === 'price');
  if (zipCols.length !== 1) {
    errors.push(`Schema must have exactly one zip column (found ${zipCols.length}).`);
  } else if (zipCols[0].type !== 'text' || !zipCols[0].required) {
    errors.push('The zip column must be type "text" and required.');
  }
  if (priceCols.length !== 1) {
    errors.push(`Schema must have exactly one price column (found ${priceCols.length}).`);
  } else if (priceCols[0].type !== 'currency' || !priceCols[0].required) {
    errors.push('The price column must be type "currency" and required.');
  }
  const seen = new Set<string>();
  for (const c of cols) {
    if (!c.key) errors.push('Every column needs a key.');
    else if (seen.has(c.key)) errors.push(`Duplicate column key "${c.key}".`);
    seen.add(c.key);
    if (!String(c.label ?? '').trim()) errors.push(`Column "${c.key}" needs a label.`);
    if (c.type === 'select' && (!c.options || c.options.length === 0)) {
      errors.push(`Select column "${c.label}" needs at least one option.`);
    }
  }
  return errors;
}

function isBlank(raw: unknown): boolean {
  return raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
}

/** Coerces a raw (string or already-typed) value to the column type. Blank → null. */
export function coerceValue(
  type: ZipColumnType,
  raw: unknown,
  options?: string[]
): CoerceResult {
  if (isBlank(raw)) return { ok: true, value: null };
  switch (type) {
    case 'text':
      return { ok: true, value: String(raw).trim() };
    case 'currency': {
      const s = typeof raw === 'number' ? String(raw) : String(raw).replace(/[$,\s]/g, '');
      if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, error: `"${String(raw)}" is not a valid amount` };
      const n = Number(s);
      if (n < 0) return { ok: false, error: `"${String(raw)}" must not be negative` };
      return { ok: true, value: Math.round(n * 100) / 100 };
    }
    case 'integer': {
      const s = typeof raw === 'number' ? String(raw) : String(raw).replace(/[,\s]/g, '');
      if (!/^-?\d+$/.test(s)) return { ok: false, error: `"${String(raw)}" is not a whole number` };
      return { ok: true, value: Number(s) };
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      const s = String(raw).trim().toLowerCase();
      if (TRUE_WORDS.has(s)) return { ok: true, value: true };
      if (FALSE_WORDS.has(s)) return { ok: true, value: false };
      return { ok: false, error: `"${String(raw)}" is not yes/no` };
    }
    case 'select': {
      const s = String(raw).trim().toLowerCase();
      const match = (options || []).find((o) => o.trim().toLowerCase() === s);
      if (!match) return { ok: false, error: `"${String(raw)}" is not one of the allowed options` };
      return { ok: true, value: match };
    }
    default:
      return { ok: false, error: `Unknown column type "${String(type)}"` };
  }
}

/** Coerces every column of a row's raw values; reports required / format / type issues. */
export function coerceRow(
  columns: ZipMatrixColumn[],
  raw: Record<string, unknown>
): { values: Record<string, ZipCellValue>; issues: ZipCellIssue[] } {
  const values: Record<string, ZipCellValue> = {};
  const issues: ZipCellIssue[] = [];
  for (const col of columns) {
    const res = coerceValue(col.type, raw[col.key], col.options);
    if (!res.ok) {
      values[col.key] = null;
      issues.push({ columnKey: col.key, message: `${col.label}: ${res.error}` });
      continue;
    }
    values[col.key] = res.value;
    if (res.value === null) {
      if (col.required) issues.push({ columnKey: col.key, message: `${col.label} is required` });
      continue;
    }
    if (col.role === 'zip' && !ZIP_CODE_PATTERN.test(String(res.value))) {
      issues.push({
        columnKey: col.key,
        message: `${col.label}: "${String(res.value)}" must be exactly 5 digits`,
      });
    }
  }
  return { values, issues };
}

export function validateRow(columns: ZipMatrixColumn[], row: ZipMatrixRow): ZipCellIssue[] {
  return coerceRow(columns, row.values).issues;
}

/** Validates all rows incl. unique zips and the row cap. Returns messages with row ids. */
export function validateRows(
  columns: ZipMatrixColumn[],
  rows: ZipMatrixRow[]
): Array<{ rowId: string; message: string }> {
  const out: Array<{ rowId: string; message: string }> = [];
  if (rows.length > ZIP_MATRIX_MAX_ROWS) {
    out.push({ rowId: '', message: `Matrix exceeds ${ZIP_MATRIX_MAX_ROWS.toLocaleString('en-US')} rows` });
  }
  const zipCol = getRoleColumn(columns, 'zip');
  const seen = new Set<string>();
  for (const row of rows) {
    for (const issue of validateRow(columns, row)) out.push({ rowId: row.id, message: issue.message });
    if (zipCol) {
      const z = row.values[zipCol.key];
      if (z !== null && z !== undefined && z !== '') {
        const k = String(z).trim();
        if (seen.has(k)) out.push({ rowId: row.id, message: `Duplicate zip ${k}` });
        seen.add(k);
      }
    }
  }
  return out;
}

export function formatCellValue(column: ZipMatrixColumn, value: ZipCellValue | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (column.type === 'currency' && typeof value === 'number') return `$${value.toFixed(2)}`;
  if (column.type === 'boolean') return value === true ? 'Yes' : value === false ? 'No' : String(value);
  return String(value);
}

// ---------- Column operations (pure) ----------

export function addColumn(
  columns: ZipMatrixColumn[],
  input: { label: string; type?: ZipColumnType; options?: string[]; required?: boolean }
): ZipMatrixColumn[] {
  const key = slugifyColumnKey(input.label, columns.map((c) => c.key));
  const next: ZipMatrixColumn = {
    key,
    label: input.label.trim() || key,
    type: input.type || 'text',
    required: input.required,
    options: input.type === 'select' ? input.options || [] : undefined,
    order: columns.length,
  };
  return normalizeOrder([...columns, next]);
}

export function renameColumn(
  columns: ZipMatrixColumn[],
  key: string,
  label: string
): ZipMatrixColumn[] {
  return columns.map((c) => (c.key === key ? { ...c, label } : c));
}

/**
 * Updates a column. Assigning a role moves it from any previous holder (which becomes
 * informational) and forces the role's type (zip → text, price → currency) and required.
 */
export function updateColumn(
  columns: ZipMatrixColumn[],
  key: string,
  patch: Partial<Omit<ZipMatrixColumn, 'key'>>
): ZipMatrixColumn[] {
  const roleChange = 'role' in patch ? patch.role : undefined;
  return columns.map((c) => {
    if (c.key === key) {
      const merged: ZipMatrixColumn = { ...c, ...patch };
      if (merged.role === 'zip') Object.assign(merged, { type: 'text', required: true });
      if (merged.role === 'price') Object.assign(merged, { type: 'currency', required: true });
      if (merged.type !== 'select') delete merged.options;
      return merged;
    }
    if (roleChange && c.role === roleChange) {
      const { role: _role, ...rest } = c;
      return { ...rest, required: false };
    }
    return c;
  });
}

/** Moves a column up (-1) or down (+1) in display order. */
export function reorderColumns(
  columns: ZipMatrixColumn[],
  key: string,
  direction: -1 | 1
): ZipMatrixColumn[] {
  const sorted = sortColumns(columns);
  const from = sorted.findIndex((c) => c.key === key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= sorted.length) return normalizeOrder(sorted);
  const copy = [...sorted];
  [copy[from], copy[to]] = [copy[to], copy[from]];
  return normalizeOrder(copy);
}

export function columnHasData(rows: ZipMatrixRow[], key: string): boolean {
  return rows.some((r) => !isBlank(r.values[key]));
}

/** Removes a non-role column and its values. Role columns cannot be removed (returned unchanged). */
export function removeColumn(
  columns: ZipMatrixColumn[],
  rows: ZipMatrixRow[],
  key: string
): { columns: ZipMatrixColumn[]; rows: ZipMatrixRow[] } {
  const target = columns.find((c) => c.key === key);
  if (!target || target.role) return { columns: [...columns], rows: [...rows] };
  return {
    columns: normalizeOrder(columns.filter((c) => c.key !== key)),
    rows: rows.map((r) => {
      const { [key]: _drop, ...values } = r.values;
      return { ...r, values };
    }),
  };
}

// ---------- Row operations (pure) ----------

export function createRowId(zip: string): string {
  return `zip-${zip}`;
}

/** Inserts or replaces a row: matched by id first, otherwise by zip value. */
export function upsertRow(
  columns: ZipMatrixColumn[],
  rows: ZipMatrixRow[],
  row: ZipMatrixRow
): ZipMatrixRow[] {
  const zipCol = getRoleColumn(columns, 'zip');
  let idx = rows.findIndex((r) => r.id === row.id);
  if (idx < 0 && zipCol) {
    const z = String(row.values[zipCol.key] ?? '').trim();
    if (z) idx = rows.findIndex((r) => String(r.values[zipCol.key] ?? '').trim() === z);
  }
  if (idx >= 0) {
    const copy = [...rows];
    copy[idx] = { ...row, id: rows[idx].id };
    return copy;
  }
  return [...rows, row];
}

export function removeRow(rows: ZipMatrixRow[], id: string): ZipMatrixRow[] {
  return rows.filter((r) => r.id !== id);
}
