#!/usr/bin/env node
/* MAKE THE CUT — tools/zonetest.js (owner: zona y saque de firma)
 * Pruebas de LA ZONA (createGame({zone})) y del SAQUE DE FIRMA (createGame({serveSig})), js/sim.js. Carga sim.js, ai.js y ai6.js en vm.
 *  1. Sin opciones no existen g.zn ni g.sig; con la zona imposible ({th: 1e9}) o el saque Clásico sin gesto, la partida es idéntica paso a
 *     paso (stateHash, que incluye el estado de g.rng), 20 semillas × 120 s, 2v2 y 6v6, con un bot humano.
 *  2. Calibrado con autopilot (atributos 50, Normal), 30 semillas: % de sets con alguna zona tuya y duración media.
 *  3. Mejora puesta y quitada: p.prof y p.ak iguales campo a campo a los de antes (sin atributos, null).
 *  4. Salidas forzadas: error, racha del rival, fin de set, banquillo, cambio del rival y tiempo.
 *  5. Challenge: el punto revocado deja g.zn como antes; y partidos enteros con challenges revocados sin descuadres.
 *  6. copyGame en plena zona: la copia y la partida siguen con el mismo stateHash 10 s.
 *  7. Saques: 400 por estilo contra la recepción de la CPU (Normal), desfase ~N(0, 0,06), diana central: ace, falta, velocidad, vuelo.
 *     EV (ace − falta) a ±4 puntos de su familia; cada estilo se distingue en algún rasgo ≥ 15 %; el Globo en pabellón pasa a Clásico.
 *  8. Gesto antes de sacar: balón finito, sin g.rng en 'ready', el lanzamiento corta el gesto al momento y la partida no cambia.
 *  9. Textos (VB.SERVE_SIG y el HUD de la zona en js/ui.js): sin «·», «1.er», «{», «undefined» ni «NaN».
 * 10. Sin Math.random en js/sim.js.
 * Uso: node tools/zonetest.js [--quick]   (--quick: menos semillas). Sale con código 1 si algo falla; al final, «TODO OK». */
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
const VB = load(), S = VB.Sim, ZN = VB.ZONE, SIG = VB.SERVE_SIG;
let fails = 0, oks = 0;
function ok(name, cond, info) {
  if (cond) { oks++; console.log('  ok   ' + name + (info !== undefined ? '  (' + info + ')' : '')); }
  else { fails++; console.log('  FALLA ' + name + (info !== undefined ? '  (' + info + ')' : '')); }
}
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { return (r() + r() + r() + r() - 2) * 1.732; }
const DT = 1 / 120;
/** Bot humano determinista (azar propio; solo lee el estado): como el de fingerprint6. */
function makeBot(seed) {
  const r = mulberry(seed * 7919 + 13); let serveWait = -1, jumpCd = 0;
  return function (g) {
    const p = g.ctrl, b = g.ball, inp = { move: [0, 0], hit: false, jump: false, switchPlayer: false };
    if (g.mode === 'serve') {
      if (g.server !== p || g.serving !== 0) return inp;
      if (serveWait < 0) serveWait = 40 + Math.floor(r() * 200);
      if (--serveWait === 0) { if (r() < 0.4) inp.jump = true; else inp.hit = true; }
      if (g.serveState === 'toss' && b.z > 2.3 && b.vz < 0 && r() < 0.25) inp.hit = true;
      return inp;
    }
    serveWait = -1;
    if (g.mode !== 'rally') return inp;
    const pr = g.pr1, dx = pr.x - p.x, dy = pr.y - p.y, d = Math.hypot(dx, dy), mine = S.side(0) * pr.x > 0;
    if (mine && d > 0.25) inp.move = [dx / d * Math.min(1, d), dy / d * Math.min(1, d)];
    const bd = Math.hypot(b.x - p.x, b.y - p.y);
    if (bd < 1.6 && b.z < 3.2 && r() < 0.35) inp.hit = true;
    if (--jumpCd <= 0 && Math.abs(p.x) < 2.5 && bd < 2.5 && b.z > 2.3 && r() < 0.2) { inp.jump = true; jumpCd = 60; }
    return inp;
  };
}
function drain(g) { const e = g.events.slice(); g.events.length = 0; return e; }
function snapPA(p) { return JSON.stringify({ prof: p.prof, ak: p.ak, st: p.st }); }
function attrs50() { const o = {}; for (const k of VB.ATTR_KEYS) o[k] = 50; return o; }
function attrsVar(seed) { const r = mulberry(seed), o = {}; for (const k of VB.ATTR_KEYS) o[k] = 30 + Math.floor(r() * 60); return o; }

