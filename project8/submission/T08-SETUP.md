# 과제 8 배포 가이드 — 패스키(WebAuthn) 붙이기

이 문서는 `project8` 폴더 안의 코드(스키마 1개 + Edge Function 7개 + 수정된 `index.html`)를
실제로 동작하게 만드는 데 필요한 **모든 명령어**를 처음부터 끝까지 순서대로 담았습니다.
중간에 빠진 단계가 없도록, "이 명령어 실행 전에 이게 먼저 되어 있어야 한다"는 것까지 각 단계에 적어두었습니다.

**중요 — 이 단계들은 본인이 직접 실행해야 합니다.**
Supabase 프로젝트 생성, CLI 로그인, 시크릿 등록, 함수 배포는 전부 실제 계정 인증이 필요한 작업이라
AI가 대신 로그인하거나 실행할 수 없습니다. 아래는 그대로 따라 하면 되는 "레시피"입니다.

---

## 0. 준비물 확인

- Supabase 계정 (없으면 https://supabase.com 에서 무료 가입)
- Node.js 18 이상 (터미널에서 `node -v` 로 확인)
- Git, 그리고 기존에 쓰던 `myprofile` GitHub 저장소에 대한 push 권한
- 이 대화에서 전달받는 `project8.zip` 압축 파일을 로컬 PC 아무 폴더에 풀어두기
  (예: `~/dev/project8`)

압축을 풀면 아래 구조여야 합니다.

```
project8/
├─ site/
│  └─ index.html                 (수정된 소개 페이지 — 나중에 myprofile 저장소로 옮길 파일)
├─ submission/
│  └─ T08-SETUP.md               (지금 읽고 있는 이 문서)
└─ supabase/
   ├─ migrations/
   │  └─ 0001_passkeys.sql
   └─ functions/
      ├─ _shared/
      │  ├─ cors.ts
      │  ├─ config.ts
      │  └─ supabase.ts
      ├─ passkey-register-start/index.ts
      ├─ passkey-register-verify/index.ts
      ├─ passkey-login-start/index.ts
      ├─ passkey-login-verify/index.ts
      ├─ passkey-list/index.ts
      ├─ passkey-delete/index.ts
      └─ private-notes/index.ts
```

---

## 1. Supabase 프로젝트 만들기 (대시보드에서, 직접)

1. https://supabase.com/dashboard 로그인
2. **New project** 클릭
3. 아래 값 입력
   - Name: 원하는 이름 (예: `myprofile-passkey`)
   - Database Password: 아무 값이나 강력한 비밀번호로 직접 생성해서 **본인만 보관** (AI에게 공유하지 마세요 — 이 문서 어디에도 적지 않습니다)
   - Region: 가까운 지역 아무거나 (예: Northeast Asia (Seoul) 있으면 그걸로)
4. 프로젝트 생성이 끝나면(1~2분 소요) 좌측 메뉴 **Project Settings → API** 로 이동해서 아래 두 값을 메모장에 복사해두기
   - `Project URL` (예: `https://abcdxyz.supabase.co`)
   - `anon public` 키 (긴 문자열)
5. 같은 화면에서 **Project Settings → General** 에 있는 `Reference ID` 도 복사해두기 (예: `abcdxyz`) — CLI 연결에 필요합니다.

---

## 2. Supabase CLI 설치 & 로그인

터미널에서 (Node.js가 있다면 npx로 바로 실행 가능, 전역 설치를 원하면 npm 사용):

```bash
# 버전 확인 (설치 없이 npx로 실행해도 됨)
npx supabase --version

# 전역 설치를 원하는 경우 (macOS/Linux, Homebrew)
brew install supabase/tap/supabase

# 전역 설치 (Windows, Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

로그인 (브라우저가 열리며 Supabase 계정으로 인증):

```bash
npx supabase login
```

---

## 3. 로컬 프로젝트를 Supabase 프로젝트와 연결

압축을 푼 `project8` 폴더로 이동한 뒤:

```bash
cd project8

# 이미 supabase/ 폴더와 config가 없다면 초기화 (기존 migrations/functions 폴더는 그대로 유지됨)
npx supabase init

# 1단계에서 복사해둔 Reference ID로 연결
npx supabase link --project-ref <여기에-Reference-ID>
```

`link` 실행 중 데이터베이스 비밀번호를 물어보면 1단계에서 만든 비밀번호를 입력합니다.

---

## 4. DB 스키마 적용 (테이블 4개 + RLS 정책)

```bash
npx supabase db push
```

이 명령이 `supabase/migrations/0001_passkeys.sql`을 실제 프로젝트 DB에 적용합니다.
(터미널 대신 대시보드의 **SQL Editor**에 `0001_passkeys.sql` 내용을 붙여넣고 실행해도 동일합니다.)

**확인 방법**: 대시보드 → **Table Editor** 에서 `passkey_accounts`, `passkey_credentials`,
`passkey_challenges`, `private_notes` 4개 테이블이 보이면 성공입니다.

---

## 5. 함수용 시크릿(비밀 환경변수) 등록

WebAuthn은 "어느 도메인에서 요청이 왔는지"를 엄격히 검사합니다.
`RP_ID`는 도메인만(프로토콜/경로 제외), `EXPECTED_ORIGIN`은 프로토콜+도메인까지 정확히 일치해야 합니다.

GitHub Pages 배포 주소가 `https://sby1234-ai.github.io/myprofile/` 라면:

```bash
npx supabase secrets set RP_ID=sby1234-ai.github.io
npx supabase secrets set EXPECTED_ORIGIN=https://sby1234-ai.github.io
```

> 주의: `RP_ID`에 경로(`/myprofile`)나 `https://`를 붙이면 안 됩니다. WebAuthn 표준상 RP ID는
> 순수 도메인만 허용합니다. 실제 페이지가 하위 경로(`/myprofile/`)에 있어도 origin은 도메인
> 루트 기준이므로 위 값 그대로 사용합니다.

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`는 Supabase가 함수 실행 시
자동으로 주입하므로 따로 등록할 필요가 없습니다.

**확인 방법**: `npx supabase secrets list` 실행 시 `RP_ID`, `EXPECTED_ORIGIN`이 목록에 보이면 성공.

---

## 6. Edge Function 7개 배포

이 프로젝트의 모든 함수는 자체적으로 `Authorization` 헤더를 검사합니다
(`_shared/supabase.ts`의 `getUserFromRequest`). 그런데 Supabase는 기본적으로 함수 진입 전
게이트웨이 단계에서 "유효한 Supabase JWT가 있는가"를 먼저 검사하는데, 이렇게 되면 로그인 전
단계인 `passkey-register-start`/`passkey-login-start`/`passkey-login-verify` 같은
비로그인 요청이 함수 코드에 도달하기도 전에 차단됩니다. 그래서 7개 함수 전부
`--no-verify-jwt` 옵션으로 배포합니다 (인증 검사는 각 함수 코드가 직접 수행).

```bash
npx supabase functions deploy passkey-register-start --no-verify-jwt
npx supabase functions deploy passkey-register-verify --no-verify-jwt
npx supabase functions deploy passkey-login-start --no-verify-jwt
npx supabase functions deploy passkey-login-verify --no-verify-jwt
npx supabase functions deploy passkey-list --no-verify-jwt
npx supabase functions deploy passkey-delete --no-verify-jwt
npx supabase functions deploy private-notes --no-verify-jwt
```

**확인 방법**: 대시보드 → **Edge Functions** 메뉴에 7개 함수가 모두 `Deployed` 상태로 보이면 성공.

### 참고: 라이브러리 버전 고정 이유

함수 코드에서 `npm:@simplewebauthn/server@11` 처럼 버전을 **11로 고정**해서 불러오고 있습니다.
이 라이브러리는 v10부터 반환 형식이 바뀐 적이 있어서, 버전을 고정하지 않으면 나중에 배포할 때
자동으로 최신 버전이 받아지면서 코드가 기대하는 응답 모양과 달라져 조용히 깨질 수 있습니다.
그래서 지금 코드는 항상 v11을 명시적으로 요청하도록 고정해두었습니다. 나중에 라이브러리를
올리고 싶다면 `verifyRegistrationResponse`/`verifyAuthenticationResponse`의 반환값 구조가
바뀌었는지 공식 변경 로그를 먼저 확인해야 합니다.

---

## 7. 프론트엔드(`site/index.html`)에 실제 값 채워넣기

`site/index.html` 파일을 열어 아래 두 줄을 찾습니다 (1057~1058번째 줄 근처):

```js
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-KEY";
```

1단계에서 복사해둔 실제 `Project URL`과 `anon public` 키로 바꿔줍니다.

```js
const SUPABASE_URL = "https://abcdxyz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJI...(실제 anon 키)";
```

> `anon` 키는 공개되어도 되는 키입니다 (RLS로 보호되는 값). `service_role` 키는 절대
> 프론트엔드 코드에 넣지 않습니다 — Edge Function 안에서만 자동으로 쓰입니다.

---

## 8. 수정된 `index.html`을 `myprofile` 저장소에 반영 (직접 업로드)

기존 방식과 동일하게, 본인 GitHub 계정으로 직접 업로드합니다 (AI는 push 권한이 없습니다).

```bash
cd ~/dev/myprofile          # 기존 myprofile 저장소를 클론해둔 로컬 경로
cp ~/dev/project8/site/index.html ./index.html
git add index.html
git commit -m "feat: 비공개 영역에 패스키(WebAuthn) 인증 추가"
git push
```

GitHub Pages가 자동으로 재배포하며, 보통 1분 이내에 `https://sby1234-ai.github.io/myprofile/`
에 반영됩니다.

---

## 9. 배포 확인 (curl로 함수 살아있는지 먼저 점검)

브라우저까지 가기 전에, 함수 자체가 응답하는지 터미널에서 먼저 확인합니다.
`<PROJECT_URL>`은 1단계에서 복사한 실제 주소로 바꿔서 실행합니다.

```bash
# 새 계정 등록 시작 — challenge와 WebAuthn 옵션이 JSON으로 와야 정상
curl -s -X POST "<PROJECT_URL>/functions/v1/passkey-register-start" \
  -H "Content-Type: application/json" \
  -d '{"handle":"test-account-a","device_name":"curl-check"}'
```

`{"challengeId":"...", "options": {...}}` 형태가 나오면 여기까지는 정상입니다.
(실제 패스키 등록 완료는 브라우저의 `navigator.credentials.create()`가 있어야 가능하므로,
나머지는 실제 페이지에서 진행합니다.)

```bash
# 로그인 없이 비공개 자료 요청 — 401이 나와야 정상 (T08-C15/17 증거)
curl -s -i "<PROJECT_URL>/functions/v1/private-notes"
```

`HTTP/2 401`이 나오면 정상입니다.

---

## 10. 실제 브라우저 테스트 순서 (요약)

1. 시크릿 창으로 `https://sby1234-ai.github.io/myprofile/` 접속 (공개 영역은 로그인 없이 그대로 보여야 함)
2. `#private` 섹션으로 스크롤 → "새 계정" 패널에서 handle 입력 후 패스키 등록 (브라우저/OS 패스키 생성 창이 뜸)
   → 등록은 계정과 패스키만 만들 뿐 자동 로그인은 하지 않습니다("이제 로그인해보세요" 안내가 뜸).
3. 방금 만든 handle로 "로그인" 패널에서 로그인 → 비공개 자료 3개가 보이면 성공
4. 로그아웃 후 같은 handle로 다시 로그인 → 매번 다른 challenge로 로그인되는지 `#evidenceLog`에서 확인
5. "패스키 추가 등록"으로 2번째 패스키 등록 → 목록에 2개가 보이는지 확인
6. 패스키 1개 삭제 → 남은 1개로는 로그인 여전히 되는지, 삭제된 걸로는 안 되는지 확인
7. 두 번째 test 계정을 새 handle로 만들고, 로그인 상태에서 "다른 계정 자료 요청해보기"에
   첫 번째 계정의 user id를 넣어 403이 나오는지 확인 (`#evidenceLog`에 요청/응답이 그대로 남음)

이 순서를 실제로 진행하면서 `#evidenceLog`에 남는 요청/응답을 스크린샷으로 캡처해두면
그대로 인증 구현 설명서의 ④ 항목(네거티브 케이스 증거)에 사용할 수 있습니다.

---

## 11. 자주 나는 오류와 원인

| 증상 | 원인 | 해결 |
|---|---|---|
| 패스키 등록 창이 아예 안 뜸 | `EXPECTED_ORIGIN`/`RP_ID`가 실제 접속 주소와 다름 | 5단계 값을 실제 GitHub Pages 주소와 정확히 일치시키고 재배포(`secrets set` 후 함수는 재배포 불필요, 다음 호출부터 바로 반영) |
| 함수 호출 시 CORS 에러 | 함수가 아직 옛날 코드로 배포돼 있음 | 6단계 배포 명령 재실행 |
| 함수 호출이 이유 없이 401 | `--no-verify-jwt` 없이 배포됨 | 해당 함수만 `--no-verify-jwt` 옵션 붙여 재배포 |
| `supabase db push` 실패 | 2단계 `link`가 안 되어 있거나 DB 비밀번호 오류 | `npx supabase link --project-ref <ref>` 다시 실행 |
| 계정을 새로 만들었는데 비공개 자료가 안 보임 | 등록(register)은 계정만 만들 뿐 자동 로그인을 하지 않음 (정상 동작) | 방금 만든 handle로 "로그인" 패널에서 다시 로그인 |
| 로그인은 되는데 새로고침하면 로그아웃됨 | Supabase 세션은 브라우저 스토리지에 저장되므로, 시크릿 창을 닫거나 스토리지를 지우면 정상적으로 풀림 | 의도된 동작 — 계속 로그인 유지하려면 같은 창에서만 새로고침 |

---

이 문서까지 끝나면 배포는 완료입니다. 다음은 `T08-CHECK.md` (53개 통과 기준을 실제로 어떻게
확인/캡처할지 매핑한 문서)에서 이어집니다.
