import React, { useState } from 'react';
import {
  formatCardBrandLabel, formatCardExpiryDisplay, getContactService, parseCardExpiryInput,
  type ClientSavedPaymentMethod, type ContactRecord,
} from '../../../core/services/customer/contact.service';
import { getPayLinkService } from '../../../core/services/payments/pay-link.service';
import { CheckIcon, CopyIcon, CreditCardIcon, LockIcon, PlusIcon, SpinnerIcon, TrashIcon } from '../../ui/Icons';
import { Select, type SelectOption } from '../../ui/Select';

const CARD_BRAND_OPTIONS: ReadonlyArray<SelectOption> = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex', label: 'Amex' },
  { value: 'discover', label: 'Discover' },
  { value: 'card', label: 'Other Card' },
];

export interface ClientSavedCardsCardProps {
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  stripeCustomerId?: string;
  savedMethods?: ReadonlyArray<ClientSavedPaymentMethod>;
  onMethodsChange?: (methods: ClientSavedPaymentMethod[], updatedContact?: ContactRecord) => void;
}

export function ClientSavedCardsCard({
  contactId, contactName, contactPhone, contactEmail, stripeCustomerId, savedMethods = [], onMethodsChange,
}: ClientSavedCardsCardProps) {
  const [isAddingRef, setIsAddingRef] = useState(false);
  const [refBrand, setRefBrand] = useState('visa');
  const [refLast4, setRefLast4] = useState('');
  const [refExp, setRefExp] = useState('');
  const [refHolder, setRefHolder] = useState(contactName || '');
  const [refError, setRefError] = useState<string | null>(null);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [setupLinkUrl, setSetupLinkUrl] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  const ensureContactRecord = (): ContactRecord | null => {
    const svc = getContactService();
    const existing =
      (contactId ? svc.getContactById(contactId) : null) ||
      (contactPhone ? svc.getContactByPhone(contactPhone) : null) ||
      (contactEmail ? svc.getContactByEmail(contactEmail) : null);
    if (existing) return existing;
    if (!contactName?.trim() && !contactPhone?.trim() && !contactEmail?.trim()) return null;
    return svc.upsertContact({
      id: contactId,
      name: (contactName || '').trim() || contactPhone || contactEmail || 'Customer',
      phone: (contactPhone || '').trim(),
      email: (contactEmail || '').trim(),
      stripeCustomerId,
    });
  };

  const handleSaveReference = () => {
    const cleanLast4 = refLast4.replace(/\D/g, '').slice(-4);
    if (cleanLast4.length !== 4) { setRefError('Enter the 4-digit card ending (e.g. 4242).'); return; }
    const parsedExp = parseCardExpiryInput(refExp);
    if (!parsedExp) { setRefError('Enter valid MM/YY expiration (e.g. 08/28).'); return; }
    const base = ensureContactRecord();
    if (!base) { setRefError('Enter client name, phone, or email above first.'); return; }
    const updated = getContactService().upsertSavedPaymentMethod(base.id, {
      brand: refBrand, last4: cleanLast4, expMonth: parsedExp.expMonth, expYear: parsedExp.expYear,
      cardholderName: refHolder.trim() || contactName?.trim() || undefined,
      mode: 'reference_only', isDefault: savedMethods.length === 0,
    });
    if (updated) {
      onMethodsChange?.(updated.savedPaymentMethods || [], updated);
      setIsAddingRef(false); setRefLast4(''); setRefExp(''); setRefError(null);
    }
  };

  const handleSetDefault = (methodId: string) => {
    const base = ensureContactRecord();
    if (!base) return;
    const updated = getContactService().setDefaultSavedPaymentMethod(base.id, methodId);
    if (updated) onMethodsChange?.(updated.savedPaymentMethods || [], updated);
  };

  const handleRemove = (methodId: string) => {
    const base = ensureContactRecord();
    if (!base) return;
    const updated = getContactService().removeSavedPaymentMethod(base.id, methodId);
    if (updated) onMethodsChange?.(updated.savedPaymentMethods || [], updated);
  };

  const handleSendSetupLink = async () => {
    const base = ensureContactRecord();
    if (!base) { setLinkNotice('Add name, phone, or email above before generating a setup link.'); return; }
    setIsSendingLink(true); setLinkNotice(null);
    const res = await getPayLinkService().createOrGetCardSetupLink(
      {
        contactId: base.id, contactName: contactName || base.name,
        contactPhone: contactPhone || base.phone, contactEmail: contactEmail || base.email,
        stripeCustomerId: stripeCustomerId || base.stripeCustomerId,
      },
      { sendSms: Boolean((contactPhone || base.phone || '').trim()), sendEmail: Boolean((contactEmail || base.email || '').trim()) }
    );
    setIsSendingLink(false);
    if (!res.success || !res.payUrl) { setLinkNotice(res.error || 'Unable to generate card setup link.'); return; }
    setSetupLinkUrl(res.payUrl);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) navigator.clipboard.writeText(res.payUrl).catch(() => {});
    const channels = [res.smsResult?.sent ? 'SMS' : '', res.emailResult?.sent ? 'Email' : ''].filter(Boolean);
    setLinkNotice(channels.length > 0 ? `Setup link sent (${channels.join(' + ')}) & copied` : 'Setup link copied to clipboard');
  };

  return (
    <div data-client-saved-cards="true" className="bg-surface-card rounded-xl border border-border-subtle/90 p-3 space-y-2 shadow-2xs text-xs">
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-fg-muted">
          <CreditCardIcon className="w-3.5 h-3.5 text-emerald-600" /><span>Saved Payment Methods</span>
        </span>
        <div className="flex items-center gap-1">
          <button type="button" data-send-card-setup-link="true" disabled={isSendingLink} onClick={handleSendSetupLink} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-status-staged-bg hover:bg-status-staged-bg-strong text-status-staged-fg font-bold text-[10.5px] border border-status-staged-border cursor-pointer disabled:opacity-50">
            {isSendingLink ? <SpinnerIcon className="w-3 h-3 animate-spin" /> : <LockIcon className="w-3 h-3" />}
            <span>Send Card Setup Link</span>
          </button>
          <button type="button" data-add-card-reference-btn="true" onClick={() => { setIsAddingRef((v) => !v); setRefError(null); }} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-status-success-bg hover:bg-status-success-bg-strong text-status-success-fg font-bold text-[10.5px] border border-status-success-border cursor-pointer">
            <PlusIcon className="w-3 h-3" /><span>+ Add Reference</span>
          </button>
        </div>
      </div>

      {(linkNotice || setupLinkUrl) && (
        <div className="p-2 rounded-lg bg-status-staged-bg/80 border border-status-staged-border text-[11px] text-status-staged-fg flex items-center justify-between gap-2">
          <div className="min-w-0 truncate">
            <span className="font-bold">{linkNotice}</span>
            {setupLinkUrl && <span className="ml-1.5 font-mono text-[10px] text-status-staged-fg">{setupLinkUrl}</span>}
          </div>
          {setupLinkUrl && (
            <button type="button" onClick={() => navigator.clipboard?.writeText(setupLinkUrl).catch(() => {})} className="px-1.5 py-0.5 rounded bg-surface-card border border-status-staged-border text-status-staged-fg font-bold text-[10px] inline-flex items-center gap-1 shrink-0 cursor-pointer">
              <CopyIcon className="w-3 h-3" /><span>Copy</span>
            </button>
          )}
        </div>
      )}

      {savedMethods.length === 0 && !isAddingRef ? (
        <div className="text-[11px] text-fg-muted py-1">No saved cards on file. Send a secure Stripe setup link or add a 4-digit card reference.</div>
      ) : (
        <div className="space-y-1.5">
          {savedMethods.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-border-subtle bg-surface-subtle/70">
              <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-fg-primary font-mono text-[11.5px]">
                  {formatCardBrandLabel(m.brand)} •••• {m.last4} · {formatCardExpiryDisplay(m.expMonth, m.expYear)}
                  {m.isDefault ? ' · Default' : ''}
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-extrabold ${m.mode === 'stripe_pm' ? 'bg-status-success-bg-strong text-status-success-fg border border-status-success-border' : 'bg-surface-emphasis/80 text-fg-secondary'}`}>
                  {m.mode === 'stripe_pm' ? 'Stripe Vault' : 'Ref Only'}
                </span>
                {m.cardholderName && <span className="text-[10.5px] text-fg-muted truncate">({m.cardholderName})</span>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!m.isDefault && (
                  <button type="button" onClick={() => handleSetDefault(m.id)} className="px-1.5 py-0.5 rounded bg-surface-card hover:bg-status-info-bg border border-border-subtle text-fg-secondary hover:text-status-info-fg font-bold text-[10px] cursor-pointer">
                    Set Default
                  </button>
                )}
                <button type="button" onClick={() => handleRemove(m.id)} className="p-1 text-fg-subtle hover:text-rose-600 rounded cursor-pointer" title="Remove saved card" aria-label="Remove saved card">
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAddingRef && (
        <div className="p-2.5 rounded-lg bg-surface-subtle border border-border-subtle space-y-2">
          <div className="text-[10px] font-semibold text-status-success-fg flex items-center gap-1">
            <LockIcon className="w-3 h-3 text-emerald-600 shrink-0" /><span>PCI-Safe Reference — Brand, Last 4 &amp; Expiry only (never full PAN or CVC)</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <Select size="xs" options={CARD_BRAND_OPTIONS} value={refBrand} onValueChange={setRefBrand} aria-label="Card brand" />
            <input type="text" maxLength={4} value={refLast4} onChange={(e) => setRefLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Last 4 (4242)" className="px-2 py-1 rounded-lg border border-border-strong bg-surface-card font-mono text-center" />
            <input type="text" maxLength={5} value={refExp} onChange={(e) => setRefExp(e.target.value)} placeholder="MM/YY" className="px-2 py-1 rounded-lg border border-border-strong bg-surface-card font-mono text-center" />
          </div>
          <div className="flex items-center gap-1.5">
            <input type="text" value={refHolder} onChange={(e) => setRefHolder(e.target.value)} placeholder="Cardholder Name" className="flex-1 px-2 py-1 rounded-lg border border-border-strong bg-surface-card" />
            <button type="button" onClick={() => setIsAddingRef(false)} className="px-2 py-1 rounded-lg border border-border-strong bg-surface-card text-fg-secondary font-bold text-[10.5px] cursor-pointer">Cancel</button>
            <button type="button" onClick={handleSaveReference} className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10.5px] inline-flex items-center gap-1 cursor-pointer">
              <CheckIcon className="w-3 h-3" /><span>Save</span>
            </button>
          </div>
          {refError && <div className="text-[10.5px] font-semibold text-rose-600">{refError}</div>}
        </div>
      )}
    </div>
  );
}
