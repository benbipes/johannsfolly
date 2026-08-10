const ACCOUNTS_KEY = 'jf:accounts';
const SESSION_KEY = 'jf:session';

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
  return { ok: true };
}

function setSession(username) {
  localStorage.setItem(SESSION_KEY, username);
}

/** Returns the logged-in username, or null if not logged in. */
export function getLoggedInUser() {
  return localStorage.getItem(SESSION_KEY) ?? null;
}

/** Logs out the current user. */
export function logout() {
  localStorage.removeItem(SESSION_KEY);
}
