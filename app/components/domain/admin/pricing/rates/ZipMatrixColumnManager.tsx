import React, { useState } from 'react';
import type { ZipColumnRole, ZipColumnType, ZipMatrixColumn, ZipMatrixRow } from '~/core/types/tariff';
import {
  ZIP_COLUMN_TYPES,
  addColumn,
  columnHasData,
  removeColumn,
  renameColumn,
  reorderColumns,
  sortColumns,
  updateColumn,
} from '~/core/services/pricing/zip-matrix-schema.service';
import { Input } from '~/components/ui/Input';
import { Button } from '~/components/ui/Button';
import { Select } from '~/components/ui/Select';
import { ConfirmationModal } from '~/components/ui/ConfirmationModal';
import { ChevronDownIcon, PlusIcon, TrashIcon, XIcon } from '~/components/ui/Icons';

export interface ZipMatrixColumnManagerProps {
  columns: ZipMatrixColumn[];
  rows: ZipMatrixRow[];
  onChange: (columns: ZipMatrixColumn[], rows: ZipMatrixRow[]) => void;
  onClose?: () => void;
}

const TYPE_OPTIONS = ZIP_COLUMN_TYPES.map((t) => ({ value: t, label: t }));
const ROLE_OPTIONS = [
  { value: '', label: 'None (display only)' },
  { value: 'zip', label: 'Zip (matching key)' },
  { value: 'price', label: 'Price (fare)' },
];

export function ZipMatrixColumnManager({
  columns,
  rows,
  onChange,
  onClose,
}: ZipMatrixColumnManagerProps) {
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<ZipColumnType>('text');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const sorted = sortColumns(columns);

  const commitDelete = (key: string) => {
    const res = removeColumn(columns, rows, key);
    onChange(res.columns, res.rows);
    setPendingDelete(null);
  };

  return (
    <div className="p-4 rounded-xl bg-surface-subtle border border-border-subtle space-y-3 shadow-2xs">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-fg-strong uppercase tracking-wider">Manage Columns</h4>
        {onClose && (
          <button type="button" onClick={onClose} className="p-1 text-fg-muted hover:text-fg-strong" title="Close">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-fg-muted">
        Exactly one column is the <strong>Zip</strong> (5 digits) and one is the <strong>Price</strong>. Other
        columns are informational only.
      </p>

      <div className="space-y-2">
        {sorted.map((col, idx) => (
          <div
            key={col.key}
            className="grid grid-cols-1 md:grid-cols-[1fr_120px_170px_auto] gap-2 items-start bg-surface-card border border-border-subtle rounded-lg p-2"
          >
            <div className="space-y-1">
              <Input
                type="text"
                aria-label={`Label for ${col.label}`}
                value={col.label}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange(renameColumn(columns, col.key, e.target.value), rows)
                }
                className="h-7 text-xs bg-surface-card border-border-strong"
              />
              {col.type === 'select' && (
                <Input
                  type="text"
                  key={`${col.key}-${(col.options || []).join('|')}`}
                  aria-label={`Options for ${col.label}`}
                  placeholder="Options, comma separated"
                  defaultValue={(col.options || []).join(', ')}
                  onBlur={(e: React.FocusEvent<HTMLInputElement>) =>
                    onChange(
                      updateColumn(columns, col.key, {
                        options: e.target.value
                          .split(',')
                          .map((o) => o.trim())
                          .filter(Boolean),
                      }),
                      rows
                    )
                  }
                  className="h-7 text-xs bg-surface-card border-border-strong"
                />
              )}
            </div>
            <Select
              size="xs"
              value={col.type}
              disabled={!!col.role}
              options={TYPE_OPTIONS}
              onValueChange={(v) => onChange(updateColumn(columns, col.key, { type: v as ZipColumnType }), rows)}
            />
            <Select
              size="xs"
              value={col.role || ''}
              options={ROLE_OPTIONS}
              onValueChange={(v) =>
                onChange(updateColumn(columns, col.key, { role: (v || undefined) as ZipColumnRole | undefined }), rows)
              }
            />
            <div className="flex items-center gap-1 justify-end">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => onChange(reorderColumns(columns, col.key, -1), rows)}
                className="p-1 rounded border border-border-subtle text-fg-secondary disabled:opacity-30"
                title="Move up"
              >
                <ChevronDownIcon className="w-3.5 h-3.5 rotate-180" />
              </button>
              <button
                type="button"
                disabled={idx === sorted.length - 1}
                onClick={() => onChange(reorderColumns(columns, col.key, 1), rows)}
                className="p-1 rounded border border-border-subtle text-fg-secondary disabled:opacity-30"
                title="Move down"
              >
                <ChevronDownIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!!col.role}
                onClick={() =>
                  columnHasData(rows, col.key) ? setPendingDelete(col.key) : commitDelete(col.key)
                }
                className="p-1 rounded border border-border-subtle text-fg-subtle hover:text-rose-600 disabled:opacity-30"
                title={col.role ? 'Zip and Price columns cannot be deleted' : 'Delete column'}
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <form
        className="flex flex-col sm:flex-row gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newLabel.trim()) return;
          onChange(addColumn(columns, { label: newLabel, type: newType }), rows);
          setNewLabel('');
          setNewType('text');
        }}
      >
        <div className="flex-1 w-full">
          <Input
            type="text"
            aria-label="New column label"
            placeholder="New column label"
            value={newLabel}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLabel(e.target.value)}
            className="h-8 text-xs bg-surface-card border-border-strong"
          />
        </div>
        <div className="w-full sm:w-32">
          <Select size="xs" value={newType} options={TYPE_OPTIONS} onValueChange={(v) => setNewType(v as ZipColumnType)} />
        </div>
        <Button type="submit" size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
          <PlusIcon className="w-3.5 h-3.5 mr-1" />
          Add Column
        </Button>
      </form>

      <ConfirmationModal
        isOpen={pendingDelete !== null}
        title="Delete column?"
        message="This column contains data. Deleting it removes those values from every row."
        confirmText="Delete"
        onConfirm={() => {
          if (pendingDelete) commitDelete(pendingDelete);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
