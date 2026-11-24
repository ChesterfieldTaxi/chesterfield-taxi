import React, { useState, useEffect } from 'react';
import { Button } from '../../../ui/Button';
import { Alert } from '../../../ui/Alert';
import {
  BuildingIcon,
  PlusIcon,
  DownloadIcon,
  BarChartIcon,
} from '../../../ui/Icons';
import {
  useAdminInvoicingActions,
  InvoiceLedgerTable,
  InvoiceBuilderModal,
  CorporateAccountsPanel,
  DriverPayoutsPanel,
  type InvoicingSubTab,
  type AdminInvoicingSubpageProps,
} from '../invoicing';

export type { InvoicingSubTab, AdminInvoicingSubpageProps };

export function AdminInvoicingSubpage({
  settings,
  onSave,
  isLoading: _isLoading = false,
  initialSubTab = 'ledger',
}: AdminInvoicingSubpageProps) {
  const [activeSub, setActiveSub] = useState<InvoicingSubTab>(initialSubTab || 'ledger');

  useEffect(() => {
    if (initialSubTab) {
      setActiveSub(initialSubTab);
    }
  }, [initialSubTab]);

  const actions = useAdminInvoicingActions({
    settings,
    onSave,
    activeSub,
  });

  return (
    <div className="space-y-5">
      {/* ─── Clean Sub-Tab Utility Bar (Only when Accounts or Accounting Sync needs top actions) ─── */}
      {(activeSub === 'accounts' || activeSub === 'accounting-sync') && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-white p-3 sm:px-4 sm:py-2.5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
            {activeSub === 'accounts' && (
              <>
                <BuildingIcon className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Corporate Direct Billing ({actions.corporateAccounts.length} clients)</span>
              </>
            )}
            {activeSub === 'accounting-sync' && (
              <>
                <BarChartIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>QuickBooks &amp; General Ledger Export</span>
              </>
            )}
          </div>

          {activeSub === 'accounts' && (
            <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => actions.setIsCsvModalOpen(true)}
                leftIcon={<DownloadIcon className="w-4 h-4 text-slate-600" />}
                className="text-xs font-semibold justify-center"
              >
                Import CSV
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => actions.setIsNewAccountModalOpen(true)}
                leftIcon={<PlusIcon className="w-4 h-4" />}
                className="text-xs font-bold justify-center"
              >
                Add Client
              </Button>
            </div>
          )}

          {activeSub === 'accounting-sync' && (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={actions.isExporting}
                onClick={() => actions.handleExport('quickbooks_csv')}
                leftIcon={<DownloadIcon className="w-3.5 h-3.5" />}
                className="text-xs font-semibold justify-center"
              >
                QuickBooks CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={actions.isExporting}
                onClick={() => actions.handleExport('quickbooks_iif')}
                leftIcon={<DownloadIcon className="w-3.5 h-3.5" />}
                className="text-xs font-semibold justify-center"
              >
                QuickBooks IIF
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={actions.isExporting}
                onClick={() => actions.handleExport('general_ledger_json')}
                leftIcon={<DownloadIcon className="w-3.5 h-3.5" />}
                className="col-span-2 sm:col-span-1 text-xs font-bold justify-center"
              >
                Export GL JSON
              </Button>
            </div>
          )}
        </div>
      )}

      {actions.saveSuccessMessage && (
        <Alert variant="success" className="animate-in fade-in text-xs font-semibold">
          {actions.saveSuccessMessage}
        </Alert>
      )}
      {actions.actionErrorMessage && (
        <Alert variant="error" className="animate-in fade-in text-xs font-semibold">
          {actions.actionErrorMessage}
        </Alert>
      )}

      {/* ─── Sub-View: Invoicing & Accounts Receivable Ledger + KPI Summary ─── */}
      {activeSub === 'ledger' && (
        <InvoiceLedgerTable
          invoices={actions.invoices}
          unbilledTransactions={actions.unbilledTransactions}
          selectedTxIds={actions.selectedTxIds}
          setSelectedTxIds={actions.setSelectedTxIds}
          arFilter={actions.arFilter}
          setArFilter={actions.setArFilter}
          ledgerViewMode={actions.ledgerViewMode}
          setLedgerViewMode={actions.setLedgerViewMode}
          totalUnbilledAR={actions.totalUnbilledAR}
          unbilledCount={actions.unbilledCount}
          overdue30DaysCount={actions.overdue30DaysInvoices.length}
          totalOverdue30Days={actions.totalOverdue30Days}
          settledThisMonthCount={actions.settledThisMonthInvoices.length}
          settledRevenueThisMonth={actions.settledRevenueThisMonth}
          totalInvoiced={actions.totalInvoiced}
          totalPaid={actions.totalPaid}
          isSaving={actions.isSaving}
          payLinkInvoiceBusyId={actions.payLinkInvoiceBusyId}
          onOpenNewInvoiceModal={() => actions.setIsNewInvoiceModalOpen(true)}
          onSelectInvoice={actions.setSelectedInvoice}
          onExportARForQuickBooks={actions.handleExportARForQuickBooks}
          onMarkARPaidSettled={actions.handleMarkARPaidSettled}
          onGenerateInvoiceFromAR={actions.handleGenerateInvoiceFromAR}
          onInvoicePayLink={actions.handleInvoicePayLink}
          onInvoiceStatusUpdate={actions.handleInvoiceStatusUpdate}
        />
      )}

      {/* ─── Sub-View: Corporate Accounts + PO Anti-Fraud & CSV Import Modals ─── */}
      <CorporateAccountsPanel
        activeSub={activeSub}
        settings={settings}
        corporateAccounts={actions.corporateAccounts}
        isSaving={actions.isSaving}
        copiedPoId={actions.copiedPoId}
        accountSearchTerm={actions.accountSearchTerm}
        setAccountSearchTerm={actions.setAccountSearchTerm}
        accountFilter={actions.accountFilter}
        setAccountFilter={actions.setAccountFilter}
        accountPage={actions.accountPage}
        setAccountPage={actions.setAccountPage}
        selectedPoAccount={actions.selectedPoAccount}
        setSelectedPoAccount={actions.setSelectedPoAccount}
        isRegeneratePoOpen={actions.isRegeneratePoOpen}
        setIsRegeneratePoOpen={actions.setIsRegeneratePoOpen}
        isPoHistoryOpen={actions.isPoHistoryOpen}
        setIsPoHistoryOpen={actions.setIsPoHistoryOpen}
        isCsvModalOpen={actions.isCsvModalOpen}
        setIsCsvModalOpen={actions.setIsCsvModalOpen}
        onCopyPo={actions.handleCopyPo}
        onTogglePoRequired={actions.handleTogglePoRequired}
        onRunBatchInvoicing={actions.handleRunBatchInvoicing}
        onPoRegenerateSuccess={actions.handlePoRegenerateSuccess}
        onCsvImportSuccess={actions.handleCsvImportSuccess}
      />

      {/* ─── Sub-Views: Payment Gateways, Driver & Staff Payouts, Policy/QuickBooks GL & Twilio Telephony ─── */}
      {(activeSub === 'payouts' ||
        activeSub === 'gateways' ||
        activeSub === 'telephony' ||
        activeSub === 'accounting-sync') && (
        <DriverPayoutsPanel
          activeSub={activeSub}
          isSaving={actions.isSaving}
          ledgerFilter={actions.ledgerFilter}
          setLedgerFilter={actions.setLedgerFilter}
          filteredLedgerEntries={actions.filteredLedgerEntries}
          stripeMode={actions.stripeMode}
          setStripeMode={actions.setStripeMode}
          stripePk={actions.stripePk}
          setStripePk={actions.setStripePk}
          stripeSk={actions.stripeSk}
          setStripeSk={actions.setStripeSk}
          stripeWebhookSecret={actions.stripeWebhookSecret}
          setStripeWebhookSecret={actions.setStripeWebhookSecret}
          stripeStatus={actions.stripeStatus}
          stripeStatusMsg={actions.stripeStatusMsg}
          squareAppId={actions.squareAppId}
          setSquareAppId={actions.setSquareAppId}
          squareToken={actions.squareToken}
          setSquareToken={actions.setSquareToken}
          squareLocId={actions.squareLocId}
          setSquareLocId={actions.setSquareLocId}
          squareStatus={actions.squareStatus}
          squareStatusMsg={actions.squareStatusMsg}
          stripeTerminalEnabled={actions.stripeTerminalEnabled}
          setStripeTerminalEnabled={actions.setStripeTerminalEnabled}
          passCardSurcharge={actions.passCardSurcharge}
          setPassCardSurcharge={actions.setPassCardSurcharge}
          surchargePercent={actions.surchargePercent}
          setSurchargePercent={actions.setSurchargePercent}
          autoEmailReceipts={actions.autoEmailReceipts}
          setAutoEmailReceipts={actions.setAutoEmailReceipts}
          driverCommissionPercent={actions.driverCommissionPercent}
          setDriverCommissionPercent={actions.setDriverCommissionPercent}
          onTestStripe={actions.handleTestStripe}
          onTestSquare={actions.handleTestSquare}
          onSaveApiCredentials={actions.handleSaveApiCredentials}
          onSaveBillingPolicies={actions.handleSaveBillingPolicies}
          twilioSid={actions.twilioSid}
          setTwilioSid={actions.setTwilioSid}
          twilioToken={actions.twilioToken}
          setTwilioToken={actions.setTwilioToken}
          twilioPhone={actions.twilioPhone}
          setTwilioPhone={actions.setTwilioPhone}
          twilioStatus={actions.twilioStatus}
          twilioStatusMsg={actions.twilioStatusMsg}
          testCallPhone={actions.testCallPhone}
          setTestCallPhone={actions.setTestCallPhone}
          testCallStatus={actions.testCallStatus}
          testCallMsg={actions.testCallMsg}
          testSmsPhone={actions.testSmsPhone}
          setTestSmsPhone={actions.setTestSmsPhone}
          testSmsBody={actions.testSmsBody}
          setTestSmsBody={actions.setTestSmsBody}
          testSmsStatus={actions.testSmsStatus}
          testSmsMsg={actions.testSmsMsg}
          onTestTwilioCreds={actions.handleTestTwilioCreds}
          onPlaceTestCall={actions.handlePlaceTestCall}
          onSendTestSms={actions.handleSendTestSms}
        />
      )}

      {/* ─── Modals: New Corporate Account, Direct Invoice Builder & Printable PDF Preview ─── */}
      <InvoiceBuilderModal
        settings={settings}
        corporateAccounts={actions.corporateAccounts}
        isSaving={actions.isSaving}
        isEmailingInvoice={actions.isEmailingInvoice}
        payLinkInvoiceBusyId={actions.payLinkInvoiceBusyId}
        isNewAccountModalOpen={actions.isNewAccountModalOpen}
        setIsNewAccountModalOpen={actions.setIsNewAccountModalOpen}
        newCorpName={actions.newCorpName}
        setNewCorpName={actions.setNewCorpName}
        newCorpCycle={actions.newCorpCycle}
        setNewCorpCycle={actions.setNewCorpCycle}
        newCorpLimit={actions.newCorpLimit}
        setNewCorpLimit={actions.setNewCorpLimit}
        newCorpContactName={actions.newCorpContactName}
        setNewCorpContactName={actions.setNewCorpContactName}
        newCorpContactEmail={actions.newCorpContactEmail}
        setNewCorpContactEmail={actions.setNewCorpContactEmail}
        newCorpDiscount={actions.newCorpDiscount}
        setNewCorpDiscount={actions.setNewCorpDiscount}
        newCorpPoRequired={actions.newCorpPoRequired}
        setNewCorpPoRequired={actions.setNewCorpPoRequired}
        onAddCorporateAccount={actions.handleAddCorporateAccount}
        isNewInvoiceModalOpen={actions.isNewInvoiceModalOpen}
        setIsNewInvoiceModalOpen={actions.setIsNewInvoiceModalOpen}
        newInvCorpId={actions.newInvCorpId}
        setNewInvCorpId={actions.setNewInvCorpId}
        newInvCustomer={actions.newInvCustomer}
        setNewInvCustomer={actions.setNewInvCustomer}
        newInvEmail={actions.newInvEmail}
        setNewInvEmail={actions.setNewInvEmail}
        newInvAmount={actions.newInvAmount}
        setNewInvAmount={actions.setNewInvAmount}
        newInvDueDays={actions.newInvDueDays}
        setNewInvDueDays={actions.setNewInvDueDays}
        newInvDescription={actions.newInvDescription}
        setNewInvDescription={actions.setNewInvDescription}
        onCreateInvoice={actions.handleCreateInvoice}
        selectedInvoice={actions.selectedInvoice}
        setSelectedInvoice={actions.setSelectedInvoice}
        printableData={actions.printableData}
        onInvoicePayLink={actions.handleInvoicePayLink}
        onEmailInvoice={actions.handleEmailInvoice}
      />
    </div>
  );
}
