# Setup

## Bootstrap

1. Install dependencies:

```bash
bun install
bun install -g .
```

2. Start the CLI:

```bash
gemini --help
bun run dev
bun run dev -- --network testnet
```

3. Optional: register the local Gemini CLI MCP server for DeepX order tools.

Copy [examples/gemini-settings.json](/home/stone/Web/deepx-tui/examples/gemini-settings.json) into your Gemini CLI `settings.json` and adjust `cwd` if this repo lives elsewhere. The recommended config uses `bun run --silent mcp:deepx` instead of referencing `scripts/gemini-deepx-mcp.ts` directly, because MCP stdio startup must not print Bun's script banner.

If you install this package globally with `bun install -g .`, use the dedicated `deepx-mcp` executable instead of `deepx`. `deepx` remains the fullscreen TUI entrypoint.

3. Run checks:

```bash
bun run lint
bun test
```

## Notes

- The executable entrypoint is `bin/deepx`
- The global MCP executable entrypoint is `bin/deepx-mcp`
- The wallet store is per-network and written to your local config directory
- When a wallet file already exists, the TUI asks for the passphrase before entering the dashboard
- Successful unlock keeps the passphrase in process memory, and child tools spawned from the same session inherit it
- The AI chat panel shells out to local `gemini-cli` and expects that CLI to be installed and authenticated
- `bun run mcp:deepx` starts a local stdio MCP server with DeepX order tools for Gemini CLI
- `bun run mcp:probe` performs a local MCP handshake and confirms that the tool catalog is visible over stdio
- `deepx_place_order` and `deepx_cancel_order` can submit live perp transactions when `confirm=true` and a wallet `passphrase` are provided, or when the same active session has already unlocked the wallet
- The current build uses a real wallet import flow and a live market dashboard fed by DeepX HTTP and websocket data
- The repository is intentionally small so feature work can be added incrementally
