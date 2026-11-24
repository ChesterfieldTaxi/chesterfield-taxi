import React from 'react';

export interface CollapsibleSectionProps {
  isOpen: boolean;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  id?: string;
}

/**
 * Smooth height-interpolated collapsible disclosure wrapper using CSS Grid `0fr -> 1fr`.
 * Preserves child mount state while eliminating layout jumps and collapsed stack margins.
 */
export function CollapsibleSection({
  isOpen,
  children,
  className = '',
  contentClassName = '',
  id,
}: CollapsibleSectionProps) {
  return (
    <div
      id={id}
      aria-hidden={!isOpen}
      inert={!isOpen || undefined}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
        isOpen
          ? 'grid-rows-[1fr] opacity-100'
          : 'grid-rows-[0fr] opacity-0 pointer-events-none !mt-0'
      } ${className}`.trim()}
    >
      <div className={`overflow-hidden min-h-0 ${contentClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}
