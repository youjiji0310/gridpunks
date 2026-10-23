---
name: agentpunks-mint
description: Mint AgentPunks (10,000 pixel punks, DN404 token + NFT) on BNB Chain for this agent's Binance Agentic Wallet. Use when the user asks to mint, buy, check or count AgentPunks.
---

# AgentPunks: mint with your agent

AgentPunks is a 10,000-punk collection on BNB Chain (chainId 56). 1 token = 1 punk (DN404).
Only wallets holding a SPACE ID **.ai Agent ID** can mint on the curve. The price rises with every
punk, from 0.000625 BNB to 0.01 BNB. Each payment is split: half to the team, half locked for the
PancakeSwap pool that opens when the 8,888th curve punk sells (LP locked forever).

Contract addresses are published at the site's `/config.json` and in its footer. Only interact with those.

## Setup (once)

1. Binance App → Agentic Wallet: turn on **Developer Mode** (needed for contract calls).
2. Claim a **.ai Agent ID** in Binance Wallet (Agent ID banner).
3. `npm i -g @binance/agentic-wallet` then `baw auth signin`.
4. Download the CLI next to you: `curl -O <SITE>/punks.mjs` (Node 18+, no install).
5. `node punks.mjs preflight` and fix anything marked ✗.

## Procedure: mint

1. `node punks.mjs info` to show progress and the next price.
2. Agree on a count with the user (1 to 100; a wallet can hold at most 100 punks).
3. `node punks.mjs quote --count <n>` and tell the user the cost in BNB.
4. `node punks.mjs mint --count <n>` builds the call and previews it in Binance's risk engine.
   It sends 1% extra in case the price moves; the contract refunds the difference in the same tx.
   This does **not** send anything.
5. Show the user the preview (count, cost, refund, risks). **Only after they explicitly say yes**:
   `node punks.mjs execute --request-id <id>`.
6. If execute returns `pendingConfirmation: true`, do not retry. Wait for approval in the Binance App,
   then check with `node punks.mjs tx --hash <0x..>`.
7. `node punks.mjs punks` lists the punk ids the wallet now holds.

## Rules (enforced by the contract)

- Mint: `.ai` Agent ID holders only (`registry.balanceOf(wallet) > 0`), max 100 punks per wallet.
- No selling back to the curve. Punks are transferable NFTs; after graduation the token trades on PancakeSwap.
- Units cannot be sent into the pool pair before graduation.
- The team can withdraw only its half; the pool half can only go into the PancakeSwap pool.

## Errors

- `NO_AGENT_ID`: the wallet has no .ai. Claim one in Binance Wallet → Agent ID.
- `NotOpen`: the mint has not started yet.
- `WalletCapReached`: the wallet already holds 100 punks.
- `AlreadyGraduated`: the curve is closed; trade on PancakeSwap.
- `PREVIEW_FAILED` / `351805`: simulation failed. Run `info` and `quote` again, then preview again.

AgentPunks is an experiment. Punks and units can lose all value. Not affiliated with Binance, BNB Chain, SPACE ID or PancakeSwap.
