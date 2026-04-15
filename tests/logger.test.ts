import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  clearLogs,
  filterLogEntries,
  getDebugLogFilePath,
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
    delete process.env.DEEPX_DEBUG_LOG_FILE;
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

  test('writes captured logs to a file in debug mode', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'deepx-logger-test-'));
    process.env.DEEPX_DEBUG_LOG_FILE = join(tempDir, 'debug.log');

    try {
      setLoggerMode('debug');
      logNetworkResponse({
        scope: 'rpc',
        method: 'POST',
        url: 'https://example.com/rpc',
        status: 500,
        body: '{"signedTx":"0xabc","message":"backend exploded"}',
      });

      const content = readFileSync(getDebugLogFilePath(), 'utf8').trim();
      const lines = content.split('\n');
      expect(lines).toHaveLength(1);

      expect(JSON.parse(lines[0] ?? '')).toMatchObject({
        level: 'error',
        scope: 'rpc',
        message: 'POST https://example.com/rpc -> 500',
        details: '{"signedTx":"[redacted]","message":"backend exploded"}',
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('does not write a file outside debug mode', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'deepx-logger-test-'));
    process.env.DEEPX_DEBUG_LOG_FILE = join(tempDir, 'debug.log');

    try {
      setLoggerMode('default');
      logError('wallet', 'Unlock failed', 'bad passphrase');

      expect(existsSync(getDebugLogFilePath())).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
