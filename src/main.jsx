import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider, useAuth } from './auth/AuthProvider.jsx';
import { WorkspaceProvider, useWorkspace } from './lib/WorkspaceProvider.jsx';
import { LoginPage } from './components/LoginPage.jsx';
import './styles.css';

function BootSplash({ message }) {
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, font: '500 13px var(--font)', color: 'var(--t2)' }}>
          {message}
        </p>
      </div>
    </div>
  );
}

function BootError({ error, onRetry }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Couldn’t load your workspace</h1>
        <p className="auth-error" style={{ margin: '0 0 12px' }}>
          {error?.message || 'Unknown error'}
        </p>
        <button type="button" className="tb-btn primary" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}

function WorkspaceGate() {
  const { workspace, loading, error, supabaseDisabled } = useWorkspace();
  // Local-only mode: skip the workspace and render the app with localStorage.
  if (supabaseDisabled) return <App />;
  if (loading || !workspace) {
    if (error) {
      return <BootError error={error} onRetry={() => window.location.reload()} />;
    }
    return <BootSplash message="Loading your workspace…" />;
  }
  return <App />;
}

function Gate() {
  const { session, loading, supabaseDisabled } = useAuth();
  if (loading) return null;
  if (!supabaseDisabled && !session) return <LoginPage />;
  return (
    <WorkspaceProvider>
      <WorkspaceGate />
    </WorkspaceProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <Gate />
  </AuthProvider>
);
