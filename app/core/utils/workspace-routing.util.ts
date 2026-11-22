import type { AdminUser, UserRole } from '../services/auth/admin-auth.service';

export type UnifiedWorkspaceId = 'admin' | 'dispatch' | 'driver' | 'corporate' | 'passenger';

export interface UnifiedWorkspaceMeta {
  id: UnifiedWorkspaceId;
  label: string;
  shortLabel: string;
  description: string;
  path: string;
  badge: string;
  requiredRole: UserRole;
}

export const UNIFIED_WORKSPACES: UnifiedWorkspaceMeta[] = [
  {
    id: 'admin',
    label: 'Admin',
    shortLabel: 'Admin',
    description: 'Fleet, rates, invoicing, drivers & staff, and site settings.',
    path: '/app/admin',
    badge: 'Admin',
    requiredRole: 'admin',
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    shortLabel: 'Dispatch',
    description: 'Live trip queue, driver map, auto-dispatch, and phone desk.',
    path: '/app/dispatch',
    badge: 'Dispatcher',
    requiredRole: 'dispatcher',
  },
  {
    id: 'driver',
    label: 'Driver App',
    shortLabel: 'Driver',
    description: 'Shift controls, active trips, live GPS, and taximeter.',
    path: '/app/driver',
    badge: 'Driver',
    requiredRole: 'driver',
  },
  {
    id: 'corporate',
    label: 'Corporate Portal',
    shortLabel: 'Corporate',
    description: 'Company rides, employee travel booking, PO security, and statements.',
    path: '/app/corporate',
    badge: 'Corporate',
    requiredRole: 'corporate_manager',
  },
  {
    id: 'passenger',
    label: 'Client Portal',
    shortLabel: 'Client',
    description: 'Book rides, track your driver, view receipts, and save favorite places.',
    path: '/app/passenger',
    badge: 'Client',
    requiredRole: 'customer',
  },
];

const DEFAULT_WORKSPACE_STORAGE_PREFIX = 'ct_default_workspace_';

export function getEffectiveRoles(user?: Pick<AdminUser, 'role' | 'roles'> | null): UserRole[] {
  if (!user) return [];
  const raw: UserRole[] =
    Array.isArray(user.roles) && user.roles.length > 0
      ? (user.roles as UserRole[])
      : user.role
      ? [user.role]
      : ['customer'];
  return Array.from(new Set(raw));
}

/**
 * Strictly maps an account's assigned roles to its available workspaces.
 * - 'admin' grants superuser access across all platform workspaces.
 * - 'dispatcher', 'driver', and 'customer' each unlock ONLY their corresponding workspace.
 * - A passenger-only account (['customer']) receives ONLY ['passenger'] and never sees workspace switching UI.
 */
export function getAccessibleWorkspaces(
  user?: Pick<AdminUser, 'role' | 'roles'> | null
): UnifiedWorkspaceMeta[] {
  if (!user) return [];
  const roles = getEffectiveRoles(user);
  const isAdmin = roles.includes('admin');

  return UNIFIED_WORKSPACES.filter((ws) => {
    if (isAdmin) return true;
    return roles.includes(ws.requiredRole);
  });
}

export function shouldPromptWorkspacePicker(
  user?: Pick<AdminUser, 'role' | 'roles'> | null
): boolean {
  return getAccessibleWorkspaces(user).length > 1;
}

export function getSavedDefaultWorkspace(uid?: string): UnifiedWorkspaceId | null {
  if (!uid || typeof window === 'undefined') return null;
  try {
    const val = window.localStorage.getItem(`${DEFAULT_WORKSPACE_STORAGE_PREFIX}${uid}`);
    if (
      val === 'admin' ||
      val === 'dispatch' ||
      val === 'driver' ||
      val === 'corporate' ||
      val === 'passenger'
    ) {
      return val;
    }
  } catch {}
  return null;
}

export function setSavedDefaultWorkspace(uid: string | undefined, workspaceId: UnifiedWorkspaceId | null): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    const key = `${DEFAULT_WORKSPACE_STORAGE_PREFIX}${uid}`;
    if (workspaceId) {
      window.localStorage.setItem(key, workspaceId);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {}
}

export function normalizeAppRedirect(rawRedirect?: string | null): string | null {
  if (!rawRedirect || !rawRedirect.startsWith('/') || rawRedirect.startsWith('//')) {
    return null;
  }
  const [pathname, search = ''] = rawRedirect.split('?');
  const suffix = search ? `?${search}` : '';

  if (pathname === '/admin') return `/app/admin${suffix}`;
  if (pathname === '/admin/settings') return `/app/admin/settings${suffix}`;
  if (pathname === '/dispatch') return `/app/dispatch${suffix}`;
  if (pathname === '/dispatch/popout') return `/app/dispatch/popout${suffix}`;
  if (pathname === '/driver') return `/app/driver${suffix}`;
  if (pathname === '/corporate') return `/app/corporate${suffix}`;
  return `${pathname}${suffix}`;
}

export function canAccessWorkspacePath(
  targetPath: string,
  user?: Pick<AdminUser, 'role' | 'roles'> | null
): boolean {
  if (!user) return false;
  const accessible = getAccessibleWorkspaces(user);
  if (targetPath.startsWith('/app/admin')) {
    return accessible.some((w) => w.id === 'admin');
  }
  if (targetPath.startsWith('/app/dispatch')) {
    return accessible.some((w) => w.id === 'dispatch');
  }
  if (targetPath.startsWith('/app/driver')) {
    return accessible.some((w) => w.id === 'driver');
  }
  if (targetPath.startsWith('/app/corporate')) {
    return accessible.some((w) => w.id === 'corporate');
  }
  if (targetPath.startsWith('/app/passenger')) {
    return accessible.some((w) => w.id === 'passenger');
  }
  return true;
}

/**
 * Resolves the destination path inside `/app` right after login or when hitting `/app`.
 * Single-workspace accounts bypass `/app` picker completely.
 */
export function resolvePostAuthDestination(
  user: Pick<AdminUser, 'uid' | 'role' | 'roles'>,
  options?: { rawRedirect?: string | null; forceChoose?: boolean }
): string {
  const accessible = getAccessibleWorkspaces(user);

  const normalizedRedirect = normalizeAppRedirect(options?.rawRedirect);
  if (
    normalizedRedirect &&
    normalizedRedirect !== '/app' &&
    normalizedRedirect !== '/app/login' &&
    normalizedRedirect !== '/app/register' &&
    canAccessWorkspacePath(normalizedRedirect, user)
  ) {
    return normalizedRedirect;
  }

  // If the account only has access to 1 workspace, NEVER show the workspace chooser
  if (accessible.length <= 1) {
    return accessible[0]?.path || '/app/passenger';
  }

  if (options?.forceChoose) {
    return '/app?choose=1';
  }

  const savedId = getSavedDefaultWorkspace(user.uid);
  if (savedId) {
    const savedWs = accessible.find((w) => w.id === savedId);
    if (savedWs) return savedWs.path;
  }

  return '/app?choose=1';
}
