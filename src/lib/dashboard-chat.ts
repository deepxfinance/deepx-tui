export type ChatMessage = {
  id: string;
  role: 'assistant' | 'user' | 'command';
  content: string;
};

import type { RuntimeNetwork } from '../config/networks';

type ChatPromptContext = {
  network: RuntimeNetwork;
  pairLabel: string;
  priceLabel: string;
  walletUnlocked: boolean;
};

const MAX_CHAT_MESSAGES = 12;
const MAX_GENAI_HISTORY = 8;
const CHAT_LOADING_FRAMES = ['.', '..', '...'];
const CHAT_LOADING_BASE = 'Thinking';
const CHAT_LOADING_FRAME_HOLD = 4;
const CHAT_LOADING_SHIMMER_COLORS = [
  '#2D7FA3',
  '#4BB6E3',
  '#7FDBFF',
  '#F2FDFF',
  '#7FDBFF',
  '#4BB6E3',
];

export type ChatLoadingSegment = {
  key: string;
  text: string;
  color?: string;
  dimColor: boolean;
  bold: boolean;
};

export function createInitialChatMessages(): ChatMessage[] {
  return [
    createChatMessage(
      'assistant',
      'DeepX agent ready. Ask for pair context, market structure, or execution ideas.',
      [],
    ),
    createChatMessage(
      'assistant',
      'Set GEMINI_API_KEY or GOOGLE_API_KEY to enable live replies from gemini-3-flash-preview.',
      [{ id: 'assistant-1', role: 'assistant', content: '' }],
    ),
  ];
}

export function appendChatMessage(
  messages: ChatMessage[],
  role: ChatMessage['role'],
  content: string,
): ChatMessage[] {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return messages;
  }

  return [...messages, createChatMessage(role, trimmedContent, messages)].slice(
    -MAX_CHAT_MESSAGES,
  );
}

export function getVisibleChatMessages(
  messages: ChatMessage[],
  maxMessages: number,
  scrollOffset = 0,
): ChatMessage[] {
  const maxVisibleMessages = Math.max(maxMessages, 1);
  const normalizedScrollOffset = Math.max(scrollOffset, 0);
  const endIndex = Math.max(messages.length - normalizedScrollOffset, 0);
  const startIndex = Math.max(0, endIndex - maxVisibleMessages);
  return messages.slice(startIndex, endIndex);
}

export function getMaxChatScrollOffset(
  messages: ChatMessage[],
  maxMessages: number,
) {
  return Math.max(0, messages.length - Math.max(maxMessages, 1));
}

