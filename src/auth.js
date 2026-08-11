const ACCOUNTS_KEY = 'jf:accounts';
const SESSION_KEY = 'jf:session';
const PRESENCE_PREFIX = 'jf:logged-user:';
const PRESENCE_TTL_MS = 30000;

function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) ?? {};
  } catch {
    return {};
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function isFresh(updatedAt, ttlMs) {
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= ttlMs;
}

export function broadcastLobbyUpdate() {
  try {
    const ch = new BroadcastChannel('jf:lobby');
    ch.postMessage({ type: 'presence_update' });
    ch.close();
  } catch { /* ignore */ }
}

export function refreshLoggedUserPresence(username) {
  const name = username?.trim();
  if (!name) return;
  localStorage.setItem(`${PRESENCE_PREFIX}${name.toLowerCase()}`, JSON.stringify({
    username: name,
    updatedAt: Date.now(),
  }));
  broadcastLobbyUpdate();
}

function clearLoggedUserPresence(username) {
  const name = username?.trim();
  if (!name) return;
  localStorage.removeItem(`${PRESENCE_PREFIX}${name.toLowerCase()}`);
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
  staleKeys.forEach(key => localStorage.removeItem(key));
  return [...new Set(users)].sort((a, b) => a.localeCompare(b));
}

/**
 * Register a new user with a username and 4-digit PIN.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export function register(username, pin) {
  const name = username.trim();
  if (!name) return { ok: false, error: 'Please enter a username.' };
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: 'PIN must be exactly 4 digits.' };

  const accounts = loadAccounts();
  if (accounts[name.toLowerCase()]) return { ok: false, error: 'Username already taken.' };

  accounts[name.toLowerCase()] = { username: name, pin };
  saveAccounts(accounts);
  setSession(name);
  refreshLoggedUserPresence(name);
  return { ok: true };
}

/**
 * Login with username and 4-digit PIN.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export function login(username, pin) {
  const name = username.trim();
  if (!name) return { ok: false, error: 'Please enter a username.' };
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: 'PIN must be exactly 4 digits.' };

  const accounts = loadAccounts();
  const account = accounts[name.toLowerCase()];
  if (!account) return { ok: false, error: 'Username not found.' };
  if (account.pin !== pin) return { ok: false, error: 'Incorrect PIN.' };

  setSession(account.username);
  refreshLoggedUserPresence(account.username);
  return { ok: true };
}

function setSession(username) {
  sessionStorage.setItem(SESSION_KEY, username);
  localStorage.setItem(SESSION_KEY, username);
}

/** Returns the logged-in username, or null if not logged in. */
export function getLoggedInUser() {
  return sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY) ?? null;
}

/** Logs out the current user. */
export function logout() {
  const user = getLoggedInUser();
  clearLoggedUserPresence(user);
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  broadcastLobbyUpdate();
}

