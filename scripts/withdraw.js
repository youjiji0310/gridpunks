// Send the mint proceeds to your wallet (or TO=0x...).  npx hardhat run scripts/withdraw.js --network ink
const { ethers } = require("hardhat");
const cfg = require("../site/config.json");
(async () => {
  const [me] = await ethers.getSigners();
  const g = await ethers.getContractAt("GridPunks", cfg.contract);
  const bal = await ethers.provider.getBalance(cfg.contract);
  console.log("Contract balance:", ethers.formatEther(bal), "ETH");
  await (await g.withdraw(process.env.TO || me.address)).wait();
  console.log("Withdrawn to", process.env.TO || me.address);
})().catch((e) => { console.error(e); process.exit(1); });
