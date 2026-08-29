// ============ HOLY POKER — WebAudio engine: bus + reverb + musical sfx ============
// All sound is synthesized. Signal path:
//   voices -> sfx/music bus -> master gain -> compressor -> out
//   plus a per-bus send into a generated-impulse convolution reverb.
window.HP = window.HP || {};

HP.audio = (function () {
  let ctx = null;
  let master, comp, musicGain, sfxGain, reverb, revGain, sfxSend, musSend;
  let started = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();

      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 22;
      comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.24;
      comp.connect(ctx.destination);

      master = ctx.createGain();
      master.connect(comp);

      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain.connect(master);
      sfxGain.connect(master);

      // cathedral tail: generated impulse response. Return path is high-passed
      // so the long tail keeps shimmer without stacking low-mid mud.
      reverb = ctx.createConvolver();
      reverb.buffer = makeImpulse(2.6, 2.9);
      const revHP = ctx.createBiquadFilter();
      revHP.type = 'highpass'; revHP.frequency.value = 280;
      revGain = ctx.createGain(); revGain.gain.value = 0.55;
      reverb.connect(revHP); revHP.connect(revGain); revGain.connect(master);
      sfxSend = ctx.createGain(); sfxSend.gain.value = 0.2;
      musSend = ctx.createGain(); musSend.gain.value = 0.26;
      sfxGain.connect(sfxSend); sfxSend.connect(reverb);
      musicGain.connect(musSend); musSend.connect(reverb);

      applyVolumes();
      return true;
    } catch (e) {
      // partial init must not poison future attempts
      try { if (ctx) ctx.close(); } catch (_) { /* already dead */ }
      ctx = null;
      return false;
    }
  }

  function makeImpulse(dur, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * dur);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function applyVolumes() {
    if (!ctx) return;
    const s = HP.save.meta.settings;
    master.gain.value = s.master * s.master;
    musicGain.gain.value = s.music * s.music * 0.55;
    sfxGain.gain.value = s.sfx * s.sfx;
    // silenced music shouldn't keep burning CPU scheduling oscillators
    if (s.music === 0 || s.master === 0) stopMusic();
    else if (started && !musicOn) startMusic();
  }

  // ---------- voice helpers ----------
  function adsr(g, t0, a, peak, d, sus, r) {
    const p = Math.max(peak, 0.0001), su = Math.max(sus, 0.0001);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + a);
    g.gain.exponentialRampToValueAtTime(su, t0 + a + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
  }

  // basic oscillator voice, optional filter + pitch glide
  function tone(o) {
    const t0 = o.t, dur = o.dur;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glide), t0 + (o.glideT || dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    let head = osc;
    if (o.lp || o.hp) {
      const f = ctx.createBiquadFilter();
      f.type = o.lp ? 'lowpass' : 'highpass';
      f.frequency.value = o.lp || o.hp;
      f.Q.value = o.q || 0.8;
      osc.connect(f); head = f;
    }
    head.connect(g); g.connect(o.dest || sfxGain);
    adsr(g, t0, o.a || 0.008, o.vol, dur * (o.dr || 0.3), o.vol * (o.sus || 0.2), dur * (o.rr || 0.7));
    osc.start(t0); osc.stop(t0 + dur + 0.15);
  }

  // filtered noise burst; freq can sweep
  function noise(o) {
    const t0 = o.t, dur = o.dur;
    const len = Math.max(1, Math.floor(ctx.sampleRate * (dur + 0.05)));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 2000, t0);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.sweep), t0 + dur);
    f.Q.value = o.q || 0.9;
    const g = ctx.createGain();
    src.connect(f); f.connect(g); g.connect(o.dest || sfxGain);
    adsr(g, t0, o.a || 0.005, o.vol, dur * 0.3, o.vol * 0.15, dur * 0.7);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // marimba-ish pluck: fundamental + soft 2.76x partial, fast decay
  function pluck(freq, t0, vol, dest) {
    tone({ freq, t: t0, dur: 0.32, vol, a: 0.004, dr: 0.25, sus: 0.05, rr: 0.75, dest });
    tone({ freq: freq * 2.76, t: t0, dur: 0.14, vol: vol * 0.28, a: 0.003, dr: 0.2, sus: 0.03, rr: 0.8, dest });
  }

  // metallic coin: two inharmonic partials, very fast decay
  function coin(t0, vol) {
    tone({ freq: 2093, t: t0, dur: 0.1, vol: vol, a: 0.002, dr: 0.2, sus: 0.04, rr: 0.8 });
    tone({ freq: 2794, t: t0 + 0.004, dur: 0.13, vol: vol * 0.7, a: 0.002, dr: 0.2, sus: 0.04, rr: 0.8 });
    tone({ freq: 3520, t: t0 + 0.01, dur: 0.08, vol: vol * 0.3, a: 0.002, dr: 0.2, sus: 0.03, rr: 0.8 });
  }

  // slow choir-ish swell (detuned triangles through gentle lowpass feel)
  function swell(freqs, t0, dur, vol) {
    freqs.forEach(fr => {
      [-7, 6].forEach(dt => {
        tone({ freq: fr, t: t0, dur, vol: vol, a: dur * 0.35, dr: 0.3, sus: 0.55, rr: 0.35, type: 'triangle', detune: dt, lp: 2400 });
      });
    });
  }

  const PENT = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5];

  // ---------- SFX bank ----------
  const sfxBank = {
    click(t)    { noise({ t, dur: 0.04, vol: 0.1, freq: 1600, q: 1.4 }); tone({ freq: 740, t, dur: 0.04, vol: 0.05, type: 'triangle' }); },
    hover(t)    { noise({ t, dur: 0.025, vol: 0.04, freq: 2400, q: 1.6 }); },
    select(t)   { pluck(659.25, t, 0.13); pluck(987.77, t + 0.035, 0.1); },
    deselect(t) { pluck(523.25, t, 0.11); pluck(392, t + 0.035, 0.08); },
    deal(t) {
      noise({ t, dur: 0.13, vol: 0.16, freq: 500, sweep: 2600, q: 0.7 });
      noise({ t: t + 0.1, dur: 0.035, vol: 0.14, freq: 3200, q: 2 }); // snap
    },
    play(t) {
      noise({ t, dur: 0.18, vol: 0.22, freq: 400, sweep: 1800, q: 0.6 });
      tone({ freq: 190, t: t + 0.02, dur: 0.12, vol: 0.16, glide: 95, type: 'triangle' });
    },
    chip(t, n)  { pluck(PENT[(n || 0) % PENT.length], t, 0.14); },
    multhit(t, n) {
      tone({ freq: 220 + (n || 0) * 26, t, dur: 0.13, vol: 0.15, type: 'sawtooth', lp: 1300, q: 1.1 });
      tone({ freq: 82, t, dur: 0.09, vol: 0.1, type: 'sine', glide: 55 });
    },
    xmult(t) {
      pluck(783.99, t, 0.13); pluck(987.77, t + 0.05, 0.13); pluck(1318.5, t + 0.1, 0.15);
      noise({ t: t + 0.05, dur: 0.3, vol: 0.05, freq: 7000, type: 'highpass' });
    },
    goldp(t)    { coin(t, 0.15); },
    tally(t, n) { pluck(700 + (n || 0) * 45, t, 0.07); },
    bigscore(t) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => pluck(f, t + i * 0.045, 0.16));
      tone({ freq: 62, t, dur: 0.24, vol: 0.22, glide: 40, type: 'sine' }); // sub thump
      noise({ t: t + 0.08, dur: 0.45, vol: 0.07, freq: 6500, type: 'highpass' });
    },
    discard(t) {
      noise({ t, dur: 0.14, vol: 0.15, freq: 2100, sweep: 480, q: 0.7 });
      noise({ t: t + 0.05, dur: 0.03, vol: 0.08, freq: 1400, q: 2 });
      noise({ t: t + 0.1, dur: 0.03, vol: 0.06, freq: 1100, q: 2 });
    },
    error(t) {
      tone({ freq: 138, t, dur: 0.1, vol: 0.14, type: 'sawtooth', lp: 700 });
      tone({ freq: 116, t: t + 0.09, dur: 0.13, vol: 0.13, type: 'sawtooth', lp: 600 });
    },
    roundwin(t) {
      // harp gliss up the pentatonic + a warm swell underneath
      [0, 1, 2, 3, 4, 5, 6, 7].forEach(i => pluck(PENT[i], t + i * 0.055, 0.13));
      swell([261.63, 329.63, 392], t, 1.4, 0.05);
    },
    lose(t) {
      [392, 349.23, 311.13, 261.63].forEach((f, i) => {
        tone({ freq: f, t: t + i * 0.17, dur: 0.34, vol: 0.1, type: 'sawtooth', lp: 900 });
        tone({ freq: f / 2, t: t + i * 0.17, dur: 0.36, vol: 0.1, type: 'triangle' });
      });
      tone({ freq: 55, t: t + 0.68, dur: 0.8, vol: 0.14, type: 'sine' });
    },
    levelup(t) {
      tone({ freq: 170, t, dur: 0.45, vol: 0.1, glide: 1250, glideT: 0.38, type: 'sawtooth', lp: 2600 });
      [1046.5, 1318.5, 1568].forEach((f, i) => pluck(f, t + 0.34 + i * 0.06, 0.13));
    },
    awaken(t) {
      tone({ freq: 85, t, dur: 0.8, vol: 0.14, glide: 950, glideT: 0.68, type: 'sawtooth', lp: 2200 });
      swell([523.25, 659.25, 783.99], t + 0.3, 1.5, 0.05);
      [783.99, 987.77, 1174.7, 1568, 1976].forEach((f, i) => pluck(f, t + 0.62 + i * 0.07, 0.13));
      noise({ t: t + 0.62, dur: 0.55, vol: 0.06, freq: 7000, type: 'highpass' });
    },
    boss(t) {
      [82.4, 77.8, 61.7].forEach((f, i) => {
        tone({ freq: f * 2, t: t + i * 0.26, dur: 0.4, vol: 0.13, type: 'sawtooth', lp: 500, glide: f * 1.7 });
        tone({ freq: f, t: t + i * 0.26, dur: 0.5, vol: 0.15, type: 'sine' });
      });
      noise({ t, dur: 1.0, vol: 0.05, freq: 120, type: 'lowpass' });
    },
    buy(t)  { coin(t, 0.14); pluck(1046.5, t + 0.07, 0.12); },
    bless(t) {
      swell([523.25, 659.25, 783.99], t, 1.2, 0.06);
      pluck(1568, t + 0.15, 0.11);
    },
  };

  function sfx(name, arg) {
    if (!ensure()) return;
    const fn = sfxBank[name];
    if (fn) fn(ctx.currentTime + 0.001, arg);
  }

  // ---------- generative music: sacred minor progression ----------
  let musicOn = false;
  let musicTimer = null;
  let step = 0;
  const PROG = [
    [220.0, 261.63, 329.63],                 // Am
    [174.61, 220.0, 261.63],                 // F
    [130.81, 164.81, 196.0].map(f => f * 2), // C
    [196.0, 246.94, 293.66],                 // G
    [220.0, 261.63, 329.63],                 // Am
    [174.61, 220.0, 261.63],                 // F
    [164.81, 207.65, 246.94],                // E
    [164.81, 207.65, 246.94],                // E
  ];
  const BAR = 2.0;

  function scheduleBar(when, chord, barIdx) {
    // organ pad: detuned pairs, filtered dark
    chord.forEach(f => {
      [[0, 0.045], [-1200, 0.03]].forEach(([dt, v]) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), flt = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = dt + (Math.random() * 8 - 4);
        flt.type = 'lowpass'; flt.frequency.value = 820; flt.Q.value = 0.6;
        o.connect(flt); flt.connect(g); g.connect(musicGain);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(v, when + 0.5);
        g.gain.setValueAtTime(v, when + BAR - 0.5);
        g.gain.linearRampToValueAtTime(0.0001, when + BAR + 0.15);
        o.start(when); o.stop(when + BAR + 0.25);
      });
    });
    // bell arp, sparse and humanized
    const arpNotes = [chord[0] * 2, chord[1] * 2, chord[2] * 2, chord[1] * 4];
    for (let i = 0; i < 4; i++) {
      if ((barIdx + i) % 3 === 0) continue;
      const t0 = when + i * (BAR / 4) + 0.02 + Math.random() * 0.012;
      pluck(arpNotes[i % arpNotes.length], t0, 0.045, musicGain);
    }
    // deep bass root
    const b = ctx.createOscillator(), bg = ctx.createGain();
    b.type = 'sine'; b.frequency.value = chord[0] / 2;
    b.connect(bg); bg.connect(musicGain);
    bg.gain.setValueAtTime(0.0001, when);
    bg.gain.linearRampToValueAtTime(0.1, when + 0.3);
    bg.gain.setValueAtTime(0.1, when + BAR - 0.4);
    bg.gain.linearRampToValueAtTime(0.0001, when + BAR);
    b.start(when); b.stop(when + BAR + 0.1);
  }

  // audio-clock lookahead scheduler: timers can be late (heavy frames,
  // backgrounded tabs) — bars are pinned to ctx.currentTime, never wall time,
  // so lateness under the lookahead window is inaudible and tempo never drifts.
  let nextBarTime = 0;
  function musicLoop() {
    if (!musicOn || !ctx) return;
    // after a long suspension, skip the missed bars instead of bursting them
    if (nextBarTime < ctx.currentTime - 0.05) nextBarTime = ctx.currentTime + 0.1;
    while (nextBarTime < ctx.currentTime + 0.45) {
      scheduleBar(nextBarTime, PROG[step % PROG.length], step);
      step++;
      nextBarTime += BAR;
    }
    musicTimer = setTimeout(musicLoop, 120);
  }

  function startMusic() {
    if (!ensure() || musicOn) return;
    musicOn = true; step = 0;
    nextBarTime = ctx.currentTime + 0.15;
    musicLoop();
  }
  function stopMusic() {
    musicOn = false;
    if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
  }

  // don't schedule music into a hidden tab (iOS suspends timers anyway;
  // this makes the resume clean instead of a burst)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopMusic();
    else if (started && HP.save.meta.settings.music > 0 && HP.save.meta.settings.master > 0) startMusic();
  });

  // unlock audio on first interaction
  function userGesture() {
    if (started) return;
    started = true;
    ensure();
    startMusic();
  }
  window.addEventListener('pointerdown', userGesture, { once: false });
  window.addEventListener('keydown', userGesture, { once: false });

  return { sfx, startMusic, stopMusic, applyVolumes };
})();
