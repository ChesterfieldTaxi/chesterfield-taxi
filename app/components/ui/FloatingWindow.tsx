import React, { useState, useRef, useEffect, useCallback } from 'react';
import { XIcon } from './Icons';
import { useBottomSheetDragToClose } from '../../core/hooks/useBottomSheetDragToClose';

interface OpenFloatingWindowEntry {
  instanceId: symbol;
  getZIndex: () => number;
}

const openFloatingWindowStack: OpenFloatingWindowEntry[] = [];

export const FLOATING_WINDOW_STORAGE_PREFIX = 'ct_floating_win_';

export interface StoredFloatingWindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getFloatingWindowStorageKey(id: string): string {
  return `${FLOATING_WINDOW_STORAGE_PREFIX}${id || 'floating_window'}`;
}

export function clampFloatingWindowGeometry(
  raw: Partial<StoredFloatingWindowGeometry>,
  viewport: { width: number; height: number },
  minBounds: { minWidth?: number; minHeight?: number } = {}
): StoredFloatingWindowGeometry {
  const minW = Math.max(200, minBounds.minWidth ?? 360);
  const minH = Math.max(160, minBounds.minHeight ?? 280);
  const maxW = Math.max(minW, viewport.width - 24);
  const maxH = Math.max(minH, viewport.height - 24);
  const rawW = typeof raw.width === 'number' && Number.isFinite(raw.width) && raw.width > 0 ? raw.width : 580;
  const rawH = typeof raw.height === 'number' && Number.isFinite(raw.height) && raw.height > 0 ? raw.height : 620;
  const width = Math.round(Math.min(maxW, Math.max(Math.min(minW, viewport.width - 24), rawW)));
  const height = Math.round(Math.min(maxH, Math.max(Math.min(minH, viewport.height - 24), rawH)));
  const defaultX = Math.max(12, Math.round((viewport.width - width) / 2));
  const defaultY = Math.max(12, Math.round((viewport.height - height) / 2));
  const rawX = typeof raw.x === 'number' && Number.isFinite(raw.x) ? raw.x : defaultX;
  const rawY = typeof raw.y === 'number' && Number.isFinite(raw.y) ? raw.y : defaultY;
  const x = Math.round(Math.max(12, Math.min(rawX, Math.max(12, viewport.width - width - 12))));
  const y = Math.round(Math.max(12, Math.min(rawY, Math.max(12, viewport.height - height - 12))));
  return { x, y, width, height };
}

export function parseStoredFloatingWindowGeometry(
  rawJson: string | null | undefined,
  viewport: { width: number; height: number },
  minBounds: { minWidth?: number; minHeight?: number } = {}
): StoredFloatingWindowGeometry | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') return null;
    const hasCoords = Number.isFinite(parsed.x) && Number.isFinite(parsed.y);
    const hasSize = Number.isFinite(parsed.width) && Number.isFinite(parsed.height);
    if (!hasCoords && !hasSize) return null;
    return clampFloatingWindowGeometry(parsed, viewport, minBounds);
  } catch {
    return null;
  }
}

export function serializeFloatingWindowGeometry(geom: StoredFloatingWindowGeometry): string {
  return JSON.stringify({
    x: Math.round(geom.x),
    y: Math.round(geom.y),
    width: Math.round(geom.width),
    height: Math.round(geom.height),
  });
}

export interface FloatingWindowProps {
  id?: string;
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  autoHeight?: boolean;
  minWidth?: number;
  minHeight?: number;
  hasBackdrop?: boolean;
  isDraggable?: boolean;
  isResizable?: boolean;
  isMinimizable?: boolean;
  isMaximizable?: boolean;
  closeOnEsc?: boolean;
  className?: string;
  zIndex?: number;
}

