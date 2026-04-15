export type ChatMessage = {
  id: string;
  role: 'assistant' | 'user' | 'command';
  content: string;
};

type ChatPromptContext = {
  pairLabel: string;
  priceLabel: string;
  resolutionLabel: string;
  walletUnlocked: boolean;
};

const MAX_CHAT_MESSAGES = 12;
const MAX_GENAI_HISTORY = 8;
const CHAT_LOADING_FRAMES = ['.', '..', '...'];
const CHAT_LOADING_BASE = 'Thinking';
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
): ChatMessage[] {
  return messages.slice(-Math.max(maxMessages, 1));
}

export function buildChatSystemPrompt(context: ChatPromptContext): string {
  return [
    'You are DeepX Terminal Copilot inside a trading TUI.',
    'Respond in plain text only.',
    'Keep answers concise and terminal-friendly.',
    'Use the available DeepX tools when they improve accuracy for markets or orders.',
    'Use deepx_get_user_balance when the user asks about balance, collateral, borrowing, or current account exposure.',
    'Use deepx_place_order for live perp order placement only when the user explicitly wants execution.',
    'Use deepx_close_position for position exits and deepx_update_position for take-profit or stop-loss changes when those actions are requested.',
    context.walletUnlocked
      ? 'The wallet for this session is already unlocked. Do not ask for the passphrase again and omit passphrase from order tool calls unless the user explicitly wants to override it.'
      : 'A live perp order requires confirm=true and either a wallet passphrase or an already unlocked session wallet.',
    'Only say an order was submitted after the tool returns status=submitted.',
    'If those execution requirements are missing, explain the constraint instead of implying execution happened.',
    `Active pair: ${context.pairLabel}.`,
    `Displayed price: ${context.priceLabel}.`,
    `Chart resolution: ${context.resolutionLabel}.`,
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
  const text = getChatLoadingMessage(frameIndex);
  const shimmerPosition =
    Math.abs(frameIndex) % (text.length + CHAT_LOADING_SHIMMER_COLORS.length);
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
