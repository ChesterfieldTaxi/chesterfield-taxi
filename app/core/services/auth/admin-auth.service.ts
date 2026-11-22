/**
 * Admin Authentication Service
 * 
 * Provides client-side authentication management using Firebase Auth,
 * with Firestore-backed Role-Based Access Control (RBAC).
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, getFirestore } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseApp, isFirebaseConfigured } from '../firebase';

export type UserRole = 'customer' | 'driver' | 'dispatcher' | 'admin' | 'corporate_manager';

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
  corporateAccountId?: string;
  corporateAccountNumber?: string;
  isArchived?: boolean;
  isBlacklisted?: boolean;
  blacklistReason?: string;
}

const DEMO_SESSION_KEY = 'chesterfield_taxi_admin_session';
export const LOCAL_CORPORATE_MANAGERS_KEY = 'ct_provisioned_corporate_managers';

export class AdminAuthService {
  private isConfigured: boolean;
  private cachedUser: AdminUser | null = null;

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
    corporateAccountId?: string;
    corporateAccountNumber?: string;
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
          // Self-heal: migrate single role to roles array (ignore if rules block)
          roles = [singleRole];
          try {
            await setDoc(userRef, { roles }, { merge: true });
          } catch (healErr) {
            console.warn('[AdminAuthService] Skipping role array self-heal write:', healErr);
          }
        }

        if (!roles || roles.length === 0) {
          roles = ['customer'];
        }

        return {
          roles,
          status: data?.status,
          isArchived: data?.isArchived,
          isBlacklisted: data?.isBlacklisted,
          blacklistReason: data?.blacklistReason,
          assignedVehicleUnit: data?.assignedVehicleUnit || data?.assignedUnit,
          corporateAccountId:
            typeof data?.corporateAccountId === 'string' && data.corporateAccountId.trim()
              ? data.corporateAccountId.trim()
              : undefined,
          corporateAccountNumber:
            typeof data?.corporateAccountNumber === 'string' && data.corporateAccountNumber.trim()
              ? data.corporateAccountNumber.trim()
              : undefined,
        };
      }

      // Default to customer for any user without an explicit Firestore role document
      return { roles: ['customer'] };
    } catch (err) {
      console.warn('[AdminAuthService] Error fetching user roles from Firestore:', err);
      // Preserve previously hydrated roles on transient network/Firestore errors so active staff sessions never bounce/reload
      if (this.cachedUser && this.cachedUser.uid === user.uid && this.cachedUser.roles?.length) {
        return {
          roles: this.cachedUser.roles,
          status: this.cachedUser.status,
          isArchived: this.cachedUser.isArchived,
          isBlacklisted: this.cachedUser.isBlacklisted,
          blacklistReason: this.cachedUser.blacklistReason,
          assignedVehicleUnit: this.cachedUser.assignedVehicleUnit,
          corporateAccountId: this.cachedUser.corporateAccountId,
          corporateAccountNumber: this.cachedUser.corporateAccountNumber,
        };
      }
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

    if (this.cachedUser) {
      return this.cachedUser;
    }

    if (this.isConfigured) {
      try {
        const auth = getFirebaseAuth();
        if (auth.currentUser) {
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
        const parsed = JSON.parse(demoUserJson) as AdminUser;
        this.cachedUser = parsed;
        return parsed;
      }
    } catch {
      // Ignore storage errors
    }

    return null;
  }

  public clearCurrentUser(): void {
    this.cachedUser = null;
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
              this.cachedUser = null;
              try {
                await firebaseSignOut(auth);
              } catch (_) {}
              callback(null);
              return;
            }
            const hydrated: AdminUser = {
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
              corporateAccountId: profile.corporateAccountId,
              corporateAccountNumber: profile.corporateAccountNumber,
            };
            this.cachedUser = hydrated;
            callback(hydrated);
          } else {
            this.cachedUser = null;
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

        const signedInUser: AdminUser = {
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
          corporateAccountId: profile.corporateAccountId,
          corporateAccountNumber: profile.corporateAccountNumber,
        };
        this.cachedUser = signedInUser;
        return signedInUser;
      } catch (err: unknown) {
        console.warn('[AdminAuthService] Firebase Auth sign-in error:', err);
        throw err;
      }
    }

    // Local / Offline demo mode authentication
    if (trimmedEmail.includes('blacklisted')) {
      throw new Error('Access Denied: Account is blacklisted.');
    }

    // Check locally provisioned corporate managers (offline mode)
    if (typeof window !== 'undefined') {
      try {
        const rawMgrs = window.localStorage.getItem(LOCAL_CORPORATE_MANAGERS_KEY);
        if (rawMgrs) {
          const mgrs = JSON.parse(rawMgrs) as Array<{
            uid: string;
            email: string;
            displayName?: string;
            roles: UserRole[];
            corporateAccountId: string;
            corporateAccountNumber: string;
          }>;
          const matchedMgr = mgrs.find((m) => m.email.toLowerCase() === trimmedEmail);
          if (matchedMgr) {
            const demoMgr: AdminUser = {
              uid: matchedMgr.uid,
              email: matchedMgr.email,
              displayName: matchedMgr.displayName || 'Corporate Manager',
              isDemo: true,
              role: matchedMgr.roles[0] || 'corporate_manager',
              roles: matchedMgr.roles,
              corporateAccountId: matchedMgr.corporateAccountId,
              corporateAccountNumber: matchedMgr.corporateAccountNumber,
            };
            window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoMgr));
            this.cachedUser = demoMgr;
            return demoMgr;
          }
        }
      } catch {}
    }

    if (
      trimmedEmail === 'admin@chesterfieldtaxi.com' ||
      trimmedEmail.includes('admin') ||
      trimmedEmail.includes('dispatch') ||
      trimmedEmail.includes('driver') ||
      trimmedEmail.includes('corporate') ||
      trimmedEmail.includes('customer')
    ) {
      const role: UserRole = trimmedEmail.includes('admin')
        ? 'admin'
        : trimmedEmail.includes('driver')
        ? 'driver'
        : (trimmedEmail.includes('dispatch') || trimmedEmail.includes('dispatcher'))
        ? 'dispatcher'
        : trimmedEmail.includes('corporate')
        ? 'corporate_manager'
        : 'customer';
      const demoUser: AdminUser = {
        uid: 'demo_user_uid_001',
        email: trimmedEmail,
        displayName:
          'Chesterfield ' + role,
        isDemo: true,
        role,
        roles: [role],
        ...(role === 'corporate_manager'
          ? { corporateAccountId: 'corp-001', corporateAccountNumber: 'CORP-BAY-902' }
          : {}),
      };
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoUser));
      }
      this.cachedUser = demoUser;
      return demoUser;
    }

    throw new Error(
      'Authentication failed. In offline development mode, use admin@... or dispatch@... or customer@...'
    );
  }

  public async registerWithEmail(email: string, password: string, _role: UserRole = 'customer', displayName?: string): Promise<AdminUser> {
    const trimmedEmail = email.trim().toLowerCase();
    
    if (this.isConfigured) {
      try {
        const auth = getFirebaseAuth();
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        
        // Self-registration always provisions a 'customer' role (staff accounts are provisioned via Admin Onboarding)
        const db = getFirestore(getFirebaseApp());
        const userRef = doc(db, 'users', cred.user.uid);
        const actualRole: UserRole = 'customer';

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

  public async sendPasswordReset(email: string): Promise<void> {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      throw new Error('Please enter your email address first.');
    }
    if (this.isConfigured) {
      const auth = getFirebaseAuth();
      await sendPasswordResetEmail(auth, trimmedEmail);
      return;
    }
    throw new Error('Password reset requires Firebase Authentication to be configured.');
  }

  private async ensureOAuthCustomerProfile(user: User): Promise<void> {
    if (!this.isConfigured) return;
    try {
      const db = getFirestore(getFirebaseApp());
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(
          userRef,
          {
            role: 'customer',
            roles: ['customer'],
            email: (user.email || '').toLowerCase(),
            displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Passenger'),
            status: 'active',
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    } catch (err) {
      console.warn('[AdminAuthService] Could not provision OAuth user profile:', err);
    }
  }

  public async signInWithGoogle(role: UserRole = 'customer'): Promise<AdminUser> {
    if (this.isConfigured) {
      try {
        const auth = getFirebaseAuth();
        const provider = new GoogleAuthProvider();
        const cred = await signInWithPopup(auth, provider);

        await this.ensureOAuthCustomerProfile(cred.user);
        const profile = await this.fetchUserProfileData(cred.user);
        const roles = profile.roles;
        
        return {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName,
          role: roles[0] || role,
          roles,
          corporateAccountId: profile.corporateAccountId,
          corporateAccountNumber: profile.corporateAccountNumber,
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

        await this.ensureOAuthCustomerProfile(cred.user);
        const profile = await this.fetchUserProfileData(cred.user);
        const roles = profile.roles;
        
        return {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName,
          role: roles[0] || role,
          roles,
          corporateAccountId: profile.corporateAccountId,
          corporateAccountNumber: profile.corporateAccountNumber,
        };
      } catch (err) {
        console.warn('[AdminAuthService] Firebase Auth Facebook sign-in error:', err);
        throw err;
      }
    }
    throw new Error('Facebook Sign-In requires Firebase to be configured.');
  }

  public async signOut(): Promise<void> {
    this.cachedUser = null;
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
