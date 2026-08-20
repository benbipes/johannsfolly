// Native Browser WebSockets Sync for Johann's Folly
// Zero external dependencies, zero Node.js polyfills, 100% browser native.

const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

const TOPIC_PRESENCE = 'jf/v1/lobby/presence';
const TOPIC_ROOMS = 'jf/v1/lobby/rooms';
const TOPIC_ROOM_PREFIX = 'jf/v1/room/';
const TOPIC_LEADERBOARD = 'jf/v1/leaderboard';

const PRESENCE_TTL_MS = 20000;
const ROOM_TTL_MS = 20000;

let socket = null;
let currentBrokerIdx = 0;
let isConnected = false;
let pingInterval = null;
let reconnectTimer = null;

const networkUsers = new Map();
const networkRooms = new Map();
const roomSubscribers = new Map();
const leaderboardSubscribers = new Set();

function encodeUtf8(str) {
  return new TextEncoder().encode(str);
}

function decodeUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

function sendPacket(bytes) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try { socket.send(bytes.buffer); } catch { /* ignore */ }
  }
}

function sendConnect() {
  const clientId = `jf_${Math.random().toString(36).slice(2, 10)}`;
  const clientIdBytes = encodeUtf8(clientId);
  const payloadLen = 2 + clientIdBytes.length;
  const varHeader = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c];
  const packetLen = varHeader.length + payloadLen;

  const packet = new Uint8Array(2 + packetLen);
  packet[0] = 0x10; // CONNECT
  packet[1] = packetLen;
  packet.set(varHeader, 2);
  packet[12] = (clientIdBytes.length >> 8) & 0xff;
  packet[13] = clientIdBytes.length & 0xff;
  packet.set(clientIdBytes, 14);
  sendPacket(packet);
}

function sendSubscribe(topic) {
  const topicBytes = encodeUtf8(topic);
  const packetLen = 2 + 2 + topicBytes.length + 1;
  const packet = new Uint8Array(2 + packetLen);
  packet[0] = 0x82; // SUBSCRIBE
  packet[1] = packetLen;
  packet[2] = 0x00; packet[3] = 0x01;
  packet[4] = (topicBytes.length >> 8) & 0xff;
  packet[5] = topicBytes.length & 0xff;
  packet.set(topicBytes, 6);
  packet[6 + topicBytes.length] = 0x00;
  sendPacket(packet);
}

function sendPublish(topic, payloadStr) {
  if (!isConnected) return;
  const topicBytes = encodeUtf8(topic);
  const payloadBytes = encodeUtf8(payloadStr);
  const varHeaderLen = 2 + topicBytes.length;
  const packetLen = varHeaderLen + payloadBytes.length;

  let headerBytes = [0x30];
  let rem = packetLen;
  do {
    let digit = rem % 128;
    rem = Math.floor(rem / 128);
    if (rem > 0) digit |= 0x80;
    headerBytes.push(digit);
  } while (rem > 0);

  const packet = new Uint8Array(headerBytes.length + packetLen);
  packet.set(headerBytes, 0);
  let idx = headerBytes.length;
  packet[idx++] = (topicBytes.length >> 8) & 0xff;
  packet[idx++] = topicBytes.length & 0xff;
  packet.set(topicBytes, idx);
  idx += topicBytes.length;
  packet.set(payloadBytes, idx);
  sendPacket(packet);
}

function handleIncomingMessage(bytes) {
  if (bytes.length < 2) return;
  const pktType = (bytes[0] >> 4) & 0x0f;

  if (pktType === 2) {
    isConnected = true;
    sendSubscribe(TOPIC_PRESENCE);
    sendSubscribe(TOPIC_ROOMS);
    sendSubscribe(TOPIC_LEADERBOARD);
    sendSubscribe(`${TOPIC_ROOM_PREFIX}+`);
    return;
  }

  if (pktType === 3) {
    let idx = 1;
    let multiplier = 1;
    let remLen = 0;
    let digit;
    do {
      digit = bytes[idx++];
      remLen += (digit & 0x7f) * multiplier;
      multiplier *= 128;
    } while ((digit & 0x80) !== 0 && idx < bytes.length);

    if (idx + 2 > bytes.length) return;
    const topicLen = (bytes[idx] << 8) | bytes[idx + 1];
    idx += 2;
    if (idx + topicLen > bytes.length) return;
    const topic = decodeUtf8(bytes.subarray(idx, idx + topicLen));
    idx += topicLen;
    const payloadStr = decodeUtf8(bytes.subarray(idx));

    try {
      const msg = JSON.parse(payloadStr);
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
      } else if (topic === TOPIC_LEADERBOARD) {
        leaderboardSubscribers.forEach(cb => cb(msg));
      } else if (topic.startsWith(TOPIC_ROOM_PREFIX)) {
        const roomCode = topic.slice(TOPIC_ROOM_PREFIX.length);
        const callbacks = roomSubscribers.get(roomCode);
        if (callbacks) {
          callbacks.forEach(cb => cb(msg));
        }
      }
    } catch { /* ignore */ }
  }
}

function tryFallback() {
  if (reconnectTimer) return;
  if (socket) {
    try { socket.close(); } catch { /* ignore */ }
    socket = null;
  }
  isConnected = false;
  clearInterval(pingInterval);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    currentBrokerIdx = (currentBrokerIdx + 1) % BROKERS.length;
    connectWebSocket(BROKERS[currentBrokerIdx]);
  }, 4000);
}

function connectWebSocket(url) {
  try {
    socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      sendConnect();
      pingInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          sendPacket(new Uint8Array([0xc0, 0x00]));
        }
      }, 20000);
    };

    socket.onmessage = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        handleIncomingMessage(new Uint8Array(evt.data));
      }
    };

    socket.onerror = () => tryFallback();
    socket.onclose = () => tryFallback();
  } catch {
    tryFallback();
  }
}

export function initNetworkSync() {
  if (socket) return;
  connectWebSocket(BROKERS[currentBrokerIdx]);
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    try { initNetworkSync(); } catch { /* ignore */ }
  }, 100);
}

function isFresh(updatedAt, ttlMs) {
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= ttlMs;
}

export function publishNetworkPresence(username) {
  const name = username?.trim();
  if (!name) return;
  sendPublish(TOPIC_PRESENCE, JSON.stringify({ username: name, updatedAt: Date.now() }));
}

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

export function publishNetworkRoom(roomCode, status) {
  if (!roomCode) return;
  sendPublish(TOPIC_ROOMS, JSON.stringify({ code: roomCode, status, updatedAt: Date.now() }));
}

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

export function publishNetworkRoomEvent(roomCode, eventObj) {
  if (!roomCode) return;
  sendPublish(`${TOPIC_ROOM_PREFIX}${roomCode}`, JSON.stringify(eventObj));
}

export function publishNetworkLeaderboard(eventObj) {
  sendPublish(TOPIC_LEADERBOARD, JSON.stringify(eventObj));
}

export function subscribeNetworkLeaderboard(callback) {
  if (typeof callback !== 'function') return () => {};
  leaderboardSubscribers.add(callback);
  return () => {
    leaderboardSubscribers.delete(callback);
  };
}
