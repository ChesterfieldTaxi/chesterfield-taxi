/**
 * Admin Authentication Service
 * 
 * Provides client-side authentication management using Firebase Auth,
 * with Firestore-backed Role-Based Access Control (RBAC).
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, getFirestore } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseApp, isFirebaseConfigured } from '../firebase';

export type UserRole = 'customer' | 'driver' | 'dispatcher' | 'admin';

export interface AdminUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
  isDemo?: boolean;
  role?: UserRole;
  phone?: string;
  status?: 'active' | 'inactive' | 'suspended';
  assignedVehicleUnit?: string;
}

const DEMO_SESSION_KEY = 'chesterfield_taxi_admin_session';

export class AdminAuthService {
  private isConfigured: boolean;

  constructor() {
    this.isConfigured = isFirebaseConfigured();
  }

  private async fetchUserRole(user: User): Promise<UserRole> {
    if (!this.isConfigured) return 'customer';

    try {
      const db = getFirestore(getFirebaseApp());
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        let role = data?.role as UserRole | undefined;

        // Self-healing: if a test driver account got stuck as 'customer', force upgrade it
        if (role === 'customer' && user.email && user.email.toLowerCase().includes('driver')) {
          role = 'driver';
          await setDoc(userRef, { role }, { merge: true });
          // Ensure a driver profile exists too
          try {
            const driverRef = doc(db, 'drivers', user.uid);
            await setDoc(driverRef, {
              id: user.uid,
              name: user.displayName || user.email.split('@')[0],
              phone: '(314) 738-0100',
              dutyStatus: 'off_duty',
              vehicleUnit: 'Unassigned',
              vehicleTier: 'standard',
              zone: 'Chesterfield'
            }, { merge: true });
          } catch (e) {}
        }

        if (role) {
          return role;
        }
      }

      // Auto-provision primary admin or dispatcher if using operational emails
      if (user.email === 'admin@chesterfieldtaxi.com') {
        const adminRole: UserRole = 'admin';
        await setDoc(userRef, { role: adminRole, email: user.email }, { merge: true });
        return adminRole;
      }

      if (user.email === 'dispatch@chesterfieldtaxi.com' || (user.email && user.email.toLowerCase().includes('dispatch'))) {
        const dispatchRole: UserRole = 'dispatcher';
        await setDoc(userRef, { role: dispatchRole, email: user.email }, { merge: true });
        return dispatchRole;
      }

      if (user.email === 'driver1@chesterfieldtaxi.com' || (user.email && user.email.toLowerCase().includes('driver'))) {
        const driverRole: UserRole = 'driver';
        await setDoc(userRef, { role: driverRole, email: user.email }, { merge: true });
        
        // Ensure a driver profile exists in the drivers collection
        try {
          const driverRef = doc(db, 'drivers', user.uid);
          await setDoc(driverRef, {
            id: user.uid,
            name: user.displayName || user.email.split('@')[0],
            phone: '(314) 738-0100',
            dutyStatus: 'off_duty',
            vehicleUnit: 'Unassigned',
            vehicleTier: 'standard',
            zone: 'Chesterfield'
          }, { merge: true });
        } catch (e) {
          console.warn('[AdminAuthService] Error provisioning driver profile:', e);
        }
        
        return driverRole;
      }

      // Default to customer
      return 'customer';
    } catch (err) {
      console.warn('[AdminAuthService] Error fetching user role from Firestore:', err);
      return 'customer';
    }
  }


  // Note: getCurrentUser is synchronous. It will return the base user but might not have the fully
  // hydrated role if it hasn't been cached. For accurate roles, prefer onAuthStateChanged or signIn.
  public getCurrentUser(): AdminUser | null {
    if (typeof window === 'undefined') {
      return null;
    }

    if (this.isConfigured) {
      try {
        const auth = getFirebaseAuth();
        if (auth.currentUser) {
          // Sync check won't have Firestore role.
          // Returning null forces consumers to rely on onAuthStateChanged which is async and safe.
          // However, to satisfy the signature and not break existing sync checks, we return customer default.
          return {
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            displayName: auth.currentUser.displayName,
            role: 'customer',
          };
        }
      } catch (err) {
        console.warn('[AdminAuthService] getCurrentUser warning:', err);
      }
    }

    // Check demo session in storage
    try {
      const demoUserJson = window.sessionStorage.getItem(DEMO_SESSION_KEY);
      if (demoUserJson) {
        return JSON.parse(demoUserJson) as AdminUser;
      }
    } catch {
      // Ignore storage errors
    }

    return null;
  }

  public onAuthStateChanged(callback: (user: AdminUser | null) => void): () => void {
    if (typeof window === 'undefined') {
      callback(null);
      return () => {};
    }

    if (this.isConfigured) {
      try {
        const auth = getFirebaseAuth();
        return firebaseOnAuthStateChanged(auth, async (user: User | null) => {
          if (user) {
            const role = await this.fetchUserRole(user);
            callback({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              role,
            });
          } else {
            // Check if demo user is in storage
            const demoUser = this.getCurrentUser();
            callback(demoUser);
          }
        });
      } catch (err) {
        console.warn('[AdminAuthService] Fallback to local session check:', err);
      }
    }

    // Fallback: check session storage immediately
    const user = this.getCurrentUser();
    callback(user);
    return () => {};
  }

  public async signIn(email: string, password: string): Promise<AdminUser> {
    const trimmedEmail = email.trim().toLowerCase();

    if (this.isConfigured) {
      try {
        const auth = getFirebaseAuth();
        const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
        const role = await this.fetchUserRole(cred.user);
        return {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName,
          role,
        };
      } catch (err: unknown) {
        console.warn('[AdminAuthService] Firebase Auth sign-in error:', err);
        throw err;
      }
    }

    // Local / Offline demo mode authentication
    if (
      trimmedEmail === 'admin@chesterfieldtaxi.com' ||
      trimmedEmail.includes('admin') ||
      trimmedEmail.includes('dispatch') ||
      trimmedEmail.includes('driver') ||
      trimmedEmail.includes('customer')
    ) {
      const role: UserRole = trimmedEmail.includes('admin')
        ? 'admin'
        : trimmedEmail.includes('driver')
        ? 'driver'
        : (trimmedEmail.includes('dispatch') || trimmedEmail.includes('dispatcher'))
        ? 'dispatcher'
        : 'customer';
      const demoUser: AdminUser = {
        uid: 'demo_user_uid_001',
        email: trimmedEmail,
        displayName:
          'Chesterfield ' + role,
        isDemo: true,
        role,
      };
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoUser));
      }
      return demoUser;
    }

    throw new Error(
      'Authentication failed. In offline development mode, use admin@... or dispatch@... or customer@...'
    );
  }

  public async registerWithEmail(email: string, password: string, role: UserRole = 'customer', displayName?: string): Promise<AdminUser> {
    const trimmedEmail = email.trim().toLowerCase();
    
    if (this.isConfigured) {
      try {
        const auth = getFirebaseAuth();
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        
        // Write role to Firestore
        const db = getFirestore(getFirebaseApp());
        const userRef = doc(db, 'users', cred.user.uid);
        let actualRole = role;
        
        // Auto-provision driver role based on email on creation as well
        if (trimmedEmail === 'driver1@chesterfieldtaxi.com' || trimmedEmail.includes('driver')) {
          actualRole = 'driver';
          try {
            const driverRef = doc(db, 'drivers', cred.user.uid);
            await setDoc(driverRef, {
              id: cred.user.uid,
              name: displayName || trimmedEmail.split('@')[0],
              phone: '(314) 738-0100',
              dutyStatus: 'off_duty',
              vehicleUnit: 'Unassigned',
              vehicleTier: 'standard',
              zone: 'Chesterfield'
            }, { merge: true });
          } catch (e) {
            console.warn('[AdminAuthService] Error provisioning driver profile:', e);
          }
        } else if (trimmedEmail === 'admin@chesterfieldtaxi.com' || trimmedEmail.includes('admin')) {
          actualRole = 'admin';
        } else if (trimmedEmail === 'dispatch@chesterfieldtaxi.com' || trimmedEmail.includes('dispatch')) {
          actualRole = 'dispatcher';
        }

        await setDoc(userRef, { email: trimmedEmail, role: actualRole, displayName: displayName || null, status: 'active' }, { merge: true });
        
        return {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: displayName || cred.user.displayName,
          role: actualRole,
        };
      } catch (err) {
        console.warn('[AdminAuthService] Firebase Auth registration error:', err);
        throw err;
      }
    }
    
    return this.signIn(email, password);
  }

  public async signInWithGoogle(role: UserRole = 'customer'): Promise<AdminUser> {
    if (this.isConfigured) {
      try {
        const auth = getFirebaseAuth();
        const provider = new GoogleAuthProvider();
        const cred = await signInWithPopup(auth, provider);
        
        // Fetch or create user role
        const db = getFirestore(getFirebaseApp());
        const userRef = doc(db, 'users', cred.user.uid);
        const userSnap = await getDoc(userRef);
        
        let userRole = role;
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data && data.role) {
            userRole = data.role as UserRole;
          }
        } else {
          // First time sign-in via Google, set role
          await setDoc(userRef, { email: cred.user.email, role, displayName: cred.user.displayName, status: 'active' }, { merge: true });
        }
        
        return {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName,
          role: userRole,
        };
      } catch (err) {
        console.warn('[AdminAuthService] Firebase Auth Google sign-in error:', err);
        throw err;
      }
    }
    throw new Error('Google Sign-In requires Firebase to be configured.');
  }

  public async signInWithFacebook(role: UserRole = 'customer'): Promise<AdminUser> {
    if (this.isConfigured) {
      try {
        const auth = getFirebaseAuth();
        const provider = new FacebookAuthProvider();
        const cred = await signInWithPopup(auth, provider);
        
        // Fetch or create user role
        const db = getFirestore(getFirebaseApp());
        const userRef = doc(db, 'users', cred.user.uid);
        const userSnap = await getDoc(userRef);
        
        let userRole = role;
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data && data.role) {
            userRole = data.role as UserRole;
          }
        } else {
          // First time sign-in via Facebook, set role
          await setDoc(userRef, { email: cred.user.email, role, displayName: cred.user.displayName, status: 'active' }, { merge: true });
        }
        
        return {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName,
          role: userRole,
        };
      } catch (err) {
        console.warn('[AdminAuthService] Firebase Auth Facebook sign-in error:', err);
        throw err;
      }
    }
    throw new Error('Facebook Sign-In requires Firebase to be configured.');
  }

  public async signOut(): Promise<void> {
    if (this.isConfigured) {
      try {
        const auth = getFirebaseAuth();
        await firebaseSignOut(auth);
      } catch (err) {
        console.warn('[AdminAuthService] Firebase signOut warning:', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    }
  }
}

let authServiceInstance: AdminAuthService | null = null;

export function getAdminAuthService(): AdminAuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AdminAuthService();
  }
  return authServiceInstance;
}
