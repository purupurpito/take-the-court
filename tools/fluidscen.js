#!/usr/bin/env node
/* MAKE THE CUT — tools/fluidscen.js  (owner: net)
 * Online V2 «Fluida»: escenarios DIFÍCILES junto a la red (notes/online-v2-spec.md, plan de pruebas C.4) jugados como partidos de
 * verdad entre dos VB.NetFluid.Session unidas por VB.Net.memPair (reloj virtual, frames fijos de 8 ms desfasados 4 ms, sin azar
 * del harness). Cada máquina en su PROPIO contexto vm (sim.js + ai.js + ai6.js + net.js + netfluid.js), como tools/fluidtest.js.
 * Los partidos arrancan solos (IA en los dos huecos) y en un tic T0 elegido por el harness se prepara la jugada: en la máquina
 * del DUEÑO del balón (el que saca) un contacto con flContact (el tc sale solo), y en la del otro su(s) jugador(es) (posición,
 * salto). Desde ahí solo juegan las sims (IA del compañero, humanos quietos o con la entrada del guion) y la red.
 *
 * Escenarios (--only con la lista: 1,2,3,3b,4,5,6,7,8,9):
 *   1 remate desde 0,5 m contra un bloqueador rival en el aire con RTT 150 (bloqueo juzgado en la recuperación con rewind), su
 *     referencia con RTT 0 (mismo bloqueo) y RTT 300 (el atacante ve/oye el bloqueo: aviso); 2 balón a la cinta (pasa / vuelve);
 *   3 balón a la red que vuelve; 3b y el atacante (con toques) lo juega en cuanto su máquina lo recupera (RTT 0/150/250);
 *   4 colocación lenta a 0,4 m con toques: el atacante remata antes del traspaso (vale) y después (no vale: diseño);
 *   5 toque de red del bloqueador sin el balón (fq → exactamente un punto), 5b el fq cruza el traspaso (fx) y 5c el remate vuelve
 *     de la red antes del fx (el toque de red, lo primero que pasó, debe dar el punto);
 *   6 bifurcación forzada con RTT 300 (gana el dueño viejo; el toque perdido no queda en los confirmados);
 *   7 bifurcación tras un punto de la rama perdida que cierra el set (al mejor de 3) o el partido (al mejor de 1): se deshace;
 *   8 toque de red del receptor durante el saque rival (RTT 60/150/250): un punto, del sacador;
 *   9 punto del dueño justo antes del traspaso (falta de red propia) y contacto del otro (la red) justo después: vale el punto.
 * Comprobaciones comunes al final de cada jugada: sin excepciones, mismo r y mismo marcador (flDigest) en los dos, un solo punto
 * por rally en los confirmados de cada lado y el mismo, sin ptBad/digestBad/sbFix, guarda de point() a 0, cmpBad -1, mis jugadores
 * nunca corregidos por la red (fuera de los tics que toca el guion), los mismos golpes/bloqueos confirmados en los dos lados y,
 * con RTT <= 150, el balón pintado sin saltos de más de 50 cm en un frame (spec §5.3: la corrección decae, no salta).
 * Salida JSON en tools/out/fluid-scen.json.
 * Uso: node tools/fluidscen.js [--only 1,5,9] [--v]    (sale con código 1 si algo falla)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const VERB = process.argv.includes('--v');
const ONLY = process.env.FLSCEN_ONLY || (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const SRC = ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/net.js', 'js/netfluid.js'].map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
const STEP = 1 / 120, STEP_MS = 1000 / 120;
function load() {
  const ctx = { console, TextEncoder, TextDecoder };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.VB = { VERSION: 'test' };
  for (const [f, s] of SRC) vm.runInContext(s, ctx, { filename: f });
  ctx.VB.NetFluid.C.KHCHECK = true;   // (comprobación del traspaso de cada tc: solo en las pruebas)
  return ctx.VB;
}
let fails = 0, oks = 0, warns = 0;
const ISSUES = [];
function check(name, ok, info) {
  if (ok) oks++; else { fails++; ISSUES.push(name); }
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
}
function warn(name, info) { warns++; console.log('  AVISO ' + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
const side = t => t === 0 ? 1 : -1;
const KIN = ['x', 'y', 'z', 'vx', 'vy', 'vz'];
function kinHash(g, team) { let s = ''; for (const p of g.teams[team]) for (const k of KIN) s += p[k] + ','; return s; }
const AIIN = { move: [0, 0], ai: true };
const NOIN = { move: [0, 0], ai: false };

/* ---------------------------------------------------------------------------------------------------------------------------------
 * Pareja de sesiones con reloj virtual.
 * cfg: {rtt, jit, loss, seed, venue, points, bestOf}
 * Devuelve un objeto con:
 *   run(ms | fn, maxMs)   avanza el reloj (frames fijos) hasta ms más o hasta que fn() sea verdad
 *   hook(k, T, fn)        fn(g, S, sess) en la máquina k ANTES del paso del tic T (F.T ya vale T)
 *   inp[k]                entrada de cada lado (por defecto la IA en el hueco humano)
 *   ev[k]                 eventos presentados {type, _o, pid, r, T, ...}; conf[k] confirmados
 *   ctl[k]                mensajes de control mandados por k ({k, r, ...} sin el bulto)
 * --------------------------------------------------------------------------------------------------------------------------------- */
