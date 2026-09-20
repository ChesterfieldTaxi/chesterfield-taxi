import React from 'react';
import type { TariffTaximeterRate } from '~/core/types/tariff';
import { Input } from '~/components/ui/Input';
import { SlidersIcon, ClockIcon, DollarSignIcon, SparklesIcon } from '~/components/ui/Icons';

export interface TaximeterEditorProps {
  taximeter: TariffTaximeterRate;
  onChange: (updated: TariffTaximeterRate) => void;
  readOnly?: boolean;
}

export function TaximeterEditor({
  taximeter,
  onChange,
  readOnly = false,
}: TaximeterEditorProps) {
  const updateField = <K extends keyof TariffTaximeterRate>(field: K, val: number) => {
    onChange({
      ...taximeter,
      [field]: val,
    });
  };

  const primaryStepsPerMile = taximeter.primaryDistanceStep > 0 ? (1.0 / taximeter.primaryDistanceStep) : 10;
  const primaryPerMileRate = (primaryStepsPerMile * taximeter.primaryDistanceRate).toFixed(2);
  const thenStepsPerMile = taximeter.thenDistanceStep > 0 ? (1.0 / taximeter.thenDistanceStep) : 10;
  const thenPerMileRate = (thenStepsPerMile * taximeter.thenDistanceRate).toFixed(2);

  // Hourly waiting calculation
  const stepSec = taximeter.waitingStepSeconds || 60;
  const stepsPerHour = 3600 / stepSec;
  const hourlyRateVal = (stepsPerHour * (taximeter.waitingRatePerStep || 0)).toFixed(2);

  const handleHourlyRateChange = (hourly: number) => {
    const ratePerStep = hourly / stepsPerHour;
    onChange({
      ...taximeter,
      waitingRatePerStep: parseFloat(ratePerStep.toFixed(3)),
    });
  };

  return (
    <div className="space-y-5">
      {/* Overview Stat Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-blue-900 uppercase tracking-wide block">Base Flag Drop</span>
            <span className="text-xl font-bold text-blue-950">${taximeter.startPrice.toFixed(2)}</span>
            <span className="text-[10px] text-blue-700/80 block">Incl: {taximeter.initialDistanceIncluded} mi</span>
          </div>
          <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
            <DollarSignIcon className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wide block">Distance Rate</span>
            <span className="text-xl font-bold text-emerald-950">${primaryPerMileRate} / mi</span>
            <span className="text-[10px] text-emerald-700/80 block">${taximeter.primaryDistanceRate.toFixed(3)} / {taximeter.primaryDistanceStep} mi</span>
          </div>
          <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
            <SlidersIcon className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-purple-50/60 border border-purple-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-purple-900 uppercase tracking-wide block">Waiting / Delay</span>
            <span className="text-xl font-bold text-purple-950">${hourlyRateVal} / hr</span>
            <span className="text-[10px] text-purple-700/80 block">${taximeter.waitingRatePerStep.toFixed(2)} / {stepSec}s</span>
          </div>
          <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
            <ClockIcon className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-amber-900 uppercase tracking-wide block">Minimum Floor</span>
            <span className="text-xl font-bold text-amber-950">${taximeter.minimumPrice.toFixed(2)}</span>
            <span className="text-[10px] text-amber-700/80 block">Lowest fare charged</span>
          </div>
          <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
            <SparklesIcon className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 1. Flag Drop & Included Allowances */}
      <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 inline-flex items-center justify-center text-[11px]">1</span>
            Base Flag Drop & Included Allowances
          </h4>
          <span className="text-[11px] text-slate-500">Initial meter start configuration</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Start Price / Flag Drop ($)</label>
            <Input
              type="number"
              step="0.05"
              min="0"
              disabled={readOnly}
              value={taximeter.startPrice}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('startPrice', parseFloat(e.target.value) || 0)}
              className="bg-white border-slate-300 text-slate-900 font-semibold"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">$0.00 for Airport Flat Rate, $4.50 for METER</span>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Initial Included Distance (mi)</label>
            <Input
              type="number"
              step="0.1"
              min="0"
              disabled={readOnly}
              value={taximeter.initialDistanceIncluded}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('initialDistanceIncluded', parseFloat(e.target.value) || 0)}
              className="bg-white border-slate-300 text-slate-900"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">0.1 mi for METER (covers first 0.1 mi for $4.50)</span>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Initial Included Waiting Time (min)</label>
            <Input
              type="number"
              step="1"
              min="0"
              disabled={readOnly}
              value={taximeter.initialTimeIncluded}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('initialTimeIncluded', parseFloat(e.target.value) || 0)}
              className="bg-white border-slate-300 text-slate-900"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">Free minutes at pickup curb before meter ticks</span>
          </div>
        </div>
      </div>

      {/* 2. Stepped Distance Rate Tiers */}
      <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center justify-center text-[11px]">2</span>
            Stepped Distance Increments & Rate Tiers
          </h4>
          <span className="text-[11px] text-slate-500">Distance increments (default 0.1 mi / 176 yd)</span>
        </div>

        {/* Tier 1 (First X miles) */}
        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              Primary Tier (Up to {taximeter.primaryDistanceLimit} miles)
            </span>
            <span className="text-xs font-semibold text-emerald-700 font-mono bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              ${primaryPerMileRate} / mile (${taximeter.primaryDistanceRate.toFixed(3)} per {taximeter.primaryDistanceStep} mi)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">Step Distance (miles)</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                disabled={readOnly}
                value={taximeter.primaryDistanceStep}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('primaryDistanceStep', parseFloat(e.target.value) || 0.1)}
                className="bg-white border-slate-300 text-slate-900 text-xs font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">Standard: 0.1 mi (1/10th mile)</span>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">Rate per Step ($)</label>
              <Input
                type="number"
                step="0.001"
                min="0"
                disabled={readOnly}
                value={taximeter.primaryDistanceRate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('primaryDistanceRate', parseFloat(e.target.value) || 0)}
                className="bg-white border-slate-300 text-slate-900 text-xs font-mono font-bold"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">$0.255/step ($2.55/mi) or $0.300/step ($3.00/mi)</span>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">Primary Tier Limit (miles)</label>
              <Input
                type="number"
                step="1"
                min="1"
                disabled={readOnly}
                value={taximeter.primaryDistanceLimit}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('primaryDistanceLimit', parseFloat(e.target.value) || 20)}
                className="bg-white border-slate-300 text-slate-900 text-xs font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">20 miles for Airport, 999 for METER</span>
            </div>
          </div>
        </div>

        {/* Tier 2 (Open-ended "Then" rate) */}
        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              Secondary "Then" Tier (Beyond {taximeter.primaryDistanceLimit} miles)
            </span>
            <span className="text-xs font-semibold text-blue-700 font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              ${thenPerMileRate} / mile (${taximeter.thenDistanceRate.toFixed(3)} per {taximeter.thenDistanceStep} mi)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">"Then" Step Distance (miles)</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                disabled={readOnly}
                value={taximeter.thenDistanceStep}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('thenDistanceStep', parseFloat(e.target.value) || 0.1)}
                className="bg-white border-slate-300 text-slate-900 text-xs font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">Standard: 0.1 mi</span>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">"Then" Rate per Step ($)</label>
              <Input
                type="number"
                step="0.001"
                min="0"
                disabled={readOnly}
                value={taximeter.thenDistanceRate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('thenDistanceRate', parseFloat(e.target.value) || 0)}
                className="bg-white border-slate-300 text-slate-900 text-xs font-mono font-bold"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">$0.230/step ($2.30/mi) for Airport after 20 mi</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Traffic Delays, Waiting Rates & Minimum Price Floor */}
      <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 inline-flex items-center justify-center text-[11px]">3</span>
            Traffic Delays, Waiting Rates & Minimum Price Floor
          </h4>
          <span className="text-[11px] text-slate-500">Wait times and bottom floor protection</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-700 block mb-1">Hourly Waiting Rate ($/hr)</label>
            <Input
              type="number"
              step="5.00"
              min="0"
              disabled={readOnly}
              value={parseFloat(hourlyRateVal)}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleHourlyRateChange(parseFloat(e.target.value) || 0)}
              className="bg-white border-slate-300 text-slate-900 text-xs font-bold text-purple-700"
            />
            <span className="text-[10px] text-slate-500 mt-0.5 block">$40.00/hr for METER, $0 for Airport</span>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-700 block mb-1">Waiting Rate per Step ($)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              disabled={readOnly}
              value={taximeter.waitingRatePerStep}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('waitingRatePerStep', parseFloat(e.target.value) || 0)}
              className="bg-white border-slate-300 text-slate-900 text-xs font-mono"
            />
            <span className="text-[10px] text-slate-500 mt-0.5 block">$0.667 per 60s step</span>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-700 block mb-1">Free Traffic Grace (min)</label>
            <Input
              type="number"
              step="1"
              min="0"
              disabled={readOnly}
              value={taximeter.freeTrafficMinutes}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('freeTrafficMinutes', parseFloat(e.target.value) || 0)}
              className="bg-white border-slate-300 text-slate-900 text-xs"
            />
            <span className="text-[10px] text-slate-500 mt-0.5 block">Grace minutes in traffic</span>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-700 block mb-1">Minimum Price Floor ($)</label>
            <Input
              type="number"
              step="1.00"
              min="0"
              disabled={readOnly}
              value={taximeter.minimumPrice}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('minimumPrice', parseFloat(e.target.value) || 0)}
              className="bg-white border-amber-300 text-amber-900 text-xs font-bold"
            />
            <span className="text-[10px] text-amber-800 mt-0.5 block font-semibold">$28.00 Airport / $4.50 METER</span>
          </div>
        </div>
      </div>
    </div>
  );
}
