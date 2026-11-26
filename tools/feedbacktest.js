#!/usr/bin/env node
/* TAKE THE COURT — tools/feedbacktest.js (owner: ui_main)
 * Pruebas de las opiniones (sugerencias y bugs, 1.22.1; js/feedback.js, notes/feedback.md). Tres partes:
 *  1) SIN navegador (siempre): js/feedback.js en node con un localStorage y un fetch de mentira: validación, envío (documents:commit con
 *     t = REQUEST_TIME, currentDocument.exists = false, sin Authorization sin sesión y con ella con la sesión), cola sin conexión y con
 *     403 (reglas sin desplegar), 400 que se descarta, 409 que cuenta como enviado, tope de 20 en la cola, límites (1 cada 30 s, 10 al
 *     día), contexto sin datos personales (sin arrobas, rutas recortadas, errores solo en los bugs, ≤ 4000), la cuenta fijada al mandarlo, la cola que se tira tras 30 intentos y 14 días, y el visor
 *     (que no se rompe con un ctx raro).
 *  2) Con el emulador de Firestore (como tools/roomtest.js; --no-emu la salta): las reglas de feedback con la huella de admin()
 *     cambiada por la de una cuenta de prueba (solo en la copia temporal): crear con y sin sesión, campos de más, tamaños, hora del
 *     cliente, leer/listar/cambiar solo admin (solo state y note), nadie borra; y netlogs sigue leyéndose solo con admin().
 *  3) Con navegador (tools/cdp.js; NOCDP=1 la salta). Firestore nunca se toca: un script inicial cambia window.fetch para las
 *     direcciones de firestore.googleapis.com (modo ok / 403 / sin red, y apunta lo que se manda). (a) Ajustes › Info › «Sugerir una
 *     mejora»: panel con el tipo puesto, las teclas van al cuadro (Q, E, F no llegan al juego), Tab sale del cuadro, enviar → «Enviado.
 *     Gracias.», «Hecho» vuelve a Ajustes › Info; (b) pausa › «Bug»: tipo bug, «¿Dónde pasó?» con Partido, error de JS capturado en el
 *     contexto, 403 → «Guardado. Se manda solo cuando haya conexión» y en la cola; otro envío antes de 30 s → «Espera»; sin red → cola;
 *     flush() con red → cola vacía; Esc en el cuadro cierra y la pausa sigue; (c) al arrancar con cosas en la cola, se mandan solas;
 *     (d) móvil 844×390 táctil: desde la pausa, el panel y sus botones dentro de la pantalla; (e) la fila del visor no sale sin la
 *     cuenta de Ferran; (f) mando: A en «Bug» de la pausa abre el panel, ↓ pasa por el cuadro y B vuelve.
 * Uso: node tools/feedbacktest.js [--no-emu] [--port 8095]     Sale con 1 si falla algo.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), crypto = require('crypto'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARGS = process.argv.slice(2), NO_EMU = ARGS.includes('--no-emu');
const PORT = +(ARGS[ARGS.indexOf('--port') + 1] || 0) || 8095;
let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined && !ok ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
  return !!ok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------------- 1) sin navegador */
