import { Badge } from '@/components/shared/Badge';
import { reservationStatusLabels } from '@/constants/reservationStatuses';

const variantMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  reserved: 'warning',
  'checked-in': 'success',
  'checked-out': 'info',
  cancelled: 'danger',
};

interface ReservationStatusBadgeProps {
  status: string;
}

export function ReservationStatusBadge({ status }: ReservationStatusBadgeProps) {
  return (
    <Badge variant={variantMap[status] || 'default'}>
      {reservationStatusLabels[status] || status}
    </Badge>
  );
}
