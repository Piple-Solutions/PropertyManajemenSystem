import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Modal } from '@/components/shared/Modal';
import { UserForm } from '@/components/shared/UserForm';
import userService from '@/services/userService';
import roleService from '@/services/roleService';
import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
import { PAGE_PERMISSIONS } from '@/config/permissions';
import {
  computeEffectivePermissions,
  getUserPermissionOverride,
  type UserPermissionOverride,
} from '@/services/userPermissionService';
import '../../styles/admin-responsive.css';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showEdit, setShowEdit] = useState(false);
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [override, setOverride] = useState<UserPermissionOverride>({ grants: [], denies: [], updatedAt: '' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setIsLoading(true);
    userService.getById(id).then((u) => {
      if (!cancelled) {
        setUser(u ?? null);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setUser(null);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, showEdit]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([
      roleService.getAll().catch(() => [] as any[]),
      getUserPermissionOverride(id),
    ]).then(([roles, o]) => {
      if (cancelled) return;
      setAllRoles(roles);
      setOverride(o);
    });
    return () => {
      cancelled = true;
    };
  }, [id, showEdit]);

  const rolePerms = useMemo(() => {
    const set = new Set<string>();
    const userRoleIds: string[] = Array.isArray(user?.roles) ? user.roles : [];
    for (const r of allRoles) {
      if (userRoleIds.includes(r.id) && Array.isArray(r.permissions)) {
        for (const p of r.permissions) {
          if (typeof p === 'string') set.add(p);
        }
      }
    }
    return set;
  }, [allRoles, user]);

  const effective = useMemo(
    () => new Set(computeEffectivePermissions([...rolePerms], override)),
    [rolePerms, override],
  );

  if (isLoading) {
    return (
      <div style={{ padding: 'var(--space-xl, 20px)', textAlign: 'center' }}>
        <p style={{ color: '#6B7881' }}>Loading user...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: 'var(--space-xl, 20px)', textAlign: 'center' }}>
        <h2 style={{ color: '#232D36', fontFamily: 'var(--font-family-sans)' }}>User not found</h2>
        <Link to="/dashboard/users" style={{ color: '#97764D', fontWeight: 600 }}>Back to Users</Link>
      </div>
    );
  }

  return (
    <div className="adm-page adm-page--narrow">
      <div className="adm-head">
        <h1 className="adm-h1">User Details</h1>
        <Button variant="outline" className="adm-cta" aria-label="Edit user" onClick={() => setShowEdit(true)}><Pencil size={14} aria-hidden="true" /></Button>
      </div>
      <Card title="User Information">
        <div style={{ display: 'grid', gap: 'var(--space-md, 12px)' }}>
          {[
            { label: 'Name', value: user.name },
            { label: 'Email', value: user.email },
            { label: 'Status', value: user.status },
            { label: 'Roles', value: user.roles?.map((r: string) => r.replace('role-', 'Role ')).join(', ') || '-' },
            { label: 'Created', value: new Date(user.createdAt).toLocaleDateString() },
            { label: 'Last Login', value: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'N/A' },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-sm, 8px) 0', borderBottom: '1px solid #C7BBAB' }}>
              <span style={{ fontWeight: 500, color: '#6B7881' }}>{item.label}</span>
              <span style={{ fontWeight: 600, color: '#232D36' }}>{item.value}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Permissions">
        <p style={{ fontSize: '12px', color: '#6B7881', margin: '0 0 12px' }}>
          Effective page access for this user: role permissions plus user-specific grants, minus revocations.
        </p>
        <div style={{ display: 'grid', gap: 'var(--space-sm, 8px)' }}>
          {PAGE_PERMISSIONS.map((perm) => {
            const granted = effective.has(perm.name);
            const userSpecific = override.grants.includes(perm.name) || override.denies.includes(perm.name);
            return (
              <div key={perm.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: 'var(--space-sm, 8px) 0', borderBottom: '1px solid #C7BBAB' }}>
                <span>
                  <span style={{ fontWeight: 600, color: '#232D36', fontSize: '13px' }}>{perm.label}</span>
                  <span style={{ color: '#6B7881', fontSize: '12px' }}> · {perm.name}</span>
                </span>
                {granted ? (
                  <Badge variant="success">{userSpecific ? 'Granted (user)' : 'Granted (role)'}</Badge>
                ) : (
                  <Badge variant="default">{userSpecific ? 'Revoked (user)' : 'No access'}</Badge>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <div style={{ marginTop: 'var(--space-lg, 16px)' }}>
        <Link to="/dashboard/users" className="adm-backlink"><ArrowLeft size={14} aria-hidden="true" /> Back to Users</Link>
      </div>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit User" size="md">
        <UserForm key={user.id} id={user.id} onSuccess={() => setShowEdit(false)} onCancel={() => setShowEdit(false)} />
      </Modal>
    </div>
  );
}
