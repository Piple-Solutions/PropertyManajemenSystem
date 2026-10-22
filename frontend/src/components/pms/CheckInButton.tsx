import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { reservationService } from '@/services/reservationService';
import { ErrorState } from '@/components/shared/ErrorState';
import { apiErrorMessage } from '@/services/api';
import { useNavigate } from 'react-router-dom';

interface CheckInButtonProps {
  reservationId: string;
  currentStatus: string;
  guestName: string;
}

export function CheckInButton({ reservationId, currentStatus, guestName }: CheckInButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();

  if (currentStatus !== 'reserved') return null;

  const handleCheckIn = async () => {
    setActionError(null);
    try {
      await reservationService.checkIn(reservationId);
      setConfirmOpen(false);
      navigate(0);
    } catch (err) {
      // FE-004: show the backend message (existing ErrorState) instead of failing silently.
      setConfirmOpen(false);
      setActionError(apiErrorMessage(err, ''));
    }
  };

  return (
    <>
      {actionError !== null && <ErrorState description={actionError || undefined} />}
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
