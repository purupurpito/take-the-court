#!/usr/bin/env node
/* MAKE THE CUT — tools/loantest.js (owner: carrera-loan)
 * Prueba de las cesiones y de pedir el traspaso (js/career-loan.js, VB.CareerLoan) en node puro (vm, sin DOM):
 *   1. Contrato: autopiloto de 3 semillas × 4 temporadas, playa y pista, con y sin el fichero: fuera de loan/inbox/msgN (y de lo que
 *      quita storyhelp.strip), la carrera es idéntica.
 *   2. Determinismo: la misma carrera con las mismas acciones (pedir cesión, ir cedido, pedir el traspaso) da el mismo JSON. Ningún
 *      Math.random en el fichero.
 *   3. Guardados viejos sin c.loan cargan y ensure lo crea; un c.loan corrupto se sanea sin lanzar errores.
 *   4. Traspaso: los cuatro casos (renew, yes, loan, no) con estados preparados; firmar (también en verano), «Prefiero salir» (−10 de
 *      malestar), insistir y una sola petición por tramo.
 *   5. Cesión de media temporada en pista y en playa: opciones en la ventana, ir cedido con el mismo sueldo, sin ventana de mitad,
 *      vuelta al club de origen (contrato, pareja y plantilla), confianza según la nota, review/history/log y ofertas desde el origen;
 *      review.move es el de tu club y review.loan.move el del club de la cesión; las jornadas de baja no cuentan en la nota.
 *   6. Cesión de temporada entera: no con 1 temporada de contrato (tampoco pedida en la segunda vuelta); con 3 → vuelve con 2 sin
 *      renovación; con 2 → hay renovación; la plantilla de pista no vuelve con un año de retraso.
 *   7. Medidas: malestar a mitad de temporada (rotación en un club mejor e indiscutible), propuestas del club y reparto de notas
 *      (20 cesiones de mitad por modo: A entre el 10 y el 25 %, D 35 % o menos; 20 de temporada entera, más holgado: A 5-30 %, D 40 %).
 *   8. Textos de los mensajes y de las pantallas (ui.*): sin «{», «undefined», «NaN», «1.er» ni «·».
 *   9. Sin career-story ni career-world: todo funciona igual.
 * Uso: node tools/loantest.js   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./storyhelp.js');
const LOAN = 'js/career-loan.js';
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }
const BAD = /\{|\}|undefined|NaN|\.er\b|·/;
const TEXTS = [];   // todos los textos vistos (sección 8)

const bootL = (o) => H.boot(Object.assign({ extra: [LOAN] }, o || {}));
function stripL(c) { const o = JSON.parse(H.strip(c)); delete o.loan; return JSON.stringify(o); }
function eng(B, mode) { return mode === 'hall' ? B.C.hall : B.C.beach; }
function grabMsgs(c) { (c.inbox || []).forEach(m => { if (m.k === 'loan' || /Traspaso|Cesi|cesi|minutos|Vuelves|plantado|renov|Renov|sitio/.test(m.t)) TEXTS.push(m.t + ' — ' + m.x); }); }

/** Carrera de rotación en un club claramente mejor que tú: la base de casi todas las pruebas. years = contrato. */
function mkRot(B, mode, seed, years, role) {
  const C = B.C, E = eng(B, mode);
  let c = mode === 'hall' ? C.create({ mode: 'hall', name: 'Cesión Pista', num: 8, pos: 'OH', seed, now: 1 })
    : C.create({ mode: 'beach', name: 'Cesión Playa', num: 7, role: 'atk', seed, now: 1 });
  let k;
  if (mode === 'hall') {
    const lid = c.leagues.some(L => L.id === c.cc + '2') ? c.cc + '2' : c.cc + '1';
    const l = c.clubs.filter(x => x.lid === lid).sort((a, b) => b.ovr - a.ovr || a.id - b.id);
    k = l[Math.floor(l.length / 3)];
  } else {
    const l = c.clubs.filter(x => x.lvl === 0).sort((a, b) => b.q - a.q || a.id - b.id);
    k = l[1];
  }
  E._joinClub(c, { club: k.id, role: role || 'Rotación', lid: k.lid, lvl: k.lvl, q: k.q }, years || 2);
  E.save(c);
  return E.load();
}
/** Una jornada tuya (simulada o banquillo). */
function step(B, mode) { const E = eng(B, mode), c = E.load(); if (c.phase === 'off' || c.phase === 'pick') return null; return E.simulateNext(c); }
/** Juega hasta que se cumpla cond(c) o acabe la temporada. */
function until(B, mode, cond, max) { const E = eng(B, mode); let g = 0; while (g++ < (max || 90)) { const c = E.load(); if (cond(c)) return true; if (c.phase === 'off') return cond(c); if (!step(B, mode)) return cond(E.load()); } return cond(E.load()); }
const midOpen = (B) => (c) => B.VB.CareerLoan.midOpen(c);

