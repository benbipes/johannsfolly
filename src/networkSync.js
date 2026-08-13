import mqtt from 'mqtt';

const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

const TOPIC_PRESENCE = 'jf/v1/lobby/presence';
const TOPIC_ROOMS = 'jf/v1/lobby/rooms';
const TOPIC_ROOM_PREFIX = 'jf/v1/room/';

const PRESENCE_TTL_MS = 20000;
const ROOM_TTL_MS = 20000;

let client = null;
let currentBrokerIndex = 0;
let reconnectTimer = null;
const networkUsers = new Map(); // username -> updatedAt
const networkRooms = new Map(); // roomCode -> { code, status, updatedAt }
const roomSubscribers = new Map(); // roomCode -> Set<callback>

function isFresh(updatedAt, ttlMs) {
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= ttlMs;
}

function tryFallback() {
  if (reconnectTimer) return;
  if (client) {
    try { client.end(true); } catch { /* ignore */ }
    client = null;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    currentBrokerIndex = (currentBrokerIndex + 1) % BROKERS.length;
    connect(BROKERS[currentBrokerIndex]);
  }, 5000);
}

function connect(brokerUrl) {
  try {
    client = mqtt.connect(brokerUrl, {
      clientId: `jf_${Math.random().toString(36).slice(2, 10)}`,
      keepalive: 15,
      reconnectPeriod: 3000,
      connectTimeout: 5000,
    });

    client.on('connect', () => {
      client.subscribe(TOPIC_PRESENCE);
      client.subscribe(TOPIC_ROOMS);
      client.subscribe(`${TOPIC_ROOM_PREFIX}+`);
    });

    client.on('message', (topic, payload) => {
      try {
        const msg = JSON.parse(payload.toString());
        if (topic === TOPIC_PRESENCE && msg.username) {
          networkUsers.set(msg.username.toLowerCase(), {
            username: msg.username,
            updatedAt: msg.updatedAt ?? Date.now(),
          });
        } else if (topic === TOPIC_ROOMS && msg.code) {
          if (msg.status === 'open') {
            networkRooms.set(msg.code, {
              code: msg.code,
              status: 'open',
              updatedAt: msg.updatedAt ?? Date.now(),
            });
          } else {
            networkRooms.delete(msg.code);
          }
        } else if (topic.startsWith(TOPIC_ROOM_PREFIX)) {
          const roomCode = topic.slice(TOPIC_ROOM_PREFIX.length);
          const callbacks = roomSubscribers.get(roomCode);
          if (callbacks) {
            callbacks.forEach(cb => cb(msg));
          }
        }
      } catch { /* ignore invalid json */ }
    });

    client.on('error', () => {
      tryFallback();
    });
  } catch {
    tryFallback();
  }
}

export function initNetworkSync() {
  if (client) return;
  connect(BROKERS[currentBrokerIndex]);
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    try {
      initNetworkSync();
    } catch { /* ignore */ }
  }, 100);
}

/** Publish logged-in user presence across all devices */
export function publishNetworkPresence(username) {
  const name = username?.trim();
  if (!name || !client?.connected) return;
  try {
    const payload = JSON.stringify({ username: name, updatedAt: Date.now() });
    client.publish(TOPIC_PRESENCE, payload, { qos: 0 });
  } catch { /* ignore */ }
}

/** Get list of active logged users discovered across all devices */
export function getNetworkLoggedUsers() {
  const active = [];
  for (const [key, data] of networkUsers.entries()) {
    if (isFresh(data.updatedAt, PRESENCE_TTL_MS)) {
      active.push(data.username);
    } else {
      networkUsers.delete(key);
    }
  }
  return active;
}

/** Publish room open/closed status across all devices */
export function publishNetworkRoom(roomCode, status) {
  if (!roomCode || !client?.connected) return;
  try {
    const payload = JSON.stringify({ code: roomCode, status, updatedAt: Date.now() });
    client.publish(TOPIC_ROOMS, payload, { qos: 0 });
  } catch { /* ignore */ }
}

/** Get list of open rooms discovered across all devices */
export function getNetworkOpenRooms() {
  const open = [];
  for (const [code, data] of networkRooms.entries()) {
    if (data.status === 'open' && isFresh(data.updatedAt, ROOM_TTL_MS)) {
      open.push({ code: data.code });
    } else {
      networkRooms.delete(code);
    }
  }
  return open;
}

/** Subscribe to network room events (joining, player list, game state) */
export function subscribeNetworkRoom(roomCode, callback) {
  if (!roomCode || typeof callback !== 'function') return () => {};

  if (!roomSubscribers.has(roomCode)) {
    roomSubscribers.set(roomCode, new Set());
  }
  roomSubscribers.get(roomCode).add(callback);

  return () => {
    const subs = roomSubscribers.get(roomCode);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) roomSubscribers.delete(roomCode);
    }
  };
}

/** Publish a room event (joined, player_list, game_state) to all devices */
export function publishNetworkRoomEvent(roomCode, eventObj) {
  if (!roomCode || !client?.connected) return;
  try {
    const topic = `${TOPIC_ROOM_PREFIX}${roomCode}`;
    client.publish(topic, JSON.stringify(eventObj), { qos: 0 });
  } catch { /* ignore */ }
}
