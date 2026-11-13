#!/usr/bin/env node
/* MAKE THE CUT — tools/replaytest.js (owner: ui_main). Pruebas de VB.Replay (js/replay.js, S3-C1 / plan T18).
 *  node tools/replaytest.js --node   parte node (esta): sim + ai + ai6 + recap + replay.js en un vm, sin navegador.
 *  (La parte CDP —escenas debug=replay / debug=best, cortinilla, pestaña «Jugadas», montón y dibujos— la añade T22 al integrar
 *   main.js/ui.js; sin --node, este fichero de momento corre solo la parte node.)
 * Parte node:
 *  (1) elegibilidad: 2v2 humano sí; 6v6, demo, ejercicio, espectador y autopilot (sin force) no.
 *  (2) partidos con el bucle de main.js (frames de 1/60 s, 2 pasos, flancos solo en el 1r subpaso) grabados con onStep/onEvents:
 *      repeticiones automáticas (set/partido) y todas las mejores jugadas resimuladas con desync 0; filtro de eventos (evP ⊆ PASS +
 *      point, evF sin point, todos con e.replay, y lo de fuera —serveReady, whistle, set, match…— filtrado); cámara lenta a 1 paso por
 *      frame en el tramo decisivo; la partida en vivo intacta durante la repetición y el partido igual con y sin repeticiones.
 *  (3) mejores jugadas: 1-3, en orden de puntuación, sin «error» de < 4 toques; playBest() en orden, playBest(i), skip y skip(true).
 *  (4) defensa: una mutación de g fuera de Sim.step en pleno peloteo → desync() > 0 y aviso «[VB] repetición desincronizada».
 *  (5) memoria: 0 asignaciones con el anillo en régimen (process.memoryUsage con gc, 10 000 pasos de onStep/onEvents con fotos clave).
 * Escribe solo en la consola. Sale con 1 si algo falla. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
if (typeof global.gc !== 'function' && !process.env.RPT_CHILD) {   // (5) necesita gc: se relanza con --expose-gc
  const r = require('child_process').spawnSync(process.execPath, ['--expose-gc', __filename].concat(process.argv.slice(2)), { stdio: 'inherit', env: Object.assign({}, process.env, { RPT_CHILD: '1' }) });
  process.exit(r.status == null ? 1 : r.status);
}
let failures = 0;
const fail = m => { failures++; console.error('FALLO:', m); };
const warns = [];
function load() {
  const cons = { log: console.log, error: console.error, warn: (...a) => { warns.push(a.join(' ')); } };
  const ctx = { console: cons, Math, Date };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/recap.js', 'js/replay.js']) {
    if (!fs.existsSync(path.join(ROOT, f))) { if (f === 'js/recap.js') continue; throw new Error('falta ' + f); }
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.VB;
}
const VB = load(), S = VB.Sim, RPL = VB.Replay;
const STEP = 1 / VB.C.SIM_HZ, FDT = 1 / 60;
const PASS = RPL.PASS;

// bot de solo entrada (= tools/fingerprint6.js / simtest rpBot)
const mul = s => () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function bot(seed) {
  const r = mul(seed * 7919 + 13); let serveWait = -1, jumpCd = 0;
  return function (g) {
    const p = g.ctrl, b = g.ball, inp = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false };
    if (g.mode === 'serve') {
      if (g.server !== p || g.serving !== 0) return inp;
      if (serveWait < 0) serveWait = 20 + Math.floor(r() * 100);
      if (--serveWait === 0) { if (r() < 0.4) inp.jump = true; else inp.hit = true; }
      if (g.serveState === 'toss' && b.z > 2.3 && b.vz < 0 && r() < 0.5) inp.hit = true;
      inp.move = [0, r() < 0.5 ? 0 : (r() - 0.5)]; return inp;
    }
    serveWait = -1; if (g.mode !== 'rally') return inp;
    const pr = g.pr1, dx = pr.x - p.x, dy = pr.y - p.y, d = Math.hypot(dx, dy), mine = S.side(0) * pr.x > 0;
    if (mine && d > 0.25) inp.move = [dx / d * Math.min(1, d), dy / d * Math.min(1, d)];
    else if (!mine) { const hx = S.side(0) * 5 - p.x, hy = -p.y * 0.5, hd = Math.hypot(hx, hy); if (hd > 0.5) inp.move = [hx / hd * 0.7, hy / hd * 0.7]; }
    if (r() < 0.15) inp.move = [inp.move[0] + (r() - 0.5) * 0.8, inp.move[1] + (r() - 0.5) * 0.8];
    const bd = Math.hypot(b.x - p.x, b.y - p.y);
    if (bd < 1.6 && b.z < 3.2 && r() < 0.5) inp.hit = true;
    if (--jumpCd <= 0 && Math.abs(p.x) < 2.5 && bd < 2.5 && b.z > 2.3 && r() < 0.3) { inp.jump = true; jumpCd = 30; }
    if (p.z > 0.6 && bd < 2 && r() < 0.05) inp.jump = true;
    if (p.z > 0.6 && bd < 2 && r() < 0.04) inp.jset = true;
    if (r() < 0.004) inp.switchPlayer = true;
    return inp;
  };
}
const sigOf = g => JSON.stringify([g.setScores, g.score, g.sets, g.rng.get(), +g.time.toFixed(6), g.ball.x, g.finished, S.stateHash(g)]);

/* Un partido con el bucle de main.js. o = {opts (createGame), human (bot de entrada), replay (llamar a Replay), force, mutateAt
 * (s: mutación de g fuera de step en pleno peloteo), maxS}. → {final, autos, plays, ...}. */
