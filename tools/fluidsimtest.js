#!/usr/bin/env node
/* MAKE THE CUT — tools/fluidsimtest.js  (owner: sim)
 * Online V2 «Fluida», paquete WP1 (notes/online-v2-spec.md §2 y «Work packages»): los ganchos de js/sim.js detrás de g.fl y la
 * API VB.Sim.fl*, a nivel de sim (sin red). Secciones:
 *   (a) createGame sin flInit no tiene 'fl' (ni offline ni online) y step() no lo crea.
 *   (b) Vuelo: 5000 lanzamientos al azar; stepBall con reglas (dueño, sin jugadores a tiro), flGhost y flFly bit a bit iguales hasta
 *       el primer evento de reglas; el kh de flKh = el primer medio paso en que flOwnerCheck da el traspaso.
 *   (c) Tabla de flKh: saque, remate, colocación lenta a 1 m con toques (no se traspasa antes de 0,25 m), 3r toque a 0,5 m,
 *       rebote del bloqueo, balón que vuelve de la red y balón que cae en el propio campo (kh = -1).
 *   (d) flApplyTc con recuperación y rewind: mismo bloqueo (resultado, bloqueador y azar) que con el tc a tiempo, con 6, 12 y 24 tics
 *       de retraso.
 *   (e) flApplyPt: 2000 puntos grabados (partidos IA contra IA en solitario, flTake) aplicados en otra partida → mismo marcador
 *       (flDigest), mismos eventos del punto (point, whistle, sideout, set, match, courtChange) y mismo lastPoint.how.
 *   (f) Autocomprobación de los ganchos: cada línea nueva dentro de una función que ya existía lleva 'g.fl' (marcadas «// fl» o
 *       /*fl*\/…/*lf*\/), nada nuevo en createGame ni en mkPlayer, y sim.js sin los ganchos ni el bloque FLUIDA es exactamente el de
 *       antes (huella SIM_BASE; si sim.js cambia por otra cosa, se actualiza con --rehash tras comprobar la huella 2v2).
 *   (g) Humo: dos máquinas Fluida con enlace ideal (los mensajes llegan en el mismo tic) juegan un partido entero: mismo marcador
 *       en cada punto, traspasos, la guarda de point() a 0 y flPose lanza con un equipo local.
 * Uso: node tools/fluidsimtest.js [--quick] [--rehash]
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const QUICK = process.argv.includes('--quick');
const SIM_SRC = fs.readFileSync(path.join(ROOT, 'js/sim.js'), 'utf8');
function load() {
  const ctx = { console, Math, Date }; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/netview.js']) vm.runInContext(f === 'js/sim.js' ? SIM_SRC : fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.VB;
}
const VB = load(), S = VB.Sim, C = { BR: 0.21 }, STEP = 1 / 120, DH = STEP / 2;
let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
}
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ONL = (seed, o) => Object.assign({ online: true, seed: seed, venue: 'hall', humans: [{}, {}] }, o || {});
const FREF = { d1: 0, p1: 0, d2: 0, p2: 0, d3: 0, p3: 0, chal: 0 };
const BK = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'spin'];
function setBall(g, o) { const b = g.ball; b.held = null; b.x = o.x; b.y = o.y; b.z = o.z; b.vx = o.vx; b.vy = o.vy; b.vz = o.vz; b.spin = o.spin || 0; b.dip = o.dip || 0; b.wobA = o.wobA || 0; b.wobF = o.wobF || 0; b.wobP = o.wobP || 0; b.speed = Math.hypot(o.vx, o.vy, o.vz); }
function sameBall(a, b) { for (const k of BK) if (a[k] !== b[k]) return k; return null; }

// ---------------------------------------------------------------------------------------------------------------------------------
console.log('== (a) sin flInit no hay g.fl ==');
{
  const g0 = S.createGame({ seed: 5 }), g1 = S.createGame(ONL(5));
  check("createGame offline y online sin 'fl'", !('fl' in g0) && !('fl' in g1));
  for (let i = 0; i < 1200; i++) { S.step(g0, STEP, { move: [0, 0] }); S.step(g1, STEP, [{ move: [0, 0] }, { move: [0, 0] }]); }
  check("tras 10 s de step() sigue sin 'fl' (y sin los campos de flInit)", !('fl' in g0) && !('fl' in g1) && g0.fl === undefined && g1.fl === undefined);
  const k0 = Object.keys(S.createGame({ seed: 5 })).length, p0 = Object.keys(S.createGame({ seed: 5 }).players[0]).length;
  check('mismas claves en g y en el jugador que una partida nueva', Object.keys(g0).length === k0 && Object.keys(g0.players[0]).length === p0, { g: k0, p: p0 });
}

// ---------------------------------------------------------------------------------------------------------------------------------
console.log('== (b) vuelo: stepBall con reglas = flGhost = flFly, y kh = primer medio paso en la zona ==');
{
  const N = QUICK ? 800 : 5000, R = mulberry(77);
  const g = S.createGame(ONL(11)), h = S.createGame(ONL(11));
  S.flInit(g, 0); S.flInit(h, 1);
  for (const p of g.players) { p.x = (p.team ? -1 : 1) * 10.8; p.y = p.idx ? 5.8 : -5.8; p.z = 0; p.vz = 0; p.down = 1e9; }
  let bad = 0, badKh = 0, halfs = 0, firstBad = null, wob = 0, zone = 0;
  for (let n = 0; n < N; n++) {
    const o = { x: 0.6 + R() * 8, y: (R() - 0.5) * 8, z: 0.4 + R() * 3.8, vx: -25 + R() * 28, vy: (R() - 0.5) * 8, vz: -8 + R() * 16,
      dip: R() < 0.4 ? R() * 4 : 0, wobA: 0, wobF: 0, wobP: 0, spin: R() * 10 };
    if (R() < 0.35) { o.wobA = 2 + R() * 6; o.wobF = 3.6 + R() * 2; o.wobP = R() < 0.5 ? -1 : 1; wob++; }
    const age0 = R() < 0.5 ? 0 : R() * 1.2, touches = R() < 0.5 ? 1 : 3;
    setBall(g, o); setBall(h, o);
    g.mode = 'rally'; g.touchTeam = 0; g.touches = touches; g.lastTeam = 0; g.lastKind = 'pass'; g.atkServe = null; g.blockCD = 0; g.events.length = 0;
    g.fl.own = 0; g.fl.bAge = age0; g.fl.frozen = false; g.fl.dh = DH; g.fl.cFull = false; g.fl.khAt = -1;
    h.mode = 'rally'; h.fl.own = 0; h.fl.bAge = age0; h.fl.frozen = false;
    const kh = S._flKh(g);
    // kh esperado: el primer k (0 = el estado del contacto) con flOwnerCheck = el otro equipo; -1 si antes toca el suelo
    let exp = -1; const sc = S.flFly(g.ball, age0, 0, DH, {});
    if (S.flOwnerCheck(sc, 0, touches < 3) === 1) exp = 0;
    else for (let k = 1; k <= 960; k++) {
      S.flFly(sc, sc.age, 1, DH, sc);
      if (sc.z <= C.BR) break;
      if (S.flOwnerCheck(sc, 0, touches < 3) === 1) { exp = k; break; }
    }
    if (kh !== exp) { badKh++; if (badKh < 4) console.log('    kh', kh, 'esperado', exp, JSON.stringify(o)); }
    if (kh >= 0) zone++;
    const fb = S.flFly(g.ball, age0, 0, DH, {}), whole = { b: Object.assign({}, g.ball), age: age0 };
    let k;
    for (k = 1; k <= 960; k++) {
      S._stepBall(g, DH); S._flGhost(h, DH); S.flFly(fb, fb.age, 1, DH, fb);
      if (g.events.length || g.mode !== 'rally') break;            // primer evento de reglas (red, antena, bote...)
      halfs++;
      const d1 = sameBall(g.ball, h.ball), d2 = sameBall(g.ball, fb);
      if (d1 || d2 || g.fl.bAge !== h.fl.bAge || g.fl.bAge !== fb.age) { bad++; if (!firstBad) firstBad = { n: n, k: k, campo: d1 || d2 || 'bAge' }; break; }
    }
    if (!bad && k > 2) { // flFly de una vez = paso a paso
      const one = S.flFly(whole.b, whole.age, k - 1, DH, {});
      const d3 = sameBall(one, g.ball); if (d3 && !(g.events.length || g.mode !== 'rally')) { bad++; if (!firstBad) firstBad = { n: n, k: k, campo: 'flFly de una vez: ' + d3 }; }
    }
  }
  check('stepBall (dueño) = flGhost = flFly bit a bit hasta el primer evento de reglas', bad === 0, { lanzamientos: N, mediosPasos: halfs, flotantes: wob, primerFallo: firstBad });
  check('kh de flKh = primer medio paso con flOwnerCheck en la zona (o -1 si cae antes)', badKh === 0, { conTraspaso: zone, mal: badKh });
}

// ---------------------------------------------------------------------------------------------------------------------------------
console.log('== (c) tabla de flKh ==');
{
  const g = S.createGame(ONL(12)); S.flInit(g, 0); g.mode = 'rally'; g.fl.dh = DH;
  // devuelve {kh, x (al traspasar), xPrev (medio paso antes)} con el dueño own
  function khOf(own, o, touchTeam, touches, full) {
    setBall(g, o); g.fl.own = own; g.fl.bAge = 0; g.fl.cFull = !!full; g.touchTeam = touchTeam; g.touches = touches;
    const kh = S._flKh(g);
    let st = null, prev = null;
    if (kh >= 0) {
      if (full && kh >= 2) { prev = S.flFly(g.ball, 0, 1, 2 * DH, {}); st = S.flFly(prev, prev.age, kh - 2, DH, {}); if (kh > 2) prev = S.flFly(prev, prev.age, kh - 3, DH, {}); }
      else { st = S.flFly(g.ball, 0, kh, DH, {}); prev = kh ? S.flFly(g.ball, 0, kh - 1, DH, {}) : null; }
    }
    return { kh: kh, x: st ? st.x : NaN, vx: st ? st.vx : NaN, xPrev: prev ? prev.x : NaN };
  }
  const L = (vx, more) => more ? Math.min(0.6, Math.max(0.25, 0.12 * Math.abs(vx))) : 0.6;
  let r = khOf(0, { x: 9.5, y: -1.5, z: 2.9, vx: -16, vy: 0.5, vz: 2.5 }, 0, 3, true);
  check('saque (paso entero al principio): traspaso al entrar en 0,6 m', r.kh > 2 && Math.abs(r.x) <= 0.6 && Math.abs(r.xPrev) > 0.6, r);
  r = khOf(0, { x: 2.2, y: 0.4, z: 3.1, vx: -18, vy: 0, vz: -3 }, 0, 3);
  check('remate (3r toque): traspaso al entrar en 0,6 m', r.kh > 0 && Math.abs(r.x) <= 0.6 && Math.abs(r.xPrev) > 0.6, r);
  r = khOf(0, { x: 1.0, y: 0, z: 2.6, vx: -1.0, vy: 0, vz: 3.5 }, 0, 1);
  check('colocación lenta a 1 m con toques: no se traspasa antes de 0,25 m', r.kh > 0 && Math.abs(r.x) <= L(r.vx, true) + 1e-12 && Math.abs(r.x) <= 0.25 + 1e-12 && Math.abs(r.xPrev) > 0.25, r);
  r = khOf(1, { x: -1.0, y: 0, z: 2.6, vx: 1.0, vy: 0, vz: 3.5 }, 1, 2);
  check('lo mismo para el equipo 1 (espejo)', r.kh > 0 && Math.abs(r.x) <= 0.25 + 1e-12 && Math.abs(r.xPrev) > 0.25, r);
  r = khOf(0, { x: 0.5, y: 0, z: 3.0, vx: -2.0, vy: 0, vz: 1 }, 0, 3);
  check('3r toque a 0,5 m: ya en la zona (kh = 0)', r.kh === 0, r);
  r = khOf(0, { x: 0.5, y: 0, z: 3.0, vx: -2.0, vy: 0, vz: 1 }, 0, 1);
  check('el mismo balón con toques: aún del atacante (kh > 0, a <= 0,25 m)', r.kh > 0 && Math.abs(r.x) <= 0.25 + 1e-12, r);
  r = khOf(1, { x: 0.25, y: 0.2, z: 2.5, vx: 3.0, vy: 0, vz: -7 }, 1, 0);
  check('bloqueo directo del equipo 1 (balón al campo del atacante): kh = 0', r.kh === 0, r);
  r = khOf(1, { x: -0.3, y: 0.2, z: 2.6, vx: -2.5, vy: 0.3, vz: 3 }, 1, 0);
  check('bloqueo amortiguado (se queda en el campo del bloqueador): kh = -1', r.kh === -1, r);
  r = khOf(1, { x: 0.21, y: 1, z: 2.2, vx: 4, vy: 0, vz: -1 }, 0, 3);
  check('balón que vuelve de la red (lo resolvió el equipo 1): vuelve al instante (kh = 0)', r.kh === 0, r);
  r = khOf(0, { x: 4, y: 1, z: 2, vx: 2, vy: 0, vz: 1 }, 0, 1);
  check('balón que cae en el propio campo: kh = -1', r.kh === -1, r);
}

// ---------------------------------------------------------------------------------------------------------------------------------
console.log('== (d) flApplyTc con retraso y rewind: el mismo bloqueo que a tiempo ==');
{
  const cT = 1000;
  // máquina A (equipo 0): remate del 3r toque con contacto en la fase de jugadores del tic cT
  const gA = S.createGame(ONL(21)); S.flInit(gA, 0);
  gA.mode = 'rally'; gA.fl.T = cT; gA.fl.hs = 2 * cT - 1; gA.time = cT * STEP; gA.fl.dh = DH; gA.fl.own = 0;
  setBall(gA, { x: 2.0, y: 0.3, z: 2.95, vx: -14, vy: 0, vz: -2 });
  gA.touchTeam = 0; gA.touches = 3; gA.lastKind = 'spike'; gA.lastTeam = 0; gA.lastPlayer = gA.teams[0][0]; gA.lastShot = ''; gA.atkServe = null;
  gA.lastTouchT = gA.time; gA.blockCD = 0;
  S._flContact(gA, 'hit');
  const tc = JSON.parse(JSON.stringify(gA.fl.tc));
  check('el tc del remate lleva el traspaso (kh >= 0, khAt = hs + 1 + kh)', tc.kh >= 0 && tc.khAt === 2 * cT - 1 + 1 + tc.kh && tc.own === 0 && tc.s === 1, { kh: tc.kh, khAt: tc.khAt });
  const KIN = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'onGround', 'pressEnd'];
  function runB(delay, rewindOn) {
    const g = S.createGame(ONL(21)); S.flInit(g, 1); g.fl.dh = DH;
    S.setSlotAI(g, 1, true);                       // bloqueo de la IA (con azar: g.rng)
    for (const p of g.teams[0]) { p.x = 7; p.y = p.idx ? 2 : -2; }
    const q = g.teams[1][0], q2 = g.teams[1][1];
    q.x = -0.45; q.y = 0.35; q.z = 0; q.vz = 0; q2.x = -7; q2.y = 0; q2.z = 0;
    g.mode = 'rally'; g.fl.own = 0; setBall(g, { x: 5, y: 0, z: C.BR, vx: 0, vy: 0, vz: 0 }); g.fl.frozen = true;
    g.touchTeam = 0; g.touches = 2; g.lastTeam = 0; g.lastKind = 'set';
    const ring = {}, ev = [];
    const rewind = (j) => { const r = ring[j >> 1]; if (!r) throw new Error('sin pose del tic ' + (j >> 1)); [q, q2].forEach((p, i) => KIN.forEach((k, n) => { p[k] = r[i][n]; })); };
    for (let t = cT - 10; t <= cT + 70; t++) {
      if (t === cT + delay) S.flApplyTc(g, JSON.parse(JSON.stringify(tc)), t - 1, rewindOn ? rewind : null);
      g.fl.T = t; g.time = t * STEP;
      if (t === cT - 5) S._jump(g, q, 0, 0);
      S._stepPlayer(g, q, STEP, 0, 0); S._stepPlayer(g, q2, STEP, 0, 0);
      ring[t] = [q, q2].map(p => KIN.map(k => p[k]));
      for (let s = 0; s < 2 && g.mode === 'rally'; s++) { g.fl.hs = 2 * t + s; S._flHand(g, g.fl.hs); if (g.fl.own === 1) S._stepBall(g, DH); else S._flGhost(g, DH); }
      for (const e of g.events) ev.push(e); g.events.length = 0;
    }
    const b = ev.find(e => e.type === 'block');
    return { block: b ? b.result : null, by: b ? b.player.id : -1, rng: g.rng.get(), hand: g.fl.hand, seq: g.fl.seq, x: +q.x.toFixed(6), z: +q.z.toFixed(6) };
  }
  const on = runB(0, true);
  check('a tiempo hay bloqueo (en la máquina del bloqueador, tras el traspaso)', !!on.block && on.hand >= 1, on);
  for (const d of [6, 12, 24]) {
    const r = runB(d, true);
    check('retraso ' + d + ' tics con rewind: mismo resultado, bloqueador y azar', r.block === on.block && r.by === on.by && r.rng === on.rng && r.seq === on.seq, r);
    check('retraso ' + d + ' tics: mi jugador vuelve a su pose presente', r.x === on.x && r.z === on.z, { x: r.x, z: r.z });
  }
  const off = runB(24, false);
  console.log('    (sin rewind, 24 tics: ' + JSON.stringify(off) + ')');
}

// ---------------------------------------------------------------------------------------------------------------------------------
console.log('== (e) flApplyPt: 2000 puntos aplicados en otra partida ==');
{
  const NPTS = QUICK ? 300 : 2000, AIIN = { move: [0, 0], ai: true };
  const TYPES = { point: 1, whistle: 1, sideout: 1, set: 1, match: 1, courtChange: 1 };
  function norm(e) {
    const o = {};
    for (const k of Object.keys(e).sort()) { if (k === 't') continue; const v = e[k]; o[k] = v && typeof v === 'object' && 'id' in v && 'team' in v ? 'p' + v.id : v; }
    return JSON.stringify(o);
  }
  let pts = 0, bad = 0, badEv = 0, badHow = 0, matches = 0, guard = 0, firstBad = null, seed = 100;
  const venues = ['hall', 'beach'];
  while (pts < NPTS) {
    // opciones que fuerza la sesión Fluida (spec §2.1): sin error arbitral ni challenges (un challenge anularía un punto ya enviado)
    const opts = ONL(seed, { points: [11, 15, 21][seed % 3], bestOf: seed % 2 ? 3 : 1, venue: venues[seed % 2], ref: FREF, timeouts: false, net: 'fluida' }); seed++;
    const P = S.createGame(opts), Q = S.createGame(opts);
    S.flInit(P, 0); S.flTake(P); S.setSlotAI(P, 0, true);
    S.flInit(Q, 1); Q.fl.loc[0] = Q.fl.loc[1] = false;     // el aplicador «sabe» las notas de todos (no juega)
    Q.events.length = 0;
    let steps = 0;
    while (pts < NPTS && !P.finished && steps < 120 * 3600) {
      S.step(P, STEP, [AIIN, AIIN]); steps++;
      const evP = P.events.filter(e => TYPES[e.type]).map(norm); P.events.length = 0;
      if (!P.fl.pts.length) continue;
      for (const pt of P.fl.pts) {
        if (Q.mode === 'point') S.flServe(Q, true);
        Q.events.length = 0;
        const m = JSON.parse(JSON.stringify({ r: pt.r, w: pt.w, reason: pt.reason, text: pt.text, pid: pt.pid, sig: pt.sig, m: pt.m, d: S.flDigest(P) }));
        const ok = S.flApplyPt(Q, m);
        const evQ = Q.events.filter(e => TYPES[e.type]).map(norm);
        pts++;
        if (ok !== true) { bad++; if (!firstBad) firstBad = { pt: pts, d: S.flDigest(Q), esperado: m.d }; }
        if (evQ.join('|') !== evP.join('|')) { badEv++; if (badEv < 3) console.log('    eventos distintos\n     P ' + evP.join('\n       ') + '\n     Q ' + evQ.join('\n       ')); }
        if (!Q.lastPoint || Q.lastPoint.how !== P.lastPoint.how || Q.lastPoint.landSide !== P.lastPoint.landSide) badHow++;
      }
      P.fl.pts.length = 0;
    }
    guard += P.fl.guard + Q.fl.guard; matches++;
  }
  check('mismo marcador (flDigest) tras cada punto aplicado', bad === 0, { puntos: pts, partidos: matches, primerFallo: firstBad });
  check('mismos eventos del punto (point, whistle, sideout, set, match, courtChange)', badEv === 0, { mal: badEv });
  check('mismo lastPoint.how y landSide', badHow === 0, { mal: badHow });
  check('la guarda de point() no salta', guard === 0, { guard: guard });
}

// ---------------------------------------------------------------------------------------------------------------------------------
console.log('== (f) autocomprobación de los ganchos en sim.js ==');
{
  // huella de js/sim.js SIN el bloque FLUIDA, sin las líneas «// fl» / «// fl-api» y sin los trozos /*fl*/…/*lf*/ (= el sim.js de antes)
  const SIM_BASE = '5f7d3c6e';   // (v1.12.0: salto con impulso sobre árbitros FIVB y pases de 1.10.1-1.11.0; huellas 2v2 y de maestría idénticas comprobadas)
  const L = SIM_SRC.replace(/\r\n/g, '\n').split('\n');
  const out = [], marked = [], inl = [], bad = [];
  let inB = false, blockLines = 0;
  // funciones que no pueden tener nada nuevo
  const ranges = {}; let cur = null;
  L.forEach((l, i) => { const m = /^  function (\w+)\(/.exec(l); if (m) { cur = m[1]; ranges[cur] = ranges[cur] || [i, i]; } if (cur) ranges[cur][1] = i; });
  L.forEach((l, i) => {
    if (l.indexOf('/* ==== FLUIDA (Online V2) ==== */') >= 0) { inB = true; return; }
    if (inB) { blockLines++; if (l.indexOf('/* ==== fin FLUIDA ==== */') >= 0) inB = false; return; }
    if (/\/\/ fl-api\s*$/.test(l)) return;
    if (/\/\/ fl\s*$/.test(l)) {
      marked.push(i + 1);
      if (!/^\s*if \(g\.fl[ )]/.test(l)) bad.push({ linea: i + 1, txt: l.trim().slice(0, 80) });
      for (const f of ['createGame', 'mkPlayer']) if (i >= ranges[f][0] && i <= ranges[f][1]) bad.push({ linea: i + 1, en: f });
      return;
    }
    const segs = l.match(/\/\*fl\*\/[\s\S]*?\/\*lf\*\//g);
    if (segs) for (const s of segs) { inl.push(i + 1); if (s.indexOf('g.fl') < 0) bad.push({ linea: i + 1, trozo: s }); }
    out.push(l.replace(/\/\*fl\*\/[\s\S]*?\/\*lf\*\//g, ''));
  });
  const t = out.join('\n'); let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const hx = h.toString(16);
  console.log('    líneas nuevas marcadas: ' + marked.join(', '));
  console.log('    trozos en línea: ' + inl.join(', ') + '; bloque FLUIDA: ' + blockLines + ' líneas');
  check('cada línea nueva dentro de una función existente empieza por if (g.fl…) y cada trozo en línea lleva g.fl; nada en createGame/mkPlayer', bad.length === 0 && marked.length > 0, bad);
  if (process.argv.includes('--rehash')) console.log('    SIM_BASE nueva: ' + hx);
  check('sim.js sin los ganchos ni el bloque FLUIDA = el de antes (SIM_BASE)', hx === SIM_BASE, { huella: hx, esperada: SIM_BASE });
  check('createGame no menciona fl', !/\bfl\b|g\.fl/.test(L.slice(ranges.createGame[0], ranges.createGame[1] + 1).join('\n').replace(/\/\/.*$/gm, '')));
}

// ---------------------------------------------------------------------------------------------------------------------------------
console.log('== (g) humo: dos máquinas Fluida con enlace ideal ==');
{
  const POSE = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'jvx', 'jvy', 'anim', 'lastAction', 'actionT', 'shot', 'grade', 'onGround', 'down', 'pressEnd', 'cool'];
  const AIIN = { move: [0, 0], ai: true }, NOIN = { move: [0, 0] };
  let total = { points: 0, hand: 0, tc: 0, bad: 0, guard: 0, late: 0, forks: 0, fq: 0, fqOk: 0, matches: 0, unfinished: 0, err: null };
  const seeds = QUICK ? [1] : [1, 2, 3];
  for (const seed of seeds) {
    const opts = ONL(seed, { points: 11, bestOf: 1, venue: seed === 2 ? 'beach' : 'hall', ref: FREF, timeouts: false, net: 'fluida' });
    const G = [S.createGame(opts), S.createGame(opts)];
    S.flInit(G[0], 0); S.flInit(G[1], 1);
    for (const g of G) { S.setSlotAI(g, 0, true); S.setSlotAI(g, 1, true); g.events.length = 0; }
    const poseOf = (g, t) => g.teams[t].map(p => { const o = {}; for (const k of POSE) o[k] = p[k]; return o; });
    const flips = [0, 0];
    try {
      for (let T = 1; T < 120 * 900 && !(G[0].finished && G[1].finished); T++) {
        const pz = [poseOf(G[1], 1), poseOf(G[0], 0)];             // pose rival del tic anterior (para la IA)
        for (let me = 0; me < 2; me++) {
          const g = G[me];
          g.fl.T = T;
          S.flPose(g, 1 - me, pz[me]);
          S.step(g, STEP, me === 0 ? [AIIN, NOIN] : [NOIN, AIIN]);
          g.events.length = 0;
        }
        for (let me = 0; me < 2; me++) {               // mensajes de esta máquina a la otra (llegan en el mismo tic)
          const g = G[me], o = G[1 - me];
          if (g.fl.dirty) { const st = S.flApplyTc(o, JSON.parse(JSON.stringify(g.fl.tc)), T); total.tc++; if (st !== 'ok') { total.bad++; if (!total.err) total.err = 'tc ' + st; } g.fl.dirty = ''; }
          for (const q of g.fl.fq) {
            total.fq++;
            if (o.mode === 'rally' && q.r === o.fl.r && o.fl.own === 1 - me) { const p = o.players.find(x => x.id === q.pid); S._fault(o, p.team, 'net', 'Toque de red', p); total.fqOk++; }
          }
          g.fl.fq.length = 0;
          for (const pt of g.fl.pts) {
            const m = JSON.parse(JSON.stringify({ r: pt.r, w: pt.w, reason: pt.reason, text: pt.text, pid: pt.pid, sig: pt.sig, m: pt.m, d: S.flDigest(g) }));
            const ok = S.flApplyPt(o, m); total.points++;
            if (ok !== true) { total.bad++; if (!total.err) total.err = 'pt ' + ok + ' ' + JSON.stringify([S.flDigest(o), m.d]); }
          }
          g.fl.pts.length = 0;
          // el fq aceptado en esta misma vuelta produce su pt en la otra: se manda en la vuelta siguiente (me = 1 - me)
        }
        for (let me = 0; me < 2; me++) {
          const g = G[me], o = G[1 - me];
          if (g.fl.sr) { g.fl.sr = false; if (o.fl.r === g.fl.r) { o.fl.peer = true; if (o.mode === 'point' && o.timer <= 0) S.flServe(o); } }
          if (g.fl.wait >= 2) { S.flServe(g, true); total.late++; }
        }
        for (let me = 0; me < 2; me++) if (G[me].fl.own !== G[1 - me].fl.own) flips[me]++;
      }
    } catch (e) { total.err = String(e && e.stack || e); }
    for (const g of G) { total.hand += g.fl.hand; total.guard += g.fl.guard; total.forks += g.fl.forks; }
    total.matches++;
    if (!(G[0].finished && G[1].finished)) total.unfinished++;
    const same = JSON.stringify(S.flDigest(G[0])) === JSON.stringify(S.flDigest(G[1])) && JSON.stringify(G[0].setScores) === JSON.stringify(G[1].setScores);
    check('semilla ' + seed + ': las dos acaban con el mismo marcador', same && G[0].finished, { a: S.flDigest(G[0]), b: S.flDigest(G[1]), fin: [G[0].finished, G[1].finished], desacuerdoDueño: flips });
  }
  check('sin excepciones ni tc/pt rechazados', !total.err && total.bad === 0, total.err ? { err: total.err.slice(0, 400) } : { mal: total.bad });
  check('hay traspasos y puntos; guarda de point() = 0; sin esperas de 2 s', total.hand > 0 && total.points > 0 && total.guard === 0 && total.late === 0, total);
  const g = S.createGame(ONL(3)); S.flInit(g, 1);
  let threw = false; try { S.flPose(g, 1, [{ x: 1 }]); } catch (e) { threw = true; }
  let threw0 = false; try { S.flPose(g, 0, [{ x: 7 }]); } catch (e) { threw0 = true; }
  check('flPose lanza un error con el equipo local (y no con el rival)', threw && !threw0 && g.teams[0][0].x === 7);
  // toque de red de un jugador mío con el balón del rival: una sola petición fq (y un solo netTouch), sin punto local
  g.mode = 'rally'; g.fl.own = 0; g.fl.T = 50; setBall(g, { x: 0.8, y: 0, z: 3, vx: -3, vy: 0, vz: 0 });
  const q = g.teams[1][0]; q.x = -0.22; q.y = 0; q.z = 0.5; q.vz = 2; g.events.length = 0;
  const s0 = g.score.slice();
  for (let i = 0; i < 10; i++) S._stepPlayer(g, q, STEP, 0, 0);
  const nt = g.events.filter(e => e.type === 'netTouch').length;
  check('toque de red sin el balón: 1 fq al dueño, 1 netTouch, sin punto', g.fl.fq.length === 1 && g.fl.fq[0].pid === q.id && g.fl.fq[0].r === 0 && nt === 1 && g.mode === 'rally' && g.score[0] === s0[0] && g.score[1] === s0[1], { fq: g.fl.fq, netTouch: nt, mode: g.mode });
  g.fl.own = 1; g.fl.fqK.length = 0; q.z = 0.5; q.vz = 2; q.x = -0.22;
  S._stepPlayer(g, q, STEP, 0, 0);
  check('con el balón mío, el toque de red es falta local (punto del rival)', g.mode === 'point' && g.score[0] === s0[0] + 1 && g.fl.pts.length === 1 && g.fl.r === 1, { mode: g.mode, score: g.score, pts: g.fl.pts.length });
}

// ---------------------------------------------------------------------------------------------------------------------------------
console.log('== (h) regresiones: bote del fantasma tras el pt, silbato en solitario, job rival en la vista ==');
{
  const NO = { move: [0, 0] };
  // balón del rival que cae en su campo en mi máquina (fantasma): al llegar el pt bota y rueda (vz·0,45, vx/vy·0,5) como en la del dueño
  const opts = ONL(77, { ref: FREF, timeouts: false, net: 'fluida' });
  const g = S.createGame(opts); S.flInit(g, 0);
  g.mode = 'rally'; g.fl.own = 1; g.fl.bAge = 0; g.fl.frozen = false; g.fl.khAt = -1;
  setBall(g, { x: -4, y: 1.5, z: 2.2, vx: -3, vy: 1, vz: -2 });
  // vista para el job rival, a mitad de vuelo (el balón va al campo del equipo 1, que no se simula aquí)
  for (let i = 0; i < 6; i++) S.step(g, STEP, [NO, NO]);
  const vw = S.createGame(opts);
  VB.NetView.mirror(vw, g, 0);
  const rj = vw.jobs[1], rjId = rj && rj.id, rjT = rj && rj.team, simJ = g.jobs[1];
  VB.NetView.mirror(vw, g, 1);
  check('vista Fluida: g.jobs del rival calculado solo en la copia (la sim no lo toca); girada, en el otro hueco',
    !!rj && rjT === 1 && simJ === null && !!vw.jobs[0] && vw.jobs[0].id === rjId && vw.jobs[0].team === 0 && g.jobs[1] === null, { vista: rjId, girada: vw.jobs[0] && vw.jobs[0].id, sim: simJ });
  let n = 0, imp = null;
  while (!g.fl.frozen && n < 600) { imp = { vx: g.ball.vx, vy: g.ball.vy, vz: g.ball.vz }; S.step(g, STEP, [NO, NO]); n++; }
  const frozenOk = g.fl.frozen && g.ball.vz === 0;
  const ok = S.flApplyPt(g, { r: g.fl.r, w: 0, reason: 'in', text: 'Dentro', pid: -1, sig: null, m: null });
  const v0 = { vx: g.ball.vx, vy: g.ball.vy, vz: g.ball.vz }, x0 = g.ball.x;
  let zMax = g.ball.z; for (let i = 0; i < 30; i++) { S.step(g, STEP, [NO, NO]); zMax = Math.max(zMax, g.ball.z); }
  check('fantasma caído + pt: el balón muerto bota y rueda (no se queda clavado)', frozenOk && ok === true && g.mode === 'point' &&
    v0.vz > 0.7 && Math.abs(v0.vx) > 0.5 && zMax > C.BR + 0.02 && Math.abs(g.ball.x - x0) > 0.1 && !!imp && v0.vz <= Math.abs(imp.vz) * 0.45 + 0.2,
    { pasos: n, v0: v0, zMax: zMax, dx: g.ball.x - x0 });
  // contra la IA tras irse el rival (flTake): el silbato del saque a su hora, sin la espera de 1,5 s del sr del rival
  const h = S.createGame(ONL(78, { ref: FREF, timeouts: false, net: 'fluida' })); S.flInit(h, 0); S.flTake(h); S.setSlotAI(h, 0, true);
  let late = 0, serves = 0, seenR = -1, k = 0;
  while (serves < 6 && k < 120 * 600) {
    S.step(h, STEP, [{ move: [0, 0], ai: true }, { move: [0, 0], ai: true }]); k++;
    if (h.mode === 'serve' && h.serveAuth && seenR !== h.fl.r) { seenR = h.fl.r; serves++; if (h.serveT > h.whistleAt + 0.1) late++; }
  }
  check('solo (flTake): silbato de cada saque sin esperar al rival', serves >= 6 && late === 0, { saques: serves, tarde: late });
}

console.log('\n' + oks + ' ok, ' + fails + ' fallos');
process.exit(fails ? 1 : 0);
