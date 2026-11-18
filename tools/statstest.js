#!/usr/bin/env node
/* MAKE THE CUT — tools/statstest.js (owner: ui_main)
 * Prueba de la «Estadística del partido» (js/matchstats.js) sin navegador: carga sim + IA + matchstats en un contexto vm, juega
 * partidos enteros con el autopilot (2v2 pista, 2v2 playa, 6v6) pasando cada evento a VB.MatchStats.ingest como hace ui.js y
 * comprueba que:
 *  - el marcador del registro coincide con el de la sim (sets y puntos de cada set);
 *  - puntos de cada equipo = acciones propias que deciden + errores del rival (todo el partido y por set), y la suma de las filas
 *    de jugadores no supera al total del equipo;
 *  - cada fundamento cuadra: total = # + + + ! + − + / + = (y el ataque: # + = + / + resto);
 *  - registrar no cambia la sim (misma huella de puntos y de g.rng con y sin MatchStats) y el cálculo es determinista
 *    (dos partidos con la misma semilla dan el mismo modelo; dos cálculos del mismo log, también);
 *  - un punto anulado por challenge sustituye al anterior (no suma dos).
 * Uso: node tools/statstest.js [partidos por formato = 3]
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const N = Math.max(1, +(process.argv[2] || 3));
let fails = 0, oks = 0;
const ok = (msg, cond, extra) => { if (cond) oks++; else { fails++; console.log('  FALLO: ' + msg + (extra ? ' (' + extra + ')' : '')); } };

function load(withMS) {
  const ctx = { console, Math, Date };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const files = ['js/sim.js', 'js/ai.js', 'js/ai6.js'].concat(withMS ? ['js/matchstats.js'] : []);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.VB;
}

/** Juega un partido entero con autopilot; devuelve {g, pts (secuencia de puntos), rng (llamadas)}. */
function play(VB, opts, useMS) {
  const S = VB.Sim, DT = 1 / VB.C.SIM_HZ, MS = useMS ? VB.MatchStats : null;
  const g = S.createGame(Object.assign({ demo: false, autopilot: true, difficulty: 'normal' }, opts));
  let calls = 0; const rng0 = g.rng; g.rng = function () { calls++; return rng0.apply(this, arguments); };
  if (rng0.get) { g.rng.get = rng0.get; g.rng.set = rng0.set; }
  const pts = [], evs = [];
  let over = null;
  // (los eventos de antes del primer paso, como newMatch de createGame, también)
  for (let i = 0; i < 90 * 60 * VB.C.SIM_HZ && !over; i++) {
    if (i) S.step(g, DT, null);
    evs.length = 0; S.drainEvents(g, evs);
    for (const e of evs) {
      if (MS) MS.ingest(e, g);
      if (e.type === 'point') pts.push(e.team + e.how + e.score.join('-'));
      if (e.type === 'gameOver') over = e;
    }
  }
  return { g, pts, over, calls };
}

function sumF(b) { let s = 0; for (const c of ['#', '+', '!', '-', '/', '=']) s += b[c] | 0; return s; }
function checkModel(VB, M, g, label, set) {
  for (let t = 0; t < 2; t++) {
    const TT = M.teams[t], tm = TT.team;
    const want = set ? g.setScores[set - 1][t] : g.setScores.reduce((a, s) => a + s[t], 0);
    ok(label + ' equipo ' + t + ': puntos = propios + errores del rival', tm.ours + tm.rivalErr === want, (tm.ours + tm.rivalErr) + ' frente a ' + want);
    ok(label + ' equipo ' + t + ': puntos contados = marcador', TT.pts === want, TT.pts + ' frente a ' + want);
    ok(label + ' equipo ' + t + ': regalados del uno = errores del rival del otro', tm.ourErr === M.teams[1 - t].team.rivalErr);
    ok(label + ' equipo ' + t + ': Pts del total = propios', TT.T.pts === tm.ours, TT.T.pts + ' / ' + tm.ours);
    ok(label + ' equipo ' + t + ': Err del total = regalados', TT.T.err === tm.ourErr, TT.T.err + ' / ' + tm.ourErr);
    let rp = 0, re = 0;
    for (const s of TT.list) { rp += s.pts; re += s.err; }
    ok(label + ' equipo ' + t + ': suma de jugadores ≤ equipo', rp <= TT.T.pts && re <= TT.T.err, rp + '/' + TT.T.pts + ' ' + re + '/' + TT.T.err);
    for (const f of ['S', 'R', 'A', 'B', 'D', 'E', 'F']) ok(label + ' equipo ' + t + ': ' + f + ' total = suma de la escala', TT.T[f].t === sumF(TT.T[f]), TT.T[f].t + ' / ' + sumF(TT.T[f]));
    const A = TT.T.A;
    ok(label + ' equipo ' + t + ': ataques = # + = + / + resto', A.t === A['#'] + A['='] + A['/'] + (A['+'] + A['!'] + A['-']));
    ok(label + ' equipo ' + t + ': side-out + break = rallies', tm.soT + tm.brT === M.mom.length);
    let zn = TT.zones.S.inZ + TT.zones.S.out + TT.zones.S.none;
    ok(label + ' equipo ' + t + ': saques en el mapa = saques', zn === TT.T.S.t || zn + 1 >= TT.T.S.t, zn + ' / ' + TT.T.S.t);
    if (M.size === 6 && !set) ok(label + ' equipo ' + t + ': rotaciones con datos', Object.keys(TT.rot).length > 0);
    // render sin errores (cadena)
    const h = VB.MatchStats.html(M, t, { names: ['A', 'B'] });
    ok(label + ' equipo ' + t + ': HTML sin «·» ni undefined/NaN', h.length > 1000 && h.indexOf('·') < 0 && !/undefined|NaN/.test(h));
  }
}

