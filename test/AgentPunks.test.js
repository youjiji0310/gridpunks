const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const V2Factory = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const V2Pair = require("@uniswap/v2-core/build/UniswapV2Pair.json");

const E = ethers.parseEther;
const UNIT = 10n ** 18n;

async function setup() {
  const signers = await ethers.getSigners();
  const [owner, team, alice, bob, stranger] = signers;
  const wbnb = await (await ethers.getContractFactory("MockWBNB")).deploy();
  const reg = await (await ethers.getContractFactory("MockAgentRegistry")).deploy();
  const factory = await new ethers.ContractFactory(V2Factory.abi, V2Factory.bytecode, owner).deploy(owner.address);
  const punks = await (await ethers.getContractFactory("AgentPunks")).deploy(
    "AgentPunks", "APUNK", "https://example.com/api/meta/",
    await reg.getAddress(), await factory.getAddress(), await wbnb.getAddress(), team.address);
  await reg.give(alice.address, "alice");
  await reg.give(bob.address, "bob");
  const pair = new ethers.Contract(await punks.pair(), V2Pair.abi, owner);
  const mirror = await ethers.getContractAt("DN404Mirror", await punks.mirrorERC721());
  return { signers, owner, team, alice, bob, stranger, wbnb, reg, factory, punks, pair, mirror };
}

