/* =====================================================================
 * TAKE THE COURT — turn-worker/src/worker.mjs   (owner: net)
 * Worker de Cloudflare que da credenciales TURN TEMPORALES al online (Imprescindible 4.1, notes/turn.md; pasos en ../README.md).
 *
 *   POST /ice   con «Authorization: Bearer <ID token de Firebase>» (proyecto make-the-cut-vb)
 *     200 → { iceServers: [{ urls: ['turn:…', 'turns:…'], username, credential }], ttl, exp }   (ttl en s; exp en ms de época)
 *     401 sin token o token no válido · 403 origen no permitido · 405 otro método · 429 demasiadas · 502 Cloudflare no contesta
 *   OPTIONS /ice → CORS (solo los orígenes de ALLOWED_ORIGINS)
 *   GET /health → 'ok' (sin llamar a nada)
 *
 * El ID token se comprueba aquí, sin SDK (como dice Firebase para «bibliotecas JWT de terceros»): RS256 con las claves públicas de
 * securetoken@system.gserviceaccount.com (JWK, en caché lo que diga su Cache-Control), iss/aud del proyecto, exp en el futuro,
 * iat y auth_time en el pasado y sub no vacío.
 * Las credenciales salen de la API de Cloudflare Realtime TURN:
 *   POST https://rtc.live.cloudflare.com/v1/turn/keys/{TURN_KEY_ID}/credentials/generate-ice-servers  (Bearer TURN_KEY_API_TOKEN, {ttl})
 * Se devuelven SOLO las entradas TURN (el juego ya tiene sus STUN) y sin las URL del puerto 53 (los navegadores lo bloquean y
 * solo hacen esperar).
 *
 * Secretos (npx wrangler secret put, NUNCA en el repo): TURN_KEY_ID, TURN_KEY_API_TOKEN.
 * Variables (wrangler.toml): FIREBASE_PROJECT, ALLOWED_ORIGINS (separados por comas), TTL (s; 7200 = 2 h).
 * Límite opcional: binding RATE_LIMITER (Workers Rate Limiting) por uid; sin él, un límite sencillo por instancia.
 * ===================================================================== */

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const CF_API = 'https://rtc.live.cloudflare.com/v1/turn/keys/';
const SKEW_S = 60;

let jwks = null, jwksExp = 0;          // caché de las claves públicas de Google (por instancia)
const hits = new Map();                // límite sencillo por uid (por instancia) si no hay RATE_LIMITER
const LIMIT_N = 20, LIMIT_MS = 10 * 60 * 1000;

function b64uBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64uJson(s) { return JSON.parse(new TextDecoder().decode(b64uBytes(s))); }

async function getKeys(fetchFn, force) {
  if (!force && jwks && Date.now() < jwksExp) return jwks;
  const r = await fetchFn(JWKS_URL);
  if (!r.ok) throw new Error('jwks ' + r.status);
  const j = await r.json();
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  jwks = Array.isArray(j.keys) ? j.keys : [];
  jwksExp = Date.now() + Math.min(m ? +m[1] : 3600, 6 * 3600) * 1000;
  return jwks;
}

/** Comprueba un ID token de Firebase. Devuelve el uid o lanza un Error. */
export async function verifyIdToken(token, project, fetchFn = fetch, nowS = Math.floor(Date.now() / 1000)) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('formato');
  let head, pay;
  try { head = b64uJson(parts[0]); pay = b64uJson(parts[1]); } catch (e) { throw new Error('formato'); }
  if (!head || !pay || head.alg !== 'RS256' || typeof head.kid !== 'string') throw new Error('alg');
  if (pay.iss !== 'https://securetoken.google.com/' + project || pay.aud !== project) throw new Error('proyecto');
  if (typeof pay.sub !== 'string' || !pay.sub || pay.sub.length > 128) throw new Error('sub');
  if (typeof pay.exp !== 'number' || pay.exp <= nowS - SKEW_S) throw new Error('caducado');
  if (typeof pay.iat !== 'number' || pay.iat > nowS + SKEW_S) throw new Error('iat');
  if (typeof pay.auth_time !== 'number' || pay.auth_time > nowS + SKEW_S) throw new Error('auth_time');
  let keys = await getKeys(fetchFn, false), jwk = keys.find(k => k.kid === head.kid);
  if (!jwk) { keys = await getKeys(fetchFn, true); jwk = keys.find(k => k.kid === head.kid); }   // (Google rota las claves)
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('firma');
  return pay.sub;
}

