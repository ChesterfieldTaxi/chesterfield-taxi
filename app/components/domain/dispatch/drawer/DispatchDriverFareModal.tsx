import React, { useState, useEffect } from 'react';
import type { NamedPricingRule } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import { getBookingService } from '../../../../core/services/booking';
import { getPricingRulesService } from '../../../../core/services/pricing';
import { FloatingWindow } from '../../../ui/FloatingWindow';
import { BoltIcon } from '../../../ui/Icons';

export interface DispatchDriverFareModalProps {
  isDesktop: boolean;
  driverModalTrip: Trip | null;
  driverModalOpenSeq: number;
  onCloseDriverModal: () => void;
  onTripsChange: React.Dispatch<React.SetStateAction<Trip[]>>;
}

export function DispatchDriverFareModal({
  isDesktop,
  driverModalTrip,
  driverModalOpenSeq,
  onCloseDriverModal,
  onTripsChange,
}: DispatchDriverFareModalProps) {
  const [driverPermittedRules, setDriverPermittedRules] = useState<NamedPricingRule[]>([]);
  const [selectedDriverRuleId, setSelectedDriverRuleId] = useState<string>('');
  const [driverManualFare, setDriverManualFare] = useState<string>('');
  const [driverOverrideReason, setDriverOverrideReason] = useState<string>('');
  const [isApplyingDriverFare, setIsApplyingDriverFare] = useState<boolean>(false);
  const [driverFareTab, setDriverFareTab] = useState<'rule' | 'flat'>('rule');

  // Subscribe to Driver Permitted Pricing Rules
  useEffect(() => {
    const unsub = getPricingRulesService().subscribeToRules((rules) => {
      setDriverPermittedRules(rules.filter((r) => r.isActive && r.allowDriverSelection));
    });
    return () => unsub();
  }, []);

  // Reset driver fare modal state whenever opened via handleOpenDriverModal
  useEffect(() => {
    if (!driverModalTrip) return;
    setSelectedDriverRuleId('');
    setDriverManualFare(
      driverModalTrip.pricing?.totalFare ? driverModalTrip.pricing.totalFare.toFixed(2) : ''
    );
    setDriverOverrideReason('');
    setDriverFareTab('rule');
  }, [driverModalTrip?.id, driverModalOpenSeq]);

  const handleApplyDriverPricingRule = async () => {
    if (!driverModalTrip) return;
    const rule = driverPermittedRules.find((r) => r.id === selectedDriverRuleId);
    if (!rule) return;

    setIsApplyingDriverFare(true);
    try {
      let newFare = driverModalTrip.pricing?.totalFare || 0;
      if (rule.modifier.type === 'flat_override') {
        newFare = rule.modifier.value;
      } else if (rule.modifier.type === 'multiplier') {
        newFare = Math.round(newFare * rule.modifier.value * 100) / 100;
      } else if (rule.modifier.type === 'surcharge_flat') {
        newFare = Math.round((newFare + rule.modifier.value) * 100) / 100;
      } else if (rule.modifier.type === 'surcharge_percent') {
        newFare = Math.round(newFare * (1 + rule.modifier.value / 100) * 100) / 100;
      }

      const existingRules = driverModalTrip.pricing?.appliedRuleNames || [];
      const updatedRules = Array.from(new Set([...existingRules, rule.name]));

      const updates: Partial<Trip> = {
        pricing: {
          ...driverModalTrip.pricing,
          totalFare: newFare,
          appliedRuleNames: updatedRules,
        },
        payment: {
          ...driverModalTrip.payment,
          amount: newFare,
        },
        metadata: {
          ...driverModalTrip.metadata,
          driverAppliedRule: {
            ruleId: rule.id,
            ruleName: rule.name,
            appliedAt: new Date().toISOString(),
          },
        },
      };

      const bookingService = getBookingService();
      if (bookingService.updateTrip) {
        await bookingService.updateTrip(driverModalTrip.id, updates);
      }

      onTripsChange((prev) =>
        prev.map((t) => (t.id === driverModalTrip.id ? ({ ...t, ...updates } as Trip) : t))
      );
      onCloseDriverModal();
    } catch (err) {
      console.error('Failed to apply driver pricing rule:', err);
    } finally {
      setIsApplyingDriverFare(false);
    }
  };

  const handleApplyDriverFlatOverride = async () => {
    if (!driverModalTrip || !driverManualFare) return;
    const fareVal = parseFloat(driverManualFare);
    if (isNaN(fareVal) || fareVal <= 0) return;

    setIsApplyingDriverFare(true);
    try {
      const existingRules = driverModalTrip.pricing?.appliedRuleNames || [];
      const updatedRules = Array.from(
        new Set([...existingRules, `Driver Override: $${fareVal.toFixed(2)}`])
      );

      const updates: Partial<Trip> = {
        pricing: {
          ...driverModalTrip.pricing,
          totalFare: fareVal,
          appliedRuleNames: updatedRules,
        },
        payment: {
          ...driverModalTrip.payment,
          amount: fareVal,
        },
        metadata: {
          ...driverModalTrip.metadata,
          driverFareOverride: {
            originalFare: driverModalTrip.pricing?.totalFare,
            overrideFare: fareVal,
            reason: driverOverrideReason || 'Driver manual flat override',
            appliedAt: new Date().toISOString(),
          },
        },
      };

      const bookingService = getBookingService();
      if (bookingService.updateTrip) {
        await bookingService.updateTrip(driverModalTrip.id, updates);
      }

      onTripsChange((prev) =>
        prev.map((t) => (t.id === driverModalTrip.id ? ({ ...t, ...updates } as Trip) : t))
      );
      onCloseDriverModal();
    } catch (err) {
      console.error('Failed to apply driver flat override:', err);
    } finally {
      setIsApplyingDriverFare(false);
    }
  };

  if (!driverModalTrip) {
    return null;
  }

  return (
    <FloatingWindow
      id="dispatch_driver_fare"
      isOpen={Boolean(driverModalTrip)}
      onClose={onCloseDriverModal}
      hasBackdrop={false}
      title={`Driver Fare Console · #${driverModalTrip.id.slice(-6).toUpperCase()}`}
      subtitle={`Passenger: ${driverModalTrip.passenger?.firstName || ''} ${
        driverModalTrip.passenger?.lastName || ''
      }`.trim()}
      icon={<BoltIcon className="w-4 h-4 text-amber-400" />}
      initialSize={{ width: 500, height: 520 }}
      autoHeight
      minWidth={380}
      minHeight={340}
      zIndex={225}
      footer={
        <div className="bg-surface-subtle px-4 sm:px-5 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCloseDriverModal}
            className="px-4 py-1.5 rounded-lg border border-border-strong text-fg-secondary hover:bg-surface-muted font-bold text-xs cursor-pointer"
          >
            Cancel
          </button>
          {driverFareTab === 'rule' ? (
            <button
              type="button"
              disabled={!selectedDriverRuleId || isApplyingDriverFare}
              onClick={handleApplyDriverPricingRule}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
            >
              {isApplyingDriverFare ? 'Applying...' : 'Apply Rule to Trip'}
            </button>
          ) : (
            <button
              type="button"
              disabled={!driverManualFare || isApplyingDriverFare}
              onClick={handleApplyDriverFlatOverride}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
            >
              {isApplyingDriverFare ? 'Applying...' : 'Apply Flat Fare'}
            </button>
          )}
        </div>
      }
    >
      {/* Trip Snapshot */}
      <div className="bg-surface-subtle border-b border-border-subtle px-5 py-3 text-xs grid grid-cols-2 gap-2 shrink-0">
        <div>
          <div className="text-[10px] text-fg-muted font-bold uppercase tracking-wider">Pickup</div>
          <div className="text-fg-strong font-medium truncate" title={driverModalTrip.pickupLocation.address}>
            {driverModalTrip.pickupLocation.address}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-fg-muted font-bold uppercase tracking-wider">Dropoff</div>
          <div className="text-fg-strong font-medium truncate" title={driverModalTrip.dropoffLocation.address}>
            {driverModalTrip.dropoffLocation.address}
          </div>
        </div>
        <div className="col-span-2 flex items-center justify-between pt-1 border-t border-border-subtle">
          <span className="text-fg-secondary font-medium">Current Trip Total Fare:</span>
          <span className="text-sm font-extrabold text-status-info-fg font-mono">
            ${driverModalTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
          </span>
        </div>
      </div>

      {/* Tabs: Permitted Rule vs Manual Flat Override */}
      <div className="flex border-b border-border-subtle bg-surface-muted/70 p-1.5 gap-1.5 text-xs shrink-0">
        <button
          type="button"
          onClick={() => setDriverFareTab('rule')}
          className={`flex-1 py-1.5 text-center font-bold rounded-lg transition-all cursor-pointer ${
            driverFareTab === 'rule'
              ? 'bg-surface-card text-blue-600 shadow-2xs'
              : 'text-fg-secondary hover:text-fg-primary'
          }`}
        >
          Apply Permitted Rule
        </button>
        <button
          type="button"
          onClick={() => setDriverFareTab('flat')}
          className={`flex-1 py-1.5 text-center font-bold rounded-lg transition-all cursor-pointer ${
            driverFareTab === 'flat'
              ? 'bg-surface-card text-blue-600 shadow-2xs'
              : 'text-fg-secondary hover:text-fg-primary'
          }`}
        >
          Flat Fare Override
        </button>
      </div>

      {/* Tab Body */}
      <div className="p-5 space-y-4 text-xs">
        {driverFareTab === 'rule' ? (
          <div className="space-y-3">
            <p className="text-fg-secondary text-xs">
              Select an authorized pricing rule permitted for in-car or on-trip driver selection:
            </p>

            {driverPermittedRules.length === 0 ? (
              <div className="p-4 bg-status-warning-bg border border-status-warning-border rounded-xl text-status-warning-fg text-center text-xs">
                No pricing rules are currently flagged for driver selection in the Admin Rates Tab.
              </div>
            ) : (
              <div className="space-y-2">
                {driverPermittedRules.map((rule) => {
                  const isSelected = selectedDriverRuleId === rule.id;
                  return (
                    <div
                      key={rule.id}
                      onClick={() => setSelectedDriverRuleId(rule.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-status-info-bg/70 shadow-2xs'
                          : 'border-border-subtle bg-surface-card hover:border-border-strong'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-fg-primary">{rule.name}</span>
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-status-info-bg-strong text-status-info-fg">
                          {rule.modifier.type === 'flat_override'
                            ? `$${rule.modifier.value.toFixed(2)} Flat`
                            : rule.modifier.type === 'multiplier'
                            ? `${rule.modifier.value}x Multiplier`
                            : rule.modifier.type === 'surcharge_flat'
                            ? `+$${rule.modifier.value.toFixed(2)}`
                            : `+${rule.modifier.value}%`}
                        </span>
                      </div>
                      <p className="text-[11px] text-fg-muted mt-1">{rule.description}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedDriverRuleId && (
              <div className="p-3 bg-status-success-bg border border-status-success-border rounded-xl text-status-success-fg text-xs">
                <span className="font-bold">Calculated Preview: </span>
                {(() => {
                  const r = driverPermittedRules.find((x) => x.id === selectedDriverRuleId);
                  if (!r) return null;
                  let calc = driverModalTrip.pricing?.totalFare || 0;
                  if (r.modifier.type === 'flat_override') calc = r.modifier.value;
                  else if (r.modifier.type === 'multiplier') calc = calc * r.modifier.value;
                  else if (r.modifier.type === 'surcharge_flat') calc = calc + r.modifier.value;
                  else if (r.modifier.type === 'surcharge_percent')
                    calc = calc * (1 + r.modifier.value / 100);
                  return (
                    <span className="font-bold font-mono text-status-success-fg">
                      New Fare: ${calc.toFixed(2)}
                    </span>
                  );
                })()}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-fg-secondary text-xs">
              Manually override the total fare for this trip. This will be recorded with driver audit
              metadata:
            </p>

            <div>
              <label className="block text-fg-secondary font-bold mb-1">Flat Fare Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={driverManualFare}
                onChange={(e) => setDriverManualFare(e.target.value)}
                placeholder="e.g. 45.00"
                className="w-full px-3 py-2 border border-border-strong rounded-xl text-fg-primary font-mono font-bold text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-fg-secondary font-bold mb-1">Reason / Notes (Optional)</label>
              <input
                type="text"
                value={driverOverrideReason}
                onChange={(e) => setDriverOverrideReason(e.target.value)}
                placeholder="e.g. Severe weather detour, agreed customer flat"
                className="w-full px-3 py-2 border border-border-strong rounded-xl text-fg-strong text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </div>
        )}
      </div>
    </FloatingWindow>
  );
}
