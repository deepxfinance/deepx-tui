import { Box, Text } from 'ink';
import type { FC } from 'react';

import type { MarketPair } from '../services/market-catalog';
import {
  buildPositionPanelRows,
  getPositionPanelHeader,
  type PerpPosition,
} from '../services/user-perp-positions';

type PositionsPanelProps = {
  height: number;
  pairs: MarketPair[];
  positions: PerpPosition[];
  overview: Record<string, { latestPrice?: number }>;
};

export const PositionsPanel: FC<PositionsPanelProps> = ({
  height,
  pairs,
  positions,
  overview,
}) => {
  const visibleRows = Math.max(height - 3, 1);
  const rows = buildPositionPanelRows({
    positions,
    pairs,
    overview,
    maxRows: visibleRows,
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      height={height}
      overflow="hidden"
      flexGrow={1}
    >
      <Text color="gray">Positions</Text>
      <Text color="gray">{getPositionPanelHeader()}</Text>
      {rows.map((row) => (
        <Text key={row.key} color={row.tone}>
          {row.text}
        </Text>
      ))}
    </Box>
  );
};