function boot(o) {
  o = o || {};
  const store = {};
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const ctx = { console: { log() { }, info() { }, error() { } }, setTimeout, clearTimeout, Promise, JSON, Math, Date, Uint8Array, crypto: globalThis.crypto,
    localStorage: ls, navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', language: 'es-ES', maxTouchPoints: 5, hardwareConcurrency: 8 },
    screen: { width: 915, height: 412 }, devicePixelRatio: 2.6, innerWidth: 844, innerHeight: 390, location: { hostname: 'takethecourt.com' } };
  ctx.globalThis = ctx;
  ctx.VB = { VERSION: '1.22.1', ctx: { settings: { quality: 'medium' }, quality: { name: 'media', rank: 1 } } };
  if (o.account) ctx.VB.Account = o.account;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'feedback.js'), 'utf8'), ctx, { filename: 'feedback.js' });
  return { ctx, FB: ctx.VB.Feedback, store };
}
function mockFetch(seq) {
  const calls = [];
  const f = async (url, opt) => {
    calls.push({ url, opt, body: opt && opt.body ? JSON.parse(opt.body) : null });
    const st = typeof seq === 'function' ? seq(calls.length - 1) : seq;
    if (st === 'net') throw new TypeError('Failed to fetch');
    return { ok: st >= 200 && st < 300, status: st, text: async () => '{}' };
  };
  f.calls = calls; return f;
}
const FS_BASE = 'https://firestore.googleapis.com/v1/projects/make-the-cut-vb/databases/(default)/documents/';
async function nodeTests() {
  console.log('\n1) js/feedback.js sin navegador');
  let B = boot({ account: { FS_BASE, user: () => null, netAuth: async () => { throw new Error('sin sesión'); } } }), FB = B.FB;
  check('VB.Feedback existe con su API', FB && ['mount', 'submit', 'flush', 'validate', 'canSend', 'context', 'ctxLine', 'viewerUrl', 'queue'].every(k => typeof FB[k] === 'function'));
  check('validar: tipo raro', !!FB.validate({ kind: 'idea', text: 'hola hola' }));
  check('validar: texto corto (4) no, 5 sí', !!FB.validate({ kind: 'sug', text: '  abcd ' }) && FB.validate({ kind: 'sug', text: 'abcde' }) === '');
  check('validar: 2000 sí, 2001 no', FB.validate({ kind: 'bug', text: 'x'.repeat(2000) }) === '' && !!FB.validate({ kind: 'bug', text: 'x'.repeat(2001) }));
  check('validar: «dónde» fuera de la lista', !!FB.validate({ kind: 'bug', text: 'hola hola', where: 'cocina' }) && FB.validate({ kind: 'bug', text: 'hola hola', where: 'online' }) === '');
  // envío sin sesión
  let f = mockFetch(200); FB._setFetch(f);
  let r = await FB.submit({ kind: 'sug', text: '  Que haya más sedes de playa  ', screen: 'menú > set:info' });
  const c0 = f.calls[0], w0 = c0 && c0.body && c0.body.writes && c0.body.writes[0];
  check('sin sesión: enviado', r.status === 'sent' && r.msg === 'Enviado. Gracias.', r);
  check('POST a documents:commit', c0 && c0.opt.method === 'POST' && c0.url === FS_BASE.replace(/\/$/, '') + ':commit', c0 && c0.url);
  check('sin Authorization sin sesión', c0 && !('Authorization' in c0.opt.headers), c0 && c0.opt.headers);
  check('documento feedback/{id de 20}', w0 && /^projects\/make-the-cut-vb\/databases\/\(default\)\/documents\/feedback\/[A-Za-z0-9]{20}$/.test(w0.update.name), w0 && w0.update.name);
  const fl = w0 && w0.update.fields || {};
  check('campos: kind, text (recortado), ver, ctx, uid \'\', state nuevo; sin where en una sugerencia', fl.kind.stringValue === 'sug' && fl.text.stringValue === 'Que haya más sedes de playa'
    && fl.ver.stringValue === '1.22.1' && typeof fl.ctx.stringValue === 'string' && fl.uid.stringValue === '' && fl.state.stringValue === 'nuevo' && !fl.where && !fl.t, Object.keys(fl));
  check('t = hora del servidor (REQUEST_TIME) y currentDocument.exists = false', w0 && w0.updateTransforms[0].fieldPath === 't' && w0.updateTransforms[0].setToServerValue === 'REQUEST_TIME' && w0.currentDocument.exists === false);
  const cx = JSON.parse(fl.ctx.stringValue);
  check('contexto: versión aparte, navegador, sistema, pantalla, móvil, calidad, idioma y pantalla del juego', cx.env.br === 'Chrome 130' && cx.env.os === 'Android 14' && cx.env.mob === true
    && cx.env.scr === '915x412@2.6' && cx.env.win === '844x390' && cx.q.set === 'medium' && cx.lang === 'es-ES' && cx.screen === 'menú > set:info', cx);
  check('sugerencia: sin errores en el contexto', !('errs' in cx));
  check('cola vacía tras enviar', FB.queue().length === 0);
  // límites
  let lim = FB.canSend();
  check('límite: otra antes de 30 s → espera', !lim.ok && lim.why === 'espera' && lim.wait > 25 && lim.wait <= 30, lim);
  r = await FB.submit({ kind: 'sug', text: 'Otra sugerencia más' });
  check('submit antes de 30 s → error «Espera…» sin enviar', r.status === 'error' && /Espera \d+ s/.test(r.msg) && f.calls.length === 1, r);
  B.store['make-the-cut.feedbackl'] = JSON.stringify(Object.assign(JSON.parse(B.store['make-the-cut.feedbackl']), { last: Date.now() - 31000 }));
  check('pasados 30 s se puede', FB.canSend().ok);
  const lk = JSON.parse(B.store['make-the-cut.feedbackl']); lk.n = 10; B.store['make-the-cut.feedbackl'] = JSON.stringify(lk);
  lim = FB.canSend(); r = await FB.submit({ kind: 'sug', text: 'La número once del día' });
  check('límite: 10 al día', !lim.ok && lim.why === 'dia' && r.status === 'error' && /ya van 10./.test(r.msg), [lim, r]);
  lk.d = '20000101'; B.store['make-the-cut.feedbackl'] = JSON.stringify(lk);
  check('el contador del día vuelve a 0 otro día', FB.canSend().ok);
  // con sesión
  const acc = { FS_BASE, user: () => 'ana', netAuth: async () => ({ uid: 'uidAna', token: 'tok123' }) };
  B = boot({ account: acc }); FB = B.FB; f = mockFetch(200); FB._setFetch(f);
  r = await FB.submit({ kind: 'bug', text: 'Se queda la pantalla en negro', where: 'carrera', screen: 'pausa', mode: 'carrera 2v2, set 1 3-2' });
  const c1 = f.calls[0], f1 = c1.body.writes[0].update.fields;
  check('con sesión: Authorization Bearer y uid de la cuenta', r.status === 'sent' && c1.opt.headers.Authorization === 'Bearer tok123' && f1.uid.stringValue === 'uidAna', [r, c1.opt.headers]);
  check('bug: where y modo en el contexto', f1.where.stringValue === 'carrera' && JSON.parse(f1.ctx.stringValue).mode === 'carrera 2v2, set 1 3-2');
  // cola: 403 (reglas sin desplegar) y sin red
  B = boot({ account: { FS_BASE, user: () => null } }); FB = B.FB; f = mockFetch(403); FB._setFetch(f);
  r = await FB.submit({ kind: 'bug', text: 'No suena el silbato' });
  check('403 → «Guardado. Se manda solo cuando haya conexión» y a la cola', r.status === 'queued' && r.msg === 'Guardado. Se manda solo cuando haya conexión' && FB.queue().length === 1, r);
  check('la cola vive en make-the-cut.feedbackq', JSON.parse(B.store['make-the-cut.feedbackq']).length === 1);
  B.store['make-the-cut.feedbackl'] = JSON.stringify({ d: JSON.parse(B.store['make-the-cut.feedbackl']).d, n: 1, last: 0 });
  f = mockFetch('net'); FB._setFetch(f);
  r = await FB.submit({ kind: 'sug', text: 'Modo de juego 3 contra 3' });
  check('sin red → cola (2)', r.status === 'queued' && FB.queue().length === 2, r);
  let fr = await FB.flush();
  check('flush sin red: sigue todo en la cola', fr.sent === 0 && FB.queue().length === 2, fr);
  f = mockFetch(i => (i === 0 ? 409 : 200)); FB._setFetch(f);
  fr = await FB.flush();
  check('flush con red: 409 (ya estaba) y 200 cuentan como enviados; cola vacía', fr.sent === 2 && FB.queue().length === 0 && !('make-the-cut.feedbackq' in B.store), fr);
  // 400: nunca pasará → se descarta
  B.store['make-the-cut.feedbackl'] = JSON.stringify({ d: '20000101', n: 0, last: 0 });
  f = mockFetch(400); FB._setFetch(f);
  r = await FB.submit({ kind: 'sug', text: 'Texto que el servidor no acepta' });
  check('400 → error y fuera de la cola', r.status === 'error' && FB.queue().length === 0, r);
  // tope de la cola
  const big = []; for (let i = 0; i < 25; i++) big.push({ id: 'id' + String(i).padStart(18, '0'), d: { kind: 'sug', text: 'hola hola ' + i, ver: '1', ctx: '{}' }, at: i });
  B.store['make-the-cut.feedbackq'] = JSON.stringify(big);
  f = mockFetch(403); FB._setFetch(f); await FB.flush();
  const q = FB.queue();
  check('cola: como mucho 20 (se quedan las últimas)', q.length === 20 && q[19].at === 24 && q[0].at === 5, q.length);
  // contexto
  FB._pushErr('error', 'TypeError: x is undefined', 'file:///C:/Users/Alguien/juego/js/ui.js:120:7');
  FB._pushErr('vb', ' CareerUI.render: Error at https://takethecourt.com/js/career-ui.js?v=abc:44:2', '');
  const cb = JSON.parse(FB._ctxJson('bug', { screen: 'pausa' }));
  check('bug: errores en el contexto con las rutas recortadas (sin carpeta de usuario ni dominio)', cb.errs.length === 2 && cb.errs[0].s === 'ui.js:120:7' && !/Alguien|takethecourt\.com\/js|file:/.test(JSON.stringify(cb.errs)), cb.errs);
  for (let i = 0; i < 9; i++) FB._pushErr('error', 'Error número ' + i + ' ' + 'z'.repeat(400), 'a.js:1');
  const cb2 = FB._ctxJson('bug', { screen: 's'.repeat(500), mode: 'm'.repeat(500) });
  check('contexto ≤ 4000 y como mucho 5 errores de 300', cb2.length <= 4000 && JSON.parse(cb2).errs.length === 5 && JSON.parse(cb2).errs.every(e => e.m.length <= 300), cb2.length);
  const line = FB.ctxLine('bug', {});
  check('línea de lo que se adjunta (versión, navegador, sistema, pantalla y errores; nada personal)', /^Se adjunta: versión 1\.22\.1, Chrome 130 en Android 14, pantalla 844×390, calidad media, dónde estabas y los últimos errores del juego \(5\)\. Nada personal/.test(line), line);
  check('el contexto no lleva arrobas', !/@/.test(FB._ctxJson('bug', { screen: 'x' }).replace(/"scr":"[^"]*"/, '')));
  check('visor: pages/feedback.html en el repo', FB.viewerUrl() === 'pages/feedback.html');
  B.ctx.__vbBuild = { v: '1.22.1', sha: 'abc1234' };
  check('visor: feedback.html en Pages', FB.viewerUrl() === 'feedback.html');
  check('ids aleatorios de 20 letras y cifras', /^[A-Za-z0-9]{20}$/.test(FB._newId()) && FB._newId() !== FB._newId());
  check('rutas: sin la consulta (?key=…&refresh_token=…) pero con :línea:columna', FB._clean('at https://securetoken.googleapis.com/v1/token?key=AIzaX&refresh_token=abc y https://x.com/js/ui.js?v=1:44:2') === 'at token y ui.js:44:2', FB._clean('at https://securetoken.googleapis.com/v1/token?key=AIzaX&refresh_token=abc y https://x.com/js/ui.js?v=1:44:2'));
  // la cuenta se fija al mandarlo: lo de la cola nunca sale con la cuenta de otro
  let who = null;
  const acc2 = { FS_BASE, user: () => who, netAuth: async () => { if (!who) throw new Error('sin sesión'); return { uid: 'uid' + who, token: 'tok' + who }; } };
  let B2 = boot({ account: acc2 }), FB2 = B2.FB, f2 = mockFetch(403); FB2._setFetch(f2);
  let r2 = await FB2.submit({ kind: 'sug', text: 'Mandada sin cuenta' });
  check('sin sesión → en la cola con uid \'\'', r2.status === 'queued' && FB2.queue()[0].d.uid === '', FB2.queue()[0]);
  B2.store['make-the-cut.feedbackl'] = JSON.stringify({ d: '20000101', n: 0, last: 0 });
  who = 'Ana'; r2 = await FB2.submit({ kind: 'sug', text: 'Mandada con la cuenta de Ana' });
  check('con sesión de Ana → en la cola con su uid', r2.status === 'queued' && FB2.queue()[1].d.uid === 'uidAna', FB2.queue()[1]);
  who = 'Bea'; f2 = mockFetch(200); FB2._setFetch(f2); await FB2.flush();
  const fw0 = f2.calls[0], fw1 = f2.calls[1];
  check('flush con la sesión de Bea: las dos salen sin Authorization y con uid \'\' (nunca el de Bea)', f2.calls.length === 2 && !fw0.opt.headers.Authorization && !fw1.opt.headers.Authorization
    && fw0.body.writes[0].update.fields.uid.stringValue === '' && fw1.body.writes[0].update.fields.uid.stringValue === '', f2.calls.map(c => [c.opt.headers, c.body.writes[0].update.fields.uid]));
  // la cola no reintenta para siempre: 30 intentos Y más de 14 días → fuera
  const now = Date.now(), D = 864e5;
  B2.store['make-the-cut.feedbackq'] = JSON.stringify([
    { id: 'Viejo000000000000001', d: { kind: 'sug', text: 'viejo y muy reintentado', ver: '1', ctx: '{}', uid: '' }, at: now - 20 * D, tries: 29 },
    { id: 'Viejo000000000000002', d: { kind: 'sug', text: 'viejo pero pocos intentos', ver: '1', ctx: '{}', uid: '' }, at: now - 20 * D, tries: 3 },
    { id: 'Nuevo000000000000003', d: { kind: 'sug', text: 'reciente y muy reintentado', ver: '1', ctx: '{}', uid: '' }, at: now - 2 * D, tries: 50 }]);
  f2 = mockFetch(403); FB2._setFetch(f2); await FB2.flush();
  const q2 = FB2.queue().map(x => x.id);
  check('cola: lo que llega a 30 intentos con más de 14 días se tira; lo demás sigue (con los intentos contados)', q2.length === 2 && q2.indexOf('Viejo000000000000001') < 0
    && FB2.queue().every(x => x.tries >= 4), FB2.queue());
  // ficheros
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('index.html carga js/feedback.js justo después de js/version.js', /<script src="js\/version\.js"><\/script>\n<script src="js\/feedback\.js"><\/script>/.test(idx));
  check('pages/feedback.html existe (lo copia build-pages)', fs.existsSync(path.join(ROOT, 'pages', 'feedback.html')));
  const rules = fs.readFileSync(path.join(ROOT, 'firebase', 'firestore.rules'), 'utf8');
  check('reglas: bloque feedback y admin() una sola vez, a nivel global (antes de netlogs, fuera de rooms)', /match \/feedback\/\{id\}/.test(rules) && (rules.match(/function admin\(\)/g) || []).length === 1 && rules.indexOf('function admin()') < rules.indexOf('match /netlogs/') && rules.indexOf('function admin()') > rules.indexOf('match /rooms/'));
}

/* ---------------------------------------------------------------- 2) emulador */
function findJar() {
  const d = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
  try { return fs.readdirSync(d).filter(f => /^cloud-firestore-emulator-.*\.jar$/.test(f)).sort().map(f => path.join(d, f)).pop() || null; } catch (e) { return null; }
}
function killTree(p) {
  if (!p || p.killed) return;
  try { if (process.platform === 'win32') require('child_process').spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); else p.kill(); } catch (e) { }
}
const PROJECT = 'demo-mtc';
function b64u(o) { return Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function fakeToken(uid, email) {
  const t = Math.floor(Date.now() / 1000), p = { iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: t, user_id: uid, sub: uid, iat: t, exp: t + 3600, firebase: { identities: {}, sign_in_provider: 'password' } };
  if (email) { p.email = email; p.email_verified = true; }
  return b64u({ alg: 'none', typ: 'JWT' }) + '.' + b64u(p) + '.';
}
async function emuTests() {
  const jar = NO_EMU ? null : findJar();
  if (!jar) { console.log('\n2) (sin emulador de Firestore: saltada; `npx firebase-tools@13.29.1 setup:emulators:firestore`)'); return; }
  console.log('\n2) Reglas de feedback contra el emulador');
  const ADMIN = 'admin@pruebas.invalid', HASH = crypto.createHash('sha256').update(ADMIN).digest('hex');
  const src = fs.readFileSync(path.join(ROOT, 'firebase', 'firestore.rules'), 'utf8');
  const real = /== '([0-9a-f]{64})'/.exec(src);
  if (!check('las reglas traen la huella de admin()', !!real)) return;
  const tmpRules = path.join(os.tmpdir(), 'ttc-rules-feedbacktest.rules');
  fs.writeFileSync(tmpRules, src.split(real[1]).join(HASH));
  try { await fetch('http://127.0.0.1:' + PORT + '/'); console.log('  El puerto ' + PORT + ' está ocupado: usa --port N'); fails++; return; } catch (e) { }
  const java = spawn('java', ['-Xmx384m', '-jar', jar, '--host', '127.0.0.1', '--port', String(PORT), '--rules', tmpRules, '--project_id', PROJECT], { stdio: 'ignore', windowsHide: true });
  process.on('exit', () => killTree(java));
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { await sleep(500); try { up = (await fetch('http://127.0.0.1:' + PORT + '/')).status < 500; } catch (e) { } }
  if (!check('el emulador arranca con las reglas', up)) { killTree(java); return; }
  const base = 'http://127.0.0.1:' + PORT + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
  const docRoot = 'projects/' + PROJECT + '/databases/(default)/documents';
  try {
    // cliente de verdad contra el emulador
    const anon = boot({ account: { FS_BASE: base + '/', user: () => null } });
    anon.FB._setFetch(fetch);
    let r = await anon.FB.submit({ kind: 'sug', text: 'Sugerencia sin cuenta', screen: 'menú' });
    check('cliente sin sesión: enviado al emulador', r.status === 'sent', r);
    const ana = boot({ account: { FS_BASE: base + '/', user: () => 'ana', netAuth: async () => ({ uid: 'uidAna', token: fakeToken('uidAna') }) } });
    ana.FB._setFetch(fetch);
    r = await ana.FB.submit({ kind: 'bug', text: 'Bug con cuenta', where: 'online', screen: 'pausa' });
    check('cliente con sesión: enviado (uid = el suyo)', r.status === 'sent', r);
    // escrituras a mano
    const S = v => ({ stringValue: v });
    const good = () => ({ kind: S('bug'), text: S('Texto de prueba'), ver: S('1.22.1'), ctx: S('{}'), uid: S(''), state: S('nuevo') });
    const commit = async (id, fields, tok, opt) => {
      opt = opt || {};
      const w = { update: { name: docRoot + '/feedback/' + id, fields }, currentDocument: { exists: false } };
      if (!opt.clientTime) w.updateTransforms = [{ fieldPath: 't', setToServerValue: 'REQUEST_TIME' }];
      const h = { 'Content-Type': 'application/json' }; if (tok) h.Authorization = 'Bearer ' + tok;
      return (await fetch(base + ':commit', { method: 'POST', headers: h, body: JSON.stringify({ writes: [w] }) })).status;
    };
    const id = n => ('Prueba' + n + 'xxxxxxxxxxxxxxxxxxxxxxxx').slice(0, 20);
    check('crear sin sesión con uid \'\' → 200', await commit(id(1), good()) === 200);
    check('crear sin sesión con un uid → 403', await commit(id(2), Object.assign(good(), { uid: S('uidAna') })) === 403);
    check('crear con sesión y uid de otro → 403', await commit(id(3), Object.assign(good(), { uid: S('uidBea') }), fakeToken('uidAna')) === 403);
    check('crear con sesión y uid \'\' → 403', await commit(id(4), good(), fakeToken('uidAna')) === 403);
    check('campo de más → 403', await commit(id(5), Object.assign(good(), { email: S('x') })) === 403);
    check('falta ctx → 403', await commit(id(6), (g => { delete g.ctx; return g; })(good())) === 403);
    check('kind raro → 403', await commit(id(7), Object.assign(good(), { kind: S('queja') })) === 403);
    check('texto de 4 → 403; de 2000 → 200; de 2001 → 403', await commit(id(8), Object.assign(good(), { text: S('abcd') })) === 403
      && await commit(id(9), Object.assign(good(), { text: S('x'.repeat(2000)) })) === 200 && await commit(id(10), Object.assign(good(), { text: S('x'.repeat(2001)) })) === 403);
    check('where de la lista → 200; fuera → 403', await commit(id(11), Object.assign(good(), { where: S('menus') })) === 200 && await commit(id(12), Object.assign(good(), { where: S('cocina') })) === 403);
    check('ver de 21 → 403; ctx de 4001 → 403', await commit(id(13), Object.assign(good(), { ver: S('x'.repeat(21)) })) === 403 && await commit(id(14), Object.assign(good(), { ctx: S('x'.repeat(4001)) })) === 403);
    check('state distinto de nuevo → 403', await commit(id(15), Object.assign(good(), { state: S('hecho') })) === 403);
    check('t del cliente (no la del servidor) → 403', await commit(id(16), Object.assign(good(), { t: { timestampValue: new Date().toISOString() } }), null, { clientTime: true }) === 403);
    check('id corto o raro → 403', await commit('abc', good()) === 403 && await commit('Prueba_17-xxxxxxxxxxx', good()) === 403);
    check('escribir encima de uno que ya existe → no se puede', await commit(id(1), good()) !== 200);
    // leer
    const q = async tok => { const h = { 'Content-Type': 'application/json' }; if (tok) h.Authorization = 'Bearer ' + tok;
      const res = await fetch(base + ':runQuery', { method: 'POST', headers: h, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'feedback' }], orderBy: [{ field: { fieldPath: 't' }, direction: 'DESCENDING' }], limit: 50 } }) });
      return { status: res.status, j: await res.json().catch(() => null) }; };
    check('listar sin sesión → 403', (await q()).status === 403);
    check('listar con una cuenta normal → 403', (await q(fakeToken('uidAna', 'ana@pruebas.invalid'))).status === 403);
    const get1 = await fetch(base + '/feedback/' + id(1), { headers: { Authorization: 'Bearer ' + fakeToken('uidAna', 'ana@pruebas.invalid') } });
    check('leer uno con una cuenta normal → 403', get1.status === 403);
    check('listar con una cuenta sin correo (usuario y contraseña de antes) → 403, no un error', (await q(fakeToken('uidAna'))).status === 403);
    const ADM = fakeToken('uidAdmin', ADMIN), la = await q(ADM);
    const docs = (la.j || []).filter(x => x.document);
    check('listar con la cuenta admin → 200 con todo (el más nuevo primero)', la.status === 200 && docs.length === 5 && docs.some(d => d.document.fields.text.stringValue === 'Bug con cuenta' && d.document.fields.uid.stringValue === 'uidAna'), [la.status, docs.length]);
    check('t guardada como timestamp del servidor', docs.every(d => d.document.fields.t && d.document.fields.t.timestampValue));
    // cambiar
    const patch = async (docId, fields, mask, tok) => (await fetch(base + '/feedback/' + docId + '?' + mask.map(m => 'updateMask.fieldPaths=' + m).join('&') + '&currentDocument.exists=true',
      { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ fields }) })).status;
    check('admin: state visto + nota → 200', await patch(id(1), { state: S('visto'), note: S('Mirado') }, ['state', 'note'], ADM) === 200);
    check('admin: state raro → 403', await patch(id(1), { state: S('borrado') }, ['state'], ADM) === 403);
    check('admin: nota de 1001 → 403', await patch(id(1), { note: S('n'.repeat(1001)) }, ['note'], ADM) === 403);
    check('admin: cambiar el texto → 403', await patch(id(1), { text: S('Otro texto') }, ['text'], ADM) === 403);
    check('cuenta normal: cambiar state → 403', await patch(id(1), { state: S('hecho') }, ['state'], fakeToken('uidAna', 'ana@pruebas.invalid')) === 403);
    const del = await fetch(base + '/feedback/' + id(1), { method: 'DELETE', headers: { Authorization: 'Bearer ' + ADM } });
    check('borrar, ni siquiera admin → 403', del.status === 403);
    // netlogs: la función admin() movida sigue dejando leer solo a la misma cuenta
    const nlq = async tok => (await fetch(base + ':runQuery', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'netlogs' }], limit: 5 } }) })).status;
    const nlw = await fetch(base + '/netlogs/uidAna_abcd1234', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + fakeToken('uidAna') },
      body: JSON.stringify({ fields: { uid: S('uidAna'), ver: S('1.22.1'), t: { timestampValue: new Date().toISOString() }, j: S('{}') } }) });
    check('netlogs: el jugador escribe el suyo; leer: admin sí, cuenta normal no', nlw.status === 200 && await nlq(ADM) === 200 && await nlq(fakeToken('uidAna', 'ana@pruebas.invalid')) === 403, nlw.status);
  } finally { killTree(java); try { fs.unlinkSync(tmpRules); } catch (e) { } }
}

