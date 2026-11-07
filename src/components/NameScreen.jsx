import { useEffect, useState } from 'react';
import { savePlayerName } from '../auth.js';
import { getLeaderboard, requestLeaderboardSync } from '../leaderboard.js';
import logoImg from '../assets/logo.png';

function getKnownNames() {
  return getLeaderboard().map(entry => entry.name).sort((a, b) => a.localeCompare(b));
}

export default function NameScreen({ onDone }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [knownNames, setKnownNames] = useState(getKnownNames);

  useEffect(() => {
    requestLeaderboardSync();
    const id = setInterval(() => setKnownNames(getKnownNames()), 2000);
    return () => clearInterval(id);
  }, []);

  function choose(input) {
    const result = savePlayerName(input);
    if (result.ok) {
      onDone(result.name);
    } else {
      setError(result.error);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    choose(name);
  }

  return (
    <div className="screen">
      <div className="setup-header">
        <img src={logoImg} alt="Johann's Folly" className="app-logo" />
      </div>

      <div className="card">
        {knownNames.length > 0 && (
          <>
            <p className="section-title" style={{ marginBottom: '0.85rem' }}>Tap your name</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {knownNames.map(knownName => (
                <button
                  key={knownName}
                  type="button"
                  className="btn-secondary"
                  style={{ width: '100%' }}
                  onClick={() => choose(knownName)}
                >
                  👤 {knownName}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="section-title" style={{ marginBottom: '0.85rem' }}>
          {knownNames.length > 0 ? 'New player?' : 'Enter your name'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Your name"
            aria-label="Your name"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            maxLength={20}
            autoCapitalize="words"
            autoComplete="off"
          />

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0.25rem 0' }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={!name.trim()}>
            Let's Play
          </button>
        </form>
      </div>
    </div>
  );
}
