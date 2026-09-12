import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, getFirestore } from 'firebase/firestore';
import { getFirebaseApp } from '../../../core/services/firebase';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Alert';
import { SpinnerIcon, ShieldCheckIcon, UserIcon } from '../../ui/Icons';
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
  const [isSaving, setIsSaving] = useState(false);

  // Form for new staff
  const [newUid, setNewUid] = useState('');
  const [newEmail, setNewEmail] = useState('');
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
    try {
      const db = getFirestore(getFirebaseApp());
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { role, email }, { merge: true });
      await fetchUsers(); // Refresh list
    } catch (err: any) {
      setError(err.message || 'Failed to update role.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUid.trim() || !newEmail.trim()) return;
    setIsSaving(true);
    try {
      const db = getFirestore(getFirebaseApp());
      const userRef = doc(db, 'users', newUid.trim());
      await setDoc(userRef, { role: newRole, email: newEmail.trim() }, { merge: true });
      setNewUid('');
      setNewEmail('');
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to add staff member.');
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
      {error && <Alert variant="error" title="Staff Management Error">{error}</Alert>}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-bold text-slate-800">Active Staff</h3>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
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
                      No staff members found.
                    </td>
                  </tr>
                ) : (
                  staffUsers.map(user => (
                    <tr key={user.uid} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                            <UserIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">{user.email}</div>
                            <div className="text-xs text-slate-400 font-mono">{user.uid}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            user.role === 'admin'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <select
                          className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-50"
                          value={user.role}
                          onChange={(e) => handleUpdateRole(user.uid, user.email, e.target.value as any)}
                          disabled={isSaving}
                        >
                          <option value="admin">Admin</option>
                          <option value="dispatcher">Dispatcher</option>
                          <option value="customer">Revoke Access (Customer)</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <Card variant="elevated" className="sticky top-24">
            <CardHeader className="pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Provision Staff</CardTitle>
                <ShieldCheckIcon className="w-5 h-5 text-slate-400" />
              </div>
            </CardHeader>
            <form onSubmit={handleAddStaff}>
              <CardContent className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">User UID</label>
                  <input
                    type="text"
                    required
                    value={newUid}
                    onChange={(e) => setNewUid(e.target.value)}
                    placeholder="Firebase Auth UID"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Retrieve from Firebase Console &gt; Authentication.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Email</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="staff@chesterfieldtaxi.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                  >
                    <option value="dispatcher">Dispatcher</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <Button type="submit" variant="primary" className="w-full bg-slate-900 text-white hover:bg-slate-800" isLoading={isSaving}>
                  Provision Role
                </Button>
              </CardContent>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

