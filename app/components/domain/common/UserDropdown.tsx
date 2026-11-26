import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  LogOutIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  RadioIcon,
  CarIcon,
  BuildingIcon,
  UserIcon,
} from '../../ui/Icons';
import { getAdminAuthService, type AdminUser } from '../../../core/services/auth/admin-auth.service';
import {
  getAccessibleWorkspaces,
} from '../../../core/utils/workspace-routing.util';

export interface UserDropdownProps {
  email?: string | null;
  onSignOut: () => void;
  /**
   * Theme variant for the trigger button
   * 'light': dark text on light header (Dispatch)
   * 'dark': light text on dark header (Admin)
   */
  variant?: 'light' | 'dark';
  /**
   * Drop direction: if true, opens upwards (for bottom navigation rails)
   */
  dropUp?: boolean;
  /**
   * If true, displays only the user avatar button (for collapsed sidebar)
   */
  collapsed?: boolean;
  /**
   * Optional custom class for the wrapper div
   */
  className?: string;
  /**
   * Optional override for current active view
   */
  currentView?: 'admin' | 'dispatch' | 'driver' | 'corporate' | 'app' | 'customer';
  /**
   * Trigger button style variant:
   * 'minimized': compact profile picture + down arrow (default, saves header space)
   * 'full': shows email text beside avatar
   */
  triggerVariant?: 'minimized' | 'full';
}

