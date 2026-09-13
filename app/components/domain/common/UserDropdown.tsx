import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router';

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
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer select-none ${
          variant === 'dark'
            ? 'hover:bg-slate-800 text-slate-200'
            : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Account Menu"
      >
        <div className="w-7 h-7 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center font-black text-xs shadow-xs border border-slate-700">
          {initial}
        </div>
        <span className="text-xs font-bold tracking-tight max-w-[180px] sm:max-w-[240px] truncate">
          {displayEmail}
        </span>
        <span className="text-[10px] text-slate-400">▾</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* User Header */}
          <div className="px-4 py-2 border-b border-slate-100">
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">Signed in as</span>
            <span className="text-xs font-bold text-slate-900 truncate block mt-0.5">
              {displayEmail}
            </span>
          </div>

          {/* Navigation Links */}
          <div className="py-1">
            <Link
              to="/dispatch"
              reloadDocument
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
            >
              <span className="text-base leading-none">🚕</span>
              <div>
                <span className="font-bold block text-slate-800">Dispatch Console</span>
                <span className="text-[10px] text-slate-400 font-normal">Live map & booking operations</span>
              </div>
            </Link>

            <Link
              to="/admin?tab=dashboard"
              reloadDocument
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
            >
              <span className="text-base leading-none">📊</span>
              <div>
                <span className="font-bold block text-slate-800">Admin Dashboard</span>
                <span className="text-[10px] text-slate-400 font-normal">Analytics, stats & KPIs</span>
              </div>
            </Link>

            <Link
              to="/admin?tab=general"
              reloadDocument
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
            >
              <span className="text-base leading-none">⚙️</span>
              <div>
                <span className="font-bold block text-slate-800">Admin Settings</span>
                <span className="text-[10px] text-slate-400 font-normal">Company config & rate rules</span>
              </div>
            </Link>
          </div>

          <div className="border-t border-slate-100 my-1" />

          {/* Log out */}
          <div className="px-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onSignOut();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer text-left"
            >
              <span className="text-base leading-none">↪</span>
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
