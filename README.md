# deepx-tui

`deepx-tui` is the terminal UI companion for [`deepdex-web`](/home/stone/Web/deepdex-web). It includes a fullscreen terminal flow with per-network wallet bootstrap and a live market dashboard.

## Requirements

- Bun `>=1.2.19`

## Install

```bash
bun install
bun install -g .
```

## Run

```bash
gemini --help
bun run dev
```

Or run the command entry directly:

```bash
./bin/deepx
./bin/deepx --network testnet
```

To start the MCP server directly:

```bash
./bin/deepx-mcp
```

## Quality Checks

```bash
bun run lint
bun test
```

## Repository Layout

- `bin/` executable entrypoints
- `src/` Ink application code
- `tests/` deterministic automated tests
- `docs/` design, implementation, and user docs
- `scripts/` repeatable workflow helpers

## Current Workflow

1. `deepx` starts on `devnet` by default.
2. Use `--network testnet` to switch to testnet.
3. The app checks for a local encrypted wallet for that network.
4. If no wallet exists, it prompts for private key import and a local passphrase.
5. After import, the fullscreen dashboard opens with:
   - pair strip
   - realtime candle chart with volume bars
   - orderbook panel
   - recent trades panel
   - AI chat panel powered by local `gemini-cli` using `gemini-3-flash-preview`

## MCP

For a repo-local MCP server, use:

```json
{
  "mcpServers": {
    "deepx": {
      "command": "bun",
      "args": ["run", "--silent", "mcp:deepx"],
      "cwd": "/absolute/path/to/deepx-tui",
      "type": "stdio",
      "trust": false,
      "description": "DeepX order tools for Gemini CLI"
    }
  }
}
```

After `bun install -g .`, the globally installed MCP executable is `deepx-mcp`:

```json
{
  "mcpServers": {
    "deepx": {
      "command": "deepx-mcp",
      "args": [],
      "type": "stdio",
      "trust": false,
      "description": "DeepX order tools for Gemini CLI"
    }
  }
}
```

## Next Steps

- Add a real order-entry workflow to the dashboard
- Expand command routing and richer interactive screens
- Reuse domain concepts from `deepdex-web` without copying web-specific UI concerns