const VBm = load(true), VB0 = load(false);
const FORMATS = [
  { k: '2v2 pista', o: { points: 15 } },
  { k: '2v2 playa', o: { venue: 'beach', points: 15 } },
  { k: '6v6', o: { format: '6v6', points: 15 } },
  { k: '6v6 sets a 25', o: { format: '6v6' }, n: 1 }
];
for (const F of FORMATS) {
  console.log('[' + F.k + ']');
  for (let n = 0; n < (F.n || N); n++) {
    const seed = 1000 + n * 77;
    const A = play(VBm, Object.assign({ seed }, F.o), true);
    const lbl = F.k + ' semilla ' + seed;
    ok(lbl + ': partido acabado', !!A.over);
    if (!A.over) continue;
    // la sim no cambia por registrar
    const B = play(VB0, Object.assign({ seed }, F.o), false);
    ok(lbl + ': misma secuencia de puntos con y sin registro', A.pts.join('|') === B.pts.join('|'));
    ok(lbl + ': mismas llamadas a g.rng con y sin registro', A.calls === B.calls, A.calls + ' / ' + B.calls);
    const MS = VBm.MatchStats, d = MS.data();
    ok(lbl + ': hay datos', MS.ready());
    const M = MS.compute(d, 0);
    ok(lbl + ': sets del registro = sets de la sim', JSON.stringify(M.setScores) === JSON.stringify(A.g.setScores), JSON.stringify(M.setScores) + ' / ' + JSON.stringify(A.g.setScores));
    checkModel(VBm, M, A.g, lbl, 0);
    for (let s = 1; s <= A.g.setScores.length; s++) checkModel(VBm, MS.compute(d, s), A.g, lbl + ' set ' + s, s);
    // determinismo: mismo log → mismo modelo; misma semilla → mismo modelo
    const j1 = JSON.stringify(M), j2 = JSON.stringify(MS.compute(d, 0));
    ok(lbl + ': cálculo determinista', j1 === j2);
    if (n === 0) {
      const C = play(VBm, Object.assign({ seed }, F.o), true);
      ok(lbl + ': misma semilla, mismo modelo', JSON.stringify(VBm.MatchStats.compute(VBm.MatchStats.data(), 0)) === j1);
      const T0 = M.teams[0].T;
      console.log('  ' + A.g.setScores.map(s => s.join('-')).join(' ') + ' | equipo 0: S ' + T0.S.t + ' (#' + T0.S['#'] + ' =' + T0.S['='] + ') R ' + T0.R.t + ' A ' + T0.A.t +
        ' (#' + T0.A['#'] + ' =' + T0.A['='] + ' /' + T0.A['/'] + ') B# ' + T0.B['#'] + ' D ' + T0.D.t + ' X ' + T0.X.t + ' | jugadores ' + M.teams[0].list.length + '+' + M.teams[1].list.length);
    }
  }
}

