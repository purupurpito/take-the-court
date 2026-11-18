#!/usr/bin/env node
/* MAKE THE CUT — tools/fluidchaltest.js  (owner: net)
 * Challenge en la conexión Fluida (1.14.1): dos VB.NetFluid.Session unidas por VB.Net.memPair, cada una en su propio contexto vm,
 * con un árbitro que falla mucho (para que haya llamadas que revisar) y 5 challenges por set. Juegan bots (VB.Net.bot); tras cada
 * punto con llamada en contra, el que lo perdió pide challenge con un retraso al azar (de 0 a 6,5 s: en el tiempo del punto, con el
 * saque ya preparado, tarde). Comprueba por partido:
 *   1 los dos acaban en 'over' con el fin cotejado (unverified false), mismos sets y setScores, sbFix 0, ptBad 0, guarda de point() a 0;
 *   2 la misma secuencia de puntos y los mismos challenge / challengeResult (equipo, anulado) en las dos máquinas;
 *   3 cada ch tiene respuesta (chOk + chNo del que decide = chOut del que pide) y los challenges que quedan son los mismos;
 *   4 en el conjunto: hay challenges aceptados, rechazados por tarde (uno por partido, mandado a mano con el saque ya hecho) y alguno
 *     que anula el punto.
 * Uso: node tools/fluidchaltest.js [--n N]   (sale con código 1 si algo falla)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/net.js', 'js/netfluid.js'].map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
const N = (() => { const i = process.argv.indexOf('--n'); return i > 0 ? +process.argv[i + 1] : 6; })();
function load() {
  const ctx = { console, TextEncoder, TextDecoder };
  ctx.globalThis = ctx; vm.createContext(ctx);
  ctx.VB = { VERSION: 'test' };
  for (const [f, s] of SRC) vm.runInContext(s, ctx, { filename: f });
  return ctx.VB;
}
let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : ''));
}
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const REF = { d1: 0.08, p1: 0.9, d2: 0.2, p2: 0.8, d3: 0.4, p3: 0.7, chal: 5 };

function run(cfg) {
  const VA = load(), VBb = load();
  let T = 0;
  const [la, lb] = VA.Net.memPair({ lag: cfg.rtt, jit: cfg.jit || 5, loss: cfg.loss || 0, seed: cfg.seed, clock: () => T });
  const opts = { online: true, seed: 9100 + cfg.seed, venue: cfg.venue, bestOf: 1, points: cfg.points || 11, humans: [{}, {}], present: true, stats: true, net: 'fluida', ref: REF };
  const log = () => { };
  const sess = [
    new VA.NetFluid.Session({ slot: 0, link: la, opts, name: 'Anfitrión', log }),
    new VBb.NetFluid.Session({ slot: 1, link: lb, opts: null, name: 'Invitado', log, expect: { even: false, bestOf: 1, points: opts.points, venue: opts.venue, net: 'fluida' } })];
  const off = [0, 98765.4], bots = [VA.Net.bot(0, cfg.seed, 'bueno'), VBb.Net.bot(1, cfg.seed + 1, 'bueno')];
  const fr = mulberry(cfg.seed * 17 + 3), next = [0, 2.7];
  const st = { err: null, pts: [[], []], ch: [[], []], res: [[], []], plan: [null, null], asked: [0, 0], lastR: [-1, -1], guard: [0, 0] };
  while (T < 900000) {
    const k = next[0] <= next[1] ? 0 : 1;
    T = next[k]; next[k] += 8 + fr() * 17;
    const s = sess[k], g = s.g;
    // el que perdió el punto con llamada de línea pide challenge con un retraso al azar
    if (g && g.call && g.call.team === k && g.call.r !== st.lastR[k] && !g.call.used) { st.lastR[k] = g.call.r; st.plan[k] = { r: g.call.r, at: T + fr() * 6500 }; }
    if (st.plan[k] && T >= st.plan[k].at) { if (g && g.call && g.call.r === st.plan[k].r) { s.request('chal'); st.asked[k]++; } st.plan[k] = null; }
    // una petición que llega con el saque ya hecho (a mano, saltándose el margen de _chalAsk): el otro debe decir que no
    if (!st.late && g && g.mode === 'rally' && g.call && g.call.team === k && !g.call.used && s.chPend < 0 && g.rally.t > 0.3) {
      st.late = { k, r: g.call.r }; s.chPend = g.call.r; s._ctl({ k: 'ch', r: g.call.r }); s.flStats.chOut++;
    }
    let r;
    try { r = s.advance(T + off[k], g ? bots[k](g) : null); } catch (e) { st.err = e; break; }
    for (const e of r.confirmed) {
      if (e.type === 'point') st.pts[k].push([e.team, (e.score || []).join('-'), (e.sets || []).join('-')].join('/'));
      if (e.type === 'challenge') st.ch[k].push(e.team);
      if (e.type === 'challengeResult') st.res[k].push(e.team + (e.overturned ? 'A' : 'M') + (e.left || []).join(''));
    }
    if (sess[0].status === 'over' && sess[1].status === 'over' && sess[0].result && sess[1].result) break;
  }
  return { cfg, sA: sess[0], sB: sess[1], st, secs: T / 1000 };
}

const CFGS = [];
for (let i = 0; i < N; i++) CFGS.push({ seed: 41 + i, venue: i % 2 ? 'beach' : 'hall', rtt: [40, 120, 200][i % 3], loss: i % 3 === 2 ? 0.02 : 0, points: i < 2 ? 15 : 11 });
let tot = { out: 0, ok: 0, no: 0, over: 0 };
for (const cfg of CFGS) {
  const t0 = Date.now(), R = run(cfg), A = R.sA, B = R.sB, st = R.st;
  const tag = cfg.venue + ' RTT ' + cfg.rtt + (cfg.loss ? ' pérdida ' + cfg.loss * 100 + ' %' : '') + ' (semilla ' + cfg.seed + ')';
  console.log('== ' + tag + ' — ' + R.secs.toFixed(0) + ' s de partido, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  if (st.err) { check('sin excepciones', false, String(st.err && st.err.stack || st.err).split('\n').slice(0, 4)); continue; }
  const gA = A.g, gB = B.g;
  check('los dos en over con el fin cotejado', A.status === 'over' && B.status === 'over' && A.result && B.result && !A.result.unverified && !B.result.unverified && A.result.why === 'over',
    { A: A.status, B: B.status, rA: A.result, rB: B.result });
  check('mismos sets y parciales', JSON.stringify(gA.setScores) === JSON.stringify(gB.setScores) && gA.sets.join() === gB.sets.join(), { A: gA.setScores, B: gB.setScores });
  check('misma secuencia de puntos (con los anulados y los repitados)', JSON.stringify(st.pts[0]) === JSON.stringify(st.pts[1]), { nA: st.pts[0].length, nB: st.pts[1].length });
  check('mismos challenges y resultados en las dos máquinas', JSON.stringify(st.ch[0]) === JSON.stringify(st.ch[1]) && JSON.stringify(st.res[0]) === JSON.stringify(st.res[1]), { chA: st.ch[0], chB: st.ch[1], resA: st.res[0], resB: st.res[1] });
  const fa = A.flStats, fb = B.flStats;
  check('cada ch con respuesta y sin peticiones colgadas', fa.chOk + fa.chNo === fb.chOut && fb.chOk + fb.chNo === fa.chOut && A.chPend === -1 && B.chPend === -1,
    { A: [fa.chOut, fa.chOk, fa.chNo], B: [fb.chOut, fb.chOk, fb.chNo] });
  check('challenges aceptados = revisiones en pantalla', fa.chOk + fb.chOk === st.ch[0].length, { ok: fa.chOk + fb.chOk, rev: st.ch[0].length });
  check('mismos challenges restantes', gA.challenges.join() === gB.challenges.join(), { A: gA.challenges, B: gB.challenges });
  check('sin arreglos de marcador ni guarda', fa.sbFix === 0 && fb.sbFix === 0 && fa.ptBad === 0 && fb.ptBad === 0 && gA.fl.guard === 0 && gB.fl.guard === 0,
    { sbFix: [fa.sbFix, fb.sbFix], ptBad: [fa.ptBad, fb.ptBad], guard: [gA.fl.guard, gB.fl.guard] });
  tot.out += fa.chOut + fb.chOut; tot.ok += fa.chOk + fb.chOk; tot.no += fa.chNo + fb.chNo; tot.over += st.res[0].filter(x => x[1] === 'A').length;
}
console.log('== en total: ' + JSON.stringify(tot));
check('hay challenges aceptados, alguno rechazado por tarde y alguno que anula el punto', tot.ok > 0 && tot.no > 0 && tot.over > 0, tot);
console.log('\n' + oks + ' ok, ' + fails + ' fallos');
process.exit(fails ? 1 : 0);
