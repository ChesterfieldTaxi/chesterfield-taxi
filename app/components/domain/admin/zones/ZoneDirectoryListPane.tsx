import React from 'react';
import type {
  ZoneGeofence,
  ZoneGroup,
  LocationCollection,
  LocationCategory,
  BlacklistedLocation,
} from '~/core/types/zone';
import { Card } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Badge } from '~/components/ui/Badge';
import {
  PlusIcon,
  TrashIcon,
  CheckIcon,
  SpinnerIcon,
  MapPinIcon,
  LayersIcon,
  CompassIcon,
  AlertTriangleIcon,
  ZapIcon,
  PlaneIcon,
  TrophyIcon,
  TrainIcon,
  HomeModernIcon,
  HeartPulseIcon,
  EditIcon,
} from '~/components/ui/Icons';
import type { AdminZonesSubTab, ZoneArchiveFilter } from './types';

function getCategoryIcon(cat?: LocationCategory | string) {
  switch (cat) {
    case 'airport':
      return <PlaneIcon className="w-3.5 h-3.5 inline-block text-blue-600" />;
    case 'venue':
      return <TrophyIcon className="w-3.5 h-3.5 inline-block text-purple-600" />;
    case 'train_station':
      return <TrainIcon className="w-3.5 h-3.5 inline-block text-cyan-600" />;
    case 'hotel':
      return <HomeModernIcon className="w-3.5 h-3.5 inline-block text-amber-600" />;
    case 'hospital':
      return <HeartPulseIcon className="w-3.5 h-3.5 inline-block text-rose-600" />;
    default:
      return <MapPinIcon className="w-3.5 h-3.5 inline-block text-slate-500" />;
  }
}

export interface ZoneSubTabActionBarProps {
  activeSubTab: AdminZonesSubTab;
  zonesCount: number;
  zoneGroupsCount: number;
  locationCollectionsCount: number;
  blacklistedLocationsCount: number;
  onResetZones: () => void;
  onStartCreateZone: () => void;
  onStartDrawPolygonZone: () => void;
  onResetGroups: () => void;
  onStartCreateGroup: () => void;
  onResetCollections: () => void;
  onStartCreateCollection: () => void;
  onStartCreateBlacklist: () => void;
}

