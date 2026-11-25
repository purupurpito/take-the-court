#!/usr/bin/env node
/* TAKE THE COURT — tools/aimpttest.js  (owner: sim)
 * Controles PC (25-nov-2026): el canal de puntería del ratón, input.aim = [x, y] (un PUNTO del mundo; ver el bloque «Teclado y ratón»
 * de js/sim.js). Pruebas de la sim en node puro (sin navegador). Sale con código 1 si algo falla.
 *   1 puerta: sin input.aim (o aim: null) la partida es la de siempre bit a bit (mismo stateHash y mismas llamadas a g.rng)
 *   2 saque: la diana va hacia el punto a SERVE_AIM_SPEED como mucho (también antes de lanzar), las flechas no la mueven y mueven al sacador
 *   3 remate: la diana del aire va hacia el punto a AIM3_SPEED como mucho, recortada al campo rival; aimCarry vuelve a 0
 *   4 colocación en salto con diana: hacia el punto en el campo propio; con el punto en el campo rival se queda
 *   5 colocación desde el suelo (2v2): el marcador (setPreview) cae cerca del cursor; cursor en el campo rival = sin dirección (NaN)
 *   6 6v6: setAngPt da la dirección del punto de toque al cursor (sectores de setSec)
 *   7 pointToAim: ida y vuelta de attackTarget y de la dejada dentro de los límites
 *   8 el 1r toque no apunta: misma recepción con y sin punto (mismo balón y mismo g.rng)
 *   9 determinismo: dos partidas con las mismas entradas con punto = mismo stateHash
 * Uso: node tools/aimpttest.js
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
const VB = load(), S = VB.Sim, C = VB.C, JD = VB.JD;
const DT = 1 / C.SIM_HZ;
let failures = 0;
const ok = (name, cond, info) => { if (cond) console.log('  ok   ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); else { failures++; console.log('  FALLO ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); } };
const r3 = v => +(+v).toFixed(3);
const N0 = () => ({ move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false });
function counted(g) { let n = 0; const r0 = g.rng; g.rng = function () { n++; return r0(); }; return () => n; }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const q = (x, y) => [Math.round(x * 10) / 10, Math.round(y * 20) / 20];   // (como main.js: cuantizado)

console.log('aimpttest: puntería con el ratón (sim)');

/** Partido con un humano «bot» de entrada aleatoria (su propio azar). aimMode: 'none' (sin campo), 'null' (aim: null) o 'pt' (un punto
 *  por toque: rival o propio). Devuelve {hash, rng, pts}. */
function play(seed, opts, aimMode, secs) {
  const g = S.createGame(Object.assign({ seed, ctrl: 'both' }, opts || {})), nr = counted(g), r = mulberry(seed * 977 + 3);
  let pt = null, st = -9, pts = 0;
  for (let i = 0; i < secs * C.SIM_HZ; i++) {
    const inp = N0();
    if (r() < 0.25) { const a = r() * 6.283; inp.move = [Math.cos(a), Math.sin(a)]; }
    if (r() < 0.02) inp.hit = true;
    if (r() < 0.006) inp.jump = true;
    if (r() < 0.003) inp.jset = true;
    if (aimMode === 'null') inp.aim = null;
    else if (aimMode === 'pt') {
      if (g.lastTouchT !== st) { st = g.lastTouchT; const own = g.mode === 'rally' && g.touchTeam === 0 && g.touches === 1; pt = q(own ? 1 + 2.5 * r() : -(1.5 + 6.5 * r()), (r() * 2 - 1) * 3.6); }
      inp.aim = pt;
    }
    S.step(g, DT, inp);
    for (const e of S.drainEvents(g)) if (e.type === 'point') pts++;
  }
  return { hash: S.stateHash(g), rng: nr(), pts };
}

// ---------- 1. Puerta ----------
{
  let bad = 0; const info = [];
  for (const [seed, o] of [[3, {}], [4, { mastery: true }], [5, { mastery: true, djump: true, jsetAim: true }], [6, { format: '6v6', ctrl: 'one' }]]) {
    const a = play(seed, o, 'none', 40), b = play(seed, o, 'null', 40);
    if (a.hash !== b.hash || a.rng !== b.rng) bad++;
    info.push(a.pts);
  }
  ok('1 sin punto (sin campo o aim: null) = la partida de siempre (2v2, maestría, salto, 6v6)', bad === 0, { puntos: info });
}

