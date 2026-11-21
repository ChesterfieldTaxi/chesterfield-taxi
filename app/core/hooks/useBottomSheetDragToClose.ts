import { useState, useRef, useCallback } from 'react';
import type React from 'react';

export interface UseBottomSheetDragOptions {
  onClose: () => void;
  disabled?: boolean;
  /** Minimum downward drag distance (px) to dismiss on release. Default: 90 */
  thresholdPx?: number;
}

export interface BottomSheetDragHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
}

/**
 * Lightweight, scroll-safe mobile bottom-sheet drag-to-close hook.
 * Attach `dragHandlers` to the sheet's header/drag-handle bar so body scrolling is never intercepted.
 */
export function useBottomSheetDragToClose({
  onClose,
  disabled = false,
  thresholdPx = 90,
}: UseBottomSheetDragOptions) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);

  const reset = useCallback(() => {
    startYRef.current = null;
    currentYRef.current = 0;
    setIsDragging(false);
    setDragY(0);
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, input, select, textarea, a')) return;
      const touch = e.touches[0];
      if (!touch) return;
      startYRef.current = touch.clientY;
      startTimeRef.current = Date.now();
      currentYRef.current = 0;
      setIsDragging(true);
    },
    [disabled]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || startYRef.current === null) return;
      const touch = e.touches[0];
      if (!touch) return;
      const delta = Math.max(0, touch.clientY - startYRef.current);
      currentYRef.current = delta;
      setDragY(delta);
    },
    [disabled]
  );

  const onTouchEnd = useCallback(() => {
    if (startYRef.current === null) return;
    const elapsed = Math.max(1, Date.now() - startTimeRef.current);
    const delta = currentYRef.current;
    const velocity = delta / elapsed; // px per ms
    const shouldClose = delta >= thresholdPx || (delta >= 32 && velocity > 0.45);
    reset();
    if (shouldClose && !disabled) {
      onClose();
    }
  }, [disabled, onClose, reset, thresholdPx]);

  const sheetStyle: React.CSSProperties =
    dragY > 0
      ? {
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        }
      : {
          transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        };

  return {
    dragY,
    isDragging,
    sheetStyle,
    dragHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: reset,
    } satisfies BottomSheetDragHandlers,
  };
}
