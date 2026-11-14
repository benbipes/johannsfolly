import { describe, expect, it } from 'vitest';
import { APP_VERSION, createPeerTracker, formatReleaseDate, versionLabel } from './version.js';

describe('versionLabel', () => {
  it('shows the release number and date', () => {
    expect(versionLabel(177, '2026-11-14T20:00:00.000Z')).toBe('Version 177 · Released Nov 14, 2026');
  });

  it('leaves the date out when there is none', () => {
    expect(versionLabel(177, null)).toBe('Version 177');
    expect(formatReleaseDate('not a date')).toBe('');
  });

  it('gets a release number from the build', () => {
    expect(APP_VERSION).toBeGreaterThan(0);
  });
});

describe('createPeerTracker', () => {
  const now = 1_000_000;

  it('reports nothing when everyone is on the same release', () => {
    const tracker = createPeerTracker(10, 'me');
    tracker.record({ type: 'app_version', senderId: 'ben', appVersion: 10, playerName: 'Ben' }, now);
    tracker.record({ type: 'game_state', senderId: 'ben', appVersion: 10 }, now);

    expect(tracker.summary(now)).toEqual({ older: [], olderUnnamed: false, newest: null });
  });

  it('names a player on an older release', () => {
    const tracker = createPeerTracker(10, 'me');
    tracker.record({ type: 'app_version', senderId: 'ben', appVersion: 9, playerName: 'Ben' }, now);

    expect(tracker.summary(now).older).toEqual(['Ben']);
  });

  it('spots a phone from before release numbers by the missing number', () => {
    const tracker = createPeerTracker(10, 'me');
    tracker.record({ type: 'room_joined', playerName: 'Johann' }, now);

    expect(tracker.summary(now).older).toEqual(['Johann']);
  });

  it('warns about an older phone in a game even when it does not say who it is', () => {
    const tracker = createPeerTracker(10, 'me');
    tracker.record({ type: 'game_state', senderId: 'old', game: {} }, now);

    expect(tracker.summary(now)).toEqual({ older: [], olderUnnamed: true, newest: null });
  });

  it('reports the newest release another phone is on', () => {
    const tracker = createPeerTracker(10, 'me');
    tracker.record({ type: 'app_version', senderId: 'a', appVersion: 12, playerName: 'A' }, now);
    tracker.record({ type: 'app_version', senderId: 'b', appVersion: 11, playerName: 'B' }, now);

    expect(tracker.summary(now).newest).toBe(12);
  });

  it('ignores its own messages, other message types and phones that have gone quiet', () => {
    const tracker = createPeerTracker(10, 'me');
    tracker.record({ type: 'game_state', senderId: 'me' }, now);
    tracker.record({ type: 'room_left', playerName: 'Ben' }, now);
    tracker.record({ type: 'app_version', senderId: 'gone', appVersion: 3, playerName: 'Gone' }, now - 60_000);

    expect(tracker.summary(now)).toEqual({ older: [], olderUnnamed: false, newest: null });
  });

  it('keeps the name a phone gave earlier when its game messages leave it out', () => {
    const tracker = createPeerTracker(10, 'me');
    tracker.record({ type: 'app_version', senderId: 'ben', appVersion: 9, playerName: 'Ben' }, now);
    tracker.record({ type: 'game_state', senderId: 'ben', appVersion: 9 }, now + 1000);

    expect(tracker.summary(now + 1000).older).toEqual(['Ben']);
  });
});
