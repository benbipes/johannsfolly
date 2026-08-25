import { useState, useEffect, useRef } from 'react';
import {
  announceRoom,
  clearRoom,
  clearRoomPlayers,
  getActiveRoomPlayers,
  removeRoomPlayerPresence,
  setRoomPlayerPresence,
} from '../useGameSync.js';
import {
  publishNetworkRoomEvent,
  subscribeNetworkRoom,
} from '../networkSync.js';

const MAX_PLAYERS = 10;

export default function RoomLobby({ roomCode, isHost, myPlayerName, onStart, onLeave }) {
  const [names, setNames] = useState(myPlayerName ? [myPlayerName] : ['']);
  const [copied, setCopied] = useState(false);
  // Joiner: track whether the host has started (waiting state)
  const [waiting, setWaiting] = useState(!isHost);
  // Joiner: list of all players in the room (received from host)
  const [allPlayers, setAllPlayers] = useState(myPlayerName ? [myPlayerName] : []);
  const channelRef = useRef(null);

  // Host: announce room creation and keep it open; close on unmount
  useEffect(() => {
    if (!isHost) return;
    const syncRoom = () => announceRoom(roomCode, 'open');
    const closeRoom = () => {
      announceRoom(roomCode, 'closed');
      clearRoom(roomCode);
      clearRoomPlayers(roomCode);
      localStorage.removeItem(`room-players-list:${roomCode}`);
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

  // Joiner: register self in localStorage and network so host can discover them
  useEffect(() => {
    if (isHost || !myPlayerName) return;
    const announce = () => {
      setRoomPlayerPresence(roomCode, myPlayerName);
      try {
        const channel = new BroadcastChannel(`jf:room:${roomCode}`);
        channel.postMessage({ type: 'room_joined', playerName: myPlayerName });
        channel.close();
      } catch { /* ignore */ }
      publishNetworkRoomEvent(roomCode, { type: 'room_joined', playerName: myPlayerName });
    };

    const handleUnload = () => {
      removeRoomPlayerPresence(roomCode, myPlayerName);
      publishNetworkRoomEvent(roomCode, { type: 'room_left', playerName: myPlayerName });
    };

    announce();
    const id = setInterval(announce, 3000);
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      clearInterval(id);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [isHost, roomCode, myPlayerName]);

  // Host: listen for joined players across local BroadcastChannel and cross-device network
  useEffect(() => {
    if (!isHost) return;
    const channel = new BroadcastChannel(`jf:room:${roomCode}`);
    const activeJoinersMap = new Map(); // normName -> { originalName, lastSeen }

    function syncJoiners(directPlayerName = null, isLeft = false) {
      if (isLeft && directPlayerName) {
        activeJoinersMap.delete(directPlayerName.trim().toLowerCase());
      } else if (directPlayerName) {
        activeJoinersMap.set(directPlayerName.trim().toLowerCase(), {
          originalName: directPlayerName.trim(),
          lastSeen: Date.now(),
        });
      }

      const joinedFromStorage = getActiveRoomPlayers(roomCode);
      joinedFromStorage.forEach(name => {
        const norm = name.trim().toLowerCase();
        if (norm) {
          activeJoinersMap.set(norm, {
            originalName: name.trim(),
            lastSeen: Date.now(),
          });
        }
      });

      const now = Date.now();
      const currentStorageNorms = joinedFromStorage.map(n => n.toLowerCase());
      for (const [norm, data] of activeJoinersMap.entries()) {
        if (now - data.lastSeen > 15000 && !currentStorageNorms.includes(norm)) {
          activeJoinersMap.delete(norm);
        }
      }

      setNames(prev => {
        const hostName = prev[0] ?? myPlayerName ?? '';
        const existing = new Set();
        const hostNormalized = hostName.trim().toLowerCase();
        if (hostNormalized) existing.add(hostNormalized);

        const nextJoined = [];
        for (const data of activeJoinersMap.values()) {
          const trimmed = data.originalName;
          const normalized = trimmed.toLowerCase();
          if (!normalized || existing.has(normalized)) continue;
          existing.add(normalized);
          nextJoined.push(trimmed);
          if (nextJoined.length >= MAX_PLAYERS - 1) break;
        }
        const next = [hostName, ...nextJoined];
        localStorage.setItem(`room-players-list:${roomCode}`, JSON.stringify(next));
        try {
          channel.postMessage({ type: 'player_list', players: next });
        } catch { /* ignore */ }
        publishNetworkRoomEvent(roomCode, { type: 'player_list', players: next });
        return next;
      });
    }

    function handleStorage(event) {
      if (!event.key || event.key.startsWith(`room-player:${roomCode}:`)) {
        syncJoiners();
      }
    }

    channel.onmessage = (event) => {
      if (event.data?.type === 'room_joined') {
        syncJoiners(event.data?.playerName, false);
      } else if (event.data?.type === 'room_left') {
        syncJoiners(event.data?.playerName, true);
      }
    };

    // Cross-device network listener for Host
    const unsubscribeNet = subscribeNetworkRoom(roomCode, (event) => {
      if (event?.type === 'room_joined' && event.playerName) {
        syncJoiners(event.playerName, false);
      } else if (event?.type === 'room_left' && event.playerName) {
        syncJoiners(event.playerName, true);
      }
    });

    syncJoiners();
    window.addEventListener('storage', handleStorage);
    const id = setInterval(() => syncJoiners(), 3000);
    return () => {
      channel.close();
      window.removeEventListener('storage', handleStorage);
      clearInterval(id);
      unsubscribeNet();
    };
  }, [isHost, roomCode, myPlayerName]);

  // Joiner: listen for game start and player list updates across local and cross-device network
  useEffect(() => {
    if (isHost) return;
    const readStoredList = () => {
      try {
        const stored = localStorage.getItem(`room-players-list:${roomCode}`);
        if (stored) {
          const list = JSON.parse(stored).filter(Boolean);
          if (list.length > 0) setAllPlayers(list);
        }
      } catch { /* ignore */ }
    };
    readStoredList();

    const channel = new BroadcastChannel(`jf:room:${roomCode}`);
    channelRef.current = channel;
    channel.onmessage = (event) => {
      if (event.data?.type === 'game_state') {
        setWaiting(false); // App will handle the state update and view change
      } else if (event.data?.type === 'player_list' && Array.isArray(event.data.players)) {
        setAllPlayers(event.data.players.filter(Boolean));
      }
    };

    // Cross-device network listener for Joiner
    const unsubscribeNet = subscribeNetworkRoom(roomCode, (event) => {
      if (event?.type === 'game_state') {
        setWaiting(false);
      } else if (event?.type === 'player_list' && Array.isArray(event.players)) {
        setAllPlayers(event.players.filter(Boolean));
      }
    });

    function handleStorage(event) {
      if (!event.key || event.key === `room-players-list:${roomCode}`) {
        readStoredList();
      }
    }
    window.addEventListener('storage', handleStorage);
    const id = setInterval(readStoredList, 2000);
    return () => {
      channel.close();
      window.removeEventListener('storage', handleStorage);
      clearInterval(id);
      unsubscribeNet();
    };
  }, [isHost, roomCode]);

  function updateName(i, val) {
    setNames(prev => {
      const next = prev.map((n, idx) => (idx === i ? val : n));
      try {
        localStorage.setItem(`room-players-list:${roomCode}`, JSON.stringify(next));
        const channel = new BroadcastChannel(`jf:room:${roomCode}`);
        channel.postMessage({ type: 'player_list', players: next });
        channel.close();
        publishNetworkRoomEvent(roomCode, { type: 'player_list', players: next });
      } catch { /* ignore */ }
      return next;
    });
  }

  function handleStart() {
    const filled = names.map(n => n.trim()).filter(Boolean);
    if (filled.length < 1) return;
    // Mark room as closed and clean up storage when game starts
    announceRoom(roomCode, 'closed');
    clearRoom(roomCode);
    clearRoomPlayers(roomCode);
    localStorage.removeItem(`room-players-list:${roomCode}`);
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

  function handleLeave() {
    if (!isHost && myPlayerName) {
      removeRoomPlayerPresence(roomCode, myPlayerName);
      publishNetworkRoomEvent(roomCode, { type: 'room_left', playerName: myPlayerName });
    }
    onLeave();
  }

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

        {allPlayers.length > 0 && (
          <div className="card">
            <p className="section-title" style={{ marginBottom: '0.75rem' }}>Players in Room</p>
            <div className="player-list">
              {allPlayers.map((name, i) => (
                <div className="player-row" key={i} style={{ opacity: 0.9 }}>
                  <span style={{
                    flex: 1,
                    padding: '0.4rem 0.5rem',
                    color: name === myPlayerName ? 'var(--accent)' : 'inherit',
                    fontWeight: name === myPlayerName ? 700 : 400,
                  }}>
                    {name}
                  </span>
                  {i === 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', paddingLeft: '0.25rem', whiteSpace: 'nowrap' }}>host</span>
                  )}
                  {name === myPlayerName && i !== 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent)', paddingLeft: '0.25rem', whiteSpace: 'nowrap' }}>you</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="spacer" />

        <button className="btn-secondary" style={{ width: '100%' }} onClick={handleLeave}>
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
              autoCorrect="off"
              spellCheck={false}
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <p style={{ color: 'var(--accent)', fontSize: '1.05rem', fontWeight: 700, textAlign: 'center', margin: '0.25rem 0' }}>
          Wait until all users have entered the room to click start.
        </p>
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
