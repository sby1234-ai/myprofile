// 누르기 전에 — 오프라인에서도 열리도록 앱 파일을 기기에 저장해 둡니다. 입력한 내용은 저장하지 않습니다.
const CACHE = "before-tap-v4";
const FILES = ["./", "index.html", "style.css", "app.js", "checker.js", "data/lookup.js", "data/paper.js",
  "manifest.webmanifest", "fonts/seal-subset.woff", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // 공유하기로 열 때 붙는 ?text=… 는 무시하고 같은 화면을 돌려줍니다
  const key = req.mode === "navigate" ? "index.html" : req;
  e.respondWith(caches.match(key, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
