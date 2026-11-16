# Retro RTS

중세 픽셀아트 실시간 전략 게임. 토탈워처럼 부대 단위(16명)로 싸우고, 금화 하나로 경제를 굴려 적 본성을 무너뜨리세요.

**플레이:** https://0611gareddug.github.io/Retro_RTS/

## 특징
- 2.5D 쿼터뷰 픽셀아트, PC·모바일 모두 지원 (모바일 전체화면 버튼)
- AI 대전 1:1 (쉬움·보통·어려움, 매 판 공격형·수비형·경제형 중 랜덤 성향)
- 온라인 대전: 방 코드로 2~4인 개인전 / 2:2 팀전 (P2P)
- 샌드박스: 돈 무한, 부대 직접 배치, 시대 변경, AI 켜기/끄기
- 유닛 19종 + 빌더, 상성 · 측면/후방 공격 · 기병 돌격 · 사기와 도주 · 진형 · 지형 효과
- 건물을 지을수록 넓어지는 영토, 직접 그리는 성벽, 성벽 위 궁수, 공성전
- 시대 4단계, 건물 레벨업, 중립 마을, 도전과제 15개, 튜토리얼, 저장/이어하기

## 구조
| 경로 | 내용 |
|---|---|
| `src/` | 원본 코드 (core, data, map, sprites, sim, ai, render, audio, ui, input, tutorial, net, main, guard) |
| `docs/DESIGN.md` | 시스템·밸런스 기획서 |
| `index.html`, `game.js` | 배포본 (압축·난독화, `tools/build.js`로 생성) |
| `assets/bgm/` | 배경음악 |

## 빌드
```bash
node tools/build.js        # 배포본 index.html + game.js 생성
node tools/build.js --dev  # 원본 파일을 그대로 불러오는 dev.html 생성 (로컬 테스트용)
```
밸런스는 `src/data.js`에서 고친 뒤 빌드하면 돼요.
