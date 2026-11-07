import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import CodeScreen from './CodeScreen.jsx';
import NameScreen from './NameScreen.jsx';
import Lobby from './Lobby.jsx';

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

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage({
    'jf:leaderboard': JSON.stringify({
      players: {
        Slipster: { games: [{ gameId: 'g1', won: true, rounds: 10, totalMarks: 21 }] },
        Johann: { games: [{ gameId: 'g1', won: false, rounds: 10, totalMarks: 12 }] },
      },
      recordedIds: { g1: true },
    }),
  }));
  vi.stubGlobal('sessionStorage', fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CodeScreen', () => {
  it('asks for the group code and shows no player names', () => {
    const html = renderToString(<CodeScreen onUnlock={() => {}} />);

    expect(html).toContain('Enter the group code');
    expect(html).not.toContain('Slipster');
  });
});

describe('NameScreen', () => {
  it('lists leaderboard names and offers a new name', () => {
    const html = renderToString(<NameScreen onDone={() => {}} />);

    expect(html).toContain('Tap your name');
    expect(html).toContain('Slipster');
    expect(html).toContain('Johann');
    expect(html).toContain('New player?');
    expect(html.toLowerCase()).not.toContain('password');
  });

  it('just asks for a name when there is no history yet', () => {
    localStorage.clear();

    const html = renderToString(<NameScreen onDone={() => {}} />);

    expect(html).toContain('Enter your name');
    expect(html).not.toContain('Tap your name');
  });
});

describe('Lobby', () => {
  it('offers Change name and no account options', () => {
    const html = renderToString(<Lobby loggedInUser="Slipster" onChangeName={() => {}} />);

    expect(html).toContain('Slipster');
    expect(html).toContain('Change name');
    expect(html).not.toContain('Logout');
    expect(html).not.toContain('Delete Account');
  });
});