function match(o) {
  const g = S.createGame(Object.assign({ demo: false, difficulty: 'normal', present: true, points: 15 }, o.opts));
  const R0 = { autos: 0, autoKinds: {}, replays: 0, playSteps: 0, slowFrames: 0, slow1: 0, slowOther: 0, evP: 0, evF: 0, badEv: [], forbidSeen: 0,
    pointP: 0, liveTouched: 0, frames: 0, prepMax: 0, nMut: 0, mutSerial: -1, mutPlays: 0, skips: 0, enabled: false, bestOrder: [], bestDes: 0 };
  if (o.replay) R0.enabled = RPL.reset(g, { force: !!o.force, headless: true });
  const b = o.human ? bot(o.opts.seed) : null, evs = [], evP = [], evF = [];
  const simIn = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false };
  const maxF = Math.round((o.maxS || 3000) / FDT);
  let acc = 0;
  // observa la sim de R (eventos antes del filtro) envolviendo drainEvents solo para R
  const R = o.replay && R0.enabled ? RPL._R() : null, drain0 = S.drainEvents;
  if (R) S.drainEvents = function (gg, out) { const n0 = out.length; const r = drain0(gg, out); if (gg === R) for (let i = n0; i < out.length; i++) { const t = out[i].type; if (!(PASS[t] === 1 || t === 'point')) R0.forbidSeen++; } return r; };
  function playOut(kindTag) { // la sim en vivo espera; Replay.tick hasta el final
    const h0 = S.stateHash(g), t0 = g.time;
    let guard = 0;
    while (RPL.active() && guard++ < 20000) {
      const k0 = RPL._state().k, gd = RPL.tick(FDT, evP, evF), st = RPL._state();
      const inf = RPL.info();
      if (st.phase === 'play' && inf && inf.slow && RPL._state().rate === 0.5) { R0.slowFrames++; if (st.k - k0 === 1) R0.slow1++; else R0.slowOther++; }
      if (gd > 0) R0.playSteps += Math.round(gd / STEP);
      for (const e of evP) { R0.evP++; if (!e.replay) R0.badEv.push('evP sin replay ' + e.type); if (!(PASS[e.type] === 1 || e.type === 'point')) R0.badEv.push('evP ' + e.type); if (e.type === 'point') R0.pointP++; }
      for (const e of evF) { R0.evF++; if (!e.replay) R0.badEv.push('evF sin replay ' + e.type); if (PASS[e.type] !== 1) R0.badEv.push('evF ' + e.type); }
    }
    if (guard >= 20000) fail('repetición sin fin (' + kindTag + ')');
    if (S.stateHash(g) !== h0 || g.time !== t0) R0.liveTouched++;
    R0.prepMax = Math.max(R0.prepMax, RPL.prepMs());
  }
  for (let f = 0; f < maxF && !g.finished; f++) {
    R0.frames++;
    const x = b ? b(g) : null;
    if (x) { simIn.move[0] = x.move[0]; simIn.move[1] = x.move[1]; }
    let first = true;
    acc += FDT;
    while (acc >= STEP - 1e-12) {
      if (x) { simIn.hit = first && x.hit; simIn.jump = first && x.jump; simIn.jset = first && x.jset; simIn.switchPlayer = first && x.switchPlayer; }
      first = false;
      S.step(g, STEP, x ? simIn : simIn);
      if (o.replay) RPL.onStep(simIn, g);
      acc -= STEP;
    }
    evs.length = 0; S.drainEvents(g, evs);
    // (4): mutación de g fuera de Sim.step justo tras el saque (antes de cualquier foto clave), en los 12 primeros peloteos
    if (o.mutate && R0.nMut < 12 && evs.some(e => e.type === 'hit' && e.kind === 'serve')) { g.ball.vx += 0.02; R0.nMut++; R0.mutSerial = RPL._state().serial; }
    if (o.skipHold && (g.mode === 'point' || g.mode === 'over') && S.skipHold(g)) R0.skips++;   // (2b) GOLPEAR en la pausa
    if (o.replay) {
      RPL.onEvents(g, evs);
      if (o.mutate && R0.mutSerial >= 0 && RPL._state().serial > R0.mutSerial && RPL._state().last) { R0.mutSerial = -1; if (RPL.start('set')) { R0.mutPlays++; playOut('mutación'); } }
      if (RPL.autoReady(g)) {
        const k = RPL._state().last;
        if (RPL.start('auto')) { R0.autos++; R0.autoKinds[RPL.info().kind] = (R0.autoKinds[RPL.info().kind] || 0) + 1; if (!k.auto) fail('autoReady sin last.auto'); playOut('auto'); R0.replays++; }
      }
    }
  }
  if (R) S.drainEvents = drain0;
  R0.final = sigOf(g); R0.g = g;
  return R0;
}

