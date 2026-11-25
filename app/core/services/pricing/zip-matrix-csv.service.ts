import type {
  ZipColumnRole,
  ZipColumnType,
  ZipMatrixColumn,
  ZipMatrixRow,
} from '../../types/tariff';
import {
  ZIP_MATRIX_MAX_ROWS,
  coerceRow,
  createRowId,
  getRoleColumn,
  slugifyColumnKey,
  sortColumns,
  validateSchema,
  type ZipCellValue,
} from './zip-matrix-schema.service';

export type ImportMode = 'replace' | 'upsert';

export interface ImportMappingEntry {
  csvIndex: number;
  header: string;
  action: 'new' | 'existing' | 'skip';
  /** For action 'existing': the key of the existing column. */
  existingKey?: string;
  /** For action 'new': the proposed column definition. */
  column?: ZipMatrixColumn;
}

export type ImportMapping = ImportMappingEntry[];

export interface ImportError {
  line: number; // 1-based line (record) number in the file; 0 = file/schema level
  column?: string;
  message: string;
}

export interface ImportSummary {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  invalid: number;
}

export interface ImportPreview {
  columns: ZipMatrixColumn[];
  rows: ZipMatrixRow[];
  errors: ImportError[];
  summary: ImportSummary;
  /** False when schema/cap errors make the import unsafe to apply. */
  canApply: boolean;
}

export interface ImportArgs {
  csvText: string;
  mapping: ImportMapping;
  existingColumns: ZipMatrixColumn[];
  existingRows: ZipMatrixRow[];
  mode: ImportMode;
}

// ---------- RFC 4180 parser ----------

/** Parses CSV text into records. Handles BOM, quotes, escaped quotes, embedded commas/newlines, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i++;
    } else if (ch === ',') {
      endField();
      i++;
    } else if (ch === '\r') {
      endRecord();
      i += src[i + 1] === '\n' ? 2 : 1;
    } else if (ch === '\n') {
      endRecord();
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== '' || record.length > 0) endRecord();
  // Drop blank records (blank lines, trailing blank line)
  return records.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

// ---------- Inference ----------

const ZIP_HEADER = /zip|postal/i;
const PRICE_HEADER = /price|charge|fare|rate|flat|amount/i;
const BOOLEAN_WORDS = new Set(['yes', 'no', 'true', 'false', 'y', 'n', '1', '0']);

export function inferColumnType(samples: string[]): ZipColumnType {
  const vals = samples.map((s) => s.trim()).filter((s) => s !== '');
  if (vals.length === 0) return 'text';
  const money = /^\$?\s*-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
  if (vals.every((v) => money.test(v))) {
    if (vals.some((v) => v.includes('$') || v.includes('.'))) return 'currency';
  }
  if (vals.every((v) => BOOLEAN_WORDS.has(v.toLowerCase()))) return 'boolean';
  if (vals.every((v) => /^-?\d+$/.test(v))) return 'integer';
  if (vals.every((v) => money.test(v))) return 'currency';
  return 'text';
}

/**
 * Proposes a mapping for each CSV header. Headers matching an existing column label are mapped
 * onto it; others become new columns with inferred type/role (first match only per role).
 */
export function inferColumns(
  headers: string[],
  sampleRows: string[][],
  existingColumns: ZipMatrixColumn[] = []
): ImportMapping {
  const usedKeys = new Set(existingColumns.map((c) => c.key));
  const claimedExisting = new Set<string>();
  const roleTaken: Record<ZipColumnRole, boolean> = {
    zip: false,
    price: false,
  };
  const mapping: ImportMapping = headers.map((header, csvIndex) => {
    const label = header.trim();
    const match = existingColumns.find(
      (c) =>
        !claimedExisting.has(c.key) &&
        (c.label.trim().toLowerCase() === label.toLowerCase() || c.key === label)
    );
    if (match) {
      claimedExisting.add(match.key);
      if (match.role) roleTaken[match.role] = true;
      return { csvIndex, header, action: 'existing' as const, existingKey: match.key };
    }
    return { csvIndex, header, action: 'new' as const };
  });

  // Roles already held by unmatched existing columns stay with those columns.
  for (const c of existingColumns) if (c.role) roleTaken[c.role] = true;

  return mapping.map((entry) => {
    if (entry.action !== 'new') return entry;
    const label = entry.header.trim() || `Column ${entry.csvIndex + 1}`;
    const samples = sampleRows.map((r) => r[entry.csvIndex] ?? '');
    let role: ZipColumnRole | undefined;
    if (!roleTaken.zip && ZIP_HEADER.test(label)) role = 'zip';
    else if (!roleTaken.price && PRICE_HEADER.test(label)) role = 'price';
    if (role) roleTaken[role] = true;
    let type: ZipColumnType = inferColumnType(samples);
    if (role === 'zip') type = 'text';
    if (role === 'price') type = 'currency';
    const key = slugifyColumnKey(label, usedKeys);
    usedKeys.add(key);
    const column: ZipMatrixColumn = {
      key,
      label,
      type,
      role,
      required: role ? true : undefined,
      order: entry.csvIndex,
    };
    return { ...entry, column };
  });
}

