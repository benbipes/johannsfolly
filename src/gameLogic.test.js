import { describe, expect, it } from 'vitest';
import { canBackOutLastTurn, createGame, mergeGameState, resultRecordId, voidedRecordIds } from './gameLogic.js';

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

describe('mergeGameState backouts', () => {
  function backOut(game, playerIdx, timestamp, restored) {
    return {
      ...game,
      players: game.players.map((p, i) => (i === playerIdx ? { ...restored, backoutAt: timestamp } : p)),
      round: restored.roundCompleted + 1,
      view: 'scoring',
      finalWinners: [],
      finalStats: null,
      legsWonMap: game.legsBeforeResult ?? game.legsWonMap,
      legsBeforeResult: null,
      resultSeq: (game.resultSeq ?? 0) + (game.finalWinners?.length ? 1 : 0),
      backout: { timestamp, playerName: game.players[playerIdx].name },
    };
  }

  it('keeps an earlier backout of one player when another player is backed out later', () => {
    const base = startRound(['A', 'B', 'C']);
    const thrown = throwMiss(throwMiss(base, 0), 1);
    const restoredA = base.players[0];
    const restoredB = base.players[1];
    const phone1 = backOut(thrown, 0, 1000, restoredA);
    const phone2 = backOut(thrown, 1, 2000, restoredB);

    for (const merged of [mergeGameState(phone1, phone2), mergeGameState(phone2, phone1)]) {
      expect(merged.players[0].roundCompleted).toBe(4);
      expect(merged.players[1].roundCompleted).toBe(4);
      expect(merged.round).toBe(5);
      expect(merged.backout.timestamp).toBe(2000);
    }
  });

  it('does not let an old copy undo a backout', () => {
    const base = startRound(['A', 'B']);
    const thrown = throwMiss(base, 0);
    const backedOut = backOut(thrown, 0, 1000, base.players[0]);

    for (const merged of [mergeGameState(thrown, backedOut), mergeGameState(backedOut, thrown)]) {
      expect(merged.players[0].roundCompleted).toBe(4);
      expect(merged.players[0].backoutAt).toBe(1000);
    }
  });

  it('gives back the leg and counts the new result once after a winner is backed out', () => {
    const base = startRound(['A', 'B']);
    const won = { ...wonGame(['A', 'B']), legsWonMap: { A: 3, B: 2 }, legsBeforeResult: { A: 2, B: 2 } };
    const backedOut = backOut(won, 0, 1000, base.players[0]);

    for (const merged of [mergeGameState(won, backedOut), mergeGameState(backedOut, won)]) {
      expect(merged.view).toBe('scoring');
      expect(merged.finalWinners).toEqual([]);
      expect(merged.legsWonMap).toEqual({ A: 2, B: 2 });
      expect(merged.resultSeq).toBe(1);
    }
  });

  it('keeps the backed-out result when an old winner copy arrives late', () => {
    const base = startRound(['A', 'B']);
    const won = { ...wonGame(['A', 'B']), legsWonMap: { A: 1 }, legsBeforeResult: {} };
    const backedOut = backOut(won, 0, 1000, base.players[0]);
    const rescored = mergeGameState(backedOut, backedOut);

    const merged = mergeGameState(rescored, won);

    expect(merged.view).toBe('scoring');
    expect(merged.legsWonMap).toEqual({});
  });
});

describe('result record ids', () => {
  it('uses the game id for the first result, so older records still match', () => {
    expect(resultRecordId({ gameId: 'g1' })).toBe('g1');
    expect(resultRecordId({ gameId: 'g1', resultSeq: 0 })).toBe('g1');
  });

  it('gives each later result its own id and lists the backed-out ones', () => {
    expect(resultRecordId({ gameId: 'g1', resultSeq: 2 })).toBe('g1#2');
    expect(voidedRecordIds({ gameId: 'g1', resultSeq: 2 })).toEqual(['g1', 'g1#1']);
    expect(voidedRecordIds({ gameId: 'g1' })).toEqual([]);
  });
});

describe('mergeGameState playoffs', () => {
  const tied = closeBull(closeBull(startRound(['A', 'B']), 0), 1);
  function playoff(style, number) {
    return { ...tied, view: 'playoff', playoffPlayers: [0, 1], playoffRound: 1, playoffStyle: style, playoffNumber: number };
  }

  it('picks the same playoff target on every phone when two players choose at once', () => {
    const phone1 = playoff('number', 7);
    const phone2 = playoff('bulls', 'Bull');

    const a = mergeGameState(phone1, phone2);
    const b = mergeGameState(phone2, phone1);

    expect([a.playoffStyle, a.playoffNumber]).toEqual([b.playoffStyle, b.playoffNumber]);
  });

  it('keeps the chosen target when the other phone has not chosen yet', () => {
    const chosen = playoff('number', 7);
    const waiting = playoff(null, null);

    for (const merged of [mergeGameState(chosen, waiting), mergeGameState(waiting, chosen)]) {
      expect(merged.playoffStyle).toBe('number');
      expect(merged.playoffNumber).toBe(7);
    }
  });

  it('combines playoff scores thrown at the same time', () => {
    const base = playoff('number', 7);
    const phone1 = { ...base, playoffScores: { 0: 2 }, playoffSubmitted: { 0: true } };
    const phone2 = { ...base, playoffScores: { 1: 1 }, playoffSubmitted: { 1: true } };

    const merged = mergeGameState(phone1, phone2);

    expect(merged.playoffScores).toEqual({ 0: 2, 1: 1 });
    expect(merged.playoffSubmitted).toEqual({ 0: true, 1: true });
  });
});

describe('canBackOutLastTurn', () => {
  // Round 5 just ended with B's turn, so the game is now on round 6.
  function afterRoundEnded() {
    const game = throwMiss(throwMiss(startRound(['A', 'B']), 0), 1);
    return {
      ...game,
      round: 6,
      players: game.players.map(p => ({ ...p, roundSnapshot: { round: 5, roundCompleted: 4 } })),
    };
  }

  it('lets the last player back out the turn that ended the round', () => {
    const game = afterRoundEnded();

    expect(canBackOutLastTurn(game, game.players[1])).toBe(true);
  });

  it('lets a solo player back out their last turn', () => {
    const solo = throwMiss(startRound(['A']), 0);
    const game = { ...solo, round: 6, players: [{ ...solo.players[0], roundSnapshot: { round: 5 } }] };

    expect(canBackOutLastTurn(game, game.players[0])).toBe(true);
  });

  it('stops once someone has thrown in the new round', () => {
    const game = afterRoundEnded();
    game.players[0] = { ...game.players[0], roundCompleted: 6 };

    expect(canBackOutLastTurn(game, game.players[1])).toBe(false);
  });

  it('does nothing for a player with no turn to back out', () => {
    const game = afterRoundEnded();

    expect(canBackOutLastTurn(game, { ...game.players[1], roundSnapshot: null })).toBe(false);
    expect(canBackOutLastTurn(startRound(['A']), startRound(['A']).players[0])).toBe(false);
  });
});
