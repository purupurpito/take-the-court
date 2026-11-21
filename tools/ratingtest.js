#!/usr/bin/env node
/* TAKE THE COURT — tools/ratingtest.js (owner: carrera)
 * Prueba headless de la nota en directo (js/rating.js, VB.Rating) y de su enganche en career.js (ingest, liveRating, matchDone).
 * No abre Chrome.
 *   Sin opciones (rápida): tabla de acciones, fmt, soft (0-10, el techo de rating()), determinismo (dos pasadas iguales), avisos por
 *   jugada (redondeo y sin cifra), setOn (reescala al entrar), cierre idempotente, punto anulado por challenge (undo), avisos con
 *   el techo suave, participación parcial (titular cambiado, suplente que entra) frente a rating() con meR y equivalencia con
 *   rating() en 20 partidos de autopilot (mismos recuentos de acciones que ingest y nota parecida). Acaba en «TODO OK».
 *   RATINGTEST_V=1: imprime también las comprobaciones que pasan.
 *   RATINGTEST_CAL=1: calibrado (notes/nota-en-directo-spec.md §4). Graba partidos enteros con los bots novato, medio y bueno de
 *   tools/simtest.js (playa Regional T1, pista de receptor contra Normal a 25 y a 15, prueba en playa y en pista) con la nota de hoy
 *   (ingest + rating/trialGrade) y los eventos ya resueltos (jugador → 0/1/−1) en tools/out/rating-cal/*.json; luego los repasa sin
 *   la sim probando parámetros (rejilla) hasta cumplir las tolerancias, e imprime la medida. RATINGTEST_REUSE=1: usa lo grabado.
 *   RATINGTEST_N=k: partidos por casilla (por defecto 24). Va en paralelo con worker_threads (RATINGTEST_W hilos, por defecto 4).
 * Uso: node tools/ratingtest.js     Sale con 1 si algo falla.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'tools', 'out', 'rating-cal');

// ------------------------------------------------------------------ contexto (sim + career + rating) y bots de simtest
function load() {
  const mem = {};
  const ls = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const ctx = { console, Math, Date, JSON, Set, localStorage: ls, process: { env: {} } }; ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/rating.js', 'js/career.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const VB = ctx.VB, S = VB.Sim, C = VB.C, DT = 1 / C.SIM_HZ;
  // bots de tools/simtest.js: el trozo desde «const BOTS = {» hasta «function topWhy(» (ese fichero no es un módulo)
  let bots = null;
  try {
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'simtest.js'), 'utf8'), a = src.indexOf('const BOTS = {'), b = src.indexOf('function topWhy(');
    if (a > 0 && b > a) bots = vm.runInContext('(function (S, C, DT, VB) {' + src.slice(a, b) + '; return { BOTS: BOTS, makeBot: makeBot }; })', ctx)(S, C, DT, VB);
  } catch (e) { bots = null; }
  return { ctx, VB, S, DT, bots };
}

// eventos que lee VB.Rating, ya resueltos (jugador → 0 tu jugador | 1 compañero o equipo | −1 rival) y compactos
const TYPES = { hit: 1, block: 1, point: 1, set: 1, match: 1, newSet: 1, sub: 1, lineup: 1 };
function slot(g, pl) {
  if (!pl || !g.teams) return -1;
  if (g.size === 6) return pl === g.ctrl ? 0 : pl.team === 0 ? 1 : -1;
  return g.teams[0][0] === pl ? 0 : g.teams[0][1] === pl ? 1 : -1;
}
function pack(g, e) {
  const o = { type: e.type };
  for (const k of ['team', 'kind', 'touch', 'grade', 'human', 'recv', 'dig', 'how', 'reason', 'meIn', 'meOut', 'setNo']) if (e[k] !== undefined && e[k] !== null && e[k] !== false) o[k] = e[k];
  if (e.recv === false) o.recv = false;
  if (e.dig === false) o.dig = false;
  if (e.shot === 'tip' || e.shot === 'shank') o.shot = e.shot;
  if ('player' in e) o.player = slot(g, e.player);
  if (e.assist !== undefined) o.assist = e.assist ? slot(g, e.assist) : null;   // (como lo lee la nota en directo: undefined = deducirla de la jugada; null = sin asistencia)
  if (e.assist !== undefined) o.assist = slot(g, e.assist);
  return o;
}

// ------------------------------------------------------------------ un partido (bot o autopilot) con ingest de career.js
const FMT = {
  beach: { label: 'playa Regional T1 (21/21/15, Fácil)' },
  h25: { label: 'pista receptor a 25 (Normal)' },
  h15: { label: 'pista receptor a 15 (Normal)' },
  tbeach: { label: 'prueba playa (1 set a 15)' },
  thall: { label: 'prueba pista receptor (1 set a 15)' }
};
function playOne(E, job) {
  const { VB, S, DT, bots } = E, K = VB.Career, B = K.beach, H = K.hall;
  const fmt = job.fmt, hall = fmt === 'h25' || fmt === 'h15' || fmt === 'thall', trial = fmt === 'tbeach' || fmt === 'thall', seed = job.seed;
  const role = hall ? 'OH' : seed % 2 ? 'atk' : 'cr', club = [28, 34, 40][seed % 3];
  let opts;
  if (!hall) {
    const r = S._makeRng(seed * 31 + club), G = B.genSt, cl = trial ? 40 : club;
    opts = { seed: 3000 + seed * 7 + club, serveClock: true, difficulty: 'easy', ctrl: 'one', ctrlIdx: 0, venue: 'beach', points: trial ? 15 : 21,
      attrs: [[G(35, role, null), G(cl + 3, role === 'atk' ? 'cr' : 'atk', null)], [G(cl + 1, 'atk', r), G(cl - 1, 'cr', r)]] };
  } else opts = { format: '6v6', seed: 900 + seed * 13, difficulty: 'normal', ctrl: 'one', ctrlRole: 'OH', points: fmt === 'h25' ? 25 : 15 };
  if (trial) opts.sets = 1;
  if (job.autopilot) { opts.autopilot = true; opts.points = 11; delete opts.sets; }
  const g = S.createGame(opts);
  const fakeC = hall ? { mode: 'hall', player: { roleKey: 'OH' } } : { player: { roleKey: role } };
  const goals = trial ? (hall ? H : B).trialGoals(fakeC) : null;
  // ingest se salta g.autopilot: una vista de la partida sin la marca (las demás claves, en vivo por el prototipo)
  const gw = Object.create(g); gw.autopilot = false;
  gw.career = { mode: hall ? 'hall' : 'beach', trial: trial, goals: goals, role: role, pos: hall ? 'OH' : undefined, meOn: true };
  const bot = job.autopilot || !bots ? null : bots.makeBot(bots.BOTS[job.bot], 77 + seed * 5, hall ? { six: true, role: 'OH' } : null);
  const ev = [], rec = [];
  for (let i = 0; i < 3600 * 120 && !(g.finished && g.mode === 'over'); i++) {
    S.step(g, DT, bot ? bot(g) : null); ev.length = 0; S.drainEvents(g, ev);
    K.ingest(ev, gw);
    // (punto anulado por challenge: como ingest, el primer 'point' del paso con challengeResult overturned deshace el anterior: undo)
    let ovr = ev.some(e => e.type === 'challengeResult' && e.overturned);
    for (const e of ev) if (TYPES[e.type]) { const o = pack(g, e); if (ovr && e.type === 'point') { o.undo = true; ovr = false; } rec.push(o); }
  }
  const m = B._M(), me = m.p[0], sc = g.setScores.map(x => [x[0], x[1]]), sets = [g.sets[0], g.sets[1]], res = { sets, setScores: sc };
  const R = m.rallies, win = sets[0] > sets[1];
  let old, met = 0, live;
  if (trial) {
    const go = (hall ? H : B).trialGrade(fakeC, me, res, R, goals);
    old = go.nota; met = go.met;
    live = (hall ? H : B).trialGrade(fakeC, me, res, R, goals, m.rt).nota;
  } else {
    old = B.rating(me, { win, sets }, R, hall ? H.RATE6.OH : 1);
    live = VB.Rating.close(m.rt, res).nota;
  }
  const out = { fmt, bot: job.bot || 'autopilot', seed, R, sets, sc, old, live, met, points: g.points, toWin: g.toWin, rol: hall ? H.RATE6.OH : 1, stats: Object.assign({}, me), acts: m.rt ? m.rt.acts : null, ev: rec };
  K.abortMatch();
  return out;
}

// ------------------------------------------------------------------ hilo de trabajo (calibrado)
if (!isMainThread) {
  const E = load(), out = [];
  for (const job of workerData.jobs) { try { out.push(playOne(E, job)); } catch (e) { out.push({ err: String(e && e.stack || e), job }); } }
  parentPort.postMessage(out);
  return;
}

let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; if (process.env.RATINGTEST_V) console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }
const E = load(), VB = E.VB, R = VB.Rating;
ok(R && VB.Career, 'VB.Rating y VB.Career cargados');
if (!E.bots) console.log('(aviso: no se pudieron cargar los bots de tools/simtest.js; el calibrado usaría autopilot)');

// ------------------------------------------------------------------ pruebas rápidas
section('Tabla, fmt y soft');
{
  const ids = Object.keys(R.ACTS);
  ok(ids.length === 18 && ids.every(id => typeof R.ACTS[id].txt === 'string' && R.ACTS[id].txt && typeof R.ACTS[id].w === 'number'), 'tabla de acciones: 18 con texto y peso (' + ids.join(', ') + ')');
  ok(['ace', 'kill', 'tip', 'block', 'assist', 'dig', 'recvP'].every(id => R.ACTS[id].w > 0) && ['srvErr', 'atkErr', 'net', 'dbl', 'four', 'pos', 'err', 'blocked', 'recvErr', 'poor'].every(id => R.ACTS[id].w <= 0), 'las buenas suman y las malas restan');
  ok(!R.ACTS.perfect.toast && !R.ACTS.poor.toast && R.ACTS.ace.toast && R.ACTS.srvErr.toast, 'toques perfectos o flojos: sin aviso');
  ok(!/·/.test(ids.map(id => R.ACTS[id].txt).join(' ')), 'textos sin «·»');
  ok(R.fmt(0.3) === '+0,3' && R.fmt(-0.2) === '−0,2' && R.fmt(0.04) === '' && R.fmt(-0.04) === '' && R.fmt(0) === '' && R.fmt(1.25) === '+1,3', 'fmt: coma, signo menos de verdad, vacío si redondea a 0,0');
  const ceil = x => 8.5 + 1.5 * (1 - Math.exp(-(x - 8.5) / 1.5));
  ok(R.soft(6) === 6 && R.soft(8.5) === 8.5 && Math.abs(R.soft(9.7) - ceil(9.7)) < 1e-12 && R.soft(30) <= 10 && R.soft(-30) >= 0 && R.soft(2) > 2 && R.soft(2) < 3, 'soft: igual en 3-8,5, el techo de rating(), suelo suave, 0-10');
  let mono = true; for (let x = -5; x < 20; x += 0.05) if (R.soft(x + 0.05) < R.soft(x)) mono = false;
  ok(mono, 'soft creciente');
  ok(R.E({ trial: true }) === R.E_TABLE.tb && R.E({ trial: true, hall: true }) === R.E_TABLE.th && R.E({ hall: false, points: 21 }) === R.E_TABLE.b21 && R.E({ hall: true, points: 7 }) >= 24, 'E: tabla medida y fórmula de reserva (mínimo 24)');
}
section('Determinismo, avisos por jugada, setOn y cierre');
{
  const seq = [];
  const rally = (me, how, extra) => { seq.push({ type: 'hit', team: 1, kind: 'serve', touch: 0, player: -1 }, Object.assign({ type: 'hit', team: 0, kind: 'pass', touch: 1, player: me ? 0 : 1, grade: 'perfect', human: me, recv: true }),
    { type: 'hit', team: 0, kind: 'set', touch: 2, player: me ? 1 : 0, grade: 'good', human: !me }, { type: 'hit', team: 0, kind: 'spike', touch: 3, player: me ? 0 : 1, grade: 'good', human: me },
    Object.assign({ type: 'point', team: 0, how: how || 'kill', reason: 'in' }, extra || {})); };
  for (let i = 0; i < 12; i++) rally(i % 3 !== 0);
  seq.push({ type: 'hit', team: 0, kind: 'serve', touch: 0, player: 0, grade: 'good', human: true }, { type: 'point', team: 0, how: 'ace', reason: 'in' });
  seq.push({ type: 'hit', team: 0, kind: 'serve', touch: 0, player: 0, grade: 'poor', human: true }, { type: 'point', team: 1, how: 'error', reason: 'out' });
  seq.push({ type: 'hit', team: 0, kind: 'spike', touch: 3, player: 0, human: true }, { type: 'point', team: 1, how: 'error', reason: 'net', player: 0 });
  seq.push({ type: 'hit', team: 0, kind: 'spike', touch: 3, player: 0, human: true }, { type: 'block', team: 1, player: -1 }, { type: 'point', team: 1, how: 'block', reason: 'in' });
  seq.push({ type: 'hit', team: 1, kind: 'serve', touch: 0, player: -1 }, { type: 'hit', team: 0, kind: 'pass', touch: 1, player: 0, grade: 'poor', human: true, recv: true }, { type: 'point', team: 1, how: 'ace', reason: 'out' });
  seq.push({ type: 'set', team: 0, setNo: 1 }, { type: 'match', team: 0 });
  const run = () => { const st = R.create({ points: 21 }); let n = 0; for (const e of seq) n += R.feed(st, e, null); return { st, n }; };
  const a = run(), b = run();
  ok(JSON.stringify(a.st) === JSON.stringify(b.st), 'determinismo: dos pasadas iguales');
  const ids = a.st.log.map(x => x.id);
  ok(a.st.acts.kill.n === 8 && a.st.acts.assist.n === 4 && a.st.acts.ace.n === 1 && a.st.acts.srvErr.n === 1 && a.st.acts.net.n === 1 && a.st.acts.blocked.n === 1 && a.st.acts.recvErr.n === 1 && a.st.acts.recvP.n === 8, 'recuentos: 8 remates, 4 asistencias, ace, error de saque, red, te bloquean, recepción fallida, 8 recepciones perfectas');
  ok(ids.indexOf('ace') >= 0 && ids.indexOf('srvErr') >= 0 && ids.indexOf('net') >= 0 && (ids.indexOf('blocked') >= 0) === (R.ACTS.blocked.w !== 0) && ids.indexOf('recvErr') >= 0 && ids.indexOf('setW') >= 0 && ids.indexOf('matchW') >= 0, 'avisos: un aviso por jugada y los del set y el partido (' + a.st.log.length + ' últimos: ' + ids.join(', ') + ')');
  ok(a.st.log.length === R.LOG_MAX && a.st.seq > R.LOG_MAX, 'el registro guarda solo los ' + R.LOG_MAX + ' últimos (seq ' + a.st.seq + ')');
  const kp = a.st.log.find(x => x.kind === 'play' && x.d > 0);
  ok(a.st.log.every(x => x.d === Math.round(x.d * 10) / 10 && typeof x.v === 'number'), 'cifras de aviso a una decimal, con la nota tras el aviso');
  // remate en la playa (solo el remate): K × 0,055 redondea a 0,0 → aviso sin cifra («▲ Remate ganado»)
  const nSeq = seq.length, st2 = R.create({ points: 21 });
  for (const e of [{ type: 'hit', team: 0, kind: 'set', touch: 2, player: 1 }, { type: 'hit', team: 0, kind: 'spike', touch: 3, player: 0, grade: 'good', human: true }, { type: 'point', team: 0, how: 'kill', reason: 'in' }]) R.feed(st2, e, null);
  const k0 = st2.log[0];
  ok(k0 && k0.id === 'kill' && k0.txt === 'Remate ganado' && R.fmt(k0.d) === '', 'remate en la playa: aviso «Remate ganado» sin cifra (δ ' + (k0 && k0.d) + ')');
  // la prueba en la pista (receptor): un ace pesa mucho (lo de hoy con trialGrade)
  const st3 = R.create({ hall: true, pos: 'OH', trial: true, toWin: 1, points: 15 });
  R.feed(st3, { type: 'hit', team: 0, kind: 'serve', touch: 0, player: 0, human: true, grade: 'good' }, null); R.feed(st3, { type: 'point', team: 0, how: 'ace', reason: 'in' }, null);
  ok(st3.log[0].id === 'ace' && st3.log[0].d >= 0.4, 'prueba de pista: ace ' + R.fmt(st3.log[0].d));
  // banquillo: congelada; al entrar se reescala con los puntos que quedan
  const st4 = R.create({ hall: true, pos: 'OH', points: 25, on: false }), K0 = st4.K;
  for (let i = 0; i < 40; i++) R.feed(st4, { type: 'point', team: i % 3 ? 0 : 1, how: 'error' }, null);
  ok(R.value(st4) === 6 && st4.meR === 0, 'en el banquillo la nota no se mueve');
  R.feed(st4, { type: 'sub', team: 0, meIn: true }, null);
  ok(st4.on && Math.abs(st4.E - Math.max(24, R.E({ hall: true, points: 25 }) - 40)) < 1e-9 && st4.K > K0, 'setOn al entrar: E = puntos que quedan (' + st4.E + '), K ' + K0.toFixed(3) + ' → ' + st4.K.toFixed(3));
  const K1 = st4.K; R.setOn(st4, false, 50); R.setOn(st4, true, 60);
  ok(st4.K === K1, 'volver a entrar no reescala otra vez');
  // cierre idempotente; tras cerrar no se mueve; sin eventos de set, el cierre los pone
  const st5 = R.create({ points: 21 }); R.feed(st5, { type: 'point', team: 0, how: 'error' }, null);
  const c1 = R.close(st5, { sets: [2, 0], setScores: [[21, 10], [21, 12]] }), c2 = R.close(st5, { sets: [0, 2], setScores: [[1, 21], [2, 21]] });
  R.feed(st5, { type: 'hit', team: 0, kind: 'serve', touch: 0, player: 0 }, null); R.feed(st5, { type: 'point', team: 0, how: 'ace' }, null);
  ok(c1 === c2 && c1.nota === R.value(st5) && c1.nota > 6.5, 'cierre idempotente (' + c1.nota + ', con los 2 sets y la victoria del resultado)');
  const st6 = R.create({ points: 21 }); for (const e of seq.slice(0, nSeq)) R.feed(st6, e, null);
  const c6 = R.close(st6, { sets: [1, 0], setScores: [[21, 15]] });
  ok(c6.nota === a.st.v && c6.best[0].id === 'kill' && c6.worst.length >= 3 && c6.best.every(x => x.d > 0) && c6.worst.every(x => x.d < 0), 'cierre con el set y el partido ya llegados: no se suman dos veces; lo mejor y lo peor');
  const st7 = R.create({ points: 21, trial: true, toWin: 1 }); R.bonus(st7, 'goal', 0.25, 'Objetivo: 2 remates ganados');
  ok(R.value(st7) === 6.3 && st7.log[0].kind === 'goal' && st7.log[0].txt === 'Objetivo: 2 remates ganados' && R.fmt(st7.log[0].d) === '+0,3', 'bonus de objetivo con su aviso (+0,25 → «+0,3»)');
}

section('Challenge anulado, avisos con el techo suave y participación parcial');
{
  // punto anulado por challenge: ace + set + partido, el rival pide challenge y sale overturned → se vuelve a pitar como error de saque
  const pre = [];
  for (let i = 0; i < 30; i++) pre.push({ type: 'point', team: i % 2 ? 1 : 0, how: 'error' });
  pre.push({ type: 'set', team: 0, setNo: 1 }, { type: 'newSet', setNo: 2 });
  for (let i = 0; i < 39; i++) pre.push({ type: 'point', team: i % 2 ? 0 : 1, how: 'error' });
  const ace = [{ type: 'hit', team: 0, kind: 'serve', touch: 0, player: 0, grade: 'good', human: true }, { type: 'point', team: 0, how: 'ace', reason: 'in' }, { type: 'set', team: 0, setNo: 2 }, { type: 'match', team: 0 }];
  const err = [{ type: 'point', team: 1, how: 'error', reason: 'serve', player: 0 }];
  const tail = [{ type: 'newSet', setNo: 3 }];
  for (let i = 0; i < 25; i++) tail.push({ type: 'point', team: i % 3 ? 1 : 0, how: 'error' });
  tail.push({ type: 'set', team: 1, setNo: 2 }, { type: 'set', team: 1, setNo: 3 }, { type: 'match', team: 1 });
  const fin = { sets: [1, 2], setScores: [[21, 19], [20, 22], [10, 15]] };
  const sA = R.create({ points: 21 }); for (const e of pre.concat(ace)) R.feed(sA, e, null);
  const seqA = sA.seq; ok(R.undo(sA) && !sA._t.matched && sA._t.sets === 1 && !sA.acts.ace && sA.log.every(x => x.id !== 'ace' && x.id !== 'matchW'), 'undo: el ace, el set y la victoria del punto anulado se van');
  for (const e of err.concat(tail)) R.feed(sA, e, null);
  const sB = R.create({ points: 21 }); for (const e of pre.concat(err, tail)) R.feed(sB, e, null);
  const cA = R.close(sA, fin), cB = R.close(sB, fin);
  ok(cA.nota === cB.nota && Math.abs(cA.raw - cB.raw) < 1e-9 && sA.seq > seqA, 'challenge anulado: la misma nota que sin el punto anulado (' + cA.nota + ' = ' + cB.nota + '), seq sigue creciendo');
  ok(!R.undo(sA), 'undo tras cerrar: nada');
  // con career.js: lote con el 'point' repetido y 'challengeResult' overturned (como endReview)
  {
    const K = VB.Career, S = E.S, g = S.createGame({ seed: 5, difficulty: 'easy', ctrl: 'one', ctrlIdx: 0, venue: 'beach', points: 21 });
    const gw = Object.create(g); gw.autopilot = false; gw.career = { mode: 'beach', meOn: true };
    const me = g.teams[0][0];
    K.ingest([{ type: 'newMatch' }], gw);
    K.ingest([{ type: 'hit', team: 0, kind: 'serve', touch: 0, player: me, grade: 'good', human: true }, { type: 'point', team: 0, how: 'ace', reason: 'in' }], gw);
    const m = K.beach._M(), a1 = m.p[0].aces, v1 = m.rt.acts.ace ? m.rt.acts.ace.n : 0;
    K.ingest([{ type: 'point', team: 1, how: 'error', reason: 'serve', player: me }, { type: 'challengeResult', team: 1, overturned: true }], gw);
    ok(a1 === 1 && v1 === 1 && m.p[0].aces === 0 && m.p[0].errors === 1 && m.rallies === 1 && !m.rt.acts.ace && m.rt.acts.srvErr && m.rt.acts.srvErr.n === 1 && m.rt.rallies === 1, 'ingest: el ace anulado sale de las estadísticas y de la nota; cuenta el error de saque (un punto jugado)');
    K.abortMatch();
  }
  // avisos con el techo suave: por encima de 8,5 un ace mueve menos que su peso, y el aviso dice lo que se mueve
  const sH = R.create({ hall: true, pos: 'OH', points: 25 }); sH.raw = 3.5;
  R.feed(sH, { type: 'hit', team: 0, kind: 'serve', touch: 0, player: 0, grade: 'good', human: true }, null);
  const v0 = R.soft(6 + 3.5); R.feed(sH, { type: 'point', team: 0, how: 'ace', reason: 'in' }, null);
  const lh = sH.log[sH.log.length - 1], wAce = 0.2 * sH.K;
  ok(lh.id === 'ace' && lh.d < Math.round(wAce * 10) / 10 && Math.abs(lh.d - Math.round((R.soft(6 + 3.5 + wAce) - v0) * 10) / 10) < 1e-9, 'aviso con el techo suave: ace ' + R.fmt(lh.d) + ' (su peso, ' + R.fmt(wAce) + ')');
  // participación parcial: titular de receptor cambiado a los 15 puntos con 3 faltas de red; 0-2 (lo de rating() con meR)
  const B = VB.Career.beach, H = VB.Career.hall, part = (pts, onAt, offAt, mine, total, sets, sc) => {
    const st = R.create({ hall: true, pos: 'OH', points: 25, on: onAt === 0 }); let n = 0;
    for (let i = 0; i < total; i++) {
      if (i === onAt && onAt > 0) R.feed(st, { type: 'sub', team: 0, meIn: true }, null);
      if (i === offAt) R.feed(st, { type: 'sub', team: 0, meOut: true }, null);
      const on = i >= onAt && (offAt < 0 || i < offAt);
      if (on && n < mine.length) { R.feed(st, mine[n].hit, null); R.feed(st, mine[n].pt, null); n++; }
      else R.feed(st, { type: 'point', team: i % 2 ? 1 : 0, how: 'error' }, null);
    }
    return R.close(st, { sets, setScores: sc });
  };
  const net = { hit: { type: 'hit', team: 0, kind: 'spike', touch: 3, player: 0, human: true }, pt: { type: 'point', team: 1, how: 'error', reason: 'net', player: 0 } };
  const kill = { hit: { type: 'hit', team: 0, kind: 'spike', touch: 3, player: 0, grade: 'good', human: true }, pt: { type: 'point', team: 0, how: 'kill', reason: 'in' } };
  const lose = [[18, 25], [20, 25]], c1 = part(25, 0, 15, [net, net, net], 88, [0, 2], lose);
  const r1 = B.rating({ errors: 3 }, { win: false, sets: [0, 2] }, 15, H.RATE6.OH), full = part(25, 0, -1, [net, net, net], 88, [0, 2], lose);
  ok(c1.nota < full.nota - 1 && Math.abs(c1.nota - r1) <= 1.0, 'titular cambiado pronto (15 puntos, 3 faltas de red, 0-2): ' + c1.nota + ' (rating() con meR ' + r1 + '; jugando todo, ' + full.nota + ')');
  const c2 = part(25, 40, -1, [kill, kill, kill, kill], 88, [2, 1], [[25, 20], [20, 25], [15, 10]]);
  const r2 = B.rating({ kills: 4 }, { win: true, sets: [2, 1] }, 48, H.RATE6.OH);
  ok(Math.abs(c2.nota - r2) <= 1.0, 'suplente que entra a los 40 puntos y juega el resto (4 remates, 2-1): ' + c2.nota + ' (rating() con meR ' + r2 + ')');
  const c3 = part(25, 40, 60, [kill, kill, kill, kill], 88, [2, 1], [[25, 20], [20, 25], [15, 10]]);
  const r3 = B.rating({ kills: 4 }, { win: true, sets: [2, 1] }, 20, H.RATE6.OH);
  ok(c3.nota > c2.nota && Math.abs(c3.nota - r3) <= 1.0, 'suplente que entra y vuelve a salir (20 puntos, 4 remates): ' + c3.nota + ' (rating() con meR ' + r3 + ')');
}

section('Equivalencia con rating() en 20 partidos de autopilot (mismos recuentos que ingest)');
{
  let same = 0, dsum = 0, dmax = 0, n = 0;
  const ids = { kills: ['kill', 'tip'], aces: ['ace'], blocks: ['block'], assists: ['assist'], digs: ['dig'], recvP: ['recvP'], perfect: ['perfect'], poor: ['poor'], errors: ['srvErr', 'atkErr', 'net', 'dbl', 'four', 'pos', 'err'] };
  for (let s = 0; s < 20; s++) {
    const r = playOne(E, { fmt: s % 4 === 3 ? 'h15' : 'beach', seed: 50 + s, autopilot: true }); n++;
    let eq = true; for (const k in ids) { const v = ids[k].reduce((t, id) => t + (r.acts[id] ? r.acts[id].n : 0), 0); if (v !== (r.stats[k] | 0)) eq = false; }
    if (eq) same++;
    const d = Math.abs(r.live - r.old); dsum += d; dmax = Math.max(dmax, d);
    // repasar los eventos grabados sin la sim da la misma nota
    if (s === 0) { const st0 = R.create({ points: r.points, toWin: r.toWin }); for (const e of r.ev) { if (e.undo) R.undo(st0); R.feed(st0, e, null); } ok(R.close(st0, { sets: r.sets, setScores: r.sc }).nota === r.live, 'repaso sin la sim: la misma nota (' + r.live + ')'); }
  }
  ok(same === n, 'recuentos de VB.Rating = estadísticas de ingest en ' + same + ' de ' + n + ' partidos');
  ok(dsum / n < 0.6 && dmax < 1.6, 'nota en directo cerca de rating(): diferencia media ' + (dsum / n).toFixed(2) + ', máxima ' + dmax.toFixed(1) + ' (partidos cortos a 11)');
}

// ------------------------------------------------------------------ calibrado (RATINGTEST_CAL=1)
if (process.env.RATINGTEST_CAL) calibrate().then(done, e => { console.log(e && e.stack || e); fails++; done(); });
else done();

function done() {
  console.log('\n' + passes + ' comprobaciones, ' + fails + ' fallos');
  console.log(fails ? fails + ' FALLOS' : 'TODO OK');
  process.exitCode = fails ? 1 : 0;
}

async function calibrate() {
  section('Calibrado: grabar partidos con los bots (novato, medio, bueno) y repasarlos sin la sim');
  const N = Math.max(4, +(process.env.RATINGTEST_N || 24)), BOTS = E.bots ? ['novato', 'medio', 'bueno'] : ['autopilot'];
  const FMTS = ['beach', 'h25', 'h15', 'tbeach', 'thall'];
  let all = [];
  if (process.env.RATINGTEST_REUSE && fs.existsSync(path.join(OUT, 'beach.json'))) {
    for (const f of FMTS) all = all.concat(JSON.parse(fs.readFileSync(path.join(OUT, f + '.json'), 'utf8')));
    console.log('  grabados reutilizados: ' + all.length + ' partidos');
  } else {
    const jobs = [];
    for (const f of FMTS) for (const b of BOTS) for (let s = 1; s <= N; s++) jobs.push({ fmt: f, bot: b === 'autopilot' ? null : b, autopilot: b === 'autopilot', seed: s });
    // los de pista primero (más largos) y repartidos en hilos
    jobs.sort((a, b) => (b.fmt === 'h25') - (a.fmt === 'h25') || (b.fmt === 'h15') - (a.fmt === 'h15'));
    const W = Math.max(1, Math.min(8, +(process.env.RATINGTEST_W || 4))), parts = Array.from({ length: W }, () => []);
    jobs.forEach((j, k) => parts[k % W].push(j));
    const t0 = Date.now();
    const res = await Promise.all(parts.map(p => new Promise((ok2, ko) => { const w = new Worker(__filename, { workerData: { jobs: p } }); w.on('message', ok2); w.on('error', ko); })));
    res.forEach(r => { all = all.concat(r); });
    const errs = all.filter(r => r.err); errs.forEach(r => console.log('  error en ' + JSON.stringify(r.job) + ': ' + r.err.split('\n')[0]));
    ok(!errs.length, 'partidos grabados sin errores');
    all = all.filter(r => !r.err);
    fs.mkdirSync(OUT, { recursive: true });
    for (const f of FMTS) fs.writeFileSync(path.join(OUT, f + '.json'), JSON.stringify(all.filter(r => r.fmt === f)));
    console.log('  ' + all.length + ' partidos grabados en ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s (' + W + ' hilos) → tools/out/rating-cal/');
  }
  // puntos esperados por formato (media de puntos jugados)
  const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const ET = {};
  for (const f of FMTS) ET[f] = Math.round(mean(all.filter(r => r.fmt === f).map(r => r.R)));
  console.log('  puntos por partido (E medido): ' + FMTS.map(f => f + ' ' + ET[f]).join(', ') + '  (E_TABLE de rating.js: ' + JSON.stringify(R.E_TABLE) + ')');
  const ETR = ET;

  // estadísticos suficientes por partido: la nota es lineal en los parámetros (sin cambios: siempre en pista) antes del techo suave
  const ACT = Object.keys(R.ACTS);
  const rows = all.map(r => {
    const st = R.create({ hall: r.fmt[0] === 'h' || r.fmt === 'thall', pos: 'OH', points: r.points, toWin: r.toWin, trial: r.fmt[0] === 't' });
    let won = 0, lost = 0, sw = 0, sl = 0, mw = 0, ml = 0;
    for (const e of r.ev) { R.feed(st, e, null); if (e.type === 'point') { if (e.team === 0) won++; else lost++; } else if (e.type === 'set') { if (e.team === 0) sw++; else sl++; } else if (e.type === 'match') { if (e.team === 0) mw = 1; else ml = 1; } }
    const n = {}; ACT.forEach(id => { n[id] = st.acts[id] ? st.acts[id].n : 0; });
    return { fmt: r.fmt, bot: r.bot, old: r.old, live: r.live, met: r.met, rol: r.rol, R: r.R, won, lost, sw, sl, mw, ml, n, trial: r.fmt[0] === 't' };
  });
  const P0 = R.P0;
  function notaOf(x, P, Etab) {
    const Eh = Etab[x.fmt], kap = x.trial ? P.KAPPA_TRIAL : P.KAPPA, K = 40 / Eh * kap * x.rol, RS = x.trial ? P.RES.trial : P.RES.match;
    let v = 0; for (const id of ACT) if (x.n[id]) v += x.n[id] * (P.W[id] != null ? P.W[id] : R.ACTS[id].w);
    const raw = v * K + P.TEAM_PT * (x.won - x.lost) / Eh - P.OFFSET * (x.won + x.lost) / Eh + RS.setW * x.sw + RS.setL * x.sl + RS.winW * x.mw + RS.winL * x.ml;
    return Math.round(Math.min(10, R.soft(P.START + raw) + (x.trial ? 0.25 * x.met : 0)) * 10) / 10;
  }
  const q = (a, p) => { const b = a.slice().sort((x, y) => x - y), i = (b.length - 1) * p, lo = Math.floor(i); return b[lo] + (b[Math.min(b.length - 1, lo + 1)] - b[lo]) * (i - lo); };
  const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
  const ranks = a => { const ix = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length); let i = 0; while (i < ix.length) { let j = i; while (j + 1 < ix.length && ix[j + 1][0] === ix[i][0]) j++; for (let k = i; k <= j; k++) r[ix[k][1]] = (i + j) / 2; i = j + 1; } return r; };
  const spear = (a, b) => { const ra = ranks(a), rb = ranks(b), ma = mean(ra), mb = mean(rb); let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { s += (ra[i] - ma) * (rb[i] - mb); sa += (ra[i] - ma) ** 2; sb += (rb[i] - mb) ** 2; } return sa && sb ? s / Math.sqrt(sa * sb) : 1; };
  const LET = ['A+', 'A', 'B', 'C', 'D', 'F'], letter = v => VB.Career.trialLetter(v);
  const cells = [];
  for (const f of FMTS) for (const b of BOTS) { const xs = rows.filter(x => x.fmt === f && x.bot === b); if (xs.length) cells.push({ f, b, xs, old: xs.map(x => x.old) }); }
  function evalP(P, Etab, verbose) {
    let loss = 0, bad = [];
    for (const c of cells) {
      const nv = c.xs.map(x => notaOf(x, P, Etab)), o = c.old;
      const dm = mean(nv) - mean(o), so = sd(o), sn = sd(nv), d10 = q(nv, 0.1) - q(o, 0.1), d90 = q(nv, 0.9) - q(o, 0.9), rho = spear(nv, o);
      const tens = nv.filter(v => v >= 10).length, tens0 = o.filter(v => v >= 10).length, lo4 = nv.filter(v => v < 4).length / nv.length - o.filter(v => v < 4).length / o.length;
      const sr = so > 0.05 ? sn / so : 1;
      loss += dm * dm + 0.5 * (d10 * d10 + d90 * d90) + 0.3 * (sr - 1) * (sr - 1);
      const why = [];
      if (Math.abs(dm) > 0.15) why.push('media ' + dm.toFixed(2));
      if (sr < 0.85 || sr > 1.15) why.push('desv ×' + sr.toFixed(2));
      if (Math.abs(d10) > 0.3 || Math.abs(d90) > 0.3) why.push('p10/p90 ' + d10.toFixed(2) + '/' + d90.toFixed(2));
      if (rho < 0.85) why.push('Spearman ' + rho.toFixed(2));
      if (tens > tens0 + (c.f[0] === 't' ? 1 : 0)) why.push(tens + ' dieces (hoy ' + tens0 + ')');
      if (lo4 > 0.02) why.push('< 4 +' + (lo4 * 100).toFixed(0) + ' pp');
      let lt = '';
      if (c.f[0] === 't') {
        const ln = LET.map(L => nv.filter(v => letter(v) === L).length / nv.length), lo = LET.map(L => o.filter(v => letter(v) === L).length / o.length);
        const pn = ln[0] + ln[1] + ln[2], po = lo[0] + lo[1] + lo[2];
        lt = ' letras ' + LET.map((L, i) => L + ' ' + Math.round(lo[i] * 100) + '→' + Math.round(ln[i] * 100)).join(' ') + ' (aprobado ' + Math.round(po * 100) + '→' + Math.round(pn * 100) + ' %)';
        if (c.b === 'medio' || BOTS.length === 1) { if (ln.some((v, i) => Math.abs(v - lo[i]) > 0.05) || Math.abs(pn - po) > 0.04) why.push('letras'); }
        loss += 2 * ln.reduce((s, v, i) => s + (v - lo[i]) * (v - lo[i]), 0);
      }
      if (why.length) { bad.push(c.f + '/' + c.b + ': ' + why.join(', ')); loss += 5 * why.length; }
      if (verbose) console.log('  ' + (FMT[c.f].label + ' ' + c.b).padEnd(44) + ' hoy ' + mean(o).toFixed(2) + ' (' + q(o, 0.1).toFixed(1) + '-' + q(o, 0.9).toFixed(1) + ', σ ' + so.toFixed(2) + ')  en directo ' + mean(nv).toFixed(2) +
        ' (' + q(nv, 0.1).toFixed(1) + '-' + q(nv, 0.9).toFixed(1) + ', σ ' + sn.toFixed(2) + ')  ρ ' + rho.toFixed(2) + (tens || tens0 ? '  dieces ' + tens0 + '→' + tens : '') + lt + (why.length ? '  ✗ ' + why.join(', ') : ''));
    }
    return { loss, bad };
  }
  // 0) con los valores de partida de la especificación y la E medida
  const base = { START: 6, OFFSET: P0.OFFSET, TEAM_PT: P0.TEAM_PT, KAPPA: P0.KAPPA, KAPPA_TRIAL: P0.KAPPA_TRIAL, RES: P0.RES, W: {} };
  console.log('\n  Valores de partida (especificación), E medido:');
  evalP(base, ETR, true);
  // 1) rejilla de los partidos (playa y pista) y luego la prueba
  const RESM = [[0.2, -0.15, 0.2, -0.1], [0.25, -0.15, 0.2, -0.1], [0.2, -0.1, 0.2, -0.1], [0.15, -0.15, 0.15, -0.1], [0.25, -0.2, 0.25, -0.15], [0.3, -0.2, 0.3, -0.15], [0.15, -0.1, 0.15, -0.05]];
  const RESP = o => ({ setW: o[0], setL: o[1], winW: o[2], winL: o[3] });
  const WN = [0, 0.03, 0.06, 0.1];
  const mCells = cells.filter(c => c.f[0] !== 't'), tCells = cells.filter(c => c.f[0] === 't');
  let best = null;
  const cellsAll = cells.slice();
  cells.length = 0; mCells.forEach(c => cells.push(c));
  for (let ka = 0.7; ka <= 1.301; ka += 0.05) for (const of of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) for (const tp of [0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 2.0]) for (const rs of RESM) for (const wb of WN) for (const wr of WN) {
    const P = { START: 6, OFFSET: of, TEAM_PT: tp, KAPPA: ka, KAPPA_TRIAL: 1, RES: { match: RESP(rs), trial: P0.RES.trial }, W: { blocked: -wb, recvErr: -wr } };
    const e = evalP(P, ETR, false);
    // a igualdad, preferir las acciones nuevas con peso (restan algo que hoy no cuenta)
    const L = e.loss - 0.002 * (wb + wr);
    if (!best || L < best.L) best = { P, L, e };
  }
  cells.length = 0; tCells.forEach(c => cells.push(c));
  let bestT = null;
  const RT = []; for (const a of [0.2, 0.25, 0.3, 0.35]) for (const b of [-0.05, -0.1, -0.15, -0.2]) for (const c of [0.2, 0.25, 0.3, 0.35]) for (const d of [0, -0.05, -0.1]) RT.push([a, b, c, d]);
  for (let kt = 0.5; kt <= 1.301; kt += 0.025) for (const rt of RT) {
    const P = Object.assign({}, best.P, { KAPPA_TRIAL: kt, RES: { match: best.P.RES.match, trial: RESP(rt) } });
    const e = evalP(P, ETR, false);
    if (!bestT || e.loss < bestT.e.loss) bestT = { P, e };
  }
  cells.length = 0; cellsAll.forEach(c => cells.push(c));
  const F = bestT.P;
  console.log('\n  Mejor combinación: KAPPA ' + F.KAPPA.toFixed(2) + ', OFFSET ' + F.OFFSET + ', TEAM_PT ' + F.TEAM_PT + ', RES ' + JSON.stringify(F.RES.match) + ', W te bloquean ' + F.W.blocked + ', recepción fallida ' + F.W.recvErr +
    ', KAPPA_TRIAL ' + F.KAPPA_TRIAL.toFixed(2) + ', RES prueba ' + JSON.stringify(F.RES.trial));
  const fin = evalP(F, ETR, true);
  // 2) lo que lleva rating.js ahora mismo (lo que juega la gente), sobre los mismos partidos: debe cumplir las tolerancias
  const cur = { START: 6, OFFSET: P0.OFFSET, TEAM_PT: P0.TEAM_PT, KAPPA: P0.KAPPA, KAPPA_TRIAL: P0.KAPPA_TRIAL, RES: P0.RES, W: Object.assign({}, P0.W) };
  const ETc = { beach: R.E_TABLE.b21, h25: R.E_TABLE.h25, h15: R.E_TABLE.h15, tbeach: R.E_TABLE.tb, thall: R.E_TABLE.th };
  console.log('\n  Lo que lleva js/rating.js (E_TABLE y P0):');
  const now = evalP(cur, ETc, true);
  ok(!now.bad.length, 'js/rating.js cumple las tolerancias del calibrado' + (now.bad.length ? ': ' + now.bad.join('; ') : ''));
  // 3) la cuenta lineal es la de VB.Rating (repaso completo de los eventos con lo que lleva rating.js)
  // (con lo grabado antes de cambiar rating.js, r.live es la nota de entonces: se repasa con VB.Rating de ahora)
  let same = 0, near = 0; all.forEach((r, k) => {
    const st = R.create({ hall: r.fmt[0] === 'h' || r.fmt === 'thall', pos: 'OH', points: r.points, toWin: r.toWin, trial: r.fmt[0] === 't' });
    for (const e of r.ev) R.feed(st, e, null);
    R.close(st, { sets: r.sets, setScores: r.sc });
    const v = Math.round(Math.min(10, R.soft(R.START + st.raw) + (r.fmt[0] === 't' ? 0.25 * r.met : 0)) * 10) / 10, w = notaOf(rows[k], cur, ETc);
    if (v === w) same++; if (Math.abs(v - w) <= 0.1 + 1e-9) near++; });
  ok(near === all.length && same >= 0.98 * all.length, 'la cuenta del calibrado = VB.Rating: igual en ' + same + ' de ' + all.length + ' partidos (el resto, ±0,1 de redondeo)');
  const ex = R.create({ points: 21 }), exH = R.create({ hall: true, pos: 'OH', points: 25 }), exT = R.create({ points: 15, trial: true, toWin: 1 }), exTH = R.create({ hall: true, pos: 'OH', points: 15, trial: true, toWin: 1 });
  console.log('  tamaño de los avisos: playa remate ' + (0.055 * ex.K).toFixed(3) + ', ace ' + (0.2 * ex.K).toFixed(2) + ', error ' + (-0.17 * ex.K).toFixed(2) + ' | pista receptor remate ' + (0.055 * exH.K).toFixed(2) + ', ace ' + (0.2 * exH.K).toFixed(2) + ', error ' + (-0.17 * exH.K).toFixed(2) +
    ' | prueba playa ace ' + (0.2 * exT.K).toFixed(2) + ' | prueba pista ace ' + (0.2 * exTH.K).toFixed(2) + ', error ' + (-0.17 * exTH.K).toFixed(2));
  if (fin.bad.length) console.log('  (la mejor combinación aún falla en: ' + fin.bad.join('; ') + ')');
}
