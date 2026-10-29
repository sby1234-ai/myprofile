/* 누르기 전에 — 링크 판정 로직
 * 화면과 분리된 순수 함수만 둡니다. 브라우저(window.BTChecker)와 Node(module.exports) 양쪽에서 씁니다.
 * 입력한 내용은 어디로도 보내지 않고, 이 파일 안의 계산만으로 판정합니다.
 */
(function (root) {
  "use strict";

  var MAX_INPUT = 20000;   // 이보다 긴 입력은 앞부분만 봅니다
  var MAX_LINKS = 20;      // 한 번에 판정하는 링크 수
  var SECOND_LEVEL = { co: 1, or: 1, go: 1, ac: 1, ne: 1, re: 1, pe: 1, com: 1, net: 1, org: 1 };
  var COMMON_TLD = ["com", "net", "org", "kr", "co", "io", "me", "jp", "us", "info", "biz", "app", "dev",
    "xyz", "site", "shop", "link", "ly", "gl", "to", "la", "do", "so", "cc", "tv", "ai", "edu", "gov", "mil"];
  // 회사 이름이 들어 있지만 공식 도메인이 아닌 주소를 알려 주기 위한 짧은 목록
  var BRANDS = [
    { key: "naver", name: "네이버", official: ["naver.com", "naver.me", "naver.net", "me2.do"] },
    { key: "kakao", name: "카카오", official: ["kakao.com", "kakaocorp.com", "kko.to", "daum.net"] },
    { key: "google", name: "구글", official: ["google.com", "goo.gl", "google.co.kr", "googleusercontent.com"] },
    { key: "coupang", name: "쿠팡", official: ["coupang.com"] },
    { key: "toss", name: "토스", official: ["toss.im", "tossbank.com", "tosspayments.com"] },
    { key: "samsung", name: "삼성", official: ["samsung.com", "samsungcard.com"] }
  ];
  var KNOWN_SHORT = { "naver.me": 1, "me2.do": 1, "kko.to": 1, "goo.gl": 1 };

  function createDb(L) {
    var paths = new Set(L.short_paths);
    var pathsLower = new Set(L.short_paths.map(function (s) { return s.toLowerCase(); }));
    var tlds = new Set(COMMON_TLD);
    Object.keys(L.hosts).forEach(function (h) { tlds.add(h.slice(h.lastIndexOf(".") + 1)); });
    Object.keys(L.shorteners).forEach(function (h) { tlds.add(h.slice(h.lastIndexOf(".") + 1)); });
    return { L: L, paths: paths, pathsLower: pathsLower, tlds: tlds,
      platform: new Set(L.platform_regdomains) };
  }

  function regdomain(h) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return h;
    var p = h.split(".");
    if (p.length >= 3 && SECOND_LEVEL[p[p.length - 2]] && p[p.length - 1].length === 2) return p.slice(-3).join(".");
    return p.slice(-2).join(".");
  }

  function trimTail(s) {
    // 문장 부호와 짝이 안 맞는 닫는 괄호를 끝에서 뗍니다
    for (;;) {
      var c = s.charAt(s.length - 1);
      if (".,!?;:'\"".indexOf(c) >= 0) { s = s.slice(0, -1); continue; }
      if (c === ")" && (s.match(/\(/g) || []).length < (s.match(/\)/g) || []).length) { s = s.slice(0, -1); continue; }
      if (c === "]" || c === "}" || c === ">") { s = s.slice(0, -1); continue; }
      return s;
    }
  }

  // 글 속에서 링크를 찾습니다. http(s)로 시작하는 것과, 앞부분 없이 도메인만 적힌 것(예: abc.xyz/a1) 모두 찾습니다.
  function extractLinks(text, db) {
    var notes = [];
    if (typeof text !== "string") text = String(text == null ? "" : text);
    if (text.length > MAX_INPUT) { text = text.slice(0, MAX_INPUT); notes.push("long"); }
    var found = [];
    var masked = text.replace(/https?:\/\/[^\s<>"'`]+/gi, function (m, off) {
      // 주소 뒤에 한글이 바로 붙은 경우(예: …/a1확인) 경로에서 한글 앞까지만 씁니다
      var cut = m;
      var slash = m.indexOf("/", m.indexOf("//") + 2);
      if (slash > 0) {
        var rest = m.slice(slash);
        var bad = rest.search(/[^\x21-\x7e]/);
        if (bad >= 0) cut = m.slice(0, slash + bad);
      } else {
        var hostEnd = m.search(/[^\x21-\x7e¡-￿]/);
        if (hostEnd > 0) cut = m.slice(0, hostEnd);
      }
      found.push({ at: off, raw: trimTail(cut) });
      return new Array(m.length + 1).join(" ");
    });
    var bare = /(^|[^A-Za-z0-9@.\-_/])((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+([A-Za-z]{2,24})(?::\d{2,5})?(?:[/?#][\x21-\x7e]*)?)/g;
    var m;
    while ((m = bare.exec(masked)) !== null) {
      var tld = m[3].toLowerCase();
      if (db && !db.tlds.has(tld)) continue;
      found.push({ at: m.index + m[1].length, raw: trimTail(m[2]) });
    }
    found.sort(function (a, b) { return a.at - b.at; });
    var seen = {}, out = [];
    for (var i = 0; i < found.length; i++) {
      var r = found[i].raw;
      if (!r || r.length < 4) continue;
      var k = r.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
      if (seen[k]) continue;
      seen[k] = 1;
      if (out.length >= MAX_LINKS) { notes.push("many"); break; }
      out.push(r);
    }
    return { links: out, notes: notes };
  }

  function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  function fmtDate(d) { return d ? d.slice(0, 4) + "." + d.slice(5, 7) + "." + d.slice(8, 10) : ""; }

  function analyze(raw, db) {
    var res = { raw: raw, host: "", verdict: "invalid", reasons: [] };
    var s = String(raw || "").trim();
    if (!/^[a-z][a-z0-9+.\-]*:\/\//i.test(s)) s = "http://" + s;
    var u;
    try { u = new URL(s); } catch (e) { return res; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return res;
    var host = u.hostname.toLowerCase().replace(/\.$/, "");
    if (host.charAt(0) === "[" || host.indexOf(".") < 0) return res;
    if (host.indexOf("www.") === 0) host = host.slice(4);
    res.host = host;
    var L = db.L, R = res.reasons;
    var path = u.pathname.replace(/\/+$/, "");
    var keys = [host + path, host + safeDecode(path)];
    var isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host);
    var reg = regdomain(host);
    var tld = host.slice(host.lastIndexOf(".") + 1);

    var exact = keys.some(function (k) { return db.paths.has(k) || db.pathsLower.has(k.toLowerCase()); });
    var h = L.hosts[host];
    if (exact) {
      R.push({ level: "match", text: "주소 전체가 2024년 KISA 피싱사이트 목록에 있습니다." });
    } else if (h) {
      R.push({ level: "match", text: "이 도메인(" + host + ")이 2024년 KISA 피싱사이트 목록에 " + h[0].toLocaleString("ko-KR") +
        "번 올라 있습니다. 처음 " + fmtDate(h[1]) + ", 마지막 " + fmtDate(h[2]) + "에 탐지됐습니다." });
    }

    if (L.shorteners[host] || KNOWN_SHORT[host]) {
      var t = "실제 목적지를 가린 단축 주소입니다. 2024년 탐지 주소의 " + L.stats.short_rows_pct + "%가 단축 주소였습니다.";
      if (L.shorteners[host]) t += " 이 단축 서비스(" + host + ")로 만든 주소는 " + L.shorteners[host].toLocaleString("ko-KR") + "번 탐지됐습니다.";
      R.push({ level: "caution", text: t });
    } else if (L.shared_hosts[host] && !exact) {
      R.push({ level: "info", text: "누구나 페이지를 만들 수 있는 서비스의 주소입니다. 같은 서비스의 다른 주소가 2024년에 " +
        L.shared_hosts[host] + "번 탐지된 적이 있으니, 열린 페이지가 개인정보를 요구하면 멈추세요." });
    }

    if (!exact && !h && !db.platform.has(reg) && L.regdomains[reg]) {
      var g = L.regdomains[reg];
      R.push({ level: "caution", text: "같은 상위 도메인(" + reg + ")의 다른 주소 " + g[0] + "개가 2024년에 " +
        g[1].toLocaleString("ko-KR") + "번 탐지됐습니다." });
    }
    if (!isIp && L.tld_pct[tld]) {
      R.push({ level: "caution", text: "끝부분 ." + tld + "는 2024년 탐지 주소(단축 주소 제외)의 " + L.tld_pct[tld] +
        "%에서 쓰였습니다. 국내 기관·기업이 잘 쓰지 않는 도메인입니다." });
    }
    if (isIp) R.push({ level: "caution", text: "도메인 이름 대신 숫자(IP 주소)로 된 링크입니다. 정상 서비스는 이런 주소를 문자로 보내는 일이 드뭅니다." });
    if (host.indexOf("xn--") >= 0) R.push({ level: "caution", text: "특수 문자나 한글이 섞인 도메인(" + host + ")입니다. 진짜 사이트와 비슷하게 보이도록 만든 주소일 수 있습니다." });
    if (u.username) R.push({ level: "caution", text: "주소 안에 @가 있습니다. 실제로 접속하는 곳은 @ 뒤의 " + host + "입니다." });
    BRANDS.forEach(function (b) {
      if (host.indexOf(b.key) >= 0 && b.official.indexOf(reg) < 0 && b.official.indexOf(host) < 0) {
        R.push({ level: "caution", text: "‘" + b.key + "’가 들어 있지만 " + b.name + " 공식 도메인(" + b.official[0] + ")이 아닙니다." });
      }
    });

    if (R.some(function (r) { return r.level === "match"; })) res.verdict = "match";
    else if (R.some(function (r) { return r.level === "caution"; })) res.verdict = "caution";
    else res.verdict = "unlisted";
    return res;
  }

  var api = { createDb: createDb, extractLinks: extractLinks, analyze: analyze, regdomain: regdomain,
    MAX_INPUT: MAX_INPUT, MAX_LINKS: MAX_LINKS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BTChecker = api;
})(typeof window !== "undefined" ? window : this);
