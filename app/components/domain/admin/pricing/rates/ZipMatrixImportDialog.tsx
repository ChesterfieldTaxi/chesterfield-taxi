import React, { useMemo, useRef, useState } from 'react';
import type { ZipColumnRole, ZipColumnType, ZipMatrixColumn, ZipMatrixRow } from '~/core/types/tariff';
import {
  ZIP_COLUMN_TYPES,
  formatCellValue,
  sortColumns,
} from '~/core/services/pricing/zip-matrix-schema.service';
import {
  applyImport,
  buildImportPreview,
  inferColumns,
  parseCsv,
  type ImportMapping,
  type ImportMode,
} from '~/core/services/pricing/zip-matrix-csv.service';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { Badge } from '~/components/ui/Badge';
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  XIcon,
} from '~/components/ui/Icons';

export interface ZipMatrixImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  columns: ZipMatrixColumn[];
  rows: ZipMatrixRow[];
  onApply: (columns: ZipMatrixColumn[], rows: ZipMatrixRow[]) => void;
}

type Step = 'upload' | 'map' | 'preview';

const STEPS: Array<{ id: Step; num: number; label: string }> = [
  { id: 'upload', num: 1, label: 'Upload' },
  { id: 'map', num: 2, label: 'Map Columns' },
  { id: 'preview', num: 3, label: 'Preview & Apply' },
];

const TYPE_OPTIONS = ZIP_COLUMN_TYPES.map((t) => ({ value: t, label: t }));
const ROLE_OPTIONS = [
  { value: '', label: 'No role' },
  { value: 'zip', label: 'Zip' },
  { value: 'price', label: 'Price' },
];
const MODE_META: Record<ImportMode, { label: string; desc: string }> = {
  replace: { label: 'Replace all rows', desc: 'Clears existing rows and loads only this CSV.' },
  upsert: { label: 'Upsert by zip', desc: 'Updates matching 5-digit zips and appends new ones.' },
};

