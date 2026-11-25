import React, { useState } from 'react';
import { Link } from 'react-router';
import { Card, CardHeader, CardTitle, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  BanIcon,
  CheckIcon,
  ExternalLinkIcon,
  MailIcon,
  PhoneIcon,
  PlusIcon,
  SpinnerIcon,
  StarIcon,
  TrashIcon,
  UsersIcon,
  XIcon,
} from '../../../ui/Icons';
import { ArchiveBoxIcon } from '../UniversalArchiveDrawer';
import type { CustomerArchiveFilter, CustomerProfile } from './types';

export interface PassengerDirectoryPanelProps {
  isLoading: boolean;
  allCount: number;
  activeCount: number;
  archivedCount: number;
  blacklistCount: number;
  vipCount: number;
  displayedCustomers: CustomerProfile[];
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  archiveFilter: CustomerArchiveFilter;
  setArchiveFilter: (val: CustomerArchiveFilter) => void;
  onOpenCustomer: (cust: CustomerProfile, editMode?: boolean) => void;
  onToggleArchiveCustomer: (cust: CustomerProfile) => Promise<void>;
  onRestoreCustomer: (cust: CustomerProfile) => Promise<void>;
  onPurgeCustomer: (cust: CustomerProfile) => Promise<void>;
  onPurgeAllBlacklisted: () => Promise<void>;
}

