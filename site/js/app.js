(async function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const G = window.GPunks;
  const [cfg, traits] = await Promise.all([fetch("config.json").then((r) => r.json()), fetch("data/traits.json").then((r) => r.json())]);
  const live = !!cfg.contract;
  const CURVE = 8888, PER_PAGE = 60;
  const fmt = (n, d = 4) => Number(n).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) });
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  const svgUrl = (svg) => URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const design = (id) => traits[(id - 1 + traits.length) % traits.length];

  // ---------------------------------------------------------------- local curve (preview + chart)
  const X0 = (CURVE * 4) / 3, Y0 = 0.000625 * X0, K = X0 * Y0;
  const yAt = (s) => K / (X0 - s);
  const priceAt = (s) => yAt(s + 1) - yAt(s);
  const TARGET = yAt(CURVE) - yAt(0);

  // ---------------------------------------------------------------- chain
  const ABI = [
    "function info() view returns (uint256 sold, uint256 curveUnits, uint256 raised, uint256 nextPrice, bool open, bool graduated, uint256 teamOwed, uint256 poolReserve)",
    "function quote(uint256 count) view returns (uint256)",
    "function mint(uint256 count) payable",
    "function mirrorERC721() view returns (address)",
    "function pair() view returns (address)",
    "function registry() view returns (address)",
    "function isAgent(address who) view returns (bool)",
    "function ownedIds(address who, uint256 begin, uint256 end) view returns (uint256[])",
    "event Minted(address indexed agent, uint256 count, uint256 cost, uint256 soldAfter)",
    "error NotOpen()", "error AlreadyGraduated()", "error NotAnAgent()", "error BadCount()", "error SoldOut()",
    "error NotEnoughBNB(uint256 needed)", "error WalletCapReached()",
  ];
  const MIRROR_ABI = ["function ownerOf(uint256 id) view returns (address)", "function totalSupply() view returns (uint256)"];
  const REG_ABI = ["function handleOf(address who) view returns (string)"];
  let provider, token, mirror, registry;
  // try several public RPCs, keep the first one that answers
  const RPCS = [cfg.rpc, ...(cfg.rpcs || []), "https://bsc-dataseed.binance.org", "https://bsc-dataseed1.defibit.io", "https://bsc.publicnode.com", "https://1rpc.io/bnb"].filter((v, i, a) => v && a.indexOf(v) === i);
  async function connectRpc() {
    for (const url of RPCS) {
      try {
        const p = new ethers.JsonRpcProvider(url, cfg.chainId, { staticNetwork: true });
        await Promise.race([p.getBlockNumber(), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 5000))]);
        return p;
      } catch (_) { /* next */ }
    }
    return new ethers.JsonRpcProvider(RPCS[0], cfg.chainId, { staticNetwork: true });
  }
  if (live) {
    provider = await connectRpc();
    token = new ethers.Contract(cfg.contract, ABI, provider);
  }
  const handles = new Map();
  async function handleOf(a) {
    if (!registry) return "";
    if (!handles.has(a)) handles.set(a, registry.handleOf(a).then((h) => (h ? (h.endsWith(".ai") ? h : h + ".ai") : "")).catch(() => ""));
    return handles.get(a);
  }

  // ---------------------------------------------------------------- ui helpers
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 1800); }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]"); if (!b) return;
    const text = $(b.dataset.copy).textContent;
    const done = () => toast("copied");
    try { navigator.clipboard.writeText(text).then(done, () => {}); } catch (_) {}
  });
  const site = location.origin;
  ["c2", "c3"].forEach((id) => { $(id).textContent = $(id).textContent.replace("https://SITE", site); });
  $("brandPunk").src = svgUrl(G.svg(traits[42], { size: 56 }));

  // hero: a living punk that changes every loop
  let heroIdx = 0;
  const heroPicks = [17, 256, 4242, 1337, 7777, 42, 999, 5150];
  function nextHero() {
    const id = heroPicks[heroIdx++ % heroPicks.length];
    $("heroPunk").src = svgUrl(G.animatedSvg(design(id), { seed: id, size: 420, reveal: true }));
    $("heroCap").textContent = `punk #${id} · ${G.attributes(design(id))[0].value}`;
  }
  nextHero(); setInterval(nextHero, 9000);

  // ---------------------------------------------------------------- state + render
  let S = { sold: 0, raised: 0, next: priceAt(0), open: false, graduated: false };
  function renderStats() {
    $("sPrice").textContent = S.graduated ? "—" : fmt(S.next, 6);
    $("sRaised").textContent = fmt(S.raised, 3);
    $("sTarget").textContent = fmt(TARGET, 2);
    $("sSold").textContent = S.sold.toLocaleString("en-US");
    const pct = (S.sold / CURVE) * 100;
    $("cPct").textContent = pct.toFixed(2) + "%";
    $("cRaised").textContent = `${fmt(S.raised, 3)} BNB raised · graduates at ${fmt(TARGET, 2)} BNB → PancakeSwap`;
    const st = S.graduated ? ["GRADUATED", "trade on PancakeSwap"] : S.open ? ["MINTING", `${pct.toFixed(2)}% to graduation`] : live && !S.read ? ["LIVE", "reading the chain…"] : ["SOON", live ? "mint not open yet" : "preview: contract not deployed yet"];
    $("sStatus").textContent = st[0]; $("sStatusSub").textContent = st[1];
    $("liveDot").classList.toggle("live", S.open && !S.graduated);
    drawCurve();
  }

  function drawCurve() {
    const W = 800, H = 200, pad = 6, maxP = priceAt(CURVE - 1);
    const pt = (s) => [pad + (s / CURVE) * (W - 2 * pad), H - pad - (priceAt(Math.min(s, CURVE - 1)) / maxP) * (H - 2 * pad)];
    const line = (a, b) => { let d = ""; for (let i = 0; i <= 80; i++) { const s = a + ((b - a) * i) / 80; const [x, y] = pt(s); d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); } return d; };
    const sold = Math.min(S.sold, CURVE), [mx, my] = pt(sold);
    const fill = sold > 0 ? `<path d="${line(0, sold)} L${mx.toFixed(1)} ${H - pad} L${pad} ${H - pad} Z" fill="rgba(200,241,53,.16)"/>` : "";
    let grid = ""; for (let i = 1; i < 4; i++) grid += `<line x1="${pad}" x2="${W - pad}" y1="${(H * i) / 4}" y2="${(H * i) / 4}" stroke="#262c36" stroke-dasharray="3 5"/>`;
    $("curveSvg").innerHTML = grid + fill +
      `<path d="${line(0, CURVE)}" fill="none" stroke="#333b48" stroke-width="2"/>` +
      (sold > 0 ? `<path d="${line(0, sold)}" fill="none" stroke="#c8f135" stroke-width="3"/>` : "") +
      `<circle cx="${mx}" cy="${my}" r="6" fill="#c8f135" stroke="#0b0d10" stroke-width="2"/>`;
  }

  async function refresh() {
    if (!live) return renderStats();
    try {
      const i = await token.info();
      S = { read: true, sold: Number(i.sold), raised: Number(ethers.formatEther(i.raised)), next: Number(ethers.formatEther(i.nextPrice)), open: i.open, graduated: i.graduated };
      renderStats(); updateCost(); refreshFeed();
    } catch (e) {
      if (!S.read) { $("sStatus").textContent = "LIVE"; $("sStatusSub").textContent = "chain busy, retrying…"; }
      provider = await connectRpc(); token = token.connect(provider);
    }
  }

  // ---------------------------------------------------------------- mint panel
  const qty = () => Math.max(1, Math.min(100, parseInt($("qty").value, 10) || 1));
  let costTimer;
  function updateCost() {
    const n = qty();
    $("qty").value = n;
    $("sayText").textContent = `mint ${n} AgentPunks`;
    $("cliText").textContent = `node punks.mjs mint --count ${n}`;
    document.querySelectorAll(".chips button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.q === n)));
    const local = yAt(Math.min(CURVE, S.sold + n)) - yAt(S.sold);
    $("mCost").textContent = `${fmt(local, 6)} BNB`;
    $("mSplit").textContent = `${fmt(local / 2, 6)} team · ${fmt(local / 2, 6)} pool`;
    if (!live || S.graduated) return;
    clearTimeout(costTimer);
    costTimer = setTimeout(async () => {
      try { const q = await token.quote(Math.min(n, CURVE - S.sold)); const b = Number(ethers.formatEther(q)); $("mCost").textContent = `${fmt(b, 6)} BNB`; $("mSplit").textContent = `${fmt(b / 2, 6)} team · ${fmt(b / 2, 6)} pool`; } catch (_) {}
    }, 250);
  }
  $("qMinus").onclick = () => { $("qty").value = qty() - 1; updateCost(); };
  $("qPlus").onclick = () => { $("qty").value = qty() + 1; updateCost(); };
  $("qty").addEventListener("change", updateCost);
  document.querySelectorAll(".chips button").forEach((b) => (b.onclick = () => { $("qty").value = b.dataset.q; updateCost(); }));

  // browser wallet (only works if that wallet holds a .ai)
  $("walletMint").onclick = async () => {
    const msg = $("walletMsg");
    if (!live) { msg.textContent = "Preview: the contract is not deployed yet."; return; }
    if (!window.ethereum) { msg.textContent = "No browser wallet found. Use your agent instead."; return; }
    try {
      const bp = new ethers.BrowserProvider(window.ethereum);
      await bp.send("eth_requestAccounts", []);
      const hex = "0x" + cfg.chainId.toString(16);
      try { await bp.send("wallet_switchEthereumChain", [{ chainId: hex }]); }
      catch (e) { await bp.send("wallet_addEthereumChain", [{ chainId: hex, chainName: cfg.chainName, nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: [cfg.rpc], blockExplorerUrls: [cfg.explorer] }]); }
      const signer = await bp.getSigner(), me = await signer.getAddress();
      if (!(await token.isAgent(me))) { msg.textContent = `${short(me)} has no .ai Agent ID, so the contract will refuse it. Mint with your Agentic Wallet.`; return; }
      const n = Math.min(qty(), CURVE - S.sold), q = await token.quote(n);
      msg.textContent = "Confirm in your wallet…";
      const tx = await token.connect(signer).mint(n, { value: q + q / 100n });
      msg.textContent = "Sent. Waiting for the block…";
      await tx.wait();
      msg.textContent = `Minted ${n} punk${n > 1 ? "s" : ""}.`;
      refresh(); showWallet(me);
    } catch (e) {
      const d = e && (e.revert || (e.info && e.info.error) || {});
      msg.textContent = (d.name && ({ NotOpen: "The mint is not open yet.", NotAnAgent: "This wallet has no .ai Agent ID.", WalletCapReached: "This wallet already holds 100 punks.", AlreadyGraduated: "The curve graduated. Trade on PancakeSwap." })[d.name]) || (e.shortMessage || e.message || "Something went wrong.").slice(0, 160);
    }
  };

  // ---------------------------------------------------------------- live feed
  let feedBusy = false;
  function ago(sec) { return sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m` : `${Math.floor(sec / 3600)}h`; }
  async function refreshFeed() {
    if (feedBusy) return; feedBusy = true;
    try {
      const latest = await provider.getBlockNumber();
      const from0 = Number(cfg.deployBlock || 0);
      let logs = [], to = latest;
      for (let k = 0; k < 4 && logs.length < 30 && to > from0; k++) {
        const from = Math.max(from0, to - 4999);
        logs = (await token.queryFilter(token.filters.Minted(), from, to)).concat(logs);
        to = from - 1;
      }
      logs = logs.slice(-30).reverse();
      if (!logs.length) return;
      const now = Math.floor(Date.now() / 1000), blocks = {};
      const ul = $("feed"); const frag = document.createDocumentFragment();
      for (const l of logs) {
        const [agent, count, cost, soldAfter] = l.args;
        if (!blocks[l.blockNumber]) blocks[l.blockNumber] = provider.getBlock(l.blockNumber).then((b) => b.timestamp).catch(() => now);
        const li = document.createElement("li");
        const img = document.createElement("img"); img.alt = ""; img.src = svgUrl(G.svg(design(Number(soldAfter)), { size: 72 }));
        const h = await handleOf(agent), ts = await blocks[l.blockNumber];
        li.append(img);
        li.insertAdjacentHTML("beforeend", `<div><div class="who">${h ? `<b>${h.replace(/[<>&"]/g, "")}</b> ` : ""}<a href="${cfg.explorer}/address/${agent}" target="_blank" rel="noopener">${short(agent)}</a></div><div class="what">+${count} punk${count > 1n ? "s" : ""} · ${fmt(ethers.formatEther(cost), 5)} BNB</div></div><span class="ago">${ago(Math.max(0, now - ts))}</span>`);
        frag.append(li);
      }
      ul.replaceChildren(frag);
    } catch (_) { /* public RPCs sometimes refuse log queries; the feed just waits */ }
    finally { feedBusy = false; }
  }

  // ---------------------------------------------------------------- gallery
  const counts = G.ORDER.map((k) => G.TRAITS[k].map(() => 0));
  traits.forEach((t) => t.forEach((v, i) => counts[i][v]++));
  const score = (id) => design(id).reduce((s, v, j) => s + traits.length / counts[j][v], 0);
  const rareOrder = Array.from({ length: traits.length }, (_, i) => i + 1).sort((a, b) => score(b) - score(a));
  let tab = "all", shown = 0, list = [], walletAddr = null;
  function card(id) {
    const b = document.createElement("button"); b.type = "button"; b.className = "card"; b.setAttribute("aria-label", "Punk #" + id);
    const img = document.createElement("img"); img.loading = "lazy"; img.alt = ""; img.src = svgUrl(G.svg(design(id), { size: 120 }));
    b.append(img);
    b.insertAdjacentHTML("beforeend", `<div class="meta"><span>#${id}</span><span>${G.attributes(design(id))[0].value}</span></div>`);
    b.onclick = () => openPunk(id);
    return b;
  }
  function renderGallery(reset) {
    if (reset) { $("gallery").replaceChildren(); shown = 0; }
    const frag = document.createDocumentFragment();
    list.slice(shown, shown + PER_PAGE).forEach((id) => frag.append(card(id)));
    shown = Math.min(list.length, shown + PER_PAGE);
    $("gallery").append(frag);
    $("loadMore").hidden = shown >= list.length;
  }
  function setTab(t) {
    tab = t;
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    if (t === "all") { list = Array.from({ length: traits.length }, (_, i) => i + 1); $("punksNote").textContent = "All 10,000 designs. Each one is fixed; the chain decides who holds it."; }
    if (t === "rare") { list = rareOrder; $("punksNote").textContent = "Sorted by trait rarity: punks whose traits are the hardest to find come first."; }
    renderGallery(true);
  }
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => (b.dataset.tab === "mine" ? showWallet(walletAddr) : setTab(b.dataset.tab))));
  $("loadMore").onclick = () => renderGallery(false);

  async function showWallet(addr) {
    if (!addr) return;
    walletAddr = addr; $("tabMine").hidden = false;
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === "mine")));
    tab = "mine"; list = []; renderGallery(true);
    $("punksNote").textContent = `Loading ${short(addr)}…`;
    location.hash = "punks"; $("punks").scrollIntoView();
    if (!live) { $("punksNote").textContent = "Preview: wallet lookups work once the contract is live."; return; }
    try {
      const ids = (await token.ownedIds(addr, 0, 200)).map(Number);
      const h = await handleOf(addr);
      list = ids;
      $("punksNote").textContent = `${h ? h + " · " : ""}${short(addr)} holds ${ids.length} punk${ids.length === 1 ? "" : "s"}.`;
      renderGallery(true);
    } catch (_) { $("punksNote").textContent = "Could not read that wallet. Check the address."; }
  }
  $("lookupForm").onsubmit = (e) => {
    e.preventDefault();
    const a = $("lookupInput").value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) { toast("enter a 0x… address"); return; }
    showWallet(a);
  };

  async function openPunk(id) {
    const t = design(id);
    $("mArt").src = svgUrl(G.animatedSvg(t, { seed: id, size: 320, reveal: true }));
    $("mTitle").textContent = `AgentPunks #${id}`;
    $("mTraits").innerHTML = G.attributes(t).map((a, i) => `<li><span>${a.trait_type}</span><span>${a.value} <small class="muted">${((counts[i][t[i]] / traits.length) * 100).toFixed(1)}%</small></span></li>`).join("");
    $("mOwner").textContent = live ? "checking holder…" : "preview";
    $("modal").hidden = false; $("mClose").focus();
    if (!live || !mirror) return;
    try { const o = await mirror.ownerOf(id); const h = await handleOf(o); $("mOwner").textContent = `held by ${h ? h + " · " : ""}${short(o)}`; }
    catch (_) { $("mOwner").textContent = "not minted yet"; }
  }
  $("mClose").onclick = () => ($("modal").hidden = true);
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("modal").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("modal").hidden = true; });

  // ---------------------------------------------------------------- boot
  setTab("all");
  updateCost();
  renderStats();
  if (live) {
    try {
      const [m, p, r] = await Promise.all([token.mirrorERC721(), token.pair(), token.registry()]);
      mirror = new ethers.Contract(m, MIRROR_ABI, provider);
      registry = new ethers.Contract(r, REG_ABI, provider);
      const link = (label, a) => `<a href="${cfg.explorer}/address/${a}" target="_blank" rel="noopener">${label} ${short(a)}</a>`;
      $("addrs").innerHTML = [link("token", cfg.contract), link("nft", m), link("pool pair", p), link("agent registry", r)].join("");
    } catch (_) {}
    refresh(); setInterval(refresh, 15000);
  } else {
    $("addrs").textContent = "contract: not deployed yet (preview)";
  }
})();