// ---------- 2. Saque ----------
/** Partida en saque del humano (equipo 0) con el balón en la mano y el saque autorizado. */
function serveGame(seed) {
  for (let s = seed; s < seed + 40; s++) {
    const g = S.createGame({ seed: s, ctrl: 'both' });
    for (let i = 0; i < 120 * 6 && !(g.mode === 'serve' && g.serveAuth); i++) { S.step(g, DT, N0()); S.drainEvents(g); }
    if (g.mode === 'serve' && g.server && g.server.team === 0 && g.server === g.ctrl && g.serveState === 'ready' && g.aim3.on && g.aim3.kind === 'serve') return g;
  }
  return null;
}
{
  const g = serveGame(11);
  ok('2a hay un saque del humano para probar', !!g);
  if (g) {
    const pt = q(-5, 3), V = 12 * DT, y0 = g.server.y; let maxStep = 0, px = g.aim3.x, py = g.aim3.y;
    for (let i = 0; i < 120; i++) {
      const inp = N0(); inp.move = [0, 1]; inp.aim = pt;   // (flecha a la derecha a la vez: mueve al sacador, no la diana)
      S.step(g, DT, inp); S.drainEvents(g);
      maxStep = Math.max(maxStep, Math.hypot(g.aim3.x - px, g.aim3.y - py)); px = g.aim3.x; py = g.aim3.y;
      if (g.serveState !== 'ready') break;
    }
    ok('2b antes de lanzar la diana va al punto a <= 12 m/s y el sacador se mueve con las flechas', Math.hypot(g.aim3.x - pt[0], g.aim3.y - pt[1]) < 1e-6 && maxStep <= V + 1e-9 && Math.abs(g.server.y - y0) > 0.3,
      { diana: [r3(g.aim3.x), r3(g.aim3.y)], paso: r3(maxStep), sacador: r3(g.server.y - y0) });
    // lanzar y llevarla a otro punto (fuera del campo: se recorta a las líneas)
    let inp = N0(); inp.hit = true; inp.aim = pt; S.step(g, DT, inp); S.drainEvents(g);
    const pt2 = q(-12, -6); maxStep = 0; px = g.aim3.x; py = g.aim3.y;
    for (let i = 0; i < 60 && g.serveState === 'toss'; i++) {
      inp = N0(); inp.move = [1, 0]; inp.aim = pt2; S.step(g, DT, inp); S.drainEvents(g);
      if (g.aim3.on) { maxStep = Math.max(maxStep, Math.hypot(g.aim3.x - px, g.aim3.y - py)); px = g.aim3.x; py = g.aim3.y; }
    }
    ok('2c en el lanzamiento la diana va hacia el punto recortado a las líneas (|x| <= HL, |y| <= HW) a <= 12 m/s', g.aim3.x >= -g.HL - 1e-9 && g.aim3.y >= -g.HW - 1e-9 && maxStep <= V + 1e-9 && g.aim3.x < -6,
      { diana: [r3(g.aim3.x), r3(g.aim3.y)], paso: r3(maxStep) });
  }
}

// ---------- 3. Remate ----------
function rally2(opts, o) {
  o = o || {};
  const g = S.createGame(Object.assign({ seed: 7, ctrl: 'one' }, opts)), h = g.teams[0][0], m = g.teams[0][1], b = g.ball;
  g.mode = 'rally'; b.held = null; S.drainEvents(g);
  for (const p of g.players) { p.z = 0; p.vz = 0; p.vx = 0; p.vy = 0; p.down = 0; p.jvx = p.jvy = 0; }
  h.x = o.x != null ? o.x : 3; h.y = o.y || 0; m.x = 6; m.y = 2;
  Object.assign(b, { x: o.bx != null ? o.bx : 2, y: 0, z: 4, vx: 0, vy: 0, vz: 0, dip: 0, wobA: 0 });
  g.touchTeam = 0; g.touches = 2; g.lastPlayer = m; g.lastTeam = 0; g.lastKind = 'set';
  g.lastTouchT = g.time; g.ctrl = h;
  return { g, h, m, b };
}
{
  const { g, h } = rally2({ djump: true }, { x: 3 }); h.avx = -5.6;
  S._humanJump(g, h, -1, 0, 1, false); h.z = 0.5;
  S._updateAim3(g, h, DT, -1, 0);
  const carry0 = g.aimCarry, pt = q(-4, 3.5), V = 11 * DT; let maxStep = 0, px = g.aim3.x, py = g.aim3.y;
  for (let i = 0; i < 120; i++) { h.z = 0.5; S._updateAim3(g, h, DT, -1, 0, pt); maxStep = Math.max(maxStep, Math.hypot(g.aim3.x - px, g.aim3.y - py)); px = g.aim3.x; py = g.aim3.y; }
  ok('3a remate: la diana va al punto a <= 11 m/s y el despegue con las teclas no cuenta (aimCarry 0)', carry0 === 1 && g.aimCarry === 0 && Math.hypot(g.aim3.x - pt[0], g.aim3.y - pt[1]) < 1e-6 && maxStep <= V + 1e-9,
    { carry0, diana: [r3(g.aim3.x), r3(g.aim3.y)], paso: r3(maxStep) });
  for (let i = 0; i < 120; i++) { h.z = 0.5; S._updateAim3(g, h, DT, 0, 0, q(3, 0)); }   // (cursor en tu campo: se recorta a 1,4 m de la red)
  ok('3b remate: con el cursor en tu campo la diana se queda en el límite del campo rival (1,4 m)', Math.abs(g.aim3.x + 1.4 * g.cs) < 1e-6, { x: r3(g.aim3.x) });
}

