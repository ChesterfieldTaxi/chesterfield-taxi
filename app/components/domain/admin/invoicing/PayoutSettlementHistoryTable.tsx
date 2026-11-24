import React from 'react';
import type {
  PayoutSettlementRecord,
  PayoutSettlementStatus,
} from '../../../../core/types/config';
import { resolvePayoutLedgerMapping } from '../../../../core/services/payouts.service';
import { Card, CardHeader, CardTitle, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';

export interface PayoutSettlementHistoryTableProps {
  payoutSettlements: PayoutSettlementRecord[];
  isSaving: boolean;
  onUpdateSettlementStatus: (
    settlementId: string,
    nextStatus: PayoutSettlementStatus,
    referenceNumber?: string
  ) => Promise<void>;
}

export function PayoutSettlementHistoryTable({
  payoutSettlements,
  isSaving,
  onUpdateSettlementStatus,
}: PayoutSettlementHistoryTableProps) {
  return (
    <Card className="border border-slate-200/90 shadow-xs overflow-hidden">
      <CardHeader className="pb-2.5 border-b border-slate-100">
        <CardTitle className="text-sm font-black text-slate-900">
          Payout Settlement History ({payoutSettlements.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[720px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Period</th>
              <th className="px-3 py-2.5">Payee</th>
              <th className="px-3 py-2.5">GL Account</th>
              <th className="px-3 py-2.5">Method / Ref</th>
              <th className="px-3 py-2.5 text-right">Net Payout</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Workflow</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payoutSettlements.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
                  {s.periodStart} &rarr; {s.periodEnd}
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-bold text-slate-900">{s.payeeName}</span>{' '}
                  <span className="text-[10px] text-slate-500">({s.payeeRoleLabel})</span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-slate-700">
                  {resolvePayoutLedgerMapping(s.payeeType).accountCode}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                  {s.paymentMethod.toUpperCase()}
                  {s.referenceNumber ? ` · ${s.referenceNumber}` : ''}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-black text-slate-900">
                  ${s.netPayoutAmount.toFixed(2)}
                </td>
                <td className="px-3 py-2.5">
                  <Badge
                    variant={
                      s.status === 'paid'
                        ? 'success'
                        : s.status === 'approved'
                        ? 'primary'
                        : 'warning'
                    }
                    size="sm"
                    className="text-[10px] uppercase"
                  >
                    {s.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right space-x-1.5">
                  {s.status === 'pending' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => onUpdateSettlementStatus(s.id, 'approved')}
                      className="text-[10px] py-1 h-auto font-bold"
                    >
                      Approve
                    </Button>
                  )}
                  {s.status !== 'paid' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={isSaving}
                      onClick={() => onUpdateSettlementStatus(s.id, 'paid')}
                      className="text-[10px] py-1 h-auto font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Mark Paid
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {payoutSettlements.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No payout settlements recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
