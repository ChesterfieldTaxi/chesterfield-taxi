import React, { useState } from 'react';
import type {
  CorporateAccountConfig,
  CorporateAuthorizedRider,
  CorporateSavedLocation,
} from '../../../../core/types/config';
import { Button } from '../../../ui/Button';
import { MapPinIcon, TrashIcon, UsersIcon, XIcon } from '../../../ui/Icons';

export interface CorporateAssetsSectionProps {
  editingCorp: CorporateAccountConfig;
  setEditingCorp: React.Dispatch<React.SetStateAction<CorporateAccountConfig | null>>;
}

export function CorporateAssetsSection({
  editingCorp,
  setEditingCorp,
}: CorporateAssetsSectionProps) {
  const [newRiderName, setNewRiderName] = useState('');
  const [newRiderEmail, setNewRiderEmail] = useState('');
  const [newRiderDept, setNewRiderDept] = useState('');
  const [newCostCenter, setNewCostCenter] = useState('');
  const [newLocLabel, setNewLocLabel] = useState('');
  const [newLocAddress, setNewLocAddress] = useState('');

  const addAuthorizedRider = () => {
    if (!newRiderName.trim()) return;
    const rider: CorporateAuthorizedRider = {
      id: `rider-${Date.now().toString(36)}`,
      name: newRiderName.trim(),
      email: newRiderEmail.trim() || undefined,
      department: newRiderDept.trim() || undefined,
    };
    setEditingCorp({
      ...editingCorp,
      authorizedRiders: [...(editingCorp.authorizedRiders || []), rider],
    });
    setNewRiderName('');
    setNewRiderEmail('');
    setNewRiderDept('');
  };

  const addSavedLocation = () => {
    if (!newLocLabel.trim() || !newLocAddress.trim()) return;
    const loc: CorporateSavedLocation = {
      id: `loc-${Date.now().toString(36)}`,
      label: newLocLabel.trim(),
      address: newLocAddress.trim(),
    };
    setEditingCorp({
      ...editingCorp,
      savedCompanyLocations: [...(editingCorp.savedCompanyLocations || []), loc],
    });
    setNewLocLabel('');
    setNewLocAddress('');
  };

  const addCostCenter = () => {
    const tag = newCostCenter.trim().toUpperCase();
    if (!tag) return;
    setEditingCorp({
      ...editingCorp,
      costCenters: Array.from(new Set([...(editingCorp.costCenters || []), tag])),
    });
    setNewCostCenter('');
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3.5">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
        <UsersIcon className="w-4 h-4 text-indigo-600" />
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
          Authorized Riders, Cost Centers &amp; Saved Places
        </h3>
      </div>

      {/* Cost Centers */}
      <div>
        <label className="font-semibold text-slate-700 block mb-1">Cost Centers</label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newCostCenter}
            onChange={(e) => setNewCostCenter(e.target.value)}
            placeholder="e.g. EXEC-100"
            className="flex-1 h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
          />
          <Button type="button" size="sm" variant="outline" onClick={addCostCenter}>
            + Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(editingCorp.costCenters || []).map((cc) => (
            <span
              key={cc}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-mono font-bold text-[10px]"
            >
              {cc}
              <button
                type="button"
                onClick={() =>
                  setEditingCorp({
                    ...editingCorp,
                    costCenters: (editingCorp.costCenters || []).filter((x) => x !== cc),
                  })
                }
                className="text-slate-400 hover:text-rose-600 cursor-pointer"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Authorized Riders */}
      <div className="pt-2 border-t border-slate-100">
        <label className="font-semibold text-slate-700 block mb-1">Authorized Riders</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          <input
            type="text"
            value={newRiderName}
            onChange={(e) => setNewRiderName(e.target.value)}
            placeholder="Rider Name"
            className="h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs"
          />
          <input
            type="email"
            value={newRiderEmail}
            onChange={(e) => setNewRiderEmail(e.target.value)}
            placeholder="Rider Email"
            className="h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs"
          />
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newRiderDept}
              onChange={(e) => setNewRiderDept(e.target.value)}
              placeholder="Dept"
              className="flex-1 h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs"
            />
            <Button type="button" size="sm" variant="outline" onClick={addAuthorizedRider}>
              Add
            </Button>
          </div>
        </div>
        <div className="space-y-1 max-h-28 overflow-y-auto">
          {(editingCorp.authorizedRiders || []).map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100"
            >
              <span className="truncate font-medium text-slate-800">
                {r.name} {r.department ? `(${r.department})` : ''} {r.email ? `· ${r.email}` : ''}
              </span>
              <button
                type="button"
                onClick={() =>
                  setEditingCorp({
                    ...editingCorp,
                    authorizedRiders: (editingCorp.authorizedRiders || []).filter((x) => x.id !== r.id),
                  })
                }
                className="text-slate-400 hover:text-rose-600 cursor-pointer"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Saved Company Locations */}
      <div className="pt-2 border-t border-slate-100">
        <label className="font-semibold text-slate-700 block mb-1 flex items-center gap-1">
          <MapPinIcon className="w-3.5 h-3.5 text-slate-500" />
          <span>Saved Company Locations</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          <input
            type="text"
            value={newLocLabel}
            onChange={(e) => setNewLocLabel(e.target.value)}
            placeholder="Label (e.g. HQ West Gate)"
            className="h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs"
          />
          <div className="sm:col-span-2 flex gap-1.5">
            <input
              type="text"
              value={newLocAddress}
              onChange={(e) => setNewLocAddress(e.target.value)}
              placeholder="Street Address"
              className="flex-1 h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs"
            />
            <Button type="button" size="sm" variant="outline" onClick={addSavedLocation}>
              Save
            </Button>
          </div>
        </div>
        <div className="space-y-1 max-h-28 overflow-y-auto">
          {(editingCorp.savedCompanyLocations || []).map((loc) => (
            <div
              key={loc.id}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100"
            >
              <span className="truncate text-slate-800">
                <strong>{loc.label}:</strong> {loc.address}
              </span>
              <button
                type="button"
                onClick={() =>
                  setEditingCorp({
                    ...editingCorp,
                    savedCompanyLocations: (editingCorp.savedCompanyLocations || []).filter(
                      (x) => x.id !== loc.id
                    ),
                  })
                }
                className="text-slate-400 hover:text-rose-600 cursor-pointer"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
