#!/usr/bin/env node
/* MAKE THE CUT — tools/saltotest.js  (owner: sim)
 * «Salto con impulso» (v1.10.0, notes/sim.md): pruebas de la sim (node puro, sin navegador). Sale con código 1 si algo falla.
 *   1 puerta: sin djump (o sin dirección) el salto del humano es el de siempre bit a bit
 *   2 despegue: carrera + stick, parado, hacia atrás, tope ×Salto, búfer de 0,10 s; 2b de lado (DJ.lat) y asistencia (astF)
 *   3 seguro de red (jugada propia y bloqueo)          4 colocador plantado: salto vertical
 *   5 hitWindow con la deriva                           6 bonus del remate (y nada parado o con mal timing; mismo gasto de g.rng)
 *   7 riesgo: dispersión y ventana más justa           8 pipe (6v6): legal detrás de la línea de 3 m, falta delante; mismo 3,4 m
 *   9 la diana del remate no se mueve con la dirección del despegue
 *  10 colocación en salto con diana: apagada / sin mover = idéntica; movida = cae donde la diana; 2º toque de ataque; dianaLane;
 *     compañero a la batida; colocación de suelo sin cambios
 *  11 la CPU no cambia: puerta (demo y autopilot) y partido humano con djump sin usar la dirección = sin djump (2v2 y 6v6)
 *  12 aterrizaje duro, evento jump con dir/jv, landingOf, estadísticas
 *  13 online: mismo hash con djump y jsetAim en un solo hueco, también tras copyGame
 * Uso: node tools/saltotest.js [--quick]   (--quick: 6 semillas en 11 y 600 en 7)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const QUICK = process.argv.includes('--quick');
function load() {
  const ctx = { console, Math, Date };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.VB;
}
const VB = load(), S = VB.Sim, C = VB.C, DJ = VB.DJ, MOM = VB.MOM, JD = VB.JD, JSET = VB.JSET, A6 = VB.AI6;
const DT = 1 / C.SIM_HZ;
let failures = 0;
const ok = (name, cond, info) => { if (cond) console.log('  ok   ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); else { failures++; console.log('  FALLO ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); } };
const r3 = v => +(+v).toFixed(3);
const N0 = () => ({ move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false });
function counted(g) { let n = 0; const r0 = g.rng; g.rng = function () { n++; return r0(); }; return () => n; }

/** Partido 2v2 en peloteo con el humano (n.º 1) en x, de pie; su equipo lleva toques (jugada propia: touches 2, balón en su campo). */
function rally2(opts, o) {
  o = o || {};
  const g = S.createGame(Object.assign({ seed: 7, ctrl: 'one' }, opts)), h = g.teams[0][0], m = g.teams[0][1], b = g.ball;
  g.mode = 'rally'; b.held = null; S.drainEvents(g);
  for (const q of g.players) { q.z = 0; q.vz = 0; q.vx = 0; q.vy = 0; q.down = 0; q.jvx = q.jvy = 0; }
  h.x = o.x != null ? o.x : 3; h.y = o.y || 0; m.x = 6; m.y = 2;
  Object.assign(b, { x: o.bx != null ? o.bx : 2, y: 0, z: 4, vx: 0, vy: 0, vz: 0, dip: 0, wobA: 0 });
  if (o.opp) { g.touchTeam = 1; g.touches = 2; g.lastPlayer = g.teams[1][0]; g.lastTeam = 1; g.lastKind = 'set'; b.x = -1; }
  else { g.touchTeam = 0; g.touches = 2; g.lastPlayer = m; g.lastTeam = 0; g.lastKind = 'set'; }
  g.lastTouchT = g.time; g.ctrl = h;
  return { g, h, m, b };
}

console.log('saltotest: salto con impulso (sim)');

// ---------- 1. Puerta ----------
{
  const legacy = (p, sd, oppBall) => { let jx = p.vx * 0.3, jy = p.vy * 0.3; const jl = Math.hypot(jx, jy); if (jl > 0.6) { jx *= 0.6 / jl; jy *= 0.6 / jl; }
    if (Math.abs(p.x) < 1.5 && oppBall && jx * sd < 0) { const air = 2 * C.JUMP_V / C.G; if ((p.x + jx * air) * sd < 0.4) jx = Math.min(0, (0.4 - p.x * sd) / air) * sd; } return [jx, jy]; };
  let bad = 0, n = 0;
  for (const dj of [false, true]) for (const vx of [-5.6, -2, 0, 3]) for (const x of [1.0, 3]) for (const opp of [false, true]) {
    const { g, h } = rally2({ djump: dj }, { x, opp }); h.vx = vx; h.vy = 1.2; h.avx = vx; h.avy = 1.2;
    const e = legacy(h, 1, opp); S._humanJump(g, h, 0, 0, 0, false); n++;
    if (h.jvx !== e[0] || h.jvy !== e[1] || h.dj !== 0) bad++;
  }
  // con djump y dirección pulsada pero sin djump en el partido: legado
  { const { g, h } = rally2({}, {}); h.vx = -5.6; h.avx = -5.6; S._humanJump(g, h, -1, 0, 1, false); const e = legacy(h, 1, false); n++; if (h.jvx !== e[0] || h.dj !== 0) bad++; }
  ok('1 puerta: sin djump / sin dirección = 0,3·v con tope 0,6 bit a bit', bad === 0, { casos: n, distintos: bad });
}

