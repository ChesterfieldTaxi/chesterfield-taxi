import React from 'react';
import { Alert } from '../../ui/Alert';
import { SpecialPlacesAdminPanel } from './places/SpecialPlacesAdminPanel';
import {
  useAdminZonesController,
  ZoneSubTabActionBar,
  ZoneDirectoryListPane,
  ZoneInspectorEditorPane,
  ZonePolygonMapCanvas,
  type AdminZonesSubTab,
} from './zones';

export type { AdminZonesSubTab };

export interface AdminZonesTabProps {
  initialSubTab?: AdminZonesSubTab;
}

export function AdminZonesTab({ initialSubTab = 'zones' }: AdminZonesTabProps) {
  const {
    activeSubTab,
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
  } = useAdminZonesController(initialSubTab);

  if (activeSubTab === 'places') {
    return <SpecialPlacesAdminPanel />;
  }

  return (
    <div className="space-y-6">
      {/* ─── Zones Top Action Bar ─── */}
      <ZoneSubTabActionBar
        activeSubTab={activeSubTab}
        zonesCount={zones.length}
        zoneGroupsCount={zoneGroups.length}
        locationCollectionsCount={locationCollections.length}
        blacklistedLocationsCount={blacklistedLocations.length}
        onResetZones={handleResetZones}
        onStartCreateZone={handleStartCreateZone}
        onStartDrawPolygonZone={handleStartDrawPolygonZone}
        onResetGroups={handleResetGroups}
        onStartCreateGroup={handleStartCreateGroup}
        onResetCollections={handleResetCollections}
        onStartCreateCollection={handleStartCreateCollection}
        onStartCreateBlacklist={handleStartCreateBlacklist}
      />

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

      {/* ─── Main Content Split: Map first on Mobile, Left Directory + Right Map on Desktop ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
        {/* Directory & Drawers (order-2 on mobile so Map appears at top, order-1 on desktop) */}
        <div className="order-2 lg:order-1 lg:col-span-5 space-y-4">
          <ZoneDirectoryListPane
            activeSubTab={activeSubTab}
            isLoading={isLoading}
            zoneArchiveFilter={zoneArchiveFilter}
            onChangeZoneArchiveFilter={setZoneArchiveFilter}
            searchQuery={searchQuery}
            onChangeSearchQuery={setSearchQuery}
            zones={zones}
            filteredZones={filteredZones}
            selectedZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
            onToggleZoneActive={handleToggleZoneActive}
            onToggleArchiveZone={handleToggleArchiveZone}
            onStartEditZone={handleStartEditZone}
            onDeleteZone={handleDeleteZone}
            filteredGroups={filteredGroups}
            selectedGroupId={selectedGroupId}
            onSelectGroup={setSelectedGroupId}
            onToggleGroupActive={handleToggleGroupActive}
            onToggleArchiveGroup={handleToggleArchiveGroup}
            onStartEditGroup={handleStartEditGroup}
            onDeleteGroup={handleDeleteGroup}
            filteredCollections={filteredCollections}
            selectedCollectionId={selectedCollectionId}
            selectedPoiId={selectedPoiId}
            onSelectCollection={setSelectedCollectionId}
            onSelectPoi={handleSelectPoi}
            onToggleCollectionActive={handleToggleCollectionActive}
            onToggleArchiveCollection={handleToggleArchiveCollection}
            onStartEditCollection={handleStartEditCollection}
            onDeleteCollection={handleDeleteCollection}
            onToggleCollectionConsolidation={handleToggleCollectionConsolidation}
            filteredBlacklists={filteredBlacklists}
            selectedBlacklistId={selectedBlacklistId}
            onSelectBlacklist={setSelectedBlacklistId}
            onToggleBlacklistActive={handleToggleBlacklistActive}
            onStartEditBlacklist={handleStartEditBlacklist}
            onDeleteBlacklist={handleDeleteBlacklist}
          />

          <ZoneInspectorEditorPane
            activeSubTab={activeSubTab}
            zones={zones}
            isEditingZone={isEditingZone}
            zoneFormData={zoneFormData}
            setZoneFormData={setZoneFormData}
            onSaveZone={handleSaveZone}
            onCancelEditZone={() => setIsEditingZone(false)}
            isEditingGroup={isEditingGroup}
            groupFormData={groupFormData}
            setGroupFormData={setGroupFormData}
            onSaveGroup={handleSaveGroup}
            onCancelEditGroup={() => setIsEditingGroup(false)}
            isEditingCollection={isEditingCollection}
            collectionFormData={collectionFormData}
            setCollectionFormData={setCollectionFormData}
            newPoiDraft={newPoiDraft}
            setNewPoiDraft={setNewPoiDraft}
            onAddPoiToCollection={handleAddPoiToCollection}
            onRemovePoiFromCollection={handleRemovePoiFromCollection}
            onSaveCollection={handleSaveCollection}
            onCancelEditCollection={() => setIsEditingCollection(false)}
            isEditingBlacklist={isEditingBlacklist}
            blacklistFormData={blacklistFormData}
            setBlacklistFormData={setBlacklistFormData}
            onSaveBlacklist={handleSaveBlacklist}
            onCancelEditBlacklist={() => setIsEditingBlacklist(false)}
          />
        </div>

        {/* Right Column (7 cols): Interactive Regional Canvas (shown first on mobile) */}
        <ZonePolygonMapCanvas
          activeSubTab={activeSubTab}
          mapMode={mapMode}
          setMapMode={setMapMode}
          mapZoom={mapZoom}
          setMapZoom={setMapZoom}
          zones={zones}
          selectedZoneId={selectedZoneId}
          selectedZone={selectedZone}
          onSelectZoneId={setSelectedZoneId}
          isEditingZone={isEditingZone}
          zoneFormData={zoneFormData}
          setZoneFormData={setZoneFormData}
          selectedGroup={selectedGroup}
          locationCollections={locationCollections}
          selectedCollectionId={selectedCollectionId}
          selectedCollection={selectedCollection}
          selectedPoiId={selectedPoiId}
          onSelectPoi={handleSelectPoi}
          blacklistedLocations={blacklistedLocations}
          selectedBlacklistId={selectedBlacklistId}
          selectedBlacklist={selectedBlacklist}
          onSelectBlacklistId={setSelectedBlacklistId}
        />
      </div>
    </div>
  );
}
