import React from 'react';
import { Link } from 'react-router';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  StarIcon,
  TrashIcon,
} from '../../../ui/Icons';
import { ArchiveBoxIcon } from '../UniversalArchiveDrawer';
import {
  DIRECTORY_TABLE_COLUMNS,
  getReliabilityScoreTone,
} from './customer-directory.util';
import type {
  CustomerProfile,
  CustomerSortField,
  SortDirection,
} from './types';

export interface PassengerDirectoryTableProps {
  customers: CustomerProfile[];
  sortField: CustomerSortField;
  sortDirection: SortDirection;
  onSortColumn: (field: CustomerSortField) => void;
  onOpenCustomer: (cust: CustomerProfile, editMode?: boolean) => void;
  onToggleArchiveCustomer: (cust: CustomerProfile) => Promise<void>;
  onRestoreCustomer: (cust: CustomerProfile) => Promise<void>;
  onPurgeCustomer: (cust: CustomerProfile) => Promise<void>;
  confirmPurgeId: string | null;
  setConfirmPurgeId: (id: string | null) => void;
  isPurging: boolean;
  setIsPurging: (val: boolean) => void;
}

export function PassengerDirectoryTable({
  customers,
  sortField,
  sortDirection,
  onSortColumn,
  onOpenCustomer,
  onToggleArchiveCustomer,
  onRestoreCustomer,
  onPurgeCustomer,
  confirmPurgeId,
  setConfirmPurgeId,
  isPurging,
  setIsPurging,
}: PassengerDirectoryTableProps) {
  return (
    <div className="bg-surface-card rounded-2xl border border-border-subtle/90 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-subtle/80">
              {DIRECTORY_TABLE_COLUMNS.map((col) => {
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
            {customers.map((cust) => {
              const score = cust.customerScore ?? 90;
              const scoreTone = getReliabilityScoreTone(score);
              const initial = (cust.name || 'C').trim().charAt(0).toUpperCase();

              return (
                <tr
                  key={cust.id}
                  onClick={() => onOpenCustomer(cust, false)}
                  className="hover:bg-surface-subtle/70 transition-colors cursor-pointer"
                >
                  {/* Client */}
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                          cust.isBlacklisted
                            ? 'bg-status-danger-bg-strong text-status-danger-fg'
                            : cust.isVip
                            ? 'bg-status-warning-bg-strong text-status-warning-fg'
                            : 'bg-status-info-bg text-status-info-fg'
                        }`}
                      >
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <div className="font-extrabold text-fg-primary truncate max-w-[200px] sm:max-w-[240px]">
                          {cust.name || 'Unnamed Client'}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {cust.corporateAccountName ? (
                            <span className="text-[10px] font-bold text-status-info-fg bg-status-info-bg border border-status-info-border/70 px-1.5 py-0.2 rounded-md truncate max-w-[150px]">
                              {cust.corporateAccountName}
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-fg-subtle">
                              Direct Client
                            </span>
                          )}
                          {cust.isVip && (
                            <Badge variant="warning" size="sm" className="text-[9px] px-1.5 py-0 font-black">
                              VIP
                            </Badge>
                          )}
                          {cust.isBlacklisted && (
                            <Badge variant="error" size="sm" className="text-[9px] px-1.5 py-0 font-extrabold">
                              BLACKLISTED
                            </Badge>
                          )}
                          {cust.isArchived && (
                            <Badge variant="neutral" size="sm" className="text-[9px] px-1.5 py-0 font-extrabold">
                              ARCHIVED
                            </Badge>
                          )}
                          {(cust.hasInvoicesOrCorporate || cust.corporateAccountName) && (
                            <span onClick={(e) => e.stopPropagation()}>
                              <Link
                                to="/app/admin?tab=invoicing&sub=ledger"
                                className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-600 hover:text-status-info-fg ml-1"
                              >
                                <span>Invoices</span>
                                <ExternalLinkIcon className="w-2.5 h-2.5" />
                              </Link>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Contact */}
                  <td className="px-3.5 py-2.5 hidden md:table-cell">
                    <div className="font-mono text-[11px] font-semibold text-fg-strong truncate max-w-[160px]">
                      {cust.phone}
                    </div>
                    <div className="text-[11px] text-fg-secondary truncate max-w-[200px]">
                      {cust.email || 'No email on file'}
                    </div>
                  </td>

                  {/* Rides */}
                  <td className="px-3.5 py-2.5 text-right font-extrabold text-fg-primary tabular-nums whitespace-nowrap">
                    {cust.tripCount}
                  </td>

                  {/* Spend */}
                  <td className="px-3.5 py-2.5 text-right font-extrabold text-status-success-fg tabular-nums whitespace-nowrap hidden md:table-cell">
                    ${cust.totalSpend.toFixed(0)}
                  </td>

                  {/* Score */}
                  <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 font-black text-[11px] px-2 py-0.5 rounded-full border tabular-nums ${scoreTone}`}
                      title="Client Reliability Score"
                    >
                      <StarIcon className="w-3 h-3 shrink-0" />
                      <span>{score}</span>
                    </span>
                  </td>

                  {/* Actions */}
                  <td
                    className="px-3.5 py-2.5 text-right whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenCustomer(cust, false)}
                        className="text-[11px] font-bold px-2.5 py-1 h-auto text-fg-secondary border-border-subtle hover:bg-surface-subtle cursor-pointer"
                      >
                        Details
                      </Button>

                      {cust.isBlacklisted ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onRestoreCustomer(cust)}
                            className="text-[11px] px-2 py-1 h-auto font-bold inline-flex items-center gap-1 text-status-success-fg border-status-success-border bg-status-success-bg hover:bg-status-success-bg-strong cursor-pointer"
                          >
                            <CheckIcon className="w-3 h-3 text-emerald-600" />
                            <span>Restore</span>
                          </Button>
                          {confirmPurgeId === cust.id ? (
                            <div className="inline-flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPurging}
                                onClick={async () => {
                                  setIsPurging(true);
                                  try {
                                    await onPurgeCustomer(cust);
                                    setConfirmPurgeId(null);
                                  } finally {
                                    setIsPurging(false);
                                  }
                                }}
                                className="text-[11px] px-2 py-1 h-auto font-bold bg-rose-600 hover:bg-rose-700 text-white border-rose-600 cursor-pointer"
                              >
                                {isPurging ? '...' : 'Confirm'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPurging}
                                onClick={() => setConfirmPurgeId(null)}
                                className="text-[11px] px-2 py-1 h-auto font-bold text-fg-secondary border-border-subtle cursor-pointer"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmPurgeId(cust.id)}
                              className="text-[11px] px-2 py-1 h-auto font-bold inline-flex items-center gap-1 text-status-danger-fg border-status-danger-border bg-status-danger-bg hover:bg-status-danger-bg-strong cursor-pointer"
                            >
                              <TrashIcon className="w-3 h-3 text-rose-600" />
                              <span>Purge</span>
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onOpenCustomer(cust, true)}
                            className="text-[11px] font-bold px-2.5 py-1 h-auto text-status-info-fg border-status-info-border bg-status-info-bg/50 hover:bg-status-info-bg-strong/70 cursor-pointer"
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onToggleArchiveCustomer(cust)}
                            className={`text-[11px] px-2 py-1 h-auto font-bold inline-flex items-center gap-1 cursor-pointer ${
                              cust.isArchived
                                ? 'text-status-success-fg border-status-success-border bg-status-success-bg hover:bg-status-success-bg-strong'
                                : 'text-fg-secondary border-border-subtle hover:bg-surface-muted'
                            }`}
                          >
                            {cust.isArchived ? (
                              <>
                                <CheckIcon className="w-3 h-3 text-emerald-600" />
                                <span>Restore</span>
                              </>
                            ) : (
                              <>
                                <ArchiveBoxIcon className="w-3 h-3 text-fg-muted" />
                                <span>Archive</span>
                              </>
                            )}
                          </Button>
                        </>
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
