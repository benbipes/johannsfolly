import { useState, useEffect, useRef } from 'react';

const MAX_PLAYERS = 10;

export default function RoomLobby({ roomCode, isHost, myPlayerName, onStart, onLeave }) {
  const [names, setNames] = useState(['']);
  const [copied, setCopied] = useState(false);
  // Joiner: track whether the host has started (waiting state)
  const [waiting, setWaiting] = useState(!isHost);
  const channelRef = useRef(null);

  // Host: register this room in localStorage
  useEffect(() => {
    if (!isHost) return;
    const room = { code: roomCode, players: names, createdAt: Date.now() };
    localStorage.setItem(`room:${roomCode}`, JSON.stringify(room));
  }, [roomCode, isHost, names]);

  // Joiner: register self in localStorage so host can discover them
  useEffect(() => {
    if (isHost || !myPlayerName) return;
    localStorage.setItem(`room-player:${roomCode}:${myPlayerName}`, '1');
    return () => {
      localStorage.removeItem(`room-player:${roomCode}:${myPlayerName}`);
    };
  }, [isHost, roomCode, myPlayerName]);

  // Host: poll localStorage every 2 s to pick up newly joined players
  useEffect(() => {
    if (!isHost) return;
    function syncJoiners() {
      const prefix = `room-player:${roomCode}:`;
      const joined = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          joined.push(key.slice(prefix.length));
        }
      }
      if (joined.length === 0) return;
      setNames(prev => {
        const existing = new Set(prev.map(n => n.trim().toLowerCase()));
        const toAdd = joined.filter(n => !existing.has(n.trim().toLowerCase()));
        if (toAdd.length === 0) return prev;
        const merged = [...prev, ...toAdd].slice(0, MAX_PLAYERS);
        return merged;
      });
    }
    function handleStorage(event) {
      if (!event.key || event.key.startsWith(`room-player:${roomCode}:`)) {
        syncJoiners();
      }
    }
    syncJoiners();
    window.addEventListener('storage', handleStorage);
    const id = setInterval(syncJoiners, 2000);
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(id);
    };
  }, [isHost, roomCode]);

  // Joiner: listen for game start via BroadcastChannel
  // (actual game state reception handled in App via useGameSync;
  //  here we just wait and show status)
  useEffect(() => {
    if (isHost) return;
    const channel = new BroadcastChannel(`jf:room:${roomCode}`);
    channelRef.current = channel;
    channel.onmessage = (event) => {
      if (event.data?.type === 'game_state') {
        setWaiting(false); // App will handle the state update and view change
      }
    };
    return () => channel.close();
  }, [isHost, roomCode]);

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
    // Clean up room and joiner keys from storage when game starts
    localStorage.removeItem(`room:${roomCode}`);
    const prefix = `room-player:${roomCode}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) localStorage.removeItem(key);
    }
    // Pass first player name as host name if not already set
    const hostName = filled[0];
    onStart(filled, hostName);
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

  // ── Joiner waiting screen ─────────────────────────────────────
  if (!isHost) {
    return (
      <div className="screen">
        <div className="setup-header">
          <img src="/logo.png" alt="Johann's Folly" className="app-logo" />
        </div>

        <div className="card room-code-card">
          <p className="section-title" style={{ marginBottom: '0.5rem' }}>Room Code</p>
          <div className="room-code-display">{roomCode}</div>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⏳</div>
          <h2 style={{ marginBottom: '0.5rem' }}>You've joined!</h2>
          {myPlayerName && (
            <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              Playing as: {myPlayerName}
            </p>
          )}
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {waiting
              ? 'Waiting for the host to start the game…'
              : 'Game is starting!'}
          </p>
        </div>

        <div className="spacer" />

        <button className="btn-secondary" style={{ width: '100%' }} onClick={onLeave}>
          ← Leave Room
        </button>
      </div>
    );
  }

  // ── Host screen ───────────────────────────────────────────────
  return (
    <div className="screen">
      <div className="setup-header">
        <img src="/logo.png" alt="Johann's Folly" className="app-logo" />
        <p>Share the room code so others can join on their own device</p>
      </div>

      <div className="card room-code-card">
        <p className="section-title" style={{ marginBottom: '0.5rem' }}>Room Code</p>
        <div className="room-code-display">{roomCode}</div>
        <button className="btn-secondary" style={{ width: '100%', marginTop: '0.75rem' }} onClick={handleCopy}>
          {copied ? '✓ Copied!' : '📋 Share Code'}
        </button>
      </div>

      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.75rem' }}>
          Players
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8rem', marginLeft: '0.5rem' }}>
            (joined players appear automatically)
          </span>
        </p>
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
