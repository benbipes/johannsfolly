import { getNetworkLoggedUsers, publishNetworkPresence } from './networkSync.js';
import { findKnownName, preferredName } from './leaderboard.js';

const NAME_KEY = 'jf:player_name';
const OLD_SESSION_KEY = 'jf:session_v4';
const PRESENCE_PREFIX = 'jf:logged-user:';
const PRESENCE_TTL_MS = 30000;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 20;

function removeKeysStartingWith(storage, prefixes) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key && prefixes.some(prefix => key.startsWith(prefix))) {
      storage.removeItem(key);
    }
  }
}

function readOldSessionName() {
  const raw = localStorage.getItem(OLD_SESSION_KEY) || sessionStorage.getItem(OLD_SESSION_KEY);
  return raw ? JSON.parse(raw)?.displayName?.trim() || null : null;
}

/**
 * Keeps the name of anyone signed in under the old account system, then removes the
 * stored accounts, passwords and sessions from this device.
 */
export function removeOldAccountData() {
  try {
    const name = readOldSessionName();
    if (name && !localStorage.getItem(NAME_KEY)) {
      localStorage.setItem(NAME_KEY, name);
    }
  } catch { /* ignore unreadable old sessions */ }

  try {
    removeKeysStartingWith(localStorage, ['jf:accounts', 'jf:session', PRESENCE_PREFIX, 'room-player:']);
    removeKeysStartingWith(sessionStorage, ['jf:session']);
  } catch { /* ignore */ }
}

if (typeof localStorage !== 'undefined' && typeof sessionStorage !== 'undefined') {
  removeOldAccountData();
}

function isFresh(updatedAt, ttlMs) {
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= ttlMs;
}

function broadcastLobbyUpdate() {
  try {
    const ch = new BroadcastChannel('jf:lobby');
    ch.postMessage({ type: 'presence_update' });
    ch.close();
  } catch { /* ignore */ }
}

export function refreshLoggedUserPresence(username) {
  const name = username?.trim();
  if (!name) return;
  try {
    localStorage.setItem(`${PRESENCE_PREFIX}${name.toLowerCase()}`, JSON.stringify({
      username: name,
      updatedAt: Date.now(),
    }));
  } catch { /* ignore */ }
  publishNetworkPresence(name);
  broadcastLobbyUpdate();
}

function clearLoggedUserPresence(username) {
  const name = username?.trim();
  if (!name) return;
  try {
    localStorage.removeItem(`${PRESENCE_PREFIX}${name.toLowerCase()}`);
  } catch { /* ignore */ }
  broadcastLobbyUpdate();
}

export function getLoggedUsers() {
  const users = [];
  const staleKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PRESENCE_PREFIX)) continue;
    try {
      const val = JSON.parse(localStorage.getItem(key));
      const username = val?.username?.trim() ?? key.slice(PRESENCE_PREFIX.length);
      const updatedAt = Number(val?.updatedAt);
      if (username && isFresh(updatedAt, PRESENCE_TTL_MS)) {
        users.push(username);
      } else {
        staleKeys.push(key);
      }
    } catch {
      staleKeys.push(key);
    }
  }
  staleKeys.forEach(key => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });

  const netUsers = getNetworkLoggedUsers();
  const allUsers = [...new Set([...users, ...netUsers])];
  return allUsers.sort((a, b) => a.localeCompare(b));
}

/** Returns this device's player name, or null if none has been chosen. */
export function getSavedName() {
  try {
    return preferredName(localStorage.getItem(NAME_KEY));
  } catch {
    return null;
  }
}

/**
 * Saves this device's player name. A name already on the leaderboard keeps its exact
 * spelling, so a different capitalization can't split someone's history.
 * Returns { ok: true, name } or { ok: false, error }.
 */
export function savePlayerName(input) {
  const typed = input?.trim() ?? '';
  const knownName = findKnownName(typed);

  if (!knownName && typed.length < MIN_NAME_LENGTH) {
    return { ok: false, error: `Name must be at least ${MIN_NAME_LENGTH} characters.` };
  }
  if (!knownName && typed.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Name must be ${MAX_NAME_LENGTH} characters or less.` };
  }

  const name = knownName ?? preferredName(typed);
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch { /* ignore */ }
  return { ok: true, name };
}

/** Forgets this device's player name so a different one can be chosen. */
export function forgetName() {
  clearLoggedUserPresence(getSavedName());
  try {
    localStorage.removeItem(NAME_KEY);
  } catch { /* ignore */ }
}
