import { useState, useEffect, useRef } from 'react';
import { getOpenRooms } from '../useGameSync.js';
import { getLoggedUsers, getLoggedInUserEmail } from '../auth.js';

export default function Lobby({
  onCreateRoom,
  onJoinRoom,
  onSolo,
  loggedInUser,
  userName,
  onLogout,
  onDeleteAccount,
  onShowLeaderboard,
}) {
  const currentUser = loggedInUser || userName;
  const currentEmail = getLoggedInUserEmail();

  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [availableRooms, setAvailableRooms] = useState(() => getOpenRooms());
  const [loggedUsers, setLoggedUsers] = useState(() => getLoggedUsers());
  const [showAccountModal, setShowAccountModal] = useState(false);
  const channelRef = useRef(null);

  // Listen for room announcements and presence updates from other tabs
  useEffect(() => {
    const channel = new BroadcastChannel('jf:lobby');
    channelRef.current = channel;
    const syncState = () => {
      setAvailableRooms(getOpenRooms());
      setLoggedUsers(getLoggedUsers());
    };
    channel.onmessage = syncState;
    function onStorage(e) {
      if (!e.key || e.key.startsWith('room:') || e.key.startsWith('jf:logged-user:')) {
        syncState();
      }
    }
    syncState();
    const id = setInterval(syncState, 2000);
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(id);
      channel.close();
      window.removeEventListener('storage', onStorage);
    };
  }, [currentUser]);

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

  function handleDeleteAccountConfirm() {
    if (window.confirm('Are you sure you want to permanently delete your account? All of your saved stats and account data will be permanently removed. This action cannot be undone.')) {
      onDeleteAccount?.();
    }
  }

  return (
    <div className="screen">
      <div className="setup-header">
        <img src="/logo.png" alt="Johann's Folly" className="app-logo" />
        {currentUser && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', marginTop: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1.05rem' }}>
                👤 {currentUser}
              </span>
              <button
                className="btn-secondary"
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.8rem' }}
                onClick={() => setShowAccountModal(true)}
              >
                ⚙️ Account
              </button>
              <button
                className="btn-secondary"
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.8rem' }}
                onClick={onLogout}
              >
                Logout
              </button>
            </div>
            {currentEmail && (
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                {currentEmail}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Account Settings / Delete Account Modal */}
      {showAccountModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '1rem',
        }}>
          <div className="card" style={{ maxWidth: '420px', width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: 'var(--accent)' }}>Account Settings</h3>
              <button
                onClick={() => setShowAccountModal(false)}
                style={{ background: 'transparent', color: 'var(--muted)', fontSize: '1.2rem', padding: '0.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Display Name:</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{currentUser}</div>

              {currentEmail && (
                <>
                  <div style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: '0.35rem' }}>Registered Email:</div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{currentEmail}</div>
                </>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0 }}>
                In accordance with Apple Privacy Guidelines, you can permanently delete your account and personal game data at any time.
              </p>
              <button
                className="btn-danger"
                style={{ width: '100%', padding: '0.65rem', fontSize: '0.95rem' }}
                onClick={() => {
                  setShowAccountModal(false);
                  handleDeleteAccountConfirm();
                }}
              >
                🗑️ Delete Account & Data
              </button>
              <button
                className="btn-secondary"
                style={{ width: '100%', padding: '0.65rem', fontSize: '0.95rem' }}
                onClick={() => setShowAccountModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.75rem' }}>Logged Users</p>
        {loggedUsers.length > 0 ? (
          <div className="player-list">
            {loggedUsers.map((name) => (
              <div className="player-row" key={name} style={{ opacity: 0.9 }}>
                <span style={{ flex: 1, padding: '0.4rem 0.5rem', color: 'var(--accent)' }}>
                  👤 {name}
                </span>
                {name === currentUser && (
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
        <button
          className="btn-secondary"
          style={{ width: '100%' }}
          onClick={onShowLeaderboard}
        >
          🏆 Leaderboard
        </button>

        <button
          className="btn-secondary"
          style={{ width: '100%', color: 'var(--danger)', borderColor: 'var(--danger)', fontSize: '0.9rem' }}
          onClick={() => {
            if (window.confirm('Clear all cached rooms, logged users, saved games, and sound settings to start 100% fresh?')) {
              try {
                localStorage.clear();
                sessionStorage.clear();
              } catch { /* ignore */ }
              window.location.reload();
            }
          }}
        >
          🧹 Clear Cache & Start Fresh
        </button>
      </div>
    </div>
  );
}
