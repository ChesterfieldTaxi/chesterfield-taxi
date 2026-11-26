import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { AppSettings, CorporateAccountConfig } from '../../../../core/types/config';
import {
  getCorporateAccountService,
  type CorporateArchivalExposure,
  type CorporateJsonMergeResult,
} from '../../../../core/services/corporate-account.service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  AlertTriangleIcon,
  ArchiveBoxIcon,
  CheckIcon,
  CopyIcon,
  CreditCardIcon,
  EditIcon,
  ExternalLinkIcon,
  FileTextIcon,
  MapPinIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SpinnerIcon,
  UserCheckIcon,
  UsersIcon,
  XIcon,
} from '../../../ui/Icons';
import {
  RegeneratePoModal,
  PoHistoryModal,
  CorporateBookingPinModal,
  CorporateImportJsonModal,
} from '../corporate/CorporateAccountModals';
import { CorporateGovernanceCard } from './CorporateGovernanceCard';

const CORP_PAGE_SIZE = 30;

export interface CorporateDirectoryPanelProps {
  settings: AppSettings;
  corporateClients: CorporateAccountConfig[];
  onSave?: (updates: Partial<AppSettings>) => Promise<void>;
  onAddNewCorporate: () => void;
  onEditCorporate: (corp: CorporateAccountConfig) => void;
  onOpenProvisionModal: (corp: CorporateAccountConfig) => void;
  onTogglePoRequired: (corp: CorporateAccountConfig) => Promise<void>;
  onPoRegenerateSuccess: (updatedAccount: CorporateAccountConfig) => Promise<void>;
  onImportCorporateAccounts?: (mergeResult: CorporateJsonMergeResult) => Promise<void>;
  onArchiveCorporate?: (corp: CorporateAccountConfig, reason?: string) => Promise<void>;
  pendingArchiveCorp?: CorporateAccountConfig | null;
  onClearPendingArchiveCorp?: () => void;
}

