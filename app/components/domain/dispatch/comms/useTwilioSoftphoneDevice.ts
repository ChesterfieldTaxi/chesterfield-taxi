import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { authorizedFetch } from '../../../../core/services/auth/auth-headers';
import { resolveCommsCrmContext } from '../../../../core/services/comms/comms-templates.service';
import { getCommsThreadService } from '../../../../core/services/comms/comms-thread.service';
import { getContactService } from '../../../../core/services/customer/contact.service';
import {
  getWorkspaceBus,
  type UpcomingBookingPreview,
} from '../../../../core/services/workspace-bus.service';
import type { Trip } from '../../../../core/types/trip';
import {
  formatDisplayPhone,
  sanitizeToE164,
  validatePhoneNumber,
} from '../../../../core/utils/phone';
import {
  formatCallTimer,
  getClientTelephonyCredentials,
  type CallNotice,
  type CallStatus,
  type CallsSubTab,
  type CommsTab,
  type InteractionEvent,
  type SoftphoneStatus,
} from './comms-types';

let ringtoneAudioCtx: AudioContext | null = null;
let ringtoneIntervalTimer: ReturnType<typeof setInterval> | null = null;

function isDispatchSoundMuted(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return (
      localStorage.getItem('chesterfield_sound_muted') === 'true' ||
      localStorage.getItem('ct_dispatch_sound_muted') === 'true'
    );
  } catch {
    return false;
  }
}

export function playInboundRingtone(): void {
  try {
    if (typeof window === 'undefined' || isDispatchSoundMuted()) return;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!ringtoneAudioCtx || ringtoneAudioCtx.state === 'closed') {
      ringtoneAudioCtx = new AudioContextClass();
    }
    const ctx = ringtoneAudioCtx;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const ringCycle = () => {
      try {
        if (!ringtoneAudioCtx || ringtoneAudioCtx.state === 'closed') return;
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.setValueAtTime(0.18, now + 1.8);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);
      } catch {
        // Ignore audio synthesis errors in restricted autoplay contexts
      }
    };

    ringCycle();
    if (ringtoneIntervalTimer) clearInterval(ringtoneIntervalTimer);
    ringtoneIntervalTimer = setInterval(ringCycle, 3800);
  } catch {
    // Ignore audio context failures
  }
}

export function stopInboundRingtone(): void {
  try {
    if (ringtoneIntervalTimer) {
      clearInterval(ringtoneIntervalTimer);
      ringtoneIntervalTimer = null;
    }
    if (ringtoneAudioCtx) {
      ringtoneAudioCtx.close().catch(() => {});
      ringtoneAudioCtx = null;
    }
  } catch {
    // Ignore cleanup errors
  }
}

