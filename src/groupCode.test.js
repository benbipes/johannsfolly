import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GROUP_CODE_HASH, isUnlocked, tryGroupCode } from './groupCode.js';

const hashBytes = Uint8Array.from(GROUP_CODE_HASH.match(/../g).map(pair => parseInt(pair, 16)));

function fakeStorage() {
  const items = new Map();
  return {
    getItem: key => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('group code', () => {
  it('stays locked until a code is entered', () => {
    expect(isUnlocked()).toBe(false);
  });

  it('rejects a wrong code and stays locked', async () => {
    expect(await tryGroupCode('WRONG1')).toBe(false);
    expect(await tryGroupCode('')).toBe(false);
    expect(isUnlocked()).toBe(false);
  });

  it('remembers the phone once the right code is entered', async () => {
    vi.stubGlobal('crypto', { subtle: { digest: async () => hashBytes.buffer } });

    expect(await tryGroupCode('any')).toBe(true);
    expect(isUnlocked()).toBe(true);
  });

  it('locks phones again when the code changes', () => {
    localStorage.setItem('jf:group_unlocked', 'hash-of-an-old-code');

    expect(isUnlocked()).toBe(false);
  });

  it('ignores capitalization, spaces and dashes', async () => {
    const seen = [];
    vi.stubGlobal('crypto', {
      subtle: {
        digest: async (_, data) => {
          seen.push(new TextDecoder().decode(data));
          return hashBytes.buffer;
        },
      },
    });

    await tryGroupCode(' ab-c 1 ');

    expect(seen).toEqual(['ABC1']);
  });
});
