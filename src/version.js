/* global __APP_RELEASE__, __LIVE_SITE_URL__ */
// Which release of the app this is, and how to tell when other phones are on a different one.

const build = typeof __APP_RELEASE__ === 'object' && __APP_RELEASE__ ? __APP_RELEASE__ : {};

export const APP_VERSION = Number.isFinite(build.version) ? build.version : 0;
export const APP_COMMIT = build.commit || 'dev';
export const APP_RELEASED = build.released || null;
const LIVE_SITE_URL = typeof __LIVE_SITE_URL__ === 'string' ? __LIVE_SITE_URL__ : '';

/** Identifies this copy of the app in room messages, so it can ignore its own. */
export const DEVICE_ID = Math.random().toString(36).slice(2);

/** Fields every room message from this version carries, so the others can see its release. */
export function versionStamp(playerName) {
  return { senderId: DEVICE_ID, appVersion: APP_VERSION, ...(playerName ? { playerName } : {}) };
}

/** "Nov 14, 2026" */
export function formatReleaseDate(iso = APP_RELEASED) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Version 177 · Released Nov 14, 2026" */
export function versionLabel(version = APP_VERSION, released = APP_RELEASED) {
  const date = formatReleaseDate(released);
  return date ? `Version ${version} · Released ${date}` : `Version ${version}`;
}

export function isNativeApp() {
  return typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
}

/**
 * Asks the live site which release it's on. The iOS app bundles its own copy of the site,
 * so it asks the website. Returns null when offline or the file is missing.
 */
export async function fetchLiveRelease() {
  const base = isNativeApp() ? LIVE_SITE_URL : '';
  try {
    const res = await fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const release = await res.json();
    return Number.isFinite(release?.version) ? release : null;
  } catch {
    return null;
  }
}

/** Reloads the site past any cached copy of the page. */
export function reloadToLatest(version) {
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(version ?? Date.now()));
  window.location.replace(url.toString());
}

// Room messages that every version of the app sends. Versions from before release numbers
// leave out appVersion, which is how they're spotted.
const ROOM_MESSAGES = ['app_version', 'game_state', 'room_joined', 'player_list'];
const PEER_TTL_MS = 15000;

/**
 * Keeps track of which release each other phone in a room is on, from the messages it sends.
 */
export function createPeerTracker(myVersion = APP_VERSION, myDeviceId = DEVICE_ID) {
  const peers = new Map(); // key -> { name, version, seenAt }

  return {
    record(event, now = Date.now()) {
      if (!event || !ROOM_MESSAGES.includes(event.type)) return;
      if (event.senderId && event.senderId === myDeviceId) return;
      const name = event.playerName || (event.type === 'player_list' ? event.players?.[0] : null) || null;
      const key = event.senderId || (name ? `name:${name.trim().toLowerCase()}` : null);
      if (!key) return;
      const version = Number.isFinite(event.appVersion) ? event.appVersion : null;
      const known = peers.get(key);
      peers.set(key, { name: name || known?.name || null, version, seenAt: now });
    },

    /**
     * older: names of phones on an earlier release; olderUnnamed: an earlier phone that
     * didn't say who it is; newest: the highest release another phone is on, if above ours.
     */
    summary(now = Date.now()) {
      const fresh = [...peers.values()].filter(p => now - p.seenAt <= PEER_TTL_MS);
      const isOlder = p => p.version === null || p.version < myVersion;
      const current = new Set(fresh.filter(p => p.name && !isOlder(p)).map(p => p.name.toLowerCase()));
      const older = [];
      let olderUnnamed = false;
      for (const p of fresh.filter(isOlder)) {
        if (!p.name) {
          olderUnnamed = true;
        } else if (!current.has(p.name.toLowerCase()) && !older.includes(p.name)) {
          // A name also seen on a current release is someone with a second phone or tab open.
          older.push(p.name);
        }
      }
      const newer = fresh.filter(p => p.version !== null && p.version > myVersion);
      const newest = newer.length ? Math.max(...newer.map(p => p.version)) : null;
      return { older, olderUnnamed: olderUnnamed && older.length === 0, newest };
    },
  };
}

// The room this phone is in, so the version banner can watch it from outside the game screens.
let roomContext = { roomCode: null, playerName: null };
const roomListeners = new Set();

export function setVersionRoom(roomCode, playerName) {
  if (roomContext.roomCode === (roomCode || null) && roomContext.playerName === (playerName || null)) return;
  roomContext = { roomCode: roomCode || null, playerName: playerName || null };
  roomListeners.forEach(listener => listener());
}

export function subscribeVersionRoom(listener) {
  roomListeners.add(listener);
  return () => roomListeners.delete(listener);
}

export function getVersionRoom() {
  return roomContext;
}
