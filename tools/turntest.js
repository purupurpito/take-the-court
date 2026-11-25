#!/usr/bin/env node
/* TAKE THE COURT — tools/turntest.js  (owner: net)
 * TURN de respaldo (Imprescindible 4.1, notes/turn.md), en Node, sin red ni claves de verdad:
 *   (1) Cliente (js/netconfig.js + js/netrtc.js en vm): apagado sin URL (ninguna petición, pcConfig = solo STUN); con URL, POST con el
 *       ID token y VB.NET_ICE = {turn, relayOnly:false, exp} → pcConfig con TURN + STUN y SIN iceTransportPolicy (policy 'all');
 *       caché mientras dura; Worker lento (más de TURN_WAIT_MS) → false a tiempo y la respuesta tardía vale para la siguiente;
 *       error HTTP / sin sesión / respuesta sin TURN → false y sin volver a pedir en un rato; credenciales caducadas → fuera;
 *       URL no https (salvo localhost) → apagado; Link.offer() de un enlace cerrado no abre conexión.
 *   (2) Worker (turn-worker/src/worker.mjs, con un par RSA de prueba en vez de las claves de Google y un fetch de mentira en vez de
 *       Cloudflare): token bueno → 200 solo con TURN (sin :53) y la llamada a generate-ice-servers con el secreto y el ttl; token de
 *       otro proyecto, caducado, firma mala, alg none, sin token → 401; origen no permitido → 403; OPTIONS con CORS; GET → 405;
 *       Cloudflare caído → 502; sin secretos → 502; límite por uid → 429; y que ningún secreto sale en la respuesta.
 *   (3) Que en el repo no hay credenciales: wrangler.toml sin TURN_KEY_*, .dev.vars ignorado, netconfig con la URL vacía.
 * Uso: node tools/turntest.js   (sale con 1 si algo falla)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
let fails = 0, oks = 0;
function check(name, ok, info) { if (ok) oks++; else fails++; console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- (1) cliente ---------------- */
function client(fetchImpl, extra) {
  const ctx = { ...(extra || {}), console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, Date, Math, JSON, AbortController, fetch: fetchImpl };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['js/netconfig.js', 'js/netrtc.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.VB;
}
const CF_REPLY = { iceServers: [{ urls: ['turn:turn.example:3478?transport=udp', 'turns:turn.example:443?transport=tcp', 'stun:x:3478'], username: 'u1', credential: 'c1' }, { urls: 'stun:stun.example:3478' }], ttl: 7200 };
function reply(status, body) { return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }; }

