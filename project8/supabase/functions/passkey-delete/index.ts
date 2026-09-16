// POST /passkey-delete
// body: { id: string }  (passkey_credentials.id, 사람이 보는 목록의 그 항목)
// Authorization 필요. 본인 소유가 아니면 거절, 마지막 1개는 삭제 거절
// (계정이 영구히 잠기는 걸 막기 위한 설계 — T08-C46에서 이 정책을 그대로 설명하면 됨).

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { adminClient, getUserFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "POST만 허용" }, 405);

  const user = await getUserFromRequest(req);
  if (!user) return jsonResponse({ error: "로그인이 필요합니다." }, 401);

  const body = await req.json().catch(() => ({}));
  const id = (body.id ?? "").toString();
  if (!id) return jsonResponse({ error: "id가 필요합니다." }, 400);

  const admin = adminClient();

  const { data: mine } = await admin
    .from("passkey_credentials")
    .select("id")
    .eq("user_id", user.id);

  if (!mine || !mine.some((c) => c.id === id)) {
    return jsonResponse({ error: "본인 소유의 패스키만 삭제할 수 있습니다." }, 403);
  }

  if (mine.length <= 1) {
    return jsonResponse(
      { error: "마지막 남은 패스키는 삭제할 수 없습니다 (계정 잠김 방지)." },
      409,
    );
  }

  const { error } = await admin
    .from("passkey_credentials")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ ok: true });
});
