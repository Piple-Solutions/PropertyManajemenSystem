import React, { createContext, useContext, useReducer } from 'react';

interface UIState {
  isSidebarOpen: boolean;
  isLoading: boolean;
  notifications: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' | 'warning' }>;
  activeModal: string | null;
}

type UIAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'ADD_NOTIFICATION'; payload: { message: string; type: 'success' | 'error' | 'info' | 'warning' } }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'SET_ACTIVE_MODAL'; payload: string | null };

interface UIContextType extends UIState {
  setLoading: (loading: boolean) => void;
  toggleSidebar: () => void;
  addNotification: (message: string, type: UIState['notifications'][0]['type']) => void;
  removeNotification: (id: string) => void;
  setActiveModal: (modal: string | null) => void;
}

const UIContext = createContext<UIContextType | null>(null);

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'TOGGLE_SIDEBAR':
      return { ...state, isSidebarOpen: !state.isSidebarOpen };
    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [...state.notifications, { id: Date.now().toString(), ...action.payload }] };
    case 'REMOVE_NOTIFICATION':
      return { ...state, notifications: state.notifications.filter((n) => n.id !== action.payload) };
    case 'SET_ACTIVE_MODAL':
      return { ...state, activeModal: action.payload };
    default:
      return state;
  }
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(uiReducer, {
    isSidebarOpen: true,
    isLoading: false,
    notifications: [],
    activeModal: null,
  });

  const setLoading = (loading: boolean) => dispatch({ type: 'SET_LOADING', payload: loading });
  const toggleSidebar = () => dispatch({ type: 'TOGGLE_SIDEBAR' });
  const addNotification = (message: string, type: UIState['notifications'][0]['type']) =>
    dispatch({ type: 'ADD_NOTIFICATION', payload: { message, type } });
  const removeNotification = (id: string) => dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
  const setActiveModal = (modal: string | null) => dispatch({ type: 'SET_ACTIVE_MODAL', payload: modal });

  return (
    <UIContext.Provider value={{ ...state, setLoading, toggleSidebar, addNotification, removeNotification, setActiveModal }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within UIProvider');
  }
  return context;
}
