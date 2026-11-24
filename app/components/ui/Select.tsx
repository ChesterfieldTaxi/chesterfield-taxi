import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from './Icons';

export interface SelectOption {
  value: string | number;
  label: string;
  subtitle?: string;
  badge?: string;
  dotClass?: string;
  dotColor?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  group?: string;
}

export type SelectSize = 'xs' | 'sm' | 'md';
export type SelectVariant = 'default' | 'subtle' | 'dark';

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'onChange'> {
  label?: string;
  helperText?: string;
  error?: string;
  options?: ReadonlyArray<SelectOption>;
  placeholder?: string;
  size?: SelectSize;
  variant?: SelectVariant;
  triggerClassName?: string;
  fullWidth?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  onValueChange?: (value: string) => void;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

function flattenOptionText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenOptionText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return flattenOptionText(node.props.children);
  return '';
}

export function extractSelectOptionsFromChildren(children: React.ReactNode, groupLabel?: string): SelectOption[] {
  const extracted: SelectOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<Record<string, any>>(child)) return;
    if (child.type === React.Fragment) {
      extracted.push(...extractSelectOptionsFromChildren(child.props.children, groupLabel));
    } else if (child.type === 'optgroup') {
      const nextGroup = typeof child.props.label === 'string' ? child.props.label : groupLabel;
      extracted.push(...extractSelectOptionsFromChildren(child.props.children, nextGroup));
    } else if (child.type === 'option') {
      const label = flattenOptionText(child.props.children).trim();
      const rawVal = child.props.value !== undefined ? child.props.value : label;
      extracted.push({
        value: typeof rawVal === 'number' ? rawVal : String(rawVal ?? ''),
        label: label || String(rawVal ?? ''),
        disabled: Boolean(child.props.disabled),
        group: groupLabel,
      });
    }
  });
  return extracted;
}

export function resolveSelectOptions(options?: ReadonlyArray<SelectOption>, children?: React.ReactNode): SelectOption[] {
  return options ? [...options] : extractSelectOptionsFromChildren(children);
}

