'use strict';
/* Retro RTS — 화면 · HUD · 패널 */
(function () {
  const U = R.U, B = R.B;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  R.$ = $; R.$$ = $$;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  R.esc = esc;

  // ── 도트 아이콘 ──
  const ICONS = {
    coin: ['..####..', '.#yyyy#.', '#yyYYyy#', '#yYyyyy#', '#yYyyyy#', '#yyyyyo#', '.#yyoo#.', '..####..'],
    pop: ['..##....', '.#ss#.##', '.#ss##ss', '..##.#ss', '.#bb#.##', '#bbbb#bb', '#bbbb#bb', '#bbbb#bb'],
    castle: ['#.#..#.#', '###..###', '#g#..#g#', '#g####g#', '#gggggg#', '#gg##gg#', '#gg##gg#', '########'],
    clock: ['..####..', '.#wwww#.', '#www#ww#', '#www#ww#', '#www##w#', '#wwwwww#', '.#wwww#.', '..####..'],
    menu: ['........', '########', '........', '########', '........', '########', '........', '........'],
    full: ['###..###', '#......#', '#......#', '........', '........', '#......#', '#......#', '###..###'],
    chat: ['.######.', '#wwwwww#', '#w#ww#w#', '#wwwwww#', '.######.', '..#.....', '.#......', '........'],
    flag: ['#.......', '#rrrrr..', '#rrrrrr.', '#rrrrr..', '#.......', '#.......', '#.......', '##......'],
    swords: ['e......e', 'Ee....eE', '.Ee..eE.', '..EeeE..', '...ee...', '..k..k..', '.kk..kk.', 'k......k'],
    shield: ['.######.', '#bbBbbb#', '#bBBBbb#', '#bbBbbb#', '#bbbbbb#', '.#bbbb#.', '..#bb#..', '...##...'],
    hammer: ['.######.', '#eeEEee#', '#eeeeee#', '.##kk##.', '...kk...', '...kk...', '...kk...', '...kk...'],
    sword: ['......eE', '.....eE.', '....eE..', '.k.eE...', '..kE....', '..kk....', '.k..k...', 'k.......'],
    bow: ['..kk....', '.k.w....', 'k..w....', 'k..weeE.', 'k..w....', 'k..w....', '.k.w....', '..kk....'],
    boot: ['..####..', '..#kk#..', '..#kk#..', '..#kk#..', '..#kk##.', '.#kkkkk#', '#kkkkkk#', '########'],
    heart: ['........', '.hh..hh.', 'hhWhhhhh', 'hWhhhhhh', '.hhhhhh.', '..hhhh..', '...hh...', '........'],
  };
  const ICOL = { '#': '#1a1220', y: '#ffd24a', Y: '#fff0a0', o: '#b8862a', s: '#f2c08a', b: '#3a6ee0', B: '#8ab4ff', g: '#a8a49a', w: '#f0ece0', r: '#e04a3a', e: '#c8d0dc', E: '#ffffff', k: '#8a5a2a', h: '#e8384a', W: '#ffb0b8' };
  R.pixIcon = function (name, col) {
    const rows = ICONS[name]; const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8; const c = cv.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { c.fillStyle = ch === '#' && col ? col : ICOL[ch]; c.fillRect(x, y, 1, 1); } }));
    return cv.toDataURL();
  };

  const UI = { sel: new Set(), tab: 0, groups: {}, sig: '', placing: null };
  R.UI = UI;

  UI.init = function () {
    // 아이콘
    const st = document.createElement('style');
    st.textContent = Object.keys(ICONS).map((k) => `.ic-${k}{background-image:url(${R.pixIcon(k, k === 'menu' || k === 'full' ? '#fff3d8' : null)})}`).join('\n');
    document.head.appendChild(st);
    if (R.isMobile()) document.body.classList.add('mobile');
    // 패널·상단바 높이가 바뀌면 왼쪽 버튼 영역을 다시 맞춘다 (프레임당 최대 1번)
    if (window.ResizeObserver) { let q = 0; const ro = new ResizeObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; UI.measure(); }); }); ro.observe($('#panel')); ro.observe($('#topbar')); }
    $('.ver').textContent = 'v' + R.VERSION;
    // 그룹 버튼
    const gb = $('#groups');
    for (let i = 1; i <= 5; i++) { const b = document.createElement('button'); b.className = 'sb'; b.textContent = i; b.dataset.g = i; gb.appendChild(b); }
    UI.bindGroups();
    UI.drawTitleArt();
  };

  // ── 화면 전환 ──
  UI.show = function (id) {
    $$('#screens .screen:not(.overlay)').forEach((s) => s.classList.add('hidden'));
    if (id) $('#' + id).classList.remove('hidden');
    UI.cur = id;
  };
  UI.overlay = function (id, on) { $('#' + id).classList.toggle('hidden', !on); };
  UI.confirm = function (text) {
    return new Promise((res) => {
      $('#cfText').textContent = text; UI.overlay('scConfirm', true);
      $('#cfYes').onclick = () => { UI.overlay('scConfirm', false); res(true); };
      $('#cfNo').onclick = () => { UI.overlay('scConfirm', false); res(false); };
    });
  };
  UI.toast = function (msg, cls, ms) {
    const t = document.createElement('div'); t.className = 'toast ' + (cls || ''); t.textContent = msg;
    const box = $('#toasts'); box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, ms || 2600);
  };

  UI.drawTitleArt = function () {
    const cv = $('#titleArt'); cv.width = 260; cv.height = 110; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    // 하늘 · 언덕
    const g = c.createLinearGradient(0, 0, 0, 110); g.addColorStop(0, '#2a3a6a'); g.addColorStop(1, '#6a4a6a'); c.fillStyle = g; c.fillRect(0, 0, 260, 110);
    c.fillStyle = '#fff0c0'; for (let i = 0; i < 30; i++) c.fillRect(R.hash2(i, 1, 3) * 260 | 0, R.hash2(i, 2, 3) * 50 | 0, 1, 1);
    c.fillStyle = '#ffe8a0'; for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 36 && (x - 3) * (x - 3) + (y + 2) * (y + 2) > 25) c.fillRect(216 + x, 20 + y, 1, 1);
    c.fillStyle = '#3a5a2a'; for (let x = 0; x < 260; x++) { const h = 78 + Math.sin(x / 30) * 6 + Math.sin(x / 11) * 2; c.fillRect(x, h, 1, 110 - h); }
    c.fillStyle = '#2a4a22'; for (let x = 0; x < 260; x++) { const h = 90 + Math.sin(x / 17 + 2) * 4; c.fillRect(x, h, 1, 110 - h); }
    const base = R.buildingSprite('base', 0, 3); c.drawImage(base, 130 - base._ox * 0.75 - 10, 98 - base._oy * 0.75 - 40, base.width * 0.75, base.height * 0.75);
    const k = R.unitSprite('knight', 1, 0, true), a = R.unitSprite('archer', 0, 3, false), s = R.unitSprite('swordsman', 0, 0, false), sp = R.unitSprite('spearman', 1, 0, true);
    for (let i = 0; i < 4; i++) { c.drawImage(s, 30 + i * 9, 84 + (i % 2) * 3); c.drawImage(a, 12 + i * 9, 78 + (i % 2) * 3); }
    for (let i = 0; i < 3; i++) { c.drawImage(k, 196 + i * 14, 80 + (i % 2) * 4); c.drawImage(sp, 186 + i * 9, 88 + (i % 2) * 3); }
  };

  // ── 설정 ──
  UI.settings = R.store.get('settings', { q: R.isMobile() ? 1 : 2, bgm: 60, sfx: 70, ui: 100, shake: true, goal: true, v: 2 });
  if (UI.settings.goal == null) UI.settings.goal = true;
  if (!UI.settings.v) { UI.settings.ui = 100; UI.settings.v = 2; } // 이전 버전의 큰 기본 UI 크기 정리
  UI.applySettings = function () {
    const s = UI.settings;
    // 화면의 짧은 쪽 길이에 맞춰 UI를 자동으로 줄인다 (가로 휴대폰은 높이가 320~430px)
    const small = Math.min(innerWidth, innerHeight);
    const auto = small < 360 ? 0.64 : small < 430 ? 0.7 : small < 560 ? 0.8 : small < 800 ? 0.9 : 1;
    document.documentElement.style.setProperty('--u', (s.ui / 100 * auto).toFixed(3));
    R.Audio.setVol(s.bgm / 100, s.sfx / 100);
    if (R.App && R.App.rd) { R.App.rd.quality = s.q; R.App.rd.uiScale = s.ui / 100 * auto; R.App.rd.shakeOn = s.shake; R.App.rd.resize(); }
    if (R.App && R.App.mm) R.App.mm.resize();
    R.store.set('settings', s);
    requestAnimationFrame(UI.measure);
  };
  UI.measure = function () {
    const tb = $('#topbar'), pn = $('#panel'), st = document.documentElement.style;
    if (tb && tb.offsetHeight) st.setProperty('--tbh', tb.offsetHeight + 'px');
    const bb = $('#bBuild');
    if (pn) st.setProperty('--ph', Math.max(pn.offsetHeight, bb && bb.offsetHeight ? bb.offsetHeight + 8 : 0) + 'px');
  };
  UI.openSettings = function (back) {
    const s = UI.settings;
    const q = $('#setQ'); q.innerHTML = '';
    ['낮음', '보통', '높음'].forEach((n, i) => { const b = document.createElement('button'); b.className = 'btn' + (s.q === i ? ' on' : ''); b.textContent = n; b.onclick = () => { s.q = i; UI.applySettings(); UI.openSettings(back); }; q.appendChild(b); });
    $('#setBgm').value = s.bgm; $('#setSfx').value = s.sfx; $('#setUi').value = s.ui; $('#setShake').checked = s.shake;
    $('#setBgm').oninput = (e) => { s.bgm = +e.target.value; UI.applySettings(); };
    $('#setSfx').oninput = (e) => { s.sfx = +e.target.value; UI.applySettings(); R.Audio.sfx('click'); };
    $('#setUi').onchange = (e) => { s.ui = +e.target.value; UI.applySettings(); };
    $('#setShake').onchange = (e) => { s.shake = e.target.checked; UI.applySettings(); };
    $('#setGoal').checked = s.goal !== false;
    $('#setGoal').onchange = (e) => { s.goal = e.target.checked; UI.applySettings(); if (UI.G) UI.updateGoal(true); };
    UI.backTo = back;
    if (back === 'pause') { UI.overlay('scPause', false); $('#scSettings').classList.add('overlay'); $('#scSettings').classList.remove('hidden'); }
    else UI.show('scSettings');
  };

  // ── 도움말 ──
  UI.helpHTML = function () {
    const row = (k) => { const d = U[k]; return `<tr><td>${d.name}</td><td>${R.ERAS[d.era].name}</td><td>${d.cost}</td><td>${d.hp}</td><td>${d.atk}</td><td>${d.ma}/${d.pa}</td><td>${d.range || '근접'}</td><td style="text-align:left">${esc(d.desc)}</td></tr>`; };
    const units = ['militia', 'swordsman', 'spearman', 'halberdier', 'axeman', 'knightfoot', 'slinger', 'archer', 'crossbow', 'longbow', 'scout', 'horsearcher', 'knight', 'paladin', 'ram', 'ballista', 'mangonel', 'trebuchet', 'general', 'builder'];
    const mob = R.isMobile();
    return `
<h3>목표</h3>적의 본성을 파괴하면 승리해요. 내 본성이 무너지면 패배예요.
<h3>조작</h3>${mob ? `
· 화면을 끌어서 이동, 두 손가락으로 확대/축소<br>· 부대·건물을 눌러서 선택<br>· 부대를 선택한 채로 땅을 누르면 이동, 적을 누르면 공격<br>· 땅을 길게 누르면 <b>공격 이동</b> (가는 길의 적과 싸움)<br>· 왼쪽 <b>[선택]</b> 버튼을 켜고 끌면 여러 부대를 한 번에 선택<br>· 왼쪽 숫자 버튼: 길게 누르면 그룹 저장, 짧게 누르면 그룹 선택` : `
· 왼쪽 클릭: 선택 / 드래그: 여러 부대 선택 / 더블클릭: 화면 안 같은 병종 선택<br>· 오른쪽 클릭: 이동 · 공격 · 집결지 지정<br>· A + 왼쪽 클릭: 공격 이동 / S: 정지 / F: 진형 전환<br>· WASD·방향키·화면 가장자리: 카메라 이동, 휠: 확대/축소, Space: 본성으로<br>· Ctrl+숫자: 그룹 저장, 숫자: 그룹 선택 / Esc: 메뉴`}
<h3>쉽게 하기</h3>· 화면 위의 <b>다음 할 일</b> 카드를 따라 하세요. 카드를 누르면 바로 그 화면으로 가요 (설정에서 끌 수 있어요)<br>· 왼쪽 아래 <b>[건설]</b> 버튼으로 건물 목록을 열어요<br>· 왼쪽 <b>[전군 공격]</b>은 모든 부대를 적 본성으로, <b>[전군 방어]</b>는 내 본성 앞으로 보내요<br>· <b>아주 쉬움</b> AI는 내가 먼저 공격하기 전까지 공격해 오지 않아요
<h3>경제</h3>자원은 금화 하나뿐이에요. 본성과 생산시설(농장·방앗간·광산·시장·대장간)이 매초 금화를 벌고, 소환시설(병영·궁술장·마구간·공성작업장)에서 금화로 부대를 소환해요. 건물은 <b>내 영토 안</b>에만 지을 수 있고, 지을수록 영토가 넓어져요. 집 1채마다 부대 정원이 2씩 늘어요(최대 20).
<h3>빌더</h3>빌더는 싸우지 않아요. 근처에 있으면 건설이 빨라지고(최대 ×2.4), 전투 중에도 건물·성벽·공성병기를 수리해요.
<h3>전투</h3>· 상성: 창병 → 기병 → 원거리 → 보병, 검방패병은 화살에 강하고, 공성병기는 건물에 강해요<br>· 측면 공격 +25%, 후방 공격 +50%, 고지대에서 공격 +15%<br>· 기병이 1.5초 이상 달려서 부딪히면 <b>돌격</b>. 정면의 창병에게 돌격하면 오히려 반사 피해를 받아요<br>· 사기가 20 아래로 떨어지면 도주하고, 50까지 회복하면 돌아와요. 장군 근처에서는 사기가 덜 떨어져요<br>· 횡대: 근접 피해 +10%, 원거리 전원 사격 / 종대: 이동 +20%<br>· 숲: 화살 피해 −30%, 기병 느려짐 / 여울: 느려지고 방어 −20%<br>· 원거리 부대를 내 성벽 위로 보내면 사거리 +2, 화살 피해 −50%
<h3>시대 발전</h3>봉건: 건물 2종(집·성벽 제외) / 성주: 시장 또는 대장간 + 소환시설 2채 / 제국: Lv3 건물 2채
<h3>유닛</h3><table><tr><th>유닛</th><th>시대</th><th>비용</th><th>체력</th><th>공격</th><th>근방/관방</th><th>사거리</th><th>특징</th></tr>${units.map(row).join('')}</table>`;
  };

  // ── HUD ──
  UI.enterGame = function (G, me) {
    UI.G = G; UI.me = me; UI.sel = R.App.rd.sel; UI.sel.clear(); UI.sig = ''; UI.placing = null; UI.groups = {};
    UI.show(null); $('#hud').classList.remove('hidden');
    const online = G.mode === 'online';
    $('#speedBox').style.display = online ? 'none' : '';
    $('#bChat').style.display = online ? '' : 'none';
    $('#chat').classList.toggle('hidden', !online);
    $('#sandbox').classList.toggle('hidden', G.mode !== 'sandbox');
    if (G.mode === 'sandbox') UI.buildSandbox();
    $('#bSave').style.display = online ? 'none' : '';
    $('#bSelMode').classList.remove('on'); UI.selMode = false;
    $('#side').style.display = '';
    UI.buildOpen = false; UI.goalSig = ''; UI.goalT = 0;
    $('#sideMore').classList.add('hidden'); $('#bMore').classList.remove('on'); $('#bMore').textContent = '더보기';
    UI.renderGroups();
    UI.updatePanel(true);
    requestAnimationFrame(UI.measure);
  };
  UI.leaveGame = function () { $('#hud').classList.add('hidden'); UI.cancelPlace(); };

  UI.updateHUD = function () {
    const G = UI.G, p = G.players[UI.me];
    const money = (G.sb && G.sb.infMoney) ? '∞' : Math.floor(p.money);
    $('#sMoney b').textContent = money; $('#sMoney small').textContent = '+' + p.inc.toFixed(1) + '/초';
    const pp = G.pop(UI.me); $('#sPop b').textContent = pp.used + '/' + pp.cap;
    $('#sPop b').style.color = pp.used >= pp.cap ? '#ff8a7a' : '';
    // 시대 발전 버튼 하나에 현재 시대 · 다음 시대 · 비용 · 진행바를 합침
    const eb = $('#bEraUp'), et = eb.firstChild, ep = eb.lastChild;
    let txt, dis, tip = '';
    if (p.era >= 3) { txt = '제국 시대'; dis = true; ep.style.width = '0'; }
    else {
      const nx = R.ERAS[p.era + 1];
      if (p.eraProg) { txt = nx.name + ' 발전 중 ' + Math.ceil(p.eraProg.need - p.eraProg.t) + '초'; ep.style.width = (p.eraProg.t / p.eraProg.need * 100) + '%'; }
      else { txt = R.ERAS[p.era].name + ' ▸ ' + nx.name + ' ' + nx.cost; ep.style.width = '0'; }
      const req = G.eraReq(UI.me);
      dis = !!p.eraProg || !!req || !G.canAfford(UI.me, nx.cost);
      tip = req || '';
    }
    if (et.textContent !== txt) et.textContent = txt;
    eb.classList.toggle('dis', dis); eb.title = tip;
    $('#sTime b').textContent = R.fmtTime(G.time);
    $('#bSpeed').textContent = '배속 ' + G.speed + 'x';
    if ((UI.goalT -= 1) <= 0) { UI.goalT = 2; UI.updateGoal(); } // 0.4초마다
  };

  // ── 수치 표시 (픽셀 아이콘 + 숫자) ──
  const CLS_NAME = { inf: '보병', rng: '원거리', cav: '기병', siege: '공성', spearman: '창병', halberdier: '미늘창', bld: '건물' };
  const WEAK = { inf: '원거리', rng: '기병', cav: '창병', siege: '근접' };
  const st = (ic, v, tip) => `<span class="st" data-tip="${tip}"><i class="ic ic-${ic}"></i>${v}</span>`;
  UI.statLine = function (u) {
    const d = U[u]; if (d.cls === 'bld') return '';
    const strong = Object.keys(d.bonus).map((k) => CLS_NAME[k] || (U[k] && U[k].name)).filter(Boolean);
    if (d.cls === 'siege' && d.dt === 's') strong.push('건물');
    const weak = u === 'swordsman' ? '도끼병' : WEAK[d.cls];
    return `<div class="stats">${st('heart', d.hp, '체력 (병사 1명)')}${st('sword', d.atk, '공격력')}${st('shield', d.ma + '/' + d.pa, '방어 (근접/화살)')}${st('bow', d.range || '근접', '사거리')}${st('boot', d.spd, '이동 속도')}`
      + (strong.length ? `<span class="up" data-tip="이 상대에게 강해요">▲${[...new Set(strong)].slice(0, 2).join('·')}</span>` : '')
      + (weak && d.cls !== 'gen' ? `<span class="dn" data-tip="이 상대에게 약해요">▼${weak}</span>` : '') + '</div>';
  };

  // ── 패널 ──
  function unitBtn(u, extra, bid) {
    const G = UI.G, p = G.players[UI.me], d = U[u];
    const lock = d.era > p.era ? R.ERAS[d.era].name + '<br>시대' : '';
    const poor = !G.canAfford(UI.me, d.cost);
    return `<button class="btn ib${poor && !lock ? ' dis' : ''}" data-act="train" data-u="${u}" data-bid="${bid}" title="${esc(d.name + ' — ' + d.desc)}">
      <img src="${R.unitIcon(u, p.color)}"><span>${d.name}</span><span class="cost"><i class="ic ic-coin" style="width:10px;height:10px"></i>${d.cost}</span>${lock ? `<span class="lock">${lock}</span>` : ''}${extra || ''}</button>`;
  }
  function buildBtn(vk, i) {
    const G = UI.G, p = G.players[UI.me], k = R.resolveBuild(vk, p.era), d = B[k];
    const lock = d.era > p.era ? R.ERAS[d.era].name + '<br>시대' : '';
    const poor = !G.canAfford(UI.me, d.cost);
    return `<button class="btn ib${poor && !lock ? ' dis' : ''}${UI.placing && UI.placing.type === k ? ' on' : ''}" data-act="build" data-k="${vk}" data-tut="b_${vk}" title="${esc(d.name + ' — ' + (d.desc || ''))}">
      ${!R.isMobile() && i < 9 ? `<span class="key">${i + 1}</span>` : ''}<img src="${R.buildingIcon(k, p.color)}"><span>${d.name}</span><span class="cost"><i class="ic ic-coin" style="width:10px;height:10px"></i>${d.cost}${d.line ? '/칸' : ''}</span>${lock ? `<span class="lock">${lock}</span>` : ''}</button>`;
  }
  // 지금 시대에 지을 수 있는 건물만 (합친 건물은 시대에 맞는 쪽으로)
  UI.menuKeys = function (tab) {
    const era = UI.G.players[UI.me].era;
    return R.BUILD_MENU[tab].keys.filter((vk) => B[R.resolveBuild(vk, era)].era <= era);
  };
  UI.buildMenuHTML = function (title) {
    const era = UI.G.players[UI.me].era;
    const tabs = R.BUILD_MENU.map((t, i) => `<button class="btn${UI.tab === i ? ' on' : ''}" data-act="tab" data-i="${i}" data-tut="tab${i}">${t.tab}</button>`).join('');
    const keys = UI.menuKeys(UI.tab);
    const locked = R.BUILD_MENU[UI.tab].keys.length - keys.length;
    const nx = era < 3 ? R.ERAS[era + 1].name : '';
    return `<h3>${title || '건설'}<button class="btn sm x" data-act="closeBuild" title="닫기">✕</button></h3><div class="tabs">${tabs}</div>
      <div class="grid">${keys.map(buildBtn).join('')}${locked && nx ? `<div class="more">${nx} 시대에<br>${locked}개 더</div>` : ''}</div>`;
  };
  UI.toggleBuild = function (on) {
    UI.buildOpen = on == null ? !UI.buildOpen : on;
    if (UI.buildOpen && UI.placing) UI.cancelPlace();
    if (UI.buildOpen) { const bl = UI.myIds().filter((id) => UI.G.ents[id].u === 'builder'); UI.sel.clear(); for (const id of bl) UI.sel.add(id); }
    UI.updatePanel(true);
  };

  UI.panelSig = function () {
    const G = UI.G, p = G.players[UI.me];
    const ids = [...UI.sel].filter((id) => G.ents[id]);
    let s = ids.join(',') + '|' + UI.tab + '|' + (UI.buildOpen ? 1 : 0) + '|' + p.era + '|' + (UI.placing ? UI.placing.type : '') + '|' + Math.floor(p.money / 50);
    for (const id of ids.slice(0, 1)) { const e = G.ents[id]; if (e.k === 'b') s += '|' + e.queue.map((q) => q.u).join(',') + '|' + e.lv + '|' + (e.lvProg ? 1 : 0) + '|' + (e.built >= 1 ? 1 : 0) + '|' + p.genAlive + '|' + Math.ceil(Math.max(0, p.genCD - G.time) / 5); }
    if (ids.length && G.ents[ids[0]] && G.ents[ids[0]].k === 's') s += '|' + ids.map((id) => G.ents[id].form).join('');
    return s;
  };

  UI.updatePanel = function (force) {
    const G = UI.G; if (!G) return;
    // 사라진 선택 정리
    for (const id of [...UI.sel]) if (!G.ents[id]) UI.sel.delete(id);
    const sig = UI.panelSig();
    if (!force && sig === UI.sig) { UI.updateDynamic(); return; }
    UI.sig = sig;
    const panel = $('#panel');
    const ids = [...UI.sel];
    const ents = ids.map((id) => G.ents[id]);
    let html = '';
    const mineAll = ents.filter((e) => e.k === 's' && e.owner === UI.me);
    const builders = mineAll.length && mineAll.every((e) => e.u === 'builder');
    if (UI.buildOpen && (!ents.length || builders)) html = UI.buildMenuHTML(builders ? '빌더 ' + mineAll.length + '명 · 건설' : '건설');
    else if (!ents.length) html = '';
    else if (ents[0].k === 's') {
      if (!mineAll.length) html = UI.enemySquadHTML(ents[0]);
      else if (builders) html = `<h3>빌더 ${mineAll.length}명<button class="btn sm x" data-act="desel" title="닫기">✕</button></h3><div class="info">짓다 만 건물이나 부서진 내 건물을 누르면 고쳐요</div><div class="acts"><button class="btn ok" data-act="openBuild">건설 메뉴</button></div>`;
      else html = UI.squadHTML(mineAll);
    } else if (ents[0].k === 'b') html = ents[0].owner === UI.me ? UI.bldHTML(ents[0]) : UI.otherBldHTML(ents[0]);
    else if (ents[0].k === 'v') html = UI.villageHTML(ents[0]);
    if (!ents.length && !UI.buildOpen) UI.buildOpen = false;
    panel.innerHTML = html;
    panel.classList.toggle('hidden', !html);
    $('#bBuild').classList.toggle('hidden', !!html || !!UI.placing);
    $('#bBuild').classList.toggle('on', !!UI.buildOpen);
    UI.updateDynamic();
    if (R.Tut) R.Tut.highlight();
    UI.applyGoalHL();
  };
  UI.updateDynamic = function () {
    const G = UI.G;
    $$('#panel [data-hp]').forEach((el) => { const e = G.ents[+el.dataset.hp]; if (e) el.style.width = (e.hp / e.maxHp * 100) + '%'; });
    $$('#panel [data-hpt]').forEach((el) => { const e = G.ents[+el.dataset.hpt]; if (e) el.textContent = Math.ceil(e.hp) + ' / ' + Math.round(e.maxHp); });
    $$('#panel [data-q]').forEach((el) => {
      const b = G.ents[+el.dataset.q]; if (!b) return; const q = b.queue[+el.dataset.i]; if (!q) return;
      const d = U[q.u]; el.style.width = (100 - Math.max(0, q.t) / d.time * 100) + '%';
    });
    $$('#panel [data-lvp]').forEach((el) => { const b = G.ents[+el.dataset.lvp]; if (b && b.lvProg) el.style.width = (b.lvProg.t / b.lvProg.need * 100) + '%'; });
    $$('#panel [data-sq]').forEach((el) => {
      const s = G.ents[+el.dataset.sq]; if (!s) return;
      el.querySelector('span').textContent = U[s.u].n > 2 ? s.alive + '명' : U[s.u].name;
      const m = el.querySelector('.bar i'); if (m) { m.style.width = Math.max(0, s.morale) + '%'; m.style.background = s.rout ? '#fff' : s.morale >= 70 ? '#4ab0ff' : s.morale >= 40 ? '#e8c22c' : '#ff5a4a'; }
    });
    $$('#panel [data-cd]').forEach((el) => {
      const g = G.squads().find((s) => s.owner === UI.me && s.u === 'general'); if (!g) return;
      const t = (g[el.dataset.cd] || 0) - G.time; el.querySelector('em').textContent = t > 0 ? ' (' + Math.ceil(t) + '초)' : '';
    });
  };

  UI.squadHTML = function (sqs) {
    const G = UI.G, p = G.players[UI.me];
    const cards = sqs.slice(0, 24).map((s) => `<button class="btn sqc" data-act="selOne" data-id="${s.id}" data-sq="${s.id}" title="${esc(U[s.u].name)}"><img src="${R.unitIcon(s.u, p.color)}"><span></span>${U[s.u].cls !== 'siege' && U[s.u].cls !== 'gen' && U[s.u].cls !== 'bld' ? '<div class="bar"><i></i></div>' : ''}</button>`).join('');
    const one = sqs.length === 1 ? sqs[0] : null;
    const d = one ? U[one.u] : null;
    const hasForm = sqs.some((s) => U[s.u].n > 2);
    const gen = sqs.find((s) => s.u === 'general');
    const allLine = sqs.every((s) => s.form !== 'col');
    const title = one ? d.name + (one.onWall ? ' <small>성벽 위</small>' : '') : `부대 ${sqs.length}개`;
    const info = one ? UI.statLine(one.u) : '';
    return `<h3>${title}<button class="btn sm x" data-act="desel" title="닫기">✕</button></h3>${info}<div class="grid">${cards}</div>
      <div class="acts">
        ${hasForm ? `<button class="btn${allLine ? ' on' : ''}" data-act="form" data-f="line" data-tut="form">횡대</button><button class="btn${!allLine ? ' on' : ''}" data-act="form" data-f="col" data-tut="form2">종대</button>` : ''}
        <button class="btn" data-act="stop">정지</button>
        <button class="btn" data-act="amove">공격 이동</button>
        ${gen ? `<button class="btn" data-act="ability" data-a="charge" data-cd="cdC">돌격 명령<em></em></button><button class="btn" data-act="ability" data-a="defend" data-cd="cdD">방어 진형<em></em></button>` : ''}
      </div>`;
  };
  UI.enemySquadHTML = function (s) {
    const G = UI.G, d = U[s.u], pl = G.players[s.owner];
    return `<h3><img src="${R.unitIcon(s.u, pl.color)}" style="width:32px"> ${d.name} <small>${esc(pl.name)} · ${s.alive}/${d.n}명</small><button class="btn sm x" data-act="desel" title="닫기">✕</button></h3>${UI.statLine(s.u)}`;
  };
  UI.bldHTML = function (b) {
    const G = UI.G, p = G.players[UI.me], d = B[b.type];
    let body = '';
    const lvTxt = d.lvCost || b.type === 'base' ? ' Lv' + b.lv : '';
    // 한 줄 요약 (아이콘 + 숫자)
    let info = '';
    if (d.inc && b.type !== 'base') info = st('coin', '+' + d.inc[b.lv - 1] + '/초', '초당 수입') + (d.perFarm ? `<span class="st" data-tip="반경 4 안의 농장 1개당 추가 수입">농장당 +${d.perFarm[b.lv - 1]}</span>` : '') + (d.atkBuff ? st('sword', '+' + Math.round(d.atkBuff[b.lv - 1] * 100) + '%', '아군 전체 공격력') : '') + (b.type === 'market' ? '<span class="st" data-tip="중립 마을 수입 +50%">마을 +50%</span>' : '');
    else if (d.tower) info = st('bow', d.tower.range, '사거리') + st('sword', d.tower.dmg + '×' + d.tower.n, '화살 피해 × 발 수');
    else if (d.pop) info = st('pop', '+2', '부대 정원');
    else if (d.prodCls && b.lv > 1) info = `<span class="st" data-tip="소환 시간 단축">소환 −${b.lv === 2 ? 20 : 40}%</span>`;
    if (info) info = `<div class="stats">${info}</div>`;
    if (b.built < 1) {
      body = `<div class="info">건설 중 ${Math.floor(b.built * 100)}% · 빌더 ${b.workers || 0}명</div>`;
    } else {
      const prod = d.prodCls ? R.PROD[d.prodCls] : d.prod;
      if (prod) body += `<div class="grid">${prod.map((u) => unitBtn(u, '', b.id)).join('')}</div>`;
      if (b.type === 'base') {
        const extra = p.genAlive ? '장군 출전 중' : p.genCD > G.time ? '장군 재소환 ' + Math.ceil(p.genCD - G.time) + '초' : '';
        body += `<div class="info">빌더 ${G.builderCount(UI.me)}/${R.MAX_BUILDERS}${extra ? ' · ' + extra : ''}</div>`;
      }
      if (b.queue.length) body += `<div class="queue">${b.queue.map((q, i) => `<button class="btn" data-act="cancel" data-bid="${b.id}" data-i="${i}" title="취소"><img src="${R.unitIcon(q.u, p.color)}"><span class="x">×</span><span class="qp"><i data-q="${b.id}" data-i="${i}"></i></span></button>`).join('')}</div>`;
      const acts = [];
      if (d.lvCost && b.lv < 3) {
        if (b.lvProg) acts.push(`<div class="hpbar" style="width:120px"><i data-lvp="${b.id}" style="background:#7ab0ff"></i></div>`);
        else acts.push(`<button class="btn${G.canAfford(UI.me, d.lvCost[b.lv - 1]) ? '' : ' dis'}" data-act="lvup" data-bid="${b.id}">Lv${b.lv + 1} ▲ ${d.lvCost[b.lv - 1]}</button>`);
      }
      if (d.prodCls || b.type === 'base') acts.push(`<button class="btn" data-act="rally" data-bid="${b.id}">집결지</button>`);
      if (b.type !== 'base') acts.push(`<button class="btn danger" data-act="sell" data-bid="${b.id}" title="비용의 50% 돌려받기">철거 +${UI.refund(b)}</button>`);
      if (acts.length) body += `<div class="acts">${acts.join('')}</div>`;
    }
    return `<h3><img src="${R.buildingIcon(b.type, p.color)}" style="width:30px">${d.name}${lvTxt} <small data-hpt="${b.id}"></small><button class="btn sm x" data-act="desel" title="닫기">✕</button></h3>
      <div class="hpbar"><i data-hp="${b.id}"></i></div>${info}${body}`;
  };
  UI.refund = function (b) { const d = B[b.type]; let inv = d.cost; if (d.lvCost) for (let i = 0; i < b.lv - 1; i++) inv += d.lvCost[i]; return Math.floor(inv * 0.5); };
  UI.otherBldHTML = function (b) {
    const G = UI.G, pl = G.players[b.owner], d = B[b.type];
    return `<h3><img src="${R.buildingIcon(b.type, pl.color)}" style="width:30px">${d.name} <small>${esc(pl.name)}</small><button class="btn sm x" data-act="desel" title="닫기">✕</button></h3><div class="hpbar"><i data-hp="${b.id}"></i></div><div class="info" data-hpt="${b.id}"></div>`;
  };
  UI.villageHTML = function (v) {
    const G = UI.G; const own = v.owner >= 0 ? G.players[v.owner] : null;
    return `<h3><img src="${R.buildingIcon('village', own ? own.color : -1)}" style="width:40px">중립 마을 <small>${own ? esc(own.name) + ' 점령' : '주인 없음'}</small></h3>
      <div class="info">부대를 옆에 15초 세워 두면 점령 · ${st('coin', '+' + R.VILLAGE_INC + '/초', '점령 시 수입')}</div><div class="acts"><button class="btn" data-act="desel">닫기</button></div>`;
  };

  // ── 패널 클릭 ──
  UI.bindPanel = function () {
    const handler = (e) => {
      const tip = e.target.closest('[data-tip]'); if (tip && !e.target.closest('[data-act]')) { UI.toast(tip.dataset.tip, '', 1400); return; }
      const el = e.target.closest('[data-act]'); if (!el) return;
      const G = UI.G, a = el.dataset.act; R.Audio.sfx('click');
      switch (a) {
        case 'tab': UI.tab = +el.dataset.i; UI.updatePanel(true); break;
        case 'build': UI.buildOpen = false; UI.startPlace(R.resolveBuild(el.dataset.k, G.players[UI.me].era)); break;
        case 'closeBuild': UI.toggleBuild(false); break;
        case 'openBuild': UI.toggleBuild(true); break;
        case 'train': R.App.cmd({ c: 'train', bid: +el.dataset.bid, u: el.dataset.u }); break;
        case 'cancel': R.App.cmd({ c: 'cancel', bid: +el.dataset.bid, idx: +el.dataset.i }); break;
        case 'lvup': R.App.cmd({ c: 'levelup', bid: +el.dataset.bid }); break;
        case 'sell': UI.confirm('정말 철거할까요? 비용의 50%를 돌려받아요.').then((ok) => { if (ok) { R.App.cmd({ c: 'sell', bid: +el.dataset.bid }); UI.sel.clear(); UI.updatePanel(true); } }); break;
        case 'rally': R.Input.setMode('rally', +el.dataset.bid); break;
        case 'form': R.App.cmd({ c: 'form', ids: UI.myIds(), f: el.dataset.f }); setTimeout(() => UI.updatePanel(true), 60); break;
        case 'stop': R.App.cmd({ c: 'stop', ids: UI.myIds() }); break;
        case 'amove': R.Input.setMode('amove'); break;
        case 'ability': R.App.cmd({ c: 'ability', a: el.dataset.a }); break;
        case 'selOne': UI.select([+el.dataset.id]); break;
        case 'desel': UI.buildOpen = false; UI.select([]); break;
      }
    };
    $('#panel').addEventListener('click', handler);
    $('#topbar').addEventListener('click', (e) => { const t = e.target.closest('[data-tip]'); if (t) UI.toast(t.dataset.tip, '', 1400); });
    $('#goal').addEventListener('click', () => UI.goalAction());
  };
  UI.myIds = function () { const G = UI.G; return [...UI.sel].filter((id) => G.ents[id] && G.ents[id].k === 's' && G.ents[id].owner === UI.me); };
  UI.select = function (ids) {
    UI.sel.clear(); for (const id of ids) UI.sel.add(id);
    if (!ids.length || ids.some((id) => UI.G.ents[id] && UI.G.ents[id].u !== 'builder')) UI.buildOpen = false;
    UI.updatePanel(true);
  };

  // ── 건설 배치 ──
  UI.startPlace = function (type) {
    const G = UI.G, p = G.players[UI.me], d = B[type];
    if (d.era > p.era) { UI.toast(R.ERAS[d.era].name + ' 시대가 필요해요', 'err'); R.Audio.sfx('error'); return; }
    UI.placing = { type, line: !!d.line }; UI.buildOpen = false;
    R.App.rd.ghost = null;
    const mob = R.isMobile();
    $('#placeBar').classList.remove('hidden');
    $('#placeInfo').textContent = d.name + ' — ' + (d.line ? (mob ? '시작점과 끝점을 차례로 누르세요' : '드래그해서 그리세요') : (mob ? '지을 곳을 누르세요' : '지을 곳을 클릭하세요 (Shift: 연속 건설)'));
    $('#bPlaceOk').style.display = mob ? '' : 'none';
    document.body.classList.add('placing');
    // 모바일: 미리보기를 화면 가운데에 먼저 띄워서 바로 위치를 확인할 수 있게 함
    if (mob && !d.line) {
      // 화면 가운데에서 가장 가까운 지을 수 있는 칸을 찾아 미리보기를 놓는다 (없으면 가운데)
      const rd = R.App.rd, c = rd.s2t(rd.W / 2, rd.H / 2), h = d.size / 2;
      const cx = Math.floor(c.x - h + 0.5), cy = Math.floor(c.y - h + 0.5);
      // 건물 뒤(화면 위쪽)에 가려지는 자리보다 앞쪽 자리를 우선한다
      let best = null, bs = 1e9;
      for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
        const sc = Math.hypot(dx, dy) + (dx + dy < 0 ? 5 : 0);
        if (sc >= bs || G.canPlace(UI.me, type, cx + dx, cy + dy)) continue;
        bs = sc; best = rd.t2s(cx + dx + h, cy + dy + h);
      }
      if (!best || best.x < 0 || best.y < 0 || best.x > rd.W || best.y > rd.H) best = { x: rd.W / 2, y: rd.H / 2 };
      R.Input.updateGhost(best.x, best.y);
    }
    UI.updatePanel(true);
  };
  UI.cancelPlace = function () {
    UI.placing = null; if (R.App.rd) R.App.rd.ghost = null; $('#placeBar').classList.add('hidden'); document.body.classList.remove('placing');
    if (UI.G) UI.updatePanel(true);
  };
  UI.confirmPlace = function () {
    const g = R.App.rd.ghost; if (!g) { UI.toast('먼저 지을 곳을 누르세요', 'err'); return; }
    const d = B[g.type];
    let r;
    if (g.cells && g.cells.length > 1 || d.line) r = R.App.cmd({ c: 'buildLine', type: g.type, cells: g.cells || [[g.x, g.y]], ids: UI.myIds() });
    else r = R.App.cmd({ c: 'build', type: g.type, x: g.x, y: g.y, ids: UI.myIds() });
    if (r === true || r === undefined) { R.Audio.sfx('build'); if (!UI.keepPlacing) UI.cancelPlace(); else R.App.rd.ghost = null; }
  };

  // ── 강조 대상 찾기 (튜토리얼·목표 카드 공용) ──
  // 건설 메뉴 안의 버튼이 지금 안 보이면, 그 버튼으로 가는 길(건설 버튼 / 탭)을 대신 강조한다
  UI.hlEls = function (sel) {
    if (!sel) return [];
    const out = [];
    for (const one of sel.split(',')) {
      const els = $$(one).filter((e) => e.offsetParent !== null);
      if (els.length) { out.push(...els); continue; }
      const m = one.match(/data-tut="b_(\w+)"/), tm = one.match(/data-tut="tab(\d)"/);
      if (m || tm) {
        const ti = m ? R.BUILD_MENU.findIndex((t) => t.keys.includes(m[1])) : +tm[1];
        if (!UI.buildOpen) out.push($('#bBuild'));
        else if (ti >= 0 && ti !== UI.tab) { const t = $(`[data-tut="tab${ti}"]`); if (t) out.push(t); }
      }
    }
    return [...new Set(out.filter(Boolean))];
  };

  // ── 목표 카드 (다음 할 일) ──
  UI.goalCalc = function () {
    const G = UI.G, me = UI.me, p = G.players[me];
    const base = G.ents[p.baseId]; if (!base) return null;
    const bs = G.buildings().filter((b) => b.owner === me);
    const cnt = (t) => { let n = 0; for (const b of bs) if (b.type === t) n++; return n; };
    const army = G.squads().filter((s) => s.owner === me && s.u !== 'builder' && s.u !== 'general');
    const pop = G.pop(me);
    const bk = (k) => `[data-tut="b_${k}"]`;
    // 위험
    if (G.time - base.lastHit < 6) return { t: '본성이 공격받아요! 전군 방어', hl: '#bDefAll', a: 'def', warn: 1 };
    if (army.length) for (const s of G.squads()) {
      if (G.players[s.owner].team === p.team || s.u === 'builder') continue;
      if (G.terr[(s.y | 0) * G.N + (s.x | 0)] === me) return { t: '적이 영토에 들어왔어요! 전군 방어', hl: '#bDefAll', a: 'def', warn: 1 };
    }
    // 경제 → 군대 → 시대 순서
    if (!cnt('farm')) return { t: '농장 짓기 · 금화 +2/초', hl: bk('farm'), a: 'b:farm' };
    const houseBuilding = bs.some((b) => b.type === 'house' && b.built < 1);
    if (pop.used >= pop.cap && pop.cap < R.MAX_POP && !houseBuilding) return { t: '집 짓기 · 부대 수 +2', hl: bk('house'), a: 'b:house' };
    if (!cnt('barracks')) return { t: '병영 짓기 · 보병을 뽑는 곳', hl: bk('barracks'), a: 'b:barracks' };
    if (cnt('farm') < 2) return { t: '농장 하나 더 짓기', hl: bk('farm'), a: 'b:farm' };
    const prodB = bs.filter((b) => B[b.type].prodCls && b.built >= 1);
    if (army.length < 3) {
      if (!prodB.length) return { t: '병영이 다 지어질 때까지 기다리기', a: null };
      return { t: `부대 뽑기 (${army.length}/3) · 병영을 누르세요`, hl: '#panel [data-act="train"]:not(.dis)', a: 'sel:' + prodB[0].id };
    }
    if (p.era < 3 && !p.eraProg) {
      const req = G.eraReq(me), nx = R.ERAS[p.era + 1];
      if (!req && G.canAfford(me, nx.cost)) return { t: nx.name + ' 시대로 발전하기', hl: '#bEraUp', a: null };
      if (!req && p.era === 0) return { t: `금화 ${nx.cost} 모아서 봉건 시대로`, a: null };
    }
    if (!cnt('mine') && G.map.ores.some((o) => G.terr[o.y * G.N + o.x] === me && !G.occ[o.y * G.N + o.x])) return { t: '광맥에 광산 짓기 · 금화 +5/초', hl: bk('mine'), a: 'b:mine' };
    if (army.length >= 5) return { t: '전군 공격으로 적 본성을 부수세요!', hl: '#bAtkAll', a: 'atk' };
    if (p.era >= 1 && p.era < 3 && !p.eraProg) { const req = G.eraReq(me); if (req && p.money > 400) return { t: req.replace(/^[^:]+: /, R.ERAS[p.era + 1].name + ' 시대 조건: '), a: null }; }
    return { t: `부대 모으기 (${army.length}/5) · 소환시설을 누르세요`, hl: '#panel [data-act="train"]:not(.dis)', a: prodB.length ? 'sel:' + prodB[0].id : null };
  };
  UI.updateGoal = function (force) {
    const box = $('#goal');
    const on = UI.G && UI.settings.goal !== false && UI.G.mode === 'ai' && !UI.G.over;
    const g = on ? UI.goalCalc() : null;
    UI.goal = g;
    box.classList.toggle('hidden', !g);
    if (!g) { UI.applyGoalHL(); return; }
    const sig = g.t + '|' + (g.a ? 1 : 0) + '|' + (g.warn ? 1 : 0);
    if (force || sig !== UI.goalSig) {
      // 할 일이 바뀌면 카드가 한 번 반짝임
      if (UI.goalSig && !g.warn && UI.goalSig.split('|')[0] !== g.t) { box.classList.remove('done'); void box.offsetWidth; box.classList.add('done'); }
      UI.goalSig = sig;
      box.lastChild.textContent = g.t + (g.a ? ' ▸' : '');
      box.classList.toggle('warn', !!g.warn); box.classList.toggle('act', !!g.a);
    }
    UI.applyGoalHL();
  };
  UI.applyGoalHL = function () {
    const g = UI.goal;
    const els = g && g.hl && !UI.placing ? UI.hlEls(g.hl).slice(0, 1) : [];
    const prev = UI._ghl || [];
    if (prev.length === els.length && prev.every((e, i) => e === els[i] && e.classList.contains('gpulse'))) return;
    for (const e of prev) e.classList.remove('gpulse');
    for (const e of els) e.classList.add('gpulse');
    UI._ghl = els;
  };
  // 카드를 누르면 할 일을 바로 할 수 있는 곳으로 데려간다
  UI.goalAction = function () {
    const g = UI.goal; if (!g || !g.a) return;
    R.Audio.sfx('click');
    if (g.a === 'atk') R.App.armyAll(true);
    else if (g.a === 'def') R.App.armyAll(false);
    else if (g.a.startsWith('b:')) {
      const k = g.a.slice(2); UI.tab = Math.max(0, R.BUILD_MENU.findIndex((t) => t.keys.includes(k)));
      UI.select([]); UI.toggleBuild(true);
    } else if (g.a.startsWith('sel:')) {
      const b = UI.G.ents[+g.a.slice(4)]; if (!b) return;
      UI.select([b.id]); R.App.rd.centerOn(b.x + b.s / 2, b.y + b.s / 2);
    }
    UI.updateGoal(true);
  };

  // ── 그룹 ──
  UI.bindGroups = function () {
    $$('#groups .sb').forEach((b) => {
      let t = null, long = false;
      b.addEventListener('pointerdown', () => { long = false; t = setTimeout(() => { long = true; UI.setGroup(+b.dataset.g); }, 550); });
      b.addEventListener('pointerup', () => { clearTimeout(t); if (!long) UI.selectGroup(+b.dataset.g); });
      b.addEventListener('pointerleave', () => clearTimeout(t));
    });
  };
  UI.setGroup = function (n) {
    const ids = UI.myIds(); if (!ids.length) { UI.toast('먼저 부대를 선택하세요', 'err'); return; }
    const G = UI.G;
    for (const k in UI.groups) UI.groups[k] = UI.groups[k].filter((id) => !ids.includes(id));
    UI.groups[n] = ids;
    for (const s of G.squads()) if (s.grp === n) s.grp = 0;
    for (const id of ids) if (G.ents[id]) G.ents[id].grp = n;
    UI.toast(n + '번 그룹에 저장했어요', 'good', 1200); UI.renderGroups();
  };
  UI.selectGroup = function (n, center) {
    const G = UI.G; const ids = (UI.groups[n] || []).filter((id) => G.ents[id]);
    UI.groups[n] = ids;
    if (!ids.length) { UI.toast(R.isMobile() ? '길게 누르면 선택한 부대를 저장해요' : 'Ctrl+' + n + '로 저장하세요', '', 1500); return; }
    const now = performance.now();
    if (center || (UI._lastG === n && now - UI._lastGT < 400)) { const s = G.ents[ids[0]]; R.App.rd.centerOn(s.x, s.y); }
    UI._lastG = n; UI._lastGT = now;
    UI.select(ids); UI.renderGroups();
  };
  UI.renderGroups = function () { $$('#groups .sb').forEach((b) => b.classList.toggle('has', !!(UI.groups[+b.dataset.g] || []).length)); };

  // ── 샌드박스 ──
  UI.buildSandbox = function () {
    const G = UI.G; const box = $('#sandbox');
    const enemy = G.players.find((p) => p.id !== UI.me);
    UI.sbOwner = UI.sbOwner == null ? enemy.id : UI.sbOwner;
    const units = Object.keys(U).filter((k) => k !== 'builder');
    if (UI.sbCollapsed) {
      box.innerHTML = `<button class="btn sm" data-sb="show">샌드박스 도구 열기</button>`;
    } else box.innerHTML = `<b style="color:var(--gold)">샌드박스 도구</b>
      <div class="acts" style="margin:0">
        <button class="btn sm${G.sb.infMoney ? ' on' : ''}" data-sb="money">돈 무한</button>
        <button class="btn sm${G.sb.ai ? ' on' : ''}" data-sb="ai">적 AI ${G.sb.ai ? '켜짐' : '꺼짐'}</button>
      </div>
      <div class="acts" style="margin:0;align-items:center">시대 <button class="btn sm" data-sb="era-">−</button><b>${R.ERAS[G.players[UI.me].era].name}</b><button class="btn sm" data-sb="era+">+</button></div>
      <div class="acts" style="margin:0">배치: <button class="btn sm${UI.sbOwner !== UI.me ? ' on' : ''}" data-sb="own-e">적</button><button class="btn sm${UI.sbOwner === UI.me ? ' on' : ''}" data-sb="own-m">나</button><button class="btn sm" data-sb="hide">접기</button></div>
      <div class="grid">${units.map((u) => `<button class="btn ib${UI.sbUnit === u ? ' on' : ''}" data-sbu="${u}" title="${U[u].name}"><img src="${R.unitIcon(u, G.players[UI.sbOwner].color)}"></button>`).join('')}</div>
      <div class="info">${UI.sbUnit ? U[UI.sbUnit].name + ' — 맵을 눌러 배치' : '유닛을 고르고 맵을 눌러 배치'}</div>`;
    box.onclick = (e) => {
      const b = e.target.closest('[data-sb],[data-sbu]'); if (!b) return; R.Audio.sfx('click');
      if (b.dataset.sbu) { UI.sbUnit = UI.sbUnit === b.dataset.sbu ? null : b.dataset.sbu; if (UI.sbUnit) R.Input.setMode('spawn'); else R.Input.setMode(null); }
      const k = b.dataset.sb;
      if (k === 'money') G.sb.infMoney = !G.sb.infMoney;
      if (k === 'ai') R.App.cmd({ c: 'sbAI', on: !G.sb.ai });
      if (k === 'era-' || k === 'era+') R.App.cmd({ c: 'sbEra', p: UI.me, era: G.players[UI.me].era + (k === 'era+' ? 1 : -1) });
      if (k === 'own-e') UI.sbOwner = enemy.id; if (k === 'own-m') UI.sbOwner = UI.me;
      if (k === 'hide') { UI.sbCollapsed = true; UI.sbUnit = null; R.Input.setMode(null); }
      if (k === 'show') UI.sbCollapsed = false;
      UI.buildSandbox(); UI.updatePanel(true);
    };
  };

  // ── 채팅 ──
  UI.chat = function (name, color, msg, sys) {
    const add = (box) => { if (!box) return; const d = document.createElement('div'); d.innerHTML = sys ? `<i style="color:#9a8a9a">${esc(msg)}</i>` : `<b style="color:${R.COLORS[color] ? R.COLORS[color].c : '#fff'}">${esc(name)}</b>: ${esc(msg)}`; box.appendChild(d); while (box.children.length > 60) box.firstChild.remove(); box.scrollTop = 1e9; };
    add($('#chatLog')); add($('#lobLog'));
  };

  // ── 결과 ──
  UI.showResult = function (G, me, newAch) {
    const pl = G.players[me]; const won = G.over && G.over.team === pl.team;
    $('#resTitle').textContent = won ? '승리!' : '패배';
    $('#resTitle').style.color = won ? '' : '#ff8a7a';
    $('#resSub').textContent = R.MAPS.find((m) => m.id === G.mapId).name + ' · ' + R.fmtTime(G.time) + (G.mode === 'ai' ? ' · AI ' + R.DIFF[G.diff].name : '');
    const rows = G.players.map((p) => `<tr><td style="color:${R.COLORS[p.color].c}">${esc(p.name)}${p.isAI ? ' (AI' + (p.persona ? '·' + R.PERSONA[p.persona] : '') + ')' : ''}</td><td>${R.ERAS[p.era].name}</td><td>${p.st.kills}</td><td>${p.st.losses}</td><td>${Math.floor(p.st.earned)}</td><td>${p.st.bldKilled}</td><td>${p.team === G.over.team ? '승리' : '패배'}</td></tr>`).join('');
    $('#resTable').innerHTML = `<table><tr><th>세력</th><th>시대</th><th>처치</th><th>손실</th><th>총 수입</th><th>파괴한 건물</th><th>결과</th></tr>${rows}</table>`;
    $('#resAch').innerHTML = newAch.length ? '<b style="width:100%">새 도전과제</b>' + newAch.map((a) => `<span>${esc(a.name)}</span>`).join('') : '';
    UI.show('scResult');
    // 그래프
    const cv = $('#resChart'); const w = cv.clientWidth || 600, h = cv.clientHeight || 160; cv.width = w * 2; cv.height = h * 2;
    const c = cv.getContext('2d'); c.scale(2, 2); c.fillStyle = '#120c16'; c.fillRect(0, 0, w, h);
    const maxI = Math.max(10, ...G.players.flatMap((p) => p.st.incHist)); const n = Math.max(2, ...G.players.map((p) => p.st.incHist.length));
    c.strokeStyle = '#3a2a38'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(30, h - 20 - (h - 34) * i / 4); c.lineTo(w - 6, h - 20 - (h - 34) * i / 4); c.stroke(); }
    c.fillStyle = '#c8b8a8'; c.font = '11px sans-serif'; c.fillText('초당 수입', 34, 12); c.fillText(Math.round(maxI), 2, 18); c.fillText('0', 18, h - 18); c.fillText(R.fmtTime(G.time), w - 40, h - 4);
    for (const p of G.players) {
      c.strokeStyle = R.COLORS[p.color].c; c.lineWidth = 2; c.beginPath();
      p.st.incHist.forEach((v, i) => { const x = 30 + (w - 36) * i / (n - 1), y = h - 20 - (h - 34) * v / maxI; i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
    }
  };

  // ── 도전과제 화면 ──
  UI.showAch = function () {
    const got = R.store.get('ach', {}); const st = R.store.get('stats', { wins: 0, losses: 0, maps: [], walls: 0 });
    $('#achList').innerHTML = R.ACH.map((a) => `<div class="ach${got[a.id] ? ' got' : ''}"><div class="medal"></div><div><b>${esc(a.name)}</b><small>${esc(a.desc)}${got[a.id] ? ' · ' + got[a.id] : ''}</small></div></div>`).join('');
    $('#achStats').textContent = `달성 ${Object.keys(got).length}/${R.ACH.length} · 전적 ${st.wins}승 ${st.losses}패 · 쌓은 성벽 ${st.walls}칸`;
    UI.show('scAch');
  };

  // ── 맵 미리보기 ──
  UI.mapPreview = function (id, players) {
    const M = R.buildMap(id, players); const N = M.N;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const c = cv.getContext('2d');
    const tmp = document.createElement('canvas'); tmp.width = N; tmp.height = N; const tc = tmp.getContext('2d'); const idt = tc.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const t = M.t[i]; let col = R.TC[t === R.T.FOREST ? 2 : t][0]; if (M.e[i] === 1 && t !== R.T.ROCK) col = R.shade(col, 1.15); if (t === R.T.FOREST) col = R.shade(col, 0.8); idt.data.set([col[0], col[1], col[2], 255], i * 4); }
    tc.putImageData(idt, 0, 0);
    c.setTransform(128 / (2 * N), 64 / (2 * N), -128 / (2 * N), 64 / (2 * N), 64, 0); c.imageSmoothingEnabled = false; c.drawImage(tmp, 0, 0);
    const order = players === 2 ? [0, 3] : [0, 1, 2, 3];
    order.forEach((k, i) => { const s = M.starts[k]; c.fillStyle = R.COLORS[i].c; c.fillRect(s.x, s.y, 4, 4); });
    for (const v of M.villages) { c.fillStyle = '#fff'; c.fillRect(v.x, v.y, 2, 2); }
    return cv;
  };
})();
