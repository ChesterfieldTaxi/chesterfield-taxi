import React, { useState, useRef, useEffect } from 'react';
import {
  LogOutIcon,
  ChevronDownIcon,
  SunIcon,
  MoonIcon,
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
  /**
   * Drop direction: if true, opens upwards (for bottom navigation rails)
   */
  dropUp?: boolean;
  /**
   * If true, displays only the user avatar button (for collapsed sidebar)
   */
  collapsed?: boolean;
}

export function UserDropdown({
  email,
  onSignOut,
  variant = 'light',
  dropUp = false,
  collapsed = false,
}: UserDropdownProps) {
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

  return (
    <div className={`relative ${collapsed ? 'inline-block' : 'w-full'} text-left`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-2 transition-all cursor-pointer select-none border ${
          collapsed ? 'p-1 rounded-full' : 'w-full justify-between px-2.5 py-1.5 rounded-xl'
        } ${
          variant === 'dark'
            ? 'border-slate-700/80 bg-slate-800/80 hover:bg-slate-800 text-slate-100 hover:text-white'
            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900'
        }`}
        title={`Account: ${displayEmail}`}
      >
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
            {initial}
          </div>
          {!collapsed && (
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
          } w-64 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100`}
        >
          {/* User Header */}
          <div className="px-4 py-2.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Active Operator
            </span>
            <span className="text-xs font-bold text-slate-900 truncate block mt-0.5" title={displayEmail}>
              {displayEmail}
            </span>
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

