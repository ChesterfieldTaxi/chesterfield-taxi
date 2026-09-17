import React from 'react';

export interface DispatchMessageItem {
  id: string;
  to: string;
  text: string;
  timestamp: string;
  createdAt: number;
  priority: 'normal' | 'urgent';
  isPinned?: boolean;
  isRead?: boolean;
}

export interface FleetAlertCardProps {
  message: DispatchMessageItem;
  onTogglePin: (id: string) => void;
  onToggleRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function FleetAlertCard({
  message: m,
  onTogglePin,
  onToggleRead,
  onDismiss,
}: FleetAlertCardProps) {
  return (
    <div
      className={`group relative p-2.5 rounded-xl border text-xs transition-all ${
        m.isPinned
          ? 'border-amber-400 bg-amber-50/70 shadow-2xs'
          : m.priority === 'urgent'
          ? m.isRead
            ? 'bg-rose-50/40 border-rose-200 text-rose-950'
            : 'bg-rose-50 border-rose-300 text-rose-900 border-l-4 border-l-rose-600 shadow-2xs'
          : m.isRead
          ? 'bg-slate-50/70 border-slate-200 text-slate-600'
          : 'bg-white border-slate-200 text-slate-800 border-l-4 border-l-blue-600 shadow-2xs'
      }`}
    >
      {/* Top Header: Recipient, Priority, Pinned Badge, Unread Dot, Timestamp */}
      <div className="flex items-center justify-between font-bold text-[10px] mb-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {m.isPinned && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-200/90 text-amber-950 font-black text-[9px]">
              📌 Pinned
            </span>
          )}
          {!m.isRead && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block" title="Unread alert" />
          )}
          <span className="text-slate-600">
            To: <span className="font-extrabold text-slate-900">{m.to}</span>
          </span>
          {m.priority === 'urgent' && (
            <span className="text-rose-600 font-extrabold uppercase text-[9px] bg-rose-100 px-1 py-0.2 rounded">
              Urgent
            </span>
          )}
        </div>
        <span className="text-slate-400 font-mono text-[10px] shrink-0">{m.timestamp}</span>
      </div>

      {/* Message Text */}
      <p className={`text-xs leading-snug pr-12 ${m.isRead ? 'text-slate-600 font-normal' : 'text-slate-900 font-medium'}`}>
        {m.text}
      </p>

      {/* Hover Action Overlay */}
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white/95 backdrop-blur-xs px-1 py-0.5 rounded-lg shadow-md border border-slate-200 z-10">
        {/* Pin / Unpin Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(m.id);
          }}
          title={m.isPinned ? 'Unpin alert (subject to auto-dismissal)' : 'Pin alert (retains at top, excludes from auto-dismiss)'}
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-0.5 ${
            m.isPinned
              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
              : 'text-slate-600 hover:text-amber-700 hover:bg-slate-100'
          }`}
        >
          <span>📌</span>
          <span>{m.isPinned ? 'Unpin' : 'Pin'}</span>
        </button>

        {/* Read / Unread Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleRead(m.id);
          }}
          title={m.isRead ? 'Mark alert as unread' : 'Mark alert as read'}
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-0.5 ${
            m.isRead
              ? 'text-slate-600 hover:text-blue-600 hover:bg-slate-100'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
        >
          <span>{m.isRead ? '✉️' : '✓'}</span>
          <span>{m.isRead ? 'Unread' : 'Read'}</span>
        </button>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(m.id);
          }}
          title="Dismiss alert immediately"
          className="px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
