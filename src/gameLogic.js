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
    legsWon: legsWon || 0,
  };
}

export function createGame(playerNames, legsWonMap = {}) {
  return {
    gameId: 'game_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    players: playerNames.map(name => createPlayer(name, legsWonMap[name] || 0)),
    round: 1,
    currentPlayerIndex: 0,
    phase: 'playing', // 'playing' | 'playoff_pick' | 'playoff' | 'done'
    winnersThisRound: [], // player indices who hit bull this round
    playoffNumber: null,
    playoffScores: {}, // playerIndex -> count of hits
    playoffCurrentIndex: 0, // which playoff player is currently throwing
    gameWinner: null, // player index if sole winner
    legsWonMap: legsWonMap || {},
  };
}

/**
 * Process a set of dart results for the current player.
 * dartResults: array of 'miss' | 'single' | 'double' | 'triple'
 * Returns { newTargetIndex, isPerfect, hitBull }
 */
export function processDarts(player, dartResults) {
  let targetIndex = player.targetIndex;
  let allHit = true;
  let hitBull = false;

  for (const dart of dartResults) {
    if (dart === 'miss') {
      allHit = false;
      continue;
    }
    if (targetIndex === BULL_INDEX) {
      hitBull = true;
      break;
    }
    const advance = dart === 'single' ? 1 : dart === 'double' ? 2 : 3;
    targetIndex = Math.min(targetIndex + advance, BULL_INDEX);
  }

  const isPerfect = allHit && !hitBull && dartResults.length === 3;

  return {
    newTargetIndex: targetIndex,
    isPerfect,
    hitBull,
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

  return {
    ...baseP,
    targetIndex: Math.max(localP.targetIndex ?? 0, remoteP.targetIndex ?? 0),
    roundCompleted: Math.max(localRound, remoteRound),
    finished: isFinished,
    finishedRound,
    lastIsPerfect: baseP.lastIsPerfect,
    perfectCount: Math.max(localP.perfectCount ?? 0, remoteP.perfectCount ?? 0),
    marks: Math.max(localP.marks ?? 0, remoteP.marks ?? 0),
    darts: Math.max(localP.darts ?? 0, remoteP.darts ?? 0),
    legsWon: Math.max(localP.legsWon ?? 0, remoteP.legsWon ?? 0),
  };
}

/**
 * Intelligently merges local and remote game states to prevent race conditions or dropped turns.
 */
export function mergeGameState(localGame, remoteGame) {
  if (!localGame) return remoteGame;
  if (!remoteGame) return localGame;

  const playerMap = new Map();

  // Process local players
  (localGame.players || []).forEach(p => {
    if (p.name) {
      const key = p.name.trim().toLowerCase();
      playerMap.set(key, { ...p });
    }
  });

  // Merge remote players
  (remoteGame.players || []).forEach(p => {
    if (p.name) {
      const key = p.name.trim().toLowerCase();
      if (playerMap.has(key)) {
        playerMap.set(key, mergePlayerState(playerMap.get(key), p));
      } else {
        playerMap.set(key, { ...p });
      }
    }
  });

  const mergedPlayers = Array.from(playerMap.values());

  const localRound = localGame.round ?? 1;
  const remoteRound = remoteGame.round ?? 1;
  let currentRound = Math.max(localRound, remoteRound);

  // Check if ALL non-finished players have completed currentRound
  const allCompletedCurrentRound = mergedPlayers.length > 0 && mergedPlayers.every(
    p => p.finished || (p.roundCompleted ?? 0) >= currentRound
  );

  if (allCompletedCurrentRound) {
    currentRound += 1;
  }

  // View state precedence
  let view = remoteGame.view || localGame.view || 'scoring';
  if (localGame.view === 'winner' || remoteGame.view === 'winner') {
    view = 'winner';
  } else if (localGame.view === 'playoff' || remoteGame.view === 'playoff') {
    view = 'playoff';
  }

  const legsWonMap = {
    ...remoteGame.legsWonMap,
    ...localGame.legsWonMap,
  };

  return {
    ...remoteGame,
    ...localGame,
    gameId: localGame.gameId || remoteGame.gameId,
    players: mergedPlayers,
    round: currentRound,
    currentPlayerIndex: localGame.round >= remoteGame.round ? (localGame.currentPlayerIndex ?? 0) : (remoteGame.currentPlayerIndex ?? 0),
    view,
    legsWonMap,
  };
}

