import React, { useState, useEffect } from 'react';
import type {
  AppSettings,
  CorporateAccountConfig,
  InvoiceRecord,
} from '../../../../core/types/config';
import { getInvoicingService } from '../../../../core/services/invoicing.service';
import type {
  FinancialLedgerEntry,
  AccountingExportFormat,
  PrintableInvoiceData,
} from '../../../../core/types/invoicing';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Alert } from '../../../ui/Alert';
import {
  SpinnerIcon,
  FileTextIcon,
  BuildingIcon,
  CreditCardIcon,
  PlusIcon,
  DownloadIcon,
  CheckIcon,
  DollarSignIcon,
  BarChartIcon,
  PhoneIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
  LockIcon,
} from '../../../ui/Icons';

export type InvoicingSubTab = 'ledger' | 'accounts' | 'accounting-sync' | 'gateways' | 'telephony';

interface AdminInvoicingSubpageProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialSubTab?: InvoicingSubTab;
}

export function AdminInvoicingSubpage({
  settings,
  onSave,
  isLoading = false,
  initialSubTab = 'ledger',
}: AdminInvoicingSubpageProps) {
  const [activeSub, setActiveSub] = useState<InvoicingSubTab>(initialSubTab || 'ledger');

  useEffect(() => {
    if (initialSubTab) {
      setActiveSub(initialSubTab);
    }
  }, [initialSubTab]);

  // Invoices & Corporate state from settings
  const invoices = settings.invoices || [];
  const corporateAccounts = settings.corporateAccounts || [];

  // Local state for modal / forms
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [isNewInvoiceModalOpen, setIsNewInvoiceModalOpen] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // New Corporate Account Form State
  const [newCorpName, setNewCorpName] = useState('');
  const [newCorpAccountNum, setNewCorpAccountNum] = useState('');
  const [newCorpCycle, setNewCorpCycle] = useState<'net15' | 'net30' | 'net60' | 'immediate'>('net30');
  const [newCorpLimit, setNewCorpLimit] = useState(10000);
  const [newCorpContactName, setNewCorpContactName] = useState('');
  const [newCorpContactEmail, setNewCorpContactEmail] = useState('');
  const [newCorpDiscount, setNewCorpDiscount] = useState(10);
  const [newCorpPoRequired, setNewCorpPoRequired] = useState(false);

  // New Invoice Form State
  const [newInvCustomer, setNewInvCustomer] = useState('');
  const [newInvEmail, setNewInvEmail] = useState('');
  const [newInvCorpId, setNewInvCorpId] = useState('');
  const [newInvAmount, setNewInvAmount] = useState(150);
  const [newInvDescription, setNewInvDescription] = useState('Airport Executive Transport');
  const [newInvDueDays, setNewInvDueDays] = useState(30);

  // Payment Gateways config state
  const [stripeTerminalEnabled, setStripeTerminalEnabled] = useState(true);
  const [passCardSurcharge, setPassCardSurcharge] = useState(false);
  const [surchargePercent, setSurchargePercent] = useState(3.0);
  const [autoEmailReceipts, setAutoEmailReceipts] = useState(true);

  // Stripe Gateway Credentials
  const [stripeMode, setStripeMode] = useState<'test' | 'live'>(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_stripe_mode') === 'live') ? 'live' : 'test';
  });
  const [stripePk, setStripePk] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_stripe_pk')) || '';
  });
  const [stripeSk, setStripeSk] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_stripe_sk')) || '';
  });
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_stripe_webhook')) || '';
  });
  const [stripeStatus, setStripeStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [stripeStatusMsg, setStripeStatusMsg] = useState<string | null>(null);

  // Square Gateway Credentials
  const [squareAppId, setSquareAppId] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_square_appid')) || '';
  });
  const [squareToken, setSquareToken] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_square_token')) || '';
  });
  const [squareLocId, setSquareLocId] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_square_locid')) || '';
  });
  const [squareStatus, setSquareStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [squareStatusMsg, setSquareStatusMsg] = useState<string | null>(null);

  // Twilio Telephony Credentials
  const [twilioSid, setTwilioSid] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_sid')) || '';
  });
  const [twilioToken, setTwilioToken] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_token')) || '';
  });
  const [twilioPhone, setTwilioPhone] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_twilio_phone')) || '+13145550199';
  });
  const [twilioStatus, setTwilioStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [twilioStatusMsg, setTwilioStatusMsg] = useState<string | null>(null);

  // Live Outbound Phone Call Tester
  const [testCallPhone, setTestCallPhone] = useState('');
  const [testCallStatus, setTestCallStatus] = useState<'idle' | 'calling' | 'success' | 'error'>('idle');
  const [testCallMsg, setTestCallMsg] = useState<string | null>(null);

  // Live SMS Tester
  const [testSmsPhone, setTestSmsPhone] = useState('');
  const [testSmsBody, setTestSmsBody] = useState('Hello! Your Chesterfield Taxi ride is confirmed.');
  const [testSmsStatus, setTestSmsStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [testSmsMsg, setTestSmsMsg] = useState<string | null>(null);

  // QuickBooks Settings State
  const [qbClientId, setQbClientId] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_qb_client_id')) || '';
  });
  const [qbClientSecret, setQbClientSecret] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_qb_client_secret')) || '';
  });
  const [qbRealmId, setQbRealmId] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('ct_qb_realm_id')) || '';
  });

  // Accounting Sync & Ledger State
  const [ledgerEntries, setLedgerEntries] = useState<FinancialLedgerEntry[]>([]);
  const [ledgerFilter, setLedgerFilter] = useState<'all' | '30d' | '7d' | 'today'>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [printableData, setPrintableData] = useState<PrintableInvoiceData | null>(null);

  useEffect(() => {
    const fetchLedger = async () => {
      const invoicingService = getInvoicingService();
      const entries = await invoicingService.getLedgerEntries();
      setLedgerEntries(entries);
    };
    fetchLedger();
  }, [activeSub]);

  useEffect(() => {
    if (selectedInvoice) {
      const fetchPrintable = async () => {
        const invoicingService = getInvoicingService();
        const data = await invoicingService.getPrintableInvoice(selectedInvoice.id);
        setPrintableData(data);
      };
      fetchPrintable();
    } else {
      setPrintableData(null);
    }
  }, [selectedInvoice]);

  const handleExport = async (format: AccountingExportFormat) => {
    try {
      setIsExporting(true);
      const invoicingService = getInvoicingService();
      const exportData = await invoicingService.exportLedger(format);
      const blob = new Blob([exportData.data], { type: exportData.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportData.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSaveSuccessMessage(`Successfully exported ${exportData.recordCount} transactions (${exportData.fileName})`);
      setTimeout(() => setSaveSuccessMessage(null), 3500);
    } catch (e: any) {
      console.error('Export error:', e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleRunBatchInvoicing = async (corp: CorporateAccountConfig) => {
    try {
      setIsSaving(true);
      const invoicingService = getInvoicingService();
      const batchInvoice = await invoicingService.generateBatchInvoiceForCorporate(corp.id, [
        {
          id: `tr-${Date.now().toString().slice(-4)}`,
          pickupLocation: { address: 'Chesterfield Mall Transit Hub, Chesterfield, MO' },
          dropoffLocation: { address: 'Lambert St. Louis International Airport (STL)' },
          passenger: { firstName: corp.companyName, lastName: 'Executive', phone: '314-555-0199', email: corp.billingContactEmail },
          vehicleTier: 'standard',
          pricing: { baseFare: 15, distanceCost: 45, timeCost: 10, totalFare: 70 },
          payment: { method: 'corporate', status: 'pending', amount: 70 },
          status: 'completed',
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any,
      ]);

      if (batchInvoice) {
        const updatedInvoices = [batchInvoice, ...invoices];
        await onSave({ invoices: updatedInvoices });
        setSaveSuccessMessage(`Generated batch statement ${batchInvoice.invoiceNumber} for ${corp.companyName}`);
        setTimeout(() => setSaveSuccessMessage(null), 3500);
      }
    } catch (err) {
      console.error('Failed to run batch invoicing:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Summary Metrics
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalOutstanding = totalInvoiced - totalPaid;

  const handleAddCorporateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCorpName || !newCorpContactEmail) return;

    try {
      setIsSaving(true);
      const newAccount: CorporateAccountConfig = {
        id: `corp-${Date.now().toString(36)}`,
        companyName: newCorpName,
        accountNumber: newCorpAccountNum || `CORP-${Date.now().toString().slice(-4)}`,
        billingCycle: newCorpCycle,
        creditLimit: newCorpLimit,
        billingContactName: newCorpContactName || 'Accounts Payable',
        billingContactEmail: newCorpContactEmail,
        discountPercent: newCorpDiscount,
        poRequired: newCorpPoRequired,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      const updatedAccounts = [...corporateAccounts, newAccount];
      await onSave({ corporateAccounts: updatedAccounts });

      setSaveSuccessMessage(`Corporate account "${newCorpName}" successfully registered.`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
      setIsNewAccountModalOpen(false);

      // Reset form
      setNewCorpName('');
      setNewCorpAccountNum('');
      setNewCorpContactName('');
      setNewCorpContactEmail('');
    } catch (err: any) {
      console.error('Failed to add corporate account:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvCustomer || !newInvEmail) return;

    try {
      setIsSaving(true);
      const dueDate = new Date(Date.now() + newInvDueDays * 86400000).toISOString().slice(0, 10);
      const newInvoice: InvoiceRecord = {
        id: `inv-${Date.now().toString(36)}`,
        invoiceNumber: `INV-2026-${(invoices.length + 101).toString()}`,
        corporateAccountId: newInvCorpId || undefined,
        customerName: newInvCustomer,
        customerEmail: newInvEmail,
        tripIds: [],
        totalAmount: Number(newInvAmount),
        status: 'issued',
        issuedDate: new Date().toISOString().slice(0, 10),
        dueDate,
        lineItems: [{ description: newInvDescription, amount: Number(newInvAmount) }],
      };

      const updatedInvoices = [newInvoice, ...invoices];
      await onSave({ invoices: updatedInvoices });

      setSaveSuccessMessage(`Invoice #${newInvoice.invoiceNumber} created and dispatched.`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
      setIsNewInvoiceModalOpen(false);
    } catch (err: any) {
      console.error('Failed to create invoice:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInvoiceStatusUpdate = async (invoiceId: string, newStatus: 'paid' | 'overdue' | 'issued' | 'draft') => {
    try {
      setIsSaving(true);
      const updatedInvoices = invoices.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              status: newStatus,
              paidDate: newStatus === 'paid' ? new Date().toISOString().slice(0, 10) : inv.paidDate,
            }
          : inv
      );
      await onSave({ invoices: updatedInvoices });
      if (selectedInvoice?.id === invoiceId) {
        setSelectedInvoice({
          ...selectedInvoice,
          status: newStatus,
        });
      }
      setSaveSuccessMessage(`Invoice marked as ${newStatus.toUpperCase()}.`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to update invoice status:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveApiCredentials = (category: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ct_stripe_mode', stripeMode);
      localStorage.setItem('ct_stripe_pk', stripePk.trim());
      localStorage.setItem('ct_stripe_sk', stripeSk.trim());
      localStorage.setItem('ct_stripe_webhook', stripeWebhookSecret.trim());
      localStorage.setItem('ct_square_appid', squareAppId.trim());
      localStorage.setItem('ct_square_token', squareToken.trim());
      localStorage.setItem('ct_square_locid', squareLocId.trim());
      localStorage.setItem('ct_twilio_sid', twilioSid.trim());
      localStorage.setItem('ct_twilio_token', twilioToken.trim());
      localStorage.setItem('ct_twilio_phone', twilioPhone.trim());
      localStorage.setItem('ct_qb_client_id', qbClientId.trim());
      localStorage.setItem('ct_qb_client_secret', qbClientSecret.trim());
      localStorage.setItem('ct_qb_realm_id', qbRealmId.trim());
    }
    setSaveSuccessMessage(`${category} credentials and configurations saved successfully!`);
    setTimeout(() => setSaveSuccessMessage(null), 3500);
  };

  const handleTestStripe = async () => {
    setStripeStatus('checking');
    setStripeStatusMsg('Authenticating with Stripe API...');
    try {
      const resp = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_processor',
          processor: 'stripe',
          credentials: { stripeSecretKey: stripeSk.trim() },
        }),
      });
      const data = (await resp.json()) as any;
      if (data.success) {
        setStripeStatus('connected');
        setStripeStatusMsg(data.message || 'Stripe connected successfully!');
      } else {
        setStripeStatus('error');
        setStripeStatusMsg(data.error || data.message || 'Stripe connection failed.');
      }
    } catch (err: any) {
      setStripeStatus('error');
      setStripeStatusMsg(err.message || 'Network error connecting to Stripe.');
    }
  };

  const handleTestSquare = async () => {
    setSquareStatus('checking');
    setSquareStatusMsg('Authenticating with Square API...');
    try {
      const resp = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_processor',
          processor: 'square',
          credentials: { squareAccessToken: squareToken.trim() },
        }),
      });
      const data = (await resp.json()) as any;
      if (data.success) {
        setSquareStatus('connected');
        setSquareStatusMsg(data.message || 'Square connected successfully!');
      } else {
        setSquareStatus('error');
        setSquareStatusMsg(data.error || data.message || 'Square connection failed.');
      }
    } catch (err: any) {
      setSquareStatus('error');
      setSquareStatusMsg(err.message || 'Network error connecting to Square.');
    }
  };

  const handleTestTwilioCreds = async () => {
    setTwilioStatus('checking');
    setTwilioStatusMsg('Connecting to Twilio Accounts API...');
    try {
      const resp = await fetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_credentials',
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim(),
            phoneNumber: twilioPhone.trim(),
          },
        }),
      });
      const data = (await resp.json()) as any;
      if (data.success) {
        setTwilioStatus('connected');
        setTwilioStatusMsg(data.message || 'Twilio account authenticated successfully!');
      } else {
        setTwilioStatus('error');
        setTwilioStatusMsg(data.error || data.message || 'Twilio authentication failed.');
      }
    } catch (err: any) {
      setTwilioStatus('error');
      setTwilioStatusMsg(err.message || 'Network error communicating with Twilio.');
    }
  };

  const handlePlaceTestCall = async () => {
    if (!testCallPhone.trim()) {
      setTestCallStatus('error');
      setTestCallMsg('Please enter a destination phone number to call.');
      return;
    }
    setTestCallStatus('calling');
    setTestCallMsg(`Placing outbound voice call to ${testCallPhone}...`);
    try {
      const resp = await fetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'make_call',
          to: testCallPhone.trim(),
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim(),
            phoneNumber: twilioPhone.trim(),
          },
        }),
      });
      const data = (await resp.json()) as any;
      if (data.success) {
        setTestCallStatus('success');
        setTestCallMsg(data.message || `Call initiated! Call SID: ${data.callSid}. Your phone should ring shortly.`);
      } else {
        setTestCallStatus('error');
        setTestCallMsg(data.message || data.error || 'Failed to place call via Twilio.');
      }
    } catch (err: any) {
      setTestCallStatus('error');
      setTestCallMsg(err.message || 'Network error placing phone call.');
    }
  };

  const handleSendTestSms = async () => {
    if (!testSmsPhone.trim()) {
      setTestSmsStatus('error');
      setTestSmsMsg('Please enter a recipient phone number for the test SMS.');
      return;
    }
    setTestSmsStatus('sending');
    setTestSmsMsg(`Dispatching SMS to ${testSmsPhone}...`);
    try {
      const resp = await fetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: testSmsPhone.trim(),
          body: testSmsBody.trim(),
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim(),
            phoneNumber: twilioPhone.trim(),
          },
        }),
      });
      const data = (await resp.json()) as any;
      if (data.success) {
        setTestSmsStatus('success');
        setTestSmsMsg(data.message || `SMS sent! Message SID: ${data.messageSid}. Check your phone.`);
      } else {
        setTestSmsStatus('error');
        setTestSmsMsg(data.message || data.error || 'Failed to send SMS via Twilio.');
      }
    } catch (err: any) {
      setTestSmsStatus('error');
      setTestSmsMsg(err.message || 'Network error sending SMS.');
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Invoicing Contextual Action Bar ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="text-xs font-bold text-slate-700 px-2 flex items-center gap-2">
          {activeSub === 'ledger' && (
            <>
              <FileTextIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Invoices &amp; Billing Ledger ({invoices.length} invoices)</span>
            </>
          )}
          {activeSub === 'accounts' && (
            <>
              <BuildingIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Corporate Direct Billing ({corporateAccounts.length} clients)</span>
            </>
          )}
          {activeSub === 'gateways' && (
            <>
              <CreditCardIcon className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Payment Gateway Terminals &amp; Processors</span>
            </>
          )}
          {activeSub === 'accounting-sync' && (
            <>
              <BarChartIcon className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>QuickBooks &amp; General Ledger Accounting Sync</span>
            </>
          )}
          {activeSub === 'telephony' && (
            <>
              <PhoneIcon className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Twilio Telephony &amp; Voice Gateway</span>
            </>
          )}
        </div>

        {activeSub === 'ledger' && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsNewInvoiceModalOpen(true)}
            leftIcon={<PlusIcon className="w-4 h-4" />}
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow-sm active:scale-95"
          >
            Generate Invoice
          </Button>
        )}

        {activeSub === 'accounts' && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsNewAccountModalOpen(true)}
            leftIcon={<PlusIcon className="w-4 h-4" />}
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow-sm active:scale-95"
          >
            Add Corporate Client
          </Button>
        )}

        {activeSub === 'gateways' && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => handleSaveApiCredentials('Payment Gateway')}
            leftIcon={<CheckIcon className="w-4 h-4" />}
            className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs hover:shadow-sm active:scale-95"
          >
            Save Gateway Credentials
          </Button>
        )}

        {activeSub === 'telephony' && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => handleSaveApiCredentials('Twilio Telephony')}
            leftIcon={<CheckIcon className="w-4 h-4" />}
            className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs hover:shadow-sm active:scale-95"
          >
            Save Telephony Credentials
          </Button>
        )}

        {activeSub === 'accounting-sync' && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isExporting}
              onClick={() => handleExport('quickbooks_csv')}
              leftIcon={<DownloadIcon className="w-3.5 h-3.5" />}
              className="text-xs font-bold text-slate-700 hover:text-slate-900 border-slate-300"
            >
              QuickBooks CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isExporting}
              onClick={() => handleExport('quickbooks_iif')}
              leftIcon={<DownloadIcon className="w-3.5 h-3.5" />}
              className="text-xs font-bold text-slate-700 hover:text-slate-900 border-slate-300"
            >
              QuickBooks IIF
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isExporting}
              onClick={() => handleExport('general_ledger_json')}
              leftIcon={<DownloadIcon className="w-3.5 h-3.5" />}
              className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Export GL JSON
            </Button>
          </div>
        )}
      </div>

      {saveSuccessMessage && (
        <Alert variant="success" className="animate-in fade-in text-xs font-semibold">
          {saveSuccessMessage}
        </Alert>
      )}

      {/* ─── Metric KPI Badges ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Invoiced (All-Time)
          </span>
          <span className="text-xl font-black text-slate-900 mt-1 block">
            ${totalInvoiced.toFixed(2)}
          </span>
          <span className="text-xs text-slate-500">{invoices.length} total generated statements</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
            Collected Revenue
          </span>
          <span className="text-xl font-black text-emerald-600 mt-1 block">
            ${totalPaid.toFixed(2)}
          </span>
          <span className="text-xs text-slate-500">Paid and reconciled</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">
            Outstanding / Net Accounts
          </span>
          <span className="text-xl font-black text-amber-600 mt-1 block">
            ${totalOutstanding.toFixed(2)}
          </span>
          <span className="text-xs text-slate-500">Awaiting payment reconciliation</span>
        </div>
      </div>

      {/* ─── Sub-View: Invoicing Ledger ─── */}
      {activeSub === 'ledger' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar min-w-full">
            <table className="w-full text-left text-xs min-w-[750px]">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Client / Organization</th>
                  <th className="px-4 py-3">Issued Date</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {inv.invoiceNumber}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-slate-800 block">{inv.customerName}</span>
                      <span className="text-[11px] text-slate-500">{inv.customerEmail}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{inv.issuedDate}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{inv.dueDate}</td>
                    <td className="px-4 py-3 font-black text-slate-900 whitespace-nowrap">
                      ${inv.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge
                        variant={
                          inv.status === 'paid'
                            ? 'success'
                            : inv.status === 'overdue'
                            ? 'error'
                            : 'warning'
                        }
                        size="sm"
                        className="font-bold uppercase text-[10px]"
                      >
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {inv.status !== 'paid' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleInvoiceStatusUpdate(inv.id, 'paid')}
                            className="text-[10px] px-2 py-1 text-emerald-700 bg-emerald-50 border-emerald-300 font-bold"
                          >
                            Mark Paid
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedInvoice(inv)}
                          className="text-[11px] px-2 py-1 text-slate-600 hover:text-slate-900 font-bold"
                        >
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Sub-View: Corporate Accounts ─── */}
      {activeSub === 'accounts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {corporateAccounts.map((acc) => (
              <Card key={acc.id} className="border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-black text-slate-900">
                        {acc.companyName}
                      </CardTitle>
                      <CardDescription className="text-xs font-mono font-bold text-blue-600">
                        {acc.accountNumber}
                      </CardDescription>
                    </div>
                    <Badge variant={acc.isActive ? 'success' : 'default'} size="sm" className="text-[10px]">
                      {acc.isActive ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Billing Terms:</span>
                    <span className="font-bold text-slate-800 uppercase">{acc.billingCycle}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Credit Limit:</span>
                    <span className="font-bold text-slate-800">${acc.creditLimit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Direct Discount:</span>
                    <span className="font-bold text-emerald-600">{acc.discountPercent}% Off</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">PO Required:</span>
                    <span className="font-bold text-slate-800">{acc.poRequired ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="pt-1 text-[11px] text-slate-500">
                    <p className="font-semibold text-slate-700">Contact: {acc.billingContactName}</p>
                    <p className="truncate">{acc.billingContactEmail}</p>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRunBatchInvoicing(acc)}
                      disabled={isSaving}
                      className="text-[11px] font-bold text-blue-600 border-blue-200 hover:bg-blue-50 w-full"
                    >
                      Run Direct Batch Statement
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── Sub-View: Payment Gateways & Terminals ─── */}
      {activeSub === 'gateways' && (
        <div className="space-y-6">
          {/* Top Info Banner */}
          <div className="bg-indigo-950 text-white p-5 rounded-2xl border border-indigo-900 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CreditCardIcon className="w-5 h-5 text-indigo-400" />
                <h3 className="font-extrabold text-base tracking-wide">Enterprise Payment Gateways &amp; Processing</h3>
              </div>
              <p className="text-xs text-indigo-200">
                PCI-DSS Level 1 compliant tokenized card vaulting, automatic pre-auth hold captures, and mobile driver terminal integration.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                stripeMode === 'live' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}>
                {stripeMode === 'live' ? '● Live Production' : '● Test Sandbox'}
              </span>
            </div>
          </div>

          {/* Stripe API Credentials Card */}
          <Card className="border border-slate-200/90 shadow-xs">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Stripe API &amp; Elements Vault</span>
                  <Badge variant="primary">Primary Processor</Badge>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Used for public booking card pre-authorizations, passenger tokenization, and driver app captures
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStripeMode(stripeMode === 'live' ? 'test' : 'live')}
                  className={`text-xs px-3 py-1 rounded-lg border font-bold cursor-pointer transition-all ${
                    stripeMode === 'live'
                      ? 'bg-rose-50 border-rose-300 text-rose-700'
                      : 'bg-blue-50 border-blue-300 text-blue-700'
                  }`}
                >
                  Mode: {stripeMode === 'live' ? 'Switch to Test Sandbox' : 'Switch to Live'}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Stripe Publishable Key ({stripeMode === 'live' ? 'pk_live_...' : 'pk_test_...'})
                  </label>
                  <input
                    type="text"
                    value={stripePk}
                    onChange={(e) => setStripePk(e.target.value)}
                    placeholder={stripeMode === 'live' ? 'pk_live_51...' : 'pk_test_51...'}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Mounted inside client-side Stripe Elements for PCI card tokenization</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Stripe Restricted Secret Key ({stripeMode === 'live' ? 'sk_live_...' : 'sk_test_...'})
                  </label>
                  <input
                    type="password"
                    value={stripeSk}
                    onChange={(e) => setStripeSk(e.target.value)}
                    placeholder={stripeMode === 'live' ? 'sk_live_51...' : 'sk_test_51...'}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Server-side PaymentIntent pre-authorization and capture authority</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Stripe Webhook Signing Secret (whsec_...)
                </label>
                <input
                  type="password"
                  value={stripeWebhookSecret}
                  onChange={(e) => setStripeWebhookSecret(e.target.value)}
                  placeholder="whsec_..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Status Alert */}
              {stripeStatusMsg && (
                <div className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
                  stripeStatus === 'connected' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  stripeStatus === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                  'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                  <div className="flex items-center gap-2">
                    {stripeStatus === 'connected' && <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                    {stripeStatus === 'error' && <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0" />}
                    {stripeStatus === 'checking' && <SpinnerIcon className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
                    <span>{stripeStatusMsg}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={stripeStatus === 'checking'}
                  onClick={handleTestStripe}
                  className="text-xs font-bold text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                >
                  {stripeStatus === 'checking' ? 'Testing Connection...' : 'Verify Stripe API Connection'}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => handleSaveApiCredentials('Stripe Gateway')}
                  className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Save Stripe Keys
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Square POS & Terminal Card */}
          <Card className="border border-slate-200/90 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Square POS &amp; Terminal API</span>
                <Badge variant="neutral">Secondary / POS</Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Support for Square Terminal hardware reader devices and in-person card transactions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Square Application ID</label>
                  <input
                    type="text"
                    value={squareAppId}
                    onChange={(e) => setSquareAppId(e.target.value)}
                    placeholder="sq0idp-..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Square Access Token</label>
                  <input
                    type="password"
                    value={squareToken}
                    onChange={(e) => setSquareToken(e.target.value)}
                    placeholder="EAAA..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Location ID</label>
                  <input
                    type="text"
                    value={squareLocId}
                    onChange={(e) => setSquareLocId(e.target.value)}
                    placeholder="L..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>
              </div>

              {squareStatusMsg && (
                <div className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                  squareStatus === 'connected' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  squareStatus === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                  'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                  {squareStatus === 'connected' && <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                  {squareStatus === 'error' && <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0" />}
                  <span>{squareStatusMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={squareStatus === 'checking'}
                  onClick={handleTestSquare}
                  className="text-xs font-bold text-slate-700 border-slate-200 hover:bg-slate-50"
                >
                  Verify Square Connection
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => handleSaveApiCredentials('Square')}
                  className="text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white"
                >
                  Save Square Keys
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Surcharge & Terminal Operational Policies */}
          <Card className="border border-slate-200/90 shadow-xs">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-slate-900">
                Payment Policies &amp; Terminal Automation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">In-Vehicle Contactless / Chip Terminals</span>
                    <input
                      type="checkbox"
                      checked={stripeTerminalEnabled}
                      onChange={(e) => setStripeTerminalEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Allows passengers to pay inside the cab using contactless card readers, Apple Pay, and Google Pay.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">Pass Processing Surcharge to Customer</span>
                    <input
                      type="checkbox"
                      checked={passCardSurcharge}
                      onChange={(e) => setPassCardSurcharge(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Adds an itemized {surchargePercent}% surcharge fee to credit card transactions.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl flex items-center justify-between">
                <div>
                  <p className="font-bold text-blue-900 text-xs">Automatic Email Receipts</p>
                  <p className="text-[11px] text-blue-700">
                    Dispatches tax receipts automatically upon trip completion.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoEmailReceipts}
                  onChange={(e) => setAutoEmailReceipts(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Sub-View: Twilio Telephony & Voice/SMS Tester ─── */}
      {activeSub === 'telephony' && (
        <div className="space-y-6">
          {/* Top Banner */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <PhoneIcon className="w-5 h-5 text-rose-500" />
                <h3 className="font-extrabold text-base tracking-wide">Twilio Telephony &amp; Softphone Gateway</h3>
              </div>
              <p className="text-xs text-slate-300">
                PSTN telephone network calling, masked driver-passenger voice proxy relay, and automated SMS dispatch.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                twilioSid && twilioToken ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }`}>
                {twilioSid && twilioToken ? '● Twilio Active' : '○ Missing Credentials'}
              </span>
            </div>
          </div>

          {/* Twilio Cloud Credentials Card */}
          <Card className="border border-slate-200/90 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Twilio Account Credentials</span>
                <Badge variant="primary">Required for Real Phone Calling</Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Credentials from twilio.com/console required to place real PSTN voice calls and deliver SMS text messages to passenger cell phones.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Twilio Account SID (AC...)
                  </label>
                  <input
                    type="text"
                    value={twilioSid}
                    onChange={(e) => setTwilioSid(e.target.value)}
                    placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Twilio Auth Token
                  </label>
                  <input
                    type="password"
                    value={twilioToken}
                    onChange={(e) => setTwilioToken(e.target.value)}
                    placeholder="32-character auth token"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Twilio Phone Number (Caller ID)
                  </label>
                  <input
                    type="text"
                    value={twilioPhone}
                    onChange={(e) => setTwilioPhone(e.target.value)}
                    placeholder="+13145550199"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-rose-500"
                  />
                </div>
              </div>

              {twilioStatusMsg && (
                <div className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                  twilioStatus === 'connected' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  twilioStatus === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                  'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                  {twilioStatus === 'connected' && <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                  {twilioStatus === 'error' && <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0" />}
                  {twilioStatus === 'checking' && <SpinnerIcon className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
                  <span>{twilioStatusMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={twilioStatus === 'checking'}
                  onClick={handleTestTwilioCreds}
                  className="text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  Verify Twilio Credentials
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => handleSaveApiCredentials('Twilio Telephony')}
                  className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
                >
                  Save Twilio Keys
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Interactive Live PSTN Voice Call & SMS Tester */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Live Call Tester */}
            <Card className="border border-slate-200/90 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <PhoneIcon className="w-4 h-4 text-emerald-600" />
                  <span>Test Real Outbound Phone Call</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Enter your mobile phone number. Clicking this will trigger Twilio to physically ring your cell phone!
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Your Cell Phone Number
                  </label>
                  <input
                    type="tel"
                    value={testCallPhone}
                    onChange={(e) => setTestCallPhone(e.target.value)}
                    placeholder="e.g. (314) 555-0199 or +13145550199"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {testCallMsg && (
                  <div className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                    testCallStatus === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                    testCallStatus === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                    'bg-blue-50 border-blue-200 text-blue-800'
                  }`}>
                    {testCallStatus === 'success' && <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                    {testCallStatus === 'error' && <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0" />}
                    {testCallStatus === 'calling' && <SpinnerIcon className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
                    <span>{testCallMsg}</span>
                  </div>
                )}

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={testCallStatus === 'calling'}
                  onClick={handlePlaceTestCall}
                  leftIcon={testCallStatus === 'calling' ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : <PhoneIcon className="w-3.5 h-3.5" />}
                  className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white py-2.5"
                >
                  {testCallStatus === 'calling' ? 'Calling Your Phone...' : '📞 Ring My Cell Phone Now'}
                </Button>
              </CardContent>
            </Card>

            {/* Live SMS Tester */}
            <Card className="border border-slate-200/90 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Test Real SMS Dispatch</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Send a live SMS text message to verify passenger dispatch alerts and driver relay notifications.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Recipient Cell Phone Number
                  </label>
                  <input
                    type="tel"
                    value={testSmsPhone}
                    onChange={(e) => setTestSmsPhone(e.target.value)}
                    placeholder="e.g. (314) 555-0199 or +13145550199"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    SMS Message Body
                  </label>
                  <input
                    type="text"
                    value={testSmsBody}
                    onChange={(e) => setTestSmsBody(e.target.value)}
                    placeholder="Message text..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {testSmsMsg && (
                  <div className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                    testSmsStatus === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                    testSmsStatus === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                    'bg-blue-50 border-blue-200 text-blue-800'
                  }`}>
                    {testSmsStatus === 'success' && <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                    {testSmsStatus === 'error' && <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0" />}
                    {testSmsStatus === 'sending' && <SpinnerIcon className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
                    <span>{testSmsMsg}</span>
                  </div>
                )}

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={testSmsStatus === 'sending'}
                  onClick={handleSendTestSms}
                  className="w-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white py-2.5"
                >
                  {testSmsStatus === 'sending' ? 'Dispatching SMS...' : '💬 Send Test SMS to Cell Phone'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ─── Sub-View: Accounting Sync & General Ledger ─── */}
      {activeSub === 'accounting-sync' && (
        <div className="space-y-4">
          <Card className="border border-slate-200/90 shadow-xs">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 gap-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  QuickBooks &amp; General Ledger Transactions
                </CardTitle>
                <CardDescription className="text-xs">
                  Double-entry journal records for fares, tips, platform commission fees, driver disbursements, and tolls
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Period:</span>
                <select
                  value={ledgerFilter}
                  onChange={(e) => setLedgerFilter(e.target.value as any)}
                  className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800"
                >
                  <option value="all">All Available Records</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="today">Today Only</option>
                </select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs min-w-[750px]">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Account Code</th>
                      <th className="px-4 py-3">Reference / Trip</th>
                      <th className="px-4 py-3">Memo / Description</th>
                      <th className="px-4 py-3 text-right">Debit ($)</th>
                      <th className="px-4 py-3 text-right">Credit ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledgerEntries.map((entry) => {
                      const isCredit = entry.type === 'fare_revenue' || entry.type === 'platform_commission';
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">{entry.date}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                entry.type === 'fare_revenue'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : entry.type === 'driver_payout'
                                  ? 'bg-blue-100 text-blue-800'
                                  : entry.type === 'platform_commission'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : entry.type === 'tip_collected'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {entry.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">{entry.accountCode}</td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-blue-600">{entry.tripId || entry.invoiceId || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-700">{entry.description}</td>
                          <td className="px-4 py-2.5 font-mono text-right text-rose-600 font-bold whitespace-nowrap">
                            {!isCredit ? `$${entry.amount.toFixed(2)}` : '—'}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-right text-emerald-600 font-bold whitespace-nowrap">
                            {isCredit ? `$${entry.amount.toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Modal: New Corporate Account ─── */}
      {isNewAccountModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-black text-slate-900 text-base">Register Corporate Account</h3>
              <button
                type="button"
                onClick={() => setIsNewAccountModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCorporateAccount} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Company / Organization Name</label>
                <input
                  type="text"
                  required
                  value={newCorpName}
                  onChange={(e) => setNewCorpName(e.target.value)}
                  placeholder="e.g. Pfizer Chesterfield Labs"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Billing Terms</label>
                  <select
                    value={newCorpCycle}
                    onChange={(e) => setNewCorpCycle(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="net15">Net 15 Days</option>
                    <option value="net30">Net 30 Days</option>
                    <option value="net60">Net 60 Days</option>
                    <option value="immediate">Immediate Charge</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Credit Limit ($)</label>
                  <input
                    type="number"
                    value={newCorpLimit}
                    onChange={(e) => setNewCorpLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Billing Contact Name</label>
                  <input
                    type="text"
                    value={newCorpContactName}
                    onChange={(e) => setNewCorpContactName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Billing Email</label>
                  <input
                    type="email"
                    required
                    value={newCorpContactEmail}
                    onChange={(e) => setNewCorpContactEmail(e.target.value)}
                    placeholder="ap@company.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center pt-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Contract Discount (%)</label>
                  <input
                    type="number"
                    value={newCorpDiscount}
                    onChange={(e) => setNewCorpDiscount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="poReq"
                    checked={newCorpPoRequired}
                    onChange={(e) => setNewCorpPoRequired(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <label htmlFor="poReq" className="font-bold text-slate-700">Require PO #</label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsNewAccountModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSaving}
                  className="bg-blue-600 text-white font-bold"
                >
                  {isSaving ? 'Registering...' : 'Save Corporate Account'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal: New Invoice ─── */}
      {isNewInvoiceModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-black text-slate-900 text-base">Generate Direct Invoice</h3>
              <button
                type="button"
                onClick={() => setIsNewInvoiceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Select Corporate Account (Optional)</label>
                <select
                  value={newInvCorpId}
                  onChange={(e) => {
                    setNewInvCorpId(e.target.value);
                    const corp = corporateAccounts.find((c) => c.id === e.target.value);
                    if (corp) {
                      setNewInvCustomer(corp.companyName);
                      setNewInvEmail(corp.billingContactEmail);
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">Custom / Direct Customer</option>
                  {corporateAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.accountNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Customer / Organization Name</label>
                <input
                  type="text"
                  required
                  value={newInvCustomer}
                  onChange={(e) => setNewInvCustomer(e.target.value)}
                  placeholder="e.g. Bayer Travel Services"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Billing Email</label>
                <input
                  type="email"
                  required
                  value={newInvEmail}
                  onChange={(e) => setNewInvEmail(e.target.value)}
                  placeholder="billing@company.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Invoice Total ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newInvAmount}
                    onChange={(e) => setNewInvAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Payment Due In (Days)</label>
                  <input
                    type="number"
                    value={newInvDueDays}
                    onChange={(e) => setNewInvDueDays(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Primary Line Item Description</label>
                <input
                  type="text"
                  value={newInvDescription}
                  onChange={(e) => setNewInvDescription(e.target.value)}
                  placeholder="e.g. September Executive Airport Runs"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsNewInvoiceModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSaving}
                  className="bg-blue-600 text-white font-bold"
                >
                  {isSaving ? 'Issuing...' : 'Issue & Send Invoice'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal: Printable PDF Invoice Preview ─── */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 animate-in zoom-in-95 my-8">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-black text-xl text-slate-900 tracking-tight">
                  {COMPANY_CONFIG.name}
                </h3>
                <p className="text-xs text-slate-500">{COMPANY_CONFIG.address.formatted}</p>
                <p className="text-xs text-slate-500">Phone: {COMPANY_CONFIG.phone.dispatch} | Email: {COMPANY_CONFIG.email.dispatch}</p>
              </div>
              <div className="text-right">
                <span className="font-mono text-sm font-black text-blue-600 block">
                  {selectedInvoice.invoiceNumber}
                </span>
                <Badge
                  variant={
                    selectedInvoice.status === 'paid'
                      ? 'success'
                      : selectedInvoice.status === 'overdue'
                      ? 'error'
                      : 'warning'
                  }
                  size="sm"
                  className="font-bold uppercase text-[10px] mt-1"
                >
                  {selectedInvoice.status}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Billed To</span>
                <p className="font-bold text-slate-900 mt-1">{selectedInvoice.customerName}</p>
                <p className="text-slate-600">{selectedInvoice.customerEmail}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-500">Issued Date:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedInvoice.issuedDate}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-slate-500">Due Date:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedInvoice.dueDate}</span>
                </div>
                {selectedInvoice.paidDate && (
                  <div className="flex justify-between mt-1 text-emerald-600">
                    <span>Paid Date:</span>
                    <span className="font-mono font-bold">{selectedInvoice.paidDate}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5">Description</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedInvoice.lineItems.map((li, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2.5 text-slate-800 font-medium">{li.description}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                        ${li.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/80 font-bold border-t border-slate-200">
                  <tr>
                    <td className="px-4 py-3 text-right text-slate-600">Total Balance Due:</td>
                    <td className="px-4 py-3 text-right font-black text-sm text-slate-900 font-mono">
                      ${selectedInvoice.totalAmount.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Remittance Bank Info */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
              <p className="font-bold text-slate-800 text-xs">Remittance Information</p>
              <p>Bank: {printableData?.remittanceInfo.bankName || 'Commerce Bank of St. Louis'}</p>
              <p>Account Name: {printableData?.remittanceInfo.accountName || COMPANY_CONFIG.legalName}</p>
              <p>Routing: {printableData?.remittanceInfo.routingNumber || '081000601'} | Account: {printableData?.remittanceInfo.accountNumber || '••••••••4819'}</p>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <div className="text-xs text-slate-400">
                Chesterfield Taxi Billing Division
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedInvoice(null)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => window.print()}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  Print / Save PDF
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
