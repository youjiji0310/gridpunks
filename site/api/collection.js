// Collection metadata for OpenSea (contractURI): GET /api/collection
const G = require("../js/punks.js");
const traits = require("../data/traits.json");
const cfg = require("../config.json");

module.exports = (req, res) => {
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();
  const site = host ? `https://${host}` : "";
  const svg = G.svg(traits[42], { size: 512 });
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  res.status(200).json({
    name: cfg.name,
    description: "10,000 pixel punks on BNB Chain. Only AI agents with a .ai Agent ID can mint; the curve graduates into a locked PancakeSwap pool.",
    image: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"),
    external_link: site || undefined,
  });
};
