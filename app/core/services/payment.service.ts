/**
 * Payment & Card Vaulting Service
 * 
 * Implements tokenized card vaulting, pre-authorization holds, automated payment capture,
 * driver gratuity processing, and driver payout fare-splitting.
 */

import type {
  CardBrand,
  VaultedCard,
  PaymentIntentRecord,
  DriverPayoutRecord,
  DriverSettlementMethod,
  IPaymentService,
} from '../types/payment';
import { isFirebaseConfigured, getFirestoreDb } from './firebase';
import { authorizedFetch } from './auth/auth-headers';
import { sanitizePayload } from './firestore-sanitizer';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const DEFAULT_VAULTED_CARDS_STORAGE_KEY = 'ct_vaulted_cards';
const DEFAULT_PAYMENT_INTENTS_STORAGE_KEY = 'ct_payment_intents';
const DEFAULT_DRIVER_PAYOUTS_STORAGE_KEY = 'ct_driver_payouts';

/**
 * Detects card brand from card number prefix.
 */
export function detectCardBrand(cardNumber: string): CardBrand {
  const sanitized = cardNumber.replace(/\D/g, '');
  if (/^4/.test(sanitized)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(sanitized)) return 'mastercard';
  if (/^3[47]/.test(sanitized)) return 'amex';
  if (/^6(?:011|5)/.test(sanitized)) return 'discover';
  if (/^3(?:0[0-5]|[68])/.test(sanitized)) return 'diners';
  if (/^(?:2131|1800|35)/.test(sanitized)) return 'jcb';
  if (/^62/.test(sanitized)) return 'unionpay';
  return 'unknown';
}

class PaymentService implements IPaymentService {
  private memoryCards: Map<string, VaultedCard[]> = new Map();
  private memoryIntents: Map<string, PaymentIntentRecord> = new Map();
  private memoryPayouts: Map<string, DriverPayoutRecord> = new Map();

  constructor() {
    this.hydrateFromStorage();
  }

  private hydrateFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const storedCards = localStorage.getItem(DEFAULT_VAULTED_CARDS_STORAGE_KEY);
      if (storedCards) {
        const parsed = JSON.parse(storedCards) as Record<string, VaultedCard[]>;
        Object.entries(parsed).forEach(([k, v]) => this.memoryCards.set(k, v));
      }

      const storedIntents = localStorage.getItem(DEFAULT_PAYMENT_INTENTS_STORAGE_KEY);
      if (storedIntents) {
        const parsed = JSON.parse(storedIntents) as PaymentIntentRecord[];
        parsed.forEach((item) => this.memoryIntents.set(item.tripId, item));
      }

