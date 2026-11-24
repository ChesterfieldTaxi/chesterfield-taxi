import React from 'react';
import type { UserRole } from '../../../../core/services/auth/admin-auth.service';
import { generateDriverUsername, type OperatorUser } from '../../../../core/services/operator.service';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
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
import { ROLE_META, type EditFormState } from './operator-provisioning.util';
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
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${editForm.isBlacklisted ? 'bg-slate-900 text-white' : editForm.status === 'suspended' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
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
          <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <UserIcon className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">Identity &amp; Contact</h3>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">System Username</label>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono">@</span>
                    <input
                      type="text"
                      value={editForm.username}
                      onChange={(e) => onChangeForm({ ...editForm, username: e.target.value.toLowerCase() })}
                      className="w-full h-10 pl-7 pr-3 rounded-xl border border-slate-300 bg-white text-xs font-mono font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onChangeForm({ ...editForm, username: generateDriverUsername(editForm.firstName, editForm.lastName, editForm.cabNumber) })}
                    title="Auto-generate username from name & car #"
                    className="h-10 px-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 cursor-pointer"
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
          <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldIcon className="w-4 h-4 text-purple-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">Roles &amp; Console Access</h3>
              </div>
              <span className="text-[10px] font-semibold text-slate-400">Select one or more</span>
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
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-70 ${selected ? meta.cardActiveClass : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <div className="mt-0.5 shrink-0"><RoleIcon role={r} className={`w-4 h-4 ${meta.iconClass}`} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                        <span>{meta.label}</span>
                        {selected && <CheckIcon className="w-3.5 h-3.5 text-slate-800" />}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{meta.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Driver & Vehicle Assignment */}
          {isEditingDriver && (
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <CarIcon className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">Driver &amp; Vehicle Assignment</h3>
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
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">Driver Score</label>
                    <span className="text-xs font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md tabular-nums">{editForm.driverScore} / 100</span>
                  </div>
                  <input type="range" min={0} max={100} value={editForm.driverScore} onChange={(e) => onChangeForm({ ...editForm, driverScore: Number(e.target.value) })} className="w-full accent-blue-600 mt-2 cursor-pointer" />
                </div>
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
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <RadioIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">Staff &amp; Dispatch Details</h3>
              </div>
              <Input label="Desk Phone Extension" placeholder="e.g. Ext. 104" value={editForm.deskExtension} onChange={(e) => onChangeForm({ ...editForm, deskExtension: e.target.value })} />
            </section>
          )}

          {/* Governance, Status & Notes */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <LockIcon className="w-4 h-4 text-slate-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">Governance, Status &amp; Notes</h3>
            </div>
            {!isRootEditing && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => onChangeForm({ ...editForm, status: editForm.status === 'active' ? 'suspended' : 'active' })}
                  className={`p-3 rounded-xl border text-left cursor-pointer ${editForm.status === 'suspended' ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50/70 text-emerald-800'}`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">Account Status</div>
                  <div className="text-xs font-extrabold mt-0.5">{editForm.status === 'suspended' ? 'Suspended' : 'Active'}</div>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeForm({ ...editForm, isBlacklisted: !editForm.isBlacklisted, status: !editForm.isBlacklisted ? 'suspended' : editForm.status })}
                  className={`p-3 rounded-xl border text-left cursor-pointer ${editForm.isBlacklisted ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300'}`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">Sanction</div>
                  <div className="text-xs font-extrabold mt-0.5 flex items-center gap-1"><BanIcon className="w-3.5 h-3.5" /><span>{editForm.isBlacklisted ? 'Blacklisted' : 'Not Blacklisted'}</span></div>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeForm({ ...editForm, isArchived: !editForm.isArchived })}
                  className={`p-3 rounded-xl border text-left cursor-pointer ${editForm.isArchived ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300'}`}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Internal Admin Notes</label>
              <textarea
                rows={3}
                value={editForm.adminNotes}
                onChange={(e) => onChangeForm({ ...editForm, adminNotes: e.target.value })}
                placeholder="Shift preferences, compliance notes, vehicle history..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => onSendPasswordReset(editingOperator.email)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer">
                <MailIcon className="w-3.5 h-3.5 text-slate-500" /><span>Send Password Reset Email</span>
              </button>
              {!isRootEditing && (
                <button type="button" onClick={() => onDeleteOperator(editingOperator.uid, editingOperator.email)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 cursor-pointer">
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