function pair(cfg) {
  const V = [load(), load()];
  let T = 0;
  const [la, lb] = V[0].Net.memPair({ lag: cfg.rtt, jit: cfg.jit || 0, loss: cfg.loss || 0, seed: cfg.seed || 1, clock: () => T });
  const ctl = [[], []];
  [la, lb].forEach((l, k) => {
    const s0 = l.send;
    l.send = function (ch, d) {
      if (ch === 'ctl') { try { const m = JSON.parse(d); if (m.k !== 'ping' && m.k !== 'pong') ctl[k].push({ k: m.k, r: m.r, s: m.s, par: m.par, T: m.T, h: m.h, kind: m.kind, kh: m.kh, khAt: m.khAt, own: m.own, w: m.w, reason: m.reason, pid: m.pid, x: m.x, at: T }); } catch (e) { } }
      return s0.call(this, ch, d);
    };
  });
  const opts = { online: true, seed: 9000 + (cfg.seed || 1), venue: cfg.venue || 'hall', bestOf: cfg.bestOf || 1, points: cfg.points || 11, humans: [{}, {}], present: true, stats: true, net: 'fluida' };
  const sess = [null, null];
  const hooks = [new Map(), new Map()];
  const corr = [0, 0], corrInfo = [], hookTicks = [new Set(), new Set()];
  const watch = [{ h: null }, { h: null }];
  V.forEach((Vx, k) => {
    const S = Vx.Sim, step0 = S.step;
    S.step = function (g, dt, ins) {
      const F = g.fl, w = watch[k];
      if (F) {
        const me = F.me;
        if (w.h !== null && w.g === g) {
          const h = kinHash(g, me), legit = F.srvR !== w.srv || w.mode !== g.mode || (sess[k] && sess[k].stats.rsIn !== w.rs) || hookTicks[k].has(F.T - 1);
          if (h !== w.h && !legit) { corr[k]++; if (corrInfo.length < 6) corrInfo.push({ k, T: F.T, mode: g.mode }); }
        }
        const L = hooks[k].get(F.T);
        if (L) { hooks[k].delete(F.T); hookTicks[k].add(F.T); for (const fn of L) fn(g, S, sess[k]); }
      }
      const r = step0(g, dt, ins);
      if (F) { w.g = g; w.h = kinHash(g, F.me); w.srv = F.srvR; w.mode = g.mode; w.rs = sess[k] ? sess[k].stats.rsIn : 0; }
      return r;
    };
  });
  const msgs = [];
  const log = m => { msgs.push((T / 1000).toFixed(3) + ' ' + m); if (VERB) console.log('    ' + (T / 1000).toFixed(3) + ' ' + m); };
  sess[0] = new V[0].NetFluid.Session({ slot: 0, link: la, opts, name: 'Anfitrión', log });
  sess[1] = new V[1].NetFluid.Session({ slot: 1, link: lb, opts: null, name: 'Invitado', log, expect: { even: false, bestOf: opts.bestOf, points: opts.points, venue: opts.venue, net: 'fluida' } });
  const off = [0, 54321.5];
  const inp = [AIIN, AIIN];
  const ev = [[], []], conf = [[], []];
  const next = [0, 4];
  let err = null;
  function evRec(e, k) {
    const p = e.player && typeof e.player === 'object' ? e.player.id : -1;
    return { type: e.type, o: e._o, pid: p, team: e.team, tick: e._tick, result: e.result, kind: e.kind, reason: e.reason, tape: e.tape, at: T, score: e.score ? e.score.join('-') : undefined, k };
  }
  function frame() {
    const k = next[0] <= next[1] ? 0 : 1;
    T = next[k]; next[k] += 8;
    const s = sess[k];
    let r;
    const ii = typeof inp[k] === 'function' ? inp[k](s.g, s) : inp[k];
    try { r = s.advance(T + off[k], s.g ? ii : null); } catch (e) { err = err || e; return false; }
    for (const e of r.events) ev[k].push(evRec(e, k));
    for (const e of r.confirmed) conf[k].push(evRec(e, k));
    // sensación: salto por frame del balón pintado (lo que no explica su velocidad) y del rival pintado, en saque/peloteo
    if (r.g && s.g && (s.g.mode === 'rally' || s.g.mode === 'serve') && (r.status === 'playing' || r.status === 'waiting')) {
      const b = r.g.ball, pv = disp[k], vm = Math.hypot(b.vx || 0, b.vy || 0, b.vz || 0);
      if (pv.b && T - pv.at <= 20 && s.T >= ignore[k] && pv.r === s.g.fl.r && pv.mode === s.g.mode) {   // (sin el saque nuevo: el balón vuelve a la mano)
        const d = Math.hypot(b.x - pv.b[0], b.y - pv.b[1], b.z - pv.b[2]) - Math.max(vm, pv.b[3]) * 1.3 * (T - pv.at) / 1000 - 0.02;
        if (d > pv.maxB.d) pv.maxB = { d: Math.round(d * 100) / 100, at: T, tick: s.T };
        if (d > 0.25) pv.bigB.push({ d: Math.round(d * 100) / 100, at: T, tick: s.T, src: s.bSrc });
      }
      pv.b = [b.x, b.y, b.z, vm]; pv.at = T; pv.r = s.g.fl.r; pv.mode = s.g.mode;
    } else disp[k].b = null;
    return true;
  }
  const ignore = [0, 0];
  const disp = [{ b: null, at: 0, maxB: { d: 0 }, bigB: [] }, { b: null, at: 0, maxB: { d: 0 }, bigB: [] }];
  const P = {
    V, sess, la, lb, ctl, ev, conf, inp, msgs, corr, corrInfo, opts, disp, ignore, cfg,
    get T() { return T; }, get err() { return err; },
    hook(k, Tk, fn) { const m = hooks[k]; if (!m.has(Tk)) m.set(Tk, []); m.get(Tk).push(fn); },
    /** avanza hasta que fn() sea verdad (o ms si es número); devuelve true si se cumplió */
    run(cond, maxMs) {
      const end = typeof cond === 'number' ? T + cond : T + (maxMs || 30000);
      while (T < end) {
        if (!frame()) return false;
        if (typeof cond === 'function' && cond()) return true;
      }
      return typeof cond === 'number';
    },
    /** tic común de la máquina k ahora */
    tick(k) { return sess[k].T; }
  };
  return P;
}

/* ---------------------------------------------------------------------------------------------------------------------------------
 * Utilidades de guion
 * --------------------------------------------------------------------------------------------------------------------------------- */
