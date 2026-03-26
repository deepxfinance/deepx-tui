# Chat Order Execution And Observability

Date: 2026-03-26

## What Happened

The first pass at live chat trading and debug tooling shipped with multiple quality gaps:

- the relay path initially targeted the frontend host instead of the API host
- failed order submissions often surfaced only opaque upstream error messages
- the debug logger captured too much websocket traffic even outside debug mode
- relay request logging included the raw signed transaction payload

## Root Cause

- execution and observability concerns were added incrementally without a single end-to-end review of authority, performance, and data sensitivity
- the logger had no mode-aware capture policy
- request logging reused raw payloads instead of a redacted transport-specific view

## Fix

- pointed relay submission at the API base URL
- normalized error extraction so chat and stderr surface nested failure details
- added a shared logger with mode-aware capture, keeping verbose logging behind `--mode debug`
- redacted `signedTx`, `passphrase`, and `privateKey` before payloads enter the logger
- added an in-dashboard debug panel with live search filtering for operational triage

## Prevention

- review observability changes as part of the runtime design, not as a debugging afterthought
- never log transport payloads directly unless they pass through a redaction layer first
- require `bun x tsc --noEmit`, `bun test`, and `bun run lint` after feature-level refactors that touch runtime boundaries
