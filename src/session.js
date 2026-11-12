// Remembers the room and screen this tab is on, so a reload mid-game goes back to the game.
// It lives in sessionStorage, so it ends when the tab is closed.

const KEYS = {
  roomCode: 'jf:active_roomCode',
  playerName: 'jf:active_playerName',
  view: 'jf:active_view',
  isHost: 'jf:active_isHost',
};

// Screens that need a game to show.
const GAME_VIEWS = ['scoring', 'scoreboard', 'playoff', 'winner'];

function read(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function loadGame(roomCode) {
  if (!roomCode) return null;
  try {
    const stored = localStorage.getItem(`game:${roomCode}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/** Returns where this tab was before a reload. Falls back to the lobby if the game is gone. */
export function loadActiveSession() {
  const roomCode = read(KEYS.roomCode) || null;
  const game = loadGame(roomCode);
  let view = read(KEYS.view) || 'lobby';
  if (GAME_VIEWS.includes(view) && !game?.players?.length) view = 'lobby';
  if (view === 'room' && !roomCode) view = 'lobby';

  return {
    roomCode: view === 'lobby' ? null : roomCode,
    playerName: read(KEYS.playerName) || null,
    view,
    isHost: read(KEYS.isHost) === 'true',
    game: view === 'lobby' ? null : game,
  };
}

export function saveActiveSession({ roomCode, playerName, view, isHost }) {
  try {
    const values = {
      roomCode: roomCode || null,
      playerName: playerName || null,
      view: view && view !== 'lobby' ? view : null,
      isHost: roomCode && isHost ? 'true' : null,
    };
    Object.entries(values).forEach(([field, value]) => {
      if (value) sessionStorage.setItem(KEYS[field], value);
      else sessionStorage.removeItem(KEYS[field]);
    });
  } catch { /* ignore */ }
}
