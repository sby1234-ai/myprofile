/* 누르기 전에 — 화면 동작. 판정은 checker.js, 데이터는 data/*.js가 맡습니다.
 * 받은 문자는 말풍선에 글자로만 다시 보여 주고, 링크를 누를 수 있게 만들지 않습니다.
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var input = $("input"), btnCheck = $("btn-check"), statusEl = $("status");
  var bubble = $("bubble"), results = $("results"), threadLabel = $("thread-label");
  var db = null;

  var SAMPLE = "[Web발신] 고객님 택배가 주소 불일치로 보관 중입니다. 주소 확인: http://xgo.kr/5ni\n" +
    "[국외발신] 모바일 청첩장이 도착했어요 https://bit.ly/3WeddingK\n" +
    "이번 달 명세서 안내 https://www.naver.com";

  var COPY = {
    match: { seal: "위험", title: "누르지 마세요",
      todo: "링크를 누르지 말고 문자를 지우세요. 이미 눌렀다면 개인정보나 인증번호를 넣지 말고 118에 상담하세요." },
    caution: { seal: "주의", title: "한 번 더 확인하세요",
      todo: "보낸 사람에게 전화 같은 다른 방법으로 먼저 확인하세요. 앱 설치(.apk)나 개인정보·인증번호를 요구하면 멈추세요." },
    unlisted: { seal: "미확인", title: "2024년 목록에 없습니다",
      todo: "안전하다는 뜻은 아닙니다. 모르는 번호에서 왔다면 누르지 마세요. 열었는데 앱 설치나 개인정보를 요구하면 멈추세요." },
    invalid: { seal: "?", title: "주소로 읽을 수 없습니다",
      todo: "주소 전체(http부터 끝까지)가 들어갔는지 확인해 주세요." }
  };
  var NUM = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function setStatus(t) { statusEl.textContent = t || ""; }

  // 받은 문자를 말풍선으로 다시 그리고, 찾은 링크마다 판정 색과 번호를 붙입니다
  function drawBubble(text, list) {
    bubble.textContent = "";
    var cursor = 0;
    list.forEach(function (r, i) {
      var at = text.indexOf(r.raw, cursor);
      if (at < 0) return;
      if (at > cursor) bubble.appendChild(document.createTextNode(text.slice(cursor, at)));
      var m = el("span", "lk " + r.verdict, r.raw);
      m.appendChild(el("sup", null, NUM[i] || String(i + 1)));
      bubble.appendChild(m);
      cursor = at + r.raw.length;
    });
    if (cursor < text.length) bubble.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function drawResults(list, notes) {
    results.textContent = "";
    if (!list.length) {
      results.appendChild(el("p", "note", "링크를 찾지 못했습니다. 주소 전체가 들어 있는지 확인해 주세요. 예) http://… 또는 abc.xyz/a1"));
      return;
    }
    list.forEach(function (r, i) {
      var c = COPY[r.verdict];
      var card = el("article", "result " + r.verdict);
      var seal = el("div", "seal", c.seal);
      seal.setAttribute("aria-hidden", "true");
      card.appendChild(seal);
      card.appendChild(el("h3", null, (NUM[i] || i + 1) + " " + c.title));
      card.appendChild(el("code", "url", r.raw));
      var ul = el("ul");
      if (!r.reasons.length && r.verdict === "unlisted") {
        ul.appendChild(el("li", "", "2024년 목록과 일치하지 않고, 탐지 주소에서 자주 보인 특징도 없습니다."));
      }
      r.reasons.forEach(function (x) { ul.appendChild(el("li", x.level, x.text)); });
      if (ul.childNodes.length) card.appendChild(ul);
      card.appendChild(el("p", "todo", c.todo));
      results.appendChild(card);
    });
    var msg = [];
    if (notes.indexOf("long") >= 0) msg.push("글이 너무 길어 앞부분 " + BTChecker.MAX_INPUT.toLocaleString("ko-KR") + "자만 확인했습니다.");
    if (notes.indexOf("many") >= 0) msg.push("링크가 많아 앞의 " + BTChecker.MAX_LINKS + "개만 확인했습니다.");
    if (msg.length) results.appendChild(el("p", "note", msg.join(" ")));
  }

  function check(text, isSample) {
    if (!db) return;
    try {
      var ex = BTChecker.extractLinks(text, db);
      var list = ex.links.map(function (l) { return BTChecker.analyze(l, db); });
      var shown = text.length > BTChecker.MAX_INPUT ? text.slice(0, BTChecker.MAX_INPUT) : text;
      drawBubble(shown, list);
      drawResults(list, ex.notes);
      threadLabel.textContent = isSample ? "예시: 이런 문자를 받았다면" : "받은 문자";
      if (isSample) { setStatus(""); return; }
      var n = { match: 0, caution: 0, unlisted: 0, invalid: 0 };
      list.forEach(function (r) { n[r.verdict]++; });
      setStatus(list.length ? "링크 " + list.length + "개를 확인했습니다. 위험 " + n.match + ", 주의 " + n.caution +
        ", 미확인 " + (n.unlisted + n.invalid) : "");
      document.querySelector(".thread").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      results.textContent = "";
      results.appendChild(el("p", "note", "확인하는 중에 문제가 생겼습니다. 내용을 조금 줄여서 다시 해 보세요."));
    }
  }
  function run() {
    if (!input.value.trim()) { setStatus("받은 문자나 링크를 먼저 넣어 주세요."); input.focus(); return; }
    check(input.value, false);
  }

  // ---- 입력 방법
  btnCheck.addEventListener("click", run);
  $("btn-clear").addEventListener("click", function () { input.value = ""; setStatus(""); input.focus(); });
  $("btn-sample").addEventListener("click", function () { check(SAMPLE, true); });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run(); });
  $("btn-paste").addEventListener("click", function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      setStatus("이 브라우저는 붙여넣기 버튼을 지원하지 않습니다. 입력칸을 길게 눌러 붙여 넣어 주세요.");
      input.focus(); return;
    }
    navigator.clipboard.readText().then(function (t) {
      if (!t) { setStatus("복사해 둔 내용이 없습니다."); return; }
      input.value = t; run();
    }).catch(function () {
      setStatus("붙여넣기 권한을 받지 못했습니다. 입력칸을 길게 눌러 붙여 넣어 주세요.");
      input.focus();
    });
  });

  // 안드로이드 공유하기로 들어온 경우 (manifest의 share_target)
  function fromShare() {
    var q = new URLSearchParams(location.search);
    var parts = ["title", "text", "url"].map(function (k) { return q.get(k) || ""; }).filter(Boolean);
    if (!parts.length) return false;
    input.value = parts.join("\n");
    history.replaceState(null, "", location.pathname);  // 받은 링크가 주소창·방문 기록에 남지 않게 지웁니다
    run();
    return true;
  }

  // 아이폰은 웹 앱 공유하기 연결을 지원하지 않으므로 안내를 바꿉니다
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    $("way-share").textContent = "아이폰은 공유하기 연결이 지원되지 않습니다. 문자에서 링크를 길게 눌러 복사한 뒤 붙여넣기 버튼을 쓰세요.";
  }
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferred = e;
    var b = $("btn-install"); if (b) b.hidden = false;
  });
  document.addEventListener("click", function (e) {
    if (!e.target || e.target.id !== "btn-install" || !deferred) return;
    deferred.prompt();
    deferred.userChoice.finally(function () { deferred = null; e.target.hidden = true; });
  });

  // ---- 논문 결과: 그래프와 날짜 고르기
  var WEEK = ["일", "월", "화", "수", "목", "금", "토"];
  var P = window.BT_PAPER;
  var bars = [];
  function inWindow(d) {
    for (var i = 0; i < P.windows.length; i++) {
      var r = P.windows[i].range.split("~");
      if (d >= r[0] && d <= r[1]) return P.windows[i].name;
    }
    return "";
  }
  function drawChart() {
    var NS = "http://www.w3.org/2000/svg";
    // 화면 폭에 맞춰 실제 픽셀 크기로 그려 글자가 작아지지 않게 합니다
    var box = $("chart");
    box.textContent = ""; bars = [];
    var W = Math.max(280, Math.round(box.clientWidth || 600)), H = W < 480 ? 190 : 220, L = 40, R = 6, T = 24, B = 24;
    var narrow = W < 520;
    var max = 0;
    P.daily.forEach(function (d) { if (d[1] > max) max = d[1]; });
    var yMax = Math.ceil(max / 200) * 200;
    var bw = (W - L - R) / P.daily.length;
    var y = function (v) { return T + (H - T - B) * (1 - v / yMax); };
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    function add(tag, attrs, text) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      svg.appendChild(e); return e;
    }
    var idx = {};
    P.daily.forEach(function (d, i) { idx[d[0]] = i; });
    P.windows.forEach(function (w) {
      var r = w.range.split("~"), a = idx[r[0]], b = idx[r[1]];
      add("rect", { "class": "w", x: L + a * bw, y: T, width: (b - a + 1) * bw, height: H - T - B });
      add("text", { "class": "wl", x: L + a * bw, y: T - 8 }, w.name + " 직전");
    });
    [0, yMax / 2, yMax].forEach(function (v) {
      add("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, v.toLocaleString("ko-KR"));
    });
    P.daily.forEach(function (d, i) {
      bars.push(add("rect", { "class": "b", x: L + i * bw, y: y(d[1]), width: Math.max(bw - 0.4, 0.8), height: y(0) - y(d[1]) }));
    });
    add("line", { "class": "m", x1: L, x2: W - R, y1: y(P.base_mean), y2: y(P.base_mean) });
    for (var m = 1; m <= 12; m += narrow ? 2 : 1) {
      var key = "2024-" + (m < 10 ? "0" : "") + m + "-01";
      add("text", { x: L + idx[key] * bw, y: H - 6 }, m + "월");
    }
    box.appendChild(svg);
  }
  function readout() {
    var v = $("day").value, out = $("readout");
    var i = -1;
    for (var k = 0; k < P.daily.length; k++) if (P.daily[k][0] === v) { i = k; break; }
    bars.forEach(function (b, k) { b.setAttribute("class", k === i ? "b sel" : "b"); });
    if (i < 0) { out.textContent = "2024년 1월 1일부터 12월 31일 사이의 날짜를 골라 주세요."; return; }
    var n = P.daily[i][1], dt = new Date(v + "T00:00:00");
    var ratio = (n / P.base_mean).toFixed(2);
    var w = inWindow(v);
    out.textContent = (dt.getMonth() + 1) + "월 " + dt.getDate() + "일(" + WEEK[dt.getDay()] + ")에는 피싱 주소 " +
      n.toLocaleString("ko-KR") + "개가 탐지됐습니다. 평소 하루 평균 " + P.base_mean + "개의 " + ratio + "배입니다." +
      (w ? " 이날은 " + w + " 연휴 직전 2주에 들어갑니다." : "");
  }
  function table() {
    var tb = $("win-table");
    var tr = el("tr");
    ["평소 (" + P.n_base_days + "일)", P.base_mean.toFixed(1) + "개", "1.00배", "—"].forEach(function (t) { tr.appendChild(el("td", null, t)); });
    tb.appendChild(tr);
    P.windows.forEach(function (w) {
      var r = el("tr");
      var a = w.range.split("~").map(function (s) { return Number(s.slice(5, 7)) + "/" + Number(s.slice(8, 10)); });
      [w.name + " 직전 2주 (" + a[0] + "~" + a[1] + ")", w.mean.toFixed(1) + "개", w.ratio.toFixed(2) + "배", w.rank + "위"]
        .forEach(function (t) { r.appendChild(el("td", null, t)); });
      tb.appendChild(r);
    });
    $("base-mean").textContent = P.base_mean.toFixed(1);
  }
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { try { drawChart(); readout(); } catch (e) {} }, 150);
  });

  // ---- 시작
  try {
    db = BTChecker.createDb(window.BT_LOOKUP);
    btnCheck.disabled = false;
  } catch (e) {
    setStatus("피싱 주소 목록을 불러오지 못했습니다. 페이지를 새로 고치거나, 묶음은 README대로 실행해 주세요.");
  }
  try { drawChart(); table(); readout(); $("day").addEventListener("input", readout); $("day").addEventListener("change", readout); }
  catch (e) { $("readout").textContent = "논문 결과를 불러오지 못했습니다."; }
  if (db && !fromShare()) check(SAMPLE, true);

  if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
