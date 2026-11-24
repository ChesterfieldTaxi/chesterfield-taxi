import React, { useState, useEffect, useMemo } from 'react';
import {
  formatLocalizationPreviewSample,
  normalizeLocalizationConfig,
  resolveCurrencySymbol,
  type AppSettings,
  type LocalizationConfig,
} from '../../../../core/types/config';
import { Button } from '../../../ui/Button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../../../ui/Card';
import { Input } from '../../../ui/Input';
import { Select } from '../../../ui/Select';
import { Alert } from '../../../ui/Alert';
import { CheckIcon, ClockIcon, GlobeIcon } from '../../../ui/Icons';

export interface LocalizationAndUnitsPanelProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
}

export function LocalizationAndUnitsPanel({
  settings,
  onSave,
  isLoading = false,
}: LocalizationAndUnitsPanelProps) {
  const [localization, setLocalization] = useState<Required<LocalizationConfig>>(() =>
    normalizeLocalizationConfig(settings.localization)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLocalization(normalizeLocalizationConfig(settings.localization));
  }, [settings.localization]);

  const sample = useMemo(
    () => formatLocalizationPreviewSample(localization),
    [localization]
  );

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setIsSaving(true);
      setSaveSuccess(null);
      setSaveError(null);
      const normalized = normalizeLocalizationConfig(localization);
      setLocalization(normalized);
      await onSave({ localization: normalized });
      setSaveSuccess('Time format, operational units, currency, and regional defaults saved.');
      setTimeout(() => setSaveSuccess(null), 5000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save localization settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Contextual Top Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white p-3 sm:px-4 sm:py-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <GlobeIcon className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs font-bold text-slate-700 truncate">
            Time Format, Distance/Speed Units &amp; Regional Localization
          </span>
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          isLoading={isSaving || isLoading}
          leftIcon={<CheckIcon className="w-4 h-4" />}
          className="w-full sm:w-auto justify-center shrink-0"
        >
          Save Time &amp; Units
        </Button>
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Saved">
          {saveSuccess}
        </Alert>
      )}
      {saveError && (
        <Alert variant="error" title="Error">
          {saveError}
        </Alert>
      )}

      {/* Live Formatted Sample Preview Bar */}
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-3 border-b border-slate-800 text-[11px]">
          <span className="font-extrabold uppercase tracking-wider text-blue-400">
            Live Formatting Preview ({localization.timezone})
          </span>
          <span className="text-slate-400 font-medium truncate">
            {localization.defaultServiceRegion}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Sample Date</span>
            <span className="font-mono font-extrabold text-white">{sample.dateSample}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Clock Time</span>
            <span className="font-mono font-extrabold text-emerald-400">{sample.timeSample}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Trip Distance</span>
            <span className="font-mono font-extrabold text-white">{sample.distanceSample}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Speed &amp; Temp</span>
            <span className="font-mono font-extrabold text-white">
              {sample.speedSample} · {sample.temperatureSample}
            </span>
          </div>
          <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Sample Fare</span>
            <span className="font-mono font-extrabold text-amber-300">{sample.fareSample}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Clock, Timezone & Date Formatting */}
        <div className="lg:col-span-6">
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                <ClockIcon className="w-4 h-4 text-blue-600" />
                Timezone, Clock &amp; Calendar Format
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Controls scheduled pickup timestamps across Dispatch, Driver HUD, and receipts.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Operational Timezone
                </label>
                <Select
                  size="md"
                  value={localization.timezone}
                  onChange={(e) =>
                    setLocalization((prev) => ({ ...prev, timezone: e.target.value }))
                  }
                >
                  <option value="America/Chicago">America/Chicago (Central Time – St. Louis)</option>
                  <option value="America/New_York">America/New_York (Eastern Time)</option>
                  <option value="America/Denver">America/Denver (Mountain Time)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (Pacific Time)</option>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Clock Time Format
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(
                    [
                      { id: '12h', label: '12-Hour (2:30 PM)', hint: 'Standard AM / PM' },
                      { id: '24h', label: '24-Hour (14:30)', hint: 'Military / Dispatch' },
                    ] as const
                  ).map((opt) => {
                    const active = localization.timeFormat === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setLocalization((prev) => ({ ...prev, timeFormat: opt.id }))
                        }
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 text-blue-950'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="font-extrabold text-xs">{opt.label}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{opt.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Date Display Format
                </label>
                <Select
                  size="md"
                  value={localization.dateFormat}
                  onChange={(e) =>
                    setLocalization((prev) => ({ ...prev, dateFormat: e.target.value }))
                  }
                >
                  <option value="MM/DD/YYYY">MM/DD/YYYY (US Standard)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (ISO 8601)</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY (International)</option>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Measurement Units, Currency & Default Region */}
        <div className="lg:col-span-6">
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                <GlobeIcon className="w-4 h-4 text-emerald-600" />
                Units, Currency &amp; Default Service Region
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Distance, telemetry speed, weather unit, currency code, and regional coverage label.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Distance Unit</label>
                  <Select
                    size="md"
                    value={localization.distanceUnit}
                    onChange={(e) =>
                      setLocalization((prev) => ({
                        ...prev,
                        distanceUnit: e.target.value === 'km' ? 'km' : 'mi',
                      }))
                    }
                  >
                    <option value="mi">Miles (mi)</option>
                    <option value="km">Kilometers (km)</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Speed Unit</label>
                  <Select
                    size="md"
                    value={localization.speedUnit}
                    onChange={(e) =>
                      setLocalization((prev) => ({
                        ...prev,
                        speedUnit: e.target.value === 'kmh' ? 'kmh' : 'mph',
                      }))
                    }
                  >
                    <option value="mph">mph</option>
                    <option value="kmh">km/h</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Temperature</label>
                  <Select
                    size="md"
                    value={localization.temperatureUnit}
                    onChange={(e) =>
                      setLocalization((prev) => ({
                        ...prev,
                        temperatureUnit: e.target.value === 'C' ? 'C' : 'F',
                      }))
                    }
                  >
                    <option value="F">Fahrenheit (°F)</option>
                    <option value="C">Celsius (°C)</option>
                  </Select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Currency &amp; Symbol
                </label>
                <Select
                  size="md"
                  value={localization.currency}
                  onChange={(e) =>
                    setLocalization((prev) => ({
                      ...prev,
                      currency: e.target.value,
                      currencySymbol: resolveCurrencySymbol(e.target.value),
                    }))
                  }
                >
                  <option value="USD">USD ($) – US Dollar</option>
                  <option value="CAD">CAD ($) – Canadian Dollar</option>
                  <option value="EUR">EUR (€) – Euro</option>
                  <option value="GBP">GBP (£) – British Pound</option>
                </Select>
              </div>

              <Input
                label="Default Service Region Label"
                value={localization.defaultServiceRegion}
                onChange={(e) =>
                  setLocalization((prev) => ({
                    ...prev,
                    defaultServiceRegion: e.target.value,
                  }))
                }
                placeholder="Chesterfield & St. Louis Metro, MO"
              />
            </CardContent>
            <CardFooter className="bg-slate-50/50 px-5 py-3.5 border-t border-slate-100 flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSaving || isLoading}
                leftIcon={<CheckIcon className="w-4 h-4" />}
              >
                Save Regional &amp; Units
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </form>
  );
}
