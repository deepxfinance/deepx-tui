export function formatErrorMessage(error: unknown) {
  const parts = collectErrorParts(error);
  return parts.join(' | ') || 'Unknown error.';
}

export function formatErrorWithStack(error: unknown) {
  const message = formatErrorMessage(error);
  const stack =
    error instanceof Error && typeof error.stack === 'string'
      ? error.stack.trim()
      : undefined;

  if (!stack || stack.includes(message)) {
    return message;
  }

  return `${message}\n${stack}`;
}

function collectErrorParts(error: unknown) {
  if (error == null) {
    return [];
  }

  if (typeof error === 'string') {
    return [error.trim()].filter(Boolean);
  }

  if (typeof error !== 'object') {
    return [String(error)];
  }

  const record = error as Record<string, unknown>;
  const parts = new Set<string>();

  pushValue(parts, record.shortMessage);
  pushValue(parts, record.message);
  pushValue(parts, record.details);
  pushValue(parts, record.reason);

  if (typeof record.code === 'string' || typeof record.code === 'number') {
    parts.add(`code=${String(record.code)}`);
  }

  if (isRecord(record.cause)) {
    for (const part of collectErrorParts(record.cause)) {
      parts.add(part);
    }
  }

  if (parts.size === 0) {
    try {
      parts.add(JSON.stringify(record));
    } catch {
      parts.add(String(record));
    }
  }

  return [...parts];
}

function pushValue(parts: Set<string>, value: unknown) {
  if (typeof value !== 'string') {
    return;
  }

  const normalized = value.trim();
  if (normalized) {
    parts.add(normalized);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
