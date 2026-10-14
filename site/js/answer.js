/* GridPunks answer keys: an answer is stretched into a private key with PBKDF2,
 * so the chain only ever sees the matching public address.
 * Works in the browser (window.GAnswer, WebCrypto) and in Node (module.exports). */
(function (root) {
  "use strict";
  const ITERATIONS = 400000;
  const N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"); // secp256k1 order

  // "Don't Trust, Verify!" -> "donttrustverify"
  function normalize(answer) {
    return String(answer).normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function salt(zone) { return "gridpunks-v1/zone-" + zone; } // zone 10 = the Golden Punk

  function toHex(bytes) { return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""); }
  function valid(hex) { const k = BigInt(hex); return k > 0n && k < N; }

  async function deriveKey(answer, zone) {
    const pass = normalize(answer);
    if (!pass) throw new Error("empty answer");
    let bytes;
    if (typeof window === "undefined" && typeof require === "function") {
      bytes = require("crypto").pbkdf2Sync(pass, salt(zone), ITERATIONS, 32, "sha256");
    } else {
      const enc = new TextEncoder();
      const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
      bytes = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt(zone)), iterations: ITERATIONS }, base, 256));
    }
    const hex = toHex(bytes);
    if (!valid(hex)) throw new Error("derived key out of range, pick another answer");
    return hex;
  }

  const api = { ITERATIONS, normalize, salt, deriveKey };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GAnswer = api;
})(typeof window !== "undefined" ? window : globalThis);
