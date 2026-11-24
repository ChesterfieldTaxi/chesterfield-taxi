import React, { useState, useEffect, useCallback } from 'react';
import type { DesktopDockTab } from './dispatch-workspace.util';

export const SIDEBAR_WIDTH_STORAGE_KEY = 'ct_dispatch_sidebar_width';
export const QUEUE_HEIGHT_STORAGE_KEY = 'ct_dispatch_queue_height';
export const DOCK_WIDTH_STORAGE_KEY = 'ct_dispatch_dock_width';
export const ACTIVE_DOCK_TAB_STORAGE_KEY = 'ct_dispatch_active_dock_tab';

export const DEFAULT_DISPATCH_PANEL_LAYOUT = {
  sidebarWidth: 430,
  queueHeight: 240,
  operationsWidth: 400,
  activeDockTab: 'none' as DesktopDockTab,
} as const;

const VALID_DOCK_TABS = new Set<DesktopDockTab>(['none', 'drivers', 'comms', 'email', 'phone', 'alerts']);

export type DispatchResizeHandle = 'sidebar' | 'queue' | 'operations' | null;

export interface DispatchPanelLayoutValues {
  sidebarWidth: number;
  queueHeight: number;
  operationsWidth: number;
  activeDockTab?: DesktopDockTab;
}

export interface ParsedDispatchPanelLayout extends DispatchPanelLayoutValues {
  activeDockTab: DesktopDockTab;
  storedSidebarWidth: number;
  storedQueueHeight: number;
  storedOperationsWidth: number;
}

function parseBoundedInt(raw: unknown, min: number, max: number, fallback: number): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const num = typeof raw === 'number' ? Math.round(raw) : parseInt(String(raw), 10);
  return Number.isFinite(num) && num >= min && num <= max ? num : fallback;
}

export function clampDispatchLayoutToViewport(
  stored: { sidebarWidth: number; queueHeight: number; operationsWidth: number },
  viewport?: { width: number; height: number } | null
): { sidebarWidth: number; queueHeight: number; operationsWidth: number } {
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) return { ...stored };
  return {
    sidebarWidth: Math.min(Math.max(stored.sidebarWidth, 320), Math.min(680, Math.max(320, viewport.width - 420))),
    queueHeight: Math.min(Math.max(stored.queueHeight, 150), Math.max(220, Math.floor(viewport.height * 0.68))),
    operationsWidth: Math.min(Math.max(stored.operationsWidth, 320), Math.min(760, Math.max(320, viewport.width - 460))),
  };
}

export function parseStoredDispatchPanelLayout(
  storageRecord: Record<string, string | number | null | undefined> | null | undefined,
  viewport?: { width: number; height: number }
): ParsedDispatchPanelLayout {
  const rec = storageRecord || {};
  const storedSidebarWidth = parseBoundedInt(rec[SIDEBAR_WIDTH_STORAGE_KEY] ?? rec.sidebarWidth, 320, 680, 430);
  const storedQueueHeight = parseBoundedInt(rec[QUEUE_HEIGHT_STORAGE_KEY] ?? rec.queueHeight, 150, 1200, 240);
  const storedOperationsWidth = parseBoundedInt(rec[DOCK_WIDTH_STORAGE_KEY] ?? rec.operationsWidth, 320, 760, 400);
  const rawTab = rec[ACTIVE_DOCK_TAB_STORAGE_KEY] ?? rec.activeDockTab;
  const activeDockTab: DesktopDockTab =
    typeof rawTab === 'string' && VALID_DOCK_TABS.has(rawTab as DesktopDockTab) ? (rawTab as DesktopDockTab) : 'none';
  const clamped = clampDispatchLayoutToViewport(
    { sidebarWidth: storedSidebarWidth, queueHeight: storedQueueHeight, operationsWidth: storedOperationsWidth },
    viewport
  );
  return { ...clamped, activeDockTab, storedSidebarWidth, storedQueueHeight, storedOperationsWidth };
}

export function serializeDispatchPanelLayout(layout: DispatchPanelLayoutValues): Record<string, string> {
  const clampNum = (v: number, min: number, max: number, fb: number) =>
    Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fb;
  const serialized: Record<string, string> = {
    [SIDEBAR_WIDTH_STORAGE_KEY]: String(clampNum(layout.sidebarWidth, 320, 680, 430)),
    [QUEUE_HEIGHT_STORAGE_KEY]: String(clampNum(layout.queueHeight, 150, 1200, 240)),
    [DOCK_WIDTH_STORAGE_KEY]: String(clampNum(layout.operationsWidth, 320, 760, 400)),
  };
  if (layout.activeDockTab && VALID_DOCK_TABS.has(layout.activeDockTab)) {
    serialized[ACTIVE_DOCK_TAB_STORAGE_KEY] = layout.activeDockTab;
  }
  return serialized;
}

