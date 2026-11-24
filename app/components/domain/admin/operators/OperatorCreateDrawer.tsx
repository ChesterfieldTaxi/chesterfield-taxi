import React from 'react';
import type { UserRole } from '../../../../core/services/auth/admin-auth.service';
import { generateDriverUsername } from '../../../../core/services/operator.service';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import {
  CarIcon,
  CheckIcon,
  PlusIcon,
  RadioIcon,
  ShieldIcon,
  UserIcon,
} from '../../../ui/Icons';
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';
import { ROLE_META, type CreateOperatorFormState } from './operator-provisioning.util';
import { RoleIcon } from './OperatorRosterPanel';

export interface OperatorCreateDrawerProps {
  isOpen: boolean;
  createForm: CreateOperatorFormState;
  isSaving: boolean;
  onChangeForm: (next: CreateOperatorFormState) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function OperatorCreateDrawer({
  isOpen,
  createForm,
  isSaving,
  onChangeForm,
  onClose,
  onSubmit,
}: OperatorCreateDrawerProps) {
  const toggleCreateRole = (r: UserRole) => {
    const exists = createForm.roles.includes(r);
    const next = exists ? createForm.roles.filter((item) => item !== r) : [...createForm.roles, r];
    const finalRoles: UserRole[] = next.length > 0 ? next : ['driver'];
    onChangeForm({
      ...createForm,
      roles: finalRoles,
      username:
        finalRoles.includes('driver') && !createForm.username
          ? generateDriverUsername(createForm.firstName, createForm.lastName, createForm.cabNumber)
          : createForm.username,
    });
  };

  return (
    <AdminSlideOverDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Add Member"
      subtitle="Create login credentials and add a driver or staff member to the roster"
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" size="md" onClick={onClose}>
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
      <form id="create-operator-form" onSubmit={onSubmit} className="space-y-5">
        {/* Roles */}
        <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <ShieldIcon className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
              Assign Roles
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(['driver', 'dispatcher', 'admin', 'corporate_manager'] as UserRole[]).map((r) => {
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
                onChangeForm({
                  ...createForm,
                  firstName: val,
                  username: createForm.roles.includes('driver')
                    ? generateDriverUsername(val, createForm.lastName, createForm.cabNumber)
                    : createForm.username,
                });
              }}
              required
            />
            <Input
              label="Last Name"
              placeholder="e.g. Johnson"
              value={createForm.lastName}
              onChange={(e) => {
                const val = e.target.value;
                onChangeForm({
                  ...createForm,
                  lastName: val,
                  username: createForm.roles.includes('driver')
                    ? generateDriverUsername(createForm.firstName, val, createForm.cabNumber)
                    : createForm.username,
                });
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
              onChange={(e) => onChangeForm({ ...createForm, email: e.target.value })}
              required
            />
            <Input
              label="Temporary Password"
              type="password"
              placeholder="Minimum 6 characters"
              value={createForm.password}
              onChange={(e) => onChangeForm({ ...createForm, password: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Phone Number"
              placeholder="(314) 555-0199"
              value={createForm.phone}
              onChange={(e) => onChangeForm({ ...createForm, phone: e.target.value })}
            />
            <Input
              label="Emergency Contact"
              placeholder="Name & phone (optional)"
              value={createForm.emergencyContact}
              onChange={(e) => onChangeForm({ ...createForm, emergencyContact: e.target.value })}
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
                label="Car Number"
                placeholder="e.g. 400"
                value={createForm.cabNumber}
                onChange={(e) => {
                  const val = e.target.value;
                  onChangeForm({
                    ...createForm,
                    cabNumber: val,
                    assignedUnit: val.trim()
                      ? `Car #${val.trim().replace(/^#/, '')}`
                      : createForm.assignedUnit,
                    username: generateDriverUsername(createForm.firstName, createForm.lastName, val),
                  });
                }}
                required
              />
              <Input
                label="Driver's License #"
                placeholder="MO-DL-1234567"
                value={createForm.driverLicense}
                onChange={(e) => onChangeForm({ ...createForm, driverLicense: e.target.value })}
              />
            </div>

            <Input
              label="Assigned Car"
              placeholder="e.g. Car #400 (Standard Sedan)"
              value={createForm.assignedUnit}
              onChange={(e) => onChangeForm({ ...createForm, assignedUnit: e.target.value })}
            />

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-700">Auto-Generated Username</div>
                <div className="text-[11px] text-slate-500">Format: [first][last_initial][cab]</div>
              </div>
              <span className="font-mono text-xs font-extrabold text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                @
                {createForm.username ||
                  generateDriverUsername(createForm.firstName, createForm.lastName, createForm.cabNumber) ||
                  'username'}
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
              onChange={(e) => onChangeForm({ ...createForm, deskExtension: e.target.value })}
            />
          </section>
        )}
      </form>
    </AdminSlideOverDrawer>
  );
}
