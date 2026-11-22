#!/usr/bin/env node
/* TAKE THE COURT — tools/variedadtest.js  (owner: sim)
 * IA VARIADA (1.22.0, imprescindible 4.8; notes/ia-variada.md): mide cuánto repite la IA sus destinos y si sigue igual de dura.
 * Juega sin navegador (sim + IA en un contexto vm, como tools/effortstat.js) y, por casilla (formato × modo × dificultad), cuenta:
 *  - remates de la CPU (evento hit con kind 'spike', no humano): entropía (bits) de la casilla de destino (la rejilla de openSpot:
 *    4 profundidades × 5 laterales, relativa al lado del equipo), % igual que el remate anterior del equipo, % de 3 seguidos a la
 *    misma casilla y % de 3 seguidos por el mismo carril (diagonal/línea, VB.Sim.laneOf);
 *  - saques de la CPU: entropía de la casilla, % de 3 seguidos al mismo receptor (el rival más cercano al destino);
 *  - 6v6: % de 3 colocaciones seguidas de la IA al mismo atacante (g.setPlan tras el 2º toque);
 *  - dureza: % de puntos que gana la CPU (equipo 1) y partidos ganados, CPU contra el bot humano de tools/simtest.js (medio y bueno)
 *    en cada dificultad, y CPU Normal (equipo 0, autopilot) contra la dificultad (equipo 1).
 * Solo OBSERVA (lee eventos y estado después de cada paso; nunca gasta g.rng). Determinista: cada casilla tiene su semilla.
 * Comprobaciones (salida 1 si fallan): la misma semilla da el mismo stateHash; copyGame a mitad de partido y seguir las dos da el
 * mismo stateHash (la memoria g.aiMem viaja con la partida: rollback de Precisa); con la memoria, menos «3 seguidos» de remate que
 * sin ella (el mismo código sin g.aiMem, que es la IA de antes); y Experto no se ablanda (con el bot medio y el bueno la CPU gana como poco el
 * TOL puntos porcentuales menos que sin memoria; con 4000 s el ruido de la muestra es de ~3 puntos, por eso el triple en esas casillas).
 * Uso: node tools/variedadtest.js [segundos por casilla = 4000; las de Experto con bot, el triple] [--base <ref de git>]  (salida en tools/out/variedad.json)
 *   --base main: además juega las mismas casillas con js/sim.js, ai.js y ai6.js de esa referencia (git show, sin escribir ficheros)
 *   VAR_FILTER=<regex>: solo las casillas cuya etiqueta encaje.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const SECS = +(argv.find(a => /^\d+$/.test(a)) || 4000);
const BASE = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : '';
const TOL = 2; // puntos porcentuales que Experto puede perder como mucho (ruido de la muestra)

function src(f, ref) { return ref ? cp.execSync('git show ' + ref + ':' + f, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }) : fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function load(ref, noMem) {
  const ctx = { console, Math, Date, process: { env: {} } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js']) vm.runInContext(src(f, ref), ctx, { filename: f });
  const VB = ctx.VB, S = VB.Sim, C = VB.C, DT = 1 / C.SIM_HZ;
  // VAR_MEM='{"tol":0.4}': prueba otros valores de VB.AI.MEM sin tocar ai.js
  if (process.env.VAR_MEM && VB.AI.MEM) Object.assign(VB.AI.MEM, JSON.parse(process.env.VAR_MEM));
  let bots = null;
  try {
    const s = src('tools/simtest.js', ''), a = s.indexOf('const BOTS = {'), b = s.indexOf('function topWhy(');
    if (a > 0 && b > a) bots = vm.runInContext('(function (S, C, DT, VB) {' + s.slice(a, b) + '; return { BOTS: BOTS, makeBot: makeBot }; })', ctx)(S, C, DT, VB);
  } catch (e) { bots = null; }
  return { VB, S, C, DT, bots, noMem: !!noMem };
}

const DEPTHS = [2.2, 4.2, 6.2, 7.9], LATS = [-3.6, -1.8, 0, 1.8, 3.6];
function cellOf(g, x, y) {
  const cs = g.cs || 1;
  let bi = 0, bj = 0;
  for (let i = 1; i < DEPTHS.length; i++) if (Math.abs(DEPTHS[i] * cs - Math.abs(x)) < Math.abs(DEPTHS[bi] * cs - Math.abs(x))) bi = i;
  for (let i = 1; i < LATS.length; i++) if (Math.abs(LATS[i] * cs - y) < Math.abs(LATS[bj] * cs - y)) bj = i;
  // relativa al lado (como cellKey de js/ai.js): destino en x < 0 con j tal cual; en x > 0, en espejo
  return bi * 5 + (x < 0 ? bj : 4 - bj);
}
function entropy(h) { let n = 0, e = 0; for (const k in h) n += h[k]; for (const k in h) { const p = h[k] / n; e -= p * Math.log2(p); } return n ? e : 0; }
function newSeq() { return { n: 0, same: 0, n3: 0, three: 0, lane3: 0, last: [], lanes: [], hist: {} }; }
function seqAdd(Q, v, lane) {
  Q.n++; Q.hist[v] = (Q.hist[v] || 0) + 1;
  if (Q.last.length && Q.last[0] === v) Q.same++;
  if (Q.last.length >= 2) { Q.n3++; if (Q.last[0] === v && Q.last[1] === v) Q.three++; if (lane && Q.lanes[0] === lane && Q.lanes[1] === lane) Q.lane3++; }
  Q.last.unshift(v); Q.last.length = Math.min(Q.last.length, 2);
  Q.lanes.unshift(lane || ''); Q.lanes.length = Math.min(Q.lanes.length, 2);
}
function seqOut(Q) { const p = (a, b) => b ? +(100 * a / b).toFixed(1) : 0; return { n: Q.n, ent: +entropy(Q.hist).toFixed(2), same: p(Q.same, Q.n - 1), three: p(Q.three, Q.n3), lane3: p(Q.lane3, Q.n3) }; }

function runCell(E, j) {
  const { S, DT, bots } = E;
  const bot = j.bot && bots ? bots.makeBot(bots.BOTS[j.bot], j.seed * 7 + 3, j.fmt === '6v6' ? { six: true } : null) : null;
  const base = j.bot ? { demo: false, difficulty: j.diff, serveClock: true, rookie: false } : { demo: false, autopilot: true, difficulty: j.diff };
  if (j.fmt === '6v6') { base.format = '6v6'; if (j.bot) base.ctrl = 'one'; }
  if (j.fmt === 'playa') base.venue = 'beach';
  let g = null, seedN = 0;
  // sin memoria: sin g.aiMem la IA hace exactamente lo de antes (todas sus ramas miran si existe)
  const newGame = () => { g = S.createGame(Object.assign({ seed: j.seed + 101 * seedN++ }, base)); if (E.noMem) delete g.aiMem; };
  newGame();
  const cpuT = j.bot ? [1] : [0, 1];
  const atk = [newSeq(), newSeq()], srv = [newSeq(), newSeq()], rcv = [newSeq(), newSeq()], set = [newSeq(), newSeq()];
  const pts = [0, 0], won = [0, 0], evs = [];
  const steps = Math.round(j.seconds / DT);
  for (let i = 0; i < steps; i++) {
    if (g.finished && g.mode === 'over') { won[g.sets[0] > g.sets[1] ? 0 : 1]++; newGame(); for (const A of [atk, srv, rcv, set]) for (const Q of A) { Q.last.length = 0; Q.lanes.length = 0; } }
    S.step(g, DT, bot ? bot(g) : null);
    evs.length = 0; S.drainEvents(g, evs);
    for (const e of evs) {
      if (e.type === 'point') pts[e.team]++;
      if (e.type !== 'hit' || e.human || cpuT.indexOf(e.team) < 0) continue;
      if (e.kind === 'set') { const P = g.rot && g.setPlan && g.setPlan[e.team]; if (P && P.to && !S.isHuman(g, e.player)) seqAdd(set[e.team], P.to.id); continue; }
      if (!e.target) continue;
      const t = e.team, x = e.target[0], y = e.target[1];
      if (e.kind === 'spike') { const l = S.laneOf(e.player.y, y, g.cs || 1); seqAdd(atk[t], cellOf(g, x, y), l === 'diag' || l === 'line' ? l : ''); }
      else if (e.kind === 'serve') {
        seqAdd(srv[t], cellOf(g, x, y));
        let q = null, m = 1e9; for (const o of g.teams[1 - t]) { const d = Math.hypot(o.x - x, o.y - y); if (d < m) { m = d; q = o; } }
        seqAdd(rcv[t], q ? q.id : -1);
      }
    }
  }
  const merge = A => { const Q = newSeq(); for (const t of cpuT) { const a = A[t]; Q.n += a.n; Q.same += a.same; Q.n3 += a.n3; Q.three += a.three; Q.lane3 += a.lane3; for (const k in a.hist) Q.hist[k] = (Q.hist[k] || 0) + a.hist[k]; } return seqOut(Q); };
  return { label: j.label, atk: merge(atk), srv: merge(srv), rcv: merge(rcv), set: j.fmt === '6v6' ? merge(set) : null,
    cpuPts: pts[0] + pts[1] ? +(100 * pts[1] / (pts[0] + pts[1])).toFixed(1) : 0, points: pts[0] + pts[1], won };
}

function cells() {
  const L = [];
  const DIFFS = ['easy', 'normal', 'hard', 'expert'];
  let s = 7100;
  for (const fmt of ['2v2', '6v6', 'playa']) {
    for (const d of DIFFS) L.push({ label: fmt + ' cpu ' + d, fmt, diff: d, seed: s++, seconds: SECS });
    for (const bot of ['medio', 'bueno']) for (const d of fmt === '2v2' ? DIFFS : ['hard', 'expert']) L.push({ label: fmt + ' ' + bot + ' ' + d, fmt, bot, diff: d, seed: s++, seconds: d === 'expert' ? 3 * SECS : SECS });
  }
  const re = process.env.VAR_FILTER ? new RegExp(process.env.VAR_FILTER) : null;
  return re ? L.filter(c => re.test(c.label)) : L;
}

function runAll(E) { const out = {}; for (const j of cells()) out[j.label] = runCell(E, j); return out; }

function checks(E) {
  const { S, DT } = E, res = [];
  // determinismo y copyGame (rollback): mismo hash
  for (const fmt of ['2v2', '6v6']) {
    const o = { demo: true, seed: 991 }; if (fmt === '6v6') o.format = '6v6';
    const a = S.createGame(o), b = S.createGame(o), c = S.createGame(o), ev = [];
    let ok = true;
    for (let i = 0; i < 120 * 90; i++) { S.step(a, DT, null); S.step(b, DT, null); S.drainEvents(a, ev); S.drainEvents(b, ev); ev.length = 0; }
    if (S.stateHash(a) !== S.stateHash(b)) ok = false;
    S.copyGame(c, a);
    const memOk = JSON.stringify(c.aiMem) === JSON.stringify(a.aiMem);
    for (let i = 0; i < 120 * 90; i++) { S.step(a, DT, null); S.step(c, DT, null); S.drainEvents(a, ev); S.drainEvents(c, ev); ev.length = 0; }
    res.push([fmt + ': misma semilla = mismo stateHash; copyGame a mitad (con g.aiMem) y seguir = mismo stateHash', ok && memOk && S.stateHash(a) === S.stateHash(c)]);
  }
  return res;
}

function fmtRow(k, r) {
  const a = r.atk, s = r.srv;
  return k.padEnd(20) + ' rem n ' + String(a.n).padStart(4) + ' ent ' + a.ent.toFixed(2) + ' igual ' + String(a.same).padStart(5) + '% 3seg ' + String(a.three).padStart(5) + '% carril3 ' + String(a.lane3).padStart(5) + '%'
    + ' | saq ent ' + s.ent.toFixed(2) + ' rec3 ' + String(r.rcv.three).padStart(5) + '%' + (r.set ? ' | col3 ' + String(r.set.three).padStart(5) + '%' : '') + ' | CPU ' + String(r.cpuPts).padStart(5) + '% pts, partidos ' + r.won.join('-');
}

function main() {
  const t0 = Date.now(), E = load('', false);
  const now = runAll(E), off = runAll(load('', true));
  const base = BASE ? runAll(load(BASE, false)) : null;
  const out = { seconds: SECS, now, noMem: off, base, base_ref: BASE || null };
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'variedad.json'), JSON.stringify(out, null, 1));
  for (const k of Object.keys(now)) {
    if (base) console.log('antes ' + fmtRow(k, base[k]));
    console.log('sinM  ' + fmtRow(k, off[k]));
    console.log('ahora ' + fmtRow(k, now[k]));
  }
  const res = checks(E);
  // con memoria, menos remates 3 seguidos a la misma casilla (suma de todas las casillas)
  let t3n = 0, t3o = 0; for (const k in now) { t3n += now[k].atk.three * now[k].atk.n; t3o += off[k].atk.three * off[k].atk.n; }
  res.push(['con memoria, menos remates de la CPU 3 seguidos a la misma casilla que sin ella', t3n < t3o, { ahora: Math.round(t3n / 100), sinMemoria: Math.round(t3o / 100) }]);
  for (const k in now) if (/ (medio|bueno) expert$/.test(k)) res.push([k + ': Experto no se ablanda (CPU ' + now[k].cpuPts + '% de puntos; sin memoria ' + off[k].cpuPts + '%; tolerancia ' + TOL + ')', now[k].cpuPts >= off[k].cpuPts - TOL]);
  let bad = 0;
  for (const r of res) { console.log((r[1] ? 'OK    ' : 'FALLO ') + r[0] + (r[2] ? ' ' + JSON.stringify(r[2]) : '')); if (!r[1]) bad++; }
  console.log((bad ? 'FALLOS: ' + bad : 'TODO OK') + ' (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  return bad ? 1 : 0;
}
if (require.main === module) process.exit(main());
module.exports = { main };
