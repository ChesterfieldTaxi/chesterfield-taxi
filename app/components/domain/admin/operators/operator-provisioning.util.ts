import { doc, setDoc, deleteDoc, getFirestore } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import {
  getFirebaseApp,
  getFirebaseAuth,
  getResolvedFirebaseConfig,
  isFirebaseConfigured,
} from '../../../../core/services/firebase';
import type { UserRole } from '../../../../core/services/auth/admin-auth.service';
import type { GeoPoint } from '../../../../core/types/trip';
import { getUniversalGovernanceService } from '../../../../core/services/governance/universal-governance.service';
import {
  generateDriverUsername,
  getOperatorService,
  type OperatorUser,
} from '../../../../core/services/operator.service';

export interface RoleMetaItem {
  label: string;
  description: string;
  pillClass: string;
  cardActiveClass: string;
  iconClass: string;
}

export const ROLE_META: Record<UserRole, RoleMetaItem> = {
  driver: {
    label: 'Driver',
    description: 'Driver HUD, trip offers & shifts',
    pillClass: 'bg-status-success-bg text-status-success-fg border-status-success-border',
    cardActiveClass: 'border-emerald-500 bg-status-success-bg/70 ring-1 ring-emerald-500/30',
    iconClass: 'text-emerald-600',
  },
  dispatcher: {
    label: 'Dispatcher',
    description: 'Live dispatch board & call desk',
    pillClass: 'bg-status-info-bg text-status-info-fg border-status-info-border',
    cardActiveClass: 'border-blue-500 bg-status-info-bg/70 ring-1 ring-blue-500/30',
    iconClass: 'text-blue-600',
  },
  admin: {
    label: 'Admin',
    description: 'Full console, pricing & settings',
    pillClass: 'bg-status-staged-bg text-purple-700 border-status-staged-border',
    cardActiveClass: 'border-purple-500 bg-status-staged-bg/70 ring-1 ring-purple-500/30',
    iconClass: 'text-purple-600',
  },
  corporate_manager: {
    label: 'Corporate Manager',
    description: 'B2B travel desk, PO security & statements',
    pillClass: 'bg-status-staged-bg text-status-staged-fg border-status-staged-border',
    cardActiveClass: 'border-indigo-500 bg-status-staged-bg/70 ring-1 ring-indigo-500/30',
    iconClass: 'text-indigo-600',
  },
  customer: {
    label: 'Client',
    description: 'Client booking portal',
    pillClass: 'bg-surface-muted text-fg-secondary border-border-subtle',
    cardActiveClass: 'border-slate-500 bg-surface-muted/80 ring-1 ring-border-emphasis/30',
    iconClass: 'text-fg-secondary',
  },
};

export interface EditFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  username: string;
  roles: UserRole[];
  cabNumber: string;
  assignedUnit: string;
  driverLicense: string;
  driverScore: number;
  homeAddress: string;
  homeCoordinates?: GeoPoint;
  deskExtension: string;
  hireDate: string;
  emergencyContact: string;
  status: 'active' | 'suspended';
  isBlacklisted: boolean;
  blacklistReason: string;
  isArchived: boolean;
  adminNotes: string;
}

export interface CreateOperatorFormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  username: string;
  roles: UserRole[];
  cabNumber: string;
  assignedUnit: string;
  driverLicense: string;
  deskExtension: string;
  emergencyContact: string;
  adminNotes: string;
}

export const EMPTY_CREATE_STATE: CreateOperatorFormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  username: '',
  roles: ['driver'],
  cabNumber: '',
  assignedUnit: '',
  driverLicense: '',
  deskExtension: '',
  emergencyContact: '',
  adminNotes: '',
};

