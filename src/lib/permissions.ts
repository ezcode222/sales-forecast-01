import type { AuthUser, SessionPermissions } from './api';

const DEFAULT_USER_PERMISSIONS: SessionPermissions = {
  role: 'user',
  canManageAdmin: false,
  canManageEmail: false,
  empCode: null,
};

const ADMIN_PERMISSIONS: SessionPermissions = {
  role: 'admin',
  canManageAdmin: true,
  canManageEmail: true,
  empCode: null,
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function isDevSessionUser(user: AuthUser | null | undefined) {
  if (!user) return false;
  const email = normalize(user.email);
  const name = normalize(user.name);
  return email === 'dev.local' || name === 'user (dev)';
}

/** Merge API permissions with client-side dev fallback (UI only; API still enforces access). */
export function effectivePermissions(
  user: AuthUser | null | undefined,
  permissions: SessionPermissions | null | undefined
): SessionPermissions {
  if (isDevSessionUser(user)) return ADMIN_PERMISSIONS;
  return permissions ?? DEFAULT_USER_PERMISSIONS;
}