// ---------------------------------------------------------------- 1. determinismo
console.log('1. Sin la zona ni el saque de firma, la partida no cambia');
{
  const g0 = S.createGame({ seed: 5 });
  ok('sin opciones: no hay g.zn ni g.sig', g0.zn === undefined && g0.sig === undefined && !('zn' in g0) && !('sig' in g0));
  const gd = S.createGame({ seed: 5, demo: true, zone: { cpu: true }, serveSig: { id: 'potente', gest: 'tres' } });
  const go = S.createGame({ seed: 5, drill: 'serve', zone: {}, serveSig: { id: 'potente', gest: 'tres' } });
  ok('nunca en la demo ni en el Entrenamiento', !gd.zn && !gd.sig && !go.zn && !go.sig);
  ok('Clásico sin gesto: sigSane devuelve undefined', S.sigSane({ id: 'clasico', gest: 'normal' }, 'beach') === undefined && S.sigSane(null) === undefined);
  const NS = QUICK ? 6 : 20, SECS = 120;
  for (const fmt of ['2v2', '6v6']) {
    let same = true, steps = 0, where = '', zns = 0, rngA = 0;
    for (let sd = 1; sd <= NS && same; sd++) {
      const o = { seed: sd * 37 + 1, format: fmt, difficulty: ['easy', 'normal', 'hard', 'expert'][sd % 4], ctrl: 'one' };
      const A = S.createGame(Object.assign({}, o)), B = S.createGame(Object.assign({}, o, { zone: { cpu: true, th: 1e9 } })), Cc = S.createGame(Object.assign({}, o, { serveSig: { id: 'clasico', gest: 'normal' } }));
      if (!B.zn || Cc.sig) { same = false; where = 'opciones'; break; }
      const bA = makeBot(sd), bB = makeBot(sd), bC = makeBot(sd);
      for (let k = 0; k < SECS * 120; k++) {
        S.step(A, DT, bA(A)); S.step(B, DT, bB(B)); S.step(Cc, DT, bC(Cc));
        A.events.length = 0; for (const e of B.events) if (e.type === 'zone') zns++; B.events.length = 0; Cc.events.length = 0;
        steps++;
        const hA = S.stateHash(A);
        if (hA !== S.stateHash(B) || hA !== S.stateHash(Cc)) { same = false; where = fmt + ' semilla ' + o.seed + ' paso ' + k; break; }
      }
      rngA += A.rng.get() & 1;
    }
    ok(fmt + ': con {th: 1e9} y con Clásico, mismo stateHash (y g.rng) en cada paso', same && zns === 0, same ? steps + ' pasos' : where);
  }
}

// ---------------------------------------------------------------- 2. calibrado
console.log('2. Calibrado (autopilot, atributos 50, Normal)');
function calib(fmt, n) {
  let sets = 0, setsZ = 0, stints = [], ents = 0, cpuE = 0, inv = 0;
  for (let sd = 1; sd <= n; sd++) {
    const A = fmt === '6v6' ? null : [[attrs50(), attrs50()], [attrs50(), attrs50()]];
    const g = S.createGame({ seed: sd * 101, autopilot: true, difficulty: 'normal', format: fmt, stats: true, zone: { cpu: true }, attrs: A || undefined });
    let t0 = 0, inSet = false;
    for (let k = 0; k < 120 * 1500 && g.mode !== 'over'; k++) {
      S.step(g, DT);
      for (const e of drain(g)) {
        if (e.type === 'zone' && e.team === 0) { if (e.on) { ents++; t0 = g.zn.t[0]; inSet = true; } else stints.push(g.zn.t[0] - t0); }
        if (e.type === 'zone' && e.team === 1 && e.on) cpuE++;
        if (e.type === 'set') { sets++; if (inSet) setsZ++; inSet = g.zn.on[0]; }
      }
      if ((k & 1023) === 0) { // invariante: con la zona encendida, la mejora puesta; apagada, la de siempre
        for (let t = 0; t < 2; t++) { const p = S.znWho(g, t); if (!p || !p.st) continue; const want = S.statProf(g.prof[p.team], g.zn.on[t] ? boosted(p.st, t) : p.st); if (JSON.stringify(want) !== JSON.stringify(p.prof)) inv++; }
      }
    }
    if (g.stats.zn.n[0] !== g.zn.n[0]) inv++;
  }
  const mean = stints.reduce((a, b) => a + b, 0) / Math.max(1, stints.length);
  return { sets, frac: setsZ / Math.max(1, sets), ents, mean, cpuE, inv };
}
function boosted(st, t) { const o = {}; for (const k of VB.ATTR_KEYS) o[k] = Math.max(1, Math.min(99, Math.round(st[k] + (ZN.boost[k] || 0) * (t ? ZN.cpuBoost : 1)))); return o; }
{
  const c2 = calib('2v2', QUICK ? 10 : 30);
  ok('2v2: sets con alguna zona en [0,25, 0,75]', c2.frac >= 0.25 && c2.frac <= 0.75, (c2.frac * 100).toFixed(0) + ' % de ' + c2.sets + ' sets; ' + c2.ents + ' entradas; CPU ' + c2.cpuE);
  ok('2v2: duración media en [25, 60] s', c2.mean >= 25 && c2.mean <= 60, c2.mean.toFixed(1) + ' s');
  ok('2v2: la mejora siempre cuadra con el estado', c2.inv === 0, c2.inv);
  const c6 = calib('6v6', QUICK ? 6 : 30);
  ok('6v6: sets con alguna zona en [0,2, 0,7]', c6.frac >= 0.2 && c6.frac <= 0.7, (c6.frac * 100).toFixed(0) + ' % de ' + c6.sets + ' sets; ' + c6.ents + ' entradas; CPU ' + c6.cpuE);
  ok('6v6: duración media en [25, 60] s', c6.ents === 0 || (c6.mean >= 25 && c6.mean <= 60), c6.mean.toFixed(1) + ' s');
  ok('6v6: la mejora siempre cuadra con el estado', c6.inv === 0, c6.inv);
}

