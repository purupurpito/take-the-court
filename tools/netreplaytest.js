#!/usr/bin/env node
/* MAKE THE CUT — tools/netreplaytest.js  (fase 6 del online, notes/net.md «Fase 6»)
 * Repetición, «Mejores jugadas» y estadísticas de la hoja en el online, en Node (sin Chrome).
 * Dos máquinas (cada una en su contexto vm: sim + ai + ai6 + net + netview + recap + replay) unidas por memPair (latencia, variación
 * y pérdida), con un bot de solo entrada en cada una. Cada lado graba como main.js: VB.Replay.reset(gc, {dual, slot}), onTick →
 * Replay.onStep(sess.stepInputs(), gc) y, cada frame, Replay.onEvents(gc, r.confirmed).
 *   (1) se graba en los dos lados, las mismas jugadas, y el modo offline no cambia (sin dual: el grabador de siempre).
 *   (2) cada mejor jugada, repetida desde lo grabado, reproduce la partida CONFIRMADA bit a bit (stateHash de la sombra = el de gc en el
 *       mismo tic, al final de cada frame de la repetición y en el punto), en los dos lados; desync 0.
 *   (3) el invitado ve la repetición GIRADA: runner() es una copia girada (NetView.flip de ella = la sombra canónica) y los eventos
 *       también (equipos cambiados); el marcador de list() desde su lado.
 *   (4) estadísticas de la hoja: VB.UI.netTally (código de js/ui.js, extraído) con los eventos confirmados (girados para el invitado)
 *       = tally de la partida offline equivalente (las mismas entradas, Sim.step paso a paso), girada para el invitado.
 * Uso: node tools/netreplaytest.js   (sale con 1 si algo falla)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/net.js', 'js/netview.js', 'js/recap.js', 'js/replay.js'];
const SRC = FILES.filter(f => fs.existsSync(path.join(ROOT, f))).map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
const warns = [];
function load() {
  const cons = { log: console.log, error: console.error, info: () => { }, warn: (...a) => warns.push(a.join(' ')) };
  const ctx = { console: cons };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.VB = { VERSION: 'test' };
  for (const [f, s] of SRC) vm.runInContext(s, ctx, { filename: f });
  return ctx.VB;
}
let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
}

// ---- tally de js/ui.js (newStats, tally, tallyMoments, untally y netTally tal cual, extraídos del fichero) ----
const UI_SRC = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
function cut(src, from, to) {
  const a = src.indexOf(from); if (a < 0) throw new Error('ui.js: no encuentro ' + from);
  const b = src.indexOf(to, a); if (b < 0) throw new Error('ui.js: no encuentro ' + to);
  return src.slice(a, b);
}
const TALLY_SRC = cut(UI_SRC, '  function newStats() {', '  var stats = newStats();') +
  cut(UI_SRC, '  function tally(e) {', '  /** Puntos del set decisivo') +
  // netTally también alimenta la Estadística del partido (msIngest, commit 9df2e53): msIngest tal cual, sin VB.MatchStats (no hace nada)
  'var VB = {}, ctx = { game: null };\n' + cut(UI_SRC, '  function msIngest(e, g) {', '  function msDom() {') +
  'var stats = newStats();\nvar API = {\n' + cut(UI_SRC, '    netTally: function (events) {', '    _netStats:') +
  '  stats: function () { return stats; },\n  _netStats: function () { return stats; },\n  netStatsSet: function (o) { if (o && o.t) stats = o; },\n  feed: function (evs) { for (var i = 0; i < evs.length; i++) tally(evs[i]); }\n};\n';
// (auditoría) netStClone y netStatsResync de js/main.js tal cual: la hoja del lado que salta a la foto del otro tras una vuelta con la IA
const MAIN_SRC = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
const FIX_SRC = cut(MAIN_SRC, '  function netStClone(o) {', '  function netBuildView() {') + 'this.clone = netStClone; this.fix = netStatsResync;';
function mkFix(slot, UI) { const c = { net: { slot, stSnap: null }, VB: { UI }, JSON }; vm.createContext(c); vm.runInContext(FIX_SRC, c, { filename: 'main.js (hoja tras una vuelta)' }); return c; }
function mkTally() { const c = {}; vm.createContext(c); vm.runInContext(TALLY_SRC, c, { filename: 'ui.js (tally)' }); return c.API; }
/** Lo que enseña la hoja (sin referencias a jugadores: lastHitter / blocker / undo / last*). */
function sheet(st) {
  const p = Object.keys(st.p).sort((a, b) => a - b).map(k => st.p[k]);
  return JSON.stringify({ t: st.t, longest: st.longest, p, spSaved: st.spSaved, moments: st.moments, rallyM: st.rallyM, streakM: st.streakM,
    close: st.close, sets: st.sets, setNo: st.setNo, run: st.run, runTeam: st.runTeam });
}

