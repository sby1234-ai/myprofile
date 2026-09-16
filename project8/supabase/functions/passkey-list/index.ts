// GET /passkey-list
// Authorization: Bearer <access_token> 필요. 로그인된 계정 본인의 패스키 목록만 반환.
// 이름과 등록일만 보여주고 공개키/credential_id 원문은 노출하지 않는다.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { adminClient, getUserFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const user = await getUserFromRequest(req);
  if (!user) return jsonResponse({ error: "로그인이 필요합니다." }, 401);

  const admin = adminClient();
  const { data, error } = await admin
    .from("passkey_credentials")
    .select("id, device_name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ passkeys: data });
});
