'use strict';
/* Retro RTS — 배경음악 · 효과음 (효과음은 코드로 합성) */
(function () {
  const A = { bgmVol: 0.6, sfxVol: 0.7, cur: null, tracks: {}, ctx: null, last: {}, unlocked: false };
  R.Audio = A;
  const SRC = { menu: 'assets/bgm/menu.mp3', peace: 'assets/bgm/peace.mp3', battle: 'assets/bgm/battle.mp3' };

  A.init = function () {
    for (const k in SRC) {
      const a = new Audio(); a.src = SRC[k]; a.loop = true; a.preload = k === 'menu' ? 'auto' : 'metadata'; a.volume = 0;
      A.tracks[k] = { el: a, v: 0, target: 0 };
    }
    const unlock = () => {
      if (A.unlocked) return; A.unlocked = true;
      try { A.ctx = new (window.AudioContext || window.webkitAudioContext)(); A.master = A.ctx.createGain(); A.master.connect(A.ctx.destination); A.master.gain.value = A.sfxVol; A.noise = makeNoise(A.ctx); } catch (e) { A.ctx = null; }
      if (A.cur) A.play(A.cur, true);
    };
    addEventListener('pointerdown', unlock, { capture: true }); addEventListener('keydown', unlock, { capture: true });
    let lastT = performance.now();
    const fade = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      for (const k in A.tracks) {
        const t = A.tracks[k];
        const tg = t.target * A.bgmVol;
        if (Math.abs(t.v - tg) > 0.001) {
          t.v += Math.sign(tg - t.v) * Math.min(Math.abs(tg - t.v), dt * 0.5);
          t.el.volume = R.clamp(t.v, 0, 1);
          if (t.v <= 0.001 && t.target === 0 && !t.el.paused) t.el.pause();
        }
      }
      requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  };
  A.play = function (k, force) {
    if (A.cur === k && !force) return;
    A.cur = k;
    for (const n in A.tracks) A.tracks[n].target = n === k ? 1 : 0;
    const t = A.tracks[k]; if (!t || !A.unlocked) return;
    if (t.el.paused) { if (!force) t.el.currentTime = 0; t.el.play().catch(() => {}); }
  };
  A.setVol = function (bgm, sfx) { A.bgmVol = bgm; A.sfxVol = sfx; if (A.master) A.master.gain.value = sfx; };

  function makeNoise(ctx) {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b;
  }
  function env(g, t, a, d, v) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function noise(t, dur, freq, q, v, type) {
    const c = A.ctx, s = c.createBufferSource(); s.buffer = A.noise; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); env(g, t, 0.003, dur, v);
    s.connect(f); f.connect(g); g.connect(A.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function tone(t, dur, f0, f1, v, type) {
    const c = A.ctx, o = c.createOscillator(); o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); env(g, t, 0.005, dur, v); o.connect(g); g.connect(A.master); o.start(t); o.stop(t + dur + 0.05);
  }
  const LIM = { clash: 0.07, arrow: 0.09, boom: 0.15, horse: 0.4, build: 0.25, collapse: 0.3, click: 0.04, alert: 1.5, lvup: 0.5, die: 0.12, train: 0.3, horn: 2, error: 0.3, coin: 0.2 };
  A.sfx = function (k, vol = 1) {
    if (!A.ctx || A.sfxVol <= 0) return;
    const now = A.ctx.currentTime;
    if (A.last[k] && now - A.last[k] < (LIM[k] || 0.05)) return; A.last[k] = now;
    const v = vol;
    try {
      switch (k) {
        case 'clash': noise(now, 0.08, 3200 + Math.random() * 1500, 6, 0.35 * v); tone(now, 0.06, 1800 + Math.random() * 800, 900, 0.05 * v, 'triangle'); break;
        case 'arrow': noise(now, 0.12, 1800, 2, 0.12 * v, 'highpass'); break;
        case 'boom': noise(now, 0.4, 180, 1, 0.6 * v, 'lowpass'); tone(now, 0.3, 90, 40, 0.25 * v, 'sine'); break;
        case 'horse': for (let i = 0; i < 6; i++) noise(now + i * 0.07, 0.05, 300, 3, 0.3 * v, 'lowpass'); break;
        case 'build': noise(now, 0.05, 900, 4, 0.25 * v); noise(now + 0.12, 0.05, 1100, 4, 0.2 * v); break;
        case 'collapse': noise(now, 0.8, 250, 0.8, 0.7 * v, 'lowpass'); tone(now, 0.5, 70, 35, 0.3 * v, 'sine'); break;
        case 'click': tone(now, 0.04, 900, 700, 0.08 * v); break;
        case 'error': tone(now, 0.12, 220, 160, 0.1 * v); break;
        case 'coin': tone(now, 0.06, 1300, 0, 0.06 * v, 'square'); tone(now + 0.06, 0.1, 1900, 0, 0.06 * v, 'square'); break;
        case 'alert': tone(now, 0.18, 520, 0, 0.12 * v, 'square'); tone(now + 0.2, 0.25, 390, 0, 0.12 * v, 'square'); break;
        case 'horn': tone(now, 0.6, 196, 190, 0.18 * v, 'sawtooth'); tone(now + 0.02, 0.6, 294, 288, 0.1 * v, 'sawtooth'); break;
        case 'lvup': [523, 659, 784, 1046].forEach((f, i) => tone(now + i * 0.08, 0.15, f, 0, 0.08 * v, 'square')); break;
        case 'die': noise(now, 0.1, 600, 2, 0.1 * v, 'lowpass'); break;
        case 'train': tone(now, 0.08, 660, 0, 0.06 * v, 'triangle'); tone(now + 0.09, 0.12, 880, 0, 0.06 * v, 'triangle'); break;
      }
    } catch (e) { /* 무시 */ }
  };
})();
