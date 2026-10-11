import { useState, useEffect, useMemo } from 'react';
import { Table } from '@/components/shared/Table';
import { Pagination } from '@/components/shared/Pagination';
import { usePermissions } from '@/hooks/usePermissions';
import permissionService from '@/services/permissionService';
import '../../styles/admin-responsive.css';

export default function PermissionListPage() {
  const { hasPermission } = usePermissions();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    permissionService.getAll().then((p) => {
      if (!cancelled) {
        setPermissions(p);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(permissions.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const visiblePermissions = useMemo(
    () => permissions.slice((safePage - 1) * pageSize, safePage * pageSize),
    [permissions, safePage, pageSize],
  );

  const columns = [
    { key: 'name', header: 'Permission', render: (item: any) => item.name },
    { key: 'description', header: 'Description', render: (item: any) => item.description },
    { key: 'group', header: 'Group', render: (item: any) => item.group },
    { key: 'resource', header: 'Resource', render: (item: any) => item.resource },
    { key: 'action', header: 'Action', render: (item: any) => item.action },
    { key: 'hasPermission', header: 'Your Access', render: (item: any) => hasPermission(item.name) ? '✓' : '✗' },
  ];

  return (
    <div className="adm-page">
      <h1 className="adm-h1" style={{ marginBottom: '16px' }}>Akses</h1>
      <p className="adm-sub" style={{ marginBottom: '16px' }}>Permissions are assigned via roles. Each user gets one role, and all permissions are inherited from that role.</p>
      <Table columns={columns} data={visiblePermissions} emptyMessage={isLoading ? 'Loading permissions...' : 'No permissions defined'} headerStyle={{ backgroundColor: '#97764D', color: '#FFFFFF' }} />
      {permissions.length > 0 && (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={permissions.length}
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 50]}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        />
      )}
    </div>
  );
}
