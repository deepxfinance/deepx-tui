export type DashboardFocusTarget = 'pairs' | 'chart' | 'orderbook' | 'chat';

const CHAT_PLACEHOLDER = 'Ask about the market, keys, or the current pair...';

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
