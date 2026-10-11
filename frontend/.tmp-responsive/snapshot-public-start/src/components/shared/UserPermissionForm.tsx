import { useState, useEffect, useMemo } from 'react';
import { Button } from './Button';
import { PermissionCheckboxGrid, type PermissionOption } from './PermissionCheckboxGrid';
import userService from '@/services/userService';
import roleService from '@/services/roleService';
import permissionService from '@/services/permissionService';
import { apiErrorMessage } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { STATIC_PERMISSION_CATALOG } from '@/config/permissions';
import {
  computeEffectivePermissions,
  computeOverrideUpdate,
  getUserPermissionOverride,
  setUserPermissionOverride,
} from '@/services/userPermissionService';

/** Granting this permission lets the holder escalate anyone (mirrors the
 * backend `assertNoPrivilegeEscalation` rule), so only its current holders
 * may hand it out. */
const ASSIGN_GATED = 'permission.assign';

interface UserPermissionFormProps {
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Standalone permission assignment for one existing user (opened from the
 * "Assign Permission" action). Role assignment stays in UserRoleForm.
 */
export function UserPermissionForm({ userId, onSuccess, onCancel }: UserPermissionFormProps) {
  const { user: currentUser } = useAuth();
  const { hasPermission, refreshPermissions } = usePermissions();
  const [user, setUser] = useState<any | null>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<PermissionOption[]>([]);
  const [permDraft, setPermDraft] = useState<{ grants: string[]; denies: string[] }>({ grants: [], denies: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Only holders of user.update may assign individual permissions, and nobody
  // may edit their own overrides (prevents self lock-out / self escalation).
  const canManagePermissions = hasPermission('user.update');
  const canGrantAssign = hasPermission(ASSIGN_GATED);
  const isSelf = !!currentUser && userId === currentUser.id;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      userService.getById(userId),
      roleService.getAll().catch(() => [] as any[]),
      permissionService.getAll().catch(() => [] as any[]),
      getUserPermissionOverride(userId),
    ])
      .then(([u, r, perms, o]) => {
        if (cancelled) return;
        setUser(u ?? null);
        setRoles(r);
        const list: PermissionOption[] = (Array.isArray(perms) && perms.length > 0
          ? perms
          : STATIC_PERMISSION_CATALOG
        ).map((p: any) => ({
          name: p.name,
          group: p.group,
          description: p.description,
        }));
        setCatalog(list.filter((p) => typeof p.name === 'string'));
        setPermDraft({ grants: o.grants, denies: o.denies });
        setIsLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(apiErrorMessage(err, 'Failed to load data'));
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Role-derived baseline for the user's current roles.
  const rolePerms = useMemo(() => {
    const set = new Set<string>();
    const userRoleIds: string[] = Array.isArray(user?.roles) ? user.roles : [];
    for (const r of roles) {
      if (userRoleIds.includes(r.id) && Array.isArray(r.permissions)) {
        for (const p of r.permissions) {
          if (typeof p === 'string') set.add(p);
        }
      }
    }
    return [...set];
  }, [roles, user]);

  const effectivePreview = useMemo(
    () => computeEffectivePermissions(rolePerms, permDraft),
    [rolePerms, permDraft],
  );

  const toggleUserPermission = (name: string, checked: boolean) => {
    setPermDraft((prev) => computeOverrideUpdate(rolePerms, prev, name, checked));
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      await setUserPermissionOverride(userId, permDraft);
      await refreshPermissions();
      onSuccess();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save permissions'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p style={{ color: '#6B7881', fontSize: '14px' }}>Loading...</p>;
  }

  if (!user) return null;

  if (!canManagePermissions || isSelf) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md, 12px)' }}>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #C7BBAB', borderRadius: '8px', padding: 'var(--space-xl, 20px)' }}>
          <p style={{ fontWeight: 600, color: '#232D36', margin: 0 }}>{user.name}</p>
          <p style={{ fontSize: '13px', color: '#6B7881', margin: '4px 0 0' }}>{user.email}</p>
        </div>
        <p style={{ fontSize: '12px', color: '#6B7881', margin: 0 }}>
          {isSelf
            ? 'You cannot change your own permissions.'
            : 'You need the user.update permission to assign permissions.'}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-md, 12px)', flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={onCancel}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md, 12px)' }}>
      {error && <div role="alert" style={{ color: '#C85C5C', fontSize: '13px' }}>{error}</div>}
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #C7BBAB', borderRadius: '8px', padding: 'var(--space-xl, 20px)' }}>
        <p style={{ fontWeight: 600, color: '#232D36', margin: 0 }}>{user.name}</p>
        <p style={{ fontSize: '13px', color: '#6B7881', margin: '4px 0 0' }}>{user.email}</p>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 'var(--font-size-body, 14px)', fontWeight: 500, marginBottom: 'var(--space-xs, 4px)', color: '#6B7881' }}>Permissions</label>
        <p style={{ fontSize: '12px', color: '#6B7881', margin: '0 0 8px' }}>
          User-specific access to existing pages and actions. Checked means this user has the permission;
          unchecking a role-provided permission revokes it for this user only.
        </p>
        <PermissionCheckboxGrid
          permissions={catalog}
          checked={(name) => effectivePreview.includes(name)}
          fromRole={(name) => rolePerms.includes(name)}
          disabled={(name) => name === ASSIGN_GATED && !canGrantAssign}
          disabledHint="permission.assign can only be granted by someone who already holds it."
          onToggle={toggleUserPermission}
        />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-md, 12px)', flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Permissions'}</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