console.log('== replaytest (parte node) ==');
// (1) elegibilidad
{
  const cases = [
    ['2v2 humano', { demo: false, seed: 1 }, {}, true],
    ['playa humano', { demo: false, seed: 1, venue: 'beach' }, {}, true],
    ['6v6', { demo: false, seed: 1, format: '6v6', ctrl: 'one', ctrlRole: 'OH' }, {}, false],
    ['demo', { demo: true, seed: 1 }, {}, false],
    ['ejercicio', { demo: false, seed: 1, drill: 'serve' }, {}, false],
    ['autopilot', { demo: false, seed: 1, autopilot: true }, {}, false],
    ['autopilot + force', { demo: false, seed: 1, autopilot: true }, { force: true }, true],
    ['sin Players/CameraRig (navegador)', { demo: false, seed: 1 }, { headless: false }, false]
  ];
  const bad = [];
  for (const [tag, go, ro, want] of cases) {
    const g = S.createGame(go), got = RPL.reset(g, Object.assign({ headless: true }, ro));
    if (got !== want) bad.push(tag + ': ' + got + ' (' + RPL._state().why + ')');
  }
  { const g = S.createGame({ demo: false, seed: 2 }); g.watch = true; if (RPL.reset(g, { headless: true })) bad.push('espectador: true'); }
  if (bad.length) fail('(1) elegibilidad: ' + bad.join('; ')); else console.log('(1) elegibilidad: 2v2/playa sí; 6v6, demo, ejercicio, espectador, autopilot (sin force) y sin módulos de pintado no ... OK');
  RPL.reset(null);
}

