#!/usr/bin/env bun

import { spawn } from 'node:child_process';

const probeSource = `
const { spawn } = require('child_process');

const child = spawn('/home/stone/.bun/bin/bun', ['run', '--silent', 'mcp:deepx'], {
  cwd: '/home/stone/Web/deepx-tui',
  stdio: ['pipe', 'pipe', 'pipe'],
});

let out = '';
let err = '';
let initializeResult;

child.stdout.on('data', (chunk) => {
  out += chunk.toString();

  while (true) {
    const headerEnd = out.indexOf('\\r\\n\\r\\n');
    if (headerEnd === -1) {
      return;
    }

    const header = out.slice(0, headerEnd);
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    if (!match) {
      console.error(JSON.stringify({ error: 'missing Content-Length', header, out, err }, null, 2));
      child.kill();
      process.exit(1);
    }

    const contentLength = Number(match[1]);
    const messageEnd = headerEnd + 4 + contentLength;
    if (out.length < messageEnd) {
      return;
    }

    const body = out.slice(headerEnd + 4, messageEnd);
    out = out.slice(messageEnd);
    const response = JSON.parse(body);

    if (response.id === 1) {
      initializeResult = response.result;
      sendMessage({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });
      continue;
    }

    if (response.id === 2) {
      console.log(
        JSON.stringify(
          {
            server: initializeResult.serverInfo,
            tools: (response.result.tools || []).map((tool) => tool.name).sort(),
          },
          null,
          2,
        ),
      );
      child.kill();
      process.exit(0);
    }
  }
});

child.stderr.on('data', (chunk) => {
  err += chunk.toString();
});

function sendMessage(payload) {
  const body = JSON.stringify(payload);
  child.stdin.write(
    'Content-Length: ' + Buffer.byteLength(body, 'utf8') + '\\r\\n\\r\\n' + body,
  );
}

sendMessage({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'deepx-mcp-probe', version: '0.1.0' },
  },
});

setTimeout(() => {
  console.error(err || 'Probe timed out waiting for MCP responses.');
  child.kill();
  process.exit(1);
}, 2000);
`;

const probe = spawn('node', ['-e', probeSource], {
  stdio: 'inherit',
});

probe.on('exit', (code) => {
  process.exit(code ?? 1);
});
