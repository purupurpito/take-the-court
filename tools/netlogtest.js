#!/usr/bin/env node
/* TAKE THE COURT — tools/netlogtest.js  (owner: net)
 * Informe de red de los partidos online (js/netlog.js) y reglas de netlogs/{id} (firebase/firestore.rules).
 *  1) Siempre: NetLog con una sesión y un enlace simulados: ventanas de 10 s, sucesos, que NO escribe nada durante el partido y
 *     escribe UNA vez al acabar, sin direcciones IP aunque getStats las tenga.
 *     Online V2: una sesión Fluida simulada (model 'fluida', sin stats.depth ni s.adv, con flStats): modelo, foto de flStats en
 *     cada ventana y en el total, rb/adv a null y el suceso 'marcador_distinto'. Y que el informe Precisa dice modelo 'precisa'.
 *  2) Con el emulador de Firestore (como tools/roomtest.js): las reglas. Se prueba una COPIA con el hash de un correo de prueba en
 *     vez del de Ferran (el correo de verdad no está en el repo).
 * Uso: node tools/netlogtest.js [--no-emu] [--port 8093]
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARGS = process.argv.slice(2), NO_EMU = ARGS.includes('--no-emu');
const PORT = +(ARGS[ARGS.indexOf('--port') + 1] || 0) || 8093, PROJECT = 'demo-mtc';
let fails = 0, oks = 0;
function check(name, ok, info) { if (ok) oks++; else fails++; console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const realFetch = globalThis.fetch, realPerf = globalThis.performance;   // (la parte 1 lo sustituye por uno simulado; la 2 habla con el emulador de verdad)

/* ---------- 1) NetLog en Node ---------- */
async function unit() {
  console.log('\nNetLog con sesión y enlace simulados');
  let T = 1000;
  const writes = [];
  globalThis.performance = { now: () => T };
  globalThis.window = undefined;
  globalThis.VB = { VERSION: '9.9.9', Account: { FS_BASE: 'http://fs/v1/projects/p/databases/(default)/documents', netAuth: async () => ({ uid: 'uidA', token: 'tok' }) } };
  globalThis.fetch = async (url, o) => { writes.push({ url, o }); return { status: 200 }; };
  require(path.join(ROOT, 'js/netlog.js'));
  const NL = globalThis.VB.NetLog;
  const sess = { rttSeq: 0, rttLast: 0, stats: { sent: 0, recv: 0, bytesOut: 0, steps: 0, resyncs: 0, depth: 0, maxDepth: 0, waits: 0, frames: 0 }, status: 'starting', delay: 2, adv: 0, cmpBad: -1, rivalName: 'Bea', opts: { venue: 'beach', points: 21 } };
  const link = { info: () => ({ type: 'srflx', rtt: 62, rtype: 'srflx', proto: 'udp', address: '81.2.3.4', ip: '81.2.3.4' }) };
  const net = { sess, link, slot: 0, epoch: 0, name: 'Ana', rival: 'Bea' };
  const r = (o) => Object.assign({ status: sess.status, unstable: false, solo: false, gone: false, result: null }, o || {});
  // 35 s de partido a 60 fps, ping cada segundo (70 con un pico de 150), una espera de 400 ms a los 12 s
  NL.frame(net, r());
  sess.status = 'playing';
  for (let f = 0; f < 35 * 60; f++) {
    T += 1000 / 60;
    if (f % 60 === 0) { sess.rttSeq++; sess.rttLast = f === 660 ? 150 : 70; }
    sess.stats.depth = f % 7; sess.stats.sent++; sess.stats.recv++; sess.stats.steps++;
    if (f === 720) sess.status = 'waiting';
    if (f === 744) sess.status = 'playing';
    if (f === 900) sess.stats.resyncs = 1;
    NL.frame(net, r());
  }
  check('nada se escribe durante el partido', writes.length === 0, writes.length);
  const cur = NL._report();
  check('3 ventanas de 10 s cerradas', cur && cur.wins.length === 3, cur && cur.wins.length);
  const w0 = cur.wins[0], w1 = cur.wins[1];
  check('ping de la app de la 1ª ventana [mín, media, p95, máx] = 70', JSON.stringify(w0.rtt) === '[70,70,70,70]', w0.rtt);
  check('el pico de 150 sale en el máximo de la 2ª ventana', w1.rtt && w1.rtt[3] === 150, w1.rtt);
  check('ping de la red (WebRTC) 62', w0.ice && w0.ice[1] === 62, w0.ice);
  check('fps ~60', Math.abs(w0.fps - 60) < 1.5, w0.fps);
  check('rollback medio y máximo', w0.rb && w0.rb[1] === 6 && w0.rb[0] > 2 && w0.rb[0] < 4, w0.rb);
  check('la espera cuenta en su ventana (1 vez, ~400 ms)', w1.waits === 1 && Math.abs(w1.waitMs - 400) < 40, [w1.waits, w1.waitMs]);
  check('sucesos: inicio, juega, espera, resync', ['inicio', 'juega', 'espera', 'resync'].every(k => cur.ev.some(e => e.k === k)), cur.ev.map(e => e.k));
  check('ruta de la conexión (tipos y protocolo)', cur.conn === 'srflx/srflx/udp', cur.conn);
  check('ninguna IP en el informe', !/\d+\.\d+\.\d+\.\d+/.test(JSON.stringify(cur)));
  check('entorno sin correo', cur.env && !/@/.test(JSON.stringify(cur.env)));
  // final y cierre
  sess.status = 'over';
  NL.frame(net, r({ status: 'over', result: { win: true, why: 'over' } }));
  NL.end(net, 'cierra');
  await sleep(20);
  check('al acabar se escribe UNA vez', writes.length === 1, writes.length);
  const wr = writes[0], body = wr && JSON.parse(wr.o.body);
  check('PATCH a netlogs/uidA_<id>', wr && wr.o.method === 'PATCH' && /\/netlogs\/uidA_[0-9a-z]+$/.test(wr.url), wr && wr.url);
  check('campos uid, ver, t, j', body && Object.keys(body.fields).sort().join() === 'j,t,uid,ver', body && Object.keys(body.fields));
  const rep = body && JSON.parse(body.fields.j.stringValue);
  check('el informe Precisa dice modelo precisa y no trae fl', rep && rep.modelo === 'precisa' && rep.fl === undefined && rep.wins.every(w => w.fl === undefined), rep && rep.modelo);
  check('el informe trae resultado y fin', rep && rep.res && rep.res.gana === true && rep.ev.some(e => e.k === 'fin'), rep && rep.res);
  check('sin IP en lo que se manda', !/\d+\.\d+\.\d+\.\d+/.test(wr.o.body));
  NL.end(net, 'otra vez');
  await sleep(10);
  check('end() dos veces no escribe dos veces', writes.length === 1, writes.length);
  // sin cuenta (BcLink de las pruebas: sin info()) no hace nada
  const n2 = { sess: Object.assign({}, sess, { stats: Object.assign({}, sess.stats) }), link: {}, slot: 1, epoch: 0, name: 'X' };
  NL.frame(n2, r()); NL.end(n2, 'x'); await sleep(10);
  check('sin enlace WebRTC (pruebas por BroadcastChannel) no escribe', writes.length === 1, writes.length);
  await fluida(NL, writes, () => T, v => { T = v; }, link);
}

