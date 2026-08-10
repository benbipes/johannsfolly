import { useState } from 'react';

export default function Lobby({ onCreateRoom, onJoinRoom, onSolo }) {
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError('Room code must be 6 characters.');
      return;
    }
    setError('');
    onJoinRoom(code);
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
        <div className="player-row" style={{ marginBottom: '0.5rem' }}>
          <input
            type="text"
            placeholder="Enter room code"
            value={joinCode}
            onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
            maxLength={6}
            style={{ letterSpacing: '0.15em', textTransform: 'uppercase' }}
          />
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{error}</p>}
        <button
          className="btn-secondary"
          style={{ width: '100%' }}
          onClick={handleJoin}
          disabled={joinCode.trim().length === 0}
        >
          Join Room
        </button>
      </div>
    </div>
  );
}
