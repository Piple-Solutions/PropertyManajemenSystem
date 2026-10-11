import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './stores/authStore';
import { PermissionProvider } from './stores/permissionStore';
import { UIProvider } from './stores/uiStore';
import App from './App';
import './styles/globals.css';
import './index.css';
import './styles/auth-split.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <PermissionProvider>
        <UIProvider>
          <App />
        </UIProvider>
      </PermissionProvider>
    </AuthProvider>
  </React.StrictMode>
);