function setBall(g, o) {
  const b = g.ball; b.held = null; b.x = o.x; b.y = o.y; b.z = o.z; b.vx = o.vx; b.vy = o.vy; b.vz = o.vz;
  b.spin = 0; b.dip = 0; b.wobA = 0; b.wobF = 0; b.wobP = 0; b.speed = Math.hypot(o.vx, o.vy, o.vz);
}
/** Contacto de guion en la máquina del dueño (antes del paso del tic F.T): balón, metadatos y flContact (la sesión manda el tc). */
function contact(g, S, p, ball, o) {
  const F = g.fl;
  if (F.own !== p.team || !F.loc[p.team]) throw new Error('contacto de guion sin ser el dueño (own ' + F.own + ', equipo ' + p.team + ')');
  if (g.mode === 'serve') { if (g.ritual) { g.ritual.on = false; g.ritual.phase = 'none'; } g.cpuTossIn = -1; }
  g.mode = 'rally';
  g.time = F.T * STEP; F.hs = 2 * F.T - 1; F.dh = STEP / 2;
  setBall(g, ball);
  const prevTeam = g.touchTeam;
  g.touchTeam = p.team; g.touches = o.touches; g.lastPlayer = p; g.lastTeam = p.team;
  g.prevKind = o.prevKind || (prevTeam === p.team ? g.lastKind : ''); g.lastKind = o.kind; g.lastShot = o.shot || ''; g.lastQ = 0.8;
  g.lastTouchT = g.time; g.atkServe = null; g.blockCD = 0; g.netSince = false; g.blockBy = null;
  g.hardIn = !!o.hard; g.digOk = o.digOk !== undefined ? o.digOk : true; g.digTight = false;
  if (o.kind === 'spike') { g.atkTeam = p.team; g.atkHow = 'kill'; g.atkHits = g.rally.hits; g.atkHuman = false; g.atkGrade = 'good'; }
  p.lastAction = o.kind === 'spike' ? 'spike' : o.kind; p.actionT = 0;
  S._emit(g, { type: 'hit', kind: o.kind, player: p, team: p.team, touch: o.touches, x: ball.x, y: ball.y, z: ball.z, speed: g.ball.speed, scripted: true });
  S._flContact(g, 'hit');
}
/** Velocidad vertical para que el balón, lanzado desde (x0, z0) con vx, cruce x = 0 a la altura zc (vuelo puro, sin baile). */
function vzFor(S, x0, z0, vx, zc) {
  let lo = -15, hi = 15;
  for (let it = 0; it < 60; it++) {
    const vz = (lo + hi) / 2, o = { x: x0, y: 0, z: z0, vx, vy: 0, vz, spin: 0, speed: 0, dip: 0, wobA: 0, wobF: 0, wobP: 0 };
    let k = 0, z = null;
    while (k < 2000) { const px = o.x; S.flFly(o, 0, 1, STEP / 2, o); k++; if ((px > 0) !== (o.x > 0)) { z = o.z; break; } if (o.z <= 0.21) break; }
    if (z === null || z < zc) lo = vz; else hi = vz;
  }
  return (lo + hi) / 2;
}
/** Espera a un saque nuevo en los dos lados (saque preparado y el sr del otro ya llegado) y devuelve {srv, T0}. */
function waitServe(P, maxMs) {
  const ok = P.run(() => {
    const a = P.sess[0].g, b = P.sess[1].g;
    return a && b && P.sess[0].status === 'playing' && P.sess[1].status === 'playing' && a.mode === 'serve' && b.mode === 'serve' &&
      a.fl.r === b.fl.r && a.fl.peer && b.fl.peer && a.serveT < 0.4 && b.serveT < 0.4 && a.ball.held && !a.serveAuth;
  }, maxMs || 40000);
  if (!ok) return null;
  const srv = P.sess[0].g.server.team;
  return { srv, T0: Math.max(P.tick(0), P.tick(1)) };
}
function digest(P, k) { return JSON.stringify(P.V[k].Sim.flDigest(P.sess[k].g)); }
/** Comprobaciones comunes tras una jugada del rally r (con el punto ya aplicado en los dos). */
function agree(P, tag, r, extra) {
  const A = P.sess[0], B = P.sess[1];
  const res = { err: P.err ? String(P.err.stack || P.err).split('\n').slice(0, 3).join(' | ') : null };
  check(tag + ': sin excepciones', !P.err, res.err || undefined);
  if (P.err) return res;
  const dA = digest(P, 0), dB = digest(P, 1);
  res.r = [A.g.fl.r, B.g.fl.r]; res.score = [A.g.score.join('-'), B.g.score.join('-')];
  check(tag + ': mismo marcador y rally en los dos (flDigest)', dA === dB && A.g.fl.r > r, { A: dA, B: dB, r0: r });
  const ptsOf = k => P.conf[k].filter(e => e.type === 'point');
  const pA = ptsOf(0), pB = ptsOf(1);
  // puntos confirmados del rally r: el que lleva el marcador tras r (uno por lado)
  check(tag + ': un solo punto por lado en los confirmados, el mismo', pA.length === pB.length && pA.length >= 1 && JSON.stringify(pA.map(e => e.team + '/' + e.score)) === JSON.stringify(pB.map(e => e.team + '/' + e.score)),
    { A: pA.map(e => e.team + '/' + e.score), B: pB.map(e => e.team + '/' + e.score) });
  const fA = A.flStats, fB = B.flStats;
  check(tag + ': sin ptBad/digestBad/sbFix, guarda de point() a 0, cmpBad -1', fA.ptBad + fB.ptBad + fA.digestBad + fB.digestBad + fA.sbFix + fB.sbFix === 0 && A.g.fl.guard + B.g.fl.guard === 0 && A.cmpBad === -1 && B.cmpBad === -1,
    { ptBad: [fA.ptBad, fB.ptBad], digestBad: [fA.digestBad, fB.digestBad], sbFix: [fA.sbFix, fB.sbFix], guard: [A.g.fl.guard, B.g.fl.guard], cmpBad: [A.cmpBad, B.cmpBad] });
  check(tag + ': mis jugadores nunca corregidos por la red', P.corr.join() === '0,0', { corr: P.corr, info: P.corrInfo });
  // golpes y bloqueos confirmados: los mismos (jugador y tipo) en los dos lados
  const key = e => e.type + ':' + e.pid + ':' + (e.result || '');
  const hb = k => P.conf[k].filter(e => e.type === 'hit' || e.type === 'block').map(key).sort();
  const hA = hb(0), hB = hb(1);
  check(tag + ': los mismos golpes y bloqueos confirmados en los dos lados', JSON.stringify(hA) === JSON.stringify(hB), { A: hA, B: hB });
  res.hand = [A.g.fl.hand, B.g.fl.hand]; res.forks = [fA.forks, fB.forks]; res.late = [fA.late, fB.late]; res.lateMaxMs = [Math.round(fA.lateMaxMs), Math.round(fB.lateMaxMs)];
  res.fq = [fA.fqSent, fB.fqSent]; res.fqOk = [fA.fqOk, fB.fqOk]; res.rb = [fA.rb, fB.rb]; res.stale = [fA.stale, fB.stale]; res.dropped = [fA.dropped, fB.dropped];
  res.snaps = [fA.snaps, fB.snaps];
  if (extra) Object.assign(res, extra);
  return res;
}
/** Avanza hasta que los dos lados han pasado del rally r y luego un poco (pa, confirmados). */
function finishRally(P, r, maxMs) {
  const ok = P.run(() => P.sess[0].g.fl.r > r && P.sess[1].g.fl.r > r, maxMs || 90000);
  P.run(800);
  return ok;
}
const events = (P, k, type, from) => P.ev[k].filter(e => e.type === type && (from === undefined || e.at >= from));
const confEv = (P, k, type) => P.conf[k].filter(e => e.type === type);

