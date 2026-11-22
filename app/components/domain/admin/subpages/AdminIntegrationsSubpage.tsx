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
  ChatBubbleLeftRightIcon,
  CopyIcon,
  RefreshCwIcon,
  PlaneIcon,
} from '../../../ui/Icons';
import { sanitizePhoneNumber, validatePhoneNumber } from '../../../../core/services/telephony.service';
import { authorizedFetch } from '../../../../core/services/auth/auth-headers';
import {
  getPayLinkService,
  type WebhookDiagnosticsSummary,
} from '../../../../core/services/payments/pay-link.service';
import { getFlightStatusService } from '../../../../core/services/flight/flight-status.service';
import type { FlightDiagnosticsSummary } from '../../../../core/types/flight';


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

  // Stripe Gateway Credentials (Secrets managed strictly via Server Environment Variables)
  const [stripeMode, setStripeMode] = useState<'test' | 'live'>(() => {
    return typeof window !== 'undefined' && localStorage.getItem('ct_stripe_mode') === 'live'
      ? 'live'
      : 'test';
  });
  const [stripePk, setStripePk] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_stripe_pk')) || '';
  });
  const [stripeSk, setStripeSk] = useState('');
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
  const [stripeStatus, setStripeStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [stripeStatusMsg, setStripeStatusMsg] = useState<string | null>(null);

  // Square Gateway Credentials (Public IDs only; Access Token in Server Environment)
  const [squareAppId, setSquareAppId] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_square_appid')) || '';
  });
  const [squareToken, setSquareToken] = useState('');
  const [squareLocId, setSquareLocId] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_square_locid')) || '';
  });
  const [squareStatus, setSquareStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [squareStatusMsg, setSquareStatusMsg] = useState<string | null>(null);

  // Twilio Telephony Credentials (Secrets never stored in localStorage or public Firestore)
  const [twilioSid, setTwilioSid] = useState(() => {
    return (
      settings.integrations?.telephony?.accountSid ||
      (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_sid')) ||
      ''
    );
  });
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioPhone, setTwilioPhone] = useState(() => {
    return (
      settings.integrations?.telephony?.phoneNumber ||
      (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_phone')) ||
      '+13147380100'
    );
  });
  const [twilioApiKey, setTwilioApiKey] = useState(() => {
    return (
      settings.integrations?.telephony?.apiKeySid ||
      (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_api_key')) ||
      ''
    );
  });
  const [twilioApiSecret, setTwilioApiSecret] = useState('');
  const [twilioTwimlAppSid, setTwilioTwimlAppSid] = useState(() => {
    return (
      settings.integrations?.telephony?.twimlAppSid ||
      (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_twiml_app_sid')) ||
      ''
    );
  });
  const [twilioStatus, setTwilioStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>(() => {
    if (settings.integrations?.telephony?.status === 'connected') return 'connected';
    return typeof window !== 'undefined' && localStorage.getItem('ct_twilio_status') === 'connected'
      ? 'connected'
      : 'idle';
  });
  const [twilioStatusMsg, setTwilioStatusMsg] = useState<string | null>(() => {
    if (settings.integrations?.telephony?.statusMessage) return settings.integrations.telephony.statusMessage;
    return typeof window !== 'undefined' && localStorage.getItem('ct_twilio_status') === 'connected'
      ? 'Connected'
      : null;
  });

  // Purge any legacy plaintext secrets from browser localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      [
        'ct_stripe_sk',
        'ct_stripe_webhook',
        'ct_square_token',
        'ct_twilio_token',
        'ct_twilio_api_secret',
        'ct_qb_client_secret',
      ].forEach((secretKey) => localStorage.removeItem(secretKey));
    }
    fetch('/api/payments')
      .then((r) => r.json())
      .then((data) => {
        if (data?.stripeConfigured) {
          setStripeStatus('connected');
          setStripeStatusMsg('Server environment STRIPE_SECRET_KEY configured');
        }
        if (data?.squareConfigured) {
          setSquareStatus('connected');
          setSquareStatusMsg('Server environment SQUARE_ACCESS_TOKEN configured');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (settings.integrations?.telephony) {
      const tel = settings.integrations.telephony;
      if (tel.accountSid && !twilioSid) setTwilioSid(tel.accountSid);
      if (tel.phoneNumber && (!twilioPhone || twilioPhone === '+13145550199')) setTwilioPhone(tel.phoneNumber);
      if (tel.apiKeySid && !twilioApiKey) setTwilioApiKey(tel.apiKeySid);
      if (tel.twimlAppSid && !twilioTwimlAppSid) setTwilioTwimlAppSid(tel.twimlAppSid);
      if (tel.status === 'connected') setTwilioStatus('connected');
      if (tel.statusMessage) setTwilioStatusMsg(tel.statusMessage);
    }
  }, [settings.integrations?.telephony]);

  // Live Outbound Phone Call Tester
  const [testCallPhone, setTestCallPhone] = useState('');
  const [testCallStatus, setTestCallStatus] = useState<'idle' | 'calling' | 'success' | 'error'>('idle');
  const [testCallMsg, setTestCallMsg] = useState<string | null>(null);

  // Live SMS Tester
  const [testSmsPhone, setTestSmsPhone] = useState('');
  const [testSmsBody, setTestSmsBody] = useState('Chesterfield Taxi Test: Your dispatch gateway is operational.');
  const [testSmsStatus, setTestSmsStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [testSmsMsg, setTestSmsMsg] = useState<string | null>(null);

  // Stripe Webhook Diagnostics State
  const [webhookDiag, setWebhookDiag] = useState<WebhookDiagnosticsSummary | null>(null);
  const [isLoadingWebhookDiag, setIsLoadingWebhookDiag] = useState<boolean>(false);
  const [copiedWebhookEndpoint, setCopiedWebhookEndpoint] = useState<boolean>(false);

  // Flight Status Telemetry Diagnostics State
  const [flightDiag, setFlightDiag] = useState<FlightDiagnosticsSummary | null>(null);
  const [isLoadingFlightDiag, setIsLoadingFlightDiag] = useState<boolean>(false);

  const refreshWebhookDiagnostics = async () => {
    setIsLoadingWebhookDiag(true);
    try {
      const diag = await getPayLinkService().fetchWebhookDiagnostics();
      setWebhookDiag(diag);
    } finally {
      setIsLoadingWebhookDiag(false);
    }
  };

  const refreshFlightDiagnostics = async () => {
    setIsLoadingFlightDiag(true);
    try {
      const diag = await getFlightStatusService().fetchDiagnostics();
      setFlightDiag(diag);
    } finally {
      setIsLoadingFlightDiag(false);
    }
  };

  useEffect(() => {
    if (activeSub === 'webhooks') {
      void refreshWebhookDiagnostics();
      void refreshFlightDiagnostics();
    }
  }, [activeSub]);

  // Save Gateways Handler (Only persists public/non-secret identifiers; secrets live in server env)
  const handleSaveGateways = async () => {
    setIsSaving(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('ct_stripe_mode', stripeMode);
        localStorage.setItem('ct_stripe_pk', stripePk.trim());
        localStorage.setItem('ct_square_appid', squareAppId.trim());
        localStorage.setItem('ct_square_locid', squareLocId.trim());
        localStorage.removeItem('ct_stripe_sk');
        localStorage.removeItem('ct_stripe_webhook');
        localStorage.removeItem('ct_square_token');
      }
      setStripeSk('');
      setStripeWebhookSecret('');
      setSquareToken('');
      setSaveSuccessMessage('Public payment gateway identifiers saved. Secret keys remain managed via server environment variables.');
      setTimeout(() => setSaveSuccessMessage(null), 3500);
    } catch (e: any) {
      console.error('Failed to save gateway config:', e);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Telephony Handler with live validation; never writes authToken or apiKeySecret to public Firestore or localStorage
  const handleSaveTelephony = async () => {
    setIsSaving(true);
    setTwilioStatusMsg(null);
    try {
      const trimmedSid = twilioSid.trim();
      const trimmedToken = twilioToken.trim();
      const trimmedPhone = twilioPhone.trim();

      if (!trimmedSid) {
        setTwilioStatus('error');
        setTwilioStatusMsg('Twilio Account SID is required.');
        setIsSaving(false);
        return;
      }

      if (!trimmedSid.startsWith('AC') || trimmedSid.length < 30) {
        setTwilioStatus('error');
        setTwilioStatusMsg("Invalid Account SID. Must start with 'AC' and be 34 characters.");
        setIsSaving(false);
        return;
      }

      const phoneValidation = validatePhoneNumber(trimmedPhone);
      if (!phoneValidation.isValid) {
        setTwilioStatus('error');
        setTwilioStatusMsg(`Invalid Twilio Phone Number: ${phoneValidation.error}`);
        setIsSaving(false);
        return;
      }

      setTwilioStatus('checking');
      setTwilioStatusMsg('Verifying credentials with Twilio REST API & saving public metadata...');

      // 1. Call server API to verify credentials
      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_credentials',
          credentials: {
            accountSid: trimmedSid,
            authToken: trimmedToken || undefined,
            phoneNumber: phoneValidation.e164,
          },
        }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.success) {
        setTwilioStatus('error');
        setTwilioStatusMsg(data.error || 'Twilio verification failed. Check SID and server environment TWILIO_AUTH_TOKEN.');
        setIsSaving(false);
        return;
      }

      // 2. Persist ONLY non-secret public metadata to AppSettings in Firestore (never authToken or apiKeySecret!)
      await onSave({
        integrations: {
          ...settings.integrations,
          telephony: {
            provider: 'twilio',
            accountSid: trimmedSid,
            phoneNumber: phoneValidation.e164,
            apiKeySid: twilioApiKey.trim() || undefined,
            twimlAppSid: twilioTwimlAppSid.trim() || undefined,
            status: 'connected',
            statusMessage: `Connected: ${data.friendlyName || trimmedSid}`,
            updatedAt: new Date().toISOString(),
          },
        },
      });

      // 3. Save only non-secret identifiers to localStorage; purge any legacy tokens
      if (typeof window !== 'undefined') {
        localStorage.setItem('ct_twilio_sid', trimmedSid);
        localStorage.setItem('ct_twilio_phone', phoneValidation.e164);
        localStorage.setItem('ct_twilio_api_key', twilioApiKey.trim());
        localStorage.setItem('ct_twilio_twiml_app_sid', twilioTwimlAppSid.trim());
        localStorage.setItem('ct_twilio_status', 'connected');
        localStorage.removeItem('ct_twilio_token');
        localStorage.removeItem('ct_twilio_api_secret');
      }

      setTwilioToken('');
      setTwilioApiSecret('');
      setTwilioStatus('connected');
      setTwilioStatusMsg(`Connected (${data.friendlyName || 'Active Account'})`);
      setSaveSuccessMessage('Twilio telephony metadata verified and saved! Secret tokens are protected on the server.');
      setTimeout(() => setSaveSuccessMessage(null), 5000);
    } catch (e: any) {
      console.error('Failed to save telephony config:', e);
      setTwilioStatus('error');
      setTwilioStatusMsg(e.message || 'Error saving telephony configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestStripe = async () => {
    setStripeStatus('checking');
    setStripeStatusMsg('Authenticating with Stripe API...');
    try {
      const resp = await authorizedFetch('/api/payments', {
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
      const resp = await authorizedFetch('/api/payments', {
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
      const resp = await authorizedFetch('/api/telephony/verify', {
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
          localStorage.setItem('ct_twilio_phone', twilioPhone.trim());
          localStorage.removeItem('ct_twilio_token');
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
    const validation = validatePhoneNumber(testCallPhone);
    if (!validation.isValid) {
      setTestCallStatus('error');
      setTestCallMsg(validation.error || 'Please enter a valid recipient cell phone number to ring.');
      return;
    }
    const cleanTo = validation.e164;
    setTestCallStatus('calling');
    setTestCallMsg(`Initiating outbound call to ${cleanTo}...`);
    try {
      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'make_call',
          to: cleanTo,
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim(),
            phoneNumber: sanitizePhoneNumber(twilioPhone.trim()),
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
        setTestCallMsg(
          data.message === 'Number must be verified in Twilio Trial Console'
            ? 'Number must be verified in Twilio Trial Console. In trial mode, Twilio only connects to verified Caller IDs.'
            : (data.error || data.message || 'Failed to trigger outbound call via Twilio.')
        );
      }
    } catch (err: any) {
      setTestCallStatus('error');
      setTestCallMsg(err.message || 'Network error calling Twilio gateway.');
    }
  };

  const handleTriggerTestSms = async () => {
    const validation = validatePhoneNumber(testSmsPhone);
    if (!validation.isValid) {
      setTestSmsStatus('error');
      setTestSmsMsg(validation.error || 'Please enter a valid recipient phone number for the test SMS.');
      return;
    }
    const cleanTo = validation.e164;
    setTestSmsStatus('sending');
    setTestSmsMsg(`Dispatching SMS to ${cleanTo}...`);
    try {
      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: cleanTo,
          body: testSmsBody.trim(),
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim(),
            phoneNumber: sanitizePhoneNumber(twilioPhone.trim()),
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
        setTestSmsMsg(
          data.message === 'Number must be verified in Twilio Trial Console'
            ? 'Number must be verified in Twilio Trial Console. In trial mode, Twilio only sends SMS to verified Caller IDs.'
            : (data.error || data.message || 'Failed to send SMS via Twilio.')
        );
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base font-extrabold text-slate-900">
                    Card Payment Processing
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Configure online card payments, authorization holds, and in-car card readers.
                  </CardDescription>
                </div>
                <Badge variant={stripeMode === 'live' ? 'success' : 'warning'} className="self-start sm:self-auto shrink-0">
                  {stripeMode === 'live' ? 'Live Production Mode' : 'Test / Sandbox Mode'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-5 sm:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900">Stripe In-Car Reader</h4>
                      <p className="text-xs text-slate-500">Allow drivers to accept contactless tap and chip cards</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={stripeTerminalEnabled}
                      onChange={(e) => setStripeTerminalEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 shrink-0"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                  <h4 className="text-sm font-bold text-slate-900">Surcharges &amp; Convenience Fees</h4>
                  <p className="text-xs text-slate-500">
                    All client-facing surcharges are configured centrally in{' '}
                    <a href="/app/admin?tab=rates&sub=surcharges" className="text-blue-600 font-semibold hover:underline">
                      Rates &amp; Pricing → Surcharges
                    </a>.
                  </p>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 bg-white">
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-slate-900">Gateway Processing Mode</h4>
                  <p className="text-xs text-slate-500">
                    Switch between Stripe Test Keys and Live Production Processing.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-full sm:w-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => setStripeMode('test')}
                    className={`px-3 py-1.5 sm:py-1 text-xs font-bold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                      stripeMode === 'test' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Test Sandbox
                  </button>
                  <button
                    type="button"
                    onClick={() => setStripeMode('live')}
                    className={`px-3 py-1.5 sm:py-1 text-xs font-bold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                      stripeMode === 'live' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Live Production
                  </button>
                </div>
              </div>

              {/* Stripe Credentials Section */}
              <div className="p-4 sm:p-5 rounded-2xl border border-indigo-100 bg-indigo-50/20 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CreditCardIcon className="w-5 h-5 text-indigo-600 shrink-0" />
                    <h3 className="font-extrabold text-slate-900 text-sm">Stripe Gateway API Keys</h3>
                  </div>
                  <Badge variant={stripeStatus === 'connected' ? 'success' : stripeStatus === 'error' ? 'danger' : 'neutral'} className="shrink-0">
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

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestStripe}
                    disabled={stripeStatus === 'checking' || !stripeSk.trim()}
                    className="w-full sm:w-auto justify-center text-xs font-bold text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                  >
                    {stripeStatus === 'checking' ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                    Verify Stripe API Connection
                  </Button>
                  {stripeStatusMsg && (
                    <span className={`text-xs font-medium break-words ${stripeStatus === 'connected' ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {stripeStatusMsg}
                    </span>
                  )}
                </div>
              </div>

              {/* Square Credentials Section */}
              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CreditCardIcon className="w-5 h-5 text-slate-700 shrink-0" />
                    <h3 className="font-extrabold text-slate-900 text-sm">Square Gateway API Keys</h3>
                  </div>
                  <Badge variant={squareStatus === 'connected' ? 'success' : squareStatus === 'error' ? 'danger' : 'neutral'} className="shrink-0">
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

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestSquare}
                    disabled={squareStatus === 'checking' || !squareToken.trim()}
                    className="w-full sm:w-auto justify-center text-xs font-bold text-slate-700 border-slate-300 hover:bg-slate-100"
                  >
                    {squareStatus === 'checking' ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                    Verify Square Connection
                  </Button>
                  {squareStatusMsg && (
                    <span className={`text-xs font-medium break-words ${squareStatus === 'connected' ? 'text-emerald-700' : 'text-rose-600'}`}>
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
                  className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl cursor-pointer"
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <PhoneIcon className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>Twilio Telephony &amp; Softphone Gateway</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Connect your Twilio Account to enable real outbound calling, two-way client/driver SMS, and number masking.
                  </CardDescription>
                </div>
                <Badge
                  variant={twilioStatus === 'connected' ? 'success' : twilioStatus === 'error' ? 'danger' : 'neutral'}
                  className="gap-1 font-bold self-start sm:self-auto shrink-0"
                >
                  {twilioStatus === 'connected' && <CheckIcon className="w-3 h-3 inline text-emerald-700" />}
                  {twilioStatus === 'connected' ? 'Connected' : twilioStatus === 'error' ? 'Connection Error' : 'Unverified'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-5 sm:space-y-6">
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

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestTwilioCreds}
                  disabled={twilioStatus === 'checking' || !twilioSid.trim()}
                  className="w-full sm:w-auto justify-center text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  {twilioStatus === 'checking' ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                  Verify Twilio Credentials
                </Button>
                {twilioStatusMsg && (
                  <span className={`text-xs font-medium break-words ${twilioStatus === 'connected' ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {twilioStatusMsg}
                  </span>
                )}
              </div>

              {/* WebRTC In-Browser Softphone Section */}
              <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <PhoneIcon className="w-4 h-4 text-sky-600 shrink-0" />
                    <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                      In-Browser WebRTC Softphone
                    </h4>
                  </div>
                  <Badge
                    variant={twilioApiKey.trim() && twilioApiSecret.trim() && twilioTwimlAppSid.trim() ? 'success' : 'neutral'}
                    className="text-[11px] self-start sm:self-auto shrink-0"
                  >
                    {twilioApiKey.trim() && twilioApiSecret.trim() && twilioTwimlAppSid.trim()
                      ? 'WebRTC Softphone Ready'
                      : 'WebRTC Not Configured'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">
                  Enables dispatchers to speak and listen directly through their computer headset or microphone right in the browser, without calling physical phones. Required for browser-native audio.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Twilio API Key SID</label>
                    <input
                      type="text"
                      value={twilioApiKey}
                      onChange={(e) => setTwilioApiKey(e.target.value)}
                      placeholder="SK..."
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white"
                    />
                    <p className="text-[10px] text-slate-400">Twilio Console &gt; Account &gt; API Keys</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <LockIcon className="w-3 h-3 text-slate-400" />
                      <span>Twilio API Key Secret</span>
                    </label>
                    <input
                      type="password"
                      value={twilioApiSecret}
                      onChange={(e) => setTwilioApiSecret(e.target.value)}
                      placeholder="API Key Secret string"
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white"
                    />
                    <p className="text-[10px] text-slate-400">Shown once when API Key is created</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">TwiML App SID</label>
                    <input
                      type="text"
                      value={twilioTwimlAppSid}
                      onChange={(e) => setTwilioTwimlAppSid(e.target.value)}
                      placeholder="AP..."
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white"
                    />
                    <p className="text-[10px] text-slate-400">Twilio Console &gt; Voice &gt; TwiML Apps</p>
                  </div>
                </div>
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
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-md">
                  <input
                    type="tel"
                    value={testCallPhone}
                    onChange={(e) => setTestCallPhone(e.target.value)}
                    placeholder="+1 (314) 555-0123"
                    className="flex-1 min-w-0 px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 bg-white"
                  />
                  <Button
                    type="button"
                    onClick={handleTriggerTestCall}
                    disabled={testCallStatus === 'calling'}
                    className="w-full sm:w-auto justify-center bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2 rounded-xl cursor-pointer shrink-0"
                  >
                    {testCallStatus === 'calling' ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <PhoneIcon className="w-3.5 h-3.5" />
                        <span>Ring My Cell Phone</span>
                      </span>
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <Button
                    type="button"
                    onClick={handleTriggerTestSms}
                    disabled={testSmsStatus === 'sending'}
                    className="w-full sm:w-auto justify-center bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 rounded-xl cursor-pointer shrink-0"
                  >
                    {testSmsStatus === 'sending' ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
                        <span>Send Test SMS to Cell Phone</span>
                      </span>
                    )}
                  </Button>
                  {testSmsMsg && (
                    <span className={`text-xs font-medium break-words ${testSmsStatus === 'success' ? 'text-emerald-700' : 'text-rose-600'}`}>
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
                  className="w-full sm:w-auto justify-center bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl cursor-pointer"
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
      {activeSub === 'webhooks' && (() => {
        const currentOrigin =
          typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'https://chesterfield-taxi.vercel.app';
        const stripeWebhookEndpointUrl = `${currentOrigin}/api/payments/webhook`;
        const subscribedList = webhookDiag?.subscribedEvents?.length
          ? webhookDiag.subscribedEvents
          : [
              'payment_intent.amount_capturable_updated',
              'payment_intent.succeeded',
              'payment_intent.payment_failed',
              'payment_intent.canceled',
              'charge.refunded',
            ];

        return (
          <div className="space-y-6">
            {/* Card 1: Verified Stripe Payment & Invoicing Webhook Engine */}
            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <CreditCardIcon className="w-5 h-5 text-indigo-600 shrink-0" />
                      <span>Stripe Payment &amp; Corporate Invoice Webhook</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Cryptographic HMAC-SHA256 verified webhook endpoint reconciling pre-auth holds, 1-tap Pay Links, B2B invoices, and general ledger entries.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <Badge
                      variant={webhookDiag?.webhookSecretConfigured ? 'success' : 'warning'}
                      className="font-bold"
                    >
                      {webhookDiag?.webhookSecretConfigured
                        ? 'Signing Secret Ready'
                        : 'Missing STRIPE_WEBHOOK_SECRET'}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isLoadingWebhookDiag}
                      onClick={refreshWebhookDiagnostics}
                      className="text-xs font-bold px-2.5 py-1.5 cursor-pointer"
                    >
                      {isLoadingWebhookDiag ? (
                        <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCwIcon className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-6 space-y-5">
                {/* Copyable Endpoint URL */}
                <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-slate-900">
                      Stripe Webhook Endpoint URL (POST):
                    </span>
                    <span className="text-[11px] font-mono text-indigo-700">
                      Replay Protection: {webhookDiag?.toleranceSeconds ?? 300}s &middot; Mode:{' '}
                      {(webhookDiag?.stripeMode || 'unconfigured').toUpperCase()}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-white p-2.5 rounded-lg border border-indigo-200 text-slate-800 select-all break-all">
                      {stripeWebhookEndpointUrl}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard?.writeText(stripeWebhookEndpointUrl);
                        setCopiedWebhookEndpoint(true);
                        setTimeout(() => setCopiedWebhookEndpoint(false), 2000);
                      }}
                      className="bg-white border-indigo-300 text-indigo-800 font-bold text-xs px-3 py-2 cursor-pointer shrink-0 justify-center"
                    >
                      {copiedWebhookEndpoint ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckIcon className="w-3.5 h-3.5" />
                          <span>Copied</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <CopyIcon className="w-3.5 h-3.5" />
                          <span>Copy URL</span>
                        </span>
                      )}
                    </Button>
                  </div>

                  <p className="text-[11px] text-slate-600">
                    In Stripe Dashboard &gt; Developers &gt; Webhooks, add this endpoint URL and set the{' '}
                    <code className="font-mono font-bold">STRIPE_WEBHOOK_SECRET</code> (<code>whsec_...</code>) server environment variable.
                  </p>
                </div>

                {/* Subscribed Events List */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">
                    Subscribed Stripe Events ({subscribedList.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {subscribedList.map((evtName) => (
                      <span
                        key={evtName}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono text-[11px] font-semibold text-slate-800"
                      >
                        {evtName}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Recent Processed Webhook Events Log */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Recent Processed Webhook Events ({webhookDiag?.totalProcessedCount ?? 0})
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Deduplicated via /paymentWebhookEvents
                    </span>
                  </div>

                  {!webhookDiag?.recentEvents || webhookDiag.recentEvents.length === 0 ? (
                    <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/50 text-center text-xs text-slate-500">
                      {isLoadingWebhookDiag
                        ? 'Loading processed webhook log...'
                        : 'No Stripe webhook deliveries recorded yet.'}
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-x-auto">
                      <table className="w-full text-left text-xs min-w-[620px]">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <tr>
                            <th className="px-3.5 py-2.5">Processed At</th>
                            <th className="px-3.5 py-2.5">Event ID</th>
                            <th className="px-3.5 py-2.5">Event Type</th>
                            <th className="px-3.5 py-2.5">Target</th>
                            <th className="px-3.5 py-2.5 text-right">Amount</th>
                            <th className="px-3.5 py-2.5">Outcome</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {webhookDiag.recentEvents.map((ev) => (
                            <tr key={ev.id} className="hover:bg-slate-50/70">
                              <td className="px-3.5 py-2 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                                {ev.processedAt
                                  ? new Date(ev.processedAt).toLocaleString()
                                  : '—'}
                              </td>
                              <td className="px-3.5 py-2 font-mono text-[11px] font-bold text-slate-800 whitespace-nowrap">
                                {ev.id}
                              </td>
                              <td className="px-3.5 py-2 font-mono text-[11px] text-indigo-700 whitespace-nowrap">
                                {ev.eventType}
                              </td>
                              <td className="px-3.5 py-2 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                {ev.targetType && ev.targetId
                                  ? `${ev.targetType.toUpperCase()}: ${ev.targetId}`
                                  : '—'}
                              </td>
                              <td className="px-3.5 py-2 font-mono font-bold text-right text-slate-900 whitespace-nowrap">
                                {typeof ev.amount === 'number'
                                  ? `$${ev.amount.toFixed(2)}`
                                  : '—'}
                              </td>
                              <td className="px-3.5 py-2">
                                <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[10px]">
                                  {ev.outcome.replace(/_/g, ' ')}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Telephony & Softphone Webhooks */}
            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="border-b border-slate-100 pb-4">
                <CardTitle className="text-base font-extrabold text-slate-900">
                  Telephony &amp; Dispatch Relay Webhooks
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Configure incoming Twilio webhooks for PSTN calls, WebRTC softphone routing, and two-way passenger SMS.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">Inbound Twilio Webhook URL:</span>
                  <code className="text-xs font-mono bg-white p-2.5 rounded-lg border border-slate-200 block text-slate-700 select-all break-all">
                    {currentOrigin}/api/telephony?action=incoming_call
                  </code>
                  <p className="text-[11px] text-slate-500">
                    Paste this URL into your Twilio Console under Phone Numbers &gt; Active Numbers &gt; Voice &amp; Fax configuration.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/50 space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">TwiML App Voice Request URL (WebRTC Softphone):</span>
                  <code className="text-xs font-mono bg-white p-2.5 rounded-lg border border-sky-300 block text-sky-800 select-all break-all">
                    {currentOrigin}/api/telephony?action=voice_client_twiml
                  </code>
                  <p className="text-[11px] text-slate-500">
                    In Twilio Console &gt; Voice &gt; TwiML Apps, create an App named &ldquo;Dispatch Softphone&rdquo; and paste this URL into the <strong>Voice Request URL</strong> field (HTTP POST or GET). Then paste the App SID (<code>AP...</code>) into the Telephony tab above.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">Inbound SMS Webhook URL:</span>
                  <code className="text-xs font-mono bg-white p-2.5 rounded-lg border border-slate-200 block text-slate-700 select-all break-all">
                    {currentOrigin}/api/telephony?action=incoming_sms
                  </code>
                  <p className="text-[11px] text-slate-500">
                    Paste this URL into your Twilio Console under Messaging configuration to receive passenger text replies into the Dispatch console.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Flight Status Telemetry (AeroDataBox / FlightAware) */}
            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <PlaneIcon className="w-5 h-5 text-blue-600 shrink-0" />
                      <span>Flight Status Telemetry (AeroDataBox / FlightAware)</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Provider-agnostic STL &amp; SUS arrival tracking, Terminal 1 / Terminal 2 curbside door routing, and 1-tap Dispatch ETA sync.
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto shrink-0">
                    <Badge
                      variant={flightDiag?.liveApiConfigured ? 'success' : 'info'}
                      className="font-bold"
                    >
                      {flightDiag?.activeProvider === 'aerodatabox'
                        ? 'AeroDataBox Live'
                        : flightDiag?.activeProvider === 'flightaware'
                        ? 'FlightAware AeroAPI v4'
                        : 'STL Terminal Fallback Ready'}
                    </Badge>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-[11px]">
                      <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{flightDiag?.cacheTtlMinutes ?? 15}-Min Cache Protection</span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={refreshFlightDiagnostics}
                      disabled={isLoadingFlightDiag}
                      className="text-xs font-bold px-2.5 py-1.5 cursor-pointer"
                    >
                      {isLoadingFlightDiag ? (
                        <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCwIcon className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-900">AeroDataBox Adapter</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          flightDiag?.aeroDataBoxConfigured
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {flightDiag?.aeroDataBoxConfigured ? 'Configured' : 'Env Key Unset'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Server env <code className="font-mono">AERODATABOX_API_KEY</code> or{' '}
                      <code className="font-mono">FLIGHT_API_KEY</code> (RapidAPI &amp; direct headers).
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-900">FlightAware AeroAPI v4</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          flightDiag?.flightAwareConfigured
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {flightDiag?.flightAwareConfigured ? 'Configured' : 'Env Key Unset'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Server env <code className="font-mono">FLIGHTAWARE_API_KEY</code> (or{' '}
                      <code className="font-mono">FLIGHT_API_PROVIDER=flightaware</code>).
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-emerald-950">Quota &amp; Rate Shield</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-300">
                        {flightDiag?.cachedEntriesCount ?? 0} Cached
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-900/80">
                      15-minute TTL on <code className="font-mono">/flightStatusCache</code> + per-IP rate limiting;{' '}
                      <code className="font-mono">forceRefresh</code> restricted to staff.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="text-slate-700">
                    <strong className="text-slate-900">Regional Airport Intelligence:</strong>{' '}
                    {(flightDiag?.supportedAirports || ['STL', 'SUS', 'CPS']).join(' · ')} — Southwest &amp; Lufthansa mapped to{' '}
                    <strong>STL Terminal 2 (Exit Door 12)</strong>; AA, DL, UA, AC &amp; commercial carriers mapped to{' '}
                    <strong>STL Terminal 1 (Exit Door 6 / Door 12)</strong>; SUS &amp; CPS mapped to{' '}
                    <strong>Private FBO Ramp</strong>.
                  </div>
                  <code className="text-[11px] font-mono bg-white px-2.5 py-1 rounded border border-blue-200 text-blue-900 shrink-0">
                    GET /api/flight-status?diagnostics=1
                  </code>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
