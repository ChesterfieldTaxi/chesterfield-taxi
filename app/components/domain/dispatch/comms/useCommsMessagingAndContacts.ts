import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { authorizedFetch } from '../../../../core/services/auth/auth-headers';
import { resolveCommsCrmContext } from '../../../../core/services/comms/comms-templates.service';
import { getCommsThreadService } from '../../../../core/services/comms/comms-thread.service';
import {
  getContactService,
  normalizeEmail,
  type ContactRecord,
} from '../../../../core/services/customer/contact.service';
import { buildTripTrackingUrl } from '../../../../core/services/email/dispatch-email.service';
import { normalizePhone } from '../../../../core/services/passenger.service';
import { getPayLinkService } from '../../../../core/services/payments/pay-link.service';
import {
  getWorkspaceBus,
  type UpcomingBookingPreview,
  type WorkspaceEventMap,
} from '../../../../core/services/workspace-bus.service';
import type { Trip } from '../../../../core/types/trip';
import {
  formatDisplayPhone,
  sanitizeToE164,
  validatePhoneNumber,
} from '../../../../core/utils/phone';
import {
  getClientTelephonyCredentials,
  type CommsTab,
  type InteractionEvent,
  type ThreadTab,
} from './comms-types';

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
}

export function useCommsMessagingAndContacts({
  user,
  activeTab,
  interactions,
  setInteractions,
  fetchTelephonyData,
  trips,
  drivers,
  activeCallPhone,
  dialpadNumber,
  showTimedBookingToast,
  onPopulateBooking,
  onOpenEditTrip,
}: UseCommsMessagingAndContactsOptions) {
  const workspaceBus = getWorkspaceBus();

  // Selected thread & composer state
  const [selectedContactPhone, setSelectedContactPhone] = useState<string | null>(null);
  const [threadTab, setThreadTab] = useState<ThreadTab>('all');
  const pendingBusThreadTabRef = useRef<ThreadTab | null>(null);

  const [noteDraftText, setNoteDraftText] = useState('');
  const [smsReplyText, setSmsReplyText] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsStatusMessage, setSmsStatusMessage] = useState<string | null>(null);
  const [retryingSmsId, setRetryingSmsId] = useState<string | null>(null);
  const [isGeneratingPayLink, setIsGeneratingPayLink] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Contact Profile record synced from ContactService / WorkspaceBus
  const [activeContactRecord, setActiveContactRecord] = useState<ContactRecord | null>(null);

  // Bottom-docked New SMS composition modal state
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);
  const [newMsgRecipientPhone, setNewMsgRecipientPhone] = useState('');
  const [newMsgRecipientName, setNewMsgRecipientName] = useState('');
  const [newMsgBody, setNewMsgBody] = useState('');
  const [newMsgError, setNewMsgError] = useState<string | null>(null);
  const [isSendingNewMsg, setIsSendingNewMsg] = useState(false);
  const [allContactsForMsg, setAllContactsForMsg] = useState<ContactRecord[]>([]);
  const [msgContactSearch, setMsgContactSearch] = useState('');
  const [isMsgContactDropdownOpen, setIsMsgContactDropdownOpen] = useState(false);

  // Refresh contact directory when New SMS composer opens
  useEffect(() => {
    if (isNewMessageModalOpen) {
      try {
        const contacts = getContactService().getAllContacts();
        setAllContactsForMsg(contacts);
      } catch {
        // Ignore directory lookup error
      }
    }
  }, [isNewMessageModalOpen]);

  const filteredContactsForMsg = useMemo(() => {
    const q = msgContactSearch.toLowerCase().trim();
    if (!q) return allContactsForMsg.slice(0, 8);
    return allContactsForMsg
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.mobilePhone && c.mobilePhone.includes(q)) ||
          (c.corporateAccountNumber || (c as any).accountNumber || '').toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [allContactsForMsg, msgContactSearch]);

  // Subscribe to OPEN_COMMS_THREAD on WorkspaceBus
  useEffect(() => {
    const unsub = workspaceBus.subscribe((msg) => {
      if (msg.type === 'OPEN_COMMS_THREAD') {
        const p = msg.payload;
        const resolvedThread = getCommsThreadService().findThread({
          threadId: p.threadId,
          phone: p.phone,
          email: p.email,
        });
        const targetSelector =
          resolvedThread?.primaryPhone ||
          p.phone ||
          resolvedThread?.primaryEmail ||
          p.email ||
          resolvedThread?.id ||
          p.threadId ||
          null;
        if (targetSelector) {
          if (p.tab) {
            pendingBusThreadTabRef.current = p.tab;
            setThreadTab(p.tab);
          }
          setSelectedContactPhone(targetSelector);
        }
      }
    });
    return () => unsub();
  }, [workspaceBus]);

  // Sync threadTab when activeTab changes or a new contact is selected
  useEffect(() => {
    if (pendingBusThreadTabRef.current) {
      setThreadTab(pendingBusThreadTabRef.current);
      pendingBusThreadTabRef.current = null;
      return;
    }
    if (activeTab === 'messages') {
      setThreadTab('sms');
    } else if (activeTab === 'phone') {
      setThreadTab('calls');
    } else {
      setThreadTab('all');
    }
  }, [activeTab, selectedContactPhone]);

  // Resolve active unified thread across phone, email, and canonical threadId
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

  // Selected contact thread interactions across Calls + SMS + Voicemails + Emails + Notes
  const allSelectedContactInteractions = useMemo(() => {
    if (!selectedContactPhone) return [];
    const normTarget = normalizePhone(selectedContactPhone);
    const normEmailTarget = normalizeEmail(selectedContactPhone);
    const resolvedContact =
      (normTarget ? getContactService().getContactByPhone(selectedContactPhone) : null) ||
      (normEmailTarget ? getContactService().getContactByEmail(selectedContactPhone) : null) ||
      (activeUnifiedThread?.contactId
        ? getContactService().getContactById(activeUnifiedThread.contactId)
        : null);
    const resolvedContactNormPhone = resolvedContact?.phone
      ? normalizePhone(resolvedContact.phone)
      : '';
    const resolvedContactNormEmail = normalizeEmail(resolvedContact?.email);

    return interactions
      .filter((i) => {
        if (i.snippet?.includes('Thank you for contacting our dispatch desk')) return false;
        if (activeUnifiedThread && i.threadId === activeUnifiedThread.id) return true;
        if (selectedContactPhone.startsWith('thr_') && i.threadId === selectedContactPhone) {
          return true;
        }
        const normContact = normalizePhone(i.contactPhone);
        const normMobile = i.mobilePhone ? normalizePhone(i.mobilePhone) : '';
        const normHome = i.homePhone ? normalizePhone(i.homePhone) : '';
        const normItemEmail = normalizeEmail(i.contactEmail);

        return (
          (normTarget &&
            (normContact === normTarget ||
              normMobile === normTarget ||
              normHome === normTarget)) ||
          (resolvedContactNormPhone && normContact === resolvedContactNormPhone) ||
          (normEmailTarget && normItemEmail === normEmailTarget) ||
          (resolvedContactNormEmail && normItemEmail === resolvedContactNormEmail)
        );
      })
      .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
  }, [interactions, selectedContactPhone, activeUnifiedThread]);

  const selectedInteractions = useMemo(() => {
    if (threadTab === 'sms') {
      return allSelectedContactInteractions.filter((i) => i.type.startsWith('sms_'));
    }
    if (threadTab === 'calls') {
      return allSelectedContactInteractions.filter(
        (i) => i.type.startsWith('call_') || i.type === 'voicemail'
      );
    }
    if (threadTab === 'emails') {
      return allSelectedContactInteractions.filter((i) => i.type.startsWith('email_'));
    }
    if (threadTab === 'notes') {
      return allSelectedContactInteractions.filter((i) => i.type === 'internal_note');
    }
    return allSelectedContactInteractions;
  }, [allSelectedContactInteractions, threadTab]);

  const threadSmsCount = useMemo(
    () => allSelectedContactInteractions.filter((i) => i.type.startsWith('sms_')).length,
    [allSelectedContactInteractions]
  );
  const threadCallCount = useMemo(
    () =>
      allSelectedContactInteractions.filter(
        (i) => i.type.startsWith('call_') || i.type === 'voicemail'
      ).length,
    [allSelectedContactInteractions]
  );
  const threadEmailCount = useMemo(
    () => allSelectedContactInteractions.filter((i) => i.type.startsWith('email_')).length,
    [allSelectedContactInteractions]
  );
  const threadNoteCount = useMemo(
    () => allSelectedContactInteractions.filter((i) => i.type === 'internal_note').length,
    [allSelectedContactInteractions]
  );
  const has10DlcBlockedMessages = useMemo(
    () =>
      allSelectedContactInteractions.some(
        (i) =>
          i.type === 'sms_outbound' &&
          (i.errorCode === 30034 || i.errorCode === '30034' || i.deliveryStatus === 'undelivered')
      ),
    [allSelectedContactInteractions]
  );

  // Active contact summary (safe across phone-only, email-only, and canonical thr_... selectors)
  const activeContactSummary = useMemo(() => {
    const lastEvt = allSelectedContactInteractions[allSelectedContactInteractions.length - 1];
    const isEmailSel = Boolean(selectedContactPhone && selectedContactPhone.includes('@'));
    const isThreadSel = Boolean(selectedContactPhone && selectedContactPhone.startsWith('thr_'));

    const contactRec = selectedContactPhone
      ? (!isEmailSel && !isThreadSel
          ? getContactService().getContactByPhone(selectedContactPhone)
          : null) ||
        (isEmailSel ? getContactService().getContactByEmail(selectedContactPhone) : null) ||
        (activeUnifiedThread?.contactId
          ? getContactService().getContactById(activeUnifiedThread.contactId)
          : null)
      : null;

    const fallbackDisplay = selectedContactPhone
      ? isEmailSel
        ? selectedContactPhone
        : isThreadSel
        ? activeUnifiedThread?.contactName ||
          activeUnifiedThread?.primaryEmail ||
          (activeUnifiedThread?.primaryPhone
            ? formatDisplayPhone(activeUnifiedThread.primaryPhone)
            : 'Contact')
        : formatDisplayPhone(selectedContactPhone)
      : 'Contact';

    const resolvedName =
      (activeContactRecord && !String(activeContactRecord.id || '').startsWith('temp_')
        ? activeContactRecord.name
        : '') ||
      contactRec?.name ||
      (activeUnifiedThread?.contactName && !activeUnifiedThread.contactName.startsWith('+')
        ? activeUnifiedThread.contactName
        : '') ||
      lastEvt?.contactName ||
      fallbackDisplay;

    const resolvedPhone =
      contactRec?.phone ||
      activeUnifiedThread?.primaryPhone ||
      lastEvt?.contactPhone ||
      (!isEmailSel && !isThreadSel && selectedContactPhone ? selectedContactPhone : '');

    const resolvedEmail =
      contactRec?.email ||
      activeUnifiedThread?.primaryEmail ||
      lastEvt?.contactEmail ||
      (isEmailSel && selectedContactPhone ? selectedContactPhone : undefined);

    if (lastEvt) {
      return {
        ...lastEvt,
        contactName: resolvedName,
        contactPhone: resolvedPhone,
        contactEmail: resolvedEmail || lastEvt.contactEmail,
      };
    }
    if (selectedContactPhone) {
      return {
        id: `contact_${selectedContactPhone}`,
        threadId: activeUnifiedThread?.id || (isThreadSel ? selectedContactPhone : undefined),
        type: isEmailSel ? ('email_inbound' as const) : ('call_inbound' as const),
        contactName: resolvedName,
        contactPhone: resolvedPhone,
        contactEmail: resolvedEmail,
        contactType: activeUnifiedThread?.contactType || ('passenger' as const),
        timestamp: 'Recent',
        timestampMs: Date.now(),
        snippet: 'Direct contact thread',
      } as InteractionEvent;
    }
    return null;
  }, [
    allSelectedContactInteractions,
    selectedContactPhone,
    activeContactRecord,
    activeUnifiedThread,
  ]);

  // Sync activeContactRecord from ContactService whenever selected contact changes
  useEffect(() => {
    if (!selectedContactPhone) {
      setActiveContactRecord(null);
      return;
    }
    const isEmailSel = selectedContactPhone.includes('@');
    const isThreadSel = selectedContactPhone.startsWith('thr_');
    const contactService = getContactService();
    const found =
      (!isEmailSel && !isThreadSel
        ? contactService.getContactByPhone(selectedContactPhone)
        : null) ||
      (isEmailSel ? contactService.getContactByEmail(selectedContactPhone) : null) ||
      (activeUnifiedThread?.contactId
        ? contactService.getContactById(activeUnifiedThread.contactId)
        : null) ||
      (activeUnifiedThread?.primaryPhone
        ? contactService.getContactByPhone(activeUnifiedThread.primaryPhone)
        : null) ||
      (activeUnifiedThread?.primaryEmail
        ? contactService.getContactByEmail(activeUnifiedThread.primaryEmail)
        : null);

    if (found) {
      setActiveContactRecord(found);
    } else {
      setActiveContactRecord({
        id: `temp_${Date.now()}`,
        name:
          activeContactSummary?.contactName ||
          (isEmailSel
            ? selectedContactPhone
            : isThreadSel
            ? activeUnifiedThread?.contactName || 'Contact'
            : formatDisplayPhone(selectedContactPhone)),
        phone:
          activeUnifiedThread?.primaryPhone ||
          (!isEmailSel && !isThreadSel ? selectedContactPhone : ''),
        email: activeUnifiedThread?.primaryEmail || (isEmailSel ? selectedContactPhone : ''),
        isVip: false,
        preferredVehicleTier: 'standard',
        notes: '',
        customerScore: 90,
        tripCount: 1,
        totalSpend: 0,
        createdAt: new Date().toISOString(),
        updatedAt: Date.now(),
      });
    }
  }, [selectedContactPhone, activeContactSummary?.contactName, activeUnifiedThread]);

  // Listen to CONTACT_UPDATED events across tabs
  useEffect(() => {
    const unsub = workspaceBus.subscribe((msg) => {
      if (msg.type === 'CONTACT_UPDATED') {
        const contact = msg.payload?.contact;
        if (contact && selectedContactPhone) {
          if (normalizePhone(contact.phone) === normalizePhone(selectedContactPhone)) {
            setActiveContactRecord(contact);
          }
        }
      }
    });
    return () => unsub();
  }, [workspaceBus, selectedContactPhone]);

  // Auto-scroll to latest message at the bottom of the conversation thread
  useEffect(() => {
    if (selectedContactPhone && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedContactPhone, selectedInteractions.length]);

  const threadCrmContext = useMemo(() => {
    if (!selectedContactPhone) return null;
    const isEmailSel = selectedContactPhone.includes('@');
    const isThreadSel = selectedContactPhone.startsWith('thr_');
    return resolveCommsCrmContext({
      phone:
        activeUnifiedThread?.primaryPhone ||
        activeContactSummary?.contactPhone ||
        (!isEmailSel && !isThreadSel ? selectedContactPhone : undefined),
      email:
        activeUnifiedThread?.primaryEmail ||
        activeContactSummary?.contactEmail ||
        activeContactRecord?.email ||
        (isEmailSel ? selectedContactPhone : undefined),
      threadId: activeUnifiedThread?.id || (isThreadSel ? selectedContactPhone : undefined),
      contactNameHint: activeContactSummary?.contactName,
      contact: activeContactRecord,
      thread: activeUnifiedThread,
      trips,
      drivers,
    });
  }, [
    selectedContactPhone,
    activeUnifiedThread,
    activeContactSummary,
    activeContactRecord,
    trips,
    drivers,
  ]);

  const newMsgRecipientCrmContext = useMemo(() => {
    if (!newMsgRecipientPhone.trim()) return null;
    return resolveCommsCrmContext({
      phone: newMsgRecipientPhone,
      contactNameHint: newMsgRecipientName,
      trips,
      drivers,
    });
  }, [newMsgRecipientPhone, newMsgRecipientName, trips, drivers]);

  const upcomingBookingsForContact = useMemo<UpcomingBookingPreview[]>(() => {
    if (!activeContactSummary) return [];
    const list: UpcomingBookingPreview[] = [];
    trips.forEach((t) => {
      const passengerPhone = t.passenger?.phone || '';
      if (
        normalizePhone(passengerPhone) === normalizePhone(activeContactSummary.contactPhone) ||
        (activeContactSummary.mobilePhone &&
          normalizePhone(passengerPhone) === normalizePhone(activeContactSummary.mobilePhone))
      ) {
        list.push({
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
    return list;
  }, [activeContactSummary, trips]);

  // Route contact profile edit triggers to unified ClientProfileWindow (`initialTab: 'edit'`)
  const handleOpenContactEdit = () => {
    const phone =
      activeContactRecord?.phone ||
      activeContactSummary?.mobilePhone ||
      activeContactSummary?.contactPhone ||
      (selectedContactPhone &&
      !selectedContactPhone.includes('@') &&
      !selectedContactPhone.startsWith('thr_')
        ? selectedContactPhone
        : '') ||
      '';
    const email =
      activeContactRecord?.email ||
      activeContactSummary?.contactEmail ||
      (selectedContactPhone?.includes('@') ? selectedContactPhone : '') ||
      '';
    const name = activeContactRecord?.name || activeContactSummary?.contactName || '';

    workspaceBus.publish('OPEN_CLIENT_PROFILE', {
      phone: phone || undefined,
      email: email || undefined,
      name: name || undefined,
      initialTab: 'edit',
      source: 'comms_hub',
    });
  };

  // Bottom-Docked New SMS Composition handlers
  const handleOpenFreshNewMessageModal = () => {
    setNewMsgRecipientPhone('');
    setNewMsgRecipientName('');
    setNewMsgBody('');
    setNewMsgError(null);
    setMsgContactSearch('');
    setIsNewMessageModalOpen(true);
  };

  const handleSendNewMessage = async () => {
    const rawTarget = newMsgRecipientPhone.trim();
    if (!rawTarget) {
      setNewMsgError('Please select a contact or enter a phone number.');
      return;
    }
    const val = validatePhoneNumber(rawTarget);
    if (!val.isValid) {
      setNewMsgError(val.error || 'Please enter a valid 10-digit phone number.');
      return;
    }
    if (!newMsgBody.trim()) {
      setNewMsgError('Please enter a message text.');
      return;
    }

    setIsSendingNewMsg(true);
    setNewMsgError(null);

    const contact = getContactService().getContactByPhone(val.e164);
    const displayName =
      newMsgRecipientName.trim() || contact?.name || formatDisplayPhone(val.e164);
    const msgText = newMsgBody.trim();

    const newEvt: InteractionEvent = {
      id: `sms_out_${Date.now()}`,
      type: 'sms_outbound',
      contactName: displayName,
      contactPhone: val.e164,
      contactType: ((contact as any)?.type as any) || 'passenger',
      timestamp: 'Just now',
      timestampMs: Date.now(),
      snippet: msgText,
      isUnread: false,
    };

    setInteractions((prev) => [newEvt, ...prev]);

    try {
      const creds = getClientTelephonyCredentials();
      const twilioPhone = creds.phoneNumber || '+13142281454';

      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: val.e164,
          body: msgText,
          credentials: {
            accountSid: creds.accountSid,
            authToken: creds.authToken,
            phoneNumber: sanitizeToE164(twilioPhone),
          },
        }),
      });

      const resData = (await resp.json()) as any;
      if (resData.messageSid || resData.status) {
        setInteractions((prev) =>
          prev.map((i) =>
            i.id === newEvt.id
              ? {
                  ...i,
                  id: resData.messageSid || i.id,
                  deliveryStatus: resData.status || (resData.success ? 'sent' : 'failed'),
                  errorCode: resData.code || resData.errorCode,
                  errorMessage: resData.error || resData.errorMessage,
                }
              : i
          )
        );
      }
      setTimeout(() => void fetchTelephonyData(), 1000);
    } catch {
      // Tolerated network error (optimistic SMS stays visible)
    }

    setIsSendingNewMsg(false);
    setIsNewMessageModalOpen(false);
    setSelectedContactPhone(val.e164);
  };

  const handleOpenNewMessageThread = () => {
    const rawTarget = newMsgRecipientPhone.trim();
    if (!rawTarget) {
      setNewMsgError('Please select a contact or enter a phone number.');
      return;
    }
    const val = validatePhoneNumber(rawTarget);
    if (!val.isValid) {
      setNewMsgError(val.error || 'Please enter a valid 10-digit phone number.');
      return;
    }
    setIsNewMessageModalOpen(false);
    setSelectedContactPhone(val.e164);
  };

  // Thread Outbound SMS & 1-Tap Retry
  const handleSendSms = async () => {
    if (!smsReplyText.trim() || !selectedContactPhone) return;

    const rawRecipient =
      activeContactSummary?.mobilePhone ||
      threadCrmContext?.primaryPhone ||
      activeContactRecord?.phone ||
      activeUnifiedThread?.primaryPhone ||
      (!selectedContactPhone.includes('@') && !selectedContactPhone.startsWith('thr_')
        ? selectedContactPhone
        : '');

    const phoneValidation = validatePhoneNumber(rawRecipient);
    if (!phoneValidation.isValid) {
      setSmsStatusMessage(phoneValidation.error || 'Invalid recipient phone number.');
      setTimeout(() => setSmsStatusMessage(null), 3500);
      return;
    }

    setIsSendingSms(true);
    setSmsStatusMessage(null);

    const messageText = smsReplyText.trim();
    const targetContactName =
      threadCrmContext?.contactName ||
      activeContactRecord?.name ||
      activeContactSummary?.contactName ||
      formatDisplayPhone(phoneValidation.e164);

    const optimisticId = `sms_out_${Date.now()}`;
    const newInteraction: InteractionEvent = {
      id: optimisticId,
      threadId: activeUnifiedThread?.id,
      channel: 'sms',
      type: 'sms_outbound',
      contactName: targetContactName,
      contactPhone: phoneValidation.e164,
      contactEmail: threadCrmContext?.primaryEmail || activeContactRecord?.email || undefined,
      contactType: ((activeContactRecord as any)?.type as any) || 'passenger',
      timestamp: 'Just now',
      timestampMs: Date.now(),
      snippet: messageText,
      bodyText: messageText,
      isUnread: false,
    };

    setInteractions((prev) => [newInteraction, ...prev]);
    setSmsReplyText('');

    try {
      const creds = getClientTelephonyCredentials();
      const twilioPhone = creds.phoneNumber || '+13142281454';

      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: phoneValidation.e164,
          body: messageText,
          credentials: {
            accountSid: creds.accountSid,
            authToken: creds.authToken,
            phoneNumber: sanitizeToE164(twilioPhone),
          },
        }),
      });

      const resData = (await resp.json()) as any;
      if (resData.success) {
        setSmsStatusMessage(resData.simulated ? 'Sent (Simulated)' : 'Sent to carrier');
        const resolvedSid = resData.messageSid || optimisticId;
        const resolvedStatus = resData.status || 'sent';
        setInteractions((prev) =>
          prev.map((i) =>
            i.id === optimisticId
              ? {
                  ...i,
                  id: resolvedSid,
                  deliveryStatus: resolvedStatus,
                  errorCode: resData.code || resData.errorCode,
                  errorMessage: resData.error || resData.errorMessage,
                }
              : i
          )
        );
        void getCommsThreadService().recordCommsEvent({
          id: resolvedSid,
          externalSid: resData.messageSid || undefined,
          threadId: activeUnifiedThread?.id,
          channel: 'sms',
          direction: 'outbound',
          eventType: 'sms_outbound',
          contactName: targetContactName,
          contactPhone: phoneValidation.e164,
          contactEmail: threadCrmContext?.primaryEmail || activeContactRecord?.email || undefined,
          snippet: messageText.slice(0, 160),
          bodyText: messageText,
          deliveryStatus: resolvedStatus,
          isUnread: false,
        });
      } else {
        const errorDesc = resData.error || resData.warning || 'Failed to dispatch';
        setSmsStatusMessage(`Failed: ${errorDesc}`);
        setInteractions((prev) =>
          prev.map((i) =>
            i.id === optimisticId
              ? { ...i, deliveryStatus: 'failed', errorMessage: errorDesc }
              : i
          )
        );
      }
      setTimeout(() => void fetchTelephonyData(), 1000);
    } catch (err: any) {
      setSmsStatusMessage(err?.message || 'Error sending');
      setInteractions((prev) =>
        prev.map((i) =>
          i.id === optimisticId
            ? { ...i, deliveryStatus: 'failed', errorMessage: err?.message || 'Network error' }
            : i
        )
      );
    } finally {
      setIsSendingSms(false);
      setTimeout(() => setSmsStatusMessage(null), 4000);
    }
  };

  const handleRetrySms = async (failedEvt: InteractionEvent) => {
    const messageBody = (failedEvt.bodyText || failedEvt.snippet || '').trim();
    if (!messageBody) return;

    const rawRecipient =
      failedEvt.contactPhone ||
      threadCrmContext?.primaryPhone ||
      activeContactRecord?.phone ||
      '';
    const phoneVal = validatePhoneNumber(rawRecipient);
    if (!phoneVal.isValid) {
      setSmsReplyText(messageBody);
      setSmsStatusMessage('Loaded message into composer — verify recipient phone.');
      setTimeout(() => setSmsStatusMessage(null), 3500);
      return;
    }

    setRetryingSmsId(failedEvt.id);
    setSmsStatusMessage(null);
    try {
      const creds = getClientTelephonyCredentials();
      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: phoneVal.e164,
          body: messageBody,
          credentials: {
            accountSid: creds.accountSid,
            authToken: creds.authToken,
            phoneNumber: sanitizeToE164(creds.phoneNumber || '+13142281454'),
          },
        }),
      });
      const resData = (await resp.json().catch(() => ({}))) as any;
      if (resp.ok && resData.success) {
        const nextStatus = resData.status || 'sent';
        setInteractions((prev) =>
          prev.map((item) =>
            item.id === failedEvt.id
              ? {
                  ...item,
                  deliveryStatus: nextStatus,
                  errorCode: undefined,
                  errorMessage: undefined,
                  timestamp: 'Just now',
                  timestampMs: Date.now(),
                }
              : item
          )
        );
        void getCommsThreadService().recordCommsEvent({
          id: failedEvt.id,
          threadId: failedEvt.threadId || activeUnifiedThread?.id,
          channel: 'sms',
          direction: 'outbound',
          eventType: 'sms_outbound',
          contactName: failedEvt.contactName,
          contactPhone: phoneVal.e164,
          snippet: messageBody.slice(0, 160),
          bodyText: messageBody,
          deliveryStatus: nextStatus,
          errorMessage: '',
          isUnread: false,
        });
        setSmsStatusMessage(resData.simulated ? 'Retried (Simulated)' : 'Retried — sent to carrier');
      } else {
        setSmsReplyText(messageBody);
        setSmsStatusMessage(
          `Retry failed (${resData.error || 'Carrier error'}) — pre-loaded in composer.`
        );
      }
    } catch {
      setSmsReplyText(messageBody);
      setSmsStatusMessage('Network offline — message pre-loaded in composer.');
    } finally {
      setRetryingSmsId(null);
      setTimeout(() => setSmsStatusMessage(null), 4000);
    }
  };

  // 1-Tap Tracking & Pay Link Insertion
  const appendUrlToDraft = (url: string, target: 'thread' | 'modal') => {
    if (!url) return;
    if (target === 'modal') {
      setNewMsgBody((prev) => {
        const trimmed = prev.trimEnd();
        return trimmed ? `${trimmed} ${url}` : url;
      });
    } else {
      setSmsReplyText((prev) => {
        const trimmed = prev.trimEnd();
        return trimmed ? `${trimmed} ${url}` : url;
      });
    }
  };

  const handleInsertTrackingLink = (target: 'thread' | 'modal') => {
    const ctx = target === 'modal' ? newMsgRecipientCrmContext : threadCrmContext;
    const trip = ctx?.primaryMatchedTrip;
    if (!trip) return;
    const url = buildTripTrackingUrl(trip);
    appendUrlToDraft(url, target);
  };

  const handleInsertPayLink = async (target: 'thread' | 'modal') => {
    const ctx = target === 'modal' ? newMsgRecipientCrmContext : threadCrmContext;
    const trip = ctx?.primaryMatchedTrip;
    if (!trip) return;

    const payService = getPayLinkService();
    const cachedToken = payService.getTripCachedPayToken(trip);
    if (cachedToken) {
      appendUrlToDraft(payService.buildPayUrl(cachedToken), target);
      return;
    }

    setIsGeneratingPayLink(true);
    try {
      const created = await payService.createOrGetTripPayLink(trip, {
        sendSms: false,
        sendEmail: false,
      });
      if (created.success && (created.payUrl || created.payToken)) {
        const payUrl = created.payUrl || payService.buildPayUrl(created.payToken as string);
        appendUrlToDraft(payUrl, target);
      } else {
        setSmsStatusMessage(created.error || 'Unable to generate Pay Link right now.');
        setTimeout(() => setSmsStatusMessage(null), 3500);
      }
    } finally {
      setIsGeneratingPayLink(false);
    }
  };

  // Internal Notes, Booking Population & Cross-Dock Email Routing
  const handleAddThreadInternalNote = async () => {
    const clean = noteDraftText.trim();
    if (!clean || !selectedContactPhone) return;
    const phoneCandidate =
      threadCrmContext?.primaryPhone ||
      activeContactRecord?.phone ||
      activeContactSummary?.contactPhone ||
      (!selectedContactPhone.includes('@') && !selectedContactPhone.startsWith('thr_')
        ? selectedContactPhone
        : undefined);
    const emailCandidate =
      threadCrmContext?.primaryEmail ||
      activeContactRecord?.email ||
      activeContactSummary?.contactEmail ||
      (selectedContactPhone.includes('@') ? selectedContactPhone : undefined);

    setNoteDraftText('');
    await getCommsThreadService().addInternalNote({
      threadId: activeUnifiedThread?.id,
      phone: phoneCandidate,
      email: emailCandidate,
      contactName:
        threadCrmContext?.contactName ||
        activeContactRecord?.name ||
        activeContactSummary?.contactName,
      bodyText: clean,
      actorName: user?.displayName || user?.email || 'Dispatcher',
    });
  };

  const handleBookContactRide = () => {
    if (!activeContactSummary) return;
    const rawCandidate =
      activeContactSummary.mobilePhone ||
      activeContactSummary.contactPhone ||
      threadCrmContext?.primaryPhone ||
      (!selectedContactPhone?.includes('@') && !selectedContactPhone?.startsWith('thr_')
        ? selectedContactPhone
        : '');
    const emailCandidate =
      threadCrmContext?.primaryEmail ||
      activeContactRecord?.email ||
      activeContactSummary.contactEmail ||
      (selectedContactPhone?.includes('@') ? selectedContactPhone : '');
    const contact =
      (activeContactRecord && !String(activeContactRecord.id || '').startsWith('temp_')
        ? activeContactRecord
        : null) ||
      (rawCandidate ? getContactService().getContactByPhone(rawCandidate) : null) ||
      (emailCandidate ? getContactService().getContactByEmail(emailCandidate) : null);

    const payload = {
      passengerName:
        contact?.name || threadCrmContext?.contactName || activeContactSummary.contactName || '',
      passengerPhone: contact?.phone || rawCandidate || '',
      passengerEmail: contact?.email || emailCandidate || '',
      pickupAddress: contact?.homeAddress || contact?.workAddress || '',
      dropoffAddress: contact?.workAddress && contact?.homeAddress ? contact.workAddress : '',
      vehicleTier: contact?.preferredVehicleTier || '',
      corporateAccount: contact?.corporateAccountName || '',
      corporateAccountNumber:
        contact?.corporateAccountNumber || (contact as any)?.accountNumber || '',
      billingPo: contact?.defaultPoNumber || (contact as any)?.billingPo || '',
      accessibilityNeeds: contact?.accessibilityNeeds || {},
      notes: contact?.notes || '',
    };
    workspaceBus.publish('POPULATE_BOOKING', payload);
    onPopulateBooking?.(payload);
  };

  const handleConvertVoicemailToBooking = (suggested: InteractionEvent['suggestedBooking']) => {
    if (!suggested) return;
    const phone = suggested.passengerPhone;
    const email = suggested.passengerEmail;
    const contact =
      (phone ? getContactService().getContactByPhone(phone) : null) ||
      (email ? getContactService().getContactByEmail(email) : null);

    const payload = {
      passengerName: contact?.name || suggested.passengerName || '',
      passengerPhone: contact?.phone || phone || '',
      passengerEmail: contact?.email || email || activeContactRecord?.email || '',
      pickupAddress: suggested.pickup || contact?.homeAddress || '',
      dropoffAddress: suggested.dropoff || contact?.workAddress || '',
      vehicleTier: contact?.preferredVehicleTier || '',
      corporateAccount: contact?.corporateAccountName || '',
      corporateAccountNumber:
        contact?.corporateAccountNumber || (contact as any)?.accountNumber || '',
      billingPo: contact?.defaultPoNumber || (contact as any)?.billingPo || '',
      accessibilityNeeds: contact?.accessibilityNeeds || {},
      notes: `${
        suggested.notes || `Converted from Comms (Requested ${suggested.pickupTime || 'earlier'})`
      }${contact?.notes ? ` | Contact notes: ${contact.notes}` : ''}`,
    };

    workspaceBus.publish('POPULATE_BOOKING', payload);
    onPopulateBooking?.(payload);
  };

  const handleOpenTripById = (tripId: string) => {
    if (!tripId) return;
    workspaceBus.publish('OPEN_EDIT_TRIP', {
      tripId,
      phone:
        threadCrmContext?.primaryPhone ||
        activeContactSummary?.contactPhone ||
        activeCallPhone ||
        dialpadNumber ||
        undefined,
    });
    workspaceBus.publish('FOCUS_TRIP_ON_MAP', {
      tripId,
    });
    onOpenEditTrip?.(tripId);
  };

  const handleViewUpcomingTrip = (targetTrip: UpcomingBookingPreview) => {
    if (!targetTrip) return;
    handleOpenTripById(targetTrip.id);
  };

  const handleRebookFromCrm = (payload: WorkspaceEventMap['POPULATE_BOOKING']) => {
    workspaceBus.publish('POPULATE_BOOKING', payload);
    onPopulateBooking?.(payload);
    showTimedBookingToast('Rebook loaded', 2500);
    setSmsStatusMessage('Loaded last ride into Dispatch Booking');
    setTimeout(() => {
      setSmsStatusMessage(null);
    }, 2500);
  };

  const handleOpenEmailInDock = (evt: InteractionEvent) => {
    workspaceBus.publish('OPEN_EMAIL_MESSAGE', {
      emailMessageId: evt.emailMessageId || evt.id.replace(/^em_/, ''),
      threadId: evt.threadId || activeUnifiedThread?.id,
      senderEmail:
        evt.contactEmail || threadCrmContext?.primaryEmail || activeContactRecord?.email,
    });
    workspaceBus.publish('FOCUS_MODULE', { moduleKey: 'email' });
  };

  const handleOpenContactEmailInDock = () => {
    const latestEmailEvt = [...allSelectedContactInteractions]
      .reverse()
      .find((e) => e.type.startsWith('email_'));
    workspaceBus.publish('OPEN_EMAIL_MESSAGE', {
      emailMessageId: latestEmailEvt
        ? latestEmailEvt.emailMessageId || latestEmailEvt.id.replace(/^em_/, '')
        : undefined,
      threadId: activeUnifiedThread?.id || threadCrmContext?.threadId,
      senderEmail:
        threadCrmContext?.primaryEmail ||
        activeContactRecord?.email ||
        activeContactSummary?.contactEmail,
    });
    workspaceBus.publish('FOCUS_MODULE', { moduleKey: 'email' });
  };

  return {
    selectedContactPhone,
    setSelectedContactPhone,
    threadTab,
    setThreadTab,
    activeUnifiedThread,
    allSelectedContactInteractions,
    selectedInteractions,
    threadSmsCount,
    threadCallCount,
    threadEmailCount,
    threadNoteCount,
    has10DlcBlockedMessages,
    activeContactSummary,
    activeContactRecord,
    threadCrmContext,
    upcomingBookingsForContact,
    messagesEndRef,
    noteDraftText,
    setNoteDraftText,
    smsReplyText,
    setSmsReplyText,
    isSendingSms,
    smsStatusMessage,
    retryingSmsId,
    isGeneratingPayLink,
    handleOpenContactEdit,
    isNewMessageModalOpen,
    setIsNewMessageModalOpen,
    newMsgRecipientPhone,
    setNewMsgRecipientPhone,
    newMsgRecipientName,
    setNewMsgRecipientName,
    newMsgBody,
    setNewMsgBody,
    newMsgError,
    setNewMsgError,
    isSendingNewMsg,
    msgContactSearch,
    setMsgContactSearch,
    isMsgContactDropdownOpen,
    setIsMsgContactDropdownOpen,
    filteredContactsForMsg,
    newMsgRecipientCrmContext,
    handleOpenFreshNewMessageModal,
    handleSendNewMessage,
    handleOpenNewMessageThread,
    handleSendSms,
    handleRetrySms,
    handleInsertTrackingLink,
    handleInsertPayLink,
    handleAddThreadInternalNote,
    handleBookContactRide,
    handleConvertVoicemailToBooking,
    handleOpenTripById,
    handleViewUpcomingTrip,
    handleRebookFromCrm,
    handleOpenEmailInDock,
    handleOpenContactEmailInDock,
  };
}
