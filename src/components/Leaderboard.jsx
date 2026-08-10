import { useState, useEffect } from 'react';
import { getLeaderboard, clearLeaderboard } from '../leaderboard.js';

function fmt(n, decimals = 1) {
  return Number.isFinite(n) ? n.toFixed(decimals) : '—';
}

function relativeDate(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Leaderboard({ onClose }) {
  const [entries, setEntries] = useState([]);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setEntries(getLeaderboard());
  }, []);

  function handleClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearLeaderboard();
    setEntries([]);
    setConfirmClear(false);
  }

  return (
    <div className="screen">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <h2 style={{ flex: 1, color: 'var(--accent)' }}>🏆 Leaderboard</h2>
        <button
          className="btn-secondary"
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
          onClick={onClose}
        >
          ✕ Close
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</p>
          <p style={{ color: 'var(--muted)' }}>No games recorded yet.</p>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Stats are saved after each completed game.
          </p>
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2.5rem 3rem 3.5rem 3.5rem',
            gap: '0.25rem',
            padding: '0 0.25rem',
          }}>
            <span className="section-title">Player</span>
            <span className="section-title" style={{ textAlign: 'center' }}>Wins</span>
            <span className="section-title" style={{ textAlign: 'center' }}>MPR</span>
            <span className="section-title" style={{ textAlign: 'center' }}>Avg Rds</span>
            <span className="section-title" style={{ textAlign: 'right' }}>Last Game</span>
          </div>

          <div className="scoreboard-grid">
            {entries.map((entry, idx) => (
              <div key={entry.name} className="score-row" style={{ flexDirection: 'column', gap: '0.2rem' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 2.5rem 3rem 3.5rem 3.5rem',
                  gap: '0.25rem',
                  width: '100%',
                  alignItems: 'center',
                }}>
                  <span className="score-name">
                    {idx === 0 && entries[0].wins > 0 ? '🥇 ' : idx === 1 && entries[1]?.wins > 0 ? '🥈 ' : idx === 2 && entries[2]?.wins > 0 ? '🥉 ' : ''}
                    {entry.name}
                  </span>
                  <span style={{ textAlign: 'center', fontWeight: 800, color: 'var(--accent)' }}>
                    {entry.wins}
                  </span>
                  <span style={{ textAlign: 'center', color: 'var(--text)' }}>
                    {fmt(entry.avgMPR)}
                  </span>
                  <span style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {fmt(entry.avgRounds)}
                  </span>
                  <span style={{ textAlign: 'right', color: 'var(--muted)', fontSize: '0.8rem' }}>
                    {entry.lastGame ? relativeDate(entry.lastGame.date) : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                  <span>{entry.games} game{entry.games !== 1 ? 's' : ''}</span>
                  {entry.lastGame && (
                    <span>· last game: {entry.lastGame.won ? <span style={{ color: 'var(--accent2)' }}>Win 🏆</span> : 'Loss'} in {entry.lastGame.rounds} round{entry.lastGame.rounds !== 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
        <button
          className={confirmClear ? 'btn-danger' : 'btn-secondary'}
          style={{ width: '100%', fontSize: '0.85rem' }}
          onClick={handleClear}
        >
          {confirmClear ? '⚠️ Tap again to confirm reset' : '🗑️ Reset Leaderboard'}
        </button>
        {confirmClear && (
          <button
            className="btn-secondary"
            style={{ width: '100%', fontSize: '0.85rem', marginTop: '0.5rem' }}
            onClick={() => setConfirmClear(false)}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
