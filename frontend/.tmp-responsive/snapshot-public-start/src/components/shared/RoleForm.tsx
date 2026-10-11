import { useState, useEffect, type FormEvent } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import roleService from '@/services/roleService';
import permissionService from '@/services/permissionService';
import { apiErrorMessage } from '@/services/api';

interface RoleFormProps {
  id?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function RoleForm({ id, onSuccess, onCancel }: RoleFormProps) {
  const isEdit = !!id;
  const [formData, setFormData] = useState({ name: '', description: '', permissions: [] as string[] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(!!id);
  const [permissions, setPermissions] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    permissionService.getAll().then((p) => {
      if (!cancelled) setPermissions(p);
    }).catch(() => {
      if (!cancelled) setServerError('Failed to load permissions');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setIsLoading(true);
    roleService.getById(id).then((role) => {
      if (cancelled) return;
      if (role) setFormData({ name: role.name, description: role.description, permissions: role.permissions || [] });
      setIsLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setServerError('Failed to load role');
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim() || formData.name.trim().length < 2) errs.name = 'Name must be at least 2 characters';
    if (!formData.description.trim()) errs.description = 'Description is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    setServerError('');
    try {
      const data = { ...formData, status: 'active' as const };
      if (isEdit && id) {
        const result = await roleService.update(id, data);
        if (result) onSuccess();
        else setServerError('Failed to update role');
      } else {
        const result = await roleService.create(data);
        if (result) onSuccess();
      }
    } catch (err) {
      setServerError(apiErrorMessage(err, 'Failed to save role'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePermission = (permName: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permName)
        ? prev.permissions.filter((p) => p !== permName)
        : [...prev.permissions, permName],
    }));
  };

  if (isLoading) {
    return <p style={{ color: '#6B7881', fontSize: '14px' }}>Loading role...</p>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md, 12px)' }}>
      {serverError && <div role="alert" style={{ color: '#C85C5C', fontSize: '13px' }}>{serverError}</div>}
      <div>
        <label style={{ display: 'block', fontSize: 'var(--font-size-body, 14px)', fontWeight: 500, marginBottom: 'var(--space-xs, 4px)', color: '#232D36' }}>Role Name</label>
        <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Manager" errorMessage={errors.name} />
        {errors.name && <span style={{ color: '#C85C5C', fontSize: '12px' }}>{errors.name}</span>}
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 'var(--font-size-body, 14px)', fontWeight: 500, marginBottom: 'var(--space-xs, 4px)', color: '#232D36' }}>Description</label>
        <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Describe this role..." style={{ width: '100%', minHeight: '80px', padding: '12px 14px', backgroundColor: '#FFFFFF', border: '1px solid #C7BBAB', borderRadius: '8px', fontSize: 'var(--font-size-body, 14px)', fontFamily: 'var(--font-family-sans)', outline: 'none', boxSizing: 'border-box' }} />
        {errors.description && <span style={{ color: '#C85C5C', fontSize: '12px' }}>{errors.description}</span>}
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 'var(--font-size-body, 14px)', fontWeight: 500, marginBottom: 'var(--space-xs, 4px)', color: '#232D36' }}>Permissions</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-xs, 4px)', maxHeight: '300px', overflowY: 'auto', border: '1px solid #C7BBAB', borderRadius: '8px', padding: 'var(--space-md, 12px)', backgroundColor: '#FFFFFF' }}>
          {permissions.map((perm: any) => (
            <label key={perm.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs, 4px)', fontSize: 'var(--font-size-body, 14px)', cursor: 'pointer', padding: '4px' }}>
              <input type="checkbox" checked={formData.permissions.includes(perm.name)} onChange={() => togglePermission(perm.name)} />
              {perm.name}
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-md, 12px)', marginTop: 'var(--space-sm, 8px)', flexWrap: 'wrap' }}>
        <Button type="submit" variant="primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : isEdit ? 'Update Role' : 'Create Role'}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
