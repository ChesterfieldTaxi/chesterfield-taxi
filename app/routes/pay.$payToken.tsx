/**
 * Standalone Public 1-Tap Checkout & Official Receipt Page (`/pay/:payToken`)
 *
 * Security & Privacy:
 * - Consumes strictly sanitized Zero-PII `PayLinkProjection` data (never passenger
 *   phone/email, gate codes, or corporate PO history).
 * - Server-authoritative Stripe `PaymentIntent` creation (`baseAmount + tipAmount`)
 *   and server-verified confirmation (`POST /api/pay`).
 * - Supports Apple Pay, Google Pay, and Credit/Debit cards via Stripe Payment Element
 *   (`https://js.stripe.com/v3/`), with graceful fallback when Stripe is unconfigured.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { data as routerData, Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { COMPANY_CONFIG } from '../config/companyConfig';
import {
  AlertCircleIcon,
  BuildingIcon,
  CarIcon,
  CheckIcon,
  CreditCardIcon,
  LockIcon,
  PhoneIcon,
  ShieldCheckIcon,
  SpinnerIcon,
} from '../components/ui/Icons';
import { getPayLinkService } from '../core/services/payments/pay-link.service';
import { lookupPublicPayLinkServer } from '../core/services/payments/pay-link.server';
import type { PayLinkProjection } from '../core/utils/pay-token.util';

declare global {
  interface Window {
    Stripe?: any;
  }
}

export const meta: MetaFunction = ({ data: metaData }) => {
  const typed = metaData as { payLink?: PayLinkProjection | null } | undefined;
  const ref = typed?.payLink?.referenceNumber ? ` ${typed.payLink.referenceNumber}` : '';
  return [
    { title: `Secure Payment${ref} | ${COMPANY_CONFIG.name}` },
    {
      name: 'description',
      content: `Complete your secure ${COMPANY_CONFIG.name} ride or corporate statement payment.`,
    },
    { name: 'robots', content: 'noindex, nofollow' },
  ];
};

export async function loader({ params }: LoaderFunctionArgs) {
  const rawToken = String(params.payToken || '').trim();
  const lookup = await lookupPublicPayLinkServer(rawToken);
  return routerData(
    {
      payToken: rawToken,
      found: lookup.found,
      payLink: lookup.payLink,
      stripeConfigured: lookup.stripeConfigured,
      stripePublishableKey: lookup.stripePublishableKey || null,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

type TipMode = 'none' | 15 | 20 | 25 | 'custom';

export default function PublicPayLinkCheckoutPage() {
  const loaderData = useLoaderData<typeof loader>() as {
    payToken: string;
    found: boolean;
    payLink: PayLinkProjection | null;
    stripeConfigured: boolean;
    stripePublishableKey: string | null;
  };

  const [payLink, setPayLink] = useState<PayLinkProjection | null>(loaderData.payLink);
  const [stripeConfigured, setStripeConfigured] = useState<boolean>(loaderData.stripeConfigured);
  const [publishableKey, setPublishableKey] = useState<string>(
    loaderData.stripePublishableKey || ''
  );

  // Tip State (only active when `payLink.allowTip === true` and `status === 'open'`)
  const [tipMode, setTipMode] = useState<TipMode>(loaderData.payLink?.allowTip ? 15 : 'none');
  const [customTipStr, setCustomTipStr] = useState<string>('');

  // Stripe Payment Element State
  const [isStripeScriptReady, setIsStripeScriptReady] = useState<boolean>(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [activeIntentId, setActiveIntentId] = useState<string | null>(null);
  const [isPreparingIntent, setIsPreparingIntent] = useState<boolean>(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const paymentElementMountRef = useRef<HTMLDivElement | null>(null);
  const stripeInstanceRef = useRef<any>(null);
  const elementsInstanceRef = useRef<any>(null);

  // Sync state if route token changes or hydrate local Stripe publishable key fallback post-mount
  useEffect(() => {
    setPayLink(loaderData.payLink);
    setStripeConfigured(loaderData.stripeConfigured);
    if (loaderData.stripePublishableKey) {
      setPublishableKey(loaderData.stripePublishableKey);
    } else if (typeof window !== 'undefined') {
      setPublishableKey(localStorage.getItem('ct_stripe_pk') || '');
    }
    setTipMode(loaderData.payLink?.allowTip ? 15 : 'none');
    setCustomTipStr('');
    setCheckoutError(null);
  }, [loaderData.payToken]);

  const baseAmount = payLink?.baseAmount ?? 0;

  const selectedTipAmount = useMemo(() => {
    if (!payLink || !payLink.allowTip) return 0;
    if (tipMode === 'none') return 0;
    if (tipMode === 'custom') {
      const parsed = Number.parseFloat(customTipStr);
      if (!Number.isFinite(parsed) || parsed < 0) return 0;
      return Number(parsed.toFixed(2));
    }
    return Number(((baseAmount * tipMode) / 100).toFixed(2));
  }, [payLink, tipMode, customTipStr, baseAmount]);

  const totalToPay = useMemo(
    () => Number((baseAmount + selectedTipAmount).toFixed(2)),
    [baseAmount, selectedTipAmount]
  );

  const hasValidPk = Boolean(publishableKey && publishableKey.startsWith('pk_'));
  const canUseLiveStripe = stripeConfigured && hasValidPk;

  // Handle redirect return from 3D Secure / Wallet flows (`?payment_intent=pi_...` or `?setup_intent=seti_...`)
  useEffect(() => {
    if (typeof window === 'undefined' || !payLink || payLink.status === 'paid') return;
    const params = new URLSearchParams(window.location.search);
    const redirectedSeti = params.get('setup_intent');
    const redirectedPi = params.get('payment_intent');
    const redirectStatus = params.get('redirect_status');
    if (
      payLink.targetType === 'card_setup' &&
      redirectedSeti &&
      (!redirectStatus || redirectStatus === 'succeeded')
    ) {
      setIsSubmittingPayment(true);
      getPayLinkService()
        .confirmCardSetup(payLink.payToken, redirectedSeti)
        .then((res) => {
          if (res.success && res.payLink) {
            setPayLink(res.payLink);
            setCheckoutError(null);
          } else if (res.error) {
            setCheckoutError(res.error);
          }
        })
        .finally(() => setIsSubmittingPayment(false));
      return;
    }
    if (redirectedPi && (!redirectStatus || redirectStatus === 'succeeded')) {
      setIsSubmittingPayment(true);
      getPayLinkService()
        .confirmPayment(payLink.payToken, redirectedPi)
        .then((res) => {
          if (res.success && res.payLink) {
            setPayLink(res.payLink);
            setCheckoutError(null);
          } else if (res.error) {
            setCheckoutError(res.error);
          }
        })
        .finally(() => setIsSubmittingPayment(false));
    }
  }, [payLink?.payToken]);

  // Load Stripe.js script when configured
  useEffect(() => {
    if (typeof window === 'undefined' || !canUseLiveStripe || payLink?.status !== 'open') {
      return;
    }
    if (window.Stripe) {
      setIsStripeScriptReady(true);
      return;
    }

    const existingScript = document.querySelector(
      'script[src="https://js.stripe.com/v3/"]'
    ) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => setIsStripeScriptReady(true));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = () => setIsStripeScriptReady(true);
    script.onerror = () => {
      setCheckoutError(
        'Unable to load Stripe secure payment script. Please check your connection or call (314) 738-0100.'
      );
    };
    document.head.appendChild(script);
  }, [canUseLiveStripe, payLink?.status]);

  // Create/refresh server-authoritative PaymentIntent when open & tip changes
  useEffect(() => {
    if (!payLink || payLink.status !== 'open') return;

    const timer = setTimeout(async () => {
      setIsPreparingIntent(true);
      setCheckoutError(null);
      const intentRes = await getPayLinkService().createCheckoutIntent(
        payLink.payToken,
        selectedTipAmount
      );
      setIsPreparingIntent(false);

      if (intentRes.payLink && intentRes.payLink.status === 'paid') {
        setPayLink(intentRes.payLink);
        return;
      }

      if (!intentRes.stripeConfigured) {
        setStripeConfigured(false);
        setClientSecret(null);
        setFallbackNotice(
          intentRes.message ||
            'Online card checkout is not currently enabled. Please pay your driver directly in the car or call Chesterfield Taxi Dispatch at (314) 738-0100.'
        );
        return;
      }

      if (intentRes.success && intentRes.clientSecret) {
        setClientSecret(intentRes.clientSecret);
        setActiveIntentId(intentRes.setupIntentId || intentRes.paymentIntentId || null);
        setFallbackNotice(null);
      } else if (intentRes.error) {
        setCheckoutError(intentRes.error);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [payLink?.payToken, payLink?.status, selectedTipAmount]);

  // Mount Stripe Payment Element (Apple Pay / Google Pay / Cards) whenever clientSecret updates
  useEffect(() => {
    if (
      !isStripeScriptReady ||
      !window.Stripe ||
      !hasValidPk ||
      !clientSecret ||
      !paymentElementMountRef.current ||
      payLink?.status !== 'open'
    ) {
      return;
    }

    let paymentElement: any = null;
    try {
      const stripe = window.Stripe(publishableKey);
      stripeInstanceRef.current = stripe;

      const elements = stripe.elements({
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#2563eb',
            colorBackground: '#ffffff',
            colorText: '#0f172a',
            colorDanger: '#dc2626',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            borderRadius: '12px',
          },
        },
      });
      elementsInstanceRef.current = elements;

      paymentElement = elements.create('payment', {
        layout: 'tabs',
        wallets: {
          applePay: 'auto',
          googlePay: 'auto',
        },
      });

      paymentElementMountRef.current.innerHTML = '';
      paymentElement.mount(paymentElementMountRef.current);
    } catch (err: any) {
      setCheckoutError(err?.message || 'Failed to initialize secure payment form.');
    }

    return () => {
      if (paymentElement) {
        try {
          paymentElement.destroy();
        } catch {
          // Ignore unmount cleanup errors
        }
      }
    };
  }, [isStripeScriptReady, hasValidPk, publishableKey, clientSecret, payLink?.status]);

  const handleSubmitStripeCheckout = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!payLink || !stripeInstanceRef.current || !elementsInstanceRef.current) return;

      setIsSubmittingPayment(true);
      setCheckoutError(null);

      try {
        const stripe = stripeInstanceRef.current;
        const elements = elementsInstanceRef.current;

        if (payLink.targetType === 'card_setup') {
          const setupConfirmResult = await stripe.confirmSetup({
            elements,
            confirmParams: {
              return_url: window.location.href,
            },
            redirect: 'if_required',
          });

          if (setupConfirmResult.error) {
            setCheckoutError(
              setupConfirmResult.error.message ||
                'Card setup could not be completed. Please verify your card details.'
            );
            setIsSubmittingPayment(false);
            return;
          }

          const confirmedSetiId = setupConfirmResult.setupIntent?.id || activeIntentId;
          if (!confirmedSetiId) {
            setCheckoutError('Unable to verify card setup confirmation reference.');
            setIsSubmittingPayment(false);
            return;
          }

          const serverSetup = await getPayLinkService().confirmCardSetup(
            payLink.payToken,
            confirmedSetiId
          );

          if (serverSetup.success && serverSetup.payLink) {
            setPayLink(serverSetup.payLink);
          } else {
            setCheckoutError(
              serverSetup.error ||
                'Card setup is processing. Please refresh in a moment to verify.'
            );
          }
          setIsSubmittingPayment(false);
          return;
        }

        const confirmResult = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: window.location.href,
          },
          redirect: 'if_required',
        });

        if (confirmResult.error) {
          setCheckoutError(
            confirmResult.error.message || 'Payment could not be completed. Please verify your card details.'
          );
          setIsSubmittingPayment(false);
          return;
        }

        const confirmedPiId = confirmResult.paymentIntent?.id || activeIntentId;
        if (!confirmedPiId) {
          setCheckoutError('Unable to verify payment confirmation reference.');
          setIsSubmittingPayment(false);
          return;
        }

        const serverConfirm = await getPayLinkService().confirmPayment(
          payLink.payToken,
          confirmedPiId
        );

        if (serverConfirm.success && serverConfirm.payLink) {
          setPayLink(serverConfirm.payLink);
        } else {
          setCheckoutError(
            serverConfirm.error || 'Payment is processing. Please refresh in a moment to view your receipt.'
          );
        }
      } catch (err: any) {
        setCheckoutError(err?.message || 'Unexpected error submitting payment.');
      } finally {
        setIsSubmittingPayment(false);
      }
    },
    [payLink, activeIntentId]
  );

  const handleRefreshStatus = useCallback(async () => {
    if (!loaderData.payToken) return;
    const latest = await getPayLinkService().fetchPublicPayLink(loaderData.payToken);
    if (latest.success && latest.payLink) {
      setPayLink(latest.payLink);
    }
  }, [loaderData.payToken]);

  const isInvoice = payLink?.targetType === 'invoice';
  const isCardSetup = payLink?.targetType === 'card_setup';

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 flex flex-col print:bg-white">
      {/* Executive Clean Standalone Header */}
      <header className="bg-slate-950 text-white border-b border-slate-800 print:bg-white print:text-slate-900 print:border-slate-200">
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 min-w-0 group">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0 print:border print:border-slate-300 print:text-slate-900 print:bg-slate-100">
              CT
            </div>
            <div className="min-w-0">
              <div className="font-black text-sm sm:text-base tracking-tight truncate">
                {COMPANY_CONFIG.name}
              </div>
              <div className="text-[11px] text-slate-400 print:text-slate-500 flex items-center gap-1">
                <LockIcon className="w-3 h-3 text-emerald-400 print:text-emerald-600 shrink-0" />
                <span>256-Bit Encrypted Payment Portal</span>
              </div>
            </div>
          </Link>

          <a
            href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 transition-colors shrink-0 print:hidden"
          >
            <PhoneIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>{COMPANY_CONFIG.phone.dispatch}</span>
          </a>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* ─── STATE 1: Link Missing ─── */}
        {!payLink ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 mx-auto flex items-center justify-center">
              <AlertCircleIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-black text-slate-900">Payment Link Not Found</h1>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                This payment link may be invalid or no longer active. Please contact our 24/7 dispatch desk for an updated link.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <a
                href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center justify-center gap-2"
              >
                <PhoneIcon className="w-4 h-4" />
                <span>Call Dispatch {COMPANY_CONFIG.phone.dispatch}</span>
              </a>
              <Link
                to="/book"
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs inline-flex items-center justify-center"
              >
                Book a Ride
              </Link>
            </div>
          </div>
        ) : payLink.status === 'paid' ? (
          /* ─── STATE 2: Instant Paid Receipt View ─── */
          <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden print:border-slate-300 print:shadow-none">
            <div className="bg-emerald-600 text-white px-6 py-6 text-center space-y-2 print:bg-white print:text-slate-900 print:border-b print:border-slate-200">
              <div className="w-12 h-12 rounded-full bg-white/20 text-white mx-auto flex items-center justify-center border border-white/40 print:bg-emerald-50 print:text-emerald-700 print:border-emerald-300">
                <CheckIcon className="w-6 h-6" />
              </div>
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-100 print:text-emerald-700">
                {isCardSetup ? 'Card Vault Confirmation' : 'Official Payment Receipt'}
              </div>
              <h1 className="text-2xl font-black tracking-tight">
                {isCardSetup ? (
                  'Card Saved Securely'
                ) : (
                  <>
                    ${(payLink.totalPaidAmount ?? payLink.baseAmount + (payLink.tipAmount || 0)).toFixed(2)}{' '}
                    <span className="text-sm font-bold opacity-85">{payLink.currency}</span>
                  </>
                )}
              </h1>
              <p className="text-xs text-emerald-50 print:text-slate-600">
                {isCardSetup
                  ? `Saved on file ($0.00 charged today) · Ready for future rides with ${COMPANY_CONFIG.name}`
                  : `Paid in full · Thank you for choosing ${COMPANY_CONFIG.name}`}
              </p>
            </div>

            <div className="p-5 sm:p-6 space-y-5 text-xs">
              {/* Receipt Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Receipt Number
                  </span>
                  <span className="font-mono font-extrabold text-slate-900 text-xs">
                    {payLink.receiptNumber || 'RCT-VERIFIED'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Reference
                  </span>
                  <span className="font-mono font-extrabold text-blue-700 text-xs">
                    {payLink.referenceNumber}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    {isInvoice ? 'Organization' : 'Passenger'}
                  </span>
                  <span className="font-bold text-slate-800">{payLink.customerLabel}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Date Paid
                  </span>
                  <span className="font-mono text-slate-700">
                    {payLink.paidAt ? new Date(payLink.paidAt).toLocaleString() : 'Confirmed'}
                  </span>
                </div>
                {payLink.cardLast4 && (
                  <div className="col-span-2 pt-1 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-slate-500">Payment Method</span>
                    <span className="font-mono font-bold text-slate-800 uppercase">
                      {payLink.cardBrand || 'Card'} •••• {payLink.cardLast4}
                    </span>
                  </div>
                )}
              </div>

              {/* Service Summary */}
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {isInvoice ? 'Settled Statement Items' : 'Trip & Fare Summary'}
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="font-semibold text-slate-800">{payLink.summaryLabel}</div>
                  <div className="divide-y divide-slate-100 border-t border-slate-100 pt-1">
                    {payLink.lineItems.map((item, idx) => (
                      <div key={idx} className="py-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800">{item.label}</div>
                          {item.detail && (
                            <div className="text-[11px] text-slate-500">{item.detail}</div>
                          )}
                        </div>
                        <span className="font-mono font-bold text-slate-900 shrink-0">
                          ${item.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {(payLink.tipAmount || 0) > 0 && (
                      <div className="py-2 flex items-center justify-between text-emerald-700 font-bold">
                        <span>Driver Gratuity (100% Pass-Through)</span>
                        <span className="font-mono">+${(payLink.tipAmount || 0).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="pt-2.5 flex items-center justify-between text-sm font-black text-slate-900">
                      <span>Total Settled</span>
                      <span className="font-mono text-emerald-700">
                        ${(payLink.totalPaidAmount ?? payLink.baseAmount + (payLink.tipAmount || 0)).toFixed(2)}{' '}
                        {payLink.currency}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer transition-colors"
                >
                  Print / Save PDF Receipt
                </button>
                <Link
                  to="/"
                  className="py-3 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs text-center transition-colors"
                >
                  Return Home
                </Link>
              </div>
            </div>
          </div>
        ) : payLink.status !== 'open' ? (
          /* ─── STATE 3: Expired / Cancelled / Refunded Link ─── */
          <div className="bg-white rounded-2xl border border-amber-200 shadow-xs p-6 sm:p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 mx-auto flex items-center justify-center">
              <AlertCircleIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800">
                Link {payLink.status}
              </span>
              <h1 className="text-lg font-black text-slate-900 pt-1">
                Payment Link {payLink.status === 'expired' ? 'Expired' : 'Unavailable'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Reference <strong className="font-mono">{payLink.referenceNumber}</strong> is currently marked{' '}
                <strong>{payLink.status}</strong>. Please contact our 24/7 dispatch desk if you need an updated payment link.
              </p>
            </div>
            <div className="pt-2">
              <a
                href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
              >
                <PhoneIcon className="w-4 h-4" />
                <span>Call Dispatch {COMPANY_CONFIG.phone.dispatch}</span>
              </a>
            </div>
          </div>
        ) : (
          /* ─── STATE 4: Active Open 1-Tap Checkout ─── */
          <div className="space-y-4">
            {/* Top Summary & Itemized Breakdown Card */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-300 flex items-center justify-center shrink-0">
                    {isInvoice ? (
                      <BuildingIcon className="w-4 h-4" />
                    ) : (
                      <CarIcon className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {isCardSetup
                        ? 'Card on File Vault Setup'
                        : isInvoice
                        ? 'Corporate Statement'
                        : 'Chesterfield Taxi Ride'}
                    </div>
                    <div className="font-mono font-black text-sm text-white truncate">
                      {payLink.referenceNumber}
                    </div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 shrink-0">
                  <ShieldCheckIcon className="w-3.5 h-3.5" />
                  <span>Verified</span>
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      {isInvoice ? 'Billed Organization' : 'Passenger'}
                    </span>
                    <span className="font-extrabold text-slate-900 text-sm">
                      {payLink.customerLabel}
                    </span>
                  </div>
                  {(payLink.billingPeriod || payLink.serviceDate) && (
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        {isInvoice ? 'Billing Period' : 'Service Date'}
                      </span>
                      <span className="font-mono font-semibold text-slate-700">
                        {payLink.billingPeriod || payLink.serviceDate}
                      </span>
                    </div>
                  )}
                </div>

                {/* Route Timeline for Trips */}
                {!isInvoice && (payLink.pickupDisplay || payLink.dropoffDisplay) ? (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                    {payLink.pickupDisplay && (
                      <div className="flex items-start gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">
                            Pickup
                          </span>
                          <span className="font-semibold text-slate-800">
                            {payLink.pickupDisplay}
                          </span>
                        </div>
                      </div>
                    )}
                    {payLink.dropoffDisplay && (
                      <div className="flex items-start gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">
                            Destination
                          </span>
                          <span className="font-semibold text-slate-800">
                            {payLink.dropoffDisplay}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 font-semibold text-slate-800">
                    {payLink.summaryLabel}
                  </div>
                )}

                {/* Itemized Line Items */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Itemized Breakdown
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl px-3.5 max-h-60 overflow-y-auto">
                    {payLink.lineItems.map((item, idx) => (
                      <div key={idx} className="py-2.5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800">{item.label}</div>
                          {item.detail && (
                            <div className="text-[11px] text-slate-500 truncate">{item.detail}</div>
                          )}
                        </div>
                        <span className="font-mono font-bold text-slate-900 shrink-0">
                          ${item.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subtotal Row */}
                <div className="flex items-center justify-between pt-1 text-xs font-bold text-slate-700">
                  <span>{isInvoice ? 'Statement Balance' : 'Ride Fare Subtotal'}</span>
                  <span className="font-mono text-sm font-extrabold text-slate-900">
                    ${payLink.baseAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Optional Driver Gratuity Selector (Trips Only) */}
            {payLink.allowTip && (
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                      Add Driver Gratuity
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      100% of your tip goes directly to your Chesterfield Taxi driver
                    </p>
                  </div>
                  {selectedTipAmount > 0 && (
                    <span className="font-mono text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                      +${selectedTipAmount.toFixed(2)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                  {(
                    [
                      { id: 15 as const, label: '15%' },
                      { id: 20 as const, label: '20%' },
                      { id: 25 as const, label: '25%' },
                      { id: 'custom' as const, label: 'Custom' },
                      { id: 'none' as const, label: 'No Tip' },
                    ]
                  ).map((opt) => {
                    const active = tipMode === opt.id;
                    const pctDollar =
                      typeof opt.id === 'number'
                        ? Number(((baseAmount * opt.id) / 100).toFixed(2))
                        : null;
                    return (
                      <button
                        key={String(opt.id)}
                        type="button"
                        onClick={() => setTipMode(opt.id)}
                        className={`py-2.5 px-1.5 min-h-[48px] rounded-xl border text-center transition-all cursor-pointer ${
                          active
                            ? 'bg-blue-600 border-blue-600 text-white shadow-xs font-extrabold'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-bold'
                        }`}
                      >
                        <div className="text-xs">{opt.label}</div>
                        {pctDollar !== null && (
                          <div
                            className={`text-[10px] font-mono ${
                              active ? 'text-blue-100' : 'text-slate-500'
                            }`}
                          >
                            ${pctDollar.toFixed(2)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {tipMode === 'custom' && (
                  <div className="pt-1 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600">Custom Tip ($ USD):</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.50"
                      placeholder="0.00"
                      value={customTipStr}
                      onChange={(e) => setCustomTipStr(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Payment Element OR Graceful Fallback Card */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Total Due Now
                  </span>
                  <span className="text-2xl font-black font-mono text-slate-900 tabular-nums">
                    ${totalToPay.toFixed(2)}{' '}
                    <span className="text-xs font-bold text-slate-500">{payLink.currency}</span>
                  </span>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  <div>Apple Pay &middot; Google Pay</div>
                  <div>Visa &middot; Mastercard &middot; Amex</div>
                </div>
              </div>

              {canUseLiveStripe ? (
                <form onSubmit={handleSubmitStripeCheckout} className="space-y-4">
                  <div className="min-h-[120px] relative">
                    {isPreparingIntent && !clientSecret && (
                      <div className="py-8 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
                        <SpinnerIcon className="w-4 h-4 animate-spin text-blue-600" />
                        <span>Initializing encrypted payment session...</span>
                      </div>
                    )}
                    <div ref={paymentElementMountRef} id="ct-paylink-payment-element" />
                  </div>

                  {checkoutError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2">
                      <AlertCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{checkoutError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmittingPayment || isPreparingIntent || !clientSecret}
                    className="w-full py-3.5 px-5 min-h-[52px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-sm shadow-sm cursor-pointer flex items-center justify-center gap-2 transition-colors"
                  >
                    {isSubmittingPayment ? (
                      <>
                        <SpinnerIcon className="w-4 h-4 animate-spin" />
                        <span>Verifying Payment...</span>
                      </>
                    ) : (
                      <>
                        <LockIcon className="w-4 h-4" />
                        <span>
                          {isCardSetup
                            ? 'Save Card Securely ($0.00 Today)'
                            : `Pay $${totalToPay.toFixed(2)} ${payLink.currency} Securely`}
                        </span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                      PCI-DSS Level 1 Encrypted via Stripe
                    </span>
                    <span>Card details never touch our servers</span>
                  </div>
                </form>
              ) : (
                /* Graceful Unconfigured Fallback Card */
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
                      <CreditCardIcon className="w-4 h-4" />
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="font-extrabold text-slate-900">
                        {isInvoice
                          ? 'Direct Dispatch / Billing Settlement'
                          : 'Pay Driver in Car or Contact Dispatch'}
                      </div>
                      <p className="text-slate-600 leading-relaxed">
                        {fallbackNotice ||
                          'Online card checkout is not currently active on this terminal. You may pay your driver directly in the car (Tap / Apple Pay / Google Pay / Card / Cash) or call Chesterfield Taxi Dispatch at (314) 738-0100.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                    <a
                      href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5"
                    >
                      <PhoneIcon className="w-3.5 h-3.5" />
                      <span>Call Dispatch {COMPANY_CONFIG.phone.dispatch}</span>
                    </a>
                    <button
                      type="button"
                      onClick={handleRefreshStatus}
                      className="py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-white text-slate-700 font-bold text-xs cursor-pointer"
                    >
                      Refresh Status
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="py-6 text-center text-[11px] text-slate-400 print:text-slate-500">
        &copy; {new Date().getFullYear()} {COMPANY_CONFIG.legalName} &middot; {COMPANY_CONFIG.address.formatted}
      </footer>
    </div>
  );
}
