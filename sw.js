// Généré par l'atelier : permet à la page de fonctionner hors connexion.
const CACHE = "moteur-v1";
const HF = /(^|\.)huggingface\.co$|(^|\.)hf\.co$|xethub/;
const API = /(^|\.)groq\.com$|(^|\.)googleapis\.com$/;
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(["./", "index.html", "rebecca.json", "lib/lib.json"].map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("moteur-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol) || HF.test(url.hostname)) return;   // le modèle est mis en cache par transformers.js
  if (url.origin === self.location.origin && /\/modeles\//.test(url.pathname)) return;   // idem (morceaux du modèle publiés sur le site)
  if (url.origin === self.location.origin && /\/lib\/.+\/.+/.test(url.pathname)) { e.respondWith(cacheDabord(req)); return; }   // programme : versions figées
  if (req.cache === "no-store" || API.test(url.hostname)) return;          // le Rédacteur (Groq, Gemini) : jamais en cache
  if (url.origin === self.location.origin && /\/voix\/.+\.onnx/.test(url.pathname)) { e.respondWith(cacheDabord(req)); return; }   // la voix (60 Mo) : une seule fois
  e.respondWith(url.origin === self.location.origin ? reseauDabord(req, url) : cacheDabord(req));
});
async function reseauDabord(req, url) {
  const cache = await caches.open(CACHE);
  const cle = url.origin + url.pathname;
  const reseau = fetch(req).then(r => { if (r.status === 200) cache.put(cle, r.clone()); return r; });
  const garde = await cache.match(cle, { ignoreVary: true });
  if (!garde) return reseau;
  return Promise.race([reseau.catch(() => garde), new Promise(ok => setTimeout(() => ok(garde), 4000))]);
}
async function cacheDabord(req) {
  const cache = await caches.open(CACHE);
  const garde = await cache.match(req, { ignoreVary: true });
  if (garde) return garde;
  const r = await fetch(req);
  if (r.status === 200) cache.put(req, r.clone());
  return r;
}