// ---------- 2. Despegue ----------
{
  const jv = (o, mv, ml, extra) => { const { g, h } = rally2({ djump: true }, { x: o.x != null ? o.x : 6 }); h.avx = o.avx || 0; h.avy = o.avy || 0; h.vx = h.avx; h.vy = h.avy;
    if (o.ak) h.ak = { jump: o.ak }; if (extra) extra(g, h); S._humanJump(g, h, mv[0], mv[1], ml, false); return { g, h, n: Math.hypot(h.jvx, h.jvy) }; };
  const full = jv({ avx: -5.6 }, [-1, 0], 1), stand = jv({}, [-1, 0], 1), still = jv({}, [0, 0], 0), back = jv({ avx: -5.6 }, [1, 0], 1);
  const capA = jv({ avx: -8, ak: 1.12 }, [-1, 0], 1);
  const buf = (ago) => jv({}, [0, 0], 0, (g, h) => { g.time = 10; g.jdF = 1; g.jdS = 0; g.jdM = 1; g.jdT = 10 - ago; });
  const b08 = buf(0.08), b12 = buf(0.12);
  ok('2 despegue: carrera completa 1,79 ± 0,01', Math.abs(full.n - 1.792) < 0.01 && full.h.dj === 1 && full.h.jvx < 0, r3(full.n));
  ok('2 despegue: parado con stick 0,60; parado sin stick, legado (0)', Math.abs(stand.n - 0.6) < 1e-9 && still.n === 0 && still.h.dj === 0, [r3(stand.n), still.n]);
  ok('2 despegue: stick atrás corriendo a la red <= 0,8 y hacia atrás', back.n <= 0.8 + 1e-9 && back.h.jvx > 0, [r3(back.n), r3(back.h.jvx)]);
  ok('2 despegue: tope ×Salto (ak.jump 1,12 -> <= 2,016)', capA.n <= 2.016 + 1e-9 && capA.n > 2.0, r3(capA.n));
  ok('2 despegue: búfer, suelta 0,08 s antes = con dirección; 0,12 s = legado', b08.h.dj === 1 && Math.abs(b08.n - 0.6) < 1e-9 && b12.h.dj === 0 && b12.n === 0, [b08.h.dj, r3(b08.n), b12.h.dj]);
  // búfer por step(): mueve 0,05 s con el stick hacia la red, lo suelta y pulsa SALTAR a los 0,06 s
  { const { g, h } = rally2({ djump: true }, { x: 6 }); let k = 0;
    for (; k < 6; k++) S.step(g, DT, Object.assign(N0(), { move: [-1, 0] }));
    for (let i = 0; i < 6; i++) S.step(g, DT, N0());
    S.step(g, DT, Object.assign(N0(), { jump: true })); const ev = S.drainEvents(g).filter(e => e.type === 'jump');
    ok('2 búfer por step(): stick soltado 0,05 s antes de SALTAR -> salto con dirección (evento jump con dir y jv)', h.dj === 1 && ev.length === 1 && Array.isArray(ev[0].dir) && ev[0].jv > 0.3, ev[0] && { dir: ev[0].dir.map(r3), jv: r3(ev[0].jv) }); }
  // carrera real por step(): 0,5 s corriendo hacia la red y SALTAR sin soltar
  { const { g, h } = rally2({ djump: true }, { x: 7 });
    for (let i = 0; i < 60; i++) S.step(g, DT, Object.assign(N0(), { move: [-1, 0] }));
    S.step(g, DT, Object.assign(N0(), { move: [-1, 0], jump: true }));
    const n = Math.hypot(h.jvx, h.jvy);
    ok('2 carrera real (0,5 s) por step(): deriva 1,55-1,80 hacia la red', n > 1.55 && n < 1.8 && h.jvx < 0 && h.dj === 1, { jv: r3(n), avx: r3(h.avx) }); }
}

// ---------- 2b. Salto de lado y asistencia corriendo hacia la red ----------
{
  // corriendo de lado a tope con el stick de lado: la deriva a lo ancho no pasa de DJ.lat (antes 1,79)
  const { g, h } = rally2({ djump: true }, { x: 3 }); h.avx = 0; h.avy = 5.6; h.vy = 5.6;
  S._humanJump(g, h, 0, 1, 1, false);
  ok('2b de lado: corriendo a 5,6 m/s con el stick de lado, |deriva a lo ancho| <= DJ.lat', h.dj === 1 && Math.abs(h.jvy) <= DJ.lat + 1e-9, { jvy: r3(h.jvy), jvx: r3(h.jvx) });
  // asistencia: pasada la batida adelantada, corriendo hacia la red se frena hasta ×astF (no se llega a la red a tope)
  const a = rally2({ djump: true }, { x: 1.4 }); a.g.jobs[0] = a.h;
  Object.assign(a.g.pr3, { x: 1.0, y: 0, z: 3, t: 0.6 }); a.h.avx = -5.6;
  const mv = S._assistMove ? S._assistMove(a.g, a.h, -1, 0, false) : null;
  ok('2b asistencia: entre la batida adelantada y la de siempre, corriendo hacia la red, el stick se frena (×astF..1)', !!mv && mv[0] > -1 + 1e-6 && mv[0] <= -DJ.astF + 1e-9, mv && [r3(mv[0]), r3(mv[1])]);
}

// ---------- 3. Seguro de red ----------
{
  let minLand = 9, nets = 0, n = 0;
  for (let k = 0; k < 200; k++) {
    const x = 0.5 + (k % 20) * 0.06, opp = k % 2 === 1, sp = 1 + (k % 7) * 0.7;
    const { g, h, b } = rally2({ djump: true }, { x, opp });
    h.avx = -sp; h.vx = -sp; b.x = opp ? -0.5 : 0.8; b.y = h.y; b.z = 3.5;
    S._humanJump(g, h, -1, (k % 3 - 1) * 0.3, 1, false); n++;
    const L = S.landingOf(g, h, {}); minLand = Math.min(minLand, L.x);
    for (let i = 0; i < 130 && h.z + h.vz > 0; i++) { S._stepPlayer(g, h, DT, 0, 0); b.vx = b.vy = b.vz = 0; }
    nets += S.drainEvents(g).filter(e => e.type === 'netTouch').length;
  }
  ok('3 seguro de red: 200 saltos hacia la red desde 0,5-1,6 m, ningún toque de red y aterriza a >= 0,40 (>= 0,45 en jugada propia)', nets === 0 && minLand >= 0.4 - 1e-9, { minimo: r3(minLand), toques: nets });
  const { g, h } = rally2({ djump: true }, { x: 1.2 }); h.avx = -5.6; S._humanJump(g, h, -1, 0, 1, false); const L1 = S.landingOf(g, h, {});
  const bl = rally2({ djump: true }, { x: 1.0, opp: true }); bl.h.avx = -5.6; S._humanJump(bl.g, bl.h, -1, 0, 1, false); const L2 = S.landingOf(bl.g, bl.h, {});
  ok('3 ataque propio desde 1,2 con 1,8 hacia la red: aterriza a >= 0,45; bloqueo desde 1,0: |jv| <= 1,0 y a >= 0,40', L1.x >= 0.45 - 1e-9 && Math.hypot(bl.h.jvx, bl.h.jvy) <= 1 + 1e-9 && L2.x >= 0.4 - 1e-9, [r3(L1.x), r3(Math.hypot(bl.h.jvx, bl.h.jvy)), r3(L2.x)]);
}

