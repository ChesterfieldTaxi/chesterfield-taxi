import React, { useState, useEffect } from 'react';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Input } from '../../ui/Input';
import {
  UserIcon,
  CarIcon,
  ShieldCheckIcon,
  MapPinIcon,
  HistoryIcon,
  CheckIcon,
  XIcon,
  SpinnerIcon,
} from '../../ui/Icons';
import {
  getUniversalGovernanceService,
  type GovernanceEntityType,
  type EntityGovernanceRecord,
} from '../../../core/services/governance/universal-governance.service';
import { useBottomSheetDragToClose } from '../../../core/hooks/useBottomSheetDragToClose';

export function ArchiveBoxIcon({ className = 'w-5 h-5', ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

export interface UniversalArchiveDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onEntityRestored?: (type: GovernanceEntityType, id: string) => void;
}

export function UniversalArchiveDrawer({
  isOpen,
  onClose,
  onEntityRestored,
}: UniversalArchiveDrawerProps) {
  const [selectedType, setSelectedType] = useState<GovernanceEntityType | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [archivedRecords, setArchivedRecords] = useState<EntityGovernanceRecord[]>([]);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadRecords = () => {
    const gov = getUniversalGovernanceService();
    const records = gov.getArchivedEntities();
    setArchivedRecords(records);
  };

  useEffect(() => {
    if (isOpen) {
      loadRecords();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRestore = async (record: EntityGovernanceRecord) => {
    setIsRestoring(record.entityId);
    try {
      const gov = getUniversalGovernanceService();
      await gov.setArchiveStatus(record.entityType, record.entityId, false);
      loadRecords();
      if (onEntityRestored) {
        onEntityRestored(record.entityType, record.entityId);
      }
      setToastMessage(`✓ ${record.entityType.toUpperCase()} #${record.entityId} restored from archive.`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      setToastMessage(`Error: ${err.message || 'Failed to restore'}`);
    } finally {
      setIsRestoring(null);
    }
  };

  const filteredRecords = archivedRecords.filter((r) => {
    if (selectedType !== 'all' && r.entityType !== selectedType) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.entityId.toLowerCase().includes(term) ||
      (r.blacklistReason || '').toLowerCase().includes(term) ||
      r.entityType.toLowerCase().includes(term)
    );
  });

  const getEntityIcon = (type: GovernanceEntityType) => {
    switch (type) {
      case 'trip':
        return <HistoryIcon className="w-4 h-4 text-blue-600" />;
      case 'passenger':
        return <UserIcon className="w-4 h-4 text-emerald-600" />;
      case 'driver':
      case 'staff':
        return <ShieldCheckIcon className="w-4 h-4 text-indigo-600" />;
      case 'vehicle':
        return <CarIcon className="w-4 h-4 text-amber-600" />;
      case 'location':
        return <MapPinIcon className="w-4 h-4 text-rose-600" />;
      default:
        return <ArchiveBoxIcon className="w-4 h-4 text-fg-secondary" />;
    }
  };

  const counts: Record<string, number> = {
    all: archivedRecords.length,
    trip: archivedRecords.filter((r) => r.entityType === 'trip').length,
    passenger: archivedRecords.filter((r) => r.entityType === 'passenger').length,
    driver: archivedRecords.filter((r) => r.entityType === 'driver' || r.entityType === 'staff').length,
    fleet_vehicle: archivedRecords.filter((r) => r.entityType === 'vehicle').length,
    location_geofence: archivedRecords.filter((r) => r.entityType === 'location').length,
  };

  const sheetDrag = useBottomSheetDragToClose({ onClose });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end bg-surface-overlay/60 backdrop-blur-xs animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={sheetDrag.sheetStyle}
        className="w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-none sm:h-full bg-surface-card rounded-t-3xl sm:rounded-none shadow-2xl flex flex-col border-t sm:border-t-0 sm:border-l border-border-subtle overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-right duration-200 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0"
      >
        {/* Header */}
        <div
          {...sheetDrag.dragHandlers}
          className="px-4 sm:px-5 pt-2.5 sm:pt-5 pb-3.5 sm:pb-5 border-b border-border-subtle bg-surface-subtle shrink-0 touch-none"
        >
          <div className="w-10 h-1 rounded-full bg-surface-strong mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 sm:p-2.5 bg-surface-emphasis text-fg-strong rounded-xl shrink-0">
                <ArchiveBoxIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-black text-fg-primary truncate">
                  Universal Archive &amp; Governance Center
                </h3>
                <p className="text-xs text-fg-muted font-medium truncate">
                  Soft-deleted entities across Trips, Passengers, Fleet, Drivers, and Zones
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close archive drawer"
              className="p-2 text-fg-subtle hover:text-fg-secondary rounded-lg hover:bg-surface-emphasis transition-colors shrink-0 cursor-pointer"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-border-subtle bg-surface-card flex flex-wrap gap-1.5">
          {[
            { key: 'all', label: 'All Records', count: counts.all },
            { key: 'trip', label: 'Trips', count: counts.trip },
            { key: 'passenger', label: 'Passengers', count: counts.passenger },
            { key: 'driver', label: 'Staff & Drivers', count: counts.driver },
            { key: 'vehicle', label: 'Vehicles', count: counts.fleet_vehicle },
            { key: 'location', label: 'Zones', count: counts.location_geofence },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSelectedType(tab.key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedType === tab.key
                  ? 'bg-surface-header text-white shadow-xs'
                  : 'bg-surface-muted text-fg-secondary hover:bg-surface-emphasis'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  selectedType === tab.key ? 'bg-surface-header-muted text-white' : 'bg-surface-emphasis text-fg-secondary'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-border-faint bg-surface-subtle/50 flex items-center gap-3">
          <Input
            type="text"
            placeholder="Search archived entity ID, phone, email, notes..."
            value={searchTerm}
            onChange={(e: any) => setSearchTerm(e.target.value)}
            className="text-xs bg-surface-card"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={loadRecords}
            className="text-xs shrink-0 font-bold"
          >
            Refresh
          </Button>
        </div>

        {/* Toast Feedback */}
        {toastMessage && (
          <div className="mx-4 mt-3 p-3 bg-status-success-bg border border-status-success-border text-status-success-fg text-xs font-bold rounded-xl animate-in fade-in">
            {toastMessage}
          </div>
        )}

        {/* List of Archived Records */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {filteredRecords.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <ArchiveBoxIcon className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-fg-secondary">No archived records found</p>
              <p className="text-xs text-fg-subtle max-w-xs mx-auto">
                Entities that are soft-deleted from active operations appear here for inspection and 1-click restoration.
              </p>
            </div>
          ) : (
            filteredRecords.map((record) => (
              <div
                key={`${record.entityType}-${record.entityId}`}
                className="p-4 rounded-xl border border-border-subtle bg-surface-card hover:border-border-strong transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {getEntityIcon(record.entityType)}
                    <Badge variant="neutral" size="sm" className="font-mono text-[10px] font-bold uppercase">
                      {record.entityType}
                    </Badge>
                    <span className="text-xs font-black text-fg-strong">
                      ID: #{record.entityId}
                    </span>
                    <Badge variant="outline" size="sm" className="text-[10px] text-fg-muted">
                      ARCHIVED
                    </Badge>
                  </div>

                  <p className="text-xs text-fg-muted pl-6">
                    {record.blacklistReason || 'Soft-deleted from operational view'}
                  </p>

                  <div className="text-[10px] text-fg-subtle pl-6 flex items-center gap-2">
                    <span>Archived: {new Date(record.updatedAt).toLocaleString()}</span>
                    <span>•</span>
                    <span>By: {record.updatedBy || 'admin'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pl-6 sm:pl-0 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isRestoring === record.entityId}
                    onClick={() => handleRestore(record)}
                    className="text-xs font-bold bg-surface-card hover:bg-status-success-bg hover:text-status-success-fg hover:border-status-success-border transition-colors"
                  >
                    {isRestoring === record.entityId ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    ) : (
                      <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    <span>Restore Entity</span>
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle bg-surface-subtle text-right">
          <Button variant="outline" size="sm" onClick={onClose} className="font-bold text-xs">
            Close Archive Drawer
          </Button>
        </div>
      </div>
    </div>
  );
}
