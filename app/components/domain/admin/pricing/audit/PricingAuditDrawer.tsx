import React from 'react';
import type { SurchargesConfig } from '~/core/types/config';
import type {
  PricingAuditEvent,
  PricingAuditFilterMode,
} from '~/core/types/pricing-audit';
import { exportPricingAuditCsv } from '~/core/services/pricing/pricing-audit.service';
import { AdminSlideOverDrawer } from '../../AdminSlideOverDrawer';
import { Button } from '~/components/ui/Button';
import { Badge } from '~/components/ui/Badge';
import { DownloadIcon } from '~/components/ui/Icons';
import { PricingAuditPanel } from './PricingAuditPanel';

export interface PricingAuditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  events: PricingAuditEvent[];
  surcharges: SurchargesConfig;
  initialFilterMode?: PricingAuditFilterMode;
  initialSurchargeId?: string;
  onUpdateNote: (eventId: string, note: string) => Promise<void>;
}

export function PricingAuditDrawer({
  isOpen,
  onClose,
  events,
  surcharges,
  initialFilterMode = 'all',
  initialSurchargeId = '',
  onUpdateNote,
}: PricingAuditDrawerProps) {
  const handleExportAllCsv = () => {
    if (typeof window === 'undefined') return;
    const csv = exportPricingAuditCsv(events);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chesterfield-pricing-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <AdminSlideOverDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Pricing & Surcharge Audit Trail"
      subtitle="Staff-only history of surcharge On/Off toggles, active durations, rate updates & firewall rules"
      size="xl"
      headerBadge={
        <Badge
          variant="outline"
          className="text-[10px] font-mono bg-slate-100 text-slate-700 border-slate-200"
        >
          {events.length} events
        </Badge>
      }
      footer={
        <div className="w-full flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 truncate">
            Stored securely in staff-only <code>/config/pricingAuditLog</code>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={events.length === 0}
              onClick={handleExportAllCsv}
              className="h-8 text-xs bg-white border-slate-300 text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <DownloadIcon className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
              Export CSV
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
            >
              Done
            </Button>
          </div>
        </div>
      }
    >
      <PricingAuditPanel
        events={events}
        surcharges={surcharges}
        initialFilterMode={initialFilterMode}
        initialSurchargeId={initialSurchargeId}
        onUpdateNote={onUpdateNote}
        syncTrigger={isOpen}
      />
    </AdminSlideOverDrawer>
  );
}
