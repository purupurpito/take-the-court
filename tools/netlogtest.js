#!/usr/bin/env node
/* TAKE THE COURT — tools/netlogtest.js  (owner: net)
 * Informe de red de los partidos online (js/netlog.js) y reglas de netlogs/{id} (firebase/firestore.rules).
 *  1) Siempre: NetLog con una sesión y un enlace simulados: ventanas de 10 s, sucesos, que NO escribe nada durante el partido y
 *     escribe UNA vez al acabar, sin direcciones IP aunque getStats las tenga.
 *     Online V2: una sesión Fluida simulada (model 'fluida', sin stats.depth ni s.adv, con flStats): modelo, foto de flStats en
 *     cada ventana y en el total, rb/adv a null y el suceso 'marcador_distinto'. Y que el informe Precisa dice modelo 'precisa'.
 *  1c) Caducidad (24-nov-2026): cada informe lleva exp = t + 90 días; con las reglas de antes (403) se repite una vez sin exp y
 *     el resto de la página va sin exp. EXP_RULES = true (reglas con exp desplegadas el 24-nov-2026). El prefail (fallo antes
 *     del partido) va igual: con exp y el mismo reintento.
 *  2) Con el emulador de Firestore (como tools/roomtest.js): las reglas. Se prueba una COPIA con el hash de un correo de prueba en
 *     vez del de Ferran (el correo de verdad no está en el repo). Dos pasadas: las de origin/main (las de antes, sin exp; con
 *     git) y las de este árbol (exp opcional, en el futuro y como mucho a 100 días), y en cada una el cliente de verdad contra el emulador.
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
  check('campos uid, ver, t, j y exp', body && Object.keys(body.fields).sort().join() === 'exp,j,t,uid,ver', body && Object.keys(body.fields));
  const expMs = body && Date.parse(body.fields.exp.timestampValue) - Date.parse(body.fields.t.timestampValue);
  check('exp = t + 90 días (timestamp)', expMs === 90 * 86400000 && /Z$/.test(body.fields.exp.timestampValue), expMs);
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
  await multi(NL, writes, () => T, v => { T = v; });
  await noExpUnit();
}

/* ---------- 1c) online de varios (P6): muestras por par y por plaza ---------- */
async function multi(NL, writes, getT, setT) {
  console.log('\nNetLog con un partido de varios simulado (2 contra 2, anfitrión con 3 enlaces)');
  let T = getT();
  const mk = (rtt, typ) => ({ info: () => ({ type: typ, rtt: rtt, rtype: typ, proto: 'udp', address: '10.0.0.' + rtt }) });
  const links = [mk(30, 'host'), mk(80, 'srflx'), mk(140, 'relay')];
  const sess = { rttSeq: 0, rttLast: 0, stats: { sent: 0, recv: 0, bytesOut: 0, steps: 0, resyncs: 0, depth: 0, maxDepth: 0, waits: 0, frames: 0 }, status: 'starting', delay: 2, adv: 0, cmpBad: -1, rivalName: '', opts: { venue: 'hall', points: 25, format: '2v2' } };
  const net = { sess, link: links[0], links, slot: 0, seat: 0, team: 0, multi: true, epoch: 0, name: 'Ana', rival: 'Bea y Carla',
    humans: [{ team: 0, name: 'Ana' }, { team: 0, name: 'Dani' }, { team: 1, name: 'Bea' }, { team: 1, name: 'Carla' }], cr: { mates: ['Dani'], rivals: ['Bea', 'Carla'] } };
  const r = (o) => Object.assign({ status: sess.status, unstable: false, solo: false, gone: false, result: null, pings: [0, 35, 85, 150] }, o || {});
  NL.frame(net, r());
  sess.status = 'playing';
  for (let f = 0; f < 22 * 60; f++) { T += 1000 / 60; setT(T); if (f % 60 === 0) { sess.rttSeq++; sess.rttLast = 70; } sess.stats.steps++; NL.frame(net, r()); }
  const cur = NL._report();
  const w0 = cur && cur.wins[0];
  check('varios: un ping de red por enlace (pe) en cada ventana', w0 && Array.isArray(w0.pe) && w0.pe.length === 3 && w0.pe[0][1] === 30 && w0.pe[1][1] === 80 && w0.pe[2][3] === 140, w0 && w0.pe);
  check('varios: ping de la app por plaza (ps), sin la tuya', w0 && Array.isArray(w0.ps) && w0.ps[0] === null && w0.ps[1][1] === 35 && w0.ps[3][1] === 150, w0 && w0.ps);
  check('varios: el informe dice plaza, equipo, humanos, formato, rutas y compañeros/rivales', cur.multi && cur.multi.plaza === 0 && cur.multi.equipo === 0 && cur.multi.humanos === 4 && cur.multi.fmt === '2v2' &&
    cur.multi.conns.join() === 'host/host/udp,srflx/srflx/udp,relay/relay/udp' && cur.multi.mates.join() === 'Dani' && cur.multi.rivals.join() === 'Bea,Carla' && cur.rol === 'anfitrion', cur.multi);
  check('varios: suceso inicio con plaza y enlaces', cur.ev[0].k === 'inicio' && cur.ev[0].plaza === 0 && cur.ev[0].enlaces === 3, cur.ev[0]);
  check('varios: ninguna IP aunque info() la traiga', !/\d+\.\d+\.\d+\.\d+/.test(JSON.stringify(cur)));
  sess.status = 'over';
  NL.frame(net, r({ status: 'over', result: { win: true, why: 'over' } }));
  NL.end(net, 'cierra');
  await sleep(20);
  check('varios: al acabar se escribe una vez', writes.length === 3, writes.length);
  // 1 contra 1: sin pe/ps/multi (el informe de siempre)
  const n1 = writes[0] && JSON.parse(JSON.parse(writes[0].o.body).fields.j.stringValue);
  check('1 contra 1: el informe no trae pe, ps ni multi', n1 && n1.multi === undefined && n1.wins.every(w => w.pe === undefined && w.ps === undefined));
  netrec();
}

