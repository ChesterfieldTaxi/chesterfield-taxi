import React from 'react';
import type { ZipMatrixColumn } from '~/core/types/tariff';
import type { ZipCellValue } from '~/core/services/pricing/zip-matrix-schema.service';
import { Input } from '~/components/ui/Input';
import { Checkbox } from '~/components/ui/Checkbox';
import { Select } from '~/components/ui/Select';

export interface ZipCellInputProps {
  column: ZipMatrixColumn;
  value: ZipCellValue | undefined;
  onChange: (value: ZipCellValue) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Renders the correct input for a column's type. Emits typed values (number / boolean / string / null). */
export function ZipCellInput({
  column,
  value,
  onChange,
  disabled,
  className = 'h-7 text-xs bg-surface-card border-border-strong',
  ariaLabel,
}: ZipCellInputProps) {
  const label = ariaLabel || column.label;
  switch (column.type) {
    case 'boolean':
      return (
        <Checkbox
          checked={value === true}
          disabled={disabled}
          onChange={(checked) => onChange(checked)}
          size="sm"
        />
      );
    case 'select':
      return (
        <Select
          size="xs"
          value={value === null || value === undefined ? '' : String(value)}
          disabled={disabled}
          placeholder="Select…"
          options={(column.options || []).map((o) => ({ value: o, label: o }))}
          onValueChange={(v) => onChange(v === '' ? null : v)}
        />
      );
    case 'currency':
    case 'integer':
      return (
        <Input
          type="number"
          aria-label={label}
          step={column.type === 'currency' ? '0.01' : '1'}
          min={column.type === 'currency' ? 0 : undefined}
          value={value === null || value === undefined ? '' : String(value)}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const raw = e.target.value;
            if (raw === '') return onChange(null);
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : null);
          }}
          className={`${className} font-mono text-right`}
        />
      );
    default:
      return (
        <Input
          type="text"
          aria-label={label}
          inputMode={column.role === 'zip' ? 'numeric' : undefined}
          maxLength={column.role === 'zip' ? 5 : undefined}
          value={value === null || value === undefined ? '' : String(value)}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          className={`${className}${column.role === 'zip' ? ' font-mono' : ''}`}
        />
      );
  }
}
