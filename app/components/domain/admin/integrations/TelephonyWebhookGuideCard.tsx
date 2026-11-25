import React, { useState } from 'react';
import {
  buildTelephonyWebhookUrls,
  type TelephonyInboundMode,
} from '../../../../core/services/comms/telephony-twiml.util';
import { sanitizePhoneNumber } from '../../../../core/services/telephony.service';
import { getWorkspaceBus } from '../../../../core/services/workspace-bus.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { BellIcon, CheckIcon, CopyIcon, LinkIcon, PhoneIcon } from '../../../ui/Icons';

export interface TelephonyWebhookGuideCardProps {
  inboundMode: TelephonyInboundMode;
  outboundCallerId?: string;
  bridgePhoneNumber?: string;
  voiceOnlyMode?: boolean;
  origin?: string;
  onNotifySuccess?: (message: string) => void;
}

export function TelephonyWebhookGuideCard({
  inboundMode,
  outboundCallerId,
  bridgePhoneNumber,
  voiceOnlyMode = false,
  origin,
  onNotifySuccess,
}: TelephonyWebhookGuideCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [simCallerPhone, setSimCallerPhone] = useState('+13145550199');
  const [lastSimNotice, setLastSimNotice] = useState<string | null>(null);

  const isLocalOrigin =
    typeof window !== 'undefined' &&
    /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(window.location?.hostname || '');
  const resolvedOrigin =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin && !isLocalOrigin
      ? window.location.origin
      : 'https://chesterfield-taxi.vercel.app');

  const urls = buildTelephonyWebhookUrls(resolvedOrigin, inboundMode);
  const webhookRows = [
    {
      key: 'inbound_voice',
      label: 'Inbound Voice Webhook',
      url: urls.inboundVoiceUrl,
      hint:
        inboundMode === 'simultaneous_ring'
          ? 'Twilio Bridge Number -> Voice -> "A call comes in" (HTTP POST). Uses answerOnBridge="true" with zero Twilio voicemail rollover.'
          : 'Twilio Number -> Voice -> "A call comes in" (HTTP POST) for Standalone IVR & Voicemail.',
    },
    {
      key: 'outbound_twiml',
      label: 'TwiML App Outbound Voice URL',
      url: urls.outboundTwimlAppUrl,
      hint: 'Twilio Voice -> TwiML Apps -> Voice Request URL (HTTP POST) for browser softphone outbound calls.',
    },
    {
      key: 'status_callback',
      label: 'Call Status Callback URL',
      url: urls.callStatusCallbackUrl,
      hint: 'Twilio Bridge Number -> Voice -> "Call status changes" (HTTP POST) to log answered & missed calls.',
    },
  ];

  const handleCopy = (key: string, value: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value);
    }
    setCopiedKey(key);
    onNotifySuccess?.(`Copied ${label} to clipboard.`);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
  };

  const handleSimulateIncomingRing = () => {
    const cleanPhone = sanitizePhoneNumber(simCallerPhone.trim() || '+13145550199') || '+13145550199';
    const simCallSid = `SIM_RING_${Date.now().toString(36).toUpperCase()}`;
    getWorkspaceBus().publish('INCOMING_CALL', { from: cleanPhone, callSid: simCallSid });
    setLastSimNotice(`Simulated incoming ring published on WorkspaceBus for ${cleanPhone} (${simCallSid}).`);
    onNotifySuccess?.(`Simulated incoming call ring sent to Dispatch Console (${cleanPhone}).`);
  };

  const handleDismissSimulatedRing = () => {
    getWorkspaceBus().publish('INCOMING_CALL_DISMISSED', {});
    setLastSimNotice('Dismissed simulated ring banner on Dispatch Console.');
  };

  return (
    <Card className="rounded-2xl border-slate-200">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Nextiva Hybrid &amp; Twilio Webhook Setup Guide</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Copy-ready production webhooks and local Dispatch screen-pop verification before enabling live Nextiva Simultaneous Ring.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <Badge variant={inboundMode === 'simultaneous_ring' ? 'info' : 'neutral'}>
              {inboundMode === 'simultaneous_ring' ? 'Nextiva Simultaneous Ring' : 'Standalone IVR'}
            </Badge>
            {voiceOnlyMode && <Badge variant="warning">Voice-Only (A2P SMS Deferred)</Badge>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70">
            <span className="font-bold text-slate-700 block">Verified Outbound Caller ID</span>
            <code className="font-mono text-slate-900 font-semibold">{outboundCallerId?.trim() || '+13147380100'}</code>
            <p className="text-[11px] text-slate-500 mt-0.5">Shown to customers on outbound WebRTC calls (verify in Twilio Verified Caller IDs).</p>
          </div>
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70">
            <span className="font-bold text-slate-700 block">Twilio Inbound Bridge Number</span>
            <code className="font-mono text-slate-900 font-semibold">{bridgePhoneNumber?.trim() || '+13142281454'}</code>
            <p className="text-[11px] text-slate-500 mt-0.5">Add this Twilio number as a Nextiva Simultaneous Ring target alongside desk/mobile phones.</p>
          </div>
        </div>

        <div className="space-y-2.5">
          {webhookRows.map((row) => (
            <div key={row.key} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="min-w-0 space-y-0.5">
                <span className="text-xs font-extrabold text-slate-800 block">{row.label}</span>
                <code className="block text-[11px] font-mono text-blue-800 bg-white px-2 py-1 rounded-lg border border-slate-200 select-all break-all">{row.url}</code>
                <p className="text-[11px] text-slate-500">{row.hint}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => handleCopy(row.key, row.url, row.label)} className="text-xs font-bold shrink-0 bg-white cursor-pointer">
                {copiedKey === row.key ? <CheckIcon className="w-3.5 h-3.5 mr-1 text-emerald-700" /> : <CopyIcon className="w-3.5 h-3.5 mr-1" />}
                {copiedKey === row.key ? 'Copied' : 'Copy'}
              </Button>
            </div>
          ))}
        </div>

        <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2.5">
          <div>
            <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
              <BellIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Local Incoming-Ring &amp; Screen-Pop Simulator</span>
            </span>
            <p className="text-[11px] text-slate-600">
              Publishes <code className="font-mono">INCOMING_CALL</code> on <code className="font-mono">WorkspaceBus</code> to test the Dispatch softphone ring banner &amp; <code className="font-mono">ClientProfileWindow</code> screen-pop (default VIP caller <code className="font-mono">+13145550199</code>).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="tel"
              value={simCallerPhone}
              onChange={(e) => setSimCallerPhone(e.target.value)}
              placeholder="+13145550199"
              aria-label="Simulated caller phone number"
              className="w-44 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 bg-white"
            />
            <Button type="button" onClick={handleSimulateIncomingRing} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg cursor-pointer">
              <PhoneIcon className="w-3.5 h-3.5 mr-1.5" />
              Simulate Incoming Ring (Local Test)
            </Button>
            {lastSimNotice && (
              <Button type="button" variant="outline" size="sm" onClick={handleDismissSimulatedRing} className="text-xs font-semibold bg-white cursor-pointer">
                Dismiss Ring
              </Button>
            )}
          </div>
          {lastSimNotice && <p className="text-[11px] font-medium text-blue-800">{lastSimNotice}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
