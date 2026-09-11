import React from 'react';
import { InfoIcon, AlertCircleIcon, CheckIcon } from './Icons';

export type AlertVariant = 'info' | 'warning' | 'error' | 'success';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
}

const variantStyles: Record<AlertVariant, { container: string; text: string; icon: React.ReactNode }> = {
  info: {
    container: 'bg-blue-50 border-blue-200 text-blue-900',
    text: 'text-blue-800',
    icon: <InfoIcon className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />,
  },
  warning: {
    container: 'bg-amber-50 border-amber-200 text-amber-900',
    text: 'text-amber-800',
    icon: <AlertCircleIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />,
  },
  error: {
    container: 'bg-red-50 border-red-200 text-red-900',
    text: 'text-red-800',
    icon: <AlertCircleIcon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />,
  },
  success: {
    container: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    text: 'text-emerald-800',
    icon: <CheckIcon className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />,
  },
};

export function Alert({
  variant = 'info',
  title,
  children,
  className = '',
  ...props
}: AlertProps) {
  const current = variantStyles[variant];

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 p-4 rounded-xl border ${current.container} ${className}`}
      {...props}
    >
      {current.icon}
      <div className="flex-1 min-w-0 text-sm">
        {title && <h4 className="font-semibold mb-0.5">{title}</h4>}
        <div className={`leading-relaxed ${current.text}`}>{children}</div>
      </div>
    </div>
  );
}