// ---------- 4. Colocador plantado ----------
{
  const { g, h } = rally2({ djump: true }, { x: 3 }); h.vx = -1; h.avx = -5; S._humanJump(g, h, -1, 0, 1, true);
  ok('4 colocador plantado + SALTAR con stick: salto de siempre (p.dj 0, 0,3·v)', h.dj === 0 && h.jvx === -0.3, [h.dj, h.jvx]);
}

// ---------- 5. hitWindow con la deriva ----------
{
  const { g, h, b } = rally2({ djump: true }, { x: 3 }); h.avx = -5.6;
  S._humanJump(g, h, -1, 0, 1, false); h.jvx = -1.8; h.jvy = 0; // deriva exacta de 1,8 hacia la red
  const ta = C.JUMP_V / C.G, cx = 3 - 1.8 * ta, cz = C.JUMP_V * C.JUMP_V / (2 * C.G) + C.ZC.spike;
  Object.assign(b, { x: cx + 0.5 * ta, y: 0, z: cz + 0.5 * C.G * ta * ta, vx: -0.5, vy: 0, vz: 0, dip: 0 });
  g.lastTouchT = g.time; g.touchTeam = 0; g.touches = 2;
  const w = S.hitWindow(g, h, {}), real = 3 - 1.8 * w.t, eWith = Math.abs(w.x - real);
  h.dj = 0; const w0 = S.hitWindow(g, h, {}); h.dj = 1; // (sin el término, la ventana ve el balón donde estaría con el jugador quieto)
  ok('5 hitWindow: con la deriva el contacto previsto queda a <= 0,03 m del real; sin ella, >= 0,30', w.d <= 0.03 && eWith <= 0.05 && w0.d >= 0.3, { d: r3(w.d), t: r3(w.t), sinTermino: r3(w0.d) });
}

// ---------- 6. Bonus del remate ----------
/** Remate del humano en el aire en x = 1,2 hacia la diana (-6, 0) con deriva jv hacia la red y desfase te. */
function spikeAt(jv, te, o) {
  o = o || {};
  const g = S.createGame(Object.assign({ seed: o.seed || 11, ctrl: 'one', djump: true }, o.opts || {})), h = g.teams[0][0], m = g.teams[0][1], b = g.ball;
  g.mode = 'rally'; b.held = null; S.drainEvents(g);
  h.x = 1.2; h.y = 0; h.z = 1; h.vz = 0.5; h.dj = 1; h.jvx = o.jvx != null ? o.jvx : o.jvy != null ? 0 : -jv; h.jvy = o.jvy || 0; h.jF = o.jF != null ? o.jF : jv;
  Object.assign(b, { x: 1.2, y: 0, z: 3.4, vx: -0.3, vy: 0, vz: -1, dip: 0 });
  g.touchTeam = 0; g.touches = 2; g.lastPlayer = m; g.lastTeam = 0; g.lastKind = 'set'; g.lastShot = 'overhead'; g.lastTouchT = g.time; g.ctrl = h;
  g.aim3.on = true; g.aim3.kind = 'spike'; g.aim3.x = -6; g.aim3.y = 0;
  const nr = counted(g);
  S._hit(g, h, null, te, '');
  const e = S.drainEvents(g).find(x => x.type === 'hit'), Ge = C.G + (b.dip || 0), tl = (b.vz + Math.sqrt(b.vz * b.vz + 2 * Ge * (b.z - C.BR))) / Ge;
  const land = { x: b.x + b.vx * tl, y: b.y + b.vy * tl }; // (bote exacto: predict va a pasos de 1/100 s y a 18 m/s se pasa hasta 0,18 m)
  return { e, g, rng: nr(), speed: b.speed, land, err: Math.hypot(land.x + 6, land.y) };
}
{
  const cs = [0, 0.7, 1.15, 1.6].map(j => spikeAt(j, 0)), want = [0, 0, MOM.spd / 2, MOM.spd];
  // (b.speed es el módulo de la salida de launchDirect, ≈ 1,05 × la velocidad del remate spd = 19: el bonus dv va en unidades de spd)
  const spd0 = 13.5 + 5.5, kv = cs[0].speed / spd0, dv = cs.map(c => (c.speed - cs[0].speed) / kv), rngs = cs.map(c => c.rng);
  ok('6 bonus con q = 1: Δvelocidad 0 / 0 / MOM.spd·½ / MOM.spd (±0,02) con jv 0 / 0,7 / 1,15 / 1,6, mismo gasto de g.rng', dv.every((d, i) => Math.abs(d - want[i]) < 0.02) && rngs.every(n => n === rngs[0]) && cs[0].e.quality === 1,
    { dv: dv.map(r3), mom: cs.map(c => r3(c.e.mom)), rng: rngs, salida: r3(cs[0].speed) });
  // misma trayectoria (boostDip): con los mismos dados el bote se separa de la diana ×(1 + spr) (solo la dispersión cambia)
  const e0 = spikeAt(0, 0.07, { seed: 5, jF: 0 }), e1 = spikeAt(1.6, 0.07, { seed: 5, jF: 0 }), rr = e1.err / e0.err;
  ok('6 bonus: misma trayectoria (con los mismos dados el bote se separa de la diana ×1,30 = 1 + MOM.spr, y sale más rápido)', Math.abs(rr - (1 + MOM.spr)) < 0.05 && e1.speed > e0.speed + 1, [r3(rr), r3(e0.err), r3(e1.speed - e0.speed)]);
  const qBad = spikeAt(1.6, 0.16), qq = qBad.e.quality;
  ok('6 bonus: con q <= 0,35 no hay bonus', qq <= 0.35 && qBad.e.mom === 0, { q: r3(qq), mom: qBad.e.mom });
  const st = spikeAt(0.6, 0, { jF: 0.6 });
  ok('6 parado (deriva 0,6 < j0): sin bonus', st.e.mom === 0 && Math.abs(st.speed - cs[0].speed) < 1e-9, r3(st.speed));
}

