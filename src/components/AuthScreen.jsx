import { useState, useRef } from 'react';
import { register, login } from '../auth.js';

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const pinRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  function handlePinChange(i, val) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = pin.map((d, idx) => (idx === i ? digit : d));
    setPin(next);
    setError('');
    if (digit && i < 3) pinRefs[i + 1].current?.focus();
    if (!digit && i > 0) pinRefs[i - 1].current?.focus();
  }

  function handlePinKeyDown(i, e) {
    if (e.key === 'Backspace' && !pin[i] && i > 0) {
      pinRefs[i - 1].current?.focus();
    }
  }

  function handleSubmit() {
    const pinStr = pin.join('');
    const result = mode === 'register'
      ? register(username, pinStr)
      : login(username, pinStr);

    if (result.ok) {
      onAuth(username.trim());
    } else {
      setError(result.error);
    }
  }

  function switchMode() {
    setMode(m => (m === 'login' ? 'register' : 'login'));
    setError('');
    setPin(['', '', '', '']);
  }

  const pinFilled = pin.every(d => d !== '');

  return (
    <div className="screen">
      <div className="setup-header">
        <img src="/logo.png" alt="Johann's Folly" className="app-logo" />
      </div>

      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.75rem' }}>
          {mode === 'login' ? 'Login' : 'Create Account'}
        </p>

        <div className="player-list" style={{ marginBottom: '0.75rem' }}>
          <div className="player-row">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              maxLength={20}
              autoCapitalize="words"
              autoComplete="username"
            />
          </div>
        </div>

        <p className="section-title" style={{ marginBottom: '0.5rem' }}>4-Digit PIN</p>
        <div className="pin-row" style={{ marginBottom: '0.75rem' }}>
          {pin.map((d, i) => (
            <input
              key={i}
              ref={pinRefs[i]}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handlePinChange(i, e.target.value)}
              onKeyDown={e => handlePinKeyDown(i, e)}
              className="pin-digit"
              autoComplete="current-password"
            />
          ))}
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            {error}
          </p>
        )}

        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!username.trim() || !pinFilled}
        >
          {mode === 'login' ? '🔑 Login' : '✅ Register'}
        </button>

        <button
          className="btn-secondary"
          style={{ width: '100%', marginTop: '0.5rem' }}
          onClick={switchMode}
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Login'}
        </button>
      </div>
    </div>
  );
}
