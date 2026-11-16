'use strict';
/* Retro RTS — 쿼터뷰 렌더러 · 미니맵 · 연출 */
(function () {
  const U = R.U, B = R.B, TW = R.TW, TH = R.TH;
  const CHUNK = 16;

  const QUALITY = {
    0: { proj: 120, parts: 150, corpse: 0, corpseT: 0, fire: false, shimmer: false, dust: 0.4 },
    1: { proj: 320, parts: 400, corpse: 250, corpseT: 20, fire: true, shimmer: true, dust: 0.7 },
    2: { proj: 700, parts: 900, corpse: 600, corpseT: 40, fire: true, shimmer: true, dust: 1 },
  };

  // 병종 아이콘(5×5 도트)
  const GLYPH = {
    inf: ['..#..', '..#..', '..#..', '.###.', '..#..'],
    rng: ['.##..', '#..#.', '#...#', '#..#.', '.##..'],
    cav: ['..##.', '.####', '###..', '.##..', '.#.#.'],
    siege: ['.###.', '#.#.#', '#####', '#.#.#', '.###.'],
    gen: ['#.#.#', '#####', '#####', '.....', '#####'],
    bld: ['###..', '###..', '.#...', '.#...', '.#...'],
  };

  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
      this.cam = { x: 0, y: 0, zoom: 2 };
      this.vis = new Map();
      this.decals = []; this.parts = []; this.projs = []; this.floats = [];
      this.dmgAcc = new Map(); this.flash = new Map(); this.time = 0; this.hpShow = new Map(); this._dt = 0;
      this.shake = 0; this.quality = 2; this.shakeOn = true; this.uiScale = 1;
      this.sel = new Set(); this.hover = null; this.ghost = null; this.drag = null; this.marks = [];
      this.t = 0;
      this.resize();
    }
    get Q() { return QUALITY[this.quality]; }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 0 ? 1 : this.quality === 1 ? 1.5 : 2);
      this.dpr = dpr;
      const w = this.cv.clientWidth || innerWidth, h = this.cv.clientHeight || innerHeight;
      this.W = w; this.H = h;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      this.ctx.imageSmoothingEnabled = false;
    }
    setGame(G, me) {
      this.G = G; this.me = me;
      this.vis.clear(); this.decals = []; this.parts = []; this.projs = []; this.floats = []; this.dmgAcc.clear(); this.flash.clear(); this.hpShow.clear();
      this.buildTerrain();
      this.terrVer = -1;
      const p = G.players[me]; const b = G.ents[p.baseId];
      if (b) this.centerOn(b.x + 2, b.y + 2);
      this.cam.zoom = Math.min(this.W, this.H) < 500 ? 1.5 : 2;
    }
    centerOn(tx, ty) { this.cam.x = R.isoX(tx, ty); this.cam.y = R.isoY(tx, ty); this.clampCam(); }
    clampCam() {
      const N = this.G ? this.G.N : 96;
      const minX = R.isoX(0, N), maxX = R.isoX(N, 0), minY = 0, maxY = R.isoY(N, N);
      this.cam.x = R.clamp(this.cam.x, minX, maxX); this.cam.y = R.clamp(this.cam.y, minY, maxY);
      this.cam.zoom = R.clamp(this.cam.zoom, 0.75, 4);
    }
    // 화면(css px) → 월드(px)
    s2w(sx, sy) { const z = this.cam.zoom; return { x: (sx - this.W / 2) / z + this.cam.x, y: (sy - this.H / 2) / z + this.cam.y }; }
    s2t(sx, sy) {
      const w = this.s2w(sx, sy); let t = R.unIso(w.x, w.y);
      // 높이 보정 (언덕)
      const G = this.G; if (G) { const i = (t.y | 0) * G.N + (t.x | 0); if (G.map.e[i] === 1) t = R.unIso(w.x, w.y + 6); }
      return t;
    }
    w2s(wx, wy) { const z = this.cam.zoom; return { x: (wx - this.cam.x) * z + this.W / 2, y: (wy - this.cam.y) * z + this.H / 2 }; }
    t2s(tx, ty) { return this.w2s(R.isoX(tx, ty), R.isoY(tx, ty)); }
    elevAt(x, y) { const G = this.G; const i = (y | 0) * G.N + (x | 0); return G.map.e[i] === 1 ? 6 : 0; }

    // ── 지형 청크 ──
    buildTerrain() {
      const G = this.G, M = G.map, N = M.N;
      this.chunks = [];
      const n = Math.ceil(N / CHUNK);
      for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
        const x0 = cx * CHUNK, y0 = cy * CHUNK;
        const ox = R.isoX(x0, y0 + CHUNK) - 2, oy = R.isoY(x0, y0) - 14;
        const w = CHUNK * TW + 4, h = CHUNK * TH + 18;
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
        for (let s = 0; s <= (CHUNK - 1) * 2; s++) for (let yy = 0; yy < CHUNK; yy++) {
          const xx = s - yy; if (xx < 0 || xx >= CHUNK) continue;
          const x = x0 + xx, y = y0 + yy; if (x >= N || y >= N) continue;
          const i = y * N + x;
          let t = M.t[i]; const e = M.e[i];
          const tt = t === R.T.FOREST ? 2 : t;
          const spr = R.tileSprite(tt, e, M.deco[i] % 8);
          c.drawImage(spr, R.isoX(x, y) - TW / 2 - ox, R.isoY(x, y) - spr._lift - oy);
        }
        // 광맥
        for (const o of M.ores) {
          if (o.x >= x0 && o.x < x0 + CHUNK && o.y >= y0 && o.y < y0 + CHUNK) {
            const s2 = R.oreSprite(); c.drawImage(s2, R.isoX(o.x, o.y) - 32 - ox, R.isoY(o.x, o.y) - 2 - oy);
          }
        }
        this.chunks.push({ cv, ox, oy, x0, y0 });
      }
      // 나무 목록
      this.trees = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x; if (M.t[i] !== R.T.FOREST) continue;
        const d = M.deco[i];
        this.trees.push({ x: x + 0.3 + (d & 7) / 20, y: y + 0.3 + ((d >> 3) & 7) / 20, v: d, e: M.e[i] });
        if (d > 150) this.trees.push({ x: x + 0.75, y: y + 0.65, v: d >> 2, e: M.e[i] });
      }
      // 물 타일
      this.water = [];
      for (let i = 0; i < N * N; i++) if (M.t[i] === R.T.WATER || M.t[i] === R.T.FORD) this.water.push(i);
      // 미니맵용 지형 이미지
      const mm = document.createElement('canvas'); mm.width = N; mm.height = N;
      const mc = mm.getContext('2d'); const id = mc.createImageData(N, N);
      for (let i = 0; i < N * N; i++) {
        const t = M.t[i]; let col = R.TC[t === R.T.FOREST ? 2 : t] ? R.TC[t === R.T.FOREST ? 2 : t][0] : [90, 160, 60];
        if (M.e[i] === 1 && t !== R.T.ROCK) col = R.shade(col, 1.15);
        if (t === R.T.FOREST) col = R.shade(col, 0.8);
        id.data[i * 4] = col[0]; id.data[i * 4 + 1] = col[1]; id.data[i * 4 + 2] = col[2]; id.data[i * 4 + 3] = 255;
      }
      for (const o of M.ores) for (let k = 0; k < 4; k++) { const i = (o.y + (k >> 1)) * N + o.x + (k & 1); id.data[i * 4] = 230; id.data[i * 4 + 1] = 200; id.data[i * 4 + 2] = 60; }
      mc.putImageData(id, 0, 0);
      this.mmTerrain = mm;
    }

    // 영토 경계선
    buildBorders() {
      const G = this.G, N = G.N, T = G.terr;
      this.borders = G.players.map(() => new Path2D());
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const p = T[y * N + x]; if (p < 0) continue;
        const path = this.borders[p];
        const seg = (ax, ay, bx, by) => { path.moveTo(R.isoX(ax, ay), R.isoY(ax, ay)); path.lineTo(R.isoX(bx, by), R.isoY(bx, by)); };
        if (x === 0 || T[y * N + x - 1] !== p) seg(x, y, x, y + 1);
        if (x === N - 1 || T[y * N + x + 1] !== p) seg(x + 1, y, x + 1, y + 1);
        if (y === 0 || T[(y - 1) * N + x] !== p) seg(x, y, x + 1, y);
        if (y === N - 1 || T[(y + 1) * N + x] !== p) seg(x, y + 1, x + 1, y + 1);
      }
      this.terrVer = G.terrVer;
    }

    // ── 이벤트 → 연출 ──
    onEvents(evs) {
      const Q = this.Q;
      for (const e of evs) {
        switch (e.e) {
          case 'proj': {
            const n = Math.min(e.n, 12);
            for (let i = 0; i < n; i++) {
              if (this.projs.length >= Q.proj) break;
              const sp = e.k === 'boulder' || e.k === 'rock' ? 0 : 0.5;
              const sx = e.x0 + (Math.random() - 0.5) * sp * 2, sy = e.y0 + (Math.random() - 0.5) * sp * 2;
              const tx = e.x1 + (Math.random() - 0.5) * 1.4, ty = e.y1 + (Math.random() - 0.5) * 1.4;
              const dist = R.dist(sx, sy, tx, ty);
              const spd = e.k === 'boulder' || e.k === 'rock' ? 7 : 14;
              this.projs.push({ x0: sx, y0: sy, x1: tx, y1: ty, t: -Math.random() * 0.15, dur: dist / spd + 0.05, k: e.k, h: (e.h || 0.6) + dist * (e.k === 'bolt' ? 0.03 : 0.12) });
            }
            break;
          }
          case 'bdmg': { const b = this.G.ents[e.id]; this.addDmg(e.id, e.x, e.y, e.d, true, b ? b.s : 2); break; }
          case 'die': if (e.n > 0) this.addDmg(e.id, e.x, e.y, e.n, false); break;
          case 'hit':
            if (e.k === 'melee' && Math.random() < 0.5) this.spark(e.x, e.y, 3, '#fff6c8');
            if (e.k === 'bld') { this.spark(e.x, e.y, 4, '#d8d0c0'); this.dust(e.x, e.y, 2, '#a89a88'); }
            if (e.k === 'spearwall') { this.spark(e.x, e.y, 10, '#ffffff'); this.float(e.x, e.y, '창벽!', '#ffe070'); }
            if (e.k === 'stake') this.float(e.x, e.y, '말뚝!', '#ffb070');
            break;
          case 'charge': this.dust(e.x, e.y, 14, '#c8b48a'); if (this.onScreen(e.x, e.y)) this.addShake(3); this.float(e.x, e.y, '돌격!', '#ffd24a'); break;
          case 'boom': this.dust(e.x, e.y, 12 + e.r * 4, '#a89878'); this.spark(e.x, e.y, 6, '#ffcc66'); this.decal(e.x, e.y, 'crater'); if (this.onScreen(e.x, e.y)) this.addShake(2); break;
          case 'collapse':
            this.dust(e.x, e.y, 20 + e.s * 8, '#b0a090');
            for (let i = 0; i < e.s * e.s; i++) this.decal(e.x + (Math.random() - 0.5) * e.s, e.y + (Math.random() - 0.5) * e.s, 'rubble');
            if (!e.quiet && this.onScreen(e.x, e.y)) this.addShake(5);
            break;
          case 'built': this.dust(e.x, e.y, 8, '#d8c8a0'); break;
          case 'lvup': this.sparkle(e.x, e.y); this.float(e.x, e.y, 'LEVEL UP', '#ffe070'); break;
          case 'rout': this.float(e.x, e.y, '도주!', '#ffffff'); break;
          case 'ability': this.ring(e.x, e.y, 6, e.a === 'charge' ? '#ffd24a' : '#7ab0ff'); this.float(e.x, e.y, e.a === 'charge' ? '돌격 명령!' : '방어 진형!', e.a === 'charge' ? '#ffd24a' : '#9ac8ff'); break;
          case 'village': this.sparkle(e.x, e.y); break;
          case 'trained': this.dust(e.x, e.y, 4, '#d8c8a0'); break;
          case 'alert': if (e.p === this.me) this.marks.push({ x: e.x, y: e.y, t: 3 }); break;
        }
      }
    }
    onScreen(x, y) { const s = this.t2s(x, y); return s.x > -50 && s.y > -50 && s.x < this.W + 50 && s.y < this.H + 50; }
    addShake(n) { if (this.shakeOn) this.shake = Math.min(8, this.shake + n); }
    spark(x, y, n, c) { const Q = this.Q; for (let i = 0; i < n && this.parts.length < Q.parts; i++) this.parts.push({ x, y, z: 6 + Math.random() * 6, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: 10 + Math.random() * 20, t: 0, life: 0.3 + Math.random() * 0.2, c, s: 1, g: 60 }); }
    dust(x, y, n, c) { const Q = this.Q; n = Math.round(n * Q.dust); for (let i = 0; i < n && this.parts.length < Q.parts; i++) this.parts.push({ x: x + (Math.random() - 0.5) * 0.8, y: y + (Math.random() - 0.5) * 0.8, z: 2, vx: (Math.random() - 0.5) * 1.6, vy: (Math.random() - 0.5) * 1.6, vz: 4 + Math.random() * 6, t: 0, life: 0.6 + Math.random() * 0.6, c, s: 2 + Math.random() * 2, g: 2, fade: true }); }
    sparkle(x, y) { for (let i = 0; i < 12 && this.parts.length < this.Q.parts; i++) this.parts.push({ x: x + (Math.random() - 0.5) * 2, y: y + (Math.random() - 0.5) * 2, z: 10 + Math.random() * 20, vx: 0, vy: 0, vz: 10, t: 0, life: 1, c: '#fff4a0', s: 1, g: 0, tw: true }); }
    ring(x, y, r, c) { this.floats.push({ ring: true, x, y, r, c, t: 0, life: 0.8 }); }
    float(x, y, txt, c) { if (this.floats.length < 40) this.floats.push({ x, y, txt, c, t: 0, life: 1.3 }); }
    addDmg(id, x, y, v, bld, size) {
      if (!this.onScreen(x, y)) return;
      let a = this.dmgAcc.get(id);
      if (!a) { a = { x, y, v: 0, t: 0, bld, h: bld ? 4 + (size || 2) * 5 : 6 }; this.dmgAcc.set(id, a); }
      a.v += v; a.x = x; a.y = y;
      if (bld) this.flash.set(id, this.time);
    }
    flushDmg(dt) {
      if (!this.dmgAcc.size) return;
      for (const [id, a] of this.dmgAcc) {
        a.t += dt; if (a.t < 0.3) continue;
        this.dmgAcc.delete(id);
        if (this.floats.length >= 60) continue;
        const v = Math.round(a.v); if (v <= 0) continue;
        // 건물: 주황 숫자 / 부대: 쓰러진 병사 수 (빨강)
        this.floats.push({ x: a.x + (Math.random() - 0.5) * (a.bld ? 1.6 : 0.6), y: a.y + (Math.random() - 0.5) * (a.bld ? 1.6 : 0.6), txt: '-' + v, c: a.bld ? '#ffb03a' : '#ff5a4a', t: 0, life: 1.1, dmg: true, big: a.bld && v >= 100, h: a.h });
      }
    }
    decal(x, y, k, extra) {
      const Q = this.Q; if (k === 'corpse' && !Q.corpse) return;
      this.decals.push(Object.assign({ x, y, k, t: 0, v: (Math.random() * 1000) | 0 }, extra || {}));
      const lim = Q.corpse + 200;
      if (this.decals.length > lim) this.decals.splice(0, this.decals.length - lim);
    }

    // ── 그리기 ──
    draw(dt, alpha) {
      const G = this.G; if (!G) return;
      this.t += dt;
      const ctx = this.ctx, dpr = this.dpr;
      if (this.terrVer !== G.terrVer) this.buildBorders();
      let shx = 0, shy = 0;
      if (this.shake > 0) { shx = (Math.random() - 0.5) * this.shake; shy = (Math.random() - 0.5) * this.shake; this.shake = Math.max(0, this.shake - dt * 18); }
      const z = this.cam.zoom * dpr;
      const offX = Math.round(this.W * dpr / 2 - (this.cam.x + shx) * z), offY = Math.round(this.H * dpr / 2 - (this.cam.y + shy) * z);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1a2a3a'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      ctx.setTransform(z, 0, 0, z, offX, offY);
      ctx.imageSmoothingEnabled = false;
      // 보이는 영역 (월드 px)
      const vw = { x0: this.cam.x - this.W / 2 / this.cam.zoom - 40, x1: this.cam.x + this.W / 2 / this.cam.zoom + 40, y0: this.cam.y - this.H / 2 / this.cam.zoom - 60, y1: this.cam.y + this.H / 2 / this.cam.zoom + 40 };
      this.vw = vw;
      for (const c of this.chunks) {
        if (c.ox > vw.x1 || c.ox + c.cv.width < vw.x0 || c.oy > vw.y1 || c.oy + c.cv.height < vw.y0) continue;
        ctx.drawImage(c.cv, c.ox, c.oy);
      }
      // 물 반짝임
      if (this.Q.shimmer) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        const N = G.N, tt = Math.floor(this.t * 3);
        for (const i of this.water) {
          if (((i * 7 + tt) % 23) !== 0) continue;
          const x = i % N, y = (i / N) | 0; const wx = R.isoX(x, y), wy = R.isoY(x, y);
          if (wx < vw.x0 || wx > vw.x1 || wy < vw.y0 || wy > vw.y1) continue;
          ctx.fillRect(wx - 3 + (i % 5), wy + 6 + (i % 3), 3, 1);
        }
      }
      // 영토 경계
      ctx.lineWidth = 1 / this.cam.zoom * 1.5;
      G.players.forEach((p, i) => {
        if (!this.borders[i] || !p.alive) return;
        ctx.strokeStyle = R.COLORS[p.color].c; ctx.globalAlpha = i === this.me ? (this.ghost ? 0.9 : 0.45) : 0.35;
        ctx.setLineDash([3, 2]); ctx.stroke(this.borders[i]);
      });
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      if (this.ghost) this.drawTerritoryFill(ctx, vw);
      // 바닥 데칼
      this.drawDecals(ctx, dt, vw);
      // 선택 원
      this.drawSelection(ctx, alpha);
      // 오브젝트 정렬 그리기
      this.drawObjects(ctx, dt, alpha, vw);
      // 투사체 · 파티클
      this.drawProjs(ctx, dt);
      this.drawParts(ctx, dt);
      if (this.ghost) this.drawGhost(ctx);
      this.drawMarks(ctx, dt);
      // 화면 공간 UI
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.time += dt; this._dt = dt;
      this.flushDmg(dt);
      this.drawBars(ctx, alpha);
      this.drawFloats(ctx, dt);
      if (this.drag) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        const d = this.drag; ctx.strokeRect(Math.min(d.x0, d.x1) + 0.5, Math.min(d.y0, d.y1) + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
        ctx.setLineDash([]);
      }
    }

    drawTerritoryFill(ctx, vw) {
      const G = this.G, N = G.N;
      const a = this.s2t(0, 0), b = this.s2t(this.W, 0), c = this.s2t(0, this.H), d = this.s2t(this.W, this.H);
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x, d.x))), x1 = Math.min(N - 1, Math.ceil(Math.max(a.x, b.x, c.x, d.x)));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y, d.y))), y1 = Math.min(N - 1, Math.ceil(Math.max(a.y, b.y, c.y, d.y)));
      ctx.fillStyle = 'rgba(120,255,140,0.10)';
      ctx.beginPath();
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (G.terr[y * N + x] !== this.me) continue;
        const wx = R.isoX(x, y), wy = R.isoY(x, y);
        ctx.moveTo(wx, wy); ctx.lineTo(wx + TW / 2, wy + TH / 2); ctx.lineTo(wx, wy + TH); ctx.lineTo(wx - TW / 2, wy + TH / 2);
      }
      ctx.fill();
      void vw;
    }

    drawDecals(ctx, dt, vw) {
      const Q = this.Q;
      const keep = [];
      for (const d of this.decals) {
        d.t += dt;
        const life = d.k === 'corpse' ? Q.corpseT : d.k === 'crater' ? 30 : 90;
        if (d.t > life) continue;
        keep.push(d);
        const wx = R.isoX(d.x, d.y), wy = R.isoY(d.x, d.y) - (d.e || 0);
        if (wx < vw.x0 || wx > vw.x1 || wy < vw.y0 || wy > vw.y1) continue;
        const a = d.t > life - 3 ? (life - d.t) / 3 : 1;
        ctx.globalAlpha = a;
        if (d.k === 'corpse') {
          const col = R.COLORS[d.c] ? R.COLORS[d.c].d : '#555';
          if (d.cav) { ctx.fillStyle = '#5a3420'; ctx.fillRect(wx - 5, wy - 2, 9, 3); }
          ctx.fillStyle = col; ctx.fillRect(wx - 3, wy - 1, 5, 2);
          ctx.fillStyle = '#f2c08a'; ctx.fillRect(wx + (d.v & 1 ? 2 : -4), wy - 1, 2, 2);
          ctx.fillStyle = '#8a1a1a'; ctx.fillRect(wx - 1 + (d.v % 3), wy + 1, 2, 1);
        } else if (d.k === 'rubble') {
          ctx.fillStyle = '#7a766e'; ctx.fillRect(wx - 3, wy - 1, 4, 2); ctx.fillStyle = '#a8a49a'; ctx.fillRect(wx - 1, wy - 2, 3, 2);
          ctx.fillStyle = '#5a4630'; ctx.fillRect(wx + 1, wy, 3, 1);
        } else if (d.k === 'crater') {
          ctx.fillStyle = 'rgba(60,40,20,0.5)'; ctx.fillRect(wx - 4, wy - 1, 8, 3); ctx.fillRect(wx - 2, wy - 2, 4, 5);
        }
      }
      ctx.globalAlpha = 1;
      this.decals = keep;
    }

    sqPos(s, alpha) { return { x: s.px + (s.x - s.px) * alpha, y: s.py + (s.y - s.py) * alpha }; }

    drawSelection(ctx, alpha) {
      const G = this.G;
      for (const id of this.sel) {
        const e = G.ents[id]; if (!e) continue;
        if (e.k === 's') {
          const p = this.sqPos(e, alpha); const r = R.squadRadius(e) + 0.25;
          const wx = R.isoX(p.x, p.y), wy = R.isoY(p.x, p.y) - this.elevAt(p.x, p.y);
          ctx.strokeStyle = e.owner === this.me ? '#9aff7a' : '#ff6a5a'; ctx.lineWidth = 1.2 / this.cam.zoom * 1.5;
          ctx.beginPath(); ctx.ellipse(wx, wy, r * TW * 0.72, r * TH * 0.72, 0, 0, Math.PI * 2); ctx.stroke();
          if (e.owner === this.me && e.path && e.pi < e.path.length) {
            const l = e.path[e.path.length - 1]; const lx = R.isoX(l.x, l.y), ly = R.isoY(l.x, l.y);
            ctx.globalAlpha = 0.4; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(wx, wy); for (let i = e.pi; i < e.path.length; i++) ctx.lineTo(R.isoX(e.path[i].x, e.path[i].y), R.isoY(e.path[i].x, e.path[i].y)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
            ctx.fillStyle = e.order === 'amove' ? '#ff8a5a' : '#9aff7a'; ctx.fillRect(lx - 1, ly - 8, 1, 8); ctx.fillRect(lx, ly - 8, 4, 3);
          }
        } else if (e.k === 'b' || e.k === 'v') {
          const s = e.k === 'v' ? 2 : e.s;
          ctx.strokeStyle = e.k === 'b' && e.owner === this.me ? '#9aff7a' : '#ffe070'; ctx.lineWidth = 1.5 / this.cam.zoom * 1.5;
          ctx.beginPath(); ctx.moveTo(R.isoX(e.x, e.y), R.isoY(e.x, e.y)); ctx.lineTo(R.isoX(e.x + s, e.y), R.isoY(e.x + s, e.y)); ctx.lineTo(R.isoX(e.x + s, e.y + s), R.isoY(e.x + s, e.y + s)); ctx.lineTo(R.isoX(e.x, e.y + s), R.isoY(e.x, e.y + s)); ctx.closePath(); ctx.stroke();
          if (e.k === 'b' && e.rally && e.owner === this.me) { const rx = R.isoX(e.rally.x, e.rally.y), ry = R.isoY(e.rally.x, e.rally.y); ctx.fillStyle = R.COLORS[this.G.players[e.owner].color].c; ctx.fillRect(rx, ry - 10, 1, 10); ctx.fillRect(rx + 1, ry - 10, 5, 4); }
        }
      }
    }

    drawObjects(ctx, dt, alpha, vw) {
      const G = this.G, list = [];
      const inV = (wx, wy) => wx > vw.x0 && wx < vw.x1 && wy > vw.y0 && wy < vw.y1 + 40;
      // 부대가 있는 칸 표시 (나무 반투명용)
      const N = G.N; const near = this._near || (this._near = new Uint8Array(N * N)); near.fill(0);
      for (const s of G.squads()) {
        const r = Math.ceil(R.squadRadius(s)) + 1, cx = s.x | 0, cy = s.y | 0;
        for (let yy = cy - r; yy <= cy + r; yy++) for (let xx = cx - r; xx <= cx + r; xx++) if (xx >= 0 && yy >= 0 && xx < N && yy < N) near[yy * N + xx] = 1;
      }
      // 나무
      for (const t of this.trees) {
        const wx = R.isoX(t.x, t.y), wy = R.isoY(t.x, t.y) - (t.e ? 6 : 0);
        if (!inV(wx, wy)) continue;
        list.push({ k: t.x + t.y, f: 0, o: t, wx, wy });
      }
      // 건물 · 마을
      for (const e of Object.values(G.ents)) {
        if (e.k === 's') continue;
        const s = e.k === 'v' ? 2 : e.s;
        const wx = R.isoX(e.x, e.y), wy = R.isoY(e.x, e.y);
        if (wx < vw.x0 - s * 32 || wx > vw.x1 + s * 32 || wy < vw.y0 - 20 || wy > vw.y1 + s * 32) continue;
        list.push({ k: e.x + e.y + s * 2 - 1.2, f: 1, o: e, wx, wy });
      }
      // 병사
      const seen = new Set();
      for (const s of G.squads()) {
        seen.add(s.id);
        const v = this.visFor(s);
        const p = this.sqPos(s, alpha);
        this.updateVis(s, v, p, dt);
        const wx = R.isoX(p.x, p.y), wy = R.isoY(p.x, p.y);
        if (!inV(wx, wy) && !inV(wx + 60, wy) && !inV(wx - 60, wy)) { v.off = true; continue; }
        v.off = false;
        for (let i = 0; i < v.n; i++) if (v.al[i]) list.push({ k: v.sx[i] + v.sy[i], f: 2, o: s, v, i });
      }
      // 사라진 부대 → 시체
      for (const [id, v] of this.vis) if (!seen.has(id)) {
        for (let i = 0; i < v.n; i++) if (v.al[i]) this.decal(v.sx[i], v.sy[i], 'corpse', { c: v.c, cav: v.cav, e: this.elevAt(v.sx[i], v.sy[i]) });
        this.vis.delete(id);
      }
      list.sort((a, b) => a.k - b.k);
      const me = this.me;
      for (const it of list) {
        if (it.f === 0) {
          const spr = R.treeSprite(it.o.v);
          const tr = near[(it.o.y | 0) * N + (it.o.x | 0)];
          if (tr) ctx.globalAlpha = 0.45;
          ctx.drawImage(spr, Math.round(it.wx - 9), Math.round(it.wy - 25));
          if (tr) ctx.globalAlpha = 1;
        } else if (it.f === 1) {
          this.drawBuilding(ctx, it.o, it.wx, it.wy);
        } else {
          const s = it.o, v = it.v, i = it.i, d = U[s.u];
          const moving = s.moving || v.mv[i] > 0.02;
          let fr = 0;
          if (moving) fr = ((this.t * (d.cls === 'cav' || d.cls === 'gen' ? 8 : 6) + v.ph[i]) | 0) % 2 + 1;
          if ((s.atkAnim && G.time - s.atkAnim < 0.3 && (i * 7 + ((s.atkAnim * 10) | 0)) % 3 !== 0) || (s.working && ((this.t * 3 + v.ph[i]) | 0) % 2 === 0)) fr = 3;
          const flip = v.fl;
          const col = G.players[s.owner].color;
          const spr = R.unitSprite(s.u, col, fr, flip);
          const ax = d.cls === 'cav' || s.u === 'general' ? 12 : d.cls === 'siege' ? 16 : 8;
          const ay = d.cls === 'cav' || s.u === 'general' ? 21 : d.cls === 'siege' ? 25 : 15;
          const wx = R.isoX(v.sx[i], v.sy[i]), wy = R.isoY(v.sx[i], v.sy[i]) - this.elevAt(v.sx[i], v.sy[i]) - (s.onWall ? 12 : 0);
          if (s.rout) ctx.globalAlpha = 0.85;
          ctx.drawImage(spr, Math.round(wx - (flip ? spr.width - ax : ax)), Math.round(wy - ay + 1));
          if (s.rout && i === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(wx), Math.round(wy - ay - 6), 4, 3); ctx.fillStyle = '#5a3a22'; ctx.fillRect(Math.round(wx) - 1, Math.round(wy - ay - 6), 1, 8); }
          ctx.globalAlpha = 1;
        }
      }
      void me;
    }

    visFor(s) {
      let v = this.vis.get(s.id);
      if (!v) {
        const d = U[s.u], n = d.n;
        v = { n, sx: new Float32Array(n), sy: new Float32Array(n), al: new Uint8Array(n).fill(1), ph: new Float32Array(n), mv: new Float32Array(n), c: this.G.players[s.owner].color, cav: d.cls === 'cav' || s.u === 'general', fl: false, jit: new Float32Array(n * 2) };
        const tmp = { x: 0, y: 0 };
        for (let i = 0; i < n; i++) {
          R.slotPos(s, i, tmp); v.sx[i] = tmp.x; v.sy[i] = tmp.y; v.ph[i] = Math.random() * 2;
          v.jit[i * 2] = (Math.random() - 0.5) * 0.08; v.jit[i * 2 + 1] = (Math.random() - 0.5) * 0.08;
        }
        this.vis.set(s.id, v);
      }
      return v;
    }
    updateVis(s, v, p, dt) {
      const d = U[s.u];
      const f = R.formSlots(s.u, d.n, s.form);
      const fx = Math.cos(s.dir), fy = Math.sin(s.dir);
      const sdx = fx - fy; // 화면 x 방향
      if (Math.abs(sdx) > 0.15) v.fl = sdx < 0;
      const k = Math.min(1, dt * 6);
      const spread = s.rout ? 1.8 : 1;
      const inv = 1 / Math.max(dt, 0.001) * 0.05;
      for (let i = 0; i < v.n; i++) {
        const alive = s.hp ? s.hp[i] > 0 : true;
        if (v.al[i] && !alive) {
          v.al[i] = 0;
          this.decal(v.sx[i], v.sy[i], 'corpse', { c: v.c, cav: v.cav, e: this.elevAt(v.sx[i], v.sy[i]) });
          continue;
        }
        if (!v.al[i]) continue;
        const col = i % f.cols, row = (i / f.cols) | 0;
        const a = (col - (f.cols - 1) / 2) * f.sp * spread, b = -(row - (f.rows - 1) / 2) * f.sp * spread;
        const tx = p.x - fy * a + fx * b + v.jit[i * 2], ty = p.y + fx * a + fy * b + v.jit[i * 2 + 1];
        const nx = v.sx[i] + (tx - v.sx[i]) * k, ny = v.sy[i] + (ty - v.sy[i]) * k;
        v.mv[i] = Math.hypot(nx - v.sx[i], ny - v.sy[i]) * inv;
        v.sx[i] = nx; v.sy[i] = ny;
      }
    }

    drawBuilding(ctx, e, wx, wy) {
      const G = this.G;
      if (e.k === 'v') {
        const col = e.owner >= 0 ? G.players[e.owner].color : -1;
        const spr = R.buildingSprite('village', col, 1);
        ctx.drawImage(spr, Math.round(wx - spr._ox), Math.round(wy - spr._oy));
        if (e.prog > 0 && e.capP >= 0) {
          const c = R.COLORS[G.players[e.capP].color].c;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(wx - 13, wy - 28, 26, 4);
          ctx.fillStyle = c; ctx.fillRect(wx - 12, wy - 27, 24 * e.prog, 2);
        }
        return;
      }
      const col = G.players[e.owner].color;
      const spr = R.buildingSprite(e.type, col, e.type === 'base' ? Math.min(3, e.lv) : e.lv, e.built);
      const fl = this.flash.get(e.id);
      const ft = fl != null ? this.time - fl : 9;
      const jx = ft < 0.12 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      ctx.drawImage(spr, Math.round(wx - spr._ox) + jx, Math.round(wy - spr._oy));
      if (ft < 0.12) {
        ctx.globalAlpha = 0.55 * (1 - ft / 0.12);
        ctx.drawImage(R.whiteSprite(spr), Math.round(wx - spr._ox) + jx, Math.round(wy - spr._oy));
        ctx.globalAlpha = 1;
      } else if (fl != null && ft > 1) this.flash.delete(e.id);
      // 불타기
      if (this.Q.fire && e.built >= 1 && e.hp < e.maxHp * 0.5 && !B[e.type].line) {
        const n = e.hp < e.maxHp * 0.25 ? 3 : 1;
        if (Math.random() < 0.4 * n && this.parts.length < this.Q.parts) {
          const fx = e.x + Math.random() * e.s, fy = e.y + Math.random() * e.s;
          this.parts.push({ x: fx, y: fy, z: 8 + e.s * 4 + Math.random() * 6, vx: 0, vy: 0, vz: 12, t: 0, life: 0.5 + Math.random() * 0.4, c: Math.random() < 0.5 ? '#ff8a2a' : '#ffd24a', s: 2, g: -4, fire: true });
          if (Math.random() < 0.3) this.parts.push({ x: fx, y: fy, z: 14 + e.s * 4, vx: 0.3, vy: -0.3, vz: 8, t: 0, life: 1.6, c: '#4a4a4a', s: 3, g: -2, fade: true });
        }
      }
      // 건설/레벨업 진행
      if (e.built < 1 || e.lvProg) {
        const p = e.built < 1 ? e.built : e.lvProg.t / e.lvProg.need;
        const cy = wy + e.s * TH / 2 - 4;
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(wx - 14, cy, 28, 4);
        ctx.fillStyle = e.built < 1 ? '#ffd24a' : '#7ab0ff'; ctx.fillRect(wx - 13, cy + 1, 26 * p, 2);
      }
    }

    drawProjs(ctx, dt) {
      const keep = [];
      for (const p of this.projs) {
        p.t += dt; if (p.t < 0) { keep.push(p); continue; }
        const f = p.t / p.dur; if (f >= 1) continue; keep.push(p);
        const x = R.lerp(p.x0, p.x1, f), y = R.lerp(p.y0, p.y1, f);
        const hgt = Math.sin(f * Math.PI) * p.h * 10 + 6 * (1 - f) + 4;
        const wx = R.isoX(x, y), wy = R.isoY(x, y) - hgt;
        if (p.k === 'arrow' || p.k === 'bolt') {
          const f2 = Math.min(1, f + 0.04); const x2 = R.lerp(p.x0, p.x1, f2), y2 = R.lerp(p.y0, p.y1, f2);
          const h2 = Math.sin(f2 * Math.PI) * p.h * 10 + 6 * (1 - f2) + 4;
          let dx = R.isoX(x2, y2) - wx, dy = R.isoY(x2, y2) - h2 - wy; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          const len = p.k === 'bolt' ? 6 : 4;
          ctx.strokeStyle = p.k === 'bolt' ? '#d0d8e0' : '#f0e0c0'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(wx - dx * len, wy - dy * len); ctx.lineTo(wx, wy); ctx.stroke();
        } else {
          const s = p.k === 'stone' ? 2 : p.k === 'rock' ? 3 : 4;
          ctx.fillStyle = '#4a4440'; ctx.fillRect(Math.round(wx - s / 2), Math.round(wy - s / 2), s, s);
          ctx.fillStyle = '#9a948a'; ctx.fillRect(Math.round(wx - s / 2), Math.round(wy - s / 2), Math.max(1, s - 1), 1);
          if (s >= 3) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; const gy = R.isoY(x, y); ctx.fillRect(Math.round(wx - s / 2), Math.round(gy), s, 1); }
        }
      }
      this.projs = keep;
    }
    drawParts(ctx, dt) {
      const keep = [];
      for (const p of this.parts) {
        p.t += dt; if (p.t >= p.life) continue; keep.push(p);
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.g * dt * 10;
        if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.5; p.vy *= 0.5; }
        const wx = R.isoX(p.x, p.y), wy = R.isoY(p.x, p.y) - p.z;
        ctx.globalAlpha = p.fade ? 1 - p.t / p.life : 1;
        if (p.tw && ((this.t * 10 + p.x * 3) | 0) % 2) continue;
        ctx.fillStyle = p.c; const s = p.s * (p.fade ? 1 + p.t / p.life : 1);
        ctx.fillRect(Math.round(wx - s / 2), Math.round(wy - s / 2), Math.ceil(s), Math.ceil(s));
      }
      ctx.globalAlpha = 1;
      this.parts = keep;
    }
    drawMarks(ctx, dt) {
      const keep = [];
      for (const m of this.marks) {
        m.t -= dt; if (m.t <= 0) continue; keep.push(m);
        const wx = R.isoX(m.x, m.y), wy = R.isoY(m.x, m.y);
        const r = 6 + (1 - (m.t % 1)) * 18;
        ctx.strokeStyle = m.c || '#ff4a3a'; ctx.globalAlpha = Math.min(1, m.t); ctx.lineWidth = 2 / this.cam.zoom * 1.5;
        ctx.beginPath(); ctx.ellipse(wx, wy, r, r / 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      this.marks = keep;
    }
    drawGhost(ctx) {
      const g = this.ghost; const G = this.G;
      const cells = g.cells || [[g.x, g.y]];
      const d = B[g.type];
      for (const [x, y] of cells) {
        const err = G.canPlace(this.me, g.type, x, y);
        const s = d.size;
        ctx.fillStyle = err ? 'rgba(255,60,40,0.35)' : 'rgba(120,255,120,0.35)';
        ctx.beginPath(); ctx.moveTo(R.isoX(x, y), R.isoY(x, y)); ctx.lineTo(R.isoX(x + s, y), R.isoY(x + s, y)); ctx.lineTo(R.isoX(x + s, y + s), R.isoY(x + s, y + s)); ctx.lineTo(R.isoX(x, y + s), R.isoY(x, y + s)); ctx.closePath(); ctx.fill();
        const spr = R.buildingSprite(g.type, G.players[this.me].color, 1);
        ctx.globalAlpha = err ? 0.35 : 0.65; ctx.drawImage(spr, Math.round(R.isoX(x, y) - spr._ox), Math.round(R.isoY(x, y) - spr._oy)); ctx.globalAlpha = 1;
      }
      // 사거리 표시
      if (d.tower) {
        const [x, y] = cells[0]; const c = { x: x + d.size / 2, y: y + d.size / 2 };
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(R.isoX(c.x, c.y), R.isoY(c.x, c.y), d.tower.range * TW * 0.71, d.tower.range * TH * 0.71, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // 부대 머리 위 표시
    drawBars(ctx, alpha) {
      const G = this.G; const zoom = this.cam.zoom; const sc = this.uiScale;
      if (zoom < 0.9) return;
      ctx.font = `bold ${Math.round(9 * sc)}px sans-serif`; ctx.textBaseline = 'middle';
      for (const s of G.squads()) {
        const v = this.vis.get(s.id); if (!v || v.off) continue;
        const d = U[s.u];
        const p = this.sqPos(s, alpha);
        const sel = this.sel.has(s.id);
        const hgt = d.cls === 'cav' || s.u === 'general' ? 26 : d.cls === 'siege' ? 30 : 20;
        const sp = this.w2s(R.isoX(p.x, p.y), R.isoY(p.x, p.y) - this.elevAt(p.x, p.y) - hgt - (s.onWall ? 12 : 0));
        const pl = G.players[s.owner]; const col = R.COLORS[pl.color];
        const single = d.n <= 2;
        const w = Math.round((single ? 18 : 30) * sc), h = Math.round(9 * sc);
        const x = Math.round(sp.x - w / 2), y = Math.round(sp.y - h);
        ctx.fillStyle = 'rgba(16,10,20,0.78)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2 + Math.round(4 * sc));
        ctx.fillStyle = col.c; ctx.fillRect(x, y, h, h);
        // 글리프
        const gl = GLYPH[d.cls]; const gs = Math.max(1, Math.floor((h - 2) / 5));
        ctx.fillStyle = '#ffffff';
        for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 5; gx++) if (gl[gy][gx] === '#') ctx.fillRect(x + 1 + gx * gs + Math.floor((h - 2 - gs * 5) / 2), y + 1 + gy * gs + Math.floor((h - 2 - gs * 5) / 2), gs, gs);
        if (!single) { ctx.fillStyle = sel ? '#ffffa0' : '#ffffff'; ctx.fillText(String(s.alive), x + h + 2 * sc, y + h / 2 + 0.5); }
        // HP · 사기
        let hp = 0, mx = d.hp * d.n; for (const v2 of s.hp) hp += v2;
        const bw = w;
        ctx.fillStyle = '#3a2a2a'; ctx.fillRect(x, y + h + 1, bw, Math.max(1, Math.round(1.5 * sc)));
        ctx.fillStyle = hp / mx > 0.5 ? '#6ad04a' : hp / mx > 0.25 ? '#e8c22c' : '#e04a3a';
        ctx.fillRect(x, y + h + 1, Math.round(bw * hp / mx), Math.max(1, Math.round(1.5 * sc)));
        if (d.cls !== 'siege' && d.cls !== 'bld' && d.cls !== 'gen') {
          const my = y + h + 1 + Math.max(1, Math.round(1.5 * sc)) + 1;
          ctx.fillStyle = '#2a2a3a'; ctx.fillRect(x, my, bw, Math.max(1, Math.round(1.5 * sc)));
          ctx.fillStyle = s.rout ? '#ffffff' : s.morale >= 70 ? '#4ab0ff' : s.morale >= 40 ? '#e8c22c' : '#ff5a4a';
          ctx.fillRect(x, my, Math.round(bw * Math.max(0, s.morale) / 100), Math.max(1, Math.round(1.5 * sc)));
        }
        if (s.buffA > G.time || s.buffD > G.time) { ctx.fillStyle = s.buffA > G.time ? '#ffd24a' : '#7ab0ff'; ctx.fillRect(x + w - 3, y - 3, 3, 3); }
        if (s.grp) { ctx.fillStyle = '#ffe070'; ctx.fillText(String(s.grp), x - 7 * sc, y + h / 2); }
        if (d.deploy && s.dep >= 0 && s.dep < d.deploy && s.dep > 0) { ctx.fillStyle = '#7ab0ff'; ctx.fillRect(x, y - 3, w * s.dep / d.deploy, 2); }
      }
      // 건물 체력 (손상되었거나 선택됨, 최근에 맞았으면 크게)
      for (const b of G.buildings()) {
        const recent = G.time - b.lastHit < 4;
        if (!(b.hp < b.maxHp * 0.999 && b.built >= 1) && !this.sel.has(b.id) && !recent) continue;
        const c = { x: b.x + b.s / 2, y: b.y + b.s / 2 };
        const spr = R.buildingSprite(b.type, G.players[b.owner].color, b.type === 'base' ? Math.min(3, b.lv) : b.lv, b.built);
        const sp = this.w2s(R.isoX(b.x, b.y), R.isoY(b.x, b.y) - spr._oy + (spr._top || 0) - 6);
        if (sp.x < -40 || sp.y < -40 || sp.x > this.W + 40 || sp.y > this.H + 40) continue;
        const big = recent || this.sel.has(b.id);
        if (big && sp.y < (this.safeTop || 0) + 14 * sc) sp.y = Math.min((this.safeTop || 0) + 14 * sc, this.w2s(R.isoX(b.x + b.s, b.y + b.s), R.isoY(b.x + b.s, b.y + b.s)).y - 10);
        const w = Math.round((14 + b.s * 8) * sc * (big ? 1.5 : 1)), h = Math.max(2, Math.round((big ? 6 : 3) * sc));
        const f = Math.max(0, b.hp / b.maxHp);
        // 잔상: 깎인 부분이 하얗게 남았다가 천천히 줄어듦
        let shown = this.hpShow.get(b.id); if (shown == null || shown < f) shown = f;
        shown = Math.max(f, shown - 0.5 * this._dt); this.hpShow.set(b.id, shown);
        ctx.fillStyle = 'rgba(16,10,20,0.85)'; ctx.fillRect(sp.x - w / 2 - 1, sp.y - 1, w + 2, h + 2);
        if (shown > f) { ctx.fillStyle = '#fff4d8'; ctx.fillRect(sp.x - w / 2, sp.y, w * shown, h); }
        ctx.fillStyle = f > 0.5 ? '#6ad04a' : f > 0.25 ? '#e8c22c' : '#e04a3a'; ctx.fillRect(sp.x - w / 2, sp.y, w * f, h);
        if (big) {
          ctx.font = `bold ${Math.round(10 * sc)}px sans-serif`; ctx.textAlign = 'center';
          const txt = Math.ceil(Math.max(0, b.hp)) + ' / ' + Math.round(b.maxHp);
          ctx.fillStyle = '#1a1220'; ctx.fillText(txt, sp.x + 1, sp.y - 4 * sc + 1); ctx.fillStyle = '#fff3d8'; ctx.fillText(txt, sp.x, sp.y - 4 * sc);
          ctx.textAlign = 'left';
        }
        void c;
      }
    }
    drawFloats(ctx, dt) {
      const keep = [];
      ctx.textAlign = 'center';
      for (const f of this.floats) {
        f.t += dt; if (f.t > f.life) continue; keep.push(f);
        const sp = this.t2s(f.x, f.y);
        if (f.ring) {
          const r = f.r * TW * 0.71 * this.cam.zoom * (0.3 + f.t / f.life * 0.7);
          ctx.strokeStyle = f.c; ctx.globalAlpha = 1 - f.t / f.life; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(sp.x, sp.y, r, r / 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; continue;
        }
        ctx.globalAlpha = f.t > f.life - 0.4 ? (f.life - f.t) / 0.4 : 1;
        if (f.dmg) {
          const pop = f.t < 0.12 ? 1 + (0.12 - f.t) * 5 : 1;
          ctx.font = `bold ${Math.round((f.big ? 19 : 15) * Math.max(0.85, this.uiScale) * pop)}px sans-serif`;
          const y = Math.max((this.safeTop || 0) + 56, sp.y - (f.h || 0) * this.cam.zoom - 10) - f.t * 28;
          ctx.fillStyle = '#1a1220'; ctx.fillText(f.txt, sp.x + 1, y + 1); ctx.fillText(f.txt, sp.x - 1, y + 1);
          ctx.fillStyle = f.c; ctx.fillText(f.txt, sp.x, y);
          ctx.globalAlpha = 1; continue;
        }
        ctx.font = `bold ${Math.round(11 * this.uiScale)}px sans-serif`;
        const y = sp.y - 30 - f.t * 18;
        ctx.fillStyle = '#1a1220'; ctx.fillText(f.txt, sp.x + 1, y + 1); ctx.fillStyle = f.c; ctx.fillText(f.txt, sp.x, y);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';
      this.floats = keep;
    }

    // 화면 좌표의 엔티티 찾기
    pick(sx, sy) {
      const G = this.G; let best = null, bd = 22 * 22;
      for (const s of G.squads()) {
        const v = this.vis.get(s.id); if (!v || v.off) continue;
        let cx = 0, cy = 0, n = 0; for (let i = 0; i < v.n; i++) if (v.al[i]) { cx += v.sx[i]; cy += v.sy[i]; n++; }
        if (!n) continue; cx /= n; cy /= n;
        const p = this.w2s(R.isoX(cx, cy), R.isoY(cx, cy) - this.elevAt(cx, cy) - 6 - (s.onWall ? 12 : 0));
        const rr = (R.squadRadius(s) * 16 * this.cam.zoom + 10);
        const d = (p.x - sx) ** 2 + ((p.y - sy) * 1.6) ** 2;
        if (d < Math.max(bd, rr * rr) && d < rr * rr) { bd = d; best = s; }
      }
      if (best) return best;
      const t = this.s2t(sx, sy);
      const N = G.N; const tx = Math.floor(t.x), ty = Math.floor(t.y);
      // 건물은 높이가 있으므로 아래쪽 타일도 검사
      for (let k = 0; k < 4; k++) {
        const t2 = this.s2t(sx, sy + k * 10 * this.cam.zoom);
        const x = Math.floor(t2.x), y = Math.floor(t2.y);
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const id = G.occ[y * N + x]; if (id && G.ents[id]) return G.ents[id];
      }
      void tx; void ty;
      return null;
    }
    // 화면 사각형 안의 내 부대
    boxSelect(x0, y0, x1, y1) {
      const G = this.G, out = [];
      const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
      for (const s of G.squads()) {
        if (s.owner !== this.me) continue;
        const p = this.t2s(s.x, s.y);
        if (p.x >= ax && p.x <= bx && p.y - 6 >= ay - 10 && p.y - 6 <= by + 4) out.push(s);
      }
      return out;
    }
  }
  R.Renderer = Renderer;

  // ── 미니맵 ──
  class Minimap {
    constructor(cv) { this.cv = cv; this.ctx = cv.getContext('2d'); this.t = 0; }
    setGame(G, rd) { this.G = G; this.rd = rd; this.resize(); }
    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = this.cv.clientWidth || 180, h = this.cv.clientHeight || 90;
      this.cv.width = w * dpr; this.cv.height = h * dpr; this.W = w; this.H = h; this.dpr = dpr;
    }
    tr() { const N = this.G.N, W = this.W * this.dpr, H = this.H * this.dpr; return [W / (2 * N), H / (2 * N), -W / (2 * N), H / (2 * N), W / 2, 0]; }
    draw() {
      const G = this.G; if (!G) return;
      const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
      c.imageSmoothingEnabled = false;
      c.setTransform(...this.tr());
      c.drawImage(this.rd.mmTerrain, 0, 0);
      // 영토
      for (const b of G.buildings()) { c.fillStyle = R.COLORS[G.players[b.owner].color].c; c.fillRect(b.x - 0.3, b.y - 0.3, b.s + 0.6, b.s + 0.6); }
      for (const vid of G.villages) { const v = G.ents[vid]; c.fillStyle = v.owner >= 0 ? R.COLORS[G.players[v.owner].color].l : '#f0f0e0'; c.fillRect(v.x - 0.5, v.y - 0.5, 3, 3); c.strokeStyle = '#000'; c.lineWidth = 0.4; c.strokeRect(v.x - 0.5, v.y - 0.5, 3, 3); }
      for (const s of G.squads()) { c.fillStyle = R.COLORS[G.players[s.owner].color].l; const r = U[s.u].n > 2 ? 1.4 : 1; c.fillRect(s.x - r, s.y - r, r * 2, r * 2); }
      // 알림
      for (const m of this.rd.marks) { c.strokeStyle = '#ff3a2a'; c.lineWidth = 1.2; c.beginPath(); c.arc(m.x, m.y, 3 + (1 - m.t % 1) * 5, 0, Math.PI * 2); c.stroke(); }
      // 시야
      const rd = this.rd; const pts = [rd.s2t(0, 0), rd.s2t(rd.W, 0), rd.s2t(rd.W, rd.H), rd.s2t(0, rd.H)];
      c.strokeStyle = '#ffffff'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (const p of pts) c.lineTo(p.x, p.y); c.closePath(); c.stroke();
    }
    toTile(sx, sy) {
      const [a, b, cc, d, e, f] = this.tr(); const X = sx * this.dpr - e, Y = sy * this.dpr - f;
      const det = a * d - b * cc; return { x: (d * X - cc * Y) / det, y: (-b * X + a * Y) / det };
    }
  }
  R.Minimap = Minimap;
})();
