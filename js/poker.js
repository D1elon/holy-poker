// ============ HOLY POKER — poker hand evaluation & base values ============
window.HP = window.HP || {};

HP.poker = (function () {
  // base chips / mult per hand type (Balatro-flavored)
  const HANDS = {
    high:          { name: 'HIGH CARD',      chips: 5,   mult: 1 },
    pair:          { name: 'PAIR',           chips: 10,  mult: 2 },
    twopair:       { name: 'TWO PAIR',       chips: 20,  mult: 2 },
    three:         { name: 'THREE OF A KIND',chips: 30,  mult: 3 },
    straight:      { name: 'STRAIGHT',       chips: 30,  mult: 4 },
    flush:         { name: 'FLUSH',          chips: 35,  mult: 4 },
    fullhouse:     { name: 'FULL HOUSE',     chips: 40,  mult: 4 },
    four:          { name: 'FOUR OF A KIND', chips: 60,  mult: 7 },
    straightflush: { name: 'STRAIGHT FLUSH', chips: 100, mult: 8 },
    royal:         { name: 'ROYAL FLUSH',    chips: 100, mult: 10 },
  };

  const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const RANK_VALUE = { // chip value contributed by each card
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 10, 'Q': 10, 'K': 10, 'A': 11,
  };

  const suitOf = id => id[0];
  const rankOf = id => id.slice(1);
  const rankIdx = id => RANK_ORDER.indexOf(rankOf(id));

  // longest consecutive run among a set of rank indices (ace counts high AND low)
  function bestRun(idxSet) {
    if (idxSet.size === 0) return 0;
    const idxs = [...idxSet];
    if (idxSet.has(12)) idxs.push(-1); // ace also sits below the 2 for the wheel
    idxs.sort((a, b) => a - b);
    let run = 1, best = 1;
    for (let i = 1; i < idxs.length; i++) {
      run = (idxs[i] === idxs[i - 1] + 1) ? run + 1 : 1;
      best = Math.max(best, run);
    }
    return best;
  }

  // evaluate 1-5 card ids. opts: {shortcut: bool} = straights/flushes need only 4 cards.
  // The BEST combination among any subset of the played cards sets the hand type —
  // kickers never downgrade a made hand (all played cards still score individually).
  function evaluate(ids, opts) {
    opts = opts || {};
    const n = ids.length;
    if (n === 0) return null;

    const counts = {};
    for (const id of ids) {
      const r = rankOf(id);
      counts[r] = (counts[r] || 0) + 1;
    }
    const groups = Object.values(counts).sort((a, b) => b - a);

    const need = opts.shortcut ? 4 : 5;

    // flush: at least `need` played cards share a suit
    const bySuit = {};
    for (const id of ids) (bySuit[suitOf(id)] = bySuit[suitOf(id)] || []).push(id);
    const flushSuit = Object.keys(bySuit).find(s => bySuit[s].length >= need) || null;
    const isFlush = !!flushSuit;

    // straight: a run of at least `need` distinct consecutive ranks
    const isStraight = bestRun(new Set(ids.map(rankIdx))) >= need;

    // straight flush: the run must live within one suit
    let isSF = false, isRoyal = false;
    if (flushSuit) {
      const suitRanks = new Set(bySuit[flushSuit].map(rankIdx));
      isSF = bestRun(suitRanks) >= need;
      if (isSF) {
        isRoyal = ['10', 'J', 'Q', 'K', 'A'].every(r => bySuit[flushSuit].some(id => rankOf(id) === r));
      }
    }

    let key;
    if (isSF) key = isRoyal ? 'royal' : 'straightflush';
    else if (groups[0] === 4) key = 'four';
    else if (groups[0] === 3 && groups[1] === 2) key = 'fullhouse';
    else if (isFlush) key = 'flush';
    else if (isStraight) key = 'straight';
    else if (groups[0] === 3) key = 'three';
    else if (groups[0] === 2 && groups[1] === 2) key = 'twopair';
    else if (groups[0] === 2) key = 'pair';
    else key = 'high';

    const base = HANDS[key];
    return { key, name: base.name, chips: base.chips, mult: base.mult };
  }

  return { HANDS, RANK_ORDER, RANK_VALUE, evaluate, suitOf, rankOf, rankIdx };
})();
