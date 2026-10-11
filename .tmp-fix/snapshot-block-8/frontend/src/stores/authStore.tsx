import React, { createContext, useContext, useReducer, useEffect } from 'react';
import authService from '../services/authService';
import { apiErrorMessage } from '../services/api';

interface AuthState {
  user: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string;
}

type AuthAction =
  | { type: 'LOGIN_SUCCESS'; payload: any }
  | { type: 'LOGIN_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'REGISTER_SUCCESS'; payload: any }
  | { type: 'SET_ERROR'; payload: string };

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  error: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return { user: action.payload.user, isAuthenticated: true, isLoading: false, error: '' };
    case 'LOGIN_FAILURE':
      return { user: null, isAuthenticated: false, isLoading: false, error: action.payload };
    case 'LOGOUT':
      return { user: null, isAuthenticated: false, isLoading: false, error: '' };
    case 'REGISTER_SUCCESS':
      return { ...state, user: action.payload, isAuthenticated: true, isLoading: false, error: '' };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: '',
  });

  useEffect(() => {
    let cancelled = false;
    // Session restore is verified against the backend (GET /api/auth/me).
    authService.restoreSession().then((session) => {
      if (cancelled) return;
      if (session) {
        dispatch({ type: 'LOGIN_SUCCESS', payload: session });
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const result = await authService.login(email, password);
      if (result) {
        dispatch({ type: 'LOGIN_SUCCESS', payload: result });
        return true;
      }
      dispatch({ type: 'LOGIN_FAILURE', payload: 'Invalid email or password' });
      return false;
    } catch (err) {
      dispatch({ type: 'LOGIN_FAILURE', payload: apiErrorMessage(err, 'An error occurred during login') });
      return false;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const logout = async () => {
    await authService.logout();
    dispatch({ type: 'LOGOUT' });
  };

  const register = async (name: string, email: string, password: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const result = await authService.register({ name, email, password });
      if (result) {
        dispatch({ type: 'REGISTER_SUCCESS', payload: result.user });
        return true;
      }
      dispatch({ type: 'SET_ERROR', payload: 'Email already registered' });
      return false;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: apiErrorMessage(err, 'Registration failed') });
      return false;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    try {
      const success = await authService.changePassword(
        state.user?.id || '',
        currentPassword,
        newPassword
      );
      return success;
    } catch {
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, register, changePassword, error: state.error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
}

export default AuthContext;