// ------------------------------------------------------------------ 1. contrato
section('1. Contrato: misma carrera con y sin js/career-loan.js (sin elegir nada)');
for (const mode of ['beach', 'hall']) {
  let same = 0, opts = 0, msgs = 0; const bad = [];
  for (const seed of [97, 1234, 50001]) {
    const a = H.autopilot(bootL(), { mode, seasons: 4, seed }), b = H.autopilot(H.boot({}), { mode, seasons: 4, seed });
    if (stripL(a) === stripL(b)) same++; else bad.push(seed);
    msgs += (a.inbox || []).filter(m => m.k === 'loan' || /minutos/.test(m.t)).length; grabMsgs(a);
    ok(!!a.loan && a.loan.v === 1, mode + ' ' + seed + ': c.loan creado al vuelo (malestar ' + a.loan.mood + ')');
  }
  ok(same === 3, mode + ': idéntica en ' + same + ' de 3 semillas × 4 temporadas' + (bad.length ? ' — distintas: ' + bad.join(',') : ''));
}
// rotación sin tocar nada: el club puede proponer cesiones, pero la carrera no cambia
for (const mode of ['beach', 'hall']) {
  const run = (B) => { mkRot(B, mode, 777, 3); for (let s = 0; s < 2; s++) { until(B, mode, c => c.phase === 'off'); B.C.stay(1); } return eng(B, mode).load(); };
  const a = run(bootL()), b = run(H.boot({}));
  ok(stripL(a) === stripL(b), mode + ': rotación 2 temporadas sin elegir nada → idéntica (malestar ' + a.loan.mood + ', cesiones ' + a.loan.log.length + ')');
  grabMsgs(a);
}

// ------------------------------------------------------------------ 2. determinismo
section('2. Determinismo con acciones y sin Math.random');
function driven(mode, seed) {
  const B = bootL(), L = B.VB.CareerLoan, E = eng(B, mode);
  mkRot(B, mode, seed, 3);
  const log = [];
  for (let s = 0; s < 3; s++) {
    until(B, mode, c => midOpen(B)(c) || c.phase === 'off');
    let c = E.load();
    if (midOpen(B)(c)) { log.push(L._askLoan(c)); if (c.loan.opts.length) log.push(L._take(c, 0)); E.save(c); }
    until(B, mode, c => c.phase === 'off');
    c = E.load(); log.push(L._ask(c)); E.save(c);
    if (c.loan.ask && c.loan.ask.k === 'renew') { log.push(L._answer(c, 'sign')); E.save(c); }
    B.C.stay(1);
  }
  return { c: E.load(), log };
}
for (const mode of ['beach', 'hall']) {
  const a = driven(mode, 4242), b = driven(mode, 4242);
  ok(JSON.stringify(a.c) === JSON.stringify(b.c), mode + ': mismo JSON entero con las mismas acciones (' + a.log.join(',') + ')');
  grabMsgs(a.c);
}
const src = fs.readFileSync(path.join(H.ROOT, LOAN), 'utf8');
ok(!/Math\.random/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), 'ningún Math.random en ' + LOAN);
ok(!/g\.rng/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), 'ningún g.rng en ' + LOAN);

