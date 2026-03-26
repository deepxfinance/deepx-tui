import { Box, Text } from 'ink';
import type { FC } from 'react';

import { formatDebugFilterLine } from '../lib/dashboard-input';
import {
  filterLogEntries,
  type LogEntry,
  useLogEntries,
} from '../services/logger';

type DebugPanelProps = {
  filterQuery: string;
  height: number;
  isFocused: boolean;
};

export const DebugPanel: FC<DebugPanelProps> = ({
  filterQuery,
  height,
  isFocused,
}) => {
  const entries = useLogEntries();
  const filteredEntries = filterLogEntries(entries, filterQuery);
  const visibleRows = Math.max(height - 3, 1);
  const visibleEntries = filteredEntries.slice(-visibleRows);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isFocused ? 'yellow' : 'magenta'}
      paddingX={1}
      height={height}
      overflow="hidden"
    >
      <Text color={isFocused ? 'yellow' : 'magenta'}>Debug</Text>
      <Text color={isFocused ? 'yellow' : 'gray'}>
        {formatDebugFilterLine(filterQuery, isFocused ? 'debug' : 'chat')}
      </Text>
      {visibleEntries.length === 0 ? (
        <Text color="gray">
          {filterQuery ? 'No matching logs.' : 'No logs yet.'}
        </Text>
      ) : (
        visibleEntries.map((entry) => (
          <Text key={entry.id} color={getLogTone(entry.level)}>
            {formatLogLine(entry)}
          </Text>
        ))
      )}
    </Box>
  );
};

function formatLogLine(entry: LogEntry) {
  const time = entry.timestamp.slice(11, 19);
  const detailSuffix = entry.details ? ` ${entry.details}` : '';
  return `${time} [${entry.level.toUpperCase()}] ${entry.scope} ${entry.message}${detailSuffix}`;
}

function getLogTone(level: 'debug' | 'info' | 'warn' | 'error') {
  switch (level) {
    case 'info':
      return 'cyan';
    case 'warn':
      return 'yellow';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
}
