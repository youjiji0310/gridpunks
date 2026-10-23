// Deploy AgentPunks.   npx hardhat run scripts/deploy.js --network bsc
// Env: PRIVATE_KEY (deployer = owner), SITE_URL (e.g. https://gridpunks-vert.vercel.app), TEAM (wallet that receives the team half)
// On localhost it also deploys a test registry, WBNB and a Uniswap V2 factory, and gives .ai names to test accounts.
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const BSC = {
  registry: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F", // SPACE ID Agent ID (.ai)
  factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",  // PancakeSwap V2 factory
  wbnb: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
};

async function main() {
  const [me, ...others] = await ethers.getSigners();
  const site = (process.env.SITE_URL || "").replace(/\/$/, "");
  if (!site && network.name !== "localhost") throw new Error("Set SITE_URL in .env (your Vercel URL)");
  const team = process.env.TEAM || me.address;
  let a = BSC;
  if (network.name === "localhost" || network.name === "hardhat") {
    const V2 = require("@uniswap/v2-core/build/UniswapV2Factory.json");
    const reg = await (await ethers.getContractFactory("MockAgentRegistry")).deploy();
    const wbnb = await (await ethers.getContractFactory("MockWBNB")).deploy();
    const fac = await new ethers.ContractFactory(V2.abi, V2.bytecode, me).deploy(me.address);
    a = { registry: await reg.getAddress(), factory: await fac.getAddress(), wbnb: await wbnb.getAddress() };
    for (let i = 0; i < 10; i++) await (await reg.give(others[i].address, `agent${i}`)).wait();
    console.log("local mocks ready; accounts #1-#10 hold a .ai");
  } else if (network.name !== "bsc") throw new Error("Use --network bsc (or localhost for tests)");

  console.log(`Deploying from ${me.address} on ${network.name}, team wallet ${team}`);
  const P = await ethers.getContractFactory("AgentPunks");
  const p = await P.deploy("AgentPunks", "APUNK", `${site || "http://localhost:8098"}/api/meta/`, a.registry, a.factory, a.wbnb, team);
  const rc = await p.deploymentTransaction().wait();
  const addr = await p.getAddress();
  console.log("AgentPunks:", addr);
  console.log("NFT mirror:", await p.mirrorERC721());
  console.log("Pool pair: ", await p.pair());

  const cfgPath = path.join(__dirname, "..", "site", "config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.contract = addr;
  cfg.deployBlock = rc.blockNumber;
  if (network.name === "localhost") { cfg.rpc = "http://127.0.0.1:8545"; cfg.chainId = 31337; cfg.chainName = "Localhost"; }
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  console.log("site/config.json updated. The mint is CLOSED until you run scripts/open.js");
}
main().catch((e) => { console.error(e); process.exit(1); });
