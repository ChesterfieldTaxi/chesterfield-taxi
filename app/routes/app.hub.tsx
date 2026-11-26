import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { getAdminAuthService, type AdminUser } from '../core/services/auth/admin-auth.service';
import { useTheme } from '../hooks/useTheme';
import { COMPANY_CONFIG } from '../config/companyConfig';
import {
  getAccessibleWorkspaces,
  getEffectiveRoles,
  getSavedDefaultWorkspace,
  setSavedDefaultWorkspace,
  resolvePostAuthDestination,
  type UnifiedWorkspaceId,
  type UnifiedWorkspaceMeta,
} from '../core/utils/workspace-routing.util';
import {
  CarIcon,
  ShieldCheckIcon,
  RadioIcon,
  BuildingIcon,
  UserIcon,
  SpinnerIcon,
  ChevronRightIcon,
  LogOutIcon,
  CheckIcon,
} from '../components/ui/Icons';

export function meta() {
  return [
    { title: `Choose App – ${COMPANY_CONFIG.name}` },
    {
      name: 'description',
      content: 'Account switcher for Chesterfield Taxi staff and administrators.',
    },
  ];
}

function getWorkspaceStyle(id: UnifiedWorkspaceId) {
  switch (id) {
    case 'admin':
      return {
        icon: <ShieldCheckIcon className="w-6 h-6 text-purple-600" />,
        iconBg: 'bg-status-staged-bg border-status-staged-border',
        badgeClass: 'bg-status-staged-bg-strong text-status-staged-fg border-status-staged-border',
        hoverBorder: 'hover:border-purple-400 hover:shadow-purple-500/10',
      };
    case 'dispatch':
      return {
        icon: <RadioIcon className="w-6 h-6 text-blue-600" />,
        iconBg: 'bg-status-info-bg border-status-info-border',
        badgeClass: 'bg-status-info-bg-strong text-status-info-fg border-status-info-border',
        hoverBorder: 'hover:border-blue-400 hover:shadow-blue-500/10',
      };
    case 'driver':
      return {
        icon: <CarIcon className="w-6 h-6 text-amber-600" />,
        iconBg: 'bg-status-warning-bg border-status-warning-border',
        badgeClass: 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border',
        hoverBorder: 'hover:border-status-warning-border hover:shadow-amber-500/10',
      };
    case 'corporate':
      return {
        icon: <BuildingIcon className="w-6 h-6 text-indigo-600" />,
        iconBg: 'bg-status-staged-bg border-status-staged-border',
        badgeClass: 'bg-status-staged-bg-strong text-status-staged-fg border-status-staged-border',
        hoverBorder: 'hover:border-indigo-400 hover:shadow-indigo-500/10',
      };
    case 'passenger':
    default:
      return {
        icon: <UserIcon className="w-6 h-6 text-emerald-600" />,
        iconBg: 'bg-status-success-bg border-status-success-border',
        badgeClass: 'bg-status-success-bg-strong text-status-success-fg border-status-success-border',
        hoverBorder: 'hover:border-emerald-400 hover:shadow-emerald-500/10',
      };
  }
}

