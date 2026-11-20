/**
 * Payment & Card Vaulting Types
 * 
 * Defines contracts for Stripe / Square tokenized checkout, card vaulting,
 * pre-authorization holds, automated payment capture, and driver payouts fare-splitting.
 */

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'diners' | 'jcb' | 'unionpay' | 'unknown';

export interface VaultedCard {
  id: string;
  customerId: string;
  brand: CardBrand;
  last4: string;
  expMonth: number;
  expYear: number;
  cardholderName: string;
  token: string; // Tokenized card reference (e.g. pm_xxx or card_xxx)
  isDefault: boolean;
  createdAt: string;
}

export type PaymentIntentStatus =
  | 'pending'
  | 'requires_action'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'canceled'
  | 'refunded';

export interface PaymentIntentRecord {
  id: string;
  tripId: string;
  customerId?: string;
  amount: number;
  currency: string;
  status: PaymentIntentStatus;
  paymentMethodId?: string;
  cardLast4?: string;
  cardBrand?: CardBrand;
  preAuthHoldAmount: number;
  capturedAmount?: number;
  tipAmount?: number;
  extrasAmount?: number;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type DriverSettlementMethod =
  | 'cash'
  | 'card_terminal'
  | 'stripe_preauth'
  | 'corporate_account';

export interface DriverPayoutRecord {
  id: string;
  driverId: string;
  tripId: string;
  /** Grand total charged to passenger (baseFareAmount + nonTollExtrasAmount + tollsReimbursed + tipAmount) */
  totalFare: number;
  /** Ride base/metered/quoted fare before post-booking extras, tolls, and tip */
  baseFareAmount?: number;
  /** Non-toll in-cab extras (cleaning, luggage, parking, wait) subject to commission split */
  nonTollExtrasAmount?: number;
  /** Commission rate applied (e.g. 0.75 = 75% driver / 25% company) */
  commissionRate?: number;
  paymentMethod?: DriverSettlementMethod;
  platformFee: number;
  driverShare: number;
  tipAmount: number;
  tollsReimbursed: number;
  /** Positive = company owes driver; Negative (or driver_owes_company) = cash ride commission owed by driver */
  netPayout: number;
  driverCashCollected?: number;
  companyCommissionOwed?: number;
  settlementDirection?: 'company_owes_driver' | 'driver_owes_company';
  status: 'pending' | 'settled' | 'withheld';
  settledAt?: string;
  createdAt: string;
}

export interface TipSelectionOption {
  type: 'preset' | 'custom' | 'none';
  percentage?: number; // e.g. 15, 20, 25
  customAmount?: number;
}

export interface IPaymentService {
  /**
   * Vault a credit/debit card token for recurring travel.
   */
  vaultCard(
    customerId: string,
    cardData: {
      cardNumber: string;
      cardholderName: string;
      cardExp: string;
      cardCvc?: string;
      isDefault?: boolean;
    }
  ): Promise<VaultedCard>;

  /**
   * Retrieves all vaulted payment methods for a passenger.
   */
  getVaultedCards(customerId: string): Promise<VaultedCard[]>;

  /**
   * Deletes a vaulted card on file.
   */
  removeVaultedCard(customerId: string, cardId: string): Promise<void>;

  /**
   * Sets a vaulted card as the customer's default payment method.
   */
  setDefaultCard(customerId: string, cardId: string): Promise<void>;

  /**
   * Creates a pre-authorization hold when a trip is confirmed.
   */
  createPreAuthorization(
    tripId: string,
    amount: number,
    customerId?: string,
    cardId?: string
  ): Promise<PaymentIntentRecord>;

  /**
   * Captures payment upon ride completion, adding extras and tip.
   */
  capturePayment(
    tripId: string,
    finalAmount: number,
    tipAmount?: number,
    extrasAmount?: number,
    options?: {
      settlementMethod?: DriverSettlementMethod;
      paymentIntentId?: string;
      cardLast4?: string;
      cardBrand?: CardBrand;
    }
  ): Promise<PaymentIntentRecord>;

  /**
   * Computes driver payout split based on company commission rate.
   */
  calculateDriverPayout(
    tripId: string,
    driverId: string,
    tripFare: number,
    tipAmount: number,
    tollsAmount: number,
    extrasAmount: number,
    driverCommissionRate?: number,
    paymentMethod?: DriverSettlementMethod
  ): Promise<DriverPayoutRecord>;

  /**
   * Retrieves payout record for a specific trip.
   */
  getDriverPayoutForTrip(tripId: string): Promise<DriverPayoutRecord | null>;

  /**
   * Retrieves payout history for a specific driver (Firestore + local merged).
   */
  getDriverPayoutHistory?(driverId: string): Promise<DriverPayoutRecord[]>;
}