// ------------------------------------------------------------------ 3. guardados viejos y corruptos
section('3. Guardados viejos y c.loan corrupto');
for (const mode of ['beach', 'hall']) {
  const B0 = H.boot({}); mkRot(B0, mode, 31, 2); until(B0, mode, c => c.week >= 3);
  const key = mode === 'hall' ? 'make-the-cut.career6' : 'make-the-cut.career';
  const raw = B0.mem[key];
  const B = bootL(); B.mem[key] = raw; if (mode === 'hall') B.mem['make-the-cut.career.mode'] = 'hall';
  let c = eng(B, mode).load();
  ok(!!c && c.loan === undefined, mode + ': guardado sin c.loan carga');
  const l = B.VB.CareerLoan.ensure(c);
  ok(l && l.mood === 0 && Array.isArray(l.opts) && l.on === null && l.seg === -1, mode + ': ensure crea c.loan por defecto');
  const j1 = JSON.stringify(c.loan); B.VB.CareerLoan.ensure(c);
  ok(JSON.stringify(c.loan) === j1, mode + ': ensure es idempotente');
  let thrown = '';
  try {
    for (const bad of ['x', 7, [], { mood: 'x', opts: [{ club: 99999 }, 'y', null], on: { club: 99999, home: 3 }, ask: { k: 'renew' }, want: { at: 'luna' }, log: 'z', extra: 5 }]) {
      c.loan = bad; B.VB.CareerLoan.ensure(c);
      if (!(c.loan && c.loan.mood === 0 && c.loan.opts.length === 0 && c.loan.on === null && c.loan.ask === null && c.loan.want === null && Array.isArray(c.loan.log))) thrown += ' mal saneado ' + JSON.stringify(bad);
    }
    ok(c.loan.extra === 5, mode + ': una clave desconocida se conserva');
    c.loan = { mood: 'x', on: { club: c.myClub, s: c.season, home: { club: c.myClub, contract: 'no' } } }; eng(B, mode).save(c);
    step(B, mode); step(B, mode);
  } catch (e) { thrown += ' ' + e.message; }
  ok(!thrown, mode + ': c.loan corrupto se sanea y la carrera sigue' + thrown);
  c = eng(B, mode).load();
  ok(c.loan.on === null && (c.inbox || []).some(m => m.t === 'Cesión cerrada'), mode + ': una cesión incoherente se cierra con un mensaje neutro');
}

// ------------------------------------------------------------------ 4. traspaso
section('4. Pedir el traspaso: los cuatro casos');
for (const mode of ['beach', 'hall']) {
  const B = bootL(), L = B.VB.CareerLoan, E = eng(B, mode);
  mkRot(B, mode, 555, 2);
  until(B, mode, c => c.week >= 3);
  const base = JSON.stringify(E.load());
  const C = B.VB.Career.beach;
  /** Prueba el caso con semillas distintas hasta dar con la respuesta esperada (la tirada solo depende de la semilla). */
  function force(prep, want) {
    for (let s = 1; s < 80; s++) {
      const c = JSON.parse(base); c.seed = (c.seed + s * 7919) >>> 0; prep(c); B.VB.CareerLoan.ensure(c);
      const r = L._ask(c);
      if (r === want) return c;
    }
    return null;
  }
  const boost = c => { Object.keys(c.player.st).forEach(k => { c.player.st[k] += 25; }); };
  const rn = force(c => { c.contract.role = 'Rotación'; c.coach = 62; boost(c); }, 'renew');
  ok(!!rn && rn.loan.ask && rn.loan.ask.k === 'renew' && rn.loan.ask.role === 'Titular' && rn.loan.ask.years >= 2, mode + ': renew (rotación que destaca y entrenador contento) → propuesta de titular');
  if (rn) {
    const ct0 = JSON.parse(JSON.stringify(rn.contract)), coach0 = rn.coach, q = rn.loan.ask;
    ok(L._ask(rn) === '', mode + ': con la respuesta pendiente no se puede volver a pedir');
    ok(L._answer(rn, 'sign') === 'ok' && rn.contract.role === 'Titular' && rn.contract.salary === q.salary && rn.contract.left === q.years && rn.contract.since === rn.season,
      mode + ': firmar cambia rol (' + ct0.role + ' → ' + rn.contract.role + '), sueldo (' + ct0.salary + ' → ' + rn.contract.salary + ') y años (' + ct0.left + ' → ' + rn.contract.left + ')');
    ok(rn.coach === Math.min(100, coach0 + 5) && rn.loan.ask === null, mode + ': firmar da +5 de confianza');
    ok(L._ask(rn) === '', mode + ': una sola petición por tramo');
    grabMsgs(rn);
  }
  {
    const lv = force(c => { c.contract.role = 'Rotación'; c.coach = 62; boost(c); c.loan = { mood: 52 }; }, 'renew');
    ok(!!lv && L._answer(lv, 'leave') === 'ok' && lv.listed && lv.loan.mood === 42, mode + ': «Prefiero salir» → transferible y −10 de malestar (' + (lv && lv.loan.mood) + ')');
  }
  const ys = force(c => { c.contract.role = 'Titular'; c.coach = 40; c.loan = { mood: 52 }; }, 'yes');
  ok(!!ys && ys.listed === true && ys.coach === 36 && ys.loan.mood === 42, mode + ': yes (malestar 52) → transferible, −4 de confianza y −10 de malestar');
  const ln = force(c => { c.contract.role = 'Rotación'; c.coach = 40; c.contract.left = 3; c.loan = { mood: 0 }; c.stats.bench = 3; c.stats.starts = 0; c.stats.subIn = 0; }, 'loan');
  ok(!!ln && ln.loan.ask.k === 'loan' && (ln.loan.want || ln.loan.opts.length), mode + ': loan (rotación sin minutos) → «te cedemos» y cesión buscada (' + (ln && (ln.loan.want ? 'para la ventana ' + ln.loan.want.at : ln.loan.opts.length + ' opciones')) + ')');
  if (ln) { const c0 = ln.coach; ok(L._answer(ln, 'insist') === 'ok' && ln.listed && ln.coach === Math.max(0, c0 - 12) && !ln.loan.want, mode + ': insistir tras «te cedemos» → transferible y −12'); grabMsgs(ln); }
  const no = force(c => { c.contract.role = 'Titular'; c.coach = 40; c.contract.left = 3; c.loan = { mood: 0 }; c.stats.bench = 0; c.stats.starts = 3; c.stats.subIn = 0; }, 'no');
  ok(!!no && no.loan.ask.k === 'no' && !no.listed, mode + ': no (titular que juega) → «no estás en venta»');
  if (no) {
    const c1 = JSON.parse(JSON.stringify(no)); L.ensure(c1);
    const k0 = no.coach; ok(L._answer(no, 'ok') === 'ok' && no.coach === k0 + 2 && !no.listed, mode + ': aceptarlo → +2 de confianza');
    ok(L._answer(c1, 'insist') === 'ok' && c1.listed && c1.coach === Math.max(0, k0 - 12) && c1.loan.mood === 0, mode + ': insistir → transferible y −12');
    grabMsgs(no);
  }
  // en verano: firmar suma una temporada (newSeason resta una)
  const B2 = bootL(), E2 = eng(B2, mode); mkRot(B2, mode, 556, 3); until(B2, mode, c => c.phase === 'off');
  const baseOff = JSON.stringify(E2.load());
  let rs = null;
  for (let s = 1; s < 80 && !rs; s++) { const c = JSON.parse(baseOff); c.seed = (c.seed + s * 104729) >>> 0; c.contract.role = 'Rotación'; c.coach = 62; boost(c); B2.VB.CareerLoan.ensure(c); if (B2.VB.CareerLoan._ask(c) === 'renew') rs = c; }
  if (rs) {
    const y = rs.loan.ask.years; B2.VB.CareerLoan._answer(rs, 'sign');
    ok(rs.contract.left === y + 1 && rs.contract.since === rs.season + 1, mode + ': firmar en verano → left = años + 1 y empieza la temporada que viene');
    E2.save(rs); B2.C._reset(); B2.C.stay(1);
    const c = E2.load(); ok(c.contract.left === y && c.contract.role === 'Titular', mode + ': tras el verano quedan ' + y + ' temporadas de titular');
  } else ok(false, mode + ': no salió renew en verano');
}

