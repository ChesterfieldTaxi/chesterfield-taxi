import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Badge } from '../../ui/Badge';
import {
  ShieldCheckIcon,
  SpinnerIcon,
  CheckIcon,
  AlertTriangleIcon,
  ClockIcon,
  SlidersIcon,
  LockIcon,
  UserIcon,
  CarIcon,
  SparklesIcon,
  MapPinIcon,
  DollarSignIcon,
  CompassIcon,
  InfoIcon,
} from '../../ui/Icons';
import {
  BookingRulesEngine,
  type BookingRulesConfig,
  type BookingExecutionMode,
  type ModularTierConfig,
  type RuleLocationMode,
  type RuleTimeMode,
  type RulePaymentMethod,
  DEFAULT_BOOKING_RULES_CONFIG,
} from '../../../core/services/bookingRulesEngine';
import { getAdminConfigService, DEFAULT_CUSTOMER_BOOKING_CONFIG } from '../../../core/services/config/admin-config.service';
import { getZoneService } from '../../../core/services/zones/zone.service';
import type { ZoneGeofence } from '../../../core/types/zone';

interface ModularTierCardProps {
  tierKey: 'tier1' | 'tier2' | 'tier3';
  tierNumber: 1 | 2 | 3;
  title: string;
  subtitle: string;
  colorTheme: 'emerald' | 'amber' | 'rose';
  config: ModularTierConfig;
  zones: ZoneGeofence[];
  onChange: (updated: ModularTierConfig) => void;
}

const PAYMENT_OPTIONS: { id: RulePaymentMethod; label: string; hint: string }[] = [
  { id: 'prepaid', label: 'Prepaid In-App', hint: 'Card or digital wallet charged online' },
  { id: 'corporate', label: 'Corporate Account', hint: 'Direct invoicing billing contract' },
  { id: 'card', label: 'Credit Card (In-Car)', hint: 'Swiped/inserted with driver POS' },
  { id: 'cash', label: 'Cash on Board', hint: 'Direct cash payment to operator' },
  { id: 'voucher', label: 'Voucher / Invoiced', hint: 'Government or partner vouchers' },
];

const VEHICLE_TIER_OPTIONS = [
  { id: 'standard', label: 'Standard Sedan' },
  { id: 'premium', label: 'Executive Premium' },
  { id: 'xl', label: 'XL 6-Passenger SUV' },
  { id: 'wheelchair', label: 'Wheelchair WAV' },
];

