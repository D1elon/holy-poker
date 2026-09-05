// ============ HOLY POKER — Chapel of Chance: Jacks-or-Better video poker ============
// A menu minigame that wagers meta gold on the 3D table. Reuses the scene's
// deal / hold (selection badges relabelled "HOLD") / discard primitives.
window.HP = window.HP || {};

HP.chapel = (function () {
  const U = HP.util, C = HP.cards, P = HP.poker;
  const $ = id => document.getElementById(id);

  const BETS = [5, 10, 25, 50, 100];
  // multiplier of the bet — classic 9/6 Jacks-or-Better
  const PAY = [
    { key: 'royal',         name: 'ROYAL FLUSH',      x: 250 },
    { key: 'straightflush', name: 'STRAIGHT FLUSH',   x: 50 },
    { key: 'four',          name: 'FOUR OF A KIND',   x: 25 },
    { key: 'fullhouse',     name: 'FULL HOUSE',       x: 9 },
    { key: 'flush',         name: 'FLUSH',            x: 6 },
    { key: 'straight',      name: 'STRAIGHT',         x: 4 },
    { key: 'three',         name: 'THREE OF A KIND',  x: 3 },
    { key: 'twopair',       name: 'TWO PAIR',         x: 2 },
    { key: 'jacks',         name: 'JACKS OR BETTER',  x: 1 },
  ];

  let state = null; // { phase, bet, deck, hand, held:Set, last:{name,win,key} }
  let betIdx = 1;
  let prevClick = null;

  function enter() {
    prevClick = HP.scene.onCardClick;
    HP.scene.onCardClick = onCardClick;
    HP.scene.setBadgeLabel(() => 'HOLD');
    HP.scene.gameMode();
    state = { phase: 'bet', bet: BETS[betIdx], deck: [], hand: [], held: new Set(), last: null };
    HP.ui.showScreen('chapel');
    render();
  }

  function leave() {
    if (!state) return;
    if (state.phase === 'dealing' || state.phase === 'drawing') return; // let the cards land first
    HP.scene.setInteractive(false);
    HP.scene.clearAll(true);
    HP.scene.onCardClick = prevClick;
    HP.scene.setBadgeLabel(null);
    state = null;
    HP.audio.sfx('click');
    HP.game.toMenu();
  }

  function onCardClick(id) {
    if (!state || state.phase !== 'draw') return;
    if (state.held.has(id)) { state.held.delete(id); HP.audio.sfx('deselect'); }
    else { state.held.add(id); HP.audio.sfx('select'); }
    HP.scene.setSelected(state.held);
    render();
  }

  async function deal() {
    if (!state || (state.phase !== 'bet' && state.phase !== 'done')) return;
    const meta = HP.save.meta;
    const bet = BETS[betIdx];
    if (meta.gold < bet) { HP.audio.sfx('error'); HP.ui.toast('not enough gold for that bet'); return; }
    meta.gold -= bet;
    meta.chapel.wagered += bet;
    meta.chapel.hands++;
    HP.save.save();
    state.bet = bet;
    state.phase = 'dealing';
    state.last = null;
    HP.scene.setInteractive(false);
    HP.audio.sfx('buy');
    if (state.hand.length) { HP.scene.clearAll(true); await U.wait(380); }
    if (!state) return;
    state.deck = U.shuffle([...C.ALL_IDS], Math.random);
    state.hand = state.deck.splice(0, 5);
    state.held = new Set();
    render();
    await HP.scene.syncHand(state.hand);
    if (!state) return;
    state.phase = 'draw';
    HP.scene.setInteractive(true);
    render();
  }

  async function draw() {
    if (!state || state.phase !== 'draw') return;
    state.phase = 'drawing';
    HP.scene.setInteractive(false);
    render();
    const kept = state.hand.filter(id => state.held.has(id));
    const tossed = state.hand.filter(id => !state.held.has(id));
    state.held = new Set();
    HP.scene.setSelected(state.held);
    if (tossed.length) await HP.scene.discardCards(tossed);
    if (!state) return;
    state.hand = [...kept, ...state.deck.splice(0, tossed.length)];
    await HP.scene.syncHand(state.hand);
    if (!state) return;
    await U.wait(200);
    if (!state) return;
    resolve();
  }

  function payoutFor(ids) {
    const ev = P.evaluate(ids);
    let key = ev.key;
    if (key === 'pair') { // only jacks or better pays
      const counts = {};
      ids.forEach(id => { const r = P.rankOf(id); counts[r] = (counts[r] || 0) + 1; });
      const pr = Object.keys(counts).find(r => counts[r] === 2);
      key = ['J', 'Q', 'K', 'A'].includes(pr) ? 'jacks' : 'none';
    }
    const row = PAY.find(p => p.key === key);
    return { key: row ? row.key : 'none', name: row ? row.name : ev.name, mult: row ? row.x : 0 };
  }

  function resolve() {
    const { key, name, mult } = payoutFor(state.hand);
    const win = mult * state.bet;
    const meta = HP.save.meta;
    state.phase = 'done';
    state.last = { key, name, win };
    const mid = new THREE.Vector3(0, 1.5, 1);
    if (win > 0) {
      meta.gold += win;
      meta.chapel.won += win;
      meta.totals.goldEarned += win;
      if (win > meta.chapel.bestWin) meta.chapel.bestWin = win;
      for (const id of state.hand) HP.scene.pulseCard(id, '#ffd97a');
      HP.scene.floatText(mid, name, '#ffd97a', true);
      setTimeout(() => { if (state) HP.scene.floatText(new THREE.Vector3(0, 1.0, 1), '+' + win + ' ●', '#ffd97a', true); }, 380);
      HP.scene.burst(mid, '#ffd97a', Math.min(60, 10 + win / 3), 2.4);
      HP.scene.shake(Math.min(0.3, 0.04 + win / 600));
      HP.audio.sfx(mult >= 9 ? 'bigscore' : mult >= 3 ? 'roundwin' : 'goldp');
      if (key === 'royal') C.grantFeat('chapelroyal');
      if (win >= 200) C.grantFeat('chapelbig');
    } else {
      HP.scene.floatText(mid, name, '#8a8a9a', true);
      HP.audio.sfx('error');
    }
    HP.save.saveNow();
    render();
  }

  function setBet(i) {
    if (!state || (state.phase !== 'bet' && state.phase !== 'done')) return;
    betIdx = i;
    state.bet = BETS[i];
    HP.audio.sfx('click');
    render();
  }

  function action() {
    if (!state) return;
    if (state.phase === 'draw') draw();
    else deal();
  }

  // ---------- DOM ----------
  function render() {
    if (!state) return;
    const meta = HP.save.meta;
    $('chapel-gold').textContent = U.fmt(meta.gold);

    // paytable, current bet column highlighted; winning row lit
    const pt = $('chapel-paytable');
    pt.innerHTML = PAY.map(p => {
      const hit = state.last && state.last.key === p.key;
      return `<tr class="${hit ? 'hit' : ''}"><td>${p.name}</td><td>×${p.x}</td><td>${U.fmt(p.x * state.bet)}</td></tr>`;
    }).join('');

    // bets
    const bb = $('chapel-bets');
    bb.innerHTML = '';
    const canBet = state.phase === 'bet' || state.phase === 'done';
    BETS.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.className = 'seg-btn' + (i === betIdx ? ' on' : '');
      btn.textContent = b + '●';
      btn.disabled = !canBet || meta.gold < b;
      btn.addEventListener('click', () => setBet(i));
      bb.appendChild(btn);
    });

    // action + status
    const act = $('btn-chapel-action');
    const st = $('chapel-status');
    switch (state.phase) {
      case 'bet':
        act.textContent = `DEAL (${state.bet}●)`; act.disabled = meta.gold < state.bet;
        st.textContent = 'choose a bet and deal — hold cards, then draw';
        break;
      case 'dealing': case 'drawing':
        act.textContent = '…'; act.disabled = true;
        st.textContent = state.phase === 'dealing' ? 'dealing…' : 'drawing…';
        break;
      case 'draw':
        act.textContent = state.held.size === 5 ? 'STAND' : 'DRAW'; act.disabled = false;
        st.textContent = state.held.size ? `holding ${state.held.size} — draw to replace the rest` : 'tap cards to HOLD, then draw';
        break;
      case 'done':
        act.textContent = `DEAL AGAIN (${state.bet}●)`; act.disabled = meta.gold < state.bet;
        st.textContent = state.last.win > 0 ? `${state.last.name} — won ${state.last.win} gold` : `${state.last.name} — no payout`;
        break;
    }
    $('btn-chapel-leave').disabled = state.phase === 'dealing' || state.phase === 'drawing';
  }

  return { enter, leave, deal, draw, action, setBet, BETS, PAY, get state() { return state; } };
})();
