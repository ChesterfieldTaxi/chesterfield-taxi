import React, { useState } from 'react';
import { VEHICLE_IMAGE_PRESETS } from '../../../../core/constants/vehicle-presets';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { TrashIcon, SparklesIcon, CarIcon } from '../../../ui/Icons';

export interface VehicleImagePickerProps {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  helperText?: string;
  allowClassImageFallback?: boolean;
  classImageUrl?: string;
  className?: string;
}

export function VehicleImagePicker({
  value = '',
  onChange,
  label = 'Vehicle Image (Optional)',
  helperText = 'Optional image displayed in customer booking cards and fleet inventory. Leave empty to use default icon.',
  allowClassImageFallback = false,
  classImageUrl,
  className = '',
}: VehicleImagePickerProps) {
  const [imageError, setImageError] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  const handleUrlChange = (newUrl: string) => {
    setImageError(false);
    onChange(newUrl);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-slate-700">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {allowClassImageFallback && classImageUrl && classImageUrl !== value && (
            <button
              type="button"
              onClick={() => handleUrlChange(classImageUrl)}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline"
            >
              <CarIcon className="w-3.5 h-3.5" />
              <span>Use Class Photo</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 hover:underline"
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            <span>{showPresets ? 'Hide Presets' : 'Choose Preset'}</span>
          </button>
        </div>
      </div>

      <div className="flex gap-2.5 items-start">
        {/* Live Thumbnail Preview */}
        <div className="w-20 h-14 shrink-0 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden relative flex items-center justify-center shadow-2xs">
          {value && !imageError ? (
            <img
              src={value}
              alt="Vehicle preview"
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 p-1 text-center">
              <span className="text-base leading-none">🚗</span>
              <span className="text-[9px] font-bold mt-0.5">No Image</span>
            </div>
          )}
          {value && (
            <button
              type="button"
              onClick={() => handleUrlChange('')}
              title="Remove image"
              className="absolute top-1 right-1 p-0.5 rounded-full bg-slate-900/70 hover:bg-red-600 text-white transition-colors"
            >
              <TrashIcon className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* URL Input */}
        <div className="flex-1 space-y-1">
          <Input
            type="url"
            placeholder="https://example.com/vehicle-photo.jpg"
            value={value}
            onChange={(e) => handleUrlChange(e.target.value)}
            className="text-xs h-9"
          />
          <p className="text-[10px] text-slate-400">
            {helperText}
          </p>
        </div>
      </div>

      {/* Preset Chooser Carousel / Pills */}
      {showPresets && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
            <span>Select a Stock Preset:</span>
            <button
              type="button"
              onClick={() => setShowPresets(false)}
              className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {VEHICLE_IMAGE_PRESETS.map((preset) => {
              const isSelected = value === preset.url;
              return (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => {
                    handleUrlChange(preset.url);
                    setShowPresets(false);
                  }}
                  className={`flex items-center gap-2 p-1.5 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
                  }`}
                >
                  <img
                    src={preset.url}
                    alt={preset.label}
                    className="w-10 h-7 rounded object-cover shrink-0 bg-slate-100"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-slate-800 truncate">{preset.label}</p>
                    <p className="text-[9px] text-slate-400 capitalize">{preset.category}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