// ---------------------------------------------------------------- 3. mejora puesta y quitada
console.log('3. Mejora de la zona: se pone en el sitio y se quita exacta');
{
  const st = attrsVar(77);
  const g = S.createGame({ seed: 3, zone: { cpu: true }, attrs: [[st, attrsVar(78)], [attrsVar(79), attrsVar(80)]] });
  const p = S.znWho(g, 0), prof0 = p.prof, ak0 = p.ak, before = snapPA(p);
  S.znDebug(g, 0);
  const evOn = drain(g).filter(e => e.type === 'zone');
  ok('znDebug entra en la zona (evento zone on)', S.znOn(g, 0) && evOn.length === 1 && evOn[0].on && evOn[0].why === 'fill' && evOn[0].player === p);
  ok('la mejora va en el mismo objeto (p.prof y p.ak no se cambian de sitio)', p.prof === prof0 && p.ak === ak0);
  ok('con zona: lee antes, más precisión y más potencia', p.prof.react < JSON.parse(before).prof.react && p.ak.spike > JSON.parse(before).ak.spike && p.ak.spread < JSON.parse(before).ak.spread);
  const pz = S.statProf(g.prof[0], boosted(st, 0));
  ok('con zona: perfil = statProf(st + mejora)', JSON.stringify(pz) === JSON.stringify(p.prof));
  ok('p.st no se toca', JSON.stringify(p.st) === JSON.stringify(JSON.parse(before).st));
  S._znApply(g, 0, false); g.zn.on[0] = false;
  ok('al salir: p.prof, p.ak y p.st iguales campo a campo', snapPA(p) === before);
  // sin atributos (Partido rápido): se crean y vuelven a null
  const g2 = S.createGame({ seed: 4, zone: {} }), p2 = S.znWho(g2, 0);
  ok('sin atributos: antes, p.prof y p.ak null', p2.prof === null && p2.ak === null);
  S.znDebug(g2, 0);
  ok('sin atributos en zona: perfil de 50 + mejora', p2.prof && p2.ak && JSON.stringify(p2.prof) === JSON.stringify(S.statProf(g2.prof[0], boosted(attrs50(), 0))) && g2.zn.fill[0] === 1);
  S._znApply(g2, 0, false);
  ok('sin atributos al salir: null otra vez', p2.prof === null && p2.ak === null && g2.zn.fill[0] === 0);
  // CPU: la mitad
  const g3 = S.createGame({ seed: 6, difficulty: 'hard', zone: { cpu: true }, attrs: [[st, st], [attrsVar(9), attrsVar(10)]] }), c = S.znWho(g3, 1);
  ok('la racha de la CPU: el rival con más remate + saque + bloqueo', c && c.team === 1 && g3.teams[1].every(q => (q.st.spike + q.st.serve + q.st.block) <= (c.st.spike + c.st.serve + c.st.block)));
  S.znDebug(g3, 1);
  ok('racha de la CPU: la mitad de la mejora', JSON.stringify(c.prof) === JSON.stringify(S.statProf(g3.prof[1], boosted(c.st, 1))));
  const ge = S.createGame({ seed: 6, difficulty: 'easy', zone: { cpu: true } });
  ok('en Fácil la CPU no tiene racha', ge.zn.cpu === false && ge.zn.who[1] === -1);
  ok('API sin g.zn: 0 / false / null', S.znOn(g0x(), 0) === false && S.znMeter(g0x(), 0) === 0 && S.znEnergy(g0x(), 0) === 0 && S.znWho(g0x(), 0) === null);
}
function g0x() { return S.createGame({ seed: 1 }); }

