import type { NetworkConfig } from '../config/networks';
import { logSocketEvent } from './logger';

const WEBSOCKET_CONNECTING_STATE = 0;
const WEBSOCKET_OPEN_STATE = 1;
const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_DELAY_MS = 1_000;

type WebSocketLike = {
  readyState: number;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(
    type: 'message',
    listener: (event: { data?: unknown }) => void,
  ): void;
  addEventListener(type: 'close' | 'error', listener: () => void): void;
  send(payload: string): void;
  close(): void;
};

export type MarketWsSessionSnapshot = {
  status: 'connecting' | 'open' | 'closed' | 'error';
  websocketDelayMs?: number;
};

export type MarketWsSessionSubscription = {
  key: string;
  payload: string;
  scope: string;
  refreshOnSubscribe?: boolean;
  onMessage(rawMessage: string): void;
  onOpen?(): void;
  onClose?(): void;
  onError?(): void;
};

export type MarketWsSession = {
  network: NetworkConfig;
  getSnapshot(): MarketWsSessionSnapshot;
  subscribe(listener: MarketWsSessionSubscription): () => void;
  subscribeToStatus(
    listener: (snapshot: MarketWsSessionSnapshot) => void,
  ): () => void;
  close(): void;
};

type SharedSessionRecord = {
  refCount: number;
  session: SharedMarketWsSession;
};

type SubscriptionConsumer = MarketWsSessionSubscription;

type SubscriptionRecord = {
  payload: string;
  scope: string;
  consumers: Map<number, SubscriptionConsumer>;
};

type CreateWebSocket = (url: string) => WebSocketLike;

const sharedSessions = new Map<string, SharedSessionRecord>();

export function createMarketWsSession(input: {
  network: NetworkConfig;
  createWebSocket?: CreateWebSocket;
}): MarketWsSession {
  return new SharedMarketWsSession(input.network, input.createWebSocket);
}

export function acquireSharedMarketWsSession(
  network: NetworkConfig,
  options: { createWebSocket?: CreateWebSocket } = {},
): MarketWsSession {
  const key = network.marketWsUrl;
  const existing = sharedSessions.get(key);
  if (existing) {
    existing.refCount += 1;
    return existing.session;
  }

  const session = new SharedMarketWsSession(network, options.createWebSocket);
  sharedSessions.set(key, {
    refCount: 1,
    session,
  });
  return session;
}

export function getSharedMarketWsSession(
  network: NetworkConfig,
): MarketWsSession | undefined {
  return sharedSessions.get(network.marketWsUrl)?.session;
}

export function releaseSharedMarketWsSession(session: MarketWsSession) {
  const record = sharedSessions.get(session.network.marketWsUrl);
  if (!record || record.session !== session) {
    return;
  }

  record.refCount -= 1;
  if (record.refCount > 0) {
    return;
  }

  record.session.close();
  sharedSessions.delete(session.network.marketWsUrl);
}

export function resetSharedMarketWsSessions() {
  for (const record of sharedSessions.values()) {
    record.session.close();
  }
  sharedSessions.clear();
}

class SharedMarketWsSession implements MarketWsSession {
  readonly network: NetworkConfig;

  private readonly createWebSocket: CreateWebSocket;
  private readonly subscriptions = new Map<string, SubscriptionRecord>();
  private readonly statusListeners = new Set<
    (snapshot: MarketWsSessionSnapshot) => void
  >();

  private websocket?: WebSocketLike;
  private heartbeatHandle?: ReturnType<typeof setInterval>;
  private reconnectHandle?: ReturnType<typeof setTimeout>;
  private nextConsumerId = 1;
  private pendingPingAt: number | null = null;
  private websocketDelayMs?: number;
  private status: MarketWsSessionSnapshot['status'] = 'connecting';
  private sentSubscriptionKeys = new Set<string>();
  private isClosedManually = false;

  constructor(network: NetworkConfig, createWebSocket?: CreateWebSocket) {
    this.network = network;
    this.createWebSocket = createWebSocket ?? createBrowserWebSocket;
    this.ensureConnected();
  }

  getSnapshot(): MarketWsSessionSnapshot {
    return {
      status: this.status,
      websocketDelayMs: this.websocketDelayMs,
    };
  }

  subscribe(listener: MarketWsSessionSubscription) {
    const consumerId = this.nextConsumerId++;
    const existing = this.subscriptions.get(listener.key);
    if (existing) {
      existing.consumers.set(consumerId, listener);
    } else {
      this.subscriptions.set(listener.key, {
        payload: listener.payload,
        scope: listener.scope,
        consumers: new Map([[consumerId, listener]]),
      });
    }

    this.ensureConnected();
    if (this.status === 'open') {
      this.sendSubscription(listener.key, listener.refreshOnSubscribe);
      listener.onOpen?.();
    }

    return () => {
      const record = this.subscriptions.get(listener.key);
      if (!record) {
        return;
      }

      record.consumers.delete(consumerId);
      if (record.consumers.size === 0) {
        this.subscriptions.delete(listener.key);
        this.sentSubscriptionKeys.delete(listener.key);
      }
    };
  }

