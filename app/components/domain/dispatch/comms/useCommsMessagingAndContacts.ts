import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { authorizedFetch } from '../../../../core/services/auth/auth-headers';
import { resolveCommsCrmContext } from '../../../../core/services/comms/comms-templates.service';
import { getCommsThreadService } from '../../../../core/services/comms/comms-thread.service';
import { getContactService, normalizeEmail, type ContactRecord } from '../../../../core/services/customer/contact.service';
import { buildTripTrackingUrl } from '../../../../core/services/email/dispatch-email.service';
import { normalizePhone } from '../../../../core/services/passenger.service';
import { getPayLinkService } from '../../../../core/services/payments/pay-link.service';
import { getWorkspaceBus, type WorkspaceEventMap } from '../../../../core/services/workspace-bus.service';
import type { Trip } from '../../../../core/types/trip';
import { formatDisplayPhone, sanitizeToE164, validatePhoneNumber } from '../../../../core/utils/phone';
import { getClientTelephonyCredentials, type CommsTab, type InteractionEvent, type ThreadTab, type ThreadTimelineType } from './comms-types';

export interface UseCommsMessagingAndContactsOptions {
  user?: any;
  activeTab: CommsTab;
  interactions: InteractionEvent[];
  setInteractions: React.Dispatch<React.SetStateAction<InteractionEvent[]>>;
  fetchTelephonyData: () => Promise<void> | void;
  trips: Trip[];
  drivers: any[];
  activeCallPhone: string | null;
  dialpadNumber: string;
  showTimedBookingToast: (message: string, durationMs?: number) => void;
  onPopulateBooking?: (bookingData: any) => void;
  onOpenEditTrip?: (tripId: string) => void;
  initialNewSmsSheetOpen?: boolean;
}