async function testClient() {
  console.log('(1) cliente');
  let calls = [];
  const okFetch = (u, o) => { calls.push({ u, o }); return Promise.resolve(reply(200, CF_REPLY)); };
  let VB = client(okFetch);
  const auth = () => Promise.resolve('tok.en.x');
  check('apagado por defecto (URL vacía)', VB.NET_TURN_URL === '' && VB.NetRtc.turnUrl() === '');
  check('apagado: turnPrep → false sin peticiones', (await VB.NetRtc.turnPrep(auth)) === false && calls.length === 0);
  let c = VB.NetRtc._pcConfig(null).cfg;
  check('apagado: pcConfig solo STUN, sin policy', c.iceServers.length === 2 && !c.iceTransportPolicy && c.iceServers.every(s => /^stun:/.test(s.urls)));

  VB.NET_TURN_URL = 'http://evil.example/ice';
  check('URL http que no es localhost → apagado', VB.NetRtc.turnUrl() === '');
  VB.NET_TURN_URL = 'http://localhost:8787/ice';
  check('URL http://localhost (wrangler dev) → vale', VB.NetRtc.turnUrl() === 'http://localhost:8787/ice');

  VB.NET_TURN_URL = 'https://turn.takethecourt.com/ice';
  const t0 = Date.now(); const r1 = await VB.NetRtc.turnPrep(auth);
  check('con URL: turnPrep → true', r1 === true, Date.now() - t0 + ' ms');
  check('POST con Authorization Bearer <token>', calls.length === 1 && calls[0].o.method === 'POST' && calls[0].o.headers.Authorization === 'Bearer tok.en.x' && calls[0].u === 'https://turn.takethecourt.com/ice');
  const N = VB.NET_ICE;
  check('VB.NET_ICE = {turn, relayOnly:false, exp ~2 h}', N && N.relayOnly === false && Math.abs(N.exp - Date.now() - 7200e3) < 5000 && N.turn.length === 1 && N.turn[0].urls.length === 2 && N.turn[0].urls.every(u => /^turns?:/.test(u)));
  c = VB.NetRtc._pcConfig(null);
  check('pcConfig: TURN + STUN, policy all (sin iceTransportPolicy), relay false', c.cfg.iceServers.length === 3 && !('iceTransportPolicy' in c.cfg) && c.relay === false && /^turn/.test([].concat(c.cfg.iceServers[0].urls)[0]));
  check('iceServers explícitos de las pruebas mandan', VB.NetRtc._pcConfig([]).cfg.iceServers.length === 0);
  await VB.NetRtc.turnPrep(auth);
  check('caché: la segunda no pide', calls.length === 1);
  VB.NET_ICE.exp = Date.now() + 5 * 60e3;
  await VB.NetRtc.turnPrep(auth);
  check('a menos de 10 min de caducar se renuevan', calls.length === 2);
  VB.NET_ICE.exp = Date.now() - 1;
  check('caducadas: pcConfig vuelve a solo STUN', VB.NetRtc._pcConfig(null).cfg.iceServers.length === 2);

  // Worker lento
  let release;
  VB = client((u, o) => new Promise(ok => { release = () => ok(reply(200, CF_REPLY)); }));
  VB.NET_TURN_URL = 'https://turn.takethecourt.com/ice';
  const t1 = Date.now(); const r2 = await VB.NetRtc.turnPrep(auth); const dt = Date.now() - t1;
  check('Worker lento: false a los TURN_WAIT_MS', r2 === false && dt >= VB.NetRtc.TURN_WAIT_MS - 50 && dt < VB.NetRtc.TURN_WAIT_MS + 600, dt + ' ms');
  check('Worker lento: mientras, solo STUN', VB.NetRtc._pcConfig(null).cfg.iceServers.length === 2);
  release(); await sleep(20);
  check('la respuesta tardía queda para la siguiente', !!(VB.NET_ICE && VB.NET_ICE.turn) && (await VB.NetRtc.turnPrep(auth)) === true);

  // errores
  for (const [name, f, a] of [
    ['HTTP 401', () => Promise.resolve(reply(401, { error: 'auth' })), auth],
    ['red caída', () => Promise.reject(new Error('net')), auth],
    ['respuesta sin TURN', () => Promise.resolve(reply(200, { iceServers: [{ urls: 'stun:x' }] })), auth],
    ['sin sesión (netAuth falla)', () => Promise.resolve(reply(200, CF_REPLY)), () => Promise.reject(new Error('unauthenticated'))]]) {
    let n = 0; VB = client((u, o) => { n++; return f(); });
    VB.NET_TURN_URL = 'https://turn.takethecourt.com/ice';
    const r = await VB.NetRtc.turnPrep(a), r2 = await VB.NetRtc.turnPrep(a);
    check(name + ': false, sin TURN y sin repetir la petición enseguida', r === false && r2 === false && !VB.NET_ICE && n <= 1 && VB.NetRtc._pcConfig(null).cfg.iceServers.length === 2, { n });
  }
  // TURN fijo de antes (relayOnly:true sin exp) sigue igual
  VB = client(okFetch);
  VB.NET_ICE = { turn: [{ urls: 'turn:fijo:3478', username: 'a', credential: 'b' }], relayOnly: true };
  c = VB.NetRtc._pcConfig(null);
  check('TURN fijo con relayOnly:true sigue en policy relay', c.cfg.iceTransportPolicy === 'relay' && c.relay === true);
  // Link cerrado
  let pcs = 0;
  const VBl = client(okFetch, { RTCPeerConnection: function () { pcs++; throw new Error('no debería crearse'); } });
  const L = new VBl.NetRtc.Link({ iceServers: [] });
  L.close();
  let rej = false; try { await L.offer(); } catch (e) { rej = true; }
  let rej2 = false; try { await L.answer('x'); } catch (e) { rej2 = true; }
  check('Link cerrado: offer()/answer() rechazan sin abrir conexión', rej && rej2 && pcs === 0, { pcs });
  const L2 = new VBl.NetRtc.Link({ iceServers: [] }); try { L2.offer(); } catch (e) { } L2.close();
  check('(control: un Link abierto sí intenta crear la conexión)', pcs > 0);
}

