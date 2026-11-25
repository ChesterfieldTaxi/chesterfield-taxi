import { useCallback, useRef } from 'react';
import type React from 'react';

const LONG_PRESS_DELAY_MS = 450;
const MOVE_CANCEL_THRESHOLD_PX = 8;

export interface UseLongPressSelectionOptions {
  isSelectionMode: boolean;
  onToggleSelect: (key: string) => void;
}

/**
 * Reusable mobile press-and-hold (~450ms) selection gesture helper.
 * Cancels on pointer move > 8px (scroll) and suppresses the trailing click
 * after a long-press triggers. Once in selection mode, row taps toggle selection.
 */
export function useLongPressSelection({
  isSelectionMode,
  onToggleSelect,
}: UseLongPressSelectionOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredKeyRef = useRef<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  }, []);

  const getRowGestureProps = useCallback(
    (key: string, onDefaultClick: () => void) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') return;
        clearTimer();
        triggeredKeyRef.current = null;
        startPosRef.current = { x: e.clientX, y: e.clientY };
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          startPosRef.current = null;
          triggeredKeyRef.current = key;
          onToggleSelect(key);
        }, LONG_PRESS_DELAY_MS);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!startPosRef.current) return;
        const dist = Math.hypot(
          e.clientX - startPosRef.current.x,
          e.clientY - startPosRef.current.y
        );
        if (dist > MOVE_CANCEL_THRESHOLD_PX) {
          clearTimer();
        }
      },
      onPointerUp: clearTimer,
      onPointerCancel: clearTimer,
      onClick: () => {
        if (triggeredKeyRef.current === key) {
          triggeredKeyRef.current = null;
          return;
        }
        if (isSelectionMode) {
          onToggleSelect(key);
          return;
        }
        onDefaultClick();
      },
    }),
    [clearTimer, isSelectionMode, onToggleSelect]
  );

  return { getRowGestureProps };
}
