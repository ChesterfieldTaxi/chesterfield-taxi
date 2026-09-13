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
    'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 hover:text-black font-semibold shadow-2xs border border-slate-300 hover:border-slate-400 focus-visible:ring-slate-400 transition-all',
  outline:
    'bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-800 hover:text-slate-950 font-semibold border border-slate-300 hover:border-slate-400 shadow-2xs focus-visible:ring-slate-400 transition-all',
  ghost:
    'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-700 hover:text-slate-950 font-semibold focus-visible:ring-slate-400',
  danger:
    'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold shadow-xs focus-visible:ring-red-500 border border-red-700',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-1.5 text-xs rounded-lg gap-1.5',
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
        className={`inline-flex items-center justify-center whitespace-nowrap shrink-0 transition-colors duration-150 select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
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
