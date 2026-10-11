import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { safeReturnTo } from '../utils/returnTo';

export function PublicOnlyRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ fontSize: '24px', color: 'var(--color-brand-700)' }}>Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={safeReturnTo(location.search) ?? '/dashboard'} replace />;
  }

  return <Outlet />;
}
