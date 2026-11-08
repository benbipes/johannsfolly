// Target sequence: 20 down to 1, then Bull (25)
export const TARGET_SEQUENCE = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 'Bull'];
export const BULL_INDEX = TARGET_SEQUENCE.length - 1; // 20

export function createPlayer(name, legsWon = 0) {
  return {
    name,
    targetIndex: 0, // starts at 20
    finished: false,
    finishedRound: null,
    roundCompleted: 0,
    lastIsPerfect: false,
    perfectInRound: null,
    perfectCount: 0,
    marks: 0,
    darts: 0,
    bullsHit: 0,
    legsWon: legsWon || 0,
    roundSnapshot: null,
  };
}

export function createGame(playerNames, legsWonMap = {}, tieBreaker = 'playoff') {
  return {
    gameId: 'game_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    createdAt: Date.now(),
    tieBreaker: tieBreaker || 'playoff', // 'playoff' | 'bulls'
    players: playerNames.map(name => createPlayer(name, legsWonMap[name] || 0)),
    round: 1,
    currentPlayerIndex: 0,
    phase: 'playing', // 'playing' | 'playoff_pick' | 'playoff' | 'done'
    winnersThisRound: [], // player indices who hit bull this round
    playoffStyle: null, // null | 'random' | 'bulls'
    playoffNumber: null,
    playoffScores: {}, // playerIndex -> count of hits / bulls
    playoffSubmitted: {}, // playerIndex -> boolean
    playoffRound: 1,
    playoffPlayers: [],
    playoffCurrentIndex: 0,
    gameWinner: null, // player index if sole winner
    legsWonMap: legsWonMap || {},
  };
}

/**
 * Process a set of dart results for the current player.
 * dartResults: array of 'miss' | 'single' | 'double' | 'triple'
 * Returns { newTargetIndex, isPerfect, hitBull, bullsHit }
 */
export function processDarts(player, dartResults, tieBreaker = 'playoff') {
  let targetIndex = player.targetIndex;
  let allHit = true;
  let hitBull = false;
  let bullsHit = 0;

  for (const dart of dartResults) {
    if (dart === 'miss') {
      allHit = false;
      continue;
    }
    if (targetIndex === BULL_INDEX) {
      hitBull = true;
      const count = dart === 'single' ? 1 : dart === 'double' ? 2 : 1;
      bullsHit += count;
      if (tieBreaker !== 'bulls') {
        break;
      }
      continue;
    }
    const advance = dart === 'single' ? 1 : dart === 'double' ? 2 : 3;
    targetIndex = Math.min(targetIndex + advance, BULL_INDEX);
  }

  const isPerfect = allHit && !hitBull && dartResults.length === 3;

  return {
    newTargetIndex: targetIndex,
    isPerfect,
    hitBull,
    bullsHit,
  };
}

/**
 * Advance to next player, incrementing round when all players have thrown.
 */
export function nextPlayer(game) {
  const next = (game.currentPlayerIndex + 1) % game.players.length;
  const newRound = next === 0 ? game.round + 1 : game.round;
  return { ...game, currentPlayerIndex: next, round: newRound };
}

/**
 * Returns the exact total marks scored by a player.
 * A player on targetIndex scored targetIndex marks (0 on 20, 6 on 14, 20 on Bull).
 * A player who closed Bull (finished) scored 21 marks (20 to reach Bull + 1 to close Bull).
 */
export function getPlayerMarks(player) {
  if (!player) return 0;
  if (player.finished) return 21;
  const baseMarks = Math.min(player.targetIndex ?? 0, BULL_INDEX);
  if (typeof player.marks === 'number' && player.marks > 0) {
    return Math.min(Math.max(player.marks, baseMarks), 20);
  }
  return baseMarks;
}

/**
 * Merges two player states for the same player, preserving maximum progress.
 */
