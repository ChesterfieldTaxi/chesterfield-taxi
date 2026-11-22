import React, { useState, useEffect, useCallback, useRef } from 'react';

const SIDEBAR_WIDTH_STORAGE_KEY = 'ct_dispatch_sidebar_width';
const QUEUE_HEIGHT_STORAGE_KEY = 'ct_dispatch_queue_height';
const DOCK_WIDTH_STORAGE_KEY = 'ct_dispatch_dock_width';

export type DispatchResizeHandle = 'sidebar' | 'queue' | 'operations' | null;

export interface UseDispatchPanelResizeResult {
  sidebarWidth: number;
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  queueHeight: number;
  setQueueHeight: React.Dispatch<React.SetStateAction<number>>;
  operationsWidth: number;
  setOperationsWidth: React.Dispatch<React.SetStateAction<number>>;
  activeResizeHandle: DispatchResizeHandle;
  isDesktop: boolean;
  handleSidebarMouseDown: (e: React.MouseEvent | React.PointerEvent) => void;
  handleQueueMouseDown: (e: React.MouseEvent | React.PointerEvent) => void;
  handleOperationsMouseDown: (e: React.MouseEvent | React.PointerEvent) => void;
}

/**
 * Manages left booking sidebar width, bottom trip queue height, right operations
 * dock width, pointer drag-resizing with viewport clamping, and SSR-safe
 * post-mount `localStorage` + `window.innerWidth` hydration.
 */
export function useDispatchPanelResize(): UseDispatchPanelResizeResult {
  // Deterministic SSR defaults — never read localStorage or window dimensions during initial render
  const [sidebarWidth, setSidebarWidth] = useState<number>(430);
  const [queueHeight, setQueueHeight] = useState<number>(240);
  const [operationsWidth, setOperationsWidth] = useState<number>(400);
  const [activeResizeHandle, setActiveResizeHandle] = useState<DispatchResizeHandle>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(true);
  const hasHydratedDimensionsRef = useRef<boolean>(false);

  // Hydrate persisted dimensions & viewport breakpoint on client mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsDesktop(window.innerWidth >= 1024);

    try {
      const savedSidebar = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
      if (savedSidebar) {
        const parsed = parseInt(savedSidebar, 10);
        if (!isNaN(parsed) && parsed >= 320 && parsed <= 680) {
          setSidebarWidth(parsed);
        }
      }
      const savedQueue = localStorage.getItem(QUEUE_HEIGHT_STORAGE_KEY);
      if (savedQueue) {
        const parsed = parseInt(savedQueue, 10);
        if (!isNaN(parsed) && parsed >= 150 && parsed <= 600) {
          setQueueHeight(parsed);
        }
      }
      const savedDock = localStorage.getItem(DOCK_WIDTH_STORAGE_KEY);
      if (savedDock) {
        const parsed = parseInt(savedDock, 10);
        if (!isNaN(parsed) && parsed >= 320 && parsed <= 760) {
          setOperationsWidth(parsed);
        }
      }
    } catch {
      // Ignore storage access errors
    }

    hasHydratedDimensionsRef.current = true;

    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Persist dimensions to localStorage only after client mount hydration
  useEffect(() => {
    if (typeof window === 'undefined' || !hasHydratedDimensionsRef.current) return;
    try {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(sidebarWidth)));
      localStorage.setItem(QUEUE_HEIGHT_STORAGE_KEY, String(Math.round(queueHeight)));
      localStorage.setItem(DOCK_WIDTH_STORAGE_KEY, String(Math.round(operationsWidth)));
    } catch {
      // Ignore storage errors
    }
  }, [sidebarWidth, queueHeight, operationsWidth]);

  const handleSidebarMouseDown = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    setActiveResizeHandle('sidebar');
  }, []);

  const handleQueueMouseDown = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    setActiveResizeHandle('queue');
  }, []);

  const handleOperationsMouseDown = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    setActiveResizeHandle('operations');
  }, []);

  useEffect(() => {
    if (!activeResizeHandle || typeof window === 'undefined') return;

    const handleMove = (e: MouseEvent | PointerEvent) => {
      if (activeResizeHandle === 'sidebar') {
        const maxSidebar = Math.min(680, Math.max(360, window.innerWidth - 420));
        const nextWidth = Math.min(Math.max(e.clientX, 320), maxSidebar);
        setSidebarWidth(nextWidth);
      } else if (activeResizeHandle === 'queue') {
        const maxQueue = Math.max(220, Math.floor(window.innerHeight * 0.65));
        const nextHeight = Math.min(Math.max(window.innerHeight - e.clientY, 150), maxQueue);
        setQueueHeight(nextHeight);
      } else if (activeResizeHandle === 'operations') {
        const maxDock = Math.min(760, Math.max(360, window.innerWidth - 460));
        const nextWidth = Math.min(Math.max(window.innerWidth - e.clientX, 320), maxDock);
        setOperationsWidth(nextWidth);
      }
    };

    const handleUp = () => {
      setActiveResizeHandle(null);
    };

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

  return {
    sidebarWidth,
    setSidebarWidth,
    queueHeight,
    setQueueHeight,
    operationsWidth,
    setOperationsWidth,
    activeResizeHandle,
    isDesktop,
    handleSidebarMouseDown,
    handleQueueMouseDown,
    handleOperationsMouseDown,
  };
}
