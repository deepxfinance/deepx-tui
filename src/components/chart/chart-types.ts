export type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ChartSegment = {
  key: string;
  text: string;
  color?: string;
};

export type ChartRow = {
  key: string;
  segments: ChartSegment[];
};

export type ChartModel = {
  rows: ChartRow[];
  volumeRows: ChartRow[];
  timeAxis: ChartRow;
  minPrice: number;
  maxPrice: number;
  lastPrice: number;
};
