# Basic Usage

```bash
export GEMINI_API_KEY=your_api_key
# or: export GOOGLE_API_KEY=your_api_key
bun run dev
./bin/deepx
./bin/deepx --network testnet
./bin/deepx --mode debug
```

Inside the dashboard chat you can also type:

```text
buy 0.001 ETH
The AI will interpret the request and may stage a confirmable order.
sell 2 SOL at 150
The AI will interpret the request and may stage a confirmable order.
```

AI tool actions use the same below-input confirmation gate:

```text
cancel my ETH-USDC order 123
Review the AI action summary, choose Confirm or Cancel, then enter the wallet passphrase if the session is not already unlocked.
```
