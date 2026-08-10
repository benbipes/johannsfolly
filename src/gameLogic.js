// Target sequence: 20 down to 1, then Bull (25)
export const TARGET_SEQUENCE = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 'Bull'];
export const BULL_INDEX = TARGET_SEQUENCE.length - 1; // 20

export function createPlayer(name) {
  return {
    name,
    targetIndex: 0, // starts at 20
    finished: false,
    finishedRound: null,
  };
}

export function createGame(playerNames) {
  return {
    players: playerNames.map(createPlayer),
    round: 1,
    currentPlayerIndex: 0,
    phase: 'playing', // 'playing' | 'playoff_pick' | 'playoff' | 'done'
    winnersThisRound: [], // player indices who hit bull this round
    playoffNumber: null,
    playoffScores: {}, // playerIndex -> count of hits
    playoffCurrentIndex: 0, // which playoff player is currently throwing
    gameWinner: null, // player index if sole winner
  };
}

/**
 * Process a set of dart results for the current player.
 * dartResults: array of 'miss' | 'single' | 'double' | 'triple'
 * Returns { newPlayer, isPerfect, hitBull }
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
    const advance = dart === 'single' ? 1 : dart === 'double' ? 2 : 3;
    const newIndex = Math.min(targetIndex + advance, BULL_INDEX);
    targetIndex = newIndex;
    if (targetIndex === BULL_INDEX) {
      hitBull = true;
      break;
    }
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
