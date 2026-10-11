import { useState, useEffect, useMemo } from 'react';
import { Button } from './Button';
import { Select } from './Select';
import userService from '@/services/userService';
import roleService from '@/services/roleService';
import { apiErrorMessage } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { STATIC_PERMISSION_CATALOG } from '@/config/permissions';
import { PermissionCheckboxGrid, type PermissionOption } from './PermissionCheckboxGrid';
import permissionService from '@/services/permissionService';
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

interface UserRoleFormProps {
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function UserRoleForm({ userId, onSuccess, onCancel }: UserRoleFormProps) {
  const { user: currentUser } = useAuth();
  const { hasPermission, refreshPermissions } = usePermissions();
  const [user, setUser] = useState<any | null>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [permDraft, setPermDraft] = useState<{ grants: string[]; denies: string[] }>({ grants: [], denies: [] });
  const [catalog, setCatalog] = useState<PermissionOption[]>([]);

  // Only holders of user.update may assign individual permissions, and nobody
  // may edit their own overrides (prevents self lock-out / self escalation).
  const canManagePermissions = hasPermission('user.update');
  const canGrantAssign = hasPermission(ASSIGN_GATED);
  const isSelf = !!currentUser && userId === currentUser.id;

  // Role-derived baseline for the currently selected role.
  const rolePerms = useMemo(() => {
    const role = roles.find((r: any) => r.id === selectedRole);
    return Array.isArray(role?.permissions) ? role.permissions.filter((p: unknown) => typeof p === 'string') : [];
  }, [roles, selectedRole]);

  const effectivePreview = useMemo(
    () => computeEffectivePermissions(rolePerms, permDraft),
    [rolePerms, permDraft],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([userService.getById(userId), roleService.getAll()])
      .then(([u, r]) => {
        if (cancelled) return;
        setUser(u ?? null);
        setRoles(r);
        if (u && Array.isArray(u.roles) && u.roles.length > 0) setSelectedRole(u.roles[0]);
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

  useEffect(() => {
    let cancelled = false;
    setPermDraft({ grants: [], denies: [] });
    Promise.all([
      permissionService.getAll().catch(() => [] as any[]),
      getUserPermissionOverride(userId),
    ]).then(([perms, o]) => {
      if (cancelled) return;
      const list: PermissionOption[] = (Array.isArray(perms) && perms.length > 0
        ? perms
        : STATIC_PERMISSION_CATALOG
      ).map((p: any) => ({ name: p.name, group: p.group, description: p.description }));
      setCatalog(list.filter((p) => typeof p.name === 'string'));
      setPermDraft({ grants: o.grants, denies: o.denies });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggleUserPermission = (name: string, checked: boolean) => {
    setPermDraft((prev) => computeOverrideUpdate(rolePerms, prev, name, checked));
  };

  const handleSave = async () => {
    if (!selectedRole || isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      await userService.update(userId, { roles: [selectedRole] });
      if (canManagePermissions && !isSelf) {
        await setUserPermissionOverride(userId, permDraft);
        await refreshPermissions();
      }
      onSuccess();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to assign role'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p style={{ color: '#6B7881', fontSize: '14px' }}>Loading...</p>;
  }

  if (!user) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md, 12px)' }}>
      {error && <div role="alert" style={{ color: '#C85C5C', fontSize: '13px' }}>{error}</div>}
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #C7BBAB', borderRadius: '8px', padding: 'var(--space-xl, 20px)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-lg, 16px)', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 'var(--font-size-caption, 12px)', color: '#6B7881' }}>Name</span>
            <p style={{ fontWeight: 600, color: '#232D36', margin: 0 }}>{user.name}</p>
          </div>
          <div>
            <span style={{ fontSize: 'var(--font-size-caption, 12px)', color: '#6B7881' }}>Email</span>
            <p style={{ fontWeight: 600, color: '#232D36', margin: 0 }}>{user.email}</p>
          </div>
          <div>
            <span style={{ fontSize: 'var(--font-size-caption, 12px)', color: '#6B7881' }}>Status</span>
            <p style={{ fontWeight: 600, color: '#232D36', margin: 0 }}>{user.status}</p>
          </div>
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 'var(--font-size-body, 14px)', fontWeight: 500, marginBottom: 'var(--space-xs, 4px)', color: '#232D36' }}>Role</label>
        <Select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} options={[{ value: '', label: 'Select a role' }, ...roles.map((r: any) => ({ value: r.id, label: r.name }))]} />
      </div>
      {canManagePermissions && !isSelf && (
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
      )}
      {canManagePermissions && isSelf && (
        <p style={{ fontSize: '12px', color: '#6B7881', margin: 0 }}>You cannot change your own permissions.</p>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-md, 12px)', flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Role'}</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