// (2)+(3) partidos grabados
{
  const CASES = [
    ['pabellón humano 3', { seed: 3, ctrl: 'one' }, true, false],
    ['pabellón humano 7 (maestría)', { seed: 7, mastery: true, ctrl: 'both' }, true, false],
    ['playa humano 11', { seed: 11, venue: 'beach', ctrl: 'one' }, true, false],
    ['autopilot 12345', { seed: 12345, autopilot: true }, false, true],
    ['autopilot playa 21', { seed: 21, autopilot: true, venue: 'beach' }, false, true],
    ['autopilot 99 (sets a 11)', { seed: 99, autopilot: true, points: 11 }, false, true]
  ];
  const tot = { autos: 0, best: 0, des: 0, same: 0, slow1: 0, slowOther: 0, evP: 0, evF: 0, forbid: 0, prep: 0, live: 0, pointP: 0 }, rows = [];
  for (const [tag, opts, human, force] of CASES) {
    const d0 = RPL.desync ? 0 : 0;
    const a = match({ opts, human, replay: true, force });
    const desAuto = RPL.desync();
    if (!a.enabled) { fail('(2) ' + tag + ': Replay no graba (' + RPL._state().why + ')'); continue; }
    if (!a.g.finished) fail('(2) ' + tag + ': el partido no acaba');
    // (3) mejores jugadas
    const L = RPL.list(), n = RPL.bestCount(), st = RPL._state();
    if (!(n >= 1 && n <= 3) || L.length !== n) fail('(3) ' + tag + ': bestCount ' + n + ', list ' + L.length);
    for (let i = 1; i < L.length; i++) if (L[i].pts > L[i - 1].pts) fail('(3) ' + tag + ': list() fuera de orden ' + L.map(x => x.pts.toFixed(3)).join(' '));
    for (const x of L) {
      if (x.how === 'error' && /Peloteo de [123] /.test(x.phrase)) fail('(3) ' + tag + ': error de < 4 toques en mejores jugadas');
      if (!x.phrase || !x.sub || / \.er|1\.er|·/.test(x.phrase + x.sub)) fail('(3) ' + tag + ': textos «' + x.phrase + '» «' + x.sub + '»');
    }
    // todas en cola: orden de puntuación, sin desajuste
    const order = [];
    let ended = 0;
    const des0 = RPL.desync();
    if (!RPL.playBest(undefined, () => { ended++; })) fail('(3) ' + tag + ': playBest() no arranca');
    let guard = 0, lastI = -1;
    const evP = [], evF = [];
    while (RPL.active() && guard++ < 50000) {
      const inf = RPL.info(); if (inf && inf.phase === 'play' && inf.i !== lastI) { lastI = inf.i; order.push(inf.i); if (inf.title !== 'Mejores jugadas' || inf.pill !== (inf.i + 1) + ' de ' + n) fail('(3) ' + tag + ': rótulo ' + inf.title + ' / ' + inf.pill); }
      RPL.tick(FDT, evP, evF);
    }
    if (order.join() !== L.map((x, i) => i).join() || ended !== 1) fail('(3) ' + tag + ': playBest() orden ' + order.join() + ' (fin ' + ended + ')');
    if (RPL.desync() !== des0) fail('(3) ' + tag + ': mejores jugadas desincronizadas ' + (RPL.desync() - des0));
    // una sola (la última) y saltos
    if (n > 0) {
      if (!RPL.playBest(n - 1)) fail('(3) ' + tag + ': playBest(i)');
      while (RPL.active() && RPL.info().phase !== 'play') RPL.tick(FDT, evP, evF);
      if (!RPL.runner() || RPL.info().i !== n - 1) fail('(3) ' + tag + ': playBest(i) no enlaza la jugada ' + (n - 1));
      RPL.tick(FDT, evP, evF); RPL.skip(); let g2 = 0; while (RPL.active() && g2++ < 100) RPL.tick(FDT, evP, evF);
      if (RPL.active()) fail('(3) ' + tag + ': skip() en la última jugada no sale');
      RPL.playBest(); while (RPL.info() && RPL.info().phase !== 'play') RPL.tick(FDT, evP, evF);
      RPL.skip(true); g2 = 0; while (RPL.active() && g2++ < 100) RPL.tick(FDT, evP, evF);
      if (RPL.active() || RPL.runner()) fail('(3) ' + tag + ': skip(true) no sale de todas');
    }
    // sin repeticiones: el mismo partido
    const b = match({ opts, human, replay: false });
    const same = a.final === b.final;
    if (!same) fail('(2) ' + tag + ': el partido cambia con las repeticiones\n  con ' + a.final + '\n  sin ' + b.final);
    if (desAuto) fail('(2) ' + tag + ': ' + desAuto + ' repeticiones automáticas desincronizadas');
    if (a.badEv.length) fail('(2) ' + tag + ': filtro de eventos: ' + [...new Set(a.badEv)].slice(0, 5).join(', '));
    if (a.liveTouched) fail('(2) ' + tag + ': la partida en vivo cambia durante la repetición (' + a.liveTouched + ')');
    if (a.slowOther) fail('(2) ' + tag + ': cámara lenta con ' + a.slowOther + ' frames de ≠ 1 paso');
    tot.autos += a.autos; tot.best += n; tot.same += same ? 1 : 0; tot.slow1 += a.slow1; tot.slowOther += a.slowOther; tot.evP += a.evP; tot.evF += a.evF;
    tot.forbid += a.forbidSeen; tot.prep = Math.max(tot.prep, a.prepMax); tot.live += a.liveTouched; tot.pointP += a.pointP;
    rows.push(tag + ': ' + a.g.setScores.map(s => s.join('-')).join(' ') + ', automáticas ' + a.autos + ' ' + JSON.stringify(a.autoKinds) + ', mejores ' + n + ' [' + L.map(x => x.how + ' ' + x.pts.toFixed(2)).join(', ') + '], «' + (L[0] ? L[0].phrase + '» ' + L[0].sub : '»') + ', igual con/sin ' + same);
  }
  console.log('  ' + rows.join('\n  '));
  if (!tot.autos) fail('(2) ninguna repetición automática en ' + CASES.length + ' partidos');
  if (!tot.slow1) fail('(2) sin tramo lento');
  if (!tot.forbid) fail('(2) el filtro no ha tenido nada que quitar (¿R sin serveReady/whistle/set?)');
  if (!tot.pointP) fail('(2) el point de R no llega a Players (evP)');
  console.log('(2) ' + tot.autos + ' repeticiones automáticas + ' + tot.best + ' mejores jugadas resimuladas, desync ' + RPL.desync() + ', partido igual con/sin ' + tot.same + '/' + CASES.length +
    ', eventos evP ' + tot.evP + ' / evF ' + tot.evF + ' (filtrados ' + tot.forbid + '), cámara lenta ' + tot.slow1 + ' frames a 1 paso, prep máx ' + tot.prep.toFixed(2) + ' ms (vm)' + (failures ? '' : ' ... OK'));
}