export function filterSelectOptions(options: ReadonlyArray<SelectOption>, query: string): SelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  return options.filter((opt) =>
    [opt.label, String(opt.value), opt.subtitle || '', opt.badge || '', opt.group || '']
      .join(' ')
      .toLowerCase()
      .includes(q)
  );
}

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      label, helperText, error, options, placeholder, required, id, name, value, defaultValue,
      size = 'md', variant = 'default', className = '', triggerClassName = '', fullWidth = true,
      searchable, searchPlaceholder = 'Search options...', disabled = false, title, children,
      onValueChange, onChange, 'aria-label': ariaLabel,
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const helperId = `${selectId}-helper`;
    const errorId = `${selectId}-error`;

    const resolvedOptions = useMemo(() => resolveSelectOptions(options, children), [options, children]);
    const [uncontrolledVal, setUncontrolledVal] = useState<string>(() => {
      if (defaultValue !== undefined && defaultValue !== null) return String(defaultValue);
      const firstEnabled = resolvedOptions.find((o) => !o.disabled);
      return placeholder ? '' : firstEnabled ? String(firstEnabled.value) : '';
    });

    const isControlled = value !== undefined;
    const currentValue = isControlled ? String(value ?? '') : uncontrolledVal;

    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [highlightedIdx, setHighlightedIdx] = useState<number>(-1);
    const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUpward: boolean } | null>(null);

    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const lockedWidthRef = useRef<number | null>(null);

    const setMergedTriggerRef = useCallback(
      (node: HTMLButtonElement | null) => {
        triggerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
      },
      [ref]
    );

    const showSearch = searchable !== undefined ? searchable : resolvedOptions.length >= 8;
    const filteredOptions = useMemo(
      () => (showSearch ? filterSelectOptions(resolvedOptions, searchQuery) : resolvedOptions),
      [resolvedOptions, showSearch, searchQuery]
    );
    const selectedOption = useMemo(
      () => resolvedOptions.find((opt) => String(opt.value) === currentValue),
      [resolvedOptions, currentValue]
    );

    const closeMenu = useCallback((restoreFocus = false) => {
      setIsOpen(false);
      setSearchQuery('');
      lockedWidthRef.current = null;
      if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
    }, []);

    const commitSelection = useCallback(
      (nextVal: string) => {
        if (!isControlled) setUncontrolledVal(nextVal);
        onValueChange?.(nextVal);
        if (onChange) {
          onChange({
            target: { value: nextVal, name: name || '' },
            currentTarget: { value: nextVal, name: name || '' },
            preventDefault: () => {},
            stopPropagation: () => {},
          } as unknown as React.ChangeEvent<HTMLSelectElement>);
        }
        closeMenu(true);
      },
      [isControlled, name, onValueChange, onChange, closeMenu]
    );

    const calculatePosition = useCallback(() => {
      if (!triggerRef.current || typeof window === 'undefined') return null;
      const rect = triggerRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (lockedWidthRef.current === null) {
        lockedWidthRef.current = Math.min(Math.max(Math.round(rect.width), 180), Math.max(180, vw - 16));
      }
      const width = Math.min(lockedWidthRef.current, Math.max(180, vw - 16));
      const estHeight = Math.min(320, resolvedOptions.length * 36 + (showSearch ? 52 : 12));
      const menuHeight = menuRef.current?.offsetHeight || estHeight;
      const spaceBelow = vh - rect.bottom;
      const openUpward = spaceBelow < menuHeight + 12 && rect.top > spaceBelow;
      const top = openUpward
        ? Math.max(8, rect.top - menuHeight - 4)
        : Math.min(Math.max(8, vh - menuHeight - 8), rect.bottom + 4);
      const left = Math.max(8, Math.min(rect.left, vw - width - 8));
      return { top, left, width, openUpward };
    }, [resolvedOptions.length, showSearch]);

    useEffect(() => {
      if (!isOpen) { setCoords(null); return; }
      const initial = calculatePosition();
      if (initial) setCoords(initial);
      const selectedIdx = filteredOptions.findIndex((o) => !o.disabled && String(o.value) === currentValue);
      const firstEnabled = filteredOptions.findIndex((o) => !o.disabled);
      setHighlightedIdx(selectedIdx >= 0 ? selectedIdx : firstEnabled);
    }, [isOpen, calculatePosition, filteredOptions, currentValue]);

    useEffect(() => {
      if (!isOpen) return;
      const updatePos = (evt?: Event) => {
        if (evt?.type === 'scroll' && menuRef.current && evt.target instanceof Node && menuRef.current.contains(evt.target)) return;
        const next = calculatePosition();
        if (next) setCoords(next);
      };
      const rafId = requestAnimationFrame(() => {
        updatePos();
        if (showSearch) searchInputRef.current?.focus({ preventScroll: true });
      });
      const handleOutside = (event: MouseEvent | TouchEvent) => {
        const target = event.target as Node | null;
        if (target && triggerRef.current && !triggerRef.current.contains(target) && menuRef.current && !menuRef.current.contains(target)) {
          closeMenu(false);
        }
      };
      const handleDocKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(true); }
      };

      window.addEventListener('scroll', updatePos, true);
      window.addEventListener('resize', updatePos);
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('touchstart', handleOutside, { passive: true });
      document.addEventListener('keydown', handleDocKey);
      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener('scroll', updatePos, true);
        window.removeEventListener('resize', updatePos);
        document.removeEventListener('mousedown', handleOutside);
        document.removeEventListener('touchstart', handleOutside);
        document.removeEventListener('keydown', handleDocKey);
      };
    }, [isOpen, showSearch, calculatePosition, closeMenu]);

    const stepHighlight = (delta: 1 | -1) => {
      if (!filteredOptions.length) return;
      let idx = highlightedIdx;
      for (let step = 0; step < filteredOptions.length; step++) {
        idx = (idx + delta + filteredOptions.length) % filteredOptions.length;
        if (!filteredOptions[idx]?.disabled) { setHighlightedIdx(idx); return; }
      }
    };

    const handleKeyNavigation = (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); setIsOpen(true);
        }
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); stepHighlight(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); stepHighlight(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const candidate = filteredOptions[highlightedIdx];
        if (candidate && !candidate.disabled) commitSelection(String(candidate.value));
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); closeMenu(true);
      }
    };

    const sizeCls =
      size === 'xs' ? 'h-7 px-2.5 text-[11px] rounded-lg gap-1.5' :
      size === 'sm' ? 'h-8.5 px-3 text-xs rounded-xl gap-2' :
      'h-10 px-3.5 text-sm rounded-xl gap-2';

    const variantCls = error
      ? 'bg-white border-red-400 text-slate-900 focus:border-red-500 focus:ring-red-500/20'
      : variant === 'dark'
      ? 'bg-slate-800/95 border-slate-700 text-slate-100 hover:bg-slate-800 hover:border-slate-600 focus:border-blue-400 focus:ring-blue-500/30'
      : variant === 'subtle'
      ? 'bg-transparent border-transparent text-slate-800 hover:bg-slate-100/80 focus:ring-blue-500/20'
      : 'bg-white border-slate-200 text-slate-900 hover:border-slate-300 shadow-2xs focus:border-blue-500 focus:ring-blue-500/20';

    const hasFieldChrome = Boolean(label || error || helperText);
    const displayLabel = selectedOption ? selectedOption.label : placeholder || 'Select...';
    const isPlaceholderShown = !selectedOption && Boolean(placeholder);

    return (
      <div className={`${fullWidth ? 'w-full' : 'inline-flex'} ${hasFieldChrome ? 'flex flex-col gap-1.5' : 'relative items-center'}`}>
        {name && <input type="hidden" name={name} value={currentValue} disabled={disabled} />}
        {label && (
          <label htmlFor={selectId} className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
            {label}
            {required && <span className="text-blue-600 ml-1" title="Required">*</span>}
          </label>
        )}

        <button
          ref={setMergedTriggerRef}
          id={selectId}
          type="button"
          disabled={disabled}
          title={title}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={ariaLabel || label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          onClick={(e) => { e.stopPropagation(); if (!disabled) setIsOpen((prev) => !prev); }}
          onKeyDown={handleKeyNavigation}
          className={`${fullWidth ? 'w-full' : 'max-w-full'} border inline-flex items-center justify-between font-semibold transition-all cursor-pointer outline-hidden focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${sizeCls} ${variantCls} ${
            isOpen ? 'ring-2 ring-blue-500/25 border-blue-400' : ''
          } ${className} ${triggerClassName}`}
        >
          <span className="inline-flex items-center gap-2 min-w-0 truncate">
            {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
            {(selectedOption?.dotClass || selectedOption?.dotColor) && (
              <span className={`w-2 h-2 rounded-full shrink-0 ${selectedOption.dotClass || ''}`} style={selectedOption.dotColor ? { backgroundColor: selectedOption.dotColor } : undefined} />
            )}
            <span className={`truncate ${isPlaceholderShown ? 'text-slate-400 font-normal' : ''}`}>{displayLabel}</span>
          </span>
          <ChevronDownIcon className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && coords !== null && typeof document !== 'undefined' &&
          createPortal(
            <div
              ref={menuRef}
              data-ui-select-portal="true"
              role="listbox"
              aria-label={ariaLabel || label || 'Options'}
              style={{
                position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px`,
                width: `${coords.width}px`, zIndex: 99999,
                transformOrigin: coords.openUpward ? 'bottom left' : 'top left',
              }}
              className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-100 select-none z-[99999]"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {showSearch && (
                <div className="p-2 bg-slate-50/90 border-b border-slate-100">
                  <div className="relative flex items-center h-8">
                    <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleKeyNavigation}
                      placeholder={searchPlaceholder}
                      className="w-full h-8 pl-8 pr-7 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Clear search">
                        <XIcon className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="max-h-64 overflow-y-auto p-1 space-y-0.5">
                {filteredOptions.length === 0 ? (
                  <div className="py-5 px-3 text-center text-slate-400 text-[11px] font-medium">No matching options found.</div>
                ) : (
                  filteredOptions.map((opt, idx) => {
                    const strVal = String(opt.value);
                    const isSelected = strVal === currentValue;
                    const isHighlighted = idx === highlightedIdx;
                    const prevGroup = idx > 0 ? filteredOptions[idx - 1]?.group : undefined;
                    return (
                      <React.Fragment key={`${opt.group || 'root'}-${strVal}-${idx}`}>
                        {opt.group && opt.group !== prevGroup && (
                          <div className="px-2.5 pt-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{opt.group}</div>
                        )}
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          disabled={opt.disabled}
                          onMouseEnter={() => { if (!opt.disabled) setHighlightedIdx(idx); }}
                          onClick={() => { if (!opt.disabled) commitSelection(strVal); }}
                          className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition-colors ${
                            opt.disabled ? 'opacity-45 cursor-not-allowed bg-slate-50/40 text-slate-400' :
                            isSelected ? 'bg-blue-50/90 text-blue-950 font-bold cursor-pointer' :
                            isHighlighted ? 'bg-slate-100/90 text-slate-900 font-medium cursor-pointer' :
                            'text-slate-800 hover:bg-slate-50 font-medium cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                            {(opt.dotClass || opt.dotColor) && (
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.dotClass || ''}`} style={opt.dotColor ? { backgroundColor: opt.dotColor } : undefined} />
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-xs leading-snug">{opt.label}</div>
                              {opt.subtitle && <div className="truncate text-[10.5px] text-slate-500 font-normal">{opt.subtitle}</div>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {opt.badge && <span className="px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700">{opt.badge}</span>}
                            {isSelected && <CheckIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                          </div>
                        </button>
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </div>,
            document.body
          )}

        {error && <p id={errorId} className="text-xs text-red-600 font-medium flex items-center gap-1 mt-0.5"><span>{error}</span></p>}
        {!error && helperText && <p id={helperId} className="text-xs text-slate-500 mt-0.5">{helperText}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