/** Un partido en red con grabación en los dos lados. */
function run(cfg) {
  const M = [load(), load()];
  let T = 0;
  const [la, lb] = M[0].Net.memPair({ lag: cfg.rtt, jit: cfg.jit, loss: cfg.loss, seed: cfg.seed, clock: () => T });
  const opts = { online: true, seed: 900 + cfg.seed, venue: cfg.venue || 'beach', bestOf: 1, points: cfg.points || 11, humans: [{}, {}], present: true, stats: true };
  const side = [0, 1].map(k => ({ VB: M[k], hashes: [], built: false, tally: mkTally(), view: null, confirmed: [], rpCut: 0, rsIn: 0 }));
  side.forEach((sd, k) => { sd.fix = mkFix(k, sd.tally); });
  let cutOn = false, aiOn = false;
  const sess = [0, 1].map(k => {
    const sd = side[k], VB = M[k];
    const s = new VB.Net.Session({ slot: k, link: k ? lb : la, opts: k ? null : opts, name: k ? 'Invitado' : 'Anfitrión', record: k === 0,
      onTick: (t, gc) => {
        if (VB.Replay.enabled()) VB.Replay.onStep(s.stepInputs(), gc);
        sd.hashes[t] = VB.Sim.stateHash(gc) >>> 0;
      } });
    return s;
  });
  const bots = [M[0].Net.bot(0, cfg.seed, 'bueno'), M[1].Net.bot(1, cfg.seed + 1, 'bueno')];
  const fr = M[0].Net.mulberry(cfg.seed * 31 + 7), next = [0, 3.3], off = [0, 98765.4];
  let overAt = -1, err = null;
  while (T < cfg.secs * 1000) {
    const k = next[0] <= next[1] ? 0 : 1;
    T = next[k]; next[k] += 16.667 + (fr() * 2 - 1) * 1.5;
    const s = sess[k], sd = side[k], VB = M[k];
    if (cfg.cut && !cutOn && T >= cfg.cut.at) { cutOn = true; la.down(cfg.cut.ms); }
    if (cfg.cut && cutOn && !aiOn && T >= cfg.cut.at + 11000 && k === cfg.cut.ai) aiOn = s.vsAI();
    let r;
    try {
      r = s.advance(T + off[k], s.gp ? bots[k](s.gp) : null);
      // como netBuildView: la vista y el grabador en cuanto hay opciones (antes del primer paso confirmado)
      if (!sd.built && s.opts) {
        sd.built = true;
        sd.view = VB.Sim.createGame(s.opts);
        sd.rec = VB.Replay.reset(s.gc, { dual: true, slot: k, headless: true });
        sd.rpCut = s.repaired + s.stats.resyncs;
      }
      if (sd.built) {   // como netConfirmed
        VB.NetView.mirror(sd.view, r.g, k);
        const c = s.repaired + s.stats.resyncs; if (c !== sd.rpCut) VB.Replay.cut(); sd.rpCut = c;
        if (s.stats.rsIn !== sd.rsIn) { sd.rsIn = s.stats.rsIn; sd.fix.fix(s, r.confirmed); }
        if (r.confirmed.length) {
          const mp = VB.NetView.mapEvents(r.confirmed, sd.view, k, []);
          sd.tally.netTally(mp);
          VB.Replay.onEvents(s.gc, r.confirmed);
          if (!s.solo && !s.rivalSolo && r.confirmed.some(e => e.type === 'point')) sd.fix.net.stSnap = { t: s.gcTick, st: sd.fix.clone(sd.tally._netStats()) };
        }
      }
    } catch (e) { err = e; break; }
    if (overAt < 0 && sess[0].status === 'over' && sess[1].status === 'over') overAt = T;
    if (overAt >= 0 && T - overAt > 3000) break;   // (la cola del último punto: 1,3 s)
  }
  return { M, sess, side, opts, err, T, overAt };
}

