import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetName, getSavedName, removeOldAccountData, savePlayerName } from './auth.js';

function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    get length() { return items.size; },
    key: index => [...items.keys()][index] ?? null,
    getItem: key => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key),
    clear: () => items.clear(),
  };
}

const leaderboard = JSON.stringify({
  players: { Slipster: { wins: 0, games: [{ gameId: 'g1', won: false, rounds: 10, totalMarks: 12 }] } },
  recordedIds: { g1: true },
});

function setStorage(local = {}, session = {}) {
  vi.stubGlobal('localStorage', fakeStorage(local));
  vi.stubGlobal('sessionStorage', fakeStorage(session));
}

beforeEach(() => {
  setStorage({ 'jf:leaderboard': leaderboard });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('removeOldAccountData', () => {
  it('keeps the exact name of someone who was signed in', () => {
    setStorage({ 'jf:session_v4': JSON.stringify({ displayName: 'Slipster', email: 'a@b.co' }) });

    removeOldAccountData();

    expect(getSavedName()).toBe('Slipster');
  });

  it('keeps the name from an expired session', () => {
    setStorage({ 'jf:session_v4': JSON.stringify({ displayName: 'Slipster', expiresAt: 1 }) });

    removeOldAccountData();

    expect(getSavedName()).toBe('Slipster');
  });

  it('deletes stored accounts and sessions', () => {
    setStorage(
      {
        'jf:accounts_v4': JSON.stringify({ 'a@b.co': { password: 'secret' } }),
        'jf:session_v4': JSON.stringify({ displayName: 'Slipster' }),
      },
      { 'jf:session_v4': '{}' },
    );

    removeOldAccountData();

    expect(localStorage.getItem('jf:accounts_v4')).toBeNull();
    expect(localStorage.getItem('jf:session_v4')).toBeNull();
    expect(sessionStorage.getItem('jf:session_v4')).toBeNull();
  });

  it('leaves the game history alone', () => {
    setStorage({ 'jf:leaderboard': leaderboard, 'jf:accounts_v4': '{}' });

    removeOldAccountData();

    expect(localStorage.getItem('jf:leaderboard')).toBe(leaderboard);
  });

  it('does not overwrite a name already chosen', () => {
    setStorage({ 'jf:player_name': 'Johann', 'jf:session_v4': JSON.stringify({ displayName: 'Slipster' }) });

    removeOldAccountData();

    expect(getSavedName()).toBe('Johann');
  });

  it('still removes accounts when the old session is unreadable', () => {
    setStorage({ 'jf:session_v4': 'not json', 'jf:accounts_v4': '{}' });

    removeOldAccountData();

    expect(localStorage.getItem('jf:accounts_v4')).toBeNull();
    expect(getSavedName()).toBeNull();
  });
});

describe('savePlayerName', () => {
  it('uses the leaderboard spelling so history stays together', () => {
    expect(savePlayerName('  sLiPsTeR ')).toEqual({ ok: true, name: 'Slipster' });
    expect(getSavedName()).toBe('Slipster');
  });

  it('saves a new player as typed', () => {
    expect(savePlayerName(' Johann ')).toEqual({ ok: true, name: 'Johann' });
  });

  it('rejects names that are too short or too long', () => {
    expect(savePlayerName('J').ok).toBe(false);
    expect(savePlayerName('x'.repeat(21)).ok).toBe(false);
    expect(getSavedName()).toBeNull();
  });

  it('allows an existing short name from the leaderboard', () => {
    setStorage({ 'jf:leaderboard': JSON.stringify({ players: { B: { games: [] } }, recordedIds: {} }) });

    expect(savePlayerName('b')).toEqual({ ok: true, name: 'B' });
  });
});

describe('forgetName', () => {
  it('forgets the name but keeps the history', () => {
    savePlayerName('Slipster');

    forgetName();

    expect(getSavedName()).toBeNull();
    expect(localStorage.getItem('jf:leaderboard')).toBe(leaderboard);
  });
});
