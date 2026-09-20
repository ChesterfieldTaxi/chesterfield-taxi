import React, { useState, useEffect, useMemo } from 'react';
import {
  getSpecialPlacesService,
  DEFAULT_SPECIAL_PLACES,
  type SpecialPlace,
  type SpecialPlaceCategory,
} from '~/core/services/places/special-places.service';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Badge } from '~/components/ui/Badge';
import {
  MapPinIcon,
  SearchIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon,
  SparklesIcon,
  SlidersIcon,
  AlertTriangleIcon,
} from '~/components/ui/Icons';

const CATEGORY_CONFIG: Record<
  SpecialPlaceCategory,
  { label: string; icon: string; bgClass: string; textClass: string; borderClass: string }
> = {
  airport: {
    label: 'Airport',
    icon: '✈️',
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-700',
    borderClass: 'border-blue-200',
  },
  landmark: {
    label: 'Landmark',
    icon: '🏛️',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-200',
  },
  venue: {
    label: 'Venue / Arena',
    icon: '🏟️',
    bgClass: 'bg-purple-50',
    textClass: 'text-purple-700',
    borderClass: 'border-purple-200',
  },
  hospital: {
    label: 'Hospital / Medical',
    icon: '🏥',
    bgClass: 'bg-rose-50',
    textClass: 'text-rose-700',
    borderClass: 'border-rose-200',
  },
  shopping: {
    label: 'Shopping / Retail',
    icon: '🛍️',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
  },
  transit: {
    label: 'Transit / Station',
    icon: '🚆',
    bgClass: 'bg-cyan-50',
    textClass: 'text-cyan-700',
    borderClass: 'border-cyan-200',
  },
  hotel: {
    label: 'Hotel / Lodging',
    icon: '🏨',
    bgClass: 'bg-orange-50',
    textClass: 'text-orange-700',
    borderClass: 'border-orange-200',
  },
  corporate: {
    label: 'Corporate Account',
    icon: '🏢',
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-700',
    borderClass: 'border-indigo-200',
  },
  custom: {
    label: 'Special Place',
    icon: '📍',
    bgClass: 'bg-slate-50',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-200',
  },
};

