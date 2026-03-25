import process from 'node:process';

import { buildChatSystemPrompt, type ChatMessage } from '../lib/dashboard-chat';

export const GEMINI_MODEL = 'gemini-3-flash-preview';

type GeminiContext = {
  pairLabel: string;
  priceLabel: string;
  resolutionLabel: string;
};

export async function requestGeminiChat(input: {
  messages: ChatMessage[];
  context: GeminiContext;
}): Promise<string> {
  if (!input.messages.some((message) => message.role === 'user')) {
    throw new Error('No user prompt available for Gemini CLI.');
  }

  try {
    const child = Bun.spawn({
      cmd: [
        'gemini',
        '--prompt',
        buildGeminiCliPrompt(input.messages, input.context),
        '--model',
        GEMINI_MODEL,
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        NO_COLOR: '1',
        CI: '1',
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    if (exitCode !== 0) {
      throw new Error(extractGeminiCliError(stderr, exitCode));
    }

    const text = normalizeGeminiCliOutput(stdout);
    if (!text) {
      throw new Error('Gemini CLI returned no text.');
    }

    return text;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Gemini CLI request failed.');
  }
}

export function buildGeminiCliPrompt(
  messages: ChatMessage[],
  context: GeminiContext,
): string {
  const history = messages
    .slice(-8)
    .map(
      (message) =>
        `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`,
    )
    .join('\n');

  return [
    buildChatSystemPrompt(context),
    '',
    'Conversation:',
    history,
    '',
    'Respond to the latest user message only.',
  ].join('\n');
}

export function normalizeGeminiCliOutput(output: string): string {
  return stripAnsi(output).trim();
}

export function extractGeminiCliError(
  stderr: string,
  exitCode: number,
): string {
  const text = stripAnsi(stderr).trim();
  if (text) {
    return text;
  }

  return `Gemini CLI exited with status ${exitCode}.`;
}

function stripAnsi(value: string): string {
  let output = '';

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];

    if (current === '\u001b' && next === '[') {
      index += 2;

      while (index < value.length) {
        const code = value[index];
        if (
          code != null &&
          ((code >= 'A' && code <= 'Z') || (code >= 'a' && code <= 'z'))
        ) {
          break;
        }

        index += 1;
      }

      continue;
    }

    output += current;
  }

  return output;
}
