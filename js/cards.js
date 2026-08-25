// ============ HOLY POKER — card abilities, leveling, blessings, bosses, modes ============
window.HP = window.HP || {};

HP.cards = (function () {
  const SUITS = ['S', 'H', 'C', 'D'];
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const ALL_IDS = [];
  for (const s of SUITS) for (const r of RANKS) ALL_IDS.push(s + r);

  // ︎ forces text presentation — iOS otherwise renders these as color emoji
  const SUIT_INFO = {
    H: { name: 'Hearts',   theme: 'GRACE',    icon: '♥︎', color: '#ff8fa3' },
    D: { name: 'Diamonds', theme: 'BOUNTY',   icon: '♦︎', color: '#ffd97a' },
    C: { name: 'Clubs',    theme: 'WRATH',    icon: '♣︎', color: '#ff6e6e' },
    S: { name: 'Spades',   theme: 'JUDGMENT', icon: '♠︎', color: '#a78bfa' },
  };

  const MAX_LEVEL = 10;

  // ---- leveling / XP ----
  const xpForLevel = lv => Math.round(18 * Math.pow(lv, 1.55)); // xp to go from lv -> lv+1
  const tierOf = lv => (lv >= 10 ? 2 : lv >= 5 ? 1 : 0);
  const TIER_NAMES = ['', 'AWAKENED', 'TRANSCENDENT'];
  const TIER_MULT = [1, 1.5, 2];

  function rankTier(lv) {
    if (lv >= 10) return 'S';
    if (lv >= 9) return 'A';
    if (lv >= 7) return 'B';
    if (lv >= 5) return 'C';
    if (lv >= 3) return 'D';
    return 'E';
  }

  const isFace = id => ['J', 'Q', 'K', 'A'].includes(id.slice(1));

  // ---- abilities (magnitude at a given level) ----
  // Hearts: +chips | Clubs: +mult | Spades: xmult | Diamonds: +gold (+essence awakened)
  function abilityValue(id, lv) {
    const suit = id[0];
    const face = isFace(id) ? 1.5 : 1;
    const tm = TIER_MULT[tierOf(lv)];
    switch (suit) {
      case 'H': return Math.round((8 + 5 * (lv - 1)) * face * tm);
      case 'C': return Math.round((2 + 1 * (lv - 1)) * face * tm);
      case 'S': {
        const x = 1 + (0.05 + 0.04 * (lv - 1)) * face * tm;
        return Math.round(x * 100) / 100;
      }
      case 'D': return Math.round((2 + 1 * (lv - 1)) * face * tm);
    }
    return 0;
  }

  // compact form for the in-scene badge over selected cards
  function shortAbility(id, lv) {
    const v = abilityValue(id, lv);
    switch (id[0]) {
      case 'H': return `+${v} CHIPS`;
      case 'C': return `+${v} MULT`;
      case 'S': return `×${v.toFixed(2)} MULT`;
      case 'D': return `+${v} GOLD`;
    }
    return '';
  }

  function abilityDesc(id, lv) {
    const v = abilityValue(id, lv);
    switch (id[0]) {
      case 'H': return `+${v} CHIPS when scored`;
      case 'C': return `+${v} MULT when scored`;
      case 'S': return `×${v.toFixed(2)} MULT when scored`;
      case 'D': return `+${v} GOLD when scored` + (tierOf(lv) >= 1 ? ' · +1 ESSENCE' : '');
    }
    return '';
  }

  // ---- flavor names ----
  const RANK_TITLES = {
    '2': 'Acolyte', '3': 'Novice', '4': 'Deacon', '5': 'Cleric', '6': 'Vicar',
    '7': 'Prior', '8': 'Abbot', '9': 'Bishop', '10': 'Cardinal',
    J: 'Knight', Q: 'Oracle', K: 'Sovereign', A: 'Archangel',
  };
  const SUIT_EPITHETS = {
    H: 'of Sacred Grace', D: 'of Gilded Bounty', C: 'of Righteous Wrath', S: 'of Final Judgment',
  };
  const cardName = id => `${RANK_TITLES[id.slice(1)]} ${SUIT_EPITHETS[id[0]]}`;

  // ---- persistent card state helpers ----
  function cardState(id) { return HP.save.card(id); }

  // add xp; returns array of levels reached (for FX), applies save
  function addXp(id, amount) {
    const c = cardState(id);
    const gained = [];
    if (c.lv >= MAX_LEVEL) return gained;
    c.xp += amount;
    HP.save.meta.totals.xpEarned += amount;
    while (c.lv < MAX_LEVEL && c.xp >= xpForLevel(c.lv)) {
      c.xp -= xpForLevel(c.lv);
      c.lv++;
      gained.push(c.lv);
      HP.save.meta.totals.levelups++;
    }
    if (c.lv >= MAX_LEVEL) c.xp = 0;
    HP.save.save();
    return gained;
  }

  // essence infusion pricing
  const INFUSE_COST = 5, INFUSE_XP = 30;

  // ---- blessings (run-scoped buffs) ----
  const BLESSINGS = [
    { id: 'hand+', icon: '✚', name: 'EXTRA HAND', desc: '+1 hand every round' },
    { id: 'discard+', icon: '⟲', name: 'EXTRA DISCARD', desc: '+1 discard every round' },
    { id: 'size+', icon: '▤', name: 'WIDE GRIP', desc: '+1 hand size' },
    { id: 'chips+', icon: '▦', name: 'FOUNDATION', desc: '+40 base chips on every hand' },
    { id: 'mult+', icon: '✕', name: 'ZEAL', desc: '+3 base mult on every hand' },
    { id: 'xp2', icon: '✦', name: 'ENLIGHTENMENT', desc: 'cards gain double XP this run' },
    { id: 'shortcut', icon: '⌁', name: 'SHORTCUT', desc: 'straights & flushes need only 4 cards' },
    { id: 'hearts+', icon: '♥︎', name: 'GRACE RISING', desc: 'Hearts effects +50%' },
    { id: 'clubs+', icon: '♣︎', name: 'WRATH RISING', desc: 'Clubs effects +50%' },
    { id: 'spades+', icon: '♠︎', name: 'JUDGMENT RISING', desc: 'Spades effects +50%' },
    { id: 'diamonds+', icon: '♦︎', name: 'BOUNTY RISING', desc: 'Diamonds effects +50%' },
    { id: 'pairs+', icon: '⚭', name: 'COMMUNION', desc: 'Pairs, Two Pairs & Full Houses: ×1.5 mult' },
    { id: 'gold+', icon: '●', name: 'TITHE', desc: '+50% gold from round rewards' },
    { id: 'firstcard', icon: '➀', name: 'FIRST LIGHT', desc: 'first scored card triggers twice' },
  ];

  // ---- bosses ----
  const BOSSES = [
    { id: 'censor', name: 'THE CENSOR', desc: 'A random suit is silenced — its abilities do not trigger', silences: true },
    { id: 'tax', name: 'THE TITHE-MASTER', desc: 'Chip target increased by 50%', targetMult: 1.5 },
    { id: 'fatigue', name: 'THE FATIGUE', desc: 'One fewer hand this round', hands: -1 },
    { id: 'drought', name: 'THE DROUGHT', desc: 'One fewer discard this round', discards: -1 },
    { id: 'chains', name: 'THE CHAINS', desc: 'Play at most 4 cards per hand', maxPlay: 4 },
    { id: 'veil', name: 'THE VEIL', desc: 'Hand preview is hidden', hidePreview: true },
  ];

  // ---- shop wares (The Reliquary, between rounds; priced in gold) ----
  const SHOP_ITEMS = [
    { id: 'tithe',      icon: '⟠', name: 'TITHE BOX',        desc: '+8 essence, banked instantly',           cost: 12 },
    { id: 'chest',      icon: '✦', name: 'RELIQUARY CHEST',  desc: '+22 essence, banked instantly',          cost: 32 },
    { id: 'scroll',     icon: '✎', name: 'BLESSED SCROLL',   desc: '+80 XP to a random card',                cost: 18 },
    { id: 'tome',       icon: '❦', name: 'GILDED TOME',      desc: '+50 XP to 3 random cards',               cost: 35 },
    { id: 'sigilhigh',  icon: '▲', name: 'ASCENDANT SIGIL',  desc: '+100 XP to your highest-level card',     cost: 25 },
    { id: 'sigillow',   icon: '♁', name: "SHEPHERD'S SIGIL", desc: '+60 XP to each of your 3 lowest cards',  cost: 20 },
    { id: 'miracle',    icon: '✧', name: 'SMALL MIRACLE',    desc: 'a random card gains a full level',       cost: 45 },
    { id: 'candle',     icon: '❋', name: 'VOTIVE CANDLE',    desc: '+30 base chips on every hand this run',  cost: 22 },
    { id: 'horn',       icon: '♪', name: 'WAR HYMN',         desc: '+2 base mult on every hand this run',    cost: 30 },
    { id: 'chalice',    icon: '✚', name: 'CHALICE OF VIGOR', desc: '+1 hand every round this run',           cost: 38 },
    { id: 'censer',     icon: '⟲', name: 'CENSER OF RENEWAL',desc: '+1 discard every round this run',        cost: 26 },
    { id: 'gauntlet',   icon: '▤', name: 'REACHING GAUNTLET',desc: '+1 hand size this run',                  cost: 45 },
    { id: 'favor',      icon: '☩', name: "SAINT'S FAVOR",    desc: 'gain a random blessing',                 cost: 40 },
    { id: 'indulgence', icon: '✟', name: 'INDULGENCE',       desc: "next round's chip target −15%",          cost: 15 },
  ];

  // ---- game modes ----
  const MODES = {
    standard: {
      id: 'standard', icon: '✟', name: 'PILGRIMAGE',
      desc: '12 rounds. A boss guards every 3rd. Clear them all to ascend.',
      rounds: 12, bossEvery: 3, rewardMult: 1,
    },
    endless: {
      id: 'endless', icon: '∞', name: 'ENDLESS VIGIL',
      desc: 'No end. Targets grow forever. How deep is your faith?',
      rounds: Infinity, bossEvery: 3, rewardMult: 1,
    },
    daily: {
      id: 'daily', icon: '❂', name: 'DAILY RITE',
      desc: "Today's seeded trial — same deal, same bosses, for everyone.",
      rounds: 12, bossEvery: 3, rewardMult: 1.25, seeded: true,
    },
    bossrush: {
      id: 'bossrush', icon: '☠︎', name: 'CRUSADE',
      desc: 'Every round is a boss. Rewards ×1.5. For veterans.',
      rounds: 9, bossEvery: 1, rewardMult: 1.5,
    },
  };

  // chip target curve
  function targetFor(round, mode) {
    const base = 280 * Math.pow(1.55, round - 1);
    const bossBump = isBossRound(round, mode) ? 1.35 : 1;
    return Math.round(base * bossBump / 10) * 10;
  }
  function isBossRound(round, mode) {
    const m = MODES[mode];
    if (m.bossEvery === 1) return true;
    return round % m.bossEvery === 0;
  }
  const actOf = round => Math.floor((round - 1) / 3) + 1;

  return {
    SUITS, RANKS, ALL_IDS, SUIT_INFO, MAX_LEVEL,
    xpForLevel, tierOf, TIER_NAMES, TIER_MULT, rankTier, isFace,
    abilityValue, abilityDesc, shortAbility, cardName, cardState, addXp,
    INFUSE_COST, INFUSE_XP,
    BLESSINGS, BOSSES, SHOP_ITEMS, MODES, targetFor, isBossRound, actOf,
  };
})();