// ---------- 7. Riesgo ----------
{
  const inv = (q) => C.W_PERFECT + (0.9 - q) / 0.4 * (C.W_GOOD - C.W_PERFECT); // timingQ inversa en la franja 'good'
  const te = inv(0.75), N = QUICK ? 600 : 2000;
  const mean = (o) => { let s = 0; for (let k = 1; k <= N; k++) s += spikeAt(o.jv, te, Object.assign({ seed: k, jF: 0 }, o)).err; return s / N; };
  const m0 = mean({ jv: 0 }), mk = mean({ jv: 1.6 }), mx = mean({ jv: 0, jvy: 1.8 });
  ok('7 riesgo: q = 0,75, error medio ×1,25-1,35 con k = 1 (deriva alineada)', mk / m0 > 1.25 && mk / m0 < 1.35, { sin: r3(m0), k1: r3(mk), x: r3(mk / m0) });
  // deriva de lado (persiguiendo la colocación, jF = 0): ni bonus ni castigo
  ok('7 riesgo: deriva solo de lado (1,8, sin deriva hacia la red): dispersión ×1 (±0,05)', Math.abs(mx / m0 - 1) < 0.05, { x: r3(mx / m0) });
  // en diagonal hacia la red (45°, 1,8: jF 1,27) rematando recto, frente a la misma deriva hacia el golpe (1,27) alineada: mismo bonus y
  // misma ventana; el castigo por cruzar es ×(1 + mis·(1 − cos 45°)·clamp((jF − j0)/misJ)) y escala con la deriva hacia la red
  const d45 = 1.8 / Math.SQRT2, md = mean({ jv: 0, jvx: -d45, jvy: d45, jF: d45 }), mA = mean({ jv: d45, jF: d45 });
  const want45 = 1 + MOM.mis * (1 - Math.SQRT1_2) * Math.min(1, Math.max(0, (d45 - MOM.j0) / MOM.misJ));
  ok('7 riesgo: en diagonal hacia la red (45°, 1,8) frente a alineada: ×(1 + mis·(1 − cos)·jF) (±0,04)', Math.abs(md / mA - want45) < 0.04, { x: r3(md / mA), formula: r3(want45) });
  // ventana más justa: con jF = 1,6 el desfase cuenta ×1,15 (W_PERFECT 0,035 -> 0,0304)
  const qA = spikeAt(1.6, 0.035 / 1.15, { jF: 1.6 }).e.quality, qB = spikeAt(0, 0.035, { jF: 0 }).e.quality;
  ok('7 ventana: con impulso completo el perfecto pasa de 0,035 a 0,030 s', Math.abs(qA - qB) < 1e-6, [r3(qA), r3(qB)]);
}

// ---------- 8. Pipe (6v6) ----------
{
  const pipeAt = (tox, djump) => {
    const g = S.createGame({ format: '6v6', seed: 21, ctrlRole: 'OH', djump: djump !== false }), h = g.ctrl, b = g.ball;
    g.mode = 'rally'; b.held = null; S.drainEvents(g);
    h.front = false; const setter = g.teams[0].find(q => q.role === 'S');
    h.x = tox; h.y = 0; h.z = 0; h.vz = 0; h.down = 0; h.avx = -5.6;
    g.touchTeam = 0; g.touches = 2; g.lastPlayer = setter; g.lastTeam = 0; g.lastKind = 'set'; g.lastShot = 'overhead'; g.lastTouchT = g.time;
    Object.assign(b, { x: 2.5, y: 0, z: 3.5, vx: 0, vy: 0, vz: 0, dip: 0 });
    S._humanJump(g, h, -1, 0, 1, false);
    h.x = 2.5; h.z = 1; // en el contacto (unos 0,9 m de deriva)
    S._hit(g, h, null, 0, '');
    const e = S.drainEvents(g).find(x => x.type === 'hit');
    return { e, atk: g.atkServe, toX: h.toX };
  };
  const a = pipeAt(3.4), f = pipeAt(2.9);
  ok('8 pipe: despega a 3,4 y remata a 2,5 = legal y hit.pipe; despega a 2,9 = «Ataque de zaguero» y sin pipe',
    a.e && a.e.kind === 'spike' && a.e.pipe === true && !a.atk && f.atk && f.atk.reason === 'backAttack' && f.e.pipe === false,
    { legal: [a.e && a.e.pipe, a.atk && a.atk.reason], falta: [f.e && f.e.pipe, f.atk && f.atk.text] });
  // pipe al zaguero humano: el mismo destino que a la CPU (FORM.set.pipe, 3,4 m) con y sin djump (el pipeH de 2,9 m se quitó: sin carrera
  // dejaba un 21 % de ataques de zaguero)
  const dest = (djump) => {
    const g = S.createGame({ format: '6v6', seed: 22, ctrlRole: 'OH', djump }), h = g.ctrl, sd = 1;
    g.mode = 'rally'; g.ball.held = null; h.front = false;
    const s = g.teams[0].find(q => q.role === 'S'); s.x = 1.0; s.y = 0.5;
    g._pq6 = [{ q: 0.9, t: g.time }, { q: 0, t: -9 }]; g.hAct = g.time; g.touchTeam = 0; g.touches = 1; g.lastPlayer = g.teams[0].find(q => q !== s && q !== h); g.lastKind = 'pass';
    h.x = sd * 3.2; h.y = (VB.Sim.ZONE[h.zone] ? VB.Sim.ZONE[h.zone].yl : 0) * A6.FORM.pipeY;
    const sp = A6.chooseSet(g, s, 'back', h.zone, 0);
    return { d: sp.d, to: g.setPlan[0] && g.setPlan[0].to === h };
  };
  const dh = dest(true), dc = dest(false);
  ok('8 pipe al zaguero humano: 3,4 m con y sin djump (sin pipeH)', dh.to && Math.abs(dh.d - 3.4) < 1e-9 && dc.to && Math.abs(dc.d - 3.4) < 1e-9 && !A6.FORM.set.pipeH, [dh, dc]);
  // la etiqueta pipe cuenta también el pipe legal que golpea detrás de la línea (el de la CPU, a ~3,4 m)
  const deep = (() => { const g = S.createGame({ format: '6v6', seed: 21, ctrlRole: 'OH', djump: true }), h = g.ctrl, b = g.ball;
    g.mode = 'rally'; b.held = null; S.drainEvents(g); h.front = false; const setter = g.teams[0].find(q => q.role === 'S');
    h.x = 4.0; h.y = 0; h.z = 0; h.vz = 0; h.down = 0; h.avx = 0;
    g.touchTeam = 0; g.touches = 2; g.lastPlayer = setter; g.lastTeam = 0; g.lastKind = 'set'; g.lastShot = 'overhead'; g.lastTouchT = g.time;
    Object.assign(b, { x: 3.5, y: 0, z: 3.5, vx: 0, vy: 0, vz: 0, dip: 0 });
    S._humanJump(g, h, 0, 0, 0, false); h.x = 3.5; h.z = 1; S._hit(g, h, null, 0, '');
    return S.drainEvents(g).find(x => x.type === 'hit'); })();
  ok('8 pipe: remate de zaguero que despega a 4,0 y golpea a 3,5 (detrás de la línea) también es pipe', deep && deep.kind === 'spike' && deep.pipe === true, deep && { kind: deep.kind, pipe: deep.pipe });
}

