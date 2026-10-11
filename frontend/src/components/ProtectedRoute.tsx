import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Loading } from './shared/Loading';
import { PMSLayout } from '../layouts/PMSLayout';
import { loginPathFor } from '../utils/returnTo';

interface ProtectedRouteProps {
  fallbackPath?: string;
}

export function ProtectedRoute({ fallbackPath = '/login' }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setRedirecting(true);
      navigate(loginPathFor(location, fallbackPath), { replace: true });
    }
    // `location` is read once at the moment the session ends (returnTo).
  }, [isAuthenticated, isLoading, navigate, fallbackPath]);

  if (isLoading) {
    return <Loading />;
  }

  if (redirecting || !isAuthenticated) {
    return null;
  }

  return <PMSLayout />;
}
