#!/usr/bin/env node
/* TAKE THE COURT — tools/migtest.js (owner: ui_main)
 * Pruebas del traspaso de partidas de Make the Cut a takethecourt.com (js/migrate.js + bridge/; diseño en notes/dominio.md).
 *  --node (sin navegador; lo corre .github/workflows/pages.yml antes del build): migrate.js en vm.
 *     ida y vuelta de los formatos z (deflate de zlib, como CompressionStream) y j; sha que no cuadra; sha '0'; base64 roto; deflate
 *     cortado; bomba de deflate; claves fuera del patrón ('evil', '__proto__'); valor de 5 MB; 201 claves; forma del JSON; archivo .json
 *     del puente; claves que se descartan; parseHash; y la tabla de fusión de plan() (nueva, igual, del dispositivo, con fusión, más
 *     reciente, empate, Carreras a .prev, sesión con y sin confianza, horas por máximo y sin futuro).
 *  completo (además, con Chrome: tools/cdp.js y dos servidores http locales): el puente en 127.0.0.1:A (/make-the-cut/ y su 404.html)
 *     y el juego construido (tools/build-pages.js) en localhost:B, en / y en /make-the-cut/.
 *     1) arranque en / y en /make-the-cut/ sin ningún 404 ni error;
 *     2) puente → juego: claves traídas, la ajena (farolillo.x) no, voley3d.* como make-the-cut.*, hash limpio con el resto (#foo=1)
 *        y ?sala= conservados, aviso «Partida traída de Make the Cut», la que había se copia en migbak y el look se une (mergeKey),
 *        la más reciente de aquí se queda (migbak.in), sesión traída (confianza) y meta por máximo;
 *     3) segunda vez: no cambia nada (mig.done);
 *     4) 404.html: ruta profunda (netlogs.html) y búsqueda conservadas; sin partida: salta sin #mig;
 *     5) paquete de ~1,5 M: no salta, «Descargar mi partida» visible y pulsable; el código entra por #migcode con confirmación;
 *     6) paquetes malos y hostiles (base64 roto, sha mal, clave 'evil', valor de 5 MB, __proto__, bomba) no tocan nada;
 *     7) enlace sin confianza: hoja «¿Traer la partida de Make the Cut?» y, al aceptar, se trae todo MENOS la sesión de la cuenta;
 *     8) sin CompressionStream (borrado con un script de inicio): formato j y funciona igual.
 *  --shots <carpeta>: además guarda capturas (puente a 568x320, 640x360, 360x640 y 1280x720 con partida, sin partida y grande; la hoja
 *     de confirmación a 568x320; el aviso en la portada).
 * Uso: node tools/migtest.js [--node] [--shots carpeta]   (acaba en «TODO OK» o sale con 1).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib'), crypto = require('crypto'), os = require('os'), http = require('http');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const NODE_ONLY = args.includes('--node');
const SHOTS = args.includes('--shots') ? path.resolve(args[args.indexOf('--shots') + 1] || path.join(os.tmpdir(), 'migshots')) : '';
let fails = 0, oks = 0;
function ok(name, cond, extra) { if (cond) { oks++; console.log('  ok   ' + name + (extra ? '  (' + extra + ')' : '')); } else { fails++; console.log('  FALLO ' + name + (extra ? '  (' + extra + ')' : '')); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = o => JSON.stringify(o);

// ---------------------------------------------------------------- codificador (el mismo formato que bridge/index.html)
function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function sha16(text) { return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').slice(0, 16); }
function encode(keys, o) {
  o = o || {};
  const json = o.json != null ? o.json : J({ v: 1, from: 'make-the-cut', keys });   // (como el puente desde 1.20.0: sin hora)
  const raw = Buffer.from(json, 'utf8'), fmt = o.fmt || 'z';
  const data = fmt === 'z' ? zlib.deflateSync(raw) : raw;
  return '1.' + fmt + '.' + (o.sha != null ? o.sha : sha16(json)) + '.' + b64u(data);
}

// ---------------------------------------------------------------- parte node
async function nodePart() {
  console.log('— node (vm) —');
  const win = {};
  const ctx = vm.createContext({ window: win, console, TextEncoder, TextDecoder, DecompressionStream, atob, btoa, URL, crypto: globalThis.crypto, Uint8Array, Promise, setTimeout });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/migrate.js'), 'utf8'), ctx, { filename: 'migrate.js' });
  const M = win.VB && win.VB.Migrate;
  ok('VB.Migrate expuesto (version 1)', !!M && M.version === 1 && typeof M.decode === 'function' && typeof M.plan === 'function');
  const keys = { 'make-the-cut.settings': J({ kit: 3 }), 'make-the-cut.career': J({ name: 'Ñandú «ü» 🏐', week: 7 }), 'make-the-cut.look': '{"v":1}' };
  const rej = async (p, o) => { try { await M.decode(p, o); return 'aceptado'; } catch (e) { return e.code || String(e); } };
  let d = await M.decode(encode(keys, { fmt: 'z' }));
  ok('ida y vuelta formato z (deflate zlib)', d.fmt === 'z' && d.verified && J(d.keys) === J(keys) && d.count === 3);
  d = await M.decode('mig=' + encode(keys, { fmt: 'j' }));
  ok('ida y vuelta formato j (con «mig=» delante)', d.fmt === 'j' && d.verified && d.keys['make-the-cut.career'] === keys['make-the-cut.career']);
  d = await M.decode(encode(keys, { sha: '0' }));
  ok('sha «0»: se acepta sin verificar (pedirá confirmación), con huella propia', !d.verified && /^h[0-9a-f]{8}/.test(d.id));
  ok('sha que no cuadra → rechazado', (await rej(encode(keys, { sha: '0123456789abcdef' }))) === 'sha');
  ok('base64 con caracteres raros → rechazado', (await rej('1.z.0123456789abcdef.@@@@')) === 'format');
  ok('base64 de longitud imposible → rechazado', (await rej('1.j.0123456789abcdef.AAAAA')) === 'base64');
  const good = encode(keys, { fmt: 'z' });
  ok('deflate cortado → rechazado', ['inflate', 'sha', 'json', 'utf8'].includes(await rej(good.slice(0, good.length - 12))));
  ok('versión de paquete desconocida → rechazado', (await rej(good.replace(/^1\./, '2.'))) === 'format');
  const bomb = J({ v: 1, from: 'make-the-cut', at: 1, keys: { 'make-the-cut.x': 'a'.repeat(20e6) } });
  ok('bomba de deflate (20 MB que comprimen a nada) → rechazada por tamaño', (await rej(encode(null, { json: bomb }))) === 'big');
  ok('clave «evil» → rechazado entero', (await rej(encode({ 'make-the-cut.settings': '{}', evil: '1' }))) === 'keys');
  ok('clave «__proto__» → rechazado', (await rej(encode(null, { json: '{"v":1,"from":"make-the-cut","at":1,"keys":{"__proto__":"x"}}' }))) === 'keys');
  ok('clave de otro proyecto (farolillo.x) → rechazado', (await rej(encode({ 'farolillo.x': '1' }))) === 'keys');
  ok('valor de 5 MB → rechazado', (await rej(encode({ 'make-the-cut.big': 'b'.repeat(5e6) }))) === 'keys');
  ok('valor que no es texto → rechazado', (await rej(encode(null, { json: '{"v":1,"from":"make-the-cut","at":1,"keys":{"make-the-cut.a":{"x":1}}}' }))) === 'keys');
  const many = {}; for (let i = 0; i < 201; i++) many['make-the-cut.k' + i] = '1';
  ok('201 claves → rechazado', (await rej(encode(many))) === 'keys');
  ok('forma: v 2 / otro from / keys lista → rechazado', (await rej(encode(null, { json: '{"v":2,"from":"make-the-cut","keys":{}}' }))) === 'shape' &&
    (await rej(encode(null, { json: '{"v":1,"from":"otro","keys":{}}' }))) === 'shape' && (await rej(encode(null, { json: '{"v":1,"from":"make-the-cut","keys":[]}' }))) === 'shape');
  ok('JSON roto → rechazado', (await rej(encode(null, { json: '{"v":1,' }))) === 'json');
  ok('enlace de más de 1,2 M → rechazado por tamaño', (await rej('1.j.0.' + 'A'.repeat(1300000))) === 'big');
  const file = J({ format: 'take-the-court-mig', v: 1, mig: good });
  d = await M.decode(file, { max: M.LIM.file });
  ok('archivo .json del puente aceptado', d.verified && d.count === 3);
  d = await M.decode(encode({ 'make-the-cut.squad': '[]', 'make-the-cut.mig.done': '["x"]', 'make-the-cut.migbak.squad': 'x', 'make-the-cut.account.gredir': '1', 'make-the-cut.account.rls': '1', 'make-the-cut.account.rl': '1' }));
  ok('se descartan mig.*, migbak.*, account.gredir y account.rl* (sin rechazar)', J(Object.keys(d.keys)) === J(['make-the-cut.squad']));
  let h = M.parseHash('#mig=1.z.abc.DEF&foo=1&sala=2');
  ok('parseHash: saca el paquete y deja el resto', h.kind === 'mig' && h.p === '1.z.abc.DEF' && h.rest === 'foo=1&sala=2');
  h = M.parseHash('x=1&migfile'); ok('parseHash: #migfile', h.kind === 'migfile' && h.rest === 'x=1');
  h = M.parseHash('#foo'); ok('parseHash: sin traspaso', h.kind === null && h.rest === 'foo');

  // ---- plan(): la tabla de fusión
  const now = 1.8e12, P = 'make-the-cut.';
  const calls = [];
  const mergeKey = (k, L, R, newer) => { calls.push([k, newer]); return J({ merged: [JSON.parse(L), JSON.parse(R)] }); };
  const inc = {
    [P + 'squad']: '"nuevo"', [P + 'settings']: '"igual"', [P + 'nick']: '"otro"', [P + 'look']: '{"a":2}',
    [P + 'career']: '"carrera traida"', [P + 'record']: '"rec viejo"', [P + 'career6']: '"pista traida"', [P + 'retoauto']: '"empate traido"',
    [P + 'account']: J({ uid: 'u9', rt: 'r9', user: 'ana' }), [P + 'account.meta.up']: '{"x":1}',
    [P + 'account.meta']: J({ [P + 'career']: now - 10, [P + 'record']: now - 500, [P + 'career6']: now - 50, [P + 'look']: now - 1, [P + 'retoauto']: now - 70, [P + 'squad']: now + 9e9 })
  };
  const loc = {
    [P + 'settings']: '"igual"', [P + 'nick']: '"mio"', [P + 'look']: '{"a":1}', [P + 'career']: '"carrera local"', [P + 'record']: '"rec nuevo"',
    [P + 'career6']: '"pista local"', [P + 'retoauto']: '"empate local"',
    [P + 'account.meta']: J({ [P + 'career']: now - 100, [P + 'record']: now - 20, [P + 'career6']: now - 5, [P + 'look']: now - 9, [P + 'retoauto']: now - 70 })
  };
  // (sin first: este origen ya hizo otro traspaso antes; las copias van a migbak.<id>. con id 'x' si no se da)
  let r = M.plan(inc, loc, { trusted: true, mergeKey, now });
  const w = r.writes, rp = r.report;
  ok('plan: la que no está aquí se escribe', w[P + 'squad'] === '"nuevo"' && rp.added.includes(P + 'squad'));
  ok('plan: la igual no se toca', !(P + 'settings' in w) && rp.same.includes(P + 'settings'));
  ok('plan: la del dispositivo (nick) se queda', !(P + 'nick' in w) && rp.kept.includes(P + 'nick'));
  ok('plan: look → mergeKey (traída más nueva) y copia en migbak.<id>', calls.length === 1 && calls[0][0] === P + 'look' && calls[0][1] === true &&
    JSON.parse(w[P + 'look']).merged.length === 2 && w[P + 'migbak.x.look'] === '{"a":1}');
  ok('plan: Carrera traída más reciente gana; la local a migbak y a .prev', w[P + 'career'] === '"carrera traida"' && w[P + 'migbak.x.career'] === '"carrera local"' && w[P + 'career.prev'] === '"carrera local"');
  ok('plan: récord (mismo progreso) local más reciente se queda; el traído a migbak.in', !(P + 'record' in w) && w[P + 'migbak.x.in.record'] === '"rec viejo"');
  ok('plan: Carrera de pista local más reciente se queda; la traída a .prev y migbak.in', !(P + 'career6' in w) && w[P + 'career6.prev'] === '"pista traida"' && w[P + 'migbak.x.in.career6'] === '"pista traida"');
  ok('plan: las dos Carreras distintas se preguntan (report.ask)', J(rp.ask.slice().sort()) === J([P + 'career', P + 'career6']));
  ok('plan: empate de horas → la de aquí', !(P + 'retoauto' in w) && rp.kept.includes(P + 'retoauto'));
  ok('plan: fuera del primer traspaso la sesión NO se vuelve a meter (again)', !(P + 'account' in w) && rp.session === 'again');
  const mt = JSON.parse(w[P + 'account.meta']);
  ok('plan: meta por máximo y sin horas del futuro', mt[P + 'career'] === now - 10 && mt[P + 'record'] === now - 20 && mt[P + 'career6'] === now - 5 && mt[P + 'squad'] === now);
  r = M.plan(inc, loc, { trusted: true, mergeKey, now, first: true, id: 'abcdef0123456789' });
  ok('plan (primer traspaso): sesión traída (confianza, aquí no había) + meta.up', r.writes[P + 'account'] === inc[P + 'account'] && r.writes[P + 'account.meta.up'] === '{"x":1}' && r.report.session === 'imported');
  ok('plan (primer traspaso): copias en migbak.<8 cifras del id>', r.writes[P + 'migbak.abcdef01.record'] === '"rec nuevo"' && !(P + 'migbak.x.record' in r.writes));
  ok('plan (primer traspaso): sin progreso que comparar, manda lo traído aunque lo de aquí sea más nuevo', r.writes[P + 'record'] === '"rec viejo"' && r.writes[P + 'career6'] === '"pista traida"');
  r = M.plan(inc, Object.assign({}, loc, { [P + 'account.out']: '1' }), { trusted: true, mergeKey, now, first: true });
  ok('plan: con «account.out» (cerró sesión aquí) la sesión no se trae', !(P + 'account' in r.writes) && r.report.session === 'signedout');
  r = M.plan(inc, loc, { trusted: true, mergeKey, now, choose: { [P + 'career']: 'loc', [P + 'career6']: 'in' } });
  ok('plan: la elección del jugador manda en las Carreras (choose)', !(P + 'career' in r.writes) && r.writes[P + 'career6'] === '"pista traida"' && r.writes[P + 'career.prev'] === '"carrera traida"');
  r = M.plan(inc, loc, { trusted: false, mergeKey, now, first: true });
  ok('plan sin confianza: NUNCA la sesión ni meta.up', !(P + 'account' in r.writes) && !(P + 'account.meta.up' in r.writes) && r.report.session === 'untrusted');
  r = M.plan(inc, Object.assign({}, loc, { [P + 'account']: J({ uid: 'yo', rt: 'r', user: 'yo' }) }), { trusted: true, mergeKey, now, first: true });
  ok('plan: con sesión aquí, se queda la de aquí', !(P + 'account' in r.writes) && r.report.session === 'kept');
  r = M.plan({ [P + 'account']: '{"uid":1}' }, {}, { trusted: true, now, first: true });
  ok('plan: sesión inválida no se trae', !(P + 'account' in r.writes) && r.report.session === 'invalid');
  r = M.plan({ [P + 'gym']: '{"b":2}' }, { [P + 'gym']: '{"b":1}' }, { trusted: true, now, mergeKey: () => { throw new Error('x'); } });
  ok('plan: si la fusión falla, gana la más reciente (empate: la de aquí)', !(P + 'gym' in r.writes));
  r = M.plan({ [P + 'look']: '{"a":2}' }, { [P + 'look']: '{"a":1}' }, { trusted: true, now, mergeKey: (k, L) => L });
  ok('plan: fusión que deja lo de aquí igual → sin copia ni escritura', Object.keys(r.writes).length === 0);

  // MIG-1: se jugó un rato en takethecourt.com antes de pasar por el puente (escuadrón de nivel 1, 1 partido, ajustes por defecto,
  // todo con la hora de «ahora»); lo de Make the Cut tiene 3 días
  const sq = (lvl, xp, m) => J({ a: [{ lvl, xp, matches: m }, { lvl, xp, matches: m }] });
  const oldT = now - 3 * 864e5, newT = now - 6e5;
  const incA = { [P + 'squad']: sq(14, 300, 220), [P + 'record']: J({ played: 220 }), [P + 'settings']: J({ kit: 4, cam: 2 }), [P + 'career.mode']: '"hall"',
    [P + 'account.meta']: J({ [P + 'squad']: oldT, [P + 'record']: oldT, [P + 'settings']: oldT, [P + 'career.mode']: oldT }) };
  const locA = { [P + 'squad']: sq(1, 20, 1), [P + 'record']: J({ played: 1 }), [P + 'settings']: J({ kit: 0 }), [P + 'career.mode']: '"beach"',
    [P + 'account.meta']: J({ [P + 'squad']: newT, [P + 'record']: newT, [P + 'settings']: newT, [P + 'career.mode']: newT }) };
  r = M.plan(incA, locA, { trusted: true, now, first: true, id: 'ffff0000' });
  ok('MIG-1: primer traspaso tras jugar un rato aquí → escuadrón, récord, ajustes y modo de Make the Cut',
    r.writes[P + 'squad'] === incA[P + 'squad'] && r.writes[P + 'record'] === incA[P + 'record'] && r.writes[P + 'settings'] === incA[P + 'settings'] &&
    r.writes[P + 'career.mode'] === '"hall"' && r.writes[P + 'migbak.ffff0000.squad'] === locA[P + 'squad'], J(r.report));
  r = M.plan(incA, locA, { trusted: true, now });
  ok('MIG-1: fuera del primer traspaso, escuadrón y récord por progreso (no por hora); ajustes por hora',
    r.writes[P + 'squad'] === incA[P + 'squad'] && r.writes[P + 'record'] === incA[P + 'record'] && !(P + 'settings' in r.writes));
  r = M.plan({ [P + 'squad']: sq(1, 20, 1) }, { [P + 'squad']: sq(9, 0, 50) }, { trusted: true, now, first: true });
  ok('MIG-1: si aquí hay MÁS progreso, el escuadrón de aquí se queda (también en el primer traspaso)', !(P + 'squad' in r.writes));

  // MIG-3: la Carrera se abandonó aquí (hora de aquí más nueva, clave borrada) y se vuelve a pasar por el puente
  const incC = { [P + 'career']: '"carrera vieja"', [P + 'account']: J({ uid: 'u9', rt: 'r9', user: 'ana' }), [P + 'account.meta']: J({ [P + 'career']: oldT }) };
  const locC = { [P + 'account.meta']: J({ [P + 'career']: newT }) };
  r = M.plan(incC, locC, { trusted: true, now });
  ok('MIG-3: una Carrera borrada aquí después no resucita; la sesión no vuelve', !(P + 'career' in r.writes) && r.report.skipped.includes(P + 'career') && !(P + 'account' in r.writes) && r.report.session === 'again');
  r = M.plan(incC, Object.assign({}, locC, { [P + 'account.out']: '1' }), { trusted: true, now, first: true });
  ok('MIG-3: en el primer traspaso sí se trae (no hubo traspaso que borrar), pero no la sesión tras cerrar sesión', r.writes[P + 'career'] === '"carrera vieja"' && r.report.session === 'signedout');

  // MIG-4: ya había una '.prev' (de account.js) distinta → antes a migbak; migbak de otro traspaso no se pisa
  r = M.plan({ [P + 'career']: '"traida"', [P + 'account.meta']: J({ [P + 'career']: newT }) },
    { [P + 'career']: '"local"', [P + 'career.prev']: '"solo en prev"', [P + 'migbak.aaaa1111.career']: '"copia de antes"', [P + 'account.meta']: J({ [P + 'career']: oldT }) },
    { trusted: true, now, id: 'bbbb2222cccc' });
  ok('MIG-4: la .prev que había se copia a migbak.<id>.career.prev antes de pisarla', r.writes[P + 'career.prev'] === '"local"' && r.writes[P + 'migbak.bbbb2222.career.prev'] === '"solo en prev"');
  ok('MIG-4: las copias de otro traspaso (migbak.aaaa1111.*) no se tocan', !Object.keys(r.writes).some(k => k.indexOf(P + 'migbak.aaaa1111.') === 0) && r.writes[P + 'migbak.bbbb2222.career'] === '"local"');

  // MIG-5: archivo/código admiten valores y claves más grandes; el enlace no
  const bigVal = 'x'.repeat(2100000);
  ok('MIG-5: valor de 2,1 M por enlace → rechazado (keys)', (await rej(encode({ [P + 'big']: bigVal }))) === 'keys');
  d = await M.decode(encode({ [P + 'big']: bigVal }), { max: M.LIM.file, file: true });
  ok('MIG-5: el mismo valor por archivo/código → aceptado', d.keys[P + 'big'] === bigVal);
  const k250 = {}; for (let i = 0; i < 250; i++) k250[P + 'k' + i] = '1';
  ok('MIG-5: 250 claves por enlace → rechazado; por archivo → aceptado', (await rej(encode(k250))) === 'keys' && (await M.decode(encode(k250), { max: M.LIM.file, file: true })).count === 250);
}

// ---------------------------------------------------------------- parte navegador
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '': 'text/plain' };
/** Servidor estático: sirve dir en / y en /make-the-cut/; lo que no existe → 404.html (si hay) con estado 404. */
function serve(dir, host) {
  const misses = [];
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (u.indexOf('/make-the-cut/') === 0) u = u.slice('/make-the-cut'.length); else if (u === '/make-the-cut') u = '/';
    if (u.endsWith('/')) u += 'index.html';
    const f = path.join(dir, path.normalize(u).replace(/^([\\/]\.\.)+/, ''));
    if (f.startsWith(dir) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return fs.createReadStream(f).pipe(res);
    }
    if (!/favicon\.ico$/.test(u)) misses.push(req.url);
    const nf = path.join(dir, '404.html');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'no');
  });
  return new Promise(r => srv.listen(0, host, () => r({ srv, port: srv.address().port, misses })));
}

