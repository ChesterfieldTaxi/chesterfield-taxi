import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Badge } from '../../ui/Badge';
import { Alert } from '../../ui/Alert';
import {
  ArchiveBoxIcon,
  BuildingIcon,
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
import {
  getCorporateAccountService,
  restoreCorporateAccountRecord,
} from '../../../core/services/corporate-account.service';
import type { CorporateAccountConfig } from '../../../core/types/config';

export interface AdminArchiveTabProps {
  initialSubTab?: string;
}

export function AdminArchiveTab({ initialSubTab = 'all' }: AdminArchiveTabProps) {
  const [activeFilter, setActiveFilter] = useState<string>(initialSubTab || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [archivedRecords, setArchivedRecords] = useState<EntityGovernanceRecord[]>([]);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (initialSubTab) {
      setActiveFilter(initialSubTab);
    }
  }, [initialSubTab]);

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

      // Check settings for archived vehicle tiers and corporate accounts
      try {
        const configService = getAdminConfigService();
        const settingsSnapshot = await configService
          .getSettings()
          .catch(() => configService.getCachedSettings());
        if (settingsSnapshot.vehicles) {
          settingsSnapshot.vehicles
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

        if (settingsSnapshot.corporateAccounts) {
          const archivedCorps = settingsSnapshot.corporateAccounts.filter((c) => !!c.isArchived);
          archivedCorps.forEach((corp) => {
            const existingIdx = govRecords.findIndex(
              (r) => r.entityId === corp.id && r.entityType === 'corporate_account'
            );
            const enrichedRecord: EntityGovernanceRecord = {
              entityId: corp.id,
              entityType: 'corporate_account',
              displayName: `${corp.companyName} (${corp.accountNumber})`,
              isBlacklisted: false,
              isArchived: true,
              archivedAt: corp.archivedAt || new Date().toISOString(),
              archiveReason: corp.archiveReason || 'Archived in Corporate Directory',
              updatedAt: corp.updatedAt || new Date().toISOString(),
            };
            if (existingIdx >= 0) {
              govRecords[existingIdx] = { ...govRecords[existingIdx], ...enrichedRecord };
            } else {
              auxiliary.push(enrichedRecord);
            }
          });
        }
      } catch (err) {
        console.warn('Failed to load auxiliary settings archives:', err);
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
        if (activeFilter === 'corporate' && record.entityType !== 'corporate_account') return false;
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
      } else if (record.entityType === 'corporate_account') {
        const configService = getAdminConfigService();
        const settings = await configService
          .getSettings()
          .catch(() => configService.getCachedSettings());
        if (settings.corporateAccounts) {
          let restoredAccount: CorporateAccountConfig | null = null;
          const updated = settings.corporateAccounts.map((a) => {
            if (a.id === record.entityId) {
              restoredAccount = restoreCorporateAccountRecord(a);
              return restoredAccount;
            }
            return a;
          });
          await configService.updateSettings({ corporateAccounts: updated });
          if (restoredAccount) {
            await getCorporateAccountService().syncAccountToFirestore(restoredAccount);
          }
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
  const corporateCount = archivedRecords.filter((r) => r.entityType === 'corporate_account').length;

  const getTypeBadge = (type: GovernanceEntityType) => {
    switch (type) {
      case 'trip':
        return <Badge variant="neutral" size="sm" className="bg-slate-100 text-slate-800">Trip</Badge>;
      case 'passenger':
        return <Badge variant="info" size="sm" className="bg-blue-100 text-blue-800">Client</Badge>;
      case 'corporate_account':
        return <Badge variant="primary" size="sm" className="bg-blue-100 text-blue-800 font-bold">Corporate</Badge>;
      case 'driver':
        return <Badge variant="success" size="sm" className="bg-emerald-100 text-emerald-800">Driver</Badge>;
      case 'staff':
        return <Badge variant="primary" size="sm" className="bg-indigo-100 text-indigo-800">Staff</Badge>;
      case 'vehicle':
        return <Badge variant="warning" size="sm" className="bg-amber-100 text-amber-800">Car</Badge>;
      case 'vehicle_type':
        return <Badge variant="warning" size="sm" className="bg-amber-100 text-amber-900 font-bold">Vehicle Type</Badge>;
      case 'zone':
        return <Badge variant="danger" size="sm" className="bg-rose-100 text-rose-800">Zone</Badge>;
      case 'zone_group':
        return <Badge variant="primary" size="sm" className="bg-indigo-100 text-indigo-800">Zone Group</Badge>;
      case 'collection':
        return <Badge variant="success" size="sm" className="bg-teal-100 text-teal-800">Places</Badge>;
      case 'tariff':
        return <Badge variant="primary" size="sm" className="bg-purple-100 text-purple-800">Rate</Badge>;
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
      case 'corporate_account':
        return <BuildingIcon className="w-4 h-4 text-blue-600" />;
      default:
        return <ArchiveBoxIcon className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-4 max-w-7xl pb-12">
      {toastMessage && (
        <Alert
          variant={toastMessage.type === 'success' ? 'success' : 'error'}
          title={toastMessage.type === 'success' ? 'Restoration Completed' : 'Restoration Error'}
        >
          {toastMessage.text}
        </Alert>
      )}

      {/* ─── Single Clean Toolbar + Mobile Cards / Desktop Table ─── */}
      <Card variant="elevated" className="border-slate-200/90 shadow-xs overflow-hidden">
        <CardContent className="p-3 sm:p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-100">
            {[
              { id: 'all', label: 'All', count: archivedRecords.length },
              { id: 'corporate', label: 'Corporate', count: corporateCount },
              { id: 'customers', label: 'Clients', count: customerCount },
              { id: 'operators', label: 'Operators', count: operatorCount },
              { id: 'vehicles', label: 'Vehicles', count: vehicleCount },
              { id: 'zones', label: 'Zones', count: zoneCount },
              { id: 'tariffs', label: 'Tariffs', count: tariffCount },
              { id: 'trips', label: 'Trips', count: tripCount },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                  activeFilter === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
            <div className="w-full sm:w-80">
              <Input
                placeholder="Search archive by ID, name, reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs h-9 bg-slate-50"
              />
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto shrink-0">
              <span className="text-xs font-semibold text-slate-500">
                {filteredRecords.length} archived record{filteredRecords.length === 1 ? '' : 's'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={loadAllArchives}
                className="text-xs font-semibold text-slate-700 bg-white shadow-2xs"
              >
                Refresh
              </Button>
            </div>
          </div>

          {/* Mobile Archive Cards (< md) */}
          <div className="md:hidden space-y-2.5">
            {filteredRecords.length === 0 ? (
              <div className="py-12 text-center text-slate-400 rounded-xl border border-slate-200 bg-slate-50/40">
                <ArchiveBoxIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <div className="font-bold text-slate-600 text-sm">No Archived Items Found</div>
                <div className="text-xs mt-1 px-4">
                  {searchQuery
                    ? 'No items matched your search filter.'
                    : 'There are currently no records archived under this category.'}
                </div>
              </div>
            ) : (
              filteredRecords.map((item) => (
                <div
                  key={`${item.entityType}-${item.entityId}`}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {getTypeIcon(item.entityType)}
                      {getTypeBadge(item.entityType)}
                    </div>
                    <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                      ARCHIVED
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="font-extrabold text-slate-900 text-sm truncate">
                      {item.displayName || item.entityId}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 truncate">
                      ID: {item.entityId}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-600 space-y-1">
                    <div>{item.archiveReason || 'Archived by administrator'}</div>
                    <div className="text-[10px] text-slate-400">
                      {item.archivedAt ? new Date(item.archivedAt).toLocaleString() : 'Unknown date'}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestore(item)}
                    disabled={isRestoring === item.entityId}
                    className="w-full justify-center font-bold text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 shadow-2xs h-8 text-xs gap-1.5"
                  >
                    {isRestoring === item.entityId ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckIcon className="w-3.5 h-3.5" />
                    )}
                    <span>Restore to Active</span>
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Desktop Archive Table (md+) */}
          <div className="hidden md:block overflow-x-auto custom-scrollbar rounded-xl border border-slate-200 min-w-full">
            <table className="w-full text-left text-xs min-w-[700px]">
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
