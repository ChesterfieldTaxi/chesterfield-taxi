import React from 'react';
import type {
  ZoneGeofence,
  ZoneGroup,
  LocationCollection,
  BlacklistedLocation,
} from '~/core/types/zone';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/Card';
import {
  PlaneIcon,
  RulerIcon,
  MapIcon,
  GlobeIcon,
  BuildingIcon,
  LandmarkIcon,
  PlaneTakeoffIcon,
  XIcon,
} from '~/components/ui/Icons';
import { InteractiveZoneGoogleMap } from './InteractiveZoneGoogleMap';
import {
  projectToMap,
  unprojectFromMap,
  generateBoxVertices,
  type AdminZonesSubTab,
  type ZoneMapMode,
} from './types';

export interface ZonePolygonMapCanvasProps {
  activeSubTab: AdminZonesSubTab;
  mapMode: ZoneMapMode;
  setMapMode: React.Dispatch<React.SetStateAction<ZoneMapMode>>;
  mapZoom: number;
  setMapZoom: React.Dispatch<React.SetStateAction<number>>;
  zones: ZoneGeofence[];
  selectedZoneId: string | null;
  selectedZone: ZoneGeofence | null;
  onSelectZoneId: (id: string) => void;
  isEditingZone: boolean;
  zoneFormData: ZoneGeofence;
  setZoneFormData: React.Dispatch<React.SetStateAction<ZoneGeofence>>;
  selectedGroup: ZoneGroup | null;
  locationCollections: LocationCollection[];
  selectedCollectionId: string | null;
  selectedCollection: LocationCollection | null;
  selectedPoiId: string | null;
  onSelectPoi: (poiId: string, collectionId: string) => void;
  blacklistedLocations: BlacklistedLocation[];
  selectedBlacklistId: string | null;
  selectedBlacklist: BlacklistedLocation | null;
  onSelectBlacklistId: (id: string) => void;
}

