import React from 'react';
import type { HourlyRateConfig } from '~/core/types/tariff';
import { Input } from '~/components/ui/Input';
import { ClockIcon, DollarSignIcon, SparklesIcon, ShieldCheckIcon } from '~/components/ui/Icons';

export interface HourlyRateEditorProps {
  hourlyConfig?: HourlyRateConfig;
  onChange: (updated: HourlyRateConfig) => void;
  readOnly?: boolean;
}

export function HourlyRateEditor({
  hourlyConfig = {
    ratePerHour: 75.00,
    minimumHours: 2,
    includedMilesPerHour: 20,
    excessMileageRate: 2.50,
  },
  onChange,
  readOnly = false,
}: HourlyRateEditorProps) {
  const updateField = <K extends keyof HourlyRateConfig>(field: K, val: number) => {
    onChange({
      ...hourlyConfig,
      [field]: val,
    });
  };

  const minCharge = (hourlyConfig.minimumHours * hourlyConfig.ratePerHour).toFixed(2);

  return (
    <div className="space-y-5">
      {/* Overview Stat Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wide block">Hourly Charter Rate</span>
            <span className="text-xl font-bold text-emerald-950">${hourlyConfig.ratePerHour.toFixed(2)} / hr</span>
          </div>
          <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
            <ClockIcon className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-blue-900 uppercase tracking-wide block">Minimum Booking</span>
            <span className="text-xl font-bold text-blue-950">{hourlyConfig.minimumHours} Hours</span>
            <span className="text-[10px] text-blue-700 block">${minCharge} minimum charge</span>
          </div>
          <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
            <ShieldCheckIcon className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-amber-900 uppercase tracking-wide block">Mileage Allowance</span>
            <span className="text-xl font-bold text-amber-950">{hourlyConfig.includedMilesPerHour} mi / hr</span>
            <span className="text-[10px] text-amber-700 block">+${(hourlyConfig.excessMileageRate ?? 2.50).toFixed(2)}/mi excess</span>
          </div>
          <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
            <DollarSignIcon className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Charter Parameters */}
      <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3.5">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center justify-center text-[11px]">1</span>
          Charter Parameters & Time Commitment
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Rate per Hour ($)</label>
            <Input
              type="number"
              step="5.00"
              min="0"
              disabled={readOnly}
              value={hourlyConfig.ratePerHour}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('ratePerHour', parseFloat(e.target.value) || 0)}
              className="bg-white border-slate-300 text-slate-900 font-bold"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">Standard hourly charter fee ($75.00/hr)</span>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Minimum Booking (Hours)</label>
            <Input
              type="number"
              step="1"
              min="1"
              disabled={readOnly}
              value={hourlyConfig.minimumHours}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('minimumHours', parseInt(e.target.value, 10) || 1)}
              className="bg-white border-slate-300 text-slate-900"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">Bookings under this limit are billed at minimum (e.g. 2 hrs = $150.00)</span>
          </div>
        </div>
      </div>

      {/* Included Mileage */}
      <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3.5">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 inline-flex items-center justify-center text-[11px]">2</span>
          Included Mileage & Excess Distance Surcharge
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Included Distance per Hour (miles)</label>
            <Input
              type="number"
              step="5"
              min="0"
              disabled={readOnly}
              value={hourlyConfig.includedMilesPerHour}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('includedMilesPerHour', parseFloat(e.target.value) || 0)}
              className="bg-white border-slate-300 text-slate-900"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">e.g. 20 miles per hour (60 miles total for a 3-hour charter)</span>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Excess Mileage Surcharge ($/mile)</label>
            <Input
              type="number"
              step="0.25"
              min="0"
              disabled={readOnly}
              value={hourlyConfig.excessMileageRate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('excessMileageRate', parseFloat(e.target.value) || 0)}
              className="bg-white border-slate-300 text-slate-900 font-medium"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">Billed per mile over cumulative included distance ($2.50/mi)</span>
          </div>
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-2.5">
        <SparklesIcon className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block mb-0.5">Dedicated Charter Protection</span>
          Hourly charters reserve dedicated vehicle and driver availability. Meter waiting delays and intermediate stop fees are waived because hourly service directly compensates driver time.
        </div>
      </div>
    </div>
  );
}