// ---------------------------------------------------------------- 4. salidas
console.log('4. Salidas de la zona');
function zoneEv(evs, t) { return evs.filter(e => e.type === 'zone' && e.team === (t || 0)); }
function fresh(o) { const g = S.createGame(Object.assign({ seed: 11, zone: { cpu: true }, stats: true }, o || {})); drain(g); S.znDebug(g, 0); drain(g); return g; }
{
  let g = fresh(), me = S.znWho(g, 0);
  g.mode = 'rally'; S._point(g, 1, 'net', 'Toca la red', me);
  let z = zoneEv(drain(g));
  ok('fallo tuyo: sale con why error', z.length === 1 && !z[0].on && z[0].why === 'error' && !S.znOn(g, 0), z.map(e => e.why).join());
  ok('tras salir, enfriamiento y medidor a 0', g.zn.cool[0] === ZN.cool && g.zn.m[0] === 0);
  g = fresh(); const ev1 = [];
  for (let i = 0; i < 3; i++) { g.mode = 'rally'; g.lastPlayer = null; g.lastTeam = 1; S._point(g, 1, 'in', 'Dentro'); ev1.push(...drain(g)); }
  z = zoneEv(ev1);
  ok('3 puntos seguidos del rival: why streak', z.length === 1 && z[0].why === 'streak' && g.zn.run[0] === 0);
  g = fresh(); g.score = [24, 10]; g.mode = 'rally'; g.lastTeam = 0; g.lastKind = 'free'; g.lastPlayer = g.teams[0][1]; S._point(g, 0, 'in', 'Dentro');
  z = zoneEv(drain(g));
  ok('fin de set: why set y el medidor a ' + ZN.setM, z.length === 1 && z[0].why === 'set' && g.zn.m[0] === ZN.setM);
  g = fresh(); g.sets = [1, 0]; g.score = [24, 10]; g.mode = 'rally'; g.lastTeam = 0; g.lastKind = 'free'; g.lastPlayer = g.teams[0][1]; S._point(g, 0, 'in', 'Dentro');
  z = zoneEv(drain(g));
  ok('fin del partido: why end', z.length === 1 && z[0].why === 'end');
  g = fresh({ format: '6v6' }); me = S.znWho(g, 0);
  ok('6v6: la zona es de tu atleta (ctrlBase)', me === g.ctrlBase);
  S._emit(g, { type: 'sub', team: 0, outP: me, inP: g.teams[0][0] === me ? g.teams[0][1] : g.teams[0][0], why: 'human' });
  z = zoneEv(drain(g));
  ok('te sientan: why bench', z.length === 1 && z[0].why === 'bench');
  g = fresh({ format: '6v6' }); const e0 = g.zn.e[0];
  S._emit(g, { type: 'sub', team: 1, outP: g.teams[1][5], inP: g.teams[1][4], why: 'garbage' });
  ok('cambio del entrenador rival: −' + ZN.subE + ' de energía', Math.abs(g.zn.e[0] - (e0 - ZN.subE)) < 1e-9 && S.znOn(g, 0));
  S._emit(g, { type: 'sub', team: 1, outP: g.teams[1][4], inP: g.teams[1][5], why: 'garbage' });
  ok('dos cambios del rival en el mismo balón muerto: cuentan uno', Math.abs(g.zn.e[0] - (e0 - ZN.subE)) < 1e-9);
  S._emit(g, { type: 'sub', team: 1, outP: g.teams[1][4], inP: g.teams[1][5], why: 'serveBack' }); g.score[1]++;
  S._emit(g, { type: 'sub', team: 1, outP: g.teams[1][4], inP: g.teams[1][5], why: 'doubleBack' });
  ok('las vueltas automáticas del rival (serveBack, doubleBack) no restan', Math.abs(g.zn.e[0] - (e0 - ZN.subE)) < 1e-9);
  for (let i = 0; i < 2; i++) { g.score[1]++; S._emit(g, { type: 'sub', team: 1, outP: g.teams[1][5], inP: g.teams[1][4], why: 'garbage' }); }
  z = zoneEv(drain(g));
  ok('tres cambios del rival: se acaba (why sub)', z.length === 1 && z[0].why === 'sub');
  g = fresh(); S._emit(g, { type: 'timeout', team: 1 }); z = zoneEv(drain(g));
  ok('tiempo muerto del rival (preparado): why timeout', z.length === 1 && z[0].why === 'timeout');
  g = fresh(); let tz = 0, tsec = 0;
  for (let k = 0; k < 120 * 200 && S.znOn(g, 0); k++) { S.step(g, DT); for (const e of zoneEv(drain(g))) if (!e.on) tz = e.why; if (g.mode === 'serve' || g.mode === 'rally') tsec += DT; }
  ok('sin hacer nada se apaga (why time u otra) y dura ~' + Math.round(100 / ZN.drain) + ' s de juego como mucho', !S.znOn(g, 0) && tsec <= 100 / ZN.drain + 1, tz + ', ' + tsec.toFixed(1) + ' s');
  // la energía no baja en la pausa del punto
  g = fresh(); g.mode = 'point'; g.timer = 50; const eP = g.zn.e[0]; for (let k = 0; k < 240; k++) S.step(g, DT); drain(g);
  ok('en la pausa del punto la energía no baja', g.zn.e[0] === eP);
  // ganancias: encadenar y enfriar
  g = S.createGame({ seed: 12, zone: {} }); drain(g); const p0 = S.znWho(g, 0);
  S._emit(g, { type: 'hit', kind: 'pass', player: p0, team: 0, grade: 'perfect', recv: true, dig: false }); const m1 = g.zn.m[0];
  S._emit(g, { type: 'hit', kind: 'pass', player: p0, team: 0, grade: 'perfect', recv: true, dig: false }); const m2 = g.zn.m[0] - m1;
  ok('recepción perfecta suma ' + ZN.gain.recvP + ' y la 2ª seguida más (encadenar)', Math.abs(m1 - ZN.gain.recvP) < 1e-9 && m2 > m1, m1.toFixed(2) + ' / ' + m2.toFixed(2));
  S._emit(g, { type: 'hit', kind: 'pass', player: p0, team: 0, grade: 'poor', recv: true, dig: false });
  ok('una recepción mala resta y corta la cadena', g.zn.combo[0] === 0 && g.zn.m[0] < m1 + m2);
  S._emit(g, { type: 'hit', kind: 'pass', player: g.teams[0][1], team: 0, grade: 'perfect', recv: true, dig: false });
  ok('lo que hace tu compañero no cuenta', g.zn.combo[0] === 0);
  g.zn.cool[0] = 2; const mc = g.zn.m[0]; S._emit(g, { type: 'hit', kind: 'pass', player: p0, team: 0, grade: 'perfect', recv: true, dig: false });
  ok('enfriando no suma', g.zn.m[0] === mc);
}