const pts = (P, k) => confEv(P, k, 'point').map(e => e.team + '/' + e.reason + '/' + e.score);
const OUT = {};
function want(n) { return !ONLY || ONLY.split(',').indexOf(String(n)) >= 0; }
function showFeel(P, tag) {
  const d = P.disp;
  // spec §5.3: la corrección del balón pintado al aplicar un tc va a un desplazamiento que decae (100 ms); solo salta sin mezcla con
  // más de 3 m. Con RTT <= 150 ningún frame debería saltar más de 50 cm de lo que explica la velocidad del balón
  if ((P.cfg.rtt || 0) <= 150) { const big = d[0].bigB.concat(d[1].bigB.map(x => Object.assign({ lado: 'B' }, x))).filter(x => x.d > 0.5); check(tag + ': sensación: el balón pintado no salta más de 50 cm en un frame', big.length === 0, big.slice(0, 3)); }
  console.log('       (' + tag + ' sensación: salto máx. del balón pintado A ' + d[0].maxB.d + ' m, B ' + d[1].maxB.d + ' m; saltos > 25 cm: A ' + d[0].bigB.length + ', B ' + d[1].bigB.length + ')' + (VERB ? ' ' + JSON.stringify([d[0].bigB.slice(0, 4), d[1].bigB.slice(0, 4)]) : ''));
}
/** Prepara una jugada: saque nuevo, humanos quietos (la IA del compañero sigue), T0. Devuelve {P, att, rcv, sa, T0, r0} o null. */
function setup(cfg) {
  const P = pair(cfg);
  const w = waitServe(P);
  if (!w) { check((cfg.tag || '') + ': hay saque', false, { err: P.err && String(P.err) }); return null; }
  P.inp[0] = NOIN; P.inp[1] = NOIN;
  const att = w.srv, rcv = 1 - att;
  // (el balón de guion aparece de golpe: sin medir saltos del balón pintado hasta que el contacto de guion ya se pinta en los dos)
  P.ignore[0] = P.ignore[1] = w.T0 + 70 + 30 + Math.round((cfg.rtt || 0) / 8);
  return { P, att, rcv, sa: side(att), T0: w.T0, r0: P.sess[0].g.fl.r };
}
const humP = (g, t) => g.hum[t].p || g.teams[t][0];
const mate = (g, t, p) => g.teams[t].find(x => x !== p);

// ---------------------------------------------------------------------------------------------------------------------------------
// 1. Remate desde 0,5 m contra el bloqueador rival en el aire (RTT 150, referencia RTT 0 y RTT 300 con las mismas semillas)
// ---------------------------------------------------------------------------------------------------------------------------------
function spikeIntoBlock(rtt, seed) {
  const X = setup({ rtt, seed, tag: 'remate' }); if (!X) return null;
  const { P, att, rcv, sa, T0, r0 } = X, Ti = T0 + 70, info = { rtt, seed };
  P.hook(rcv, Ti - 52, (g, S) => {
    const q = humP(g, rcv), q2 = mate(g, rcv, q);
    q.x = -sa * 0.45; q.y = 0.3; q.z = 0; q.vz = 0; q.vx = q.vy = 0; q2.x = -sa * 7; q2.y = 0;
    S._jump(g, q, 0, 0); info.q = q.id;
  });
  P.hook(att, Ti, (g, S) => {
    const p = humP(g, att); p.x = sa * 0.6; p.y = 0.3; p.z = 0.9; p.vz = 0;
    contact(g, S, p, { x: sa * 0.5, y: 0.3, z: 3.0, vx: -sa * 12, vy: 0, vz: -3 }, { touches: 3, kind: 'spike', shot: 'power', hard: true });
    info.kh = g.fl.kh; info.p = p.id;
  });
  const fin = finishRally(P, r0);
  const bA = P.ev[0].filter(e => e.type === 'block'), bB = P.ev[1].filter(e => e.type === 'block');
  info.first = [bA[0] ? [bA[0].o, bA[0].pid, bA[0].result] : null, bB[0] ? [bB[0].o, bB[0].pid, bB[0].result] : null];
  const cA = confEv(P, 0, 'block'), cB = confEv(P, 1, 'block');
  info.firstC = [cA[0] ? [cA[0].o, cA[0].pid, cA[0].result] : null, cB[0] ? [cB[0].o, cB[0].pid, cB[0].result] : null];
  info.blkOnAtt = P.ev[att].filter(e => e.type === 'block' && e.o === att && e.pid === info.q).length;
  info.fin = fin; info.P = P; info.att = att; info.rcv = rcv; info.r0 = r0;
  return info;
}
if (want(1)) {
  console.log('== 1. remate desde 0,5 m contra el bloqueador en el aire ==');
  const ref = {}, res = [];
  for (const seed of [1, 2, 3, 4]) {
    const a = spikeIntoBlock(0, seed), b = spikeIntoBlock(150, seed), c = spikeIntoBlock(300, seed);
    for (const x of [a, b, c]) if (x) {
      const tag = '1 remate rtt ' + x.rtt + ' s' + x.seed;
      const R = agree(x.P, tag, x.r0);
      const fr = x.firstC[x.rcv];   // primer bloqueo confirmado (en la máquina del bloqueador)
      check(tag + ': el bloqueo lo da la máquina del bloqueador (y no la del atacante), el mismo en los dos', !!fr && fr[0] === x.rcv && fr[1] === x.q && JSON.stringify(x.firstC[0]) === JSON.stringify(x.firstC[1]) && x.blkOnAtt === 0,
        { kh: x.kh, primero: x.firstC, enAtacante: x.blkOnAtt });
      const presOk = JSON.stringify(x.first[x.att]) === JSON.stringify(fr);
      if (x.rtt <= 150) check(tag + ': el atacante ve y oye el bloqueo (evento presentado)', presOk, { presentado: x.first[x.att], lateMaxMs: x.rtt });
      else if (!presOk) warn(tag + ': el atacante NO ve ni oye el bloqueo (evento block silenciado por llegar tarde)', { presentado: x.first[x.att] });
      check(tag + ': sin bifurcaciones' + (x.rtt <= 250 ? ' ni recuperaciones > 300 ms' : ''), R.forks.join() === '0,0' && (x.rtt > 250 || R.late.join() === '0,0'), { forks: R.forks, late: R.late, lateMaxMs: R.lateMaxMs, snaps: R.snaps });
      showFeel(x.P, tag);
      res.push({ rtt: x.rtt, seed: x.seed, first: fr, R });
      if (x.rtt === 0) ref[x.seed] = fr;
    }
    if (a && b) check('1 remate s' + seed + ': con RTT 150 el mismo bloqueo (bloqueador y resultado) que con RTT 0', JSON.stringify(ref[seed]) === JSON.stringify(b.firstC[b.rcv]), { rtt0: ref[seed], rtt150: b.firstC[b.rcv] });
    if (a && c) { const same = JSON.stringify(ref[seed]) === JSON.stringify(c.firstC[c.rcv]); if (!same) warn('1 remate s' + seed + ': con RTT 300 otro bloqueo que con RTT 0', { rtt0: ref[seed], rtt300: c.firstC[c.rcv] }); }
  }
  OUT.spike = res.map(x => ({ rtt: x.rtt, seed: x.seed, first: x.first, r: x.R.r, score: x.R.score, late: x.R.late, lateMaxMs: x.R.lateMaxMs, snaps: x.R.snaps }));
}