export function playInboundSmsChime(): void {
  try {
    if (typeof window === 'undefined' || isDispatchSoundMuted()) return;
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return;
    const audioCtx = new AudioCtxClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch {
    // Ignore chime playback errors
  }
}

export interface UseTwilioSoftphoneDeviceOptions {
  user?: any;
  isVisible: boolean;
  activeTab: CommsTab;
  setActiveTab: React.Dispatch<React.SetStateAction<CommsTab>>;
  trips: Trip[];
  drivers: any[];
  setInteractions: React.Dispatch<React.SetStateAction<InteractionEvent[]>>;
  fetchTelephonyData: () => Promise<void> | void;
  onPopulateBooking?: (bookingData: any) => void;
  onOpenEditTrip?: (tripId: string) => void;
}

export function useTwilioSoftphoneDevice({
  user,
  isVisible,
  activeTab,
  setActiveTab,
  trips,
  drivers,
  setInteractions,
  fetchTelephonyData,
  onPopulateBooking,
  onOpenEditTrip,
}: UseTwilioSoftphoneDeviceOptions) {
  const workspaceBus = getWorkspaceBus();

  // Softphone & dialpad UI state (SSR-deterministic initializers — zero localStorage reads during render)
  const [dialpadNumber, setDialpadNumber] = useState('');
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [activeCallContact, setActiveCallContact] = useState<string | null>(null);
  const [activeCallPhone, setActiveCallPhone] = useState<string | null>(null);
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [callNotice, setCallNotice] = useState<CallNotice | null>(null);
  const [showInCallKeypad, setShowInCallKeypad] = useState(false);
  const [showInCallTrips, setShowInCallTrips] = useState(false);
  const [showInCallNotes, setShowInCallNotes] = useState(false);
  const [inCallNoteText, setInCallNoteText] = useState('');
  const [bookingToast, setBookingToast] = useState<string | null>(null);
  const [callTimer, setCallTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [callsSubTab, setCallsSubTab] = useState<CallsSubTab>('history');
  const [activeKeypadFeedback, setActiveKeypadFeedback] = useState<string | null>(null);

  const [operatorPhoneInput, setOperatorPhoneInput] = useState('');
  const [isEditingOperatorPhone, setIsEditingOperatorPhone] = useState(false);
  const [showAgentSetupModal, setShowAgentSetupModal] = useState(false);
  const [pendingCallTarget, setPendingCallTarget] = useState<{
    phone: string;
    name?: string;
  } | null>(null);
  const [setupAgentPhoneInput, setSetupAgentPhoneInput] = useState('');
  const [setupAgentPhoneError, setSetupAgentPhoneError] = useState<string | null>(null);

  const [softphoneStatus, setSoftphoneStatus] = useState<SoftphoneStatus>('unconfigured');
  const [incomingCallInfo, setIncomingCallInfo] = useState<{
    from: string;
    callSid?: string;
  } | null>(null);

  const dialpadInputRef = useRef<HTMLInputElement>(null);
  const activeCallInteractionIdRef = useRef<string | null>(null);
  const deviceRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const incomingCallRef = useRef<any>(null);
  const callStatusRef = useRef<CallStatus>(callStatus);
  callStatusRef.current = callStatus;
  const activeCallSidRef = useRef<string | null>(activeCallSid);
  activeCallSidRef.current = activeCallSid;
  const isMutedRef = useRef<boolean>(isMuted);
  isMutedRef.current = isMuted;
  const isEndingCallRef = useRef<boolean>(false);
  const endedCallSidsRef = useRef<Set<string>>(new Set());
  const postCallFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleEndCallRef = useRef<(broadcast?: boolean) => void>(() => {});
  const isVisibleRef = useRef<boolean>(isVisible);
  isVisibleRef.current = isVisible;
  const isMountedRef = useRef(true);
  const initWebRtcPromiseRef = useRef<Promise<any> | null>(null);

  // Hydrate persisted operator forwarding phone strictly after client mount (SSR-safe)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const savedOperatorPhone = localStorage.getItem('ct_dispatch_operator_phone') || '';
        if (savedOperatorPhone) {
          setOperatorPhoneInput((prev) => prev || savedOperatorPhone);
          setSetupAgentPhoneInput((prev) => prev || savedOperatorPhone);
        }
      } catch {
        // Ignore storage read failures
      }
    }
  }, []);

  // Call duration counter
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (callStatus === 'connected') {
      interval = setInterval(() => setCallTimer((prev) => prev + 1), 1000);
    } else if (callStatus === 'idle') {
      setCallTimer(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStatus]);

  const requestVoiceToken = async (
    creds: ReturnType<typeof getClientTelephonyCredentials>
  ): Promise<{ token: string | null; unconfigured?: boolean }> => {
    const tokenResp = await authorizedFetch('/api/telephony', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'get_voice_token',
        credentials: creds,
        identity: 'dispatch_agent',
      }),
    });
    const tokenData = (await tokenResp.json().catch(() => ({}))) as {
      success?: boolean;
      configured?: boolean;
      token?: string;
    };
    if (!tokenResp.ok || !tokenData.success || !tokenData.token) {
      return { token: null, unconfigured: tokenData.configured === false };
    }
    return { token: tokenData.token };
  };

  // Lazy Twilio WebRTC Softphone Initializer + Automatic Token Refresh
  const ensureWebRtcDevice = async (): Promise<any | null> => {
    if (typeof window === 'undefined') return null;
    if (deviceRef.current) return deviceRef.current;
    if (initWebRtcPromiseRef.current) return initWebRtcPromiseRef.current;

    const creds = getClientTelephonyCredentials();

    const initPromise = (async () => {
      try {
        if (isMountedRef.current) setSoftphoneStatus('initializing');
        const { token, unconfigured } = await requestVoiceToken(creds);
        if (!token) {
          if (isMountedRef.current) {
            setSoftphoneStatus(unconfigured ? 'unconfigured' : 'error');
          }
          return null;
        }

        const { Device, Call } = await import('@twilio/voice-sdk');
        if (!isMountedRef.current) return null;

        const device = new Device(token, {
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
          logLevel: 1,
        });
        deviceRef.current = device;

        device.on('registered', () => {
          if (isMountedRef.current) setSoftphoneStatus('ready');
        });

        device.on('tokenWillExpire', async () => {
          try {
            const latestCreds = getClientTelephonyCredentials();
            const refreshed = await requestVoiceToken(latestCreds);
            if (refreshed.token && deviceRef.current === device) {
              device.updateToken(refreshed.token);
            }
          } catch (refreshErr) {
            console.warn('Twilio Voice token refresh failed:', refreshErr);
          }
        });

        device.on('error', (twErr: any) => {
          console.warn('Twilio Voice Device Error:', twErr);
          if (isMountedRef.current) setSoftphoneStatus('error');
        });

        device.on('incoming', (call: any) => {
          incomingCallRef.current = call;
          const callerNumber = call.parameters?.From || 'Incoming Passenger';
          const callSid = call.parameters?.CallSid;
          setIncomingCallInfo({ from: callerNumber, callSid });

          playInboundRingtone();
          workspaceBus.publish('INCOMING_CALL', { from: callerNumber, callSid });

          call.on('disconnect', () => {
            stopInboundRingtone();
            setIncomingCallInfo(null);
            incomingCallRef.current = null;
            workspaceBus.publish('INCOMING_CALL_DISMISSED', {});
            if (activeCallRef.current === call) {
              handleEndCallRef.current?.(true);
            }
          });

          call.on('error', (err: any) => {
            console.error('Incoming call error:', err);
            stopInboundRingtone();
            setIncomingCallInfo(null);
            incomingCallRef.current = null;
            workspaceBus.publish('INCOMING_CALL_DISMISSED', {});
          });
        });

        await device.register();
        if (isMountedRef.current) setSoftphoneStatus('ready');
        return device;
      } catch (err) {
        console.warn('Twilio WebRTC init error:', err);
        if (isMountedRef.current) setSoftphoneStatus('error');
        return null;
      } finally {
        initWebRtcPromiseRef.current = null;
      }
    })();

    initWebRtcPromiseRef.current = initPromise;
    return initPromise;
  };

  // Twilio WebRTC Device lifecycle (also retries once Firebase staff user hydrates)
  useEffect(() => {
    isMountedRef.current = true;
    if (user?.uid && !deviceRef.current) {
      void ensureWebRtcDevice();
    }
  }, [user?.uid]);

  useEffect(() => {
    isMountedRef.current = true;
    void ensureWebRtcDevice();

    return () => {
      isMountedRef.current = false;
      stopInboundRingtone();
      if (postCallFetchTimerRef.current) {
        clearTimeout(postCallFetchTimerRef.current);
        postCallFetchTimerRef.current = null;
      }
      if (deviceRef.current) {
        try {
          deviceRef.current.destroy();
        } catch {
          // Ignore teardown errors
        }
        deviceRef.current = null;
      }
    };
  }, []);

  const handleAcceptIncomingCall = () => {
    stopInboundRingtone();
    workspaceBus.publish('INCOMING_CALL_DISMISSED', {});
    const call = incomingCallRef.current;
    if (!call) return;
    const callerFrom = incomingCallInfo?.from || call.parameters?.From || 'Passenger';
    const displayNum = formatDisplayPhone(callerFrom);
    const callId = `call_${Date.now()}`;
    activeCallInteractionIdRef.current = callId;
    activeCallRef.current = call;

    call.accept();
    callStatusRef.current = 'connected';
    incomingCallRef.current = null;
    setIncomingCallInfo(null);
    setCallStatus('connected');
    setActiveCallContact(displayNum);
    setActiveCallPhone(callerFrom);
    activeCallSidRef.current = call.parameters?.CallSid || null;
    setActiveCallSid(call.parameters?.CallSid || null);
    if (isVisibleRef.current) {
      setActiveTab('phone');
      setCallsSubTab('keypad');
    }
    workspaceBus.publish('CALL_ANSWERED', {
      callerNumber: callerFrom,
      callSid: call.parameters?.CallSid,
    });

    setInteractions((prev) => [
      {
        id: callId,
        type: 'call_inbound',
        contactName: displayNum,
        contactPhone: callerFrom,
        contactType: 'passenger',
        timestamp: 'Just now',
        timestampMs: Date.now(),
        durationSeconds: 0,
        audioDuration: '0:00',
        callSid: call.parameters?.CallSid || undefined,
        snippet: `Inbound Call Answered (${displayNum})`,
        isUnread: false,
      },
      ...prev,
    ]);
  };

  const handleRejectIncomingCall = () => {
    stopInboundRingtone();
    workspaceBus.publish('INCOMING_CALL_DISMISSED', {});
    const call = incomingCallRef.current;
    if (call) {
      try {
        call.reject();
      } catch {
        // Ignore reject errors
      }
      incomingCallRef.current = null;
    }
    setIncomingCallInfo(null);
  };

  const incomingHandlersRef = useRef({
    accept: handleAcceptIncomingCall,
    reject: handleRejectIncomingCall,
  });
  incomingHandlersRef.current = {
    accept: handleAcceptIncomingCall,
    reject: handleRejectIncomingCall,
  };

  // Cross-dock answer/reject & incoming caller preview bus subscriptions
  useEffect(() => {
    const unsub = workspaceBus.subscribe((msg) => {
      if (msg.type === 'ANSWER_INCOMING_CALL') {
        incomingHandlersRef.current.accept();
      } else if (msg.type === 'REJECT_INCOMING_CALL') {
        incomingHandlersRef.current.reject();
      } else if (msg.type === 'CALL_INCOMING') {
        const payload = msg.payload;
        setActiveCallContact(payload.callerName || payload.callerNumber);
        setDialpadNumber(payload.callerNumber);
      }
    });
    return () => unsub();
  }, [workspaceBus]);

  const handleStartCall = async (numberToCall?: string, contactName?: string) => {
    const num = numberToCall || dialpadNumber;
    if (!num.trim()) return;

    const phoneValidation = validatePhoneNumber(num);
    const targetE164 = phoneValidation.isValid ? phoneValidation.e164 : sanitizeToE164(num);
    const displayNum = phoneValidation.isValid ? formatDisplayPhone(phoneValidation.e164) : num;
    const callerDisplayName = contactName || displayNum;
    const creds = getClientTelephonyCredentials();
    let activeDevice = deviceRef.current && softphoneStatus === 'ready' ? deviceRef.current : null;
    if (!activeDevice && softphoneStatus !== 'error') {
      activeDevice = await ensureWebRtcDevice();
    }

    // 1. In-Browser WebRTC Softphone (direct computer mic & headset)
    if (activeDevice) {
      const callId = `call_${Date.now()}`;
      activeCallInteractionIdRef.current = callId;

      callStatusRef.current = 'calling';
      setCallStatus('calling');
      setActiveCallContact(callerDisplayName);
      setActiveCallPhone(targetE164);
      setCallNotice({
        type: 'info',
        message: `Connecting live audio via computer microphone & headset to ${displayNum}...`,
      });
      setShowInCallKeypad(false);
      setShowInCallTrips(false);
      setShowInCallNotes(false);

      if (isVisibleRef.current) {
        setActiveTab('phone');
        setCallsSubTab('keypad');
      }

      const newCallRecord: InteractionEvent = {
        id: callId,
        type: 'call_outbound',
        contactName: callerDisplayName,
        contactPhone: targetE164,
        contactType: 'passenger',
        timestamp: 'Just now',
        timestampMs: Date.now(),
        durationSeconds: 0,
        audioDuration: '0:00',
        snippet: `Outbound Call (${displayNum})`,
        isUnread: false,
      };
      setInteractions((prev) => [newCallRecord, ...prev]);

      workspaceBus.publish('CALL_OUTBOUND_STARTED', {
        targetNumber: targetE164,
        contactName: callerDisplayName,
      });

      try {
        const call = await activeDevice.connect({
          params: {
            To: targetE164,
            FromNumber: creds.phoneNumber,
            CallerId: creds.phoneNumber,
          },
        });
        activeCallRef.current = call;

        call.on('accept', () => {
          setCallStatus('connected');
          const twCallSid = call.parameters?.CallSid || null;
          setActiveCallSid(twCallSid);
          setCallNotice({
            type: 'info',
            message: 'Connected via Browser Softphone. Audio live through headset.',
          });
          setInteractions((prev) =>
            prev.map((i) =>
              i.id === callId
                ? {
                    ...i,
                    callSid: twCallSid || undefined,
                    snippet: `Outbound Call Connected (${displayNum})`,
                  }
                : i
            )
          );
          if (twCallSid) {
            workspaceBus.publish('CALL_ANSWERED', {
              callSid: twCallSid,
              callerNumber: targetE164,
            });
          }
        });

        call.on('disconnect', () => {
          handleEndCallRef.current?.(true);
        });

        call.on('error', (callErr: any) => {
          console.error('Softphone call connection error:', callErr);
          handleEndCallRef.current?.(false);
          setCallNotice({
            type: 'warning',
            message: callErr?.message || 'Softphone audio error. Check microphone permissions.',
          });
        });
      } catch (err: any) {
        console.error('Failed to connect WebRTC call:', err);
        handleEndCallRef.current?.(false);
        setCallNotice({
          type: 'warning',
          message: err?.message || 'Failed to start WebRTC softphone call.',
        });
      }
      return;
    }

    // 2. Fallback: PSTN Bridge (when WebRTC keys are not configured)
    const effectiveOperatorPhone = (operatorPhoneInput || creds.operatorPhone || '').trim();

    if (!effectiveOperatorPhone) {
      setPendingCallTarget({ phone: targetE164, name: callerDisplayName });
      setSetupAgentPhoneInput('');
      setSetupAgentPhoneError(null);
      setShowAgentSetupModal(true);
      return;
    }

    const callId = `call_${Date.now()}`;
    activeCallInteractionIdRef.current = callId;

    callStatusRef.current = 'calling';
    setCallStatus('calling');
    setActiveCallContact(callerDisplayName);
    setActiveCallPhone(targetE164);
    setCallNotice({
      type: 'info',
      message: `Connecting... Ringing your phone (${formatDisplayPhone(effectiveOperatorPhone)}) to bridge.`,
    });
    setShowInCallKeypad(false);
    setShowInCallTrips(false);
    setShowInCallNotes(false);

    setActiveTab('phone');
    setCallsSubTab('keypad');

    const newCallRecord: InteractionEvent = {
      id: callId,
      type: 'call_outbound',
      contactName: callerDisplayName,
      contactPhone: targetE164,
      contactType: 'passenger',
      timestamp: 'Just now',
      timestampMs: Date.now(),
      durationSeconds: 0,
      audioDuration: '0:00',
      snippet: `Outbound Call (${displayNum})`,
      isUnread: false,
    };
    setInteractions((prev) => [newCallRecord, ...prev]);

    workspaceBus.publish('CALL_OUTBOUND_STARTED', {
      targetNumber: targetE164,
      contactName: callerDisplayName,
    });

    try {
      if (targetE164 === creds.phoneNumber) {
        setCallNotice({
          type: 'warning',
          message: `Destination matches dispatch caller ID (${creds.phoneNumber}). Dialing customer line.`,
        });
      }

      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'make_call',
          to: targetE164,
          from: creds.phoneNumber,
          operatorPhone: effectiveOperatorPhone,
          credentials: creds.accountSid ? creds : undefined,
        }),
      });

      const resData = (await resp.json()) as any;
      if (resData.success) {
        setActiveCallSid(resData.callSid || null);
        setCallStatus('connected');
        setCallNotice({
          type: 'info',
          message: `Twilio bridge active. Ringing your phone (${formatDisplayPhone(effectiveOperatorPhone)})...`,
        });
        setInteractions((prev) =>
          prev.map((i) =>
            i.id === callId
              ? {
                  ...i,
                  callSid: resData.callSid || undefined,
                  snippet: `Outbound Call Connected (${displayNum})`,
                }
              : i
          )
        );
        workspaceBus.publish('CALL_ANSWERED', {
          callSid: resData.callSid,
          callerNumber: targetE164,
        });
      } else {
        handleEndCallRef.current?.(false);
        const warningMsg =
          resData.code === 'NO_OPERATOR_PHONE'
            ? 'Please enter your agent phone number to bridge live calls.'
            : resData.code === 'TWILIO_NUMBER_UNVERIFIED'
            ? 'Twilio Trial Error: Recipient phone number must be verified in Twilio Console.'
            : resData.error || resData.message || 'Call failed to initiate on Twilio.';
        setCallNotice({
          type: 'warning',
          message: warningMsg,
        });
        if (resData.code === 'NO_OPERATOR_PHONE') {
          setPendingCallTarget({ phone: targetE164, name: callerDisplayName });
          setSetupAgentPhoneInput('');
          setSetupAgentPhoneError(null);
          setShowAgentSetupModal(true);
        }
      }
    } catch {
      handleEndCallRef.current?.(false);
      setCallNotice({
        type: 'warning',
        message: 'Network offline. Unable to reach Twilio service.',
      });
    }
  };

  const handleEndCall = (broadcast: boolean | React.MouseEvent | unknown = true) => {
    const currentSid =
      activeCallSidRef.current ||
      activeCallRef.current?.parameters?.CallSid ||
      incomingCallRef.current?.parameters?.CallSid ||
      null;

    if (isEndingCallRef.current) return;
    if (callStatus === 'idle' && !activeCallRef.current && !incomingCallRef.current) return;
    if (callStatusRef.current === 'idle' && !activeCallRef.current && !incomingCallRef.current) return;
    if (currentSid && endedCallSidsRef.current.has(currentSid)) return;

    isEndingCallRef.current = true;
    if (currentSid) {
      endedCallSidsRef.current.add(currentSid);
    }

    try {
      stopInboundRingtone();
      const activeCall = activeCallRef.current;
      activeCallRef.current = null;
      incomingCallRef.current = null;
      callStatusRef.current = 'idle';
      activeCallSidRef.current = null;
      isMutedRef.current = false;

      if (activeCall) {
        try {
          activeCall.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }

      const finalSecs = callTimer > 0 ? callTimer : 1;
      const m = Math.floor(finalSecs / 60);
      const s = (finalSecs % 60).toString().padStart(2, '0');
      const durationLabel = `${m}:${s}`;

      if (currentSid) {
        try {
          const creds = getClientTelephonyCredentials();
          authorizedFetch('/api/telephony', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'end_call',
              callSid: currentSid,
              credentials: creds.accountSid ? creds : undefined,
            }),
          }).catch(() => {});
        } catch {
          // Ignore hangup network errors
        }
      }

      if (activeCallInteractionIdRef.current) {
        const activeId = activeCallInteractionIdRef.current;
        setInteractions((prev) =>
          prev.map((i) => {
            if (i.id !== activeId) return i;
            const callLabel = i.type === 'call_inbound' ? 'Inbound Call' : 'Outbound Call';
            return {
              ...i,
              durationSeconds: finalSecs,
              audioDuration: durationLabel,
              snippet: `${callLabel} (${durationLabel})`,
            };
          })
        );
      }

      setIncomingCallInfo(null);
      setCallStatus('idle');
      setCallsSubTab('history');
      setActiveCallContact(null);
      setActiveCallPhone(null);
      setActiveCallSid(null);
      setCallTimer(0);
      setIsMuted(false);
      setCallNotice(null);
      setShowInCallKeypad(false);
      setShowInCallTrips(false);
      setShowInCallNotes(false);
      activeCallInteractionIdRef.current = null;

      workspaceBus.publish('CALL_MUTE_CHANGED', { isMuted: false });
      const shouldBroadcast = typeof broadcast === 'boolean' ? broadcast : true;
      if (shouldBroadcast) {
        workspaceBus.publish('CALL_ENDED', {
          callSid: currentSid || undefined,
          durationSeconds: finalSecs,
        });
      }

      if (postCallFetchTimerRef.current) {
        clearTimeout(postCallFetchTimerRef.current);
      }
      postCallFetchTimerRef.current = setTimeout(() => {
        postCallFetchTimerRef.current = null;
        void fetchTelephonyData();
      }, 4000);
    } finally {
      isEndingCallRef.current = false;
    }
  };
  handleEndCallRef.current = handleEndCall;

  // Synchronize remote call completion from Twilio PSTN
  useEffect(() => {
    if (
      !activeCallSid ||
      (callStatus !== 'calling' && callStatus !== 'connected' && callStatus !== 'on_hold')
    ) {
      return;
    }

    let isSubscribed = true;
    const interval = setInterval(async () => {
      try {
        const creds = getClientTelephonyCredentials();
        const resp = await authorizedFetch('/api/telephony', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_call_status',
            callSid: activeCallSid,
            credentials: creds.accountSid ? creds : undefined,
          }),
        });
        if (resp.ok && isSubscribed) {
          const statusData = await resp.json();
          if (statusData.success && statusData.status) {
            const terminalStatuses = ['completed', 'busy', 'no-answer', 'failed', 'canceled'];
            if (terminalStatuses.includes(statusData.status.toLowerCase())) {
              clearInterval(interval);
              handleEndCallRef.current(true);
            }
          }
        }
      } catch {
        // Tolerated polling network error
      }
    }, 2000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [activeCallSid, callStatus]);

    // Sync call start, keypad maximize, call ending, mute toggle & DTMF keypad digits across WorkspaceBus
    useEffect(() => {
      const unsub = workspaceBus.subscribe((msg) => {
        if (msg.type === 'START_SOFTPHONE_CALL') {
          const to = msg.payload?.to?.trim();
          if (to) {
            void startCallLatestRef.current(to, msg.payload?.contactName);
          }
        } else if (msg.type === 'OPEN_SOFTPHONE_KEYPAD') {
          setActiveTab('phone');
          setCallsSubTab('keypad');
        } else if (msg.type === 'CALL_ENDED') {
        if (callStatusRef.current !== 'idle' || activeCallRef.current || incomingCallRef.current) {
          handleEndCallRef.current(false);
        }
      } else if (msg.type === 'TOGGLE_CALL_MUTE') {
        const nextMute =
          typeof msg.payload?.muted === 'boolean' ? msg.payload.muted : !isMutedRef.current;
        isMutedRef.current = nextMute;
        setIsMuted(nextMute);
        if (activeCallRef.current) {
          try {
            activeCallRef.current.mute(nextMute);
          } catch {}
        }
        workspaceBus.publish('CALL_MUTE_CHANGED', { isMuted: nextMute });
      } else if (msg.type === 'SEND_CALL_DTMF') {
        const digit = msg.payload?.digit;
        if (digit) {
          setActiveKeypadFeedback(digit);
          if (activeCallRef.current) {
            try {
              activeCallRef.current.sendDigits(digit);
            } catch {}
          }
          setTimeout(() => setActiveKeypadFeedback(null), 150);
        }
      }
    });
    return unsub;
  }, [workspaceBus]);

  // Focus dialpad input when Phone drawer is visible and on keypad sub-tab
  useEffect(() => {
    if (isVisible && activeTab === 'phone' && callsSubTab === 'keypad') {
      const timer = setTimeout(() => {
        dialpadInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, activeTab, callsSubTab]);

  // Physical keyboard dialing response (active only when CommsHub phone view is visible)
  const startCallLatestRef = useRef(handleStartCall);
  startCallLatestRef.current = handleStartCall;

  useEffect(() => {
    if (!isVisible || activeTab !== 'phone') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName === 'INPUT' && target !== dialpadInputRef.current) {
        return;
      }
      if (
        target &&
        (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const validDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#', '+'];
      if (validDigits.includes(e.key)) {
        e.preventDefault();
        setDialpadNumber((prev) => prev + e.key);
        setActiveKeypadFeedback(e.key);
        setTimeout(() => setActiveKeypadFeedback(null), 150);
      } else if (e.key === 'Backspace') {
        if (target !== dialpadInputRef.current) {
          e.preventDefault();
          setDialpadNumber((prev) => prev.slice(0, -1));
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (dialpadNumber.trim()) {
          void startCallLatestRef.current();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, activeTab, dialpadNumber]);

  const callerCrmContext = useMemo(() => {
    const targetPhone =
      incomingCallInfo?.from ||
      (callStatus !== 'idle' ? activeCallPhone || dialpadNumber : dialpadNumber);
    if (!targetPhone || !targetPhone.trim()) return null;
    return resolveCommsCrmContext({
      phone: targetPhone,
      contactNameHint: activeCallContact,
      trips,
      drivers,
    });
  }, [
    incomingCallInfo?.from,
    callStatus,
    activeCallPhone,
    dialpadNumber,
    activeCallContact,
    trips,
    drivers,
  ]);

  const matchingCallerTrips = useMemo<UpcomingBookingPreview[]>(() => {
    const activeCallerPhoneClean = (activeCallPhone || dialpadNumber || '')
      .replace(/\D/g, '')
      .slice(-10);
    if (!activeCallerPhoneClean) return [];
    const matched: UpcomingBookingPreview[] = [];
    trips.forEach((t) => {
      const passengerPhone = (t.passenger?.phone || (t as any).passengerPhone || '')
        .replace(/\D/g, '')
        .slice(-10);
      if (passengerPhone && passengerPhone === activeCallerPhoneClean) {
        matched.push({
          id: t.id,
          time: t.scheduledPickupTime
            ? new Date(t.scheduledPickupTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'ASAP',
          pickupAddress: t.pickupLocation?.address || 'Pickup Point',
          dropoffAddress: t.dropoffLocation?.address || 'Destination',
          fare: t.pricing?.totalFare ?? 0,
        });
      }
    });
    return matched;
  }, [activeCallPhone, dialpadNumber, trips]);

  const handleDialDigit = (digit: string) => {
    setDialpadNumber((prev) => prev + digit);
  };

  const handleDeleteDialDigit = () => {
    setDialpadNumber((prev) => prev.slice(0, -1));
  };

  const handleClearDialpad = () => {
    setDialpadNumber('');
  };

  const handleOpenInKeypad = (phone: string) => {
    setDialpadNumber(phone);
    setCallsSubTab('keypad');
  };

  const handleSendInCallDtmf = (digit: string) => {
    setActiveKeypadFeedback(digit);
    if (activeCallRef.current) {
      try {
        activeCallRef.current.sendDigits(digit);
      } catch {
        // Ignore DTMF errors
      }
    }
    setTimeout(() => setActiveKeypadFeedback(null), 150);
  };

  const handleToggleMute = () => {
    const nextMute = !isMutedRef.current;
    isMutedRef.current = nextMute;
    setIsMuted(nextMute);
    if (activeCallRef.current) {
      try {
        activeCallRef.current.mute(nextMute);
      } catch {
        // Ignore mute errors
      }
    }
    workspaceBus.publish('CALL_MUTE_CHANGED', { isMuted: nextMute });
  };

  const handleToggleHold = () => {
    setCallStatus((s) => (s === 'on_hold' ? 'connected' : 'on_hold'));
  };

  const handleSaveOperatorPhone = () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('ct_dispatch_operator_phone', operatorPhoneInput.trim());
      } catch {
        // Ignore storage write errors
      }
    }
    setIsEditingOperatorPhone(false);
  };

  const handleSaveAgentAndCall = () => {
    const trimmed = setupAgentPhoneInput.trim();
    if (!trimmed) {
      setSetupAgentPhoneError('Please enter your mobile or desk phone number.');
      return;
    }
    const validated = validatePhoneNumber(trimmed);
    if (!validated.isValid) {
      setSetupAgentPhoneError(
        validated.error || 'Please enter a valid 10-digit phone number (e.g. 314-555-0100).'
      );
      return;
    }
    const cleanE164 = validated.e164;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('ct_dispatch_operator_phone', cleanE164);
      } catch {
        // Ignore storage write errors
      }
    }
    setOperatorPhoneInput(cleanE164);
    setSetupAgentPhoneError(null);
    setShowAgentSetupModal(false);

    if (pendingCallTarget) {
      const target = pendingCallTarget;
      setPendingCallTarget(null);
      setTimeout(() => {
        void startCallLatestRef.current(target.phone, target.name);
      }, 50);
    }
  };

  const handleCloseAgentSetupModal = () => {
    setShowAgentSetupModal(false);
    setPendingCallTarget(null);
    setSetupAgentPhoneError(null);
  };

  const showTimedBookingToast = (message: string, durationMs = 2500) => {
    setBookingToast(message);
    setTimeout(() => setBookingToast(null), durationMs);
  };

  const handleInCallBookRide = () => {
    const rawPhone = activeCallPhone || dialpadNumber;
    const contact = rawPhone ? getContactService().getContactByPhone(rawPhone) : null;

    const payload = {
      passengerName:
        contact?.name ||
        (activeCallContact && activeCallContact !== 'Caller' ? activeCallContact : '') ||
        '',
      passengerPhone: contact?.phone || rawPhone || '',
      passengerEmail: contact?.email || '',
      pickupAddress: contact?.homeAddress || contact?.workAddress || '',
      dropoffAddress: contact?.workAddress && contact?.homeAddress ? contact.workAddress : '',
      vehicleTier: contact?.preferredVehicleTier || '',
      corporateAccount: contact?.corporateAccountName || '',
      corporateAccountNumber:
        contact?.corporateAccountNumber || (contact as any)?.accountNumber || '',
      billingPo: contact?.defaultPoNumber || (contact as any)?.billingPo || '',
      accessibilityNeeds: contact?.accessibilityNeeds || {},
      notes: `Direct phone reservation from call (${formatCallTimer(callTimer)})${
        contact?.notes ? ` | Contact notes: ${contact.notes}` : ''
      }`,
    };
    workspaceBus.publish('POPULATE_BOOKING', payload);
    onPopulateBooking?.(payload);
    showTimedBookingToast('Draft ready', 2500);
  };

  const handleLoadCallerTrip = (tr: UpcomingBookingPreview) => {
    const rawPhone = activeCallPhone || dialpadNumber;
    const contact = rawPhone ? getContactService().getContactByPhone(rawPhone) : null;
    const payload = {
      passengerName:
        contact?.name ||
        (activeCallContact && activeCallContact !== 'Caller' ? activeCallContact : '') ||
        '',
      passengerPhone: contact?.phone || rawPhone || '',
      passengerEmail: contact?.email || '',
      pickupAddress: tr.pickupAddress || contact?.homeAddress || '',
      dropoffAddress: tr.dropoffAddress || contact?.workAddress || '',
      vehicleTier: contact?.preferredVehicleTier || '',
      corporateAccount: contact?.corporateAccountName || '',
      corporateAccountNumber:
        contact?.corporateAccountNumber || (contact as any)?.accountNumber || '',
      billingPo: contact?.defaultPoNumber || (contact as any)?.billingPo || '',
      accessibilityNeeds: contact?.accessibilityNeeds || {},
      notes: `Re-booking route: ${tr.pickupAddress} -> ${tr.dropoffAddress}`,
    };
    workspaceBus.publish('POPULATE_BOOKING', payload);
    onPopulateBooking?.(payload);
    showTimedBookingToast('Trip loaded', 2000);
  };

  const handleEditCallerTrip = (tripId: string) => {
    workspaceBus.publish('OPEN_EDIT_TRIP', {
      tripId,
      phone: activeCallPhone || dialpadNumber,
    });
    onOpenEditTrip?.(tripId);
  };

  const handleInCallSendLink = async () => {
    const targetPhone = activeCallPhone || dialpadNumber;
    if (!targetPhone) return;

    try {
      const creds = getClientTelephonyCredentials();
      const twilioPhone = creds.phoneNumber || '+13142281454';

      const res = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: sanitizeToE164(targetPhone),
          body: 'Book your Chesterfield Taxi ride online anytime: https://chesterfieldtaxi.com/book',
          credentials: {
            accountSid: creds.accountSid,
            authToken: creds.authToken,
            phoneNumber: sanitizeToE164(twilioPhone),
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        showTimedBookingToast(data?.error || 'Failed to send booking link', 3500);
        return;
      }
      showTimedBookingToast('Booking link sent!', 2500);
    } catch {
      showTimedBookingToast('Failed to send SMS link', 3500);
    }
  };

  const handleAppendCallNote = (chipText?: string) => {
    const noteToAdd = chipText || inCallNoteText.trim();
    if (!noteToAdd) return;

    const targetPhone = activeCallPhone || dialpadNumber;
    const payload = {
      passengerPhone: targetPhone,
      notes: noteToAdd,
    };
    workspaceBus.publish('POPULATE_BOOKING', payload);
    onPopulateBooking?.(payload);
    if (targetPhone) {
      void getCommsThreadService().addInternalNote({
        phone: targetPhone,
        contactName: activeCallContact || undefined,
        bodyText: noteToAdd,
        actorName: user?.displayName || user?.email || 'Dispatcher',
      });
    }
    setInCallNoteText('');
    showTimedBookingToast(`Note: ${noteToAdd}`, 2000);
  };

  return {
    dialpadNumber,
    setDialpadNumber,
    callStatus,
    setCallStatus,
    activeCallContact,
    activeCallPhone,
    activeCallSid,
    callNotice,
    showInCallKeypad,
    setShowInCallKeypad,
    showInCallTrips,
    setShowInCallTrips,
    showInCallNotes,
    setShowInCallNotes,
    inCallNoteText,
    setInCallNoteText,
    bookingToast,
    showTimedBookingToast,
    callTimer,
    isMuted,
    callsSubTab,
    setCallsSubTab,
    activeKeypadFeedback,
    operatorPhoneInput,
    setOperatorPhoneInput,
    isEditingOperatorPhone,
    setIsEditingOperatorPhone,
    showAgentSetupModal,
    setShowAgentSetupModal,
    pendingCallTarget,
    setPendingCallTarget,
    setupAgentPhoneInput,
    setSetupAgentPhoneInput,
    setupAgentPhoneError,
    setSetupAgentPhoneError,
    dialpadInputRef,
    softphoneStatus,
    incomingCallInfo,
    callerCrmContext,
    matchingCallerTrips,
    handleAcceptIncomingCall,
    handleRejectIncomingCall,
    handleStartCall,
    handleEndCall,
    handleDialDigit,
    handleDeleteDialDigit,
    handleClearDialpad,
    handleOpenInKeypad,
    handleSendInCallDtmf,
    handleToggleMute,
    handleToggleHold,
    handleSaveOperatorPhone,
    handleSaveAgentAndCall,
    handleCloseAgentSetupModal,
    handleInCallBookRide,
    handleLoadCallerTrip,
    handleEditCallerTrip,
    handleInCallSendLink,
    handleAppendCallNote,
  };
}
