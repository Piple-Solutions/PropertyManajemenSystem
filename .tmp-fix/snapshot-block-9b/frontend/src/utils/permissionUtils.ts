export function hasPermission(
  permissions: string[],
  requiredPermission: string
): boolean {
  return permissions.includes(requiredPermission);
}

export function getUserPermissions(roles: { permissions: string[] }[]): string[] {
  const allPermissions = new Set<string>();
  roles.forEach((role) => {
    role.permissions.forEach((p) => allPermissions.add(p));
  });
  return Array.from(allPermissions);
}
