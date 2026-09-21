// POST /passkey-login-verify
// body: { challengeId: string, credential: <navigator.credentials.get() 결과를 JSON으로 바꾼 것> }
//
// 서명 검증에 성공한 요청만 세션(access/refresh token)을 발급받는다.
// 세션 발급 방법: Supabase에 비밀번호/OTP 로그인 화면을 전혀 안 쓰고,
// admin.generateLink로 1회용 토�큰을 만든 뒤 서버가 즉시 그 토큰을 verifyOtp로 교환해서
// 진짜 Supabase 세션을 받아온다 (사용자에게는 링크를 보여주지도, 메일을 보내지도 않음).

import { verifyAuthenticationResponse } from "npm:@simplewebauthn/server@11";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { RP_ID, EXPECTED_ORIGIN } from "../_shared/config.ts";
import { adminClient, anonClient } from "../_shared/supabase.ts";

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
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
    return jsonResponse({ error: "챌린지를 찾을 수 없습니다." }, 401);
  }
  if (row.type !== "login") {
    return jsonResponse({ error: "로그인용 챌린지가 아닙니다." }, 401);
  }
  if (row.used) {
    // T08-C31: 이미 쓴 챌린지 재사용 -> 거절
    return jsonResponse({ error: "이미 사용된 챌린지입니다(재사용 거절)." }, 401);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return jsonResponse({ error: "챌린지가 만료되었습니다." }, 401);
  }

  const { data: storedCred } = await admin
    .from("passkey_credentials")
    .select("*")
    .eq("credential_id", credential.id)
    .eq("user_id", row.user_id) // 이 로그인 시도가 시작된 계정의 자격증명만 인정
    .maybeSingle();

  if (!storedCred) {
    // 남의 패스키(다른 계정 소유)로 시도한 경우 여기서 걸림 -> T08-C37/38 계열 증거
    await admin.from("passkey_challenges").update({ used: true }).eq("id", challengeId);
    return jsonResponse({ error: "등록되지 않은 패스키입니다." }, 401);
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: row.challenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: storedCred.credential_id,
        publicKey: base64UrlToBytes(storedCred.public_key),
        counter: Number(storedCred.counter),
      },
    });
       userVerificationRequired: false,
  } catch (e) {
    await admin.from("passkey_challenges").update({ used: true }).eq("id", challengeId);
    return jsonResponse({ error: "서명 검증 실패: " + (e as Error).message }, 401);
  }

  // 성공/실패 관계없이 챌린지는 이 시점에 소모 처리 (재사용 방지)
  await admin.from("passkey_challenges").update({ used: true }).eq("id", challengeId);

  if (!verification.verified) {
    return jsonResponse({ error: "서명 검증에 실패했습니다." }, 401);
  }

  await admin
    .from("passkey_credentials")
    .update({ counter: verification.authenticationInfo.newCounter })
    .eq("id", storedCred.id);

  // 세션 발급: 이 계정의 이메일(내부용, 화면에 노출 안 됨)로 1회용 링크를 만들고 즉시 교환
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(
    row.user_id,
  );
  if (userErr || !userData?.user?.email) {
    return jsonResponse({ error: "세션 발급 실패" }, 500);
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return jsonResponse({ error: "세션 발급 실패: " + (linkErr?.message ?? "") }, 500);
  }

  const anon = anonClient();
  const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
    email: userData.user.email,
    token: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (otpErr || !otpData?.session) {
    return jsonResponse({ error: "세션 교환 실패: " + (otpErr?.message ?? "") }, 500);
  }

  const { data: account } = await admin
    .from("passkey_accounts")
    .select("handle")
    .eq("user_id", row.user_id)
    .single();

  return jsonResponse({
    access_token: otpData.session.access_token,
    refresh_token: otpData.session.refresh_token,
    user: { id: row.user_id, handle: account?.handle ?? null },
  });
});