// ---------------------------------------------------------------- 5. challenge
console.log('5. Challenge: el punto revocado deshace la zona');
{
  const g = S.createGame({ seed: 21, zone: { cpu: true }, stats: true }); drain(g);
  const p0 = S.znWho(g, 0);
  g.zn.m[0] = 95; g.zn.combo[0] = 2;
  const before = JSON.stringify(g.zn), sb = JSON.stringify(g.stats.zn), prof0 = snapPA(p0);
  g._snap = {}; // (point guarda el deshacer solo si el punto se puede revisar)
  g.mode = 'rally'; g.lastKind = 'serve'; g.lastTeam = 0; g.atkTeam = 0; g.atkHow = 'ace'; g.zn.atk[0] = p0.id; g.lastPlayer = p0;
  const sp = S._point; g._pendCall = null;
  // ace tuyo → entra en la zona
  g.call = null; g._snap = null; // point recalcula _snap con g.call: forzamos la llamada
  g._pendCall = { x: -5, y: 0, dist: 0.01, truthIn: true, calledIn: true, wrong: false, alt: [1, 'out', 'Fuera'] };
  sp(g, 0, 'in', 'Dentro');
  const evs = drain(g), entered = S.znOn(g, 0);
  ok('el ace te mete en la zona', entered && zoneEv(evs).some(e => e.on));
  S._znUndo(g);
  const ev2 = drain(g), z2 = JSON.parse(JSON.stringify(g.zn)); z2.u = null;
  const b0 = JSON.parse(before); b0.u = null;
  ok('deshacer: g.zn igual que antes del punto', JSON.stringify(z2.m) === JSON.stringify(b0.m) && JSON.stringify(z2.on) === JSON.stringify(b0.on) && JSON.stringify(z2.combo) === JSON.stringify(b0.combo) && JSON.stringify(z2.n) === JSON.stringify(b0.n));
  ok('deshacer: la mejora se quita (evento zone undo)', snapPA(p0) === prof0 && zoneEv(ev2).some(e => e.why === 'undo' && !e.on));
  ok('deshacer: estadística de la zona igual', JSON.stringify(Object.assign({}, g.stats.zn, { _u: null })) === JSON.stringify(Object.assign(JSON.parse(sb), { _u: null })));
  // partidos de verdad con challenges que revocan (árbitro que falla mucho, la CPU pide): la zona sigue cuadrando
  let over = 0, bad = 0;
  for (let sd = 1; sd <= (QUICK ? 4 : 10); sd++) {
    const h = S.createGame({ seed: 400 + sd, autopilot: true, stats: true, zone: { cpu: true, th: 40 }, difficulty: 'hard', ref: { p1: 1, p2: 1, p3: 1, d1: 0.1, d2: 0.2, d3: 0.3, chal: 5 } });
    for (let k = 0; k < 120 * 900 && h.mode !== 'over'; k++) {
      S.step(h, DT);
      for (const e of drain(h)) if (e.type === 'challengeResult' && e.overturned) over++;
      if ((k & 511) === 0) for (let t = 0; t < 2; t++) { const p = S.znWho(h, t); if (p && (h.zn.on[t] ? !p.prof : (p.prof !== null))) bad++; }
    }
  }
  ok('partidos con challenges revocados: la mejora cuadra siempre', bad === 0 && over > 0, over + ' revocados');
}
{
  // saque de firma: el ace anulado por un challenge no cuenta en g.stats.sig (hoja final)
  const g = S.createGame({ seed: 22, stats: true, serveSig: { id: 'potente', gest: 'normal' } }); drain(g);
  const sv = g.teams[0][0];
  g.mode = 'rally'; g.serving = 0; g.sigLast = 'potente'; g.lastKind = 'serve'; g.lastTeam = 0; g.atkTeam = 0; g.atkHow = 'ace'; g.lastPlayer = sv; g.rally.hits = 0;
  g._pendCall = { x: -5, y: 0, dist: 0.01, truthIn: false, calledIn: true, wrong: true, alt: [1, 'out', 'Fuera'] };
  S._point(g, 0, 'in', 'Dentro'); drain(g);
  const a1 = g.stats.sig.aces;
  const asked = S.challenge(g, 1);
  for (let k = 0; k < 120 * 8 && g.review; k++) S.step(g, DT);
  drain(g);
  ok('saque de firma: el ace anulado por un challenge se descuenta', a1 === 1 && asked && !g.review && g.stats.sig.aces === 0 && g.stats.sig.faults === 1, 'aces ' + a1 + '→' + g.stats.sig.aces + ', fallos ' + g.stats.sig.faults);
}

