import React from 'react';
import { SpinnerIcon } from './Icons';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-semibold shadow-xs hover:shadow focus-visible:ring-amber-500 border border-amber-600/20',
  secondary:
    'bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-medium shadow-xs focus-visible:ring-slate-500 border border-slate-700',
  outline:
    'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-medium border border-slate-300 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
  ghost:
    'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-medium focus-visible:ring-slate-400 dark:text-slate-200 dark:hover:bg-slate-800',
  danger:
    'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold shadow-xs focus-visible:ring-red-500 border border-red-700',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-md gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-lg gap-2',
  lg: 'px-6 py-3.5 text-base rounded-xl gap-2.5 font-semibold',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading}
        className={`inline-flex items-center justify-center transition-colors duration-150 select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <SpinnerIcon className="w-4 h-4 animate-spin text-current" />
        ) : (
          leftIcon
        )}
        <span>{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