export function mergePlayerState(localP, remoteP) {
  if (!localP) return remoteP;
  if (!remoteP) return localP;

  const localRound = localP.roundCompleted ?? 0;
  const remoteRound = remoteP.roundCompleted ?? 0;
  const baseP = localRound >= remoteRound ? localP : remoteP;

  const isFinished = Boolean(localP.finished || remoteP.finished);
  let finishedRound = null;
  if (isFinished) {
    if (localP.finished && remoteP.finished) {
      finishedRound = Math.min(localP.finishedRound ?? 999, remoteP.finishedRound ?? 999);
    } else if (localP.finished) {
      finishedRound = localP.finishedRound;
    } else {
      finishedRound = remoteP.finishedRound;
    }
  }

  const targetIndex = Math.max(localP.targetIndex ?? 0, remoteP.targetIndex ?? 0);
  const marks = isFinished ? 21 : Math.min(
    Math.max(
      localP.marks ?? 0,
      remoteP.marks ?? 0,
      targetIndex
    ),
    20
  );

  return {
    ...baseP,
    targetIndex,
    roundCompleted: Math.max(localRound, remoteRound),
    finished: isFinished,
    finishedRound,
    lastIsPerfect: baseP.lastIsPerfect,
    perfectCount: Math.max(localP.perfectCount ?? 0, remoteP.perfectCount ?? 0),
    marks,
    darts: Math.max(localP.darts ?? 0, remoteP.darts ?? 0),
    bullsHit: Math.max(localP.bullsHit ?? 0, remoteP.bullsHit ?? 0),
    legsWon: Math.max(localP.legsWon ?? 0, remoteP.legsWon ?? 0),
    roundSnapshot: baseP.roundSnapshot || remoteP.roundSnapshot || localP.roundSnapshot || null,
  };
}

/**
 * Ends the game when a merge completes a round in which a player closed Bull.
 * handleTurnComplete only sees the round end if its device already has every other
 * turn, so turns submitted at the same moment have to be resolved here instead.
 */
function resolveCompletedRound(game) {
  if (game.view === 'winner' || game.view === 'playoff' || game.finalWinners?.length > 0) {
    return game;
  }

  const { players, round } = game;
  const roundComplete = players.length > 0 && players.every(
    p => p.finished || (p.roundCompleted ?? 0) >= round
  );
  const finishedPlayers = players.flatMap((p, i) => (p.finished ? [i] : []));
  if (!roundComplete || finishedPlayers.length === 0) {
    return game;
  }

  const resetPlayoff = { playoffScores: {}, playoffSubmitted: {}, playoffNumber: null, playoffRound: 1 };

  if (finishedPlayers.length > 1) {
    return { ...game, ...resetPlayoff, view: 'playoff', playoffPlayers: finishedPlayers, playoffStyle: null };
  }

  const winnerIdx = finishedPlayers[0];
  const winnerName = players[winnerIdx].name;
  const legsWonMap = { ...game.legsWonMap, [winnerName]: (game.legsWonMap?.[winnerName] || 0) + 1 };
  const updatedPlayers = players.map(p => ({ ...p, legsWon: legsWonMap[p.name] || 0 }));

  const marksMap = {};
  const dartsMap = {};
  const perfectsMap = {};
  updatedPlayers.forEach(p => {
    marksMap[p.name] = getPlayerMarks(p);
    dartsMap[p.name] = p.darts ?? 0;
    perfectsMap[p.name] = p.perfectCount ?? 0;
  });

  return {
    ...game,
    ...resetPlayoff,
    players: updatedPlayers,
    view: 'winner',
    finalWinners: [winnerIdx],
    finalStats: { rounds: round, marksMap, dartsMap, perfectsMap, legsWonMap },
    legsWonMap,
    legsBeforeResult: game.legsWonMap ?? {},
  };
}

/**
 * True when a player's last turn ended the round and nobody has thrown in the new round
 * yet. That turn can still be backed out, which is the only way for the last player to
 * throw in a round, or a solo player, to fix a mistake.
 */
export function canBackOutLastTurn(game, player) {
  if (!game || !player?.roundSnapshot || player.finished) return false;
  const round = game.round ?? 1;
  if (player.roundSnapshot.round !== round - 1 || (player.roundCompleted ?? 0) !== round - 1) return false;
  return (game.players || []).every(p => !p.finished && (p.roundCompleted ?? 0) < round);
}

