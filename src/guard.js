'use strict';
/* Retro RTS — 개발자 도구(F12) 차단 (배포본에서만 동작) */
(function () {
  if (!R.PROD_BUILD) return;
  const block = () => {
    if (document.getElementById('block')) return;
    try { if (R.App && R.App.G) R.App.G.paused = true; } catch (e) { /* 무시 */ }
    const d = document.createElement('div'); d.id = 'block';
    d.innerHTML = '개발자 도구가 감지되었어요.<br>개발자 도구를 닫고 새로고침해 주세요.';
    document.body.innerHTML = ''; document.body.appendChild(d);
  };
  addEventListener('keydown', (e) => {
    const k = e.key ? e.key.toUpperCase() : '';
    if (k === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C', 'K'].includes(k)) || ((e.ctrlKey || e.metaKey) && (k === 'U' || k === 'S')) || (e.metaKey && e.altKey && ['I', 'J', 'C', 'U'].includes(k))) {
      e.preventDefault(); e.stopPropagation(); return false;
    }
  }, true);
  addEventListener('contextmenu', (e) => e.preventDefault(), true);
  addEventListener('dragstart', (e) => e.preventDefault(), true);
  addEventListener('selectstart', (e) => { if (!(e.target && e.target.closest && e.target.closest('input'))) e.preventDefault(); }, true);
  // debugger 지연 감지 (개발자 도구가 열려 있을 때만 멈춤)
  const trap = new Function('var t=performance.now();debugger;return performance.now()-t;');
  setInterval(() => { if (trap() > 120) block(); }, 2000);
  // 콘솔 출력 차단
  try { for (const k of ['log', 'info', 'warn', 'debug', 'table', 'dir']) console[k] = () => {}; } catch (e) { /* 무시 */ }
})();
