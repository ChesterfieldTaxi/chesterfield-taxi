import React, { useMemo, useState } from 'react';
import type { UserRole } from '../../../../core/services/auth/admin-auth.service';
import type { OperatorUser } from '../../../../core/services/operator.service';
import { Button } from '../../../ui/Button';
import { Card, CardContent } from '../../../ui/Card';
import {
  ArchiveBoxIcon,
  BanIcon,
  BuildingIcon,
  CarIcon,
  EditIcon,
  LockIcon,
  PhoneIcon,
  PlusIcon,
  RadioIcon,
  SearchIcon,
  ShieldIcon,
  SpinnerIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
} from '../../../ui/Icons';
import { ROLE_META } from './operator-provisioning.util';

export type RosterViewMode = 'table' | 'cards' | 'compact';

export interface OperatorRosterPanelProps {
  operators: OperatorUser[];
  isLoading: boolean;
  isSaving: boolean;
  onOpenCreate: () => void;
  onOpenEdit: (op: OperatorUser) => void;
  onToggleStatus: (op: OperatorUser) => void;
  onSendPasswordReset: (email: string) => void;
  onDeleteOperator: (uid: string, email: string) => void;
}

export function RoleIcon({ role, className = 'w-3.5 h-3.5' }: { role: UserRole; className?: string }) {
  if (role === 'driver') return <CarIcon className={className} />;
  if (role === 'dispatcher') return <RadioIcon className={className} />;
  if (role === 'admin') return <ShieldIcon className={className} />;
  if (role === 'corporate_manager') return <BuildingIcon className={className} />;
  return <UserIcon className={className} />;
}

