import { useState, useEffect } from 'react';
import { register, login, requestPasswordReset, resetPassword } from '../auth.js';

export default function AuthScreen({ onAuth }) {
  // Check URL query parameters for reset link
  const [mode, setMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('reset_token')) return 'reset';
    }
    return 'register'; // 'register' | 'login' | 'forgot' | 'reset'
  });

  const [identifier, setIdentifier] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('email') || '';
    }
    return '';
  });

  const [token, setToken] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('reset_token') || '';
    }
    return '';
  });

  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('reset_token')) {
        setMode('reset');
        setToken(params.get('reset_token') || '');
        if (params.get('email')) setIdentifier(params.get('email'));
      }
    }
  }, []);

  function handleSubmit(e) {
    if (e) e.preventDefault();
    setError('');
    setMessage('');

    if (mode === 'register') {
      if (!displayName.trim()) {
        setError('Please enter a display name for the scoreboard.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      const result = register(identifier, password, displayName);
      if (result.ok) {
        onAuth(result.user.displayName);
      } else {
        setError(result.error);
      }
    } else if (mode === 'login') {
      const result = login(identifier, password);
      if (result.ok) {
        onAuth(result.user.displayName);
      } else {
        setError(result.error);
      }
    } else if (mode === 'forgot') {
      const result = requestPasswordReset(identifier);
      if (result.ok) {
        setResetSent(true);
        setMessage(`Password reset link and code sent to ${result.email}!`);
      } else {
        setError(result.error);
      }
    } else if (mode === 'reset') {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      const result = resetPassword(identifier, token, password);
      if (result.ok) {
        // Clear reset token from URL
        if (typeof window !== 'undefined' && window.history?.replaceState) {
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }
        onAuth(result.user.displayName);
      } else {
        setError(result.error);
      }
    }
  }

  function switchMode() {
    setMode(m => (m === 'login' ? 'register' : 'login'));
    setError('');
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  }

  const isFormValid = () => {
    if (mode === 'register') {
      return identifier.trim() && displayName.trim() && password.length >= 6 && confirmPassword.length >= 6;
    }
    if (mode === 'login') {
      return identifier.trim() && password.length > 0;
    }
    if (mode === 'forgot') {
      return identifier.trim().length > 0;
    }
    if (mode === 'reset') {
      return identifier.trim() && token.trim().length >= 4 && password.length >= 6 && confirmPassword.length >= 6;
    }
    return false;
  };

  return (
    <div className="screen">
      <div className="setup-header">
        <img src="/logo.png" alt="Johann's Folly" className="app-logo" />
      </div>

      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.85rem' }}>
          {mode === 'register' && 'Create Account'}
          {mode === 'login' && 'Sign In'}
          {mode === 'forgot' && 'Reset Password'}
          {mode === 'reset' && 'Set New Password'}
        </p>

        {/* Forgot Password Helper Text */}
        {mode === 'forgot' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem', lineHeight: '1.4' }}>
            Enter your username or registered email. We will send a secure password reset link to your email address.
          </p>
        )}

        {/* Reset Password Helper Text */}
        {mode === 'reset' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem', lineHeight: '1.4' }}>
            Enter the reset code sent to your email along with your new password.
          </p>
        )}

        {/* Forms */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {mode === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
                Player Display Name (Username)
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Johann or DartMaster"
                value={displayName}
                onChange={e => { setDisplayName(e.target.value); setError(''); setMessage(''); }}
                maxLength={20}
                autoCapitalize="words"
                autoComplete="name"
                required
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
              {mode === 'register' ? 'Email Address' : 'Username or Email Address'}
            </label>
            <input
              type={mode === 'register' ? 'email' : 'text'}
              className="form-input"
              placeholder={mode === 'register' ? 'name@example.com' : 'e.g. Johann or name@example.com'}
              value={identifier}
              onChange={e => { setIdentifier(e.target.value); setError(''); setMessage(''); }}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete={mode === 'register' ? 'email' : 'username'}
              inputMode={mode === 'register' ? 'email' : 'text'}
              required
            />
          </div>

          {mode === 'reset' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
                Reset Code (from email)
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 6-character code"
                value={token}
                onChange={e => { setToken(e.target.value.toUpperCase()); setError(''); setMessage(''); }}
                maxLength={8}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                style={{ letterSpacing: '0.1em', fontWeight: 700 }}
                required
              />
            </div>
          )}

          {(mode === 'register' || mode === 'login' || mode === 'reset') && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {mode === 'reset' ? 'New Password (min 6 chars)' : `Password ${mode === 'register' ? '(min 6 chars)' : ''}`}
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
                onChange={e => { setPassword(e.target.value); setError(''); setMessage(''); }}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>
          )}

          {(mode === 'register' || mode === 'reset') && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
                Confirm {mode === 'reset' ? 'New ' : ''}Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setError(''); setMessage(''); }}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>
          )}

          {mode === 'login' && (
            <div style={{ textAlign: 'right', marginTop: '-0.25rem' }}>
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); setMessage(''); setResetSent(false); }}
                style={{ background: 'transparent', color: 'var(--accent)', fontSize: '0.8rem', padding: 0, textDecoration: 'underline', border: 'none', cursor: 'pointer' }}
              >
                Forgot / Reset Password?
              </button>
            </div>
          )}

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0.25rem 0' }}>
              {error}
            </p>
          )}

          {message && (
            <div style={{ background: 'var(--surface2)', padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: '0.85rem', margin: '0.25rem 0' }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ marginTop: '0.5rem' }}
            disabled={!isFormValid()}
          >
            {mode === 'register' && '✅ Create Account'}
            {mode === 'login' && '🔑 Sign In'}
            {mode === 'forgot' && '📨 Send Reset Link'}
            {mode === 'reset' && '🔒 Update Password & Sign In'}
          </button>
        </form>

        {mode === 'forgot' && resetSent && (
          <button
            type="button"
            className="btn-secondary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            onClick={() => { setMode('reset'); setError(''); setMessage(''); }}
          >
            🔑 Enter Reset Code & Set Password →
          </button>
        )}

        {(mode === 'forgot' || mode === 'reset') ? (
          <button
            type="button"
            className="btn-secondary"
            style={{ width: '100%', marginTop: '0.75rem' }}
            onClick={() => { setMode('login'); setError(''); setMessage(''); }}
          >
            ← Back to Sign In
          </button>
        ) : (
          <button
            type="button"
            className="btn-secondary"
            style={{ width: '100%', marginTop: '0.75rem' }}
            onClick={switchMode}
          >
            {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign In'}
          </button>
        )}
      </div>
    </div>
  );
}




