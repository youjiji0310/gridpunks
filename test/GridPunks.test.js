const { expect } = require("chai");
const { ethers } = require("hardhat");

const PRICE = ethers.parseEther("0.0003");

async function deploy() {
  const [owner, alice, bob] = await ethers.getSigners();
  const G = await ethers.getContractFactory("GridPunks");
  const g = await G.deploy("https://example.app/meta/", "https://example.app/api/collection", "abc123", owner.address);
  return { g, owner, alice, bob };
}

describe("GridPunks", () => {
  it("stays closed until opened", async () => {
    const { g, alice } = await deploy();
    await expect(g.connect(alice).mint([5], { value: PRICE })).to.be.revertedWithCustomError(g, "MintClosed");
  });

  it("mints chosen cells, reveals a punk, and blocks taken cells", async () => {
    const { g, alice, bob } = await deploy();
    await g.setMintOpen(true);
    await expect(g.connect(alice).mint([0, 4242, 9999], { value: PRICE * 3n })).to.emit(g, "Claimed");
    expect(await g.ownerOf(4242)).to.equal(alice.address);
    expect(await g.totalSupply()).to.equal(3n);
    const [m, p] = await g.punkOf(4242);
    expect(m).to.equal(true);
    expect(p).to.be.lessThan(10000n);
    const [m2] = await g.punkOf(1);
    expect(m2).to.equal(false);
    await expect(g.connect(bob).mint([4242], { value: PRICE })).to.be.revertedWithCustomError(g, "CellTaken");
    expect(await g.tokenURI(4242)).to.equal("https://example.app/meta/4242");
    expect(await g.contractURI()).to.equal("https://example.app/api/collection");
  });

  it("rejects wrong payment, bad counts, bad cells, duplicate cells in one tx", async () => {
    const { g, alice } = await deploy();
    await g.setMintOpen(true);
    await expect(g.connect(alice).mint([1], { value: PRICE - 1n })).to.be.revertedWithCustomError(g, "WrongPayment");
    await expect(g.connect(alice).mint([1], { value: PRICE * 2n })).to.be.revertedWithCustomError(g, "WrongPayment");
    await expect(g.connect(alice).mint([], { value: 0 })).to.be.revertedWithCustomError(g, "BadCount");
    const many = Array.from({ length: 21 }, (_, i) => i);
    await expect(g.connect(alice).mint(many, { value: PRICE * 21n })).to.be.revertedWithCustomError(g, "BadCount");
    await expect(g.connect(alice).mint([10000], { value: PRICE })).to.be.revertedWithCustomError(g, "BadCell");
    await expect(g.connect(alice).mint([7, 7], { value: PRICE * 2n })).to.be.revertedWithCustomError(g, "CellTaken");
  });

  it("refuses mints from contracts", async () => {
    const { g, alice } = await deploy();
    await g.setMintOpen(true);
    const C = await ethers.getContractFactory("Caller");
    const c = await C.deploy();
    await expect(c.connect(alice).go(await g.getAddress(), 3, { value: PRICE })).to.be.revertedWithCustomError(g, "OnlyWallets");
  });

  it("grid() matches punkOf()", async () => {
    const { g, alice } = await deploy();
    await g.setMintOpen(true);
    const cells = [0, 15, 16, 17, 5050, 9999];
    await g.connect(alice).mint(cells, { value: PRICE * BigInt(cells.length) });
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
    await g.setMintOpen(true);
    await g.connect(alice).mint([1, 2], { value: PRICE * 2n });
    await expect(g.connect(alice).withdraw(alice.address)).to.be.revertedWithCustomError(g, "OwnableUnauthorizedAccount");
    await expect(g.withdraw(bob.address)).to.changeEtherBalance(bob, PRICE * 2n);
    const [to, amt] = await g.royaltyInfo(1, 10000);
    expect(to).to.equal(owner.address);
    expect(amt).to.equal(1000n);
  });

  it("fills all 10,000 cells with 10,000 different punks", async function () {
    this.timeout(600000);
    const { g, alice } = await deploy();
    await g.setMintOpen(true);
    for (let s = 0; s < 10000; s += 20) {
      const cells = Array.from({ length: 20 }, (_, i) => s + i);
      await g.connect(alice).mint(cells, { value: PRICE * 20n });
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
    await expect(g.connect(alice).mint([0], { value: PRICE })).to.be.revertedWithCustomError(g, "CellTaken");
  });
});
