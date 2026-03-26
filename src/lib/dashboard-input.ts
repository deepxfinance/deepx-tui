export type DashboardFocusTarget =
  | 'pairs'
  | 'chart'
  | 'orderbook'
  | 'trades'
  | 'chat'
  | 'debug';

const FOCUS_ORDER: DashboardFocusTarget[] = [
  'pairs',
  'chart',
  'orderbook',
  'trades',
  'chat',
];

const CHAT_PLACEHOLDER = 'Ask about the market, keys, or the current pair...';
const DEBUG_FILTER_PLACEHOLDER = 'Filter logs by scope, message, or details...';

export function getPairKindShortcut(
  input: string,
  focusTarget: DashboardFocusTarget,
): 'perp' | 'spot' | null {
  if (focusTarget === 'chat') {
    return null;
  }

  if (input === '1') {
    return 'perp';
  }

  if (input === '2') {
    return 'spot';
  }

  return null;
}

export function formatChatComposerLine(
  input: string,
  focusTarget: DashboardFocusTarget,
): string {
  if (focusTarget !== 'chat') {
    return `> ${input || CHAT_PLACEHOLDER}`;
  }

  if (!input) {
    return `> █ ${CHAT_PLACEHOLDER}`;
  }

  return `> ${input}█`;
}

export function formatDebugFilterLine(
  input: string,
  focusTarget: DashboardFocusTarget,
): string {
  if (focusTarget !== 'debug') {
    return `filter> ${input || DEBUG_FILTER_PLACEHOLDER}`;
  }

  if (!input) {
    return `filter> █ ${DEBUG_FILTER_PLACEHOLDER}`;
  }

  return `filter> ${input}█`;
}

export function cycleFocusTarget(
  focusTarget: DashboardFocusTarget,
  includeDebug = false,
): DashboardFocusTarget {
  const focusOrder: DashboardFocusTarget[] = includeDebug
    ? [...FOCUS_ORDER, 'debug']
    : [...FOCUS_ORDER];
  const currentIndex = focusOrder.indexOf(focusTarget);
  return focusOrder[(currentIndex + 1) % focusOrder.length] ?? 'pairs';
}
