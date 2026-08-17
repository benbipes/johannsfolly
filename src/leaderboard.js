/**
 * Leaderboard persistence helpers.
 * All data is stored in localStorage under the key 'jf:leaderboard'.
 *
 * Schema:
 *   {
 *     recordedIds: { [gameId]: true },
 *     players: { [playerName]: { wins: number, games: GameStat[] } }
 *   }
 */

const STORAGE_KEY = 'jf:leaderboard';

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { players: {}, recordedIds: {} };
    const parsed = JSON.parse(raw);
    if (!parsed.players) {
      return { players: parsed, recordedIds: {} };
    }
    return parsed;
  } catch {
    return { players: {}, recordedIds: {} };
  }
}

function saveRaw(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore quota errors */ }
}

/**
 * Record a completed game's stats for every logged player.
 * Deduplicates by gameId so each device records the game exactly once.
 */
export function recordGame(players, winnerIndices, totalRounds, marksPerPlayer, dartsPerPlayer, gameId) {
  if (!players || !Array.isArray(players) || !winnerIndices || !Array.isArray(winnerIndices) || winnerIndices.length === 0) {
    return;
  }

  const data = loadRaw();
  if (!data.recordedIds) data.recordedIds = {};

  const gId = gameId || `g_${totalRounds}_${winnerIndices.join('-')}_${players.map(p => p.name).join('-')}`;
  if (data.recordedIds[gId]) {
    return; // Already recorded on this device!
  }
  data.recordedIds[gId] = true;

  const date = new Date().toISOString();
  if (!data.players) data.players = {};

  players.forEach((player, i) => {
    const name = player.name;
    if (!name) return;
    if (!data.players[name]) {
      data.players[name] = { wins: 0, games: [] };
    }
    const isWinner = winnerIndices.includes(i);
    const marks = marksPerPlayer?.[name] ?? player.targetIndex ?? 0;
    const darts = dartsPerPlayer?.[name] ?? 0;
    const perfects = player.perfectCount ?? 0;

    if (isWinner) data.players[name].wins += 1;

    data.players[name].games.push({
      date,
      won: isWinner,
      rounds: totalRounds,
      totalDarts: darts,
      totalMarks: marks,
      totalPerfects: perfects,
    });

    if (data.players[name].games.length > 100) {
      data.players[name].games = data.players[name].games.slice(-100);
    }
  });

  saveRaw(data);
}

/**
 * Returns an array of player stats sorted by wins (desc), then avgMPR (desc).
 */
export function getLeaderboard() {
  const data = loadRaw();
  const playersMap = data.players || data;

  return Object.entries(playersMap)
    .filter(([name]) => name && name !== 'players' && name !== 'recordedIds')
    .map(([name, stats]) => {
      const games = stats.games ?? [];
      const totalMarks = games.reduce((s, g) => s + (g.totalMarks || 0), 0);
      const totalRounds = games.reduce((s, g) => s + (g.rounds || 0), 0);
      const totalPerfects = games.reduce((s, g) => s + (g.totalPerfects || 0), 0);
      const avgMPR = games.length > 0 && totalRounds > 0 ? totalMarks / totalRounds : 0;
      const avgRounds = games.length > 0 ? totalRounds / games.length : 0;
      const lastGame = games.length > 0 ? games[games.length - 1] : null;

      return {
        name,
        wins: stats.wins ?? 0,
        games: games.length,
        avgMPR,
        avgRounds,
        totalPerfects,
        lastGame,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.avgMPR - a.avgMPR);
}

/** Remove all leaderboard data (reset). */
export function clearLeaderboard() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
