// ============ HOLY POKER — persistent save (localStorage) ============
window.HP = window.HP || {};

HP.save = (function () {
  const KEY = 'holy-poker-save-v1';

  function defaults() {
    return {
      version: 1,
      essence: 0,
      gold: 0,
      cards: {},           // id -> {lv, xp, plays, chips}
      styles: { unlocked: ['classic'], active: 'classic' },
      settings: {
        master: 0.8, music: 0.55, sfx: 0.85,
        shake: true, crt: true, pixel: 3, // pixelation divisor
      },
      records: {
        standard: { bestRound: 0, wins: 0, runs: 0, bestScore: 0 },
        endless:  { bestRound: 0, wins: 0, runs: 0, bestScore: 0 },
        daily:    { bestRound: 0, wins: 0, runs: 0, bestScore: 0 },
        bossrush: { bestRound: 0, wins: 0, runs: 0, bestScore: 0 },
      },
      totals: {
        runs: 0, rounds: 0, hands: 0, bestHand: 0,
        essenceEarned: 0, goldEarned: 0, levelups: 0, xpEarned: 0,
      },
    };
  }

  let meta = null;

  function deepMerge(base, over) {
    for (const k in over) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) &&
          base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        deepMerge(base[k], over[k]);
      } else {
        base[k] = over[k];
      }
    }
    return base;
  }

  function load() {
    if (meta) return meta;
    meta = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) deepMerge(meta, JSON.parse(raw));
    } catch (e) { console.warn('save load failed', e); }
    return meta;
  }

  let saveTimer = null;
  function save() {
    // debounce writes slightly
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try { localStorage.setItem(KEY, JSON.stringify(meta)); }
      catch (e) { console.warn('save write failed', e); }
    }, 200);
  }
  function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try { localStorage.setItem(KEY, JSON.stringify(meta)); }
    catch (e) { console.warn('save write failed', e); }
  }

  function reset() {
    meta = defaults();
    saveNow();
  }

  function card(id) {
    const m = load();
    if (!m.cards[id]) m.cards[id] = { lv: 1, xp: 0, plays: 0, chips: 0 };
    return m.cards[id];
  }

  window.addEventListener('beforeunload', saveNow);

  return { load, save, saveNow, reset, card, get meta() { return load(); } };
})();
