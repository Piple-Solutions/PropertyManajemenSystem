import { useEffect, useState } from 'react';
import { ReservationWizard } from './ReservationWizard';
import type { ReservationDraft } from '@/types/reservationDraft.types';
import { buildReservationDraft, saveReservationDraft } from '@/utils/reservationDraft';
import { apiErrorMessage } from '@/services/api';

interface ReservationFormPanelProps {
  id?: string;
  onDone: () => void;
}

/**
 * Content-mode reservation panel (page use + backward compatibility).
 * Modal usages should prefer ReservationWizardModal so the X / overlay /
 * Escape path also goes through the guarded cancel flow.
 */
export function ReservationFormPanel({ id, onDone }: ReservationFormPanelProps) {
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ReservationDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setDraft(null);
    buildReservationDraft(id).then((d) => {
      if (!cancelled) {
        setDraft(d || null);
        setLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) {
        setError(apiErrorMessage(err, 'Failed to load reservation'));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSave = async (next: ReservationDraft) => {
    setSaving(true);
    setError('');
    try {
      await saveReservationDraft(id, next);
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save reservation'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p style={{ color: '#6B7881', fontSize: '14px' }}>Loading reservation...</p>;
  }

  return (
    <>
      {error && <div role="alert" style={{ color: '#C85C5C', fontSize: '14px', marginBottom: '12px' }}>{error}</div>}
      {draft && (
        <ReservationWizard
          key={id || 'new'}
          initialDraft={draft}
          isEdit={!!id}
          excludeReservationId={id}
          saving={saving}
          onSave={handleSave}
          onDiscard={onDone}
        />
      )}
    </>
  );
}
