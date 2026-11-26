import React from 'react';
import type {
  ZoneGeofence,
  ZoneGroup,
  LocationCollection,
  LocationPoint,
  LocationCategory,
  BlacklistedLocation,
} from '~/core/types/zone';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import {
  PlusIcon,
  TrashIcon,
  CompassIcon,
  ZapIcon,
  RulerIcon,
} from '~/components/ui/Icons';
import { generateBoxVertices, type AdminZonesSubTab } from './types';

export interface ZoneInspectorEditorPaneProps {
  activeSubTab: AdminZonesSubTab;
  zones: ZoneGeofence[];
  isEditingZone: boolean;
  zoneFormData: ZoneGeofence;
  setZoneFormData: React.Dispatch<React.SetStateAction<ZoneGeofence>>;
  onSaveZone: (e: React.FormEvent) => void;
  onCancelEditZone: () => void;
  isEditingGroup: boolean;
  groupFormData: ZoneGroup;
  setGroupFormData: React.Dispatch<React.SetStateAction<ZoneGroup>>;
  onSaveGroup: (e: React.FormEvent) => void;
  onCancelEditGroup: () => void;
  isEditingCollection: boolean;
  collectionFormData: LocationCollection;
  setCollectionFormData: React.Dispatch<React.SetStateAction<LocationCollection>>;
  newPoiDraft: LocationPoint;
  setNewPoiDraft: React.Dispatch<React.SetStateAction<LocationPoint>>;
  onAddPoiToCollection: () => void;
  onRemovePoiFromCollection: (poiId: string) => void;
  onSaveCollection: (e: React.FormEvent) => void;
  onCancelEditCollection: () => void;
  isEditingBlacklist: boolean;
  blacklistFormData: BlacklistedLocation;
  setBlacklistFormData: React.Dispatch<React.SetStateAction<BlacklistedLocation>>;
  onSaveBlacklist: (e: React.FormEvent) => void;
  onCancelEditBlacklist: () => void;
}

