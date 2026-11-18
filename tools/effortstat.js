#!/usr/bin/env node
/* MAKE THE CUT — tools/effortstat.js  (owner: sim)
 * MÉTRICAS DEL ESFUERZO DE LA DEFENSA (18-nov-2026, petición de Ferran: «Siento que los jugadores son super rapidos y llegan a todos
 * los balones siempre que quieren ir, si no llegan son porque la IA "dejan que caiga"»). Base para calibrar: juega partidas sin
 * navegador (sim + IA en un contexto vm, como tools/simtest.js) en 2v2 y 6v6, en cada dificultad, CPU contra CPU (autopilot: el
 * equipo 0 es IA Normal, el 1 la dificultad) y con el bot humano «medio» de simtest contra la CPU, y mide:
 *  - puntos de side-out, toques por rally (media y reparto; g.rally.hits: sin el saque ni el bloqueo), % de puntos «Defensa fuera»;
 *  - remates (y dejadas/balones libres, saques y toques de bloqueo) que llegan a una defensa CPU: qué dijo el dado (g.digOk) y qué
 *    pasó: cae sin que nadie lo toque, toque desviado/cuerpo (shank/body), defensa mala, defensa buena, bloqueo, error del atacante;
 *  - en los que caen sin tocar: lo que corrió el defensor (el de g.jobs al botar) y por cuánto se quedó corto (distancia al bote
 *    menos su alcance, S.reachOf), con reparto «por poco» / «por mucho»;
 *  - la velocidad media del defensor con el balón (g.jobs del equipo que defiende) cuando el dado dice «perdido» (beaten) frente
 *    a cuando dice «la saca», en todo el vuelo (incluida la reacción) y solo mientras se mueve (> 0,5 m/s).
 * Solo OBSERVA: no gasta g.rng ni toca el estado (lee g.digOk, g.jobs, posiciones y eventos después de cada paso). Determinista:
 * cada casilla tiene su semilla fija; los workers solo reparten el trabajo.
 * 24 casillas (2v2/6v6 × CPU/bot × 4 dificultades, 4 de stats y 4 de playa) con 7200 s de juego cada una: ~2 min con 3 workers.
 * Uso: node tools/effortstat.js [salida.json = tools/out/effort.json] [segundos de juego por casilla = 7200] [semilla = 4242] [workers = 3]
 *   EFFORT_FILTER=<regex>: solo las casillas cuya etiqueta encaje (p. ej. '6v6' o 'auto.*hard').
 * Calibración (18-nov-2026): además, «rem→pto» (% de remates que acaban en punto del que remata sin que el balón vuelva a su
 * campo), «perd ≤0,5» (de los remates perdidos —sin tocar, desviada o cuerpo—, % en los que el defensor llegó a menos de 0,5 m de su
 * alcance o la tocó) y 4 casillas de STATS (CPU Normal contra CPU Normal con el equipo 1 a 30 o a 80 en Velocidad, Reacción,
 * Defensa y Recepción; solo se mide la defensa del equipo 1): el alto debe sacar claramente más balones. Y 4 de vóley playa.
 * Con el modelo de esfuerzo (VB.EFFORT) g.digOk es siempre true: «dado%», «sT+» y «corr/v perd» solo tienen sentido con el código de
 * antes (la base). EFFORT_SET='{"accT":0.1,"six":{"fC":2}}' prueba otros valores de VB.EFFORT sin tocar sim.js.
 * Afinado (18-nov-2026, 2ª ronda): «int» = de los remates que caen sin tocar, % con intento visible (plancha —fallida o no— de alguien del
 * equipo, o carrera de >= 1 m del que iba); «quie» = % con el defensor quieto (< 0,5 m y sin plancha). Revisión 2: «run1» = % con carrera de
 * >= 1 m sin plancha, «cST» = m que corre el que iba en los que caen sin tocar, «sinG» = % que botan al alcance de alguien sin ningún gesto. La base se mide con el código de
 * antes copiado aparte (js/sim.js, ai.js, ai6.js y tools/simtest.js de fa4577d) y esta misma herramienta.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const ROOT = path.join(__dirname, '..');

function load() {
  const ctx = { console, Math, Date, process: { env: {} } }; // (process.env: el trozo de los bots lee SIMTEST_BOTM)
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const VB = ctx.VB, S = VB.Sim, C = VB.C, DT = 1 / C.SIM_HZ;
  // EFFORT_SET='{"accT":0.2,"six":{"failK":1.2}}': prueba otros valores de VB.EFFORT sin tocar sim.js (se mezclan sobre la tabla)
  if (process.env.EFFORT_SET && VB.EFFORT) (function mix(o, d) { for (const k in d) { if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && o[k]) mix(o[k], d[k]); else o[k] = d[k]; } })(VB.EFFORT, JSON.parse(process.env.EFFORT_SET));
  // bots de tools/simtest.js: el trozo desde «const BOTS = {» hasta «function topWhy(» (como ratingtest/consignatest)
  let bots = null;
  try {
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'simtest.js'), 'utf8'), a = src.indexOf('const BOTS = {'), b = src.indexOf('function topWhy(');
    if (a > 0 && b > a) bots = vm.runInContext('(function (S, C, DT, VB) {' + src.slice(a, b) + '; return { BOTS: BOTS, makeBot: makeBot }; })', ctx)(S, C, DT, VB);
  } catch (e) { bots = null; }
  return { VB, S, C, DT, bots };
}

// ------------------------------------------------------------------ una casilla (en un worker)
const SHORT = [0.25, 1, 2], NEAR = 0.5, TRY = 1; // (TRY: m de carrera que cuentan como intento claro en un remate que cae sin tocar) // m: cortes del «se queda corto» (≤ 0,25 por poco; 0,25-1; 1-2; > 2 por mucho)
function newAcc() {
  return { n: 0, ok: 0, out: {}, outOk: {}, outBeat: {}, run: [0, 0], short: [0, 0, 0, 0, 0], shortSum: 0, shortN: 0, shortNear: [0, 0, 0, 0, 0],
    runBeat: [0, 0], runOk: [0, 0], lost: 0, lostNear: 0, kill: 0, dk: 0, dkN: 0, killOut: {}, outN: {}, nT: [0, 0], killT: [0, 0], stTry: 0, stMiss: 0, stIdle: 0, stN: 0, stRun: 0, stRunSum: 0, stIn: 0 };
}
function newSpd() { return { beat: [0, 0, 0, 0], ok: [0, 0, 0, 0] }; } // [suma v, pasos, suma v moviéndose, pasos moviéndose]
function bump(o, k) { o[k] = (o[k] || 0) + 1; }

function runCell(j) {
  const E = load(), { S, C, DT, bots } = E;
  const bot = j.bot && bots ? bots.makeBot(bots.BOTS[j.bot], j.seed * 7 + 3, j.fmt === '6v6' ? { six: true } : null) : null;
  if (j.bot && !bot) return { label: j.label, error: 'sin bots de simtest' };
  const base = j.bot ? { demo: false, difficulty: j.diff, serveClock: true, rookie: false } : { demo: false, autopilot: true, difficulty: j.diff };
  if (j.stats) { // casilla de stats: el equipo 1 con j.stats en Velocidad, Reacción, Defensa y Recepción (el resto 50)
    const st = { jump: 50, speed: j.stats, react: j.stats, recv: j.stats, dig: j.stats, set: 50, spike: 50, ctl: 50, block: 50, serve: 50 }, tm = [];
    for (let i = 0; i < (j.fmt === '6v6' ? 6 : 2); i++) tm.push(st);
    base.attrs = [null, tm];
  }
  if (j.fmt === '6v6') { base.format = '6v6'; if (j.bot) base.ctrl = 'one'; }
  if (j.fmt === 'playa') base.venue = 'beach';
  const R = { label: j.label, fmt: j.fmt, mode: j.bot ? 'bot ' + j.bot : 'cpu', diff: j.diff, seed: j.seed, seconds: j.seconds,
    points: 0, sideout: 0, served: 0, hits: [], dfuera: 0, why: {}, how: {},
    recv: { n: 0, perfect: 0, good: 0, poor: 0, shank: 0, body: 0, ace: 0, recvOut: 0, diceFail: 0 },
    ep: { spike: newAcc(), free: newAcc(), serve: newAcc(), blkTouch: newAcc(), blkStuff: newAcc() }, spd: { spike: newSpd(), serve: newSpd(), free: newSpd() } };
  let g = null, seedN = 0, ep = null;
  const newGame = () => { g = S.createGame(Object.assign({ seed: j.seed + 101 * seedN++ }, base)); ep = null; };
  newGame();
  const evs = [], prev = new Map();
  const cpuDef = t => (!bot && !j.stats) || t === 1; // con el bot, solo el equipo 1 defiende entero con IA (con stats, solo se mide el 1)
  let kill = null; // remate pendiente de saber si acaba en punto: { A (acumulador), at (equipo que remata) }
  const open = (type, dt) => {
    if (!cpuDef(dt)) { ep = null; return; }
    ep = { type, dt, ok: !!g.digOk, path: new Map(), t0: g.time, best: 1e9 };
    if (g.digK > 0) { R.ep[type].dk += g.digK; R.ep[type].dkN++; } // dificultad media del balón (EFFORT; 0 en el código de antes)
  };
  const close = (out, landEv) => {
    if (!ep) return;
    const A = R.ep[ep.type]; A.n++; A.nT[ep.dt]++; if (ep.ok) A.ok++;
    bump(A.out, out); bump(ep.ok ? A.outOk : A.outBeat, out);
    if (kill && kill.A === A && !kill.out) kill.out = out; // (de qué resultado del 1r contacto sale el punto del remate)
    const J = ep.J || g.jobs[ep.dt], d = J ? (ep.path.get(J) || 0) : 0;
    if (J) { A.run[0] += d; A.run[1]++; const rb = ep.ok ? A.runOk : A.runBeat; rb[0] += d; rb[1]++; }
    if (out === 'sinTocar' || /^(desviada|cuerpo)/.test(out)) { A.lost++; if (out !== 'sinTocar' || ep.best <= NEAR) A.lostNear++; }
    if (out === 'sinTocar') { // ¿lo intentó? plancha (fallida) de alguien del equipo o carrera clara (≥ TRY m del que iba); quieto: < NEAR m y sin plancha
      A.stN++; if (ep.miss || ep.dove) A.stMiss++;
      if (ep.miss || ep.dove || d >= TRY) A.stTry++; else if (d < NEAR) A.stIdle++;
      if (!ep.miss && !ep.dove && d >= TRY) A.stRun++; // (carrera clara sin plancha)
      A.stRunSum += d;
    }
    if (out === 'sinTocar' && landEv) {
      const tm = g.teams[ep.dt]; let near = 1e9;
      for (const q of tm) near = Math.min(near, Math.hypot(q.x - landEv.x, q.y - landEv.y) - S.reachOf(g, q));
      const sh = J ? Math.hypot(J.x - landEv.x, J.y - landEv.y) - S.reachOf(g, J) : near;
      const bk = v => v <= 0 ? 0 : v <= SHORT[0] ? 1 : v <= SHORT[1] ? 2 : v <= SHORT[2] ? 3 : 4; // 0 = dentro del alcance (llegaba)
      A.short[bk(sh)]++; A.shortNear[bk(near)]++; A.shortSum += Math.max(0, sh); A.shortN++;
      if (near <= 0 && !ep.miss && !ep.dove) A.stIn++; // (bota al alcance de alguien que no hace ningún gesto)
    }
    ep = null;
  };
  const steps = Math.round(j.seconds / DT);
  for (let i = 0; i < steps; i++) {
    if (g.finished && g.mode === 'over') newGame();
    prev.clear();
    for (const tm of g.teams) for (const p of tm) prev.set(p, [p.x, p.y, p.z]);
    S.step(g, DT, bot ? bot(g) : null);
    evs.length = 0; S.drainEvents(g, evs);
    // trayecto y velocidad del defensor (antes de los eventos del paso: el episodio abierto es el del vuelo que acaba de moverse)
    if (ep && g.mode === 'rally') {
      for (const p of g.teams[ep.dt]) {
        const o = prev.get(p); if (!o) continue;
        const dd = Math.hypot(p.x - o[0], p.y - o[1]); ep.path.set(p, (ep.path.get(p) || 0) + dd);
      }
      const J = g.jobs[ep.dt], sp = R.spd[ep.type === 'serve' ? 'serve' : ep.type === 'free' ? 'free' : ep.type === 'spike' ? 'spike' : null];
      if (J) { ep.J = J; const b = g.ball; if (b.z < 3) ep.best = Math.min(ep.best, Math.hypot(J.x - b.x, J.y - b.y) - S.reachOf(g, J)); }
      if (J && sp && (!bot || J !== g.ctrl)) {
        const o = prev.get(J);
        if (o && J.z === 0 && o[2] === 0) {
          const v = Math.hypot(J.x - o[0], J.y - o[1]) / DT, B = g.digOk ? sp.ok : sp.beat;
          B[0] += v; B[1]++; if (v > 0.5) { B[2] += v; B[3]++; }
        }
      }
    }
    let landEv = null;
    for (const e of evs) {
      if (e.type === 'land') landEv = e;
      else if (e.type === 'dive') { if (ep && e.player && e.player.team === ep.dt) { if (e.miss) ep.miss = true; else ep.dove = true; } }
      else if (e.type === 'hit') {
        if (kill && e.team === kill.at && e.kind !== 'serve') kill = null; // el balón volvió al que remató: no fue punto directo
        if (ep && e.team === ep.dt) {
          const out = e.shot === 'shank' ? 'desviada' : e.shot === 'body' ? 'cuerpo' : e.grade === 'poor' ? 'mala' : 'buena';
          close(out + (e.dive ? '+plancha' : ''));
        } else if (ep) close('otro');
        if (e.type === 'hit' && e.recv) {
          const r = R.recv; r.n++;
          if (e.shot === 'shank') r.shank++; else if (e.shot === 'body') r.body++; else r[e.grade] = (r[e.grade] || 0) + 1;
        }
        if (e.kind === 'spike') { open('spike', 1 - e.team); kill = ep ? { A: R.ep.spike, at: e.team } : null; }
        else if (e.kind === 'free' && e.touch === 3) open('free', 1 - e.team);
        else if (e.kind === 'serve') { open('serve', 1 - e.team); if (!g.digOk && cpuDef(1 - e.team)) R.recv.diceFail++; }
      } else if (e.type === 'block') {
        if (ep) close('bloqueo-' + e.result);
        if (e.result === 'touch') open('blkTouch', e.team);
        else if (e.result === 'stuff') open('blkStuff', 1 - e.team);
      } else if (e.type === 'point') {
        R.points++; if (e.sideout) R.sideout++;
        if (kill && e.team === kill.at) { kill.A.kill++; kill.A.killT[1 - kill.at]++; bump(kill.A.killOut, kill.out || 'sinTocar'); }
        kill = null;
        R.hits.push(e.rallyHits | 0);
        bump(R.why, e.text); bump(R.how, e.how);
        if (e.text === 'Defensa fuera') R.dfuera++;
        if (e.how === 'ace') R.recv.ace++;
        if (e.text === 'Recepción fuera') R.recv.recvOut++;
        if (ep) {
          let out;
          if (e.team === ep.dt) out = 'errorAtacante';                                      // fuera, red, antena… del que atacó
          else if (landEv && landEv.team === ep.dt && landEv.inside) out = 'sinTocar';    // bota dentro de su campo sin tocarlo
          else out = 'otro:' + e.reason;
          close(out, landEv);
        }
      }
    }
  }
  return R;
}

// ------------------------------------------------------------------ resumen
const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : null;
const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
function sumOut(o, pred) { let s = 0; for (const k in o) if (pred(k)) s += o[k]; return s; }
function summarize(R) {
  if (R.error) return R;
  const H = R.hits, n = H.length, mean = n ? H.reduce((a, b) => a + b, 0) / n : 0;
  const dist = { '0': 0, '1': 0, '2': 0, '3': 0, '4-6': 0, '7-9': 0, '10+': 0 };
  for (const h of H) dist[h <= 3 ? String(h) : h <= 6 ? '4-6' : h <= 9 ? '7-9' : '10+']++;
  for (const k in dist) dist[k] = pct(dist[k], n);
  const eps = {};
  for (const k in R.ep) {
    const A = R.ep[k]; if (!A.n) { eps[k] = { n: 0 }; continue; }
    const st = sumOut(A.out, x => x === 'sinTocar'), bad = sumOut(A.out, x => /^(desviada|cuerpo)/.test(x)), mal = sumOut(A.out, x => /^mala/.test(x)),
      good = sumOut(A.out, x => /^buena/.test(x)), err = sumOut(A.out, x => x === 'errorAtacante');
    const live = A.n - err; // los que llegan vivos a la defensa (sin los errores del atacante)
    eps[k] = {
      n: A.n, digOkPct: pct(A.ok, A.n),
      pctDe: 'de los que no son error del atacante (n ' + live + ')',
      sinTocar: pct(st, live), desviadaOCuerpo: pct(bad, live), defensaMala: pct(mal, live), defensaBuena: pct(good, live),
      bloqueo: pct(sumOut(A.out, x => /^bloqueo/.test(x)), live), errorAtacante: pct(err, A.n),
      remateAPunto: pct(A.kill, A.n), remateAPuntoDefiende: [pct(A.killT[0], A.nT[0]), pct(A.killT[1], A.nT[1])], /* (según el equipo que defiende; en CPU el 0 es el compañero «mate») */ puntoPorResultado: A.killOut, digKMedio: r2(A.dkN ? A.dk / A.dkN : null), perdidos: A.lost, perdidosCerca: pct(A.lostNear, A.lost), // (cerca: llegó a ≤ 0,5 m de su alcance o la tocó)
      sinTocarConIntento: pct(A.stTry, A.stN), sinTocarPlancha: pct(A.stMiss, A.stN), sinTocarQuieto: pct(A.stIdle, A.stN), // (de los que caen sin tocar: plancha o carrera ≥ 1 m / plancha / < 0,5 m sin plancha)
      sinTocarCarrera: pct(A.stRun, A.stN), sinTocarCorrido: r2(A.stN ? A.stRunSum / A.stN : null), sinTocarAlAlcanceSinGesto: pct(A.stIn, A.stN), // (carrera ≥ 1 m sin plancha / m que corre el que iba / bota al alcance de alguien sin gesto)
      conDadoOk: A.outOk, conDadoPerdido: A.outBeat, // recuento crudo por resultado según el dado
      sinTocarConDadoOk: pct(A.outOk.sinTocar || 0, st), // de los que caen sin tocar, cuántos tenía el dado a favor (¡no llegó por pies!)
      corridoMedio: r2(A.run[1] ? A.run[0] / A.run[1] : null), corridoDadoOk: r2(A.runOk[1] ? A.runOk[0] / A.runOk[1] : null),
      corridoPerdido: r2(A.runBeat[1] ? A.runBeat[0] / A.runBeat[1] : null),
      cortoMedio: r2(A.shortN ? A.shortSum / A.shortN : null),
      cortoReparto: A.shortN ? { llegaba: pct(A.short[0], A.shortN), hasta25cm: pct(A.short[1], A.shortN), '25cm-1m': pct(A.short[2], A.shortN), '1-2m': pct(A.short[3], A.shortN), masDe2m: pct(A.short[4], A.shortN) } : null,
      cortoRepartoMasCercano: A.shortN ? { llegaba: pct(A.shortNear[0], A.shortN), hasta25cm: pct(A.shortNear[1], A.shortN), '25cm-1m': pct(A.shortNear[2], A.shortN), '1-2m': pct(A.shortNear[3], A.shortN), masDe2m: pct(A.shortNear[4], A.shortN) } : null
    };
  }
  const spd = {};
  for (const k in R.spd) {
    const s = R.spd[k];
    spd[k] = { perdido: r2(s.beat[1] ? s.beat[0] / s.beat[1] : null), perdidoMoviendose: r2(s.beat[3] ? s.beat[2] / s.beat[3] : null),
      dadoOk: r2(s.ok[1] ? s.ok[0] / s.ok[1] : null), dadoOkMoviendose: r2(s.ok[3] ? s.ok[2] / s.ok[3] : null), pasos: [s.beat[1], s.ok[1]] };
  }
  const rc = R.recv, rT = rc.n + rc.ace;
  return {
    label: R.label, fmt: R.fmt, mode: R.mode, diff: R.diff, seed: R.seed, seconds: R.seconds, points: R.points,
    sideoutPct: pct(R.sideout, R.points), toquesMedia: r2(mean), toquesReparto: dist, defensaFueraPct: pct(R.dfuera, R.points),
    recepcion: { n: rT, acePct: pct(rc.ace, rT), malaPct: pct(rc.poor + rc.shank + rc.body, rT), desviadaPct: pct(rc.shank + rc.body, rT),
      buenaPct: pct((rc.good || 0) + (rc.perfect || 0), rT), recepcionFueraPct: pct(rc.recvOut, rT), dadoFallo: rc.diceFail },
    remates: eps.spike, otros: { free: eps.free, serve: eps.serve, blkTouch: eps.blkTouch, blkStuff: eps.blkStuff },
    velocidad: spd, how: R.how, topWhy: Object.entries(R.why).sort((a, b) => b[1] - a[1]).slice(0, 6)
  };
}

