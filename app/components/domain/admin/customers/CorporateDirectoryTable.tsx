import React from 'react';
import { Link } from 'react-router';
import type { CorporateAccountConfig } from '../../../../core/types/config';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  ArchiveBoxIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  CreditCardIcon,
  EditIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  UserCheckIcon,
  UsersIcon,
} from '../../../ui/Icons';
import { CORPORATE_TABLE_COLUMNS } from './customer-directory.util';
import type { CorporateSortField, SortDirection } from './types';

export interface CorporateDirectoryTableProps {
  accounts: CorporateAccountConfig[];
  sortField: CorporateSortField;
  sortDirection: SortDirection;
  onSortColumn: (field: CorporateSortField) => void;
  canEdit: boolean;
  copiedPoId: string | null;
  onCopyPo: (po: string, id: string) => void;
  onEditCorporate: (corp: CorporateAccountConfig) => void;
  onOpenProvisionModal: (corp: CorporateAccountConfig) => void;
  onTogglePoRequired: (corp: CorporateAccountConfig) => Promise<void>;
  onOpenRegeneratePo: (corp: CorporateAccountConfig) => void;
  onOpenPoHistory: (corp: CorporateAccountConfig) => void;
  onOpenBookingPin: (corp: CorporateAccountConfig) => void;
  onOpenArchiveModal?: (corp: CorporateAccountConfig) => void;
}

/**
 * Config-driven table view for corporate accounts with sortable headers and quick governance actions.
 */
