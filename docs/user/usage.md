# Usage

## Local Development

Run the CLI with:

```bash
bun run dev
./bin/deepx --network devnet
./bin/deepx --network testnet
```

Or invoke the executable directly:

```bash
./bin/deepx
```

Start the local MCP server with:

```bash
bun run --silent mcp:deepx
./bin/deepx-mcp
```

After `bun install -g .`, configure Gemini CLI or another MCP client with:

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

## Current Behavior

- `devnet` is the default network
- `--network testnet` switches to testnet
- the app checks for an encrypted wallet file for the selected network
- if a wallet already exists, it asks for the wallet passphrase before entering the dashboard
- if no wallet is found, it opens a simplified import flow with only private key and passphrase
- after unlock or import, it opens the fullscreen market dashboard
- the passphrase stays in process memory for the current session so later live order actions can reuse it
- the AI chat panel uses local `gemini-cli` with Gemini `gemini-3-flash-preview`
- Gemini CLI can also be configured with local DeepX dry-run order tools through the included MCP example
- a global install exposes `deepx-mcp` for MCP clients while preserving `deepx` as the TUI command

## Dashboard Keys

- `q` quit
- `tab` cycle focus
- `1` switch to perp pairs
- `2` switch to spot pairs
- left/right or `h`/`l` change pair when the market strip is focused
- `[` and `]` change chart resolution when the chart is focused
- type, `backspace`, `esc`, and `enter` control the chat panel when it is focused

## Current Dashboard Surface

- header market strip with network badge and wallet summary
- realtime candle chart with volume bars and stream status
- orderbook and recent trades panels
- AI chat panel for market and execution assistance
- no direct order-entry form is implemented in the TUI yet
