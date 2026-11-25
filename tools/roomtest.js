#!/usr/bin/env node
/* TAKE THE COURT — tools/roomtest.js  (owner: net)
 * Fase 2 del online (notes/net.md): salas del lobby y señalización (js/netroom.js) contra las reglas de firebase/firestore.rules.
 *  1) Con Java y el emulador de Firestore (cloud-firestore-emulator-*.jar en ~/.cache/firebase/emulators; con Java 17 vale el
 *     v1.19.x: `npx firebase-tools@13.29.1 setup:emulators:firestore`): arranca el emulador con las reglas del proyecto y prueba
 *     el cliente de verdad (fichas JWT sin firmar, que el emulador acepta) con tres cuentas A, B y C.
 *  2) Siempre: lógica del cliente con un fetch simulado (403 al listar → 'off', sin sesión → 'auth', sin red → 'net', nombres).
 *  Esquema v3 (salas de varios, notes/online-multi-brief.md §4): entrar/salir de varios invitados, límites de plazas, combinaciones
 *  de mode/cap/fmt, señalización por pareja (privacidad), limpieza, y lecturas/escrituras por entrada; además, las pruebas 1v1 de
 *  siempre se pasan también con el cliente de la versión publicada (js/netroom.js de git HEAD: un 1.21.0 en caché) contra las
 *  reglas nuevas, y el cliente nuevo contra las reglas publicadas (HEAD).
 *  Ciclo de vida (sección 6): el lobby de verdad con reloj virtual cuenta las lecturas/escrituras de Firestore de cada tipo de sala
 *  (1v1, 2v2 × 4, 6v6 × 12, coop) por fase y comprueba que, con los enlaces abiertos, solo late el anfitrión.
 *  «Versión publicada» = git merge-base HEAD main (la 1.21.0 mientras dure la rama online-multi; MTC_PUB_REF=<ref> para otra).
 * Uso: node tools/roomtest.js [--no-emu] [--port 8089] [--no-life] [--life-only] [--life-ref <ref>]
 * Nunca toca el Firebase de verdad (proyecto demo-mtc del emulador).
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARGS = process.argv.slice(2), NO_EMU = ARGS.includes('--no-emu'), NO_LIFE = ARGS.includes('--no-life'), LIFE_ONLY = ARGS.includes('--life-only');
const LIFE_REF = ARGS.indexOf('--life-ref') >= 0 ? ARGS[ARGS.indexOf('--life-ref') + 1] : '';
const PORT = +(ARGS[ARGS.indexOf('--port') + 1] || 0) || 8089;
const PROJECT = 'demo-mtc';
global.window = undefined;
require(path.join(ROOT, 'js/netroom.js'));
const NR = globalThis.VB.NetRoom;

let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Commit de la versión publicada: MTC_PUB_REF, o la base común con main (en la rama online-multi, la 1.21.0: HEAD ya trae el cliente
 *  de varios y con HEAD se saltaban las pasadas de compatibilidad), o HEAD. Solo lectura (git merge-base / git show). */
function git(args) { try { const r = require('child_process').spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 24 }); return r.status === 0 ? r.stdout : null; } catch (e) { return null; } }
const PUB_REF = process.env.MTC_PUB_REF || ((git(['merge-base', 'HEAD', 'main']) || '').trim() || 'HEAD');
/** Un archivo tal como está en la versión publicada (o en ref), o null. */
function gitShow(rel, ref) { return git(['show', (ref || PUB_REF) + ':' + rel]); }
/** VB.NetRoom de un código fuente aparte (el cliente publicado), en su propio contexto. */
function loadNR(src) {
  const vm = require('vm'); const ctx = { fetch, console, setTimeout, clearTimeout, URL, TextEncoder };
  ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx, { filename: 'netroom-HEAD.js' });
  return ctx.VB && ctx.VB.NetRoom;
}
/** Para el emulador de verdad: en Windows `java` suele ser un lanzador y kill() deja vivo al java.exe hijo (se quedaba escuchando con
 *  las reglas VIEJAS y la siguiente pasada probaba contra él): taskkill /T se lleva el árbol entero. */
function killTree(p) {
  if (!p || p.killed) return;
  try { if (process.platform === 'win32') require('child_process').spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); else p.kill(); } catch (e) { }
}
async function portBusy(port) { try { await fetch('http://127.0.0.1:' + port + '/'); return true; } catch (e) { return false; } }
async function code(p) { try { await p; return 'ok'; } catch (e) { return e.code || String(e); } }

