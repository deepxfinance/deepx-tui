import { formatChartTimestamp } from '../../lib/time';
import { createPriceScale } from './chart-scale';
import { chartTheme } from './chart-theme';
import type {
  ChartCandle,
  ChartModel,
  ChartRow,
  ChartSegment,
} from './chart-types';

type RenderOptions = {
  width: number;
  height: number;
  resolution?: string;
  priceAxisWidth?: number;
  volumeHeight?: number;
};

type Cell = {
  char: string;
  color?: string;
  priority: number;
};

export function buildChartModel(
  candles: ChartCandle[],
  options: RenderOptions,
): ChartModel {
  const priceAxisWidth = options.priceAxisWidth ?? 9;
  const plotWidth = Math.max(options.width - priceAxisWidth - 1, 1);
  const plotMetrics = resolvePlotMetrics(plotWidth);
  const visibleCandles = candles.slice(-plotMetrics.visibleCapacity);
  const activeColumns = plotMetrics.columns.slice(
    Math.max(plotMetrics.columns.length - visibleCandles.length, 0),
  );
  const plotColumns = new Set(activeColumns);
  const volumeHeight = options.volumeHeight ?? 4;
  const candleHeight = Math.max(options.height - volumeHeight, 4);
  const scale = createPriceScale(visibleCandles, candleHeight);
  const gridRows = new Set([
    0,
    Math.floor((candleHeight - 1) * 0.33),
    Math.floor((candleHeight - 1) * 0.66),
    candleHeight - 1,
  ]);
  const lastPrice = visibleCandles[visibleCandles.length - 1]?.close ?? 0;
  const lastPriceRow = scale.rowForPrice(lastPrice);
  const matrix = Array.from({ length: candleHeight }, (_, y) =>
    Array.from(
      { length: plotWidth },
      (_, _x): Cell => ({
        char: gridRows.has(y) && plotColumns.has(_x) ? '┈' : ' ',
        color:
          gridRows.has(y) && plotColumns.has(_x) ? chartTheme.grid : undefined,
        priority: gridRows.has(y) && plotColumns.has(_x) ? 0 : -1,
      }),
    ),
  );

  for (const [index, candle] of visibleCandles.entries()) {
    const x = activeColumns[index];
    if (x == null) {
      continue;
    }

    const wickColor =
      candle.close >= candle.open ? chartTheme.up : chartTheme.down;
    const highRow = scale.rowForPrice(candle.high);
    const lowRow = scale.rowForPrice(candle.low);
    const openRow = scale.rowForPrice(candle.open);
    const closeRow = scale.rowForPrice(candle.close);
    const bodyStart = Math.min(openRow, closeRow);
    const bodyEnd = Math.max(openRow, closeRow);

    for (let y = highRow; y <= lowRow; y += 1) {
      paintCell(matrix, x, y, '│', wickColor, 2);
    }

    for (let y = bodyStart; y <= bodyEnd; y += 1) {
      paintCell(
        matrix,
        x,
        y,
        candle.close >= candle.open ? '█' : '▓',
        wickColor,
        3,
      );
    }
  }

  const lastColumn = activeColumns[activeColumns.length - 1];
  for (const x of activeColumns) {
    paintCell(
      matrix,
      x,
      lastPriceRow,
      x === lastColumn ? '●' : '─',
      chartTheme.priceLine,
      x === lastColumn ? 5 : 1,
    );
  }

  const rows = matrix.map((cells, y) => {
    const isLastPriceRow = y === lastPriceRow;
    const axisLabel = formatPrice(
      isLastPriceRow ? lastPrice : scale.priceForRow(y),
    ).padStart(priceAxisWidth, ' ');
    const segments = compressCells(cells, `row-${y}`).concat({
      key: `axis-${y}`,
      text: ` ${axisLabel}`,
      color: isLastPriceRow ? chartTheme.priceLine : chartTheme.axis,
    });

    return {
      key: `chart-row-${y}-${axisLabel.trim()}`,
      segments,
    };
  });

  return {
    rows,
    volumeRows: buildVolumeRows(
      visibleCandles,
      plotWidth,
      volumeHeight,
      priceAxisWidth,
      activeColumns,
    ),
    timeAxis: buildTimeAxis(
      visibleCandles,
      plotWidth,
      priceAxisWidth,
      options.resolution ?? '15',
      activeColumns,
    ),
    minPrice: scale.min,
    maxPrice: scale.max,
    lastPrice,
  };
}