/** Respuesta de generate-ice-servers → solo TURN, sin el puerto 53. */
export function turnOnly(j) {
  const L = j && Array.isArray(j.iceServers) ? j.iceServers : (j && j.iceServers ? [j.iceServers] : []);
  const out = [];
  for (const s of L) {
    if (!s || typeof s.username !== 'string' || typeof s.credential !== 'string') continue;
    const urls = [].concat(s.urls || []).filter(u => typeof u === 'string' && /^turns?:/.test(u) && !/:53(\?|$)/.test(u));
    if (urls.length) out.push({ urls, username: s.username, credential: s.credential });
  }
  return out;
}

function origins(env) { return String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean); }
function cors(env, origin) {
  const h = { 'Vary': 'Origin' };
  if (origin && origins(env).includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}
function json(status, body, extra) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  return new Response(JSON.stringify(body), { status, headers: Object.assign(h, extra || {}) });
}

async function limited(env, uid) {
  if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
    try { const r = await env.RATE_LIMITER.limit({ key: uid }); return !r.success; } catch (e) { return false; }
  }
  const now = Date.now(), L = (hits.get(uid) || []).filter(t => now - t < LIMIT_MS);
  L.push(now); hits.set(uid, L);
  if (hits.size > 5000) hits.clear();
  return L.length > LIMIT_N;
}

export async function handle(request, env, fetchFn = fetch) {
  const url = new URL(request.url), origin = request.headers.get('Origin') || '';
  const ch = cors(env, origin);
  if (url.pathname === '/health') return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
  if (url.pathname !== '/ice' && url.pathname !== '/') return json(404, { error: 'not_found' }, ch);
  if (origin && !ch['Access-Control-Allow-Origin']) return json(403, { error: 'origin' }, ch);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
  if (request.method !== 'POST') return json(405, { error: 'method' }, Object.assign({ 'Allow': 'POST, OPTIONS' }, ch));
  const m = /^Bearer\s+(\S+)$/.exec(request.headers.get('Authorization') || '');
  if (!m) return json(401, { error: 'auth' }, ch);
  let uid;
  try { uid = await verifyIdToken(m[1], env.FIREBASE_PROJECT || 'make-the-cut-vb', fetchFn); }
  catch (e) { return json(401, { error: 'auth' }, ch); }
  if (await limited(env, uid)) return json(429, { error: 'rate' }, Object.assign({ 'Retry-After': '600' }, ch));
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json(502, { error: 'config' }, ch);
  const ttl = Math.max(600, Math.min(parseInt(env.TTL, 10) || 7200, 86400));
  let r;
  try {
    r = await fetchFn(CF_API + encodeURIComponent(env.TURN_KEY_ID) + '/credentials/generate-ice-servers', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.TURN_KEY_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl })
    });
  } catch (e) { return json(502, { error: 'upstream' }, ch); }
  if (!r.ok) return json(502, { error: 'upstream', status: r.status }, ch);
  let servers;
  try { servers = turnOnly(await r.json()); } catch (e) { servers = []; }
  if (!servers.length) return json(502, { error: 'upstream' }, ch);
  return json(200, { iceServers: servers, ttl, exp: Date.now() + ttl * 1000 }, ch);
}

export default { fetch: (request, env) => handle(request, env) };

// pruebas (tools/turntest.js)
export const _test = { reset() { jwks = null; jwksExp = 0; hits.clear(); } };
