import { describe, expect, test } from 'bun:test';

import { buildChartModel } from '../src/components/chart/chart-render';
import { createPriceScale } from '../src/components/chart/chart-scale';

const candles = [
  { time: 1, open: 100, high: 110, low: 95, close: 105, volume: 10 },
  { time: 2, open: 105, high: 112, low: 101, close: 109, volume: 12 },
  { time: 3, open: 109, high: 118, low: 107, close: 111, volume: 14 },
  { time: 4, open: 111, high: 116, low: 104, close: 106, volume: 18 },
];

describe('chart scale', () => {
  test('maps higher prices to upper rows', () => {
    const scale = createPriceScale(candles, 10);
    expect(scale.rowForPrice(118)).toBeLessThan(scale.rowForPrice(95));
  });
});

describe('chart render', () => {
  test('builds rows and a time axis', () => {
    const model = buildChartModel(candles, { width: 4, height: 8 });
    expect(model.rows).toHaveLength(4);
    expect(model.volumeRows).toHaveLength(4);
    expect(model.timeAxis.segments[0]?.text.includes('00:')).toBeTrue();
  });

  test('renders a current price marker', () => {
    const model = buildChartModel(candles, { width: 4, height: 8 });
    expect(
      model.rows.some((row) =>
        row.segments.some((segment) => segment.text.includes('●')),
      ),
    ).toBeTrue();
  });
});