/** Movimiento del club id en c.review.moves (+1 sube, −1 baja, 0 nada). Antes de aplicar los movimientos (verano). */
function mvOf(c, id) {
  const m = (c.review.moves || []).find(x => x.id === id), k = c.clubs.find(x => x.id === id); if (!m) return 0;
  if (c.mode === 'hall') { const lv = lid => (c.leagues.find(L => L.id === lid) || {}).lvl; return lv(m.to) < lv(k.lid) ? 1 : -1; }
  return m.to > k.lvl ? 1 : -1;
}
// ------------------------------------------------------------------ 5. cesión de media temporada
section('5. Cesión de media temporada');
const GRADES = { A: 0, B: 0, C: 0, D: 0 };
for (const mode of ['hall', 'beach']) {
  let done = false;
  for (const seed of [101, 202, 303, 404, 505, 606]) {
    const B = bootL(), L = B.VB.CareerLoan, E = eng(B, mode);
    mkRot(B, mode, seed, 2);
    if (!until(B, mode, midOpen(B))) continue;
    let c = E.load();
    const r = L._askLoan(c);
    if (r !== 'ok') { E.save(c); continue; }
    const opts = c.loan.opts.slice();
    ok(opts.length >= 1 && opts.length <= 3, mode + ' ' + seed + ': en la ventana salen ' + opts.length + ' cesiones');
    if (mode === 'hall') {
      const me = c.clubs.find(k => k.id === c.myClub), L0 = c.leagues.find(x => x.id === me.lid);
      ok(opts.every(o => o.depth && o.depth.start), mode + ': todas de titular (saldrías de inicio)');
      ok(opts.every(o => { const k = c.clubs.find(x => x.id === o.club), Lk = c.leagues.find(x => x.id === k.lid); return Lk.cc === L0.cc && Lk.strength <= L0.strength && k.ovr <= me.ovr - 2; }), mode + ': de tu país, liga igual o más floja y club más flojo');
    } else {
      const me = c.clubs.find(k => k.id === c.myClub);
      ok(opts.every(o => { const k = c.clubs.find(x => x.id === o.club); return (k.lvl === me.lvl && k.q <= me.q - 0.05) || k.lvl === me.lvl - 1; }), mode + ': tu circuito (club más flojo) o el de abajo');
      ok(opts.every(o => o.mateP && o.mateP.name), mode + ': cada una con la pareja que tendrías');
    }
    const home = c.myClub, ct0 = JSON.parse(JSON.stringify(c.contract)), coach0 = c.coach, mate0 = c.mate ? JSON.stringify(c.mate.name) : '', sq0 = c.squad ? c.squad.map(x => x.name).join() : '';
    ok(L._take(c, 0) === 'ok' && c.myClub === opts[0].club && c.contract.salary === ct0.salary && c.contract.loan === 1, mode + ': ir cedido cambia de club con el mismo sueldo (' + ct0.salary + ')');
    ok(B.C.ext.any('midOffers', [c]) && B.C.ext.any('holdOffers', [c]), mode + ': cedido: sin ventana de mitad y ofertas de fin retenidas');
    ok(L._ask(c) === '' && L._askLoan(c) === '', mode + ': cedido no se puede pedir el traspaso ni otra cesión');
    E.save(c);
    const sv = B.mem[mode === 'hall' ? 'make-the-cut.career6' : 'make-the-cut.career'];
    ok(JSON.parse(sv).loan.on && JSON.parse(sv).loan.on.home.club === home, mode + ': la cesión queda guardada con el club de origen');
    until(B, mode, c => c.phase === 'off');
    c = E.load(); grabMsgs(c);
    const x = c.review && c.review.loan;
    ok(c.myClub === home && !c.loan.on, mode + ': al acabar la temporada vuelves al club de origen');
    ok(c.contract.club === home && c.contract.years === ct0.years && (c.contract.salary === ct0.salary || (x && x.promo)) && c.contract.left === ct0.left && !c.contract.loan, mode + ': contrato de origen restaurado');
    if (mode === 'beach') ok(JSON.stringify(c.mate.name) === mate0 && c.mate.form === 0 && c.squad.map(x => x.name).join() === sq0, mode + ': pareja y plantilla restauradas');
    else ok(!c.sq6 || c.sq6.club === home, mode + ': plantilla de pista del club de origen');
    ok(!!x && /^[ABCD]$/.test(x.grade) && c.coach === Math.max(0, Math.min(100, coach0 + L.NUM.GRADE_COACH[x.grade])), mode + ': nota ' + (x && x.grade) + ' (' + (x && x.n) + ' partidos, ' + (x && x.nota) + ') y confianza ' + coach0 + ' → ' + c.coach);
    const hh = c.history[c.history.length - 1];
    ok(hh.club === opts[0].club && hh.loan && hh.loan.from === home, mode + ': el historial marca la temporada como cedido');
    ok(c.loan.log.length === 1 && c.loan.last && c.loan.last.grade === x.grade, mode + ': log y last de la cesión');
    ok(c.window === 'end' && c.offers.every(o => o.club !== home) && c.inbox.some(m => /^Fin de la temporada/.test(m.t)) && c.inbox.some(m => /^Vuelves a/.test(m.t)), mode + ': ofertas y mensaje de fin desde el club de origen (' + c.offers.length + ' ofertas)');
    ok(!!x && x.move === mvOf(c, opts[0].club) && c.review.move === mvOf(c, home), mode + ': review.move es el de tu club (' + c.review.move + ') y review.loan.move el de la cesión (' + (x && x.move) + ')');
    if (x) GRADES[x.grade]++;
    B.C.stay(1);
    c = E.load();
    ok(c.season === 2 && c.myClub === home && c.phase === 'league', mode + ': empieza la temporada siguiente en el club de origen');
    done = true; break;
  }
  ok(done, mode + ': hubo una semilla con cesión de mitad completa');
}

