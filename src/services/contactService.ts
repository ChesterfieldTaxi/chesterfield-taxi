import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface ContactSubmission {
    name: string;
    email: string;
    phone: string;
    subject: string;
    message: string;
}

/**
 * Generates a unique inquiry ID
 * Format: INQ-YYYYMMDD-XXXX
 */
const generateInquiryId = (): string => {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `INQ-${yyyy}${mm}${dd}-${random}`;
};

/**
 * Submit a contact inquiry to Firestore
 * @param data Contact form data
 * @returns The generated inquiry ID
 */
export async function submitContactInquiry(data: ContactSubmission): Promise<string> {
    try {
        const inquiryId = generateInquiryId();

        const inquiryRecord = {
            inquiryId,
            ...data,
            status: 'new',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        await addDoc(collection(db, 'contact_inquiries'), inquiryRecord);

        return inquiryId;
    } catch (error) {
        console.error('Error submitting contact inquiry:', error);
        throw new Error('Failed to submit inquiry. Please try again.');
    }
}
