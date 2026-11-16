'use strict';
/* Retro RTS — 맵 생성 · 지형 · 길찾기 */
(function () {
  const T = { GRASS: 0, ROAD: 1, FOREST: 2, FORD: 4, WATER: 5, ROCK: 6, BRIDGE: 7, SAND: 8 };
  R.T = T;
  const TNAME = { 0: '평지', 1: '도로', 2: '숲', 4: '여울', 5: '강', 6: '절벽', 7: '다리', 8: '모래' };
  R.TNAME = TNAME;

  // 지형별 이동 속도 배율
  R.speedMul = function (t, e, cls) {
    let m = 1;
    if (t === T.ROAD || t === T.BRIDGE) m = 1.2;
    else if (t === T.FOREST) m = cls === 'cav' ? 0.6 : 0.85;
    else if (t === T.FORD) m = 0.5;
    if (e === 1) m *= 0.9;
    return m;
  };
  R.passable = (t) => t !== T.WATER && t !== T.ROCK;

  function buildMap(mapId, players) {
    const N = players > 2 ? 96 : 80;
    const H = N / 2;
    const c = N === 96 ? 11 : 10; // 본성 좌상단 오프셋
    const seed = { plains: 11, river: 23, forest: 37, canyon: 51 }[mapId] || 7;
    const t = new Uint8Array(N * N);
    const e = new Uint8Array(N * N);
    const deco = new Uint8Array(N * N); // 장식 변형값

    const corners = [
      { x: c, y: c }, { x: N - c - 4, y: c }, { x: c, y: N - c - 4 }, { x: N - c - 4, y: N - c - 4 },
    ];
    const baseC = c + 2; // 본성 중심(사분면)

    // 사분면 좌표에서 지형 결정
    const q = (x, y) => {
      const db = Math.hypot(x - baseC, y - baseC);
      const n1 = R.noise(x / 5, y / 5, seed), n2 = R.noise(x / 7 + 50, y / 7 + 50, seed + 1);
      const n3 = R.noise(x / 3 + 9, y / 3 + 9, seed + 2);
      let tt = T.GRASS, ee = 0;
      if (mapId === 'plains') {
        if (n1 > 0.74 && db > 11) tt = T.FOREST;
        if (n2 > 0.76 && db > 11) ee = 1;
      } else if (mapId === 'forest') {
        if (n1 > 0.56 && db > 10) tt = T.FOREST;
        if (n2 > 0.58 && db > 9) ee = 1;
      } else if (mapId === 'river') {
        if (n1 > 0.78 && db > 11) tt = T.FOREST;
        if (n2 > 0.8 && db > 11) ee = 1;
        const wob = Math.round((n3 - 0.5) * 2);
        const inV = x >= H - 3 + wob; // 세로 강
        const inH = y >= H - 3 + wob; // 가로 강
        if (inV || inH) { tt = T.WATER; ee = 0; }
        if (inV && inH) tt = T.FORD; // 중앙 여울
        // 다리 (각 강줄기에 1개씩, 대칭으로 총 4개)
        if (inV && !inH && (y === H - 13 || y === H - 12)) tt = T.BRIDGE;
        if (inH && !inV && (x === H - 13 || x === H - 12)) tt = T.BRIDGE;
        // 강 위 섬 마을
        if (inV && y >= c && y <= c + 5) tt = x >= H - 1 ? T.GRASS : T.FORD;
        if (inH && x >= c && x <= c + 5) tt = y >= H - 1 ? T.GRASS : T.FORD;
      } else if (mapId === 'canyon') {
        tt = T.ROCK; ee = 2;
        const open = (d, r) => d < r;
        let o = open(db, 13);
        o = o || Math.hypot(x - H, y - H) < 10;
        // 통로: 본성→중앙(대각선), 본성→위 마을, 본성→왼쪽 마을
        const w = 1.6 + n3 * 1.2;
        const dDiag = Math.abs((x - y)) / Math.SQRT2;
        if (dDiag < w + 0.4 && x > baseC) o = true;
        const vy = c + 3, vx = H - 1;
        if (Math.abs(y - vy - (n1 - 0.5) * 3) < w && x >= baseC) o = true; // 위쪽 통로
        if (Math.abs(x - vy - (n1 - 0.5) * 3) < w && y >= baseC) o = true; // 왼쪽 통로
        if (Math.hypot(x - vx, y - vy) < 5) o = true;
        if (Math.hypot(x - vy, y - vx) < 5) o = true;
        if (o) { tt = T.GRASS; ee = 0; if (n2 > 0.66 && db > 9) ee = 1; if (n1 > 0.72 && db > 10) tt = T.FOREST; }
      }
      if (db < 8.5 && tt !== T.ROCK) { tt = T.GRASS; ee = 0; }
      return [tt, ee];
    };

    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const qx = x < H ? x : N - 1 - x, qy = y < H ? y : N - 1 - y;
      const [tt, ee] = q(qx, qy);
      const i = y * N + x; t[i] = tt; e[i] = ee; deco[i] = (R.hash2(x, y, seed + 9) * 255) | 0;
    }

    const set = (x, y, tt, ee) => { if (x >= 0 && y >= 0 && x < N && y < N) { const i = y * N + x; if (tt != null) t[i] = tt; if (ee != null) e[i] = ee; } };
    const clearRect = (x0, y0, w, h, pad) => {
      for (let y = y0 - pad; y < y0 + h + pad; y++) for (let x = x0 - pad; x < x0 + w + pad; x++) {
        const i = y * N + x; if (x < 0 || y < 0 || x >= N || y >= N) continue;
        if (t[i] === T.FOREST || t[i] === T.ROCK || t[i] === T.SAND) t[i] = T.GRASS;
        if (t[i] === T.GRASS) e[i] = 0;
      }
    };
    // 도로 (대칭 유지 위해 사분면 선분을 4방향 복제)
    const roadQ = (x0, y0, x1, y1) => {
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(R.lerp(x0, x1, s / steps)), y = Math.round(R.lerp(y0, y1, s / steps));
        for (const [mx, my] of [[x, y], [N - 1 - x, y], [x, N - 1 - y], [N - 1 - x, N - 1 - y]]) {
          const i = my * N + mx; if (t[i] === T.GRASS || t[i] === T.FOREST || t[i] === T.SAND) { t[i] = T.ROAD; }
        }
      }
    };
    if (mapId !== 'river') roadQ(baseC + 3, baseC + 3, H - 1, H - 1);
    else roadQ(baseC + 3, baseC + 3, H - 6, H - 6);
    roadQ(baseC + 3, baseC, H - 1, c + 3);
    roadQ(baseC, baseC + 3, c + 3, H - 1);
    if (mapId === 'river') { roadQ(H - 12, baseC + 4, H - 12, H - 6); roadQ(baseC + 4, H - 12, H - 6, H - 12); }

    // 모래톱 (강가)
    if (mapId === 'river') {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x; if (t[i] !== T.GRASS) continue;
        let w = false;
        for (let dy = -1; dy <= 1 && !w; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          if (t[yy * N + xx] === T.WATER) { w = true; break; }
        }
        if (w) { t[i] = T.SAND; e[i] = 0; }
      }
    }

    // 광맥 (2×2): 본성 근처 2개씩 + 중앙 4개
    const ores = [];
    const addOreQ = (qx, qy) => {
      for (const [mx, my] of [[qx, qy], [N - 2 - qx, qy], [qx, N - 2 - qy], [N - 2 - qx, N - 2 - qy]]) {
        ores.push({ x: mx, y: my }); clearRect(mx, my, 2, 2, 1);
        for (let yy = my - 1; yy <= my + 2; yy++) for (let xx = mx - 1; xx <= mx + 2; xx++) { const i = yy * N + xx; if (t[i] === T.WATER || t[i] === T.FORD) t[i] = T.GRASS; e[i] = 0; }
      }
    };
    addOreQ(baseC + 7, baseC - 1);
    addOreQ(baseC - 1, baseC + 7);
    addOreQ(H - 7, H - 7);

    // 중립 마을 (2×2): 각 변의 중앙
    const villages = [
      { x: H - 1, y: c + 2 }, { x: c + 2, y: H - 1 }, { x: N - c - 4, y: H - 1 }, { x: H - 1, y: N - c - 4 },
    ];
    for (const v of villages) clearRect(v.x, v.y, 2, 2, 1);

    // 본성 터
    const starts = corners.map((p) => ({ x: p.x, y: p.y }));
    for (const s of starts) clearRect(s.x, s.y, 4, 4, 4);

    return { id: mapId, N, t, e, deco, ores, villages, starts };
  }
  R.buildMap = buildMap;

  // 길찾기 (A*, 8방향)
  // opt: { cls, team, occ(fn i → 0막힘/1통과/2부술수있음), breakCost }
  R.findPath = function (G, sx, sy, tx, ty, opt) {
    const M = G.map, N = M.N;
    sx = R.clamp(Math.floor(sx), 0, N - 1); sy = R.clamp(Math.floor(sy), 0, N - 1);
    tx = R.clamp(Math.floor(tx), 0, N - 1); ty = R.clamp(Math.floor(ty), 0, N - 1);
    const cls = opt.cls;
    const cellCost = (i) => {
      const tt = M.t[i]; if (!R.passable(tt)) return -1;
      const o = G.blockAt(i, opt.team);
      if (o === 0) return -1;
      let c = 1 / R.speedMul(tt, M.e[i], cls);
      if (o === 2) { if (!opt.canBreak) return -1; c += 25; }
      return c;
    };
    // 목표가 막혀 있으면 가장 가까운 통과 가능 칸으로
    const ti0 = ty * N + tx;
    if (cellCost(ti0) < 0) {
      let best = -1, bd = 1e9;
      for (let r = 1; r < 8 && best < 0; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx, y = ty + dy; if (x < 0 || y < 0 || x >= N || y >= N) continue;
          const i = y * N + x; if (cellCost(i) < 0) continue;
          const d = R.dist2(x, y, sx, sy) * 0.01 + dx * dx + dy * dy;
          if (d < bd) { bd = d; best = i; }
        }
      }
      if (best < 0) return null;
      tx = best % N; ty = (best / N) | 0;
    }
    const start = sy * N + sx, goal = ty * N + tx;
    if (start === goal) return [{ x: tx + 0.5, y: ty + 0.5 }];
    const g = G._pg || (G._pg = new Float32Array(N * N));
    const from = G._pf || (G._pf = new Int32Array(N * N));
    const stamp = G._ps || (G._ps = new Uint32Array(N * N));
    const closed = G._pc || (G._pc = new Uint32Array(N * N));
    G._pstamp = (G._pstamp || 0) + 1; const st = G._pstamp;
    const h = (i) => { const x = i % N, y = (i / N) | 0; const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return (dx + dy + (1.4142 - 2) * Math.min(dx, dy)) * 0.83; };
    const open = new R.Heap();
    g[start] = 0; stamp[start] = st; from[start] = -1; open.push(start, h(start));
    let found = false, it = 0, bestI = start, bestH = h(start);
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    while (open.size && it++ < 12000) {
      const cur = open.pop();
      if (closed[cur] === st) continue; closed[cur] = st;
      if (cur === goal) { found = true; break; }
      const hc = h(cur); if (hc < bestH) { bestH = hc; bestI = cur; }
      const cx = cur % N, cy = (cur / N) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const ni = ny * N + nx; if (closed[ni] === st) continue;
        const cc = cellCost(ni); if (cc < 0) continue;
        if (k >= 4) { // 모서리 끼기 방지
          if (cellCost(cy * N + nx) < 0 || cellCost(ny * N + cx) < 0) continue;
        }
        const ng = g[cur] + cc * (k >= 4 ? 1.4142 : 1);
        if (stamp[ni] !== st || ng < g[ni]) { stamp[ni] = st; g[ni] = ng; from[ni] = cur; open.push(ni, ng + h(ni)); }
      }
    }
    let end = found ? goal : bestI;
    const cells = [];
    for (let i = end; i !== -1 && cells.length < 4000; i = from[i]) cells.push(i);
    cells.reverse();
    // 경로 다듬기 (가시선)
    const los = (a, b) => {
      let x0 = a % N, y0 = (a / N) | 0; const x1 = b % N, y1 = (b / N) | 0;
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sxx = x0 < x1 ? 1 : -1, syy = y0 < y1 ? 1 : -1;
      let err = dx - dy; const c0 = cellCost(a);
      for (;;) {
        const i = y0 * N + x0; const cc = cellCost(i); if (cc < 0 || cc > c0 + 1.2) return false;
        if (x0 === x1 && y0 === y1) return true;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sxx; }
        if (e2 < dx) { err += dx; y0 += syy; }
        if (e2 > -dy && e2 < dx) { if (cellCost(y0 * N + x0 - sxx) < 0 && cellCost((y0 - syy) * N + x0) < 0) return false; }
      }
    };
    const out = [];
    let a = 0;
    while (a < cells.length - 1) {
      let b = Math.min(cells.length - 1, a + 24);
      while (b > a + 1 && !los(cells[a], cells[b])) b--;
      out.push(cells[b]); a = b;
    }
    if (!out.length) out.push(end);
    return out.map((i) => ({ x: (i % N) + 0.5, y: ((i / N) | 0) + 0.5 }));
  };
})();
