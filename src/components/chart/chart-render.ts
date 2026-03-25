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
  const visibleCandles = candles.slice(-Math.max(options.width, 1));
  const volumeHeight = options.volumeHeight ?? 4;
  const candleHeight = Math.max(options.height - volumeHeight, 4);
  const scale = createPriceScale(visibleCandles, candleHeight);
  const priceAxisWidth = options.priceAxisWidth ?? 9;
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
      { length: options.width },
      (_, _x): Cell => ({
        char: gridRows.has(y) ? '┈' : ' ',
        color: gridRows.has(y) ? chartTheme.grid : undefined,
        priority: gridRows.has(y) ? 0 : -1,
      }),
    ),
  );

  for (const [x, candle] of visibleCandles.entries()) {
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

  for (let x = 0; x < options.width; x += 1) {
    paintCell(
      matrix,
      x,
      lastPriceRow,
      x === options.width - 1 ? '●' : '─',
      chartTheme.priceLine,
      x === options.width - 1 ? 5 : 1,
    );
  }

  const rows = matrix.map((cells, y) => {
    const axisLabel = formatPrice(scale.priceForRow(y)).padStart(
      priceAxisWidth,
      ' ',
    );
    const segments = compressCells(cells, `row-${y}`).concat({
      key: `axis-${y}`,
      text: ` ${axisLabel}`,
      color: chartTheme.axis,
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
      options.width,
      volumeHeight,
      priceAxisWidth,
    ),
    timeAxis: buildTimeAxis(visibleCandles, options.width, priceAxisWidth),
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

  for (const [x, candle] of candles.entries()) {
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
): ChartRow {
  const axis = Array.from({ length: width }, () => ' ');
  const checkpoints = [0, Math.floor((width - 1) / 2), Math.max(width - 6, 0)];
  const labels = [
    formatTime(candles[0]?.time),
    formatTime(candles[Math.floor((candles.length - 1) / 2)]?.time),
    formatTime(candles[candles.length - 1]?.time),
  ];

  for (const [index, start] of checkpoints.entries()) {
    const label = labels[index] ?? '--:--';
    for (const [offset, char] of [...label].entries()) {
      const x = start + offset;
      if (x < width) {
        axis[x] = char;
      }
    }
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

function formatTime(value?: number): string {
  if (!value) {
    return '--:--';
  }

  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}
