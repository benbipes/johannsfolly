import { useState, useEffect } from 'react';

const MAX_PLAYERS = 10;

export default function RoomLobby({ roomCode, onStart, onLeave }) {
  const [names, setNames] = useState(['']);
  const [copied, setCopied] = useState(false);

  // Keep localStorage in sync whenever names change
  useEffect(() => {
    const room = { code: roomCode, players: names, createdAt: Date.now() };
    localStorage.setItem(`room:${roomCode}`, JSON.stringify(room));
  }, [roomCode, names]);

  function updateName(i, val) {
    setNames(prev => prev.map((n, idx) => (idx === i ? val : n)));
  }
  function addPlayer() {
    if (names.length < MAX_PLAYERS) setNames(prev => [...prev, '']);
  }
  function removePlayer(i) {
    if (names.length > 1) setNames(prev => prev.filter((_, idx) => idx !== i));
  }

  function handleStart() {
    const filled = names.map(n => n.trim()).filter(Boolean);
    if (filled.length < 1) return;
    // Clean up room from storage when game starts
    localStorage.removeItem(`room:${roomCode}`);
    onStart(filled);
  }

  async function handleCopy() {
    const shareText = `Join my Johann's Folly game! Room code: ${roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Johann's Folly", text: shareText });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  const filled = names.map(n => n.trim()).filter(Boolean);
  const canStart = filled.length >= 1;

  return (
    <div className="screen">
      <div className="setup-header">
        <img src="/logo.png" alt="Johann's Folly" className="app-logo" />
        <p>Share the room code so others can join on another device</p>
      </div>

      <div className="card room-code-card">
        <p className="section-title" style={{ marginBottom: '0.5rem' }}>Room Code</p>
        <div className="room-code-display">{roomCode}</div>
        <button className="btn-secondary" style={{ width: '100%', marginTop: '0.75rem' }} onClick={handleCopy}>
          {copied ? '✓ Copied!' : '📋 Share Code'}
        </button>
      </div>

      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.75rem' }}>Players (enter all names here)</p>
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
              {names.length > 1 && (
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

      <div className="spacer" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button className="btn-primary" disabled={!canStart} onClick={handleStart}>
          Start Game
        </button>
        <button className="btn-secondary" style={{ width: '100%' }} onClick={onLeave}>
          ← Back
        </button>
      </div>
    </div>
  );
}