/** Repite todas las mejores jugadas de un lado comprobando la sombra contra las huellas de gc tic a tic (fin de cada frame). */
function replayAll(sd, k) {
  const VB = sd.VB, RPL = VB.Replay, S = VB.Sim, out = { clips: 0, frames: 0, cmp: 0, bad: 0, flipBad: 0, flipCmp: 0, evTeams: 0, evBad: 0, done: false, firstBad: null };
  const n = RPL.bestCount();
  if (!RPL.playBest(undefined, () => { out.done = true; })) return out;
  const evP = [], evF = [], tmp = S.createGame(sd.view.opts);
  let lastClip = -1;
  for (let f = 0; f < 60 * 120 && RPL.active(); f++) {
    RPL.tick(1 / 60, evP, evF); out.frames++;
    const st = RPL._state(), R = RPL._R();
    if (st.clip && st.clip.start !== lastClip) { lastClip = st.clip.start; out.clips++; }
    if (st.phase === 'play' || st.phase === 'out') {
      out.cmp++;
      const h = S.stateHash(R) >>> 0;
      if (h !== sd.hashes[st.k]) { out.bad++; if (!out.firstBad) out.firstBad = { k: st.k, h, want: sd.hashes[st.k] }; }
      const run = RPL.runner();
      if (run) {
        if (k === 1) {   // invitado: se pinta una copia girada; girarla otra vez da la sombra canónica
          out.flipCmp++;
          S.copyGame(tmp, run); VB.NetView.flip(tmp);
          if (run === R || (S.stateHash(tmp) >>> 0) !== h) out.flipBad++;
        } else if (run !== R) out.flipBad++;
      }
      for (const e of evP) if (e.team === 0 || e.team === 1) { out.evTeams++; if (e.replay !== true) out.evBad++; }
      if (k === 1) for (const e of evP) if (e.type === 'hit' && e.player && run && run.players.indexOf(e.player) < 0) out.evBad++;   // (jugadores de la vista girada)
    }
  }
  out.n = n; out.desync = RPL.desync();
  return out;
}

/** Tally de la partida offline equivalente: las entradas que confirmó el anfitrión, Sim.step paso a paso (como la prueba de oro). */
function offlineTally(R, slot) {
  const VB = R.M[0], S = VB.Sim, D = VB.Net.decode, g = S.createGame(R.sess[0].opts), rec = R.sess[0].rec, view = S.createGame(R.sess[0].opts);
  const tl = mkTally(), ins = [{ move: [0, 0] }, { move: [0, 0] }];
  g.events.length = 0;
  const n = R.sess[0].gcTick;
  for (let t = 0; t < n; t++) {
    const r = rec[t]; if (!r) break;
    D(r[0], r[1], r[2], ins[0]); D(r[3], r[4], r[5], ins[1]);
    S.step(g, 1 / 120, ins);
    if (g.events.length) {
      const ev = g.events.slice(); g.events.length = 0;
      VB.NetView.mirror(view, g, slot);
      tl.netTally(slot ? VB.NetView.mapEvents(ev, view, 1, []) : ev);
    }
  }
  return tl.stats();
}

