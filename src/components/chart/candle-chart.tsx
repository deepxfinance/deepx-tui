import { Box, Text } from 'ink';
import type { FC } from 'react';
import { useMemo } from 'react';

import { buildChartModel } from './chart-render';
import type { ChartCandle } from './chart-types';

type CandleChartProps = {
  candles: ChartCandle[];
  width: number;
  height: number;
  pairLabel: string;
  resolution: string;
  resolutionLabel: string;
  lastPriceLabel: string;
  changeLabel: string;
  changeColor: string;
  streamStatus: 'live' | 'reconnecting' | 'stale';
};

export const CandleChart: FC<CandleChartProps> = ({
  candles,
  width,
  height,
  pairLabel,
  resolution,
  resolutionLabel,
  lastPriceLabel,
  changeLabel,
  changeColor,
  streamStatus,
}) => {
  const model = useMemo(
    () => buildChartModel(candles, { width, height, resolution }),
    [candles, height, resolution, width],
  );

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="white">{pairLabel}</Text>
        <Text color="gray"> {resolutionLabel}</Text>
        <Text color="gray"> Last </Text>
        <Text color="white">{lastPriceLabel}</Text>
        <Text color="gray"> 24h </Text>
        <Text color={changeColor}>{changeLabel}</Text>
        <Text color="gray"> feed </Text>
        <Text color={getStreamStatusColor(streamStatus)}>{streamStatus}</Text>
      </Text>
      {model.rows.map((row) => (
        <Text key={row.key}>
          {row.segments.map((segment) => (
            <Text key={segment.key} color={segment.color}>
              {segment.text}
            </Text>
          ))}
        </Text>
      ))}
      {model.volumeRows.map((row) => (
        <Text key={row.key}>
          {row.segments.map((segment) => (
            <Text key={segment.key} color={segment.color}>
              {segment.text}
            </Text>
          ))}
        </Text>
      ))}
      <Text key={model.timeAxis.key}>
        {model.timeAxis.segments.map((segment) => (
          <Text key={segment.key} color={segment.color}>
            {segment.text}
          </Text>
        ))}
      </Text>
    </Box>
  );
};

function getStreamStatusColor(
  streamStatus: 'live' | 'reconnecting' | 'stale',
): string {
  switch (streamStatus) {
    case 'live':
      return '#28DE9C';
    case 'stale':
      return '#F0C36A';
    default:
      return '#8A8A8A';
  }
}