{
  const B = bootL(), L = B.VB.CareerLoan;
  const c = { mode: 'beach', season: 1, notes: [{ nota: 6.5 }, { nota: 6.5 }, { nota: 6.5 }, { nota: 6.5 }], stats: { played: 4, bench: 4, starts: 0, subIn: 0 } };
  const on = { n0: 0, b0: { played: 0, bench: 0, starts: 0, subIn: 0 }, xo: 0 };
  const g0 = L.grade(c, on); on.xo = 4; const g1 = L.grade(c, on);
  ok(g0.J === 8 && g1.J === 4 && g1.out === 0 && g1.letter === 'A' && g0.letter !== 'A', 'las jornadas de baja no cuentan en la nota (J ' + g0.J + ' → ' + g1.J + ', ' + g0.letter + ' → ' + g1.letter + ')');
}

// ------------------------------------------------------------------ 6. cesión de temporada entera
section('6. Cesión de temporada entera');
for (const mode of ['hall', 'beach']) {
  for (const yrs of [1, 3, 2]) {
    let did = false;
    for (const seed of [11, 22, 33, 44, 55]) {
      const B = bootL(), L = B.VB.CareerLoan, E = eng(B, mode);
      mkRot(B, mode, seed, yrs); until(B, mode, c => c.phase === 'off');
      let c = E.load();
      if (yrs === 1) {
        const B1 = bootL(), E1 = eng(B1, mode); mkRot(B1, mode, seed, 1);
        until(B1, mode, c => c.phase !== 'league' || (B1.VB.CareerLoan.seg(c) % 10 === 5 && !B1.VB.CareerLoan.midOpen(c)));
        const c1 = E1.load(), w1 = B1.VB.CareerLoan.info(c1).loanWhy;
        ok(c1.phase === 'off' || (/contrato/.test(w1) && B1.VB.CareerLoan._askLoan(c1) === ''), mode + ': segunda vuelta de la última temporada: no se pide la cesión de verano («' + w1 + '»)');
      }
      if (yrs === 1) { ok(/contrato/.test(L.info(c).loanWhy) && L._askLoan(c) === '', mode + ': con 1 temporada de contrato no hay cesión («' + L.info(c).loanWhy + '»)'); did = true; break; }
      if (L._askLoan(c) !== 'ok') continue;
      const home = c.myClub, left0 = c.contract.left;
      ok(c.loan.optAt === 'end' && c.loan.opts.every(o => o.len === 'season'), mode + ' (' + yrs + '): cesiones de temporada entera');
      const sq0 = c.mode === 'hall' && c.sq6 ? c.sq6.season : null;
      ok(L._take(c, 0) === 'ok' && c.season === 2 && c.phase === 'league' && c.myClub !== home && c.loan.on.home.contract.left === left0 - 1, mode + ' (' + yrs + '): empieza la temporada cedido; el contrato de origen guarda ' + (left0 - 1));
      E.save(c);
      until(B, mode, c => c.phase === 'off');
      c = E.load(); grabMsgs(c);
      ok(c.myClub === home && !c.loan.on && c.contract.left === left0 - 1, mode + ' (' + yrs + '): vuelves con ' + c.contract.left + ' temporadas de contrato');
      if (mode === 'hall') ok(!c.sq6 || (c.sq6.club === home && c.sq6.season !== sq0), mode + ' (' + yrs + '): la plantilla de origen no vuelve con un año de retraso (' + sq0 + ' → ' + (c.sq6 ? c.sq6.season : 'nueva') + ')');
      ok(yrs === 3 ? !c.review.renew : !!c.review.renew, mode + ' (' + yrs + '): ' + (yrs === 3 ? 'sin renovación' : 'el club de origen te propone renovar'));
      if (c.review.loan) GRADES[c.review.loan.grade]++;
      did = true; break;
    }
    ok(did, mode + ' (' + yrs + '): caso probado');
  }
}