describe("AgentPunks", function () {
  this.timeout(600000);

  it("starts closed; only .ai agents can mint once it opens", async () => {
    const { punks, alice, stranger } = await setup();
    const q = await punks.quote(1);
    await expect(punks.connect(alice).mint(1, { value: q })).to.be.revertedWithCustomError(punks, "NotOpen");
    await punks.openMint();
    await expect(punks.connect(stranger).mint(1, { value: q })).to.be.revertedWithCustomError(punks, "NotAnAgent");
    await punks.connect(alice).mint(1, { value: q });
    expect(await punks.balanceOf(alice.address)).to.equal(UNIT);
  });

  it("first punk costs 0.000625 BNB, price only goes up, the full curve raises about 22.22 BNB", async () => {
    const { punks } = await setup();
    const first = await punks.price();
    expect(first).to.be.closeTo(E("0.000625"), E("0.0000001"));
    const target = await punks.curveTarget();
    expect(target).to.be.closeTo(E("22.22"), E("0.01"));
    expect(await punks.quote(10)).to.be.gt(first * 10n);
  });

  it("mints an NFT per unit, refunds extra BNB, and splits every payment 50/50", async () => {
    const { punks, alice, mirror } = await setup();
    await punks.openMint();
    const cost = await punks.quote(5);
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await punks.connect(alice).mint(5, { value: cost + E("1") });
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    expect(before - (await ethers.provider.getBalance(alice.address))).to.equal(cost + gas);
    expect(await mirror.balanceOf(alice.address)).to.equal(5n);
    expect(await mirror.ownerOf(1)).to.equal(alice.address);
    expect(await punks.teamOwed()).to.equal(cost / 2n);
    expect(await punks.poolReserve()).to.equal(cost - cost / 2n);
    expect(await ethers.provider.getBalance(await punks.getAddress())).to.equal(cost);
    expect(await mirror.tokenURI(1)).to.equal("https://example.com/api/meta/1");
    expect((await punks.ownedIds(alice.address, 0, 100)).map(Number)).to.deep.equal([1, 2, 3, 4, 5]);
  });

  it("rejects underpayment and enforces the 100-per-wallet cap", async () => {
    const { punks, alice } = await setup();
    await punks.openMint();
    const q = await punks.quote(3);
    await expect(punks.connect(alice).mint(3, { value: q - 1n })).to.be.revertedWithCustomError(punks, "NotEnoughBNB");
    await punks.connect(alice).mint(100, { value: await punks.quote(100) });
    await expect(punks.connect(alice).mint(1, { value: E("1") })).to.be.revertedWithCustomError(punks, "WalletCapReached");
    await expect(punks.connect(alice).mint(0, { value: E("1") })).to.be.revertedWithCustomError(punks, "BadCount");
  });

  it("agent smart-contract wallets with a .ai can mint", async () => {
    const { punks, reg } = await setup();
    await punks.openMint();
    const ca = await (await ethers.getContractFactory("ContractAgent")).deploy();
    await reg.give(await ca.getAddress(), "bot");
    await ca.go(await punks.getAddress(), 2, { value: await punks.quote(2) });
    expect(await punks.balanceOf(await ca.getAddress())).to.equal(2n * UNIT);
  });

  it("team half is withdrawable only to the team wallet; nothing else leaves", async () => {
    const { punks, alice, team, stranger } = await setup();
    await punks.openMint();
    const cost = await punks.quote(20);
    await punks.connect(alice).mint(20, { value: cost });
    const tb = await ethers.provider.getBalance(team.address);
    await punks.connect(stranger).withdrawTeam();
    expect((await ethers.provider.getBalance(team.address)) - tb).to.equal(cost / 2n);
    await expect(punks.withdrawTeam()).to.be.revertedWithCustomError(punks, "NothingToWithdraw");
    expect(await ethers.provider.getBalance(await punks.getAddress())).to.equal(cost - cost / 2n);
    await expect(punks.connect(stranger).openMint()).to.be.revertedWithCustomError(punks, "OwnableUnauthorizedAccount");
  });

  it("nobody can put tokens in the pool pair before graduation; normal transfers work", async () => {
    const { punks, alice, bob, stranger, mirror, pair } = await setup();
    await punks.openMint();
    await punks.connect(alice).mint(3, { value: await punks.quote(3) });
    await expect(punks.connect(alice).transfer(await pair.getAddress(), UNIT)).to.be.revertedWithCustomError(punks, "PoolLockedUntilGraduation");
    await expect(mirror.connect(alice).transferFrom(alice.address, await pair.getAddress(), 1)).to.be.revertedWithCustomError(punks, "PoolLockedUntilGraduation");
    await punks.connect(alice).transfer(stranger.address, UNIT); // non-agents can receive and hold
    await mirror.connect(alice).transferFrom(alice.address, bob.address, 2);
    expect(await mirror.balanceOf(stranger.address)).to.equal(1n);
    expect(await mirror.ownerOf(2)).to.equal(bob.address);
  });

  it("registry changes wait 24 hours", async () => {
    const { punks, stranger } = await setup();
    await punks.proposeRegistry(stranger.address);
    await expect(punks.acceptRegistry()).to.be.revertedWithCustomError(punks, "TooEarly");
    await time.increase(24 * 3600);
    await punks.acceptRegistry();
    expect(await punks.registry()).to.equal(stranger.address);
  });

  it("sells out, graduates into a locked PancakeSwap-style pool at the last curve price, even after a WBNB donation", async () => {
    const { signers, owner, punks, reg, pair, wbnb, mirror, team } = await setup();
    await punks.openMint();
    // someone tries to poison the pair before graduation: donate WBNB and sync
    await wbnb.connect(owner).deposit({ value: E("0.5") });
    await wbnb.connect(owner).transfer(await pair.getAddress(), E("0.5"));
    await pair.sync();

    const agents = signers.slice(5, 95);
    let lastPrice = 0n;
    for (const a of agents) {
      await reg.give(a.address, "a");
      const left = 8888n - (await punks.sold());
      if (left === 0n) break;
      const n = left < 100n ? left : 100n;
      if (left <= 100n) lastPrice = (await punks.quote(n)) - (n > 1n ? await punks.quote(n - 1n) : 0n); // price of punk #8888
      await punks.connect(a).mint(n, { value: await punks.quote(n) });
    }
    expect(await punks.sold()).to.equal(8888n);
    expect(await punks.graduated()).to.equal(true);
    expect(await punks.totalSupply()).to.equal(10000n * UNIT);
    expect(await mirror.totalSupply()).to.equal(8888n);
    expect(await punks.poolReserve()).to.equal(0n);

    const raised = await punks.raised();
    expect(raised).to.be.closeTo(E("22.22"), E("0.01"));
    // LP is owned by the dead address only
    const lp = await pair.balanceOf("0x000000000000000000000000000000000000dEaD");
    expect(lp).to.be.gt(0n);
    expect(await pair.balanceOf(await punks.getAddress())).to.equal(0n);
    // pool price ~ last curve price (within 2%, the WBNB donation nudges it up)
    const [r0, r1] = await pair.getReserves();
    const t0 = await pair.token0();
    const [tok, bnb] = t0 === (await punks.getAddress()) ? [r0, r1] : [r1, r0];
    expect(tok).to.equal(1112n * UNIT);
    const poolPrice = (bnb * UNIT) / tok;
    expect(poolPrice).to.be.closeTo(lastPrice, lastPrice / 50n + E("0.0005"));
    // team got its half, mint is closed, transfers into the pair now work
    await expect(punks.connect(agents[0]).mint(1, { value: E("1") })).to.be.revertedWithCustomError(punks, "AlreadyGraduated");
    await punks.connect(agents[0]).transfer(await pair.getAddress(), UNIT);
    const tb = await ethers.provider.getBalance(team.address);
    await punks.withdrawTeam();
    expect((await ethers.provider.getBalance(team.address)) - tb).to.be.closeTo(raised / 2n, E("0.001"));
    console.log(`      raised ${ethers.formatEther(raised)} BNB, pool ${ethers.formatEther(bnb)} BNB / 1112 units, pool price ${ethers.formatEther(poolPrice)}, last curve punk ${ethers.formatEther(lastPrice)}`);
  });
});
