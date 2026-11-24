import React, { useEffect, useState } from 'react';
import { Alert } from '../../ui/Alert';
import { DEFAULT_OPERATORS, getOperatorService, type OperatorUser } from '../../../core/services/operator.service';
import type { AppSettings } from '../../../core/types/config';
import { AdminOnboardingQueue } from './subpages/AdminOnboardingQueue';
import {
  buildInitialEditFormState,
  deleteOperatorAccount,
  DriverAppPoliciesPanel,
  EMPTY_CREATE_STATE,
  OperatorCreateDrawer,
  OperatorEditorDrawer,
  OperatorPermissionsPanel,
  OperatorRosterPanel,
  provisionNewOperatorAccount,
  saveEditedOperatorProfile,
  sendOperatorPasswordReset,
  type CreateOperatorFormState,
  type EditFormState,
} from './operators';

export type { OperatorUser };
export { DEFAULT_OPERATORS };

export type OperatorsSubTab = 'roster' | 'permissions' | 'driver-policies' | 'onboarding';

export interface AdminOperatorsTabProps {
  initialSubTab?: OperatorsSubTab | string;
  settings?: AppSettings;
}

function normalizeOperatorsSubTab(raw?: string): OperatorsSubTab {
  if (raw === 'roster' || raw === 'permissions' || raw === 'driver-policies' || raw === 'onboarding') {
    return raw;
  }
  return 'roster';
}

export function AdminOperatorsTab({ initialSubTab = 'roster', settings }: AdminOperatorsTabProps = {}) {
  const [subTab, setSubTab] = useState<OperatorsSubTab>(() => normalizeOperatorsSubTab(initialSubTab));
  useEffect(() => { setSubTab(normalizeOperatorsSubTab(initialSubTab)); }, [initialSubTab]);

  const [operators, setOperators] = useState<OperatorUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [createForm, setCreateForm] = useState<CreateOperatorFormState>(EMPTY_CREATE_STATE);
  const [editingOperator, setEditingOperator] = useState<OperatorUser | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess((cur) => (cur === msg ? null : cur)), 3800);
  };

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    getOperatorService()
      .getOperators()
      .then((fetched) => { if (active) setOperators(fetched); })
      .catch(() => { if (active) setOperators(DEFAULT_OPERATORS); })
      .finally(() => { if (active) setIsLoading(false); });

    const unsub = getOperatorService().subscribeToOperators((ops) => {
      if (active && ops && ops.length > 0) setOperators(ops);
    });
    return () => { active = false; unsub(); };
  }, []);

  const openEditDrawer = (op: OperatorUser) => {
    setEditingOperator(op);
    setEditForm(buildInitialEditFormState(op));
  };

  const handleToggleStatus = async (operator: OperatorUser) => {
    if (operator.email === 'admin@chesterfieldtaxi.com') return;
    const nextStatus = operator.status === 'suspended' ? 'active' : 'suspended';
    setIsSaving(true);
    setError(null);
    try {
      await getOperatorService().saveOperator({ ...operator, status: nextStatus });
      setOperators((prev) => prev.map((op) => (op.uid === operator.uid ? { ...op, status: nextStatus } : op)));
      flashSuccess(`${operator.displayName || operator.email} is now ${nextStatus.toUpperCase()}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to update status.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendPasswordReset = async (email: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await sendOperatorPasswordReset(email);
      flashSuccess(`Password reset email sent to ${email}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to send password reset email.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOperator = async (uid: string, email: string) => {
    if (email === 'admin@chesterfieldtaxi.com') {
      setError('The root administrator account cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete "${email}"?\n\nThis revokes access to all consoles immediately.`)) return;

    setIsSaving(true);
    setError(null);
    try {
      await deleteOperatorAccount(uid, email);
      setOperators((prev) => prev.filter((o) => o.uid !== uid));
      if (editingOperator?.uid === uid) {
        setEditingOperator(null);
        setEditForm(null);
      }
      flashSuccess(`Account ${email} deleted and access revoked.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete account.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingOperator || !editForm) return;
    setIsSaving(true);
    setError(null);
    try {
      const updatedOp = await saveEditedOperatorProfile(editingOperator, editForm);
      setOperators((prev) => prev.map((op) => (op.uid === editingOperator.uid ? updatedOp : op)));
      flashSuccess(`Saved all changes for ${updatedOp.displayName || updatedOp.email}.`);
      setEditingOperator(null);
      setEditForm(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to save operator profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const newOp = await provisionNewOperatorAccount(createForm);
      setOperators((prev) => [newOp, ...prev]);
      flashSuccess(`Account created for ${newOp.displayName} (${(newOp.roles || [newOp.role]).join(', ')}).`);
      setShowAddDrawer(false);
      setCreateForm(EMPTY_CREATE_STATE);
    } catch (err: any) {
      setError(err?.message || 'Failed to provision account.');
    } finally {
      setIsSaving(false);
    }
  };

  if (subTab === 'onboarding') return <AdminOnboardingQueue />;

  return (
    <div className="space-y-4">
      {success && <Alert variant="success" title="Saved">{success}</Alert>}
      {error && <Alert variant="error" title="Roster Error">{error}</Alert>}

      {subTab === 'roster' && (
        <>
          <OperatorRosterPanel
            operators={operators}
            isLoading={isLoading}
            isSaving={isSaving}
            onOpenCreate={() => { setCreateForm(EMPTY_CREATE_STATE); setShowAddDrawer(true); }}
            onOpenEdit={openEditDrawer}
            onToggleStatus={handleToggleStatus}
            onSendPasswordReset={handleSendPasswordReset}
            onDeleteOperator={handleDeleteOperator}
          />
          <OperatorEditorDrawer
            editingOperator={editingOperator}
            editForm={editForm}
            isSaving={isSaving}
            onChangeForm={setEditForm}
            onClose={() => { setEditingOperator(null); setEditForm(null); }}
            onSave={handleSaveEdit}
            onSendPasswordReset={handleSendPasswordReset}
            onDeleteOperator={handleDeleteOperator}
          />
          <OperatorCreateDrawer
            isOpen={showAddDrawer}
            createForm={createForm}
            isSaving={isSaving}
            onChangeForm={setCreateForm}
            onClose={() => setShowAddDrawer(false)}
            onSubmit={handleCreateOperator}
          />
        </>
      )}

      {subTab === 'permissions' && (
        <OperatorPermissionsPanel
          operators={operators}
          dispatchAutomation={settings?.dispatchAutomation}
          onUpdateOperatorLocal={(updated) => setOperators((prev) => prev.map((op) => (op.uid === updated.uid ? updated : op)))}
          onFlashSuccess={flashSuccess}
          onFlashError={(msg) => setError(msg)}
        />
      )}

      {subTab === 'driver-policies' && (
        <DriverAppPoliciesPanel onFlashSuccess={flashSuccess} onFlashError={(msg) => setError(msg)} />
      )}
    </div>
  );
}
