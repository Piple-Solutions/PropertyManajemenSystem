import { Link } from 'react-router-dom';
import { Badge } from './Badge';
import { reservationStatusLabels } from '@/constants/reservationStatuses';
import '../../styles/reservation-list.css';

export interface ReservationCardRoom {
  roomNumber: string;
  roomTypeName: string;
}

interface ReservationCardProps {
  reservation: {
    id: string;
    reservationCode: string;
    guestName: string;
    source: string;
    checkInDate: string;
    checkOutDate: string;
    status: string;
    totalAmount: number;
    rooms: ReservationCardRoom[];
    paymentStatus?: string;
  };
}

const statusVariantMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  reserved: 'warning',
  'checked-in': 'success',
  'checked-out': 'info',
  cancelled: 'danger',
};

function formatShortDay(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function ReservationCard({ reservation }: ReservationCardProps) {
  const roomNumbers = reservation.rooms.map((r) => r.roomNumber).filter(Boolean);
  const roomLabel = roomNumbers.length > 0 ? `Room ${roomNumbers.join(', ')}` : 'No rooms';
  const stayLabel = `${formatShortDay(reservation.checkInDate)} - ${formatShortDay(reservation.checkOutDate)}`;

  return (
    <Link
      to={`/dashboard/reservations/${reservation.id}`}
      className="res-card"
      aria-label={`Reservation ${reservation.reservationCode}, ${reservation.guestName}, ${roomLabel}, ${stayLabel}, ${reservationStatusLabels[reservation.status] || reservation.status}`}
    >
      <span className="res-card__code" title={reservation.reservationCode}>{reservation.reservationCode}</span>
      <span className="res-card__guest" title={reservation.guestName}>{reservation.guestName}</span>
      <span className="res-card__room" title={roomLabel}>{roomLabel}</span>
      <span className="res-card__dates" title={stayLabel}>{stayLabel}</span>
      <span className="res-card__badges">
        <Badge size="sm" variant={statusVariantMap[reservation.status] || 'default'}>
          {reservationStatusLabels[reservation.status] || reservation.status}
        </Badge>
      </span>
    </Link>
  );
}