// ---------- 9. Diana del remate y dirección del despegue ----------
{
  const { g, h } = rally2({ djump: true }, { x: 3 }); h.avx = -5.6;
  S._humanJump(g, h, -1, 0, 1, false); h.z = 0.01;
  S._updateAim3(g, h, DT, -1, 0); const x0 = g.aim3.x, y0 = g.aim3.y;
  for (let i = 0; i < 60; i++) { h.z = 0.5; S._updateAim3(g, h, DT, -1, 0); }
  const still = Math.hypot(g.aim3.x - x0, g.aim3.y - y0);
  for (let i = 0; i < 30; i++) S._updateAim3(g, h, DT, 0, 1);
  const moved = Math.hypot(g.aim3.x - x0, g.aim3.y - y0);
  // sin djump, la de siempre (se mueve desde el despegue)
  const n = rally2({}, { x: 3 }); n.h.vx = -5; S._humanJump(n.g, n.h, -1, 0, 1, false); n.h.z = 0.5; S._updateAim3(n.g, n.h, DT, 0, 0); const nx0 = n.g.aim3.x;
  for (let i = 0; i < 20; i++) S._updateAim3(n.g, n.h, DT, -1, 0);
  ok('9 diana: el stick hacia delante 0,5 s tras despegar no la mueve; girado 90° sí; sin djump, como siempre', still === 0 && moved > 2 && g.aimCarry === 0 && Math.abs(n.g.aim3.x - nx0) > 1,
    { quieta: still, movida: r3(moved), sinDjump: r3(n.g.aim3.x - nx0) });
}

// ---------- 10. Colocación en salto con diana ----------
/** Escenario de simtest «colocación en salto» (jsc): el compañero recibe, el humano junto a la red salta y pulsa COLOCAR con el
 *  timing lead; aimTo = [x, y] lleva la diana allí con el stick antes de colocar. */
