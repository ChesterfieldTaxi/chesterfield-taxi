import React from 'react';
import type { UserRole } from '../../../../core/services/auth/admin-auth.service';
import { generateDriverUsername, type OperatorUser } from '../../../../core/services/operator.service';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { Select } from '../../../ui/Select';
import {
  ArchiveBoxIcon,
  BanIcon,
  CarIcon,
  CheckIcon,
  LockIcon,
  MailIcon,
  RadioIcon,
  RefreshCwIcon,
  ShieldIcon,
  TrashIcon,
  UserIcon,
} from '../../../ui/Icons';
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';
import { LocationAutocomplete } from '../../LocationAutocomplete';
import {
  CAR_OWNERSHIP_OPTIONS,
  ROLE_META,
  type EditFormState,
} from './operator-provisioning.util';
import { RoleIcon } from './OperatorRosterPanel';

export interface OperatorEditorDrawerProps {
  editingOperator: OperatorUser | null;
  editForm: EditFormState | null;
  isSaving: boolean;
  onChangeForm: (next: EditFormState) => void;
  onClose: () => void;
  onSave: (e?: React.FormEvent) => void;
  onSendPasswordReset: (email: string) => void;
  onDeleteOperator: (uid: string, email: string) => void;
}

export function OperatorEditorDrawer({
  editingOperator,
  editForm,
  isSaving,
  onChangeForm,
  onClose,
  onSave,
  onSendPasswordReset,
  onDeleteOperator,
}: OperatorEditorDrawerProps) {
  const isEditingDriver = Boolean(editForm?.roles.includes('driver'));
  const isEditingStaff = Boolean(editForm?.roles.includes('dispatcher') || editForm?.roles.includes('admin'));
  const isRootEditing = editingOperator?.email === 'admin@chesterfieldtaxi.com';

  const toggleEditRole = (r: UserRole) => {
    if (!editForm || !editingOperator || (isRootEditing && r === 'admin')) return;
    const exists = editForm.roles.includes(r);
    const next = exists ? editForm.roles.filter((item) => item !== r) : [...editForm.roles, r];
    onChangeForm({ ...editForm, roles: next.length > 0 ? next : ['customer'] });
  };

  return (
    <AdminSlideOverDrawer
      isOpen={Boolean(editingOperator && editForm)}
      onClose={onClose}
      title={editingOperator?.displayName || editingOperator?.email || 'Edit Roster Member'}
      subtitle={editingOperator ? `${editingOperator.email} · UID ${editingOperator.uid.slice(0, 10)}` : ''}
      size="lg"
      headerBadge={
        editForm && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${editForm.isBlacklisted ? 'bg-surface-header text-white' : editForm.status === 'suspended' ? 'bg-status-danger-bg-strong text-status-danger-fg' : 'bg-status-success-bg-strong text-status-success-fg'}`}>
            {editForm.isBlacklisted ? 'Blacklisted' : editForm.status === 'suspended' ? 'Suspended' : 'Active'}
          </span>
        )
      }
      footer={
        <>
          <Button type="button" variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" size="md" isLoading={isSaving} onClick={() => onSave()} leftIcon={<CheckIcon className="w-4 h-4" />} className="font-bold">
            Save Changes
          </Button>
        </>
      }
    >
      {editingOperator && editForm && (
        <form onSubmit={onSave} className="space-y-5">
          {/* Identity & Contact */}
          <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border-faint">
              <UserIcon className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-strong">Identity &amp; Contact</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input label="First Name" placeholder="e.g. Michael" value={editForm.firstName} onChange={(e) => onChangeForm({ ...editForm, firstName: e.target.value })} required />
              <Input label="Last Name" placeholder="e.g. Vinnik" value={editForm.lastName} onChange={(e) => onChangeForm({ ...editForm, lastName: e.target.value })} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input label="Email Address" type="email" value={editForm.email} disabled={isRootEditing} onChange={(e) => onChangeForm({ ...editForm, email: e.target.value })} helperText={isRootEditing ? 'Root admin email is locked' : 'Profile contact email'} />
              <Input label="Phone Number" placeholder="(314) 555-0199" value={editForm.phone} onChange={(e) => onChangeForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-fg-secondary mb-1">System Username</label>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle text-xs font-mono">@</span>
                    <input
                      type="text"
                      value={editForm.username}
                      onChange={(e) => onChangeForm({ ...editForm, username: e.target.value.toLowerCase() })}
                      className="w-full h-10 pl-7 pr-3 rounded-xl border border-border-strong bg-surface-card text-xs font-mono font-semibold text-fg-primary focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onChangeForm({ ...editForm, username: generateDriverUsername(editForm.firstName, editForm.lastName, editForm.cabNumber) })}
                    title="Auto-generate username from name & car #"
                    className="h-10 px-2.5 rounded-xl border border-border-subtle bg-surface-subtle hover:bg-surface-muted text-fg-secondary cursor-pointer"
                  >
                    <RefreshCwIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <Input label="Hire / Start Date" type="date" value={editForm.hireDate} onChange={(e) => onChangeForm({ ...editForm, hireDate: e.target.value })} />
            </div>
            <Input label="Emergency Contact" placeholder="Name & phone number" value={editForm.emergencyContact} onChange={(e) => onChangeForm({ ...editForm, emergencyContact: e.target.value })} />
          </section>

          {/* Roles & Console Access */}
          <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border-faint">
              <div className="flex items-center gap-2">
                <ShieldIcon className="w-4 h-4 text-purple-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-strong">Roles &amp; Console Access</h3>
              </div>
              <span className="text-[10px] font-semibold text-fg-subtle">Select one or more</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(['driver', 'dispatcher', 'admin', 'corporate_manager'] as UserRole[]).map((r) => {
                const selected = editForm.roles.includes(r);
                const meta = ROLE_META[r];
                const locked = isRootEditing && r === 'admin';
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={locked}
                    onClick={() => toggleEditRole(r)}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-70 ${selected ? meta.cardActiveClass : 'border-border-subtle bg-surface-card hover:border-border-strong'}`}
                  >
                    <div className="mt-0.5 shrink-0"><RoleIcon role={r} className={`w-4 h-4 ${meta.iconClass}`} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-fg-primary flex items-center justify-between">
                        <span>{meta.label}</span>
                        {selected && <CheckIcon className="w-3.5 h-3.5 text-fg-strong" />}
                      </div>
                      <div className="text-[11px] text-fg-muted mt-0.5">{meta.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Driver & Vehicle Assignment */}
          {isEditingDriver && (
            <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border-faint">
                <CarIcon className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-strong">Driver &amp; Vehicle Assignment</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Input
                  label="Car Number"
                  placeholder="e.g. 947"
                  value={editForm.cabNumber}
                  onChange={(e) => {
                    const cab = e.target.value;
                    onChangeForm({ ...editForm, cabNumber: cab, assignedUnit: cab.trim() ? `Car #${cab.trim().replace(/^#/, '')}` : editForm.assignedUnit });
                  }}
                  helperText="Displayed on dispatch board as Car #..."
                />
                <Input label="Assigned Car" placeholder="e.g. Car #947 (Sedan)" value={editForm.assignedUnit} onChange={(e) => onChangeForm({ ...editForm, assignedUnit: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Input label="Driver's License / Permit #" placeholder="MO-DL-1234567" value={editForm.driverLicense} onChange={(e) => onChangeForm({ ...editForm, driverLicense: e.target.value })} />
                <Select
                  label="Car Ownership"
                  options={CAR_OWNERSHIP_OPTIONS}
                  value={editForm.carOwnership}
                  onValueChange={(val) =>
                    onChangeForm({
                      ...editForm,
                      carOwnership: val === 'company_owned' ? 'company_owned' : 'owner_operator',
                    })
                  }
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-fg-secondary">Driver Score</label>
                  <span className="text-xs font-extrabold text-status-warning-fg bg-status-warning-bg px-2 py-0.5 rounded-md tabular-nums">{editForm.driverScore} / 100</span>
                </div>
                <input type="range" min={0} max={100} value={editForm.driverScore} onChange={(e) => onChangeForm({ ...editForm, driverScore: Number(e.target.value) })} className="w-full accent-blue-600 mt-2 cursor-pointer" />
              </div>
              <LocationAutocomplete
                label="Driver Home Address"
                placeholder="Search driver's home base address..."
                value={editForm.homeAddress || ''}
                onChange={(val) =>
                  onChangeForm({
                    ...editForm,
                    homeAddress: val,
                    homeCoordinates: val.trim() ? editForm.homeCoordinates : undefined,
                  })
                }
                onPlaceSelected={(place) =>
                  onChangeForm({
                    ...editForm,
                    homeAddress: place.address,
                    homeCoordinates: place.coordinates,
                  })
                }
                helperText="Used for optional Dispatch Map 'Driver Homes' layer"
              />
            </section>
          )}

          {/* Staff Desk Extension */}
          {isEditingStaff && (
            <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border-faint">
                <RadioIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-strong">Staff &amp; Dispatch Details</h3>
              </div>
              <Input label="Desk Phone Extension" placeholder="e.g. Ext. 104" value={editForm.deskExtension} onChange={(e) => onChangeForm({ ...editForm, deskExtension: e.target.value })} />
            </section>
          )}

          {/* Governance, Status & Notes */}
          <section className="bg-surface-card rounded-2xl border border-border-subtle/90 p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border-faint">
              <LockIcon className="w-4 h-4 text-fg-secondary" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-strong">Governance, Status &amp; Notes</h3>
            </div>
            {!isRootEditing && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => onChangeForm({ ...editForm, status: editForm.status === 'active' ? 'suspended' : 'active' })}
                  className={`p-3 rounded-xl border text-left cursor-pointer ${editForm.status === 'suspended' ? 'border-status-danger-border bg-status-danger-bg text-status-danger-fg' : 'border-status-success-border bg-status-success-bg/70 text-status-success-fg'}`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">Account Status</div>
                  <div className="text-xs font-extrabold mt-0.5">{editForm.status === 'suspended' ? 'Suspended' : 'Active'}</div>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeForm({ ...editForm, isBlacklisted: !editForm.isBlacklisted, status: !editForm.isBlacklisted ? 'suspended' : editForm.status })}
                  className={`p-3 rounded-xl border text-left cursor-pointer ${editForm.isBlacklisted ? 'border-slate-900 bg-surface-header text-white' : 'border-border-subtle bg-surface-subtle/70 text-fg-secondary hover:border-border-strong'}`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">Sanction</div>
                  <div className="text-xs font-extrabold mt-0.5 flex items-center gap-1"><BanIcon className="w-3.5 h-3.5" /><span>{editForm.isBlacklisted ? 'Blacklisted' : 'Not Blacklisted'}</span></div>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeForm({ ...editForm, isArchived: !editForm.isArchived })}
                  className={`p-3 rounded-xl border text-left cursor-pointer ${editForm.isArchived ? 'border-status-warning-border bg-status-warning-bg text-status-warning-fg' : 'border-border-subtle bg-surface-subtle/70 text-fg-secondary hover:border-border-strong'}`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">Roster Archive</div>
                  <div className="text-xs font-extrabold mt-0.5 flex items-center gap-1"><ArchiveBoxIcon className="w-3.5 h-3.5" /><span>{editForm.isArchived ? 'Archived' : 'On Active Roster'}</span></div>
                </button>
              </div>
            )}

            {editForm.isBlacklisted && !isRootEditing && (
              <Input label="Blacklist Reason" placeholder="Enter administrative sanction reason..." value={editForm.blacklistReason} onChange={(e) => onChangeForm({ ...editForm, blacklistReason: e.target.value })} />
            )}

            <div>
              <label className="block text-xs font-semibold text-fg-secondary mb-1">Internal Admin Notes</label>
              <textarea
                rows={3}
                value={editForm.adminNotes}
                onChange={(e) => onChangeForm({ ...editForm, adminNotes: e.target.value })}
                placeholder="Shift preferences, compliance notes, vehicle history..."
                className="w-full rounded-xl border border-border-strong bg-surface-card px-3 py-2 text-xs text-fg-primary placeholder:text-fg-subtle focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border-faint">
              <button type="button" onClick={() => onSendPasswordReset(editingOperator.email)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-fg-secondary bg-surface-muted hover:bg-surface-emphasis cursor-pointer">
                <MailIcon className="w-3.5 h-3.5 text-fg-muted" /><span>Send Password Reset Email</span>
              </button>
              {!isRootEditing && (
                <button type="button" onClick={() => onDeleteOperator(editingOperator.uid, editingOperator.email)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-status-danger-fg bg-status-danger-bg hover:bg-status-danger-bg-strong cursor-pointer">
                  <TrashIcon className="w-3.5 h-3.5" /><span>Delete Account</span>
                </button>
              )}
            </div>
          </section>
        </form>
      )}
    </AdminSlideOverDrawer>
  );
}