async function browserPart() {
  const CDP = require('./cdp.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migtest-'));
  const site = path.join(tmp, 'site');
  require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'tools/build-pages.js'), site], { stdio: 'pipe' });
  const bridgeDir = path.join(ROOT, 'bridge');
  ok('bridge/404.html es copia exacta de bridge/index.html', fs.readFileSync(path.join(bridgeDir, '404.html'), 'utf8') === fs.readFileSync(path.join(bridgeDir, 'index.html'), 'utf8'));
  let vj = null; try { vj = JSON.parse(fs.readFileSync(path.join(bridgeDir, 'version.json'), 'utf8')); } catch (e) { }
  ok('bridge/version.json con v semver', !!vj && /^\d+\.\d+\.\d+$/.test(vj.v), vj && vj.v);
  { const VBV = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'version.js'), 'utf8'), { VB: VBV, window: { VB: VBV } });
    ok('bridge/version.json = VB.VERSION (si no, las pestañas viejas no ven «Hay una versión nueva»)', !!vj && vj.v === VBV.VERSION, (vj && vj.v) + ' / ' + VBV.VERSION); }
  ok('bridge sin sw.js (el juego nunca registró uno)', !fs.existsSync(path.join(bridgeDir, 'sw.js')));
  const B = await serve(bridgeDir, '127.0.0.1'), G = await serve(site, 'localhost');
  const BR = 'http://127.0.0.1:' + B.port + '/make-the-cut/', GAME = 'http://localhost:' + G.port + '/';
  console.log('— navegador — puente ' + BR + ' · juego ' + GAME);
  let c = null;
  const cleanup = () => { try { c && c.close(); } catch (e) { } B.srv.close(); G.srv.close(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { } };
  try {
    c = await CDP.open({ size: '1280x720' });
    // sin la red de Firebase: la sesión de mentira no se pierde por un refresh token inválido (y nada sale de la máquina)
    const noFb = async () => { await c.send('Network.enable'); await c.send('Network.setBlockedURLs', { urls: ['*identitytoolkit.googleapis.com*', '*securetoken.googleapis.com*', '*firestore.googleapis.com*', '*gstatic.com/firebasejs*'] }); };
    await noFb();
    const nav = async (url, wait) => {
      const loaded = new Promise(r => { const off = p => { r(); }; c.on('Page.loadEventFired', off); });
      await c.send('Page.navigate', { url });
      await Promise.race([loaded, sleep(wait || 20000)]);
    };
    const ev = (e, aw) => c.evalJs(e, aw);
    const until = async (expr, ms) => { const t = Date.now() + (ms || 25000); while (Date.now() < t) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(250); } return false; };
    const LSdump = () => ev('JSON.stringify(Object.keys(localStorage).sort().reduce((o,k)=>(o[k]=localStorage.getItem(k),o),{}))').then(JSON.parse);
    const onGame = async () => { await nav(GAME + 'version.json'); };
    const onBridgeOrigin = async () => { await nav('http://127.0.0.1:' + B.port + '/make-the-cut/version.json'); };
    const gameReady = () => until('document.readyState==="complete" && window.VB && VB.Migrate && !VB.Migrate.pending() && !!VB.ctx && !sessionStorage.getItem("make-the-cut.mig.raw")', 40000);
    const shot = async (name) => { if (!SHOTS) return; await c.shot(path.join(SHOTS, name + '.png')); };

    // 1) arranque en / y en /make-the-cut/
    for (const base of [GAME, GAME + 'make-the-cut/']) {
      G.misses.length = 0; const e0 = c.errors.length;
      await nav(base);
      const up = await gameReady();
      await sleep(1500);
      ok('el juego arranca en ' + base.replace(GAME, '/'), up && G.misses.length === 0 && c.errors.length === e0, (G.misses.join(' ') || '') + ' ' + c.errors.slice(e0).join(' | '));
    }
    // ids de objetos del Vestuario que se pueden ganar (para la prueba de mergeKey con el look)
    const lockIds = await ev(`(function(){var L=VB.Look,out=[];(L.CATALOG||[]).map(function(x){return x&&x.id;}).filter(Boolean).some(function(id){var o={};o[id]={s:'carrera',t:5};var r=JSON.parse(L.mergeRaw(null,JSON.stringify({v:L.V,own:o})));if(r.own&&r.own[id])out.push(id);return out.length>=2;});return out;})()`);
    ok('hay dos objetos ganables para probar la fusión del look', Array.isArray(lockIds) && lockIds.length === 2, J(lockIds));
    const look = id => J({ v: 1, own: { [id]: { s: 'carrera', t: 1000 } }, seen: {} });

    // 2) puente → juego
    const T0 = Date.now();
    await onGame();
    await ev(`localStorage.clear();sessionStorage.clear();
      localStorage.setItem('make-the-cut.look', ${J(look(lockIds[0]))});
      localStorage.setItem('make-the-cut.record', '{"played":99}');
      localStorage.setItem('make-the-cut.nick', '"aqui"');
      localStorage.setItem('make-the-cut.account.meta', ${J(J({ 'make-the-cut.look': T0 - 9000, 'make-the-cut.record': T0 - 10 }))});`);
    await onBridgeOrigin();
    await ev(`localStorage.clear();
      localStorage.setItem('make-the-cut.settings', '{"kit":5}');
      localStorage.setItem('make-the-cut.squad', '[{"n":"Ana"}]');
      localStorage.setItem('make-the-cut.look', ${J(look(lockIds[1]))});
      localStorage.setItem('make-the-cut.record', '{"played":3}');
      localStorage.setItem('make-the-cut.nick', '"alli"');
      localStorage.setItem('make-the-cut.account', '{"uid":"u1","rt":"r1","user":"ana","kind":"user"}');
      localStorage.setItem('make-the-cut.account.meta', ${J(J({ 'make-the-cut.look': T0 - 100, 'make-the-cut.record': T0 - 5000, 'make-the-cut.settings': T0 - 50 }))});
      localStorage.setItem('voley3d.legends', '[]');
      localStorage.setItem('farolillo.x', 'NO');
      localStorage.setItem('empat/acta/1', 'NO');`);
    const bridgeBefore = await LSdump();
    if (SHOTS) {
      for (const sz of ['568x320', '640x360', '360x640', '1280x720']) {
        await c.setSize(sz, sz !== '1280x720'); await nav(BR + '?stay=1'); await sleep(900); await shot('puente-partida-' + sz);
        const vis = await ev(`(function(){var b=document.getElementById('go').getBoundingClientRect();var e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return b.bottom<=innerHeight&&b.right<=innerWidth&&b.left>=0&&b.height>=44&&!!e&&(e.id==='go'||!!e.closest('#go'))&&document.documentElement.scrollWidth<=innerWidth;})()`);
        ok('puente ' + sz + ': botón visible, ≥ 44 px, pulsable y sin scroll horizontal', vis);
      }
      await c.setSize('1280x720', false);
    }
    await nav(BR + '?sala=ABC123&to=' + encodeURIComponent(GAME) + '#foo=1');
    const left = await until('location.port==="' + G.port + '"', 15000);
    ok('el puente salta al juego', left);
    const up2 = await gameReady();
    await until('document.readyState==="complete" && /Partida traída de Make the Cut/.test(document.body.innerText)', 6000);
    const toast = await ev('/Partida traída de Make the Cut/.test(document.body.innerText)');
    await shot('juego-aviso-1280x720');
    const after = await LSdump();
    const href = await ev('location.search + "|" + location.hash');
    ok('juego listo tras el traspaso (una recarga)', up2);
    ok('enlace limpio: ?sala= y #foo=1 conservados, sin #mig', href === '?sala=ABC123|#foo=1', href);
    ok('aviso «Partida traída de Make the Cut»', toast);
    ok('claves traídas (settings, squad)', after['make-the-cut.settings'] === '{"kit":5}' && after['make-the-cut.squad'] === '[{"n":"Ana"}]');
    ok('voley3d.legends llega como make-the-cut.legends', after['make-the-cut.legends'] === '[]');
    ok('nada de otros proyectos (farolillo.x, empat/*)', !('farolillo.x' in after) && !('empat/acta/1' in after));
    let tag = ''; try { tag = JSON.parse(after['make-the-cut.mig.done'])[0].slice(0, 8); } catch (e) { }   // migbak.<id>.*
    let lk = null; try { lk = JSON.parse(after['make-the-cut.look']); } catch (e) { }
    ok('look unido con mergeKey (los dos objetos) y el de antes en migbak', !!lk && !!lk.own[lockIds[0]] && !!lk.own[lockIds[1]] && after['make-the-cut.migbak.' + tag + '.look'] === look(lockIds[0]));
    ok('récord de aquí con más partidos se queda; el traído en migbak.<id>.in', after['make-the-cut.record'] === '{"played":99}' && after['make-the-cut.migbak.' + tag + '.in.record'] === '{"played":3}');
    ok('nick (del dispositivo) se queda', after['make-the-cut.nick'] === '"aqui"');
    ok('sesión de la cuenta traída (puente de confianza)', /"uid":"u1"/.test(after['make-the-cut.account'] || ''));
    let mt = {}; try { mt = JSON.parse(after['make-the-cut.account.meta']); } catch (e) { }
    ok('meta por máximo (settings con su hora traída, no «ahora»)', mt['make-the-cut.settings'] === T0 - 50 && mt['make-the-cut.record'] === T0 - 10, J(mt));
    ok('mig.done con el sha', /^\["[0-9a-f]{16}"\]$/.test(after['make-the-cut.mig.done'] || ''), after['make-the-cut.mig.done']);
    await onBridgeOrigin();
    ok('el puente no borra ni cambia nada en el origen antiguo', J(await LSdump()) === J(bridgeBefore));

    // 3) segunda vez: nada
    await onGame();
    const before3 = await LSdump();
    await nav(BR + '?stay=1&to=' + encodeURIComponent(GAME)); await sleep(800);
    const deepLink = await ev('window.__bridge.url');
    await ev('document.getElementById("go").click()');   // (el botón manual: también manda el referente)
    await until('location.port==="' + G.port + '"', 15000); await gameReady(); await sleep(800);
    const rep3 = await ev('VB.Migrate._lastReport && VB.Migrate._lastReport.result');
    const after3 = await LSdump();
    const strip = o => { const x = Object.assign({}, o); delete x['make-the-cut.mig.done']; delete x['make-the-cut.account.meta']; delete x['make-the-cut.account.meta.up']; return x; };
    ok('segunda vez por el puente: «already» (mismo guardado → mismo sha), sin recarga ni cambios', rep3 === 'already' && J(strip(after3)) === J(strip(before3)), rep3 + ' ' + J(Object.keys(after3).filter(k => after3[k] !== before3[k])) + ' ' + J(Object.keys(before3).filter(k => !(k in after3))));
    // el mismo enlace otra vez (recargar, atrás): «already» por el sha, aunque llegue sin referente
    const sameLink = deepLink.slice(deepLink.indexOf('#mig=') + 5).split('&')[0];
    await nav(GAME + '?again=1#mig=' + sameLink); await gameReady(); await sleep(500);
    ok('el mismo paquete otra vez: «already» (mig.done), sin hoja', (await ev('VB.Migrate._lastReport && VB.Migrate._lastReport.result')) === 'already' && !(await ev('!!document.getElementById("migYes")')));
    // 3b) Ajustes › Info › «Traer tu partida» (MIG-2): sin #migcode en el enlace, la misma hoja, con el enlace a la dirección antigua
    await c.setSize('568x320', true);
    await nav(GAME + '?panel=set'); await gameReady(); await sleep(900);
    const rowOk = await ev('!!document.querySelector(\'[data-go="mig"]\') && /Traer tu partida/.test(document.querySelector(\'[data-go="mig"]\').textContent)');
    ok('Ajustes › Info tiene la fila «Traer tu partida»', rowOk);
    await ev('document.querySelector(\'[data-go="mig"]\').click()'); await sleep(1500);
    const man = await ev(`(function(){var y=document.getElementById('migGo'),ta=document.getElementById('migCode');if(!y||!ta)return {ok:false};var b=y.getBoundingClientRect(),e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
      var a=document.querySelector('.vb-migman a[href*="purupurpito.github.io/make-the-cut"]');
      return {ok:true,tap:!!e&&(e===y||y.contains(e)),inView:b.bottom<=innerHeight+1&&b.top>=0,link:!!a,title:/Traer tu partida/.test(document.body.innerText)};})()`);
    await shot('ajustes-traer-568x320');
    ok('«Traer tu partida» abre la hoja: código, enlace a la dirección antigua y «Traer» pulsable a 568x320', man.ok && man.tap && man.inView && man.link && man.title, J(man));
    await c.setSize('1280x720', false);

    // 4) 404.html con ruta profunda; sin partida
    await nav('http://127.0.0.1:' + B.port + '/make-the-cut/netlogs.html?x=1&stay=1&to=' + encodeURIComponent(GAME) + '#k');
    await sleep(800);
    const deep = await ev('window.__bridge && window.__bridge.url');
    ok('404.html: ruta profunda y búsqueda conservadas', typeof deep === 'string' && deep.indexOf(GAME + 'netlogs.html?x=1#mig=1.') === 0 && /&k$/.test(deep), String(deep).slice(0, 80));
    await onBridgeOrigin(); await ev('localStorage.clear()');
    if (SHOTS) {
      for (const sz of ['568x320', '640x360', '360x640', '1280x720']) { await c.setSize(sz, sz !== '1280x720'); await nav(BR + '?stay=1'); await sleep(700); await shot('puente-sinpartida-' + sz); }
      await c.setSize('1280x720', false);
    }
    await nav(BR + '?stay=1&sala=Q1&to=' + encodeURIComponent(GAME)); await sleep(500);
    const nod = await ev('window.__bridge');
    ok('sin partida: salta sin #mig (búsqueda conservada)', nod && nod.payload === '' && nod.url === GAME + '?sala=Q1', nod && nod.url);

    // 5) paquete grande
    await ev(`(function(){var a='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',u=new Uint8Array(750000),p=[];
      for(var i=0;i<u.length;i+=65536)crypto.getRandomValues(u.subarray(i,i+65536));
      for(i=0;i<u.length;i++)p.push(a.charAt(u[i]&63));var s=p.join('');
      localStorage.setItem('make-the-cut.pruebaA','"'+s+'"');localStorage.setItem('make-the-cut.pruebaB','"'+s.split('').reverse().join('')+'"');})()`);
    await nav(BR + '?to=' + encodeURIComponent(GAME)); await sleep(2500);
    const bigB = await ev(`(function(){var d=document.getElementById('dl'),b=d.getBoundingClientRect(),e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
      return {port:location.port, dl:!d.hidden&&!!e&&(e===d||d.contains(e)), file:!document.getElementById('openFile').hidden, len:window.__bridge&&window.__bridge.payload.length, fits:window.__bridge&&window.__bridge.fits, payload:window.__bridge&&window.__bridge.payload};})()`);
    ok('grande: no salta y enseña «Descargar mi partida» pulsable', bigB.port === String(B.port) && bigB.dl && bigB.file && bigB.fits === false, 'paquete ' + bigB.len + ' caracteres');
    if (SHOTS) {
      for (const sz of ['568x320', '640x360', '360x640', '1280x720']) { await c.setSize(sz, sz !== '1280x720'); await nav(BR + '?stay=1'); await sleep(2500); await shot('puente-grande-' + sz); }
      await c.setSize('1280x720', false);
    }
    await onBridgeOrigin(); await ev('localStorage.clear()');
    // ... y el código entra por #migcode (siempre con confirmación)
    await onGame(); await ev('localStorage.clear();sessionStorage.clear()');
    await c.setSize('568x320', true);
    await nav(GAME + '#migcode');
    await until('!!document.getElementById("migCode") && !!document.getElementById("migGo")', 30000);
    await sleep(500); await shot('juego-codigo-568x320');
    const goTap = await ev(`(function(){var y=document.getElementById('migGo'),b=y.getBoundingClientRect(),e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return !!e&&(e===y||y.contains(e))&&b.bottom<=innerHeight;})()`);
    ok('#migcode a 568x320: «Traer» visible y pulsable', goTap);
    await c.setSize('1280x720', false);
    await ev(`document.getElementById('migCode').value=${J(bigB.payload)};document.getElementById('migGo').click();`);
    const askBig = await until('!!document.getElementById("migYes")', 15000);
    ok('código pegado (#migcode): pide confirmación', askBig);
    await ev('document.getElementById("migYes").click()');
    await sleep(1500); await gameReady();
    const afterBig = await LSdump();
    ok('código pegado: las dos claves grandes traídas', (afterBig['make-the-cut.pruebaA'] || '').length === 750002 && (afterBig['make-the-cut.pruebaB'] || '').length === 750002);

    // 6) paquetes malos y hostiles: no tocan nada
    await onGame(); await ev('localStorage.clear();sessionStorage.clear();localStorage.setItem("make-the-cut.settings","{\\"kit\\":1}")');
    const base6 = await LSdump();
    const bad = {
      'base64 roto': '1.z.0123456789abcdef.%40%40%40',
      'sha mal': encode({ 'make-the-cut.settings': '{"kit":9}' }, { sha: 'ffffffffffffffff' }),
      'clave evil': encode({ 'make-the-cut.settings': '{"kit":9}', evil: '1' }),
      'valor de 5 MB': encode({ 'make-the-cut.settings': 'x'.repeat(5e6) }),
      'clave __proto__': encode(null, { json: '{"v":1,"from":"make-the-cut","at":1,"keys":{"__proto__":"{\\"kit\\":9}","make-the-cut.settings":"{\\"kit\\":9}"}}' }),
      'bomba': encode(null, { json: J({ v: 1, from: 'make-the-cut', at: 1, keys: { 'make-the-cut.settings': 'z'.repeat(15e6) } }) })
    };
    for (const name of Object.keys(bad)) {
      await nav(GAME + '?t=' + Date.now() + '#mig=' + bad[name]); await gameReady(); await sleep(400);
      const r6 = await ev('[VB.Migrate._lastReport && VB.Migrate._lastReport.result, !!document.getElementById("migYes"), location.hash]');
      const now6 = await LSdump();
      ok('hostil «' + name + '»: rechazado, sin hoja, nada cambia y sin #mig', r6[0] === 'rejected' && !r6[1] && r6[2] === '' && J(now6) === J(base6), J(r6.slice(0, 2)));
    }

    // 7) enlace sin confianza (sin referente): hoja de confirmación; la sesión nunca
    await onGame(); await ev('localStorage.clear();sessionStorage.clear()');
    await c.setSize('568x320', true);
    const p7 = encode({ 'make-the-cut.settings': '{"kit":7}', 'make-the-cut.squad': '[1]', 'make-the-cut.account': '{"uid":"malo","rt":"r","user":"malo"}' });
    await nav(GAME + '#mig=' + p7);
    const ask = await until('!!document.getElementById("migYes")', 30000);
    await sleep(600);
    const sheetOk = await ev(`(function(){var y=document.getElementById('migYes'),b=y.getBoundingClientRect(),e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
      return {txt:/Traer la partida de Make the Cut/.test(document.body.innerText)&&/2 datos/.test(document.body.innerText), tap:!!e&&(e===y||y.contains(e)), inView:b.bottom<=innerHeight&&b.right<=innerWidth&&b.height>=44};})()`);
    await shot('juego-confirmar-568x320');
    ok('sin confianza: hoja «¿Traer la partida…?» con «2 datos» (sin contar la sesión)', ask && sheetOk.txt, J(sheetOk));
    ok('hoja a 568x320: «Sí, traerla» visible, ≥ 44 px y pulsable', sheetOk.tap && sheetOk.inView);
    const acc0 = await ev('localStorage.getItem("make-the-cut.account")');
    await ev('document.getElementById("migYes").click()');
    await sleep(1500); await gameReady();
    const after7 = await LSdump();
    ok('sin confianza, al aceptar: se traen los datos pero NO la sesión', after7['make-the-cut.settings'] === '{"kit":7}' && !('make-the-cut.account' in after7) && acc0 === null);
    await until('/Partida traída de Make the Cut/.test(document.body.innerText)', 5000);
    await shot('juego-aviso-568x320');
    await c.setSize('1280x720', false);
    // «No» no trae nada
    await ev('localStorage.clear();sessionStorage.clear()');
    await nav(GAME + '?n=1#mig=' + encode({ 'make-the-cut.squad': '[2]' }));
    await until('!!document.getElementById("migYes")', 30000);
    await ev('[...document.querySelectorAll(".vb-mig .sp-dock button")].find(b=>/^No$/.test(b.textContent.trim())).click()');
    await sleep(800);
    ok('«No»: no se trae nada', (await ev('localStorage.getItem("make-the-cut.squad")')) === null && (await ev('VB.Migrate._lastReport.result')) === 'declined');
    try { await c.close(); } catch (e) { } c = null;

    // 8) sin CompressionStream → formato j
    c = await CDP.open({ size: '1280x720', init: ['try{delete window.CompressionStream;}catch(e){}'] });
    await noFb();
    await nav(GAME + 'version.json'); await ev('localStorage.clear()');
    await nav('http://127.0.0.1:' + B.port + '/make-the-cut/version.json');
    await ev(`localStorage.clear();localStorage.setItem('make-the-cut.squad','[{"n":"Jota"}]')`);
    await nav(BR + '?stay=1'); await sleep(600);
    const pj = await ev('window.__bridge && window.__bridge.payload');
    ok('sin CompressionStream: el puente usa el formato j', /^1\.j\.[0-9a-f]{16}\./.test(pj || ''), String(pj).slice(0, 24));
    await nav(BR + '?to=' + encodeURIComponent(GAME));
    await until('location.port==="' + G.port + '"', 15000); await gameReady(); await sleep(500);
    ok('formato j: traído', (await ev('localStorage.getItem("make-the-cut.squad")')) === '[{"n":"Jota"}]');
  } finally { cleanup(); }
}

(async () => {
  try {
    await nodePart();
    if (!NODE_ONLY) await browserPart();
  } catch (e) { fails++; console.log('  FALLO excepción: ' + (e && e.stack || e)); }
  console.log(fails ? '\n' + fails + ' FALLOS (' + oks + ' ok)' : '\nTODO OK (' + oks + ')');
  process.exit(fails ? 1 : 0);
})();
