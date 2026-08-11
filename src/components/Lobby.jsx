import { useState, useEffect, useRef } from 'react';
import { getOpenRooms } from '../useGameSync.js';
import { getLoggedUsers } from '../auth.js';

export default function Lobby({ onCreateRoom, onJoinRoom, onSolo, loggedInUser, onLogout, onShowLeaderboard }) {
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [availableRooms, setAvailableRooms] = useState(() => getOpenRooms());
  const [loggedUsers, setLoggedUsers] = useState(() => getLoggedUsers());
  const channelRef = useRef(null);

  // Listen for room announcements from other tabs
  useEffect(() => {
    const channel = new BroadcastChannel('jf:lobby');
    channelRef.current = channel;
    const syncState = () => {
      setAvailableRooms(getOpenRooms());
      setLoggedUsers(getLoggedUsers());
    };
    channel.onmessage = syncState;
    // Also refresh on storage events (same browser, different tab)
    function onStorage(e) {
      if (e.key && (e.key.startsWith('room:') || e.key.startsWith('jf:logged-user:'))) {
        syncState();
      }
    }
    syncState();
    const id = setInterval(syncState, 5000);
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(id);
      channel.close();
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const [joinError, setJoinError] = useState('');

  function handleCreate() {
    onCreateRoom();
  }

  function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) {
      setJoinError('Room code must be 4 characters.');
      return;
    }
    setJoinError('');
    onJoinRoom(code);
  }

  function handleJoinRoom(code) {
    setError('');
    onJoinRoom(code);
  }

  return (
    <div className="screen">
      <div className="setup-header">
        <img src="/logo.png" alt="Johann's Folly" className="app-logo" />
        {loggedInUser && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>👤 {loggedInUser}</span>
            <button
              className="btn-secondary"
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
              onClick={onLogout}
            >
              Logout
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.75rem' }}>Logged Users</p>
        {loggedUsers.length > 0 ? (
          <div className="player-list">
            {loggedUsers.map((name) => (
              <div className="player-row" key={name} style={{ opacity: 0.9 }}>
                <span style={{ flex: 1, padding: '0.4rem 0.5rem', color: 'var(--accent)' }}>
                  👤 {name}
                </span>
                {name === loggedInUser && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', paddingLeft: '0.25rem', whiteSpace: 'nowrap' }}>
                    you
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No logged users found.</p>
        )}
      </div>

      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.75rem' }}>Create a Room</p>
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{error}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button className="btn-primary" onClick={handleCreate}>
            🎯 Create Room
          </button>
          <button className="btn-secondary" style={{ width: '100%' }} onClick={onSolo}>
            🎮 Play Solo
          </button>
        </div>
      </div>

      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.75rem' }}>Join a Room</p>
        <div className="player-list" style={{ marginBottom: '0.5rem' }}>
          <div className="player-row">
            <input
              type="text"
              placeholder="Room code"
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
              maxLength={4}
              style={{ letterSpacing: '0.15em', textTransform: 'uppercase' }}
            />
          </div>
        </div>
        {joinError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{joinError}</p>}
        <button
          className="btn-secondary"
          style={{ width: '100%' }}
          onClick={handleJoin}
          disabled={joinCode.trim().length === 0}
        >
          Join Room
        </button>

        {availableRooms.length > 0 && (
          <>
            <p className="section-title" style={{ margin: '0.75rem 0 0.5rem' }}>
              Available Rooms
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {availableRooms.map(room => (
                <button
                  key={room.code}
                  className="btn-secondary"
                  style={{ width: '100%', letterSpacing: '0.1em' }}
                  onClick={() => handleJoinRoom(room.code)}
                >
                  🎯 Room <strong>{room.code}</strong>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <button
        className="btn-secondary"
        style={{ width: '100%', marginTop: '0.25rem' }}
        onClick={onShowLeaderboard}
      >
        🏆 Leaderboard
      </button>
    </div>
  );
}
