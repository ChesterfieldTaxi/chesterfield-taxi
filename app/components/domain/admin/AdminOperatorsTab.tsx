import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, getFirestore } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { getFirebaseApp, getFirebaseAuth, getResolvedFirebaseConfig, isFirebaseConfigured } from '../../../core/services/firebase';
import type { UserRole } from '../../../core/services/auth/admin-auth.service';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Alert';
import { Badge } from '../../ui/Badge';
import { Input } from '../../ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/Card';
import { SpinnerIcon, ShieldCheckIcon, UserIcon, TrashIcon, LockIcon, PlusIcon, PhoneIcon, CarIcon, RadioIcon, ShieldIcon } from '../../ui/Icons';
import { getUniversalGovernanceService } from '../../../core/services/governance/universal-governance.service';
import { UniversalArchiveDrawer, ArchiveBoxIcon } from './UniversalArchiveDrawer';
import { CheckIcon } from '../../ui/Icons';
import {
  type OperatorUser,
  DEFAULT_OPERATORS,
  getOperatorService,
  generateDriverUsername,
} from '../../../core/services/operator.service';

export type { OperatorUser };
export { DEFAULT_OPERATORS };

import { AdminOnboardingQueue } from './subpages/AdminOnboardingQueue';

export interface AdminOperatorsTabProps {
  initialSubTab?: 'roster' | 'onboarding';
}

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
  const [roleFilter, setRoleFilter] = useState<'all' | 'driver' | 'dispatcher' | 'admin'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [isArchiveDrawerOpen, setIsArchiveDrawerOpen] = useState(false);

  // Provisioning Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newCabNumber, setNewCabNumber] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('driver');
  const [newPhone, setNewPhone] = useState('');
  const [newLicense, setNewLicense] = useState('');
  const [newUnit, setNewUnit] = useState('');

  // Edit Operator Modal State
  const [editingOperator, setEditingOperator] = useState<OperatorUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editCabNumber, setEditCabNumber] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editLicense, setEditLicense] = useState('');
  const [editUnit, setEditUnit] = useState('');

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

  const handleUpdateRole = async (uid: string, email: string, roles: UserRole[]) => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (isFirebaseConfigured()) {
        const db = getFirestore(getFirebaseApp());
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, { roles, role: roles[0] || 'customer', email }, { merge: true });
      }
      const existing = operators.find((o) => o.uid === uid);
      if (existing) {
        await getOperatorService().saveOperator({
          ...existing,
          roles,
          role: roles[0] || 'customer',
        });
      }
      setOperators((prev) =>
        prev.map((op) => (op.uid === uid ? { ...op, roles, role: roles[0] || 'customer' } : op))
      );
      setSuccess(`Roles updated to ${roles.join(', ')} for ${email}.`);
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to update role.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (operator: OperatorUser) => {
    const nextStatus = operator.status === 'suspended' ? 'active' : 'suspended';
    setIsSaving(true);
    setError(null);
    try {
      if (isFirebaseConfigured()) {
        const db = getFirestore(getFirebaseApp());
        const userRef = doc(db, 'users', operator.uid);
        await setDoc(userRef, { status: nextStatus }, { merge: true });
      }
      await getOperatorService().saveOperator({ ...operator, status: nextStatus });
      setOperators((prev) =>
        prev.map((op) => (op.uid === operator.uid ? { ...op, status: nextStatus } : op))
      );
      setSuccess(`Operator ${operator.email} is now ${nextStatus.toUpperCase()}.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to toggle operator status.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendPasswordReset = async (email: string) => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (isFirebaseConfigured()) {
        const auth = getFirebaseAuth();
        await sendPasswordResetEmail(auth, email);
      }
      setSuccess(`Password reset instructions sent to ${email}.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOperator = async (uid: string, email: string) => {
    if (email === 'admin@chesterfieldtaxi.com') {
      alert('The root admin account cannot be deleted.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete operator account "${email}"?\n\nThis will revoke access to the Admin and Dispatch consoles immediately.`
    );
    if (!confirmed) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (isFirebaseConfigured()) {
        const db = getFirestore(getFirebaseApp());
        await deleteDoc(doc(db, 'users', uid));
      }
      await getOperatorService().deleteOperator(uid);
      setOperators((prev) => prev.filter((o) => o.uid !== uid));
      setSuccess(`Operator ${email} has been deleted and access revoked.`);
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to delete operator.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOperator) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const fullName = `${editFirstName.trim()} ${editLastName.trim()}`.trim() || editName.trim();
    const cleanCab = editCabNumber.trim().replace(/^#/, '');
    const cleanUsername = editUsername.trim().toLowerCase() || generateDriverUsername(editFirstName, editLastName, cleanCab);
    const assignedUnit = editUnit.trim() || (cleanCab ? `Cab #${cleanCab}` : '');

    const updates: Partial<OperatorUser> = {
      displayName: fullName,
      firstName: editFirstName.trim(),
      lastName: editLastName.trim(),
      cabNumber: cleanCab,
      username: cleanUsername,
      phone: editPhone.trim(),
      driverLicense: editLicense.trim(),
      assignedUnit,
    };

    try {
      if (isFirebaseConfigured()) {
        const db = getFirestore(getFirebaseApp());
        const userRef = doc(db, 'users', editingOperator.uid);
        await setDoc(userRef, updates, { merge: true });
        
        // Also sync fleet if driver
        if ((editingOperator.roles || [editingOperator.role]).includes('driver')) {
           const fleetRef = doc(db, 'fleet', `driver-${editingOperator.uid}`);
           await setDoc(fleetRef, { 
             name: updates.displayName,
             license: updates.driverLicense,
             cabNumber: cleanCab,
             username: cleanUsername,
           }, { merge: true });
        }
      }

      const updatedOp: OperatorUser = { ...editingOperator, ...updates };
      await getOperatorService().saveOperator(updatedOp);

      setOperators((prev) =>
        prev.map((op) => (op.uid === editingOperator.uid ? updatedOp : op))
      );
      
      setSuccess(`Operator ${editingOperator.email} updated successfully.`);
      setEditingOperator(null);
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to update operator details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail || !newPassword.trim()) return;

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const fullName = `${newFirstName.trim()} ${newLastName.trim()}`.trim() || newName.trim();
    const cleanCab = newCabNumber.trim().replace(/^#/, '');
    const cleanUsername = newUsername.trim().toLowerCase() || generateDriverUsername(newFirstName, newLastName, cleanCab);
    const assignedUnit = newUnit.trim() || (cleanCab ? `Cab #${cleanCab}` : '');

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
            newPassword
          );
          createdUid = userCredential.user.uid;
        } finally {
          await signOut(secondaryAuth);
          await deleteApp(secondaryApp);
        }

        const db = getFirestore(getFirebaseApp());
        await setDoc(doc(db, 'users', createdUid), {
          uid: createdUid,
          email: cleanEmail,
          displayName: fullName,
          firstName: newFirstName.trim(),
          lastName: newLastName.trim(),
          cabNumber: cleanCab,
          username: cleanUsername,
          role: newRole,
          phone: newPhone.trim(),
          driverLicense: newLicense.trim(),
          assignedUnit,
          status: 'active',
          createdAt: new Date().toISOString(),
        });
      }

      const newOp: OperatorUser = {
        uid: createdUid,
        email: cleanEmail,
        displayName: fullName,
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
        cabNumber: cleanCab,
        username: cleanUsername,
        role: newRole,
        phone: newPhone.trim(),
        driverLicense: newLicense.trim(),
        assignedUnit,
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      await getOperatorService().saveOperator(newOp);
      setOperators((prev) => [newOp, ...prev]);
      setSuccess(`Operator ${cleanEmail} provisioned successfully with role ${newRole.toUpperCase()}.`);
      setShowAddModal(false);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewFirstName('');
      setNewLastName('');
      setNewCabNumber('');
      setNewUsername('');
      setNewPhone('');
      setNewLicense('');
      setNewUnit('');
    } catch (err: any) {
      setError(err.message || 'Failed to create operator user.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered operators
  const filteredOperators = useMemo(() => {
    return operators.filter((op) => {
      const isArchived = !!(op as any).isArchived;
      if (archiveFilter === 'active' && isArchived) return false;
      if (archiveFilter === 'archived' && !isArchived) return false;
      const activeRoles = op.roles || [op.role];
      if (roleFilter !== 'all' && !activeRoles.includes(roleFilter as UserRole)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchEmail = op.email.toLowerCase().includes(q);
        const matchName = op.displayName?.toLowerCase().includes(q);
        const matchPhone = op.phone?.toLowerCase().includes(q);
        const matchLicense = op.driverLicense?.toLowerCase().includes(q);
        return matchEmail || matchName || matchPhone || matchLicense;
      }
      return true;
    });
  }, [operators, archiveFilter, roleFilter, searchQuery]);

  const roleCounts = useMemo(() => {
    return {
      all: operators.length,
      driver: operators.filter((o) => (o.roles || [o.role]).includes('driver')).length,
      dispatcher: operators.filter((o) => (o.roles || [o.role]).includes('dispatcher')).length,
      admin: operators.filter((o) => (o.roles || [o.role]).includes('admin')).length,
    };
  }, [operators]);

  if (subTab === 'onboarding') {
    return <AdminOnboardingQueue />;
  }

  return (
    <div className="space-y-6">
      {/* ─── Operators Top Action Bar ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2 px-2">
          <ShieldIcon className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs font-bold text-slate-700">
            Operational Staff &amp; Drivers ({operators.length} accounts)
          </span>
          <span className="hidden sm:inline-block text-xs text-slate-400">
            • RBAC Access &amp; Fleet Assignments
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsArchiveDrawerOpen(true)}
            className="text-xs font-bold inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-300 h-9"
          >
            <ArchiveBoxIcon className="w-3.5 h-3.5 text-slate-700 shrink-0" />
            <span>Universal Archive Drawer</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setShowAddModal(true)}
            leftIcon={<PlusIcon className="w-4 h-4" />}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs hover:shadow-sm active:scale-95 h-9"
          >
            Provision Operator
          </Button>
        </div>
      </div>

      {success && (
        <Alert variant="success" title="Success">
          {success}
        </Alert>
      )}

      {error && (
        <Alert variant="error" title="Operator Error">
          {error}
        </Alert>
      )}

      {/* ─── Filter Bar ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        {/* Archive Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setArchiveFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                archiveFilter === 'active'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active ({operators.filter((o) => !(o as any).isArchived).length})
            </button>
            <button
              type="button"
              onClick={() => setArchiveFilter('archived')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                archiveFilter === 'archived'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArchiveBoxIcon className="w-3.5 h-3.5 text-slate-500" />
              <span>Archived ({operators.filter((o) => !!(o as any).isArchived).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setArchiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                archiveFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({operators.length})
            </button>
          </div>

          {/* Role Filter Pills */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setRoleFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                roleFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Staff ({roleCounts.all})
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('driver')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                roleFilter === 'driver'
                  ? 'bg-white text-emerald-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CarIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Drivers</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.2 rounded-full">
                {roleCounts.driver}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('dispatcher')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                roleFilter === 'dispatcher'
                  ? 'bg-white text-blue-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <RadioIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Dispatchers</span>
              <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-1.5 py-0.2 rounded-full">
                {roleCounts.dispatcher}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('admin')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                roleFilter === 'admin'
                  ? 'bg-white text-purple-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldIcon className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span>Admins</span>
              <span className="text-[10px] bg-purple-100 text-purple-800 font-extrabold px-1.5 py-0.2 rounded-full">
                {roleCounts.admin}
              </span>
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs h-9"
          />
        </div>
      </div>

      {/* ─── Operators Roster Table ─── */}
      <Card variant="elevated" className="border-slate-200 bg-white shadow-xs overflow-hidden">
        <CardContent className="p-0 overflow-x-auto custom-scrollbar min-w-full">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
              <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-xs">Loading operational staff &amp; driver roster...</span>
            </div>
          ) : filteredOperators.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No operators found matching the selected filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs divide-y divide-slate-100 min-w-[800px]">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3">Operator</th>
                  <th className="px-5 py-3">Role &amp; RBAC Access</th>
                  <th className="px-5 py-3">Contact Details</th>
                  <th className="px-5 py-3">Driver Info</th>
                  <th className="px-5 py-3">Account Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOperators.map((op) => (
                  <tr key={op.uid} className="hover:bg-slate-50/80 transition-colors">
                    {/* Operator Name & Email */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                            (op.roles || [op.role]).includes('admin')
                              ? 'bg-purple-100 text-purple-700'
                              : (op.roles || [op.role]).includes('dispatcher')
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {op.displayName ? op.displayName.charAt(0).toUpperCase() : '👤'}
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                            <span>{op.displayName || 'Unnamed Operator'}</span>
                            {op.cabNumber && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-extrabold text-[10px] border border-blue-200">
                                #{op.cabNumber}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono mt-0.5">
                            <span>{op.email}</span>
                            {op.username && (
                              <span className="px-1 py-0.2 rounded bg-slate-100 text-slate-600 font-bold border border-slate-200 text-[10px]">
                                @{op.username}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role Dropdown */}
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1">
                        {['driver', 'dispatcher', 'admin'].map(r => (
                          <label key={r} className="flex items-center gap-1 text-[11px] font-medium text-slate-700">
                            <input
                              type="checkbox"
                              disabled={isSaving || op.email === 'admin@chesterfieldtaxi.com'}
                              checked={(op.roles || [op.role]).includes(r as UserRole)}
                              onChange={(e) => {
                                const currentRoles = op.roles || [op.role];
                                let newRoles = currentRoles;
                                if (e.target.checked) {
                                  if (!currentRoles.includes(r as UserRole)) {
                                    newRoles = [...currentRoles, r as UserRole];
                                  }
                                } else {
                                  newRoles = currentRoles.filter(cr => cr !== r);
                                }
                                if (newRoles.length === 0) newRoles = ['customer'];
                                handleUpdateRole(op.uid, op.email, newRoles);
                              }}
                            />
                            {r === 'driver' ? '🚕 Driver' : r === 'dispatcher' ? '🎧 Dispatcher' : '🛡️ Admin'}
                          </label>
                        ))}
                      </div>
                    </td>

                    {/* Contact Details */}
                    <td className="px-5 py-3.5 text-slate-600">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800">
                        <span>📞</span>
                        <span>{op.phone || 'No phone recorded'}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        UID: <span className="font-mono">{op.uid.slice(0, 10)}...</span>
                      </div>
                    </td>

                    {/* Driver License & Unit */}
                    <td className="px-5 py-3.5">
                      {(op.roles || [op.role]).includes('driver') ? (
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-mono font-semibold text-slate-800">
                            {op.driverLicense || 'DL on file'}
                          </div>
                          {op.assignedUnit && (
                            <Badge variant="info" size="sm" className="text-[9px]">
                              {op.assignedUnit}
                            </Badge>
                          )}
                          <div className="mt-1">
                             <span className="text-[10px] font-bold text-slate-500 mr-1">Score:</span>
                             <span className="text-[10px] font-extrabold text-amber-600 bg-amber-50 px-1 rounded">
                                {(op as any).driverScore ?? 100} / 100
                             </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">N/A (Staff)</span>
                      )}
                    </td>

                    {/* Status Toggle */}
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1 items-start">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(op)}
                          disabled={isSaving || op.email === 'admin@chesterfieldtaxi.com'}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-all ${
                            op.status === 'suspended'
                              ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                              : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              op.status === 'suspended' ? 'bg-rose-600' : 'bg-emerald-600'
                            }`}
                          />
                          <span>{op.status === 'suspended' ? 'Suspended' : 'Active'}</span>
                        </button>

                        {/* Universal Governance - Blacklist Indicator */}
                        {(op as any).isBlacklisted && (
                           <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-900 text-white border border-slate-700">
                             ⛔ BLACKLISTED
                           </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOperator(op);
                          const first = op.firstName || (op.displayName ? op.displayName.split(' ')[0] : '');
                          const last = op.lastName || (op.displayName ? op.displayName.split(' ').slice(1).join(' ') : '');
                          const cab = op.cabNumber || (op.assignedUnit ? (op.assignedUnit.match(/#?(\d+)/)?.[1] || op.assignedUnit) : '');
                          const uname = op.username || generateDriverUsername(first, last, cab);
                          setEditName(op.displayName || '');
                          setEditFirstName(first);
                          setEditLastName(last);
                          setEditCabNumber(cab);
                          setEditUsername(uname);
                          setEditPhone(op.phone || '');
                          setEditLicense(op.driverLicense || '');
                          setEditUnit(op.assignedUnit || (cab ? `Cab #${cab}` : ''));
                        }}
                        className="text-slate-500 hover:text-blue-600 text-[11px] font-semibold underline transition-colors"
                        title="Edit Operator Profile"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendPasswordReset(op.email)}
                        className="text-slate-500 hover:text-blue-600 text-[11px] font-semibold underline transition-colors"
                        title="Send Password Reset"
                      >
                        Reset PW
                      </button>

                      {op.email !== 'admin@chesterfieldtaxi.com' && (
                        <>
{/* Archive / Restore Toggle */}
                        <button
                          type="button"
                          onClick={async () => {
                            const isCurrentlyArchived = !!(op as any).isArchived;
                            const entityType = (op.roles || [op.role]).includes('driver') ? 'driver' : 'staff';
                            const gov = getUniversalGovernanceService();
                            await gov.setArchiveStatus(entityType, op.uid, !isCurrentlyArchived);
                            setOperators((prev) =>
                              prev.map((item) =>
                                item.uid === op.uid
                                  ? { ...item, isArchived: !isCurrentlyArchived }
                                  : item
                              )
                            );
                          }}
                          className={`text-[11px] font-semibold underline transition-colors ${
                            (op as any).isArchived
                              ? 'text-emerald-600 hover:text-emerald-700'
                              : 'text-slate-600 hover:text-slate-800'
                          }`}
                          title="Toggle Archive Status"
                        >
                          {(op as any).isArchived ? 'Restore' : 'Archive'}
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            const isCurrentlyBl = !!(op as any).isBlacklisted;
                            const entityType = (op.roles || [op.role]).includes('driver') ? 'driver' : 'staff';
                            const gov = getUniversalGovernanceService();
                            if (!isCurrentlyBl) {
                              const reason = window.prompt(`Enter blacklist sanction reason for ${op.displayName || op.email}:`);
                              if (reason === null) return;
                              await gov.setBlacklistStatus(entityType, op.uid, true, reason || 'Administrative sanction');
                              setOperators((prev) =>
                                prev.map((item) =>
                                  item.uid === op.uid
                                    ? { ...item, isBlacklisted: true, blacklistReason: reason || 'Administrative sanction', status: 'suspended' }
                                    : item
                                )
                              );
                            } else {
                              await gov.setBlacklistStatus(entityType, op.uid, false);
                              setOperators((prev) =>
                                prev.map((item) =>
                                  item.uid === op.uid
                                    ? { ...item, isBlacklisted: false, blacklistReason: undefined }
                                    : item
                                )
                              );
                            }
                          }}
                          className={`text-[11px] font-semibold underline transition-colors ${
                            (op as any).isBlacklisted
                              ? 'text-emerald-600 hover:text-emerald-700'
                              : 'text-rose-600 hover:text-rose-700'
                          }`}
                          title="Toggle Blacklist Sanction"
                        >
                          {(op as any).isBlacklisted ? 'Unblacklist' : 'Blacklist'}
                        </button>
                        </>
                      )}

                      {op.email !== 'admin@chesterfieldtaxi.com' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteOperator(op.uid, op.email)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                          title="Revoke & Delete"
                        >
                          <TrashIcon className="w-3.5 h-3.5 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
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

      {/* ─── Provision Operator Modal ─── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg bg-white shadow-2xl border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-900 text-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base text-white flex items-center gap-2">
                    <span>👥</span>
                    <span>Provision New Operator Account</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-300 mt-0.5">
                    Create Firebase Authentication credentials and register profile in `/users`.
                  </CardDescription>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>
            </CardHeader>

            <form onSubmit={handleCreateOperator} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  placeholder="e.g. Michael"
                  value={newFirstName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewFirstName(val);
                    if (newRole === 'driver') {
                      setNewUsername(generateDriverUsername(val, newLastName, newCabNumber));
                    }
                  }}
                  required
                />
                <Input
                  label="Last Name"
                  placeholder="e.g. Johnson"
                  value={newLastName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewLastName(val);
                    if (newRole === 'driver') {
                      setNewUsername(generateDriverUsername(newFirstName, val, newCabNumber));
                    }
                  }}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    System Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => {
                      const r = e.target.value as UserRole;
                      setNewRole(r);
                      if (r === 'driver') {
                        setNewUsername(generateDriverUsername(newFirstName, newLastName, newCabNumber));
                      }
                    }}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="driver">🚕 Driver (In-vehicle app &amp; jobs)</option>
                    <option value="dispatcher">🎧 Dispatcher (Live control room)</option>
                    <option value="admin">🛡️ Administrator (Full system privileges)</option>
                  </select>
                </div>

                {newRole === 'driver' && (
                  <Input
                    label="Cab / Unit Number"
                    placeholder="e.g. 400"
                    value={newCabNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewCabNumber(val);
                      setNewUsername(generateDriverUsername(newFirstName, newLastName, val));
                    }}
                    helperText="Unit number (e.g. 400 for #400)"
                    required
                  />
                )}
              </div>

              {newRole === 'driver' && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-700">System Username</div>
                    <div className="text-[11px] text-slate-500">Auto-generated: [first][last_initial][cab]</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-extrabold text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                      @{newUsername || generateDriverUsername(newFirstName, newLastName, newCabNumber) || 'username'}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="e.g. driver@chesterfieldtaxi.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />

                <Input
                  label="Temporary Password"
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Phone Number"
                  placeholder="(314) 555-0199"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />

                {newRole === 'driver' ? (
                  <Input
                    label="Driver's License #"
                    placeholder="MO-DL-1234567"
                    value={newLicense}
                    onChange={(e) => setNewLicense(e.target.value)}
                  />
                ) : (
                  <Input
                    label="Desk Phone Extension"
                    placeholder="Ext. 104"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                  />
                )}
              </div>

              {newRole === 'driver' && (
                <Input
                  label="Assigned Vehicle Unit #"
                  placeholder="e.g. Unit #101 (Standard Sedan)"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  helperText="Default vehicle assigned for shift dispatches"
                />
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 font-bold"
                >
                  Provision Account
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
      {/* ─── Edit Operator Modal ─── */}
      {editingOperator && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg bg-white shadow-2xl border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-900 text-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base text-white flex items-center gap-2">
                    <span>✏️</span>
                    <span>Edit Profile: {editingOperator.email}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-300 mt-0.5">
                    Update contact details and vehicle assignment. Roles are managed in the main roster table.
                  </CardDescription>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingOperator(null)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>
            </CardHeader>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  placeholder="e.g. Michael"
                  value={editFirstName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditFirstName(val);
                    if ((editingOperator.roles || [editingOperator.role]).includes('driver')) {
                      setEditUsername(generateDriverUsername(val, editLastName, editCabNumber));
                    }
                  }}
                  required
                />
                <Input
                  label="Last Name"
                  placeholder="e.g. Johnson"
                  value={editLastName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditLastName(val);
                    if ((editingOperator.roles || [editingOperator.role]).includes('driver')) {
                      setEditUsername(generateDriverUsername(editFirstName, val, editCabNumber));
                    }
                  }}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Phone Number"
                  placeholder="(314) 555-0199"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />

                {((editingOperator.roles || [editingOperator.role]).includes('driver')) ? (
                  <Input
                    label="Cab / Unit Number"
                    placeholder="e.g. 400"
                    value={editCabNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditCabNumber(val);
                      setEditUsername(generateDriverUsername(editFirstName, editLastName, val));
                    }}
                    helperText="Assigned cab # (e.g. 400 for #400)"
                  />
                ) : (
                  <Input
                    label="Desk Phone Extension"
                    placeholder="Ext. 104"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                  />
                )}
              </div>

              {((editingOperator.roles || [editingOperator.role]).includes('driver')) && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Driver's License #"
                      placeholder="MO-DL-1234567"
                      value={editLicense}
                      onChange={(e) => setEditLicense(e.target.value)}
                    />
                    <Input
                      label="Assigned Vehicle Unit #"
                      placeholder="e.g. Unit #400"
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value)}
                    />
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-700">Driver System Username</div>
                      <div className="text-[11px] text-slate-500">Pattern: [first][last_initial][cab]</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-extrabold text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                        @{editUsername || generateDriverUsername(editFirstName, editLastName, editCabNumber) || 'username'}
                      </span>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setEditingOperator(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 font-bold"
                >
                  Save Profile
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
