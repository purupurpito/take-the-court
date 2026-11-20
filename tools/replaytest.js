#!/usr/bin/env node
/* TAKE THE COURT — tools/replaytest.js (owner: ui_main). Pruebas de VB.Replay (js/replay.js, S3-C1 / plan T18).
 *  node tools/replaytest.js          las dos partes;  --node  solo la parte node (sim + ai + ai6 + recap + replay.js en un vm);
 *  --cdp  solo la parte CDP (el juego en Chrome headless: escenas debug=replay / debug=best, saltar con teclado, mando y toque,
 *  pestaña «Jugadas», ajustes, 6v6, ejercicio, montón, dibujos, Carrera y punto de partido; ver cdpPart al final).
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

const ONLY_CDP = process.argv.indexOf('--cdp') >= 0, ONLY_NODE = process.argv.indexOf('--node') >= 0;
if (!ONLY_CDP) {
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

}   // (fin de la parte node)

// ---------------------------------------------------------------------------------------------------------------------------------
// Parte CDP (T22, plan §5.3 a-j): el juego de verdad en Chrome headless (tools/cdp.js), escenas debug=replay / debug=best de main.js.
//  (a) debug=replay: kind 'set', fases prep → in → play → out, ≥ 3 s, desync 0, #app.replay con mosca/rótulo/pista, la sim en vivo
//      vuelve y g.setNo sube, sin errores JS
//  (b) saltar en < 0,4 s: ctx.replaySkipReq, Intro (teclado), A (mando falso de padplay.js) y toque (TOUCH, 844×390); B / Esc / «Salir»
//      en mejores jugadas salen de todas
//  (c) pestaña «Jugadas (n)»: 1-3 clips en orden de puntuación con «Verlas todas»; «Ver» de una sola y vuelta a la hoja con el foco en
//      ese «Ver»
//  (d) «Menos movimiento»: sin repetición automática (&auto=1) y sin cámara lenta en mejores jugadas; con el ajuste por defecto sí hay
//      automática; ajuste «Al final»: sin automática; «No»: sin pestaña
//  (e) 6v6 humano: Replay apagado ('6v6'), bestCount 0 y sin pestaña en la hoja 6v6
//  (f) ejercicio: apagado ('drill')
//  (g) montón: HeapProfiler.collectGarbage antes y después de 3 repeticiones, Δ < 1 MB
//  (h) dibujos (renderer.info.render.calls) en la repetición ≤ en vivo + margen, misma calidad (quality=low)
//  (i) Carrera de prueba (&career=1, playa): la frase lleva el nombre (g.career.player / mate)
//  (j) punto de partido (&match=1&auto=1): la hoja final espera a la repetición (R11) y no se ve durante ella
async function cdpPart() {
  const CDP = require(path.join(__dirname, 'cdp.js'));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const PAD = fs.readFileSync(path.join(__dirname, 'padplay.js'), 'utf8').match(/const PAD = `([\s\S]*?)`;/)[1].replace('__PADID__', JSON.stringify('Mando virtual de pruebas (STANDARD GAMEPAD)'));
  // registro por frame de las fases (desde el primer frame: init antes de la página)
  const LOG = `(function(){ var L = window.__rp = { ph: [], t0: 0 }; var last = 'x';
    function f(){ try { var c = window.VB && VB.ctx; var p = c && c.replay ? c.replay.phase + ':' + c.replay.kind + ':' + c.replay.i : null;
      if (p !== last) { L.ph.push([p, performance.now()]); last = p; } } catch (e) {} requestAnimationFrame(f); } requestAnimationFrame(f); })();`;
  const ok = (c, m, info) => { if (c) console.log('  ok   ' + m); else fail(m + (info !== undefined ? '  ' + JSON.stringify(info) : '')); return !!c; };
  let page = null;
  const open = async (size, touch) => { if (page) page.close(); page = await CDP.open({ size: size || '1280x720', touch: !!touch, init: [PAD, LOG] }); return page; };
  const E = s => page.evalJs(s);
  const J = async s => JSON.parse(await E('JSON.stringify(' + s + ')'));
  const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await E(expr)) return true; } catch (e) { } await sleep(40); } return false; };
  const go = async q => { page.errors.length = 0; await page.navigate(q); return waitFor('!!(window.VB && VB.ctx && VB.ctx.game && VB.Replay && VB.UI)', 20000); };
  const KEYS = { Enter: ['Enter', 13], Escape: ['Escape', 27] };
  const key = async code => { const k = KEYS[code]; for (const type of ['keyDown', 'keyUp']) { await page.send('Input.dispatchKeyEvent', { type, code, key: k[0], windowsVirtualKeyCode: k[1], nativeVirtualKeyCode: k[1] }); await sleep(50); } };
  const pad = async b => { await E(`__pad.set(null,{${b}:1})`); await sleep(100); await E(`__pad.set(null,{${b}:0})`); };
  const tap = async (x, y) => { await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(40); await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const PH = 'VB.ctx.replay ? VB.ctx.replay.phase : null';
  const playing = async ms => waitFor(`VB.ctx.replay && VB.ctx.replay.phase === 'play' && VB.Replay.info().t > 0.8`, ms || 15000);
  /** Salta con act() y mide hasta ctx.replay null (o hasta la siguiente jugada si next). */
  const skipTime = async (act, next) => {
    const i0 = await E('VB.ctx.replay ? VB.ctx.replay.i : -1');
    const t0 = Date.now(); await act();
    const done = await waitFor(next ? `!VB.ctx.replay || VB.ctx.replay.i !== ${i0}` : '!VB.ctx.replay', 3000);
    return done ? (Date.now() - t0) / 1000 : 99;
  };
  console.log('== replaytest (parte CDP) ==');
  try {
    // ---------------------------------------------------------------- (a)
    await open('1280x720');
    console.log('(a) debug=replay');
    await go('debug=replay');
    ok(await waitFor(`VB.ctx.replay && VB.ctx.replay.phase === 'play'`, 15000), '(a) la repetición llega a play');
    const a1 = await J(`{kind: VB.ctx.replay && VB.ctx.replay.kind, app: document.getElementById('app').classList.contains('replay'), bug: !document.getElementById('rpBug').hidden,
      cap: document.getElementById('rpCap').textContent, skip: document.getElementById('rpSkipT').textContent, hud: getComputedStyle(document.getElementById('hud')).visibility,
      aria: document.getElementById('rpAria').textContent, set0: VB.ctx.game.setNo}`);
    ok(a1.kind === 'set', '(a) kind set', a1.kind);
    ok(a1.app && a1.bug && /Punto de set/.test(a1.cap) && /1r set/.test(a1.cap) && !/·|1\.er/.test(a1.cap), '(a) #app.replay, mosca y rótulo «Punto de set | 1r set»', a1);
    ok(/Saltar/i.test(a1.skip) && a1.hud === 'hidden', '(a) pista «Intro Saltar» y HUD tapado', [a1.skip, a1.hud]);
    ok(/^Repetición: punto de set del 1r set$/.test(a1.aria), '(a) aria-live', a1.aria);
    ok(await waitFor('!VB.ctx.replay', 20000), '(a) la repetición acaba sola');
    const ph = await J('window.__rp.ph');
    const seq = ph.map(p => p[0] && p[0].split(':')[0]).filter((p, i, A) => p && A.indexOf(p) === i);
    const tPlay = (ph.find(p => p[0] && p[0].indexOf('play') === 0) || [0, 0])[1], tOut = (ph.find(p => p[0] && p[0].indexOf('out') === 0) || [0, 0])[1];
    ok(seq.join() === 'prep,in,play,out', '(a) fases prep → in → play → out', seq);
    ok(tOut - tPlay >= 3000, '(a) dura ≥ 3 s (' + ((tOut - tPlay) / 1000).toFixed(1) + ' s)');
    const a2 = await J(`{d: VB.Replay.desync(), app: document.getElementById('app').classList.contains('replay'), aria: document.getElementById('rpAria').textContent, prep: VB.Replay.prepMs()}`);
    ok(a2.d === 0 && !a2.app && a2.aria === 'Fin de la repetición', '(a) desync 0, sin #app.replay y «Fin de la repetición»', a2);
    ok(a2.prep < 8, '(a) preparación ' + a2.prep.toFixed(2) + ' ms por frame (< 8)');
    ok(await waitFor('VB.ctx.game.setNo > ' + a1.set0, 30000), '(a) la sim en vivo sigue: g.setNo sube');
    ok(!page.errors.length, '(a) sin errores JS', page.errors.slice(0, 3));

    // ---------------------------------------------------------------- (b)
    console.log('(b) saltar');
    const tries = [
      ['ctx.replaySkipReq', () => E('VB.ctx.replaySkipReq = true, 1')],
      ['Intro (teclado)', () => key('Enter')],
      ['A (mando)', async () => { await pad(0); }]
    ];
    for (const [name, act] of tries) {
      await go('debug=replay');
      if (name.indexOf('mando') >= 0) { await E('__pad.connect(), 1'); await sleep(200); }
      if (!ok(await playing(), '(b) ' + name + ': en play')) continue;
      const t = await skipTime(act);
      ok(t < 0.4, '(b) ' + name + ' salta en ' + t.toFixed(2) + ' s (< 0,4)');
      if (name.indexOf('mando') >= 0) await E('__pad.disconnect(), 1');
    }
    // mejores jugadas: Intro = siguiente, Esc = salir de todas
    await go('debug=best&tab=plays&play=1');
    if (ok(await playing(), '(b) mejores jugadas en play')) {
      const n = await E('VB.ctx.replay.n');
      const sk = await J(`document.getElementById('rpSkipT').textContent`);
      ok(n < 2 || (/Siguiente/.test(sk) && /Salir/.test(sk)), '(b) pista «Siguiente» y «Salir»', sk);
      if (n > 1) { const t = await skipTime(() => key('Enter'), true); ok(t < 0.6 && await E('!!VB.ctx.replay && VB.ctx.replay.i === 1'), '(b) Intro → la siguiente (' + t.toFixed(2) + ' s)'); }
      await playing();
      const t2 = await skipTime(() => key('Escape'));
      ok(t2 < 0.4, '(b) Esc sale de todas en ' + t2.toFixed(2) + ' s');
      ok(await waitFor(`!document.getElementById('end').hidden && VB.ctx.state === 'over'`, 3000), '(b) vuelve la hoja final');
    }
    await go('debug=best&tab=plays&play=1');
    await E('__pad.connect(), 1'); await sleep(200);
    if (await playing()) { const t = await skipTime(() => pad(1)); ok(t < 0.4, '(b) B (mando) sale de todas en ' + t.toFixed(2) + ' s'); }
    await E('__pad.disconnect(), 1');
    // táctil 844×390
    await open('844x390', true);
    await go('debug=replay');
    if (ok(await playing(), '(b) táctil: en play')) {
      const tt = await J(`[document.getElementById('rpSkipT').textContent, getComputedStyle(document.getElementById('touch')).visibility, document.getElementById('touch').hidden]`);
      ok(/Toca para saltar/.test(tt[0]) && (tt[1] === 'hidden' || tt[2]), '(b) táctil: «Toca para saltar» y mandos ocultos', tt);
      const t = await skipTime(() => tap(420, 200));
      ok(t < 0.4, '(b) toque salta en ' + t.toFixed(2) + ' s');
    }
    await go('debug=best&tab=plays&play=1');
    if (await playing()) {
      const n = await E('VB.ctx.replay.n');
      const r = await J(`(function(){ var b = document.getElementById('rpExit'); if (b.hidden) return null; var q = b.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2, q.height]; })()`);
      if (n > 1 || r) {
        ok(r && r[2] >= 44, '(b) táctil: botón «Salir» de ≥ 44 px', r);
        if (r) { const t = await skipTime(() => tap(r[0], r[1])); ok(t < 0.4 && await waitFor(`!document.getElementById('end').hidden`, 2000), '(b) «Salir» sale de todas en ' + t.toFixed(2) + ' s y vuelve la hoja'); }
      }
    }
    ok(!page.errors.length, '(b) sin errores JS', page.errors.slice(0, 3));

    // ---------------------------------------------------------------- (c)
    await open('1280x720');
    console.log('(c) pestaña «Jugadas»');
    await go('debug=best&tab=plays');
    await waitFor(`!document.getElementById('end').hidden && !document.getElementById('endPlays').hidden`, 8000);
    const c1 = await J(`{n: VB.Replay.bestCount(), pts: VB.Replay.list().map(function (o) { return o.pts; }), rows: document.querySelectorAll('#endPlays [data-play]').length,
      all: !!document.querySelector('#endPlays [data-play="all"]'), tab: (document.getElementById('endTabs-plays') || {}).textContent, txt: document.getElementById('endPlays').textContent}`);
    ok(c1.n >= 1 && c1.n <= 3, '(c) entre 1 y 3 jugadas (' + c1.n + ')');
    ok(c1.pts.every((v, i) => !i || c1.pts[i - 1] >= v), '(c) en orden de puntuación', c1.pts);
    ok(c1.rows === c1.n + (c1.n > 1 ? 1 : 0) && c1.all === c1.n > 1, '(c) un «Ver» por jugada y «Verlas todas»', c1);
    ok(c1.tab === 'Jugadas (' + c1.n + ')', '(c) pestaña «Jugadas (n)»', c1.tab);
    ok(!/·|1\.er|navegador/.test(c1.txt), '(c) textos sin «·» ni «1.er»', c1.txt);
    await E(`(function(){ var b = document.querySelector('#endPlays [data-play="${c1.n > 1 ? 1 : 0}"]'); b.focus(); b.click(); return 1; })()`);
    ok(await waitFor(`VB.ctx.replay && VB.ctx.replay.kind === 'best'`, 3000), '(c) «Ver» lanza esa jugada');
    const c2 = await J(`{i: VB.ctx.replay.i, n: VB.ctx.replay.n}`);
    ok(c2.i === (c1.n > 1 ? 1 : 0) && c2.n === c1.n, '(c) es la pulsada (i ' + c2.i + ' de ' + c2.n + ')');
    ok(await waitFor(`!VB.ctx.replay`, 25000), '(c) acaba (una sola jugada, sin la cola)');
    ok(await waitFor(`!document.getElementById('end').hidden && document.activeElement && document.activeElement.getAttribute('data-play') === '${c1.n > 1 ? 1 : 0}'`, 3000), '(c) vuelve la hoja con el foco en el «Ver» pulsado',
      await E(`document.activeElement && document.activeElement.outerHTML.slice(0, 80)`));
    // «Verlas todas»: todas en orden
    if (c1.n > 1) {
      await E(`document.querySelector('#endPlays [data-play="all"]').click(), 1`);
      const seen = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 60000) { const s = await E('VB.ctx.replay ? VB.ctx.replay.i : -1'); if (s < 0 && seen.length) break; if (s >= 0 && seen[seen.length - 1] !== s) seen.push(s); await sleep(60); }
      ok(seen.join() === [...Array(c1.n).keys()].join(), '(c) «Verlas todas»: ' + c1.n + ' jugadas en orden', seen);
      ok(await waitFor(`document.activeElement && document.activeElement.getAttribute('data-play') === 'all'`, 3000), '(c) foco de vuelta en «Verlas todas»');
      ok(await E('VB.Replay.desync()') === 0, '(c) desync 0');
    }
    ok(!page.errors.length, '(c) sin errores JS', page.errors.slice(0, 3));

    // ---------------------------------------------------------------- (d)
    console.log('(d) ajustes y «Menos movimiento»');
    const withSettings = async (st, q) => { await E(`(function(){ try { localStorage.setItem('make-the-cut.settings', ${JSON.stringify(JSON.stringify(st))}); } catch (e) {} return 1; })()`); await go(q); };
    await withSettings({}, 'debug=replay&auto=1');
    ok(await waitFor(`VB.ctx.replay && VB.ctx.replay.kind === 'set'`, 8000), '(d) por defecto (Automáticas): repetición automática del punto de set');
    await withSettings({ lessMotion: 'on' }, 'debug=replay&auto=1');
    await sleep(4000);
    ok(await E('!VB.ctx.replay && VB.ctx.reduceMotion === true'), '(d) «Menos movimiento»: sin automática');
    await withSettings({ lessMotion: 'on' }, 'debug=best&play=1');
    let slowSeen = false; const td = Date.now();
    await waitFor('!!VB.ctx.replay', 8000);
    while (Date.now() - td < 25000) { const s = await J('VB.Replay.info() ? [VB.Replay.info().slow, VB.Replay.info().phase] : null'); if (!s) break; if (s[0]) slowSeen = true; await sleep(50); }
    ok(!slowSeen, '(d) «Menos movimiento»: sin cámara lenta en mejores jugadas');
    await withSettings({ replays: 'end' }, 'debug=replay&auto=1');
    await sleep(4000);
    ok(await E(`!VB.ctx.replay && VB.ctx.settings.replays === 'end' && VB.Replay.enabled()`), '(d) «Al final»: graba pero sin automática');
    await withSettings({ replays: 'off' }, 'debug=best&tab=plays');
    await waitFor(`!document.getElementById('end').hidden`, 8000);
    ok(await E(`!document.querySelector('#endTabs [data-tab="plays"], #endTabs-plays') && !document.querySelector('#endPlays [data-play]')`), '(d) «No»: sin pestaña «Jugadas»');
    const optRow = await J(`(function(){ var b = document.querySelector('[data-opt="replays"]'); return b ? [b.closest('.opt-g').getAttribute('data-tab'), b.textContent] : null; })()`);
    ok(optRow && optRow[0] === 'game' && /Repeticiones/.test(optRow[1]), '(d) fila «Repeticiones» en Ajustes · Juego', optRow);
    await withSettings({ replays: 'basura' }, 'nonews=1');
    ok(await E(`VB.ctx.settings.replays === 'auto'`), '(d) valor corrupto → «Automáticas»');
    await E(`localStorage.removeItem('make-the-cut.settings'), 1`);

    // ---------------------------------------------------------------- (e)(f)
    console.log('(e)(f) 6v6 y ejercicio');
    await go('nonews=1');
    await waitFor(`VB.ctx.state === 'menu'`, 8000);
    await E(`VB.ctx.actions.startMatch({ format: '6v6', noIntro: true }), 1`); await waitFor('VB.ctx.game.size === 6 && !VB.ctx.game.demo', 10000);
    const e1 = await J(`{why: VB.Replay._state().why, on: VB.Replay.enabled(), n: VB.Replay.bestCount(), size: VB.ctx.game.size}`);
    ok(e1.size === 6 && e1.why === '6v6' && !e1.on && e1.n === 0, '(e) 6v6 humano: Replay apagado y bestCount 0', e1);
    await go('debug=over&format=6v6');
    await waitFor(`!document.getElementById('end').hidden`, 8000);
    ok(await E(`!document.querySelector('#endTabs-plays')`), '(e) hoja final 6v6 sin pestaña «Jugadas»');
    await go('nonews=1'); await waitFor(`VB.ctx.state === 'menu'`, 8000);
    await E(`VB.ctx.actions.startMatch({ drill: 'serve', noIntro: true }), 1`); await waitFor('!!VB.ctx.game.drill', 10000);
    const f1 = await J(`{why: VB.Replay._state().why, on: VB.Replay.enabled(), drill: !!VB.ctx.game.drill}`);
    ok(f1.drill && f1.why === 'drill' && !f1.on, '(f) ejercicio: apagado', f1);

    // ---------------------------------------------------------------- (g)(h)
    console.log('(g)(h) montón y dibujos');
    await go('debug=best&tab=plays&quality=low');
    await waitFor(`!document.getElementById('end').hidden`, 8000);
    await sleep(500);
    const heap = async () => { await page.send('HeapProfiler.collectGarbage'); await sleep(200); await page.send('HeapProfiler.collectGarbage'); return (await page.send('Runtime.getHeapUsage')).usedSize; };
    let calls = 0;
    const sample = async () => { const c = await E('VB.ctx.renderer.info.render.calls'); if (c > calls) calls = c; };
    let h0 = 0;
    for (let r = 0; r < 4; r++) {   // (la 1ª calienta: compilación JIT y cachés de la 1ª repetición, ~0,7 MB que no vuelven a crecer)
      if (r === 1) h0 = await heap();
      await E('VB.ctx.actions.playBest(0), 1');
      await waitFor('!!VB.ctx.replay', 3000);
      const t0 = Date.now(); while (Date.now() - t0 < 25000 && await E('!!VB.ctx.replay')) { await sample(); await sleep(60); }
      await waitFor(`!document.getElementById('end').hidden`, 3000);
    }
    const h1 = await heap();
    ok(h1 - h0 < 1024 * 1024, '(g) montón tras 3 repeticiones: Δ ' + ((h1 - h0) / 1024).toFixed(0) + ' KB (< 1 MB)');
    const rpCalls = calls;
    await go('debug=rally&live=1&quality=low');
    calls = 0; { const t0 = Date.now(); while (Date.now() - t0 < 6000) { await sample(); await sleep(60); } }
    ok(rpCalls > 0 && rpCalls <= calls + 4, '(h) dibujos en la repetición ' + rpCalls + ' frente a ' + calls + ' en vivo (baja, margen 4)');

    // ---------------------------------------------------------------- (i)
    console.log('(i) Carrera');
    await go('debug=replay&career=1&map=beach&rpt=1');
    await waitFor(`VB.ctx.replay && VB.ctx.replay.phase === 'play'`, 15000);
    const i1 = await J(`{L: VB.Replay.list().map(function (o) { return [o.team, o.phrase]; }), p: VB.ctx.game.career.player, m: VB.ctx.game.career.mate, venue: VB.ctx.game.venue}`);
    const mine = i1.L.filter(x => x[0] === 0 && !/^Peloteo/.test(x[1]));
    ok(i1.venue === 'beach' && mine.length > 0 && mine.every(x => x[1].indexOf(i1.p) >= 0 || x[1].indexOf(i1.m) >= 0), '(i) frases de tus jugadas con el nombre de la Carrera', i1);

    // ---------------------------------------------------------------- (j)
    console.log('(j) punto de partido');
    // (&hold=1: la celebración de END_CELEB como en un partido; sin él, la depuración abre la hoja al llegar gameOver.) Con challenge
    // posible en el punto de partido (cantada de línea) NO hay automática (S3-C1 §2.1, T24): la hoja sale sin esperar a ninguna
    // repetición. Sin challenge posible, R11: la automática sale y la hoja espera a que acabe.
    await go('debug=replay&match=1&auto=1&hold=1');
    let chal = false, sawRp = false;
    { const t0 = Date.now(); while (Date.now() - t0 < 4000) { const s = await J(`[!!(VB.Sim.canChallenge && (VB.Sim.canChallenge(VB.ctx.game, 0) > 0 || VB.Sim.canChallenge(VB.ctx.game, 1) > 0)), !!VB.ctx.replay]`); if (s[0]) chal = true; if (s[1]) sawRp = true; if (chal || sawRp) break; await sleep(50); } }
    if (chal) {
      const t0 = Date.now(); let rpSeen = false;
      while (Date.now() - t0 < 25000) { const s = await J(`[!!VB.ctx.replay, !document.getElementById('end').hidden && VB.ctx.state === 'over']`); if (s[0]) rpSeen = true; if (s[1]) break; await sleep(50); }
      const dt = (Date.now() - t0) / 1000;
      ok(!rpSeen, '(j) con challenge posible en el punto de partido, sin repetición automática');
      ok(dt < 14, '(j) la hoja final sale ' + dt.toFixed(1) + ' s después (ventana del challenge + celebración, sin repetición)');
    } else {
      ok(sawRp || await waitFor(`VB.ctx.replay && VB.ctx.replay.kind === 'match'`, 15000), '(j) repetición automática del punto de partido');
      let endDuring = false, tRp = 0;
      { const t0 = Date.now(); while (Date.now() - t0 < 25000) { const s = await J(`[!!VB.ctx.replay, !document.getElementById('end').hidden]`); if (s[0] && s[1]) endDuring = true; if (!s[0]) { tRp = Date.now(); break; } await sleep(50); } }
      ok(!endDuring && tRp > 0, '(j) la hoja no se ve durante la repetición');
      ok(await waitFor(`!document.getElementById('end').hidden && VB.ctx.state === 'over'`, 15000), '(j) la hoja final sale después');
      const dtEnd = (Date.now() - tRp) / 1000;
      ok(dtEnd > 0.3, '(j) la hoja sale ' + dtEnd.toFixed(1) + ' s después de la repetición (resto de la celebración)');
    }
    ok(!page.errors.length, '(d-j) sin errores JS', page.errors.slice(0, 3));
  } catch (e) { fail('CDP: ' + (e && e.stack || e)); }
  if (page) page.close();
}

(async () => {
  if (!ONLY_NODE) await cdpPart();
  console.log(failures ? failures + ' FALLOS' : 'TODO OK');
  process.exit(failures ? 1 : 0);
})();


