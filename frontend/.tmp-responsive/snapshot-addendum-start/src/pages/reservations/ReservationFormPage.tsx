import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { ReservationFormPanel } from '@/components/shared/ReservationFormPanel';

export default function ReservationFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  return (
    <div style={{ padding: 'var(--space-xl, 20px)', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <Button variant="outline" onClick={() => navigate('/dashboard/reservations')}><ArrowLeft size={14} aria-hidden="true" /> Back</Button>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', margin: 0 }}>
          {isEdit ? 'Edit Reservation' : 'New Reservation'}
        </h1>
        <div style={{ flex: '1 1 0', minWidth: '24px', maxWidth: '100px' }}></div>
      </div>

      <Card>
        <ReservationFormPanel
          key={id || 'new'}
          id={id}
          onDone={() => navigate('/dashboard/reservations')}
        />
      </Card>
    </div>
  );
}
