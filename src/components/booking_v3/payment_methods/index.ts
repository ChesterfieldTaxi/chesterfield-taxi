/**
 * Payment Method Registry
 * Central registry of all available payment methods
 */

import { CashPaymentForm } from './CashPaymentForm';
import { CorporateAccountPaymentForm } from './CorporateAccountPaymentForm';
import { PaymentMethodType, PaymentMethodConfig } from './types';

/**
 * Registry of all payment methods
 * Add new payment methods here to make them available
 */
export const PAYMENT_METHODS: PaymentMethodConfig[] = [
    {
        id: 'cash',
        label: 'Cash',
        component: CashPaymentForm,
        requiresAuth: false,
        description: 'Pay driver with cash at pickup',
        enabled: true
    },
    {
        id: 'card',
        label: 'Card',
        component: CashPaymentForm, // Reusing same form as it's just a message
        requiresAuth: false,
        description: 'Pay driver with card at pickup',
        enabled: true
    },
    {
        id: 'corporate_account',
        label: 'Corporate Account',
        component: CorporateAccountPaymentForm,
        requiresAuth: true,
        description: 'Bill to your company account',
        enabled: true
    }
    // Future payment methods:
    // {
    //   id: 'stripe',
    //   label: 'Pay with Card',
    //   component: StripePaymentForm,
    //   requiresAuth: false,
    //   description: 'Secure online payment',
    //   enabled: process.env.VITE_STRIPE_ENABLED === 'true'
    // },
    // {
    //   id: 'employee_portal',
    //   label: 'Employee Account',
    //   component: EmployeePortalPaymentForm,
    //   requiresAuth: true,
    //   description: 'Login with your employee credentials',
    //   enabled: true
    // }
];

/**
 * Get payment method configuration by ID
 */
export function getPaymentMethod(id: PaymentMethodType): PaymentMethodConfig | undefined {
    return PAYMENT_METHODS.find(m => m.id === id);
}

/**
 * Get all enabled payment methods
 * Can filter based on environment variables or feature flags
 */
export function getAvailablePaymentMethods(): PaymentMethodConfig[] {
    return PAYMENT_METHODS.filter(method => method.enabled !== false);
}

/**
 * Get default payment method
 */
export function getDefaultPaymentMethod(): PaymentMethodType {
    const available = getAvailablePaymentMethods();
    return available[0]?.id || 'cash';
}

// Re-export types for convenience
export type { PaymentMethodType, PaymentMethodConfig, PaymentData, PaymentFormProps } from './types';
