'use strict';
/* Retro RTS — 튜토리얼 */
(function () {
  const $ = R.$, $$ = R.$$;
  const T = { on: false, i: 0 };
  R.Tut = T;
  const mob = () => R.isMobile();
  const has = (G, type, done) => G.buildings().some((b) => b.owner === 0 && b.type === type && (!done || b.built >= 1));
  const count = (G, u) => G.squads().filter((s) => s.owner === 0 && s.u === u).length;

  const STEPS = [
    { t: () => mob() ? '화면을 손가락으로 끌어서 둘러보세요. 두 손가락으로 확대·축소할 수 있어요.' : 'WASD·방향키나 마우스를 화면 가장자리로 옮겨서 둘러보세요. 휠로 확대·축소해요.', c: () => (R.Input.camMoved || 0) > 25 },
    { t: () => '아래 패널의 <b>[경제]</b> 탭에서 <b>농장</b>을 골라 점선 안(내 영토)에 지으세요. 농장은 매초 금화를 벌어요.', hl: '[data-tut="b_farm"]', c: (G) => has(G, 'farm') },
    { t: () => '빌더가 자동으로 건설하러 가요. 빌더를 더 붙이면 빨라져요. 이번엔 <b>집</b>을 지으세요. 집은 부대 정원을 2 늘려요.', hl: '[data-tut="b_house"]', c: (G) => has(G, 'house') },
    { t: () => '<b>[군사]</b> 탭에서 <b>병영</b>을 지으세요.', hl: '[data-tut="tab1"],[data-tut="b_barracks"]', c: (G) => has(G, 'barracks') },
    { t: () => '병영이 완성되면 병영을 ' + (mob() ? '눌러' : '클릭해') + ' 선택하고 <b>민병</b>을 2부대 소환하세요.', c: (G) => count(G, 'militia') >= 3 },
    { t: () => mob() ? '부대를 눌러 선택한 뒤 땅을 누르면 이동해요. 왼쪽 <b>[군대]</b> 버튼으로 모든 부대를 한 번에 고를 수 있어요.' : '부대를 클릭하거나 드래그로 여러 개 선택한 뒤 <b>오른쪽 클릭</b>으로 이동하세요.', c: (G) => G.squads().some((s) => s.owner === 0 && s.u !== 'builder' && (s.order === 'move' || s.order === 'amove')) },
    { t: () => '부대를 선택하면 <b>횡대/종대</b>를 바꿀 수 있어요. 종대는 빠르고, 횡대는 싸울 때 강해요. 한 번 바꿔 보세요.', hl: '[data-tut="form"],[data-tut="form2"]', c: (G) => G.squads().some((s) => s.owner === 0 && s.form === 'col') },
    { t: () => '위쪽 <b>[봉건 시대]</b> 버튼으로 시대를 발전시키세요. 새 유닛과 건물이 열려요.', hl: '[data-tut="era"]', c: (G) => G.players[0].era >= 1 || !!G.players[0].eraProg },
    { t: () => '마지막! 맵 반대편의 <b>적 본성</b>을 부수세요. 부대를 고르고 ' + (mob() ? '적 본성을 누르세요' : '적 본성을 오른쪽 클릭하세요') + '. 미니맵을 ' + (mob() ? '누르면' : '클릭하면') + ' 그곳으로 이동해요.', c: (G) => !!G.over },
  ];

  T.start = function () { T.on = true; T.i = 0; $('#tut').classList.remove('hidden'); T.render(); };
  T.stop = function () { T.on = false; $('#tut').classList.add('hidden'); $$('.pulse').forEach((e) => e.classList.remove('pulse')); };
  T.render = function () {
    const s = STEPS[T.i]; if (!s) return;
    $('#tutStep').textContent = '튜토리얼 ' + (T.i + 1) + ' / ' + STEPS.length;
    $('#tutText').innerHTML = s.t();
    T.highlight();
  };
  T.highlight = function () {
    if (!T.on) return;
    $$('.pulse').forEach((e) => e.classList.remove('pulse'));
    const s = STEPS[T.i]; if (s && s.hl) $$(s.hl).forEach((e) => e.classList.add('pulse'));
  };
  T.check = function () {
    if (!T.on || !R.App.G) return;
    const s = STEPS[T.i]; if (!s) return;
    if (s.c(R.App.G)) {
      T.i++; R.Audio.sfx('lvup');
      if (T.i >= STEPS.length) { T.stop(); return; }
      T.render();
    }
  };
})();
