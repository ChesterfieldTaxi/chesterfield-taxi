import React, { useState } from 'react';
import type { CorporateAccountConfig, PoHistoryRecord } from '../../../../core/types/config';
import { getCorporateAccountService } from '../../../../core/services/corporate-account.service';
import { Button } from '../../../ui/Button';
import { Badge } from '../../../ui/Badge';
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
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">Regenerate Corporate PO Number</h3>
              <p className="text-xs text-slate-500">{account.companyName} ({account.accountNumber})</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold text-lg px-2"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        {!rotatedResult ? (
          <div className="space-y-4 text-xs">
            {/* Anti-Fraud Notice */}
            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5 text-amber-900">
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
              <label className="block font-bold text-slate-700 mb-1.5">Reason for PO Rotation</label>
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
                    className={`text-[10px] px-2.5 py-1 rounded-lg border font-medium transition-colors ${
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
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isRotating}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleRegenerate}
                disabled={isRotating}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5"
              >
                <RefreshCwIcon className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
                {isRotating ? 'Regenerating & Revoking Old PO...' : 'Confirm & Regenerate PO'}
              </Button>
            </div>
          </div>
        ) : (
          /* SUCCESS STATE */
          <div className="space-y-4 text-center py-2 animate-in fade-in-50">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckIcon className="w-6 h-6" />
            </div>

            <div>
              <h4 className="text-sm font-black text-slate-900">New PO Code Generated!</h4>
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

            <div className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="w-full">
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
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
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-slate-900 text-base">PO Audit &amp; Rotation History</h3>
            <p className="text-xs text-slate-500">{account.companyName} • {account.accountNumber}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold text-lg px-2"
          >
            ✕
          </button>
        </div>

        {/* Current Active PO */}
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-emerald-700 font-bold uppercase block">Current Active PO</span>
            <span className="font-mono font-bold text-emerald-950 text-sm">
              {account.currentPoNumber || 'None'}
            </span>
          </div>
          <Badge variant="success" size="sm">
            Active
          </Badge>
        </div>

        {/* Historical List */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          <span className="text-[11px] font-bold text-slate-600 block">
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
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-700 line-through">
                    {record.poNumber}
                  </span>
                  <Badge variant="outline" size="sm" className="text-[10px] text-red-600 border-red-200 bg-red-50">
                    Revoked
                  </Badge>
                </div>
                <div className="text-[11px] text-slate-500 flex items-center justify-between pt-0.5">
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
        </div>

        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
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

  const handleParse = (text: string) => {
    setCsvRaw(text);
    if (!text.trim()) {
      setPreviewAccounts([]);
      return;
    }
    try {
      const service = getCorporateAccountService();
      const parsed = service.parseCorporateAccountsCsv(text, {
        poRequired,
        discountPercent,
        creditLimit,
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
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col animate-in zoom-in-95">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-slate-900 text-base">Import Corporate Accounts from CSV</h3>
            <p className="text-xs text-slate-500">
              Bulk create or update corporate accounts directly in the database.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold text-lg px-2"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        <div className="space-y-3 overflow-y-auto pr-1">
          {/* File Picker & Paste Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Upload CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Or Paste Raw CSV Data</label>
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
                  if (csvRaw) handleParse(csvRaw);
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
                  if (csvRaw) handleParse(csvRaw);
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
                    if (csvRaw) handleParse(csvRaw);
                  }}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-[11px] text-slate-600 font-medium">
                  {poRequired ? 'Enforced' : 'Disabled (Pending)'}
                </span>
              </label>
            </div>
          </div>

          {/* Preview Table */}
          {previewAccounts.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  Ready to Import ({previewAccounts.length} Corporate Accounts)
                </span>
                <span className="text-[11px] text-emerald-600 font-bold">
                  ✓ Initial POs Auto-Generated
                </span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left border-collapse text-[11px]">
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
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleCommitImport}
            disabled={previewAccounts.length === 0 || isProcessing}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
          >
            {isProcessing ? 'Importing to Database...' : `Commit ${previewAccounts.length} Accounts to Database`}
          </Button>
        </div>
      </div>
    </div>
  );
}
