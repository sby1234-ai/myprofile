import { createClient } from "jsr:@supabase/supabase-js@2";
import { SUPABASE_URL, SERVICE_ROLE_KEY, ANON_KEY } from "./config.ts";

// service_role 클라이언트: RLS를 우회함. Edge Function 내부에서만 사용 — 절대 클라이언트로 보내지 않음.
export function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// anon 클라이언트: 로그인 세션(access token)이 실제로 유효한지 GoTrue에 직접 물어볼 때 씀.
// (로그아웃 후 즉시 거절되는 걸 보장하려면 JWT를 로컬에서 그냥 디코딩하면 안 되고,
//  auth.getUser()로 서버에 물어봐야 함 — 로그아웃 시 세션 자체가 무효화되기 때문.)
export function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Authorization: Bearer <access_token> 헤더에서 유저를 검증해서 꺼내는 공통 함수.
// 실패하면 null 반환 (호출부에서 401 처리).
export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const client = anonClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
