import {
  getNetworkLoggedUsers,
  publishNetworkPresence,
  publishNetworkAccounts,
  subscribeNetworkAccounts,
} from './networkSync.js';

const ACCOUNTS_KEY = 'jf:accounts_v4';
const SESSION_KEY = 'jf:session_v4';
const PRESENCE_PREFIX = 'jf:logged-user:';
const PRESENCE_TTL_MS = 30000;
const CHANNEL_NAME = 'jf:accounts';

// Force clear all legacy accounts and sessions so all players register fresh accounts from scratch
if (typeof localStorage !== 'undefined') {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (
        k.startsWith('jf:accounts') ||
        k.startsWith('jf:session') ||
        k.startsWith('jf:logged-user:') ||
        k.startsWith('room-player:')
      )) {
        if (k !== ACCOUNTS_KEY && k !== SESSION_KEY) {
          localStorage.removeItem(k);
        }
      }
    }
    if (typeof sessionStorage !== 'undefined') {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && (
          k.startsWith('jf:session') ||
          k.startsWith('jf:active_')
        )) {
          if (k !== SESSION_KEY) {
            sessionStorage.removeItem(k);
          }
        }
      }
    }
  } catch { /* ignore */ }
}

/**
 * Wipe all accounts and reset authentication to a clean slate.
 */
export function clearAllAuthData() {
  try {
    localStorage.removeItem(ACCOUNTS_KEY);
    localStorage.removeItem(SESSION_KEY);
    saveAccounts({});
    logout();
  } catch { /* ignore */ }
}

export function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) ?? {};
  } catch {
    return {};
  }
}

export function saveAccounts(accounts) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch { /* ignore */ }
  broadcastAccountsData();
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

function normalizeUsername(name) {
  return name?.trim().toLowerCase() ?? '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Search local accounts dictionary for a user matching the identifier (email or username).
 */
export function findAccount(identifier, accounts = loadAccounts()) {
  if (!identifier) return null;
  const query = identifier.trim().toLowerCase();
  if (!query) return null;

  // 1. Direct key match
  if (accounts[query]) return accounts[query];

  // 2. Scan accounts for email or username match (case-insensitive)
  for (const acc of Object.values(accounts)) {
    if (!acc) continue;
    if (normalizeEmail(acc.email) === query) return acc;
    if (normalizeUsername(acc.displayName) === query) return acc;
    if (acc.username && normalizeUsername(acc.username) === query) return acc;
  }
  return null;
}

/**
 * Merge remote accounts into local storage.
 * Returns true if new or updated accounts were added.
 */
export function mergeAccountsData(remoteAccounts) {
  if (!remoteAccounts || typeof remoteAccounts !== 'object') return false;
  const localAccounts = loadAccounts();
  let changed = false;

  for (const [key, remoteAcc] of Object.entries(remoteAccounts)) {
    if (!remoteAcc || typeof remoteAcc !== 'object') continue;
    const email = normalizeEmail(remoteAcc.email);
    const name = remoteAcc.displayName?.trim() || remoteAcc.username?.trim();
    if (!name && !email) continue;

    const accKey = email || normalizeUsername(name) || key;
    const existing = localAccounts[accKey] || findAccount(email, localAccounts) || findAccount(name, localAccounts);

    if (!existing) {
      localAccounts[accKey] = {
        ...remoteAcc,
        email: email || '',
        displayName: name || 'Player',
        updatedAt: remoteAcc.updatedAt || remoteAcc.createdAt || Date.now(),
      };
      changed = true;
    } else {
      const remoteUpdated = remoteAcc.updatedAt || remoteAcc.createdAt || 0;
      const localUpdated = existing.updatedAt || existing.createdAt || 0;
      if (remoteUpdated > localUpdated) {
        localAccounts[accKey] = {
          ...existing,
          ...remoteAcc,
          updatedAt: remoteUpdated,
        };
        changed = true;
      }
    }
  }

  if (changed) {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(localAccounts));
    } catch { /* ignore */ }
  }
  return changed;
}

/**
 * Broadcast current accounts to other tabs and cross-device network peers.
 */
export function broadcastAccountsData() {
  const accounts = loadAccounts();
  const payload = { type: 'accounts_sync', accounts };
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage(payload);
    ch.close();
  } catch { /* ignore */ }
  publishNetworkAccounts(payload, true);
}

/**
 * Request account data from other devices or broker.
 */
export function requestAccountsSync() {
  const payload = { type: 'accounts_request' };
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage(payload);
    ch.close();
  } catch { /* ignore */ }
  publishNetworkAccounts(payload, false);
}

// Background sync listeners
if (typeof window !== 'undefined') {
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.onmessage = (evt) => {
      if (evt.data?.type === 'accounts_sync' && evt.data.accounts) {
        mergeAccountsData(evt.data.accounts);
      } else if (evt.data?.type === 'accounts_request') {
        broadcastAccountsData();
      }
    };
  } catch { /* ignore */ }

  subscribeNetworkAccounts((msg) => {
    if (msg?.type === 'accounts_sync' && msg.accounts) {
      mergeAccountsData(msg.accounts);
    } else if (msg?.type === 'accounts_request') {
      broadcastAccountsData();
    }
  });

  setTimeout(() => {
    requestAccountsSync();
    broadcastAccountsData();
  }, 1000);
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
  const existingByEmail = findAccount(normEmail, accounts);
  if (existingByEmail) {
    return { ok: false, error: 'An account with this email already exists.' };
  }

  const existingByName = findAccount(name, accounts);
  if (existingByName) {
    return { ok: false, error: 'An account with this display name already exists.' };
  }

  const now = Date.now();
  const account = {
    email: normEmail,
    password: pass,
    displayName: name,
    provider: 'local',
    createdAt: now,
    updatedAt: now,
  };

  accounts[normEmail] = account;
  saveAccounts(accounts);
  setSession(account);
  refreshLoggedUserPresence(name);

  return { ok: true, user: { email: normEmail, displayName: name } };
}

