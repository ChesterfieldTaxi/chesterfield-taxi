import React, { useState } from 'react';
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
    fromEmail: 'amanda.vance@capitalone.com',
    toEmail: 'dispatch@chesterfieldtaxi.com',
    subject: 'Executive Transfer Request - RIC Airport to Capital One Campus (Tomorrow 8:30 AM)',
    timestamp: 'Today, 4:15 PM',
    folder: 'bookings',
    isUnread: true,
    suggestedBooking: {
      passengerName: 'Amanda Vance',
      passengerPhone: '(804) 555-0199',
      passengerEmail: 'amanda.vance@capitalone.com',
      pickupLocation: 'Richmond International Airport (RIC) Terminal South Baggage Claim',
      dropoffLocation: 'Capital One West Creek Campus, 15000 Capital One Dr, Richmond, VA 23238',
      notes: 'Flight DL 1492 from ATL arriving 8:15 AM. Bill to Corporate Account #CP-8821.',
    },
    body: `Hello Chesterfield Taxi Dispatch,

We would like to request an executive sedan transfer for our VP tomorrow morning, September 18th at 8:30 AM.

Details:
• Passenger: Amanda Vance
• Phone: (804) 555-0199
• Pickup: Richmond International Airport (RIC) South Baggage Claim
• Destination: Capital One West Creek Campus, 15000 Capital One Dr, Richmond, VA 23238
• Arriving on Delta DL 1492 from ATL (scheduled 8:15 AM)
• Account: Capital One Corporate #CP-8821

Please reply with confirmation and assigned driver when available.

Best regards,
Amanda Vance
Corporate Travel Coordinator | Capital One`,
  },
  {
    id: 'em-2',
    fromName: 'Dr. Elena Rossi',
    fromEmail: 'elena.rossi@vcuhealth.org',
    toEmail: 'dispatch@chesterfieldtaxi.com',
    subject: 'Transport Booking & Wheelchair Assistance - Gateway Building',
    timestamp: 'Today, 2:40 PM',
    folder: 'bookings',
    isUnread: true,
    suggestedBooking: {
      passengerName: 'Elena Rossi',
      passengerPhone: '(804) 555-0144',
      passengerEmail: 'elena.rossi@vcuhealth.org',
      pickupLocation: 'VCU Health Gateway Building, 1200 E Marshall St, Richmond, VA 23298',
      dropoffLocation: '8401 Patterson Ave, Henrico, VA 23229',
      notes: 'Passenger requires assistance with folding wheelchair trunk storage.',
    },
    body: `Good afternoon,

I need to pre-arrange safe transport for an outpatient discharge scheduled for tomorrow at 11:00 AM.

Pickup Location: VCU Health Gateway Building, 1200 E Marshall St, Richmond, VA 23298
Drop-off Location: 8401 Patterson Ave, Henrico, VA 23229
Passenger: Elena Rossi (Phone: 804-555-0144)

Special requirement: The passenger uses a folding wheelchair that easily fits into a standard sedan trunk. Driver assistance to load wheelchair into trunk is appreciated.

Thank you for your reliable service,
Dr. Elena Rossi`,
  },
  {
    id: 'em-3',
    fromName: 'Marcus Sterling',
    fromEmail: 'marcus.sterling@gmail.com',
    toEmail: 'dispatch@chesterfieldtaxi.com',
    subject: 'Trip Receipt Copy Request - Ride from Short Pump to Downtown (Sep 15)',
    timestamp: 'Yesterday, 6:12 PM',
    folder: 'receipts',
    isUnread: false,
    body: `Hi Chesterfield Taxi Support,

Could you please resend my itemized PDF receipt for trip taken on Sunday, September 15th from Short Pump Town Center to The Jefferson Hotel ($48.50)?

Payment was made with Visa ending in 4242. I need this to submit my weekly expense report by Friday morning.

Thank you,
Marcus Sterling
Mobile: (804) 555-0112`,
  },
  {
    id: 'em-4',
    fromName: 'Sarah Jenkins',
    fromEmail: 'sjenkins@richmondair.com',
    toEmail: 'dispatch@chesterfieldtaxi.com',
    subject: 'Lost Item Inquiry - Grey iPad in Vehicle #12',
    timestamp: 'Yesterday, 3:30 PM',
    folder: 'inbox',
    isUnread: false,
    body: `Hello Dispatch,

My husband took Cab #12 yesterday afternoon from Midlothian Turnpike to RIC Airport (dropped off around 2:15 PM).

He believes he left his grey iPad in a charcoal magnetic folio case in the back seat. The driver was very helpful (we believe his name was David or Marcus).

Could you please check with the driver and let us know if it was recovered?
Contact phone: (804) 555-0178.

Thank you so much!
Sarah Jenkins`,
  },
];

export interface EmailDockProps {
  onClose?: () => void;
  onPopOut?: () => void;
  showWindowControls?: boolean;
  isPopout?: boolean;
  onPopulateBooking?: (bookingData: any) => void;
}

