import { getNetworkLoggedUsers, publishNetworkPresence } from './networkSync.js';

const ACCOUNTS_KEY = 'jf:accounts_v2';
const SESSION_KEY = 'jf:session_v2';
const LEGACY_SESSION_KEY = 'jf:session';
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
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch { /* ignore */ }
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

function normalizeEmail(email) {
  return email?.trim().toLowerCase() ?? '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Register a new user with email, password, and player display name.
 * Returns { ok: true, user: { email, displayName } } or { ok: false, error: string }.
 */
export function register(email, password, displayName) {
  const normEmail = normalizeEmail(email);
  const name = displayName?.trim();
  const pass = password ?? '';

  if (!normEmail || !isValidEmail(normEmail)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!name || name.length < 2) {
    return { ok: false, error: 'Display name must be at least 2 characters.' };
  }
  if (name.length > 20) {
    return { ok: false, error: 'Display name must be 20 characters or less.' };
  }
  if (!pass || pass.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters long.' };
  }

  const accounts = loadAccounts();
  if (accounts[normEmail]) {
    return { ok: false, error: 'An account with this email already exists.' };
  }

  const account = {
    email: normEmail,
    password: pass,
    displayName: name,
    createdAt: Date.now(),
  };

  accounts[normEmail] = account;
  saveAccounts(accounts);
  setSession(account);
  refreshLoggedUserPresence(name);

  return { ok: true, user: { email: normEmail, displayName: name } };
}

/**
 * Login with email and password.
 * Returns { ok: true, user: { email, displayName } } or { ok: false, error: string }.
 */
export function login(email, password) {
  const normEmail = normalizeEmail(email);
  const pass = password ?? '';

  if (!normEmail || !isValidEmail(normEmail)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!pass) {
    return { ok: false, error: 'Please enter your password.' };
  }

  const accounts = loadAccounts();
  const account = accounts[normEmail];

  if (!account || account.password !== pass) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  setSession(account);
  refreshLoggedUserPresence(account.displayName);

  return { ok: true, user: { email: account.email, displayName: account.displayName } };
}

function setSession(account) {
  const data = JSON.stringify({ email: account.email, displayName: account.displayName });
  try {
    sessionStorage.setItem(SESSION_KEY, data);
    localStorage.setItem(SESSION_KEY, data);
    sessionStorage.setItem(LEGACY_SESSION_KEY, account.displayName);
    localStorage.setItem(LEGACY_SESSION_KEY, account.displayName);
  } catch { /* ignore */ }
}

/** Returns the logged-in user object { email, displayName }, or null if not logged in. */
export function getLoggedInSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }

  const legacy = sessionStorage.getItem(LEGACY_SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
  if (legacy) return { email: '', displayName: legacy };

  return null;
}

/** Returns the logged-in display name, or null if not logged in. */
export function getLoggedInUser() {
  const session = getLoggedInSession();
  return session?.displayName ?? null;
}

/** Returns the logged-in email, or null if not logged in. */
export function getLoggedInUserEmail() {
  const session = getLoggedInSession();
  return session?.email ?? null;
}

/** Logs out the current user. */
export function logout() {
  const user = getLoggedInUser();
  if (user) clearLoggedUserPresence(user);
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch { /* ignore */ }
  broadcastLobbyUpdate();
}

/**
 * Permanently deletes the current user's account and local data.
 * Complies with Apple App Store Guideline 5.1.1(v).
 */
export function deleteAccount() {
  const session = getLoggedInSession();
  const user = session?.displayName;
  const email = session?.email;

  if (email) {
    const accounts = loadAccounts();
    delete accounts[email];
    saveAccounts(accounts);
  }

  if (user) {
    clearLoggedUserPresence(user);
  }

  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch { /* ignore */ }

  broadcastLobbyUpdate();
  return { ok: true };
}
