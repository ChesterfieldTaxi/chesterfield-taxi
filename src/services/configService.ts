import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { CompanyConfig } from '../types/companyConfig';
import { mockCompanyConfig } from '../mocks/companyConfigMock';

const CONFIG_COLLECTION = 'company_config';
const CONFIG_DOC_ID = 'main';

/**
 * Fetches the company configuration from Firestore.
 * Falls back to mock data if Firestore fetch fails or document doesn't exist.
 */
export const getCompanyConfig = async (): Promise<CompanyConfig> => {
    try {
        const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data() as CompanyConfig;
        } else {
            console.warn('Config document not found in Firestore, falling back to mock data.');
            return mockCompanyConfig;
        }
    } catch (error) {
        console.error('Error fetching company config:', error);
        return mockCompanyConfig;
    }
};

/**
 * Seeds the Firestore database with the current mock configuration.
 * Use this to initialize or reset the configuration.
 */
export const seedCompanyConfig = async (): Promise<void> => {
    try {
        const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
        await setDoc(docRef, mockCompanyConfig);
        console.log('Company config successfully seeded to Firestore!');
    } catch (error) {
        console.error('Error seeding company config:', error);
        throw error;
    }
};

/**
 * Subscribes to real-time updates of the company configuration.
 */
export const subscribeToCompanyConfig = (
    callback: (config: CompanyConfig) => void,
    onError?: (error: Error) => void
) => {
    const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
    return onSnapshot(docRef, (doc) => {
        if (doc.exists()) {
            callback(doc.data() as CompanyConfig);
        } else {
            // If doc gets deleted, maybe fall back to mock or handle gracefully
            callback(mockCompanyConfig);
        }
    }, (error) => {
        console.error("Error listening to config updates:", error);
        if (onError) onError(error);
    });
};
