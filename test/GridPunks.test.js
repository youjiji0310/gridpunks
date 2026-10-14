const { expect } = require("chai");
const { ethers } = require("hardhat");

const { time } = require("@nomicfoundation/hardhat-network-helpers");
const A = require("../site/js/answer.js");

const PRICE = ethers.parseEther("0.0003");
const DAY = 86400;
const ANSWERS = Array.from({ length: 10 }, (_, z) => `test answer number ${z}`);
const LEGEND = "the golden one";
let KEYS = null; // derived once, PBKDF2 is slow on purpose

async function keys() {
  if (!KEYS) {
    KEYS = [];
    for (let z = 0; z < 10; z++) KEYS.push(new ethers.Wallet(await A.deriveKey(ANSWERS[z], z)));
    KEYS.push(new ethers.Wallet(await A.deriveKey(LEGEND, 10)));
  }
  return KEYS;
}
async function proof(g, zone, who, answer) {
  const k = new ethers.Wallet(await A.deriveKey(answer, zone));
  return k.signMessage(ethers.getBytes(await g.solveHash(zone, who.address)));
}
const mint = (g, who, cells, zone = 0, pf = "0x") => g.connect(who).mint(cells, zone, pf, { value: PRICE * BigInt(cells.length) });

async function deploy() {
  const [owner, alice, bob] = await ethers.getSigners();
  const G = await ethers.getContractFactory("GridPunks");
  const g = await G.deploy("https://example.app/meta/", "https://example.app/api/collection", "abc123", owner.address);
  const k = await keys();
  await g.setSigners(k.slice(0, 10).map((w) => w.address), k[10].address);
  return { g, owner, alice, bob };
}
// release every zone and make it public (old behaviour) for the plain mint tests
async function openAll(g) {
  await g.setMintOpen(true);
  for (let z = 0; z < 10; z++) await g.releaseZone(z, "p" + z, 0);
}

