/**
 * Per-user permission overrides.
 *
 * Effective permissions = (role permissions ∪ grants) − denies.
 *
 * The backend currently exposes no per-user permission endpoint (roles only),
 * so overrides are persisted per user id in localStorage. The API below is
 * intentionally async and shaped like a future `PUT /api/users/:id/permissions`
 * endpoint, so a backend implementation can replace this module without
 * touching any UI.
 *
 * NOTE: any well-formed `resource.action` name is accepted here — including
 * action-level names such as `user.update` that the page-permission catalog
 * (`config/permissions.ts`) deliberately does not offer in assignment UI.
 * The catalog restricts what is *offered*; the store must also honor
 * role-derived and explicitly assigned action-level names, otherwise denies
 * on them would be silently dropped.
 */

export interface UserPermissionOverride {
  grants: string[];
  denies: string[];
  updatedAt: string;
}

const STORAGE_KEY = 'pms_user_permission_overrides_v1';

function readAll(): Record<string, UserPermissionOverride> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, UserPermissionOverride>;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, UserPermissionOverride>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage full/blocked: overrides stay in memory for this session only.
  }
}

const PERMISSION_NAME_RE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i;

function sanitize(names: unknown): string[] {
  if (!Array.isArray(names)) return [];
  const set = new Set<string>();
  for (const n of names) {
    if (typeof n === 'string' && PERMISSION_NAME_RE.test(n)) set.add(n);
  }
  return [...set];
}

export function emptyOverride(): UserPermissionOverride {
  return { grants: [], denies: [], updatedAt: new Date().toISOString() };
}

/** Stored override for a user id (empty when none was ever assigned). */
export async function getUserPermissionOverride(userId: string): Promise<UserPermissionOverride> {
  const all = readAll();
  const found = all[userId];
  if (!found) return emptyOverride();
  return {
    grants: sanitize(found.grants),
    denies: sanitize(found.denies),
    updatedAt: typeof found.updatedAt === 'string' ? found.updatedAt : new Date().toISOString(),
  };
}

/**
 * Persist an override. An empty grants+denies pair removes the stored entry
 * so users without customization leave no residue.
 */
export async function setUserPermissionOverride(
  userId: string,
  override: Pick<UserPermissionOverride, 'grants' | 'denies'>,
): Promise<UserPermissionOverride> {
  const grants = sanitize(override.grants);
  const denies = sanitize(override.denies).filter((d) => !grants.includes(d));
  const all = readAll();
  if (grants.length === 0 && denies.length === 0) {
    delete all[userId];
  } else {
    all[userId] = { grants, denies, updatedAt: new Date().toISOString() };
  }
  writeAll(all);
  return getUserPermissionOverride(userId);
}

export async function clearUserPermissionOverride(userId: string): Promise<void> {
  const all = readAll();
  delete all[userId];
  writeAll(all);
}

/**
 * Merge role-derived permissions with a user override.
 * Denies win over both role grants and explicit grants.
 */
export function computeEffectivePermissions(
  rolePermissions: string[],
  override: Pick<UserPermissionOverride, 'grants' | 'denies'>,
): string[] {
  const denySet = new Set(sanitize(override.denies));
  const out = new Set<string>();
  for (const p of rolePermissions) {
    if (typeof p === 'string' && !denySet.has(p)) out.add(p);
  }
  for (const p of sanitize(override.grants)) {
    if (!denySet.has(p)) out.add(p);
  }
  return [...out];
}

/**
 * Minimal override update for flipping one permission checkbox whose current
 * visual state is `effective.includes(permission)`:
 * - turning ON removes a deny, else adds a grant (unless the role provides it);
 * - turning OFF removes a grant, else adds a deny (only when the role provides it).
 */
export function computeOverrideUpdate(
  rolePermissions: string[],
  override: Pick<UserPermissionOverride, 'grants' | 'denies'>,
  permission: string,
  nextChecked: boolean,
): Pick<UserPermissionOverride, 'grants' | 'denies'> {
  const grants = sanitize(override.grants);
  const denies = sanitize(override.denies);
  const fromRole = rolePermissions.includes(permission);
  if (nextChecked) {
    return {
      grants: fromRole || grants.includes(permission) ? grants : [...grants, permission],
      denies: denies.filter((d) => d !== permission),
    };
  }
  return {
    grants: grants.filter((g) => g !== permission),
    denies: fromRole && !denies.includes(permission) ? [...denies, permission] : denies,
  };
}
