import React, { useEffect, useState } from 'react';
import {
  getPayLinkService,
  type WebhookDiagnosticsSummary,
} from '../../../../core/services/payments/pay-link.service';
import { authorizedFetch } from '../../../../core/services/auth/auth-headers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { BellIcon, CheckIcon, CopyIcon, CreditCardIcon, RefreshCwIcon, SpinnerIcon } from '../../../ui/Icons';

interface PushDiagnosticsState {
  firebaseConfigured?: boolean;
  vapidConfigured?: boolean;
  fcmServerConfigured?: boolean;
  projectId?: string;
  mode?: string;
}

export function WebhooksAndPushPanel() {
  const [webhookDiag, setWebhookDiag] = useState<WebhookDiagnosticsSummary | null>(null);
  const [isLoadingWebhook, setIsLoadingWebhook] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [pushDiag, setPushDiag] = useState<PushDiagnosticsState | null>(null);
  const [isLoadingPush, setIsLoadingPush] = useState(false);

  const refreshWebhookDiagnostics = async () => {
    setIsLoadingWebhook(true);
    try {
      const diag = await getPayLinkService().fetchWebhookDiagnostics();
      setWebhookDiag(diag);
    } finally {
      setIsLoadingWebhook(false);
    }
  };

  const refreshPushDiagnostics = async () => {
    setIsLoadingPush(true);
    try {
      const resp = await authorizedFetch('/api/push', { method: 'GET' });
      const data = (await resp.json().catch(() => null)) as PushDiagnosticsState | null;
      if (resp.ok && data) {
        setPushDiag(data);
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingPush(false);
    }
  };

  useEffect(() => {
    void refreshWebhookDiagnostics();
    void refreshPushDiagnostics();
  }, []);

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

  const copyText = (key: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const ENDPOINT_REFERENCES = [
    { key: 'voice', label: 'Twilio Inbound PSTN Call', url: `${currentOrigin}/api/telephony?action=incoming_call` },
    { key: 'twiml', label: 'Twilio WebRTC Softphone TwiML', url: `${currentOrigin}/api/telephony?action=voice_client_twiml` },
    { key: 'sms', label: 'Twilio Inbound SMS Relay', url: `${currentOrigin}/api/telephony?action=incoming_sms` },
    { key: 'email', label: 'Resend Inbound & Delivery Webhook', url: `${currentOrigin}/api/email/webhook` },
    { key: 'track', label: 'Guest /track Self-Service API', url: `${currentOrigin}/api/track` },
  ];

  return (
    <div className="space-y-6">
      {/* CARD 1: STRIPE WEBHOOK DIAGNOSTICS */}
      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <CreditCardIcon className="w-5 h-5 text-indigo-600 shrink-0" />
                <span>Stripe Payment &amp; Corporate Invoice Webhook</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                HMAC-SHA256 verified webhook reconciling pre-auth holds, 1-tap Pay Links, B2B invoices, and general ledger entries.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={webhookDiag?.webhookSecretConfigured ? 'success' : 'warning'} className="font-bold">
                {webhookDiag?.webhookSecretConfigured ? 'Signing Secret Ready' : 'Missing STRIPE_WEBHOOK_SECRET'}
              </Badge>
              <Button type="button" variant="outline" size="sm" disabled={isLoadingWebhook} onClick={refreshWebhookDiagnostics}>
                {isLoadingWebhook ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : <RefreshCwIcon className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-5">
          <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-slate-900">Stripe Webhook Endpoint URL (POST):</span>
              <span className="text-[11px] font-mono text-indigo-700">
                Replay Window: {webhookDiag?.toleranceSeconds ?? 300}s &middot; Mode: {(webhookDiag?.stripeMode || 'unconfigured').toUpperCase()}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-white p-2.5 rounded-lg border border-indigo-200 text-slate-800 select-all break-all">
                {stripeWebhookEndpointUrl}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={() => copyText('stripe', stripeWebhookEndpointUrl)} className="bg-white border-indigo-300 text-indigo-800 font-bold text-xs px-3 py-2">
                {copiedKey === 'stripe' ? <CheckIcon className="w-3.5 h-3.5 mr-1 text-emerald-700" /> : <CopyIcon className="w-3.5 h-3.5 mr-1" />}
                {copiedKey === 'stripe' ? 'Copied' : 'Copy URL'}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {subscribedList.map((evtName) => (
              <span key={evtName} className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono text-[11px] font-semibold text-slate-800">
                {evtName}
              </span>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                Recent Processed Webhook Events ({webhookDiag?.totalProcessedCount ?? 0})
              </span>
              <span className="text-[11px] text-slate-400">Deduplicated via /paymentWebhookEvents</span>
            </div>

            {!webhookDiag?.recentEvents || webhookDiag.recentEvents.length === 0 ? (
              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 text-center text-xs text-slate-500">
                {isLoadingWebhook ? 'Loading processed webhook log...' : 'No Stripe webhook deliveries recorded yet.'}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[600px]">
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
                          {ev.processedAt ? new Date(ev.processedAt).toLocaleString() : '—'}
                        </td>
                        <td className="px-3.5 py-2 font-mono text-[11px] font-bold text-slate-800 whitespace-nowrap">{ev.id}</td>
                        <td className="px-3.5 py-2 font-mono text-[11px] text-indigo-700 whitespace-nowrap">{ev.eventType}</td>
                        <td className="px-3.5 py-2 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                          {ev.targetType && ev.targetId ? `${ev.targetType.toUpperCase()}: ${ev.targetId}` : '—'}
                        </td>
                        <td className="px-3.5 py-2 font-mono font-bold text-right text-slate-900 whitespace-nowrap">
                          {typeof ev.amount === 'number' ? `$${ev.amount.toFixed(2)}` : '—'}
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

      {/* CARD 2: VAPID WEB PUSH & FCM STATUS */}
      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <BellIcon className="w-5 h-5 text-amber-600 shrink-0" />
                <span>Web Push, VAPID &amp; Firebase Cloud Messaging (`/api/push`)</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Real-time Driver offer alerts and Dispatch console background notifications via FCM HTTP v1 &amp; Service Workers.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={pushDiag?.fcmServerConfigured ? 'success' : 'info'} className="font-bold">
                {pushDiag?.mode === 'fcm_http_v1' ? 'FCM HTTP v1 Live' : 'Local Service Worker Mode'}
              </Badge>
              <Button type="button" variant="outline" size="sm" disabled={isLoadingPush} onClick={refreshPushDiagnostics}>
                {isLoadingPush ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : <RefreshCwIcon className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1">
              <span className="text-xs font-extrabold text-slate-900 block">VAPID Public Key</span>
              <p className="text-[11px] text-slate-600">
                {pushDiag?.vapidConfigured ? 'VITE_FIREBASE_VAPID_KEY Configured' : 'Unset (Browser Notification API fallback)'}
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1">
              <span className="text-xs font-extrabold text-slate-900 block">FCM Server Sender</span>
              <p className="text-[11px] text-slate-600">
                {pushDiag?.fcmServerConfigured ? 'FIREBASE_SERVICE_ACCOUNT_JSON Ready' : 'Local Service Worker Dispatch'}
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1">
              <span className="text-xs font-extrabold text-slate-900 block">Firebase Project</span>
              <p className="text-[11px] font-mono text-slate-700">{pushDiag?.projectId || 'chesterfield-taxi'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CARD 3: API & WEBHOOK ENDPOINT REFERENCE */}
      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-base font-extrabold text-slate-900">
            Platform Webhook &amp; Resource Route Reference
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Copyable serverless endpoints for Twilio Voice/SMS, Resend Inbound Email, and `/track` self-service.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-2.5">
          {ENDPOINT_REFERENCES.map((ep) => (
            <div key={ep.key} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-800 block">{ep.label}</span>
                <code className="text-[11px] font-mono text-slate-600 break-all">{ep.url}</code>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => copyText(ep.key, ep.url)} className="text-xs font-bold shrink-0">
                {copiedKey === ep.key ? 'Copied' : 'Copy'}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