export function OperatorRosterPanel({
  operators,
  isLoading,
  isSaving,
  onOpenCreate,
  onOpenEdit,
  onToggleStatus,
  onSendPasswordReset,
  onDeleteOperator,
}: OperatorRosterPanelProps) {
  const [roleFilter, setRoleFilter] = useState<'all' | 'driver' | 'dispatcher' | 'admin' | 'suspended'>('all');
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<RosterViewMode>('table');

  const stats = useMemo(() => {
    const activeOps = operators.filter((o) => !o.isArchived);
    return {
      totalActive: activeOps.length,
      archived: operators.length - activeOps.length,
      drivers: activeOps.filter((o) => (o.roles || [o.role]).includes('driver')).length,
      dispatchers: activeOps.filter((o) => (o.roles || [o.role]).includes('dispatcher')).length,
      admins: activeOps.filter((o) => (o.roles || [o.role]).includes('admin')).length,
      suspended: activeOps.filter((o) => o.status === 'suspended' || o.isBlacklisted).length,
    };
  }, [operators]);

  const filteredOperators = useMemo(() => {
    return operators.filter((op) => {
      const isArchived = Boolean(op.isArchived);
      if (archiveFilter === 'active' && isArchived) return false;
      if (archiveFilter === 'archived' && !isArchived) return false;

      const activeRoles = op.roles && op.roles.length > 0 ? op.roles : [op.role];
      if (roleFilter === 'suspended') {
        if (op.status !== 'suspended' && !op.isBlacklisted) return false;
      } else if (roleFilter !== 'all' && !activeRoles.includes(roleFilter)) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          op.email.toLowerCase().includes(q) ||
          op.displayName?.toLowerCase().includes(q) ||
          op.username?.toLowerCase().includes(q) ||
          op.phone?.toLowerCase().includes(q) ||
          op.cabNumber?.toLowerCase().includes(q) ||
          op.assignedUnit?.toLowerCase().includes(q) ||
          op.driverLicense?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [operators, archiveFilter, roleFilter, searchQuery]);

  const kpiCards: Array<{
    id: 'all' | 'driver' | 'dispatcher' | 'admin' | 'suspended';
    label: string;
    value: number;
    activeClass: string;
    icon: React.ReactNode;
    spanClass?: string;
  }> = [
    { id: 'all', label: 'Active Roster', value: stats.totalActive, activeClass: 'border-slate-900 ring-1 ring-slate-900/10 shadow-xs', icon: <UsersIcon className="w-4 h-4 text-slate-400" /> },
    { id: 'driver', label: 'Drivers', value: stats.drivers, activeClass: 'border-emerald-600 ring-1 ring-emerald-500/20 shadow-xs', icon: <CarIcon className="w-4 h-4 text-emerald-600" /> },
    { id: 'dispatcher', label: 'Dispatchers', value: stats.dispatchers, activeClass: 'border-blue-600 ring-1 ring-blue-500/20 shadow-xs', icon: <RadioIcon className="w-4 h-4 text-blue-600" /> },
    { id: 'admin', label: 'Admins', value: stats.admins, activeClass: 'border-purple-600 ring-1 ring-purple-500/20 shadow-xs', icon: <ShieldIcon className="w-4 h-4 text-purple-600" /> },
    { id: 'suspended', label: 'Suspended', value: stats.suspended, activeClass: 'border-rose-600 ring-1 ring-rose-500/20 shadow-xs', icon: <BanIcon className="w-4 h-4 text-rose-500" />, spanClass: 'col-span-2 sm:col-span-4 lg:col-span-1' },
  ];

  return (
    <div className="space-y-4">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {kpiCards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => { setArchiveFilter('active'); setRoleFilter(card.id); }}
            className={`${card.spanClass || ''} text-left bg-white rounded-2xl border px-4 py-3 transition-all cursor-pointer ${
              roleFilter === card.id && archiveFilter === 'active'
                ? card.activeClass
                : 'border-slate-200/90 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500">{card.label}</span>
              {card.icon}
            </div>
            <div className="text-xl font-extrabold text-slate-950 mt-1 tabular-nums">{card.value}</div>
          </button>
        ))}
      </div>

      {/* Unified Filter, View Mode & Action Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 sm:gap-3 bg-white p-3 sm:px-4 sm:py-3 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-3 sm:inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/80 text-xs font-semibold w-full sm:w-auto">
            <button type="button" onClick={() => setArchiveFilter('active')} className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer ${archiveFilter === 'active' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}>
              Active ({stats.totalActive})
            </button>
            <button type="button" onClick={() => setArchiveFilter('archived')} className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${archiveFilter === 'archived' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}>
              <ArchiveBoxIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Archived ({stats.archived})</span>
            </button>
            <button type="button" onClick={() => setArchiveFilter('all')} className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer ${archiveFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}>
              All ({operators.length})
            </button>
          </div>

          <div className="hidden md:inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/80 text-[11px] font-bold">
            {(['table', 'cards', 'compact'] as RosterViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1 rounded-lg capitalize cursor-pointer ${viewMode === mode ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <div className="relative flex-1 sm:w-64">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search name, car #, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <Button type="button" variant="primary" size="sm" onClick={onOpenCreate} leftIcon={<PlusIcon className="w-4 h-4" />} className="text-xs font-bold h-9 w-full sm:w-auto justify-center shrink-0">
            Add Member
          </Button>
        </div>
      </div>

      {/* Roster Surface */}
      <Card variant="elevated" className="border-slate-200/90 bg-white shadow-xs overflow-hidden rounded-2xl">
        <CardContent className="p-0 min-w-full">
          {isLoading ? (
            <div className="p-14 text-center text-slate-400 flex items-center justify-center gap-2.5">
              <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-xs font-medium">Loading driver &amp; staff roster...</span>
            </div>
          ) : filteredOperators.length === 0 ? (
            <div className="p-14 text-center">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                <UsersIcon className="w-5 h-5" />
              </div>
              <div className="text-sm font-bold text-slate-800">No roster members found</div>
              <p className="text-xs text-slate-500 mt-1">Try clearing your search or switching role filters.</p>
            </div>
          ) : (
            <>
              {/* Cards View (Mobile < md OR explicit 'cards' mode) */}
              <div className={`${viewMode === 'cards' ? 'grid grid-cols-1 md:grid-cols-2 gap-3 p-4' : 'md:hidden divide-y divide-slate-100'}`}>
                {filteredOperators.map((op) => {
                  const opRoles: UserRole[] = op.roles && op.roles.length > 0 ? op.roles : [op.role || 'driver'];
                  const isDriver = opRoles.includes('driver');
                  const avatarTone = opRoles.includes('admin') ? 'bg-purple-100 text-purple-700' : opRoles.includes('dispatcher') ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700';

                  return (
                    <div
                      key={op.uid}
                      onClick={() => onOpenEdit(op)}
                      className={`p-3.5 space-y-2.5 active:bg-slate-50 hover:bg-slate-50/70 transition-colors cursor-pointer ${viewMode === 'cards' ? 'rounded-2xl border border-slate-200' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-sm shrink-0 ${avatarTone}`}>
                            {op.displayName ? op.displayName.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                              <span className="truncate">{op.displayName || 'Unnamed Member'}</span>
                              {op.cabNumber && (
                                <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-extrabold text-[10px] border border-blue-200/80 shrink-0">
                                  #{op.cabNumber}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">{op.email}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onToggleStatus(op); }}
                          disabled={isSaving || op.email === 'admin@chesterfieldtaxi.com'}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 cursor-pointer disabled:opacity-60 ${
                            op.status === 'suspended' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${op.status === 'suspended' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                          <span>{op.status === 'suspended' ? 'Suspended' : 'Active'}</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {opRoles.map((r) => {
                          const meta = ROLE_META[r] || ROLE_META.customer;
                          return (
                            <span key={r} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${meta.pillClass}`}>
                              <RoleIcon role={r} className="w-3 h-3 shrink-0" />
                              <span>{meta.label}</span>
                            </span>
                          );
                        })}
                        {isDriver && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md tabular-nums">Score {op.driverScore ?? 100}</span>}
                        {op.isBlacklisted && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-900 text-white"><BanIcon className="w-2.5 h-2.5 text-rose-400" /><span>Blacklisted</span></span>}
                        {op.isArchived && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200"><ArchiveBoxIcon className="w-2.5 h-2.5" /><span>Archived</span></span>}
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                          <PhoneIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{op.phone || 'No phone'}</span>
                        </div>
                        {isDriver && op.assignedUnit ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 font-semibold text-[10px]">
                            <CarIcon className="w-3 h-3 text-slate-500" />
                            {op.assignedUnit}
                          </span>
                        ) : (
                          <span className="text-slate-500">{op.deskExtension ? `Ext. ${op.deskExtension}` : 'Staff'}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => onOpenEdit(op)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-blue-600 hover:text-white transition-colors cursor-pointer">
                          <EditIcon className="w-3.5 h-3.5" /><span>Edit Profile</span>
                        </button>
                        <button type="button" onClick={() => onSendPasswordReset(op.email)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 hover:text-blue-600 inline-flex items-center gap-1 cursor-pointer">
                          <LockIcon className="w-3.5 h-3.5" /><span>Reset PW</span>
                        </button>
                        {op.email !== 'admin@chesterfieldtaxi.com' && (
                          <button type="button" onClick={() => onDeleteOperator(op.uid, op.email)} className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 cursor-pointer" title="Delete account">
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Compact List View (md+ when viewMode === 'compact') */}
              {viewMode === 'compact' && (
                <div className="hidden md:block divide-y divide-slate-100 text-xs">
                  {filteredOperators.map((op) => {
                    const opRoles: UserRole[] = op.roles && op.roles.length > 0 ? op.roles : [op.role || 'driver'];
                    return (
                      <div key={op.uid} onClick={() => onOpenEdit(op)} className="px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3 cursor-pointer">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-bold text-slate-900 truncate">{op.displayName || op.email}</span>
                          {op.cabNumber && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">#{op.cabNumber}</span>}
                          <span className="text-[11px] text-slate-500 truncate">{op.email}</span>
                          <span className="text-[11px] font-mono text-slate-500">{op.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {opRoles.map((r) => (
                            <span key={r} className={`px-2 py-0.5 rounded border text-[10px] font-bold ${(ROLE_META[r] || ROLE_META.customer).pillClass}`}>
                              {(ROLE_META[r] || ROLE_META.customer).label}
                            </span>
                          ))}
                          <button type="button" onClick={() => onOpenEdit(op)} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white font-semibold text-[11px] cursor-pointer">Edit</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Desktop Table View (md+ when viewMode === 'table') */}
              {viewMode === 'table' && (
                <div className="hidden md:block overflow-x-auto custom-scrollbar min-w-full">
                  <table className="w-full text-left text-xs divide-y divide-slate-100 min-w-[820px]">
                    <thead className="bg-slate-50/90 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-5 py-3">Member</th>
                        <th className="px-5 py-3">Roles &amp; Access</th>
                        <th className="px-5 py-3">Contact</th>
                        <th className="px-5 py-3">Assignment / Info</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredOperators.map((op) => {
                        const opRoles: UserRole[] = op.roles && op.roles.length > 0 ? op.roles : [op.role || 'driver'];
                        const isDriver = opRoles.includes('driver');
                        const avatarTone = opRoles.includes('admin') ? 'bg-purple-100 text-purple-700' : opRoles.includes('dispatcher') ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700';

                        return (
                          <tr key={op.uid} onClick={() => onOpenEdit(op)} className="hover:bg-slate-50/90 transition-colors cursor-pointer">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${avatarTone}`}>
                                  {op.displayName ? op.displayName.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                    <span className="truncate">{op.displayName || 'Unnamed Member'}</span>
                                    {op.cabNumber && <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-extrabold text-[10px] border border-blue-200/80 shrink-0">#{op.cabNumber}</span>}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                                    <span className="truncate max-w-[190px]">{op.email}</span>
                                    {op.username && <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono text-[10px] shrink-0">@{op.username}</span>}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-wrap gap-1.5">
                                {opRoles.map((r) => {
                                  const meta = ROLE_META[r] || ROLE_META.customer;
                                  return (
                                    <span key={r} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${meta.pillClass}`}>
                                      <RoleIcon role={r} className="w-3 h-3 shrink-0" />
                                      <span>{meta.label}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-slate-600">
                              <div className="flex items-center gap-1.5 font-medium text-slate-800">
                                <PhoneIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{op.phone || 'No phone on file'}</span>
                              </div>
                              {op.deskExtension && <div className="text-[10px] text-slate-500 mt-0.5">Ext: <span className="font-semibold text-slate-700">{op.deskExtension}</span></div>}
                            </td>
                            <td className="px-5 py-3.5">
                              {isDriver ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {op.assignedUnit && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[10px] border border-slate-200/80"><CarIcon className="w-3 h-3 text-slate-500" />{op.assignedUnit}</span>}
                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded-md tabular-nums">Score {op.driverScore ?? 100}</span>
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-500">{op.driverLicense ? `DL: ${op.driverLicense}` : 'No DL recorded'}</div>
                                </div>
                              ) : (
                                <div className="text-[11px] text-slate-500">{op.hireDate ? `Joined ${op.hireDate}` : 'Operations Staff'}</div>
                              )}
                            </td>
                            <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex flex-col gap-1 items-start">
                                <button
                                  type="button"
                                  onClick={() => onToggleStatus(op)}
                                  disabled={isSaving || op.email === 'admin@chesterfieldtaxi.com'}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60 ${
                                    op.status === 'suspended' ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${op.status === 'suspended' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                                  <span>{op.status === 'suspended' ? 'Suspended' : 'Active'}</span>
                                </button>
                                {op.isBlacklisted && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-900 text-white"><BanIcon className="w-2.5 h-2.5 text-rose-400" /><span>Blacklisted</span></span>}
                                {op.isArchived && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200"><ArchiveBoxIcon className="w-2.5 h-2.5" /><span>Archived</span></span>}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex items-center gap-1.5">
                                <button type="button" onClick={() => onOpenEdit(op)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-blue-600 hover:text-white transition-colors cursor-pointer">
                                  <EditIcon className="w-3.5 h-3.5" /><span>Edit</span>
                                </button>
                                <button type="button" onClick={() => onSendPasswordReset(op.email)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer" title="Send password reset email">
                                  <LockIcon className="w-3.5 h-3.5" />
                                </button>
                                {op.email !== 'admin@chesterfieldtaxi.com' && (
                                  <button type="button" onClick={() => onDeleteOperator(op.uid, op.email)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" title="Delete account">
                                    <TrashIcon className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
