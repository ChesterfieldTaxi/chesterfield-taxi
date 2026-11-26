import React, { useEffect, useMemo, useState } from 'react';
import type { CorporateAccountConfig, CorporateAuthorizedRider } from '../../../../core/types/config';
import type { PoValidationResult } from '../../../../core/services/corporate-account.service';
import {
  evaluateCorporateCallerVerification,
  normalizeCorporateBookingPin,
  searchCorporateAccounts,
} from '../../../../core/services/corporate-caller-auth.util';
import { DEFAULT_CORPORATE_ACCOUNTS } from '../../../../core/hooks/booking';
import { AlertTriangleIcon, CheckIcon, LockIcon, ShieldCheckIcon, UserCheckIcon } from '../../../ui/Icons';
import { Select, type SelectOption } from '../../../ui/Select';

export interface DispatchCorporateAccountCardProps {
  corporateAccount: string;
  setCorporateAccount: (val: string) => void;
  corporateAccountList: CorporateAccountConfig[];
  selectedCorporateAccount: CorporateAccountConfig | null;
  billingPo: string;
  setBillingPo: (val: string) => void;
  poValidation: PoValidationResult | null;
  allowPoOverride: boolean;
  setAllowPoOverride: (val: boolean) => void;
  authorizedBy: string;
  setAuthorizedBy: (val: string) => void;
  callerPhone?: string;
  passengerPhone?: string;
  passengerEmail?: string;
  bookerPhone?: string;
  bookerEmail?: string;
  enteredBookingPin?: string;
  setEnteredBookingPin?: (val: string) => void;
  onSelectAuthorizedRider?: (rider: CorporateAuthorizedRider) => void;
}

