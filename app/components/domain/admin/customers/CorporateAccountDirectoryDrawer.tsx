import React, { useState } from 'react';
import { Link } from 'react-router';
import {
  normalizeCorporatePortalPolicy,
  type AppSettings,
  type CorporateAccountConfig,
} from '../../../../core/types/config';
import {
  getCorporateAccountService,
  validatePoFormatRegex,
} from '../../../../core/services/corporate-account.service';
import {
  isValidCorporateBookingPin,
  normalizeCorporateBookingPin,
} from '../../../../core/services/corporate-caller-auth.util';
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  ArchiveBoxIcon,
  BuildingIcon,
  CheckIcon,
  CreditCardIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserCheckIcon,
} from '../../../ui/Icons';
import { CorporateAssetsSection } from './CorporateAssetsSection';

export interface CorporateAccountDirectoryDrawerProps {
  settings: AppSettings;
  editingCorp: CorporateAccountConfig | null;
  setEditingCorp: React.Dispatch<React.SetStateAction<CorporateAccountConfig | null>>;
  isNewCorp: boolean;
  onClose: () => void;
  onSaveCorporateAccount: (updated: CorporateAccountConfig) => Promise<void>;
  onOpenProvisionModal: (corp: CorporateAccountConfig) => void;
  onRequestArchive?: (corp: CorporateAccountConfig) => void;
}