/* ---------------- (2) Worker ---------------- */
const ACC = '0123456789abcdef0123456789abcdef';   // ACCOUNT_ID de mentira
/** «ctx.storage.sql» de mentira: SQLite de verdad con node:sqlite (Node 22.5+); si no está, un Map que entiende las 4 sentencias del Worker. */
function sqlFake() {
  let DatabaseSync = null;
  const ew = process.emitWarning;
  process.emitWarning = function (w, t) { if (/SQLite/.test(String(w)) || t === 'ExperimentalWarning') return; return ew.apply(process, arguments); };
  try { DatabaseSync = require('node:sqlite').DatabaseSync; } catch (e) { } finally { process.emitWarning = ew; }
  if (DatabaseSync) {
    const db = new DatabaseSync(':memory:');
    return { kind: 'SQLite', exec(q, ...b) { const s = db.prepare(q); const rows = /^\s*select/i.test(q) ? s.all(...b) : (s.run(...b), []); return { toArray: () => rows }; } };
  }
  const m = new Map(), none = { toArray: () => [] };
  return { kind: 'Map', exec(q, ...b) {
    if (/^\s*create/i.test(q)) return none;
    if (/^\s*select/i.test(q)) return { toArray: () => m.has(b[0]) ? [{ v: m.get(b[0]) }] : [] };
    if (/^\s*insert/i.test(q)) { m.set(b[0], b[1]); return none; }
    if (/^\s*delete/i.test(q)) { m.delete(b[0]); return none; }
    throw new Error('sql inesperada ' + q);
  } };
}
/** Binding BUDGET de mentira con el TurnBudget de verdad (un solo objeto «global»). */
function budgetBinding(W, env) {
  const sql = sqlFake(), obj = new W.TurnBudget({ storage: { sql } }, env);
  const ns = { obj, sql, calls: 0, idFromName: n => n, get: () => ({ fetch: (u, i) => { ns.calls++; return obj.fetch(new Request(u, i)); } }) };
  return ns;
}
function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
async function testWorker() {
  console.log('(2) Worker');
  const W = await import('file://' + path.join(ROOT, 'turn-worker', 'src', 'worker.mjs').replace(/\\/g, '/'));
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'RS256', use: 'sig' });
  const P = 'make-the-cut-vb', now = Math.floor(Date.now() / 1000);
  function tok(over, o) {
    o = o || {};
    const h = Object.assign({ alg: 'RS256', kid: 'k1', typ: 'JWT' }, o.head || {});
    const p = Object.assign({ iss: 'https://securetoken.google.com/' + P, aud: P, sub: 'uid123', user_id: 'uid123', auth_time: now - 100, iat: now - 50, exp: now + 3500 }, over || {});
    const si = b64u(JSON.stringify(h)) + '.' + b64u(JSON.stringify(p));
    if (o.none) return si + '.';
    const sig = crypto.sign('sha256', Buffer.from(si), o.key || privateKey);
    return si + '.' + b64u(sig);
  }
  let cf = [], cfMode = 'ok', jwksCalls = 0;
  const fakeFetch = async (u, o) => {
    if (String(u).startsWith('https://www.googleapis.com/')) { jwksCalls++; return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'public, max-age=3600' } }); }
    if (String(u).startsWith('https://rtc.live.cloudflare.com/')) {
      cf.push({ u, o });
      if (cfMode === 'down') throw new Error('net');
      if (cfMode === '500') return new Response('x', { status: 500 });
      return new Response(JSON.stringify({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
        { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp', 'turn:turn.cloudflare.com:80?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'cfuser', credential: 'cfcred' }] }), { status: 201 });
    }
    throw new Error('fetch inesperado ' + u);
  };
  const BASE = { FIREBASE_PROJECT: P, ALLOWED_ORIGINS: 'https://takethecourt.com,https://purupurpito.github.io', TTL: '3600', TURN_KEY_ID: 'KEYID-secreto', TURN_KEY_API_TOKEN: 'APITOKEN-secreto',
    CF_ANALYTICS_TOKEN: 'ANALYTICS-secreto', ACCOUNT_ID: ACC, MAX_CREDS_MONTH: '20000', USAGE_CUTOFF_GB: '800', ENABLED: 'true' };
  const ENV = Object.assign({}, BASE); ENV.BUDGET = budgetBinding(W, ENV);
  const ORI = 'https://takethecourt.com';
  const req = (o) => new Request('https://turn.takethecourt.com' + (o.path || '/ice'), { method: o.method || 'POST', headers: Object.assign({ Origin: o.origin === undefined ? ORI : o.origin }, o.token ? { Authorization: 'Bearer ' + o.token } : {}, o.headers || {}) });
  const go = async (o, env) => { const r = await W.handle(req(o), env || ENV, fakeFetch); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { } return { r, j, txt }; };
  W._test.reset();

  let x = await go({ token: tok() });
  check('token bueno → 200', x.r.status === 200, x.r.status);
  check('solo TURN, sin puerto 53', x.j && x.j.iceServers.length === 1 && x.j.iceServers[0].urls.length === 5 && x.j.iceServers[0].urls.every(u => /^turns?:/.test(u) && !/:53\?/.test(u)) && x.j.iceServers[0].username === 'cfuser');
  check('ttl 3600 (1 h) y exp', x.j.ttl === 3600 && Math.abs(x.j.exp - Date.now() - 3600e3) < 5000);
  check('llama a generate-ice-servers con el secreto y el ttl', cf.length === 1 && cf[0].u === 'https://rtc.live.cloudflare.com/v1/turn/keys/KEYID-secreto/credentials/generate-ice-servers' && cf[0].o.headers.Authorization === 'Bearer APITOKEN-secreto' && JSON.parse(cf[0].o.body).ttl === 3600);
  check('sin TTL en el entorno → 3600 por defecto', (await go({ token: tok({ sub: 'ttl' }) }, Object.assign({}, ENV, { TTL: undefined }))).j.ttl === 3600);
  cf.length = 1;
  check('CORS del origen y no-store', x.r.headers.get('access-control-allow-origin') === ORI && x.r.headers.get('cache-control') === 'no-store');
  check('ningún secreto en la respuesta', !/secreto/.test(x.txt));
  await go({ token: tok() });
  check('claves de Google en caché (una sola descarga)', jwksCalls === 1, jwksCalls);
  // El cliente entiende la respuesta del Worker
  const VB = client(() => Promise.resolve(reply(200, x.j)));
  VB.NET_TURN_URL = 'https://turn.takethecourt.com/ice';
  check('el cliente acepta la respuesta del Worker', (await VB.NetRtc.turnPrep(() => Promise.resolve('t'))) === true && VB.NET_ICE.turn[0].urls.length === 5);

  const bad = [
    ['sin token', {}],
    ['token de otro proyecto (aud)', { token: tok({ aud: 'otro' }) }],
    ['token de otro proyecto (iss)', { token: tok({ iss: 'https://securetoken.google.com/otro' }) }],
    ['token caducado', { token: tok({ exp: now - 3600 }) }],
    ['iat en el futuro', { token: tok({ iat: now + 3600 }) }],
    ['sin sub', { token: tok({ sub: '' }) }],
    ['firma de otra clave', { token: tok({}, { key: other.privateKey }) }],
    ['alg none', { token: tok({}, { head: { alg: 'none' }, none: true }) }],
    ['kid desconocido', { token: tok({}, { head: { kid: 'zz' } }) }],
    ['basura', { token: 'a.b.c' }]];
  for (const [n, o] of bad) { const y = await go(o); check(n + ' → 401', y.r.status === 401, y.r.status); }
  check('las 401 no llaman a Cloudflare', cf.length === 2, cf.length);
  let y = await go({ token: tok(), origin: 'https://malo.example' });
  check('origen no permitido → 403 sin CORS', y.r.status === 403 && !y.r.headers.get('access-control-allow-origin'));
  y = await go({ method: 'OPTIONS' });
  check('OPTIONS → 204 con CORS (Authorization)', y.r.status === 204 && /Authorization/.test(y.r.headers.get('access-control-allow-headers') || '') && y.r.headers.get('access-control-allow-origin') === ORI);
  y = await go({ method: 'GET', token: tok() });
  check('GET /ice → 405', y.r.status === 405);
  y = await go({ method: 'GET', path: '/health', origin: '' });
  check('GET /health → ok', y.r.status === 200 && y.txt === 'ok');
  y = await go({ path: '/otra', token: tok() });
  check('otra ruta → 404', y.r.status === 404);
  cfMode = 'down'; y = await go({ token: tok({ sub: 'u2' }) });
  check('Cloudflare caído → 502', y.r.status === 502);
  cfMode = '500'; y = await go({ token: tok({ sub: 'u3' }) });
  check('Cloudflare 500 → 502', y.r.status === 502);
  cfMode = 'ok';
  y = await go({ token: tok({ sub: 'u4' }) }, Object.assign({}, ENV, { TURN_KEY_ID: '' }));
  check('sin secretos → 502 config', y.r.status === 502 && y.j.error === 'config');
  W._test.reset();
  let last = 0; for (let i = 0; i < 21; i++) last = (await go({ token: tok({ sub: 'pesado' }) })).r.status;
  check('límite sencillo: la 21ª en 10 min → 429', last === 429, last);
  let rlKeys = [];
  y = await go({ token: tok({ sub: 'rl' }) }, Object.assign({}, ENV, { RATE_LIMITER: { limit: async (o) => { rlKeys.push(o.key); return { success: false }; } } }));
  check('con RATE_LIMITER: lo usa por uid', y.r.status === 429 && rlKeys[0] === 'u:rl');
  rlKeys = [];
  y = await go({ token: tok({ sub: 'rl2' }), headers: { 'CF-Connecting-IP': '203.0.113.7' } }, Object.assign({}, ENV, { RATE_LIMITER: { limit: async (o) => { rlKeys.push(o.key); return { success: o.key[0] === 'u' }; } } }));
  check('con RATE_LIMITER: también por IP (CF-Connecting-IP)', y.r.status === 429 && rlKeys.join() === 'u:rl2,ip:203.0.113.7', rlKeys);
  W._test.reset(); last = 0;
  for (let i = 0; i < 21; i++) last = (await go({ token: tok({ sub: 'nueva' + i }), headers: { 'CF-Connecting-IP': '198.51.100.9' } })).r.status;
  check('límite sencillo por IP: 21 cuentas nuevas desde la misma IP → la 21ª 429', last === 429, last);
  W._test.reset();
  y = await go({ token: tok(), origin: '' });
  check('sin Origin (curl, scripts) → 403 aunque traiga token', y.r.status === 403 && y.j.error === 'origin');
  y = await go({ method: 'OPTIONS', origin: '' });
  check('OPTIONS sin Origin → 403', y.r.status === 403);

  /* ---- (2b) tope de gasto ---- */
  console.log('(2b) tope de gasto (Durable Object ' + ENV.BUDGET.sql.kind + ' + cron con un GraphQL de mentira)');
  const H = 3600e3, T0 = Date.UTC(2026, 10, 20, 12, 0, 0);          // 20-nov-2026 12:00 UTC
  // tope de credenciales por el Worker
  W._test.reset();
  let E = Object.assign({}, BASE, { MAX_CREDS_MONTH: '3' }); E.BUDGET = budgetBinding(W, E); E.BUDGET.obj.clock = () => T0;
  let cf0 = cf.length, st = [];
  for (let i = 0; i < 4; i++) { const z = await go({ token: tok({ sub: 'cap' + i }) }, E); st.push(z.r.status); if (i === 3) y = z; }
  check('tope MAX_CREDS_MONTH=3: tres 200 y la cuarta 503', st.join() === '200,200,200,503', st);
  check('503 → JSON {off:true, reason:"cap"} con CORS', y.j && y.j.off === true && y.j.reason === 'cap' && y.r.headers.get('access-control-allow-origin') === ORI);
  check('la 503 NO llama a Cloudflare', cf.length - cf0 === 3, cf.length - cf0);
  let calls0 = E.BUDGET.calls; await go({ token: tok({ sub: 'cap9' }) }, E);
  check('apagado recordado 1 min por instancia (no vuelve a preguntar al DO)', E.BUDGET.calls === calls0);
  // cambio de mes
  E.BUDGET.obj.clock = () => Date.UTC(2026, 11, 1, 0, 0, 5);        // 1-dic 00:00:05 UTC
  W._test.reset();
  await E.BUDGET.get('global').fetch('https://budget/report', { method: 'POST', body: JSON.stringify({ ok: true, bytes: 0 }) });   // (lectura del cron)
  y = await go({ token: tok({ sub: 'capdic' }) }, E);
  let s = await (await E.BUDGET.get('global').fetch('https://budget/status')).json();
  check('mes nuevo (UTC): vuelve a dar credenciales y el contador empieza de cero', y.r.status === 200 && s.month === '2026-12' && s.creds === 1, s);
  check('el contador del mes viejo se borra', E.BUDGET.sql.exec('SELECT v FROM kv WHERE k = ?', 'c:2026-11').toArray().length === 0);
  // apagados que no preguntan a nadie
  for (const [n, over] of [['sin CF_ANALYTICS_TOKEN', { CF_ANALYTICS_TOKEN: '' }], ['sin ACCOUNT_ID', { ACCOUNT_ID: '' }], ['ENABLED=false (a mano)', { ENABLED: 'false' }],
    ['sin binding BUDGET', { BUDGET: undefined }], ['DO que falla', { BUDGET: { idFromName: () => 1, get: () => ({ fetch: async () => { throw new Error('do'); } }) } }]]) {
    W._test.reset(); cf0 = cf.length;
    const Z = Object.assign({}, E, over); y = await go({ token: tok({ sub: 'off' + n.length }) }, Z);
    check(n + ' → 503 off sin llamar a Cloudflare', y.r.status === 503 && y.j.off === true && cf.length === cf0, y.j);
  }
  W._test.reset();

  // cron: GraphQL de mentira
  let gq = [], gqMode = 'ok', gqBytes = 0;
  const gqFetch = async (u, o) => {
    if (u !== 'https://api.cloudflare.com/client/v4/graphql') throw new Error('fetch inesperado ' + u);
    gq.push({ u, o });
    if (gqMode === 'net') throw new Error('net');
    if (gqMode === '500') return new Response('x', { status: 500 });
    if (gqMode === 'gqlerr') return new Response(JSON.stringify({ data: null, errors: [{ message: 'not authorized for that account' }] }));
    if (gqMode === 'empty') return new Response(JSON.stringify({ data: { viewer: { accounts: [{ callsTurnUsageAdaptiveGroups: [] }] } }, errors: null }));
    if (gqMode === 'two') return new Response(JSON.stringify({ data: { viewer: { accounts: [{ callsTurnUsageAdaptiveGroups: [{ sum: { egressBytes: 300e9 } }, { sum: { egressBytes: 550e9 } }] }] } }, errors: null }));
    return new Response(JSON.stringify({ data: { viewer: { accounts: [{ callsTurnUsageAdaptiveGroups: [{ sum: { egressBytes: gqBytes } }] }] } }, errors: null }));
  };
  E = Object.assign({}, BASE); E.BUDGET = budgetBinding(W, E);
  let clk = T0; E.BUDGET.obj.clock = () => clk;
  const cron = () => W.runCron(E, gqFetch, clk);
  const allow = async () => { W._test.reset(); return (await go({ token: tok({ sub: 'c' + Math.random() }) }, E)).r.status; };
  gqBytes = 100e9; s = await cron();
  const q = gq[0] && JSON.parse(gq[0].o.body).query;
  check('cron: POST a la API GraphQL con el token de analíticas', gq.length === 1 && gq[0].o.method === 'POST' && gq[0].o.headers.Authorization === 'Bearer ANALYTICS-secreto');
  check('cron: callsTurnUsageAdaptiveGroups · sum.egressBytes · accountTag · del día 1 a hoy (UTC)', /callsTurnUsageAdaptiveGroups/.test(q) && /sum \{ egressBytes \}/.test(q) && q.includes('accountTag: "' + ACC + '"') && q.includes('date_geq: "2026-11-01"') && q.includes('date_leq: "2026-11-20"'), q);
  check('100 GB → encendido; guarda el consumo y la hora', s.on === true && s.usageGB === 100 && s.usageAt === T0 && s.okAt === T0, s);
  check('…y da credenciales', (await allow()) === 200);
  clk += 15 * 60e3; gqBytes = 800e9; s = await cron();
  check('800 GB (= USAGE_CUTOFF_GB) → apagado por consumo', s.on === false && s.reason === 'usage' && s.usageGB === 800, s);
  y = await go({ token: tok({ sub: 'u800' }) }, E); W._test.reset();
  check('…y el Worker contesta 503 {off:true, reason:"usage"}', y.r.status === 503 && y.j.reason === 'usage');
  clk += 15 * 60e3; gqBytes = 50e9; s = await cron();
  check('una lectura menor el mismo mes no lo enciende (sigue hasta el mes siguiente)', s.on === false && s.reason === 'usage');
  clk = Date.UTC(2026, 11, 1, 0, 0, 0); gqBytes = 1e9; s = await cron();
  check('mes siguiente con poco consumo → encendido solo', s.on === true && s.month === '2026-12' && (await allow()) === 200, s);
  check('…y la consulta pasa a diciembre', JSON.parse(gq[gq.length - 1].o.body).query.includes('date_geq: "2026-12-01"'));
  gqMode = 'two'; clk += 15 * 60e3; s = await cron();
  check('suma varios grupos (300 + 550 = 850 GB → apagado)', s.on === false && s.usageGB === 850);
  gqMode = 'ok';
  E = Object.assign({}, BASE, { USAGE_CUTOFF_GB: '5000' }); E.BUDGET = budgetBinding(W, E); E.BUDGET.obj.clock = () => clk;
  gqBytes = 1001e9; s = await cron();
  check('USAGE_CUTOFF_GB nunca por encima de 1000 (el tramo gratis)', s.on === false && s.cutoffGB === 1000, s);
  E = Object.assign({}, BASE); E.BUDGET = budgetBinding(W, E); E.BUDGET.obj.clock = () => clk;
  gqMode = 'empty'; s = await cron();
  check('sin grupos (nada de TURN este mes) → 0 GB, encendido', s.on === true && s.usageGB === 0, s);

  // fail-safe de 6 h
  clk = T0; E = Object.assign({}, BASE); E.BUDGET = budgetBinding(W, E); E.BUDGET.obj.clock = () => clk;
  gqMode = 'ok'; gqBytes = 10e9; await cron();
  let allOn = true;
  for (const [mode, h] of [['500', 1], ['net', 2], ['gqlerr', 3], ['500', 5.9]]) { gqMode = mode; clk = T0 + h * H; s = await cron(); allOn = allOn && s.on; }
  check('consultas que fallan menos de 6 h → sigue encendido', allOn && s.failAt === T0 + H && /^http 500/.test(s.err), s);
  gqMode = '500'; clk = T0 + 6 * H; s = await cron();
  check('6 h seguidas fallando → apagado (stale)', s.on === false && s.reason === 'stale', s);
  check('…y el Worker contesta 503', (await allow()) === 503);
  gqMode = 'gqlerr'; clk += 15 * 60e3; s = await cron();
  check('error GraphQL guardado (sin datos sensibles) y sigue apagado', s.on === false && /^graphql: not authorized/.test(s.err));
  gqMode = 'ok'; gqBytes = 20e9; clk += 15 * 60e3; s = await cron();
  check('vuelve una lectura buena por debajo del corte → encendido solo', s.on === true && s.failAt === 0 && s.err === '' && (await allow()) === 200, s);
  gqBytes = 900e9; clk = T0 + 20 * H; await cron(); gqMode = '500'; clk = T0 + 30 * H; await cron(); gqMode = 'ok'; gqBytes = 1e9; clk += H; s = await cron();
  check('tras un corte por consumo, una lectura buena tras un fallo NO lo enciende ese mes', s.on === false && s.reason === 'usage');
  // sin token/ACCOUNT_ID en el cron, cron que no corre
  clk = T0; E = Object.assign({}, BASE, { CF_ANALYTICS_TOKEN: '' }); E.BUDGET = budgetBinding(W, E); E.BUDGET.obj.clock = () => clk;
  gq.length = 0; s = await cron();
  check('cron sin CF_ANALYTICS_TOKEN: no consulta y apunta el fallo', gq.length === 0 && s.err === 'config' && s.failAt === T0, s);
  E = Object.assign({}, BASE, { ACCOUNT_ID: 'no-es-un-id' }); E.BUDGET = budgetBinding(W, E); E.BUDGET.obj.clock = () => clk;
  s = await cron();
  check('ACCOUNT_ID con mala forma: no consulta (nada que inyectar en la query)', gq.length === 0 && s.err === 'account_id');
  E = Object.assign({}, BASE); E.BUDGET = budgetBinding(W, E); clk = T0; E.BUDGET.obj.clock = () => clk;
  check('recién desplegado, antes del primer cron: da credenciales', (await allow()) === 200);
  clk = T0 + 6 * H;
  check('si el cron no ha leído nada en 6 h → apagado (noread)', (await allow()) === 503 && (await (await E.BUDGET.get('g').fetch('https://budget/status')).json()).reason === 'noread');
  // /health
  y = await go({ method: 'GET', path: '/health', origin: '' }, Object.assign({}, BASE, { ENABLED: 'false' }));
  check('GET /health sigue siendo «ok» (también apagado, sin datos)', y.r.status === 200 && y.txt === 'ok');
  // scheduled() existe y usa waitUntil
  let waited = null;
  W.default.scheduled({}, Object.assign({}, BASE, { CF_ANALYTICS_TOKEN: '' , BUDGET: undefined }), { waitUntil: p => { waited = p; } });
  check('scheduled() deja el trabajo en ctx.waitUntil', waited && typeof waited.then === 'function');
  const _log = console.log; console.log = () => { }; try { await waited; } finally { console.log = _log; }

  /* ---- (2c) 503 del Worker → el cliente sigue con STUN ---- */
  console.log('(2c) cliente ante el Worker apagado');
  W._test.reset();
  const EOFF = Object.assign({}, BASE, { MAX_CREDS_MONTH: '0' }); EOFF.BUDGET = budgetBinding(W, EOFF);
  let wcalls = 0;
  const VBo = client((u, o) => { wcalls++; return W.handle(new Request(u, { method: 'POST', headers: Object.assign({ Origin: ORI }, o.headers) }), EOFF, fakeFetch); });
  VBo.NET_TURN_URL = 'https://turn.takethecourt.com/ice';
  const t2 = Date.now(); const r3 = await VBo.NetRtc.turnPrep(() => Promise.resolve(tok({ sub: 'cli' })));
  check('Worker 503 → turnPrep false enseguida (sin esperar los TURN_WAIT_MS)', r3 === false && Date.now() - t2 < VBo.NetRtc.TURN_WAIT_MS, (Date.now() - t2) + ' ms');
  check('…sin TURN: pcConfig solo STUN', !VBo.NET_ICE && VBo.NetRtc._pcConfig(null).cfg.iceServers.length === 2 && !VBo.NetRtc._pcConfig(null).cfg.iceTransportPolicy);
  await VBo.NetRtc.turnPrep(() => Promise.resolve(tok({ sub: 'cli' })));
  check('…y no vuelve a pedir enseguida', wcalls === 1, wcalls);
}

