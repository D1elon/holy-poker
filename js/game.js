// ============ HOLY POKER — run state machine & scoring ============
window.HP = window.HP || {};

HP.game = (function () {
  const U = HP.util, C = HP.cards, P = HP.poker;

  let run = null;
  let busy = false;
  // generation token: bumped whenever the current run stops being the current
  // run (new run, abandon, menu). Async flows capture it and bail after every
  // await, so an abandoned run's scoring coroutine can never zombie-mutate
  // the next run or resurrect dead screens.
  let gen = 0;

  // ---------- seeded randomness (Daily Rite) ----------
  // Daily determinism uses ORDER-INDEPENDENT derived streams: deck and boss
  // for round N come from hash(seed|tag|N), so player-dependent choices
  // (blessings picked, shop rerolls) can never desynchronize two players'
  // rounds. Everything cosmetic/shop rolls plain Math.random.
  function seedStr(mode) {
    if (!C.MODES[mode].seeded) return null;
    return 'HOLYPOKER|' + new Date().toISOString().slice(0, 10);
  }
  function roundStream(tag, n) {
    if (!run.seedStr) return Math.random;
    return U.mulberry32(U.hashStr(run.seedStr + '|' + tag + '|' + n));
  }

  // ---------- run lifecycle ----------
  function freshRun(mode) {
    return {
      mode,
      seedStr: seedStr(mode),
      round: 0,
      score: 0, target: 0,
      handsMax: 4, discardsMax: 3, handSize: 8,
      handsLeft: 0, discardsLeft: 0,
      deck: [], hand: [], selected: new Set(),
      blessings: [], relics: [],
      boss: null, silencedSuit: null,
      usedBosses: [], nextBoss: null,
      bonusHands: 0, bonusDiscards: 0, bonusHandSize: 0,
      bonusChips: 0, bonusMult: 0,
      indulgence: false, shopRerolls: 0, shopBuys: 0, shop: null,
      bankedEssence: 0, bankedGold: 0,
      pendingGold: 0, pendingEssence: 0,
      sort: 'rank',
      totalScored: 0,
      stats: { bestHand: 0, handsPlayed: 0, levelUps: 0 },
      phase: 'round',
      deckWarned: false,
      ended: false,
    };
  }

  function startRun(mode) {
    gen++;
    run = freshRun(mode);
    HP.save.meta.totals.runs++;
    HP.save.meta.records[mode].runs++;
    if (mode === 'daily') touchDaily();
    HP.save.save();
    HP.scene.gameMode();
    HP.ui.showScreen('hud');
    startRound(1);
  }

  function touchDaily() {
    const meta = HP.save.meta;
    const today = new Date().toISOString().slice(0, 10);
    if (!meta.daily || meta.daily.date !== today) {
      meta.daily = { date: today, attempts: 0, bestRound: 0, won: false };
    }
    meta.daily.attempts++;
  }

  function has(bid) { return run && run.blessings.includes(bid); }
  const hasRelic = id => run && run.relics.includes(id);

  // ---------- boss selection (pre-rolled so the HUD can forecast it) ----------
  function nextBossRound(after) {
    const m = C.MODES[run.mode];
    if (m.bossEvery === 1) return after + 1;
    const nb = Math.ceil((after + 1) / m.bossEvery) * m.bossEvery;
    return (isFinite(m.rounds) && nb > m.rounds) ? null : nb;
  }

  function rollBossFor(round) {
    const m = C.MODES[run.mode];
    let pool = C.BOSSES.filter(b => !run.usedBosses.includes(b.id));
    if (!pool.length) pool = [...C.BOSSES];
    // the final wall shouldn't also be a 1.5x target swing — too much variance
    if (isFinite(m.rounds) && round === m.rounds && pool.length > 1) {
      pool = pool.filter(b => b.id !== 'tax');
    }
    const rnd = roundStream('boss', round);
    const boss = U.pick(pool, rnd);
    const silencedSuit = boss.silences ? U.pick(C.SUITS, rnd) : null;
    return { round, bossId: boss.id, silencedSuit };
  }

  function ensureNextBoss() {
    const nb = nextBossRound(run.round);
    if (nb === null) { run.nextBoss = null; return; }
    if (!run.nextBoss || run.nextBoss.round !== nb) run.nextBoss = rollBossFor(nb);
  }

  async function startRound(n) {
    const g = gen;
    busy = true;
    run.round = n;
    run.score = 0;
    run.deckWarned = false;
    run.selected.clear();

    // boss: consume the pre-rolled forecast (or roll fresh on resume edge)
    run.boss = null; run.silencedSuit = null;
    if (C.isBossRound(n, run.mode)) {
      const pre = (run.nextBoss && run.nextBoss.round === n) ? run.nextBoss : rollBossFor(n);
      run.boss = C.BOSSES.find(b => b.id === pre.bossId);
      run.silencedSuit = pre.silencedSuit;
      run.usedBosses.push(run.boss.id);
      run.nextBoss = null;
      HP.audio.sfx('boss');
    }
    ensureNextBoss();

    run.target = C.targetFor(n, run.mode);
    if (run.boss && run.boss.targetMult) run.target = Math.round(run.target * run.boss.targetMult / 10) * 10;
    if (run.indulgence) { // bought at The Reliquary: one round of mercy
      run.target = Math.max(10, Math.round(run.target * 0.85 / 10) * 10);
      run.indulgence = false;
    }

    run.handsLeft = run.handsMax + (has('hand+') ? 1 : 0) + run.bonusHands + (run.boss && run.boss.hands ? run.boss.hands : 0);
    run.discardsLeft = run.discardsMax + (has('discard+') ? 1 : 0) + run.bonusDiscards + (run.boss && run.boss.discards ? run.boss.discards : 0);
    run.handsLeft = Math.max(1, run.handsLeft);
    run.discardsLeft = Math.max(0, run.discardsLeft);

    // fresh shuffled deck each round (daily: same shuffle for everyone)
    run.deck = U.shuffle([...C.ALL_IDS], roundStream('deck', n));
    run.hand = [];

    HP.scene.clearAll(false);
    HP.ui.updateHUD(run);
    HP.ui.showScreen('hud');
    await refill();
    if (g !== gen) return;
    HP.ui.updateHUD(run);
    HP.ui.updateButtons(run);
    run.phase = 'round';
    saveSnapshot();
    busy = false;
    HP.scene.setInteractive(true);

    // first run ever: three quick pointers, then never again
    const meta = HP.save.meta;
    if (n === 1 && !meta.tipsShown && meta.totals.runs <= 1) {
      meta.tipsShown = true;
      HP.save.save();
      HP.ui.toast('tap up to 5 cards · drag to reorder them');
      setTimeout(() => HP.ui.toast('beat the target before your hands run out'), 2900);
      setTimeout(() => HP.ui.toast('your cards keep their XP forever — even in defeat'), 5800);
    }
  }

  function handSizeNow() { return run.handSize + (has('size+') ? 1 : 0) + run.bonusHandSize; }
  function maxPlay() { return run.boss && run.boss.maxPlay ? run.boss.maxPlay : 5; }

  async function refill() {
    const want = handSizeNow() - run.hand.length;
    for (let i = 0; i < want && run.deck.length > 0; i++) run.hand.push(run.deck.pop());
    if (want > 0 && run.deck.length === 0 && run.hand.length < handSizeNow() && !run.deckWarned) {
      run.deckWarned = true;
      HP.ui.toast('the deck is running dry — no more draws this round');
    }
    sortHand();
    await HP.scene.syncHand(run.hand);
    HP.ui.updateHUD(run);
  }

  function sortHand() {
    if (run.sort === 'custom') return; // player's dragged order stands; new draws append
    if (run.sort === 'rank') {
      run.hand.sort((a, b) => P.rankIdx(b) - P.rankIdx(a) || a[0].localeCompare(b[0]));
    } else {
      run.hand.sort((a, b) => a[0].localeCompare(b[0]) || P.rankIdx(b) - P.rankIdx(a));
    }
  }

  function toggleSort() {
    if (busy || !run) return;
    run.sort = run.sort === 'rank' ? 'suit' : 'rank'; // from 'custom' -> back to rank
    sortHand();
    HP.scene.syncHand(run.hand);
    HP.ui.updateButtons(run);
    HP.ui.updatePreview(run); // scoring order follows hand order
    HP.audio.sfx('click');
  }

  // player dragged a card to a new slot — their order IS the scoring order
  function reorderHand(ids) {
    if (busy || !run) return;
    if (ids.length !== run.hand.length) return;
    const a = [...ids].sort(), b = [...run.hand].sort();
    if (a.some((v, i) => v !== b[i])) return; // must be the same card set
    if (ids.every((v, i) => v === run.hand[i])) return; // unchanged
    run.hand = [...ids];
    run.sort = 'custom';
    HP.ui.updateButtons(run);
    HP.ui.updatePreview(run); // scoring order changed -> predicted total changed
  }

  function clearSelection() {
    if (busy || !run || run.selected.size === 0) return;
    run.selected.clear();
    HP.audio.sfx('deselect');
    HP.scene.setSelected(run.selected);
    HP.ui.updatePreview(run);
    HP.ui.updateButtons(run);
  }

  // ---------- selection ----------
  function onCardClick(id) {
    if (busy || !run) return;
    if (HP.ui.currentScreen() !== 'hud') return; // pause/shop overlays must not leak taps to the table
    if (run.selected.has(id)) {
      run.selected.delete(id);
      HP.audio.sfx('deselect');
    } else {
      if (run.selected.size >= maxPlay()) { HP.audio.sfx('error'); return; }
      run.selected.add(id);
      HP.audio.sfx('select');
    }
    HP.scene.setSelected(run.selected);
    HP.ui.updatePreview(run);
    HP.ui.updateButtons(run);
  }

  function evalSelection() {
    if (!run || run.selected.size === 0) return null;
    const ids = run.hand.filter(id => run.selected.has(id));
    const ev = P.evaluate(ids, { shortcut: has('shortcut') });
    if (!ev) return null;
    // blessing adjustments to base values
    let chips = ev.chips + run.bonusChips, mult = ev.mult + run.bonusMult;
    if (has('chips+')) chips += 40;
    if (has('mult+')) mult += 3;
    if (has('pairs+') && ['pair', 'twopair', 'fullhouse'].includes(ev.key)) mult = mult * 1.5;
    return { ...ev, chips, mult, ids };
  }

  // exact score prediction: replays the scoring math with no FX. Abilities use
  // each card's level at its own trigger (levels land after a card's trigger),
  // so this matches playHand to the chip.
  function predictSelection() {
    const ev = evalSelection();
    if (!ev) return null;
    let chips = ev.chips, mult = ev.mult;
    ev.ids.forEach((id, i) => {
      const st = C.cardState(id);
      chips += P.RANK_VALUE[P.rankOf(id)];
      const times = (i === 0 && has('firstcard')) ? 2 : 1;
      for (let k = 0; k < times; k++) {
        if (run.silencedSuit === id[0]) continue;
        let v = C.abilityValue(id, st.lv);
        const bl = suitBlessing[id[0]];
        switch (id[0]) {
          case 'H': if (has(bl)) v = Math.round(v * 1.5); chips += v; break;
          case 'C': if (has(bl)) v = Math.round(v * 1.5); mult += v; break;
          case 'S': { let x = v; if (has(bl)) x = 1 + (x - 1) * 1.5; mult *= x; break; }
          case 'D': break; // gold, not score
        }
      }
    });
    mult = Math.round(mult * 100) / 100;
    return { ...ev, total: Math.round(chips * mult) };
  }

  // ---------- scoring ----------
  const suitBlessing = { H: 'hearts+', C: 'clubs+', S: 'spades+', D: 'diamonds+' };

  async function playHand() {
    if (busy || !run || run.selected.size === 0 || run.handsLeft <= 0) return;
    const ev = evalSelection();
    if (!ev) return;
    const g = gen;
    busy = true;
    HP.scene.setInteractive(false);
    run.handsLeft--;
    HP.ui.updateHUD(run);
    HP.ui.updateButtons(run);
    HP.ui.hidePreview();

    const played = ev.ids;
    run.hand = run.hand.filter(id => !run.selected.has(id));
    run.selected.clear();
    HP.scene.setSelected(run.selected);
    // snapshot NOW, with the hand committed (cards removed, handsLeft spent):
    // scoring grants permanent XP across the awaits below, so a reload
    // mid-ceremony must resume AFTER the hand — a pre-hand snapshot next to
    // already-banked XP was a replayable duplication exploit.
    saveSnapshot();

    await HP.scene.playCards(played);
    if (g !== gen) return;

    // scoring
    let chips = ev.chips;
    let mult = ev.mult;
    HP.ui.showScoring(ev.name);
    HP.ui.setChips(chips); HP.ui.setMult(mult);
    await U.wait(360);
    if (g !== gen) return;

    const levelEvents = [];
    const stepDelay = played.length > 4 ? 230 : 290;

    for (let i = 0; i < played.length; i++) {
      const id = played[i];
      const st = C.cardState(id);

      // rank chips
      const rv = P.RANK_VALUE[P.rankOf(id)];
      chips += rv;
      HP.scene.pulseCard(id, '#6ec6ff');
      HP.scene.floatTextOnCard(id, '+' + rv, '#6ec6ff');
      HP.audio.sfx('chip', i);
      HP.ui.setChips(chips);
      st.plays++;
      await U.wait(stepDelay * 0.55);
      if (g !== gen) return;

      // ability trigger(s)
      const times = (i === 0 && has('firstcard')) ? 2 : 1;
      for (let k = 0; k < times; k++) {
        if (run.silencedSuit === id[0]) {
          if (k === 0) HP.scene.floatTextOnCard(id, 'SILENCED', '#8a8a9a');
          continue;
        }
        let v = C.abilityValue(id, st.lv);
        const bl = suitBlessing[id[0]];
        switch (id[0]) {
          case 'H':
            if (has(bl)) v = Math.round(v * 1.5);
            chips += v;
            HP.scene.floatTextOnCard(id, '+' + v, '#ff8fa3');
            HP.scene.burst(HP.scene.cardWorldPos(id), '#ff8fa3', 6, 0.7);
            HP.audio.sfx('chip', i + 2);
            HP.ui.setChips(chips);
            break;
          case 'C':
            if (has(bl)) v = Math.round(v * 1.5);
            mult += v;
            HP.scene.floatTextOnCard(id, '+' + v + ' MULT', '#ff6e6e');
            HP.scene.burst(HP.scene.cardWorldPos(id), '#ff6e6e', 6, 0.7);
            HP.audio.sfx('multhit', i);
            HP.ui.setMult(mult);
            break;
          case 'S': {
            let x = v;
            if (has(bl)) x = 1 + (x - 1) * 1.5;
            mult = mult * x;
            HP.scene.floatTextOnCard(id, '×' + x.toFixed(2), '#a78bfa');
            HP.scene.ringWave(HP.scene.cardWorldPos(id), '#a78bfa');
            HP.audio.sfx('xmult');
            HP.ui.setMult(mult);
            break;
          }
          case 'D': {
            if (has(bl)) v = Math.round(v * 1.5);
            run.pendingGold += v;
            HP.scene.floatTextOnCard(id, '+' + v + ' ●', '#ffd97a');
            HP.scene.burst(HP.scene.cardWorldPos(id), '#ffd97a', 8, 0.8);
            HP.audio.sfx('goldp');
            if (C.tierOf(st.lv) >= 1) run.pendingEssence += 1;
            break;
          }
        }
        if (times === 2 && k === 0) { await U.wait(stepDelay * 0.5); if (g !== gen) return; }
      }

      // XP
      const xpGain = Math.round((3 + run.round) * (has('xp2') ? 2 : 1));
      const gained = C.addXp(id, xpGain);
      for (const lv of gained) levelEvents.push({ id, lv });

      await U.wait(stepDelay * 0.45);
      if (g !== gen) return;
    }

    // level-up ceremonies
    for (const e of levelEvents) {
      const tier = C.tierOf(e.lv);
      const isAwaken = e.lv === 5 || e.lv === 10;
      HP.audio.sfx(isAwaken ? 'awaken' : 'levelup');
      HP.scene.levelUpFx(e.id, tier);
      HP.scene.floatTextOnCard(e.id,
        e.lv === 10 ? 'TRANSCENDENT!' : e.lv === 5 ? 'AWAKENED!' : 'LEVEL UP!',
        tier === 2 ? '#ffd97a' : '#a78bfa', true);
      HP.ui.toast(`${C.cardName(e.id)} → Lv.${e.lv}` + (isAwaken ? ' · ' + C.TIER_NAMES[tier] : ''), true);
      HP.scene.shake(0.08);
      await U.wait(isAwaken ? 800 : 450);
      if (g !== gen) return;
    }
    run.stats.levelUps += levelEvents.length;

    // total
    mult = Math.round(mult * 100) / 100;
    const total = Math.round(chips * mult);
    await U.wait(200);
    if (g !== gen) return;
    HP.ui.showTotal(total);
    HP.audio.sfx(total >= run.target * 0.5 ? 'bigscore' : 'tally', 4);
    HP.scene.shake(Math.min(0.4, 0.06 + total / (run.target * 4)));
    const mid = new THREE.Vector3(0, 1.2, 1);
    if (total >= run.target * 0.5) HP.scene.burst(mid, '#ffd97a', 26, 2.2);

    run.score += total;
    run.totalScored += total;
    run.stats.handsPlayed++;
    if (total > run.stats.bestHand) run.stats.bestHand = total;
    HP.save.meta.totals.hands++;
    if (total > HP.save.meta.totals.bestHand) HP.save.meta.totals.bestHand = total;
    if (total > HP.save.meta.records[run.mode].bestScore) HP.save.meta.records[run.mode].bestScore = total;
    for (const id of played) C.cardState(id).chips += Math.round(total / played.length);
    HP.save.save();

    // feats earned by this hand
    if (ev.key === 'royal') C.grantFeat('royal');
    if (ev.key === 'straightflush' || ev.key === 'royal') C.grantFeat('sfeat');
    if (total >= 10000) C.grantFeat('bighand');
    if (total >= 100000) C.grantFeat('gianthand');
    if (run.score >= run.target && run.handsLeft <= 0) C.grantFeat('comeback');

    await U.wait(650);
    if (g !== gen) return;
    HP.ui.hideScoring();
    HP.ui.updateHUD(run);
    await HP.scene.discardPlayed();
    if (g !== gen) return;

    if (run.score >= run.target) {
      await roundClear(g);
      return;
    }
    if (run.handsLeft <= 0) {
      await runEnd(false);
      return;
    }
    await refill();
    if (g !== gen) return;
    if (run.hand.length === 0) { // deck spent with hands left: nothing playable
      HP.ui.toast('the deck is spent');
      await runEnd(false);
      return;
    }
    saveSnapshot();
    HP.ui.updateButtons(run);
    busy = false;
    HP.scene.setInteractive(true);
    if (run.handsLeft === 1) HP.ui.finalHandCue();
  }

  async function discard() {
    if (busy || !run || run.selected.size === 0 || run.discardsLeft <= 0) return;
    const g = gen;
    busy = true;
    HP.scene.setInteractive(false);
    run.discardsLeft--;
    const ids = run.hand.filter(id => run.selected.has(id));
    run.hand = run.hand.filter(id => !run.selected.has(id));
    run.selected.clear();
    HP.scene.setSelected(run.selected);
    saveSnapshot(); // committed before the animation awaits (see playHand)
    HP.ui.hidePreview();
    HP.ui.updateHUD(run);
    await HP.scene.discardCards(ids);
    if (g !== gen) return;
    await refill();
    if (g !== gen) return;
    if (run.hand.length === 0) {
      HP.ui.toast('the deck is spent');
      await runEnd(false);
      return;
    }
    saveSnapshot();
    HP.ui.updateButtons(run);
    busy = false;
    HP.scene.setInteractive(true);
  }

  // ---------- round / run end ----------
  function isFinalRound() {
    const m = C.MODES[run.mode];
    return isFinite(m.rounds) && run.round >= m.rounds;
  }

  async function roundClear(g) {
    HP.scene.setInteractive(false);
    HP.audio.sfx('roundwin');
    HP.scene.burst(new THREE.Vector3(0, 1.5, 1.5), '#ffd97a', 40, 3);
    HP.scene.clearAll(true);
    await U.wait(600);
    if (g !== undefined && g !== gen) return;

    const m = C.MODES[run.mode];
    const bossBonus = run.boss ? 4 : 0;
    let essence = Math.round((3 + run.round * 1.2 + bossBonus) * m.rewardMult) + run.pendingEssence;
    let gold = Math.round((5 + run.round * 2) * m.rewardMult) + run.pendingGold;
    if (has('gold+')) gold = Math.round(gold * 1.5);
    // interest: savings pay off — +1 gold per 20 held, capped at +10
    const interest = Math.min(10, Math.floor(HP.save.meta.gold / 20));
    gold += interest;

    const meta = HP.save.meta;
    meta.essence += essence; meta.gold += gold;
    meta.totals.essenceEarned += essence; meta.totals.goldEarned += gold;
    meta.totals.rounds++;
    if (run.round > meta.records[run.mode].bestRound) meta.records[run.mode].bestRound = run.round;
    if (run.mode === 'daily' && meta.daily && run.round > meta.daily.bestRound) meta.daily.bestRound = run.round;
    run.bankedEssence += essence; run.bankedGold += gold;
    run.pendingGold = 0; run.pendingEssence = 0;
    HP.save.saveNow();

    C.grantFeat('firstblood');
    if (meta.gold >= 100) C.grantFeat('rich');
    if (run.mode === 'endless' && run.round >= 15) C.grantFeat('deepvigil');

    if (isFinalRound()) {
      await runEnd(true);
      return;
    }

    // blessing offer
    const pool = C.BLESSINGS.filter(b => !run.blessings.includes(b.id));
    const choices = U.shuffle([...pool], Math.random).slice(0, 3);

    run.phase = 'blessing';
    run.blessingChoices = choices.map(b => b.id);
    run.blessingRewards = { essence, gold, interest };
    saveSnapshot();

    HP.ui.roundEnd(run, { essence, gold, interest }, choices,
      (bid) => { // on blessing pick
        run.blessings.push(bid);
        HP.audio.sfx('bless');
        if (run.blessings.length >= 5) C.grantFeat('sainthood');
      },
      () => { // on continue -> visit The Reliquary before the next round
        openShop();
      });
  }

  // ---------- shop: The Reliquary ----------
  function rollShopStock() {
    const pool = C.SHOP_ITEMS.filter(it => {
      if (it.id === 'favor') return C.BLESSINGS.some(b => !run.blessings.includes(b.id));
      if (it.id === 'indulgence') return !run.indulgence; // one pending at a time
      return true;
    });
    const picks = U.shuffle([...pool], Math.random).slice(0, 5);
    const altar = run.shop ? run.shop.altar : !!run.boss; // rerolls keep the altar open
    run.shop = { stock: picks.map(item => ({ item, sold: false })), altar };
  }

  function openShop() {
    run.shopBuys = 0;
    run.shopRerolls = 0; // reroll price escalates per visit, not per run
    rollShopStock();
    run.phase = 'shop';
    saveSnapshot();
    HP.ui.showShop(run);
  }

  function rerollCost() { return 8 + run.shopRerolls * 4; }

  function rerollShop() {
    const meta = HP.save.meta;
    const cost = rerollCost();
    if (meta.gold < cost) { HP.audio.sfx('error'); HP.ui.toast(`need ${cost - meta.gold} more gold`); return; }
    meta.gold -= cost;
    run.shopRerolls++;
    HP.save.save();
    HP.audio.sfx('click');
    rollShopStock();
    saveSnapshot();
    HP.ui.showShop(run);
  }

  function buyShop(slot) {
    if (!run || !run.shop) return;
    const s = run.shop.stock[slot];
    if (!s || s.sold) return;
    const meta = HP.save.meta;
    if (meta.gold < s.item.cost) { HP.audio.sfx('error'); HP.ui.toast(`need ${s.item.cost - meta.gold} more gold`); return; }
    meta.gold -= s.item.cost;
    s.sold = true;
    run.shopBuys = (run.shopBuys || 0) + 1;
    if (run.shopBuys >= 3) C.grantFeat('patron');
    applyShopItem(s.item);
    HP.save.saveNow();
    saveSnapshot();
    HP.audio.sfx('buy');
    HP.ui.showShop(run);
  }

  function grantXpTo(id, amount) {
    const st = C.cardState(id);
    if (st.lv >= C.MAX_LEVEL) { HP.ui.toast(`${C.cardName(id)} is already transcendent`); return; }
    const gained = C.addXp(id, amount);
    if (gained.length) {
      const isAwaken = gained.includes(5) || gained.includes(10);
      HP.audio.sfx(isAwaken ? 'awaken' : 'levelup');
      HP.ui.toast(`${C.cardName(id)} → Lv.${st.lv}` + (isAwaken ? ' · ' + C.TIER_NAMES[C.tierOf(st.lv)] : ''), true);
    } else {
      HP.ui.toast(`${C.cardName(id)} +${amount} XP`);
    }
  }

  function grantShopXp(count, amount) {
    const pool = C.ALL_IDS.filter(id => C.cardState(id).lv < C.MAX_LEVEL);
    if (!pool.length) { HP.ui.toast('all cards are transcendent!'); return; }
    const ids = U.shuffle(pool, Math.random).slice(0, count);
    for (const id of ids) grantXpTo(id, amount);
  }

  function applyShopItem(item) {
    const meta = HP.save.meta;
    switch (item.id) {
      case 'tithe':
      case 'chest': {
        const n = item.id === 'tithe' ? 8 : 22;
        meta.essence += n;
        meta.totals.essenceEarned += n;
        run.bankedEssence += n;
        HP.ui.toast(`+${n} essence`, true);
        break;
      }
      case 'scroll': grantShopXp(1, 80); break;
      case 'tome': grantShopXp(3, 50); break;
      case 'sigilhigh': {
        const best = [...C.ALL_IDS].sort((a, b) => C.cardState(b).lv - C.cardState(a).lv || C.cardState(b).xp - C.cardState(a).xp)
          .find(id => C.cardState(id).lv < C.MAX_LEVEL);
        if (best) grantXpTo(best, 100);
        else HP.ui.toast('all cards are transcendent!');
        break;
      }
      case 'sigillow': {
        const lows = C.ALL_IDS.filter(id => C.cardState(id).lv < C.MAX_LEVEL)
          .sort((a, b) => C.cardState(a).lv - C.cardState(b).lv || C.cardState(a).xp - C.cardState(b).xp).slice(0, 3);
        if (!lows.length) { HP.ui.toast('all cards are transcendent!'); break; }
        for (const id of lows) grantXpTo(id, 60);
        break;
      }
      case 'miracle': {
        // a FULL level for your strongest climber — worth its price at high levels
        const best = [...C.ALL_IDS].sort((a, b) => C.cardState(b).lv - C.cardState(a).lv || C.cardState(b).xp - C.cardState(a).xp)
          .find(id => C.cardState(id).lv < C.MAX_LEVEL);
        if (best) grantXpTo(best, C.xpForLevel(C.cardState(best).lv));
        else HP.ui.toast('all cards are transcendent!');
        break;
      }
      case 'candle': run.bonusChips += 30; run.relics.push('candle'); HP.ui.toast('+30 base chips every hand this run'); break;
      case 'horn': run.bonusMult += 2; run.relics.push('horn'); HP.ui.toast('+2 base mult every hand this run'); break;
      case 'chalice': run.bonusHands++; run.relics.push('chalice'); HP.ui.toast('+1 hand every round this run'); break;
      case 'censer': run.bonusDiscards++; run.relics.push('censer'); HP.ui.toast('+1 discard every round this run'); break;
      case 'gauntlet': run.bonusHandSize++; run.relics.push('gauntlet'); HP.ui.toast('+1 hand size this run'); break;
      case 'favor': {
        const pool = C.BLESSINGS.filter(b => !run.blessings.includes(b.id));
        if (pool.length) {
          const b = U.pick(pool, Math.random);
          run.blessings.push(b.id);
          HP.audio.sfx('bless');
          HP.ui.toast(`blessing gained: ${b.name}`, true);
          if (run.blessings.length >= 5) C.grantFeat('sainthood');
        }
        break;
      }
      case 'indulgence': run.indulgence = true; HP.ui.toast("next round's target −15%"); break;
    }
  }

  function leaveShop() {
    if (!run) return;
    run.shop = null;
    startRound(run.round + 1);
  }

  async function runEnd(win) {
    if (!run || run.ended) return; // never end the same run twice
    const g = gen;
    run.ended = true;
    HP.scene.setInteractive(false);
    busy = true;
    clearSnapshot();
    const meta = HP.save.meta;
    if (win) {
      meta.records[run.mode].wins++;
      if (run.mode === 'standard') C.grantFeat('ascended');
      if (run.mode === 'bossrush') C.grantFeat('crusader');
      if (run.mode === 'daily') C.grantFeat('rited');
      if (run.mode === 'daily' && meta.daily) meta.daily.won = true;
      HP.audio.sfx('roundwin');
      HP.scene.burst(new THREE.Vector3(0, 2, 0), '#ffd97a', 60, 3.5);
    } else {
      HP.audio.sfx('lose');
      HP.scene.clearAll(true);
    }
    HP.save.saveNow();
    await U.wait(700);
    if (g !== gen || !run) return; // run was replaced/menu'd during the beat
    HP.ui.runEnd(win, run);
  }

  function abandonRun() {
    if (!run || run.ended) return;
    gen++; // kill any in-flight scoring coroutine at its next await
    busy = false;
    runEnd(false);
  }

  function ariseAgain() {
    const mode = run ? run.mode : 'standard';
    startRun(mode);
  }

  function toMenu() {
    gen++;
    run = null;
    busy = false;
    HP.scene.setInteractive(false);
    HP.scene.menuMode();
    HP.ui.refreshMenu();
    HP.ui.showScreen('menu');
  }

  // ---------- run persistence (survive PWA eviction / reload) ----------
  function saveSnapshot() {
    if (!run || run.ended) return;
    const s = {
      v: 1,
      mode: run.mode, seedStr: run.seedStr,
      round: run.round, score: run.score, target: run.target,
      handsLeft: run.handsLeft, discardsLeft: run.discardsLeft,
      deck: [...run.deck], hand: [...run.hand],
      blessings: [...run.blessings], relics: [...run.relics],
      bossId: run.boss ? run.boss.id : null,
      silencedSuit: run.silencedSuit,
      usedBosses: [...run.usedBosses],
      nextBoss: run.nextBoss ? { ...run.nextBoss } : null,
      bonusHands: run.bonusHands, bonusDiscards: run.bonusDiscards,
      bonusHandSize: run.bonusHandSize, bonusChips: run.bonusChips, bonusMult: run.bonusMult,
      indulgence: run.indulgence,
      shopRerolls: run.shopRerolls, shopBuys: run.shopBuys,
      shop: run.shop ? { altar: run.shop.altar, stock: run.shop.stock.map(x => ({ id: x.item.id, sold: x.sold })) } : null,
      bankedEssence: run.bankedEssence, bankedGold: run.bankedGold,
      pendingGold: run.pendingGold, pendingEssence: run.pendingEssence,
      sort: run.sort === 'custom' ? 'custom' : run.sort,
      totalScored: run.totalScored,
      stats: { ...run.stats },
      phase: run.phase,
      blessingChoices: run.blessingChoices ? [...run.blessingChoices] : null,
      blessingRewards: run.blessingRewards ? { ...run.blessingRewards } : null,
    };
    HP.save.meta.pendingRun = s;
    HP.save.save();
  }

  function clearSnapshot() {
    if (HP.save.meta.pendingRun) {
      HP.save.meta.pendingRun = null;
      HP.save.save();
    }
  }

  function pendingRun() { return HP.save.meta.pendingRun || null; }

  function resumeRun() {
    const s = pendingRun();
    if (!s || s.v !== 1 || !C.MODES[s.mode]) { clearSnapshot(); return false; }
    gen++;
    run = freshRun(s.mode);
    Object.assign(run, {
      seedStr: s.seedStr,
      round: s.round, score: s.score, target: s.target,
      handsLeft: s.handsLeft, discardsLeft: s.discardsLeft,
      deck: [...s.deck], hand: [...s.hand],
      blessings: [...s.blessings], relics: [...(s.relics || [])],
      boss: s.bossId ? C.BOSSES.find(b => b.id === s.bossId) || null : null,
      silencedSuit: s.silencedSuit,
      usedBosses: [...s.usedBosses],
      nextBoss: s.nextBoss ? { ...s.nextBoss } : null,
      bonusHands: s.bonusHands, bonusDiscards: s.bonusDiscards,
      bonusHandSize: s.bonusHandSize, bonusChips: s.bonusChips, bonusMult: s.bonusMult,
      indulgence: s.indulgence,
      shopRerolls: s.shopRerolls, shopBuys: s.shopBuys,
      shop: s.shop ? {
        altar: s.shop.altar,
        stock: s.shop.stock.map(x => ({ item: C.SHOP_ITEMS.find(it => it.id === x.id), sold: x.sold })).filter(x => x.item),
      } : null,
      bankedEssence: s.bankedEssence, bankedGold: s.bankedGold,
      pendingGold: s.pendingGold, pendingEssence: s.pendingEssence,
      sort: s.sort,
      totalScored: s.totalScored,
      stats: { ...s.stats },
      phase: s.phase,
      blessingChoices: s.blessingChoices ? [...s.blessingChoices] : null,
      blessingRewards: s.blessingRewards ? { ...s.blessingRewards } : null,
    });
    HP.scene.gameMode();

    if (run.phase === 'shop' && run.shop) {
      HP.ui.showShop(run);
      busy = false;
      return true;
    }
    if (run.phase === 'blessing' && run.blessingChoices) {
      const choices = run.blessingChoices.map(id => C.BLESSINGS.find(b => b.id === id)).filter(Boolean);
      HP.ui.roundEnd(run, run.blessingRewards || { essence: 0, gold: 0, interest: 0 }, choices,
        (bid) => {
          run.blessings.push(bid);
          HP.audio.sfx('bless');
          if (run.blessings.length >= 5) C.grantFeat('sainthood');
        },
        () => openShop());
      busy = false;
      return true;
    }
    // mid-round: restore the table
    (async () => {
      const g = gen;
      busy = true;
      HP.ui.updateHUD(run);
      HP.ui.showScreen('hud');
      await HP.scene.syncHand(run.hand);
      if (g !== gen) return;
      HP.ui.updateHUD(run);
      HP.ui.updateButtons(run);
      // the snapshot commits hands as spent BEFORE scoring — a reload during
      // the very last hand resumes with nothing left to play
      if (run.score < run.target && (run.handsLeft <= 0 || run.hand.length === 0)) {
        HP.ui.toast('the interrupted hand was forfeit');
        await runEnd(false);
        return;
      }
      busy = false;
      HP.scene.setInteractive(true);
      HP.ui.toast('run restored — ' + `round ${run.round}`);
    })();
    return true;
  }

  // wire scene input
  function bindScene() {
    HP.scene.onCardClick = onCardClick;
    HP.scene.onReorder = reorderHand;
  }

  return {
    get run() { return run; },
    get busy() { return busy; },
    startRun, playHand, discard, toggleSort, evalSelection, predictSelection,
    clearSelection, abandonRun, ariseAgain, toMenu, bindScene, maxPlay,
    buyShop, rerollShop, rerollCost, leaveShop,
    pendingRun, resumeRun, clearSnapshot,
  };
})();
