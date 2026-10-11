import { useNavigate, useParams } from 'react-router-dom';
import { RoleForm } from '@/components/shared/RoleForm';
import '../../styles/admin-responsive.css';

export default function RoleFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  return (
    <div className="adm-page adm-page--narrow">
      <h1 className="adm-h1" style={{ marginBottom: '16px' }}>{isEdit ? 'Edit Role' : 'Create Role'}</h1>
      <RoleForm
        key={id || 'new'}
        id={id}
        onSuccess={() => navigate('/dashboard/roles')}
        onCancel={() => navigate('/dashboard/roles')}
      />
    </div>
  );
}