export function PassengerDirectoryPanel({
  isLoading,
  allCount,
  activeCount,
  archivedCount,
  blacklistCount,
  vipCount,
  displayedCustomers,
  searchTerm,
  setSearchTerm,
  archiveFilter,
  setArchiveFilter,
  onOpenCustomer,
  onToggleArchiveCustomer,
  onRestoreCustomer,
  onPurgeCustomer,
  onPurgeAllBlacklisted,
}: PassengerDirectoryPanelProps) {
  const [vipOnly, setVipOnly] = useState(false);
  const [confirmPurgeAll, setConfirmPurgeAll] = useState(false);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);

  const filteredCustomers = displayedCustomers.filter((c) => {
    if (vipOnly && !c.isVip) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      Boolean(c.corporateAccountName && c.corporateAccountName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      {/* ─── Passenger Directory Search & Filter Toolbar ─── */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 min-w-0 flex-wrap">
          <div className="relative w-full sm:w-64 lg:w-72">
            <input
              type="text"
              placeholder="Search passengers by name, phone, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Clear passenger search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setArchiveFilter('active');
                setConfirmPurgeAll(false);
              }}
              className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-all text-center whitespace-nowrap cursor-pointer ${
                archiveFilter === 'active'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setArchiveFilter('archived');
                setConfirmPurgeAll(false);
              }}
              className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
                archiveFilter === 'archived'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <ArchiveBoxIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Archived ({archivedCount})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setArchiveFilter('blacklist');
                setConfirmPurgeAll(false);
              }}
              className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
                archiveFilter === 'blacklist'
                  ? 'bg-rose-600 text-white shadow-xs font-bold'
                  : 'text-slate-500 hover:text-rose-700'
              }`}
            >
              <BanIcon
                className={`w-3.5 h-3.5 shrink-0 ${
                  archiveFilter === 'blacklist' ? 'text-white' : 'text-rose-500'
                }`}
              />
              <span>Blacklist ({blacklistCount})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setArchiveFilter('all');
                setConfirmPurgeAll(false);
              }}
              className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-all text-center whitespace-nowrap cursor-pointer ${
                archiveFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              All ({allCount})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setVipOnly((prev) => !prev)}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
              vipOnly
                ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50/60 hover:text-amber-800'
            }`}
          >
            <StarIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>VIP Only ({vipCount})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full lg:w-auto justify-end">
          {archiveFilter === 'blacklist' && blacklistCount > 0 && (
            confirmPurgeAll ? (
              <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl">
                <span className="text-[11px] font-bold text-rose-800">
                  Purge all {blacklistCount}?
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPurging}
                  onClick={async () => {
                    setIsPurging(true);
                    try {
                      await onPurgeAllBlacklisted();
                      setConfirmPurgeAll(false);
                    } finally {
                      setIsPurging(false);
                    }
                  }}
                  className="text-[11px] font-bold px-2 py-1 h-auto bg-rose-600 hover:bg-rose-700 text-white border-rose-600 cursor-pointer"
                >
                  {isPurging ? 'Purging...' : 'Confirm'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPurging}
                  onClick={() => setConfirmPurgeAll(false)}
                  className="text-[11px] font-bold px-2 py-1 h-auto text-slate-600 border-slate-200 cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<TrashIcon className="w-3.5 h-3.5 text-rose-600" />}
                onClick={() => setConfirmPurgeAll(true)}
                className="text-xs font-bold text-rose-700 border-rose-300 bg-rose-50/70 hover:bg-rose-100 cursor-pointer"
              >
                Purge All Blacklisted
              </Button>
            )
          )}

          <Button
            type="button"
            variant="primary"
            size="sm"
            leftIcon={<PlusIcon className="w-4 h-4" />}
            onClick={() =>
              onOpenCustomer(
                {
                  id: `cust_new_${Date.now()}`,
                  name: '',
                  email: '',
                  phone: '',
                  tripCount: 0,
                  totalSpend: 0,
                  lastRideDate: 'New',
                  isVip: false,
                  preferredVehicle: 'Standard Sedan',
                },
                true
              )
            }
            className="text-xs font-bold w-full sm:w-auto justify-center shrink-0"
          >
            Add Client
          </Button>
        </div>
      </div>

      {/* ─── Passenger Directory Grid ─── */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 flex items-center justify-center gap-2 text-slate-400">
          <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
          <span className="text-xs font-semibold">Loading passenger directory...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredCustomers.map((cust) => {
            const score = cust.customerScore ?? 90;
            const scoreTone =
              score >= 80
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : score >= 60
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-rose-50 text-rose-700 border-rose-200';
            const initial = (cust.name || 'C').trim().charAt(0).toUpperCase();

            return (
              <Card
                key={cust.id}
                onClick={() => onOpenCustomer(cust, false)}
                className="border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
              >
                <div>
                  <CardHeader className="pb-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                            cust.isBlacklisted
                              ? 'bg-rose-100 text-rose-700'
                              : cust.isVip
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-black text-slate-900 truncate">
                            {cust.name}
                          </CardTitle>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            {cust.corporateAccountName ? (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200/70 px-1.5 py-0.2 rounded-md truncate max-w-[160px]">
                                {cust.corporateAccountName}
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-slate-400">
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
                          </div>
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 font-black text-[11px] px-2 py-0.5 rounded-full border shrink-0 tabular-nums ${scoreTone}`}
                        title="Client Reliability Score"
                      >
                        <StarIcon className="w-3 h-3 shrink-0" />
                        <span>{score}</span>
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2.5 text-xs">
                    {cust.blacklistReason && (
                      <div className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-700 font-semibold">
                        Block reason: {cust.blacklistReason}
                      </div>
                    )}

                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                      <div className="flex items-center gap-2 text-slate-800 font-semibold">
                        <PhoneIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px] truncate">{cust.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <MailIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-[11px] truncate">{cust.email || 'No email on file'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-xl text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Rides</span>
                        <span className="font-extrabold text-slate-900 tabular-nums">{cust.tripCount}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Spend</span>
                        <span className="font-extrabold text-emerald-700 tabular-nums">
                          ${cust.totalSpend.toFixed(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Class</span>
                        <span className="font-bold text-slate-700 capitalize truncate block">
                          {cust.preferredVehicle || 'Standard'}
                        </span>
                      </div>
                    </div>

                    {(cust.hasInvoicesOrCorporate || cust.corporateAccountName) && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <Link
                          to="/app/admin?tab=invoicing&sub=ledger"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800"
                        >
                          <span>View Invoices &rarr;</span>
                          <ExternalLinkIcon className="w-3 h-3" />
                        </Link>
                      </div>
                    )}

                    <div
                      className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenCustomer(cust, false)}
                        className="text-[11px] font-bold flex-1 py-1.5 h-auto text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer"
                      >
                        Details
                      </Button>
                      {cust.isBlacklisted ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onRestoreCustomer(cust)}
                            className="text-[11px] px-2.5 py-1.5 h-auto font-bold flex items-center gap-1 text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 cursor-pointer"
                          >
                            <CheckIcon className="w-3 h-3 text-emerald-600" />
                            <span>Restore</span>
                          </Button>
                          {confirmPurgeId === cust.id ? (
                            <div className="flex items-center gap-1">
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
                                className="text-[11px] px-2 py-1.5 h-auto font-bold bg-rose-600 hover:bg-rose-700 text-white border-rose-600 cursor-pointer"
                              >
                                {isPurging ? '...' : 'Confirm'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPurging}
                                onClick={() => setConfirmPurgeId(null)}
                                className="text-[11px] px-2 py-1.5 h-auto font-bold text-slate-600 border-slate-200 cursor-pointer"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmPurgeId(cust.id)}
                              className="text-[11px] px-2.5 py-1.5 h-auto font-bold flex items-center gap-1 text-rose-700 border-rose-300 bg-rose-50 hover:bg-rose-100 cursor-pointer"
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
                            className="text-[11px] font-bold flex-1 py-1.5 h-auto text-blue-700 border-blue-200 bg-blue-50/50 hover:bg-blue-100/70 cursor-pointer"
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onToggleArchiveCustomer(cust)}
                            className={`text-[11px] px-2.5 py-1.5 h-auto font-bold flex items-center gap-1 cursor-pointer ${
                              cust.isArchived
                                ? 'text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                                : 'text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {cust.isArchived ? (
                              <>
                                <CheckIcon className="w-3 h-3 text-emerald-600" />
                                <span>Restore</span>
                              </>
                            ) : (
                              <>
                                <ArchiveBoxIcon className="w-3 h-3 text-slate-500" />
                                <span>Archive</span>
                              </>
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </div>
              </Card>
            );
          })}

          {filteredCustomers.length === 0 && (
            <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200">
              <UsersIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-slate-600 font-bold text-sm">No passengers found</p>
              <p className="text-slate-400 font-medium text-xs mt-1">
                {searchTerm
                  ? `No clients matched "${searchTerm}".`
                  : vipOnly
                  ? 'No VIP priority clients match the active filter.'
                  : 'Add a client or switch the archive filter above.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
