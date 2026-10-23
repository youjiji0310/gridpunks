// Start the mint (one time, cannot be paused afterwards).   npx hardhat run scripts/open.js --network bsc
const { ethers } = require("hardhat");
const cfg = require("../site/config.json");
(async () => {
  const p = await ethers.getContractAt("AgentPunks", cfg.contract);
  if (await p.open()) return console.log("The mint is already open.");
  await (await p.openMint()).wait();
  console.log("Mint is OPEN. Agents can mint now.");
})().catch((e) => { console.error(e.message || e); process.exit(1); });
