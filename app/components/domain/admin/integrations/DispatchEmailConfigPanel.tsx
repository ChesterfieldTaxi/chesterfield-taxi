import React, { useEffect, useState } from 'react';
import {
  DEFAULT_DISPATCH_EMAIL_POLICY,
  normalizeDispatchEmailPolicy,
  type AppSettings,
  type DispatchEmailPolicyConfig,
} from '../../../../core/types/config';
import {
  DISPATCH_MAILBOX_ADDRESS,
  type DispatchEmailDiagnosticsSummary,
} from '../../../../core/types/dispatch-email';
import { authorizedFetch } from '../../../../core/services/auth/auth-headers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { CheckIcon, CopyIcon, MailIcon, PlusIcon, RefreshCwIcon, SpinnerIcon, TrashIcon } from '../../../ui/Icons';

export interface DispatchEmailConfigPanelProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  onNotifySuccess: (message: string) => void;
  isLoading?: boolean;
}

export function DispatchEmailConfigPanel({
  settings,
  onSave,
  onNotifySuccess,
  isLoading = false,
}: DispatchEmailConfigPanelProps) {
  const [emailDiag, setEmailDiag] = useState<DispatchEmailDiagnosticsSummary | null>(null);
  const [isLoadingDiag, setIsLoadingDiag] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [policy, setPolicy] = useState<DispatchEmailPolicyConfig>(() =>
    normalizeDispatchEmailPolicy(settings.integrations?.dispatchEmail)
  );
  const [newBlockedEntry, setNewBlockedEntry] = useState('');

  useEffect(() => {
    setPolicy(normalizeDispatchEmailPolicy(settings.integrations?.dispatchEmail));
  }, [settings.integrations?.dispatchEmail]);

  const refreshDiagnostics = async () => {
    setIsLoadingDiag(true);
    try {
      const resp = await authorizedFetch('/api/email/webhook?diagnostics=1', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const data = (await resp.json().catch(() => null)) as DispatchEmailDiagnosticsSummary | null;
      if (resp.ok && data?.success) {
        setEmailDiag(data);
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingDiag(false);
    }
  };

  useEffect(() => {
    void refreshDiagnostics();
  }, []);

  const currentOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://chesterfield-taxi.vercel.app';
  const webhookUrl = `${currentOrigin}${emailDiag?.endpointPath || '/api/email/webhook'}`;

  const handleAddBlocked = () => {
    const cleaned = newBlockedEntry.trim().toLowerCase();
    if (!cleaned) return;
    const normalized = normalizeDispatchEmailPolicy({
      ...policy,
      blockedSenderList: [...policy.blockedSenderList, cleaned],
    });
    setPolicy(normalized);
    setNewBlockedEntry('');
  };

  const handleSavePolicy = async () => {
    setIsSaving(true);
    try {
      const normalized = normalizeDispatchEmailPolicy(policy);
      await onSave({
        integrations: {
          ...settings.integrations,
          dispatchEmail: normalized,
        },
      });
      setPolicy(normalized);
      onNotifySuccess('Dispatch Email policy, outbound signature, and blocked sender rules saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* CARD 1: RESEND WEBHOOK & MAILBOX DIAGNOSTICS */}
      <Card className="rounded-2xl border-border-subtle">
        <CardHeader className="border-b border-border-faint pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <CardTitle className="text-base font-extrabold text-fg-primary flex items-center gap-2">
                <MailIcon className="w-5 h-5 text-blue-600 shrink-0" />
                <span>Dispatch Mailbox ({emailDiag?.mailboxAddress || DISPATCH_MAILBOX_ADDRESS})</span>
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                Single-mailbox inbound/outbound RFC-5322 email threading, Svix HMAC-SHA256 verification, and Email-to-Booking extraction.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={emailDiag?.webhookSecretConfigured ? 'success' : 'warning'} className="font-bold">
                {emailDiag?.webhookSecretConfigured ? 'Svix Secret Ready' : 'Missing RESEND_WEBHOOK_SECRET'}
              </Badge>
              <Button type="button" variant="outline" size="sm" disabled={isLoadingDiag} onClick={refreshDiagnostics}>
                {isLoadingDiag ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : <RefreshCwIcon className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="p-4 rounded-xl border border-status-info-border bg-status-info-bg/40 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-fg-primary">Resend Inbound &amp; Delivery Webhook URL (POST):</span>
              <span className="text-[11px] font-mono text-status-info-fg">
                Replay Window: {emailDiag?.toleranceSeconds ?? 300}s
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-surface-card p-2.5 rounded-lg border border-status-info-border text-fg-strong select-all break-all">
                {webhookUrl}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(webhookUrl);
                  setCopiedUrl(true);
                  setTimeout(() => setCopiedUrl(false), 2000);
                }}
                className="bg-surface-card border-status-info-border text-status-info-fg font-bold text-xs px-3 py-2"
              >
                {copiedUrl ? <CheckIcon className="w-3.5 h-3.5 mr-1 text-status-success-fg" /> : <CopyIcon className="w-3.5 h-3.5 mr-1" />}
                {copiedUrl ? 'Copied' : 'Copy URL'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-border-subtle bg-surface-subtle/70 space-y-1">
              <span className="text-xs font-extrabold text-fg-primary block">Active Alias</span>
              <p className="text-[11px] font-mono text-fg-secondary break-all">{emailDiag?.mailboxAddress || DISPATCH_MAILBOX_ADDRESS}</p>
            </div>
            <div className="p-3.5 rounded-xl border border-border-subtle bg-surface-subtle/70 space-y-1">
              <span className="text-xs font-extrabold text-fg-primary block">Resend Outbound API</span>
              <p className="text-[11px] text-fg-secondary">
                {emailDiag?.resendApiConfigured ? 'RESEND_API_KEY Active' : 'Simulation Fallback Mode'}
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-status-success-border bg-status-success-bg/50 space-y-1">
              <span className="text-xs font-extrabold text-status-success-fg block">Synced Messages</span>
              <p className="text-[11px] text-status-success-fg">
                {emailDiag?.storedEmailCount ?? 0} Stored &middot; {emailDiag?.unreadEmailCount ?? 0} Unread
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CARD 2: DISPATCH EMAIL POLICY & GOVERNANCE */}
      <Card className="rounded-2xl border-border-subtle">
        <CardHeader className="border-b border-border-faint pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <CardTitle className="text-base font-extrabold text-fg-primary">
                Dispatch Email Intake &amp; Outbound Signature Policy
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                Govern automatic booking draft extraction, EmailDock outbound signatures, and blocked sender/domain filters.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPolicy(DEFAULT_DISPATCH_EMAIL_POLICY)} className="text-xs font-bold">
                Reset Defaults
              </Button>
              <Button type="button" size="sm" onClick={handleSavePolicy} disabled={isSaving || isLoading} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">
                {isSaving ? 'Saving...' : 'Save Email Policy'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="p-4 rounded-xl border border-border-subtle bg-surface-subtle/50 flex items-start justify-between gap-3 cursor-pointer">
              <div>
                <span className="text-sm font-bold text-fg-primary block">Parse Inbound Emails to Booking Draft</span>
                <span className="text-xs text-fg-muted">
                  Automatically extract pickup/dropoff/time/flight details so operators can 1-click populate Dispatch Booking.
                </span>
              </div>
              <input
                type="checkbox"
                checked={policy.inboundParseToBookingDraft}
                onChange={(e) => setPolicy({ ...policy, inboundParseToBookingDraft: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded text-blue-600 shrink-0"
              />
            </label>

            <label className="p-4 rounded-xl border border-border-subtle bg-surface-subtle/50 flex items-start justify-between gap-3 cursor-pointer">
              <div>
                <span className="text-sm font-bold text-fg-primary block">Auto-Acknowledge Inbound Booking Emails</span>
                <span className="text-xs text-fg-muted">
                  Send an automated receipt acknowledgement when a parsed reservation email arrives at dispatch@.
                </span>
              </div>
              <input
                type="checkbox"
                checked={policy.autoAckInboundBookingEmails}
                onChange={(e) => setPolicy({ ...policy, autoAckInboundBookingEmails: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded text-blue-600 shrink-0"
              />
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-fg-secondary mb-1">
              Default Outbound Email Signature (Appended in Dispatch EmailDock Composer)
            </label>
            <textarea
              rows={2}
              value={policy.outboundSignature}
              onChange={(e) => setPolicy({ ...policy, outboundSignature: e.target.value })}
              placeholder={DEFAULT_DISPATCH_EMAIL_POLICY.outboundSignature}
              className="w-full text-xs p-3 rounded-xl border border-border-subtle bg-surface-subtle focus:bg-surface-card"
            />
          </div>

          <div className="space-y-2.5">
            <label className="block text-xs font-bold text-fg-secondary">
              Blocked Inbound Senders &amp; Domains ({policy.blockedSenderList.length})
            </label>
            <div className="flex gap-2 max-w-lg">
              <input
                type="text"
                value={newBlockedEntry}
                onChange={(e) => setNewBlockedEntry(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddBlocked();
                  }
                }}
                placeholder="e.g. spam@example.com or @marketing-domain.com"
                className="flex-1 text-xs font-mono px-3 py-2 rounded-xl border border-border-subtle bg-surface-card"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddBlocked} className="text-xs font-bold">
                <PlusIcon className="w-3.5 h-3.5 mr-1" /> Block
              </Button>
            </div>

            {policy.blockedSenderList.length === 0 ? (
              <p className="text-[11px] text-fg-muted">No blocked email addresses or domains configured.</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {policy.blockedSenderList.map((entry) => (
                  <span
                    key={entry}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-danger-bg border border-status-danger-border text-xs font-mono font-semibold text-status-danger-fg"
                  >
                    <span>{entry}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPolicy({
                          ...policy,
                          blockedSenderList: policy.blockedSenderList.filter((item) => item !== entry),
                        })
                      }
                      className="text-rose-500 hover:text-status-danger-fg cursor-pointer"
                      title="Remove blocked sender"
                    >
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