function buildVolumeRows(
  candles: ChartCandle[],
  width: number,
  height: number,
  priceAxisWidth: number,
  columns: number[],
): ChartRow[] {
  if (candles.length === 0) {
    return Array.from({ length: height }, (_, rowIndex) => ({
      key: `volume-row-${rowIndex}`,
      segments: [
        {
          key: `volume-empty-${rowIndex}`,
          text: ''.padEnd(width, ' '),
        },
        {
          key: `volume-axis-${rowIndex}`,
          text: ` ${''.padStart(priceAxisWidth, ' ')}`,
        },
      ],
    }));
  }

  const maxVolume = Math.max(...candles.map((candle) => candle.volume), 1);
  const matrix = Array.from({ length: height }, () =>
    Array.from(
      { length: width },
      (): Cell => ({
        char: ' ',
        priority: -1,
      }),
    ),
  );

  for (const [index, candle] of candles.entries()) {
    const x = columns[index];
    if (x == null) {
      continue;
    }

    const barHeight = Math.max(
      1,
      Math.round((candle.volume / maxVolume) * height),
    );
    const color = candle.close >= candle.open ? chartTheme.up : chartTheme.down;
    for (let offset = 0; offset < barHeight; offset += 1) {
      const y = height - 1 - offset;
      paintCell(matrix, x, y, '▇', color, 1);
    }
  }

  return matrix.map((cells, rowIndex) => {
    const label = rowIndex === 0 ? `${formatCompact(maxVolume)}v` : '';
    return {
      key: `volume-row-${rowIndex}`,
      segments: compressCells(cells, `volume-${rowIndex}`).concat({
        key: `volume-axis-${rowIndex}`,
        text: ` ${label.padStart(priceAxisWidth, ' ')}`,
        color: chartTheme.axis,
      }),
    };
  });
}

function buildTimeAxis(
  candles: ChartCandle[],
  width: number,
  priceAxisWidth: number,
  resolution: string,
  columns: number[],
): ChartRow {
  const axis = Array.from({ length: width }, () => ' ');
  const checkpoints = resolveTimeAxisCheckpoints(candles, width, resolution);
  const lastCheckpoint = checkpoints[checkpoints.length - 1];

  if (lastCheckpoint) {
    placeAxisLabel(
      axis,
      lastCheckpoint.label,
      Math.max(width - lastCheckpoint.label.length, 0),
    );
  }

  for (const checkpoint of checkpoints.slice(0, -1)) {
    const column = columns[Math.min(checkpoint.index, columns.length - 1)] ?? 0;
    placeAxisLabel(
      axis,
      checkpoint.label,
      resolveAxisLabelStart(width, checkpoint.label.length, column),
    );
  }

  return {
    key: 'time-axis',
    segments: [
      {
        key: 'time-axis-main',
        text: axis.join(''),
        color: chartTheme.axis,
      },
      {
        key: 'time-axis-pad',
        text: ' '.repeat(priceAxisWidth + 1),
      },
    ],
  };
}

function resolvePlotMetrics(width: number): {
  columns: number[];
  visibleCapacity: number;
} {
  const gap = width >= 24 ? 1 : 0;
  const step = gap + 1;
  const visibleCapacity = Math.max(Math.floor((width + gap) / step), 1);
  const offset = Math.max(width - (visibleCapacity - 1) * step - 1, 0);
  const columns = Array.from({ length: visibleCapacity }, (_, index) => {
    return offset + index * step;
  }).filter((column) => column < width);

  return {
    columns,
    visibleCapacity: columns.length,
  };
}

function resolveTimeAxisCheckpoints(
  candles: ChartCandle[],
  width: number,
  resolution: string,
): Array<{ index: number; label: string }> {
  if (candles.length === 0) {
    return [{ index: 0, label: formatChartTimestamp(undefined, resolution) }];
  }

  const targetCount = Math.max(
    3,
    Math.min(candles.length, Math.floor(width / 6)),
  );
  const checkpoints: Array<{ index: number; label: string }> = [];
  const usedIndexes = new Set<number>();

  for (let position = 0; position < targetCount; position += 1) {
    const index =
      targetCount === 1
        ? candles.length - 1
        : Math.round((position * (candles.length - 1)) / (targetCount - 1));
    if (usedIndexes.has(index)) {
      continue;
    }

    usedIndexes.add(index);
    checkpoints.push({
      index,
      label: formatChartTimestamp(candles[index]?.time, resolution),
    });
  }

  return checkpoints;
}

function resolveAxisLabelStart(
  width: number,
  labelLength: number,
  column: number,
): number {
  const maxStart = Math.max(width - labelLength, 0);
  return Math.max(0, Math.min(column - Math.floor(labelLength / 2), maxStart));
}

function placeAxisLabel(axis: string[], label: string, start: number) {
  const end = start + label.length;

  if (axis.slice(start, end).some((char) => char !== ' ')) {
    return;
  }

  for (const [offset, char] of [...label].entries()) {
    const index = start + offset;
    axis[index] = char;
  }
}

function compressCells(cells: Cell[], prefix: string): ChartSegment[] {
  const segments: ChartSegment[] = [];
  let current = '';
  let currentColor: string | undefined;

  for (const [index, cell] of cells.entries()) {
    if (cell.color !== currentColor && current) {
      segments.push({
        key: `${prefix}-${segments.length}`,
        text: current,
        color: currentColor,
      });
      current = '';
    }

    current += cell.char;
    currentColor = cell.color;

    if (index === cells.length - 1 && current) {
      segments.push({
        key: `${prefix}-${segments.length}`,
        text: current,
        color: currentColor,
      });
    }
  }

  return segments;
}

function paintCell(
  matrix: Cell[][],
  x: number,
  y: number,
  char: string,
  color: string,
  priority: number,
) {
  const row = matrix[y];
  const cell = row?.[x];
  if (!cell || priority < cell.priority) {
    return;
  }

  row[x] = { char, color, priority };
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return value.toFixed(2);
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return value.toFixed(0);
}
