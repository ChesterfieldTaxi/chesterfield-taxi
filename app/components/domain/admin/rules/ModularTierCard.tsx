import React from 'react';
import { Card, CardContent } from '../../../ui/Card';
import { Input } from '../../../ui/Input';
import { Select } from '../../../ui/Select';
import { Badge } from '../../../ui/Badge';
import {
  ClockIcon,
  LockIcon,
  UserIcon,
  CarIcon,
  SparklesIcon,
  MapPinIcon,
  DollarSignIcon,
  RepeatIcon,
  StarIcon,
} from '../../../ui/Icons';
import type {
  ModularTierConfig,
  RuleLocationMode,
  RuleTimeMode,
  RulePaymentMethod,
} from '../../../../core/services/bookingRulesEngine';
import type { ZoneGeofence } from '../../../../core/types/zone';

export interface ModularTierCardProps {
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

export function ModularTierCard({
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
      border: 'border-status-success-border',
      badgeBg: 'bg-emerald-600 text-white',
      headerBg: 'bg-status-success-bg/70 border-b border-status-success-border/60',
    },
    amber: {
      border: 'border-status-warning-border',
      badgeBg: 'bg-amber-600 text-white',
      headerBg: 'bg-status-warning-bg/70 border-b border-status-warning-border/60',
    },
    rose: {
      border: 'border-status-danger-border',
      badgeBg: 'bg-rose-600 text-white',
      headerBg: 'bg-status-danger-bg/70 border-b border-status-danger-border/60',
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
      update({
        pickupZoneIds: current.includes(zoneId)
          ? current.filter((id) => id !== zoneId)
          : [...current, zoneId],
      });
    } else {
      const current = config.dropoffZoneIds || [];
      update({
        dropoffZoneIds: current.includes(zoneId)
          ? current.filter((id) => id !== zoneId)
          : [...current, zoneId],
      });
    }
  };

  const toggleVehicleTier = (tierId: string) => {
    const current = config.allowedVehicleTiers || [];
    update({
      allowedVehicleTiers: current.includes(tierId)
        ? current.filter((id) => id !== tierId)
        : [...current, tierId],
    });
  };

