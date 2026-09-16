// POST /passkey-login-start
// body: { handle: string }
// 매번 새 challenge를 만들어서 응답한다 (T08-C27/28).

import { generateAuthenticationOptions } from "npm:@simplewebauthn/server@11";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { RP_ID } from "../_shared/config.ts";
import { adminClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "POST만 허용" }, 405);

  const body = await req.json().catch(() => ({}));
  const handle = (body.handle ?? "").toString().trim();
  if (!handle) return jsonResponse({ error: "handle이 필요합니다." }, 400);

  const admin = adminClient();

  const { data: account } = await admin
    .from("passkey_accounts")
    .select("user_id")
    .eq("handle", handle)
    .maybeSingle();

  if (!account) {
    // 계정이 없다는 걸 그대로 알려주면 계정 존재 여부를 캐낼 수 있으니
    // 뒤에 오는 로그인 검증과 최대한 비슷한 모양의 에러로 응답
    return jsonResponse({ error: "로그인할 수 없습니다." }, 401);
  }

  const { data: creds } = await admin
    .from("passkey_credentials")
    .select("credential_id")
    .eq("user_id", account.user_id);

  if (!creds || creds.length === 0) {
    return jsonResponse({ error: "등록된 패스키가 없습니다." }, 401);
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
    allowCredentials: creds.map((c) => ({ id: c.credential_id })),
  });

  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const { data: challengeRow, error } = await admin
    .from("passkey_challenges")
    .insert({
      challenge: options.challenge,
      type: "login",
      user_id: account.user_id,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) {
    return jsonResponse({ error: "챌린지 저장 실패: " + error.message }, 500);
  }

  return jsonResponse({ challengeId: challengeRow.id, options });
});
