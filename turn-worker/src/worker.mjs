/* =====================================================================
 * TAKE THE COURT — turn-worker/src/worker.mjs   (owner: net)
 * Worker de Cloudflare que da credenciales TURN TEMPORALES al online (Imprescindible 4.1, notes/turn.md; pasos en ../README.md).
 *
 *   POST /ice   con «Authorization: Bearer <ID token de Firebase>» (proyecto make-the-cut-vb)
 *     200 → { iceServers: [{ urls: ['turn:…', 'turns:…'], username, credential }], ttl, exp }   (ttl en s; exp en ms de época)
 *     401 sin token o token no válido · 403 sin Origin o con uno no permitido · 405 otro método · 429 demasiadas · 502 Cloudflare no contesta
 *     503 {off:true, reason} tope del mes, corte por consumo, fail-safe o apagado a mano (sin llamar a Cloudflare)
 *   Origin OBLIGATORIO (22-nov-2026, revisión de la rama): una petición sin Origin (curl, scripts) se rechaza aunque traiga token. No es
 *   infalible (un script puede inventárselo), pero corta los de copiar y pegar; el freno de verdad son los dos límites y el tope de gasto.
 *   OPTIONS /ice → CORS (solo los orígenes de ALLOWED_ORIGINS)
 *   GET /health → 'ok' (sin llamar a nada; no dice si está encendido: es público)
 *
 * El ID token se comprueba aquí, sin SDK (como dice Firebase para «bibliotecas JWT de terceros»): RS256 con las claves públicas de
 * securetoken@system.gserviceaccount.com (JWK, en caché lo que diga su Cache-Control), iss/aud del proyecto, exp en el futuro,
 * iat y auth_time en el pasado y sub no vacío.
 * Las credenciales salen de la API de Cloudflare Realtime TURN:
 *   POST https://rtc.live.cloudflare.com/v1/turn/keys/{TURN_KEY_ID}/credentials/generate-ice-servers  (Bearer TURN_KEY_API_TOKEN, {ttl})
 * Se devuelven SOLO las entradas TURN (el juego ya tiene sus STUN) y sin las URL del puerto 53 (los navegadores lo bloquean y
 * solo hacen esperar).
 *
 * Secretos (npx wrangler secret put, NUNCA en el repo): TURN_KEY_ID, TURN_KEY_API_TOKEN, CF_ANALYTICS_TOKEN.
 * Variables (wrangler.toml): FIREBASE_PROJECT, ALLOWED_ORIGINS (separados por comas), TTL (s; 3600 = 1 h), ACCOUNT_ID,
 *   MAX_CREDS_MONTH (20000), USAGE_CUTOFF_GB (800), ENABLED ('false' = apagado a mano).
 *
 * TOPE DE GASTO (25-nov-2026). Cloudflare regala 1.000 GB/mes de TURN y no tiene tope de gasto propio, así que el Worker se corta solo:
 *   1) Tope de credenciales: el Durable Object TurnBudget (SQLite, uno global) cuenta las credenciales del mes (UTC, clave AAAA-MM).
 *      Antes de llamar a Cloudflare se le pide permiso; con MAX_CREDS_MONTH alcanzado o el interruptor apagado → 503 {off:true} y NO
 *      se llama a Cloudflare. El mes siguiente empieza de cero solo.
 *   2) Corte por consumo real: scheduled() cada 15 min lee de la API GraphQL de analíticas (callsTurnUsageAdaptiveGroups,
 *      sum.egressBytes, lo que factura Cloudflare) el consumo TURN del mes de TODA la cuenta. ≥ USAGE_CUTOFF_GB (GB = 1e9 bytes) →
 *      apagado hasta el mes siguiente. Fail-safe: sin CF_ANALYTICS_TOKEN o ACCOUNT_ID → apagado; si la última lectura buena tiene
 *      6 h o más (la consulta falla, el token caducó o el cron no corre) → apagado; se enciende solo con la siguiente lectura buena
 *      por debajo del corte. Si el Durable Object no contesta → 503 (nunca se dan credenciales sin su permiso).
 *   Revocar: la API de Cloudflare permite revocar una credencial (POST …/credentials/{username}/revoke) pero no se usa: haría falta
 *   guardar cada username; con TTL de 1 h las ya dadas caducan solas poco después del corte.
 * Límite opcional: binding RATE_LIMITER (Workers Rate Limiting) por uid Y por IP (CF-Connecting-IP; las cuentas se crean gratis, así que
 * el uid solo no frena a quien saca cuentas nuevas); sin él, un límite sencillo por instancia con las mismas dos claves.
 * ===================================================================== */

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const CF_API = 'https://rtc.live.cloudflare.com/v1/turn/keys/';
const SKEW_S = 60;

