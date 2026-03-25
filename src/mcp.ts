#!/usr/bin/env bun

import process from 'node:process';

import {
  handleMcpRequest,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './services/mcp-server';

let buffer = '';
let responseFraming: 'jsonl' | 'content-length' = 'jsonl';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  consumeMessages();
});

process.stdin.on('end', () => {
  process.exit(0);
});

function consumeMessages() {
  while (true) {
    const framedMessage = readNextMessage();
    if (!framedMessage) {
      return;
    }

    responseFraming = framedMessage.framing;
    void handleMessage(framedMessage.body);
  }
}

function readNextMessage(): {
  body: string;
  framing: 'jsonl' | 'content-length';
} | null {
  const trimmed = buffer.trimStart();

  if (trimmed.startsWith('Content-Length:')) {
    return readContentLengthMessage();
  }

  return readJsonLineMessage();
}

function readContentLengthMessage() {
  const headerEnd = buffer.indexOf('\r\n\r\n');
  if (headerEnd === -1) {
    return null;
  }

  const header = buffer.slice(0, headerEnd);
  const contentLength = parseContentLength(header);
  const messageEnd = headerEnd + 4 + contentLength;

  if (buffer.length < messageEnd) {
    return null;
  }

  const body = buffer.slice(headerEnd + 4, messageEnd);
  buffer = buffer.slice(messageEnd);

  return {
    body,
    framing: 'content-length' as const,
  };
}

function readJsonLineMessage() {
  const newlineIndex = buffer.indexOf('\n');
  if (newlineIndex === -1) {
    return null;
  }

  const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
  buffer = buffer.slice(newlineIndex + 1);

  if (line.trim().length === 0) {
    return readJsonLineMessage();
  }

  return {
    body: line,
    framing: 'jsonl' as const,
  };
}

function parseContentLength(header: string): number {
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) {
    throw new Error('Missing Content-Length header.');
  }

  return Number(match[1]);
}

async function handleMessage(body: string) {
  const request = JSON.parse(body) as JsonRpcRequest;
  const response = await handleMcpRequest(request);
  if (response) {
    writeResponse(response);
  }
}

function writeResponse(response: JsonRpcResponse) {
  const json = JSON.stringify(response);
  if (responseFraming === 'content-length') {
    process.stdout.write(
      `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`,
    );
    return;
  }

  process.stdout.write(`${json}\n`);
}