export function ZipMatrixImportDialog({
  isOpen,
  onClose,
  columns,
  rows,
  onApply,
}: ZipMatrixImportDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [sampleRow, setSampleRow] = useState<string[]>([]);
  const [totalCsvRows, setTotalCsvRows] = useState(0);
  const [mapping, setMapping] = useState<ImportMapping>([]);
  const [mode, setMode] = useState<ImportMode>('replace');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setCsvText('');
    setFileName('');
    setSampleRow([]);
    setTotalCsvRows(0);
    setMapping([]);
    setMode('replace');
    setError(null);
    setIsDragging(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const text = await file.text();
    const records = parseCsv(text);
    if (records.length < 1) {
      setError('The file is empty.');
      return;
    }
    setFileName(file.name);
    setCsvText(text);
    setSampleRow(records[1] ?? []);
    setTotalCsvRows(Math.max(0, records.length - 1));
    setMapping(inferColumns(records[0], records.slice(1, 51), columns));
    setStep('map');
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const patchEntry = (i: number, patch: Partial<ImportMapping[number]>) =>
    setMapping((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const patchColumn = (i: number, patch: Partial<ZipMatrixColumn>) =>
    setMapping((prev) =>
      prev.map((m, idx) => {
        if (idx !== i || !m.column) return m;
        const col = { ...m.column, ...patch };
        if (col.role === 'zip') Object.assign(col, { type: 'text', required: true });
        if (col.role === 'price') Object.assign(col, { type: 'currency', required: true });
        if (!col.role) col.required = undefined;
        return { ...m, column: col };
      })
    );

  const move = (i: number, dir: -1 | 1) =>
    setMapping((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const setAction = (i: number, value: string) => {
    const entry = mapping[i];
    if (value === 'skip') return patchEntry(i, { action: 'skip' });
    if (value === 'new') {
      const label = entry.header.trim() || `Column ${entry.csvIndex + 1}`;
      const column: ZipMatrixColumn =
        entry.column || { key: `import_${entry.csvIndex}`, label, type: 'text', order: entry.csvIndex };
      return patchEntry(i, { action: 'new', column, existingKey: undefined });
    }
    patchEntry(i, { action: 'existing', existingKey: value });
  };

  const preview = useMemo(
    () =>
      isOpen && step === 'preview'
        ? buildImportPreview({ csvText, mapping, existingColumns: columns, existingRows: rows, mode })
        : null,
    [isOpen, step, csvText, mapping, columns, rows, mode]
  );

  if (!isOpen) return null;

  const handleApply = () => {
    try {
      const res = applyImport({ csvText, mapping, existingColumns: columns, existingRows: rows, mode });
      onApply(res.zipMatrixColumns, res.zipMatrixRows);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    }
  };

  const actionOptions = [
    { value: 'new', label: 'New column' },
    ...sortColumns(columns).map((c) => ({ value: c.key, label: `Existing: ${c.label}` })),
    { value: 'skip', label: 'Skip' },
  ];

  const previewColumns = preview ? sortColumns(preview.columns) : [];
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header & Stepper */}
      <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <DocumentTextIcon className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 leading-tight">Import Zip Matrix CSV</h4>
            <p className="text-[11px] text-slate-500 leading-tight">
              {fileName ? `${fileName} · ${totalCsvRows} data row${totalCsvRows === 1 ? '' : 's'}` : 'Header row proposes columns'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <nav aria-label="Import steps" className="hidden sm:flex items-center gap-1.5">
            {STEPS.map((s, idx) => {
              const isDone = idx < stepIndex;
              const isCurrent = idx === stepIndex;
              return (
                <React.Fragment key={s.id}>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      isCurrent
                        ? 'bg-slate-900 text-white'
                        : isDone
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-white text-slate-400 border border-slate-200'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-black/10">
                      {isDone ? <CheckIcon className="w-2.5 h-2.5" /> : s.num}
                    </span>
                    {s.label}
                  </span>
                  {idx < STEPS.length - 1 && <span className="text-slate-300 text-xs">›</span>}
                </React.Fragment>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={close}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Close import"
            aria-label="Close import"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3 text-xs text-slate-700">
        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
            <AlertCircleIcon className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {step === 'upload' && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void handleFile(e.target.files?.[0])}
              className="hidden"
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50/70'
                  : 'border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              <div className="w-11 h-11 rounded-full bg-white border border-slate-200 shadow-2xs flex items-center justify-center mx-auto mb-3 text-emerald-600">
                <DocumentTextIcon className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-slate-900">
                Drop your <span className="font-mono text-emerald-700">.csv</span> file here, or click to browse
              </p>
              <p className="text-xs text-slate-500 mt-1">
                The first row proposes your columns. You&apos;ll map types/roles and preview rows before applying.
              </p>
              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="bg-white border-slate-300 text-slate-700"
                >
                  Select CSV File
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-slate-600">
                Map each CSV header to a new or existing column, or skip it.
              </p>
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2 cursor-pointer"
              >
                Choose different file
              </button>
            </div>

            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
              {mapping.map((m, i) => (
                <div
                  key={m.csvIndex}
                  className={`border rounded-lg p-2.5 space-y-2 transition-colors ${
                    m.action === 'skip' ? 'bg-slate-50/70 border-slate-200 opacity-70' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-900 truncate">
                        {m.header || `Column ${m.csvIndex + 1}`}
                      </span>
                      {sampleRow[m.csvIndex] !== undefined && sampleRow[m.csvIndex] !== '' && (
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[180px]">
                          e.g. {sampleRow[m.csvIndex]}
                        </span>
                      )}
                      {m.action === 'new' && m.column?.role && (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] uppercase">
                          {m.column.role}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                        title="Move up"
                      >
                        <ChevronDownIcon className="w-3 h-3 rotate-180" />
                      </button>
                      <button
                        type="button"
                        disabled={i === mapping.length - 1}
                        onClick={() => move(i, 1)}
                        className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                        title="Move down"
                      >
                        <ChevronDownIcon className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <Select
                      size="xs"
                      value={m.action === 'existing' ? m.existingKey || '' : m.action}
                      options={actionOptions}
                      onValueChange={(v) => setAction(i, v)}
                    />
                    {m.action === 'new' && m.column && (
                      <>
                        <Input
                          type="text"
                          aria-label="Column label"
                          value={m.column.label}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchColumn(i, { label: e.target.value })}
                          className="h-7 text-xs bg-white border-slate-300"
                        />
                        <Select
                          size="xs"
                          value={m.column.type}
                          disabled={!!m.column.role}
                          options={TYPE_OPTIONS}
                          onValueChange={(v) => patchColumn(i, { type: v as ZipColumnType })}
                        />
                        <Select
                          size="xs"
                          value={m.column.role || ''}
                          options={ROLE_OPTIONS}
                          onValueChange={(v) => patchColumn(i, { role: (v || undefined) as ZipColumnRole | undefined })}
                        />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(MODE_META) as ImportMode[]).map((k) => {
                const active = mode === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setMode(k)}
                    className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                      active
                        ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500/30'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold text-xs ${active ? 'text-emerald-900' : 'text-slate-800'}`}>
                        {MODE_META[k].label}
                      </span>
                      {active && <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{MODE_META[k].desc}</p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              {(
                [
                  ['Added', preview.summary.added, 'text-emerald-700 bg-emerald-50/50 border-emerald-200'],
                  ['Updated', preview.summary.updated, 'text-blue-700 bg-blue-50/50 border-blue-200'],
                  ['Unchanged', preview.summary.unchanged, 'text-slate-700 bg-slate-50 border-slate-200'],
                  ['Removed', preview.summary.removed, 'text-amber-700 bg-amber-50/50 border-amber-200'],
                  [
                    'Errors',
                    preview.summary.invalid,
                    preview.summary.invalid > 0
                      ? 'text-rose-700 bg-rose-50 border-rose-200'
                      : 'text-slate-500 bg-slate-50 border-slate-200',
                  ],
                ] as const
              ).map(([label, n, tone]) => (
                <div key={label} className={`p-2 rounded-lg border ${tone}`}>
                  <div className="text-[10px] uppercase font-semibold tracking-wider opacity-80">{label}</div>
                  <div className="font-bold text-sm mt-0.5">{n}</div>
                </div>
              ))}
            </div>

            {preview.errors.length > 0 && (
              <div className="max-h-32 overflow-auto p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 space-y-0.5">
                {preview.errors.slice(0, 100).map((er, i) => (
                  <div key={i}>
                    {er.line > 0 ? `Line ${er.line}: ` : ''}
                    {er.message}
                  </div>
                ))}
                {preview.errors.length > 100 && <div>…and {preview.errors.length - 100} more</div>}
              </div>
            )}

            <div className="max-h-60 overflow-auto border border-slate-200 rounded-lg custom-scrollbar">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                  <tr>
                    {previewColumns.map((c) => (
                      <th key={c.key} className="py-1.5 px-2.5 font-semibold">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {preview.rows.slice(0, 20).map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      {previewColumns.map((c) => (
                        <td key={c.key} className="py-1.5 px-2.5">
                          {formatCellValue(c, r.values[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">
              Showing first {Math.min(20, preview.rows.length)} of {preview.rows.length} resulting rows.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={close}>
          Cancel
        </Button>
        <div className="flex gap-2">
          {step !== 'upload' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep(step === 'preview' ? 'map' : 'upload')}
            >
              Back
            </Button>
          )}
          {step === 'map' && (
            <Button type="button" size="sm" onClick={() => setStep('preview')}>
              Preview
            </Button>
          )}
          {step === 'preview' && (
            <Button
              type="button"
              size="sm"
              disabled={!preview?.canApply}
              onClick={handleApply}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Apply ({MODE_META[mode].label})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
