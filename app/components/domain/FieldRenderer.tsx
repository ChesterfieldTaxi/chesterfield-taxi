import React from 'react';
import type { FieldSchema, VehicleTier } from '../../core/types';
import { isFieldVisible, isFieldRequired } from '../../core/types/field-schema';
import {
  Input,
  Textarea,
  Select,
  RadioGroup,
  Checkbox,
  Switch,
  Counter,
} from '../ui';
import { LocationAutocomplete, type PlaceSelectedDetails } from './LocationAutocomplete';
import { VehicleTierSelector } from './VehicleTierSelector';

export interface FieldRendererProps {
  field: FieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  onPlaceSelected?: (details: PlaceSelectedDetails) => void;
  onFocus?: (fieldName: string) => void;
  error?: string;
  formValues: Record<string, unknown>;
  disabled?: boolean;
}

export function FieldRenderer({
  field,
  value,
  onChange,
  onPlaceSelected,
  onFocus,
  error,
  formValues,
  disabled = false,
}: FieldRendererProps) {
  // Dynamically evaluate visibility rule from field schema
  const visible = isFieldVisible(field, formValues);
  if (!visible) {
    return null;
  }

  // Dynamically evaluate requirement rule from field schema
  const required = isFieldRequired(field, formValues);
  const { presentation } = field;

  // Responsive column span calculation
  const colSpanClass =
    presentation.colSpan === 6
      ? 'col-span-12 md:col-span-6'
      : presentation.colSpan === 4
      ? 'col-span-12 md:col-span-4'
      : presentation.colSpan === 3
      ? 'col-span-12 md:col-span-3'
      : 'col-span-12';

  const renderControl = () => {
    switch (field.type) {
      case 'location-autocomplete':
        return (
          <LocationAutocomplete
            name={field.name}
            label={presentation.label}
            placeholder={presentation.placeholder}
            helperText={presentation.helperText}
            error={error}
            value={typeof value === 'string' ? value : ''}
            onChange={onChange}
            onPlaceSelected={onPlaceSelected}
            required={required}
            disabled={disabled || presentation.disabled}
            autoFocus={presentation.autoFocus}
            icon={presentation.icon === 'flag' ? 'flag' : 'map-pin'}
          />
        );

      case 'vehicle-select':
        return (
          <VehicleTierSelector
            label={presentation.label}
            helperText={presentation.helperText}
            error={error}
            value={value as VehicleTier}
            onChange={(tier) => onChange(tier)}
            required={required}
            disabled={disabled || presentation.disabled}
          />
        );

      case 'radio':
        return (
          <RadioGroup
            name={field.name}
            label={presentation.label}
            helperText={presentation.helperText}
            error={error}
            options={
              field.options?.map((opt) => ({
                value: opt.value as string | number,
                label: opt.label,
                description: opt.description,
                badge: opt.badge,
                disabled: opt.disabled,
              })) ?? []
            }
            value={value as string | number}
            onChange={(val) => onChange(val)}
            required={required}
            disabled={disabled || presentation.disabled}
          />
        );

      case 'select':
        return (
          <Select
            name={field.name}
            label={presentation.label}
            placeholder={presentation.placeholder}
            helperText={presentation.helperText}
            error={error}
            options={
              field.options?.map((opt) => ({
                value: opt.value as string | number,
                label: opt.label,
                disabled: opt.disabled,
              })) ?? []
            }
            value={typeof value === 'string' || typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled || presentation.disabled}
          />
        );

      case 'checkbox':
        return (
          <Checkbox
            name={field.name}
            label={presentation.label}
            helperText={presentation.helperText}
            error={error}
            checked={Boolean(value)}
            onChange={(checked) => onChange(checked)}
            required={required}
            disabled={disabled || presentation.disabled}
          />
        );

      case 'switch':
        return (
          <Switch
            name={field.name}
            label={presentation.label}
            helperText={presentation.helperText}
            checked={Boolean(value)}
            onChange={(checked) => onChange(checked)}
            disabled={disabled || presentation.disabled}
          />
        );

      case 'counter':
        return (
          <Counter
            label={presentation.label}
            helperText={presentation.helperText}
            error={error}
            value={typeof value === 'number' ? value : field.defaultValue as number ?? 0}
            onChange={(num) => onChange(num)}
            min={field.validation?.min ?? 0}
            max={field.validation?.max ?? 10}
            required={required}
            disabled={disabled || presentation.disabled}
          />
        );

      case 'textarea':
        return (
          <Textarea
            name={field.name}
            label={presentation.label}
            placeholder={presentation.placeholder}
            helperText={presentation.helperText}
            error={error}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled || presentation.disabled}
            maxLength={field.validation?.maxLength}
          />
        );

      case 'text':
      case 'email':
      case 'tel':
      case 'number':
      case 'date':
      case 'time':
      case 'datetime-local':
      default:
        return (
          <Input
            name={field.name}
            type={field.type}
            label={presentation.label}
            placeholder={presentation.placeholder}
            helperText={presentation.helperText}
            error={error}
            value={typeof value === 'string' || typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled || presentation.disabled}
            autoFocus={presentation.autoFocus}
            maxLength={field.validation?.maxLength}
            minLength={field.validation?.minLength}
            min={field.validation?.min}
            max={field.validation?.max}
          />
        );
    }
  };

  return (
    <div
      className={`${colSpanClass} ${presentation.className || ''}`}
      onFocusCapture={() => onFocus?.(field.name)}
    >
      {renderControl()}
    </div>
  );
}
