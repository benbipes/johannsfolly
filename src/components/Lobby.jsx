import { useState, useEffect, useRef } from 'react';
import { getOpenRooms } from '../useGameSync.js';

export default function Lobby({ onCreateRoom, onJoinRoom, onSolo }) {
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [error, setError] = useState('');
  const [availableRooms, setAvailableRooms] = useState(() => getOpenRooms());
  const channelRef = useRef(null);

  // Listen for room announcements from other tabs
  useEffect(() => {
    const channel = new BroadcastChannel('jf:lobby');
    channelRef.current = channel;
    channel.onmessage = () => {
      setAvailableRooms(getOpenRooms());
    };
    // Also refresh on storage events (same browser, different tab)
    function onStorage(e) {
      if (e.key && e.key.startsWith('room:')) {
        setAvailableRooms(getOpenRooms());
      }
    }
    window.addEventListener('storage', onStorage);
    return () => {
      channel.close();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) {
      setError('Room code must be 4 characters.');
      return;
    }
    const name = joinName.trim();
    if (!name) {
      setError('Please enter your name.');
      return;
    }
    setError('');
    onJoinRoom(code, name);
  }

  function handleJoinRoom(code) {
    const name = joinName.trim();
    if (!name) {
      setError('Please enter your name before joining a room.');
      return;
    }
    setError('');
    onJoinRoom(code, name);
  }

  return (
    <div className="screen">
      <div className="setup-header">
        <img src="/logo.png" alt="Johann's Folly" className="app-logo" />
      </div>

      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.75rem' }}>Start a Game</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button className="btn-primary" onClick={onCreateRoom}>
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
              placeholder="Your name"
              value={joinName}
              onChange={e => { setJoinName(e.target.value); setError(''); }}
              maxLength={20}
              autoCapitalize="words"
            />
          </div>
          <div className="player-row">
            <input
              type="text"
              placeholder="Room code"
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
              maxLength={4}
              style={{ letterSpacing: '0.15em', textTransform: 'uppercase' }}
            />
          </div>
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{error}</p>}
        <button
          className="btn-secondary"
          style={{ width: '100%' }}
          onClick={handleJoin}
          disabled={joinCode.trim().length === 0 || joinName.trim().length === 0}
        >
          Join Room
        </button>

        {availableRooms.length > 0 && (
          <>
            <p className="section-title" style={{ margin: '0.75rem 0 0.5rem' }}>
              Available Rooms
              <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                (enter your name then tap to join)
              </span>
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
    </div>
  );
}
