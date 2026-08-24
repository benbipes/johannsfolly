import { useState } from 'react';
import { register, login } from '../auth.js';

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  function handleSubmit(e) {
    if (e) e.preventDefault();
    setError('');

    if (mode === 'register') {
      if (!displayName.trim()) {
        setError('Please enter a display name for the scoreboard.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      const result = register(email, password, displayName);
      if (result.ok) {
        onAuth(result.user.displayName);
      } else {
        setError(result.error);
      }
    } else {
      const result = login(email, password);
      if (result.ok) {
        onAuth(result.user.displayName);
      } else {
        setError(result.error);
      }
    }
  }

  function switchMode() {
    setMode(m => (m === 'login' ? 'register' : 'login'));
    setError('');
    setPassword('');
    setConfirmPassword('');
  }

  const isFormValid = mode === 'register'
    ? email.trim() && displayName.trim() && password.length >= 6 && confirmPassword.length >= 6
    : email.trim() && password.length > 0;

  return (
    <div className="screen">
      <div className="setup-header">
        <img src="/logo.png" alt="Johann's Folly" className="app-logo" />
      </div>

      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.75rem' }}>
          {mode === 'login' ? 'Login with Email' : 'Create Account'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {mode === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
                Player Display Name
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Johann or DartMaster"
                value={displayName}
                onChange={e => { setDisplayName(e.target.value); setError(''); }}
                maxLength={20}
                autoCapitalize="words"
                autoComplete="name"
                required
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
              Email Address
            </label>
            <input
              type="email"
              className="form-input"
              placeholder="name@example.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              inputMode="email"
              required
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                Password {mode === 'register' ? '(min 6 chars)' : ''}
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                style={{ background: 'transparent', color: 'var(--muted)', padding: 0, fontSize: '0.75rem', textDecoration: 'underline' }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
            />
          </div>

          {mode === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                autoComplete="new-password"
                required
              />
            </div>
          )}

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0.25rem 0' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ marginTop: '0.5rem' }}
            disabled={!isFormValid}
          >
            {mode === 'login' ? '🔑 Login' : '✅ Create Account'}
          </button>
        </form>

        <button
          type="button"
          className="btn-secondary"
          style={{ width: '100%', marginTop: '0.75rem' }}
          onClick={switchMode}
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Login'}
        </button>
      </div>
    </div>
  );
}