const t0 = Date.now();
for (const cfg of [{ rtt: 80, jit: 15, loss: 3, secs: 900, seed: 21, venue: 'hall', points: 11 }, { rtt: 160, jit: 25, loss: 5, secs: 900, seed: 34, venue: 'hall', points: 11 }]) {
  const tag = 'RTT ' + cfg.rtt + ' ±' + cfg.jit + ' ' + cfg.loss + ' %: ';
  console.log('== partido online ' + tag + '==');
  const R = run(cfg);
  check(tag + 'sin excepciones', !R.err, R.err ? String(R.err.stack).split('\n').slice(0, 4).join(' | ') : undefined);
  if (R.err) continue;
  const [A, B] = R.side;
  check(tag + 'partido acabado en los dos lados', R.overAt > 0, { sets: R.sess[0].gc.sets, score: R.sess[0].gc.score, s: Math.round(R.T / 1000) });
  check(tag + 'graba en los dos lados (modo dual)', A.rec && B.rec && A.VB.Replay._state().dual && B.VB.Replay._state().dual, { why: [A.VB.Replay._state().why, B.VB.Replay._state().why] });
  const LA = A.VB.Replay.list(), LB = B.VB.Replay.list();
  // (cada lado da la puntuación extra a SU equipo: las listas pueden ser distintas; la misma jugada sale con el marcador y el equipo girados)
  const same = LB.map(o => [o, LA.find(q => q.setNo === o.setNo && q.how === o.how && q.score.split('-').reverse().join('-') === o.score)]).filter(x => x[1]);
  check(tag + 'mejores jugadas en los dos lados', LA.length >= 1 && LB.length >= 1, { anf: LA.map(o => o.how + ' ' + o.score + ' e' + o.team), inv: LB.map(o => o.how + ' ' + o.score + ' e' + o.team) });
  check(tag + 'el invitado ve el marcador y el equipo desde su lado (misma jugada en las dos listas)', same.length >= 1 && same.every(([o, q]) => !(q.team === 0 || q.team === 1) || o.team === 1 - q.team), { iguales: same.length });
  check(tag + 'gc idéntica en los dos lados (huellas de todos los tics)', A.hashes.length > 1000 && A.hashes.every((h, t) => B.hashes[t] === undefined || B.hashes[t] === h), { tics: A.hashes.length });
  for (const [k, sd] of [[0, A], [1, B]]) {
    const who = k ? 'invitado' : 'anfitrión', o = replayAll(sd, k);
    check(tag + who + ': todas las jugadas, repetidas desde lo grabado = partida confirmada bit a bit', o.done && o.clips === o.n && o.cmp > 100 && o.bad === 0 && o.desync === 0,
      { jugadas: o.n, vistas: o.clips, comparados: o.cmp, distintos: o.bad, desync: o.desync, primero: o.firstBad });
    check(tag + who + (k ? ': repetición GIRADA (copia girada de la sombra, eventos de la vista)' : ': repetición sin girar (la sombra tal cual)'),
      o.flipBad === 0 && o.evBad === 0 && (k === 0 || o.flipCmp > 100), { comparados: o.flipCmp, mal: o.flipBad, eventosMal: o.evBad });
  }
  // estadísticas de la hoja
  const offA = offlineTally(R, 0), offB = offlineTally(R, 1);
  const sa = sheet(A.tally.stats()), sb = sheet(B.tally.stats());
  check(tag + 'hoja del anfitrión: tally confirmado = tally de la partida offline equivalente', sa === sheet(offA), sa === sheet(offA) ? { puntos: offA.t.map(x => x.points) } : { online: sa.slice(0, 200), offline: sheet(offA).slice(0, 200) });
  check(tag + 'hoja del invitado: tally confirmado (girado) = offline girado', sb === sheet(offB), sb === sheet(offB) ? { puntos: offB.t.map(x => x.points) } : { online: sb.slice(0, 200), offline: sheet(offB).slice(0, 200) });
  const ta = A.tally.stats().t, tb = B.tally.stats().t;
  check(tag + 'el invitado ve sus puntos en su lado (t[0] del invitado = t[1] del anfitrión)', JSON.stringify(ta[0]) === JSON.stringify(tb[1]) && JSON.stringify(ta[1]) === JSON.stringify(tb[0]) && ta[0].points + ta[1].points > 0);
  const gc = R.sess[0].gc;
  const tot = [0, 1].map(t => (gc.setScores || []).reduce((a, s) => a + (s[t] | 0), 0));
  check(tag + 'puntos de la hoja = puntos de los sets de la partida confirmada', ta[0].points === tot[0] && ta[1].points === tot[1], { hoja: ta.map(x => x.points), sets: gc.setScores, score: gc.score });
}