export function ZoneInspectorEditorPane({
  activeSubTab,
  zones,
  isEditingZone,
  zoneFormData,
  setZoneFormData,
  onSaveZone,
  onCancelEditZone,
  isEditingGroup,
  groupFormData,
  setGroupFormData,
  onSaveGroup,
  onCancelEditGroup,
  isEditingCollection,
  collectionFormData,
  setCollectionFormData,
  newPoiDraft,
  setNewPoiDraft,
  onAddPoiToCollection,
  onRemovePoiFromCollection,
  onSaveCollection,
  onCancelEditCollection,
  isEditingBlacklist,
  blacklistFormData,
  setBlacklistFormData,
  onSaveBlacklist,
  onCancelEditBlacklist,
}: ZoneInspectorEditorPaneProps) {
  return (
    <>
      {/* ─── Create / Edit Zone Drawer ─── */}
      {isEditingZone && activeSubTab === 'zones' && (
        <Card variant="elevated" className="border-status-info-border bg-status-info-bg/20 shadow-md">
          <CardHeader className="p-4 border-b border-status-info-border/60 bg-status-info-bg/50">
            <CardTitle className="text-sm font-bold text-status-info-fg">
              {zoneFormData.id ? `Edit Zone: ${zoneFormData.name}` : 'Create Service Zone'}
            </CardTitle>
            <CardDescription className="text-xs text-fg-secondary">
              Configure perimeter boundaries, flat fees, and surcharge multipliers.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={onSaveZone} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Zone Name"
                  placeholder="e.g. Chesterfield Airport Corridor"
                  value={zoneFormData.name}
                  onChange={(e) => setZoneFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />

                <div>
                  <label className="block text-xs font-bold text-fg-secondary mb-1">
                    Zone Type
                  </label>
                  <Select
                    size="md"
                    value={zoneFormData.type}
                    onChange={(e) => {
                      const nextType = e.target.value as 'radius' | 'polygon';
                      setZoneFormData((prev) => ({
                        ...prev,
                        type: nextType,
                        center: prev.center || { lat: 38.6631, lng: -90.5771 },
                        vertices: prev.vertices || [],
                      }));
                    }}
                  >
                    <option value="radius">Radius Circle (Center + Miles)</option>
                    <option value="polygon">Custom Polygon Zone (Draw on Map)</option>
                  </Select>
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

              {/* RADIUS ZONE CONTROLS */}
              {zoneFormData.type === 'radius' && (
                <div className="p-3 rounded-xl bg-surface-card border border-status-info-border space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-status-info-fg inline-flex items-center gap-1.5">
                      <CompassIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Radius Center &amp; Perimeter</span>
                    </span>
                    <span className="text-[10px] font-medium text-fg-muted">
                      Tap map or drag circle to reposition
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <Input
                      label="Center Lat"
                      type="number"
                      step="0.0001"
                      value={zoneFormData.center?.lat ?? 38.6631}
                      onChange={(e) =>
                        setZoneFormData((prev) => ({
                          ...prev,
                          center: {
                            lat: parseFloat(e.target.value) || 38.6631,
                            lng: prev.center?.lng ?? -90.5771,
                          },
                        }))
                      }
                    />
                    <Input
                      label="Center Lng"
                      type="number"
                      step="0.0001"
                      value={zoneFormData.center?.lng ?? -90.5771}
                      onChange={(e) =>
                        setZoneFormData((prev) => ({
                          ...prev,
                          center: {
                            lat: prev.center?.lat ?? 38.6631,
                            lng: parseFloat(e.target.value) || -90.5771,
                          },
                        }))
                      }
                    />
                    <Input
                      label="Radius (Miles)"
                      type="number"
                      step="0.5"
                      min="0.25"
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
                  </div>
                </div>
              )}

              {/* POLYGON ZONE DRAWING & VERTEX EDITOR */}
              {zoneFormData.type === 'polygon' && (
                <div className="p-3 rounded-xl bg-surface-card border border-status-staged-border space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-status-staged-fg flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <RulerIcon className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Polygon Boundary Vertices</span>
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                            (zoneFormData.vertices?.length || 0) >= 3
                              ? 'bg-status-success-bg-strong text-status-success-fg'
                              : 'bg-status-warning-bg-strong text-status-warning-fg'
                          }`}
                        >
                          {zoneFormData.vertices?.length || 0} pts (min 3)
                        </span>
                      </span>
                      <p className="text-[10px] text-fg-muted mt-0.5">
                        Click anywhere on the map on the right to drop polygon corner points.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setZoneFormData((prev) => ({
                            ...prev,
                            vertices: (prev.vertices || []).slice(0, -1),
                          }))
                        }
                        disabled={(zoneFormData.vertices?.length || 0) === 0}
                        className="px-2 py-1 rounded-lg border border-border-subtle bg-surface-subtle hover:bg-surface-muted disabled:opacity-40 text-[10px] font-bold text-fg-secondary"
                      >
                        Undo Point
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setZoneFormData((prev) => ({
                            ...prev,
                            vertices: generateBoxVertices(prev.center || { lat: 38.6631, lng: -90.5771 }),
                          }))
                        }
                        className="px-2 py-1 rounded-lg border border-status-staged-border bg-status-staged-bg hover:bg-status-staged-bg-strong text-[10px] font-bold text-status-staged-fg"
                      >
                        4-Pt Box Preset
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setZoneFormData((prev) => ({
                            ...prev,
                            vertices: [],
                          }))
                        }
                        disabled={(zoneFormData.vertices?.length || 0) === 0}
                        className="px-2 py-1 rounded-lg border border-status-danger-border bg-status-danger-bg hover:bg-status-danger-bg-strong disabled:opacity-40 text-[10px] font-bold text-status-danger-fg"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setZoneFormData((prev) => {
                            const pts = prev.vertices || [];
                            const last = pts[pts.length - 1] || prev.center || { lat: 38.6631, lng: -90.5771 };
                            return {
                              ...prev,
                              vertices: [
                                ...pts,
                                {
                                  lat: Number((last.lat + 0.008).toFixed(5)),
                                  lng: Number((last.lng + 0.008).toFixed(5)),
                                },
                              ],
                            };
                          })
                        }
                        className="px-2 py-1 rounded-lg bg-surface-header hover:bg-surface-header-elevated text-[10px] font-bold text-white"
                      >
                        + Add Coord
                      </button>
                    </div>
                  </div>

                  {(zoneFormData.vertices?.length || 0) === 0 ? (
                    <div className="p-3 rounded-lg bg-status-staged-bg/70 border border-dashed border-status-staged-border text-center text-[11px] font-semibold text-status-staged-fg">
                      Click on the interactive map canvas to place your first polygon vertex, or click &ldquo;4-Pt Box Preset&rdquo; to start with a rectangle and drag its corners.
                    </div>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                      {(zoneFormData.vertices || []).map((v, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 bg-surface-subtle px-2 py-1 rounded-lg border border-border-subtle text-xs"
                        >
                          <span className="w-6 text-[10px] font-extrabold text-status-staged-fg">
                            #{idx + 1}
                          </span>
                          <input
                            type="number"
                            step="0.0001"
                            value={v.lat}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setZoneFormData((prev) => {
                                const next = [...(prev.vertices || [])];
                                next[idx] = { ...next[idx], lat: val };
                                return { ...prev, vertices: next };
                              });
                            }}
                            className="w-full h-7 px-2 rounded border border-border-strong bg-surface-card font-mono text-[11px] text-fg-strong"
                            title="Latitude"
                          />
                          <input
                            type="number"
                            step="0.0001"
                            value={v.lng}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setZoneFormData((prev) => {
                                const next = [...(prev.vertices || [])];
                                next[idx] = { ...next[idx], lng: val };
                                return { ...prev, vertices: next };
                              });
                            }}
                            className="w-full h-7 px-2 rounded border border-border-strong bg-surface-card font-mono text-[11px] text-fg-strong"
                            title="Longitude"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setZoneFormData((prev) => ({
                                ...prev,
                                vertices: (prev.vertices || []).filter((_, i) => i !== idx),
                              }))
                            }
                            className="px-1.5 py-0.5 rounded text-fg-subtle hover:text-rose-600 hover:bg-status-danger-bg font-bold"
                            title="Remove Vertex"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="p-2.5 rounded-lg bg-status-info-bg/70 border border-status-info-border/80 text-[11px] text-status-info-fg">
                Zone fees, corridor overrides, and rate routing are managed centrally in{' '}
                <strong>Rates &amp; Tariffs → Rules &amp; Routing</strong>.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-status-info-border/60">
                <div>
                  <label className="block text-xs font-bold text-fg-secondary mb-1">
                    Map Highlight Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={zoneFormData.color || '#3b82f6'}
                      onChange={(e) =>
                        setZoneFormData((prev) => ({ ...prev, color: e.target.value }))
                      }
                      className="w-10 h-10 rounded-xl border border-border-strong cursor-pointer p-1 bg-surface-card shadow-xs"
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
                  <span className="text-xs font-semibold text-fg-secondary">Zone Enabled</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={zoneFormData.isActive}
                      onChange={(e) =>
                        setZoneFormData((prev) => ({ ...prev, isActive: e.target.checked }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-emphasis peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-card after:border-border-strong after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-status-info-border/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCancelEditZone}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 font-bold"
                >
                  Save Service Zone
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ─── Create / Edit Zone Group Drawer ─── */}
      {isEditingGroup && activeSubTab === 'groups' && (
        <Card variant="elevated" className="border-status-staged-border bg-status-staged-bg/20 shadow-md">
          <CardHeader className="p-4 border-b border-status-staged-border/60 bg-status-staged-bg/50">
            <CardTitle className="text-sm font-bold text-status-staged-fg">
              {groupFormData.id ? `Edit Zone Group: ${groupFormData.name}` : 'Create Zone Group'}
            </CardTitle>
            <CardDescription className="text-xs text-fg-secondary">
              Cluster multiple service zones together for grouped pricing conditions and inheritance rules.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={onSaveGroup} className="space-y-4">
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
                <label className="block text-xs font-bold text-fg-secondary mb-1.5">
                  Included Operational Zones ({groupFormData.zoneIds.length} Selected)
                </label>
                <div className="max-h-40 overflow-y-auto border border-border-subtle rounded-xl p-2 bg-surface-card space-y-1.5">
                  {zones.map((zone) => {
                    const isChecked = groupFormData.zoneIds.includes(zone.id);
                    return (
                      <label
                        key={zone.id}
                        className={`flex items-center gap-2.5 p-1.5 rounded-lg text-xs cursor-pointer hover:bg-surface-subtle transition-colors ${
                          isChecked ? 'bg-status-staged-bg/60 font-semibold text-status-staged-fg' : 'text-fg-secondary'
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
                          className="rounded border-border-strong text-indigo-600 focus:ring-indigo-500"
                        />
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: zone.color || '#3b82f6' }}
                        />
                        <span>{zone.name}</span>
                        <span className="text-[10px] text-fg-subtle">({zone.type})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div className="p-2.5 rounded-lg bg-status-info-bg/70 border border-status-info-border/80 text-[11px] text-status-info-fg">
                  Zone group pricing &amp; surcharge rules are configured in{' '}
                  <strong>Rates &amp; Tariffs → Rules &amp; Routing</strong>.
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg-secondary mb-1">
                    Group Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={groupFormData.color || '#6366f1'}
                      onChange={(e) =>
                        setGroupFormData((prev) => ({ ...prev, color: e.target.value }))
                      }
                      className="w-10 h-10 rounded-xl border border-border-strong cursor-pointer p-1 bg-surface-card shadow-xs"
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

              <div className="flex items-center justify-between pt-2 border-t border-status-staged-border/60">
                <span className="text-xs font-semibold text-fg-secondary">Group Active</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupFormData.isActive}
                    onChange={(e) =>
                      setGroupFormData((prev) => ({ ...prev, isActive: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-surface-emphasis peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-card after:border-border-strong after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-status-staged-border/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCancelEditGroup}
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
        <Card variant="elevated" className="border-status-success-border bg-status-success-bg/20 shadow-md">
          <CardHeader className="p-4 border-b border-status-success-border/60 bg-status-success-bg/50">
            <CardTitle className="text-sm font-bold text-status-success-fg">
              {collectionFormData.id ? `Edit Collection: ${collectionFormData.name}` : 'Create Location Collection'}
            </CardTitle>
            <CardDescription className="text-xs text-fg-secondary">
              Curate points of interest (airports, arenas, hotels) with proximity buffers.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={onSaveCollection} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Collection Name"
                  placeholder="e.g. Regional Aviation Hubs"
                  value={collectionFormData.name}
                  onChange={(e) => setCollectionFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />

                <div>
                  <label className="block text-xs font-bold text-fg-secondary mb-1">
                    Category
                  </label>
                  <Select
                    size="md"
                    value={collectionFormData.category}
                    onChange={(e) =>
                      setCollectionFormData((prev) => ({ ...prev, category: e.target.value as LocationCategory }))
                    }
                  >
                    <option value="airport">Airport / FBO</option>
                    <option value="venue">Sports &amp; Entertainment</option>
                    <option value="train_station">Transit &amp; Rail Station</option>
                    <option value="hotel">Hotel &amp; Resort</option>
                    <option value="hospital">Medical Center</option>
                    <option value="custom">Custom POI List</option>
                  </Select>
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
                <div className="sm:col-span-2 p-2.5 rounded-lg bg-status-info-bg/70 border border-status-info-border/80 text-[11px] text-status-info-fg flex items-center">
                  Location collection surcharges &amp; routing are managed in{' '}
                  <strong className="ml-1">Rates &amp; Tariffs → Rules &amp; Routing</strong>.
                </div>
              </div>

              {/* Autocomplete Consolidation Settings */}
              <div className="pt-3 border-t border-status-success-border/60 space-y-3 bg-status-warning-bg/50 p-3.5 rounded-xl border border-status-warning-border/80">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-status-warning-fg flex items-center gap-1.5">
                      <ZapIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Client Autocomplete Consolidation</span>
                    </h5>
                    <p className="text-[11px] text-status-warning-fg">
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
                    <div className="w-9 h-5 bg-surface-emphasis peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-card after:border-border-strong after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {collectionFormData.consolidateInAutocomplete && (
                  <div className="space-y-2.5 pt-2 border-t border-status-warning-border/60">
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
                        className="text-xs h-8 bg-surface-card"
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
                        className="text-xs h-8 bg-surface-card"
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
                        className="text-xs h-8 bg-surface-card"
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
                        className="text-xs h-8 bg-surface-card"
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
                          className="h-8 w-full text-xs bg-surface-card text-fg-secondary border-border-strong"
                        >
                          Copy from 1st POI
                        </Button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-fg-secondary block mb-0.5">
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
                        className="text-xs h-8 bg-surface-card"
                        helperText="Any search matching these keywords will be replaced with this single canonical place"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Included POI List */}
              <div className="pt-2 border-t border-status-success-border/60">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-fg-strong">
                    Locations in Collection ({collectionFormData.locations.length})
                  </label>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto mb-3">
                  {collectionFormData.locations.map((loc) => (
                    <div
                      key={loc.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-surface-card border border-border-subtle text-xs"
                    >
                      <div>
                        <span className="font-bold text-fg-primary mr-2">{loc.name}</span>
                        <span className="text-[10px] text-fg-subtle">{loc.address}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemovePoiFromCollection(loc.id)}
                        className="p-1 rounded text-red-500 hover:bg-status-danger-bg"
                        title="Remove POI"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add POI Mini-form */}
                <div className="p-2.5 rounded-xl bg-status-success-bg/70 border border-status-success-border space-y-2">
                  <span className="text-[11px] font-bold text-status-success-fg uppercase tracking-wider block">
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
                      onClick={onAddPoiToCollection}
                      leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs hover:shadow-xs active:scale-95"
                    >
                      Add Point
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-status-success-border/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCancelEditCollection}
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

      {/* Blacklist Form Drawer */}
      {activeSubTab === 'blacklists' && isEditingBlacklist && (
        <Card variant="elevated" className="border-status-danger-border bg-surface-card shadow-md animate-in slide-in-from-bottom-4">
          <CardHeader className="bg-surface-subtle border-b border-border-faint p-4">
            <CardTitle className="text-sm font-bold text-fg-strong">
              {blacklistFormData.id ? 'Edit Exclusion Zone' : 'Create Exclusion Zone'}
            </CardTitle>
            <CardDescription className="text-xs text-fg-muted">
              Define a blacklisted address or radius that blocks or flags trips.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <form onSubmit={onSaveBlacklist} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-fg-secondary uppercase">Name</label>
                <Input
                  required
                  value={blacklistFormData.name}
                  onChange={(e) => setBlacklistFormData({ ...blacklistFormData, name: e.target.value })}
                  placeholder="e.g. Abandoned Warehouse"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-fg-secondary uppercase">Reason / Context</label>
                <Input
                  required
                  value={blacklistFormData.reasonCode}
                  onChange={(e) => setBlacklistFormData({ ...blacklistFormData, reasonCode: e.target.value })}
                  placeholder="e.g. Safety Hazard, Out of bounds"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-fg-secondary uppercase">Enforcement Action</label>
                <Select
                  size="sm"
                  value={blacklistFormData.action}
                  onChange={(e) =>
                    setBlacklistFormData({
                      ...blacklistFormData,
                      action: e.target.value as 'BLACKLIST_BLOCK' | 'REQUIRE_REVIEW',
                    })
                  }
                >
                  <option value="BLACKLIST_BLOCK">Strict Block (Reject Bookings)</option>
                  <option value="REQUIRE_REVIEW">Flag for Review (Mode B)</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-fg-secondary uppercase">Lat</label>
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
                  <label className="text-[11px] font-bold text-fg-secondary uppercase">Lng</label>
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
                <label className="text-[11px] font-bold text-fg-secondary uppercase">Radius (Miles)</label>
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
                  onClick={onCancelEditBlacklist}
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
    </>
  );
}