function jsc(seed, lead, o) {
  o = o || {};
  const g = S.createGame(Object.assign({ seed, ctrl: 'one', stats: true }, o.opts || {})), h = g.teams[0][0], m = g.teams[0][1], b = g.ball, G = C.G;
  g.mode = 'rally'; b.held = null; S.drainEvents(g);
  const yy = (seed % 5 - 2) * 0.8, ap = (z0, z1, apex, x1, y1) => { const vz = Math.sqrt(2 * G * (apex - z0)), T = vz / G + Math.sqrt(2 * (apex - z1) / G); b.vx = (x1 - b.x) / T; b.vy = (y1 - b.y) / T; b.vz = vz; };
  m.x = 5.5; m.y = -1.5 + yy * 0.3; h.x = 2.1; h.y = yy; Object.assign(b, { x: m.x, y: m.y, z: 0.9, dip: 0, wobA: 0 }); ap(0.9, 1.9, 4.4, 1.9, h.y);
  g.touchTeam = 0; g.touches = 1; g.lastPlayer = m; g.lastTeam = 0; g.lastKind = 'pass'; g.lastShot = 'forearm'; g.lastTouchT = g.time; g.ctrl = h;
  const nr = counted(g), r = { h: null, aim: null, land: null, g, steps: 0 }, w = {}; let jumped = false, pressed = false;
  for (let i = 0; i < 120 * 4 && !r.h; i++) {
    const inp = N0();
    if (o.ground) { S.hitWindow(g, h, w); if (!pressed && w.press <= lead) { inp.hit = true; pressed = true; } }
    else {
      const zc = 1.07 + 2.2, disc = b.vz * b.vz - 2 * G * (zc - b.z);
      if (!jumped && h.z === 0 && disc > 0 && (b.vz + Math.sqrt(disc)) / G < 0.5 && b.vz < 2.5) { inp.jump = true; jumped = true; }
      if (jumped && h.z > 0 && o.aimTo && g.aim3.on && g.aim3.kind === 'jset') {
        const dx = o.aimTo[0] - g.aim3.x, dy = o.aimTo[1] - g.aim3.y, d = Math.hypot(dx, dy);
        if (d > 0.04) inp.move = [dx / d * Math.min(1, d / (JD.spd * DT)), dy / d * Math.min(1, d / (JD.spd * DT))];
      }
      if (jumped && h.z > 0.3 && !pressed) { S.hitWindow(g, h, w); if (w.press <= lead) { inp.jset = true; pressed = true; } }
    }
    if (o.onStep) o.onStep(g, h, inp);
    const aimNow = g.aim3.on ? [g.aim3.x, g.aim3.y, g.aim3.kind] : null;
    S.step(g, DT, inp); r.steps++;
    for (const e of S.drainEvents(g)) if (e.type === 'hit' && e.player === h && !r.h) { r.h = e; r.aim = aimNow; r.land = S.predict(g, JSET.tz, {}); r.v = [b.vx, b.vy, b.vz]; }
  }
  r.rng = nr();
  return r;
}
{
  // (a) apagada / encendida sin mover: idéntica (v, g.rng, punto previsto), 2v2
  let same = 0, n = 0, on = 0;
  for (let k = 1; k <= 30; k++) { const a = jsc(k, 0, {}), b = jsc(k, 0, { opts: { jsetAim: true } }); if (!a.h || !b.h) continue; n++;
    if (b.aim && b.aim[2] === 'jset') on++;
    if (a.rng === b.rng && a.v.every((v, i) => v === b.v[i]) && !b.h.jaim) same++; }
  ok('10a 2v2: jsetAim apagada o encendida sin mover la diana = colocación idéntica (v y g.rng)', n >= 28 && same === n && on === n, { iguales: same + '/' + n, dianaVista: on });
  // (a') 6v6 con el colocador humano: colocación en salto de 2º toque, igual con y sin la diana sin mover
  const six = (jsetAim) => { const g = S.createGame({ format: '6v6', seed: 31, ctrlRole: 'S', jsetAim, ctrl: 'one' }), h = g.ctrl, b = g.ball;
    g.mode = 'rally'; b.held = null; S.drainEvents(g); const m = g.teams[0].find(q => q.role === 'OH');
    h.x = 0.9; h.y = 0.5; h.z = 1.0; h.vz = 0.2; h.actionT = 0.3; h.lastAction = 'jump';
    Object.assign(b, { x: 0.9, y: 0.5, z: 3.3, vx: 0, vy: 0, vz: -0.5, dip: 0 });
    g.touchTeam = 0; g.touches = 1; g.lastPlayer = m; g.lastTeam = 0; g.lastKind = 'pass'; g.lastTouchT = g.time; g.ctrl = h; g.hAct = g.time;
    g._pq6 = [{ q: 0.9, t: g.time }, { q: 0, t: -9 }];
    S._refreshPred(g); S._updateAim3(g, h, DT, 0, 0);
    const kind = g.aim3.kind, nr = counted(g); S._hit(g, h, null, 0, 'jset');
    return { kind, v: [b.vx, b.vy, b.vz].map(r3), rng: nr(), plan: g.setPlan[0] && g.setPlan[0].tempo }; };
  const s0 = six(false), s1 = six(true);
  ok('10a 6v6: diana sin mover = misma colocación (v, g.rng, plan)', JSON.stringify(s0.v) === JSON.stringify(s1.v) && s0.rng === s1.rng && s0.plan === s1.plan && s1.kind === 'jset' && s0.kind !== 'jset', [s0, s1]);
  // (b) movida a D = 2,6, L = 0: cae donde la diana (al pasar por z = 3), el tempo cambia con la distancia, peor con mal timing y Colocación baja
  const errOf = (r) => r.land ? Math.hypot(r.land.x - r.aim[0], r.land.y - r.aim[1]) : 9;
  let eGood = 0, nG = 0, eBad = 0, nB = 0, eLow = 0, nL = 0, jaimN = 0; const tempos = {};
  for (let k = 1; k <= 30; k++) {
    const r = jsc(k, 0, { opts: { jsetAim: true }, aimTo: [2.6, 0] });
    if (r.h && r.h.jaim) { jaimN++; eGood += errOf(r); nG++; tempos[r.h.tempo] = (tempos[r.h.tempo] || 0) + 1; }
    const rb = jsc(k, -0.09, { opts: { jsetAim: true }, aimTo: [2.6, 0] }); if (rb.h && rb.h.jaim) { eBad += errOf(rb); nB++; }
    const rl = jsc(k, 0, { opts: { jsetAim: true, attrs: [[{ set: 5 }, null], [null, null]] }, aimTo: [2.6, 0] }); if (rl.h && rl.h.jaim) { eLow += errOf(rl); nL++; }
  }
  eGood /= Math.max(1, nG); eBad /= Math.max(1, nB); eLow /= Math.max(1, nL);
  ok('10b diana movida a (2,6 ; 0): la colocación pasa a < 0,35 m de la diana con buen timing; peor con mal timing y con Colocación baja',
    jaimN >= 28 && eGood < 0.35 && eBad > eGood * 1.5 && eLow > eGood * 1.15, { jaim: jaimN, error: r3(eGood), malTiming: r3(eBad), colocacionBaja: r3(eLow), tempos });
  const near = jsc(3, 0, { opts: { jsetAim: true }, aimTo: [1.3, 0.6] }), far = jsc(5, 0, { opts: { jsetAim: true }, aimTo: [3.2, 4.0] });
  // (la diana va a JD.spd = 8 m/s: en el vuelo recorre ~3,6 m, así que en el 2v2 la alta (s >= ~5 m) casi solo sale empezando a
  // moverla nada más despegar hacia la esquina contraria; aquí, la alta con la diana ya puesta lejos)
  const hi = (() => { const { g, h, b } = rally2({ jsetAim: true }, { x: 1.6, y: -3 }); g.touches = 1; g.lastKind = 'pass'; h.z = 1; h.vz = 0.5;
    Object.assign(b, { x: 1.6, y: -3, z: 3.3, vx: 0, vy: 0, vz: -1 }); g.aim3.on = true; g.aim3.kind = 'jset'; g.aim3.x = 3.2; g.aim3.y = 4.0; g.jsMv = 1;
    S._hit(g, h, null, 0, 'jset'); return S.drainEvents(g).find(x => x.type === 'hit'); })();
  ok('10b tempo con la distancia: cerca = rápida, más lejos = tensa, muy lejos = alta', near.h && near.h.tempo === 'quick' && far.h && far.h.tempo === 'lane' && hi && hi.jaim && hi.tempo === 'high',
    [near.h && near.h.tempo, far.h && far.h.tempo, hi && hi.tempo]);
  // (c) ataque de 2º toque con la diana 'jset' encendida y movida: el objetivo NO es la diana
  { const { g, h, b } = rally2({ jsetAim: true }, { x: 1.4 }); g.touches = 1; g.lastKind = 'pass'; h.z = 1; h.vz = 0.5;
    Object.assign(b, { x: 1.4, y: 0, z: 3.4, vx: 0, vy: 0, vz: -1 }); g.aim3.on = true; g.aim3.kind = 'jset'; g.aim3.x = 2.6; g.aim3.y = 0; g.jsMv = 1;
    S._hit(g, h, null, 0, ''); const e = S.drainEvents(g).find(x => x.type === 'hit');
    ok('10c ataque de 2º toque con la diana de colocación encendida: el remate no va a la diana', e && e.kind === 'spike' && e.target && e.target[0] < 0, e && { kind: e.kind, target: e.target.map(r3) }); }
  // (d) 6v6: la diana va al atacante cuya caja le queda más cerca (VB.AI6.dianaPlan); el balón cae donde dice jsetAimInfo (x, y: el
  // destino real, el que pinta el marcador del tempo), el pipe nunca por delante de 3,4 m y el tempo de la UI es el del toque
  { const sixAt = (seed, ax, ay, back) => { const g = S.createGame({ format: '6v6', seed, ctrlRole: 'S', jsetAim: true, ctrl: 'one' }), h = g.ctrl, b = g.ball;
      g.mode = 'rally'; b.held = null; S.drainEvents(g); const m = g.teams[0].find(q => q.role === 'OH' && q.front) || g.teams[0][1];
      h.x = 0.9; h.y = 0.5; h.z = 1.0; h.vz = 0.2; h.actionT = 0.3; h.lastAction = 'jump';
      Object.assign(b, { x: 0.9, y: 0.5, z: 3.3, vx: 0, vy: 0, vz: -0.5, dip: 0 });
      g.touchTeam = 0; g.touches = 1; g.lastPlayer = m; g.lastTeam = 0; g.lastKind = 'pass'; g.lastTouchT = g.time; g.ctrl = h; g.hAct = g.time;
      g._pq6 = [{ q: 0.95, t: g.time }, { q: 0, t: -9 }];
      S._refreshPred(g); S._updateAim3(g, h, DT, 0, 0); g.aim3.x = ax; g.aim3.y = ay; g.jsMv = 1;
      const info = Object.assign({}, S.jsetAimInfo(g, {})); S._hit(g, h, null, 0, 'jset');
      const e = S.drainEvents(g).find(x => x.type === 'hit'), land = S.predict(g, JSET.tz, {}), P = g.setPlan[0];
      return { info, e, land, P, miss: Math.hypot(land.x - info.x, land.y - info.y) }; };
    let worst = 0, n = 0, badTempo = 0, pipes = 0, badPipe = 0, nearAim = 0;
    for (const seed of [31, 5, 12]) for (const ax of [1.0, 1.6, 2.0, 2.5, 3.0, 3.6]) for (const ay of [-3, -1.5, 0, 1.5, 3]) {
      const r = sixAt(seed, ax, ay); if (!r.e || !r.e.jaim) continue; n++;
      worst = Math.max(worst, r.miss); if (r.e.tempo !== r.info.tempo) badTempo++;
      if (r.P && r.P.tempo === 'pipe') { pipes++; if (r.info.x < VB.AI6.FORM.set.pipe.d - 1e-9) badPipe++; }
      if (Math.hypot(r.info.x - ax, r.info.y - ay) < 1e-9) nearAim++;
    }
    ok('10d 6v6: la colocación cae donde enseña la UI (jsetAimInfo x/y, <= 0,15 m), mismo tempo, pipe a >= 3,4 m', n >= 80 && worst <= 0.15 && badTempo === 0 && badPipe === 0,
      { casos: n, peor: r3(worst), tempoDistinto: badTempo, pipes, pipeCorto: badPipe, dianaDentroDeCaja: nearAim });
    const g = S.createGame({ format: '6v6', seed: 3 }), p = g.teams[0][0]; g.ball.x = 1; g.ball.y = 0;
    const L = A6.dianaLane(g, p, 1.5, -3), P2 = A6.dianaPlan(g, p, 1.5, -3, {});
    ok('10d dianaLane = dianaPlan (alias)', L.lane === P2.lane && L.pref === P2.pref, [L.lane, P2.lane]); }
  // (e) 2v2: con la diana movida, el compañero IA va a la batida de jsetAimInfo
  { let dmin = 9, info = null;
    jsc(4, 0.5, { opts: { jsetAim: true }, aimTo: [2.8, 2.5], onStep: (g, h) => { const ja = S.jsetAimInfo(g, {}); if (ja && ja.moved) { info = ja; const m = g.teams[0][1]; dmin = Math.min(dmin, Math.hypot(m.x - ja.bx, m.y - ja.by)); } } });
    ok('10e 2v2: con la diana movida el compañero va a la batida de esa colocación (jsetAimInfo.bx/by)', !!info && dmin < 1.6, { batida: info && [r3(info.bx), r3(info.by)], distanciaMin: r3(dmin) }); }
  // (f) colocación de suelo: igual con jsetAim (y djump)
  { let same2 = 0, n2 = 0;
    for (let k = 1; k <= 20; k++) { const a = jsc(k, 0, { ground: true }), b = jsc(k, 0, { ground: true, opts: { jsetAim: true, djump: true } }); if (!a.h || !b.h) continue; n2++;
      if (a.rng === b.rng && a.v.every((v, i) => v === b.v[i])) same2++; }
    ok('10f colocación de suelo sin cambios con jsetAim y djump', n2 >= 15 && same2 === n2, same2 + '/' + n2); }
}

