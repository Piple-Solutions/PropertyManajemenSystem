import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Loading } from './shared/Loading';
import { PMSLayout } from '../layouts/PMSLayout';

interface ProtectedRouteProps {
  fallbackPath?: string;
}

export function ProtectedRoute({ fallbackPath = '/login' }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setRedirecting(true);
      navigate(fallbackPath, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, fallbackPath]);

  if (isLoading) {
    return <Loading />;
  }

  if (redirecting || !isAuthenticated) {
    return null;
  }

  return <PMSLayout />;
}
