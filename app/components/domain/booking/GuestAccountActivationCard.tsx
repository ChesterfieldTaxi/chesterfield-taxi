import React, { useState } from 'react';
import { Link } from 'react-router';
import { getAdminAuthService } from '../../../core/services/auth/admin-auth.service';
import type { Trip } from '../../../core/types';
import { buildGuestAccountSignupHref, claimGuestTripsForUser, parseClaimTripIds } from '../../../core/utils/guest-trip-claim.util';
import { CheckIcon, LockIcon, MailIcon, ShieldCheckIcon, SparklesIcon, SpinnerIcon } from '../../ui/Icons';

export interface GuestAccountActivationCardProps {
  trip: Trip;
  onActivated?: (uid: string, claimedIds: string[]) => void;
}

export function GuestAccountActivationCard({ trip, onActivated }: GuestAccountActivationCardProps) {
  const meta = (trip.metadata || {}) as Record<string, unknown>;
  const returnTripId =
    (typeof meta.returnTripId === 'string' && meta.returnTripId) ||
    (typeof trip.linkedReturnTripId === 'string' && trip.linkedReturnTripId) ||
    null;
  const claimIds = parseClaimTripIds([trip.id, returnTripId]);

  const initialName = `${trip.passenger?.firstName || ''} ${trip.passenger?.lastName || ''}`.trim();
  const initialEmail = (trip.passenger?.email || '').trim();
  const initialPhone = (trip.passenger?.phone || '').trim();

  const [email, setEmail] = useState<string>(initialEmail);
  const [password, setPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activatedUid, setActivatedUid] = useState<string | null>(null);

  const loginQs = new URLSearchParams();
  if (claimIds.length > 0) loginQs.set('claimTrip', claimIds.join(','));
  if (email.trim()) loginQs.set('email', email.trim());
  const loginHref = `/app/login${loginQs.toString() ? `?${loginQs.toString()}` : ''}`;
  const registerHref = buildGuestAccountSignupHref({ tripIds: claimIds, email, name: initialName, phone: initialPhone });

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email address to activate your account.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    try {
      setIsSubmitting(true);
      setError(null);
      const user = await getAdminAuthService().registerWithEmail(
        email.trim(), password, 'customer', initialName || undefined,
        { phone: initialPhone || undefined, firstName: trip.passenger?.firstName || undefined, lastName: trip.passenger?.lastName || undefined }
      );
      const claimRes = await claimGuestTripsForUser(user.uid, claimIds);
      setActivatedUid(user.uid);
      onActivated?.(user.uid, claimRes.claimedIds);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Account activation failed.';
      if (msg.includes('email-already-in-use')) setError('An account with this email already exists. Sign in below to claim this ride.');
      else if (msg.includes('weak-password')) setError('Password must be at least 6 characters.');
      else setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleActivate = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      const user = await getAdminAuthService().signInWithGoogle('customer');
      const claimRes = await claimGuestTripsForUser(user.uid, claimIds);
      setActivatedUid(user.uid);
      onActivated?.(user.uid, claimRes.claimedIds);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (activatedUid) {
    return (
      <div data-guest-activation-card="activated" className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
            <CheckIcon className="w-4 h-4 stroke-[3]" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-emerald-950">Account Activated &amp; {claimIds.length > 1 ? 'Rides' : 'Ride'} Saved</h3>
            <p className="text-xs text-emerald-800 mt-0.5">Linked {claimIds.map((id) => `#${id}`).join(' & ')} to <strong>{email}</strong>.</p>
          </div>
        </div>
        <Link to="/app/passenger" className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-xs text-center shrink-0 transition-colors">
          Open Client Portal &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div data-guest-activation-card="true" data-claim-trip-ids={claimIds.join(',')} className="p-4 sm:p-5 rounded-2xl bg-slate-950 text-white border border-blue-500/40 shadow-md space-y-3.5 print:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-400">
            <SparklesIcon className="w-3.5 h-3.5 shrink-0" /><span>1-Step Free Account Activation</span>
          </div>
          <h3 className="text-base font-extrabold tracking-tight text-white">
            Save {claimIds.length > 1 ? `Trips ${claimIds.map((id) => `#${id}`).join(' & ')}` : `Trip #${trip.id}`} &amp; Rebook in Seconds
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Your details are already filled in—just set a password to track live arrivals, store favorite addresses, and access instant receipts.
          </p>
        </div>
        <ShieldCheckIcon className="w-5 h-5 text-blue-400 shrink-0 hidden sm:block" />
      </div>

      <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          {initialName && <span className="font-bold text-white">{initialName}</span>}
          {initialPhone && <span className="text-slate-400 font-mono text-[11px]">{initialPhone}</span>}
        </div>
        {initialEmail ? <span className="text-blue-300 font-semibold truncate">{initialEmail}</span> : null}
      </div>

      {error && <div className="px-3 py-2 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs font-semibold">{error}</div>}

      <form onSubmit={handleActivate} className="space-y-2.5">
        {!initialEmail && (
          <div className="relative">
            <MailIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address" className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500" />
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <LockIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password (min. 6 chars)" className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500" />
          </div>
          <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-extrabold shadow-xs cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0">
            {isSubmitting ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : null}
            <span>Activate Free Account &amp; Save Ride</span>
          </button>
        </div>
      </form>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-800/90 text-xs">
        <button type="button" disabled={isSubmitting} onClick={handleGoogleActivate} className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
          <span>Continue with Google</span>
        </button>
        <div className="text-[11px] text-slate-400 text-center sm:text-right">
          Already have an account?{' '}
          <Link to={loginHref} className="text-blue-400 hover:text-blue-300 font-bold underline">Sign in</Link>
          <span className="mx-1.5 text-slate-700">&middot;</span>
          <Link to={registerHref} className="text-slate-300 hover:text-white underline">Full signup form</Link>
        </div>
      </div>
    </div>
  );
}
