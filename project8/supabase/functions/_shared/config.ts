// 공통 설정값. Supabase Edge Function 배포 시 자동으로 주입되는 환경변수를 씀.
// (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY 는 Supabase가 기본 제공)
// RP_ID / ORIGIN / EXPECTED_ORIGIN 은 supabase secrets set 으로 직접 등록해야 함.

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const ANON_KEY = Deno.env.get("ANON_KEY")!;

// WebAuthn Relying Party 설정 — GitHub Pages 실제 배포 도메인과 정확히 일치해야 함.
// 예: RP_ID = "sby1234-ai.github.io", EXPECTED_ORIGIN = "https://sby1234-ai.github.io"
export const RP_ID = Deno.env.get("RP_ID")!;
export const RP_NAME = "내 소개 페이지";
export const EXPECTED_ORIGIN = Deno.env.get("EXPECTED_ORIGIN")!;

// 계정 생성 시 auth.users에 넣을 더미 이메일 도메인 (실제 이메일이 아니라 내부 식별용)
export const FAKE_EMAIL_DOMAIN = "passkey.local";
