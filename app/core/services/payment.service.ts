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
  IPaymentService,
} from '../types/payment';
import { isFirebaseConfigured, getFirestoreDb } from './firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

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
    extrasAmount: number = 0
  ): Promise<PaymentIntentRecord> {
    const existing = this.memoryIntents.get(tripId);
    const now = new Date().toISOString();
    const totalCaptured = Number((finalAmount + tipAmount + extrasAmount).toFixed(2));

    const updated: PaymentIntentRecord = {
      id: existing ? existing.id : `pi_cap_${tripId}_${Date.now().toString(36)}`,
      tripId,
      customerId: existing?.customerId,
      amount: totalCaptured,
      currency: 'USD',
      status: 'captured',
      paymentMethodId: existing?.paymentMethodId || 'pm_terminal',
      cardLast4: existing?.cardLast4 || '4242',
      cardBrand: existing?.cardBrand || 'visa',
      preAuthHoldAmount: existing?.preAuthHoldAmount || finalAmount,
      capturedAmount: totalCaptured,
      tipAmount,
      extrasAmount,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.memoryIntents.set(tripId, updated);
    this.persistToStorage();

    // Sync to Firestore trip document if available
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const tripRef = doc(db, 'trips', tripId);
          await updateDoc(tripRef, {
            'payment.status': 'captured',
            'payment.amount': totalCaptured,
            'payment.tipAmount': tipAmount,
            'payment.paymentIntentId': updated.id,
            'payment.paidAt': now,
          }).catch(() => {});
        }
      } catch {
        // Tolerated
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
    extrasAmount: number = 0,
    driverCommissionRate: number = 0.75 // Default: Driver receives 75% of base + extras, 100% of tip, 100% of tolls
  ): Promise<DriverPayoutRecord> {
    const grossFareAndExtras = tripFare + extrasAmount;
    const driverShare = Number((grossFareAndExtras * driverCommissionRate).toFixed(2));
    const platformFee = Number((grossFareAndExtras - driverShare).toFixed(2));
    const netPayout = Number((driverShare + tipAmount + tollsAmount).toFixed(2));

    const payout: DriverPayoutRecord = {
      id: `payout_${tripId}_${Date.now().toString(36)}`,
      driverId,
      tripId,
      totalFare: Number((tripFare + extrasAmount + tipAmount + tollsAmount).toFixed(2)),
      platformFee,
      driverShare,
      tipAmount,
      tollsReimbursed: tollsAmount,
      netPayout,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.memoryPayouts.set(tripId, payout);
    this.persistToStorage();

    // Sync to Firestore trip if configured
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const tripRef = doc(db, 'trips', tripId);
          await updateDoc(tripRef, {
            'payment.driverPayoutId': payout.id,
            'payment.payoutStatus': 'pending',
          }).catch(() => {});
        }
      } catch {
        // Tolerated
      }
    }

    return payout;
  }

  async getDriverPayoutForTrip(tripId: string): Promise<DriverPayoutRecord | null> {
    return this.memoryPayouts.get(tripId) || null;
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
