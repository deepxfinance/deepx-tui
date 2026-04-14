import { truncateMiddle } from './format';

export type ShellCommand = 'candle' | 'orderbook' | 'help';

export type ParsedShellInput =
  | { kind: 'chat'; message: string }
  | { kind: 'command'; command: ShellCommand };

export type PairPickerItem = {
  label: string;
  description: string;
};

const CHAT_PLACEHOLDER = 'Type a message or use /candle, /orderbook, /help';
const HISTORY_PLACEHOLDER = 'No history yet.';

export function parseShellInput(input: string): ParsedShellInput | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!trimmed.startsWith('/')) {
    return {
      kind: 'chat',
      message: trimmed,
    };
  }

  const normalizedCommand = trimmed.slice(1).trim().toLowerCase();
  if (
    normalizedCommand === 'candle' ||
    normalizedCommand === 'orderbook' ||
    normalizedCommand === 'help'
  ) {
    return {
      kind: 'command',
      command: normalizedCommand,
    };
  }

  return {
    kind: 'chat',
    message: trimmed,
  };
}

export function formatShellComposerLine(
  input: string,
  isFocused = true,
): string {
  if (!input) {
    return isFocused ? `> █ ${CHAT_PLACEHOLDER}` : `> ${CHAT_PLACEHOLDER}`;
  }

  return isFocused ? `> ${input}█` : `> ${input}`;
}

export function formatHistoryLine(entries: string[], maxItems = 3): string {
  const visibleEntries = entries
    .filter((entry) => entry.trim().length > 0)
    .slice(-Math.max(maxItems, 1));

  if (visibleEntries.length === 0) {
    return `History: ${HISTORY_PLACEHOLDER}`;
  }

  return `History: ${visibleEntries.join('  |  ')}`;
}

export function formatNetworkLine(input: {
  networkLabel: string;
  walletAddress?: string;
  walletUnlocked: boolean;
}) {
  const walletLabel = input.walletAddress
    ? truncateMiddle(input.walletAddress)
    : 'no wallet loaded';
  const modeLabel = input.walletUnlocked ? 'wallet unlocked' : 'read-only';
  return `Network: ${input.networkLabel}  |  ${modeLabel}  |  ${walletLabel}`;
}

export function moveSelectionIndex(
  currentIndex: number,
  itemCount: number,
  direction: -1 | 1,
) {
  if (itemCount <= 0) {
    return 0;
  }

  return (currentIndex + direction + itemCount) % itemCount;
}

export function buildPairPickerItems(
  pairs: Array<{ kind: string; label: string }>,
): PairPickerItem[] {
  return pairs.map((pair) => ({
    label: pair.label,
    description: pair.kind.toUpperCase(),
  }));
}
