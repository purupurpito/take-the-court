#!/usr/bin/env node
/* TAKE THE COURT — tools/net3test.js  (owner: net)
 * Fase 3 del online (notes/net.md «Fase 3»), lo que se prueba en Node sin navegador:
 *   (1) Récord online y gorra (js/netrec.js + js/look.js en vm, localStorage de mentira): ganar, perder, abandonar (= derrota),
 *       «no cuenta», la gorra «Online Beta Tester» una sola vez y solo si terminaste el partido, la marca de partido a medias (cerrar
 *       la pestaña = abandono; con latido reciente no), nombres saneados (nunca un correo) y guardado dañado.
 *   (2) Revancha sobre el MISMO enlace (memPair 60 ms ± 10, 2 % de pérdida): dos sesiones juegan con bots hasta el final, piden la
 *       revancha por el canal de la interfaz (sendApp → r.app), el anfitrión manda «go» con la época 1 y semilla nueva, y las dos
 *       sesiones nuevas juegan: huellas iguales, sin reparaciones, otra semilla, mismos nombres. Un paquete de entradas y una huella
 *       de la época anterior que llegan tarde se ignoran. Y el rival que se va tras el final: rivalLeft (no hay revancha).
 * Uso: node tools/net3test.js     (sale con código 1 si algo falla; ~1 min)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
}
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------------- (1) récord y gorra ---------------- */
function recCtx() {
  const store = {};
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const ctx = { console, localStorage, JSON, Date, Math };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.VB = {};
  vm.createContext(ctx);
  vm.runInContext(rd('js/look.js'), ctx, { filename: 'look.js' });
  vm.runInContext(rd('js/netrec.js'), ctx, { filename: 'netrec.js' });
  return { VB: ctx.VB, store, ctx };
}
(function () {
  console.log('(1) récord online y gorra');
  let { VB, store } = recCtx();
  const R = VB.NetRec, L = VB.Look;
  check('récord vacío al empezar', R.get().played === 0 && R.line() === '' && !L.owned('gorraMTC'));
  check('la gorra existe en el Vestuario (cabeza, pista y playa) y está bloqueada', !!L.item('gorraMTC') && L.item('gorraMTC').name === 'Online Beta Tester' &&
    L.items('head', 'hall').includes('gorraMTC') && L.items('head', 'beach').includes('gorraMTC') && L.lockText('gorraMTC') === 'Online: termina tu primer partido');
  R.begin('Ana');
  check('marca de partido en curso al empezar', !!store[R.PEND]);
  let x = R.end('Ana', { why: 'over', win: true }, true, [1, 0]);
  check('ganar: 1 de 1, racha 1, sin marca, entrada con sets', x.rec.wins === 1 && x.rec.played === 1 && x.rec.streak === 1 && !store[R.PEND] && x.entry.s === '1-0' && x.entry.w === 1, x.rec);
  check('la gorra se concede al terminar el primer partido (origen online) y sale como nueva', x.cap === true && L.owned('gorraMTC') && L.unseen().includes('gorraMTC') && L.load().own.gorraMTC.s === 'online');
  x = R.end('Ana', { why: 'over', win: false }, true, [0, 1]);
  check('perder: 1 de 2, racha 0; la gorra no se vuelve a conceder', x.rec.wins === 1 && x.rec.losses === 1 && x.rec.streak === 0 && x.cap === false, x.rec);
  x = R.end('Bea', { why: 'quit', win: false }, true, null);
  check('abandonar cuenta como derrota (y como abandono)', x.rec.losses === 2 && x.rec.quits === 1 && x.entry.s === 'abandono' && x.entry.w === 0, x.rec);
  x = R.end('Bea', { why: 'late', win: false }, true, null);
  check('tardar en volver también es abandono', x.rec.losses === 3 && x.rec.quits === 2, x.rec);
  x = R.end('Cris', { why: 'rivalQuit', win: true }, true, null);
  check('el rival abandona: victoria («abandonó»)', x.rec.wins === 2 && x.entry.s === 'abandonó', x.entry);
  x = R.end('Cris', { why: 'rivalGone', win: true }, true, null);
  check('el rival no vuelve: victoria («no volvió»)', x.rec.wins === 3 && x.entry.s === 'no volvió');
  x = R.end('Dani', { why: 'hostGone', win: false }, false, null);
  check('se cae quien creó la sala: no cuenta (nc)', x.rec.nc === 1 && x.rec.played === 6 && x.entry.w === -1, x.rec);
  x = R.end('Dani', { why: 'over', win: true }, false, [1, 0]);
  check('partido no válido (reparaciones): no cuenta', x.rec.nc === 2 && x.rec.wins === 3, x.rec);
  check('line(): «3 ganados de 6 (2 abandonos)»', R.line() === '3 ganados de 6 (2 abandonos)', R.line());
  check('últimos rivales: 10 como mucho, el más reciente primero', R.get().last.length === 8 && R.get().last[0].n === 'Dani');
  for (let i = 0; i < 6; i++) R.end('E' + i, { why: 'over', win: true }, true, [1, 0]);
  check('lista recortada a 10', R.get().last.length === 10 && R.get().best >= 6, R.get().best);
  x = R.end('x@y.com', { why: 'over', win: true }, true, [1, 0]);
  check('un nombre con @ no se guarda (nunca un correo)', x.entry.n === 'Rival');
  x = R.end('<b>Pepe</b>"', { why: 'over', win: true }, true, [1, 0]);
  check('nombre sin < > ni comillas', x.entry.n === 'bPepe/b', x.entry.n);
  // gorra: abandonar el primer partido no la da; «no cuenta» por caída del anfitrión, sí (terminaste)
  ({ VB, store } = recCtx());
  x = VB.NetRec.end('Ana', { why: 'quit', win: false }, true, null);
  check('abandonar tu primer partido no da la gorra', x.cap === false && !VB.Look.owned('gorraMTC'));
  x = VB.NetRec.end('Ana', { why: 'version' }, true, null);
  check('otra versión: no cuenta y tampoco da la gorra', x.cap === false && x.rec.nc === 1);
  x = VB.NetRec.end('Ana', { why: 'hostGone', win: false }, false, null);
  check('caída del anfitrión: no cuenta pero sí da la gorra (lo jugaste hasta el final que hubo)', x.cap === true && VB.Look.owned('gorraMTC'));
  // marca a medias
  ({ VB, store } = recCtx());
  VB.NetRec.begin('Ana');
  check('marca reciente (otra pestaña jugando): boot no cuenta nada', VB.NetRec.boot() === null && VB.NetRec.get().played === 0 && !!store[VB.NetRec.PEND]);
  store[VB.NetRec.PEND] = JSON.stringify({ n: 'Ana', t: Date.now() - 120000 });
  const e = VB.NetRec.boot();
  check('marca vieja (se cerró la pestaña en pleno partido): abandono = derrota', e && e.w === 0 && e.s === 'abandono' && VB.NetRec.get().losses === 1 && !store[VB.NetRec.PEND], e);
  check('sin marca: boot no hace nada', VB.NetRec.boot() === null);
  // (revisión F3) cerrar en pleno partido, reabrir antes de 90 s y empezar otro partido: el abandono anterior no se pierde
  {
    const r1 = recCtx(), st = r1.store; let now = 1e12; r1.ctx.Date = { now: () => now };
    r1.VB.NetRec.begin('Rival1');                       // página 1: partido en curso... y se cierra la pestaña
    const r2 = recCtx(); for (const k in st) r2.store[k] = st[k]; r2.ctx.Date = { now: () => now };
    const R2 = r2.VB.NetRec;
    now += 30000; const b = R2.boot();                  // página 2 a los 30 s: latido reciente, aún no cuenta
    R2.begin('Rival2'); now += 60000; R2.beat();        // otro partido: a los 90 s sin latido, la marca vieja cuenta al barrer
    const mid = R2.get();
    now += 60000; const x2 = R2.end('Rival2', { why: 'over', win: true }, true, [1, 0]);
    const g2 = R2.get();
    check('reabrir antes de 90 s y jugar otro: el abandono anterior sigue contando (1 ganado, 1 abandono)', b === null && mid.losses === 1 && mid.quits === 1 &&
      g2.wins === 1 && g2.losses === 1 && g2.quits === 1 && x2.entry.n === 'Rival2' && !r2.store[R2.PEND] && R2.boot() === null, g2);
  }
  {
    // dos páginas jugando a la vez (mismo guardado) con latido: ninguna cuenta la marca de la otra
    const st = {}, mk = () => { const r = recCtx(); r.ctx.localStorage.getItem = k => (k in st ? st[k] : null); r.ctx.localStorage.setItem = (k, v) => { st[k] = String(v); }; r.ctx.localStorage.removeItem = k => { delete st[k]; }; return r; };
    let now = 1e12; const a = mk(), c = mk(); a.ctx.Date = c.ctx.Date = { now: () => now };
    a.VB.NetRec.begin('Ana'); c.VB.NetRec.begin('Bea');
    for (let k = 0; k < 12; k++) { now += 10000; a.VB.NetRec.beat(); c.VB.NetRec.beat(); }
    const n1 = JSON.parse(st[a.VB.NetRec.PEND]).length;
    a.VB.NetRec.end('Ana', { why: 'over', win: true }, true, [1, 0]);
    check('dos páginas a la vez con latido: ninguna cuenta la marca de la otra; end solo quita la suya', n1 === 2 && a.VB.NetRec.get().losses === 0 && JSON.parse(st[a.VB.NetRec.PEND]).length === 1);
  }
  // (robustez) vuelta al partido tras recargar: el begin() del partido recuperado hereda la marca de la página anterior
  {
    const r1 = recCtx(), st = r1.store; let now = 1e12; r1.ctx.Date = { now: () => now };
    r1.VB.NetRec.begin('Ana');                           // página 1 jugando... y recarga
    const r2 = recCtx(); for (const k in st) r2.store[k] = st[k]; r2.ctx.Date = { now: () => now };
    const R2 = r2.VB.NetRec;
    now += 5000; const bt = R2.boot(); const rs = R2.resume();
    now += 3000; R2.begin('Ana');                        // la vuelta llega a jugarse
    const nm = JSON.parse(r2.store[R2.PEND]).length;
    for (let k = 0; k < 12; k++) { now += 10000; R2.beat(); }
    const x = R2.end('Ana', { why: 'over', win: true }, true, [1, 0]);
    check('recargar y volver: una sola marca heredada, sin abandono, gana normal', bt === null && rs && rs.n === 'Ana' && nm === 1 && x.rec.wins === 1 && x.rec.losses === 0 && !r2.store[R2.PEND], x.rec);
    // la vuelta no llega a jugarse: la marca vieja se queda sin latido y cuenta como abandono
    const r3 = recCtx(); r3.ctx.Date = { now: () => now }; const R3 = r3.VB.NetRec;
    R3.begin('Bea'); const r4 = recCtx(); for (const k in r3.store) r4.store[k] = r3.store[k]; r4.ctx.Date = { now: () => now };
    const R4 = r4.VB.NetRec; R4.resume(); now += 100000; const e4 = R4.boot();
    check('recargar y no volver: la marca cuenta como abandono a los 90 s', e4 && e4.s === 'abandono' && R4.get().quits === 1, e4);
  }
  // (robustez) anti-trampas ligero: un final sin huellas que cuadren no suma («no válido»)
  {
    const r = recCtx(), R = r.VB.NetRec;
    R.begin('Ana'); const x = R.end('Ana', { why: 'over', win: true, unverified: true }, true, [1, 0]);
    check('final sin huellas que cuadren: «no válido», no suma ni resta', x.entry.w === -1 && x.entry.s === 'no válido' && x.rec.wins === 0 && x.rec.nc === 1 && R.get().last[0].s === 'no válido', x.entry);
  }
  store[VB.NetRec.KEY] = '{roto';
  check('guardado dañado: se lee vacío', VB.NetRec.get().played === 0);
  store[VB.NetRec.KEY] = JSON.stringify({ wins: 5, losses: -3, quits: 99, last: [{ n: 'A', w: 7 }, 3, null] });
  const sg = VB.NetRec.get();
  check('guardado raro: saneado (quits ≤ derrotas, w fuera de rango = no cuenta)', sg.wins === 5 && sg.losses === 0 && sg.quits === 0 && sg.last.length === 1 && sg.last[0].w === -1, sg);
})();

