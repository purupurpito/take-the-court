#!/usr/bin/env node
/* TAKE THE COURT — tools/resumetest.js  (owner: ui_main)
 * «Retomar el partido» (1.22.0, informe de juegos de vóley 4.9; js/resume.js).
 *  A) node (vm con sim.js, ai.js, ai6.js, badges.js, retos.js, matchstats.js y resume.js): en 2v2, 6v6 con banquillo, playa, partido
 *     corto «Final apretado» y «Jugar ya», con una entrada fija por paso, VB.Resume guarda como en main.js (onFrame tras cada paso).
 *     Tras unos puntos se rehace la partida desde lo guardado (JSON → Sim.createGame(gOpts) → apply → mods) y las dos siguen con la
 *     MISMA entrada: stateHash igual en CADA saque siguiente (serveReady), la foto entera (Sim.serialize) igual en el primero, y al final
 *     lo que cuentan insignias, retos y la Estadística del partido idéntico. Además: nada antes del primer punto, gameOver borra, otra
 *     versión se descarta, una foto tocada no se aplica, ordinales «1r/2º/3r set», plain/unplain con jugadores.
 *  B) navegador (Chrome headless, perfil nuevo, UNA página; sin depuración): Partido rápido → 2 puntos → make-the-cut.resume con el
 *     marcador → recarga → billete «Seguir el partido a-b · 1r set» (y sin «¡Jugar ya!») → un toque → mismo marcador, armado, la hoja
 *     final con los puntos contados; restaurar en mitad de la pausa del punto (modo 'point') también; salir al menú lo borra; otra
 *     versión no sale; autopilot no se guarda. Carrera (22-nov-2026): guardado desde el primer saque con el candado en la Carrera, pausa
 *     sin «Reiniciar» y con «Salir (se guarda)», salir a la portada con el billete, sin simular, hub bloqueado → «Seguir el partido»
 *     (mismo marcador y nota en directo), «Jugar partido» retoma el mismo, recargar con el punto en juego → punto para el rival y la
 *     cinta lo dice, otra versión → resuelto desde el marcador al arrancar. Sin errores de consola.
 *  C) node, Carrera (career.js con nota, consignas, árbitro y ambiente; playa y pista): partido entero vs. cortado y rehecho desde el JSON
 *     → mismo resumen de jornada y misma Carrera guardada; foto live → punto para el rival (Sim.concede), determinista; candado (ni
 *     simular ni dificultad); resolución desde el marcador (nunca 0-0); otra versión no se tira; pack/unpack.
 * Uso: node tools/resumetest.js [--node] [--browser]   (sin nada, todo; --node = A y C; sale con 1 si algo falla)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok:', m); else { fail++; console.error('FALLO:', m); } };
const ONLY_NODE = process.argv.includes('--node'), ONLY_BR = process.argv.includes('--browser');

// ------------------------------------------------------------------------------------------------ A) node
function loadVB() {
  const ctx = { console, Math, Date, JSON };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/badges.js', 'js/retos.js', 'js/matchstats.js', 'js/resume.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.VB.VERSION = 'test-1';
  return ctx.VB;
}
function inputAt(k) {   // entrada fija por paso (mueve, golpea, salta y coloca de vez en cuando)
  const a = Math.sin(k * 0.013) * 0.9, b = Math.cos(k * 0.0071) * 0.9;
  return { move: [a, b], hit: k % 37 === 0, jump: k % 91 === 0, jset: k % 173 === 0, switchPlayer: false };
}
function modsSnap(VB, g) {
  const b = VB.Badges.resumeGet(g), r = VB.Retos.resumeGet(g), m = VB.MatchStats.resumeGet(g);
  return JSON.stringify([b, r && r.c, m]);
}
function partA() {
  console.log('--- A) node: guardar y rehacer con la sim de verdad');
  const VB = loadVB(), S = VB.Sim, R = VB.Resume, DT = 1 / VB.C.SIM_HZ;
  ok(R.setLabel(1) === '1r set' && R.setLabel(2) === '2º set' && R.setLabel(3) === '3r set' && R.setLabel(4) === '4º set', 'ordinales: ' + [1, 2, 3, 4].map(R.setLabel).join(', '));
  const CASES = [
    { id: '2v2', o: { demo: false, seed: 42, difficulty: 'normal', present: true, stats: true, mastery: true, aimSet: true, feint: true, djump: true, points: 21, ctrl: 'one', ctrlIdx: 0, venue: 'hall' }, at: 3, secs: 420 },
    { id: '6v6 con banquillo', o: { demo: false, seed: 7, difficulty: 'hard', present: true, stats: true, format: '6v6', ctrl: 'one', ctrlRole: 'OH', feint: true, djump: true, bench: [S.defaultBench(0), S.defaultBench(1)], coach: [{ auto: true, iq: 2 }, { auto: false, iq: 2 }] }, at: 4 },
    { id: 'playa (zona)', o: { demo: false, seed: 9, difficulty: 'easy', present: true, stats: true, venue: 'beach', mastery: true, djump: true, zone: {} }, at: 2 },
    { id: 'corto «Final apretado»', o: { demo: false, seed: 11, difficulty: 'expert', present: true, stats: true, quick: true, sets: 1, points: 25, start: { setNo: 1, score: [20, 20], serving: 1, srvIdx: 0, bo1: true }, mastery: true, djump: true }, at: 1, qs: { len: 'clutch', pts: 25, from: 20 } },
    { id: '«Jugar ya» (un set a 15)', o: { demo: false, seed: 5, difficulty: 'easy', present: true, stats: true, sets: 1, points: 15, mastery: true, djump: true, rookie: true }, at: 2 }
  ];
  for (const C of CASES) {
    VB.Badges._reset(); VB.Retos._reset(); VB.MatchStats.reset(); R.clear();
    const gOpts = JSON.parse(JSON.stringify(C.o));
    const g = S.createGame(JSON.parse(JSON.stringify(gOpts)));
    R.arm(g, { kind: 'quick', opts: { format: C.o.format || '2v2' }, gOpts, map: '', qs: C.qs || null });
    const ev = [], feed = (gg, list) => { for (const e of list) { VB.Badges.ingest(e, gg); VB.Retos.ingest(e, gg); VB.MatchStats.ingest(e, gg); } };
    S.drainEvents(g, ev); feed(g, ev);
    let k = 0, pts = 0, early = false, kS = -1, rec = null;
    for (; k < 120 * 900 && !g.finished; k++) {
      S.step(g, DT, inputAt(k)); ev.length = 0; S.drainEvents(g, ev); feed(g, ev);
      if (!pts && R.load()) early = true;
      R.onFrame(g, ev);
      for (const e of ev) if (e.type === 'point') pts++;
      if (pts >= C.at && ev.some(e => e.type === 'point')) { kS = k; rec = R.load(); break; }
    }
    ok(!early, C.id + ': nada guardado antes del primer punto');
    ok(!!rec && rec.kind === 'quick' && rec.v === 'test-1' && rec.sc.score[0] === g.score[0] && rec.sc.score[1] === g.score[1] && rec.sc.setNo === g.setNo,
      C.id + ': guardado al acabar el punto ' + C.at + ' (' + (rec ? rec.sc.score.join('-') + ', ' + R.setLabel(rec.sc.setNo) + ', ' + JSON.stringify(rec).length + ' bytes' : 'nada') + ', modo ' + g.mode + ')');
    if (!rec) continue;
    const pk = R.peek();
    ok(pk && pk.label === 'Seguir el partido' && pk.sub === g.score[0] + '-' + g.score[1] + ' · ' + (rec.sc.one ? 'set único' : R.setLabel(g.setNo)), C.id + ': portada «' + (pk && pk.label + ' ' + pk.sub) + '»');
    const mods0 = rec.mods;
    // el original sigue: hashes en cada saque y foto en el primero; al final, lo contado por los módulos
    const N = 120 * (C.secs || 150), hA = [], snapA = [];
    for (let j = 1; j <= N && !g.finished; j++) {
      S.step(g, DT, inputAt(kS + j)); ev.length = 0; S.drainEvents(g, ev); feed(g, ev); R.onFrame(g, ev);
      if (ev.some(e => e.type === 'serveReady')) { hA.push(j + ':' + S.stateHash(g)); if (snapA.length < 1) snapA.push(JSON.stringify(S.serialize(g))); }
    }
    const modsA = modsSnap(VB, g), finA = g.finished;
    if (finA) ok(!R.load(), C.id + ': gameOver borra lo guardado');
    // rehecho desde el JSON guardado (como tras recargar la página)
    VB.Badges._reset(); VB.Retos._reset(); VB.MatchStats.reset();
    const rec2 = JSON.parse(JSON.stringify(rec));
    const g2 = S.createGame(JSON.parse(JSON.stringify(rec2.gOpts)));
    ok(R.apply(rec2, g2), C.id + ': apply (huella de la foto = la de la partida rehecha)');
    R.mods(rec2, g2);
    ok(JSON.stringify(R._plain(VB.Badges.resumeGet(g2), g2)) === JSON.stringify(mods0.bd) && JSON.stringify(R._plain(VB.Retos.resumeGet(g2), g2)) === JSON.stringify(mods0.rt), C.id + ': insignias y retos vuelven tal cual');
    R.arm(g2, { kind: 'quick', opts: {}, gOpts: rec2.gOpts, played: true });
    const hB = [], snapB = [];
    for (let j = 1; j <= N && !g2.finished; j++) {
      S.step(g2, DT, inputAt(kS + j)); ev.length = 0; S.drainEvents(g2, ev); feed(g2, ev); R.onFrame(g2, ev);
      if (ev.some(e => e.type === 'serveReady')) { hB.push(j + ':' + S.stateHash(g2)); if (snapB.length < 1) snapB.push(JSON.stringify(S.serialize(g2))); }
    }
    ok(hA.length > 0 && JSON.stringify(hA) === JSON.stringify(hB), C.id + ': stateHash igual en los ' + hA.length + ' saques siguientes' + (hA.length ? ' (1º ' + hA[0] + ')' : ''));
    ok(snapA.length === 1 && snapA[0] === snapB[0], C.id + ': la foto entera igual en el saque siguiente');
    ok(modsA === modsSnap(VB, g2), C.id + ': insignias, retos y Estadística del partido idénticos al final (' + (finA ? 'partido acabado' : g.score.join('-') + ' set ' + g.setNo) + ')');
  }
  // punto en juego (22-nov-2026): la foto de antes del saque, al lanzar el saque o golpear, pasa a live: 1 (retomarla no cuenta)
  {
    VB.Badges._reset(); VB.Retos._reset(); VB.MatchStats.reset(); R.clear();
    const gOpts = { demo: false, seed: 42, difficulty: 'normal', present: true, stats: true, points: 21, ctrl: 'one', ctrlIdx: 0, venue: 'hall' };
    const g = S.createGame(JSON.parse(JSON.stringify(gOpts)));
    R.arm(g, { kind: 'quick', opts: {}, gOpts, map: '' });
    const ev = [];
    let k = 0, pts = 0, atReady = null, live = null, cleared = null, liveTxt = null;
    for (; k < 120 * 900 && !g.finished && !cleared; k++) {
      S.step(g, DT, inputAt(k)); ev.length = 0; S.drainEvents(g, ev); R.onFrame(g, ev);
      for (const e of ev) if (e.type === 'point') pts++;
      if (pts >= 1 && ev.some(e => e.type === 'serveReady')) atReady = R.load();
      if (atReady && !live && ev.some(e => e.type === 'toss' || e.type === 'hit')) { live = R.load(); liveTxt = JSON.stringify(live); }
      if (live && ev.some(e => e.type === 'point')) cleared = R.load();
    }
    ok(!!atReady && !atReady.live && !R.noCount(atReady), 'punto en juego: la foto del saque, sin live');
    ok(!!live && live.live === 1 && R.noCount(live) && live.h === atReady.h && JSON.stringify(live.snap) === JSON.stringify(atReady.snap), 'punto en juego: al lanzar el saque, la MISMA foto con live: 1');
    ok(!!cleared && !cleared.live && !R.noCount(cleared), 'punto en juego: al acabar el punto, foto nueva sin live');
    R.clear();
    // retomarla: se aplica, pero sigue sin contar (las fotos siguientes llevan nc: 1)
    const rec2 = JSON.parse(liveTxt), g2 = S.createGame(JSON.parse(JSON.stringify(rec2.gOpts)));
    ok(R.apply(rec2, g2), 'punto en juego: la foto live se puede retomar (huella igual)');
    R.arm(g2, { kind: 'quick', opts: {}, gOpts: rec2.gOpts, played: true, nc: R.noCount(rec2) });
    let saved = null;
    for (let j = 0; j < 120 * 120 && !g2.finished && !saved; j++) {
      S.step(g2, DT, inputAt(j)); ev.length = 0; S.drainEvents(g2, ev); R.onFrame(g2, ev);
      if (ev.some(e => e.type === 'point')) saved = R.load();
    }
    ok(!!saved && saved.nc === 1 && !saved.live && R.noCount(saved) && R.peek().nc === true, 'retomado con el punto en juego: las fotos siguientes llevan nc: 1 (no cuenta)');
    R.clear(); R.disarm();
  }
  // versión distinta, foto tocada, plain/unplain
  {
    const g = S.createGame({ demo: false, seed: 3, difficulty: 'normal', stats: true });
    S.drainEvents(g, []);   // (los eventos de createGame, como hace main.js en el primer frame: con eventos sin repartir no se guarda)
    g.score[0] = 4; g.score[1] = 2;
    R.arm(g, { kind: 'quick', opts: {}, gOpts: { demo: false, seed: 3, difficulty: 'normal', stats: true } });
    ok(!R.save(g) && !R.load(), 'con marcador pero sin punto jugado aquí (p. ej. «Final apretado» a 20-20): no se guarda');
    R.arm(g, { kind: 'quick', opts: {}, gOpts: { demo: false, seed: 3, difficulty: 'normal', stats: true }, played: true });
    ok(R.save(g) && !!R.load(), 'save con marcador 4-2 (retomado: played)');
    VB.VERSION = 'test-2';
    ok(!R.load() && !R.load(), 'otra versión: se descarta (y se borra)');
    VB.VERSION = 'test-1';
    R.save(g); const rec = R.load(); rec.h = (rec.h + 1) >>> 0;
    ok(!R.apply(rec, S.createGame({ demo: false, seed: 3, difficulty: 'normal', stats: true })), 'foto con la huella tocada: no se aplica');
    const p = g.players[1], pl = R._plain({ a: [p, null], b: { c: g, n: 3 } }, g);
    const up = R._unplain(JSON.parse(JSON.stringify(pl)), g);
    ok(pl.a[0].$pid === p.id && up.a[0] === p && up.b.c === g && up.b.n === 3, 'plain/unplain: jugadores por id y la partida');
    R.clear(); R.disarm();
  }
}

// ------------------------------------------------------------------------------------------------ C) node: la Carrera
// Decisión de Ferran (22-nov-2026): en la Carrera no se puede reiniciar ni repetir un partido o un punto. Con la Carrera de verdad
// (career.js + nota en directo + consignas + árbitro + ambiente) y la sim de verdad: el bucle de main.js en pequeño (ingest, director del
// ambiente con sus 3 puertas, VB.Resume.onFrame). Partido entero sin cortar vs. cortado tras unos puntos y rehecho desde el JSON → la
// misma nota, las mismas estadísticas, el mismo resumen de jornada y la misma Carrera guardada. Foto con el punto en juego → ese punto
// para el rival (Sim.concede), determinista. Candado: no se simula ni avanza; una foto que no vale se resuelve desde el marcador.
function careerBoot() {
  const H = require('./storyhelp.js');
  const B = H.boot({ ext: false, extra: ['js/ai.js', 'js/ai6.js', 'js/consignas.js', 'js/arbitro.js', 'js/ambiente.js', 'js/resume.js'] });
  B.VB.VERSION = 'test-1';
  return B;
}
function careerPrep(B, mode, seed) {
  const C = B.C;
  C._reset(); for (const k of Object.keys(B.mem)) delete B.mem[k];
  if (mode === 'hall') {
    const ctry = C.hall.countries ? C.hall.countries() : [];
    C.create({ mode: 'hall', name: 'Prueba Pista', num: 7, role: 'OH', seed, country: ctry[0] && (ctry[0].cc || ctry[0].id || ctry[0]) });
  } else C.create({ mode: 'beach', name: 'Prueba Playa', num: 7, role: 'atk', seed });
  const c = C.get(); if (!c) return false;
  if (c.phase === 'pick' || (c.offers && c.offers.length && c.myClub < 0)) {
    const oi = Math.max(0, (c.offers || []).findIndex(o => !o.trial));
    C.acceptOffer(oi, 2);
  }
  // la primera jornada que se juegue (no en el banquillo)
  for (let i = 0; i < 6; i++) { const n = C.next(C.get()); if (n && !n.bench) break; if (n && n.bench) C.benchNext(); else break; }
  return !!C.matchSetup();
}
/** Partida de Carrera como la monta main.js (startCareerMatch → startMatch): opciones de Sim.createGame, g.career y lo de fuera. */
function careerGame(B, seed) {
  const VB = B.VB, S = VB.Sim, C = B.C, m = C.matchSetup(), six = m.format === '6v6';
  const gOpts = { demo: false, seed, difficulty: m.difficulty, autopilot: false, rookie: !!m.rookie, present: true, points: m.points, ctrl: 'one', ctrlRole: six ? (m.ctrlRole || 'OH') : undefined,
    ctrlIdx: m.ctrlIdx | 0, attrs: m.attrs, badges: m.badges || null, ref: m.ref, nums: m.nums || undefined, format: six ? '6v6' : undefined, venue: six ? undefined : (m.venue || 'beach'),
    mastery: !six, aimSet: true, feint: true, djump: true, stats: true, amb: true, zone: { cpu: true }, scout: m.scout || undefined, serveSig: m.serveSig || undefined,
    bench: six ? m.bench : undefined, coach: six ? m.coach : undefined, meSlot: six ? m.meSlot : undefined, meBench: six ? m.meBench : undefined, names: six ? m.names : undefined };
  const gK = JSON.parse(JSON.stringify(gOpts));
  const g = S.createGame(JSON.parse(JSON.stringify(gK)));
  const cs = m.career; cs.calls = true; cs.ambient = 'full'; cs.ambSum = null;
  try { cs.amb = C.ambCtx(C.get(), null, cs) || null; } catch (e) { }
  g.career = cs;
  return { g, gOpts: gK, cs, m };
}
function careerLoop(B, g, from, n, stopAt) {   // n pasos desde from (entrada fija), como main.js; stopAt(ev, k) → true para parar
  const VB = B.VB, S = VB.Sim, A = VB.Ambiente, R = VB.Resume, C = B.C, DT = 1 / VB.C.SIM_HZ, ev = [], out = [];
  let k = from;
  for (; k < from + n && !g.finished; k++) {
    S.step(g, DT, inputAt(k)); ev.length = 0; S.drainEvents(g, ev);
    C.ingest(ev, g);
    const st = A.of(g);
    if (st) {
      out.length = 0;
      const ctl = A.frame(st, g, DT, out, { intro: false, ff: false, bench: !!g.ctrlOut, reduce: false, replay: false });
      if (ctl.hold > 0 && S.holdFor) S.holdFor(g, ctl.hold, !!ctl.lock);
      if (ctl.penalty >= 0) { let ok2 = false; if (S.canPenalty(g, ctl.penalty)) ok2 = !!S.penalty(g, ctl.penalty, { card: ctl.pcard || 'red', pid: ctl.ppid }); A.penaltyDone(st, ok2); }
      for (const x of out) ev.push(x);
    }
    let sum = null;
    for (const e of ev) if (e.type === 'gameOver') sum = C.matchDone({ sets: [e.sets[0], e.sets[1]], setScores: e.setScores || g.setScores, win: e.team === 0 }, null, g);
    R.onFrame(g, ev);
    if (sum) return { k, sum };
    if (stopAt && stopAt(ev, k)) return { k, sum: null, ev };
  }
  return { k, sum: null };
}
function careerSnap(B) { const c = B.C.get(); const o = JSON.parse(JSON.stringify(c)); delete o.created; return JSON.stringify(o); }
function partC() {
  console.log('--- C) node: la Carrera (seguir el partido sin poder repetirlo)');
  const B = careerBoot(), VB = B.VB, S = VB.Sim, R = VB.Resume, C = B.C;
  ok(R.CAREER === true, 'Carrera: el interruptor está encendido (CAREER)');
  ok(typeof S.concede === 'function' && typeof C.resumeGet === 'function' && typeof C.lockAny === 'function', 'Sim.concede, Career.resumeGet/resumeSet y el candado existen');
  for (const mode of ['beach', 'hall']) {
    const SEED = mode === 'hall' ? 777 : 4242, GS = mode === 'hall' ? 31 : 17, AT = mode === 'hall' ? 9 : 7, MAXK = 120 * 60 * 40;
    if (!careerPrep(B, mode, SEED)) { ok(false, mode + ': sin partido de Carrera que jugar'); continue; }
    const mem0 = JSON.stringify(B.mem);
    const restore = () => { for (const k of Object.keys(B.mem)) delete B.mem[k]; Object.assign(B.mem, JSON.parse(mem0)); C._reset(); C.abortMatch(); R.clear(); R.disarm(); };
    // A) el partido entero sin cortar
    restore();
    let G = careerGame(B, GS); const sig = C.matchSig();
    R.arm(G.g, { kind: 'career', opts: {}, gOpts: G.gOpts, map: '', cm: sig });
    let early = null;
    const rA = careerLoop(B, G.g, 0, MAXK, (ev) => { if (!early && ev.some(e => e.type === 'serveReady')) early = R.load('career'); return false; });
    ok(!!rA.sum && typeof rA.sum.nota === 'number', mode + ': partido A entero (' + (rA.sum ? rA.sum.sets.join('-') + ', nota ' + rA.sum.nota : 'sin acabar') + ')');
    ok(!!early && early.sc.score[0] + early.sc.score[1] === 0 && early.kind === 'career', mode + ': guardado ya en el primer saque (0-0: el primer peloteo cuenta)');
    ok(!R.load('career'), mode + ': gameOver borra la foto');
    const sumA = JSON.stringify(rA.sum), carA = careerSnap(B);
    // B) el mismo, cortado tras AT puntos y rehecho desde el JSON (como al recargar la página)
    restore();
    G = careerGame(B, GS);
    R.arm(G.g, { kind: 'career', opts: {}, gOpts: G.gOpts, map: '', cm: sig });
    let pts = 0, recTxt = null;
    const cut = careerLoop(B, G.g, 0, MAXK, (ev) => { for (const e of ev) if (e.type === 'point') pts++; if (pts >= AT && ev.some(e => e.type === 'serveReady')) { recTxt = B.mem[R.KEYS.career]; return true; } return false; });
    ok(!!recTxt && !B.mem[R.KEY], mode + ': foto en make-the-cut.resume.career (' + (recTxt ? recTxt.length + ' bytes' : 'nada') + '), no en la del Partido rápido');
    if (!recTxt) continue;
    const rec = JSON.parse(recTxt);
    ok(!!(rec.mods && rec.mods.cr && rec.mods.cr.o && rec.mods.cr.o.length > 10), mode + ': la foto lleva lo de career.js (M en grafo: ' + (rec.mods.cr ? rec.mods.cr.o.length : 0) + ' objetos)');
    const lr0 = C.liveRating(G.g), rt0 = lr0 ? lr0.v : null, kNext = cut.k + 1;
    // «se cierra»: fuera la partida y M (como una página nueva)
    C.abortMatch(); R.disarm(); C._reset();
    const G2 = careerGame(B, GS);
    const g2 = S.createGame(JSON.parse(JSON.stringify(rec.gOpts)));
    ok(R.apply(rec, g2), mode + ': la foto se aplica (huella igual)');
    g2.career = G2.cs;
    R.arm(g2, { kind: 'career', opts: {}, gOpts: rec.gOpts, map: '', cm: rec.cm, played: true });
    R.mods(rec, g2);
    const lr1 = C.liveRating(g2);
    ok(lr1 && lr1.v === rt0, mode + ': la nota en directo sigue donde estaba (' + rt0 + ')');
    const rB = careerLoop(B, g2, kNext, MAXK, null);
    ok(!!rB.sum, mode + ': partido B (cortado y retomado) acabado');
    ok(rB.sum && JSON.stringify(rB.sum) === sumA, mode + ': resumen de jornada idéntico al de sin cortar (nota ' + (rB.sum && rB.sum.nota) + ', ' + (rB.sum && rB.sum.sets.join('-')) + ')');
    if (rB.sum && JSON.stringify(rB.sum) !== sumA) { const a = JSON.parse(sumA), b = rB.sum; for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log('   distinto ' + k + ': ' + JSON.stringify(a[k]).slice(0, 200) + ' | ' + JSON.stringify(b[k]).slice(0, 200)); }
    ok(careerSnap(B) === carA, mode + ': la Carrera guardada al final, idéntica');
    // C) punto en juego: la foto del saque pasa a live; al retomarla, ese punto es para el rival (siempre el mismo resultado)
    restore();
    G = careerGame(B, GS);
    R.arm(G.g, { kind: 'career', opts: {}, gOpts: G.gOpts, map: '', cm: sig });
    pts = 0; let atReady = null, liveTxt = null;
    careerLoop(B, G.g, 0, MAXK, (ev) => {
      for (const e of ev) if (e.type === 'point') pts++;
      if (pts >= 3 && !atReady && ev.some(e => e.type === 'serveReady')) atReady = R.load('career');
      if (atReady && ev.some(e => e.type === 'toss' || e.type === 'hit')) { liveTxt = B.mem[R.KEYS.career]; return true; }
      return false;
    });
    const live = liveTxt ? JSON.parse(liveTxt) : null;
    ok(!!live && live.live === 1 && R.lost(live) && !R.noCount(live) && live.h === atReady.h, mode + ': punto en juego: la misma foto con live: 1 (lost, no «no cuenta»)');
    if (live) {
      const res = [];
      for (let t = 0; t < 2; t++) {
        C.abortMatch(); R.disarm(); C._reset();
        const Gx = careerGame(B, GS), gx = S.createGame(JSON.parse(JSON.stringify(live.gOpts)));
        R.apply(live, gx); gx.career = Gx.cs; R.arm(gx, { kind: 'career', opts: {}, gOpts: live.gOpts, cm: live.cm, played: true }); R.mods(live, gx);
        for (let n = 0; gx.mode !== 'serve' && gx.mode !== 'rally' && n < 4800; n++) S.step(gx, 1 / VB.C.SIM_HZ, { move: [0, 0] });
        const e = S.concede(gx, 0);
        res.push(JSON.stringify([e && e.team, gx.score, gx.sets, S.stateHash(gx)]));
      }
      const rv = JSON.parse(res[0]);
      ok(rv[0] === 1 && (rv[1][1] === live.sc.score[1] + 1 || rv[2][1] > live.sc.sets[1]), mode + ': al retomar, punto para el rival (' + live.sc.score.join('-') + ' → ' + rv[1].join('-') + ')');
      ok(res[0] === res[1], mode + ': y siempre igual (determinista)');
    }
    // D) candado: no se simula, ni la dificultad cambia; una foto que no vale se resuelve desde su marcador
    restore();
    const wkOf = () => { const n = C.next(C.get()); return JSON.stringify(n && [n.week, n.round]); }, n0 = wkOf();
    const E = mode === 'hall' ? C.hall : C.beach;
    ok(E.lockSet({ cm: sig, ext: null, sc: rec.sc, t: 1, v: 'test-1' }) && C.lockAny() && C.lockAny().mode === mode, mode + ': candado en el guardado de la Carrera (c.lock)');
    ok(C.simulateNext() === null && wkOf() === n0, mode + ': con candado no se puede simular ni pasar de jornada');
    ok(C.setDifficulty(C.diffOf() === 'easy' ? 'hard' : 'easy') === 'match', mode + ': ni cambiar la dificultad');
    const notes0 = C.get().notes.length, sr = E.lockResolve(rec.sc);
    const pre = rec.sc.ss.length;
    ok(!!sr && sr.setScores && JSON.stringify(sr.setScores.slice(0, pre)) === JSON.stringify(rec.sc.ss) && !C.lockAny() && C.get().notes.length === notes0 + 1, mode + ': foto que no vale → resuelto desde ' + rec.sc.score.join('-') + ' (set ' + rec.sc.setNo + '): ' + (sr ? sr.setScores.map(x => x.join('-')).join(', ') : 'nada'));
    ok(sr && sr.setScores[pre] && sr.setScores[pre][0] >= rec.sc.score[0] && sr.setScores[pre][1] >= rec.sc.score[1], mode + ': el set a medias sigue desde su marcador (nunca 0-0)');
    ok(C.get().inbox.some(m => m.t === 'Partido resuelto'), mode + ': y la Carrera lo cuenta («Partido resuelto»)');
    R.clear(); R.disarm();
  }
  // simRest: foto en la pausa del cambio de set (el set ya está en ss)
  {
    const r = (() => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const q = C.beach._simRest({ score: [21, 18], sets: [1, 0], ss: [[21, 18]], setNo: 1, pts: 21, tw: 2 }, 0.5, r, 21);
    ok(q.setScores[0].join('-') === '21-18' && q.setScores.length >= 2 && (q.sets[0] === 2 || q.sets[1] === 2), 'simRest: con el set ya cerrado sigue en el siguiente (' + q.setScores.map(x => x.join('-')).join(', ') + ')');
  }
  // otra versión: la foto de Carrera no sale ni se puede retomar, pero NO se tira (main.js la resuelve desde su marcador)
  {
    R.clear();
    const g = S.createGame({ demo: false, seed: 3, difficulty: 'normal', stats: true });
    S.drainEvents(g, []);
    R.arm(g, { kind: 'career', opts: {}, gOpts: { demo: false, seed: 3, difficulty: 'normal', stats: true }, cm: 'beach|1|league|league|0|0||3' });
    ok(R.save(g) && !!R.load('career') && R.peek() && R.peek().kind === 'career' && R.peek().sub === '0-0 · 1r set', 'Carrera: se guarda sin puntos jugados (desde el primer saque) y la portada la ofrece («' + (R.peek() && R.peek().sub) + '»)');
    VB.VERSION = 'test-2';
    ok(!R.load('career') && !R.peek() && !!R.raw('career') && R.raw('career').sc.score.length === 2, 'Carrera de otra versión: ni se ofrece ni se retoma, pero se queda (raw) para resolverla desde el marcador');
    VB.VERSION = 'test-1';
    g.events.push({ type: 'x' });
    ok(!R.save(g), 'con eventos de la sim sin repartir no se guarda (el siguiente sí)');
    g.events.length = 0;
    R.clear(); R.disarm();
  }
  // pack/unpack: grafo con compartidos, ciclos, -0, NaN, undefined, funciones fuera y jugadores
  {
    const g = S.createGame({ demo: false, seed: 3, difficulty: 'normal' }), p = g.players[2];
    const sh = { a: 1 }, o = { x: sh, y: [sh, p, g], z: -0, w: NaN, u: undefined, f: function () { } }; o.self = o;
    const back = R._unpack(JSON.parse(JSON.stringify(R._pack(o, g))), g);
    ok(back.x === back.y[0] && back.y[1] === p && back.y[2] === g && Object.is(back.z, -0) && Number.isNaN(back.w) && 'u' in back && back.u === undefined && !('f' in back) && back.self === back, 'pack/unpack: compartidos, ciclos, -0, NaN, undefined, jugadores y la partida; sin funciones');
  }
}

// ------------------------------------------------------------------------------------------------ B) navegador
async function partB() {
  console.log('--- B) navegador: guardar, recargar y «Seguir el partido»');
  const CDP = require('./cdp.js');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(pg, expr, ms) { const t = Date.now() + ms; while (Date.now() < t) { try { if (await pg.evalJs(expr)) return true; } catch (e) { } await sleep(150); } return false; }
  // (ctx.frame > 5: los módulos ya han hecho init; antes de init ui.js bootBusy() da false y el menú «parece» listo)
  const READY = "VB.ctx&&VB.ctx.state==='menu'&&VB.ctx.frame>5&&VB.UI&&VB.UI.bootBusy&&!VB.UI.bootBusy()";
  const J = async (pg, expr) => JSON.parse(await pg.evalJs('JSON.stringify(' + expr + ')'));
  const pg = await CDP.open({ size: '1280x720' });
  try {
    await pg.navigate('');
    ok(await waitFor(pg, READY, 30000), 'arranca en el menú');
    await pg.evalJs("localStorage.setItem('make-the-cut.record', JSON.stringify({played:3,won:1}));VB.ctx.actions.setSetting('difficulty','easy');VB.ctx.actions.setSetting('matchLen','full');VB.ctx.actions.setSetting('setPoints',25)");
    // autopilot (herramientas): no se arma
    await pg.evalJs("VB.ctx.actions.startMatch({autopilot:true,noIntro:true})"); await sleep(400);
    ok(await J(pg, '!VB.Resume.armed()'), 'partido con autopilot: no se guarda');
    await pg.evalJs("VB.ctx.actions.toMenu()");
    ok(await waitFor(pg, "VB.ctx.state==='menu'", 5000), 'de vuelta al menú');
    // Partido rápido 2v2: dos puntos sin tocar nada (faltas de saque / la CPU)
    await pg.evalJs("VB.ctx.actions.startMatch({format:'2v2'})");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo&&VB.Resume.armed()===VB.ctx.game", 10000), 'Partido rápido: armado');
    ok(await J(pg, "!localStorage.getItem('make-the-cut.resume')"), 'sin punto jugado: nada guardado');
    ok(await waitFor(pg, "VB.ctx.game.score[0]+VB.ctx.game.score[1]>=2&&VB.ctx.game.mode==='serve'", 90000), 'dos puntos jugados');
    // foto en mitad de la pausa del punto (modo point): se copia para probarla después
    ok(await waitFor(pg, "VB.ctx.game.mode==='point'&&(function(){var r=JSON.parse(localStorage.getItem('make-the-cut.resume')||'null');return !!r&&r.sc.score[0]+r.sc.score[1]===VB.ctx.game.score[0]+VB.ctx.game.score[1]})()", 90000), 'guardado en la pausa del punto (modo point)');
    const recPoint = await pg.evalJs("localStorage.getItem('make-the-cut.resume')");
    ok(await waitFor(pg, "VB.ctx.game.mode==='serve'&&(function(){var r=JSON.parse(localStorage.getItem('make-the-cut.resume')||'null');return !!r&&r.sc.score[0]+r.sc.score[1]===VB.ctx.game.score[0]+VB.ctx.game.score[1]})()", 30000), 'guardado otra vez al preparar el saque');
    const saved = await J(pg, "(function(){var r=JSON.parse(localStorage.getItem('make-the-cut.resume'));var u=VB.UI._netStats();return {sc:r.sc,v:r.v,kind:r.kind,h:r.h,len:JSON.stringify(r).length,ui:u.t[0].points+u.t[1].points,ver:VB.VERSION,mode:JSON.parse(localStorage.getItem('make-the-cut.resume')).snap?1:0}})()");
    ok(saved.kind === 'quick' && saved.v === saved.ver, 'sello con VB.VERSION (' + saved.v + '), ' + saved.len + ' bytes, ' + saved.sc.score.join('-'));
    // «cerrar el navegador»: recargar la página
    await pg.navigate('');
    ok(await waitFor(pg, READY, 30000), 'recarga: menú');
    await sleep(500);
    const por = await J(pg, "(function(){var b=document.getElementById('btnSeguir'),n=document.getElementById('btnNow'),c=document.getElementById('btnCont');return {vis:!!b&&!b.hidden&&b.offsetParent!==null,txt:b?b.textContent.replace(/\\s+/g,' ').trim():'',now:!!n&&!n.hidden,cont:!!c&&!c.hidden,tk:!!b&&b.classList.contains('sp-ticket')}})()");
    const sub = saved.sc.score[0] + '-' + saved.sc.score[1] + ' · 1r set';
    ok(por.vis && por.tk && por.txt.indexOf('Seguir el partido') >= 0 && por.txt.indexOf(sub) >= 0, 'portada: billete «' + por.txt + '»');
    ok(!por.now && !por.cont, 'sin «¡Jugar ya!» ni «Continuar carrera» a la vez');
    await pg.evalJs("document.getElementById('btnSeguir').click()");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo", 10000), 'un toque: el partido sigue');
    const back = await J(pg, "(function(){var g=VB.ctx.game,u=VB.UI._netStats();return {sc:[g.score[0],g.score[1]],set:g.setNo,armed:VB.Resume.armed()===g,ui:u.t[0].points+u.t[1].points}})()");
    ok(back.sc[0] === saved.sc.score[0] && back.sc[1] === saved.sc.score[1] && back.set === saved.sc.setNo, 'mismo marcador (' + back.sc.join('-') + ', set ' + back.set + ')');
    ok(back.armed, 'el partido retomado se sigue guardando');
    ok(back.ui === saved.ui && back.ui === back.sc[0] + back.sc[1], 'la hoja final lleva los puntos de antes (' + back.ui + ')');
    ok(await waitFor(pg, "VB.ctx.game.score[0]+VB.ctx.game.score[1]>=" + (back.sc[0] + back.sc[1] + 1), 90000), 'sigue jugándose (un punto más)');
    // salir al menú a mitad = abandonar
    await pg.evalJs("VB.ctx.actions.toMenu()"); await sleep(300);
    ok(await J(pg, "!localStorage.getItem('make-the-cut.resume')"), 'salir al menú a mitad lo borra');
    // restaurar la foto de la pausa del punto
    await pg.evalJs('localStorage.setItem("make-the-cut.resume",' + JSON.stringify(recPoint) + ')');
    await pg.navigate('');
    ok(await waitFor(pg, READY, 30000), 'recarga con la foto de la pausa del punto');
    await sleep(500);
    ok(await J(pg, "(function(){var b=document.getElementById('btnSeguir');return !!b&&!b.hidden})()"), 'billete a la vista');
    await pg.evalJs("document.getElementById('btnSeguir').click()");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo&&VB.Resume.armed()===VB.ctx.game", 10000), 'retomado en mitad de la pausa del punto');
    ok(await waitFor(pg, "VB.ctx.game.mode==='serve'", 20000), 'y llega al saque siguiente');
    await sleep(1500);
    await pg.evalJs("VB.ctx.actions.toMenu()"); await sleep(300);
    // (22-nov) la misma foto marcada «punto en juego» (cerrado a mitad de un peloteo): se retoma, pero ya no cuenta y lo dice
    await pg.evalJs('localStorage.setItem("make-the-cut.resume",' + JSON.stringify('{"live":1,' + recPoint.slice(1)) + ')');
    await pg.navigate('');
    ok(await waitFor(pg, READY, 30000), 'recarga con la foto «punto en juego»');
    await sleep(500);
    await pg.evalJs("document.getElementById('btnSeguir').click()");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo&&VB.Resume.armed()===VB.ctx.game", 10000), 'punto en juego: se retoma');
    const lv = await J(pg, "{nc:VB.ctx.game.rsNc===1,bn:(document.getElementById('bn3')||{}).textContent||''}");
    ok(lv.nc && /ya no cuenta/.test(lv.bn), 'punto en juego: el partido ya no cuenta (g.rsNc) y la cinta «Seguimos» lo dice («' + lv.bn + '»)');
    await pg.evalJs("VB.ctx.actions.toMenu()"); await sleep(300);
    // otra versión: no sale y se borra
    await pg.evalJs('localStorage.setItem("make-the-cut.resume",' + JSON.stringify(recPoint.replace('"v":"' + saved.ver + '"', '"v":"0.0.1"')) + ')');
    await pg.navigate('');
    ok(await waitFor(pg, READY, 30000), 'recarga con un guardado de otra versión');
    await sleep(500);
    ok(await J(pg, "(function(){var b=document.getElementById('btnSeguir');return (!b||b.hidden)&&!localStorage.getItem('make-the-cut.resume')})()"), 'otra versión: sin billete y borrado');
    // ---------------- Carrera (22-nov-2026): se guarda en cada punto y no se puede repetir
    const KC = 'make-the-cut.resume.career';
    ok(await J(pg, 'VB.Resume.CAREER') === true, 'Carrera: «Seguir el partido» encendido (CAREER)');
    const mk = await J(pg, "(function(){var C=VB.Career;var c=C.create({mode:'beach',name:'Prueba Seguir',num:7,role:'atk',seed:4242});var oi=Math.max(0,(c.offers||[]).findIndex(function(o){return !o.trial}));C.acceptOffer(oi,2);for(var i=0;i<6;i++){var n=C.next(C.get());if(n&&n.bench)C.benchNext();else break;}var n2=C.next(C.get());return {ok:!!C.matchSetup(),wk:n2?n2.week:-1}})()");
    ok(mk.ok, 'Carrera de playa creada, con partido que jugar (jornada ' + (mk.wk + 1) + ')');
    await pg.evalJs("VB.ctx.actions.startCareerMatch()");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&VB.ctx.game.career&&!VB.ctx.game.demo&&VB.Resume.armed()===VB.ctx.game&&VB.ctx.game.rsLock===1", 15000), 'partido de Carrera: armado y con candado');
    await pg.evalJs("VB.ctx.introSkipReq=true");
    ok(await waitFor(pg, "(function(){var r=JSON.parse(localStorage.getItem('" + KC + "')||'null');var c=JSON.parse(localStorage.getItem('make-the-cut.career')||'null');return !!r&&r.kind==='career'&&!!c&&!!c.lock&&c.lock.cm===r.cm})()", 30000), 'guardado ya en el primer saque, con el candado en la Carrera (c.lock)');
    ok(await waitFor(pg, "VB.ctx.game.score[0]+VB.ctx.game.score[1]>=2&&VB.ctx.game.mode==='serve'", 120000), 'dos puntos jugados');
    await pg.evalJs("VB.ctx.actions.pause()"); await sleep(300);
    const pz = await J(pg, "{r:document.getElementById('btnRestart').hidden,q:document.getElementById('btnQuit').textContent.replace(/\\s+/g,' ').trim()}");
    ok(pz.r && /Salir \(se guarda\)/.test(pz.q), 'pausa: sin «Reiniciar» y «' + pz.q + '»');
    const g0 = await J(pg, "(function(){var g=VB.ctx.game;VB.ctx.actions.restart();return {same:VB.ctx.game===g}})()");
    ok(g0.same, 'reiniciar (atajo) no hace nada');
    const sc0 = await J(pg, "(function(){var g=VB.ctx.game,lr=VB.Career.liveRating(g);return {sc:[g.score[0],g.score[1]],set:g.setNo,v:lr?lr.v:null}})()");
    await pg.evalJs("VB.ctx.actions.toMenu()"); await sleep(400);
    const out = await J(pg, "(function(){var b=document.getElementById('btnSeguir');return {st:VB.ctx.state,rec:!!localStorage.getItem('" + KC + "'),bil:!!b&&!b.hidden&&b.offsetParent!==null,txt:b?b.textContent.replace(/\\s+/g,' ').trim():'',sim:VB.Career.simulateNext(),hub:!!document.querySelector('#app.cr-on')}})()");
    ok(out.st === 'menu' && out.rec && !out.hub, 'salir: a la portada, lo guardado se queda');
    ok(out.bil && /Carrera/.test(out.txt) && out.txt.indexOf(sc0.sc[0] + '-' + sc0.sc[1]) >= 0, 'portada: billete «' + out.txt + '»');
    ok(out.sim === null, 'con el partido a medias no se puede simular la jornada');
    // el hub, bloqueado
    await pg.evalJs("VB.CareerUI.open('hub',{from:'main'})"); await sleep(500);
    const hub = await J(pg, "(function(){var b=document.querySelector('[data-act=\"lock-go\"]');return {go:!!b,sim:!!document.querySelector('[data-act=\"sim\"]'),play:!!document.querySelector('[data-act=\"play\"]'),txt:(document.querySelector('.cr-lock')||{}).textContent||''}})()");
    ok(hub.go && !hub.sim, 'hub: solo «Partido a medias» con «Seguir el partido» (' + hub.txt.replace(/\s+/g, ' ').slice(0, 80) + ')');
    await pg.evalJs("document.querySelector('[data-act=\"lock-go\"]').click()");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&VB.ctx.game.career&&VB.Resume.armed()===VB.ctx.game", 15000), 'hub → «Seguir el partido»: el partido sigue');
    const sc1 = await J(pg, "(function(){var g=VB.ctx.game,lr=VB.Career.liveRating(g);return {sc:[g.score[0],g.score[1]],set:g.setNo,v:lr?lr.v:null}})()");
    ok(sc1.sc[0] === sc0.sc[0] && sc1.sc[1] === sc0.sc[1] && sc1.v === sc0.v, 'mismo marcador (' + sc1.sc.join('-') + ') y misma nota en directo (' + sc1.v + ')');
    // empezar la jornada «de cero» retoma la misma
    await pg.evalJs("VB.ctx.actions.toMenu()"); await sleep(300);
    await pg.evalJs("VB.ctx.actions.startCareerMatch()");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&VB.ctx.game.career&&VB.Resume.armed()===VB.ctx.game", 15000), '«Jugar partido» con el partido a medias');
    const sc2 = await J(pg, "[VB.ctx.game.score[0],VB.ctx.game.score[1]]");
    ok(sc2[0] === sc0.sc[0] && sc2[1] === sc0.sc[1], '… retoma el mismo, no uno de cero (' + sc2.join('-') + ')');
    // cerrar con el punto en juego: al volver, ese punto es para el rival
    ok(await waitFor(pg, "(function(){var r=JSON.parse(localStorage.getItem('" + KC + "')||'null');if(r&&r.live===1){window.__lv=localStorage.getItem('" + KC + "');VB.ctx.actions.toMenu();return true}return false})()", 120000), 'punto en juego: foto con live: 1 (y se sale en ese momento)');
    const lvRec = await J(pg, "JSON.parse(window.__lv)");
    await pg.navigate('');
    ok(await waitFor(pg, READY, 30000), 'recarga con la foto «punto en juego» de la Carrera');
    await sleep(600);
    await pg.evalJs("document.getElementById('btnSeguir').click()");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&VB.ctx.game.career&&VB.Resume.armed()===VB.ctx.game", 15000), 'retomada');
    ok(await waitFor(pg, "/punto para el rival/.test((document.getElementById('bn3')||{}).textContent||'')", 8000), 'la cinta «Seguimos» lo dice («' + await J(pg, "(document.getElementById('bn3')||{}).textContent||''") + '»)');
    const lv2 = await J(pg, "{sc:[VB.ctx.game.score[0],VB.ctx.game.score[1]],sets:[VB.ctx.game.sets[0],VB.ctx.game.sets[1]]}");
    ok(lv2.sc[1] === lvRec.sc.score[1] + 1 || lv2.sets[1] > lvRec.sc.sets[1], 'punto para el rival (' + lvRec.sc.score.join('-') + ' → ' + lv2.sc.join('-') + ')');
    // otra versión: no se vuelve a jugar desde 0-0, se resuelve desde el marcador guardado
    ok(await waitFor(pg, "VB.ctx.game.mode==='serve'&&!!localStorage.getItem('" + KC + "')", 30000), 'guardado otra vez');
    await pg.evalJs("VB.ctx.actions.toMenu()"); await sleep(300);
    const before = await J(pg, "(function(){var r=JSON.parse(localStorage.getItem('" + KC + "'));var n=VB.Career.next(VB.Career.get());return {sc:r.sc,wk:n?n.week:-1,notes:VB.Career.get().notes.length}})()");
    await pg.evalJs("(function(){var r=JSON.parse(localStorage.getItem('" + KC + "'));r.v='0.0.1';localStorage.setItem('" + KC + "',JSON.stringify(r))})()");
    await pg.navigate('');
    ok(await waitFor(pg, READY, 30000), 'recarga con la foto de la Carrera de otra versión');
    ok(await waitFor(pg, "!localStorage.getItem('" + KC + "')", 8000), 'la foto que no vale se quita al arrancar');
    const aft = await J(pg, "(function(){var c=VB.Career.get(),n=VB.Career.next(c),b=document.getElementById('btnSeguir'),l=c.notes[c.notes.length-1];return {lock:!!c.lock,wk:n?n.week:-1,notes:c.notes.length,msg:(c.inbox||[]).some(function(m){return m.t==='Partido resuelto'}),bil:!!b&&!b.hidden,ss:l&&l.sc?l.sc:null}})()");
    ok(!aft.lock && aft.notes === before.notes + 1 && aft.msg && !aft.bil, 'otra versión: el partido se resuelve desde ' + before.sc.score.join('-') + ' (sin candado, «Partido resuelto», sin billete)');
    ok(pg.errors.length === 0, 'sin errores de consola' + (pg.errors.length ? ': ' + pg.errors.slice(0, 3).join(' | ') : ''));
  } finally { pg.close(); }
}

(async () => {
  setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 600e3).unref();
  try {
    if (!ONLY_BR) { partA(); partC(); }
    if (!ONLY_NODE) await partB();
  } catch (e) { fail++; console.error('FALLO (excepción):', e && e.stack || e); }
  console.log(fail ? fail + ' FALLO(S)' : 'TODO OK');
  process.exit(fail ? 1 : 0);
})();