export function EmailDock({
  onClose,
  onPopOut,
  showWindowControls = false,
  isPopout = false,
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
    if (onPopulateBooking) {
      onPopulateBooking({
        passenger: {
          fullName: email.suggestedBooking.passengerName,
          phone: email.suggestedBooking.passengerPhone,
          email: email.suggestedBooking.passengerEmail || email.fromEmail,
        },
        pickupAddress: email.suggestedBooking.pickupLocation,
        dropoffAddress: email.suggestedBooking.dropoffLocation,
        notes: email.suggestedBooking.notes || `Extracted from email: ${email.subject}`,
      });
      showToast('Populated booking draft in Dispatch Console! 🚖');
    }
  };

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedEmail) return;
    const newSentEmail: EmailMessage = {
      id: `sent-${Date.now()}`,
      fromName: 'Chesterfield Dispatch',
      fromEmail: 'dispatch@chesterfieldtaxi.com',
      toEmail: selectedEmail.fromEmail,
      subject: `Re: ${selectedEmail.subject}`,
      timestamp: 'Just now',
      folder: 'sent',
      isUnread: false,
      body: replyText,
    };
    setEmails((prev) => [newSentEmail, ...prev]);
    setReplyText('');
    showToast(`Reply sent to ${selectedEmail.fromEmail}!`);
  };

  const handleSendCompose = () => {
    if (!composeTo.trim() || !composeSubject.trim()) {
      showToast('Please specify recipient and subject');
      return;
    }
    const newSentEmail: EmailMessage = {
      id: `sent-${Date.now()}`,
      fromName: 'Chesterfield Dispatch',
      fromEmail: 'dispatch@chesterfieldtaxi.com',
      toEmail: composeTo,
      subject: composeSubject,
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
    showToast(`Email sent to ${composeTo}!`);
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
    <div className="flex flex-col h-full bg-slate-100 select-none overflow-hidden text-slate-800">
      {/* ─── DOCK HEADER ─── */}
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
            <span>✏️ Compose</span>
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

      {/* ─── FOLDER & SEARCH TOOLBAR ─── */}
      <div className="bg-white border-b border-slate-200 p-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setFolderFilter('all');
              setSelectedEmailId(null);
            }}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              folderFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            📥 Inbox
          </button>
          <button
            type="button"
            onClick={() => {
              setFolderFilter('bookings');
              setSelectedEmailId(null);
            }}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              folderFilter === 'bookings'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>🚕 Bookings</span>
            {bookingCount > 0 && (
              <span className="bg-amber-500 text-white text-[9px] px-1 rounded-full font-black">
                {bookingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setFolderFilter('receipts');
              setSelectedEmailId(null);
            }}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              folderFilter === 'receipts'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            🧾 Receipts
          </button>
          <button
            type="button"
            onClick={() => {
              setFolderFilter('sent');
              setSelectedEmailId(null);
            }}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              folderFilter === 'sent'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            📤 Sent
          </button>
        </div>

        <div className="relative">
          <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search mail..."
            className="pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 w-36 sm:w-44 focus:outline-blue-500"
          />
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
              return (
                <div
                  key={email.id}
                  onClick={() => handleSelectEmail(email)}
                  className={`group relative p-3 transition-all cursor-pointer border-l-4 ${
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
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-fit">
                      <span>🚕 Ride Request</span>
                    </div>
                  )}

                  {/* Quick hover actions */}
                  <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 bg-white/95 shadow-md border border-slate-200 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={(e) => handleToggleRead(email.id, e)}
                      title={email.isUnread ? 'Mark as read' : 'Mark as unread'}
                      className="p-1 hover:bg-slate-100 text-slate-500 hover:text-blue-600 rounded"
                    >
                      <MailIcon className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteEmail(email.id, e)}
                      title="Archive"
                      className="p-1 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded"
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
            {/* Detail Header */}
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEmailId(null)}
                  className="sm:hidden px-2 py-1 rounded bg-white border border-slate-200 text-xs font-bold text-slate-700"
                >
                  ← Back
                </button>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 line-clamp-1">
                    {selectedEmail.subject}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span className="font-bold text-slate-800">{selectedEmail.fromName}</span>
                    <span className="font-mono text-slate-400">&lt;{selectedEmail.fromEmail}&gt;</span>
                    <span>• {selectedEmail.timestamp}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {selectedEmail.suggestedBooking && (
                  <button
                    type="button"
                    onClick={() => handleConvertToBooking(selectedEmail)}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-xs cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
                    title="Populate booking form in Dispatch"
                  >
                    <span>🚕 Convert to Booking</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDeleteEmail(selectedEmail.id)}
                  className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                  title="Archive email"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Email Body */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {selectedEmail.suggestedBooking && (
                <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-blue-900 flex items-center gap-1.5">
                      <span>🎯 Detected Ride Reservation</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleConvertToBooking(selectedEmail)}
                      className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded shadow-2xs cursor-pointer"
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
                className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-blue-500 resize-none"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setReplyText(
                        `Hi ${selectedEmail.fromName},\n\nYour transfer has been received and scheduled. Our driver will contact you upon arrival.\n\nBest,\nChesterfield Taxi Dispatch`
                      )
                    }
                    className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    + Template: Confirmed
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReplyText(
                        `Hi ${selectedEmail.fromName},\n\nAttached is your official itemized trip receipt. Thank you for riding with Chesterfield Taxi!`
                      )
                    }
                    className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    + Template: Receipt
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSendReply}
                  disabled={!replyText.trim()}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
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

      {/* ─── COMPOSE MODAL OVERLAY ─── */}
      {isComposing && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-3 px-4 flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <span>✉️ New Dispatch Email</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsComposing(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">To (Email):</label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="passenger@example.com"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Subject:</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Ride Confirmation / Trip Receipt"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Message:</label>
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Type message here..."
                  rows={6}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsComposing(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendCompose}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer"
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