// (2b) pausa saltada (Sim.skipHold fuera de step, como UI.onHoldSkip): sin repetición automática de ese punto
{
  const a = match({ opts: { seed: 99, autopilot: true, points: 11 }, human: false, replay: true, force: true, skipHold: true });
  if (a.autos || !a.skips) fail('(2b) pausa saltada: ' + a.autos + ' repeticiones automáticas con ' + a.skips + ' saltos');
  else console.log('(2b) pausa saltada (' + a.skips + ' skipHold): 0 repeticiones automáticas (sin saltar, la misma semilla da 1) ... OK');
}

// (4) defensa: mutación fuera de step
{
  warns.length = 0;
  const d0 = RPL.desync();
  const a = match({ opts: { seed: 5, autopilot: true, points: 11 }, human: false, replay: true, force: true, mutate: true, maxS: 400 });
  const des = RPL.desync() - d0;
  if (!(des > 0) || !warns.some(w => /repetición desincronizada/.test(w)) || a.liveTouched) fail('(4) una mutación de g fuera de Sim.step no se detecta (desync ' + des + ' de ' + a.mutPlays + ' repeticiones, avisos ' + warns.length + ')');
  else console.log('(4) mutación de g fuera de Sim.step tras el saque: ' + des + '/' + a.mutPlays + ' repeticiones desincronizadas y avisadas («[VB] repetición desincronizada»), salen sin tocar el vivo ... OK');
}

