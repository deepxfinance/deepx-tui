import type { ChartCandle } from './chart-types';

export type PriceScale = {
  min: number;
  max: number;
  rowForPrice: (price: number) => number;
  priceForRow: (row: number) => number;
};

export function createPriceScale(
  candles: ChartCandle[],
  height: number,
): PriceScale {
  const low = Math.min(...candles.map((candle) => candle.low));
  const high = Math.max(...candles.map((candle) => candle.high));
  const spread = high - low || Math.max(high * 0.001, 1);
  const padding = spread * 0.08;
  const min = low - padding;
  const max = high + padding;
  const range = max - min || 1;

  return {
    min,
    max,
    rowForPrice(price) {
      const normalized = (price - min) / range;
      return height - 1 - Math.round(normalized * (height - 1));
    },
    priceForRow(row) {
      const normalized = (height - 1 - row) / Math.max(height - 1, 1);
      return min + normalized * range;
    },
  };
}
