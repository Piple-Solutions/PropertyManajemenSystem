import { useMemo } from 'react';

export interface PermissionOption {
  name: string;
  group?: string;
  description?: string;
}

interface PermissionCheckboxGridProps {
  permissions: PermissionOption[];
  /** Current visual state (effective permissions of the target user). */
  checked: (name: string) => boolean;
  /** True when the permission comes from the user's roles. */
  fromRole?: (name: string) => boolean;
  /** True when this checkbox must be locked (e.g. escalation guard). */
  disabled?: (name: string) => boolean;
  /** Hint shown when at least one checkbox is locked. */
  disabledHint?: string;
  onToggle: (name: string, checked: boolean) => void;
  ariaLabelPrefix?: string;
}

/**
 * Scrollable, grouped permission checkbox grid. Shared by every user-permission
 * assignment UI (Assign Permission modal, UserForm, UserRoleForm) so there is
 * exactly one implementation. Styling mirrors the existing RoleForm pattern.
 */
export function PermissionCheckboxGrid({
  permissions,
  checked,
  fromRole,
  disabled,
  disabledHint,
  onToggle,
  ariaLabelPrefix = '',
}: PermissionCheckboxGridProps) {
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, PermissionOption[]>();
    for (const p of permissions) {
      const g = p.group || 'Other';
      if (!byGroup.has(g)) {
        byGroup.set(g, []);
        order.push(g);
      }
      byGroup.get(g)?.push(p);
    }
    return order.map((g) => ({ group: g, items: byGroup.get(g) ?? [] }));
  }, [permissions]);

  const anyDisabled = useMemo(
    () => (disabled ? permissions.some((p) => disabled(p.name)) : false),
    [disabled, permissions],
  );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '300px',
          overflowY: 'auto',
          border: '1px solid #C7BBAB',
          borderRadius: '8px',
          padding: '12px',
          backgroundColor: '#FFFFFF',
        }}
      >
        {groups.map(({ group, items }) => (
          <div key={group}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7881', marginBottom: '4px' }}>
              {group}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {items.map((perm) => {
                const isChecked = checked(perm.name);
                const isFromRole = fromRole ? fromRole(perm.name) : false;
                const isDisabled = disabled ? disabled(perm.name) : false;
                return (
                  <label
                    key={perm.name}
                    title={perm.description || perm.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      padding: '4px',
                      fontSize: '13px',
                      color: isDisabled ? '#6B7881' : '#232D36',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isDisabled}
                      onChange={(e) => onToggle(perm.name, e.target.checked)}
                      aria-label={`${ariaLabelPrefix}${perm.name} permission`}
                    />
                    {perm.name}
                    {isFromRole && (
                      <span style={{ color: '#6B7881', fontSize: '11px' }}>(role)</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {anyDisabled && disabledHint && (
        <p style={{ fontSize: '11px', color: '#6B7881', margin: '6px 0 0' }}>{disabledHint}</p>
      )}
    </div>
  );
}
