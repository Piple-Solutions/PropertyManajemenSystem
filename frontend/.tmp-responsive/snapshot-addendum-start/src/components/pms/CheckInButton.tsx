import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { reservationService } from '@/services/reservationService';
import { useNavigate } from 'react-router-dom';

interface CheckInButtonProps {
  reservationId: string;
  currentStatus: string;
  guestName: string;
}

export function CheckInButton({ reservationId, currentStatus, guestName }: CheckInButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const navigate = useNavigate();

  if (currentStatus !== 'reserved') return null;

  const handleCheckIn = async () => {
    await reservationService.checkIn(reservationId);
    setConfirmOpen(false);
    navigate(0);
  };

  return (
    <>
      <Button onClick={() => setConfirmOpen(true)}>Check In</Button>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleCheckIn}
        title="Confirm Check-In"
        message={`Are you sure you want to check in ${guestName}?`}
        confirmText="Check In"
      />
    </>
  );
}