// ---------- 4. Colocación en salto con diana ----------
{
  const run = (aimPt) => {
    const g = S.createGame({ seed: 21, ctrl: 'one', mastery: true, djump: true, jsetAim: true }), h = g.teams[0][0], m = g.teams[0][1], b = g.ball, G = C.G;
    g.mode = 'rally'; b.held = null; S.drainEvents(g);
    const ap = (z0, z1, apex, x1, y1) => { const vz = Math.sqrt(2 * G * (apex - z0)), T = vz / G + Math.sqrt(2 * (apex - z1) / G); b.vx = (x1 - b.x) / T; b.vy = (y1 - b.y) / T; b.vz = vz; };
    m.x = 5.5; m.y = -1.5; h.x = 2.1; h.y = 0; Object.assign(b, { x: m.x, y: m.y, z: 0.9, dip: 0, wobA: 0 }); ap(0.9, 1.9, 4.4, 1.9, h.y);
    g.touchTeam = 0; g.touches = 1; g.lastPlayer = m; g.lastTeam = 0; g.lastKind = 'pass'; g.lastShot = 'forearm'; g.lastTouchT = g.time; g.ctrl = h;
    let jumped = false, seen = null, maxStep = 0, px = NaN, py = NaN;
    for (let i = 0; i < 120 * 3; i++) {
      const inp = N0(); inp.aim = aimPt;
      const zc = 1.07 + 2.2, disc = b.vz * b.vz - 2 * G * (zc - b.z);
      if (!jumped && h.z === 0 && disc > 0 && (b.vz + Math.sqrt(disc)) / G < 0.5 && b.vz < 2.5) { inp.jump = true; jumped = true; }
      S.step(g, DT, inp); S.drainEvents(g);
      if (g.aim3.on && g.aim3.kind === 'jset') {
        if (px === px && g.jsMv) maxStep = Math.max(maxStep, Math.hypot(g.aim3.x - px, g.aim3.y - py));
        px = g.aim3.x; py = g.aim3.y; seen = { x: g.aim3.x, y: g.aim3.y, mv: g.jsMv };
      }
      if (h.z === 0 && jumped && seen) break;
    }
    return { seen, maxStep };
  };
  const own = run(q(3.5, 2)), riv = run(q(-4, 2)), none = run(null);
  ok('4a colocación en salto: con el punto en tu campo la diana va hacia él (y se da por movida)', !!own.seen && own.seen.mv === 1 && own.seen.y > (none.seen ? none.seen.y : 0) + 0.3 && own.maxStep <= JD.spd * DT + 1e-9,
    { con: own.seen, sin: none.seen, paso: r3(own.maxStep) });
  ok('4b colocación en salto: con el punto en el campo rival la diana se queda en el destino de siempre', !!riv.seen && !!none.seen && riv.seen.mv === 0 && Math.abs(riv.seen.x - none.seen.x) < 1e-9 && Math.abs(riv.seen.y - none.seen.y) < 1e-9,
    { rival: riv.seen, sin: none.seen });
}

