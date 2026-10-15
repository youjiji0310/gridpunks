// Open (or close with CLOSE=1) the mint.  npx hardhat run scripts/open.js --network ink
const { ethers } = require("hardhat");
const cfg = require("../site/config.json");
(async () => {
  const g = await ethers.getContractAt("GridPunks", cfg.contract);
  const open = process.env.CLOSE !== "1";
  await (await g.setMintOpen(open)).wait();
  console.log("mintOpen =", await g.mintOpen());
})().catch((e) => { console.error(e); process.exit(1); });