// ------------------------------------------------------------------ 7. medidas
section('7. Medidas: malestar, propuestas del club y notas');
for (const mode of ['hall', 'beach']) {
  const mids = [], tops = []; let props = 0, seasons = 0;
  for (let seed = 1; seed <= 12; seed++) {
    for (const role of ['Rotación', 'Titular indiscutible']) {
      const B = bootL(), E = eng(B, mode); mkRot(B, mode, 9000 + seed, 3, role);
      let max = 0, atMid = null;
      for (let s = 0; s < 2; s++) {
        let g = 0;
        while (g++ < 90) {
          const c = E.load(); if (c.phase === 'off') break;
          step(B, mode); const c2 = E.load(); max = Math.max(max, c2.loan ? c2.loan.mood : 0);
          if (atMid == null && c2.loan && c2.loan.midS === c2.season) atMid = c2.loan.mood;
        }
        const c = E.load();
        if (role === 'Rotación') { seasons++; if (c.inbox.some(m => m.t === 'El club te propone una cesión' && m.s === c.season)) props++; if (atMid != null) mids.push(atMid); }
        atMid = null; B.C.stay(1);
      }
      if (role !== 'Rotación') tops.push(max);
    }
  }
  const hi = mids.filter(v => v >= 45).length, pct = Math.round(100 * hi / Math.max(1, mids.length));
  console.log('  ' + mode + ': malestar a mitad (rotación) ' + JSON.stringify(mids) + ' → ' + pct + ' % con 45 o más; propuestas del club ' + props + ' en ' + seasons + ' temporadas (' + Math.round(10 * props / Math.max(1, seasons) * 10) / 10 + ' por 10)');
  console.log('  ' + mode + ': máximo del indiscutible ' + JSON.stringify(tops));
  if (mode === 'hall') ok(pct >= 25 && pct <= 50, mode + ': rotación en club mejor, 45 o más a mitad en el 25-50 % (' + pct + ' %)');
  else ok(pct <= 50, mode + ': playa, rotación con 45 o más a mitad como mucho en la mitad (' + pct + ' %)');
  ok(props <= seasons * 0.6, mode + ': el club no propone la cesión casi siempre (' + props + ' en ' + seasons + ' temporadas)');
  ok(tops.every(v => v <= 25), mode + ': el indiscutible nunca pasa de 25 (máx. ' + Math.max.apply(null, tops) + ')');
}
console.log('  notas de las cesiones de las pruebas: ' + JSON.stringify(GRADES));
for (const mode of ['hall', 'beach']) {
  const G = { A: 0, B: 0, C: 0, D: 0 }; let n = 0;
  for (let seed = 7001; seed <= 7020; seed++) {
    const B = bootL(), L = B.VB.CareerLoan, E = eng(B, mode); mkRot(B, mode, seed, 2);
    if (!until(B, mode, midOpen(B))) continue;
    let c = E.load(); if (!c.loan.opts.length && L._askLoan(c) !== 'ok') continue;
    if (L._take(c, 0) !== 'ok') continue; E.save(c);
    until(B, mode, c => c.phase === 'off'); c = E.load();
    if (c.review && c.review.loan) { G[c.review.loan.grade]++; n++; }
  }
  const pA = Math.round(100 * G.A / Math.max(1, n)), pD = Math.round(100 * G.D / Math.max(1, n));
  ok(n >= 15 && pA >= 10 && pA <= 25 && pD <= 35, mode + ': reparto de notas en ' + n + ' cesiones ' + JSON.stringify(G) + ' → A ' + pA + ' %, D ' + pD + ' %');
  // temporada entera (se pide en verano con 3 temporadas de contrato)
  const GS = { A: 0, B: 0, C: 0, D: 0 }; let ns = 0;
  for (let seed = 7001; seed <= 7020; seed++) {
    const B = bootL(), L = B.VB.CareerLoan, E = eng(B, mode); mkRot(B, mode, seed, 3);
    until(B, mode, c => c.phase === 'off');
    let c = E.load(); if (!c.loan.opts.length && L._askLoan(c) !== 'ok') continue;
    if (L._take(c, 0) !== 'ok') continue; E.save(c);
    until(B, mode, c => c.phase === 'off'); c = E.load();
    if (c.review && c.review.loan) { GS[c.review.loan.grade]++; ns++; }
  }
  const sA = Math.round(100 * GS.A / Math.max(1, ns)), sD = Math.round(100 * GS.D / Math.max(1, ns));
  ok(ns >= 15 && sA >= 5 && sA <= 30 && sD <= 40, mode + ': reparto de notas en ' + ns + ' cesiones de temporada entera ' + JSON.stringify(GS) + ' → A ' + sA + ' %, D ' + sD + ' %');
}

