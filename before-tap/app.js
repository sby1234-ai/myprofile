/* 누르기 전에 — 화면 동작. 판정은 checker.js, 데이터는 data/*.js가 맡습니다.
 * 받은 문자는 말풍선에 글자로만 다시 보여 주고, 링크를 누를 수 있게 만들지 않습니다.
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var input = $("input"), btnCheck = $("btn-check"), statusEl = $("status");
  var bubble = $("bubble"), results = $("results"), threadLabel = $("thread-label");
  var summary = $("summary"), after = $("after");
  var db = null, last = null;

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
      if (r.verdict === "match") {
        var call = el("a", "tel-btn", "이미 눌렀다면 118에 전화하기");
        call.href = "tel:118";
        card.appendChild(call);
      }
      results.appendChild(card);
    });
    var msg = [];
    if (notes.indexOf("long") >= 0) msg.push("글이 너무 길어 앞부분 " + BTChecker.MAX_INPUT.toLocaleString("ko-KR") + "자만 확인했습니다.");
    if (notes.indexOf("many") >= 0) msg.push("링크가 많아 앞의 " + BTChecker.MAX_LINKS + "개만 확인했습니다.");
    if (msg.length) results.appendChild(el("p", "note", msg.join(" ")));
  }


  // 결과 맨 위 한 줄 요약: 가장 위험한 판정을 먼저 크게 보여 줍니다
  function drawSummary(list, isSample) {
    var n = { match: 0, caution: 0, unlisted: 0, invalid: 0 };
    list.forEach(function (r) { n[r.verdict]++; });
    summary.className = "summary";
    summary.textContent = "";
    if (!list.length) { summary.hidden = true; return n; }
    var kind, head, body;
    if (n.match) {
      kind = "match"; head = "위험한 링크가 " + n.match + "개 있습니다";
      body = "누르지 말고 문자를 지우세요. 이미 눌렀다면 개인정보를 넣지 말고 118에 상담하세요.";
    } else if (n.caution) {
      kind = "caution"; head = "주의할 링크가 " + n.caution + "개 있습니다";
      body = "목록에는 없지만 피싱 주소에서 자주 보인 특징이 있습니다. 보낸 사람에게 다른 방법으로 먼저 확인하세요.";
    } else {
      kind = "unlisted"; head = "목록에 있는 링크는 없습니다";
      body = "안전하다는 뜻은 아닙니다. 모르는 번호에서 왔다면 누르지 마세요.";
    }
    summary.classList.add(kind);
    if (isSample) summary.appendChild(el("span", "tag", "예시"));
    summary.appendChild(el("strong", null, head));
    summary.appendChild(el("span", "body", body));
    var counts = "링크 " + list.length + "개 · 위험 " + n.match + " · 주의 " + n.caution + " · 미확인 " + (n.unlisted + n.invalid);
    summary.appendChild(el("span", "counts", counts));
    summary.hidden = false;
    return n;
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
      drawSummary(list, isSample);
      last = isSample ? null : list;
      after.hidden = isSample || !list.length;
      if (isSample) { setStatus(""); return; }
      setStatus(list.length ? "확인했습니다. 아래 결과를 보세요." : "");
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
  function reset(focus) {
    input.value = ""; setStatus("");
    check(SAMPLE, true);
    if (focus) {
      document.querySelector(".compose").scrollIntoView({ behavior: "smooth", block: "start" });
      try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    }
  }
  $("btn-clear").addEventListener("click", function () { reset(true); });
  $("btn-again").addEventListener("click", function () { reset(true); });
  // 붙여 넣으면 버튼을 누르지 않아도 바로 확인합니다
  input.addEventListener("paste", function () { setTimeout(function () { if (input.value.trim()) run(); }, 0); });

  // 결과를 가족·지인에게 보낼 수 있게 글로 복사합니다. 주소는 실수로 눌리지 않게 바꿔 적습니다(http → hxxp, . → [.])
  function defang(u) { return u.replace(/^http/i, "hxxp").replace(/\./g, "[.]"); }
  function resultText(list) {
    var lines = ["[누르기 전에] 받은 문자의 링크를 확인했습니다."];
    list.forEach(function (r, i) {
      var c = COPY[r.verdict];
      lines.push((NUM[i] || (i + 1)) + " " + c.seal + " · " + c.title + " — " + defang(r.raw));
    });
    lines.push("");
    lines.push("※ 주소는 실수로 눌리지 않게 바꿔 적었습니다. 이미 눌렀다면 국번 없이 118(KISA 상담센터)에 상담하세요.");
    lines.push("확인한 곳: " + location.origin + location.pathname);
    return lines.join("\n");
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (ok, fail) {
      var ta = el("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? ok() : fail(); } catch (e) { fail(e); }
      document.body.removeChild(ta);
    });
  }
  $("btn-copy").addEventListener("click", function () {
    if (!last || !last.length) return;
    var b = this;
    copyText(resultText(last)).then(function () {
      b.textContent = "복사했습니다 ✓";
      setTimeout(function () { b.textContent = "결과 복사해서 알려 주기"; }, 2000);
    }).catch(function () { setStatus("복사하지 못했습니다. 결과 화면을 캡처해서 보내 주세요."); });
  });
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

  // ---- 시작
  try {
    db = BTChecker.createDb(window.BT_LOOKUP);
    btnCheck.disabled = false;
  } catch (e) {
    setStatus("피싱 주소 목록을 불러오지 못했습니다. 페이지를 새로 고치거나, 묶음은 README대로 실행해 주세요.");
  }
  if (db && !fromShare()) check(SAMPLE, true);

  if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
