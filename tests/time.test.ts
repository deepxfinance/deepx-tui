import { describe, expect, test } from 'bun:test';

import {
  alignTimestampToResolution,
  formatChartTimestamp,
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
  test('formats intraday timestamps in utc', () => {
    expect(formatChartTimestamp(Date.UTC(2026, 2, 26, 9, 5), '15')).toBe(
      '09:05',
    );
  });

  test('formats day and month labels for higher intervals', () => {
    expect(formatChartTimestamp(Date.UTC(2026, 2, 26, 9, 5), '1D')).toBe(
      '26 Mar',
    );
    expect(formatChartTimestamp(Date.UTC(2026, 2, 26, 9, 5), '1M')).toBe(
      'Mar 26',
    );
  });
});
