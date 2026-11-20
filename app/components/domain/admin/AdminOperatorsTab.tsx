import React, { useState, useEffect, useMemo } from 'react';
import { doc, setDoc, deleteDoc, getFirestore } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import {
  getFirebaseApp,
  getFirebaseAuth,
  getResolvedFirebaseConfig,
  isFirebaseConfigured,
} from '../../../core/services/firebase';
import type { UserRole } from '../../../core/services/auth/admin-auth.service';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Alert';
import { Input } from '../../ui/Input';
import { Card, CardContent } from '../../ui/Card';
import {
  SpinnerIcon,
  UserIcon,
  UsersIcon,
  TrashIcon,
  LockIcon,
  PlusIcon,
  PhoneIcon,
  CarIcon,
  RadioIcon,
  ShieldIcon,
  SearchIcon,
  EditIcon,
  BanIcon,
  RefreshCwIcon,
  CheckIcon,
  ArchiveBoxIcon,
  MailIcon,
} from '../../ui/Icons';
import { getUniversalGovernanceService } from '../../../core/services/governance/universal-governance.service';
import { UniversalArchiveDrawer } from './UniversalArchiveDrawer';
import { AdminSlideOverDrawer } from './AdminSlideOverDrawer';
import {
  type OperatorUser,
  DEFAULT_OPERATORS,
  getOperatorService,
  generateDriverUsername,
} from '../../../core/services/operator.service';
import { AdminOnboardingQueue } from './subpages/AdminOnboardingQueue';

export type { OperatorUser };
export { DEFAULT_OPERATORS };

export interface AdminOperatorsTabProps {
  initialSubTab?: 'roster' | 'onboarding';
}

const ROLE_META: Record<
  UserRole,
  {
    label: string;
    description: string;
    pillClass: string;
    cardActiveClass: string;
    iconClass: string;
  }
> = {
  driver: {
    label: 'Driver',
    description: 'Driver HUD, trip offers & shifts',
    pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cardActiveClass: 'border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500/30',
    iconClass: 'text-emerald-600',
  },
  dispatcher: {
    label: 'Dispatcher',
    description: 'Live dispatch board & call desk',
    pillClass: 'bg-blue-50 text-blue-700 border-blue-200',
    cardActiveClass: 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500/30',
    iconClass: 'text-blue-600',
  },
  admin: {
    label: 'Admin',
    description: 'Full console, pricing & settings',
    pillClass: 'bg-purple-50 text-purple-700 border-purple-200',
    cardActiveClass: 'border-purple-500 bg-purple-50/70 ring-1 ring-purple-500/30',
    iconClass: 'text-purple-600',
  },
  customer: {
    label: 'Passenger',
    description: 'Passenger booking portal',
    pillClass: 'bg-slate-100 text-slate-600 border-slate-200',
    cardActiveClass: 'border-slate-500 bg-slate-100/80 ring-1 ring-slate-400/30',
    iconClass: 'text-slate-600',
  },
};

function RoleIcon({ role, className = 'w-3.5 h-3.5' }: { role: UserRole; className?: string }) {
  if (role === 'driver') return <CarIcon className={className} />;
  if (role === 'dispatcher') return <RadioIcon className={className} />;
  if (role === 'admin') return <ShieldIcon className={className} />;
  return <UserIcon className={className} />;
}

interface EditFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  username: string;
  roles: UserRole[];
  cabNumber: string;
  assignedUnit: string;
  driverLicense: string;
  driverScore: number;
  deskExtension: string;
  hireDate: string;
  emergencyContact: string;
  status: 'active' | 'suspended';
  isBlacklisted: boolean;
  blacklistReason: string;
  isArchived: boolean;
  adminNotes: string;
}

const EMPTY_CREATE_STATE = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  username: '',
  roles: ['driver'] as UserRole[],
  cabNumber: '',
  assignedUnit: '',
  driverLicense: '',
  deskExtension: '',
  emergencyContact: '',
  adminNotes: '',
};