export function CorporateDirectoryTable({
  accounts,
  sortField,
  sortDirection,
  onSortColumn,
  canEdit,
  copiedPoId,
  onCopyPo,
  onEditCorporate,
  onOpenProvisionModal,
  onTogglePoRequired,
  onOpenRegeneratePo,
  onOpenPoHistory,
  onOpenBookingPin,
  onOpenArchiveModal,
}: CorporateDirectoryTableProps) {
  return (
    <div className="bg-surface-card rounded-2xl border border-border-subtle/90 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-subtle/80">
              {CORPORATE_TABLE_COLUMNS.map((col) => {
                const isSorted = col.sortField === sortField;
                const alignClass =
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left';
                const hideClass = col.hideOnMobile ? 'hidden md:table-cell' : '';

                return (
                  <th
                    key={col.id}
                    scope="col"
                    className={`px-3.5 py-2.5 text-[10px] font-extrabold uppercase tracking-wider text-fg-subtle whitespace-nowrap ${alignClass} ${hideClass}`}
                  >
                    {col.sortField ? (
                      <button
                        type="button"
                        onClick={() => onSortColumn(col.sortField!)}
                        className={`inline-flex items-center gap-1 cursor-pointer transition-colors hover:text-fg-primary ${
                          isSorted ? 'text-fg-primary' : 'text-fg-subtle'
                        }`}
                      >
                        <span>{col.label}</span>
                        {isSorted && (
                          <ChevronDownIcon
                            className={`w-3 h-3 transition-transform ${
                              sortDirection === 'asc' ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </button>
                    ) : (
                      <span>{col.label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-border-faint text-xs">
            {accounts.map((corp) => {
              const riderCount = (corp.authorizedRiders || []).length;
              const locCount = (corp.savedCompanyLocations || []).length;
              const mgrCount = (corp.portalManagers || []).length;
              const poHistoryCount = (corp.poNumberHistory || []).length;

              return (
                <tr
                  key={corp.id}
                  onClick={() => {
                    if (canEdit) onEditCorporate(corp);
                  }}
                  className={`hover:bg-surface-subtle/70 transition-colors ${
                    canEdit ? 'cursor-pointer' : ''
                  }`}
                >
                  {/* Company / Account */}
                  <td className="px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-fg-primary truncate max-w-[220px]">
                          {corp.companyName}
                        </span>
                        <Badge
                          variant={corp.isActive ? 'success' : 'default'}
                          size="sm"
                          className="text-[9px] shrink-0"
                        >
                          {corp.isActive ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      <div className="text-[11px] font-mono font-bold text-blue-600 mt-0.5">
                        {corp.accountNumber}
                        {corp.taxId ? ` · EIN ${corp.taxId}` : ''}
                      </div>
                      {(corp.billingContactName || corp.billingContactEmail) && (
                        <div className="text-[11px] text-fg-muted truncate max-w-[260px] mt-0.5">
                          {corp.billingContactName ? `${corp.billingContactName} · ` : ''}
                          {corp.billingContactEmail || ''}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* PO Policy & Prefix */}
                  <td className="px-3.5 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={corp.poRequired ? 'success' : 'default'}
                          size="sm"
                          className="text-[9px]"
                        >
                          {corp.poRequired ? 'PO Enforced' : 'PO Optional'}
                        </Badge>
                        {corp.bookingPin && (
                          <Badge variant="neutral" size="sm" className="text-[9px] font-mono">
                            PIN ({corp.bookingPin.length})
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-fg-primary text-[11px]">
                          {corp.currentPoNumber || 'None'}
                        </span>
                        {corp.currentPoNumber && (
                          <button
                            type="button"
                            onClick={() => onCopyPo(corp.currentPoNumber!, corp.id)}
                            className="text-[10px] text-blue-600 hover:text-status-info-fg font-semibold inline-flex items-center gap-0.5 cursor-pointer"
                            title="Copy current PO number"
                          >
                            {copiedPoId === corp.id ? (
                              <>
                                <CheckIcon className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-600 font-bold">Copied</span>
                              </>
                            ) : (
                              <CopyIcon className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Riders / Locations / Managers */}
                  <td
                    className="px-3.5 py-2.5 hidden md:table-cell"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap items-center gap-1 text-[10px] font-semibold text-fg-secondary">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-muted">
                        <UsersIcon className="w-3 h-3 text-fg-muted" />
                        {riderCount} Rider{riderCount === 1 ? '' : 's'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-surface-muted">
                        {locCount} Place{locCount === 1 ? '' : 's'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md ${
                          mgrCount > 0
                            ? 'bg-status-staged-bg text-status-staged-fg font-bold'
                            : 'bg-surface-muted'
                        }`}
                      >
                        {mgrCount} Mgr{mgrCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 mt-1 text-[10px] font-bold">
                      <Link
                        to={`/app/corporate?accountId=${encodeURIComponent(corp.id)}`}
                        className="inline-flex items-center gap-0.5 text-status-staged-fg hover:underline"
                      >
                        <span>Portal</span>
                        <ExternalLinkIcon className="w-2.5 h-2.5" />
                      </Link>
                      <Link
                        to={`/app/admin?tab=invoicing&sub=accounts&accountId=${encodeURIComponent(corp.id)}`}
                        className="inline-flex items-center gap-0.5 text-status-info-fg hover:underline"
                      >
                        <CreditCardIcon className="w-2.5 h-2.5" />
                        <span>Billing</span>
                      </Link>
                    </div>
                  </td>

                  {/* Actions */}
                  <td
                    className="px-3.5 py-2.5 text-right whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex flex-wrap items-center justify-end gap-1">
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEditCorporate(corp)}
                          className="text-[11px] font-bold px-2 py-1 h-auto text-status-info-fg border-status-info-border bg-status-info-bg/50 hover:bg-status-info-bg-strong/70 cursor-pointer"
                          title="Edit Corporate Profile"
                        >
                          <EditIcon className="w-3 h-3 mr-1" />
                          <span>Edit</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenProvisionModal(corp)}
                        className="text-[11px] font-bold px-2 py-1 h-auto text-status-staged-fg border-status-staged-border bg-status-staged-bg/60 hover:bg-status-staged-bg-strong cursor-pointer"
                        title="Provision Portal Managers"
                      >
                        <UserCheckIcon className="w-3 h-3 mr-1" />
                        <span>Managers</span>
                      </Button>

                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void onTogglePoRequired(corp)}
                          className="text-[11px] font-bold px-2 py-1 h-auto text-fg-secondary border-border-subtle hover:bg-surface-subtle cursor-pointer"
                        >
                          {corp.poRequired ? 'Disable PO' : 'Enforce PO'}
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenRegeneratePo(corp)}
                        className="text-[11px] font-bold px-2 py-1 h-auto text-status-warning-fg bg-status-warning-bg hover:bg-status-warning-bg-strong border-status-warning-border cursor-pointer"
                        title="Regenerate PO Number"
                      >
                        <RefreshCwIcon className="w-3 h-3 mr-1" />
                        <span>Regen PO</span>
                      </Button>

                      {poHistoryCount > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onOpenPoHistory(corp)}
                          className="text-[11px] font-bold px-2 py-1 h-auto text-blue-600 hover:text-status-info-fg cursor-pointer"
                        >
                          History ({poHistoryCount})
                        </Button>
                      )}

                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onOpenBookingPin(corp)}
                          className="text-[11px] font-bold px-2 py-1 h-auto text-status-staged-fg cursor-pointer"
                        >
                          {corp.bookingPin ? 'PIN' : 'Set PIN'}
                        </Button>
                      )}

                      {canEdit && onOpenArchiveModal && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onOpenArchiveModal(corp)}
                          className="text-[11px] font-bold px-2 py-1 h-auto text-fg-secondary border-border-subtle hover:text-status-warning-fg hover:bg-status-warning-bg cursor-pointer"
                          title="Archive Corporate Account"
                        >
                          <ArchiveBoxIcon className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
