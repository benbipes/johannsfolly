import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initNetworkSync } from './networkSync.js';

const CONNACK = new Uint8Array([0x20, 0x02, 0x00, 0x00]).buffer;
const OLD_TOPICS = ['jf/v1/accounts', 'jf/v2/accounts', 'jf/v3/accounts', 'jf/v4/accounts'];

function connectFakeSocket() {
  const sent = [];
  class FakeWebSocket {
    static OPEN = 1;
    readyState = 1;
    send(buffer) { sent.push(new Uint8Array(buffer)); }
    close() {}
  }
  let socket;
  vi.stubGlobal('WebSocket', class extends FakeWebSocket {
    constructor() { super(); socket = this; }
  });

  initNetworkSync();
  socket.onopen();
  socket.onmessage({ data: CONNACK });
  return sent;
}

function readPublish(packet) {
  const topicLength = (packet[2] << 8) | packet[3];
  return {
    retained: (packet[0] & 0x01) === 1,
    topic: new TextDecoder().decode(packet.subarray(4, 4 + topicLength)),
    payloadLength: packet.length - 4 - topicLength,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connecting to a broker', () => {
  it('deletes retained account data and stops listening for it', () => {
    const sent = connectFakeSocket();

    const publishes = sent.filter(packet => packet[0] >> 4 === 3).map(readPublish);
    expect(publishes).toEqual(OLD_TOPICS.map(topic => ({ retained: true, topic, payloadLength: 0 })));

    const subscribes = sent
      .filter(packet => packet[0] === 0x82)
      .map(packet => new TextDecoder().decode(packet));
    expect(subscribes.length).toBeGreaterThan(0);
    expect(subscribes.some(text => text.includes('accounts'))).toBe(false);
  });
});

describe('staying on the same broker', () => {
  let sockets;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    sockets = [];
    vi.stubGlobal('WebSocket', class {
      static OPEN = 1;
      readyState = 1;
      constructor(url) { this.url = url; sockets.push(this); }
      send() {}
      close() {}
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function start() {
    const { initNetworkSync: init } = await import('./networkSync.js');
    init();
    return sockets[0];
  }

  function connect(socket) {
    socket.onopen();
    socket.onmessage({ data: CONNACK });
  }

  const brokerOf = socket => new URL(socket.url).hostname;

  it('reconnects to the first broker after a working connection drops', async () => {
    const first = await start();
    connect(first);

    first.onclose();
    vi.advanceTimersByTime(4000);

    expect(sockets).toHaveLength(2);
    expect(brokerOf(sockets[1])).toBe(brokerOf(first));
  });

  it('moves to the next broker when the first one cannot be reached', async () => {
    const first = await start();

    first.onerror();
    vi.advanceTimersByTime(4000);

    expect(brokerOf(sockets[1])).not.toBe(brokerOf(first));
  });

  it('reconnects only once when a socket reports both an error and a close', async () => {
    const first = await start();
    connect(first);

    first.onerror();
    first.onclose?.();
    vi.advanceTimersByTime(4000);

    expect(sockets).toHaveLength(2);
  });

  it('goes back to the first broker after a drop while on the backup', async () => {
    const first = await start();
    first.onerror();
    vi.advanceTimersByTime(4000);
    connect(sockets[1]);

    sockets[1].onclose();
    vi.advanceTimersByTime(4000);

    expect(brokerOf(sockets[2])).toBe(brokerOf(first));
  });

  it('tries the first broker again a while after moving to the backup', async () => {
    const first = await start();
    first.onerror();
    vi.advanceTimersByTime(4000);
    connect(sockets[1]);

    vi.advanceTimersByTime(120000 + 4000);

    expect(sockets).toHaveLength(3);
    expect(brokerOf(sockets[2])).toBe(brokerOf(first));
  });
});
