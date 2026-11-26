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
          ? 'border-status-warning-border bg-status-warning-bg/70 shadow-2xs'
          : m.priority === 'urgent'
          ? m.isRead
            ? 'bg-status-danger-bg/40 border-status-danger-border text-status-danger-fg'
            : 'bg-status-danger-bg border-status-danger-border text-status-danger-fg border-l-4 border-l-rose-600 shadow-2xs'
          : m.isRead
          ? 'bg-surface-subtle/70 border-border-subtle text-fg-secondary'
          : 'bg-surface-card border-border-subtle text-fg-strong border-l-4 border-l-blue-600 shadow-2xs'
      }`}
    >
      {/* Top Header: Recipient, Priority, Pinned Badge, Unread Dot, Timestamp */}
      <div className="flex items-center justify-between font-bold text-[10px] mb-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {m.isPinned && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-status-warning-bg-strong/90 text-status-warning-fg font-black text-[9px]">
              📌 Pinned
            </span>
          )}
          {!m.isRead && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block" title="Unread alert" />
          )}
          <span className="text-fg-secondary">
            To: <span className="font-extrabold text-fg-primary">{m.to}</span>
          </span>
          {m.priority === 'urgent' && (
            <span className="text-rose-600 font-extrabold uppercase text-[9px] bg-status-danger-bg-strong px-1 py-0.2 rounded">
              Urgent
            </span>
          )}
        </div>
        <span className="text-fg-subtle font-mono text-[10px] shrink-0">{m.timestamp}</span>
      </div>

      {/* Message Text */}
      <p className={`text-xs leading-snug pr-12 ${m.isRead ? 'text-fg-secondary font-normal' : 'text-fg-primary font-medium'}`}>
        {m.text}
      </p>

      {/* Action Toolbar (always accessible on touch/keyboard; hover-revealed on desktop) */}
      <div className="mt-2 pt-1.5 border-t border-border-subtle/60 flex items-center justify-end gap-1 sm:mt-0 sm:pt-0 sm:border-0 sm:absolute sm:bottom-1.5 sm:right-1.5 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity sm:bg-surface-card/95 sm:backdrop-blur-xs sm:px-1 sm:py-0.5 sm:rounded-lg sm:shadow-md sm:border sm:border-border-subtle z-10">
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
              ? 'bg-status-warning-bg-strong text-status-warning-fg hover:bg-status-warning-bg-strong'
              : 'text-fg-secondary hover:text-status-warning-fg hover:bg-surface-muted'
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
              ? 'text-fg-secondary hover:text-blue-600 hover:bg-surface-muted'
              : 'bg-status-info-bg text-status-info-fg hover:bg-status-info-bg-strong'
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
          className="px-1.5 py-0.5 rounded text-[10px] font-bold text-fg-subtle hover:text-rose-600 hover:bg-status-danger-bg transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
