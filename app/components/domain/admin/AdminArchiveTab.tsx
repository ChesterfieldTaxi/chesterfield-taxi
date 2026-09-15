import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Badge } from '../../ui/Badge';
import { Alert } from '../../ui/Alert';
import {
  ArchiveBoxIcon,
  UserIcon,
  CarIcon,
  ShieldCheckIcon,
  MapPinIcon,
  HistoryIcon,
  DollarSignIcon,
  CompassIcon,
  CheckIcon,
  SpinnerIcon,
} from '../../ui/Icons';
import {
  getUniversalGovernanceService,
  type GovernanceEntityType,
  type EntityGovernanceRecord,
} from '../../../core/services/governance/universal-governance.service';
import { getZoneService } from '../../../core/services/zones/zone.service';
import { getTariffService } from '../../../core/services/pricing/tariff.service';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';

export interface AdminArchiveTabProps {
  initialSubTab?: string;
}

export function AdminArchiveTab({ initialSubTab = 'all' }: AdminArchiveTabProps) {
  const [activeFilter, setActiveFilter] = useState<string>(initialSubTab || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [archivedRecords, setArchivedRecords] = useState<EntityGovernanceRecord[]>([]);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAllArchives = async () => {
    try {
      const gov = getUniversalGovernanceService();
      const govRecords = gov.getArchivedEntities();

      // Collect auxiliary archives from zone & tariff services
      const auxiliary: EntityGovernanceRecord[] = [];

      try {
        const zoneService = getZoneService();
        const zones = (await zoneService.getZones()).filter((z) => !!z.isArchived);
        zones.forEach((z) => {
          if (!govRecords.some((r) => r.entityId === z.id && r.entityType === 'zone')) {
            auxiliary.push({
              entityId: z.id,
              entityType: 'zone',
              displayName: z.name,
              isBlacklisted: false,
              isArchived: true,
              archivedAt: z.archivedAt || new Date().toISOString(),
              archiveReason: z.archiveReason || 'Archived in Zone Manager',
              updatedAt: new Date().toISOString(),
            });
          }
        });

        const groups = (await zoneService.getZoneGroups()).filter((g) => !!g.isArchived);
        groups.forEach((g) => {
          if (!govRecords.some((r) => r.entityId === g.id && r.entityType === 'zone_group')) {
            auxiliary.push({
              entityId: g.id,
              entityType: 'zone_group',
              displayName: g.name,
              isBlacklisted: false,
              isArchived: true,
              archivedAt: g.archivedAt || new Date().toISOString(),
              archiveReason: g.archiveReason || 'Archived in Zone Groups',
              updatedAt: new Date().toISOString(),
            });
          }
        });

        const colls = (await zoneService.getLocationCollections()).filter((c) => !!c.isArchived);
        colls.forEach((c) => {
          if (!govRecords.some((r) => r.entityId === c.id && r.entityType === 'collection')) {
            auxiliary.push({
              entityId: c.id,
              entityType: 'collection',
              displayName: c.name,
              isBlacklisted: false,
              isArchived: true,
              archivedAt: c.archivedAt || new Date().toISOString(),
              archiveReason: c.archiveReason || 'Archived in POI Collections',
              updatedAt: new Date().toISOString(),
            });
          }
        });
      } catch (err) {
        console.warn('Failed to load auxiliary zone archives:', err);
      }

      try {
        const tariffService = getTariffService();
        const tariffs = (await tariffService.getTariffs()).filter((t) => !!t.isArchived);
        tariffs.forEach((t) => {
          if (!govRecords.some((r) => r.entityId === t.id && r.entityType === 'tariff')) {
            auxiliary.push({
              entityId: t.id,
              entityType: 'tariff',
              displayName: t.name,
              isBlacklisted: false,
              isArchived: true,
              archivedAt: t.archivedAt || new Date().toISOString(),
              archiveReason: t.archiveReason || 'Archived in Tariff Manager',
              updatedAt: new Date().toISOString(),
            });
          }
        });
      } catch (err) {
        console.warn('Failed to load auxiliary tariff archives:', err);
      }

      // Check settings for archived vehicle tiers
      try {
        const cachedSettings = getAdminConfigService().getCachedSettings();
        if (cachedSettings.vehicles) {
          cachedSettings.vehicles
            .filter((v) => !!v.isArchived)
            .forEach((v) => {
              if (!govRecords.some((r) => r.entityId === v.id && r.entityType === 'vehicle_type')) {
                auxiliary.push({
                  entityId: v.id,
                  entityType: 'vehicle_type',
                  displayName: `${v.name} (Tier Class)`,
                  isBlacklisted: false,
                  isArchived: true,
                  archivedAt: v.archivedAt || new Date().toISOString(),
                  archiveReason: v.archiveReason || 'Archived in Vehicle Classes',
                  updatedAt: new Date().toISOString(),
                });
              }
            });
        }
      } catch (err) {
        console.warn('Failed to load auxiliary vehicle archives:', err);
      }

      setArchivedRecords([...govRecords, ...auxiliary]);
    } catch (err: any) {
      console.error('Failed to load archives:', err);
    }
  };

  useEffect(() => {
    loadAllArchives();
    const gov = getUniversalGovernanceService();
    const unsub = gov.subscribe(() => {
      loadAllArchives();
    });
    return () => unsub();
  }, []);

  // Filtered List
  const filteredRecords = useMemo(() => {
    return archivedRecords.filter((record) => {
      // Category filter
      if (activeFilter !== 'all') {
        if (activeFilter === 'trips' && record.entityType !== 'trip') return false;
        if (activeFilter === 'customers' && record.entityType !== 'passenger') return false;
        if (
          activeFilter === 'operators' &&
          record.entityType !== 'driver' &&
          record.entityType !== 'staff'
        )
          return false;
        if (
          activeFilter === 'vehicles' &&
          record.entityType !== 'vehicle' &&
          record.entityType !== 'vehicle_type'
        )
          return false;
        if (
          activeFilter === 'zones' &&
          record.entityType !== 'zone' &&
          record.entityType !== 'zone_group'
        )
          return false;
        if (activeFilter === 'collections' && record.entityType !== 'collection') return false;
        if (activeFilter === 'tariffs' && record.entityType !== 'tariff') return false;
      }

      // Text search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchName = record.displayName?.toLowerCase().includes(q);
      const matchId = record.entityId.toLowerCase().includes(q);
      const matchType = record.entityType.toLowerCase().includes(q);
      const matchReason = record.archiveReason?.toLowerCase().includes(q);

      return matchName || matchId || matchType || matchReason;
    });
  }, [archivedRecords, activeFilter, searchQuery]);

  // Restore Action
  const handleRestore = async (record: EntityGovernanceRecord) => {
    setIsRestoring(record.entityId);
    try {
      const gov = getUniversalGovernanceService();
      await gov.restoreEntity(record.entityType, record.entityId);

      // Restore in specialized services if applicable
      if (record.entityType === 'zone') {
        await getZoneService().restoreZone(record.entityId);
      } else if (record.entityType === 'zone_group') {
        await getZoneService().restoreZoneGroup(record.entityId);
      } else if (record.entityType === 'collection') {
        await getZoneService().restoreLocationCollection(record.entityId);
      } else if (record.entityType === 'tariff') {
        await getTariffService().restoreTariff(record.entityId);
      } else if (record.entityType === 'vehicle_type') {
        const configService = getAdminConfigService();
        const settings = configService.getCachedSettings();
        if (settings.vehicles) {
          const updated = settings.vehicles.map((v) =>
            v.id === record.entityId
              ? { ...v, isArchived: false, archivedAt: undefined, archiveReason: undefined }
              : v
          );
          await configService.updateSettings({ vehicles: updated });
        }
      }

      setToastMessage({
        type: 'success',
        text: `Successfully restored "${record.displayName || record.entityId}" to active status.`,
      });
      loadAllArchives();
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      console.error('Failed to restore:', err);
      setToastMessage({
        type: 'error',
        text: err?.message || 'Failed to restore entity from archive.',
      });
    } finally {
      setIsRestoring(null);
    }
  };

  // KPIs
  const tripCount = archivedRecords.filter((r) => r.entityType === 'trip').length;
  const customerCount = archivedRecords.filter((r) => r.entityType === 'passenger').length;
  const operatorCount = archivedRecords.filter((r) => r.entityType === 'driver' || r.entityType === 'staff').length;
  const vehicleCount = archivedRecords.filter(
    (r) => r.entityType === 'vehicle' || r.entityType === 'vehicle_type'
  ).length;
  const zoneCount = archivedRecords.filter(
    (r) => r.entityType === 'zone' || r.entityType === 'zone_group' || r.entityType === 'collection'
  ).length;
  const tariffCount = archivedRecords.filter((r) => r.entityType === 'tariff').length;

  const getTypeBadge = (type: GovernanceEntityType) => {
    switch (type) {
      case 'trip':
        return <Badge variant="neutral" size="sm" className="bg-slate-100 text-slate-800">Trip</Badge>;
      case 'passenger':
        return <Badge variant="info" size="sm" className="bg-blue-100 text-blue-800">Passenger</Badge>;
      case 'driver':
        return <Badge variant="success" size="sm" className="bg-emerald-100 text-emerald-800">Driver</Badge>;
      case 'staff':
        return <Badge variant="primary" size="sm" className="bg-indigo-100 text-indigo-800">Staff</Badge>;
      case 'vehicle':
        return <Badge variant="warning" size="sm" className="bg-amber-100 text-amber-800">Fleet Car</Badge>;
      case 'vehicle_type':
        return <Badge variant="warning" size="sm" className="bg-amber-100 text-amber-900 font-bold">Vehicle Class</Badge>;
      case 'zone':
        return <Badge variant="danger" size="sm" className="bg-rose-100 text-rose-800">Geofence Zone</Badge>;
      case 'zone_group':
        return <Badge variant="primary" size="sm" className="bg-indigo-100 text-indigo-800">Zone Corridor</Badge>;
      case 'collection':
        return <Badge variant="success" size="sm" className="bg-teal-100 text-teal-800">POI Collection</Badge>;
      case 'tariff':
        return <Badge variant="primary" size="sm" className="bg-purple-100 text-purple-800">Unified Tariff</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{type}</Badge>;
    }
  };

  const getTypeIcon = (type: GovernanceEntityType) => {
    switch (type) {
      case 'trip':
        return <HistoryIcon className="w-4 h-4 text-slate-500" />;
      case 'passenger':
        return <UserIcon className="w-4 h-4 text-blue-600" />;
      case 'driver':
      case 'staff':
        return <ShieldCheckIcon className="w-4 h-4 text-indigo-600" />;
      case 'vehicle':
      case 'vehicle_type':
        return <CarIcon className="w-4 h-4 text-amber-600" />;
      case 'zone':
      case 'zone_group':
        return <MapPinIcon className="w-4 h-4 text-rose-600" />;
      case 'collection':
        return <CompassIcon className="w-4 h-4 text-teal-600" />;
      case 'tariff':
        return <DollarSignIcon className="w-4 h-4 text-purple-600" />;
      default:
        return <ArchiveBoxIcon className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl pb-16">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
              <ArchiveBoxIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Enterprise Archive &amp; Governance Center</h2>
              <p className="text-xs text-slate-500 font-medium">
                Unified data retention vault and 1-click restoration engine across all platform entities.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAllArchives}
            className="text-xs font-bold text-slate-700 bg-white shadow-2xs"
          >
            Refresh Vault
          </Button>
        </div>
      </div>

      {toastMessage && (
        <Alert
          variant={toastMessage.type === 'success' ? 'success' : 'error'}
          title={toastMessage.type === 'success' ? 'Restoration Completed' : 'Restoration Error'}
        >
          {toastMessage.text}
        </Alert>
      )}

      {/* ─── KPI Metrics ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total Vault</span>
          <span className="text-2xl font-black text-slate-900">{archivedRecords.length}</span>
          <span className="text-[10px] text-slate-400 block">All archived records</span>
        </div>

        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Trips</span>
          <span className="text-2xl font-black text-slate-800">{tripCount}</span>
          <span className="text-[10px] text-slate-400 block">Archived trip logs</span>
        </div>

        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Riders &amp; Staff</span>
          <span className="text-2xl font-black text-blue-700">{customerCount + operatorCount}</span>
          <span className="text-[10px] text-slate-400 block">Archived users</span>
        </div>

        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Fleet &amp; Types</span>
          <span className="text-2xl font-black text-amber-700">{vehicleCount}</span>
          <span className="text-[10px] text-slate-400 block">Vehicles &amp; classes</span>
        </div>

        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Zones &amp; POIs</span>
          <span className="text-2xl font-black text-rose-700">{zoneCount}</span>
          <span className="text-[10px] text-slate-400 block">Geofences &amp; clusters</span>
        </div>

        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Tariff Profiles</span>
          <span className="text-2xl font-black text-purple-700">{tariffCount}</span>
          <span className="text-[10px] text-slate-400 block">Pricing rate profiles</span>
        </div>
      </div>

      {/* ─── Search & Category Filter Pills ─── */}
      <Card variant="elevated" className="border-slate-200 shadow-xs">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Entity Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {[
                { key: 'all', label: `All (${archivedRecords.length})` },
                { key: 'trips', label: `Trips (${tripCount})` },
                { key: 'customers', label: `Passengers (${customerCount})` },
                { key: 'operators', label: `Staff & Drivers (${operatorCount})` },
                { key: 'vehicles', label: `Fleet & Classes (${vehicleCount})` },
                { key: 'zones', label: `Zones & Corridors (${zoneCount})` },
                { key: 'tariffs', label: `Tariffs (${tariffCount})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    activeFilter === tab.key
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="w-full sm:w-72 shrink-0">
              <Input
                placeholder="Search archive by ID, name, reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs h-9 bg-slate-50"
              />
            </div>
          </div>

          {/* ─── Unified Archive Table ─── */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Entity Type</th>
                  <th className="py-3 px-4">Name &amp; Identifier</th>
                  <th className="py-3 px-4">Archived Date</th>
                  <th className="py-3 px-4">Archive Reason / Context</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <ArchiveBoxIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <div className="font-bold text-slate-600">No Archived Items Found</div>
                      <div className="text-xs mt-1">
                        {searchQuery
                          ? 'No items matched your search filter.'
                          : 'There are currently no records archived under this category.'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((item) => (
                    <tr key={`${item.entityType}-${item.entityId}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(item.entityType)}
                          {getTypeBadge(item.entityType)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">
                          {item.displayName || item.entityId}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          ID: {item.entityId}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 text-[11px]">
                        {item.archivedAt
                          ? new Date(item.archivedAt).toLocaleString()
                          : 'Unknown date'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-[11px] max-w-xs truncate">
                        {item.archiveReason || 'Archived by administrator'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                          ARCHIVED
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(item)}
                          disabled={isRestoring === item.entityId}
                          className="font-bold text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 shadow-2xs h-7 px-2.5 text-xs"
                        >
                          {isRestoring === item.entityId ? (
                            <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckIcon className="w-3.5 h-3.5" />
                          )}
                          <span>Restore</span>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
