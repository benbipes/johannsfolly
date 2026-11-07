import { describe, expect, it } from 'vitest';
import { createGame, mergeGameState } from './gameLogic.js';

function startRound(names, round = 5) {
  const game = createGame(names);
  return {
    ...game,
    round,
    view: 'scoring',
    finalWinners: [],
    players: game.players.map(p => ({
      ...p,
      targetIndex: 20,
      marks: 20,
      darts: 12,
      roundCompleted: round - 1,
    })),
  };
}

function closeBull(game, playerIdx) {
  return {
    ...game,
    players: game.players.map((p, i) => (i === playerIdx
      ? { ...p, finished: true, finishedRound: game.round, roundCompleted: game.round, marks: 21, darts: p.darts + 3 }
      : p)),
  };
}

function throwMiss(game, playerIdx) {
  return {
    ...game,
    players: game.players.map((p, i) => (i === playerIdx
      ? { ...p, roundCompleted: game.round, darts: p.darts + 3 }
      : p)),
  };
}

function wonGame(names) {
  const game = throwMiss(closeBull(startRound(names), 0), 1);
  return { ...game, view: 'winner', finalWinners: [0], legsWonMap: { [names[0]]: 1 } };
}

describe('mergeGameState round end', () => {
  it('declares the winner on both devices when turns land together', () => {
    const base = startRound(['A', 'B']);
    const deviceA = closeBull(base, 0);
    const deviceB = throwMiss(base, 1);

    for (const merged of [mergeGameState(deviceA, deviceB), mergeGameState(deviceB, deviceA)]) {
      expect(merged.view).toBe('winner');
      expect(merged.finalWinners).toEqual([0]);
      expect(merged.round).toBe(5);
      expect(merged.legsWonMap.A).toBe(1);
      expect(merged.players[0].legsWon).toBe(1);
      expect(merged.finalStats.rounds).toBe(5);
      expect(merged.finalStats.marksMap.A).toBe(21);
    }
  });

  it('starts a playoff on both devices when two players close Bull together', () => {
    const base = startRound(['A', 'B']);
    const deviceA = closeBull(base, 0);
    const deviceB = closeBull(base, 1);

    for (const merged of [mergeGameState(deviceA, deviceB), mergeGameState(deviceB, deviceA)]) {
      expect(merged.view).toBe('playoff');
      expect(merged.playoffPlayers).toEqual([0, 1]);
      expect(merged.finalWinners).toEqual([]);
      expect(merged.round).toBe(5);
    }
  });

  it('counts the leg once when both devices resolve and then sync', () => {
    const base = startRound(['A', 'B']);
    const deviceA = closeBull(base, 0);
    const deviceB = throwMiss(base, 1);

    const synced = mergeGameState(mergeGameState(deviceA, deviceB), mergeGameState(deviceB, deviceA));

    expect(synced.view).toBe('winner');
    expect(synced.legsWonMap.A).toBe(1);
    expect(mergeGameState(synced, synced).legsWonMap.A).toBe(1);
  });

  it('keeps playing while a player has not thrown yet', () => {
    const base = startRound(['A', 'B', 'C']);

    const merged = mergeGameState(closeBull(base, 0), throwMiss(base, 1));

    expect(merged.view).toBe('scoring');
    expect(merged.finalWinners).toEqual([]);
  });

  it('advances a normal round when nobody closed Bull', () => {
    const base = startRound(['A', 'B']);

    const merged = mergeGameState(throwMiss(base, 0), throwMiss(base, 1));

    expect(merged.view).toBe('scoring');
    expect(merged.round).toBe(6);
  });

  it('leaves an existing winner screen alone', () => {
    const won = wonGame(['A', 'B']);

    const merged = mergeGameState(won, won);

    expect(merged.finalWinners).toEqual([0]);
    expect(merged.legsWonMap.A).toBe(1);
  });

  it('resumes play after the winner is backed out', () => {
    const won = wonGame(['A', 'B']);
    const backedOut = {
      ...won,
      players: [startRound(['A', 'B']).players[0], won.players[1]],
      view: 'scoring',
      finalWinners: [],
      backout: { timestamp: Date.now(), playerName: 'A' },
    };

    const merged = mergeGameState(won, backedOut);

    expect(merged.view).toBe('scoring');
    expect(merged.finalWinners).toEqual([]);
  });
});
