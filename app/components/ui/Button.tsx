import React from 'react';
import { SpinnerIcon } from './Icons';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'blue';
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
    'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold shadow-xs hover:shadow focus-visible:ring-blue-500 border border-blue-600 transition-all',
  blue:
    'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold shadow-xs hover:shadow focus-visible:ring-blue-500 border border-blue-600 transition-all',
  secondary:
    'bg-surface-muted hover:bg-surface-emphasis active:bg-surface-strong text-fg-primary hover:text-black font-semibold shadow-2xs border border-border-strong hover:border-border-emphasis focus-visible:ring-border-emphasis transition-all',
  outline:
    'bg-surface-card hover:bg-surface-muted active:bg-surface-emphasis text-fg-strong hover:text-fg-primary font-semibold border border-border-strong hover:border-border-emphasis shadow-2xs focus-visible:ring-border-emphasis transition-all',
  ghost:
    'bg-transparent hover:bg-surface-muted active:bg-surface-emphasis text-fg-secondary hover:text-fg-primary font-semibold focus-visible:ring-border-emphasis',
  danger:
    'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold shadow-xs focus-visible:ring-red-500 border border-red-700',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
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
        className={`inline-flex items-center justify-center whitespace-nowrap shrink-0 transition-colors duration-150 select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <SpinnerIcon className="w-4 h-4 animate-spin text-current" />
        ) : (
          leftIcon
        )}
        <span className="inline-flex items-center justify-center gap-1.5">{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
