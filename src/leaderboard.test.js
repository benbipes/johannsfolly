import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCacheKeepHistory, findKnownName, getLeaderboard, mergeLeaderboardData, recordGame, saveHistoryBackup, voidRecord,
} from './leaderboard.js';

const HISTORY_KEY = 'jf:leaderboard';
const history = {
  players: {
    Alex: { wins: 1, games: [{ gameId: 'g1', date: '2026-01-01', won: true, rounds: 10, totalMarks: 21 }] },
  },
  recordedIds: { g1: true },
};

function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: key => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key),
    clear: () => items.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage({
    [HISTORY_KEY]: JSON.stringify(history),
    'jf:sound': 'true',
    'room-settings:ABC': '{}',
  }));
  vi.stubGlobal('sessionStorage', fakeStorage({ 'jf:active_view': 'scoring' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('player names', () => {
  it('combines spellings that differ only by capitalization', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({
      players: {
        alex: { games: [{ gameId: 'g2', date: '2026-02-01', won: false, rounds: 10, totalMarks: 10 }] },
        Alex: {
          games: [
            { gameId: 'g1', date: '2026-01-01', won: true, rounds: 10, totalMarks: 21 },
            { gameId: 'g3', date: '2026-03-01', won: true, rounds: 10, totalMarks: 21 },
          ],
        },
      },
      recordedIds: {},
    }));

    const entries = getLeaderboard();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'Alex', games: 3, wins: 2 });
    expect(entries[0].lastGame.gameId).toBe('g3');
  });

  it('adds merged names together under the name to keep', () => {
    const stored = {
      players: {
        Slip: {
          games: [
            { gameId: 'g1', date: '2026-01-01', won: true, rounds: 10, totalMarks: 21 },
            { gameId: 'g2', date: '2026-02-01', won: false, rounds: 10, totalMarks: 10 },
          ],
        },
        Slipster: { games: [{ gameId: 'g3', date: '2026-03-01', won: true, rounds: 10, totalMarks: 21 }] },
      },
      recordedIds: {},
    };
    localStorage.setItem(HISTORY_KEY, JSON.stringify(stored));

    const entries = getLeaderboard();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'Slipster', games: 3, wins: 2 });
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY))).toEqual(stored);
  });

  it('combines John into Johann', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({
      players: {
        Johann: { games: [{ gameId: 'g1', date: '2026-01-01', won: true, rounds: 10, totalMarks: 21 }] },
        John: { games: [{ gameId: 'g2', date: '2026-02-01', won: false, rounds: 10, totalMarks: 10 }] },
      },
      recordedIds: {},
    }));

    const entries = getLeaderboard();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'Johann', games: 2, wins: 1 });
    expect(findKnownName('john')).toBe('Johann');
  });

  it('shows the name to keep even if only the old name has games', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({
      players: { Slip: { games: [{ gameId: 'g1', date: '2026-01-01', won: true, rounds: 10, totalMarks: 21 }] } },
      recordedIds: {},
    }));

    expect(getLeaderboard()[0].name).toBe('Slipster');
    expect(findKnownName('slip')).toBe('Slipster');
    expect(findKnownName('SLIPSTER')).toBe('Slipster');
  });

  it('finds a known name whatever the capitalization', () => {
    expect(findKnownName(' aLEX ')).toBe('Alex');
    expect(findKnownName('Johann')).toBeNull();
    expect(findKnownName('')).toBeNull();
  });
});

describe('clearCacheKeepHistory', () => {
  it('keeps the game history', () => {
    clearCacheKeepHistory();

    expect(JSON.parse(localStorage.getItem(HISTORY_KEY))).toEqual(history);
    expect(getLeaderboard().map(entry => entry.name)).toEqual(['Alex']);
  });

  it('clears everything else', () => {
    clearCacheKeepHistory();

    expect(localStorage.getItem('jf:sound')).toBeNull();
    expect(localStorage.getItem('room-settings:ABC')).toBeNull();
    expect(sessionStorage.getItem('jf:active_view')).toBeNull();
  });

  it('works on a phone with no history yet', () => {
    localStorage.removeItem(HISTORY_KEY);

    clearCacheKeepHistory();

    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
  });
});

describe('saveHistoryBackup', () => {
  it('shares the full history as a file on phones', async () => {
    const share = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { canShare: () => true, share });

    await saveHistoryBackup();

    const [file] = share.mock.calls[0][0].files;
    expect(file.name).toMatch(/^johanns-folly-history-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(await file.text())).toEqual(history);
  });

  it('downloads the file when sharing is not available', async () => {
    const link = { click: vi.fn() };
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', { createElement: () => link });
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await saveHistoryBackup();

    expect(link.click).toHaveBeenCalledOnce();
    expect(link.download).toMatch(/\.json$/);
    expect(revokeUrl).toHaveBeenCalledWith('blob:backup');
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  });

  it('does nothing more when someone cancels the share sheet', async () => {
    const createElement = vi.fn();
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'AbortError' })),
    });
    vi.stubGlobal('document', { createElement });

    await saveHistoryBackup();

    expect(createElement).not.toHaveBeenCalled();
  });
});

describe('backed-out results', () => {
  const players = [{ name: 'Alex', finished: true, finishedRound: 9 }, { name: 'Ben', roundCompleted: 9, targetIndex: 12 }];
  const stored = () => JSON.parse(localStorage.getItem(HISTORY_KEY));
  const entry = name => getLeaderboard().find(e => e.name === name);

  it('removes a voided result from the leaderboard', () => {
    recordGame(players, [0], 9, {}, {}, 'g9');
    expect(entry('Alex').wins).toBe(2);

    voidRecord('g9');

    expect(entry('Alex').wins).toBe(1);
    expect(entry('Ben').games).toBe(0);
    expect(stored().voidedIds.g9).toBe(true);
  });

  it('records the corrected result after the first one was voided', () => {
    recordGame(players, [0], 9, {}, {}, 'g9');
    voidRecord('g9');

    recordGame(players, [1], 10, {}, {}, 'g9#1');

    expect(entry('Alex').wins).toBe(1);
    expect(entry('Ben').wins).toBe(1);
  });

  it('never records a result that was already voided', () => {
    voidRecord('g9');

    recordGame(players, [0], 9, {}, {}, 'g9');

    expect(entry('Alex').wins).toBe(1);
  });

  it('removes a result voided on another phone', () => {
    recordGame(players, [0], 9, {}, {}, 'g9');

    const changed = mergeLeaderboardData({ players: {}, recordedIds: { g9: true }, voidedIds: { g9: true } });

    expect(changed).toBe(true);
    expect(entry('Alex').wins).toBe(1);
  });

  it('does not take back a voided result from a phone that has not heard about it', () => {
    voidRecord('g9');
    const oldPhone = {
      players: { Alex: { wins: 1, games: [{ gameId: 'g9', date: '2026-03-01', won: true, rounds: 9, totalMarks: 21 }] } },
      recordedIds: { g9: true },
    };

    mergeLeaderboardData(oldPhone);

    expect(entry('Alex').wins).toBe(1);
  });
});
