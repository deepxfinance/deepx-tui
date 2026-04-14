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

const denseCandles = Array.from({ length: 12 }, (_, index) => ({
  time: Date.UTC(2026, 2, 26, 8, index),
  open: 100 + index,
  high: 101 + index,
  low: 99 + index,
  close: 100.5 + index,
  volume: 10 + index,
}));

describe('chart scale', () => {
  test('maps higher prices to upper rows', () => {
    const scale = createPriceScale(candles, 10);
    expect(scale.rowForPrice(118)).toBeLessThan(scale.rowForPrice(95));
  });
});

describe('chart render', () => {
  test('builds rows and a time axis', () => {
    const model = buildChartModel(candles, {
      width: 30,
      height: 8,
      resolution: '1',
    });
    const timeAxisText = model.timeAxis.segments
      .map((segment) => segment.text)
      .join('');

    expect(model.rows).toHaveLength(4);
    expect(model.volumeRows).toHaveLength(4);
    expect(
      timeAxisText.includes(formatChartTimestamp(candles.at(-1)?.time, '1')),
    ).toBeTrue();
    expect(timeAxisText.trim().length).toBeGreaterThan(0);
  });

  test('renders a current price marker', () => {
    const width = 30;
    const model = buildChartModel(candles, {
      width,
      height: 8,
      resolution: '1',
    });
    const highlightedRow = model.rows.find((row) =>
      row.segments.some((segment) => segment.text.includes('●')),
    );
    const highlightedRowText = highlightedRow
      ? renderRowText(highlightedRow)
      : '';
    const plotWidth = width - 9 - 1;

    expect(
      highlightedRow?.segments.some(
        (segment) =>
          segment.color === '#F0C36A' && segment.text.includes('106.00'),
      ),
    ).toBeTrue();
    expect(highlightedRowText.indexOf('●')).toBe(plotWidth - 1);
  });

  test('packs candles and volume bars tightly until the plot is wide enough for gaps', () => {
    const compactModel = buildChartModel(candles, {
      width: 30,
      height: 8,
      resolution: '1',
    });
    const wideModel = buildChartModel(candles, {
      width: 40,
      height: 8,
      resolution: '1',
    });
    const compactChartText = compactModel.rows.map(renderRowText).join('\n');
    const compactVolumeText = compactModel.volumeRows
      .map(renderRowText)
      .join('\n');
    const wideChartText = wideModel.rows.map(renderRowText).join('\n');
    const wideVolumeText = wideModel.volumeRows.map(renderRowText).join('\n');

    expect(compactChartText.includes('█ █')).toBeFalse();
    expect(compactVolumeText.includes('▇ ▇')).toBeFalse();
    expect(wideChartText.includes('█ █')).toBeTrue();
    expect(wideVolumeText.includes('▇ ▇')).toBeTrue();
  });

  test('keeps the price axis on the right within the requested chart width', () => {
    const width = 24;
    const model = buildChartModel(candles, {
      width,
      height: 8,
      resolution: '1',
    });
    const firstRow = renderRowText(model.rows[0]);

    expect(firstRow).toHaveLength(width);
    expect(firstRow.endsWith('119.84')).toBeTrue();
  });

  test('anchors time labels to plotted candle columns instead of stretching them evenly', () => {
    const firstLabel = formatChartTimestamp(denseCandles[0]?.time, '1');
    const middleLabel = formatChartTimestamp(denseCandles[6]?.time, '1');
    const lastLabel = formatChartTimestamp(denseCandles[11]?.time, '1');
    const model = buildChartModel(denseCandles, {
      width: 40,
      height: 8,
      resolution: '1',
    });
    const timeAxisText = renderRowText(model.timeAxis);
    const plotWidth = 40 - 9 - 1;

    expect(timeAxisText.indexOf(firstLabel)).toBe(5);
    expect(timeAxisText.indexOf(middleLabel)).toBe(17);
    expect(timeAxisText.indexOf(lastLabel)).toBe(plotWidth - lastLabel.length);
  });

  test('right-aligns sparse candle series so there is no empty future gap on the right', () => {
    const sparseCandles = denseCandles.slice(0, 8);
    const model = buildChartModel(sparseCandles, {
      width: 40,
      height: 8,
      resolution: '1',
    });
    const latestLabel = formatChartTimestamp(sparseCandles.at(-1)?.time, '1');
    const timeAxisText = renderRowText(model.timeAxis);
    const highlightedRow = model.rows.find((row) =>
      row.segments.some((segment) => segment.text.includes('●')),
    );
    const highlightedRowText = highlightedRow
      ? renderRowText(highlightedRow)
      : '';
    const plotWidth = 40 - 9 - 1;

    expect(timeAxisText.indexOf(latestLabel)).toBe(
      plotWidth - latestLabel.length,
    );
    expect(highlightedRowText.indexOf('●')).toBe(plotWidth - 1);
  });
});

function renderRowText(row: { segments: Array<{ text: string }> }): string {
  return row.segments.map((segment) => segment.text).join('');
}
