#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""10번 논문 저장소의 원자료와 분석 결과로 앱이 쓰는 데이터 두 개를 만듭니다.

사용법:
  python3 tools/prepare_data.py <논문 저장소 폴더>
결과:
  data/lookup.js  피싱 주소 대조 목록과 위험 신호 통계 (window.BT_LOOKUP)
  data/paper.js   논문 결과: 일별 탐지량, 명절 직전 2주 수치 (window.BT_PAPER)
  파일을 JS로 두는 이유: index.html을 더블클릭(file://)해도 서버 없이 바로 열리게 하려는 것입니다.
표준 라이브러리만 씁니다. 같은 입력이면 같은 결과가 나옵니다.
"""
import csv, hashlib, json, re, statistics, sys, urllib.parse
from collections import Counter, defaultdict
from pathlib import Path

PAPER = Path(sys.argv[1] if len(sys.argv) > 1 else "../t10-holiday-phishing")
OUT = Path(__file__).resolve().parent.parent / "data"
SRC = PAPER / "data" / "kisa_phishing_20241231.csv"
SECOND_LEVEL = {"co", "or", "go", "ac", "ne", "re", "pe", "com", "net", "org"}
COMMON_TLD = {"com", "net", "org", "kr", "co", "io", "me", "jp", "us", "info", "biz", "edu", "gov"}
# 누구나 글·페이지·단축 주소를 만들 수 있는 정상 서비스. 이 도메인 자체는 주소 전체(경로까지)가 같을 때만 일치로 봅니다.
PLATFORM_REG = {"naver.com", "naver.me", "me2.do", "kakao.com", "kko.to", "t.me", "google.com", "goo.gl",
                "amazonaws.com", "wordpress.com", "cafe24.com", "creatorlink.net", "netlify.app", "vercel.app",
                "github.io", "pages.dev", "web.app", "firebaseapp.com", "blogspot.com", "tistory.com",
                "notion.site", "daum.net"}
SHARED_HOSTS = {"m.site.naver.com", "pf.kakao.com", "open.kakao.com", "s3-ap-east-1.amazonaws.com"}


def split(u):
    u = u.strip()
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", u):
        u = "http://" + u
    try:
        p = urllib.parse.urlsplit(u)
        h = (p.hostname or "").lower().rstrip(".")
    except ValueError:
        return None
    if not h:
        return None
    if h.startswith("www."):
        h = h[4:]
    return h, p.path.rstrip("/")


def regdomain(h):
    if re.fullmatch(r"\d+\.\d+\.\d+\.\d+", h):
        return h
    parts = h.split(".")
    if len(parts) >= 3 and parts[-2] in SECOND_LEVEL and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def main():
    raw = SRC.read_bytes()
    rows = list(csv.reader(raw.decode("utf-8-sig").splitlines()))[1:]
    host_rows, first, last = Counter(), {}, {}
    paths = defaultdict(set)
    bad = 0
    for row in rows:
        if len(row) < 2:
            bad += 1; continue
        d, u = row[0].strip(), row[1]
        s = split(u)
        if not s:
            bad += 1; continue
        h, p = s
        host_rows[h] += 1
        first[h] = min(first.get(h, d), d); last[h] = max(last.get(h, d), d)
        paths[h].add(p)

    # 단축 주소: 서로 다른 경로가 20개 이상이고 경로 길이 중앙값이 10자 이하인 호스트
    short = sorted(h for h, ps in paths.items()
                   if len([x for x in ps if x]) >= 20 and statistics.median(len(x) for x in ps if x) <= 10)
    short_set = set(short)
    shared = sorted(h for h in host_rows if h in SHARED_HOSTS or (regdomain(h) in PLATFORM_REG and h == regdomain(h)))
    path_level = short_set | set(shared)
    total = sum(host_rows.values())
    short_rows = sum(host_rows[h] for h in short)

    hosts = {h: [host_rows[h], first[h], last[h]] for h in sorted(host_rows) if h not in path_level}
    short_paths = sorted({h + p for h in path_level for p in paths[h] if p})
    reg = defaultdict(lambda: [0, 0])
    for h in hosts:
        r = regdomain(h); reg[r][0] += 1; reg[r][1] += host_rows[h]
    reg = {k: v for k, v in sorted(reg.items()) if v[0] >= 2 and k not in PLATFORM_REG}
    tld_rows = Counter()
    for h, n in host_rows.items():
        if h in short_set or re.fullmatch(r"\d+\.\d+\.\d+\.\d+", h):
            continue
        tld_rows[h.rsplit(".", 1)[-1]] += n
    nonshort = sum(tld_rows.values())
    tld = {t: round(n / nonshort * 100, 1) for t, n in sorted(tld_rows.items())
           if t not in COMMON_TLD and n / nonshort >= 0.005}

    lookup = {
        "source": "한국인터넷진흥원_피싱사이트_20241231 (공공데이터포털, 이용허락범위 제한 없음)",
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "stats": {"rows": total, "bad_rows": bad, "distinct_hosts": len(host_rows),
                  "short_hosts": len(short), "short_rows_pct": round(short_rows / total * 100, 1)},
        "hosts": hosts,
        "shorteners": {h: host_rows[h] for h in short},
        "shared_hosts": {h: host_rows[h] for h in shared},
        "platform_regdomains": sorted(PLATFORM_REG),
        "short_paths": short_paths,
        "regdomains": reg,
        "tld_pct": tld,
    }

    rep = json.loads((PAPER / "out" / "report.json").read_text(encoding="utf-8"))
    with open(PAPER / "out" / "daily_counts.csv", encoding="utf-8") as f:
        daily = [[r["date"], int(r["unique_urls"])] for r in csv.DictReader(f)]
    u = rep["unique"]
    paper = {
        "title": "명절 연휴 직전 피싱사이트 탐지량의 변화",
        "verdict": rep["verdict"],
        "base_mean": round(u["base_mean"], 1),
        "n_base_days": u["n_base_days"],
        "windows": [{"name": k, "range": u[k]["window"], "mean": round(u[k]["mean"], 1),
                     "ratio": round(u[k]["ratio_vs_base"], 2), "rank": u[k]["rank"], "n": u[k]["n_windows"]}
                    for k in ("설", "추석")],
        "daily": daily,
    }
    OUT.mkdir(exist_ok=True)
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
    (OUT / "lookup.js").write_text("window.BT_LOOKUP=" + dump(lookup), encoding="utf-8", newline="\n")
    (OUT / "paper.js").write_text("window.BT_PAPER=" + dump(paper), encoding="utf-8", newline="\n")
    print(f"rows {total} · hosts {len(host_rows)} · 단축 주소 서비스 {len(short)}개({lookup['stats']['short_rows_pct']}%) · "
          f"공용 서비스 {len(shared)}개 · 경로 단위 {len(short_paths)} · 상위 도메인 {len(reg)} · 주의 TLD {len(tld)}")


if __name__ == "__main__":
    main()