export function useCommsMessagingAndContacts({
  user, interactions, setInteractions, fetchTelephonyData, trips, drivers,
  activeCallPhone, dialpadNumber, showTimedBookingToast, onPopulateBooking, onOpenEditTrip,
  initialNewSmsSheetOpen = false,
}: UseCommsMessagingAndContactsOptions) {
  const workspaceBus = getWorkspaceBus();
  const [selectedContactPhone, setSelectedContactPhone] = useState<string | null>(null);
  const [threadTab, setThreadTab] = useState<ThreadTab>('all');
  const [timelineFilters, setTimelineFilters] = useState<ThreadTimelineType[]>([]);
  const pendingBusThreadTabRef = useRef<ThreadTab | null>(null);
  const [noteDraftText, setNoteDraftText] = useState('');
  const [smsReplyText, setSmsReplyText] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsStatusMessage, setSmsStatusMessage] = useState<string | null>(null);
  const [retryingSmsId, setRetryingSmsId] = useState<string | null>(null);
  const [isGeneratingPayLink, setIsGeneratingPayLink] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [activeContactRecord, setActiveContactRecord] = useState<ContactRecord | null>(null);
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(initialNewSmsSheetOpen);
  const [newMsgRecipientPhone, setNewMsgRecipientPhone] = useState('');
  const [newMsgRecipientName, setNewMsgRecipientName] = useState('');
  const [newMsgBody, setNewMsgBody] = useState('');
  const [newMsgError, setNewMsgError] = useState<string | null>(null);
  const [isSendingNewMsg, setIsSendingNewMsg] = useState(false);
  const [allContactsForMsg, setAllContactsForMsg] = useState<ContactRecord[]>([]);
  const [msgContactSearch, setMsgContactSearch] = useState('');
  const [isMsgContactDropdownOpen, setIsMsgContactDropdownOpen] = useState(false);

  useEffect(() => {
    if (!isNewMessageModalOpen) return;
    try { setAllContactsForMsg(getContactService().getAllContacts()); } catch {}
  }, [isNewMessageModalOpen]);

  const filteredContactsForMsg = useMemo(() => {
    const q = msgContactSearch.toLowerCase().trim();
    if (!q) return allContactsForMsg.slice(0, 8);
    return allContactsForMsg
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || Boolean(c.mobilePhone?.includes(q)) || (c.corporateAccountNumber || '').toLowerCase().includes(q))
      .slice(0, 10);
  }, [allContactsForMsg, msgContactSearch]);

  useEffect(() => workspaceBus.subscribe((msg) => {
    if (msg.type === 'OPEN_COMMS_THREAD') {
      const p = msg.payload;
      const resolved = getCommsThreadService().findThread({ threadId: p.threadId, phone: p.phone, email: p.email });
      const target = resolved?.primaryPhone || p.phone || resolved?.primaryEmail || p.email || resolved?.id || p.threadId || null;
      if (target) {
        if (p.tab) {
          pendingBusThreadTabRef.current = p.tab;
          setThreadTab(p.tab);
          setTimelineFilters(p.tab === 'all' ? [] : [p.tab]);
        }
        setSelectedContactPhone(target);
      }
    } else if (msg.type === 'CONTACT_UPDATED') {
      const c = msg.payload?.contact;
      if (c && selectedContactPhone && normalizePhone(c.phone) === normalizePhone(selectedContactPhone)) setActiveContactRecord(c);
    }
  }), [workspaceBus, selectedContactPhone]);

  useEffect(() => {
    if (pendingBusThreadTabRef.current) {
      const next = pendingBusThreadTabRef.current;
      setThreadTab(next);
      setTimelineFilters(next === 'all' ? [] : [next]);
      pendingBusThreadTabRef.current = null;
      return;
    }
    setThreadTab('all');
    setTimelineFilters([]);
  }, [selectedContactPhone]);

  const activeUnifiedThread = useMemo(() => {
    if (!selectedContactPhone) return null;
    const isEmailSel = selectedContactPhone.includes('@');
    const isThreadSel = selectedContactPhone.startsWith('thr_');
    return getCommsThreadService().findThread({
      threadId: isThreadSel ? selectedContactPhone : undefined,
      phone: !isEmailSel && !isThreadSel ? selectedContactPhone : undefined,
      email: isEmailSel ? selectedContactPhone : undefined,
    });
  }, [selectedContactPhone, interactions]);

  const allSelectedContactInteractions = useMemo(() => {
    if (!selectedContactPhone) return [];
    const normTarget = normalizePhone(selectedContactPhone);
    const normEmailTarget = normalizeEmail(selectedContactPhone);
    const svc = getContactService();
    const rec = (normTarget ? svc.getContactByPhone(selectedContactPhone) : null) || (normEmailTarget ? svc.getContactByEmail(selectedContactPhone) : null) || (activeUnifiedThread?.contactId ? svc.getContactById(activeUnifiedThread.contactId) : null);
    const recPhone = rec?.phone ? normalizePhone(rec.phone) : '';
    const recEmail = normalizeEmail(rec?.email);
    return interactions
      .filter((i) => {
        if (i.snippet?.includes('Thank you for contacting our dispatch desk')) return false;
        if ((activeUnifiedThread && i.threadId === activeUnifiedThread.id) || (selectedContactPhone.startsWith('thr_') && i.threadId === selectedContactPhone)) return true;
        const nPhone = normalizePhone(i.contactPhone);
        const nMob = i.mobilePhone ? normalizePhone(i.mobilePhone) : '';
        const nHome = i.homePhone ? normalizePhone(i.homePhone) : '';
        const nEmail = normalizeEmail(i.contactEmail);
        return Boolean((normTarget && (nPhone === normTarget || nMob === normTarget || nHome === normTarget)) || (recPhone && nPhone === recPhone) || (normEmailTarget && nEmail === normEmailTarget) || (recEmail && nEmail === recEmail));
      })
      .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
  }, [interactions, selectedContactPhone, activeUnifiedThread]);

  const activeContactSummary = useMemo(() => {
    if (!selectedContactPhone) return null;
    const lastEvt = allSelectedContactInteractions[allSelectedContactInteractions.length - 1];
    const isEmailSel = selectedContactPhone.includes('@');
    const isThreadSel = selectedContactPhone.startsWith('thr_');
    const svc = getContactService();
    const rec = (!isEmailSel && !isThreadSel ? svc.getContactByPhone(selectedContactPhone) : null) || (isEmailSel ? svc.getContactByEmail(selectedContactPhone) : null) || (activeUnifiedThread?.contactId ? svc.getContactById(activeUnifiedThread.contactId) : null);
    const resolvedName = (activeContactRecord && !String(activeContactRecord.id || '').startsWith('temp_') ? activeContactRecord.name : '') || rec?.name || (activeUnifiedThread?.contactName && !activeUnifiedThread.contactName.startsWith('+') ? activeUnifiedThread.contactName : '') || lastEvt?.contactName || (isEmailSel || isThreadSel ? selectedContactPhone : formatDisplayPhone(selectedContactPhone));
    const resolvedPhone = rec?.phone || activeUnifiedThread?.primaryPhone || lastEvt?.contactPhone || (!isEmailSel && !isThreadSel ? selectedContactPhone : '');
    const resolvedEmail = rec?.email || activeUnifiedThread?.primaryEmail || lastEvt?.contactEmail || (isEmailSel ? selectedContactPhone : undefined);
    return lastEvt
      ? { ...lastEvt, contactName: resolvedName, contactPhone: resolvedPhone, contactEmail: resolvedEmail || lastEvt.contactEmail }
      : ({ id: `contact_${selectedContactPhone}`, threadId: activeUnifiedThread?.id, type: isEmailSel ? 'email_inbound' : 'call_inbound', contactName: resolvedName, contactPhone: resolvedPhone, contactEmail: resolvedEmail, contactType: activeUnifiedThread?.contactType || 'passenger', timestamp: 'Recent', timestampMs: Date.now(), snippet: 'Direct contact thread' } as InteractionEvent);
  }, [allSelectedContactInteractions, selectedContactPhone, activeContactRecord, activeUnifiedThread]);

  useEffect(() => {
    if (!selectedContactPhone) return setActiveContactRecord(null);
    const isEmailSel = selectedContactPhone.includes('@');
    const isThreadSel = selectedContactPhone.startsWith('thr_');
    const svc = getContactService();
    const found = (!isEmailSel && !isThreadSel ? svc.getContactByPhone(selectedContactPhone) : null) || (isEmailSel ? svc.getContactByEmail(selectedContactPhone) : null) || (activeUnifiedThread?.contactId ? svc.getContactById(activeUnifiedThread.contactId) : null) || (activeUnifiedThread?.primaryPhone ? svc.getContactByPhone(activeUnifiedThread.primaryPhone) : null) || (activeUnifiedThread?.primaryEmail ? svc.getContactByEmail(activeUnifiedThread.primaryEmail) : null);
    setActiveContactRecord(found || {
      id: `temp_${Date.now()}`, name: activeContactSummary?.contactName || formatDisplayPhone(selectedContactPhone),
      phone: activeUnifiedThread?.primaryPhone || (!isEmailSel && !isThreadSel ? selectedContactPhone : ''),
      email: activeUnifiedThread?.primaryEmail || (isEmailSel ? selectedContactPhone : ''),
      isVip: false, preferredVehicleTier: 'standard', notes: '', customerScore: 90, tripCount: 1, totalSpend: 0, createdAt: new Date().toISOString(), updatedAt: Date.now(),
    });
  }, [selectedContactPhone, activeContactSummary?.contactName, activeUnifiedThread]);

  useEffect(() => {
    if (selectedContactPhone && messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [selectedContactPhone, allSelectedContactInteractions.length]);

  const threadCrmContext = useMemo(() => {
    if (!selectedContactPhone) return null;
    const isEmailSel = selectedContactPhone.includes('@');
    const isThreadSel = selectedContactPhone.startsWith('thr_');
    return resolveCommsCrmContext({
      phone: activeUnifiedThread?.primaryPhone || activeContactSummary?.contactPhone || (!isEmailSel && !isThreadSel ? selectedContactPhone : undefined),
      email: activeUnifiedThread?.primaryEmail || activeContactSummary?.contactEmail || activeContactRecord?.email || (isEmailSel ? selectedContactPhone : undefined),
      threadId: activeUnifiedThread?.id || (isThreadSel ? selectedContactPhone : undefined),
      contactNameHint: activeContactSummary?.contactName, contact: activeContactRecord, thread: activeUnifiedThread, trips, drivers,
    });
  }, [selectedContactPhone, activeUnifiedThread, activeContactSummary, activeContactRecord, trips, drivers]);

  const newMsgRecipientCrmContext = useMemo(
    () => (newMsgRecipientPhone.trim() ? resolveCommsCrmContext({ phone: newMsgRecipientPhone, contactNameHint: newMsgRecipientName, trips, drivers }) : null),
    [newMsgRecipientPhone, newMsgRecipientName, trips, drivers]
  );

  const resolveActiveIdentity = () => ({
    phone: activeContactRecord?.phone || activeContactSummary?.mobilePhone || activeContactSummary?.contactPhone || (selectedContactPhone && !selectedContactPhone.includes('@') && !selectedContactPhone.startsWith('thr_') ? selectedContactPhone : '') || undefined,
    email: activeContactRecord?.email || activeContactSummary?.contactEmail || (selectedContactPhone?.includes('@') ? selectedContactPhone : '') || undefined,
    name: activeContactRecord?.name || activeContactSummary?.contactName || undefined,
  });

  const handleOpenContactEdit = () => workspaceBus.publish('OPEN_CLIENT_PROFILE', { ...resolveActiveIdentity(), initialTab: 'edit', source: 'comms_hub' });
  const handleOpenClientProfile = () => workspaceBus.publish('OPEN_CLIENT_PROFILE', { ...resolveActiveIdentity(), initialTab: 'overview', source: 'comms_hub' });

  const dispatchSmsRequest = async (toE164: string, body: string) => {
    const creds = getClientTelephonyCredentials();
    const resp = await authorizedFetch('/api/telephony', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_sms', to: toE164, body, credentials: { accountSid: creds.accountSid, authToken: creds.authToken, phoneNumber: sanitizeToE164(creds.phoneNumber || '+13142281454') } }),
    });
    return { ok: resp.ok, data: (await resp.json().catch(() => ({}))) as any };
  };

  const handleSendNewMessage = async () => {
    const val = validatePhoneNumber(newMsgRecipientPhone.trim());
    if (!val.isValid) return setNewMsgError(val.error || 'Enter a valid 10-digit phone number.');
    if (!newMsgBody.trim()) return setNewMsgError('Enter a message text.');
    setIsSendingNewMsg(true); setNewMsgError(null);
    const contact = getContactService().getContactByPhone(val.e164);
    const msgText = newMsgBody.trim();
    const optimistic: InteractionEvent = { id: `sms_out_${Date.now()}`, type: 'sms_outbound', contactName: newMsgRecipientName.trim() || contact?.name || formatDisplayPhone(val.e164), contactPhone: val.e164, contactType: 'passenger', timestamp: 'Just now', timestampMs: Date.now(), snippet: msgText, bodyText: msgText, isUnread: false };
    setInteractions((prev) => [optimistic, ...prev]);
    try {
      const { data } = await dispatchSmsRequest(val.e164, msgText);
      if (data.messageSid || data.status) {
        setInteractions((prev) => prev.map((i) => (i.id === optimistic.id ? { ...i, id: data.messageSid || i.id, deliveryStatus: data.status || (data.success ? 'sent' : 'failed'), errorCode: data.code || data.errorCode, errorMessage: data.error || data.errorMessage } : i)));
      }
      setTimeout(() => void fetchTelephonyData(), 1000);
    } catch {}
    setIsSendingNewMsg(false); setIsNewMessageModalOpen(false); setSelectedContactPhone(val.e164);
  };

  const handleSendSms = async () => {
    if (!smsReplyText.trim() || !selectedContactPhone) return;
    const raw = activeContactSummary?.mobilePhone || threadCrmContext?.primaryPhone || activeContactRecord?.phone || activeUnifiedThread?.primaryPhone || (!selectedContactPhone.includes('@') && !selectedContactPhone.startsWith('thr_') ? selectedContactPhone : '');
    const val = validatePhoneNumber(raw);
    if (!val.isValid) { setSmsStatusMessage(val.error || 'Invalid recipient phone.'); setTimeout(() => setSmsStatusMessage(null), 3500); return; }
    setIsSendingSms(true);
    const messageText = smsReplyText.trim();
    const targetName = threadCrmContext?.contactName || activeContactRecord?.name || activeContactSummary?.contactName || formatDisplayPhone(val.e164);
    const optimisticId = `sms_out_${Date.now()}`;
    setInteractions((prev) => [{ id: optimisticId, threadId: activeUnifiedThread?.id, channel: 'sms', type: 'sms_outbound', contactName: targetName, contactPhone: val.e164, contactEmail: threadCrmContext?.primaryEmail || activeContactRecord?.email || undefined, contactType: 'passenger', timestamp: 'Just now', timestampMs: Date.now(), snippet: messageText, bodyText: messageText, isUnread: false }, ...prev]);
    setSmsReplyText('');
    try {
      const { data } = await dispatchSmsRequest(val.e164, messageText);
      if (data.success) {
        const sid = data.messageSid || optimisticId;
        const status = data.status || 'sent';
        setSmsStatusMessage(data.simulated ? 'Sent (Simulated)' : 'Sent to carrier');
        setInteractions((prev) => prev.map((i) => (i.id === optimisticId ? { ...i, id: sid, deliveryStatus: status } : i)));
        void getCommsThreadService().recordCommsEvent({ id: sid, externalSid: data.messageSid || undefined, threadId: activeUnifiedThread?.id, channel: 'sms', direction: 'outbound', eventType: 'sms_outbound', contactName: targetName, contactPhone: val.e164, snippet: messageText.slice(0, 160), bodyText: messageText, deliveryStatus: status, isUnread: false });
      } else {
        const err = data.error || 'Failed to dispatch';
        setSmsStatusMessage(`Failed: ${err}`);
        setInteractions((prev) => prev.map((i) => (i.id === optimisticId ? { ...i, deliveryStatus: 'failed', errorMessage: err } : i)));
      }
      setTimeout(() => void fetchTelephonyData(), 1000);
    } catch (e: any) {
      setSmsStatusMessage(e?.message || 'Error sending');
      setInteractions((prev) => prev.map((i) => (i.id === optimisticId ? { ...i, deliveryStatus: 'failed', errorMessage: 'Network error' } : i)));
    } finally { setIsSendingSms(false); setTimeout(() => setSmsStatusMessage(null), 3500); }
  };

  const handleRetrySms = async (failedEvt: InteractionEvent) => {
    const body = (failedEvt.bodyText || failedEvt.snippet || '').trim();
    const val = validatePhoneNumber(failedEvt.contactPhone || threadCrmContext?.primaryPhone || activeContactRecord?.phone || '');
    if (!body || !val.isValid) return;
    setRetryingSmsId(failedEvt.id);
    try {
      const { ok, data } = await dispatchSmsRequest(val.e164, body);
      if (ok && data.success) setInteractions((prev) => prev.map((item) => (item.id === failedEvt.id ? { ...item, deliveryStatus: data.status || 'sent', errorMessage: undefined } : item)));
      else setSmsReplyText(body);
    } finally { setRetryingSmsId(null); }
  };

  const appendUrlToDraft = (url: string, target: 'thread' | 'modal') => {
    if (!url) return;
    (target === 'modal' ? setNewMsgBody : setSmsReplyText)((prev) => (prev.trimEnd() ? `${prev.trimEnd()} ${url}` : url));
  };

  const handleInsertTrackingLink = (target: 'thread' | 'modal') => {
    const trip = (target === 'modal' ? newMsgRecipientCrmContext : threadCrmContext)?.primaryMatchedTrip;
    if (trip) appendUrlToDraft(buildTripTrackingUrl(trip), target);
  };

  const handleInsertPayLink = async (target: 'thread' | 'modal') => {
    const trip = (target === 'modal' ? newMsgRecipientCrmContext : threadCrmContext)?.primaryMatchedTrip;
    if (!trip) return;
    const paySvc = getPayLinkService();
    const cached = paySvc.getTripCachedPayToken(trip);
    if (cached) return appendUrlToDraft(paySvc.buildPayUrl(cached), target);
    setIsGeneratingPayLink(true);
    try {
      const created = await paySvc.createOrGetTripPayLink(trip, { sendSms: false, sendEmail: false });
      if (created.success && (created.payUrl || created.payToken)) appendUrlToDraft(created.payUrl || paySvc.buildPayUrl(created.payToken as string), target);
    } finally { setIsGeneratingPayLink(false); }
  };

  const handleAddThreadInternalNote = async () => {
    const clean = noteDraftText.trim();
    if (!clean || !selectedContactPhone) return;
    setNoteDraftText('');
    await getCommsThreadService().addInternalNote({
      threadId: activeUnifiedThread?.id, phone: threadCrmContext?.primaryPhone || activeContactRecord?.phone || activeContactSummary?.contactPhone || undefined,
      email: threadCrmContext?.primaryEmail || activeContactRecord?.email || activeContactSummary?.contactEmail || undefined,
      contactName: threadCrmContext?.contactName || activeContactRecord?.name || activeContactSummary?.contactName,
      bodyText: clean, actorName: user?.displayName || user?.email || 'Dispatcher',
    });
  };

  const handleBookContactRide = () => {
    if (!activeContactSummary) return;
    const c = activeContactRecord && !String(activeContactRecord.id || '').startsWith('temp_') ? activeContactRecord : null;
    const payload: WorkspaceEventMap['POPULATE_BOOKING'] = {
      passengerName: c?.name || threadCrmContext?.contactName || activeContactSummary.contactName || '',
      passengerPhone: c?.phone || threadCrmContext?.primaryPhone || activeContactSummary.contactPhone || '',
      passengerEmail: c?.email || threadCrmContext?.primaryEmail || activeContactSummary.contactEmail || '',
      pickupAddress: c?.homeAddress || c?.workAddress || '', dropoffAddress: c?.workAddress && c?.homeAddress ? c.workAddress : '',
      vehicleTier: c?.preferredVehicleTier || '', corporateAccount: c?.corporateAccountName || '', corporateAccountNumber: c?.corporateAccountNumber || '',
      billingPo: c?.defaultPoNumber || '', accessibilityNeeds: c?.accessibilityNeeds || {}, notes: c?.notes || '',
    };
    workspaceBus.publish('POPULATE_BOOKING', payload); onPopulateBooking?.(payload);
  };

  const handleConvertVoicemailToBooking = (suggested: InteractionEvent['suggestedBooking']) => {
    if (!suggested) return;
    const payload: WorkspaceEventMap['POPULATE_BOOKING'] = {
      passengerName: suggested.passengerName || '', passengerPhone: suggested.passengerPhone || '',
      passengerEmail: suggested.passengerEmail || activeContactRecord?.email || '',
      pickupAddress: suggested.pickup || '', dropoffAddress: suggested.dropoff || '',
      notes: suggested.notes || `Requested ${suggested.pickupTime || 'ASAP'}`,
    };
    workspaceBus.publish('POPULATE_BOOKING', payload); onPopulateBooking?.(payload);
  };

  const handleOpenTripById = (tripId: string) => {
    if (!tripId) return;
    workspaceBus.publish('OPEN_EDIT_TRIP', { tripId, phone: threadCrmContext?.primaryPhone || activeCallPhone || dialpadNumber || undefined });
    onOpenEditTrip?.(tripId);
  };

  const handleFocusTripOnMap = (tripId: string) => { if (tripId) workspaceBus.publish('FOCUS_TRIP_ON_MAP', { tripId }); };
  const handleRebookFromCrm = (payload: WorkspaceEventMap['POPULATE_BOOKING']) => { workspaceBus.publish('POPULATE_BOOKING', payload); onPopulateBooking?.(payload); showTimedBookingToast('Draft populated', 2200); };

  const handleOpenEmailInDock = (evt: InteractionEvent) => {
    workspaceBus.publish('OPEN_EMAIL_MESSAGE', { emailMessageId: evt.emailMessageId || evt.id.replace(/^em_/, ''), threadId: evt.threadId || activeUnifiedThread?.id, senderEmail: evt.contactEmail || threadCrmContext?.primaryEmail || activeContactRecord?.email });
    workspaceBus.publish('FOCUS_MODULE', { moduleKey: 'email' });
  };

  const handleOpenContactEmailInDock = () => {
    const latestEmail = [...allSelectedContactInteractions].reverse().find((e) => e.type.startsWith('email_'));
    workspaceBus.publish('OPEN_EMAIL_MESSAGE', { emailMessageId: latestEmail ? latestEmail.emailMessageId || latestEmail.id.replace(/^em_/, '') : undefined, threadId: activeUnifiedThread?.id || threadCrmContext?.threadId, senderEmail: threadCrmContext?.primaryEmail || activeContactRecord?.email || activeContactSummary?.contactEmail });
    workspaceBus.publish('FOCUS_MODULE', { moduleKey: 'email' });
  };

  const handleMarkThreadUnread = () => {
    const latest = allSelectedContactInteractions[allSelectedContactInteractions.length - 1];
    if (latest) { setInteractions((prev) => prev.map((i) => (i.id === latest.id ? { ...i, isUnread: true } : i))); void getCommsThreadService().markEventsUnread([latest.id]); }
    setSelectedContactPhone(null);
  };

  return {
    selectedContactPhone, setSelectedContactPhone, threadTab, setThreadTab, timelineFilters, setTimelineFilters,
    activeUnifiedThread, allSelectedContactInteractions, activeContactSummary, activeContactRecord, threadCrmContext,
    messagesEndRef, noteDraftText, setNoteDraftText, smsReplyText, setSmsReplyText,
    isSendingSms, smsStatusMessage, retryingSmsId, isGeneratingPayLink,
    handleOpenContactEdit, handleOpenClientProfile, handleMarkThreadUnread,
    isNewMessageModalOpen, setIsNewMessageModalOpen, newMsgRecipientPhone, setNewMsgRecipientPhone,
    newMsgRecipientName, setNewMsgRecipientName, newMsgBody, setNewMsgBody, newMsgError, setNewMsgError,
    isSendingNewMsg, msgContactSearch, setMsgContactSearch, isMsgContactDropdownOpen, setIsMsgContactDropdownOpen,
    filteredContactsForMsg, newMsgRecipientCrmContext,
    handleOpenFreshNewMessageModal: () => { setNewMsgRecipientPhone(''); setNewMsgRecipientName(''); setNewMsgBody(''); setNewMsgError(null); setMsgContactSearch(''); setIsNewMessageModalOpen(true); },
    handleOpenNewMessageThread: () => { const val = validatePhoneNumber(newMsgRecipientPhone.trim()); if (!val.isValid) return setNewMsgError(val.error || 'Enter a valid 10-digit phone number.'); setIsNewMessageModalOpen(false); setSelectedContactPhone(val.e164); },
    handleSendNewMessage, handleSendSms, handleRetrySms, handleInsertTrackingLink, handleInsertPayLink,
    handleAddThreadInternalNote, handleBookContactRide, handleConvertVoicemailToBooking,
    handleOpenTripById, handleFocusTripOnMap, handleRebookFromCrm, handleOpenEmailInDock, handleOpenContactEmailInDock,
  };
}