/** Identifies one recorded result of a game, so a result that gets backed out can be voided. */
export function resultRecordId(game) {
  const seq = game?.resultSeq ?? 0;
  return seq > 0 ? `${game.gameId}#${seq}` : game?.gameId;
}

/** Record ids of every earlier result of this game, all of which were backed out. */
export function voidedRecordIds(game) {
  const ids = [];
  for (let seq = 0; seq < (game?.resultSeq ?? 0); seq++) {
    ids.push(resultRecordId({ gameId: game.gameId, resultSeq: seq }));
  }
  return ids;
}

function playerKey(player) {
  return player.name.trim().toLowerCase();
}

// When two phones choose a playoff format for the same playoff round, every phone keeps
// the same choice, so the players never throw at different targets.
function pickPlayoffChoice(localGame, remoteGame) {
  if (!localGame.playoffStyle) return remoteGame;
  if (!remoteGame.playoffStyle) return localGame;
  const choiceKey = g => `${g.playoffStyle}|${g.playoffNumber}`;
  return choiceKey(localGame) <= choiceKey(remoteGame) ? localGame : remoteGame;
}

/**
 * Intelligently merges local and remote game states to prevent race conditions or dropped turns.
 */
export function mergeGameState(localGame, remoteGame) {
  if (!localGame) return remoteGame;
  if (!remoteGame) return localGame;

  // If remote game is a completely different game (e.g. rematch or new room game started),
  // pick the newer game cleanly instead of merging finished game state into new game!
  if (localGame.gameId && remoteGame.gameId && localGame.gameId !== remoteGame.gameId) {
    const localCreated = localGame.createdAt || 0;
    const remoteCreated = remoteGame.createdAt || 0;
    if (remoteCreated > localCreated) {
      return remoteGame;
    } else if (localCreated > remoteCreated) {
      return localGame;
    } else {
      return remoteGame.gameId > localGame.gameId ? remoteGame : localGame;
    }
  }

  const localBackoutTime = localGame.backout?.timestamp || 0;
  const remoteBackoutTime = remoteGame.backout?.timestamp || 0;
  const isRemoteBackoutNewer = remoteBackoutTime > localBackoutTime;
  const isLocalBackoutNewer = localBackoutTime > remoteBackoutTime;
  // The side that has seen the newest backout decides the round, view and results.
  const backoutSide = isRemoteBackoutNewer ? remoteGame : isLocalBackoutNewer ? localGame : null;

  // When a player was backed out. Older versions of the app only record the newest
  // backout on the game, so fall back to that.
  const backedOutAt = (player, game) => {
    if (player.backoutAt) return player.backoutAt;
    const name = game.backout?.playerName?.trim().toLowerCase();
    return name && name === playerKey(player) ? (game.backout.timestamp || 0) : 0;
  };

  const playerMap = new Map();
  (localGame.players || []).forEach(p => {
    if (p.name) playerMap.set(playerKey(p), { ...p });
  });

  (remoteGame.players || []).forEach(p => {
    if (!p.name) return;
    const key = playerKey(p);
    const localP = playerMap.get(key);
    if (!localP) {
      playerMap.set(key, { ...p });
      return;
    }
    // A backout rolls a player back, so the copy that has seen the newer backout for
    // this player wins outright instead of merging toward the most progress.
    const localBackout = backedOutAt(localP, localGame);
    const remoteBackout = backedOutAt(p, remoteGame);
    if (remoteBackout > localBackout) {
      playerMap.set(key, { ...p });
    } else if (remoteBackout === localBackout) {
      playerMap.set(key, mergePlayerState(localP, p));
    }
  });

  const mergedPlayers = Array.from(playerMap.values());

  const localRound = localGame.round ?? 1;
  const remoteRound = remoteGame.round ?? 1;
  let currentRound = backoutSide ? (backoutSide.round ?? 1) : Math.max(localRound, remoteRound);

  // View state precedence
  let view = backoutSide
    ? (backoutSide.view || 'scoring')
    : (remoteGame.view || localGame.view || 'scoring');

  if (!backoutSide) {
    if (localGame.view === 'winner' || remoteGame.view === 'winner') {
      view = 'winner';
    } else if (localGame.view === 'playoff' || remoteGame.view === 'playoff') {
      view = 'playoff';
    }
  }

  const isGameOverOrPlayoff = view === 'winner' || view === 'playoff' ||
    (!backoutSide && (
      localGame.view === 'winner' || remoteGame.view === 'winner' ||
      localGame.view === 'playoff' || remoteGame.view === 'playoff'
    )) ||
    mergedPlayers.some(p => p.finished);

  // Check if ALL non-finished players have completed currentRound
  const allCompletedCurrentRound = mergedPlayers.length > 0 && mergedPlayers.every(
    p => p.finished || (p.roundCompleted ?? 0) >= currentRound
  );

  if (allCompletedCurrentRound && !isGameOverOrPlayoff) {
    currentRound += 1;
  }

  // Playoff state. A backout resets the playoff, so the backout side's copy wins.
  let playoffRound;
  let playoffScores;
  let playoffSubmitted;
  let playoffChoice;
  let playoffPlayers;
  if (backoutSide) {
    playoffRound = backoutSide.playoffRound ?? 1;
    playoffScores = backoutSide.playoffScores || {};
    playoffSubmitted = backoutSide.playoffSubmitted || {};
    playoffChoice = backoutSide;
    playoffPlayers = backoutSide.playoffPlayers || [];
  } else {
    const localPlayoffRound = localGame.playoffRound ?? 1;
    const remotePlayoffRound = remoteGame.playoffRound ?? 1;
    playoffRound = Math.max(localPlayoffRound, remotePlayoffRound);
    if (localPlayoffRound === remotePlayoffRound) {
      playoffScores = { ...remoteGame.playoffScores, ...localGame.playoffScores };
      playoffSubmitted = { ...remoteGame.playoffSubmitted, ...localGame.playoffSubmitted };
      playoffChoice = pickPlayoffChoice(localGame, remoteGame);
    } else {
      const newerPlayoff = remotePlayoffRound > localPlayoffRound ? remoteGame : localGame;
      playoffScores = newerPlayoff.playoffScores || {};
      playoffSubmitted = newerPlayoff.playoffSubmitted || {};
      playoffChoice = newerPlayoff;
    }
    playoffPlayers = remoteGame.playoffPlayers?.length ? remoteGame.playoffPlayers : (localGame.playoffPlayers || []);
  }
  const tieBreaker = localGame.tieBreaker || remoteGame.tieBreaker || 'playoff';

  // Results and leg counts come from the side that has the result, or from the backout
  // side, which has already undone it.
  const resultSide = backoutSide ??
    (remoteGame.finalWinners?.length ? remoteGame : localGame.finalWinners?.length ? localGame : null);
  const legsWonMap = resultSide
    ? { ...resultSide.legsWonMap }
    : { ...remoteGame.legsWonMap, ...localGame.legsWonMap };
  const finalWinners = resultSide?.finalWinners || [];
  const finalStats = resultSide?.finalStats || null;
  const legsBeforeResult = resultSide ? (resultSide.legsBeforeResult ?? null) : null;
  const backout = isRemoteBackoutNewer ? remoteGame.backout : (localGame.backout || null);

  return resolveCompletedRound({
    ...remoteGame,
    ...localGame,
    gameId: localGame.gameId || remoteGame.gameId,
    createdAt: localGame.createdAt || remoteGame.createdAt,
    tieBreaker,
    players: mergedPlayers,
    round: currentRound,
    currentPlayerIndex: localGame.round >= remoteGame.round ? (localGame.currentPlayerIndex ?? 0) : (remoteGame.currentPlayerIndex ?? 0),
    view,
    playoffRound,
    playoffStyle: playoffChoice.playoffStyle || null,
    playoffScores,
    playoffSubmitted,
    playoffNumber: playoffChoice.playoffNumber ?? null,
    playoffPlayers,
    legsWonMap,
    legsBeforeResult,
    finalWinners,
    finalStats,
    resultSeq: Math.max(localGame.resultSeq ?? 0, remoteGame.resultSeq ?? 0),
    backout,
  });
}
