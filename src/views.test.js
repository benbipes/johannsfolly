import { describe, expect, it } from 'vitest';
import { viewAfterSync } from './views.js';

describe('viewAfterSync', () => {
  it('keeps the scoreboard open while the game carries on', () => {
    expect(viewAfterSync('scoreboard', 'scoring', 'scoring')).toBe('scoreboard');
  });

  it('keeps the leaderboard open on the winner screen', () => {
    expect(viewAfterSync('leaderboard', 'winner', 'winner')).toBe('leaderboard');
  });

  it('shows the winner when the game ends while the scoreboard is open', () => {
    expect(viewAfterSync('scoreboard', 'scoring', 'winner')).toBe('winner');
  });

  it('starts the rematch when it begins while the leaderboard is open', () => {
    expect(viewAfterSync('leaderboard', 'winner', 'scoring')).toBe('scoring');
  });

  it('follows the game on shared screens', () => {
    expect(viewAfterSync('room', undefined, 'scoring')).toBe('scoring');
    expect(viewAfterSync('scoring', 'scoring', 'playoff')).toBe('playoff');
    expect(viewAfterSync('winner', 'winner', 'scoring')).toBe('scoring');
  });

  it('stays put when the game has no screen yet', () => {
    expect(viewAfterSync('room', undefined, undefined)).toBe('room');
  });
});
