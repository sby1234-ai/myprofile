"""KISA 피싱사이트 공공데이터에 새 목록이 올라왔는지 확인합니다.

「누르기 전에」 앱(before-tap/)은 공공데이터포털의 「한국인터넷진흥원_피싱사이트」 파일을 씁니다.
이 파일은 1년에 한 번 새로 올라오므로, 데이터 페이지에 적힌 파일 이름의 날짜(예: _20241231)가
앱이 쓰는 날짜보다 새로우면 "새 목록 있음"으로 알립니다. API 키 없이 공개 페이지만 읽습니다.

결과는 GITHUB_OUTPUT(state, latest, modified, detail)과 status.json으로 남깁니다.
  state = new     : 더 새로운 날짜의 파일이 있음
          same    : 앱이 쓰는 목록이 최신
          unknown : 페이지를 읽지 못했거나 형식이 바뀌어 날짜를 찾지 못함
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

PAGE = os.environ.get("KISA_PAGE", "https://www.data.go.kr/data/15143094/fileData.do")
CURRENT = os.environ.get("CURRENT_LIST_DATE", "20241231")
KST = timezone(timedelta(hours=9))


def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; before-tap-list-check; +https://github.com/sby1234-ai/myprofile)",
        "Accept-Language": "ko-KR,ko;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", errors="replace")


def main():
    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M KST")
    out = {"checked_at": now, "page": PAGE, "current": CURRENT,
           "state": "unknown", "latest": "", "modified": "", "detail": ""}
    try:
        html = fetch(PAGE)
        dates = sorted(set(re.findall(r"피싱사이트(?:\s*URL)?_(\d{8})", html)))
        mod = re.search(r"수정일[^0-9]{0,80}(\d{4}-\d{2}-\d{2})", html)
        out["modified"] = mod.group(1) if mod else ""
        if not dates:
            out["detail"] = "페이지에서 「피싱사이트_날짜」 형식의 파일 이름을 찾지 못했습니다. 페이지 형식이 바뀌었을 수 있습니다."
        else:
            out["latest"] = dates[-1]
            if dates[-1] > CURRENT:
                out["state"] = "new"
                out["detail"] = f"새 목록 { dates[-1] }이(가) 올라왔습니다. 앱은 { CURRENT } 목록을 쓰고 있습니다."
            else:
                out["state"] = "same"
                out["detail"] = f"앱이 쓰는 { CURRENT } 목록이 최신입니다."
    except Exception as e:  # 네트워크 오류도 알림 대상으로 남깁니다
        out["detail"] = f"페이지를 읽지 못했습니다: {type(e).__name__}: {e}"

    with open("status.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            for k in ("state", "latest", "modified", "detail", "checked_at"):
                f.write(f"{k}={out[k]}\n")
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
