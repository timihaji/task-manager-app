import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider, useAuth } from './auth/AuthProvider.jsx';
import { LoginPage } from './components/LoginPage.jsx';
import './styles.css';

function Gate() {
  const { session, loading, supabaseDisabled } = useAuth();
  if (loading) return null;
  if (!supabaseDisabled && !session) return <LoginPage />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <Gate />
  </AuthProvider>
);
