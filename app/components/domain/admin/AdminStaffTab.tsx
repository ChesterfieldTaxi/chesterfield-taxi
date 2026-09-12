import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, getFirestore } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { getFirebaseApp, getFirebaseAuth, getResolvedFirebaseConfig } from '../../../core/services/firebase';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Alert';
import { SpinnerIcon, ShieldCheckIcon, UserIcon, TrashIcon, LockIcon } from '../../ui/Icons';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/Card';

interface StaffUser {
  uid: string;
  email: string;
  role: 'admin' | 'dispatcher' | 'customer';
}

export function AdminStaffTab() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form for provisioning new staff
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'dispatcher'>('dispatcher');

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const db = getFirestore(getFirebaseApp());
      const querySnapshot = await getDocs(collection(db, 'users'));
      const fetchedUsers: StaffUser[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        fetchedUsers.push({
          uid: docSnap.id,
          email: data.email || 'Unknown Email',
          role: data.role || 'customer',
        });
      });
      setUsers(fetchedUsers);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch staff members.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleUpdateRole = async (uid: string, email: string, role: 'admin' | 'dispatcher' | 'customer') => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const db = getFirestore(getFirebaseApp());
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { role, email }, { merge: true });
      setSuccess(`Role updated to ${role.toUpperCase()} for ${email}.`);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update role.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendPasswordReset = async (email: string) => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const auth = getFirebaseAuth();
      await sendPasswordResetEmail(auth, email);
      setSuccess(`Password reset instructions sent to ${email}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStaff = async (uid: string, email: string) => {
    if (email === 'admin@chesterfieldtaxi.com') {
      alert('The root admin account cannot be deleted.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete staff account for "${email}"?\n\nThis will remove their profile and immediately revoke their access to the Admin & Dispatch consoles.`
    );
    if (!confirmed) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const db = getFirestore(getFirebaseApp());
      await deleteDoc(doc(db, 'users', uid));
      setSuccess(`Staff profile for ${email} has been deleted and access revoked.`);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete staff member.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
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

    try {
      const resolved = getResolvedFirebaseConfig();
      const safeConfig = {
        apiKey: resolved.apiKey || 'AIzaSyDemoPlaceholderChesterfieldTaxiKey',
        authDomain: resolved.authDomain || 'chesterfield-taxi.firebaseapp.com',
        projectId: resolved.projectId || 'chesterfield-taxi',
        storageBucket: resolved.storageBucket || 'chesterfield-taxi.appspot.com',
        messagingSenderId: resolved.messagingSenderId || '123456789012',
        appId: resolved.appId || '1:123456789012:web:demo1234567890',
      };

      // Create a secondary app so the current logged-in administrator is never logged out
      const tempAppName = `staff-create-${Date.now()}`;
      const tempApp = initializeApp(safeConfig, tempAppName);
      const tempAuth = getAuth(tempApp);

      const cred = await createUserWithEmailAndPassword(tempAuth, cleanEmail, newPassword);
      const createdUid = cred.user.uid;

      await signOut(tempAuth);
      await deleteApp(tempApp);

      // Save user role in Firestore
      const db = getFirestore(getFirebaseApp());
      const userRef = doc(db, 'users', createdUid);
      await setDoc(userRef, {
        email: cleanEmail,
        role: newRole,
        createdAt: new Date().toISOString(),
      }, { merge: true });

      setSuccess(`Staff account created for ${cleanEmail} with role "${newRole.toUpperCase()}".`);
      setNewEmail('');
      setNewPassword('');
      await fetchUsers();
    } catch (err: any) {
      console.error('[AdminStaffTab] Add staff error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists in Firebase Auth. You can manage their role in the table or send them a password reset.');
      } else {
        setError(err.message || 'Failed to create staff account.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <SpinnerIcon className="w-6 h-6 animate-spin mr-2" />
        <span>Loading staff...</span>
      </div>
    );
  }

  const staffUsers = users.filter(u => u.role === 'admin' || u.role === 'dispatcher');

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="error" title="Staff Management">
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success" title="Success">
          {success}
        </Alert>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Staff List Table */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Active Staff ({staffUsers.length})</h3>
            <span className="text-xs text-slate-500">Admins &amp; Dispatchers</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffUsers.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                        No active staff members found.
                      </td>
                    </tr>
                  ) : (
                    staffUsers.map((user) => (
                      <tr key={user.uid} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 font-bold">
                              <UserIcon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 truncate">{user.email}</div>
                              <div className="text-[11px] text-slate-400 font-mono truncate">{user.uid}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                user.role === 'admin'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Role Switcher */}
                            <select
                              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-50 font-medium"
                              value={user.role}
                              onChange={(e) => handleUpdateRole(user.uid, user.email, e.target.value as any)}
                              disabled={isSaving}
                            >
                              <option value="dispatcher">Dispatcher</option>
                              <option value="admin">Admin</option>
                              <option value="customer">Revoke Access</option>
                            </select>

                            {/* Password Reset Button */}
                            <button
                              type="button"
                              onClick={() => handleSendPasswordReset(user.email)}
                              disabled={isSaving}
                              title="Send password reset link to user email"
                              className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-amber-600 bg-slate-100 hover:bg-amber-50 border border-slate-200 rounded-lg px-2.5 py-1.5 transition-colors font-medium disabled:opacity-50"
                            >
                              <LockIcon className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Reset Pwd</span>
                            </button>

                            {/* Delete / Revoke Account Button */}
                            {user.email !== 'admin@chesterfieldtaxi.com' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteStaff(user.uid, user.email)}
                                disabled={isSaving}
                                title="Delete staff account and revoke all access"
                                className="inline-flex items-center justify-center text-xs text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg p-1.5 transition-colors disabled:opacity-50"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Provision New Staff Card */}
        <div>
          <Card variant="elevated" className="sticky top-24 border-slate-200">
            <CardHeader className="pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Add New Staff</CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">Creates Firebase Auth &amp; permissions</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <ShieldCheckIcon className="w-5 h-5" />
                </div>
              </div>
            </CardHeader>

            <form onSubmit={handleAddStaff}>
              <CardContent className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Staff Email
                  </label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="operator@chesterfieldtaxi.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Initial Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none placeholder-slate-400"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Staff can change their password anytime via the reset link.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Assigned Role
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white font-medium"
                  >
                    <option value="dispatcher">Dispatcher (Dispatch Console Only)</option>
                    <option value="admin">Admin (Full Access &amp; Settings)</option>
                  </select>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full bg-slate-900 text-white hover:bg-slate-800 font-bold shadow-xs py-2.5"
                  isLoading={isSaving}
                >
                  Create Staff Account
                </Button>
              </CardContent>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}


