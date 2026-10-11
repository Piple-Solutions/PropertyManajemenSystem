import { CheckInButton } from './CheckInButton';
import { CheckOutButton } from './CheckOutButton';
import { ReservationStatusBadge } from './ReservationStatusBadge';

interface CheckInCheckOutIntegrationProps {
  reservationId: string;
  status: string;
  guestName: string;
}

export function CheckInCheckOutIntegration({ reservationId, status, guestName }: CheckInCheckOutIntegrationProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      <ReservationStatusBadge status={status} />
      <CheckInButton reservationId={reservationId} currentStatus={status} guestName={guestName} />
      <CheckOutButton reservationId={reservationId} currentStatus={status} guestName={guestName} />
    </div>
  );
}
