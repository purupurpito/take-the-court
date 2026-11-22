#!/usr/bin/env node
/* TAKE THE COURT — tools/mptest.js  (owner: net)
 * Fase 0 del online (notes/net.md): la simulación con DOS huecos humanos (uno por equipo, createGame({online: true})), sin red.
 *   (a) 20 partidos bot contra bot (un bot de solo entrada en cada hueco, semillas y sedes distintas): los dos equipos dan toques
 *       humanos calificados, sacan como humanos (sin el ritual de la CPU), la IA lleva a los compañeros y la CPU no pide challenge.
 *   (b) simetría: misma semilla con los bots cambiados de equipo (fuerte/flojo) y con bots iguales; las estadísticas por hueco quedan
 *       en la misma banda (±5 %).
 *   (c) bits de partido: chal de cada equipo gasta SU challenge; skip solo salta la pausa con los dos (también los 10 s entre sets);
 *       tmo (solo con timeouts: true; por defecto no hay) entra en balón muerto sin quitar el challenge a nadie, no se puede pedir
 *       entre sets ni pasa al set siguiente, y se reanuda; ai pasa el hueco a la IA y lo devuelve en el siguiente balón muerto;
 *       el texto del punto lleva text1 (visto desde el invitado).
 *   (d') serialize da la misma foto aunque la interfaz haya llamado a useSlot entre pasos.
 *   (d) serialize → JSON → deserialize → 2 000 pasos idénticos bit a bit a la original (también con -0 y NaN), en saque, peloteo,
 *       punto, revisión y tiempo muerto; copyGame entre partidas online también.
 *   (e) atributos por hueco (los de cada jugador), «Igualado» sin atributos ni insignias, opciones del partido (1 set / mejor de 3).
 *   (f) online de varios (sprint online-multi, P1: plazas g.hum[s] desacopladas del equipo, bloque MULTI de sim.js):
 *       4 plazas en 2v2 (2 por equipo), coop (2 humanos del mismo equipo contra la IA, teamLv), 12 plazas en 6v6 (y 3 plazas con la IA
 *       en el resto), cada toque humano es del jugador de SU plaza, la IA toma una plaza y la devuelve, skip por plaza / chal y tmo por
 *       equipo, foto y copyGame bit a bit con N plazas, matriz completa de atributos, el banquillo nunca cambia a un humano, y el 1
 *       contra 1 sigue sin g.mh.
 * Uso: node tools/mptest.js            (sale con código 1 si algo falla)
 * La huella 2v2 de siempre la protegen tools/simtest.js / tools/fingerprint6.js (el online va por un camino aparte de step).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
function load() {
  const ctx = { console, Math, Date };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.VB;
}
const VB = load(), S = VB.Sim, C = VB.C, DT = 1 / C.SIM_HZ;
let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
}
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* Bot de solo entrada para el hueco `team` (azar propio, nunca g.rng). Lee el estado con el hueco activo (S.useSlot) y lo deja en el 0.
 * Perfil: sigma = error de timing (s), posErr = error de lectura (m), aim = prob. de apuntar, block = sube a bloquear. */
const PROF = {
  bueno: { sigma: 0.04, posErr: 0.35, react: 0.18, aim: 0.6, block: true, jumpServe: 0.5 },
  flojo: { sigma: 0.11, posErr: 1.1, react: 0.32, aim: 0.15, block: false, jumpServe: 0.05 }
};
/* seat: plaza que lleva el bot (online de varios); sin ella, la del equipo (el 1 contra 1, plaza = equipo). */
function mkBot(team, seed, prof, seat) {
  const r = mulberry(seed * 7919 + 13 + team * 104729 + (seat === undefined ? 0 : (seat + 1) * 7)), sd = S.side(team), w = {};
  if (seat === undefined) seat = team;
  const gauss = () => (r() + r() + r() + r() - 2) * 1.732;
  let stamp = -9, lead = 0, jlead = 0, ex = 0, ey = 0, presses = 0, serveWait = 0, react = 0, aimv = [0, 0], useAim = false, blockT = -1, blockSeen = -9;
  return function (g) {
    const inp = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false };
    S.useSlot(g, seat);
    try {
      const p = g.ctrl, b = g.ball;
      if (g.mode === 'serve') {
        if (g.server !== p) return inp;
        if (g.serveState === 'ready') {
          if (g.serveT < 0.02) serveWait = 0.8 + r() * 1.5;
          if (g.serveAuth && g.serveT > serveWait) { if (r() < prof.jumpServe) inp.jump = true; else inp.hit = true; }
          return inp;
        }
        if (stamp !== g.lastTouchT) { stamp = g.lastTouchT; lead = C.WINDUP + gauss() * prof.sigma; presses = 0; }
        S.hitWindow(g, p, w);
        if (presses < 2 && !g.swingLive && w.t <= lead && b.vz <= 0.5) { inp.hit = true; presses++; }
        return inp;
      }
      if (g.mode !== 'rally') return inp;
      if (stamp !== g.lastTouchT) {
        stamp = g.lastTouchT; presses = 0; lead = C.WINDUP + gauss() * prof.sigma; jlead = gauss() * prof.sigma * 0.9;
        ex = gauss() * prof.posErr; ey = gauss() * prof.posErr; react = prof.react * (0.7 + 0.6 * r());
        const a = r() * 6.283; aimv = [Math.cos(a), Math.sin(a)]; useAim = r() < prof.aim;
      }
      const since = g.time - g.lastTouchT, job = g.jobs[team] === p;
      const attack = job && g.touchTeam === team && g.touches === 2 && Math.abs(g.pr3.x) < 3.8 && g.pr3.z > 2.5;
      let tx, ty;
      if (job) {
        const pr = attack ? g.pr3 : g.pr1, k = Math.min(1, Math.max(0, pr.t) / 1.1) * 0.5;
        tx = pr.x + sd * (attack ? 0.35 : 0.15) + ex * k; ty = pr.y + ey * k;
      } else if (prof.block && g.touchTeam === 1 - team && g.touches >= 1 && g.pr3.x * sd < 0 && g.defRole !== 'dig') {
        tx = sd * 0.6; ty = g.pr3.y;
      } else if (g.rot) { const sp = VB.AI6.spot(g, p); tx = sp.x; ty = sp.y; } // 6v6: a su sitio de la formación
      else { tx = sd * 5.5; ty = -S.other(g, p).y * 0.5; }
      if (since >= react && p.z === 0) {
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        if (d > 0.1) { const f = Math.min(1, d / 0.3); inp.move = [dx / d * f, dy / d * f]; }
      }
      if (job && since >= react * 0.6) {
        S.hitWindow(g, p, w);
        if (attack && p.z === 0 && w.attack && w.jumpT <= jlead && Math.hypot(g.pr3.x + sd * 0.35 - p.x, g.pr3.y - p.y) < 1.3) inp.jump = true;
        const near = Math.hypot(b.x - p.x, b.y - p.y) < 2.6;
        if (near && !(attack && p.z === 0 && w.jumpT > -0.2) && presses < 2 && !g.swingLive && w.t <= lead) {
          inp.hit = true; presses++; if (useAim) inp.move = aimv;
        }
      }
      if (g.swingLive && p.z > 0 && useAim) inp.move = aimv;
      if (prof.block && !job && p.z === 0 && Math.abs(p.x) < 1.2 && g.touchTeam === 1 - team && g.touches === 2) {
        const att = g.teams[1 - team].some(q => q.z > 0.35 && q.vz < 1.5 && Math.abs(q.x) < 4);
        if (att && blockSeen !== stamp) { blockSeen = stamp; blockT = g.time + Math.max(0, 0.06 + gauss() * prof.sigma); }
        if (att && g.time >= blockT) inp.jump = true;
      }
      return inp;
    } finally { S.useSlot(g, 0); }
  };
}

/** Huella canónica EXACTA de todo el estado (claves ordenadas, bits de cada double: distingue -0 de 0 y cada NaN igual). Jugadores
 *  por id cuando se llega a ellos por referencia. Sin events/opts/replay; el rng por su estado. */
