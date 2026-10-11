import { useNavigate, useParams, Link } from 'react-router-dom';
import { RoomTypeForm } from '@/components/shared/RoomTypeForm';

export default function RoomTypeFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  return (
    <div style={{ padding: 'var(--space-xl, 20px)', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <Link to="/dashboard/room-types" style={{ color: '#97764D', textDecoration: 'none', fontSize: '14px' }}>← Back to Room Types</Link>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', margin: 0 }}>
          {isEdit ? 'Edit Room Type' : 'New Room Type'}
        </h1>
      </div>

      <RoomTypeForm
        key={id || 'new'}
        id={id}
        onSuccess={() => navigate('/dashboard/room-types')}
        onCancel={() => navigate('/dashboard/room-types')}
      />
    </div>
  );
}