/* ---------- 1d) récord online (js/netrec.js): compañeros y rivales aparte; solo cuenta que se vayan los RIVALES ---------- */
function netrec() {
  console.log('\nRécord online del partido de varios (js/netrec.js)');
  const store = {};
  globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  require(path.join(ROOT, 'js/netrec.js'));
  const R = globalThis.VB.NetRec;
  const net = { multi: true, seat: 0, team: 0, humans: [{ team: 0 }, { team: 0 }, { team: 1 }, { team: 1 }], cr: { mates: ['Dani'], rivals: ['Bea', 'Carla'] }, base: { format: '2v2' } };
  globalThis.VB.ctx = { net };
  let e = R.end('Bea y Carla', { why: 'over', win: true }, true, [2, 1]);
  check('ganado: rivales y compañeros aparte (n, m) y formato', e.entry.w === 1 && e.entry.n === 'Bea y Carla' && e.entry.m === 'Dani' && e.entry.f === '2v2' && e.entry.s === '2-1', e.entry);
  e = R.end('Bea y Carla', { why: 'rivalQuit', seat: 2 }, true, null);
  check('se va un RIVAL (plaza del otro equipo): ganas', e.entry.w === 1, e.entry);
  e = R.end('Bea y Carla', { why: 'rivalQuit', seat: 1 }, true, null);
  check('se va un COMPAÑERO (plaza de tu equipo): no cuenta', e.entry.w === -1 && e.outcome.kind === 'mateGone', e.entry);
  e = R.end('Bea y Carla', { why: 'rivalGone', mate: true }, true, null);
  check('rivalGone con mate: true: no cuenta', e.entry.w === -1);
  e = R.end('Bea y Carla', { why: 'mateQuit' }, true, null);
  check('why mateQuit: no cuenta', e.entry.w === -1);
  const rec = R.get();
  check('récord: 2 ganados, 3 que no cuentan, compañeros guardados', rec.wins === 2 && rec.nc === 3 && rec.last.some(x => x.m === 'Dani'), [rec.wins, rec.nc]);
  net.humans = [{ team: 0 }, { team: 0 }]; net.cr = { mates: ['Dani'], rivals: [] };
  e = R.end('la IA', { why: 'over', win: false }, true, [0, 2]);
  check('coop (todos en tu equipo): rival «la IA», f coop', e.entry.n === 'la IA' && e.entry.f === 'coop' && e.entry.w === 0, e.entry);
  globalThis.VB.ctx = { net: { slot: 1 } };
  e = R.end('Pepe', { why: 'rivalQuit' }, true, null);
  check('1 contra 1: rivalQuit sigue siendo victoria y sin m/f', e.entry.w === 1 && e.entry.m === undefined && e.entry.f === undefined, e.entry);
  delete globalThis.VB.ctx;
}