/* ---------------------------------------------------------------- 3) navegador */
// window.fetch de mentira SOLO para Firestore (nunca sale nada al proyecto de verdad); modo en localStorage para que valga tras recargar
const FETCH_INIT = `(function(){var of=window.fetch;window.__fbCalls=[];
  window.fetch=function(u,o){var s=String(u&&u.url||u);if(s.indexOf('firestore.googleapis.com')<0)return of.apply(this,arguments);
    var m='ok';try{m=localStorage.getItem('fbtest.mode')||'ok';}catch(e){}
    var b=null;try{b=o&&o.body?JSON.parse(o.body):null;}catch(e){}
    window.__fbCalls.push({u:s,m:m,auth:!!(o&&o.headers&&o.headers.Authorization),b:b});
    if(m==='net')return Promise.reject(new TypeError('Failed to fetch'));
    var st=m==='403'?403:200;return Promise.resolve(new Response('{}',{status:st,headers:{'Content-Type':'application/json'}}));};})();`;
async function browser() {
  const CDP = require('./cdp.js');
  const vis = sel => `(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e||e.closest('[hidden]'))return false;var r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';})()`;
  const waitFor = async (pg, expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await pg.evalJs(expr)) return true; } catch (e) { } await sleep(80); } return false; };
  const ready = pg => waitFor(pg, 'window.VB&&VB.ctx&&VB.ctx.state&&VB.UI&&VB.Feedback', 25000);
  const key = async (pg, k, code, text) => {
    const kc = { Tab: 9, Escape: 27, Enter: 13 }[k] || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0);
    await pg.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code: code || '', text: text || undefined, windowsVirtualKeyCode: kc });
    await pg.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code || '', windowsVirtualKeyCode: kc });
  };
  const type = async (pg, s) => { for (const ch of s) await pg.send('Input.dispatchKeyEvent', { type: 'char', text: ch }); };
  const click = (pg, sel) => pg.evalJs(`(function(){var b=document.querySelector(${JSON.stringify(sel)});if(!b||b.closest('[hidden]'))return false;b.click();return true;})()`);
  const st = pg => pg.evalJs('JSON.stringify({panel:VB.UI._settings().panel,stack:VB.UI._settings().stack,tab:VB.UI._settings().tab,fb:VB.UI._fb(),kind:VB.Feedback.kind(),title:document.getElementById("pnTitle").textContent,act:document.activeElement&&(document.activeElement.id||document.activeElement.getAttribute("data-fbk")||document.activeElement.getAttribute("data-go")||document.activeElement.tagName),state:VB.ctx.state,q:VB.Feedback.queue().length,msg:(document.getElementById("fbMsg")||{}).textContent||"",done:(document.querySelector("#pnFb .fb-ok")||{}).textContent||""})').then(JSON.parse);
  const intentional = [];
  let pg;
  try {
    // (a) Ajustes › Info › «Sugerir una mejora»
    console.log('\n3a) Ajustes › Info › Sugerir una mejora (1280×720)');
    pg = await CDP.open({ size: '1280x720', init: [FETCH_INIT, "try{if(!sessionStorage.getItem('fbt')){sessionStorage.setItem('fbt','1');localStorage.clear();}}catch(e){}"] });
    await pg.navigate('debug=menu&nonews=1'); check('el juego arranca', await ready(pg));
    await sleep(1500);
    await pg.evalJs("document.getElementById('btnSettings').click()"); await sleep(300);
    await pg.evalJs("(function(){var t=document.querySelector('#setTabs [data-tab=\"info\"]');if(t)t.click();})()"); await sleep(250);
    check('Ajustes › Info: filas «Sugerir una mejora» y «Avisar de un bug»; el buzón, oculto', await pg.evalJs(vis('[data-go="fbsug"]')) && await pg.evalJs(vis('[data-go="fbbug"]')) && !(await pg.evalJs(vis('[data-go="fbview"]'))));
    await pg.evalJs("document.querySelector('[data-go=\"fbsug\"]').focus()");   // (un toque o un clic de verdad también lo enfoca)
    await click(pg, '[data-go="fbsug"]'); await sleep(350);
    let S = await st(pg);
    check('se abre el panel «fb» con Sugerencia elegida y Ajustes debajo en la pila', S.panel === 'fb' && S.kind === 'sug' && S.title === 'Tu sugerencia' && S.stack.join() === 'set' && await pg.evalJs(vis('#fbText')), S);
    check('contexto: dónde estaba (menú > set:info)', /menú/.test(S.fb.screen) && /set:info/.test(S.fb.screen), S.fb);
    check('la línea de lo que se adjunta se ve', await pg.evalJs(vis('#fbAtt')) && /^Se adjunta: versión /.test(await pg.evalJs("document.getElementById('fbAtt').textContent")));
    // teclado: el cuadro se queda las letras (Q/E cambiarían de pestaña, F pondría pantalla completa)
    await pg.evalJs("document.getElementById('fbText').focus()");
    await type(pg, 'Hola ');
    for (const [k, c] of [['q', 'KeyQ'], ['e', 'KeyE'], ['f', 'KeyF'], ['i', 'KeyI']]) await key(pg, k, c, k);
    await type(pg, ' mas sedes');
    const tv = await pg.evalJs("document.getElementById('fbText').value");
    S = await st(pg);
    check('las letras van al cuadro (Q, E, F, I incluidas) y el juego no se mueve', tv === 'Hola qefi mas sedes' && S.panel === 'fb' && S.act === 'fbText' && !(await pg.evalJs('!!document.fullscreenElement')), [tv, S.act]);
    check('contador de caracteres', /^19 \/ 2000$/.test(await pg.evalJs("document.getElementById('fbCount').textContent")));
    await key(pg, 'Tab', 'Tab'); await sleep(80);
    S = await st(pg);
    check('Tab sale del cuadro al siguiente control', S.act !== 'fbText' && S.act !== 'TEXTAREA', S.act);
    // cambiar de tipo conserva cada borrador
    await click(pg, '[data-fbk="bug"]'); await sleep(120);
    S = await st(pg);
    check('pasar a Bug: título «Avisar de un bug», «¿Dónde pasó?» y cuadro vacío', S.kind === 'bug' && S.title === 'Avisar de un bug' && await pg.evalJs(vis('.fb-where')) && (await pg.evalJs("document.getElementById('fbText').value")) === '', S);
    await click(pg, '[data-fbk="sug"]'); await sleep(120);
    check('volver a Sugerencia: el texto sigue ahí', (await pg.evalJs("document.getElementById('fbText').value")) === 'Hola qefi mas sedes');
    await click(pg, '#fbSend'); await sleep(400);
    S = await st(pg);
    const calls = JSON.parse(await pg.evalJs('JSON.stringify(window.__fbCalls)'));
    check('Enviar → «Enviado. Gracias.»', S.done === 'Enviado. Gracias.', S);
    const w = calls[0] && calls[0].b && calls[0].b.writes[0];
    check('lo enviado: commit sin Authorization, kind sug, texto, uid \'\'', calls.length === 1 && /:commit$/.test(calls[0].u) && !calls[0].auth && w.update.fields.kind.stringValue === 'sug'
      && w.update.fields.text.stringValue === 'Hola qefi mas sedes' && w.update.fields.uid.stringValue === '', calls.length);
    const cx = JSON.parse(w.update.fields.ctx.stringValue);
    check('contexto del navegador: Chrome, Windows, calidad, idioma y sin errores (sugerencia)', /^(Chrome|Edge) \d+/.test(cx.env.br) && cx.env.win === '1280x720' && !!cx.q.set && !!cx.lang && !cx.errs, cx);
    await click(pg, '#fbDone'); await sleep(350);
    S = await st(pg);
    check('«Hecho» vuelve a Ajustes, en Info, con el foco en la fila', S.panel === 'set' && S.tab === 'info' && S.act === 'fbsug', S);
    check('sin errores de JS', !pg.errors.length, pg.errors.slice(0, 3));
    pg.close(); pg = null;

    // (b) pausa › Bug
    console.log('\n3b) Pausa › Bug: cola, límites y Esc (1280×720)');
    pg = await CDP.open({ size: '1280x720', init: [FETCH_INIT, "try{if(!sessionStorage.getItem('fbt')){sessionStorage.setItem('fbt','1');localStorage.clear();localStorage.setItem('fbtest.mode','403');}}catch(e){}"] });
    await pg.navigate('debug=pause&nonews=1'); await ready(pg);
    check('pausa', await waitFor(pg, "VB.ctx.state==='paused'", 8000));
    for (let i = 0; i < 4 && await pg.evalJs('VB.UI.isPanelOpen()'); i++) { await click(pg, '#btnPanelBack'); await sleep(80); }
    check('en la pausa se ven «Sugerencia» y «Bug»', await pg.evalJs(vis('#btnPSug')) && await pg.evalJs(vis('#btnPBug')));
    await pg.evalJs("setTimeout(function(){throw new Error('fallo de prueba feedbacktest')},0)"); intentional.push('fallo de prueba feedbacktest');
    await sleep(150);
    await click(pg, '#btnPBug'); await sleep(350);
    S = await st(pg);
    check('Bug desde la pausa: tipo bug, «Partido» marcado y pila vacía', S.panel === 'fb' && S.kind === 'bug' && S.stack.length === 0 && S.fb.where === 'partido'
      && await pg.evalJs("document.querySelector('[data-fbw=\"partido\"]').getAttribute('aria-checked')==='true'") && /pausa/.test(S.fb.screen) && /partido rápido|carrera|entreno/.test(S.fb.mode), S);
    await click(pg, '#fbSend'); await sleep(150);
    S = await st(pg);
    check('texto vacío: aviso y no se envía', /al menos 5/.test(S.msg) && (await pg.evalJs('window.__fbCalls.length')) === 0, S.msg);
    await click(pg, '[data-fbw="partido"]'); await click(pg, '[data-fbw="online"]'); await sleep(50);
    check('«¿Dónde pasó?»: se puede cambiar (Online)', await pg.evalJs("document.querySelector('[data-fbw=\"online\"]').getAttribute('aria-checked')==='true'&&document.querySelector('[data-fbw=\"partido\"]').getAttribute('aria-checked')==='false'"));
    await pg.evalJs("(function(){var t=document.getElementById('fbText');t.value='El balón atraviesa la red';t.dispatchEvent(new Event('input'));})()");
    await click(pg, '#fbSend'); await sleep(450);
    S = await st(pg);
    let c = JSON.parse(await pg.evalJs('JSON.stringify(window.__fbCalls)'));
    const wb = c[0] && c[0].b.writes[0].update.fields, cxb = wb && JSON.parse(wb.ctx.stringValue);
    check('403 (reglas sin desplegar) → «Guardado. Se manda solo cuando haya conexión» y 1 en la cola', S.done === 'Guardado. Se manda solo cuando haya conexión' && S.q === 1, S);
    check('bug: where online y el error de JS en el contexto', wb && wb.where.stringValue === 'online' && cxb.errs.some(e => /fallo de prueba feedbacktest/.test(e.m)), cxb && cxb.errs);
    await click(pg, '#fbDone'); await sleep(300);
    S = await st(pg);
    check('«Hecho» vuelve a la pausa con el foco en «Bug»', !S.panel && S.state === 'paused' && S.act === 'btnPBug', S);
    // límite de 30 s
    await click(pg, '#btnPSug'); await sleep(300);
    await pg.evalJs("(function(){var t=document.getElementById('fbText');t.value='Otra idea seguida';t.dispatchEvent(new Event('input'));})()");
    await click(pg, '#fbSend'); await sleep(200);
    S = await st(pg);
    check('otra antes de 30 s → «Espera … s» y no sale nada', /^Espera \d+ s/.test(S.msg) && (await pg.evalJs('window.__fbCalls.length')) === 1, S.msg);
    // sin red
    await pg.evalJs("localStorage.setItem('fbtest.mode','net');var l=JSON.parse(localStorage.getItem('make-the-cut.feedbackl'));l.last=0;localStorage.setItem('make-the-cut.feedbackl',JSON.stringify(l));");
    await click(pg, '#fbSend'); await sleep(400);
    S = await st(pg);
    check('sin red → guardado y 2 en la cola', S.done === 'Guardado. Se manda solo cuando haya conexión' && S.q === 2, S);
    await pg.evalJs("localStorage.setItem('fbtest.mode','ok')");
    const fr = JSON.parse(await pg.evalJs('VB.Feedback.flush().then(function(r){return JSON.stringify(r)})', true));
    check('con red otra vez, flush() las manda y la cola queda vacía', fr.sent === 2 && fr.left === 0 && (await pg.evalJs("localStorage.getItem('make-the-cut.feedbackq')")) === null, fr);
    await click(pg, '#fbDone'); await sleep(250);
    // Esc dentro del cuadro
    await click(pg, '#btnPBug'); await sleep(300);
    await pg.evalJs("document.getElementById('fbText').focus()"); await type(pg, 'abc');
    await key(pg, 'Escape', 'Escape'); await sleep(250);
    S = await st(pg);
    check('Esc en el cuadro cierra el panel y la pausa sigue', !S.panel && S.state === 'paused', S);
    await click(pg, '#btnPBug'); await sleep(300);
    check('el borrador del bug se conserva al volver', (await pg.evalJs("document.getElementById('fbText').value")) === 'abc');
    const errs = pg.errors.filter(e => !intentional.some(t => e.indexOf(t) >= 0));
    check('sin errores de JS (salvo el provocado)', !errs.length, errs.slice(0, 3));
    pg.close(); pg = null;

    // (c) la cola se manda sola al arrancar
    console.log('\n3c) Reintento al arrancar');
    const Q = JSON.stringify([{ id: 'ColaArranque000000001', d: { kind: 'sug', text: 'Pendiente de antes', ver: '1.22.0', ctx: '{}' }, at: 1 }]);
    pg = await CDP.open({ size: '1280x720', init: [FETCH_INIT, `try{if(!sessionStorage.getItem('fbt')){sessionStorage.setItem('fbt','1');localStorage.clear();localStorage.setItem('make-the-cut.feedbackq',${JSON.stringify(Q)});}}catch(e){}`] });
    await pg.navigate('debug=menu&nonews=1'); await ready(pg);
    const sent = await waitFor(pg, "window.__fbCalls.length>=1&&localStorage.getItem('make-the-cut.feedbackq')===null", 12000);
    const c3 = JSON.parse(await pg.evalJs('JSON.stringify(window.__fbCalls)'));
    check('lo de la cola sale solo a los pocos segundos de arrancar y la cola se vacía', sent && /ColaArranque000000001$/.test(c3[0].b.writes[0].update.name), c3.length);
    pg.close(); pg = null;

    // (d) móvil apaisado
    console.log('\n3d) Móvil 844×390 táctil');
    pg = await CDP.open({ size: '844x390', touch: true, ua: CDP.ANDROID_UA, init: [FETCH_INIT, "try{if(!sessionStorage.getItem('fbt')){sessionStorage.setItem('fbt','1');localStorage.clear();}}catch(e){}"] });
    await pg.navigate('debug=pause&nonews=1&uianim=0'); await ready(pg);
    await waitFor(pg, "VB.ctx.state==='paused'", 8000);
    for (let i = 0; i < 4 && await pg.evalJs('VB.UI.isPanelOpen()'); i++) { await click(pg, '#btnPanelBack'); await sleep(80); }
    await sleep(400);
    const inView = sel => pg.evalJs(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'no';var r=e.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5&&r.width>=44&&r.height>=44?'ok':JSON.stringify([r.left,r.top,r.right,r.bottom]);})()`);
    check('html.ph en el móvil', await pg.evalJs("document.documentElement.classList.contains('ph')"));
    // (movil-aire §5.7: en el móvil, Sugerencia y Bug son UN botón, «Escríbeme», que abre el panel con las dos pestañas; Bug no se ve)
    const a1 = await inView('#btnPSug'), a2 = await pg.evalJs("getComputedStyle(document.getElementById('btnPBug')).display"), a3 = await pg.evalJs("document.querySelector('#btnPSug .sp-t').textContent");
    check('pausa (móvil): «Escríbeme» dentro de la pantalla y de ≥ 44 px; «Bug» oculto', a1 === 'ok' && a2 === 'none' && a3 === 'Escríbeme', [a1, a2, a3]);
    await click(pg, '#btnPSug'); await sleep(450);
    // (movil-aire §5.1/§5.7: en el móvil sin «Cancelar»; la ‹ de la franja sale)
    const b1 = await inView('#fbSend'), b3 = await inView('#btnPanelBack'), b4 = await inView('#fbText');
    check('panel en el móvil: Enviar, Volver y el cuadro dentro', b1 === 'ok' && b3 === 'ok' && b4 === 'ok', [b1, b3, b4]);
    const fz = await pg.evalJs("parseFloat(getComputedStyle(document.getElementById('fbText')).fontSize)");
    check('letra del cuadro ≥ 16 px en el móvil (iPhone no amplía la página al escribir): ' + fz, fz >= 16);
    await click(pg, '#fbCancel'); await sleep(300);
    S = await st(pg);
    check('Cancelar vuelve a la pausa', !S.panel && S.state === 'paused', S);
    check('sin errores de JS', !pg.errors.length, pg.errors.slice(0, 3));
    pg.close(); pg = null;

    // (f) mando: A en «Bug» de la pausa abre el panel, ↓ recorre tipo → cuadro → … y B vuelve a la pausa
    console.log('\n3f) Mando en la pausa');
    const PAD = fs.readFileSync(path.join(__dirname, 'padplay.js'), 'utf8').match(/const PAD = `([\s\S]*?)`;/)[1].replace('__PADID__', JSON.stringify('Mando virtual de pruebas (STANDARD GAMEPAD)'));
    pg = await CDP.open({ size: '1280x720', init: [FETCH_INIT, PAD] });
    await pg.navigate('debug=pause&nonews=1'); await ready(pg);
    await waitFor(pg, "VB.ctx.state==='paused'", 8000);
    for (let i = 0; i < 4 && await pg.evalJs('VB.UI.isPanelOpen()'); i++) { await click(pg, '#btnPanelBack'); await sleep(80); }
    const frame = () => pg.evalJs('VB.ctx.frame|0');
    const frames = async (n, ms) => { const f0 = await frame(), t = Date.now(); while (Date.now() - t < ms) { if ((await frame()) >= f0 + n) return true; await sleep(30); } return false; };
    await frames(30, 8000);
    await pg.evalJs('__pad.connect()'); await sleep(300);
    const press = async b => { await pg.evalJs(`__pad.set(null,{${b}:1})`); await frames(4, 3000); await pg.evalJs(`__pad.set(null,{${b}:0})`); await frames(4, 3000); };
    await pg.evalJs("document.getElementById('btnPBug').focus()");
    await press(0); await sleep(250);
    S = await st(pg);
    check('A en «Bug» abre el panel de bug', S.panel === 'fb' && S.kind === 'bug', S);
    const seen = [];
    for (let i = 0; i < 4; i++) { await press(13); seen.push((await st(pg)).act); }
    check('↓ con el mando pasa por el cuadro de texto', seen.indexOf('fbText') >= 0, seen);
    await press(1); await sleep(250);
    S = await st(pg);
    check('B vuelve a la pausa', !S.panel && S.state === 'paused', S);
    check('sin errores de JS', !pg.errors.length, pg.errors.slice(0, 3));
    pg.close(); pg = null;

    // (g) visor: un ctx raro (lo puede escribir cualquiera) no rompe la página ni se cuela en el HTML
    console.log('\n3g) Visor con mensajes raros');
    const VDOC = (id, ctx, text) => ({ document: { name: 'projects/p/databases/(default)/documents/feedback/' + id, fields: { kind: { stringValue: 'bug' }, text: { stringValue: text },
      ver: { stringValue: '1.22.1' }, ctx: { stringValue: ctx }, uid: { stringValue: '' }, state: { stringValue: 'nuevo' }, t: { timestampValue: new Date().toISOString() } } } });
    const VLIST = [VDOC('Raro0001', '{"errs":{"length":"<img src=x onerror=window.__xss=1>"}}', 'uno'), VDOC('Raro0002', '{"errs":[null,7,"x"]}', 'dos'),
      VDOC('Raro0003', '[1,2]', 'tres'), VDOC('Raro0004', 'no es json', 'cuatro'), VDOC('Bien0005', JSON.stringify({ env: { br: 'Chrome 130', os: 'Android 14' }, errs: [{ k: 'error', m: 'x', t: 3 }] }), '<b>cinco</b>')];
    const VINIT = `(function(){try{localStorage.setItem('make-the-cut.account',JSON.stringify({rt:'r',it:'i',ie:Date.now()+36e5}));}catch(e){}
      var of=window.fetch;window.fetch=function(u,o){var s=String(u&&u.url||u);if(s.indexOf('firestore.googleapis.com')<0)return of.apply(this,arguments);
        return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(VLIST))},{status:200,headers:{'Content-Type':'application/json'}}));};})();`;
    pg = await CDP.open({ size: '1280x720', init: [VINIT] });
    await pg.send('Page.navigate', { url: require('url').pathToFileURL(path.join(ROOT, 'pages', 'feedback.html')).href });
    const vok = await waitFor(pg, "document.querySelectorAll('#list .it').length>=5", 8000);
    check('visor: salen los 5 mensajes (también los de ctx raro) y «Descargar» se activa', vok && (await pg.evalJs("!document.getElementById('dl').disabled")), await pg.evalJs("document.querySelectorAll('#list .it').length"));
    check('visor: nada del ctx ni del texto se cuela como HTML', !(await pg.evalJs('!!window.__xss||!!document.querySelector("#list img")||!!document.querySelector("#list .txt b")')));
    check('visor: el bueno enseña su error; los raros, 0 errores', /1 error/.test(await pg.evalJs("document.querySelectorAll('#list .it')[4].textContent")) && !(await pg.evalJs("[0,1,2,3].some(function(i){return /error/.test(document.querySelectorAll('#list .it')[i].querySelector('.ctx').textContent)})")));
    await pg.evalJs("document.getElementById('fk').value='bug';document.getElementById('fk').onchange()");
    check('visor: al filtrar sigue entero', (await pg.evalJs("document.querySelectorAll('#list .it').length")) === 5);
    check('visor: sin errores de JS', !pg.errors.length, pg.errors.slice(0, 3));
    pg.close(); pg = null;

    // (e) la fila del visor: solo con la cuenta de Ferran
    console.log('\n3e) Visor');
    pg = await CDP.open({ size: '1280x720', init: [FETCH_INIT] });
    await pg.navigate('debug=menu&nonews=1&panel=set&tab=info'); await ready(pg); await sleep(800);
    S = await st(pg);
    check('sin cuenta: la fila «Buzón de opiniones» no sale', S.fb.viewer === false && S.fb.admin === false, S.fb);
    pg.close(); pg = null;
  } finally { if (pg) pg.close(); }
}

(async () => {
  const t0 = Date.now();
  try { await nodeTests(); } catch (e) { check('pruebas sin navegador sin excepciones', false, String(e && e.stack || e)); }
  try { await emuTests(); } catch (e) { check('pruebas del emulador sin excepciones', false, String(e && e.stack || e)); }
  if (process.env.NOCDP !== '1') { try { await browser(); } catch (e) { check('navegador sin excepciones', false, String(e && e.stack || e)); } }
  console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(fails ? 1 : 0);
})();