// ---------- 5. Colocación desde el suelo (2v2) ----------
{
  const setup = () => {
    const g = S.createGame({ seed: 31, ctrl: 'one', mastery: true }), h = g.teams[0][0], m = g.teams[0][1], b = g.ball, G = C.G;
    g.mode = 'rally'; b.held = null; S.drainEvents(g);
    for (const p of g.players) { p.z = 0; p.vz = 0; p.vx = 0; p.vy = 0; }
    m.x = 6; m.y = -2; h.x = 2.5; h.y = 0.5;
    Object.assign(b, { x: m.x, y: m.y, z: 1, dip: 0, wobA: 0 });
    const vz = Math.sqrt(2 * G * (5 - 1)), T = vz / G + Math.sqrt(2 * (5 - 1.6) / G); b.vx = (2.5 - b.x) / T; b.vy = (0.5 - b.y) / T; b.vz = vz;
    g.touchTeam = 0; g.touches = 1; g.lastPlayer = m; g.lastTeam = 0; g.lastKind = 'pass'; g.lastShot = 'forearm'; g.lastTouchT = g.time; g.ctrl = h;
    return g;
  };
  const pts = [[2, -3], [2, 3], [3, 0], [4, -3.5], [4, 3.5], [1.2, 0.5], [5, -1], [5, 2], [6, -3], [3, 2]];
  let far = 0, worst = 0, opened = 0; const sample = [];
  for (const p of pts) {
    const g = setup(), pt = q(p[0], p[1]);
    let pv = null;
    for (let i = 0; i < 120 && !pv; i++) {
      const inp = N0(); inp.aim = pt; S.step(g, DT, inp); S.drainEvents(g);
      if (S.setWin(g) && g.setDirA === g.setDirA) {
        opened++; pv = S.setPreview(g);
        if (pv) {
          pv = { x: pv.x, y: pv.y, a: g.setDirA };
          // lo mejor posible con el espacio de destinos del teclado: el destino de setAim más cercano barriendo cada grado
          const h = g.ctrl, w = S.hitWindow(g, h, {}), sx = w.reach ? w.x : h.x, sy = w.reach ? w.y : h.y, o = {}; let best = 1e9;
          for (let a = 0; a < 360; a++) { const st = S.setAim(g, h, true, o, sx, sy, a); best = Math.min(best, Math.hypot(S.side(h.team) * st.x - pt[0], st.y - pt[1])); }
          pv.best = best;
        }
      }
    }
    if (!pv) { far++; continue; }
    const d = Math.hypot(pv.x - pt[0], pv.y - pt[1]) - pv.best;
    worst = Math.max(worst, d); if (sample.length < 4) sample.push({ cursor: pt, destino: [r3(pv.x), r3(pv.y)], mejor: r3(pv.best) });
  }
  ok('5a 2v2: con la ventana abierta el cursor en tu campo da dirección y el marcador cae en el destino posible más cercano (< 0,3 m del óptimo)', far === 0 && worst < 0.3, { peorExceso: r3(worst), ejemplos: sample });
  const g = setup(); let na = 0, win = 0;
  for (let i = 0; i < 90; i++) { const inp = N0(); inp.aim = q(-4, 1); S.step(g, DT, inp); S.drainEvents(g); if (S.setWin(g)) { win++; if (g.setDirA !== g.setDirA) na++; } }
  ok('5b 2v2: con el cursor en el campo rival, sin dirección (alta a la 4, como el teclado sin flecha)', win > 0 && na === win, { ventana: win, sinDir: na });
  // movimiento libre: con el cursor apuntando, WASD sigue moviendo (no planta)
  const g2 = setup(), x0 = g2.ctrl.y;
  for (let i = 0; i < 40; i++) { const inp = N0(); inp.aim = q(3, 2); inp.move = [0, 1]; S.step(g2, DT, inp); S.drainEvents(g2); }
  ok('5c 2v2: con el ratón, las teclas en la ventana mueven al colocador (no apuntan)', g2.ctrl.y - x0 > 0.3, { dy: r3(g2.ctrl.y - x0) });
}

