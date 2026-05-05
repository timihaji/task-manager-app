import React, { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  function toggleMode() {
    setMode(isSignup ? 'signin' : 'signup');
    setError('');
    setInfo('');
    setConfirm('');
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');

    if (isSignup && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      if (isSignup) {
        const { data, error: err } = await signUp(email, password);
        if (err) {
          setError(err.message);
        } else if (data?.session) {
          // Auto-signed-in; AuthProvider will flip the gate.
        } else {
          setInfo('Check your email for a confirmation link, then sign in.');
          setMode('signin');
          setPassword('');
          setConfirm('');
        }
      } else {
        const { error: err } = await signIn(email, password);
        if (err) setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{isSignup ? 'Create account' : 'Sign in'}</h1>

        <div className="auth-field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            className="tax-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="auth-field">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            className="tax-input"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {isSignup && (
          <div className="auth-field">
            <label htmlFor="auth-confirm">Confirm password</label>
            <input
              id="auth-confirm"
              className="tax-input"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        )}

        <button type="submit" className="tb-btn primary" disabled={busy}>
          {busy ? '…' : isSignup ? 'Sign up' : 'Sign in'}
        </button>

        {error && <p className="auth-error">{error}</p>}
        {info && <p className="auth-info">{info}</p>}

        <div className="auth-toggle">
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type="button" onClick={toggleMode}>
            {isSignup ? 'Sign in' : 'Sign up'}
          </button>
        </div>
      </form>
    </div>
  );
}