function writeStorageSafe(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export interface UseDispatchPanelResizeResult {
  sidebarWidth: number;
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  queueHeight: number;
  setQueueHeight: React.Dispatch<React.SetStateAction<number>>;
  operationsWidth: number;
  setOperationsWidth: React.Dispatch<React.SetStateAction<number>>;
  activeDockTab: DesktopDockTab;
  setActiveDockTab: React.Dispatch<React.SetStateAction<DesktopDockTab>>;
  activeResizeHandle: DispatchResizeHandle;
  isDesktop: boolean;
  handleSidebarMouseDown: (e: React.MouseEvent | React.PointerEvent) => void;
  handleQueueMouseDown: (e: React.MouseEvent | React.PointerEvent) => void;
  handleOperationsMouseDown: (e: React.MouseEvent | React.PointerEvent) => void;
}

export function useDispatchPanelResize(): UseDispatchPanelResizeResult {
  const [storedSidebarWidth, setStoredSidebarWidth] = useState<number>(430);
  const [storedQueueHeight, setStoredQueueHeight] = useState<number>(240);
  const [storedOperationsWidth, setStoredOperationsWidth] = useState<number>(400);
  const [activeDockTab, setActiveDockTabState] = useState<DesktopDockTab>('none');
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [activeResizeHandle, setActiveResizeHandle] = useState<DispatchResizeHandle>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    setIsDesktop(window.innerWidth >= 1024);
    try {
      const parsed = parseStoredDispatchPanelLayout({
        [SIDEBAR_WIDTH_STORAGE_KEY]: localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY),
        [QUEUE_HEIGHT_STORAGE_KEY]: localStorage.getItem(QUEUE_HEIGHT_STORAGE_KEY),
        [DOCK_WIDTH_STORAGE_KEY]: localStorage.getItem(DOCK_WIDTH_STORAGE_KEY),
        [ACTIVE_DOCK_TAB_STORAGE_KEY]: localStorage.getItem(ACTIVE_DOCK_TAB_STORAGE_KEY),
      });
      setStoredSidebarWidth(parsed.storedSidebarWidth);
      setStoredQueueHeight(parsed.storedQueueHeight);
      setStoredOperationsWidth(parsed.storedOperationsWidth);
      setActiveDockTabState(parsed.activeDockTab);
    } catch { /* ignore */ }

    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const setSidebarWidth: React.Dispatch<React.SetStateAction<number>> = useCallback((updater) => {
    setStoredSidebarWidth((prev) => {
      const clamped = Math.min(680, Math.max(320, Math.round(typeof updater === 'function' ? updater(prev) : updater)));
      writeStorageSafe(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
      return clamped;
    });
  }, []);

  const setQueueHeight: React.Dispatch<React.SetStateAction<number>> = useCallback((updater) => {
    setStoredQueueHeight((prev) => {
      const clamped = Math.min(1200, Math.max(150, Math.round(typeof updater === 'function' ? updater(prev) : updater)));
      writeStorageSafe(QUEUE_HEIGHT_STORAGE_KEY, String(clamped));
      return clamped;
    });
  }, []);

  const setOperationsWidth: React.Dispatch<React.SetStateAction<number>> = useCallback((updater) => {
    setStoredOperationsWidth((prev) => {
      const clamped = Math.min(760, Math.max(320, Math.round(typeof updater === 'function' ? updater(prev) : updater)));
      writeStorageSafe(DOCK_WIDTH_STORAGE_KEY, String(clamped));
      return clamped;
    });
  }, []);

  const setActiveDockTab: React.Dispatch<React.SetStateAction<DesktopDockTab>> = useCallback((updater) => {
    setActiveDockTabState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (VALID_DOCK_TABS.has(next)) writeStorageSafe(ACTIVE_DOCK_TAB_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const handleSidebarMouseDown = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault(); setActiveResizeHandle('sidebar');
  }, []);
  const handleQueueMouseDown = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault(); setActiveResizeHandle('queue');
  }, []);
  const handleOperationsMouseDown = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault(); setActiveResizeHandle('operations');
  }, []);

  useEffect(() => {
    if (!activeResizeHandle || typeof window === 'undefined') return;
    const handleMove = (e: MouseEvent | PointerEvent) => {
      if (activeResizeHandle === 'sidebar') {
        const w = Math.round(Math.min(Math.max(e.clientX, 320), Math.min(680, Math.max(360, window.innerWidth - 420))));
        setStoredSidebarWidth(w);
        writeStorageSafe(SIDEBAR_WIDTH_STORAGE_KEY, String(w));
      } else if (activeResizeHandle === 'queue') {
        const h = Math.round(Math.min(Math.max(window.innerHeight - e.clientY, 150), Math.min(1200, Math.max(220, Math.floor(window.innerHeight * 0.68)))));
        setStoredQueueHeight(h);
        writeStorageSafe(QUEUE_HEIGHT_STORAGE_KEY, String(h));
      } else if (activeResizeHandle === 'operations') {
        const w = Math.round(Math.min(Math.max(window.innerWidth - e.clientX, 320), Math.min(760, Math.max(360, window.innerWidth - 460))));
        setStoredOperationsWidth(w);
        writeStorageSafe(DOCK_WIDTH_STORAGE_KEY, String(w));
      }
    };
    const handleUp = () => setActiveResizeHandle(null);
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = activeResizeHandle === 'queue' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('blur', handleUp);
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('blur', handleUp);
    };
  }, [activeResizeHandle]);

  const rendered = clampDispatchLayoutToViewport(
    { sidebarWidth: storedSidebarWidth, queueHeight: storedQueueHeight, operationsWidth: storedOperationsWidth },
    viewport
  );

  return {
    sidebarWidth: rendered.sidebarWidth,
    setSidebarWidth,
    queueHeight: rendered.queueHeight,
    setQueueHeight,
    operationsWidth: rendered.operationsWidth,
    setOperationsWidth,
    activeDockTab,
    setActiveDockTab,
    activeResizeHandle,
    isDesktop,
    handleSidebarMouseDown,
    handleQueueMouseDown,
    handleOperationsMouseDown,
  };
}
