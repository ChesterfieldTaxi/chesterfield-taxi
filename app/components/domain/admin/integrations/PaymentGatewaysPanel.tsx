import React, { useEffect, useState } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import { authorizedFetch } from '../../../../core/services/auth/auth-headers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { CreditCardIcon, LockIcon, ShieldCheckIcon, SpinnerIcon } from '../../../ui/Icons';

export interface PaymentGatewaysPanelProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  onNotifySuccess: (message: string) => void;
  isLoading?: boolean;
}

export function PaymentGatewaysPanel({
  settings,
  onSave,
  onNotifySuccess,
  isLoading = false,
}: PaymentGatewaysPanelProps) {
  const [stripeTerminalEnabled, setStripeTerminalEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [stripeMode, setStripeMode] = useState<'test' | 'live'>(() => {
    if (settings.integrations?.payments?.stripe?.mode) {
      return settings.integrations.payments.stripe.mode;
    }
    return typeof window !== 'undefined' && localStorage.getItem('ct_stripe_mode') === 'live'
      ? 'live'
      : 'test';
  });

  const [stripePk, setStripePk] = useState(() => {
    return (
      settings.integrations?.payments?.stripe?.publishableKey ||
      (typeof window !== 'undefined' && localStorage.getItem('ct_stripe_pk')) ||
      ''
    );
  });
  const [stripeSk, setStripeSk] = useState('');
  const [stripeStatus, setStripeStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>(
    settings.integrations?.payments?.stripe?.status || 'idle'
  );
  const [stripeStatusMsg, setStripeStatusMsg] = useState<string | null>(null);

  const [squareAppId, setSquareAppId] = useState(() => {
    return (
      settings.integrations?.payments?.square?.applicationId ||
      (typeof window !== 'undefined' && localStorage.getItem('ct_square_appid')) ||
      ''
    );
  });
  const [squareLocId, setSquareLocId] = useState(() => {
    return (
      settings.integrations?.payments?.square?.locationId ||
      (typeof window !== 'undefined' && localStorage.getItem('ct_square_locid')) ||
      ''
    );
  });
  const [squareToken, setSquareToken] = useState('');
  const [squareStatus, setSquareStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>(
    settings.integrations?.payments?.square?.status || 'idle'
  );
  const [squareStatusMsg, setSquareStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      ['ct_stripe_sk', 'ct_stripe_webhook', 'ct_square_token'].forEach((k) =>
        localStorage.removeItem(k)
      );
    }
    fetch('/api/payments')
      .then((r) => r.json())
      .then((data) => {
        if (data?.stripeConfigured) {
          setStripeStatus('connected');
          setStripeStatusMsg('Server environment STRIPE_SECRET_KEY configured');
        }
        if (data?.squareConfigured) {
          setSquareStatus('connected');
          setSquareStatusMsg('Server environment SQUARE_ACCESS_TOKEN configured');
        }
      })
      .catch(() => {});
  }, []);

  const handleTestStripe = async () => {
    setStripeStatus('checking');
    setStripeStatusMsg('Authenticating with Stripe API...');
    try {
      const resp = await authorizedFetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_processor',
          processor: 'stripe',
          credentials: stripeSk.trim() ? { stripeSecretKey: stripeSk.trim() } : {},
        }),
      });
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setStripeStatus('error');
        setStripeStatusMsg(`Server returned non-JSON response (${resp.status}).`);
        return;
      }
      const data = (await resp.json()) as any;
      if (data.success) {
        setStripeStatus('connected');
        setStripeStatusMsg(data.message || 'Stripe connected successfully!');
        setStripeSk('');
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
      const resp = await authorizedFetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_processor',
          processor: 'square',
          credentials: squareToken.trim() ? { squareAccessToken: squareToken.trim() } : {},
        }),
      });
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setSquareStatus('error');
        setSquareStatusMsg(`Server returned non-JSON response (${resp.status}).`);
        return;
      }
      const data = (await resp.json()) as any;
      if (data.success) {
        setSquareStatus('connected');
        setSquareStatusMsg(data.message || 'Square connected successfully!');
        setSquareToken('');
      } else {
        setSquareStatus('error');
        setSquareStatusMsg(data.error || data.message || 'Square connection failed.');
      }
    } catch (err: any) {
      setSquareStatus('error');
      setSquareStatusMsg(err.message || 'Network error connecting to Square.');
    }
  };

  const handleSaveGateways = async () => {
    setIsSaving(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('ct_stripe_mode', stripeMode);
        localStorage.setItem('ct_stripe_pk', stripePk.trim());
        localStorage.setItem('ct_square_appid', squareAppId.trim());
        localStorage.setItem('ct_square_locid', squareLocId.trim());
        localStorage.removeItem('ct_stripe_sk');
        localStorage.removeItem('ct_stripe_webhook');
        localStorage.removeItem('ct_square_token');
      }
      await onSave({
        integrations: {
          ...settings.integrations,
          payments: {
            stripe: {
              mode: stripeMode,
              publishableKey: stripePk.trim(),
              status: stripeStatus,
            },
            square: {
              applicationId: squareAppId.trim(),
              locationId: squareLocId.trim(),
              status: squareStatus,
            },
          },
        },
      });
      setStripeSk('');
      setSquareToken('');
      onNotifySuccess(
        'Public payment gateway identifiers saved. Secret keys remain strictly in server environment variables.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl border-border-subtle">
      <CardHeader className="border-b border-border-faint pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base font-extrabold text-fg-primary">
              Card Payment Processing (Stripe &amp; Square)
            </CardTitle>
            <CardDescription className="text-xs text-fg-muted">
              Configure online card payments, pre-authorization holds, 1-tap Pay Links, and in-car card readers. Zero client secret storage.
            </CardDescription>
          </div>
          <Badge variant={stripeMode === 'live' ? 'success' : 'warning'} className="self-start sm:self-auto shrink-0">
            {stripeMode === 'live' ? 'Live Production Mode' : 'Test / Sandbox Mode'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-5">
        <div className="p-3.5 rounded-xl border border-status-success-border bg-status-success-bg/50 flex items-start gap-2.5 text-xs text-status-success-fg">
          <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <strong>Zero Client Secret Storage:</strong> Only public publishable/application IDs are saved in configuration.{' '}
            <code className="font-mono">STRIPE_SECRET_KEY</code>, <code className="font-mono">STRIPE_WEBHOOK_SECRET</code>, and{' '}
            <code className="font-mono">SQUARE_ACCESS_TOKEN</code> reside exclusively in Vercel server environment variables.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-border-subtle bg-surface-subtle/50 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-fg-primary">Stripe In-Car Reader</h4>
              <p className="text-xs text-fg-muted">Allow drivers to accept contactless tap and chip cards</p>
            </div>
            <input
              type="checkbox"
              checked={stripeTerminalEnabled}
              onChange={(e) => setStripeTerminalEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 shrink-0"
            />
          </div>

          <div className="p-4 rounded-xl border border-border-subtle bg-surface-subtle/50 space-y-1">
            <h4 className="text-sm font-bold text-fg-primary">Surcharges &amp; Convenience Fees</h4>
            <p className="text-xs text-fg-muted">
              Client-facing surcharges are configured centrally in{' '}
              <a href="/app/admin?tab=rates&sub=surcharges" className="text-blue-600 font-semibold hover:underline">
                Rates &amp; Pricing → Surcharges
              </a>.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border-subtle bg-surface-card">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-fg-primary">Gateway Processing Mode</h4>
            <p className="text-xs text-fg-muted">Switch between Stripe Test Sandbox and Live Production keys.</p>
          </div>
          <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 bg-surface-muted p-1 rounded-lg w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setStripeMode('test')}
              className={`px-3 py-1.5 sm:py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                stripeMode === 'test' ? 'bg-amber-500 text-white shadow-xs' : 'text-fg-secondary'
              }`}
            >
              Test Sandbox
            </button>
            <button
              type="button"
              onClick={() => setStripeMode('live')}
              className={`px-3 py-1.5 sm:py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                stripeMode === 'live' ? 'bg-emerald-600 text-white shadow-xs' : 'text-fg-secondary'
              }`}
            >
              Live Production
            </button>
          </div>
        </div>

        {/* Stripe Section */}
        <div className="p-4 sm:p-5 rounded-2xl border border-indigo-100 bg-status-staged-bg/20 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="w-5 h-5 text-indigo-600 shrink-0" />
              <h3 className="font-extrabold text-fg-primary text-sm">Stripe Gateway</h3>
            </div>
            <Badge variant={stripeStatus === 'connected' ? 'success' : stripeStatus === 'error' ? 'danger' : 'neutral'}>
              {stripeStatus === 'connected' ? 'Server Env Connected' : stripeStatus === 'error' ? 'Connection Error' : 'Unverified'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-fg-secondary">
                Publishable Key ({stripeMode === 'live' ? 'pk_live_...' : 'pk_test_...'})
              </label>
              <input
                type="text"
                value={stripePk}
                onChange={(e) => setStripePk(e.target.value)}
                placeholder={stripeMode === 'live' ? 'pk_live_...' : 'pk_test_...'}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border-subtle bg-surface-card"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-fg-secondary flex items-center gap-1">
                <LockIcon className="w-3 h-3 text-fg-subtle" />
                <span>One-Time Verification Secret (Never Stored)</span>
              </label>
              <input
                type="password"
                value={stripeSk}
                onChange={(e) => setStripeSk(e.target.value)}
                placeholder="Optional: paste sk_... to verify live, or leave blank to test server env"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border-subtle bg-surface-card"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestStripe}
              disabled={stripeStatus === 'checking'}
              className="w-full sm:w-auto justify-center text-xs font-bold text-status-staged-fg border-status-staged-border hover:bg-status-staged-bg"
            >
              {stripeStatus === 'checking' && <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Verify Stripe API Connection
            </Button>
            {stripeStatusMsg && (
              <span className={`text-xs font-medium ${stripeStatus === 'connected' ? 'text-status-success-fg' : 'text-rose-600'}`}>
                {stripeStatusMsg}
              </span>
            )}
          </div>
        </div>

        {/* Square Section */}
        <div className="p-4 sm:p-5 rounded-2xl border border-border-subtle bg-surface-subtle/50 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="w-5 h-5 text-fg-secondary shrink-0" />
              <h3 className="font-extrabold text-fg-primary text-sm">Square Gateway</h3>
            </div>
            <Badge variant={squareStatus === 'connected' ? 'success' : squareStatus === 'error' ? 'danger' : 'neutral'}>
              {squareStatus === 'connected' ? 'Server Env Connected' : squareStatus === 'error' ? 'Connection Error' : 'Unverified'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-fg-secondary">Application ID</label>
              <input
                type="text"
                value={squareAppId}
                onChange={(e) => setSquareAppId(e.target.value)}
                placeholder="sq0idp-..."
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border-subtle bg-surface-card"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-fg-secondary">Location ID</label>
              <input
                type="text"
                value={squareLocId}
                onChange={(e) => setSquareLocId(e.target.value)}
                placeholder="L..."
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border-subtle bg-surface-card"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-fg-secondary flex items-center gap-1">
                <LockIcon className="w-3 h-3 text-fg-subtle" />
                <span>Access Token (Never Stored)</span>
              </label>
              <input
                type="password"
                value={squareToken}
                onChange={(e) => setSquareToken(e.target.value)}
                placeholder="Optional: verify EAAA... or server env"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border-subtle bg-surface-card"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestSquare}
              disabled={squareStatus === 'checking'}
              className="w-full sm:w-auto justify-center text-xs font-bold text-fg-secondary border-border-strong hover:bg-surface-muted"
            >
              {squareStatus === 'checking' && <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Verify Square Connection
            </Button>
            {squareStatusMsg && (
              <span className={`text-xs font-medium ${squareStatus === 'connected' ? 'text-status-success-fg' : 'text-rose-600'}`}>
                {squareStatusMsg}
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="button"
            onClick={handleSaveGateways}
            disabled={isSaving || isLoading}
            className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl cursor-pointer"
          >
            {isSaving && <SpinnerIcon className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Save Payment Gateway Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
