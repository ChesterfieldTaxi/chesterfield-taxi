import type React from 'react';
import {
  ChatBubbleLeftRightIcon,
  CheckIcon,
  MailIcon,
  MailOpenIcon,
  MicIcon,
  PencilIcon,
  PhoneIcon,
  PhoneOffIcon,
  UserIcon,
} from '../../../ui/Icons';
import { resolveContactAvatarSpec } from './comms-timeline.util';
import type { InteractionEvent } from './comms-types';

export interface CommsContactAvatarProps {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  fallbackId?: string | null;
  rowKey?: string;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  onToggleSelect?: (key: string) => void;
  selectionAriaLabel?: string;
}

/**
 * Shared w-8 h-8 rounded-full pastel avatar (First+Last initials or UserIcon fallback)
 * with an optional hover/selection checkbox overlay for bulk actions.
 */
export function CommsContactAvatar({
  name,
  phone,
  email,
  fallbackId,
  rowKey,
  isSelected = false,
  isSelectionMode = false,
  onToggleSelect,
  selectionAriaLabel,
}: CommsContactAvatarProps) {
  const spec = resolveContactAvatarSpec({
    name,
    phone,
    email,
    fallbackId: fallbackId || rowKey,
  });

  return (
    <div className="relative w-8 h-8 shrink-0">
      <div
        data-comms-avatar="true"
        data-avatar-initials={spec.initials || 'icon'}
        className={`w-8 h-8 rounded-full font-bold text-[11px] flex items-center justify-center select-none ${spec.toneClass}`}
      >
        {spec.initials ? spec.initials : <UserIcon className="w-3.5 h-3.5" />}
      </div>
      {onToggleSelect && rowKey && (
        <button
          type="button"
          data-row-checkbox={rowKey}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(rowKey);
          }}
          aria-label={selectionAriaLabel || (isSelected ? 'Deselect item' : 'Select item')}
          className={`absolute inset-0 rounded-full flex items-center justify-center transition-opacity cursor-pointer ${
            isSelected || isSelectionMode
              ? 'opacity-100 bg-white/95'
              : 'opacity-0 group-hover:opacity-100 bg-white/95'
          }`}
        >
          <span
            className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-400'
            }`}
          >
            {isSelected && <CheckIcon className="w-2.5 h-2.5 stroke-[3]" />}
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * Shared inline colored channel/direction icon for Row 2 of unified 2-row Comms Hub entries.
 */
export function CommsChannelDirectionIcon({
  type,
  className = 'w-3 h-3 shrink-0',
}: {
  type: InteractionEvent['type'];
  className?: string;
}) {
  if (type === 'call_missed') return <PhoneOffIcon className={`${className} text-rose-600`} />;
  if (type === 'call_outbound') return <PhoneIcon className={`${className} text-blue-600`} />;
  if (type.startsWith('call_')) return <PhoneIcon className={`${className} text-emerald-600`} />;
  if (type === 'voicemail') return <MicIcon className={`${className} text-amber-600`} />;
  if (type.startsWith('email_')) return <MailIcon className={`${className} text-indigo-600`} />;
  if (type === 'internal_note') return <PencilIcon className={`${className} text-amber-600`} />;
  return <ChatBubbleLeftRightIcon className={`${className} text-blue-600`} />;
}

/**
 * Row-1 right-aligned timestamp with hover-only Mark Read/Unread overlay
 * positioned directly over the timestamp without shifting or resizing the row.
 */
export function CommsTimestampWithHoverReadToggle({
  rowKey,
  timestampLabel,
  isUnread,
  onToggleRowReadStatus,
}: {
  rowKey: string;
  timestampLabel: string;
  isUnread: boolean;
  onToggleRowReadStatus?: (key: string, currentlyUnread: boolean) => void;
}) {
  return (
    <div
      className="relative inline-flex items-center justify-end shrink-0 h-5"
      onClick={(e) => {
        if (onToggleRowReadStatus) e.stopPropagation();
      }}
    >
      <span
        className={`text-[10px] font-mono text-slate-400 whitespace-nowrap transition-opacity ${
          onToggleRowReadStatus ? 'group-hover:opacity-0' : ''
        }`}
      >
        {timestampLabel}
      </span>
      {onToggleRowReadStatus && (
        <button
          type="button"
          data-row-read-toggle={rowKey}
          onClick={(e) => {
            e.stopPropagation();
            onToggleRowReadStatus(rowKey, isUnread);
          }}
          title={isUnread ? 'Mark as Read' : 'Mark as Unread'}
          aria-label={isUnread ? 'Mark as Read' : 'Mark as Unread'}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 absolute right-0 top-1/2 -translate-y-1/2 w-6 h-5 rounded-md bg-white/95 shadow-2xs ring-1 ring-slate-200 hover:bg-blue-600 text-slate-600 hover:text-white flex items-center justify-center transition-opacity cursor-pointer"
        >
          {isUnread ? <MailOpenIcon className="w-3 h-3" /> : <MailIcon className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
}