let jwks = null, jwksExp = 0;          // caché de las claves públicas de Google (por instancia)
const hits = new Map();                // límite sencillo por uid y por IP (por instancia) si no hay RATE_LIMITER
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

async function limited1(env, key) {
  if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
    try { const r = await env.RATE_LIMITER.limit({ key }); return !r.success; } catch (e) { return false; }
  }
  const now = Date.now(), L = (hits.get(key) || []).filter(t => now - t < LIMIT_MS);
  L.push(now); hits.set(key, L);
  if (hits.size > 5000) hits.clear();
  return L.length > LIMIT_N;
}
/** Límite por cuenta y por IP (las dos cuentan siempre: así una IP con muchas cuentas nuevas también se para). */
async function limited(env, uid, ip) {
  const a = await limited1(env, 'u:' + uid), b = ip ? await limited1(env, 'ip:' + ip) : false;
  return a || b;
}

export async function handle(request, env, fetchFn = fetch) {
  const url = new URL(request.url), origin = request.headers.get('Origin') || '';
  const ch = cors(env, origin);
  if (url.pathname === '/health') return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
  if (url.pathname !== '/ice' && url.pathname !== '/') return json(404, { error: 'not_found' }, ch);
  if (!origin || !ch['Access-Control-Allow-Origin']) return json(403, { error: 'origin' }, ch);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
  if (request.method !== 'POST') return json(405, { error: 'method' }, Object.assign({ 'Allow': 'POST, OPTIONS' }, ch));
  const m = /^Bearer\s+(\S+)$/.exec(request.headers.get('Authorization') || '');
  if (!m) return json(401, { error: 'auth' }, ch);
  let uid;
  try { uid = await verifyIdToken(m[1], env.FIREBASE_PROJECT || 'make-the-cut-vb', fetchFn); }
  catch (e) { return json(401, { error: 'auth' }, ch); }
  if (await limited(env, uid, request.headers.get('CF-Connecting-IP') || '')) return json(429, { error: 'rate' }, Object.assign({ 'Retry-After': '600' }, ch));
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json(502, { error: 'config' }, ch);
  const gate = await askBudget(env);
  if (!gate.ok) return json(503, { off: true, reason: gate.reason }, Object.assign({ 'Retry-After': '3600' }, ch));
  const ttl = Math.max(600, Math.min(parseInt(env.TTL, 10) || 3600, 86400));
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

/* ---------------- tope de gasto: Durable Object TurnBudget + cron ---------------- */

const GQL_API = 'https://api.cloudflare.com/client/v4/graphql';
const STALE_MS = 6 * 3600 * 1000;      // sin una lectura buena del consumo en 6 h → apagado (fail-safe)
const OFF_CACHE_MS = 60 * 1000;        // un «apagado» se recuerda 1 min por instancia (no preguntar al DO en cada petición)
let offUntil = 0, offReason = '';

/** Mes UTC 'AAAA-MM' de un instante en ms. */
export function monthKey(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
function intVar(v, def, lo, hi) { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(n, hi)) : def; }
function maxCreds(env) { return intVar(env.MAX_CREDS_MONTH, 20000, 0, 10000000); }
function cutoffBytes(env) { const g = parseFloat(env.USAGE_CUTOFF_GB); return (Number.isFinite(g) && g >= 0 ? Math.min(g, 1000) : 800) * 1e9; }

/* La lógica va sobre un almacén clave → valor sencillo (get/put/del, síncrono) para poder probarla; en el DO es una tabla SQLite. */
function stInit(st, now) {
  if (!st.get('init')) st.put('init', now);
  const ym = monthKey(now), prev = st.get('ym');
  if (prev !== ym) { if (prev) st.del('c:' + prev); st.put('ym', ym); }   // (mes nuevo: el contador empieza de cero)
  return ym;
}
/** Estado del interruptor (sin contar nada). */
export function budgetStatus(st, now, max, cutoff) {
  const ym = stInit(st, now), okAt = st.get('okAt') || 0, creds = st.get('c:' + ym) || 0;
  let reason = '';
  if (st.get('cut') === ym) reason = 'usage';
  else if (now - (okAt || st.get('init')) >= STALE_MS) reason = okAt ? 'stale' : 'noread';
  else if (creds >= max) reason = 'cap';
  return { on: !reason, reason, month: ym, creds, max, cutoffGB: cutoff / 1e9,
    usageGB: st.get('usage') != null ? st.get('usage') / 1e9 : null, usageAt: st.get('usageAt') || 0,
    okAt, failAt: st.get('failAt') || 0, err: st.get('err') || '' };
}
/** Permiso para dar UNA credencial: {ok:true} y cuenta, o {ok:false, reason}. */
export function budgetAllow(st, now, max, cutoff) {
  const s = budgetStatus(st, now, max, cutoff);
  if (!s.on) return { ok: false, reason: s.reason };
  st.put('c:' + s.month, s.creds + 1);
  return { ok: true, n: s.creds + 1 };
}
/** Resultado de la lectura del consumo (cron): {ok:true, bytes} o {ok:false, error}. */
export function budgetReport(st, now, r, max, cutoff) {
  const ym = stInit(st, now);
  if (r && r.ok === true && typeof r.bytes === 'number' && r.bytes >= 0) {
    st.put('okAt', now); st.put('usage', r.bytes); st.put('usageAt', now); st.put('failAt', 0); st.put('err', '');
    if (r.bytes >= cutoff) st.put('cut', ym);        // apagado hasta que cambie el mes
  } else {
    if (!st.get('failAt')) st.put('failAt', now);
    st.put('err', String((r && r.error) || 'error').slice(0, 120));
  }
  return budgetStatus(st, now, max, cutoff);
}
/** Almacén sobre la SQLite del Durable Object (ctx.storage.sql). */
export function sqlStore(sql) {
  sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
  return {
    get(k) { const L = sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray(); return L.length ? JSON.parse(L[0].v) : undefined; },
    put(k, v) { sql.exec('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v)); },
    del(k) { sql.exec('DELETE FROM kv WHERE k = ?', k); }
  };
}

/** Durable Object global (idFromName('global')): contador del mes e interruptor. Solo lo llama este Worker (no tiene URL pública). */
export class TurnBudget {
  constructor(ctx, env) { this.env = env; this.st = sqlStore(ctx.storage.sql); this.clock = () => Date.now(); }   // (clock: las pruebas lo cambian)
  async fetch(request) {
    const p = new URL(request.url).pathname, now = this.clock(), max = maxCreds(this.env), cut = cutoffBytes(this.env);
    if (p === '/allow') return Response.json(budgetAllow(this.st, now, max, cut));
    if (p === '/status') return Response.json(budgetStatus(this.st, now, max, cut));
    if (p === '/report') { let r = null; try { r = await request.json(); } catch (e) { } return Response.json(budgetReport(this.st, now, r, max, cut)); }
    return new Response('not found', { status: 404 });
  }
}
function budgetStub(env) { return env.BUDGET.get(env.BUDGET.idFromName('global')); }

/** ¿Se puede dar una credencial? Ante cualquier duda, NO (fail-safe). */
async function askBudget(env) {
  if (String(env.ENABLED || '').trim().toLowerCase() === 'false') return { ok: false, reason: 'manual' };
  if (!env.CF_ANALYTICS_TOKEN || !env.ACCOUNT_ID) return { ok: false, reason: 'config' };   // sin lectura de consumo no hay corte: apagado
  if (offUntil > Date.now()) return { ok: false, reason: offReason };
  if (!env.BUDGET) return { ok: false, reason: 'budget' };
  try {
    const r = await budgetStub(env).fetch('https://budget/allow', { method: 'POST' });
    const j = r.ok ? await r.json() : null;
    if (j && j.ok === true) return { ok: true };
    offUntil = Date.now() + OFF_CACHE_MS; offReason = (j && j.reason) || 'budget';
    return { ok: false, reason: offReason };
  } catch (e) { return { ok: false, reason: 'budget' }; }
}

/** Consulta GraphQL del consumo TURN (egressBytes) de la cuenta en el mes UTC de «now» (del día 1 a hoy). */
export function usageQuery(accountId, now) {
  const from = monthKey(now) + '-01', to = new Date(now).toISOString().slice(0, 10);
  return 'query { viewer { accounts(filter: { accountTag: "' + accountId + '" }) { callsTurnUsageAdaptiveGroups(limit: 1, filter: { date_geq: "' +
    from + '", date_leq: "' + to + '" }) { sum { egressBytes } } } } }';
}
/** Lee el consumo del mes: {ok:true, bytes} o {ok:false, error}. Nunca lanza. */
export async function readUsage(env, fetchFn = fetch, now = Date.now()) {
  if (!env.CF_ANALYTICS_TOKEN || !env.ACCOUNT_ID) return { ok: false, error: 'config' };
  if (!/^[0-9a-f]{32}$/i.test(String(env.ACCOUNT_ID))) return { ok: false, error: 'account_id' };
  let r, j;
  try {
    r = await fetchFn(GQL_API, { method: 'POST', headers: { 'Authorization': 'Bearer ' + env.CF_ANALYTICS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: usageQuery(env.ACCOUNT_ID, now) }) });
  } catch (e) { return { ok: false, error: 'net' }; }
  if (!r.ok) return { ok: false, error: 'http ' + r.status };
  try { j = await r.json(); } catch (e) { return { ok: false, error: 'json' }; }
  if (j && Array.isArray(j.errors) && j.errors.length) return { ok: false, error: 'graphql: ' + String(j.errors[0] && j.errors[0].message || '').slice(0, 80) };
  const acc = j && j.data && j.data.viewer && j.data.viewer.accounts;
  if (!Array.isArray(acc) || !acc.length) return { ok: false, error: 'account' };
  const g = acc[0] && acc[0].callsTurnUsageAdaptiveGroups;
  if (!Array.isArray(g)) return { ok: false, error: 'shape' };
  let bytes = 0;                                         // (sin grupos = sin consumo este mes)
  for (const x of g) {
    const b = x && x.sum && x.sum.egressBytes;
    if (typeof b !== 'number' || !Number.isFinite(b) || b < 0) return { ok: false, error: 'shape' };
    bytes += b;
  }
  return { ok: true, bytes };
}
/** Cron (cada 15 min): lee el consumo y se lo pasa al DO, que apaga o enciende. Devuelve el estado (para el registro y las pruebas). */
export async function runCron(env, fetchFn = fetch, now = Date.now()) {
  const u = await readUsage(env, fetchFn, now);
  if (!env.BUDGET) return Object.assign({ on: false, reason: 'budget' }, u);
  const r = await budgetStub(env).fetch('https://budget/report', { method: 'POST', body: JSON.stringify(u) });
  return r.json();
}

export default {
  fetch: (request, env) => handle(request, env),
  scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env).then(s => console.log('turn-budget', JSON.stringify(s)), e => console.log('turn-budget error', String(e))));
  }
};

// pruebas (tools/turntest.js)
export const _test = { reset() { jwks = null; jwksExp = 0; hits.clear(); offUntil = 0; offReason = ''; }, STALE_MS, OFF_CACHE_MS };