export function UserDropdown({
  email,
  onSignOut,
  variant = 'light',
  dropUp = false,
  collapsed = false,
  className,
  currentView,
  triggerVariant = 'minimized',
}: UserDropdownProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<AdminUser | null>(() =>
    getAdminAuthService().getCurrentUser()
  );

  const displayEmail = email || currentUser?.email || currentUser?.displayName || 'Account';
  const initial = displayEmail[0]?.toUpperCase() || 'U';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    const authService = getAdminAuthService();
    const unsub = authService.onAuthStateChanged((u) => {
      setCurrentUser(u);
    });
    return unsub;
  }, []);

  const accessibleWorkspaces = getAccessibleWorkspaces(currentUser);
  const hasMultipleWorkspaces = accessibleWorkspaces.length > 1;
  const singleWorkspace = accessibleWorkspaces[0] || null;
  const displayName = currentUser?.displayName?.trim() || null;

  const currentPath =
    currentView ||
    (typeof window !== 'undefined'
      ? window.location.pathname.startsWith('/app/admin') || window.location.pathname.startsWith('/admin')
        ? 'admin'
        : window.location.pathname.startsWith('/app/dispatch') || window.location.pathname.startsWith('/dispatch')
        ? 'dispatch'
        : window.location.pathname.startsWith('/app/driver') || window.location.pathname.startsWith('/driver')
        ? 'driver'
        : window.location.pathname.startsWith('/app/corporate') || window.location.pathname.startsWith('/corporate')
        ? 'corporate'
        : window.location.pathname.startsWith('/app/passenger')
        ? 'app'
        : 'public'
      : 'app');

  const handleNavigateView = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  const isMinimized = triggerVariant === 'minimized' && !collapsed;

  return (
    <div className={`relative ${className || (isMinimized || collapsed ? 'inline-block shrink-0' : 'w-full')} text-left`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center transition-all cursor-pointer select-none border shrink-0 ${
          collapsed
            ? 'p-1 rounded-full'
            : isMinimized
            ? 'gap-1 px-1.5 py-1 rounded-full hover:shadow-xs'
            : 'gap-2 w-full justify-between px-2.5 py-1.5 rounded-xl'
        } ${
          variant === 'dark'
            ? 'border-border-header/80 bg-surface-header-elevated/80 hover:bg-surface-header-elevated text-fg-on-header hover:text-white'
            : 'border-border-subtle bg-surface-card hover:bg-surface-subtle text-fg-secondary hover:text-fg-primary shadow-2xs'
        }`}
        title={
          hasMultipleWorkspaces
            ? `Account: ${displayEmail} (Click to switch workspace)`
            : `Account: ${displayEmail}`
        }
      >
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
            {initial}
          </div>
          {!collapsed && !isMinimized && (
            <span className="text-xs font-semibold tracking-tight truncate text-left max-w-[150px]">
              {displayEmail}
            </span>
          )}
        </div>
        {!collapsed && (
          <ChevronDownIcon
            className={`w-3.5 h-3.5 text-fg-subtle shrink-0 transition-transform ${
              dropUp && isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            dropUp ? 'bottom-full mb-2 left-0' : 'right-0 mt-2'
          } w-64 bg-surface-card border border-border-subtle rounded-2xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-border-faint`}
        >
          {/* User Header */}
          <div className="px-3.5 py-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              {displayName && displayName.toLowerCase() !== displayEmail.toLowerCase() ? (
                <>
                  <div className="text-xs font-bold text-fg-primary truncate" title={displayName}>
                    {displayName}
                  </div>
                  <div className="text-[11px] text-fg-muted truncate" title={displayEmail}>
                    {displayEmail}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[10px] text-fg-subtle font-semibold uppercase tracking-wider">
                    Signed in
                  </div>
                  <div className="text-xs font-bold text-fg-primary truncate" title={displayEmail}>
                    {displayEmail}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Multi-Role Workspace Switcher (Shown ONLY when the user has 2+ workspaces) */}
          {hasMultipleWorkspaces ? (
            <div className="p-1.5">
              <div className="px-2.5 py-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                  Workspaces
                </span>
                <button
                  type="button"
                  onClick={() => handleNavigateView('/app?choose=1')}
                  className="text-[10px] font-semibold text-blue-600 hover:text-status-info-fg hover:underline cursor-pointer"
                >
                  All Apps
                </button>
              </div>
              <div className="space-y-0.5 mt-0.5">
                {accessibleWorkspaces.some((w) => w.id === 'admin') && (
                  <button
                    type="button"
                    onClick={() => handleNavigateView('/app/admin')}
                    className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                      currentPath === 'admin'
                        ? 'bg-status-staged-bg text-status-staged-fg font-semibold'
                        : 'text-fg-secondary hover:bg-surface-subtle'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-status-staged-bg-strong/80 flex items-center justify-center shrink-0">
                        <ShieldCheckIcon className="w-3.5 h-3.5 text-purple-700" />
                      </div>
                      <span>Admin</span>
                    </div>
                    {currentPath === 'admin' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-staged-bg-strong text-status-staged-fg">
                        Active
                      </span>
                    ) : (
                      <ChevronRightIcon className="w-3.5 h-3.5 text-fg-faint group-hover:text-fg-muted transition-colors" />
                    )}
                  </button>
                )}

                {accessibleWorkspaces.some((w) => w.id === 'dispatch') && (
                  <button
                    type="button"
                    onClick={() => handleNavigateView('/app/dispatch')}
                    className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                      currentPath === 'dispatch'
                        ? 'bg-status-info-bg text-status-info-fg font-semibold'
                        : 'text-fg-secondary hover:bg-surface-subtle'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-status-info-bg-strong/80 flex items-center justify-center shrink-0">
                        <RadioIcon className="w-3.5 h-3.5 text-status-info-fg" />
                      </div>
                      <span>Dispatch</span>
                    </div>
                    {currentPath === 'dispatch' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-info-bg-strong text-status-info-fg">
                        Active
                      </span>
                    ) : (
                      <ChevronRightIcon className="w-3.5 h-3.5 text-fg-faint group-hover:text-fg-muted transition-colors" />
                    )}
                  </button>
                )}

                {accessibleWorkspaces.some((w) => w.id === 'driver') && (
                  <button
                    type="button"
                    onClick={() => handleNavigateView('/app/driver')}
                    className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                      currentPath === 'driver'
                        ? 'bg-status-warning-bg text-status-warning-fg font-semibold'
                        : 'text-fg-secondary hover:bg-surface-subtle'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-status-warning-bg-strong/80 flex items-center justify-center shrink-0">
                        <CarIcon className="w-3.5 h-3.5 text-status-warning-fg" />
                      </div>
                      <span>Driver App</span>
                    </div>
                    {currentPath === 'driver' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-warning-bg-strong text-status-warning-fg">
                        Active
                      </span>
                    ) : (
                      <ChevronRightIcon className="w-3.5 h-3.5 text-fg-faint group-hover:text-fg-muted transition-colors" />
                    )}
                  </button>
                )}

                {accessibleWorkspaces.some((w) => w.id === 'corporate') && (
                  <button
                    type="button"
                    onClick={() => handleNavigateView('/app/corporate')}
                    className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                      currentPath === 'corporate'
                        ? 'bg-status-staged-bg text-status-staged-fg font-semibold'
                        : 'text-fg-secondary hover:bg-surface-subtle'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-status-staged-bg-strong/80 flex items-center justify-center shrink-0">
                        <BuildingIcon className="w-3.5 h-3.5 text-status-staged-fg" />
                      </div>
                      <span>Corporate Portal</span>
                    </div>
                    {currentPath === 'corporate' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-staged-bg-strong text-status-staged-fg">
                        Active
                      </span>
                    ) : (
                      <ChevronRightIcon className="w-3.5 h-3.5 text-fg-faint group-hover:text-fg-muted transition-colors" />
                    )}
                  </button>
                )}

                {accessibleWorkspaces.some((w) => w.id === 'passenger') && (
                  <button
                    type="button"
                    onClick={() => handleNavigateView('/app/passenger')}
                    className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                      currentPath === 'app' || currentPath === 'customer'
                        ? 'bg-status-success-bg text-status-success-fg font-semibold'
                        : 'text-fg-secondary hover:bg-surface-subtle'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-status-success-bg-strong/80 flex items-center justify-center shrink-0">
                        <UserIcon className="w-3.5 h-3.5 text-status-success-fg" />
                      </div>
                      <span>Client Portal</span>
                    </div>
                    {currentPath === 'app' || currentPath === 'customer' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-success-bg-strong text-status-success-fg">
                        Active
                      </span>
                    ) : (
                      <ChevronRightIcon className="w-3.5 h-3.5 text-fg-faint group-hover:text-fg-muted transition-colors" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ) : currentPath === 'public' && singleWorkspace ? (
            <div className="p-1.5">
              <button
                type="button"
                onClick={() => handleNavigateView(singleWorkspace.path)}
                className="group w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-fg-secondary hover:bg-surface-subtle transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-status-info-bg flex items-center justify-center shrink-0">
                    <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <span>Open {singleWorkspace.label}</span>
                </div>
                <ChevronRightIcon className="w-3.5 h-3.5 text-fg-subtle group-hover:text-blue-600 transition-colors" />
              </button>
            </div>
          ) : null}

          {/* Sign Out Action */}
          <div className="p-1.5">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onSignOut();
              }}
              className="group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-status-danger-bg hover:text-status-danger-fg transition-colors cursor-pointer text-left"
            >
              <LogOutIcon className="w-4 h-4 text-red-500 group-hover:text-red-600 shrink-0 transition-colors" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
