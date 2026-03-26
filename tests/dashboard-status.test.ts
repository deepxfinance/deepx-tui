import { describe, expect, test } from 'bun:test';

import {
  formatWebSocketDelay,
  getWebSocketDelayTone,
} from '../src/lib/dashboard-status';
import { isWebSocketPongMessage } from '../src/services/use-market-data';

describe('dashboard status helpers', () => {
  test('formats websocket delay labels', () => {
    expect(formatWebSocketDelay(undefined)).toBe('--');
    expect(formatWebSocketDelay(0)).toBe('0ms');
    expect(formatWebSocketDelay(123.6)).toBe('124ms');
  });

  test('maps websocket delay to status tones', () => {
    expect(getWebSocketDelayTone(undefined)).toBe('gray');
    expect(getWebSocketDelayTone(80)).toBe('green');
    expect(getWebSocketDelayTone(220)).toBe('yellow');
    expect(getWebSocketDelayTone(900)).toBe('red');
  });

  test('recognizes websocket pong payloads', () => {
    expect(isWebSocketPongMessage({ type: 'pong' })).toBe(true);
    expect(isWebSocketPongMessage({ channel: 'pong' })).toBe(true);
    expect(isWebSocketPongMessage({ action: 'pong' })).toBe(true);
    expect(isWebSocketPongMessage({ message: 'pong' })).toBe(true);
    expect(isWebSocketPongMessage({ type: 'data', channel: 'trades' })).toBe(
      false,
    );
  });
});
