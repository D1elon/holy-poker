// ============ HOLY POKER — utilities: tweens, rng, helpers ============
window.HP = window.HP || {};

HP.util = (function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // easing
  const ease = {
    linear: t => t,
    outQuad: t => 1 - (1 - t) * (1 - t),
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inCubic: t => t * t * t,
    outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outElastic: t => {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
    },
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  };

  // seeded rng (mulberry32)
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function shuffle(arr, rnd) {
    rnd = rnd || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  const pick = (arr, rnd) => arr[Math.floor((rnd || Math.random)() * arr.length)];

  function fmt(n) {
    n = Math.round(n);
    if (n >= 1e15) return (n / 1e15).toFixed(2).replace(/\.?0+$/, '') + 'Q';
    if (n >= 1e12) return (n / 1e12).toFixed(2).replace(/\.?0+$/, '') + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (n >= 100000) return (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'K';
    return n.toLocaleString('en-US');
  }

  // ---- tween manager ----
  const tweens = [];
  function tween(opts) {
    // {dur, delay=0, ease='outCubic', onUpdate(t), onComplete()}
    const tw = {
      t: -(opts.delay || 0),
      dur: Math.max(0.001, opts.dur),
      ease: ease[opts.ease || 'outCubic'] || ease.outCubic,
      onUpdate: opts.onUpdate || null,
      onComplete: opts.onComplete || null,
      dead: false,
    };
    tweens.push(tw);
    return tw;
  }
  function tweenProps(obj, to, opts) {
    const from = {};
    for (const k in to) from[k] = obj[k];
    return tween({
      dur: opts.dur, delay: opts.delay, ease: opts.ease,
      onUpdate: t => { for (const k in to) obj[k] = lerp(from[k], to[k], t); if (opts.onUpdate) opts.onUpdate(t); },
      onComplete: opts.onComplete,
    });
  }
  function updateTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (tw.dead) { tweens.splice(i, 1); continue; }
      tw.t += dt;
      if (tw.t < 0) continue;
      const p = clamp(tw.t / tw.dur, 0, 1);
      if (tw.onUpdate) tw.onUpdate(tw.ease(p));
      if (p >= 1) {
        tweens.splice(i, 1);
        if (tw.onComplete) tw.onComplete();
      }
    }
  }
  const killTween = tw => { if (tw) tw.dead = true; };

  // paced waits honor the player's speed setting (scoring/deal pacing)
  const wait = ms => {
    const sp = (window.HP && HP.save && HP.save.meta.settings.speed) || 1;
    return new Promise(res => setTimeout(res, ms / sp));
  };

  // animated number counter on a DOM element
  function countUp(el, from, to, dur, fmtFn) {
    fmtFn = fmtFn || fmt;
    tween({
      dur, ease: 'outQuad',
      onUpdate: t => { el.textContent = fmtFn(lerp(from, to, t)); },
      onComplete: () => { el.textContent = fmtFn(to); },
    });
  }

  return { clamp, lerp, ease, mulberry32, hashStr, shuffle, pick, fmt, tween, tweenProps, updateTweens, killTween, wait, countUp };
})();
