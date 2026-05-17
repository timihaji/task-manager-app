import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import MobileApp from './mobile/MobileApp.jsx';
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

// Mobile auto-switch: ?mobile=1 forces mobile, ?mobile=0 forces desktop,
// else picks by viewport width (<=600 → mobile). The result is re-evaluated
// when the viewport crosses the breakpoint so a window resize across the
// edge swaps the shell.
function pickShell() {
  if (typeof window === 'undefined') return 'desktop';
  try {
    const force = new URLSearchParams(window.location.search).get('mobile');
    if (force === '1') return 'mobile';
    if (force === '0') return 'desktop';
  } catch {}
  return window.innerWidth <= 600 ? 'mobile' : 'desktop';
}

function useShell() {
  const [shell, setShell] = useState(() => pickShell());
  useEffect(() => {
    // setTimeout-based debounce so we work in headless previews too —
    // rAF doesn't always fire there. 30ms is short enough to feel instant
    // and long enough to coalesce a rapid resize gesture.
    let timer = null;
    const onResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const next = pickShell();
        setShell(prev => prev === next ? prev : next);
      }, 30);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (shell === 'mobile') {
      document.body.dataset.mobile = '1';
    } else {
      delete document.body.dataset.mobile;
    }
    return () => {};
  }, [shell]);

  return shell;
}

function WorkspaceGate() {
  const { workspace, loading, error, supabaseDisabled } = useWorkspace();
  const shell = useShell();
  const Shell = shell === 'mobile' ? MobileApp : App;
  // key={shell} forces unmount + remount when the shell switches mid-session,
  // so the desktop App's useEffect cleanups (dnd-kit sensors, body classes,
  // window listeners) actually run before mobile mounts.
  if (supabaseDisabled) return <Shell key={shell} />;
  if (loading || !workspace) {
    if (error) {
      return <BootError error={error} onRetry={() => window.location.reload()} />;
    }
    return <BootSplash message="Loading your workspace…" />;
  }
  return <Shell key={shell} />;
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
