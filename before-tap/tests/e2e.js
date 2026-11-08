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
  check('첫 화면: 무엇을 하는 앱인지 한 문장', (await p.textContent('.thesis')).includes('위험 신호를 알려 주는 앱'));
  check('첫 화면: 논문 문구 없음', !(await p.textContent('body')).includes('논문'));
  check('첫 화면: 한계 안내', (await p.textContent('.limit')).includes('실시간 탐지는 아닙니다'));
  await p.screenshot({ path: SHOT + '/e2e_top.png' });

  // 할 일 1·2: 문자 통째로 넣고 결과 보기
  await p.click('#btn-sample');
  const verdicts = await p.$$eval('.result', els => els.map(e => e.className.replace('result ', '')));
  check('예시 문자 → 링크 3개 결과', verdicts.length === 3, verdicts.join(','));
  check('목록에 있는 주소 → 누르지 마세요', verdicts[0] === 'match');
  check('단축 주소 → 한 번 더 확인', verdicts[1] === 'caution');
  check('정상 주소 → 목록에 없음(안전이라 하지 않음)', verdicts[2] === 'unlisted' && !(await p.textContent('#results')).includes('안전합니다'));
  check('결과의 주소는 누를 수 있는 링크가 아님', (await p.$$('#results a:not([href^="tel:"]), #bubble a')).length === 0);
  check('예시에도 맨 위 요약(위험 우선)', (await p.getAttribute('#summary', 'class')).includes('match') && (await p.textContent('#summary')).includes('위험한 링크가 1개'));
  check('예시에서는 복사·다시 버튼 숨김', await p.isHidden('#after'));
  check('위험 결과에 118 바로 걸기', (await p.getAttribute('.result.match .tel-btn', 'href')) === 'tel:118');
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
  check('링크 없을 때 요약 숨김', await p.isHidden('#summary'));

  // 편의 기능: 붙여 넣으면 바로 확인, 결과 복사, 다른 문자 확인하기
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  await p.fill('#input', '');
  await p.focus('#input');
  await p.evaluate(() => navigator.clipboard.writeText('[국외발신] 확인 http://xgo.kr/5ni'));
  await p.keyboard.press('Control+V');
  await p.waitForFunction(() => document.getElementById('thread-label').textContent === '받은 문자');
  check('붙여 넣으면 버튼 없이 바로 확인', (await p.getAttribute('.result', 'class')).includes('match'));
  check('실제 결과에는 복사·다시 버튼 보임', await p.isVisible('#btn-copy') && await p.isVisible('#btn-again'));
  await p.click('#btn-copy');
  const copied = await p.evaluate(() => navigator.clipboard.readText());
  check('복사한 결과: 주소를 눌리지 않게 바꿈', copied.includes('hxxp://xgo[.]kr/5ni') && !copied.includes('http://xgo.kr'), copied.split('\n')[1]);
  check('복사한 결과: 118 안내 포함', copied.includes('118'));
  await p.click('#btn-again');
  check('다른 문자 확인하기 → 입력칸 비우고 예시로', (await p.inputValue('#input')) === '' && (await p.textContent('#thread-label')).includes('예시'));
  check('목록 정보: 기준일·자동 확인 안내', (await p.textContent('#source')).includes('2024년 12월 31일') && (await p.textContent('#source')).includes('매주 월요일'));

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
