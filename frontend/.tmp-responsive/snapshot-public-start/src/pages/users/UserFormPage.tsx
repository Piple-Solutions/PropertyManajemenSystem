import { useNavigate, useParams } from 'react-router-dom';
import { UserForm } from '@/components/shared/UserForm';
import '../../styles/admin-responsive.css';

export default function UserFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  return (
    <div className="adm-page adm-page--narrow">
      <h1 className="adm-h1" style={{ marginBottom: '16px' }}>{isEdit ? 'Edit User' : 'Create User'}</h1>
      <UserForm
        key={id || 'new'}
        id={id}
        onSuccess={() => navigate('/dashboard/users')}
        onCancel={() => navigate('/dashboard/users')}
      />
    </div>
  );
}
