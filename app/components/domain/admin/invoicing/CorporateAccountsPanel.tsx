import React from 'react';
import type {
  AppSettings,
  CorporateAccountConfig,
} from '../../../../core/types/config';
import { getAdminAuthService } from '../../../../core/services/auth/admin-auth.service';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import {
  ACCOUNTS_PER_PAGE,
  type CorporateAccountFilterMode,
  type InvoicingSubTab,
} from './useAdminInvoicingActions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  CheckIcon,
  ShieldCheckIcon,
  CopyIcon,
  RefreshCwIcon,
  XIcon,
} from '../../../ui/Icons';
import {
  RegeneratePoModal,
  PoHistoryModal,
  CorporateCsvImportModal,
} from '../corporate/CorporateAccountModals';

export interface CorporateAccountsPanelProps {
  activeSub: InvoicingSubTab;
  settings: AppSettings;
  corporateAccounts: CorporateAccountConfig[];
  isSaving: boolean;
  copiedPoId: string | null;
  accountSearchTerm: string;
  setAccountSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  accountFilter: CorporateAccountFilterMode;
  setAccountFilter: React.Dispatch<React.SetStateAction<CorporateAccountFilterMode>>;
  accountPage: number;
  setAccountPage: React.Dispatch<React.SetStateAction<number>>;
  selectedPoAccount: CorporateAccountConfig | null;
  setSelectedPoAccount: React.Dispatch<React.SetStateAction<CorporateAccountConfig | null>>;
  isRegeneratePoOpen: boolean;
  setIsRegeneratePoOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isPoHistoryOpen: boolean;
  setIsPoHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isCsvModalOpen: boolean;
  setIsCsvModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onCopyPo: (po: string, id: string) => void;
  onTogglePoRequired: (account: CorporateAccountConfig) => Promise<void>;
  onRunBatchInvoicing: (corp: CorporateAccountConfig) => Promise<void>;
  onPoRegenerateSuccess: (updatedAccount: CorporateAccountConfig, newPo: string) => Promise<void>;
  onCsvImportSuccess: (importedAccounts: CorporateAccountConfig[]) => Promise<void>;
}

