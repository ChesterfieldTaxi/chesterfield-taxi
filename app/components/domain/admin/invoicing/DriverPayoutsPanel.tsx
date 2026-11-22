import React from 'react';
import type { FinancialLedgerEntry } from '../../../../core/types/invoicing';
import type {
  InvoicingSubTab,
  LedgerPeriodFilter,
  ProcessorStatus,
  TestCallStatus,
  TestSmsStatus,
} from './useAdminInvoicingActions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  SpinnerIcon,
  CreditCardIcon,
  CheckIcon,
  PhoneIcon,
  ShieldCheckIcon,
  ChatBubbleLeftRightIcon,
  AlertCircleIcon,
} from '../../../ui/Icons';

export interface DriverPayoutsPanelProps {
  activeSub: InvoicingSubTab;
  isSaving: boolean;
  // Accounting Sync & General Ledger (`driver_payout` & journal entries)
  ledgerFilter: LedgerPeriodFilter;
  setLedgerFilter: React.Dispatch<React.SetStateAction<LedgerPeriodFilter>>;
  filteredLedgerEntries: FinancialLedgerEntry[];
  // Payment Gateways & Driver Commission Split Policies
  stripeMode: 'test' | 'live';
  setStripeMode: React.Dispatch<React.SetStateAction<'test' | 'live'>>;
  stripePk: string;
  setStripePk: React.Dispatch<React.SetStateAction<string>>;
  stripeSk: string;
  setStripeSk: React.Dispatch<React.SetStateAction<string>>;
  stripeWebhookSecret: string;
  setStripeWebhookSecret: React.Dispatch<React.SetStateAction<string>>;
  stripeStatus: ProcessorStatus;
  stripeStatusMsg: string | null;
  squareAppId: string;
  setSquareAppId: React.Dispatch<React.SetStateAction<string>>;
  squareToken: string;
  setSquareToken: React.Dispatch<React.SetStateAction<string>>;
  squareLocId: string;
  setSquareLocId: React.Dispatch<React.SetStateAction<string>>;
  squareStatus: ProcessorStatus;
  squareStatusMsg: string | null;
  stripeTerminalEnabled: boolean;
  setStripeTerminalEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  passCardSurcharge: boolean;
  setPassCardSurcharge: React.Dispatch<React.SetStateAction<boolean>>;
  surchargePercent: number;
  setSurchargePercent: React.Dispatch<React.SetStateAction<number>>;
  autoEmailReceipts: boolean;
  setAutoEmailReceipts: React.Dispatch<React.SetStateAction<boolean>>;
  driverCommissionPercent: number;
  setDriverCommissionPercent: React.Dispatch<React.SetStateAction<number>>;
  onTestStripe: () => Promise<void>;
  onTestSquare: () => Promise<void>;
  onSaveApiCredentials: (category: string) => void;
  onSaveBillingPolicies: () => Promise<void>;
  // Twilio Telephony & Voice/SMS Tester
  twilioSid: string;
  setTwilioSid: React.Dispatch<React.SetStateAction<string>>;
  twilioToken: string;
  setTwilioToken: React.Dispatch<React.SetStateAction<string>>;
  twilioPhone: string;
  setTwilioPhone: React.Dispatch<React.SetStateAction<string>>;
  twilioStatus: ProcessorStatus;
  twilioStatusMsg: string | null;
  testCallPhone: string;
  setTestCallPhone: React.Dispatch<React.SetStateAction<string>>;
  testCallStatus: TestCallStatus;
  testCallMsg: string | null;
  testSmsPhone: string;
  setTestSmsPhone: React.Dispatch<React.SetStateAction<string>>;
  testSmsBody: string;
  setTestSmsBody: React.Dispatch<React.SetStateAction<string>>;
  testSmsStatus: TestSmsStatus;
  testSmsMsg: string | null;
  onTestTwilioCreds: () => Promise<void>;
  onPlaceTestCall: () => Promise<void>;
  onSendTestSms: () => Promise<void>;
}

