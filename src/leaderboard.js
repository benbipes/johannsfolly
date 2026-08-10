/**
 * Leaderboard persistence helpers.
 * All data is stored in localStorage under the key 'jf:leaderboard'.
 *
 * Schema:
 *   { [playerName]: { wins: number, games: GameStat[] } }
 *
 * GameStat:
 *   { date: string (ISO), won: boolean, rounds: number, totalDarts: number, totalMarks: number }
 *
 * MPR (marks per round) = totalMarks / rounds
 * A "mark" is how many positions the player advanced during the game.
 * Positions advanced = final targetIndex (out of 21 targets, 0 = at 20, 20 = Bull).
 */

const STORAGE_KEY = 'jf:leaderboard';

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRaw(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore quota errors */ }
}

/**
 * Record a completed game's stats for every logged player.
 *
 * @param {object[]} players   - Array of player objects from the game state.
 *                               Each has { name, targetIndex, finished, finishedRound }.
 * @param {number[]} winnerIndices - Indices (into players) of the winner(s).
 * @param {number}   totalRounds  - Number of rounds the game ran.
 * @param {{ [name]: number }} marksPerPlayer - Total marks (positions advanced) per player name.
 * @param {{ [name]: number }} dartsPerPlayer - Total darts thrown per player name.
 */
export function recordGame(players, winnerIndices, totalRounds, marksPerPlayer, dartsPerPlayer) {
  const data = loadRaw();
  const date = new Date().toISOString();

  players.forEach((player, i) => {
    const name = player.name;
    if (!data[name]) {
      data[name] = { wins: 0, games: [] };
    }
    const isWinner = winnerIndices.includes(i);
    const marks = marksPerPlayer[name] ?? player.targetIndex; // fallback to final targetIndex
    const darts = dartsPerPlayer[name] ?? 0;

    if (isWinner) data[name].wins += 1;

    data[name].games.push({
      date,
      won: isWinner,
      rounds: totalRounds,
      totalDarts: darts,
      totalMarks: marks,
    });

    // Keep only the last 100 games per player to cap storage
    if (data[name].games.length > 100) {
      data[name].games = data[name].games.slice(-100);
    }
  });

  saveRaw(data);
}

/**
 * Returns an array of player stats sorted by wins (desc), then avgMPR (desc).
 * Each entry: { name, wins, games, avgMPR, avgRounds, lastGame }
 */
export function getLeaderboard() {
  const data = loadRaw();

  return Object.entries(data)
    .map(([name, stats]) => {
      const games = stats.games ?? [];
      const totalMarks = games.reduce((s, g) => s + (g.totalMarks || 0), 0);
      const totalRounds = games.reduce((s, g) => s + (g.rounds || 0), 0);
      const avgMPR = games.length > 0 && totalRounds > 0 ? totalMarks / totalRounds : 0;
      const avgRounds = games.length > 0 ? totalRounds / games.length : 0;
      const lastGame = games.length > 0 ? games[games.length - 1] : null;

      return {
        name,
        wins: stats.wins ?? 0,
        games: games.length,
        avgMPR,
        avgRounds,
        lastGame,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.avgMPR - a.avgMPR);
}

/** Remove all leaderboard data (used in tests / reset). */
export function clearLeaderboard() {
  localStorage.removeItem(STORAGE_KEY);
}
