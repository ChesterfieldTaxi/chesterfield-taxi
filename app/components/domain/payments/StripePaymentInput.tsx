/**
 * PCI-Compliant Stripe Payment Input Component
 *
 * Safely renders hosted payment iframes using Stripe.js (https://js.stripe.com/v3/)
 * when a publishable key is configured, and falls back to an explicit
 * "Pay Driver in Cab (Cash / Terminal)" mode when Stripe is disabled—never
 * collecting raw PAN/CVV in plain HTML inputs.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { CardBrand } from '../../../core/types/payment';
import { LockIcon, ShieldCheckIcon, AlertCircleIcon, CreditCardIcon } from '../../ui/Icons';

export interface StripePaymentInputProps {
  publishableKey?: string;
  amount?: number;
  currency?: string;
  saveCardOnFile?: boolean;
  onSaveCardChange?: (save: boolean) => void;
  onCardChange?: (info: {
    brand: CardBrand;
    last4: string;
    complete: boolean;
    token?: string;
    payInCab?: boolean;
  }) => void;
  className?: string;
  disabled?: boolean;
}

declare global {
  interface Window {
    Stripe?: any;
  }
}

export function StripePaymentInput({
  publishableKey,
  saveCardOnFile = false,
  onSaveCardChange,
  onCardChange,
  className = '',
}: StripePaymentInputProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isStripeLoaded, setIsStripeLoaded] = useState(false);
  const [isLiveStripeActive, setIsLiveStripeActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Resolve Stripe Publishable Key (Public key only, never secret keys)
  const activePk =
    publishableKey ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('ct_stripe_pk') || ''
      : '');

  const hasValidPublishableKey = Boolean(activePk && activePk.startsWith('pk_'));

  // 2. Load Stripe.js library only when a publishable key is present
  useEffect(() => {
    if (typeof window === 'undefined' || !hasValidPublishableKey) {
      setIsLiveStripeActive(false);
      if (onCardChange) {
        onCardChange({
          brand: 'unknown',
          last4: '',
          complete: true,
          token: 'pay_in_cab',
          payInCab: true,
        });
      }
      return;
    }

    if (window.Stripe) {
      setIsStripeLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = () => {
      setIsStripeLoaded(true);
    };
    script.onerror = () => {
      setIsLiveStripeActive(false);
    };
    document.head.appendChild(script);
  }, [hasValidPublishableKey]);

  // 3. Mount Stripe Elements if publishable key is available
  useEffect(() => {
    if (!isStripeLoaded || !window.Stripe || !hasValidPublishableKey) {
      setIsLiveStripeActive(false);
      return;
    }

    try {
      const stripe = window.Stripe(activePk);
      const elements = stripe.elements();
      const card = elements.create('card', {
        style: {
          base: {
            fontSize: '14px',
            color: '#1e293b',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            '::placeholder': {
              color: '#94a3b8',
            },
          },
          invalid: {
            color: '#ef4444',
            iconColor: '#ef4444',
          },
        },
      });

      if (mountRef.current) {
        mountRef.current.innerHTML = '';
        card.mount(mountRef.current);
        setIsLiveStripeActive(true);

        card.on('change', async (event: any) => {
          if (event.error) {
            setErrorMessage(event.error.message);
          } else {
            setErrorMessage(null);
          }

          if (!event.complete) {
            onCardChange?.({
              brand: (event.brand as CardBrand) || 'unknown',
              last4: '',
              complete: false,
            });
            return;
          }

          try {
            const result = await stripe.createPaymentMethod({
              type: 'card',
              card,
            });
            if (result.error) {
              setErrorMessage(result.error.message || 'Card verification failed.');
              onCardChange?.({
                brand: (event.brand as CardBrand) || 'unknown',
                last4: '',
                complete: false,
              });
            } else if (result.paymentMethod) {
              onCardChange?.({
                brand: (result.paymentMethod.card?.brand as CardBrand) || (event.brand as CardBrand) || 'unknown',
                last4: result.paymentMethod.card?.last4 || '',
                complete: true,
                token: result.paymentMethod.id,
                payInCab: false,
              });
            }
          } catch (pmErr: any) {
            setErrorMessage(pmErr?.message || 'Unable to tokenize card.');
          }
        });
      }

      return () => {
        try {
          card.destroy();
        } catch {
          // ignore cleanup errors
        }
      };
    } catch (err: any) {
      console.warn('[StripePaymentInput] Error mounting Stripe Elements:', err);
      setIsLiveStripeActive(false);
    }
  }, [isStripeLoaded, activePk, hasValidPublishableKey]);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Top Security & Mode Badge */}
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-1.5 font-bold text-slate-700">
          <ShieldCheckIcon className="w-4 h-4 text-emerald-600" />
          <span>{isLiveStripeActive ? '100% Encrypted & Secure Payment' : 'In-Vehicle Payment Fallback'}</span>
        </div>
        <div className="flex items-center gap-1">
          {isLiveStripeActive ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Stripe Hosted Elements
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              <CreditCardIcon className="w-3 h-3" />
              Pay Driver in Cab
            </span>
          )}
        </div>
      </div>

      {/* Live Stripe Hosted Iframe OR Explicit "Pay Driver in Cab (Cash / Terminal)" Fallback */}
      {isLiveStripeActive ? (
        <div className="p-3.5 bg-white border border-slate-300 rounded-xl shadow-2xs focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
          <div ref={mountRef} id="stripe-card-element" className="min-h-[28px]" />
        </div>
      ) : (
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
            <CreditCardIcon className="w-4 h-4" />
          </div>
          <div className="space-y-1 text-xs">
            <div className="font-bold text-slate-900 flex items-center gap-2">
              <span>Pay Driver in Cab (Cash / Terminal)</span>
              <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                No Upfront Charge
              </span>
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Online card pre-authorization is currently disabled. Pay your driver directly in the cab using cash, contactless tap (Apple Pay / Google Pay), or chip/swipe card terminal upon arrival.
            </p>
          </div>
        </div>
      )}

      {/* Error Feedback */}
      {errorMessage && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 px-1">
          <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {isLiveStripeActive && onSaveCardChange && (
        <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer px-1">
          <input
            type="checkbox"
            checked={saveCardOnFile}
            onChange={(e) => onSaveCardChange(e.target.checked)}
            className="rounded border-slate-300 text-blue-600"
          />
          <span>Save card securely on file for recurring travel</span>
        </label>
      )}

      {isLiveStripeActive && (
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span className="flex items-center gap-1">
            <LockIcon className="w-3 h-3 text-slate-400" />
            End-to-end encrypted via Stripe.js
          </span>
          <span>Zero card data touches our servers</span>
        </div>
      )}
    </div>
  );
}
