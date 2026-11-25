#!/usr/bin/env node
/* TAKE THE COURT — tools/reporttest.js (owner: net; auditoría legal del 25-nov-2026)
 * Pruebas de «Denunciar nombre», «Bloquear» y «Ocultar nombres de otros jugadores» (js/report.js, js/namefilter.js, js/netlobby.js):
 *  1) Sin navegador: bloqueados en 'make-the-cut.netblock' (solo el aparato, como mucho 200, desbloquear); send() manda UNA escritura
 *     documents:commit a feedback/{20} con {kind:'report', uid, ru, rn, room, ver, state:'nuevo', exp ≈ +180 días} y t = REQUEST_TIME,
 *     con el token de la cuenta; la segunda vez 'dup'; sin sesión, 'noacc' sin red. NameFilter.shown con hideNames tapa a los demás y no
 *     el tuyo (ni tu uid, ni tu apodo, ni tu anónimo). netlobby.js: filtra las salas con bloqueados, saca al bloqueado (1v1: unguest;
 *     varios: kick) y no entra por código en la sala de un bloqueado (lectura del código).
 *  2) Con Java y el emulador de Firestore (como tools/netlogtest.js; --no-emu lo salta): las reglas de firebase/firestore.rules aceptan
 *     la denuncia del cliente de verdad y rechazan: sin sesión, uid ajeno, denunciarse a sí mismo, campos de más, kind raro, exp de más
 *     de 200 días, t que no es la del servidor; un jugador no la lee (solo admin()); las sugerencias de antes siguen igual.
 * Uso: node tools/reporttest.js [--no-emu] [--port 8093]     Sale con 1 si falla algo.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), vm = require('vm'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARGS = process.argv.slice(2), NO_EMU = ARGS.includes('--no-emu'), PORT = +(ARGS[ARGS.indexOf('--port') + 1] || 0) || 8093, PROJECT = 'demo-mtc';
let fails = 0, oks = 0;
const check = (name, ok, info) => { if (ok) oks++; else fails++; console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined && !ok ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); return !!ok; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
class Storage { constructor() { this._m = new Map(); } getItem(k) { return this._m.has(k) ? this._m.get(k) : null; } setItem(k, v) { this._m.set(k, String(v)); } removeItem(k) { this._m.delete(k); } }

function ctxWith(extra) {
  const ctx = Object.assign({ console, Math, Date, JSON, Object, Array, Promise, Uint8Array, setTimeout, clearTimeout, localStorage: new Storage(), crypto: require('crypto').webcrypto }, extra || {});
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  ctx.VB = { VERSION: '9.9.9', ctx: { settings: {} } };
  for (const f of ['namefilter.js', 'report.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: 'js/' + f });
  return ctx;
}

async function part1() {
  console.log('1) js/report.js y js/namefilter.js (vm)');
  const c = ctxWith(), R = c.VB.Report;
  check('sin bloqueados al empezar', R.blockedCount() === 0 && !R.blocked('u2'));
  check('bloquear guarda uid y nombre en make-the-cut.netblock', R.block('u2', 'Pepe') && R.blocked('u2') && JSON.parse(c.localStorage.getItem('make-the-cut.netblock'))[0].n === 'Pepe');
  check('bloquear dos veces no duplica', !R.block('u2', 'Pepe') && R.blockedCount() === 1);
  for (let i = 0; i < 230; i++) R.block('x' + i, 'n' + i);
  check('como mucho 200 bloqueados (se van los más viejos)', R.blockedCount() === 200 && !R.blocked('u2') && R.blocked('x229'), R.blockedCount());
  R.unblock('x229'); check('desbloquear uno', !R.blocked('x229') && R.blockedCount() === 199);
  R.unblockAll(); check('desbloquear a todos borra la clave', R.blockedCount() === 0 && c.localStorage.getItem('make-the-cut.netblock') === null);
  check('uids no válidos no se bloquean', !R.block('', 'x') && !R.block('a'.repeat(129), 'x'));

  // send()
  const calls = [];
  const fakeFetch = async (u, o) => { calls.push({ u, o }); return { ok: true, status: 200, json: async () => ({}) }; };
  const base = 'https://firestore.googleapis.com/v1/projects/make-the-cut-vb/databases/(default)/documents';
  const auth = () => Promise.resolve({ uid: 'me1', token: 'TOK' });
  let r = await R.send({ u: 'u9', n: 'Jugador 1234', raw: 'Nombre Feo' }, 'K7P2QX', { fetch: fakeFetch, base, auth });
  check('send: ok y una sola llamada a :commit', r === 'ok' && calls.length === 1 && calls[0].u === base + ':commit' && calls[0].o.method === 'POST', [r, calls.length]);
  const body = JSON.parse(calls[0].o.body), w = body.writes[0], fl = w.update.fields;
  check('send: con el token de la cuenta', calls[0].o.headers.Authorization === 'Bearer TOK');
  check('send: feedback/{20 letras y cifras}', /\/feedback\/[A-Za-z0-9]{20}$/.test(w.update.name) && /^projects\/make-the-cut-vb\/databases\/\(default\)\/documents\//.test(w.update.name), w.update.name);
  check('send: campos kind, uid, ru, rn (el nombre tal cual), room, ver, state', fl.kind.stringValue === 'report' && fl.uid.stringValue === 'me1' && fl.ru.stringValue === 'u9' && fl.rn.stringValue === 'Nombre Feo' &&
    fl.room.stringValue === 'K7P2QX' && fl.ver.stringValue === '9.9.9' && fl.state.stringValue === 'nuevo', fl);
  check('send: exactamente esos campos y exp', Object.keys(fl).sort().join() === 'exp,kind,rn,room,ru,state,uid,ver', Object.keys(fl));
  const exp = Date.parse(fl.exp.timestampValue) - Date.now();
  check('send: exp ≈ ahora + 180 días', Math.abs(exp - 180 * 86400000) < 60000, exp);
  check('send: t = hora del servidor (REQUEST_TIME) y no existe antes', w.updateTransforms[0].fieldPath === 't' && w.updateTransforms[0].setToServerValue === 'REQUEST_TIME' && w.currentDocument.exists === false);
  r = await R.send({ u: 'u9', n: 'x' }, 'K7P2QX', { fetch: fakeFetch, base, auth });
  check('send: la segunda vez al mismo, dup y sin llamada', r === 'dup' && calls.length === 1);
  r = await R.send({ u: 'u8', n: 'x' }, '', { fetch: fakeFetch, base, auth: () => Promise.reject(new Error('unauthenticated')) });
  check('send: sin sesión, noacc y sin llamada', r === 'noacc' && calls.length === 1, r);
  r = await R.send({ u: 'u7', n: 'x' }, '', { fetch: async () => ({ ok: false, status: 403 }), base, auth });
  check('send: 403 (reglas sin desplegar) → fail, y se puede reintentar', r === 'fail' && (await R.send({ u: 'u7', n: 'x' }, '', { fetch: fakeFetch, base, auth })) === 'ok');
  const c2 = ctxWith(); c2.VB.Account = { FS_BASE: base, netAuth: auth, isIn: () => false };
  check('send: VB.Account sin sesión → noacc', (await c2.VB.Report.send({ u: 'u1', n: 'x' }, '')) === 'noacc');

  // ocultar nombres
  const F = c.VB.NameFilter, S = c.VB.ctx.settings;
  check('sin ocultar: el nombre tal cual', F.shown('Lucía', 'uX') === 'Lucía');
  S.hideNames = true;
  check('ocultando: «Jugador NNNN» estable por uid', /^Jugador \d{4}$/.test(F.shown('Lucía', 'uX')) && F.shown('Lucía', 'uX') === F.shown('Otro', 'uX'), F.shown('Lucía', 'uX'));
  c.VB.Account = { netInfo: () => ({ uid: 'me1' }) };
  check('ocultando: tu uid no se tapa', F.shown('Yo Mismo', 'me1') === 'Yo Mismo');
  check('ocultando: tu nombre anónimo no se tapa', F.shown(F.anonName()) === F.anonName());
  c.localStorage.setItem('make-the-cut.nick', 'Mi Apodo'); c.localStorage.setItem('make-the-cut.nickv', '1');
  check('ocultando: tu apodo no se tapa', F.nick() !== 'Mi Apodo' || F.shown('Mi Apodo') === 'Mi Apodo', F.nick());
  S.hideNames = false;

  // netlobby: uso de los bloqueados (lectura del código: el comportamiento se mira en el navegador con olmock)
  const nl = fs.readFileSync(path.join(ROOT, 'js', 'netlobby.js'), 'utf8');
  check('netlobby: la lista quita las salas con bloqueados', /L\.rooms = rs\.filter\(function \(r\) \{ return !roomBlocked\(r\); \}\)/.test(nl));
  check('netlobby: anfitrión 1v1 saca al bloqueado (unguest)', /if \(r\.guest && isBlocked\(r\.guest\)\)[^\n]*unguest/.test(nl));
  check('netlobby: sala de varios saca al bloqueado (kick)', /isBlocked\(u\) && !E\.started\) \{ E\.ban\[u\] = Infinity;[^\n]*kick\(u\)/.test(nl));
  check('netlobby: no entra por código en la sala de un anfitrión bloqueado', /isBlocked\(roomHost\(r\)\)\) \{ L\.msg = 'Has bloqueado a quien creó esta sala\.'/.test(nl));
  check('netlobby: «Denunciar nombre» en la lista, la sala de espera y la de varios', (nl.match(/data-a=\\"report\\"|data-a="report"|act\('report'/g) || []).length >= 5);
  check('netroom: unguest para la sala 1v1', /unguest: function \(\)/.test(fs.readFileSync(path.join(ROOT, 'js', 'netroom.js'), 'utf8')));
  check('ui.js: «Denunciar nombre» en la hoja final del online', /NL\.report\(\)/.test(fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8')));
}

/* ---------- 2) reglas en el emulador ---------- */
function findJar() {
  const d = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
  try { return fs.readdirSync(d).filter(f => /^cloud-firestore-emulator-.*\.jar$/.test(f)).sort().map(f => path.join(d, f)).pop() || null; } catch (e) { return null; }
}
function killTree(p) { if (!p || p.killed) return; try { if (process.platform === 'win32') require('child_process').spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); else p.kill(); } catch (e) { } }
function b64u(o) { return Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function tok(uid, email) {
  const t = Math.floor(Date.now() / 1000);
  return b64u({ alg: 'none', typ: 'JWT' }) + '.' + b64u(Object.assign({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: t, user_id: uid, sub: uid, iat: t, exp: t + 3600,
    firebase: { identities: {}, sign_in_provider: 'password' } }, email ? { email: email, email_verified: true } : {})) + '.';
}
async function startEmu(jar, rulesText, port) {
  fs.mkdirSync(path.join(ROOT, 'tools', 'out'), { recursive: true });
  const tmp = path.join(ROOT, 'tools', 'out', 'report-' + port + '.rules'); fs.writeFileSync(tmp, rulesText);
  const java = spawn('java', ['-Xmx384m', '-jar', jar, '--host', '127.0.0.1', '--port', String(port), '--rules', tmp, '--project_id', PROJECT], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let log = ''; java.stdout.on('data', d => { log += d; }); java.stderr.on('data', d => { log += d; });
  process.on('exit', () => killTree(java));
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { await sleep(500); try { up = (await fetch('http://127.0.0.1:' + port + '/')).status < 500; } catch (e) { } }
  if (!up) { console.log(log.slice(-1500)); killTree(java); return null; }
  return java;
}
async function part2() {
  const jar = NO_EMU ? null : findJar();
  if (!jar) { console.log('\n2) (sin emulador de Firestore: solo la parte 1)'); return; }
  console.log('\n2) reglas de feedback (denuncias) en el emulador');
  const H = 'c0592685221ed4a093808f6d3f8a863be6f6d4a1894b00b91e90b07719048deb', ADMIN = 'Admin@Prueba.invalid';
  const rules = fs.readFileSync(path.join(ROOT, 'firebase', 'firestore.rules'), 'utf8').split(H).join(crypto.createHash('sha256').update(ADMIN.toLowerCase()).digest('hex'));
  const java = await startEmu(jar, rules, PORT);
  if (!java) { check('el emulador arranca con las reglas', false); return; }
  try {
    const base = 'http://127.0.0.1:' + PORT + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
    const A = tok('uidA', 'ana@x.invalid'), B = tok('uidB', 'bea@x.invalid'), AD = tok('uidF', ADMIN);
    // el cliente de verdad (js/report.js) contra el emulador
    const c = ctxWith({ fetch: (u, o) => fetch(u, o) });
    const got = await c.VB.Report.send({ u: 'uidB', n: 'Bea', raw: 'Bea' }, 'K7P2QX', { base, auth: () => Promise.resolve({ uid: 'uidA', token: A }) });
    check('el cliente de verdad guarda la denuncia', got === 'ok', got);
    const commit = async (fields, t, opts) => {
      opts = opts || {};
      const id = opts.id || crypto.randomBytes(15).toString('base64').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 20);
      const w = { update: { name: 'projects/' + PROJECT + '/databases/(default)/documents/feedback/' + id, fields }, currentDocument: { exists: false } };
      if (!opts.noT) w.updateTransforms = [{ fieldPath: 't', setToServerValue: 'REQUEST_TIME' }];
      const h = { 'Content-Type': 'application/json' }; if (t) h.Authorization = 'Bearer ' + t;
      return (await fetch(base + ':commit', { method: 'POST', headers: h, body: JSON.stringify({ writes: [w] }) })).status;
    };
    const S = v => ({ stringValue: v }), TS = ms => ({ timestampValue: new Date(Date.now() + ms).toISOString() });
    const good = () => ({ kind: S('report'), uid: S('uidA'), ru: S('uidB'), rn: S('Bea'), room: S('K7P2QX'), ver: S('1.2.3'), state: S('nuevo'), exp: TS(180 * 86400000) });
    const mut = (f) => { const g = good(); f(g); return g; };
    check('denuncia correcta 200', await commit(good(), A) === 200);
    check('sin sesión 403', await commit(mut(g => { g.uid = S(''); }), null) === 403);
    check('con el uid de otro 403', await commit(good(), B) === 403);
    check('denunciarse a sí mismo 403', await commit(mut(g => { g.ru = S('uidA'); }), A) === 403);
    check('campo de más 403', await commit(mut(g => { g.text = S('hola hola'); }), A) === 403);
    check('kind raro 403', await commit(mut(g => { g.kind = S('denuncia'); }), A) === 403);
    check('nombre de más de 40 403', await commit(mut(g => { g.rn = S('x'.repeat(41)); }), A) === 403);
    check('exp de más de 200 días 403', await commit(mut(g => { g.exp = TS(210 * 86400000); }), A) === 403);
    check('exp en el pasado 403', await commit(mut(g => { g.exp = TS(-60000); }), A) === 403);
    check('sin exp 403', await commit(mut(g => { delete g.exp; }), A) === 403);
    check('t del cliente (no la del servidor) 403', await commit(mut(g => { g.t = TS(0); }), A, { noT: true }) === 403);
    check('state distinto de nuevo 403', await commit(mut(g => { g.state = S('visto'); }), A) === 403);
    // la sugerencia de siempre sigue
    const sug = { kind: S('sug'), text: S('Una idea buena'), ver: S('1.2.3'), ctx: S('{}'), uid: S('uidA'), state: S('nuevo') };
    check('una sugerencia como antes sigue valiendo 200', await commit(sug, A) === 200);
    check('una sugerencia con kind report y campos de sugerencia 403', await commit(Object.assign({}, sug, { kind: S('report') }), A) === 403);
    // leer
    const list = async t => (await fetch(base + '/feedback?pageSize=50', { headers: { Authorization: 'Bearer ' + t } })).status;
    check('un jugador no lista las denuncias 403', await list(A) === 403);
    check('el administrador sí 200', await list(AD) === 200);
  } finally { killTree(java); }
}

(async () => {
  try { await part1(); await part2(); } catch (e) { fails++; console.log('  FALLO ' + (e && e.stack || e)); }
  console.log((fails ? 'FALLOS: ' + fails : 'TODO OK') + ' (' + oks + ' ok)');
  process.exit(fails ? 1 : 0);
})();