/* ---------- 2) lógica del cliente con fetch simulado ---------- */
async function mockTests() {
  console.log('\nCliente con fetch simulado');
  const mk = (status, body) => async () => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });
  const auth = async () => ({ uid: 'u1', token: 't' });
  let r = NR.create({ base: 'http://x/v1/projects/p/databases/(default)/documents', auth, fetch: mk(403, [{ error: { code: 403, message: 'Missing or insufficient permissions.', status: 'PERMISSION_DENIED' } }]) });
  check('403 al listar = reglas sin desplegar (off)', await code(r.list()) === 'off');
  check('403 al crear sala = off', await code(r.open({ name: 'Ana' })) === 'off');
  r = NR.create({ base: 'http://x/v1/projects/p/databases/(default)/documents', auth, fetch: async (url, o) => (o.method === 'POST' && /:commit$/.test(url))
    ? { ok: false, status: 403, text: async () => '{"error":{"message":"denied"}}' } : { ok: true, status: url.indexOf('/sig/') >= 0 ? 404 : 200, text: async () => '[]' } });
  check('403 al crear pero la lista funciona = denied (no «servidor apagado»)', await code(r.open({ name: 'Ana' })) === 'denied');
  r = NR.create({ base: 'http://x/v1/projects/p/databases/(default)/documents', auth: async () => { throw new Error('sin sesión'); }, fetch: mk(200, []) });
  check('sin sesión = auth', await code(r.list()) === 'auth');
  r = NR.create({ base: 'http://x/v1/projects/p/databases/(default)/documents', auth, fetch: async () => { throw new TypeError('Failed to fetch'); } });
  check('sin red = net', await code(r.list()) === 'net');
  r = NR.create({ base: 'http://x/v1/projects/p/databases/(default)/documents', auth, fetch: mk(503, { error: { message: 'x' } }) });
  check('503 = net (reintentar)', await code(r.list()) === 'net');
  // Online V2: open() solo escribe net = 'fluida' en las salas Fluida (en las Precisa la clave no va)
  {
    const sent = [];
    const rr = NR.create({ base: 'http://x/v1/projects/p/databases/(default)/documents', auth, ver: '1|x', fetch: async (url, o) => {
      if (/:commit$/.test(url)) sent.push(JSON.parse(o.body).writes[0].update.fields);
      return { ok: true, status: url.indexOf('/sig/') >= 0 ? 404 : 200, text: async () => (/:runQuery$/.test(url) ? '[]' : '{}') };
    } });
    await rr.open({ name: 'Ana', net: 'fluida' }); await rr.open({ name: 'Ana' }); await rr.open({ name: 'Ana', net: 'rara' }); await rr.open({ name: 'Ana', net: 'precisa' });
    check('open(): net = fluida solo en salas Fluida; Precisa, rara o sin net → sin la clave', sent.length === 4 && sent[0].net && sent[0].net.stringValue === 'fluida'
      && !('net' in sent[1]) && !('net' in sent[2]) && !('net' in sent[3]), sent.map(f => f.net || null));
  }
  // Online V2 (revisión): el lobby (js/netlobby.js, con DOM: aquí se mira el código) separa las salas de los clientes de antes de
  // Online V2 por room.v, el anfitrión también comprueba el model del 'pre' del invitado y el chip «Fluida» va primero (no se corta)
  {
    const lob = fs.readFileSync(path.join(ROOT, 'js/netlobby.js'), 'utf8');
    check('lobby: room.v lleva la marca del lobby de Online V2 (un cliente de antes ve la sala como «Otra versión»)',
      /function ver\(\) \{[^\n]*'\|L' \+ LOBBY/.test(lob) && /var LOBBY = ([2-9]|\d\d+);/.test(lob));
    const beg = lob.slice(lob.indexOf('function begin('), lob.indexOf("if (L.role === 'host') {", lob.indexOf('function begin(')));
    check('lobby: begin() compara pre.model con la sala en los dos papeles (no solo el invitado)',
      /\n\s*if \(\(pre\.model === 'fluida' \? 'fluida' : 'precisa'\) !== model\) \{ connFail\('mismatch'\); return; \}/.test(beg) && !/L\.role === 'guest' && \(pre\.model/.test(beg));
    const chipsSrc = lob.slice(lob.indexOf('function chips('), lob.indexOf('function chipsHTML('));
    const chipsFn = new Function('roomModel', chipsSrc + '; return chips;')(r => r && r.net === 'fluida' ? 'fluida' : 'precisa');
    const cv = chipsFn({ bo: 3, pts: 15, even: false, net: 'fluida' }), ca = chipsFn({ bo: 3, pts: 15, even: false, net: 'fluida' }, true), cp = chipsFn({ bo: 1, pts: 21, even: true });
    check('lobby: chip «Fluida» primero en la lista (el que se corta en vertical es el de atributos); aria al final; Precisa sin él',
      cv[0] === 'Fluida' && cv.length === 3 && ca[2] === 'conexión fluida' && cp.length === 2 && cp.indexOf('Fluida') < 0, [cv, ca, cp]);
  }
  // lista: filtra caducadas, la tuya y ordena por latido
  const now = Date.now(), ts = ms => new Date(ms).toISOString();
  const doc = (id, seenAgo, extra) => ({ document: { name: 'projects/p/databases/(default)/documents/rooms/' + id, fields: Object.assign({
    code: { stringValue: 'ABCDEF' }, name: { stringValue: 'N' + id }, gname: { stringValue: '' }, host: { stringValue: id }, guest: { stringValue: '' },
    fmt: { stringValue: '2v2' }, venue: { stringValue: 'beach' }, map: { stringValue: '' }, even: { booleanValue: false }, bo: { integerValue: '1' },
    pts: { integerValue: '21' }, state: { stringValue: 'open' }, v: { stringValue: '1|x' }, seen: { timestampValue: ts(now - seenAgo) } }, extra || {}) }, readTime: ts(now) });
  const calls = [];
  r = NR.create({ base: 'http://x/v1/projects/p/databases/(default)/documents', auth, ver: '1|x', fetch: async (url, o) => {
    calls.push([o.method, url]);
    if (/:runQuery$/.test(url)) return { ok: true, status: 200, text: async () => JSON.stringify([doc('a', 5000), doc('b', 1000), doc('u1', 0), doc('c', 200000), doc('d', 400000), doc('e', 2000, { v: { stringValue: '1|y' } }), doc('f', 500000, { state: { stringValue: 'play' } })]) };
    return { ok: true, status: 200, text: async () => '{}' };
  } });
  const L = await r.list();
  check('lista: vivas, sin la tuya, la más nueva primero', L.map(x => x.id).join() === 'b,e,a', L.map(x => x.id + ':' + x.age));
  check('lista: «otra versión» marcada', L.find(x => x.id === 'e').other === true && L.find(x => x.id === 'a').other === false);
  await sleep(20);
  check('lista: borra de paso la caducada (> 5 min) con su señalización', calls.some(c => c[0] === 'DELETE' && /rooms\/d$/.test(c[1])) && calls.some(c => c[0] === 'DELETE' && /rooms\/d\/sig\/offer$/.test(c[1])) && !calls.some(c => c[0] === 'DELETE' && /rooms\/c$/.test(c[1])));
  check('lista: también la caducada que se quedó en «play» (no solo las «open»)', calls.some(c => c[0] === 'DELETE' && /rooms\/f$/.test(c[1])));
  // esquema v3: enc/dec de mapas y listas (los escalares, igual que antes), normalización de open() y filtro de la lista
  {
    const v = { n: 'Ana', at: 5, ok: true, x: 1.5, l: [1, 'a'], m: { b: { c: 'd' } }, e: {} };
    const e = NR.enc(v), back = NR.dec(e.mapValue.fields);
    check('enc/dec: mapas y listas ida y vuelta (seats)', JSON.stringify(back) === JSON.stringify(v) && e.mapValue.fields.at.integerValue === '5', back);
    check('enc: los escalares se codifican como antes', JSON.stringify([NR.enc('a'), NR.enc(3), NR.enc(true), NR.enc(null), NR.enc(2.5)]) ===
      JSON.stringify([{ stringValue: 'a' }, { integerValue: '3' }, { booleanValue: true }, { nullValue: null }, { doubleValue: 2.5 }]));
    check('dec: un tipo desconocido sigue dando null', NR.dec({ g: { geoPointValue: {} } }).g === null);
    const M = NR.multiCfg;
    check('multiCfg: sin mode/cap/6v6 = sala 1v1 (null)', M({ name: 'x', net: 'fluida', venue: 'beach' }) === null && M({}) === null && M({ fmt: '2v2' }) === null);
    const n = (c) => { const r = M(c); return r && [r.mode, r.cap, r.fmt, r.venue, r.fluida].join(); };
    check('multiCfg: combinaciones de plazas (vs 2v2 2|4, vs 6v6 2|4|12, coop 2 o 4 en 6v6) y lo que no cuadra se corrige',
      n({ cap: 4 }) === 'vs,4,2v2,hall,false' && n({ cap: 12 }) === 'vs,4,2v2,hall,false' && n({ mode: 'vs', cap: 2, venue: 'beach' }) === 'vs,2,2v2,beach,false'
      && n({ fmt: '6v6', venue: 'beach' }) === 'vs,12,6v6,hall,false' && n({ fmt: '6v6', cap: 4 }) === 'vs,4,6v6,hall,false'
      && n({ mode: 'coop', cap: 4 }) === 'coop,2,2v2,hall,false' && n({ mode: 'coop', fmt: '6v6', cap: 4 }) === 'coop,4,6v6,hall,false'
      && n({ mode: 'coop', fmt: '6v6', cap: 12 }) === 'coop,2,6v6,hall,false' && n({ mode: 'raro', cap: 3 }) === 'vs,4,2v2,hall,false',
      [n({ cap: 4 }), n({ fmt: '6v6', venue: 'beach' }), n({ mode: 'coop', cap: 4 })]);
    check('multiCfg: Fluida solo en vs con 2 plazas', n({ cap: 2, net: 'fluida' }).endsWith('true') && n({ cap: 4, net: 'fluida' }).endsWith('false') && n({ mode: 'coop', net: 'fluida' }).endsWith('false')
      && n({ fmt: '6v6', cap: 2, net: 'fluida' }) === 'vs,2,6v6,hall,false');
    check('seatPath: la clave del uid siempre entre comillas invertidas', NR.seatPath('9abc') === 'seats.`9abc`' && NR.seatPath('a`b') === 'seats.`a\\`b`', NR.seatPath('a`b'));
    const sent = [];
    const rr = NR.create({ base: 'http://x/v1/projects/p/databases/(default)/documents', auth, ver: '1|x', fetch: async (url, o) => {
      if (/:commit$/.test(url)) sent.push(JSON.parse(o.body).writes[0].update.fields);
      return { ok: true, status: url.indexOf('/sig/') >= 0 ? 404 : 200, text: async () => (/:runQuery$/.test(url) ? '[]' : '{}') };
    } });
    await rr.open({ name: 'Ana', mode: 'vs', cap: 4, fmt: '2v2', venue: 'beach', net: 'fluida', lineup: '{"a":1}' }); await rr.open({ name: 'Ana', fmt: '6v6', venue: 'beach' }); await rr.open({ name: 'Ana' });
    const f0 = sent[0], f1 = sent[1], f2 = sent[2];
    check('open(): sala de varios con mode/cap/seats vacío/cnt 0, guest/gname vacíos, sin net con 4 plazas; lineup si viene',
      f0.mode.stringValue === 'vs' && f0.cap.integerValue === '4' && f0.cnt.integerValue === '0' && f0.seats.mapValue && Object.keys(f0.seats.mapValue.fields).length === 0
      && f0.guest.stringValue === '' && f0.gname.stringValue === '' && !('net' in f0) && f0.venue.stringValue === 'beach' && f0.lineup.stringValue === '{"a":1}', f0);
    check('open(): 6v6 → 12 plazas en Pabellón; sin mode/cap la sala 1v1 de siempre (sin las claves nuevas)',
      f1.fmt.stringValue === '6v6' && f1.cap.integerValue === '12' && f1.venue.stringValue === 'hall'
      && Object.keys(f2).sort().join() === 'bo,code,even,fmt,gname,guest,host,map,name,pts,state,v,venue' && f2.fmt.stringValue === '2v2');
    // lista: las coop no salen; las de varios sin plaza tampoco
    const mdoc = (id, extra) => doc(id, 1000, Object.assign({ mode: { stringValue: 'vs' }, cap: { integerValue: '4' }, cnt: { integerValue: '0' }, seats: { mapValue: { fields: {} } } }, extra || {}));
    const seatsOf = k => ({ mapValue: { fields: Object.fromEntries(Array.from({ length: k }, (_, i) => ['g' + i, { mapValue: { fields: { n: { stringValue: 'G' + i }, at: { timestampValue: ts(now) } } } }])) } });
    const r2 = NR.create({ base: 'http://x/v1/projects/p/databases/(default)/documents', auth, ver: '1|x', fetch: async (url) => ({ ok: true, status: 200,
      text: async () => JSON.stringify(/:runQuery$/.test(url) ? [mdoc('m1'), mdoc('m2', { seats: seatsOf(3) }), mdoc('m3', { mode: { stringValue: 'coop' }, cap: { integerValue: '2' } }), mdoc('m4', { seats: seatsOf(2) }), doc('l1', 500)] : {}) }) });
    const L2 = await r2.list(), m4 = L2.find(x => x.id === 'm4'), l1 = L2.find(x => x.id === 'l1');
    check('lista: sin las coop ni las de varios llenas; plazas libres (free) y sentados (nseat); las 1v1 sin campos nuevos',
      L2.map(x => x.id).sort().join() === 'l1,m1,m4' && m4.multi === true && m4.nseat === 2 && m4.free === 1 && m4.seats.g1.n === 'G1' && typeof m4.seats.g1.at === 'number'
      && l1.multi === undefined && l1.seats === undefined && l1.free === undefined, L2.map(x => x.id + ':' + x.free));
  }
  // nombres y códigos
  check('nombre: espacios, < > y controles fuera; 16 como mucho', NR.cleanName('  Ana   <b>Pérez</b>\u0007 de la Torre Grande ') === 'Ana bPérez/b de ' || NR.cleanName('  Ana   <b>Pérez</b>\u0007 de la Torre Grande ').length <= 16, NR.cleanName('  Ana   <b>Pérez</b>\u0007 de la Torre Grande '));
  const em = '\u{1F3D0}'.repeat(12);
  check('nombre: 16 unidades UTF-16 como las reglas (8 emojis; nunca medio emoji)', NR.cleanName(em) === '\u{1F3D0}'.repeat(8) && NR.cleanName('a' + em).length === 15 && NR.cleanName('é'.repeat(20)) === 'é'.repeat(16), [NR.cleanName(em).length, NR.cleanName('a' + em).length]);
  check('nombre: nunca algo con @ (correo)', NR.cleanName('ana@correo.es') === '' && NR.cleanName('A') === '');
  let okc = true; for (let i = 0; i < 2000; i++) if (!NR.codeOk(NR.newCode())) okc = false;
  check('códigos de 6 sin 0/O/1/I/L', okc && NR.normCode(' k7p-2qx ') === 'K7P2QX' && !NR.codeOk('K7P2Q0'));
}

/* ---------- 1) emulador ---------- */
function findJar() {
  const d = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
  try { return fs.readdirSync(d).filter(f => /^cloud-firestore-emulator-.*\.jar$/.test(f)).sort().map(f => path.join(d, f)).pop() || null; } catch (e) { return null; }
}
function b64u(o) { return Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function fakeToken(uid) {
  const t = Math.floor(Date.now() / 1000);
  return b64u({ alg: 'none', typ: 'JWT' }) + '.' + b64u({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: t, user_id: uid, sub: uid, iat: t, exp: t + 3600,
    firebase: { identities: {}, sign_in_provider: 'password' } }) + '.';
}
async function emuTests(base, NR) {
  const ver = '1|test';
  const mk = uid => NR.create({ base, ver, auth: async () => ({ uid, token: fakeToken(uid) }) });
  const A = mk('uidA'), B = mk('uidB'), C = mk('uidC');
  const raw = async (method, p, body, tok) => { const r = await fetch(base + p, { method, headers: Object.assign({ Authorization: 'Bearer ' + (tok || 'owner') }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  console.log('\nReglas y cliente contra el emulador de Firestore');
  // sin sesión
  const anon = await fetch(base + ':runQuery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'rooms' }], limit: 10 } }) });
  check('sin sesión no se puede listar', anon.status === 403, anon.status);
  // crear
  const ra = await A.open({ name: 'Ana', venue: 'beach', map: 'platja', even: false, bo: 1, pts: 21 });
  check('A crea su sala (doc = su uid, seen del servidor)', ra && ra.id === 'uidA' && ra.state === 'open' && NR.codeOk(ra.code) && ra.age < 5000, ra && { id: ra.id, code: ra.code, age: ra.age });
  check('en la sala no hay correo: solo el nombre visible', ra && ra.name === 'Ana' && !JSON.stringify(ra).includes('@'));
  let L = await B.list();
  check('B ve la sala de A en la lista (nombre, formato, sede, config)', L.length === 1 && L[0].id === 'uidA' && L[0].venue === 'beach' && L[0].map === 'platja' && L[0].bo === 1 && L[0].even === false, L);
  L = await A.list();
  check('A no ve su propia sala en la lista', L.length === 0);
  const byc = await C.byCode(ra.code.toLowerCase());
  check('buscar por código (da igual mayúsculas)', byc && byc.id === 'uidA');
  // crear con otro id / campos malos
  const fx = (uid, fields) => raw('POST', ':commit', { writes: [{ update: { name: base.slice(base.indexOf('projects/')) + '/rooms/' + uid, fields }, updateTransforms: [{ fieldPath: 'seen', setToServerValue: 'REQUEST_TIME' }] }] }, fakeToken('uidC'));
  const good = { code: { stringValue: 'K7P2QX' }, name: { stringValue: 'Cris' }, gname: { stringValue: '' }, host: { stringValue: 'uidC' }, guest: { stringValue: '' }, fmt: { stringValue: '2v2' }, venue: { stringValue: 'hall' }, map: { stringValue: '' }, even: { booleanValue: true }, bo: { integerValue: '3' }, pts: { integerValue: '21' }, state: { stringValue: 'open' }, v: { stringValue: ver } };
  check('nadie crea una sala con el uid de otra cuenta', (await fx('uidA2', Object.assign({}, good))).status === 403);
  check('sala con un campo de más (p. ej. correo) rechazada', (await fx('uidC', Object.assign({ mail: { stringValue: 'x@y.z' } }, good))).status === 403);
  check('sala con nombre de 17 rechazada', (await fx('uidC', Object.assign({}, good, { name: { stringValue: 'x'.repeat(17) } }))).status === 403);
  check('sala con seen del cliente (sin transformación) rechazada', (await raw('PATCH', '/rooms/uidC', { fields: Object.assign({ seen: { timestampValue: new Date().toISOString() } }, good) }, fakeToken('uidC'))).status === 403);
  check('sala bien hecha de C aceptada', (await fx('uidC', good)).status === 200);
  await raw('DELETE', '/rooms/uidC', null, fakeToken('uidC'));
  // unirse
  const rb = await B.join('uidA', 'Berta');
  check('B entra en la sala de A (full, gname)', rb && rb.state === 'full' && rb.guest === 'uidB' && rb.gname === 'Berta', rb);
  check('C ya no puede entrar (llena)', await code(C.join('uidA', 'Cris')) === 'full');
  const rawJoin = await raw('PATCH', '/rooms/uidA?updateMask.fieldPaths=guest&updateMask.fieldPaths=gname&updateMask.fieldPaths=state', { fields: { guest: { stringValue: 'uidC' }, gname: { stringValue: 'Cris' }, state: { stringValue: 'full' } } }, fakeToken('uidC'));
  check('C tampoco a mano (las reglas, no solo el cliente)', rawJoin.status === 403);
  L = await C.list();
  check('una sala llena ya no sale en la lista', !L.some(r => r.id === 'uidA'));
  // latido del anfitrión: no pisa al invitado
  const beat = await A.beat();
  check('latido de A: seen renovado y el invitado sigue', beat && beat.guest === 'uidB' && beat.state === 'full' && beat.age < 3000, beat && { guest: beat.guest, state: beat.state });
  check('B no puede cambiar la config de la sala de A', (await raw('PATCH', '/rooms/uidA?updateMask.fieldPaths=bo', { fields: { bo: { integerValue: '3' } } }, fakeToken('uidB'))).status === 403);
  // señalización
  await A.putSig('uidA', 'offer', { sdp: 'v=0 oferta', gen: 1, to: 'uidB' });
  const so = await B.getSig('uidA', 'offer');
  check('A escribe la oferta y B la lee', so && so.sdp === 'v=0 oferta' && so.gen === 1);
  check('C no puede leer la señalización (direcciones de red)', (await C.getSig('uidA', 'offer')) === null && (await raw('GET', '/rooms/uidA/sig/offer', null, fakeToken('uidC'))).status === 403);
  check('la oferta va a nombre del invitado (to = otro: rechazada)', await code(A.putSig('uidA', 'offer', { sdp: 'x', gen: 2, to: 'uidC' })) === 'denied');
  check('B no puede escribir la oferta (es del anfitrión)', await code(B.putSig('uidA', 'offer', { sdp: 'x', gen: 2 })) === 'denied');
  check('C no puede escribir la respuesta', await code(C.putSig('uidA', 'answer', { sdp: 'x', gen: 1 })) === 'denied');
  await B.putSig('uidA', 'answer', { sdp: 'v=0 respuesta', gen: 1 });
  const sa = await A.getSig('uidA', 'answer');
  check('B escribe la respuesta y A la lee (firmada con el uid de B)', sa && sa.sdp === 'v=0 respuesta' && sa.gen === 1 && sa.uid === 'uidB');
  check('respuesta firmada con otro uid rechazada', (await raw('PATCH', '/rooms/uidA/sig/answer', { fields: { sdp: { stringValue: 'x' }, gen: { integerValue: '1' }, uid: { stringValue: 'uidC' } } }, fakeToken('uidB'))).status === 403);
  check('SDP de más de 20 000 caracteres rechazada', await code(A.putSig('uidA', 'offer', { sdp: 'x'.repeat(20001), gen: 3, to: 'uidB' })) === 'denied');
  // jugando
  const rp = await A.beat({ state: 'play' });
  check('A pasa la sala a «play» (B la sigue leyendo; ya no sale en la lista)', rp && rp.state === 'play' && (await B.get('uidA')).state === 'play' && !(await C.list()).some(r => r.id === 'uidA'));
  await A.delSig('uidA');
  check('al conectar se borra la señalización', (await A.getSig('uidA', 'offer')) === null && (await B.getSig('uidA', 'answer')) === null);
  // salir antes de empezar
  await A.beat({ state: 'full' });
  await B.leave('uidA');
  const rl = await A.get('uidA');
  check('B sale antes de empezar: la sala vuelve a estar abierta y vacía', rl && rl.state === 'open' && rl.guest === '' && rl.gname === '', rl && { state: rl.state, guest: rl.guest });
  check('al salir, el invitado borra su respuesta', (await raw('GET', '/rooms/uidA/sig/answer')).status === 404);
  check('C entra después', (await C.join('uidA', 'Cris')).guest === 'uidC');
  // (revisión F2 n.º 1) señalización que se quedó (B la escribió y salió sin borrarla): C no hereda la de B
  await raw('PATCH', '/rooms/uidA/sig/answer', { fields: { sdp: { stringValue: 'ANSWER-B c=IN IP4 9.9.9.9' }, gen: { integerValue: '1' }, uid: { stringValue: 'uidB' } } });
  await raw('PATCH', '/rooms/uidA/sig/offer', { fields: { sdp: { stringValue: 'OFFER para B' }, gen: { integerValue: '1' }, to: { stringValue: 'uidB' } } });
  check('C (invitado nuevo) NO lee la respuesta ni la oferta del invitado anterior', (await C.getSig('uidA', 'answer')) === null && (await C.getSig('uidA', 'offer')) === null
    && (await raw('GET', '/rooms/uidA/sig/answer', null, fakeToken('uidC'))).status === 403 && (await raw('GET', '/rooms/uidA/sig/offer', null, fakeToken('uidC'))).status === 403);
  check('… ni el anfitrión la respuesta de quien ya no es su invitado', (await A.getSig('uidA', 'answer')) === null);
  // (revisión F2 n.º 2) el anfitrión vuelve a abrir (recarga): la señalización vieja desaparece
  const keep = await A.get('uidA');
  await A.open({ name: 'Ana', venue: 'beach', code: keep.code });
  check('reabrir la sala borra la señalización de la sesión anterior', (await raw('GET', '/rooms/uidA/sig/offer')).status === 404 && (await raw('GET', '/rooms/uidA/sig/answer')).status === 404);
  check('C entra otra vez', (await C.join('uidA', 'Cris')).guest === 'uidC');
  check('el anfitrión puede echar al invitado (reabrir)', (await A.beat({ state: 'open', guest: '', gname: '' })).guest === '');
  // otra versión
  const D = NR.create({ base, ver: '1|otra', auth: async () => ({ uid: 'uidD', token: fakeToken('uidD') }) });
  L = await D.list();
  check('una sala de otra versión sale marcada y no deja entrar', L.length === 1 && L[0].other === true && await code(D.join('uidA', 'Dani')) === 'version');
  // caducidad y limpieza: sala de E con latido de hace 10 min (escrita con la ficha de administración del emulador)
  const old = Object.assign({}, good, { host: { stringValue: 'uidE' }, name: { stringValue: 'Eli' }, seen: { timestampValue: new Date(Date.now() - 600000).toISOString() } });
  await raw('PATCH', '/rooms/uidE', { fields: old });
  await raw('PATCH', '/rooms/uidE/sig/offer', { fields: { sdp: { stringValue: 'x' }, gen: { integerValue: '1' }, to: { stringValue: '' } } });
  const old2 = Object.assign({}, old, { host: { stringValue: 'uidF' }, seen: { timestampValue: new Date(Date.now() - 200000).toISOString() } });
  await raw('PATCH', '/rooms/uidF', { fields: old2 });
  check('sala sin latido (> 90 s): no se puede entrar', await code(B.join('uidF', 'Berta')) === 'gone');
  const rawF = await raw('PATCH', '/rooms/uidF?updateMask.fieldPaths=guest&updateMask.fieldPaths=gname&updateMask.fieldPaths=state', { fields: { guest: { stringValue: 'uidB' }, gname: { stringValue: 'B' }, state: { stringValue: 'full' } } }, fakeToken('uidB'));
  check('… ni a mano (reglas)', rawF.status === 403);
  check('sala de hace 200 s: nadie más que el anfitrión la borra', (await raw('DELETE', '/rooms/uidF', null, fakeToken('uidB'))).status === 403);
  L = await B.list();
  check('las salas sin latido no salen en la lista', !L.some(r => r.id === 'uidE' || r.id === 'uidF'));
  await sleep(500);
  const gE = await raw('GET', '/rooms/uidE'), gEs = await raw('GET', '/rooms/uidE/sig/offer');
  check('la lista borra de paso la de hace 10 min y su señalización', gE.status === 404 && gEs.status === 404, [gE.status, gEs.status]);
  await raw('PATCH', '/rooms/uidE', { fields: Object.assign({}, old, { state: { stringValue: 'play' } }) });
  await B.sweep();
  check('limpieza de salas jugando que se quedaron sin latido (sweep)', (await raw('GET', '/rooms/uidE')).status === 404);
  // cerrar
  await A.beat({ state: 'full', guest: 'uidC', gname: 'Cris' }).catch(() => null);
  await A.putSig('uidA', 'offer', { sdp: 'y', gen: 2, to: 'uidC' });
  await A.close();
  check('A cierra su sala: sala y señalización borradas', (await raw('GET', '/rooms/uidA')).status === 404 && (await raw('GET', '/rooms/uidA/sig/offer')).status === 404);
  check('latido de una sala cerrada → null (el cliente lo trata como «sala cerrada»)', (await A.beat()) === null);
  check('con las reglas nuevas se sigue guardando el progreso propio (users/{uid}/saves) y no se lee el ajeno', (await raw('PATCH', '/users/uidA/saves/squad', { fields: { data: { stringValue: '{}' }, updatedAt: { integerValue: '1' } } }, fakeToken('uidA'))).status === 200 && (await raw('GET', '/users/uidA/saves/squad', null, fakeToken('uidB'))).status === 403);
  { const em = NR.cleanName('\u{1F3D0}'.repeat(12)), H = mk('uidH'); let rr = null; try { rr = await H.open({ name: em }); } catch (e) { rr = e.code; }
    check('nombre con emojis recortado por el cliente: las reglas lo aceptan', rr && rr.name === em, rr && rr.name ? rr.name.length : rr);
    const gj = await mk('uidI').join('uidH', '\u{1F3D0}'.repeat(12)).catch(e => e.code);
    check('… y al entrar (gname)', gj && gj.guest === 'uidI', gj && gj.gname);
    await H.close(); }
  { const H = mk('uidJ'), G = mk('uidK'); await H.open({ name: 'Jo' }); await G.join('uidJ', 'Ka'); await G.putSig('uidJ', 'answer', { sdp: 'z', gen: 1 });
    G.bye('guest', 'uidJ'); await sleep(600);
    const gr = await H.get('uidJ');
    check('pestaña cerrada (pagehide) del invitado: hueco libre y su respuesta borrada', gr && gr.state === 'open' && gr.guest === '' && (await raw('GET', '/rooms/uidJ/sig/answer')).status === 404);
    H.bye('host'); await sleep(600);
    check('pestaña cerrada (pagehide) del anfitrión: sala borrada al momento', (await raw('GET', '/rooms/uidJ')).status === 404); }
  // (robustez) vuelta del invitado tras recargar: con la sala en 'play', su pagehide no la reabre (las reglas solo dejan salir desde
  // 'full') y, ya de vuelta, el anfitrión reescribe la oferta (gen+1) y el invitado su respuesta, sin cambiar las reglas
  { const H = mk('uidL'), G = mk('uidM'); await H.open({ name: 'Lu' }); await G.join('uidL', 'Mo'); await H.beat({ state: 'play' });
    await H.putSig('uidL', 'offer', { sdp: 'o1', gen: 10, to: 'uidM' }); await G.putSig('uidL', 'answer', { sdp: 'a1', gen: 10 });
    G.bye('guest', 'uidL'); await sleep(600);
    const r1 = await H.get('uidL');
    const G2 = mk('uidM');   // (la página recargada: cliente nuevo, misma cuenta)
    const okOffer = await H.putSig('uidL', 'offer', { sdp: 'o2', gen: 11, to: 'uidM' }).then(() => true, e => e.code);
    const o2 = await G2.getSig('uidL', 'offer');
    const okAns = await G2.putSig('uidL', 'answer', { sdp: 'a2', gen: 11 }).then(() => true, e => e.code);
    const a2 = await H.getSig('uidL', 'answer');
    check('recarga del invitado en pleno partido: la sala sigue en juego con él; nueva oferta (gen+1) y nueva respuesta caben en las reglas',
      r1 && r1.state === 'play' && r1.guest === 'uidM' && okOffer === true && o2 && o2.gen === 11 && okAns === true && a2 && a2.gen === 11 && a2.uid === 'uidM', { r1: r1 && r1.state, okOffer, okAns });
    const C2 = mk('uidC'); const peek = await C2.getSig('uidL', 'offer');
    check('… y un tercero no puede leer la oferta nueva', peek === null);
    await H.close(); }
  // (fase 6) vuelta del ANFITRIÓN tras recargar: su pagehide en pleno partido no borra la sala; la página nueva (cliente nuevo,
  // misma cuenta) la retoma (resume), late y reofrece con gen+1 al mismo invitado; fuera de plazo la borra. Sin cambiar las reglas.
  { const H = mk('uidP'), G = mk('uidQ'); await H.open({ name: 'Pau' }); await G.join('uidP', 'Quim'); await H.beat({ state: 'play' });
    await H.putSig('uidP', 'offer', { sdp: 'o1', gen: 20, to: 'uidQ' }); await G.putSig('uidP', 'answer', { sdp: 'a1', gen: 20 }); await H.delSig('uidP');
    await sleep(1200);   // (recarga: sin bye del anfitrión)
    const H2 = mk('uidP');
    const nob = await H2.beat();   // (sin resume, la página nueva no sabe que tiene sala: no late)
    const r1 = await H2.resume();
    const b1 = await H2.beat();
    const okOffer = await H2.putSig('uidP', 'offer', { sdp: 'o2', gen: 21, to: 'uidQ' }).then(() => true, e => e.code);
    const o2 = await G.getSig('uidP', 'offer');
    const okAns = await G.putSig('uidP', 'answer', { sdp: 'a2', gen: 21 }).then(() => true, e => e.code);
    const a2 = await H2.getSig('uidP', 'answer');
    check('recarga del anfitrión en pleno partido: retoma su sala (sigue en juego con el invitado), late y la oferta gen+1 y la respuesta caben en las reglas',
      nob === null && r1 && r1.state === 'play' && r1.guest === 'uidQ' && b1 && b1.age < 3000 && b1.state === 'play' && b1.guest === 'uidQ' && okOffer === true && o2 && o2.gen === 21 && o2.sdp === 'o2' && okAns === true && a2 && a2.gen === 21 && a2.uid === 'uidQ',
      { r1: r1 && r1.state, b1: b1 && b1.age, okOffer, okAns });
    const C3 = mk('uidC'); const peek = await C3.getSig('uidP', 'offer'), rc = await C3.resume();
    check('… un tercero no lee la oferta nueva ni retoma la sala (resume solo da la tuya)', peek === null && rc === null);
    const H3 = mk('uidP'); const r3 = await H3.resume(); await H3.close();
    const gone = await G.get('uidP'), o3 = await G.getSig('uidP', 'offer');
    check('anfitrión que vuelve fuera de plazo: retoma y borra su sala; el invitado ya no ve sala ni oferta', r3 && r3.id === 'uidP' && gone === null && o3 === null && (await mk('uidP').resume()) === null); }
  // Online V2: campo opcional net de la sala (conexión Fluida). Sin él = Precisa (como siempre); si está, solo 'fluida'.
  {
    check('sala con net = fluida aceptada', (await fx('uidC', Object.assign({}, good, { net: { stringValue: 'fluida' } }))).status === 200);
    check('sala con net = precisa (o cualquier otro valor) rechazada', (await fx('uidC', Object.assign({}, good, { net: { stringValue: 'precisa' } }))).status === 403
      && (await fx('uidC', Object.assign({}, good, { net: { stringValue: 'x'.repeat(30) } }))).status === 403
      && (await fx('uidC', Object.assign({}, good, { net: { booleanValue: true } }))).status === 403);
    check('sala sin net aceptada (Precisa, como siempre)', (await fx('uidC', good)).status === 200);
    await raw('DELETE', '/rooms/uidC', null, fakeToken('uidC'));
    const H = mk('uidN'), G = mk('uidO');
    const rn = await H.open({ name: 'Nur', net: 'fluida' });
    check('el cliente crea una sala Fluida (net = fluida) y la lista la enseña', rn && rn.net === 'fluida' && (await G.list()).some(r => r.id === 'uidN' && r.net === 'fluida'), rn && rn.net);
    const jn = await G.join('uidN', 'Oli');
    const b0 = await H.beat(), b1 = await H.beat({ state: 'play' });
    check('net se mantiene al entrar y en los latidos (con y sin cambios)', jn && jn.net === 'fluida' && b0 && b0.net === 'fluida' && b1 && b1.net === 'fluida' && b1.state === 'play');
    check('el invitado no puede cambiar net (solo guest/gname/state)', (await raw('PATCH', '/rooms/uidN?updateMask.fieldPaths=net', { fields: { net: { stringValue: 'fluida' } } }, fakeToken('uidO'))).status === 403
      && (await raw('PATCH', '/rooms/uidN?updateMask.fieldPaths=net', { fields: {} }, fakeToken('uidO'))).status === 403);
    const H2 = mk('uidN'); const rr = await H2.resume(); const b2 = await H2.beat(), b3 = await H2.beat({ state: 'full' });
    check('el anfitrión que recarga retoma la sala Fluida y net sigue tras los latidos', rr && rr.net === 'fluida' && b2 && b2.net === 'fluida' && b3 && b3.net === 'fluida' && b3.state === 'full');
    const hostNet = v => raw('POST', ':commit', { writes: [{ update: { name: base.slice(base.indexOf('projects/')) + '/rooms/uidN', fields: { net: v } }, updateMask: { fieldPaths: ['net'] },
      updateTransforms: [{ fieldPath: 'seen', setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: true } }] }, fakeToken('uidN'));
    check('el anfitrión puede reescribir net = fluida, pero no un net raro', (await hostNet({ stringValue: 'fluida' })).status === 200 && (await hostNet({ stringValue: 'turbo' })).status === 403);
    const rp = await mk('uidN').open({ name: 'Nur' });
    check('reabrir como Precisa quita net (la sala se rehace entera)', rp && rp.net === undefined, rp && rp.net);
    await H2.close();
  }
  check('C no puede borrar la sala de otro con latido vivo', await (async () => { const r = await mk('uidG').open({ name: 'Gal' }); const d = await raw('DELETE', '/rooms/uidG', null, fakeToken('uidC')); await mk('uidG').close(); return r && d.status === 403; })());
  // (auditoría) código copiado por otra cuenta: byCode no elige ninguna ('dup'); y al abrir con código nuevo no se repite uno vivo
  {
    const V = mk('zzVictim'), E = mk('aaEvil'), F = mk('uidFriend');
    const rv = await V.open({ name: 'Vic' });
    const fe = {}; for (const k in good) fe[k] = good[k];
    fe.code = { stringValue: rv.code }; fe.host = { stringValue: 'aaEvil' }; fe.name = { stringValue: 'Trampa' }; fe.v = { stringValue: ver };
    const ce = await fetch(base + ':commit', { method: 'POST', headers: { Authorization: 'Bearer ' + fakeToken('aaEvil'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: [{ update: { name: base.slice(base.indexOf('projects/')) + '/rooms/aaEvil', fields: fe }, updateTransforms: [{ fieldPath: 'seen', setToServerValue: 'REQUEST_TIME' }] }] }) });
    check('código copiado (las reglas lo dejan): «Entrar con código» no entra en ninguna (dup)', ce.status === 200 && await code(F.byCode(rv.code)) === 'dup', ce.status);
    await raw('DELETE', '/rooms/aaEvil');
    check('… y sin la copia, el código vuelve a llevar a la sala de verdad', (await F.byCode(rv.code)).id === 'zzVictim');
    // lista saturada: 45 salas «abiertas» sin latido (2 min: aún no se barren) con uid bajo no esconden la sala viva de uid alto
    for (let i = 0; i < 45; i++) await raw('PATCH', '/rooms/a0' + String(i).padStart(2, '0'), { fields: Object.assign({}, good, { host: { stringValue: 'a0' + String(i).padStart(2, '0') }, code: { stringValue: 'QQQQQ' + 'ABCDEFGHJKMNPQRSTUVWXYZ'[i % 23] }, seen: { timestampValue: new Date(Date.now() - 120000).toISOString() } }) });
    const Lsat = await F.list();
    check('lista con 45 salas abiertas caducadas de uid bajo: la sala viva sigue saliendo (por latido)', Lsat.some(r => r.id === 'zzVictim'), Lsat.map(r => r.id));
    for (let i = 0; i < 45; i++) await raw('DELETE', '/rooms/a0' + String(i).padStart(2, '0'));
    await V.close();
  }
  // FEEDBACK (1.22.1, js/feedback.js): las opiniones de los jugadores en el mismo banco de reglas (el resto, con la cuenta admin de
  // prueba, en tools/feedbacktest.js)
  {
    const docRoot = base.slice(base.indexOf('projects/'));
    const S = v => ({ stringValue: v });
    const fb = (id, fields, tok) => fetch(base + ':commit', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}),
      body: JSON.stringify({ writes: [{ update: { name: docRoot + '/feedback/' + id, fields }, updateTransforms: [{ fieldPath: 't', setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: false } }] }) }).then(r => r.status);
    const ok = { kind: S('sug'), text: S('Más sedes de playa'), ver: S('1.22.1'), ctx: S('{}'), uid: S(''), state: S('nuevo') };
    check('feedback: crear sin sesión (uid \'\') → 200', await fb('FbRoomtest0000000001', ok) === 200);
    check('feedback: crear con sesión y su uid → 200', await fb('FbRoomtest0000000002', Object.assign({}, ok, { uid: S('uidA') }), fakeToken('uidA')) === 200);
    check('feedback: campos de más → 403', await fb('FbRoomtest0000000003', Object.assign({}, ok, { nombre: S('Ana') })) === 403);
    check('feedback: uid de otro → 403', await fb('FbRoomtest0000000004', Object.assign({}, ok, { uid: S('uidB') }), fakeToken('uidA')) === 403);
    const rd = await fetch(base + ':runQuery', { method: 'POST', headers: { Authorization: 'Bearer ' + fakeToken('uidA'), 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'feedback' }], limit: 10 } }) });
    const rd0 = await fetch(base + '/feedback/FbRoomtest0000000001');
    check('feedback: leer sin ser admin → 403 (con sesión y sin ella)', rd.status === 403 && rd0.status === 403, [rd.status, rd0.status]);
  }
}

/* ---------- 1b) esquema v3: salas de varios contra el emulador ---------- */
async function emuMulti(base) {
  const ver = '3|test', docRoot = base.slice(base.indexOf('projects/'));
  // cada cliente cuenta sus peticiones (GET = lectura, PATCH/POST = escritura, DELETE = borrado; sig = las de señalización, que en
  // las reglas leen además la sala con get(): 1 lectura más cada una)
  const counts = {};
  const mk = uid => { const c = counts[uid] = { GET: 0, PATCH: 0, POST: 0, DELETE: 0, sig: 0 };
    return NR.create({ base, ver, auth: async () => ({ uid, token: fakeToken(uid) }), fetch: (url, o) => { c[o.method] = (c[o.method] || 0) + 1; if (/\/sig\//.test(url)) c.sig++; return fetch(url, o); } }); };
  const zero = uid => { const c = counts[uid]; for (const k in c) c[k] = 0; };
  const cnt = uid => { const c = counts[uid]; return { r: c.GET, w: c.PATCH + c.POST, d: c.DELETE, rr: c.sig }; };
  const raw = async (method, p, body, tok) => { const r = await fetch(base + p, { method, headers: Object.assign({ Authorization: 'Bearer ' + (tok || 'owner') }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  const st = async p => (await raw('GET', p)).status;
  const seat = n => ({ mapValue: { fields: { n: { stringValue: n } } } });
  /** Sentarse a mano (commit con máscara seats.<k> y at del servidor), para probar las reglas sin el cliente. */
  const sit = (uid, rid, seats, o) => { o = o || {};
    return raw('POST', ':commit', { writes: [{ update: { name: docRoot + '/rooms/' + rid, fields: Object.assign({ seats: { mapValue: { fields: seats } } }, o.extra || {}) },
      updateMask: { fieldPaths: Object.keys(seats).map(k => NR.seatPath(k)).concat(o.mask || []) },
      updateTransforms: o.noAt ? [] : Object.keys(seats).map(k => ({ fieldPath: NR.seatPath(k) + '.at', setToServerValue: 'REQUEST_TIME' })), currentDocument: { exists: true } }] }, fakeToken(uid)); };
  const unsit = (uid, rid, k) => raw('PATCH', '/rooms/' + rid + '?updateMask.fieldPaths=' + encodeURIComponent(NR.seatPath(k)) + '&currentDocument.exists=true', { fields: {} }, fakeToken(uid));
  const goodM = { code: { stringValue: 'M7P2QX' }, name: { stringValue: 'Moi' }, gname: { stringValue: '' }, host: { stringValue: 'mC' }, guest: { stringValue: '' }, fmt: { stringValue: '2v2' },
    venue: { stringValue: 'beach' }, map: { stringValue: '' }, even: { booleanValue: false }, bo: { integerValue: '1' }, pts: { integerValue: '21' }, state: { stringValue: 'open' }, v: { stringValue: ver },
    mode: { stringValue: 'vs' }, cap: { integerValue: '4' }, seats: { mapValue: { fields: {} } }, cnt: { integerValue: '0' } };
  const fxM = async (fields, uid) => { uid = uid || 'mC'; const r = await raw('POST', ':commit', { writes: [{ update: { name: docRoot + '/rooms/' + uid, fields: Object.assign({}, fields, { host: { stringValue: uid } }) },
    updateTransforms: [{ fieldPath: 'seen', setToServerValue: 'REQUEST_TIME' }] }] }, fakeToken(uid)); await raw('DELETE', '/rooms/' + uid); return r.status; };
  const W = (o) => Object.assign({}, goodM, o);
  console.log('\nEsquema v3: salas de varios contra el emulador');

  // --- crear ---
  const H = mk('mH'), X = mk('mX');
  const rh = await H.open({ name: 'Hugo', mode: 'vs', cap: 4, fmt: '2v2', venue: 'beach', map: 'platja' });
  check('el anfitrión abre una sala 2v2 de 4 plazas (mode, cap, seats vacío, cnt 0, guest/gname vacíos)', rh && rh.multi === true && rh.cap === 4 && rh.mode === 'vs' && rh.fmt === '2v2'
    && rh.venue === 'beach' && rh.nseat === 0 && rh.free === 3 && rh.cnt === 0 && rh.guest === '' && rh.gname === '' && rh.state === 'open' && rh.age < 5000, rh);
  let L = await X.list();
  check('sale en la lista con 3 plazas libres', L.some(r => r.id === 'mH' && r.free === 3 && r.multi));
  const K = mk('mK'), rk = await K.open({ name: 'Kai', mode: 'coop', cap: 4 });
  L = await X.list();
  check('sala coop (cap corregido a 2): NO sale en la lista pero se encuentra por código y por enlace (get)', rk.cap === 2 && rk.mode === 'coop' && !L.some(r => r.id === 'mK')
    && (await X.byCode(rk.code)).id === 'mK' && (await X.get('mK')).mode === 'coop');
  check('(L3) la sala coop se abre en estado «coop», nunca «open»', rk.state === 'coop', rk.state);
  check('(L3) el anfitrión de la coop no puede pasarla a «open» (latido); a «full» sí', await code(K.beat({ state: 'open' })) === 'denied' && (await K.beat({ state: 'coop' })).state === 'coop');
  const S = mk('mS'), rs = await S.open({ name: 'Sol', fmt: '6v6', venue: 'beach' });
  check('sala 6v6: 12 plazas y en Pabellón aunque se pida playa', rs.fmt === '6v6' && rs.cap === 12 && rs.venue === 'hall' && rs.mode === 'vs');
  check('(L3) sala 6v6 con net «host» (modelo del anfitrión); la 2v2 sin net (Precisa)', rs.net === 'host' && rh.net === undefined, [rs.net, rh.net]);
  {
    const zl = mk('mZl'); await zl.open({ name: 'Zoe', mode: 'vs', cap: 4 });
    const t = counts.mZl; for (const k in t) t[k] = 0;
    const rl = await zl.beat({ cnt: 0 }, { lite: true });
    check('(L3) latido lite: 1 escritura y ninguna lectura; devuelve la sala escrita (null si ya no existe)', rl && rl.id === 'mZl' && rl.cnt === 0 && t.GET === 0 && t.POST === 1, t);
    await zl.close();
    check('(L3) latido lite de una sala borrada → null', (await zl.beat(null, { lite: true })) === null);
  }

  // --- entrar (varios invitados) y conteo ---
  const G = [1, 2, 3, 4, 5].map(i => mk('mG' + i));
  zero('mG1');
  const t0 = Date.now(), r1 = await G[0].join('mH', 'Gil');
  const c1 = cnt('mG1');
  check('G1 entra (join reconoce la sala de varios): su plaza con su nombre y la hora del servidor; nada de guest/state', r1 && r1.seats.mG1 && r1.seats.mG1.n === 'Gil'
    && Math.abs(r1.seats.mG1.at - t0) < 15000 && r1.nseat === 1 && r1.free === 2 && r1.guest === '' && r1.state === 'open', r1 && r1.seats);
  check('entrar cuesta 1 lectura + 1 escritura (sin releer la sala)', c1.r === 1 && c1.w === 1 && c1.d === 0, c1);
  const r2 = await G[1].joinMulti('mH', 'Gala'), r3 = await G[2].joinMulti('mH', 'Gus');
  let rr = await H.get('mH');
  check('G2 y G3 entran: 3 invitados, sala llena (free 0) y aún «open» (el anfitrión decide el estado)', r2 && r3 && rr.nseat === 3 && rr.free === 0 && rr.state === 'open'
    && rr.seats.mG2.n === 'Gala' && rr.seats.mG3.n === 'Gus' && rr.seats.mG1.n === 'Gil', rr && Object.keys(rr.seats));
  check('G4 ya no cabe (cliente: full)', await code(G[3].joinMulti('mH', 'Gea')) === 'full');
  check('… ni a mano (reglas: como mucho cap-1 invitados)', (await sit('mG4', 'mH', { mG4: seat('Gea') })).status === 403);
  L = await X.list();
  check('una sala de varios sin plazas ya no sale en la lista', !L.some(r => r.id === 'mH'));
  check('quien ya está sentado puede volver a sentarse (cambiar su nombre) aunque esté llena', (await G[0].joinMulti('mH', 'Gil2')).seats.mG1.n === 'Gil2' && (await H.get('mH')).nseat === 3);
  // --- salir ---
  zero('mG3');
  await G[2].leaveMulti('mH');
  const c3 = cnt('mG3');
  rr = await H.get('mH');
  check('G3 se levanta: solo su clave fuera, los demás siguen', rr.nseat === 2 && !rr.seats.mG3 && rr.seats.mG1 && rr.seats.mG2, Object.keys(rr.seats));
  check('levantarse cuesta 1 escritura + 1 borrado (su respuesta)', c3.w === 1 && c3.d === 1 && c3.r === 0, c3);
  // --- lo que las reglas no dejan al sentarse ---
  check('plaza con at del cliente (sin transformación): rechazada', (await sit('mG4', 'mH', { mG4: { mapValue: { fields: { n: { stringValue: 'Gea' }, at: { timestampValue: new Date().toISOString() } } } } }, { noAt: true })).status === 403);
  check('plaza sin at: rechazada', (await sit('mG4', 'mH', { mG4: seat('Gea') }, { noAt: true })).status === 403);
  check('plaza con un campo de más (p. ej. correo): rechazada', (await sit('mG4', 'mH', { mG4: { mapValue: { fields: { n: { stringValue: 'Gea' }, mail: { stringValue: 'a@b.c' } } } } })).status === 403);
  check('plaza con nombre de 17 o vacío: rechazada', (await sit('mG4', 'mH', { mG4: seat('x'.repeat(17)) })).status === 403 && (await sit('mG4', 'mH', { mG4: seat('') })).status === 403);
  check('sentarse en la plaza de OTRO: rechazado', (await sit('mG4', 'mH', { mG1: seat('Falso') })).status === 403);
  check('sentar a dos de golpe (la tuya y otra): rechazado', (await sit('mG4', 'mH', { mG4: seat('Gea'), mZ: seat('Zoe') })).status === 403);
  check('sentarse tocando cnt o state: rechazado', (await sit('mG4', 'mH', { mG4: seat('Gea') }, { extra: { cnt: { integerValue: '2' } }, mask: ['cnt'] })).status === 403
    && (await sit('mG4', 'mH', { mG4: seat('Gea') }, { extra: { state: { stringValue: 'full' } }, mask: ['state'] })).status === 403);
  check('el anfitrión no se sienta en su propia sala', (await sit('mH', 'mH', { mH: seat('Hugo') })).status === 403);
  check('un invitado no levanta a otro ni cambia cnt/estado', (await unsit('mG2', 'mH', 'mG1')).status === 403
    && (await raw('PATCH', '/rooms/mH?updateMask.fieldPaths=cnt', { fields: { cnt: { integerValue: '2' } } }, fakeToken('mG2'))).status === 403
    && (await raw('PATCH', '/rooms/mH?updateMask.fieldPaths=state', { fields: { state: { stringValue: 'play' } } }, fakeToken('mG2'))).status === 403);
  check('la rama 1v1 de entrar (guest/gname/state) no vale en una sala de varios', (await raw('PATCH', '/rooms/mH?updateMask.fieldPaths=guest&updateMask.fieldPaths=gname&updateMask.fieldPaths=state',
    { fields: { guest: { stringValue: 'mG4' }, gname: { stringValue: 'Gea' }, state: { stringValue: 'full' } } }, fakeToken('mG4'))).status === 403);
  const SRC = gitShow('js/netroom.js'), OLD = SRC && SRC.indexOf('joinMulti') < 0 ? loadNR(SRC) : null;
  if (OLD) {
    const O = OLD.create({ base, ver, auth: async () => ({ uid: 'mG4', token: fakeToken('mG4') }) });
    const oc = await code(O.join('mH', 'Gea')); rr = await H.get('mH');
    check('un cliente 1.21.0 (js/netroom.js de HEAD) que intente entrar en una sala de varios no la estropea', oc !== 'ok' && rr.guest === '' && rr.nseat === 2, oc);
  }
  check('G4 entra en la plaza que dejó G3', (await G[3].joinMulti('mH', 'Gea')).seats.mG4.n === 'Gea');

  // --- el anfitrión ---
  let b = await H.beat({ cnt: 3 });
  check('latido del anfitrión con cnt: los invitados siguen', b && b.cnt === 3 && b.nseat === 3 && b.age < 3000);
  check('cnt fuera de rango (> cap-1) rechazado', await code(H.beat({ cnt: 4 })) === 'denied' && await code(H.beat({ cnt: -1 })) === 'denied');
  check('el anfitrión no puede pasar de cap-1 invitados (seats a mano) ni poner un cap/mode que no cuadra',
    await code(H.beat({ seats: { a1: { n: 'A' }, a2: { n: 'B' }, a3: { n: 'C' }, a4: { n: 'D' } } })) === 'denied'
    && await code(H.beat({ cap: 12 })) === 'denied' && await code(H.beat({ mode: 'coop' })) === 'denied' && await code(H.beat({ guest: 'mG1' })) === 'denied');
  b = await H.beat({ state: 'full' });
  await G[1].leaveMulti('mH');
  rr = await H.get('mH');
  check('con la sala en «full» nadie entra, pero se puede salir', b.state === 'full' && rr.nseat === 2 && await code(G[4].joinMulti('mH', 'Goya')) === 'full'
    && (await sit('mG5', 'mH', { mG5: seat('Goya') })).status === 403);
  await H.beat({ state: 'open' });
  await G[1].joinMulti('mH', 'Gala');
  const rkck = await H.kick('mG2');
  check('el anfitrión levanta a un invitado (kick) y lo apunta en ban', rkck && !rkck.seats.mG2 && rkck.nseat === 2 && rkck.age < 3000 && rkck.ban && rkck.ban.mG2 === true, rkck && [Object.keys(rkck.seats), rkck.ban]);
  check('a quien sacan no puede volver a sentarse (cliente «kicked» y reglas 403); los demás sí', await code(G[1].joinMulti('mH', 'Gala')) === 'kicked'
    && (await sit('mG2', 'mH', { mG2: seat('Gala') })).status === 403 && (await G[3].joinMulti('mH', 'Gea')).seats.mG4.n === 'Gea');
  check('nadie más que el anfitrión toca ban (un invitado no se quita el veto ni veta a otro)',
    (await sit('mG2', 'mH', { mG2: seat('Gala') }, { extra: { ban: { mapValue: { fields: {} } } }, mask: ['ban'] })).status === 403
    && (await sit('mG5', 'mH', { mG5: seat('Goya') }, { extra: { ban: { mapValue: { fields: { mG4: { booleanValue: true } } } } }, mask: ['ban.`mG4`'] })).status === 403);
  await G[2].joinMulti('mH', 'Gus');   // (la plaza que dejó G2: siguen 3 invitados)

  // --- señalización por pareja ---
  zero('mH'); zero('mG4');
  await H.putSig('mH', 'offer', { sdp: 'OFERTA-G4 c=IN IP4 1.2.3.4', gen: 1 }, 'mG4');
  const o4 = await G[3].getSig('mH', 'offer', 'mG4');
  await G[3].putSig('mH', 'answer', { sdp: 'RESPUESTA-G4 c=IN IP4 5.6.7.8', gen: 1 }, 'mG4');
  const a4 = await H.getSig('mH', 'answer', 'mG4');
  await H.delSig('mH', 'mG4');
  const ch = cnt('mH'), cg = cnt('mG4');
  check('pareja anfitrión↔G4: oferta o_mG4 y respuesta a_mG4 (to/uid = G4)', o4 && o4.sdp.startsWith('OFERTA-G4') && o4.gen === 1 && o4.to === 'mG4'
    && a4 && a4.sdp.startsWith('RESPUESTA-G4') && a4.uid === 'mG4', [o4, a4]);
  check('al abrir el enlace se borran las dos', await st('/rooms/mH/sig/o_mG4') === 404 && await st('/rooms/mH/sig/a_mG4') === 404);
  check('una pareja cuesta: anfitrión 1 escritura + 1 lectura + 2 borrados, invitado 1 lectura + 1 escritura (con una sola consulta cada uno)',
    ch.w === 1 && ch.r === 1 && ch.d === 2 && cg.r === 1 && cg.w === 1 && cg.d === 0, { anfitrion: ch, invitado: cg });
  {
    // resumen por invitado (una consulta de cada lado; cada sondeo de más del lobby suma 1 lectura + 1 de las reglas en la señalización)
    const R = c1.r + ch.r + cg.r, Rr = ch.rr + cg.rr, Wr = c1.w + ch.w + cg.w, D = ch.d;
    console.log('  info  por invitado (entrar + una pareja): ' + R + ' lecturas de documento + ' + Rr + ' lecturas de las reglas (get de la sala en sig) = '
      + (R + Rr) + ' lecturas, ' + Wr + ' escrituras, ' + D + ' borrados; sala de 12: ×11 = ' + (R + Rr) * 11 + ' lecturas, ' + Wr * 11 + ' escrituras, ' + D * 11
      + ' borrados (sin los sondeos del lobby ni el latido del anfitrión: ver «Ciclo de vida» más abajo)');
  }
  await H.putSig('mH', 'offer', { sdp: 'OFERTA-G1', gen: 2 }, 'mG1');
  await G[0].putSig('mH', 'answer', { sdp: 'RESPUESTA-G1', gen: 2 }, 'mG1');
  check('otro invitado (G2) NO lee la oferta ni la respuesta de G1', (await G[1].getSig('mH', 'offer', 'mG1')) === null && (await G[1].getSig('mH', 'answer', 'mG1')) === null
    && (await raw('GET', '/rooms/mH/sig/o_mG1', null, fakeToken('mG2'))).status === 403 && (await raw('GET', '/rooms/mH/sig/a_mG1', null, fakeToken('mG2'))).status === 403);
  check('… ni alguien de fuera', (await raw('GET', '/rooms/mH/sig/o_mG1', null, fakeToken('mX'))).status === 403 && (await raw('GET', '/rooms/mH/sig/a_mG1', null, fakeToken('mX'))).status === 403);
  check('G1 lee su oferta; el anfitrión su respuesta', (await G[0].getSig('mH', 'offer', 'mG1')).sdp === 'OFERTA-G1' && (await H.getSig('mH', 'answer', 'mG1')).sdp === 'RESPUESTA-G1');
  check('oferta para alguien que no está sentado: rechazada', await code(H.putSig('mH', 'offer', { sdp: 'x', gen: 1 }, 'mG5')) === 'denied');
  check('G1 no escribe la respuesta de otro, ni ofertas, ni G2 la de G1', await code(G[0].putSig('mH', 'answer', { sdp: 'x', gen: 1 }, 'mG2')) === 'denied'
    && await code(G[0].putSig('mH', 'offer', { sdp: 'x', gen: 1 }, 'mG1')) === 'denied' && await code(G[1].putSig('mH', 'answer', { sdp: 'x', gen: 1 }, 'mG1')) === 'denied');
  check('un invitado sin sentar no escribe respuesta', await code(G[4].putSig('mH', 'answer', { sdp: 'x', gen: 1 }, 'mG5')) === 'denied');
  check('pareja: un campo de más (to/uid), SDP > 20 000 o gen < 0: rechazados',
    (await raw('PATCH', '/rooms/mH/sig/o_mG1', { fields: { sdp: { stringValue: 'x' }, gen: { integerValue: '1' }, to: { stringValue: 'mG1' } } }, fakeToken('mH'))).status === 403
    && await code(H.putSig('mH', 'offer', { sdp: 'x'.repeat(20001), gen: 3 }, 'mG1')) === 'denied'
    && (await raw('PATCH', '/rooms/mH/sig/o_mG1', { fields: { sdp: { stringValue: 'x' }, gen: { integerValue: '-1' } } }, fakeToken('mH'))).status === 403);
  check('los documentos 1v1 offer/answer no valen en una sala de varios', await code(G[0].putSig('mH', 'answer', { sdp: 'x', gen: 1 })) === 'denied'
    && await code(H.putSig('mH', 'offer', { sdp: 'x', gen: 1, to: 'mG1' })) === 'denied');
  check('alguien de fuera no borra la señalización de una sala viva', (await raw('DELETE', '/rooms/mH/sig/o_mG1', null, fakeToken('mX'))).status === 403
    && (await raw('DELETE', '/rooms/mH/sig/a_mG1', null, fakeToken('mG2'))).status === 403);
  await G[0].leaveMulti('mH');
  check('G1 se levanta: su respuesta se borra', await st('/rooms/mH/sig/a_mG1') === 404);
  await raw('PATCH', '/rooms/mH/sig/a_mG1', { fields: { sdp: { stringValue: 'VIEJA' }, gen: { integerValue: '2' } } });
  check('… y una respuesta que se quedó ya no la lee el anfitrión (G1 no está sentado)', (await H.getSig('mH', 'answer', 'mG1')) === null);
  check('… pero G1 puede borrar las suyas aunque ya no esté sentado', (await raw('DELETE', '/rooms/mH/sig/a_mG1', null, fakeToken('mG1'))).status === 200
    && (await raw('DELETE', '/rooms/mH/sig/o_mG1', null, fakeToken('mG1'))).status === 200);

  // --- jugando ---
  await G[0].joinMulti('mH', 'Gil');
  await H.beat({ state: 'play' });
  await G[0].leaveMulti('mH');
  rr = await H.get('mH');
  check('en «play» un invitado no se levanta (la vuelta tras recargar necesita la plaza) y nadie entra', rr.seats.mG1 && rr.state === 'play' && await code(G[4].joinMulti('mH', 'Goya')) === 'full');
  const okP = await H.putSig('mH', 'offer', { sdp: 'o-play', gen: 7 }, 'mG1').then(() => true, e => e.code);
  const G1b = mk('mG1');   // (la página recargada del invitado: cliente nuevo, misma cuenta)
  const okA = await G1b.putSig('mH', 'answer', { sdp: 'a-play', gen: 7 }, 'mG1').then(() => true, e => e.code);
  check('en «play» la señalización de vuelta sigue cabiendo (nueva oferta gen+1 y respuesta)', okP === true && okA === true && (await G1b.getSig('mH', 'offer', 'mG1')).gen === 7);
  const H2 = mk('mH'), rres = await H2.resume(), bres = await H2.beat();
  check('el anfitrión que recarga retoma su sala de varios (invitados y cap) y late', rres && rres.multi && rres.cap === 4 && rres.nseat === 3 && bres && bres.nseat === 3 && bres.state === 'play' && bres.age < 3000);
  await H2.close();
  check('cerrar la sala de varios borra la sala y la señalización de todos sus invitados', await st('/rooms/mH') === 404 && await st('/rooms/mH/sig/o_mG1') === 404 && await st('/rooms/mH/sig/a_mG1') === 404);

  // --- límites: 6v6 con 12 plazas y coop con 2 ---
  {
    const g12 = Array.from({ length: 12 }, (_, i) => mk('s' + String(i).padStart(2, '0')));
    let ok11 = 0; for (let i = 0; i < 11; i++) { const r = await g12[i].joinMulti('mS', 'J' + i).catch(e => e.code); if (r && r.seats) ok11++; }
    rr = await S.get('mS');
    check('6v6: entran 11 invitados (12 humanos con el anfitrión)', ok11 === 11 && rr.nseat === 11 && rr.free === 0, ok11);
    check('6v6: el duodécimo invitado no cabe (cliente y reglas)', await code(g12[11].joinMulti('mS', 'J11')) === 'full' && (await sit('s11', 'mS', { s11: seat('J11') })).status === 403);
    await S.close();
    check('6v6: cerrar borra la sala', await st('/rooms/mS') === 404);
    const C1 = mk('mC1'), C2 = mk('mC2');
    const kc = await C1.byCode(rk.code);
    const j1 = await C1.join(kc && kc.id, 'Ceci');
    check('coop de 2: por código (byCode + join, estado «coop») entra uno y el segundo no cabe', j1 && j1.nseat === 1 && j1.state === 'coop' && await code(C2.joinMulti('mK', 'Cora')) === 'full');
    await C1.leaveMulti('mK');
    check('(L3) en «coop» el invitado se levanta y vuelve a sentarse', (await K.get('mK')).nseat === 0 && (await C1.joinMulti('mK', 'Ceci')).nseat === 1);
    await K.beat({ state: 'full' });
    check('(L3) coop emparejada («full»): nadie más entra', await code(C2.joinMulti('mK', 'Cora')) === 'full');
    await K.close();
  }

  // --- reabrir, pagehide y limpieza ---
  {
    const R = mk('mR'), RG = mk('mRg');
    await R.open({ name: 'Rita', cap: 4 });
    await RG.joinMulti('mR', 'Rui');
    await R.putSig('mR', 'offer', { sdp: 'o', gen: 1 }, 'mRg'); await RG.putSig('mR', 'answer', { sdp: 'a', gen: 1 }, 'mRg');
    const R2 = mk('mR');   // (recarga del anfitrión sin cerrar: cliente nuevo que no conoce a sus invitados)
    const ro = await R2.open({ name: 'Rita', cap: 4 });
    check('reabrir una sala de varios: sin invitados y sin la señalización de la sesión anterior', ro.nseat === 0 && await st('/rooms/mR/sig/o_mRg') === 404 && await st('/rooms/mR/sig/a_mRg') === 404);
    await RG.joinMulti('mR', 'Rui'); await RG.putSig('mR', 'answer', { sdp: 'a', gen: 2 }, 'mRg');
    RG.bye('guest', 'mR'); await sleep(600);
    rr = await R2.get('mR');
    check('pestaña cerrada (pagehide) de un invitado: plaza libre y su respuesta borrada', rr && rr.nseat === 0 && await st('/rooms/mR/sig/a_mRg') === 404);
    const RG2 = mk('mRg'); await RG2.joinMulti('mR', 'Rui');
    await R2.beat();   // (el anfitrión ve al invitado en su latido)
    await R2.putSig('mR', 'offer', { sdp: 'o', gen: 3 }, 'mRg'); await RG2.putSig('mR', 'answer', { sdp: 'a', gen: 3 }, 'mRg');
    R2.bye('host'); await sleep(600);
    check('pestaña cerrada (pagehide) del anfitrión: sala y señalización por pareja borradas', await st('/rooms/mR') === 404 && await st('/rooms/mR/sig/o_mRg') === 404 && await st('/rooms/mR/sig/a_mRg') === 404);
    const RG3 = mk('mRg'); await R.open({ name: 'Rita', cap: 4 }); await RG3.joinMulti('mR', 'Rui');
    const RG4 = mk('mRg');   // (recargó: este cliente no sabe que estaba sentado, el lobby se lo dice con el tercer argumento)
    await RG4.get('mR'); RG4.bye('guest', 'mR', true); await sleep(600);
    check('bye(guest, id, true) de un invitado que retomó su plaza tras recargar la libera', (await R.get('mR')).nseat === 0);
    await R.close();
    // (un cliente 1.21.0 barre la sala de varios caducada con su _sweep viejo: borra la sala, sig/offer y sig/answer, pero no las o_/a_;
    //  el anfitrión, al reabrir tras recargar, las borra igual porque las apuntó en el almacén del navegador)
    {
      const LS = {}, ls = { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } };
      const mkS = uid => NR.create({ base, ver, store: ls, auth: async () => ({ uid, token: fakeToken(uid) }) });
      const RS = mkS('mR'), RSG = mk('mRg');
      await RS.open({ name: 'Rita', cap: 4 }); await RSG.joinMulti('mR', 'Rui'); await RS.beat();
      await RS.putSig('mR', 'offer', { sdp: 'o-vieja', gen: 1 }, 'mRg'); await RSG.putSig('mR', 'answer', { sdp: 'a-vieja', gen: 1 }, 'mRg');
      await raw('DELETE', '/rooms/mR/sig/offer'); await raw('DELETE', '/rooms/mR/sig/answer'); await raw('DELETE', '/rooms/mR');   // (el _sweep de 1.21.0)
      const left = await st('/rooms/mR/sig/o_mRg') === 200 && await st('/rooms/mR/sig/a_mRg') === 200;
      const RS2 = mkS('mR'); await RS2.open({ name: 'Rita', cap: 4 });   // (recarga: cliente nuevo, mismo navegador)
      await RSG.joinMulti('mR', 'Rui');
      check('cliente viejo barre la sala de varios y el anfitrión la reabre: sin o_/a_ huérfanas (la SDP vieja no se lee)', left
        && await st('/rooms/mR/sig/o_mRg') === 404 && await st('/rooms/mR/sig/a_mRg') === 404 && (await RSG.getSig('mR', 'offer', 'mRg')) === null && !LS['make-the-cut.netroom.pairs'], { left, LS });
      await RS2.close();
    }
    // caducadas: una 'play' (sweep) y una 'open' (de paso al listar), con señalización por pareja
    const oldM = (uid, state) => W({ host: { stringValue: uid }, state: { stringValue: state }, seats: { mapValue: { fields: { ['q' + uid]: { mapValue: { fields: { n: { stringValue: 'Q' }, at: { timestampValue: new Date().toISOString() } } } } } } },
      seen: { timestampValue: new Date(Date.now() - 600000).toISOString() } });
    for (const [u, s] of [['mE1', 'play'], ['mE2', 'open']]) {
      await raw('PATCH', '/rooms/' + u, { fields: oldM(u, s) });
      await raw('PATCH', '/rooms/' + u + '/sig/o_q' + u, { fields: { sdp: { stringValue: 'x' }, gen: { integerValue: '1' } } });
      await raw('PATCH', '/rooms/' + u + '/sig/a_q' + u, { fields: { sdp: { stringValue: 'x' }, gen: { integerValue: '1' } } });
    }
    await X.sweep(); await X.list(); await sleep(600);
    check('limpieza: las salas de varios caducadas se borran con la señalización de sus invitados (sweep y lista)',
      await st('/rooms/mE1') === 404 && await st('/rooms/mE1/sig/o_qmE1') === 404 && await st('/rooms/mE1/sig/a_qmE1') === 404
      && await st('/rooms/mE2') === 404 && await st('/rooms/mE2/sig/o_qmE2') === 404 && await st('/rooms/mE2/sig/a_qmE2') === 404);
  }

  // --- combinaciones que las reglas no aceptan (creación a mano) ---
  check('sala de varios bien hecha (y con lineup) aceptada', await fxM(goodM) === 200 && await fxM(W({ lineup: { stringValue: '{"t":[[1,2],[3,4]]}' } })) === 200);
  check('2v2 con 12 plazas, cap 3 o mode raro: rechazadas', await fxM(W({ cap: { integerValue: '12' } })) === 403 && await fxM(W({ cap: { integerValue: '3' } })) === 403
    && await fxM(W({ mode: { stringValue: 'liga' } })) === 403);
  check('6v6 en playa rechazada; 6v6 en Pabellón con 12 aceptada', await fxM(W({ fmt: { stringValue: '6v6' }, cap: { integerValue: '12' } })) === 403
    && await fxM(W({ fmt: { stringValue: '6v6' }, cap: { integerValue: '12' }, venue: { stringValue: 'hall' } })) === 200);
  check('coop: 2 plazas sí; 4 solo en 6v6; 12 nunca', await fxM(W({ mode: { stringValue: 'coop' }, state: { stringValue: 'coop' }, cap: { integerValue: '2' } })) === 200
    && await fxM(W({ mode: { stringValue: 'coop' }, state: { stringValue: 'coop' }, cap: { integerValue: '4' } })) === 403
    && await fxM(W({ mode: { stringValue: 'coop' }, state: { stringValue: 'coop' }, cap: { integerValue: '4' }, fmt: { stringValue: '6v6' }, venue: { stringValue: 'hall' } })) === 200
    && await fxM(W({ mode: { stringValue: 'coop' }, state: { stringValue: 'coop' }, cap: { integerValue: '12' }, fmt: { stringValue: '6v6' }, venue: { stringValue: 'hall' } })) === 403);
  // (L3) una coop nunca 'open' (los 1.21.0 en caché listan y buscan por código solo 'open') y 'coop' solo en las coop
  check('coop en «open» rechazada (un 1.21.0 la vería); vs en «coop» rechazada; sala 1v1 en «coop» rechazada',
    await fxM(W({ mode: { stringValue: 'coop' }, cap: { integerValue: '2' } })) === 403 && await fxM(W({ state: { stringValue: 'coop' } })) === 403
    && (await raw('POST', ':commit', { writes: [{ update: { name: docRoot + '/rooms/mC', fields: Object.assign(Object.fromEntries(Object.entries(goodM).filter(([k]) => ['mode', 'cap', 'seats', 'cnt'].indexOf(k) < 0)), { host: { stringValue: 'mC' }, state: { stringValue: 'coop' } }) },
      updateTransforms: [{ fieldPath: 'seen', setToServerValue: 'REQUEST_TIME' }] }] }, fakeToken('mC'))).status === 403);
  check('net «host»: 6v6 (vs o coop de 4) y vs 2v2 de 4 sí; 2v2 de 2, coop 2v2 o net raro no',
    await fxM(W({ fmt: { stringValue: '6v6' }, venue: { stringValue: 'hall' }, cap: { integerValue: '12' }, net: { stringValue: 'host' } })) === 200
    && await fxM(W({ mode: { stringValue: 'coop' }, state: { stringValue: 'coop' }, fmt: { stringValue: '6v6' }, venue: { stringValue: 'hall' }, cap: { integerValue: '4' }, net: { stringValue: 'host' } })) === 200
    && await fxM(W({ net: { stringValue: 'host' } })) === 200 && await fxM(W({ cap: { integerValue: '2' }, net: { stringValue: 'host' } })) === 403
    && await fxM(W({ mode: { stringValue: 'coop' }, state: { stringValue: 'coop' }, cap: { integerValue: '2' }, net: { stringValue: 'host' } })) === 403 && await fxM(W({ net: { stringValue: 'rara' } })) === 403);
  check('Fluida solo en vs con 2 plazas', await fxM(W({ cap: { integerValue: '2' }, net: { stringValue: 'fluida' } })) === 200 && await fxM(W({ net: { stringValue: 'fluida' } })) === 403
    && await fxM(W({ mode: { stringValue: 'coop' }, state: { stringValue: 'coop' }, cap: { integerValue: '2' }, net: { stringValue: 'fluida' } })) === 403
    && await fxM(W({ fmt: { stringValue: '6v6' }, venue: { stringValue: 'hall' }, cap: { integerValue: '2' }, net: { stringValue: 'fluida' } })) === 403
    && await fxM(W({ fmt: { stringValue: '6v6' }, venue: { stringValue: 'hall' }, cap: { integerValue: '2' } })) === 200);
  check('al crear: invitados ya sentados, cnt ≠ 0, guest/gname con algo o estado ≠ open: rechazadas',
    await fxM(W({ seats: { mapValue: { fields: { x: { mapValue: { fields: { n: { stringValue: 'X' } } } } } } } })) === 403 && await fxM(W({ cnt: { integerValue: '1' } })) === 403
    && await fxM(W({ guest: { stringValue: 'mG1' } })) === 403 && await fxM(W({ gname: { stringValue: 'Gil' } })) === 403 && await fxM(W({ state: { stringValue: 'full' } })) === 403);
  check('campos de más, sin cnt, seats que no es un mapa o lineup > 4000: rechazadas', await fxM(W({ mail: { stringValue: 'a@b.c' } })) === 403
    && await fxM(Object.fromEntries(Object.entries(goodM).filter(([k]) => k !== 'cnt'))) === 403 && await fxM(W({ seats: { stringValue: '{}' } })) === 403
    && await fxM(W({ lineup: { stringValue: 'x'.repeat(4001) } })) === 403);
  check('nadie crea una sala de varios con el uid de otro', (await raw('POST', ':commit', { writes: [{ update: { name: docRoot + '/rooms/mOtro', fields: W({ host: { stringValue: 'mOtro' } }) },
    updateTransforms: [{ fieldPath: 'seen', setToServerValue: 'REQUEST_TIME' }] }] }, fakeToken('mC'))).status === 403);
}


/* ---------- 1c) un cliente 1.21.0 en caché frente a las salas coop (L3) ---------- */
async function oldVsCoop(base, OLD) {
  const verNew = '3|test';
  const K = NR.create({ base, ver: verNew, auth: async () => ({ uid: 'oK', token: fakeToken('oK') }) });
  const O = OLD.create({ base, ver: '2|viejo', auth: async () => ({ uid: 'oOld', token: fakeToken('oOld') }) });
  const V = NR.create({ base, ver: verNew, auth: async () => ({ uid: 'oV', token: fakeToken('oV') }) });
  const rk = await K.open({ name: 'Kai', mode: 'coop', cap: 2 }), rv = await V.open({ name: 'Vera', mode: 'vs', cap: 4 });
  const L = await O.list();
  check('cliente 1.21.0: la sala coop NO sale en su lista (la vs de 4 sí, como «otra versión»)', !L.some(r => r.id === 'oK') && L.some(r => r.id === 'oV' && r.other), L.map(r => [r.id, r.other]));
  check('cliente 1.21.0: el código de una coop no le lleva a ninguna sala', (await O.byCode(rk.code)) === null);
  check('cliente 1.21.0: tampoco entra en la coop (ni con el id)', await code(O.join('oK', 'Viejo')) !== 'ok' && (await K.get('oK')).nseat === 0 && (await K.get('oK')).guest === '');
  await K.close(); await V.close();
}
/** --life-ref <ref>: el ciclo de vida con el lobby, la sala y las reglas de ese commit (otro emulador). */
async function lifeRef(jar) {
  if (!LIFE_REF || !jar) return;
  const src = { room: gitShow('js/netroom.js', LIFE_REF), lobby: gitShow('js/netlobby.js', LIFE_REF) }, rules = gitShow('firebase/firestore.rules', LIFE_REF);
  if (!src.room || !src.lobby || !rules) { console.log('\n(--life-ref ' + LIFE_REF + ': no se pueden leer los ficheros de ese commit)'); return; }
  const rp = path.join(os.tmpdir(), 'mtc-rules-ref.rules'); fs.writeFileSync(rp, rules);
  const P6 = PORT + 4;
  const j6 = spawn('java', ['-Xmx384m', '-jar', jar, '--host', '127.0.0.1', '--port', String(P6), '--rules', rp, '--project_id', PROJECT], { stdio: 'ignore', windowsHide: true });
  process.on('exit', () => killTree(j6));
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { await sleep(500); try { up = (await fetch('http://127.0.0.1:' + P6 + '/')).status < 500; } catch (e) { } }
  if (up) await lifeCycle(src, P6, LIFE_REF, false); else console.log('\n(--life-ref: el emulador no arranca)');
  killTree(j6);
}

/* ---------- 6) ciclo de vida de cada tipo de sala: lecturas y escrituras de Firestore (L3, 22-nov-2026) ----------
 * El lobby DE VERDAD (js/netroom.js + js/netlobby.js en un contexto vm por jugador, como tools/lobbytest.js) contra el emulador, con
 * un WebRTC de mentira y un RELOJ VIRTUAL (Date, setTimeout/setInterval y performance de cada página): 10 min de partido tardan unos
 * segundos. Por tipo de sala (1v1, 2v2 × 4, 6v6 × 12, coop) y por fase: W = el anfitrión solo esperando (1 min), Wh = 1 min más con
 * la pestaña oculta, J = entrar (uno cada 2 s) y conectar, R = sala llena con los enlaces abiertos (1 min), P = partido (10 min; en la
 * coop, la sesión de la Carrera emparejada), E = fin. Lecturas = GET de documento + filas de runQuery (mínimo 1) + 1 por cada petición
 * de señalización (las reglas de sig leen la sala con get()/exists()). Escrituras = commit/PATCH. Comprueba que, con los enlaces
 * abiertos, nadie más lee Firestore salvo el latido del anfitrión. --life-ref <ref> mide también el lobby y las reglas de ese commit
 * (el «antes»), en un emulador aparte. */
function lifeHub(clock) {
  const reg = new Map(); let n = 0;
  function FakeLink(o) { this.onstate = o && typeof o.onstate === 'function' ? o.onstate : null; this.onclose = null; this.q = []; this.pend = []; this.state = 'new'; this.opens = 0; this.peer = null; }
  const P = FakeLink.prototype;
  P._set = function (s) { if (this.state === s || this.state === 'closed') return; this.state = s; if (this.onstate) { try { this.onstate(s); } catch (e) { console.error(e); } } };
  P.offer = function () { this.peer = null; this._set('connecting'); const sdp = 'O' + (++n); reg.set(sdp, this); return Promise.resolve(sdp); };
  P.answer = function (sdp) { const off = reg.get(sdp); this._set('connecting'); if (!off) return Promise.reject(new Error('sin oferta')); const a = 'A' + (++n); reg.set(a, this); this._off = off; return Promise.resolve(a); };
  P.accept = function (sdp) { const ans = reg.get(sdp); if (!ans || ans._off !== this) return Promise.reject(new Error('respuesta rara')); this.peer = ans; ans.peer = this; clock.setTimeout(() => { this._open(); ans._open(); }, 20); return Promise.resolve(); };
  P._open = function () { this.opens++; this._set('open'); const p = this.pend; this.pend = []; p.forEach(d => this._deliver('ctl', d)); };
  P._deliver = function (ch, d) { const pr = this.peer; if (!pr || pr.state === 'closed') return; clock.setTimeout(() => { if (pr.peer === this) pr.q.push({ ch, data: d }); }, 4); };
  P.send = function (ch, d) { if (this.state === 'closed') return; if (this.state === 'open' && this.peer) { this._deliver(ch, d); return; } if (ch === 'ctl' && this.pend.length < 400) this.pend.push(d); };
  P.poll = function () { const o = this.q; this.q = []; return o; };
  P.info = function () { return { type: 'host', rtt: 12, opens: this.opens, rtype: 'host', proto: 'udp', relayProto: '' }; };
  P.close = function () { if (this.state === 'closed') return; const pr = this.peer; this._set('closed'); this.q = []; const f = this.onclose; this.onclose = null; if (f) f(); if (pr && pr.peer === this) clock.setTimeout(() => pr._set('down'), 30); };
  return { FakeLink };
}
/** Reloj virtual común a todas las páginas: los temporizadores solo avanzan cuando no hay ninguna petición al emulador en vuelo. */
function lifeClock() {
  const q = []; let seq = 0;
  const C = { now: Date.now(), inflight: 0 };
  const add = (fn, ms, every, args) => { const id = ++seq; ms = Math.max(0, +ms || 0); q.push({ id, at: C.now + ms, fn, every: every ? Math.max(1, ms) : 0, args: args || [] }); return id; };
  C.setTimeout = (fn, ms, ...a) => add(fn, ms, false, a);
  C.setInterval = (fn, ms, ...a) => add(fn, ms, true, a);
  C.clear = id => { const i = q.findIndex(x => x.id === id); if (i >= 0) q.splice(i, 1); };
  C.settle = async () => { let idle = 0; for (let k = 0; k < 20000 && idle < 3; k++) { await new Promise(r => setImmediate(r)); idle = C.inflight ? 0 : idle + 1; } };
  C.advance = async ms => {
    const end = C.now + ms;
    for (;;) {
      await C.settle();
      let nx = null; for (const x of q) if (!nx || x.at < nx.at || (x.at === nx.at && x.id < nx.id)) nx = x;
      if (!nx || nx.at > end) { C.now = end; return; }
      C.now = Math.max(C.now, nx.at);
      if (nx.every) nx.at += nx.every; else q.splice(q.indexOf(nx), 1);
      try { nx.fn.apply(null, nx.args); } catch (e) { console.error(e); }
    }
  };
  C.until = async (f, ms) => { const end = C.now + ms; while (C.now < end) { let v = false; try { v = f(); } catch (e) { } if (v) return true; await C.advance(50); } return false; };
  return C;
}
function lifePage(clock, hub, src, port, name, uid) {
  const vm = require('vm');
  const store = {}, n = { r: 0, w: 0, d: 0 }, started = [], vis = [];
  const RD = Date;
  function VDate(...a) { if (!new.target) return new RD(clock.now).toString(); return a.length ? new RD(...a) : new RD(clock.now); }
  VDate.now = () => clock.now; VDate.parse = RD.parse; VDate.UTC = RD.UTC; VDate.prototype = RD.prototype;
  const mkLS = s => ({ getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } });
  const el = () => ({ style: {}, hidden: true, innerHTML: '', setAttribute() { }, getAttribute() { return null; }, removeAttribute() { }, addEventListener() { }, appendChild() { }, querySelector() { return null; }, querySelectorAll() { return []; }, classList: { add() { }, remove() { }, contains() { return false; } } });
  const doc = { hidden: false, visibilityState: 'visible', getElementById: () => null, createElement: () => el(), head: el(), body: el(), querySelectorAll: () => [], documentElement: el(),
    addEventListener(t, f) { if (t === 'visibilitychange') vis.push(f); } };
  const lfetch = (u, op) => {
    const m = (op && op.method) || 'GET', sig = /\/sig\//.test(u);
    if (m === 'GET') n.r++; else if (m === 'DELETE') n.d++; else if (!/:runQuery$/.test(u)) n.w++;
    if (sig) n.r++;   // (las reglas de sig leen la sala)
    clock.inflight++;
    return fetch(u, op).then(r => r.text().then(t => {
      clock.inflight--;
      if (/:runQuery$/.test(u)) { let k = 0; try { k = JSON.parse(t).filter(x => x && x.document).length; } catch (e) { } n.r += Math.max(1, k); }
      return { ok: r.ok, status: r.status, text: async () => t, json: async () => JSON.parse(t) };
    }), e => { clock.inflight--; throw e; });
  };
  const c = {
    console, btoa, atob, URLSearchParams, URL, TextEncoder, Date: VDate,
    setTimeout: clock.setTimeout, setInterval: clock.setInterval, clearTimeout: clock.clear, clearInterval: clock.clear, performance: { now: () => clock.now },
    fetch: lfetch, navigator: {}, localStorage: mkLS(store), sessionStorage: mkLS({}), addEventListener() { }, removeEventListener() { },
    location: { search: '?netemu=' + port + '&netuid=' + uid + '&name=' + encodeURIComponent(name) + '&netice=none', protocol: 'http:', hostname: 'localhost', origin: 'http://localhost', pathname: '/index.html' },
    document: doc
  };
  c.window = c; c.globalThis = c; c.self = c;
  c.VB = { VERSION: '9.9.9', Net: { PROTO: 7 }, NetRtc: { Link: function (lo) { return new hub.FakeLink(lo); }, supported: () => true },
    ctx: { state: 'menu', settings: {}, actions: { startOnline: so => { started.push(so); return true; } } } };
  vm.createContext(c);
  vm.runInContext(src.room, c, { filename: 'netroom.js' });
  vm.runInContext(src.lobby, c, { filename: 'netlobby.js' });
  return { name, uid, NL: c.VB.NetLobby, n, started, st: () => c.VB.NetLobby._state(), snap: () => Object.assign({}, n),
    hide: h => { doc.hidden = !!h; doc.visibilityState = h ? 'hidden' : 'visible'; vis.forEach(f => { try { f(); } catch (e) { } }); } };
}
const lifeDiff = (a, b) => ({ r: b.r - a.r, w: b.w - a.w, d: b.d - a.d });
const lifeSum = L => L.reduce((a, x) => ({ r: a.r + x.r, w: a.w + x.w, d: a.d + x.d }), { r: 0, w: 0, d: 0 });
/** Un tipo de sala de punta a punta. → {phases: {open, W, Wh, J, R, P, E}: {host, guest (el primero), guests (todos)}} o {err} */
async function lifeRun(kind, src, port) {
  const clock = lifeClock(), hub = lifeHub(clock);
  const nG = kind === '6v6' ? 11 : kind === '2v2' ? 3 : 1, tag = kind.replace(/\W/g, '');
  const H = lifePage(clock, hub, src, port, 'Ana Host', 'lf' + tag + 'H');
  const G = []; for (let i = 0; i < nG; i++) G.push(lifePage(clock, hub, src, port, 'Invitado ' + (i + 1), 'lf' + tag + 'G' + i));
  const all = [H].concat(G), ph = {};
  let mark = all.map(p => p.snap());
  const cut = k => { const now = all.map(p => p.snap()), d = now.map((s, i) => lifeDiff(mark[i], s)); mark = now; ph[k] = { host: d[0], guest: d[1], guests: lifeSum(d.slice(1)) }; };
  const coop = kind === 'coop', got = { h: null, g: null };
  if (coop) H.NL.coop.host({ title: 'Carrera', name: 'Ana Host', look: null, venue: 'beach', onReady: i => { got.h = i; }, onClose: () => { } });
  else H.NL._act('create', { fmt: kind === '6v6' ? '6v6' : kind === '2v2' ? '2v2' : '1v1', venue: 'beach', bo: 1 });
  const opened = await clock.until(() => coop ? !!H.NL.coop.state().code : H.st().view === 'room', 20000);
  if (!opened) return { err: 'no se abre la sala: ' + JSON.stringify(H.st().msg || '') };
  cut('open');
  await clock.advance(60000); cut('W');
  H.hide(true); await clock.advance(60000); H.hide(false); await clock.advance(10); cut('Wh');
  const code = coop ? H.NL.coop.state().code : null;
  for (let i = 0; i < nG; i++) {
    if (coop) G[i].NL.coop.join({ code, name: 'Invitado 1', look: null, onReady: x => { got.g = x; }, onClose: () => { } });
    else G[i].NL._act('join', H.uid);
    await clock.advance(2000);
  }
  const linked = await clock.until(() => coop ? !!(got.h && got.g)
    : kind === '1v1' ? H.started.length && G[0].started.length
      : G.every(g => g.st().mx && g.st().mx.status === 'linked') && H.st().mx && H.st().mx.ro.m.filter(m => m.ok).length === nG + 1, 120000);
  if (!linked) return { err: 'no conectan' };
  if (kind === '2v2' || kind === '6v6') await clock.until(() => G.every(g => { const s = g.st(), m = s.mx && s.mx.ro.m.filter(x => x.u === g.uid)[0]; return m && m.c >= 0; }), 10000);
  cut('J');
  if (kind !== '1v1') { await clock.advance(60000); cut('R'); }
  if (kind === '2v2' || kind === '6v6') {
    G.forEach(g => g.NL._act('ready'));
    await clock.until(() => H.st().mx && H.st().mx.can && H.st().mx.can.ok, 10000);
    H.NL._act('start');
    if (!await clock.until(() => H.started.length && G.every(g => g.started.length), 20000)) return { err: 'no empieza' };
  }
  await clock.advance(10 * 60000); cut('P');
  // fin: main.js cierra los enlaces (coop: el compañero sale)
  if (coop) G[0].NL.coop.close();
  else if (kind === '1v1') { H.started[0].link.close(); G[0].started[0].link.close(); }
  else { H.started[0].links.forEach(k => k.close()); G.forEach(g => g.started[0] && g.started[0].links[0].close()); }
  await clock.advance(3000); cut('E');
  return { phases: ph };
}
async function lifeCycle(src, port, label, strict) {
  console.log('\nCiclo de vida de cada sala: lecturas/escrituras/borrados de Firestore [' + label + ']');
  console.log('  (W = anfitrión solo 1 min · Wh = 1 min con la pestaña oculta · J = entrar y conectar · R = sala llena con los enlaces abiertos 1 min ·');
  console.log('   P = 10 min de partido (coop: la Carrera emparejada) · E = fin · «invitados» = la suma de todos)');
  const f = x => (x.r + '/' + x.w + '/' + x.d).padStart(9), z = { r: 0, w: 0, d: 0 }, out = {};
  console.log('  sala   quién               W       Wh        J        R        P        E    total');
  for (const kind of ['1v1', '2v2', '6v6', 'coop']) {
    let res;
    try { res = await lifeRun(kind, src, port); } catch (e) { res = { err: String(e && e.stack || e) }; }
    out[kind] = res;
    if (res.err) { console.log('  ' + kind.padEnd(6) + ' ' + res.err); if (strict) check('ciclo de vida ' + kind + ' sin errores', false, res.err); continue; }
    const P = res.phases, ks = ['open', 'W', 'Wh', 'J', 'R', 'P', 'E'];
    for (const who of ['host', 'guest', 'guests']) {
      if (who === 'guests' && kind !== '2v2' && kind !== '6v6') continue;
      const tot = lifeSum(ks.filter(k => P[k]).map(k => P[k][who]));
      console.log('  ' + kind.padEnd(6) + ' ' + ({ host: 'anfitrión', guest: 'un invitado', guests: 'invitados' }[who]).padEnd(13) + ['W', 'Wh', 'J', 'R', 'P', 'E'].map(k => f(P[k] ? P[k][who] : z)).join('') + f(tot));
    }
    if (strict) {
      const R = P.R, Pm = P.P;
      if (R) check(kind + ': sala llena con los enlaces abiertos: en 1 min nadie lee Firestore (el anfitrión solo late, sin releer)', R.host.r === 0 && R.guests.r === 0 && R.guests.w === 0, { host: R.host, guests: R.guests });
      // (la única lectura del anfitrión es la del latido de «play» al empezar: levanta a quien se sentó en el último momento)
      if (kind !== '1v1') check(kind + ': 10 min de partido: los invitados no tocan Firestore; el anfitrión, un latido por minuto sin releer', Pm.guests.r + Pm.guests.w + Pm.guests.d === 0 && Pm.host.r <= 1 && Pm.host.w <= 11,
        { host: Pm.host, guests: Pm.guests });
      if (kind !== '1v1') check(kind + ': anfitrión solo y con la pestaña oculta: una lectura cada 6 s como mucho', P.Wh.host.r <= 12, P.Wh.host);
    }
  }
  return out;
}

(async () => {
  const t0 = Date.now();
  if (!LIFE_ONLY) await mockTests();
  const jar = NO_EMU ? null : findJar();
  let java = null;
  if (!jar) console.log('\n(sin emulador de Firestore: solo la lógica del cliente; instala el jar con `npx firebase-tools@13.29.1 setup:emulators:firestore`)');
  else {
    const rules = path.join(ROOT, 'firebase', 'firestore.rules');
    if (await portBusy(PORT) || await portBusy(PORT + 1)) { console.log('\nEl puerto ' + PORT + ' o ' + (PORT + 1) + ' ya está ocupado (¿un emulador de una pasada anterior?): ciérralo o usa --port N.'); process.exit(1); }
    java = spawn('java', ['-Xmx384m', '-jar', jar, '--host', '127.0.0.1', '--port', String(PORT), '--rules', rules, '--project_id', PROJECT], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let log = ''; java.stdout.on('data', d => { log += d; }); java.stderr.on('data', d => { log += d; });
    const kill = () => killTree(java);
    process.on('exit', kill);
    let up = false;
    for (let i = 0; i < 120 && !up; i++) { await sleep(500); try { const r = await fetch('http://127.0.0.1:' + PORT + '/'); up = r.status < 500; } catch (e) { } if (/error|exception/i.test(log) && /rules/i.test(log) && !up) break; }
    if (!up) { console.log(log.slice(-2000)); check('el emulador arranca con las reglas', false); }
    else {
      const base = 'http://127.0.0.1:' + PORT + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
      const wipe = () => fetch('http://127.0.0.1:' + PORT + '/emulator/v1/projects/' + PROJECT + '/databases/(default)/documents', { method: 'DELETE' }).catch(() => { });
      const SRCNOW = { room: fs.readFileSync(path.join(ROOT, 'js/netroom.js'), 'utf8'), lobby: fs.readFileSync(path.join(ROOT, 'js/netlobby.js'), 'utf8') };
      if (!LIFE_ONLY) {
        await wipe();
        try { await emuTests(base, NR); } catch (e) { check('pruebas del emulador sin excepciones', false, String(e && e.stack || e)); }
        await wipe();
        try { await emuMulti(base); } catch (e) { check('pruebas de salas de varios sin excepciones', false, String(e && e.stack || e)); }
      }
      if (!NO_LIFE) { await wipe(); try { await lifeCycle(SRCNOW, PORT, 'esta copia', true); } catch (e) { check('ciclo de vida sin excepciones', false, String(e && e.stack || e)); } }
      if (LIFE_ONLY) { kill(); await lifeRef(jar); console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)'); process.exit(fails ? 1 : 0); }
      // un cliente 1.21.0 en caché (js/netroom.js de la versión publicada) contra las reglas nuevas: las mismas pruebas 1v1 de siempre,
      // y no ve las salas coop (state 'coop') ni en la lista ni por código
      const SRC = gitShow('js/netroom.js');
      if (SRC && SRC.indexOf('joinMulti') < 0) {
        await wipe();
        console.log('\nCliente publicado (js/netroom.js de ' + PUB_REF.slice(0, 7) + ', 1v1) contra las reglas nuevas');
        try { await emuTests(base, loadNR(SRC)); } catch (e) { check('pruebas 1v1 con el cliente publicado sin excepciones', false, String(e && e.stack || e)); }
        await wipe();
        try { await oldVsCoop(base, loadNR(SRC)); } catch (e) { check('cliente publicado y salas coop sin excepciones', false, String(e && e.stack || e)); }
      } else console.log('\n(la versión publicada ya trae el cliente de varios o no hay git: se omite la pasada con el cliente 1v1 publicado)');
    }
    kill();
    // 3) las reglas de hoy (sin el bloque ONLINE: lo desplegado hasta que Ferran despliegue): el cliente dice 'off' y no se rompe nada
    console.log('\nReglas desplegadas hoy (sin el bloque ONLINE)');
    const cur = fs.readFileSync(rules, 'utf8'), a = cur.indexOf('    // ----'), b = cur.lastIndexOf('    }\n  }\n}');
    const oldRules = path.join(os.tmpdir(), 'mtc-rules-sin-online.rules');
    fs.writeFileSync(oldRules, cur.slice(0, a) + cur.slice(b + 6));
    const P2 = PORT + 1;
    const j2 = spawn('java', ['-Xmx384m', '-jar', jar, '--host', '127.0.0.1', '--port', String(P2), '--rules', oldRules, '--project_id', PROJECT], { stdio: 'ignore', windowsHide: true });
    process.on('exit', () => killTree(j2));
    let up2 = false;
    for (let i = 0; i < 120 && !up2; i++) { await sleep(500); try { up2 = (await fetch('http://127.0.0.1:' + P2 + '/')).status < 500; } catch (e) { } }
    if (!up2) check('el emulador arranca con las reglas de antes', false);
    else {
      const base2 = 'http://127.0.0.1:' + P2 + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
      const O = NR.create({ base: base2, ver: '1|t', auth: async () => ({ uid: 'uidA', token: fakeToken('uidA') }) });
      check('sin las reglas nuevas: listar salas → off («El online aún no está activado en el servidor»)', await code(O.list()) === 'off');
      check('sin las reglas nuevas: crear sala → off', await code(O.open({ name: 'Ana' })) === 'off');
      check('sin las reglas nuevas: buscar por código → off', await code(O.byCode('K7P2QX')) === 'off');
      check('las reglas de antes siguen dejando guardar el progreso propio', (await fetch(base2 + '/users/uidA/saves/squad', { method: 'PATCH', headers: { Authorization: 'Bearer ' + fakeToken('uidA'), 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { data: { stringValue: '{}' }, updatedAt: { integerValue: '1' } } }) })).status === 200);
    }
    killTree(j2);
    // 4) Online V2: las reglas ONLINE de antes de 'net' (las desplegadas hasta que Ferran despliegue las nuevas): una sala Fluida da
    //    'denied' (el lobby dice «La conexión Fluida aún no está activada.») y las Precisa siguen funcionando
    console.log('\nReglas ONLINE sin el campo net (antes de desplegar Online V2)');
    // (de las reglas publicadas, si aún no traen el esquema v3; si no, de las actuales)
    const headRules = gitShow('firebase/firestore.rules'), src4 = headRules && headRules.indexOf('roomOkMulti') < 0 ? headRules : cur;
    const noNet = src4.replace(", 'seen', 'net'])", ", 'seen'])").replace(/\r?\n\s*\/\/ Online V2:[^\n]*\r?\n\s*&& \(!\('net' in d\)[^\n]*;/, ';');
    if (src4 !== cur && (noNet === src4 || noNet.indexOf("'net'") >= 0)) check('reglas sin net derivadas de las publicadas', false);
    else if (src4 === cur) console.log('  (omitido: la versión publicada ya trae el esquema v3)');
    else {
      const prevRules = path.join(os.tmpdir(), 'mtc-rules-sin-net.rules');
      fs.writeFileSync(prevRules, noNet);
      const P3 = PORT + 2;
      const j3 = spawn('java', ['-Xmx384m', '-jar', jar, '--host', '127.0.0.1', '--port', String(P3), '--rules', prevRules, '--project_id', PROJECT], { stdio: 'ignore', windowsHide: true });
      process.on('exit', () => killTree(j3));
      let up3 = false;
      for (let i = 0; i < 120 && !up3; i++) { await sleep(500); try { up3 = (await fetch('http://127.0.0.1:' + P3 + '/')).status < 500; } catch (e) { } }
      if (!up3) check('el emulador arranca con las reglas sin net', false);
      else {
        const base3 = 'http://127.0.0.1:' + P3 + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
        const O = NR.create({ base: base3, ver: '1|t', auth: async () => ({ uid: 'uidA', token: fakeToken('uidA') }) });
        check('sin net en las reglas: crear sala Fluida → denied (no off)', await code(O.open({ name: 'Ana', net: 'fluida' })) === 'denied');
        const rp = await O.open({ name: 'Ana' }).catch(e => e.code);
        check('sin net en las reglas: las salas Precisa se crean como siempre', rp && rp.id === 'uidA' && rp.net === undefined, rp && rp.id ? rp.id : rp);
        await O.close();
      }
      killTree(j3);
    }
    // 5) esquema v3: las reglas publicadas (git HEAD, sin salas de varios) con el cliente nuevo: las 1v1 siguen igual y una sala de
    //    varios da 'denied' (no 'off': el lobby puede decir «aún no está activado» sin romper el 1v1)
    console.log('\nReglas publicadas (' + PUB_REF.slice(0, 7) + ', sin salas de varios) con el cliente nuevo');
    if (!headRules || headRules.indexOf('roomOkMulti') >= 0) console.log('  (omitido: no hay git o la versión publicada ya trae el esquema v3)');
    else {
      const pubRules = path.join(os.tmpdir(), 'mtc-rules-head.rules');
      fs.writeFileSync(pubRules, headRules);
      const P5 = PORT + 3;
      const j5 = spawn('java', ['-Xmx384m', '-jar', jar, '--host', '127.0.0.1', '--port', String(P5), '--rules', pubRules, '--project_id', PROJECT], { stdio: 'ignore', windowsHide: true });
      process.on('exit', () => killTree(j5));
      let up5 = false;
      for (let i = 0; i < 120 && !up5; i++) { await sleep(500); try { up5 = (await fetch('http://127.0.0.1:' + P5 + '/')).status < 500; } catch (e) { } }
      if (!up5) check('el emulador arranca con las reglas publicadas', false);
      else {
        const base5 = 'http://127.0.0.1:' + P5 + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
        const mk5 = uid => NR.create({ base: base5, ver: '1|t', auth: async () => ({ uid, token: fakeToken(uid) }) });
        const O = mk5('uidA'), G5 = mk5('uidB');
        check('reglas publicadas: crear una sala de varios → denied (no off)', await code(O.open({ name: 'Ana', mode: 'vs', cap: 4 })) === 'denied');
        const rp = await O.open({ name: 'Ana', venue: 'beach' }).catch(e => e.code);
        const jn = rp && rp.id ? await G5.join('uidA', 'Berta').catch(e => e.code) : null;
        await O.putSig('uidA', 'offer', { sdp: 'o', gen: 1, to: 'uidB' }).catch(() => { });
        const so = await G5.getSig('uidA', 'offer');
        check('reglas publicadas: el cliente nuevo crea, entra y se señaliza en una sala 1v1 como siempre', rp && rp.id === 'uidA' && rp.multi === undefined && jn && jn.guest === 'uidB' && so && so.sdp === 'o',
          { rp: rp && rp.id ? rp.id : rp, jn: jn && jn.guest ? jn.guest : jn });
        await O.close();
      }
      killTree(j5);
    }
  }
  if (jar) await lifeRef(jar);
  console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(fails ? 1 : 0);
})();
