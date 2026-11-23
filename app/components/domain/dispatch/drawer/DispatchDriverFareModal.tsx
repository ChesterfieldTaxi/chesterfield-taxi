import React, { useState, useEffect } from 'react';
import type { NamedPricingRule } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import { getBookingService } from '../../../../core/services/booking';
import { getPricingRulesService } from '../../../../core/services/pricing';
import { useBottomSheetDragToClose } from '../../../../core/hooks/useBottomSheetDragToClose';
import { BoltIcon, XIcon } from '../../../ui/Icons';

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

  const driverFareSheetDrag = useBottomSheetDragToClose({
    onClose: onCloseDriverModal,
    disabled: isDesktop,
  });

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
    <div
      className="fixed inset-0 z-[135] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onCloseDriverModal}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={driverFareSheetDrag.sheetStyle}
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 max-w-lg w-full max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div
          {...driverFareSheetDrag.dragHandlers}
          className="bg-slate-900 text-white px-4 sm:px-5 pt-2 sm:pt-4 pb-3.5 sm:pb-4 shrink-0 touch-none"
        >
          <div
            className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden"
            aria-hidden="true"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-amber-400 font-bold text-sm inline-flex items-center gap-1.5">
                  <BoltIcon className="w-4 h-4 shrink-0" />
                  <span>Driver Fare Console</span>
                </span>
                <span className="text-[11px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                  Trip #{driverModalTrip.id.slice(-6).toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                Passenger: {driverModalTrip.passenger?.firstName}{' '}
                {driverModalTrip.passenger?.lastName}
              </p>
            </div>
            <button
              type="button"
              onClick={onCloseDriverModal}
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-full sm:rounded-lg bg-slate-800/80 sm:bg-transparent text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="Close fare console"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Trip Snapshot */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 text-xs grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Pickup
            </div>
            <div
              className="text-slate-800 font-medium truncate"
              title={driverModalTrip.pickupLocation.address}
            >
              {driverModalTrip.pickupLocation.address}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Dropoff
            </div>
            <div
              className="text-slate-800 font-medium truncate"
              title={driverModalTrip.dropoffLocation.address}
            >
              {driverModalTrip.dropoffLocation.address}
            </div>
          </div>
          <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-200">
            <span className="text-slate-600 font-medium">Current Trip Total Fare:</span>
            <span className="text-sm font-extrabold text-blue-700 font-mono">
              ${driverModalTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
            </span>
          </div>
        </div>

        {/* Tabs: Permitted Rule vs Manual Flat Override */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 p-1.5 gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setDriverFareTab('rule')}
            className={`flex-1 py-1.5 text-center font-bold rounded-lg transition-all cursor-pointer ${
              driverFareTab === 'rule'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Apply Permitted Rule
          </button>
          <button
            type="button"
            onClick={() => setDriverFareTab('flat')}
            className={`flex-1 py-1.5 text-center font-bold rounded-lg transition-all cursor-pointer ${
              driverFareTab === 'flat'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Flat Fare Override
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {driverFareTab === 'rule' ? (
            <div className="space-y-3">
              <p className="text-slate-600 text-xs">
                Select an authorized pricing rule permitted for in-car or on-trip driver selection:
              </p>

              {driverPermittedRules.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-center text-xs">
                  No pricing rules are currently flagged for driver selection in the Admin Rates
                  Tab.
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
                            ? 'border-blue-600 bg-blue-50/70 shadow-2xs'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{rule.name}</span>
                          <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-blue-100 text-blue-800">
                            {rule.modifier.type === 'flat_override'
                              ? `$${rule.modifier.value.toFixed(2)} Flat`
                              : rule.modifier.type === 'multiplier'
                              ? `${rule.modifier.value}x Multiplier`
                              : rule.modifier.type === 'surcharge_flat'
                              ? `+$${rule.modifier.value.toFixed(2)}`
                              : `+${rule.modifier.value}%`}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">{rule.description}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedDriverRuleId && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs">
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
                      <span className="font-bold font-mono text-emerald-700">
                        New Fare: ${calc.toFixed(2)}
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-slate-600 text-xs">
                Manually override the total fare for this trip. This will be recorded with driver
                audit metadata:
              </p>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Flat Fare Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={driverManualFare}
                  onChange={(e) => setDriverManualFare(e.target.value)}
                  placeholder="e.g. 45.00"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Reason / Notes (Optional)
                </label>
                <input
                  type="text"
                  value={driverOverrideReason}
                  onChange={(e) => setDriverOverrideReason(e.target.value)}
                  placeholder="e.g. Severe weather detour, agreed customer flat"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onCloseDriverModal}
            className="px-4 py-2 sm:py-1.5 rounded-xl sm:rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs cursor-pointer"
          >
            Cancel
          </button>
          {driverFareTab === 'rule' ? (
            <button
              type="button"
              disabled={!selectedDriverRuleId || isApplyingDriverFare}
              onClick={handleApplyDriverPricingRule}
              className="px-4 py-2 sm:py-1.5 rounded-xl sm:rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
            >
              {isApplyingDriverFare ? 'Applying...' : 'Apply Rule to Trip'}
            </button>
          ) : (
            <button
              type="button"
              disabled={!driverManualFare || isApplyingDriverFare}
              onClick={handleApplyDriverFlatOverride}
              className="px-4 py-2 sm:py-1.5 rounded-xl sm:rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
            >
              {isApplyingDriverFare ? 'Applying...' : 'Apply Flat Fare'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