const _f64 = new Float64Array(1), _u32 = new Uint32Array(_f64.buffer);
function deepHash(g) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { h = Math.imul(h ^ (v >>> 0), 16777619) >>> 0; };
  const str = (s) => { for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i)); mix(0xff); };
  const players = new Set(); for (const p of g.players) players.add(p);
  const SK = { events: 1, opts: 1, replay: 1, rng: 1 };
  const path = new Set();
  function walk(v, top) {
    if (typeof v === 'number') { _f64[0] = v; mix(1); mix(_u32[0]); mix(_u32[1]); return; }
    if (typeof v === 'string') { mix(2); str(v); return; }
    if (typeof v === 'boolean') { mix(v ? 3 : 4); return; }
    if (v === undefined) { mix(5); return; }
    if (v === null) { mix(6); return; }
    if (typeof v === 'function') { mix(7); return; }
    if (!top && players.has(v)) { mix(8); mix(v.id); return; }
    if (path.has(v)) { mix(9); return; }
    path.add(v);
    if (Array.isArray(v)) { mix(10); mix(v.length); for (const x of v) walk(x, false); }
    else { mix(11); for (const k of Object.keys(v).sort()) { if (top === 'g' && SK[k]) continue; str(k); walk(v[k], false); } }
    path.delete(v);
  }
  walk(g, 'g');
  for (const p of g.players) walk(p, true);
  mix(g.rng.get());
  return h >>> 0;
}

/** Juega un partido online con dos bots; devuelve resumen por equipo. hook(g, i, ins) puede tocar las entradas. */
function play(opts, bots, maxSec, hook) {
  const g = S.createGame(opts), ev = [];
  const T = [0, 1].map(() => ({ hHits: 0, grades: { perfect: 0, good: 0, poor: 0 }, hToss: 0, cpuToss: 0, points: 0, aces: 0, kills: 0, mateHits: 0, humanBad: 0 }));
  let ritualHuman = 0, cpuChalSet = 0, chalEv = 0, steps = Math.round((maxSec || 900) / DT), over = false, err = null;
  for (let i = 0; i < steps; i++) {
    const ins = [bots[0](g), bots[1](g)];
    if (hook) hook(g, i, ins);
    try { S.step(g, DT, ins); } catch (e) { err = e; break; }
    if (g.cpuChal) cpuChalSet++;
    if (g.mode === 'serve' && g.server && S.isHuman(g, g.server) && (g.ritual.on || g.cpuTossIn >= 0)) ritualHuman++;
    ev.length = 0; S.drainEvents(g, ev);
    for (const e of ev) {
      if (e.type === 'hit') {
        const t = T[e.team];
        if (e.human) { t.hHits++; t.grades[e.grade]++; if (S.humSlot(g, e.player) !== e.team) t.humanBad++; }
        else if (e.player === g.hum[e.team].p && !g.hum[e.team].ai) t.humanBad++;
        else t.mateHits++;
      }
      if (e.type === 'toss') { if (e.human) T[e.team].hToss++; else T[e.team].cpuToss++; }
      if (e.type === 'point') { T[e.team].points++; if (e.how === 'ace') T[e.team].aces++; if (e.how === 'kill') T[e.team].kills++; }
      if (e.type === 'challenge') chalEv++;
      if (e.type === 'gameOver') over = true;
    }
    if (over) break;
  }
  return { g, T, over, err, ritualHuman, cpuChalSet, chalEv };
}

const t0 = Date.now();
console.log('== (a) 20 partidos bot contra bot, un bot en cada hueco ==');
{
  let finished = 0, errs = [], bad = [], tot = [0, 0].map(() => ({ hHits: 0, perfect: 0, good: 0, poor: 0, hToss: 0, cpuToss: 0, points: 0, mateHits: 0 }));
  let ritualHuman = 0, cpuChal = 0, chalEv = 0, humanBad = 0;
  for (let s = 1; s <= 20; s++) {
    const opts = { online: true, seed: 1000 + s, stats: true, venue: s % 2 ? 'beach' : 'hall', humans: [{}, {}], present: true };
    const R = play(opts, [mkBot(0, s, PROF.bueno), mkBot(1, s, PROF.bueno)], 1200);
    if (R.err) errs.push(s + ': ' + (R.err.stack || R.err).toString().split('\n').slice(0, 3).join(' | '));
    if (R.over) finished++;
    ritualHuman += R.ritualHuman; cpuChal += R.cpuChalSet; chalEv += R.chalEv;
    for (let t = 0; t < 2; t++) {
      const a = tot[t], b = R.T[t];
      a.hHits += b.hHits; a.perfect += b.grades.perfect; a.good += b.grades.good; a.poor += b.grades.poor; a.hToss += b.hToss; a.cpuToss += b.cpuToss;
      a.points += b.points; a.mateHits += b.mateHits; humanBad += b.humanBad;
      if (b.hHits < 5 || b.hToss < 1) bad.push(s + ':' + t);
    }
  }
  check('sin excepciones', errs.length === 0, errs.slice(0, 2));
  check('los 20 partidos terminan (gameOver, 1 set a 21)', finished === 20, finished);
  check('los dos equipos dan toques humanos calificados en todos los partidos', bad.length === 0, { porEquipo: tot.map(t => [t.hHits, t.perfect, t.good, t.poor]), sinToques: bad });
  check('los dos equipos sacan como humanos (toss human) y su compañero IA también saca y juega', tot.every(t => t.hToss > 20 && t.cpuToss > 20 && t.mateHits > 100), tot.map(t => [t.hToss, t.cpuToss, t.mateHits]));
  check('sin ritual de la CPU con un sacador humano (también en el equipo 1)', ritualHuman === 0, ritualHuman);
  check('la CPU no pide challenge (cpuChallengeDecide sin efecto con dos humanos) y nadie lo pide sin el bit', cpuChal === 0 && chalEv === 0, [cpuChal, chalEv]);
  check('cada toque humano es del jugador de su hueco', humanBad === 0, humanBad);
}

console.log('\n== (b) simetría ==');
{
  // misma semilla, bot fuerte en el equipo 0 y luego en el 1: su cuota de puntos y sus notas en la misma banda (±5 %)
  const share = [0, 0], perf = [0, 0], pts = [0, 0];
  const same = { pts: [0, 0], perf: [0, 0], hits: [0, 0] };
  for (let s = 1; s <= 12; s++) {
    for (let k = 0; k < 2; k++) {
      const venue = s % 2 ? 'beach' : 'hall', opts = { online: true, seed: 2000 + s, venue, humans: [{}, {}], bestOf: 3 };
      const bots = k === 0 ? [mkBot(0, s, PROF.bueno), mkBot(1, s, PROF.flojo)] : [mkBot(0, s, PROF.flojo), mkBot(1, s, PROF.bueno)];
      const R = play(opts, bots, 1500), strong = k === 0 ? 0 : 1, T = R.T[strong];
      share[k] += T.points; pts[k] += R.T[0].points + R.T[1].points;
      perf[k] += T.grades.perfect / Math.max(1, T.hHits);
    }
    const R2 = play({ online: true, seed: 3000 + s, venue: s % 2 ? 'hall' : 'beach', humans: [{}, {}], bestOf: 3 }, [mkBot(0, s + 50, PROF.bueno), mkBot(1, s + 50, PROF.bueno)], 1500);
    for (let t = 0; t < 2; t++) { same.pts[t] += R2.T[t].points; same.perf[t] += R2.T[t].grades.perfect; same.hits[t] += R2.T[t].hHits; }
  }
  const sh = [share[0] / pts[0], share[1] / pts[1]], pf = [perf[0] / 12, perf[1] / 12];
  check('bot fuerte: cuota de puntos igual en el equipo 0 y en el 1 (±5 %)', Math.abs(sh[0] - sh[1]) <= 0.05, { equipo0: +sh[0].toFixed(3), equipo1: +sh[1].toFixed(3), puntos: pts });
  check('bot fuerte: % de perfectos igual en los dos equipos (±5 %)', Math.abs(pf[0] - pf[1]) <= 0.05, pf.map(v => +v.toFixed(3)));
  const ss = same.pts[0] / (same.pts[0] + same.pts[1]), sp = same.perf.map((v, t) => v / Math.max(1, same.hits[t]));
  check('bots iguales: el equipo 0 gana el 50 % ±5 % de los puntos', Math.abs(ss - 0.5) <= 0.05, { cuota0: +ss.toFixed(3), puntos: same.pts });
  check('bots iguales: % de perfectos por hueco ±5 %', Math.abs(sp[0] - sp[1]) <= 0.05, sp.map(v => +v.toFixed(3)));
}

