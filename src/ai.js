'use strict';
/* Retro RTS — AI (난이도 3단계 · 성향 3종) */
(function () {
  const U = R.U, B = R.B;
  const AI = {};
  R.AI = AI;

  AI.reset = function (pl) {
    pl.ai = Object.assign({ t: 0, waveAt: 0, phase: 'build', lastWave: 0, vilT: 0, scoutSent: false }, pl.ai || {});
    if (!pl.persona) pl.persona = ['aggro', 'turtle', 'eco'][Math.floor(Math.random() * 3)];
  };

  const PLAN = {
    aggro: { farms: 3, mills: 1, mines: 2, builders: 3, waveSize: [4, 6, 8, 10], firstWave: 200, eraAt: [150, 480, 900], towers: 0, markets: 1 },
    turtle: { farms: 4, mills: 1, mines: 2, builders: 4, waveSize: [99, 8, 10, 12], firstWave: 600, eraAt: [110, 360, 720], towers: 3, markets: 1 },
    eco: { farms: 6, mills: 2, mines: 4, builders: 5, waveSize: [99, 10, 12, 14], firstWave: 720, eraAt: [100, 330, 660], towers: 1, markets: 2 },
  };

  AI.update = function (G, pl, dt) {
    if (!pl.ai) AI.reset(pl);
    const ai = pl.ai;
    ai.t -= dt;
    if (ai.t > 0) return;
    const diff = R.DIFF[G.diff] || R.DIFF[1];
    ai.t = diff.react;
    try { think(G, pl, diff); } catch (e) { if (R.DEBUG) console.error(e); }
  };

  function myB(G, p, type) { return G.buildings().filter((b) => b.owner === p && (!type || b.type === type)); }
  function mySq(G, p) { return G.squads().filter((s) => s.owner === p); }

  function think(G, pl, diff) {
    const p = pl.id, plan = PLAN[pl.persona] || PLAN.eco, ai = pl.ai;
    const base = G.ents[pl.baseId]; if (!base) return;
    const bs = myB(G, p);
    const cnt = (t) => bs.filter((b) => b.type === t).length;
    const sqs = mySq(G, p);
    const army = sqs.filter((s) => R.squadPop(U[s.u]));
    const builders = sqs.filter((s) => s.u === 'builder');
    const pop = G.pop(p);
    const T = G.time;
    const hard = G.diff === 2, easy = G.diff === 0 || G.diff === 3;
    const passive = !!diff.passive && !pl.provoked; // 아주 쉬움: 도발당하기 전에는 공격 안 함
    const vEasy = !!diff.passive;
    const underCon = bs.filter((b) => b.built < 1).length;

    // ── 위협 감지 ──
    const team = pl.team;
    let threat = null, threatD = 1e9;
    for (const s of G.squads()) {
      if (G.players[s.owner].team === team) continue;
      const ti = (s.y | 0) * G.N + (s.x | 0);
      const inTerr = G.terr[ti] === p;
      const d = R.dist(s.x, s.y, base.x + 2, base.y + 2);
      if ((inTerr || d < 16) && d < threatD) { threatD = d; threat = s; }
    }

    // ── 경제 ──
    let reserve = 0;
    const tryBuild = (type) => {
      if (B[type].era > pl.era) return false;
      if (!G.canAfford(p, B[type].cost)) { reserve = Math.max(reserve, B[type].cost); return false; }
      const spot = findSpot(G, p, type, base);
      if (!spot) return false;
      return G.exec({ c: 'build', p, type, x: spot.x, y: spot.y }) === true;
    };
    let built = false;
    const maxCon = Math.max(1, Math.min(3, builders.length));
    if (underCon < maxCon) {
      const wants = [];
      if (pop.used >= pop.cap - 1 && pop.cap < R.MAX_POP) wants.push('house');
      if (cnt('farm') < 2) wants.push('farm');
      if (!cnt('barracks')) wants.push('barracks');
      if (cnt('mine') < plan.mines && G.map.ores.length) wants.push('mine');
      if (cnt('farm') < plan.farms) wants.push('farm');
      if (cnt('mill') < plan.mills && cnt('farm') >= 2) wants.push('mill');
      if (!cnt('range')) wants.push('range');
      if (pl.persona === 'aggro' && !cnt('stable')) wants.push('stable');
      if (pl.era >= 1) {
        if (cnt('market') < plan.markets) wants.push('market');
        if (!cnt('smith')) wants.push('smith');
        if (!cnt('stable')) wants.push('stable');
        if (!cnt('workshop') && T > 420) wants.push('workshop');
      }
      if (cnt('tower_wood') < Math.min(plan.towers, 2) && T > 120) wants.push('tower_wood');
      if (pl.era >= 2 && cnt('tower_stone') < plan.towers - 1) wants.push('tower_stone');
      if (pl.era >= 2 && cnt('barracks') < 2 && pl.money > 800) wants.push('barracks');
      for (const w of wants) { if (tryBuild(w)) { built = true; break; } if (reserve) break; }
    }

    // 빌더
    if (builders.length < plan.builders && G.builderCount(p) < plan.builders && G.canAfford(p, 50 + reserve * 0.3)) G.exec({ c: 'train', p, bid: base.id, u: 'builder' });
    // 놀고 있는 빌더 → 건설 중 건물
    for (const b of builders) if (!b.task) {
      const tgt = bs.find((x) => x.built < 1) || bs.find((x) => x.hp < x.maxHp * 0.7);
      if (tgt) G.exec({ c: 'task', p, ids: [b.id], bid: tgt.id });
    }

    // 시대 발전
    if (!pl.eraProg && pl.era < 3 && T > plan.eraAt[pl.era] * (easy ? 1.4 : 1)) {
      const need = R.ERAS[pl.era + 1].cost;
      if (!G.eraReq(p)) { if (G.canAfford(p, need)) G.exec({ c: 'era', p }); else reserve = Math.max(reserve, need); }
      else if (pl.era === 2) {
        // 제국 조건: Lv3 건물 2채
        const cand = bs.filter((b) => B[b.type].lvCost && b.built >= 1 && !b.lvProg && b.lv < 3).sort((a, b) => b.lv - a.lv);
        if (cand[0] && G.canAfford(p, B[cand[0].type].lvCost[cand[0].lv - 1])) G.exec({ c: 'levelup', p, bid: cand[0].id });
      }
    }
    // 레벨업 (여유 있을 때)
    if (pl.money > 900 + reserve) {
      const cand = bs.filter((b) => B[b.type].lvCost && b.built >= 1 && !b.lvProg && b.lv < 3 && (b.lv < 2 || pl.era >= 2) && (!B[b.type].prodCls || pl.era >= 1));
      const pick = cand.sort((a, b) => (B[b.type].inc ? 1 : 0) - (B[a.type].inc ? 1 : 0))[0];
      if (pick) G.exec({ c: 'levelup', p, bid: pick.id });
    }

    // ── 군대 생산 ──
    const enemyComp = { inf: 0, rng: 0, cav: 0, siege: 0 };
    for (const s of G.squads()) if (G.players[s.owner].team !== team && enemyComp[U[s.u].cls] != null) enemyComp[U[s.u].cls]++;
    const spend = pl.money - reserve;
    if (pop.used < pop.cap && !(vEasy && army.length >= 8)) { // 아주 쉬움: 부대 8개까지만
      const prods = bs.filter((b) => B[b.type].prodCls && b.built >= 1 && b.queue.length < (hard ? 2 : 1));
      for (const b of prods) {
        const u = pickUnit(G, pl, B[b.type].prodCls, enemyComp, easy);
        if (!u) continue;
        if (spend < U[u].cost + (army.length < 2 || threat ? 0 : 60)) continue;
        if (G.pop(p).used >= G.pop(p).cap) break;
        G.exec({ c: 'train', p, bid: b.id, u });
      }
    }
    if (pl.era >= 1 && !pl.genAlive && pl.genCD <= T && pl.money > 500 && !base.queue.some((q) => q.u === 'general')) G.exec({ c: 'train', p, bid: base.id, u: 'general' });

    // ── 군사 행동 ──
    const free = army.filter((s) => !s.rout && s.u !== 'general');
    const gen = sqs.find((s) => s.u === 'general');
    if (threat && threatD < 20) {
      const def = free.filter((s) => !s.tgt || s.order !== 'attack');
      if (def.length) G.exec({ c: 'move', p, ids: def.map((s) => s.id), x: threat.x, y: threat.y, am: true });
      if (gen && !gen.tgt) G.exec({ c: 'move', p, ids: [gen.id], x: threat.x, y: threat.y, am: true });
      ai.phase = 'defend';
    } else {
      if (ai.phase === 'defend') ai.phase = 'build';
      // 마을 점령
      if ((ai.vilT -= diff.react) <= 0) {
        ai.vilT = easy ? 40 : 20;
        const idle = free.filter((s) => !s.order && !s.tgt && U[s.u].cls !== 'siege');
        if (idle.length && ai.phase !== 'wave') {
          let bestV = null, bd = 1e9;
          for (const vid of G.villages) {
            const v = G.ents[vid]; if (v.owner >= 0 && G.players[v.owner].team === team) continue;
            const d = R.dist(v.x + 1, v.y + 1, base.x + 2, base.y + 2); if (d < bd) { bd = d; bestV = v; }
          }
          if (bestV && bd < G.N * 0.75) {
            const pick = idle.sort((a, b) => U[b.u].spd - U[a.u].spd)[0];
            G.exec({ c: 'move', p, ids: [pick.id], x: bestV.x + 1, y: bestV.y + 2.5, am: true });
          }
        }
      }
      // 공격 웨이브
      const want = vEasy ? Math.max(2, Math.min(4, plan.waveSize[pl.era] * 0.4)) : plan.waveSize[pl.era] * (easy ? 0.8 : hard ? 1 : 0.9);
      const minT = vEasy ? 0 : plan.firstWave * (easy ? 1.5 : hard ? 0.85 : 1);
      if (!passive && T > minT && (free.length >= want || (pop.used >= pop.cap - 1 && free.length >= 4)) && T - ai.lastWave > (vEasy ? 180 : easy ? 150 : 90)) {
        const tgt = pickTarget(G, pl, base);
        if (tgt) {
          ai.lastWave = T; ai.phase = 'gather'; ai.gatherT = T;
          ai.wave = (vEasy ? free.slice(0, Math.ceil(want)) : free).map((s) => s.id); ai.tgtP = tgt.owner; ai.tgtId = tgt.id;
          const bc = { x: base.x + 2, y: base.y + 2 }, c = { x: tgt.x + tgt.s / 2, y: tgt.y + tgt.s / 2 };
          ai.stage = { x: R.lerp(bc.x, c.x, 0.45), y: R.lerp(bc.y, c.y, 0.45) };
          G.exec({ c: 'move', p, ids: ai.wave, x: ai.stage.x, y: ai.stage.y, am: true });
          if (gen) G.exec({ c: 'move', p, ids: [gen.id], x: ai.stage.x, y: ai.stage.y, am: true });
        }
      }
      if (ai.phase === 'gather') {
        const w = (ai.wave || []).map((id) => G.ents[id]).filter(Boolean);
        const near = w.filter((s) => R.dist(s.x, s.y, ai.stage.x, ai.stage.y) < 7).length;
        if (!w.length) ai.phase = 'build';
        else if (near >= w.length * 0.7 || T - ai.gatherT > 45) {
          const tgt = G.ents[ai.tgtId] || pickTarget(G, pl, base, ai.tgtP);
          if (tgt) {
            ai.phase = 'wave';
            const ids = w.map((s) => s.id); if (gen) ids.push(gen.id);
            G.exec({ c: 'move', p, ids, x: tgt.x + tgt.s / 2, y: tgt.y + tgt.s / 2, am: true });
          } else ai.phase = 'build';
        }
      }
      if (ai.phase === 'wave') {
        const w = (ai.wave || []).map((id) => G.ents[id]).filter(Boolean);
        if (w.length < 2) { ai.phase = 'build'; // 생존 병력 귀환
          for (const s of w) G.exec({ c: 'move', p, ids: [s.id], x: base.x + 2 + pl.fwd.x * 6, y: base.y + 2 + pl.fwd.y * 6 });
        } else {
          // 놀고 있는 웨이브 병력은 다음 목표로
          const idle = w.filter((s) => !s.order && !s.tgt && !s.rout);
          if (idle.length) {
            const tgt = pickTarget(G, pl, base, ai.tgtP);
            if (tgt) G.exec({ c: 'move', p, ids: idle.map((s) => s.id), x: tgt.x + tgt.s / 2, y: tgt.y + tgt.s / 2, am: true });
          }
        }
      }
    }

    // ── 어려움: 세부 컨트롤 ──
    if (hard) {
      for (const s of army) {
        const t = s.tgt ? G.ents[s.tgt] : null;
        if (!t || t.k !== 's') continue;
        if (U[s.u].cls === 'cav' && U[t.u].spear) {
          const alt = G.findEnemySquad(s.x, s.y, 8, p, true);
          if (alt && !U[alt.u].spear) G.exec({ c: 'attack', p, ids: [s.id], tid: alt.id });
        }
      }
      if (gen) {
        const fighting = army.filter((s) => s.tgt && R.dist(s.x, s.y, gen.x, gen.y) < 6).length;
        if (fighting >= 3) G.exec({ c: 'ability', p, a: (gen.cdC || 0) <= T ? 'charge' : 'defend' });
      }
    } else if (!easy && gen && (gen.cdD || 0) <= T) {
      const fighting = army.filter((s) => s.tgt && R.dist(s.x, s.y, gen.x, gen.y) < 6).length;
      if (fighting >= 4) G.exec({ c: 'ability', p, a: 'defend' });
    }
    void built;
  }

  function pickUnit(G, pl, cls, ec, easy) {
    const opts = R.PROD[cls].filter((u) => U[u].era <= pl.era);
    if (!opts.length) return null;
    const best = opts[opts.length - 1];
    if (easy && Math.random() < 0.5) return opts[(Math.random() * opts.length) | 0];
    if (cls === 'inf') {
      if (ec.cav > ec.inf && opts.includes('halberdier')) return 'halberdier';
      if (ec.cav >= ec.rng && ec.cav > 0 && opts.includes('spearman')) return Math.random() < 0.6 ? 'spearman' : best;
      if (ec.rng > ec.cav && opts.includes('swordsman')) return Math.random() < 0.5 ? 'swordsman' : best;
      return Math.random() < 0.5 ? best : opts[Math.max(0, opts.length - 2)];
    }
    if (cls === 'cav') {
      if (ec.rng + ec.siege > ec.inf && opts.includes('knight')) return 'knight';
      return Math.random() < 0.6 ? best : opts[Math.max(0, opts.length - 2)];
    }
    if (cls === 'siege') {
      const n = G.squads().filter((s) => s.owner === pl.id && U[s.u].cls === 'siege').length;
      if (n >= 3) return null;
      if (opts.includes('trebuchet') && Math.random() < 0.5) return 'trebuchet';
      if (opts.includes('mangonel') && Math.random() < 0.6) return 'mangonel';
      return 'ram';
    }
    return Math.random() < 0.7 ? best : opts[Math.max(0, opts.length - 2)];
  }

  function pickTarget(G, pl, base, prefer) {
    const enemies = G.players.filter((o) => o.alive && o.team !== pl.team);
    if (!enemies.length) return null;
    let tp = enemies.find((o) => o.id === prefer);
    if (!tp) { tp = enemies.sort((a, b) => { const A = G.ents[a.baseId], Bb = G.ents[b.baseId]; return R.dist(A.x, A.y, base.x, base.y) - R.dist(Bb.x, Bb.y, base.x, base.y); })[0]; }
    // 본성 쪽으로 가는 길의 가까운 건물 먼저
    const eb = G.ents[tp.baseId]; if (!eb) return null;
    let best = eb, bd = R.dist(base.x, base.y, eb.x, eb.y) * 0.7;
    for (const b of G.buildings()) {
      if (b.owner !== tp.id || B[b.type].wall) continue;
      const d = R.dist(base.x, base.y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function findSpot(G, p, type, base) {
    const d = B[type], N = G.N;
    if (d.ore) {
      const bc = { x: base.x + 2, y: base.y + 2 };
      const ores = G.map.ores.slice().sort((a, b) => R.dist(a.x, a.y, bc.x, bc.y) - R.dist(b.x, b.y, bc.x, bc.y));
      for (const o of ores) if (!G.canPlace(p, type, o.x, o.y)) return o;
      return null;
    }
    const pl = G.players[p];
    const cx = base.x + 2 + pl.fwd.x * (type.startsWith('tower') ? 7 : 2), cy = base.y + 2 + pl.fwd.y * (type.startsWith('tower') ? 7 : 2);
    const s = d.size;
    // 나선 탐색, 주변 1칸 여유
    for (let r = 2; r < 18; r++) {
      const pts = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) pts.push([dx, dy]);
      for (let k = pts.length - 1; k > 0; k--) { const j = Math.floor(R.hash2(k, r, p + G.tick) * (k + 1)); [pts[k], pts[j]] = [pts[j], pts[k]]; }
      for (const [dx, dy] of pts) {
        const x = Math.round(cx + dx - s / 2), y = Math.round(cy + dy - s / 2);
        if (G.canPlace(p, type, x, y)) continue;
        if (s > 1 || type === 'house') {
          let ok = true;
          for (let yy = y - 1; yy <= y + s && ok; yy++) for (let xx = x - 1; xx <= x + s; xx++) {
            if (xx < 0 || yy < 0 || xx >= N || yy >= N) { ok = false; break; }
            const i = yy * N + xx; if (G.occ[i] || G.isOre(xx, yy) && !(xx >= x && xx < x + s && yy >= y && yy < y + s)) { ok = false; break; }
          }
          if (!ok) continue;
        }
        return { x, y };
      }
    }
    return null;
  }
})();
