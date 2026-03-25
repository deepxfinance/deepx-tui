# Realtime Candle Chart Did Not Update

Date: 2026-03-25

## What Happened

The terminal candle chart rendered historical candles correctly but did not visibly update in real time after websocket support was added.

## Root Cause

There were two issues in the TUI market-data path:

1. The websocket handler only accepted candle channels shaped like `candles_<interval>`, but the DeepX v2 feed can deliver candle updates on `channel: "candles"` with the timeframe carried separately.
2. Even after accepting candle messages, the live chart still appeared static because candle snapshots were too sparse to produce visible motion between updates.

## Fix

- Updated the candle websocket parser in [src/services/use-market-data.ts](/home/stone/Web/deepx-tui/src/services/use-market-data.ts) to accept the actual DeepX v2 candle payload shape and merge bars from `data.details[]` or direct candle objects.
- Added `latest_price` to the active market subscription.
- Added a live-price fallback that mutates the current candle in memory for the active interval and opens a new candle when the time bucket rolls over.

## Prevention

- When porting websocket logic from `deepdex-web`, verify the actual runtime payload shape instead of assuming channel names from comments or older handlers.
- Keep one debug path that can print the last received candle message and timestamp in the TUI while integrating market streams.
- Add unit tests for websocket candle normalization and candle merging across both snapshot updates and live price ticks.
