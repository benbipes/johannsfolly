import { useEffect, useState, useSyncExternalStore } from 'react';
import { publishNetworkRoomEvent, subscribeNetworkRoom } from '../networkSync.js';
import {
  APP_VERSION,
  createPeerTracker,
  fetchLiveRelease,
  getVersionRoom,
  isNativeApp,
  reloadToLatest,
  subscribeVersionRoom,
  versionStamp,
} from '../version.js';

const LIVE_CHECK_MS = 2 * 60 * 1000;
const ANNOUNCE_MS = 4000;

/** Watches for a newer release on the website, and for other phones in the room on a different one. */
function useLiveRelease() {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const release = await fetchLiveRelease();
      if (!cancelled && release) setLive(release);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    const id = setInterval(check, LIVE_CHECK_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return live;
}

function useRoomVersions() {
  const { roomCode, playerName } = useSyncExternalStore(subscribeVersionRoom, getVersionRoom);
  const [summary, setSummary] = useState({ older: [], olderUnnamed: false, newest: null });

  useEffect(() => {
    setSummary({ older: [], olderUnnamed: false, newest: null });
    if (!roomCode) return;
    const tracker = createPeerTracker();
    const unsubscribe = subscribeNetworkRoom(roomCode, event => tracker.record(event));
    const tick = () => {
      publishNetworkRoomEvent(roomCode, { type: 'app_version', ...versionStamp(playerName) });
      const next = tracker.summary();
      setSummary(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    tick();
    const id = setInterval(tick, ANNOUNCE_MS);
    return () => {
      clearInterval(id);
      unsubscribe();
    };
  }, [roomCode, playerName]);

  return summary;
}

function joinNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function VersionBanner() {
  const live = useLiveRelease();
  const room = useRoomVersions();
  const [dismissed, setDismissed] = useState('');

  const newest = Math.max(live?.version ?? 0, room.newest ?? 0);
  const native = isNativeApp();
  let message = null;
  let action = null;

  if (newest > APP_VERSION) {
    if (native) {
      message = `Version ${newest} is out. This app is on ${APP_VERSION}, so play on the website until the app is updated.`;
    } else {
      message = `Version ${newest} is out. You're on ${APP_VERSION}.`;
      action = { label: 'Reload', onClick: () => reloadToLatest(newest) };
    }
  } else if (room.older.length > 0) {
    const verb = room.older.length === 1 ? 'is' : 'are';
    message = `${joinNames(room.older)} ${verb} on an older version. Ask them to reload, or to use the website instead of the app.`;
  } else if (room.olderUnnamed) {
    message = 'A phone in this game is on an older version. Everyone should reload, or use the website instead of the app.';
  }

  if (!message || dismissed === message) return null;

  return (
    <div className="version-banner" role="status">
      <span className="version-banner-msg">⚠️ {message}</span>
      {action && (
        <button type="button" className="version-banner-btn" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      <button type="button" className="version-banner-close" onClick={() => setDismissed(message)} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
