'use strict';
/* Retro RTS — 입력 (마우스 · 키보드 · 터치) */
(function () {
  const U = R.U, B = R.B;
  const I = { ptrs: new Map(), keys: new Set(), mode: null, modeArg: null, mx: -1, my: -1, inside: false };
  R.Input = I;

  I.setMode = function (m, arg) {
    I.mode = m; I.modeArg = arg;
    const hint = R.$('#cmdHint');
    const txt = { amove: R.isMobile() ? '공격 이동: 목표 지점을 누르세요' : '공격 이동: 목표 지점을 클릭하세요', rally: '집결지: 지점을 누르세요', spawn: '배치할 곳을 누르세요' }[m];
    hint.classList.toggle('hidden', !txt); if (txt) hint.textContent = txt;
  };

  I.init = function (cv) {
    I.cv = cv;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('pointerenter', () => { I.inside = true; });
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') I.inside = false; });
    addEventListener('keydown', keydown);
    addEventListener('keyup', (e) => I.keys.delete(e.code));
    addEventListener('blur', () => { I.keys.clear(); I.inside = false; });
    // 미니맵
    const mm = R.$('#mm');
    let mmDrag = false;
    mm.addEventListener('contextmenu', (e) => e.preventDefault());
    mm.addEventListener('pointerdown', (e) => {
      const r = mm.getBoundingClientRect(); const t = R.App.mm.toTile(e.clientX - r.left, e.clientY - r.top);
      if (e.button === 2) { I.command(t.x, t.y, null); return; }
      mmDrag = true; mm.setPointerCapture(e.pointerId); R.App.rd.centerOn(t.x, t.y);
    });
    mm.addEventListener('pointermove', (e) => { if (!mmDrag) return; const r = mm.getBoundingClientRect(); const t = R.App.mm.toTile(e.clientX - r.left, e.clientY - r.top); R.App.rd.centerOn(t.x, t.y); });
    mm.addEventListener('pointerup', () => { mmDrag = false; });
  };

  const rd = () => R.App.rd;
  const G = () => R.App.G;

  function down(e) {
    if (!G()) return;
    I.cv.setPointerCapture && I.cv.setPointerCapture(e.pointerId);
    const p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), btn: e.button, type: e.pointerType, moved: false, cam: { x: rd().cam.x, y: rd().cam.y } };
    I.ptrs.set(e.pointerId, p);
    if (I.ptrs.size === 2) { // 핀치 시작
      const [a, b] = [...I.ptrs.values()];
      I.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: rd().cam.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, cam: { x: rd().cam.x, y: rd().cam.y } };
      rd().drag = null; clearTimeout(I.longT);
      return;
    }
    if (p.type !== 'mouse') {
      clearTimeout(I.longT);
      I.longT = setTimeout(() => { if (!p.moved && I.ptrs.has(p.id) && !R.UI.placing) { p.long = true; longPress(p); } }, 520);
    }
    // 성벽 드래그 시작 (PC)
    if (R.UI.placing && R.UI.placing.line && p.type === 'mouse' && e.button === 0) { const t = rd().s2t(e.clientX, e.clientY); I.lineStart = { x: Math.floor(t.x), y: Math.floor(t.y) }; }
  }

  function move(e) {
    I.mx = e.clientX; I.my = e.clientY;
    if (!G()) return;
    const p = I.ptrs.get(e.pointerId);
    // 건설 미리보기는 맵(캔버스) 위의 마우스만 따라간다. 터치는 탭할 때만 옮긴다.
    // (건설·취소 버튼 등 HUD 위의 움직임이 미리보기 위치를 바꾸면 버튼 자리에 지어지는 버그가 생김)
    if (R.UI.placing && (p ? p.type === 'mouse' : e.pointerType === 'mouse' && e.target === I.cv)) updateGhost(e.clientX, e.clientY);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    const dist = Math.hypot(p.x - p.x0, p.y - p.y0);
    if (dist > (p.type === 'mouse' ? 5 : 10)) p.moved = true;
    if (I.pinch && I.ptrs.size >= 2) {
      const [a, b] = [...I.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cam = rd().cam; const z0 = I.pinch.z;
      cam.zoom = R.clamp(z0 * d / I.pinch.d, 0.75, 4);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      // 손가락 중심 고정 + 팬
      const wx = (I.pinch.cx - rd().W / 2) / z0 + I.pinch.cam.x, wy = (I.pinch.cy - rd().H / 2) / z0 + I.pinch.cam.y;
      cam.x = wx - (cx - rd().W / 2) / cam.zoom; cam.y = wy - (cy - rd().H / 2) / cam.zoom;
      rd().clampCam();
      return;
    }
    if (!p.moved) return;
    const touchSel = p.type !== 'mouse' && R.UI.selMode;
    if ((p.type === 'mouse' && p.btn === 0 && !R.UI.placing) || touchSel) {
      rd().drag = { x0: p.x0, y0: p.y0, x1: p.x, y1: p.y };
    } else if (p.type === 'mouse' && p.btn === 0 && R.UI.placing && R.UI.placing.line && I.lineStart) {
      updateGhost(p.x, p.y);
    } else if (p.type !== 'mouse' || p.btn === 1) {
      if (R.UI.placing && p.type !== 'mouse' && R.UI.placing.line && I.lineStart && false) return;
      const z = rd().cam.zoom;
      rd().cam.x = p.cam.x - (p.x - p.x0) / z; rd().cam.y = p.cam.y - (p.y - p.y0) / z; rd().clampCam();
      I.camMoved = (I.camMoved || 0) + 1;
    }
  }

  function up(e) {
    const p = I.ptrs.get(e.pointerId);
    if (!p) return;
    I.ptrs.delete(e.pointerId);
    clearTimeout(I.longT);
    if (I.pinch) { if (I.ptrs.size < 2) { I.pinch = null; for (const q of I.ptrs.values()) { q.moved = true; } } return; }
    if (!G()) return;
    const d = rd().drag; rd().drag = null;
    if (p.long) return;
    if (d) { boxSel(d, e.shiftKey); return; }
    if (p.moved && !(R.UI.placing && R.UI.placing.line && I.lineStart && p.type === 'mouse')) return;
    // 클릭 / 탭
    if (p.type === 'mouse' && p.btn === 2) { rightClick(p.x, p.y); return; }
    if (p.type === 'mouse' && p.btn !== 0) return;
    tap(p.x, p.y, e.shiftKey, p.type !== 'mouse');
  }

  function wheel(e) {
    e.preventDefault(); if (!G()) return;
    const cam = rd().cam, z0 = cam.zoom;
    const nz = R.clamp(z0 * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.75, 4);
    const wx = (e.clientX - rd().W / 2) / z0 + cam.x, wy = (e.clientY - rd().H / 2) / z0 + cam.y;
    cam.zoom = nz; cam.x = wx - (e.clientX - rd().W / 2) / nz; cam.y = wy - (e.clientY - rd().H / 2) / nz; rd().clampCam();
  }

  function lineCells(a, b) {
    const out = []; let x0 = a.x, y0 = a.y; const x1 = b.x, y1 = b.y;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx - dy;
    for (let k = 0; k < 80; k++) {
      out.push([x0, y0]); if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy && e2 < dx) { // 대각선 → 계단식으로 이어 붙이기
        err -= dy; x0 += sx; out.push([x0, y0]); err += dx; y0 += sy;
      } else if (e2 > -dy) { err -= dy; x0 += sx; } else { err += dx; y0 += sy; }
    }
    return out;
  }

  I.updateGhost = (sx, sy) => updateGhost(sx, sy);
  function updateGhost(sx, sy) {
    const pl = R.UI.placing; if (!pl) return;
    const t = rd().s2t(sx, sy); const d = B[pl.type];
    const x = Math.floor(t.x - d.size / 2 + 0.5), y = Math.floor(t.y - d.size / 2 + 0.5);
    if (pl.line && I.lineStart) rd().ghost = { type: pl.type, x: I.lineStart.x, y: I.lineStart.y, cells: lineCells(I.lineStart, { x: Math.floor(t.x), y: Math.floor(t.y) }) };
    else rd().ghost = { type: pl.type, x, y };
    const g = rd().ghost; const cells = g.cells || [[g.x, g.y]];
    const ok = cells.filter(([cx, cy]) => !G().canPlace(R.UI.me, pl.type, cx, cy)).length;
    R.$('#placeInfo').textContent = d.name + (cells.length > 1 ? ' ' + ok + '칸 · ' + ok * d.cost + '금화' : ' · ' + d.cost + '금화') + (ok ? '' : ' — ' + G().canPlace(R.UI.me, pl.type, cells[0][0], cells[0][1]));
  }

  function tap(sx, sy, shift, touch) {
    const UI = R.UI;
    // 건설
    if (UI.placing) {
      if (touch) {
        if (UI.placing.line) {
          const t = rd().s2t(sx, sy);
          if (!I.lineStart || (rd().ghost && rd().ghost.cells && rd().ghost.cells.length > 1 && I.lineDone)) { I.lineStart = { x: Math.floor(t.x), y: Math.floor(t.y) }; I.lineDone = false; updateGhost(sx, sy); }
          else { updateGhost(sx, sy); I.lineDone = true; }
        } else updateGhost(sx, sy);
        return;
      }
      updateGhost(sx, sy);
      UI.keepPlacing = shift;
      UI.confirmPlace();
      I.lineStart = null;
      return;
    }
    if (I.mode === 'spawn' && UI.sbUnit) { const t = rd().s2t(sx, sy); R.App.cmd({ c: 'sbSpawn', u: UI.sbUnit, owner: UI.sbOwner, x: t.x, y: t.y }); return; }
    if (I.mode === 'amove' || I.mode === 'rally') { const t = rd().s2t(sx, sy); const e = rd().pick(sx, sy); I.command(t.x, t.y, e, I.mode === 'amove'); I.setMode(null); return; }
    const e = rd().pick(sx, sy);
    const myIds = UI.myIds();
    if (touch && myIds.length) {
      // 터치: 선택 중이면 명령
      if (e && e.k === 's' && e.owner === UI.me) { selectEnt(e, false, touch); return; }
      if (e && e.k === 'b' && e.owner === UI.me && !(myIds.some((id) => G().ents[id].u === 'builder') && (e.built < 1 || e.hp < e.maxHp))) {
        if (B[e.type].wall && myIds.some((id) => U[G().ents[id].u].cls === 'rng')) { const t = rd().s2t(sx, sy); I.command(t.x, t.y, e); return; }
        selectEnt(e, false, touch); return;
      }
      const t = rd().s2t(sx, sy); I.command(t.x, t.y, e); return;
    }
    if (e) selectEnt(e, shift, touch);
    else { UI.select([]); }
  }

  function selectEnt(e, shift, touch) {
    const UI = R.UI; const now = performance.now();
    // 더블클릭/더블탭: 화면 안 같은 병종
    if (e.k === 's' && e.owner === UI.me && I.lastSel && I.lastSel.id === e.id && now - I.lastSel.t < 350) {
      const same = rd().boxSelect(0, 0, rd().W, rd().H).filter((s) => s.u === e.u).map((s) => s.id);
      UI.select(same); I.lastSel = null; return;
    }
    I.lastSel = { id: e.id, t: now };
    if (shift && e.k === 's' && e.owner === UI.me) {
      if (UI.sel.has(e.id)) UI.sel.delete(e.id); else UI.sel.add(e.id);
      UI.updatePanel(true);
    } else UI.select([e.id]);
    R.Audio.sfx('click', 0.6);
    void touch;
  }

  function boxSel(d, shift) {
    const UI = R.UI;
    const list = rd().boxSelect(d.x0, d.y0, d.x1, d.y1);
    // 전투 부대가 있으면 빌더 제외
    const army = list.filter((s) => s.u !== 'builder');
    const ids = (army.length ? army : list).map((s) => s.id);
    if (shift) { for (const id of ids) UI.sel.add(id); UI.updatePanel(true); } else UI.select(ids);
  }

  function rightClick(sx, sy) {
    const UI = R.UI;
    if (UI.placing) { UI.cancelPlace(); I.lineStart = null; return; }
    if (I.mode) { I.setMode(null); return; }
    const t = rd().s2t(sx, sy); const e = rd().pick(sx, sy);
    I.command(t.x, t.y, e);
  }

  function longPress(p) {
    const UI = R.UI; const ids = UI.myIds(); if (!ids.length) return;
    const t = rd().s2t(p.x, p.y);
    I.command(t.x, t.y, null, true);
    if (navigator.vibrate) navigator.vibrate(20);
  }

  // 선택된 부대/건물에 명령
  I.command = function (tx, ty, e, am) {
    const UI = R.UI, g = G(); const me = UI.me;
    const ids = UI.myIds();
    const selB = [...UI.sel].map((id) => g.ents[id]).find((x) => x && x.k === 'b' && x.owner === me);
    if (I.mode === 'rally' || (!ids.length && selB && (B[selB.type].prodCls || selB.type === 'base'))) {
      const b = I.mode === 'rally' ? g.ents[I.modeArg] : selB;
      if (b) { R.App.cmd({ c: 'rally', bid: b.id, x: tx, y: ty }); rd().marks.push({ x: tx, y: ty, t: 1, c: '#9aff7a' }); UI.toast('집결지를 지정했어요', 'good', 1000); }
      I.setMode(null); return;
    }
    if (!ids.length) return;
    const team = g.players[me].team;
    if (e && (e.k === 's' || e.k === 'b') && g.players[e.owner].team !== team) {
      R.App.cmd({ c: 'attack', ids, tid: e.id });
      rd().marks.push({ x: e.k === 's' ? e.x : e.x + e.s / 2, y: e.k === 's' ? e.y : e.y + e.s / 2, t: 0.8, c: '#ff5a4a' });
      R.Audio.sfx('click');
      return;
    }
    if (e && e.k === 'b' && e.owner === me && (e.built < 1 || e.hp < e.maxHp)) {
      const bl = ids.filter((id) => g.ents[id].u === 'builder');
      if (bl.length) { R.App.cmd({ c: 'task', ids: bl, bid: e.id }); const rest = ids.filter((id) => !bl.includes(id)); if (!rest.length) { UI.toast(e.built < 1 ? '건설을 도와요' : '수리해요', 'good', 900); return; } }
    }
    R.App.cmd({ c: 'move', ids, x: tx, y: ty, am: !!am });
    rd().marks.push({ x: tx, y: ty, t: 0.6, c: am ? '#ff8a5a' : '#9aff7a' });
    R.Audio.sfx('click', 0.7);
  };

  function keydown(e) {
    if (e.target.tagName === 'INPUT') { if (e.key === 'Enter' && e.target.id === 'chatIn') { R.App.sendChat(e.target.value); e.target.value = ''; e.target.blur(); } return; }
    I.keys.add(e.code);
    const g = G(); const UI = R.UI;
    if (!g || !UI.G || R.$('#hud').classList.contains('hidden')) return;
    if (e.key === 'Escape') { if (UI.placing) { UI.cancelPlace(); I.lineStart = null; } else if (I.mode) I.setMode(null); else if (UI.sel.size) UI.select([]); else R.App.pauseMenu(); return; }
    if (e.key === 'Enter' && g.mode === 'online') { R.$('#chatIn').focus(); e.preventDefault(); return; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); UI.setGroup(n); }
      else if (!UI.sel.size || UI.myIds().length) UI.selectGroup(n);
      else { // 건물 메뉴 단축키
        const k = R.BUILD_MENU[UI.tab].keys[n - 1]; if (k) UI.startPlace(k);
      }
      return;
    }
    if (e.code === 'KeyA' && UI.myIds().length) { I.setMode('amove'); return; }
    if (e.code === 'KeyS' && UI.myIds().length) { R.App.cmd({ c: 'stop', ids: UI.myIds() }); return; }
    if (e.code === 'KeyF' && UI.myIds().length) { const ids = UI.myIds(); const f = g.ents[ids[0]].form === 'col' ? 'line' : 'col'; R.App.cmd({ c: 'form', ids, f }); setTimeout(() => UI.updatePanel(true), 60); return; }
    if (e.code === 'KeyB') { UI.select([]); return; }
    if (e.code === 'KeyP' && g.mode !== 'online') { R.App.togglePause(); return; }
    if (e.code === 'Space') { e.preventDefault(); const b = g.ents[g.players[UI.me].baseId]; if (b) rd().centerOn(b.x + 2, b.y + 2); return; }
    if (e.code === 'Tab') { e.preventDefault(); UI.tab = (UI.tab + 1) % 3; UI.updatePanel(true); }
  }

  // 매 프레임: 키보드/가장자리 스크롤
  I.update = function (dt) {
    if (!G()) return;
    const cam = rd().cam; let vx = 0, vy = 0;
    const k = I.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) vy -= 1;
    if (k.has('KeyS') && !R.UI.myIds().length || k.has('ArrowDown')) vy += 1;
    if (k.has('KeyA') && !R.UI.myIds().length && I.mode !== 'amove' || k.has('ArrowLeft')) vx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) vx += 1;
    if (I.inside && !R.isMobile() && document.hasFocus() && !I.ptrs.size) {
      const m = 6;
      if (I.mx >= 0 && I.mx < m) vx -= 1; if (I.mx > rd().W - m) vx += 1;
      if (I.my >= 0 && I.my < m) vy -= 1; if (I.my > rd().H - m) vy += 1;
    }
    if (vx || vy) { const sp = 700 / cam.zoom; cam.x += vx * sp * dt; cam.y += vy * sp * dt; rd().clampCam(); I.camMoved = (I.camMoved || 0) + 1; }
  };
})();