/* ---------------- (3) sin credenciales en el repo ---------------- */
function testRepo() {
  console.log('(3) repo');
  const toml = fs.readFileSync(path.join(ROOT, 'turn-worker', 'wrangler.toml'), 'utf8');
  check('wrangler.toml sin TURN_KEY_* ni CF_ANALYTICS_TOKEN (son secretos)', !/TURN_KEY_ID\s*=|TURN_KEY_API_TOKEN\s*=|CF_ANALYTICS_TOKEN\s*=/.test(toml));
  check('wrangler.toml: DO TurnBudget con SQLite, cron cada 15 min, TTL 3600, ACCOUNT_ID vacío, topes por defecto',
    /class_name = "TurnBudget"/.test(toml) && /new_sqlite_classes = \["TurnBudget"\]/.test(toml) && /crons = \["\*\/15 \* \* \* \*"\]/.test(toml) &&
    /^TTL = "3600"/m.test(toml) && /^ACCOUNT_ID = ""/m.test(toml) && /^MAX_CREDS_MONTH = "20000"/m.test(toml) && /^USAGE_CUTOFF_GB = "800"/m.test(toml));
  const gi = fs.readFileSync(path.join(ROOT, 'turn-worker', '.gitignore'), 'utf8');
  check('.dev.vars en .gitignore', /^\.dev\.vars$/m.test(gi));
  check('no hay .dev.vars en el repo', !fs.existsSync(path.join(ROOT, 'turn-worker', '.dev.vars')));
  const nc = fs.readFileSync(path.join(ROOT, 'js', 'netconfig.js'), 'utf8');
  check('netconfig: URL vacía (apagado) y sin credenciales', /VB\.NET_TURN_URL = ''/.test(nc) && !/credential:\s*'[^'…]+'/.test(nc));
}

(async () => {
  try { await testClient(); await testWorker(); testRepo(); }
  catch (e) { fails++; console.log('  FALLO excepción', e && e.stack || e); }
  console.log('\n' + oks + ' ok, ' + fails + ' fallos');
  process.exit(fails ? 1 : 0);
})();
