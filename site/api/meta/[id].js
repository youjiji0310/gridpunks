// Token metadata for marketplaces: GET /api/meta/<cell>  (tokenURI = <site>/api/meta/<cell>)
// Reads which punk lives in the cell from the contract, renders it as an on-the-fly SVG.
const G = require("../../js/punks.js");
const traits = require("../../data/traits.json");
const cfg = require("../../config.json");

const N = 100;
const PUNK_OF = "0x3f3f5ba2"; // punkOf(uint256)
const OWNER_OF = "0x6352211e"; // ownerOf(uint256)
const LEGEND_ID = 10000;

async function ethCall(rpcUrl, to, data) {
  const r = await fetch(rpcUrl, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const j = await r.json();
  return j;
}

module.exports = async (req, res) => {
  const id = Number(req.query.id);
  const contract = process.env.CONTRACT || cfg.contract;
  const rpcUrl = process.env.RPC_URL || cfg.rpc;
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();
  if (id === LEGEND_ID) {
    try {
      const j = await ethCall(rpcUrl, contract, OWNER_OF + id.toString(16).padStart(64, "0"));
      if (j.error || !j.result) { res.setHeader("Cache-Control", "public, s-maxage=30"); return res.status(404).json({ error: "the Golden Punk is still unclaimed" }); }
    } catch (e) { res.setHeader("Cache-Control", "no-store"); return res.status(502).json({ error: "chain read failed" }); }
    res.setHeader("Cache-Control", "public, s-maxage=31536000, immutable");
    return res.status(200).json({
      name: `${cfg.name} · The Golden Punk`,
      description: `The one-of-one Golden Punk of the ${cfg.name} grid. It belongs to the first wallet that solved the final puzzle.`,
      image: "data:image/svg+xml;base64," + Buffer.from(G.legendSvg(960)).toString("base64"),
      external_url: host ? `https://${host}/#puzzles` : undefined,
      attributes: G.legendAttributes(),
    });
  }
  if (!Number.isInteger(id) || id < 0 || id >= N * N) return res.status(404).json({ error: "no such plot" });
  try {
    const j = await ethCall(rpcUrl, contract, PUNK_OF + id.toString(16).padStart(64, "0"));
    if (j.error || !j.result) throw new Error((j.error && j.error.message) || "empty result");
    const minted = BigInt("0x" + j.result.slice(2, 66)) === 1n;
    if (!minted) { res.setHeader("Cache-Control", "public, s-maxage=30"); return res.status(404).json({ error: "plot not claimed yet" }); }
    const punk = Number(BigInt("0x" + j.result.slice(66, 130)));
    const t = traits[punk];
    const x = id % N, y = Math.floor(id / N);
    const svg = G.animatedSvg(t, { size: 960, seed: punk }); // dots that gather into the punk, looping
    res.setHeader("Cache-Control", "public, s-maxage=31536000, immutable");
    return res.status(200).json({
      name: `${cfg.name} (${x}, ${y})`,
      description: `Plot ${x},${y} of the ${cfg.name} grid on Robinhood Chain. Punk ${punk} lives here.`,
      image: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"),
      external_url: host ? `https://${host}/#board` : undefined,
      attributes: [
        { trait_type: "Zone", value: Math.floor(id / 1000), display_type: "number" },
        { trait_type: "X", value: x, display_type: "number" },
        { trait_type: "Y", value: y, display_type: "number" },
        { trait_type: "Punk", value: punk, display_type: "number" },
        ...G.attributes(t),
      ],
    });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "chain read failed", detail: String(e.message || e) });
  }
};