// ---------------------------------------------------------------- 6. copyGame
console.log('6. copyGame en plena zona');
{
  for (const fmt of ['2v2', '6v6']) {
    const o = { seed: 31, autopilot: true, format: fmt, zone: { cpu: true }, difficulty: 'hard' };
    const g = S.createGame(o), sh = S.createGame(o);
    for (let k = 0; k < 120 * 20; k++) { S.step(g, DT); drain(g); }
    S.znDebug(g, 0); S.znDebug(g, 1); drain(g);
    S.copyGame(sh, g);
    let same = true, k = 0;
    ok(fmt + ': la copia lleva la zona y la mejora', sh.zn.on[0] && sh.zn.on[1] && JSON.stringify(S.znWho(sh, 0).prof) === JSON.stringify(S.znWho(g, 0).prof) && sh.zn !== g.zn);
    for (; k < 120 * 10; k++) { S.step(g, DT); S.step(sh, DT); drain(g); drain(sh); if (S.stateHash(g) !== S.stateHash(sh)) { same = false; break; } }
    ok(fmt + ': mismo stateHash 10 s', same, same ? '' : 'paso ' + k);
  }
}

// ---------------------------------------------------------------- 7. saques de firma
console.log('7. Saques de firma');
function serveTrial(style, btn, seed, venue) {
  const g = S.createGame({ seed, difficulty: 'normal', ctrl: 'one', venue, serveSig: style === 'clasico' ? undefined : { id: style, gest: 'normal' } });
  const r = mulberry(seed * 31 + 7), teT = gauss(r) * 0.06;
  let pressed = false, swung = false, res = null, he = null, t0 = 0, flight = -1, rg = '', apex = 0, rnd = 0;
  for (let k = 0; k < 120 * 14 && !res; k++) {
    const inp = { move: [0, 0], hit: false, jump: false, switchPlayer: false };
    if (g.mode === 'serve' && g.serveState === 'ready' && g.serveAuth && !pressed) { inp[btn] = true; pressed = true; }
    else if (g.mode === 'serve' && g.serveState === 'toss') {
      g.aim3.on = true; g.aim3.kind = 'serve'; g.aim3.x = -4.5 * g.cs; g.aim3.y = 0;
      const w = S.hitWindow(g, g.ctrl);
      if (!swung && w.press <= -teT && g.tossT > 0.15) { inp.hit = true; swung = true; }
    }
    S.step(g, DT, inp);
    if (he && flight < 0) apex = Math.max(apex, g.ball.z);
    if (!isFinite(g.ball.x + g.ball.y + g.ball.z)) rnd = NaN;
    for (const e of drain(g)) {
      if (e.type === 'hit' && e.kind === 'serve') { he = e; t0 = g.time; }
      else if (he && flight < 0 && (e.type === 'hit' || e.type === 'land' || e.type === 'net')) { flight = g.time - t0; if (e.type === 'hit') rg = e.grade; }
      if (e.type === 'point') res = { w: e.team, how: e.how, hits: g.rally.hits };
    }
  }
  return { he, res, flight, rg, apex, ok: rnd === 0, sig: g.sig, used: he ? he.sig : undefined, stats: g.stats };
}
function serveStats(style, btn, venue, n) {
  const o = { n: 0, ace: 0, fault: 0, spd: 0, nh: 0, fl: 0, nf: 0, poor: 0, nr: 0, apex: 0, used: 0, finite: true };
  for (let i = 1; i <= n; i++) {
    const t = serveTrial(style, btn, i * 977 + 3, venue);
    if (!t.ok) o.finite = false;
    if (!t.res) continue; o.n++;
    if (t.he) { o.nh++; o.spd += t.he.speed; if (t.used) o.used++; }
    if (t.flight > 0) { o.fl += t.flight; o.nf++; o.apex += t.apex; }
    if (t.res.w === 0 && t.res.how === 'ace') o.ace++;
    if (t.res.w === 1 && t.res.hits === 0) o.fault++;
    if (t.rg) { o.nr++; if (t.rg === 'poor') o.poor++; }
  }
  o.aceP = 100 * o.ace / o.n; o.faultP = 100 * o.fault / o.n; o.ev = o.aceP - o.faultP; o.spd /= Math.max(1, o.nh); o.fl /= Math.max(1, o.nf); o.apex /= Math.max(1, o.nf); o.poorP = 100 * o.poor / Math.max(1, o.nr);
  return o;
}
function fmtS(o) { return 'ace ' + o.aceP.toFixed(1) + ' %, falta ' + o.faultP.toFixed(1) + ' %, EV ' + o.ev.toFixed(1) + ', ' + o.spd.toFixed(1) + ' m/s, vuelo ' + o.fl.toFixed(2) + ' s, cima ' + o.apex.toFixed(1) + ' m, recepción mala ' + o.poorP.toFixed(0) + ' %'; }
{
  const N = QUICK ? 120 : 400, EVTOL = QUICK ? 8 : 4;   // (--quick: 120 saques, más ruido)
  const R = {};
  const list = [['hall', 'clasico', 'hit'], ['hall', 'clasico', 'jump'], ['hall', 'potente', 'jump'], ['hall', 'flotsalto', 'hit'], ['hall', 'liftado', 'hit'], ['hall', 'abajo', 'hit'],
    ['beach', 'clasico', 'hit'], ['beach', 'globo', 'hit']];
  for (const [v, st, b] of list) { R[v + st + b] = serveStats(st, b, v, N); console.log('       ' + (v + ' ' + st + '/' + b).padEnd(24) + fmtS(R[v + st + b])); }
  const fam = { potente: 'hallclasicojump', flotsalto: 'hallclasicohit', liftado: 'hallclasicohit', abajo: 'hallclasicohit', globo: 'beachclasicohit' };
  for (const st of ['potente', 'flotsalto', 'liftado', 'abajo', 'globo']) {
    const k = (st === 'globo' ? 'beach' : 'hall') + st + (st === 'potente' ? 'jump' : 'hit'), o = R[k], f = R[fam[st]];
    ok(SIG.byId[st].name + ': se usa en cada saque de su botón', o.used === o.nh && o.nh > 0, o.used + '/' + o.nh);
    ok(SIG.byId[st].name + ': EV a ±' + EVTOL + ' puntos de su familia', Math.abs(o.ev - f.ev) <= EVTOL, o.ev.toFixed(1) + ' frente a ' + f.ev.toFixed(1));
    const tr = { velocidad: rel(o.spd, f.spd), vuelo: rel(o.fl, f.fl), cima: rel(o.apex, f.apex), ace: rel(o.aceP + 1, f.aceP + 1), falta: rel(o.faultP + 1, f.faultP + 1), recepcion: rel(o.poorP + 1, f.poorP + 1) };
    const best = Object.keys(tr).sort((a, b) => tr[b] - tr[a])[0];
    ok(SIG.byId[st].name + ': se distingue en algún rasgo ≥ 15 %', tr[best] >= 0.15, best + ' ' + (tr[best] * 100).toFixed(0) + ' %');
    ok(SIG.byId[st].name + ': balón siempre finito', o.finite);
  }
  ok('Bomba: más rápido y más fallos que el saque en salto', R.hallpotentejump.spd > R.hallclasicojump.spd && R.hallpotentejump.faultP > R.hallclasicojump.faultP);
  ok('De abajo: casi nunca falla y casi nunca hace daño', R.hallabajohit.faultP <= R.hallclasicohit.faultP && R.hallabajohit.aceP < R.hallclasicohit.aceP);
  ok('De tenis: más rápido que el flotante y sin baile', R.hallliftadohit.spd > R.hallclasicohit.spd);
  ok('Globo: sube muy alto y vuela mucho más', R.beachglobohit.apex > 9 && R.beachglobohit.fl > 2 * R.beachclasicohit.fl);
  // el otro botón saca como siempre
  const t1 = serveTrial('potente', 'hit', 5, 'hall'), t2 = serveTrial('clasico', 'hit', 5, 'hall');
  ok('con Bomba, GOLPEAR saca el flotante de siempre (mismo saque)', t1.he && t2.he && t1.used === '' && t1.he.speed === t2.he.speed && t1.he.x === t2.he.x);
  const t3 = serveTrial('abajo', 'jump', 5, 'hall'), t4 = serveTrial('clasico', 'jump', 5, 'hall');
  ok('con De abajo, SALTAR saca en salto como siempre', t3.he && t4.he && t3.used === '' && t3.he.speed === t4.he.speed);
  const gh = S.createGame({ seed: 1, serveSig: { id: 'globo', gest: 'normal' } });
  ok('Globo en pabellón: Clásico y aviso de techo', gh.sig && gh.sig.id === 'clasico' && gh.sig.roof === true && S.sigSane({ id: 'globo' }, 'hall').id === 'clasico');
  const gb = S.createGame({ seed: 1, venue: 'beach', serveSig: { id: 'globo', gest: 'normal' } });
  ok('Globo en la playa: sí', gb.sig && gb.sig.id === 'globo' && S.sigLabels(gb).hit === 'Globo' && S.sigLabels(gb).jump === 'Potente');
  ok('sigLabels sin firma: Flotante / Potente', S.sigLabels(S.createGame({ seed: 1 })).hit === 'Flotante' && S.sigLabels(null).jump === 'Potente');
  ok('6v6: la CPU nunca usa saque de firma', (() => { const g = S.createGame({ seed: 8, format: '6v6', autopilot: true, serveSig: { id: 'potente', gest: 'tres' } }); let bad = 0; for (let k = 0; k < 120 * 120; k++) { S.step(g, DT); for (const e of drain(g)) if (e.type === 'hit' && e.kind === 'serve' && e.sig) bad++; } return bad === 0; })());
  ok('sigSane idempotente', JSON.stringify(S.sigSane(S.sigSane({ id: 'abajo', gest: 'giro', sun: 0.3 }, 'hall'), 'hall')) === JSON.stringify(S.sigSane({ id: 'abajo', gest: 'giro', sun: 0.3 }, 'hall')));
}
function rel(a, b) { return Math.abs(a - b) / Math.max(1e-9, Math.abs(b)); }

