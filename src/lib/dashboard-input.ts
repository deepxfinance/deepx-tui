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

export type ShellComposerParts = {
  before: string;
  at: string;
  after: string;
};

export function parseShellComposerParts(
  input: string,
  cursorIndex = 0,
): ShellComposerParts {
  if (!input) {
    return { before: '', at: '', after: '' };
  }

  const safeIndex = Math.max(0, Math.min(cursorIndex, input.length));

  if (safeIndex === input.length) {
    return { before: input, at: '', after: '' };
  }

  const before = input.slice(0, safeIndex);
  const at = input.charAt(safeIndex);
  const after = input.slice(safeIndex + 1);

  return { before, at, after };
}

export function formatShellComposerLine(
  input: string,
  cursorIndex = 0,
  isFocused = true,
): string {
  if (!input) {
    return isFocused ? `> █ ${CHAT_PLACEHOLDER}` : `> ${CHAT_PLACEHOLDER}`;
  }

  if (!isFocused) {
    return `> ${input}`;
  }

  const parts = parseShellComposerParts(input, cursorIndex);
  const atChar = parts.at || ' ';

  return `> ${parts.before}\x1b[7m${atChar}\x1b[0m${parts.after}`;
}

export function insertCharAt(
  input: string,
  index: number,
  char: string,
): string {
  const safeIndex = Math.max(0, Math.min(index, input.length));
  return input.slice(0, safeIndex) + char + input.slice(safeIndex);
}

export function removeCharAt(
  input: string,
  index: number,
  isDelete = false,
): string {
  if (isDelete) {
    if (index < 0 || index >= input.length) {
      return input;
    }
    return input.slice(0, index) + input.slice(index + 1);
  }

  if (index <= 0 || index > input.length) {
    return input;
  }
  return input.slice(0, index - 1) + input.slice(index);
}

export function getPrevWordIndex(input: string, currentIndex: number): number {
  if (currentIndex <= 0) {
    return 0;
  }

  const wordSeparators = [' ', '-', '_', '/', '\\', '.', ','];
  let index = currentIndex - 1;

  // Skip trailing separators
  while (index > 0 && wordSeparators.includes(input[index] ?? '')) {
    index--;
  }

  // Go to start of current word
  while (index > 0 && !wordSeparators.includes(input[index - 1] ?? '')) {
    index--;
  }

  return index;
}

export function getNextWordIndex(input: string, currentIndex: number): number {
  if (currentIndex >= input.length) {
    return input.length;
  }

  const wordSeparators = [' ', '-', '_', '/', '\\', '.', ','];
  let index = currentIndex;

  // Skip leading separators
  while (index < input.length && wordSeparators.includes(input[index] ?? '')) {
    index++;
  }

  // Go to end of current word
  while (index < input.length && !wordSeparators.includes(input[index] ?? '')) {
    index++;
  }

  return index;
}

export function removeWordBefore(input: string, currentIndex: number): string {
  const prevWordStart = getPrevWordIndex(input, currentIndex);
  return input.slice(0, prevWordStart) + input.slice(currentIndex);
}

export function removeLineBefore(input: string, currentIndex: number): string {
  return input.slice(currentIndex);
}

export function removeLineAfter(input: string, currentIndex: number): string {
  return input.slice(0, currentIndex);
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

export function getHistoryValue(
  history: string[],
  currentIndex: number | null,
  direction: 'up' | 'down',
  draftValue: string,
): { nextIndex: number | null; nextValue: string } {
  if (history.length === 0) {
    return { nextIndex: null, nextValue: draftValue };
  }

  if (direction === 'up') {
    if (currentIndex === null) {
      return {
        nextIndex: history.length - 1,
        nextValue: history[history.length - 1] ?? draftValue,
      };
    }
    if (currentIndex > 0) {
      const nextIndex = currentIndex - 1;
      return {
        nextIndex,
        nextValue: history[nextIndex] ?? draftValue,
      };
    }
    return { nextIndex: 0, nextValue: history[0] ?? draftValue };
  }

  if (currentIndex === null) {
    return { nextIndex: null, nextValue: draftValue };
  }
  if (currentIndex < history.length - 1) {
    const nextIndex = currentIndex + 1;
    return {
      nextIndex,
      nextValue: history[nextIndex] ?? draftValue,
    };
  }
  return { nextIndex: null, nextValue: draftValue };
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
