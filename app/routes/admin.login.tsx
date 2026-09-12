import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getAdminAuthService } from '../core/services/auth/admin-auth.service';
import { isFirebaseConfigured } from '../core/services/firebase';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { CarIcon, LockIcon, MailIcon, ShieldCheckIcon } from '../components/ui/Icons';

export function meta() {
  return [
    { title: 'Admin Login – Chesterfield Taxi' },
    { name: 'description', content: 'Chesterfield Taxi Operator & Dispatch Administration Console' },
  ];
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@chesterfieldtaxi.com');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    const message = searchParams.get('message');
    if (message === 'unauthorized') {
      setError('You do not have administrative privileges to access this area.');
    } else if (message === 'unauthenticated') {
      setError('Please log in to access this area.');
    }

    setIsConfigured(isFirebaseConfigured());
    const authService = getAdminAuthService();
    
    // Subscribe to auth state so we reliably get async Firestore roles
    const unsubscribe = authService.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        if (currentUser.role === 'admin') {
          navigate('/admin', { replace: true });
        } else if (currentUser.role === 'dispatcher') {
          navigate('/dispatch', { replace: true });
        }
      }
    });

    return unsubscribe;
  }, [navigate, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError(null);
      const authService = getAdminAuthService();
      const user = await authService.signIn(email, password);
      if (user.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dispatch', { replace: true });
      }
    } catch (err: unknown) {
      console.error('[AdminLogin] Authentication failure:', err);
      if (err instanceof Error) {
        if (err.message.includes('auth/invalid-credential') || err.message.includes('auth/wrong-password')) {
          setError('Invalid email or password. Please verify credentials.');
        } else if (err.message.includes('auth/user-not-found')) {
          setError('No administrator account found with this email.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Authentication failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (role: 'admin' | 'dispatcher' = 'admin') => {
    try {
      setIsLoading(true);
      setError(null);
      const authService = getAdminAuthService();
      const email = role === 'admin' ? 'admin@chesterfieldtaxi.com' : 'dispatch@chesterfieldtaxi.com';
      const user = await authService.signIn(email, 'admin_demo_password');
      if (user.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dispatch', { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Demo login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/30 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 mb-4">
            <CarIcon className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Chesterfield Taxi</h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-500 mt-1">
            Dispatch &amp; Configuration Console
          </p>
        </div>

        <Card variant="elevated" className="border-slate-800 bg-slate-900/90 backdrop-blur-md shadow-2xl text-slate-100">
          <CardHeader className="border-b border-slate-800/80 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white">Administrator Access</CardTitle>
              <ShieldCheckIcon className="w-5 h-5 text-amber-500" />
            </div>
            <CardDescription className="text-xs text-slate-400">
              Sign in with your Firebase operator credentials to access pricing rules, fleet settings, and live bookings.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="p-6 space-y-4">
              {error && (
                <Alert variant="error" title="Sign In Error">
                  {error}
                </Alert>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Admin Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <MailIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@chesterfieldtaxi.com"
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <LockIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="bg-slate-950/50 p-6 border-t border-slate-800/80 flex flex-col gap-3">
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isLoading}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
              >
                Sign In to Console
              </Button>

              {/* Quick Demo Access buttons for offline / unconfigured mode */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleDemoLogin('admin')}
                  disabled={isLoading}
                  className="w-full text-center text-xs text-amber-400 hover:text-amber-300 hover:underline transition-colors"
                >
                  {isConfigured
                    ? 'Quick Access: Admin Demo Credentials'
                    : 'Offline Dev Mode: Admin Demo Login'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoLogin('dispatcher')}
                  disabled={isLoading}
                  className="w-full text-center text-xs text-amber-400 hover:text-amber-300 hover:underline transition-colors"
                >
                  {isConfigured
                    ? 'Quick Access: Dispatcher Demo Credentials'
                    : 'Offline Dev Mode: Dispatcher Demo Login'}
                </button>
              </div>
            </CardFooter>
          </form>
        </Card>

        {/* Back to public booking */}
        <div className="text-center mt-6">
          <a
            href="/"
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            &larr; Return to Public Booking Portal
          </a>
        </div>
      </div>
    </div>
  );
}