// ------------------------------------------------------------------ 8. textos
section('8. Textos de mensajes y pantallas');
const fakeHLP = { esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])),
  sp: (a) => a.filter(x => x !== '' && x != null).join(' | '), crest: () => '<i class="crest"></i>', ph: () => false, q: (t, x) => '<button class="sp-q">?</button>' };
const fakePh = Object.assign({}, fakeHLP, { ph: () => true });
const htmlText = h => h.replace(/<[^>]*>/g, ' ');
for (const mode of ['hall', 'beach']) {
  const B = bootL(), L = B.VB.CareerLoan, E = eng(B, mode); mkRot(B, mode, 101, 2);
  const shots = [];
  const take = (tag) => { const c = E.load(); for (const H2 of [fakeHLP, fakePh]) { ['transfer', 'offers', 'match', 'seasonEnd'].forEach(k => { const h = L.ui[k](c, H2); if (h) shots.push([tag + ' ' + k, h]); }); } };
  until(B, mode, c => c.week >= 2); take('inicio');
  let c = E.load(); L._demo('renew', c); take('renovar'); c.loan.ask = null; L._demo('no', c); take('no'); c.loan.ask = null; c.loan.seg = -1;
  c.loan.mood = 70; take('quemado');
  L._demo('opts', c); take('opciones');
  L._demo('on', c); take('cedido');
  L._demo('back', c); c = E.load(); take('vuelta'); grabMsgs(c);
  const bad = shots.filter(([t, h]) => BAD.test(htmlText(h)) || /="undefined"|NaN/.test(h));
  ok(shots.length >= 10 && !bad.length, mode + ': ' + shots.length + ' pantallas sin «{», «undefined», «NaN», «1.er» ni «·»' + (bad.length ? ' — ' + bad.map(x => x[0] + ': ' + htmlText(x[1]).slice(0, 160)).join(' / ') : ''));
  ok(shots.some(([t, h]) => /data-act="ln-ask"/.test(h)) && shots.some(([t, h]) => /data-act="ln-take"/.test(h)) && shots.some(([t, h]) => /data-a="sign"/.test(h)), mode + ': hay botones de pedir, ir cedido y firmar');
  ok(shots.filter(([t]) => /cedido transfer/.test(t)).every(([t, h]) => /Cedido/.test(h) && /No recibes ofertas/.test(h)), mode + ': tarjeta «Cedido» en Club › Contrato');
  ok(shots.some(([t, h]) => /vuelta seasonEnd/.test(t) && /Fin de la cesión/.test(h)), mode + ': tarjeta «Fin de la cesión» en el fin de temporada');
  const U = (B.VB.CareerUIExt || []).find(x => x.id === 'loan');
  ok(!!U && U.prefix === 'ln-' && U.replace && U.replace.transfer && U.dot && U.act, mode + ': registrado en VB.CareerUIExt');
  ok(U.act('ln-ask', { getAttribute: k => k === 'aria-disabled' ? 'true' : null }) === false, mode + ': un botón desactivado no hace nada');
  const ords = TEXTS.join(' ').match(/\b\d+\.?(er|º|r|ª)\b/g) || [];
  ok(ords.every(o => /^\d+(r|º)$/.test(o) && (/^(1|3)r$/.test(o) || /º$/.test(o))), mode + ': ordinales con «1r/2º/3r» (' + (ords.length ? ords.slice(0, 5).join(', ') : 'ninguno') + ')');
}
const badMsgs = TEXTS.filter(t => BAD.test(t));
ok(TEXTS.length > 20 && !badMsgs.length, 'mensajes de la bandeja (' + TEXTS.length + ') sin «{», «undefined», «NaN», «1.er» ni «·»' + (badMsgs.length ? ' — ' + badMsgs.slice(0, 3).join(' / ') : ''));

