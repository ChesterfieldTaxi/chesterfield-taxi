import React, { useState, useEffect } from 'react';
import { Button } from '../../../ui/Button';
import { Alert } from '../../../ui/Alert';
import {
  BuildingIcon,
  PlusIcon,
  DownloadIcon,
} from '../../../ui/Icons';
import {
  useAdminInvoicingActions,
  InvoiceLedgerTable,
  InvoiceBuilderModal,
  CorporateAccountsPanel,
  DriverPayoutsPanel,
  StaffAndOtherPayeesTables,
  BillingPolicyAndQuickBooksPanel,
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
      {/* ─── Clean Sub-Tab Utility Bar for Corporate Billing ─── */}
      {activeSub === 'accounts' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-surface-card p-3 sm:px-4 sm:py-2.5 rounded-2xl border border-border-subtle/90 shadow-xs">
          <div className="text-xs font-bold text-fg-secondary flex items-center gap-2">
            <BuildingIcon className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Corporate Financial &amp; Credit Terms ({actions.corporateAccounts.length} clients)</span>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => actions.setIsCsvModalOpen(true)}
              leftIcon={<DownloadIcon className="w-4 h-4 text-fg-secondary" />}
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

      {/* ─── 1. Invoices & AR Ledger ─── */}
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

      {/* ─── 2. Corporate Billing (Financial & Credit Terms) ─── */}
      <CorporateAccountsPanel
        activeSub={activeSub}
        corporateAccounts={actions.corporateAccounts}
        invoices={actions.invoices}
        unbilledTransactions={actions.unbilledTransactions}
        creditLimitEnforcement={actions.portalPolicy.creditLimitEnforcement}
        isSaving={actions.isSaving}
        accountSearchTerm={actions.accountSearchTerm}
        setAccountSearchTerm={actions.setAccountSearchTerm}
        accountPage={actions.accountPage}
        setAccountPage={actions.setAccountPage}
        isCsvModalOpen={actions.isCsvModalOpen}
        setIsCsvModalOpen={actions.setIsCsvModalOpen}
        onUpdateCreditLimitEnforcement={actions.handleUpdateCreditLimitEnforcement}
        onUpdateFinancialTerms={actions.handleUpdateCorporateFinancialTerms}
        onRunBatchInvoicing={actions.handleRunBatchInvoicing}
        onCsvImportSuccess={actions.handleCsvImportSuccess}
      />

      {/* ─── 3a. Driver Payouts ─── */}
      {(activeSub === 'driver-payouts' || activeSub === 'payouts') && (
        <DriverPayoutsPanel
          isSaving={actions.isSaving}
          billingDraft={actions.billingDraft}
          setBillingDraft={actions.setBillingDraft}
          onSaveBillingPolicies={actions.handleSaveBillingPolicies}
          payoutPeriod={actions.payoutPeriod}
          setPayoutPeriod={actions.setPayoutPeriod}
          driverRollups={actions.driverRollups}
          driverPayoutOverrides={actions.driverPayoutOverrides}
          onUpdateDriverPayoutOverride={actions.updateDriverPayoutOverride}
          onSaveDriverPayoutSettings={actions.handleSaveDriverPayoutSettings}
          payoutSettlements={actions.payoutSettlements}
          onSaveCustomPayee={actions.handleSaveCustomPayee}
          onRecordSettlement={actions.handleRecordSettlement}
          onUpdateSettlementStatus={actions.handleUpdateSettlementStatus}
          onExportPayoutsCsv={actions.handleExportPayoutsCsv}
        />
      )}

      {/* ─── 3b. Staff Payroll ─── */}
      {activeSub === 'staff-payouts' && (
        <StaffAndOtherPayeesTables
          mode="staff"
          isSaving={actions.isSaving}
          billingDraft={actions.billingDraft}
          setBillingDraft={actions.setBillingDraft}
          onSaveBillingPolicies={actions.handleSaveBillingPolicies}
          payoutPeriod={actions.payoutPeriod}
          setPayoutPeriod={actions.setPayoutPeriod}
          staffPreviews={actions.staffPreviews}
          staffHoursMap={actions.staffHoursMap}
          setStaffHoursMap={actions.setStaffHoursMap}
          customPayees={actions.customPayees}
          otherPayeeInputs={actions.otherPayeeInputs}
          setOtherPayeeInputs={actions.setOtherPayeeInputs}
          payoutSettlements={actions.payoutSettlements}
          onSaveCustomPayee={actions.handleSaveCustomPayee}
          onDeleteCustomPayee={actions.handleDeleteCustomPayee}
          onRecordSettlement={actions.handleRecordSettlement}
          onUpdateSettlementStatus={actions.handleUpdateSettlementStatus}
          onExportPayoutsCsv={actions.handleExportPayoutsCsv}
        />
      )}

      {/* ─── 3c. Other Payees ─── */}
      {activeSub === 'other-payees' && (
        <StaffAndOtherPayeesTables
          mode="other"
          isSaving={actions.isSaving}
          billingDraft={actions.billingDraft}
          setBillingDraft={actions.setBillingDraft}
          onSaveBillingPolicies={actions.handleSaveBillingPolicies}
          payoutPeriod={actions.payoutPeriod}
          setPayoutPeriod={actions.setPayoutPeriod}
          staffPreviews={actions.staffPreviews}
          staffHoursMap={actions.staffHoursMap}
          setStaffHoursMap={actions.setStaffHoursMap}
          customPayees={actions.customPayees}
          otherPayeeInputs={actions.otherPayeeInputs}
          setOtherPayeeInputs={actions.setOtherPayeeInputs}
          payoutSettlements={actions.payoutSettlements}
          onSaveCustomPayee={actions.handleSaveCustomPayee}
          onDeleteCustomPayee={actions.handleDeleteCustomPayee}
          onRecordSettlement={actions.handleRecordSettlement}
          onUpdateSettlementStatus={actions.handleUpdateSettlementStatus}
          onExportPayoutsCsv={actions.handleExportPayoutsCsv}
        />
      )}

      {/* ─── 4. Policy & QuickBooks ─── */}
      {activeSub === 'accounting-sync' && (
        <BillingPolicyAndQuickBooksPanel
          isSaving={actions.isSaving}
          isExporting={actions.isExporting}
          billingDraft={actions.billingDraft}
          setBillingDraft={actions.setBillingDraft}
          onSaveBillingPolicies={actions.handleSaveBillingPolicies}
          ledgerFilter={actions.ledgerFilter}
          setLedgerFilter={actions.setLedgerFilter}
          ledgerTypeFilter={actions.ledgerTypeFilter}
          setLedgerTypeFilter={actions.setLedgerTypeFilter}
          filteredLedgerEntries={actions.filteredLedgerEntries}
          onExportLedger={actions.handleExport}
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
