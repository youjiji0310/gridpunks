// Send the team half of the mint money to the TEAM wallet.   npx hardhat run scripts/withdraw.js --network bsc
const { ethers } = require("hardhat");
const cfg = require("../site/config.json");
(async () => {
  const p = await ethers.getContractAt("AgentPunks", cfg.contract);
  const owed = await p.teamOwed();
  if (owed === 0n) return console.log("Nothing to withdraw yet.");
  await (await p.withdrawTeam()).wait();
  console.log(`Sent ${ethers.formatEther(owed)} BNB to ${await p.team()}`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