describe("GridPunks", () => {
  it("stays closed until opened", async () => {
    const { g, alice } = await deploy();
    await expect(mint(g, alice, [5])).to.be.revertedWithCustomError(g, "MintClosed");
  });

  it("mints chosen cells, reveals a punk, and blocks taken cells", async () => {
    const { g, alice, bob } = await deploy();
    await openAll(g);
    await expect(mint(g, alice, [0, 4242, 9999])).to.emit(g, "Claimed");
    expect(await g.ownerOf(4242)).to.equal(alice.address);
    expect(await g.totalSupply()).to.equal(3n);
    const [m, p] = await g.punkOf(4242);
    expect(m).to.equal(true);
    expect(p).to.be.lessThan(10000n);
    const [m2] = await g.punkOf(1);
    expect(m2).to.equal(false);
    await expect(mint(g, bob, [4242])).to.be.revertedWithCustomError(g, "CellTaken");
    expect(await g.tokenURI(4242)).to.equal("https://example.app/meta/4242");
    expect(await g.contractURI()).to.equal("https://example.app/api/collection");
  });

  it("rejects wrong payment, bad counts, bad cells, duplicate cells in one tx", async () => {
    const { g, alice } = await deploy();
    await openAll(g);
    await expect(g.connect(alice).mint([1], 0, "0x", { value: PRICE - 1n })).to.be.revertedWithCustomError(g, "WrongPayment");
    await expect(g.connect(alice).mint([1], 0, "0x", { value: PRICE * 2n })).to.be.revertedWithCustomError(g, "WrongPayment");
    await expect(g.connect(alice).mint([], 0, "0x", { value: 0 })).to.be.revertedWithCustomError(g, "BadCount");
    const many = Array.from({ length: 21 }, (_, i) => i);
    await expect(mint(g, alice, many)).to.be.revertedWithCustomError(g, "BadCount");
    await expect(mint(g, alice, [10000])).to.be.revertedWithCustomError(g, "BadCell");
    await expect(mint(g, alice, [7, 7])).to.be.revertedWithCustomError(g, "CellTaken");
  });

  it("refuses mints from contracts", async () => {
    const { g, alice } = await deploy();
    await openAll(g);
    const C = await ethers.getContractFactory("Caller");
    const c = await C.deploy();
    await expect(c.connect(alice).go(await g.getAddress(), 3, { value: PRICE })).to.be.revertedWithCustomError(g, "OnlyWallets");
  });

  it("grid() matches punkOf()", async () => {
    const { g, alice } = await deploy();
    await openAll(g);
    const cells = [0, 15, 16, 17, 5050, 9999];
    await mint(g, alice, cells);
    const words = await g.grid();
    for (const cell of [0, 1, 15, 16, 17, 5050, 9998, 9999]) {
      const v = (words[cell >> 4] >> BigInt((cell & 15) * 16)) & 0xffffn;
      const [m, p] = await g.punkOf(cell);
      expect(v === 0n ? false : true).to.equal(m);
      if (m) expect(v - 1n).to.equal(p);
    }
  });

  it("owner withdraws, royalty is 10%", async () => {
    const { g, owner, alice, bob } = await deploy();
    await openAll(g);
    await mint(g, alice, [1, 2]);
    await expect(g.connect(alice).withdraw(alice.address)).to.be.revertedWithCustomError(g, "OwnableUnauthorizedAccount");
    await expect(g.withdraw(bob.address)).to.changeEtherBalance(bob, PRICE * 2n);
    const [to, amt] = await g.royaltyInfo(1, 10000);
    expect(to).to.equal(owner.address);
    expect(amt).to.equal(1000n);
  });

  it("fills all 10,000 cells with 10,000 different punks", async function () {
    this.timeout(600000);
    const { g, alice } = await deploy();
    await openAll(g);
    for (let s = 0; s < 10000; s += 20) {
      const cells = Array.from({ length: 20 }, (_, i) => s + i);
      await mint(g, alice, cells);
    }
    expect(await g.totalSupply()).to.equal(10000n);
    const words = await g.grid();
    const seen = new Set();
    for (let cell = 0; cell < 10000; cell++) {
      const v = (words[cell >> 4] >> BigInt((cell & 15) * 16)) & 0xffffn;
      expect(v).to.not.equal(0n);
      seen.add(Number(v - 1n));
    }
    expect(seen.size).to.equal(10000);
    await expect(mint(g, alice, [0])).to.be.revertedWithCustomError(g, "CellTaken");
  });

  // ------------------------------------------------------------ puzzles
  it("sealed zones refuse everyone until the puzzle is out", async () => {
    const { g, alice } = await deploy();
    await g.setMintOpen(true);
    await expect(mint(g, alice, [5])).to.be.revertedWithCustomError(g, "ZoneLocked").withArgs(0);
    // even the right answer cannot open a sealed zone early
    await expect(mint(g, alice, [5], 0, await proof(g, 0, alice, ANSWERS[0]))).to.be.revertedWithCustomError(g, "ZoneLocked");
  });

  it("solvers mint at once, others wait until the zone is public", async () => {
    const { g, alice, bob } = await deploy();
    await g.setMintOpen(true);
    await expect(g.releaseZone(3, "Decode me", DAY)).to.emit(g, "PuzzleReleased");
    expect(await g.puzzle(3)).to.equal("Decode me");
    await expect(mint(g, bob, [3005])).to.be.revertedWithCustomError(g, "ZoneLocked").withArgs(3);
    // wrong answer
    await expect(mint(g, alice, [3005], 3, await proof(g, 3, alice, "nope"))).to.be.revertedWithCustomError(g, "BadProof");
    // right answer, any spelling / punctuation
    const pf = await proof(g, 3, alice, "Test-Answer, number 3!");
    await expect(mint(g, alice, [3005, 3999], 3, pf)).to.emit(g, "Solved").withArgs(alice.address, 3);
    expect(await g.canMint(alice.address, 3)).to.equal(true);
    // second mint needs no proof
    await mint(g, alice, [3006]);
    // still sealed elsewhere for alice
    await expect(mint(g, alice, [4000])).to.be.revertedWithCustomError(g, "ZoneLocked").withArgs(4);
    // after 24h anyone
    await time.increase(DAY);
    await mint(g, bob, [3007]);
    expect(await g.totalSupply()).to.equal(4n);
  });

  it("a copied proof is useless to another wallet", async () => {
    const { g, alice, bob } = await deploy();
    await g.setMintOpen(true);
    await g.releaseZone(0, "p0", DAY);
    const pf = await proof(g, 0, alice, ANSWERS[0]);
    await expect(mint(g, bob, [1], 0, pf)).to.be.revertedWithCustomError(g, "BadProof");
    // proof for zone 0 does not open zone 1
    await g.releaseZone(1, "p1", DAY);
    await expect(mint(g, alice, [1001], 1, pf)).to.be.revertedWithCustomError(g, "BadProof");
    await expect(mint(g, alice, [1], 0, "0x1234")).to.be.revertedWithCustomError(g, "BadProof");
  });

  it("owner controls: release once, frozen signer, early public", async () => {
    const { g, alice, bob } = await deploy();
    await g.setMintOpen(true);
    await expect(g.connect(alice).releaseZone(0, "x", 0)).to.be.revertedWithCustomError(g, "OwnableUnauthorizedAccount");
    await g.releaseZone(0, "x", DAY);
    await expect(g.releaseZone(0, "y", DAY)).to.be.revertedWithCustomError(g, "AlreadyReleased");
    const before = await g.zoneSigner(0);
    await g.setSigners(Array(10).fill(bob.address), bob.address);
    expect(await g.zoneSigner(0)).to.equal(before); // released zone keeps its answer
    expect(await g.zoneSigner(1)).to.equal(bob.address);
    await g.setZonePublicAt(0, 0);
    await mint(g, alice, [42]);
    const [signers, openAt, publicAt] = await g.zones();
    expect(signers[0]).to.equal(before);
    expect(openAt[0]).to.be.greaterThan(0n);
    expect(publicAt[0]).to.equal(0n);
  });

  it("the Golden Punk goes to the first wallet with the final answer", async () => {
    const { g, alice, bob } = await deploy();
    await expect(g.connect(alice).claimLegend(await proof(g, 10, alice, LEGEND))).to.be.revertedWithCustomError(g, "LegendNotOpen");
    await g.releaseLegend("final riddle");
    expect(await g.legendPuzzle()).to.equal("final riddle");
    await expect(g.connect(bob).claimLegend(await proof(g, 10, bob, "wrong"))).to.be.revertedWithCustomError(g, "BadProof");
    const C = await ethers.getContractFactory("Caller");
    const c = await C.deploy();
    await expect(c.connect(alice).legend(await g.getAddress(), "0x")).to.be.revertedWithCustomError(g, "OnlyWallets");
    await expect(g.connect(alice).claimLegend(await proof(g, 10, alice, "The Golden One"))).to.emit(g, "LegendClaimed").withArgs(alice.address);
    expect(await g.ownerOf(10000)).to.equal(alice.address);
    expect(await g.tokenURI(10000)).to.equal("https://example.app/meta/10000");
    expect(await g.totalSupply()).to.equal(0n); // grid supply unaffected
    await expect(g.connect(bob).claimLegend(await proof(g, 10, bob, LEGEND))).to.be.revertedWithCustomError(g, "LegendTaken");
  });
});