export function buildChatSystemPrompt(context: ChatPromptContext): string {
  return [
    'You are DeepX Terminal Copilot inside a trading TUI.',
    'DeepX is a high-performance decentralized lending and trading platform for crypto spot and perpetual contracts.',
    'DeepX Chain powers the DeepX DEX. It is a self-developed blockchain designed for trading, built in Rust, with both Rust and EVM virtual machines and roughly 200,000 on-chain TPS.',
    'Subaccounts let one wallet manage multiple trading profiles. Each subaccount keeps its own margin balances, orders, positions, and risk parameters for portfolio segregation, strategy isolation, and risk control.',
    'Return pure text only with no Markdown formatting.',
    'Keep answers concise and terminal-friendly.',
    'Use the available DeepX tools when they improve accuracy for markets or orders.',
    'Use deepx_get_market_price_info when the user asks for the latest price or last 24h market change for a supported pair.',
    'Use deepx_get_wallet_portfolio when the user asks about wallet portfolio, balance, collateral, borrowing, positions, or current account exposure.',
    'Use deepx_list_subaccounts when the user asks which subaccounts belong to the local wallet.',
    'Use deepx_create_subaccount only to prepare subaccount creation details; never set confirm=true from AI chat.',
    'If the user wants to create a subaccount but has not provided a name, ask for the account name before calling deepx_create_subaccount.',
    'Use deepx_place_order to prepare requested order details; never set confirm=true from AI chat.',
    'Use deepx_close_position for position exits and deepx_update_position for take-profit or stop-loss changes when those actions are requested.',
    `The current terminal session network is ${context.network}; use that network for tool calls unless the user explicitly asks for a different one.`,
    'For trade requests that mention only an asset like SOL or ETH, resolve the order to the current active pair when the base asset matches.',
    'Do not switch between perp and spot markets unless the user explicitly names the pair format or explicitly asks for spot or perp.',
    'If the active pair is SOL-USDC and the user says buy SOL, prepare SOL-USDC, not SOL/USDC.',
    context.walletUnlocked
      ? 'The wallet for this session is already unlocked, and the terminal will submit a prepared order only after the user chooses Confirm in the below-input selector.'
      : 'A live perp or spot order requires the user to unlock the wallet and then choose Confirm in the terminal after reviewing the staged order.',
    'When deepx_place_order returns status=dry_run, say the order is staged and tell the user to choose Confirm or Cancel in the selector below the input bar.',
    'Do not tell the user to use an Order Entry panel, click buttons, or use controls that are not present in this terminal.',
    'Only say an order was submitted after the tool returns status=submitted.',
    'When an order or position tool response includes explorerUrl, always include that transaction explorer link in your reply.',
    'For a submitted order, format the response as a compact terminal-friendly block with short labeled lines for status, side, pair, type, size, price, tx hash, and explorer link.',
    'Use uppercase BUY or SELL exactly for the side field so the terminal can style it distinctly.',
    'Keep submitted-order responses crisp, structured, and visually clean for a narrow terminal.',
    'If those execution requirements are missing, explain the constraint instead of implying execution happened.',
    'Prefer actionable market commentary, risk framing, and keyboard guidance relevant to this terminal.',
  ].join(' ');
}

export function buildGenAiContents(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role !== 'command')
    .slice(-MAX_GENAI_HISTORY)
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));
}

export function createChatMessage(
  role: ChatMessage['role'],
  content: string,
  messages: ChatMessage[],
): ChatMessage {
  const nextId = getNextMessageId(messages);
  return {
    id: `${role}-${nextId}`,
    role,
    content,
  };
}

export function getChatLoadingMessage(frameIndex: number): string {
  const frame =
    CHAT_LOADING_FRAMES[Math.abs(frameIndex) % CHAT_LOADING_FRAMES.length] ??
    CHAT_LOADING_FRAMES[0];
  return `${CHAT_LOADING_BASE}${frame}`;
}

export function getChatLoadingSegments(
  frameIndex: number,
): ChatLoadingSegment[] {
  const normalizedFrameIndex = Math.abs(frameIndex);
  const text = getChatLoadingMessage(
    Math.floor(normalizedFrameIndex / CHAT_LOADING_FRAME_HOLD),
  );
  const longestTextLength =
    CHAT_LOADING_BASE.length +
    Math.max(...CHAT_LOADING_FRAMES.map((frame) => frame.length));
  const shimmerPosition =
    normalizedFrameIndex %
    (longestTextLength + CHAT_LOADING_SHIMMER_COLORS.length);
  const highlightIndex = Math.floor(CHAT_LOADING_SHIMMER_COLORS.length / 2);

  return text.split('').map((character, index) => {
    const color = getShimmerColor(index, shimmerPosition);

    return {
      key: `loading-${index}-${character === '.' ? 'dot' : character}`,
      text: character,
      color,
      dimColor: color === undefined,
      bold: shimmerPosition - index === highlightIndex,
    };
  });
}

function getNextMessageId(messages: ChatMessage[]): number {
  const lastId = messages.at(-1)?.id ?? 'assistant-0';
  const suffix = Number(lastId.split('-').at(-1) ?? 0);
  return Number.isFinite(suffix) ? suffix + 1 : messages.length + 1;
}

function getShimmerColor(
  index: number,
  shimmerPosition: number,
): string | undefined {
  const colorIndex = shimmerPosition - index;
  if (colorIndex < 0 || colorIndex >= CHAT_LOADING_SHIMMER_COLORS.length) {
    return undefined;
  }

  return CHAT_LOADING_SHIMMER_COLORS[colorIndex];
}
