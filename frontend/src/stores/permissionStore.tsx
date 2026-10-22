import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import authService from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import {
  computeEffectivePermissions,
  getUserPermissionOverride,
} from '../services/userPermissionService';

interface PermissionState {
  permissions: string[];
}

type PermissionAction =
  | { type: 'SET_PERMISSIONS'; payload: string[] };

interface PermissionContextType extends PermissionState {
  hasPermission: (permission: string) => boolean;
  /** Re-resolve effective permissions (e.g. after assignment changes). */
  refreshPermissions: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | null>(null);

function permissionReducer(state: PermissionState, action: PermissionAction): PermissionState {
  switch (action.type) {
    case 'SET_PERMISSIONS':
      return { permissions: action.payload };
    default:
      return state;
  }
}

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(permissionReducer, { permissions: [] });
  const { user } = useAuth();

  const resolveFor = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      dispatch({ type: 'SET_PERMISSIONS', payload: [] });
      return;
    }
    // Role permissions come from the server; user-specific overrides are
    // merged client-side. Effective = (roles ∪ grants) − denies.
    // A server failure leaves the last known permissions untouched.
    const serverPermissions = await authService.getMyPermissions().catch(() => null);
    if (serverPermissions === null) return;
    const override = await getUserPermissionOverride(userId);
    dispatch({
      type: 'SET_PERMISSIONS',
      payload: computeEffectivePermissions(serverPermissions, override),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    resolveFor(user?.id).catch(() => {
      if (!cancelled) dispatch({ type: 'SET_PERMISSIONS', payload: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [user, resolveFor]);

  const refreshPermissions = useCallback(async () => {
    await resolveFor(user?.id);
  }, [user, resolveFor]);

  const hasPermission = (permission: string) => {
    return state.permissions.includes(permission);
  };

  return (
    <PermissionContext.Provider value={{ ...state, hasPermission, refreshPermissions }}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissionContext() {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissionContext must be used within PermissionProvider');
  }
  return context;
}
