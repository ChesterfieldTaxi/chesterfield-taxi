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
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
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
              className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {corpSearchTerm && (
              <button
                type="button"
                onClick={() => {
                  setCorpSearchTerm('');
                  setCorpPage(1);
                }}
                aria-label="Clear corporate search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 sm:inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold w-full sm:w-auto">
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
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
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
              className="border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all"
            >
              <div>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-black text-slate-900 line-clamp-1">
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
                            className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Edit Corporate Directory Profile"
                          >
                            <EditIcon className="w-3.5 h-3.5" />
                          </button>
                          {onArchiveCorporate && (
                            <button
                              type="button"
                              onClick={() => void openArchiveModal(corp)}
                              className="p-1 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
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
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
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

                    <div className="flex items-center justify-between bg-white px-2 py-1.5 rounded-lg border border-slate-200">
                      <span className="font-mono font-bold text-slate-900 text-xs">
                        {corp.currentPoNumber || 'None'}
                      </span>
                      {corp.currentPoNumber && (
                        <button
                          type="button"
                          onClick={() => handleCopyPo(corp.currentPoNumber!, corp.id)}
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
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
                        className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200 flex-1 py-1 h-auto cursor-pointer"
                      >
                        <RefreshCwIcon className="w-3 h-3 mr-1" />
                        Regenerate PO
                      </Button>

                      {onSave && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onTogglePoRequired(corp)}
                          className="text-[10px] text-slate-600 hover:text-slate-900 py-1 h-auto px-2 cursor-pointer"
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
                          className="text-[10px] text-indigo-700 hover:text-indigo-900 py-1 h-auto px-2 cursor-pointer"
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
                          className="text-[10px] text-blue-600 hover:text-blue-800 py-1 h-auto px-2 cursor-pointer"
                        >
                          History ({corp.poNumberHistory.length})
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Directory Contact & Saved Assets Summary */}
                  <div className="p-2.5 bg-slate-50 rounded-xl space-y-1 text-[11px]">
                    <div className="font-bold text-slate-800 truncate">
                      {corp.billingContactName || 'Travel Desk Contact'}
                    </div>
                    <div className="text-blue-600 truncate">{corp.billingContactEmail || 'No email'}</div>
                    {corp.billingContactPhone && (
                      <div className="text-slate-600 font-mono text-[10px]">{corp.billingContactPhone}</div>
                    )}
                    {corp.billingAddress && (
                      <div className="text-slate-500 truncate text-[10px] flex items-center gap-1">
                        <MapPinIcon className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{corp.billingAddress}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-600">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100">
                      <UsersIcon className="w-3 h-3 text-slate-500" />
                      {riderCount} Rider{riderCount === 1 ? '' : 's'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100">
                      {locCount} Place{locCount === 1 ? '' : 's'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100">
                      {ccCount} Cost Ctr{ccCount === 1 ? '' : 's'}
                    </span>
                    {mgrCount > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold">
                        {mgrCount} Portal Mgr{mgrCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  {/* Portal Access + Billing & Credit Deep-Link */}
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenProvisionModal(corp)}
                        className="text-[10px] font-bold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 border-indigo-200 flex-1 py-1.5 h-auto cursor-pointer"
                      >
                        <UserCheckIcon className="w-3.5 h-3.5 mr-1 shrink-0" />
                        <span>Portal Manager</span>
                      </Button>
                      <Link
                        to={`/app/corporate?accountId=${encodeURIComponent(corp.id)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 bg-white hover:bg-indigo-50 text-[10px] font-bold text-slate-700 hover:text-indigo-700 transition-colors shrink-0"
                        title="Open /app/corporate Travel Desk Portal"
                      >
                        <span>Portal</span>
                        <ExternalLinkIcon className="w-3 h-3" />
                      </Link>
                    </div>

                    <Link
                      to={`/app/admin?tab=invoicing&sub=accounts&accountId=${encodeURIComponent(corp.id)}`}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50/60 hover:bg-blue-100/70 text-[11px] font-bold text-blue-700 transition-colors"
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
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-400 font-medium text-xs">
              No corporate accounts found matching &ldquo;{corpSearchTerm}&rdquo;.
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalCorpPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white px-4 py-3 rounded-2xl border border-slate-200/90 text-xs">
          <span className="text-slate-500 font-medium text-center sm:text-left">
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
            <span className="text-xs font-bold text-slate-700 px-2">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <ArchiveBoxIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Archive Corporate Account
                  </h3>
                  <p className="text-[11px] font-mono text-slate-500">
                    {archivingCorp.companyName} ({archivingCorp.accountNumber})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeArchiveModal}
                disabled={isArchiving}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              {isCheckingExposure ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
                  <SpinnerIcon className="w-4 h-4 animate-spin text-slate-500" />
                  <span>Checking open invoices and unbilled rides...</span>
                </div>
              ) : (
                archiveExposure?.hasExposure && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-extrabold text-amber-900">
                      <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Open Billing Exposure Detected</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-amber-900">
                      {archiveExposure.openInvoiceCount > 0 && (
                        <li>
                          <strong>{archiveExposure.openInvoiceCount}</strong> open invoice
                          {archiveExposure.openInvoiceCount === 1 ? '' : 's'} totaling{' '}
                          <strong>${archiveExposure.openInvoiceBalance.toFixed(2)}</strong>
                          {archiveExposure.overdueInvoiceCount > 0 && (
                            <span className="text-rose-700 font-bold">
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
                    <p className="text-[11px] text-amber-800 pt-0.5">
                      Historical trips, invoices, and AR balances will remain intact in Invoicing &amp;
                      Analytics. You can still proceed with archival.
                    </p>
                  </div>
                )
              )}

              <p className="text-slate-600 leading-relaxed">
                Archiving immediately blocks new bookings, public{' '}
                <code className="font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded">
                  /api/corporate/verify
                </code>{' '}
                checks, Dispatch selection, and Corporate Portal access. You can restore this account
                anytime from <strong>Admin &rarr; System &amp; Governance &rarr; Universal Archive</strong>.
              </p>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Archive Reason (Optional)
                </label>
                <input
                  type="text"
                  value={archiveReason}
                  onChange={(e) => setArchiveReason(e.target.value)}
                  placeholder="e.g. Contract ended, account consolidated..."
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
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
