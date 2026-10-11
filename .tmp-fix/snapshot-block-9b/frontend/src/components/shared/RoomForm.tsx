import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { roomService } from '@/services/roomService';
import { roomTypeService } from '@/services/roomTypeService';
import type { RoomType } from '@/types/auth.types';
import { Input } from './Input';
import { Select } from './Select';
import { Button } from './Button';
import { Card } from './Card';
import { ConfirmDialog } from './ConfirmDialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { apiErrorMessage } from '@/services/api';

const roomSchema = z.object({
  roomNumber: z.string().min(1, 'Room number is required'),
  roomTypeId: z.string().min(1, 'Room type is required'),
  status: z.enum(['active', 'inactive', 'maintenance']),
});

type RoomFormData = z.infer<typeof roomSchema>;

interface RoomFormProps {
  id?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function RoomForm({ id, onSuccess, onCancel }: RoomFormProps) {
  const service = roomService;
  const typeService = roomTypeService;
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!id);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [formError, setFormError] = useState('');
  const [allTypes, setAllTypes] = useState<RoomType[]>([]);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<RoomFormData>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      roomNumber: '',
      roomTypeId: '',
      status: 'active',
    },
  });

  useEffect(() => {
    let cancelled = false;
    typeService.getAll().then((t) => {
      if (!cancelled) setAllTypes(t);
    }).catch(() => {
      if (!cancelled) setAllTypes([]);
    });
    if (!id) {
      setFetching(false);
      return;
    }
    setFetching(true);
    service.getById(id).then((existingRoom) => {
      if (cancelled) return;
      if (existingRoom) {
        reset({
          roomNumber: existingRoom.roomNumber || '',
          roomTypeId: existingRoom.roomTypeId || '',
          status: existingRoom.status || 'active',
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

  const onSubmit = async (data: RoomFormData) => {
    setLoading(true);
    setFormError('');
    try {
      if (isEdit && id) {
        await service.update(id, data);
      } else {
        await service.create(data);
      }
      onSuccess();
    } catch (err) {
      setFormError(apiErrorMessage(err, 'Failed to save room'));
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
    return <p style={{ margin: 0, fontSize: '14px', color: '#6B7881' }}>Loading room...</p>;
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            <Input
              label="Room Number"
              error={!!errors.roomNumber}
              errorMessage={errors.roomNumber?.message}
              {...register('roomNumber')}
              placeholder="e.g., 101"
            />
            <Select
              label="Room Type"
              error={!!errors.roomTypeId}
              options={[
                { value: '', label: 'Select room type...' },
                ...allTypes.map((t) => ({ value: t.id, label: t.name })),
              ]}
              {...register('roomTypeId')}
            />
            <Select
              label="Status"
              error={!!errors.status}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'maintenance', label: 'Maintenance' },
              ]}
              {...register('status')}
            />
          </div>
        </Card>

        {formError && <p role="alert" style={{ margin: 0, fontSize: '13px', color: '#962222' }}>{formError}</p>}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {isEdit && (
            <Button type="button" variant="danger" aria-label="Delete room" onClick={() => setDeleteConfirm(true)}><Trash2 size={14} aria-hidden="true" /></Button>
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
        title="Delete Room"
        message="Are you sure you want to delete this room?"
        confirmText="Delete"
        destructive
      />
    </>
  );
}
