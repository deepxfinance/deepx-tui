import { describe, expect, test } from 'bun:test';

import { getNetworkConfig } from '../src/config/networks';
import {
  acquireSharedMarketWsSession,
  createMarketWsSession,
  releaseSharedMarketWsSession,
  resetSharedMarketWsSessions,
} from '../src/services/market-ws-session';

describe('market-ws-session', () => {
  test('connects eagerly when a session is created', () => {
    const sockets: MockWebSocket[] = [];
    const session = createMarketWsSession({
      network: getNetworkConfig('devnet'),
      createWebSocket(url) {
        const socket = new MockWebSocket(url);
        sockets.push(socket);
        return socket;
      },
    });

    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.url).toBe(getNetworkConfig('devnet').marketWsUrl);

    session.close();
  });

  test('reuses one shared socket per network', () => {
    resetSharedMarketWsSessions();
    const sockets: MockWebSocket[] = [];

    const first = acquireSharedMarketWsSession(getNetworkConfig('devnet'), {
      createWebSocket(url) {
        const socket = new MockWebSocket(url);
        sockets.push(socket);
        return socket;
      },
    });
    const second = acquireSharedMarketWsSession(getNetworkConfig('devnet'));

    expect(first).toBe(second);
    expect(sockets).toHaveLength(1);

    releaseSharedMarketWsSession(first);
    releaseSharedMarketWsSession(second);
    resetSharedMarketWsSessions();
  });

  test('sends each active subscription only once per live connection', () => {
    const sockets: MockWebSocket[] = [];
    const session = createMarketWsSession({
      network: getNetworkConfig('devnet'),
      createWebSocket(url) {
        const socket = new MockWebSocket(url);
        sockets.push(socket);
        return socket;
      },
    });

    session.subscribe({
      key: 'positions:wallet:3,4',
      payload: JSON.stringify({
        action: 'multi_subscribe',
        subscriptions: ['a'],
      }),
      scope: 'positions-ws',
      onMessage() {},
    });
    session.subscribe({
      key: 'positions:wallet:3,4',
      payload: JSON.stringify({
        action: 'multi_subscribe',
        subscriptions: ['a'],
      }),
      scope: 'positions-ws',
      onMessage() {},
    });

    const socket = sockets[0];
    if (!socket) {
      throw new Error('Expected websocket to be created');
    }

    socket.open();

    expect(socket.sent).toHaveLength(2);
    expect(JSON.parse(socket.sent[0] ?? '{}')).toEqual({
      action: 'multi_subscribe',
      subscriptions: ['a'],
    });
    expect(JSON.parse(socket.sent[1] ?? '{}')).toEqual({ action: 'ping' });

    session.close();
  });

  test('re-sends a subscription after the last consumer unsubscribes and the key is reused', () => {
    const sockets: MockWebSocket[] = [];
    const session = createMarketWsSession({
      network: getNetworkConfig('devnet'),
      createWebSocket(url) {
        const socket = new MockWebSocket(url);
        sockets.push(socket);
        return socket;
      },
    });

    const socket = sockets[0];
    if (!socket) {
      throw new Error('Expected websocket to be created');
    }

    socket.open();
    socket.sent = [];

    const unsubscribeFirst = session.subscribe({
      key: 'positions:wallet:3,4',
      payload: JSON.stringify({
        action: 'multi_subscribe',
        subscriptions: ['a'],
      }),
      scope: 'positions-ws',
      onMessage() {},
    });

    expect(socket.sent).toHaveLength(1);

    unsubscribeFirst();
    socket.sent = [];

    session.subscribe({
      key: 'positions:wallet:3,4',
      payload: JSON.stringify({
        action: 'multi_subscribe',
        subscriptions: ['a'],
      }),
      scope: 'positions-ws',
      onMessage() {},
    });

    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0] ?? '{}')).toEqual({
      action: 'multi_subscribe',
      subscriptions: ['a'],
    });

    session.close();
  });
});

class MockWebSocket {
  readyState = 0;
  sent: string[] = [];
  private readonly listeners: Record<
    string,
    Array<(event?: { data?: unknown }) => void>
  > = {
    open: [],
    message: [],
    close: [],
    error: [],
  };

  constructor(readonly url: string) {}

  addEventListener(
    type: string,
    listener: (event?: { data?: unknown }) => void,
  ) {
    this.listeners[type]?.push(listener);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }

  open() {
    this.readyState = 1;
    this.emit('open');
  }

  private emit(type: string, event?: { data?: unknown }) {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
}
