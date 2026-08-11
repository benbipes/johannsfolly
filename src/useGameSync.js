import { useEffect, useRef, useCallback } from 'react';

const LOBBY_CHANNEL = 'jf:lobby';
const ROOM_PREFIX = 'room:';
const PLAYER_PREFIX = 'room-player:';
const ROOM_TTL_MS = 15000;
const PLAYER_TTL_MS = 15000;

function isFresh(updatedAt, ttlMs) {
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= ttlMs;
}

/**
 * Announce a room to other lobby tabs via BroadcastChannel and localStorage.
 * @param {string} roomCode
 * @param {'open'|'closed'} status
 */
export function announceRoom(roomCode, status) {
  localStorage.setItem(`${ROOM_PREFIX}${roomCode}`, JSON.stringify({ code: roomCode, status, updatedAt: Date.now() }));
  try {
    const ch = new BroadcastChannel(LOBBY_CHANNEL);
    ch.postMessage({ type: 'room_update', roomCode, status });
    ch.close();
  } catch { /* ignore */ }
}

/**
 * Get all open rooms stored in localStorage.
 * @returns {{ code: string }[]}
 */
export function getOpenRooms() {
  const rooms = [];
  const staleKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(ROOM_PREFIX)) {
      try {
        const val = JSON.parse(localStorage.getItem(key));
        const updatedAt = Number(val?.updatedAt);
        if (val?.status === 'open' && val.code && isFresh(updatedAt, ROOM_TTL_MS)) {
          rooms.push({ code: val.code });
        } else if (!val || val.status !== 'open' || !isFresh(updatedAt, ROOM_TTL_MS)) {
          staleKeys.push(key);
        }
      } catch { /* ignore */ }
    }
  }
  staleKeys.forEach(key => localStorage.removeItem(key));
  return rooms;
}

export function setRoomPlayerPresence(roomCode, playerName) {
  localStorage.setItem(`${PLAYER_PREFIX}${roomCode}:${playerName}`, JSON.stringify({ playerName, updatedAt: Date.now() }));
}

export function removeRoomPlayerPresence(roomCode, playerName) {
  localStorage.removeItem(`${PLAYER_PREFIX}${roomCode}:${playerName}`);
}

export function getActiveRoomPlayers(roomCode) {
  const prefix = `${PLAYER_PREFIX}${roomCode}:`;
  const joined = [];
  const staleKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      try {
        const val = JSON.parse(localStorage.getItem(key));
        const playerName = val?.playerName ?? key.slice(prefix.length);
        const updatedAt = Number(val?.updatedAt);
        if (playerName && isFresh(updatedAt, PLAYER_TTL_MS)) {
          joined.push(playerName);
        } else {
          staleKeys.push(key);
        }
      } catch {
        staleKeys.push(key);
      }
    }
  }
  staleKeys.forEach(key => localStorage.removeItem(key));
  return joined;
}

export function clearRoom(roomCode) {
  localStorage.removeItem(`${ROOM_PREFIX}${roomCode}`);
}

export function clearRoomPlayers(roomCode) {
  const prefix = `${PLAYER_PREFIX}${roomCode}:`;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) keys.push(key);
  }
  keys.forEach(key => localStorage.removeItem(key));
}

/**
 * Syncs game state across browser tabs/windows on the same origin using
 * BroadcastChannel + localStorage as a fallback.
 *
 * Any participating tab calls `broadcast(game)` to share updated state.
 * All *other* tabs receive state updates via `onGameUpdate`.
 * (BroadcastChannel does not deliver messages back to the sender.)
 *
 * @param {string|null} roomCode     - The current room code, or null if no room.
 * @param {function}    onGameUpdate - Called with (game) when remote state arrives.
 */
export function useGameSync(roomCode, onGameUpdate) {
  const channelRef = useRef(null);
  const onUpdateRef = useRef(onGameUpdate);
  onUpdateRef.current = onGameUpdate;

  useEffect(() => {
    if (!roomCode) return;

    const channel = new BroadcastChannel(`jf:room:${roomCode}`);
    channelRef.current = channel;

    channel.onmessage = (event) => {
      if (event.data?.type === 'game_state') {
        onUpdateRef.current(event.data.game);
      }
    };

    // Pick up any state set before this tab opened the channel
    const stored = localStorage.getItem(`game:${roomCode}`);
    if (stored) {
      try { onUpdateRef.current(JSON.parse(stored)); } catch { /* ignore */ }
    }

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [roomCode]);

  const broadcast = useCallback((game) => {
    if (!roomCode) return;
    // Persist to localStorage so late-joining tabs can catch up
    localStorage.setItem(`game:${roomCode}`, JSON.stringify(game));
    channelRef.current?.postMessage({ type: 'game_state', game });
  }, [roomCode]);

  return { broadcast };
}
