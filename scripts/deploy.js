// Deploy GridPunks.  npx hardhat run scripts/deploy.js --network robinhood
// Env: PRIVATE_KEY (deployer), SITE_URL (e.g. https://gridpunks.vercel.app)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ethers, network } = require("hardhat");

async function main() {
  const [me] = await ethers.getSigners();
  const site = (process.env.SITE_URL || "").replace(/\/$/, "");
  if (!site && network.name !== "localhost" && network.name !== "hardhat") throw new Error("Set SITE_URL in .env first");
  const traitsPath = path.join(__dirname, "..", "site", "data", "traits.json");
  const provenance = crypto.createHash("sha256").update(fs.readFileSync(traitsPath)).digest("hex");
  const base = (site || "http://localhost:3000") + "/api/meta/";
  const collection = (site || "http://localhost:3000") + "/api/collection";

  console.log("Network   :", network.name, "| deployer", me.address);
  console.log("Balance   :", ethers.formatEther(await ethers.provider.getBalance(me.address)), "ETH");
  console.log("Base URI  :", base);
  console.log("Provenance:", provenance);

  const g = await (await ethers.getContractFactory("GridPunks")).deploy(base, collection, provenance, me.address);
  await g.waitForDeployment();
  const addr = await g.getAddress();
  console.log("\nGridPunks deployed at", addr);

  const cfgPath = path.join(__dirname, "..", "site", "config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.contract = addr;
  if (network.name === "localhost") { cfg.rpc = "http://127.0.0.1:8545"; cfg.chainId = 31337; cfg.chainName = "Localhost"; }
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  console.log("site/config.json updated. Mint is CLOSED: open it with  npx hardhat run scripts/open.js --network", network.name);
}
main().catch((e) => { console.error(e); process.exit(1); });
