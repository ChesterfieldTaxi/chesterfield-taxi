import React, { useMemo, useState } from 'react';
import type { ZipMatrixColumn, ZipMatrixRow } from '~/core/types/tariff';
import {
  ZIP_MATRIX_MAX_ROWS,
  coerceRow,
  createRowId,
  formatCellValue,
  getRoleColumn,
  removeRow,
  sortColumns,
  upsertRow,
  validateRows,
  type ZipCellValue,
} from '~/core/services/pricing/zip-matrix-schema.service';
import { exportZipMatrixCsv } from '~/core/services/pricing/zip-matrix-csv.service';
import { Input } from '~/components/ui/Input';
import { Button } from '~/components/ui/Button';
import { Badge } from '~/components/ui/Badge';
import {
  SearchIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  DownloadIcon,
  CheckIcon,
  ShieldCheckIcon,
  SettingsIcon,
  FileTextIcon,
} from '~/components/ui/Icons';
import { ZipCellInput } from './ZipCellInput';
import { ZipMatrixColumnManager } from './ZipMatrixColumnManager';
import { ZipMatrixImportDialog } from './ZipMatrixImportDialog';

export interface ZipRateMatrixEditorProps {
  columns: ZipMatrixColumn[];
  rows: ZipMatrixRow[];
  onChange: (columns: ZipMatrixColumn[], rows: ZipMatrixRow[]) => void;
  readOnly?: boolean;
}

const MAX_RENDERED_ROWS = 200;

