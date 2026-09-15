import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { ShieldCheckIcon } from '../../ui/Icons';
import type { BookingRulesConfig } from '../../../core/services/bookingRulesEngine';

export function AdminRulesTab() {
  const [config, setConfig] = useState<BookingRulesConfig>({
    minimumCustomerScoreForAutoConfirm: 70,
    minimumDriverScoreForPremium: 85,
    lateNightReviewRequired: true,
    lateNightStartHour: 23,
    lateNightEndHour: 4,
    blacklistEnabled: true
  });

  const handleSave = () => {
     // In a real app this would sync to Firestore Admin Config
     alert('Booking Rules Configuration Saved.');
  };

  return (
    <div className="space-y-6 max-w-4xl">
       <div className="flex items-center gap-2 px-2 pb-2 border-b border-slate-200">
          <ShieldCheckIcon className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-900">Conditional Booking Lifecycle Rules</h2>
       </div>

       <Card variant="elevated">
          <CardHeader>
             <CardTitle className="text-base">Scoring Thresholds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Minimum Customer Score (Auto-Confirm) 0-100</label>
                <Input 
                   type="number" 
                   value={config.minimumCustomerScoreForAutoConfirm} 
                   onChange={(e: any) => setConfig({...config, minimumCustomerScoreForAutoConfirm: parseInt(e.target.value)})} 
                />
                <p className="text-[10px] text-slate-500 mt-1">Customers below this score will be flagged as Mode B (Require Review).</p>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Minimum Driver Score (Premium Tier) 0-100</label>
                <Input 
                   type="number" 
                   value={config.minimumDriverScoreForPremium} 
                   onChange={(e: any) => setConfig({...config, minimumDriverScoreForPremium: parseInt(e.target.value)})} 
                />
                <p className="text-[10px] text-slate-500 mt-1">Drivers below this score will not be auto-assigned Premium trips.</p>
             </div>
          </CardContent>
       </Card>

       <Card variant="elevated">
          <CardHeader>
             <CardTitle className="text-base">Late Night Policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <label className="flex items-center gap-2">
                <input 
                   type="checkbox" 
                   checked={config.lateNightReviewRequired}
                   onChange={(e) => setConfig({...config, lateNightReviewRequired: e.target.checked})}
                />
                <span className="text-sm font-semibold">Enable Late Night Manual Review</span>
             </label>

             <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-bold text-slate-700 mb-1">Start Hour (24h)</label>
                   <Input 
                      type="number" 
                      value={config.lateNightStartHour} 
                      onChange={(e: any) => setConfig({...config, lateNightStartHour: parseInt(e.target.value)})} 
                   />
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-700 mb-1">End Hour (24h)</label>
                   <Input 
                      type="number" 
                      value={config.lateNightEndHour} 
                      onChange={(e: any) => setConfig({...config, lateNightEndHour: parseInt(e.target.value)})} 
                   />
                </div>
             </div>
          </CardContent>
       </Card>

       <Card variant="elevated" className="border-rose-200 bg-rose-50/30">
          <CardHeader>
             <CardTitle className="text-base text-rose-800">Universal Governance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <label className="flex items-center gap-2">
                <input 
                   type="checkbox" 
                   checked={config.blacklistEnabled}
                   onChange={(e) => setConfig({...config, blacklistEnabled: e.target.checked})}
                />
                <span className="text-sm font-semibold text-rose-900">Enforce Universal Blacklist (Mode C: Block)</span>
             </label>
             <p className="text-xs text-rose-700">When enabled, any requests associated with an isBlacklisted entity (Passenger, Driver, Fleet Unit) will be outright blocked by the Booking Rules Engine.</p>
          </CardContent>
       </Card>

       <div className="flex justify-end">
          <Button variant="primary" onClick={handleSave}>Save Booking Rules</Button>
       </div>
    </div>
  );
}
