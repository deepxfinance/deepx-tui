export function formatWebSocketDelay(delayMs?: number): string {
  if (delayMs == null || Number.isNaN(delayMs) || delayMs < 0) {
    return '--';
  }

  return `${Math.round(delayMs)}ms`;
}

export function getWebSocketDelayTone(
  delayMs?: number,
): 'gray' | 'green' | 'yellow' | 'red' {
  if (delayMs == null || Number.isNaN(delayMs) || delayMs < 0) {
    return 'gray';
  }

  if (delayMs < 150) {
    return 'green';
  }

  if (delayMs < 400) {
    return 'yellow';
  }

  return 'red';
}
