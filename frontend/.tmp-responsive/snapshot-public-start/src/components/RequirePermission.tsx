import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import { EmptyState } from './shared/EmptyState';

interface RequirePermissionProps {
  permission?: string;
  anyOf?: string[];
  fallback?: ReactNode;
}

export function RequirePermission({ permission, anyOf, fallback }: RequirePermissionProps) {
  const { hasPermission } = usePermissions();

  const allowed =
    (permission !== undefined && permission !== '' && hasPermission(permission)) ||
    (anyOf !== undefined && anyOf.some((p) => hasPermission(p))) ||
    (permission === undefined && anyOf === undefined);

  if (!allowed) {
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }
    return (
      <EmptyState
        title="Akses Ditolak"
        description="Anda tidak memiliki izin untuk mengakses halaman ini. Hubungi administrator jika Anda memerlukan akses."
      />
    );
  }

  return <Outlet />;
}
