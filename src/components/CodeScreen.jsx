import { useState } from 'react';
import { tryGroupCode } from '../groupCode.js';
import logoImg from '../assets/logo.png';

export default function CodeScreen({ onUnlock }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (await tryGroupCode(code)) {
      onUnlock();
    } else {
      setError("That code isn't right. Check with a friend.");
    }
  }

  return (
    <div className="screen">
      <div className="setup-header">
        <img src={logoImg} alt="Johann's Folly" className="app-logo" />
      </div>

      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.85rem' }}>Enter the group code</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Group code"
            aria-label="Group code"
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            style={{ letterSpacing: '0.1em', fontWeight: 700 }}
          />

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0.25rem 0' }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={!code.trim()}>
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
