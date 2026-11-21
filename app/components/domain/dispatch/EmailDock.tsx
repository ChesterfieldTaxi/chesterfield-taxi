import React, { useState, useRef, useCallback } from 'react';
import { getWorkspaceBus } from '../../../core/services/workspace-bus.service';
import { getFirebaseAuthHeaders } from '../../../core/services/auth/auth-headers';
import { escapeHtml } from '../../../core/services/email/email-templates';
import { useBottomSheetDragToClose } from '../../../core/hooks/useBottomSheetDragToClose';
import {
  MailIcon,
  SearchIcon,
  CheckIcon,
  XIcon,
  PhoneIcon,
  ExternalLinkIcon,
  TrashIcon,
  ClockIcon,
  UserIcon,
  CarIcon,
  ChevronLeftIcon,
  PlusIcon,
} from '../../ui/Icons';

export interface EmailMessage {
  id: string;
  fromName: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  timestamp: string;
  folder: 'inbox' | 'bookings' | 'receipts' | 'sent';
  isUnread: boolean;
  suggestedBooking?: {
    passengerName: string;
    passengerPhone: string;
    passengerEmail?: string;
    pickupLocation: string;
    dropoffLocation: string;
    notes?: string;
  };
}

const INITIAL_EMAILS: EmailMessage[] = [
  {
    id: 'em-1',
    fromName: 'Amanda Vance',
    fromEmail: 'amanda.vance@bayer.com',
    toEmail: 'dispatch@chesterfieldtaxi.com',
    subject: 'Executive Transfer Request - STL Airport to Bayer Campus Chesterfield (Tomorrow 8:30 AM)',
    timestamp: 'Today, 4:15 PM',
    folder: 'bookings',
    isUnread: true,
    suggestedBooking: {
      passengerName: 'Amanda Vance',
      passengerPhone: '(314) 555-0199',
      passengerEmail: 'amanda.vance@bayer.com',
      pickupLocation: 'St. Louis Lambert International Airport (STL) Terminal 1 Exit 6',
      dropoffLocation: 'Bayer Crop Science Campus, 700 Chesterfield Pkwy W, Chesterfield, MO 63017',
      notes: 'Flight DL 1492 from ATL arriving 8:15 AM. Bill to Corporate Account #BY-8821.',
    },
    body: `Hello Chesterfield Taxi Dispatch,

We would like to request an executive sedan transfer for our VP tomorrow morning at 8:30 AM.

Details:
• Passenger: Amanda Vance
• Phone: (314) 555-0199
• Pickup: St. Louis Lambert International Airport (STL) Terminal 1 Exit 6
• Destination: Bayer Crop Science Campus, 700 Chesterfield Pkwy W, Chesterfield, MO 63017
• Arriving on Delta DL 1492 from ATL (scheduled 8:15 AM)
• Account: Bayer Corporate #BY-8821

Please reply with confirmation and assigned driver when available.

Best regards,
Amanda Vance
Corporate Travel Coordinator | Bayer Chesterfield`,
  },
  {
    id: 'em-2',
    fromName: 'Dr. Elena Rossi',
    fromEmail: 'elena.rossi@bjc.org',
    toEmail: 'dispatch@chesterfieldtaxi.com',
    subject: 'Transport Booking & Wheelchair Assistance - Barnes-Jewish West County',
    timestamp: 'Today, 2:40 PM',
    folder: 'bookings',
    isUnread: true,
    suggestedBooking: {
      passengerName: 'Elena Rossi',
      passengerPhone: '(314) 555-0144',
      passengerEmail: 'elena.rossi@bjc.org',
      pickupLocation: 'Barnes-Jewish West County Hospital, 12634 Olive Blvd, Creve Coeur, MO 63141',
      dropoffLocation: '14848 Conway Rd, Chesterfield, MO 63017',
      notes: 'Passenger requires assistance with folding wheelchair trunk storage.',
    },
    body: `Good afternoon,

I need to pre-arrange safe transport for an outpatient discharge scheduled for tomorrow at 11:00 AM.

Pickup Location: Barnes-Jewish West County Hospital, 12634 Olive Blvd, Creve Coeur, MO 63141
Drop-off Location: 14848 Conway Rd, Chesterfield, MO 63017
Passenger: Elena Rossi (Phone: 314-555-0144)

Special requirement: The passenger uses a folding wheelchair that easily fits into a standard sedan trunk. Driver assistance to load wheelchair into trunk is appreciated.

Thank you for your reliable service,
Dr. Elena Rossi`,
  },
  {
    id: 'em-3',
    fromName: 'Marcus Sterling',
    fromEmail: 'marcus.sterling@gmail.com',
    toEmail: 'dispatch@chesterfieldtaxi.com',
    subject: 'Trip Receipt Copy Request - Ride from Chesterfield Commons to Clayton',
    timestamp: 'Yesterday, 6:12 PM',
    folder: 'receipts',
    isUnread: false,
    body: `Hi Chesterfield Taxi Support,

Could you please resend my itemized PDF receipt for the trip taken from Chesterfield Commons to The Ritz-Carlton St. Louis in Clayton ($48.50)?

Payment was made with Visa ending in 4242. I need this to submit my weekly expense report by Friday morning.

Thank you,
Marcus Sterling
Mobile: (636) 555-0112`,
  },
  {
    id: 'em-4',
    fromName: 'Sarah Jenkins',
    fromEmail: 'sjenkins@spiritaviation.com',
    toEmail: 'dispatch@chesterfieldtaxi.com',
    subject: 'Lost Item Inquiry - Grey iPad in Vehicle #104',
    timestamp: 'Yesterday, 3:30 PM',
    folder: 'inbox',
    isUnread: false,
    body: `Hello Dispatch,

My husband took Car #104 yesterday afternoon from Clarkson Rd to Spirit of St. Louis Airport (SUS) (dropped off around 2:15 PM).

He believes he left his grey iPad in a charcoal magnetic folio case in the back seat.

Could you please check with the driver and let us know if it was recovered?
Contact phone: (636) 555-0178.

Thank you so much!
Sarah Jenkins`,
  },
];

