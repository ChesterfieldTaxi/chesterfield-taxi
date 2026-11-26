import React, { useState, useEffect } from 'react';
import type { CorporateAccountConfig } from '../../../../core/types/config';
import {
  getCorporatePortalService,
  type ProvisionCorporateManagerResult,
} from '../../../../core/services/corporate-portal.service';
import { Button } from '../../../ui/Button';
import {
  CheckIcon,
  CopyIcon,
  UserCheckIcon,
  XIcon,
} from '../../../ui/Icons';

export interface CorporatePortalManagersModalProps {
  provisioningCorp: CorporateAccountConfig | null;
  onClose: () => void;
  onProvisioned: (updatedAccount: CorporateAccountConfig) => Promise<void>;
}

export function CorporatePortalManagersModal({
  provisioningCorp,
  onClose,
  onProvisioned,
}: CorporatePortalManagersModalProps) {
  const [mgrName, setMgrName] = useState('');
  const [mgrEmail, setMgrEmail] = useState('');
  const [mgrPhone, setMgrPhone] = useState('');
  const [mgrIncludeCustomerRole, setMgrIncludeCustomerRole] = useState(false);
  const [isProvisioningMgr, setIsProvisioningMgr] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisionResult, setProvisionResult] = useState<ProvisionCorporateManagerResult | null>(
    null
  );
  const [copiedInstructions, setCopiedInstructions] = useState(false);

  useEffect(() => {
    if (provisioningCorp) {
      setMgrName(provisioningCorp.billingContactName || '');
      setMgrEmail(provisioningCorp.billingContactEmail || '');
      setMgrPhone(provisioningCorp.billingContactPhone || '');
      setMgrIncludeCustomerRole(false);
      setProvisionError(null);
      setProvisionResult(null);
      setCopiedInstructions(false);
    }
  }, [provisioningCorp?.id]);

  if (!provisioningCorp) return null;

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProvisioningMgr(true);
    setProvisionError(null);
    try {
      const result = await getCorporatePortalService().provisionCorporatePortalManager({
        corporateAccount: provisioningCorp,
        managerName: mgrName,
        managerEmail: mgrEmail,
        managerPhone: mgrPhone,
        includeCustomerRole: mgrIncludeCustomerRole,
      });
      await onProvisioned(result.updatedAccount);
      setProvisionResult(result);
    } catch (err: any) {
      setProvisionError(err?.message || 'Unable to provision Corporate Portal Manager.');
    } finally {
      setIsProvisioningMgr(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-surface-overlay/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl border border-border-subtle max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 text-xs">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-border-faint">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-status-staged-bg border border-status-staged-border text-indigo-600 flex items-center justify-center shrink-0">
              <UserCheckIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-fg-primary">
                Provision Corporate Portal Manager
              </h3>
              <p className="text-[11px] text-fg-muted">
                {provisioningCorp.companyName} ({provisioningCorp.accountNumber})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-subtle hover:text-fg-secondary cursor-pointer"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {provisionError && (
          <div className="p-3 rounded-xl bg-status-danger-bg border border-status-danger-border text-status-danger-fg font-semibold">
            {provisionError}
          </div>
        )}

        {provisionResult ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-status-success-bg border border-status-success-border text-status-success-fg space-y-1">
              <div className="font-extrabold flex items-center gap-1.5">
                <CheckIcon className="w-4 h-4 text-emerald-600" />
                <span>Corporate Portal Manager Provisioned ({provisionResult.email})</span>
              </div>
              <p className="text-[11px] text-status-success-fg">
                Bound strictly to <strong>{provisionResult.corporateAccountNumber}</strong> (
                <code>{provisionResult.corporateAccountId}</code>) with role{' '}
                <code>{provisionResult.roles.join(', ')}</code>.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-fg-secondary">
                  Copyable Client Login Instructions (/app/corporate)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(provisionResult.instructionsText);
                    setCopiedInstructions(true);
                    setTimeout(() => setCopiedInstructions(false), 2500);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-status-staged-fg cursor-pointer"
                >
                  {copiedInstructions ? (
                    <>
                      <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-status-success-fg">Copied!</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span>Copy Instructions</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-surface-header text-fg-on-header font-mono text-[11px] whitespace-pre-wrap break-all leading-relaxed border border-border-header">
                {provisionResult.instructionsText}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={onClose}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleProvision} className="space-y-3.5">
            <div>
              <label className="font-semibold text-fg-secondary block mb-1">
                Manager Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={mgrName}
                onChange={(e) => setMgrName(e.target.value)}
                placeholder="e.g. Laura Vance"
                className="w-full h-10 px-3 bg-surface-card border border-border-strong rounded-xl text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-fg-secondary block mb-1">
                  Corporate Login Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={mgrEmail}
                  onChange={(e) => setMgrEmail(e.target.value)}
                  placeholder="traveldesk@company.com"
                  className="w-full h-10 px-3 bg-surface-card border border-border-strong rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-fg-secondary block mb-1">
                  Direct Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={mgrPhone}
                  onChange={(e) => setMgrPhone(e.target.value)}
                  placeholder="(314) 555-0190"
                  className="w-full h-10 px-3 bg-surface-card border border-border-strong rounded-xl text-xs"
                />
              </div>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-subtle border border-border-subtle cursor-pointer">
              <input
                type="checkbox"
                checked={mgrIncludeCustomerRole}
                onChange={(e) => setMgrIncludeCustomerRole(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-border-strong text-indigo-600"
              />
              <div>
                <span className="font-bold text-fg-strong block">
                  Also grant personal Client Portal (customer) workspace
                </span>
                <span className="text-[11px] text-fg-muted">
                  Leave unchecked so this manager lands directly inside /app/corporate upon login.
                </span>
              </div>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-faint">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isProvisioningMgr}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
              >
                Provision Portal Access
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