// ---------- 11. La CPU no cambia ----------
{
  const NS = QUICK ? 6 : 20, SECS = 150;
  let bad = 0, n = 0;
  for (let s = 1; s <= NS; s++) for (const o of [{ demo: true }, { autopilot: true }, { autopilot: true, format: '6v6' }]) {
    const res = [false, true].map(dj => { const g = S.createGame(Object.assign({ seed: 900 + s, djump: dj, jsetAim: dj }, o)), nr = counted(g);
      for (let i = 0; i < SECS * 120; i++) { S.step(g, DT, null); g.events.length = 0; } return [S.stateHash(g), nr()]; });
    n++; if (res[0][0] !== res[1][0] || res[0][1] !== res[1][1]) bad++;
  }
  // (vacío por construcción: createGame apaga djump/jsetAim en la demo y con autopilot; se deja como guarda de esa puerta)
  ok('11 puerta: demo y autopilot (2v2/6v6) con djump/jsetAim true = false (stateHash y g.rng a los 150 s)', bad === 0, { partidas: n, distintas: bad });
  // lo que importa: un partido HUMANO con djump en el que el humano no usa la dirección (stick < DJ.dead siempre) es idéntico al de sin
  // djump: la CPU, el compañero IA (assistMove, hitWindow, EMA) y el humano hacen lo mismo, misma huella y mismo gasto de g.rng (sin
  // jsetAim: con ella, el stick en el aire mueve la diana de colocación, y eso ya es usar la mecánica; 10a prueba la diana sin mover)
  const human = (seed, dj, fmt) => {
    const g = S.createGame({ seed, ctrl: 'one', difficulty: ['easy', 'normal', 'hard', 'expert'][seed % 4], djump: dj, format: fmt, ctrlRole: fmt ? 'OH' : undefined }), nr = counted(g);
    let rs = (seed * 2654435761) >>> 0; const rr = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
    let jumps = 0;
    for (let i = 0; i < SECS * 120; i++) {
      const p = g.ctrl, b = g.ball, inp = N0();
      if (g.mode === 'serve') { if (g.server === p && rr() < 0.02) inp.hit = true; }
      else if (p) {
        const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1, k = (DJ.dead - 0.02) / d; // stick siempre por debajo de DJ.dead
        inp.move = [dx * k, dy * k];
        if (p.z === 0 && d < 1.6 && b.z > 2.4 && rr() < 0.15) { inp.jump = true; jumps++; }
        if (d < 1.4 && rr() < 0.3) inp.hit = true;
      }
      S.step(g, DT, inp); g.events.length = 0;
    }
    return [S.stateHash(g), nr(), jumps];
  };
  let badH = 0, nH = 0, jH = 0;
  for (let s = 1; s <= (QUICK ? 4 : 12); s++) for (const fmt of [undefined, '6v6']) {
    const a = human(700 + s, false, fmt), b2 = human(700 + s, true, fmt); nH++; jH += a[2];
    if (a[0] !== b2[0] || a[1] !== b2[1]) badH++;
  }
  ok('11 partido humano con djump sin usar la dirección (stick < DJ.dead) = sin djump (2v2 y 6v6: stateHash y g.rng a los 150 s)', badH === 0 && jH > 50, { partidas: nH, distintas: badH, saltos: jH });
}