/* ---------- 1b) sesión Fluida simulada (Online V2) ---------- */
async function fluida(NL, writes, getT, setT, link) {
  console.log('\nNetLog con una sesión Fluida simulada');
  let T = getT();
  const fl = { snapOut: 0, snapIn: 0, kbOut: 0, kbIn: 0, interpMs: 0, extrapTicks: 0, stale: 0, hand: 0, forks: 0, late: 0, lateMaxMs: 0, warpMax: 0, snaps: 0, drift: 0, fqSent: 0, fqOk: 0, ptBad: 0, sbFix: 0, digestBad: 0, khCheckBad: 0 };
  const sess = { model: 'fluida', rttSeq: 0, rttLast: 0, stats: { frames: 0, steps: 0, sent: 0, recv: 0, bytesOut: 0, waits: 0, resyncs: 0, rsIn: 0, depth: undefined, maxDepth: undefined },
    flStats: fl, status: 'starting', delay: 0, adv: 0, cmpBad: -1, rivalName: 'Bea', opts: { venue: 'hall', points: 25, net: 'fluida' } };
  delete sess.adv;   // (Fluida: sin ventaja de frames)
  const net = { sess, link, slot: 1, epoch: 0, name: 'Ana', rival: 'Bea' };
  const r = (o) => Object.assign({ status: sess.status, unstable: false, solo: false, gone: false, result: null }, o || {});
  NL.frame(net, r());
  sess.status = 'playing';
  for (let f = 0; f < 25 * 60; f++) {
    T += 1000 / 60; setT(T);
    if (f % 60 === 0) { sess.rttSeq++; sess.rttLast = 90; }
    if (f % 2 === 0) { fl.snapOut++; fl.snapIn++; fl.kbOut += 0.1; fl.kbIn += 0.1; fl.snaps++; }
    fl.interpMs = 100 + (f % 10); fl.extrapTicks = f % 5;
    if (f === 300) { fl.forks++; fl.late++; fl.lateMaxMs = 180.27; fl.warpMax = 3; }
    if (f === 800) fl.ptBad = 1;
    if (f === 801) fl.ptBad = 1;   // (no vuelve a avisar si no sube)
    if (f === 1000) fl.digestBad = 1;
    sess.stats.sent++; sess.stats.recv++; sess.stats.steps++;
    NL.frame(net, r());
  }
  const cur = NL._report();
  check('Fluida: modelo fluida', cur && cur.modelo === 'fluida', cur && cur.modelo);
  check('Fluida: 2 ventanas cerradas', cur && cur.wins.length === 2, cur && cur.wins.length);
  const w0 = cur.wins[0], w1 = cur.wins[1];
  check('Fluida: sin rollback ni ventaja (rb/adv null)', w0.rb === null && w0.adv === null && w1.rb === null && w1.adv === null, [w0.rb, w0.adv]);
  check('Fluida: total maxDepth null', cur.total.maxDepth === null, cur.total.maxDepth);
  check('Fluida: foto de flStats en cada ventana', w0.fl && w1.fl && Math.abs(w0.fl.snapOut - 300) <= 2 && Math.abs(w1.fl.snapOut - 600) <= 2 && w0.fl.forks === 1 && w0.fl.lateMaxMs === 180.3, w0.fl);
  check('Fluida: la foto solo trae los campos listados', w0.fl && !('stale' in w0.fl) && !('khCheckBad' in w0.fl) && 'digestBad' in w0.fl, w0.fl && Object.keys(w0.fl));
  const md = cur.ev.filter(e => e.k === 'marcador_distinto');
  check('Fluida: marcador_distinto dos veces (ptBad y digestBad)', md.length === 2 && md[0].pt === 1 && md[0].resumen === 0 && md[1].resumen === 1, md);
  check('Fluida: no hay huella_distinta', !cur.ev.some(e => e.k === 'huella_distinta'));
  sess.status = 'over';
  NL.frame(net, r({ status: 'over', result: { win: false, why: 'over' } }));
  NL.end(net, 'cierra');
  await sleep(20);
  check('Fluida: al acabar se escribe una vez', writes.length === 2, writes.length);
  const rep = writes[1] && JSON.parse(JSON.parse(writes[1].o.body).fields.j.stringValue);
  check('Fluida: el informe guardado trae modelo, fl final y rol', rep && rep.modelo === 'fluida' && rep.fl && rep.fl.digestBad === 1 && rep.fl.ptBad === 1 && rep.rol === 'invitado', rep && rep.fl);
  check('Fluida: sin IP en lo que se manda', writes[1] && !/\d+\.\d+\.\d+\.\d+/.test(writes[1].o.body));
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
async function emu() {
  globalThis.fetch = realFetch; globalThis.performance = realPerf;
  const jar = NO_EMU ? null : findJar();
  if (!jar) { console.log('\n(sin emulador de Firestore: solo la parte 1)'); return; }
  console.log('\nReglas de netlogs en el emulador');
  const real = fs.readFileSync(path.join(ROOT, 'firebase', 'firestore.rules'), 'utf8');
  const H = 'c0592685221ed4a093808f6d3f8a863be6f6d4a1894b00b91e90b07719048deb';
  check('las reglas leen con el hash del acta (js/ui.js)', real.indexOf(H) > 0 && fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8').indexOf(H) > 0);
  const ADMIN = 'Admin@Prueba.invalid', h = crypto.createHash('sha256').update(ADMIN.toLowerCase()).digest('hex');
  fs.mkdirSync(path.join(ROOT, 'tools', 'out'), { recursive: true });
  const tmp = path.join(ROOT, 'tools', 'out', 'netlog.rules'); fs.writeFileSync(tmp, real.split(H).join(h));
  const java = spawn('java', ['-Xmx384m', '-jar', jar, '--host', '127.0.0.1', '--port', String(PORT), '--rules', tmp, '--project_id', PROJECT], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let log = ''; java.stdout.on('data', d => { log += d; }); java.stderr.on('data', d => { log += d; });
  process.on('exit', () => killTree(java));
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { await sleep(500); try { up = (await fetch('http://127.0.0.1:' + PORT + '/')).status < 500; } catch (e) { } }
  if (!up) { console.log(log.slice(-1500)); check('el emulador arranca con las reglas', false); killTree(java); return; }
  if (process.env.NLDEBUG) { await sleep(3000); console.log(log.slice(-1500)); }
  const base = 'http://127.0.0.1:' + PORT + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
  const doc = (uid, j, extra) => ({ fields: Object.assign({ uid: { stringValue: uid }, ver: { stringValue: '1.8.1' }, t: { timestampValue: new Date().toISOString() }, j: { stringValue: j || '{}' } }, extra || {}) });
  const call = async (method, p, body, t) => { const st = (await fetch(base + p, { method, headers: Object.assign({ Authorization: 'Bearer ' + t }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined })).status; if (process.env.NLDEBUG) console.log('    ' + method + ' ' + p + ' -> ' + st); return st; };
  const A = tok('uidA', 'ana@x.invalid'), B = tok('uidB', 'bea@x.invalid'), AD = tok('uidF', ADMIN);
  check('crear el propio', await call('PATCH', '/netlogs/uidA_abc123', doc('uidA'), A) === 200);
  check('actualizar el propio', await call('PATCH', '/netlogs/uidA_abc123', doc('uidA', '{"a":1}'), A) === 200);
  check('no con id de otro', await call('PATCH', '/netlogs/uidB_abc123', doc('uidA'), A) === 403);
  check('no con uid de otro', await call('PATCH', '/netlogs/uidA_zzz999', doc('uidB'), A) === 403);
  check('no pisar el de otro', await call('PATCH', '/netlogs/uidA_abc123', doc('uidB'), B) === 403);
  check('no campos de más', await call('PATCH', '/netlogs/uidA_x1y2z3', doc('uidA', '{}', { ip: { stringValue: '1.2.3.4' } }), A) === 403);
  check('no más de 250 000 caracteres', await call('PATCH', '/netlogs/uidA_big001', doc('uidA', 'x'.repeat(250001)), A) === 403);
  check('sin sesión no se crea', (await fetch(base + '/netlogs/uidA_anon01', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc('uidA')) })).status === 403);
  check('el jugador no lo puede leer', await call('GET', '/netlogs/uidA_abc123', null, A) === 403);
  check('el jugador no lo puede borrar', await call('DELETE', '/netlogs/uidA_abc123', null, A) === 403);
  check('el administrador lo lee', await call('GET', '/netlogs/uidA_abc123', null, AD) === 200);
  const q = await fetch(base + ':runQuery', { method: 'POST', headers: { Authorization: 'Bearer ' + AD, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'netlogs' }], orderBy: [{ field: { fieldPath: 't' }, direction: 'DESCENDING' }], limit: 50 } }) });
  check('el administrador los lista', q.status === 200, q.status);
  const q2 = await fetch(base + ':runQuery', { method: 'POST', headers: { Authorization: 'Bearer ' + B, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'netlogs' }], limit: 50 } }) });
  check('otro jugador no los lista', q2.status === 403, q2.status);
  killTree(java);
}

(async () => {
  try { await unit(); } catch (e) { check('parte 1 sin excepciones', false, String(e && e.stack || e)); }
  try { await emu(); } catch (e) { check('parte 2 sin excepciones', false, String(e && e.stack || e)); }
  console.log('\n' + (fails ? '== netlogtest: ' + fails + ' FALLOS (' + oks + ' ok) ==' : '== netlogtest OK (' + oks + ' comprobaciones) =='));
  process.exit(fails ? 1 : 0);
})();
