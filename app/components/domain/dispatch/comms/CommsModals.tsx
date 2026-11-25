import React, { useEffect, useState } from 'react';
import {
  buildInterpolatedCommsSmsChips,
  type CommsCrmContextSummary,
} from '../../../../core/services/comms/comms-templates.service';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import type { ContactRecord } from '../../../../core/services/customer/contact.service';
import type { AppSettings } from '../../../../core/types/config';
import { formatDisplayPhone } from '../../../../core/utils/phone';
import { FloatingWindow } from '../../../ui/FloatingWindow';
import {
  ChatBubbleLeftRightIcon,
  CreditCardIcon,
  LinkIcon,
  PhoneIcon,
  SparklesIcon,
  SpinnerIcon,
} from '../../../ui/Icons';
import { Select } from '../../../ui/Select';
import type { CommsSheetDragProps } from './comms-types';

export interface AgentPhoneSetupModalProps {
  isOpen: boolean;
  pendingCallTarget: { phone: string; name?: string } | null;
  setupAgentPhoneInput: string;
  setupAgentPhoneError: string | null;
  onChangeSetupAgentPhoneInput: (val: string) => void;
  onSaveAndCall: () => void;
  onClose: () => void;
  sheetDrag?: CommsSheetDragProps;
}

export function AgentPhoneSetupModal({
  isOpen,
  pendingCallTarget,
  setupAgentPhoneInput,
  setupAgentPhoneError,
  onChangeSetupAgentPhoneInput,
  onSaveAndCall,
  onClose,
}: AgentPhoneSetupModalProps) {
  if (!isOpen) return null;
  return (
    <FloatingWindow
      id="comms_agent_phone_setup"
      isOpen={isOpen}
      onClose={onClose}
      hasBackdrop={false}
      title="Set Dispatcher Line"
      subtitle="Connect your phone to speak live"
      icon={<PhoneIcon className="w-4 h-4 text-blue-400" />}
      initialSize={{ width: 400, height: 290 }}
      autoHeight
      minWidth={330}
      minHeight={210}
      isResizable={false}
      isMaximizable={false}
      zIndex={225}
      footer={
        <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-200/70 cursor-pointer">
            Cancel
          </button>
          <button type="button" onClick={onSaveAndCall} className="px-3.5 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5">
            <PhoneIcon className="w-3.5 h-3.5" />
            <span>Save &amp; Call Now</span>
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-2.5">
        <p className="text-xs text-slate-600 leading-relaxed">
          To bridge a call with <strong className="text-slate-900">{pendingCallTarget?.name || pendingCallTarget?.phone}</strong>, enter your mobile or desk line.
        </p>
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-700 block">Your Agent Phone:</label>
          <input
            type="tel"
            autoFocus
            placeholder="(314) 555-0100"
            value={setupAgentPhoneInput}
            onChange={(e) => onChangeSetupAgentPhoneInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSaveAndCall(); }}
            className={`w-full px-3 py-1.5 text-sm rounded-xl border font-mono bg-white focus:outline-blue-500 ${setupAgentPhoneError ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300'}`}
          />
          {setupAgentPhoneError && <p className="text-[10px] text-rose-600 font-semibold">{setupAgentPhoneError}</p>}
        </div>
      </div>
    </FloatingWindow>
  );
}

export interface NewSmsMessageModalProps {
  isOpen: boolean;
  newMsgError: string | null;
  msgContactSearch: string;
  newMsgRecipientPhone: string;
  newMsgRecipientName: string;
  newMsgBody: string;
  isSendingNewMsg: boolean;
  isMsgContactDropdownOpen: boolean;
  filteredContactsForMsg: ContactRecord[];
  recipientCrmContext?: CommsCrmContextSummary | null;
  onInsertTrackingLink?: () => void;
  onInsertPayLink?: () => void;
  isGeneratingPayLink?: boolean;
  onRecipientInputChange: (val: string) => void;
  onRecipientInputFocus: () => void;
  onSelectContactOption: (contact: ContactRecord) => void;
  onBodyChange: (val: string) => void;
  onSelectPresetChip: (preset: string) => void;
  onOpenThread: () => void;
  onSend: () => void;
  onClose: () => void;
  sheetDrag?: CommsSheetDragProps;
}

