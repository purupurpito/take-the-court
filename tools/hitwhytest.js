#!/usr/bin/env node
/* TAKE THE COURT — tools/hitwhytest.js (owner: sim)
 * «Decir por qué falló cada toque» (4.4 de la revisión de 21-nov-2026, ARREGLO). Sin navegador:
 *  1) Casos a mano de VB.Sim.hitWhy (pura: solo lee el evento): nota buena → '', plancha → 'dive', timing → 'early'/'late',
 *     lejos (estirón o alcance) → 'far', remate rápido → 'fast', pase anterior flojo sin otra causa → 'weak', la causa que más pesa gana.
 * *  2) Partidas con un bot humano sencillo (2v2 y 6v6, playa y pabellón): todos los 'hit' del humano traen strK/reachK/inSp/prevQ
 *     numéricos; hitWhy nunca da motivo con nota buena; casi todos los toques flojos del humano tienen motivo; reparto de motivos.
 *  3) hitWhy no gasta g.rng ni cambia el estado: la misma partida llamando a hitWhy en cada evento y sin llamarlo acaba con el mismo
 *     stateHash y el mismo g.rng.
 * Uso: node tools/hitwhytest.js [segundos=240]     Sale con 1 si falla algo.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SECS = +(process.argv[2] || 240);
let fails = 0;
const check = (c, m, d) => { if (!c) { fails++; console.error('FALLO: ' + m + (d !== undefined ? ' ' + JSON.stringify(d) : '')); } else console.log('ok: ' + m); return !!c; };

const ctx = { console, Math, Date }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const VB = ctx.VB, S = VB.Sim, C = VB.C, DT = 1 / C.SIM_HZ;
const W = S.hitWhy;

console.log('== 1) casos a mano ==');
check(typeof W === 'function' && S.HIT_WHY && S.HIT_WHY.min > 0, 'VB.Sim.hitWhy y HIT_WHY expuestos');
const P = (o) => Object.assign({ type: 'hit', grade: 'poor', timing: 0, strK: 0, reachK: 0.3, inSp: 0, prevQ: 1, dive: false, touch: 1 }, o);
const cases = [
  [{ grade: 'good', timing: 0.2 }, ''], [{ grade: 'perfect', dive: true }, ''],
  [{ dive: true, timing: 0.3 }, 'dive'],
  [{ timing: -0.15 }, 'early'], [{ timing: 0.15 }, 'late'], [{ timing: 0.06 }, 'late'],
  [{ strK: 0.8 }, 'far'], [{ reachK: 0.98 }, 'far'],
  [{ inSp: 18 }, 'fast'],
  [{ prevQ: 0.1, touch: 3 }, 'weak'], [{ prevQ: 0.3 }, ''], [{}, ''],
  [{ timing: 0.2, inSp: 19 }, 'late'],          // timing pierde 0,6; rápido 0,25
  [{ timing: 0.045, inSp: 19 }, 'fast'],        // timing pierde ~0,16; rápido 0,25
  [{ timing: 0.045, reachK: 1, strK: 1 }, 'far'],
  [{ timing: 0.02, prevQ: 0.1 }, 'weak'],       // timing dentro del perfecto: no cuenta
  [{ timing: 0.2, prevQ: 0.1 }, 'late']
];
const bad = [];
for (const [o, want] of cases) { const got = W(P(o)); if (got !== want) bad.push({ o, want, got }); }
check(bad.length === 0, cases.length + ' casos de hitWhy', bad);
check(W(null) === '' && W({ type: 'hit', grade: 'poor' }) === '' && W({ type: 'hit', grade: 'poor', timing: -0.2 }) === 'early', 'sin campos nuevos (saque, partidas viejas): solo el timing');

console.log('== 2) partidas con un bot humano sencillo ==');
function play(opts, secs, seed, withWhy) {
  const g = S.createGame(Object.assign({ demo: false, stats: true, seed: seed }, opts));
  const rng = S._makeRng(seed ^ 0xabc), evs = [], out = { hits: 0, poor: 0, why: {}, missing: 0, goodWhy: 0 };
  const gauss = () => (rng() + rng() + rng() + rng() - 2) * 1.732, w = {}, mv = [0, 0];
  let stamp = -9, lead = 0, pressed = 0, wait = 0;
  const steps = Math.round(secs / DT);
  // bot sencillo (azar propio, nunca g.rng): va hacia donde cae el balón (g.pr1) con error y pulsa GOLPEAR con un timing que se
  // desvía σ 0,09 s (a veces tarde, a veces pronto, a veces lejos): salen toques flojos de todas las clases
  for (let i = 0; i < steps; i++) {
    const p = g.ctrl, inp = { move: mv, hit: false, jump: false, switchPlayer: false };
    mv[0] = mv[1] = 0;
    if (stamp !== g.lastTouchT) { stamp = g.lastTouchT; lead = C.WINDUP + gauss() * 0.09; pressed = 0; wait = 0.5 + rng() * 1.5; }
    if (g.mode === 'serve') {
      if (g.server === p) {
        if (g.serveState === 'ready') { if (g.serveT > wait) inp.hit = true; }
        else { S.hitWindow(g, p, w); if (pressed < 1 && !g.swingLive && w.t <= lead) { inp.hit = true; pressed++; } }
      }
    } else if (g.mode === 'rally' && p) {
      if (g.pr1 && g.pr1.x * S.side(p.team) > 0) {
        const dx = g.pr1.x - p.x + gauss() * 0.15, dy = g.pr1.y - p.y + gauss() * 0.15, d = Math.hypot(dx, dy);
        if (d > 0.25) { mv[0] = dx / d; mv[1] = dy / d; }
      }
      S.hitWindow(g, p, w);
      if (w.reach && pressed < 1 && !g.swingLive && w.t <= lead) { inp.hit = true; pressed++; }
    }
    S.step(g, DT, inp);
    evs.length = 0; S.drainEvents(g, evs);
    if (!withWhy) continue;
    for (const e of evs) {
      if (e.type !== 'hit' || !e.human) continue;
      out.hits++;
      if (e.kind !== 'serve' && !['strK', 'reachK', 'inSp', 'prevQ'].every(k => typeof e[k] === 'number' && isFinite(e[k]))) out.missing++;
      const r0 = g.rng.get(), w = W(e);
      if (g.rng.get() !== r0) out.rngMoved = true;
      if (e.grade !== 'poor') { if (w) out.goodWhy++; continue; }
      out.poor++; out.why[w || '(nada)'] = (out.why[w || '(nada)'] || 0) + 1;
    }
  }
  out.hash = S.stateHash(g); out.rng = g.rng.get();
  return out;
}
const RUNS = [['2v2 pabellón', {}], ['2v2 playa', { venue: 'beach' }], ['6v6', { format: '6v6' }]];
for (const [lab, o] of RUNS) {
  const r = play(o, SECS, 4242, true);
  console.log('   ' + lab + ': toques del humano ' + r.hits + ', flojos ' + r.poor + ', motivos ' + JSON.stringify(r.why));
  check(r.hits > 20, lab + ': hay toques del humano', r.hits);
  check(r.missing === 0, lab + ': todos los toques (no saque) traen strK/reachK/inSp/prevQ', r.missing);
  check(r.goodWhy === 0, lab + ': ninguna nota buena con motivo', r.goodWhy);
  check(!r.rngMoved, lab + ': hitWhy no gasta g.rng');
  const none = r.why['(nada)'] || 0;
  check(r.poor === 0 || none / r.poor <= 0.1, lab + ': ≥ 90 % de los toques flojos con motivo', { sin: none, de: r.poor });
}

console.log('== 3) mismo estado con y sin hitWhy ==');
for (const [lab, o] of RUNS) {
  const a = play(o, Math.min(SECS, 120), 99, true), b = play(o, Math.min(SECS, 120), 99, false);
  check(a.hash === b.hash && a.rng === b.rng, lab + ': stateHash y g.rng iguales', { a: [a.hash, a.rng], b: [b.hash, b.rng] });
}

console.log(fails ? '\n' + fails + ' FALLOS' : '\nTODO OK');
process.exit(fails ? 1 : 0);