  subscribeToStatus(listener: (snapshot: MarketWsSessionSnapshot) => void) {
    this.statusListeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  close() {
    this.isClosedManually = true;
    this.clearReconnect();
    this.clearHeartbeat();
    this.pendingPingAt = null;
    this.websocketDelayMs = undefined;

    if (this.websocket) {
      try {
        this.websocket.close();
      } catch {
        // Ignore close failures from mocked sockets.
      }
      this.websocket = undefined;
    }

    this.sentSubscriptionKeys.clear();
    this.setStatus('closed');
  }

  private ensureConnected() {
    if (this.isClosedManually) {
      return;
    }

    if (
      this.websocket &&
      (this.websocket.readyState === WEBSOCKET_CONNECTING_STATE ||
        this.websocket.readyState === WEBSOCKET_OPEN_STATE)
    ) {
      return;
    }

    this.clearReconnect();
    this.websocket = this.createWebSocket(this.network.marketWsUrl);
    this.sentSubscriptionKeys.clear();
    this.pendingPingAt = null;
    this.setStatus('connecting');

    this.websocket.addEventListener('open', () => {
      this.setStatus('open');
      this.startHeartbeat();
      logSocketEvent({
        scope: 'shared-market-ws',
        url: this.network.marketWsUrl,
        event: 'open',
      });
      for (const key of this.subscriptions.keys()) {
        this.sendSubscription(key);
      }
      this.sendPing();
      this.emitLifecycle('onOpen');
    });

    this.websocket.addEventListener('message', (event) => {
      const rawMessage = String(event.data);
      logSocketEvent({
        scope: 'shared-market-ws',
        url: this.network.marketWsUrl,
        event: 'message',
        payload: rawMessage,
      });

      if (isWebSocketPongMessage(rawMessage) && this.pendingPingAt != null) {
        this.websocketDelayMs = Date.now() - this.pendingPingAt;
        this.pendingPingAt = null;
        this.emitStatus();
        return;
      }

      for (const record of this.subscriptions.values()) {
        for (const consumer of record.consumers.values()) {
          consumer.onMessage(rawMessage);
        }
      }
    });

    this.websocket.addEventListener('close', () => {
      logSocketEvent({
        scope: 'shared-market-ws',
        url: this.network.marketWsUrl,
        event: 'close',
      });
      this.handleDisconnect('closed', 'onClose');
    });

    this.websocket.addEventListener('error', () => {
      logSocketEvent({
        scope: 'shared-market-ws',
        url: this.network.marketWsUrl,
        event: 'error',
      });
      this.handleDisconnect('error', 'onError');
    });
  }

  private handleDisconnect(
    nextStatus: MarketWsSessionSnapshot['status'],
    lifecycle: 'onClose' | 'onError',
  ) {
    this.clearHeartbeat();
    this.pendingPingAt = null;
    this.websocketDelayMs = undefined;
    this.sentSubscriptionKeys.clear();
    this.websocket = undefined;
    this.setStatus(nextStatus);
    this.emitLifecycle(lifecycle);

    if (!this.isClosedManually) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectHandle) {
      return;
    }

    this.reconnectHandle = setTimeout(() => {
      this.reconnectHandle = undefined;
      this.ensureConnected();
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnect() {
    if (!this.reconnectHandle) {
      return;
    }

    clearTimeout(this.reconnectHandle);
    this.reconnectHandle = undefined;
  }

  private startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatHandle = setInterval(() => {
      this.sendPing();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat() {
    if (!this.heartbeatHandle) {
      return;
    }

    clearInterval(this.heartbeatHandle);
    this.heartbeatHandle = undefined;
  }

  private sendPing() {
    if (!this.websocket || this.websocket.readyState !== WEBSOCKET_OPEN_STATE) {
      return;
    }

    this.pendingPingAt = Date.now();
    const payload = JSON.stringify({ action: 'ping' });
    logSocketEvent({
      scope: 'shared-market-ws',
      url: this.network.marketWsUrl,
      event: 'send',
      payload,
    });
    this.websocket.send(payload);
  }

  private sendSubscription(key: string, forceRefresh = false) {
    if (!this.websocket || this.websocket.readyState !== WEBSOCKET_OPEN_STATE) {
      return;
    }

    if (!forceRefresh && this.sentSubscriptionKeys.has(key)) {
      return;
    }

    const record = this.subscriptions.get(key);
    if (!record) {
      return;
    }

    logSocketEvent({
      scope: record.scope,
      url: this.network.marketWsUrl,
      event: 'send',
      payload: record.payload,
    });
    this.websocket.send(record.payload);
    this.sentSubscriptionKeys.add(key);
  }

  private emitLifecycle(lifecycle: 'onOpen' | 'onClose' | 'onError') {
    for (const record of this.subscriptions.values()) {
      for (const consumer of record.consumers.values()) {
        consumer[lifecycle]?.();
      }
    }
  }

  private setStatus(status: MarketWsSessionSnapshot['status']) {
    this.status = status;
    this.emitStatus();
  }

  private emitStatus() {
    const snapshot = this.getSnapshot();
    for (const listener of this.statusListeners) {
      listener(snapshot);
    }
  }
}

function isWebSocketPongMessage(rawMessage: string) {
  try {
    const parsed = JSON.parse(rawMessage) as {
      action?: string;
      type?: string;
      channel?: string;
      message?: string;
    };
    return [parsed.action, parsed.type, parsed.channel, parsed.message].some(
      (value) => value?.toLowerCase() === 'pong',
    );
  } catch {
    return false;
  }
}

function createBrowserWebSocket(url: string) {
  return new WebSocket(url) as unknown as WebSocketLike;
}
