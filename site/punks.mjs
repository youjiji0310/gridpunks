#!/usr/bin/env node
// AgentPunks CLI for AI agents. One file, no dependencies (Node 18+).
// It never holds keys: it builds the call and hands it to the Binance Agentic Wallet CLI (`baw`),
// which previews it in Binance's risk engine. Nothing is sent until `execute` (after the human says yes).
//
//   node punks.mjs preflight                 check baw, wallet, Agent ID, mint status
//   node punks.mjs info                      progress, price, my punks
//   node punks.mjs quote --count 5           cost of 5 punks
//   node punks.mjs mint --count 5            preview -> requestId (does NOT send)
//   node punks.mjs execute --request-id ID   send the previewed mint
//   node punks.mjs punks                     my punk ids + traits page
//   node punks.mjs tx --hash 0x...           what happened
// Options: --site https://… (default below) · --json
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : undefined; };
const JSON_OUT = args.includes("--json");
const SITE = (opt("site") || process.env.PUNKS_SITE || "https://gridpunks-vert.vercel.app").replace(/\/$/, "");

const SEL = { info: "370158ea", quote: "ed1bd76c", mint: "a0712d68", ownedIds: "bf598e1e", isAgent: "1ffbb064", balanceOf: "70a08231" };
const ERR = { e6a0d45f: "AlreadyGraduated: the curve is closed, trade on PancakeSwap", "1fc67efa": "BadCount: 1 to 100 punks per mint", "0907fef2": "NO_AGENT_ID: this wallet has no .ai Agent ID", "79694ef1": "NotEnoughBNB", ddafad98: "NotOpen: the mint has not started", "52df9fe5": "SoldOut", c2c77a0e: "WalletCapReached: this wallet already holds 100 punks" };
const word = (v) => BigInt(v).toString(16).padStart(64, "0");
const addrWord = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const bnb = (wei) => { const w = BigInt(wei), i = w / 10n ** 18n, f = (w % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "").slice(0, 8); return f ? `${i}.${f}` : `${i}`; };

function out(obj, text) { if (JSON_OUT) console.log(JSON.stringify(obj, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2)); else console.log(text); }
function fail(code, message) { out({ success: false, error: { code, message } }, `✗ ${code}: ${message}`); process.exit(1); }

