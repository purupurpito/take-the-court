#!/usr/bin/env node
/* MAKE THE CUT — tools/roomtest.js  (owner: net)
 * Fase 2 del online (notes/net.md): salas del lobby y señalización (js/netroom.js) contra las reglas de firebase/firestore.rules.
 *  1) Con Java y el emulador de Firestore (cloud-firestore-emulator-*.jar en ~/.cache/firebase/emulators; con Java 17 vale el
 *     v1.19.x: `npx firebase-tools@13.29.1 setup:emulators:firestore`): arranca el emulador con las reglas del proyecto y prueba
 *     el cliente de verdad (fichas JWT sin firmar, que el emulador acepta) con tres cuentas A, B y C.
 *  2) Siempre: lógica del cliente con un fetch simulado (403 al listar → 'off', sin sesión → 'auth', sin red → 'net', nombres).
 * Uso: node tools/roomtest.js [--no-emu] [--port 8089]
 * Nunca toca el Firebase de verdad (proyecto demo-mtc del emulador).
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARGS = process.argv.slice(2), NO_EMU = ARGS.includes('--no-emu');
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
  // lista: filtra caducadas, la tuya y ordena por latido
  const now = Date.now(), ts = ms => new Date(ms).toISOString();
  const doc = (id, seenAgo, extra) => ({ document: { name: 'projects/p/databases/(default)/documents/rooms/' + id, fields: Object.assign({
    code: { stringValue: 'ABCDEF' }, name: { stringValue: 'N' + id }, gname: { stringValue: '' }, host: { stringValue: id }, guest: { stringValue: '' },
    fmt: { stringValue: '2v2' }, venue: { stringValue: 'beach' }, map: { stringValue: '' }, even: { booleanValue: false }, bo: { integerValue: '1' },
    pts: { integerValue: '21' }, state: { stringValue: 'open' }, v: { stringValue: '1|x' }, seen: { timestampValue: ts(now - seenAgo) } }, extra || {}) }, readTime: ts(now) });
  const calls = [];
  r = NR.create({ base: 'http://x/v1/projects/p/databases/(default)/documents', auth, ver: '1|x', fetch: async (url, o) => {
    calls.push([o.method, url]);
    if (/:runQuery$/.test(url)) return { ok: true, status: 200, text: async () => JSON.stringify([doc('a', 5000), doc('b', 1000), doc('u1', 0), doc('c', 200000), doc('d', 400000), doc('e', 2000, { v: { stringValue: '1|y' } })]) };
    return { ok: true, status: 200, text: async () => '{}' };
  } });
  const L = await r.list();
  check('lista: vivas, sin la tuya, la más nueva primero', L.map(x => x.id).join() === 'b,e,a', L.map(x => x.id + ':' + x.age));
  check('lista: «otra versión» marcada', L.find(x => x.id === 'e').other === true && L.find(x => x.id === 'a').other === false);
  await sleep(20);
  check('lista: borra de paso la caducada (> 5 min) con su señalización', calls.some(c => c[0] === 'DELETE' && /rooms\/d$/.test(c[1])) && calls.some(c => c[0] === 'DELETE' && /rooms\/d\/sig\/offer$/.test(c[1])) && !calls.some(c => c[0] === 'DELETE' && /rooms\/c$/.test(c[1])));
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
async function emuTests(base) {
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
}

(async () => {
  const t0 = Date.now();
  await mockTests();
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
      await fetch('http://127.0.0.1:' + PORT + '/emulator/v1/projects/' + PROJECT + '/databases/(default)/documents', { method: 'DELETE' }).catch(() => { });
      try { await emuTests(base); } catch (e) { check('pruebas del emulador sin excepciones', false, String(e && e.stack || e)); }
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
  }
  console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(fails ? 1 : 0);
})();
