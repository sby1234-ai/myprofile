// 모든 Edge Function이 공통으로 쓰는 CORS 헤더.
// GitHub Pages(예: https://sby1234-ai.github.io)에서 fetch로 호출하니 CORS가 반드시 필요함.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // 필요하면 배포 후 실제 GitHub Pages 주소로 좁혀도 됨
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
