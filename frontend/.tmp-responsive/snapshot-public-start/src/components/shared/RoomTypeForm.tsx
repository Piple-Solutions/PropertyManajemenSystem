import { useEffect, useState } from 'react';
import { roomTypeService } from '@/services/roomTypeService';
import { Input } from './Input';
import { Select } from './Select';
import { Button } from './Button';
import { Card } from './Card';
import { ConfirmDialog } from './ConfirmDialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { apiErrorMessage } from '@/services/api';

const roomTypeSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(1, 'Description is required'),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1'),
  defaultRate: z.coerce.number().positive('Default rate must be a positive number'),
  facilities: z.string(),
  status: z.enum(['active', 'inactive']),
});

type RoomTypeFormData = z.infer<typeof roomTypeSchema>;

interface RoomTypeFormProps {
  id?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function RoomTypeForm({ id, onSuccess, onCancel }: RoomTypeFormProps) {
  const service = roomTypeService;
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!id);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [formError, setFormError] = useState('');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<RoomTypeFormData>({
    resolver: zodResolver(roomTypeSchema),
    defaultValues: {
      name: '',
      description: '',
      capacity: 1,
      defaultRate: 0,
      facilities: '',
      status: 'active',
    },
  });

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setFetching(false);
      return;
    }
    setFetching(true);
    service.getById(id).then((existingType) => {
      if (cancelled) return;
      if (existingType) {
        reset({
          name: existingType.name || '',
          description: existingType.description || '',
          capacity: existingType.capacity || 1,
          defaultRate: existingType.defaultRate || 0,
          facilities: existingType.facilities?.join(', ') || '',
          status: existingType.status || 'active',
        });
      }
      setFetching(false);
    }).catch(() => {
      if (!cancelled) setFetching(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onSubmit = async (data: RoomTypeFormData) => {
    setLoading(true);
    setFormError('');
    try {
      const facilities = data.facilities.split(',').map((s) => s.trim()).filter(Boolean);
      if (isEdit && id) {
        await service.update(id, { ...data, facilities });
      } else {
        // Create-path fix: send the parsed facilities array (not the raw
        // comma string) so the API receives string[] as validated.
        await service.create({
          name: data.name,
          description: data.description,
          capacity: Number(data.capacity),
          defaultRate: Number(data.defaultRate),
          facilities,
          images: [],
          status: data.status,
        });
      }
      onSuccess();
    } catch (err) {
      setFormError(apiErrorMessage(err, 'Failed to save room type'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (id) {
      await service.delete(id);
      onSuccess();
    }
    setDeleteConfirm(false);
  };

  if (fetching) {
    return <p style={{ margin: 0, fontSize: '14px', color: '#6B7881' }}>Loading room type...</p>;
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            <Input
              label="Name"
              error={!!errors.name}
              errorMessage={errors.name?.message}
              {...register('name')}
              placeholder="e.g., Standard"
            />
            <Input
              label="Description"
              error={!!errors.description}
              errorMessage={errors.description?.message}
              {...register('description')}
              placeholder="Describe the room type"
            />
            <Input
              label="Capacity"
              type="number"
              error={!!errors.capacity}
              errorMessage={errors.capacity?.message}
              {...register('capacity')}
            />
            <Input
              label="Default Rate"
              type="number"
              error={!!errors.defaultRate}
              errorMessage={errors.defaultRate?.message}
              {...register('defaultRate')}
            />
            <Input
              label="Facilities (comma-separated)"
              {...register('facilities')}
              placeholder="WiFi, TV, Air Conditioning"
            />
            <Select
              label="Status"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              {...register('status')}
            />
          </div>
        </Card>

        {formError && <p role="alert" style={{ margin: 0, fontSize: '13px', color: '#962222' }}>{formError}</p>}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {isEdit && (
            <Button
              type="button"
              variant="danger"
              onClick={() => setDeleteConfirm(true)}
            >
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" loading={loading}>
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Room Type"
        message="Are you sure you want to delete this room type? This action cannot be undone."
        confirmText="Delete"
        destructive
      />
    </>
  );
}
