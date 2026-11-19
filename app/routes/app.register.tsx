import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { getAdminAuthService } from '../core/services/auth/admin-auth.service';
import { getBookingService } from '../core/services/booking';
import { isFirebaseConfigured } from '../core/services/firebase';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { resolvePostAuthDestination } from '../core/utils/workspace-routing.util';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardFooter } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { CarIcon, LockIcon, MailIcon, UserIcon } from '../components/ui/Icons';

export function meta() {
  return [
    { title: `Create Account – ${COMPANY_CONFIG.name}` },
    { name: 'description', content: 'Register for a Chesterfield Taxi passenger account.' },
  ];
}

export default function UnifiedAppRegisterRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  const claimTripId = searchParams.get('claimTrip');
  const rawRedirect = searchParams.get('redirect');

  useEffect(() => {
    setIsConfigured(isFirebaseConfigured());
    const authService = getAdminAuthService();
    const unsubscribe = authService.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        const dest = resolvePostAuthDestination(currentUser, { rawRedirect });
        navigate(dest, { replace: true });
      }
    });
    return unsubscribe;
  }, [navigate, rawRedirect]);

  const claimGuestTripIfPresent = async (uid: string) => {
    if (!claimTripId || !uid) return;
    try {
      const bookingService = getBookingService();
      if (bookingService.updateTrip) {
        await bookingService.updateTrip(claimTripId, { customerId: uid } as any);
      }
    } catch (err) {
      console.warn('[UnifiedAppRegisterRoute] Could not link guest trip to new user:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError(null);
      const authService = getAdminAuthService();
      const user = await authService.registerWithEmail(email, password, 'customer', displayName);
      await claimGuestTripIfPresent(user.uid);
      const dest = resolvePostAuthDestination(user, { rawRedirect });
      navigate(dest, { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes('email-already-in-use')) {
          setError('An account already exists with this email address.');
        } else if (err.message.includes('weak-password')) {
          setError('Password should be at least 6 characters.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const user = await getAdminAuthService().signInWithGoogle('customer');
      await claimGuestTripIfPresent(user.uid);
      const dest = resolvePostAuthDestination(user, { rawRedirect });
      navigate(dest, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-up failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFacebookSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const user = await getAdminAuthService().signInWithFacebook('customer');
      await claimGuestTripIfPresent(user.uid);
      const dest = resolvePostAuthDestination(user, { rawRedirect });
      navigate(dest, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Facebook sign-up failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const loginParams = new URLSearchParams();
  if (rawRedirect) loginParams.set('redirect', rawRedirect);
  if (claimTripId) loginParams.set('claimTrip', claimTripId);
  const loginHref = `/app/login${loginParams.toString() ? `?${loginParams.toString()}` : ''}`;

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
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Create Passenger Account</h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Save favorite pickup spots, view digital receipts, and rebook in two taps
          </p>
        </div>

        <Card className="shadow-xl border-slate-200/90 rounded-2xl overflow-hidden">
          <form onSubmit={handleSubmit}>
            <CardContent className="p-6 space-y-4 bg-white">
              {claimTripId && (
                <Alert variant="info" title="Link Your Reservation">
                  Create your account to attach Trip <strong>#{claimTripId}</strong> to your ride history.
                </Alert>
              )}
              {error && (
                <Alert variant="error" title="Registration Issue">
                  {error}
                </Alert>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jane Doe"
                    required
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

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
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <LockIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    minLength={6}
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
                  Create Account
                </Button>
              </div>

              {isConfigured && (
                <>
                  <div className="relative my-5">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2.5 bg-white text-slate-500 font-medium">Or sign up with</span>
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

            <CardFooter className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex flex-col gap-2 items-center text-center">
              <p className="text-xs sm:text-sm text-slate-600">
                Already have an account?{' '}
                <Link to={loginHref} className="font-bold text-blue-600 hover:underline">
                  Sign in
                </Link>
              </p>
              <p className="text-xs text-slate-500">
                Interested in driving for us?{' '}
                <Link to="/apply" className="font-semibold text-slate-700 hover:text-blue-600 underline">
                  Apply to Join the Fleet
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