// ---------- 6. 6v6: dirección del punto de toque al cursor ----------
{
  const g = S.createGame({ seed: 3, format: '6v6' }), hp = g.ctrl, w = { reach: true, x: 1, y: 0 };
  const sec = pt => { const a = S.setAngPt(g, hp, pt, w); return a === a ? Math.round(a / 45) % 8 : -1; };
  const sd = S.side(hp.team);
  const s0 = sec([sd * 0.3, 0]), s2 = sec([sd * 1, 3]), s6 = sec([sd * 1, -3]), s4 = sec([sd * 4, 0]), s7 = sec([sd * 0.1, -0.8]), sr = sec([-sd * 2, 0]);
  ok('6 6v6: hacia la red ↑ (0), a un lado → (2) / ← (6), atrás ↓ (4, pipe), ↖ (7); en el campo rival, sin dirección', s0 === 0 && s2 === 2 && s6 === 6 && s4 === 4 && s7 === 7 && sr === -1,
    { s0, s2, s6, s4, s7, sr });
}

// ---------- 7. pointToAim ----------
{
  const g = S.createGame({ seed: 1 }), p = g.teams[0][0]; p.y = 0.8;
  let worst = 0, worstT = 0;
  for (let x = -7.5; x <= -2; x += 0.5) for (let y = -3; y <= 3; y += 0.5) {
    const a = S.pointToAim(g, p, [x, y], '');
    if (Math.hypot(a[0], a[1]) < 1 - 1e-9) { const t = S.attackTarget(p, a, 6.5, g.cs); worst = Math.max(worst, Math.hypot(t[0] - x, t[1] - y)); }
  }
  for (let x = -2.6; x <= -1.4; x += 0.2) for (let y = -1.5; y <= 2.5; y += 0.5) {
    const a = S.pointToAim(g, p, [x, y], 'tip');
    if (Math.hypot(a[0], a[1]) < 1 - 1e-9 && -x - 1.6 >= -0.3 && -x - 1.6 <= 1) {
      const tx = -(1.6 + Math.max(-0.3, Math.min(1, -a[0]))), ty = Math.max(-3.8, Math.min(3.8, p.y + a[1] * 2.6));
      worstT = Math.max(worstT, Math.hypot(tx - x, ty - y));
    }
  }
  ok('7 pointToAim: ida y vuelta < 0,05 m (attackTarget y dejada)', worst < 0.05 && worstT < 0.05, { at: r3(worst), dejada: r3(worstT) });
}

// ---------- 8. El 1r toque no apunta ----------
{
  const run = (aim) => {
    const g = S.createGame({ seed: 41, ctrl: 'one' }), h = g.teams[0][0], b = g.ball, G = C.G, nr = counted(g);
    g.mode = 'rally'; b.held = null; S.drainEvents(g);
    for (const p of g.players) { p.z = 0; p.vz = 0; p.vx = 0; p.vy = 0; }
    h.x = 5; h.y = 0; g.teams[0][1].x = 6; g.teams[0][1].y = 3;
    Object.assign(b, { x: -3, y: 0.5, z: 2.6, dip: 0, wobA: 0 });
    const vz = 3, T = (vz + Math.sqrt(vz * vz + 2 * G * (2.6 - 0.9))) / G; b.vx = (5 - b.x) / T; b.vy = (0 - b.y) / T; b.vz = vz;
    const op = g.teams[1][0]; g.touchTeam = 1; g.touches = 3; g.lastPlayer = op; g.lastTeam = 1; g.lastKind = 'free'; g.lastTouchT = g.time; g.ctrl = h;
    let hit = null, pressed = false; const w = {};
    for (let i = 0; i < 240 && !hit; i++) {
      const inp = N0(); if (aim) inp.aim = aim;
      S.hitWindow(g, h, w); if (!pressed && w.reach && w.press <= 0.02) { inp.hit = true; pressed = true; }
      S.step(g, DT, inp);
      for (const e of S.drainEvents(g)) if (e.type === 'hit' && e.player === h) hit = [b.vx, b.vy, b.vz, e.kind];
    }
    return { hit, rng: nr() };
  };
  const a = run(null), b = run(q(-5, 3));
  ok('8 1r toque: misma recepción con y sin punto (balón y g.rng)', !!a.hit && JSON.stringify(a) === JSON.stringify(b), { sin: a, con: b });
}

// ---------- 9. Determinismo ----------
{
  const a = play(9, { mastery: true }, 'pt', 60), b = play(9, { mastery: true }, 'pt', 60), c = play(9, { mastery: true }, 'none', 60);
  ok('9 con punto: dos partidas con las mismas entradas = mismo stateHash (y distinto de sin punto)', a.hash === b.hash && a.rng === b.rng && a.hash !== c.hash, { puntos: a.pts });
}

console.log(failures ? 'FALLOS: ' + failures : 'TODO OK');
process.exit(failures ? 1 : 0);
