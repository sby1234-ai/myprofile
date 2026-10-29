// node tests/unit.js — 판정 로직 단위 점검
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../data/lookup.js'), 'utf8'), ctx);
const C = require('../checker.js');
const db = C.createDb(ctx.window.BT_LOOKUP);
let fail = 0;
function check(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  → ' + extra : '')); if (!cond) fail++; }
const v = (s) => C.analyze(s, db);

// 1) 목록에 있는 주소(원자료 첫 줄들)
check('KISA 목록 도메인 → 일치', v('ibe.gh7w.yachts').verdict === 'match');
check('단축 주소 경로 일치 → 일치', v('http://xgo.kr/5ni').verdict === 'match');
check('같은 단축 서비스 다른 경로 → 주의', v('https://xgo.kr/ZZZZ999').verdict === 'caution');
// 2) 정상 주소는 일치로 판정하지 않음
for (const s of ['https://www.naver.com', 'https://naver.me/abcd1234', 'https://www.kakao.com', 'https://www.google.com/search?q=1', 'https://www.gov.kr', 'https://github.com'])
  check('정상 주소 일치 아님: ' + s, v(s).verdict !== 'match', v(s).verdict);
check('naver.com 은 주의도 아님', v('https://www.naver.com/').verdict === 'unlisted');
// 3) 신호
check('IP 주소 → 주의', v('http://103.45.12.9/login').verdict === 'caution');
check('브랜드 흉내 → 주의', v('https://naver-login.help/x').verdict === 'caution');
check('한글 도메인(퓨니코드) → 주의', v('http://네이버.com').reasons.some(r => r.text.includes('xn--')));
// 4) 잘못된 입력에도 멈추지 않음
for (const s of ['', '   ', 'ㅋㅋㅋ', 'http://', 'javascript:alert(1)', 'mailto:a@b.com', '%%%', '\u0000', 'a'.repeat(100000)]) {
  let ok = true; try { C.analyze(s, db); C.extractLinks(s, db); } catch (e) { ok = false; }
  check('예외 없음: ' + JSON.stringify(s.slice(0, 20)), ok);
}
// 5) 문자 통째로 넣었을 때 링크 찾기
const sms = '[Web발신]\n고객님 택배 주소 불일치로 보관중입니다. 확인 http://xgo.kr/5ni확인바랍니다.\n문의: help@abc.com 또는 abc.xyz/a1 , 전화 010-1234-5678. 버전 v1.2 sample.txt';
const ex = C.extractLinks(sms, db);
check('문자에서 링크 2개 추출', ex.links.length === 2, JSON.stringify(ex.links));
check('한글 붙은 링크 잘라냄', ex.links[0] === 'http://xgo.kr/5ni');
check('이메일은 링크 아님', !ex.links.some(l => l.includes('help@')));
const many = Array.from({ length: 30 }, (_, i) => `http://a${i}.example.com`).join(' ');
check('링크 20개 제한', C.extractLinks(many, db).links.length === 20);
console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
