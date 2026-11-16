'use strict';
/* Retro RTS — 밸런스 데이터 (docs/DESIGN.md 기준) */
(function () {
  const ERAS = [
    { name: '부족', cost: 0, time: 0, baseHp: 4000 },
    { name: '봉건', cost: 500, time: 30, baseHp: 5000 },
    { name: '성주', cost: 1200, time: 45, baseHp: 6500 },
    { name: '제국', cost: 2500, time: 60, baseHp: 8000 },
  ];

  // cls: inf 보병, rng 원거리, cav 기병, siege 공성, gen 장군, bld 빌더
  // dt: 공격타입 m 근접, p 관통, s 공성 / ma 근방, pa 관방
  // range 0 = 근접. bonus: 대상 클래스/키별 배율
  const U = {
    militia: { name: '민병', cls: 'inf', era: 0, cost: 60, time: 8, n: 16, hp: 40, atk: 5, dt: 'm', ma: 0, pa: 0, range: 0, spd: 1.0, rate: 1.2, desc: '싸고 빠르게 나오는 초반 보병' },
    swordsman: { name: '검방패병', cls: 'inf', era: 1, cost: 140, time: 12, n: 16, hp: 65, atk: 8, dt: 'm', ma: 3, pa: 6, range: 0, spd: 0.9, rate: 1.2, bonus: { spearman: 1.3, halberdier: 1.3 }, desc: '화살에 강하고 창병을 잘 잡음' },
    spearman: { name: '창병', cls: 'inf', era: 1, cost: 100, time: 10, n: 16, hp: 50, atk: 6, dt: 'm', ma: 1, pa: 1, range: 0, reach: 0.5, spd: 1.0, rate: 1.4, bonus: { cav: 2.5 }, spear: true, desc: '기병 카운터, 정면 돌격 반사' },
    halberdier: { name: '미늘창병', cls: 'inf', era: 2, cost: 170, time: 14, n: 16, hp: 70, atk: 9, dt: 'm', ma: 3, pa: 2, range: 0, reach: 0.5, spd: 1.0, rate: 1.4, bonus: { cav: 3, siege: 2 }, spear: true, desc: '기병·공성병기 카운터' },
    axeman: { name: '중갑 도끼병', cls: 'inf', era: 2, cost: 220, time: 16, n: 16, hp: 85, atk: 13, dt: 'm', ma: 5, pa: 3, range: 0, spd: 0.85, rate: 1.5, pierceM: 0.5, bldMult: 1.5, desc: '근접방어 50% 무시, 건물에 강함' },
    knightfoot: { name: '기사보병', cls: 'inf', era: 3, cost: 320, time: 20, n: 16, hp: 110, atk: 15, dt: 'm', ma: 7, pa: 6, range: 0, spd: 0.9, rate: 1.3, moraleRes: 0.3, desc: '최정예 보병, 사기가 잘 안 꺾임' },

    slinger: { name: '투석병', cls: 'rng', era: 0, cost: 70, time: 8, n: 16, hp: 30, atk: 4, dt: 'p', ma: 0, pa: 0, range: 4, spd: 1.0, rate: 1.6, proj: 'stone', desc: '가장 싼 원거리' },
    archer: { name: '궁수', cls: 'rng', era: 1, cost: 120, time: 10, n: 16, hp: 35, atk: 6, dt: 'p', ma: 0, pa: 1, range: 6, spd: 1.0, rate: 1.8, bonus: { inf: 1.3 }, proj: 'arrow', desc: '보병에게 강한 기본 원거리' },
    crossbow: { name: '석궁병', cls: 'rng', era: 2, cost: 180, time: 14, n: 16, hp: 45, atk: 11, dt: 'p', ma: 1, pa: 2, range: 5.5, spd: 0.9, rate: 3.0, pierceP: 0.5, proj: 'bolt', desc: '관통방어 50% 무시' },
    longbow: { name: '장궁병', cls: 'rng', era: 3, cost: 260, time: 16, n: 16, hp: 40, atk: 9, dt: 'p', ma: 0, pa: 2, range: 8.5, spd: 1.0, rate: 2.0, proj: 'arrow', desc: '가장 긴 사거리' },

    scout: { name: '정찰기병', cls: 'cav', era: 0, cost: 110, time: 10, n: 16, hp: 55, atk: 6, dt: 'm', ma: 1, pa: 2, range: 0, spd: 2.2, rate: 1.3, bonus: { rng: 1.5, siege: 2 }, charge: 1.5, desc: '빠름, 궁수·공성병기 사냥' },
    horsearcher: { name: '기마궁수', cls: 'cav', era: 1, cost: 200, time: 14, n: 16, hp: 55, atk: 6, dt: 'p', ma: 1, pa: 3, range: 5, spd: 1.9, rate: 1.8, bonus: { spearman: 1.3, halberdier: 1.3 }, moveShoot: true, proj: 'arrow', desc: '이동하면서 사격' },
    knight: { name: '기사', cls: 'cav', era: 2, cost: 300, time: 18, n: 16, hp: 110, atk: 12, dt: 'm', ma: 5, pa: 5, range: 0, spd: 1.7, rate: 1.5, bonus: { rng: 1.5 }, charge: 2, desc: '강력한 돌격' },
    paladin: { name: '성기사단', cls: 'cav', era: 3, cost: 450, time: 24, n: 16, hp: 150, atk: 15, dt: 'm', ma: 7, pa: 7, range: 0, spd: 1.6, rate: 1.5, charge: 2.2, aura: 0.2, desc: '최강 기병, 주변 사기 보호' },

    ram: { name: '공성추', cls: 'siege', era: 1, cost: 200, time: 16, n: 1, hp: 900, atk: 120, dt: 's', ma: 2, pa: 40, range: 0, spd: 0.6, rate: 3.0, bldOnly: true, gateMult: 1.5, desc: '건물·성문 파괴 전용' },
    ballista: { name: '발리스타', cls: 'siege', era: 2, cost: 250, time: 18, n: 2, hp: 250, atk: 40, dt: 'p', ma: 2, pa: 5, range: 9, spd: 0.7, rate: 4.0, pierceN: 4, proj: 'bolt', desc: '직선 관통 사격' },
    mangonel: { name: '투석기', cls: 'siege', era: 2, cost: 350, time: 20, n: 2, hp: 300, atk: 90, dt: 's', ma: 1, pa: 5, range: 11, minRange: 3, spd: 0.5, rate: 6.0, aoe: 1.5, bldMult: 2, proj: 'rock', desc: '범위 피해, 성벽 파괴' },
    trebuchet: { name: '트레뷔셰', cls: 'siege', era: 3, cost: 500, time: 28, n: 1, hp: 600, atk: 250, dt: 's', ma: 1, pa: 5, range: 14, minRange: 4, spd: 0.4, rate: 9.0, aoe: 2, bldMult: 3, deploy: 5, proj: 'boulder', desc: '설치 후 초장거리 공성' },

    general: { name: '장군', cls: 'gen', era: 0, cost: 300, time: 10, n: 1, hp: 600, atk: 20, dt: 'm', ma: 6, pa: 6, range: 0, spd: 2.0, rate: 1.2, desc: '사기 오라, 돌격 명령·방어 진형' },
    builder: { name: '빌더', cls: 'bld', era: 0, cost: 50, time: 6, n: 1, hp: 50, atk: 0, dt: 'm', ma: 0, pa: 1, range: 0, spd: 1.3, rate: 1, desc: '건설 가속·수리 (공격 안 함)' },
  };
  for (const k in U) { U[k].key = k; U[k].bonus = U[k].bonus || {}; }

  // 건물. inc: 레벨별 수입, lvCost: 레벨업 비용(Lv2, Lv3)
  const B = {
    base: { name: '본성', era: 0, size: 4, cost: 0, time: 0, hp: 4000, terr: 8, inc: [4], tower: { n: 4, dmg: 8, rate: 1.5, range: 7 }, prod: ['builder', 'general'] },
    house: { name: '집', era: 0, size: 1, cost: 60, time: 8, hp: 300, terr: 3, pop: 2, desc: '부대 정원 +2' },
    farm: { name: '농장', era: 0, size: 2, cost: 100, time: 10, hp: 400, terr: 4, inc: [2, 3, 4], lvCost: [90, 180], desc: '수입 2/초' },
    mill: { name: '방앗간', era: 0, size: 2, cost: 150, time: 12, hp: 600, terr: 4, inc: [1, 1, 1], perFarm: [0.5, 0.75, 1.0], lvCost: [150, 300], desc: '근처 농장 1개당 수입 추가' },
    mine: { name: '광산', era: 0, size: 2, cost: 200, time: 15, hp: 800, terr: 4, inc: [5, 7, 9], lvCost: [200, 400], ore: true, desc: '광맥 위에만, 수입 5/초' },
    market: { name: '시장', era: 1, size: 3, cost: 300, time: 20, hp: 1000, terr: 5, inc: [5, 7, 9], lvCost: [300, 600], desc: '수입 5/초, 중립 마을 수입 +50%' },
    smith: { name: '대장간', era: 1, size: 2, cost: 250, time: 18, hp: 900, terr: 4, inc: [2, 2, 2], atkBuff: [0.05, 0.1, 0.15], lvCost: [250, 500], desc: '수입 2/초, 아군 공격력 +5%' },
    barracks: { name: '병영', era: 0, size: 3, cost: 120, time: 15, hp: 1200, terr: 4, prodCls: 'inf', lvCost: [150, 300], desc: '보병 소환' },
    range: { name: '궁술장', era: 0, size: 3, cost: 150, time: 15, hp: 1000, terr: 4, prodCls: 'rng', lvCost: [150, 300], desc: '원거리 소환' },
    stable: { name: '마구간', era: 0, size: 3, cost: 200, time: 18, hp: 1200, terr: 4, prodCls: 'cav', lvCost: [150, 300], desc: '기병 소환' },
    workshop: { name: '공성작업장', era: 1, size: 3, cost: 300, time: 20, hp: 1500, terr: 4, prodCls: 'siege', lvCost: [150, 300], desc: '공성병기 소환' },
    tower_wood: { name: '나무 망루', era: 0, size: 1, cost: 100, time: 10, hp: 500, terr: 3, tower: { n: 2, dmg: 6, rate: 1.5, range: 6 }, desc: '화살 2발 사격' },
    tower_stone: { name: '석조 탑', era: 2, size: 1, cost: 350, time: 25, hp: 2200, terr: 5, tower: { n: 3, dmg: 10, rate: 1.5, range: 8 }, wallLike: true, desc: '화살 3발, 성벽과 연결' },
    wall_wood: { name: '나무 성벽', era: 0, size: 1, cost: 8, time: 2, hp: 500, terr: 0, wall: true, line: true, desc: '드래그로 그리기 (칸당 8)' },
    gate_wood: { name: '나무 성문', era: 0, size: 1, cost: 60, time: 6, hp: 1000, terr: 0, wall: true, gate: true, desc: '아군만 통과' },
    stake: { name: '말뚝', era: 1, size: 1, cost: 15, time: 2, hp: 150, terr: 0, wall: true, line: true, stake: true, desc: '기병 돌격 차단 (칸당 15)' },
    wall_stone: { name: '석벽', era: 2, size: 1, cost: 20, time: 3, hp: 1800, terr: 0, wall: true, line: true, desc: '튼튼한 성벽 (칸당 20)' },
    gate_stone: { name: '석조 성문', era: 2, size: 1, cost: 150, time: 10, hp: 3000, terr: 0, wall: true, gate: true, desc: '튼튼한 성문' },
  };
  for (const k in B) { B[k].key = k; }

  const PROD = {
    inf: ['militia', 'spearman', 'swordsman', 'halberdier', 'axeman', 'knightfoot'],
    rng: ['slinger', 'archer', 'crossbow', 'longbow'],
    cav: ['scout', 'horsearcher', 'knight', 'paladin'],
    siege: ['ram', 'ballista', 'mangonel', 'trebuchet'],
  };

  const BUILD_MENU = [
    { tab: '경제', keys: ['house', 'farm', 'mill', 'mine', 'market', 'smith'] },
    { tab: '군사', keys: ['barracks', 'range', 'stable', 'workshop'] },
    { tab: '방어', keys: ['tower_wood', 'tower_stone', 'wall_wood', 'gate_wood', 'stake', 'wall_stone', 'gate_stone'] },
  ];

  const ACH = [
    { id: 'firstWin', name: '첫 승리', desc: 'AI 대전에서 1승' },
    { id: 'chivalry', name: '기사도', desc: '기병만으로 승리' },
    { id: 'ironwall', name: '철벽', desc: '본성 체력 50% 이상 남기고 승리' },
    { id: 'blitz', name: '속전속결', desc: '10분 안에 승리' },
    { id: 'landlord', name: '대지주', desc: '중립 마을을 모두 점령' },
    { id: 'imperial', name: '제국의 시대', desc: '제국 시대 도달' },
    { id: 'spearwall', name: '창벽', desc: '창병 계열로 기병 부대 10개 격파' },
    { id: 'siegemaster', name: '공성의 달인', desc: '트레뷔셰로 건물 5채 파괴' },
    { id: 'undying', name: '불굴', desc: '장군이 한 번도 죽지 않고 승리' },
    { id: 'rebel', name: '맨손의 반란', desc: '부족 시대 유닛만으로 승리' },
    { id: 'tycoon', name: '대부호', desc: '한 판에 금화 20,000 획득' },
    { id: 'mason', name: '성벽 건축가', desc: '성벽 100칸 건설 (누적)' },
    { id: 'conqueror', name: '정복자', desc: '어려움 AI에게 승리' },
    { id: 'cartographer', name: '지도 정복', desc: '4개 맵 모두에서 승리' },
    { id: 'comrade', name: '전우', desc: '온라인 2:2에서 승리' },
  ];

  const DIFF = [
    { name: '쉬움', inc: 0.8, react: 2.0 },
    { name: '보통', inc: 1.0, react: 1.0 },
    { name: '어려움', inc: 1.15, react: 0.5 },
  ];
  const PERSONA = { aggro: '공격형', turtle: '수비형', eco: '경제형' };

  const MAPS = [
    { id: 'plains', name: '탁 트인 평원', desc: '장애물이 거의 없음 · 기병 돌격에 유리' },
    { id: 'river', name: '강과 다리', desc: '강을 사이에 둔 다리 쟁탈전' },
    { id: 'forest', name: '숲과 언덕', desc: '숲 매복과 고지 점령' },
    { id: 'canyon', name: '산악 협곡', desc: '좁은 통로 · 성벽 방어' },
  ];

  Object.assign(R, { ERAS, U, B, PROD, BUILD_MENU, ACH, DIFF, PERSONA, MAPS });
  R.START_MONEY = 800;
  R.MAX_POP = 20;
  R.BASE_POP = 4;
  R.MAX_BUILDERS = 8;
  R.BUILDER_MULT = [1, 1.5, 1.9, 2.2, 2.4];
  R.VILLAGE_INC = 4;
  R.squadPop = (u) => (u.cls === 'gen' || u.cls === 'bld' ? 0 : 1);
})();