// (5) memoria: anillo en régimen. Fuera del vm (en el vm cada acceso a un global pasa por el contexto y asigna: no es lo que ve el
// navegador): una copia limpia de sim/ai/ai6/replay en el reino principal.
{
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/replay.js']) require(path.join(ROOT, f));
  const V2 = global.VB, S2 = V2.Sim, RP2 = V2.Replay;
  const g = S2.createGame({ demo: false, seed: 4, ctrl: 'one' });
  for (let i = 0; i < 600; i++) S2.step(g, STEP, null);
  RP2.reset(g, { headless: true });
  const simIn = { move: [0.3, -0.2], hit: false, jump: true, jset: false, switchPlayer: false }, EMPTY = [];
  const toss = { type: 'toss', t: 0 }, TOSS = [toss];
  // paso falso: solo avanza g.time (la sim no corre; lo que se mide es el grabador). Cada 2000 pasos un toss: foto del saque y,
  // cada 360 pasos de peloteo, foto clave (copyGame) hasta que el peloteo pasa del anillo
  const run = (n, rec) => { for (let i = 0; i < n; i++) { g.time += STEP; if (rec) { RP2.onStep(simIn, g); if (i % 2000 === 0) { toss.t = g.time; RP2.onEvents(g, TOSS); } else RP2.onEvents(g, EMPTY); } } };
  const meas = rec => { run(30000, rec); let best = Infinity; for (let r = 0; r < 3; r++) { global.gc(); global.gc(); const h0 = process.memoryUsage().heapUsed; run(10000, rec); best = Math.min(best, process.memoryUsage().heapUsed - h0); } return best; };   // (calentamiento: optimización de onStep)
  const base = meas(false);
  // (5a) el grabador (replay.js) sin copyGame: 0 asignaciones
  const cg = S2.copyGame; let nCopies = 0; S2.copyGame = function (d) { nCopies++; return d; };
  const own = meas(true) - base;
  S2.copyGame = function (d, x) { nCopies++; return cg(d, x); };
  // (5b) con copyGame (T1, sim.js): lo que asignan las fotos (5 del saque y ~25 fotos clave por 10 000 pasos)
  nCopies = 0; const withC = meas(true) - base, perCopy = (withC - own) / Math.max(1, nCopies / 6);
  const st = RP2._state();
  if (!st.on || st.step < 100000) fail('(5) memoria: el grabador no graba (' + JSON.stringify(st) + ')');
  if (own > 2048) fail('(5a) memoria: replay.js asigna ' + (own / 1024).toFixed(1) + ' KB en 10 000 pasos en régimen');
  else console.log('(5a) memoria: replay.js ' + Math.max(0, own).toFixed(0) + ' B en 10 000 pasos de onStep/onEvents en régimen (base del bucle de prueba ' + (base / 1024).toFixed(1) + ' KB, restada) ... OK');
  if (withC > 128 * 1024) fail('(5b) memoria: con las fotos (copyGame) ' + (withC / 1024).toFixed(1) + ' KB en 10 000 pasos');
  else console.log('(5b) memoria: con las fotos (copyGame de sim.js, ' + (nCopies / 6).toFixed(0) + ' copias por 10 000 pasos) ' + (Math.max(0, withC) / 1024).toFixed(1) + ' KB, ~' + Math.max(0, perCopy).toFixed(0) + ' B por copia (informativo; tope 128 KB) ... OK');
  RP2.reset(null);
}

console.log(failures ? failures + ' FALLOS' : 'TODO OK');
process.exit(failures ? 1 : 0);
