import React, { useState } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import { sanitizePhoneNumber, validatePhoneNumber } from '../../../../core/services/telephony.service';
import { authorizedFetch } from '../../../../core/services/auth/auth-headers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { CheckIcon, LockIcon, PhoneIcon, SpinnerIcon } from '../../../ui/Icons';
import { CannedSmsTemplatesEditorCard } from './CannedSmsTemplatesEditorCard';

export interface TelephonyAndSmsTemplatesPanelProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  onNotifySuccess: (message: string) => void;
  isLoading?: boolean;
}

export function TelephonyAndSmsTemplatesPanel({
  settings,
  onSave,
  onNotifySuccess,
  isLoading = false,
}: TelephonyAndSmsTemplatesPanelProps) {
  const [isSavingTel, setIsSavingTel] = useState(false);

  const [twilioSid, setTwilioSid] = useState(
    () =>
      settings.integrations?.telephony?.accountSid ||
      (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_sid')) ||
      ''
  );
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioPhone, setTwilioPhone] = useState(
    () =>
      settings.integrations?.telephony?.phoneNumber ||
      (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_phone')) ||
      '+13147380100'
  );
  const [twilioApiKey, setTwilioApiKey] = useState(
    () =>
      settings.integrations?.telephony?.apiKeySid ||
      (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_api_key')) ||
      ''
  );
  const [twilioApiSecret, setTwilioApiSecret] = useState('');
  const [twilioTwimlAppSid, setTwilioTwimlAppSid] = useState(
    () =>
      settings.integrations?.telephony?.twimlAppSid ||
      (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_twiml_app_sid')) ||
      ''
  );
  const [twilioStatus, setTwilioStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>(
    settings.integrations?.telephony?.status === 'connected' ? 'connected' : 'idle'
  );
  const [twilioStatusMsg, setTwilioStatusMsg] = useState<string | null>(
    settings.integrations?.telephony?.statusMessage || null
  );

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
      const resp = await authorizedFetch('/api/telephony/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountSid: twilioSid.trim(),
          authToken: twilioToken.trim() || undefined,
          phoneNumber: twilioPhone.trim(),
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim() || undefined,
            phoneNumber: twilioPhone.trim(),
          },
        }),
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
      setTwilioStatusMsg(`Invalid Twilio Phone Number: ${phoneValidation.error}`);
      return;
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
    const rawPhone = kind === 'call' ? testCallPhone : testSmsPhone;
    const validation = validatePhoneNumber(rawPhone);
    if (!validation.isValid) {
      if (kind === 'call') {
        setTestCallStatus('error');
        setTestCallMsg(validation.error || 'Enter a valid phone number.');
      } else {
        setTestSmsStatus('error');
        setTestSmsMsg(validation.error || 'Enter a valid phone number.');
      }
      return;
    }
    if (kind === 'call') {
      setTestCallStatus('calling');
      setTestCallMsg(`Initiating call to ${validation.e164}...`);
    } else {
      setTestSmsStatus('sending');
      setTestSmsMsg(`Sending SMS to ${validation.e164}...`);
    }
    try {
      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: kind === 'call' ? 'make_call' : 'send_sms',
          to: validation.e164,
          ...(kind === 'sms' ? { body: testSmsBody.trim() } : {}),
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim() || undefined,
            phoneNumber: sanitizePhoneNumber(twilioPhone.trim()),
          },
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as any;
      if (resp.ok && data.success) {
        if (kind === 'call') {
          setTestCallStatus('success');
          setTestCallMsg(data.message || `Call dispatched (${data.callSid}).`);
        } else {
          setTestSmsStatus('success');
          setTestSmsMsg(data.message || `SMS sent (${data.messageSid}).`);
        }
      } else {
        const msg = data.error || data.message || `Failed to ${kind === 'call' ? 'place call' : 'send SMS'}.`;
        if (kind === 'call') {
          setTestCallStatus('error');
          setTestCallMsg(msg);
        } else {
          setTestSmsStatus('error');
          setTestSmsMsg(msg);
        }
      }
    } catch (err: any) {
      if (kind === 'call') {
        setTestCallStatus('error');
        setTestCallMsg(err.message || 'Network error.');
      } else {
        setTestSmsStatus('error');
        setTestSmsMsg(err.message || 'Network error.');
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <PhoneIcon className="w-5 h-5 text-rose-600 shrink-0" />
                <span>Twilio Telephony &amp; In-Browser WebRTC Softphone</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Configure PSTN outbound calling, browser WebRTC softphone SIDs, and two-way SMS relay.
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
              <label className="text-xs font-bold text-slate-700">Twilio Account SID</label>
              <input type="text" value={twilioSid} onChange={(e) => setTwilioSid(e.target.value)} placeholder="AC..." className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <LockIcon className="w-3 h-3 text-slate-400" /> Auth Token (Server-Verified Only)
              </label>
              <input type="password" value={twilioToken} onChange={(e) => setTwilioToken(e.target.value)} placeholder="TWILIO_AUTH_TOKEN" className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Outbound Caller ID</label>
              <input type="text" value={twilioPhone} onChange={(e) => setTwilioPhone(e.target.value)} placeholder="+13147380100" className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">WebRTC API Key SID</label>
              <input type="text" value={twilioApiKey} onChange={(e) => setTwilioApiKey(e.target.value)} placeholder="SK..." className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <LockIcon className="w-3 h-3 text-slate-400" /> WebRTC API Secret
              </label>
              <input type="password" value={twilioApiSecret} onChange={(e) => setTwilioApiSecret(e.target.value)} placeholder="Server env TWILIO_API_SECRET" className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">TwiML App SID</label>
              <input type="text" value={twilioTwimlAppSid} onChange={(e) => setTwilioTwimlAppSid(e.target.value)} placeholder="AP..." className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white" />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={handleVerifyTwilio} disabled={twilioStatus === 'checking' || !twilioSid.trim()} className="text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50">
                {twilioStatus === 'checking' && <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Verify Credentials
              </Button>
              {twilioStatusMsg && (
                <span className={`text-xs font-medium ${twilioStatus === 'connected' ? 'text-emerald-700' : 'text-rose-600'}`}>{twilioStatusMsg}</span>
              )}
            </div>
            <Button type="button" onClick={handleSaveTelephony} disabled={isSavingTel || isLoading} className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-5 py-2 rounded-xl cursor-pointer">
              {isSavingTel && <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Save Telephony Metadata
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/30 space-y-2">
              <span className="text-xs font-extrabold text-slate-900 block">Test Outbound Call</span>
              <div className="flex gap-2">
                <input type="tel" value={testCallPhone} onChange={(e) => setTestCallPhone(e.target.value)} placeholder="+1 (314) 555-0123" className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 bg-white" />
                <Button type="button" onClick={() => handleTestAction('call')} disabled={testCallStatus === 'calling'} className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer">
                  Ring Cell
                </Button>
              </div>
              {testCallMsg && <p className={`text-[11px] font-medium ${testCallStatus === 'success' ? 'text-emerald-700' : 'text-rose-600'}`}>{testCallMsg}</p>}
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <span className="text-xs font-extrabold text-slate-900 block">Test Outbound SMS</span>
              <div className="flex gap-2">
                <input type="tel" value={testSmsPhone} onChange={(e) => setTestSmsPhone(e.target.value)} placeholder="+1 (314) 555-0123" className="w-36 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 bg-white" />
                <input type="text" value={testSmsBody} onChange={(e) => setTestSmsBody(e.target.value)} className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white" />
                <Button type="button" onClick={() => handleTestAction('sms')} disabled={testSmsStatus === 'sending'} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer">
                  Send
                </Button>
              </div>
              {testSmsMsg && <p className={`text-[11px] font-medium ${testSmsStatus === 'success' ? 'text-emerald-700' : 'text-rose-600'}`}>{testSmsMsg}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <CannedSmsTemplatesEditorCard
        settings={settings}
        onSave={onSave}
        onNotifySuccess={onNotifySuccess}
        isLoading={isLoading}
      />
    </div>
  );
}