let CFG;
async function cfg() {
  if (!CFG) { const r = await fetch(SITE + "/config.json"); CFG = await r.json(); if (!CFG.contract) fail("NOT_DEPLOYED", "the contract is not live yet, check " + SITE); }
  return CFG;
}
async function rpc(method, params) {
  const c = await cfg();
  const r = await fetch(c.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
}
const call = async (data, to) => rpc("eth_call", [{ to: to || (await cfg()).contract, data: "0x" + data }, "latest"]);
const words = (hex) => (hex.replace(/^0x/, "").match(/.{64}/g) || []).map((w) => BigInt("0x" + w));

function baw(a) {
  try { return JSON.parse(execFileSync("baw", [...a, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 << 20 })); }
  catch (e) { try { return JSON.parse(e.stdout); } catch (_) { fail("BAW_ERROR", ((e.stdout || "") + (e.stderr || "")).trim() || "baw is not installed: npm i -g @binance/agentic-wallet"); } }
}
function wallet() {
  const r = baw(["wallet", "address"]);
  if (!r.success) fail("BAW_ERROR", JSON.stringify(r.error));
  const a = r.data.addresses.find((x) => String(x.binanceChainId) === "56");
  if (!a) fail("NO_BSC_ADDRESS", "the Agentic Wallet has no BNB Chain address");
  return a.address;
}
async function info(me) {
  const w = words(await call(SEL.info));
  const s = { sold: Number(w[0]), curve: Number(w[1]), raised: w[2], nextPrice: w[3], open: w[4] === 1n, graduated: w[5] === 1n };
  if (me) s.myUnits = words(await call(SEL.balanceOf + addrWord(me)))[0] / 10n ** 18n;
  return s;
}
async function quote(n) {
  try { return words(await call(SEL.quote + word(n)))[0]; } catch (e) { fail("QUOTE_FAILED", e.message); }
}
const count = () => { const n = Number(opt("count") || 1); if (!Number.isInteger(n) || n < 1 || n > 100) fail("BAD_COUNT", "--count must be 1 to 100"); return n; };

(async () => {
  switch (cmd) {
    case "preflight": {
      const c = await cfg(); const me = wallet();
      const agent = words(await call(SEL.isAgent + addrWord(me)))[0] === 1n;
      const s = await info(me);
      const ok = agent && s.open && !s.graduated;
      out({ success: ok, wallet: me, contract: c.contract, hasAgentId: agent, open: s.open, graduated: s.graduated, myPunks: s.myUnits },
        `wallet      ${me}\ncontract    ${c.contract}\nagent id    ${agent ? "✓ .ai found" : "✗ NO_AGENT_ID: claim a .ai in Binance Wallet → Agent ID"}\nmint        ${s.graduated ? "graduated (trade on PancakeSwap)" : s.open ? "✓ open" : "not open yet"}\nmy punks    ${s.myUnits} / 100\nDeveloper Mode must be on in the Binance App for contract calls.`);
      break;
    }
    case "info": {
      let me = opt("wallet");
      if (!me) { try { const r = JSON.parse(execFileSync("baw", ["wallet", "address", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); me = (r.data.addresses.find((x) => String(x.binanceChainId) === "56") || {}).address; } catch (_) { /* no baw: show public info only */ } }
      const s = await info(me);
      out({ success: true, ...s, site: SITE },
        `minted      ${s.sold.toLocaleString("en-US")} / ${s.curve.toLocaleString("en-US")}\nraised      ${bnb(s.raised)} BNB\nnext punk   ${bnb(s.nextPrice)} BNB\nstatus      ${s.graduated ? "graduated" : s.open ? "minting" : "not open"}${me ? `\nmy punks    ${s.myUnits}` : ""}`);
      break;
    }
    case "quote": {
      const n = count(), q = await quote(n);
      out({ success: true, count: n, costWei: q, cost: bnb(q) }, `${n} punk${n > 1 ? "s" : ""} cost ${bnb(q)} BNB (+ gas). Half goes to the team, half to the PancakeSwap pool.`);
      break;
    }
    case "mint": {
      const n = count(), me = wallet(), c = await cfg();
      const q = await quote(n), value = q + q / 100n; // +1% in case others mint first; the contract refunds the rest
      const r = baw(["contract-call", "preview", "--binanceChainId", "56", "--from", me, "--to", c.contract, "--value", value.toString(), "--inputData", "0x" + SEL.mint + word(n)]);
      if (!r.success) { const code = JSON.stringify(r.error || {}); const hit = Object.keys(ERR).find((k) => code.includes(k)); fail(hit ? ERR[hit].split(":")[0] : "PREVIEW_FAILED", hit ? ERR[hit] : code); }
      out({ success: true, step: "preview", count: n, expectCost: bnb(q), sending: bnb(value), refundUpTo: bnb(value - q), ...r.data },
        `Preview ready: ${n} punk${n > 1 ? "s" : ""} for about ${bnb(q)} BNB (sending ${bnb(value)}, the extra is refunded).\nrequestId: ${r.data && r.data.requestId}\nShow this to your human. Only after they say yes:\n  node punks.mjs execute --request-id ${r.data && r.data.requestId}`);
      break;
    }
    case "execute": {
      const id = opt("request-id"); if (!id) fail("NO_REQUEST_ID", "pass --request-id from the mint preview");
      const r = baw(["contract-call", "execute", "--requestId", id]);
      if (!r.success) fail("EXECUTE_FAILED", JSON.stringify(r.error));
      out({ success: true, ...r.data }, r.data && r.data.pendingConfirmation ? "Waiting for approval in the Binance App. Do not retry; check the hash afterwards." : `Sent: ${r.data && (r.data.txHash || r.data.hash)}`);
      break;
    }
    case "punks": {
      const me = opt("wallet") || wallet();
      const raw = await call(SEL.ownedIds + addrWord(me) + word(0) + word(200));
      const w = words(raw), ids = w.slice(2, 2 + Number(w[1] || 0n)).map(Number);
      out({ success: true, wallet: me, ids, gallery: `${SITE}/#punks` }, ids.length ? `${ids.length} punk${ids.length > 1 ? "s" : ""}: ${ids.map((i) => "#" + i).join(", ")}\nsee them: ${SITE} (paste your wallet in the search box)` : "No punks in this wallet yet.");
      break;
    }
    case "tx": {
      const h = opt("hash"); if (!h) fail("NO_HASH", "pass --hash 0x…");
      const r = await rpc("eth_getTransactionReceipt", [h]);
      if (!r) { out({ success: true, status: "pending" }, "Not mined yet."); break; }
      out({ success: true, status: r.status === "0x1" ? "success" : "reverted", block: parseInt(r.blockNumber, 16) }, r.status === "0x1" ? `✓ confirmed in block ${parseInt(r.blockNumber, 16)}` : "✗ reverted");
      break;
    }
    default:
      console.log("AgentPunks CLI · commands: preflight | info | quote --count N | mint --count N | execute --request-id ID | punks | tx --hash 0x…");
  }
})().catch((e) => fail("ERROR", e.message));
