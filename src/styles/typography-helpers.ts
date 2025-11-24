/**
 * Typography Helper - Reusable inline style objects using CSS variables
 * Use these instead of hardcoded font sizes for consistency
 */

export const typography = {
    // Headings
    sectionTitle: {
        fontSize: 'var(--text-lg)',
        fontWeight: 'var(--font-semibold)',
        lineHeight: 'var(--leading-tight)',
        color: '#111827'
    },

    sectionSubtitle: {
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--font-medium)',
        color: '#6b7280'
    },

    // Labels
    label: {
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--font-medium)',
        color: '#374151'
    },

    labelLarge: {
        fontSize: 'var(--text-base)',
        fontWeight: 'var(--font-medium)',
        color: '#374151'
    },

    // Body text
    body: {
        fontSize: 'var(--text-base)',
        lineHeight: 'var(--leading-normal)',
        color: '#374151'
    },

    bodySmall: {
        fontSize: 'var(--text-sm)',
        lineHeight: 'var(--leading-normal)',
        color: '#374151'
    },

    // Helper/caption text
    helper: {
        fontSize: 'var(--text-xs)',
        color: '#6b7280',
        lineHeight: 'var(--leading-normal)'
    },

    caption: {
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-medium)',
        color: '#6b7280',
        textTransform: 'uppercase' as const,
        letterSpacing: 'var(--tracking-wider)'
    },

    // Interactive elements
    button: {
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--font-semibold)',
        letterSpacing: 'var(--tracking-wide)'
    },

    buttonLarge: {
        fontSize: 'var(--text-base)',
        fontWeight: 'var(--font-semibold)',
        letterSpacing: 'var(--tracking-wide)'
    },

    // Input text
    input: {
        fontSize: 'var(--text-base)',
        lineHeight: 'var(--leading-normal)'
    },

    // Price/emphasis
    priceSmall: {
        fontSize: 'var(--text-lg)',
        fontWeight: 'var(--font-bold)',
        color: '#2563eb'
    },

    priceLarge: {
        fontSize: 'var(--text-2xl)',
        fontWeight: 'var(--font-bold)',
        color: '#2563eb'
    }
};