export function FloatingWindow({
  id = 'floating_window',
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  headerExtra,
  footer,
  children,
  initialPosition,
  initialSize = { width: 580, height: 620 },
  autoHeight = false,
  minWidth = 360,
  minHeight = 280,
  hasBackdrop = false,
  isDraggable = true,
  isResizable = true,
  isMinimizable = true,
  isMaximizable = true,
  closeOnEsc = true,
  className = '',
  zIndex = 45,
}: FloatingWindowProps) {
  // Compute default center position
  const getDefaultPosition = useCallback(() => {
    if (typeof window === 'undefined') return { x: 80, y: 80 };
    if (initialPosition) return initialPosition;
    const defaultX = Math.max(16, Math.round((window.innerWidth - initialSize.width) / 2));
    const defaultY = Math.max(24, Math.round((window.innerHeight - initialSize.height) / 2));
    return { x: defaultX, y: defaultY };
  }, [initialPosition, initialSize]);

  const [position, setPosition] = useState<{ x: number; y: number }>(getDefaultPosition);
  const [size, setSize] = useState<{ width: number; height: number }>(initialSize);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [preMaxState, setPreMaxState] = useState<{ position: { x: number; y: number }; size: { width: number; height: number } } | null>(null);
  const [activeZ, setActiveZ] = useState(zIndex);
  const activeZRef = useRef(activeZ);
  activeZRef.current = activeZ;
  const instanceIdRef = useRef<symbol | null>(null);
  if (!instanceIdRef.current) {
    instanceIdRef.current = Symbol(id);
  }

  useEffect(() => {
    setActiveZ(zIndex);
  }, [zIndex]);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const mobileSheetDrag = useBottomSheetDragToClose({
    onClose,
    disabled: !isMobileViewport || !isOpen,
  });

  const windowRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);
  positionRef.current = position;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef<{ mouseX: number; mouseY: number; startW: number; startH: number }>({ mouseX: 0, mouseY: 0, startW: 0, startH: 0 });

  const persistGeometry = useCallback(
    (nextPos: { x: number; y: number }, nextSize: { width: number; height: number }) => {
      if (typeof window === 'undefined' || window.innerWidth < 768) return;
      try {
        localStorage.setItem(
          getFloatingWindowStorageKey(id),
          serializeFloatingWindowGeometry({
            x: nextPos.x,
            y: nextPos.y,
            width: nextSize.width,
            height: nextSize.height,
          })
        );
      } catch {}
    },
    [id]
  );

  // Hydrate persisted size & position (clamped to viewport) when opened on desktop
  useEffect(() => {
    if (!isOpen) return;
    setIsMinimized(false);
    setIsMaximized(false);
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      try {
        const stored = parseStoredFloatingWindowGeometry(
          localStorage.getItem(getFloatingWindowStorageKey(id)),
          { width: window.innerWidth, height: window.innerHeight },
          { minWidth, minHeight }
        );
        if (stored) {
          setPosition({ x: stored.x, y: stored.y });
          setSize({ width: stored.width, height: stored.height });
          return;
        }
      } catch {}
    }
    if (!initialPosition) {
      setPosition(getDefaultPosition());
    }
  }, [isOpen, id, minWidth, minHeight, initialPosition, getDefaultPosition]);

  // Escape key handler (closes only the topmost open FloatingWindow)
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const instanceId = instanceIdRef.current!;
    const entry: OpenFloatingWindowEntry = {
      instanceId,
      getZIndex: () => activeZRef.current,
    };
    openFloatingWindowStack.push(entry);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      let topEntry: OpenFloatingWindowEntry | null = null;
      for (const candidate of openFloatingWindowStack) {
        if (!topEntry || candidate.getZIndex() >= topEntry.getZIndex()) {
          topEntry = candidate;
        }
      }
      if (topEntry?.instanceId === instanceId) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const idx = openFloatingWindowStack.findIndex((it) => it.instanceId === instanceId);
      if (idx >= 0) {
        openFloatingWindowStack.splice(idx, 1);
      }
    };
  }, [isOpen, closeOnEsc, onClose]);

  // Window drag handlers
  const handleMouseDownHeader = (e: React.MouseEvent) => {
    if (!isDraggable || isMaximized || isMinimized) return;
    // Don't drag if clicking buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a')) {
      return;
    }

    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: position.x,
      startY: position.y,
    };

    setActiveZ((z) => Math.max(z, 50));

    const handleMouseMove = (moveEvent: MouseEvent | PointerEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = moveEvent.clientX - dragStartRef.current.mouseX;
      const deltaY = moveEvent.clientY - dragStartRef.current.mouseY;
      const newX = Math.max(10, Math.min(window.innerWidth - 120, dragStartRef.current.startX + deltaX));
      const newY = Math.max(10, Math.min(window.innerHeight - 50, dragStartRef.current.startY + deltaY));
      const nextPos = { x: newX, y: newY };
      positionRef.current = nextPos;
      setPosition(nextPos);
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        persistGeometry(positionRef.current, sizeRef.current);
      }
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Window resize handler
  const handleMouseDownResize = (e: React.MouseEvent) => {
    if (!isResizable || isMaximized || isMinimized) return;
    e.preventDefault();
    e.stopPropagation();

    isResizingRef.current = true;
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startW: size.width,
      startH: size.height,
    };

    const handleMouseMove = (moveEvent: MouseEvent | PointerEvent) => {
      if (!isResizingRef.current) return;
      const deltaX = moveEvent.clientX - resizeStartRef.current.mouseX;
      const deltaY = moveEvent.clientY - resizeStartRef.current.mouseY;
      const newW = Math.max(minWidth, Math.min(window.innerWidth - positionRef.current.x - 16, resizeStartRef.current.startW + deltaX));
      const newH = Math.max(minHeight, Math.min(window.innerHeight - positionRef.current.y - 16, resizeStartRef.current.startH + deltaY));
      const nextSize = { width: newW, height: newH };
      sizeRef.current = nextSize;
      setSize(nextSize);
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        persistGeometry(positionRef.current, sizeRef.current);
      }
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Maximize toggle
  const toggleMaximize = () => {
    if (!isMaximizable) return;
    if (isMaximized) {
      if (preMaxState) {
        setPosition(preMaxState.position);
        setSize(preMaxState.size);
      }
      setIsMaximized(false);
    } else {
      setPreMaxState({ position, size });
      setPosition({ x: 12, y: 12 });
      setSize({
        width: typeof window !== 'undefined' ? window.innerWidth - 24 : 1200,
        height: typeof window !== 'undefined' ? window.innerHeight - 24 : 800,
      });
      setIsMaximized(true);
      setIsMinimized(false);
    }
  };

  if (!isOpen) return null;

  // MOBILE BOTTOM SHEET PRESENTATION (< 768px): native edge-to-edge sheet with dimmed backdrop & safe-area footer
  if (isMobileViewport) {
    return (
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-end justify-center p-0 pointer-events-auto select-none animate-in fade-in duration-150"
        style={{ zIndex: Math.max(activeZ, 120) }}
        onClick={onClose}
      >
        <div
          ref={windowRef}
          onClick={(e) => e.stopPropagation()}
          style={mobileSheetDrag.sheetStyle}
          className={`w-full max-h-[92dvh] flex flex-col bg-white rounded-t-3xl shadow-2xl border-t border-slate-200/90 overflow-hidden select-text animate-in slide-in-from-bottom duration-200 ${className}`}
        >
          <div {...mobileSheetDrag.dragHandlers} className="bg-slate-900 text-white px-4 pt-2 pb-3 shrink-0 select-none touch-none">
            <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5" aria-hidden="true" />
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {icon && <span className="text-blue-400 shrink-0">{icon}</span>}
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-sm text-white truncate flex items-center gap-2"><span className="truncate">{title}</span></div>
                  {subtitle && <div className="text-[11px] text-slate-400 truncate mt-0.5">{subtitle}</div>}
                </div>
              </div>
              <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-slate-800/90 text-slate-300 hover:text-white active:scale-95 flex items-center justify-center transition-all cursor-pointer shrink-0" title="Close" aria-label="Close modal">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            {headerExtra && <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center flex-wrap gap-1.5">{headerExtra}</div>}
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 bg-slate-50/50 flex flex-col">{children}</div>
          {footer && <div className="shrink-0 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">{footer}</div>}
        </div>
      </div>
    );
  }

  // MINIMIZED FLOATING PILL AT BOTTOM OF SCREEN (Desktop)
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 pointer-events-auto animate-in slide-in-from-bottom-2 duration-150" style={{ zIndex: activeZ }}>
        <div onClick={() => setIsMinimized(false)} className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 cursor-pointer hover:bg-slate-800 transition-all select-none">
          {icon && <span className="text-blue-400">{icon}</span>}
          <span className="font-extrabold text-xs max-w-[200px] truncate">{title}</span>
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-700">
            <button type="button" onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }} title="Expand Window" className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer">⤢</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} title="Close" className="text-slate-400 hover:text-rose-400 p-0.5 rounded cursor-pointer"><XIcon className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>
    );
  }

  const clampedWidth = typeof window !== 'undefined' ? Math.min(size.width, window.innerWidth - 32) : size.width;
  const clampedHeight = typeof window !== 'undefined' ? Math.min(size.height, window.innerHeight - 32) : size.height;
  const clampedX = typeof window !== 'undefined' ? Math.max(12, Math.min(position.x, window.innerWidth - clampedWidth - 12)) : position.x;
  const clampedY = typeof window !== 'undefined' ? Math.max(12, Math.min(position.y, window.innerHeight - 80)) : position.y;

  return (
    <div
      className={`fixed inset-0 select-none ${hasBackdrop ? 'z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto' : 'pointer-events-none'}`}
      style={{ zIndex: activeZ }}
    >
      <div
        ref={windowRef}
        onMouseDown={() => setActiveZ((z) => Math.max(z, 50))}
        style={
          hasBackdrop
            ? { width: clampedWidth, maxHeight: autoHeight && !isMaximized ? '85vh' : undefined }
            : { position: 'fixed', left: `${clampedX}px`, top: `${clampedY}px`, width: `${clampedWidth}px`, height: autoHeight && !isMaximized ? 'auto' : `${clampedHeight}px`, maxHeight: autoHeight && !isMaximized ? '85vh' : undefined }
        }
        className={`pointer-events-auto flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden transform transition-[box-shadow] select-text duration-100 ${className}`}
      >
        <div
          onMouseDown={handleMouseDownHeader}
          className={`px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0 select-none ${isDraggable && !isMaximized ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <span className="text-blue-400 shrink-0">{icon}</span>}
            <div className="min-w-0">
              <div className="font-extrabold text-xs text-white truncate flex items-center gap-2"><span>{title}</span></div>
              {subtitle && <div className="text-[10px] text-slate-400 truncate">{subtitle}</div>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {headerExtra}
            {isMinimizable && (
              <button type="button" onClick={() => setIsMinimized(true)} className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer text-xs font-mono" title="Minimize">—</button>
            )}
            {isMaximizable && (
              <button type="button" onClick={toggleMaximize} className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer text-xs" title={isMaximized ? 'Restore' : 'Maximize'}>{isMaximized ? '❐' : '□'}</button>
            )}
            <button type="button" onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer" title="Close">
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/50 flex flex-col">{children}</div>
        {footer && <div className="shrink-0 bg-white border-t border-slate-200">{footer}</div>}

        {isResizable && !isMaximized && (
          <div onMouseDown={handleMouseDownResize} className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5 select-none text-slate-300 hover:text-slate-600 transition-colors" title="Drag to resize">
            <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-current"><polygon points="10,0 10,10 0,10" /></svg>
          </div>
        )}
      </div>
    </div>
  );
}
