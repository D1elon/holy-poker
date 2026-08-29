// ============ HOLY POKER — procedural pixel card art ============
window.HP = window.HP || {};

HP.art = (function () {
  const CW = 48, CH = 64; // card texture size in pixels

  // ---- card visual styles ----
  const STYLES = {
    classic: {
      name: 'CLASSIC', cost: 0,
      bg: '#f4e7c8', bg2: '#e8d8b0',
      red: '#d4453a', black: '#2b2540',
      frame: '#b98f3e', frameDark: '#3a2a18',
      accent: '#8a6a2e',
      backA: '#7a1f2b', backB: '#5c1620', backC: '#ffd97a',
    },
    gilded: {
      name: 'GILDED', cost: 150,
      bg: '#fff6df', bg2: '#f7e9c0',
      red: '#b0233a', black: '#1e1440',
      frame: '#ffd97a', frameDark: '#5c3f10',
      accent: '#e0a83c',
      backA: '#2c1d52', backB: '#1a1030', backC: '#ffd97a',
    },
    neon: {
      name: 'NEON', cost: 300,
      bg: '#14102a', bg2: '#1c1638',
      red: '#ff4d88', black: '#4dffd2',
      frame: '#b16cff', frameDark: '#0a0618',
      accent: '#6c4dff',
      backA: '#12102a', backB: '#0a0618', backC: '#ff4d88',
    },
    void: {
      name: 'VOID', cost: 500,
      bg: '#23232c', bg2: '#1b1b23',
      red: '#e8e8f0', black: '#a0a0b4',
      frame: '#6a6a7a', frameDark: '#0e0e14',
      accent: '#8a8a9a',
      backA: '#2a2a34', backB: '#17171f', backC: '#e8e8f0',
    },
  };

  const AWAKEN_COLORS = ['', '#a78bfa', '#ffd97a']; // tier 1 purple, tier 2 gold
  const tierOf = lv => (lv >= 10 ? 2 : lv >= 5 ? 1 : 0);

  // ---- 3x5 pixel glyphs for ranks ----
  const GLYPHS = {
    '0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
    '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
    '2': ['XXX', '..X', 'XXX', 'X..', 'XXX'],
    '3': ['XXX', '..X', '.XX', '..X', 'XXX'],
    '4': ['X.X', 'X.X', 'XXX', '..X', '..X'],
    '5': ['XXX', 'X..', 'XXX', '..X', 'XXX'],
    '6': ['XXX', 'X..', 'XXX', 'X.X', 'XXX'],
    '7': ['XXX', '..X', '..X', '.X.', '.X.'],
    '8': ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
    '9': ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
    'J': ['..X', '..X', '..X', 'X.X', '.X.'],
    'Q': ['XXX', 'X.X', 'X.X', 'XXX', '..X'],
    'K': ['X.X', 'XX.', 'X..', 'XX.', 'X.X'],
    'A': ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  };

  // ---- 7x8 pixel suit shapes ----
  const SUIT_PIX = {
    H: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...', '.......'],
    D: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...', '.......'],
    C: ['..XXX..', '.XXXXX.', 'XX.X.XX', 'XXXXXXX', 'XX.X.XX', '..XXX..', '...X...', '..XXX..'],
    S: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '...X...', '..XXX..'],
  };

  function drawPix(ctx, rows, x, y, scale, color) {
    ctx.fillStyle = color;
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (rows[r][c] === 'X') ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
      }
    }
  }

  function drawGlyphText(ctx, str, x, y, scale, color) {
    let cx = x;
    for (const ch of str) {
      const g = GLYPHS[ch];
      if (g) { drawPix(ctx, g, cx, y, scale, color); cx += 4 * scale; }
    }
    return cx - x;
  }

  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return [c, ctx];
  }

  // ---- card face ----
  const faceCache = new Map();
  function cardCanvas(id, styleId, lv) {
    lv = lv || 1;
    const tier = tierOf(lv);
    const key = id + '|' + styleId + '|' + lv;
    if (faceCache.has(key)) return faceCache.get(key);

    const st = STYLES[styleId] || STYLES.classic;
    const suit = id[0];
    const rank = id.slice(1);
    const isRed = suit === 'H' || suit === 'D';
    const col = isRed ? st.red : st.black;
    const [cv, ctx] = mkCanvas(CW, CH);

    // background + subtle texture
    ctx.fillStyle = st.bg; ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = st.bg2;
    for (let y = 0; y < CH; y += 4)
      for (let x = (y / 4) % 2 * 2; x < CW; x += 6)
        ctx.fillRect(x, y, 1, 1);

    // frame
    ctx.fillStyle = st.frameDark;
    ctx.fillRect(0, 0, CW, 1); ctx.fillRect(0, CH - 1, CW, 1);
    ctx.fillRect(0, 0, 1, CH); ctx.fillRect(CW - 1, 0, 1, CH);
    const frameCol = tier > 0 ? AWAKEN_COLORS[tier] : st.frame;
    ctx.fillStyle = frameCol;
    ctx.fillRect(1, 1, CW - 2, 1); ctx.fillRect(1, CH - 2, CW - 2, 1);
    ctx.fillRect(1, 1, 1, CH - 2); ctx.fillRect(CW - 2, 1, 1, CH - 2);
    if (tier === 2) { // transcendent: double gold frame
      ctx.fillRect(3, 3, CW - 6, 1); ctx.fillRect(3, CH - 4, CW - 6, 1);
      ctx.fillRect(3, 3, 1, CH - 6); ctx.fillRect(CW - 4, 3, 1, CH - 6);
    }

    // corner rank + suit (top-left)
    drawGlyphText(ctx, rank, 4, 4, 2, col);
    drawPix(ctx, SUIT_PIX[suit], 4, 16, 1, col);

    // center: halo for awakened, radiant for ace, then big suit
    const cx0 = (CW - 28) / 2, cy0 = 22;
    if (tier > 0) {
      ctx.fillStyle = AWAKEN_COLORS[tier];
      ctx.globalAlpha = 0.35;
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const px = Math.round(CW / 2 + Math.cos(ang) * 17);
        const py = Math.round(cy0 + 15 + Math.sin(ang) * 17);
        ctx.fillRect(px, py, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (rank === 'A') {
      ctx.fillStyle = st.accent;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 + 0.39;
        const px = Math.round(CW / 2 + Math.cos(ang) * 13) - 1;
        const py = Math.round(cy0 + 15 + Math.sin(ang) * 13) - 1;
        ctx.fillRect(px, py, 2, 2);
      }
    }
    drawPix(ctx, SUIT_PIX[suit], cx0, cy0, 4, col);

    // face-card ornaments
    if (rank === 'K') { // crown
      drawPix(ctx, ['X.X.X', 'XXXXX', 'XXXXX'], CW / 2 - 5, cy0 - 8, 2, st.accent);
    } else if (rank === 'Q') { // tiara
      drawPix(ctx, ['.X.X.', 'XXXXX'], CW / 2 - 5, cy0 - 6, 2, st.accent);
    } else if (rank === 'J') { // plume
      drawPix(ctx, ['..X', '.X.', 'X..'], CW / 2 - 3, cy0 - 7, 2, st.accent);
    }

    // corner rank + suit (bottom-right, rotated)
    ctx.save();
    ctx.translate(CW, CH); ctx.rotate(Math.PI);
    drawGlyphText(ctx, rank, 4, 4, 2, col);
    drawPix(ctx, SUIT_PIX[suit], 4, 16, 1, col);
    ctx.restore();

    // level pips along the bottom
    if (lv > 1) {
      const n = Math.min(lv, 10);
      const w = n * 3 - 1;
      let px = Math.round((CW - w) / 2);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i < 4 ? st.frame : (i < 9 ? (AWAKEN_COLORS[1]) : AWAKEN_COLORS[2]);
        ctx.fillRect(px, CH - 5, 2, 2);
        px += 3;
      }
    }

    faceCache.set(key, cv);
    return cv;
  }

  // ---- card back ----
  const backCache = new Map();
  function backCanvas(styleId) {
    if (backCache.has(styleId)) return backCache.get(styleId);
    const st = STYLES[styleId] || STYLES.classic;
    const [cv, ctx] = mkCanvas(CW, CH);
    ctx.fillStyle = st.backB; ctx.fillRect(0, 0, CW, CH);
    // diamond lattice
    ctx.fillStyle = st.backA;
    for (let y = 0; y < CH; y += 8)
      for (let x = 0; x < CW; x += 8) {
        drawPix(ctx, ['.X.', 'XXX', '.X.'], x + ((y / 8) % 2) * 4, y, 2, st.backA);
      }
    // frame
    ctx.fillStyle = st.frameDark;
    ctx.fillRect(0, 0, CW, 1); ctx.fillRect(0, CH - 1, CW, 1);
    ctx.fillRect(0, 0, 1, CH); ctx.fillRect(CW - 1, 0, 1, CH);
    ctx.fillStyle = st.backC;
    ctx.fillRect(1, 1, CW - 2, 1); ctx.fillRect(1, CH - 2, CW - 2, 1);
    ctx.fillRect(1, 1, 1, CH - 2); ctx.fillRect(CW - 2, 1, 1, CH - 2);
    // central halo cross emblem
    const mx = CW / 2, my = CH / 2;
    ctx.fillStyle = st.backC;
    ctx.fillRect(mx - 1, my - 12, 2, 24);
    ctx.fillRect(mx - 8, my - 5, 16, 2);
    ctx.globalAlpha = 0.6;
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      ctx.fillRect(Math.round(mx + Math.cos(ang) * 14) - 1, Math.round(my + Math.sin(ang) * 14) - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    backCache.set(styleId, cv);
    return cv;
  }

  // ---- THREE textures ----
  const texCache = new Map();
  function canvasTexture(cv, key) {
    if (texCache.has(key)) return texCache.get(key);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    texCache.set(key, t);
    return t;
  }
  const getCardTexture = (id, styleId, lv) => canvasTexture(cardCanvas(id, styleId, lv), 'f|' + id + '|' + styleId + '|' + (lv || 1));
  const getBackTexture = styleId => canvasTexture(backCanvas(styleId), 'b|' + styleId);

  // UI-scaled copy for DOM
  function uiCardCanvas(id, styleId, lv, scale) {
    scale = scale || 2;
    const src = cardCanvas(id, styleId, lv);
    const [cv, ctx] = mkCanvas(CW * scale, CH * scale);
    ctx.drawImage(src, 0, 0, CW * scale, CH * scale);
    return cv;
  }
  function uiBackCanvas(styleId, scale) {
    scale = scale || 2;
    const src = backCanvas(styleId);
    const [cv, ctx] = mkCanvas(CW * scale, CH * scale);
    ctx.drawImage(src, 0, 0, CW * scale, CH * scale);
    return cv;
  }

  // ---- table felt ----
  function makeTableTexture() {
    const S = 256;
    const [cv, ctx] = mkCanvas(S, S);
    ctx.fillStyle = '#1c1038'; ctx.fillRect(0, 0, S, S);
    // mottled felt noise
    const rnd = HP.util.mulberry32(777);
    for (let i = 0; i < 2600; i++) {
      const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S);
      ctx.fillStyle = rnd() > 0.5 ? '#221448' : '#180d30';
      ctx.fillRect(x, y, 2, 2);
    }
    // gold pinstripe border
    ctx.strokeStyle = '#b98f3e'; ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, S - 20, S - 20);
    ctx.strokeStyle = '#5c3f10'; ctx.lineWidth = 1;
    ctx.strokeRect(14, 14, S - 28, S - 28);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
  }

  // ---- centered halo emblem decal for the table ----
  function makeEmblemTexture() {
    const S = 128;
    const [cv, ctx] = mkCanvas(S, S);
    ctx.strokeStyle = '#ffd97a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, 46, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd97a';
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      ctx.fillRect(S / 2 + Math.cos(ang) * 56 - 2, S / 2 + Math.sin(ang) * 56 - 2, 4, 4);
    }
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
  }

  // ---- stained glass rose window ----
  function makeRoseTexture() {
    const S = 256;
    const [cv, ctx] = mkCanvas(S, S);
    const cx = S / 2, cy = S / 2;
    const cols = ['#6d4dd4', '#a78bfa', '#3d7db0', '#7a1f2b', '#b98f3e', '#2c5c8a'];
    const rnd = HP.util.mulberry32(1234);
    // radial petals
    for (let ring = 0; ring < 4; ring++) {
      const r0 = 22 + ring * 26, r1 = r0 + 24;
      const segs = 8 + ring * 4;
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 0.92) / segs) * Math.PI * 2;
        ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
        ctx.beginPath();
        ctx.arc(cx, cy, r1, a0, a1);
        ctx.arc(cx, cy, r0, a1, a0, true);
        ctx.closePath(); ctx.fill();
      }
    }
    // center core
    ctx.fillStyle = '#ffd97a';
    ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff6df';
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
    // lead lines
    ctx.strokeStyle = '#0a0618'; ctx.lineWidth = 3;
    for (let ring = 0; ring < 5; ring++) {
      ctx.beginPath(); ctx.arc(cx, cy, 22 + ring * 26, 0, Math.PI * 2); ctx.stroke();
    }
    // pixelate: downscale then upscale
    const [small, sctx] = mkCanvas(64, 64);
    sctx.drawImage(cv, 0, 0, 64, 64);
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(small, 0, 0, S, S);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
  }

  // ---- soft glow sprite ----
  // cached by color: FX sprites share these, so callers must NEVER dispose
  // the returned texture (materials yes, .map no) — this closed a GPU leak
  // where every burst/pulse/ring created a fresh CanvasTexture.
  function makeGlowTexture(color) {
    const key = 'glow|' + color;
    if (texCache.has(key)) return texCache.get(key);
    const S = 64;
    const [cv, ctx] = mkCanvas(S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
    g.addColorStop(0, color);
    g.addColorStop(0.5, color + '55');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(cv);
    texCache.set(key, t);
    return t;
  }

  // ---- tiny square particle (cached by color, see note above) ----
  function makeSquareTexture(color) {
    const key = 'sq|' + color;
    if (texCache.has(key)) return texCache.get(key);
    const [cv, ctx] = mkCanvas(8, 8);
    ctx.fillStyle = color; ctx.fillRect(1, 1, 6, 6);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    texCache.set(key, t);
    return t;
  }

  return {
    STYLES, CW, CH, tierOf,
    cardCanvas, backCanvas, getCardTexture, getBackTexture,
    uiCardCanvas, uiBackCanvas,
    makeTableTexture, makeRoseTexture, makeGlowTexture, makeSquareTexture, makeEmblemTexture,
  };
})();
