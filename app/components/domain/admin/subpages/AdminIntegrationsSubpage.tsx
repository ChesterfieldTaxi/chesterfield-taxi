import React, { useState, useEffect } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Alert } from '../../../ui/Alert';
import {
  SpinnerIcon,
  CreditCardIcon,
  PhoneIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
  CheckIcon,
  LockIcon,
} from '../../../ui/Icons';

export type IntegrationsSubTab = 'gateways' | 'telephony' | 'webhooks';

interface AdminIntegrationsSubpageProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialSubTab?: IntegrationsSubTab;
}

export function AdminIntegrationsSubpage({
  settings,
  onSave,
  isLoading = false,
  initialSubTab = 'gateways',
}: AdminIntegrationsSubpageProps) {
  const [activeSub, setActiveSub] = useState<IntegrationsSubTab>(initialSubTab);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSub(initialSubTab);
    }
  }, [initialSubTab]);

  // Payment Gateways config state
  const [stripeTerminalEnabled, setStripeTerminalEnabled] = useState(true);
  const [passCardSurcharge, setPassCardSurcharge] = useState(false);
  const [surchargePercent, setSurchargePercent] = useState(3.0);
  const [autoEmailReceipts, setAutoEmailReceipts] = useState(true);

  // Stripe Gateway Credentials
  const [stripeMode, setStripeMode] = useState<'test' | 'live'>(() => {
    return typeof window !== 'undefined' && localStorage.getItem('ct_stripe_mode') === 'live'
      ? 'live'
      : 'test';
  });
  const [stripePk, setStripePk] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_stripe_pk')) || '';
  });
  const [stripeSk, setStripeSk] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_stripe_sk')) || '';
  });
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_stripe_webhook')) || '';
  });
  const [stripeStatus, setStripeStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [stripeStatusMsg, setStripeStatusMsg] = useState<string | null>(null);

  // Square Gateway Credentials
  const [squareAppId, setSquareAppId] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_square_appid')) || '';
  });
  const [squareToken, setSquareToken] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_square_token')) || '';
  });
  const [squareLocId, setSquareLocId] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_square_locid')) || '';
  });
  const [squareStatus, setSquareStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [squareStatusMsg, setSquareStatusMsg] = useState<string | null>(null);

  // Twilio Telephony Credentials
  const [twilioSid, setTwilioSid] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_sid')) || '';
  });
  const [twilioToken, setTwilioToken] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_token')) || '';
  });
  const [twilioPhone, setTwilioPhone] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_phone')) || '+13145550199';
  });
  const [twilioStatus, setTwilioStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>(() => {
    return typeof window !== 'undefined' && localStorage.getItem('ct_twilio_status') === 'connected'
      ? 'connected'
      : 'idle';
  });
  const [twilioStatusMsg, setTwilioStatusMsg] = useState<string | null>(() => {
    return typeof window !== 'undefined' && localStorage.getItem('ct_twilio_status') === 'connected'
      ? 'Connected'
      : null;
  });

  // Live Outbound Phone Call Tester
  const [testCallPhone, setTestCallPhone] = useState('');
  const [testCallStatus, setTestCallStatus] = useState<'idle' | 'calling' | 'success' | 'error'>('idle');
  const [testCallMsg, setTestCallMsg] = useState<string | null>(null);

  // Live SMS Tester
  const [testSmsPhone, setTestSmsPhone] = useState('');
  const [testSmsBody, setTestSmsBody] = useState('Chesterfield Taxi Test: Your dispatch gateway is operational.');
  const [testSmsStatus, setTestSmsStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [testSmsMsg, setTestSmsMsg] = useState<string | null>(null);

  // Save Gateways Handler
  const handleSaveGateways = async () => {
    setIsSaving(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('ct_stripe_mode', stripeMode);
        localStorage.setItem('ct_stripe_pk', stripePk.trim());
        localStorage.setItem('ct_stripe_sk', stripeSk.trim());
        localStorage.setItem('ct_stripe_webhook', stripeWebhookSecret.trim());
        localStorage.setItem('ct_square_appid', squareAppId.trim());
        localStorage.setItem('ct_square_token', squareToken.trim());
        localStorage.setItem('ct_square_locid', squareLocId.trim());
      }
      setSaveSuccessMessage('Payment gateway configurations successfully saved.');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (e: any) {
      console.error('Failed to save gateway config:', e);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Telephony Handler
  const handleSaveTelephony = async () => {
    setIsSaving(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('ct_twilio_sid', twilioSid.trim());
        localStorage.setItem('ct_twilio_token', twilioToken.trim());
        localStorage.setItem('ct_twilio_phone', twilioPhone.trim());
        if (twilioStatus === 'connected') {
          localStorage.setItem('ct_twilio_status', 'connected');
        }
      }
      setSaveSuccessMessage('Twilio telephony gateway credentials saved.');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (e: any) {
      console.error('Failed to save telephony config:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestStripe = async () => {
    setStripeStatus('checking');
    setStripeStatusMsg('Authenticating with Stripe API...');
    try {
      const resp = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_processor',
          processor: 'stripe',
          credentials: { stripeSecretKey: stripeSk.trim() },
        }),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setStripeStatus('error');
        setStripeStatusMsg(`Server returned non-JSON response (${resp.status}). Check server route configuration.`);
        return;
      }

      const data = (await resp.json()) as any;
      if (data.success) {
        setStripeStatus('connected');
        setStripeStatusMsg(data.message || 'Stripe connected successfully!');
      } else {
        setStripeStatus('error');
        setStripeStatusMsg(data.error || data.message || 'Stripe connection failed.');
      }
    } catch (err: any) {
      setStripeStatus('error');
      setStripeStatusMsg(err.message || 'Network error connecting to Stripe.');
    }
  };

  const handleTestSquare = async () => {
    setSquareStatus('checking');
    setSquareStatusMsg('Authenticating with Square API...');
    try {
      const resp = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_processor',
          processor: 'square',
          credentials: { squareAccessToken: squareToken.trim() },
        }),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setSquareStatus('error');
        setSquareStatusMsg(`Server returned non-JSON response (${resp.status}). Check server route configuration.`);
        return;
      }

      const data = (await resp.json()) as any;
      if (data.success) {
        setSquareStatus('connected');
        setSquareStatusMsg(data.message || 'Square connected successfully!');
      } else {
        setSquareStatus('error');
        setSquareStatusMsg(data.error || data.message || 'Square connection failed.');
      }
    } catch (err: any) {
      setSquareStatus('error');
      setSquareStatusMsg(err.message || 'Network error connecting to Square.');
    }
  };

  const handleTestTwilioCreds = async () => {
    setTwilioStatus('checking');
    setTwilioStatusMsg('Connecting to Twilio Accounts API...');
    try {
      const resp = await fetch('/api/telephony/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountSid: twilioSid.trim(),
          authToken: twilioToken.trim(),
          phoneNumber: twilioPhone.trim(),
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim(),
            phoneNumber: twilioPhone.trim(),
          },
        }),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const rawText = await resp.text().catch(() => '');
        console.warn('[Twilio Verification] Non-JSON response received:', resp.status, rawText.slice(0, 100));
        setTwilioStatus('error');
        setTwilioStatusMsg(
          `Server returned non-JSON response (${resp.status}). Please verify the telephony endpoint is configured.`
        );
        return;
      }

      const data = (await resp.json()) as any;
      if (data.success) {
        setTwilioStatus('connected');
        setTwilioStatusMsg(data.message || 'Connected');
        if (typeof window !== 'undefined') {
          localStorage.setItem('ct_twilio_status', 'connected');
          localStorage.setItem('ct_twilio_sid', twilioSid.trim());
          localStorage.setItem('ct_twilio_token', twilioToken.trim());
          localStorage.setItem('ct_twilio_phone', twilioPhone.trim());
        }
      } else {
        setTwilioStatus('error');
        setTwilioStatusMsg(data.error || data.message || 'Invalid Credentials');
        if (typeof window !== 'undefined') {
          localStorage.removeItem('ct_twilio_status');
        }
      }
    } catch (err: any) {
      setTwilioStatus('error');
      setTwilioStatusMsg(err.message || 'Network error communicating with Twilio.');
    }
  };

  const handleTriggerTestCall = async () => {
    if (!testCallPhone.trim()) {
      setTestCallStatus('error');
      setTestCallMsg('Please enter a recipient cell phone number to ring.');
      return;
    }
    setTestCallStatus('calling');
    setTestCallMsg(`Initiating outbound call to ${testCallPhone}...`);
    try {
      const resp = await fetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'make_call',
          to: testCallPhone.trim(),
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim(),
            phoneNumber: twilioPhone.trim(),
          },
        }),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setTestCallStatus('error');
        setTestCallMsg('Server returned non-JSON response. Please verify telephony route.');
        return;
      }

      const data = (await resp.json()) as any;
      if (data.success) {
        setTestCallStatus('success');
        setTestCallMsg(
          data.message ||
            `Call dispatched successfully! Twilio Call SID: ${data.callSid}. Ringing your phone now.`
        );
      } else {
        setTestCallStatus('error');
        setTestCallMsg(data.message || data.error || 'Failed to trigger outbound call via Twilio.');
      }
    } catch (err: any) {
      setTestCallStatus('error');
      setTestCallMsg(err.message || 'Network error calling Twilio gateway.');
    }
  };

  const handleTriggerTestSms = async () => {
    if (!testSmsPhone.trim()) {
      setTestSmsStatus('error');
      setTestSmsMsg('Please enter a recipient phone number for the test SMS.');
      return;
    }
    setTestSmsStatus('sending');
    setTestSmsMsg(`Dispatching SMS to ${testSmsPhone}...`);
    try {
      const resp = await fetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: testSmsPhone.trim(),
          body: testSmsBody.trim(),
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim(),
            phoneNumber: twilioPhone.trim(),
          },
        }),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setTestSmsStatus('error');
        setTestSmsMsg('Server returned non-JSON response. Please verify telephony route.');
        return;
      }

      const data = (await resp.json()) as any;
      if (data.success) {
        setTestSmsStatus('success');
        setTestSmsMsg(data.message || `SMS sent! Message SID: ${data.messageSid}. Check your phone.`);
      } else {
        setTestSmsStatus('error');
        setTestSmsMsg(data.message || data.error || 'Failed to send SMS via Twilio.');
      }
    } catch (err: any) {
      setTestSmsStatus('error');
      setTestSmsMsg(err.message || 'Network error sending SMS.');
    }
  };

  return (
    <div className="space-y-6">
      {saveSuccessMessage && (
        <Alert variant="success" className="animate-fade-in">
          <CheckIcon className="w-4 h-4 mr-2 inline" />
          {saveSuccessMessage}
        </Alert>
      )}

      {/* ─── TAB 1: PAYMENT GATEWAYS ─── */}
      {activeSub === 'gateways' && (
        <div className="space-y-6">
          {/* Surcharge & Terminal Settings */}
          <Card className="rounded-2xl border-slate-200">
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-extrabold text-slate-900">
                    Payment Gateway &amp; Terminal Processing
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Configure online card vaults, pre-authorization holds, and driver in-cab terminal surcharges.
                  </CardDescription>
                </div>
                <Badge variant={stripeMode === 'live' ? 'success' : 'warning'}>
                  {stripeMode === 'live' ? 'Live Production Mode' : 'Test / Sandbox Mode'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Stripe In-Cab Reader</h4>
                      <p className="text-xs text-slate-500">Allow drivers to accept contactless EMV tap</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={stripeTerminalEnabled}
                      onChange={(e) => setStripeTerminalEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Card Processing Surcharge</h4>
                      <p className="text-xs text-slate-500">Pass non-cash convenience fee to passenger</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={passCardSurcharge}
                      onChange={(e) => setPassCardSurcharge(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                  </div>
                  {passCardSurcharge && (
                    <div className="pt-2 flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-600">Surcharge Fee:</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={surchargePercent}
                        onChange={(e) => setSurchargePercent(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-xs border border-slate-300 rounded-lg"
                      />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Gateway Processing Mode</h4>
                  <p className="text-xs text-slate-500">
                    Switch between Stripe Test Keys and Live Production Processing.
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setStripeMode('test')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                      stripeMode === 'test' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Test Sandbox
                  </button>
                  <button
                    type="button"
                    onClick={() => setStripeMode('live')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                      stripeMode === 'live' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Live Production
                  </button>
                </div>
              </div>

              {/* Stripe Credentials Section */}
              <div className="p-5 rounded-2xl border border-indigo-100 bg-indigo-50/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCardIcon className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-extrabold text-slate-900 text-sm">Stripe Gateway API Keys</h3>
                  </div>
                  <Badge variant={stripeStatus === 'connected' ? 'success' : stripeStatus === 'error' ? 'danger' : 'neutral'}>
                    {stripeStatus === 'connected' ? 'Connected' : stripeStatus === 'error' ? 'Connection Error' : 'Unverified'}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <span>Publishable Key</span>
                      <span className="text-slate-400 font-normal">({stripeMode === 'live' ? 'pk_live_...' : 'pk_test_...'})</span>
                    </label>
                    <input
                      type="text"
                      value={stripePk}
                      onChange={(e) => setStripePk(e.target.value)}
                      placeholder={stripeMode === 'live' ? 'pk_live_...' : 'pk_test_...'}
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <LockIcon className="w-3 h-3 text-slate-400" />
                      <span>Secret Key</span>
                      <span className="text-slate-400 font-normal">({stripeMode === 'live' ? 'sk_live_...' : 'sk_test_...'})</span>
                    </label>
                    <input
                      type="password"
                      value={stripeSk}
                      onChange={(e) => setStripeSk(e.target.value)}
                      placeholder={stripeMode === 'live' ? 'sk_live_...' : 'sk_test_...'}
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <span>Webhook Secret</span>
                      <span className="text-slate-400 font-normal">(whsec_...)</span>
                    </label>
                    <input
                      type="password"
                      value={stripeWebhookSecret}
                      onChange={(e) => setStripeWebhookSecret(e.target.value)}
                      placeholder="whsec_..."
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestStripe}
                    disabled={stripeStatus === 'checking' || !stripeSk.trim()}
                    className="text-xs font-bold text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                  >
                    {stripeStatus === 'checking' ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                    Verify Stripe API Connection
                  </Button>
                  {stripeStatusMsg && (
                    <span className={`text-xs font-medium ${stripeStatus === 'connected' ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {stripeStatusMsg}
                    </span>
                  )}
                </div>
              </div>

              {/* Square Credentials Section */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCardIcon className="w-5 h-5 text-slate-700" />
                    <h3 className="font-extrabold text-slate-900 text-sm">Square Gateway API Keys (Optional Fallback)</h3>
                  </div>
                  <Badge variant={squareStatus === 'connected' ? 'success' : squareStatus === 'error' ? 'danger' : 'neutral'}>
                    {squareStatus === 'connected' ? 'Connected' : squareStatus === 'error' ? 'Connection Error' : 'Unverified'}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Application ID</label>
                    <input
                      type="text"
                      value={squareAppId}
                      onChange={(e) => setSquareAppId(e.target.value)}
                      placeholder="sq0idp-..."
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <LockIcon className="w-3 h-3 text-slate-400" />
                      <span>Access Token</span>
                    </label>
                    <input
                      type="password"
                      value={squareToken}
                      onChange={(e) => setSquareToken(e.target.value)}
                      placeholder="EAAA..."
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Location ID</label>
                    <input
                      type="text"
                      value={squareLocId}
                      onChange={(e) => setSquareLocId(e.target.value)}
                      placeholder="L..."
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestSquare}
                    disabled={squareStatus === 'checking' || !squareToken.trim()}
                    className="text-xs font-bold text-slate-700 border-slate-300 hover:bg-slate-100"
                  >
                    {squareStatus === 'checking' ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                    Verify Square Connection
                  </Button>
                  {squareStatusMsg && (
                    <span className={`text-xs font-medium ${squareStatus === 'connected' ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {squareStatusMsg}
                    </span>
                  )}
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  onClick={handleSaveGateways}
                  disabled={isSaving}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl cursor-pointer"
                >
                  {isSaving ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                  Save Payment Gateway Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TAB 2: TWILIO & TELEPHONY ─── */}
      {activeSub === 'telephony' && (
        <div className="space-y-6">
          <Card className="rounded-2xl border-slate-200">
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <PhoneIcon className="w-5 h-5 text-rose-600" />
                    <span>Twilio Telephony &amp; Softphone Gateway</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Connect your Twilio Account to enable real outbound calling to mobile phones, two-way passenger/driver SMS, and number masking.
                  </CardDescription>
                </div>
                <Badge
                  variant={twilioStatus === 'connected' ? 'success' : twilioStatus === 'error' ? 'danger' : 'neutral'}
                  className="gap-1 font-bold"
                >
                  {twilioStatus === 'connected' && <CheckIcon className="w-3 h-3 inline text-emerald-700" />}
                  {twilioStatus === 'connected' ? 'Connected' : twilioStatus === 'error' ? 'Connection Error' : 'Unverified'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Credentials Form */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Twilio Account SID</label>
                  <input
                    type="text"
                    value={twilioSid}
                    onChange={(e) => {
                      setTwilioSid(e.target.value);
                      if (twilioStatus === 'connected') {
                        setTwilioStatus('idle');
                        setTwilioStatusMsg(null);
                        if (typeof window !== 'undefined') {
                          localStorage.removeItem('ct_twilio_status');
                        }
                      }
                    }}
                    placeholder="AC..."
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <LockIcon className="w-3 h-3 text-slate-400" />
                    <span>Auth Token</span>
                  </label>
                  <input
                    type="password"
                    value={twilioToken}
                    onChange={(e) => {
                      setTwilioToken(e.target.value);
                      if (twilioStatus === 'connected') {
                        setTwilioStatus('idle');
                        setTwilioStatusMsg(null);
                        if (typeof window !== 'undefined') {
                          localStorage.removeItem('ct_twilio_status');
                        }
                      }
                    }}
                    placeholder="32-character secret"
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Outbound Caller ID Number</label>
                  <input
                    type="text"
                    value={twilioPhone}
                    onChange={(e) => setTwilioPhone(e.target.value)}
                    placeholder="+13147380100"
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestTwilioCreds}
                  disabled={twilioStatus === 'checking' || !twilioSid.trim()}
                  className="text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  {twilioStatus === 'checking' ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                  Verify Twilio Credentials
                </Button>
                {twilioStatusMsg && (
                  <span className={`text-xs font-medium ${twilioStatus === 'connected' ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {twilioStatusMsg}
                  </span>
                )}
              </div>

              {/* Interactive Phone Call Tester */}
              <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/30 space-y-3">
                <div className="flex items-center gap-2">
                  <PhoneIcon className="w-4 h-4 text-rose-600" />
                  <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    Interactive Outbound Phone Caller (Ring Your Cell)
                  </h4>
                </div>
                <p className="text-xs text-slate-600">
                  Enter your physical cell phone number below and press "Ring My Cell Phone Now". Twilio will place an outbound call and bridge the call directly to your cell.
                </p>
                <div className="flex items-center gap-2 max-w-md">
                  <input
                    type="tel"
                    value={testCallPhone}
                    onChange={(e) => setTestCallPhone(e.target.value)}
                    placeholder="+1 (314) 555-0123"
                    className="flex-1 px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 bg-white"
                  />
                  <Button
                    type="button"
                    onClick={handleTriggerTestCall}
                    disabled={testCallStatus === 'calling'}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
                  >
                    {testCallStatus === 'calling' ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      '📞 Ring My Cell Phone Now'
                    )}
                  </Button>
                </div>
                {testCallMsg && (
                  <p className={`text-xs font-medium ${testCallStatus === 'success' ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {testCallMsg}
                  </p>
                )}
              </div>

              {/* Interactive SMS Tester */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    Interactive SMS Dispatcher (Send Test Text)
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="tel"
                    value={testSmsPhone}
                    onChange={(e) => setTestSmsPhone(e.target.value)}
                    placeholder="Recipient Mobile (+1...)"
                    className="px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 bg-white"
                  />
                  <input
                    type="text"
                    value={testSmsBody}
                    onChange={(e) => setTestSmsBody(e.target.value)}
                    placeholder="Test message body..."
                    className="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    onClick={handleTriggerTestSms}
                    disabled={testSmsStatus === 'sending'}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
                  >
                    {testSmsStatus === 'sending' ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      '💬 Send Test SMS to Cell Phone'
                    )}
                  </Button>
                  {testSmsMsg && (
                    <span className={`text-xs font-medium ${testSmsStatus === 'success' ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {testSmsMsg}
                    </span>
                  )}
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  onClick={handleSaveTelephony}
                  disabled={isSaving}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl cursor-pointer"
                >
                  {isSaving ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                  Save Telephony Credentials
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TAB 3: WEBHOOKS & APIS ─── */}
      {activeSub === 'webhooks' && (
        <Card className="rounded-2xl border-slate-200">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-base font-extrabold text-slate-900">
              System Webhooks &amp; Third-Party API Keys
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Configure incoming webhooks for dispatch telemetry and outbound ride events for hotel/concierge integrations.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <span className="text-xs font-bold text-slate-800 block">Inbound Twilio Webhook URL:</span>
              <code className="text-xs font-mono bg-white p-2 rounded-lg border border-slate-200 block text-slate-700 select-all">
                https://chesterfieldtaxi.com/api/telephony?action=incoming_call
              </code>
              <p className="text-[11px] text-slate-500">
                Paste this URL into your Twilio Console under Phone Numbers &gt; Active Numbers &gt; Voice &amp; Fax configuration.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <span className="text-xs font-bold text-slate-800 block">Inbound SMS Webhook URL:</span>
              <code className="text-xs font-mono bg-white p-2 rounded-lg border border-slate-200 block text-slate-700 select-all">
                https://chesterfieldtaxi.com/api/telephony?action=incoming_sms
              </code>
              <p className="text-[11px] text-slate-500">
                Paste this URL into your Twilio Console under Messaging configuration to receive passenger text replies into the Dispatch console.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
