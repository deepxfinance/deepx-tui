import { describe, expect, test } from 'bun:test';

import { buildChartModel } from '../src/components/chart/chart-render';
import { createPriceScale } from '../src/components/chart/chart-scale';
import { formatChartTimestamp } from '../src/lib/time';

const candles = [
  {
    time: Date.UTC(2026, 2, 26, 0, 0),
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 10,
  },
  {
    time: Date.UTC(2026, 2, 26, 0, 1),
    open: 105,
    high: 112,
    low: 101,
    close: 109,
    volume: 12,
  },
  {
    time: Date.UTC(2026, 2, 26, 0, 2),
    open: 109,
    high: 118,
    low: 107,
    close: 111,
    volume: 14,
  },
  {
    time: Date.UTC(2026, 2, 26, 0, 3),
    open: 111,
    high: 116,
    low: 104,
    close: 106,
    volume: 18,
  },
];

describe('chart scale', () => {
  test('maps higher prices to upper rows', () => {
    const scale = createPriceScale(candles, 10);
    expect(scale.rowForPrice(118)).toBeLessThan(scale.rowForPrice(95));
  });
});

describe('chart render', () => {
  test('builds rows and a time axis', () => {
    const model = buildChartModel(candles, {
      width: 12,
      height: 8,
      resolution: '1',
    });
    const timeAxisText = model.timeAxis.segments
      .map((segment) => segment.text)
      .join('');

    expect(model.rows).toHaveLength(4);
    expect(model.volumeRows).toHaveLength(4);
    expect(
      timeAxisText.includes(formatChartTimestamp(candles[0]?.time, '1')),
    ).toBeTrue();
    expect(timeAxisText.trim().length).toBeGreaterThan(0);
  });

  test('renders a current price marker', () => {
    const model = buildChartModel(candles, {
      width: 12,
      height: 8,
      resolution: '1',
    });
    expect(
      model.rows.some((row) =>
        row.segments.some((segment) => segment.text.includes('●')),
      ),
    ).toBeTrue();
  });

  test('adds spacing between candles and volume bars when width allows it', () => {
    const model = buildChartModel(candles, {
      width: 12,
      height: 8,
      resolution: '1',
    });
    const chartRow = model.rows
      .map(renderRowText)
      .find((row) => row.includes('█ █'));
    const volumeRow = model.volumeRows
      .map(renderRowText)
      .find((row) => row.includes('▇ ▇'));

    expect(Boolean(chartRow)).toBeTrue();
    expect(volumeRow?.includes('▇ ▇')).toBeTrue();
  });
});

function renderRowText(row: { segments: Array<{ text: string }> }): string {
  return row.segments.map((segment) => segment.text).join('');
}
