// Token metadata (tokenURI = <site>/api/meta/<id>). The punk design is fixed per id;
// the holder's .ai name is read live from the chain.
const G = require("../../js/punks.js");
const traits = require("../../data/traits.json");
const cfg = require("../../config.json");

async function call(rpc, to, data) {
  const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }) });
  return r.json();
}
const word = (n) => BigInt(n).toString(16).padStart(64, "0");
function decodeString(hex) {
  if (!hex || hex.length < 130) return "";
  const len = parseInt(hex.slice(66, 130), 16);
  return Buffer.from(hex.slice(130, 130 + len * 2), "hex").toString("utf8");
}

module.exports = async (req, res) => {
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id < 1 || id > traits.length) return res.status(404).json({ error: "no such punk" });
  const rpc = process.env.RPC_URL || cfg.rpc;
  const contract = process.env.CONTRACT || cfg.contract;
  let holder = "", handle = "";
  if (contract) {
    try {
      const m = await call(rpc, contract, "0x4ef41efc"); // mirrorERC721()
      const mirror = "0x" + m.result.slice(-40);
      const o = await call(rpc, mirror, "0x6352211e" + word(id)); // ownerOf(id)
      if (o.error || !o.result) { res.setHeader("Cache-Control", "public, s-maxage=30"); return res.status(404).json({ error: "punk not minted yet" }); }
      holder = "0x" + o.result.slice(-40);
      const r = await call(rpc, contract, "0x7b103999"); // registry()
      const reg = "0x" + r.result.slice(-40);
      const h = await call(rpc, reg, "0xc50a1514" + holder.slice(2).toLowerCase().padStart(64, "0")); // handleOf(address)
      handle = decodeString(h.result);
      if (handle && !handle.endsWith(".ai")) handle += ".ai";
    } catch (e) { /* metadata still works without the holder name */ }
  }
  const t = traits[id - 1];
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();
  const still = G.svg(t, { size: 960 });
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>html,body{margin:0;height:100%;background:#000}svg{display:block;width:100vmin;height:100vmin;margin:auto;position:absolute;inset:0}</style>' +
    G.animatedSvg(t, { seed: id });
  const attrs = G.attributes(t);
  if (handle) attrs.push({ trait_type: "Holder", value: handle });
  res.setHeader("Cache-Control", "public, s-maxage=60");
  return res.status(200).json({
    name: `${cfg.name} #${id}`,
    description: `${cfg.name}: 10,000 pixel punks on BNB Chain that only AI agents can mint.${handle ? ` Held by ${handle}.` : ""}`,
    image: "data:image/svg+xml;base64," + Buffer.from(still).toString("base64"),
    animation_url: "data:text/html;base64," + Buffer.from(html).toString("base64"),
    external_url: host ? `https://${host}/#punks` : undefined,
    attributes: attrs,
  });
};