console.log('\n== (c) bits de partido ==');
{
  // --- chal: buscar un punto con llamada recurrible por cada equipo y pedirlo con el bit de ESE equipo
  for (const team of [0, 1]) {
    let done = null, info = null;
    for (let s = 1; s <= 40 && !done; s++) {
      const g = S.createGame({ online: true, seed: 4000 + s, humans: [{}, {}], venue: 'hall' });
      const b0 = mkBot(0, s, PROF.bueno), b1 = mkBot(1, s, PROF.bueno), ev = [];
      for (let i = 0; i < 120 * 400 && !done; i++) {
        const ins = [b0(g), b1(g)];
        const can = g.mode === 'point' && g.call && !g.call.used && g.call.team === team && S.canChallenge(g, team) > 0;
        if (can) {
          const before = [g.challenges[0], g.challenges[1]];
          ins[1 - team].chal = true;                    // el otro equipo no puede: no pasa nada
          S.step(g, DT, ins); ev.length = 0; S.drainEvents(g, ev);
          const wrongNo = !ev.some(e => e.type === 'challenge') && !g.review;
          const ins2 = [b0(g), b1(g)]; ins2[team].chal = true;
          S.step(g, DT, ins2); ev.length = 0; S.drainEvents(g, ev);
          const chE = ev.find(e => e.type === 'challenge');
          let res = null;
          for (let k = 0; k < 120 * 8 && !res; k++) { S.step(g, DT, [b0(g), b1(g)]); ev.length = 0; S.drainEvents(g, ev); res = ev.find(e => e.type === 'challengeResult'); }
          const after = [g.challenges[0], g.challenges[1]];
          const spentOk = res && (res.overturned ? after[team] === before[team] || res.left[team] === before[team] : res.left[team] === before[team] - 1) && res.left[1 - team] === before[1 - team];
          done = wrongNo && chE && chE.team === team && res && res.team === team && spentOk;
          info = { wrongNo, ch: chE && chE.team, res: res && [res.team, res.overturned, res.left], before };
          break;
        }
        S.step(g, DT, ins); ev.length = 0; S.drainEvents(g, ev);
        if (g.finished) break;
      }
    }
    check('chal del equipo ' + team + ': solo vale el de su equipo y gasta su challenge (el del otro intacto)', !!done, info);
  }
  // --- skip: la pausa del punto solo se salta con los dos; 10 s entre sets
  {
    const g = S.createGame({ online: true, seed: 4100, humans: [{}, {}], present: true });
    const b0 = mkBot(0, 1, PROF.bueno), b1 = mkBot(1, 1, PROF.bueno);
    let i = 0; while (g.mode !== 'point' && i++ < 120 * 120) S.step(g, DT, [b0(g), b1(g)]);
    const hold = g.hold;
    for (let k = 0; k < 120; k++) S.step(g, DT, [{ skip: true }, {}]);          // 1 s: solo el anfitrión
    const left1 = g.timer, only0 = Math.abs(left1 - (hold - 1)) < 1e-6;
    S.step(g, DT, [{}, { skip: true }]);                                           // ahora el invitado
    const both = g.mode === 'point' && g.timer <= VB.HOLD.skipTo + 1e-9;
    check('skip: con uno solo la pausa corre entera; con los dos se salta', only0 && both, { hold, trasUno: +left1.toFixed(3), trasDos: +g.timer.toFixed(3) });
    // 10 s entre sets (mejor de 3) y se saltan con los dos
    const g2 = S.createGame({ online: true, seed: 4101, humans: [{}, {}], bestOf: 3, points: 11, venue: 'hall' });
    const c0 = mkBot(0, 2, PROF.bueno), c1 = mkBot(1, 2, PROF.bueno), ev = [];
    let setEv = null; i = 0;
    while (!setEv && i++ < 120 * 900) { S.step(g2, DT, [c0(g2), c1(g2)]); ev.length = 0; S.drainEvents(g2, ev); setEv = ev.find(e => e.type === 'point' && e.setWon && !e.matchWon); }
    const hold2 = g2.hold;
    for (let k = 0; k < 120 * 2; k++) S.step(g2, DT, [{ skip: true }, {}]);
    const still = g2.mode === 'point' && g2.timer > 7.9;
    S.step(g2, DT, [{}, { skip: true }]);
    check('entre sets: pausa de 10 s; con uno sigue, con los dos «Continuar» se salta', !!setEv && hold2 === 10 && still && g2.timer <= VB.HOLD.skipTo + 1e-9, { hold2, still, timer: +g2.timer.toFixed(3) });
  }
  // --- tmo: se pide en el peloteo, entra en el siguiente balón muerto, nada se mueve y se reanuda a partir de 10 s
  {
    const g = S.createGame({ online: true, seed: 4200, humans: [{}, {}], timeouts: true });
    const b0 = mkBot(0, 3, PROF.bueno), b1 = mkBot(1, 3, PROF.bueno), ev = [], seen = [];
    let i = 0; while (g.mode !== 'rally' && i++ < 120 * 60) S.step(g, DT, [b0(g), b1(g)]);
    const ins = [b0(g), b1(g)]; ins[1].tmo = true; S.step(g, DT, ins); ev.length = 0; S.drainEvents(g, ev);
    const req = ev.some(e => e.type === 'timeoutReq' && e.team === 1) && !g.tmo && (g.mode === 'rally' || g.mode === 'point');
    let start = null; i = 0;
    while (!start && i++ < 120 * 60) { S.step(g, DT, [b0(g), b1(g)]); ev.length = 0; S.drainEvents(g, ev); start = ev.find(e => e.type === 'timeout'); }
    const deadBall = start && (g.mode === 'point' || g.mode === 'serve');
    const sc = g.score.join('-'), tm0 = g.time; let moved = false;
    for (let k = 0; k < 120 * 5; k++) { const pos = g.players.map(p => p.x + ',' + p.y).join(); S.step(g, DT, [{ move: [1, 0], hit: true }, { move: [-1, 0], hit: true }]); if (g.players.map(p => p.x + ',' + p.y).join() !== pos && g.mode !== 'point') moved = true; }
    for (let k = 0; k < 120; k++) S.step(g, DT, [{ skip: true }, {}]);   // a los 6 s: todavía no se puede reanudar (queda apuntado: reanuda justo a los 10 s)
    const stillOn = !!g.tmo;
    let end = null; i = 0;
    while (!end && i++ < 120 * 30) { S.step(g, DT, [{ skip: i > 120 * 5 }, {}]); ev.length = 0; S.drainEvents(g, ev); end = ev.find(e => e.type === 'timeoutEnd'); }
    const dur = g.time - tm0;
    const ins3 = [b0(g), b1(g)]; ins3[1].tmo = true; S.step(g, DT, ins3); ev.length = 0; S.drainEvents(g, ev);
    const noMore = !ev.some(e => e.type === 'timeoutReq') && g.tmoLeft[1] === 0 && g.tmoLeft[0] === 1;
    check('tmo: pedido en juego, entra en balón muerto, nadie se mueve, no se reanuda antes de 10 s, sí después con skip; 1 por set', req && deadBall && !moved && stillOn && !!end && dur >= 10 - 1e-6 && dur < 12.5 && noMore && g.score.join('-') === sc,
      { req, deadBall: !!deadBall, moved, stillOn, end: !!end, dur: +dur.toFixed(2), noMore });
  }
  // --- tmo desactivado por defecto (decisión 5: sin pausas durante el juego)
  {
    const g = S.createGame({ online: true, seed: 4210, humans: [{}, {}] }), ev = [];
    const b0 = mkBot(0, 3, PROF.bueno), b1 = mkBot(1, 3, PROF.bueno);
    let req = 0, tmo = 0;
    for (let k = 0; k < 120 * 60; k++) { const ins = [b0(g), b1(g)]; ins[k & 1].tmo = k % 50 === 3; S.step(g, DT, ins); ev.length = 0; S.drainEvents(g, ev); for (const e of ev) { if (e.type === 'timeoutReq') req++; if (e.type === 'timeout') tmo++; } }
    check('tmo: sin timeouts: true no hay tiempos muertos (tmoLeft 0, el bit no hace nada)', req === 0 && tmo === 0 && g.tmoLeft[0] === 0 && g.tmoLeft[1] === 0 && !g.tmo, { req, tmo, tmoLeft: g.tmoLeft.slice() });
  }
  // --- tmo pendiente: no le quita el challenge al rival (el tiempo muerto espera a que se cierre la ventana)
  {
    let res = null;
    for (let s = 1; s <= 40 && !res; s++) {
      const g = S.createGame({ online: true, seed: 4220 + s, humans: [{}, {}], timeouts: true });
      const b0 = mkBot(0, s, PROF.bueno), b1 = mkBot(1, s, PROF.bueno);
      let c = -1;
      for (let k = 0; k < 120 * 300 && !g.finished; k++) {
        const before = g.mode; S.step(g, DT, [b0(g), b1(g)]); S.drainEvents(g, []);
        if (before === 'rally' && g.mode === 'point' && g.call && !g.call.used && S.canChallenge(g, g.call.team) > 0) { c = g.call.team; break; }
      }
      if (c < 0) continue;
      g.tmoReq[1 - c] = true; // lo que deja «tmo» pulsado por el rival durante el peloteo
      let got = false, tmoBefore = false;
      for (let k = 0; k < 120 * 3; k++) { const ins = [{}, {}]; ins[c].chal = k === 120 * 2; S.step(g, DT, ins); S.drainEvents(g, []); if (g.tmo) tmoBefore = true; if (g.review) { got = true; break; } }
      let started = false;
      for (let k = 0; k < 120 * 20 && !started; k++) { S.step(g, DT, [{}, {}]); S.drainEvents(g, []); if (g.tmo) started = true; }
      res = { got, tmoBefore, started };
    }
    check('tmo pendiente: el challenge del otro entra (a los 2 s) y el tiempo muerto empieza después', !!res && res.got && !res.tmoBefore && res.started, res);
  }
  // --- tmo en la pausa entre sets: no se puede pedir (la pausa sigue siendo de 10 s) y uno pedido en el último peloteo se anula
  {
    const g = S.createGame({ online: true, seed: 4230, humans: [{}, {}], bestOf: 3, points: 11, venue: 'hall', timeouts: true });
    const c0 = mkBot(0, 2, PROF.bueno), c1 = mkBot(1, 2, PROF.bueno), ev = [];
    let setEv = null, i = 0, cancel = false, lastRallyReq = false;
    while (!setEv && i++ < 120 * 900) {
      const ins = [c0(g), c1(g)];
      if (g.mode === 'rally' && (g.score[0] >= 10 || g.score[1] >= 10) && !lastRallyReq) { ins[0].tmo = true; lastRallyReq = true; }
      if (g.mode !== 'rally') lastRallyReq = g.tmoReq[0]; // vuelve a pedirlo cada peloteo de punto de set hasta que acabe el set
      S.step(g, DT, ins); ev.length = 0; S.drainEvents(g, ev); setEv = ev.find(e => e.type === 'point' && e.setWon && !e.matchWon);
    }
    const tA = g.time; let req = false, serveAt = -1, tmoLeft1 = null;
    for (let k = 0; k < 120 * 60 && serveAt < 0; k++) {
      S.step(g, DT, [{ tmo: true }, { tmo: true }]); ev.length = 0; S.drainEvents(g, ev);
      for (const e of ev) { if (e.type === 'timeoutReq') req = true; if (e.type === 'timeoutCancel') cancel = true; if (e.type === 'timeout') req = true; }
      if (g.mode === 'serve') { serveAt = g.time - tA; tmoLeft1 = g.tmoLeft.slice(); }
    }
    check('tmo entre sets: no se puede pedir, la pausa dura 10 s y el set 2 empieza con su tiempo muerto entero', !!setEv && !req && serveAt > 0 && serveAt < 10.1 && g.setNo === 2 && tmoLeft1[0] === 1 && tmoLeft1[1] === 1,
      { req, cancel, pausa: +serveAt.toFixed(2), setNo: g.setNo, tmoLeft1 });
  }
  // --- texto del punto: text1 es el del invitado (equipo 1)
  {
    const g = S.createGame({ online: true, seed: 4240, humans: [{}, {}] }), ev = [];
    const b0 = mkBot(0, 5, PROF.bueno), b1 = mkBot(1, 5, PROF.bueno);
    let n = 0, okT = true, mine = 0;
    for (let k = 0; k < 120 * 400 && !g.finished; k++) {
      S.step(g, DT, [b0(g), b1(g)]); ev.length = 0; S.drainEvents(g, ev);
      for (const e of ev) if (e.type === 'point') {
        n++;
        if (typeof e.text1 !== 'string') okT = false;
        if (e.text === 'El balón cae en tu campo') { mine++; if (e.text1 !== 'El balón cae en el campo rival' || e.team !== 1) okT = false; }
        else if (e.text === 'El balón cae en el campo rival') { if (e.text1 !== 'El balón cae en tu campo' || e.team !== 0) okT = false; }
        else if (e.text1 !== e.text) okT = false;
      }
    }
    const off = S.createGame({ seed: 1 }); let offT = false;
    for (let k = 0; k < 120 * 60; k++) { S.step(off, DT, {}); for (const e of S.drainEvents(off, [])) if (e.type === 'point' && 'text1' in e) offT = true; }
    check('texto del punto: text1 = visto desde el invitado («tu campo» ↔ «campo rival»), fuera del online no existe', n > 0 && okT && mine > 0 && !offT, { n, mine, okT, offT });
  }
  // --- ai: el hueco 1 pasa a la IA (saca y juega su jugador sin entrada), vuelve al humano en el siguiente balón muerto
  {
    const g = S.createGame({ online: true, seed: 4300, humans: [{}, {}], venue: 'beach' });
    const b0 = mkBot(0, 4, PROF.bueno), b1 = mkBot(1, 4, PROF.bueno), ev = [], p1 = g.hum[1].p;
    let i = 0; while (g.mode !== 'rally' && i++ < 120 * 60) S.step(g, DT, [b0(g), b1(g)]);
    S.step(g, DT, [b0(g), { ai: true }]); ev.length = 0; S.drainEvents(g, ev);
    const onNow = g.hum[1].ai && !S.isHuman(g, p1) && ev.some(e => e.type === 'slotAI' && e.team === 1 && e.on);
    let aiHits = 0, aiToss = 0, hHits1 = 0, pts = 0;
    for (let k = 0; k < 120 * 200; k++) {
      S.step(g, DT, [b0(g), { ai: true, move: [1, 1], hit: k % 7 === 0 }]); ev.length = 0; S.drainEvents(g, ev);
      for (const e of ev) { if (e.type === 'hit' && e.player === p1) { if (e.human) hHits1++; else aiHits++; } if (e.type === 'toss' && e.player === p1 && !e.human) aiToss++; if (e.type === 'point') pts++; }
      if (g.finished) break;
    }
    // vuelve: se suelta el bit en pleno peloteo y solo vuelve en el balón muerto
    i = 0; while (g.mode !== 'rally' && i++ < 120 * 60) S.step(g, DT, [b0(g), { ai: true }]);
    S.step(g, DT, [b0(g), b1(g)]);
    const stillAI = g.hum[1].ai;
    let back = null; i = 0;
    while (!back && i++ < 120 * 60) { S.step(g, DT, [b0(g), b1(g)]); ev.length = 0; S.drainEvents(g, ev); back = ev.find(e => e.type === 'slotAI' && !e.on); }
    check('ai: el hueco pasa a la IA al momento (juega y saca sola, la entrada no cuenta) y vuelve en el balón muerto', onNow && aiHits > 10 && aiToss >= 1 && hHits1 === 0 && stillAI && !!back && (g.mode === 'point' || g.mode === 'over') && S.isHuman(g, p1),
      { onNow, aiHits, aiToss, hHits1, stillAI, back: !!back, mode: g.mode });
  }
}

