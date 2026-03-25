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

## Gemini CLI Tooling

- Gemini CLI chat can be extended with a local stdio MCP server defined in repository scripts
- the MCP surface includes live perp `place` and `cancel` flows ported from `deepdex-web`, using the same contract call and `/v2/chain/tx/transact` relay pattern
- live execution requires the local encrypted wallet plus an explicit passphrase and confirmation flag at tool-call time
- spot order execution remains out of scope until token approval and balance flows are ported

## Phase 1 Runtime Flow

- Parse CLI options, including `--network`
- Normalize to `deepx_devnet` or `deepx_testnet`
- Read local wallet metadata for the selected network
- If missing, render the simplified encrypted wallet import flow
- If present, prompt for the wallet passphrase and keep it in process memory for the session
- After unlock, enter the fullscreen market dashboard
