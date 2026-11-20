import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { getAdminAuthService } from '../core/services/auth/admin-auth.service';
import { getBookingService } from '../core/services/booking';
import { getPassengerService } from '../core/services/passenger.service';
import { isFirebaseConfigured } from '../core/services/firebase';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { resolvePostAuthDestination } from '../core/utils/workspace-routing.util';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { CarIcon, LockIcon, MailIcon } from '../components/ui/Icons';

export function meta() {
  return [
    { title: `Sign In – ${COMPANY_CONFIG.name}` },
    {
      name: 'description',
      content: 'Sign in to Chesterfield Taxi for Passenger Portal, Chauffeur HUD, Dispatch, or Administration.',
    },
  ];
}

export default function UnifiedAppLoginRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  const rawRedirect = searchParams.get('redirect');
  const claimTrip = searchParams.get('claimTrip');
  const isClaimingRef = React.useRef(false);

  const claimGuestTripIfPresent = async (uid: string) => {
    if (!claimTrip || !uid) return;
    try {
      const bookingService = getBookingService();
      if (bookingService.updateTrip) {
        await bookingService.updateTrip(claimTrip.toUpperCase(), {
          customerId: uid,
          userId: uid,
        } as any);
      }
    } catch (err) {
      console.warn('[UnifiedAppLoginRoute] Could not link guest trip on login:', err);
    }
  };

  useEffect(() => {
    const message = searchParams.get('message');
    if (message === 'unauthenticated') {
      setError('Please sign in to access your workspace.');
    } else if (message === 'unauthorized') {
      setError('Your account does not have permission to view that console.');
    } else if (message === 'logged_out') {
      setInfoMessage('You have been signed out safely.');
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.clear();
          localStorage.removeItem('chesterfield_taxi_admin_session');
          getPassengerService().clearLocalSession();
        } catch {}
      }
      try {
        getAdminAuthService().signOut().catch(() => {});
      } catch {}
      setIsConfigured(isFirebaseConfigured());
      return;
    }

    setIsConfigured(isFirebaseConfigured());
    const authService = getAdminAuthService();
    const unsubscribe = authService.onAuthStateChanged(async (currentUser) => {
      if (currentUser && !isClaimingRef.current) {
        if (claimTrip) {
          isClaimingRef.current = true;
          await claimGuestTripIfPresent(currentUser.uid);
          isClaimingRef.current = false;
        }
        const dest = resolvePostAuthDestination(currentUser, { rawRedirect });
        navigate(dest, { replace: true });
      }
    });

    return unsubscribe;
  }, [navigate, searchParams, rawRedirect, claimTrip]);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Please enter your email address first, then click Forgot password.');
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      setResetSuccessMessage(null);
      await getAdminAuthService().sendPasswordReset(email);
      setResetSuccessMessage(`Password reset instructions have been sent to ${email.trim()}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to send password reset email.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      isClaimingRef.current = true;
      setError(null);
      setInfoMessage(null);
      const user = await getAdminAuthService().signIn(email, password);
      await claimGuestTripIfPresent(user.uid);
      const dest = resolvePostAuthDestination(user, { rawRedirect });
      navigate(dest, { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes('auth/invalid-credential') || err.message.includes('auth/wrong-password')) {
          setError('Invalid email or password.');
        } else if (err.message.includes('auth/user-not-found')) {
          setError('No account found with this email.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Authentication failed. Please try again.');
      }
    } finally {
      isClaimingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      isClaimingRef.current = true;
      setError(null);
      const user = await getAdminAuthService().signInWithGoogle();
      await claimGuestTripIfPresent(user.uid);
      const dest = resolvePostAuthDestination(user, { rawRedirect });
      navigate(dest, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      isClaimingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleFacebookSignIn = async () => {
    try {
      setIsLoading(true);
      isClaimingRef.current = true;
      setError(null);
      const user = await getAdminAuthService().signInWithFacebook();
      await claimGuestTripIfPresent(user.uid);
      const dest = resolvePostAuthDestination(user, { rawRedirect });
      navigate(dest, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Facebook sign-in failed.');
    } finally {
      isClaimingRef.current = false;
      setIsLoading(false);
    }
  };

  const registerParams = new URLSearchParams();
  if (rawRedirect) registerParams.set('redirect', rawRedirect);
  if (claimTrip) registerParams.set('claimTrip', claimTrip);
  const registerHref = `/app/register${registerParams.toString() ? `?${registerParams.toString()}` : ''}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40 flex flex-col justify-center items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-7">
          <Link
            to="/"
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 mb-4"
          >
            <CarIcon className="w-8 h-8" />
          </Link>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {COMPANY_CONFIG.name} Portal
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Sign in for Passenger Portal, Chauffeur HUD, or Dispatch
          </p>
        </div>

        <Card className="shadow-xl border-slate-200/90 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 pb-4 bg-white">
            <CardTitle className="text-base font-extrabold text-slate-900">Sign In to Your Account</CardTitle>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="p-6 space-y-4 bg-white">
              {error && (
                <Alert variant="error" title="Sign-In Issue">
                  {error}
                </Alert>
              )}
              {infoMessage && (
                <Alert variant="info" title="Signed Out">
                  {infoMessage}
                </Alert>
              )}
              {resetSuccessMessage && (
                <Alert variant="success" title="Reset Link Sent">
                  {resetSuccessMessage}
                </Alert>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <MailIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <LockIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isLoading}
                  className="w-full font-bold"
                >
                  Continue
                </Button>
              </div>

              {isConfigured && (
                <>
                  <div className="relative my-5">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2.5 bg-white text-slate-500 font-medium">Or continue with</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGoogleSignIn}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4">
                        <path fill="currentColor" d="M21.35 11.1H12v2.83h5.36c-.23 1.25-.94 2.31-1.95 3.01v2.5h3.16c1.85-1.7 2.92-4.21 2.92-7.18 0-.4-.04-.79-.14-1.16z" />
                        <path fill="currentColor" d="M12 20.91c2.63 0 4.83-.87 6.44-2.36l-3.16-2.5c-.87.59-1.99.94-3.28.94-2.53 0-4.68-1.71-5.45-4.01H3.28v2.58A9.87 9.87 0 0 0 12 20.91z" />
                        <path fill="currentColor" d="M6.55 12.98c-.19-.58-.3-1.2-.3-1.83s.11-1.25.3-1.83V6.74H3.28a9.92 9.92 0 0 0 0 8.82l3.27-2.58z" />
                        <path fill="currentColor" d="M12 5.05c1.43 0 2.71.49 3.73 1.45l2.79-2.79C16.82 2.15 14.62 1.27 12 1.27 7.55 1.27 3.79 3.93 2 7.74l3.27 2.53c.77-2.3 2.92-4.22 5.45-4.22z" />
                      </svg>
                      Google
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleFacebookSignIn}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 text-blue-600">
                        <path fill="currentColor" d="M14 13.5h2.5l1-4H14v-2c0-1.03.74-1.5 1.5-1.5h2v-3.5c-.32-.05-1.3-.2-2.5-.2-2.8 0-4.5 1.6-4.5 4.5v2.7H8v4h2.5V22h3.5v-8.5z" />
                      </svg>
                      Facebook
                    </Button>
                  </div>
                </>
              )}
            </CardContent>

            <CardFooter className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex flex-col gap-2.5 items-center text-center">
              <p className="text-xs sm:text-sm text-slate-600">
                New passenger?{' '}
                <Link to={registerHref} className="font-bold text-blue-600 hover:underline">
                  Create an account
                </Link>
              </p>
              <p className="text-xs text-slate-500">
                Need a quick ride without an account?{' '}
                <Link to="/book" className="font-semibold text-slate-700 hover:text-blue-600 underline">
                  Book as Guest
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
