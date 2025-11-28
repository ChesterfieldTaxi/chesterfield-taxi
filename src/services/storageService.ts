import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
    RESUME: 5 * 1024 * 1024,      // 5MB
    LICENSE: 5 * 1024 * 1024,     // 5MB
    GENERAL: 10 * 1024 * 1024     // 10MB
};

// Allowed file types
export const ALLOWED_FILE_TYPES = {
    DOCUMENTS: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
    IMAGES: ['image/jpeg', 'image/jpg', 'image/png']
};

export interface UploadedFile {
    name: string;
    size: number;
    type: string;
    url: string;
    uploadedAt: Date;
}

/**
 * Validates file size against limit
 */
export function validateFileSize(file: File, limit: number): { valid: boolean; error?: string } {
    if (file.size > limit) {
        const limitMB = (limit / (1024 * 1024)).toFixed(1);
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
        return {
            valid: false,
            error: `File size (${fileSizeMB}MB) exceeds limit of ${limitMB}MB`
        };
    }
    return { valid: true };
}

/**
 * Validates file type against allowed types
 */
export function validateFileType(file: File, allowedTypes: string[]): { valid: boolean; error?: string } {
    if (!allowedTypes.includes(file.type)) {
        return {
            valid: false,
            error: `File type ${file.type} is not allowed. Allowed types: ${allowedTypes.join(', ')}`
        };
    }
    return { valid: true };
}

/**
 * Upload file to Firebase Storage
 * @param file File to upload
 * @param path Storage path (e.g., 'applications/resumes/filename.pdf')
 * @param maxSize Maximum file size in bytes
 * @returns Uploaded file metadata with download URL
 */
export async function uploadFile(
    file: File,
    path: string,
    maxSize: number = FILE_SIZE_LIMITS.GENERAL
): Promise<UploadedFile> {
    // Validate file size
    const sizeValidation = validateFileSize(file, maxSize);
    if (!sizeValidation.valid) {
        throw new Error(sizeValidation.error);
    }

    // Validate file type
    const typeValidation = validateFileType(file, ALLOWED_FILE_TYPES.DOCUMENTS);
    if (!typeValidation.valid) {
        throw new Error(typeValidation.error);
    }

    try {
        // Create storage reference
        const storageRef = ref(storage, path);

        // Upload file
        const snapshot = await uploadBytes(storageRef, file);

        // Get download URL
        const downloadURL = await getDownloadURL(snapshot.ref);

        return {
            name: file.name,
            size: file.size,
            type: file.type,
            url: downloadURL,
            uploadedAt: new Date()
        };
    } catch (error) {
        console.error('File upload error:', error);
        throw new Error('Failed to upload file. Please try again.');
    }
}

/**
 * Generate unique filename with timestamp
 */
export function generateUniqueFileName(originalName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = originalName.split('.').pop();
    const nameWithoutExt = originalName.replace(`.${extension}`, '').replace(/[^a-z0-9]/gi, '_');
    return `${nameWithoutExt}_${timestamp}_${random}.${extension}`;
}
