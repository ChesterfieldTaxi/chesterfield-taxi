import React from 'react';

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'outline';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-800 border-slate-200',
  primary: 'bg-amber-100 text-amber-900 border-amber-300',
  success: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  danger: 'bg-red-100 text-red-800 border-red-300',
  outline: 'bg-transparent text-slate-700 border-slate-300',
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
