import { useState, useEffect, useRef } from 'react';
import { announceRoom } from '../useGameSync.js';

const MAX_PLAYERS = 10;

export default function RoomLobby({ roomCode, isHost, myPlayerName, onStart, onLeave }) {
  const [names, setNames] = useState(myPlayerName ? [myPlayerName] : ['']);
  const [copied, setCopied] = useState(false);
  // Joiner: track whether the host has started (waiting state)
  const [waiting, setWaiting] = useState(!isHost);
  const channelRef = useRef(null);

  function mergeJoinedPlayers(joinedNames) {
    if (joinedNames.length === 0) return;
    setNames(prev => {
      const existing = new Set(prev.map(n => n.trim().toLowerCase()));
      const toAdd = joinedNames.filter(n => !existing.has(n.trim().toLowerCase()));
      if (toAdd.length === 0) return prev;
      return [...prev, ...toAdd].slice(0, MAX_PLAYERS);
    });
  }

  // Host: announce room creation and keep it open; close on unmount
  useEffect(() => {
    if (!isHost) return;
    announceRoom(roomCode, 'open');
    return () => announceRoom(roomCode, 'closed');
  }, [roomCode, isHost]);

  // Joiner: register self in localStorage so host can discover them,
  // and periodically re-announce via BroadcastChannel to handle the case
  // where the host tab wasn't listening when we first joined.
  useEffect(() => {
    if (isHost || !myPlayerName) return;
    localStorage.setItem(`room-player:${roomCode}:${myPlayerName}`, '1');
    const channel = new BroadcastChannel(`jf:room:${roomCode}`);
    const announce = () => channel.postMessage({ type: 'room_joined', playerName: myPlayerName });
    announce();
    const id = setInterval(announce, 2000);
    return () => {
      clearInterval(id);
      channel.postMessage({ type: 'room_left', playerName: myPlayerName });
      channel.close();
      localStorage.removeItem(`room-player:${roomCode}:${myPlayerName}`);
    };
  }, [isHost, roomCode, myPlayerName]);

  // Host: listen for joined players immediately and fall back to localStorage
  // scanning so late arrivals or refreshed tabs are still discovered.
  useEffect(() => {
    if (!isHost) return;
    const channel = new BroadcastChannel(`jf:room:${roomCode}`);
    function syncJoiners() {
      const prefix = `room-player:${roomCode}:`;
      const joined = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          joined.push(key.slice(prefix.length));
        }
      }
      mergeJoinedPlayers(joined);
    }
    function handleStorage(event) {
      if (!event.key || event.key.startsWith(`room-player:${roomCode}:`)) {
        syncJoiners();
      }
    }
    channel.onmessage = (event) => {
      if (event.data?.type === 'room_joined' && event.data.playerName) {
        mergeJoinedPlayers([event.data.playerName]);
      }
    };
    syncJoiners();
    window.addEventListener('storage', handleStorage);
    const id = setInterval(syncJoiners, 2000);
    return () => {
      channel.close();
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
    // Mark room as closed and clean up storage when game starts
    announceRoom(roomCode, 'closed');
    localStorage.removeItem(`room:${roomCode}`);
    const prefix = `room-player:${roomCode}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) localStorage.removeItem(key);
    }
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
            (others join using the room code)
          </span>
        </p>
        <div className="player-list">
          {/* Host name — editable */}
          <div className="player-row" key="host">
            <input
              type="text"
              placeholder="Your name"
              value={names[0] ?? ''}
              onChange={e => updateName(0, e.target.value)}
              maxLength={20}
              autoCapitalize="words"
            />
          </div>
          {/* Joined players — read-only */}
          {names.slice(1).map((name, i) => (
            <div className="player-row" key={i + 1} style={{ opacity: 0.85 }}>
              <input
                type="text"
                value={name}
                readOnly
                style={{ cursor: 'default', color: 'var(--accent)' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', paddingLeft: '0.25rem', whiteSpace: 'nowrap' }}>joined</span>
            </div>
          ))}
        </div>
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
