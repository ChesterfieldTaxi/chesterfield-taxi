import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '../../../ui/Card';
import { Input } from '../../../ui/Input';
import { Badge } from '../../../ui/Badge';
import {
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  LockIcon,
  MoonIcon,
  SparklesIcon,
  StarIcon,
  SunIcon,
} from '../../../ui/Icons';
import {
  BookingRulesEngine,
  type BookingRulesConfig,
  type RulePaymentMethod,
} from '../../../../core/services/bookingRulesEngine';
import type { ZoneGeofence } from '../../../../core/types/zone';

export interface BookingRulesSimulatorCardProps {
  config: BookingRulesConfig;
  zones: ZoneGeofence[];
}

export function BookingRulesSimulatorCard({ config, zones }: BookingRulesSimulatorCardProps) {
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

  const simResult = useMemo(() => {
    const engine = new BookingRulesEngine(config);
    const scheduledDate = new Date();
    scheduledDate.setHours(simPickupHour, 0, 0, 0);
    const isPickupAirport = simPickupZoneId === 'airport';
    const isDropoffAirport = simDropoffZoneId === 'airport';

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
        isPickupProhibited: simPickupZoneId === 'prohibited',
        isDropoffProhibited: simDropoffZoneId === 'prohibited',
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
    config, simCustomerScore, simIsUnratedGuest, simPickupZoneId, simDropoffZoneId,
    simPickupHour, simFare, simPaymentMethod, simReturnBooked, simSeparateContact,
    simHasStops, simMultipleVehicles, simVehicleTier,
  ]);

  return (
    <Card className="border-2 border-indigo-200 shadow-md overflow-hidden bg-slate-50/60">
      <div className="p-4 sm:p-5 bg-indigo-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="p-2 bg-indigo-800 rounded-xl text-indigo-200 shrink-0">
            <SparklesIcon className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-black">Live 3-Tier Evaluation Sandbox &amp; Simulator</h3>
            <p className="text-xs text-indigo-200">Test ride parameters instantly against all configured tiers in real time.</p>
          </div>
        </div>
        <Badge variant="primary" size="sm" className="self-start sm:self-auto shrink-0 bg-indigo-700 text-indigo-100 border-indigo-500 font-mono">
          REAL-TIME EXECUTION
        </Badge>
      </div>

      <CardContent className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Client Score</span>
              <span className="text-xs font-black px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
                {simIsUnratedGuest ? 'Unrated' : (<><StarIcon className="w-3 h-3 text-blue-600" /><span>{simCustomerScore}</span></>)}
              </span>
            </div>
            <input
              type="range" min="0" max="100" disabled={simIsUnratedGuest} value={simCustomerScore}
              onChange={(e) => setSimCustomerScore(parseInt(e.target.value, 10) || 0)}
              className="w-full accent-blue-600 cursor-pointer disabled:opacity-40"
            />
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-600 pt-1">
              <input type="checkbox" checked={simIsUnratedGuest} onChange={(e) => setSimIsUnratedGuest(e.target.checked)} className="rounded text-blue-600" />
              <span>Simulate 1st-Time Guest Rider</span>
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">Pickup Location</span>
            <select value={simPickupZoneId} onChange={(e) => setSimPickupZoneId(e.target.value)} className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800">
              <option value="any">Standard Service Area</option>
              <option value="airport">STL Airport Terminal</option>
              <option value="prohibited">Prohibited Geofence Zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">Dropoff Location</span>
            <select value={simDropoffZoneId} onChange={(e) => setSimDropoffZoneId(e.target.value)} className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800">
              <option value="any">Standard Service Area</option>
              <option value="airport">STL Airport Terminal</option>
              <option value="prohibited">Prohibited Geofence Zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Pickup Hour</span>
              <span className="text-xs font-black px-2 py-0.5 rounded bg-slate-100 text-slate-800">{simPickupHour.toString().padStart(2, '0')}:00</span>
            </div>
            <input type="range" min="0" max="23" value={simPickupHour} onChange={(e) => setSimPickupHour(parseInt(e.target.value, 10) || 0)} className="w-full accent-blue-600 cursor-pointer" />
            <span className="text-[10px] text-slate-400 inline-flex items-center gap-1">
              {simPickupHour >= 23 || simPickupHour < 4 ? (<><MoonIcon className="w-3 h-3 text-indigo-500" /><span>Late Night Window</span></>) : (<><SunIcon className="w-3 h-3 text-amber-500" /><span>Standard Operating Hours</span></>)}
            </span>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">Estimated Fare ($)</span>
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-slate-400 text-xs font-bold">$</span>
              <Input type="number" min="0" value={simFare} onChange={(e) => setSimFare(parseFloat(e.target.value) || 0)} className="text-xs h-9 pl-6 bg-slate-50" />
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">Payment Method</span>
            <select value={simPaymentMethod} onChange={(e) => setSimPaymentMethod(e.target.value as RulePaymentMethod)} className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800">
              <option value="prepaid">Prepaid In-App</option>
              <option value="corporate">Corporate Account</option>
              <option value="card">Credit Card (In-Car)</option>
              <option value="cash">Cash on Board</option>
              <option value="voucher">Voucher / Invoiced</option>
            </select>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">Vehicle Class Tier</span>
            <select value={simVehicleTier} onChange={(e) => setSimVehicleTier(e.target.value)} className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800">
              <option value="standard">Standard Sedan</option>
              <option value="premium">Executive Premium</option>
              <option value="xl">XL SUV (6-Passenger)</option>
              <option value="wheelchair">Wheelchair WAV</option>
            </select>
          </div>

          <div className="space-y-1.5 pt-1">
            <span className="text-xs font-bold text-slate-700 block">Trip Complexity Flags:</span>
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={simReturnBooked} onChange={(e) => setSimReturnBooked(e.target.checked)} className="rounded text-blue-600" />
                <span>Return Booked</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={simSeparateContact} onChange={(e) => setSimSeparateContact(e.target.checked)} className="rounded text-blue-600" />
                <span>3rd Party Booker</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={simHasStops} onChange={(e) => setSimHasStops(e.target.checked)} className="rounded text-blue-600" />
                <span>Multi-Stops</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={simMultipleVehicles} onChange={(e) => setSimMultipleVehicles(e.target.checked)} className="rounded text-blue-600" />
                <span>2+ Cars</span>
              </label>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/70 to-slate-50 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">Simulated Evaluation Verdict</span>
              <div className="flex items-center gap-2 mt-1">
                {simResult.mode === 'AUTO_CONFIRM' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black bg-emerald-600 text-white shadow-xs">
                    <CheckIcon className="w-4 h-4" /> AUTO-CONFIRM (PASS-THROUGH)
                  </span>
                )}
                {simResult.mode === 'REQUIRE_REVIEW' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black bg-amber-500 text-white shadow-xs">
                    <AlertTriangleIcon className="w-4 h-4" /> FLAGGED FOR DISPATCH REVIEW
                  </span>
                )}
                {simResult.mode === 'BLACKLIST_BLOCK' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black bg-rose-600 text-white shadow-xs">
                    <LockIcon className="w-4 h-4" /> BLACKLIST BLOCK (403 REJECTED)
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(simResult.matchedRuleTags || []).map((tag) => (
                <Badge key={tag} variant="neutral" size="sm" className="font-mono text-[10px] bg-white border-slate-300">#{tag}</Badge>
              ))}
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-indigo-100 text-xs text-slate-700 font-medium">
            <span className="font-bold text-slate-900 block mb-0.5">Decision Rationale:</span>
            {simResult.reason || 'All parameters satisfy automatic confirmation criteria.'}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-indigo-100/80 text-xs">
            <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-600">Tier 3 (Security Block):</span>
              {simResult.mode === 'BLACKLIST_BLOCK' ? (
                <span className="font-black text-rose-600 inline-flex items-center gap-1"><BanIcon className="w-3.5 h-3.5" /> TRIGGERED</span>
              ) : (
                <span className="font-bold text-emerald-600 inline-flex items-center gap-1"><CheckIcon className="w-3.5 h-3.5" /> CLEAR</span>
              )}
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-600">Tier 2 (Review Queue):</span>
              {simResult.mode === 'REQUIRE_REVIEW' ? (
                <span className="font-black text-amber-600 inline-flex items-center gap-1"><AlertTriangleIcon className="w-3.5 h-3.5" /> HELD FOR REVIEW</span>
              ) : (
                <span className="font-bold text-emerald-600 inline-flex items-center gap-1"><CheckIcon className="w-3.5 h-3.5" /> BYPASSED</span>
              )}
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-600">Tier 1 (Auto-Confirm):</span>
              {simResult.mode === 'AUTO_CONFIRM' ? (
                <span className="font-black text-emerald-600 inline-flex items-center gap-1"><CheckIcon className="w-3.5 h-3.5" /> CONFIRMED</span>
              ) : (
                <span className="font-bold text-slate-400">— NOT ELIGIBLE</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
