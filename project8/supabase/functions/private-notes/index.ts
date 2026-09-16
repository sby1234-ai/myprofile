// GET /private-notes            -> 로그인한 본인의 비공개 자료 반환
// GET /private-notes?account_id=<다른 유저의 uuid>
//                                -> 본인 게 아니면 무조건 403 (T08-C37/38/40 증거용).
// 요청 본문/쿼리에 뭘 적어 보내도, 서버는 Authorization 토큰에서 뽑은 user_id로만 조회한다.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { adminClient, getUserFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const user = await getUserFromRequest(req);
  if (!user) {
    // T08-C15/C17: 로그인 안 한 상태 -> 401
    return jsonResponse({ error: "로그인이 필요합니다." }, 401);
  }

  const url = new URL(req.url);
  const requestedAccountId = url.searchParams.get("account_id");

  if (requestedAccountId && requestedAccountId !== user.id) {
    // 다른 계정 자료를 명시적으로 요청 -> 거절 (T08-C37/38/40)
    return jsonResponse(
      { error: "다른 계정의 자료는 조회할 수 없습니다.", requested: requestedAccountId },
      403,
    );
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from("private_notes")
    .select("id, title, content, created_at")
    .eq("user_id", user.id) // 항상 토큰 주인 기준 — 클라이언트가 뭘 보내든 무시
    .order("created_at", { ascending: true });

  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ notes: data, count: data?.length ?? 0 });
});