export function ZipRateMatrixEditor({
  columns = [],
  rows = [],
  onChange,
  readOnly = false,
}: ZipRateMatrixEditorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [draft, setDraft] = useState<Record<string, ZipCellValue>>({});
  const [draftErrors, setDraftErrors] = useState<string[]>([]);

  const sortedColumns = useMemo(() => sortColumns(columns), [columns]);
  const zipCol = getRoleColumn(columns, 'zip');
  const priceCol = getRoleColumn(columns, 'price');

  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return rows;
    const searchable = sortedColumns.filter((c) => c.role === 'zip' || c.type === 'text');
    return rows.filter((r) =>
      searchable.some((c) =>
        String(r.values[c.key] ?? '')
          .toLowerCase()
          .includes(q)
      )
    );
  }, [rows, sortedColumns, searchQuery]);
  const visibleRows = filteredRows.slice(0, MAX_RENDERED_ROWS);

  const stats = useMemo(() => {
    const prices = priceCol
      ? rows.map((r) => r.values[priceCol.key]).filter((v): v is number => typeof v === 'number')
      : [];
    if (!prices.length) return { count: rows.length, min: 0, max: 0, avg: 0 };
    return {
      count: rows.length,
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    };
  }, [rows, priceCol]);

  const problems = useMemo(() => validateRows(columns, rows), [columns, rows]);
  const problemRowIds = useMemo(() => new Set(problems.map((p) => p.rowId)), [problems]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const { values, issues } = coerceRow(sortedColumns, draft);
    const errs = issues.map((i) => i.message);
    if (rows.length >= ZIP_MATRIX_MAX_ROWS && !rows.some((r) => zipCol && r.values[zipCol.key] === values[zipCol.key])) {
      errs.push(`Maximum of ${ZIP_MATRIX_MAX_ROWS} rows reached`);
    }
    if (errs.length) return setDraftErrors(errs);
    const zip = zipCol ? String(values[zipCol.key]) : String(rows.length);
    onChange(columns, upsertRow(columns, rows, { id: createRowId(zip), values }));
    setDraft({});
    setDraftErrors([]);
    setIsAddingNew(false);
  };

  const handleCell = (rowId: string, key: string, value: ZipCellValue) =>
    onChange(
      columns,
      rows.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [key]: value } } : r))
    );

  const handleExport = () => {
    const blob = new Blob([exportZipMatrixCsv(columns, rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'zip_rate_matrix.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const rowActions = (row: ZipMatrixRow) => {
    const isEditing = editingId === row.id;
    return (
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => setEditingId(isEditing ? null : row.id)}
          className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800"
          title={isEditing ? 'Done' : 'Edit Row'}
        >
          {isEditing ? <CheckIcon className="w-3.5 h-3.5 text-emerald-600" /> : <EditIcon className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(columns, removeRow(rows, row.id));
            if (editingId === row.id) setEditingId(null);
          }}
          className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"
          title="Delete Row"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const renderCell = (row: ZipMatrixRow, col: ZipMatrixColumn) =>
    editingId === row.id && !readOnly ? (
      <ZipCellInput column={col} value={row.values[col.key]} onChange={(v) => handleCell(row.id, col.key, v)} />
    ) : (
      <span className={col.role === 'price' ? 'font-bold text-emerald-700' : col.role === 'zip' ? 'font-semibold text-slate-900' : ''}>
        {formatCellValue(col, row.values[col.key])}
      </span>
    );

  const alignRight = (c: ZipMatrixColumn) => c.type === 'currency' || c.type === 'integer';

  return (
    <div className="space-y-4">
      <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-amber-900 font-bold text-sm flex items-center gap-1.5">
              <ShieldCheckIcon className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Postal / Zip Flat-Rate Matrix</span>
            </span>
            <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-[10px]">
              Flat Zip Pricing
            </Badge>
          </div>
          <p className="text-xs text-slate-600">
            Define fixed client fares by destination or pickup 5-digit ZIP code. Columns are fully customizable;
            only the <strong>Zip</strong> and <strong>Price</strong> columns affect pricing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
          {!readOnly && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowColumns((v) => !v);
                  setShowImport(false);
                }}
                className="text-xs border-slate-300 bg-white text-slate-700"
              >
                <SettingsIcon className="w-3.5 h-3.5 mr-1 text-slate-500" />
                Manage Columns
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowImport((v) => !v);
                  setShowColumns(false);
                }}
                className="text-xs border-slate-300 bg-white text-slate-700"
              >
                <FileTextIcon className="w-3.5 h-3.5 mr-1 text-slate-500" />
                Import CSV
              </Button>
            </>
          )}
          <Button type="button" variant="outline" size="sm" onClick={handleExport} className="text-xs border-slate-300 bg-white text-slate-700">
            <DownloadIcon className="w-3.5 h-3.5 mr-1 text-slate-500" />
            Export CSV
          </Button>
          {!readOnly && (
            <Button type="button" size="sm" onClick={() => setIsAddingNew(!isAddingNew)} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs">
              <PlusIcon className="w-3.5 h-3.5 mr-1" />
              Add Row
            </Button>
          )}
        </div>
      </div>

      {showColumns && !readOnly && (
        <ZipMatrixColumnManager columns={columns} rows={rows} onChange={onChange} onClose={() => setShowColumns(false)} />
      )}

      <ZipMatrixImportDialog isOpen={showImport} onClose={() => setShowImport(false)} columns={columns} rows={rows} onApply={onChange} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {(
          [
            ['Defined Zips', String(stats.count), 'text-slate-900'],
            ['Min Price', `$${stats.min.toFixed(2)}`, 'text-emerald-700'],
            ['Average Price', `$${stats.avg.toFixed(2)}`, 'text-blue-700'],
            ['Max Price', `$${stats.max.toFixed(2)}`, 'text-purple-700'],
          ] as const
        ).map(([label, value, tone]) => (
          <div key={label} className="p-3 rounded-xl bg-white border border-slate-200 text-center shadow-2xs">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">{label}</span>
            <span className={`text-base font-bold ${tone}`}>{value}</span>
          </div>
        ))}
      </div>

      {problems.length > 0 && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {problems.length} problem{problems.length === 1 ? '' : 's'} found (e.g. {problems[0].message}). Fix before saving.
        </div>
      )}

      {isAddingNew && !readOnly && (
        <form onSubmit={handleAdd} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 shadow-2xs">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
            <PlusIcon className="w-3.5 h-3.5 text-emerald-600" />
            Add Row
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
            {sortedColumns.map((col) => (
              <div key={col.key}>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">
                  {col.label}
                  {col.required ? ' *' : ''}
                </label>
                <ZipCellInput column={col} value={draft[col.key]} onChange={(v) => setDraft((d) => ({ ...d, [col.key]: v }))} />
              </div>
            ))}
          </div>
          {draftErrors.length > 0 && (
            <ul className="text-xs text-rose-700 list-disc pl-4">
              {draftErrors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddingNew(false)} className="h-7 text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
              Save Row
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        <div className="relative">
          <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <Input
            type="text"
            placeholder="Search by zip or text columns..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-white border-slate-300 text-slate-900 w-full"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
          {/* Mobile cards */}
          <div className="md:hidden max-h-[480px] overflow-y-auto divide-y divide-slate-100">
            {visibleRows.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">No matching rows</div>
            ) : (
              visibleRows.map((row) => (
                <div key={row.id} className={`p-3 space-y-2 text-xs ${problemRowIds.has(row.id) ? 'bg-rose-50/50' : ''}`}>
                  {sortedColumns.map((col) => (
                    <div key={col.key} className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase text-slate-500">{col.label}</span>
                      <div className="min-w-0">{renderCell(row, col)}</div>
                    </div>
                  ))}
                  {!readOnly && rowActions(row)}
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block max-h-[480px] overflow-auto custom-scrollbar">
            <table className="w-full text-left text-xs min-w-[600px]">
              <thead className="bg-slate-50 text-slate-600 text-[11px] font-semibold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  {sortedColumns.map((col) => (
                    <th key={col.key} className={`py-2.5 px-3 ${alignRight(col) ? 'text-right' : ''}`}>
                      {col.label}
                    </th>
                  ))}
                  {!readOnly && <th className="py-2.5 px-3 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {visibleRows.map((row) => (
                  <tr key={row.id} className={`hover:bg-slate-50/80 ${problemRowIds.has(row.id) ? 'bg-rose-50/50' : ''}`}>
                    {sortedColumns.map((col) => (
                      <td key={col.key} className={`py-2 px-3 ${alignRight(col) ? 'text-right' : ''}`}>
                        {renderCell(row, col)}
                      </td>
                    ))}
                    {!readOnly && <td className="py-2 px-3 font-sans">{rowActions(row)}</td>}
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={sortedColumns.length + 1} className="text-center py-8 text-slate-500 font-sans text-xs">
                      No matching rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {filteredRows.length > MAX_RENDERED_ROWS && (
          <p className="text-[11px] text-slate-500">
            Showing first {MAX_RENDERED_ROWS} of {filteredRows.length} rows. Use search to narrow.
          </p>
        )}
      </div>
    </div>
  );
}
