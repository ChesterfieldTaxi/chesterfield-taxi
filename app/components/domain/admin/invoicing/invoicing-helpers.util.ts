import type {
  AppSettings,
  InvoiceRecord,
  NormalizedBillingSettingsConfig,
} from '../../../../core/types/config';
import type { CorporateUnbilledTransaction } from '../../../../core/types/invoicing';
import { getEmailDispatchService } from '../../../../core/services/email';
import { getPayLinkService } from '../../../../core/services/payments/pay-link.service';

export function triggerInvoicingBrowserDownload(
  data: BlobPart,
  mimeType: string,
  fileName: string
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function buildQuickBooksArCsv(txs: ReadonlyArray<CorporateUnbilledTransaction>): string {
  const headers = [
    'Transaction Date',
    'Account Number',
    'Corporate Client',
    'Passenger Name',
    'Pickup Address',
    'Dropoff Address',
    'Base Fare',
    'Gratuity',
    'Tolls',
    'Wait Time',
    'Discount',
    'Net Total',
    'Status',
    'Invoice Number',
    'QuickBooks Account Code',
  ];
  const rows = txs.map((t) => [
    t.pickupDate,
    `"${t.accountNumber || ''}"`,
    `"${t.corporateAccountName || ''}"`,
    `"${t.passengerName || ''}"`,
    `"${(t.pickupAddress || '').replace(/"/g, '""')}"`,
    `"${(t.dropoffAddress || '').replace(/"/g, '""')}"`,
    t.baseFare.toFixed(2),
    t.gratuity.toFixed(2),
    t.tolls.toFixed(2),
    t.waitTimeFee.toFixed(2),
    t.discountAmount.toFixed(2),
    t.totalAmount.toFixed(2),
    t.status,
    t.invoiceId || 'Unbilled',
    '1200-AccountsReceivable',
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export async function dispatchCorporateInvoiceEmailWithPayLink(params: {
  inv: InvoiceRecord;
  settings: AppSettings;
  billingDraft: NormalizedBillingSettingsConfig;
}): Promise<{ success: boolean; error?: string }> {
  const { inv, settings, billingDraft } = params;
  let resolvedPayUrl = inv.payLinkUrl;
  if (inv.status !== 'paid' && !resolvedPayUrl) {
    const payRes = await getPayLinkService().createOrGetInvoicePayLink(inv, {
      expiresInHours: billingDraft.payLinkExpiryHours,
      allowTip: billingDraft.payLinkAllowTipOnInvoices,
      billingSettings: billingDraft,
    });
    if (payRes.success && payRes.payUrl) resolvedPayUrl = payRes.payUrl;
  }

  return getEmailDispatchService().sendCorporateInvoice({
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    issuedDate: inv.issuedDate,
    dueDate: inv.dueDate,
    billingCycle: inv.billingCycle,
    customerName: inv.customerName,
    customerEmail: inv.customerEmail,
    accountNumber: inv.accountNumber,
    lineItems: inv.lineItems.map((li) => ({
      date: li.date || inv.issuedDate,
      passengerName: li.passengerName,
      description: li.description,
      poNumber: li.poNumber,
      amount: li.amount,
    })),
    subtotal: inv.subtotal ?? inv.totalAmount,
    discountAmount: inv.discountAmount ?? 0,
    totalAmount: inv.totalAmount,
    notes: inv.notes,
    payLinkUrl: inv.status !== 'paid' ? resolvedPayUrl : undefined,
    companySettings: {
      name: settings.company?.name,
      phone: settings.company?.phone,
      address: settings.company?.address,
      email: settings.company?.email,
    },
  });
}
