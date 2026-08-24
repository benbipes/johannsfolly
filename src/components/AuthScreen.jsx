import { useState, useEffect } from 'react';
import { register, login, loginWithOAuth, requestPasswordReset, resetPassword } from '../auth.js';

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

  function handleOAuthStart(provider) {
    setError('');
    setMessage('');
    const defaultName = provider === 'Apple' ? 'Apple Player' : 'Google Player';
    const defaultEmail = `${provider.toLowerCase()}_user@${provider.toLowerCase()}.com`;
    const enteredName = window.prompt(`Sign in with ${provider}\nEnter your player display name:`, defaultName);
    if (!enteredName || !enteredName.trim()) return;

    const result = loginWithOAuth(provider, {
      displayName: enteredName.trim(),
      email: defaultEmail,
      id: Math.random().toString(36).slice(2, 9),
    });

    if (result.ok) {
      onAuth(result.user.displayName);
    } else {
      setError(result.error || `Failed to sign in with ${provider}`);
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

        {/* Social Authentication Buttons (shown on Login / Register) */}
        {(mode === 'login' || mode === 'register') && (
          <>
            <div className="social-auth-wrap">
              <button
                type="button"
                className="btn-apple"
                onClick={() => handleOAuthStart('Apple')}
                title="Sign in with Apple ID"
              >
                <svg width="18" height="22" viewBox="0 0 170 170" fill="currentColor" style={{ display: 'inline-block' }}>
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.66-7.79-11.88-14.24-7.05-10.74-12.5-22.75-16.34-36.03-3.84-13.29-5.76-25.68-5.76-37.18 0-14.9 3.65-27.18 10.95-36.85 7.3-9.67 16.48-14.61 27.54-14.83 4.57 0 9.78 1.19 15.63 3.58 5.85 2.39 9.68 3.64 11.49 3.75 1.54 0 5.64-1.35 12.31-4.06 6.67-2.7 12.28-3.9 16.84-3.58 12.82.98 22.84 5.76 30.06 14.34-11.3 6.85-16.85 16.3-16.63 28.36.22 9.57 3.84 17.51 10.86 23.82 7.02 6.31 15.35 10.01 24.99 11.1-2.4 7.28-5.44 14.56-9.13 21.84zM119.22 31.84c0-7.39 2.6-14.15 7.82-20.27 5.21-6.13 11.75-9.98 19.61-11.57.22 1.3.33 2.49.33 3.58 0 7.39-2.73 14.28-8.19 20.67-5.46 6.4-12.07 10.23-19.83 11.49-.33-1.3-.49-2.49-.49-3.58z"/>
                </svg>
                <span>Continue with Apple</span>
              </button>

              <button
                type="button"
                className="btn-google"
                onClick={() => handleOAuthStart('Google')}
                title="Sign in with Google"
              >
                <svg width="18" height="18" viewBox="0 0 48 48" style={{ display: 'inline-block' }}>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>

            <div className="auth-divider">
              <span>or continue with {mode === 'login' ? 'account' : 'email'}</span>
            </div>
          </>
        )}

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
                autoCapitalize="characters"
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




