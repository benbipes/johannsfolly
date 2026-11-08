import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadActiveSession, markIntroSeen, saveActiveSession, shouldShowIntro } from './session.js';

function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: key => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key),
    clear: () => items.clear(),
  };
}

const game = { gameId: 'g1', players: [{ name: 'Alex' }, { name: 'Ben' }], view: 'scoring' };

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage({ 'game:ABCD': JSON.stringify(game) }));
  vi.stubGlobal('sessionStorage', fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reloading the page', () => {
  it('goes back to the game in progress', () => {
    saveActiveSession({ roomCode: 'ABCD', playerName: 'Alex', view: 'scoring', isHost: true });

    const restored = loadActiveSession();

    expect(restored.view).toBe('scoring');
    expect(restored.roomCode).toBe('ABCD');
    expect(restored.playerName).toBe('Alex');
    expect(restored.isHost).toBe(true);
    expect(restored.game).toEqual(game);
  });

  it('goes back to the room while waiting for the game to start', () => {
    saveActiveSession({ roomCode: 'WXYZ', playerName: 'Ben', view: 'room', isHost: false });

    const restored = loadActiveSession();

    expect(restored.view).toBe('room');
    expect(restored.roomCode).toBe('WXYZ');
    expect(restored.isHost).toBe(false);
  });

  it('opens the lobby when the game is no longer on this phone', () => {
    saveActiveSession({ roomCode: 'WXYZ', playerName: 'Ben', view: 'scoring', isHost: false });

    const restored = loadActiveSession();

    expect(restored.view).toBe('lobby');
    expect(restored.roomCode).toBeNull();
    expect(restored.game).toBeNull();
  });

  it('opens the lobby after a solo game, which is not saved', () => {
    saveActiveSession({ roomCode: null, playerName: 'Alex', view: 'scoring', isHost: false });

    expect(loadActiveSession().view).toBe('lobby');
  });

  it('opens the lobby in a new tab', () => {
    const restored = loadActiveSession();

    expect(restored.view).toBe('lobby');
    expect(restored.roomCode).toBeNull();
  });

  it('forgets the room after leaving it', () => {
    saveActiveSession({ roomCode: 'ABCD', playerName: 'Alex', view: 'scoring', isHost: true });
    saveActiveSession({ roomCode: null, playerName: 'Alex', view: 'lobby', isHost: false });

    expect(sessionStorage.getItem('jf:active_roomCode')).toBeNull();
    expect(sessionStorage.getItem('jf:active_isHost')).toBeNull();
    expect(loadActiveSession().view).toBe('lobby');
  });
});

describe('opening dart throw', () => {
  it('shows the first time the app opens', () => {
    expect(shouldShowIntro()).toBe(true);
  });

  it('does not replay after a reload', () => {
    markIntroSeen();

    expect(shouldShowIntro()).toBe(false);
  });
});
