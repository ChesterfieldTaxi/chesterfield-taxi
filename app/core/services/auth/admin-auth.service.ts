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
  role?: UserRole; // Deprecated: Use roles array instead
  roles?: UserRole[];
  phone?: string;
  status?: 'active' | 'inactive' | 'suspended';
  assignedVehicleUnit?: string;
  isArchived?: boolean;
  isBlacklisted?: boolean;
  blacklistReason?: string;
}

const DEMO_SESSION_KEY = 'chesterfield_taxi_admin_session';

export class AdminAuthService {
  private isConfigured: boolean;

  constructor() {
    this.isConfigured = isFirebaseConfigured();
  }

  private async fetchUserProfileData(user: User): Promise<{
    roles: UserRole[];
    status?: 'active' | 'inactive' | 'suspended';
    isArchived?: boolean;
    isBlacklisted?: boolean;
    blacklistReason?: string;
    assignedVehicleUnit?: string;
  }> {
    if (!this.isConfigured) return { roles: ['customer'] };

    try {
      const db = getFirestore(getFirebaseApp());
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        let roles = data?.roles as UserRole[] | undefined;
        let singleRole = data?.role as UserRole | undefined;

        if (singleRole && (!roles || roles.length === 0)) {
          // Self-heal: migrate single role to roles array
          roles = [singleRole];
          await setDoc(userRef, { roles }, { merge: true });
        }

        if (!roles || roles.length === 0) {
          roles = ['customer'];
        }

        // Self-healing: if a test driver account got stuck as 'customer', force upgrade it
        if (roles.includes('customer') && user.email && user.email.toLowerCase().includes('driver')) {
          roles = roles.filter(r => r !== 'customer');
          if (!roles.includes('driver')) roles.push('driver');
          await setDoc(userRef, { roles, role: 'driver' }, { merge: true });
          
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

        return {
          roles,
          status: data?.status,
          isArchived: data?.isArchived,
          isBlacklisted: data?.isBlacklisted,
          blacklistReason: data?.blacklistReason,
          assignedVehicleUnit: data?.assignedVehicleUnit || data?.assignedUnit,
        };
      }

      // Auto-provision primary admin or dispatcher if using operational emails
      if (user.email === 'admin@chesterfieldtaxi.com') {
        const adminRoles: UserRole[] = ['admin'];
        await setDoc(userRef, { roles: adminRoles, role: 'admin', email: user.email }, { merge: true });
        return { roles: adminRoles, status: 'active' };
      }

      if (user.email === 'dispatch@chesterfieldtaxi.com' || (user.email && user.email.toLowerCase().includes('dispatch'))) {
        const dispatchRoles: UserRole[] = ['dispatcher'];
        await setDoc(userRef, { roles: dispatchRoles, role: 'dispatcher', email: user.email }, { merge: true });
        return { roles: dispatchRoles, status: 'active' };
      }

      if (user.email === 'driver1@chesterfieldtaxi.com' || (user.email && user.email.toLowerCase().includes('driver'))) {
        const driverRoles: UserRole[] = ['driver'];
        await setDoc(userRef, { roles: driverRoles, role: 'driver', email: user.email }, { merge: true });
        
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
        
        return { roles: driverRoles, status: 'active' };
      }

      // Default to customer
      return { roles: ['customer'] };
    } catch (err) {
      console.warn('[AdminAuthService] Error fetching user roles from Firestore:', err);
      return { roles: ['customer'] };
    }
  }

  private async fetchUserRoles(user: User): Promise<UserRole[]> {
    const profile = await this.fetchUserProfileData(user);
    return profile.roles;
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
            roles: ['customer'],
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

  public clearCurrentUser(): void {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(DEMO_SESSION_KEY);
      } catch {}
    }
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
            const profile = await this.fetchUserProfileData(user);
            if (profile.isBlacklisted || profile.status === 'suspended') {
              console.warn(`[AdminAuthService] Access revoked: user ${user.uid} is blacklisted or suspended.`);
              try {
                await firebaseSignOut(auth);
              } catch (_) {}
              callback(null);
              return;
            }
            callback({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              role: profile.roles[0] || 'customer',
              roles: profile.roles,
              status: profile.status,
              isArchived: profile.isArchived,
              isBlacklisted: profile.isBlacklisted,
              blacklistReason: profile.blacklistReason,
              assignedVehicleUnit: profile.assignedVehicleUnit,
            });
          } else {
            // Check if demo user is in storage
            const demoUser = this.getCurrentUser();
            if (demoUser?.isBlacklisted || demoUser?.status === 'suspended') {
              this.clearCurrentUser();
              callback(null);
              return;
            }
            callback(demoUser);
          }
        });
      } catch (err) {
        console.warn('[AdminAuthService] Fallback to local session check:', err);
      }
    }

    // Fallback: check session storage immediately
    const user = this.getCurrentUser();
    if (user?.isBlacklisted || user?.status === 'suspended') {
      this.clearCurrentUser();
      callback(null);
      return () => {};
    }
    callback(user);
    return () => {};
  }

  public async signIn(email: string, password: string): Promise<AdminUser> {
    const trimmedEmail = email.trim().toLowerCase();

    if (this.isConfigured) {
      try {
        const auth = getFirebaseAuth();
        const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
        const profile = await this.fetchUserProfileData(cred.user);

        if (profile.isBlacklisted || profile.status === 'suspended') {
          await firebaseSignOut(auth);
          throw new Error(
            `Access Denied: Account is ${profile.status === 'suspended' ? 'suspended' : 'blacklisted'}${
              profile.blacklistReason ? ' (' + profile.blacklistReason + ')' : ''
            }`
          );
        }

        return {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName,
          role: profile.roles[0] || 'customer',
          roles: profile.roles,
          status: profile.status,
          isArchived: profile.isArchived,
          isBlacklisted: profile.isBlacklisted,
          blacklistReason: profile.blacklistReason,
          assignedVehicleUnit: profile.assignedVehicleUnit,
        };
      } catch (err: unknown) {
        console.warn('[AdminAuthService] Firebase Auth sign-in error:', err);
        throw err;
      }
    }

    // Local / Offline demo mode authentication
    if (trimmedEmail.includes('blacklisted')) {
      throw new Error('Access Denied: Account is blacklisted.');
    }

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
        roles: [role],
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

        await setDoc(userRef, { 
          role: actualRole,
          roles: [actualRole],
          email: trimmedEmail,
          displayName: displayName || trimmedEmail.split('@')[0],
          createdAt: new Date().toISOString()
        }, { merge: true });
        
        return {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: displayName || cred.user.displayName,
          role: actualRole,
          roles: [actualRole],
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
        const roles = await this.fetchUserRoles(cred.user);
        
        return {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName,
          role: roles[0] || role,
          roles,
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
        const roles = await this.fetchUserRoles(cred.user);
        
        return {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName,
          role: roles[0] || role,
          roles,
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
