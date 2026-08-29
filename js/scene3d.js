// ============ HOLY POKER — 3D scene (Three.js, pixelated render) ============
window.HP = window.HP || {};

HP.scene = (function () {
  const U = HP.util;
  let renderer, scene, camera, canvas;
  let tableMesh, motes = [], rays = [], roseMesh;
  let raycaster, pointer = new THREE.Vector2(-2, -2), pointerPx = { x: 0, y: 0 };
  const parallax = { x: 0, y: 0 }; // eases toward pointer; stays centered until real input (touch devices)
  let shakeAmp = 0;
  let camBase = new THREE.Vector3(0, 6.4, 8.6);
  let camLook = new THREE.Vector3(0, 0.6, 0);
  let mode = 'menu'; // 'menu' | 'game'
  let interactive = false;
  let hoveredId = null;
  let lastTime = 0;
  let showcase = [];

  const CARD_W = 1.3, CARD_H = 1.3 * 4 / 3;
  const TILT = -0.46; // resting x-tilt of cards on the table
  // one geometry for every card face/back ever made — plane geometry never
  // varies, and per-card geometries were leaking GPU buffers each deal
  let CARD_GEO = null;
  const cardGeo = () => (CARD_GEO || (CARD_GEO = new THREE.PlaneGeometry(CARD_W, CARD_H)));

  // touch devices with small screens get bigger cards
  function isMobileView() {
    return window.matchMedia('(pointer: coarse)').matches &&
      Math.min(window.innerWidth, window.innerHeight) < 520;
  }
  function cardScale() { return isMobileView() ? 1.16 : 1; }
  // lowest y the card center may sit so the tilted bottom edge (plus bob/FX
  // slack) never dips through the table — this was the ground-clip bug
  function handY(s) { return 0.16 + Math.cos(TILT) * (CARD_H / 2) * s + 0.08; }
  function playedY(s) { return handY(s) + 0.12; }

  // id -> {root, inner, front, back, glow, state, selected, hoverT, selT,
  //        punchT, push, fx:{sx,sy,hop}, home, phase, moveTw}
  const cards = new Map();
  let handOrder = []; // display order of the hand, as given by game logic (respects sort)

  const api = {
    onCardClick: null,
    onHoverChange: null,
    onReorder: null,
  };

  function activeStyle() { return HP.save.meta.styles.active; }
  function cardLv(id) { return HP.save.card(id).lv; }

  // ---------- init ----------
  function init(cv) {
    canvas = cv;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0618);
    scene.fog = new THREE.Fog(0x0a0618, 17, 34);

    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.copy(camBase);
    camera.lookAt(camLook);

    // lights
    const amb = new THREE.AmbientLight(0xbfb0e8, 0.75);
    scene.add(amb);
    const key = new THREE.DirectionalLight(0xfff2cf, 1.0);
    key.position.set(3, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -12; key.shadow.camera.right = 12;
    key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8b5cf6, 0.5);
    rim.position.set(-6, 4, -6);
    scene.add(rim);

    // table
    const tableTex = HP.art.makeTableTexture();
    tableTex.wrapS = tableTex.wrapT = THREE.RepeatWrapping;
    tableTex.repeat.set(3, 2);
    tableMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 22),
      new THREE.MeshLambertMaterial({ map: tableTex })
    );
    tableMesh.rotation.x = -Math.PI / 2;
    tableMesh.position.y = -0.02;
    tableMesh.receiveShadow = true;
    scene.add(tableMesh);

    // centered halo emblem decal
    const emblem = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({ map: HP.art.makeEmblemTexture(), transparent: true, opacity: 0.35, depthWrite: false })
    );
    emblem.rotation.x = -Math.PI / 2;
    emblem.position.set(0, 0.005, 1.1);
    scene.add(emblem);

    // rose window
    roseMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: HP.art.makeRoseTexture(), transparent: true, fog: false })
    );
    roseMesh.position.set(0, 6.2, -13);
    scene.add(roseMesh);
    const roseGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: HP.art.makeGlowTexture('#a78bfa'), transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    roseGlow.scale.set(15, 15, 1);
    roseGlow.position.set(0, 6.2, -13.5);
    scene.add(roseGlow);

    // light rays from the window
    for (let i = 0; i < 5; i++) {
      const ray = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9 + i * 0.35, 24),
        new THREE.MeshBasicMaterial({
          color: 0xffe9b0, transparent: true, opacity: 0.07,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
        })
      );
      ray.position.set(0, 6.2, -12.5);
      ray.geometry.translate(0, -12, 0);
      ray.rotation.z = (i - 2) * 0.24;
      ray.rotation.x = 0.32;
      ray.userData.baseZ = ray.rotation.z;
      ray.userData.speed = 0.13 + i * 0.05;
      rays.push(ray);
      scene.add(ray);
    }

    // dust motes
    const moteDefs = [
      { color: '#ffd97a', count: 70, size: 0.09 },
      { color: '#a78bfa', count: 50, size: 0.07 },
    ];
    for (const def of moteDefs) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(def.count * 3);
      const spd = [];
      for (let i = 0; i < def.count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 24;
        pos[i * 3 + 1] = Math.random() * 9;
        pos[i * 3 + 2] = -13 + Math.random() * 19;
        spd.push(0.1 + Math.random() * 0.25);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        map: HP.art.makeSquareTexture(def.color), size: def.size,
        transparent: true, opacity: 0.55, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true,
      }));
      pts.userData.speeds = spd;
      motes.push(pts);
      scene.add(pts);
    }

    // deck stack visual
    const backTex = HP.art.getBackTexture(activeStyle());
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(
        cardGeo(),
        new THREE.MeshLambertMaterial({ map: backTex })
      );
      m.rotation.x = -Math.PI / 2 + 0.06;
      m.position.set(deckPos.x, 0.03 + i * 0.025, deckPos.z);
      m.name = 'deckstack';
      scene.add(m);
    }

    raycaster = new THREE.Raycaster();

    window.addEventListener('resize', applySize);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp); // window: catch releases off-canvas
    window.addEventListener('pointercancel', onPointerCancel);
    applySize();
    requestAnimationFrame(loop);
  }

  const deckPos = { x: 6.1, y: 0.9, z: 3.3 };

  function applySize() {
    const div = HP.save.meta.settings.pixel || 3;
    // divide PHYSICAL pixels, not CSS pixels — phones pack ~3x DPR into few CSS
    // pixels, and dividing those left the framebuffer so small that card
    // textures were minified into mush. Cards must always be magnified.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let fbw = window.innerWidth * dpr / div;
    const minW = Math.min(window.innerWidth * dpr, 560); // readability floor
    if (fbw < minW) fbw = minW;
    if (fbw > 1920) fbw = 1920; // perf cap
    const scale = fbw / window.innerWidth;
    renderer.setSize(Math.max(2, Math.floor(window.innerWidth * scale)),
                     Math.max(2, Math.floor(window.innerHeight * scale)), false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    // card size can change when crossing the mobile threshold / rotating
    const s = cardScale();
    for (const [, e] of cards) e.root.scale.setScalar(s);
    for (const p of showcase) p.root.scale.setScalar(s);
    scene && scene.traverse(o => { if (o.name === 'deckstack') o.scale.setScalar(s); });
    if (mode === 'game' && cards.size) layoutHand(false);
  }

  // ---------- card meshes ----------
  function makeCardMesh(id) {
    const style = activeStyle();
    const root = new THREE.Group();
    const inner = new THREE.Group();
    root.add(inner);
    root.scale.setScalar(cardScale());

    const front = new THREE.Mesh(
      cardGeo(),
      new THREE.MeshLambertMaterial({ map: HP.art.getCardTexture(id, style, cardLv(id)), transparent: true })
    );
    front.castShadow = true;
    front.userData.cardId = id;
    const back = new THREE.Mesh(
      cardGeo(),
      new THREE.MeshLambertMaterial({ map: HP.art.getBackTexture(style), transparent: true })
    );
    back.rotation.y = Math.PI;
    back.position.z = -0.004;
    inner.add(front); inner.add(back);

    // awakened glow sprite
    const tier = HP.art.tierOf(cardLv(id));
    let glow = null;
    if (tier > 0) {
      glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: HP.art.makeGlowTexture(tier === 2 ? '#ffd97a' : '#a78bfa'),
        transparent: true, opacity: tier === 2 ? 0.5 : 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.set(2.7, 3.2, 1);
      glow.position.z = -0.05;
      inner.add(glow);
    }
    scene.add(root);
    return { root, inner, front, back, glow };
  }

  function setCardOpacity(e, v) {
    e.front.material.opacity = v;
    e.back.material.opacity = v;
    if (e.glow) e.glow.material.opacity = Math.min(e.glow.material.opacity, v * 0.5);
  }

  function refreshCardTexture(id) {
    const e = cards.get(id);
    if (!e) return;
    e.front.material.map = HP.art.getCardTexture(id, activeStyle(), cardLv(id));
    e.front.material.needsUpdate = true;
  }

  // ---------- hand layout ----------
  // kill any in-flight placement tweens for a card, then tween it to a pose.
  // exactly ONE owner of root position/rotation at a time.
  function moveTo(e, h, dur, delay, ease) {
    if (e.moveTw) e.moveTw.forEach(U.killTween);
    e.moveTw = [
      U.tweenProps(e.root.position, { x: h.x, y: h.y, z: h.z }, { dur, delay, ease: ease || 'outCubic' }),
      U.tweenProps(e.root.rotation, { x: h.rx, y: h.ry, z: h.rz }, { dur, delay, ease: ease || 'outCubic' }),
    ];
  }

  // deal flight: parabolic arc from the deck with a flip and a settle wobble
  function dealTo(e, h, delay) {
    if (e.moveTw) e.moveTw.forEach(U.killTween);
    e.root.position.set(deckPos.x, deckPos.y, deckPos.z);
    e.root.rotation.set(TILT, Math.PI, 0.25);
    const from = { x: deckPos.x, y: deckPos.y, z: deckPos.z };
    e.moveTw = [
      U.tween({
        dur: 0.4, delay, ease: 'outCubic',
        onUpdate: t => {
          e.root.position.x = U.lerp(from.x, h.x, t);
          e.root.position.z = U.lerp(from.z, h.z, t);
          e.root.position.y = U.lerp(from.y, h.y, t) + Math.sin(t * Math.PI) * 0.55;
          e.root.rotation.y = U.lerp(Math.PI, h.ry, t);
        },
      }),
      U.tweenProps(e.root.rotation, { x: h.rx, z: h.rz }, { dur: 0.5, delay, ease: 'outBack' }),
    ];
  }

  function handIdsInOrder() {
    return handOrder.filter(id => cards.has(id) && cards.get(id).state === 'hand');
  }

  // widescreen viewports have far more horizontal room at the hand plane —
  // spread the fan out there so cards overlap less (esp. landscape phones)
  function handSpan() {
    return (window.innerWidth / window.innerHeight) > 1.6 ? 10.6 : 8.6;
  }

  // assign arc homes to every hand card, in handOrder — does not move anything
  function computeHomes() {
    const ids = handIdsInOrder();
    const n = ids.length;
    if (n === 0) return;
    const s = cardScale();
    const spacing = Math.min(1.34 * s, handSpan() / n); // big hands overlap more instead of clipping the screen
    const baseY = handY(s);
    ids.forEach((id, i) => {
      const off = i - (n - 1) / 2;
      cards.get(id).home = {
        x: off * spacing,
        y: baseY + -Math.abs(off) * 0.02,
        z: 3.55 + i * 0.015, // later cards stack slightly on top, classic fan
        rx: TILT,
        ry: 0,
        rz: -off * 0.04,
      };
    });
  }

  function layoutHand(animate) {
    computeHomes();
    for (const id of handIdsInOrder()) {
      if (drag && id === drag.id) continue; // the player's finger owns this card
      const e = cards.get(id);
      if (animate) moveTo(e, e.home, 0.28, 0);
      else {
        if (e.moveTw) { e.moveTw.forEach(U.killTween); e.moveTw = null; }
        e.root.position.set(e.home.x, e.home.y, e.home.z);
        e.root.rotation.set(e.home.rx, e.home.ry, e.home.rz);
      }
    }
  }

  // reconcile scene with the game's hand: deal missing cards from the deck,
  // slide existing cards into their (possibly re-sorted) slots
  async function syncHand(handIds) {
    handOrder = [...handIds];
    const newIds = handIds.filter(id => !cards.has(id));
    for (const id of newIds) {
      const parts = makeCardMesh(id);
      cards.set(id, {
        ...parts, state: 'hand', selected: false, hoverT: 0, selT: 0,
        punchT: 0, push: 0, fx: { sx: 1, sy: 1, hop: 0 },
        home: null, phase: Math.random() * Math.PI * 2, moveTw: null,
      });
    }
    computeHomes();
    for (const id of handIdsInOrder()) {
      const e = cards.get(id);
      if (newIds.includes(id)) {
        const i = newIds.indexOf(id);
        dealTo(e, e.home, i * 0.07);
        setTimeout(() => HP.audio.sfx('deal'), i * 70);
      } else {
        moveTo(e, e.home, 0.28, 0);
      }
    }
    repositionBadges();
    await U.wait(newIds.length * 70 + 420);
  }

  // small pixel plaque above a selected card: "[+8 CHIPS]" etc.
  function makeBadgeSprite(id) {
    const lv = cardLv(id);
    const label = HP.cards.shortAbility(id, lv);
    const color = HP.cards.SUIT_INFO[id[0]].color;
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 56;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.font = '19px PressStart, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.min(248, Math.ceil(ctx.measureText(label).width) + 26);
    const x0 = Math.floor((256 - w) / 2);
    ctx.fillStyle = 'rgba(10, 6, 24, 0.94)';
    ctx.fillRect(x0, 6, w, 44);
    ctx.fillStyle = color;
    ctx.fillRect(x0, 6, w, 3); ctx.fillRect(x0, 47, w, 3);
    ctx.fillRect(x0, 6, 3, 44); ctx.fillRect(x0 + w - 3, 6, 3, 44);
    ctx.fillStyle = color;
    ctx.fillText(label, 128, 29);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    spr.scale.set(1.42, 1.42 * 56 / 256, 1);
    // alternate badge rows so neighboring selections never overlap each other
    const row = Math.max(0, handOrder.indexOf(id)) % 2;
    spr.position.set(0, CARD_H / 2 + 0.26 + row * 0.4, 0.15);
    return spr;
  }

  // badges alternate two heights by hand index so neighbors never overlap;
  // reorders change indices, so re-derive rows from the live order
  function repositionBadges() {
    const ids = handIdsInOrder();
    ids.forEach((id, i) => {
      const e = cards.get(id);
      if (e && e.badge) e.badge.position.y = CARD_H / 2 + 0.26 + (i % 2) * 0.4;
    });
  }

  function clearBadge(e) {
    if (!e.badge) return;
    e.inner.remove(e.badge);
    e.badge.material.map.dispose();
    e.badge.material.dispose();
    e.badge = null;
  }

  function setSelected(selectedIds) {
    for (const [id, e] of cards) {
      if (e.state !== 'hand') continue;
      const want = selectedIds.has(id);
      if (want !== e.selected) {
        e.punchT = 1; // pop on any toggle
        if (want) {
          clearBadge(e);
          e.badge = makeBadgeSprite(id);
          e.inner.add(e.badge);
          const target = e.badge.scale.clone();
          e.badge.scale.setScalar(0.05);
          U.tweenProps(e.badge.scale, { x: target.x, y: target.y }, { dur: 0.2, ease: 'outBack' });
        } else {
          clearBadge(e);
        }
      }
      e.selected = want;
    }
  }

  function setInteractive(v) {
    interactive = v;
    if (!v && hoveredId) { hoveredId = null; document.body.classList.remove('cur-point'); }
  }

  // ---------- play / score / discard ----------
  async function playCards(ids) {
    const n = ids.length;
    const s = cardScale();
    const spacing = 1.52 * s;
    const toY = playedY(s);
    ids.forEach((id, i) => {
      const e = cards.get(id);
      if (!e) return;
      e.state = 'played';
      e.selected = false;
      clearBadge(e);
      if (e.moveTw) e.moveTw.forEach(U.killTween);
      const from = e.root.position.clone();
      const rz0 = e.root.rotation.z;
      const to = { x: (i - (n - 1) / 2) * spacing, y: toY, z: 0.8 };
      const delay = i * 0.06;
      e.moveTw = [
        U.tween({
          dur: 0.36, delay, ease: 'outCubic',
          onUpdate: t => {
            e.root.position.x = U.lerp(from.x, to.x, t);
            e.root.position.z = U.lerp(from.z, to.z, t);
            e.root.position.y = U.lerp(from.y, to.y, t) + Math.sin(t * Math.PI) * 0.8;
          },
          onComplete: () => { // landing: squash + puff of light
            squashCard(e, 0.14);
            burst(e.root.position.clone(), '#ffe9b0', 5, 0.5);
            HP.audio.sfx('chip', i);
          },
        }),
        U.tweenProps(e.root.rotation, { x: TILT, y: 0, z: 0 }, { dur: 0.34, delay, ease: 'outCubic' }),
      ];
    });
    HP.audio.sfx('play');
    layoutHand(true);
    await U.wait(n * 60 + 440);
  }

  // squash-and-stretch on the inner group via composable fx state
  function squashCard(e, amount) {
    U.tween({
      dur: 0.26, ease: 'outCubic',
      onUpdate: t => {
        const k = Math.sin(t * Math.PI);
        e.fx.sx = 1 + k * amount;
        e.fx.sy = 1 - k * amount * 1.15;
      },
      onComplete: () => { e.fx.sx = 1; e.fx.sy = 1; },
    });
  }

  function pulseCard(id, color) {
    const e = cards.get(id);
    if (!e) return;
    // punch scale + hop (composable — the idle loop multiplies these in)
    U.tween({
      dur: 0.3, ease: 'outCubic',
      onUpdate: t => {
        const k = Math.sin(t * Math.PI);
        e.fx.sx = 1 + k * 0.2;
        e.fx.sy = 1 + k * 0.2;
        e.fx.hop = k * 0.22;
      },
      onComplete: () => { e.fx.sx = 1; e.fx.sy = 1; e.fx.hop = 0; },
    });
    // quick flash sprite
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: HP.art.makeGlowTexture(color || '#ffffff'),
      transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    flash.scale.set(3.0, 3.5, 1);
    flash.position.copy(e.root.position);
    flash.position.z += 0.15;
    scene.add(flash);
    U.tween({
      dur: 0.35, ease: 'outQuad',
      onUpdate: t => { flash.material.opacity = 0.7 * (1 - t); flash.scale.setScalar(3.0 + t * 1.4); },
      onComplete: () => { scene.remove(flash); flash.material.dispose(); },
    });
  }

  // toss a card off the table: arc, tumble, fade
  function flyOut(e, id, delay) {
    e.state = 'gone';
    clearBadge(e);
    if (e.moveTw) { e.moveTw.forEach(U.killTween); e.moveTw = null; }
    const from = e.root.position.clone();
    const r0 = { x: e.root.rotation.x, z: e.root.rotation.z };
    const spinZ = 1.5 + Math.random() * 2.5;
    const spinX = (Math.random() - 0.5) * 1.6;
    const dx = -(8.5 + Math.random() * 2.5);
    e.moveTw = [U.tween({ // registered owner: nothing else may move this card now
      dur: 0.55, delay, ease: 'inCubic',
      onUpdate: t => {
        e.root.position.x = from.x + dx * t;
        e.root.position.y = from.y + 2.1 * t - 2.6 * t * t; // tossed arc
        e.root.rotation.z = r0.z + spinZ * t;
        e.root.rotation.x = r0.x + spinX * t;
        setCardOpacity(e, 1 - Math.max(0, (t - 0.5) / 0.5));
      },
      // only remove OUR entry — a same-id card may have been redealt meanwhile
      onComplete: () => { if (cards.get(id) === e) removeCard(id); },
    })];
  }

  async function discardPlayed() {
    const played = [...cards.entries()].filter(([, e]) => e.state === 'played');
    played.forEach(([id, e], i) => flyOut(e, id, i * 0.05));
    if (played.length) HP.audio.sfx('discard');
    await U.wait(played.length * 50 + 480);
  }

  async function discardCards(ids) {
    ids.forEach((id, i) => {
      const e = cards.get(id);
      if (e) flyOut(e, id, i * 0.05);
    });
    HP.audio.sfx('discard');
    await U.wait(ids.length * 50 + 420);
    layoutHand(true);
  }

  function removeCard(id) {
    const e = cards.get(id);
    if (!e) return;
    clearBadge(e);
    scene.remove(e.root);
    e.front.material.dispose(); e.back.material.dispose();
    if (e.glow) e.glow.material.dispose();
    cards.delete(id);
  }

  function clearAll(animated) {
    if (animated) {
      let i = 0;
      for (const [id, e] of cards) {
        e.state = 'gone'; // stops the idle loop re-lighting the awakened glow mid-fade
        clearBadge(e);
        if (e.moveTw) { e.moveTw.forEach(U.killTween); e.moveTw = null; }
        const from = e.root.position.clone();
        const vx = from.x * 1.4 + (Math.random() - 0.5) * 2;
        const spin = (Math.random() - 0.5) * 5;
        const r0 = e.root.rotation.z;
        e.moveTw = [U.tween({
          dur: 0.55, delay: i * 0.03, ease: 'inCubic',
          onUpdate: t => {
            e.root.position.x = from.x + vx * t;
            e.root.position.y = from.y + 4.2 * t;
            e.root.rotation.z = r0 + spin * t;
            setCardOpacity(e, 1 - Math.max(0, (t - 0.55) / 0.45));
          },
          onComplete: () => { if (cards.get(id) === e) removeCard(id); },
        })];
        i++;
      }
    } else {
      for (const id of [...cards.keys()]) removeCard(id);
    }
  }

  // ---------- FX ----------
  function cardWorldPos(id) {
    const e = cards.get(id);
    if (!e) return new THREE.Vector3(0, 1, 2);
    return e.root.position.clone();
  }

  function floatText(pos, str, color, big) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 80;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.font = big ? '26px PressStart, monospace' : '17px PressStart, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = '#0a0618';
    ctx.strokeText(str, 128, 40);
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(str, 128, 40);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    const scale = big ? 3.4 : 2.4;
    spr.scale.set(0.1, 0.1 * 80 / 256, 1);
    spr.position.copy(pos);
    spr.position.y += 1.3;
    spr.position.z += 0.3;
    spr.position.x += (Math.random() - 0.5) * 0.3;
    scene.add(spr);
    U.tween({ // pop in with overshoot, then drift and fade
      dur: 0.22, ease: 'outBack',
      onUpdate: t => { const k = 0.1 + (scale - 0.1) * t; spr.scale.set(k, k * 80 / 256, 1); },
    });
    U.tween({
      dur: big ? 1.1 : 0.85, ease: 'outCubic',
      onUpdate: t => {
        spr.position.y += 0.012 * (1 - t * 0.5);
        spr.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      },
      onComplete: () => { scene.remove(spr); spr.material.map.dispose(); spr.material.dispose(); },
    });
  }
  const floatTextOnCard = (id, str, color, big) => floatText(cardWorldPos(id), str, color, big);

  function burst(pos, color, count, spread) {
    const tex = HP.art.makeSquareTexture(color);
    for (let i = 0; i < (count || 14); i++) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      const sz = 0.1 + Math.random() * 0.14;
      spr.scale.set(sz, sz, 1);
      spr.position.copy(pos);
      scene.add(spr);
      const ang = Math.random() * Math.PI * 2;
      const sp = (0.8 + Math.random() * 1.6) * (spread || 1);
      const vx = Math.cos(ang) * sp, vy = 1.4 + Math.random() * 1.8, vz = Math.sin(ang) * sp * 0.5;
      const p0 = pos.clone();
      U.tween({
        dur: 0.7 + Math.random() * 0.4, ease: 'linear',
        onUpdate: t => {
          spr.position.set(p0.x + vx * t, p0.y + vy * t - 4.2 * t * t, p0.z + vz * t);
          spr.material.opacity = 1 - t;
        },
        onComplete: () => { scene.remove(spr); spr.material.dispose(); },
      });
    }
  }

  // expanding pixel ring shockwave
  function ringWave(pos, color) {
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({
      map: HP.art.makeGlowTexture(color), transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    ring.position.copy(pos);
    scene.add(ring);
    U.tween({
      dur: 0.55, ease: 'outCubic',
      onUpdate: t => {
        ring.scale.setScalar(0.5 + t * 5.5);
        ring.material.opacity = 0.6 * (1 - t);
      },
      onComplete: () => { scene.remove(ring); ring.material.dispose(); },
    });
  }

  function levelUpFx(id, tierReached) {
    const e = cards.get(id);
    const pos = e ? e.root.position.clone() : new THREE.Vector3(0, 1, 1);
    const color = tierReached === 2 ? '#ffd97a' : '#a78bfa';
    // vertical arise beam
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(1.65, 9),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    beam.position.set(pos.x, pos.y + 3.6, pos.z - 0.15);
    scene.add(beam);
    U.tween({
      dur: 0.9, ease: 'outCubic',
      onUpdate: t => {
        beam.material.opacity = t < 0.3 ? t / 0.3 * 0.5 : 0.5 * (1 - (t - 0.3) / 0.7);
        beam.scale.x = 0.4 + t * 0.9;
      },
      onComplete: () => { scene.remove(beam); beam.material.dispose(); beam.geometry.dispose(); },
    });
    burst(pos, color, 20, 1.4);
    ringWave(pos, color);
    if (e) {
      refreshCardTexture(id);
      // celebration spin (root ry does a full turn; landing exactly back at 0)
      const ry0 = e.root.rotation.y;
      U.tween({
        dur: 0.55, ease: 'outCubic',
        onUpdate: t => { e.root.rotation.y = ry0 + t * Math.PI * 2; },
        onComplete: () => { e.root.rotation.y = ry0; },
      });
      pulseCard(id, color);
    }
  }

  function shake(mag) {
    if (!HP.save.meta.settings.shake) return;
    shakeAmp = Math.min(0.5, shakeAmp + mag);
  }

  // ---------- menu showcase ----------
  function topCards(n) {
    const saved = HP.save.meta.cards;
    const ranked = HP.cards.ALL_IDS
      .map(id => ({ id, lv: saved[id] ? saved[id].lv : 1 }))
      .sort((a, b) => b.lv - a.lv);
    const top = ranked.slice(0, n);
    // default to the four aces + king if fresh save
    if (top.every(c => c.lv <= 1)) return ['SA', 'HA', 'CA', 'DA', 'SK'];
    return top.map(c => c.id);
  }

  function buildShowcase() {
    clearShowcase();
    const ids = topCards(5);
    ids.forEach((id, i) => {
      const parts = makeCardMesh(id);
      const off = i - 2;
      parts.root.position.set(off * 1.7, 3.0 + Math.abs(off) * -0.14, -3);
      parts.root.rotation.set(-0.12, 0, -off * 0.09);
      parts.root.userData.showIdx = i;
      showcase.push(parts);
      cards.delete(id); // not part of gameplay map
    });
  }
  function clearShowcase() {
    for (const p of showcase) {
      scene.remove(p.root);
      p.front.material.dispose(); p.back.material.dispose();
      if (p.glow) p.glow.material.dispose();
    }
    showcase = [];
  }

  let camTw = []; // camera tween ownership: menu<->game toggles must not stack
  function moveCamera(base, look, dur) {
    camTw.forEach(U.killTween);
    camTw = [
      U.tweenProps(camBase, base, { dur, ease: 'inOutSine' }),
      U.tweenProps(camLook, look, { dur, ease: 'inOutSine' }),
    ];
  }
  function menuMode() {
    mode = 'menu';
    clearAll(false);
    buildShowcase();
    moveCamera({ x: 0, y: 5.4, z: 10.4 }, { x: 0, y: 2.7, z: 0 }, 0.8);
  }
  function gameMode() {
    mode = 'game';
    clearShowcase();
    moveCamera({ x: 0, y: 7.6, z: 10.2 }, { x: 0, y: 0.2, z: 1.6 }, 0.7);
  }

  function styleChanged() {
    if (mode === 'menu') buildShowcase();
    // deck stack backs
    scene.traverse(o => {
      if (o.name === 'deckstack') {
        o.material.map = HP.art.getBackTexture(activeStyle());
        o.material.needsUpdate = true;
      }
    });
  }

  // ---------- input: tap to select, drag to reorder, long-press to inspect ----------
  let pressCand = null;   // {id, x, y, touch}
  let drag = null;        // {id}
  let longPressTimer = null;
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -3.55);
  const dragHit = new THREE.Vector3();

  function setPointer(ev) {
    pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
    pointerPx.x = ev.clientX; pointerPx.y = ev.clientY;
  }

  function raycastCard() {
    raycaster.setFromCamera(pointer, camera);
    const fronts = [];
    for (const [, e] of cards) if (e.state === 'hand') fronts.push(e.front);
    const hits = raycaster.intersectObjects(fronts, false);
    return hits.length ? hits[0].object.userData.cardId : null;
  }

  // touch has no persistent cursor — park the pointer so hover (and its
  // tooltip) fully clears after every touch interaction
  function resetTouchHover() {
    pointer.set(-2, -2);
    if (hoveredId) {
      hoveredId = null;
      document.body.classList.remove('cur-point');
      if (api.onHoverChange) api.onHoverChange(null);
    }
  }

  function onPointerDown(ev) {
    if (!interactive) return;
    // one finger owns the hand at a time — but a press whose end event never
    // arrived (pen left range, browser hiccup) must not wedge input forever
    if (pressCand || drag) {
      const stale = pressCand && (ev.pointerId === pressCand.pid || performance.now() - pressCand.t > 8000);
      if (!stale) return;
      clearTimeout(longPressTimer);
      drag = null; pressCand = null;
    }
    setPointer(ev);
    const id = raycastCard();
    if (!id) return;
    pressCand = { id, pid: ev.pointerId, t: performance.now(), x: ev.clientX, y: ev.clientY, moved: 0, touch: ev.pointerType === 'touch' };
    if (pressCand.touch) { // long-press = inspect (tooltip), release hides it
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        if (pressCand && !drag && api.onHoverChange) api.onHoverChange(pressCand.id);
      }, 330);
    }
  }

  function startDrag(id) {
    const e = cards.get(id);
    if (!e || e.state !== 'hand') { pressCand = null; return; }
    clearTimeout(longPressTimer);
    drag = { id };
    if (e.moveTw) { e.moveTw.forEach(U.killTween); e.moveTw = null; }
    if (api.onHoverChange) api.onHoverChange(null);
    HP.audio.sfx('select');
  }

  function updateDrag() {
    const e = cards.get(drag.id);
    if (!e || e.state !== 'hand') { drag = null; return; }
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(dragPlane, dragHit)) return;
    const s = cardScale();
    e.root.position.x = U.clamp(dragHit.x, -6.2, 6.2);
    e.root.position.y = handY(s) + 0.4;
    e.root.position.z = 3.8;
    e.root.rotation.set(TILT, 0, 0);
    // live slot swap: shift the dragged card's index as it crosses neighbors
    const ids = handIdsInOrder();
    const n = ids.length;
    if (n < 2) return;
    const spacing = Math.min(1.34 * s, handSpan() / n);
    let idx = Math.round(e.root.position.x / spacing + (n - 1) / 2);
    idx = U.clamp(idx, 0, n - 1);
    const cur = handOrder.indexOf(drag.id);
    if (idx !== cur) {
      handOrder.splice(cur, 1);
      handOrder.splice(idx, 0, drag.id);
      computeHomes();
      for (const oid of handIdsInOrder()) {
        if (oid !== drag.id) moveTo(cards.get(oid), cards.get(oid).home, 0.16, 0);
      }
      repositionBadges(); // keep the alternating badge rows matching the new order
      HP.audio.sfx('hover');
    }
  }

  function onPointerMove(ev) {
    if (pressCand && ev.pointerId !== pressCand.pid) return; // ignore second fingers
    setPointer(ev);
    if (pressCand && !drag && interactive) {
      const dx = ev.clientX - pressCand.x, dy = ev.clientY - pressCand.y;
      pressCand.moved = Math.max(pressCand.moved, Math.hypot(dx, dy));
      // drags are horizontal reorders: require clearly-sideways intent, and a
      // bigger threshold on touch so tap jitter never becomes an accidental drag
      const thresh = pressCand.touch ? 26 : 12;
      if (Math.abs(dx) > thresh && Math.abs(dx) > Math.abs(dy) * 1.15) startDrag(pressCand.id);
    }
    if (drag) updateDrag();
  }

  function settleDraggedCard(id, ease) {
    const e = cards.get(id);
    // the hand may have been played/cleared while the finger was down — only
    // a card still in 'hand' may be tweened back to a hand slot
    if (e && e.state === 'hand') {
      computeHomes();
      if (e.home) moveTo(e, e.home, 0.22, 0, ease);
    }
  }

  function onPointerUp(ev) {
    if (pressCand && ev.pointerId !== pressCand.pid) return;
    clearTimeout(longPressTimer);
    if (drag) {
      settleDraggedCard(drag.id, 'outBack');
      const order = handIdsInOrder();
      drag = null;
      pressCand = null;
      if (api.onReorder) api.onReorder(order);
      if (ev.pointerType === 'touch') resetTouchHover();
      return;
    }
    if (pressCand) {
      // a swipe that wandered isn't a tap — only clean presses select
      if (interactive && pressCand.moved < 20 && api.onCardClick) api.onCardClick(pressCand.id);
      pressCand = null;
      if (ev.pointerType === 'touch') resetTouchHover();
    }
  }

  // system stole the pointer (gesture, notification) — abort, never click
  function onPointerCancel(ev) {
    if (pressCand && ev.pointerId !== pressCand.pid) return;
    clearTimeout(longPressTimer);
    if (drag) {
      settleDraggedCard(drag.id);
      if (api.onReorder) api.onReorder(handIdsInOrder());
      drag = null;
    }
    pressCand = null;
    if (ev.pointerType === 'touch') resetTouchHover();
  }

  function updateHover() {
    if (drag) return; // no hover churn while dragging
    if (!interactive || mode !== 'game') {
      if (hoveredId) { hoveredId = null; document.body.classList.remove('cur-point'); if (api.onHoverChange) api.onHoverChange(null); }
      return;
    }
    if (pointer.x < -1.5) return; // pointer parked after touch: nothing to hover, skip the raycast
    const id = raycastCard();
    if (id !== hoveredId) {
      hoveredId = id;
      document.body.classList.toggle('cur-point', !!id);
      if (id) HP.audio.sfx('hover');
      if (api.onHoverChange) api.onHoverChange(id);
    }
  }

  // ---------- main loop ----------
  function loop(now) {
    requestAnimationFrame(loop);
    const t = now / 1000;
    const dt = Math.min(0.05, t - lastTime || 0.016);
    lastTime = t;

    U.updateTweens(dt);
    updateHover();

    // hovered index for neighbor-push
    const order = handIdsInOrder();
    const hoverIdx = hoveredId ? order.indexOf(hoveredId) : -1;

    // card idle: bob, hover lift/tilt, selection lift, pop, push, fx compose
    for (const [id, e] of cards) {
      const isHover = id === hoveredId && e.state === 'hand';
      e.hoverT = U.lerp(e.hoverT, isHover ? 1 : 0, dt * 12);
      e.selT = U.lerp(e.selT, e.selected ? 1 : 0, dt * 14);
      e.punchT = Math.max(0, e.punchT - dt * 4);

      // neighbors slide aside for the hovered card
      let pushTarget = 0;
      if (hoverIdx >= 0 && e.state === 'hand' && id !== hoveredId) {
        const d = order.indexOf(id) - hoverIdx;
        if (d !== 0) pushTarget = Math.sign(d) * 0.16 * Math.exp(-Math.abs(d) * 1.1);
      }
      e.push = U.lerp(e.push, pushTarget, dt * 10);

      const bob = Math.sin(t * 1.8 + e.phase) * 0.035;
      e.inner.position.x = e.push;
      e.inner.position.y = bob + e.hoverT * 0.26 + e.selT * 0.72 + e.fx.hop;
      // NOTE: no z-forward on selection — a selected card must not draw over
      // its right neighbor's corner rank (hover is transient, so hover still may)
      e.inner.position.z = e.hoverT * 0.3;
      const punch = Math.sin(Math.min(1, 1 - e.punchT) * Math.PI) * 0.1 * (e.punchT > 0 ? 1 : 0);
      const sc = 1 + e.hoverT * 0.07 + punch;
      e.inner.scale.set(sc * e.fx.sx, sc * e.fx.sy, 1);

      // tilt toward cursor
      if (isHover) {
        e.inner.rotation.y = U.lerp(e.inner.rotation.y, pointer.x * 0.16, dt * 10);
        e.inner.rotation.x = U.lerp(e.inner.rotation.x, -pointer.y * 0.1, dt * 10);
      } else {
        e.inner.rotation.y = U.lerp(e.inner.rotation.y, 0, dt * 8);
        e.inner.rotation.x = U.lerp(e.inner.rotation.x, 0, dt * 8);
      }
      if (e.glow && e.state !== 'gone') {
        e.glow.material.opacity = (HP.art.tierOf(cardLv(id)) === 2 ? 0.5 : 0.35) + Math.sin(t * 2.4 + e.phase) * 0.1;
      }
    }

    // showcase idle
    showcase.forEach((p, i) => {
      p.root.position.y = 3.0 + Math.abs(i - 2) * -0.14 + Math.sin(t * 1.1 + i * 1.3) * 0.16;
      p.root.rotation.y = Math.sin(t * 0.7 + i * 0.9) * 0.22;
    });

    // rays sway
    rays.forEach(r => { r.rotation.z = r.userData.baseZ + Math.sin(t * r.userData.speed) * 0.06; });

    // motes drift
    for (const pts of motes) {
      const pos = pts.geometry.attributes.position;
      const spd = pts.userData.speeds;
      for (let i = 0; i < spd.length; i++) {
        let y = pos.getY(i) + spd[i] * dt;
        if (y > 9.5) y = 0;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    // camera: parallax + shake
    shakeAmp *= Math.exp(-dt * 6);
    const sx = (Math.random() - 0.5) * shakeAmp, sy = (Math.random() - 0.5) * shakeAmp;
    if (pointer.x >= -1.5) { // only once a real pointer/touch has been seen
      parallax.x = U.lerp(parallax.x, U.clamp(pointer.x, -1, 1), dt * 4);
      parallax.y = U.lerp(parallax.y, U.clamp(pointer.y, -1, 1), dt * 4);
    }
    camera.position.set(
      camBase.x + parallax.x * 0.3 + sx,
      camBase.y + parallax.y * 0.15 + sy,
      camBase.z
    );
    camera.lookAt(camLook);

    renderer.render(scene, camera);
  }

  return Object.assign(api, {
    init, applySize, syncHand, setSelected, setInteractive,
    playCards, pulseCard, discardPlayed, discardCards, clearAll,
    floatText, floatTextOnCard, cardWorldPos, burst, ringWave, levelUpFx, shake,
    menuMode, gameMode, styleChanged, refreshCardTexture,
    get hoveredId() { return hoveredId; },
    _dbg: () => ({ renderer, scene, camera }),
  });
})();
