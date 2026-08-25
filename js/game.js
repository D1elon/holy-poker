// ============ HOLY POKER — run state machine & scoring ============
window.HP = window.HP || {};

HP.game = (function () {
  const U = HP.util, C = HP.cards, P = HP.poker;

  let run = null;
  let busy = false;

  function newRng(mode) {
    if (C.MODES[mode].seeded) {
      const today = new Date().toISOString().slice(0, 10);
      return U.mulberry32(U.hashStr('HOLYPOKER|' + today));
    }
    return Math.random;
  }

  // ---------- run lifecycle ----------
  function startRun(mode) {
    run = {
      mode,
      rng: newRng(mode),
      round: 0,
      score: 0, target: 0,
      handsMax: 4, discardsMax: 3, handSize: 8,
      handsLeft: 0, discardsLeft: 0,
      deck: [], hand: [], selected: new Set(),
      blessings: [],
      boss: null, silencedSuit: null,
      usedBosses: [],
      bonusHands: 0, bonusDiscards: 0, bonusHandSize: 0,
      bonusChips: 0, bonusMult: 0,
      indulgence: false, shopRerolls: 0, shop: null,
      bankedEssence: 0, bankedGold: 0,
      pendingGold: 0, pendingEssence: 0,
      sort: 'rank',
      totalScored: 0,
    };
    HP.save.meta.totals.runs++;
    HP.save.meta.records[mode].runs++;
    HP.save.save();
    HP.scene.gameMode();
    HP.ui.showScreen('hud');
    startRound(1);
  }

  function has(bid) { return run && run.blessings.includes(bid); }

  async function startRound(n) {
    busy = true;
    run.round = n;
    run.score = 0;
    run.selected.clear();

    // boss
    run.boss = null; run.silencedSuit = null;
    if (C.isBossRound(n, run.mode)) {
      const pool = C.BOSSES.filter(b => !run.usedBosses.includes(b.id));
      const src = pool.length ? pool : C.BOSSES;
      run.boss = U.pick(src, run.rng === Math.random ? Math.random : run.rng);
      run.usedBosses.push(run.boss.id);
      if (run.boss.silences) {
        run.silencedSuit = U.pick(C.SUITS, run.rng === Math.random ? Math.random : run.rng);
      }
      HP.audio.sfx('boss');
    }

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

    // fresh shuffled deck each round
    run.deck = U.shuffle([...C.ALL_IDS], run.rng === Math.random ? Math.random : run.rng);
    run.hand = [];

    HP.scene.clearAll(false);
    HP.ui.updateHUD(run);
    HP.ui.showScreen('hud');
    await refill();
    HP.ui.updateHUD(run);
    HP.ui.updateButtons(run);
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
    run.sort = run.sort === 'rank' ? 'suit' : 'rank'; // from 'custom' -> back to rank
    sortHand();
    HP.scene.syncHand(run.hand);
    HP.ui.updateButtons(run);
    HP.audio.sfx('click');
  }

  // player dragged a card to a new slot — their order IS the scoring order
  function reorderHand(ids) {
    if (!run) return;
    if (ids.length !== run.hand.length) return;
    const a = [...ids].sort(), b = [...run.hand].sort();
    if (a.some((v, i) => v !== b[i])) return; // must be the same card set
    if (ids.every((v, i) => v === run.hand[i])) return; // unchanged
    run.hand = [...ids];
    run.sort = 'custom';
    HP.ui.updateButtons(run);
  }

  // ---------- selection ----------
  function onCardClick(id) {
    if (busy || !run) return;
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

  // ---------- scoring ----------
  const suitBlessing = { H: 'hearts+', C: 'clubs+', S: 'spades+', D: 'diamonds+' };

  async function playHand() {
    if (busy || !run || run.selected.size === 0) return;
    const ev = evalSelection();
    if (!ev) return;
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

    await HP.scene.playCards(played);

    // scoring
    let chips = ev.chips;
    let mult = ev.mult;
    HP.ui.showScoring(ev.name);
    HP.ui.setChips(chips); HP.ui.setMult(mult);
    await U.wait(360);

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
        if (times === 2 && k === 0) await U.wait(stepDelay * 0.5);
      }

      // XP
      const xpGain = Math.round((3 + run.round) * (has('xp2') ? 2 : 1));
      const gained = C.addXp(id, xpGain);
      for (const lv of gained) levelEvents.push({ id, lv });

      await U.wait(stepDelay * 0.45);
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
    }

    // total
    mult = Math.round(mult * 100) / 100;
    const total = Math.round(chips * mult);
    await U.wait(200);
    HP.ui.showTotal(total);
    HP.audio.sfx(total >= run.target * 0.5 ? 'bigscore' : 'tally', 4);
    HP.scene.shake(Math.min(0.4, 0.06 + total / (run.target * 4)));
    const mid = new THREE.Vector3(0, 1.2, 1);
    if (total >= run.target * 0.5) HP.scene.burst(mid, '#ffd97a', 26, 2.2);

    run.score += total;
    run.totalScored += total;
    HP.save.meta.totals.hands++;
    if (total > HP.save.meta.totals.bestHand) HP.save.meta.totals.bestHand = total;
    if (total > HP.save.meta.records[run.mode].bestScore) HP.save.meta.records[run.mode].bestScore = total;
    for (const id of played) C.cardState(id).chips += Math.round(total / played.length);
    HP.save.save();

    await U.wait(650);
    HP.ui.hideScoring();
    HP.ui.updateHUD(run);
    await HP.scene.discardPlayed();

    if (run.score >= run.target) {
      await roundClear();
      return;
    }
    if (run.handsLeft <= 0) {
      await runEnd(false);
      return;
    }
    await refill();
    HP.ui.updateButtons(run);
    busy = false;
    HP.scene.setInteractive(true);
  }

  async function discard() {
    if (busy || !run || run.selected.size === 0 || run.discardsLeft <= 0) return;
    busy = true;
    HP.scene.setInteractive(false);
    run.discardsLeft--;
    const ids = run.hand.filter(id => run.selected.has(id));
    run.hand = run.hand.filter(id => !run.selected.has(id));
    run.selected.clear();
    HP.scene.setSelected(run.selected);
    HP.ui.hidePreview();
    HP.ui.updateHUD(run);
    await HP.scene.discardCards(ids);
    await refill();
    HP.ui.updateButtons(run);
    busy = false;
    HP.scene.setInteractive(true);
  }

  // ---------- round / run end ----------
  function isFinalRound() {
    const m = C.MODES[run.mode];
    return isFinite(m.rounds) && run.round >= m.rounds;
  }

  async function roundClear() {
    HP.scene.setInteractive(false);
    HP.audio.sfx('roundwin');
    HP.scene.burst(new THREE.Vector3(0, 1.5, 1.5), '#ffd97a', 40, 3);
    HP.scene.clearAll(true);
    await U.wait(600);

    const m = C.MODES[run.mode];
    const bossBonus = run.boss ? 4 : 0;
    let essence = Math.round((3 + run.round * 1.2 + bossBonus) * m.rewardMult) + run.pendingEssence;
    let gold = Math.round((5 + run.round * 2) * m.rewardMult) + run.pendingGold;
    if (has('gold+')) gold = Math.round(gold * 1.5);
    // interest: savings pay off — +1 gold per 10 held, capped at +5
    const interest = Math.min(5, Math.floor(HP.save.meta.gold / 10));
    gold += interest;

    const meta = HP.save.meta;
    meta.essence += essence; meta.gold += gold;
    meta.totals.essenceEarned += essence; meta.totals.goldEarned += gold;
    meta.totals.rounds++;
    if (run.round > meta.records[run.mode].bestRound) meta.records[run.mode].bestRound = run.round;
    run.bankedEssence += essence; run.bankedGold += gold;
    run.pendingGold = 0; run.pendingEssence = 0;
    HP.save.saveNow();

    if (isFinalRound()) {
      await runEnd(true);
      return;
    }

    // blessing offer
    const pool = C.BLESSINGS.filter(b => !run.blessings.includes(b.id));
    const rnd = run.rng === Math.random ? Math.random : run.rng;
    const choices = U.shuffle([...pool], rnd).slice(0, 3);

    HP.ui.roundEnd(run, { essence, gold, interest }, choices,
      (bid) => { // on blessing pick
        run.blessings.push(bid);
        HP.audio.sfx('bless');
      },
      () => { // on continue -> visit The Reliquary before the next round
        openShop();
      });
  }

  // ---------- shop: The Reliquary ----------
  function runRnd() { return run.rng === Math.random ? Math.random : run.rng; }

  function rollShopStock() {
    const pool = C.SHOP_ITEMS.filter(it => {
      if (it.id === 'favor') return C.BLESSINGS.some(b => !run.blessings.includes(b.id));
      return true;
    });
    const picks = U.shuffle([...pool], runRnd()).slice(0, 5);
    const altar = run.shop ? run.shop.altar : !!run.boss; // rerolls keep the altar open
    run.shop = { stock: picks.map(item => ({ item, sold: false })), altar };
  }

  function openShop() {
    rollShopStock();
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
    applyShopItem(s.item);
    HP.save.saveNow();
    HP.audio.sfx('buy');
    HP.ui.showShop(run);
  }

  function grantXpTo(id, amount) {
    const gained = C.addXp(id, amount);
    const st = C.cardState(id);
    if (gained.length) {
      const isAwaken = gained.includes(5) || gained.includes(10);
      HP.audio.sfx(isAwaken ? 'awaken' : 'levelup');
      HP.ui.toast(`${C.cardName(id)} → Lv.${st.lv}` + (isAwaken ? ' · ' + C.TIER_NAMES[C.tierOf(st.lv)] : ''), true);
    } else {
      HP.ui.toast(`${C.cardName(id)} +${amount} XP`);
    }
  }

  function grantShopXp(count, amount) {
    const ids = U.shuffle([...C.ALL_IDS], runRnd()).slice(0, count);
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
        const lows = [...C.ALL_IDS].sort((a, b) => C.cardState(a).lv - C.cardState(b).lv || C.cardState(a).xp - C.cardState(b).xp).slice(0, 3);
        for (const id of lows) grantXpTo(id, 60);
        break;
      }
      case 'miracle': {
        const pool = C.ALL_IDS.filter(id => C.cardState(id).lv < C.MAX_LEVEL);
        if (pool.length) {
          const id = U.pick(pool, runRnd());
          const st = C.cardState(id);
          grantXpTo(id, C.xpForLevel(st.lv) - st.xp); // exactly one full level
        } else HP.ui.toast('all cards are transcendent!');
        break;
      }
      case 'candle': run.bonusChips += 30; HP.ui.toast('+30 base chips every hand this run'); break;
      case 'horn': run.bonusMult += 2; HP.ui.toast('+2 base mult every hand this run'); break;
      case 'chalice': run.bonusHands++; HP.ui.toast('+1 hand every round this run'); break;
      case 'censer': run.bonusDiscards++; HP.ui.toast('+1 discard every round this run'); break;
      case 'gauntlet': run.bonusHandSize++; HP.ui.toast('+1 hand size this run'); break;
      case 'favor': {
        const pool = C.BLESSINGS.filter(b => !run.blessings.includes(b.id));
        if (pool.length) {
          const b = U.pick(pool, runRnd());
          run.blessings.push(b.id);
          HP.audio.sfx('bless');
          HP.ui.toast(`blessing gained: ${b.name}`, true);
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
    HP.scene.setInteractive(false);
    busy = true;
    const meta = HP.save.meta;
    if (win) {
      meta.records[run.mode].wins++;
      HP.audio.sfx('roundwin');
      HP.scene.burst(new THREE.Vector3(0, 2, 0), '#ffd97a', 60, 3.5);
    } else {
      HP.audio.sfx('lose');
      HP.scene.clearAll(true);
    }
    HP.save.saveNow();
    await U.wait(700);
    HP.ui.runEnd(win, run);
  }

  function abandonRun() {
    if (!run) return;
    runEnd(false);
  }

  function ariseAgain() {
    const mode = run ? run.mode : 'standard';
    startRun(mode);
  }

  function toMenu() {
    run = null;
    busy = false;
    HP.scene.setInteractive(false);
    HP.scene.menuMode();
    HP.ui.refreshMenu();
    HP.ui.showScreen('menu');
  }

  // wire scene input
  function bindScene() {
    HP.scene.onCardClick = onCardClick;
    HP.scene.onReorder = reorderHand;
  }

  return {
    get run() { return run; },
    get busy() { return busy; },
    startRun, playHand, discard, toggleSort, evalSelection,
    abandonRun, ariseAgain, toMenu, bindScene, maxPlay,
    buyShop, rerollShop, rerollCost, leaveShop,
  };
})();
