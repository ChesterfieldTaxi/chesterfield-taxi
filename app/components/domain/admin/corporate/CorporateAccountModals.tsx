import React, { useState } from 'react';
import type { CorporateAccountConfig, PoHistoryRecord } from '../../../../core/types/config';
import { getCorporateAccountService } from '../../../../core/services/corporate-account.service';
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
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        {!rotatedResult ? (
          <div className="space-y-4 text-xs">
            {/* Anti-Fraud Notice */}
            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-1.5 text-amber-900">
              <div className="font-bold flex items-center gap-1.5 text-amber-800">
                <AlertCircleIcon className="w-4 h-4 text-amber-600 shrink-0" />
                Anti-Fraud PO Rotation Notice
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800/90">
                Regenerating will immediately revoke active PO code{' '}
                <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-300">
                  {account.currentPoNumber || 'N/A'}
                </strong>{' '}
                and generate a new unguessable billing code.
              </p>
              <p className="text-[11px] text-amber-700/80">
                Any future booking attempting to charge rides using the revoked PO will be automatically rejected with an unauthorized billing alert.
              </p>
            </div>

            {/* Current PO Info */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Current Active PO</span>
                  <span className="font-mono font-bold text-slate-800 text-xs">
                    {account.currentPoNumber || 'None (Unassigned)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Issued At</span>
                  <span className="text-slate-700 text-xs">
                    {account.poGeneratedAt ? new Date(account.poGeneratedAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Reason Presets */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Reason for PO Rotation</label>
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
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
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
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </section>
          </div>
        ) : (
          /* SUCCESS STATE */
          <section className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-4 text-center animate-in fade-in-50">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckIcon className="w-6 h-6" />
            </div>

            <div>
              <h4 className="text-sm font-black text-slate-900">New PO Code Generated</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                The previous PO code has been revoked. Provide this new code to authorized bookers.
              </p>
            </div>

            <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2 border border-slate-800 shadow-inner">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Active Corporate PO Number
              </span>
              <div className="font-mono text-lg font-black tracking-wider text-emerald-400 select-all">
                {rotatedResult.newPo}
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleCopy}
                className="mx-auto text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 gap-1.5 mt-1"
              >
                {copied ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" /> : <CopyIcon className="w-3.5 h-3.5" />}
                {copied ? 'Copied to Clipboard!' : 'Copy New PO'}
              </Button>
            </div>

            {rotatedResult.oldPo && (
              <p className="text-[11px] text-slate-400 font-mono">
                Revoked Code: <span className="line-through text-slate-500">{rotatedResult.oldPo}</span>
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
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] text-emerald-700 font-bold uppercase block">Current Active PO</span>
            <span className="font-mono font-bold text-emerald-950 text-sm break-all">
              {account.currentPoNumber || 'None'}
            </span>
          </div>
          <Badge variant="success" size="sm" className="shrink-0">
            Active
          </Badge>
        </div>

        {/* Historical List */}
        <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-2.5">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 block">
            Revoked Historical POs ({history.length})
          </span>

          {history.length === 0 ? (
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center text-xs text-slate-400">
              No previous PO numbers rotated yet for this account.
            </div>
          ) : (
            history.map((record, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-slate-700 line-through break-all">
                    {record.poNumber}
                  </span>
                  <Badge variant="outline" size="sm" className="text-[10px] text-red-600 border-red-200 bg-red-50 shrink-0">
                    Revoked
                  </Badge>
                </div>
                <div className="text-[11px] text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 pt-0.5">
                  <span>Rotated: {new Date(record.rotatedAt).toLocaleString()}</span>
                  <span className="text-slate-400">By: {record.rotatedBy || 'Admin'}</span>
                </div>
                {record.reason && (
                  <p className="text-[11px] text-slate-600 bg-white p-1.5 rounded border border-slate-100 italic">
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
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
          {/* File Picker & Paste Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Upload CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Or Paste Raw CSV Data</label>
            <textarea
              rows={4}
              value={csvRaw}
              onChange={(e) => handleParse(e.target.value)}
              placeholder={`"Account ID","Customer","Active","First Name","Last Name","Phone","Address","Contact Email"...`}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Import Defaults Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
            <div>
              <span className="block font-semibold text-slate-700 mb-1">Default Credit Limit ($)</span>
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCreditLimit(val);
                  if (csvRaw) handleParse(csvRaw, { creditLimit: val });
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <span className="block font-semibold text-slate-700 mb-1">Contract Discount (%)</span>
              <input
                type="number"
                value={discountPercent}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setDiscountPercent(val);
                  if (csvRaw) handleParse(csvRaw, { discountPercent: val });
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div className="flex flex-col justify-center">
              <span className="block font-semibold text-slate-700 mb-1">PO Required</span>
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
                <span className="text-[11px] text-slate-600 font-medium">
                  {poRequired ? 'Enforced' : 'Disabled (Pending)'}
                </span>
              </label>
            </div>
          </div>
        </section>

        {/* Preview List / Table */}
        {previewAccounts.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
              <span className="font-bold text-slate-800">
                Ready to Import ({previewAccounts.length} Corporate Accounts)
              </span>
              <span className="text-[11px] text-emerald-600 font-bold inline-flex items-center gap-1">
                <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                Initial POs Auto-Generated
              </span>
            </div>

            {/* Mobile Preview Cards (< sm) */}
            <div className="sm:hidden border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
              {previewAccounts.slice(0, 50).map((acc, i) => (
                <div key={i} className="p-2.5 text-[11px] space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 truncate">{acc.companyName}</span>
                    <span className="font-mono font-bold text-blue-600 shrink-0">{acc.accountNumber}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500">
                    <span className="font-mono text-emerald-700">{acc.currentPoNumber}</span>
                    <span>Limit ${acc.creditLimit.toLocaleString()} · {acc.discountPercent}% off</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Preview Table (sm+) */}
            <div className="hidden sm:block border border-slate-200 rounded-xl overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-left border-collapse text-[11px] min-w-[480px]">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 sticky top-0">
                  <tr>
                    <th className="p-2">Account #</th>
                    <th className="p-2">Company</th>
                    <th className="p-2">Generated PO</th>
                    <th className="p-2">Credit Limit</th>
                    <th className="p-2">Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewAccounts.slice(0, 50).map((acc, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 font-mono font-bold text-blue-600">{acc.accountNumber}</td>
                      <td className="p-2 font-medium text-slate-800">{acc.companyName}</td>
                      <td className="p-2 font-mono text-emerald-700">{acc.currentPoNumber}</td>
                      <td className="p-2">${acc.creditLimit.toLocaleString()}</td>
                      <td className="p-2">{acc.discountPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewAccounts.length > 50 && (
              <p className="text-[10px] text-slate-400 italic">
                Showing first 50 accounts of {previewAccounts.length} total.
              </p>
            )}
          </section>
        )}
      </div>
    </AdminSlideOverDrawer>
  );
}