// ------------------------------------------------------------------ 9. sin story ni world
section('9. Sin career-story ni career-world');
for (const mode of ['hall', 'beach']) {
  const files = H.BASE.filter(f => f !== 'js/career-world.js').concat([LOAN]);
  let did = false, err = '';
  for (const seed of [101, 202, 303, 404]) {
    try {
      const B = H.boot({ files }), L = B.VB.CareerLoan, E = eng(B, mode);
      ok(!B.VB.CareerStory && !B.VB.CareerWorld, mode + ': cargado sin story ni world');
      mkRot(B, mode, seed, 2);
      if (!until(B, mode, midOpen(B))) continue;
      let c = E.load(); if (L._askLoan(c) !== 'ok') continue;
      const home = c.myClub; L._take(c, 0); E.save(c);
      until(B, mode, c => c.phase === 'off'); c = E.load();
      ok(c.myClub === home && c.review.loan && c.window === 'end', mode + ': cesión de ida y vuelta sin story ni world (nota ' + c.review.loan.grade + ')');
      did = true; break;
    } catch (e) { err += e.message; }
  }
  ok(did && !err, mode + ': sin errores' + (err ? ' — ' + err : ''));
}

console.log('\n' + passes + ' comprobaciones, ' + fails + ' fallos');
console.log(fails ? 'HAY FALLOS' : 'TODO OK');
process.exit(fails ? 1 : 0);