export function NewSmsMessageModal({
  isOpen, newMsgError, msgContactSearch, newMsgRecipientPhone, newMsgRecipientName,
  newMsgBody, isSendingNewMsg, isMsgContactDropdownOpen, filteredContactsForMsg,
  recipientCrmContext, onInsertTrackingLink, onInsertPayLink, isGeneratingPayLink = false,
  onRecipientInputChange, onRecipientInputFocus, onSelectContactOption, onBodyChange,
  onSelectPresetChip, onOpenThread, onSend, onClose,
}: NewSmsMessageModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [appSettings, setAppSettings] = useState<Partial<AppSettings> | null>(null);
  useEffect(() => getAdminConfigService().subscribeToSettings((s) => setAppSettings(s)), []);
  const dynamicChips = React.useMemo(
    () => buildInterpolatedCommsSmsChips(recipientCrmContext?.templateContext, appSettings),
    [recipientCrmContext?.templateContext, appSettings]
  );
  if (!isOpen) return null;

  const hasMatchedTrip = Boolean(recipientCrmContext?.primaryMatchedTrip);
  const recipientPreview = newMsgRecipientName || (newMsgRecipientPhone ? formatDisplayPhone(newMsgRecipientPhone) : '');

  return (
    <FloatingWindow
      id="comms_new_sms"
      isOpen={isOpen}
      onClose={onClose}
      hasBackdrop={false}
      title="New Text Message"
      subtitle={recipientPreview ? `To: ${recipientPreview}` : 'SMS Dispatch'}
      icon={<ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-400" />}
      initialSize={{ width: 460, height: 380 }}
      autoHeight
      minWidth={340}
      minHeight={260}
      zIndex={225}
      footer={
        <div className="px-3 py-2 bg-slate-50 flex items-center justify-between gap-2">
          <button type="button" onClick={onOpenThread} className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-blue-700 cursor-pointer">
            Open Thread
          </button>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onClose} className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer">
              Close
            </button>
            <button type="button" disabled={isSendingNewMsg || !newMsgBody.trim()} onClick={onSend} className="px-3.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-45 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer">
              {isSendingNewMsg && <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSendingNewMsg ? 'Sending...' : 'Send SMS'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="p-3 space-y-2">
        {newMsgError && <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{newMsgError}</div>}
        <div className="relative flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 w-8 shrink-0">To:</span>
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={msgContactSearch || newMsgRecipientPhone}
              onChange={(e) => onRecipientInputChange(e.target.value)}
              onFocus={onRecipientInputFocus}
              placeholder="Name or 10-digit mobile..."
              className="w-full text-xs px-2.5 py-1.5 pr-24 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500"
            />
            {newMsgRecipientName && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded pointer-events-none max-w-[92px] truncate">{newMsgRecipientName}</span>}
            {isMsgContactDropdownOpen && filteredContactsForMsg.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                {filteredContactsForMsg.map((c) => (
                  <button key={c.id} type="button" onMouseDown={(e) => { e.preventDefault(); onSelectContactOption(c); }} className="w-full px-3 py-1.5 text-left hover:bg-blue-50/70 flex items-center justify-between gap-2 text-xs cursor-pointer">
                    <span className="font-bold text-slate-900 truncate">{c.name}</span>
                    <span className="text-[11px] font-mono text-slate-500 shrink-0">{formatDisplayPhone(c.mobilePhone || c.phone)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap bg-slate-50 p-1.5 rounded-lg border border-slate-200/80">
          <div className="flex items-center gap-1 min-w-[150px] flex-1">
            <SparklesIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <Select size="xs" value={selectedTemplateId} onChange={(e) => { const m = dynamicChips.find((c) => c.id === e.target.value); if (m) { onSelectPresetChip(m.text); setSelectedTemplateId(''); } }} aria-label="Insert canned dispatch SMS template">
              <option value="">+ Canned Template...</option>
              {dynamicChips.map((chip) => <option key={chip.id} value={chip.id}>{chip.shortLabel}</option>)}
            </Select>
          </div>
          {hasMatchedTrip && onInsertTrackingLink && (
            <button type="button" onClick={onInsertTrackingLink} className="px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[10.5px] font-bold text-blue-700 inline-flex items-center gap-1 cursor-pointer">
              <LinkIcon className="w-3 h-3" /><span>+ Tracking</span>
            </button>
          )}
          {hasMatchedTrip && onInsertPayLink && (
            <button type="button" disabled={isGeneratingPayLink} onClick={onInsertPayLink} className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[10.5px] font-bold text-emerald-800 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50">
              <CreditCardIcon className="w-3 h-3" /><span>+ Pay</span>
            </button>
          )}
        </div>
        <textarea rows={3} value={newMsgBody} onChange={(e) => onBodyChange(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSend(); } }} placeholder="Write text message..." className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500 resize-y" />
      </div>
    </FloatingWindow>
  );
}