console.log('\n== (d) serialize / deserialize bit a bit ==');
{
  const cases = [];
  const want = [['saque', g => g.mode === 'serve' && g.serveT > 0.3], ['peloteo', g => g.mode === 'rally' && g.rally.hits >= 2], ['punto', g => g.mode === 'point'],
    ['revisión', g => !!g.review], ['tiempo muerto', g => !!g.tmo]];
  for (const venue of ['hall', 'beach']) {
    for (const [name, pred] of want) {
      let found = false;
      for (let s = 1; s <= 30 && !found; s++) {
        const opts = { online: true, seed: 5000 + s, venue, humans: [{ attrs: { jump: 70, speed: 40, spike: 80 } }, {}], stats: true, bestOf: 3, timeouts: true };
        const g = S.createGame(opts), b0 = mkBot(0, s, PROF.bueno), b1 = mkBot(1, s, PROF.bueno);
        for (let i = 0; i < 120 * 300; i++) {
          const ins = [b0(g), b1(g)];
          if (name === 'revisión' && g.mode === 'point' && g.call && !g.call.used && S.canChallenge(g, g.call.team) > 0) ins[g.call.team].chal = true;
          if (name === 'tiempo muerto' && g.mode === 'rally' && g.tmoLeft[0] > 0) ins[0].tmo = true;
          S.step(g, DT, ins); g.events.length = 0;
          if (g.finished) break;
          if (i > 120 * 5 && pred(g)) {
            // -0 en un campo de estado (lo lee la UI, no la física) para comprobar que viaja con su signo
            g.hum[1].aimIn[0] = -0;
            const js = JSON.stringify(S.serialize(g));
            const g2 = S.createGame(opts);
            const okD = S.deserialize(JSON.parse(js), g2) === g2;
            const h0 = deepHash(g) === deepHash(g2), neg = Object.is(g2.hum[1].aimIn[0], -0), nan = Number.isNaN(g.setDirA) === Number.isNaN(g2.setDirA);
            const g3 = S.createGame(opts); S.copyGame(g3, g); g3.stats = JSON.parse(JSON.stringify(g.stats));
            let same = true, at = -1;
            for (let k = 0; k < 2000; k++) {
              const ins2 = [b0(g), b1(g)];
              if (k % 400 === 13) ins2[k % 800 === 13 ? 0 : 1].tmo = true;
              if (k % 300 === 77) ins2[0].skip = ins2[1].skip = true;
              S.step(g, DT, ins2); S.step(g2, DT, ins2); S.step(g3, DT, ins2);
              const e1 = S.drainEvents(g, []).length, e2 = S.drainEvents(g2, []).length; S.drainEvents(g3, []);
              if (e1 !== e2 || (k % 50 === 49 && (deepHash(g) !== deepHash(g2) || deepHash(g) !== deepHash(g3)))) { same = false; at = k; break; }
            }
            const endSame = same && deepHash(g) === deepHash(g2) && JSON.stringify(g.stats) === JSON.stringify(g2.stats) && JSON.stringify(S.serialize(g)) === JSON.stringify(S.serialize(g2));
            cases.push({ venue, name, okD, h0, neg, nan, same: endSame, at, kb: +(js.length / 1024).toFixed(1) });
            found = true; break;
          }
        }
      }
      if (!found) cases.push({ venue, name, missing: true });
    }
  }
  const bad = cases.filter(c => c.missing || !c.okD || !c.h0 || !c.neg || !c.nan || !c.same);
  check('foto → JSON → partida nueva: idéntica al instante y 2 000 pasos después (saque, peloteo, punto, revisión, tiempo muerto; pabellón y playa)', bad.length === 0, bad.length ? bad : cases.map(c => c.venue[0] + ':' + c.name + ' ' + c.kb + 'KB').join(', '));
  check('versión distinta: deserialize la rechaza (null)', S.deserialize({ v: 99, o: [] }, S.createGame({ online: true, humans: [{}, {}] })) === null);
  {
    const o = { online: true, seed: 7, venue: 'beach', humans: [{}, {}] }, a = S.createGame(o), b = S.createGame(o);
    for (let i = 0; i < 3000; i++) { S.step(a, DT, [{}, {}]); S.step(b, DT, [{}, {}]); }
    S.useSlot(b, 1); // la interfaz del invitado leyendo su hueco entre pasos (debería usar slotGet)
    const same = JSON.stringify(S.serialize(a)) === JSON.stringify(S.serialize(b));
    check('foto canónica: serialize igual aunque la interfaz haya llamado a useSlot entre pasos', same && b.hT === 0 && S.stateHash(a) === S.stateHash(b), { same, hT: b.hT });
  }
}

