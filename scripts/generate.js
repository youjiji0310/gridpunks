// Generates 10,000 unique GridPunks trait sets.
// Usage: node scripts/generate.js [seed]
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { TRAITS, ORDER } = require("../site/js/punks.js");

const SUPPLY = 10000;
const SEED = process.argv[2] || "gridpunks-genesis-v1";

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedInt = crypto.createHash("sha256").update(SEED).digest().readUInt32BE(0);
const rnd = mulberry32(seedInt);

function pick(list) {
  const total = list.reduce((s, x) => s + x.w, 0);
  let r = rnd() * total;
  for (let i = 0; i < list.length; i++) { r -= list[i].w; if (r < 0) return i; }
  return list.length - 1;
}

const seen = new Set();
const punks = [];
let rerolls = 0;
while (punks.length < SUPPLY) {
  const t = ORDER.map((k) => pick(TRAITS[k]));
  // Non-humans have no facial hair
  if (t[0] >= 4 && (t[5] === 1 || t[5] === 2 || t[5] === 3)) t[5] = 0;
  // Respirator hides beard / mustache
  if (t[4] === 5 && (t[5] === 1 || t[5] === 2)) t[5] = 0;
  const key = t.join(",");
  if (seen.has(key)) { rerolls++; continue; }
  seen.add(key);
  punks.push(t);
}

const out = path.join(__dirname, "..", "site", "data", "traits.json");
const json = JSON.stringify(punks);
fs.writeFileSync(out, json);
const provenance = crypto.createHash("sha256").update(json).digest("hex");

// rarity table
const rarity = {};
ORDER.forEach((k, i) => {
  rarity[k] = TRAITS[k].map((tr, j) => ({ name: tr.name, count: punks.filter((p) => p[i] === j).length }));
});
fs.writeFileSync(path.join(__dirname, "..", "site", "data", "rarity.json"), JSON.stringify({ provenance, rarity }, null, 1));

console.log(`Generated ${punks.length} unique punks (${rerolls} duplicate rerolls)`);
console.log(`traits.json: ${(json.length / 1024).toFixed(0)} KB`);
console.log(`Provenance hash (sha256 of traits.json): ${provenance}`);
