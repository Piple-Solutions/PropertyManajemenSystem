import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { Select } from './Select';
import { Button } from './Button';
import { reservationSources, reservationSourceLabels } from '@/constants/reservationStatuses';
import { RoomSelector } from './RoomSelector';
import { Card } from './Card';
import { ReservationPricingPanel } from './ReservationPricingPanel';
import { useReservationPricing } from '@/hooks/useReservationPricing';
import { roomService } from '@/services/roomService';
import { roomTypeService } from '@/services/roomTypeService';
import type { Room, RoomType } from '@/types/auth.types';
import type { ReservationPricingState } from '@/types/pricing.types';

const createReservationSchema = z.object({
  guestName: z.string().min(2, 'Guest name must be at least 2 characters'),
  source: z.string().min(1, 'Source is required'),
  checkInDate: z.string().min(1, 'Check-in date is required'),
  checkOutDate: z.string().min(1, 'Check-out date is required'),
  roomIds: z.array(z.string()).min(1, 'At least one room is required'),
  notes: z.string().max(1000, 'Notes must be at most 1000 characters').optional().default(''),
}).refine((data) => {
  if (!data.checkInDate || !data.checkOutDate) return true;
  return new Date(data.checkOutDate) > new Date(data.checkInDate);
}, {
  message: 'Check-out must be after check-in',
  path: ['checkOutDate'],
});

type CreateReservationFormData = z.infer<typeof createReservationSchema>;

export interface ReservationFormSubmitData extends CreateReservationFormData {
  pricing: ReservationPricingState;
  roomTotal: number;
  dpAmount: number;
  remainingBalance: number;
}

interface ReservationFormProps {
  initialData?: Partial<CreateReservationFormData>;
  initialPricing?: Partial<ReservationPricingState> | null;
  onSubmit: (data: ReservationFormSubmitData) => void;
  onCancel?: () => void;
  loading?: boolean;
}

function resolveReference(roomIds: string[], rooms: Room[], types: RoomType[]): { referenceRate: number; roomTypeName: string } {
  if (roomIds.length === 0) return { referenceRate: 0, roomTypeName: '' };
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  let total = 0;
  const names = new Set<string>();
  for (const roomId of roomIds) {
    const room = roomById.get(roomId);
    if (!room) continue;
    const rt = typeById.get(room.roomTypeId);
    if (!rt) continue;
    total += Number(rt.defaultRate) || 0;
    names.add(rt.name);
  }
  return {
    referenceRate: total,
    roomTypeName: names.size === 1 ? [...names][0] : names.size > 1 ? `${names.size} room types` : '',
  };
}

export function ReservationForm({ initialData, initialPricing, onSubmit, onCancel, loading = false }: ReservationFormProps) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateReservationFormData>({
    resolver: zodResolver(createReservationSchema),
    defaultValues: {
      guestName: initialData?.guestName || '',
      source: initialData?.source || '',
      checkInDate: initialData?.checkInDate || '',
      checkOutDate: initialData?.checkOutDate || '',
      roomIds: initialData?.roomIds || [],
      notes: initialData?.notes || '',
    },
  });

  const selectedRooms = watch('roomIds') || [];
  const checkInDate = watch('checkInDate') || '';
  const checkOutDate = watch('checkOutDate') || '';
  const source = watch('source') || '';

  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [allTypes, setAllTypes] = useState<RoomType[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([roomService.getAll(), roomTypeService.getAll()]).then(([r, t]) => {
      if (!cancelled) {
        setAllRooms(r);
        setAllTypes(t);
      }
    }).catch(() => {
      if (!cancelled) {
        setAllRooms([]);
        setAllTypes([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { referenceRate, roomTypeName } = useMemo(() => resolveReference(selectedRooms, allRooms, allTypes), [selectedRooms, allRooms, allTypes]);

  const pricingController = useReservationPricing({
    checkInDate,
    checkOutDate,
    referenceRate,
    initial: initialPricing ?? null,
  });

  const handleRoomToggle = (roomId: string) => {
    const current = watch('roomIds') || [];
    if (current.includes(roomId)) {
      setValue('roomIds', current.filter((id) => id !== roomId), { shouldValidate: true });
    } else {
      setValue('roomIds', [...current, roomId], { shouldValidate: true });
    }
  };

  const handleValidSubmit = (data: CreateReservationFormData) => {
    if (!pricingController.validation.isValid) {
      return;
    }
    onSubmit({
      ...data,
      pricing: pricingController.pricing,
      roomTotal: pricingController.calc.roomTotal,
      dpAmount: pricingController.calc.dpAmount,
      remainingBalance: pricingController.calc.remainingBalance,
    });
  };

  return (
    <form onSubmit={handleSubmit(handleValidSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <Input
            label="Guest Name"
            error={!!errors.guestName}
            errorMessage={errors.guestName?.message}
            {...register('guestName')}
            placeholder="Enter guest name"
          />
          <Select
            label="Rate Source"
            error={!!errors.source}
            options={reservationSources.map((s) => ({ value: s, label: reservationSourceLabels[s] || s }))}
            {...register('source')}
          />
          <Input
            label="Check-in Date"
            type="date"
            error={!!errors.checkInDate}
            errorMessage={errors.checkInDate?.message}
            {...register('checkInDate')}
          />
          <Input
            label="Check-out Date"
            type="date"
            error={!!errors.checkOutDate}
            errorMessage={errors.checkOutDate?.message}
            {...register('checkOutDate')}
          />
        </div>
      </Card>

      <Card title="Notes">
        <Textarea
          label="Notes"
          hint="Optional"
          rows={4}
          placeholder="Add special requests, guest notes, internal notes, or other reservation information..."
          error={!!errors.notes}
          errorMessage={errors.notes?.message}
          {...register('notes')}
        />
      </Card>

      <Card title="Room Selection">
        <RoomSelector selectedRooms={selectedRooms} onRoomToggle={handleRoomToggle} />
        {errors.roomIds && (
          <span style={{ fontSize: '12px', color: '#C85C5C', marginTop: '4px', display: 'block' }}>{errors.roomIds.message}</span>
        )}
      </Card>

      <ReservationPricingPanel
        controller={pricingController}
        referenceRate={referenceRate}
        roomTypeName={roomTypeName}
        rateSource={source}
      />

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        )}
        <Button type="submit" loading={loading}>
          {initialData ? 'Update Reservation' : 'Create Reservation'}
        </Button>
      </div>
    </form>
  );
}
