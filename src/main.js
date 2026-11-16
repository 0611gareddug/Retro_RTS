'use strict';
/* Retro RTS — 앱 흐름 · 게임 루프 · 저장 · 도전과제 */
(function () {
  const U = R.U, B = R.B;
  const $ = R.$, $$ = R.$$;
  const App = { G: null, me: 0, acc: 0, last: 0, battleT: -99, uiT: 0, mmT: 0, saveT: 0 };
  R.App = App;

  App.boot = function () {
    R.Audio.init();
    R.UI.init();
    App.cv = $('#cv');
    App.rd = new R.Renderer(App.cv);
    App.mm = new R.Minimap($('#mm'));
    R.Input.init(App.cv);
    R.UI.bindPanel();
    R.UI.applySettings();
    App.bindMenus();
    addEventListener('resize', () => { R.UI.applySettings(); App.checkRotate(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && App.G && !App.G.over && App.G.mode !== 'online' && App.G.mode !== 'tutorial') App.save(true); });
    App.toMenu();
    App.last = performance.now();
    requestAnimationFrame(App.frame);
  };

  App.checkRotate = function () {
    const r = $('#rotate');
    const show = R.isMobile() && innerHeight > innerWidth && App.G;
    r.classList.toggle('hidden', !show);
    clearTimeout(App._rotT); if (show) App._rotT = setTimeout(() => r.classList.add('hidden'), 4000);
  };

  App.toMenu = function () {
    App.G = null; R.UI.G = null; R.UI.leaveGame(); if (R.Tut) R.Tut.stop();
    $('#bContinue').classList.toggle('hidden', !R.store.get('save', null));
    R.UI.show('scMenu'); R.Audio.play('menu');
    App.checkRotate();
  };

  // ── 메뉴 바인딩 ──
  App.bindMenus = function () {
    document.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]'); if (go) { R.Audio.sfx('click'); App.go(go.dataset.go); return; }
      const back = e.target.closest('[data-back]'); if (back) {
        R.Audio.sfx('click');
        if (R.UI.backTo === 'pause') { $('#scSettings').classList.add('hidden'); $('#scSettings').classList.remove('overlay'); $('#scHelp').classList.add('hidden'); $('#scHelp').classList.remove('overlay'); R.UI.backTo = null; App.pauseMenu(); return; }
        if (R.Net && R.Net.active && back.closest('#scOnline')) R.Net.leave();
        R.UI.show('scMenu');
      }
    });
    $('#bStart').onclick = () => App.startFromSetup();
    $('#bMenu').onclick = () => App.pauseMenu();
    $('#bResume').onclick = () => App.resume();
    $('#bSave').onclick = () => { App.save(); App.resume(); };
    $('#bPauseSet').onclick = () => R.UI.openSettings('pause');
    $('#bPauseHelp').onclick = () => { $('#helpBody').innerHTML = R.UI.helpHTML(); R.UI.overlay('scPause', false); R.UI.backTo = 'pause'; $('#scHelp').classList.add('overlay'); $('#scHelp').classList.remove('hidden'); };
    $('#bQuit').onclick = async () => {
      const online = App.G && App.G.mode === 'online';
      if (await R.UI.confirm(online ? '대전에서 나갈까요?' : '메인 메뉴로 갈까요? (저장하지 않은 진행은 사라져요)')) {
        R.UI.overlay('scPause', false);
        if (online) R.Net.leave();
        App.toMenu();
      }
    };
    $('#bResMenu').onclick = () => { if (R.Net && R.Net.active) R.Net.leave(); App.toMenu(); };
    $('#bSpeed').onclick = () => { if (!App.G || App.G.mode === 'online') return; App.G.speed = App.G.speed === 1 ? 2 : 1; R.UI.updateHUD(); };
    $('#bAtkAll').onclick = () => App.armyAll(true);
    $('#bDefAll').onclick = () => App.armyAll(false);
    $('#bMore').onclick = () => { const m = $('#sideMore'); m.classList.toggle('hidden'); const open = !m.classList.contains('hidden'); $('#bMore').classList.toggle('on', open); $('#bMore').textContent = open ? '접기' : '더보기'; requestAnimationFrame(R.UI.measure); };
    $('#bBuild').onclick = () => R.UI.toggleBuild();
    $('#bEraUp').onclick = () => App.cmd({ c: 'era' });
    $('#bFull').onclick = () => App.fullscreen();
    $('#bChat').onclick = () => { $('#chat').classList.toggle('hidden'); };
    $('#bPlaceOk').onclick = () => { R.UI.confirmPlace(); R.Input.lineStart = null; };
    $('#bPlaceNo').onclick = () => { R.UI.cancelPlace(); R.Input.lineStart = null; };
    $('#bSelMode').onclick = () => { R.UI.selMode = !R.UI.selMode; $('#bSelMode').classList.toggle('on', R.UI.selMode); R.UI.toast(R.UI.selMode ? '드래그로 여러 부대를 선택해요' : '드래그로 화면을 움직여요', '', 1200); };
    $('#bSelArmy').onclick = () => { const ids = App.G.squads().filter((s) => s.owner === App.me && s.u !== 'builder').map((s) => s.id); R.UI.select(ids); };
    $('#bHome').onclick = () => { const b = App.G.ents[App.G.players[App.me].baseId]; if (b) App.rd.centerOn(b.x + 2, b.y + 2); };
    $('#tutSkip').onclick = () => { if (R.Tut) R.Tut.stop(); App.toMenu(); };
  };

  // 전군 공격(가장 가까운 적 본성으로 공격 이동) / 전군 방어(내 본성 앞으로 집결)
  App.armyAll = function (attack) {
    const G = App.G; if (!G) return;
    const pl = G.players[App.me];
    const ids = G.squads().filter((s) => s.owner === App.me && s.u !== 'builder' && !s.rout).map((s) => s.id);
    if (!ids.length) { R.UI.toast('아직 부대가 없어요. 병영 같은 소환시설에서 부대를 뽑으세요', 'err', 2200); R.Audio.sfx('error'); return; }
    const base = G.ents[pl.baseId]; if (!base) return;
    let x, y;
    if (attack) {
      let best = null, bd = 1e9;
      for (const o of G.players) {
        if (!o.alive || o.team === pl.team) continue;
        const eb = G.ents[o.baseId]; if (!eb) continue;
        const d = R.dist(eb.x, eb.y, base.x, base.y); if (d < bd) { bd = d; best = eb; }
      }
      if (!best) return;
      x = best.x + best.s / 2; y = best.y + best.s / 2;
    } else { x = base.x + 2 + pl.fwd.x * 5; y = base.y + 2 + pl.fwd.y * 5; }
    App.cmd({ c: 'move', ids, x, y, am: true });
    App.rd.marks.push({ x, y, t: 1.2, c: attack ? '#ff5a4a' : '#7ab0ff' });
    R.UI.toast(attack ? '전군 공격! 모든 부대가 적 본성으로 진격해요' : '전군 방어! 모든 부대가 본성 앞으로 모여요', attack ? 'alert' : 'good', 1800);
    R.Audio.sfx('click');
  };

  App.fullscreen = function () {
    const d = document, el = d.documentElement;
    const isFs = d.fullscreenElement || d.webkitFullscreenElement;
    try {
      if (isFs) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) { R.UI.toast('이 브라우저는 전체화면 버튼을 지원하지 않아요. 홈 화면에 추가하면 전체화면으로 실행돼요.', 'err', 4000); return; }
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && p.then) p.then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {});
    } catch (e) { R.UI.toast('전체화면을 열 수 없어요', 'err'); }
  };

  App.go = function (where) {
    const UI = R.UI;
    switch (where) {
      case 'ai': case 'sandbox': App.setup(where); break;
      case 'tutorial': App.startTutorial(); break;
      case 'online': R.Net.openScreen(); break;
      case 'continue': App.load(); break;
      case 'ach': UI.showAch(); break;
      case 'settings': UI.openSettings('menu'); break;
      case 'help': $('#helpBody').innerHTML = UI.helpHTML(); UI.backTo = null; UI.show('scHelp'); break;
    }
  };

  // ── 게임 설정 화면 ──
  App.setup = function (mode) {
    const UI = R.UI;
    const prof = R.store.get('profile', { name: '', color: 0 });
    App.setupState = { mode, map: prof.map || 'plains', diff: prof.diff != null ? prof.diff : 3, color: prof.color || 0 };
    $('#setupTitle').textContent = mode === 'ai' ? 'AI 대전 (1:1)' : '샌드박스';
    $('#inName').value = prof.name || '';
    $('#diffRow').style.display = mode === 'ai' ? '' : 'none';
    App.renderSetup();
    UI.show('scSetup');
  };
  App.renderSetup = function () {
    const st = App.setupState;
    const cp = $('#colorPick'); cp.innerHTML = '';
    R.COLORS.forEach((c, i) => { const b = document.createElement('button'); b.style.background = c.c; b.title = c.name; if (st.color === i) b.classList.add('on'); b.onclick = () => { st.color = i; App.renderSetup(); }; cp.appendChild(b); });
    const mp = $('#mapPick'); mp.innerHTML = '';
    for (const m of R.MAPS) {
      const b = document.createElement('button'); if (st.map === m.id) b.classList.add('on');
      b.appendChild(App.preview(m.id, 2)); b.insertAdjacentHTML('beforeend', `<b>${m.name}</b><small>${m.desc}</small>`);
      b.onclick = () => { st.map = m.id; App.renderSetup(); }; mp.appendChild(b);
    }
    const dp = $('#diffPick'); dp.innerHTML = '';
    R.DIFF_ORDER.forEach((i) => { const d = R.DIFF[i]; const b = document.createElement('button'); b.className = 'btn' + (st.diff === i ? ' on' : ''); b.textContent = d.name; b.onclick = () => { st.diff = i; App.renderSetup(); }; dp.appendChild(b); });
  };
  App._prev = {};
  App.preview = function (id, n) { const k = id + n; if (!App._prev[k]) App._prev[k] = R.UI.mapPreview(id, n); const c = document.createElement('canvas'); c.width = 128; c.height = 64; c.getContext('2d').drawImage(App._prev[k], 0, 0); return c; };

  App.startFromSetup = function () {
    const st = App.setupState;
    const name = ($('#inName').value || '').trim() || '플레이어';
    R.store.set('profile', { name, color: st.color, map: st.map, diff: st.diff });
    const ec = (st.color + 1) % R.COLORS.length === st.color ? 0 : [1, 0, 3, 2, 5, 4, 7, 6][st.color];
    const aiNames = ['검은 남작', '붉은 공작', '푸른 백작', '황금 왕', '은빛 기사단', '늑대 군주'];
    const players = [{ name, color: st.color, team: 0 }, { name: aiNames[(Math.random() * aiNames.length) | 0], color: ec, team: 1, ai: true }];
    const opts = { mode: st.mode, map: st.map, players, diff: st.diff };
    if (st.mode === 'sandbox') opts.sandbox = { infMoney: true, ai: false };
    App.start(new R.Game(opts), 0);
  };

  App.start = function (G, me) {
    App.G = G; App.me = me; App.acc = 0; App.battleT = -99; App.overShown = false;
    App.rd.setGame(G, me); App.mm.setGame(G, App.rd);
    R.UI.enterGame(G, me);
    R.UI.applySettings();
    R.Audio.play('peace');
    App.checkRotate();
    const p = G.players[me];
    if (G.mode === 'ai') { const e = G.players.find((x) => x.isAI); R.UI.toast(`${e.name}(${R.DIFF[G.diff].name})와의 전투가 시작됐어요!`, 'big', 3000); if (R.DIFF[G.diff].passive) R.UI.toast('먼저 공격하기 전까지 AI는 공격해 오지 않아요', 'good', 4500); }
    App.lastAch = { imperial: false };
    void p;
  };

  App.pauseMenu = function () {
    if (!App.G) return;
    if (App.G.mode !== 'online') App.G.paused = true;
    $('#bSave').style.display = App.G.mode === 'online' || App.G.mode === 'tutorial' ? 'none' : '';
    R.UI.overlay('scPause', true);
  };
  App.resume = function () { R.UI.overlay('scPause', false); if (App.G && App.G.mode !== 'online') App.G.paused = false; };
  App.togglePause = function () { if (!App.G || App.G.mode === 'online') return; App.G.paused = !App.G.paused; R.UI.updateHUD(); R.UI.toast(App.G.paused ? '일시정지 (명령은 내릴 수 있어요)' : '계속', '', 1200); };

  // 명령 실행 (온라인이면 전송)
  App.cmd = function (c) {
    const G = App.G; if (!G) return false;
    c.p = App.me;
    if (G.mode === 'online' && !R.Net.isHost) { R.Net.sendCmd(c); return true; }
    const r = G.exec(c);
    if (typeof r === 'string') { R.UI.toast(r, 'err'); R.Audio.sfx('error'); return r; }
    if (r === true && (c.c === 'train' || c.c === 'levelup' || c.c === 'era')) R.Audio.sfx('coin');
    if (c.c === 'era' && r === true) R.UI.toast(R.ERAS[G.players[App.me].era + 1].name + ' 시대로 발전을 시작했어요', 'good');
    R.UI.updatePanel(true);
    return r;
  };
  App.sendChat = function (msg) {
    msg = (msg || '').trim(); if (!msg || !R.Net.active) return;
    R.Net.chat(msg);
  };

  // ── 루프 ──
  App.frame = function (now) {
    requestAnimationFrame(App.frame);
    let dt = (now - App.last) / 1000; App.last = now;
    if (dt > 0.25) dt = 0.25;
    const G = App.G;
    if (!G) return;
    R.Input.update(dt);
    let alpha = 1;
    if (G.mode === 'online' && !R.Net.isHost) {
      alpha = R.Net.alpha();
      if (G.ev.length) { App.handleEvents(G.ev); G.ev = []; }
    } else if (!G.paused && !G.over) {
      App.acc += dt * G.speed;
      let n = 0;
      while (App.acc >= R.SIM_DT && n < 8) {
        G.update(R.SIM_DT); App.acc -= R.SIM_DT; n++;
        if (G.ev.length) { const ev = G.ev; G.ev = []; App.handleEvents(ev); if (R.Net.isHost) R.Net.pushEvents(ev); }
      }
      if (n >= 8) App.acc = 0;
      alpha = App.acc / R.SIM_DT;
      if (R.Net.isHost) R.Net.tick(dt);
    } else if (G.over && G.ev.length) { const ev = G.ev; G.ev = []; App.handleEvents(ev); }
    App.rd.draw(dt, alpha);
    App.uiT -= dt; App.mmT -= dt;
    if (App.uiT <= 0) { App.uiT = 0.2; R.UI.updateHUD(); R.UI.updatePanel(); App.music(); if (R.Tut) R.Tut.check(); }
    if (App.mmT <= 0) { App.mmT = 0.25; App.mm.draw(); }
    if (G.over && !App.overShown) {
      App.overShown = true;
      setTimeout(() => App.finish(), 2200);
    }
    // 자동 저장
    if (G.mode !== 'online' && G.mode !== 'tutorial' && !G.over) { App.saveT += dt; if (App.saveT > 60) { App.saveT = 0; App.save(true); } }
  };

  App.music = function () {
    const G = App.G; if (!G || G.over) return;
    let fight = false;
    for (const s of G.squads()) if (s.owner === App.me && G.time - s.lastCombat < 6) { fight = true; break; }
    if (!fight) for (const b of G.buildings()) if (b.owner === App.me && G.time - b.lastHit < 6) { fight = true; break; }
    if (fight) App.battleT = G.time;
    R.Audio.play(G.time - App.battleT < 14 ? 'battle' : 'peace');
  };

  // 이벤트 → 소리 · 알림
  App.handleEvents = function (evs) {
    const rd = App.rd, G = App.G, me = App.me;
    rd.onEvents(evs);
    const vol = (x, y) => { const s = rd.t2s(x, y); const dx = Math.max(0, Math.abs(s.x - rd.W / 2) - rd.W / 2), dy = Math.max(0, Math.abs(s.y - rd.H / 2) - rd.H / 2); const d = Math.hypot(dx, dy); return d > 400 ? 0 : (1 - d / 400) * Math.min(1, rd.cam.zoom / 1.5); };
    for (const e of evs) {
      switch (e.e) {
        case 'hit': { const v = vol(e.x, e.y); if (v > 0.05) R.Audio.sfx(e.k === 'arrow' ? 'arrow' : 'clash', v); break; }
        case 'proj': { const v = vol(e.x0, e.y0); if (v > 0.05 && (e.k === 'rock' || e.k === 'boulder')) R.Audio.sfx('boom', v * 0.5); break; }
        case 'boom': { const v = vol(e.x, e.y); if (v > 0.05) R.Audio.sfx('boom', v); break; }
        case 'charge': { const v = vol(e.x, e.y); if (v > 0.05) R.Audio.sfx('horse', v); break; }
        case 'collapse': { const v = vol(e.x, e.y); if (v > 0.05 && !e.quiet) R.Audio.sfx('collapse', v); break; }
        case 'die': { const v = vol(e.x, e.y); if (v > 0.2) R.Audio.sfx('die', v * 0.6); break; }
        case 'built': if (e.p === me) { R.Audio.sfx('build'); if (B[e.type] && !B[e.type].line) R.UI.toast(B[e.type].name + ' 완성', 'good', 1400); } break;
        case 'trained': if (e.p === me) R.Audio.sfx('train'); break;
        case 'lvup': if (e.p === me) R.Audio.sfx('lvup'); break;
        case 'era':
          if (e.p === me) { R.Audio.sfx('horn'); R.UI.toast(R.ERAS[e.era].name + ' 시대에 도달했어요!', 'big', 3000); if (e.era === 3) App.unlock('imperial'); }
          else if (G.players[e.p].team !== G.players[me].team) R.UI.toast(G.players[e.p].name + '이(가) ' + R.ERAS[e.era].name + ' 시대에 도달했어요', '', 2200);
          break;
        case 'alert': if (e.p === me) { R.UI.toast(e.msg, 'alert'); if (!e.minor) R.Audio.sfx('alert'); } break;
        case 'village':
          if (e.p === me) { R.UI.toast('중립 마을을 점령했어요! (+' + R.VILLAGE_INC + '/초)', 'good'); R.Audio.sfx('coin'); }
          else if (e.prev === me) { R.UI.toast('마을을 빼앗겼어요!', 'alert'); R.Audio.sfx('alert'); }
          break;
        case 'elim': R.UI.toast(G.players[e.p].name + ' 탈락!', 'big', 3000); R.Audio.sfx('horn'); if (G.mode === 'online' && R.Net) R.UI.chat('', 0, G.players[e.p].name + ' 탈락', true); break;
        case 'over': R.Audio.sfx('horn'); break;
        case 'rout': if (e.p === me && Math.random() < 0.5) R.UI.toast('부대가 도주하고 있어요!', 'alert', 1500); break;
      }
    }
  };

  // ── 종료 · 도전과제 ──
  App.finish = function () {
    const G = App.G; if (!G) return;
    const me = App.me, pl = G.players[me];
    const won = G.over.team === pl.team;
    const newAch = [];
    if (G.mode !== 'tutorial' && G.mode !== 'sandbox') {
      const st = R.store.get('stats', { wins: 0, losses: 0, maps: [], walls: 0 });
      if (won) st.wins++; else st.losses++;
      st.walls += pl.st.walls;
      if (won && !st.maps.includes(G.mapId)) st.maps.push(G.mapId);
      R.store.set('stats', st);
      const base = G.ents[pl.baseId];
      const chk = (id, cond) => { if (cond) { const a = App.unlock(id, true); if (a) newAch.push(a); } };
      if (won) {
        chk('firstWin', G.mode === 'ai');
        chk('chivalry', pl.st.anySquad && pl.st.cavOnly);
        chk('ironwall', base && base.hp >= base.maxHp * 0.5);
        chk('blitz', G.time <= 600);
        chk('undying', !pl.st.genDied && pl.st.hadGen);
        chk('rebel', pl.st.anySquad && pl.st.tribalOnly);
        chk('conqueror', G.mode === 'ai' && G.diff === 2);
        chk('cartographer', st.maps.length >= 4);
        chk('comrade', G.mode === 'online' && G.players.length === 4 && G.players.filter((p) => p.team === pl.team).length === 2);
      }
      chk('landlord', pl.st.villagesMax >= G.villages.length);
      chk('spearwall', pl.st.spearCav >= 10);
      chk('siegemaster', pl.st.trebBld >= 5);
      chk('tycoon', pl.st.earned >= 20000);
      chk('mason', st.walls >= 100);
      chk('imperial', pl.era >= 3);
    }
    if (G.mode !== 'online') R.store.del('save');
    R.UI.leaveGame();
    R.Audio.play('menu');
    R.UI.showResult(G, me, newAch);
    if (R.Tut && G.mode === 'tutorial') R.Tut.stop();
  };
  App.unlock = function (id, silent) {
    const got = R.store.get('ach', {}); if (got[id]) return null;
    const d = new Date(); got[id] = d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate(); R.store.set('ach', got);
    const a = R.ACH.find((x) => x.id === id);
    if (!silent && a) { R.UI.toast('도전과제 달성: ' + a.name, 'big', 3000); R.Audio.sfx('lvup'); }
    return a;
  };

  // ── 저장 ──
  App.save = function (quiet) {
    const G = App.G; if (!G || G.mode === 'online' || G.mode === 'tutorial' || G.over) return;
    try {
      R.store.set('save', { g: G.serialize(), me: App.me, cam: App.rd.cam, groups: R.UI.groups, date: Date.now() });
      if (!quiet) R.UI.toast('저장했어요', 'good');
    } catch (e) { if (!quiet) R.UI.toast('저장 공간이 부족해요', 'err'); }
  };
  App.load = function () {
    const s = R.store.get('save', null); if (!s) return;
    try {
      const G = R.Game.load(s.g);
      App.start(G, s.me);
      if (s.cam) Object.assign(App.rd.cam, s.cam);
      R.UI.groups = s.groups || {}; R.UI.renderGroups();
      R.UI.toast('저장된 게임을 불러왔어요', 'good');
    } catch (e) { R.UI.toast('저장 파일을 불러오지 못했어요', 'err'); R.store.del('save'); App.toMenu(); }
  };

  // ── 튜토리얼 ──
  App.startTutorial = function () {
    const prof = R.store.get('profile', { name: '', color: 0 });
    const G = new R.Game({ mode: 'tutorial', map: 'plains', players: [{ name: prof.name || '플레이어', color: prof.color || 0, team: 0 }, { name: '훈련용 성', color: prof.color === 1 ? 0 : 1, team: 1 }], diff: 0 });
    G.players[0].money = 2500;
    // 적 본성 약하게
    const eb = G.ents[G.players[1].baseId]; eb.maxHp = 1200; eb.hp = 1200;
    for (const s of G.squads()) if (s.owner === 1 && s.u !== 'builder') G.removeEnt(s);
    App.start(G, 0);
    R.Tut.start(G);
  };

  addEventListener('DOMContentLoaded', () => { try { App.boot(); } catch (e) { console.error(e); document.body.insertAdjacentHTML('beforeend', '<div id="block">게임을 시작하지 못했어요: ' + R.esc(e.message) + '</div>'); } });
})();
