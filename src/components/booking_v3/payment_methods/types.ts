/**
 * Payment Method Type System
 * Extensible type system for all payment methods
 */

// Core payment method types
export type PaymentMethodType =
    | 'cash'
    | 'card'
    | 'corporate_account'
    | 'stripe'           // Future
    | 'paypal'           // Future
    | 'employee_portal'; // Future

// Base payment data (all methods include this)
export interface BasePaymentData {
    method: PaymentMethodType;
    timestamp: Date;
}

// Cash payment (no additional fields)
export interface CashPaymentData extends BasePaymentData {
    method: 'cash';
}

// Card payment (no additional fields)
export interface CardPaymentData extends BasePaymentData {
    method: 'card';
}

// Corporate account payment
export interface CorporateAccountPaymentData extends BasePaymentData {
    method: 'corporate_account';
    accountNumber: string;
    authorizationCode: string;
    employeeName?: string;
    costCenter?: string;
}

// Future: Stripe payment
export interface StripePaymentData extends BasePaymentData {
    method: 'stripe';
    paymentIntentId: string;
    amount: number;
    status: 'pending' | 'authorized' | 'captured' | 'failed';
}

// Future: PayPal payment
export interface PayPalPaymentData extends BasePaymentData {
    method: 'paypal';
    orderId: string;
    payerId: string;
}

// Future: Employee portal payment
export interface EmployeePortalPaymentData extends BasePaymentData {
    method: 'employee_portal';
    employeeId: string;
    employeeEmail: string;
    accountId: string;
}

// Discriminated union of all payment data types
export type PaymentData =
    | CashPaymentData
    | CardPaymentData
    | CorporateAccountPaymentData
    | StripePaymentData
    | PayPalPaymentData
    | EmployeePortalPaymentData;

/**
 * Props for payment form components
 */
export interface PaymentFormProps {
    value: PaymentData;
    onChange: (data: PaymentData) => void;
    onValidate?: (isValid: boolean) => void;
}

/**
 * Payment method configuration
 */
export interface PaymentMethodConfig {
    id: PaymentMethodType;
    label: string;
    icon?: React.ReactNode;
    component: React.ComponentType<PaymentFormProps>;
    requiresAuth: boolean;
    description?: string;
    enabled?: boolean;  // Feature flag
}
