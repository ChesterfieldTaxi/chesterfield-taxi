import React, { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { UserRole } from '../../../../core/services/auth/admin-auth.service';
import { getAdminAuthService } from '../../../../core/services/auth/admin-auth.service';
import {
  canOperatorConfigureLeadWindows,
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  getAdminConfigService,
  normalizeDispatchAutomationConfig,
} from '../../../../core/services/config/admin-config.service';
import { getOperatorService, type OperatorUser } from '../../../../core/services/operator.service';
import type { ConfigAuditEntry, DispatchAutomationConfig } from '../../../../core/types/config';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import {
  CheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  LockIcon,
  SearchIcon,
  ShieldCheckIcon,
  SpinnerIcon,
} from '../../../ui/Icons';
import { ROLE_META } from './operator-provisioning.util';
import { RoleIcon } from './OperatorRosterPanel';

export interface OperatorPermissionsPanelProps {
  operators: OperatorUser[];
  dispatchAutomation?: DispatchAutomationConfig;
  onUpdateOperatorLocal: (updated: OperatorUser) => void;
  onFlashSuccess: (msg: string) => void;
  onFlashError: (msg: string) => void;
}

const MATRIX_ROLES: readonly UserRole[] = [
  'admin',
  'dispatcher',
  'driver',
  'corporate_manager',
];

export function OperatorPermissionsPanel({
  operators,
  dispatchAutomation: propAutomation,
  onUpdateOperatorLocal,
  onFlashSuccess,
  onFlashError,
}: OperatorPermissionsPanelProps) {
  const [search, setSearch] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [automationState, setAutomationState] = useState<DispatchAutomationConfig>(() =>
    normalizeDispatchAutomationConfig(
      propAutomation ||
        getAdminConfigService().getCachedSettings().dispatchAutomation ||
        DEFAULT_DISPATCH_AUTOMATION_CONFIG
    )
  );

  React.useEffect(() => {
    if (propAutomation) {
      setAutomationState(normalizeDispatchAutomationConfig(propAutomation));
    }
  }, [propAutomation]);

  React.useEffect(() => {
    return getAdminConfigService().subscribeToSettings((s) => {
      if (s.dispatchAutomation) {
        setAutomationState(normalizeDispatchAutomationConfig(s.dispatchAutomation));
      }
    });
  }, []);

  const activeOperators = useMemo(() => {
    const base = operators.filter((op) => !op.isArchived);
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(
      (op) =>
        op.displayName?.toLowerCase().includes(q) ||
        op.email.toLowerCase().includes(q) ||
        op.cabNumber?.toLowerCase().includes(q)
    );
  }, [operators, search]);

  const handleToggleRole = async (op: OperatorUser, role: UserRole) => {
    const isRootAdmin = op.email === 'admin@chesterfieldtaxi.com';
    if (isRootAdmin && role === 'admin') return;

    const currentRoles: UserRole[] =
      op.roles && op.roles.length > 0 ? [...op.roles] : [op.role || 'driver'];
    const hasRole = currentRoles.includes(role);
    let nextRoles: UserRole[] = hasRole
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];
    if (nextRoles.length === 0) {
      nextRoles = ['customer'];
    }

    const updated: OperatorUser = {
      ...op,
      roles: nextRoles,
      role: nextRoles[0],
    };

    setBusyKey(`role:${op.uid}:${role}`);
    try {
      await getOperatorService().saveOperator(updated);
      onUpdateOperatorLocal(updated);
      onFlashSuccess(
        `${hasRole ? 'Revoked' : 'Granted'} ${ROLE_META[role].label} access for ${
          op.displayName || op.email
        }.`
      );
    } catch (err: any) {
      onFlashError(err?.message || 'Failed to update operator roles.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleLeadWindowPermission = async (op: OperatorUser) => {
    const uidToken = (op.uid || '').trim();
    const emailLower = (op.email || '').trim().toLowerCase();
    const currentlyAuthorized = canOperatorConfigureLeadWindows(op, automationState);

    let nextAllowlist = [...automationState.authorizedLeadWindowDispatcherIds];
    if (currentlyAuthorized) {
      nextAllowlist = nextAllowlist.filter((entry) => {
        const clean = entry.trim();
        if (uidToken && clean === uidToken) return false;
        if (emailLower && clean.toLowerCase() === emailLower) return false;
        return true;
      });
    } else {
      if (emailLower) nextAllowlist.push(emailLower);
      else if (uidToken) nextAllowlist.push(uidToken);
    }

    const nextAutomation = normalizeDispatchAutomationConfig({
      ...automationState,
      authorizedLeadWindowDispatcherIds: nextAllowlist,
    });

    setBusyKey(`lead:${op.uid}`);
    try {
      const cached = getAdminConfigService().getCachedSettings();
      const actor = getAdminAuthService().getCurrentUser();
      const auditEntry: ConfigAuditEntry = {
        id: `aud-rbac-lead-${Date.now()}`,
        timestamp: new Date().toISOString(),
        operatorId: actor?.uid || actor?.email || 'admin',
        operatorEmail: actor?.email || 'admin@chesterfieldtaxi.com',
        tab: 'operators',
        section: 'permissions',
        action: `${currentlyAuthorized ? 'Revoked' : 'Granted'} Dispatch Lead-Window permission for ${
          op.displayName || op.email
        }`,
        ipAddress: 'console',
      };

      await getAdminConfigService().updateSettings({
        dispatchAutomation: nextAutomation,
        configAuditTrail: [auditEntry, ...(cached.configAuditTrail || [])].slice(0, 200),
      });
      setAutomationState(nextAutomation);
      onFlashSuccess(
        `${currentlyAuthorized ? 'Revoked' : 'Granted'} Dispatch Lead-Window control for ${
          op.displayName || op.email
        }.`
      );
    } catch (err: any) {
      onFlashError(err?.message || 'Failed updating Lead-Window dispatcher authorization.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border border-slate-200 bg-white shadow-xs">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-purple-600" />
                <span>Multi-Role Console Matrix &amp; Dispatch Lead-Window Access</span>
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Toggle staff/driver roles in 1 click and control which Dispatchers may adjust Pre-Pickup &amp; Staged Auto-Release Lead Windows in <code>/app/dispatch</code>.
              </p>
            </div>
            <Link
              to="/app/admin?tab=automation&sub=auto-dispatch"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shrink-0"
            >
              <span>Auto-Pilot Settings</span>
              <ExternalLinkIcon className="w-3.5 h-3.5 text-slate-400" />
            </Link>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter by name, email, or car #..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs text-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600">
              <ClockIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Authorized Non-Admin Dispatchers:{' '}
                <strong className="text-slate-900">
                  {automationState.authorizedLeadWindowDispatcherIds.length}
                </strong>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs divide-y divide-slate-100 min-w-[780px]">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Assigned Roles (1-Click Toggle)</th>
                  <th className="px-4 py-3">Dispatch Lead-Window Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {activeOperators.map((op) => {
                  const opRoles: UserRole[] =
                    op.roles && op.roles.length > 0 ? op.roles : [op.role || 'driver'];
                  const isAdmin = opRoles.includes('admin');
                  const isDispatcher = opRoles.includes('dispatcher');
                  const isRootAdmin = op.email === 'admin@chesterfieldtaxi.com';
                  const hasLeadAccess = canOperatorConfigureLeadWindows(op, automationState);
                  const isLeadBusy = busyKey === `lead:${op.uid}`;

                  return (
                    <tr key={op.uid} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{op.displayName || 'Unnamed Member'}</span>
                          {op.cabNumber && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-extrabold text-[10px] border border-blue-200">
                              #{op.cabNumber}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">{op.email}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {MATRIX_ROLES.map((r) => {
                            const active = opRoles.includes(r);
                            const meta = ROLE_META[r];
                            const locked = isRootAdmin && r === 'admin';
                            const isRoleBusy = busyKey === `role:${op.uid}:${r}`;

                            return (
                              <button
                                key={r}
                                type="button"
                                disabled={locked || Boolean(busyKey)}
                                onClick={() => void handleToggleRole(op, r)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer disabled:opacity-60 ${
                                  active
                                    ? meta.pillClass
                                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                                }`}
                                title={locked ? 'Root admin role is locked' : `Toggle ${meta.label}`}
                              >
                                {isRoleBusy ? (
                                  <SpinnerIcon className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RoleIcon role={r} className="w-3 h-3 shrink-0" />
                                )}
                                <span>{meta.label}</span>
                                {active && <CheckIcon className="w-3 h-3" />}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        {isAdmin ? (
                          <Badge
                            variant="success"
                            className="bg-purple-50 text-purple-800 border-purple-200 text-[10px] font-bold"
                          >
                            Always Authorized (Admin)
                          </Badge>
                        ) : isDispatcher ? (
                          <button
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => void handleToggleLeadWindowPermission(op)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-extrabold transition-all cursor-pointer disabled:opacity-60 ${
                              hasLeadAccess
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {isLeadBusy ? (
                              <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                            ) : hasLeadAccess ? (
                              <CheckIcon className="w-3.5 h-3.5" />
                            ) : (
                              <LockIcon className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span>
                              {hasLeadAccess
                                ? 'Lead-Window Authorized'
                                : 'Grant Lead-Window Access'}
                            </span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            Requires Dispatcher role
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