// ------------------------------------------------------------------ principal
if (!isMainThread) { parentPort.postMessage(runCell(workerData)); }
else {
  const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'tools', 'out', 'effort.json'));
  const SECS = +(process.argv[3] || 7200), SEED = +(process.argv[4] || 4242), NW = Math.max(1, +(process.argv[5] || 3));
  const FILTER = process.env.EFFORT_FILTER ? new RegExp(process.env.EFFORT_FILTER) : null;
  const DIFFS = ['easy', 'normal', 'hard', 'expert'], jobs = [];
  let k = 0;
  for (const fmt of ['2v2', '6v6']) for (const mode of ['auto', 'bot']) for (const diff of DIFFS) {
    const label = fmt + ' ' + (mode === 'auto' ? 'cpu' : 'bot medio') + ' vs ' + diff;
    k++;
    if (FILTER && !FILTER.test(label)) continue;
    jobs.push({ label, fmt, diff, bot: mode === 'bot' ? 'medio' : null, seed: SEED + k * 1000, seconds: SECS });
  }
  for (const fmt of ['2v2', '6v6']) for (const sv of [30, 80]) {
    const label = fmt + ' stats ' + sv;
    k++;
    if (FILTER && !FILTER.test(label)) continue;
    jobs.push({ label, fmt, diff: 'normal', bot: null, stats: sv, seed: SEED + k * 1000, seconds: SECS });
  }
  for (const mode of ['auto', 'bot']) for (const diff of ['normal', 'expert']) { // vóley playa (pista 16 × 8, arena)
    const label = 'playa ' + (mode === 'auto' ? 'cpu' : 'bot medio') + ' vs ' + diff;
    k++;
    if (FILTER && !FILTER.test(label)) continue;
    jobs.push({ label, fmt: 'playa', diff, bot: mode === 'bot' ? 'medio' : null, seed: SEED + k * 1000, seconds: SECS });
  }
  const t0 = Date.now(), res = new Array(jobs.length);
  let next = 0, alive = 0;
  const done = () => {
    const cells = res.map(summarize);
    const out = { tool: 'tools/effortstat.js', args: { seconds: SECS, seed: SEED }, nota: 'g.rally.hits = toques de jugador sin el saque ni el bloqueo (ace = 0). ' +
      '«desviada» = shank (la IA llega «perdida» y no la controla), «cuerpo» = le da en el cuerpo. Velocidades en m/s del defensor con el balón (g.jobs), en el suelo.',
      cells };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    const f = v => v == null ? '  -  ' : String(v).padStart(5);
    // dado% = remates con g.digOk a favor; sT+ = de los que caen sin tocar, % con el dado a favor (no llegó por pies);
    // corr ok/perd = m que corre el defensor con el dado a favor / en contra; corto = por cuánto no llega en los que caen sin tocar
    console.log('casilla                      pts  SO%  toq  DF%  ace% malR%| rem dado% sinT% desv% mala% buena%  sT+ r→pt pd≤.5  int quie run1  cST sinG| corr ok/perd | corto: ≤25cm 25-1m >1m  | v perd/ok (mov)');
    for (const c of cells) {
      if (c.error) { console.log(c.label + ': ' + c.error); continue; }
      const s = c.remates || {}, cr = s.cortoReparto || {}, v = c.velocidad.spike;
      console.log(c.label.padEnd(27) + f(c.points) + f(c.sideoutPct) + f(c.toquesMedia) + f(c.defensaFueraPct) + f(c.recepcion.acePct) + f(c.recepcion.malaPct) + ' |' +
        f(s.n) + f(s.digOkPct) + f(s.sinTocar) + f(s.desviadaOCuerpo) + f(s.defensaMala) + f(s.defensaBuena) + f(s.sinTocarConDadoOk) + f(s.remateAPunto) + f(s.perdidosCerca) + f(s.sinTocarConIntento) + f(s.sinTocarQuieto) + f(s.sinTocarCarrera) + f(s.sinTocarCorrido) + f(s.sinTocarAlAlcanceSinGesto) + ' |' +
        f(s.corridoDadoOk) + '/' + f(s.corridoPerdido) + '  |' + f(cr.hasta25cm) + f(cr['25cm-1m']) + f(r2((cr['1-2m'] || 0) + (cr.masDe2m || 0))) + '  |' + f(v.perdido) + '/' + f(v.dadoOk) + ' (' + f(v.perdidoMoviendose) + '/' + f(v.dadoOkMoviendose) + ')');
    }
    console.log('\nJSON: ' + OUT + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  };
  const spawn = () => {
    if (next >= jobs.length) { if (!alive) done(); return; }
    const i = next++; alive++;
    const w = new Worker(__filename, { workerData: jobs[i] });
    w.on('message', m => { res[i] = m; });
    w.on('error', e => { res[i] = { label: jobs[i].label, error: String(e && e.stack || e) }; });
    w.on('exit', () => { alive--; spawn(); });
  };
  for (let i = 0; i < Math.min(NW, jobs.length); i++) spawn();
}