export function CorporateAccountsPanel({
  activeSub,
  settings,
  corporateAccounts,
  isSaving,
  copiedPoId,
  accountSearchTerm,
  setAccountSearchTerm,
  accountFilter,
  setAccountFilter,
  accountPage,
  setAccountPage,
  selectedPoAccount,
  setSelectedPoAccount,
  isRegeneratePoOpen,
  setIsRegeneratePoOpen,
  isPoHistoryOpen,
  setIsPoHistoryOpen,
  isCsvModalOpen,
  setIsCsvModalOpen,
  onCopyPo,
  onTogglePoRequired,
  onRunBatchInvoicing,
  onPoRegenerateSuccess,
  onCsvImportSuccess,
}: CorporateAccountsPanelProps) {
  const filteredCorporateAccounts = corporateAccounts.filter((acc) => {
    if (accountFilter === 'po_enforced' && !acc.poRequired) return false;
    if (accountFilter === 'po_disabled' && acc.poRequired) return false;
    if (!accountSearchTerm.trim()) return true;
    const q = accountSearchTerm.toLowerCase();
    return (
      acc.companyName.toLowerCase().includes(q) ||
      acc.accountNumber.toLowerCase().includes(q) ||
      (acc.currentPoNumber && acc.currentPoNumber.toLowerCase().includes(q)) ||
      (acc.billingContactEmail && acc.billingContactEmail.toLowerCase().includes(q)) ||
      (acc.billingAddress && acc.billingAddress.toLowerCase().includes(q))
    );
  });

  const totalAccountPages = Math.max(
    1,
    Math.ceil(filteredCorporateAccounts.length / ACCOUNTS_PER_PAGE)
  );
  const paginatedAccounts = filteredCorporateAccounts.slice(
    (accountPage - 1) * ACCOUNTS_PER_PAGE,
    accountPage * ACCOUNTS_PER_PAGE
  );

  return (
    <>
      {activeSub === 'accounts' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3">
            <div className="relative w-full md:w-96">
              <input
                type="text"
                placeholder={`Search ${corporateAccounts.length} accounts by company, account #, PO...`}
                value={accountSearchTerm}
                onChange={(e) => {
                  setAccountSearchTerm(e.target.value);
                  setAccountPage(1);
                }}
                className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {accountSearchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setAccountSearchTerm('');
                    setAccountPage(1);
                  }}
                  aria-label="Clear account search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="w-full md:w-auto">
              <div className="grid grid-cols-3 sm:inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setAccountFilter('all');
                    setAccountPage(1);
                  }}
                  className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-colors text-center whitespace-nowrap cursor-pointer ${
                    accountFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({corporateAccounts.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountFilter('po_enforced');
                    setAccountPage(1);
                  }}
                  className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-colors text-center whitespace-nowrap cursor-pointer ${
                    accountFilter === 'po_enforced'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  PO Enforced ({corporateAccounts.filter((a) => a.poRequired).length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountFilter('po_disabled');
                    setAccountPage(1);
                  }}
                  className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-colors text-center whitespace-nowrap cursor-pointer ${
                    accountFilter === 'po_disabled'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  PO Optional ({corporateAccounts.filter((a) => !a.poRequired).length})
                </button>
              </div>
            </div>
          </div>

          {/* Corporate Accounts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedAccounts.map((acc) => (
              <Card
                key={acc.id}
                className="border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm font-black text-slate-900 line-clamp-1">
                          {acc.companyName}
                        </CardTitle>
                        <CardDescription className="text-xs font-mono font-bold text-blue-600">
                          {acc.accountNumber}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={acc.isActive ? 'success' : 'default'}
                        size="sm"
                        className="text-[10px]"
                      >
                        {acc.isActive ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2.5 text-xs">
                    {/* Active PO Authorization & Fraud Prevention Container */}
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                          Authorized PO Number
                        </span>
                        <Badge
                          variant={acc.poRequired ? 'success' : 'default'}
                          size="sm"
                          className="text-[9px]"
                        >
                          {acc.poRequired ? 'PO Enforced' : 'PO Optional'}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between bg-white px-2 py-1.5 rounded-lg border border-slate-200">
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          {acc.currentPoNumber || 'None'}
                        </span>
                        {acc.currentPoNumber && (
                          <button
                            type="button"
                            onClick={() => onCopyPo(acc.currentPoNumber!, acc.id)}
                            className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            {copiedPoId === acc.id ? (
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

                      {/* PO Action Buttons */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedPoAccount(acc);
                            setIsRegeneratePoOpen(true);
                          }}
                          className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200 flex-1 py-1 h-auto cursor-pointer"
                        >
                          <RefreshCwIcon className="w-3 h-3 mr-1" />
                          Regenerate PO
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onTogglePoRequired(acc)}
                          disabled={isSaving}
                          className="text-[10px] text-slate-600 hover:text-slate-900 py-1 h-auto px-2 cursor-pointer"
                        >
                          {acc.poRequired ? 'Disable PO' : 'Enforce PO'}
                        </Button>

                        {acc.poNumberHistory && acc.poNumberHistory.length > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedPoAccount(acc);
                              setIsPoHistoryOpen(true);
                            }}
                            className="text-[10px] text-blue-600 hover:text-blue-800 py-1 h-auto px-2 cursor-pointer"
                          >
                            History ({acc.poNumberHistory.length})
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Financial Terms */}
                    <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-100 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Terms</span>
                        <span className="font-bold text-slate-800 uppercase">{acc.billingCycle}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Limit</span>
                        <span className="font-bold text-slate-800">${acc.creditLimit.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Discount</span>
                        <span className="font-bold text-emerald-600">{acc.discountPercent}% Off</span>
                      </div>
                    </div>

                    {/* Contact & Address */}
                    <div className="text-[11px] text-slate-500 space-y-0.5">
                      <p className="font-semibold text-slate-700 truncate">
                        Contact: {acc.billingContactName || 'Accounts Payable'}
                      </p>
                      {acc.billingContactEmail && (
                        <p className="truncate text-blue-600">{acc.billingContactEmail}</p>
                      )}
                      {acc.billingContactPhone && (
                        <p className="text-slate-600">Tel: {acc.billingContactPhone}</p>
                      )}
                      {acc.billingAddress && (
                        <p className="text-slate-400 truncate text-[10px]">{acc.billingAddress}</p>
                      )}
                    </div>
                  </CardContent>
                </div>

                <div className="p-4 pt-0">
                  <div className="pt-2 border-t border-slate-100">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRunBatchInvoicing(acc)}
                      disabled={isSaving}
                      className="text-[11px] font-bold text-blue-600 border-blue-200 hover:bg-blue-50 w-full cursor-pointer"
                    >
                      Run Direct Batch Statement
                    </Button>
                  </div>
                </div>
              </Card>
            ))}

            {filteredCorporateAccounts.length === 0 && (
              <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-400 font-medium text-xs">
                  No corporate accounts found matching &ldquo;{accountSearchTerm}&rdquo;.
                </p>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalAccountPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white px-4 py-3 rounded-2xl border border-slate-200/90 text-xs">
              <span className="text-slate-500 font-medium text-center sm:text-left">
                Showing {((accountPage - 1) * ACCOUNTS_PER_PAGE) + 1}–
                {Math.min(accountPage * ACCOUNTS_PER_PAGE, filteredCorporateAccounts.length)} of{' '}
                {filteredCorporateAccounts.length} corporate accounts
              </span>
              <div className="flex items-center justify-center sm:justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAccountPage((p) => Math.max(p - 1, 1))}
                  disabled={accountPage === 1}
                  className="text-xs px-2.5 py-1 cursor-pointer"
                >
                  Previous
                </Button>
                <span className="text-xs font-bold text-slate-700 px-2">
                  {accountPage} / {totalAccountPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAccountPage((p) => Math.min(p + 1, totalAccountPages))}
                  disabled={accountPage === totalAccountPages}
                  className="text-xs px-2.5 py-1 cursor-pointer"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Regenerate PO Modal ─── */}
      {selectedPoAccount && (
        <RegeneratePoModal
          account={selectedPoAccount}
          isOpen={isRegeneratePoOpen}
          onClose={() => {
            setIsRegeneratePoOpen(false);
            setSelectedPoAccount(null);
          }}
          onSuccess={onPoRegenerateSuccess}
          operatorEmail={
            getAdminAuthService().getCurrentUser()?.email ||
            settings.company?.email ||
            COMPANY_CONFIG.email.dispatch
          }
        />
      )}

      {/* ─── PO History Modal ─── */}
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

      {/* ─── Corporate CSV Import Modal ─── */}
      <CorporateCsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImportSuccess={onCsvImportSuccess}
      />
    </>
  );
}
