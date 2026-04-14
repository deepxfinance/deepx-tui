import { describe, expect, test } from 'bun:test';

import {
  alignTimestampToResolution,
  formatChartTimestamp,
  formatLocalTimeOfDay,
  normalizeUnixTimestamp,
} from '../src/lib/time';

describe('normalizeUnixTimestamp', () => {
  test('normalizes unix seconds to milliseconds', () => {
    expect(normalizeUnixTimestamp(1_710_000_000)).toBe(1_710_000_000_000);
    expect(normalizeUnixTimestamp(1_710_000_000_000)).toBe(1_710_000_000_000);
  });
});

describe('alignTimestampToResolution', () => {
  test('aligns weekly timestamps to monday 00:00 utc', () => {
    const timestamp = Date.UTC(2026, 2, 26, 13, 47);
    expect(alignTimestampToResolution(timestamp, '1W')).toBe(
      Date.UTC(2026, 2, 23, 0, 0),
    );
  });

  test('aligns monthly timestamps to the first day of the month in utc', () => {
    const timestamp = Date.UTC(2026, 2, 26, 13, 47);
    expect(alignTimestampToResolution(timestamp, '1M')).toBe(
      Date.UTC(2026, 2, 1, 0, 0),
    );
  });
});

describe('formatChartTimestamp', () => {
  test('formats intraday timestamps in the machine timezone', () => {
    const originalResolvedOptions =
      Intl.DateTimeFormat.prototype.resolvedOptions;

    Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions() {
      return {
        ...originalResolvedOptions.call(this),
        timeZone: 'America/New_York',
      };
    };

    try {
      expect(formatChartTimestamp(Date.UTC(2026, 2, 26, 9, 5), '15')).toBe(
        '05:05',
      );
    } finally {
      Intl.DateTimeFormat.prototype.resolvedOptions = originalResolvedOptions;
    }
  });

  test('formats day and month labels in the machine timezone', () => {
    const originalResolvedOptions =
      Intl.DateTimeFormat.prototype.resolvedOptions;

    Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions() {
      return {
        ...originalResolvedOptions.call(this),
        timeZone: 'America/Los_Angeles',
      };
    };

    try {
      expect(formatChartTimestamp(Date.UTC(2026, 2, 26, 1, 5), '1D')).toBe(
        '25 Mar',
      );
      expect(formatChartTimestamp(Date.UTC(2026, 2, 26, 1, 5), '1M')).toBe(
        'Mar 26',
      );
    } finally {
      Intl.DateTimeFormat.prototype.resolvedOptions = originalResolvedOptions;
    }
  });
});

describe('formatLocalTimeOfDay', () => {
  test('formats numeric timestamps in an explicit timezone', () => {
    expect(
      formatLocalTimeOfDay(Date.UTC(2026, 2, 26, 9, 5), 'America/New_York'),
    ).toBe('05:05');
  });

  test('formats iso timestamps in an explicit timezone', () => {
    expect(formatLocalTimeOfDay('2026-03-26T09:05:00Z', 'Asia/Taipei')).toBe(
      '17:05',
    );
  });
});