function ModularTierCard({
  tierKey,
  tierNumber,
  title,
  subtitle,
  colorTheme,
  config,
  zones,
  onChange,
}: ModularTierCardProps) {
  const themeClasses = {
    emerald: {
      border: 'border-emerald-300',
      badgeBg: 'bg-emerald-600 text-white',
      headerBg: 'bg-emerald-50/70 border-b border-emerald-200/60',
      activeText: 'text-emerald-800',
      accentColor: 'emerald',
      lightBox: 'bg-emerald-50/40 border-emerald-200/70',
      pillActive: 'bg-emerald-600 text-white border-emerald-600',
    },
    amber: {
      border: 'border-amber-300',
      badgeBg: 'bg-amber-600 text-white',
      headerBg: 'bg-amber-50/70 border-b border-amber-200/60',
      activeText: 'text-amber-800',
      accentColor: 'amber',
      lightBox: 'bg-amber-50/40 border-amber-200/70',
      pillActive: 'bg-amber-600 text-white border-amber-600',
    },
    rose: {
      border: 'border-rose-300',
      badgeBg: 'bg-rose-600 text-white',
      headerBg: 'bg-rose-50/70 border-b border-rose-200/60',
      activeText: 'text-rose-800',
      accentColor: 'rose',
      lightBox: 'bg-rose-50/40 border-rose-200/70',
      pillActive: 'bg-rose-600 text-white border-rose-600',
    },
  }[colorTheme];

  const update = (partial: Partial<ModularTierConfig>) => {
    onChange({ ...config, ...partial });
  };

  const togglePaymentMethod = (method: RulePaymentMethod) => {
    const current = config.paymentMethods || [];
    if (current.includes(method)) {
      update({ paymentMethods: current.filter((m) => m !== method) });
    } else {
      update({ paymentMethods: [...current, method] });
    }
  };

  const toggleZone = (type: 'pickup' | 'dropoff', zoneId: string) => {
    if (type === 'pickup') {
      const current = config.pickupZoneIds || [];
      if (current.includes(zoneId)) {
        update({ pickupZoneIds: current.filter((id) => id !== zoneId) });
      } else {
        update({ pickupZoneIds: [...current, zoneId] });
      }
    } else {
      const current = config.dropoffZoneIds || [];
      if (current.includes(zoneId)) {
        update({ dropoffZoneIds: current.filter((id) => id !== zoneId) });
      } else {
        update({ dropoffZoneIds: [...current, zoneId] });
      }
    }
  };

  const toggleVehicleTier = (tierId: string) => {
    const current = config.allowedVehicleTiers || [];
    if (current.includes(tierId)) {
      update({ allowedVehicleTiers: current.filter((id) => id !== tierId) });
    } else {
      update({ allowedVehicleTiers: [...current, tierId] });
    }
  };

  return (
    <Card className={`border-2 shadow-xs transition-all ${themeClasses.border} overflow-hidden`}>
      {/* ─── Card Header ─── */}
      <div className={`p-4 sm:p-5 ${themeClasses.headerBg} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div className="flex items-start sm:items-center gap-3">
          <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md ${themeClasses.badgeBg}`}>
            Tier {tierNumber} Controls
          </span>
          <div>
            <h3 className="text-base font-black text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500 font-medium">{subtitle}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer self-start sm:self-auto shrink-0 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span className="text-xs font-bold text-slate-800">
            Enable Tier {tierNumber}
          </span>
        </label>
      </div>

      <CardContent className="p-4 sm:p-6 space-y-6 bg-white">
        {/* ─── 1. Customer Score & Rider Verification ─── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
            <UserIcon className="w-4 h-4 text-slate-500" />
            <span>1. Customer Score &amp; Rider Profile</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">Customer Score Floor (Min)</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800">
                  ★ {config.customerScoreMin}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={config.customerScoreMin}
                onChange={(e) => update({ customerScoreMin: parseInt(e.target.value) || 0 })}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-medium mt-1">
                <span>0 (Any)</span>
                <span>50</span>
                <span>100 (VIP only)</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">Customer Score Ceiling (Max)</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800">
                  ★ {config.customerScoreMax}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={config.customerScoreMax}
                onChange={(e) => update({ customerScoreMax: parseInt(e.target.value) || 100 })}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-medium mt-1">
                <span>0</span>
                <span>Target Band: [{config.customerScoreMin} – {config.customerScoreMax}]</span>
                <span>100</span>
              </div>
            </div>

            <div className="md:col-span-2 pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.allowUnratedGuests}
                  onChange={(e) => update({ allowUnratedGuests: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs font-medium text-slate-700">
                  Apply rule to first-time unrated guest riders (accounts with no score history)
                </span>
              </label>
              <span className="text-[11px] text-slate-400 italic">
                Active band: {config.customerScoreMin} to {config.customerScoreMax} points
              </span>
            </div>
          </div>
        </div>

        {/* ─── 2. Granular Separated Spatial Routing ─── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
            <MapPinIcon className="w-4 h-4 text-slate-500" />
            <span>2. Granular Spatial Routing (Separated Pickup &amp; Dropoff)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pickup Location Control */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Pickup Location Scope
                </span>
                <Badge variant="neutral" size="sm" className="font-mono text-[10px]">
                  {config.pickupLocationMode.toUpperCase()}
                </Badge>
              </div>

              <select
                value={config.pickupLocationMode}
                onChange={(e) => update({ pickupLocationMode: e.target.value as RuleLocationMode })}
                className="w-full text-xs font-semibold py-2 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="all">Any Location (All Operational Zones)</option>
                <option value="specific_zones">Specific Monitored / Whitelisted Zones</option>
                <option value="airports">Airport Terminals &amp; Perimeters Only</option>
                <option value="prohibited_only">Prohibited Safety Exclusion Geofences</option>
                <option value="outside_service_area">Outside Service Perimeter / County</option>
              </select>

              {config.pickupLocationMode === 'specific_zones' && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600 block">Select Target Pickup Zones:</span>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-white rounded-lg border border-slate-200">
                    {zones.length === 0 ? (
                      <span className="text-xs text-slate-400 p-2">No active zones configured</span>
                    ) : (
                      zones.map((z) => {
                        const isSelected = (config.pickupZoneIds || []).includes(z.id);
                        return (
                          <button
                            key={z.id}
                            type="button"
                            onClick={() => toggleZone('pickup', z.id)}
                            className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-bold'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {isSelected && '✓ '}
                            {z.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Dropoff Location Control */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Dropoff Location Scope
                </span>
                <Badge variant="neutral" size="sm" className="font-mono text-[10px]">
                  {config.dropoffLocationMode.toUpperCase()}
                </Badge>
              </div>

              <select
                value={config.dropoffLocationMode}
                onChange={(e) => update({ dropoffLocationMode: e.target.value as RuleLocationMode })}
                className="w-full text-xs font-semibold py-2 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="all">Any Location (All Operational Zones)</option>
                <option value="specific_zones">Specific Monitored / Whitelisted Zones</option>
                <option value="airports">Airport Terminals &amp; Perimeters Only</option>
                <option value="prohibited_only">Prohibited Safety Exclusion Geofences</option>
                <option value="outside_service_area">Outside Service Perimeter / County</option>
              </select>

              {config.dropoffLocationMode === 'specific_zones' && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600 block">Select Target Dropoff Zones:</span>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-white rounded-lg border border-slate-200">
                    {zones.length === 0 ? (
                      <span className="text-xs text-slate-400 p-2">No active zones configured</span>
                    ) : (
                      zones.map((z) => {
                        const isSelected = (config.dropoffZoneIds || []).includes(z.id);
                        return (
                          <button
                            key={z.id}
                            type="button"
                            onClick={() => toggleZone('dropoff', z.id)}
                            className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-bold'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {isSelected && '✓ '}
                            {z.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── 3. Time Schedule & Fare Bounds ─── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
            <ClockIcon className="w-4 h-4 text-slate-500" />
            <span>3. Operating Schedule &amp; Fare Bounds</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            {/* Time Schedule */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-700 block">Operating Time Schedule</span>
              <select
                value={config.timeMode}
                onChange={(e) => update({ timeMode: e.target.value as RuleTimeMode })}
                className="w-full text-xs font-semibold py-2 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="all_hours">24/7 Continuous (All Hours)</option>
                <option value="custom_window">Custom Operating Hours Window</option>
                <option value="late_night">Late Night Enforcement Window</option>
              </select>

              {config.timeMode !== 'all_hours' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Start Hour (24h)</label>
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={config.startHour}
                      onChange={(e) => update({ startHour: parseInt(e.target.value) || 0 })}
                      className="text-xs h-8 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">End Hour (24h)</label>
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={config.endHour}
                      onChange={(e) => update({ endHour: parseInt(e.target.value) || 0 })}
                      className="text-xs h-8 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Fare Bounds */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-700 block">Trip Price &amp; Fare Boundaries</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Min Price ($)</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-400 text-xs font-bold">$</span>
                    <Input
                      type="number"
                      min="0"
                      value={config.minPrice}
                      onChange={(e) => update({ minPrice: parseFloat(e.target.value) || 0 })}
                      className="text-xs h-8 pl-6 bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Max Price ($)</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-400 text-xs font-bold">$</span>
                    <Input
                      type="number"
                      min="0"
                      value={config.maxPrice}
                      onChange={(e) => update({ maxPrice: parseFloat(e.target.value) || 0 })}
                      className="text-xs h-8 pl-6 bg-white"
                    />
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Trips outside this fare window trigger rule escalation.
              </span>
            </div>
          </div>
        </div>

        {/* ─── 4. Payment Types Matrix ─── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
            <DollarSignIcon className="w-4 h-4 text-slate-500" />
            <span>4. Payment Types Matrix (Select applicable payment methods)</span>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {PAYMENT_OPTIONS.map((opt) => {
                const isSelected = (config.paymentMethods || []).includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => togglePaymentMethod(opt.id)}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-2xs font-semibold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 pointer-events-none"
                    />
                    <div>
                      <div className="text-xs font-bold">{opt.label}</div>
                      <div className="text-[10px] text-slate-500 leading-tight">{opt.hint}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-slate-400 italic pt-1">
              Selected: {(config.paymentMethods || []).map((p) => p.toUpperCase()).join(', ') || 'None selected'}
            </div>
          </div>
        </div>

        {/* ─── 5. Advanced Booking Conditions & Operational Flags ─── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
            <SparklesIcon className="w-4 h-4 text-slate-500" />
            <span>5. Advanced Booking Complexity &amp; Operational Flags</span>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={config.matchReturnBooked}
                  onChange={(e) => update({ matchReturnBooked: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">🔄 Return Trip Booked</span>
                  <span className="text-[11px] text-slate-500">Apply rule when round-trip reservation is detected</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={config.matchSeparateContactPerson}
                  onChange={(e) => update({ matchSeparateContactPerson: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">👤 Separate Contact Person</span>
                  <span className="text-[11px] text-slate-500">Apply rule when booker is different from passenger</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={config.matchIntermediateStops}
                  onChange={(e) => update({ matchIntermediateStops: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">🛑 Multiple / Intermediate Stops</span>
                  <span className="text-[11px] text-slate-500">Apply rule when trip includes 1+ intermediate waypoints</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={config.matchMultipleVehicles}
                  onChange={(e) => update({ matchMultipleVehicles: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">🚗 Multiple Vehicles Requested</span>
                  <span className="text-[11px] text-slate-500">Apply rule when reservation requests 2 or more cars</span>
                </div>
              </label>
            </div>

            {/* Vehicle Classes & Driver Standards */}
            <div className="pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1.5">Allowed Vehicle Service Classes:</span>
                <div className="flex flex-wrap gap-1.5">
                  {VEHICLE_TIER_OPTIONS.map((vt) => {
                    const isSelected = (config.allowedVehicleTiers || []).includes(vt.id);
                    return (
                      <button
                        key={vt.id}
                        type="button"
                        onClick={() => toggleVehicleTier(vt.id)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 font-bold'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected && '✓ '}
                        {vt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Min Driver Score for Premium Tiers
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={config.minDriverScoreForPremium ?? 85}
                    onChange={(e) => update({ minDriverScoreForPremium: parseInt(e.target.value) || 0 })}
                    className="text-xs h-8 w-24 bg-white"
                  />
                  <span className="text-xs text-slate-500">/ 100 points minimum</span>
                </div>
              </div>
            </div>

            {/* Tier 3 Security Safeguards (Only on Tier 3) */}
            {tierKey === 'tier3' && (
              <div className="pt-3 border-t border-rose-200 bg-rose-50/50 p-3 rounded-xl space-y-2">
                <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                  <LockIcon className="w-3.5 h-3.5 text-rose-600" />
                  Enterprise Security &amp; Audit Safeguards
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.enforcePassengerBlacklist ?? true}
                      onChange={(e) => update({ enforcePassengerBlacklist: e.target.checked })}
                      className="w-3.5 h-3.5 rounded text-rose-600"
                    />
                    <span className="font-medium text-slate-800">Block blacklisted passenger accounts</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.enforceVehicleGrounding ?? true}
                      onChange={(e) => update({ enforceVehicleGrounding: e.target.checked })}
                      className="w-3.5 h-3.5 rounded text-rose-600"
                    />
                    <span className="font-medium text-slate-800">Block grounded fleet vehicles</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.securityAuditLogging ?? true}
                      onChange={(e) => update({ securityAuditLogging: e.target.checked })}
                      className="w-3.5 h-3.5 rounded text-rose-600"
                    />
                    <span className="font-medium text-slate-800">Log immutable security audit events</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminRulesTab() {
  const [config, setConfig] = useState<BookingRulesConfig>(() => {
    const cached = getAdminConfigService().getCachedSettings();
    const raw = cached.bookingRulesConfig;
    return {
      ...DEFAULT_BOOKING_RULES_CONFIG,
      ...(raw || {}),
      tier1: {
        ...DEFAULT_BOOKING_RULES_CONFIG.tier1,
        ...(raw?.tier1 || {}),
      },
      tier2: {
        ...DEFAULT_BOOKING_RULES_CONFIG.tier2,
        ...(raw?.tier2 || {}),
      },
      tier3: {
        ...DEFAULT_BOOKING_RULES_CONFIG.tier3,
        ...(raw?.tier3 || {}),
      },
    };
  });

  const [zones, setZones] = useState<ZoneGeofence[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [lambertInstructions, setLambertInstructions] = useState<string>(() => {
    const cached = getAdminConfigService().getCachedSettings();
    return (
      cached.customerBookingConfig?.lambertPickupInstructions ||
      'Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2. Chauffeur tracks flight arrival in real-time.'
    );
  });

  // ─── Real-Time Interactive Simulator State ───
  const [simCustomerScore, setSimCustomerScore] = useState<number>(85);
  const [simIsUnratedGuest, setSimIsUnratedGuest] = useState<boolean>(false);
  const [simPickupZoneId, setSimPickupZoneId] = useState<string>('any');
  const [simDropoffZoneId, setSimDropoffZoneId] = useState<string>('any');
  const [simPickupHour, setSimPickupHour] = useState<number>(14);
  const [simFare, setSimFare] = useState<number>(45);
  const [simPaymentMethod, setSimPaymentMethod] = useState<RulePaymentMethod>('prepaid');
  const [simReturnBooked, setSimReturnBooked] = useState<boolean>(false);
  const [simSeparateContact, setSimSeparateContact] = useState<boolean>(false);
  const [simHasStops, setSimHasStops] = useState<boolean>(false);
  const [simMultipleVehicles, setSimMultipleVehicles] = useState<boolean>(false);
  const [simVehicleTier, setSimVehicleTier] = useState<string>('standard');

  useEffect(() => {
    const zService = getZoneService();
    zService
      .getZones()
      .then((res) => {
        setZones(res.filter((z) => z.isActive && !z.isArchived));
      })
      .catch(() => {});

    const unsub = getAdminConfigService().subscribeToSettings((s) => {
      if (s.bookingRulesConfig) {
        setConfig({
          ...DEFAULT_BOOKING_RULES_CONFIG,
          ...s.bookingRulesConfig,
          tier1: {
            ...DEFAULT_BOOKING_RULES_CONFIG.tier1,
            ...(s.bookingRulesConfig?.tier1 || {}),
          },
          tier2: {
            ...DEFAULT_BOOKING_RULES_CONFIG.tier2,
            ...(s.bookingRulesConfig?.tier2 || {}),
          },
          tier3: {
            ...DEFAULT_BOOKING_RULES_CONFIG.tier3,
            ...(s.bookingRulesConfig?.tier3 || {}),
          },
        });
      }
      if (s.customerBookingConfig?.lambertPickupInstructions !== undefined) {
        setLambertInstructions(s.customerBookingConfig.lambertPickupInstructions);
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      // Sync backward compatibility fields
      const syncConfig: BookingRulesConfig = {
        ...config,
        minimumCustomerScoreForAutoConfirm: config.tier1.customerScoreMin ?? 70,
        minimumDriverScoreForPremium: config.tier2.minDriverScoreForPremium ?? 85,
        lateNightReviewRequired: config.tier2.timeMode === 'late_night',
        lateNightStartHour: config.tier2.startHour ?? 23,
        lateNightEndHour: config.tier2.endHour ?? 4,
        blacklistEnabled: config.tier3.enabled ?? true,
      };

      await getAdminConfigService().updateSettings({
        bookingRulesConfig: syncConfig,
        customerBookingConfig: {
          ...DEFAULT_CUSTOMER_BOOKING_CONFIG,
          ...(getAdminConfigService().getCachedSettings().customerBookingConfig || {}),
          lambertPickupInstructions: lambertInstructions,
        },
      });
      setSaveStatus('Booking rules successfully saved and active.');
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err: any) {
      console.error('Failed to save booking rules:', err);
      setSaveStatus('Error saving booking rules: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Real-Time Simulation Calculation ───
  const simResult = useMemo(() => {
    const engine = new BookingRulesEngine(config);

    const scheduledDate = new Date();
    scheduledDate.setHours(simPickupHour, 0, 0, 0);

    const isPickupAirport = simPickupZoneId === 'airport';
    const isDropoffAirport = simDropoffZoneId === 'airport';
    const isPickupProhibited = simPickupZoneId === 'prohibited';
    const isDropoffProhibited = simDropoffZoneId === 'prohibited';

    return engine.evaluateBookingRequest(
      {
        fare: simFare,
        fareEstimate: simFare,
        scheduledPickupTime: scheduledDate.toISOString(),
        paymentMethod: simPaymentMethod,
        hasReturnTrip: simReturnBooked,
        hasSeparateContactPerson: simSeparateContact,
        hasIntermediateStops: simHasStops,
        multipleVehiclesRequested: simMultipleVehicles,
        vehicleTier: simVehicleTier as any,
        pickupZoneId: simPickupZoneId !== 'any' ? simPickupZoneId : undefined,
        dropoffZoneId: simDropoffZoneId !== 'any' ? simDropoffZoneId : undefined,
        isPickupAirport,
        isDropoffAirport,
        isPickupProhibited,
        isDropoffProhibited,
        pickupAirportCode: isPickupAirport ? 'STL' : undefined,
      },
      simIsUnratedGuest
        ? undefined
        : ({
            id: 'sim-customer-1',
            email: 'sim@example.com',
            phone: '314-555-0199',
            fullName: 'Simulated Passenger',
            customerScore: simCustomerScore,
            isBlacklisted: false,
          } as any)
    );
  }, [
    config,
    simCustomerScore,
    simIsUnratedGuest,
    simPickupZoneId,
    simDropoffZoneId,
    simPickupHour,
    simFare,
    simPaymentMethod,
    simReturnBooked,
    simSeparateContact,
    simHasStops,
    simMultipleVehicles,
    simVehicleTier,
  ]);

  return (
    <div className="space-y-8 max-w-6xl pb-16">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-700">
              <SlidersIcon className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-black text-slate-900">3-Tier Conditional Booking Rules Engine</h2>
              <p className="text-xs text-slate-500 font-medium">
                Unified, identical modular controls across Auto-Confirm, Review Holds, and Security Blocks.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold shadow-xs cursor-pointer"
          >
            {isSaving ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
            Save All Rule Tiers
          </Button>
        </div>
      </div>

      {saveStatus && (
        <div
          className={`p-4 rounded-xl border text-xs font-bold ${
            saveStatus.includes('Error')
              ? 'bg-rose-50 text-rose-800 border-rose-300'
              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
          }`}
        >
          {saveStatus}
        </div>
      )}

      {/* ─── THE 3 IDENTICAL MODULAR TIER CARDS ─── */}
      <div className="space-y-6">
        {/* TIER 1: AUTO-CONFIRM */}
        <ModularTierCard
          tierKey="tier1"
          tierNumber={1}
          title="Tier 1: Auto-Confirm Direct Pass-Through"
          subtitle="Trips satisfying all Tier 1 criteria bypass dispatcher review and dispatch automatically."
          colorTheme="emerald"
          config={config.tier1}
          zones={zones}
          onChange={(t1) => setConfig({ ...config, tier1: t1 })}
        />

        {/* TIER 2: REQUIRE REVIEW */}
        <ModularTierCard
          tierKey="tier2"
          tierNumber={2}
          title="Tier 2: Require Human Review &amp; Dispatch Queue"
          subtitle="Trips triggering any Tier 2 criteria are placed in the review queue for dispatcher manual clearance."
          colorTheme="amber"
          config={config.tier2}
          zones={zones}
          onChange={(t2) => setConfig({ ...config, tier2: t2 })}
        />

        {/* TIER 3: BLACKLIST & SECURITY BLOCK */}
        <ModularTierCard
          tierKey="tier3"
          tierNumber={3}
          title="Tier 3: Universal Hard Blacklist &amp; Security Block"
          subtitle="Zero-tolerance safety controls. Immediate 403 rejection with immutable audit logging."
          colorTheme="rose"
          config={config.tier3}
          zones={zones}
          onChange={(t3) => setConfig({ ...config, tier3: t3 })}
        />

        {/* AIRPORT RULES & CURBSIDE PICKUP INSTRUCTIONS CARD */}
        <div className="p-5 bg-white border border-blue-200 rounded-2xl shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">✈️</span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  STL Lambert Airport Curbside Pickup Location Description
                </h3>
                <p className="text-xs text-slate-500">
                  Curbside doors, terminal baggage claim instructions, or specific chauffeur meetup points shown to passengers in confirmation emails and receipts when pickup is STL Lambert Airport.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100 uppercase tracking-wider self-start sm:self-auto">
              Airport Rules
            </span>
          </div>

          <textarea
            rows={3}
            value={lambertInstructions}
            onChange={(e) => setLambertInstructions(e.target.value)}
            placeholder="e.g. Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2. Chauffeur tracks flight arrival in real-time."
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
          />
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Also synced automatically with Website Studio &rarr; Form Controls &rarr; Airport Rules.</span>
            <Button
              size="sm"
              variant="outline"
              disabled={isSaving}
              onClick={handleSave}
              className="text-xs font-bold"
            >
              Save Airport Description
            </Button>
          </div>
        </div>
      </div>

      {/* ─── LIVE EVALUATION SANDBOX & SIMULATOR ─── */}
      <Card className="border-2 border-indigo-200 shadow-md overflow-hidden bg-slate-50/60">
        <div className="p-4 sm:p-5 bg-indigo-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-indigo-800 rounded-xl text-indigo-200">
              <SparklesIcon className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-black">Live 3-Tier Evaluation Sandbox &amp; Simulator</h3>
              <p className="text-xs text-indigo-200">
                Test ride parameters instantly against all configured tiers in real time.
              </p>
            </div>
          </div>
          <Badge variant="primary" size="sm" className="bg-indigo-700 text-indigo-100 border-indigo-500 font-mono">
            REAL-TIME EXECUTION
          </Badge>
        </div>

        <CardContent className="p-4 sm:p-6 space-y-6">
          {/* Simulator Controls Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
            {/* Customer Score */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Customer Score</span>
                <span className="text-xs font-black px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  {simIsUnratedGuest ? 'Unrated' : `★ ${simCustomerScore}`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                disabled={simIsUnratedGuest}
                value={simCustomerScore}
                onChange={(e) => setSimCustomerScore(parseInt(e.target.value) || 0)}
                className="w-full accent-blue-600 cursor-pointer disabled:opacity-40"
              />
              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-600 pt-1">
                <input
                  type="checkbox"
                  checked={simIsUnratedGuest}
                  onChange={(e) => setSimIsUnratedGuest(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Simulate 1st-Time Guest Rider</span>
              </label>
            </div>

            {/* Separated Pickup Location */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Pickup Location</span>
              <select
                value={simPickupZoneId}
                onChange={(e) => setSimPickupZoneId(e.target.value)}
                className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800"
              >
                <option value="any">Standard Service Area</option>
                <option value="airport">✈️ STL Airport Terminal</option>
                <option value="prohibited">⛔ Prohibited Geofence Zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    📍 {z.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Separated Dropoff Location */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Dropoff Location</span>
              <select
                value={simDropoffZoneId}
                onChange={(e) => setSimDropoffZoneId(e.target.value)}
                className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800"
              >
                <option value="any">Standard Service Area</option>
                <option value="airport">✈️ STL Airport Terminal</option>
                <option value="prohibited">⛔ Prohibited Geofence Zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    📍 {z.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Pickup Hour */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Pickup Hour</span>
                <span className="text-xs font-black px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                  {simPickupHour.toString().padStart(2, '0')}:00
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="23"
                value={simPickupHour}
                onChange={(e) => setSimPickupHour(parseInt(e.target.value) || 0)}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <span className="text-[10px] text-slate-400 block">
                {simPickupHour >= 23 || simPickupHour < 4 ? '🌙 Late Night Window' : '☀️ Standard Operating Hours'}
              </span>
            </div>

            {/* Estimated Fare */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Estimated Fare ($)</span>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400 text-xs font-bold">$</span>
                <Input
                  type="number"
                  min="0"
                  value={simFare}
                  onChange={(e) => setSimFare(parseFloat(e.target.value) || 0)}
                  className="text-xs h-9 pl-6 bg-slate-50"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Payment Method</span>
              <select
                value={simPaymentMethod}
                onChange={(e) => setSimPaymentMethod(e.target.value as RulePaymentMethod)}
                className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800"
              >
                <option value="prepaid">Prepaid In-App</option>
                <option value="corporate">Corporate Account</option>
                <option value="card">Credit Card (In-Car)</option>
                <option value="cash">Cash on Board</option>
                <option value="voucher">Voucher / Invoiced</option>
              </select>
            </div>

            {/* Vehicle Tier */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Vehicle Class Tier</span>
              <select
                value={simVehicleTier}
                onChange={(e) => setSimVehicleTier(e.target.value)}
                className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800"
              >
                <option value="standard">Standard Sedan</option>
                <option value="premium">Executive Premium</option>
                <option value="xl">XL SUV (6-Passenger)</option>
                <option value="wheelchair">Wheelchair WAV</option>
              </select>
            </div>

            {/* Operational Flags Toggles */}
            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-bold text-slate-700 block">Trip Complexity Flags:</span>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simReturnBooked}
                    onChange={(e) => setSimReturnBooked(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Return Booked</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simSeparateContact}
                    onChange={(e) => setSimSeparateContact(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>3rd Party Booker</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simHasStops}
                    onChange={(e) => setSimHasStops(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Multi-Stops</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simMultipleVehicles}
                    onChange={(e) => setSimMultipleVehicles(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>2+ Cars</span>
                </label>
              </div>
            </div>
          </div>

          {/* Real-Time Evaluation Result Card */}
          <div className="p-5 rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/70 to-slate-50 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">
                  Simulated Evaluation Verdict
                </span>
                <div className="flex items-center gap-2 mt-1">
                  {simResult.mode === 'AUTO_CONFIRM' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black bg-emerald-600 text-white shadow-xs">
                      <CheckIcon className="w-4 h-4" />
                      AUTO-CONFIRM (PASS-THROUGH)
                    </span>
                  )}
                  {simResult.mode === 'REQUIRE_REVIEW' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black bg-amber-500 text-white shadow-xs">
                      <AlertTriangleIcon className="w-4 h-4" />
                      FLAGGED FOR DISPATCH REVIEW
                    </span>
                  )}
                  {simResult.mode === 'BLACKLIST_BLOCK' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black bg-rose-600 text-white shadow-xs">
                      <LockIcon className="w-4 h-4" />
                      BLACKLIST BLOCK (403 REJECTED)
                    </span>
                  )}
                </div>
              </div>

              {/* Matched Rule Tags */}
              <div className="flex flex-wrap gap-1.5">
                {(simResult.matchedRuleTags || []).map((tag) => (
                  <Badge key={tag} variant="neutral" size="sm" className="font-mono text-[10px] bg-white border-slate-300">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Detailed Reason */}
            <div className="p-3 bg-white rounded-xl border border-indigo-100 text-xs text-slate-700 font-medium">
              <span className="font-bold text-slate-900 block mb-0.5">Decision Rationale:</span>
              {simResult.reason || 'All parameters satisfy automatic confirmation criteria.'}
            </div>

            {/* Quick 3-Tier Summary Status Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-indigo-100/80 text-xs">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-600">Tier 3 (Security Block):</span>
                {simResult.mode === 'BLACKLIST_BLOCK' ? (
                  <span className="font-black text-rose-600">⛔ TRIGGERED</span>
                ) : (
                  <span className="font-bold text-emerald-600">✓ CLEAR</span>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-600">Tier 2 (Review Queue):</span>
                {simResult.mode === 'REQUIRE_REVIEW' ? (
                  <span className="font-black text-amber-600">⚠️ HELD FOR REVIEW</span>
                ) : (
                  <span className="font-bold text-emerald-600">✓ BYPASSED</span>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-600">Tier 1 (Auto-Confirm):</span>
                {simResult.mode === 'AUTO_CONFIRM' ? (
                  <span className="font-black text-emerald-600">✓ CONFIRMED</span>
                ) : (
                  <span className="font-bold text-slate-400">— NOT ELIGIBLE</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
