import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCacheKeepHistory, findKnownName, getLeaderboard, saveHistoryBackup } from './leaderboard.js';

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
