import { useCallback, useMemo } from 'react';
import {
  normalizeCorporatePortalPolicy,
  type CorporateAccountConfig,
  type CreditLimitEnforcementMode,
} from '../../types/config';
import { getAdminConfigService } from '../../services/config/admin-config.service';
import {
  evaluateCorporateCreditLimit,
  getCorporateAccountService,
  type PoValidationResult,
} from '../../services/corporate-account.service';
import { normalizeCorporateBookingPin } from '../../services/corporate-caller-auth.util';
import { getInvoicingService } from '../../services/invoicing.service';

export function findMatchingCorporateAccount(
  accounts: CorporateAccountConfig[],
  identifier?: string | null,
  options?: { caseInsensitiveName?: boolean }
): CorporateAccountConfig | null {
  if (!identifier || accounts.length === 0) return null;
  if (options?.caseInsensitiveName) {
    const lower = String(identifier).toLowerCase();
    return (
      accounts.find(
        (c) =>
          c.id === identifier ||
          c.accountNumber === identifier ||
          c.companyName.toLowerCase() === lower
      ) || null
    );
  }
  return (
    accounts.find(
      (c) =>
        c.companyName === identifier ||
        c.id === identifier ||
        c.accountNumber === identifier
    ) || null
  );
}

export function resolveEffectiveDiscountInputs(params: {
  discount: string;
  matchedCorporateAccount: CorporateAccountConfig | null;
  manualDiscountDollars: string;
}): { pct: number; label: string | undefined; flatDollars: number } {
  const { discount, matchedCorporateAccount, manualDiscountDollars } = params;
  const parsedDropdownPct =
    discount && discount !== 'None' ? parseFloat(discount.replace('%', '')) || 0 : 0;
  const corpPct = matchedCorporateAccount?.discountPercent || 0;
  const pct = parsedDropdownPct > 0 ? parsedDropdownPct : corpPct;
  const label =
    parsedDropdownPct > 0
      ? `Courtesy Discount (${parsedDropdownPct}%)`
      : corpPct > 0
      ? `${matchedCorporateAccount?.companyName || 'Corporate'} Discount (${corpPct}%)`
      : undefined;
  const flatDollars = manualDiscountDollars
    ? Math.max(0, parseFloat(manualDiscountDollars) || 0)
    : 0;
  return { pct, label, flatDollars };
}

export async function verifyCustomerCorporateAccount(params: {
  accountNumber: string;
  poNumber: string;
  estimatedFare: number;
}): Promise<{ verified: true; corporateAccountId?: string }> {
  const acctNum = params.accountNumber.trim();
  if (!acctNum) {
    throw new Error(
      'Please enter your Corporate Account Number to bill a corporate account.'
    );
  }

  const verifyResp = await fetch('/api/corporate/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountNumber: acctNum,
      poNumber: params.poNumber.trim(),
      estimatedFare: params.estimatedFare,
    }),
  });

  const verifyData = (await verifyResp.json().catch(() => ({}))) as {
    verified?: boolean;
    corporateAccountId?: string;
    error?: string;
  };

  if (!verifyResp.ok || !verifyData.verified) {
    throw new Error(
      verifyData.error ||
        'Unable to verify Corporate Account / PO Number. Please check your details or call dispatch.'
    );
  }

  return {
    verified: true,
    corporateAccountId: verifyData.corporateAccountId
      ? String(verifyData.corporateAccountId)
      : undefined,
  };
}

export async function validateDispatchCorporateSubmission(params: {
  corporateAccountList: CorporateAccountConfig[];
  corporateAccount: string;
  billingPo: string;
  allowPoOverride: boolean;
  projectedFare: number;
  enteredBookingPin?: string;
  poFormatRegex?: string;
  creditLimitEnforcement?: CreditLimitEnforcementMode;
  openBalanceOverride?: number;
}): Promise<
  | {
      valid: true;
      selectedCorp: CorporateAccountConfig | null;
      warning?: string;
      isOverCreditLimit?: boolean;
    }
  | { valid: false; error: string; isOverCreditLimit?: boolean }