export function AdminOperatorsTab({ initialSubTab = 'roster' }: AdminOperatorsTabProps) {
  const [subTab, setSubTab] = useState<'roster' | 'onboarding'>(initialSubTab || 'roster');

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const [operators, setOperators] = useState<OperatorUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Filters
  const [roleFilter, setRoleFilter] = useState<'all' | 'driver' | 'dispatcher' | 'admin' | 'suspended'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [isArchiveDrawerOpen, setIsArchiveDrawerOpen] = useState(false);

  // Provision Drawer State
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_STATE);

  // Edit Drawer State
  const [editingOperator, setEditingOperator] = useState<OperatorUser | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess((cur) => (cur === msg ? null : cur)), 3800);
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetched = await getOperatorService().getOperators();
      setOperators(fetched);
    } catch (err: any) {
      console.warn('[AdminOperatorsTab] OperatorService fetch error, using defaults:', err);
      setOperators(DEFAULT_OPERATORS);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    const unsub = getOperatorService().subscribeToOperators((ops) => {
      if (ops && ops.length > 0) {
        setOperators(ops);
      }
    });
    return () => unsub();
  }, []);

  const openEditDrawer = (op: OperatorUser) => {
    const first = op.firstName || (op.displayName ? op.displayName.split(' ')[0] : '');
    const last = op.lastName || (op.displayName ? op.displayName.split(' ').slice(1).join(' ') : '');
    const cab =
      op.cabNumber ||
      (op.assignedUnit ? op.assignedUnit.match(/#?(\d+)/)?.[1] || op.assignedUnit : '');
    const uname = op.username || generateDriverUsername(first, last, cab);
    const activeRoles: UserRole[] =
      op.roles && op.roles.length > 0 ? [...op.roles] : [op.role || 'driver'];

    setEditingOperator(op);
    setEditForm({
      firstName: first,
      lastName: last,
      email: op.email || '',
      phone: op.phone || '',
      username: uname,
      roles: activeRoles,
      cabNumber: cab,
      assignedUnit: op.assignedUnit || (cab ? `Cab #${cab}` : ''),
      driverLicense: op.driverLicense || '',
      driverScore: typeof op.driverScore === 'number' ? op.driverScore : 98,
      deskExtension: op.deskExtension || '',
      hireDate: op.hireDate || '',
      emergencyContact: op.emergencyContact || '',
      status: op.status === 'suspended' ? 'suspended' : 'active',
      isBlacklisted: Boolean(op.isBlacklisted),
      blacklistReason: op.blacklistReason || '',
      isArchived: Boolean(op.isArchived),
      adminNotes: op.adminNotes || '',
    });
  };

  const handleToggleStatus = async (operator: OperatorUser) => {
    if (operator.email === 'admin@chesterfieldtaxi.com') return;
    const nextStatus = operator.status === 'suspended' ? 'active' : 'suspended';
    setIsSaving(true);
    setError(null);
    try {
      await getOperatorService().saveOperator({ ...operator, status: nextStatus });
      setOperators((prev) =>
        prev.map((op) => (op.uid === operator.uid ? { ...op, status: nextStatus } : op))
      );
      flashSuccess(`${operator.displayName || operator.email} is now ${nextStatus.toUpperCase()}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to update status.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendPasswordReset = async (email: string) => {
    setIsSaving(true);
    setError(null);
    try {
      if (isFirebaseConfigured()) {
        const auth = getFirebaseAuth();
        await sendPasswordResetEmail(auth, email);
      }
      flashSuccess(`Password reset email sent to ${email}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOperator = async (uid: string, email: string) => {
    if (email === 'admin@chesterfieldtaxi.com') {
      setError('The root administrator account cannot be deleted.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${email}"?\n\nThis revokes access to all consoles immediately.`
    );
    if (!confirmed) return;

    setIsSaving(true);
    setError(null);
    try {
      if (isFirebaseConfigured()) {
        const db = getFirestore(getFirebaseApp());
        await deleteDoc(doc(db, 'users', uid));
      }
      await getOperatorService().deleteOperator(uid);
      setOperators((prev) => prev.filter((o) => o.uid !== uid));
      if (editingOperator?.uid === uid) {
        setEditingOperator(null);
        setEditForm(null);
      }
      flashSuccess(`Account ${email} deleted and access revoked.`);
    } catch (err: any) {
      setError(err.message || 'Failed to delete account.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingOperator || !editForm) return;

    const isRootAdmin = editingOperator.email === 'admin@chesterfieldtaxi.com';
    const nextRoles: UserRole[] =
      editForm.roles.length > 0 ? [...editForm.roles] : ['customer'];
    if (isRootAdmin && !nextRoles.includes('admin')) {
      nextRoles.unshift('admin');
    }

    setIsSaving(true);
    setError(null);

    const fullName =
      `${editForm.firstName.trim()} ${editForm.lastName.trim()}`.trim() ||
      editingOperator.displayName ||
      editForm.email.split('@')[0];
    const cleanCab = editForm.cabNumber.trim().replace(/^#/, '');
    const cleanUsername =
      editForm.username.trim().toLowerCase() ||
      generateDriverUsername(editForm.firstName, editForm.lastName, cleanCab);
    const assignedUnit =
      editForm.assignedUnit.trim() || (cleanCab ? `Cab #${cleanCab}` : '');
    const clampedScore = Math.max(0, Math.min(100, Number(editForm.driverScore) || 0));
    const effectiveStatus: 'active' | 'suspended' = editForm.isBlacklisted
      ? 'suspended'
      : isRootAdmin
      ? 'active'
      : editForm.status;

    const updatedOp: OperatorUser = {
      ...editingOperator,
      email: isRootAdmin ? editingOperator.email : editForm.email.trim().toLowerCase() || editingOperator.email,
      displayName: fullName,
      firstName: editForm.firstName.trim(),
      lastName: editForm.lastName.trim(),
      username: cleanUsername,
      phone: editForm.phone.trim(),
      roles: nextRoles,
      role: nextRoles[0] || 'customer',
      cabNumber: cleanCab,
      assignedUnit,
      driverLicense: editForm.driverLicense.trim(),
      driverScore: clampedScore,
      deskExtension: editForm.deskExtension.trim(),
      hireDate: editForm.hireDate.trim(),
      emergencyContact: editForm.emergencyContact.trim(),
      status: effectiveStatus,
      isBlacklisted: isRootAdmin ? false : editForm.isBlacklisted,
      blacklistReason:
        !isRootAdmin && editForm.isBlacklisted
          ? editForm.blacklistReason.trim() || 'Administrative sanction'
          : '',
      isArchived: isRootAdmin ? false : editForm.isArchived,
      adminNotes: editForm.adminNotes.trim(),
    };

    try {
      await getOperatorService().saveOperator(updatedOp);

      // Sync fleet driver record & governance flags if Firebase is active
      if (isFirebaseConfigured()) {
        const db = getFirestore(getFirebaseApp());
        if (nextRoles.includes('driver')) {
          const fleetRef = doc(db, 'fleet', `driver-${editingOperator.uid}`);
          await setDoc(
            fleetRef,
            {
              name: updatedOp.displayName,
              license: updatedOp.driverLicense || '',
              cabNumber: cleanCab,
              username: cleanUsername,
              phone: updatedOp.phone || '',
            },
            { merge: true }
          );
        }
      }

      // Sync archive / blacklist governance audit trail if changed
      if (!isRootAdmin) {
        const gov = getUniversalGovernanceService();
        const entityType = nextRoles.includes('driver') ? 'driver' : 'staff';
        if (Boolean(editingOperator.isArchived) !== Boolean(updatedOp.isArchived)) {
          await gov.setArchiveStatus(entityType, editingOperator.uid, Boolean(updatedOp.isArchived));
        }
        if (Boolean(editingOperator.isBlacklisted) !== Boolean(updatedOp.isBlacklisted)) {
          await gov.setBlacklistStatus(
            entityType,
            editingOperator.uid,
            Boolean(updatedOp.isBlacklisted),
            updatedOp.blacklistReason || undefined
          );
        }
      }

      setOperators((prev) =>
        prev.map((op) => (op.uid === editingOperator.uid ? updatedOp : op))
      );
      flashSuccess(`Saved all changes for ${updatedOp.displayName || updatedOp.email}.`);
      setEditingOperator(null);
      setEditForm(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save operator profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = createForm.email.trim().toLowerCase();
    if (!cleanEmail || !createForm.password.trim()) return;

    if (createForm.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const selectedRoles: UserRole[] =
      createForm.roles.length > 0 ? createForm.roles : ['driver'];
    const primaryRole = selectedRoles[0];

    setIsSaving(true);
    setError(null);

    const fullName = `${createForm.firstName.trim()} ${createForm.lastName.trim()}`.trim();
    const cleanCab = createForm.cabNumber.trim().replace(/^#/, '');
    const cleanUsername =
      createForm.username.trim().toLowerCase() ||
      generateDriverUsername(createForm.firstName, createForm.lastName, cleanCab);
    const assignedUnit =
      createForm.assignedUnit.trim() || (cleanCab ? `Cab #${cleanCab}` : '');

    try {
      let createdUid = `user-${Date.now().toString(36)}`;

      if (isFirebaseConfigured()) {
        const tempAppName = `temp-provision-${Date.now()}`;
        const firebaseConfig = getResolvedFirebaseConfig();
        const secondaryApp = initializeApp(firebaseConfig, tempAppName);
        const secondaryAuth = getAuth(secondaryApp);

        try {
          const userCredential = await createUserWithEmailAndPassword(
            secondaryAuth,
            cleanEmail,
            createForm.password
          );
          createdUid = userCredential.user.uid;
        } finally {
          await signOut(secondaryAuth);
          await deleteApp(secondaryApp);
        }
      }

      const newOp: OperatorUser = {
        uid: createdUid,
        email: cleanEmail,
        displayName: fullName || cleanEmail.split('@')[0],
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim(),
        cabNumber: cleanCab,
        username: cleanUsername,
        role: primaryRole,
        roles: selectedRoles,
        phone: createForm.phone.trim(),
        driverLicense: createForm.driverLicense.trim(),
        assignedUnit,
        deskExtension: createForm.deskExtension.trim(),
        emergencyContact: createForm.emergencyContact.trim(),
        adminNotes: createForm.adminNotes.trim(),
        driverScore: selectedRoles.includes('driver') ? 100 : undefined,
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      await getOperatorService().saveOperator(newOp);
      setOperators((prev) => [newOp, ...prev]);
      flashSuccess(`Account created for ${newOp.displayName} (${selectedRoles.join(', ')}).`);
      setShowAddDrawer(false);
      setCreateForm(EMPTY_CREATE_STATE);
    } catch (err: any) {
      setError(err.message || 'Failed to provision account.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered roster
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

  if (subTab === 'onboarding') {
    return <AdminOnboardingQueue />;
  }

  const toggleEditRole = (r: UserRole) => {
    if (!editForm || !editingOperator) return;
    if (editingOperator.email === 'admin@chesterfieldtaxi.com' && r === 'admin') return;
    const exists = editForm.roles.includes(r);
    const next = exists
      ? editForm.roles.filter((item) => item !== r)
      : [...editForm.roles, r];
    setEditForm({ ...editForm, roles: next.length > 0 ? next : ['customer'] });
  };

  const toggleCreateRole = (r: UserRole) => {
    const exists = createForm.roles.includes(r);
    const next = exists
      ? createForm.roles.filter((item) => item !== r)
      : [...createForm.roles, r];
    const finalRoles: UserRole[] = next.length > 0 ? next : ['driver'];
    setCreateForm((prev) => ({
      ...prev,
      roles: finalRoles,
      username:
        finalRoles.includes('driver') && !prev.username
          ? generateDriverUsername(prev.firstName, prev.lastName, prev.cabNumber)
          : prev.username,
    }));
  };

  const isEditingDriver = Boolean(editForm?.roles.includes('driver'));
  const isEditingStaff = Boolean(
    editForm?.roles.includes('dispatcher') || editForm?.roles.includes('admin')
  );
  const isRootEditing = editingOperator?.email === 'admin@chesterfieldtaxi.com';

  return (
    <div className="space-y-4">
      {success && (
        <Alert variant="success" title="Saved">
          {success}
        </Alert>
      )}

      {error && (
        <Alert variant="error" title="Roster Error">
          {error}
        </Alert>
      )}

      {/* ─── Executive KPI Summary Strip ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => {
            setArchiveFilter('active');
            setRoleFilter('all');
          }}
          className={`text-left bg-white rounded-2xl border px-4 py-3 transition-all cursor-pointer ${
            roleFilter === 'all' && archiveFilter === 'active'
              ? 'border-slate-900 ring-1 ring-slate-900/10 shadow-xs'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Active Roster</span>
            <UsersIcon className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-extrabold text-slate-950 mt-1 tabular-nums">
            {stats.totalActive}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setArchiveFilter('active');
            setRoleFilter('driver');
          }}
          className={`text-left bg-white rounded-2xl border px-4 py-3 transition-all cursor-pointer ${
            roleFilter === 'driver' && archiveFilter === 'active'
              ? 'border-emerald-600 ring-1 ring-emerald-500/20 shadow-xs'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Drivers</span>
            <CarIcon className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-slate-950 mt-1 tabular-nums">
            {stats.drivers}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setArchiveFilter('active');
            setRoleFilter('dispatcher');
          }}
          className={`text-left bg-white rounded-2xl border px-4 py-3 transition-all cursor-pointer ${
            roleFilter === 'dispatcher' && archiveFilter === 'active'
              ? 'border-blue-600 ring-1 ring-blue-500/20 shadow-xs'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Dispatchers</span>
            <RadioIcon className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-extrabold text-slate-950 mt-1 tabular-nums">
            {stats.dispatchers}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setArchiveFilter('active');
            setRoleFilter('admin');
          }}
          className={`text-left bg-white rounded-2xl border px-4 py-3 transition-all cursor-pointer ${
            roleFilter === 'admin' && archiveFilter === 'active'
              ? 'border-purple-600 ring-1 ring-purple-500/20 shadow-xs'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Admins</span>
            <ShieldIcon className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl font-extrabold text-slate-950 mt-1 tabular-nums">
            {stats.admins}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setArchiveFilter('active');
            setRoleFilter('suspended');
          }}
          className={`col-span-2 sm:col-span-4 lg:col-span-1 text-left bg-white rounded-2xl border px-4 py-3 transition-all cursor-pointer ${
            roleFilter === 'suspended' && archiveFilter === 'active'
              ? 'border-rose-600 ring-1 ring-rose-500/20 shadow-xs'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Suspended</span>
            <BanIcon className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-extrabold text-slate-950 mt-1 tabular-nums">
            {stats.suspended}
          </div>
        </button>
      </div>

      {/* ─── Single Unified Filter & Action Toolbar ─── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white px-4 py-3 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Archive Filter */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/80 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setArchiveFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                archiveFilter === 'active'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active ({stats.totalActive})
            </button>
            <button
              type="button"
              onClick={() => setArchiveFilter('archived')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                archiveFilter === 'archived'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArchiveBoxIcon className="w-3.5 h-3.5 text-slate-500" />
              <span>Archived ({stats.archived})</span>
            </button>
            <button
              type="button"
              onClick={() => setArchiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                archiveFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({operators.length})
            </button>
          </div>
        </div>

        {/* Search & Provision Action */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex-1 sm:w-64">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search name, cab #, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              setCreateForm(EMPTY_CREATE_STATE);
              setShowAddDrawer(true);
            }}
            leftIcon={<PlusIcon className="w-4 h-4" />}
            className="text-xs font-bold h-9 shrink-0"
          >
            Add Member
          </Button>
        </div>
      </div>

      {/* ─── Operators Roster Table ─── */}
      <Card variant="elevated" className="border-slate-200/90 bg-white shadow-xs overflow-hidden rounded-2xl">
        <CardContent className="p-0 overflow-x-auto custom-scrollbar min-w-full">
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
              <p className="text-xs text-slate-500 mt-1">
                Try clearing your search or switching role filters.
              </p>
            </div>
          ) : (
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
                  const opRoles: UserRole[] =
                    op.roles && op.roles.length > 0 ? op.roles : [op.role || 'driver'];
                  const isDriver = opRoles.includes('driver');
                  const avatarTone = opRoles.includes('admin')
                    ? 'bg-purple-100 text-purple-700'
                    : opRoles.includes('dispatcher')
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-emerald-100 text-emerald-700';

                  return (
                    <tr
                      key={op.uid}
                      onClick={() => openEditDrawer(op)}
                      className="hover:bg-slate-50/90 transition-colors cursor-pointer group"
                    >
                      {/* Member */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${avatarTone}`}
                          >
                            {op.displayName ? (
                              op.displayName.charAt(0).toUpperCase()
                            ) : (
                              <UserIcon className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                              <span className="truncate">
                                {op.displayName || 'Unnamed Member'}
                              </span>
                              {op.cabNumber && (
                                <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-extrabold text-[10px] border border-blue-200/80 shrink-0">
                                  #{op.cabNumber}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                              <span className="truncate max-w-[190px]">{op.email}</span>
                              {op.username && (
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono text-[10px] shrink-0">
                                  @{op.username}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Compact Role Pills */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {opRoles.map((r) => {
                            const meta = ROLE_META[r] || ROLE_META.customer;
                            return (
                              <span
                                key={r}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${meta.pillClass}`}
                              >
                                <RoleIcon role={r} className="w-3 h-3 shrink-0" />
                                <span>{meta.label}</span>
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-5 py-3.5 text-slate-600">
                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                          <PhoneIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{op.phone || 'No phone on file'}</span>
                        </div>
                        {op.deskExtension && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Ext: <span className="font-semibold text-slate-700">{op.deskExtension}</span>
                          </div>
                        )}
                      </td>

                      {/* Driver / Staff Info */}
                      <td className="px-5 py-3.5">
                        {isDriver ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {op.assignedUnit && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[10px] border border-slate-200/80">
                                  <CarIcon className="w-3 h-3 text-slate-500" />
                                  {op.assignedUnit}
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded-md tabular-nums">
                                Score {op.driverScore ?? 100}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {op.driverLicense ? `DL: ${op.driverLicense}` : 'No DL recorded'}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-500">
                            {op.hireDate ? `Joined ${op.hireDate}` : 'Operations Staff'}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td
                        className="px-5 py-3.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-col gap-1 items-start">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(op)}
                            disabled={isSaving || op.email === 'admin@chesterfieldtaxi.com'}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-60 ${
                              op.status === 'suspended'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                op.status === 'suspended' ? 'bg-rose-500' : 'bg-emerald-500'
                              }`}
                            />
                            <span>{op.status === 'suspended' ? 'Suspended' : 'Active'}</span>
                          </button>

                          {op.isBlacklisted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-900 text-white">
                              <BanIcon className="w-2.5 h-2.5 text-rose-400" />
                              <span>Blacklisted</span>
                            </span>
                          )}
                          {op.isArchived && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              <ArchiveBoxIcon className="w-2.5 h-2.5" />
                              <span>Archived</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td
                        className="px-5 py-3.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditDrawer(op)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                            title="Edit complete profile"
                          >
                            <EditIcon className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSendPasswordReset(op.email)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Send password reset email"
                          >
                            <LockIcon className="w-3.5 h-3.5" />
                          </button>

                          {op.email !== 'admin@chesterfieldtaxi.com' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteOperator(op.uid, op.email)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete account"
                            >
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
          )}
        </CardContent>
      </Card>

      {/* ─── Universal Archive Drawer ─── */}
      {isArchiveDrawerOpen && (
        <UniversalArchiveDrawer
          isOpen={isArchiveDrawerOpen}
          onClose={() => setIsArchiveDrawerOpen(false)}
        />
      )}

      {/* ─── Complete Edit Driver / Staff Slide-Over Drawer ─── */}
      <AdminSlideOverDrawer
        isOpen={Boolean(editingOperator && editForm)}
        onClose={() => {
          setEditingOperator(null);
          setEditForm(null);
        }}
        title={
          editingOperator?.displayName ||
          editingOperator?.email ||
          'Edit Roster Member'
        }
        subtitle={editingOperator ? `${editingOperator.email} · UID ${editingOperator.uid.slice(0, 10)}` : ''}
        size="lg"
        headerBadge={
          editForm && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                editForm.isBlacklisted
                  ? 'bg-slate-900 text-white'
                  : editForm.status === 'suspended'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {editForm.isBlacklisted
                ? 'Blacklisted'
                : editForm.status === 'suspended'
                ? 'Suspended'
                : 'Active'}
            </span>
          )
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => {
                setEditingOperator(null);
                setEditForm(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              isLoading={isSaving}
              onClick={() => handleSaveEdit()}
              leftIcon={<CheckIcon className="w-4 h-4" />}
              className="font-bold"
            >
              Save Changes
            </Button>
          </>
        }
      >
        {editingOperator && editForm && (
          <form onSubmit={handleSaveEdit} className="space-y-5">
            {/* Section 1: Personal & Contact Information */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <UserIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Identity &amp; Contact
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Input
                  label="First Name"
                  placeholder="e.g. Michael"
                  value={editForm.firstName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, firstName: e.target.value })
                  }
                  required
                />
                <Input
                  label="Last Name"
                  placeholder="e.g. Vinnik"
                  value={editForm.lastName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, lastName: e.target.value })
                  }
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Input
                  label="Email Address"
                  type="email"
                  value={editForm.email}
                  disabled={isRootEditing}
                  onChange={(e) =>
                    setEditForm({ ...editForm, email: e.target.value })
                  }
                  helperText={isRootEditing ? 'Root admin email is locked' : 'Profile contact email'}
                />
                <Input
                  label="Phone Number"
                  placeholder="(314) 555-0199"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm({ ...editForm, phone: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    System Username
                  </label>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono">
                        @
                      </span>
                      <input
                        type="text"
                        value={editForm.username}
                        onChange={(e) =>
                          setEditForm({ ...editForm, username: e.target.value.toLowerCase() })
                        }
                        className="w-full h-10 pl-7 pr-3 rounded-xl border border-slate-300 bg-white text-xs font-mono font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setEditForm({
                          ...editForm,
                          username: generateDriverUsername(
                            editForm.firstName,
                            editForm.lastName,
                            editForm.cabNumber
                          ),
                        })
                      }
                      title="Auto-generate username from name & cab #"
                      className="h-10 px-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                    >
                      <RefreshCwIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <Input
                  label="Hire / Start Date"
                  type="date"
                  value={editForm.hireDate}
                  onChange={(e) =>
                    setEditForm({ ...editForm, hireDate: e.target.value })
                  }
                />
              </div>

              <Input
                label="Emergency Contact"
                placeholder="Name & phone number"
                value={editForm.emergencyContact}
                onChange={(e) =>
                  setEditForm({ ...editForm, emergencyContact: e.target.value })
                }
              />
            </section>

            {/* Section 2: Roles & Workspace Access */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <ShieldIcon className="w-4 h-4 text-purple-600" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Roles &amp; Console Access
                  </h3>
                </div>
                <span className="text-[10px] font-semibold text-slate-400">
                  Select one or more
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(['driver', 'dispatcher', 'admin', 'customer'] as UserRole[]).map((r) => {
                  const selected = editForm.roles.includes(r);
                  const meta = ROLE_META[r];
                  const locked = isRootEditing && r === 'admin';
                  return (
                    <button
                      key={r}
                      type="button"
                      disabled={locked}
                      onClick={() => toggleEditRole(r)}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-70 ${
                        selected
                          ? meta.cardActiveClass
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        <RoleIcon role={r} className={`w-4 h-4 ${meta.iconClass}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                          <span>{meta.label}</span>
                          {selected && <CheckIcon className="w-3.5 h-3.5 text-slate-800" />}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {meta.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Section 3: Driver & Fleet Assignment */}
            {isEditingDriver && (
              <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <CarIcon className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Driver &amp; Vehicle Assignment
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <Input
                    label="Cab Number"
                    placeholder="e.g. 947"
                    value={editForm.cabNumber}
                    onChange={(e) => {
                      const cab = e.target.value;
                      setEditForm({
                        ...editForm,
                        cabNumber: cab,
                        assignedUnit: cab.trim() ? `Cab #${cab.trim().replace(/^#/, '')}` : editForm.assignedUnit,
                      });
                    }}
                    helperText="Displayed on dispatch board as #Cab"
                  />
                  <Input
                    label="Assigned Vehicle Unit"
                    placeholder="e.g. Cab #947 (Sedan)"
                    value={editForm.assignedUnit}
                    onChange={(e) =>
                      setEditForm({ ...editForm, assignedUnit: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <Input
                    label="Driver's License / Permit #"
                    placeholder="MO-DL-1234567"
                    value={editForm.driverLicense}
                    onChange={(e) =>
                      setEditForm({ ...editForm, driverLicense: e.target.value })
                    }
                  />
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Driver Score
                      </label>
                      <span className="text-xs font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md tabular-nums">
                        {editForm.driverScore} / 100
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={editForm.driverScore}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          driverScore: Number(e.target.value),
                        })
                      }
                      className="w-full accent-blue-600 mt-2 cursor-pointer"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Section 4: Staff Operations */}
            {isEditingStaff && (
              <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <RadioIcon className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Staff &amp; Dispatch Details
                  </h3>
                </div>
                <Input
                  label="Desk Phone Extension"
                  placeholder="e.g. Ext. 104"
                  value={editForm.deskExtension}
                  onChange={(e) =>
                    setEditForm({ ...editForm, deskExtension: e.target.value })
                  }
                />
              </section>
            )}

            {/* Section 5: Account Governance & Notes */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <LockIcon className="w-4 h-4 text-slate-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Governance, Status &amp; Notes
                </h3>
              </div>

              {!isRootEditing && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setEditForm({
                        ...editForm,
                        status: editForm.status === 'active' ? 'suspended' : 'active',
                      })
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      editForm.status === 'suspended'
                        ? 'border-rose-300 bg-rose-50 text-rose-800'
                        : 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                      Account Status
                    </div>
                    <div className="text-xs font-extrabold mt-0.5">
                      {editForm.status === 'suspended' ? 'Suspended' : 'Active'}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditForm({
                        ...editForm,
                        isBlacklisted: !editForm.isBlacklisted,
                        status: !editForm.isBlacklisted ? 'suspended' : editForm.status,
                      })
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      editForm.isBlacklisted
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                      Sanction
                    </div>
                    <div className="text-xs font-extrabold mt-0.5 flex items-center gap-1">
                      <BanIcon className="w-3.5 h-3.5" />
                      <span>{editForm.isBlacklisted ? 'Blacklisted' : 'Not Blacklisted'}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditForm({
                        ...editForm,
                        isArchived: !editForm.isArchived,
                      })
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      editForm.isArchived
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                      Roster Archive
                    </div>
                    <div className="text-xs font-extrabold mt-0.5 flex items-center gap-1">
                      <ArchiveBoxIcon className="w-3.5 h-3.5" />
                      <span>{editForm.isArchived ? 'Archived' : 'On Active Roster'}</span>
                    </div>
                  </button>
                </div>
              )}

              {editForm.isBlacklisted && !isRootEditing && (
                <Input
                  label="Blacklist Reason"
                  placeholder="Enter administrative sanction reason..."
                  value={editForm.blacklistReason}
                  onChange={(e) =>
                    setEditForm({ ...editForm, blacklistReason: e.target.value })
                  }
                />
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Internal Admin Notes
                </label>
                <textarea
                  rows={3}
                  value={editForm.adminNotes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, adminNotes: e.target.value })
                  }
                  placeholder="Shift preferences, compliance notes, vehicle history..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Security Quick Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleSendPasswordReset(editingOperator.email)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <MailIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>Send Password Reset Email</span>
                </button>

                {!isRootEditing && (
                  <button
                    type="button"
                    onClick={() =>
                      handleDeleteOperator(editingOperator.uid, editingOperator.email)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                    <span>Delete Account</span>
                  </button>
                )}
              </div>
            </section>
          </form>
        )}
      </AdminSlideOverDrawer>

      {/* ─── Add Member Slide-Over Drawer ─── */}
      <AdminSlideOverDrawer
        isOpen={showAddDrawer}
        onClose={() => setShowAddDrawer(false)}
        title="Add Member"
        subtitle="Create login credentials and add a driver or staff member to the roster"
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowAddDrawer(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-operator-form"
              variant="primary"
              size="md"
              isLoading={isSaving}
              leftIcon={<PlusIcon className="w-4 h-4" />}
              className="font-bold"
            >
              Add Member
            </Button>
          </>
        }
      >
        <form id="create-operator-form" onSubmit={handleCreateOperator} className="space-y-5">
          {/* Roles */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <ShieldIcon className="w-4 h-4 text-purple-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                Assign Roles
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(['driver', 'dispatcher', 'admin'] as UserRole[]).map((r) => {
                const selected = createForm.roles.includes(r);
                const meta = ROLE_META[r];
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleCreateRole(r)}
                    className={`flex items-start gap-2 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selected
                        ? meta.cardActiveClass
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <RoleIcon role={r} className={`w-4 h-4 mt-0.5 shrink-0 ${meta.iconClass}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                        <span>{meta.label}</span>
                        {selected && <CheckIcon className="w-3.5 h-3.5 text-slate-800" />}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{meta.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Identity & Credentials */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <UserIcon className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                Identity &amp; Login Credentials
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="First Name"
                placeholder="e.g. Michael"
                value={createForm.firstName}
                onChange={(e) => {
                  const val = e.target.value;
                  setCreateForm((prev) => ({
                    ...prev,
                    firstName: val,
                    username: prev.roles.includes('driver')
                      ? generateDriverUsername(val, prev.lastName, prev.cabNumber)
                      : prev.username,
                  }));
                }}
                required
              />
              <Input
                label="Last Name"
                placeholder="e.g. Johnson"
                value={createForm.lastName}
                onChange={(e) => {
                  const val = e.target.value;
                  setCreateForm((prev) => ({
                    ...prev,
                    lastName: val,
                    username: prev.roles.includes('driver')
                      ? generateDriverUsername(prev.firstName, val, prev.cabNumber)
                      : prev.username,
                  }));
                }}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="Email Address"
                type="email"
                placeholder="driver@chesterfieldtaxi.com"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm({ ...createForm, email: e.target.value })
                }
                required
              />
              <Input
                label="Temporary Password"
                type="password"
                placeholder="Minimum 6 characters"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm({ ...createForm, password: e.target.value })
                }
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="Phone Number"
                placeholder="(314) 555-0199"
                value={createForm.phone}
                onChange={(e) =>
                  setCreateForm({ ...createForm, phone: e.target.value })
                }
              />
              <Input
                label="Emergency Contact"
                placeholder="Name & phone (optional)"
                value={createForm.emergencyContact}
                onChange={(e) =>
                  setCreateForm({ ...createForm, emergencyContact: e.target.value })
                }
              />
            </div>
          </section>

          {/* Driver Details */}
          {createForm.roles.includes('driver') && (
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <CarIcon className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Driver &amp; Vehicle Setup
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Input
                  label="Cab / Unit Number"
                  placeholder="e.g. 400"
                  value={createForm.cabNumber}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCreateForm((prev) => ({
                      ...prev,
                      cabNumber: val,
                      assignedUnit: val.trim() ? `Cab #${val.trim().replace(/^#/, '')}` : prev.assignedUnit,
                      username: generateDriverUsername(prev.firstName, prev.lastName, val),
                    }));
                  }}
                  required
                />
                <Input
                  label="Driver's License #"
                  placeholder="MO-DL-1234567"
                  value={createForm.driverLicense}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, driverLicense: e.target.value })
                  }
                />
              </div>

              <Input
                label="Assigned Vehicle Unit"
                placeholder="e.g. Cab #400 (Standard Sedan)"
                value={createForm.assignedUnit}
                onChange={(e) =>
                  setCreateForm({ ...createForm, assignedUnit: e.target.value })
                }
              />

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-700">Auto-Generated Username</div>
                  <div className="text-[11px] text-slate-500">
                    Format: [first][last_initial][cab]
                  </div>
                </div>
                <span className="font-mono text-xs font-extrabold text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                  @{createForm.username || generateDriverUsername(createForm.firstName, createForm.lastName, createForm.cabNumber) || 'username'}
                </span>
              </div>
            </section>
          )}

          {/* Staff Desk Extension */}
          {(createForm.roles.includes('dispatcher') || createForm.roles.includes('admin')) && (
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <RadioIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Staff Details
                </h3>
              </div>
              <Input
                label="Desk Phone Extension"
                placeholder="e.g. Ext. 104"
                value={createForm.deskExtension}
                onChange={(e) =>
                  setCreateForm({ ...createForm, deskExtension: e.target.value })
                }
              />
            </section>
          )}
        </form>
      </AdminSlideOverDrawer>
    </div>
  );
}
