import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { reservationService } from '@/services/reservationService';
import { ErrorState } from '@/components/shared/ErrorState';
import { apiErrorMessage } from '@/services/api';
import { useNavigate } from 'react-router-dom';

interface CheckOutButtonProps {
  reservationId: string;
  currentStatus: string;
  guestName: string;
}

export function CheckOutButton({ reservationId, currentStatus, guestName }: CheckOutButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();

  if (currentStatus !== 'checked-in') return null;

  const handleCheckOut = async () => {
    setActionError(null);
    try {
      await reservationService.checkOut(reservationId);
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
      <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Check Out</Button>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleCheckOut}
        title="Confirm Check-Out"
        message={`Are you sure you want to check out ${guestName}?`}
        confirmText="Check Out"
      />
    </>
  );
}
