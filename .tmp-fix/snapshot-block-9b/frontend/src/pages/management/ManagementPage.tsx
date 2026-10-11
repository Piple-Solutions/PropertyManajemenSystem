import { useState, type KeyboardEvent } from 'react';
import UserListPage from '../users/UserListPage';
import RoleListPage from '../roles/RoleListPage';
import PermissionListPage from '../permissions/PermissionListPage';
import { usePermissions } from '@/hooks/usePermissions';
import '../../styles/admin-responsive.css';

const tabs = [
  { key: 'users', label: 'Pengguna', permission: 'user.view' },
  { key: 'roles', label: 'Jabatan', permission: 'role.view' },
  { key: 'permissions', label: 'Akses', permission: 'permission.view' },
] as const;

type TabKey = (typeof tabs)[number]['key'];

export default function ManagementPage() {
  const { hasPermission } = usePermissions();
  const visibleTabs = tabs.filter((t) => hasPermission(t.permission));
  const [activeTab, setActiveTab] = useState<TabKey>(visibleTabs[0]?.key ?? 'users');

  const current = visibleTabs.some((t) => t.key === activeTab) ? activeTab : visibleTabs[0]?.key ?? 'users';

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = visibleTabs.findIndex((t) => t.key === current);
    const next =
      e.key === 'ArrowRight'
        ? visibleTabs[(idx + 1) % visibleTabs.length]
        : visibleTabs[(idx - 1 + visibleTabs.length) % visibleTabs.length];
    if (next) setActiveTab(next.key);
  };

  return (
    <div className="adm-page adm-page--wide">
      <div style={{ marginBottom: '16px' }}>
        <h1 className="adm-h1">Manajemen</h1>
        <p className="adm-sub">Pengguna, jabatan, dan hak akses dalam satu halaman</p>
      </div>

      <div
        role="tablist"
        aria-label="Manajemen"
        onKeyDown={onKeyDown}
        style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #C7BBAB', marginBottom: '16px', overflowX: 'auto' }}
      >
        {visibleTabs.map((t) => {
          const selected = t.key === current;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '10px 16px',
                minHeight: '44px',
                fontSize: '14px',
                fontWeight: selected ? 700 : 500,
                color: selected ? '#232D36' : '#6B7881',
                background: 'transparent',
                border: 'none',
                borderBottom: selected ? '3px solid #97764D' : '3px solid transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-family-sans)',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {current === 'users' && <UserListPage />}
        {current === 'roles' && <RoleListPage />}
        {current === 'permissions' && <PermissionListPage />}
      </div>
    </div>
  );
}
