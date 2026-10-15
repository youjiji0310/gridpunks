// Publish a puzzle on-chain. Solvers can mint in that zone at once; everyone else after HOURS.
//   PowerShell:  $env:ZONE="0"; $env:HOURS="24"; npx hardhat run scripts/release.js --network ink
//   bash:        ZONE=0 HOURS=24 npx hardhat run scripts/release.js --network ink
//   Golden Punk: ZONE=legend
// Then post the printed text on X.
const { ethers } = require("hardhat");
const cfg = require("../site/config.json");
const P = require("./puzzles.js");

(async () => {
  const zoneArg = (process.env.ZONE || "").trim().toLowerCase();
  if (zoneArg === "") throw new Error('Set ZONE (0-9 or "legend")');
  const legend = zoneArg === "legend";
  const zone = legend ? 10 : Number(zoneArg);
  if (!legend && !(zone >= 0 && zone <= 9)) throw new Error("ZONE must be 0-9 or legend");
  const hours = Number(process.env.HOURS || 24);
  const puzzle = P.open().find((p) => p.zone === zone);
  const g = await ethers.getContractAt("GridPunks", cfg.contract);

  if (legend) {
    await (await g.releaseLegend(puzzle.text)).wait();
    console.log("The Golden Punk puzzle is live.\n");
  } else {
    if (!(await g.mintOpen())) console.log("Note: the mint is still closed. Run scripts/open.js too.");
    await (await g.releaseZone(zone, puzzle.text, Math.round(hours * 3600))).wait();
    const pub = new Date(Number(await g.zonePublicAt(zone)) * 1000);
    console.log(`Zone ${zone} is live. Solvers mint now; it opens to everyone at ${pub.toISOString()} (UTC).\n`);
  }
  console.log("----- post this on X -----\n");
  console.log(puzzle.text);
  console.log(`\nSolve it on ${process.env.SITE_URL || "the site"} 🔐`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