/* ---------------- (2) revancha sobre el mismo enlace ---------------- */
const SRC = ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/net.js'].map(f => [f, rd(f)]);
function load() {
  const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx); ctx.VB = { VERSION: 'test' };
  for (const [f, s] of SRC) vm.runInContext(s, ctx, { filename: f });
  return ctx.VB;
}
(function () {
  console.log('(2) revancha');
  const A = load(), B = load();
  let T = 0;
  const [la, lb] = A.Net.memPair({ lag: 60, jit: 10, loss: 2, seed: 7, clock: () => T });
  const opts = { online: true, seed: 4242, venue: 'hall', points: 11, bestOf: 1, humans: [{}, {}], present: true, stats: true };
  const hA = [], hB = [];
  let sA = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi', hashLog: hA });
  let sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi', hashLog: hB });
  const botA = A.Net.bot(0, 3, 'bueno'), botB = B.Net.bot(1, 4, 'bueno');
  const off = [0, 7777.7];
  let next = [0, 5], rA = null, rB = null, err = null;
  function frame(k) {
    const s = k ? sB : sA, bot = k ? botB : botA;
    const r = s.advance(T + off[k], s.opts && (s.status === 'playing' || s.status === 'over') ? bot(s.predictedGame()) : null);
    if (k) rB = r; else rA = r;
    return r;
  }
  function runUntil(cond, maxMs) {
    const end = T + maxMs;
    while (T < end) {
      const k = next[0] <= next[1] ? 0 : 1; T = next[k]; next[k] += 16.7;
      try { const r = frame(k); if (cond(r, k)) return true; } catch (e) { err = e; return false; }
    }
    return false;
  }
  const over = runUntil(() => sA.status === 'over' && sB.status === 'over', 900000);
  check('primer partido (pabellón, 1 set a 11) hasta el final', over && !err, { st: [sA.status, sB.status], score: sA.gc.score, t: Math.round(T / 1000), err: err && String(err) });
  const res0 = [sA.result, sB.result];
  check('resultados complementarios', res0[0] && res0[1] && res0[0].why === 'over' && res0[0].win !== res0[1].win, res0);
  check('final con huellas que cuadran: válido en los dos (anti-trampas ligero)', !res0[0].unverified && !res0[1].unverified && sA.cmpOk > 0 && sB.cmpOk > 0 && sA.cmpBad < 0 && sB.cmpBad < 0, { ok: [sA.cmpOk, sB.cmpOk], bad: [sA.cmpBad, sB.cmpBad] });
  // revancha: los dos la piden por el canal de la interfaz
  sA.sendApp({ t: 'again' }); sB.sendApp({ t: 'again' });
  let gotA = false, gotB = false;
  runUntil((r, k) => { if (r.app.some(m => m && m.t === 'again')) { if (k) gotB = true; else gotA = true; } return gotA && gotB; }, 5000);
  check('cada uno recibe la petición del otro (r.app)', gotA && gotB);
  // el anfitrión manda «go» por la sesión vieja y empieza la nueva (época 1, semilla nueva); el invitado la sigue al recibirlo
  const old = { A: sA, B: sB };
  sA.sendApp({ t: 'go', e: 1 });
  const opts2 = Object.assign({}, opts, { seed: 9191 });
  sA = new A.Net.Session({ slot: 0, link: la, opts: opts2, name: 'Anfi', epoch: 1, hashLog: (hA.length = 0, hA) });
  let go = false;
  // (la sesión vieja del invitado sigue mandando entradas y pings hasta recibir el «go»)
  runUntil((r, k) => {
    if (k === 1 && !go && r.app.some(m => m && m.t === 'go' && m.e === 1)) { go = true; sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi', epoch: 1, hashLog: (hB.length = 0, hB) }); }
    return go;
  }, 5000);
  check('el invitado recibe «go» con la época 1', go);
  // paquete y huella de la época 0 que llegan tarde a las sesiones nuevas
  const stale = A.Net.packInputs(old.A.mine, 300, 50, 99999, 99999, 0);
  lb.send('in', stale); la.send('in', B.Net.packInputs(old.B.mine, 300, 50, 99999, 99999, 0));
  lb.send('ctl', JSON.stringify({ k: 'hash', t: 240, h: 12345 })); la.send('ctl', JSON.stringify({ k: 'hash', t: 240, h: 12345 }));
  const playing = runUntil(() => sA.status === 'playing' && sB.status === 'playing', 10000);
  check('las dos sesiones nuevas conectan y juegan', playing, { st: [sA.status, sB.status] });
  runUntil(() => false, 60000);
  let n = 0, bad = 0; const mB = new Map(hB);
  for (const [t, h] of hA) if (mB.has(t)) { n++; if (mB.get(t) !== h) bad++; }
  check('revancha: huellas iguales 60 s, sin reparaciones', n > 40 && bad === 0 && sA.mismatches === 0 && sB.mismatches === 0, { n, bad, rep: [sA.mismatches, sB.mismatches] });
  check('revancha: el invitado adopta las opciones nuevas (otra semilla) y los nombres siguen', sB.opts && sB.opts.seed === 9191 && sB.rivalName === 'Anfi' && sA.rivalName === 'Invi');
  check('lo de la época anterior (entradas y huella) no se cuela', sB.remoteAck < 99999 && sA.remoteAck < 99999 && !sA.theirHash[240] && !sB.theirHash[240], { ackA: sA.remoteAck, ackB: sB.remoteAck });
  check('sin excepciones', !err, err && String(err));
  // el rival se va tras el final: rivalLeft
  runUntil(() => sA.status === 'over' && sB.status === 'over', 900000);
  check('la revancha también llega al final', sA.status === 'over' && sB.status === 'over', { st: [sA.status, sB.status] });
  sB.quit();
  runUntil(() => rA && rA.rivalLeft, 3000);
  check('el rival vuelve al menú tras el final: rivalLeft (no hay revancha) y el resultado no cambia', rA && rA.rivalLeft && sA.result && sA.result.why === 'over', { left: rA && rA.rivalLeft, res: sA.result });
})();

/* ---------------- (3) revisión F3: antes de empezar, nombre del rival y ping tras un corte ---------------- */
(function () {
  console.log('(3) antes de empezar, nombre y ping');
  const opts = { online: true, seed: 77, venue: 'hall', points: 11, bestOf: 1, humans: [{}, {}], present: true, stats: true };
  function pair(o) { const A = load(), B = load(), c = { T: 0 }; const [la, lb] = A.Net.memPair(Object.assign({ lag: 60, seed: 3, clock: () => c.T }, o || {})); return { A, B, la, lb, c }; }
  function run(c, list, ms, cond) {   // list = [[sesión, desfase, bot|null]]
    const end = c.T + ms;
    for (; c.T < end; c.T += 16.7) {
      for (const [s, off, bot] of list) s.advance(c.T + off, bot && s.opts && s.status === 'playing' ? bot(s.predictedGame()) : null);
      if (cond && cond()) return true;
    }
    return false;
  }
  // a) revancha: el invitado pide «Revancha» y pulsa «Volver al menú» antes del «go» (su adiós es de la época 0)
  {
    const { A, B, la, lb, c } = pair();
    const sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi' }); sB.status = 'over';
    sB.sendApp({ t: 'again' }); sB.quit();
    const sA = new A.Net.Session({ slot: 0, link: la, opts: Object.assign({}, opts, { seed: 2 }), name: 'Anfi', rivalName: 'Invi', epoch: 1 });
    const ok = run(c, [[sA, 0, null]], 5000, () => sA.status === 'ended');
    check('revancha y el invitado se va antes del «go»: el anfitrión no se queda «conectando» (noShow al llegar su adiós)', ok && c.T < 1000 && sA.result.why === 'noShow' && sA.rivalLeft, { t: Math.round(c.T), res: sA.result });
  }
  // b) nadie al otro lado: a los 20 s sin noticias, noShow (anfitrión e invitado)
  {
    const { A, B, la, lb, c } = pair();
    const sA = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi' }), sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi' });
    run(c, [[sA, 0, null]], 19000);
    const mid = sA.status;
    run(c, [[sA, 0, null], [sB, 5, null]], 4000);
    check('el invitado que llega a los 19 s aún entra (el plazo es sin noticias, no desde el principio)', mid === 'connecting' && sA.status === 'playing' && sB.status === 'playing', { mid, st: [sA.status, sB.status] });
    const p1 = pair(); const sA1 = new p1.A.Net.Session({ slot: 0, link: p1.la, opts, name: 'Anfi' });
    run(p1.c, [[sA1, 0, null]], 19500); const mid1 = sA1.status;
    run(p1.c, [[sA1, 0, null]], 1500);
    check('anfitrión sin invitado: «conectando» hasta los 20 s y luego noShow', mid1 === 'connecting' && sA1.status === 'ended' && sA1.result.why === 'noShow', { mid1, st: sA1.status });
    const p2 = pair(); const sB2 = new p2.B.Net.Session({ slot: 1, link: p2.lb, opts: null, name: 'Invi' });
    run(p2.c, [[sB2, 0, null]], 21000);
    check('invitado sin anfitrión 21 s: noShow', sB2.status === 'ended' && sB2.result.why === 'noShow', sB2.result);
    check('noShow / cancel no cuentan en el récord', recCtx().VB.NetRec.outcome({ why: 'noShow', win: false }, true).w === -1 && recCtx().VB.NetRec.outcome({ why: 'cancel', win: false }, true).w === -1);
  }
  // c) salir mientras se conecta: no es abandono; el otro queda en noShow
  {
    const { A, B, la, lb, c } = pair();
    const sA = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi' }), sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi' });
    run(c, [[sA, 0, null], [sB, 3, null]], 300);
    sB.quit();
    run(c, [[sA, 0, null]], 1000, () => sA.status === 'ended');
    check('salir en «conectando»: tú cancel, el rival noShow (nadie gana ni pierde)', sB.result.why === 'cancel' && sA.status === 'ended' && sA.result.why === 'noShow', [sA.result, sB.result]);
  }
  // d) nombre del rival: el del lobby manda; el del saludo, limpio (nunca un correo ni < >)
  {
    const { A, la } = pair();
    const s1 = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi' });
    s1._onCtl({ k: 'hello', v: A.Net.PROTO, ver: 'test', name: '<i>ana.perez@correo.es</i>' }, 0);
    const s2 = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi' });
    s2._onCtl({ k: 'hello', v: A.Net.PROTO, ver: 'test', name: '<b>Pepe</b>' }, 0);
    const s3 = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi', rivalName: 'Bea' });
    s3._onCtl({ k: 'hello', v: A.Net.PROTO, ver: 'test', name: 'OtroNombre' }, 0);
    check('saludo con correo: no se usa (vacío → «tu rival»); con < >: limpio; el del lobby no lo cambia el saludo', s1.rivalName === '' && s2.rivalName === 'bPepe/b' && s3.rivalName === 'Bea', [s1.rivalName, s2.rivalName, s3.rivalName]);
  }
  // e) ping tras un corte de 14 s (80 ms): los pongs de antes del corte no inflan el ping
  {
    const { A, B, la, lb, c } = pair({ lag: 80, seed: 5 });
    const sA = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi' }), sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi' });
    const L = [[sA, 0, A.Net.bot(0, 1, 'bueno')], [sB, 4321.5, B.Net.bot(1, 2, 'bueno')]];
    run(c, L, 20000);
    const before = Math.round(sA.rtt);
    la.down(14000);
    run(c, L, 14000);
    let worst = 0;
    run(c, L, 6000, () => { if (sA.status === 'playing' && sB.status === 'playing') worst = Math.max(worst, sA.rtt, sB.rtt); return false; });
    check('ping tras volver la red (corte de 14 s, 80 ms): nunca por encima de 200 ms', before > 50 && before < 150 && worst > 0 && worst < 200, { before, worst: Math.round(worst), st: [sA.status, sB.status] });
  }
  // f) (robustez) el invitado recarga la página en pleno partido: enlace nuevo y sesión nueva sin opciones; el anfitrión lo resincroniza
  {
    const { A, B, la, lb, c } = pair({ lag: 60, seed: 8 });
    const sA = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi', rivalName: 'Invi' }), sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi', rivalName: 'Anfi' });
    const botA = A.Net.bot(0, 1, 'bueno');
    run(c, [[sA, 0, botA], [sB, 1234.5, B.Net.bot(1, 2, 'bueno')]], 15000);
    const t1 = sA.gcTick;
    run(c, [[sA, 0, botA]], 6000);                          // la página del invitado se recarga (6 s sin él: el anfitrión espera)
    const waited = sA.status;
    const B2 = load(), [la2, lb2] = A.Net.memPair({ lag: 60, seed: 9, clock: () => c.T });
    sA.link = la2;                                          // (en el juego es el MISMO Link de WebRTC renegociado con gen+1)
    const sB2 = new B2.Net.Session({ slot: 1, link: lb2, opts: null, name: 'Invi', rivalName: 'Anfi' });
    const back = run(c, [[sA, 0, botA], [sB2, 987.25, B2.Net.bot(1, 2, 'bueno')]], 8000, () => sB2.status === 'playing' && sA.status === 'playing');
    const hA = [], hB = []; sA.hashLog = hA; sB2.hashLog = hB;
    run(c, [[sA, 0, botA], [sB2, 987.25, B2.Net.bot(1, 2, 'bueno')]], 20000);
    const mB = new Map(hB.map(x => [x[0], x[1]])); let n = 0, bad = 0; for (const [t, h] of hA) if (mB.has(t)) { n++; if (mB.get(t) !== h) bad++; }
    check('el invitado recarga y vuelve: resync con la foto del anfitrión, mismas opciones y huellas iguales después', t1 > 1000 && waited === 'waiting' && back && sB2.opts && sB2.opts.seed === 77 &&
      n > 10 && bad === 0 && sB2.valid && sA.stats.resyncs >= 1 && !sA.result && !sB2.result, { t1, waited, back, n, bad, st: [sA.status, sB2.status], res: sA.stats.resyncs });
  }
  // g) (fase 6) el ANFITRIÓN recarga en pleno partido: sesión nueva de hueco 0 sin opciones; el invitado le manda SU partida (autoridad
  //    del invitado en este caso) y después las huellas cuadran. g1 = el invitado solo espera; g2 = el invitado siguió contra la IA.
  for (const vsAI of [false, true]) {
    const { A, B, la, lb, c } = pair({ lag: 60, seed: 11 });
    const sA = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi', rivalName: 'Invi' }), sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi', rivalName: 'Anfi' });
    const botB = B.Net.bot(1, 2, 'bueno');
    run(c, [[sA, 0, A.Net.bot(0, 1, 'bueno')], [sB, 1234.5, botB]], 15000);
    const t1 = sB.gcTick, score0 = sB.gc.score.join('-');
    run(c, [[sB, 1234.5, botB]], vsAI ? 20000 : 8000);      // la página del anfitrión se recarga (el invitado espera)
    const waited = sB.status, ai = vsAI ? sB.vsAI() : false, inv0 = sB.valid;
    if (vsAI) run(c, [[sB, 1234.5, botB]], 3000);
    const A2 = load(), [la2, lb2] = A2.Net.memPair({ lag: 60, seed: 12, clock: () => c.T });
    sB.link = lb2;                                          // (en el juego es el MISMO Link de WebRTC renegociado con gen+1)
    const sA2 = new A2.Net.Session({ slot: 0, link: la2, opts: null, name: 'Anfi', rivalName: 'Invi', back: true });
    const adopt0 = sA2.adopt, back0 = sA2.back;
    const botA2 = A2.Net.bot(0, 1, 'bueno');
    const back = run(c, [[sA2, 5555.5, botA2], [sB, 1234.5, botB]], 10000, () => sA2.status === 'playing' && sB.status === 'playing' && !sB.solo);
    const tBack = sA2.gcTick;
    const hA = [], hB = []; sA2.hashLog = hA; sB.hashLog = hB;
    run(c, [[sA2, 5555.5, botA2], [sB, 1234.5, botB]], 20000);
    const mB = new Map(hB.map(x => [x[0], x[1]])); let n = 0, bad = 0; for (const [t, h] of hA) if (mB.has(t)) { n++; if (mB.get(t) !== h) bad++; }
    check('el anfitrión recarga y vuelve' + (vsAI ? ' (el invitado seguía contra la IA)' : '') + ': adopta la partida del invitado, mismas opciones y huellas iguales después',
      t1 > 1000 && waited === 'waiting' && (!vsAI || (ai && !inv0)) && adopt0 && back0 && back && !sA2.adopt && !sA2.back && sA2.opts && sA2.opts.seed === 77 &&
      tBack >= t1 && n > 10 && bad === 0 && sA2.valid && sB.valid && sB.stats.resyncs >= 1 && !sA2.result && !sB.result && sA2.mismatches === 0,
      { t1, tBack, score0, waited, back, n, bad, st: [sA2.status, sB.status], v: [sA2.valid, sB.valid], mm: sA2.mismatches });
  }
  // h) (fase 6) el anfitrión vuelve FUERA de plazo (más de 60 s): el invitado ya lo dio por ido (no cuenta) y le contesta «gone»
  {
    const { A, B, la, lb, c } = pair({ lag: 60, seed: 13 });
    const sA = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi' }), sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi' });
    const botB = B.Net.bot(1, 2, 'bueno');
    run(c, [[sA, 0, A.Net.bot(0, 1, 'bueno')], [sB, 321, botB]], 10000);
    run(c, [[sB, 321, botB]], 62000);
    const A2 = load(), [la2, lb2] = A2.Net.memPair({ lag: 60, seed: 14, clock: () => c.T });
    sB.link = lb2;
    const sA2 = new A2.Net.Session({ slot: 0, link: la2, opts: null, name: 'Anfi', back: true });
    run(c, [[sA2, 0, null], [sB, 321, botB]], 5000, () => sA2.status === 'ended');
    check('el anfitrión vuelve fuera de plazo: no hay vuelta (él noShow, el invitado «no cuenta»)', sA2.status === 'ended' && sA2.result.why === 'noShow' && !sA2.opts &&
      sB.result && sB.result.why === 'hostGone' && !sB.valid, { st: sA2.status, r: [sA2.result, sB.result] });
  }
  // i) (fase 6) el anfitrión vuelve y nadie contesta: espera hasta 40 s (su relink reofrece) y luego noShow
  {
    const { A, la } = pair();
    const sA2 = new A.Net.Session({ slot: 0, link: la, opts: null, name: 'Anfi', back: true }), c2 = { T: 0 };
    run(c2, [[sA2, 0, null]], 30000); const mid = sA2.status;
    run(c2, [[sA2, 0, null]], 11000);
    check('el anfitrión vuelve sin invitado: «conectando» a los 30 s y noShow a los 40 s', mid === 'connecting' && sA2.status === 'ended' && sA2.result.why === 'noShow', { mid, st: sA2.status });
  }
  // j) (auditoría) los DOS recargan a la vez (0 s y 1 s entre una y otra): nadie tiene la partida → los dos en noShow enseguida
  for (const gap of [0, 1000]) {
    const { A, B, la, lb, c } = pair({ lag: 80, seed: 15 });
    const sA = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi', rivalName: 'Invi' }), sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi', rivalName: 'Anfi' });
    run(c, [[sA, 0, A.Net.bot(0, 1, 'bueno')], [sB, 333, B.Net.bot(1, 2, 'bueno')]], 12000);
    const A2 = load(), B2 = load(), [la2, lb2] = A2.Net.memPair({ lag: 80, seed: 16, clock: () => c.T });
    const sA2 = new A2.Net.Session({ slot: 0, link: la2, opts: null, name: 'Anfi', rivalName: 'Invi', back: true });
    const sB2 = new B2.Net.Session({ slot: 1, link: lb2, opts: null, name: 'Invi', rivalName: 'Anfi' }); sB2.back = true;
    if (gap) run(c, [[sA2, 0, null]], gap);
    const t0 = c.T;
    run(c, [[sA2, 0, null], [sB2, 333, null]], 20000, () => sA2.status === 'ended' && sB2.status === 'ended');
    const dt = Math.round(c.T - t0);
    check('los dos recargan (' + gap / 1000 + ' s entre una y otra): los dos en «no hay partido» en menos de 2 s', dt < 2000 && sA2.result && sA2.result.why === 'noShow' && sB2.result && sB2.result.why === 'noShow',
      { dt, st: [sA2.status, sB2.status], r: [sA2.result, sB2.result] });
  }
  // k) (auditoría) el resync del anfitrión se pierde en un segundo corte (lo del canal fiable viejo no llega tras renegociar): se repite
  //    hasta el 'rsok' y no hace falta reparar con foto
  {
    const { A, B, la, lb, c } = pair({ lag: 80, seed: 17 });
    const sA = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi', rivalName: 'Invi' }), sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi', rivalName: 'Anfi' });
    const botA = A.Net.bot(0, 1, 'bueno'), botB = B.Net.bot(1, 2, 'bueno'), L = [[sA, 0, botA], [sB, 444.5, botB]];
    run(c, L, 15000);
    la.down(15000); run(c, L, 11000);
    const ai = sA.vsAI();
    let dropped = 0; const send0 = la.send.bind(la);
    la.send = function (ch, d) { if (!dropped && ch === 'ctl' && /"k":"resync"/.test(d)) { dropped = 1; la.down(2000); return; } return send0(ch, d); };
    let waitMs = 0, w0 = -1;
    run(c, L, 12000, () => { if (sA.status === 'waiting' && w0 < 0) w0 = c.T; if (sA.status !== 'waiting' && w0 >= 0) { waitMs = Math.max(waitMs, c.T - w0); w0 = -1; } return false; });
    const hA = [], hB = []; sA.hashLog = hA; sB.hashLog = hB;
    run(c, L, 10000);
    const mB = new Map(hB.map(x => [x[0], x[1]])); let n = 0, bad = 0; for (const [t, h] of hA) if (mB.has(t)) { n++; if (mB.get(t) !== h) bad++; }
    check('resync perdido en un segundo corte: se repite, sin reparación con foto, espera corta y huellas iguales', ai && dropped && sB.stats.rsIn >= 1 && sA.mismatches === 0 &&
      sA.status === 'playing' && sB.status === 'playing' && n > 5 && bad === 0 && waitMs < 3500 && !sA.rsPend, { dropped, rsIn: sB.stats.rsIn, mm: sA.mismatches, n, bad, waitMs: Math.round(waitMs), st: [sA.status, sB.status] });
  }
  // l) (auditoría) «Conexión inestable» no parpadea al empezar (en la cuenta atrás no viaja nada)
  {
    const { A, B, la, lb, c } = pair({ lag: 300, seed: 18, loss: 0 });
    const sA = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi' }), sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi' });
    let flick = 0;
    for (let i = 0; i < 400; i++) { c.T += 16.7; for (const [s, off] of [[sA, 0], [sB, 77]]) { const r = s.advance(c.T + off, null); if (r.unstable) flick++; } }
    check('al empezar (RTT 300, sin pérdida) nunca sale «Conexión inestable»', sA.status === 'playing' && sB.status === 'playing' && flick === 0, { flick, st: [sA.status, sB.status] });
  }
  // m) (auditoría) mensajes de un rival malicioso: acotados (huellas fuera de rango, snapok sin reparación, resync y retraso absurdos)
  {
    const { A, B, la, lb, c } = pair({ lag: 40, seed: 19 });
    const sA = new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfi' }), sB = new B.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invi' });
    run(c, [[sA, 0, null], [sB, 5, null]], 4000);
    const ep = sA.epoch;
    for (let i = 0; i < 5000; i++) sA._onCtl({ k: 'hash', t: 1e9 + i * 120, h: 1, ep }, c.T);
    sA._onCtl({ k: 'hash', t: 121, h: 1, ep }, c.T);
    const keys = Object.keys(sA.theirHash).length;
    const t0 = Date.now(); for (let i = 0; i < 2000; i++) sA._onCtl({ k: 'snapok', t: 0, ep }, c.T); const snapMs = Date.now() - t0;
    const gc0 = sB.gcTick, ok0 = sB._applyResync({ k: 'resync', T: 0, F: 10, d: B.Sim.serialize(sB.gc), t0: 0, mine: { length: 1e15 }, fab: [] }, c.T);
    const C = load(), [lc, ld] = C.Net.memPair({ lag: 0, seed: 20, clock: () => c.T });
    const sG = new C.Net.Session({ slot: 1, link: ld, opts: null, name: 'Invi' });
    const tD = Date.now(); sG._onCtl({ k: 'hello', v: C.Net.PROTO, ver: C.VERSION || '', name: 'x', cfg: { opts, delay: 2147483647 } }, 0); const dMs = Date.now() - tD;
    const sE = new C.Net.Session({ slot: 1, link: ld, opts: null, name: 'Invi', expect: { even: true, bestOf: 1, points: 11, venue: 'hall' } });
    sE._onCtl({ k: 'hello', v: C.Net.PROTO, ver: C.VERSION || '', name: 'x', cfg: { opts: Object.assign({}, opts, { even: false }), delay: 2 } }, 0);
    const sOk = new C.Net.Session({ slot: 1, link: ld, opts: null, name: 'Invi', expect: { even: false, bestOf: 1, points: 11, venue: 'hall' } });
    sOk._onCtl({ k: 'hello', v: C.Net.PROTO, ver: C.VERSION || '', name: 'x', cfg: { opts, delay: 2 } }, 0);
    check('rival malicioso: huellas fuera de rango no se guardan, snapok sin reparación no recorre nada, resync con mine.length enorme se descarta, retraso acotado a 8',
      keys <= 2 && snapMs < 200 && ok0 === false && sB.gcTick === gc0 && sG.delay === 8 && dMs < 200, { keys, snapMs, ok0, delay: sG.delay, dMs });
    check('«Igualado» (y sets, puntos, sede): si el anfitrión manda otra cosa que la sala, el invitado no juega (mismatch); si coincide, sí',
      sE.status === 'ended' && sE.result.why === 'mismatch' && !sE.opts && sOk.opts && sOk.status === 'connecting', { e: [sE.status, sE.result], ok: sOk.status });
  }
})();

console.log('\n' + oks + ' ok, ' + fails + ' fallos');
process.exit(fails ? 1 : 0);
