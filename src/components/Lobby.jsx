import { useState } from 'react';

export default function Lobby({ onCreateRoom, onJoinRoom, onSolo }) {
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [error, setError] = useState('');

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
      </div>
    </div>
  );
}