/* ---------- 1c) reglas de antes (sin exp): 403 → otra vez sin exp, y ya sin exp hasta recargar ---------- */
function freshNetLog() {
  const f = require.resolve(path.join(ROOT, 'js/netlog.js'));
  delete require.cache[f]; globalThis.VB.NetLog = undefined;
  require(f);
  return globalThis.VB.NetLog;
}
function quickMatch(NL, link, nm) {
  const sess = { rttSeq: 0, rttLast: 0, stats: { sent: 1, recv: 1, bytesOut: 10, steps: 1, resyncs: 0, depth: 0, maxDepth: 0, waits: 0, frames: 1 }, status: 'playing', delay: 2, adv: 0, cmpBad: -1, rivalName: 'Bea', opts: {} };
  const net = { sess, link, slot: 0, epoch: 0, name: nm || 'Ana', rival: 'Bea' };
  NL.frame(net, { status: 'playing', unstable: false, solo: false, gone: false, result: null });
  const id = NL._cur() && NL._cur().id;
  NL.end(net, 'fin');
  return id;
}
async function noExpUnit() {
  console.log('\nNetLog con las reglas de antes (exp no admitido)');
  const calls = [];
  globalThis.fetch = async (url, o) => { const b = JSON.parse(o.body); calls.push(Object.keys(b.fields).sort().join()); return { status: 'exp' in b.fields ? 403 : 200 }; };
  const NL = freshNetLog(), link = { info: () => ({ type: 'host', rtt: 5 }) };
  check('antes de nada, manda con exp', NL._noExp() === false);
  quickMatch(NL, link); await sleep(30);
  check('403 con exp → lo repite UNA vez sin exp', calls.length === 2 && calls[0] === 'exp,j,t,uid,ver' && calls[1] === 'j,t,uid,ver', calls);
  check('…y se acuerda hasta recargar', NL._noExp() === true);
  quickMatch(NL, link); await sleep(30);
  check('el siguiente partido va directamente sin exp (una sola escritura)', calls.length === 3 && calls[2] === 'j,t,uid,ver', calls);
  // 403 también sin exp (p. ej. sin permiso): no insiste
  calls.length = 0;
  globalThis.fetch = async (url, o) => { calls.push(Object.keys(JSON.parse(o.body).fields).sort().join()); return { status: 403 }; };
  const NL2 = freshNetLog();
  quickMatch(NL2, link); await sleep(30);
  check('403 con y sin exp: dos intentos y nada más', calls.length === 2, calls);
  // reglas nuevas: 200 a la primera, con exp
  calls.length = 0;
  globalThis.fetch = async (url, o) => { calls.push(Object.keys(JSON.parse(o.body).fields).sort().join()); return { status: 200 }; };
  const NL3 = freshNetLog();
  quickMatch(NL3, link); await sleep(30);
  check('con las reglas nuevas: una escritura, con exp', calls.length === 1 && calls[0] === 'exp,j,t,uid,ver' && NL3._noExp() === false, calls);
  // cerrar la pestaña (pagehide): el reintento ya no correría, así que solo va exp si se sabe que las reglas lo aceptan
  const store = new Map();
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const unloadMatch = (NLx) => { const sess = { rttSeq: 0, rttLast: 0, stats: { sent: 1, recv: 1, bytesOut: 10, steps: 1, resyncs: 0, depth: 0, maxDepth: 0, waits: 0, frames: 1 }, status: 'playing', delay: 2, adv: 0, cmpBad: -1, rivalName: 'Bea', opts: {} };
    const net = { sess, link, slot: 0, epoch: 0, name: 'Ana', rival: 'Bea' }; NLx.frame(net, { status: 'playing', unstable: false, solo: false, gone: false, result: null }); NLx._unload(net); };
  calls.length = 0;
  globalThis.fetch = async (url, o) => { const b = JSON.parse(o.body); calls.push(Object.keys(b.fields).sort().join()); return { status: 'exp' in b.fields ? 403 : 200 }; };
  const NL4 = freshNetLog();
  check('EXP_RULES en true (reglas con exp desplegadas el 24-nov-2026)', NL4.EXP_RULES === true);
  unloadMatch(NL4); await sleep(30);
  check('pagehide sin saber nada: con exp a la primera (EXP_RULES); si diera 403, el reintento sin exp', calls.length === 2 && calls[0] === 'exp,j,t,uid,ver' && calls[1] === 'j,t,uid,ver', calls);
  calls.length = 0;
  globalThis.fetch = async (url, o) => { calls.push(Object.keys(JSON.parse(o.body).fields).sort().join()); return { status: 200 }; };
  const NL5 = freshNetLog();
  quickMatch(NL5, link); await sleep(30);
  check('un informe con exp guardado lo apunta en el aparato (make-the-cut.netlogexp)', store.get('make-the-cut.netlogexp') === '1' && calls[0] === 'exp,j,t,uid,ver', calls);
  const NL6 = freshNetLog(); calls.length = 0;
  unloadMatch(NL6); await sleep(30);
  check('…y desde entonces el pagehide ya va con exp (también tras recargar)', calls.length === 1 && calls[0] === 'exp,j,t,uid,ver', calls);
  globalThis.fetch = async (url, o) => { const b = JSON.parse(o.body); calls.push(Object.keys(b.fields).sort().join()); return { status: 'exp' in b.fields ? 403 : 200 }; };
  const NL7 = freshNetLog(); calls.length = 0;
  quickMatch(NL7, link); await sleep(30);
  check('un 403 con exp borra la marca (reglas de antes otra vez)', !store.has('make-the-cut.netlogexp') && calls.join('|') === 'exp,j,t,uid,ver|j,t,uid,ver', calls);
  // fallo antes del partido (prefail): el mismo documento, también con exp y el mismo reintento
  const pfCalls = [];
  globalThis.fetch = async (url, o) => { const b = JSON.parse(o.body); pfCalls.push({ url, k: Object.keys(b.fields).sort().join(), b }); return { status: 200 }; };
  const NL8 = freshNetLog();
  const pf = NL8.prefail({ role: 'guest', fmt: '2v2', cap: 4, mode: 'multi', why: 'noconn', ms: 5000, diag: { st: 'connecting' } }); await sleep(30);
  const pb = pfCalls[0] && pfCalls[0].b, pexp = pb && pb.fields.exp && Date.parse(pb.fields.exp.timestampValue), pt = pb && Date.parse(pb.fields.t.timestampValue);
  check('prefail: netlogs/{uid}_pf… con uid, ver, t, j y exp', pf && pfCalls.length === 1 && /\/netlogs\/[^/]+_pf/.test(pfCalls[0].url) && pfCalls[0].k === 'exp,j,t,uid,ver', pfCalls.map(c => c.k));
  check('prefail: exp = t + 90 días', pexp && pt && Math.abs(pexp - pt - NL8.KEEP_MS) < 2000, [pt, pexp]);
  pfCalls.length = 0;
  globalThis.fetch = async (url, o) => { const b = JSON.parse(o.body); pfCalls.push({ url, k: Object.keys(b.fields).sort().join() }); return { status: 'exp' in b.fields ? 403 : 200 }; };
  const NL9 = freshNetLog();
  NL9.prefail({ role: 'host', fmt: '6v6', cap: 12, why: 'noconn' }); await sleep(30);
  check('prefail con las reglas de antes: 403 con exp → otra vez sin exp', pfCalls.map(c => c.k).join('|') === 'exp,j,t,uid,ver|j,t,uid,ver' && NL9._noExp() === true, pfCalls.map(c => c.k));
  delete globalThis.localStorage;
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
async function startEmu(jar, rulesText, port) {
  fs.mkdirSync(path.join(ROOT, 'tools', 'out'), { recursive: true });
  const tmp = path.join(ROOT, 'tools', 'out', 'netlog-' + port + '.rules'); fs.writeFileSync(tmp, rulesText);
  const java = spawn('java', ['-Xmx384m', '-jar', jar, '--host', '127.0.0.1', '--port', String(port), '--rules', tmp, '--project_id', PROJECT], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let log = ''; java.stdout.on('data', d => { log += d; }); java.stderr.on('data', d => { log += d; });
  process.on('exit', () => killTree(java));
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { await sleep(500); try { up = (await fetch('http://127.0.0.1:' + port + '/')).status < 500; } catch (e) { } }
  if (!up) { console.log(log.slice(-1500)); killTree(java); return null; }
  if (process.env.NLDEBUG) { await sleep(3000); console.log(log.slice(-1500)); }
  return java;
}
async function emu() {
  globalThis.fetch = realFetch; globalThis.performance = realPerf;
  const jar = NO_EMU ? null : findJar();
  if (!jar) { console.log('\n(sin emulador de Firestore: solo la parte 1)'); return; }
  const real = fs.readFileSync(path.join(ROOT, 'firebase', 'firestore.rules'), 'utf8');
  const H = 'c0592685221ed4a093808f6d3f8a863be6f6d4a1894b00b91e90b07719048deb';
  check('las reglas leen con el hash del acta (js/ui.js)', real.indexOf(H) > 0 && fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8').indexOf(H) > 0);
  const ADMIN = 'Admin@Prueba.invalid', h = crypto.createHash('sha256').update(ADMIN.toLowerCase()).digest('hex');
  // las de antes (origin/main, sin exp: clientes viejos) y las de este árbol (con exp, desplegadas el 24-nov-2026)
  let old = '';
  try { old = require('child_process').execFileSync('git', ['show', 'origin/main:firebase/firestore.rules'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { old = ''; }
  const sets = [['reglas de este árbol (exp opcional)', real, true, PORT]];
  if (old && old.indexOf(H) > 0) sets.unshift(['reglas de origin/main (las de antes: sin exp)', old, false, PORT + 1]);
  else console.log('\n(sin git o sin origin/main: solo las reglas de este árbol)');
  if (old && /'exp'/.test(old)) console.log('  (aviso: origin/main ya trae exp en las reglas)');
  for (const [label, text, isNew, port] of sets) {
    console.log('\nReglas de netlogs en el emulador: ' + label);
    const java = await startEmu(jar, text.split(H).join(h), port);
    if (!java) { check('el emulador arranca con las reglas', false); continue; }
    try { await rulesChecks(port, isNew, ADMIN); } finally { killTree(java); }
  }
}
async function rulesChecks(port, isNew, ADMIN) {
  globalThis.fetch = realFetch; globalThis.performance = realPerf;
  const base = 'http://127.0.0.1:' + port + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
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
  // caducidad
  const D = 86400000, ts = ms => ({ timestampValue: new Date(Date.now() + ms).toISOString() });
  const e90 = await call('PATCH', '/netlogs/uidA_exp090', doc('uidA', '{}', { exp: ts(90 * D) }), A);
  if (isNew) {
    check('exp = ahora + 90 días: se acepta', e90 === 200, e90);
    check('exp = ahora + 81 y + 99 días: se aceptan', await call('PATCH', '/netlogs/uidA_exp081', doc('uidA', '{}', { exp: ts(81 * D) }), A) === 200
      && await call('PATCH', '/netlogs/uidA_exp099', doc('uidA', '{}', { exp: ts(99 * D) }), A) === 200);
    check('exp = ahora + 10 días: sí (reloj del aparato atrasado: caduca antes, nunca después)', await call('PATCH', '/netlogs/uidA_exp010', doc('uidA', '{}', { exp: ts(10 * D) }), A) === 200);
    check('exp = ahora + 200 días: no', await call('PATCH', '/netlogs/uidA_exp200', doc('uidA', '{}', { exp: ts(200 * D) }), A) === 403);
    check('exp en el pasado: no', await call('PATCH', '/netlogs/uidA_exppas', doc('uidA', '{}', { exp: ts(-D) }), A) === 403);
    check('exp que no es fecha: no', await call('PATCH', '/netlogs/uidA_expstr', doc('uidA', '{}', { exp: { stringValue: '2099-01-01' } }), A) === 403
      && await call('PATCH', '/netlogs/uidA_expint', doc('uidA', '{}', { exp: { integerValue: String(Date.now() + 90 * D) } }), A) === 403);
    check('actualizar quitando exp: sí (sigue siendo opcional)', await call('PATCH', '/netlogs/uidA_exp090', doc('uidA', '{"b":1}'), A) === 200);
  } else {
    check('reglas de antes: con exp da 403 (lo que hace saltar el reintento sin exp)', e90 === 403, e90);
  }
  // el cliente de verdad (js/netlog.js) contra el emulador
  const NL = freshNetLog(), sent = [];
  globalThis.VB.Account = { FS_BASE: base, netAuth: async () => ({ uid: 'uidA', token: A }) };
  globalThis.fetch = async (u, o) => { if (o && o.method === 'PATCH') sent.push('exp' in JSON.parse(o.body).fields); return realFetch(u, o); };
  const link = { info: () => ({ type: 'host', rtt: 5 }) };
  const readLog = async (id) => {
    for (let i = 0; i < 40; i++) { await sleep(100); const r = await realFetch(base + '/netlogs/uidA_' + id, { headers: { Authorization: 'Bearer ' + AD } }); if (r.status === 200) return r.json(); }
    return null;
  };
  const got = await readLog(quickMatch(NL, link, 'Ana'));
  if (isNew) {
    const ms = got && got.fields.exp ? Date.parse(got.fields.exp.timestampValue) - Date.now() : 0;
    check('cliente: guarda el informe con exp ≈ 90 días, a la primera', !!got && Math.abs(ms - 90 * D) < 60000 && sent.join() === 'true' && NL._noExp() === false, { sent, ms });
  } else {
    check('cliente: con las reglas de antes guarda el informe sin exp (403 y reintento)', !!got && !got.fields.exp && sent.join() === 'true,false' && NL._noExp() === true, { sent, keys: got && Object.keys(got.fields) });
    const got2 = await readLog(quickMatch(NL, link, 'Ana'));
    check('cliente: el 2º partido va sin exp y a la primera', !!got2 && sent.join() === 'true,false,false', sent);
  }
  globalThis.fetch = realFetch;
}

(async () => {
  try { await unit(); } catch (e) { check('parte 1 sin excepciones', false, String(e && e.stack || e)); }
  try { await emu(); } catch (e) { check('parte 2 sin excepciones', false, String(e && e.stack || e)); }
  console.log('\n' + (fails ? '== netlogtest: ' + fails + ' FALLOS (' + oks + ' ok) ==' : '== netlogtest OK (' + oks + ' comprobaciones) =='));
  process.exit(fails ? 1 : 0);
})();