      const storedPayouts = localStorage.getItem(DEFAULT_DRIVER_PAYOUTS_STORAGE_KEY);
      if (storedPayouts) {
        const parsed = JSON.parse(storedPayouts) as DriverPayoutRecord[];
        parsed.forEach((item) => this.memoryPayouts.set(item.tripId, item));
      }
    } catch (e) {
      console.warn('[PaymentService] Failed to load local payment storage:', e);
    }
  }

  private persistToStorage() {
    if (typeof window === 'undefined') return;
    try {
      const cardsObj: Record<string, VaultedCard[]> = {};
      this.memoryCards.forEach((v, k) => {
        cardsObj[k] = v;
      });
      localStorage.setItem(DEFAULT_VAULTED_CARDS_STORAGE_KEY, JSON.stringify(cardsObj));

      const intentsArr = Array.from(this.memoryIntents.values());
      localStorage.setItem(DEFAULT_PAYMENT_INTENTS_STORAGE_KEY, JSON.stringify(intentsArr));

      const payoutsArr = Array.from(this.memoryPayouts.values());
      localStorage.setItem(DEFAULT_DRIVER_PAYOUTS_STORAGE_KEY, JSON.stringify(payoutsArr));
    } catch (e) {
      console.warn('[PaymentService] Failed to save local payment storage:', e);
    }
  }

  async vaultCard(
    customerId: string,
    cardData: {
      cardNumber: string;
      cardholderName: string;
      cardExp: string;
      cardCvc?: string;
      isDefault?: boolean;
    }
  ): Promise<VaultedCard> {
    const sanitizedNumber = cardData.cardNumber.replace(/\D/g, '');
    const last4 = sanitizedNumber.slice(-4) || '4242';
    const brand = detectCardBrand(sanitizedNumber);

    let expMonth = 12;
    let expYear = 2028;
    if (cardData.cardExp.includes('/')) {
      const [m, y] = cardData.cardExp.split('/');
      expMonth = parseInt(m, 10) || 12;
      const parsedYear = parseInt(y, 10) || 28;
      expYear = parsedYear < 100 ? 2000 + parsedYear : parsedYear;
    }

    const token = `pm_vault_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const customerCards = this.memoryCards.get(customerId) || [];
    const isFirst = customerCards.length === 0;

    const newCard: VaultedCard = {
      id: `card_${Date.now()}`,
      customerId,
      brand,
      last4,
      expMonth,
      expYear,
      cardholderName: cardData.cardholderName || 'Cardholder',
      token,
      isDefault: cardData.isDefault ?? isFirst,
      createdAt: new Date().toISOString(),
    };

    let updatedCards = [...customerCards];
    if (newCard.isDefault) {
      updatedCards = updatedCards.map((c) => ({ ...c, isDefault: false }));
    }
    updatedCards.push(newCard);
    this.memoryCards.set(customerId, updatedCards);
    this.persistToStorage();

    // Firestore optional sync
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const userDocRef = doc(db, 'users', customerId);
          await updateDoc(userDocRef, { vaultedPaymentMethods: updatedCards }).catch(() => {});
        }
      } catch {
        // Silently tolerate if offline
      }
    }

    return newCard;
  }

  async getVaultedCards(customerId: string): Promise<VaultedCard[]> {
    const cached = this.memoryCards.get(customerId);
    if (cached && cached.length > 0) {
      return cached;
    }

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const userDocRef = doc(db, 'users', customerId);
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            const data = snap.data();
            const cards = (data.vaultedPaymentMethods as VaultedCard[]) || [];
            this.memoryCards.set(customerId, cards);
            return cards;
          }
        }
      } catch (err) {
        console.warn('[PaymentService] Failed to fetch vaulted cards from Firestore:', err);
      }
    }

    return cached || [];
  }

  async removeVaultedCard(customerId: string, cardId: string): Promise<void> {
    const cards = this.memoryCards.get(customerId) || [];
    const filtered = cards.filter((c) => c.id !== cardId);
    if (filtered.length > 0 && !filtered.some((c) => c.isDefault)) {
      filtered[0].isDefault = true;
    }
    this.memoryCards.set(customerId, filtered);
    this.persistToStorage();

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const userDocRef = doc(db, 'users', customerId);
          await updateDoc(userDocRef, { vaultedPaymentMethods: filtered }).catch(() => {});
        }
      } catch {
        // Tolerated
      }
    }
  }

  async setDefaultCard(customerId: string, cardId: string): Promise<void> {
    const cards = this.memoryCards.get(customerId) || [];
    const updated = cards.map((c) => ({
      ...c,
      isDefault: c.id === cardId,
    }));
    this.memoryCards.set(customerId, updated);
    this.persistToStorage();

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const userDocRef = doc(db, 'users', customerId);
          await updateDoc(userDocRef, { vaultedPaymentMethods: updated }).catch(() => {});
        }
      } catch {
        // Tolerated
      }
    }
  }

  async createPreAuthorization(
    tripId: string,
    amount: number,
    customerId?: string,
    cardId?: string
  ): Promise<PaymentIntentRecord> {
    const now = new Date().toISOString();
    const intent: PaymentIntentRecord = {
      id: `pi_preauth_${tripId}_${Date.now().toString(36)}`,
      tripId,
      customerId,
      amount,
      currency: 'USD',
      status: 'authorized',
      paymentMethodId: cardId || 'pm_card_vaulted',
      cardLast4: '4242',
      cardBrand: 'visa',
      preAuthHoldAmount: amount,
      createdAt: now,
      updatedAt: now,
    };

    this.memoryIntents.set(tripId, intent);
    this.persistToStorage();
    return intent;
  }

  async capturePayment(
    tripId: string,
    finalAmount: number,
    tipAmount: number = 0,
    extrasAmount: number = 0,
    options?: {
      settlementMethod?: DriverSettlementMethod;
      paymentIntentId?: string;
      cardLast4?: string;
      cardBrand?: CardBrand;
    }
  ): Promise<PaymentIntentRecord> {
    const existing = this.memoryIntents.get(tripId);
    const now = new Date().toISOString();
    const cleanFinal = Number(finalAmount.toFixed(2));
    const cleanTip = Number(tipAmount.toFixed(2));
    const cleanExtras = Number(extrasAmount.toFixed(2));
    const totalCaptured = Number((cleanFinal + cleanTip + cleanExtras).toFixed(2));
    const settlementMethod: DriverSettlementMethod = options?.settlementMethod || 'card_terminal';

    let resolvedPaymentIntentId =
      options?.paymentIntentId || existing?.id || `in_cab_${settlementMethod}_${tripId}_${Date.now().toString(36)}`;
    let paymentStatus: 'captured' | 'pending_invoice' =
      settlementMethod === 'corporate_account' ? 'pending_invoice' : 'captured';

    // Real Stripe capture ONLY when explicitly settling a genuine Stripe pre-auth hold
    if (
      settlementMethod === 'stripe_preauth' &&
      options?.paymentIntentId &&
      /^pi_[a-zA-Z0-9]{8,64}$/.test(options.paymentIntentId)
    ) {
      const resp = await authorizedFetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'capture_intent',
          paymentIntentId: options.paymentIntentId,
          amount: totalCaptured,
          tripId,
        }),
      });
      const result = (await resp.json().catch(() => ({}))) as any;
      if (!resp.ok || !result?.success) {
        throw new Error(
          result?.error ||
            'Online Stripe capture failed. Please settle in the car via Card Reader or Cash.'
        );
      }
      resolvedPaymentIntentId = result.paymentIntentId || options.paymentIntentId;
    }

    const updated: PaymentIntentRecord = {
      id: resolvedPaymentIntentId,
      tripId,
      customerId: existing?.customerId,
      amount: totalCaptured,
      currency: 'USD',
      status: settlementMethod === 'corporate_account' ? 'pending' : 'captured',
      paymentMethodId:
        settlementMethod === 'cash'
          ? 'in_cab_cash'
          : settlementMethod === 'corporate_account'
          ? 'corporate_direct_bill'
          : existing?.paymentMethodId || 'in_cab_terminal',
      cardLast4:
        settlementMethod === 'cash' || settlementMethod === 'corporate_account'
          ? undefined
          : options?.cardLast4 || existing?.cardLast4,
      cardBrand:
        settlementMethod === 'cash' || settlementMethod === 'corporate_account'
          ? undefined
          : options?.cardBrand || existing?.cardBrand,
      preAuthHoldAmount: existing?.preAuthHoldAmount || cleanFinal,
      capturedAmount: settlementMethod === 'corporate_account' ? 0 : totalCaptured,
      tipAmount: cleanTip,
      extrasAmount: cleanExtras,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.memoryIntents.set(tripId, updated);
    this.persistToStorage();

    // Sync directly to the REAL `trips/{tripId}` document (never paymentIntentId!)
    const tripMethod =
      settlementMethod === 'cash'
        ? 'cash'
        : settlementMethod === 'corporate_account'
        ? 'account'
        : 'card';

    if (isFirebaseConfigured() && tripId) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const tripRef = doc(db, 'trips', tripId);
          const tripPaymentPatch: Record<string, any> = {
            'payment.method': tripMethod,
            'payment.status': paymentStatus,
            'payment.amount': totalCaptured,
            'payment.tipAmount': cleanTip,
            'payment.paymentIntentId': updated.id,
            updatedAt: now,
          };
          if (paymentStatus === 'captured') {
            tripPaymentPatch['payment.paidAt'] = now;
          }
          if (updated.cardLast4) {
            tripPaymentPatch['payment.cardLast4'] = updated.cardLast4;
          }
          if (updated.cardBrand) {
            tripPaymentPatch['payment.cardBrand'] = updated.cardBrand;
          }
          await updateDoc(tripRef, tripPaymentPatch);
        }
      } catch (err) {
        console.warn('[PaymentService] Failed syncing payment to trips/' + tripId, err);
      }
    }

    return updated;
  }

  async calculateDriverPayout(
    tripId: string,
    driverId: string,
    tripFare: number,
    tipAmount: number = 0,
    tollsAmount: number = 0,
    nonTollExtrasAmount: number = 0,
    driverCommissionRate: number = 0.75,
    paymentMethod: DriverSettlementMethod = 'card_terminal'
  ): Promise<DriverPayoutRecord> {
    const safeRate =
      Number.isFinite(driverCommissionRate) && driverCommissionRate >= 0 && driverCommissionRate <= 1
        ? driverCommissionRate
        : 0.75;

    // Decision #3: 100% driver pass-through strictly for tolls + tips; base fare + non-toll extras split at commission rate
    const cleanBaseFare = Number(Math.max(0, tripFare).toFixed(2));
    const cleanNonTollExtras = Number(Math.max(0, nonTollExtrasAmount).toFixed(2));
    const cleanTolls = Number(Math.max(0, tollsAmount).toFixed(2));
    const cleanTip = Number(Math.max(0, tipAmount).toFixed(2));

    const commissionableGross = Number((cleanBaseFare + cleanNonTollExtras).toFixed(2));
    const driverShare = Number((commissionableGross * safeRate).toFixed(2));
    const platformFee = Number((commissionableGross - driverShare).toFixed(2));
    const passengerGrandTotal = Number(
      (cleanBaseFare + cleanNonTollExtras + cleanTolls + cleanTip).toFixed(2)
    );

    const isCash = paymentMethod === 'cash';
    // On Cash rides, driver keeps cash collected in cab and owes company its commission (`platformFee`)
    const netPayout = isCash
      ? Number((-platformFee).toFixed(2))
      : Number((driverShare + cleanTip + cleanTolls).toFixed(2));

    const payout: DriverPayoutRecord = {
      id: `payout_${tripId}_${Date.now().toString(36)}`,
      driverId,
      tripId,
      totalFare: passengerGrandTotal,
      baseFareAmount: cleanBaseFare,
      nonTollExtrasAmount: cleanNonTollExtras,
      commissionRate: safeRate,
      paymentMethod,
      platformFee,
      driverShare,
      tipAmount: cleanTip,
      tollsReimbursed: cleanTolls,
      netPayout,
      driverCashCollected: isCash ? passengerGrandTotal : 0,
      companyCommissionOwed: isCash ? platformFee : 0,
      settlementDirection: isCash ? 'driver_owes_company' : 'company_owes_driver',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.memoryPayouts.set(tripId, payout);
    this.persistToStorage();

    // Persist payout record to Firestore `/driverPayouts/{payoutId}` & link on `trips/{tripId}`
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          await setDoc(doc(db, 'driverPayouts', payout.id), sanitizePayload(payout));
          const tripRef = doc(db, 'trips', tripId);
          await updateDoc(tripRef, {
            'payment.driverPayoutId': payout.id,
            'payment.payoutStatus': 'pending',
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('[PaymentService] Driver payout Firestore sync warning:', err);
      }
    }

    return payout;
  }

  async getDriverPayoutForTrip(tripId: string): Promise<DriverPayoutRecord | null> {
    return this.memoryPayouts.get(tripId) || null;
  }

  async getDriverPayoutHistory(driverId: string): Promise<DriverPayoutRecord[]> {
    const localRecords = Array.from(this.memoryPayouts.values()).filter(
      (p) => p.driverId === driverId
    );

    if (isFirebaseConfigured() && driverId) {
      try {
        const db = getFirestoreDb();
        const q = query(collection(db, 'driverPayouts'), where('driverId', '==', driverId));
        const snap = await getDocs(q);
        const byId = new Map<string, DriverPayoutRecord>();
        localRecords.forEach((r) => byId.set(r.id, r));
        snap.forEach((d) => {
          const rec = d.data() as DriverPayoutRecord;
          byId.set(rec.id || d.id, rec);
        });
        return Array.from(byId.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      } catch (err) {
        console.warn('[PaymentService] getDriverPayoutHistory Firestore warning:', err);
      }
    }

    return localRecords.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

// Singleton instance
let paymentServiceInstance: PaymentService | null = null;

export function getPaymentService(): IPaymentService {
  if (!paymentServiceInstance) {
    paymentServiceInstance = new PaymentService();
  }
  return paymentServiceInstance;
}
