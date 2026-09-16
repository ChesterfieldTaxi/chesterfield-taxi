import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  LogOutIcon,
  ChevronDownIcon,
  SunIcon,
  MoonIcon,
  ShieldCheckIcon,
  RadioIcon,
  CarIcon,
  UserIcon,
} from '../../ui/Icons';
import { getAdminAuthService, type UserRole } from '../../../core/services/auth/admin-auth.service';

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
  currentView?: 'admin' | 'dispatch' | 'driver' | 'app' | 'customer';
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
  const [isDark, setIsDark] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayEmail = email || 'admin@chesterfieldtaxi.com';
  const initial = displayEmail[0]?.toUpperCase() || 'A';

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

  // Sync dark mode state with HTML class
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isDarkMode = document.documentElement.classList.contains('dark');
      setIsDark(isDarkMode);
    }
  }, []);

  // Determine user accessible role views
  const authService = getAdminAuthService();
  const currentUser = authService.getCurrentUser();
  const effectiveRoles = (
    currentUser?.roles?.length
      ? currentUser.roles
      : currentUser?.role
      ? [currentUser.role]
      : ['customer']
  ) as UserRole[];
  const isDemo = currentUser?.isDemo ?? true;
  const isAdmin = effectiveRoles.includes('admin') || isDemo;
  const isDispatcher = isAdmin || effectiveRoles.includes('dispatcher');
  const isDriver = isDispatcher || effectiveRoles.includes('driver');

  const currentPath =
    currentView ||
    (typeof window !== 'undefined'
      ? window.location.pathname.startsWith('/admin')
        ? 'admin'
        : window.location.pathname.startsWith('/dispatch')
        ? 'dispatch'
        : window.location.pathname.startsWith('/driver')
        ? 'driver'
        : 'app'
      : 'admin');

  const handleToggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (typeof window !== 'undefined') {
      if (nextDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    }
  };

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
            ? 'border-slate-700/80 bg-slate-800/80 hover:bg-slate-800 text-slate-100 hover:text-white'
            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 shadow-2xs'
        }`}
        title={`Account: ${displayEmail} (Click to switch workspace)`}
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
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
              dropUp && isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            dropUp ? 'bottom-full mb-2 left-0' : 'right-0 mt-2'
          } w-72 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100`}
        >
          {/* User Header */}
          <div className="px-4 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Active Operator
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 capitalize">
                {effectiveRoles.join(', ')}
              </span>
            </div>
            <span className="text-xs font-bold text-slate-900 truncate block mt-0.5" title={displayEmail}>
              {displayEmail}
            </span>
          </div>

          {/* Multi-Role View Switcher Section */}
          <div className="p-1">
            <span className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
              Switch Workspace View
            </span>
            <div className="space-y-0.5">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleNavigateView('/admin')}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                    currentPath === 'admin'
                      ? 'bg-purple-50 text-purple-900 font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-purple-100 flex items-center justify-center shrink-0">
                      <ShieldCheckIcon className="w-3.5 h-3.5 text-purple-700" />
                    </div>
                    <span>Admin Console</span>
                  </div>
                  {currentPath === 'admin' ? (
                    <span className="text-[9px] font-black uppercase text-purple-600">
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-mono">/admin</span>
                  )}
                </button>
              )}

              {isDispatcher && (
                <button
                  type="button"
                  onClick={() => handleNavigateView('/dispatch')}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                    currentPath === 'dispatch'
                      ? 'bg-blue-50 text-blue-900 font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-blue-100 flex items-center justify-center shrink-0">
                      <RadioIcon className="w-3.5 h-3.5 text-blue-700" />
                    </div>
                    <span>Dispatch Console</span>
                  </div>
                  {currentPath === 'dispatch' ? (
                    <span className="text-[9px] font-black uppercase text-blue-600">
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-mono">/dispatch</span>
                  )}
                </button>
              )}

              {isDriver && (
                <button
                  type="button"
                  onClick={() => handleNavigateView('/driver')}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                    currentPath === 'driver'
                      ? 'bg-amber-50 text-amber-900 font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center shrink-0">
                      <CarIcon className="w-3.5 h-3.5 text-amber-700" />
                    </div>
                    <span>Driver Console</span>
                  </div>
                  {currentPath === 'driver' ? (
                    <span className="text-[9px] font-black uppercase text-amber-600">
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-mono">/driver</span>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => handleNavigateView('/app')}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                  currentPath === 'app' || currentPath === 'customer'
                    ? 'bg-emerald-50 text-emerald-900 font-bold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-emerald-100 flex items-center justify-center shrink-0">
                    <UserIcon className="w-3.5 h-3.5 text-emerald-700" />
                  </div>
                  <span>Passenger Portal</span>
                </div>
                {currentPath === 'app' || currentPath === 'customer' ? (
                  <span className="text-[9px] font-black uppercase text-emerald-600">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-mono">/app</span>
                )}
              </button>
            </div>
          </div>

          {/* Theme Toggle (Light / Dark) */}
          <div className="p-1">
            <button
              type="button"
              onClick={handleToggleTheme}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                {isDark ? (
                  <MoonIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                ) : (
                  <SunIcon className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <span>Theme: {isDark ? 'Dark Mode' : 'Light Mode'}</span>
              </div>
              <div className="flex items-center">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isDark
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {isDark ? 'Dark' : 'Light'}
                </span>
              </div>
            </button>
          </div>

          {/* Sign Out Action */}
          <div className="p-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onSignOut();
              }}
              className="group w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer text-left"
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
