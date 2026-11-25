#!/usr/bin/env node
/* TAKE THE COURT — tools/studytest.js (owner: carrera)
 * Prueba headless de «Te tienen estudiado» (notes/carrera.md): g.scout de la sim (sim.js scEv, laneOf), la IA que lo aplica (ai.js
 * studyShift / studyLean / openSpot, ai6.js defPos) y la Carrera (career.js studyOf / studyNext / studyClose / ingest, consignas avoid).
 * No abre Chrome.
 *   1. laneOf (sim.js) === VB.Consignas.dirOf en una rejilla de golpes y destinos (pabellón y playa).
 *   2. studyShift / studyLean con estados construidos: signo, tamaño, desde el centro nada, si ataca tu compañero nada, sin g.scout 0.
 *   3. Partidos reales con g.scout: AI.pos / AI6.pos con y sin g.scout en el mismo estado → la diferencia es el desplazamiento y no
 *      se gasta g.rng (contador); sin opts.scout no existe la clave; demo / online no la crean.
 *   4. Cambio de plan en el partido (scEv): con 3 puntos por el carril abierto y 2 más que por el cerrado, cambia; el punto anulado
 *      lo deshace; sin «ad» (no te estudian) nunca cambia.
 *   5. Estadística con los bots de simtest (playa y pista): remates en diagonal con y sin plan (el % de puntos baja) y reparto del
 *      rival por carril con g.scout.riv (pct ± 10). Mide la calibración de RIV_B / BLK_SHIFT / DEF_LEAN.
 *   6. Carrera: ingest → matchDone (c.study.h, recorte a 3, simulados no), challenge, broke en los bordes, studyNext determinista y
 *      sin mutar c, saque al que peor recibe (playa y pista), umbral de nota, consignas con avoid.
 *   8. «Te leen» (24-nov, IA que se adapta en todos los modos salvo Fácil; sim.js rdEv / ai.js readShift): racha por carril, signo y
 *      tamaño, Fácil / demo / tu compañero / desde el centro nada, junto a g.scout sin sumarse, AI.pos sin azar, resim idéntica y
 *      estadística con el bot que carga un carril (con la lectura, menos punto; el que alterna no la activa).
 *   (§3, §5 y §7 miden «Te tienen estudiado» solo: la lectura va apagada en esas partidas, g.aiMem.rd = null.)
 * Uso: node tools/studytest.js      STUDYTEST_N=k partidos por caso (por defecto 40 en la playa, la mitad en pista). Sale con 1 si falla.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; if (process.env.STUDYTEST_V) console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }

function load(extra) {
  const mem = {};
  const ls = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const ctx = { console, Math, Date, JSON, Set, localStorage: ls, process: { env: {} } }; ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  const files = ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/rating.js', 'js/consignas.js', 'js/career.js'].concat(extra || []);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const VB = ctx.VB, S = VB.Sim, C = VB.C, DT = 1 / C.SIM_HZ;
  let bots = null;
  try {
    let src = fs.readFileSync(path.join(ROOT, 'tools', 'simtest.js'), 'utf8');
    const a = src.indexOf('const BOTS = {'), b = src.indexOf('function topWhy(');
    // (el bot apunta sus remates con gapAim: con globalThis.__laneBias, al carril que se pida)
    let body = src.slice(a, b).replace('function gapAim(g, p, out) {', 'function gapAim(g, p, out) { if (globalThis.__laneBias) return globalThis.__laneBias(g, p, out);')
      // (y, con globalThis.__wingY, espera la colocación en un ala: así remata desde la banda, donde hay línea y diagonal)
      .replace('else if (!job) { tx = 6; ty = -g.teams[0][g.ctrl.idx ? 0 : 1].y * 0.5; }', 'else if (!job) { tx = 6; ty = -g.teams[0][g.ctrl.idx ? 0 : 1].y * 0.5; if (globalThis.__wingY != null && g.touchTeam === 0) ty = globalThis.__wingY; }');
    if (a > 0 && b > a) bots = vm.runInContext('(function (S, C, DT, VB) {' + body + '; return { BOTS: BOTS, makeBot: makeBot }; })', ctx)(S, C, DT, VB);
  } catch (e) { bots = null; }
  return { ctx, VB, S, DT, bots };
}

const E = load(), VB = E.VB, S = VB.Sim, AI = VB.AI, AI6 = VB.AI6, K = VB.Consignas;

// ------------------------------------------------------------------ 1. carril
section('1. laneOf === Consignas.dirOf');
{
  let bad = 0, n = 0;
  for (const k of [1, 8 / 9]) for (let hy = -4.4; hy <= 4.4; hy += 0.2) for (let ty = -4.2; ty <= 4.2; ty += 0.15) {
    n++; if (S.laneOf(hy, ty, k) !== K.dirOf({ y: hy, target: [-6, ty] }, k)) bad++;
  }
  ok(bad === 0, 'rejilla de ' + n + ' golpes y destinos: ' + bad + ' distintos');
}

// ------------------------------------------------------------------ 2. desplazamientos con estados construidos
section('2. studyShift / studyLean');
{
  const me = { id: 0 }, mate = { id: 1 };
  const G = (o) => Object.assign({ cs: 1, pr3: { y: 3 }, jobs: [me, null], ctrl: me, prof: [{}, { block: 0.4 }], scout: { me: 'diag', mk: 1, riv: '', rk: 0 } }, o);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok(near(AI.studyShift(G(), 1), -AI.BLK_SHIFT * 1 * (0.5 + 0.5 * 0.4)), 'diagonal cerrada, golpe en +y: el bloqueador se corre hacia dentro (−)');
  ok(near(AI.studyShift(G({ scout: { me: 'line', mk: 1 } }), 1), AI.BLK_SHIFT * 0.7), 'línea cerrada: hacia fuera (+)');
  ok(near(AI.studyShift(G({ pr3: { y: -3 } }), 1), AI.BLK_SHIFT * 0.7), 'diagonal, golpe en −y: hacia dentro (+)');
  ok(near(AI.studyShift(G({ cs: 8 / 9, scout: { me: 'diag', mk: 0.5 } }), 1), -AI.BLK_SHIFT * 0.5 * 0.7 * 8 / 9), '× mk y × cs de la playa');
  ok(near(AI.studyLean(G(), 1), -AI.DEF_LEAN), 'defensor 2v2: hacia el destino de la diagonal');
  ok(near(AI.studyLean(G({ scout: { me: 'line', mk: 1 } }), 1), AI.DEF_LEAN), 'defensor 2v2: hacia la línea');
  ok(AI.studyShift(G({ pr3: { y: 1.1 } }), 1) === 0 && AI.studyLean(G({ pr3: { y: -1.1 } }), 1) === 0, 'desde el centro (|y| < 1,2): nada');
  ok(AI.studyShift(G({ jobs: [mate, null] }), 1) === 0, 'si remata tu compañero: nada');
  ok(AI.studyShift(G(), 0) === 0, 'tu equipo no se desplaza');
  ok(AI.studyShift(G({ scout: undefined }), 1) === 0 && AI.studyLean(G({ scout: undefined }), 1) === 0, 'sin g.scout: 0');
  ok(AI.studyShift(G({ scout: { me: '', mk: 0 } }), 1) === 0, 'sin carril cerrado: 0');
  const g6 = G({ rot: [1, 1], setPlan: [{ to: me, t: 5 }, null], lastTouchT: 5 });
  ok(near(AI.studyShift(g6, 1), -AI.BLK_SHIFT * 0.7), '6v6: atacante = tú por el plan de colocación');
  ok(AI.studyShift(Object.assign({}, g6, { lastTouchT: 6 }), 1) === 0, '6v6: plan viejo (otro toque): nada');
  ok(near(AI.studyLean6(g6, 1), -1 * S.side(1) * AI.DEF_LEAN6), '6v6: zagueros, en coordenadas locales');
}

// ------------------------------------------------------------------ 3. partidos reales: diferencia exacta y sin azar
function beachOpts(seed, extra) {
  const B = VB.Career.beach, G = B.genSt, r = S._makeRng(seed * 31 + 34);
  return Object.assign({ seed: 3000 + seed * 7, serveClock: true, difficulty: 'easy', ctrl: 'one', ctrlIdx: 0, venue: 'beach', points: 21,
    attrs: [[G(35, 'atk', null), G(37, 'cr', null)], [G(35, 'atk', r), G(33, 'cr', r)]] }, extra || {});
}
function hallOpts(seed, extra) { return Object.assign({ format: '6v6', seed: 900 + seed * 13, difficulty: 'normal', ctrl: 'one', ctrlRole: 'OH', points: 15 }, extra || {}); }
function laneBias(lane) {
  // (con algo de variedad determinista en profundidad y ángulo, como una persona que carga un lado pero no clava siempre el mismo sitio)
  let n = 0; const fr = x => x - Math.floor(x);
  return function (g, p, out) { n++; const u = fr(Math.sin(n * 12.9898) * 43758.5453), v = fr(Math.sin(n * 78.233) * 12543.123), sy = p.y < 0 ? -1 : 1;
    const L = lane === 'alt' ? ((E.ctx.__altK | 0) % 2 ? 'diag' : 'line') : lane; out[0] = -0.05 - 0.6 * u; out[1] = (L === 'diag' ? -sy : sy) * (0.7 + 0.3 * v); return out; };
}
function mkBot(six, seed) { const prof = Object.assign({}, E.bots.BOTS.bueno, { gap: 1 }); return E.bots.makeBot(prof, 77 + seed * 5, six ? { six: true, role: 'OH' } : null); }

section('3. La IA con g.scout: desplazamiento exacto y sin gastar azar');
if (!E.bots) ok(false, 'bots de tools/simtest.js');
else for (const six of [false, true]) {
  const g = S.createGame(six ? hallOpts(1, { scout: { me: 'diag', mk: 1, riv: 'diag', rk: 1, ad: false } }) : beachOpts(1, { scout: { me: 'diag', mk: 1, riv: 'diag', rk: 1, ad: false } }));
  g.aiMem.rd = null;   // (solo «Te tienen estudiado»: la lectura en el partido va en §8)
  ok(!!g.scout && g.scout.me === 'diag', (six ? 'pista' : 'playa') + ': createGame con opts.scout crea g.scout');
  E.ctx.__laneBias = laneBias('diag'); E.ctx.__wingY = six ? null : 2.4;
  const bot = mkBot(six, 1), ev = [];
  const raw = g.rng; let calls = 0; const cnt = function () { calls++; return raw(); }; cnt.get = raw.get; cnt.set = raw.set;
  let samples = 0, moved = 0, badD = 0, rngBad = 0, leanS = 0;
  for (let i = 0; i < 3600 * 40 && !(g.finished && g.mode === 'over'); i++) {
    S.step(g, E.DT, bot(g)); ev.length = 0; S.drainEvents(g, ev);
    if (i % 3) continue;
    const sh = AI.studyShift(g, 1), ln = six ? AI.studyLean6(g, 1) : AI.studyLean(g, 1);
    if (!sh) continue;
    samples++;
    for (const p of g.teams[1]) {
      if (g.jobs[1] === p) continue;
      g.rng = cnt; calls = 0;
      const a = Object.assign({}, (six ? AI6.pos : AI.pos)(g, p)), sc = g.scout; delete g.scout;
      const b = Object.assign({}, (six ? AI6.pos : AI.pos)(g, p)); g.scout = sc; g.rng = raw;
      if (calls) rngBad++;
      const d = a.y - b.y;
      if (a.block && b.block) { if (Math.abs(d) > 1e-9) moved++; if (Math.abs(Math.abs(d) - Math.abs(sh)) > 1e-6 && Math.abs(a.y) < 3.95 && Math.abs(b.y) < 3.95 && Math.abs(Math.abs(d) - Math.abs(sh)) > 0.5) badD++; }
      else if (Math.abs(d) > 1e-9) leanS++;
    }
  }
  const W = six ? 'pista' : 'playa';
  ok(samples > 20, W + ': hay ataques tuyos desde un ala con el plan activo (' + samples + ')');
  ok(moved > 0, W + ': el bloqueador rival se desplaza (' + moved + ' muestras)');
  ok(badD === 0, W + ': el desplazamiento del bloqueo es el de studyShift (' + badD + ' distintos)');
  ok(leanS > 0, W + ': la defensa se echa hacia el carril (' + leanS + ' muestras)');
  ok(rngBad === 0, W + ': AI.pos no gasta g.rng con ni sin g.scout (' + rngBad + ')');
  E.ctx.__laneBias = null;
}
{
  const a = S.createGame(beachOpts(2)), b = S.createGame(beachOpts(2, { demo: true, scout: { me: 'diag', mk: 1 } })), c = S.createGame({ online: true, seed: 5, scout: { me: 'diag', mk: 1 } });
  ok(!('scout' in a), 'sin opts.scout (Partido rápido, simtest): la clave g.scout no existe');
  ok(!('scout' in b) && !('scout' in c), 'demo y online: nunca g.scout');
}

// ------------------------------------------------------------------ 4. cambio de plan en el partido
section('4. El rival cambia el plan si le haces daño por el otro lado');
{
  const g = S.createGame(beachOpts(3, { scout: { me: 'diag', mk: 0.5, riv: '', rk: 0, ad: true } })), me = g.ctrl, ev0 = g.events.length;
  const spike = (ty) => S._scEv(g, { type: 'hit', team: 0, kind: 'spike', player: me, y: 3, target: [-6, ty] });
  const kill = () => S._scEv(g, { type: 'point', team: 0, how: 'kill' });
  spike(3.4); kill(); spike(3.4); kill();
  ok(g.scout.me === 'diag', 'dos puntos por la línea: aún no cambia');
  spike(3.4); kill();
  ok(g.scout.me === 'line' && g.scout.sw === 1 && g.scout.mk >= S.SC_ADAPT_MK, '3r punto por la línea: ahora te cierran la línea (mk ' + g.scout.mk + ')');
  ok(g.events.slice(ev0).some(e => e.type === 'study' && e.lane === 'line'), 'evento «study» para la UI y la Carrera');
  S._scUndo(g);
  ok(g.scout.me === 'diag' && g.scout.sw === 0 && g.scout.k.line === 2, 'punto anulado por challenge: vuelve el plan de antes');
  spike(3.4); S._scEv(g, { type: 'hit', team: 1, kind: 'pass', player: g.teams[1][0] }); kill();
  ok(g.scout.k.line === 2, 'si el rival toca después de tu remate, el punto no es de tu remate');
  // por la diagonal ya cerrada: los puntos cuentan, pero no hace falta cambiar
  spike(-2.6); kill(); spike(-2.6); kill(); spike(-2.6); kill();
  ok(g.scout.me === 'diag', 'puntos por el carril ya cerrado: no cambia');
  const h = S.createGame(beachOpts(3, { scout: { me: 'diag', mk: 0.5, ad: false } }));
  for (let i = 0; i < 6; i++) { S._scEv(h, { type: 'hit', team: 0, kind: 'spike', player: h.ctrl, y: 3, target: [-6, 3.4] }); S._scEv(h, { type: 'point', team: 0, how: 'kill' }); }
  ok(h.scout.me === 'diag' && h.scout.sw === 0, 'sin estudio (ad false): nunca cambia');
  const q = S.createGame(beachOpts(3, { scout: { me: '', mk: 0, ad: true } }));
  for (let i = 0; i < 3; i++) { S._scEv(q, { type: 'hit', team: 0, kind: 'spike', player: q.ctrl, y: 3, target: [-6, -2.8] }); S._scEv(q, { type: 'point', team: 0, how: 'kill' }); }
  ok(q.scout.me === 'diag', 'te estudian sin patrón: si cargas la diagonal en el partido, te la cierran');
}

// ------------------------------------------------------------------ 5. estadística con bots
function playStat(six, seed, lane, scout, ex) {
  const g = S.createGame(six ? hallOpts(seed, Object.assign({}, ex && ex.opts, scout ? { scout } : null)) : beachOpts(seed, Object.assign({}, ex && ex.opts, scout ? { scout } : null)));
  if (!(ex && ex.read)) g.aiMem.rd = null;
  E.ctx.__altK = 0;   // (la lectura en el partido, «Te leen», solo cuando se pide: §8)
  E.ctx.__laneBias = laneBias(lane); E.ctx.__wingY = six ? null : (seed % 2 ? 2.4 : -2.4);
  const bot = mkBot(six, seed), ev = [], o = { sp: { diag: 0, line: 0 }, k: { diag: 0, line: 0 }, riv: { diag: 0, line: 0, mid: 0 }, sw: 0, rd: 0, pts: [0, 0] };
  let cur = '';
  const k = g.cs || 1;
  for (let i = 0; i < 3600 * 120 && !(g.finished && g.mode === 'over'); i++) {
    S.step(g, E.DT, bot(g)); ev.length = 0; S.drainEvents(g, ev);
    for (const e of ev) {
      if (e.type === 'hit') {
        const tg = e.target || e.aim;
        if (e.team === 0 && e.player === g.ctrl && e.kind === 'spike' && tg && Math.abs(+e.y || 0) >= 1.2 * k) { const L = S.laneOf(+e.y || 0, tg[1], k); cur = L === 'mid' ? '' : L; if (cur) o.sp[cur]++; E.ctx.__altK = (E.ctx.__altK | 0) + 1; }
        else cur = '';
        if (e.team === 1 && e.kind === 'spike' && tg) o.riv[Math.abs(+e.y || 0) >= 1.2 * k ? S.laneOf(+e.y || 0, tg[1], k) : 'mid']++;   // (desde un ala; desde el centro, «centro»)
      } else if (e.type === 'point') { o.pts[e.team]++; if (e.team === 0 && e.how === 'kill' && cur) o.k[cur]++; cur = ''; }
      else if (e.type === 'study') o.sw++;
      else if (e.type === 'read') o.rd = (o.rd || 0) + 1;
      else if (e.type === 'block' && e.team === 1) o.bl = (o.bl || 0) + 1;
    }
  }
  E.ctx.__laneBias = null; E.ctx.__wingY = null;
  return o;
}
function addTo(T, o) { for (const a of ['sp', 'k', 'riv']) for (const x in o[a]) T[a][x] = (T[a][x] || 0) + o[a][x]; T.sw = (T.sw || 0) + o.sw; T.rd = (T.rd || 0) + (o.rd || 0); T.bl = (T.bl || 0) + (o.bl || 0); T.pts = (T.pts || [0, 0]); if (o.pts) { T.pts[0] += o.pts[0]; T.pts[1] += o.pts[1]; } return T; }
const pc = (a, b) => (b ? (100 * a / b).toFixed(1) : '—') + ' %';
if (E.bots) {
  const N0 = Math.max(4, +(process.env.STUDYTEST_N || 40));
  for (const six of [false, true]) {
    const W = six ? 'pista' : 'playa', N = six ? Math.max(4, N0 >> 1) : N0;
    section('5. Estadística (' + W + ', ' + N + ' partidos por caso, bot «bueno» que remata a un carril)');
    let A = { sp: {}, k: {}, riv: {} }, B = { sp: {}, k: {}, riv: {} }, Rd = { sp: {}, k: {}, riv: {} }, Rl = { sp: {}, k: {}, riv: {} }, Ad = { sp: {}, k: {}, riv: {} };
    for (let s = 1; s <= N; s++) {
      addTo(A, playStat(six, s, 'diag', null));
      addTo(B, playStat(six, s, 'diag', { me: 'diag', mk: 1, riv: '', rk: 0, ad: false }));
      addTo(Rd, playStat(six, s, 'diag', { me: '', mk: 0, riv: 'diag', rk: 1, ad: false }));
      addTo(Rl, playStat(six, s, 'diag', { me: '', mk: 0, riv: 'line', rk: 0.4, ad: false }));
      if (s <= Math.max(2, N >> 2)) addTo(Ad, playStat(six, s, 'line', { me: 'diag', mk: 1, riv: '', rk: 0, ad: true }));
    }
    const kA = A.k.diag / Math.max(1, A.sp.diag), kB = B.k.diag / Math.max(1, B.sp.diag), ratio = kB / Math.max(1e-9, kA);
    console.log('  tus remates en diagonal: sin plan ' + A.sp.diag + ' (' + pc(A.k.diag, A.sp.diag) + ' punto), con la diagonal cerrada ' + B.sp.diag + ' (' + pc(B.k.diag, B.sp.diag) + ') → ×' + ratio.toFixed(2));
    ok(A.sp.diag > 100 && B.sp.diag > 100, W + ': remates suficientes para medir');
    // (en pista el bot hace poco punto rematando y el efecto es pequeño: con 1500 remates por caso medimos ×0,90; aquí, ≤ ×0,97)
    ok(ratio < (six ? 0.97 : 0.92), W + ': con la diagonal cerrada, tus remates en diagonal hacen menos punto (×' + ratio.toFixed(2) + ')');
    ok(ratio > 0.6, W + ': sin pasarse (×' + ratio.toFixed(2) + '; objetivo ×0,75-0,9)');
    const base = A.riv.diag / Math.max(1, A.riv.diag + A.riv.line), rd = Rd.riv.diag / Math.max(1, Rd.riv.diag + Rd.riv.line), rl = Rl.riv.line / Math.max(1, Rl.riv.diag + Rl.riv.line);
    console.log('  remates del rival (diagonal / línea / centro): sin informe ' + A.riv.diag + '/' + A.riv.line + '/' + A.riv.mid + ' (' + pc(A.riv.diag, A.riv.diag + A.riv.line) + ' diagonal); «diagonal 75 %» → ' +
      pc(Rd.riv.diag, Rd.riv.diag + Rd.riv.line) + '; «línea 60 %» → ' + pc(Rl.riv.line, Rl.riv.diag + Rl.riv.line) + ' por la línea');
    ok(Math.abs(rd * 100 - 75) <= 10, W + ': rival «diagonal 75 %» remata en diagonal ' + (rd * 100).toFixed(0) + ' % (75 ± 10) entre línea y diagonal');
    ok(Math.abs(rl * 100 - 60) <= 10, W + ': rival «línea 60 %» remata por la línea ' + (rl * 100).toFixed(0) + ' % (60 ± 10)');
    void base;
    console.log('  remates por la línea contra la diagonal cerrada (te estudian): ' + Ad.sw + ' cambios de plan en ' + Math.max(2, N >> 2) + ' partidos');
    ok(Ad.sw > 0, W + ': si le haces daño por la línea, el rival cambia el plan durante el partido');
  }
}

// ------------------------------------------------------------------ 6. Carrera
section('6. Carrera: historial, informe, prensa y consignas');
{
  const Kc = VB.Career;
  let c = Kc.create({ name: 'Iru Prueba', num: 14, role: 'atk', seed: 4242, autoClub: true });
  ok(c && Kc.mode() !== 'hall', 'carrera de playa creada');
  const s0 = Kc.studyNext(c), j0 = JSON.stringify(c), s1 = Kc.studyNext(c);
  ok(!!s0 && JSON.stringify(c) === j0, 'studyNext no toca el guardado');
  ok(JSON.stringify(s0) === JSON.stringify(s1), 'studyNext es determinista');
  ok(s0.me.state === 'calm', 'sin partidos jugados: aún no te estudian (' + s0.me.state + ')');
  ok(s0.riv.pct >= 60 && s0.riv.pct <= 75 && (s0.riv.lane === 'diag' || s0.riv.lane === 'line'), 'carril del rival y % (' + s0.riv.lane + ' ' + s0.riv.pct + ')');
  const m0 = Kc.matchSetup(); const A = m0.attrs[1], wi = A[1].recv < A[0].recv ? 1 : 0;
  ok(s0.weak && s0.weak.recv === A[wi].recv && s0.weak.other === A[1 - wi].recv && s0.weak.num === Kc.rivalNums2(m0.career)[wi], 'saque: el que peor recibe de out.attrs[1] (n.º ' + s0.weak.num + ', ' + s0.weak.recv + ')');
  ok(m0.scout && m0.scout.ad === false && m0.scout.me === '' && m0.scout.riv === s0.riv.lane, 'out.scout para la sim (sin estudio: ad false)');
  ok(JSON.stringify(Kc.rivalNums2({})) === '[3,9]' && JSON.stringify(Kc.rivalNums2({ rivalNum: 9 })) === '[9,3]' && JSON.stringify(Kc.rivalNums2({ bossNum: 5 })) === '[5,9]', 'dorsales rivales de la playa como en main.js');
  // un partido jugado: eventos falsos
  const p = [0, 1, 2, 3].map(i => ({ id: i, team: i >> 1, idx: i & 1, num: [14, 11, 3, 9][i] }));
  const mkG = (sc) => ({ career: { season: 1 }, teams: [[p[0], p[1]], [p[2], p[3]]], players: p, demo: false, autopilot: false, cs: 8 / 9, scout: sc });
  function play(g, nd, nl, kd, kl, extra) {
    const E2 = [{ type: 'newMatch' }];
    for (let i = 0; i < nd; i++) E2.push({ type: 'hit', team: 0, kind: 'spike', touch: 3, player: p[0], y: 3, target: [-6, -2.8], human: true, grade: 'good' }, i < kd ? { type: 'point', team: 0, how: 'kill', reason: 'in' } : { type: 'point', team: 1, how: 'error', reason: 'out' });
    for (let i = 0; i < nl; i++) E2.push({ type: 'hit', team: 0, kind: 'spike', touch: 3, player: p[0], y: 3, target: [-6, 3.4], human: true, grade: 'good' }, i < kl ? { type: 'point', team: 0, how: 'kill', reason: 'in' } : { type: 'point', team: 1, how: 'error', reason: 'out' });
    if (extra) extra(E2);
    Kc.ingest(E2, g);
    return Kc._M ? Kc._M() : null;
  }
  let g = mkG(S.createGame(beachOpts(9, { scout: { me: 'diag', mk: 1, ad: true } })).scout);
  let m = play(g, 4, 3, 2, 3);
  ok(m && m.st && m.st.d === 4 && m.st.l === 3 && m.st.kd === 2 && m.st.kl === 3 && m.st.me0 === 'diag', 'ingest cuenta remates y puntos por carril (' + JSON.stringify(m && m.st) + ')');
  // challenge: un punto anulado deshace kd
  Kc.ingest([{ type: 'hit', team: 0, kind: 'spike', touch: 3, player: p[0], y: 3, target: [-6, -2.8] }, { type: 'point', team: 0, how: 'kill', reason: 'in' }], g);
  ok(m.st.kd === 3, 'punto de remate en diagonal: kd 3');
  Kc.ingest([{ type: 'point', team: 1, how: 'error', reason: 'out' }, { type: 'challengeResult', overturned: true }], g);
  ok(m.st.kd === 2 && m.st.d === 5, 'challenge que da la vuelta: kd vuelve a 2 (' + m.st.kd + '), el remate sigue contado');
  let sum = Kc.matchDone({ sets: [2, 0], setScores: [[21, 15], [21, 17]], win: true }, null, g);
  c = Kc.get();
  ok(sum && sum.study && c.study && c.study.h.length === 1 && c.study.h[0].d === 5 && c.study.h[0].n === sum.nota, 'matchDone apunta el partido con su nota en c.study.h');
  ok(sum.study.me === 'diag' && sum.study.broke === false, 'sum.study (5 remates: no rompe el plan)');
  // simular no apunta
  const h0 = c.study.h.length; Kc.simulateNext(); c = Kc.get();
  ok(c.study.h.length === h0, 'el partido simulado no apunta');
  // romper el plan: bordes
  const SC = Kc._studyClose, cc = { study: { h: [] } };
  ok(SC(cc, { d: 2, l: 4, kd: 0, kl: 3, me0: 'diag' }, 7).broke === true, 'broke: 6 remates, 33 % por la cerrada, 3 puntos por la otra');
  ok(SC(cc, { d: 2, l: 3, kd: 0, kl: 3, me0: 'diag' }, 7).broke === false, 'borde: 5 remates, no');
  ok(SC(cc, { d: 41, l: 59, kd: 0, kl: 9, me0: 'diag' }, 7).broke === false, 'borde: 41 % por la cerrada, no');
  ok(SC(cc, { d: 2, l: 6, kd: 0, kl: 2, me0: 'diag' }, 7).broke === false, 'borde: 2 puntos por la otra, no');
  ok(SC(cc, { d: 2, l: 6, kd: 0, kl: 5, me0: '' }, 7).broke === false, 'sin plan del informe, no hay nada que romper');
  ok(cc.study.h.length === 3, 'el historial se recorta a ' + Kc.STUDY.WIN + ' (' + cc.study.h.length + ')');
  SC(cc, { d: 9, l: 1, kd: 0, kl: 0 }, null);
  ok(cc.study.h.length === 3 && cc.study.h[2].d === 2, 'sin nota (banquillo): no apunta');
  // umbral de nota
  const T = (h) => Kc.studyMe({ study: { h } });
  ok(T([{ d: 9, l: 1, n: 7.2 }]).state === 'calm', 'un solo partido: aún no te estudian');
  ok(T([{ d: 9, l: 1, n: 6.6 }, { d: 9, l: 1, n: 7.2 }]).state === 'calm', 'media 6,9 < 7: aún no');
  ok(T([{ d: 9, l: 1, n: 7 }, { d: 9, l: 1, n: 7 }]).state === 'on', 'media 7 con 18 de 20 en diagonal: te tienen estudiado');
  ok(T([{ d: 9, l: 1, n: 7 }, { d: 9, l: 1, n: 7 }]).pct === 90 && T([{ d: 9, l: 1, n: 7 }, { d: 9, l: 1, n: 7 }]).lane === 'diag', '… 90 % en diagonal');
  ok(T([{ d: 7, l: 5, n: 8 }, { d: 0, l: 0, n: 8 }]).state === 'none' || T([{ d: 7, l: 5, n: 8 }, { d: 0, l: 0, n: 8 }]).state === 'few', 'repartes: sin carril');
  ok(T([{ d: 3, l: 1, n: 8 }, { d: 3, l: 1, n: 8 }]).state === 'few', 'menos de ' + Kc.STUDY.MIN + ' remates: sin vídeo');
  ok(T([{ d: 8, l: 6, n: 8 }, { d: 0, l: 0, n: 8 }]).state === 'none', '8 de 14 (57 %): repartes');
  // (24-nov) o un partido de MÁS de 9, aunque sea uno solo
  ok(T([{ d: 9, l: 3, n: 9.2 }]).state === 'on' && T([{ d: 9, l: 3, n: 9.2 }]).top === true, 'un solo partido de 9,2: ya te estudian');
  ok(T([{ d: 9, l: 3, n: 9 }]).state === 'calm', 'un 9 justo no basta (más de 9)');
  ok(T([{ d: 5, l: 1, n: 5.1 }, { d: 4, l: 2, n: 9.3 }]).state === 'on', 'media 7,2 con un 9,3: te estudian');
  ok(T([{ d: 5, l: 1, n: 9.5 }, { d: 4, l: 2, n: 4 }, { d: 4, l: 2, n: 5 }]).state === 'on', 'el 9,5 aún está entre los 3 últimos (media 6,2): te estudian');
  ok(T([{ d: 5, l: 1, n: 9.5 }, { d: 4, l: 2, n: 4 }, { d: 4, l: 2, n: 5 }, { d: 4, l: 2, n: 6 }]).state === 'calm', 'el 9,5 ya no está entre los 3 últimos: no');
  ok(T([{ d: 9, l: 1, n: 6.6 }, { d: 9, l: 1, n: 7.2 }]).why === 'nota', 'sin nota suficiente: why «nota»');
  // categoría (studyGate): desde la Hiperliga; en la 2ª, solo finales y el último cuarto de la liga
  {
    const SG = Kc.studyGate, H = [{ d: 9, l: 1, n: 7.5 }, { d: 9, l: 1, n: 7.5 }];
    const nb = (lvl, kind, week) => ({ me: { lvl }, kind, week });
    ok(SG(null, nb(0, 'league', 0), false).why === 'low' && SG(null, nb(0, 'cup', 0), false).why === 'low', 'playa, Circuito Regional: nunca (ni en el Open)');
    ok(SG(null, nb(1, 'league', 9), false).why === 'early' && SG(null, nb(1, 'league', 9), false).from === 11, 'playa, Circuito Nacional, jornada 10 de 14: aún no (desde la 11ª)');
    ok(SG(null, nb(1, 'league', 10), false).ok && SG(null, nb(1, 'league', 13), false).ok, 'playa, Circuito Nacional, jornadas 11 a 14: sí');
    ok(SG(null, nb(1, 'cup', 0), false).ok, 'playa, Circuito Nacional, el Open (semifinal / final): sí');
    ok([2, 3, 4].every(l => SG(null, nb(l, 'league', 0), false).ok), 'playa, Hiperliga de Playa, Continental y Mundial: siempre');
    ok(T(H).state === 'on' && Kc.studyMe({ study: { h: H } }, SG(null, nb(1, 'league', 2), false)).state === 'calm' && Kc.studyMe({ study: { h: H } }, SG(null, nb(1, 'league', 2), false)).hot === true, 'con media 7,5 en la 2ª categoría al principio: no te estudian (hot: lo harán en el tramo final)');
    const C6 = { leagues: [{ id: 'XX1', cc: 'XX', lvl: 1, name: 'Hiperliga Prueba' }, { id: 'XX2', cc: 'XX', lvl: 2, name: 'Hiperliga 2 Prueba' }], clubs: [] };
    for (let i = 0; i < 8; i++) C6.clubs.push({ id: 'k' + i, lid: 'XX2' }, { id: 'j' + i, lid: 'XX1' });
    const nh = (lid, kind, week) => ({ me: { lid }, kind, week });
    ok(SG(C6, nh('XX1', 'league', 0), true).ok, 'pista, 1ª división: siempre');
    ok(SG(C6, nh('XX2', 'league', 9), true).why === 'early' && SG(C6, nh('XX2', 'league', 10), true).ok, 'pista, 2ª división de 8 (14 jornadas): desde la 11ª');
    ok(SG(C6, nh('XX2', 'ko', 0), true).ok, 'pista, 2ª división: la copa de fin de temporada, sí');
    ok(SG(null, nb(0, 'league', 0), false).top === 'la Hiperliga de Playa', 'playa: el aviso dice dónde empieza (la Hiperliga de Playa)');
  }
  // con buenas notas y patrón, el informe y out.scout lo dicen
  c = Kc.get(); c.study.h = [{ d: 8, l: 2, n: 7.6 }, { d: 7, l: 3, n: 7.4 }]; Kc.save(c);
  const s1r = Kc.studyNext(Kc.get());
  ok(s1r && s1r.me.state === 'calm' && s1r.me.why === 'low', 'en el Circuito Regional, aunque juegues bien, no te estudian (' + (s1r && s1r.me.why) + ')');
  c = Kc.get(); c.myClub = c.clubs.find(k => k.lvl === 2).id; Kc.save(c);   // (a la Hiperliga de Playa: ahí sí)
  const s2 = Kc.studyNext(Kc.get()), m2 = Kc.matchSetup();
  ok(s2 && s2.me.state === 'on' && s2.me.lane === 'diag' && s2.me.pct === 75, 'te tienen estudiado: 75 % en diagonal');
  ok(m2.scout.me === 'diag' && m2.scout.ad === true && Math.abs(m2.scout.mk - 0.8) < 1e-9, 'out.scout: diagonal cerrada, mk 0,8, cambian el plan');
  // consignas: sin avoid como siempre; con avoid, nunca esa
  let seen = 0, bad = 0, same = 0;
  for (let seed = 1; seed < 1500; seed++) {
    const a = K.create({ seed }), b = K.create({ seed, avoid: 'atkDiag' }), c0 = K.create({ seed, avoid: '' });
    for (const st of [a, b, c0]) K.feed(st, { type: 'serveReady', team: 1, player: -1 }, x => x, { size: 2, ctrl: { front: true }, cs: 8 / 9 });
    if (a.c && a.c.id === 'atkDiag') seen++;
    if (b.c && b.c.id === 'atkDiag') bad++;
    if ((a.c && a.c.id) === (c0.c && c0.c.id)) same++;
  }
  ok(seen > 0 && bad === 0, 'consignas: con avoid «atkDiag» nunca sale (sin él, ' + seen + ' veces)');
  ok(same === 1499, 'consignas: avoid vacío = como siempre');
  // newM: el entrenador evita el carril cerrado
  g = mkG({ me: 'diag', me0: 'diag', mk: 1 }); g.career = { season: 1 };
  Kc.ingest([{ type: 'newMatch' }], g);
  m = Kc._M();
  ok(!m.co || m.co.avoid === 'atkDiag', 'la Carrera crea las consignas con avoid del carril cerrado');
  Kc.ingest([{ type: 'study', team: 1, lane: 'line', n: 1 }], g);
  ok(m.st.sw === 1 && (!m.co || m.co.avoid === 'atkLine'), 'cambio de plan en el partido: el entrenador deja de pedir la línea');
  // challenge: el punto que provocó el cambio de plan se anula → la sim vuelve al plan de antes (scUndo) y el entrenador también
  if (m.co) {
    Kc.ingest([{ type: 'point', team: 0, reason: 'in', how: 'kill', t: 1 }, { type: 'study', team: 1, lane: 'diag', n: 2 }], g);
    const av1 = m.co.avoid;
    Kc.ingest([{ type: 'point', team: 1, reason: 'out', t: 2 }, { type: 'challengeResult', overturned: true, team: 1 }], g);
    ok(av1 === 'atkDiag' && Kc._M().co.avoid === 'atkLine', 'challenge que anula el punto del cambio de plan: el entrenador vuelve a evitar la línea (' + av1 + ' → ' + Kc._M().co.avoid + ')');
  }
  Kc.abortMatch();
}
// pista: el que peor recibe de los receptores titulares
{
  const Kc = VB.Career;
  let c6 = null;
  try { c6 = Kc.create({ mode: 'hall', name: 'Pista Prueba', num: 11, pos: 'OH', seed: 777, autoClub: true }); } catch (e) { c6 = null; }
  if (c6 && Kc.mode() === 'hall' && Kc.next()) {
    const j0 = JSON.stringify(Kc.get()), s6 = Kc.studyNext(Kc.get());
    ok(JSON.stringify(Kc.get()) === j0, 'pista: studyNext no toca el guardado');
    const m6 = Kc.matchSetup();
    if (s6 && m6) {
      const R = Kc.simRoles(); let w = null;
      R.forEach((r, i) => { if (r === 'OH' && (!w || m6.attrs[1][i].recv < w.recv)) w = { recv: m6.attrs[1][i].recv, name: m6.names[1][i], num: m6.nums[1][i] }; });
      ok(s6.weak && w && s6.weak.recv === w.recv && s6.weak.name === w.name && s6.weak.num === w.num, 'pista: saque al receptor titular que peor recibe (' + (s6.weak && s6.weak.name) + ', n.º ' + (s6.weak && s6.weak.num) + ')');
      ok(m6.scout && m6.scout.riv === s6.riv.lane, 'pista: out.scout');
    } else ok(!!m6 === !!s6, 'pista: sin partido, sin informe');
  } else console.log('  (sin Carrera de pista disponible en este contexto: se salta)');
  Kc.setMode && Kc.setMode('beach');
}

// ------------------------------------------------------------------ 7. repetición con g.scout (copyGame + resim idéntica)
section('7. Repetición: copyGame con g.scout y resim idéntica');
if (!E.bots) ok(false, 'bots de tools/simtest.js');
else for (const six of [false, true]) {
  const W = six ? 'pista' : 'playa', sc0 = { me: 'diag', mk: 0.8, riv: 'line', rk: 0.6, ad: true };
  const g = S.createGame(six ? hallOpts(5, { scout: sc0 }) : beachOpts(5, { scout: sc0 }));
  const R = S.createGame(g.opts), snap = S.createGame(g.opts); R.replay = true; snap.replay = true;
  g.aiMem.rd = null; R.aiMem.rd = null; snap.aiMem.rd = null;   // (solo g.scout: la lectura, en §8)
  E.ctx.__laneBias = laneBias('line'); E.ctx.__wingY = six ? null : 2.4;
  const bot = mkBot(six, 5), ev = [], evR = [], ins = [];
  let rec = false, rallies = 0, okN = 0, badN = 0, shared = 0, chg = 0, studyR = 0, scBefore = '';
  for (let i = 0; i < 3600 * 60 && !(g.finished && g.mode === 'over') && rallies < 40; i++) {
    const x = bot(g), xi = { move: [x.move[0], x.move[1]], hit: !!x.hit, jump: !!x.jump, jset: !!x.jset, switchPlayer: !!x.switchPlayer };
    if (rec) ins.push(xi);
    S.step(g, E.DT, xi); ev.length = 0; S.drainEvents(g, ev);
    for (const e of ev) {
      if (e.type === 'toss') {
        S.copyGame(snap, g); rec = true; ins.length = 0; scBefore = JSON.stringify(g.scout);
        if (snap.scout === g.scout || (snap.scout && g.scout && snap.scout.k === g.scout.k)) shared++;
      } else if (e.type === 'point' && rec) {
        rec = false; rallies++;
        if (JSON.stringify(g.scout) !== scBefore) chg++;
        const live0 = JSON.stringify(g.scout);
        S.copyGame(R, snap);
        for (const xi2 of ins) { S.step(R, E.DT, xi2); evR.length = 0; S.drainEvents(R, evR); for (const er of evR) if (er.type === 'study') studyR++; }
        if (S.stateHash(R) === S.stateHash(g) && JSON.stringify(R.scout) === live0 && JSON.stringify(g.scout) === live0) okN++; else badN++;
      }
    }
  }
  E.ctx.__laneBias = null; E.ctx.__wingY = null;
  ok(rallies >= 10, W + ': peloteos grabados (' + rallies + ')');
  ok(badN === 0 && okN === rallies, W + ': resim desde el saque idéntica, con g.scout igual al del vivo (' + okN + ' de ' + rallies + ')');
  ok(shared === 0, W + ': copyGame copia g.scout a fondo (sin objetos compartidos)');
  ok(chg > 0, W + ': g.scout cambia dentro de los peloteos grabados (' + chg + ' veces; ' + studyR + ' «study» en la sombra)');
}
{ const m = fs.readFileSync(path.join(ROOT, 'js/replay.js'), 'utf8').match(/var PASS = \{[^}]*\}/);
  ok(m && !/study/.test(m[0]), 'replay.js no pasa los «study» de la sombra a la interfaz (no están en PASS)'); }

// ------------------------------------------------------------------ 8. «Te leen»: la IA se adapta en el partido (todos los modos salvo Fácil)
section('8. «Te leen»: racha por carril, bloqueo y defensa que se corren');
{
  const RD = S.RD;
  ok(RD && RD.n === 3 && RD.full === 4 && RD.k.easy === 0 && RD.k.expert === 1, 'constantes (RD.n ' + (RD && RD.n) + ', Fácil 0)');
  // racha (sim.js rdEv, por el emit de los 'hit')
  const g = S.createGame(beachOpts(8, { difficulty: 'normal' })), me = g.ctrl, ev0 = g.events.length;
  const sp = (ty, o) => S._emit(g, Object.assign({ type: 'hit', team: 0, kind: 'spike', player: me, y: 3, target: [-6, ty], human: true }, o || {}));
  sp(-2.8); sp(-2.8);
  ok(g.aiMem.rd[0][0] === 1 && g.aiMem.rd[0][1] === 2 && !g.events.slice(ev0).some(e => e.type === 'read'), 'dos remates en diagonal: racha 2, aún sin aviso');
  sp(-2.8);
  ok(g.aiMem.rd[0][1] === 3 && g.events.slice(ev0).filter(e => e.type === 'read' && e.team === 1 && e.lane === 'diag').length === 1, '3º seguido: evento «read» (te han leído la diagonal)');
  S._emit(g, { type: 'hit', team: 0, kind: 'free', shot: 'tip', player: me, y: 3, target: [-3, 3], human: true });
  S._emit(g, { type: 'hit', team: 0, kind: 'set', player: g.teams[0][1], y: 1, target: [0.5, 3], human: false });
  ok(g.aiMem.rd[0][1] === 3, 'dejadas y otros toques no rompen la racha');
  S._emit(g, { type: 'hit', team: 0, kind: 'spike', player: g.teams[0][1], y: 3, target: [-6, 3.4], human: false });
  ok(g.aiMem.rd[0][1] === 3, 'el remate de tu compañero IA no cuenta');
  sp(-2.8);
  ok(g.aiMem.rd[0][1] === 4 && g.events.slice(ev0).filter(e => e.type === 'read').length === 1, '4º: racha 4 (fuerza entera) sin repetir el aviso');
  sp(3.4);
  ok(g.aiMem.rd[0][0] === 2 && g.aiMem.rd[0][1] === 1, 'por la línea: la racha empieza de nuevo (línea, 1)');
  sp(-2.8, { y: 0.5 });
  ok(g.aiMem.rd[0][0] === 0 && g.aiMem.rd[0][1] === 0, 'desde el centro: se rompe');
  const ge = S.createGame(beachOpts(8, { difficulty: 'easy' })), e0 = ge.events.length;
  for (let i = 0; i < 4; i++) S._emit(ge, { type: 'hit', team: 0, kind: 'spike', player: ge.ctrl, y: 3, target: [-6, -2.8], human: true });
  ok(!ge.events.slice(e0).some(e => e.type === 'read') && S.rdK(ge, 1) === 0, 'Fácil: sin aviso y fuerza 0');

  // desplazamientos con estados construidos
  const P = (id, team) => ({ id, team, idx: id & 1 });
  const p0 = P(0, 0), p1 = P(1, 0);
  const G = (o) => Object.assign({ cs: 1, pr3: { y: 3 }, jobs: [p0, null], ctrl: p0, teams: [[p0, p1], []], prof: [{}, { block: 0.4 }], difficulty: 'expert',
    aiMem: { rd: [[1, 4], [0, 0]] } }, o);
  const near = (a, b) => Math.abs(a - b) < 1e-9, F = 0.5 + 0.5 * 0.4;
  ok(near(AI.readShift(G(), 1), -AI.BLK_SHIFT * AI.RDX.blk * F), 'Experto, 4 en diagonal, golpe en +y: el bloqueador se corre hacia dentro (−' + (AI.BLK_SHIFT * AI.RDX.blk * F).toFixed(2) + ' m)');
  ok(near(AI.readShift(G({ aiMem: { rd: [[2, 4], [0, 0]] } }), 1), AI.BLK_SHIFT * AI.RDX.blk * F), 'por la línea: hacia fuera');
  ok(near(AI.readShift(G({ aiMem: { rd: [[1, 3], [0, 0]] } }), 1), -AI.BLK_SHIFT * AI.RDX.blk * F * RD.part), 'a la 3ª: × RD.part (' + RD.part + ')');
  ok(AI.readShift(G({ aiMem: { rd: [[1, 2], [0, 0]] } }), 1) === 0, 'con 2 seguidos: nada');
  ok(near(AI.readShift(G({ difficulty: 'normal' }), 1), -AI.BLK_SHIFT * AI.RDX.blk * F * RD.k.normal), 'Normal: × ' + RD.k.normal);
  ok(AI.readShift(G({ difficulty: 'easy' }), 1) === 0 && AI.readLean(G({ difficulty: 'easy' }), 1) === 0, 'Fácil: nada');
  ok(AI.readShift(G({ demo: true }), 1) === 0 && AI.readShift(G({ drill: {} }), 1) === 0 && AI.readShift(G({ fl: {} }), 1) === 0, 'demo, Entrenamiento y Fluida: nada');
  ok(AI.readShift(G({ pr3: { y: 1.1 } }), 1) === 0, 'desde el centro: nada');
  ok(AI.readShift(G({ jobs: [p1, null] }), 1) === 0, 'si remata tu compañero IA: nada');
  ok(AI.readShift(G({ aiMem: {} }), 1) === 0 && AI.readShift(G({ aiMem: undefined }), 1) === 0, 'sin g.aiMem.rd: 0');
  ok(near(AI.readLean(G(), 1), -AI.DEF_LEAN * AI.RDX.lean), 'defensor 2v2 hacia la diagonal (× RDX.lean ' + AI.RDX.lean + ')');
  ok(near(AI.readShift(G({ scout: { me: 'diag', mk: 1 } }), 1), 0) && near(AI.readShift(G({ scout: { me: 'diag', mk: 0.4 } }), 1), -AI.BLK_SHIFT * AI.RDX.blk * F * 0.6), 'con «Te tienen estudiado» en el mismo carril no se suman (como mucho, la mayor)');
  ok(near(AI.readShift(G({ scout: { me: 'line', mk: 1 } }), 1), -AI.BLK_SHIFT * AI.RDX.blk * F), 'en el carril contrario, la lectura entera');
  const g6 = G({ rot: [1, 1], setPlan: [{ to: p0, t: 5 }, null], lastTouchT: 5 });
  ok(near(AI.readShift(g6, 1), -AI.BLK_SHIFT * AI.RDX.blk * F) && near(AI.readLean6(g6, 1), -1 * S.side(1) * AI.DEF_LEAN6 * AI.RDX.lean6), '6v6: atacante por el plan de colocación; zagueros en coordenadas locales');
  ok(AI.readShift(Object.assign({}, g6, { lastTouchT: 6 }), 1) === 0, '6v6: plan viejo: nada');
}
if (!E.bots) ok(false, 'bots de tools/simtest.js');
else {
  // AI.pos con y sin la racha en partidos reales: la diferencia es readShift y no se gasta g.rng
  for (const six of [false, true]) {
    const W = six ? 'pista' : 'playa';
    const g = S.createGame(six ? hallOpts(3, { difficulty: 'expert' }) : beachOpts(3, { difficulty: 'expert' }));
    E.ctx.__laneBias = laneBias('diag'); E.ctx.__wingY = six ? null : 2.4;
    const bot = mkBot(six, 3), ev = [];
    const raw = g.rng; let calls = 0; const cnt = function () { calls++; return raw(); }; cnt.get = raw.get; cnt.set = raw.set;
    let samples = 0, moved = 0, rngBad = 0, reads = 0, leanS = 0;
    for (let i = 0; i < 3600 * 40 && !(g.finished && g.mode === 'over'); i++) {
      S.step(g, E.DT, bot(g)); ev.length = 0; S.drainEvents(g, ev);
      for (const e of ev) if (e.type === 'read') reads++;
      if (i % 3) continue;
      const sh = AI.readShift(g, 1); if (!sh) continue;
      samples++;
      for (const p of g.teams[1]) {
        if (g.jobs[1] === p) continue;
        g.rng = cnt; calls = 0;
        const a = Object.assign({}, (six ? AI6.pos : AI.pos)(g, p)), rd = g.aiMem.rd; g.aiMem.rd = null;
        const b = Object.assign({}, (six ? AI6.pos : AI.pos)(g, p)); g.aiMem.rd = rd; g.rng = raw;
        if (calls) rngBad++;
        const d = a.y - b.y;
        if (a.block && b.block) { if (Math.abs(d) > 1e-9) moved++; }
        else if (Math.abs(d) > 1e-9) leanS++;
      }
    }
    E.ctx.__laneBias = null; E.ctx.__wingY = null;
    ok(reads > 0, W + ': el bot que carga la diagonal activa la lectura (' + reads + ' avisos)');
    ok(samples > 10 && moved > 0, W + ': el bloqueador se corre (' + moved + ' de ' + samples + ' muestras)');
    ok(leanS > 0, W + ': la defensa se echa hacia el carril (' + leanS + ')');
    ok(rngBad === 0, W + ': AI.pos no gasta g.rng con ni sin la racha (' + rngBad + ')');
  }
  // repetición: copyGame con la racha y resim idéntica (la racha cambia dentro de los peloteos grabados)
  for (const six of [false, true]) {
    const W = six ? 'pista' : 'playa';
    const g = S.createGame(six ? hallOpts(6, { difficulty: 'hard' }) : beachOpts(6, { difficulty: 'hard' }));
    const R = S.createGame(g.opts), snap = S.createGame(g.opts); R.replay = true; snap.replay = true;
    E.ctx.__laneBias = laneBias('diag'); E.ctx.__wingY = six ? null : 2.4;
    const bot = mkBot(six, 6), ev = [], evR = [], ins = [];
    let rec = false, rallies = 0, okN = 0, chg = 0, shared = 0, before = '';
    for (let i = 0; i < 3600 * 60 && !(g.finished && g.mode === 'over') && rallies < 40; i++) {
      const x = bot(g), xi = { move: [x.move[0], x.move[1]], hit: !!x.hit, jump: !!x.jump, jset: !!x.jset, switchPlayer: !!x.switchPlayer };
      if (rec) ins.push(xi);
      S.step(g, E.DT, xi); ev.length = 0; S.drainEvents(g, ev);
      for (const e of ev) {
        if (e.type === 'toss') { S.copyGame(snap, g); rec = true; ins.length = 0; before = JSON.stringify(g.aiMem.rd); if (snap.aiMem.rd === g.aiMem.rd) shared++; }
        else if (e.type === 'point' && rec) {
          rec = false; rallies++;
          const live = JSON.stringify(g.aiMem.rd); if (live !== before) chg++;
          S.copyGame(R, snap);
          for (const xi2 of ins) { S.step(R, E.DT, xi2); evR.length = 0; S.drainEvents(R, evR); }
          if (S.stateHash(R) === S.stateHash(g) && JSON.stringify(R.aiMem.rd) === live) okN++;
        }
      }
    }
    E.ctx.__laneBias = null; E.ctx.__wingY = null;
    ok(rallies >= 10 && okN === rallies, W + ': resim desde el saque idéntica con la racha (' + okN + ' de ' + rallies + ')');
    ok(shared === 0 && chg > 0, W + ': copyGame copia la racha a fondo y cambia en los peloteos (' + chg + ')');
  }
  // estadística: el bot que carga la diagonal hace menos punto en diagonal con la lectura; el que alterna no la activa
  const N0 = Math.max(4, +(process.env.STUDYTEST_N || 40) >> 1);
  for (const six of [false, true]) for (const diff of ['normal', 'expert']) {
    const W = (six ? 'pista ' : 'playa ') + diff, N = six ? Math.max(4, N0 >> 1) : N0;
    const A = { sp: {}, k: {}, riv: {} }, B = { sp: {}, k: {}, riv: {} }, Al = { sp: {}, k: {}, riv: {} }, Bl = { sp: {}, k: {}, riv: {} };
    for (let s = 1; s <= N; s++) {
      addTo(A, playStat(six, s, 'diag', null, { opts: { difficulty: diff } }));
      addTo(B, playStat(six, s, 'diag', null, { opts: { difficulty: diff }, read: true }));
      if (s <= Math.max(2, N >> 1)) { addTo(Al, playStat(six, s, 'alt', null, { opts: { difficulty: diff } })); addTo(Bl, playStat(six, s, 'alt', null, { opts: { difficulty: diff }, read: true })); }
    }
    const kA = A.k.diag / Math.max(1, A.sp.diag), kB = B.k.diag / Math.max(1, B.sp.diag), ratio = kB / Math.max(1e-9, kA);
    const cA = A.pts[1] / Math.max(1, A.pts[0] + A.pts[1]), cB = B.pts[1] / Math.max(1, B.pts[0] + B.pts[1]);
    console.log('  ' + W + ' (' + N + ' partidos): diagonal sin lectura ' + A.sp.diag + ' (' + pc(A.k.diag, A.sp.diag) + ' punto), con lectura ' + B.sp.diag + ' (' + pc(B.k.diag, B.sp.diag) + ') → ×' + ratio.toFixed(2) +
      '; avisos ' + B.rd + '; bloqueos ' + A.bl + ' → ' + B.bl + '; CPU ' + pc(A.pts[1], A.pts[0] + A.pts[1]) + ' → ' + pc(B.pts[1], B.pts[0] + B.pts[1]) + '; alternando: avisos ' + Bl.rd + ', CPU ' + pc(Al.pts[1], Al.pts[0] + Al.pts[1]) + ' → ' + pc(Bl.pts[1], Bl.pts[0] + Bl.pts[1]));
    ok(B.rd > 0, W + ': la lectura salta con el bot que carga un carril');
    if (diff === 'normal') ok(ratio < (six ? 0.99 : 0.95), W + ': con la lectura, la diagonal repetida hace menos punto (×' + ratio.toFixed(2) + ')');
    // (Experto ya defiende casi todo: con 20 partidos el % de punto en diagonal sale entre ×0,9 y ×1,3 según las semillas, ruido; lo que
    //  sí se ve siempre es que bloquea más y que no gana menos puntos)
    else { ok(B.bl > A.bl, W + ': con la lectura, la CPU bloquea más (' + A.bl + ' → ' + B.bl + ')'); ok(cB >= cA - 0.03, W + ': y no gana menos puntos (' + (100 * cA).toFixed(1) + ' → ' + (100 * cB).toFixed(1) + ' %)'); }
    ok(ratio > 0.6 && ratio < 1.4, W + ': sin pasarse (×' + ratio.toFixed(2) + ')');
    ok(Bl.rd <= Math.max(2, Math.round((Bl.sp.diag + Bl.sp.line) / 40)), W + ': el que alterna línea y diagonal casi nunca la activa (' + Bl.rd + ' avisos)');
  }
}

console.log('\n' + (fails ? 'FALLOS: ' + fails : 'TODO OK') + ' (' + passes + ' comprobaciones)');
process.exit(fails ? 1 : 0);