export function buildInitialEditFormState(op: OperatorUser): EditFormState {
  const first = op.firstName || (op.displayName ? op.displayName.split(' ')[0] : '');
  const last = op.lastName || (op.displayName ? op.displayName.split(' ').slice(1).join(' ') : '');
  const cab = op.cabNumber || (op.assignedUnit ? op.assignedUnit.match(/#?(\d+)/)?.[1] || op.assignedUnit : '');
  const uname = op.username || generateDriverUsername(first, last, cab);
  const activeRoles: UserRole[] = op.roles && op.roles.length > 0 ? [...op.roles] : [op.role || 'driver'];

  return {
    firstName: first,
    lastName: last,
    email: op.email || '',
    phone: op.phone || '',
    username: uname,
    roles: activeRoles,
    cabNumber: cab,
    assignedUnit: op.assignedUnit ? op.assignedUnit.replace(/^Cab\s*#?/i, 'Car #') : cab ? `Car #${cab}` : '',
    driverLicense: op.driverLicense || '',
    driverScore: typeof op.driverScore === 'number' ? op.driverScore : 98,
    homeAddress: op.homeAddress || '',
    homeCoordinates: op.homeCoordinates,
    deskExtension: op.deskExtension || '',
    hireDate: op.hireDate || '',
    emergencyContact: op.emergencyContact || '',
    status: op.status === 'suspended' ? 'suspended' : 'active',
    isBlacklisted: Boolean(op.isBlacklisted),
    blacklistReason: op.blacklistReason || '',
    isArchived: Boolean(op.isArchived),
    adminNotes: op.adminNotes || '',
  };
}

export async function provisionNewOperatorAccount(createForm: CreateOperatorFormState): Promise<OperatorUser> {
  const cleanEmail = createForm.email.trim().toLowerCase();
  if (!cleanEmail || !createForm.password.trim()) throw new Error('Email and temporary password are required.');
  if (createForm.password.length < 6) throw new Error('Password must be at least 6 characters.');

  const selectedRoles: UserRole[] = createForm.roles.length > 0 ? createForm.roles : ['driver'];
  const fullName = `${createForm.firstName.trim()} ${createForm.lastName.trim()}`.trim();
  const cleanCab = createForm.cabNumber.trim().replace(/^#/, '');
  const cleanUsername = createForm.username.trim().toLowerCase() || generateDriverUsername(createForm.firstName, createForm.lastName, cleanCab);
  const assignedUnit = createForm.assignedUnit.trim() || (cleanCab ? `Car #${cleanCab}` : '');

  let createdUid = `user-${Date.now().toString(36)}`;
  if (isFirebaseConfigured()) {
    const secondaryApp = initializeApp(getResolvedFirebaseConfig(), `temp-provision-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, createForm.password);
      createdUid = cred.user.uid;
    } finally {
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);
    }
  }

  const newOp: OperatorUser = {
    uid: createdUid,
    email: cleanEmail,
    displayName: fullName || cleanEmail.split('@')[0],
    firstName: createForm.firstName.trim(),
    lastName: createForm.lastName.trim(),
    cabNumber: cleanCab,
    username: cleanUsername,
    role: selectedRoles[0],
    roles: selectedRoles,
    phone: createForm.phone.trim(),
    driverLicense: createForm.driverLicense.trim(),
    assignedUnit,
    deskExtension: createForm.deskExtension.trim(),
    emergencyContact: createForm.emergencyContact.trim(),
    adminNotes: createForm.adminNotes.trim(),
    driverScore: selectedRoles.includes('driver') ? 100 : undefined,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  await getOperatorService().saveOperator(newOp);
  return newOp;
}

export async function saveEditedOperatorProfile(
  editingOperator: OperatorUser,
  editForm: EditFormState
): Promise<OperatorUser> {
  const isRootAdmin = editingOperator.email === 'admin@chesterfieldtaxi.com';
  const nextRoles: UserRole[] = editForm.roles.length > 0 ? [...editForm.roles] : ['customer'];
  if (isRootAdmin && !nextRoles.includes('admin')) nextRoles.unshift('admin');

  const fullName =
    `${editForm.firstName.trim()} ${editForm.lastName.trim()}`.trim() ||
    editingOperator.displayName ||
    editForm.email.split('@')[0];
  const cleanCab = editForm.cabNumber.trim().replace(/^#/, '');
  const cleanUsername =
    editForm.username.trim().toLowerCase() ||
    generateDriverUsername(editForm.firstName, editForm.lastName, cleanCab);
  const assignedUnit = editForm.assignedUnit.trim() || (cleanCab ? `Car #${cleanCab}` : '');
  const clampedScore = Math.max(0, Math.min(100, Number(editForm.driverScore) || 0));
  const effectiveStatus: 'active' | 'suspended' = editForm.isBlacklisted
    ? 'suspended'
    : isRootAdmin
    ? 'active'
    : editForm.status;

  const cleanHomeAddr = editForm.homeAddress?.trim() || undefined;
  const cleanHomeCoords = cleanHomeAddr ? editForm.homeCoordinates : undefined;

  const updatedOp: OperatorUser = {
    ...editingOperator,
    email: isRootAdmin ? editingOperator.email : editForm.email.trim().toLowerCase() || editingOperator.email,
    displayName: fullName,
    firstName: editForm.firstName.trim(),
    lastName: editForm.lastName.trim(),
    username: cleanUsername,
    phone: editForm.phone.trim(),
    roles: nextRoles,
    role: nextRoles[0] || 'customer',
    cabNumber: cleanCab,
    assignedUnit,
    driverLicense: editForm.driverLicense.trim(),
    driverScore: clampedScore,
    homeAddress: cleanHomeAddr,
    homeCoordinates: cleanHomeCoords,
    deskExtension: editForm.deskExtension.trim(),
    hireDate: editForm.hireDate.trim(),
    emergencyContact: editForm.emergencyContact.trim(),
    status: effectiveStatus,
    isBlacklisted: isRootAdmin ? false : editForm.isBlacklisted,
    blacklistReason: !isRootAdmin && editForm.isBlacklisted ? editForm.blacklistReason.trim() || 'Administrative sanction' : '',
    isArchived: isRootAdmin ? false : editForm.isArchived,
    adminNotes: editForm.adminNotes.trim(),
  };

  await getOperatorService().saveOperator(updatedOp);

  if (isFirebaseConfigured() && nextRoles.includes('driver')) {
    const db = getFirestore(getFirebaseApp());
    await setDoc(
      doc(db, 'fleet', `driver-${editingOperator.uid}`),
      {
        name: updatedOp.displayName,
        license: updatedOp.driverLicense || '',
        cabNumber: cleanCab,
        username: cleanUsername,
        phone: updatedOp.phone || '',
        homeAddress: cleanHomeAddr || null,
        homeCoordinates: cleanHomeCoords || null,
      },
      { merge: true }
    );
    await setDoc(
      doc(db, 'drivers', editingOperator.uid),
      {
        homeAddress: cleanHomeAddr || null,
        homeCoordinates: cleanHomeCoords || null,
      },
      { merge: true }
    ).catch(() => {});
  }

  if (!isRootAdmin) {
    const gov = getUniversalGovernanceService();
    const entityType = nextRoles.includes('driver') ? 'driver' : 'staff';
    if (Boolean(editingOperator.isArchived) !== Boolean(updatedOp.isArchived)) {
      await gov.setArchiveStatus(entityType, editingOperator.uid, Boolean(updatedOp.isArchived));
    }
    if (Boolean(editingOperator.isBlacklisted) !== Boolean(updatedOp.isBlacklisted)) {
      await gov.setBlacklistStatus(entityType, editingOperator.uid, Boolean(updatedOp.isBlacklisted), updatedOp.blacklistReason || undefined);
    }
  }

  return updatedOp;
}

export async function sendOperatorPasswordReset(email: string): Promise<void> {
  if (isFirebaseConfigured()) await sendPasswordResetEmail(getFirebaseAuth(), email);
}

export async function deleteOperatorAccount(uid: string, email: string): Promise<void> {
  if (email === 'admin@chesterfieldtaxi.com') throw new Error('The root administrator account cannot be deleted.');
  if (isFirebaseConfigured()) await deleteDoc(doc(getFirestore(getFirebaseApp()), 'users', uid));
  await getOperatorService().deleteOperator(uid);
}
