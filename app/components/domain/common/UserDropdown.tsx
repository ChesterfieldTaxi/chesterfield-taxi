import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import {
  ShieldIcon,
  ExternalLinkIcon,
  RadioIcon,
  BarChartIcon,
  LogOutIcon,
  ChevronDownIcon,
} from '../../ui/Icons';

export interface UserDropdownProps {
  email?: string | null;
  onSignOut: () => void;
  /**
   * Theme variant for the trigger button
   * 'light': dark text on light header (Dispatch)
   * 'dark': light text on dark header (Admin)
   */
  variant?: 'light' | 'dark';
}

export function UserDropdown({ email, onSignOut, variant = 'light' }: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const isDispatchRoute = location.pathname.startsWith('/dispatch');
  const isAdminRoute = location.pathname.startsWith('/admin');

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

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer select-none border ${
          variant === 'dark'
            ? 'border-slate-700/80 bg-slate-800/80 hover:bg-slate-800 text-slate-100 hover:text-white'
            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900'
        }`}
        title="Account Menu"
      >
        <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
          {initial}
        </div>
        <span className="text-xs font-semibold tracking-tight max-w-[160px] sm:max-w-[220px] truncate">
          {displayEmail}
        </span>
        <ChevronDownIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100">
          {/* User Header */}
          <div className="px-4 py-2.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Active Operator
            </span>
            <span className="text-xs font-bold text-slate-900 truncate block mt-0.5">
              {displayEmail}
            </span>
          </div>

          {/* Contextually Intelligent Navigation Links */}
          <div className="py-1">
            {/* If on dispatch, show link to admin dashboard */}
            {isDispatchRoute && (
              <Link
                to="/admin?tab=dashboard"
                reloadDocument
                onClick={() => setIsOpen(false)}
                className="group flex items-start gap-3 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
              >
                <BarChartIcon className="w-4 h-4 text-slate-400 group-hover:text-blue-600 mt-0.5 shrink-0 transition-colors" />
                <div>
                  <span className="font-bold block text-slate-800 group-hover:text-blue-600">
                    Admin Dashboard
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    Analytics, fleet &amp; rates overview
                  </span>
                </div>
              </Link>
            )}

            {/* Advanced Settings & Audits - accessible without cluttering primary nav */}
            <Link
              to="/admin?tab=advanced"
              reloadDocument
              onClick={() => setIsOpen(false)}
              className="group flex items-start gap-3 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
            >
              <ShieldIcon className="w-4 h-4 text-slate-400 group-hover:text-blue-600 mt-0.5 shrink-0 transition-colors" />
              <div>
                <span className="font-bold block text-slate-800 group-hover:text-blue-600">
                  Advanced Settings &amp; Audits
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  Audit logs, telemetry &amp; security
                </span>
              </div>
            </Link>

            {/* If on admin, show Dispatch Operations */}
            {isAdminRoute && (
              <Link
                to="/dispatch"
                reloadDocument
                onClick={() => setIsOpen(false)}
                className="group flex items-start gap-3 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
              >
                <RadioIcon className="w-4 h-4 text-slate-400 group-hover:text-blue-600 mt-0.5 shrink-0 transition-colors" />
                <div>
                  <span className="font-bold block text-slate-800 group-hover:text-blue-600">
                    Dispatch Operations
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    Real-time radar &amp; live taxi dispatch
                  </span>
                </div>
              </Link>
            )}

            {/* Public Booking Site */}
            <Link
              to="/book"
              onClick={() => setIsOpen(false)}
              className="group flex items-start gap-3 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
            >
              <ExternalLinkIcon className="w-4 h-4 text-slate-400 group-hover:text-blue-600 mt-0.5 shrink-0 transition-colors" />
              <div>
                <span className="font-bold block text-slate-800 group-hover:text-blue-600">
                  Public Booking Engine
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  View customer reservation portal
                </span>
              </div>
            </Link>
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
