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

  const timeZone = getUserTimeZone();

  if (resolution === '1M') {
    return `${monthLabel(resolveDateParts(date, timeZone).month - 1)} ${String(resolveDateParts(date, timeZone).year).slice(-2)}`;
  }

  if (resolution === '1D' || resolution === '1W') {
    const { day, month } = resolveDateParts(date, timeZone);
    return `${String(day).padStart(2, '0')} ${monthLabel(month - 1)}`;
  }

  return formatLocalTimeOfDay(normalizedTimestamp, timeZone);
}

export function formatLocalTimeOfDay(
  timestamp: number | string | undefined,
  timeZone = getUserTimeZone(),
): string {
  if (timestamp == null) {
    return '--:--';
  }

  const normalizedTimestamp =
    typeof timestamp === 'number'
      ? normalizeUnixTimestamp(timestamp)
      : timestamp;
  const date = new Date(normalizedTimestamp);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  const { hour, minute } = resolveTimeParts(date, timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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

function getUserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function resolveDateParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return {
    year: Number(findPart(parts, 'year')),
    month: Number(findPart(parts, 'month')),
    day: Number(findPart(parts, 'day')),
  };
}

function resolveTimeParts(
  date: Date,
  timeZone: string,
): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  return {
    hour: Number(findPart(parts, 'hour')),
    minute: Number(findPart(parts, 'minute')),
  };
}

function findPart(
  parts: Intl.DateTimeFormatPart[],
  type:
    | Intl.DateTimeFormatPartTypesRegistry[keyof Intl.DateTimeFormatPartTypesRegistry]
    | 'year'
    | 'month'
    | 'day'
    | 'hour'
    | 'minute',
): string {
  return parts.find((part) => part.type === type)?.value ?? '0';
}