export default function UnifiedAppHubRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const forceChoose = searchParams.get('choose') === '1';
  const rawRedirect = searchParams.get('redirect');

  const [user, setUser] = useState<AdminUser | null>(null);
  const [isResolving, setIsResolving] = useState(true);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [savedDefault, setSavedDefault] = useState<UnifiedWorkspaceId | null>(null);

  useTheme({
    uid: user?.uid ?? null,
    profilePreference: user?.themePreference ?? null,
  });

  useEffect(() => {
    const authService = getAdminAuthService();
    const unsub = authService.onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        const loginUrl = rawRedirect
          ? `/app/login?redirect=${encodeURIComponent(rawRedirect)}`
          : '/app/login';
        navigate(loginUrl, { replace: true });
        return;
      }

      const accessible = getAccessibleWorkspaces(currentUser);
      if (accessible.length <= 1) {
        navigate(accessible[0]?.path || '/app/passenger', { replace: true });
        return;
      }

      if (!forceChoose) {
        const dest = resolvePostAuthDestination(currentUser, { rawRedirect });
        if (dest !== '/app?choose=1') {
          navigate(dest, { replace: true });
          return;
        }
      }

      const existingSaved = getSavedDefaultWorkspace(currentUser.uid);
      setSavedDefault(existingSaved);
      setRememberChoice(Boolean(existingSaved));
      setUser(currentUser);
      setIsResolving(false);
    });

    return unsub;
  }, [navigate, forceChoose, rawRedirect]);

  const handleSelectWorkspace = (ws: UnifiedWorkspaceMeta) => {
    if (user?.uid) {
      if (rememberChoice) {
        setSavedDefaultWorkspace(user.uid, ws.id);
      } else {
        setSavedDefaultWorkspace(user.uid, null);
      }
    }
    navigate(ws.path, { replace: true });
  };

  const handleSignOut = async () => {
    try {
      await getAdminAuthService().signOut();
    } catch {}
    navigate('/app/login?message=logged_out', { replace: true });
  };

  if (isResolving || !user) {
    return (
      <div className="min-h-screen bg-surface-header text-white flex flex-col items-center justify-center p-6 gap-3">
        <SpinnerIcon className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-xs font-semibold text-fg-subtle tracking-wide">
          Loading your Chesterfield Taxi workspace...
        </p>
      </div>
    );
  }

  const accessibleWorkspaces = getAccessibleWorkspaces(user);
  const effectiveRoles = getEffectiveRoles(user);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col justify-between px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Bar */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/25">
            <CarIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="text-base font-extrabold tracking-tight text-white block leading-none">
              {COMPANY_CONFIG.name}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 block mt-1">
              Account Hub
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2.5">
          <Link
            to="/"
            className="text-xs font-semibold text-fg-subtle hover:text-white px-3 py-2 rounded-xl hover:bg-surface-header-elevated/80 transition-colors"
          >
            Website
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-rose-300 bg-surface-header-elevated/90 hover:bg-rose-950/50 border border-border-header hover:border-rose-800/60 px-3 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <LogOutIcon className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Chooser */}
      <main className="max-w-4xl w-full mx-auto my-auto py-10 space-y-8">
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-header-elevated/90 border border-border-header text-xs font-semibold text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Signed in as {user.displayName || user.email}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Choose Where to Go
          </h1>
          <p className="text-sm text-fg-subtle max-w-lg mx-auto">
            Select which app you want to open. You can switch anytime from your account menu.
          </p>
        </div>

        {/* Workspace Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accessibleWorkspaces.map((ws) => {
            const style = getWorkspaceStyle(ws.id);
            const isSavedDefault = savedDefault === ws.id;

            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => handleSelectWorkspace(ws)}
                className={`group relative text-left bg-surface-card text-fg-primary rounded-2xl p-5 border-2 border-border-subtle/90 shadow-lg transition-all duration-150 hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between gap-4 ${style.hoverBorder}`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${style.iconBg}`}>
                      {style.icon}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isSavedDefault && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-header text-white">
                          <CheckIcon className="w-3 h-3 text-emerald-400" />
                          Default
                        </span>
                      )}
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${style.badgeClass}`}>
                        {ws.badge}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-extrabold text-fg-primary group-hover:text-blue-600 transition-colors flex items-center justify-between">
                      <span>{ws.label}</span>
                      <ChevronRightIcon className="w-5 h-5 text-fg-subtle group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                    </h2>
                    <p className="text-xs text-fg-secondary leading-relaxed mt-1">
                      {ws.description}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-border-faint flex items-center justify-between text-[11px] text-fg-subtle font-mono">
                  <span>{ws.path}</span>
                  <span className="font-sans font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    Open Workspace &rarr;
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Remember Default Preference */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <label className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-surface-header/90 border border-border-header cursor-pointer select-none hover:border-border-header transition-colors">
            <input
              type="checkbox"
              checked={rememberChoice}
              onChange={(e) => {
                const checked = e.target.checked;
                setRememberChoice(checked);
                if (!checked && user.uid) {
                  setSavedDefaultWorkspace(user.uid, null);
                  setSavedDefault(null);
                }
              }}
              className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-surface-header-elevated"
            />
            <span className="text-xs font-semibold text-slate-300">
              Remember my selected workspace as default on this device
            </span>
          </label>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl w-full mx-auto text-center text-[11px] text-fg-muted">
        24/7 Dispatch Assistance: <a href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`} className="text-slate-300 hover:text-white font-semibold">{COMPANY_CONFIG.phone.dispatch}</a>
      </footer>
    </div>
  );
}
