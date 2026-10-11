import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { ReservationWizard } from './ReservationWizard';
import type { ReservationDraft } from '@/types/reservationDraft.types';
import { buildReservationDraft } from '@/utils/reservationDraft';
import { saveReservationDraft } from '@/utils/reservationDraft';
import { apiErrorMessage } from '@/services/api';

interface ReservationWizardModalProps {
  open: boolean;
  id?: string;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Modal owner for the reservation wizard.
 * The Modal X / overlay / Escape route through the wizard's guarded
 * cancel flow (double confirmation when dirty) via close-request signal.
 */
export function ReservationWizardModal({ open, id, onClose, onSaved }: ReservationWizardModalProps) {
  const [saving, setSaving] = useState(false);
  const [closeSignal, setCloseSignal] = useState(0);
  const [draft, setDraft] = useState<ReservationDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setSaveError('');
    setDraft(null);
    buildReservationDraft(id).then((d) => {
      if (!cancelled) {
        setDraft(d);
        setLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) {
        setLoadError(apiErrorMessage(err, 'Failed to load reservation'));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, open]);

  if (!open) return null;

  const handleSave = async (next: ReservationDraft) => {
    setSaving(true);
    setSaveError('');
    try {
      await saveReservationDraft(id, next);
      onSaved?.();
      onClose();
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Failed to save reservation'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={() => setCloseSignal((s) => s + 1)} title={id ? 'Edit Reservation' : 'Create Reservation'} size="xl">
      {loading && <p style={{ color: '#6B7881', fontSize: '14px' }}>Loading reservation...</p>}
      {loadError && <div role="alert" style={{ color: '#C85C5C', fontSize: '14px' }}>{loadError}</div>}
      {saveError && <div role="alert" style={{ color: '#C85C5C', fontSize: '14px', marginBottom: '12px' }}>{saveError}</div>}
      {draft && (
        <ReservationWizard
          key={id || 'new'}
          initialDraft={draft}
          isEdit={!!id}
          excludeReservationId={id}
          saving={saving}
          onSave={handleSave}
          onDiscard={onClose}
          externalCloseRequest={closeSignal}
        />
      )}
    </Modal>
  );
}
