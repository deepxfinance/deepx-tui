export function normalizeUnixTimestamp(value: number): number {
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }

  // TradingView-style feeds commonly use Unix seconds.
  return value < 100_000_000_000 ? value * 1_000 : value;
}

export function alignTimestampToResolution(
  timestamp: number,
  resolution: string,
): number {
  const normalizedTimestamp = normalizeUnixTimestamp(timestamp);
  if (!Number.isFinite(normalizedTimestamp)) {
    return Number.NaN;
  }

  const date = new Date(normalizedTimestamp);

  switch (resolution) {
    case '1D':
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
      );
    case '1W': {
      const startOfDay = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
      );
      const dayOffset = (date.getUTCDay() + 6) % 7;
      return startOfDay - dayOffset * 24 * 60 * 60 * 1_000;
    }
    case '1M':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    default: {
      const interval = resolutionToMilliseconds(resolution);
      return Math.floor(normalizedTimestamp / interval) * interval;
    }
  }
}

export function formatChartTimestamp(
  timestamp: number | undefined,
  resolution: string,
): string {
  if (timestamp == null) {
    return fallbackTimeLabel(resolution);
  }

  const normalizedTimestamp = normalizeUnixTimestamp(timestamp);
  const date = new Date(normalizedTimestamp);
  if (Number.isNaN(date.getTime())) {
    return fallbackTimeLabel(resolution);
  }

  if (resolution === '1M') {
    return `${monthLabel(date.getUTCMonth())} ${String(date.getUTCFullYear()).slice(-2)}`;
  }

  if (resolution === '1D' || resolution === '1W') {
    return `${String(date.getUTCDate()).padStart(2, '0')} ${monthLabel(date.getUTCMonth())}`;
  }

  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(
    date.getUTCMinutes(),
  ).padStart(2, '0')}`;
}

function fallbackTimeLabel(resolution: string): string {
  return resolution === '1D' || resolution === '1W' || resolution === '1M'
    ? '-- --'
    : '--:--';
}

function monthLabel(month: number): string {
  return (
    [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ][month] ?? '---'
  );
}

function resolutionToMilliseconds(resolution: string): number {
  switch (resolution) {
    case '1':
      return 60_000;
    case '5':
      return 5 * 60_000;
    case '15':
      return 15 * 60_000;
    case '30':
      return 30 * 60_000;
    case '60':
      return 60 * 60_000;
    case '240':
      return 4 * 60 * 60_000;
    default:
      return 5 * 60_000;
  }
}