export function CorporateDirectoryPanel({
  settings,
  corporateClients,
  onSave,
  onAddNewCorporate,
  onEditCorporate,
  onOpenProvisionModal,
  onTogglePoRequired,
  onPoRegenerateSuccess,
  onImportCorporateAccounts,
  onArchiveCorporate,
  pendingArchiveCorp,
  onClearPendingArchiveCorp,
}: CorporateDirectoryPanelProps) {
  const [corpSearchTerm, setCorpSearchTerm] = useState('');
  const [corpFilter, setCorpFilter] = useState<'all' | 'po_enforced' | 'po_disabled'>('all');
  const [corpPage, setCorpPage] = useState(1);
  const [copiedPoId, setCopiedPoId] = useState<string | null>(null);
  const [selectedPoAccount, setSelectedPoAccount] = useState<CorporateAccountConfig | null>(null);
  const [isRegeneratePoOpen, setIsRegeneratePoOpen] = useState(false);
  const [isPoHistoryOpen, setIsPoHistoryOpen] = useState(false);
  const [isBookingPinOpen, setIsBookingPinOpen] = useState(false);
  const [isImportJsonOpen, setIsImportJsonOpen] = useState(false);
  const [archivingCorp, setArchivingCorp] = useState<CorporateAccountConfig | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveExposure, setArchiveExposure] = useState<CorporateArchivalExposure | null>(null);
  const [isCheckingExposure, setIsCheckingExposure] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const openArchiveModal = async (corp: CorporateAccountConfig) => {
    setArchivingCorp(corp);
    setArchiveReason('');
    setArchiveExposure(null);
    setIsCheckingExposure(true);
    try {
      const exposure = await getCorporateAccountService().checkArchivalExposure(
        corp,
        settings.invoices
      );
      setArchiveExposure(exposure);
    } catch {
      setArchiveExposure(null);
    } finally {
      setIsCheckingExposure(false);
    }
  };

  useEffect(() => {
    if (pendingArchiveCorp) {
      void openArchiveModal(pendingArchiveCorp);
      onClearPendingArchiveCorp?.();
    }
  }, [pendingArchiveCorp]);

  const closeArchiveModal = () => {
    if (isArchiving) return;
    setArchivingCorp(null);
    setArchiveReason('');
    setArchiveExposure(null);
  };

  const confirmArchive = async () => {
    if (!archivingCorp || !onArchiveCorporate) return;
    setIsArchiving(true);
    try {
      await onArchiveCorporate(archivingCorp, archiveReason.trim() || undefined);
      setArchivingCorp(null);
      setArchiveReason('');
      setArchiveExposure(null);
    } finally {
      setIsArchiving(false);
    }
  };

  const activeCorporateClients = corporateClients.filter((corp) => !corp.isArchived);

  const handleCopyPo = (po: string, id: string) => {
    navigator.clipboard?.writeText(po);
    setCopiedPoId(id);
    setTimeout(() => setCopiedPoId(null), 2000);
  };

  const filteredCorp = activeCorporateClients.filter((corp) => {
    if (corpFilter === 'po_enforced' && !corp.poRequired) return false;
    if (corpFilter === 'po_disabled' && corp.poRequired) return false;
    if (!corpSearchTerm.trim()) return true;
    const q = corpSearchTerm.toLowerCase();
    return (
      corp.companyName.toLowerCase().includes(q) ||
      corp.accountNumber.toLowerCase().includes(q) ||
      Boolean(corp.currentPoNumber && corp.currentPoNumber.toLowerCase().includes(q)) ||
      Boolean(corp.billingContactEmail && corp.billingContactEmail.toLowerCase().includes(q)) ||
      Boolean(corp.billingAddress && corp.billingAddress.toLowerCase().includes(q))
    );
  });

  const totalCorpPages = Math.max(1, Math.ceil(filteredCorp.length / CORP_PAGE_SIZE));
  const paginatedCorp = filteredCorp.slice(
    (corpPage - 1) * CORP_PAGE_SIZE,
    corpPage * CORP_PAGE_SIZE
  );

  return (
    <div className="space-y-4">
      {/* ─── Global Corporate Portal & PO Governance Card ─── */}
      <CorporateGovernanceCard settings={settings} onSave={onSave} />

      {/* ─── Search & PO Filter Toolbar ─── */}
      <div className="bg-surface-card p-3 sm:p-4 rounded-2xl border border-border-subtle/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 min-w-0">
          <div className="relative w-full sm:w-64 lg:w-80">
            <input
              type="text"
              placeholder={`Search ${activeCorporateClients.length} corporate accounts...`}
              value={corpSearchTerm}
              onChange={(e) => {
                setCorpSearchTerm(e.target.value);
                setCorpPage(1);
              }}
              className="w-full pl-3 pr-8 py-2 bg-surface-subtle border border-border-subtle rounded-xl text-xs text-fg-strong placeholder-fg-subtle focus:bg-surface-card focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {corpSearchTerm && (
              <button
                type="button"
                onClick={() => {
                  setCorpSearchTerm('');
                  setCorpPage(1);
                }}
                aria-label="Clear corporate search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-secondary cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 sm:inline-flex bg-surface-muted p-1 rounded-xl border border-border-subtle text-xs font-semibold w-full sm:w-auto">
            {(['all', 'po_enforced', 'po_disabled'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setCorpFilter(mode);
                  setCorpPage(1);
                }}
                className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-colors text-center whitespace-nowrap cursor-pointer ${
                  corpFilter === mode
                    ? 'bg-surface-card text-fg-primary shadow-xs font-bold'
                    : 'text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {mode === 'all' && `All (${activeCorporateClients.length})`}
                {mode === 'po_enforced' &&
                  `PO Enforced (${activeCorporateClients.filter((a) => a.poRequired).length})`}
                {mode === 'po_disabled' &&
                  `PO Optional (${activeCorporateClients.filter((a) => !a.poRequired).length})`}
              </button>
            ))}
          </div>
        </div>

        {onSave && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<FileTextIcon className="w-4 h-4" />}
              onClick={() => setIsImportJsonOpen(true)}
              className="text-xs font-bold justify-center"
            >
              Import JSON
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              leftIcon={<PlusIcon className="w-4 h-4" />}
              onClick={onAddNewCorporate}
              className="text-xs font-bold justify-center"
            >
              Add Corporate Account
            </Button>
          </div>
        )}
      </div>

      {/* ─── Corporate Directory Grid (Identity, PO Security & Portal Access Only) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedCorp.map((corp) => {
          const riderCount = (corp.authorizedRiders || []).length;
          const locCount = (corp.savedCompanyLocations || []).length;
          const ccCount = (corp.costCenters || []).length;
          const mgrCount = (corp.portalManagers || []).length;

          return (
            <Card
              key={corp.id}
              className="border border-border-subtle/90 shadow-xs flex flex-col justify-between hover:border-border-strong transition-all"
            >
              <div>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-black text-fg-primary line-clamp-1">
                        {corp.companyName}
                      </CardTitle>
                      <CardDescription className="text-xs font-mono font-bold text-blue-600">
                        {corp.accountNumber}
                        {corp.taxId ? ` · EIN ${corp.taxId}` : ''}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={corp.isActive ? 'success' : 'default'} size="sm" className="text-[10px]">
                        {corp.isActive ? 'Active' : 'Paused'}
                      </Badge>
                      {onSave && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEditCorporate(corp)}
                            className="p-1 rounded-lg text-fg-subtle hover:text-blue-600 hover:bg-status-info-bg transition-colors cursor-pointer"
                            title="Edit Corporate Directory Profile"
                          >
                            <EditIcon className="w-3.5 h-3.5" />
                          </button>
                          {onArchiveCorporate && (
                            <button
                              type="button"
                              onClick={() => void openArchiveModal(corp)}
                              className="p-1 rounded-lg text-fg-subtle hover:text-status-warning-fg hover:bg-status-warning-bg transition-colors cursor-pointer"
                              title="Archive Corporate Account"
                            >
                              <ArchiveBoxIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2.5 text-xs">
                  {/* PO Security Box */}
                  <div className="p-2.5 bg-surface-subtle rounded-xl border border-border-subtle/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted flex items-center gap-1">
                        <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                        Authorized PO Number
                      </span>
                      <Badge
                        variant={corp.poRequired ? 'success' : 'default'}
                        size="sm"
                        className="text-[9px]"
                      >
                        {corp.poRequired ? 'PO Enforced' : 'PO Optional'}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between bg-surface-card px-2 py-1.5 rounded-lg border border-border-subtle">
                      <span className="font-mono font-bold text-fg-primary text-xs">
                        {corp.currentPoNumber || 'None'}
                      </span>
                      {corp.currentPoNumber && (
                        <button
                          type="button"
                          onClick={() => handleCopyPo(corp.currentPoNumber!, corp.id)}
                          className="text-[10px] text-blue-600 hover:text-status-info-fg font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          {copiedPoId === corp.id ? (
                            <>
                              <CheckIcon className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-600 font-bold">Copied</span>
                            </>
                          ) : (
                            <>
                              <CopyIcon className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedPoAccount(corp);
                          setIsRegeneratePoOpen(true);
                        }}
                        className="text-[10px] font-bold text-status-warning-fg bg-status-warning-bg hover:bg-status-warning-bg-strong border-status-warning-border flex-1 py-1 h-auto cursor-pointer"
                      >
                        <RefreshCwIcon className="w-3 h-3 mr-1" />
                        Regenerate PO
                      </Button>

                      {onSave && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onTogglePoRequired(corp)}
                          className="text-[10px] text-fg-secondary hover:text-fg-primary py-1 h-auto px-2 cursor-pointer"
                        >
                          {corp.poRequired ? 'Disable PO' : 'Enforce PO'}
                        </Button>
                      )}

                      {onSave && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedPoAccount(corp);
                            setIsBookingPinOpen(true);
                          }}
                          className="text-[10px] text-status-staged-fg hover:text-status-staged-fg py-1 h-auto px-2 cursor-pointer"
                        >
                          {corp.bookingPin ? `PIN (${corp.bookingPin.length})` : 'Set PIN'}
                        </Button>
                      )}

                      {corp.poNumberHistory && corp.poNumberHistory.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedPoAccount(corp);
                            setIsPoHistoryOpen(true);
                          }}
                          className="text-[10px] text-blue-600 hover:text-status-info-fg py-1 h-auto px-2 cursor-pointer"
                        >
                          History ({corp.poNumberHistory.length})
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Directory Contact & Saved Assets Summary */}
                  <div className="p-2.5 bg-surface-subtle rounded-xl space-y-1 text-[11px]">
                    <div className="font-bold text-fg-strong truncate">
                      {corp.billingContactName || 'Travel Desk Contact'}
                    </div>
                    <div className="text-blue-600 truncate">{corp.billingContactEmail || 'No email'}</div>
                    {corp.billingContactPhone && (
                      <div className="text-fg-secondary font-mono text-[10px]">{corp.billingContactPhone}</div>
                    )}
                    {corp.billingAddress && (
                      <div className="text-fg-muted truncate text-[10px] flex items-center gap-1">
                        <MapPinIcon className="w-3 h-3 text-fg-subtle shrink-0" />
                        <span className="truncate">{corp.billingAddress}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-fg-secondary">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-muted">
                      <UsersIcon className="w-3 h-3 text-fg-muted" />
                      {riderCount} Rider{riderCount === 1 ? '' : 's'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-surface-muted">
                      {locCount} Place{locCount === 1 ? '' : 's'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-surface-muted">
                      {ccCount} Cost Ctr{ccCount === 1 ? '' : 's'}
                    </span>
                    {mgrCount > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-status-staged-bg text-status-staged-fg font-bold">
                        {mgrCount} Portal Mgr{mgrCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  {/* Portal Access + Billing & Credit Deep-Link */}
                  <div className="pt-2 border-t border-border-faint space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenProvisionModal(corp)}
                        className="text-[10px] font-bold text-status-staged-fg bg-status-staged-bg/70 hover:bg-status-staged-bg-strong border-status-staged-border flex-1 py-1.5 h-auto cursor-pointer"
                      >
                        <UserCheckIcon className="w-3.5 h-3.5 mr-1 shrink-0" />
                        <span>Portal Manager</span>
                      </Button>
                      <Link
                        to={`/app/corporate?accountId=${encodeURIComponent(corp.id)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border-subtle hover:border-status-staged-border bg-surface-card hover:bg-status-staged-bg text-[10px] font-bold text-fg-secondary hover:text-status-staged-fg transition-colors shrink-0"
                        title="Open /app/corporate Travel Desk Portal"
                      >
                        <span>Portal</span>
                        <ExternalLinkIcon className="w-3 h-3" />
                      </Link>
                    </div>

                    <Link
                      to={`/app/admin?tab=invoicing&sub=accounts&accountId=${encodeURIComponent(corp.id)}`}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-status-info-border bg-status-info-bg/60 hover:bg-status-info-bg-strong/70 text-[11px] font-bold text-status-info-fg transition-colors"
                    >
                      <CreditCardIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>Billing &amp; Credit &rarr;</span>
                    </Link>
                  </div>
                </CardContent>
              </div>
            </Card>
          );
        })}

        {filteredCorp.length === 0 && (
          <div className="col-span-full py-12 text-center bg-surface-card rounded-2xl border border-border-subtle">
            <p className="text-fg-subtle font-medium text-xs">
              No corporate accounts found matching &ldquo;{corpSearchTerm}&rdquo;.
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalCorpPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-surface-card px-4 py-3 rounded-2xl border border-border-subtle/90 text-xs">
          <span className="text-fg-muted font-medium text-center sm:text-left">
            Showing {(corpPage - 1) * CORP_PAGE_SIZE + 1}–
            {Math.min(corpPage * CORP_PAGE_SIZE, filteredCorp.length)} of {filteredCorp.length} corporate accounts
          </span>
          <div className="flex items-center justify-center sm:justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCorpPage((p) => Math.max(p - 1, 1))}
              disabled={corpPage === 1}
              className="text-xs px-2.5 py-1 cursor-pointer"
            >
              Previous
            </Button>
            <span className="text-xs font-bold text-fg-secondary px-2">
              {corpPage} / {totalCorpPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCorpPage((p) => Math.min(p + 1, totalCorpPages))}
              disabled={corpPage === totalCorpPages}
              className="text-xs px-2.5 py-1 cursor-pointer"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {selectedPoAccount && (
        <RegeneratePoModal
          account={selectedPoAccount}
          isOpen={isRegeneratePoOpen}
          onClose={() => {
            setIsRegeneratePoOpen(false);
            setSelectedPoAccount(null);
          }}
          onSuccess={onPoRegenerateSuccess}
          operatorEmail="admin@chesterfieldtaxi.com"
        />
      )}

      {selectedPoAccount && (
        <PoHistoryModal
          account={selectedPoAccount}
          isOpen={isPoHistoryOpen}
          onClose={() => {
            setIsPoHistoryOpen(false);
            setSelectedPoAccount(null);
          }}
        />
      )}

      {selectedPoAccount && (
        <CorporateBookingPinModal
          account={selectedPoAccount}
          isOpen={isBookingPinOpen}
          onClose={() => {
            setIsBookingPinOpen(false);
            setSelectedPoAccount(null);
          }}
          onSuccess={(updated) => void onPoRegenerateSuccess(updated)}
          operatorEmail="admin@chesterfieldtaxi.com"
        />
      )}

      {onSave && (
        <CorporateImportJsonModal
          isOpen={isImportJsonOpen}
          onClose={() => setIsImportJsonOpen(false)}
          existingAccounts={corporateClients}
          onImportSuccess={async (mergeResult) => {
            if (onImportCorporateAccounts) {
              await onImportCorporateAccounts(mergeResult);
            } else {
              await onSave({ corporateAccounts: mergeResult.merged });
            }
          }}
        />
      )}

      {archivingCorp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay/50 backdrop-blur-xs p-4">
          <div className="bg-surface-card rounded-2xl border border-border-subtle shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-border-faint flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-status-warning-bg-strong text-status-warning-fg flex items-center justify-center">
                  <ArchiveBoxIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-fg-primary">
                    Archive Corporate Account
                  </h3>
                  <p className="text-[11px] font-mono text-fg-muted">
                    {archivingCorp.companyName} ({archivingCorp.accountNumber})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeArchiveModal}
                disabled={isArchiving}
                className="p-1 rounded-lg text-fg-subtle hover:text-fg-secondary cursor-pointer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              {isCheckingExposure ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-subtle border border-border-subtle text-fg-secondary">
                  <SpinnerIcon className="w-4 h-4 animate-spin text-fg-muted" />
                  <span>Checking open invoices and unbilled rides...</span>
                </div>
              ) : (
                archiveExposure?.hasExposure && (
                  <div className="p-3.5 rounded-xl bg-status-warning-bg border border-status-warning-border text-status-warning-fg space-y-1.5">
                    <div className="flex items-center gap-1.5 font-extrabold text-status-warning-fg">
                      <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Open Billing Exposure Detected</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-status-warning-fg">
                      {archiveExposure.openInvoiceCount > 0 && (
                        <li>
                          <strong>{archiveExposure.openInvoiceCount}</strong> open invoice
                          {archiveExposure.openInvoiceCount === 1 ? '' : 's'} totaling{' '}
                          <strong>${archiveExposure.openInvoiceBalance.toFixed(2)}</strong>
                          {archiveExposure.overdueInvoiceCount > 0 && (
                            <span className="text-status-danger-fg font-bold">
                              {' '}
                              ({archiveExposure.overdueInvoiceCount} overdue)
                            </span>
                          )}
                        </li>
                      )}
                      {archiveExposure.unbilledRideCount > 0 && (
                        <li>
                          <strong>{archiveExposure.unbilledRideCount}</strong> unbilled ride
                          {archiveExposure.unbilledRideCount === 1 ? '' : 's'} totaling{' '}
                          <strong>${archiveExposure.unbilledAmount.toFixed(2)}</strong>
                        </li>
                      )}
                    </ul>
                    <p className="text-[11px] text-status-warning-fg pt-0.5">
                      Historical trips, invoices, and AR balances will remain intact in Invoicing &amp;
                      Analytics. You can still proceed with archival.
                    </p>
                  </div>
                )
              )}

              <p className="text-fg-secondary leading-relaxed">
                Archiving immediately blocks new bookings, public{' '}
                <code className="font-mono text-[11px] bg-surface-muted px-1 py-0.5 rounded">
                  /api/corporate/verify
                </code>{' '}
                checks, Dispatch selection, and Corporate Portal access. You can restore this account
                anytime from <strong>Admin &rarr; System &amp; Governance &rarr; Universal Archive</strong>.
              </p>

              <div>
                <label className="font-semibold text-fg-secondary block mb-1">
                  Archive Reason (Optional)
                </label>
                <input
                  type="text"
                  value={archiveReason}
                  onChange={(e) => setArchiveReason(e.target.value)}
                  placeholder="e.g. Contract ended, account consolidated..."
                  className="w-full h-9 px-3 bg-surface-card border border-border-strong rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-surface-subtle border-t border-border-faint flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={closeArchiveModal}
                disabled={isArchiving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                isLoading={isArchiving}
                onClick={() => void confirmArchive()}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                Archive Account
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