// ---------------------------------------------------------------- 8. gesto
console.log('8. Gesto antes de sacar');
{
  for (const gs of ['tres', 'uno', 'giro']) for (const venue of ['hall', 'beach']) {
    const g = S.createGame({ seed: 9, venue, ctrl: 'one', serveSig: { id: 'clasico', gest: gs } });
    const r0 = g.rng.get(); let fin = true, dribs = 0, jug = 0, phases = {};
    for (let k = 0; k < 120 * 3; k++) {
      S.step(g, DT, { move: [0, k % 200 < 100 ? 0.6 : -0.6], hit: false, jump: false });
      if (!isFinite(g.ball.x + g.ball.y + g.ball.z) || g.ball.z < 0) fin = false;
      phases[g.ritual.phase] = 1;
      for (const e of drain(g)) { if (e.type === 'dribble') dribs++; if (e.type === 'juggle') jug++; }
    }
    const want = gs === 'tres' ? 3 : 1, bnc = venue === 'beach' || gs === 'giro' ? jug : dribs;
    ok(gs + ' (' + venue + '): balón finito, ' + want + ' bote(s) o toque(s) y sin g.rng en ready', fin && bnc === want && g.rng.get() === r0 && g.serveState === 'ready', 'botes ' + dribs + ', toques ' + jug + ', fases ' + Object.keys(phases).join('/'));
  }
  // el lanzamiento corta el gesto al momento
  const g = S.createGame({ seed: 9, ctrl: 'one', serveSig: { id: 'clasico', gest: 'tres' } });
  let k = 0; for (; k < 600 && !(g.ritual.on && g.ritual.phase === 'dribble'); k++) { S.step(g, DT); drain(g); }
  ok('el gesto llega a botar', g.ritual.phase === 'dribble');
  S.step(g, DT, { move: [0, 0], hit: true, jump: false }); drain(g);
  ok('pulsar lanza en el mismo paso y apaga el gesto', g.serveState === 'toss' && !g.ritual.on && g.ball.held === null);
  // la partida (puntos y g.rng) es la misma con y sin gesto
  let same = true;
  for (let sd = 1; sd <= (QUICK ? 3 : 8) && same; sd++) {
    const A = S.createGame({ seed: sd, ctrl: 'one' }), B = S.createGame({ seed: sd, ctrl: 'one', serveSig: { id: 'clasico', gest: ['tres', 'uno', 'giro'][sd % 3] } });
    const bA = makeBot(sd), bB = makeBot(sd), pa = [], pb = [];
    for (let i = 0; i < 120 * 90; i++) {
      S.step(A, DT, bA(A)); S.step(B, DT, bB(B));
      for (const e of drain(A)) if (e.type === 'point') pa.push(e.team + e.how + e.score.join('-'));
      for (const e of drain(B)) if (e.type === 'point') pb.push(e.team + e.how + e.score.join('-'));
    }
    if (pa.join() !== pb.join() || A.rng.get() !== B.rng.get()) same = false;
  }
  ok('el gesto es solo estético: mismos puntos y mismo g.rng', same);
}

