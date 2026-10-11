import { useNavigate, useParams, Link } from 'react-router-dom';
import { RoomForm } from '@/components/shared/RoomForm';

export default function RoomFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  return (
    <div style={{ padding: 'var(--space-xl, 20px)', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <Link to="/dashboard/rooms" style={{ color: '#97764D', textDecoration: 'none', fontSize: '14px' }}>← Back to Rooms</Link>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', margin: 0 }}>
          {isEdit ? 'Edit Room' : 'New Room'}
        </h1>
      </div>

      <RoomForm
        key={id || 'new'}
        id={id}
        onSuccess={() => navigate('/dashboard/rooms')}
        onCancel={() => navigate('/dashboard/rooms')}
      />
    </div>
  );
}