/**
 * Login with username (display name) or email, and password.
 * Returns { ok: true, user: { email, displayName } } or { ok: false, error: string }.
 */
export function login(identifier, password) {
  const id = identifier?.trim();
  const pass = password ?? '';

  if (!id) {
    return { ok: false, error: 'Please enter your username or email address.' };
  }
  if (!pass) {
    return { ok: false, error: 'Please enter your password.' };
  }

  const accounts = loadAccounts();
  const account = findAccount(id, accounts);

  if (!account || account.password !== pass) {
    return { ok: false, error: 'Invalid username/email or password.' };
  }

  setSession(account);
  refreshLoggedUserPresence(account.displayName);

  return { ok: true, user: { email: account.email, displayName: account.displayName } };
}

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Request a password reset for a given username or email.
 * Generates a reset token and reset URL, and opens the user's email client.
 */
export function requestPasswordReset(identifier) {
  const id = identifier?.trim();
  if (!id) {
    return { ok: false, error: 'Please enter your username or registered email address.' };
  }

  const accounts = loadAccounts();
  const account = findAccount(id, accounts);
  if (!account) {
    return { ok: false, error: 'No account found matching that username or email address.' };
  }

  // Generate 6-char alphanumeric reset token
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 6; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }

  const now = Date.now();
  const expiresAt = now + 60 * 60 * 1000; // 1 hour

  account.resetToken = token;
  account.resetTokenExpiresAt = expiresAt;
  account.updatedAt = now;

  const accKey = normalizeEmail(account.email) || normalizeUsername(account.displayName);
  accounts[accKey] = account;
  saveAccounts(accounts);

  let resetUrl = '';
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    resetUrl = `${origin}${pathname}?reset_token=${encodeURIComponent(token)}&email=${encodeURIComponent(account.email)}`;

    const subject = encodeURIComponent("Johann's Folly - Password Reset Link");
    const body = encodeURIComponent(
      `Hello ${account.displayName},\n\n` +
      `A password reset was requested for your Johann's Folly account.\n\n` +
      `Click the link below or enter your reset code to choose a new password:\n\n` +
      `${resetUrl}\n\n` +
      `Reset Code: ${token}\n\n` +
      `This link and code will expire in 1 hour.\n\n` +
      `If you did not request this, you can safely ignore this email.`
    );
    const mailtoUrl = `mailto:${account.email}?subject=${subject}&body=${body}`;
    try {
      window.open(mailtoUrl, '_blank');
    } catch { /* ignore */ }
  }

  return {
    ok: true,
    email: account.email,
    displayName: account.displayName,
    token,
    resetUrl,
  };
}

/**
 * Reset an account's password using the token received via email.
 */
export function resetPassword(identifier, token, newPassword) {
  const id = identifier?.trim();
  const code = token?.trim()?.toUpperCase();
  const pass = newPassword ?? '';

  if (!id) {
    return { ok: false, error: 'Please enter your username or email address.' };
  }
  if (!code) {
    return { ok: false, error: 'Please enter your password reset code.' };
  }
  if (!pass || pass.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters long.' };
  }

  const accounts = loadAccounts();
  const account = findAccount(id, accounts);
  if (!account) {
    return { ok: false, error: 'Account not found.' };
  }

  if (!account.resetToken || account.resetToken.toUpperCase() !== code) {
    return { ok: false, error: 'Invalid or incorrect reset code.' };
  }

  if (account.resetTokenExpiresAt && Date.now() > account.resetTokenExpiresAt) {
    return { ok: false, error: 'This reset code has expired. Please request a new one.' };
  }

  const now = Date.now();
  account.password = pass;
  delete account.resetToken;
  delete account.resetTokenExpiresAt;
  account.updatedAt = now;

  const accKey = normalizeEmail(account.email) || normalizeUsername(account.displayName);
  accounts[accKey] = account;
  saveAccounts(accounts);

  setSession(account);
  refreshLoggedUserPresence(account.displayName);

  return { ok: true, user: { email: account.email, displayName: account.displayName } };
}

function setSession(account) {
  const data = JSON.stringify({
    email: account.email,
    displayName: account.displayName,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION_MS,
  });
  try {
    sessionStorage.setItem(SESSION_KEY, data);
    localStorage.setItem(SESSION_KEY, data);
  } catch { /* ignore */ }
}

/** Returns the logged-in user object { email, displayName }, or null if not logged in. */
export function getLoggedInSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const session = JSON.parse(raw);
      if (session?.expiresAt && Date.now() > session.expiresAt) {
        logout();
        return null;
      }
      return session;
    }
  } catch { /* ignore */ }

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

  const accounts = loadAccounts();
  let changed = false;

  if (email && accounts[email]) {
    delete accounts[email];
    changed = true;
  }

  for (const [k, acc] of Object.entries(accounts)) {
    if (acc && (normalizeEmail(acc.email) === normalizeEmail(email) || (user && normalizeUsername(acc.displayName) === normalizeUsername(user)))) {
      delete accounts[k];
      changed = true;
    }
  }

  if (changed) {
    saveAccounts(accounts);
  }

  if (user) {
    clearLoggedUserPresence(user);
  }

  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }

  broadcastLobbyUpdate();
  return { ok: true };
}