// (5) (auditoría) corte de 25 s con «Seguir contra la IA» (lo pulsa el anfitrión o el invitado): la hoja de los dos lados suma los puntos
//     del marcador final (antes al invitado le faltaban los que jugó el anfitrión contra la IA, o le sobraban los suyos contra la IA)
for (const ai of [0, 1]) {
  const cfg = { rtt: 80, jit: 10, loss: 2, secs: 600, seed: 45 + ai, venue: 'hall', points: 11, cut: { at: 30000, ms: 25000, ai } };
  const tag = 'corte de 25 s, la IA la pide el ' + (ai ? 'invitado' : 'anfitrión') + ': ';
  console.log('== ' + tag + '==');
  const R = run(cfg);
  check(tag + 'sin excepciones', !R.err, R.err ? String(R.err.stack).split('\n').slice(0, 4).join(' | ') : undefined);
  if (R.err) continue;
  const gc = R.sess[0].gc, tot = [0, 1].map(t => (gc.setScores || []).reduce((a, x) => a + (x[t] | 0), 0));
  const ta = R.side[0].tally.stats().t, tb = R.side[1].tally.stats().t;
  check(tag + 'partido acabado, con vuelta, y la hoja de los dos = marcador final', R.overAt > 0 && R.sess[1].stats.rsIn >= 1 && ta[0].points === tot[0] && ta[1].points === tot[1] && tb[1].points === tot[0] && tb[0].points === tot[1],
    { sets: gc.setScores, anf: ta.map(x => x.points), inv: tb.map(x => x.points), rsIn: R.sess[1].stats.rsIn });
}

// (1b) el modo offline no cambia: un partido offline graba como siempre (sin dual) y repite sin desincronizarse
{
  console.log('== modo offline intacto ==');
  const VB = load(), S = VB.Sim, RPL = VB.Replay;
  const g = S.createGame({ seed: 7, venue: 'beach', points: 7, bestOf: 1, autopilot: true, stats: true });
  const on = RPL.reset(g, { force: true, headless: true });
  for (let i = 0; i < 120 * 400 && !g.finished; i++) { S.step(g, 1 / 120, null); RPL.onStep(null, g); const ev = []; S.drainEvents(g, ev); if (ev.length) RPL.onEvents(g, ev); }
  const st = RPL._state();
  check('offline: graba sin dual y vista sin girar', on && st.dual === false && st.vs === 0 && RPL.bestCount() >= 1, { dual: st.dual, jugadas: RPL.bestCount() });
  let done = false; RPL.playBest(undefined, () => { done = true; });
  for (let f = 0; f < 60 * 120 && RPL.active(); f++) { RPL.tick(1 / 60, [], []); if (RPL.active() && RPL.runner() && RPL.runner() !== RPL._R()) { done = false; break; } }
  check('offline: mejores jugadas repetidas, desync 0, runner = la sombra', done && RPL.desync() === 0, { desync: RPL.desync() });
}

console.log((fails ? 'FALLOS: ' + fails : 'TODO OK') + ' (' + oks + ' ok, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' + (warns.length ? ' avisos: ' + warns.slice(0, 3).join(' | ') : ''));
process.exit(fails ? 1 : 0);
