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
      case 'H': return Math.round((12 + 7 * (lv - 1)) * face * tm); // buffed: +chips must keep pace with the mult economy
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
    if (gained.some(l => l >= 5)) {
      grantFeat('awaken1');
      if (awakenedCount() >= 13) grantFeat('host13');
    }
    if (gained.includes(MAX_LEVEL)) grantFeat('transcend1');
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
  // Three categories; every shop rolls 2 META + 2 RUN + 1 TACTICAL so a visit
  // always has something permanent, something for this run, and a cheap play.
  // Round-1 income (~8g) affords exactly one tactical or the tithe box.
  const SHOP_ITEMS = [
    // META — permanent progression (essence / XP)
    { id: 'tithe',      cat: 'meta', icon: '⟠', name: 'TITHE BOX',        desc: '+8 essence, banked instantly',             cost: 8 },
    { id: 'chest',      cat: 'meta', icon: '✦', name: 'RELIQUARY CHEST',  desc: '+25 essence, banked instantly',            cost: 30 },
    { id: 'scroll',     cat: 'meta', icon: '✎', name: 'BLESSED SCROLL',   desc: '+100 XP to a random card',                 cost: 16 },
    { id: 'tome',       cat: 'meta', icon: '❦', name: 'GILDED TOME',      desc: '+60 XP to 3 random cards',                 cost: 30 },
    { id: 'sigilhigh',  cat: 'meta', icon: '▲', name: 'ASCENDANT SIGIL',  desc: '+150 XP to your highest-level card',       cost: 26 },
    { id: 'sigillow',   cat: 'meta', icon: '♁', name: "SHEPHERD'S SIGIL", desc: '+50 XP to each of your 3 lowest cards',    cost: 20 },
    { id: 'miracle',    cat: 'meta', icon: '✧', name: 'SMALL MIRACLE',    desc: 'your highest card gains a full level',     cost: 40 },
    // RUN — this run only (shown as relics in the HUD)
    { id: 'candle',     cat: 'run',  icon: '❋', name: 'VOTIVE CANDLE',    desc: '+40 base chips on every hand this run',    cost: 18 },
    { id: 'horn',       cat: 'run',  icon: '♪', name: 'WAR HYMN',         desc: '+3 base mult on every hand this run',      cost: 28 },
    { id: 'chalice',    cat: 'run',  icon: '✚', name: 'CHALICE OF VIGOR', desc: '+1 hand every round this run',             cost: 32 },
    { id: 'censer',     cat: 'run',  icon: '⟲', name: 'CENSER OF RENEWAL',desc: '+1 discard every round this run',          cost: 20 },
    { id: 'gauntlet',   cat: 'run',  icon: '▤', name: 'REACHING GAUNTLET',desc: '+1 hand size this run',                    cost: 36 },
    { id: 'calf',       cat: 'run',  icon: '●', name: 'GOLDEN CALF',      desc: '+1 gold for every card scored this run',   cost: 30 },
    { id: 'favor',      cat: 'run',  icon: '☩', name: "SAINT'S FAVOR",    desc: 'gain a random blessing',                   cost: 42 },
    // TACTICAL — cheap one-shots for the coming round
    { id: 'indulgence', cat: 'tac',  icon: '✟', name: 'INDULGENCE',       desc: "next round's chip target −15%",            cost: 10 },
    { id: 'beads',      cat: 'tac',  icon: '☨', name: 'PRAYER BEADS',     desc: 'your next hand scores ×1.5',               cost: 14 },
    { id: 'flask',      cat: 'tac',  icon: '⚱', name: "PILGRIM'S FLASK",  desc: '+1 hand next round',                       cost: 9 },
  ];

  // ---- feats (achievements; persistent, each pays 25 gold once) ----
  const FEATS = [
    { id: 'firstblood',  name: 'FIRST LIGHT',        desc: 'clear your first round' },
    { id: 'awaken1',     name: 'THE AWAKENING',      desc: 'awaken a card (Lv.5)' },
    { id: 'transcend1',  name: 'TRANSCENDENCE',      desc: 'transcend a card (Lv.10)' },
    { id: 'host13',      name: 'THE AWAKENED HOST',  desc: 'have 13 awakened cards' },
    { id: 'sfeat',       name: 'DIVINE ORDER',       desc: 'play a straight flush' },
    { id: 'royal',       name: 'HAND OF GOD',        desc: 'play a royal flush' },
    { id: 'bighand',     name: 'MIRACLE',            desc: 'score 10,000 in one hand' },
    { id: 'gianthand',   name: 'REVELATION',         desc: 'score 100,000 in one hand' },
    { id: 'comeback',    name: 'DELIVERANCE',        desc: 'clear a round on your final hand' },
    { id: 'sainthood',   name: 'SAINTHOOD',          desc: 'hold 5 blessings in one run' },
    { id: 'patron',      name: 'PATRON OF THE ARTS', desc: 'buy 3 relics in one shop visit' },
    { id: 'rich',        name: 'TITHE OVERFLOWING',  desc: 'hold 100 gold' },
    { id: 'ascended',    name: 'ASCENDED',           desc: 'win a Pilgrimage' },
    { id: 'crusader',    name: 'CRUSADER',           desc: 'win a Crusade' },
    { id: 'rited',       name: 'DAILY DEVOTION',     desc: 'win a Daily Rite' },
    { id: 'deepvigil',   name: 'DEEP VIGIL',         desc: 'reach round 15 in Endless' },
    { id: 'beyond',      name: 'BEYOND THE GATE',    desc: 'continue a won Pilgrimage into Endless' },
    { id: 'chapelroyal', name: 'HOUSE OF THE LORD',  desc: 'draw a royal flush in the Chapel of Chance' },
    { id: 'chapelbig',   name: 'PROVIDENCE',         desc: 'win 200+ gold on one Chapel hand' },
  ];
  const FEAT_GOLD = 25;

  function grantFeat(id) {
    const meta = HP.save.meta;
    if (!meta.feats) meta.feats = {};
    if (meta.feats[id]) return false;
    const f = FEATS.find(x => x.id === id);
    if (!f) return false;
    meta.feats[id] = Date.now();
    meta.gold += FEAT_GOLD;
    meta.totals.goldEarned += FEAT_GOLD;
    HP.save.save();
    if (HP.ui) HP.ui.toast(`☩ FEAT: ${f.name} (+${FEAT_GOLD}●)`, true);
    if (HP.audio) HP.audio.sfx('bless');
    return true;
  }

  const awakenedCount = () =>
    ALL_IDS.filter(id => (HP.save.meta.cards[id] || { lv: 1 }).lv >= 5).length;

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
    FEATS, grantFeat,
  };
})();