export function DriverPayoutsPanel({
  activeSub,
  isSaving,
  ledgerFilter,
  setLedgerFilter,
  filteredLedgerEntries,
  stripeMode,
  setStripeMode,
  stripePk,
  setStripePk,
  stripeSk,
  setStripeSk,
  stripeWebhookSecret,
  setStripeWebhookSecret,
  stripeStatus,
  stripeStatusMsg,
  squareAppId,
  setSquareAppId,
  squareToken,
  setSquareToken,
  squareLocId,
  setSquareLocId,
  squareStatus,
  squareStatusMsg,
  stripeTerminalEnabled,
  setStripeTerminalEnabled,
  passCardSurcharge,
  setPassCardSurcharge,
  surchargePercent,
  setSurchargePercent,
  autoEmailReceipts,
  setAutoEmailReceipts,
  driverCommissionPercent,
  setDriverCommissionPercent,
  onTestStripe,
  onTestSquare,
  onSaveApiCredentials,
  onSaveBillingPolicies,
  twilioSid,
  setTwilioSid,
  twilioToken,
  setTwilioToken,
  twilioPhone,
  setTwilioPhone,
  twilioStatus,
  twilioStatusMsg,
  testCallPhone,
  setTestCallPhone,
  testCallStatus,
  testCallMsg,
  testSmsPhone,
  setTestSmsPhone,
  testSmsBody,
  setTestSmsBody,
  testSmsStatus,
  testSmsMsg,
  onTestTwilioCreds,
  onPlaceTestCall,
  onSendTestSms,
}: DriverPayoutsPanelProps) {
  return (
    <>
      {/* ─── Sub-View: Payment Gateways & Terminals ─── */}
      {activeSub === 'gateways' && (
        <div className="space-y-6">
          {/* Top Info Banner */}
          <div className="bg-indigo-950 text-white p-5 rounded-2xl border border-indigo-900 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CreditCardIcon className="w-5 h-5 text-indigo-400" />
                <h3 className="font-extrabold text-base tracking-wide">Enterprise Payment Gateways &amp; Processing</h3>
              </div>
              <p className="text-xs text-indigo-200">
                PCI-DSS Level 1 compliant tokenized card vaulting, automatic pre-auth hold captures, and mobile driver terminal integration.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                  stripeMode === 'live'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                {stripeMode === 'live' ? '● Live Production' : '● Test Sandbox'}
              </span>
            </div>
          </div>

          {/* Stripe API Credentials Card */}
          <Card className="border border-slate-200/90 shadow-xs">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Stripe API &amp; Elements Vault</span>
                  <Badge variant="primary">Primary Processor</Badge>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Used for public booking card pre-authorizations, passenger tokenization, and driver app captures
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStripeMode(stripeMode === 'live' ? 'test' : 'live')}
                  className={`text-xs px-3 py-1 rounded-lg border font-bold cursor-pointer transition-all ${
                    stripeMode === 'live'
                      ? 'bg-rose-50 border-rose-300 text-rose-700'
                      : 'bg-blue-50 border-blue-300 text-blue-700'
                  }`}
                >
                  Mode: {stripeMode === 'live' ? 'Switch to Test Sandbox' : 'Switch to Live'}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Stripe Publishable Key ({stripeMode === 'live' ? 'pk_live_...' : 'pk_test_...'})
                  </label>
                  <input
                    type="text"
                    value={stripePk}
                    onChange={(e) => setStripePk(e.target.value)}
                    placeholder={stripeMode === 'live' ? 'pk_live_51...' : 'pk_test_51...'}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Mounted inside client-side Stripe Elements for PCI card tokenization
                  </p>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Stripe Restricted Secret Key ({stripeMode === 'live' ? 'sk_live_...' : 'sk_test_...'})
                  </label>
                  <input
                    type="password"
                    value={stripeSk}
                    onChange={(e) => setStripeSk(e.target.value)}
                    placeholder={stripeMode === 'live' ? 'sk_live_51...' : 'sk_test_51...'}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Server-side PaymentIntent pre-authorization and capture authority
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Stripe Webhook Signing Secret (whsec_...)
                </label>
                <input
                  type="password"
                  value={stripeWebhookSecret}
                  onChange={(e) => setStripeWebhookSecret(e.target.value)}
                  placeholder="whsec_..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Status Alert */}
              {stripeStatusMsg && (
                <div
                  className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
                    stripeStatus === 'connected'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : stripeStatus === 'error'
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {stripeStatus === 'connected' && <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                    {stripeStatus === 'error' && <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0" />}
                    {stripeStatus === 'checking' && <SpinnerIcon className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
                    <span>{stripeStatusMsg}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={stripeStatus === 'checking'}
                  onClick={onTestStripe}
                  className="text-xs font-bold text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                >
                  {stripeStatus === 'checking' ? 'Testing Connection...' : 'Verify Stripe API Connection'}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onSaveApiCredentials('Stripe Gateway')}
                  className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Save Stripe Keys
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Square POS & Terminal Card */}
          <Card className="border border-slate-200/90 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Square POS &amp; Terminal API</span>
                <Badge variant="neutral">Secondary / POS</Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Support for Square Terminal hardware reader devices and in-person card transactions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Square Application ID</label>
                  <input
                    type="text"
                    value={squareAppId}
                    onChange={(e) => setSquareAppId(e.target.value)}
                    placeholder="sq0idp-..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Square Access Token</label>
                  <input
                    type="password"
                    value={squareToken}
                    onChange={(e) => setSquareToken(e.target.value)}
                    placeholder="EAAA..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Location ID</label>
                  <input
                    type="text"
                    value={squareLocId}
                    onChange={(e) => setSquareLocId(e.target.value)}
                    placeholder="L..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>
              </div>

              {squareStatusMsg && (
                <div
                  className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                    squareStatus === 'connected'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : squareStatus === 'error'
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}
                >
                  {squareStatus === 'connected' && <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                  {squareStatus === 'error' && <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0" />}
                  <span>{squareStatusMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={squareStatus === 'checking'}
                  onClick={onTestSquare}
                  className="text-xs font-bold text-slate-700 border-slate-200 hover:bg-slate-50"
                >
                  Verify Square Connection
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onSaveApiCredentials('Square')}
                  className="text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white"
                >
                  Save Square Keys
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Surcharge & Terminal Operational Policies */}
          <Card className="border border-slate-200/90 shadow-xs">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-slate-900">
                Payment Policies &amp; Terminal Automation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">In-Vehicle Contactless / Chip Terminals</span>
                    <input
                      type="checkbox"
                      checked={stripeTerminalEnabled}
                      onChange={(e) => setStripeTerminalEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Allows passengers to pay inside the cab using contactless card readers, Apple Pay, and Google Pay.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 text-xs">Pass Processing Surcharge to Client</span>
                    <input
                      type="checkbox"
                      checked={passCardSurcharge}
                      onChange={(e) => setPassCardSurcharge(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 shrink-0"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Adds an itemized {surchargePercent}% surcharge fee to credit card transactions.
                  </p>
                  {passCardSurcharge && (
                    <div className="flex items-center gap-2 pt-1">
                      <label className="text-[11px] font-bold text-slate-700">Surcharge %:</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={surchargePercent}
                        onChange={(e) => setSurchargePercent(Number(e.target.value))}
                        className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-xs font-mono"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="font-bold text-blue-900 text-xs">Automatic Email Receipts</p>
                    <p className="text-[11px] text-blue-700">
                      Dispatches itemized tax receipts automatically upon trip completion.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoEmailReceipts}
                    onChange={(e) => setAutoEmailReceipts(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                </div>

                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-emerald-950 text-xs">Default Driver Commission Split</p>
                    <p className="text-[11px] text-emerald-800">
                      Driver keeps {driverCommissionPercent}% / Company {Math.max(0, 100 - driverCommissionPercent)}% (tolls &amp; tips 100% driver).
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min="10"
                      max="99"
                      value={driverCommissionPercent}
                      onChange={(e) => setDriverCommissionPercent(Number(e.target.value))}
                      className="w-16 px-2 py-1 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-bold text-emerald-900"
                    />
                    <span className="text-xs font-bold text-emerald-900">%</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isSaving}
                  onClick={onSaveBillingPolicies}
                  leftIcon={<CheckIcon className="w-3.5 h-3.5" />}
                  className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSaving ? 'Saving Policies...' : 'Save Payment & Commission Policies'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Sub-View: Twilio Telephony & Voice/SMS Tester ─── */}
      {activeSub === 'telephony' && (
        <div className="space-y-6">
          {/* Top Banner */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <PhoneIcon className="w-5 h-5 text-rose-500" />
                <h3 className="font-extrabold text-base tracking-wide">Twilio Telephony &amp; Softphone Gateway</h3>
              </div>
              <p className="text-xs text-slate-300">
                PSTN telephone network calling, masked driver-passenger voice proxy relay, and automated SMS dispatch.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                  twilioSid && twilioToken
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {twilioSid && twilioToken ? '● Twilio Active' : '○ Missing Credentials'}
              </span>
            </div>
          </div>

          {/* Twilio Cloud Credentials Card */}
          <Card className="border border-slate-200/90 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Twilio Account Credentials</span>
                <Badge variant="primary">Required for Real Phone Calling</Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Credentials from twilio.com/console required to place real PSTN voice calls and deliver SMS text messages to passenger cell phones.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Twilio Account SID (AC...)
                  </label>
                  <input
                    type="text"
                    value={twilioSid}
                    onChange={(e) => setTwilioSid(e.target.value)}
                    placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Twilio Auth Token
                  </label>
                  <input
                    type="password"
                    value={twilioToken}
                    onChange={(e) => setTwilioToken(e.target.value)}
                    placeholder="32-character auth token"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Twilio Phone Number (Caller ID)
                  </label>
                  <input
                    type="text"
                    value={twilioPhone}
                    onChange={(e) => setTwilioPhone(e.target.value)}
                    placeholder="+13145550199"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-rose-500"
                  />
                </div>
              </div>

              {twilioStatusMsg && (
                <div
                  className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                    twilioStatus === 'connected'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : twilioStatus === 'error'
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}
                >
                  {twilioStatus === 'connected' && <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                  {twilioStatus === 'error' && <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0" />}
                  {twilioStatus === 'checking' && <SpinnerIcon className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
                  <span>{twilioStatusMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={twilioStatus === 'checking'}
                  onClick={onTestTwilioCreds}
                  className="text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  Verify Twilio Credentials
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onSaveApiCredentials('Twilio Telephony')}
                  className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
                >
                  Save Twilio Keys
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Interactive Live PSTN Voice Call & SMS Tester */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Live Call Tester */}
            <Card className="border border-slate-200/90 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <PhoneIcon className="w-4 h-4 text-emerald-600" />
                  <span>Test Real Outbound Phone Call</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Enter your mobile phone number. Clicking this will trigger Twilio to physically ring your cell phone!
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Your Cell Phone Number
                  </label>
                  <input
                    type="tel"
                    value={testCallPhone}
                    onChange={(e) => setTestCallPhone(e.target.value)}
                    placeholder="e.g. (314) 555-0199 or +13145550199"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {testCallMsg && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                      testCallStatus === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : testCallStatus === 'error'
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-blue-50 border-blue-200 text-blue-800'
                    }`}
                  >
                    {testCallStatus === 'success' && <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                    {testCallStatus === 'error' && <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0" />}
                    {testCallStatus === 'calling' && <SpinnerIcon className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
                    <span>{testCallMsg}</span>
                  </div>
                )}

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={testCallStatus === 'calling'}
                  onClick={onPlaceTestCall}
                  leftIcon={
                    testCallStatus === 'calling' ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PhoneIcon className="w-3.5 h-3.5" />
                    )
                  }
                  className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white py-2.5"
                >
                  {testCallStatus === 'calling' ? 'Calling Your Phone...' : 'Ring My Cell Phone Now'}
                </Button>
              </CardContent>
            </Card>

            {/* Live SMS Tester */}
            <Card className="border border-slate-200/90 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Test Real SMS Dispatch</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Send a live SMS text message to verify passenger dispatch alerts and driver relay notifications.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Recipient Cell Phone Number
                  </label>
                  <input
                    type="tel"
                    value={testSmsPhone}
                    onChange={(e) => setTestSmsPhone(e.target.value)}
                    placeholder="e.g. (314) 555-0199 or +13145550199"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    SMS Message Body
                  </label>
                  <input
                    type="text"
                    value={testSmsBody}
                    onChange={(e) => setTestSmsBody(e.target.value)}
                    placeholder="Message text..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {testSmsMsg && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                      testSmsStatus === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : testSmsStatus === 'error'
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-blue-50 border-blue-200 text-blue-800'
                    }`}
                  >
                    {testSmsStatus === 'success' && <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                    {testSmsStatus === 'error' && <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0" />}
                    {testSmsStatus === 'sending' && <SpinnerIcon className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
                    <span>{testSmsMsg}</span>
                  </div>
                )}

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={testSmsStatus === 'sending'}
                  onClick={onSendTestSms}
                  leftIcon={
                    testSmsStatus === 'sending' ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
                    )
                  }
                  className="w-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white py-2.5"
                >
                  {testSmsStatus === 'sending' ? 'Dispatching SMS...' : 'Send Test SMS to Cell Phone'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ─── Sub-View: Accounting Sync & General Ledger ─── */}
      {activeSub === 'accounting-sync' && (
        <div className="space-y-4">
          <Card className="border border-slate-200/90 shadow-xs">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 gap-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  QuickBooks &amp; General Ledger Transactions
                </CardTitle>
                <CardDescription className="text-xs">
                  Double-entry journal records for fares, tips, platform commission fees, driver disbursements, and tolls
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Period:</span>
                <select
                  value={ledgerFilter}
                  onChange={(e) => setLedgerFilter(e.target.value as LedgerPeriodFilter)}
                  className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800"
                >
                  <option value="all">All Available Records</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="today">Today Only</option>
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0 md:p-6 md:pt-2 space-y-4">
              {/* Mobile General Ledger Cards (< md) */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredLedgerEntries.length === 0 ? (
                  <div className="py-10 px-4 text-center text-slate-400 text-xs font-medium">
                    No ledger transactions recorded for the selected period.
                  </div>
                ) : (
                  filteredLedgerEntries.map((entry) => {
                    const isCredit = entry.type === 'fare_revenue' || entry.type === 'platform_commission';
                    return (
                      <div key={entry.id} className="p-3.5 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                entry.type === 'fare_revenue'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : entry.type === 'invoice_settlement'
                                  ? 'bg-teal-100 text-teal-800'
                                  : entry.type === 'driver_payout'
                                  ? 'bg-blue-100 text-blue-800'
                                  : entry.type === 'platform_commission'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : entry.type === 'tip_collected'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {entry.type.replace(/_/g, ' ')}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">{entry.date}</span>
                          </div>
                          <span
                            className={`font-mono text-xs font-black tabular-nums shrink-0 ${
                              isCredit ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {isCredit ? '+' : '-'}${entry.amount.toFixed(2)}
                          </span>
                        </div>

                        <div className="text-xs text-slate-800 font-medium leading-snug">
                          {entry.description}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono text-slate-500">
                          <span className="font-semibold text-slate-600">{entry.accountCode}</span>
                          <span className="text-blue-600">{entry.tripId || entry.invoiceId || '—'}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop Ledger Table (md+) */}
              <div className="hidden md:block overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs min-w-[750px]">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Account Code</th>
                      <th className="px-4 py-3">Reference / Trip</th>
                      <th className="px-4 py-3">Memo / Description</th>
                      <th className="px-4 py-3 text-right">Debit ($)</th>
                      <th className="px-4 py-3 text-right">Credit ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLedgerEntries.map((entry) => {
                      const isCredit = entry.type === 'fare_revenue' || entry.type === 'platform_commission';
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">{entry.date}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                entry.type === 'fare_revenue'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : entry.type === 'invoice_settlement'
                                  ? 'bg-teal-100 text-teal-800'
                                  : entry.type === 'driver_payout'
                                  ? 'bg-blue-100 text-blue-800'
                                  : entry.type === 'platform_commission'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : entry.type === 'tip_collected'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {entry.type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">{entry.accountCode}</td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-blue-600">{entry.tripId || entry.invoiceId || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-700">{entry.description}</td>
                          <td className="px-4 py-2.5 font-mono text-right text-rose-600 font-bold whitespace-nowrap">
                            {!isCredit ? `$${entry.amount.toFixed(2)}` : '—'}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-right text-emerald-600 font-bold whitespace-nowrap">
                            {isCredit ? `$${entry.amount.toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredLedgerEntries.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                          No ledger transactions recorded for the selected period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