export function CorporateAccountDirectoryDrawer({
  settings,
  editingCorp,
  setEditingCorp,
  isNewCorp,
  onClose,
  onSaveCorporateAccount,
  onOpenProvisionModal,
  onRequestArchive,
}: CorporateAccountDirectoryDrawerProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!editingCorp) return null;

  const portalPolicy = normalizeCorporatePortalPolicy(settings.corporatePortalPolicy);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCorp.companyName.trim()) {
      setFormError('Company name is required.');
      return;
    }

    if (editingCorp.currentPoNumber?.trim() && portalPolicy.poFormatRegex) {
      const fmt = validatePoFormatRegex(editingCorp.currentPoNumber.trim(), portalPolicy.poFormatRegex);
      if (!fmt.valid) {
        setFormError(fmt.error || 'PO number does not match configured PO Format Regex.');
        return;
      }
    }

    const cleanPin = normalizeCorporateBookingPin(editingCorp.bookingPin);
    if (cleanPin && !isValidCorporateBookingPin(cleanPin)) {
      setFormError('Verbal Booking PIN must be 4–8 alphanumeric characters (A–Z, 0–9).');
      return;
    }

    setFormError(null);
    setIsSaving(true);
    try {
      const acctNum =
        editingCorp.accountNumber.trim() || `CORP-${Date.now().toString().slice(-4)}`;
      const poNum =
        editingCorp.currentPoNumber?.trim() ||
        (editingCorp.poRequired
          ? getCorporateAccountService().generateSecurePoNumber(editingCorp.companyName, acctNum)
          : undefined);

      const cleanRecord: CorporateAccountConfig = {
        ...editingCorp,
        companyName: editingCorp.companyName.trim(),
        accountNumber: acctNum,
        billingContactName: (editingCorp.billingContactName || '').trim(),
        billingContactEmail: editingCorp.billingContactEmail.trim(),
        billingContactPhone: editingCorp.billingContactPhone?.trim() || undefined,
        billingAddress: editingCorp.billingAddress?.trim() || undefined,
        taxId: editingCorp.taxId?.trim() || undefined,
        currentPoNumber: poNum,
        bookingPin: cleanPin || undefined,
        updatedAt: new Date().toISOString(),
      };
      await onSaveCorporateAccount(cleanRecord);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminSlideOverDrawer
      isOpen={Boolean(editingCorp)}
      onClose={onClose}
      title={isNewCorp ? 'Add Corporate Account' : 'Edit Corporate Directory Profile'}
      subtitle={
        isNewCorp
          ? 'Register corporate directory identity, PO security, and authorized riders/locations'
          : `${editingCorp.companyName} (${editingCorp.accountNumber})`
      }
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <div>
            {!isNewCorp && onRequestArchive && (
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => onRequestArchive(editingCorp)}
                leftIcon={<ArchiveBoxIcon className="w-4 h-4" />}
                className="text-status-warning-fg border-status-warning-border bg-status-warning-bg hover:bg-status-warning-bg-strong font-bold"
              >
                Archive Account
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="corporate-directory-form"
              variant="primary"
              size="md"
              isLoading={isSaving}
              leftIcon={isNewCorp ? <PlusIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
              className="font-bold"
            >
              {isNewCorp ? 'Add Corporate Account' : 'Save Directory Profile'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="corporate-directory-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
        {formError && (
          <div className="p-3 bg-status-danger-bg border border-status-danger-border rounded-xl text-status-danger-fg font-bold">
            {formError}
          </div>
        )}

        {/* 1. Company Identity & Contact */}
        <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-border-faint">
            <div className="flex items-center gap-2">
              <BuildingIcon className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-strong">
                Directory Identity &amp; Contact
              </h3>
            </div>
            {!isNewCorp && (
              <Link
                to={`/app/admin?tab=invoicing&sub=accounts&accountId=${encodeURIComponent(editingCorp.id)}`}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-status-info-fg"
              >
                <CreditCardIcon className="w-3.5 h-3.5" />
                <span>Billing &amp; Credit &rarr;</span>
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-fg-secondary block mb-1">
                Company Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={editingCorp.companyName}
                onChange={(e) => setEditingCorp({ ...editingCorp, companyName: e.target.value })}
                placeholder="e.g. Bayer Crop Science"
                className="w-full h-9 px-3 bg-surface-card border border-border-strong rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-fg-secondary block mb-1">
                Account Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={editingCorp.accountNumber}
                onChange={(e) => setEditingCorp({ ...editingCorp, accountNumber: e.target.value })}
                placeholder="CORP-101"
                className="w-full h-9 px-3 bg-surface-card border border-border-strong rounded-xl text-xs font-mono font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-fg-secondary block mb-1">Primary Contact Name</label>
              <input
                type="text"
                required
                value={editingCorp.billingContactName || ''}
                onChange={(e) => setEditingCorp({ ...editingCorp, billingContactName: e.target.value })}
                placeholder="Laura Vance"
                className="w-full h-9 px-3 bg-surface-card border border-border-strong rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-fg-secondary block mb-1">Contact Email *</label>
              <input
                type="email"
                required
                value={editingCorp.billingContactEmail}
                onChange={(e) => setEditingCorp({ ...editingCorp, billingContactEmail: e.target.value })}
                placeholder="traveldesk@company.com"
                className="w-full h-9 px-3 bg-surface-card border border-border-strong rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-fg-secondary block mb-1">Contact Phone</label>
              <input
                type="tel"
                value={editingCorp.billingContactPhone || ''}
                onChange={(e) => setEditingCorp({ ...editingCorp, billingContactPhone: e.target.value })}
                placeholder="(314) 555-0140"
                className="w-full h-9 px-3 bg-surface-card border border-border-strong rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="font-semibold text-fg-secondary block mb-1">Physical / Billing Address</label>
              <input
                type="text"
                value={editingCorp.billingAddress || ''}
                onChange={(e) => setEditingCorp({ ...editingCorp, billingAddress: e.target.value })}
                placeholder="800 N Lindbergh Blvd, Creve Coeur, MO 63167"
                className="w-full h-9 px-3 bg-surface-card border border-border-strong rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-fg-secondary block mb-1">Tax ID / EIN</label>
              <input
                type="text"
                value={editingCorp.taxId || ''}
                onChange={(e) => setEditingCorp({ ...editingCorp, taxId: e.target.value })}
                placeholder="XX-XXXXXXX"
                className="w-full h-9 px-3 bg-surface-card border border-border-strong rounded-xl text-xs font-mono"
              />
            </div>
          </div>
        </section>

        {/* 2. PO Security & Account Status */}
        <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-border-faint">
            <ShieldCheckIcon className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-strong">
              PO Security &amp; Status
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-fg-secondary block mb-1">
                Active PO Number {portalPolicy.poFormatRegex ? `(Pattern: ${portalPolicy.poFormatRegex})` : ''}
              </label>
              <input
                type="text"
                value={editingCorp.currentPoNumber || ''}
                onChange={(e) => setEditingCorp({ ...editingCorp, currentPoNumber: e.target.value })}
                placeholder="PO-XXXXXX"
                className="w-full h-9 px-3 bg-surface-card border border-border-strong rounded-xl text-xs font-mono font-semibold"
              />
            </div>
            <div>
              <label className="font-semibold text-fg-secondary block mb-1">
                Verbal Booking PIN (4–8 Alphanumeric, Optional)
              </label>
              <input
                type="text"
                maxLength={8}
                value={editingCorp.bookingPin || ''}
                onChange={(e) =>
                  setEditingCorp({
                    ...editingCorp,
                    bookingPin: normalizeCorporateBookingPin(e.target.value),
                  })
                }
                placeholder="e.g. BAYR26"
                className="w-full h-9 px-3 bg-surface-card border border-border-strong rounded-xl text-xs font-mono font-semibold uppercase tracking-wider"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(editingCorp.poRequired)}
                onChange={(e) => setEditingCorp({ ...editingCorp, poRequired: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded border-border-strong"
              />
              <span className="font-semibold text-fg-strong">Enforce PO Number on Bookings</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(editingCorp.isActive)}
                onChange={(e) => setEditingCorp({ ...editingCorp, isActive: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded border-border-strong"
              />
              <span className="font-semibold text-fg-strong">Account Active</span>
            </label>
          </div>
        </section>

        {/* 3. Authorized Riders, Cost Centers & Saved Company Locations */}
        <CorporateAssetsSection editingCorp={editingCorp} setEditingCorp={setEditingCorp} />

        {/* 4. Corporate Portal Managers Summary */}
        {!isNewCorp && (
          <section className="bg-status-staged-bg/50 rounded-2xl border border-status-staged-border/80 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UserCheckIcon className="w-4 h-4 text-indigo-600" />
                <span className="font-extrabold uppercase tracking-wider text-status-staged-fg">
                  Portal Managers (/app/corporate)
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenProvisionModal(editingCorp)}
                className="text-[11px] font-bold bg-surface-card border-status-staged-border text-status-staged-fg hover:bg-status-staged-bg-strong cursor-pointer"
              >
                + Provision Manager
              </Button>
            </div>
            {(editingCorp.portalManagers || []).length > 0 ? (
              <div className="space-y-1">
                {editingCorp.portalManagers!.map((pm, idx) => (
                  <div
                    key={`${pm.email}-${idx}`}
                    className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-surface-card border border-indigo-100"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-fg-primary">{pm.name}</span>{' '}
                      <span className="text-fg-muted font-mono">({pm.email})</span>
                    </div>
                    <Badge variant="success" size="sm" className="text-[10px]">
                      {pm.status.toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-fg-muted">
                No Travel Desk Portal Managers provisioned yet.
              </p>
            )}
          </section>
        )}
      </form>
    </AdminSlideOverDrawer>
  );
}