// ---------- Import preview / apply ----------

function sameValue(a: ZipCellValue | undefined, b: ZipCellValue | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

function resolveColumns(
  existingColumns: ZipMatrixColumn[],
  mapping: ImportMapping
): { columns: ZipMatrixColumn[]; targetByIndex: Map<number, ZipMatrixColumn> } {
  const newCols = mapping
    .filter((m) => m.action === 'new' && m.column)
    .map((m) => ({ entry: m, col: { ...(m.column as ZipMatrixColumn) } }));
  // A new column claiming a role takes it from any existing holder.
  const claimed = new Set(newCols.map((n) => n.col.role).filter(Boolean) as ZipColumnRole[]);
  const existing = sortColumns(existingColumns).map((c) => {
    if (c.role && claimed.has(c.role)) {
      const { role: _role, ...rest } = c;
      return { ...rest, required: false } as ZipMatrixColumn;
    }
    return { ...c };
  });
  const existingKeys = new Set(existing.map((c) => c.key));
  const columns: ZipMatrixColumn[] = [...existing];
  for (const n of newCols) {
    if (existingKeys.has(n.col.key)) n.col.key = slugifyColumnKey(n.col.key, columns.map((c) => c.key));
    if (n.col.role === 'zip') Object.assign(n.col, { type: 'text', required: true });
    if (n.col.role === 'price') Object.assign(n.col, { type: 'currency', required: true });
    columns.push(n.col);
  }
  const ordered = columns.map((c, i) => ({ ...c, order: i }));
  const byKey = new Map(ordered.map((c) => [c.key, c]));
  const targetByIndex = new Map<number, ZipMatrixColumn>();
  let newPos = 0;
  for (const m of mapping) {
    if (m.action === 'existing' && m.existingKey) {
      const col = byKey.get(m.existingKey);
      if (col) targetByIndex.set(m.csvIndex, col);
    } else if (m.action === 'new' && m.column) {
      targetByIndex.set(m.csvIndex, ordered[existing.length + newPos]);
      newPos++;
    }
  }
  return { columns: ordered, targetByIndex };
}

export function buildImportPreview(args: ImportArgs): ImportPreview {
  const { csvText, mapping, existingColumns, existingRows, mode } = args;
  const errors: ImportError[] = [];
  const summary: ImportSummary = { added: 0, updated: 0, unchanged: 0, removed: 0, invalid: 0 };
  const { columns, targetByIndex } = resolveColumns(existingColumns, mapping);

  const schemaErrors = validateSchema(columns);
  for (const message of schemaErrors) errors.push({ line: 0, message });

  const records = parseCsv(csvText);
  const dataRecords = records.slice(1);
  let canApply = schemaErrors.length === 0;
  for (const role of ['zip', 'price'] as const) {
    const col = getRoleColumn(columns, role);
    if (col && ![...targetByIndex.values()].some((c) => c.key === col.key)) {
      errors.push({ line: 0, message: `No CSV column is mapped to the ${role} column "${col.label}".` });
      canApply = false;
    }
  }

  if (dataRecords.length > ZIP_MATRIX_MAX_ROWS) {
    errors.push({
      line: 0,
      message: `File has ${dataRecords.length.toLocaleString('en-US')} rows; the maximum is ${ZIP_MATRIX_MAX_ROWS.toLocaleString('en-US')}.`,
    });
    summary.invalid = dataRecords.length;
    return { columns, rows: [], errors, summary, canApply: false };
  }

  const zipCol = getRoleColumn(columns, 'zip');
  const existingByZip = new Map<string, ZipMatrixRow>();
  if (zipCol) {
    for (const r of existingRows) {
      const z = String(r.values[zipCol.key] ?? '').trim();
      if (z) existingByZip.set(z, r);
    }
  }

  const fileRows: ZipMatrixRow[] = [];
  const seenZips = new Set<string>();
  const mappedKeys = new Set<string>();
  targetByIndex.forEach((c) => mappedKeys.add(c.key));

  dataRecords.forEach((cells, idx) => {
    const line = idx + 2; // header is line 1
    const raw: Record<string, unknown> = {};
    targetByIndex.forEach((col, csvIndex) => {
      raw[col.key] = cells[csvIndex] ?? '';
    });
    // Only validate mapped columns; unmapped required columns are enforced by schema roles.
    const mappedColumns = columns.filter((c) => mappedKeys.has(c.key));
    const { values, issues } = coerceRow(mappedColumns, raw);
    const rowErrors: ImportError[] = issues.map((i) => ({
      line,
      column: columns.find((c) => c.key === i.columnKey)?.label,
      message: i.message,
    }));
    if (zipCol && mappedKeys.has(zipCol.key) && rowErrors.length === 0) {
      const z = String(values[zipCol.key] ?? '');
      if (seenZips.has(z)) {
        rowErrors.push({ line, column: zipCol.label, message: `Duplicate zip ${z} in file` });
      } else {
        seenZips.add(z);
      }
    }
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      summary.invalid++;
      return;
    }
    const full: Record<string, ZipCellValue> = {};
    for (const c of columns) full[c.key] = values[c.key] ?? null;
    const zip = zipCol ? String(full[zipCol.key] ?? '') : `row-${idx}`;
    fileRows.push({ id: createRowId(zip), values: full });
  });

  // Compare against existing rows, build resulting rows.
  const resultRows: ZipMatrixRow[] = [];
  const fileZips = new Set<string>();
  for (const fr of fileRows) {
    const zip = zipCol ? String(fr.values[zipCol.key]) : fr.id;
    fileZips.add(zip);
    const prev = existingByZip.get(zip);
    if (!prev) {
      summary.added++;
      resultRows.push(fr);
      continue;
    }
    const merged: Record<string, ZipCellValue> = {};
    for (const c of columns) {
      if (mode === 'upsert' && !mappedKeys.has(c.key)) merged[c.key] = prev.values[c.key] ?? null;
      else merged[c.key] = fr.values[c.key] ?? null;
    }
    const changed = columns.some((c) => !sameValue(merged[c.key], prev.values[c.key]));
    if (changed) summary.updated++;
    else summary.unchanged++;
    resultRows.push({ id: prev.id, values: merged });
  }

  let finalRows: ZipMatrixRow[];
  if (mode === 'replace') {
    summary.removed = existingRows.filter((r) => {
      const z = zipCol ? String(r.values[zipCol.key] ?? '').trim() : '';
      return !fileZips.has(z);
    }).length;
    finalRows = resultRows;
  } else {
    const updatedById = new Map(resultRows.filter((r) => existingRows.some((e) => e.id === r.id)).map((r) => [r.id, r]));
    const kept = existingRows.map((r) => {
      const u = updatedById.get(r.id);
      if (u) return u;
      const values: Record<string, ZipCellValue> = {};
      for (const c of columns) values[c.key] = r.values[c.key] ?? null;
      return { ...r, values };
    });
    const added = resultRows.filter((r) => !existingRows.some((e) => e.id === r.id));
    finalRows = [...kept, ...added];
  }

  if (finalRows.length > ZIP_MATRIX_MAX_ROWS) {
    errors.push({
      line: 0,
      message: `Result would have ${finalRows.length.toLocaleString('en-US')} rows; the maximum is ${ZIP_MATRIX_MAX_ROWS.toLocaleString('en-US')}.`,
    });
    canApply = false;
  }

  return { columns, rows: finalRows, errors, summary, canApply };
}

