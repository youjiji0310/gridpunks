/* GridPunks site: the 100 x 100 board, plot picking, wallet + mint, reveal.
 * No libraries: JSON-RPC over fetch, ABI encoded by hand (the contract is tiny). */
(function () {
  "use strict";
  const N = 100, CELLS = 10000, PX = 24, BOARD = N * PX, MAX = 20;
  const SEL = {
    mint: "0xf8e93ef9", grid: "0xa23836ef", totalSupply: "0x18160ddd", price: "0xa035b1fe",
    mintOpen: "0x24bbd049", ownerOf: "0x6352211e", provenance: "0x0f7309e8",
  };
  const CLAIMED_TOPIC = "0x987d620f307ff6b94d58743cb7a7509f24071586a77759b77c2d4e29f75a2f9a";
  const ERRORS = {
    "0x589ed34b": "The mint is not open yet.",
    "0x91d01199": "Mint straight from a wallet, not from a contract.",
    "0x1fc67efa": "Pick between 1 and 20 plots.",
    "0x788a686f": "Wrong amount of ETH for that many plots.",
    "0x77be85a1": "One of those plots does not exist.",
    "0x55d3ab31": "Someone just claimed one of your plots. It has been removed, try again.",
  };

  const $ = (id) => document.getElementById(id);
  const G = window.GPunks;
  let cfg, traits = [];
  let board = new Uint16Array(CELLS); // punk + 1, 0 = empty
  const selected = new Set();
  let priceWei = 300000000000000n, mintOpen = false, preview = true;
  let account = null, wallet = null;
  let pinned = null, hover = null, busy = false;

  // ------------------------------------------------------------ board art
  const off = document.createElement("canvas");
  off.width = off.height = BOARD;
  const octx = off.getContext("2d");
  const QMARK = ["01110", "10001", "00001", "00110", "00100", "00000", "00100"];

  function drawEmpty(cell) {
    const x = (cell % N) * PX, y = Math.floor(cell / N) * PX;
    octx.fillStyle = "#0f1217"; octx.fillRect(x, y, PX, PX);
    octx.fillStyle = "#171b22"; octx.fillRect(x + 1, y + 1, PX - 2, PX - 2);
    octx.fillStyle = "#262d38";
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (QMARK[r][c] === "1") octx.fillRect(x + 10 + c * 1, y + 8 + r, 1, 1);
  }
  function drawCell(cell) {
    const v = board[cell];
    if (!v) return drawEmpty(cell);
    const x = (cell % N) * PX, y = Math.floor(cell / N) * PX;
    octx.save(); octx.translate(x, y); G.drawCanvas(octx, traits[v - 1], PX); octx.restore();
  }
  function drawAll() { for (let i = 0; i < CELLS; i++) drawCell(i); }

  // ------------------------------------------------------------ view
  const cv = $("grid"), ctx = cv.getContext("2d"), wrap = $("wrap");
  let W = 0, scale = 1, ox = 0, oy = 0, fit = 1, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = wrap.clientWidth;
    const first = !W;
    const keep = W ? { cx: (W / 2 - ox) / scale, cy: (W / 2 - oy) / scale, rel: scale / fit } : null;
    W = w; cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr);
    fit = W / BOARD;
    if (first || !keep) { scale = fit; ox = 0; oy = 0; }
    else { scale = fit * keep.rel; ox = W / 2 - keep.cx * scale; oy = W / 2 - keep.cy * scale; clamp(); }
    render();
  }
  function clamp() {
    scale = Math.max(fit, Math.min(scale, 4));
    const size = BOARD * scale, pad = W * 0.25;
    if (size <= W) { ox = (W - size) / 2; oy = (W - size) / 2; return; }
    ox = Math.min(pad, Math.max(W - size - pad, ox));
    oy = Math.min(pad, Math.max(W - size - pad, oy));
  }
  function zoomAt(f, sx, sy) {
    const bx = (sx - ox) / scale, by = (sy - oy) / scale;
    scale *= f; clamp();
    ox = sx - bx * scale; oy = sy - by * scale; clamp(); render();
  }
  function cellAt(sx, sy) {
    const bx = (sx - ox) / scale, by = (sy - oy) / scale;
    if (bx < 0 || by < 0 || bx >= BOARD || by >= BOARD) return null;
    return Math.floor(by / PX) * N + Math.floor(bx / PX);
  }
  function centerOn(cell, cellPx) {
    scale = Math.max(fit, cellPx / PX);
    const cx = ((cell % N) + 0.5) * PX, cy = (Math.floor(cell / N) + 0.5) * PX;
    ox = W / 2 - cx * scale; oy = W / 2 - cy * scale; clamp(); render();
  }

  let raf = 0;
  function render() { if (!raf) raf = requestAnimationFrame(paint); }
  function paint() {
    raf = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#12151a"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0);
    const cellScreen = PX * scale, lw = 1 / scale;
    // plot dividers when zoomed in enough to read individual plots
    if (cellScreen >= 14) {
      ctx.fillStyle = "rgba(0,0,0,.55)";
      for (let i = 0; i <= N; i++) { ctx.fillRect(i * PX - lw / 2, 0, lw, BOARD); ctx.fillRect(0, i * PX - lw / 2, BOARD, lw); }
    }
    // every 10 plots a slightly stronger line, like a survey map
    ctx.fillStyle = "rgba(200,241,53,.10)";
    for (let i = 10; i < N; i += 10) { ctx.fillRect(i * PX - lw, 0, lw * 2, BOARD); ctx.fillRect(0, i * PX - lw, BOARD, lw * 2); }
    for (const c of selected) {
      const x = (c % N) * PX, y = Math.floor(c / N) * PX;
      ctx.fillStyle = cellScreen < 8 ? "#c8f135" : "rgba(200,241,53,.35)";
      ctx.fillRect(x, y, PX, PX);
      if (cellScreen >= 8) { ctx.strokeStyle = "#c8f135"; ctx.lineWidth = Math.max(2 / scale, 1.5); ctx.strokeRect(x + 1, y + 1, PX - 2, PX - 2); }
    }
    for (const c of [hover, pinned]) {
      if (c == null) continue;
      const x = (c % N) * PX, y = Math.floor(c / N) * PX, m = Math.max(2 / scale, 0.5);
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = m;
      ctx.strokeRect(x - m / 2, y - m / 2, PX + m, PX + m);
    }
  }

  // ------------------------------------------------------------ pointer
  const pointers = new Map();
  let drag = null, pinch = null;
  function local(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    const p = local(e); pointers.set(e.pointerId, p);
    if (pointers.size === 1) drag = { sx: p.x, sy: p.y, ox, oy, moved: false };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale };
      drag = null;
    }
  });
  cv.addEventListener("pointermove", (e) => {
    const p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      zoomAt((pinch.scale * d / pinch.d) / scale, mx, my);
      return;
    }
    if (drag) {
      const dx = p.x - drag.sx, dy = p.y - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; cv.classList.add("dragging"); }
      if (drag.moved) { ox = drag.ox + dx; oy = drag.oy + dy; clamp(); render(); }
    }
    if (e.pointerType === "mouse" && !(drag && drag.moved)) setHover(cellAt(p.x, p.y));
  });
  function endPointer(e) {
    const p = local(e);
    const wasDrag = drag && drag.moved, single = pointers.size === 1 && !pinch;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (single && drag && !wasDrag && e.type === "pointerup") clickCell(cellAt(p.x, p.y));
    if (pointers.size === 0) { drag = null; cv.classList.remove("dragging"); }
  }
  cv.addEventListener("pointerup", endPointer);
  cv.addEventListener("pointercancel", endPointer);
  cv.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") setHover(null); });
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });
  $("zoomIn").onclick = () => zoomAt(1.6, W / 2, W / 2);
  $("zoomOut").onclick = () => zoomAt(1 / 1.6, W / 2, W / 2);
  $("zoomFit").onclick = () => { scale = fit; clamp(); render(); };

  function setHover(c) {
    if (c === hover) return;
    hover = c; render();
    $("hud").hidden = c == null;
    if (c != null) $("hud").textContent = `x ${c % N} · y ${Math.floor(c / N)} · #${c}`;
    if (pinned == null) inspect(c);
  }

  function clickCell(c) {
    if (c == null) return;
    if (board[c]) { pinned = c; inspect(c, true); render(); return; }
    if (selected.has(c)) selected.delete(c);
    else if (selected.size >= MAX) return setStatus(`You can claim up to ${MAX} plots per mint.`, "err");
    else selected.add(c);
    pinned = null; inspect(c);
    updateCart(); render();
  }

  // ------------------------------------------------------------ inspect panel
  const ictx = $("inspectArt").getContext("2d");
  function drawQ(c2d, size) {
    c2d.imageSmoothingEnabled = false;
    c2d.fillStyle = "#171b22"; c2d.fillRect(0, 0, size, size);
    const k = size / 24; c2d.fillStyle = "#3a4352";
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (QMARK[r][c] === "1") c2d.fillRect((9.5 + c) * k, (8.5 + r) * k, k, k);
  }
  let ownerReq = 0;
  async function inspect(c, withOwner) {
    if (c == null) {
      drawQ(ictx, 240); $("inspectCoord").textContent = "Plot —"; $("inspectTitle").textContent = "Hover the grid";
      $("inspectText").textContent = "Empty plots show a question mark. Claimed plots show their punk and owner.";
      $("inspectTraits").innerHTML = ""; return;
    }
    $("inspectCoord").textContent = `Plot ${c % N}, ${Math.floor(c / N)} · #${c}`;
    const v = board[c];
    if (!v) {
      drawQ(ictx, 240);
      $("inspectTitle").textContent = selected.has(c) ? "In your picks" : "Unclaimed";
      $("inspectText").textContent = selected.has(c) ? "Mint to find out who lives here." : "Someone is hiding here. Click to add this plot.";
      $("inspectTraits").innerHTML = ""; return;
    }
    const t = traits[v - 1];
    G.drawCanvas(ictx, t, 240);
    $("inspectTitle").textContent = `Punk ${v - 1}`;
    $("inspectTraits").innerHTML = G.attributes(t).filter((a) => a.value !== "None")
      .map((a) => `<li>${a.trait_type} <b>${a.value}</b></li>`).join("");
    $("inspectText").textContent = preview ? "Claimed (preview data)." : "Claimed.";
    if (withOwner && !preview) {
      const req = ++ownerReq;
      try {
        const out = await call(SEL.ownerOf + word(c));
        if (req !== ownerReq || pinned !== c) return;
        const owner = "0x" + out.slice(-40);
        const mine = account && owner.toLowerCase() === account.toLowerCase();
        $("inspectText").innerHTML = `Owner <a class="num" href="${cfg.explorer}/address/${owner}" target="_blank" rel="noopener">${short(owner)}</a>${mine ? " (you)" : ""}`;
      } catch (_) { /* leave "Claimed." */ }
    }
  }

  // ------------------------------------------------------------ cart
  function updateCart() {
    const list = [...selected].sort((a, b) => a - b);
    $("chips").innerHTML = list.length
      ? list.map((c) => `<li><button type="button" data-c="${c}" title="Remove">${c % N},${Math.floor(c / N)} ×</button></li>`).join("")
      : '<li class="muted small">No plots picked yet.</li>';
    $("clearSel").hidden = !list.length;
    $("total").textContent = fmtEth(priceWei * BigInt(list.length)) + " ETH";
    const b = $("mintBtn");
    if (!list.length) { b.disabled = true; b.textContent = "Pick at least one plot"; }
    else if (preview) { b.disabled = busy; b.textContent = `Preview mint · ${list.length} plot${list.length > 1 ? "s" : ""}`; }
    else if (!mintOpen) { b.disabled = true; b.textContent = "Mint not open yet"; }
    else if (!account) { b.disabled = busy; b.textContent = "Connect wallet to mint"; }
    else { b.disabled = busy; b.textContent = `Mint ${list.length} plot${list.length > 1 ? "s" : ""}`; }
  }
  $("chips").addEventListener("click", (e) => {
    const c = e.target.closest("button[data-c]"); if (!c) return;
    selected.delete(+c.dataset.c); updateCart(); render();
  });
  $("clearSel").onclick = () => { selected.clear(); updateCart(); render(); };
  $("luckyBtn").onclick = () => {
    if (selected.size >= MAX) return setStatus(`You can claim up to ${MAX} plots per mint.`, "err");
    const free = []; for (let i = 0; i < CELLS; i++) if (!board[i] && !selected.has(i)) free.push(i);
    if (!free.length) return setStatus("Every plot is claimed.", "err");
    const c = free[Math.floor(Math.random() * free.length)];
    selected.add(c); updateCart(); centerOn(c, Math.max(PX * scale, 40)); inspect(c);
  };
  $("jumpForm").onsubmit = (e) => {
    e.preventDefault();
    const x = parseInt($("jx").value, 10), y = parseInt($("jy").value, 10);
    if (!(x >= 0 && x < N && y >= 0 && y < N)) return setStatus("x and y go from 0 to 99.", "err");
    const c = y * N + x; pinned = board[c] ? c : null; hover = c;
    centerOn(c, 64); inspect(c, true);
  };

  function setStatus(msg, kind) { const s = $("status"); s.textContent = msg || ""; s.className = "status small" + (kind ? " " + kind : ""); }

  // ------------------------------------------------------------ chain reads
  let rpcId = 1;
  async function rpc(method, params) {
    const r = await fetch(cfg.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }) });
    const j = await r.json();
    if (j.error) { const err = new Error(j.error.message || "RPC error"); err.data = j.error.data; throw err; }
    return j.result;
  }
  function call(data, from) { return rpc("eth_call", [{ to: cfg.contract, data, ...(from ? { from } : {}) }, "latest"]); }
  function word(n) { return BigInt(n).toString(16).padStart(64, "0"); }
  function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  function fmtEth(wei) {
    const s = wei.toString().padStart(19, "0"), int = s.slice(0, -18), frac = s.slice(-18).replace(/0+$/, "");
    return frac ? `${int}.${frac}` : int;
  }
  function decodeString(hex) {
    const h = hex.slice(2), len = parseInt(h.slice(64, 128), 16), bytes = h.slice(128, 128 + len * 2);
    let s = ""; for (let i = 0; i < bytes.length; i += 2) s += String.fromCharCode(parseInt(bytes.slice(i, i + 2), 16));
    return s;
  }

  async function refresh() {
    if (preview) return;
    try {
      const [g, ts, pr, open] = await Promise.all([call(SEL.grid), call(SEL.totalSupply), call(SEL.price), call(SEL.mintOpen)]);
      priceWei = BigInt(pr); mintOpen = BigInt(open) === 1n;
      applyGrid(g);
      $("claimed").textContent = Number(BigInt(ts)).toLocaleString("en-US");
      ["priceLabel", "priceLabel2"].forEach((id) => ($(id).textContent = fmtEth(priceWei)));
      updateCart();
    } catch (e) { console.warn("refresh failed", e); }
  }
  function applyGrid(hex) {
    const h = hex.slice(2); let changed = 0, lost = 0;
    for (let w = 0; w < 625; w++) {
      const wd = h.slice(w * 64, w * 64 + 64);
      for (let j = 0; j < 16; j++) {
        const v = parseInt(wd.slice(64 - 4 * (j + 1), 64 - 4 * j), 16), c = w * 16 + j;
        if (board[c] !== v) {
          board[c] = v; drawCell(c); changed++;
          if (v && selected.delete(c)) lost++;
        }
      }
    }
    if (lost) setStatus(`${lost} of your plots ${lost > 1 ? "were" : "was"} just claimed by someone else and removed.`, "err");
    if (changed) { render(); if (pinned != null || hover != null) inspect(pinned ?? hover, pinned != null); }
  }

  // ------------------------------------------------------------ wallet
  const discovered = [];
  window.addEventListener("eip6963:announceProvider", (e) => discovered.push(e.detail));
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  function pickWallet() { return (discovered[0] && discovered[0].provider) || window.ethereum || null; }

  async function connect() {
    wallet = pickWallet();
    if (!wallet) { setStatus("No browser wallet found. Install MetaMask or Rabby, or open this page in your wallet's browser.", "err"); return false; }
    try {
      const accs = await wallet.request({ method: "eth_requestAccounts" });
      account = accs[0];
      await ensureChain();
      const b = $("connect"); b.textContent = short(account); b.classList.add("connected");
      wallet.on && wallet.on("accountsChanged", (a) => { account = a[0] || null; $("connect").textContent = account ? short(account) : "Connect wallet"; updateCart(); });
      setStatus(""); updateCart(); return true;
    } catch (e) { setStatus(e.code === 4001 ? "Connection cancelled." : (e.message || "Could not connect."), "err"); return false; }
  }
  async function ensureChain() {
    const want = "0x" + cfg.chainId.toString(16);
    const cur = await wallet.request({ method: "eth_chainId" });
    if (cur.toLowerCase() === want) return;
    try { await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] }); }
    catch (e) {
      if (e.code !== 4902 && !(e.data && e.data.originalError && e.data.originalError.code === 4902)) throw e;
      await wallet.request({ method: "wallet_addEthereumChain", params: [{ chainId: want, chainName: cfg.chainName, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [cfg.rpc], blockExplorerUrls: [cfg.explorer] }] });
    }
  }
  $("connect").onclick = () => { if (!account) connect(); };

  // ------------------------------------------------------------ mint
  function revertMessage(e) {
    const blob = JSON.stringify(e && (e.data || e)) + " " + (e && e.message);
    const m = blob.match(/0x[0-9a-f]{8}/gi) || [];
    for (const sel of m) if (ERRORS[sel.toLowerCase()]) return ERRORS[sel.toLowerCase()];
    if (/insufficient funds/i.test(blob)) return "Not enough ETH on Robinhood Chain for the plots plus gas.";
    if (e && e.code === 4001) return "Transaction cancelled in your wallet.";
    return (e && e.message) || "Mint failed.";
  }
  $("mintBtn").onclick = async () => {
    if (busy || !selected.size) return;
    if (preview) return previewMint();
    if (!account && !(await connect())) return;
    const cells = [...selected].sort((a, b) => a - b);
    const data = SEL.mint + word(32) + word(cells.length) + cells.map(word).join("");
    const value = "0x" + (priceWei * BigInt(cells.length)).toString(16);
    busy = true; updateCart();
    try {
      await ensureChain();
      setStatus("Checking your plots are still free…");
      try { await rpc("eth_call", [{ from: account, to: cfg.contract, data, value }, "latest"]); }
      catch (e) {
        if (/55d3ab31/i.test(JSON.stringify(e.data || "") + e.message)) await refresh();
        throw e;
      }
      setStatus("Confirm in your wallet…");
      const hash = await wallet.request({ method: "eth_sendTransaction", params: [{ from: account, to: cfg.contract, data, value }] });
      setStatus("Mint sent. Waiting for the block…");
      let rc = null;
      for (let i = 0; i < 120 && !rc; i++) { rc = await rpc("eth_getTransactionReceipt", [hash]).catch(() => null); if (!rc) await new Promise((r) => setTimeout(r, 1000)); }
      if (!rc) throw new Error("Still waiting for confirmation. Check your wallet activity, then refresh.");
      if (rc.status !== "0x1") throw new Error("The transaction reverted. Your ETH was not spent apart from gas.");
      const found = rc.logs.filter((l) => l.topics[0] === CLAIMED_TOPIC && l.address.toLowerCase() === cfg.contract.toLowerCase())
        .map((l) => ({ cell: parseInt(l.topics[2], 16), punk: parseInt(l.data, 16) }));
      found.forEach((f) => { board[f.cell] = f.punk + 1; drawCell(f.cell); selected.delete(f.cell); });
      setStatus(`Claimed ${found.length} plot${found.length > 1 ? "s" : ""}.`, "ok");
      showReveal(found); render(); refresh();
    } catch (e) { setStatus(revertMessage(e), "err"); }
    finally { busy = false; updateCart(); }
  };

  function previewMint() {
    const used = new Set(); board.forEach((v) => v && used.add(v - 1));
    const found = [...selected].map((cell) => {
      let p; do { p = Math.floor(Math.random() * CELLS); } while (used.has(p)); used.add(p);
      board[cell] = p + 1; drawCell(cell); return { cell, punk: p };
    });
    selected.clear(); updateCart(); render();
    $("claimed").textContent = board.filter(Boolean).length.toLocaleString("en-US");
    setStatus("Preview only: nothing was sent on-chain.", "ok");
    showReveal(found);
  }

  function showReveal(found) {
    const g = $("revealGrid"); g.innerHTML = "";
    found.forEach((f, i) => {
      const fig = document.createElement("figure"); fig.style.animationDelay = `${i * 90}ms`;
      const c = document.createElement("canvas"); c.width = c.height = 240;
      G.drawCanvas(c.getContext("2d"), traits[f.punk], 240);
      const cap = document.createElement("figcaption"); cap.textContent = `Plot ${f.cell % N},${Math.floor(f.cell / N)} · Punk ${f.punk}`;
      fig.append(c, cap); g.append(fig);
    });
    $("revealTitle").textContent = found.length > 1 ? `You found ${found.length} punks.` : "You found a punk.";
    $("reveal").hidden = false; $("revealClose").focus();
  }
  $("revealClose").onclick = () => ($("reveal").hidden = true);
  $("reveal").addEventListener("click", (e) => { if (e.target.id === "reveal") $("reveal").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("reveal").hidden = true; });

  // ------------------------------------------------------------ boot
  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function boot() {
    cfg = await (await fetch("config.json", { cache: "no-store" })).json();
    const tText = await (await fetch("data/traits.json")).text();
    traits = JSON.parse(tText);
    preview = !/^0x[0-9a-fA-F]{40}$/.test(cfg.contract || "");
    if (cfg.priceEth) priceWei = BigInt(Math.round(parseFloat(cfg.priceEth) * 1e6)) * 1000000000000n;
    ["priceLabel", "priceLabel2"].forEach((id) => ($(id).textContent = fmtEth(priceWei)));
    $("xLink").href = cfg.x || "https://x.com/";
    $("contractLink").href = preview ? "#" : `${cfg.explorer}/address/${cfg.contract}`;
    const bctx = $("brandPunk").getContext("2d"); G.drawCanvas(bctx, traits[42], 24);

    if (preview) {
      // Demo board so the page can be judged before deploy: a few hundred scattered claims
      let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 700; i++) { const c = Math.floor(rnd() * CELLS); if (!board[c]) board[c] = Math.floor(rnd() * CELLS) + 1; }
      $("claimed").textContent = board.filter(Boolean).length.toLocaleString("en-US") + " (demo)";
    }
    drawAll(); resize(); inspect(null); updateCart();
    new ResizeObserver(resize).observe(wrap);

    const fileHash = await sha256Hex(tText);
    $("provHash").textContent = "traits.json sha256: " + fileHash;
    if (!preview) {
      await refresh();
      setInterval(refresh, 15000);
      try {
        const onChain = decodeString(await call(SEL.provenance));
        $("provHash").textContent = `traits.json sha256: ${fileHash}\ncontract provenance: ${onChain} ${onChain === fileHash ? "✓ match" : "✗ MISMATCH"}`;
      } catch (_) {}
      const w = pickWallet();
      if (w) w.request({ method: "eth_accounts" }).then((a) => { if (a && a[0]) connect(); }).catch(() => {});
    } else {
      setStatus("Preview mode: no contract set in config.json, the claimed plots are demo data.");
    }
  }
  boot().catch((e) => { console.error(e); setStatus("Could not load the grid: " + e.message, "err"); });
})();
