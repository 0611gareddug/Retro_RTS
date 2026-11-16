'use strict';
/* Retro RTS — 온라인 대전 (WebRTC P2P, 방 코드) */
(function () {
  const $ = R.$;
  const PEER_JS = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const PREFIX = 'retrorts-v1-';
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const N = { active: false, isHost: false, conns: new Map(), lobby: null, snapT: 0, bldT: 0, evBuf: [], lastSnap: 0, snapGap: 100 };
  R.Net = N;

  function loadLib() {
    if (window.Peer) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = PEER_JS; s.onload = () => res(); s.onerror = () => rej(new Error('lib'));
      document.head.appendChild(s);
    });
  }
  const profile = () => R.store.get('profile', { name: '', color: 0 });

  N.openScreen = function () {
    const p = profile();
    $('#onName').value = p.name || '';
    N.myColor = p.color || 0;
    renderColors();
    $('#onJoin').classList.remove('hidden'); $('#onLobby').classList.add('hidden'); $('#onBack').classList.remove('hidden');
    $('#bHost').onclick = () => N.host();
    $('#bJoin').onclick = () => N.join(($('#onCode').value || '').toUpperCase().trim());
    $('#bLeave').onclick = () => { N.leave(); N.openScreen(); };
    $('#bLobStart').onclick = () => N.startGame();
    $('#lobIn').onkeydown = (e) => { if (e.key === 'Enter') { N.chat(e.target.value); e.target.value = ''; } };
    R.UI.show('scOnline');
  };
  function renderColors() {
    const cp = $('#onColor'); cp.innerHTML = '';
    R.COLORS.forEach((c, i) => { const b = document.createElement('button'); b.style.background = c.c; if (N.myColor === i) b.classList.add('on'); b.onclick = () => { N.myColor = i; renderColors(); }; cp.appendChild(b); });
  }
  function myName() { const n = ($('#onName').value || '').trim() || '플레이어'; R.store.set('profile', Object.assign(profile(), { name: n, color: N.myColor })); return n; }
  function loading(t) { if (t) { $('#ldText').textContent = t; R.UI.overlay('scLoading', true); } else R.UI.overlay('scLoading', false); }

  // ── 방장 ──
  N.host = async function () {
    const name = myName();
    loading('방을 만드는 중...');
    try { await loadLib(); } catch (e) { loading(); R.UI.toast('온라인 서버에 연결할 수 없어요. 인터넷 연결을 확인하세요.', 'err', 4000); return; }
    const tryOpen = (n) => {
      const code = Array.from({ length: 6 }, () => ALPHA[(Math.random() * ALPHA.length) | 0]).join('');
      const peer = new window.Peer(PREFIX + code, { debug: 0 });
      peer.on('open', () => {
        loading();
        N.peer = peer; N.active = true; N.isHost = true; N.code = code; N.conns.clear();
        N.lobby = { code, map: 'plains', team: 'ffa', players: [{ pid: 'host', name, color: N.myColor }] };
        showLobby();
      });
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id' && n < 3) { peer.destroy(); tryOpen(n + 1); return; }
        if (!N.active) { loading(); R.UI.toast('방을 만들 수 없어요 (' + err.type + ')', 'err', 4000); }
      });
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          if (N.G || N.lobby.players.length >= 4) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
          N.conns.set(conn.peer, conn);
        });
        conn.on('data', (d) => hostRecv(conn, d));
        conn.on('close', () => hostDrop(conn));
        conn.on('error', () => hostDrop(conn));
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* 무시 */ } });
    };
    tryOpen(0);
  };
  function hostRecv(conn, d) {
    if (!d || typeof d !== 'object') return;
    const L = N.lobby;
    if (d.t === 'hello') {
      if (N.G || L.players.length >= 4) { try { conn.send({ t: 'full' }); } catch (e) { /* 무시 */ } return; }
      if (L.players.some((p) => p.pid === conn.peer)) return;
      N.conns.set(conn.peer, conn);
      let color = d.color | 0; const used = L.players.map((p) => p.color);
      if (used.includes(color)) color = [...Array(8).keys()].find((c) => !used.includes(c));
      L.players.push({ pid: conn.peer, name: String(d.name || '플레이어').slice(0, 10), color });
      R.UI.chat('', 0, L.players[L.players.length - 1].name + ' 입장', true);
      broadcastLobby();
    } else if (d.t === 'chat') {
      const p = L.players.find((x) => x.pid === conn.peer); if (!p) return;
      const msg = String(d.msg || '').slice(0, 80);
      R.UI.chat(p.name, p.color, msg); broadcast({ t: 'chat', name: p.name, color: p.color, msg });
    } else if (d.t === 'cmd' && N.G) {
      const slot = N.slots[conn.peer]; if (slot == null) return;
      const c = d.c; if (!c || typeof c !== 'object') return;
      c.p = slot;
      const r = N.G.exec(c);
      if (typeof r === 'string') conn.send({ t: 'err', msg: r });
    } else if (d.t === 'color' && !N.G) {
      const p = L.players.find((x) => x.pid === conn.peer); if (!p) return;
      const used = L.players.filter((x) => x !== p).map((x) => x.color);
      if (!used.includes(d.color | 0)) { p.color = d.color | 0; broadcastLobby(); }
    }
  }
  function hostDrop(conn) {
    if (!N.conns.has(conn.peer)) return;
    N.conns.delete(conn.peer);
    const L = N.lobby; if (!L) return;
    const p = L.players.find((x) => x.pid === conn.peer);
    if (p) { R.UI.chat('', 0, p.name + ' 연결 끊김', true); if (N.G) R.UI.toast(p.name + '의 연결이 끊겼어요', 'alert'); }
    if (!N.G) { L.players = L.players.filter((x) => x.pid !== conn.peer); broadcastLobby(); }
  }
  function broadcast(m) { for (const c of N.conns.values()) { try { if (c.open) c.send(m); } catch (e) { /* 무시 */ } } }
  function broadcastLobby() { renderLobby(); broadcast({ t: 'lobby', lobby: N.lobby }); }

  N.startGame = function () {
    if (!N.isHost) return;
    const L = N.lobby;
    if (L.players.length < 2) { R.UI.toast('2명 이상 모여야 시작할 수 있어요', 'err'); return; }
    if (L.team === '2v2' && L.players.length !== 4) { R.UI.toast('2:2 팀전은 4명이 필요해요', 'err'); return; }
    const players = L.players.map((p, i) => ({ name: p.name, color: p.color, team: L.team === '2v2' ? (i < 2 ? 0 : 1) : i }));
    const opts = { mode: 'online', map: L.map, players };
    N.slots = {}; L.players.forEach((p, i) => { N.slots[p.pid] = i; });
    for (const [pid, c] of N.conns) { try { c.send({ t: 'start', opts, slot: N.slots[pid] }); } catch (e) { /* 무시 */ } }
    const G = new R.Game(opts); N.G = G; N.snapT = 0; N.bldT = 0; N.evBuf = [];
    R.App.start(G, 0);
  };

  // 매 프레임 (방장)
  N.pushEvents = function (ev) {
    for (const e of ev) {
      if (e.e === 'die' || e.e === 'squadDead') continue;
      if (e.e === 'hit' && Math.random() < 0.5) continue;
      N.evBuf.push(e);
    }
    if (N.evBuf.length > 300) N.evBuf.splice(0, N.evBuf.length - 300);
  };
  N.tick = function (dt) {
    if (!N.isHost || !N.G || !N.conns.size) return;
    N.snapT -= dt; N.bldT -= dt;
    if (N.snapT > 0) return;
    N.snapT = 0.1;
    const G = N.G;
    const r1 = (v) => Math.round(v * 100) / 100;
    const snap = { t: 's', tm: r1(G.time), ev: N.evBuf, over: G.over };
    N.evBuf = [];
    snap.pl = G.players.map((p) => [Math.floor(p.money), r1(p.inc), p.era, p.eraProg ? [r1(p.eraProg.t), p.eraProg.need] : 0, p.alive ? 1 : 0, p.genAlive ? 1 : 0, r1(p.genCD), p.atkBuff || 0]);
    if (G.over || (G.tick % 40) < 2) snap.st = G.players.map((p) => p.st);
    snap.sq = G.squads().map((s) => {
      let mask = 0; for (let i = 0; i < s.hp.length; i++) if (s.hp[i] > 0) mask |= 1 << i;
      const d = R.U[s.u]; let hp = 0; for (const v of s.hp) hp += v;
      const fl = (s.rout ? 1 : 0) | (s.moving ? 2 : 0) | (s.onWall ? 4 : 0) | (s.working ? 8 : 0) | (s.atkAnim && G.time - s.atkAnim < 0.3 ? 16 : 0) | (s.buffA > G.time ? 32 : 0) | (s.buffD > G.time ? 64 : 0) | (s.form === 'col' ? 128 : 0);
      return [s.id, s.u, s.owner, r1(s.x), r1(s.y), r1(s.dir), mask, Math.round(s.morale), fl, Math.round(hp / (d.hp * d.n) * 1000), s.dep != null ? r1(s.dep) : -1, s.kills || 0, r1(s.cdC || 0), r1(s.cdD || 0)];
    });
    if (N.bldT <= 0 || G.terrVer !== N.lastTerr) {
      N.bldT = 0.5; N.lastTerr = G.terrVer;
      snap.b = G.buildings().map((b) => [b.id, b.type, b.owner, b.x, b.y, Math.round(b.hp), Math.round(b.maxHp), b.lv, r1(b.built), b.queue.map((q) => [q.u, r1(q.t)]), b.lvProg ? [r1(b.lvProg.t), b.lvProg.need] : 0, b.rally ? [r1(b.rally.x), r1(b.rally.y)] : 0, b.workers || 0, r1(b.lastHit)]);
      snap.v = G.villages.map((id) => { const v = G.ents[id]; return [v.id, v.owner, r1(v.prog), v.capP]; });
    }
    broadcast(snap);
  };

  // ── 참가자 ──
  N.join = async function (code) {
    if (!/^[A-Z0-9]{6}$/.test(code)) { R.UI.toast('방 코드 6자리를 입력하세요', 'err'); return; }
    const name = myName();
    loading('방에 들어가는 중...');
    try { await loadLib(); } catch (e) { loading(); R.UI.toast('온라인 서버에 연결할 수 없어요', 'err', 4000); return; }
    const peer = new window.Peer({ debug: 0 });
    const fail = (m) => { loading(); R.UI.toast(m, 'err', 4000); try { peer.destroy(); } catch (e) { /* 무시 */ } };
    const to = setTimeout(() => fail('방을 찾을 수 없어요. 코드를 확인하세요.'), 12000);
    peer.on('error', (err) => { clearTimeout(to); if (!N.active) fail(err.type === 'peer-unavailable' ? '방을 찾을 수 없어요. 코드를 확인하세요.' : '연결 오류 (' + err.type + ')'); });
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => {
        clearTimeout(to); loading();
        N.peer = peer; N.conn = conn; N.active = true; N.isHost = false; N.code = code;
        conn.send({ t: 'hello', name, color: N.myColor });
      });
      conn.on('data', (d) => clientRecv(d));
      conn.on('close', () => {
        if (!N.active) return;
        N.active = false;
        if (R.App.G && R.App.G.mode === 'online' && !R.App.G.over) { R.UI.toast('방장과 연결이 끊겼어요', 'err', 4000); setTimeout(() => R.App.toMenu(), 2500); }
        else { R.UI.toast('방이 닫혔어요', 'err'); N.openScreen(); }
      });
    });
  };
  function clientRecv(d) {
    if (!d || typeof d !== 'object') return;
    switch (d.t) {
      case 'full': R.UI.toast('방이 가득 찼거나 이미 시작했어요', 'err', 4000); N.leave(); break;
      case 'lobby': N.lobby = d.lobby; showLobby(); break;
      case 'chat': R.UI.chat(d.name, d.color, d.msg); break;
      case 'err': R.UI.toast(d.msg, 'err'); R.Audio.sfx('error'); break;
      case 'start': {
        const G = new R.Game(d.opts); N.G = G; N.lastSnap = performance.now();
        R.App.start(G, d.slot);
        break;
      }
      case 's': if (N.G) applySnap(d); break;
    }
  }
  function applySnap(s) {
    const G = N.G; const now = performance.now();
    N.snapGap = R.clamp(now - N.lastSnap, 60, 250); N.lastSnap = now;
    G.time = s.tm;
    s.pl.forEach((a, i) => { const p = G.players[i]; p.money = a[0]; p.inc = a[1]; p.era = a[2]; p.eraProg = a[3] ? { t: a[3][0], need: a[3][1] } : null; p.alive = !!a[4]; p.genAlive = !!a[5]; p.genCD = a[6]; p.atkBuff = a[7]; });
    if (s.st) s.st.forEach((st, i) => { G.players[i].st = st; });
    // 부대
    const seen = new Set();
    for (const a of s.sq) {
      const [id, u, owner, x, y, dir, mask, morale, fl, hpk, dep, kills, cdC, cdD] = a;
      seen.add(id);
      let e = G.ents[id];
      const d = R.U[u];
      if (!e) { e = { id, k: 's', u, owner, x, y, px: x, py: y, dir, hp: new Array(d.n).fill(d.hp), alive: d.n, morale, form: 'line', path: null, lastCombat: -99, buffA: 0, buffD: 0 }; G.ents[id] = e; }
      else { e.px = e.x; e.py = e.y; }
      e.x = x; e.y = y; e.dir = dir; e.morale = morale; e.rout = !!(fl & 1); e.moving = !!(fl & 2); e.onWall = fl & 4 ? 1 : 0; e.working = !!(fl & 8);
      if (fl & 16) { e.atkAnim = G.time; e.lastCombat = G.time; }
      e.buffA = fl & 32 ? G.time + 1 : 0; e.buffD = fl & 64 ? G.time + 1 : 0; e.form = fl & 128 ? 'col' : 'line';
      let alive = 0; const per = d.hp * hpk / 1000;
      for (let i = 0; i < d.n; i++) { const al = (mask >> i) & 1; alive += al; }
      for (let i = 0; i < d.n; i++) e.hp[i] = (mask >> i) & 1 ? Math.max(0.01, per * d.n / Math.max(1, alive)) : 0;
      e.alive = alive; e.dep = dep; e.kills = kills; e.cdC = cdC; e.cdD = cdD;
    }
    for (const id in G.ents) { const e = G.ents[id]; if (e.k === 's' && !seen.has(+id)) delete G.ents[id]; }
    // 건물
    if (s.b) {
      const bseen = new Set();
      G.occ.fill(0);
      for (const a of s.b) {
        const [id, type, owner, x, y, hp, maxHp, lv, built, queue, lvProg, rally, workers, lastHit] = a;
        bseen.add(id);
        let e = G.ents[id];
        if (!e) { e = { id, k: 'b', type, owner, x, y, s: R.B[type].size }; G.ents[id] = e; }
        Object.assign(e, { hp, maxHp, lv, built, queue: queue.map((q) => ({ u: q[0], t: q[1] })), lvProg: lvProg ? { t: lvProg[0], need: lvProg[1] } : null, rally: rally ? { x: rally[0], y: rally[1] } : null, workers, lastHit });
        for (let yy = 0; yy < e.s; yy++) for (let xx = 0; xx < e.s; xx++) G.occ[(y + yy) * G.N + x + xx] = id;
      }
      for (const id in G.ents) { const e = G.ents[id]; if (e.k === 'b' && !bseen.has(+id)) delete G.ents[id]; }
      for (const a of s.v) { const v = G.ents[a[0]]; if (v) { v.owner = a[1]; v.prog = a[2]; v.capP = a[3]; } }
      for (const vid of G.villages) { const v = G.ents[vid]; for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) G.occ[(v.y + yy) * G.N + v.x + xx] = vid; }
      G.invalidate(); G.recalcTerr();
    }
    G.invalidate();
    if (s.ev && s.ev.length) G.ev.push(...s.ev);
    if (s.over && !G.over) G.over = s.over;
  }
  N.alpha = function () { return R.clamp((performance.now() - N.lastSnap) / N.snapGap, 0, 1); };
  N.sendCmd = function (c) { if (N.conn && N.conn.open) N.conn.send({ t: 'cmd', c }); };
  N.chat = function (msg) {
    msg = String(msg || '').trim().slice(0, 80); if (!msg) return;
    if (N.isHost) { const p = N.lobby.players[0]; R.UI.chat(p.name, p.color, msg); broadcast({ t: 'chat', name: p.name, color: p.color, msg }); }
    else if (N.conn && N.conn.open) N.conn.send({ t: 'chat', msg });
  };
  N.leave = function () {
    N.active = false; N.G = null;
    try { if (N.conn) N.conn.close(); } catch (e) { /* 무시 */ }
    try { for (const c of N.conns.values()) c.close(); } catch (e) { /* 무시 */ }
    try { if (N.peer) N.peer.destroy(); } catch (e) { /* 무시 */ }
    N.peer = null; N.conn = null; N.conns.clear(); N.isHost = false; N.lobby = null;
  };

  // ── 로비 화면 ──
  function showLobby() {
    $('#onJoin').classList.add('hidden'); $('#onLobby').classList.remove('hidden'); $('#onBack').classList.add('hidden');
    renderLobby();
  }
  function renderLobby() {
    const L = N.lobby; if (!L) return;
    $('#lobCode').textContent = L.code || N.code;
    $('#lobPlayers').innerHTML = L.players.map((p, i) => `<div class="lobP"><i style="background:${R.COLORS[p.color].c}"></i>${R.esc(p.name)}${i === 0 ? ' 👑' : ''}<span class="tm">${L.team === '2v2' ? (i < 2 ? 'A팀' : 'B팀') : '개인전'}</span></div>`).join('') + (L.players.length < 4 ? '<div class="note">친구를 기다리는 중... (최대 4명)</div>' : '');
    const host = N.isHost;
    $('#bLobStart').style.display = host ? '' : 'none';
    const mp = $('#lobMap'); mp.innerHTML = '';
    for (const m of R.MAPS) {
      const b = document.createElement('button'); if (L.map === m.id) b.classList.add('on');
      b.appendChild(R.App.preview(m.id, 4)); b.insertAdjacentHTML('beforeend', `<b>${m.name}</b>`);
      b.disabled = !host; if (host) b.onclick = () => { L.map = m.id; broadcastLobby(); };
      mp.appendChild(b);
    }
    const tp = $('#lobTeam'); tp.innerHTML = '';
    [['ffa', '개인전'], ['2v2', '2:2 팀전']].forEach(([k, n]) => { const b = document.createElement('button'); b.className = 'btn' + (L.team === k ? ' on' : ''); b.textContent = n; b.disabled = !host; if (host) b.onclick = () => { L.team = k; broadcastLobby(); }; tp.appendChild(b); });
  }
})();
