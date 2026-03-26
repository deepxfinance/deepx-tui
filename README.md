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
bun run dev
```

Or run the command entry directly:

```bash
./bin/deepx
./bin/deepx --network testnet
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
   - AI chat panel powered by the in-process DeepX agent using `@google/genai` and `gemini-3-flash-previous`

## AI Chat

- Set `GEMINI_API_KEY` or `GOOGLE_API_KEY` before launching the TUI to enable live chat replies
- The chat agent runs in-process and can call the built-in DeepX tools directly
- Supported tools currently cover market discovery plus order place, cancel, and open-order lookup flows
- AI chat is advisory-only for trading actions and will not perform live order submission or cancellation

## Next Steps

- Add a real order-entry workflow to the dashboard
- Expand command routing and richer interactive screens
- Reuse domain concepts from `deepdex-web` without copying web-specific UI concerns
