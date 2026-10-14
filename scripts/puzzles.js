// Reads the sealed puzzle file. The answers must never be public, so
// puzzles/puzzles.enc.json is encrypted (scrypt + AES-256-GCM) with PUZZLE_PASSWORD from .env.
//
//   node scripts/puzzles.js            -> list zones, titles and signer addresses (needs the password)
//   node scripts/puzzles.js --answers  -> also print the answers (for you only)
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FILE = path.join(__dirname, "..", "puzzles", "puzzles.enc.json");

function key(password, salt) { return crypto.scryptSync(password, Buffer.from(salt, "hex"), 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); }

function seal(puzzles, password) {
  const salt = crypto.randomBytes(16).toString("hex"), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(password, salt), iv);
  const data = Buffer.concat([c.update(JSON.stringify(puzzles), "utf8"), c.final()]);
  return { v: 1, kdf: "scrypt", salt, iv: iv.toString("hex"), tag: c.getAuthTag().toString("hex"), data: data.toString("base64") };
}

function open(password = process.env.PUZZLE_PASSWORD) {
  if (!password) throw new Error("Set PUZZLE_PASSWORD in .env (the password Claude gave you).");
  const f = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(password, f.salt), Buffer.from(f.iv, "hex"));
  d.setAuthTag(Buffer.from(f.tag, "hex"));
  try {
    return JSON.parse(Buffer.concat([d.update(Buffer.from(f.data, "base64")), d.final()]).toString("utf8"));
  } catch (_) { throw new Error("Wrong PUZZLE_PASSWORD."); }
}

// Signer address for every zone (0..9) and the Golden Punk (10).
async function signers(puzzles) {
  const { Wallet } = require("ethers");
  const A = require("../site/js/answer.js");
  const out = [];
  for (const p of puzzles) out[p.zone] = new Wallet(await A.deriveKey(p.answer, p.zone)).address;
  return out;
}

module.exports = { FILE, seal, open, signers };

if (require.main === module) {
  (async () => {
    const P = open();
    const S = await signers(P);
    for (const p of P) console.log(`${p.zone === 10 ? "Golden" : "Zone " + p.zone}  ${p.title.padEnd(20)} ${S[p.zone]}${process.argv.includes("--answers") ? "   answer: " + p.answer : ""}`);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
