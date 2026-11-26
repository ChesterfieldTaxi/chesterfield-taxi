import React, { useState } from 'react';
import type { CorporateAccountConfig, PoHistoryRecord } from '../../../../core/types/config';
import {
  getCorporateAccountService,
  type CorporateJsonMergeResult,
} from '../../../../core/services/corporate-account.service';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import {
  isValidCorporateBookingPin,
  normalizeCorporateBookingPin,
} from '../../../../core/services/corporate-caller-auth.util';
import { Button } from '../../../ui/Button';
import { Badge } from '../../../ui/Badge';
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';
import {
  ShieldCheckIcon,
  RefreshCwIcon,
  CopyIcon,
  CheckIcon,
  AlertCircleIcon,
  DownloadIcon,
  PlusIcon,
} from '../../../ui/Icons';

// ============================================================================
// 1. REGENERATE PO NUMBER MODAL
// ============================================================================

interface RegeneratePoModalProps {
  account: CorporateAccountConfig;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedAccount: CorporateAccountConfig, newPo: string) => void;
  operatorEmail?: string;
}

export function RegeneratePoModal({
  account,
  isOpen,
  onClose,
  onSuccess,
  operatorEmail,
}: RegeneratePoModalProps) {
  const [reason, setReason] = useState('Routine periodic rotation');
  const [isRotating, setIsRotating] = useState(false);
  const [rotatedResult, setRotatedResult] = useState<{ newPo: string; oldPo: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRegenerate = async () => {
    try {
      setIsRotating(true);
      setError(null);
      const service = getCorporateAccountService();
      const res = await service.regeneratePoNumber(account.id, reason, operatorEmail);
      setRotatedResult({ newPo: res.newPo, oldPo: res.oldPo });
      onSuccess(res.account, res.newPo);
    } catch (err: any) {
      console.error('Failed to regenerate PO:', err);
      setError(err.message || 'Failed to regenerate PO number');
    } finally {
      setIsRotating(false);
    }
  };

  const handleCopy = () => {
    if (rotatedResult?.newPo) {
      navigator.clipboard.writeText(rotatedResult.newPo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <AdminSlideOverDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Regenerate PO Number"
      subtitle={`${account.companyName} (${account.accountNumber})`}
      size="md"
      footer={
        !rotatedResult ? (
          <>
            <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isRotating}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleRegenerate}
              disabled={isRotating}
              leftIcon={<RefreshCwIcon className={`w-4 h-4 ${isRotating ? 'animate-spin' : ''}`} />}
              className="bg-amber-600 hover:bg-amber-700 font-bold"
            >
              {isRotating ? 'Regenerating...' : 'Regenerate PO'}
            </Button>
          </>
        ) : (
          <Button type="button" variant="primary" size="md" onClick={onClose} className="font-bold">
            Done
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-status-danger-bg border border-status-danger-border rounded-xl text-xs text-status-danger-fg font-medium">
            {error}
          </div>
        )}

        {!rotatedResult ? (
          <div className="space-y-4 text-xs">
            {/* Anti-Fraud Notice */}
            <div className="p-3.5 bg-status-warning-bg/80 border border-status-warning-border rounded-2xl space-y-1.5 text-status-warning-fg">
              <div className="font-bold flex items-center gap-1.5 text-status-warning-fg">
                <AlertCircleIcon className="w-4 h-4 text-amber-600 shrink-0" />
                Anti-Fraud PO Rotation Notice
              </div>
              <p className="text-[11px] leading-relaxed text-status-warning-fg/90">
                Regenerating will immediately revoke active PO code{' '}
                <strong className="font-mono bg-surface-card px-1.5 py-0.5 rounded border border-status-warning-border">
                  {account.currentPoNumber || 'N/A'}
                </strong>{' '}
                and generate a new unguessable billing code.
              </p>
              <p className="text-[11px] text-status-warning-fg/80">
                Any future booking attempting to charge rides using the revoked PO will be automatically rejected with an unauthorized billing alert.
              </p>
            </div>

            {/* Current PO Info */}
            <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 bg-surface-subtle rounded-xl border border-border-faint">
                <div>
                  <span className="text-fg-subtle block text-[10px] uppercase font-bold">Current Active PO</span>
                  <span className="font-mono font-bold text-fg-strong text-xs">
                    {account.currentPoNumber || 'None (Unassigned)'}
                  </span>
                </div>
                <div>
                  <span className="text-fg-subtle block text-[10px] uppercase font-bold">Issued At</span>
                  <span className="text-fg-secondary text-xs">
                    {account.poGeneratedAt ? new Date(account.poGeneratedAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Reason Presets */}
              <div>
                <label className="block font-semibold text-fg-secondary mb-1.5">Reason for PO Rotation</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    'Routine periodic rotation',
                    'Suspected fraud / code misuse',
                    'Staff / account holder change',
                    'Requested by client travel manager',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setReason(preset)}
                      className={`text-[10px] px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                        reason === preset
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-surface-card text-fg-secondary border-border-subtle hover:border-border-strong'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Custom reason or memo..."
                  className="w-full h-10 px-3 bg-surface-card border border-border-strong rounded-xl text-xs text-fg-strong focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </section>
          </div>
        ) : (
          /* SUCCESS STATE */
          <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-5 space-y-4 text-center animate-in fade-in-50">
            <div className="w-12 h-12 bg-status-success-bg-strong text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckIcon className="w-6 h-6" />
            </div>

            <div>
              <h4 className="text-sm font-black text-fg-primary">New PO Code Generated</h4>
              <p className="text-xs text-fg-muted mt-0.5">
                The previous PO code has been revoked. Provide this new code to authorized bookers.
              </p>
            </div>

            <div className="p-4 bg-surface-header text-white rounded-2xl space-y-2 border border-border-header shadow-inner">
              <span className="text-[10px] uppercase tracking-wider text-fg-subtle font-bold block">
                Active Corporate PO Number
              </span>
              <div className="font-mono text-lg font-black tracking-wider text-emerald-400 select-all">
                {rotatedResult.newPo}
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleCopy}
                className="mx-auto text-xs bg-surface-header-elevated hover:bg-surface-header-muted text-fg-on-header border border-border-header gap-1.5 mt-1"
              >
                {copied ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" /> : <CopyIcon className="w-3.5 h-3.5" />}
                {copied ? 'Copied to Clipboard!' : 'Copy New PO'}
              </Button>
            </div>

            {rotatedResult.oldPo && (
              <p className="text-[11px] text-fg-subtle font-mono">
                Revoked Code: <span className="line-through text-fg-muted">{rotatedResult.oldPo}</span>
              </p>
            )}
          </section>
        )}
      </div>
    </AdminSlideOverDrawer>
  );
}

// ============================================================================
// 2. PO AUDIT HISTORY MODAL
// ============================================================================

interface PoHistoryModalProps {
  account: CorporateAccountConfig;
  isOpen: boolean;
  onClose: () => void;
}

export function PoHistoryModal({ account, isOpen, onClose }: PoHistoryModalProps) {
  if (!isOpen) return null;

  const history: PoHistoryRecord[] = account.poNumberHistory || [];

  return (
    <AdminSlideOverDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="PO Rotation History"
      subtitle={`${account.companyName} · ${account.accountNumber}`}
      size="md"
      footer={
        <Button type="button" variant="outline" size="md" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Current Active PO */}
        <div className="p-4 bg-status-success-bg border border-status-success-border rounded-2xl flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] text-status-success-fg font-bold uppercase block">Current Active PO</span>
            <span className="font-mono font-bold text-status-success-fg text-sm break-all">
              {account.currentPoNumber || 'None'}
            </span>
          </div>
          <Badge variant="success" size="sm" className="shrink-0">
            Active
          </Badge>
        </div>

        {/* Historical List */}
        <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-2.5">
          <span className="text-xs font-extrabold uppercase tracking-wider text-fg-muted block">
            Revoked Historical POs ({history.length})
          </span>

          {history.length === 0 ? (
            <div className="p-4 bg-surface-subtle border border-border-faint rounded-xl text-center text-xs text-fg-subtle">
              No previous PO numbers rotated yet for this account.
            </div>
          ) : (
            history.map((record, idx) => (
              <div
                key={idx}
                className="p-3 bg-surface-subtle border border-border-subtle rounded-xl space-y-1 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-fg-secondary line-through break-all">
                    {record.poNumber}
                  </span>
                  <Badge variant="outline" size="sm" className="text-[10px] text-red-600 border-status-danger-border bg-status-danger-bg shrink-0">
                    Revoked
                  </Badge>
                </div>
                <div className="text-[11px] text-fg-muted flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 pt-0.5">
                  <span>Rotated: {new Date(record.rotatedAt).toLocaleString()}</span>
                  <span className="text-fg-subtle">By: {record.rotatedBy || 'Admin'}</span>
                </div>
                {record.reason && (
                  <p className="text-[11px] text-fg-secondary bg-surface-card p-1.5 rounded border border-border-faint italic">
                    &ldquo;{record.reason}&rdquo;
                  </p>
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </AdminSlideOverDrawer>
  );
}

// ============================================================================
// 3. CORPORATE CSV IMPORT MODAL
// ============================================================================

interface CorporateCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (importedAccounts: CorporateAccountConfig[]) => Promise<void>;
}

export function CorporateCsvImportModal({
  isOpen,
  onClose,
  onImportSuccess,
}: CorporateCsvImportModalProps) {
  const [csvRaw, setCsvRaw] = useState('');
  const [poRequired, setPoRequired] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [creditLimit, setCreditLimit] = useState(5000);
  const [previewAccounts, setPreviewAccounts] = useState<CorporateAccountConfig[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleParse = (
    text: string,
    overrides?: { poRequired?: boolean; discountPercent?: number; creditLimit?: number }
  ) => {
    setCsvRaw(text);
    if (!text.trim()) {
      setPreviewAccounts([]);
      return;
    }
    try {
      const service = getCorporateAccountService();
      const parsed = service.parseCorporateAccountsCsv(text, {
        poRequired: overrides?.poRequired ?? poRequired,
        discountPercent: overrides?.discountPercent ?? discountPercent,
        creditLimit: overrides?.creditLimit ?? creditLimit,
        billingCycle: 'net30',
      });
      setPreviewAccounts(parsed);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to parse CSV');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleParse(content || '');
    };
    reader.readAsText(file);
  };

  const handleCommitImport = async () => {
    if (previewAccounts.length === 0) return;
    try {
      setIsProcessing(true);
      setError(null);
      await onImportSuccess(previewAccounts);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save imported corporate accounts to database.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AdminSlideOverDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Import Corporate Accounts"
      subtitle="Bulk create or update corporate accounts from CSV"
      size="xl"
      footer={
        <>
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleCommitImport}
            disabled={previewAccounts.length === 0 || isProcessing}
            className="font-bold"
          >
            {isProcessing ? 'Importing...' : `Import ${previewAccounts.length} Accounts`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-status-danger-bg border border-status-danger-border rounded-xl text-xs text-status-danger-fg font-medium">
            {error}
          </div>
        )}

        <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-4">
          {/* File Picker & Paste Input */}
          <div>
            <label className="block text-xs font-semibold text-fg-secondary mb-1">Upload CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-xs text-fg-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-status-info-bg file:text-status-info-fg hover:file:bg-status-info-bg-strong cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg-secondary mb-1">Or Paste Raw CSV Data</label>
            <textarea
              rows={4}
              value={csvRaw}
              onChange={(e) => handleParse(e.target.value)}
              placeholder={`"Account ID","Customer","Active","First Name","Last Name","Phone","Address","Contact Email"...`}
              className="w-full px-3 py-2 bg-surface-subtle border border-border-subtle rounded-xl text-xs font-mono text-fg-strong focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Import Defaults Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-surface-subtle rounded-xl border border-border-faint text-xs">
            <div>
              <span className="block font-semibold text-fg-secondary mb-1">Default Credit Limit ($)</span>
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCreditLimit(val);
                  if (csvRaw) handleParse(csvRaw, { creditLimit: val });
                }}
                className="w-full px-2.5 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-xs"
              />
            </div>
            <div>
              <span className="block font-semibold text-fg-secondary mb-1">Contract Discount (%)</span>
              <input
                type="number"
                value={discountPercent}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setDiscountPercent(val);
                  if (csvRaw) handleParse(csvRaw, { discountPercent: val });
                }}
                className="w-full px-2.5 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-xs"
              />
            </div>
            <div className="flex flex-col justify-center">
              <span className="block font-semibold text-fg-secondary mb-1">PO Required</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={poRequired}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setPoRequired(checked);
                    if (csvRaw) handleParse(csvRaw, { poRequired: checked });
                  }}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-[11px] text-fg-secondary font-medium">
                  {poRequired ? 'Enforced' : 'Disabled (Pending)'}
                </span>
              </label>
            </div>
          </div>
        </section>

        {/* Preview List / Table */}
        {previewAccounts.length > 0 && (
          <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
              <span className="font-bold text-fg-strong">
                Ready to Import ({previewAccounts.length} Corporate Accounts)
              </span>
              <span className="text-[11px] text-emerald-600 font-bold inline-flex items-center gap-1">
                <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                Initial POs Auto-Generated
              </span>
            </div>

            {/* Mobile Preview Cards (< sm) */}
            <div className="sm:hidden border border-border-subtle rounded-xl max-h-56 overflow-y-auto divide-y divide-border-faint">
              {previewAccounts.slice(0, 50).map((acc, i) => (
                <div key={i} className="p-2.5 text-[11px] space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-fg-primary truncate">{acc.companyName}</span>
                    <span className="font-mono font-bold text-blue-600 shrink-0">{acc.accountNumber}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-fg-muted">
                    <span className="font-mono text-status-success-fg">{acc.currentPoNumber}</span>
                    <span>Limit ${acc.creditLimit.toLocaleString()} · {acc.discountPercent}% off</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Preview Table (sm+) */}
            <div className="hidden sm:block border border-border-subtle rounded-xl overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-left border-collapse text-[11px] min-w-[480px]">
                <thead className="bg-surface-muted border-b border-border-subtle text-fg-secondary sticky top-0">
                  <tr>
                    <th className="p-2">Account #</th>
                    <th className="p-2">Company</th>
                    <th className="p-2">Generated PO</th>
                    <th className="p-2">Credit Limit</th>
                    <th className="p-2">Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-faint">
                  {previewAccounts.slice(0, 50).map((acc, i) => (
                    <tr key={i} className="hover:bg-surface-subtle">
                      <td className="p-2 font-mono font-bold text-blue-600">{acc.accountNumber}</td>
                      <td className="p-2 font-medium text-fg-strong">{acc.companyName}</td>
                      <td className="p-2 font-mono text-status-success-fg">{acc.currentPoNumber}</td>
                      <td className="p-2">${acc.creditLimit.toLocaleString()}</td>
                      <td className="p-2">{acc.discountPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewAccounts.length > 50 && (
              <p className="text-[10px] text-fg-subtle italic">
                Showing first 50 accounts of {previewAccounts.length} total.
              </p>
            )}
          </section>
        )}
      </div>
    </AdminSlideOverDrawer>
  );
}

// ============================================================================
// 4. VERBAL BOOKING PIN MODAL (4–8 ALPHANUMERIC CALLER AUTH PIN)
// ============================================================================

interface CorporateBookingPinModalProps {
  account: CorporateAccountConfig;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedAccount: CorporateAccountConfig) => void;
  operatorEmail?: string;
}

export function CorporateBookingPinModal({
  account,
  isOpen,
  onClose,
  onSuccess,
  operatorEmail,
}: CorporateBookingPinModalProps) {
  const [bookingPinDraft, setBookingPinDraft] = useState(() =>
    normalizeCorporateBookingPin(account.bookingPin)
  );
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  if (!isOpen) return null;

  const generateRandomPin = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    setBookingPinDraft(out);
    setPinError(null);
  };

  const handleSaveBookingPin = async (clearPin = false) => {
    const cleaned = clearPin ? '' : normalizeCorporateBookingPin(bookingPinDraft);
    if (cleaned && !isValidCorporateBookingPin(cleaned)) {
      setPinError('Verbal Booking PIN must be 4–8 alphanumeric characters (A–Z, 0–9).');
      return;
    }

    try {
      setIsSavingPin(true);
      setPinError(null);
      const configService = getAdminConfigService();
      const settings = await configService.getSettings();
      const accounts = [...(settings.corporateAccounts || [])];
      const idx = accounts.findIndex(
        (a) => a.id === account.id || a.accountNumber === account.accountNumber
      );
      const nowIso = new Date().toISOString();
      const updatedAccount: CorporateAccountConfig = {
        ...(idx >= 0 ? accounts[idx] : account),
        bookingPin: cleaned || undefined,
        updatedAt: nowIso,
      };
      if (idx >= 0) accounts[idx] = updatedAccount;
      else accounts.push(updatedAccount);

      await configService.updateSettings({
        corporateAccounts: accounts,
        updatedBy: operatorEmail || 'admin@chesterfieldtaxi.com',
      });
      await getCorporateAccountService().syncAccountToFirestore(updatedAccount);
      onSuccess(updatedAccount);
      onClose();
    } catch (err: any) {
      setPinError(err?.message || 'Failed to save Verbal Booking PIN.');
    } finally {
      setIsSavingPin(false);
    }
  };

  return (
    <AdminSlideOverDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Verbal Booking PIN"
      subtitle={`${account.companyName} (${account.accountNumber})`}
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isSavingPin}>
            Cancel
          </Button>
          {account.bookingPin && (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => void handleSaveBookingPin(true)}
              disabled={isSavingPin}
              className="text-status-danger-fg border-status-danger-border hover:bg-status-danger-bg font-bold"
            >
              Remove PIN
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => void handleSaveBookingPin(false)}
            disabled={isSavingPin}
            leftIcon={<ShieldCheckIcon className="w-4 h-4" />}
            className="font-bold"
          >
            {isSavingPin ? 'Saving...' : 'Save Booking PIN'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        {pinError && (
          <div className="p-3 bg-status-danger-bg border border-status-danger-border rounded-xl text-status-danger-fg font-semibold">
            {pinError}
          </div>
        )}
        <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-3">
          <p className="text-fg-secondary leading-relaxed">
            Configure an optional <strong>4–8 alphanumeric Verbal Booking PIN</strong> that dispatchers can verify when callers book rides under this corporate account.
          </p>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-fg-secondary">Verbal Booking PIN (4–8 chars)</label>
              <button
                type="button"
                onClick={generateRandomPin}
                className="text-[11px] font-bold text-blue-600 hover:text-status-info-fg cursor-pointer"
              >
                Generate 6-Char PIN
              </button>
            </div>
            <input
              type="text"
              maxLength={8}
              value={bookingPinDraft}
              onChange={(e) => {
                setBookingPinDraft(normalizeCorporateBookingPin(e.target.value));
                if (pinError) setPinError(null);
              }}
              placeholder="e.g. BAYR26"
              className="w-full h-10 px-3 bg-surface-card border border-border-strong rounded-xl text-sm font-mono font-bold tracking-widest uppercase text-fg-primary focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </section>
      </div>
    </AdminSlideOverDrawer>
  );
}

// ============================================================================
// 5. CORPORATE JSON IMPORT MODAL (WITH DRY-RUN MERGE PREVIEW)
// ============================================================================

interface CorporateImportJsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingAccounts: CorporateAccountConfig[];
  onImportSuccess: (mergeResult: CorporateJsonMergeResult) => Promise<void>;
}

export function CorporateImportJsonModal({
  isOpen,
  onClose,
  existingAccounts,
  onImportSuccess,
}: CorporateImportJsonModalProps) {
  const [jsonRaw, setJsonRaw] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewAccounts, setPreviewAccounts] = useState<CorporateAccountConfig[]>([]);
  const [mergePreview, setMergePreview] = useState<CorporateJsonMergeResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setJsonRaw('');
    setFileName(null);
    setPreviewAccounts([]);
    setMergePreview(null);
    setError(null);
    onClose();
  };

  const handleParse = (text: string) => {
    setJsonRaw(text);
    if (!text.trim()) {
      setPreviewAccounts([]);
      setMergePreview(null);
      setError(null);
      return;
    }
    try {
      const service = getCorporateAccountService();
      const parsed = service.parseCorporateAccountsJson(text, {
        poRequired: false,
        discountPercent: 0,
        creditLimit: 5000,
        billingCycle: 'net30',
      });
      if (parsed.length === 0) {
        setPreviewAccounts([]);
        setMergePreview(null);
        setError('No valid corporate accounts were found in the provided JSON.');
        return;
      }
      const dryRun = service.mergeCorporateAccounts(existingAccounts, parsed);
      setPreviewAccounts(parsed);
      setMergePreview(dryRun);
      setError(null);
    } catch (err: unknown) {
      setPreviewAccounts([]);
      setMergePreview(null);
      setError(err instanceof Error ? err.message : 'Failed to parse JSON');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || '';
      handleParse(content);
    };
    reader.readAsText(file);
  };

  const handleCommitImport = async () => {
    if (!mergePreview || (mergePreview.addedCount === 0 && mergePreview.updatedCount === 0)) return;
    try {
      setIsProcessing(true);
      setError(null);
      await onImportSuccess(mergePreview);
      resetAndClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save imported corporate accounts to database.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const totalActionable = mergePreview
    ? mergePreview.addedCount + mergePreview.updatedCount
    : 0;

  return (
    <AdminSlideOverDrawer
      isOpen={isOpen}
      onClose={resetAndClose}
      title="Import Corporate Accounts (JSON)"
      subtitle="Upload corporate_accounts.json to preview dry-run merge and upsert directory profiles"
      size="xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={resetAndClose}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleCommitImport}
            disabled={totalActionable === 0 || isProcessing}
            className="font-bold"
          >
            {isProcessing ? 'Importing...' : `Import ${totalActionable} Accounts`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-status-danger-bg border border-status-danger-border rounded-xl text-xs text-status-danger-fg font-medium flex items-start gap-2">
            <AlertCircleIcon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-fg-secondary mb-1">
              Upload JSON File (.json)
            </label>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="block w-full text-xs text-fg-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-status-info-bg file:text-status-info-fg hover:file:bg-status-info-bg-strong cursor-pointer"
            />
            {fileName && (
              <p className="mt-1 text-[11px] text-fg-muted">
                Loaded file: <span className="font-mono font-semibold text-fg-secondary">{fileName}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg-secondary mb-1">
              Or Paste Raw JSON Data
            </label>
            <textarea
              rows={4}
              value={jsonRaw}
              onChange={(e) => handleParse(e.target.value)}
              placeholder={`{\n  "100": {\n    "name": "Liberty Mutual Group",\n    "address": "Attn: Accounts Payable<br>10733 Sunset Office Dr. Suite 410<br>St. Louis, MO 63127",\n    "type": "standard"\n  }\n}`}
              className="w-full px-3 py-2 bg-surface-subtle border border-border-subtle rounded-xl text-xs font-mono text-fg-strong focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </section>

        {mergePreview && previewAccounts.length > 0 && (
          <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="font-bold text-fg-strong">Dry-Run Merge Preview</span>
              <span className="text-[11px] text-status-success-fg font-semibold inline-flex items-center gap-1">
                <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                Preserves existing POs, PINs, limits &amp; portal users
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle">
                <div className="text-[10px] font-bold uppercase text-fg-muted">Parsed</div>
                <div className="text-base font-black text-fg-primary">{previewAccounts.length}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-status-success-bg border border-status-success-border">
                <div className="text-[10px] font-bold uppercase text-status-success-fg">New Accounts</div>
                <div className="text-base font-black text-status-success-fg">{mergePreview.addedCount}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-status-info-bg border border-status-info-border">
                <div className="text-[10px] font-bold uppercase text-status-info-fg">Updated</div>
                <div className="text-base font-black text-status-info-fg">{mergePreview.updatedCount}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle">
                <div className="text-[10px] font-bold uppercase text-fg-muted">Skipped</div>
                <div className="text-base font-black text-fg-secondary">{mergePreview.skippedCount}</div>
              </div>
            </div>

            {/* Mobile Preview Cards (< sm) */}
            <div className="sm:hidden border border-border-subtle rounded-xl max-h-56 overflow-y-auto divide-y divide-border-faint">
              {previewAccounts.slice(0, 50).map((acc, i) => (
                <div key={i} className="p-2.5 text-[11px] space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-fg-primary truncate">{acc.companyName}</span>
                    <span className="font-mono font-bold text-blue-600 shrink-0">
                      {acc.accountNumber}
                    </span>
                  </div>
                  <div className="text-[10px] text-fg-secondary truncate">
                    Contact: {acc.billingContactName}
                    {acc.billingContactEmail ? ` (${acc.billingContactEmail})` : ''}
                  </div>
                  {acc.billingAddress && (
                    <div className="text-[10px] text-fg-muted whitespace-pre-line">
                      {acc.billingAddress}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Preview Table (sm+) */}
            <div className="hidden sm:block border border-border-subtle rounded-xl overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-left border-collapse text-[11px] min-w-[540px]">
                <thead className="bg-surface-muted border-b border-border-subtle text-fg-secondary sticky top-0">
                  <tr>
                    <th className="p-2">Account #</th>
                    <th className="p-2">Company</th>
                    <th className="p-2">Billing Contact</th>
                    <th className="p-2">Email</th>
                    <th className="p-2">Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-faint">
                  {previewAccounts.slice(0, 50).map((acc, i) => (
                    <tr key={i} className="hover:bg-surface-subtle align-top">
                      <td className="p-2 font-mono font-bold text-blue-600 whitespace-nowrap">
                        {acc.accountNumber}
                      </td>
                      <td className="p-2 font-medium text-fg-strong">{acc.companyName}</td>
                      <td className="p-2 text-fg-secondary">{acc.billingContactName}</td>
                      <td className="p-2 text-blue-600">{acc.billingContactEmail || '—'}</td>
                      <td className="p-2 text-fg-muted whitespace-pre-line">
                        {acc.billingAddress || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewAccounts.length > 50 && (
              <p className="text-[10px] text-fg-subtle italic">
                Showing first 50 accounts of {previewAccounts.length} total.
              </p>
            )}
          </section>
        )}
      </div>
    </AdminSlideOverDrawer>
  );
}
