import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildInterpolatedCommsSmsChips, type CommsSmsTemplateContext } from '../../../../core/services/comms/comms-templates.service';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import type { AppSettings } from '../../../../core/types/config';
import { formatDisplayPhone } from '../../../../core/utils/phone';
import { ChevronDownIcon, CreditCardIcon, LinkIcon, SparklesIcon, SpinnerIcon } from '../../../ui/Icons';

export interface CommsComposerBarProps {
  effectivePhone?: string;
  voiceOnlyMode?: boolean;
  templateContext?: CommsSmsTemplateContext;
  hasMatchedTrip?: boolean;
  smsReplyText: string;
  onChangeSmsReplyText: (val: string) => void;
  onSendSms: () => void;
  isSendingSms: boolean;
  noteDraftText: string;
  onChangeNoteDraftText: (val: string) => void;
  onAddInternalNote: () => void;
  onInsertTrackingLink?: () => void;
  onInsertPayLink?: () => void;
  isGeneratingPayLink?: boolean;
  smsStatusMessage?: string | null;
}

export function CommsComposerBar({
  effectivePhone = '', voiceOnlyMode, templateContext, hasMatchedTrip = false,
  smsReplyText, onChangeSmsReplyText, onSendSms, isSendingSms,
  noteDraftText, onChangeNoteDraftText, onAddInternalNote,
  onInsertTrackingLink, onInsertPayLink, isGeneratingPayLink = false, smsStatusMessage,
}: CommsComposerBarProps) {
  const [appSettings, setAppSettings] = useState<Partial<AppSettings> | null>(null);
  useEffect(() => getAdminConfigService().subscribeToSettings((s) => setAppSettings(s)), []);

  const effectiveVoiceOnly = Boolean(voiceOnlyMode ?? appSettings?.integrations?.telephony?.voiceOnlyMode);
  const [composerMode, setComposerMode] = useState<'sms' | 'note'>(() =>
    effectiveVoiceOnly || !effectivePhone ? 'note' : 'sms'
  );

  useEffect(() => {
    if (effectiveVoiceOnly || !effectivePhone) setComposerMode('note');
  }, [effectiveVoiceOnly, effectivePhone]);

  const cannedChips = useMemo(
    () => buildInterpolatedCommsSmsChips(templateContext, appSettings),
    [templateContext, appSettings]
  );

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const computePos = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 240;
    const menuHeight = menuRef.current?.offsetHeight || 260;
    return {
      top: Math.max(8, rect.top - menuHeight - 6),
      left: Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth)),
    };
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return setCoords(null);
    setCoords(computePos());
    const update = () => setCoords(computePos());
    const raf = requestAnimationFrame(update);
    const onOutside = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setIsMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setIsMenuOpen(false); } };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [isMenuOpen, computePos]);

  const isNote = composerMode === 'note';
  const draftValue = isNote ? noteDraftText : smsReplyText;
  const onChangeDraft = isNote ? onChangeNoteDraftText : onChangeSmsReplyText;
  const onSubmit = isNote ? onAddInternalNote : onSendSms;
  const canSend = isNote ? Boolean(noteDraftText.trim()) : Boolean(effectivePhone && smsReplyText.trim() && !isSendingSms);

  return (
    <div data-comms-composer="v2" data-composer-mode={composerMode} className="px-2.5 py-2 bg-white border-t border-slate-200 shrink-0 space-y-1">
      <div className="flex items-center gap-1.5">
        <div className="inline-flex items-center bg-slate-100 border border-slate-200 p-0.5 rounded-lg text-[10.5px] font-bold shrink-0">
          <button type="button" disabled={!effectivePhone} aria-pressed={!isNote} onClick={() => setComposerMode('sms')} className={`px-2 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-40 ${!isNote ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
            SMS
          </button>
          <button type="button" aria-pressed={isNote} onClick={() => setComposerMode('note')} className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${isNote ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
            Note
          </button>
        </div>

        {effectiveVoiceOnly && (
          <span title="A2P 10DLC SMS deferred — internal notes active by default" className="px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[9.5px] font-extrabold shrink-0">
            Voice-Only
          </span>
        )}

        <input
          type="text"
          value={draftValue}
          onChange={(e) => onChangeDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (canSend) onSubmit(); } }}
          disabled={!isNote && !effectivePhone}
          placeholder={isNote ? 'Add internal note...' : effectivePhone ? `SMS ${formatDisplayPhone(effectivePhone)}...` : 'Link phone to send SMS...'}
          className={`h-8 flex-1 min-w-0 px-2.5 text-xs rounded-lg border focus:outline-none ${
            isNote ? 'border-amber-300 bg-amber-50/40 focus:border-amber-500 focus:bg-white' : 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white'
          }`}
        />

        <button ref={triggerRef} type="button" onClick={() => setIsMenuOpen((v) => !v)} aria-haspopup="true" aria-expanded={isMenuOpen} title="Canned Dispatch Templates & Ride Links" className="h-8 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shrink-0">
          <SparklesIcon className="w-3 h-3 text-blue-600" />
          <span className="hidden @[380px]/commshub:inline">Templates</span>
          <ChevronDownIcon className="w-3 h-3 text-slate-400" />
        </button>

        <button type="button" disabled={!canSend} onClick={onSubmit} className={`h-8 px-3 rounded-lg text-white text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 shrink-0 ${isNote ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
          {!isNote && isSendingSms && <SpinnerIcon className="w-3 h-3 animate-spin" />}
          <span>Send</span>
        </button>
      </div>

      {smsStatusMessage && (
        <p className={`text-[10px] font-bold truncate ${smsStatusMessage.startsWith('Failed') || smsStatusMessage.startsWith('Error') ? 'text-rose-600' : 'text-emerald-600'}`}>
          {smsStatusMessage}
        </p>
      )}

      {isMenuOpen && coords !== null && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px`, width: '240px' }}
          className="z-[260] bg-white rounded-xl shadow-xl ring-1 ring-slate-900/5 py-1.5 text-xs divide-y divide-slate-100 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-h-52 overflow-y-auto py-0.5">
            {cannedChips.map((chip) => (
              <button key={chip.id} type="button" onClick={() => { onChangeDraft(chip.text); setIsMenuOpen(false); }} className="w-full px-3 py-1.5 text-left hover:bg-blue-50/80 text-slate-700 hover:text-blue-700 font-semibold flex items-center justify-between gap-2 cursor-pointer">
                <span className="truncate">{chip.shortLabel}</span>
              </button>
            ))}
          </div>
          {(onInsertTrackingLink || onInsertPayLink) && (
            <div className="p-1.5 flex items-center gap-1.5 bg-slate-50/70 rounded-b-xl">
              {onInsertTrackingLink && (
                <button type="button" disabled={!hasMatchedTrip} onClick={() => { onInsertTrackingLink(); setIsMenuOpen(false); }} className="flex-1 px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 disabled:opacity-40 text-blue-700 border border-blue-200 text-[10.5px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer">
                  <LinkIcon className="w-3 h-3" /><span>+ Tracking Link</span>
                </button>
              )}
              {onInsertPayLink && (
                <button type="button" disabled={!hasMatchedTrip || isGeneratingPayLink} onClick={() => { onInsertPayLink(); setIsMenuOpen(false); }} className="flex-1 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 text-emerald-800 border border-emerald-200 text-[10.5px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer">
                  <CreditCardIcon className="w-3 h-3" /><span>+ Pay Link</span>
                </button>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
