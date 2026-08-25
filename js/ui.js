// ============ HOLY POKER — DOM UI: screens, HUD, menus ============
window.HP = window.HP || {};

HP.ui = (function () {
  const U = HP.util, C = HP.cards;
  const $ = id => document.getElementById(id);

  const SCREENS = ['menu', 'modes', 'sanctum', 'styles', 'stats', 'settings', 'hud', 'roundend', 'runend', 'pause', 'shop'];
  let current = 'menu';
  let settingsReturn = 'menu';
  let sanctumReturn = 'menu';
  let selectedSanctumCard = null;

  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const HINTS = [
    'every card you play earns XP — forever',
    'awaken a card at level 5 · transcend at 10',
    'spades multiply, clubs add mult, hearts add chips, diamonds pay gold',
    'losing a run loses nothing — arise again',
    'face cards have 1.5× stronger abilities',
    'infuse essence in the Sanctum to level cards faster',
  ];
  const WIN_FLAVOR = ['The light takes your hand. You have ascended.', 'Twelve trials. One unbroken will.', 'The cathedral bows to your deck.'];
  const LOSE_FLAVOR = ['The candles gutter... but your cards remember.', 'Defeat is a lesson written in gold.', 'The house wins the night — never the war.'];

  // ---------- screen router ----------
  function showScreen(name) {
    current = name;
    for (const s of SCREENS) {
      $('screen-' + s).classList.toggle('active', s === name);
    }
    hideTooltip(); // never let an info box outlive its screen
  }

  // ---------- modal ----------
  let modalYes = null;
  function showModal(text, onYes) {
    $('modal-text').textContent = text;
    modalYes = onYes;
    $('screen-modal').classList.add('active');
  }
  function hideModal() { $('screen-modal').classList.remove('active'); modalYes = null; }

  // ---------- toasts ----------
  function toast(msg, arise) {
    const d = document.createElement('div');
    d.className = 'toast' + (arise ? ' arise-toast' : '');
    d.textContent = msg;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 3100);
  }

  // ---------- main menu ----------
  function refreshMenu() {
    const m = HP.save.meta;
    $('menu-essence').textContent = U.fmt(m.essence);
    $('menu-gold').textContent = U.fmt(m.gold);
    $('menu-hint').textContent = U.pick(HINTS);
  }

  // ---------- modes ----------
  function renderModes() {
    const grid = $('modes-grid');
    grid.innerHTML = '';
    for (const key of Object.keys(C.MODES)) {
      const m = C.MODES[key];
      const r = HP.save.meta.records[key];
      const d = document.createElement('div');
      d.className = 'mode-card';
      d.innerHTML = `
        <div class="mode-icon">${m.icon}</div>
        <div class="mode-name">${m.name}</div>
        <div class="mode-desc">${m.desc}</div>
        <div class="mode-record">best round: ${r.bestRound} · wins: ${r.wins}</div>`;
      d.addEventListener('click', () => {
        HP.audio.sfx('click');
        HP.game.startRun(key);
      });
      grid.appendChild(d);
    }
  }

  // ---------- sanctum ----------
  function renderSanctum() {
    $('sanctum-essence').textContent = U.fmt(HP.save.meta.essence);
    const grid = $('sanctum-grid');
    grid.innerHTML = '';
    const style = HP.save.meta.styles.active;
    for (const suit of C.SUITS) {
      for (const rank of C.RANKS) {
        const id = suit + rank;
        const st = C.cardState(id);
        const d = document.createElement('div');
        d.className = 'mini-card' + (selectedSanctumCard === id ? ' selected' : '');
        d.appendChild(HP.art.uiCardCanvas(id, style, st.lv, 1));
        const lvb = document.createElement('div');
        const tier = C.tierOf(st.lv);
        lvb.className = 'mini-lv' + (tier === 2 ? ' transcendent' : tier === 1 ? ' awakened' : '');
        lvb.textContent = st.lv;
        d.appendChild(lvb);
        d.addEventListener('click', () => {
          HP.audio.sfx('click');
          selectedSanctumCard = id;
          renderSanctum();
          renderDetail(id, false);
        });
        grid.appendChild(d);
      }
    }
  }

  function renderDetail(id, ariseFx) {
    const panel = $('sanctum-detail');
    if (!id) { panel.innerHTML = '<div class="detail-empty">SELECT A CARD</div>'; return; }
    const st = C.cardState(id);
    const tier = C.tierOf(st.lv);
    const rt = C.rankTier(st.lv);
    const maxed = st.lv >= C.MAX_LEVEL;
    const need = maxed ? 0 : C.xpForLevel(st.lv);
    const meta = HP.save.meta;

    panel.innerHTML = '';
    const prev = document.createElement('div');
    prev.className = 'detail-card-preview' + (ariseFx ? ' arise-fx' : '');
    prev.appendChild(HP.art.uiCardCanvas(id, meta.styles.active, st.lv, 2));
    panel.appendChild(prev);

    const info = document.createElement('div');
    info.innerHTML = `
      <div class="detail-name">${C.cardName(id)}</div>
      <div class="detail-epithet">${C.SUIT_INFO[id[0]].theme} · ${C.SUIT_INFO[id[0]].name}</div>
      <div class="detail-tier">RANK <span class="tier-badge tier-${rt}">${rt}</span>
        ${tier > 0 ? `<span style="color:${tier === 2 ? 'var(--gold)' : 'var(--arise)'}"> ${C.TIER_NAMES[tier]}</span>` : ''}</div>
      <div class="detail-ability">
        <div class="ab-now">Lv.${st.lv} — ${C.abilityDesc(id, st.lv)}</div>
        ${maxed ? '' : `<div class="ab-next">Lv.${st.lv + 1} — ${C.abilityDesc(id, st.lv + 1)}</div>`}
        ${st.lv < 5 ? `<div class="ab-awaken">Lv.5 AWAKEN — effect ×1.5</div>` :
          st.lv < 10 ? `<div class="ab-awaken">Lv.10 TRANSCEND — effect ×2</div>` : ''}
      </div>
      ${maxed
        ? '<div class="max-level">★ MAX LEVEL — TRANSCENDENT ★</div>'
        : `<div class="xp-bar"><div class="xp-fill" style="width:${Math.min(100, st.xp / need * 100)}%"></div></div>
           <div class="xp-label">${st.xp} / ${need} XP</div>`}
      <div class="detail-stats">played ${st.plays} times · contributed ${U.fmt(st.chips)} score</div>`;
    panel.appendChild(info);

    if (!maxed) {
      const act = document.createElement('div');
      act.className = 'detail-actions';
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `INFUSE +${C.INFUSE_XP}XP (${C.INFUSE_COST}⟠)`;
      btn.disabled = meta.essence < C.INFUSE_COST;
      btn.addEventListener('click', () => {
        if (meta.essence < C.INFUSE_COST) return;
        meta.essence -= C.INFUSE_COST;
        const gained = C.addXp(id, C.INFUSE_XP);
        HP.save.save();
        if (gained.length) {
          const isAwaken = gained.includes(5) || gained.includes(10);
          HP.audio.sfx(isAwaken ? 'awaken' : 'levelup');
          toast(`${C.cardName(id)} → Lv.${st.lv}` + (isAwaken ? ' · ' + C.TIER_NAMES[C.tierOf(st.lv)] : ''), true);
        } else {
          HP.audio.sfx('buy');
        }
        renderSanctum();
        renderDetail(id, gained.length > 0);
      });
      act.appendChild(btn);
      panel.appendChild(act);
    }
  }

  // ---------- styles ----------
  function renderStyles() {
    const meta = HP.save.meta;
    $('styles-gold').textContent = U.fmt(meta.gold);
    const grid = $('styles-grid');
    grid.innerHTML = '';
    for (const sid of Object.keys(HP.art.STYLES)) {
      const st = HP.art.STYLES[sid];
      const unlocked = meta.styles.unlocked.includes(sid);
      const active = meta.styles.active === sid;
      const d = document.createElement('div');
      d.className = 'style-card' + (active ? ' active-style' : '');
      const name = document.createElement('div');
      name.className = 'style-name'; name.textContent = st.name;
      d.appendChild(name);
      const prevs = document.createElement('div');
      prevs.className = 'style-previews';
      for (const cid of ['SA', 'HK', 'D7']) prevs.appendChild(HP.art.uiCardCanvas(cid, sid, 1, 1));
      prevs.appendChild(HP.art.uiBackCanvas(sid, 1));
      d.appendChild(prevs);
      const status = document.createElement('div');
      status.className = 'style-status';
      status.innerHTML = active ? '<span style="color:var(--ok)">✓ ACTIVE</span>'
        : unlocked ? 'click to equip'
        : `<span class="locked">unlock: ${st.cost} ●</span>`;
      d.appendChild(status);
      d.addEventListener('click', () => {
        if (active) return;
        if (unlocked) {
          meta.styles.active = sid;
          HP.save.save();
          HP.audio.sfx('click');
          HP.scene.styleChanged();
          renderStyles();
        } else if (meta.gold >= st.cost) {
          showModal(`Unlock ${st.name} style for ${st.cost} gold?`, () => {
            meta.gold -= st.cost;
            meta.styles.unlocked.push(sid);
            meta.styles.active = sid;
            HP.save.saveNow();
            HP.audio.sfx('buy');
            HP.scene.styleChanged();
            renderStyles();
            toast(`${st.name} style unlocked!`);
          });
        } else {
          HP.audio.sfx('error');
          toast(`need ${st.cost - meta.gold} more gold`);
        }
      });
      grid.appendChild(d);
    }
  }

  // ---------- stats ----------
  function renderStats() {
    const m = HP.save.meta;
    const t = m.totals;
    const box = (num, name) => `<div class="stat-box"><div class="stat-num">${U.fmt(num)}</div><div class="stat-name">${name}</div></div>`;
    let html = '<div class="stats-grid">' +
      box(t.runs, 'runs attempted') + box(t.rounds, 'rounds cleared') +
      box(t.hands, 'hands played') + box(t.bestHand, 'best hand score') +
      box(t.levelups, 'level ups') + box(t.xpEarned, 'total card XP') +
      box(t.essenceEarned, 'essence earned') + box(t.goldEarned, 'gold earned') +
      '</div>';

    html += '<div class="stats-section-title">MODE RECORDS</div><table class="records-table"><tr><th>mode</th><th>best round</th><th>wins</th><th>runs</th><th>best hand</th></tr>';
    for (const key of Object.keys(C.MODES)) {
      const r = m.records[key];
      html += `<tr><td>${C.MODES[key].name}</td><td>${r.bestRound}</td><td>${r.wins}</td><td>${r.runs}</td><td>${U.fmt(r.bestScore)}</td></tr>`;
    }
    html += '</table>';
    html += '<div class="stats-section-title">HIGHEST CARDS</div>';
    $('stats-content').innerHTML = html;

    const row = document.createElement('div');
    row.className = 'top-cards-row';
    const ranked = C.ALL_IDS
      .map(id => ({ id, st: C.cardState(id) }))
      .sort((a, b) => b.st.lv - a.st.lv || b.st.xp - a.st.xp)
      .slice(0, 5);
    for (const { id, st } of ranked) {
      const d = document.createElement('div');
      d.className = 'top-card-box';
      d.appendChild(HP.art.uiCardCanvas(id, m.styles.active, st.lv, 1));
      const info = document.createElement('div');
      info.className = 'top-card-info';
      info.innerHTML = `<b>Lv.${st.lv} · ${C.rankTier(st.lv)}</b><br>${C.cardName(id)}<br>${st.plays} plays`;
      d.appendChild(info);
      row.appendChild(d);
    }
    $('stats-content').appendChild(row);
  }

  // ---------- settings ----------
  function renderSettings() {
    const s = HP.save.meta.settings;
    const rows = $('settings-rows');
    rows.innerHTML = '';

    function sliderRow(label, key) {
      const d = document.createElement('div');
      d.className = 'setting-row';
      d.innerHTML = `<span class="setting-label">${label}</span>`;
      const wrap = document.createElement('span');
      wrap.className = 'setting-control';
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = 0; inp.max = 1; inp.step = 0.05; inp.value = s[key];
      inp.addEventListener('input', () => {
        s[key] = parseFloat(inp.value);
        HP.save.save();
        HP.audio.applyVolumes();
      });
      inp.addEventListener('change', () => HP.audio.sfx('click'));
      wrap.appendChild(inp);
      d.appendChild(wrap);
      rows.appendChild(d);
    }
    function toggleRow(label, key, onChange) {
      const d = document.createElement('div');
      d.className = 'setting-row';
      d.innerHTML = `<span class="setting-label">${label}</span>`;
      const btn = document.createElement('button');
      btn.className = 'toggle-btn' + (s[key] ? ' on' : '');
      btn.textContent = s[key] ? 'ON' : 'OFF';
      btn.addEventListener('click', () => {
        s[key] = !s[key];
        btn.classList.toggle('on', s[key]);
        btn.textContent = s[key] ? 'ON' : 'OFF';
        HP.save.save();
        HP.audio.sfx('click');
        if (onChange) onChange(s[key]);
      });
      d.appendChild(btn);
      rows.appendChild(d);
    }

    sliderRow('MASTER VOLUME', 'master');
    sliderRow('MUSIC', 'music');
    sliderRow('SFX', 'sfx');
    toggleRow('CRT SCANLINES', 'crt', v => $('crt-overlay').classList.toggle('off', !v));
    toggleRow('SCREEN SHAKE', 'shake');

    // pixelation
    const d = document.createElement('div');
    d.className = 'setting-row';
    d.innerHTML = '<span class="setting-label">PIXELATION</span>';
    const seg = document.createElement('span');
    seg.className = 'seg-group';
    [['2', 'FINE'], ['3', 'CLASSIC'], ['4', 'CHUNKY']].forEach(([val, name]) => {
      const b = document.createElement('button');
      b.className = 'seg-btn' + (s.pixel == val ? ' on' : '');
      b.textContent = name;
      b.addEventListener('click', () => {
        s.pixel = parseInt(val);
        HP.save.save();
        HP.audio.sfx('click');
        HP.scene.applySize();
        renderSettings();
      });
      seg.appendChild(b);
    });
    d.appendChild(seg);
    rows.appendChild(d);
  }

  // ---------- HUD ----------
  function updateHUD(run) {
    if (!run) return;
    const m = C.MODES[run.mode];
    let label = isFinite(m.rounds)
      ? `ACT ${ROMAN[C.actOf(run.round)]} · ROUND ${run.round}/${m.rounds}`
      : `ROUND ${run.round}`;
    if (!run.boss && m.bossEvery > 1) { // forecast the coming boss
      const untilBoss = m.bossEvery - (run.round % m.bossEvery);
      label += ` · ☠︎${untilBoss}`;
    }
    $('hud-round').textContent = m.icon + ' ' + label;

    const bossEl = $('hud-boss');
    if (run.boss) {
      let txt = `☠︎ ${run.boss.name} — ${run.boss.desc}`;
      if (run.silencedSuit) txt += ` (${C.SUIT_INFO[run.silencedSuit].icon} ${C.SUIT_INFO[run.silencedSuit].name})`;
      bossEl.textContent = txt;
      bossEl.classList.remove('hidden');
    } else {
      bossEl.classList.add('hidden');
    }

    $('hud-target').textContent = U.fmt(run.target);
    $('hud-score').textContent = U.fmt(run.score);
    $('hud-scorefill').style.width = Math.min(100, run.score / run.target * 100) + '%';
    $('hud-hands').textContent = run.handsLeft;
    $('hud-discards').textContent = run.discardsLeft;
    $('hud-deck').textContent = run.deck.length;
    $('hud-essence').textContent = U.fmt(HP.save.meta.essence + run.pendingEssence);
    $('hud-gold').textContent = U.fmt(HP.save.meta.gold + run.pendingGold);

    const bp = $('hud-blessings');
    if (run.blessings.length) {
      bp.classList.remove('hidden');
      bp.innerHTML = run.blessings.map(bid => {
        const b = C.BLESSINGS.find(x => x.id === bid);
        return `<div class="blessing-chip" data-name="${b.icon} ${b.name}" data-desc="${b.desc}"><span class="b-ic">${b.icon}</span><span class="b-nm"> ${b.name}</span></div>`;
      }).join('');
    } else {
      bp.classList.add('hidden');
    }
  }

  function updateButtons(run) {
    if (!run) return;
    const sel = run.selected.size;
    $('btn-playhand').disabled = sel === 0 || HP.game.busy;
    $('btn-discard').disabled = sel === 0 || run.discardsLeft <= 0 || HP.game.busy;
    $('btn-discard').textContent = `DISCARD (${run.discardsLeft})`;
    $('btn-sort').textContent = 'SORT: ' + run.sort.toUpperCase();
  }

  function updatePreview(run) {
    const el = $('hud-preview');
    if (!run || run.selected.size === 0) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (run.boss && run.boss.hidePreview) {
      $('preview-name').textContent = '? ? ?';
      $('preview-nums').textContent = 'the veil hides your hand';
      return;
    }
    const ev = HP.game.evalSelection();
    if (!ev) { el.classList.add('hidden'); return; }
    $('preview-name').textContent = ev.name;
    $('preview-nums').innerHTML = `base <b class="c">${ev.chips}</b> × <b class="m">${Math.round(ev.mult * 100) / 100}</b>`;
  }
  function hidePreview() { $('hud-preview').classList.add('hidden'); }

  // scoring readout
  let lastChips = 0, lastMult = 0;
  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function showScoring(name) {
    $('scoring-handname').textContent = name;
    $('hud-scoring').classList.remove('hidden');
    $('scoring-total').classList.add('hidden');
    lastChips = -1; lastMult = -1;
  }
  function setChips(v) {
    const el = $('scoring-chips');
    el.textContent = U.fmt(v);
    if (v !== lastChips) bump(el);
    lastChips = v;
  }
  function setMult(v) {
    const el = $('scoring-mult');
    const shown = Math.round(v * 100) / 100;
    el.textContent = shown >= 100 ? U.fmt(shown) : ('' + shown);
    if (v !== lastMult) bump(el);
    lastMult = v;
  }
  function showTotal(v) {
    const el = $('scoring-total');
    el.classList.remove('hidden');
    el.textContent = U.fmt(v);
  }
  function hideScoring() { $('hud-scoring').classList.add('hidden'); }

  // ---------- round end ----------
  function roundEnd(run, rewards, choices, onBless, onContinue) {
    showScreen('roundend');
    $('roundend-title').textContent = `ROUND ${run.round} CLEARED`;
    const rows = $('reward-rows');
    rows.innerHTML = '';
    const addRow = (label, val, i, cls) => {
      const d = document.createElement('div');
      d.className = 'reward-row' + (cls ? ' ' + cls : '');
      d.style.animationDelay = (i * 0.16) + 's';
      d.innerHTML = `<span>${label}</span><span class="rv">${val}</span>`;
      rows.appendChild(d);
    };
    addRow('round score', U.fmt(run.score), 0);
    addRow('⟠ essence earned', '+' + rewards.essence, 1);
    addRow('● gold earned', '+' + rewards.gold, 2);
    if (rewards.interest > 0) addRow('● of which interest (1 per 10● held, max 5)', '+' + rewards.interest, 3);

    const bs = $('blessing-section');
    const nextBtn = $('btn-nextround');
    if (choices.length) {
      bs.classList.remove('hidden');
      nextBtn.classList.add('hidden');
      const bc = $('blessing-choices');
      bc.innerHTML = '';
      for (const b of choices) {
        const d = document.createElement('div');
        d.className = 'blessing-choice';
        d.innerHTML = `<div class="b-icon">${b.icon}</div><div class="b-name">${b.name}</div><div class="b-desc">${b.desc}</div>`;
        d.addEventListener('click', () => {
          onBless(b.id);
          onContinue();
        }, { once: true });
        bc.appendChild(d);
      }
    } else {
      bs.classList.add('hidden');
      nextBtn.classList.remove('hidden');
      nextBtn.onclick = () => { HP.audio.sfx('click'); onContinue(); };
    }
  }

  // ---------- run end ----------
  function runEnd(win, run) {
    showScreen('runend');
    const title = $('runend-title');
    title.textContent = win ? '✦ ASCENSION ✦' : 'THE HOUSE PREVAILS';
    title.style.color = win ? 'var(--gold)' : 'var(--mult-red)';
    $('runend-flavor').textContent = U.pick(win ? WIN_FLAVOR : LOSE_FLAVOR);
    const rows = $('runend-rows');
    rows.innerHTML = '';
    const addRow = (label, val, i) => {
      const d = document.createElement('div');
      d.className = 'reward-row';
      d.style.animationDelay = (i * 0.16) + 's';
      d.innerHTML = `<span>${label}</span><span class="rv">${val}</span>`;
      rows.appendChild(d);
    };
    const cleared = win ? run.round : run.round - 1;
    addRow('rounds cleared', Math.max(0, cleared), 0);
    addRow('total scored', U.fmt(run.totalScored), 1);
    addRow('⟠ essence banked', '+' + run.bankedEssence, 2);
    addRow('● gold banked', '+' + run.bankedGold, 3);
  }

  // ---------- shop (The Reliquary) ----------
  function showShop(run) {
    showScreen('shop');
    $('shop-gold').textContent = U.fmt(HP.save.meta.gold);
    const grid = $('shop-grid');
    grid.innerHTML = '';
    run.shop.stock.forEach((slot, i) => {
      const it = slot.item;
      const d = document.createElement('div');
      d.className = 'shop-item' + (slot.sold ? ' sold' : '');
      d.innerHTML = `
        <div class="s-icon">${it.icon}</div>
        <div class="s-name">${it.name}</div>
        <div class="s-desc">${it.desc}</div>`;
      const btn = document.createElement('button');
      btn.className = 'btn btn-small s-buy' + (slot.sold ? '' : ' btn-gold');
      if (slot.sold) {
        btn.textContent = 'SOLD';
        btn.disabled = true;
      } else {
        btn.textContent = `BUY ${it.cost}●`;
        btn.disabled = HP.save.meta.gold < it.cost;
        btn.addEventListener('click', () => HP.game.buyShop(i));
      }
      d.appendChild(btn);
      grid.appendChild(d);
    });
    const rb = $('btn-reroll');
    rb.textContent = `⟲ REROLL ${HP.game.rerollCost()}●`;
    rb.disabled = HP.save.meta.gold < HP.game.rerollCost();

    // boss defeated -> the Sanctum Altar opens: spend essence on card upgrades mid-run
    const altar = $('shop-altar');
    if (run.shop.altar) {
      altar.classList.remove('hidden');
      $('altar-essence').textContent = U.fmt(HP.save.meta.essence);
    } else {
      altar.classList.add('hidden');
    }
  }

  // ---------- hover tooltips (hand cards + HUD blessing chips) ----------
  let mousePos = { x: 0, y: 0 };
  let tooltipTimer = null;
  const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

  function showTooltip(html) {
    const tt = $('tooltip');
    tt.innerHTML = html;
    tt.classList.remove('hidden');
    positionTooltip();
    // touch has no mouseout — never let a tooltip sit forever
    clearTimeout(tooltipTimer);
    if (isTouch()) tooltipTimer = setTimeout(hideTooltip, 2600);
  }
  function hideTooltip() {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
    $('tooltip').classList.add('hidden');
  }

  function initTooltip() {
    window.addEventListener('pointermove', e => {
      mousePos = { x: e.clientX, y: e.clientY };
      const tt = $('tooltip');
      if (!tt.classList.contains('hidden')) positionTooltip();
    });
    // any tap that isn't on a blessing chip dismisses a lingering tooltip
    window.addEventListener('pointerdown', e => {
      mousePos = { x: e.clientX, y: e.clientY };
      const el = e.target instanceof Element ? e.target : null;
      if (!el || !el.closest('.blessing-chip')) hideTooltip();
    }, true);
    // 3D hand cards (desktop hover; on touch the scene fires this on long-press)
    HP.scene.onHoverChange = id => {
      if (!id || !HP.game.run) { hideTooltip(); return; }
      const st = C.cardState(id);
      const silenced = HP.game.run.silencedSuit === id[0];
      showTooltip(`<div class="tt-title">${C.cardName(id)} — Lv.${st.lv}</div>
        <div class="tt-body">${silenced ? '<s>' : ''}${C.abilityDesc(id, st.lv)}${silenced ? '</s> SILENCED' : ''}</div>`);
    };
    // HUD blessing chips (delegated — the list re-renders every round)
    const bp = $('hud-blessings');
    bp.addEventListener('mouseover', e => {
      const chip = e.target.closest('.blessing-chip');
      if (chip) showTooltip(`<div class="tt-title">${chip.dataset.name}</div><div class="tt-body">${chip.dataset.desc}</div>`);
    });
    bp.addEventListener('mouseout', e => {
      if (e.target.closest('.blessing-chip')) hideTooltip();
    });
  }
  function positionTooltip() {
    const tt = $('tooltip');
    const pad = 16;
    let x = mousePos.x + pad;
    let y = isTouch() ? mousePos.y - 92 : mousePos.y - 10; // above the finger on touch
    if (x + 250 > window.innerWidth) x = Math.max(4, mousePos.x - 260);
    if (y + 80 > window.innerHeight) y = window.innerHeight - 90;
    if (y < 4) y = 4;
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
  }

  // ---------- init / bindings ----------
  function init() {
    const sfxClick = () => HP.audio.sfx('click');

    // menu
    $('btn-play').addEventListener('click', () => { sfxClick(); renderModes(); showScreen('modes'); });
    $('btn-sanctum').addEventListener('click', () => { sfxClick(); sanctumReturn = 'menu'; selectedSanctumCard = null; renderSanctum(); renderDetail(null); showScreen('sanctum'); });
    $('btn-styles').addEventListener('click', () => { sfxClick(); renderStyles(); showScreen('styles'); });
    $('btn-stats').addEventListener('click', () => { sfxClick(); renderStats(); showScreen('stats'); });
    $('btn-settings').addEventListener('click', () => { sfxClick(); settingsReturn = 'menu'; renderSettings(); showScreen('settings'); });

    // backs
    $('btn-modes-back').addEventListener('click', () => { sfxClick(); showScreen('menu'); });
    $('btn-sanctum-back').addEventListener('click', () => {
      sfxClick();
      if (sanctumReturn === 'shop' && HP.game.run && HP.game.run.shop) showShop(HP.game.run);
      else { refreshMenu(); showScreen('menu'); }
    });
    $('btn-styles-back').addEventListener('click', () => { sfxClick(); refreshMenu(); showScreen('menu'); });
    $('btn-stats-back').addEventListener('click', () => { sfxClick(); showScreen('menu'); });
    $('btn-settings-back').addEventListener('click', () => {
      sfxClick();
      if (settingsReturn === 'pause') showScreen('pause');
      else { refreshMenu(); showScreen('menu'); }
    });

    // settings reset
    $('btn-reset-save').addEventListener('click', () => {
      showModal('Erase ALL progress? Card levels, essence, gold, records — everything. This cannot be undone.', () => {
        HP.save.reset();
        HP.audio.applyVolumes();
        $('crt-overlay').classList.toggle('off', !HP.save.meta.settings.crt);
        HP.scene.applySize();
        HP.scene.styleChanged();
        renderSettings();
        toast('all progress erased');
      });
    });

    // hud
    $('btn-playhand').addEventListener('click', () => HP.game.playHand());
    $('btn-discard').addEventListener('click', () => HP.game.discard());
    $('btn-sort').addEventListener('click', () => HP.game.toggleSort());
    $('btn-pause').addEventListener('click', () => { sfxClick(); showScreen('pause'); });

    // pause
    $('btn-resume').addEventListener('click', () => { sfxClick(); showScreen('hud'); updateHUD(HP.game.run); });
    $('btn-pause-settings').addEventListener('click', () => { sfxClick(); settingsReturn = 'pause'; renderSettings(); showScreen('settings'); });
    $('btn-abandon').addEventListener('click', () => {
      showModal('Abandon this run? Banked essence & gold are kept. Card XP is never lost.', () => HP.game.abandonRun());
    });

    // shop
    $('btn-reroll').addEventListener('click', () => HP.game.rerollShop());
    $('btn-shop-continue').addEventListener('click', () => { sfxClick(); HP.game.leaveShop(); });
    $('btn-altar').addEventListener('click', () => {
      sfxClick();
      sanctumReturn = 'shop';
      selectedSanctumCard = null;
      renderSanctum();
      renderDetail(null);
      showScreen('sanctum');
    });

    // run end
    $('btn-arise').addEventListener('click', () => { sfxClick(); HP.game.ariseAgain(); });
    $('btn-runend-menu').addEventListener('click', () => { sfxClick(); HP.game.toMenu(); });

    // modal
    $('modal-yes').addEventListener('click', () => { const fn = modalYes; hideModal(); sfxClick(); if (fn) fn(); });
    $('modal-no').addEventListener('click', () => { hideModal(); sfxClick(); });

    // keyboard
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if ($('screen-modal').classList.contains('active')) { hideModal(); return; }
        if (current === 'hud' && HP.game.run) showScreen('pause');
        else if (current === 'pause') { showScreen('hud'); updateHUD(HP.game.run); }
        else if (current === 'settings' && settingsReturn === 'pause') showScreen('pause');
        else if (current === 'sanctum' && sanctumReturn === 'shop' && HP.game.run && HP.game.run.shop) showShop(HP.game.run);
        else if (['modes', 'sanctum', 'styles', 'stats', 'settings'].includes(current)) { refreshMenu(); showScreen('menu'); }
      }
      if (e.key === 'Enter' && current === 'hud' && !$('btn-playhand').disabled) HP.game.playHand();
    });

    // apply persisted settings
    $('crt-overlay').classList.toggle('off', !HP.save.meta.settings.crt);
    initTooltip();
  }

  return {
    init, showScreen, showModal, toast, refreshMenu,
    updateHUD, updateButtons, updatePreview, hidePreview,
    showScoring, setChips, setMult, showTotal, hideScoring,
    roundEnd, runEnd, showShop,
  };
})();
