import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import type {
  ZoneGeofence,
  ZoneGroup,
  LocationCollection,
  LocationPoint,
  LocationCategory,
  BlacklistedLocation,
} from '~/core/types/zone';
import { getZoneService } from '~/core/services/zones/zone.service';
import type { AdminZonesSubTab, ZoneArchiveFilter, ZoneMapMode } from './types';

export function useAdminZonesController(initialSubTab: AdminZonesSubTab = 'zones') {
  const [activeSubTab, setActiveSubTab] = useState<AdminZonesSubTab>(initialSubTab || 'zones');
  const [mapMode, setMapMode] = useState<ZoneMapMode>('google');

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
  const [zoneArchiveFilter, setZoneArchiveFilter] = useState<ZoneArchiveFilter>('active');

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
      vertices: [],
      color: '#3b82f6',
      surchargeMultiplier: 1.0,
      flatFee: 0,
      isActive: true,
    });
    setIsEditingZone(true);
  };

  const handleStartDrawPolygonZone = () => {
    setZoneFormData({
      id: '',
      name: '',
      description: '',
      type: 'polygon',
      center: { lat: 38.6631, lng: -90.5771 },
      vertices: [],
      color: '#8b5cf6',
      surchargeMultiplier: 1.0,
      flatFee: 0,
      isActive: true,
    });
    setIsEditingZone(true);
  };

  const handleStartEditZone = (zone: ZoneGeofence) => {
    setZoneFormData({
      ...zone,
      center: zone.center || { lat: 38.6631, lng: -90.5771 },
      vertices: zone.vertices ? [...zone.vertices] : [],
    });
    setSelectedZoneId(zone.id);
    setIsEditingZone(true);
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneFormData.name.trim()) return;

    if (zoneFormData.type === 'polygon' && (!zoneFormData.vertices || zoneFormData.vertices.length < 3)) {
      setSaveError('A polygon zone requires at least 3 boundary points. Click on the map to add vertices.');
      return;
    }

    try {
      setSaveError(null);
      const service = getZoneService();
      const saved = await service.saveZone(zoneFormData);
      setIsEditingZone(false);
      setSelectedZoneId(saved.id);
      setSaveSuccess(`Zone "${saved.name}" successfully saved.`);
      setTimeout(() => setSaveSuccess(null), 3500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save service zone.');
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

  const handleSelectPoi = (poiId: string, collId: string) => {
    setSelectedPoiId(poiId);
    setSelectedCollectionId(collId);
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

  return {
    activeSubTab,
    setActiveSubTab,
    mapMode,
    setMapMode,
    zones,
    selectedZoneId,
    setSelectedZoneId,
    selectedZone,
    isEditingZone,
    setIsEditingZone,
    zoneFormData,
    setZoneFormData,
    zoneGroups,
    selectedGroupId,
    setSelectedGroupId,
    selectedGroup,
    isEditingGroup,
    setIsEditingGroup,
    groupFormData,
    setGroupFormData,
    locationCollections,
    selectedCollectionId,
    setSelectedCollectionId,
    selectedCollection,
    selectedPoiId,
    setSelectedPoiId,
    isEditingCollection,
    setIsEditingCollection,
    collectionFormData,
    setCollectionFormData,
    newPoiDraft,
    setNewPoiDraft,
    blacklistedLocations,
    selectedBlacklistId,
    setSelectedBlacklistId,
    selectedBlacklist,
    isEditingBlacklist,
    setIsEditingBlacklist,
    blacklistFormData,
    setBlacklistFormData,
    isLoading,
    searchQuery,
    setSearchQuery,
    saveSuccess,
    saveError,
    mapZoom,
    setMapZoom,
    zoneArchiveFilter,
    setZoneArchiveFilter,
    filteredZones,
    filteredGroups,
    filteredCollections,
    filteredBlacklists,
    handleStartCreateZone,
    handleStartDrawPolygonZone,
    handleStartEditZone,
    handleSaveZone,
    handleDeleteZone,
    handleToggleZoneActive,
    handleToggleArchiveZone,
    handleToggleArchiveGroup,
    handleToggleArchiveCollection,
    handleResetZones,
    handleStartCreateGroup,
    handleStartEditGroup,
    handleSaveGroup,
    handleDeleteGroup,
    handleToggleGroupActive,
    handleResetGroups,
    handleStartCreateCollection,
    handleStartEditCollection,
    handleToggleCollectionConsolidation,
    handleSaveCollection,
    handleDeleteCollection,
    handleToggleCollectionActive,
    handleAddPoiToCollection,
    handleRemovePoiFromCollection,
    handleResetCollections,
    handleSelectPoi,
    handleStartCreateBlacklist,
    handleStartEditBlacklist,
    handleSaveBlacklist,
    handleDeleteBlacklist,
    handleToggleBlacklistActive,
  };
}
