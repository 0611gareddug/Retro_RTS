'use strict';
// 맞았을 때 번쩍이는 흰 실루엣 (스프라이트마다 한 번만 생성)
R.whiteSprite = function (spr) {
  if (spr._white) return spr._white;
  const c = document.createElement('canvas'); c.width = spr.width; c.height = spr.height;
  const x = c.getContext('2d'); x.drawImage(spr, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
  spr._white = c; return c;
};
/* Retro RTS — 픽셀아트 스프라이트 생성기 (코드로 그린 도트) */
(function () {
  const hex = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const pack = (c, a = 255) => ((a << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
  const shade = (c, f) => [R.clamp(Math.round(c[0] * f), 0, 255), R.clamp(Math.round(c[1] * f), 0, 255), R.clamp(Math.round(c[2] * f), 0, 255)];
  const mix = (a, b, t) => [Math.round(R.lerp(a[0], b[0], t)), Math.round(R.lerp(a[1], b[1], t)), Math.round(R.lerp(a[2], b[2], t))];
  const OUT = hex('#1a1220');

  class PC {
    constructor(w, h) { this.w = w; this.h = h; this.b = new Uint32Array(w * h); }
    set(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return; this.b[y * this.w + x] = Array.isArray(c) ? pack(c) : c; }
    get(x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.b[y * this.w + x]; }
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
    line(x0, y0, x1, y1, c) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
      for (;;) { this.set(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    }
    // 픽셀 단위 다각형 채우기. cf(x,y) → 색
    poly(pts, cf) {
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
      for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
        const px = x + 0.5, py = y + 0.5; let ins = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins;
        }
        if (ins) { const c = typeof cf === 'function' ? cf(x, y) : cf; if (c) this.set(x, y, c); }
      }
    }
    outline(c = OUT) {
      const w = this.w, h = this.h, src = this.b.slice(), oc = pack(c);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (src[y * w + x]) continue;
        const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && src[yy * w + xx] && src[yy * w + xx] !== oc;
        if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) this.b[y * w + x] = oc;
      }
      return this;
    }
    canvas(flip) {
      const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
      const cx = cv.getContext('2d'); const id = cx.createImageData(this.w, this.h);
      const v = new Uint32Array(id.data.buffer);
      if (!flip) v.set(this.b); else for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) v[y * this.w + x] = this.b[y * this.w + (this.w - 1 - x)];
      cx.putImageData(id, 0, 0);
      let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.b[y * this.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (flip && x1 >= 0) { const a = this.w - 1 - x1, b = this.w - 1 - x0; x0 = a; x1 = b; }
      cv._bb = x1 >= 0 ? { x0, y0, x1, y1 } : null;
      return cv;
    }
  }
  R.PC = PC;

  const P = {
    skin: hex('#f2c08a'), skinD: hex('#c4864e'), hair: hex('#5a3a22'),
    cloth: hex('#9a6a3c'), clothD: hex('#6a4426'), leather: hex('#8a5a2a'), leatherD: hex('#5a3818'),
    mail: hex('#9aa4b0'), mailD: hex('#5e6874'), plate: hex('#d0dae4'), plateD: hex('#7a8896'),
    gold: hex('#ffd24a'), goldD: hex('#b8862a'), wood: hex('#a8743c'), woodD: hex('#6a4420'),
    metal: hex('#e8eef4'), metalD: hex('#8a96a4'), green: hex('#4a8a3a'), greenD: hex('#2e5a24'),
    horse: hex('#8a5432'), horseD: hex('#5a3420'), horseW: hex('#e8e0d0'), horseWD: hex('#a8a090'),
    black: hex('#2a2230'), rope: hex('#c8a870'), white: hex('#f8f4ec'), red: hex('#d03030'),
  };
  R.PAL = P;

  // ── 병사 (16×16, 발 위치 = (8,15)) ──
  const INF_STYLE = {
    militia: { body: P.cloth, bodyD: P.clothD, head: 'hair', weapon: 'club', tabard: false },
    swordsman: { body: P.mail, bodyD: P.mailD, head: 'helm', weapon: 'sword', tabard: true, shield: true },
    spearman: { body: P.leather, bodyD: P.leatherD, head: 'cap', weapon: 'spear', tabard: true },
    halberdier: { body: P.mail, bodyD: P.mailD, head: 'helm', weapon: 'halberd', tabard: true },
    axeman: { body: P.plateD, bodyD: P.black, head: 'helm', weapon: 'axe', tabard: false, trim: true },
    knightfoot: { body: P.plate, bodyD: P.plateD, head: 'great', weapon: 'mace', tabard: true, shield: true },
    slinger: { body: P.cloth, bodyD: P.clothD, head: 'hair', weapon: 'sling' },
    archer: { body: P.leather, bodyD: P.leatherD, head: 'hood', weapon: 'bow' },
    crossbow: { body: P.mail, bodyD: P.mailD, head: 'kettle', weapon: 'xbow', tabard: true },
    longbow: { body: P.green, bodyD: P.greenD, head: 'hood', weapon: 'longbow' },
    builder: { body: P.cloth, bodyD: P.clothD, head: 'builder', weapon: 'hammer', apron: true },
  };

  function drawHuman(pc, ox, oy, st, team, frame, mounted) {
    const tc = hex(team.c), td = hex(team.d);
    const set = (x, y, c) => pc.set(ox + x, oy + y, c);
    const rect = (x, y, w, h, c) => pc.rect(ox + x, oy + y, w, h, c);
    const line = (a, b, c2, d, c) => pc.line(ox + a, oy + b, ox + c2, oy + d, c);
    const bob = !mounted && (frame === 1 || frame === 2) ? (frame === 1 ? 0 : 1) : 0;
    if (!mounted) { // 다리
      const lc = st.body === P.plate || st.body === P.plateD ? P.plateD : P.clothD;
      if (frame === 1) { rect(5, 12, 1, 3, lc); rect(9, 12, 1, 3, lc); set(5, 14, P.black); set(9, 14, P.black); }
      else if (frame === 2) { rect(6, 12, 1, 3, lc); rect(8, 12, 1, 2, lc); set(6, 14, P.black); set(8, 13, P.black); }
      else { rect(6, 12, 1, 3, lc); rect(8, 12, 1, 3, lc); set(6, 14, P.black); set(8, 14, P.black); }
    }
    const by = bob;
    // 몸통
    rect(5, 7 + by, 5, 5, st.body); rect(5, 11 + by, 5, 1, st.bodyD); rect(5, 7 + by, 1, 5, st.bodyD);
    if (st.tabard) { rect(6, 8 + by, 3, 4, tc); rect(6, 11 + by, 3, 1, td); }
    if (st.trim) { rect(5, 9 + by, 5, 1, tc); }
    if (st.apron) { rect(6, 9 + by, 3, 3, P.leather); }
    rect(5, 10 + by, 5, 1, st.apron ? P.leatherD : P.leatherD); // 허리띠
    // 머리
    rect(6, 3 + by, 3, 4, P.skin); set(6, 6 + by, P.skinD); set(8, 4 + by, P.black);
    switch (st.head) {
      case 'hair': rect(6, 2 + by, 3, 1, P.hair); set(6, 3 + by, P.hair); break;
      case 'helm': rect(5, 2 + by, 5, 2, P.metal); rect(5, 3 + by, 1, 2, P.metalD); set(9, 3 + by, P.metalD); break;
      case 'cap': rect(6, 2 + by, 3, 1, tc); set(5, 3 + by, tc); break;
      case 'great': rect(5, 2 + by, 4, 5, P.plate); rect(7, 4 + by, 2, 1, P.black); set(5, 2 + by, P.plateD); set(7, 1 + by, tc); set(6, 1 + by, tc); break;
      case 'hood': rect(5, 2 + by, 4, 2, tc); rect(5, 3 + by, 1, 3, td); break;
      case 'kettle': rect(4, 2 + by, 6, 1, P.metalD); rect(6, 1 + by, 3, 1, P.metal); break;
      case 'builder': rect(6, 2 + by, 3, 1, P.gold); rect(5, 3 + by, 5, 1, P.goldD); break;
    }
    const atk = frame === 3;
    // 무기
    switch (st.weapon) {
      case 'club': if (atk) { line(9, 8, 13, 6, P.wood); set(13, 6, P.woodD); } else { line(10, 5, 10, 11, P.wood); rect(10, 4, 1, 2, P.woodD); } break;
      case 'sword':
        if (atk) { line(10, 7 + by, 14, 7 + by, P.metal); set(10, 8 + by, P.goldD); } else { line(4, 2 + by, 4, 7 + by, P.metal); set(4, 8 + by, P.goldD); }
        rect(9, 7 + by, 3, 5, tc); rect(11, 7 + by, 1, 5, td); set(10, 9 + by, P.gold); break;
      case 'spear': case 'halberd':
        if (atk) { line(8, 8 + by, 15, 8 + by, P.wood); rect(14, 7 + by, 2, 3, P.metal); if (st.weapon === 'halberd') rect(13, 6 + by, 1, 2, P.metal); }
        else { line(10, 0, 10, 13, P.wood); rect(10, 0, 1, 2, P.metal); if (st.weapon === 'halberd') { rect(11, 1, 2, 2, P.metal); set(9, 2, P.metalD); } }
        break;
      case 'axe':
        if (atk) { line(9, 8, 13, 7, P.wood); rect(13, 5, 2, 4, P.metal); set(14, 5, P.metalD); }
        else { line(10, 4, 10, 11, P.wood); rect(11, 3, 2, 3, P.metal); set(12, 5, P.metalD); }
        break;
      case 'mace':
        if (atk) { line(10, 7 + by, 13, 6 + by, P.wood); rect(13, 5 + by, 2, 2, P.metalD); }
        else { line(4, 4 + by, 4, 8 + by, P.wood); rect(3, 3 + by, 3, 2, P.metalD); }
        rect(9, 7 + by, 3, 5, tc); rect(9, 8 + by, 3, 1, P.white); set(10, 7 + by, P.white); set(10, 9 + by, P.white); break;
      case 'sling':
        if (atk) { line(9, 6, 12, 2, P.rope); set(12, 2, P.metalD); } else { line(9, 9, 10, 12, P.rope); set(10, 12, P.metalD); }
        break;
      case 'bow': case 'longbow': {
        const top = st.weapon === 'longbow' ? 2 : 4, bot = st.weapon === 'longbow' ? 13 : 11;
        line(11, top + by, 12, top + 2 + by, P.wood); line(12, top + 2 + by, 12, bot - 2 + by, P.wood); line(12, bot - 2 + by, 11, bot + by, P.wood);
        line(11, top + by, 11, bot + by, P.white);
        if (atk) { line(7, 8 + by, 14, 8 + by, P.rope); set(14, 8 + by, P.metal); }
        break;
      }
      case 'xbow':
        line(8, 8 + by, 13, 8 + by, P.woodD); line(13, 6 + by, 13, 10 + by, P.wood); if (atk) set(14, 8 + by, P.metal); else set(12, 7 + by, P.metal);
        break;
      case 'hammer':
        if (atk) { line(9, 7, 12, 5, P.wood); rect(12, 3, 2, 3, P.metalD); } else { line(10, 6, 10, 11, P.wood); rect(9, 5, 3, 2, P.metalD); }
        break;
    }
  }

  function infantry(key, team, frame) {
    const pc = new PC(16, 16);
    drawHuman(pc, 0, 0, INF_STYLE[key], team, frame, false);
    return pc.outline();
  }

  // ── 기병 (24×22, 발 = (12,21)) ──
  const CAV_STYLE = {
    scout: { horse: 'b', rider: { body: P.leather, bodyD: P.leatherD, head: 'cap', weapon: 'spearR' }, cap: false },
    horsearcher: { horse: 'b', rider: { body: P.cloth, bodyD: P.clothD, head: 'hood', weapon: 'bow' }, cap: false },
    knight: { horse: 'd', rider: { body: P.plate, bodyD: P.plateD, head: 'great', weapon: 'lance', tabard: true }, cap: true },
    paladin: { horse: 'w', rider: { body: P.plate, bodyD: P.plateD, head: 'great', weapon: 'lance', tabard: true }, cap: true, gold: true },
    general: { horse: 'w', rider: { body: P.gold, bodyD: P.goldD, head: 'crown', weapon: 'sword', tabard: true, cape: true }, cap: true, gold: true },
  };
  function cavalry(key, team, frame) {
    const st = CAV_STYLE[key];
    const pc = new PC(24, 22);
    const tc = hex(team.c), td = hex(team.d);
    const hc = st.horse === 'w' ? P.horseW : st.horse === 'd' ? P.horseD : P.horse;
    const hd = st.horse === 'w' ? P.horseWD : st.horse === 'd' ? P.black : P.horseD;
    // 말 다리
    const legs = frame === 1 ? [[6, 1], [9, -1], [14, 1], [17, -1]] : frame === 2 ? [[6, -1], [9, 1], [14, -1], [17, 1]] : [[6, 0], [9, 0], [15, 0], [17, 0]];
    for (const [lx, sk] of legs) { pc.line(lx, 15, lx + sk, 19, hd); pc.set(lx + sk, 20, P.black); }
    // 몸통
    pc.rect(5, 10, 14, 6, hc); pc.rect(5, 15, 14, 1, hd); pc.rect(5, 10, 2, 5, hd);
    // 목·머리
    pc.poly([[16, 11], [18, 5], [21, 5], [22, 8], [20, 9], [19, 12]], hc);
    pc.set(20, 6, P.black); pc.rect(18, 4, 2, 2, hd); pc.set(22, 8, hd);
    // 꼬리
    pc.line(4, 10, 2, 15, hd); pc.line(3, 10, 1, 14, hd);
    // 마갑(카파리슨)
    if (st.cap) {
      pc.rect(6, 10, 12, 6, tc); for (let x = 6; x < 18; x += 2) pc.set(x, 16, td); pc.rect(6, 10, 12, 1, st.gold ? P.gold : td);
      if (st.gold) { pc.set(11, 13, P.gold); pc.set(12, 12, P.gold); pc.set(12, 14, P.gold); pc.set(13, 13, P.gold); }
    } else { pc.rect(9, 10, 5, 2, P.leatherD); }
    // 기수
    const rs = Object.assign({}, st.rider);
    const ox = 4, oy = -2;
    if (rs.cape) { pc.poly([[ox + 4, oy + 7], [ox + 6, oy + 7], [ox + 4, oy + 14], [ox + 1, oy + 13]], tc); }
    if (rs.head === 'crown') {
      rs.head = 'hair';
      drawHuman(pc, ox, oy, rs, team, frame === 3 ? 3 : 0, true);
      pc.rect(ox + 6, oy + 1, 3, 1, P.gold); pc.set(ox + 6, oy, P.gold); pc.set(ox + 8, oy, P.gold);
    } else if (rs.weapon === 'lance' || rs.weapon === 'spearR') {
      rs.weapon = 'none';
      drawHuman(pc, ox, oy, rs, team, 0, true);
      if (frame === 3) { pc.line(ox + 8, oy + 9, 23, oy + 9, P.wood); pc.rect(21, oy + 8, 3, 3, P.metal); }
      else { pc.line(ox + 9, oy + 13, 22, oy + 2, P.wood); pc.rect(21, oy + 1, 2, 2, P.metal); if (rs.tabard) pc.rect(18, oy + 4, 2, 2, tc); }
    } else drawHuman(pc, ox, oy, rs, team, frame === 3 ? 3 : 0, true);
    return pc.outline();
  }

  // ── 공성병기 (32×26, 바닥 = (16,25)) ──
  function siege(key, team, frame) {
    const pc = new PC(32, 26);
    const tc = hex(team.c);
    const wheel = (cx, cy) => { pc.rect(cx - 2, cy - 2, 5, 5, P.woodD); pc.rect(cx - 1, cy - 1, 3, 3, P.wood); pc.set(cx, cy, P.metalD); };
    if (key === 'ram') {
      pc.poly([[4, 12], [16, 4], [28, 12], [28, 20], [4, 20]], (x, y) => (y + x) % 4 === 0 ? P.woodD : P.wood);
      pc.rect(4, 18, 24, 2, P.woodD);
      pc.line(4, 12, 16, 4, P.leatherD); pc.line(16, 4, 28, 12, P.leatherD);
      const push = frame === 3 ? 3 : 0;
      pc.rect(1 + push + 24, 14, 6, 3, P.wood); pc.rect(29 + push, 13, 3, 5, P.metalD);
      pc.rect(14, 5, 4, 2, tc);
      wheel(8, 21); wheel(23, 21);
    } else if (key === 'ballista') {
      pc.rect(8, 16, 16, 3, P.woodD); wheel(10, 21); wheel(22, 21);
      pc.line(10, 15, 27, 12, P.wood); pc.line(10, 14, 27, 11, P.woodD);
      pc.line(22, 6, 24, 12, P.wood); pc.line(24, 12, 22, 18, P.wood); pc.line(22, 6, 22, 18, P.white);
      if (frame !== 3) { pc.line(14, 13, 28, 11, P.metalD); pc.set(28, 11, P.metal); }
      pc.rect(12, 16, 3, 2, tc);
    } else if (key === 'mangonel') {
      pc.rect(6, 16, 20, 3, P.woodD); wheel(9, 21); wheel(23, 21);
      pc.line(8, 15, 12, 8, P.wood); pc.line(24, 15, 20, 8, P.wood); pc.rect(11, 7, 10, 2, P.woodD);
      if (frame === 3) { pc.line(16, 14, 24, 2, P.wood); pc.rect(23, 1, 3, 3, P.leatherD); }
      else { pc.line(16, 14, 6, 9, P.wood); pc.rect(4, 8, 4, 3, P.leatherD); pc.rect(5, 7, 2, 2, P.mailD); }
      pc.rect(14, 16, 4, 2, tc);
    } else { // trebuchet
      pc.rect(4, 20, 24, 3, P.woodD); wheel(7, 23); wheel(25, 23);
      pc.line(10, 20, 16, 4, P.wood); pc.line(22, 20, 16, 4, P.wood); pc.line(11, 20, 17, 4, P.woodD);
      if (frame === 3) { pc.line(16, 5, 26, 0, P.wood); pc.line(16, 5, 11, 9, P.wood); pc.rect(9, 9, 5, 5, P.mailD); }
      else { pc.line(16, 5, 4, 1, P.wood); pc.line(16, 5, 21, 13, P.wood); pc.rect(19, 13, 5, 5, P.mailD); pc.line(4, 1, 6, 6, P.rope); }
      pc.rect(15, 3, 3, 3, tc);
    }
    return pc.outline();
  }

  // 캐시: key|color|frame|flip
  const cache = new Map();
  R.unitSprite = function (key, colorIdx, frame, flip) {
    const k = key + '|' + colorIdx + '|' + frame + '|' + (flip ? 1 : 0);
    let s = cache.get(k);
    if (!s) {
      const team = R.COLORS[colorIdx] || R.COLORS[7];
      const u = R.U[key];
      let pc;
      if (key === 'general' || (u && u.cls === 'cav')) pc = cavalry(key, team, frame);
      else if (u && u.cls === 'siege') pc = siege(key, team, frame);
      else pc = infantry(key, team, frame);
      s = pc.canvas(flip); cache.set(k, s);
    }
    return s;
  };

  // ── 건물 (쿼터뷰 상자) ──
  const TW = 32, TH = 16;
  // 박스: 바닥 마름모 w×d 타일, 높이 h px. 반환 캔버스 원점: 바닥 마름모 위쪽 꼭짓점이 (ox, oy)
  function isoBox(pc, ox, oy, w, d, h, top, left, right, tex) {
    const A = [ox, oy], Bp = [ox + w * TW / 2, oy + w * TH / 2], C = [ox + (w - d) * TW / 2, oy + (w + d) * TH / 2], D = [ox - d * TW / 2, oy + d * TH / 2];
    const up = (p) => [p[0], p[1] - h];
    pc.poly([D, C, up(C), up(D)], (x, y) => texc(left, x, y, tex, 0));
    pc.poly([C, Bp, up(Bp), up(C)], (x, y) => texc(right, x, y, tex, 1));
    if (top) pc.poly([up(A), up(Bp), up(C), up(D)], (x, y) => texc(top, x, y, tex, 2));
    return { A: up(A), B: up(Bp), C: up(C), D: up(D), gA: A, gB: Bp, gC: C, gD: D };
  }
  function texc(c, x, y, tex, face) {
    if (!tex) return c;
    if (tex === 'stone') { const row = y >> 2; const off = (row & 1) * 3; if ((y & 3) === 0) return shade(c, 0.8); if (((x + off) % 6) === 0) return shade(c, 0.82); return R.hash2(x, y, 3) > 0.85 ? shade(c, 1.08) : c; }
    if (tex === 'wood') { if (face === 2) return (x % 4 === 0) ? shade(c, 0.85) : c; return (y % 3 === 0) ? shade(c, 0.82) : (R.hash2(x, y, 5) > 0.9 ? shade(c, 0.9) : c); }
    if (tex === 'plaster') { return R.hash2(x, y, 7) > 0.9 ? shade(c, 0.94) : c; }
    if (tex === 'thatch') { return ((x + y) % 3 === 0) ? shade(c, 0.85) : (R.hash2(x, y, 2) > 0.8 ? shade(c, 1.1) : c); }
    if (tex === 'tile') { return (y % 3 === 0 || (x + (y / 3 | 0) * 2) % 5 === 0) ? shade(c, 0.8) : c; }
    if (tex === 'crop') { return ((x - y * 2) & 7) < 2 ? shade(c, 0.75) : (R.hash2(x, y, 4) > 0.8 ? shade(c, 1.15) : c); }
    return c;
  }
  // 박공 지붕 (x축 방향 용마루)
  function gableRoof(pc, b, rh, c, tex) {
    const midL = [(b.A[0] + b.D[0]) / 2, (b.A[1] + b.D[1]) / 2 - rh];
    const midR = [(b.B[0] + b.C[0]) / 2, (b.B[1] + b.C[1]) / 2 - rh];
    pc.poly([b.D, b.C, midR, midL], (x, y) => texc(c, x, y, tex, 0));
    pc.poly([b.A, b.B, midR, midL], (x, y) => texc(shade(c, 1.15), x, y, tex, 2));
    pc.poly([b.C, b.B, midR], (x, y) => texc(shade(c, 0.7), x, y, tex, 1));
    pc.line(midL[0], midL[1], midR[0], midR[1], shade(c, 0.6));
    return { ridgeL: midL, ridgeR: midR };
  }
  function pyramidRoof(pc, b, rh, c, tex) {
    const cx = (b.A[0] + b.C[0]) / 2, cy = (b.A[1] + b.C[1]) / 2 - rh;
    pc.poly([b.D, b.C, [cx, cy]], (x, y) => texc(c, x, y, tex, 0));
    pc.poly([b.C, b.B, [cx, cy]], (x, y) => texc(shade(c, 0.72), x, y, tex, 1));
    return [cx, cy];
  }
  function flag(pc, x, y, tc, h = 9) {
    pc.line(x, y, x, y - h, P.woodD);
    pc.rect(x + 1, y - h, 5, 3, tc); pc.rect(x + 1, y - h + 3, 3, 1, tc);
  }
  function crenel(pc, b, c) {
    // 위쪽 모서리를 따라 흉벽
    const edges = [[b.D, b.C], [b.C, b.B]];
    for (const [p, q] of edges) {
      const n = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 4));
      for (let i = 0; i <= n; i += 2) { const x = R.lerp(p[0], q[0], i / n), y = R.lerp(p[1], q[1], i / n); pc.rect(x - 1, y - 3, 3, 3, c); }
    }
  }
  function windowsOn(pc, b, c, rows) {
    const p = b.gD, q = b.gC; // 왼쪽 면
    for (let i = 1; i <= 2; i++) {
      const x = R.lerp(p[0], q[0], i / 3), y = R.lerp(p[1], q[1], i / 3) - rows;
      pc.rect(x, y, 2, 3, c); pc.set(x, y + 3, shade(c, 0.6));
    }
  }
  function door(pc, b, c) {
    const x = R.lerp(b.gC[0], b.gB[0], 0.45), y = R.lerp(b.gC[1], b.gB[1], 0.45);
    pc.poly([[x - 2, y - 1], [x + 2, y - 3], [x + 2, y - 10], [x - 2, y - 8]], c);
  }

  function building(key, colorIdx, level, prog) {
    const def = R.B[key] || { size: 2 };
    const team = colorIdx >= 0 ? R.COLORS[colorIdx] : { c: '#b0a890', d: '#706858' };
    const tc = hex(team.c), td = hex(team.d);
    const s = def.size;
    const W = s * TW + 8, Hh = s * TH + 72;
    const pc = new PC(W, Hh);
    const ox = W / 2, oy = Hh - s * TH - 2; // 바닥 마름모 위 꼭짓점
    const plaster = hex('#e8dcc0'), timber = hex('#6a4426'), stone = hex('#a8a49a'), stoneD = hex('#7a766e');
    const roofR = hex('#b8452e'), roofB = hex('#5a5a6e'), thatch = hex('#d4b060'), dirt = hex('#8a6a42');
    const lv = level || 1;

    if (prog != null && prog < 1) { // 건설 중: 비계 + 기초
      isoBox(pc, ox, oy, s, s, 2, dirt, shade(dirt, 0.8), shade(dirt, 0.7));
      const hgt = Math.max(4, Math.round((10 + s * 6) * prog));
      const b = isoBox(pc, ox, oy, s, s, hgt, null, shade(P.wood, 0.9), shade(P.wood, 0.7), 'wood');
      for (const p of [b.gA, b.gB, b.gC, b.gD]) pc.line(p[0], p[1], p[0], p[1] - hgt - 6, P.woodD);
      pc.line(b.gD[0], b.gD[1] - hgt - 4, b.gC[0], b.gC[1] - hgt - 4, P.wood);
      pc.line(b.gC[0], b.gC[1] - hgt - 4, b.gB[0], b.gB[1] - hgt - 4, P.wood);
      const cv0 = pc.outline().canvas(); cv0._ox = ox; cv0._oy = oy; return cv0;
    }

    switch (key) {
      case 'base': {
        isoBox(pc, ox, oy, s, s, 3, shade(stone, 0.9), stoneD, shade(stoneD, 0.8), 'stone');
        const b = isoBox(pc, ox, oy, s, s, 18 + lv * 2, stone, shade(stone, 0.9), stoneD, 'stone');
        crenel(pc, b, stone);
        // 중앙 망루(keep)
        const k = isoBox(pc, ox, oy + 16 - 18 - lv * 2, 2, 2, 22, stone, shade(stone, 0.92), stoneD, 'stone');
        crenel(pc, k, shade(stone, 1.05));
        const pk = pyramidRoof(pc, k, 14 + lv * 2, lv >= 3 ? hex('#3a4a8a') : roofR, 'tile');
        flag(pc, pk[0], pk[1], tc, 12);
        door(pc, b, timber);
        windowsOn(pc, k, P.black, 14);
        break;
      }
      case 'house': {
        const b = isoBox(pc, ox, oy, 1, 1, 10, null, plaster, shade(plaster, 0.8), 'plaster');
        pc.line(b.gD[0], b.gD[1] - 5, b.gC[0], b.gC[1] - 5, timber);
        gableRoof(pc, b, 8, thatch, 'thatch');
        door(pc, b, timber);
        pc.rect(b.A[0] - 3, b.A[1] - 6, 2, 4, stoneD);
        pc.set(b.gD[0] + 4, b.gD[1] - 6, tc); pc.set(b.gD[0] + 5, b.gD[1] - 6, tc);
        break;
      }
      case 'farm': {
        isoBox(pc, ox, oy, 2, 2, 1, hex('#6a4a26'), dirt, shade(dirt, 0.8));
        const crop = lv >= 3 ? hex('#e8c040') : lv === 2 ? hex('#c8b040') : hex('#8ab040');
        isoBox(pc, ox, oy, 2, 2, 3, crop, shade(crop, 0.7), shade(crop, 0.6), 'crop');
        // 작은 헛간
        const b = isoBox(pc, ox + 10, oy + 9, 1, 1, 8, null, hex('#a8402a'), hex('#782a1a'), 'wood');
        gableRoof(pc, b, 5, hex('#6a5a4a'), 'wood');
        // 울타리
        pc.line(ox - 32, oy + 16, ox, oy + 32, P.woodD);
        flag(pc, ox - 2, oy + 4, tc, 7);
        break;
      }
      case 'mill': {
        const b = isoBox(pc, ox, oy, 2, 2, 16, null, stone, stoneD, 'stone');
        const pk = pyramidRoof(pc, b, 12, roofR, 'tile');
        door(pc, b, timber);
        // 풍차 날개
        const cx = b.C[0] - 2, cy = b.C[1] - 14;
        const r = 14 + lv * 2;
        for (let a = 0; a < 4; a++) {
          const ang = a * Math.PI / 2 + Math.PI / 4;
          pc.line(cx, cy, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, P.woodD);
          const mx = cx + Math.cos(ang) * r * 0.6, my = cy + Math.sin(ang) * r * 0.6;
          pc.rect(mx - 2, my - 2, 4, 4, P.white);
        }
        pc.rect(cx - 1, cy - 1, 3, 3, P.metalD);
        flag(pc, pk[0], pk[1], tc);
        break;
      }
      case 'mine': {
        isoBox(pc, ox, oy, 2, 2, 4, hex('#7a7068'), hex('#5a524a'), hex('#4a423a'), 'stone');
        const b = isoBox(pc, ox, oy, 2, 2, 12, null, hex('#8a8278'), hex('#5a524a'), 'stone');
        pc.poly([b.D, b.C, b.B, [b.B[0] - 6, b.B[1] - 10], [b.A[0], b.A[1] - 14], [b.D[0] + 6, b.D[1] - 10]], (x, y) => texc(hex('#9a9084'), x, y, 'stone', 2));
        // 갱도 입구
        const x = R.lerp(b.gC[0], b.gB[0], 0.4), y = R.lerp(b.gC[1], b.gB[1], 0.4);
        pc.poly([[x - 4, y], [x + 4, y - 4], [x + 4, y - 13], [x - 4, y - 9]], P.black);
        pc.line(x - 5, y, x - 5, y - 10, P.wood); pc.line(x + 5, y - 4, x + 5, y - 14, P.wood); pc.line(x - 5, y - 10, x + 5, y - 14, P.wood);
        // 금 원석
        for (let i = 0; i < 4 + lv * 2; i++) pc.rect(ox - 18 + R.hash2(i, lv, 1) * 34, oy + 14 + R.hash2(i, 2, 1) * 10, 2, 2, P.gold);
        // 수레
        pc.rect(ox + 8, oy + 20, 7, 4, P.woodD); pc.rect(ox + 9, oy + 19, 5, 2, P.gold);
        flag(pc, b.A[0], b.A[1] - 12, tc);
        break;
      }
      case 'market': {
        isoBox(pc, ox, oy, 3, 3, 2, hex('#b8a888'), hex('#8a7a62'), hex('#7a6a52'), 'stone');
        // 천막 3개
        const cols = [tc, hex('#e8e0c8'), hex('#d0a030')];
        for (let i = 0; i < 3; i++) {
          const bx = ox + (i - 1) * 14, by = oy + 10 + Math.abs(i - 1) * 6;
          const b = isoBox(pc, bx, by, 1, 1, 8 + (lv - 1) * 2, null, P.woodD, P.woodD);
          gableRoof(pc, b, 6, cols[i], null);
          pc.rect(b.gD[0] + 4, b.gD[1] - 4, 6, 2, i === 1 ? P.gold : hex('#c84030'));
        }
        const b2 = isoBox(pc, ox, oy + 2, 1, 1, 14 + lv * 3, null, plaster, shade(plaster, 0.8), 'plaster');
        const pk = pyramidRoof(pc, b2, 8, roofR, 'tile');
        flag(pc, pk[0], pk[1], tc);
        break;
      }
      case 'smith': {
        const b = isoBox(pc, ox, oy, 2, 2, 13, null, stone, stoneD, 'stone');
        gableRoof(pc, b, 9, roofB, 'tile');
        // 굴뚝 + 화로
        pc.rect(b.A[0] + 6, b.A[1] - 18, 4, 12, stoneD); pc.rect(b.A[0] + 7, b.A[1] - 20, 2, 2, hex('#404040'));
        const x = R.lerp(b.gC[0], b.gB[0], 0.45), y = R.lerp(b.gC[1], b.gB[1], 0.45);
        pc.poly([[x - 3, y - 1], [x + 3, y - 4], [x + 3, y - 9], [x - 3, y - 6]], hex('#ff8a2a'));
        pc.rect(ox - 20, oy + 16, 6, 3, P.metalD); pc.rect(ox - 19, oy + 14, 3, 2, P.metalD);
        for (let i = 0; i < lv; i++) pc.rect(b.gD[0] + 4 + i * 4, b.gD[1] - 8, 2, 3, P.gold);
        flag(pc, b.A[0], b.A[1] - 8, tc);
        break;
      }
      case 'barracks': case 'range': case 'stable': case 'workshop': {
        const wallC = key === 'workshop' ? hex('#9a7a5a') : key === 'stable' ? hex('#b08a5a') : stone;
        const tex = key === 'barracks' ? 'stone' : 'wood';
        const b = isoBox(pc, ox, oy, 3, 3, 14 + (lv - 1) * 3, null, wallC, shade(wallC, 0.72), tex);
        const roofC = key === 'barracks' ? roofR : key === 'range' ? hex('#4a7a3a') : key === 'stable' ? thatch : roofB;
        const rr = gableRoof(pc, b, 12, roofC, key === 'stable' ? 'thatch' : 'tile');
        door(pc, b, timber); windowsOn(pc, b, P.black, 9);
        // 상징
        const sx = R.lerp(b.gD[0], b.gC[0], 0.5), sy = R.lerp(b.gD[1], b.gC[1], 0.5) - 10;
        if (key === 'barracks') { pc.rect(sx - 3, sy - 4, 6, 7, tc); pc.line(sx - 2, sy - 3, sx + 2, sy + 2, P.metal); pc.line(sx + 2, sy - 3, sx - 2, sy + 2, P.metal); }
        if (key === 'range') { pc.rect(ox - 30, oy + 18, 6, 6, P.white); pc.rect(ox - 28, oy + 20, 2, 2, P.red); pc.line(sx - 2, sy - 4, sx - 2, sy + 4, P.wood); pc.line(sx - 2, sy - 4, sx + 2, sy, P.white); pc.line(sx + 2, sy, sx - 2, sy + 4, P.white); }
        if (key === 'stable') { pc.rect(ox + 14, oy + 22, 12, 2, P.woodD); pc.rect(ox + 14, oy + 19, 1, 5, P.woodD); pc.rect(ox + 25, oy + 19, 1, 5, P.woodD); pc.rect(sx - 2, sy - 2, 4, 4, P.horse); }
        if (key === 'workshop') { pc.rect(ox + 12, oy + 20, 10, 3, P.woodD); pc.set(ox + 14, oy + 24, P.black); pc.set(ox + 20, oy + 24, P.black); pc.line(sx - 3, sy + 3, sx + 3, sy - 3, P.wood); }
        flag(pc, rr.ridgeL[0], rr.ridgeL[1], tc, 10);
        if (lv >= 2) flag(pc, rr.ridgeR[0], rr.ridgeR[1], tc, 8);
        break;
      }
      case 'tower_wood': {
        for (const [dx, dy] of [[-8, 2], [8, 2], [0, 8]]) pc.line(ox + dx, oy + 8 + dy, ox + dx * 0.6, oy - 18, P.woodD);
        const b = isoBox(pc, ox, oy - 22, 1, 1, 8, P.wood, P.wood, P.woodD, 'wood');
        pc.line(ox - 12, oy - 2, ox + 12, oy - 2, P.wood);
        pyramidRoof(pc, b, 9, thatch, 'thatch');
        flag(pc, b.A[0], b.A[1] - 6, tc, 8);
        break;
      }
      case 'tower_stone': {
        const b = isoBox(pc, ox, oy, 1, 1, 34, stone, shade(stone, 0.92), stoneD, 'stone');
        crenel(pc, b, stone);
        pc.rect(ox - 4, oy - 16, 2, 4, P.black); pc.rect(ox + 4, oy - 12, 2, 4, P.black);
        flag(pc, b.A[0], b.A[1], tc, 12);
        break;
      }
      case 'wall_wood': case 'stake': {
        if (key === 'stake') {
          for (let i = 0; i < 4; i++) { const x = ox - 10 + i * 6, y = oy + 4 + i * 3; pc.line(x, y + 6, x + 4, y - 4, P.wood); pc.set(x + 4, y - 5, P.white); }
        } else {
          for (let i = -7; i <= 7; i += 2) { const x = ox + i, y = oy + 8; pc.rect(x, y - 14, 2, 14 + Math.abs(i) / 2, i % 4 === 1 ? P.woodD : P.wood); pc.set(x, y - 15, P.woodD); }
        }
        break;
      }
      case 'wall_stone': {
        const b = isoBox(pc, ox, oy, 1, 1, 16, stone, shade(stone, 0.9), stoneD, 'stone');
        crenel(pc, b, stone);
        break;
      }
      case 'gate_wood': case 'gate_stone': {
        const isS = key === 'gate_stone';
        const b = isoBox(pc, ox, oy, 1, 1, isS ? 20 : 16, isS ? stone : P.wood, isS ? shade(stone, 0.9) : P.wood, isS ? stoneD : P.woodD, isS ? 'stone' : 'wood');
        if (isS) crenel(pc, b, stone);
        pc.poly([[ox - 6, oy + 11], [ox + 2, oy + 15], [ox + 2, oy + 4], [ox - 6, oy]], timber);
        pc.line(ox - 6, oy + 5, ox + 2, oy + 9, P.metalD);
        pc.rect(ox - 2, oy - 2 - (isS ? 16 : 12), 4, 3, tc);
        break;
      }
      case 'village': {
        // 중립 마을: 집 3채 + 우물
        const own = colorIdx >= 0;
        for (const [dx, dy] of [[-10, 6], [10, 6], [0, 16]]) {
          const b = isoBox(pc, ox + dx, oy + dy, 1, 1, 9, null, plaster, shade(plaster, 0.78), 'plaster');
          gableRoof(pc, b, 7, own ? shade(tc, 0.9) : thatch, own ? 'tile' : 'thatch');
          door(pc, b, timber);
        }
        pc.rect(ox - 3, oy + 12, 6, 4, stone); pc.rect(ox - 2, oy + 12, 4, 2, hex('#3a6ab0'));
        if (own) flag(pc, ox, oy + 6, tc, 14); else { pc.line(ox, oy + 6, ox, oy - 8, P.woodD); pc.rect(ox + 1, oy - 8, 5, 3, P.white); }
        break;
      }
    }
    const cv = pc.outline().canvas(); cv._ox = ox; cv._oy = oy; return cv;
  }
  const bcache = new Map();
  R.buildingSprite = function (key, colorIdx, level, prog) {
    const pb = prog != null && prog < 1 ? 1 : 0;
    const k = key + '|' + colorIdx + '|' + (level || 1) + '|' + pb;
    let s = bcache.get(k);
    if (!s) { s = building(key, colorIdx, level, pb ? 0.5 : null); s._top = topRow(s); bcache.set(k, s); }
    return s;
  };
  function topRow(cv) { return cv._bb ? cv._bb.y0 : 0; }
  function cropCanvas(cv) {
    if (!cv._bb) return cv;
    const { x0, y0, x1, y1 } = cv._bb;
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(cv, -x0, -y0); return o;
  }

  // ── 지형 타일 ──
  const TC = {
    0: [hex('#5aa83a'), hex('#4a9a32'), hex('#6ab84a')],
    1: [hex('#c8a46a'), hex('#b8945a'), hex('#d8b47a')],
    2: [hex('#3e8a2e'), hex('#347a28'), hex('#4a9a38')],
    4: [hex('#5aa8c8'), hex('#4a98b8'), hex('#7ac0d8')],
    5: [hex('#2e6ab8'), hex('#285ea8'), hex('#3a7ac8')],
    6: [hex('#8a8478'), hex('#787266'), hex('#9a9488')],
    7: [hex('#a8743c'), hex('#8a5a2a'), hex('#b8844c')],
    8: [hex('#e0cc8a'), hex('#d0bc7a'), hex('#ecd89a')],
  };
  R.TC = TC;
  function tileCanvas(t, e, v) {
    const lift = e === 1 ? 6 : e === 2 ? 12 : 0;
    const W = TW, H = TH + lift + 1;
    const pc = new PC(W, H);
    const cols = TC[t] || TC[0];
    const base = e === 1 && t === 0 ? shade(cols[0], 1.08) : cols[0];
    const top = [[W / 2, 0], [W, TH / 2], [W / 2, TH], [0, TH / 2]];
    if (lift) {
      const sideL = t === 6 ? shade(cols[0], 0.72) : hex('#8a6a3a'), sideR = t === 6 ? shade(cols[0], 0.55) : hex('#6a4e2a');
      pc.poly([[0, TH / 2], [W / 2, TH], [W / 2, TH + lift], [0, TH / 2 + lift]], (x, y) => (t === 6 && ((x + y * 2) % 7 === 0)) ? shade(sideL, 0.85) : (R.hash2(x, y, v) > 0.85 ? shade(sideL, 0.9) : sideL));
      pc.poly([[W / 2, TH], [W, TH / 2], [W, TH / 2 + lift], [W / 2, TH + lift]], (x, y) => (t === 6 && ((x - y * 2) % 7 === 0)) ? shade(sideR, 0.85) : (R.hash2(x, y, v + 1) > 0.85 ? shade(sideR, 0.9) : sideR));
      if (t !== 6) pc.line(0, TH / 2 + 1, W / 2, TH + 1, shade(base, 0.8));
    }
    pc.poly(top, (x, y) => {
      const r = R.hash2(x, y, v * 13 + t);
      if (t === 5) return (((x + y * 2 + v) % 9) === 0) ? cols[2] : (r > 0.9 ? cols[1] : base);
      if (t === 4) return r > 0.82 ? cols[2] : (r < 0.1 ? hex('#c8b47a') : base);
      if (t === 7) return (x % 4 === 0) ? cols[1] : base;
      if (t === 1) return r > 0.85 ? cols[1] : r < 0.06 ? hex('#9a8a7a') : base;
      return r > 0.86 ? cols[2] : r < 0.12 ? cols[1] : base;
    });
    // 잔디 장식
    if ((t === 0 || t === 2) && v % 3 === 0) { pc.set(10 + v % 8, 6, hex('#7ac85a')); pc.set(11 + v % 8, 5, hex('#7ac85a')); }
    if (t === 0 && v % 7 === 1) { pc.set(18, 8, hex('#f0e060')); pc.set(8, 9, hex('#f080a0')); }
    if (t === 7) { pc.line(0, TH / 2, W / 2, 0, P.woodD); pc.line(W / 2, TH, W, TH / 2, P.woodD); }
    const cv = pc.canvas(); cv._lift = lift; return cv;
  }
  const tcache = new Map();
  R.tileSprite = function (t, e, v) {
    const k = t * 100 + e * 10 + v; let s = tcache.get(k);
    if (!s) { s = tileCanvas(t, e, v); tcache.set(k, s); }
    return s;
  };

  // 나무 (16×26)
  function tree(v) {
    const pc = new PC(18, 28);
    const pine = v % 3 !== 0;
    pc.rect(8, 20, 2, 7, P.woodD);
    if (pine) {
      const g = [hex('#2a6a2a'), hex('#3a8a34'), hex('#4ea842')];
      for (let i = 0; i < 3; i++) { const y = 3 + i * 6, w = 4 + i * 3; pc.poly([[9, y - 3], [9 + w, y + 7], [9 - w, y + 7]], (x, yy) => x > 9 ? g[0] : (R.hash2(x, yy, v) > 0.7 ? g[2] : g[1])); }
    } else {
      const g = [hex('#2e7a2e'), hex('#4a9a3a'), hex('#6ab84a')];
      for (const [cx, cy, r] of [[9, 10, 7], [5, 14, 5], [13, 14, 5], [9, 6, 5]]) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) pc.set(cx + x, cy + y, (x + y > 2) ? g[0] : (R.hash2(cx + x, cy + y, v) > 0.75 ? g[2] : g[1]));
      if (v % 5 === 2) { pc.set(6, 9, P.red); pc.set(12, 12, P.red); }
    }
    return pc.outline(hex('#1a2a14')).canvas();
  }
  const trees = [];
  R.treeSprite = (v) => { const i = v % 6; return trees[i] || (trees[i] = tree(i)); };

  // 광맥 돌
  R.oreSprite = (() => {
    let s = null; return () => {
      if (s) return s; const pc = new PC(64, 34);
      for (const [cx, cy, r] of [[22, 20, 7], [36, 22, 8], [30, 14, 6], [44, 18, 5], [18, 26, 4]]) {
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y * 1.6 <= r * r) pc.set(cx + x, cy + y, x + y > 1 ? hex('#6a645a') : hex('#9a9488'));
        pc.set(cx - 1, cy - 1, P.gold); pc.set(cx + 2, cy, P.gold); pc.set(cx, cy + 2, P.goldD);
      }
      return (s = pc.outline().canvas());
    };
  })();

  // 아이콘 (UI용, 확대된 dataURL)
  const icache = new Map();
  R.unitIcon = function (key, colorIdx) {
    const k = key + '|' + colorIdx; if (icache.has(k)) return icache.get(k);
    const s = R.unitSprite(key, colorIdx, 0, false);
    const sc = 3, cv = document.createElement('canvas'); cv.width = s.width * sc; cv.height = s.height * sc;
    const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false; cx.drawImage(s, 0, 0, cv.width, cv.height);
    const url = cv.toDataURL(); icache.set(k, url); return url;
  };
  R.buildingIcon = function (key, colorIdx) {
    const k = 'b|' + key + '|' + colorIdx; if (icache.has(k)) return icache.get(k);
    const s = cropCanvas(R.buildingSprite(key, colorIdx, 1));
    const cv = document.createElement('canvas'); const sc = Math.max(1, Math.floor(96 / Math.max(s.width, s.height)));
    cv.width = s.width * sc; cv.height = s.height * sc; const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false; cx.drawImage(s, 0, 0, cv.width, cv.height);
    const url = cv.toDataURL(); icache.set(k, url); return url;
  };
  R.hex = hex; R.shade = shade; R.mix = mix;
})();