// ------------------------------------------------------------------ challenge: el punto vuelto a pitar sustituye al anterior
console.log('[challenge]');
{
  const MS = VBm.MatchStats, g = { setNo: 1, size: 2, HL: 9, HW: 4.5, serving: 0, points: 15 };
  const p = (id, team, num) => ({ id, team, num });
  const P0 = p(0, 0, 1), P2 = p(2, 1, 3);
  MS.ingest({ type: 'newMatch' }, g);
  MS.ingest({ type: 'serveReady', team: 0, player: P0 }, g);
  MS.ingest({ type: 'hit', kind: 'serve', team: 0, player: P0, grade: 'good', quality: 0.6, x: 9, y: 0 }, g);
  MS.ingest({ type: 'land', x: -9.1, y: 1, inside: false }, g);
  MS.ingest({ type: 'point', team: 1, how: 'error', reason: 'out', score: [0, 1] }, g);
  MS.ingest({ type: 'point', team: 0, how: 'ace', reason: 'in', score: [1, 0] }, g);    // vuelto a pitar en el mismo paso
  MS.ingest({ type: 'challengeResult', overturned: true }, g);
  let M = MS.compute(MS.data(), 0);
  ok('punto anulado y vuelto a pitar: un solo rally', M.mom.length === 1 && M.teams[0].team.ours === 1 && M.teams[1].pts === 0);
  // con el saque siguiente ya preparado (serveReady) antes de resolver el challenge
  MS.ingest({ type: 'serveReady', team: 0, player: P0 }, g);
  MS.ingest({ type: 'hit', kind: 'serve', team: 0, player: P0, grade: 'good', quality: 0.6, x: 9, y: 0 }, g);
  MS.ingest({ type: 'hit', kind: 'pass', team: 1, player: P2, grade: 'poor', quality: 0.3, recv: true, shot: 'shank', x: -7, y: 1 }, g);
  MS.ingest({ type: 'point', team: 0, how: 'ace', reason: 'out', score: [2, 0] }, g);
  MS.ingest({ type: 'serveReady', team: 0, player: P0 }, g);
  MS.ingest({ type: 'point', team: 1, how: 'error', reason: 'out', score: [1, 1] }, g);  // anulado: era fuera del receptor… y no
  M = MS.compute(MS.data(), 0);
  ok('challenge con el saque siguiente preparado: sustituye al rally anterior', M.mom.length === 2 && M.teams[1].pts === 1 && M.teams[0].pts === 1, JSON.stringify(M.mom));
  const R = M.teams[1].T.R;
  ok('recepción desviada en un ace contada como R=', R.t === 1 && R['='] === 1 || R['-'] === 1);
  // zonas
  const D = { HL: 9, HW: 4.5 };
  ok('zona 4 del equipo 1 (su izquierda delante: x < 0, y > 0; mira hacia +x)', MS._zoneOf(-1, 3, 1, D) === 4);
  ok('zona 2 del equipo 1 (su derecha delante: x < 0, y < 0)', MS._zoneOf(-1, -3, 1, D) === 2);
  ok('zona 1 del equipo 0 (su derecha detrás: x > 0, y > 0; mira hacia −x)', MS._zoneOf(8, 3, 0, D) === 1);
  ok('zona 5 del equipo 0 (su izquierda detrás: x > 0, y < 0)', MS._zoneOf(8, -3, 0, D) === 5);
  ok('zona 6 del equipo 0 (centro detrás)', MS._zoneOf(7, 0, 0, D) === 6);
  ok('campo propio sin zona', MS._zoneOf(5, 0, 1, D) === -1);
}

console.log('[castigo]');   // Ambiente de Carrera: amb:card + point{penalty} (sin acciones; una falta del sancionado)
{
  const MS = VBm.MatchStats, g = { setNo: 1, size: 2, HL: 9, HW: 4.5, serving: 0, points: 15, score: [0, 0] };
  const P0 = { id: 0, team: 0, num: 1 }, P2 = { id: 2, team: 1, num: 3 };
  MS.ingest({ type: 'newMatch' }, g);
  MS.ingest({ type: 'serveReady', team: 0, player: P0 }, g);
  MS.ingest({ type: 'hit', kind: 'serve', team: 0, player: P0, grade: 'good', quality: 0.6, x: 9, y: 0 }, g);
  MS.ingest({ type: 'land', x: -9.1, y: 1, inside: false }, g);
  MS.ingest({ type: 'point', team: 1, how: 'error', reason: 'out', score: [0, 1] }, g);
  MS.ingest({ type: 'amb:card', amb: true, team: 1, pid: 2, num: 3, who: 'player', color: 'red', reason: 'protesta', score: [0, 1], penalty: true }, g);
  MS.ingest({ type: 'point', team: 0, how: 'penalty', reason: 'penalty', penalty: true, sideout: true, faultPlayer: P2, score: [1, 1] }, g);
  const d = MS.data(), M = MS.compute(d, 0);
  ok('castigo: dos rallies (el punto anterior no se sustituye)', d.rallies.length === 2 && d.rallies[0].w === 1 && d.rallies[1].w === 0 && d.rallies[1].pen === 1);
  ok('castigo: sanción registrada antes del rally del punto', d.san.length === 1 && d.san[0].i === 1 && d.san[0].lv === 'penalty');
  ok('castigo: punto para el equipo 0 como falta del rival', M.teams[0].pts === 1 && M.teams[1].T.X.t === 1, JSON.stringify([M.teams[0].pts, M.teams[1].T.X]));
}

console.log(fails ? '\n' + fails + ' FALLOS (' + oks + ' ok)' : '\nTODO OK (' + oks + ' comprobaciones)');
process.exit(fails ? 1 : 0);