export function SpecialPlacesAdminPanel() {
  const [places, setPlaces] = useState<SpecialPlace[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [popularOnly, setPopularOnly] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form / Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<SpecialPlace>({
    id: '',
    name: '',
    shortName: '',
    address: '',
    city: 'Chesterfield',
    state: 'MO',
    zip: '63005',
    coordinates: { lat: 38.6631, lng: -90.5771 },
    category: 'custom',
    isPopular: true,
    isActive: true,
    aliases: [],
    notes: '',
  });
  const [aliasesRaw, setAliasesRaw] = useState('');

  // Load places from service
  const loadPlaces = () => {
    const service = getSpecialPlacesService();
    setPlaces(service.getAllPlaces());
  };

  useEffect(() => {
    loadPlaces();
  }, []);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Filtered List
  const filteredPlaces = useMemo(() => {
    let result = places;

    if (categoryFilter !== 'all') {
      result = result.filter((p) => p.category === categoryFilter);
    }

    if (popularOnly) {
      result = result.filter((p) => p.isPopular);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((p) => {
        const matchName = p.name.toLowerCase().includes(q);
        const matchShort = p.shortName?.toLowerCase().includes(q);
        const matchAddr = p.address.toLowerCase().includes(q);
        const matchCity = p.city.toLowerCase().includes(q);
        const matchZip = p.zip.toLowerCase().includes(q);
        const matchAlias = p.aliases?.some((a) => a.toLowerCase().includes(q));
        return matchName || matchShort || matchAddr || matchCity || matchZip || matchAlias;
      });
    }

    return result;
  }, [places, categoryFilter, popularOnly, searchQuery]);

  const handleStartCreate = () => {
    setEditingId(null);
    setFormData({
      id: `place-${Date.now()}`,
      name: '',
      shortName: '',
      address: '',
      city: 'Chesterfield',
      state: 'MO',
      zip: '63005',
      coordinates: { lat: 38.6631, lng: -90.5771 },
      category: 'landmark',
      isPopular: true,
      isActive: true,
      aliases: [],
      notes: '',
    });
    setAliasesRaw('');
    setIsEditing(true);
  };

  const handleStartEdit = (place: SpecialPlace) => {
    setEditingId(place.id);
    setFormData({ ...place });
    setAliasesRaw(place.aliases ? place.aliases.join(', ') : '');
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim()) {
      showFeedback('Please provide both Place Name and Address.', 'error');
      return;
    }

    const parsedAliases = aliasesRaw
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    const placeToSave: SpecialPlace = {
      ...formData,
      id: formData.id || `place-${Date.now()}`,
      aliases: parsedAliases,
      updatedAt: new Date().toISOString(),
    };

    const service = getSpecialPlacesService();
    await service.savePlace(placeToSave);
    loadPlaces();
    setIsEditing(false);
    showFeedback(`Saved special place "${placeToSave.name}".`);
  };

  const handleDelete = async (place: SpecialPlace) => {
    if (confirm(`Are you sure you want to delete "${place.name}" from special places?`)) {
      const service = getSpecialPlacesService();
      await service.deletePlace(place.id);
      loadPlaces();
      showFeedback(`Deleted "${place.name}".`);
    }
  };

  const handleTogglePopular = async (place: SpecialPlace) => {
    const service = getSpecialPlacesService();
    await service.savePlace({
      ...place,
      isPopular: !place.isPopular,
    });
    loadPlaces();
    showFeedback(`${place.name} is ${!place.isPopular ? 'now marked as Popular' : 'removed from Popular'}.`);
  };

  const handleToggleActive = async (place: SpecialPlace) => {
    const service = getSpecialPlacesService();
    await service.savePlace({
      ...place,
      isActive: !place.isActive,
    });
    loadPlaces();
  };

  const handleResetDefaults = async () => {
    if (confirm('Reset all Special Places to St. Louis & Chesterfield regional defaults? This will restore standard airports, malls, venues, and corporate accounts.')) {
      const service = getSpecialPlacesService();
      await service.resetToDefaults();
      loadPlaces();
      showFeedback('Special places restored to regional defaults.');
    }
  };

  const handleSyncFirestore = async () => {
    const service = getSpecialPlacesService();
    await service.syncWithFirestore();
    loadPlaces();
    showFeedback('Synced special places with cloud database.');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="p-4.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <MapPinIcon className="w-4 h-4 text-emerald-600" />
              Special Places & Landmarks
            </h2>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px]">
              Site-Wide Autocomplete Suggestions
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            User-friendly landmarks, regional airports, hospitals, venues, and corporate pickup zones. Automatically displayed at the top of location inputs site-wide.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="text-xs border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            Reset Defaults
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSyncFirestore}
            className="text-xs border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            Cloud Sync
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleStartCreate}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-2xs"
          >
            <PlusIcon className="w-3.5 h-3.5 mr-1" />
            Add Special Place
          </Button>
        </div>
      </div>

      {/* Toast Feedback */}
      {feedbackMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 shadow-2xs ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangleIcon className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span className="font-semibold">{feedbackMsg.text}</span>
        </div>
      )}

      {/* Editing / Creation Drawer Modal */}
      {isEditing && (
        <form onSubmit={handleSave} className="p-5 rounded-xl bg-white border border-slate-300 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <SparklesIcon className="w-4 h-4 text-emerald-600" />
              {editingId ? 'Edit Special Place' : 'Create New Special Place'}
            </h3>
            <span className="text-xs text-slate-400 font-mono">ID: {formData.id || 'auto'}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-700 block mb-1">
                Full Place Name <span className="text-rose-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. St. Louis Lambert International Airport (STL)"
                required
                value={formData.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="h-8.5 text-xs bg-white border-slate-300 text-slate-900 font-medium"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">
                Short Name / Label
              </label>
              <Input
                type="text"
                placeholder="e.g. Lambert Airport (STL)"
                value={formData.shortName || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, shortName: e.target.value })
                }
                className="h-8.5 text-xs bg-white border-slate-300 text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-700 block mb-1">
                Street Address <span className="text-rose-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. 10701 Lambert International Blvd"
                required
                value={formData.address}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                className="h-8.5 text-xs bg-white border-slate-300 text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">City</label>
              <Input
                type="text"
                value={formData.city}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                className="h-8.5 text-xs bg-white border-slate-300 text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">State & Zip</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={formData.state}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({ ...formData, state: e.target.value })
                  }
                  className="h-8.5 text-xs bg-white border-slate-300 text-slate-900 w-16 uppercase text-center font-bold"
                />
                <Input
                  type="text"
                  placeholder="63005"
                  value={formData.zip}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({ ...formData, zip: e.target.value })
                  }
                  className="h-8.5 text-xs bg-white border-slate-300 text-slate-900 flex-1 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFormData({ ...formData, category: e.target.value as SpecialPlaceCategory })
                }
                className="w-full h-8.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 px-2 font-medium"
              >
                {Object.entries(CATEGORY_CONFIG).map(([key, cat]) => (
                  <option key={key} value={key}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Latitude</label>
              <Input
                type="number"
                step="0.0001"
                value={formData.coordinates.lat}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({
                    ...formData,
                    coordinates: {
                      ...formData.coordinates,
                      lat: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="h-8.5 text-xs bg-white border-slate-300 text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Longitude</label>
              <Input
                type="number"
                step="0.0001"
                value={formData.coordinates.lng}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({
                    ...formData,
                    coordinates: {
                      ...formData.coordinates,
                      lng: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="h-8.5 text-xs bg-white border-slate-300 text-slate-900 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">
              Search Aliases & Keywords (comma-separated)
            </label>
            <Input
              type="text"
              placeholder="e.g. STL, Lambert, Terminal 1, Terminal 2, Airport"
              value={aliasesRaw}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAliasesRaw(e.target.value)}
              className="h-8.5 text-xs bg-white border-slate-300 text-slate-900"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              When a customer types any of these aliases, this place will match automatically.
            </span>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Driver & Dispatch Notes</label>
            <Input
              type="text"
              placeholder="e.g. Commercial pickup island outside baggage claim exit 12"
              value={formData.notes || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              className="h-8.5 text-xs bg-white border-slate-300 text-slate-900"
            />
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-100 text-xs">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
              <input
                type="checkbox"
                checked={formData.isPopular}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, isPopular: e.target.checked })
                }
                className="rounded border-slate-300 text-amber-500 focus:ring-0"
              />
              <span>⭐ Mark as Popular (Shown immediately when input is focused)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="rounded border-slate-300 text-emerald-600 focus:ring-0"
              />
              <span>Active in Autocomplete</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(false)}
              className="text-xs border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-2xs"
            >
              <CheckIcon className="w-3.5 h-3.5 mr-1" />
              Save Special Place
            </Button>
          </div>
        </form>
      )}

      {/* Filter and Search Bar */}
      <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 shadow-2xs">
        <div className="relative w-full md:w-80">
          <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <Input
            type="text"
            placeholder="Search by name, address, alias, or zip..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="h-8.5 text-xs pl-8 bg-white border-slate-300 text-slate-900 w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Category Dropdown Filter */}
          <select
            value={categoryFilter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value)}
            className="h-8 text-xs rounded-md bg-white border border-slate-300 text-slate-700 px-2 font-medium"
          >
            <option value="all">All Categories ({places.length})</option>
            {Object.entries(CATEGORY_CONFIG).map(([key, cat]) => (
              <option key={key} value={key}>
                {cat.icon} {cat.label}
              </option>
            ))}
          </select>

          {/* Popular Toggle Button */}
          <button
            type="button"
            onClick={() => setPopularOnly(!popularOnly)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer ${
              popularOnly
                ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold'
                : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
            }`}
          >
            <span>⭐</span>
            <span>Popular Only</span>
          </button>

          <span className="text-xs font-semibold text-slate-500 pl-1">
            Showing {filteredPlaces.length} of {places.length}
          </span>
        </div>
      </div>

      {/* Special Places Cards / Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredPlaces.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {filteredPlaces.map((place) => {
              const catConfig = CATEGORY_CONFIG[place.category] || CATEGORY_CONFIG.custom;

              return (
                <div
                  key={place.id}
                  className="p-4 hover:bg-slate-50/60 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Popular Star Button */}
                      <button
                        type="button"
                        onClick={() => handleTogglePopular(place)}
                        title={place.isPopular ? 'Click to remove from Popular' : 'Click to make Popular'}
                        className={`text-base leading-none transition-transform active:scale-125 cursor-pointer ${
                          place.isPopular ? 'text-amber-500 drop-shadow-2xs' : 'text-slate-300 hover:text-amber-400'
                        }`}
                      >
                        ★
                      </button>

                      <span className="text-sm font-bold text-slate-900 truncate">
                        {place.name}
                      </span>

                      {place.shortName && (
                        <span className="text-xs text-slate-500 font-medium">
                          ({place.shortName})
                        </span>
                      )}

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${catConfig.bgClass} ${catConfig.textClass} ${catConfig.borderClass}`}
                      >
                        <span>{catConfig.icon}</span>
                        <span>{catConfig.label}</span>
                      </span>

                      {!place.isActive && (
                        <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300 text-[10px]">
                          Disabled
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="flex items-center gap-1">
                        <MapPinIcon className="w-3 h-3 text-slate-400 shrink-0" />
                        {place.address}, {place.city}, {place.state} {place.zip}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        ({place.coordinates.lat.toFixed(4)}, {place.coordinates.lng.toFixed(4)})
                      </span>
                    </div>

                    {/* Search Aliases Badges */}
                    {place.aliases && place.aliases.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1">
                          Aliases:
                        </span>
                        {place.aliases.map((alias, aIdx) => (
                          <span
                            key={aIdx}
                            className="inline-block px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                          >
                            {alias}
                          </span>
                        ))}
                      </div>
                    )}

                    {place.notes && (
                      <p className="text-[11px] text-slate-500 italic">
                        Note: {place.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartEdit(place)}
                      className="text-xs border-slate-300 text-slate-700 hover:bg-slate-100 shadow-2xs h-7.5 px-2.5"
                    >
                      Edit
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleDelete(place)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete place"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400 text-xs">
            No special places match your current filters.
          </div>
        )}
      </div>
    </div>
  );
}
