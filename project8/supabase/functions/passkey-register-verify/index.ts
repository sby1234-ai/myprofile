// POST /passkey-register-verify
// body: { challengeId: string, credential: <navigator.credentials.create() 결과를 JSON으로 바꾼 것> }
//
// 여기서 검증에 성공해야만 실제로 계정/자격증명이 생긴다 (T08-C25: 취소하면 아무것도 안 남음).

import { verifyRegistrationResponse } from "npm:@simplewebauthn/server@11";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { RP_ID, EXPECTED_ORIGIN, FAKE_EMAIL_DOMAIN } from "../_shared/config.ts";
import { adminClient } from "../_shared/supabase.ts";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "POST만 허용" }, 405);

  const body = await req.json().catch(() => ({}));
  const { challengeId, credential } = body;
  if (!challengeId || !credential) {
    return jsonResponse({ error: "challengeId와 credential이 필요합니다." }, 400);
  }

  const admin = adminClient();

  const { data: row, error: fetchErr } = await admin
    .from("passkey_challenges")
    .select("*")
    .eq("id", challengeId)
    .single();

  if (fetchErr || !row) {
    return jsonResponse({ error: "챌린지를 찾을 수 없습니다." }, 400);
  }
  if (row.type !== "register") {
    return jsonResponse({ error: "등록용 챌린지가 아닙니다." }, 400);
  }
  if (row.used) {
    // T08-C31과 같은 종류의 재사용 방지 — 이미 쓴 챌린지는 다시 안 통함
    return jsonResponse({ error: "이미 사용된 챌린지입니다." }, 409);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return jsonResponse({ error: "챌린지가 만료되었습니다." }, 410);
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: row.challenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
    });
  } catch (e) {
    return jsonResponse({ error: "등록 검증 실패: " + (e as Error).message }, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return jsonResponse({ error: "등록 검증에 실패했습니다." }, 400);
  }

  // 챌린지는 성공 여부와 무관하게 이 시점에 바로 소모 처리 (재사용 방지)
  await admin.from("passkey_challenges").update({ used: true }).eq("id", challengeId);

  const { credential: cred } = verification.registrationInfo;
  const publicKeyB64 = toBase64Url(cred.publicKey);
  const deviceName =
    (body.device_name ?? row.pending_device_name ?? "이름 없는 기기").toString();

  let userId = row.user_id as string | null;

  if (!userId) {
    // 신규 계정 생성 (비밀번호 없이 — password 필드를 아예 안 넣음)
    const handle = row.pending_handle as string;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: `${handle}@${FAKE_EMAIL_DOMAIN}`,
      email_confirm: true,
      user_metadata: { handle },
    });
    if (createErr || !created?.user) {
      return jsonResponse(
        { error: "계정 생성 실패: " + (createErr?.message ?? "unknown") },
        500,
      );
    }
    userId = created.user.id;

    await admin.from("passkey_accounts").insert({ user_id: userId, handle });

    // 비공개 영역에 보여줄 샘플 항목 3개 자동 생성 (T08-C14: 3개 이상)
    await admin.from("private_notes").insert([
      {
        user_id: userId,
        title: "진행 중인 프로젝트 메모",
        content: `[${handle}] 만들어 넣은 예시 메모 — 실제 데이터 아님.`,
      },
      {
        user_id: userId,
        title: "지원하려는 곳 목록",
        content: `[${handle}] 예시로 만든 지원 후보 리스트 (가상의 값).`,
      },
      {
        user_id: userId,
        title: "스스로 쓰는 회고",
        content: `[${handle}] 이번 주 회고 예시 텍스트 — 실제 개인정보 아님.`,
      },
    ]);
  }

  const { error: credErr } = await admin.from("passkey_credentials").insert({
    user_id: userId,
    credential_id: cred.id,
    public_key: publicKeyB64,
    counter: cred.counter,
    device_name: deviceName,
  });
  if (credErr) {
    return jsonResponse({ error: "자격증명 저장 실패: " + credErr.message }, 500);
  }

  return jsonResponse({ ok: true, userId, deviceName });
});
