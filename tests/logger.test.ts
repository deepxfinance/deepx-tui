import { afterEach, describe, expect, test } from 'bun:test';

import {
  clearLogs,
  filterLogEntries,
  getLogEntries,
  logError,
  logInfo,
  logNetworkRequest,
  logNetworkResponse,
  setLoggerMode,
} from '../src/services/logger';

describe('logger', () => {
  afterEach(() => {
    setLoggerMode('default');
    clearLogs();
  });

  test('stores structured log entries', () => {
    setLoggerMode('debug');
    logError('wallet', 'Unlock failed', 'bad passphrase');

    expect(getLogEntries()).toMatchObject([
      {
        level: 'error',
        scope: 'wallet',
        message: 'Unlock failed',
        details: 'bad passphrase',
      },
    ]);
  });

  test('records request and response pairs', () => {
    setLoggerMode('debug');
    logNetworkRequest({
      scope: 'relay',
      method: 'POST',
      url: 'https://example.com/relay',
      body: '{"ok":true}',
    });
    logNetworkResponse({
      scope: 'relay',
      method: 'POST',
      url: 'https://example.com/relay',
      status: 200,
      body: '{"tx_hash":"0x1"}',
    });

    expect(getLogEntries().map((entry) => entry.message)).toEqual([
      'POST https://example.com/relay',
      'POST https://example.com/relay -> 200',
    ]);
  });

  test('filters logs by scope and message text', () => {
    setLoggerMode('debug');
    logError('wallet', 'Unlock failed', 'bad passphrase');
    logError('relay', 'Relay failed', 'status=500');

    expect(
      filterLogEntries(getLogEntries(), 'relay').map((entry) => entry.scope),
    ).toEqual(['relay']);
    expect(
      filterLogEntries(getLogEntries(), 'passphrase').map(
        (entry) => entry.details,
      ),
    ).toEqual(['bad passphrase']);
  });

  test('drops info logs outside debug mode', () => {
    logInfo('app', 'boot');

    expect(getLogEntries()).toEqual([]);
  });

  test('redacts sensitive request payload fields', () => {
    setLoggerMode('debug');
    logNetworkRequest({
      scope: 'relay',
      method: 'POST',
      url: 'https://example.com/relay',
      body: '{"signedTx":"0xabc","signer":"0x123"}',
    });

    expect(getLogEntries()[0]?.details).toBe(
      '{"signedTx":"[redacted]","signer":"0x123"}',
    );
  });
});
