# Architecture

## Goal

`deepx-tui` is a standalone terminal interface for workflows that are adjacent to `deepdex-web`, but optimized for terminal usage rather than browser interaction.

## Initial Shape

- Standalone repository rather than a monorepo
- Bun as runtime, package manager, and test runner
- Ink + React for terminal rendering
- `bin/deepx` as the user-facing command entrypoint
- per-network wallet bootstrap before dashboard entry
- fullscreen dashboard layout with market strip, realtime chart, orderbook, trades, and AI chat

## Structure Rationale

- `bin/` keeps the executable contract stable even if internal source files move
- `src/` holds UI and pure logic, with reusable formatting helpers in `src/lib/`
- `tests/` focuses on deterministic units first so the project can grow safely
- `docs/` exists from day one so feature work has somewhere to record decisions

## Relationship To deepdex-web

- `deepdex-web` is the upstream product reference, not a dependency of this repo
- shared concepts can be ported intentionally later
- web-specific presentation and framework choices should not leak into the TUI without justification

## Agent Tooling

- the AI chat panel uses an in-process DeepX agent backed by the Google GenAI SDK
- the agent exposes the existing DeepX order and market helpers as direct function tools instead of routing through MCP
- the chat tool layer can submit live perp orders through `deepx_place_order` when the model sets `confirm=true` and a wallet passphrase is available, either explicitly or from the active unlocked session
- AI-driven order cancellation remains blocked until a dedicated confirmation workflow exists
- simple imperative trade messages such as `buy 0.001 ETH` are parsed locally in the dashboard and converted into a staged order flow before confirmation, instead of routing those trivial intents through the LLM
- live perp `place` and `cancel` flows sign locally, then broadcast the raw transaction directly through the selected network RPC
- live execution requires the local encrypted wallet plus an explicit passphrase and confirmation flag at tool-call time
- spot order execution remains out of scope until token approval and balance flows are ported

## Observability

- a shared in-process logger records structured application events
- default mode captures warnings and errors only to avoid continuous runtime overhead
- `--mode debug` enables low-level HTTP, RPC, and websocket request/response logging plus an in-dashboard debug panel
- sensitive payload fields such as `signedTx`, `passphrase`, and `privateKey` are redacted before they enter the logger

## Phase 1 Runtime Flow

- Parse CLI options, including `--network`
- Normalize to `deepx_devnet` or `deepx_testnet`
- Read local wallet metadata for the selected network
- If missing, render the simplified encrypted wallet import flow
- If present, prompt for the wallet passphrase and keep it in process memory for the session
- After unlock, enter the fullscreen market dashboard