// ---------- 12. Aterrizaje duro, eventos, landingOf, estadísticas ----------
{
  const { g, h } = rally2({ djump: true }, { x: 7 }); h.avx = -5.6; S._humanJump(g, h, -1, 0, 1, false); S.drainEvents(g);
  const L = S.landingOf(g, h, {}); let land = null;
  for (let i = 0; i < 140 && !land; i++) { S._stepPlayer(g, h, DT, 0, 0); for (const e of S.drainEvents(g)) if (e.type === 'landPlayer') land = e; }
  const x1 = h.x, clean = h.dj === 0 && h.avx === 0 && h.jF === 0 && h.landT === DJ.landT; S._stepPlayer(g, h, DT, -1, 0); const v1 = (h.x - x1) / DT;
  ok('12 aterrizaje duro tras 1,79: landPlayer.hard, landT y carrera ×0,6; landingOf acierta', land && land.hard === true && Math.abs(L.x - x1) < 0.03 && Math.abs(v1 + C.SPEED * DJ.landK) < 1e-6 && clean,
    { hard: land && land.hard, prevista: r3(L.x), real: r3(x1), vel: r3(v1) });
  // estadísticas g.stats.dj con un remate con impulso que gana el punto
  const sp = spikeAt(1.6, 0, { opts: { stats: true }, seed: 4 }), gg = sp.g;
  let pt = null; for (let i = 0; i < 600 && !pt; i++) { S.step(gg, DT, null); for (const e of S.drainEvents(gg)) if (e.type === 'point') pt = e; }
  const st = gg.stats.dj;
  ok('12 estadísticas: g.stats.dj.mom cuenta el uso (y el punto si lo gana)', st && st.mom[0] === 1 && (pt && pt.team === 0 && pt.how === 'kill' ? st.mom[1] === 1 : st.mom[1] === 0), { dj: st, punto: pt && [pt.team, pt.how] });
  const nd = S.createGame({ seed: 1, stats: true });
  ok('12 sin djump no hay g.stats.dj ni campos de evento nuevos con valor', !nd.stats.dj && nd.djump === false && nd.jsetAim === false, null);
}

// ---------- 13. Online ----------
{
  const mk = () => S.createGame({ online: true, seed: 4242, humans: [{}, { jsetAim: true }], djump: true, venue: 'hall' });
  const mulberry = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const inputs = (() => { const r = mulberry(99), L = []; for (let i = 0; i < 120 * 60; i++) { const one = () => ({ move: r() < 0.6 ? [r() * 2 - 1, r() * 2 - 1] : [0, 0], hit: r() < 0.03, jump: r() < 0.02, jset: r() < 0.01, switchPlayer: false }); L.push([one(), one()]); } return L; })();
  const a = mk(), b = mk(); let same = true, dj = 0;
  for (let i = 0; i < inputs.length; i++) { S.step(a, DT, inputs[i]); S.step(b, DT, inputs[i]); for (const e of S.drainEvents(a)) if (e.type === 'jump' && e.dir) dj++; S.drainEvents(b); if (S.stateHash(a) !== S.stateHash(b)) { same = false; break; } }
  // rollback: copia a mitad y vuelve a simular
  const c = mk(), d = mk(); let rb = true;
  for (let i = 0; i < 3000; i++) { S.step(c, DT, inputs[i]); S.drainEvents(c); }
  S.copyGame(d, c);
  for (let i = 3000; i < inputs.length; i++) { S.step(c, DT, inputs[i]); S.step(d, DT, inputs[i]); S.drainEvents(c); S.drainEvents(d); if (S.stateHash(c) !== S.stateHash(d)) { rb = false; break; } }
  ok('13 online: djump y jsetAim (solo hueco 1): dos partidas con las mismas entradas = mismo hash, también tras copyGame', same && rb && a.hum[1].jsetAim === true && a.hum[0].jsetAim === false && a.djump === true, { igual: same, rollback: rb, saltosConDireccion: dj });
}

console.log(failures ? failures + ' FALLOS' : 'TODO OK');
process.exit(failures ? 1 : 0);