export function ZonePolygonMapCanvas({
  activeSubTab,
  mapMode,
  setMapMode,
  mapZoom,
  setMapZoom,
  zones,
  selectedZoneId,
  selectedZone,
  onSelectZoneId,
  isEditingZone,
  zoneFormData,
  setZoneFormData,
  selectedGroup,
  locationCollections,
  selectedCollectionId,
  selectedCollection,
  selectedPoiId,
  onSelectPoi,
  blacklistedLocations,
  selectedBlacklistId,
  selectedBlacklist,
  onSelectBlacklistId,
}: ZonePolygonMapCanvasProps) {
  return (
    <div className="order-1 lg:order-2 lg:col-span-7 space-y-4">
      <Card variant="elevated" className="border-slate-200 bg-white shadow-xs overflow-hidden">
        <CardHeader className="p-3 sm:p-3.5 border-b border-slate-100 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-xs font-bold text-white flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="truncate">Chesterfield &amp; St. Louis Zones Map</span>
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-400 mt-0.5">
              {activeSubTab === 'zones' &&
                (isEditingZone
                  ? zoneFormData.type === 'polygon'
                    ? 'POLYGON DRAW MODE: Tap map to add vertices, or drag existing handles'
                    : 'RADIUS EDIT MODE: Tap map or drag center to position radius circle'
                  : 'Spatial visualization of polygon zones & radius perimeters')}
              {activeSubTab === 'groups' && 'Cluster visualization of unified Zone Groups'}
              {activeSubTab === 'collections' && 'Points of Interest with interactive proximity buffers'}
              {activeSubTab === 'blacklists' && 'Restricted & blacklisted security zones'}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Map Engine Toggle: Live Google Map vs Schematic Grid */}
            <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700 text-[11px]">
              <button
                type="button"
                onClick={() => setMapMode('google')}
                className={`px-2.5 py-1 rounded-md font-bold transition-colors inline-flex items-center gap-1.5 ${
                  mapMode === 'google'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <GlobeIcon className="w-3.5 h-3.5" />
                <span>Live Map</span>
              </button>
              <button
                type="button"
                onClick={() => setMapMode('schematic')}
                className={`px-2.5 py-1 rounded-md font-bold transition-colors inline-flex items-center gap-1.5 ${
                  mapMode === 'schematic'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <RulerIcon className="w-3.5 h-3.5" />
                <span>Schematic</span>
              </button>
            </div>

            {/* Zoom Controls for Schematic Mode */}
            {mapMode === 'schematic' && (
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMapZoom((z) => Math.max(0.8, z - 0.2))}
                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                >
                  -
                </button>
                <span className="text-[11px] font-mono text-slate-400">
                  {Math.round(mapZoom * 100)}%
                </span>
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
            )}
          </div>
        </CardHeader>

        {/* Active Polygon / Radius Drawing Floating Toolbar */}
        {activeSubTab === 'zones' && isEditingZone && (
          <div className="bg-indigo-950/95 border-b border-indigo-800 px-3.5 py-2 text-white flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-indigo-100">
                {zoneFormData.type === 'polygon'
                  ? `Drawing Polygon "${zoneFormData.name || 'New Zone'}" (${zoneFormData.vertices?.length || 0} vertices)`
                  : `Positioning Radius "${zoneFormData.name || 'New Zone'}" (${zoneFormData.radiusMiles || 3} mi)`}
              </span>
              <span className="text-[11px] text-indigo-300 hidden sm:inline">
                {zoneFormData.type === 'polygon'
                  ? '— Click map to add points • Drag points to reshape • Right-click vertex on Live Map to delete'
                  : '— Click map to move center'}
              </span>
            </div>

            {zoneFormData.type === 'polygon' && (
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
                  className="px-2 py-1 rounded bg-indigo-900 hover:bg-indigo-800 disabled:opacity-40 text-[11px] font-bold text-indigo-100 border border-indigo-700 cursor-pointer"
                >
                  Undo Last Point
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setZoneFormData((prev) => ({
                      ...prev,
                      vertices: generateBoxVertices(
                        prev.center || { lat: 38.6631, lng: -90.5771 }
                      ),
                    }))
                  }
                  className="px-2 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-[11px] font-bold text-white cursor-pointer"
                >
                  4-Point Box
                </button>
                <button
                  type="button"
                  onClick={() => setZoneFormData((prev) => ({ ...prev, vertices: [] }))}
                  disabled={(zoneFormData.vertices?.length || 0) === 0}
                  className="px-2 py-1 rounded bg-rose-900/80 hover:bg-rose-800 disabled:opacity-40 text-[11px] font-bold text-rose-100 border border-rose-700 inline-flex items-center gap-1 cursor-pointer"
                >
                  <XIcon className="w-3 h-3" />
                  <span>Clear Points</span>
                </button>
              </div>
            )}
          </div>
        )}

        <CardContent className="p-0 relative bg-slate-950 h-[300px] sm:h-[420px] lg:h-[520px] overflow-hidden">
          {mapMode === 'google' ? (
            <InteractiveZoneGoogleMap
              zones={zones}
              selectedZoneId={selectedZoneId}
              onSelectZone={(id) => {
                if (activeSubTab === 'zones') onSelectZoneId(id);
              }}
              isEditingZone={activeSubTab === 'zones' && isEditingZone}
              zoneFormData={zoneFormData}
              onChangeZoneFormData={setZoneFormData}
              activeSubTab={activeSubTab}
              selectedGroup={selectedGroup}
              locationCollections={locationCollections}
              selectedCollectionId={selectedCollectionId}
              selectedPoiId={selectedPoiId}
              onSelectPoi={(poiId, collId) => {
                onSelectPoi(poiId, collId);
              }}
              blacklistedLocations={blacklistedLocations}
              selectedBlacklistId={selectedBlacklistId}
              onSelectBlacklist={(id) => onSelectBlacklistId(id)}
              onFallbackToSchematic={() => setMapMode('schematic')}
            />
          ) : (
            /* Scale container for Schematic Fallback */
            <div
              className={`w-full h-full relative select-none transition-transform duration-200 ${
                activeSubTab === 'zones' && isEditingZone ? 'cursor-crosshair' : ''
              }`}
              style={{ transform: `scale(${mapZoom})`, transformOrigin: 'center center' }}
              onClick={(e) => {
                if (!(activeSubTab === 'zones' && isEditingZone)) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const xPct = ((e.clientX - rect.left) / rect.width) * 100;
                const yPct = ((e.clientY - rect.top) / rect.height) * 100;
                const coord = unprojectFromMap(xPct, yPct);
                if (zoneFormData.type === 'polygon') {
                  setZoneFormData((prev) => ({
                    ...prev,
                    vertices: [...(prev.vertices || []), coord],
                  }));
                } else {
                  setZoneFormData((prev) => ({
                    ...prev,
                    center: coord,
                  }));
                }
              }}
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
                <span className="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800 inline-flex items-center gap-1">
                  <PlaneIcon className="w-3 h-3 text-sky-400" />
                  <span>Spirit of St. Louis</span>
                </span>
              </div>
              <div className="absolute left-[38%] top-[52%] -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
                <span className="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800 inline-flex items-center gap-1">
                  <BuildingIcon className="w-3 h-3 text-blue-400" />
                  <span>Chesterfield Valley</span>
                </span>
              </div>
              <div className="absolute left-[70%] top-[25%] -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
                <span className="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800 inline-flex items-center gap-1">
                  <PlaneTakeoffIcon className="w-3 h-3 text-sky-400" />
                  <span>STL Lambert Int&apos;l</span>
                </span>
              </div>
              <div className="absolute left-[88%] top-[65%] -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
                <span className="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800 inline-flex items-center gap-1">
                  <LandmarkIcon className="w-3 h-3 text-amber-400" />
                  <span>Gateway Arch &amp; Busch Stadium</span>
                </span>
              </div>

              {/* Normalized 0..100 SVG for Polygon Rendering */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="w-full h-full absolute inset-0 pointer-events-none"
              >
                {(activeSubTab === 'zones' || activeSubTab === 'groups') &&
                  zones.map((zone) => {
                    if (isEditingZone && zoneFormData.id === zone.id) return null;
                    if (zone.type !== 'polygon' || !zone.vertices || zone.vertices.length < 3) {
                      return null;
                    }
                    const isSelectedZone = activeSubTab === 'zones' && selectedZoneId === zone.id;
                    const isGroupMember =
                      activeSubTab === 'groups' && selectedGroup?.zoneIds.includes(zone.id);
                    const strokeColor = isGroupMember
                      ? selectedGroup?.color || '#6366f1'
                      : zone.color || '#3b82f6';
                    const fillOpacity = isSelectedZone || isGroupMember ? 0.35 : 0.15;
                    const pointsStr = zone.vertices
                      .map((v) => {
                        const pt = projectToMap(v);
                        return `${pt.x},${pt.y}`;
                      })
                      .join(' ');
                    return (
                      <polygon
                        key={zone.id}
                        points={pointsStr}
                        fill={strokeColor}
                        fillOpacity={fillOpacity}
                        stroke={strokeColor}
                        strokeWidth={isSelectedZone || isGroupMember ? 1.2 : 0.6}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}

                {/* Draft Polygon Preview in Schematic Mode */}
                {activeSubTab === 'zones' &&
                  isEditingZone &&
                  zoneFormData.type === 'polygon' &&
                  (zoneFormData.vertices?.length || 0) >= 2 && (
                    <polygon
                      points={(zoneFormData.vertices || [])
                        .map((v) => {
                          const pt = projectToMap(v);
                          return `${pt.x},${pt.y}`;
                        })
                        .join(' ')}
                      fill={zoneFormData.color || '#4f46e5'}
                      fillOpacity={0.35}
                      stroke={zoneFormData.color || '#4f46e5'}
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
              </svg>

              {/* Dynamic SVG Entities */}
              <svg className="w-full h-full absolute inset-0 pointer-events-auto">
                {/* Render Zones (both in 'zones' and 'groups' sub-tab) */}
                {(activeSubTab === 'zones' || activeSubTab === 'groups') &&
                  zones.map((zone) => {
                    if (isEditingZone && zoneFormData.id === zone.id) return null;
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
                          onClick={(ev) => {
                            if (isEditingZone) return;
                            ev.stopPropagation();
                            if (activeSubTab === 'zones') onSelectZoneId(zone.id);
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
                      const avgLat =
                        zone.vertices.reduce((acc, v) => acc + v.lat, 0) / zone.vertices.length;
                      const avgLng =
                        zone.vertices.reduce((acc, v) => acc + v.lng, 0) / zone.vertices.length;
                      const centerPt = projectToMap({ lat: avgLat, lng: avgLng });

                      return (
                        <g
                          key={zone.id}
                          onClick={(ev) => {
                            if (isEditingZone) return;
                            ev.stopPropagation();
                            if (activeSubTab === 'zones') onSelectZoneId(zone.id);
                          }}
                          className="cursor-pointer"
                        >
                          {zone.vertices.map((v, vIdx) => {
                            const vPt = projectToMap(v);
                            return (
                              <circle
                                key={vIdx}
                                cx={`${vPt.x}%`}
                                cy={`${vPt.y}%`}
                                r={3.5}
                                fill={strokeColor}
                                stroke="#ffffff"
                                strokeWidth={1}
                              />
                            );
                          })}
                          <text
                            x={`${centerPt.x}%`}
                            y={`${centerPt.y}%`}
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

                {/* Render Active Draft Zone in Schematic Mode */}
                {activeSubTab === 'zones' &&
                  isEditingZone &&
                  zoneFormData.type === 'radius' &&
                  zoneFormData.center && (
                    <g className="pointer-events-none">
                      {(() => {
                        const pt = projectToMap(zoneFormData.center);
                        const radiusPx = (zoneFormData.radiusMiles || 3) * 14;
                        const color = zoneFormData.color || '#2563eb';
                        return (
                          <>
                            <circle
                              cx={`${pt.x}%`}
                              cy={`${pt.y}%`}
                              r={radiusPx}
                              fill={color}
                              fillOpacity={0.35}
                              stroke={color}
                              strokeWidth={3}
                            />
                            <circle
                              cx={`${pt.x}%`}
                              cy={`${pt.y}%`}
                              r={6}
                              fill={color}
                              stroke="#ffffff"
                              strokeWidth={2}
                            />
                          </>
                        );
                      })()}
                    </g>
                  )}

                {activeSubTab === 'zones' &&
                  isEditingZone &&
                  zoneFormData.type === 'polygon' &&
                  (zoneFormData.vertices || []).map((v, idx) => {
                    const pt = projectToMap(v);
                    return (
                      <g
                        key={idx}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          // Clicking an existing vertex in schematic mode removes it
                          setZoneFormData((prev) => ({
                            ...prev,
                            vertices: (prev.vertices || []).filter((_, i) => i !== idx),
                          }));
                        }}
                        className="cursor-pointer"
                      >
                        <circle
                          cx={`${pt.x}%`}
                          cy={`${pt.y}%`}
                          r={7}
                          fill={zoneFormData.color || '#4f46e5'}
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                        <text
                          x={`${pt.x}%`}
                          y={`${pt.y}%`}
                          dy={3}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="8"
                          fontWeight="bold"
                          className="select-none"
                        >
                          {idx + 1}
                        </text>
                      </g>
                    );
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
                            onSelectPoi(loc.id, coll.id);
                          }}
                          className="cursor-pointer group"
                        >
                          <circle
                            cx={`${pt.x}%`}
                            cy={`${pt.y}%`}
                            r={bufferPx}
                            fill="#10b981"
                            fillOpacity={isCollSelected || isPoiSelected ? 0.25 : 0.1}
                            stroke="#10b981"
                            strokeWidth={isPoiSelected ? 2.5 : 1}
                            strokeDasharray={isPoiSelected ? undefined : '3 3'}
                          />
                          <circle
                            cx={`${pt.x}%`}
                            cy={`${pt.y}%`}
                            r={isPoiSelected ? 8 : 6}
                            fill={isPoiSelected ? '#059669' : '#10b981'}
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
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
                    const strokeColor =
                      loc.action === 'BLACKLIST_BLOCK' ? '#ef4444' : '#f59e0b';
                    const fillOpacity = isSelected ? 0.4 : 0.2;

                    return (
                      <g
                        key={loc.id}
                        onClick={() => onSelectBlacklistId(loc.id)}
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
          )}

          {/* Bottom Canvas Overlay Legend */}
          <div className="absolute bottom-2 left-2 right-2 z-10 bg-slate-900/90 backdrop-blur-xs px-2.5 py-2 rounded-xl border border-slate-800 text-[11px] text-slate-300 flex items-center justify-between gap-2 pointer-events-none">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-white shrink-0">
                {activeSubTab === 'zones' && (isEditingZone ? 'Editing:' : 'Selected:')}
                {activeSubTab === 'groups' && 'Group:'}
                {activeSubTab === 'collections' && 'Collection:'}
                {activeSubTab === 'blacklists' && 'Exclusion:'}
              </span>
              <span className="text-blue-400 font-semibold truncate">
                {activeSubTab === 'zones' &&
                  (isEditingZone
                    ? `${zoneFormData.name || 'Untitled'} (${zoneFormData.type === 'polygon' ? `${zoneFormData.vertices?.length || 0} pts` : `${zoneFormData.radiusMiles || 3} mi`})`
                    : selectedZone?.name || 'None')}
                {activeSubTab === 'groups' && (selectedGroup?.name || 'None')}
                {activeSubTab === 'collections' && (selectedCollection?.name || 'None')}
                {activeSubTab === 'blacklists' && (selectedBlacklist?.name || 'None')}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <span className="text-slate-400">
                {activeSubTab === 'zones' &&
                  (isEditingZone
                    ? zoneFormData.type === 'polygon'
                      ? 'Click map to add vertices • Drag vertices to adjust'
                      : 'Click map to reposition radius center'
                    : 'Click a zone to inspect or draw a polygon')}
                {activeSubTab === 'groups' && `${selectedGroup?.zoneIds.length || 0} zones in cluster`}
                {activeSubTab === 'collections' && `${selectedCollection?.locations?.length || 0} POIs in collection`}
                {activeSubTab === 'blacklists' && 'Click an exclusion zone to view radius'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