export interface EmailDockProps {
  onClose?: () => void;
  onPopOut?: () => void;
  showWindowControls?: boolean;
  isPopout?: boolean;
  isDocked?: boolean;
  onPopulateBooking?: (bookingData: any) => void;
}

export function EmailDock({
  onClose,
  onPopOut,
  showWindowControls = false,
  isPopout = false,
  isDocked = false,
  onPopulateBooking,
}: EmailDockProps) {
  const [emails, setEmails] = useState<EmailMessage[]>(INITIAL_EMAILS);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState<'all' | 'bookings' | 'receipts' | 'sent'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Compose state
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');

  // Mobile touch-and-hold quick action sheet
  const [actionSheetEmail, setActionSheetEmail] = useState<EmailMessage | null>(null);
  const [longPressingEmailId, setLongPressingEmailId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextEmailClickRef = useRef<boolean>(false);

  const cancelEmailLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartPosRef.current = null;
    setLongPressingEmailId(null);
  }, []);

  const handleEmailRowTouchStart = useCallback(
    (email: EmailMessage, e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input')) return;
      const touch = e.touches[0];
      longPressStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      setLongPressingEmailId(email.id);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        suppressNextEmailClickRef.current = true;
        setLongPressingEmailId(null);
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(15);
          }
        } catch {}
        setActionSheetEmail(email);
      }, 380);
    },
    []
  );

  const handleEmailRowTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!longPressStartPosRef.current || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - longPressStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - longPressStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        cancelEmailLongPress();
      }
    },
    [cancelEmailLongPress]
  );

  const dismissComposeModal = useCallback(() => setIsComposing(false), []);
  const dismissActionSheet = useCallback(() => setActionSheetEmail(null), []);

  const composeSheetDrag = useBottomSheetDragToClose({ onClose: dismissComposeModal });
  const emailActionSheetDrag = useBottomSheetDragToClose({ onClose: dismissActionSheet });

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSelectEmail = (email: EmailMessage) => {
    setSelectedEmailId(email.id);
    if (email.isUnread) {
      setEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, isUnread: false } : e))
      );
    }
  };

  const handleToggleRead = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEmails((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isUnread: !item.isUnread } : item))
    );
  };

  const handleDeleteEmail = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEmails((prev) => prev.filter((item) => item.id !== id));
    if (selectedEmailId === id) {
      setSelectedEmailId(null);
    }
    showToast('Email archived');
  };

  const handleConvertToBooking = (email: EmailMessage) => {
    if (!email.suggestedBooking) {
      showToast('No structured booking info in this email');
      return;
    }
    const passengerEmail = email.suggestedBooking.passengerEmail || email.fromEmail;
    const notes = email.suggestedBooking.notes || `Extracted from email: ${email.subject}`;
    const payload = {
      passenger: {
        name: email.suggestedBooking.passengerName,
        fullName: email.suggestedBooking.passengerName,
        phone: email.suggestedBooking.passengerPhone,
        email: passengerEmail,
      },
      passengerName: email.suggestedBooking.passengerName,
      passengerPhone: email.suggestedBooking.passengerPhone,
      phone: email.suggestedBooking.passengerPhone,
      passengerEmail,
      email: passengerEmail,
      pickupAddress: email.suggestedBooking.pickupLocation,
      dropoffAddress: email.suggestedBooking.dropoffLocation,
      pickupLocation: { address: email.suggestedBooking.pickupLocation },
      dropoffLocation: { address: email.suggestedBooking.dropoffLocation },
      pickup: email.suggestedBooking.pickupLocation,
      dropoff: email.suggestedBooking.dropoffLocation,
      notes,
    };
    // Publish directly on WorkspaceBus so BOTH docked and popped-out booking drafts hydrate immediately
    getWorkspaceBus().publish('POPULATE_BOOKING', payload);
    if (onPopulateBooking && !isPopout) {
      onPopulateBooking(payload);
    }
    showToast('Populated booking draft in Dispatch Console!');
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedEmail) return;
    const subject = selectedEmail.subject.startsWith('Re:')
      ? selectedEmail.subject
      : `Re: ${selectedEmail.subject}`;
    const safeBody = escapeHtml(replyText).replace(/\n/g, '<br/>');
    try {
      const html = `<div style="font-family:sans-serif;font-size:14px;color:#0f172a;line-height:1.5;">${safeBody}</div>`;
      const authHeaders = await getFirebaseAuthHeaders();
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          type: 'direct',
          recipient: selectedEmail.fromEmail,
          subject,
          text: replyText,
          html,
          payload: {
            recipient: selectedEmail.fromEmail,
            subject,
            text: replyText,
            html,
          },
        }),
      });
      const result = await res.json().catch(() => ({ success: false, error: 'Email dispatch failed' }));
      if (!res.ok || !result?.success) {
        showToast(result?.error || 'Failed to send reply — check email service configuration.');
        return;
      }
      const newSentEmail: EmailMessage = {
        id: `sent-${Date.now()}`,
        fromName: 'Chesterfield Dispatch',
        fromEmail: 'dispatch@chesterfieldtaxi.com',
        toEmail: selectedEmail.fromEmail,
        subject,
        timestamp: 'Just now',
        folder: 'sent',
        isUnread: false,
        body: replyText,
      };
      setEmails((prev) => [newSentEmail, ...prev]);
      setReplyText('');
      showToast(
        result.simulated
          ? `Reply logged (email gateway in local simulation mode)`
          : `Reply delivered to ${selectedEmail.fromEmail}!`
      );
    } catch {
      showToast('Network error sending email reply.');
    }
  };

  const handleSendCompose = async () => {
    if (!composeTo.trim() || !composeSubject.trim()) {
      showToast('Please specify recipient and subject');
      return;
    }
    const safeBody = escapeHtml(composeBody).replace(/\n/g, '<br/>');
    try {
      const recipient = composeTo.trim();
      const subject = composeSubject.trim();
      const html = `<div style="font-family:sans-serif;font-size:14px;color:#0f172a;line-height:1.5;">${safeBody}</div>`;
      const authHeaders = await getFirebaseAuthHeaders();
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          type: 'direct',
          recipient,
          subject,
          text: composeBody,
          html,
          payload: {
            recipient,
            subject,
            text: composeBody,
            html,
          },
        }),
      });
      const result = await res.json().catch(() => ({ success: false, error: 'Email dispatch failed' }));
      if (!res.ok || !result?.success) {
        showToast(result?.error || 'Failed to send email — check email service configuration.');
        return;
      }
      const newSentEmail: EmailMessage = {
        id: `sent-${Date.now()}`,
        fromName: 'Chesterfield Dispatch',
        fromEmail: 'dispatch@chesterfieldtaxi.com',
        toEmail: composeTo.trim(),
        subject: composeSubject.trim(),
        timestamp: 'Just now',
        folder: 'sent',
        isUnread: false,
        body: composeBody,
      };
      setEmails((prev) => [newSentEmail, ...prev]);
      setIsComposing(false);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      showToast(
        result.simulated
          ? `Email logged (email gateway in local simulation mode)`
          : `Email delivered to ${newSentEmail.toEmail}!`
      );
    } catch {
      showToast('Network error sending email.');
    }
  };

  const filteredEmails = emails.filter((item) => {
    if (folderFilter !== 'all' && item.folder !== folderFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.fromName.toLowerCase().includes(q);
      const matchEmail = item.fromEmail.toLowerCase().includes(q);
      const matchSubj = item.subject.toLowerCase().includes(q);
      const matchBody = item.body.toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchSubj && !matchBody) return false;
    }
    return true;
  });

  const unreadCount = emails.filter((e) => e.isUnread).length;
  const bookingCount = emails.filter((e) => e.folder === 'bookings' && e.isUnread).length;

  return (
    <div className="flex flex-col h-full bg-white select-none overflow-hidden text-slate-800">
      {/* ─── DOCK HEADER (hidden when embedded in Dispatch Drawer to prevent double headers) ─── */}
      {!isDocked && (
        <div className="bg-slate-900 text-white p-3 flex items-center justify-between shadow-xs shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <MailIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm tracking-tight text-white">Email Console</span>
                {unreadCount > 0 && (
                  <span className="bg-blue-600 text-[10px] font-black px-1.5 py-0.2 rounded-full text-white">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">dispatch@chesterfieldtaxi.com</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsComposing(true)}
              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1"
              title="Compose new email"
            >
              <span>+ Compose</span>
            </button>

            {!isPopout && onPopOut && (
              <button
                type="button"
                onClick={onPopOut}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Pop out into floating window"
              >
                <ExternalLinkIcon className="w-4 h-4" />
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close panel"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-150">
          <div className="flex items-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5" />
            <span>{toastMessage}</span>
          </div>
          <button type="button" onClick={() => setToastMessage(null)} className="text-emerald-200 hover:text-white">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── COMPACT FOLDER & SEARCH TOOLBAR ─── */}
      <div className="bg-white border-b border-slate-200/80 px-2.5 py-2 space-y-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search mail..."
              className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50/70 focus:bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400"
            />
          </div>
          {isDocked && (
            <button
              type="button"
              onClick={() => setIsComposing(true)}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold transition-colors cursor-pointer shrink-0"
              title="Compose new email"
            >
              + Compose
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1 bg-slate-100/90 p-0.5 rounded-xl text-center">
          {(
            [
              { key: 'all', label: 'Inbox', count: unreadCount },
              { key: 'bookings', label: 'Bookings', count: bookingCount },
              { key: 'receipts', label: 'Receipts', count: 0 },
              { key: 'sent', label: 'Sent', count: 0 },
            ] as const
          ).map((folder) => (
            <button
              key={folder.key}
              type="button"
              onClick={() => {
                setFolderFilter(folder.key);
                setSelectedEmailId(null);
              }}
              className={`py-1 px-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                folderFilter === folder.key
                  ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="truncate">{folder.label}</span>
              {folder.count > 0 && (
                <span className="bg-blue-600 text-white text-[9px] px-1 rounded-full font-black">
                  {folder.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── MAIN BODY (LIST & PREVIEW PANE) ─── */}
      <div className="flex-1 min-h-0 flex flex-col sm:flex-row overflow-hidden bg-white">
        {/* EMAIL LIST */}
        <div
          className={`divide-y divide-slate-100 overflow-y-auto ${
            selectedEmail ? 'hidden sm:block sm:w-72 border-r border-slate-200 shrink-0' : 'flex-1'
          }`}
        >
          {filteredEmails.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">No emails in this view.</div>
          ) : (
            filteredEmails.map((email) => {
              const isSelected = selectedEmailId === email.id;
              const isPressing = longPressingEmailId === email.id;
              return (
                <div
                  key={email.id}
                  onTouchStart={(e) => handleEmailRowTouchStart(email, e)}
                  onTouchMove={handleEmailRowTouchMove}
                  onTouchEnd={cancelEmailLongPress}
                  onTouchCancel={cancelEmailLongPress}
                  onClick={() => {
                    if (suppressNextEmailClickRef.current) {
                      suppressNextEmailClickRef.current = false;
                      return;
                    }
                    handleSelectEmail(email);
                  }}
                  className={`group relative p-3 transition-all cursor-pointer border-l-4 select-none ${
                    isPressing ? 'scale-[0.985] bg-blue-50/80' : ''
                  } ${
                    isSelected
                      ? 'bg-blue-50 border-l-blue-600 shadow-2xs'
                      : email.isUnread
                      ? 'bg-blue-50/50 hover:bg-blue-100/40 border-l-blue-600'
                      : 'bg-white hover:bg-slate-50 border-l-transparent text-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {email.isUnread && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 shadow-[0_0_6px_rgba(37,99,235,0.8)]" />
                      )}
                      <span
                        className={`text-xs truncate ${
                          email.isUnread ? 'font-black text-slate-900' : 'font-bold text-slate-800'
                        }`}
                      >
                        {email.fromName}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">{email.timestamp}</span>
                  </div>

                  <h4
                    className={`text-xs mt-1 truncate ${
                      email.isUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'
                    }`}
                  >
                    {email.subject}
                  </h4>

                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{email.body}</p>

                  {email.suggestedBooking && (
                    <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <CarIcon className="w-3 h-3 shrink-0" />
                      <span>Ride Request</span>
                    </div>
                  )}

                  {/* Quick hover actions (desktop) */}
                  <div className="absolute right-2 top-2 hidden sm:group-hover:flex items-center gap-1 bg-white/95 shadow-md border border-slate-200 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={(e) => handleToggleRead(email.id, e)}
                      title={email.isUnread ? 'Mark as read' : 'Mark as unread'}
                      className="p-1 hover:bg-slate-100 text-slate-500 hover:text-blue-600 rounded cursor-pointer"
                    >
                      <MailIcon className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteEmail(email.id, e)}
                      title="Archive"
                      className="p-1 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded cursor-pointer"
                    >
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* EMAIL DETAIL VIEW PANE */}
        {selectedEmail ? (
          <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
            {/* Detail Header (Stacked cleanly on mobile so nothing ever clips or wraps vertically) */}
            <div className="p-3 border-b border-slate-200 bg-slate-50/90 space-y-2 shrink-0">
              {/* Row 1: Mobile Back + Primary Actions */}
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedEmailId(null)}
                    className="sm:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 active:bg-slate-100 cursor-pointer shrink-0 shadow-2xs"
                  >
                    <ChevronLeftIcon className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <h3 className="hidden sm:block font-extrabold text-sm text-slate-900 truncate">
                    {selectedEmail.subject}
                  </h3>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedEmail.suggestedBooking && (
                    <button
                      type="button"
                      onClick={() => handleConvertToBooking(selectedEmail)}
                      className="px-3 py-1.5 rounded-xl sm:rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-xs cursor-pointer inline-flex items-center gap-1.5 transition-all active:scale-95 whitespace-nowrap"
                      title="Populate booking form in Dispatch"
                    >
                      <CarIcon className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">Book Ride</span>
                      <span className="hidden sm:inline">Convert to Booking</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteEmail(selectedEmail.id)}
                    className="p-2 sm:p-1.5 rounded-xl sm:rounded-lg bg-white sm:bg-transparent border border-slate-200 sm:border-transparent hover:bg-rose-50 text-slate-500 sm:text-slate-400 hover:text-rose-600 hover:border-rose-200 transition-colors cursor-pointer shrink-0"
                    title="Archive email"
                    aria-label="Archive email"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Row 2: Subject (mobile) + Sender & Timestamp */}
              <div className="min-w-0 space-y-0.5">
                <h3 className="sm:hidden font-extrabold text-sm text-slate-900 leading-snug">
                  {selectedEmail.subject}
                </h3>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500 min-w-0">
                  <span className="font-bold text-slate-800">{selectedEmail.fromName}</span>
                  <span className="font-mono text-slate-400 truncate max-w-full">
                    &lt;{selectedEmail.fromEmail}&gt;
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500 shrink-0">{selectedEmail.timestamp}</span>
                </div>
              </div>
            </div>

            {/* Email Body */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {selectedEmail.suggestedBooking && (
                <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-blue-900 inline-flex items-center gap-1.5 min-w-0">
                      <CarIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">Detected Ride Reservation</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleConvertToBooking(selectedEmail)}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg shadow-2xs cursor-pointer shrink-0"
                    >
                      Fill Booking Form
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Passenger:</span>
                      <span className="font-bold text-slate-800">
                        {selectedEmail.suggestedBooking.passengerName} (
                        {selectedEmail.suggestedBooking.passengerPhone})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Pickup:</span>
                      <span className="font-bold text-slate-800">
                        {selectedEmail.suggestedBooking.pickupLocation}
                      </span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-slate-500 block">Destination:</span>
                      <span className="font-bold text-slate-800">
                        {selectedEmail.suggestedBooking.dropoffLocation}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="prose prose-sm max-w-none text-slate-800 whitespace-pre-wrap leading-relaxed text-xs">
                {selectedEmail.body}
              </div>
            </div>

            {/* Reply Footer */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 space-y-2 shrink-0">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${selectedEmail.fromName}...`}
                rows={2}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-blue-500 resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() =>
                      setReplyText(
                        `Hi ${selectedEmail.fromName},\n\nYour transfer has been received and scheduled. Our driver will contact you upon arrival.\n\nBest,\nChesterfield Taxi Dispatch`
                      )
                    }
                    className="px-2 py-1 rounded-lg bg-blue-50 text-[10.5px] font-bold text-blue-700 hover:bg-blue-100 cursor-pointer"
                  >
                    + Confirmed
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReplyText(
                        `Hi ${selectedEmail.fromName},\n\nAttached is your official itemized trip receipt. Thank you for riding with Chesterfield Taxi!`
                      )
                    }
                    className="px-2 py-1 rounded-lg bg-blue-50 text-[10.5px] font-bold text-blue-700 hover:bg-blue-100 cursor-pointer"
                  >
                    + Receipt
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSendReply}
                  disabled={!replyText.trim()}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer shrink-0"
                >
                  Send Reply
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden sm:flex flex-1 items-center justify-center p-8 text-center text-slate-400 bg-slate-50/50">
            <div className="space-y-2">
              <MailIcon className="w-10 h-10 mx-auto text-slate-300" />
              <p className="font-bold text-slate-600 text-xs">Select an email to view details</p>
              <p className="text-[11px] text-slate-400">
                You can review requests and convert booking inquiries directly into taxi dispatches.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── MOBILE EMAIL QUICK ACTION BOTTOM SHEET (Touch & hold on email row) ─── */}
      {actionSheetEmail && (
        <div
          className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={dismissActionSheet}
        >
          <div
            style={emailActionSheetDrag.sheetStyle}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0"
          >
            <div
              {...emailActionSheetDrag.dragHandlers}
              className="bg-slate-900 text-white px-4 pt-2 pb-3.5 touch-none"
            >
              <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-white truncate">{actionSheetEmail.fromName}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{actionSheetEmail.subject}</p>
                </div>
                <button
                  type="button"
                  onClick={dismissActionSheet}
                  className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white cursor-pointer shrink-0"
                  aria-label="Close email actions"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-2">
              {actionSheetEmail.suggestedBooking && (
                <button
                  type="button"
                  onClick={() => {
                    const target = actionSheetEmail;
                    setActionSheetEmail(null);
                    handleConvertToBooking(target);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <CarIcon className="w-4 h-4" />
                  <span>Convert to Booking</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = actionSheetEmail;
                    setActionSheetEmail(null);
                    handleSelectEmail(target);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MailIcon className="w-4 h-4" />
                  <span>Open Email</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    const id = actionSheetEmail.id;
                    setActionSheetEmail(null);
                    handleToggleRead(id, e);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckIcon className="w-4 h-4" />
                  <span>{actionSheetEmail.isUnread ? 'Mark Read' : 'Mark Unread'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  const id = actionSheetEmail.id;
                  setActionSheetEmail(null);
                  handleDeleteEmail(id, e);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <TrashIcon className="w-4 h-4" />
                <span>Archive Email</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── COMPOSE MODAL / MOBILE BOTTOM SHEET OVERLAY ─── */}
      {isComposing && (
        <div
          className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={dismissComposeModal}
        >
          <div
            style={composeSheetDrag.sheetStyle}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90dvh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0"
          >
            <div
              {...composeSheetDrag.dragHandlers}
              className="bg-slate-900 text-white px-4 pt-2 sm:pt-3 pb-3 flex flex-col touch-none shrink-0"
            >
              <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2 sm:hidden" aria-hidden="true" />
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm flex items-center gap-2">
                  <MailIcon className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>New Dispatch Email</span>
                </h3>
                <button
                  type="button"
                  onClick={dismissComposeModal}
                  className="p-1 rounded-full text-slate-400 hover:text-white cursor-pointer"
                  aria-label="Close compose email"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">To (Email):</label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="passenger@example.com"
                  className="w-full text-xs p-2.5 sm:p-2 rounded-xl sm:rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Subject:</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Ride Confirmation / Trip Receipt"
                  className="w-full text-xs p-2.5 sm:p-2 rounded-xl sm:rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Message:</label>
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Type message here..."
                  rows={6}
                  className="w-full text-xs p-2.5 sm:p-2 rounded-xl sm:rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={dismissComposeModal}
                className="px-3.5 py-2 sm:py-1.5 rounded-xl sm:rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendCompose}
                className="px-4 py-2 sm:py-1.5 rounded-xl sm:rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}