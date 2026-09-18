/**
 * Serverless / SSR Resource Route: Telephony & Twilio Gateway
 * 
 * Securely handles Twilio outbound PSTN voice calling, SMS dispatches,
 * and masked phone relay requests using server-side or admin-configured credentials.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

export interface TelephonyApiRequest {
  action:
    | 'make_call'
    | 'send_sms'
    | 'verify_credentials'
    | 'save_credentials'
    | 'incoming_call'
    | 'incoming_sms'
    | 'handle_unanswered'
    | 'voicemail_recorded'
    | 'voicemail_transcription'
    | 'list_voicemails'
    | 'list_recordings'
    | 'list_messages'
    | 'audio_proxy';
  to?: string;
  from?: string;
  body?: string;
  customTwiml?: string;
  recordingSid?: string;
  credentials?: {
    accountSid?: string;
    authToken?: string;
    phoneNumber?: string;
  };
}

export interface StoredVoicemail {
  id: string;
  contactPhone: string;
  contactName: string;
  recordingSid?: string;
  audioUrl: string;
  audioDuration?: string;
  transcription?: string;
  timestamp: string;
  timestampMs: number;
  isUnread: boolean;
  suggestedBooking?: {
    passengerName?: string;
    passengerPhone?: string;
    pickup?: string;
    dropoff?: string;
    pickupTime?: string;
    notes?: string;
  };
}

export interface StoredSms {
  id: string;
  sid: string;
  from: string;
  to: string;
  body: string;
  direction: 'inbound' | 'outbound';
  timestamp: string;
  timestampMs: number;
}

// In-memory persistent cache across requests
const telephonyStore: {
  voicemails: StoredVoicemail[];
  messages: StoredSms[];
} = ((globalThis as any).__ct_telephony_store ||= {
  voicemails: [
    {
      id: 'vm_1',
      contactName: 'David S.',
      contactPhone: '(314) 555-0199',
      recordingSid: 'RE_demo_1',
      audioUrl: '/api/telephony?action=audio_proxy&recordingSid=RE_demo_1',
      audioDuration: '0:42',
      transcription:
        'Hi, this is David. Need a pickup at 18000 Edison Ave in Chesterfield Valley tomorrow morning at 6:30 AM heading to Terminal 1 at Lambert Airport. Two bags. Thank you.',
      timestamp: 'Today, 8:45 AM',
      timestampMs: Date.now() - 3600000 * 2,
      isUnread: true,
      suggestedBooking: {
        passengerName: 'David S.',
        passengerPhone: '+13145550199',
        pickup: '18000 Edison Ave, Chesterfield, MO 63005',
        dropoff: 'Lambert Airport Terminal 1, St. Louis, MO',
        pickupTime: 'Tomorrow 6:30 AM',
        notes: '2 bags. Early morning airport reservation via Voicemail.',
      },
    },
    {
      id: 'vm_2',
      contactName: 'Dr. Katherine Miller',
      contactPhone: '(314) 555-0144',
      recordingSid: 'RE_demo_2',
      audioUrl: '/api/telephony?action=audio_proxy&recordingSid=RE_demo_2',
      audioDuration: '0:28',
      transcription:
        'Hello Chesterfield Taxi. Please send a sedan to St. Luke\'s Hospital Doctor\'s Building at 3:15 PM today going to 14848 Conway Road. Call my cell when the driver arrives.',
      timestamp: 'Today, 9:20 AM',
      timestampMs: Date.now() - 3600000 * 1,
      isUnread: false,
      suggestedBooking: {
        passengerName: 'Dr. Katherine Miller',
        passengerPhone: '+13145550144',
        pickup: "St. Luke's Hospital, Chesterfield, MO",
        dropoff: '14848 Conway Rd, Chesterfield, MO',
        pickupTime: 'Today 3:15 PM',
        notes: 'Sedan requested. Call cell on arrival.',
      },
    },
  ],
  messages: [],
});

import { sanitizeToE164, validatePhoneNumber, formatDisplayPhone } from '../core/utils/phone';

export { sanitizeToE164, validatePhoneNumber, formatDisplayPhone };
export const sanitizePhoneNumber = sanitizeToE164;
export const toE164 = sanitizeToE164;

async function resolveCredentials(data?: TelephonyApiRequest) {
  let accountSid = (process.env.TWILIO_ACCOUNT_SID || data?.credentials?.accountSid || '').trim();
  let authToken = (process.env.TWILIO_AUTH_TOKEN || data?.credentials?.authToken || '').trim();
  let phoneNumber = (process.env.TWILIO_PHONE_NUMBER || data?.credentials?.phoneNumber || '').trim();

  // If missing from process.env, attempt reading from .env.local on filesystem
  if (!accountSid || !authToken) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const envLocalPath = path.resolve(process.cwd(), '.env.local');
      if (fs.existsSync(envLocalPath)) {
        const content = fs.readFileSync(envLocalPath, 'utf8');
        const sidMatch = content.match(/^TWILIO_ACCOUNT_SID\s*=\s*["']?([^"'\r\n]+)["']?/m);
        const tokenMatch = content.match(/^TWILIO_AUTH_TOKEN\s*=\s*["']?([^"'\r\n]+)["']?/m);
        const phoneMatch = content.match(/^TWILIO_PHONE_NUMBER\s*=\s*["']?([^"'\r\n]+)["']?/m);
        if (!accountSid && sidMatch) accountSid = sidMatch[1].trim();
        if (!authToken && tokenMatch) authToken = tokenMatch[1].trim();
        if (!phoneNumber && phoneMatch) phoneNumber = phoneMatch[1].trim();
      }
    } catch {
      // Ignore filesystem access exceptions in edge environments
    }
  }

  if (!phoneNumber) {
    phoneNumber = '+13147380100';
  }

  return { accountSid, authToken, phoneNumber };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // ─── AUDIO STREAMING PROXY (Requires Twilio Basic Auth) ───
  if (action === 'audio_proxy') {
    const recordingSid = url.searchParams.get('recordingSid');
    if (!recordingSid) {
      return new Response('Recording SID is required', { status: 400 });
    }
    const { accountSid, authToken } = await resolveCredentials();
    if (!accountSid || !authToken) {
      return new Response('Twilio credentials not configured', { status: 401 });
    }

    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const twilioAudioUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Recordings/${encodeURIComponent(recordingSid)}.mp3`;

    try {
      const resp = await fetch(twilioAudioUrl, {
        headers: { Authorization: authHeader },
      });

      if (!resp.ok) {
        return new Response('Audio stream unavailable or not found', { status: resp.status });
      }

      const audioBuffer = await resp.arrayBuffer();
      return new Response(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.byteLength.toString(),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch (err: any) {
      return new Response(`Error proxying audio: ${err.message}`, { status: 500 });
    }
  }

  // ─── INBOUND VOICE CALL WEBHOOK (WITH RECORDING & VOICEMAIL ROLLOVER) ───
  if (action === 'incoming_call') {
    const { phoneNumber } = await resolveCredentials();
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling Chesterfield Taxi and Car Service. Connecting your call to our dispatch desk.</Say>
  <Dial timeout="18" record="record-from-answer" callerId="${phoneNumber}" action="/api/telephony?action=handle_unanswered">+13147398444</Dial>
</Response>`;
    return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // ─── UNANSWERED INBOUND CALL ROLLOVER TO VOICEMAIL ───
  if (action === 'handle_unanswered') {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Our dispatch team is currently assisting other passengers. Please leave your name, phone number, pickup location, and time after the tone. Press pound when finished.</Say>
  <Record maxLength="120" finishOnKey="#" action="/api/telephony?action=voicemail_recorded" transcribe="true" transcribeCallback="/api/telephony?action=voicemail_transcription" playBeep="true" />
</Response>`;
    return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // ─── VOICEMAIL RECORDING CONFIRMATION ───
  if (action === 'voicemail_recorded') {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you, your voicemail has been received and our dispatch team will prepare your ride.</Say>
  <Hangup/>
</Response>`;
    return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // ─── INBOUND SMS WEBHOOK ───
  if (action === 'incoming_sms') {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Chesterfield Taxi: Thank you for contacting our dispatch desk. We have received your message and an operator will respond shortly.</Message>
</Response>`;
    return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // ─── LIST VOICEMAILS ───
  if (action === 'list_voicemails') {
    return Response.json({
      success: true,
      voicemails: telephonyStore.voicemails,
    });
  }

  // ─── LIST RECORDINGS DIRECTLY FROM TWILIO ───
  if (action === 'list_recordings') {
    const { accountSid, authToken } = await resolveCredentials();
    if (!accountSid || !authToken || !accountSid.startsWith('AC')) {
      return Response.json({ success: true, recordings: [] });
    }

    try {
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const recResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Recordings.json?PageSize=30`,
        { headers: { Authorization: authHeader } }
      );
      const recData = (await recResp.json()) as any;

      if (recResp.ok && Array.isArray(recData.recordings)) {
        const recordings = recData.recordings.map((r: any) => {
          const durSec = parseInt(r.duration || '30', 10);
          return {
            sid: r.sid,
            callSid: r.call_sid,
            duration: `${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, '0')}`,
            durationSeconds: durSec,
            dateCreated: r.date_created,
            audioUrl: `/api/telephony?action=audio_proxy&recordingSid=${r.sid}`,
          };
        });
        return Response.json({ success: true, recordings });
      }
      return Response.json({ success: true, recordings: [] });
    } catch {
      return Response.json({ success: true, recordings: [] });
    }
  }

  // ─── LIST MESSAGES DIRECTLY FROM TWILIO ───
  if (action === 'list_messages') {
    const { accountSid, authToken } = await resolveCredentials();
    if (!accountSid || !authToken || !accountSid.startsWith('AC')) {
      return Response.json({ success: true, messages: telephonyStore.messages });
    }

    try {
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const msgResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json?PageSize=50`,
        { headers: { Authorization: authHeader } }
      );
      const msgData = (await msgResp.json()) as any;

      if (msgResp.ok && Array.isArray(msgData.messages)) {
        const liveMessages = msgData.messages.map((m: any) => ({
          id: m.sid,
          sid: m.sid,
          from: m.from,
          to: m.to,
          body: m.body,
          direction: m.direction && m.direction.includes('inbound') ? 'inbound' : 'outbound',
          timestamp: new Date(m.date_sent || m.date_created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestampMs: new Date(m.date_sent || m.date_created).getTime(),
        }));
        return Response.json({ success: true, messages: liveMessages });
      }
      return Response.json({ success: true, messages: telephonyStore.messages });
    } catch {
      return Response.json({ success: true, messages: telephonyStore.messages });
    }
  }

  const { accountSid, authToken, phoneNumber } = await resolveCredentials();
  const isConfigured = Boolean(accountSid && authToken && accountSid.startsWith('AC') && authToken.length >= 16);

  return Response.json({
    status: isConfigured ? 'configured' : 'unconfigured',
    accountSid: accountSid ? `${accountSid.slice(0, 6)}...${accountSid.slice(-4)}` : null,
    phoneNumber: phoneNumber || null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  try {
    const url = new URL(request.url);
    const queryAction = url.searchParams.get('action');
    let data: TelephonyApiRequest = { action: (queryAction as any) || 'verify_credentials' };
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        const json = await request.json();
        data = { ...data, ...json };
      } catch {
        // Fall back to queryAction
      }
    } else if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      try {
        const formData = await request.formData();
        const formObj: Record<string, any> = {};
        formData.forEach((val, key) => { formObj[key] = val; });
        data = {
          action: (formObj.action || queryAction || (formObj.CallSid ? 'incoming_call' : formObj.MessageSid ? 'incoming_sms' : 'verify_credentials')) as any,
          to: formObj.To || formObj.to,
          from: formObj.From || formObj.from,
          body: formObj.Body || formObj.body,
          credentials: formObj.credentials,
        };
      } catch {
        // Form parse error
      }
    }

    if (!data || !data.action) {
      return Response.json(
        { success: false, error: 'Malformed request: "action" is required.' },
        { status: 400 }
      );
    }

    // Resolve credentials from environment, .env.local, or request payload
    let { accountSid, authToken, phoneNumber: twilioFromNumber } = await resolveCredentials(data);

    // ─── INBOUND WEBHOOK: VOICE CALL ───
    if (data.action === 'incoming_call') {
      const phoneNumber = twilioFromNumber;
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling Chesterfield Taxi and Car Service. Connecting your call to our dispatch desk.</Say>
  <Dial timeout="18" record="record-from-answer" callerId="${phoneNumber}" action="/api/telephony?action=handle_unanswered">+13147398444</Dial>
</Response>`;
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
    }

    // ─── UNANSWERED INBOUND CALL ROLLOVER TO VOICEMAIL ───
    if (data.action === 'handle_unanswered') {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Our dispatch team is currently assisting other passengers. Please leave your name, phone number, pickup location, and time after the tone. Press pound when finished.</Say>
  <Record maxLength="120" finishOnKey="#" action="/api/telephony?action=voicemail_recorded" transcribe="true" transcribeCallback="/api/telephony?action=voicemail_transcription" playBeep="true" />
</Response>`;
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
    }

    // ─── VOICEMAIL RECORDED WEBHOOK ───
    if (data.action === 'voicemail_recorded') {
      const formFrom = data.from || 'Caller';
      const recordingUrl = (data as any).RecordingUrl || '';
      const recordingDuration = (data as any).RecordingDuration || '30';
      const recordingSid = (data as any).RecordingSid || '';

      const durSec = parseInt(recordingDuration, 10) || 30;
      const formattedDur = `${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, '0')}`;

      const newVm: StoredVoicemail = {
        id: `vm_${Date.now()}`,
        contactName: formFrom,
        contactPhone: formFrom,
        recordingSid,
        audioUrl: recordingUrl || (recordingSid ? `/api/telephony?action=audio_proxy&recordingSid=${recordingSid}` : ''),
        audioDuration: formattedDur,
        timestamp: 'Just now',
        timestampMs: Date.now(),
        isUnread: true,
        suggestedBooking: {
          passengerName: formFrom,
          passengerPhone: formFrom,
          notes: `New Voicemail via Twilio Call (${formattedDur})`,
        },
      };

      telephonyStore.voicemails.unshift(newVm);

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you, your voicemail has been received and dispatch will prepare your reservation.</Say>
  <Hangup/>
</Response>`;
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
    }

    // ─── VOICEMAIL TRANSCRIPTION WEBHOOK ───
    if (data.action === 'voicemail_transcription') {
      const transcript = (data as any).TranscriptionText || (data as any).transcription || '';
      const recordingSid = (data as any).RecordingSid || '';
      const callSid = (data as any).CallSid || '';

      const vm = telephonyStore.voicemails.find(
        (v) => (recordingSid && v.recordingSid === recordingSid) || (callSid && v.id.includes(callSid))
      );
      if (vm) {
        vm.transcription = transcript;
        if (vm.suggestedBooking) {
          vm.suggestedBooking.notes = `Voicemail: "${transcript}"`;
        }
      }
      return Response.json({ success: true, updated: Boolean(vm) });
    }

    // ─── INBOUND WEBHOOK: SMS ───
    if (data.action === 'incoming_sms') {
      const smsFrom = data.from || 'Passenger';
      const smsBody = data.body || '';
      const sid = (data as any).MessageSid || `msg_${Date.now()}`;

      telephonyStore.messages.unshift({
        id: sid,
        sid,
        from: smsFrom,
        to: data.to || twilioFromNumber,
        body: smsBody,
        direction: 'inbound',
        timestamp: 'Just now',
        timestampMs: Date.now(),
      });

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Chesterfield Taxi: Thank you for contacting our dispatch desk. We have received your message and an operator will respond shortly.</Message>
</Response>`;
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
    }

    // ─── LIST VOICEMAILS VIA POST ───
    if (data.action === 'list_voicemails') {
      return Response.json({ success: true, voicemails: telephonyStore.voicemails });
    }

    // ─── SAVE CREDENTIALS ENDPOINT ───
    if (data.action === 'save_credentials') {
      const candidateSid = (data.credentials?.accountSid || accountSid || '').trim();
      const candidateToken = (data.credentials?.authToken || authToken || '').trim();
      const candidatePhone = (data.credentials?.phoneNumber || twilioFromNumber || '').trim();

      if (!candidateSid || !candidateToken) {
        return Response.json({
          success: false,
          error: 'Twilio Account SID and Auth Token are required.',
        }, { status: 400 });
      }

      if (!candidateSid.startsWith('AC') || candidateSid.length < 30) {
        return Response.json({
          success: false,
          error: "Invalid Account SID. Twilio Account SIDs must start with 'AC' followed by 32 alphanumeric characters.",
        }, { status: 400 });
      }

      const phoneValidation = validatePhoneNumber(candidatePhone);
      if (!phoneValidation.isValid) {
        return Response.json({
          success: false,
          error: `Invalid Twilio Phone Number: ${phoneValidation.error}`,
        }, { status: 400 });
      }

      // Verify live with Twilio REST API
      const authHeader = 'Basic ' + Buffer.from(`${candidateSid}:${candidateToken}`).toString('base64');
      try {
        const verifyResp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(candidateSid)}.json`,
          { headers: { Authorization: authHeader } }
        );
        const verifyData = (await verifyResp.json()) as any;

        if (!verifyResp.ok) {
          return Response.json({
            success: false,
            error: verifyData.message || 'Twilio authentication failed with provided credentials.',
            code: verifyData.code,
          }, { status: 401 });
        }

        // Set in-memory environment variables
        process.env.TWILIO_ACCOUNT_SID = candidateSid;
        process.env.TWILIO_AUTH_TOKEN = candidateToken;
        process.env.TWILIO_PHONE_NUMBER = phoneValidation.e164;

        // Persist to .env.local on filesystem
        try {
          const fs = await import('node:fs');
          const path = await import('node:path');
          const envLocalPath = path.resolve(process.cwd(), '.env.local');

          let envContent = '';
          if (fs.existsSync(envLocalPath)) {
            envContent = fs.readFileSync(envLocalPath, 'utf8');
          }

          const upsertEnv = (content: string, key: string, val: string) => {
            const re = new RegExp(`^${key}=.*$`, 'm');
            if (re.test(content)) {
              return content.replace(re, `${key}=${val}`);
            }
            return content.trim() ? `${content.trim()}\n${key}=${val}\n` : `${key}=${val}\n`;
          };

          envContent = upsertEnv(envContent, 'TWILIO_ACCOUNT_SID', candidateSid);
          envContent = upsertEnv(envContent, 'TWILIO_AUTH_TOKEN', candidateToken);
          envContent = upsertEnv(envContent, 'TWILIO_PHONE_NUMBER', phoneValidation.e164);

          fs.writeFileSync(envLocalPath, envContent, 'utf8');
        } catch (fsErr) {
          console.warn('[api.telephony] File persistence warning:', fsErr);
        }

        return Response.json({
          success: true,
          configured: true,
          friendlyName: verifyData.friendly_name || 'Active Account',
          accountSid: candidateSid,
          phoneNumber: phoneValidation.e164,
          message: `Twilio credentials verified & saved for "${verifyData.friendly_name || candidateSid}". Gateway is now live for calls & SMS!`,
        });
      } catch (networkErr: any) {
        return Response.json({
          success: false,
          error: networkErr.message || 'Network error verifying Twilio credentials.',
        }, { status: 500 });
      }
    }

    // Verify if live Twilio credentials are configured
    const isConfigured = Boolean(
      accountSid &&
      authToken &&
      accountSid.startsWith('AC') &&
      authToken.length >= 16
    );

    if (data.action === 'verify_credentials') {
      if (!isConfigured) {
        return Response.json({
          success: false,
          configured: false,
          error:
            'Twilio credentials not configured. Please supply a valid Account SID starting with AC and Auth Token.',
        });
      }

      try {
        const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const resp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
          {
            headers: { Authorization: authHeader },
          }
        );
        const result = (await resp.json()) as any;

        if (resp.ok) {
          return Response.json({
            success: true,
            configured: true,
            friendlyName: result.friendly_name,
            status: result.status,
            accountSid,
            fromNumber: twilioFromNumber,
            message: 'Connected',
          });
        } else {
          return Response.json({
            success: false,
            configured: false,
            error: result.message || 'Twilio authentication failed',
            code: result.code,
          });
        }
      } catch (err: any) {
        return Response.json({
          success: false,
          configured: false,
          error: err.message || 'Network error communicating with Twilio',
        });
      }
    }

    if (!isConfigured) {
      const targetPhone = data.to ? toE164(data.to) : 'target phone';
      return Response.json({
        success: false,
        code: 'TWILIO_NOT_CONFIGURED',
        simulated: true,
        message:
          `Twilio credentials not configured. Your cell phone (${targetPhone}) will not ring until you enter your Twilio Account SID, Auth Token, and Twilio Phone Number in Admin > Integrations > Telephony.`,
        instructions:
          '1. Go to Admin Console > Integrations > Telephony.\n2. Enter your Twilio Account SID (starts with AC...) and Auth Token.\n3. Enter your Twilio Phone Number.\n4. Click "Save Telephony Credentials" and "Verify Twilio Credentials".',
      });
    }

    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    // Helper to validate E.164 phone numbers (+1XXXXXXXXXX or international)
    const isValidE164 = (num: string) => /^\+[1-9]\d{9,14}$/.test(num);

    // ─── 1. Outbound Voice Call via Twilio REST API ───
    if (data.action === 'make_call') {
      if (!data.to) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_TO_NUMBER',
            error: 'Destination phone number "to" is required.',
            message: 'Number must be verified in Twilio Trial Console',
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Sanitize and strictly validate input numbers to E.164 / NANP before initiating Twilio call
      const validationTo = validatePhoneNumber(data.to);
      const validationFrom = validatePhoneNumber(data.from || twilioFromNumber);

      if (!validationTo.isValid) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_TO_NUMBER',
            error: validationTo.error || `Invalid destination number "${data.to}".`,
            message: validationTo.error || 'Number must be verified in Twilio Trial Console',
            to: data.to,
            formattedTo: validationTo.e164,
            help: 'https://www.twilio.com/console/phone-numbers/verified',
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (!validationFrom.isValid) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_FROM_NUMBER',
            error: validationFrom.error || `Invalid caller ID number "${data.from || twilioFromNumber}".`,
            message: validationFrom.error || 'Number must be verified in Twilio Trial Console',
            from: data.from || twilioFromNumber,
            formattedFrom: validationFrom.e164,
            help: 'https://www.twilio.com/console/phone-numbers/verified',
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const formattedTo = validationTo.e164;
      const formattedFrom = validationFrom.e164;

      const twiml =
        data.customTwiml ||
        `<Response><Say voice="alice">Hello! This is Chesterfield Taxi dispatch connecting your call. Please hold while we connect you to dispatch.</Say><Pause length="1"/><Say voice="alice">Test call completed. Have a wonderful day!</Say></Response>`;

      const params = new URLSearchParams();
      params.append('To', formattedTo);
      params.append('From', formattedFrom);
      params.append('Twiml', twiml);
      params.append('Record', 'true');

      const callResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );

      const callResult = (await callResp.json()) as any;

      if (callResp.ok) {
        return Response.json({
          success: true,
          callSid: callResult.sid,
          status: callResult.status,
          to: callResult.to,
          from: callResult.from,
          message: `Outbound call placed to ${formattedTo}. Your cell phone should ring shortly!`,
        }, { headers: { 'Content-Type': 'application/json' } });
      } else {
        const isParamOrTrialIssue =
          callResult.code === 21608 || // Unverified 'To' number on trial account
          callResult.code === 21211 || // Invalid 'To' Phone Number
          callResult.code === 21212 || // Invalid 'From' Phone Number
          callResult.code === 21606 || // 'From' number is not a valid incoming number
          callResult.code === 21219 || // 'To' phone number not verified
          callResult.code === 21408 || // Geo permissions
          callResult.code === 21614 || // Not a valid mobile number
          (callResult.message &&
            (callResult.message.toLowerCase().includes('unverified') ||
             callResult.message.toLowerCase().includes('trial') ||
             callResult.message.toLowerCase().includes('verify') ||
             callResult.message.toLowerCase().includes('caller id') ||
             callResult.message.toLowerCase().includes('permission')));

        const errorMsg = isParamOrTrialIssue
          ? 'Number must be verified in Twilio Trial Console'
          : (callResult.message || 'Twilio call placement failed');

        return Response.json(
          {
            success: false,
            code: isParamOrTrialIssue ? 'TWILIO_NUMBER_UNVERIFIED' : 'TWILIO_CALL_FAILED',
            error: errorMsg,
            message: 'Number must be verified in Twilio Trial Console',
            details: callResult.message,
            twilioCode: callResult.code,
            moreInfo: callResult.more_info || 'https://www.twilio.com/console/phone-numbers/verified',
            to: formattedTo,
            from: formattedFrom,
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // ─── 2. Send SMS Notification via Twilio REST API ───
    if (data.action === 'send_sms') {
      if (!data.to || !data.body) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_PARAMETERS',
            error: '"to" and "body" are required for SMS dispatch.',
            message: 'Number must be verified in Twilio Trial Console',
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Sanitize and strictly validate input numbers to E.164 / NANP before initiating Twilio SMS
      const validationTo = validatePhoneNumber(data.to);
      const validationFrom = validatePhoneNumber(data.from || twilioFromNumber);

      if (!validationTo.isValid) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_TO_NUMBER',
            error: validationTo.error || `Invalid destination number "${data.to}".`,
            message: validationTo.error || 'Number must be verified in Twilio Trial Console',
            to: data.to,
            formattedTo: validationTo.e164,
            help: 'https://www.twilio.com/console/phone-numbers/verified',
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (!validationFrom.isValid) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_FROM_NUMBER',
            error: validationFrom.error || `Invalid sender phone number "${data.from || twilioFromNumber}".`,
            message: validationFrom.error || 'Number must be verified in Twilio Trial Console',
            from: data.from || twilioFromNumber,
            formattedFrom: validationFrom.e164,
            help: 'https://www.twilio.com/console/phone-numbers/verified',
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const formattedTo = validationTo.e164;
      const formattedFrom = validationFrom.e164;

      const params = new URLSearchParams();
      params.append('To', formattedTo);
      params.append('From', formattedFrom);
      params.append('Body', data.body);

      const smsResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );

      const smsResult = (await smsResp.json()) as any;

      if (smsResp.ok) {
        return Response.json({
          success: true,
          messageSid: smsResult.sid,
          status: smsResult.status,
          to: smsResult.to,
          from: smsResult.from,
          message: `SMS message sent successfully to ${formattedTo}!`,
        }, { headers: { 'Content-Type': 'application/json' } });
      } else {
        const isParamOrTrialIssue =
          smsResult.code === 21608 ||
          smsResult.code === 21211 ||
          smsResult.code === 21212 ||
          smsResult.code === 21606 ||
          smsResult.code === 21219 ||
          smsResult.code === 21408 ||
          smsResult.code === 21614 ||
          (smsResult.message &&
            (smsResult.message.toLowerCase().includes('unverified') ||
             smsResult.message.toLowerCase().includes('trial') ||
             smsResult.message.toLowerCase().includes('verify') ||
             smsResult.message.toLowerCase().includes('caller id') ||
             smsResult.message.toLowerCase().includes('permission')));

        const errorMsg = isParamOrTrialIssue
          ? 'Number must be verified in Twilio Trial Console'
          : (smsResult.message || 'Twilio SMS dispatch failed');

        return Response.json(
          {
            success: false,
            code: isParamOrTrialIssue ? 'TWILIO_NUMBER_UNVERIFIED' : 'TWILIO_SMS_FAILED',
            error: errorMsg,
            message: 'Number must be verified in Twilio Trial Console',
            details: smsResult.message,
            twilioCode: smsResult.code,
            moreInfo: smsResult.more_info || 'https://www.twilio.com/console/phone-numbers/verified',
            to: formattedTo,
            from: formattedFrom,
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // ─── LIST RECORDINGS VIA POST ───
    if (data.action === 'list_recordings') {
      if (!isConfigured) {
        return Response.json({ success: true, recordings: [] });
      }
      try {
        const recResp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Recordings.json?PageSize=30`,
          { headers: { Authorization: authHeader } }
        );
        const recData = (await recResp.json()) as any;
        if (recResp.ok && Array.isArray(recData.recordings)) {
          const recordings = recData.recordings.map((r: any) => {
            const durSec = parseInt(r.duration || '30', 10);
            return {
              sid: r.sid,
              callSid: r.call_sid,
              duration: `${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, '0')}`,
              durationSeconds: durSec,
              dateCreated: r.date_created,
              audioUrl: `/api/telephony?action=audio_proxy&recordingSid=${r.sid}`,
            };
          });
          return Response.json({ success: true, recordings });
        }
        return Response.json({ success: true, recordings: [] });
      } catch {
        return Response.json({ success: true, recordings: [] });
      }
    }

    // ─── LIST MESSAGES VIA POST ───
    if (data.action === 'list_messages') {
      if (!isConfigured) {
        return Response.json({ success: true, messages: telephonyStore.messages });
      }
      try {
        const msgResp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json?PageSize=50`,
          { headers: { Authorization: authHeader } }
        );
        const msgData = (await msgResp.json()) as any;
        if (msgResp.ok && Array.isArray(msgData.messages)) {
          const liveMessages = msgData.messages.map((m: any) => ({
            id: m.sid,
            sid: m.sid,
            from: m.from,
            to: m.to,
            body: m.body,
            direction: m.direction && m.direction.includes('inbound') ? 'inbound' : 'outbound',
            timestamp: new Date(m.date_sent || m.date_created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestampMs: new Date(m.date_sent || m.date_created).getTime(),
          }));
          return Response.json({ success: true, messages: liveMessages });
        }
        return Response.json({ success: true, messages: telephonyStore.messages });
      } catch {
        return Response.json({ success: true, messages: telephonyStore.messages });
      }
    }

    return Response.json(
      { success: false, error: `Unsupported telephony action: ${data.action}` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[api.telephony] Server error:', errorMessage);
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
