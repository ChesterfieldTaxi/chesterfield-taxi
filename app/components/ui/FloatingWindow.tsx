import React, { useState, useRef, useEffect, useCallback } from 'react';
import { XIcon } from './Icons';

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

  const windowRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef<{ mouseX: number; mouseY: number; startW: number; startH: number }>({ mouseX: 0, mouseY: 0, startW: 0, startH: 0 });

  // Reset position when opened if needed
  useEffect(() => {
    if (isOpen) {
      if (!initialPosition) {
        setPosition(getDefaultPosition());
      }
      setIsMinimized(false);
      setIsMaximized(false);
    }
  }, [isOpen, initialPosition, getDefaultPosition]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = moveEvent.clientX - dragStartRef.current.mouseX;
      const deltaY = moveEvent.clientY - dragStartRef.current.mouseY;

      const newX = Math.max(10, Math.min(window.innerWidth - 120, dragStartRef.current.startX + deltaX));
      const newY = Math.max(10, Math.min(window.innerHeight - 50, dragStartRef.current.startY + deltaY));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
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

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const deltaX = moveEvent.clientX - resizeStartRef.current.mouseX;
      const deltaY = moveEvent.clientY - resizeStartRef.current.mouseY;

      const newW = Math.max(minWidth, Math.min(window.innerWidth - position.x - 16, resizeStartRef.current.startW + deltaX));
      const newH = Math.max(minHeight, Math.min(window.innerHeight - position.y - 16, resizeStartRef.current.startH + deltaY));

      setSize({ width: newW, height: newH });
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
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

  // MINIMIZED FLOATING PILL AT BOTTOM OF SCREEN
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 pointer-events-auto animate-in slide-in-from-bottom-2 duration-150"
        style={{ zIndex: activeZ }}
      >
        <div
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 cursor-pointer hover:bg-slate-800 transition-all select-none"
        >
          {icon && <span className="text-blue-400">{icon}</span>}
          <span className="font-extrabold text-xs max-w-[200px] truncate">{title}</span>
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-700">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(false);
              }}
              title="Expand Window"
              className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
            >
              ⤢
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Close"
              className="text-slate-400 hover:text-rose-400 p-0.5 rounded cursor-pointer"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 select-none ${
        hasBackdrop
          ? 'z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto'
          : 'pointer-events-none'
      }`}
      style={{ zIndex: activeZ }}
    >
      <div
        ref={windowRef}
        onMouseDown={() => setActiveZ((z) => Math.max(z, 50))}
        style={
          hasBackdrop
            ? {
                width: Math.min(size.width, typeof window !== 'undefined' ? window.innerWidth - 32 : size.width),
                maxHeight: autoHeight && !isMaximized ? '85vh' : undefined,
              }
            : {
                position: 'fixed',
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${size.width}px`,
                height: autoHeight && !isMaximized ? 'auto' : `${size.height}px`,
                maxHeight: autoHeight && !isMaximized ? '85vh' : undefined,
              }
        }
        className={`pointer-events-auto flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden transform transition-[box-shadow] select-text duration-100 ${className}`}
      >
        {/* TITLE BAR (Draggable handle) */}
        <div
          onMouseDown={handleMouseDownHeader}
          className={`px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0 select-none ${
            isDraggable && !isMaximized ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <span className="text-blue-400 shrink-0">{icon}</span>}
            <div className="min-w-0">
              <div className="font-extrabold text-xs text-white truncate flex items-center gap-2">
                <span>{title}</span>
              </div>
              {subtitle && <div className="text-[10px] text-slate-400 truncate">{subtitle}</div>}
            </div>
          </div>

          {/* Window action controls */}
          <div className="flex items-center gap-1 shrink-0">
            {headerExtra}

            {isMinimizable && (
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer text-xs font-mono"
                title="Minimize"
              >
                —
              </button>
            )}

            {isMaximizable && (
              <button
                type="button"
                onClick={toggleMaximize}
                className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer text-xs"
                title={isMaximized ? 'Restore' : 'Maximize'}
              >
                {isMaximized ? '❐' : '□'}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* WINDOW BODY */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/50 flex flex-col">
          {children}
        </div>

        {/* OPTIONAL WINDOW FOOTER */}
        {footer && <div className="shrink-0 bg-white border-t border-slate-200">{footer}</div>}

        {/* CORNER RESIZE GRIP */}
        {isResizable && !isMaximized && (
          <div
            onMouseDown={handleMouseDownResize}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5 select-none text-slate-300 hover:text-slate-600 transition-colors"
            title="Drag to resize"
          >
            <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-current">
              <polygon points="10,0 10,10 0,10" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
