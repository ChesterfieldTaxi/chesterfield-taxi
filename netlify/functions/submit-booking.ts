import { Handler } from '@netlify/functions';

export const handler: Handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: 'Method Not Allowed',
        };
    }

    try {
        const data = JSON.parse(event.body || '{}');

        // Here you would typically:
        // 1. Validate the data
        // 2. Save to a database (e.g., Firebase, Supabase)
        // 3. Send emails (e.g., SendGrid, Postmark)

        console.log('Received booking request:', data);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Booking submitted successfully', reference: Math.random().toString(36).substring(7) }),
        };
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid request body' }),
        };
    }
};
