import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import userService from '@/services/userService';
import { UserRoleForm } from '@/components/shared/UserRoleForm';
import '../../styles/admin-responsive.css';

export default function UserRolePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [exists, setExists] = useState<boolean | null>(null);

  useEffect(() => {
    if (!id) {
      setExists(false);
      return;
    }
    let cancelled = false;
    userService.getById(id).then((u) => {
      if (!cancelled) setExists(!!u);
    }).catch(() => {
      if (!cancelled) setExists(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (exists === null) {
    return (
      <div style={{ padding: 'var(--space-xl, 20px)', textAlign: 'center' }}>
        <p style={{ color: '#6B7881' }}>Loading user...</p>
      </div>
    );
  }

  if (!exists) {
    return (
      <div style={{ padding: 'var(--space-xl, 20px)', textAlign: 'center' }}>
        <h2 style={{ color: '#232D36', fontFamily: 'var(--font-family-sans)' }}>User not found</h2>
        <Link to="/dashboard/users" style={{ color: '#97764D', fontWeight: 600 }}>Back to Users</Link>
      </div>
    );
  }

  return (
    <div className="adm-page adm-page--narrow">
      <div className="adm-head">
        <Link to="/dashboard/users" className="adm-backlink"><ArrowLeft size={14} aria-hidden="true" /> Back to Users</Link>
        <h1 className="adm-h1">Assign Role</h1>
      </div>
      <UserRoleForm
        key={id}
        userId={id!}
        onSuccess={() => navigate('/dashboard/users')}
        onCancel={() => navigate('/dashboard/users')}
      />
    </div>
  );
}
