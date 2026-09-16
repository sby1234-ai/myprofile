// POST /passkey-register-start
// body: { handle?: string, device_name: string }
// - Authorization 헤더 있으면: 로그인된 계정에 "패스키 추가" (2번째 패스키 등록용, handle은 무시)
// - Authorization 헤더 없으면: handle로 "새 계정" 생성을 준비 (핸들 중복이면 거절)
//
// 실제 계정/자격증명은 여기서 만들지 않는다 — challenge만 만들어 저장해두고,
// 등록을 끝까지 성공적으로 검증했을 때(verify)만 계정을 만든다.
// 그래야 등록 중간에 취소해도 서버에 아무것도 안 남는다 (T08-C25).

import { generateRegistrationOptions } from "npm:@simplewebauthn/server@11";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { RP_ID, RP_NAME } from "../_shared/config.ts";
import { adminClient, getUserFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "POST만 허용" }, 405);

  const body = await req.json().catch(() => ({}));
  const deviceName = (body.device_name ?? "").toString().trim();
  if (!deviceName) {
    return jsonResponse({ error: "기기 이름(device_name)이 필요합니다." }, 400);
  }

  const admin = adminClient();
  const existingUser = await getUserFromRequest(req); // 로그인 중이면 유저, 아니면 null

  let userId: string | null = null;
  let userIdBytes: Uint8Array;
  let userName: string;
  let excludeCredentialIds: string[] = [];
  let pendingHandle: string | null = null;

  if (existingUser) {
    // 이미 로그인된 계정 -> 두 번째(이상) 패스키 추가
    userId = existingUser.id;
    userIdBytes = new TextEncoder().encode(userId);

    const { data: account } = await admin
      .from("passkey_accounts")
      .select("handle")
      .eq("user_id", userId)
      .single();
    userName = account?.handle ?? userId;

    const { data: creds } = await admin
      .from("passkey_credentials")
      .select("credential_id")
      .eq("user_id", userId);
    excludeCredentialIds = (creds ?? []).map((c) => c.credential_id);
  } else {
    // 비로그인 -> 새 계정 생성 준비
    const handle = (body.handle ?? "").toString().trim();
    if (!handle || handle.length < 2) {
      return jsonResponse({ error: "계정 이름(handle)을 2자 이상 입력하세요." }, 400);
    }
    const { data: taken } = await admin
      .from("passkey_accounts")
      .select("user_id")
      .eq("handle", handle)
      .maybeSingle();
    if (taken) {
      return jsonResponse({ error: "이미 사용 중인 계정 이름입니다." }, 409);
    }
    pendingHandle = handle;
    userName = handle;
    // 아직 실제 유저가 없으므로, 이 등록 세션 동안만 쓸 임시 ID를 발급.
    userIdBytes = crypto.getRandomValues(new Uint8Array(16));
  }

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: userIdBytes,
    userName,
    attestationType: "none",
    excludeCredentials: excludeCredentialIds.map((id) => ({ id })),
    authenticatorSelection: {
      residentKey: "discouraged",
      userVerification: "preferred",
    },
  });

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { data: challengeRow, error } = await admin
    .from("passkey_challenges")
    .insert({
      challenge: options.challenge,
      type: "register",
      user_id: userId,
      pending_handle: pendingHandle,
      pending_device_name: deviceName,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) {
    return jsonResponse({ error: "챌린지 저장 실패: " + error.message }, 500);
  }

  return jsonResponse({ challengeId: challengeRow.id, options });
});