/** Applies a previewed import. Throws when the import is not safe to apply. Invalid rows are skipped. */
export function applyImport(args: ImportArgs): {
  zipMatrixColumns: ZipMatrixColumn[];
  zipMatrixRows: ZipMatrixRow[];
} {
  const preview = buildImportPreview(args);
  if (!preview.canApply) {
    const first = preview.errors.find((e) => e.line === 0) || preview.errors[0];
    throw new Error(first ? first.message : 'Import cannot be applied');
  }
  return { zipMatrixColumns: preview.columns, zipMatrixRows: preview.rows };
}

// ---------- Export ----------

function escapeCsvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Exports with column labels as headers in `order`, so export → re-import round-trips. */
export function exportZipMatrixCsv(columns: ZipMatrixColumn[], rows: ZipMatrixRow[]): string {
  const cols = sortColumns(columns);
  const lines = [cols.map((c) => escapeCsvField(c.label)).join(',')];
  for (const row of rows) {
    lines.push(
      cols
        .map((c) => {
          const v = row.values[c.key];
          if (v === null || v === undefined) return '';
          if (c.type === 'currency' && typeof v === 'number') return v.toFixed(2);
          if (c.type === 'boolean') return v === true ? 'true' : v === false ? 'false' : String(v);
          return escapeCsvField(String(v));
        })
        .join(',')
    );
  }
  return lines.join('\n');
}