// ---------------------------------------------------------------- 9. textos
console.log('9. Textos');
{
  const bad = /·|1\.er|2\.º|3\.er|\{|undefined|NaN/;
  const txt = [];
  for (const id of SIG.ids) { const d = SIG.byId[id]; txt.push(d.name, d.desc, d.short, d.pro, d.con); }
  txt.push(...SIG.gest.labels, SIG.roofTxt);
  ok('VB.SERVE_SIG: textos sin «·», «1.er», «{», undefined ni NaN', txt.every(t => typeof t === 'string' && !bad.test(t)), txt.length + ' textos');
  ok('VB.SERVE_SIG: formato para la Carrera (ids, byId con name, desc, need, key)', SIG.ids.every(id => SIG.byId[id] && SIG.byId[id].name && SIG.byId[id].desc && typeof SIG.byId[id].need === 'number' && /^(hit|jump|both)$/.test(SIG.byId[id].key)) && SIG.byId.potente.need === 62 && SIG.byId.liftado.need === 55 && SIG.byId.globo.venue === 'beach');
  const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8'), a = ui.indexOf('/* ZN-HUD:'), b = ui.indexOf('/* fin ZN-HUD */');
  ok('ui.js: bloque del HUD de la zona', a > 0 && b > a);
  const blk = a > 0 && b > a ? ui.slice(a, b) : '', lits = [];
  blk.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, s) => { if (/[a-záéíóúñ]{3,}/i.test(s) && !/[<>{};=]|^[\w-]+$|\.[a-z]/.test(s)) lits.push(s); return m; });
  const badL = lits.filter(s => bad.test(s));
  ok('ui.js: textos del HUD de la zona sin «·», «1.er», «{», undefined ni NaN', lits.length > 5 && badL.length === 0, lits.length + ' textos' + (badL.length ? ': ' + badL.join(' | ') : ''));
}

// ---------------------------------------------------------------- 10. Math.random
console.log('10. Azar');
{
  const src = fs.readFileSync(path.join(ROOT, 'js/sim.js'), 'utf8'), n = (src.match(/Math\.random/g) || []).length;
  ok('js/sim.js sin Math.random', n === 0, n);
}

console.log('\n' + oks + ' bien, ' + fails + ' mal');
if (fails) { console.log('HAY FALLOS'); process.exit(1); }
console.log('TODO OK');
