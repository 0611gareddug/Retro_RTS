'use strict';
/* Retro RTS — 공통 유틸 */
const R = (window.R = window.R || {});

R.VERSION = '1.0.0';
R.TW = 32; // 타일 가로(px)
R.TH = 16; // 타일 세로(px)
R.SIM_HZ = 20;
R.SIM_DT = 1 / R.SIM_HZ;

R.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
R.lerp = (a, b, t) => a + (b - a) * t;
R.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
R.dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
R.angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// 시드 난수
R.rng = function (seed) {
  let s = seed >>> 0 || 1;
  const f = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  f.int = (n) => Math.floor(f() * n);
  f.range = (a, b) => a + f() * (b - a);
  return f;
};
R.hash2 = (x, y, s) => {
  let h = (x * 374761393 + y * 668265263 + (s | 0) * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// 값 노이즈
R.noise = (x, y, s) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = R.hash2(xi, yi, s), b = R.hash2(xi + 1, yi, s), c = R.hash2(xi, yi + 1, s), d = R.hash2(xi + 1, yi + 1, s);
  return R.lerp(R.lerp(a, b, u), R.lerp(c, d, u), v);
};

// 쿼터뷰 투영 (타일좌표 → 월드 픽셀)
R.isoX = (x, y) => (x - y) * (R.TW / 2);
R.isoY = (x, y) => (x + y) * (R.TH / 2);
R.unIso = (px, py) => {
  const a = px / (R.TW / 2), b = py / (R.TH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
};

// 이진 힙
R.Heap = class {
  constructor() { this.a = []; this.p = []; }
  get size() { return this.a.length; }
  push(v, pr) {
    const a = this.a, p = this.p; a.push(v); p.push(pr);
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1; if (p[j] <= p[i]) break;
      [a[i], a[j]] = [a[j], a[i]]; [p[i], p[j]] = [p[j], p[i]]; i = j;
    }
  }
  pop() {
    const a = this.a, p = this.p, top = a[0], lv = a.pop(), lp = p.pop();
    if (a.length) {
      a[0] = lv; p[0] = lp; let i = 0; const n = a.length;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < n && p[l] < p[m]) m = l; if (r < n && p[r] < p[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; [p[i], p[m]] = [p[m], p[i]]; i = m;
      }
    }
    return top;
  }
};

R.fmtTime = (s) => { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
R.isMobile = () => matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

R.store = {
  get(k, d) { try { const v = localStorage.getItem('rrts_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rrts_' + k, JSON.stringify(v)); } catch (e) { /* 저장공간 없음 */ } },
  del(k) { try { localStorage.removeItem('rrts_' + k); } catch (e) { /* 무시 */ } },
};

R.COLORS = [
  { name: '빨강', c: '#d83a3a', d: '#8c1e24', l: '#ff7a6a' },
  { name: '파랑', c: '#3a6ee0', d: '#1f3a8c', l: '#7aa8ff' },
  { name: '초록', c: '#3fae3f', d: '#1f6a28', l: '#86e06a' },
  { name: '노랑', c: '#e8c22c', d: '#9a7a12', l: '#fff07a' },
  { name: '보라', c: '#9a4ad8', d: '#56228a', l: '#cf8cff' },
  { name: '주황', c: '#ee7f22', d: '#9a4612', l: '#ffb46a' },
  { name: '청록', c: '#22b8b0', d: '#127068', l: '#6ae8e0' },
  { name: '흰색', c: '#e8e8e0', d: '#9a9a94', l: '#ffffff' },
];
