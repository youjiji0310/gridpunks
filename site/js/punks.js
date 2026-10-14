/* GridPunks — deterministic (same art engine as QuantusPunks) 24x24 pixel punk renderer.
 * Works in the browser (window.QPunks) and in Node (module.exports).
 * A punk is an array of trait indexes: [type, bg, head, eyes, mouth, face, extra]
 */
(function (root) {
  const TRAITS = {
    type: [
      { name: "Human Light", w: 18, skin: "#f1c9a5", shade: "#d9a77f" },
      { name: "Human Tan", w: 18, skin: "#d39b6a", shade: "#b47c4c" },
      { name: "Human Brown", w: 18, skin: "#9c6a45", shade: "#7d5133" },
      { name: "Human Deep", w: 16, skin: "#6b4430", shade: "#523222" },
      { name: "Synth", w: 14, skin: "#b9c4cf", shade: "#8e9aa6" },
      { name: "Ghost", w: 9, skin: "#bff3ff", shade: "#86dcef" },
      { name: "Neon", w: 5, skin: "#b79cff", shade: "#8d6cf2" },
      { name: "Split", w: 2, skin: "#ff8fc8", shade: "#5ce1e6" },
    ],
    bg: [
      { name: "Night", w: 30, c: "#0b1020", c2: "#121a33" },
      { name: "Blueprint", w: 22, c: "#0c2238", c2: "#123150" },
      { name: "Lagoon", w: 18, c: "#082a2c", c2: "#0e3b3e" },
      { name: "Dusk", w: 14, c: "#1d1236", c2: "#2a1a4d" },
      { name: "Brick", w: 10, c: "#2b0d14", c2: "#3d1420" },
      { name: "Twin Tone", w: 6, c: "#0d2a3a", c2: "#2a1a4d" },
    ],
    head: [
      { name: "None", w: 12 },
      { name: "Buzz Cut", w: 12 },
      { name: "Mohawk", w: 10 },
      { name: "Wild Hair", w: 10 },
      { name: "Bob", w: 9 },
      { name: "Beanie", w: 9 },
      { name: "Cap", w: 9 },
      { name: "Hood", w: 8 },
      { name: "Headband", w: 8 },
      { name: "Antenna", w: 5 },
      { name: "Halo", w: 4 },
      { name: "Crown", w: 2 },
    ],
    eyes: [
      { name: "Plain", w: 30 },
      { name: "Shades", w: 16 },
      { name: "Visor", w: 12 },
      { name: "VR Rig", w: 9 },
      { name: "Monocle", w: 8 },
      { name: "Sleepy", w: 10 },
      { name: "Laser", w: 4 },
      { name: "Odd Eyes", w: 3 },
    ],
    mouth: [
      { name: "Neutral", w: 32 },
      { name: "Smile", w: 22 },
      { name: "Frown", w: 14 },
      { name: "Smirk", w: 14 },
      { name: "Grill", w: 8 },
      { name: "Respirator", w: 7 },
      { name: "Bubblegum", w: 3 },
    ],
    face: [
      { name: "None", w: 40 },
      { name: "Beard", w: 12 },
      { name: "Mustache", w: 10 },
      { name: "Stubble", w: 12 },
      { name: "Freckles", w: 10 },
      { name: "Scar", w: 8 },
      { name: "Circuit Tattoo", w: 6 },
      { name: "Glitch", w: 2 },
    ],
    extra: [
      { name: "None", w: 46 },
      { name: "Earring", w: 16 },
      { name: "Gold Chain", w: 12 },
      { name: "Hoodie", w: 12 },
      { name: "Collar", w: 9 },
      { name: "Pendant", w: 5 },
    ],
  };
  const ORDER = ["type", "bg", "head", "eyes", "mouth", "face", "extra"];

  const OUT = "#06080f";
  const N = 24;

  function grid() { const g = []; for (let i = 0; i < N * N; i++) g.push(null); return g; }
  function px(g, x, y, c) { if (x >= 0 && y >= 0 && x < N && y < N && c) g[y * N + x] = c; }
  function rect(g, x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, c); }
  function clear(g, x, y) { if (x >= 0 && y >= 0 && x < N && y < N) g[y * N + x] = null; }

  // Head silhouette: 10 wide (x 7..16), rows 6..19, rounded
  function drawHead(g, skin, shade, split) {
    for (let y = 6; y <= 19; y++) {
      let x0 = 7, x1 = 16;
      if (y === 6) { x0 = 9; x1 = 14; }
      else if (y === 7) { x0 = 8; x1 = 15; }
      else if (y === 18) { x0 = 8; x1 = 15; }
      else if (y === 19) { x0 = 9; x1 = 14; }
      for (let x = x0; x <= x1; x++) {
        const c = split ? (x < 12 ? skin : shade) : skin;
        px(g, x, y, c);
      }
    }
    // ears
    rect(g, 6, 11, 1, 3, split ? skin : skin);
    rect(g, 17, 11, 1, 3, split ? shade : skin);
    // jaw shading
    if (!split) { rect(g, 9, 19, 6, 1, shade); px(g, 8, 18, shade); px(g, 15, 18, shade); }
    // nose
    if (!split) { px(g, 12, 13, shade); px(g, 12, 14, shade); px(g, 11, 15, shade); }
    // neck + shoulders
    rect(g, 10, 20, 4, 2, split ? skin : shade);
  }

  function drawBody(g, extra, accent) {
    const shirt = extra === 3 ? "#3a4a66" : "#1f2a40";
    rect(g, 4, 22, 16, 2, shirt);
    rect(g, 6, 21, 4, 1, shirt);
    rect(g, 14, 21, 4, 1, shirt);
    if (extra === 3) { // hoodie strings + hood folds
      rect(g, 5, 20, 3, 2, shirt); rect(g, 16, 20, 3, 2, shirt);
      px(g, 11, 22, "#cfd8e6"); px(g, 12, 22, "#cfd8e6"); px(g, 11, 23, "#cfd8e6"); px(g, 12, 23, "#cfd8e6");
    }
    if (extra === 2) { rect(g, 9, 22, 6, 1, "#f2c94c"); px(g, 12, 23, "#f2c94c"); }
    if (extra === 4) { rect(g, 9, 21, 1, 2, "#e8eef7"); rect(g, 14, 21, 1, 2, "#e8eef7"); }
    if (extra === 5) { rect(g, 10, 22, 4, 1, "#9aa6b8"); px(g, 11, 23, accent); px(g, 12, 23, accent); }
    if (extra === 1) { px(g, 6, 14, "#f2c94c"); }
  }

  function drawHeadwear(g, head, accent, hair) {
    switch (head) {
      case 1: rect(g, 9, 5, 6, 1, hair); rect(g, 8, 6, 8, 1, hair); px(g, 7, 7, hair); px(g, 16, 7, hair); break;
      case 2: rect(g, 11, 1, 2, 6, hair); rect(g, 10, 3, 4, 3, hair); break;
      case 3:
        for (let x = 6; x <= 17; x++) { const h = 2 + ((x * 7) % 3); rect(g, x, 7 - h, 1, h, hair); }
        rect(g, 6, 7, 1, 4, hair); rect(g, 17, 7, 1, 4, hair); break;
      case 4: rect(g, 8, 5, 8, 2, hair); rect(g, 6, 7, 2, 7, hair); rect(g, 16, 7, 2, 7, hair); rect(g, 8, 7, 8, 1, hair); break;
      case 5: rect(g, 8, 4, 8, 3, "#c0392b"); rect(g, 7, 7, 10, 1, "#e74c3c"); px(g, 11, 3, "#ecf0f1"); px(g, 12, 3, "#ecf0f1"); break;
      case 6: rect(g, 8, 4, 8, 3, "#2d6cdf"); rect(g, 7, 7, 10, 1, "#2d6cdf"); rect(g, 15, 7, 4, 1, "#1e4fa8"); break;
      case 7: rect(g, 6, 4, 12, 3, "#2a3346"); rect(g, 5, 7, 2, 13, "#2a3346"); rect(g, 17, 7, 2, 13, "#2a3346"); rect(g, 7, 7, 10, 1, "#2a3346"); break;
      case 8: rect(g, 7, 8, 10, 1, accent); px(g, 17, 9, accent); px(g, 18, 10, accent); break;
      case 9: rect(g, 12, 2, 1, 4, "#9aa6b8"); px(g, 12, 1, accent); px(g, 11, 1, accent); px(g, 13, 1, accent); break;
      case 10:
        rect(g, 7, 2, 10, 1, accent); px(g, 6, 3, accent); px(g, 17, 3, accent); rect(g, 8, 4, 8, 1, accent);
        px(g, 9, 2, "#ffffff"); break;
      case 11:
        rect(g, 8, 4, 8, 1, accent); px(g, 8, 3, accent); px(g, 10, 2, accent); px(g, 12, 1, accent); px(g, 14, 2, accent); px(g, 15, 3, accent);
        px(g, 10, 3, accent); px(g, 12, 2, accent); px(g, 12, 3, accent); px(g, 14, 3, accent);
        px(g, 12, 1, "#ffffff"); break;
    }
  }

  function drawEyes(g, eyes, accent, skin) {
    const white = "#f4f7fb", pupil = "#0b0f1a";
    switch (eyes) {
      case 0: px(g, 9, 12, white); px(g, 10, 12, pupil); px(g, 13, 12, white); px(g, 14, 12, pupil); break;
      case 1: rect(g, 8, 11, 8, 2, "#0b0f1a"); px(g, 9, 11, "#3b4a66"); px(g, 13, 11, "#3b4a66"); px(g, 7, 11, "#0b0f1a"); px(g, 16, 11, "#0b0f1a"); break;
      case 2: rect(g, 7, 11, 10, 2, accent); rect(g, 8, 11, 8, 1, "#ffffff"); px(g, 6, 11, "#2a3346"); px(g, 17, 11, "#2a3346"); break;
      case 3: rect(g, 7, 10, 10, 4, "#2a3346"); rect(g, 8, 11, 8, 2, "#11182a"); px(g, 9, 11, accent); px(g, 14, 12, accent); px(g, 6, 11, "#2a3346"); px(g, 17, 11, "#2a3346"); break;
      case 4:
        px(g, 9, 12, white); px(g, 10, 12, pupil);
        rect(g, 12, 10, 4, 4, "#f2c94c"); rect(g, 13, 11, 2, 2, white); px(g, 14, 12, pupil); px(g, 15, 14, "#f2c94c"); px(g, 15, 15, "#f2c94c"); break;
      case 5: rect(g, 9, 12, 2, 1, pupil); rect(g, 13, 12, 2, 1, pupil); break;
      case 6:
        px(g, 9, 12, "#ff3b3b"); px(g, 10, 12, "#ffd1d1"); px(g, 13, 12, "#ff3b3b"); px(g, 14, 12, "#ffd1d1");
        for (let x = 15; x < 24; x++) px(g, x, 12, x % 2 ? "#ff3b3b" : "#ff7a7a"); break;
      case 7:
        px(g, 9, 12, white); px(g, 10, 12, pupil); px(g, 9, 11, accent);
        px(g, 13, 12, pupil); px(g, 14, 12, white); px(g, 14, 11, accent); break;
    }
  }

  function drawMouth(g, mouth, shade) {
    const lip = "#5a2a2a";
    switch (mouth) {
      case 0: rect(g, 10, 17, 4, 1, lip); break;
      case 1: rect(g, 10, 17, 4, 1, lip); px(g, 9, 16, lip); px(g, 14, 16, lip); break;
      case 2: rect(g, 10, 16, 4, 1, lip); px(g, 9, 17, lip); px(g, 14, 17, lip); break;
      case 3: rect(g, 10, 17, 3, 1, lip); px(g, 13, 16, lip); break;
      case 4: rect(g, 9, 17, 6, 1, "#f2c94c"); px(g, 10, 17, "#fff2b3"); px(g, 13, 17, "#fff2b3"); break;
      case 5: rect(g, 8, 16, 8, 3, "#3b4a66"); rect(g, 9, 17, 2, 1, "#9aa6b8"); rect(g, 13, 17, 2, 1, "#9aa6b8"); px(g, 7, 16, "#3b4a66"); px(g, 16, 16, "#3b4a66"); break;
      case 6: rect(g, 10, 17, 2, 1, lip); rect(g, 12, 16, 3, 3, "#ff8fc8"); px(g, 13, 16, "#ffc4e1"); break;
    }
  }

  function drawFace(g, face, hair, shade, accent) {
    switch (face) {
      case 1: rect(g, 8, 16, 1, 3, hair); rect(g, 15, 16, 1, 3, hair); rect(g, 9, 18, 6, 2, hair); px(g, 9, 17, hair); px(g, 14, 17, hair); break;
      case 2: rect(g, 9, 16, 6, 1, hair); px(g, 9, 17, hair); px(g, 14, 17, hair); break;
      case 3: for (let x = 8; x <= 15; x++) for (let y = 16; y <= 19; y++) if ((x + y) % 2 === 0 && g[y * N + x] && !(y === 17 && x >= 10 && x <= 13)) px(g, x, y, shade); break;
      case 4: px(g, 9, 14, shade); px(g, 10, 15, shade); px(g, 14, 14, shade); px(g, 13, 15, shade); break;
      case 5: px(g, 14, 9, "#a33a3a"); px(g, 14, 10, "#a33a3a"); px(g, 15, 11, "#a33a3a"); px(g, 15, 13, "#a33a3a"); break;
      case 6: px(g, 8, 9, accent); px(g, 8, 10, accent); px(g, 9, 10, accent); px(g, 8, 14, accent); px(g, 8, 15, accent); px(g, 9, 15, accent); break;
      case 7: for (let y = 8; y <= 18; y += 3) { const off = (y % 2) ? 1 : -1; for (let x = 7; x <= 16; x++) { const c = g[y * N + x]; if (c) { clear(g, x, y); px(g, x + off, y, c); } } px(g, 7, y, accent); } break;
    }
  }

  function outline(g) {
    const o = g.slice();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (g[y * N + x]) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const xx = x + dx, yy = y + dy;
        return xx >= 0 && yy >= 0 && xx < N && yy < N && g[yy * N + xx] && g[yy * N + xx] !== "#ff3b3b" && g[yy * N + xx] !== "#ff7a7a";
      });
      if (n) o[y * N + x] = OUT;
    }
    return o;
  }

  function accentFor(t) {
    const list = ["#5ce1e6", "#b79cff", "#7cf29a", "#ff8fc8", "#ffd166"];
    return list[(t[0] * 3 + t[2] + t[3] * 2) % list.length];
  }
  function hairFor(t) {
    const list = ["#1a1410", "#3b2416", "#7a4a22", "#c9a14a", "#d9d9d9", "#5ce1e6", "#b79cff", "#e2504c"];
    return list[(t[2] * 5 + t[5] * 3 + t[1]) % list.length];
  }

  function pixels(t) {
    const type = TRAITS.type[t[0]];
    const accent = accentFor(t), hair = hairFor(t);
    const g = grid();
    if (t[2] === 7) { rect(g, 5, 7, 2, 13, "#2a3346"); rect(g, 17, 7, 2, 13, "#2a3346"); }
    drawBody(g, t[6], accent);
    drawHead(g, type.skin, type.shade, t[0] === 7);
    if (t[0] === 4) { px(g, 7, 9, "#7c8896"); px(g, 16, 9, "#7c8896"); rect(g, 7, 16, 1, 2, "#7c8896"); rect(g, 16, 16, 1, 2, "#7c8896"); }
    drawFace(g, t[5] === 7 ? 0 : t[5], hair, type.shade, accent);
    drawMouth(g, t[4], type.shade);
    drawEyes(g, t[3], accent, type.skin);
    drawHeadwear(g, t[2], accent, hair);
    drawBody(g, t[6] === 1 ? 1 : -1, accent);
    if (t[5] === 7) drawFace(g, 7, hair, type.shade, accent);
    return outline(g);
  }

  function svg(t, opts) {
    opts = opts || {};
    const bg = TRAITS.bg[t[1]];
    const p = pixels(t);
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges"' + (opts.size ? ' width="' + opts.size + '" height="' + opts.size + '"' : "") + ">";
    if (t[1] === 5) {
      s += '<rect width="12" height="24" fill="' + bg.c + '"/><rect x="12" width="12" height="24" fill="' + bg.c2 + '"/>';
    } else {
      s += '<rect width="24" height="24" fill="' + bg.c + '"/>';
      for (let i = 0; i < 24; i += 4) s += '<rect x="' + i + '" width="1" height="24" fill="' + bg.c2 + '" opacity=".5"/><rect y="' + i + '" width="24" height="1" fill="' + bg.c2 + '" opacity=".5"/>';
    }
    for (let y = 0; y < N; y++) {
      let x = 0;
      while (x < N) {
        const c = p[y * N + x];
        if (!c) { x++; continue; }
        let w = 1; while (x + w < N && p[y * N + x + w] === c) w++;
        s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="1" fill="' + c + '"/>';
        x += w;
      }
    }
    return s + "</svg>";
  }

  function drawCanvas(ctx, t, size) {
    const bg = TRAITS.bg[t[1]], k = size / 24;
    ctx.imageSmoothingEnabled = false;
    if (t[1] === 5) { ctx.fillStyle = bg.c; ctx.fillRect(0, 0, size / 2, size); ctx.fillStyle = bg.c2; ctx.fillRect(size / 2, 0, size / 2, size); }
    else { ctx.fillStyle = bg.c; ctx.fillRect(0, 0, size, size); ctx.globalAlpha = .5; ctx.fillStyle = bg.c2; for (let i = 0; i < 24; i += 4) { ctx.fillRect(i * k, 0, k, size); ctx.fillRect(0, i * k, size, k); } ctx.globalAlpha = 1; }
    const p = pixels(t);
    for (let i = 0; i < p.length; i++) if (p[i]) { ctx.fillStyle = p[i]; ctx.fillRect((i % 24) * k, Math.floor(i / 24) * k, Math.ceil(k), Math.ceil(k)); }
  }

  function attributes(t) {
    return ORDER.map((k, i) => ({ trait_type: k === "bg" ? "Background" : k === "face" ? "Face" : k.charAt(0).toUpperCase() + k.slice(1), value: TRAITS[k][t[i]].name }));
  }

  // ---------------------------------------------------------- the Golden Punk (token 10000)
  // One-of-one: a crowned neon punk with laser eyes, every pixel recast in gold.
  const LEGEND_TRAITS = [6, 0, 11, 6, 4, 6, 2];
  const GOLD = ["#3a2606", "#6b4a0c", "#9c6f16", "#c99a2a", "#e8c25a", "#fbe7a1", "#fff8dc"];
  function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  function legendPixels() {
    return pixels(LEGEND_TRAITS).map((c) => {
      if (!c) return null;
      if (c === "#ff3b3b" || c === "#ff7a7a" || c === "#ffd1d1") return c; // keep the laser red
      return GOLD[Math.min(GOLD.length - 1, Math.floor(lum(c) * GOLD.length))];
    });
  }
  function legendSvg(size) {
    const p = legendPixels();
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges"' + (size ? ' width="' + size + '" height="' + size + '"' : "") + '><rect width="24" height="24" fill="#120d04"/>';
    for (let i = 0; i < 24; i += 4) s += '<rect x="' + i + '" width="1" height="24" fill="#2a1e08"/><rect y="' + i + '" width="24" height="1" fill="#2a1e08"/>';
    p.forEach((c, i) => { if (c) s += '<rect x="' + (i % 24) + '" y="' + Math.floor(i / 24) + '" width="1" height="1" fill="' + c + '"/>'; });
    return s + "</svg>";
  }
  function drawLegend(ctx, size) {
    const k = size / 24;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#120d04"; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#2a1e08"; for (let i = 0; i < 24; i += 4) { ctx.fillRect(i * k, 0, k, size); ctx.fillRect(0, i * k, size, k); }
    legendPixels().forEach((c, i) => { if (c) { ctx.fillStyle = c; ctx.fillRect((i % 24) * k, Math.floor(i / 24) * k, Math.ceil(k), Math.ceil(k)); } });
  }
  function legendAttributes() {
    return [{ trait_type: "Type", value: "Golden" }, { trait_type: "Edition", value: "1 of 1" },
      ...attributes(LEGEND_TRAITS).filter((a) => a.trait_type !== "Type" && a.trait_type !== "Background" && a.value !== "None")];
  }

  const api = { TRAITS, ORDER, pixels, svg, drawCanvas, attributes, legendSvg, drawLegend, legendAttributes };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GPunks = api;
})(typeof window !== "undefined" ? window : globalThis);
