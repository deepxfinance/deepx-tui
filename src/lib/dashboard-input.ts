import { truncateMiddle } from './format';

export type ShellCommand = 'candle' | 'orderbook' | 'help';

export type ParsedShellInput =
  | { kind: 'chat'; message: string }
  | { kind: 'command'; command: ShellCommand };

export type ShellComposerParts = {
  before: string;
  at: string;
  after: string;
};

export type CommandPaletteItem = {
  command: ShellCommand;
  label: string;
  description: string;
};

export type PairPickerItem = {
  label: string;
  description: string;
};

type PairPickerOption = {
  kind: string;
  label: string;
};

const CHAT_PLACEHOLDER = 'Type a message or use /orderbook, /help';
const COMMAND_PALETTE_ITEMS: CommandPaletteItem[] = [
  {
    command: 'orderbook',
    label: '/orderbook',
    description: 'Open the live orderbook ladder workspace',
  },
  {
    command: 'help',
    label: '/help',
    description: 'Show the command summary in the workspace',
  },
];

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
  cursorIndex = input.length,
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

export function parseShellComposerParts(
  input: string,
  cursorIndex = 0,
): ShellComposerParts {
  if (!input) {
    return { before: '', at: '', after: '' };
  }

  const safeIndex = Math.max(0, Math.min(cursorIndex, input.length));
  if (safeIndex === input.length) {
    return {
      before: input,
      at: '',
      after: '',
    };
  }

  return {
    before: input.slice(0, safeIndex),
    at: input.charAt(safeIndex),
    after: input.slice(safeIndex + 1),
  };
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

  const separators = [' ', '-', '_', '/', '\\', '.', ','];
  let index = currentIndex - 1;

  while (index > 0 && separators.includes(input[index] ?? '')) {
    index--;
  }

  while (index > 0 && !separators.includes(input[index - 1] ?? '')) {
    index--;
  }

  return index;
}

export function getNextWordIndex(input: string, currentIndex: number): number {
  if (currentIndex >= input.length) {
    return input.length;
  }

  const separators = [' ', '-', '_', '/', '\\', '.', ','];
  let index = currentIndex;

  while (index < input.length && separators.includes(input[index] ?? '')) {
    index++;
  }

  while (index < input.length && !separators.includes(input[index] ?? '')) {
    index++;
  }

  return index;
}

export function removeWordBefore(input: string, currentIndex: number): string {
  const previousWordIndex = getPrevWordIndex(input, currentIndex);
  return input.slice(0, previousWordIndex) + input.slice(currentIndex);
}

export function removeWordAfter(input: string, currentIndex: number): string {
  const nextWordIndex = getNextWordIndex(input, currentIndex);
  return input.slice(0, currentIndex) + input.slice(nextWordIndex);
}

export function removeLineBefore(input: string, currentIndex: number): string {
  return input.slice(currentIndex);
}

export function removeLineAfter(input: string, currentIndex: number): string {
  return input.slice(0, currentIndex);
}

export function isSlashCommandInput(input: string) {
  return input.trimStart().startsWith('/');
}

export function buildCommandPaletteItems(input: string): CommandPaletteItem[] {
  if (!isSlashCommandInput(input)) {
    return [];
  }

  const normalizedQuery = input.trimStart().slice(1).trim().toLowerCase();

  if (!normalizedQuery) {
    return COMMAND_PALETTE_ITEMS;
  }

  return COMMAND_PALETTE_ITEMS.filter(
    (item) =>
      item.command.includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery),
  );
}

export function shouldCommandPaletteCaptureArrows(input: string) {
  if (!isSlashCommandInput(input)) {
    return false;
  }

  return parseShellInput(input)?.kind !== 'command';
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

    return {
      nextIndex: 0,
      nextValue: history[0] ?? draftValue,
    };
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

const HIDDEN_PAIR_PICKER_LABELS = new Set(['BTC-USDC']);
const PAIR_PICKER_LABEL_PRIORITY = new Map([
  ['ETH-USDC', 0],
  ['SOL-USDC', 1],
]);

export function buildPairPickerItems(
  pairs: PairPickerOption[],
): PairPickerItem[] {
  return buildPairPickerOptions(pairs).map((pair) => ({
    label: pair.label,
    description: pair.kind.toUpperCase(),
  }));
}

export function buildPairPickerOptions(pairs: PairPickerOption[]) {
  return pairs
    .filter((pair) => !HIDDEN_PAIR_PICKER_LABELS.has(pair.label))
    .toSorted((left, right) => {
      const leftPriority =
        PAIR_PICKER_LABEL_PRIORITY.get(left.label) ?? Number.MAX_SAFE_INTEGER;
      const rightPriority =
        PAIR_PICKER_LABEL_PRIORITY.get(right.label) ?? Number.MAX_SAFE_INTEGER;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.label.localeCompare(right.label);
    });
}
