import React, { useState, useEffect, useMemo } from 'react';
import type {
  ZoneGeofence,
  ZoneGroup,
  LocationCollection,
  LocationPoint,
  LocationCategory,
  ZoneCoordinate,
  BlacklistedLocation,
} from '../../../core/types/zone';
import {
  getZoneService,
  DEFAULT_ZONES,
  DEFAULT_ZONE_GROUPS,
  DEFAULT_LOCATION_COLLECTIONS,
} from '../../../core/services/zones/zone.service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Badge } from '../../ui/Badge';
import { Alert } from '../../ui/Alert';
import { PlusIcon, TrashIcon, CheckIcon, SpinnerIcon, MapPinIcon, LayersIcon, CompassIcon, AlertTriangleIcon, ZapIcon } from '../../ui/Icons';
import { SpecialPlacesAdminPanel } from './places/SpecialPlacesAdminPanel';

type AdminZonesSubTab = 'places' | 'zones' | 'groups' | 'collections' | 'blacklists';

export interface AdminZonesTabProps {
  initialSubTab?: AdminZonesSubTab;
}

export function AdminZonesTab({ initialSubTab = 'places' }: AdminZonesTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<AdminZonesSubTab>(initialSubTab || 'places');

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
      setIsEditingZone(false);
      setIsEditingGroup(false);
      setIsEditingCollection(false);
      setIsEditingBlacklist(false);
    }
  }, [initialSubTab]);

  // Zones State
  const [zones, setZones] = useState<ZoneGeofence[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [isEditingZone, setIsEditingZone] = useState(false);
  const [zoneFormData, setZoneFormData] = useState<ZoneGeofence>({
    id: '',
    name: '',
    description: '',
    type: 'radius',
    center: { lat: 38.6631, lng: -90.5771 },
    radiusMiles: 3.0,
    color: '#3b82f6',
    surchargeMultiplier: 1.0,
    flatFee: 0,
    isActive: true,
  });

  // Zone Groups State
  const [zoneGroups, setZoneGroups] = useState<ZoneGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [groupFormData, setGroupFormData] = useState<ZoneGroup>({
    id: '',
    name: '',
    description: '',
    zoneIds: [],
    color: '#6366f1',
    surchargeMultiplier: 1.0,
    flatFee: 0,
    isActive: true,
  });

  // Location Collections State
  const [locationCollections, setLocationCollections] = useState<LocationCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [isEditingCollection, setIsEditingCollection] = useState(false);
  const [collectionFormData, setCollectionFormData] = useState<LocationCollection>({
    id: '',
    name: '',
    description: '',
    category: 'airport',
    flatFee: 5.0,
    surchargeMultiplier: 1.0,
    proximityRadiusMiles: 0.5,
    isActive: true,
    consolidateInAutocomplete: false,
    canonicalPlace: {
      name: '',
      address: '',
      coordinates: { lat: 38.7487, lng: -90.3700 },
    },
    suppressKeywords: [],
    locations: [],
  });

  // Location Point Draft State (inside collection form)
  const [newPoiDraft, setNewPoiDraft] = useState<LocationPoint>({
    id: '',
    name: '',
    address: '',
    coordinates: { lat: 38.6631, lng: -90.5771 },
    category: 'airport',
    flatFee: 0,
    notes: '',
  });

  // Blacklisted Locations State
  const [blacklistedLocations, setBlacklistedLocations] = useState<BlacklistedLocation[]>([]);
  const [selectedBlacklistId, setSelectedBlacklistId] = useState<string | null>(null);
  const [isEditingBlacklist, setIsEditingBlacklist] = useState(false);
  const [blacklistFormData, setBlacklistFormData] = useState<BlacklistedLocation>({
    id: '',
    name: '',
    reasonCode: '',
    action: 'BLACKLIST_BLOCK',
    coordinates: { lat: 38.6631, lng: -90.5771 },
    radiusMiles: 0.1,
    isActive: true,
  });

  // Shared UI & Loading State
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(1);

  // Subscriptions
  useEffect(() => {
    setIsLoading(true);
    const service = getZoneService();

    const unsubZones = service.subscribeToZones(
      (updatedZones) => {
        setZones(updatedZones);
        setIsLoading(false);
        if (updatedZones.length > 0 && !selectedZoneId) {
          setSelectedZoneId(updatedZones[0].id);
        }
      },
      (err) => {
        console.warn('[AdminZonesTab] Zones error:', err);
        setIsLoading(false);
      }
    );

    const unsubGroups = service.subscribeToZoneGroups(
      (updatedGroups) => {
        setZoneGroups(updatedGroups);
        if (updatedGroups.length > 0 && !selectedGroupId) {
          setSelectedGroupId(updatedGroups[0].id);
        }
      },
      (err) => console.warn('[AdminZonesTab] ZoneGroups error:', err)
    );

    const unsubColls = service.subscribeToLocationCollections(
      (updatedColls) => {
        setLocationCollections(updatedColls);
        if (updatedColls.length > 0 && !selectedCollectionId) {
          setSelectedCollectionId(updatedColls[0].id);
        }
      },
      (err) => console.warn('[AdminZonesTab] LocationCollections error:', err)
    );

    const unsubBlacklists = service.subscribeToBlacklistedLocations(
      (updatedBlacklists) => {
        setBlacklistedLocations(updatedBlacklists);
        if (updatedBlacklists.length > 0 && !selectedBlacklistId) {
          setSelectedBlacklistId(updatedBlacklists[0].id);
        }
      },
      (err) => console.warn('[AdminZonesTab] Blacklists error:', err)
    );

    return () => {
      unsubZones();
      unsubGroups();
      unsubColls();
      unsubBlacklists();
    };
  }, []);

  // Archive Filter State
  const [zoneArchiveFilter, setZoneArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');

  // Filtered lists
  const filteredZones = useMemo(() => {
    let list = zones;
    if (zoneArchiveFilter === 'active') list = list.filter((z) => !z.isArchived);
    else if (zoneArchiveFilter === 'archived') list = list.filter((z) => !!z.isArchived);
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (z) => z.name.toLowerCase().includes(q) || (z.description && z.description.toLowerCase().includes(q))
    );
  }, [zones, searchQuery, zoneArchiveFilter]);

  const filteredGroups = useMemo(() => {
    let list = zoneGroups;
    if (zoneArchiveFilter === 'active') list = list.filter((g) => !g.isArchived);
    else if (zoneArchiveFilter === 'archived') list = list.filter((g) => !!g.isArchived);
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (g) => g.name.toLowerCase().includes(q) || (g.description && g.description.toLowerCase().includes(q))
    );
  }, [zoneGroups, searchQuery, zoneArchiveFilter]);

  const filteredCollections = useMemo(() => {
    let list = locationCollections;
    if (zoneArchiveFilter === 'active') list = list.filter((c) => !c.isArchived);
    else if (zoneArchiveFilter === 'archived') list = list.filter((c) => !!c.isArchived);
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description && c.description.toLowerCase().includes(q))
    );
  }, [locationCollections, searchQuery, zoneArchiveFilter]);

  const filteredBlacklists = useMemo(() => {
    if (!searchQuery.trim()) return blacklistedLocations;
    const q = searchQuery.toLowerCase();
    return blacklistedLocations.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.reasonCode && c.reasonCode.toLowerCase().includes(q))
    );
  }, [blacklistedLocations, searchQuery]);

  // Selected entities
  const selectedZone = useMemo(() => {
    return zones.find((z) => z.id === selectedZoneId) || zones[0] || null;
  }, [zones, selectedZoneId]);

  const selectedGroup = useMemo(() => {
    return zoneGroups.find((g) => g.id === selectedGroupId) || zoneGroups[0] || null;
  }, [zoneGroups, selectedGroupId]);

  const selectedCollection = useMemo(() => {
    return locationCollections.find((c) => c.id === selectedCollectionId) || locationCollections[0] || null;
  }, [locationCollections, selectedCollectionId]);

  const selectedBlacklist = useMemo(() => {
    return blacklistedLocations.find((c) => c.id === selectedBlacklistId) || blacklistedLocations[0] || null;
  }, [blacklistedLocations, selectedBlacklistId]);

  // Map coordinate normalization
  // Chesterfield: ~38.66, -90.58; STL Metro span: lat 38.50 - 38.80, lng -90.70 - -90.15
  const mapCenter = { lat: 38.66, lng: -90.45 };
  const latSpan = 0.35;
  const lngSpan = 0.65;

  const projectToMap = (coord: ZoneCoordinate) => {
    const x = ((coord.lng - (mapCenter.lng - lngSpan / 2)) / lngSpan) * 100;
    const y = ((mapCenter.lat + latSpan / 2 - coord.lat) / latSpan) * 100;
    return {
      x: Math.max(5, Math.min(95, x)),
      y: Math.max(5, Math.min(95, y)),
    };
  };

  // --------------------------------------------------------------------------
  // Zones Handlers
  // --------------------------------------------------------------------------
  const handleStartCreateZone = () => {
    setZoneFormData({
      id: '',
      name: '',
      description: '',
      type: 'radius',
      center: { lat: 38.6631, lng: -90.5771 },
      radiusMiles: 3.5,
      color: '#3b82f6',
      surchargeMultiplier: 1.0,
      flatFee: 0,
      isActive: true,
    });
    setIsEditingZone(true);
  };

  const handleStartEditZone = (zone: ZoneGeofence) => {
    setZoneFormData({ ...zone });
    setSelectedZoneId(zone.id);
    setIsEditingZone(true);
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneFormData.name.trim()) return;

    try {
      setSaveError(null);
      const service = getZoneService();
      const saved = await service.saveZone(zoneFormData);
      setIsEditingZone(false);
      setSelectedZoneId(saved.id);
      setSaveSuccess(`Zone "${saved.name}" successfully saved.`);
      setTimeout(() => setSaveSuccess(null), 3500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save geofence zone.');
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (confirm('Are you sure you want to delete this operational zone?')) {
      const service = getZoneService();
      await service.deleteZone(zoneId);
      if (selectedZoneId === zoneId) setSelectedZoneId(null);
    }
  };

  const handleToggleZoneActive = async (zone: ZoneGeofence) => {
    const service = getZoneService();
    await service.saveZone({
      ...zone,
      isActive: !zone.isActive,
    });
  };

  const handleToggleArchiveZone = async (zone: ZoneGeofence) => {
    const service = getZoneService();
    if (zone.isArchived) {
      await service.restoreZone(zone.id);
      setSaveSuccess(`Zone "${zone.name}" restored from archive.`);
    } else {
      await service.archiveZone(zone.id);
      setSaveSuccess(`Zone "${zone.name}" archived.`);
    }
    setTimeout(() => setSaveSuccess(null), 3500);
  };

  const handleToggleArchiveGroup = async (group: ZoneGroup) => {
    const service = getZoneService();
    if (group.isArchived) {
      await service.restoreZoneGroup(group.id);
      setSaveSuccess(`Zone Group "${group.name}" restored from archive.`);
    } else {
      await service.archiveZoneGroup(group.id);
      setSaveSuccess(`Zone Group "${group.name}" archived.`);
    }
    setTimeout(() => setSaveSuccess(null), 3500);
  };

  const handleToggleArchiveCollection = async (coll: LocationCollection) => {
    const service = getZoneService();
    if (coll.isArchived) {
      await service.restoreLocationCollection(coll.id);
      setSaveSuccess(`Location Collection "${coll.name}" restored from archive.`);
    } else {
      await service.archiveLocationCollection(coll.id);
      setSaveSuccess(`Location Collection "${coll.name}" archived.`);
    }
    setTimeout(() => setSaveSuccess(null), 3500);
  };

  const handleResetZones = async () => {
    if (confirm('Reset all operational zones to Chesterfield & St. Louis default presets?')) {
      const service = getZoneService();
      await service.resetZonesToDefaults();
      setSaveSuccess('Zones reset to regional presets.');
      setTimeout(() => setSaveSuccess(null), 3500);
    }
  };

  // --------------------------------------------------------------------------
  // Zone Groups Handlers
  // --------------------------------------------------------------------------
  const handleStartCreateGroup = () => {
    setGroupFormData({
      id: '',
      name: '',
      description: '',
      zoneIds: zones.slice(0, 2).map((z) => z.id),
      color: '#6366f1',
      surchargeMultiplier: 1.0,
      flatFee: 0,
      isActive: true,
    });
    setIsEditingGroup(true);
  };

  const handleStartEditGroup = (group: ZoneGroup) => {
    setGroupFormData({ ...group });
    setSelectedGroupId(group.id);
    setIsEditingGroup(true);
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupFormData.name.trim()) return;

    try {
      setSaveError(null);
      const service = getZoneService();
      const saved = await service.saveZoneGroup(groupFormData);
      setIsEditingGroup(false);
      setSelectedGroupId(saved.id);
      setSaveSuccess(`Zone Group "${saved.name}" successfully saved.`);
      setTimeout(() => setSaveSuccess(null), 3500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save zone group.');
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (confirm('Are you sure you want to delete this zone group cluster?')) {
      const service = getZoneService();
      await service.deleteZoneGroup(groupId);
      if (selectedGroupId === groupId) setSelectedGroupId(null);
    }
  };

  const handleToggleGroupActive = async (group: ZoneGroup) => {
    const service = getZoneService();
    await service.saveZoneGroup({
      ...group,
      isActive: !group.isActive,
    });
  };

  const handleResetGroups = async () => {
    if (confirm('Reset all zone groups to regional default presets?')) {
      const service = getZoneService();
      await service.resetZoneGroupsToDefaults();
      setSaveSuccess('Zone groups reset to regional presets.');
      setTimeout(() => setSaveSuccess(null), 3500);
    }
  };

  // --------------------------------------------------------------------------
  // Location Collections Handlers
  // --------------------------------------------------------------------------
  const handleStartCreateCollection = () => {
    setCollectionFormData({
      id: '',
      name: '',
      description: '',
      category: 'airport',
      flatFee: 5.0,
      surchargeMultiplier: 1.0,
      proximityRadiusMiles: 0.5,
      isActive: true,
      consolidateInAutocomplete: false,
      canonicalPlace: {
        name: '',
        address: '',
        coordinates: { lat: 38.7487, lng: -90.3700 },
      },
      suppressKeywords: [],
      locations: [],
    });
    setIsEditingCollection(true);
  };

  const handleStartEditCollection = (coll: LocationCollection) => {
    setCollectionFormData({
      ...coll,
      consolidateInAutocomplete: coll.consolidateInAutocomplete ?? false,
      canonicalPlace: coll.canonicalPlace ?? {
        name: coll.name,
        address: coll.locations[0]?.address || '',
        coordinates: coll.locations[0]?.coordinates || { lat: 38.7487, lng: -90.3700 },
      },
      suppressKeywords: coll.suppressKeywords ?? [],
      locations: [...coll.locations],
    });
    setSelectedCollectionId(coll.id);
    setIsEditingCollection(true);
  };

  const handleToggleCollectionConsolidation = async (coll: LocationCollection) => {
    const service = getZoneService();
    const willConsolidate = !coll.consolidateInAutocomplete;
    const updated: LocationCollection = {
      ...coll,
      consolidateInAutocomplete: willConsolidate,
      canonicalPlace: coll.canonicalPlace || {
        name: coll.name,
        address: coll.locations[0]?.address || '',
        coordinates: coll.locations[0]?.coordinates || { lat: 38.7487, lng: -90.3700 },
      },
      suppressKeywords: coll.suppressKeywords || [coll.name.toLowerCase()],
    };
    await service.saveLocationCollection(updated);
    setSaveSuccess(`Consolidation ${willConsolidate ? 'enabled' : 'disabled'} for "${coll.name}".`);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const handleSaveCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionFormData.name.trim()) return;

    try {
      setSaveError(null);
      const service = getZoneService();
      const saved = await service.saveLocationCollection(collectionFormData);
      setIsEditingCollection(false);
      setSelectedCollectionId(saved.id);
      setSaveSuccess(`Location Collection "${saved.name}" saved.`);
      setTimeout(() => setSaveSuccess(null), 3500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save location collection.');
    }
  };

  const handleDeleteCollection = async (collId: string) => {
    if (confirm('Are you sure you want to delete this location collection?')) {
      const service = getZoneService();
      await service.deleteLocationCollection(collId);
      if (selectedCollectionId === collId) setSelectedCollectionId(null);
    }
  };

  const handleToggleCollectionActive = async (coll: LocationCollection) => {
    const service = getZoneService();
    await service.saveLocationCollection({
      ...coll,
      isActive: !coll.isActive,
    });
  };

  const handleAddPoiToCollection = () => {
    if (!newPoiDraft.name.trim()) return;
    const poiId =
      newPoiDraft.id ||
      `poi-${newPoiDraft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || Date.now().toString(36)}`;
    const fullPoi: LocationPoint = {
      ...newPoiDraft,
      id: poiId,
      category: (collectionFormData.category || 'airport') as LocationCategory,
    };
    setCollectionFormData((prev) => ({
      ...prev,
      locations: [...prev.locations, fullPoi],
    }));
    setNewPoiDraft({
      id: '',
      name: '',
      address: '',
      coordinates: { lat: 38.6631, lng: -90.5771 },
      category: (collectionFormData.category || 'airport') as LocationCategory,
      flatFee: 0,
      notes: '',
    });
  };

  const handleRemovePoiFromCollection = (poiId: string) => {
    setCollectionFormData((prev) => ({
      ...prev,
      locations: prev.locations.filter((p) => p.id !== poiId),
    }));
  };

  const handleResetCollections = async () => {
    if (confirm('Reset all location collections to regional POI default presets?')) {
      const service = getZoneService();
      await service.resetLocationCollectionsToDefaults();
      setSaveSuccess('Location collections reset to regional presets.');
      setTimeout(() => setSaveSuccess(null), 3500);
    }
  };

  // --------------------------------------------------------------------------
  // Blacklisted Locations Handlers
  // --------------------------------------------------------------------------
  const handleStartCreateBlacklist = () => {
    setBlacklistFormData({
      id: '',
      name: '',
      reasonCode: '',
      action: 'BLACKLIST_BLOCK',
      coordinates: { lat: 38.6631, lng: -90.5771 },
      radiusMiles: 0.1,
      isActive: true,
    });
    setIsEditingBlacklist(true);
  };

  const handleStartEditBlacklist = (loc: BlacklistedLocation) => {
    setBlacklistFormData({ ...loc });
    setSelectedBlacklistId(loc.id);
    setIsEditingBlacklist(true);
  };

  const handleSaveBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blacklistFormData.name.trim()) return;

    try {
      setSaveError(null);
      const service = getZoneService();
      const saved = await service.saveBlacklistedLocation(blacklistFormData);
      setIsEditingBlacklist(false);
      setSelectedBlacklistId(saved.id);
      setSaveSuccess(`Blacklisted Location "${saved.name}" saved.`);
      setTimeout(() => setSaveSuccess(null), 3500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save blacklisted location.');
    }
  };

  const handleDeleteBlacklist = async (locId: string) => {
    if (confirm('Are you sure you want to delete this blacklisted location?')) {
      const service = getZoneService();
      await service.deleteBlacklistedLocation(locId);
      if (selectedBlacklistId === locId) setSelectedBlacklistId(null);
    }
  };

  const handleToggleBlacklistActive = async (loc: BlacklistedLocation) => {
    const service = getZoneService();
    await service.saveBlacklistedLocation({
      ...loc,
      isActive: !loc.isActive,
    });
  };

  // Helper for category badge icons
  const getCategoryIcon = (cat?: LocationCategory | string) => {
    switch (cat) {
      case 'airport':
        return '✈️';
      case 'venue':
        return '🏟️';
      case 'train_station':
        return '🚆';
      case 'hotel':
        return '🏨';
      case 'hospital':
        return '🏥';
      default:
        return '📍';
    }
  };

  if (activeSubTab === 'places') {
    return <SpecialPlacesAdminPanel />;
  }

  return (
    <div className="space-y-6">
      {/* ─── Zones Top Action Bar ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="text-xs font-bold text-slate-700 px-2 flex items-center gap-2">
          {activeSubTab === 'zones' && (
            <>
              <MapPinIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Operational Zones &amp; Geofences ({zones.length} active)</span>
            </>
          )}
          {activeSubTab === 'groups' && (
            <>
              <LayersIcon className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Zone Groups &amp; Pricing Corridors ({zoneGroups.length} groups)</span>
            </>
          )}
          {activeSubTab === 'collections' && (
            <>
              <CompassIcon className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>POI Location Collections ({locationCollections.length} collections)</span>
            </>
          )}
          {activeSubTab === 'blacklists' && (
            <>
              <AlertTriangleIcon className="w-4 h-4 text-red-600 shrink-0" />
              <span>Exclusion Zones &amp; Blacklists ({blacklistedLocations.length} active)</span>
            </>
          )}
        </div>

        {/* Action Button for Active SubTab */}
        <div className="flex items-center gap-2">
          {activeSubTab === 'zones' && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetZones}
                className="text-xs font-semibold text-slate-800 hover:text-slate-950 border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-100 shadow-2xs"
              >
                Reset Presets
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleStartCreateZone}
                leftIcon={<PlusIcon className="w-4 h-4" />}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs hover:shadow-sm active:scale-95"
              >
                Create Zone
              </Button>
            </>
          )}

          {activeSubTab === 'groups' && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetGroups}
                className="text-xs font-semibold text-slate-800 hover:text-slate-950 border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-100 shadow-2xs"
              >
                Reset Presets
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleStartCreateGroup}
                leftIcon={<PlusIcon className="w-4 h-4" />}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs hover:shadow-sm active:scale-95"
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
                onClick={handleResetCollections}
                className="text-xs font-semibold text-slate-800 hover:text-slate-950 border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-100 shadow-2xs"
              >
                Reset Presets
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleStartCreateCollection}
                leftIcon={<PlusIcon className="w-4 h-4" />}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs hover:shadow-sm active:scale-95"
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
                onClick={handleStartCreateBlacklist}
                leftIcon={<PlusIcon className="w-4 h-4" />}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs hover:shadow-sm active:scale-95"
              >
                Create Exclusion Zone
              </Button>
            </>
          )}
        </div>
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Entity Updated">
          {saveSuccess}
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Action Error">
          {saveError}
        </Alert>
      )}

      {/* ─── Main Content Split: Left Directory / Forms + Right Map Visualizer ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): Directory & Drawers */}
        <div className="lg:col-span-5 space-y-4">
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {activeSubTab === 'zones' && 'Operational Geofences Directory'}
                {activeSubTab === 'groups' && 'Zone Groups Directory'}
                {activeSubTab === 'collections' && 'Location Collections Directory'}
              </span>
            </div>

            {/* Archive State Filter Pills */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl mb-3">
              <button
                type="button"
                onClick={() => setZoneArchiveFilter('active')}
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
                onClick={() => setZoneArchiveFilter('archived')}
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
                onClick={() => setZoneArchiveFilter('all')}
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
              onChange={(e) => setSearchQuery(e.target.value)}
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
                  <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
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
                            onClick={() => setSelectedZoneId(z.id)}
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
                                    handleToggleZoneActive(z);
                                  }}
                                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                    z.isActive
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-slate-200 text-slate-500'
                                  }`}
                                  title={z.isActive ? 'Active Zone' : 'Disabled'}
                                >
                                  ✓
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

                              <div className="flex items-center gap-1">
                                {z.isArchived && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                    ARCHIVED
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleArchiveZone(z);
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
                                    handleStartEditZone(z);
                                  }}
                                  className="px-2 py-0.5 rounded hover:bg-slate-100 text-blue-600 font-semibold"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteZone(z.id);
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
                  <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
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
                            onClick={() => setSelectedGroupId(g.id)}
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
                                    handleToggleGroupActive(g);
                                  }}
                                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                    g.isActive
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-slate-200 text-slate-500'
                                  }`}
                                  title={g.isActive ? 'Active Group' : 'Disabled'}
                                >
                                  ✓
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

                              <div className="flex items-center gap-1">
                                {g.isArchived && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                    ARCHIVED
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleArchiveGroup(g);
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
                                    handleStartEditGroup(g);
                                  }}
                                  className="px-2 py-0.5 rounded hover:bg-slate-100 text-indigo-600 font-semibold"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteGroup(g.id);
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
                  <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
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
                            onClick={() => setSelectedCollectionId(c.id)}
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
                                    handleToggleCollectionActive(c);
                                  }}
                                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                    c.isActive
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-slate-200 text-slate-500'
                                  }`}
                                  title={c.isActive ? 'Active Collection' : 'Disabled'}
                                >
                                  ✓
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
                                    setSelectedPoiId(loc.id);
                                    setSelectedCollectionId(c.id);
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

                              <div className="flex items-center gap-1">
                                {c.isArchived && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                    ARCHIVED
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleArchiveCollection(c);
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
                                    handleStartEditCollection(c);
                                  }}
                                  className="px-2 py-0.5 rounded hover:bg-slate-100 text-emerald-600 font-semibold"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCollection(c.id);
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
                                  handleToggleCollectionConsolidation(c);
                                }}
                                className={`px-2 py-0.5 font-bold rounded border transition-colors ${
                                  c.consolidateInAutocomplete
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700'
                                }`}
                                title="Toggle Customer Autocomplete Consolidation"
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

          {/* ─── Create / Edit Zone Drawer ─── */}
          {isEditingZone && activeSubTab === 'zones' && (
            <Card variant="elevated" className="border-blue-300 bg-blue-50/20 shadow-md">
              <CardHeader className="p-4 border-b border-blue-200/60 bg-blue-50/50">
                <CardTitle className="text-sm font-bold text-blue-950">
                  {zoneFormData.id ? `Edit Zone: ${zoneFormData.name}` : 'Create Operational Geofence'}
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Configure perimeter boundaries, flat fees, and surcharge multipliers.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <form onSubmit={handleSaveZone} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Zone Name"
                      placeholder="e.g. Chesterfield Airport Corridor"
                      value={zoneFormData.name}
                      onChange={(e) => setZoneFormData((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Geofence Type
                      </label>
                      <select
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        value={zoneFormData.type}
                        onChange={(e) =>
                          setZoneFormData((prev) => ({ ...prev, type: e.target.value as any }))
                        }
                      >
                        <option value="radius">Radius Circle (Center + Miles)</option>
                        <option value="polygon">Custom Polygon Geofence</option>
                      </select>
                    </div>
                  </div>

                  <Input
                    label="Zone Purpose / Description"
                    placeholder="e.g. Covers executive corporate terminals and hotels."
                    value={zoneFormData.description || ''}
                    onChange={(e) =>
                      setZoneFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {zoneFormData.type === 'radius' && (
                      <Input
                        label="Radius (Miles)"
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="50"
                        value={zoneFormData.radiusMiles || 3.0}
                        onChange={(e) =>
                          setZoneFormData((prev) => ({
                            ...prev,
                            radiusMiles: parseFloat(e.target.value) || 3.0,
                          }))
                        }
                        required
                      />
                    )}

                    <Input
                      label="Flat Surcharge ($)"
                      type="number"
                      step="0.50"
                      min="0"
                      value={zoneFormData.flatFee || 0}
                      onChange={(e) =>
                        setZoneFormData((prev) => ({
                          ...prev,
                          flatFee: parseFloat(e.target.value) || 0,
                        }))
                      }
                      helperText="Added to total fare"
                    />

                    <Input
                      label="Rate Multiplier (x)"
                      type="number"
                      step="0.05"
                      min="0.5"
                      max="3.0"
                      value={zoneFormData.surchargeMultiplier || 1.0}
                      onChange={(e) =>
                        setZoneFormData((prev) => ({
                          ...prev,
                          surchargeMultiplier: parseFloat(e.target.value) || 1.0,
                        }))
                      }
                      helperText="1.0 = standard"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-blue-200/60">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Map Highlight Color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={zoneFormData.color || '#3b82f6'}
                          onChange={(e) =>
                            setZoneFormData((prev) => ({ ...prev, color: e.target.value }))
                          }
                          className="w-10 h-10 rounded-xl border border-slate-300 cursor-pointer p-1 bg-white shadow-xs"
                        />
                        <Input
                          value={zoneFormData.color || '#3b82f6'}
                          onChange={(e) =>
                            setZoneFormData((prev) => ({ ...prev, color: e.target.value }))
                          }
                          className="font-mono text-xs uppercase"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-4 sm:pt-0">
                      <span className="text-xs font-semibold text-slate-700">Zone Enabled</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={zoneFormData.isActive}
                          onChange={(e) =>
                            setZoneFormData((prev) => ({ ...prev, isActive: e.target.checked }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-blue-200/60">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingZone(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 font-bold"
                    >
                      Save Geofence Zone
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* ─── Create / Edit Zone Group Drawer ─── */}
          {isEditingGroup && activeSubTab === 'groups' && (
            <Card variant="elevated" className="border-indigo-300 bg-indigo-50/20 shadow-md">
              <CardHeader className="p-4 border-b border-indigo-200/60 bg-indigo-50/50">
                <CardTitle className="text-sm font-bold text-indigo-950">
                  {groupFormData.id ? `Edit Zone Group: ${groupFormData.name}` : 'Create Zone Group'}
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Cluster multiple geofences together for grouped pricing conditions and inheritance rules.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <form onSubmit={handleSaveGroup} className="space-y-4">
                  <Input
                    label="Zone Group Name"
                    placeholder="e.g. Metro West Corridor"
                    value={groupFormData.name}
                    onChange={(e) => setGroupFormData((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />

                  <Input
                    label="Description"
                    placeholder="e.g. Unites Chesterfield Valley, Wildwood, and West County suburban communities."
                    value={groupFormData.description || ''}
                    onChange={(e) => setGroupFormData((prev) => ({ ...prev, description: e.target.value }))}
                  />

                  {/* Member Zones Checkboxes */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Included Operational Zones ({groupFormData.zoneIds.length} Selected)
                    </label>
                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-white space-y-1.5">
                      {zones.map((zone) => {
                        const isChecked = groupFormData.zoneIds.includes(zone.id);
                        return (
                          <label
                            key={zone.id}
                            className={`flex items-center gap-2.5 p-1.5 rounded-lg text-xs cursor-pointer hover:bg-slate-50 transition-colors ${
                              isChecked ? 'bg-indigo-50/60 font-semibold text-indigo-950' : 'text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setGroupFormData((prev) => ({
                                    ...prev,
                                    zoneIds: [...prev.zoneIds, zone.id],
                                  }));
                                } else {
                                  setGroupFormData((prev) => ({
                                    ...prev,
                                    zoneIds: prev.zoneIds.filter((id) => id !== zone.id),
                                  }));
                                }
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: zone.color || '#3b82f6' }}
                            />
                            <span>{zone.name}</span>
                            <span className="text-[10px] text-slate-400">({zone.type})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      label="Flat Surcharge ($)"
                      type="number"
                      step="0.50"
                      min="0"
                      value={groupFormData.flatFee || 0}
                      onChange={(e) =>
                        setGroupFormData((prev) => ({
                          ...prev,
                          flatFee: parseFloat(e.target.value) || 0,
                        }))
                      }
                      helperText="Optional group flat fee"
                    />

                    <Input
                      label="Rate Multiplier (x)"
                      type="number"
                      step="0.05"
                      min="0.5"
                      max="3.0"
                      value={groupFormData.surchargeMultiplier || 1.0}
                      onChange={(e) =>
                        setGroupFormData((prev) => ({
                          ...prev,
                          surchargeMultiplier: parseFloat(e.target.value) || 1.0,
                        }))
                      }
                      helperText="1.0 = standard"
                    />

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Group Color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={groupFormData.color || '#6366f1'}
                          onChange={(e) =>
                            setGroupFormData((prev) => ({ ...prev, color: e.target.value }))
                          }
                          className="w-10 h-10 rounded-xl border border-slate-300 cursor-pointer p-1 bg-white shadow-xs"
                        />
                        <Input
                          value={groupFormData.color || '#6366f1'}
                          onChange={(e) =>
                            setGroupFormData((prev) => ({ ...prev, color: e.target.value }))
                          }
                          className="font-mono text-xs uppercase"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-indigo-200/60">
                    <span className="text-xs font-semibold text-slate-700">Group Active</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={groupFormData.isActive}
                        onChange={(e) =>
                          setGroupFormData((prev) => ({ ...prev, isActive: e.target.checked }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                    </label>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-indigo-200/60">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingGroup(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700 font-bold"
                    >
                      Save Zone Group
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* ─── Create / Edit Location Collection Drawer ─── */}
          {isEditingCollection && activeSubTab === 'collections' && (
            <Card variant="elevated" className="border-emerald-300 bg-emerald-50/20 shadow-md">
              <CardHeader className="p-4 border-b border-emerald-200/60 bg-emerald-50/50">
                <CardTitle className="text-sm font-bold text-emerald-950">
                  {collectionFormData.id ? `Edit Collection: ${collectionFormData.name}` : 'Create Location Collection'}
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Curate points of interest (airports, arenas, hotels) with proximity buffers.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <form onSubmit={handleSaveCollection} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Collection Name"
                      placeholder="e.g. Regional Aviation Hubs"
                      value={collectionFormData.name}
                      onChange={(e) => setCollectionFormData((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Category
                      </label>
                      <select
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                        value={collectionFormData.category}
                        onChange={(e) =>
                          setCollectionFormData((prev) => ({ ...prev, category: e.target.value as LocationCategory }))
                        }
                      >
                        <option value="airport">✈️ Airport / FBO</option>
                        <option value="venue">🏟️ Sports &amp; Entertainment</option>
                        <option value="train_station">🚆 Transit &amp; Rail Station</option>
                        <option value="hotel">🏨 Hotel &amp; Resort</option>
                        <option value="hospital">🏥 Medical Center</option>
                        <option value="custom">📍 Custom POI List</option>
                      </select>
                    </div>
                  </div>

                  <Input
                    label="Description"
                    placeholder="e.g. Commercial terminals and private aviation hangars."
                    value={collectionFormData.description || ''}
                    onChange={(e) => setCollectionFormData((prev) => ({ ...prev, description: e.target.value }))}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      label="Proximity Buffer (Miles)"
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="10"
                      value={collectionFormData.proximityRadiusMiles ?? 0.5}
                      onChange={(e) =>
                        setCollectionFormData((prev) => ({
                          ...prev,
                          proximityRadiusMiles: parseFloat(e.target.value) || 0.5,
                        }))
                      }
                      helperText="Radius around each point"
                      required
                    />

                    <Input
                      label="Flat Surcharge ($)"
                      type="number"
                      step="0.50"
                      min="0"
                      value={collectionFormData.flatFee || 0}
                      onChange={(e) =>
                        setCollectionFormData((prev) => ({
                          ...prev,
                          flatFee: parseFloat(e.target.value) || 0,
                        }))
                      }
                      helperText="Default surcharge"
                    />

                    <Input
                      label="Rate Multiplier (x)"
                      type="number"
                      step="0.05"
                      min="0.5"
                      max="3.0"
                      value={collectionFormData.surchargeMultiplier || 1.0}
                      onChange={(e) =>
                        setCollectionFormData((prev) => ({
                          ...prev,
                          surchargeMultiplier: parseFloat(e.target.value) || 1.0,
                        }))
                      }
                      helperText="1.0 = standard"
                    />
                  </div>

                  {/* Autocomplete Consolidation Settings */}
                  <div className="pt-3 border-t border-emerald-200/60 space-y-3 bg-amber-50/50 p-3.5 rounded-xl border border-amber-200/80">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                          <ZapIcon className="w-3.5 h-3.5 text-amber-600" />
                          Customer Autocomplete Consolidation
                        </h5>
                        <p className="text-[11px] text-amber-800">
                          Collapse multiple Google Places suggestions (terminals, gates, cargo roads) into ONE canonical entry with deterministic coordinates so fares remain exact.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                        <input
                          type="checkbox"
                          checked={collectionFormData.consolidateInAutocomplete || false}
                          onChange={(e) =>
                            setCollectionFormData((prev) => ({
                              ...prev,
                              consolidateInAutocomplete: e.target.checked,
                              canonicalPlace: prev.canonicalPlace || {
                                name: prev.name,
                                address: prev.locations[0]?.address || '',
                                coordinates: prev.locations[0]?.coordinates || { lat: 38.7487, lng: -90.3700 },
                              },
                              suppressKeywords: prev.suppressKeywords || [prev.name.toLowerCase()],
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>

                    {collectionFormData.consolidateInAutocomplete && (
                      <div className="space-y-2.5 pt-2 border-t border-amber-200/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input
                            label="Canonical Suggestion Title"
                            placeholder="e.g. St. Louis Lambert International Airport (STL)"
                            value={collectionFormData.canonicalPlace?.name || ''}
                            onChange={(e) =>
                              setCollectionFormData((prev) => ({
                                ...prev,
                                canonicalPlace: {
                                  ...(prev.canonicalPlace || {
                                    address: '',
                                    coordinates: { lat: 38.7487, lng: -90.3700 },
                                  }),
                                  name: e.target.value,
                                },
                              }))
                            }
                            className="text-xs h-8 bg-white"
                            helperText="Single unified suggestion title shown to customers"
                            required={collectionFormData.consolidateInAutocomplete}
                          />

                          <Input
                            label="Canonical Formatted Address"
                            placeholder="e.g. 10701 Lambert International Blvd, St. Louis, MO 63145"
                            value={collectionFormData.canonicalPlace?.address || ''}
                            onChange={(e) =>
                              setCollectionFormData((prev) => ({
                                ...prev,
                                canonicalPlace: {
                                  ...(prev.canonicalPlace || {
                                    name: prev.name,
                                    coordinates: { lat: 38.7487, lng: -90.3700 },
                                  }),
                                  address: e.target.value,
                                },
                              }))
                            }
                            className="text-xs h-8 bg-white"
                            helperText="Address stored and routed for dispatch"
                            required={collectionFormData.consolidateInAutocomplete}
                          />
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <Input
                            label="Fixed Latitude"
                            type="number"
                            step="0.0001"
                            value={collectionFormData.canonicalPlace?.coordinates?.lat ?? 38.7487}
                            onChange={(e) =>
                              setCollectionFormData((prev) => ({
                                ...prev,
                                canonicalPlace: {
                                  ...(prev.canonicalPlace || {
                                    name: prev.name,
                                    address: '',
                                    coordinates: { lat: 38.7487, lng: -90.3700 },
                                  }),
                                  coordinates: {
                                    lat: parseFloat(e.target.value) || 0,
                                    lng: prev.canonicalPlace?.coordinates?.lng ?? -90.3700,
                                  },
                                },
                              }))
                            }
                            className="text-xs h-8 bg-white"
                          />

                          <Input
                            label="Fixed Longitude"
                            type="number"
                            step="0.0001"
                            value={collectionFormData.canonicalPlace?.coordinates?.lng ?? -90.3700}
                            onChange={(e) =>
                              setCollectionFormData((prev) => ({
                                ...prev,
                                canonicalPlace: {
                                  ...(prev.canonicalPlace || {
                                    name: prev.name,
                                    address: '',
                                    coordinates: { lat: 38.7487, lng: -90.3700 },
                                  }),
                                  coordinates: {
                                    lat: prev.canonicalPlace?.coordinates?.lat ?? 38.7487,
                                    lng: parseFloat(e.target.value) || 0,
                                  },
                                },
                              }))
                            }
                            className="text-xs h-8 bg-white"
                          />

                          <div className="flex items-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (collectionFormData.locations.length > 0) {
                                  const first = collectionFormData.locations[0];
                                  setCollectionFormData((prev) => ({
                                    ...prev,
                                    canonicalPlace: {
                                      name: prev.canonicalPlace?.name || first.name,
                                      address: prev.canonicalPlace?.address || first.address || '',
                                      coordinates: { ...first.coordinates },
                                    },
                                  }));
                                }
                              }}
                              disabled={collectionFormData.locations.length === 0}
                              className="h-8 w-full text-xs bg-white text-slate-700 border-slate-300"
                            >
                              Copy from 1st POI
                            </Button>
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-medium text-slate-700 block mb-0.5">
                            Suppressed Search Keywords (comma-separated)
                          </label>
                          <Input
                            placeholder="e.g. lambert, terminal 1, terminal 2, departures, arrivals, air cargo rd"
                            value={(collectionFormData.suppressKeywords || []).join(', ')}
                            onChange={(e) => {
                              const list = e.target.value
                                .split(',')
                                .map((s) => s.trim().toLowerCase())
                                .filter(Boolean);
                              setCollectionFormData((prev) => ({
                                ...prev,
                                suppressKeywords: list,
                              }));
                            }}
                            className="text-xs h-8 bg-white"
                            helperText="Any search matching these keywords will be replaced with this single canonical place"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Included POI List */}
                  <div className="pt-2 border-t border-emerald-200/60">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-800">
                        Locations in Collection ({collectionFormData.locations.length})
                      </label>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto mb-3">
                      {collectionFormData.locations.map((loc) => (
                        <div
                          key={loc.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900 mr-2">{loc.name}</span>
                            <span className="text-[10px] text-slate-400">{loc.address}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePoiFromCollection(loc.id)}
                            className="p-1 rounded text-red-500 hover:bg-red-50"
                            title="Remove POI"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add POI Mini-form */}
                    <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                      <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider block">
                        Add Location Point
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          placeholder="POI Name (e.g. STL Terminal 1)"
                          value={newPoiDraft.name}
                          onChange={(e) => setNewPoiDraft((prev) => ({ ...prev, name: e.target.value }))}
                          className="text-xs h-8"
                        />
                        <Input
                          placeholder="Address"
                          value={newPoiDraft.address || ''}
                          onChange={(e) => setNewPoiDraft((prev) => ({ ...prev, address: e.target.value }))}
                          className="text-xs h-8"
                        />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <Input
                          placeholder="Lat (e.g. 38.748)"
                          type="number"
                          step="0.0001"
                          value={newPoiDraft.coordinates.lat}
                          onChange={(e) =>
                            setNewPoiDraft((prev) => ({
                              ...prev,
                              coordinates: { ...prev.coordinates, lat: parseFloat(e.target.value) || 0 },
                            }))
                          }
                          className="text-xs h-8"
                        />
                        <Input
                          placeholder="Lng (e.g. -90.370)"
                          type="number"
                          step="0.0001"
                          value={newPoiDraft.coordinates.lng}
                          onChange={(e) =>
                            setNewPoiDraft((prev) => ({
                              ...prev,
                              coordinates: { ...prev.coordinates, lng: parseFloat(e.target.value) || 0 },
                            }))
                          }
                          className="text-xs h-8"
                        />
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={handleAddPoiToCollection}
                          leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
                          className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs hover:shadow-xs active:scale-95"
                        >
                          Add Point
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-emerald-200/60">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingCollection(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 font-bold"
                    >
                      Save Collection
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* --- SubTab 4: Blacklisted Locations Directory --- */}
          {activeSubTab === 'blacklists' && (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
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
                      onClick={() => setSelectedBlacklistId(c.id)}
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
                              handleToggleBlacklistActive(c);
                            }}
                            className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                              c.isActive
                                ? 'bg-red-500 text-white'
                                : 'bg-slate-200 text-slate-500'
                            }`}
                            title={c.isActive ? 'Active' : 'Disabled'}
                          >
                            ✓
                          </button>
                        </div>
                      </div>
                      {c.reasonCode && (
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          {c.reasonCode}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditBlacklist(c);
                            }}
                            className="px-2 py-0.5 rounded hover:bg-slate-100 text-blue-600 font-semibold"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBlacklist(c.id);
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

          {/* Blacklist Form Drawer */}
          {activeSubTab === 'blacklists' && isEditingBlacklist && (
            <Card variant="elevated" className="border-red-200 bg-white shadow-md animate-in slide-in-from-bottom-4">
              <CardHeader className="bg-slate-50 border-b border-slate-100 p-4">
                <CardTitle className="text-sm font-bold text-slate-800">
                  {blacklistFormData.id ? 'Edit Exclusion Zone' : 'Create Exclusion Zone'}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Define a blacklisted address or radius that blocks or flags trips.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <form onSubmit={handleSaveBlacklist} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 uppercase">Name</label>
                    <Input
                      required
                      value={blacklistFormData.name}
                      onChange={(e) => setBlacklistFormData({ ...blacklistFormData, name: e.target.value })}
                      placeholder="e.g. Abandoned Warehouse"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 uppercase">Reason / Context</label>
                    <Input
                      required
                      value={blacklistFormData.reasonCode}
                      onChange={(e) => setBlacklistFormData({ ...blacklistFormData, reasonCode: e.target.value })}
                      placeholder="e.g. Safety Hazard, Out of bounds"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 uppercase">Enforcement Action</label>
                    <select
                      value={blacklistFormData.action}
                      onChange={(e) => setBlacklistFormData({ ...blacklistFormData, action: e.target.value as 'BLACKLIST_BLOCK' | 'REQUIRE_REVIEW' })}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 h-9 text-xs focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="BLACKLIST_BLOCK">Strict Block (Reject Bookings)</option>
                      <option value="REQUIRE_REVIEW">Flag for Review (Mode B)</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 uppercase">Lat</label>
                      <Input
                        type="number"
                        step="0.0001"
                        required
                        value={blacklistFormData.coordinates.lat}
                        onChange={(e) =>
                          setBlacklistFormData({
                            ...blacklistFormData,
                            coordinates: { ...blacklistFormData.coordinates, lat: parseFloat(e.target.value) },
                          })
                        }
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 uppercase">Lng</label>
                      <Input
                        type="number"
                        step="0.0001"
                        required
                        value={blacklistFormData.coordinates.lng}
                        onChange={(e) =>
                          setBlacklistFormData({
                            ...blacklistFormData,
                            coordinates: { ...blacklistFormData.coordinates, lng: parseFloat(e.target.value) },
                          })
                        }
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 uppercase">Radius (Miles)</label>
                    <Input
                      type="number"
                      step="0.1"
                      required
                      value={blacklistFormData.radiusMiles}
                      onChange={(e) => setBlacklistFormData({ ...blacklistFormData, radiusMiles: parseFloat(e.target.value) })}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingBlacklist(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 font-bold"
                    >
                      Save Exclusion Zone
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column (7 cols): Interactive Regional Canvas */}
        <div className="lg:col-span-7 space-y-4">
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs overflow-hidden">
            <CardHeader className="p-3.5 border-b border-slate-100 bg-slate-900 text-white flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xs font-bold text-white flex items-center gap-2">
                  <span>🗺️</span>
                  <span>Chesterfield &amp; St. Louis Regional Canvas</span>
                </CardTitle>
                <CardDescription className="text-[10px] text-slate-400">
                  {activeSubTab === 'zones' && 'Spatial visualization of geofences & radius perimeters'}
                  {activeSubTab === 'groups' && 'Cluster visualization of unified Zone Groups'}
                  {activeSubTab === 'collections' && 'Points of Interest with interactive proximity buffers'}
                </CardDescription>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMapZoom((z) => Math.max(0.8, z - 0.2))}
                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                >
                  -
                </button>
                <span className="text-[11px] font-mono text-slate-400">{Math.round(mapZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setMapZoom((z) => Math.min(1.6, z + 0.2))}
                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setMapZoom(1)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300"
                >
                  Reset
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-0 relative bg-slate-950 h-[480px] overflow-hidden">
              {/* Scale container */}
              <div
                className="w-full h-full relative select-none transition-transform duration-200"
                style={{ transform: `scale(${mapZoom})`, transformOrigin: 'center center' }}
              >
                {/* SVG Base Road / River Grid */}
                <svg className="w-full h-full absolute inset-0 pointer-events-none opacity-20">
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#38bdf8" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  <path
                    d="M 10 10 Q 40 40 60 20 T 100 30"
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="4"
                    opacity="0.4"
                  />
                  <line
                    x1="10"
                    y1="60"
                    x2="90"
                    y2="55"
                    stroke="#94a3b8"
                    strokeWidth="3"
                    strokeDasharray="4 2"
                    opacity="0.6"
                  />
                  <line
                    x1="55"
                    y1="10"
                    x2="55"
                    y2="90"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    opacity="0.4"
                  />
                </svg>

                {/* Regional Landmark Badges */}
                <div className="absolute left-[20%] top-[48%] -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
                    ✈️ Spirit of St. Louis
                  </span>
                </div>
                <div className="absolute left-[38%] top-[52%] -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
                    🏢 Chesterfield Valley
                  </span>
                </div>
                <div className="absolute left-[70%] top-[25%] -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
                    🛫 STL Lambert Int'l
                  </span>
                </div>
                <div className="absolute left-[88%] top-[65%] -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
                    🏛️ Gateway Arch &amp; Busch Stadium
                  </span>
                </div>

                {/* Dynamic SVG Entities */}
                <svg className="w-full h-full absolute inset-0 pointer-events-auto">
                  {/* Render Zones (both in 'zones' and 'groups' sub-tab) */}
                  {(activeSubTab === 'zones' || activeSubTab === 'groups') &&
                    zones.map((zone) => {
                      const isSelectedZone = activeSubTab === 'zones' && selectedZoneId === zone.id;
                      const isGroupMember =
                        activeSubTab === 'groups' && selectedGroup?.zoneIds.includes(zone.id);

                      const strokeColor = isGroupMember
                        ? selectedGroup?.color || '#6366f1'
                        : zone.color || '#3b82f6';

                      const fillOpacity = isSelectedZone || isGroupMember ? 0.35 : 0.15;
                      const strokeWidth = isSelectedZone || isGroupMember ? 3 : 1.5;

                      if (zone.type === 'radius' && zone.center) {
                        const pt = projectToMap(zone.center);
                        const radiusPx = (zone.radiusMiles || 3) * 14;

                        return (
                          <g
                            key={zone.id}
                            onClick={() => {
                              if (activeSubTab === 'zones') setSelectedZoneId(zone.id);
                            }}
                            className="cursor-pointer"
                          >
                            <circle
                              cx={`${pt.x}%`}
                              cy={`${pt.y}%`}
                              r={radiusPx}
                              fill={strokeColor}
                              fillOpacity={fillOpacity}
                              stroke={strokeColor}
                              strokeWidth={strokeWidth}
                              strokeDasharray={zone.isActive ? undefined : '4 4'}
                            />
                            <circle
                              cx={`${pt.x}%`}
                              cy={`${pt.y}%`}
                              r={4}
                              fill={strokeColor}
                              stroke="#ffffff"
                              strokeWidth={1.5}
                            />
                            <text
                              x={`${pt.x}%`}
                              y={`${pt.y}%`}
                              dy={radiusPx + 12}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="9"
                              fontWeight="bold"
                              className="select-none shadow-xs"
                            >
                              {zone.name}
                            </text>
                          </g>
                        );
                      } else if (zone.type === 'polygon' && zone.vertices && zone.vertices.length > 2) {
                        const pointsStr = zone.vertices
                          .map((v) => {
                            const pt = projectToMap(v);
                            return `${pt.x * 4},${pt.y * 3.8}`;
                          })
                          .join(' ');

                        return (
                          <g
                            key={zone.id}
                            onClick={() => {
                              if (activeSubTab === 'zones') setSelectedZoneId(zone.id);
                            }}
                            className="cursor-pointer"
                          >
                            <polygon
                              points={pointsStr}
                              fill={strokeColor}
                              fillOpacity={fillOpacity}
                              stroke={strokeColor}
                              strokeWidth={strokeWidth}
                              strokeDasharray={zone.isActive ? undefined : '4 4'}
                            />
                            <text
                              x="50%"
                              y="75%"
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="9"
                              fontWeight="bold"
                              className="select-none"
                            >
                              {zone.name}
                            </text>
                          </g>
                        );
                      }
                      return null;
                    })}

                  {/* Render Location Collections (POIs + Proximity Rings) */}
                  {activeSubTab === 'collections' &&
                    locationCollections.map((coll) => {
                      const isCollSelected = selectedCollectionId === coll.id;
                      if (!coll.locations) return null;

                      return coll.locations.map((loc) => {
                        const pt = projectToMap(loc.coordinates);
                        const isPoiSelected = selectedPoiId === loc.id;
                        const bufferMiles = coll.proximityRadiusMiles ?? 0.5;
                        const bufferPx = Math.max(12, bufferMiles * 22);

                        return (
                          <g
                            key={loc.id}
                            onClick={() => {
                              setSelectedPoiId(loc.id);
                              setSelectedCollectionId(coll.id);
                            }}
                            className="cursor-pointer group"
                          >
                            {/* Proximity Radius Circle */}
                            <circle
                              cx={`${pt.x}%`}
                              cy={`${pt.y}%`}
                              r={bufferPx}
                              fill="#10b981"
                              fillOpacity={isCollSelected || isPoiSelected ? 0.25 : 0.10}
                              stroke="#10b981"
                              strokeWidth={isPoiSelected ? 2.5 : 1}
                              strokeDasharray={isPoiSelected ? undefined : '3 3'}
                            />

                            {/* POI Marker Pin */}
                            <circle
                              cx={`${pt.x}%`}
                              cy={`${pt.y}%`}
                              r={isPoiSelected ? 8 : 6}
                              fill={isPoiSelected ? '#059669' : '#10b981'}
                              stroke="#ffffff"
                              strokeWidth={2}
                            />

                            {/* Label */}
                            <text
                              x={`${pt.x}%`}
                              y={`${pt.y}%`}
                              dy={bufferPx + 11}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="9"
                              fontWeight="bold"
                              className="select-none"
                            >
                              {loc.name}
                            </text>
                          </g>
                        );
                      });
                    })}

                  {/* Render Blacklisted Locations */}
                  {activeSubTab === 'blacklists' &&
                    blacklistedLocations.map((loc) => {
                      if (!loc.coordinates) return null;
                      const pt = projectToMap(loc.coordinates);
                      const isSelected = selectedBlacklistId === loc.id;
                      const radiusPx = Math.max(12, (loc.radiusMiles || 0.1) * 22);
                      const strokeColor = loc.action === 'BLACKLIST_BLOCK' ? '#ef4444' : '#f59e0b';
                      const fillOpacity = isSelected ? 0.4 : 0.2;

                      return (
                        <g
                          key={loc.id}
                          onClick={() => setSelectedBlacklistId(loc.id)}
                          className="cursor-pointer group"
                        >
                          <circle
                            cx={`${pt.x}%`}
                            cy={`${pt.y}%`}
                            r={radiusPx}
                            fill={strokeColor}
                            fillOpacity={fillOpacity}
                            stroke={strokeColor}
                            strokeWidth={isSelected ? 3 : 1.5}
                            strokeDasharray={loc.isActive ? undefined : '4 4'}
                            className="transition-all duration-300 group-hover:fill-opacity-50"
                          />
                          <circle cx={`${pt.x}%`} cy={`${pt.y}%`} r={4} fill={strokeColor} stroke="#ffffff" strokeWidth={1.5} />
                          <text
                            x={`${pt.x}%`}
                            y={`${pt.y}%`}
                            dy={radiusPx + 11}
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="9"
                            fontWeight="bold"
                            className="select-none"
                          >
                            {loc.name}
                          </text>
                        </g>
                      );
                    })}
                </svg>
              </div>

              {/* Bottom Canvas Overlay Legend */}
              <div className="absolute bottom-2 left-2 right-2 bg-slate-900/90 backdrop-blur-xs p-2.5 rounded-xl border border-slate-800 text-[11px] text-slate-300 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white">
                    {activeSubTab === 'zones' && 'Active Zone:'}
                    {activeSubTab === 'groups' && 'Active Zone Group:'}
                    {activeSubTab === 'collections' && 'Active POI / Collection:'}
                    {activeSubTab === 'blacklists' && 'Active Exclusion Zone:'}
                  </span>
                  <span className="text-blue-400 font-semibold">
                    {activeSubTab === 'zones' && (selectedZone?.name || 'None')}
                    {activeSubTab === 'groups' && (selectedGroup?.name || 'None')}
                    {activeSubTab === 'collections' && (selectedCollection?.name || 'None')}
                    {activeSubTab === 'blacklists' && (selectedBlacklist?.name || 'None')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">
                    {activeSubTab === 'zones' && 'Click a zone to view perimeter'}
                    {activeSubTab === 'groups' && `${selectedGroup?.zoneIds.length || 0} zones in cluster`}
                    {activeSubTab === 'collections' && `${selectedCollection?.locations?.length || 0} POIs in collection`}
                    {activeSubTab === 'blacklists' && 'Click an exclusion zone to view radius'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
