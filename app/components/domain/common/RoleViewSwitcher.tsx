import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  getAdminAuthService,
  type AdminUser,
  type UserRole,
} from '../../../core/services/auth/admin-auth.service';

export type WorkspaceViewKey = 'admin' | 'dispatch' | 'driver' | 'app';

export interface RoleViewSwitcherProps {
  currentView: WorkspaceViewKey;
  user?: AdminUser | null;
  variant?: 'header' | 'dropdown' | 'drawer' | 'compact' | 'dark';
  className?: string;
  onNavigate?: () => void;
}

interface WorkspaceDefinition {
  id: WorkspaceViewKey;
  label: string;
  shortLabel: string;
  description: string;
  path: string;
  icon: string;
  badge: string;
  badgeColor: string;
  requiredRole: 'admin' | 'dispatcher' | 'driver' | 'customer';
}

const WORKSPACES: WorkspaceDefinition[] = [
  {
    id: 'admin',
    label: 'Admin Console',
    shortLabel: 'Admin',
    description: 'Fleet, Pricing, Roster & System Settings',
    path: '/admin',
    icon: '👑',
    badge: 'Admin',
    badgeColor: 'bg-purple-100 text-purple-700 border-purple-200',
    requiredRole: 'admin',
  },
  {
    id: 'dispatch',
    label: 'Dispatch Console',
    shortLabel: 'Dispatch',
    description: 'Live Queue, Maps, Auto-Dispatch & Softphone',
    path: '/dispatch',
    icon: '📻',
    badge: 'Dispatcher',
    badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
    requiredRole: 'dispatcher',
  },
  {
    id: 'driver',
    label: 'Driver App & Meter',
    shortLabel: 'Driver',
    description: 'Active Trips, Taximeter, Shifts & Extras',
    path: '/driver',
    icon: '🚕',
    badge: 'Driver',
    badgeColor: 'bg-amber-100 text-amber-700 border-amber-200',
    requiredRole: 'driver',
  },
  {
    id: 'app',
    label: 'Passenger Portal',
    shortLabel: 'Customer',
    description: 'Direct Ride Booking, Receipts & Saved Places',
    path: '/app',
    icon: '📱',
    badge: 'Passenger',
    badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    requiredRole: 'customer',
  },
];

export function RoleViewSwitcher({
  currentView,
  user: initialUser,
  variant = 'header',
  className = '',
  onNavigate,
}: RoleViewSwitcherProps) {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(
    initialUser || null
  );
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync auth state if user prop is omitted
  useEffect(() => {
    if (initialUser) {
      setCurrentUser(initialUser);
      return;
    }

    const authService = getAdminAuthService();
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }

    const unsub = authService.onAuthStateChanged((u) => {
      setCurrentUser(u);
    });
    return unsub;
  }, [initialUser]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Determine which workspaces the user can access
  const effectiveRoles = (
    currentUser?.roles && currentUser.roles.length > 0
      ? currentUser.roles
      : currentUser?.role
      ? [currentUser.role]
      : ['customer']
  ) as UserRole[];

  const isDemo = currentUser?.isDemo ?? true; // In test/demo or local mode, unlock switcher
  const isAdmin = effectiveRoles.includes('admin') || isDemo;
  const isDispatcher = isAdmin || effectiveRoles.includes('dispatcher');
  const isDriver = isDispatcher || effectiveRoles.includes('driver');

  const accessibleWorkspaces = WORKSPACES.filter((ws) => {
    if (isAdmin) return true;
    if (ws.requiredRole === 'admin') return isAdmin;
    if (ws.requiredRole === 'dispatcher') return isDispatcher;
    if (ws.requiredRole === 'driver') return isDriver;
    return true; // customer is accessible to everyone
  });

  const activeWorkspace = WORKSPACES.find((ws) => ws.id === currentView) || WORKSPACES[0];

  const handleSelectWorkspace = (ws: WorkspaceDefinition) => {
    setIsOpen(false);
    if (onNavigate) {
      onNavigate();
    }
    if (ws.id !== currentView) {
      navigate(ws.path);
    }
  };

  // Render for drawer / compact view mode
  if (variant === 'drawer') {
    return (
      <div className={`relative ${className}`} ref={containerRef}>
        <div className="flex items-center justify-between px-1 mb-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Workspace
          </span>
          <span className="text-[9px] font-mono text-slate-400 uppercase">{activeWorkspace.shortLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">{activeWorkspace.icon}</span>
            <span className="truncate">{activeWorkspace.label}</span>
          </div>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {isOpen && (
          <div className="mt-1.5 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden py-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-100 z-50">
            {accessibleWorkspaces.map((ws) => {
              const isActive = ws.id === currentView;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleSelectWorkspace(ws)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer text-left ${
                    isActive
                      ? 'bg-blue-600 text-white font-bold'
                      : 'text-slate-300 hover:bg-slate-700/70 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{ws.icon}</span>
                    <span>{ws.label}</span>
                  </div>
                  {isActive ? (
                    <span className="text-[9px] uppercase font-black bg-blue-700 px-1.5 py-0.5 rounded-sm">Active</span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-mono">{ws.path}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const isDark = variant === 'dark';

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      {/* Switch View Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
          isDark
            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700/80 hover:border-slate-600 shadow-2xs'
            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/90 hover:border-slate-300 shadow-2xs'
        }`}
        title={`Current view: ${activeWorkspace.label}. Click to switch role workspace.`}
        aria-expanded={isOpen}
      >
        <span className="text-sm shrink-0">{activeWorkspace.icon}</span>
        <span className="font-bold tracking-tight max-w-[100px] sm:max-w-none truncate">
          {activeWorkspace.shortLabel}
        </span>
        <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
          View
        </span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100"
          role="menu"
        >
          {/* Header */}
          <div className="px-3.5 py-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
              Multi-Role Workspace Switcher
            </span>
            <span className="text-xs font-medium text-slate-600 block mt-0.5">
              Instant 1-tap view switching
            </span>
          </div>

          {/* Workspaces List */}
          <div className="py-1">
            {accessibleWorkspaces.map((ws) => {
              const isActive = ws.id === currentView;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleSelectWorkspace(ws)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-blue-50/80 text-blue-900 font-bold'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                  role="menuitem"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0 p-1 bg-slate-100 rounded-lg">
                      {ws.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs truncate">
                          {ws.label}
                        </span>
                        {isActive && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {ws.description}
                      </div>
                    </div>
                  </div>

                  <span className="text-xs text-slate-400 font-mono ml-2 shrink-0">
                    {ws.path}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer Info */}
          <div className="px-3.5 py-1.5 bg-slate-50/80 text-[10px] text-slate-500 flex items-center justify-between">
            <span>Role Claims:</span>
            <span className="font-mono font-bold text-slate-700 capitalize">
              {effectiveRoles.join(', ')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
