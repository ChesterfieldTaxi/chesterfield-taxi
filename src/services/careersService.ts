import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { uploadFile, generateUniqueFileName, FILE_SIZE_LIMITS, UploadedFile } from './storageService';

export interface CareerApplicationData {
    roleType: 'driver' | 'dispatcher';
    name: string;
    email: string;
    phone: string;
    address: string;
    // Driver specific
    licenseNumber?: string;
    experience?: string;  // Changed from number to string (form uses string)
    hasClassE?: string;
    // Dispatcher specific
    customerServiceExperience?: string;  // Changed from number to string (form uses string)
    dispatchExperience?: string;
    computerSkills?: string;
    availability?: string;
    // Files
    resume?: File | null;
    licenseCopy?: File | null;
}

export interface CareerApplication {
    applicationId: string;
    roleType: 'driver' | 'dispatcher';
    personalDetails: {
        name: string;
        email: string;
        phone: string;
        address: string;
    };
    qualifications: {
        // Driver-specific
        licenseNumber?: string;
        experience?: string;
        hasClassE?: string;
        // Dispatcher-specific
        customerServiceExperience?: string;
        dispatchExperience?: string;
        computerSkills?: string;
        availability?: string;
    };
    documents?: {
        resume?: UploadedFile;
        licenseCopy?: UploadedFile;
    };
    status: string;
    createdAt: any;
    updatedAt: any;
    searchKeywords: string[];
}

/**
 * Generates a unique application ID
 * Format: APP-YYYYMMDD-XXXX
 */
const generateApplicationId = (): string => {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `APP-${yyyy}${mm}${dd}-${random}`;
};

/**
 * Submit a career application to Firestore with file uploads
 * @param data Application form data including files
 * @returns The generated application ID
 */
export async function submitCareerApplication(data: CareerApplicationData): Promise<string> {
    try {
        const applicationId = generateApplicationId();

        // Upload files if provided
        const documents: { resume?: UploadedFile; licenseCopy?: UploadedFile } = {};

        if (data.resume) {
            const resumeFileName = generateUniqueFileName(data.resume.name);
            const resumePath = `applications/${applicationId}/resume/${resumeFileName}`;
            documents.resume = await uploadFile(data.resume, resumePath, FILE_SIZE_LIMITS.RESUME);
        }

        if (data.licenseCopy) {
            const licenseFileName = generateUniqueFileName(data.licenseCopy.name);
            const licensePath = `applications/${applicationId}/license/${licenseFileName}`;
            documents.licenseCopy = await uploadFile(data.licenseCopy, licensePath, FILE_SIZE_LIMITS.LICENSE);
        }

        // Prepare application record
        const applicationRecord: CareerApplication = {
            applicationId,
            roleType: data.roleType,
            personalDetails: {
                name: data.name,
                email: data.email,
                phone: data.phone,
                address: data.address
            },
            qualifications: {
                // Driver fields
                ...(data.roleType === 'driver' && {
                    licenseNumber: data.licenseNumber,
                    experience: data.experience,
                    hasClassE: data.hasClassE
                }),
                // Dispatcher fields
                ...(data.roleType === 'dispatcher' && {
                    customerServiceExperience: data.customerServiceExperience,
                    dispatchExperience: data.dispatchExperience,
                    computerSkills: data.computerSkills,
                    availability: data.availability
                })
            },
            ...(Object.keys(documents).length > 0 && { documents }),
            status: 'pending_review', // pending_review, under_review, approved, rejected
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            searchKeywords: [
                applicationId,
                data.name.toLowerCase(),
                data.email.toLowerCase(),
                data.phone,
                data.roleType
            ]
        };

        const docRef = await addDoc(collection(db, 'career_applications'), applicationRecord);
        console.log('Career application submitted with ID:', docRef.id);

        return applicationId;
    } catch (error) {
        console.error('Error submitting career application:', error);

        // Provide more helpful error messages
        if (error instanceof Error) {
            if (error.message.includes('File size')) {
                throw error; // Re-throw validation errors as-is
            }
            if (error.message.includes('File type')) {
                throw error;
            }
        }

        throw new Error('Failed to submit application. Please try again.');
    }
}
