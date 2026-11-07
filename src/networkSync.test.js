import { afterEach, describe, expect, it, vi } from 'vitest';
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