// ---------------------------------------------------------------------------------------------------------------------------------
// 2/3. Balón a la cinta (pasa o vuelve) y a la red (vuelve): la red la juzga el receptor (zona), un solo 'net' en los dos lados,
//      el balón que vuelve es otra vez del atacante (con toques puede jugarlo)
// ---------------------------------------------------------------------------------------------------------------------------------
function netBall(rtt, seed, zc, touches, vx) {
  const X = setup({ rtt, seed, tag: 'red' }); if (!X) return null;
  const { P, att, rcv, sa, T0, r0 } = X, Ti = T0 + 70, info = { rtt, seed, zc, touches };
  const S0 = P.V[att].Sim, x0 = sa * 1.6, z0 = 2.9, vz = vzFor(S0, x0, z0, -sa * vx, zc);
  P.hook(rcv, Ti, (g) => { const q = humP(g, rcv), q2 = mate(g, rcv, q); q.x = -sa * 6; q.y = 2.5; q2.x = -sa * 6; q2.y = -2.5; });   // (lejos: nadie bloquea)
  P.hook(att, Ti, (g, S) => {
    const p = humP(g, att); p.x = sa * 2; p.y = 0;
    contact(g, S, p, { x: x0, y: 0.5, z: z0, vx: -sa * vx, vy: 0, vz }, { touches, kind: touches >= 3 ? 'spike' : 'pass', hard: false });
    info.kh = g.fl.kh; info.khAt = g.fl.khAt;
  });
  const fin = finishRally(P, r0);
  info.fin = fin; info.P = P; info.att = att; info.rcv = rcv; info.r0 = r0;
  info.net = [0, 1].map(k => P.ev[k].filter(e => e.type === 'net').map(e => [e.o, e.tape ? 'cinta' : 'red']));
  info.netConf = [0, 1].map(k => confEv(P, k, 'net').length);
  // ¿el atacante tocó el balón después de la red? (golpes del atacante confirmados después del 'net')
  info.attAfter = (() => { const L = P.conf[att]; const i = L.findIndex(e => e.type === 'net'); return i < 0 ? -1 : L.slice(i).filter(e => e.type === 'hit' && e.team === att).length; })();
  info.pts = pts(P, 0);
  return info;
}
if (want(2) || want(3)) {
  console.log('== 2/3. cinta y red ==');
  const L = [], cases = [];
  if (want(2)) for (const seed of [1, 2, 3, 4, 5, 6]) cases.push(['2 cinta alta (pasa o vuelve)', 150, seed, 2.475, 3, 9]);
  if (want(2)) for (const seed of [1, 2]) cases.push(['2 cinta baja (vuelve)', 150, seed, 2.40, 1, 9]);
  if (want(3)) for (const seed of [1, 2, 3]) { cases.push(['3 red (vuelve, con toques) rtt 0', 0, seed, 1.95, 1, 7]); cases.push(['3 red (vuelve, con toques)', 150, seed, 1.95, 1, 7]); }
  if (want(3)) for (const seed of [1, 2]) cases.push(['3 red (vuelve, con toques) rtt 250', 250, seed, 1.95, 1, 7]);
  for (const [nm, rtt, seed, zc, touches, vx] of cases) {
    const x = netBall(rtt, seed, zc, touches, vx); if (!x) continue;
    const tag = nm + ' s' + seed;
    const R = agree(x.P, tag, x.r0);
    const nr = x.net[x.rcv].filter(n => n[0] === x.rcv), na = x.net[x.att].filter(n => n[0] === x.att);
    check(tag + ': la red la juzga el receptor (zona), un solo net en cada lado y confirmado una vez', x.kh >= 0 && nr.length === 1 && na.length === 0 && x.net[x.att].length === 1 && x.netConf.join() === '1,1',
      { kh: x.kh, net: x.net, conf: x.netConf });
    check(tag + ': sin bifurcaciones ni recuperaciones > 300 ms', R.forks.join() === '0,0' && R.late.join() === '0,0', { forks: R.forks, late: R.late, lateMaxMs: R.lateMaxMs, hand: R.hand });
    console.log('       (' + tag + ': ' + JSON.stringify(nr) + ', golpes del atacante tras la red ' + x.attAfter + ', punto ' + x.pts.join(' ') + ', traspasos ' + R.hand.join('/') + ')');
    showFeel(x.P, tag);
    L.push({ nm, seed, net: nr, attAfter: x.attAfter, pts: x.pts, hand: R.hand, lateMaxMs: R.lateMaxMs });
  }
  OUT.net = L;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// 3b. Balón a la red que vuelve y el atacante lo juega (con toques): en cuanto su máquina recupera el balón, su humano golpea
// ---------------------------------------------------------------------------------------------------------------------------------
if (want('3b')) {
  console.log('== 3b. balón a la red que vuelve: el atacante aún lo juega ==');
  for (const rtt of [0, 150, 250]) for (const seed of [1, 2]) {
    const X = setup({ rtt, seed, tag: 'red3b' }); if (!X) continue;
    const { P, att, rcv, sa, T0, r0 } = X, Ti = T0 + 70, tag = '3b red y lo juega el atacante rtt ' + rtt + ' s' + seed;
    const S0 = P.V[att].Sim, x0 = sa * 1.6, z0 = 2.9, vz = vzFor(S0, x0, z0, -sa * 7, 1.95);
    P.hook(rcv, Ti, (g) => { const q = humP(g, rcv), q2 = mate(g, rcv, q); q.x = -sa * 6; q.y = 2.5; q2.x = -sa * 6; q2.y = -2.5; });
    P.hook(att, Ti, (g, S) => { const p = humP(g, att); p.x = sa * 2; p.y = 0; contact(g, S, p, { x: x0, y: 0.5, z: z0, vx: -sa * 7, vy: 0, vz }, { touches: 1, kind: 'pass' }); });
    let det = null, played = null;
    P.run(() => {
      const g = P.sess[att].g, F = g.fl;
      if (!det && g.mode === 'rally' && g.netSince && F.own === att && F.loc[att]) {
        det = { T: P.sess[att].T, z: +g.ball.z.toFixed(2), x: +g.ball.x.toFixed(2) };
        P.hook(att, det.T + 1, (g2, S) => {
          const p = mate(g2, att, humP(g2, att)), b = g2.ball, s0 = g2.fl.seq, t0 = g2.touches;   // (el compañero: el primer toque fue del humano)
          g2.time = g2.fl.T * STEP; g2.fl.hs = 2 * g2.fl.T - 1;
          p.x = b.x + sa * 0.25; p.y = b.y; p.z = 0; p.vz = 0; p.down = 0;
          S._hit(g2, p, null, 0, '', null);
          played = { seq: [s0, g2.fl.seq], touches: [t0, g2.touches], z: +b.z.toFixed(2), mode: g2.mode };
        });
      }
      return P.sess[0].g.fl.r > r0 && P.sess[1].g.fl.r > r0;
    }, 90000);
    P.run(800);
    const R = agree(P, tag, r0);
    const tn = P.ctl[rcv].find(m => m.k === 'tc' && m.kind === 'net');
    const delayMs = tn && det ? Math.round((det.T - (tn.T + (tn.h + 1) / 2)) * STEP_MS) : -1;
    check(tag + ': el balón vuelve al atacante y su toque vale (con toques)', !!det && !!played && played.seq[1] === played.seq[0] + 1 && played.touches[1] === 2,
      { recupera: det, toque: played, msTrasLaRed: delayMs });
    console.log('       (' + tag + ': el atacante recupera el balón ' + delayMs + ' ms después del toque en la red, a ' + (det ? det.z : '?') + ' m de altura)');
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// 4. Colocación lenta a 0,4 m con toques: el atacante remata antes del traspaso (vale); después del traspaso, su golpe no vale
// ---------------------------------------------------------------------------------------------------------------------------------
if (want(4)) {
  console.log('== 4. colocación lenta a 0,4 m con toques ==');
  for (const rtt of [150]) for (const seed of [1, 2, 3]) for (const late of [false, true]) {
    const X = setup({ rtt, seed, tag: 'colocación' }); if (!X) continue;
    const { P, att, rcv, sa, T0, r0 } = X, Ti = T0 + 70, tag = '4 colocación lenta a 0,4 m s' + seed + (late ? ' (golpe tras el traspaso)' : ' (remate antes del traspaso)');
    const info = {};
    P.hook(att, Ti, (g, S) => {
      const p = humP(g, att), st = mate(g, att, p);
      st.x = sa * 1.0; st.y = 0.3;
      contact(g, S, st, { x: sa * 0.4, y: 0.3, z: 2.6, vx: -sa * 0.6, vy: 0, vz: 3.0 }, { touches: 2, kind: 'set' });
      info.kh = g.fl.kh; info.khAt = g.fl.khAt;
      const Th = Math.floor(g.fl.khAt / 2), Thit = late ? Th + 3 : Th - 6;
      info.Thit = Thit; info.Th = Th;
      P.hook(att, Thit, (g2, S2) => {
        const b = g2.ball, s0 = g2.fl.seq;
        g2.time = g2.fl.T * STEP; g2.fl.hs = 2 * g2.fl.T - 1;
        p.x = b.x + sa * 0.15; p.y = b.y; p.z = Math.max(0.5, b.z - 2.3); p.vz = 0.5; p.onGround = false; p.down = 0;
        S2._hit(g2, p, null, 0, '', null);
        info.hit = { own: g2.fl.own, seq: [s0, g2.fl.seq], x: +b.x.toFixed(3), z: +b.z.toFixed(2), kind: g2.lastKind, kh: g2.fl.kh };
      });
    });
    finishRally(P, r0);
    const R = agree(P, tag, r0);
    if (!late) check(tag + ': el remate vale (balón aún del atacante, a más de 0,25 m) y cruza', !!info.hit && info.hit.seq[1] === info.hit.seq[0] + 1 && Math.abs(info.hit.x) > 0.25 && info.kh > 0, info);
    else check(tag + ': tras el traspaso el balón ya no es del atacante: su golpe no vale (diseño, spec «Preguntas»)', !!info.hit && info.hit.seq[1] === info.hit.seq[0] && info.hit.own === rcv, info);
    console.log('       (' + tag + ': kh ' + info.kh + ', traspaso a ' + (info.kh / 240 * 1000).toFixed(0) + ' ms del toque; golpe ' + JSON.stringify(info.hit) + ', puntos ' + pts(P, 0).join(' ') + ')');
    showFeel(P, tag);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// 5. Toque de red del bloqueador sin el balón: fq al dueño → exactamente un punto (del atacante, 'net')
//    5b: el fq cruza el traspaso (el dueño ya no lo es: fx) y el bloqueador lo pita en su máquina
//    5c: el fq cruza el traspaso y el balón vuelve al atacante antes del fx (remate a la red)
// ---------------------------------------------------------------------------------------------------------------------------------
function netTouch(rtt, seed, variant) {
  const X = setup({ rtt, seed, tag: 'fq' }); if (!X) return null;
  const { P, att, rcv, sa, T0, r0 } = X, Ti = T0 + 70, info = { variant };
  P.hook(att, Ti, (g, S) => {
    const p = humP(g, att), st = mate(g, att, p);
    contact(g, S, st, { x: sa * 2.5, y: 0.3, z: 3.0, vx: -sa * 0.8, vy: 0, vz: 3.5 }, { touches: 2, kind: 'set' });   // (se queda en su campo)
  });
  const Ti2 = Ti + 40;
  if (variant !== 'a') {
    P.hook(att, Ti2, (g, S) => {
      const p = humP(g, att); p.x = sa * 0.6; p.y = -1.6; p.z = 0.9; p.vz = 0;
      const ball = variant === 'b' ? { x: sa * 0.5, y: -1.6, z: 3.2, vx: -sa * 14, vy: 0, vz: -2 } : { x: sa * 0.5, y: -1.6, z: 3.0, vx: -sa * 10, vy: 0, vz: -24 };
      if (g.fl.own !== att) { info.skip = 'el balón ya no era del atacante'; return; }
      contact(g, S, p, ball, { touches: 3, kind: 'spike', hard: true });
      info.kh = g.fl.kh;
    });
  }
  const Tj = variant === 'a' ? Ti + 20 : Ti2 + 1;
  P.hook(rcv, Tj, (g, S) => {
    const q = humP(g, rcv), q2 = mate(g, rcv, q);
    q.x = -sa * 0.25; q.y = 0.8; q.z = 0; q.vz = 0; q.vx = q.vy = 0; q.down = 0; q2.x = -sa * 7; q2.y = 3;
    S._jump(g, q, 0, 0); info.q = q.id; info.jumpOwn = g.fl.own;
  });
  finishRally(P, r0);
  info.P = P; info.att = att; info.rcv = rcv; info.r0 = r0;
  info.fq = P.ctl[rcv].filter(m => m.k === 'fq').length; info.fx = P.ctl[att].filter(m => m.k === 'fx').length;
  info.ptMsgs = [P.ctl[0].filter(m => m.k === 'pt' && m.r === r0).map(m => m.w + '/' + m.reason), P.ctl[1].filter(m => m.k === 'pt' && m.r === r0).map(m => m.w + '/' + m.reason)];
  info.netTouch = P.ev[rcv].filter(e => e.type === 'netTouch' && e.o === rcv).length;
  info.pts = pts(P, 0);
  return info;
}
if (want(5)) {
  console.log('== 5. toque de red del bloqueador sin el balón (fq) ==');
  for (const variant of ['a', 'b', 'c']) for (const rtt of [150]) for (const seed of [1, 2, 3]) {
    const x = netTouch(rtt, seed, variant); if (!x) continue;
    const tag = '5' + (variant === 'a' ? '' : variant) + ' toque de red ' + (variant === 'a' ? 'con el balón del atacante' : variant === 'b' ? 'que cruza el traspaso (fx)' : 'y el remate vuelve de la red antes del fx') + ' s' + seed;
    if (x.skip) { warn(tag + ': no se pudo preparar', x.skip); continue; }
    const R = agree(x.P, tag, x.r0);
    const allPts = x.ptMsgs[0].concat(x.ptMsgs[1]);
    // 5c: el dueño ya dio su punto (el remate cae) antes de saber del fx; el que tenía el fx pita la falta (anterior) y el otro deshace
    // el suyo (gana lo anterior): dos pt en el cable, uno solo confirmado
    const ptOk = variant === 'c' ? (allPts.length === 1 || (allPts.length === 2 && allPts.indexOf(x.att + '/net') >= 0)) : allPts.length === 1;
    check(tag + ': un solo netTouch y una sola fq; ' + (variant === 'c' ? 'un pt del rally (o dos si se cruzan, uno de ellos la red)' : 'exactamente UN pt del rally (de una sola máquina)'), x.netTouch === 1 && x.fq === 1 && ptOk, { netTouch: x.netTouch, fq: x.fq, fx: x.fx, pt: x.ptMsgs });
    // el toque de red fue lo primero: punto del atacante por la red (regla 11.3)
    const ptWin = variant === 'c' ? x.pts.length === 1 && String(x.pts[0]).indexOf(x.att + '/net/') === 0 : allPts.length === 1 && allPts[0] === x.att + '/net';
    check(tag + ': el punto es del atacante por el toque de red (lo primero que pasó)', ptWin, { pt: x.ptMsgs, puntos: x.pts, kh: x.kh, fx: x.fx, fqOk: R.fqOk });
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// 6/7. Bifurcación forzada (RTT 300): el compañero del dueño toca justo antes de khAt; la otra máquina ya cambió de dueño y toca
//      después. Gana el contacto anterior (el del dueño viejo). 7: la rama perdedora acaba con un punto que cierra el set (al mejor
//      de 3) o el partido (al mejor de 1) y hay que deshacerlo.
// ---------------------------------------------------------------------------------------------------------------------------------
function fork(rtt, seed, opt) {
  opt = opt || {};
  const X = setup({ rtt, seed, tag: 'bifurcación', bestOf: opt.bestOf || 1, points: 11 }); if (!X) return null;
  const { P, att, rcv, sa, T0, r0 } = X, Ti = T0 + 70, info = { opt };
  const sc = opt.scoreFor === 'rcv' ? (rcv === 0 ? [10, 5] : [5, 10]) : opt.score;
  if (sc) for (const k of [0, 1]) P.hook(k, T0 + 8, (g, S, sess) => {
    const blk = S.flMatch(g); blk.score = sc.slice(); S.flMatch(g, blk); sess.pre = S.flMatch(g);
  });
  P.hook(att, Ti, (g, S) => {
    const p = humP(g, att), st = mate(g, att, p);
    contact(g, S, p, { x: sa * 3.0, y: 0.3, z: 2.5, vx: -sa * 4, vy: 0, vz: 4.0 }, { touches: 1, kind: 'pass' });
    info.khAt = g.fl.khAt; const Th = Math.floor(g.fl.khAt / 2); info.Th = Th;
    P.hook(att, Th - 2, (g2, S2) => {     // el compañero del dueño, justo antes del traspaso
      const b = g2.ball; info.aOwn = g2.fl.own;
      if (g2.fl.own !== att) { info.skip = 'el dueño ya no lo era'; return; }
      contact(g2, S2, st, { x: b.x, y: b.y, z: b.z, vx: sa * 1.5, vy: 0, vz: 3.0 }, { touches: 2, kind: 'set' });
      info.aSeq = g2.fl.seq; info.aKh = g2.fl.kh;
    });
    P.hook(rcv, Th + 3, (g2, S2, sess) => {   // el otro, ya dueño en su máquina (traspaso viejo), toca después
      const b = g2.ball, q = humP(g2, rcv); info.bOwn = g2.fl.own;
      if (g2.fl.own !== rcv) { info.skip = 'el traspaso no llegó en la otra máquina'; return; }
      q.x = b.x - sa * 0.3; q.y = b.y;
      contact(g2, S2, q, { x: b.x, y: b.y, z: b.z, vx: sa * 6, vy: 0, vz: 2.0 }, { touches: 1, kind: 'pass' });
      info.bSeq = g2.fl.seq;
      if (opt.branchPoint) { S2._fault(g2, att, 'out', 'Fuera', null); info.bPoint = { r: g2.fl.r, score: g2.score.join('-'), mode: g2.mode, sets: g2.sets.join('-'), pendingSet: g2.pendingSet }; }
    });
  });
  finishRally(P, r0);
  P.run(1500);
  info.P = P; info.att = att; info.rcv = rcv; info.r0 = r0;
  return info;
}
if (want(6)) {
  console.log('== 6. bifurcación forzada con RTT 300 ==');
  for (const seed of [1, 2, 3]) {
    const x = fork(300, seed); if (!x) continue;
    const tag = '6 bifurcación rtt 300 s' + seed;
    if (x.skip) { check(tag + ': se pudo preparar', false, x); continue; }
    const R = agree(x.P, tag, x.r0);
    const A = x.P.sess[x.att], B = x.P.sess[x.rcv];
    check(tag + ': hay bifurcación y la gana el dueño viejo (la otra máquina la pierde; su tc se rechaza)', B.flStats.forks >= 1 && A.flStats.stale + A.flStats.dropped >= 1, { forks: R.forks, stale: R.stale, dropped: R.dropped, info: { Th: x.Th, aKh: x.aKh } });
    // el toque perdido no cuenta en las estadísticas confirmadas de la máquina que lo hizo
    const lost = x.P.conf[x.rcv].filter(e => e.type === 'hit' && e.o === x.rcv && e.tick >= x.Th && e.tick <= x.Th + 40);
    check(tag + ': el toque de la rama perdida no queda en los confirmados de quien lo hizo', lost.length === 0, { fantasma: lost.map(e => [e.pid, e.tick]) });
    const miss = x.P.ev[x.rcv].filter(e => e.type === 'miss' && e.o === x.rcv).length;
    if (!miss) warn(tag + ': la máquina que pierde la bifurcación no pinta un «miss» en su jugador (spec §4.3)');
  }
}
if (want(7)) {
  console.log('== 7. bifurcación tras un punto que cierra el set / el partido ==');
  for (const [bo, nm] of [[3, 'set'], [1, 'partido']]) for (const seed of [1, 2]) {
    const x = fork(300, seed, { bestOf: bo, score: null, branchPoint: true, scoreFor: 'rcv' });
    if (!x) continue;
    // (el marcador: el receptor a 10; se pone por equipo cuando se sabe quién saca)
    const tag = '7 bifurcación con punto que cierra el ' + nm + ' s' + seed;
    if (x.skip) { check(tag + ': se pudo preparar', false, x); continue; }
    const R = agree(x.P, tag, x.r0);
    const A = x.P.sess[x.att], B = x.P.sess[x.rcv];
    check(tag + ': el punto de la rama perdida se deshace (sin final ni set de más) y el rally sigue con el balón del dueño viejo',
      !!x.bPoint && B.flStats.forks >= 1 && JSON.stringify(A.g.setScores) === JSON.stringify(B.g.setScores),
      { ramaPerdida: x.bPoint, forks: R.forks, rb: R.rb, sets: [A.g.sets.join('-'), B.g.sets.join('-')], status: [A.status, B.status], fin: [A.result, B.result] });
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// 8. fq durante el saque del rival (el saque en vuelo, aún del sacador): punto del sacador por la red, uno solo
// ---------------------------------------------------------------------------------------------------------------------------------
if (want(8)) {
  console.log('== 8. toque de red del receptor durante el saque rival ==');
  for (const rtt of [60, 150, 250]) for (const seed of [1, 2]) {
    const X = setup({ rtt, seed, tag: 'fq saque' }); if (!X) continue;
    const { P, att, rcv, sa, T0, r0 } = X, Ti = T0 + 70, tag = '8 toque de red durante el saque rtt ' + rtt + ' s' + seed;
    const info = {};
    P.hook(att, Ti, (g, S) => { const sv = g.server; contact(g, S, sv, { x: sa * 9, y: 0.5, z: 2.8, vx: -sa * 16, vy: 0, vz: 1.5 }, { touches: 3, kind: 'serve', prevKind: '' }); info.kh = g.fl.kh; });
    P.hook(rcv, Ti + Math.ceil(rtt / 2 / STEP_MS) + 6, (g, S) => {
      const q = humP(g, rcv); info.mode = g.mode; info.own = g.fl.own;
      q.x = -sa * 0.25; q.y = 0.3; q.z = 0; q.vz = 0; q.vx = q.vy = 0; q.down = 0; S._jump(g, q, 0, 0);
    });
    finishRally(P, r0);
    const R = agree(P, tag, r0);
    const allPts = P.ctl[0].concat(P.ctl[1]).filter(m => m.k === 'pt' && m.r === r0).map(m => m.w + '/' + m.reason);
    check(tag + ': una fq y un solo punto, del sacador por la red', P.ctl[rcv].filter(m => m.k === 'fq').length === 1 && allPts.length === 1 && allPts[0] === att + '/net',
      { pt: allPts, fq: R.fq, fqOk: R.fqOk, info });
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// 9. Punto del dueño justo ANTES del traspaso (falta de red de su propio jugador) y contacto del otro (la red) justo DESPUÉS, antes
//    de que le llegue el pt. El punto es lo primero que pasó: debe valer, sin silbato retirado ni bifurcación.
// ---------------------------------------------------------------------------------------------------------------------------------
if (want(9)) {
  console.log('== 9. punto del dueño antes del traspaso y contacto del otro después ==');
  for (const rtt of [150, 250]) for (const seed of [1, 2]) {
    const X = setup({ rtt, seed, tag: 'punto y traspaso' }); if (!X) continue;
    const { P, att, rcv, sa, T0, r0 } = X, Ti = T0 + 70, tag = '9 punto del dueño antes del traspaso rtt ' + rtt + ' s' + seed, info = {};
    const S0 = P.V[att].Sim, x0 = sa * 2.0, z0 = 3.0, vz = vzFor(S0, x0, z0, -sa * 14, 2.0);
    P.hook(rcv, Ti, (g) => { const q = humP(g, rcv), q2 = mate(g, rcv, q); q.x = -sa * 6; q.y = 2.5; q2.x = -sa * 6; q2.y = -2.5; });
    P.hook(att, Ti, (g, S) => {
      const p = humP(g, att), st = mate(g, att, p);
      contact(g, S, p, { x: x0, y: 0.5, z: z0, vx: -sa * 14, vy: 0, vz }, { touches: 3, kind: 'spike', hard: true });
      info.kh = g.fl.kh; const Th = Math.floor(g.fl.khAt / 2); info.Th = Th;
      P.hook(att, Th - 2, (g2, S2) => {   // su compañero toca la red (falta local del dueño): punto del otro
        info.own = g2.fl.own; if (g2.fl.own !== att) return;
        g2.time = g2.fl.T * STEP;
        S2._emit(g2, { type: 'netTouch', player: st, x: st.x, y: st.y, z: 2.4 });
        S2._fault(g2, att, 'net', 'Toque de red', st); info.pt = { T: g2.fl.T, r: g2.fl.r };
      });
    });
    finishRally(P, r0);
    const R = agree(P, tag, r0);
    const undone = P.msgs.filter(m => /no vale/.test(m)).length;
    const pts0 = P.ctl[att].filter(m => m.k === 'pt' && m.r === r0).map(m => m.w + '/' + m.reason), pts1 = P.ctl[rcv].filter(m => m.k === 'pt' && m.r === r0).map(m => m.w + '/' + m.reason);
    const netTc = P.ctl[rcv].filter(m => m.k === 'tc' && m.r === r0 && (m.kind === 'net' || m.kind === 'tape')).map(m => m.T);
    check(tag + ': vale el punto del dueño (falta de red, ' + rcv + '/net), sin deshacerlo ni rechazarlo', pts(P, 0).length >= 1 && pts(P, 0)[0].indexOf(rcv + '/net/') === 0 && !undone && R.rb.join() === '0,0' && R.forks.join() === '0,0',
      { puntos: pts(P, 0), ptDelDueño: pts0, ptDelOtro: pts1, redDelOtroEnT: netTc, info, deshecho: undone, rb: R.rb, forks: R.forks });
  }
}

console.log('\n' + oks + ' ok, ' + fails + ' fallos, ' + warns + ' avisos');
if (ISSUES.length) console.log('fallos:\n  ' + ISSUES.join('\n  '));
try { fs.mkdirSync(path.join(ROOT, 'tools/out'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'tools/out/fluid-scen.json'), JSON.stringify({ OUT, issues: ISSUES }, null, 1)); } catch (e) { }
process.exit(fails ? 1 : 0);
