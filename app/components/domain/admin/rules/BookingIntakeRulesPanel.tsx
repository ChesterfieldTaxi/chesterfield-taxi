import React from 'react';
import { Button } from '../../../ui/Button';
import { CheckIcon, PlaneIcon, SlidersIcon, SpinnerIcon } from '../../../ui/Icons';
import type { BookingRulesConfig } from '../../../../core/services/bookingRulesEngine';
import type { ZoneGeofence } from '../../../../core/types/zone';
import {
  DEFAULT_TERMINAL_PICKUP_LOCATIONS,
  buildCombinedLambertPickupInstructions,
  type TerminalPickupLocations,
} from '../../../../core/config/airports';
import { ModularTierCard } from './ModularTierCard';
import { BookingRulesSimulatorCard } from './BookingRulesSimulatorCard';

export interface BookingIntakeRulesPanelProps {
  config: BookingRulesConfig;
  zones: ZoneGeofence[];
  terminalLocations: Required<TerminalPickupLocations>;
  isSaving: boolean;
  onChangeConfig: (next: BookingRulesConfig) => void;
  onChangeTerminalLocations: (next: Required<TerminalPickupLocations>) => void;
  onSave: () => void | Promise<void>;
}

export function BookingIntakeRulesPanel({
  config,
  zones,
  terminalLocations,
  isSaving,
  onChangeConfig,
  onChangeTerminalLocations,
  onSave,
}: BookingIntakeRulesPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div className="flex items-center gap-2.5">
          <span className="p-2 bg-status-info-bg border border-status-info-border rounded-xl text-status-info-fg">
            <SlidersIcon className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-xl font-black text-fg-primary">Booking Intake Rules</h2>
            <p className="text-xs text-fg-muted font-medium">
              Set conditions for Auto-Confirm, Dispatcher Review, and Blocked Bookings.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            variant="primary"
            onClick={onSave}
            disabled={isSaving}
            className="w-full sm:w-auto justify-center flex items-center gap-2 px-5 py-2.5 text-xs font-bold shadow-xs cursor-pointer"
          >
            {isSaving ? (
              <SpinnerIcon className="w-4 h-4 animate-spin" />
            ) : (
              <CheckIcon className="w-4 h-4" />
            )}
            Save Booking Rules
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <ModularTierCard
          tierKey="tier1"
          tierNumber={1}
          title="Tier 1: Auto-Confirm"
          subtitle="Trips meeting all Tier 1 rules are confirmed automatically without dispatcher review."
          colorTheme="emerald"
          config={config.tier1}
          zones={zones}
          onChange={(t1) => onChangeConfig({ ...config, tier1: t1 })}
        />

        <ModularTierCard
          tierKey="tier2"
          tierNumber={2}
          title="Tier 2: Require Dispatcher Review"
          subtitle="Trips matching any Tier 2 rule are placed in the dispatch review queue."
          colorTheme="amber"
          config={config.tier2}
          zones={zones}
          onChange={(t2) => onChangeConfig({ ...config, tier2: t2 })}
        />

        <ModularTierCard
          tierKey="tier3"
          tierNumber={3}
          title="Tier 3: Block Booking"
          subtitle="Trips matching any Tier 3 rule are automatically blocked and logged."
          colorTheme="rose"
          config={config.tier3}
          zones={zones}
          onChange={(t3) => onChangeConfig({ ...config, tier3: t3 })}
        />

        {/* Airport Curbside Pickup Instructions */}
        <div className="p-5 bg-surface-card border border-status-info-border rounded-2xl shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-faint pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-status-info-bg text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                <PlaneIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-fg-primary">
                  STL Lambert Airport Curbside Pickup Instructions
                </h3>
                <p className="text-xs text-fg-muted">
                  Curbside doors, terminal baggage claim instructions, or driver meetup points shown to passengers in confirmation emails and receipts when pickup is STL Lambert Airport.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-status-info-fg bg-status-info-bg px-2.5 py-1 rounded-md border border-blue-100 uppercase tracking-wider self-start sm:self-auto">
              Airport Rules
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-fg-strong mb-1">
                STL Terminal 1 Pickup Location
              </label>
              <input
                type="text"
                value={terminalLocations.terminal1PickupLocation}
                onChange={(e) =>
                  onChangeTerminalLocations({
                    ...terminalLocations,
                    terminal1PickupLocation: e.target.value,
                  })
                }
                placeholder={DEFAULT_TERMINAL_PICKUP_LOCATIONS.terminal1PickupLocation}
                className="w-full px-3 py-2 border border-border-subtle rounded-xl text-xs font-medium text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface-subtle/50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-fg-strong mb-1">
                STL Terminal 2 (Southwest / Lufthansa)
              </label>
              <input
                type="text"
                value={terminalLocations.terminal2PickupLocation}
                onChange={(e) =>
                  onChangeTerminalLocations({
                    ...terminalLocations,
                    terminal2PickupLocation: e.target.value,
                  })
                }
                placeholder={DEFAULT_TERMINAL_PICKUP_LOCATIONS.terminal2PickupLocation}
                className="w-full px-3 py-2 border border-border-subtle rounded-xl text-xs font-medium text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface-subtle/50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-fg-strong mb-1">
                Private FBO (SUS / CPS) Pickup
              </label>
              <input
                type="text"
                value={terminalLocations.privateFboPickupLocation}
                onChange={(e) =>
                  onChangeTerminalLocations({
                    ...terminalLocations,
                    privateFboPickupLocation: e.target.value,
                  })
                }
                placeholder={DEFAULT_TERMINAL_PICKUP_LOCATIONS.privateFboPickupLocation}
                className="w-full px-3 py-2 border border-border-subtle rounded-xl text-xs font-medium text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface-subtle/50"
              />
            </div>
          </div>
          <p className="text-[11px] text-fg-secondary bg-surface-subtle/70 px-3 py-2 rounded-xl border border-border-faint">
            <span className="font-bold text-fg-primary">Combined Summary: </span>
            {buildCombinedLambertPickupInstructions(terminalLocations)}
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-fg-muted">
            <span>Synced automatically with Website → Booking &amp; Tracking → Airport Rules.</span>
            <Button
              size="sm"
              variant="outline"
              disabled={isSaving}
              onClick={onSave}
              className="text-xs font-bold w-full sm:w-auto justify-center shrink-0"
            >
              Save Airport Description
            </Button>
          </div>
        </div>
      </div>

      <BookingRulesSimulatorCard config={config} zones={zones} />
    </div>
  );
}