export function ZoneSubTabActionBar({
  activeSubTab,
  zonesCount,
  zoneGroupsCount,
  locationCollectionsCount,
  blacklistedLocationsCount,
  onResetZones,
  onStartCreateZone,
  onStartDrawPolygonZone,
  onResetGroups,
  onStartCreateGroup,
  onResetCollections,
  onStartCreateCollection,
  onStartCreateBlacklist,
}: ZoneSubTabActionBarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
      <div className="text-xs font-bold text-slate-700 px-1 flex items-center gap-2 min-w-0">
        {activeSubTab === 'zones' && (
          <>
            <MapPinIcon className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="truncate">Service Zones ({zonesCount})</span>
          </>
        )}
        {activeSubTab === 'groups' && (
          <>
            <LayersIcon className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="truncate">Zone Groups &amp; Corridors ({zoneGroupsCount})</span>
          </>
        )}
        {activeSubTab === 'collections' && (
          <>
            <CompassIcon className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate">POI Location Collections ({locationCollectionsCount})</span>
          </>
        )}
        {activeSubTab === 'blacklists' && (
          <>
            <AlertTriangleIcon className="w-4 h-4 text-red-600 shrink-0" />
            <span className="truncate">Exclusion Zones &amp; Blacklists ({blacklistedLocationsCount})</span>
          </>
        )}
      </div>

      {/* Action Button for Active SubTab */}
      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
        {activeSubTab === 'zones' && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onResetZones}
              className="flex-1 sm:flex-none justify-center text-xs font-semibold text-slate-800 hover:text-slate-950 border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-100 shadow-2xs"
            >
              Reset
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onStartCreateZone}
              leftIcon={<PlusIcon className="w-4 h-4" />}
              className="flex-1 sm:flex-none justify-center text-xs font-bold text-slate-800 hover:text-slate-950 border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-100 shadow-2xs"
            >
              Radius Zone
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onStartDrawPolygonZone}
              leftIcon={<EditIcon className="w-3.5 h-3.5" />}
              className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs hover:shadow-sm active:scale-95"
            >
              Draw Polygon Zone
            </Button>
          </>
        )}

        {activeSubTab === 'groups' && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onResetGroups}
              className="flex-1 sm:flex-none justify-center text-xs font-semibold text-slate-800 hover:text-slate-950 border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-100 shadow-2xs"
            >
              Reset Presets
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onStartCreateGroup}
              leftIcon={<PlusIcon className="w-4 h-4" />}
              className="flex-1 sm:flex-none justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs hover:shadow-sm active:scale-95"
            >
              Create Zone Group
            </Button>
          </>
        )}

        {activeSubTab === 'collections' && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onResetCollections}
              className="flex-1 sm:flex-none justify-center text-xs font-semibold text-slate-800 hover:text-slate-950 border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-100 shadow-2xs"
            >
              Reset Presets
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onStartCreateCollection}
              leftIcon={<PlusIcon className="w-4 h-4" />}
              className="flex-1 sm:flex-none justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs hover:shadow-sm active:scale-95"
            >
              Create Collection
            </Button>
          </>
        )}

        {activeSubTab === 'blacklists' && (
          <>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onStartCreateBlacklist}
              leftIcon={<PlusIcon className="w-4 h-4" />}
              className="w-full sm:w-auto justify-center bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs hover:shadow-sm active:scale-95"
            >
              Create Exclusion Zone
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export interface ZoneDirectoryListPaneProps {
  activeSubTab: AdminZonesSubTab;
  isLoading: boolean;
  zoneArchiveFilter: ZoneArchiveFilter;
  onChangeZoneArchiveFilter: (filter: ZoneArchiveFilter) => void;
  searchQuery: string;
  onChangeSearchQuery: (query: string) => void;
  zones: ZoneGeofence[];
  filteredZones: ZoneGeofence[];
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  onToggleZoneActive: (zone: ZoneGeofence) => void;
  onToggleArchiveZone: (zone: ZoneGeofence) => void;
  onStartEditZone: (zone: ZoneGeofence) => void;
  onDeleteZone: (zoneId: string) => void;
  filteredGroups: ZoneGroup[];
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
  onToggleGroupActive: (group: ZoneGroup) => void;
  onToggleArchiveGroup: (group: ZoneGroup) => void;
  onStartEditGroup: (group: ZoneGroup) => void;
  onDeleteGroup: (groupId: string) => void;
  filteredCollections: LocationCollection[];
  selectedCollectionId: string | null;
  selectedPoiId: string | null;
  onSelectCollection: (collectionId: string) => void;
  onSelectPoi: (poiId: string, collectionId: string) => void;
  onToggleCollectionActive: (coll: LocationCollection) => void;
  onToggleArchiveCollection: (coll: LocationCollection) => void;
  onStartEditCollection: (coll: LocationCollection) => void;
  onDeleteCollection: (collId: string) => void;
  onToggleCollectionConsolidation: (coll: LocationCollection) => void;
  filteredBlacklists: BlacklistedLocation[];
  selectedBlacklistId: string | null;
  onSelectBlacklist: (blacklistId: string) => void;
  onToggleBlacklistActive: (loc: BlacklistedLocation) => void;
  onStartEditBlacklist: (loc: BlacklistedLocation) => void;
  onDeleteBlacklist: (locId: string) => void;
}

export function ZoneDirectoryListPane({
  activeSubTab,
  isLoading,
  zoneArchiveFilter,
  onChangeZoneArchiveFilter,
  searchQuery,
  onChangeSearchQuery,
  zones,
  filteredZones,
  selectedZoneId,
  onSelectZone,
  onToggleZoneActive,
  onToggleArchiveZone,
  onStartEditZone,
  onDeleteZone,
  filteredGroups,
  selectedGroupId,
  onSelectGroup,
  onToggleGroupActive,
  onToggleArchiveGroup,
  onStartEditGroup,
  onDeleteGroup,
  filteredCollections,
  selectedCollectionId,
  selectedPoiId,
  onSelectCollection,
  onSelectPoi,
  onToggleCollectionActive,
  onToggleArchiveCollection,
  onStartEditCollection,
  onDeleteCollection,
  onToggleCollectionConsolidation,
  filteredBlacklists,
  selectedBlacklistId,
  onSelectBlacklist,
  onToggleBlacklistActive,
  onStartEditBlacklist,
  onDeleteBlacklist,
}: ZoneDirectoryListPaneProps) {
  return (
    <>
      <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            {activeSubTab === 'zones' && 'Service Zones Directory'}
            {activeSubTab === 'groups' && 'Zone Groups Directory'}
            {activeSubTab === 'collections' && 'Location Collections Directory'}
          </span>
        </div>

        {/* Archive State Filter Pills */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl mb-3">
          <button
            type="button"
            onClick={() => onChangeZoneArchiveFilter('active')}
            className={`flex-1 py-1 text-center rounded-lg text-xs font-bold transition-all ${
              zoneArchiveFilter === 'active'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => onChangeZoneArchiveFilter('archived')}
            className={`flex-1 py-1 text-center rounded-lg text-xs font-bold transition-all ${
              zoneArchiveFilter === 'archived'
                ? 'bg-amber-100 text-amber-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Archived
          </button>
          <button
            type="button"
            onClick={() => onChangeZoneArchiveFilter('all')}
            className={`flex-1 py-1 text-center rounded-lg text-xs font-bold transition-all ${
              zoneArchiveFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All
          </button>
        </div>

        <Input
          placeholder={`Filter ${activeSubTab} by name...`}
          value={searchQuery}
          onChange={(e) => onChangeSearchQuery(e.target.value)}
          className="text-xs h-9 mb-3"
        />

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
            <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-xs">Loading geographic entities...</span>
          </div>
        ) : (
          <>
            {/* --- SubTab 1: Zones Directory --- */}
            {activeSubTab === 'zones' && (
              <div className="space-y-2 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
                {filteredZones.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No matching zones found. Click "Create Zone" to add one.
                  </div>
                ) : (
                  filteredZones.map((z) => {
                    const isSelected = selectedZoneId === z.id;
                    return (
                      <div
                        key={z.id}
                        onClick={() => onSelectZone(z.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/40 shadow-xs'
                            : 'border-slate-200/90 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                              style={{ backgroundColor: z.color || '#3b82f6' }}
                            />
                            <h4 className="text-xs font-bold text-slate-900 leading-snug">
                              {z.name}
                            </h4>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge
                              variant={z.type === 'radius' ? 'info' : 'neutral'}
                              size="sm"
                              className="text-[9px] uppercase font-bold"
                            >
                              {z.type === 'radius' ? `${z.radiusMiles || 3} mi` : 'Polygon'}
                            </Badge>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleZoneActive(z);
                              }}
                              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                z.isActive
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-slate-200 text-slate-500'
                              }`}
                              title={z.isActive ? 'Active Zone' : 'Disabled'}
                            >
                              <CheckIcon className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {z.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-2">
                            {z.description}
                          </p>
                        )}

                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            {z.flatFee ? (
                              <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                +${z.flatFee.toFixed(2)} Fee
                              </span>
                            ) : null}
                            {z.surchargeMultiplier && z.surchargeMultiplier > 1 ? (
                              <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                {z.surchargeMultiplier}x Multiplier
                              </span>
                            ) : null}
                            {!z.flatFee && (!z.surchargeMultiplier || z.surchargeMultiplier === 1) && (
                              <span className="text-slate-400">Standard Rate</span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {z.isArchived && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                ARCHIVED
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleArchiveZone(z);
                              }}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors ${
                                z.isArchived
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50 hover:text-amber-700'
                              }`}
                              title={z.isArchived ? 'Restore Zone' : 'Archive Zone'}
                            >
                              {z.isArchived ? 'Restore' : 'Archive'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartEditZone(z);
                              }}
                              className="px-2 py-0.5 rounded hover:bg-slate-100 text-blue-600 font-semibold"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteZone(z.id);
                              }}
                              className="p-1 rounded hover:bg-red-50 text-red-500"
                              title="Delete Zone"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* --- SubTab 2: Zone Groups Directory --- */}
            {activeSubTab === 'groups' && (
              <div className="space-y-2 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
                {filteredGroups.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No matching zone groups. Click "Create Zone Group" to cluster zones.
                  </div>
                ) : (
                  filteredGroups.map((g) => {
                    const isSelected = selectedGroupId === g.id;
                    const memberZones = zones.filter((z) => g.zoneIds.includes(z.id));
                    return (
                      <div
                        key={g.id}
                        onClick={() => onSelectGroup(g.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50/40 shadow-xs'
                            : 'border-slate-200/90 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                              style={{ backgroundColor: g.color || '#6366f1' }}
                            />
                            <h4 className="text-xs font-bold text-slate-900 leading-snug">
                              {g.name}
                            </h4>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge
                              variant="primary"
                              size="sm"
                              className="text-[9px] uppercase font-bold bg-indigo-100 text-indigo-700"
                            >
                              {g.zoneIds.length} {g.zoneIds.length === 1 ? 'Zone' : 'Zones'}
                            </Badge>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleGroupActive(g);
                              }}
                              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                g.isActive
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-slate-200 text-slate-500'
                              }`}
                              title={g.isActive ? 'Active Group' : 'Disabled'}
                            >
                              <CheckIcon className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {g.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-2">
                            {g.description}
                          </p>
                        )}

                        {/* Member Zone Chips */}
                        <div className="flex flex-wrap gap-1">
                          {memberZones.map((mz) => (
                            <span
                              key={mz.id}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1"
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: mz.color || '#3b82f6' }}
                              />
                              <span>{mz.name}</span>
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            {g.flatFee ? (
                              <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                +${g.flatFee.toFixed(2)} Group Fee
                              </span>
                            ) : null}
                            {g.surchargeMultiplier && g.surchargeMultiplier > 1 ? (
                              <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                {g.surchargeMultiplier}x Multiplier
                              </span>
                            ) : null}
                            {!g.flatFee && (!g.surchargeMultiplier || g.surchargeMultiplier === 1) && (
                              <span className="text-slate-400">Cluster Preset</span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {g.isArchived && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                ARCHIVED
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleArchiveGroup(g);
                              }}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors ${
                                g.isArchived
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50 hover:text-amber-700'
                              }`}
                              title={g.isArchived ? 'Restore Zone Group' : 'Archive Zone Group'}
                            >
                              {g.isArchived ? 'Restore' : 'Archive'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartEditGroup(g);
                              }}
                              className="px-2 py-0.5 rounded hover:bg-slate-100 text-indigo-600 font-semibold"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteGroup(g.id);
                              }}
                              className="p-1 rounded hover:bg-red-50 text-red-500"
                              title="Delete Group"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* --- SubTab 3: Location Collections Directory --- */}
            {activeSubTab === 'collections' && (
              <div className="space-y-2 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
                {filteredCollections.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No matching collections found. Click "Create Collection" to add POIs.
                  </div>
                ) : (
                  filteredCollections.map((c) => {
                    const isSelected = selectedCollectionId === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => onSelectCollection(c.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/40 shadow-xs'
                            : 'border-slate-200/90 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {getCategoryIcon(c.category)}
                            </span>
                            <h4 className="text-xs font-bold text-slate-900 leading-snug">
                              {c.name}
                            </h4>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge
                              variant="success"
                              size="sm"
                              className="text-[9px] uppercase font-bold"
                            >
                              {c.locations?.length || 0} POIs
                            </Badge>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleCollectionActive(c);
                              }}
                              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                c.isActive
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-slate-200 text-slate-500'
                              }`}
                              title={c.isActive ? 'Active Collection' : 'Disabled'}
                            >
                              <CheckIcon className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {c.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-2">
                            {c.description}
                          </p>
                        )}

                        {/* POI List Preview */}
                        <div className="space-y-1 bg-slate-50 p-2 rounded-lg border border-slate-200/60 text-[10px]">
                          {c.locations?.map((loc) => (
                            <div
                              key={loc.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPoi(loc.id, c.id);
                              }}
                              className={`flex items-center justify-between p-1 rounded hover:bg-white transition-colors ${
                                selectedPoiId === loc.id ? 'bg-white font-bold text-emerald-800' : 'text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span>{getCategoryIcon(loc.category)}</span>
                                <span className="truncate">{loc.name}</span>
                              </div>
                              <span className="font-mono text-[9px] text-slate-400 shrink-0">
                                {loc.coordinates.lat.toFixed(3)}, {loc.coordinates.lng.toFixed(3)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-600">
                              Buffer: {c.proximityRadiusMiles ?? 0.5} mi
                            </span>
                            {c.flatFee ? (
                              <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                +${c.flatFee.toFixed(2)} Fee
                              </span>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {c.isArchived && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                ARCHIVED
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleArchiveCollection(c);
                              }}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors ${
                                c.isArchived
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50 hover:text-amber-700'
                              }`}
                              title={c.isArchived ? 'Restore Collection' : 'Archive Collection'}
                            >
                              {c.isArchived ? 'Restore' : 'Archive'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartEditCollection(c);
                              }}
                              className="px-2 py-0.5 rounded hover:bg-slate-100 text-emerald-600 font-semibold"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteCollection(c.id);
                              }}
                              className="p-1 rounded hover:bg-red-50 text-red-500"
                              title="Delete Collection"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Autocomplete Consolidation Row */}
                        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100 bg-slate-50/50 -mx-3 -mb-3 px-3 py-1.5 rounded-b-xl">
                          <div className="flex items-center gap-1.5">
                            {c.consolidateInAutocomplete ? (
                              <span className="font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                <ZapIcon className="w-2.5 h-2.5" />
                                Consolidated
                              </span>
                            ) : (
                              <span className="font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                Standard Autocomplete
                              </span>
                            )}
                            {c.consolidateInAutocomplete && c.canonicalPlace?.name && (
                              <span className="text-slate-500 truncate max-w-[150px]" title={c.canonicalPlace.name}>
                                → {c.canonicalPlace.name}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleCollectionConsolidation(c);
                            }}
                            className={`px-2 py-0.5 font-bold rounded border transition-colors ${
                              c.consolidateInAutocomplete
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700'
                            }`}
                            title="Toggle Client Autocomplete Consolidation"
                          >
                            {c.consolidateInAutocomplete ? 'Consolidating ON' : '+ Consolidate'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </Card>

      {/* --- SubTab 4: Blacklisted Locations Directory --- */}
      {activeSubTab === 'blacklists' && (
        <div className="space-y-2 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
          {filteredBlacklists.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No blacklisted locations found. Click "Create Exclusion Zone" to add one.
            </div>
          ) : (
            filteredBlacklists.map((c) => {
              const isSelected = selectedBlacklistId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => onSelectBlacklist(c.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? 'border-red-500 bg-red-50/40 shadow-xs'
                      : 'border-slate-200/90 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs bg-red-600 flex items-center justify-center text-white">
                        <AlertTriangleIcon className="w-2.5 h-2.5" />
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 leading-snug">
                        {c.name}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="error"
                        size="sm"
                        className="text-[9px] uppercase font-bold"
                      >
                        {c.action === 'BLACKLIST_BLOCK' ? 'Block' : 'Review'}
                      </Badge>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleBlacklistActive(c);
                        }}
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          c.isActive
                            ? 'bg-red-500 text-white'
                            : 'bg-slate-200 text-slate-500'
                        }`}
                        title={c.isActive ? 'Active' : 'Disabled'}
                      >
                        <CheckIcon className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {c.reasonCode && (
                    <p className="text-[11px] text-slate-500 line-clamp-1">
                      {c.reasonCode}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartEditBlacklist(c);
                        }}
                        className="px-2 py-0.5 rounded hover:bg-slate-100 text-blue-600 font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteBlacklist(c.id);
                        }}
                        className="p-1 rounded hover:bg-red-50 text-red-500"
                        title="Delete"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </>
  );
}
