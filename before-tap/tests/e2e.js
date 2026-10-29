// node tests/e2e.js [기준 주소]  — 실제 브라우저로 할 일 세 가지와 잘못된 입력을 점검합니다
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const SHOT = process.argv[3] || '.';
let fail = 0;
const check = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  → ' + x : '')); if (!c) fail++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errors = []; let dialogs = 0;
  p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('dialog', d => { dialogs++; d.dismiss(); });
  await p.goto(BASE);
  await p.waitForFunction(() => !document.getElementById('btn-check').disabled);
  check('첫 화면: 앱 이름', (await p.textContent('h1')).includes('누르기 전에'));
  check('첫 화면: 누구를 어떻게 돕는가 한 문장', (await p.textContent('.thesis')).includes('위험 신호를 알려 줍니다'));
  check('첫 화면: 논문 제목', (await p.textContent('.paper-chip')).includes('명절 연휴 직전 피싱사이트 탐지량의 변화'));
  await p.screenshot({ path: SHOT + '/e2e_top.png' });

  // 할 일 1·2: 문자 통째로 넣고 결과 보기
  await p.click('#btn-sample');
  const verdicts = await p.$$eval('.result', els => els.map(e => e.className.replace('result ', '')));
  check('예시 문자 → 링크 3개 결과', verdicts.length === 3, verdicts.join(','));
  check('목록에 있는 주소 → 누르지 마세요', verdicts[0] === 'match');
  check('단축 주소 → 한 번 더 확인', verdicts[1] === 'caution');
  check('정상 주소 → 목록에 없음(안전이라 하지 않음)', verdicts[2] === 'unlisted' && !(await p.textContent('#results')).includes('안전합니다'));
  check('결과의 주소는 누를 수 있는 링크가 아님', (await p.$$('#results a, #bubble a')).length === 0);
  await p.screenshot({ path: SHOT + '/e2e_result.png', fullPage: false });

  // 잘못된 입력
  const bad = ['', 'ㅋㅋㅋ 아무 말', 'javascript:alert(1)', '<img src=x onerror=alert(1)> http://ibe.gh7w.yachts', 'http://', 'x'.repeat(100000), '🎉🎉 %%% \u0000'];
  for (const s of bad) {
    await p.fill('#input', s); await p.click('#btn-check');
    const t = await p.textContent('#results');
    check('멈추지 않음: ' + JSON.stringify(s.slice(0, 18)), t.length > 0);
  }
  check('스크립트 실행 없음(대화상자 0개)', dialogs === 0);
  await p.fill('#input', 'ㅋㅋㅋ'); await p.click('#btn-check');
  check('링크 없을 때 안내', (await p.textContent('#results')).includes('링크를 찾지 못했습니다'));

  // 공유하기로 들어온 경우
  await p.goto(BASE + '?title=택배&text=' + encodeURIComponent('보관 중 확인 http://xgo.kr/5ni'));
  await p.waitForSelector('.result');
  check('공유하기 → 바로 판정', (await p.getAttribute('.result', 'class')).includes('match'));
  check('공유 후 주소창에서 링크 지움', !p.url().includes('text='), p.url());

  // 할 일 3: 날짜 고르기
  await p.fill('#day', '2024-02-01'); await p.dispatchEvent('#day', 'change');
  const ro = await p.textContent('#readout');
  check('날짜 → 탐지 수와 평소 대비', /피싱 주소 [\d,]+개/.test(ro) && ro.includes('배입니다') && ro.includes('설 연휴 직전'), ro);
  await p.fill('#day', ''); await p.dispatchEvent('#day', 'change');
  check('빈 날짜에도 멈추지 않음', (await p.textContent('#readout')).includes('날짜를 골라'));
  check('표: 평소·설·추석 3줄', (await p.$$('#win-table tr')).length === 3);

  // 휴대폰 화면 넘침
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('390px 화면 가로 넘침 없음', ov <= 0, String(ov));
  await p.evaluate(() => document.getElementById('paper').scrollIntoView());
  await p.screenshot({ path: SHOT + '/e2e_paper.png' });

  // 오프라인
  await p.goto(BASE); await p.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
  await p.reload(); await p.waitForTimeout(300);
  await ctx.setOffline(true);
  let offline = false;
  try { await p.reload(); offline = (await p.textContent('h1')).includes('누르기 전에'); } catch (e) {}
  check('인터넷이 끊겨도 열림', offline);
  await ctx.setOffline(false);
  check('콘솔 오류 없음', errors.length === 0, errors.join(' | '));
  await b.close();
  console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
  process.exit(fail ? 1 : 0);
})();
