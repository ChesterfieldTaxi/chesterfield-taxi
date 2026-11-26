import React from 'react';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'outline'
  | 'info'
  | 'neutral'
  | 'error';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-muted text-fg-strong border-border-subtle',
  primary: 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border',
  success: 'bg-status-success-bg-strong text-status-success-fg border-status-success-border',
  warning: 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border',
  danger: 'bg-status-danger-bg-strong text-status-danger-fg border-status-danger-border',
  outline: 'bg-transparent text-fg-secondary border-border-strong',
  info: 'bg-status-info-bg-strong text-status-info-fg border-status-info-border',
  neutral: 'bg-surface-muted text-fg-secondary border-border-subtle',
  error: 'bg-status-danger-bg-strong text-status-danger-fg border-status-danger-border',
};


const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs font-semibold',
};

export function Badge({
  children,
  className = '',
  variant = 'default',
  size = 'sm',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center font-medium rounded-full border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
