// ============ HOLY POKER — procedural pixel UI chrome ============
// Generates 9-slice frames, buttons, ribbons, plates and cursors as data URLs
// and publishes them as CSS custom properties. No image assets, all hand-pixeled.
window.HP = window.HP || {};

HP.uiart = (function () {
  const S = 2; // device pixels per art pixel

  const PAL = {
    outline: '#0a0618',
    goldBright: '#fff2c8', gold: '#ffd97a', goldDim: '#b98f3e', goldDark: '#5c3f10',
    purpleHi: '#8a6ab0', purpleLt: '#4a3670', purple: '#2c1d52', purpleDk: '#1a1030',
    voidFill: '#0f0a20',
  };

  function mk(wArt, hArt) {
    const c = document.createElement('canvas');
    c.width = wArt * S; c.height = hArt * S;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return [c, ctx];
  }
  // draw one art pixel
  function px(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x * S, y * S, (w || 1) * S, (h || 1) * S);
  }
  // hollow rect ring in art pixels
  function ring(ctx, x, y, w, h, col) {
    px(ctx, x, y, w, 1, col);
    px(ctx, x, y + h - 1, w, 1, col);
    px(ctx, x, y, 1, h, col);
    px(ctx, x + w - 1, y, 1, h, col);
  }
  function clearPx(ctx, x, y, w, h) {
    ctx.clearRect(x * S, y * S, (w || 1) * S, (h || 1) * S);
  }
  // chamfer all four corners by n steps
  function chamfer(ctx, wArt, hArt, n) {
    for (let r = 0; r < n; r++) {
      const cut = n - r;
      clearPx(ctx, 0, r, cut, 1);
      clearPx(ctx, wArt - cut, r, cut, 1);
      clearPx(ctx, 0, hArt - 1 - r, cut, 1);
      clearPx(ctx, wArt - cut, hArt - 1 - r, cut, 1);
    }
  }
  const url = c => `url("${c.toDataURL('image/png')}")`;

  // ---------- ornate panel frame (34x34 art, border 11) ----------
  function makeFrame() {
    const N = 34;
    const [c, ctx] = mk(N, N);
    ring(ctx, 0, 0, N, N, PAL.outline);
    ring(ctx, 1, 1, N - 2, N - 2, PAL.goldDim);
    ring(ctx, 2, 2, N - 4, N - 4, PAL.gold);
    ring(ctx, 3, 3, N - 6, N - 6, PAL.gold);
    ring(ctx, 4, 4, N - 8, N - 8, PAL.goldDark);
    ring(ctx, 5, 5, N - 10, N - 10, PAL.outline);
    ring(ctx, 6, 6, N - 12, N - 12, PAL.purpleLt);
    ring(ctx, 7, 7, N - 14, N - 14, PAL.purple);
    ring(ctx, 8, 8, N - 16, N - 16, PAL.outline);
    // interior fill (used with border-image 'fill' so no gap shows behind the frame)
    px(ctx, 9, 9, N - 18, N - 18, 'rgba(13, 8, 26, 0.92)');
    chamfer(ctx, N, N, 3);
    // corner gems: diamond at each corner over the gold band
    const gem = (gx, gy) => {
      for (let d = -3; d <= 3; d++) {
        const w = 3 - Math.abs(d);
        px(ctx, gx - w, gy + d, w * 2 + 1, 1, PAL.outline);
      }
      for (let d = -2; d <= 2; d++) {
        const w = 2 - Math.abs(d);
        px(ctx, gx - w, gy + d, w * 2 + 1, 1, d < 0 ? PAL.gold : PAL.goldDim);
      }
      px(ctx, gx, gy - 1, 1, 1, PAL.goldBright);
    };
    gem(5, 5); gem(N - 6, 5); gem(5, N - 6); gem(N - 6, N - 6);
    return url(c);
  }

  // ---------- simple plate (18x18 art, border 6) ----------
  function makePlate(edge, edgeDark) {
    const N = 18;
    const [c, ctx] = mk(N, N);
    ring(ctx, 0, 0, N, N, PAL.outline);
    ring(ctx, 1, 1, N - 2, N - 2, edge);
    ring(ctx, 2, 2, N - 4, N - 4, edgeDark);
    ring(ctx, 3, 3, N - 6, N - 6, PAL.outline);
    px(ctx, 4, 4, N - 8, N - 8, 'rgba(16, 10, 34, 0.9)');
    chamfer(ctx, N, N, 2);
    return url(c);
  }

  // ---------- beveled button (22x22 art, border 7, filled) ----------
  function makeButton(p) {
    const N = 22;
    const [c, ctx] = mk(N, N);
    // body fill: vertical light->dark bands
    px(ctx, 1, 1, N - 2, Math.floor(N / 2) - 1, p.light);
    px(ctx, 1, Math.floor(N / 2), N - 2, Math.floor(N / 2) - 3, p.mid);
    px(ctx, 1, N - 4, N - 2, 3, p.dark);
    // bevel rim
    px(ctx, 1, 1, N - 2, 1, p.hi);          // top highlight
    px(ctx, 1, 1, 1, N - 2, p.hi);          // left highlight
    px(ctx, 1, N - 2, N - 2, 1, p.dark);    // bottom shade
    px(ctx, N - 2, 1, 1, N - 2, p.dark);    // right shade
    px(ctx, 2, 2, N - 4, 1, p.light);
    // outline
    ring(ctx, 0, 0, N, N, PAL.outline);
    chamfer(ctx, N, N, 2);
    // re-outline the chamfer steps
    for (const [x, y] of [[2, 0], [N - 3, 0], [2, N - 1], [N - 3, N - 1], [0, 2], [0, N - 3], [N - 1, 2], [N - 1, N - 3], [1, 1], [N - 2, 1], [1, N - 2], [N - 2, N - 2]]) {
      px(ctx, x, y, 1, 1, PAL.outline);
    }
    return url(c);
  }

  // ---------- title ribbon (44x20 art; slice l/r 14, t/b 8, filled) ----------
  function makeRibbon() {
    const W = 44, H = 20;
    const [c, ctx] = mk(W, H);
    // body
    px(ctx, 4, 2, W - 8, H - 4, PAL.purple);
    px(ctx, 4, 2, W - 8, 2, PAL.purpleLt);
    // top / bottom gold trim
    px(ctx, 4, 1, W - 8, 1, PAL.goldDim);
    px(ctx, 4, H - 2, W - 8, 1, PAL.goldDim);
    px(ctx, 4, 0, W - 8, 1, PAL.outline);
    px(ctx, 4, H - 1, W - 8, 1, PAL.outline);
    // pointed ends (folded tails)
    const tail = (leftSide) => {
      for (let r = 0; r < H; r++) {
        const depth = Math.abs(r - (H / 2 - 0.5)); // 0 center .. ~9 edge
        const inset = Math.max(0, Math.round(4 - depth * 0.55));
        const w = 4 - inset;
        if (w <= 0) continue;
        const x = leftSide ? inset : W - inset - w;
        px(ctx, x, r, w, 1, r < 2 || r > H - 3 ? PAL.outline : (r < H / 2 ? PAL.purpleLt : PAL.purpleDk));
        px(ctx, leftSide ? inset : W - inset - 1, r, 1, 1, PAL.goldDim);
      }
    };
    tail(true); tail(false);
    // stitch dots along center band
    for (let x = 6; x < W - 6; x += 4) {
      px(ctx, x, 2, 1, 1, PAL.goldDark);
      px(ctx, x, H - 3, 1, 1, PAL.goldDark);
    }
    return url(c);
  }

  // ---------- pixel cursors ----------
  const ARROW = [
    'X..........',
    'XX.........',
    'X#X........',
    'X##X.......',
    'X###X......',
    'X####X.....',
    'X#####X....',
    'X######X...',
    'X#######X..',
    'X########X.',
    'X####XXXXX.',
    'X##X#X.....',
    'X#X.X#X....',
    'XX..X#X....',
    '.....X#X...',
    '.....XX....',
  ];
  function makeCursor(fill, shade) {
    const [c, ctx] = mk(11, 16);
    ARROW.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === 'X') px(ctx, x, y, 1, 1, PAL.outline);
        else if (row[x] === '#') px(ctx, x, y, 1, 1, x > y * 0.55 ? shade : fill);
      }
    });
    return c.toDataURL('image/png');
  }

  // ---------- publish as CSS custom properties ----------
  function inject() {
    const r = document.documentElement.style;
    r.setProperty('--uiFrame', makeFrame());
    r.setProperty('--uiPlate', makePlate('#3a2a60', '#241646'));
    r.setProperty('--uiPlateGold', makePlate(PAL.gold, PAL.goldDim));
    r.setProperty('--uiPlateBlue', makePlate('#3d7db0', '#1e3c5c'));
    r.setProperty('--uiPlateRed', makePlate('#a04058', '#5c1620'));
    r.setProperty('--uiPlatePurple', makePlate('#6d4dd4', '#3c2483'));
    r.setProperty('--uiBtn', makeButton({ hi: PAL.purpleHi, light: PAL.purpleLt, mid: '#33245c', dark: PAL.purpleDk }));
    r.setProperty('--uiBtnGold', makeButton({ hi: PAL.goldBright, light: '#d4a94e', mid: '#a3762c', dark: '#6e4c14' }));
    r.setProperty('--uiBtnBlue', makeButton({ hi: '#b8e0ff', light: '#2e6e9e', mid: '#1e4a70', dark: '#122c44' }));
    r.setProperty('--uiBtnRed', makeButton({ hi: '#ff9fae', light: '#8a2c40', mid: '#5c1928', dark: '#380e18' }));
    r.setProperty('--uiRibbon', makeRibbon());
    r.setProperty('--curDefault', `url("${makeCursor('#f4e7c8', '#c9b68a')}") 1 1, auto`);
    r.setProperty('--curPoint', `url("${makeCursor(PAL.gold, PAL.goldDim)}") 1 1, pointer`);
  }

  inject();
  return { inject };
})();
