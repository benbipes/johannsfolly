import { useState, useEffect, useRef } from 'react';
import {
  announceRoom,
  clearRoom,
  clearRoomPlayers,
  getActiveRoomPlayers,
  removeRoomPlayerPresence,
  setRoomPlayerPresence,
} from '../useGameSync.js';

const MAX_PLAYERS = 10;

export default function RoomLobby({ roomCode, isHost, myPlayerName, onStart, onLeave }) {
  const [names, setNames] = useState(myPlayerName ? [myPlayerName] : ['']);
  const [copied, setCopied] = useState(false);
  // Joiner: track whether the host has started (waiting state)
  const [waiting, setWaiting] = useState(!isHost);
  const channelRef = useRef(null);

  function syncJoinedPlayers(joinedNames) {
    setNames(prev => {
      const hostName = prev[0] ?? '';
      const existing = new Set([hostName.trim().toLowerCase()]);
      const nextJoined = [];
      for (const name of joinedNames) {
        const normalized = name.trim().toLowerCase();
        if (!normalized || existing.has(normalized)) continue;
        existing.add(normalized);
        nextJoined.push(name);
        if (nextJoined.length >= MAX_PLAYERS - 1) break;
      }
      return [hostName, ...nextJoined];
    });
  }

  // Host: announce room creation and keep it open; close on unmount
  useEffect(() => {
    if (!isHost) return;
    const syncRoom = () => announceRoom(roomCode, 'open');
    const closeRoom = () => {
      announceRoom(roomCode, 'closed');
      clearRoom(roomCode);
      clearRoomPlayers(roomCode);
    };
    syncRoom();
    const id = setInterval(syncRoom, 5000);
    window.addEventListener('beforeunload', closeRoom);
    window.addEventListener('pagehide', closeRoom);
    return () => {
      clearInterval(id);
      window.removeEventListener('beforeunload', closeRoom);
      window.removeEventListener('pagehide', closeRoom);
      closeRoom();
    };
  }, [roomCode, isHost]);

  // Joiner: register self in localStorage so host can discover them,
  // and periodically re-announce via BroadcastChannel to handle the case
  // where the host tab wasn't listening when we first joined.
  useEffect(() => {
    if (isHost || !myPlayerName) return;
    const channel = new BroadcastChannel(`jf:room:${roomCode}`);
    const announce = () => {
      setRoomPlayerPresence(roomCode, myPlayerName);
      channel.postMessage({ type: 'room_joined', playerName: myPlayerName });
    };
    const leaveRoom = () => {
      removeRoomPlayerPresence(roomCode, myPlayerName);
      channel.postMessage({ type: 'room_left', playerName: myPlayerName });
    };
    announce();
    const id = setInterval(announce, 5000);
    window.addEventListener('beforeunload', leaveRoom);
    window.addEventListener('pagehide', leaveRoom);
    return () => {
      clearInterval(id);
      window.removeEventListener('beforeunload', leaveRoom);
      window.removeEventListener('pagehide', leaveRoom);
      leaveRoom();
      channel.close();
    };
  }, [isHost, roomCode, myPlayerName]);

  // Host: listen for joined players immediately and fall back to localStorage
  // scanning so late arrivals or refreshed tabs are still discovered.
  useEffect(() => {
    if (!isHost) return;
    const channel = new BroadcastChannel(`jf:room:${roomCode}`);
    function syncJoiners() {
      syncJoinedPlayers(getActiveRoomPlayers(roomCode));
    }
    function handleStorage(event) {
      if (!event.key || event.key.startsWith(`room-player:${roomCode}:`)) {
        syncJoiners();
      }
    }
    channel.onmessage = (event) => {
      if (event.data?.type === 'room_joined' || event.data?.type === 'room_left') {
        syncJoiners();
      }
    };
    syncJoiners();
    window.addEventListener('storage', handleStorage);
    const id = setInterval(syncJoiners, 5000);
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

  function handleStart() {
    const filled = names.map(n => n.trim()).filter(Boolean);
    if (filled.length < 1) return;
    // Mark room as closed and clean up storage when game starts
    announceRoom(roomCode, 'closed');
    clearRoom(roomCode);
    clearRoomPlayers(roomCode);
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