export function DispatchCorporateAccountCard({
  corporateAccount, setCorporateAccount, corporateAccountList, selectedCorporateAccount,
  billingPo, setBillingPo, poValidation, allowPoOverride, setAllowPoOverride,
  authorizedBy, setAuthorizedBy, callerPhone, passengerPhone, passengerEmail,
  bookerPhone, bookerEmail, enteredBookingPin: controlledPin, setEnteredBookingPin: setControlledPin,
  onSelectAuthorizedRider,
}: DispatchCorporateAccountCardProps) {
  const [localPin, setLocalPin] = useState('');
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [selectedCostCenter, setSelectedCostCenter] = useState('');

  const enteredPin = controlledPin !== undefined ? controlledPin : localPin;
  const updateEnteredPin = (val: string) => {
    const clean = normalizeCorporateBookingPin(val);
    if (setControlledPin) setControlledPin(clean);
    else setLocalPin(clean);
  };

  useEffect(() => {
    setSelectedRiderId('');
    setSelectedCostCenter('');
    if (setControlledPin) setControlledPin('');
    else setLocalPin('');
  }, [selectedCorporateAccount?.id]);

  const orderedAccounts = useMemo(() => searchCorporateAccounts(corporateAccountList, ''), [corporateAccountList]);
  const accountSelectOptions = useMemo<SelectOption[]>(() => {
    if (orderedAccounts.length === 0) {
      return DEFAULT_CORPORATE_ACCOUNTS.map((acc) => ({ value: acc, label: acc }));
    }
    return orderedAccounts.map((acc) => ({
      value: acc.companyName,
      label: `${acc.companyName} (${acc.accountNumber})`,
      subtitle: `Acct #${acc.accountNumber} • Limit $${acc.creditLimit.toLocaleString()}${acc.discountPercent ? ` • ${acc.discountPercent}% Off` : ''}`,
      badge: acc.poRequired ? 'PO REQ' : undefined,
    }));
  }, [orderedAccounts]);

  const riderOptions = useMemo<SelectOption[]>(() => [
    { value: '', label: 'Select Authorized Rider...' },
    ...(selectedCorporateAccount?.authorizedRiders || []).map((r) => ({
      value: r.id,
      label: `${r.name}${r.isVip ? ' ★ VIP' : ''}`,
      subtitle: [r.department, r.phone, r.email].filter(Boolean).join(' • ') || undefined,
    })),
  ], [selectedCorporateAccount?.authorizedRiders]);

  const costCenterOptions = useMemo<SelectOption[]>(() => [
    { value: '', label: 'Select Cost Center...' },
    ...(selectedCorporateAccount?.costCenters || []).map((cc) => ({ value: cc, label: cc })),
  ], [selectedCorporateAccount?.costCenters]);

  const verification = useMemo(
    () =>
      evaluateCorporateCallerVerification({
        account: selectedCorporateAccount, callerPhone, passengerPhone, passengerEmail,
        bookerPhone, bookerEmail, enteredPin, selectedRiderId, selectedCostCenter,
        allowPoOverride, poValidation,
      }),
    [
      selectedCorporateAccount, callerPhone, passengerPhone, passengerEmail,
      bookerPhone, bookerEmail, enteredPin, selectedRiderId, selectedCostCenter,
      allowPoOverride, poValidation,
    ]
  );

  const selectedCorp = selectedCorporateAccount;
  const hasRiders = (selectedCorp?.authorizedRiders?.length || 0) > 0;
  const hasCostCenters = (selectedCorp?.costCenters?.length || 0) > 0;

  return (
    <div className="p-2.5 mb-2 bg-status-warning-bg/80 border border-status-warning-border rounded-xl space-y-2">
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <span className="text-[10px] font-bold text-status-warning-fg uppercase tracking-wide flex items-center gap-1">
          <ShieldCheckIcon className="w-3.5 h-3.5 text-status-warning-fg shrink-0" />
          <span>Corporate Account Billing</span>
        </span>
        <div className="flex items-center gap-1">
          {verification.rosterMatched && (
            <span
              className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded bg-status-success-bg-strong text-status-success-fg border border-status-success-border"
              title={verification.rosterMatch.personName ? `Matched ${verification.rosterMatch.personName} (${verification.rosterMatch.source})` : 'Caller matched corporate roster'}
            >
              ✓ Verified Roster Match
            </span>
          )}
          {selectedCorp && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${selectedCorp.poRequired ? 'bg-status-danger-bg-strong text-status-danger-fg border border-status-danger-border' : 'bg-surface-muted text-fg-secondary border border-border-subtle'}`}>
              {selectedCorp.poRequired ? 'PO Required' : 'PO Optional'}
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-fg-secondary font-semibold">Corporate Client (Account # or Name)</span>
          {selectedCorp && (
            <span className="text-[10px] font-mono text-fg-muted font-semibold">
              #{selectedCorp.accountNumber} • Limit ${selectedCorp.creditLimit.toLocaleString()}
            </span>
          )}
        </div>
        <Select
          size="sm"
          searchable
          searchPlaceholder="Search Account # or Company Name..."
          value={corporateAccount}
          options={accountSelectOptions}
          onValueChange={(val) => setCorporateAccount(val)}
          triggerClassName="border-status-warning-border"
        />
      </div>

      {selectedCorp && (
        <div className={`px-2 py-1 rounded-lg border text-[10px] flex items-center justify-between gap-2 ${verification.rosterMatched ? 'bg-status-success-bg/90 border-status-success-border text-status-success-fg' : 'bg-surface-card/80 border-status-warning-border/80 text-fg-secondary'}`}>
          <span className="truncate font-semibold flex items-center gap-1">
            <UserCheckIcon className="w-3 h-3 shrink-0" />
            {verification.rosterMatched
              ? `✓ Verified Roster Match${verification.rosterMatch.personName ? ` · ${verification.rosterMatch.personName}` : ''}`
              : 'Caller / Passenger not yet matched on roster'}
          </span>
          <span className="font-mono font-bold shrink-0 text-[9.5px]">{verification.verifiedSignalCount}/4 signals</span>
        </div>
      )}

      {selectedCorp?.bookingPin && (
        <div className="p-2 rounded-lg bg-surface-card border border-status-warning-border space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-fg-secondary flex items-center gap-1">
              <LockIcon className="w-3 h-3 text-status-warning-fg shrink-0" />
              <span>Verbal Booking PIN</span>
            </span>
            {verification.pinStatus === 'verified' && <span className="text-[9.5px] font-extrabold text-status-success-fg">✓ PIN Verified</span>}
            {verification.pinStatus === 'mismatch' && <span className="text-[9.5px] font-extrabold text-status-danger-fg">PIN Mismatch</span>}
          </div>
          <input
            type="text"
            maxLength={8}
            placeholder="Ask caller for 4–8 char Booking PIN"
            value={enteredPin}
            onChange={(e) => updateEnteredPin(e.target.value)}
            className={`w-full px-2 py-1 bg-surface-card border rounded text-xs font-mono font-bold uppercase tracking-wider ${
              verification.pinStatus === 'verified'
                ? 'border-emerald-500 text-status-success-fg bg-status-success-bg/40'
                : verification.pinStatus === 'mismatch'
                ? 'border-rose-500 text-status-danger-fg bg-status-danger-bg'
                : 'border-status-warning-border text-fg-strong'
            }`}
          />
        </div>
      )}

      {(hasRiders || hasCostCenters) && (
        <div className={`grid ${hasRiders && hasCostCenters ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5`}>
          {hasRiders && (
            <div>
              <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">Authorized Rider</span>
              <Select
                size="xs"
                searchable
                searchPlaceholder="Search rider..."
                value={selectedRiderId}
                options={riderOptions}
                onValueChange={(riderId) => {
                  setSelectedRiderId(riderId);
                  const rider = (selectedCorp?.authorizedRiders || []).find((r) => r.id === riderId);
                  if (rider) {
                    if (!authorizedBy.trim()) setAuthorizedBy(rider.name);
                    onSelectAuthorizedRider?.(rider);
                  }
                }}
                triggerClassName="border-status-warning-border"
              />
            </div>
          )}
          {hasCostCenters && (
            <div>
              <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">Cost Center</span>
              <Select
                size="xs"
                searchable
                searchPlaceholder="Search cost center..."
                value={selectedCostCenter}
                options={costCenterOptions}
                onValueChange={(cc) => {
                  setSelectedCostCenter(cc);
                  if (cc) setAuthorizedBy(cc);
                }}
                triggerClassName="border-status-warning-border"
              />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-fg-secondary font-semibold">Billing PO / Code</span>
            {selectedCorp?.currentPoNumber && (
              <span className="text-[9px] font-mono text-fg-muted">Active: {selectedCorp.currentPoNumber}</span>
            )}
          </div>
          <input
            type="text"
            placeholder={selectedCorp?.currentPoNumber || 'PO-XXXX'}
            value={billingPo}
            onChange={(e) => setBillingPo(e.target.value)}
            className={`w-full px-2 py-1 bg-surface-card border rounded text-xs font-mono font-bold ${
              poValidation?.status === 'expired_revoked'
                ? 'border-rose-500 bg-status-danger-bg text-status-danger-fg ring-2 ring-rose-500/20'
                : poValidation?.status === 'valid'
                ? 'border-emerald-500 text-status-success-fg'
                : 'border-status-warning-border'
            }`}
          />
        </div>
        <div>
          <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">Authorized By / Dept</span>
          <input
            type="text"
            placeholder="Manager, Dept, or Cost Ctr"
            value={authorizedBy}
            onChange={(e) => setAuthorizedBy(e.target.value)}
            className="w-full px-2 py-1 bg-surface-card border border-status-warning-border rounded text-xs"
          />
        </div>
      </div>

      {selectedCorp && billingPo.trim().length > 0 && (
        <div className="text-[10px]">
          {poValidation?.status === 'valid' && (
            <div className="flex items-center gap-1.5 text-status-success-fg bg-status-success-bg px-2.5 py-1.5 rounded-lg border border-status-success-border">
              <CheckIcon className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span className="font-semibold">Active Authorized PO verified.</span>
            </div>
          )}
          {poValidation?.status === 'expired_revoked' && (
            <div className="flex items-start gap-1.5 text-status-danger-fg bg-status-danger-bg px-2.5 py-1.5 rounded-lg border border-status-danger-border font-medium">
              <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <strong className="block font-bold">FRAUD ALERT: REVOKED PO DETECTED</strong>
                <span>
                  PO &ldquo;{billingPo}&rdquo; was revoked/rotated on{' '}
                  {poValidation.revokedRecord?.rotatedAt ? poValidation.revokedRecord.rotatedAt.slice(0, 10) : 'previously'}.
                  This booking cannot proceed under this revoked authorization.
                </span>
              </div>
            </div>
          )}
          {poValidation?.status === 'mismatch' && (
            <div className="space-y-1.5 text-status-danger-fg bg-status-danger-bg px-2.5 py-2 rounded-lg border border-status-danger-border">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                <span>PO Mismatch — Active PO on file: {selectedCorp.currentPoNumber || 'None'}.</span>
              </div>
              {selectedCorp.poRequired && (
                <label className="flex items-center gap-1.5 text-[10px] font-semibold text-fg-secondary cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={allowPoOverride}
                    onChange={(e) => setAllowPoOverride(e.target.checked)}
                    className="rounded border-rose-400 text-rose-600 focus:ring-rose-500"
                  />
                  <span>Supervisor Override: authorize mismatched PO (logged in audit trail)</span>
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
