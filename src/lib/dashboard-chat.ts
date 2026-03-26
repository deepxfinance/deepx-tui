export type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
};

type ChatPromptContext = {
  pairLabel: string;
  priceLabel: string;
  resolutionLabel: string;
};

const MAX_CHAT_MESSAGES = 12;
const MAX_GENAI_HISTORY = 8;

export function createInitialChatMessages(): ChatMessage[] {
  return [
    createChatMessage(
      'assistant',
      'DeepX agent ready. Ask for pair context, market structure, or execution ideas.',
      [],
    ),
    createChatMessage(
      'assistant',
      'Set GEMINI_API_KEY or GOOGLE_API_KEY to enable live replies from gemini-3-flash-previous.',
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
    'AI chat is advisory-only for trading actions.',
    'Never claim to execute trades or place live orders.',
    'Use order tools for analysis and dry-run planning only.',
    `Active pair: ${context.pairLabel}.`,
    `Displayed price: ${context.priceLabel}.`,
    `Chart resolution: ${context.resolutionLabel}.`,
    'Prefer actionable market commentary, risk framing, and keyboard guidance relevant to this terminal.',
  ].join(' ');
}

export function buildGenAiContents(messages: ChatMessage[]) {
  return messages.slice(-MAX_GENAI_HISTORY).map((message) => ({
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

function getNextMessageId(messages: ChatMessage[]): number {
  const lastId = messages.at(-1)?.id ?? 'assistant-0';
  const suffix = Number(lastId.split('-').at(-1) ?? 0);
  return Number.isFinite(suffix) ? suffix + 1 : messages.length + 1;
}
