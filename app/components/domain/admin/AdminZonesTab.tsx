import React, { useState, useEffect, useMemo } from 'react';
import type { ZoneGeofence, ZoneCoordinate } from '../../../core/types/zone';
import { getZoneService, DEFAULT_ZONES } from '../../../core/services/zones/zone.service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Badge } from '../../ui/Badge';
import { Alert } from '../../ui/Alert';
import { PlusIcon, TrashIcon, CheckIcon, SpinnerIcon } from '../../ui/Icons';

export function AdminZonesTab() {
  const [zones, setZones] = useState<ZoneGeofence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Map state
  const [mapZoom, setMapZoom] = useState(1);
  const [drawMode, setDrawMode] = useState<'view' | 'draw_radius' | 'draw_polygon'>('view');

  // Form State for create/edit
  const [formData, setFormData] = useState<ZoneGeofence>({
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

  // Subscribe to real-time /zones
  useEffect(() => {
    setIsLoading(true);
    const service = getZoneService();
    const unsub = service.subscribeToZones(
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
    return unsub;
  }, []);

  const selectedZone = useMemo(() => {
    return zones.find((z) => z.id === selectedZoneId) || zones[0] || null;
  }, [zones, selectedZoneId]);

  const filteredZones = useMemo(() => {
    if (!searchQuery.trim()) return zones;
    const q = searchQuery.toLowerCase();
    return zones.filter(
      (z) => z.name.toLowerCase().includes(q) || (z.description && z.description.toLowerCase().includes(q))
    );
  }, [zones, searchQuery]);

  // Center on Chesterfield / St. Louis coordinates for coordinate normalization
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

  const handleStartCreate = () => {
    setFormData({
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
    setIsEditing(true);
  };

  const handleStartEdit = (zone: ZoneGeofence) => {
    setFormData({ ...zone });
    setSelectedZoneId(zone.id);
    setIsEditing(true);
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      setSaveError(null);
      const service = getZoneService();
      const saved = await service.saveZone(formData);
      setIsEditing(false);
      setSelectedZoneId(saved.id);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save geofence zone.');
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (confirm('Are you sure you want to delete this operational zone?')) {
      const service = getZoneService();
      await service.deleteZone(zoneId);
      if (selectedZoneId === zoneId) {
        setSelectedZoneId(null);
      }
    }
  };

  const handleToggleActive = async (zone: ZoneGeofence) => {
    const service = getZoneService();
    await service.saveZone({
      ...zone,
      isActive: !zone.isActive,
    });
  };

  const handleQuickPreset = (presetKey: string) => {
    if (presetKey === 'chesterfield') {
      setFormData((prev) => ({
        ...prev,
        name: 'Chesterfield Valley Core',
        center: { lat: 38.6631, lng: -90.5771 },
        radiusMiles: 5.0,
        color: '#3b82f6',
      }));
    } else if (presetKey === 'spirit') {
      setFormData((prev) => ({
        ...prev,
        name: 'Spirit of St. Louis Airport (SUS)',
        center: { lat: 38.6622, lng: -90.6508 },
        radiusMiles: 2.5,
        color: '#10b981',
        flatFee: 3.5,
      }));
    } else if (presetKey === 'lambert') {
      setFormData((prev) => ({
        ...prev,
        name: 'St. Louis Lambert International (STL)',
        center: { lat: 38.7487, lng: -90.37 },
        radiusMiles: 3.5,
        color: '#f59e0b',
        flatFee: 5.0,
      }));
    } else if (presetKey === 'downtown') {
      setFormData((prev) => ({
        ...prev,
        name: 'Downtown St. Louis Metro Hub',
        center: { lat: 38.627, lng: -90.1994 },
        radiusMiles: 4.0,
        color: '#ec4899',
        surchargeMultiplier: 1.1,
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Zones Top Action Bar ─── */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Operational Geofences ({zones.length})
          </span>
          <span className="hidden sm:inline-block text-xs text-slate-400">
            Chesterfield &amp; St. Louis Regional Zones
          </span>
        </div>

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleStartCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 font-bold text-xs"
        >
          <PlusIcon className="w-4 h-4" />
          <span>Create Named Zone</span>
        </Button>
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Zone Updated">
          Geofence successfully saved and synchronized.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Zone Error">
          {saveError}
        </Alert>
      )}

      {/* ─── Main Content Split: Left Drawer + Right Map Canvas ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 4-Columns: Zones Drawer */}
        <div className="lg:col-span-5 space-y-4">
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Zones Directory
              </span>
            </div>

            <Input
              placeholder="Filter zones by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs h-9 mb-3"
            />

            {isLoading ? (
              <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
                <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
                <span className="text-xs">Loading operational geofences...</span>
              </div>
            ) : filteredZones.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No matching zones found. Click "Create Named Zone" to add one.
              </div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {filteredZones.map((z) => {
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
                              handleToggleActive(z);
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
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(z);
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
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right 7-Columns: Interactive Geofence Map Visualizer & Editor */}
        <div className="lg:col-span-7 space-y-4">
          {/* Map Canvas Card */}
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs overflow-hidden">
            <CardHeader className="p-3.5 border-b border-slate-100 bg-slate-900 text-white flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xs font-bold text-white flex items-center gap-2">
                  <span>🗺️</span>
                  <span>Chesterfield &amp; St. Louis Regional Geofence Canvas</span>
                </CardTitle>
                <CardDescription className="text-[10px] text-slate-400">
                  Interactive spatial map of dispatch zones, airport perimeters, and service boundaries
                </CardDescription>
              </div>

              {/* Map Zoom Controls */}
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

            <CardContent className="p-0 relative bg-slate-950 h-96 overflow-hidden">
              {/* Regional Background Map Grid / Styling */}
              <div
                className="w-full h-full relative select-none transition-transform duration-200"
                style={{ transform: `scale(${mapZoom})`, transformOrigin: 'center center' }}
              >
                {/* SVG Base with Road Grids & Landmark Markers */}
                <svg className="w-full h-full absolute inset-0 pointer-events-none opacity-20">
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#38bdf8" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  {/* Missouri River Path Simulation */}
                  <path
                    d="M 10 10 Q 40 40 60 20 T 100 30"
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="4"
                    opacity="0.4"
                  />
                  {/* I-64 / US-40 Highway Corridor Simulation */}
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

                {/* Key Landmark Labels on Canvas */}
                <div className="absolute left-[20%] top-[48%] -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
                    ✈️ SUS Airport
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
                    🏛️ Downtown Arch
                  </span>
                </div>

                {/* Zones SVG Overlay */}
                <svg className="w-full h-full absolute inset-0 pointer-events-auto">
                  {zones.map((zone) => {
                    const isSelected = selectedZoneId === zone.id;
                    const strokeColor = zone.color || '#3b82f6';

                    if (zone.type === 'radius' && zone.center) {
                      const pt = projectToMap(zone.center);
                      const radiusPx = (zone.radiusMiles || 3) * 14;

                      return (
                        <g key={zone.id} onClick={() => setSelectedZoneId(zone.id)} className="cursor-pointer">
                          <circle
                            cx={`${pt.x}%`}
                            cy={`${pt.y}%`}
                            r={radiusPx}
                            fill={strokeColor}
                            fillOpacity={isSelected ? 0.35 : 0.18}
                            stroke={strokeColor}
                            strokeWidth={isSelected ? 3 : 1.5}
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
                          return `${pt.x * 4},${pt.y * 3.8}`; // Scale to 400x380 SVG viewBox approx
                        })
                        .join(' ');

                      return (
                        <g key={zone.id} onClick={() => setSelectedZoneId(zone.id)} className="cursor-pointer">
                          <polygon
                            points={pointsStr}
                            fill={strokeColor}
                            fillOpacity={isSelected ? 0.35 : 0.18}
                            stroke={strokeColor}
                            strokeWidth={isSelected ? 3 : 1.5}
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
                </svg>
              </div>

              {/* Bottom Canvas Overlay Legend */}
              <div className="absolute bottom-2 left-2 right-2 bg-slate-900/90 backdrop-blur-xs p-2 rounded-xl border border-slate-800 text-[11px] text-slate-300 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white">Selected Zone:</span>
                  <span className="text-blue-400 font-semibold">{selectedZone?.name || 'None'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Click any zone circle to view and edit details</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Create / Edit Zone Form Modal/Drawer */}
          {isEditing && (
            <Card variant="elevated" className="border-blue-300 bg-blue-50/20 shadow-md">
              <CardHeader className="p-4 border-b border-blue-200/60 bg-blue-50/50">
                <CardTitle className="text-sm font-bold text-blue-950">
                  {formData.id ? `Edit Zone: ${formData.name}` : 'Create New Named Geofence Zone'}
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Save this geofence to Firestore `/zones` to apply automatic pricing and dispatch rules.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <form onSubmit={handleSaveZone} className="space-y-4">
                  {/* Quick Preset Buttons */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Quick St. Louis Presets
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickPreset('chesterfield')}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-[11px] font-semibold text-slate-800"
                      >
                        Chesterfield Valley Core
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickPreset('spirit')}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-[11px] font-semibold text-slate-800"
                      >
                        Spirit Airport (SUS)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickPreset('lambert')}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-[11px] font-semibold text-slate-800"
                      >
                        Lambert Airport (STL)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickPreset('downtown')}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-[11px] font-semibold text-slate-800"
                      >
                        Downtown STL Metro
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Zone Name"
                      placeholder="e.g. Chesterfield Airport Corridor"
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Geofence Type
                      </label>
                      <select
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        value={formData.type}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, type: e.target.value as any }))
                        }
                      >
                        <option value="radius">Radius Circle (Center + Miles)</option>
                        <option value="polygon">Custom Polygon Geofence</option>
                      </select>
                    </div>
                  </div>

                  <Input
                    label="Zone Purpose / Description"
                    placeholder="e.g. Covers executive corporate terminals and luxury hotels."
                    value={formData.description || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {formData.type === 'radius' && (
                      <Input
                        label="Radius (Miles)"
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="50"
                        value={formData.radiusMiles || 3.0}
                        onChange={(e) =>
                          setFormData((prev) => ({
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
                      value={formData.flatFee || 0}
                      onChange={(e) =>
                        setFormData((prev) => ({
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
                      value={formData.surchargeMultiplier || 1.0}
                      onChange={(e) =>
                        setFormData((prev) => ({
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
                          value={formData.color || '#3b82f6'}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, color: e.target.value }))
                          }
                          className="w-10 h-10 rounded-xl border border-slate-300 cursor-pointer p-1 bg-white shadow-xs"
                        />
                        <Input
                          value={formData.color || '#3b82f6'}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, color: e.target.value }))
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
                          checked={formData.isActive}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, isActive: e.target.checked }))
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
                      onClick={() => setIsEditing(false)}
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
        </div>
      </div>
    </div>
  );
}