> {
  const {
    corporateAccountList,
    corporateAccount,
    billingPo,
    allowPoOverride,
    projectedFare,
    poFormatRegex,
    creditLimitEnforcement,
    openBalanceOverride,
  } = params;

  const selectedCorp = findMatchingCorporateAccount(
    corporateAccountList,
    corporateAccount
  );
  if (!selectedCorp) {
    return { valid: true, selectedCorp: null };
  }

  if (selectedCorp.isActive === false) {
    return {
      valid: false,
      error: `Corporate account "${selectedCorp.companyName}" is currently PAUSED / INACTIVE and cannot accept new direct-bill rides.`,
    };
  }

  const expectedPin = normalizeCorporateBookingPin(selectedCorp.bookingPin);
  const candidatePin = normalizeCorporateBookingPin(params.enteredBookingPin);
  if (expectedPin.length >= 4 && candidatePin.length > 0 && candidatePin !== expectedPin) {
    return {
      valid: false,
      error: `VERBAL PIN MISMATCH: Entered PIN "${candidatePin}" does not match the Verbal Booking PIN on file for "${selectedCorp.companyName}".`,
    };
  }

  const portalPolicy = normalizeCorporatePortalPolicy(
    getAdminConfigService().getCachedSettings().corporatePortalPolicy
  );

  const poCheck = getCorporateAccountService().validateCorporatePo(
    selectedCorp,
    billingPo,
    {
      poFormatRegex:
        poFormatRegex !== undefined ? poFormatRegex : portalPolicy.poFormatRegex,
    }
  );

  if (poCheck.status === 'expired_revoked') {
    return {
      valid: false,
      error: `FRAUD ALERT: The PO number "${billingPo}" was revoked/rotated on ${
        poCheck.revokedRecord?.rotatedAt
          ? poCheck.revokedRecord.rotatedAt.slice(0, 10)
          : 'previously'
      }. Corporate booking cannot proceed with a revoked PO.`,
    };
  }

  if (selectedCorp.poRequired && !billingPo.trim()) {
    return {
      valid: false,
      error: `PO Number is strictly required for corporate client "${selectedCorp.companyName}".`,
    };
  }

  if (poCheck.formatError && !allowPoOverride) {
    return {
      valid: false,
      error: poCheck.message,
    };
  }

  if (selectedCorp.poRequired && poCheck.status === 'mismatch' && !allowPoOverride) {
    return {
      valid: false,
      error: `PO MISMATCH BLOCK: "${billingPo}" does not match the active authorized PO (${
        selectedCorp.currentPoNumber || 'N/A'
      }) for "${selectedCorp.companyName}". Verify PO or check Supervisor Override below.`,
    };
  }

  if (selectedCorp.creditLimit > 0) {
    try {
      const invService = getInvoicingService();
      const openBalance =
        openBalanceOverride !== undefined
          ? openBalanceOverride
          : invService.getCorporateAccountBalance
          ? await invService.getCorporateAccountBalance(selectedCorp.id)
          : 0;
      const effectiveEnforcement =
        creditLimitEnforcement ?? portalPolicy.creditLimitEnforcement;
      const creditEval = evaluateCorporateCreditLimit({
        creditLimit: selectedCorp.creditLimit,
        currentBalance: openBalance,
        projectedFare,
        enforcement: effectiveEnforcement,
        companyName: selectedCorp.companyName,
      });

      if (!creditEval.allowed) {
        return {
          valid: false,
          error: creditEval.error || 'Corporate credit limit exceeded.',
          isOverCreditLimit: true,
        };
      }

      if (creditEval.isOverLimit) {
        return {
          valid: true,
          selectedCorp,
          warning: creditEval.warning,
          isOverCreditLimit: true,
        };
      }
    } catch {
      // Non-blocking if offline
    }
  }

  return { valid: true, selectedCorp };
}

export interface UseCorporatePoVerificationOptions {
  paymentMethod: 'cash' | 'card' | 'account';
  corporateAccountList?: CorporateAccountConfig[];
  corporateAccount?: string;
  billingPo?: string;
}

export interface UseCorporatePoVerificationResult {
  selectedCorporateAccount: CorporateAccountConfig | null;
  matchedCorporateAccount: CorporateAccountConfig | null;
  poValidation: PoValidationResult | null;
  verifyCustomerAccount: typeof verifyCustomerCorporateAccount;
  validateDispatchAccount: typeof validateDispatchCorporateSubmission;
}

export function useCorporatePoVerification(
  options: UseCorporatePoVerificationOptions
): UseCorporatePoVerificationResult {
  const {
    paymentMethod,
    corporateAccountList = [],
    corporateAccount,
    billingPo = '',
  } = options;

  const selectedCorporateAccount = useMemo(() => {
    return findMatchingCorporateAccount(corporateAccountList, corporateAccount);
  }, [corporateAccountList, corporateAccount]);

  const matchedCorporateAccount = useMemo(() => {
    if (paymentMethod !== 'account') return null;
    return selectedCorporateAccount;
  }, [paymentMethod, selectedCorporateAccount]);

  const poValidation = useMemo<PoValidationResult | null>(() => {
    if (paymentMethod !== 'account' || !selectedCorporateAccount) return null;
    return getCorporateAccountService().validateCorporatePo(
      selectedCorporateAccount,
      billingPo
    );
  }, [paymentMethod, selectedCorporateAccount, billingPo]);

  const verifyCustomerAccount = useCallback(verifyCustomerCorporateAccount, []);
  const validateDispatchAccount = useCallback(validateDispatchCorporateSubmission, []);

  return {
    selectedCorporateAccount,
    matchedCorporateAccount,
    poValidation,
    verifyCustomerAccount,
    validateDispatchAccount,
  };
}
