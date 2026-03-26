import { useSyncExternalStore } from 'react';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEntry = {
  id: number;
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  details?: string;
};

const MAX_LOG_ENTRIES = 400;
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let minLogLevel: LogLevel = 'warn';

let nextLogId = 1;
let entries: LogEntry[] = [];
const listeners = new Set<() => void>();

export function setLoggerMode(mode: 'default' | 'debug') {
  minLogLevel = mode === 'debug' ? 'debug' : 'warn';
}

export function logDebug(scope: string, message: string, details?: string) {
  appendLog('debug', scope, message, details);
}

export function logInfo(scope: string, message: string, details?: string) {
  appendLog('info', scope, message, details);
}

export function logWarn(scope: string, message: string, details?: string) {
  appendLog('warn', scope, message, details);
}

export function logError(scope: string, message: string, details?: string) {
  appendLog('error', scope, message, details);
}

export function logNetworkRequest(input: {
  scope: string;
  method: string;
  url: string;
  body?: string;
}) {
  appendLog(
    'debug',
    input.scope,
    `${input.method.toUpperCase()} ${input.url}`,
    formatPayload(input.body),
  );
}

export function logNetworkResponse(input: {
  scope: string;
  method: string;
  url: string;
  status: number;
  body?: string;
}) {
  appendLog(
    input.status >= 400 ? 'error' : 'debug',
    input.scope,
    `${input.method.toUpperCase()} ${input.url} -> ${input.status}`,
    formatPayload(input.body),
  );
}

export function logSocketEvent(input: {
  scope: string;
  url: string;
  event: 'open' | 'close' | 'error' | 'send' | 'message';
  payload?: string;
}) {
  appendLog(
    input.event === 'error' ? 'error' : 'debug',
    input.scope,
    `WS ${input.event.toUpperCase()} ${input.url}`,
    formatPayload(input.payload),
  );
}

export function getLogEntries() {
  return entries;
}

export function filterLogEntries(entries: LogEntry[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return entries;
  }

  return entries.filter((entry) =>
    [entry.scope, entry.message, entry.details ?? '', entry.level].some(
      (value) => value.toLowerCase().includes(normalizedQuery),
    ),
  );
}

export function subscribeToLogs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLogEntries() {
  return useSyncExternalStore(subscribeToLogs, getLogEntries, getLogEntries);
}

export function clearLogs() {
  entries = [];
  nextLogId = 1;
  emitLogChange();
}

function appendLog(
  level: LogLevel,
  scope: string,
  message: string,
  details?: string,
) {
  if (!shouldCapture(level)) {
    return;
  }

  entries = [
    ...entries,
    {
      id: nextLogId++,
      timestamp: new Date().toISOString(),
      level,
      scope,
      message,
      details,
    },
  ].slice(-MAX_LOG_ENTRIES);
  emitLogChange();
}

function emitLogChange() {
  for (const listener of listeners) {
    listener();
  }
}

function formatPayload(value?: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  const redacted = redactSensitivePayload(normalized);

  return redacted.length > 240 ? `${redacted.slice(0, 237)}...` : redacted;
}

function shouldCapture(level: LogLevel) {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLogLevel];
}

function redactSensitivePayload(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return JSON.stringify(redactSensitiveValue(parsed));
  } catch {
    return value;
  }
}

function redactSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveValue);
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      isSensitiveKey(key) ? '[redacted]' : redactSensitiveValue(entryValue),
    ]),
  );
}

function isSensitiveKey(key: string) {
  return ['passphrase', 'privateKey', 'signedTx'].includes(key);
}
