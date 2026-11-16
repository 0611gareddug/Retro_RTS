'use strict';
/* Retro RTS — 게임 시뮬레이션 (경제 · 건설 · 전투 · 사기) */
(function () {
  const U = R.U, B = R.B;

  // ── 진형 슬롯 ──
  R.formSlots = function (u, n, form) {
    const def = U[u];
    if (n === 1) return { cols: 1, rows: 1, sp: 0 };
    if (def.cls === 'siege') return { cols: n, rows: 1, sp: 0.75 };
    const sp = def.cls === 'cav' ? 0.46 : 0.32;
    return form === 'col' ? { cols: 4, rows: Math.ceil(n / 4), sp } : { cols: 8, rows: Math.ceil(n / 8), sp };
  };
  R.slotPos = function (sq, i, out) {
    const f = R.formSlots(sq.u, U[sq.u].n, sq.form);
    const col = i % f.cols, row = (i / f.cols) | 0;
    const fx = Math.cos(sq.dir), fy = Math.sin(sq.dir);
    const a = (col - (f.cols - 1) / 2) * f.sp, b = -(row - (f.rows - 1) / 2) * f.sp;
    out.x = sq.x - fy * a + fx * b; out.y = sq.y + fx * a + fy * b;
    return out;
  };
  R.squadRadius = (sq) => {
    const d = U[sq.u];
    if (d.cls === 'bld' || d.cls === 'gen') return 0.35;
    if (d.cls === 'siege') return d.n > 1 ? 0.8 : 0.6;
    if (d.cls === 'cav') return sq.form === 'col' ? 0.9 : 1.2;
    return sq.form === 'col' ? 0.7 : 1.0;
  };

  class Game {
    constructor(opt) {
      this.mode = opt.mode; // 'ai' | 'sandbox' | 'online' | 'tutorial'
      this.mapId = opt.map;
      this.map = R.buildMap(opt.map, opt.players.length);
      this.N = this.map.N;
      this.time = 0; this.tick = 0;
      this.nextId = 1;
      this.ents = {};
      this.ev = [];
      this.pend = []; // 지연 피해
      this.proj = []; // 투사체(표시용)
      this.over = null;
      this.speed = 1; this.paused = false;
      this.sb = opt.sandbox || null; // 샌드박스 옵션 {infMoney, ai}
      this.diff = opt.diff != null ? opt.diff : 1;
      this.occ = new Int32Array(this.N * this.N);
      this.terr = new Int8Array(this.N * this.N).fill(-1);
      this.players = opt.players.map((p, i) => ({
        id: i, name: p.name, color: p.color, team: p.team != null ? p.team : i, isAI: !!p.ai, human: !p.ai,
        money: R.START_MONEY, era: 0, eraProg: null, alive: true, inc: 0,
        genCD: 0, genAlive: false,
        persona: p.persona || null,
        passive: !!p.ai && !!(R.DIFF[opt.diff != null ? opt.diff : 1] || {}).passive, provoked: false,
        st: { earned: 0, kills: 0, losses: 0, bldLost: 0, bldKilled: 0, incHist: [], armyHist: [], cavOnly: true, tribalOnly: true, anySquad: false, genDied: false, spearCav: 0, trebBld: 0, walls: 0, villagesMax: 0 },
      }));
      this._dirtyTerr = true;
      this.incT = 0; this.histT = 0; this.vilT = 0;
      // 시작 배치
      const order = opt.players.length === 2 ? [0, 3] : [0, 1, 2, 3];
      this.players.forEach((p, i) => {
        const s = this.map.starts[order[i]]; p.start = { x: s.x, y: s.y };
        const base = this.addBuilding('base', i, s.x, s.y, true);
        p.baseId = base.id;
        const cx = s.x + 2, cy = s.y + 2;
        const dx = cx < this.N / 2 ? 1 : -1, dy = cy < this.N / 2 ? 1 : -1;
        p.fwd = { x: dx, y: dy };
        this.addSquad('builder', i, cx + dx * 3, cy + dy * 1.5);
        this.addSquad('builder', i, cx + dx * 1.5, cy + dy * 3);
        this.addSquad('militia', i, cx + dx * 4.5, cy + dy * 4.5);
      });
      this.villages = this.map.villages.map((v) => {
        const e = { id: this.nextId++, k: 'v', x: v.x, y: v.y, owner: -1, prog: 0, capP: -1 };
        this.ents[e.id] = e;
        for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) this.occ[(v.y + yy) * this.N + v.x + xx] = e.id;
        return e.id;
      });
      this.recalcTerr();
    }

    // ── 엔티티 ──
    addSquad(u, owner, x, y) {
      const d = U[u];
      const sq = {
        id: this.nextId++, k: 's', u, owner, x, y, px: x, py: y, dir: Math.atan2(this.players[owner].fwd ? this.players[owner].fwd.y : 1, this.players[owner].fwd ? this.players[owner].fwd.x : 1),
        hp: new Array(d.n).fill(d.hp), alive: d.n, morale: 100, form: 'line',
        path: null, pi: 0, order: null, tgt: 0, atkT: 0, runT: 0, rout: false, lastCombat: -99,
        buffA: 0, buffD: 0, dep: d.deploy ? 0 : -1, onWall: 0, task: 0, hold: null, repathT: 0, kills: 0, flankT: 0,
      };
      this.ents[sq.id] = sq; this._sq = null;
      if (d.cls === 'gen') { this.players[owner].genAlive = true; this.players[owner].st.hadGen = true; }
      const st = this.players[owner].st;
      if (d.cls !== 'bld' && d.cls !== 'gen') {
        st.anySquad = true;
        if (d.cls !== 'cav') st.cavOnly = false;
        if (d.era > 0) st.tribalOnly = false;
      }
      return sq;
    }
    addBuilding(type, owner, x, y, done) {
      const d = B[type];
      const maxHp = type === 'base' ? R.ERAS[this.players[owner].era].baseHp : d.hp;
      const b = {
        id: this.nextId++, k: 'b', type, owner, x, y, s: d.size, lv: 1,
        hp: done ? maxHp : Math.max(1, maxHp * 0.1), maxHp, built: done ? 1 : 0, bt: d.time,
        queue: [], rally: null, towerT: 0, lvProg: null, lastHit: -99, workers: 0,
      };
      this.ents[b.id] = b; this._bl = null;
      for (let yy = 0; yy < d.size; yy++) for (let xx = 0; xx < d.size; xx++) this.occ[(y + yy) * this.N + x + xx] = b.id;
      this._dirtyTerr = true;
      this.displaceUnits(b);
      return b;
    }
    removeEnt(e) {
      if (!e || !this.ents[e.id]) return;
      delete this.ents[e.id]; this._sq = null; this._bl = null;
      if (e.k === 'b') {
        for (let yy = 0; yy < e.s; yy++) for (let xx = 0; xx < e.s; xx++) { const i = (e.y + yy) * this.N + e.x + xx; if (this.occ[i] === e.id) this.occ[i] = 0; }
        this._dirtyTerr = true;
        for (const s of this.squads()) if (s.onWall === e.id) this.dismount(s, true);
      }
    }
    squads() { return this._sq || (this._sq = Object.values(this.ents).filter((e) => e.k === 's')); }
    buildings() { return this._bl || (this._bl = Object.values(this.ents).filter((e) => e.k === 'b')); }
    invalidate() { this._sq = null; this._bl = null; }

    bCenter(b) { return { x: b.x + b.s / 2, y: b.y + b.s / 2 }; }
    distToRect(x, y, b) {
      const s = b.s != null ? b.s : 2;
      const dx = Math.max(b.x - x, 0, x - (b.x + s)), dy = Math.max(b.y - y, 0, y - (b.y + s));
      return Math.hypot(dx, dy);
    }

    // 통행: 1 통과, 0 막힘, 2 부술 수 있는 적 구조물
    blockAt(i, team) {
      const id = this.occ[i]; if (!id) return 1;
      const e = this.ents[id]; if (!e) return 1;
      if (e.k === 'v') return 0;
      const d = B[e.type];
      const myTeam = team != null && this.players[e.owner].team === team;
      if (myTeam) return d.gate ? 1 : 0;
      return d.wall || d.wallLike || e.type === 'tower_wood' ? 2 : 0;
    }
    cellFree(x, y) {
      if (x < 0 || y < 0 || x >= this.N || y >= this.N) return false;
      const i = (y | 0) * this.N + (x | 0);
      return R.passable(this.map.t[i]) && !this.occ[i];
    }
    displaceUnits(b) {
      for (const s of this.squads()) {
        if (s.x >= b.x - 0.2 && s.x <= b.x + b.s + 0.2 && s.y >= b.y - 0.2 && s.y <= b.y + b.s + 0.2) {
          const p = this.freeNear(s.x, s.y, 6); if (p) { s.x = s.px = p.x; s.y = s.py = p.y; }
        }
      }
    }
    freeNear(x, y, maxR) {
      const cx = Math.floor(x), cy = Math.floor(y);
      for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (this.cellFree(cx + dx, cy + dy)) return { x: cx + dx + 0.5, y: cy + dy + 0.5 };
      }
      return null;
    }

    // ── 영토 ──
    recalcTerr() {
      const N = this.N, terr = this.terr, score = new Float32Array(N * N);
      terr.fill(-1);
      const apply = (cx, cy, r, owner) => {
        const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(N - 1, Math.ceil(cx + r));
        const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(N - 1, Math.ceil(cy + r));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d > r) continue;
          const sc = r - d + 0.01, i = y * N + x;
          if (sc > score[i]) { score[i] = sc; terr[i] = owner; }
        }
      };
      for (const b of this.buildings()) { const t = B[b.type].terr; if (t) { const c = this.bCenter(b); apply(c.x, c.y, t + (b.type === 'base' ? b.lv - 1 : 0), b.owner); } }
      for (const vid of this.villages) { const v = this.ents[vid]; if (v.owner >= 0) apply(v.x + 1, v.y + 1, 5, v.owner); }
      this._dirtyTerr = false;
      this.terrVer = (this.terrVer || 0) + 1;
    }

    // ── 건설 가능 여부 ──
    canPlace(p, type, x, y) {
      const d = B[type], N = this.N, pl = this.players[p];
      if (!d) return '알 수 없는 건물';
      if (d.era > pl.era) return R.ERAS[d.era].name + ' 시대 필요';
      if (x < 0 || y < 0 || x + d.size > N || y + d.size > N) return '맵 밖';
      for (let yy = 0; yy < d.size; yy++) for (let xx = 0; xx < d.size; xx++) {
        const i = (y + yy) * N + x + xx;
        if (this.terr[i] !== p) return '내 영토가 아님';
        const t = this.map.t[i];
        if (!R.passable(t) || t === R.T.BRIDGE || t === R.T.FORD) return '지을 수 없는 지형';
        if (this.occ[i]) return '이미 건물이 있음';
        if (!d.ore && this.isOre(x + xx, y + yy)) return '광맥에는 광산만';
      }
      if (d.ore) { if (!this.map.ores.some((o) => o.x === x && o.y === y)) return '광맥 위에만 지을 수 있음'; }
      return null;
    }
    isOre(x, y) { for (const o of this.map.ores) if (x >= o.x && x < o.x + 2 && y >= o.y && y < o.y + 2) return true; return false; }
    cost(type) { return B[type].cost; }
    canAfford(p, c) { return (this.sb && this.sb.infMoney && this.players[p].human) || this.players[p].money >= c; }
    pay(p, c) { if (this.sb && this.sb.infMoney && this.players[p].human) return true; if (this.players[p].money < c) return false; this.players[p].money -= c; return true; }

    pop(p) {
      let used = 0, cap = R.BASE_POP;
      for (const s of this.squads()) if (s.owner === p) used += R.squadPop(U[s.u]);
      for (const b of this.buildings()) {
        if (b.owner !== p) continue;
        if (b.type === 'house' && b.built >= 1) cap += 2;
        for (const q of b.queue) used += R.squadPop(U[q.u]);
      }
      return { used, cap: Math.min(R.MAX_POP, cap) };
    }
    builderCount(p) {
      let n = 0; for (const s of this.squads()) if (s.owner === p && s.u === 'builder') n++;
      for (const b of this.buildings()) if (b.owner === p) for (const q of b.queue) if (q.u === 'builder') n++;
      return n;
    }

    // ── 명령 ──
    exec(c) {
      const p = c.p, pl = this.players[p];
      if (!pl || !pl.alive || this.over) return false;
      const mine = (ids) => (ids || []).map((id) => this.ents[id]).filter((e) => e && e.k === 's' && e.owner === p);
      switch (c.c) {
        case 'move': {
          const sqs = mine(c.ids).filter((s) => !s.rout); if (!sqs.length) return false;
          // 성벽 위로 올리기
          const ci = (Math.floor(c.y) * this.N + Math.floor(c.x));
          const wb = this.ents[this.occ[ci]];
          if (wb && wb.k === 'b' && wb.owner === p && (wb.type === 'wall_wood' || wb.type === 'wall_stone' || wb.type === 'tower_stone') && wb.built >= 1) {
            const rs = sqs.filter((s) => U[s.u].cls === 'rng');
            for (const s of rs) { this.dismount(s); s.mountId = wb.id; this.orderMove(s, c.x, c.y, false); }
            const rest = sqs.filter((s) => U[s.u].cls !== 'rng'); if (!rest.length) return true;
            this.groupMove(rest, c.x, c.y, c.am);
            return true;
          }
          this.groupMove(sqs, c.x, c.y, c.am);
          return true;
        }
        case 'attack': {
          const t = this.ents[c.tid]; if (!t || t.k === 'v') return false;
          for (const s of mine(c.ids)) {
            if (s.rout || U[s.u].cls === 'bld') continue;
            if (t.k === 's' && this.players[t.owner].team === pl.team) continue;
            if (t.k === 'b' && this.players[t.owner].team === pl.team) continue;
            if (U[s.u].bldOnly && t.k !== 'b') continue;
            this.dismount(s); s.mountId = 0;
            s.order = 'attack'; s.tgt = t.id; s.path = null; s.hold = null; s.repathT = 0; s.task = 0;
          }
          return true;
        }
        case 'stop': for (const s of mine(c.ids)) { s.path = null; s.order = null; s.tgt = 0; s.task = 0; s.hold = { x: s.x, y: s.y }; } return true;
        case 'form': for (const s of mine(c.ids)) if (U[s.u].n > 2) s.form = c.f; return true;
        case 'task': {
          const b = this.ents[c.bid]; if (!b || b.k !== 'b' || this.players[b.owner].team !== pl.team) return false;
          for (const s of mine(c.ids)) if (s.u === 'builder') { s.task = b.id; s.order = 'task'; s.path = null; s.tgt = 0; }
          return true;
        }
        case 'build': {
          const err = this.canPlace(p, c.type, c.x, c.y); if (err) return err;
          if (!this.pay(p, B[c.type].cost)) return '금화 부족';
          const b = this.addBuilding(c.type, p, c.x, c.y, false); this.invalidate();
          this.autoAssignBuilder(p, b, c.ids);
          return true;
        }
        case 'buildLine': {
          const d = B[c.type]; if (!d || !d.line && !d.gate) return false;
          let n = 0; const placed = [];
          for (const [x, y] of c.cells.slice(0, 60)) {
            if (this.canPlace(p, c.type, x, y)) continue;
            if (!this.pay(p, d.cost)) break;
            placed.push(this.addBuilding(c.type, p, x, y, false)); n++;
          }
          this.invalidate();
          if (placed.length) { for (const b of placed) b.lineGroup = placed[0].id; this.autoAssignBuilder(p, placed[0], c.ids); }
          if (d.line) pl.st.walls += n;
          return n ? true : '지을 수 없는 위치';
        }
        case 'train': {
          const b = this.ents[c.bid]; if (!b || b.k !== 'b' || b.owner !== p || b.built < 1) return false;
          const d = U[c.u]; if (!d) return false;
          const bd = B[b.type];
          const okB = (bd.prodCls && bd.prodCls === d.cls) || (bd.prod && bd.prod.includes(c.u));
          if (!okB) return false;
          if (d.era > pl.era) return R.ERAS[d.era].name + ' 시대 필요';
          if (b.queue.length >= 5) return '대기열이 가득 참';
          if (c.u === 'general') {
            if (pl.genAlive || b.queue.some((q) => q.u === 'general')) return '장군은 1명만';
            if (pl.genCD > this.time) return '장군 재소환 대기 ' + Math.ceil(pl.genCD - this.time) + '초';
          }
          if (c.u === 'builder' && this.builderCount(p) >= R.MAX_BUILDERS) return '빌더는 최대 8명';
          const pp = this.pop(p); if (R.squadPop(d) && pp.used + 1 > pp.cap) return '부대 정원 부족 (집을 지으세요)';
          if (!this.pay(p, d.cost)) return '금화 부족';
          b.queue.push({ u: c.u, t: d.time });
          return true;
        }
        case 'cancel': {
          const b = this.ents[c.bid]; if (!b || b.owner !== p) return false;
          const q = b.queue[c.idx]; if (!q) return false;
          b.queue.splice(c.idx, 1); if (!(this.sb && this.sb.infMoney && pl.human)) pl.money += U[q.u].cost; return true;
        }
        case 'levelup': {
          const b = this.ents[c.bid]; if (!b || b.owner !== p || b.built < 1 || b.lvProg) return false;
          const d = B[b.type]; if (!d.lvCost || b.lv >= 3) return false;
          if (b.lv === 2 && pl.era < 2) return '성주 시대 필요';
          if (b.lv === 1 && d.prodCls && pl.era < 1) return '봉건 시대 필요';
          const cost = d.lvCost[b.lv - 1]; if (!this.pay(p, cost)) return '금화 부족';
          b.lvProg = { t: 0, need: b.lv === 1 ? 15 : 25, cost };
          return true;
        }
        case 'sell': {
          const b = this.ents[c.bid]; if (!b || b.owner !== p || b.type === 'base') return false;
          if (this.time - b.lastHit < 10) return '공격받는 중에는 철거 불가';
          let inv = B[b.type].cost; const d = B[b.type]; if (d.lvCost) for (let i = 0; i < b.lv - 1; i++) inv += d.lvCost[i];
          pl.money += Math.floor(inv * 0.5 * (b.built >= 1 ? 1 : 1));
          for (const q of b.queue) pl.money += U[q.u].cost;
          this.ev.push({ e: 'collapse', x: b.x + b.s / 2, y: b.y + b.s / 2, s: b.s });
          this.removeEnt(b); this.invalidate();
          return true;
        }
        case 'era': {
          if (pl.eraProg || pl.era >= 3) return false;
          const nx = pl.era + 1, e = R.ERAS[nx];
          const req = this.eraReq(p); if (req) return req;
          if (!this.pay(p, e.cost)) return '금화 부족';
          pl.eraProg = { t: 0, need: e.time };
          return true;
        }
        case 'rally': { const b = this.ents[c.bid]; if (b && b.owner === p) b.rally = { x: c.x, y: c.y }; return true; }
        case 'ability': {
          const g = this.squads().find((s) => s.owner === p && s.u === 'general'); if (!g) return '장군이 없음';
          const key = c.a === 'charge' ? 'cdC' : 'cdD';
          if ((g[key] || 0) > this.time) return '재사용 대기 ' + Math.ceil(g[key] - this.time) + '초';
          g[key] = this.time + 45;
          for (const s of this.squads()) if (s.owner === p && R.dist(s.x, s.y, g.x, g.y) <= 6) {
            if (c.a === 'charge') s.buffA = this.time + 8; else s.buffD = this.time + 10;
          }
          this.ev.push({ e: 'ability', a: c.a, x: g.x, y: g.y, p });
          return true;
        }
        // 샌드박스
        case 'sbSpawn': {
          if (!this.sb) return false; const o = c.owner;
          const pos = this.freeNear(c.x, c.y, 4); if (!pos) return false;
          if (c.u === 'general' && this.players[o].genAlive) return '장군은 1명만';
          const s = this.addSquad(c.u, o, pos.x, pos.y); this.invalidate();
          s.dir = Math.atan2(this.N / 2 - pos.y, this.N / 2 - pos.x); return true;
        }
        case 'sbEra': {
          if (!this.sb) return false; const pp = this.players[c.p]; pp.era = R.clamp(c.era, 0, 3); pp.eraProg = null;
          const base = this.ents[pp.baseId]; if (base) { const nm = R.ERAS[pp.era].baseHp; base.hp = base.hp / base.maxHp * nm; base.maxHp = nm; base.lv = pp.era + 1; }
          this._dirtyTerr = true; return true;
        }
        case 'sbAI': { if (!this.sb) return false; this.sb.ai = !!c.on; return true; }
      }
      return false;
    }
    eraReq(p) {
      const pl = this.players[p], nx = pl.era + 1;
      const bs = this.buildings().filter((b) => b.owner === p && b.built >= 1);
      if (nx === 1) {
        const kinds = new Set(bs.filter((b) => !['base', 'house'].includes(b.type) && !B[b.type].wall).map((b) => b.type));
        if (kinds.size < 2) return '봉건: 건물 2종 이상 필요 (집·성벽 제외)';
      } else if (nx === 2) {
        if (!bs.some((b) => b.type === 'market' || b.type === 'smith')) return '성주: 시장 또는 대장간 필요';
        if (bs.filter((b) => B[b.type].prodCls).length < 2) return '성주: 소환시설 2채 필요';
      } else if (nx === 3) {
        if (bs.filter((b) => b.lv >= 3).length < 2) return '제국: Lv3 건물 2채 필요';
      }
      return null;
    }
    autoAssignBuilder(p, b, prefer) {
      const c = this.bCenter(b);
      let cand = (prefer || []).map((id) => this.ents[id]).filter((s) => s && s.u === 'builder' && s.owner === p);
      if (!cand.length) {
        let best = null, bd = 1e9;
        for (const s of this.squads()) if (s.owner === p && s.u === 'builder') {
          const busy = s.task && this.ents[s.task] && (this.ents[s.task].built < 1);
          const d = R.dist(s.x, s.y, c.x, c.y) + (busy ? 40 : 0);
          if (d < bd) { bd = d; best = s; }
        }
        if (best) cand = [best];
      }
      for (const s of cand) { s.task = b.id; s.order = 'task'; s.path = null; s.tgt = 0; }
    }
    groupMove(sqs, x, y, am) {
      if (sqs.length === 1) { this.orderMove(sqs[0], x, y, am); return; }
      let cx = 0, cy = 0; for (const s of sqs) { cx += s.x; cy += s.y; } cx /= sqs.length; cy /= sqs.length;
      const ang = Math.atan2(y - cy, x - cx);
      const fx = Math.cos(ang), fy = Math.sin(ang);
      // 병종 순서: 보병 앞, 원거리 뒤
      const rank = (s) => ({ inf: 0, cav: 1, gen: 2, rng: 2, siege: 3, bld: 4 })[U[s.u].cls];
      const sorted = sqs.slice().sort((a, b) => rank(a) - rank(b));
      const perRow = Math.max(1, Math.ceil(Math.sqrt(sorted.length * 2)));
      sorted.forEach((s, i) => {
        const col = i % perRow, row = (i / perRow) | 0;
        const a = (col - (Math.min(perRow, sorted.length - row * perRow) - 1) / 2) * 2.6, b = -row * 2.4;
        this.orderMove(s, x - fy * a + fx * b, y + fx * a + fy * b, am, ang);
      });
    }
    orderMove(s, x, y, am, faceAng) {
      x = R.clamp(x, 0.5, this.N - 0.5); y = R.clamp(y, 0.5, this.N - 0.5);
      if (!s.mountId) this.dismount(s);
      s.order = am ? 'amove' : 'move'; s.tgt = 0; s.task = 0; s.hold = null;
      s.dest = { x, y }; s.faceAng = faceAng;
      s.path = R.findPath(this, s.x, s.y, x, y, { cls: U[s.u].cls, team: this.players[s.owner].team, canBreak: true }) || null;
      if (s.path && s.path.length) { const l = s.path[s.path.length - 1]; if (R.dist(l.x, l.y, x, y) < 1.2) { l.x = x; l.y = y; } }
      s.pi = 0;
      if (s.dep > 0 || s.dep === -2) s.dep = 0;
    }
    dismount(s, fall) {
      if (!s.onWall) return;
      const w = this.ents[s.onWall]; s.onWall = 0;
      const p = this.freeNear(s.x, s.y, 4); if (p) { s.x = s.px = p.x; s.y = s.py = p.y; }
      if (fall) { for (let i = 0; i < s.hp.length; i++) if (s.hp[i] > 0) s.hp[i] *= 0.8; }
      void w;
    }

    // ── 업데이트 ──
    update(dt) {
      if (this.over) return;
      this.time += dt; this.tick++;
      this.invalidate();
      if (this._dirtyTerr) this.recalcTerr();
      this.buildGrid();
      this.updateEconomy(dt);
      this.updateBuildings(dt);
      for (const s of this.squads()) if (this.ents[s.id]) this.updateSquad(s, dt);
      this.separate();
      this.updatePending();
      this.updateVillages(dt);
      for (const pl of this.players) if (pl.isAI && pl.alive && (!this.sb || this.sb.ai)) R.AI.update(this, pl, dt);
      this.checkVictory();
    }

    buildGrid() {
      const g = new Map(); this.grid = g;
      for (const s of this.squads()) {
        const k = ((s.x / 4) | 0) * 1000 + ((s.y / 4) | 0);
        let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(s);
      }
    }
    near(x, y, r, fn) {
      const x0 = ((x - r) / 4) | 0, x1 = ((x + r) / 4) | 0, y0 = ((y - r) / 4) | 0, y1 = ((y + r) / 4) | 0;
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) { const a = this.grid.get(gx * 1000 + gy); if (a) for (const s of a) fn(s); }
    }

    playerIncome(p) {
      const pl = this.players[p];
      let inc = 4; const farms = [];
      const bs = this.buildings();
      for (const b of bs) if (b.owner === p && b.type === 'farm' && b.built >= 1) farms.push(b);
      let hasMarket = false;
      for (const b of bs) {
        if (b.owner !== p || b.built < 1) continue;
        const d = B[b.type];
        if (b.type === 'market') hasMarket = true;
        if (d.inc && b.type !== 'base') inc += d.inc[b.lv - 1] || 0;
        if (d.perFarm) {
          const c = this.bCenter(b); let n = 0;
          for (const f of farms) { const fc = this.bCenter(f); if (R.dist(c.x, c.y, fc.x, fc.y) <= 4.5) n++; }
          inc += d.perFarm[b.lv - 1] * Math.min(4, n);
        }
      }
      let vil = 0; for (const vid of this.villages) if (this.ents[vid].owner === p) vil++;
      inc += vil * R.VILLAGE_INC * (hasMarket ? 1.5 : 1);
      if (pl.isAI) inc *= R.DIFF[this.diff].inc;
      return inc;
    }
    smithBuff(p) {
      let m = 0; for (const b of this.buildings()) if (b.owner === p && b.type === 'smith' && b.built >= 1) m = Math.max(m, B.smith.atkBuff[b.lv - 1]);
      return m;
    }

    updateEconomy(dt) {
      this.incT -= dt;
      if (this.incT <= 0) {
        this.incT = 1;
        for (const pl of this.players) if (pl.alive) { pl.inc = this.playerIncome(pl.id); pl.atkBuff = this.smithBuff(pl.id); }
      }
      for (const pl of this.players) {
        if (!pl.alive) continue;
        const g = pl.inc * dt; pl.money += g; pl.st.earned += g;
        if (pl.eraProg) {
          pl.eraProg.t += dt;
          if (pl.eraProg.t >= pl.eraProg.need) {
            pl.era++; pl.eraProg = null;
            const base = this.ents[pl.baseId];
            if (base) { const nm = R.ERAS[pl.era].baseHp; base.hp += nm - base.maxHp; base.maxHp = nm; base.lv = pl.era + 1; this._dirtyTerr = true; }
            this.ev.push({ e: 'era', p: pl.id, era: pl.era });
          }
        }
      }
      this.histT -= dt;
      if (this.histT <= 0) {
        this.histT = 10;
        for (const pl of this.players) {
          pl.st.incHist.push(Math.round(pl.inc));
          let army = 0; for (const s of this.squads()) if (s.owner === pl.id && R.squadPop(U[s.u])) army++;
          pl.st.armyHist.push(army);
          if (pl.st.incHist.length > 400) { pl.st.incHist.shift(); pl.st.armyHist.shift(); }
        }
      }
    }

    updateBuildings(dt) {
      for (const b of this.buildings()) {
        const d = B[b.type], pl = this.players[b.owner];
        // 건설 (빌더 가속은 updateSquad에서 workers 집계)
        if (b.built < 1) {
          const mult = R.BUILDER_MULT[Math.min(4, b.workers || 0)];
          const inc = (dt / b.bt) * mult;
          b.built = Math.min(1, b.built + inc);
          b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * inc);
          if (b.built >= 1) { this.ev.push({ e: 'built', p: b.owner, type: b.type, x: b.x + b.s / 2, y: b.y + b.s / 2 }); }
        } else {
          // 수리
          const rep = b.repWorkers || 0;
          if (rep && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.008 * R.BUILDER_MULT[Math.min(4, rep)] / 1.5 * dt);
          if (this.time - b.lastHit > 10 && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.01 * dt);
        }
        b.workers = 0; b.repWorkers = 0;
        if (b.built < 1) continue;
        // 레벨업
        if (b.lvProg) {
          b.lvProg.t += dt;
          if (b.lvProg.t >= b.lvProg.need) {
            b.lv++; b.lvProg = null;
            if (d.prodCls && b.lv === 3) { b.maxHp = d.hp * 1.5; b.hp += d.hp * 0.5; }
            this.ev.push({ e: 'lvup', p: b.owner, x: b.x + b.s / 2, y: b.y + b.s / 2 });
          }
        }
        // 소환
        if (b.queue.length) {
          const q = b.queue[0];
          const sp = d.prodCls ? (b.lv === 3 ? 1 / 0.6 : b.lv === 2 ? 1 / 0.8 : 1) : 1;
          if (q.t > 0) q.t -= dt * sp;
          if (q.t <= 0) {
            const ud = U[q.u];
            const pp = this.pop(b.owner);
            const okPop = !R.squadPop(ud) || pp.used <= pp.cap;
            if (q.u === 'general' && pl.genAlive) { b.queue.shift(); pl.money += ud.cost; }
            else if (okPop) {
              const fx = b.x + b.s + 0.5, fy = b.y + b.s + 0.5;
              const pos = this.freeNear(fx, fy, 6) || this.freeNear(b.x - 1, b.y - 1, 6);
              if (pos) {
                b.queue.shift();
                const s = this.addSquad(q.u, b.owner, pos.x, pos.y); this._sq = null;
                if (b.rally) this.orderMove(s, b.rally.x, b.rally.y, true);
                else if (q.u === 'builder') this.builderIdle(s);
                this.ev.push({ e: 'trained', p: b.owner, u: q.u, x: pos.x, y: pos.y });
              }
            }
          }
        }
        // 방어 사격
        const tw = b.type === 'base' ? { n: 4, dmg: 8, rate: 1.5, range: 7 } : d.tower;
        if (tw) {
          b.towerT -= dt;
          if (b.towerT <= 0) {
            const c = this.bCenter(b);
            const t = this.findEnemySquad(c.x, c.y, tw.range + b.s / 2, b.owner, false);
            if (t) {
              b.towerT = tw.rate;
              const dist = R.dist(c.x, c.y, t.x, t.y);
              const dmg = this.calcHit({ atk: tw.dmg, dt: 'p', owner: b.owner, bonus: {} }, null, t, c.x, c.y);
              this.queueHit(t, tw.n, dmg, dist / 14 + 0.05, b.owner, null, c.x, c.y, 'arrow', 'tower');
              this.fireProj(c.x, c.y, t.x, t.y, 'arrow', tw.n, b.s * 0.8 + 1.2);
            } else b.towerT = 0.3;
          }
        }
      }
    }

    findEnemySquad(x, y, r, owner, melee) {
      const team = this.players[owner].team;
      let best = null, bd = r * r;
      this.near(x, y, r + 1.5, (s) => {
        if (this.players[s.owner].team === team || !s.alive) return;
        if (melee && s.onWall) return;
        const d = R.dist2(x, y, s.x, s.y) - R.squadRadius(s) * R.squadRadius(s);
        if (d < bd) { bd = d; best = s; }
      });
      return best;
    }
    findEnemyBuilding(x, y, r, owner) {
      const team = this.players[owner].team; let best = null, bd = r;
      for (const b of this.buildings()) {
        if (this.players[b.owner].team === team) continue;
        const d = this.distToRect(x, y, b); if (d < bd) { bd = d; best = b; }
      }
      return best;
    }

    builderIdle(s) {
      // 근처 건설 중 → 손상된 건물 순서로 자동 작업
      let best = null, bd = 12;
      for (const b of this.buildings()) {
        if (b.owner !== s.owner) continue;
        const need = b.built < 1 ? 1 : (b.hp < b.maxHp * 0.95 ? 2 : 0); if (!need) continue;
        const d = this.distToRect(s.x, s.y, b) + (need === 2 ? 3 : 0);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) { s.task = best.id; s.order = 'task'; s.path = null; }
    }

    // 사거리 내 적 찾기 (자동 반격)
    acquire(s) {
      const d = U[s.u];
      const rng = d.range ? this.effRange(s) : 0;
      const look = (d.range ? rng : 1.5) + 2;
      if (d.bldOnly) return this.findEnemyBuilding(s.x, s.y, look, s.owner);
      const t = this.findEnemySquad(s.x, s.y, look, s.owner, !d.range);
      if (t) return t;
      if (d.cls === 'siege' || s.order === 'amove') return this.findEnemyBuilding(s.x, s.y, look, s.owner);
      return null;
    }
    effRange(s) {
      const d = U[s.u]; let r = d.range;
      if (!r) return 0;
      if (s.onWall) r += 2;
      if (this.map.e[(s.y | 0) * this.N + (s.x | 0)] === 1) r += 1;
      return r;
    }

    updateSquad(s, dt) {
      const d = U[s.u];
      s.px = s.x; s.py = s.y;
      if (s.alive <= 0) { this.killSquad(s); return; }
      // 사기 회복
      if (this.time - s.lastCombat > 5 && s.morale < 100) s.morale = Math.min(100, s.morale + 3 * dt);
      if (s.rout) {
        if (s.morale >= 50) { s.rout = false; s.order = null; s.path = null; s.hold = { x: s.x, y: s.y }; }
        else {
          const base = this.ents[this.players[s.owner].baseId];
          if (base && (!s.path || s.pi >= s.path.length) && R.dist(s.x, s.y, base.x + 2, base.y + 2) > 6) {
            s.path = R.findPath(this, s.x, s.y, base.x + 2 + this.players[s.owner].fwd.x * 4, base.y + 2 + this.players[s.owner].fwd.y * 4, { cls: d.cls, team: this.players[s.owner].team }); s.pi = 0;
          }
          this.followPath(s, dt, 1.2);
          return;
        }
      }
      // 빌더
      if (d.cls === 'bld') { this.updateBuilder(s, dt); return; }
      if (s.onWall) { const w = this.ents[s.onWall]; if (!w) { s.onWall = 0; } }
      // 성벽 올라가기
      if (s.mountId) {
        const w = this.ents[s.mountId];
        if (!w) s.mountId = 0;
        else if (this.distToRect(s.x, s.y, w) < 1.3) { s.onWall = w.id; s.mountId = 0; s.x = w.x + 0.5; s.y = w.y + 0.5; s.path = null; s.order = null; s.hold = { x: s.x, y: s.y }; }
      }

      // 대상 확인
      let t = s.tgt ? this.ents[s.tgt] : null;
      if (t && ((t.k === 's' && t.alive <= 0) || (t.k === 'b' && t.hp <= 0))) t = null;
      if (t && t.k === 's' && t.onWall && !d.range) { t = this.ents[t.onWall] || null; s.tgt = t ? t.id : 0; }
      if (!t) {
        s.tgt = 0;
        if (s.order === 'attack') { s.order = null; s.path = null; s.hold = { x: s.x, y: s.y }; }
        const idle = !s.order || s.order === 'amove' || (d.moveShoot && s.order === 'move');
        if (idle) {
          const a = this.acquire(s);
          if (a) {
            if (s.order === 'move' && d.moveShoot) { this.combat(s, a, dt, true); }
            else { s.tgt = a.id; t = a; if (!s.hold) s.hold = { x: s.x, y: s.y }; }
          }
        }
      }
      if (t) {
        // 추격 제한 (자동 교전)
        if (!s.order && s.hold && R.dist(s.x, s.y, s.hold.x, s.hold.y) > 5 + (d.range || 0)) {
          s.tgt = 0; this.orderMove(s, s.hold.x, s.hold.y, false); s.order = 'return';
        } else { this.combat(s, t, dt, false); return; }
      }
      if (s.order === 'return' && (!s.path || s.pi >= s.path.length)) { s.order = null; }
      // 이동
      if (s.path && s.pi < s.path.length) {
        if (s.dep > 0) s.dep = 0;
        this.followPath(s, dt, 1);
      } else {
        if (s.order === 'move' || s.order === 'amove') { s.order = null; s.hold = { x: s.x, y: s.y }; if (s.faceAng != null) { s.dir = s.faceAng; s.faceAng = null; } }
        s.runT = 0; s.moving = false;
      }
    }

    updateBuilder(s, dt) {
      const b = s.task ? this.ents[s.task] : null;
      if (!b || b.k !== 'b' || (b.built >= 1 && b.hp >= b.maxHp)) {
        if (s.task) { s.task = 0; s.order = null; if (!s.path || s.pi >= s.path.length) this.builderIdle(s); }
        if (s.path && s.pi < s.path.length) this.followPath(s, dt, 1);
        else { s.moving = false; s.working = false; if (this.tick % 40 === s.id % 40) this.builderIdle(s); }
        return;
      }
      const dd = this.distToRect(s.x, s.y, b);
      if (dd <= 1.6) {
        s.path = null; s.moving = false; s.working = true;
        const c = this.bCenter(b); s.dir = Math.atan2(c.y - s.y, c.x - s.x);
        if (b.built < 1) b.workers = (b.workers || 0) + 1; else b.repWorkers = (b.repWorkers || 0) + 1;
        return;
      }
      s.working = false;
      if (!s.path || s.pi >= s.path.length || (s.repathT -= dt) <= 0) {
        s.repathT = 2;
        const c = this.bCenter(b);
        // 건물 앞쪽 빈 칸
        let tx = c.x, ty = c.y; const p = this.freeNear(b.x + b.s + 0.2, b.y + b.s * 0.5, 4) || this.freeNear(c.x, c.y, 5);
        if (p) { tx = p.x; ty = p.y; }
        s.path = R.findPath(this, s.x, s.y, tx, ty, { cls: 'bld', team: this.players[s.owner].team }); s.pi = 0;
      }
      this.followPath(s, dt, 1);
    }

    followPath(s, dt, mul) {
      const d = U[s.u];
      if (!s.path || s.pi >= s.path.length) { s.moving = false; return; }
      const wp = s.path[s.pi];
      const dx = wp.x - s.x, dy = wp.y - s.y, dist = Math.hypot(dx, dy);
      const i = (s.y | 0) * this.N + (s.x | 0);
      let sp = d.spd * 1.25 * R.speedMul(this.map.t[i], this.map.e[i], d.cls) * mul;
      if (s.form === 'col') sp *= 1.2; else if (d.n > 2) sp *= 0.9;
      if (s.buffA > this.time) sp *= 1.25;
      if (s.buffD > this.time) sp *= 0.7;
      if (s.rout) sp *= 1.2;
      const step = sp * dt;
      if (dist < 0.05) { s.pi++; return; }
      const ang = Math.atan2(dy, dx);
      s.dir = ang;
      let nx = s.x + (dx / dist) * Math.min(step, dist), ny = s.y + (dy / dist) * Math.min(step, dist);
      // 앞쪽 칸 검사 (적 성벽 → 공격)
      const team = this.players[s.owner].team;
      const ax = Math.floor(s.x + Math.cos(ang) * 0.6), ay = Math.floor(s.y + Math.sin(ang) * 0.6);
      if (ax >= 0 && ay >= 0 && ax < this.N && ay < this.N) {
        const ci = ay * this.N + ax;
        if (this.occ[ci] && this.blockAt(ci, team) === 2) {
          const w = this.ents[this.occ[ci]];
          if (w && B[w.type] && B[w.type].stake && d.cls === 'cav' && s.runT > 1.2) { this.hitSquad(s, 8, 20, -1, null); s.runT = 0; this.ev.push({ e: 'hit', x: s.x, y: s.y, k: 'stake' }); }
          if (w && d.cls !== 'bld' && !s.rout) { s.tgt = w.id; s.breach = true; return; }
          s.path = null; return;
        }
      }
      const free = (x, y) => {
        if (x < 0.2 || y < 0.2 || x > this.N - 0.2 || y > this.N - 0.2) return false;
        const i = (y | 0) * this.N + (x | 0);
        if (!R.passable(this.map.t[i])) return false;
        return !this.occ[i] || this.blockAt(i, team) === 1;
      };
      let mx = nx, my = ny;
      if (!free(mx, my)) {
        if (free(nx, s.y)) { my = s.y; } else if (free(s.x, ny)) { mx = s.x; }
        else {
          if ((s.repathT -= dt) <= 0) { s.repathT = 1; const last = s.path[s.path.length - 1]; s.path = R.findPath(this, s.x, s.y, last.x, last.y, { cls: d.cls, team, canBreak: true }); s.pi = 0; }
          s.moving = false; return;
        }
      }
      nx = mx; ny = my;
      s.x = nx; s.y = ny; s.moving = true;
      if (d.cls === 'cav') s.runT += dt;
      if (dist <= step) s.pi++;
    }

    combat(s, t, dt, passing) {
      const d = U[s.u];
      const tx = t.k === 's' ? t.x : t.x + t.s / 2, ty = t.k === 's' ? t.y : t.y + t.s / 2;
      const rS = R.squadRadius(s);
      const edge = t.k === 's' ? R.dist(s.x, s.y, t.x, t.y) - R.squadRadius(t) - rS * 0.6 : this.distToRect(s.x, s.y, t) - rS * 0.5;
      const range = d.range ? this.effRange(s) : 0.35 + (d.reach || 0);
      if (!passing && edge <= range) this.provoke(s, t);
      // 공성: 트레뷔셰 설치
      if (d.minRange && edge < d.minRange && t.k === 's') { s.tgt = 0; return; }
      if (edge > range) {
        if (passing) return;
        if (s.onWall) { s.tgt = 0; return; }
        s.dep = d.deploy ? 0 : s.dep;
        if (!s.path || s.pi >= s.path.length || (s.repathT -= dt) <= 0) {
          s.repathT = 1;
          s.path = R.findPath(this, s.x, s.y, tx, ty, { cls: d.cls, team: this.players[s.owner].team, canBreak: true }); s.pi = 0;
        }
        if (s.path) {
          // 마지막 웨이포인트를 대상 위치로 갱신
          if (t.k === 's' && s.path.length) { const l = s.path[s.path.length - 1]; if (R.dist(l.x, l.y, tx, ty) < 3) { l.x = tx; l.y = ty; } }
          this.followPath(s, dt, 1);
        }
        return;
      }
      // 사거리 안
      if (!passing) { s.path = null; s.moving = false; }
      if (!passing || !d.moveShoot) s.dir = Math.atan2(ty - s.y, tx - s.x);
      if (d.deploy) {
        if (s.dep < d.deploy) { s.dep += dt; s.runT = 0; return; }
      }
      s.lastCombat = this.time;
      s.atkT -= dt;
      if (s.atkT > 0) return;
      s.atkT = d.rate * (0.9 + Math.random() * 0.2);
      s.atkAnim = this.time;
      const pl = this.players[s.owner];
      const alive = s.alive;
      if (t.k === 's') {
        t.lastCombat = this.time;
        let hits;
        if (d.range) hits = s.form === 'col' && d.n > 2 ? Math.ceil(alive * 0.6) : alive;
        else hits = d.n > 2 ? Math.min(alive, s.form === 'col' ? 6 : 12) : alive;
        const dmg = this.calcHit(d, s, t, s.x, s.y);
        if (d.range) {
          const dist = R.dist(s.x, s.y, t.x, t.y);
          const fl = dist / (d.proj === 'boulder' || d.proj === 'rock' ? 7 : 14) + 0.05;
          if (d.aoe) this.queueAoe(tx, ty, d.aoe, dmg, alive, fl, s.owner, s.u);
          else this.queueHit(t, hits * (d.pierceN || 1), dmg, fl, s.owner, s.u, s.x, s.y, d.proj, s.id);
          this.fireProj(s.x, s.y, tx, ty, d.proj, d.aoe ? alive : Math.min(hits, 10), d.cls === 'siege' ? 1.2 : 0.6);
        } else {
          // 기병 돌격
          let charge = false;
          if (d.charge && s.runT >= 1.5) {
            const rel = Math.abs(R.angDiff(Math.atan2(s.y - t.y, s.x - t.x), t.dir));
            if (U[t.u].spear && rel < 1.05 && !t.rout) {
              // 창벽 반사
              this.hitSquad(s, Math.min(t.alive, 10), U[t.u].atk * 2, t.owner, t.u);
              this.ev.push({ e: 'hit', x: s.x, y: s.y, k: 'spearwall' });
              charge = false; s.runT = 0;
              if (s.alive <= 0) return;
            } else {
              charge = true; this.ev.push({ e: 'charge', x: t.x, y: t.y, p: s.owner });
              t.morale -= 15 * (1 - (U[t.u].moraleRes || 0));
            }
          }
          s.runT = 0;
          const fd = charge ? dmg * d.charge : dmg;
          this.hitSquad(t, hits, fd, s.owner, s.u, s);
          this.ev.push({ e: 'hit', x: t.x, y: t.y, k: 'melee', u: s.u });
        }
      } else {
        // 건물 공격
        const bd = B[t.type];
        let mult = d.dt === 's' ? 1 : d.dt === 'm' ? 0.75 : 0.15;
        mult *= d.bldMult || 1; if (bd.gate && d.gateMult) mult *= d.gateMult;
        mult *= 1 + (pl.atkBuff || 0);
        const n = d.range ? alive : (d.n > 2 ? Math.min(alive, 12) : alive);
        const dmg = d.atk * mult * n;
        if (d.range) {
          const dist = R.dist(s.x, s.y, tx, ty);
          const fl = dist / (d.proj === 'boulder' || d.proj === 'rock' ? 7 : 14) + 0.05;
          this.pend.push({ at: this.time + fl, b: t.id, dmg, from: s.owner, u: s.u, x: tx, y: ty, aoe: d.aoe || 0, adm: d.aoe ? this.calcHit(d, s, null, s.x, s.y) : 0, n: alive });
          this.fireProj(s.x, s.y, tx, ty, d.proj, Math.min(n, 10), d.cls === 'siege' ? 1.2 : 0.6);
        } else { this.damageBuilding(t, dmg, s.owner, s.u); this.ev.push({ e: 'hit', x: tx, y: ty, k: 'bld', u: s.u }); }
      }
    }

    // 아주 쉬움 AI: 사람이 직접 공격 명령(공격·공격 이동)을 내리거나 건물을 치면 반격을 시작한다
    provoke(s, t) {
      const tp = this.players[t.owner];
      if (!tp || !tp.passive || tp.provoked || !this.players[s.owner].human) return;
      if (!(s.order === 'attack' || s.order === 'amove' || t.k === 'b')) return;
      tp.provoked = true;
      this.ev.push({ e: 'alert', p: s.owner, msg: tp.name + '이(가) 반격을 시작해요!', x: t.k === 's' ? t.x : t.x + t.s / 2, y: t.k === 's' ? t.y : t.y + t.s / 2 });
    }
    // 1타 피해 계산
    calcHit(d, s, t, ax, ay) {
      const owner = s ? s.owner : d.owner;
      const pl = this.players[owner];
      let atk = d.atk * (1 + (pl.atkBuff || 0));
      if (s && s.buffA > this.time) atk *= 1.2;
      if (!t) return atk;
      const td = U[t.u];
      let mult = d.bonus[t.u] || d.bonus[td.cls] || 1;
      if (d.cls === 'inf' || d.cls === 'cav' || d.cls === 'gen') {
        if (td.cls === 'siege' && !d.bonus.siege) mult *= 2;
        const rel = Math.abs(R.angDiff(Math.atan2(ay - t.y, ax - t.x), t.dir));
        if (rel > 2.1) { mult *= 1.5; t.morale -= 2; } else if (rel > 1.05) { mult *= 1.25; t.morale -= 1; }
      }
      const ia = (ay | 0) * this.N + (ax | 0), it = (t.y | 0) * this.N + (t.x | 0);
      if (this.map.e[ia] === 1 && this.map.e[it] === 0) mult *= 1.15;
      let arm = d.dt === 'm' ? td.ma * (1 - (d.pierceM || 0)) : d.dt === 'p' ? td.pa * (1 - (d.pierceP || 0)) : 0;
      if (t.buffD > this.time) arm *= 1.4;
      if (this.map.t[it] === R.T.FORD) arm *= 0.8;
      if (d.dt === 'p') {
        if (this.map.t[it] === R.T.FOREST) mult *= 0.7;
        if (t.onWall) mult *= 0.5;
        if (t.form === 'col') arm -= 2;
      }
      if (t.rout) mult *= 1.5;
      const raw = atk * mult;
      return Math.max(raw - arm, raw * 0.2);
    }

    queueHit(t, hits, dmg, delay, from, u, ax, ay, kind, src) {
      this.pend.push({ at: this.time + delay, s: t.id, hits, dmg, from, u, x: t.x, y: t.y });
    }
    queueAoe(x, y, r, dmg, n, delay, from, u) {
      this.pend.push({ at: this.time + delay, aoeU: true, x, y, r, dmg, n, from, u });
    }
    updatePending() {
      if (!this.pend.length) return;
      const keep = [];
      for (const p of this.pend) {
        if (p.at > this.time) { keep.push(p); continue; }
        if (p.aoeU) {
          const team = this.players[p.from].team;
          this.near(p.x, p.y, p.r + 1.5, (s) => {
            if (this.players[s.owner].team === team) return;
            const d = R.dist(s.x, s.y, p.x, p.y); if (d > p.r + R.squadRadius(s)) return;
            const frac = p.r >= 2 ? 0.45 : 0.3;
            this.hitSquad(s, Math.ceil(s.alive * frac * p.n / U[p.u].n), p.dmg, p.from, p.u);
            s.lastCombat = this.time;
          });
          this.ev.push({ e: 'boom', x: p.x, y: p.y, r: p.r });
        } else if (p.s) {
          const t = this.ents[p.s]; if (t && t.alive > 0) { this.hitSquad(t, p.hits, p.dmg, p.from, p.u); this.ev.push({ e: 'hit', x: t.x, y: t.y, k: 'arrow' }); }
        } else if (p.b) {
          const b = this.ents[p.b];
          if (b) this.damageBuilding(b, p.dmg, p.from, p.u);
          if (p.aoe) { this.ev.push({ e: 'boom', x: p.x, y: p.y, r: p.aoe }); const team = this.players[p.from].team; this.near(p.x, p.y, p.aoe + 1.5, (s) => { if (this.players[s.owner].team !== team && R.dist(s.x, s.y, p.x, p.y) < p.aoe + R.squadRadius(s)) this.hitSquad(s, Math.ceil(s.alive * 0.3), p.adm, p.from, p.u); }); }
        }
      }
      this.pend = keep;
    }

    hitSquad(t, hits, dmg, from, u, att) {
      const td = U[t.u];
      if (t.alive <= 0) return;
      const melee = att && !U[att.u].range;
      let killed = 0;
      for (let h = 0; h < hits; h++) {
        // 근접: 앞쪽 병사부터, 원거리: 무작위
        let idx = -1;
        if (melee) { for (let i = 0; i < t.hp.length; i++) if (t.hp[i] > 0) { idx = i; break; } }
        else { const r = (Math.random() * t.hp.length) | 0; for (let k = 0; k < t.hp.length; k++) { const i = (r + k) % t.hp.length; if (t.hp[i] > 0) { idx = i; break; } } }
        if (idx < 0) break;
        const v = dmg * (0.85 + Math.random() * 0.3);
        t.hp[idx] -= v;
        if (t.hp[idx] <= 0) { t.hp[idx] = 0; t.alive--; killed++; }
      }
      t.lastCombat = this.time;
      if (killed) {
        let ml = 3 * killed * (1 - (td.moraleRes || 0));
        if (this.nearGeneral(t)) ml *= 0.7;
        if (this.nearPaladin(t)) ml *= 0.8;
        if (td.cls !== 'siege' && td.cls !== 'bld' && td.cls !== 'gen') t.morale -= ml;
        if (from >= 0) {
          this.players[from].st.kills += killed;
          this.players[t.owner].st.losses += killed;
          if (att) att.kills = (att.kills || 0) + killed;
        }
        this.ev.push({ e: 'die', id: t.id, n: killed, x: t.x, y: t.y });
      }
      if (td.cls === 'siege' || td.cls === 'bld' || td.cls === 'gen') t.morale = 100;
      if (t.morale < 20 && !t.rout && t.alive > 0 && td.cls !== 'siege' && td.cls !== 'bld' && td.cls !== 'gen') {
        t.rout = true; t.tgt = 0; t.order = null; t.path = null; this.dismount(t);
        this.ev.push({ e: 'rout', id: t.id, x: t.x, y: t.y, p: t.owner });
      }
      if (t.alive <= 0) {
        if (from >= 0 && u && R.U[u].spear && td.cls === 'cav') this.players[from].st.spearCav++;
        this.killSquad(t);
      }
    }
    nearGeneral(t) { let f = false; this.near(t.x, t.y, 6, (s) => { if (!f && s.owner === t.owner && s.u === 'general' && R.dist(s.x, s.y, t.x, t.y) <= 6) f = true; }); return f; }
    nearPaladin(t) { let f = false; this.near(t.x, t.y, 4, (s) => { if (!f && s.owner === t.owner && s.u === 'paladin' && s !== t && R.dist(s.x, s.y, t.x, t.y) <= 4) f = true; }); return f; }

    killSquad(s) {
      if (!this.ents[s.id]) return;
      const d = U[s.u];
      this.removeEnt(s); this._sq = null;
      if (d.cls === 'gen') {
        const pl = this.players[s.owner]; pl.genAlive = false; pl.genCD = this.time + 60; pl.st.genDied = true;
        for (const o of this.squads()) if (o.owner === s.owner && U[o.u].cls !== 'siege' && U[o.u].cls !== 'bld') {
          o.morale -= 30 * (1 - (U[o.u].moraleRes || 0));
          if (o.morale < 20 && !o.rout) { o.rout = true; o.tgt = 0; o.order = null; o.path = null; }
        }
        this.ev.push({ e: 'alert', p: s.owner, msg: '장군이 전사했습니다!', x: s.x, y: s.y });
      }
      this.ev.push({ e: 'squadDead', id: s.id, x: s.x, y: s.y });
    }

    damageBuilding(b, dmg, from, u) {
      if (!this.ents[b.id]) return;
      b.hp -= dmg; b.lastHit = this.time;
      this.ev.push({ e: 'bdmg', id: b.id, d: dmg, x: b.x + b.s / 2, y: b.y + b.s / 2 });
      const pl = this.players[b.owner];
      if (b.type === 'base' && (!pl._alertT || this.time - pl._alertT > 15)) { pl._alertT = this.time; this.ev.push({ e: 'alert', p: b.owner, msg: '본성이 공격받고 있습니다!', x: b.x + 2, y: b.y + 2 }); }
      else if (b.type !== 'base' && (!pl._alertB || this.time - pl._alertB > 20)) { pl._alertB = this.time; this.ev.push({ e: 'alert', p: b.owner, msg: B[b.type].name + '이(가) 공격받고 있습니다', x: b.x + b.s / 2, y: b.y + b.s / 2, minor: true }); }
      if (b.hp <= 0) {
        this.ev.push({ e: 'collapse', x: b.x + b.s / 2, y: b.y + b.s / 2, s: b.s, type: b.type });
        if (from >= 0) {
          this.players[from].st.bldKilled++;
          if (u === 'trebuchet') this.players[from].st.trebBld++;
        }
        pl.st.bldLost++;
        this.removeEnt(b); this.invalidate();
        if (b.type === 'base') this.eliminate(b.owner);
      }
    }

    eliminate(p) {
      const pl = this.players[p]; if (!pl.alive) return;
      pl.alive = false;
      for (const e of Object.values(this.ents)) {
        if (e.k === 'b' && e.owner === p) { this.ev.push({ e: 'collapse', x: e.x + e.s / 2, y: e.y + e.s / 2, s: e.s, quiet: true }); this.removeEnt(e); }
        else if (e.k === 's' && e.owner === p) { this.ev.push({ e: 'die', id: e.id, n: e.alive, x: e.x, y: e.y }); this.removeEnt(e); }
        else if (e.k === 'v' && e.owner === p) { e.owner = -1; e.prog = 0; this._dirtyTerr = true; }
      }
      this.invalidate();
      this.ev.push({ e: 'elim', p });
    }

    updateVillages(dt) {
      this.vilT -= dt; if (this.vilT > 0) return; this.vilT = 0.5;
      for (const vid of this.villages) {
        const v = this.ents[vid];
        const cx = v.x + 1, cy = v.y + 1;
        const teams = new Map();
        this.near(cx, cy, 3.5, (s) => {
          if (U[s.u].cls === 'bld' || s.rout) return;
          if (R.dist(s.x, s.y, cx, cy) > 3.2) return;
          const tm = this.players[s.owner].team; if (!teams.has(tm)) teams.set(tm, s.owner);
        });
        const ownTeam = v.owner >= 0 ? this.players[v.owner].team : -1;
        if (teams.size === 1) {
          const [tm, p] = [...teams.entries()][0];
          if (tm !== ownTeam) {
            if (v.capP !== p) { v.capP = p; v.prog = 0; }
            v.prog += 0.5 / 15;
            if (v.prog >= 1) {
              const prev = v.owner; v.owner = p; v.prog = 0; v.capP = -1; this._dirtyTerr = true;
              this.ev.push({ e: 'village', p, prev, x: cx, y: cy });
              const n = this.villages.filter((id) => this.ents[id].owner === p).length;
              this.players[p].st.villagesMax = Math.max(this.players[p].st.villagesMax, n);
            }
          } else { v.prog = Math.max(0, v.prog - 0.5 / 10); }
        } else if (teams.size === 0 || teams.has(ownTeam)) { v.prog = Math.max(0, v.prog - 0.5 / 20); }
      }
    }

    separate() {
      const sq = this.squads();
      for (const a of sq) {
        if (a.onWall) continue;
        const ra = R.squadRadius(a);
        this.near(a.x, a.y, 3, (b) => {
          if (b.id <= a.id || b.onWall) return;
          const rb = R.squadRadius(b);
          const dx = b.x - a.x, dy = b.y - a.y; let d = Math.hypot(dx, dy);
          const enemy = this.players[a.owner].team !== this.players[b.owner].team;
          const minD = (ra + rb) * (enemy ? 0.75 : (U[a.u].cls === 'bld' || U[b.u].cls === 'bld' ? 0.3 : 0.6));
          if (d >= minD) return;
          if (d < 0.001) { d = 0.001; }
          const push = (minD - d) * 0.25;
          const ux = dx / d, uy = dy / d;
          const wa = a.moving && !b.moving ? 0.8 : !a.moving && b.moving ? 0.2 : 0.5;
          this.tryMove(a, -ux * push * 2 * wa, -uy * push * 2 * wa);
          this.tryMove(b, ux * push * 2 * (1 - wa), uy * push * 2 * (1 - wa));
        });
      }
    }
    tryMove(s, dx, dy) {
      const nx = s.x + dx, ny = s.y + dy;
      if (nx < 0.3 || ny < 0.3 || nx > this.N - 0.3 || ny > this.N - 0.3) return;
      const i = (ny | 0) * this.N + (nx | 0);
      if (!R.passable(this.map.t[i])) return;
      if (this.occ[i] && this.blockAt(i, this.players[s.owner].team) !== 1) return;
      s.x = nx; s.y = ny;
    }

    fireProj(x0, y0, x1, y1, kind, n, h) {
      this.ev.push({ e: 'proj', x0, y0, x1, y1, k: kind, n, h });
    }

    checkVictory() {
      if (this.over) return;
      const teams = new Set(this.players.filter((p) => p.alive).map((p) => p.team));
      if (teams.size <= 1 && this.players.length > 1) {
        const w = [...teams][0];
        this.over = { team: w, time: this.time };
        this.ev.push({ e: 'over', team: w });
      }
    }

    // ── 저장 ──
    serialize() {
      return JSON.stringify({
        v: 1, mode: this.mode, mapId: this.mapId, time: this.time, nextId: this.nextId, diff: this.diff, sb: this.sb,
        players: this.players, ents: this.ents, villages: this.villages, pend: this.pend,
      });
    }
    static load(str) {
      const o = JSON.parse(str);
      const g = Object.create(Game.prototype);
      g.mode = o.mode; g.mapId = o.mapId; g.map = R.buildMap(o.mapId, o.players.length); g.N = g.map.N;
      g.time = o.time; g.tick = 0; g.nextId = o.nextId; g.ents = o.ents; g.ev = []; g.pend = o.pend || []; g.proj = [];
      g.over = null; g.speed = 1; g.paused = false; g.sb = o.sb; g.diff = o.diff; g.players = o.players; g.villages = o.villages;
      g.occ = new Int32Array(g.N * g.N); g.terr = new Int8Array(g.N * g.N).fill(-1);
      g.incT = 0; g.histT = 10; g.vilT = 0;
      for (const e of Object.values(g.ents)) {
        if (e.k === 'b') for (let yy = 0; yy < e.s; yy++) for (let xx = 0; xx < e.s; xx++) g.occ[(e.y + yy) * g.N + e.x + xx] = e.id;
        if (e.k === 'v') for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) g.occ[(e.y + yy) * g.N + e.x + xx] = e.id;
        if (e.k === 's') { e.path = null; if (e.order === 'move' || e.order === 'amove') e.order = null; }
      }
      for (const p of g.players) if (p.isAI) R.AI.reset(p);
      g.invalidate(); g.recalcTerr();
      return g;
    }
  }
  R.Game = Game;
})();