  return (
    <Card className={`border-2 shadow-xs transition-all ${themeClasses.border} overflow-hidden`}>
      <div className={`p-4 sm:p-5 ${themeClasses.headerBg} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
          <span className={`self-start sm:self-auto shrink-0 whitespace-nowrap text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md ${themeClasses.badgeBg}`}>
            Tier {tierNumber} Controls
          </span>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-black text-fg-primary">{title}</h3>
            <p className="text-xs text-fg-muted font-medium">{subtitle}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer self-start sm:self-auto shrink-0 bg-surface-card px-3 py-1.5 rounded-lg border border-border-subtle shadow-2xs">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span className="text-xs font-bold text-fg-strong">Enable Tier {tierNumber}</span>
        </label>
      </div>

      <CardContent className="p-4 sm:p-6 space-y-6 bg-surface-card">
        {/* 1. Client Score & Rider Profile */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-secondary">
            <UserIcon className="w-4 h-4 text-fg-muted" />
            <span>1. Client Score &amp; Rider Profile</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3.5 sm:p-4 rounded-xl border border-border-subtle bg-surface-subtle/50">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-fg-secondary">Client Score Floor (Min)</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-surface-card border border-border-subtle text-fg-strong inline-flex items-center gap-1">
                  <StarIcon className="w-3 h-3 text-amber-500" />
                  <span>{config.customerScoreMin}</span>
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={config.customerScoreMin}
                onChange={(e) => update({ customerScoreMin: parseInt(e.target.value, 10) || 0 })}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-fg-secondary">Client Score Ceiling (Max)</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-surface-card border border-border-subtle text-fg-strong inline-flex items-center gap-1">
                  <StarIcon className="w-3 h-3 text-amber-500" />
                  <span>{config.customerScoreMax}</span>
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={config.customerScoreMax}
                onChange={(e) => update({ customerScoreMax: parseInt(e.target.value, 10) || 100 })}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            <div className="md:col-span-2 pt-2 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.allowUnratedGuests}
                  onChange={(e) => update({ allowUnratedGuests: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <span className="text-xs font-medium text-fg-secondary">
                  Apply rule to first-time unrated guest riders
                </span>
              </label>
              <span className="text-[11px] text-fg-subtle italic">
                Active band: {config.customerScoreMin} to {config.customerScoreMax} points
              </span>
            </div>
          </div>
        </div>

        {/* 2. Spatial Routing */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-secondary">
            <MapPinIcon className="w-4 h-4 text-fg-muted" />
            <span>2. Granular Spatial Routing (Separated Pickup &amp; Dropoff)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['pickup', 'dropoff'] as const).map((leg) => {
              const mode = leg === 'pickup' ? config.pickupLocationMode : config.dropoffLocationMode;
              const selectedIds = leg === 'pickup' ? config.pickupZoneIds || [] : config.dropoffZoneIds || [];
              return (
                <div key={leg} className="p-3.5 sm:p-4 rounded-xl border border-border-subtle bg-surface-subtle/50 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-fg-strong capitalize">{leg} Location Scope</span>
                    <Badge variant="neutral" size="sm" className="font-mono text-[10px]">
                      {mode.toUpperCase()}
                    </Badge>
                  </div>
                  <Select
                    size="sm"
                    value={mode}
                    onChange={(e) =>
                      update(
                        leg === 'pickup'
                          ? { pickupLocationMode: e.target.value as RuleLocationMode }
                          : { dropoffLocationMode: e.target.value as RuleLocationMode }
                      )
                    }
                  >
                    <option value="all">Any Location (All Operational Zones)</option>
                    <option value="specific_zones">Specific Monitored / Whitelisted Zones</option>
                    <option value="airports">Airport Terminals &amp; Perimeters Only</option>
                    <option value="prohibited_only">Prohibited Safety Exclusion Zones</option>
                    <option value="outside_service_area">Outside Service Perimeter / County</option>
                  </Select>
                  {mode === 'specific_zones' && (
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-surface-card rounded-lg border border-border-subtle">
                      {zones.map((z) => {
                        const isSelected = selectedIds.includes(z.id);
                        return (
                          <button
                            key={z.id}
                            type="button"
                            onClick={() => toggleZone(leg, z.id)}
                            className={`text-[11px] font-medium px-2.5 py-1 rounded-md border cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 font-bold'
                                : 'bg-surface-subtle text-fg-secondary border-border-subtle'
                            }`}
                          >
                            {isSelected && '✓ '}
                            {z.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Time Schedule & Fare Bounds */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-secondary">
            <ClockIcon className="w-4 h-4 text-fg-muted" />
            <span>3. Operating Schedule &amp; Fare Bounds</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-border-subtle bg-surface-subtle/50">
            <div className="space-y-3">
              <span className="text-xs font-semibold text-fg-secondary block">Operating Time Schedule</span>
              <Select
                size="sm"
                value={config.timeMode}
                onChange={(e) => update({ timeMode: e.target.value as RuleTimeMode })}
              >
                <option value="all_hours">24/7 Continuous (All Hours)</option>
                <option value="custom_window">Custom Operating Hours Window</option>
                <option value="late_night">Late Night Enforcement Window</option>
              </Select>
              {config.timeMode !== 'all_hours' && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Start Hour (24h)"
                    type="number"
                    min="0"
                    max="23"
                    value={config.startHour}
                    onChange={(e) => update({ startHour: parseInt(e.target.value, 10) || 0 })}
                    className="text-xs h-8 bg-surface-card"
                  />
                  <Input
                    label="End Hour (24h)"
                    type="number"
                    min="0"
                    max="23"
                    value={config.endHour}
                    onChange={(e) => update({ endHour: parseInt(e.target.value, 10) || 0 })}
                    className="text-xs h-8 bg-surface-card"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 items-start">
              <Input
                label="Min Price ($)"
                type="number"
                min="0"
                value={config.minPrice}
                onChange={(e) => update({ minPrice: parseFloat(e.target.value) || 0 })}
                className="text-xs h-8 bg-surface-card"
              />
              <Input
                label="Max Price ($)"
                type="number"
                min="0"
                value={config.maxPrice}
                onChange={(e) => update({ maxPrice: parseFloat(e.target.value) || 0 })}
                className="text-xs h-8 bg-surface-card"
              />
            </div>
          </div>
        </div>

        {/* 4. Payment Types Matrix */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-secondary">
            <DollarSignIcon className="w-4 h-4 text-fg-muted" />
            <span>4. Payment Types Matrix</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-4 rounded-xl border border-border-subtle bg-surface-subtle/50">
            {PAYMENT_OPTIONS.map((opt) => {
              const isSelected = (config.paymentMethods || []).includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => togglePaymentMethod(opt.id)}
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left cursor-pointer ${
                    isSelected
                      ? 'bg-status-info-bg border-blue-400 text-status-info-fg font-semibold'
                      : 'bg-surface-card border-border-subtle text-fg-secondary'
                  }`}
                >
                  <input type="checkbox" checked={isSelected} readOnly className="mt-0.5 rounded text-blue-600 pointer-events-none" />
                  <div>
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div className="text-[10px] text-fg-muted">{opt.hint}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. Complexity & Security Flags */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-secondary">
            <SparklesIcon className="w-4 h-4 text-fg-muted" />
            <span>5. Operational Flags &amp; Vehicle Standards</span>
          </div>
          <div className="p-4 rounded-xl border border-border-subtle bg-surface-subtle/50 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-center gap-2.5 p-2.5 bg-surface-card rounded-xl border border-border-subtle cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.matchReturnBooked}
                  onChange={(e) => update({ matchReturnBooked: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <RepeatIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="font-bold text-fg-strong">Return Trip Booked</span>
              </label>
              <label className="flex items-center gap-2.5 p-2.5 bg-surface-card rounded-xl border border-border-subtle cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.matchSeparateContactPerson}
                  onChange={(e) => update({ matchSeparateContactPerson: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <UserIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="font-bold text-fg-strong">Separate Contact Person</span>
              </label>
              <label className="flex items-center gap-2.5 p-2.5 bg-surface-card rounded-xl border border-border-subtle cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.matchIntermediateStops}
                  onChange={(e) => update({ matchIntermediateStops: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <MapPinIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="font-bold text-fg-strong">Intermediate Stops</span>
              </label>
              <label className="flex items-center gap-2.5 p-2.5 bg-surface-card rounded-xl border border-border-subtle cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.matchMultipleVehicles}
                  onChange={(e) => update({ matchMultipleVehicles: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <CarIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="font-bold text-fg-strong">Multiple Vehicles Requested</span>
              </label>
            </div>

            <div className="pt-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {VEHICLE_TIER_OPTIONS.map((vt) => {
                  const isSelected = (config.allowedVehicleTiers || []).includes(vt.id);
                  return (
                    <button
                      key={vt.id}
                      type="button"
                      onClick={() => toggleVehicleTier(vt.id)}
                      className={`text-xs px-2.5 py-1 rounded-lg border cursor-pointer ${
                        isSelected
                          ? 'bg-surface-header text-white border-slate-900 font-bold'
                          : 'bg-surface-card text-fg-secondary border-border-subtle'
                      }`}
                    >
                      {isSelected && '✓ '}
                      {vt.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-fg-secondary">Min Driver Score:</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={config.minDriverScoreForPremium ?? 85}
                  onChange={(e) => update({ minDriverScoreForPremium: parseInt(e.target.value, 10) || 0 })}
                  className="text-xs h-8 w-20 bg-surface-card"
                />
              </div>
            </div>

            {tierKey === 'tier3' && (
              <div className="pt-3 border-t border-status-danger-border bg-status-danger-bg/50 p-3 rounded-xl space-y-2 text-xs">
                <span className="font-bold text-status-danger-fg flex items-center gap-1.5">
                  <LockIcon className="w-3.5 h-3.5 text-rose-600" />
                  Enterprise Security &amp; Audit Safeguards
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.enforcePassengerBlacklist ?? true}
                      onChange={(e) => update({ enforcePassengerBlacklist: e.target.checked })}
                      className="rounded text-rose-600"
                    />
                    <span>Block blacklisted riders</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.enforceVehicleGrounding ?? true}
                      onChange={(e) => update({ enforceVehicleGrounding: e.target.checked })}
                      className="rounded text-rose-600"
                    />
                    <span>Block grounded vehicles</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.securityAuditLogging ?? true}
                      onChange={(e) => update({ securityAuditLogging: e.target.checked })}
                      className="rounded text-rose-600"
                    />
                    <span>Log security audit events</span>
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
