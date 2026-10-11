import mockPermissionsJson from '../data/mock/permissions.json';

/**
 * Page-level permission catalog.
 *
 * Every entry corresponds to an EXISTING page/feature and reuses the exact
 * permission string already enforced by the router (`App.tsx`), the sidebar
 * (`PMSLayout.tsx`) and the management tabs (`ManagementPage.tsx`).
 */
export interface PagePermission {
  /** Exact permission string enforced elsewhere, e.g. `reservation.view`. */
  name: string;
  /** Human-readable label shown in assignment UI. */
  label: string;
  /** Existing area of the application this permission unlocks. */
  group: string;
}

export const PAGE_PERMISSIONS: PagePermission[] = [
  { name: 'reservation.view', label: 'Reservasi', group: 'Reservasi' },
  { name: 'room.view', label: 'Kamar', group: 'Kamar' },
  { name: 'finance.sales.view', label: 'Penjualan', group: 'Keuangan' },
  { name: 'finance.invoice.view', label: 'Invoices', group: 'Keuangan' },
  { name: 'finance.report.view', label: 'Laporan', group: 'Keuangan' },
  { name: 'user.view', label: 'Pengguna', group: 'Manajemen' },
  { name: 'role.view', label: 'Jabatan', group: 'Manajemen' },
  { name: 'permission.view', label: 'Akses', group: 'Manajemen' },
  { name: 'activity.view', label: 'Aktivitas', group: 'Aktivitas' },
];

export const PAGE_PERMISSION_NAMES: string[] = PAGE_PERMISSIONS.map((p) => p.name);

export interface CatalogOption {
  name: string;
  group?: string;
  description?: string;
}

interface MockPermissionEntry {
  name?: unknown;
  group?: unknown;
  description?: unknown;
}

export function toCatalogOptions(entries: MockPermissionEntry[]): CatalogOption[] {
  return entries
    .map((p) => ({
      name: typeof p.name === 'string' ? p.name : '',
      group: typeof p.group === 'string' ? p.group : undefined,
      description: typeof p.description === 'string' ? p.description : undefined,
    }))
    .filter((p) => p.name.length > 0);
}

/**
 * Full static catalog (all 26 mock permissions, grouped) used as a fallback
 * when the live API catalog (`GET /api/permissions`, itself gated on
 * `permission.view`) is unavailable to the current user. The live list is
 * always preferred when readable since it additionally carries backend-only
 * entries.
 */
export const STATIC_PERMISSION_CATALOG: CatalogOption[] = toCatalogOptions(
  mockPermissionsJson as MockPermissionEntry[],
);
