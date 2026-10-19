import { usePermissionContext } from '../stores/permissionStore';

export function usePermissions() {
  const { permissions, hasPermission, refreshPermissions } = usePermissionContext();

  return { permissions, hasPermission, refreshPermissions };
}
