import {
  publishNetworkLeaderboard,
  subscribeNetworkLeaderboard,
} from './networkSync.js';

const STORAGE_KEY = 'jf:leaderboard';
const CHANNEL_NAME = 'jf:leaderboard';

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
 * Merges remote raw leaderboard data into local raw leaderboard data.
 * Returns true if new games were added.
 */
export function mergeLeaderboardData(remoteData) {
  if (!remoteData || !remoteData.players) return false;
  const localData = loadRaw();
  let changed = false;

  if (!localData.recordedIds) localData.recordedIds = {};
  if (!localData.players) localData.players = {};

  const remoteRecordedIds = remoteData.recordedIds || {};
  const remotePlayers = remoteData.players || {};

  Object.keys(remoteRecordedIds).forEach(gId => {
    if (!localData.recordedIds[gId]) {
      localData.recordedIds[gId] = true;
      changed = true;
    }
  });

  Object.entries(remotePlayers).forEach(([name, remoteStats]) => {
    if (!name || name === 'recordedIds' || name === 'players') return;
    if (!localData.players[name]) {
      localData.players[name] = { wins: 0, games: [] };
      changed = true;
    }

    const localPlayer = localData.players[name];
    const remoteGames = remoteStats.games || [];

    remoteGames.forEach(g => {
      const exists = localPlayer.games.some(lg => (lg.gameId && lg.gameId === g.gameId) || (lg.date === g.date && lg.rounds === g.rounds));
      if (!exists) {
        localPlayer.games.push(g);
        changed = true;
      }
    });

    const actualWins = localPlayer.games.filter(g => g.won).length;
    if (localPlayer.wins !== actualWins) {
      localPlayer.wins = actualWins;
      changed = true;
    }

    if (localPlayer.games.length > 200) {
      localPlayer.games = localPlayer.games.slice(-200);
    }
  });

  if (changed) {
    saveRaw(localData);
  }
  return changed;
}

export function broadcastLeaderboardData() {
  const data = loadRaw();
  const payload = { type: 'leaderboard_sync', data };
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage(payload);
    ch.close();
  } catch { /* ignore */ }
  publishNetworkLeaderboard(payload);
}

export function requestLeaderboardSync() {
  const payload = { type: 'leaderboard_request' };
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage(payload);
    ch.close();
  } catch { /* ignore */ }
  publishNetworkLeaderboard(payload);
}

// Setup background listeners
if (typeof window !== 'undefined') {
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.onmessage = (evt) => {
      if (evt.data?.type === 'leaderboard_sync' && evt.data.data) {
        mergeLeaderboardData(evt.data.data);
      } else if (evt.data?.type === 'leaderboard_request') {
        broadcastLeaderboardData();
      }
    };
  } catch { /* ignore */ }

  subscribeNetworkLeaderboard((msg) => {
    if (msg?.type === 'leaderboard_sync' && msg.data) {
      mergeLeaderboardData(msg.data);
    } else if (msg?.type === 'leaderboard_request') {
      broadcastLeaderboardData();
    }
  });

  setTimeout(() => requestLeaderboardSync(), 1000);
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

    const pRounds = player.finished ? (player.finishedRound ?? totalRounds) : totalRounds;

    data.players[name].games.push({
      gameId: gId,
      date,
      won: isWinner,
      rounds: pRounds,
      totalDarts: darts,
      totalMarks: marks,
      totalPerfects: perfects,
    });

    if (data.players[name].games.length > 200) {
      data.players[name].games = data.players[name].games.slice(-200);
    }
  });

  saveRaw(data);
  broadcastLeaderboardData();
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
      const wins = games.filter(g => g.won).length;
      const avgMPR = games.length > 0 && totalRounds > 0 ? totalMarks / totalRounds : 0;
      const avgRounds = games.length > 0 ? totalRounds / games.length : 0;
      const lastGame = games.length > 0 ? games[games.length - 1] : null;

      return {
        name,
        wins,
        games: games.length,
        avgMPR,
        avgRounds,
        totalPerfects,
        lastGame,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.avgMPR - a.avgMPR);
}

/** Remove all leaderboard data and broadcast reset to all clients. */
export function clearLeaderboard() {
  try {
    const emptyData = { players: {}, recordedIds: {} };
    saveRaw(emptyData);
    const payload = { type: 'leaderboard_sync', data: emptyData };
    try {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      ch.postMessage(payload);
      ch.close();
    } catch { /* ignore */ }
    publishNetworkLeaderboard(payload);
  } catch { /* ignore */ }
}

/** Clear all leaderboard data AND all local game/room/user cache keys for a fresh start. */
export function clearAllGameData() {
  try {
    clearLeaderboard();
    localStorage.clear();
    sessionStorage.clear();
  } catch { /* ignore */ }
}
