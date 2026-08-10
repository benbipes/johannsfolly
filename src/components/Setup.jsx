import { useState } from 'react';

const MAX_PLAYERS = 10;

export default function Setup({ onStart, solo = false, initialNames = null }) {
  const MIN_PLAYERS = solo ? 1 : 2;
  const [names, setNames] = useState(initialNames ?? (solo ? [''] : ['', '']));

  function updateName(i, val) {
    setNames(prev => prev.map((n, idx) => (idx === i ? val : n)));
  }
  function addPlayer() {
    if (names.length < MAX_PLAYERS) setNames(prev => [...prev, '']);
  }
  function removePlayer(i) {
    if (names.length > MIN_PLAYERS) setNames(prev => prev.filter((_, idx) => idx !== i));
  }
  function handleStart() {
    const filled = names.map(n => n.trim()).filter(Boolean);
    if (filled.length < MIN_PLAYERS) return;
    onStart(filled);
  }

  const filled = names.map(n => n.trim()).filter(Boolean);
  const canStart = filled.length >= MIN_PLAYERS;

  return (
    <div className="screen">
      <div className="setup-header">
        <img src="/logo.png" alt="Johann's Folly" className="app-logo" />
        <p>Enter player {solo ? 'name (1–10 players)' : 'names (2–10 players)'}</p>
      </div>

      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.75rem' }}>Players</p>
        <div className="player-list">
          {names.map((name, i) => (
            <div className="player-row" key={i}>
              <input
                type="text"
                placeholder={`Player ${i + 1}`}
                value={name}
                onChange={e => updateName(i, e.target.value)}
                maxLength={20}
                autoCapitalize="words"
              />
              {names.length > MIN_PLAYERS && (
                <button className="remove-btn" onClick={() => removePlayer(i)} aria-label="Remove">
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {names.length < MAX_PLAYERS && (
          <button className="add-player-btn" style={{ marginTop: '0.75rem' }} onClick={addPlayer}>
            + Add Player
          </button>
        )}
      </div>

      <div className="card" style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>
        <p className="section-title" style={{ marginBottom: '0.5rem' }}>How to play</p>
        <p>Start at <strong style={{color:'var(--text)'}}>20</strong>, work down to <strong style={{color:'var(--accent)'}}>Bull</strong>.</p>
        <p>Hit = advance 1 · Double = +2 · Triple = +3</p>
        <p>All 3 darts score = <strong style={{color:'var(--accent2)'}}>Perfect Throw</strong> → 3 bonus darts!</p>
        <p>First to Bull wins. Tie = playoff!</p>
      </div>

      <div className="spacer" />

      <button className="btn-primary" disabled={!canStart} onClick={handleStart}>
        Start Game
      </button>
    </div>
  );
}