console.log('\n== (e) atributos por hueco, Igualado y opciones ==');
{
  const A = { jump: 90, speed: 80, react: 70, recv: 60, dig: 60, set: 50, spike: 95, ctl: 70, block: 40, serve: 85 }, B = { jump: 20, speed: 30, spike: 25 };
  const g = S.createGame({ online: true, seed: 6000, humans: [{ attrs: A, badges: { canon: 2 } }, { idx: 1, attrs: B }] });
  const h0 = g.hum[0].p, h1 = g.hum[1].p;
  check('cada hueco con los atributos de su jugador (y solo él); los compañeros IA neutros', h0.st && h0.st.spike === 95 && h0.ak && h0.badges && h0.badges.canon === 2 && h1.idx === 1 && h1.st && h1.st.jump === 20 && !S.other(g, h0).st && !S.other(g, h1).st,
    { h0: h0.st && h0.st.spike, h1: h1.st && h1.st.jump, idx1: h1.idx });
  const e = S.createGame({ online: true, seed: 6000, even: true, humans: [{ attrs: A, badges: { canon: 2 } }, { attrs: B }] });
  check('Igualado: sin atributos ni insignias en nadie', e.players.every(p => !p.st && !p.badges && !p.ak));
  check('perfil común: DIFF.mate en los dos equipos, TIMING.online (= Normal), nivel normal, control one, maestría', e.prof[0] === VB.DIFF.mate && e.prof[1] === VB.DIFF.mate && e.tm === VB.TIMING.online &&
    JSON.stringify(VB.TIMING.online) === JSON.stringify(VB.TIMING.normal) && e.difficulty === 'normal' && e.ctrlMode === 'one' && e.mastery === true);
  check('1 set a 21 por defecto; bestOf 3 = mejor de 3; la sede la elige quien crea', e.bo1 === true && e.points === 21 && S.createGame({ online: true, humans: [{}, {}], bestOf: 3 }).bo1 === false &&
    S.createGame({ online: true, humans: [{}, {}], venue: 'beach' }).beach === true);
  check('el n.º 2 del equipo 1 (idx 1) saca primero en su equipo', (() => { const q = S.createGame({ online: true, seed: 1, humans: [{}, { idx: 1 }] }); return q.serverIdx[1] === 0 && q.hum[1].p === q.teams[1][1]; })());
  const off = S.createGame({ seed: 1 });
  check('fuera del online nada cambia: sin g.online ni g.hum', !off.online && !off.hum && off.prof[0] === VB.DIFF.mate && off.tm === VB.TIMING.normal);
}

