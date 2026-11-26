import React, { useState } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import type { TelephonyInboundMode } from '../../../../core/services/comms/telephony-twiml.util';
import { sanitizePhoneNumber, validatePhoneNumber } from '../../../../core/services/telephony.service';
import { authorizedFetch } from '../../../../core/services/auth/auth-headers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Select } from '../../../ui/Select';
import { Switch } from '../../../ui/Switch';
import { CheckIcon, LockIcon, PhoneIcon, SpinnerIcon } from '../../../ui/Icons';
import { CannedSmsTemplatesEditorCard } from './CannedSmsTemplatesEditorCard';
import { TelephonyWebhookGuideCard } from './TelephonyWebhookGuideCard';

export interface TelephonyAndSmsTemplatesPanelProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  onNotifySuccess: (message: string) => void;
  isLoading?: boolean;
}

const INBOUND_MODE_OPTIONS = [
  { value: 'simultaneous_ring', label: 'Nextiva Simultaneous Ring (answerOnBridge, no Twilio voicemail)' },
  { value: 'standalone_ivr', label: 'Standalone Twilio IVR & Voicemail' },
] as const;

const readStored = (key: string): string =>
  (typeof window !== 'undefined' && localStorage.getItem(key)) || '';

export function TelephonyAndSmsTemplatesPanel({
  settings,
  onSave,
  onNotifySuccess,
  isLoading = false,
}: TelephonyAndSmsTemplatesPanelProps) {
  const tel = settings.integrations?.telephony;
  const [isSavingTel, setIsSavingTel] = useState(false);

  const [twilioSid, setTwilioSid] = useState(() => tel?.accountSid || readStored('ct_twilio_sid'));
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioPhone, setTwilioPhone] = useState(() => tel?.phoneNumber || readStored('ct_twilio_phone') || '+13147380100');
  const [bridgePhone, setBridgePhone] = useState(() => tel?.bridgePhoneNumber || readStored('ct_twilio_bridge_phone'));
  const [inboundMode, setInboundMode] = useState<TelephonyInboundMode>(
    () => tel?.inboundMode || (readStored('ct_twilio_inbound_mode') as TelephonyInboundMode) || 'simultaneous_ring'
  );
  const [voiceOnlyMode, setVoiceOnlyMode] = useState<boolean>(() => Boolean(tel?.voiceOnlyMode));
  const [twilioApiKey, setTwilioApiKey] = useState(() => tel?.apiKeySid || readStored('ct_twilio_api_key'));
  const [twilioApiSecret, setTwilioApiSecret] = useState('');
  const [twilioTwimlAppSid, setTwilioTwimlAppSid] = useState(() => tel?.twimlAppSid || readStored('ct_twilio_twiml_app_sid'));
  const [twilioStatus, setTwilioStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>(
    tel?.status === 'connected' ? 'connected' : 'idle'
  );
  const [twilioStatusMsg, setTwilioStatusMsg] = useState<string | null>(tel?.statusMessage || null);

  const [testCallPhone, setTestCallPhone] = useState('');
  const [testCallStatus, setTestCallStatus] = useState<'idle' | 'calling' | 'success' | 'error'>('idle');
  const [testCallMsg, setTestCallMsg] = useState<string | null>(null);
  const [testSmsPhone, setTestSmsPhone] = useState('');
  const [testSmsBody, setTestSmsBody] = useState('Chesterfield Taxi Test: Your dispatch gateway is operational.');
  const [testSmsStatus, setTestSmsStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [testSmsMsg, setTestSmsMsg] = useState<string | null>(null);

  const handleVerifyTwilio = async () => {
    setTwilioStatus('checking');
    setTwilioStatusMsg('Connecting to Twilio Accounts API...');
    try {
      const creds = { accountSid: twilioSid.trim(), authToken: twilioToken.trim() || undefined, phoneNumber: twilioPhone.trim() };
      const resp = await authorizedFetch('/api/telephony/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...creds, credentials: creds }),
      });
      const data = (await resp.json().catch(() => ({}))) as any;
      if (resp.ok && data.success) {
        setTwilioStatus('connected');
        setTwilioStatusMsg(data.message || 'Connected');
      } else {
        setTwilioStatus('error');
        setTwilioStatusMsg(data.error || data.message || 'Invalid Twilio credentials.');
      }
    } catch (err: any) {
      setTwilioStatus('error');
      setTwilioStatusMsg(err.message || 'Network error communicating with Twilio.');
    }
  };

  const handleSaveTelephony = async () => {
    const trimmedSid = twilioSid.trim();
    if (!trimmedSid.startsWith('AC') || trimmedSid.length < 30) {
      setTwilioStatus('error');
      setTwilioStatusMsg("Invalid Account SID. Must start with 'AC' and be 34 characters.");
      return;
    }
    const phoneValidation = validatePhoneNumber(twilioPhone.trim());
    if (!phoneValidation.isValid) {
      setTwilioStatus('error');
      setTwilioStatusMsg(`Invalid Verified Outbound Caller ID: ${phoneValidation.error}`);
      return;
    }
    const trimmedBridge = bridgePhone.trim();
    let bridgeE164: string | undefined;
    if (trimmedBridge) {
      const bridgeValidation = validatePhoneNumber(trimmedBridge);
      if (!bridgeValidation.isValid) {
        setTwilioStatus('error');
        setTwilioStatusMsg(`Invalid Twilio Inbound Bridge Number: ${bridgeValidation.error}`);
        return;
      }
      bridgeE164 = bridgeValidation.e164;
    }

    setIsSavingTel(true);
    setTwilioStatus('checking');
    try {
      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_credentials',
          credentials: {
            accountSid: trimmedSid,
            authToken: twilioToken.trim() || undefined,
            phoneNumber: phoneValidation.e164,
            bridgePhoneNumber: bridgeE164,
            inboundMode,
          },
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as any;
      if (!resp.ok || !data.success) {
        setTwilioStatus('error');
        setTwilioStatusMsg(data.error || 'Twilio verification failed.');
        return;
      }
      await onSave({
        integrations: {
          ...settings.integrations,
          telephony: {
            provider: 'twilio',
            accountSid: trimmedSid,
            phoneNumber: phoneValidation.e164,
            bridgePhoneNumber: bridgeE164,
            inboundMode,
            voiceOnlyMode,
            apiKeySid: twilioApiKey.trim() || undefined,
            twimlAppSid: twilioTwimlAppSid.trim() || undefined,
            status: 'connected',
            statusMessage: `Connected: ${data.friendlyName || trimmedSid}`,
            updatedAt: new Date().toISOString(),
          },
        },
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem('ct_twilio_sid', trimmedSid);
        localStorage.setItem('ct_twilio_phone', phoneValidation.e164);
        localStorage.setItem('ct_twilio_bridge_phone', bridgeE164 || '');
        localStorage.setItem('ct_twilio_inbound_mode', inboundMode);
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
      onNotifySuccess('Twilio telephony metadata verified and saved. Secret tokens remain server-only.');
    } finally {
      setIsSavingTel(false);
    }
  };

  const handleTestAction = async (kind: 'call' | 'sms') => {
    const isCall = kind === 'call';
    const setStatus = isCall ? setTestCallStatus : setTestSmsStatus;
    const setMsg = isCall ? setTestCallMsg : setTestSmsMsg;
    const validation = validatePhoneNumber(isCall ? testCallPhone : testSmsPhone);
    if (!validation.isValid) {
      setStatus('error');
      setMsg(validation.error || 'Enter a valid phone number.');
      return;
    }
    setStatus(isCall ? ('calling' as any) : ('sending' as any));
    setMsg(isCall ? `Initiating call to ${validation.e164}...` : `Sending SMS to ${validation.e164}...`);
    try {
      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isCall ? 'make_call' : 'send_sms',
          to: validation.e164,
          ...(isCall ? { isTestCall: true } : { body: testSmsBody.trim() }),
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim() || undefined,
            phoneNumber: sanitizePhoneNumber(twilioPhone.trim()),
          },
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as any;
      if (resp.ok && data.success) {
        setStatus('success');
        setMsg(data.message || (isCall ? `Call dispatched (${data.callSid}).` : `SMS sent (${data.messageSid}).`));
      } else {
        setStatus('error');
        setMsg(data.error || data.message || `Failed to ${isCall ? 'place call' : 'send SMS'}.`);
      }
    } catch (err: any) {
      setStatus('error');
      setMsg(err.message || 'Network error.');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-border-subtle">
        <CardHeader className="border-b border-border-faint pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-extrabold text-fg-primary flex items-center gap-2">
                <PhoneIcon className="w-5 h-5 text-rose-600 shrink-0" />
                <span>Twilio Telephony &amp; In-Browser WebRTC Softphone</span>
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                Configure Nextiva Simultaneous Ring bridge, Verified Outbound Caller ID, WebRTC SIDs, and SMS relay.
              </CardDescription>
            </div>
            <Badge variant={twilioStatus === 'connected' ? 'success' : twilioStatus === 'error' ? 'danger' : 'neutral'}>
              {twilioStatus === 'connected' && <CheckIcon className="w-3 h-3 mr-1 inline" />}
              {twilioStatus === 'connected' ? 'Connected' : twilioStatus === 'error' ? 'Error' : 'Unverified'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary">Twilio Account SID</label>
              <input type="text" value={twilioSid} onChange={(e) => setTwilioSid(e.target.value)} placeholder="AC..." className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border-subtle bg-surface-card" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary flex items-center gap-1">
                <LockIcon className="w-3 h-3 text-fg-subtle" /> Auth Token (Server-Verified Only)
              </label>
              <input type="password" value={twilioToken} onChange={(e) => setTwilioToken(e.target.value)} placeholder="TWILIO_AUTH_TOKEN" className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border-subtle bg-surface-card" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary">Verified Outbound Caller ID</label>
              <input type="text" value={twilioPhone} onChange={(e) => setTwilioPhone(e.target.value)} placeholder="+13147380100" className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border-subtle bg-surface-card" />
              <p className="text-[10.5px] text-fg-muted">Shown to customers on outbound softphone calls — verify in Twilio Verified Caller IDs</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary">Twilio Inbound Bridge Number</label>
              <input type="text" value={bridgePhone} onChange={(e) => setBridgePhone(e.target.value)} placeholder="+13142281454" className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border-subtle bg-surface-card" />
              <p className="text-[10.5px] text-fg-muted">Nextiva Simultaneous Ring target number</p>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-bold text-fg-secondary block">Inbound Call Mode</label>
              <Select
                size="sm"
                aria-label="Inbound Call Mode"
                value={inboundMode}
                options={INBOUND_MODE_OPTIONS}
                onValueChange={(val) => setInboundMode(val === 'standalone_ivr' ? 'standalone_ivr' : 'simultaneous_ring')}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary">WebRTC API Key SID</label>
              <input type="text" value={twilioApiKey} onChange={(e) => setTwilioApiKey(e.target.value)} placeholder="SK..." className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border-subtle bg-surface-card" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary flex items-center gap-1">
                <LockIcon className="w-3 h-3 text-fg-subtle" /> WebRTC API Secret
              </label>
              <input type="password" value={twilioApiSecret} onChange={(e) => setTwilioApiSecret(e.target.value)} placeholder="Server env TWILIO_API_SECRET" className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border-subtle bg-surface-card" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary">TwiML App SID</label>
              <input type="text" value={twilioTwimlAppSid} onChange={(e) => setTwilioTwimlAppSid(e.target.value)} placeholder="AP..." className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border-subtle bg-surface-card" />
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-xl border border-border-subtle bg-surface-subtle/70">
            <Switch
              size="sm"
              tone="blue"
              label="Voice-Only Mode (A2P SMS Deferred)"
              helperText="Marks A2P 10DLC SMS as deferred / Nextiva-managed without blocking Browser WebRTC Voice."
              checked={voiceOnlyMode}
              onChange={setVoiceOnlyMode}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={handleVerifyTwilio} disabled={twilioStatus === 'checking' || !twilioSid.trim()} className="text-xs font-bold text-status-danger-fg border-status-danger-border hover:bg-status-danger-bg">
                {twilioStatus === 'checking' && <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Verify Credentials
              </Button>
              {twilioStatusMsg && (
                <span className={`text-xs font-medium ${twilioStatus === 'connected' ? 'text-status-success-fg' : 'text-rose-600'}`}>{twilioStatusMsg}</span>
              )}
            </div>
            <Button type="button" onClick={handleSaveTelephony} disabled={isSavingTel || isLoading} className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-5 py-2 rounded-xl cursor-pointer">
              {isSavingTel && <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Save Telephony Metadata
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border-faint">
            <div className="p-3.5 rounded-xl border border-status-danger-border bg-status-danger-bg/30 space-y-2">
              <span className="text-xs font-extrabold text-fg-primary block">Test Outbound Call</span>
              <div className="flex gap-2">
                <input type="tel" value={testCallPhone} onChange={(e) => setTestCallPhone(e.target.value)} placeholder="+1 (314) 555-0123" className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-border-strong bg-surface-card" />
                <Button type="button" onClick={() => handleTestAction('call')} disabled={testCallStatus === 'calling'} className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer">
                  Ring Cell
                </Button>
              </div>
              {testCallMsg && <p className={`text-[11px] font-medium ${testCallStatus === 'success' ? 'text-status-success-fg' : 'text-rose-600'}`}>{testCallMsg}</p>}
            </div>

            {voiceOnlyMode ? (
              <div className="p-3.5 rounded-xl border border-dashed border-border-subtle bg-surface-subtle/60 flex flex-col justify-center gap-1 opacity-75">
                <span className="text-xs font-extrabold text-fg-secondary">Test Outbound SMS (Paused — Voice-Only Mode)</span>
                <p className="text-[11px] text-fg-muted">A2P SMS is deferred to Nextiva. Disable Voice-Only Mode above to test Twilio SMS dispatch.</p>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-border-subtle bg-surface-subtle/60 space-y-2">
                <span className="text-xs font-extrabold text-fg-primary block">Test Outbound SMS</span>
                <div className="flex gap-2">
                  <input type="tel" value={testSmsPhone} onChange={(e) => setTestSmsPhone(e.target.value)} placeholder="+1 (314) 555-0123" className="w-36 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-border-strong bg-surface-card" />
                  <input type="text" value={testSmsBody} onChange={(e) => setTestSmsBody(e.target.value)} className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-border-strong bg-surface-card" />
                  <Button type="button" onClick={() => handleTestAction('sms')} disabled={testSmsStatus === 'sending'} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer">
                    Send
                  </Button>
                </div>
                {testSmsMsg && <p className={`text-[11px] font-medium ${testSmsStatus === 'success' ? 'text-status-success-fg' : 'text-rose-600'}`}>{testSmsMsg}</p>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <TelephonyWebhookGuideCard
        inboundMode={inboundMode}
        outboundCallerId={twilioPhone}
        bridgePhoneNumber={bridgePhone}
        voiceOnlyMode={voiceOnlyMode}
        onNotifySuccess={onNotifySuccess}
      />

      <CannedSmsTemplatesEditorCard
        settings={settings}
        onSave={onSave}
        onNotifySuccess={onNotifySuccess}
        isLoading={isLoading}
      />
    </div>
  );
}