console.log('\n== (f) online de varios: plazas desacopladas del equipo ==');
{
  /** Partido con N plazas, un bot por plaza (bots[s] o null = la plaza sin entrada). Resumen por plaza y por equipo. */
  function playN(opts, bots, maxSec, hook) {
    const g = S.createGame(opts), ev = [], n = g.hum.length;
    const seat = g.hum.map(() => ({ hHits: 0, aiHits: 0, hToss: 0 }));
    const T = [0, 1].map(() => ({ hHits: 0, aiHits: 0, hToss: 0, cpuToss: 0, points: 0 }));
    let bad = 0, ritualHuman = 0, cpuChalSet = 0, steps = Math.round((maxSec || 900) / DT), over = false, err = null, libSeat = 0, libHits = 0;
    const libP = g.rot ? [g.libero[0], g.libero[1]] : [];
    for (let i = 0; i < steps; i++) {
      const ins = bots.map(b => (b ? b(g) : {}));
      if (hook) hook(g, i, ins);
      try { S.step(g, DT, ins); } catch (e) { err = e; break; }
      if (g.cpuChal && S.humOn(g, g.cpuChal.team)) cpuChalSet++;
      if (g.mode === 'serve' && g.server && S.isHuman(g, g.server) && (g.ritual.on || g.cpuTossIn >= 0)) ritualHuman++;
      ev.length = 0; S.drainEvents(g, ev);
      for (const e of ev) {
        if (e.type === 'hit') {
          const s = S.humSlot(g, e.player);
          if (e.human) {
            T[e.team].hHits++;
            // propiedad del toque: lo da el jugador de una plaza humana (sin ai) de SU equipo
            if (s < 0 || g.hum[s].team !== e.team || g.hum[s].p !== e.player) bad++; else seat[s].hHits++;
            if (libP.indexOf(e.player) >= 0) libHits++;
          } else {
            T[e.team].aiHits++;
            if (s >= 0) bad++;                              // un jugador de plaza humana nunca toca como IA
          }
        }
        if (e.type === 'toss') {
          if (e.human) { T[e.team].hToss++; const s = S.humSlot(g, e.player); if (s >= 0) seat[s].hToss++; else bad++; } else T[e.team].cpuToss++;
        }
        if (e.type === 'libero' && e.human && e.seat >= 0) libSeat++;
        if (e.type === 'point') T[e.team].points++;
        if (e.type === 'gameOver') over = true;
      }
      if (over) break;
    }
    return { g, n, seat, T, bad, over, err, ritualHuman, cpuChalSet, libSeat, libHits };
  }
  const errOf = (R, k) => R.err ? k + ': ' + String(R.err.stack || R.err).split('\n').slice(0, 3).join(' | ') : null;
  const H4 = [{ team: 0, idx: 0 }, { team: 1, idx: 0 }, { team: 0, idx: 1 }, { team: 1, idx: 1 }];
  const bots4 = (s, prof) => H4.map((h, k) => mkBot(h.team, s, prof || PROF.bueno, k));

  // --- 1 contra 1 sin cambios: humans de 2 (con o sin team = su índice) no es «de varios»
  {
    const a = S.createGame({ online: true, seed: 1, humans: [{}, {}] }), b = S.createGame({ online: true, seed: 1, humans: [{ team: 0 }, { team: 1, idx: 1 }] });
    const off = S.createGame({ seed: 1 });
    check('1 contra 1: sin g.mh ni g.skipS (plaza = equipo); humansOf fuera del online = [g.ctrl] en el equipo 0', !a.mh && !b.mh && !a.skipS && b.hum[1].p === b.teams[1][1] &&
      !S.isMulti({ online: true, humans: [{}, {}] }) && S.isMulti({ online: true, humans: [{ team: 1 }, { team: 0 }] }) &&
      S.humansOf(off, 0).length === 1 && S.humansOf(off, 0)[0] === off.ctrl && S.humansOf(off, 1).length === 0 && S.humansOf(a, 1)[0] === a.hum[1].p);
  }

  // --- 4 plazas en 2v2 (2 por equipo): los cuatro jugadores son humanos
  {
    let fin = 0, errs = [], bad = 0, rit = 0, cpu = 0, mateAI = 0, cpuToss = 0, perSeat = [0, 0, 0, 0], tossSeat = [0, 0, 0, 0];
    for (let s = 1; s <= 6; s++) {
      const R = playN({ online: true, seed: 7000 + s, venue: s % 2 ? 'beach' : 'hall', humans: H4, stats: true, present: true }, bots4(s), 1500);
      if (R.err) errs.push(errOf(R, s));
      if (R.over) fin++;
      bad += R.bad; rit += R.ritualHuman; cpu += R.cpuChalSet; mateAI += R.T[0].aiHits + R.T[1].aiHits; cpuToss += R.T[0].cpuToss + R.T[1].cpuToss;
      R.seat.forEach((x, k) => { perSeat[k] += x.hHits; tossSeat[k] += x.hToss; });
      if (s === 1) check('4 plazas: g.mh, plaza ≠ equipo (plaza 2 = equipo 0, n.º 2), humOn en los dos equipos, sin espejo de saque', R.g.mh && R.g.hum[2].team === 0 && R.g.hum[2].p === R.g.teams[0][1] &&
        S.humansOf(R.g, 0).length === 2 && S.humansOf(R.g, 1).length === 2 && R.g.ctrlIdx === 0 && R.g.hum.length === 4);
    }
    check('4 plazas: sin excepciones y los 6 partidos terminan', errs.length === 0 && fin === 6, { fin, errs: errs.slice(0, 2) });
    check('4 plazas: cada plaza da toques humanos y saca como humana; nadie toca ni saca como IA', perSeat.every(v => v > 20) && tossSeat.every(v => v > 5) && mateAI === 0 && cpuToss === 0,
      { toques: perSeat, saques: tossSeat, ia: mateAI, cpuToss });
    check('4 plazas: cada toque humano es del jugador de su plaza; sin ritual de CPU; la CPU no pide challenge por un equipo con humanos', bad === 0 && rit === 0 && cpu === 0, { bad, rit, cpu });
  }

  // --- coop: 2 humanos en el equipo 0 contra la IA (teamLv: la IA rival en Difícil, timing de Normal para los humanos)
  {
    let fin = 0, errs = [], bad = 0, seatH = [0, 0], hT1 = 0, cpuT1 = 0, aiT1 = 0, hT0toss = 0, ai0 = 0;
    const lv = [{ prof: 'mate', tm: 'normal' }, { prof: 'hard' }];
    for (let s = 1; s <= 6; s++) {
      const R = playN({ online: true, coop: true, seed: 7100 + s, venue: s % 2 ? 'beach' : 'hall', humans: [{}, {}], teamLv: lv, stats: true }, [mkBot(0, s, PROF.bueno, 0), mkBot(0, s, PROF.bueno, 1)], 1500);
      if (R.err) errs.push(errOf(R, s));
      if (R.over) fin++;
      bad += R.bad; seatH[0] += R.seat[0].hHits; seatH[1] += R.seat[1].hHits; hT1 += R.T[1].hHits + R.T[1].hToss; cpuT1 += R.T[1].cpuToss; aiT1 += R.T[1].aiHits; hT0toss += R.T[0].hToss; ai0 += R.T[0].aiHits;
      if (s === 1) {
        const g = R.g;
        check('coop: las dos plazas en el equipo 0 (n.º 1 y n.º 2), el equipo 1 sin humanos (humOn falso), perfiles y timing por equipo',
          g.mh && g.hum[0].team === 0 && g.hum[1].team === 0 && g.hum[1].p === g.teams[0][1] && !S.humOn(g, 1) && S.humOn(g, 0) &&
          g.prof[0] === VB.DIFF.mate && g.prof[1] === VB.DIFF.hard && g.hum[0].tm === VB.TIMING.normal && g.hum[1].tm === VB.TIMING.normal && g.tm === VB.TIMING.normal);
      }
    }
    check('coop: sin excepciones y los 6 partidos terminan', errs.length === 0 && fin === 6, { fin, errs: errs.slice(0, 2) });
    check('coop: los dos humanos tocan y sacan; el equipo 1 lo juega todo la IA (toques y saques de CPU)', seatH.every(v => v > 30) && hT0toss > 10 && ai0 === 0 && hT1 === 0 && cpuT1 > 10 && aiT1 > 100,
      { toques: seatH, sacan: hT0toss, ia0: ai0, equipo1: { humano: hT1, cpuToss: cpuT1, ia: aiT1 } });
    check('coop: cada toque humano es del jugador de su plaza', bad === 0, bad);
    // skip: la pausa del punto solo se salta con las dos plazas (el equipo de la IA no cuenta)
    const g = S.createGame({ online: true, coop: true, seed: 7150, humans: [{}, {}], present: true }), b0 = mkBot(0, 1, PROF.bueno, 0), b1 = mkBot(0, 1, PROF.bueno, 1), ev = [];
    let i = 0; while (g.mode !== 'point' && i++ < 120 * 120) S.step(g, DT, [b0(g), b1(g)]);
    const hold = g.hold;
    for (let k = 0; k < 120; k++) { S.step(g, DT, [{ skip: true }, {}]); ev.push(...S.drainEvents(g, [])); }
    const one = Math.abs(g.timer - (hold - 1)) < 1e-6;
    S.step(g, DT, [{}, { skip: true }]); ev.push(...S.drainEvents(g, []));
    const sk = ev.filter(e => e.type === 'skipReq');
    check('coop: skip con una plaza no salta la pausa; con las dos sí (eventos skipReq con team 0 y su seat)', one && g.timer <= VB.HOLD.skipTo + 1e-9 && sk.length === 2 && sk[0].seat === 0 && sk[1].seat === 1 && sk.every(e => e.team === 0),
      { hold, uno: one, timer: +g.timer.toFixed(3), skipReq: sk.map(e => [e.team, e.seat]) });
  }

  // --- 6v6: 12 plazas (todos humanos) y 3 plazas (la IA en el resto)
  {
    const H12 = Array.from({ length: 12 }, (_, i) => ({ team: i < 6 ? 0 : 1, idx: i % 6 }));
    // (el bot de esta prueba es el del 2v2: con doce defiende casi todo y los peloteos se eternizan, así que no se espera al final del
    // partido: 500 s por semilla, la mitad de las plazas con el bot flojo para que haya puntos)
    let pts = 0, errs = [], bad = 0, seatH = new Array(12).fill(0), ai = 0, lib = 0, libH = 0, rit = 0, cpuT = 0;
    for (let s = 1; s <= 3; s++) {
      const R = playN({ online: true, seed: 7200 + s, format: '6v6', humans: H12, points: 15, stats: true }, H12.map((h, k) => mkBot(h.team, s, k % 2 ? PROF.flojo : PROF.bueno, k)), 500);
      if (R.err) errs.push(errOf(R, s));
      pts += R.T[0].points + R.T[1].points;
      bad += R.bad; ai += R.T[0].aiHits + R.T[1].aiHits; lib += R.libSeat; libH += R.libHits; rit += R.ritualHuman; cpuT += R.T[0].cpuToss + R.T[1].cpuToss;
      R.seat.forEach((x, k) => { seatH[k] += x.hHits; });
      if (s === 1) {
        const g = R.g;
        check('12 plazas: 6v6 online (g.rot, g.mh), cada plaza con su atleta (ctrlBase, ctrlRole), sin banquillo', g.rot && g.mh && g.hum.length === 12 && !g.subsOn &&
          g.hum.every((h, k) => S.slotGet(g, k, 'ctrlBase') === g.lineup[h.team][h.idx]) &&
          g.hum.every((h, k) => S.slotGet(g, k, 'ctrlRole') === ['S', 'OH', 'MB', 'OPP', 'OH', 'MB'][k % 6]));
      }
    }
    check('12 plazas: sin excepciones y hay puntos (3 × 500 s)', errs.length === 0 && pts >= 15, { puntos: pts, errs: errs.slice(0, 2) });
    // (el líbero de cada equipo se reparte entre las plazas de sus centrales: cada uno sale por su central zaguero)
    check('12 plazas: todos tocan como humanos (salvo el líbero sin plaza propia: lo lleva la plaza de su central); nadie como IA ni sin plaza', seatH.every(v => v > 3) && ai === 0 && bad === 0 && rit === 0 && cpuT === 0,
      { toques: seatH, ia: ai, bad, rit, cpuToss: cpuT });
    check('12 plazas: el líbero entra por el central de una plaza y la plaza le lleva (eventos libero con seat; toques humanos del líbero)', lib >= 2 && libH > 0, { libero: lib, toquesLibero: libH });

    // 3 plazas (2 en el equipo 0 por puesto, 1 en el 1): la IA lleva a los otros 9
    let fin3 = 0, err3 = [], bad3 = 0, s3 = [0, 0, 0], ai3 = [0, 0], ask = 0;
    const H3 = [{ team: 0, role: 'OH' }, { team: 0, role: 'S' }, { team: 1, role: 'MB' }];
    for (let s = 1; s <= 3; s++) {
      const R = playN({ online: true, seed: 7300 + s, format: '6v6', humans: H3, points: 15 }, H3.map((h, k) => mkBot(h.team, s, PROF.bueno, k)), 1500, (g, i, ins) => { if (i % 997 === 5) ins[0].switchPlayer = true; });
      if (R.err) err3.push(errOf(R, s));
      if (R.over) fin3++;
      bad3 += R.bad; R.seat.forEach((x, k) => { s3[k] += x.hHits; }); ai3[0] += R.T[0].aiHits; ai3[1] += R.T[1].aiHits;
    }
    {
      const g = S.createGame({ online: true, seed: 7300, format: '6v6', humans: H3 });
      check('3 plazas 6v6: por puesto (OH1 n.º 2, S n.º 1, MB1 del equipo 1), plaza 2 en el equipo 1', S.slotGet(g, 0, 'ctrlBase') === g.lineup[0][1] && S.slotGet(g, 1, 'ctrlBase') === g.lineup[0][0] &&
        S.slotGet(g, 2, 'ctrlBase') === g.lineup[1][2] && g.hum[2].team === 1 && S.slotGet(g, 1, 'ctrlRole') === 'S' && g.ctrl === g.hum[0].p);
    }
    check('3 plazas 6v6: sin excepciones, terminan, las tres plazas tocan y la IA juega el resto en los dos equipos', err3.length === 0 && fin3 === 3 && s3.every(v => v > 5) && ai3.every(v => v > 100) && bad3 === 0,
      { fin: fin3, errs: err3.slice(0, 2), toques: s3, ia: ai3, bad: bad3 });
  }

  // --- la IA toma una plaza (la 2: equipo 0, n.º 2) y la devuelve en el siguiente balón muerto; las otras tres siguen siendo humanas
  {
    const g = S.createGame({ online: true, seed: 7400, humans: H4, venue: 'hall' }), B = bots4(4), ev = [], p2 = g.hum[2].p;
    const ins = () => B.map(b => b(g));
    let i = 0; while (g.mode !== 'rally' && i++ < 120 * 60) S.step(g, DT, ins());
    const x = ins(); x[2] = { ai: true }; S.step(g, DT, x); ev.length = 0; S.drainEvents(g, ev);
    const on = g.hum[2].ai && !S.isHuman(g, p2) && ev.some(e => e.type === 'slotAI' && e.on && e.team === 0 && e.seat === 2) && S.humOn(g, 0);
    let aiHits = 0, hum2 = 0, others = 0, otherAI = 0;
    for (let k = 0; k < 120 * 200 && !g.finished; k++) {
      const y = ins(); y[2] = { ai: true, move: [1, 0], hit: k % 5 === 0 }; S.step(g, DT, y); ev.length = 0; S.drainEvents(g, ev);
      for (const e of ev) if (e.type === 'hit') {
        if (e.player === p2) { if (e.human) hum2++; else aiHits++; }
        else if (e.human) others++; else otherAI++;
      }
    }
    i = 0; while (g.mode !== 'rally' && i++ < 120 * 60) { const y = ins(); y[2] = { ai: true }; S.step(g, DT, y); }
    S.step(g, DT, ins());
    const still = g.hum[2].ai;
    let back = null; i = 0;
    while (!back && i++ < 120 * 60) { S.step(g, DT, ins()); ev.length = 0; S.drainEvents(g, ev); back = ev.find(e => e.type === 'slotAI' && !e.on); }
    check('ai en una plaza: su jugador lo juega la IA (la entrada no cuenta), las otras tres plazas siguen humanas, vuelve en el balón muerto',
      on && aiHits > 10 && hum2 === 0 && others > 30 && otherAI === 0 && still && !!back && back.seat === 2 && S.isHuman(g, p2),
      { on, aiHits, hum2, others, otherAI, still, back: back && [back.team, back.seat], mode: g.mode });
  }

  // --- bits por equipo con 4 plazas: skip necesita las 4; chal de la plaza 2 gasta el challenge del equipo 0; tmo de la plaza 3 es del 1
  {
    const g = S.createGame({ online: true, seed: 7500, humans: H4, present: true }), B = bots4(5), ev = [];
    let i = 0; while (g.mode !== 'point' && i++ < 120 * 120) S.step(g, DT, B.map(b => b(g)));
    const hold = g.hold;
    for (let k = 0; k < 120; k++) S.step(g, DT, [{ skip: true }, { skip: true }, { skip: true }, {}]);
    const three = Math.abs(g.timer - (hold - 1)) < 1e-6;
    S.step(g, DT, [{}, {}, {}, { skip: true }]);
    check('4 plazas: skip con tres plazas no salta la pausa; con las cuatro sí', three && g.timer <= VB.HOLD.skipTo + 1e-9, { hold, tres: three, timer: +g.timer.toFixed(3) });
    let done = null;
    for (let s = 1; s <= 40 && !done; s++) {
      const q = S.createGame({ online: true, seed: 7600 + s, humans: H4, venue: 'hall', timeouts: true }), Q = bots4(s);
      for (let k = 0; k < 120 * 400 && !done && !q.finished; k++) {
        const x = Q.map(b => b(q));
        if (q.mode === 'point' && q.call && !q.call.used && q.call.team === 0 && S.canChallenge(q, 0) > 0) {
          const before = q.challenges.slice(); x[2].chal = true; x[3].tmo = q.tmoLeft[1] > 0;
          S.step(q, DT, x); ev.length = 0; S.drainEvents(q, ev);
          const ch = ev.find(e => e.type === 'challenge'), tq = ev.find(e => e.type === 'timeoutReq');
          let res = null;
          for (let j = 0; j < 120 * 8 && !res; j++) { S.step(q, DT, Q.map(b => b(q))); ev.length = 0; S.drainEvents(q, ev); res = ev.find(e => e.type === 'challengeResult'); }
          done = { ch: ch && ch.team, tmo: tq && [tq.team, tq.seat], res: res && [res.team, res.left], before, req: q.tmoReq.slice() };
          done.ok = ch && ch.team === 0 && tq && tq.team === 1 && tq.seat === 3 && res && res.team === 0 && res.left[1] === before[1];
        } else { S.step(q, DT, x); S.drainEvents(q, []); }
      }
    }
    check('4 plazas: chal de la plaza 2 es el challenge del equipo 0 (el del 1 intacto); tmo de la plaza 3 pide por el equipo 1 (seat 3)', !!done && done.ok, done);
  }

  // --- foto y copyGame bit a bit con 4 plazas (2v2) y con 12 plazas (6v6)
  {
    const cases = [];
    const H12 = Array.from({ length: 12 }, (_, i) => ({ team: i < 6 ? 0 : 1, idx: i % 6 }));
    for (const [name, opts] of [['2v2×4', { online: true, seed: 7700, humans: H4, stats: true, timeouts: true }],
      ['coop', { online: true, coop: true, seed: 7701, humans: [{}, {}], teamLv: [null, { prof: 'expert' }], stats: true }],
      ['6v6×12', { online: true, seed: 7702, format: '6v6', humans: H12, stats: true }]]) {
      const g = S.createGame(opts), B = g.hum.map((h, k) => mkBot(h.team, 9, PROF.bueno, k));
      for (let i = 0; i < 120 * 40; i++) { S.step(g, DT, B.map(b => b(g))); g.events.length = 0; }
      const js = JSON.stringify(S.serialize(g)), g2 = S.createGame(opts), okD = S.deserialize(JSON.parse(js), g2) === g2;
      const g3 = S.createGame(opts); S.copyGame(g3, g); g3.stats = JSON.parse(JSON.stringify(g.stats));
      let same = deepHash(g) === deepHash(g2) && deepHash(g) === deepHash(g3), at = -1;
      for (let k = 0; k < 2000 && same; k++) {
        const x = B.map(b => b(g));
        if (k % 300 === 77) for (const y of x) y.skip = true;
        if (k === 900) x[1].ai = true;
        S.step(g, DT, x); S.step(g2, DT, x); S.step(g3, DT, x);
        const e1 = S.drainEvents(g, []).length, e2 = S.drainEvents(g2, []).length; S.drainEvents(g3, []);
        if (e1 !== e2 || (k % 50 === 49 && (deepHash(g) !== deepHash(g2) || deepHash(g) !== deepHash(g3)))) { same = false; at = k; }
      }
      cases.push({ name, okD, same, at, kb: +(js.length / 1024).toFixed(1) });
    }
    check('foto → JSON → partida nueva y copyGame: idénticas 2 000 pasos después con 4, coop y 12 plazas', cases.every(c => c.okD && c.same), cases);
  }

  // --- atributos: matriz completa por jugador (6v6) y encima los de cada plaza; Igualado sin nada; el banquillo nunca entra online
  {
    const M = [[0, 1, 2, 3, 4, 5].map(i => ({ spike: 40 + i })), [0, 1, 2, 3, 4, 5].map(i => ({ spike: 60 + i }))];
    const g = S.createGame({ online: true, seed: 7800, format: '6v6', attrs: M, badges: [[null, { canon: 1 }], []], bench: [[{}, {}], [{}, {}]],
      humans: [{ team: 0, idx: 3, attrs: { spike: 99 } }, { team: 1, idx: 0 }] });
    const st = t => g.lineup[t].map(p => p.st ? p.st.spike : null); // (lineup: teams[t] ya lleva al líbero en el hueco de su central)
    check('6v6: matriz completa de atributos (los 12) y la plaza encima de la suya; insignias de la matriz; sin banquillo (bench null)',
      JSON.stringify(st(0)) === JSON.stringify([40, 41, 42, 99, 44, 45]) && JSON.stringify(st(1)) === JSON.stringify([60, 61, 62, 63, 64, 65]) &&
      g.teams[0][1].badges && g.teams[0][1].badges.canon === 1 && !g.subsOn && g.opts.bench === null, { e0: st(0), e1: st(1), subsOn: g.subsOn });
    const e = S.createGame({ online: true, seed: 7800, format: '6v6', even: true, attrs: M, humans: [{ team: 0, idx: 3, attrs: { spike: 99 } }, { team: 1 }] });
    check('6v6 Igualado: sin atributos ni insignias en nadie', e.players.every(p => !p.st && !p.badges && !p.ak));
    let threw = false; try { S.createGame({ online: true, humans: [{}, {}, {}, {}, {}] }); } catch (x) { threw = true; }
    const d = S.createGame({ online: true, seed: 1, humans: [{ team: 0, idx: 0 }, { team: 0, idx: 0 }, { team: 0, idx: 1 }] });
    check('plazas saneadas: un jugador repetido pasa al hueco libre (o al otro equipo); más plazas que jugadores es un error', threw &&
      d.hum[1].p === d.teams[0][1] && d.hum[2].team === 1 && new Set(d.hum.map(h => h.p)).size === 3, d.hum.map(h => [h.team, h.idx]));
  }
}

console.log('\n' + (fails ? fails + ' FALLOS, ' : '') + oks + ' pruebas OK en ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
process.exit(fails ? 1 : 0);
