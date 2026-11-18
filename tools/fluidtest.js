#!/usr/bin/env node
/* MAKE THE CUT — tools/fluidtest.js  (owner: net)
 * Online V2 «Fluida», paquete WP2 (notes/online-v2-spec.md §3-§8 y plan de pruebas C): dos VB.NetFluid.Session unidas por
 * VB.Net.memPair (latencia, variación, pérdida en 'in'), cada una en su PROPIO contexto vm (sim.js + ai.js + ai6.js + net.js +
 * netfluid.js), con relojes desfasados y frames de 8-25 ms con tirones de 100 ms. Juegan bots de solo entrada (VB.Net.bot) sobre
 * predictedGame() de cada máquina. Por partido comprueba:
 *   1 final: los dos en 'over' con why 'over' y un solo gameOver en events y en confirmed;
 *   2 acuerdo: mismos sets, setScores y ganador, mismo registro de puntos, fin cotejado (unverified false), sbFix 0 con pérdida <= 5 %,
 *     guarda de point() a 0;
 *   3 mis jugadores nunca los corrige la red (huella de su cinemática tras cada paso = antes del siguiente, salvo saque o rs);
 *   4 traspasos: el mismo número en los dos lados, sin bifurcaciones con RTT <= 150 y sin recuperaciones de más de 300 ms con RTT <= 250;
 *   5 sin parones: tic = reloj común (± 2), nunca 'waiting' con la red viva, 'inestable' < 1 % de frames con pérdida <= 2 %;
 *   6 suavizado: error del rival pintado contra su pose real en Tr (la otra máquina), extrapolación, saltos por frame, aceleración del balón;
 *   7 tráfico por sentido; 8 eventos: sin duplicados, confirmados en orden y el mismo recuento de bloqueos y puntos en los dos.
 * Escenarios: corte de 3 s a mitad de peloteo, de 15 s (IA y vuelta con rs), de 70 s (abandono por tiempo) y Precisa contra Fluida
 * (bye 'version' en los dos sentidos, sin excepciones). Salida JSON en tools/out/fluid-<modo>.json.
 * Más escenarios: revancha (época 1 sobre el mismo enlace), recarga del anfitrión (adopta con rs) y pestaña oculta (cada 1 s, maxCatch 150).
 * Uso: node tools/fluidtest.js [--quick | --full] [--only N] [--scen]   (--scen: solo los escenarios)    (sale con código 1 si algo falla)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FULL = process.argv.includes('--full');
const QUICK = !FULL;
const SCEN = process.argv.includes('--scen');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? +process.argv[i + 1] : -1; })();
const SRC = ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/net.js', 'js/netfluid.js'].map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
const STEP_MS = 1000 / 120;
function load() {
  const ctx = { console, TextEncoder, TextDecoder };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.VB = { VERSION: 'test' };
  for (const [f, s] of SRC) vm.runInContext(s, ctx, { filename: f });
  ctx.VB.NetFluid.C.KHCHECK = true;
  if (process.env.BACHECK) ctx.VB.NetFluid.C.BACHECK = true;   // (cursor de _ballAt contra el vuelo entero)   // (comprobación del traspaso de cada tc: solo en las pruebas)
  return ctx.VB;
}
let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
}
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const KIN = ['x', 'y', 'z', 'vx', 'vy', 'vz'];
function kinHash(g, team) { let s = ''; for (const p of g.teams[team]) for (const k of KIN) s += p[k] + ','; return s; }
const pct = (a, q) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * q))]; };
const pctNR = (a, q) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.max(0, Math.ceil(b.length * q) - 1)]; }; // (percentil por rango más cercano)
const r2 = v => Math.round(v * 100) / 100;

/** Un partido. cfg: {rtt, jit, loss, seed, venue, points, bestOf, secs, cut: {at, ms, ai: 'host'|'guest'}, hidden} */
function run(cfg) {
  const VA = load(), VBb = load();
  let T = 0;
  const [la, lb] = VA.Net.memPair({ lag: cfg.rtt, jit: cfg.jit, loss: cfg.loss, seed: cfg.seed, clock: () => T });
  // tráfico por sentido (carga útil) y huecos entre paquetes
  const traf = [{ bytes: 0, pk: 0, inB: 0, ctlB: 0 }, { bytes: 0, pk: 0, inB: 0, ctlB: 0 }];
  [la, lb].forEach((l, k) => { const s0 = l.send; l.send = function (ch, d) { const n = typeof d === 'string' ? d.length : d.length; traf[k].bytes += n; traf[k].pk++; if (ch === 'in') traf[k].inB += n; else { traf[k].ctlB += n; if (process.env.FLKIND) { let kk = '?'; try { kk = JSON.parse(d).k; } catch (e) { } traf[k][kk] = (traf[k][kk] || 0) + n; } } return s0.call(this, ch, d); }; });
  const opts = { online: true, seed: 7000 + cfg.seed, venue: cfg.venue || 'hall', bestOf: cfg.bestOf || 1, points: cfg.points || 11, humans: [{}, {}], present: true, stats: true, net: 'fluida' };
  const msgs = [];
  const log = m => { if (process.env.NETLOG) console.log('    ' + (T / 1000).toFixed(2) + ' ' + m); msgs.push((T / 1000).toFixed(2) + ' ' + m); };
  const V = [VA, VBb];
  // vigilancia de mis jugadores y verdad de poses (la pose propia de cada máquina por tic)
  const truth = [new Map(), new Map()], corr = [0, 0], corrInfo = [];
  const watch = [{ h: null, srv: -1, rs: 0, mode: '' }, { h: null, srv: -1, rs: 0, mode: '' }];
  const sess = [null, null];
  V.forEach((Vx, k) => {
    const S = Vx.Sim, step0 = S.step;
    S.step = function (g, dt, ins) {
      const w = watch[k], me = g.fl ? g.fl.me : -1, s = sess[k];
      if (w.g !== g) { w.g = g; w.h = null; }   // (partida nueva: revancha o recarga)
      if (g.fl && w.h !== null) {
        const h = kinHash(g, me), legit = g.fl.srvR !== w.srv || (s && s.stats.rsIn !== w.rs) || w.mode !== g.mode;
        if (h !== w.h && !legit) { corr[k]++; if (corrInfo.length < 5) corrInfo.push({ k, T: g.fl.T, mode: g.mode }); }
      }
      const r = step0(g, dt, ins);
      if (g.fl) {
        w.h = kinHash(g, me); w.srv = g.fl.srvR; w.rs = s ? s.stats.rsIn : 0; w.mode = g.mode;
        truth[k].set(g.fl.T, g.teams[me].map(p => [p.x, p.y, p.z]));
        if (truth[k].size > 4000) truth[k].delete(g.fl.T - 4000);
      }
      return r;
    };
  });
  const mkA = () => new VA.NetFluid.Session({ slot: 0, link: la, opts, name: 'Anfitrión', log });
  const mkB = () => new VBb.NetFluid.Session({ slot: 1, link: lb, opts: null, name: 'Invitado', log, expect: { even: false, bestOf: opts.bestOf, points: opts.points, venue: opts.venue, net: 'fluida' } });
  sess[0] = mkA(); sess[1] = mkB();
  const off = [0, 123456.7];   // (reloj de cada máquina; el invitado que recarga lo cambia)
  const bots = [VA.Net.bot(0, cfg.seed, 'bueno'), VBb.Net.bot(1, cfg.seed + 1, 'bueno')];
  const fr = mulberry(cfg.seed * 31 + 7);
  const next = [0, 3.3], lastAt = [0, 0];
  const st = { err: null, frames: [0, 0], playFrames: [0, 0], waitFrames: [0, 0], unstable: [0, 0], canAIat: [-1, -1], tickBad: [0, 0], tickMax: [0, 0],
    goEv: [0, 0], goConf: [0, 0], dupConf: [0, 0], unsorted: [0, 0], pts: [[], []], tally: [{}, {}], dispErr: [[], []], jumpP: [[], []], jumpB: [[], []],
    recvGap: [0, 0], resyncAt: -1, aiSide: [false, false], cutAt: -1, statusAt: {}, waitAfterCut: [0, 0], ownMoveInCut: [0, 0] };
  const seen = [new Set(), new Set()], prevDisp = [null, null], prevBall = [null, null];
  let cutDone = false, reloaded = false, rematched = 0;
  st.feel = [0, 1].map(() => ({ n: 0, slow: 0, mid: 0, fast: 0, b25: 0, b50: 0, b100: 0, popSP: 0, popRP: 0, popSB: 0, prev: null }));
  st.frozenMax = 0; st.frozenCur = 0; st.hidWait = 0; st.first = null;
  const END = (cfg.secs || 900) * 1000;
  const fmax = [25, 25];
  const hid = () => cfg.hidden && T >= cfg.hidden.at * 1000 && T < cfg.hidden.until * 1000;
  while (T < END) {
    const k = next[0] <= next[1] ? 0 : 1;
    T = next[k];
    const hitch = fr() < 0.01 ? 100 : 0;
    // parón del anfitrión (página congelada): no avanza en ms
    if (cfg.stallHost && k === 0 && !st.stallDone && T >= cfg.stallHost.at * 1000) { st.stallDone = true; next[0] = T + cfg.stallHost.ms; log('el anfitrión se para ' + cfg.stallHost.ms + ' ms'); continue; }
    // el invitado recarga la página: 4 s sin nada y sesión nueva sin opciones, con su reloj (performance.now) casi a 0
    if (cfg.reloadGuestAt && k === 1 && !st.gReload && T >= cfg.reloadGuestAt * 1000) { st.gReload = 1; next[1] = T + 4000; log('el invitado recarga'); continue; }
    if (st.gReload === 1 && k === 1) {
      st.gReload = 2; lb.flush(); off[1] = 500 - T;
      sess[1] = new VBb.NetFluid.Session({ slot: 1, link: lb, opts: null, name: 'Invitado', log, back: true, expect: { even: false, bestOf: opts.bestOf, points: opts.points, venue: opts.venue, net: 'fluida' } });
      bots[1] = VBb.Net.bot(1, cfg.seed + 9, 'bueno');
    }
    if (cfg.probeAt && !st.probe && T >= cfg.probeAt * 1000) st.probe = { DpA: r2(sess[0].Dp), DpB: r2(sess[1].Dp), skew: r2(sess[1]._target(T + off[1]) - sess[0]._target(T + off[0])) };
    const hidNow = k === 1 && hid();
    if (k === 1 && cfg.hidden) { sess[1].setAway(hidNow); sess[1].maxCatch = hidNow ? 150 : 0; }
    next[k] += hidNow ? 1000 : 8 + fr() * (fmax[k] - 8) + hitch;
    if (cfg.reloadHostAt && !reloaded && T >= cfg.reloadHostAt * 1000) {   // el anfitrión recarga la página: sesión nueva sin opciones (adopta)
      reloaded = true; la.flush(); sess[0] = new VA.NetFluid.Session({ slot: 0, link: la, opts: null, name: 'Anfitrión', log, back: true }); bots[0] = VA.Net.bot(0, cfg.seed + 7, 'bueno'); log('el anfitrión recarga');
    }
    if (cfg.cut && !cutDone && T >= cfg.cut.at * 1000 && sess[0].g && sess[0].g.mode === 'rally') { cutDone = true; la.down(cfg.cut.ms); st.cutAt = T; log('corte de ' + cfg.cut.ms + ' ms'); }
    if (k === 0 && sess[0].g && sess[0].g.fl && sess[0].g.mode === 'rally' && sess[0].g.fl.own === 1 && sess[0].g.fl.frozen) {
      st.frozenCur += T - lastAt[0]; if (st.frozenCur > st.frozenMax) st.frozenMax = st.frozenCur;
    } else if (k === 0) st.frozenCur = 0;
    const s = sess[k], g = s.g;
    const inp = g ? bots[k](g) : null;
    let r;
    try { r = s.advance(T + off[k], inp); } catch (e) { st.err = e; break; }
    st.frames[k]++;
    st.statusAt[k + ':' + r.status] = (st.statusAt[k + ':' + r.status] || 0) + 1;
    const playing = r.status === 'playing' || r.status === 'waiting';
    if (playing) {
      st.playFrames[k]++;
      if (r.status === 'waiting') { st.waitFrames[k]++; if (st.cutAt >= 0) st.waitAfterCut[k]++; }
      if (r.unstable) st.unstable[k]++;
      if (!cfg.hidden || k === 0) {
        const tgt = Math.floor((T + off[k] - s.t0) / STEP_MS), d = Math.abs(r.tick - tgt);
        if (d > 2) st.tickBad[k]++; if (d > st.tickMax[k]) st.tickMax[k] = d;
      }
    }
    if (r.canAI && st.canAIat[k] < 0) st.canAIat[k] = T;
    if (cfg.cut && cfg.cut.ai && r.canAI && !st.aiSide[k] && (cfg.cut.ai === 'host') === (k === 0)) { st.aiSide[k] = s.vsAI(); log((k ? 'el invitado' : 'el anfitrión') + ' sigue contra la IA'); }
    if ((sess[0].stats.resyncs || sess[1].stats.resyncs) && st.resyncAt < 0) st.resyncAt = T;
    for (const e of r.events) if (e.type === 'gameOver') st.goEv[k]++;
    let lastT = -1;
    for (const e of r.confirmed) {
      if (e.type === 'gameOver') st.goConf[k]++;
      const pid = e.player && typeof e.player === 'object' ? e.player.id : -1;
      const key = e._tick + ':' + e.type + ':' + pid + ':' + (e.team == null ? '' : e.team) + ':' + (e.reason || '') + ':' + (e.kind || '');
      if (seen[k].has(key) && e.type !== 'gameOver') st.dupConf[k]++; seen[k].add(key);
      if (e._tick < lastT) st.unsorted[k]++; lastT = e._tick;
      if (e.type === 'point') st.pts[k].push([e.team, (e.score || []).join('-'), (e.sets || []).join('-')].join('/'));
      const tk = e.type === 'block' ? 'block' + (e.player ? e.player.team : '?') + (e.kind || '') : e.type === 'point' ? 'pt' + e.team + (e.reason || '') : null;
      if (tk) st.tally[k][tk] = (st.tally[k][tk] || 0) + 1;
    }
    // suavizado: el rival pintado contra su pose real en Tr (anillo de la otra máquina); saltos por frame
    if (playing && s.g && r.g && s.g.mode === 'rally' && !s.solo && !s.g.fl.loc[1 - k]) {
      const Tr = s.Tr, t0 = Math.floor(Tr), u = Tr - t0, A = truth[1 - k].get(t0), B = truth[1 - k].get(t0 + 1);
      if (A && B) {
        let jumpy = false; for (let i = 0; i < A.length; i++) if (Math.hypot(A[i][0] - B[i][0], A[i][1] - B[i][1]) > 0.3) jumpy = true;
        if (!jumpy) for (let i = 0; i < A.length; i++) {
          const p = r.g.teams[1 - k][i], tx = A[i][0] + (B[i][0] - A[i][0]) * u, ty = A[i][1] + (B[i][1] - A[i][1]) * u, tz = A[i][2] + (B[i][2] - A[i][2]) * u;
          st.dispErr[k].push(Math.hypot(p.x - tx, p.y - ty, p.z - tz));
        }
      }
      const dtf = T - lastAt[k];
      const cur = r.g.teams[1 - k].map(p => [p.x, p.y, p.z]);
      if (prevDisp[k] && prevDisp[k].mode === 'rally' && dtf > 0 && dtf < 60) for (let i = 0; i < cur.length; i++) {
        const P = prevDisp[k].p[i], d = Math.hypot(cur[i][0] - P[0], cur[i][1] - P[1], cur[i][2] - P[2]);
        st.jumpP[k].push(Math.max(0, d - 8 * dtf / 1000));
      }
      prevDisp[k] = { p: cur, mode: 'rally' };
      const bb = [r.g.ball.x, r.g.ball.y, r.g.ball.z];
      if (prevBall[k] && dtf > 0 && dtf < 60) {
        const PB = prevBall[k], vmag = Math.hypot(r.g.ball.vx || 0, r.g.ball.vy || 0, r.g.ball.vz || 0);
        const d = Math.hypot(bb[0] - PB[0], bb[1] - PB[1], bb[2] - PB[2]);
        st.jumpB[k].push(Math.max(0, d - Math.max(vmag, PB[3]) * 1.3 * dtf / 1000 - 0.02));
      }
      prevBall[k] = [bb[0], bb[1], bb[2], Math.hypot(r.g.ball.vx || 0, r.g.ball.vy || 0, r.g.ball.vz || 0)];
    } else { prevDisp[k] = null; prevBall[k] = null; }
    // sensación (informe): reloj del balón pintado por frame (1 - Δlag/Δtic), saltos del balón pintado en el peloteo y estallidos
    // (saltos de más de 1 m en un frame) del rival y del balón al empezar el saque
    {
      const fe = st.feel[k], live = playing && s.g && r.g && !s.solo && !s.g.fl.loc[1 - k] && (s.g.mode === 'rally' || s.g.mode === 'serve'), dtf = T - lastAt[k];
      if (live && fe.prev && dtf > 0 && dtf < 60) {
        if (s.g.mode === 'rally' && fe.prev.mode === 'rally') {
          const dtk = s.tf - fe.prev.tf;
          if (dtk > 0.2) { const ck = 1 - (s.lag - fe.prev.lag) / dtk; fe.n++; if (ck < 0.6) fe.slow++; else if (ck < 0.85) fe.mid++; if (ck > 1.05) fe.fast++; }
        }
        const pc = r.g.teams[1 - k];
        for (let i = 0; i < pc.length; i++) { const P = fe.prev.p[i], d = Math.hypot(pc[i].x - P[0], pc[i].y - P[1], pc[i].z - P[2]) - 8 * dtf / 1000; if (d > 1) fe[s.g.mode === 'serve' ? 'popSP' : 'popRP']++; }
        const PB = fe.prev.b, vm = Math.max(Math.hypot(r.g.ball.vx || 0, r.g.ball.vy || 0, r.g.ball.vz || 0), PB[3]);
        const db = Math.hypot(r.g.ball.x - PB[0], r.g.ball.y - PB[1], r.g.ball.z - PB[2]) - vm * 1.3 * dtf / 1000 - 0.02;
        if (s.g.mode === 'serve' && db > 1) fe.popSB++;
        if (s.g.mode === 'rally' && fe.prev.mode === 'rally') { if (db > 0.25) fe.b25++; if (db > 0.5) fe.b50++; if (db > 1) fe.b100++; }
      }
      fe.prev = live ? { mode: s.g.mode, tf: s.tf, lag: s.lag, p: r.g.teams[1 - k].map(p => [p.x, p.y, p.z]), b: [r.g.ball.x, r.g.ball.y, r.g.ball.z, Math.hypot(r.g.ball.vx || 0, r.g.ball.vy || 0, r.g.ball.vz || 0)] } : null;
    }
    lastAt[k] = T;
    if (k === 0 && cfg.hidden && hid() && r.status === 'waiting') st.hidWait++;
    if (sess[0].status === 'over' && sess[1].status === 'over' && sess[0].result && sess[1].result) {
      if (cfg.rematch && !rematched) {   // revancha: sesiones de la época siguiente sobre el mismo enlace
        rematched = 1; st.first = summary({ cfg, sA: sess[0], sB: sess[1], st, traf, secs: T / 1000, corr, corrInfo, msgs });
        const o2 = Object.assign({}, opts, { seed: opts.seed + 1 });
        sess[0] = new VA.NetFluid.Session({ slot: 0, link: la, opts: o2, name: 'Anfitrión', log, epoch: 1 });
        sess[1] = new VBb.NetFluid.Session({ slot: 1, link: lb, opts: null, name: 'Invitado', log, epoch: 1 });
        st.goEv = [0, 0]; st.goConf = [0, 0]; st.pts = [[], []]; st.tally = [{}, {}]; seen[0].clear(); seen[1].clear();
        continue;
      }
      break;
    }
    if (cfg.stopAt && T >= cfg.stopAt * 1000) break;
  }
  const secs = T / 1000;
  st.skewEnd = sess[0].t0 && sess[1].t0 ? r2(sess[1]._target(T + off[1]) - sess[0]._target(T + off[0])) : null;
  if (process.env.FLD) for (const x of sess) console.log(JSON.stringify({ slot: x.slot, lateE: x.lateE, lateP: x.lateP, jitE: x.jitE, lossE: x.lossE, Dp: x.Dp, Dc: x.Dc, off: x.off, rttMin: x.rttMin, rtt: x.rtt }));
  if (process.env.FLKIND) console.log(JSON.stringify(traf));
  if (process.env.FLMSG) console.log(msgs.filter(m => /rebasado|bifurc/.test(m)).slice(0, 30).join(' ;; '));
  return { cfg, sA: sess[0], sB: sess[1], st, traf, secs, corr, corrInfo, msgs };
}

function summary(R) {
  const { sA, sB, st } = R, gA = sA.g, gB = sB.g;
  if (process.env.FLDBG) for (const s of [sA, sB]) console.log('warp ' + s.slot + ' ba ' + s.flStats.baBad + '/' + s.flStats.baN + ' tele ' + s.flStats.bTele + '/' + s.flStats.bTeleR + ' ' + JSON.stringify(s.warpL.filter(FREEW).map(w => [r2(w.sp), w.k, w.sh, r2(w.l0), r2(w.span), r2(w.te)])));
  const rms = a => a.length ? Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length) : 0;
  return {
    cfg: R.cfg, secs: r2(R.secs), err: st.err ? String(st.err.stack || st.err).split('\n').slice(0, 4).join(' | ') : null,
    status: [sA.status, sB.status], result: [sA.result, sB.result], sets: [gA && gA.sets, gB && gB.sets], setScores: [gA && gA.setScores, gB && gB.setScores],
    points: [st.pts[0].length, st.pts[1].length], ptsSame: JSON.stringify(st.pts[0]) === JSON.stringify(st.pts[1]),
    goEv: st.goEv, goConf: st.goConf, dupConf: st.dupConf, unsorted: st.unsorted, tallySame: JSON.stringify(sortObj(st.tally[0])) === JSON.stringify(sortObj(st.tally[1])), tally: st.tally,
    guard: [gA && gA.fl ? gA.fl.guard : -1, gB && gB.fl ? gB.fl.guard : -1], hand: [sA.flStats.hand, sB.flStats.hand], corr: R.corr, corrInfo: R.corrInfo,
    fl: [pick(sA.flStats), pick(sB.flStats)], cmpOk: [sA.cmpOk, sB.cmpOk],
    waitFrames: st.waitFrames, unstable: st.unstable, playFrames: st.playFrames, tickBad: st.tickBad, tickMax: st.tickMax,
    dispRms: [r2(rms(st.dispErr[0]) * 100), r2(rms(st.dispErr[1]) * 100)], dispP99: [r2(pct(st.dispErr[0], 0.99) * 100), r2(pct(st.dispErr[1], 0.99) * 100)],
    extrapPct: [r2(100 * sA.flStats.extrapTicks / Math.max(1, sA.flStats.dispFrames)), r2(100 * sB.flStats.extrapTicks / Math.max(1, sB.flStats.dispFrames))],
    jumpP99cm: [r2(pct(st.jumpP[0], 0.99) * 100), r2(pct(st.jumpP[1], 0.99) * 100)], jumpPmaxcm: [r2(pct(st.jumpP[0], 1) * 100), r2(pct(st.jumpP[1], 1) * 100)],
    jumpB99cm: [r2(pct(st.jumpB[0], 0.99) * 100), r2(pct(st.jumpB[1], 0.99) * 100)],
    warpP95: [r2(pct(sA.warpL.filter(FREEW).map(w => w.sp), 0.95)), r2(pct(sB.warpL.filter(FREEW).map(w => w.sp), 0.95))],
    warpP95Both: r2(pctNR(sA.warpL.filter(FREEW).concat(sB.warpL.filter(FREEW)).map(w => w.sp), 0.95)),   // (umbral: las dos máquinas juntas, ~24 muestras; con ~12 por lado la p95 era la peor)
    // (18-nov-2026: p95 por rango más cercano, pctNR: con pct, floor(n·0,95) es el índice del MÁXIMO para n <= 20; con rallies algo más
    //  largos —defensa de la IA, VB.EFFORT— el escenario 3 bajó a 20 muestras y un solo balón libre de 23 tics, 1,9, decidía la puerta)
    warpAllP95: [r2(pct(sA.warpL.map(w => w.sp), 0.95)), r2(pct(sB.warpL.map(w => w.sp), 0.95))],
    warpBy: (() => { const o = {}; for (const w of sA.warpL.concat(sB.warpL)) { const k = w.k + '/' + w.sh; (o[k] || (o[k] = [])).push(w.sp); } for (const k in o) o[k] = [o[k].length, r2(pct(o[k], 0.95))]; return o; })(),
    kbps: [r2(R.traf[0].bytes / 1024 / R.secs), r2(R.traf[1].bytes / 1024 / R.secs)], inKbps: [r2(R.traf[0].inB / 1024 / R.secs), r2(R.traf[1].inB / 1024 / R.secs)],
    pps: [r2(R.traf[0].pk / R.secs), r2(R.traf[1].pk / R.secs)],
    resyncs: [sA.stats.resyncs, sB.stats.resyncs], valid: [sA.valid, sB.valid],
    feel: st.feel ? st.feel.map(f => ({ slowPct: r2(100 * f.slow / Math.max(1, f.n)), midPct: r2(100 * f.mid / Math.max(1, f.n)), fastPct: r2(100 * f.fast / Math.max(1, f.n)),
      b25: f.b25, b50: f.b50, b100: f.b100, popServeP: f.popSP, popRallyP: f.popRP, popServeB: f.popSB })) : null
  };
}
const FREEW = w => w.k === 'serve' || (w.k === 'free' && w.sh !== 'tip');   // (saques y balones libres, spec plan C.6; la dejada junto a la red es como un remate)
function sortObj(o) { const r = {}; for (const k of Object.keys(o).sort()) r[k] = o[k]; return r; }
function pick(f) { const o = {}; for (const k of ['snapOut', 'snapIn', 'hand', 'forks', 'late', 'lateMaxMs', 'warpMax', 'snaps', 'drift', 'fqSent', 'fqOk', 'ptBad', 'sbFix', 'digestBad', 'tcOut', 'tcIn', 'ptOut', 'ptIn', 'srFallback', 'badIn', 'dropped', 'stale', 'rb', 'interpMs', 'extrapTicks', 'khCheckBad', 'baBad', 'baN']) o[k] = typeof f[k] === 'number' ? r2(f[k]) : f[k]; return o; }

function judgeMatch(R, tag) {
  const S = summary(R), c = R.cfg;
  check(tag + 'sin excepciones', !S.err, S.err || undefined);
  if (S.err) return S;
  const [rA, rB] = S.result;
  check(tag + 'los dos acaban (over, why over) con un solo gameOver en events y en confirmed',
    S.status[0] === 'over' && S.status[1] === 'over' && rA && rB && rA.why === 'over' && rB.why === 'over' && S.goEv.join() === '1,1' && S.goConf.join() === '1,1',
    { status: S.status, why: [rA && rA.why, rB && rB.why], goEv: S.goEv, goConf: S.goConf, s: S.secs });
  check(tag + 'mismo marcador, sets y ganador; mismo registro de puntos; fin cotejado',
    JSON.stringify(S.sets[0]) === JSON.stringify(S.sets[1]) && JSON.stringify(S.setScores[0]) === JSON.stringify(S.setScores[1]) && S.ptsSame &&
    rA && rB && rA.win !== rB.win && !rA.unverified && !rB.unverified,
    { sets: S.sets, setScores: S.setScores, puntos: S.points, mismos: S.ptsSame, unverified: [rA && rA.unverified, rB && rB.unverified] });
  check(tag + 'guarda de point() a 0; marcador sin reparar' + (c.loss <= 5 ? ' (sbFix 0)' : ''),
    S.guard.join() === '0,0' && (c.loss > 5 || (S.fl[0].sbFix === 0 && S.fl[1].sbFix === 0)), { guard: S.guard, sbFix: [S.fl[0].sbFix, S.fl[1].sbFix], ptBad: [S.fl[0].ptBad, S.fl[1].ptBad], digestBad: [S.fl[0].digestBad, S.fl[1].digestBad] });
  check(tag + 'mis jugadores nunca los corrige la red', S.corr.join() === '0,0', { corr: S.corr, info: S.corrInfo });
  check(tag + 'traspasos: los mismos en los dos lados (± 2: un punto por fq puede cerrar el rally justo en el khAt)' + (c.rtt <= 150 ? ', sin bifurcaciones' : '') + (c.rtt < 250 ? ', sin recuperaciones > 300 ms' : c.rtt === 250 ? ', como mucho una recuperación > 300 ms por lado (250 ms + jitter + tirón)' : ''),
    S.hand[0] > 10 && Math.abs(S.hand[0] - S.hand[1]) <= 2 && (c.rtt > 150 || (S.fl[0].forks + S.fl[1].forks === 0)) && (c.rtt > 250 || (c.rtt < 250 ? S.fl[0].late + S.fl[1].late === 0 : Math.max(S.fl[0].late, S.fl[1].late) <= 1)) && S.fl[0].khCheckBad + S.fl[1].khCheckBad === 0,
    { hand: S.hand, khCheckBad: [S.fl[0].khCheckBad, S.fl[1].khCheckBad], forks: [S.fl[0].forks, S.fl[1].forks], late: [S.fl[0].late, S.fl[1].late], lateMaxMs: [S.fl[0].lateMaxMs, S.fl[1].lateMaxMs] });
  const unst = (S.unstable[0] + S.unstable[1]) / Math.max(1, S.playFrames[0] + S.playFrames[1]);
  check(tag + 'sin parones: tic = reloj común (± 2), nunca esperando, inestable ' + (c.loss <= 2 ? '< 1 %' : 'informado'),
    S.tickBad.join() === '0,0' && S.waitFrames.join() === '0,0' && (c.loss > 2 || unst < 0.01) && S.fl[0].srFallback + S.fl[1].srFallback === 0,
    { tickBad: S.tickBad, tickMax: S.tickMax, esperando: S.waitFrames, inestable: r2(unst * 100) + ' %', srFallback: [S.fl[0].srFallback, S.fl[1].srFallback] });
  // (aceleración del balón: 1 + Dp / vuelo hasta el traspaso; con RTT 150+ el colchón Dp ronda los 30 tics y un saque en salto pasa
  //  de 1,6: ahí se informa con tope 1,75; ver el informe de WP2)
  const rmsLim = c.rtt <= 60 && c.loss <= 2 ? 4 : 10, exLim = c.rtt <= 150 ? 2 : 10, wLim = c.rtt <= 60 ? 1.6 : c.rtt <= 250 ? 1.75 : 2.0;
  check(tag + 'suavizado: error del rival RMS < ' + rmsLim + ' cm, extrapolación < ' + exLim + ' %, aceleración del balón (saques y libres) p95 <= ' + String(wLim).replace('.', ','),
    Math.max(S.dispRms[0], S.dispRms[1]) < rmsLim && Math.max(S.extrapPct[0], S.extrapPct[1]) < exLim && S.warpP95Both <= wLim,
    { rmsCm: S.dispRms, p99Cm: S.dispP99, extrap: S.extrapPct, warpP95: S.warpP95, warpP95Both: S.warpP95Both, warpTodosP95: S.warpAllP95, Dp: [S.fl[0].interpMs, S.fl[1].interpMs], saltoJugP99cm: S.jumpP99cm, saltoBalonP99cm: S.jumpB99cm, snaps: [S.fl[0].snaps, S.fl[1].snaps], drift: [S.fl[0].drift, S.fl[1].drift] });
  check(tag + 'tráfico <= 2,5 KB/s y <= 35 paquetes/s por sentido', Math.max(S.kbps[0], S.kbps[1]) <= 2.5 && Math.max(S.pps[0], S.pps[1]) <= 35, { kbps: S.kbps, fotos: S.inKbps, pps: S.pps });
  check(tag + 'eventos: sin duplicados, confirmados en orden, mismo recuento (bloqueos y puntos) en los dos',
    S.dupConf.join() === '0,0' && S.unsorted.join() === '0,0' && S.tallySame, { dup: S.dupConf, desorden: S.unsorted, tally: S.tallySame ? undefined : S.tally });
  return S;
}

// ---------------------------------------------------------------------------------------------------------------------------------
const OUT = { mode: FULL ? 'full' : 'quick', matches: [], scen: {} };
let idx = 0;
function matrix() {
  if (QUICK) return [
    { rtt: 0, jit: 0, loss: 0, venue: 'hall', seed: 1 },
    { rtt: 60, jit: 15, loss: 2, venue: 'beach', seed: 2 },
    { rtt: 150, jit: 20, loss: 5, venue: 'hall', seed: 2 },
    { rtt: 250, jit: 20, loss: 2, venue: 'beach', seed: 1 },
    { rtt: 150, jit: 40, loss: 0, venue: 'beach', seed: 1 },
    { rtt: 60, jit: 0, loss: 5, venue: 'hall', seed: 1 },
    { rtt: 150, jit: 40, loss: 5, venue: 'hall', seed: 2 }   // (la puerta de 1,75 de la aceleración también con variación y pérdida altas)
  ];
  const L = [];
  for (const rtt of [0, 60, 150, 250, 400]) for (const jit of [0, 20, 40]) for (const loss of [0, 2, 5, 10]) for (const venue of ['beach', 'hall']) for (const seed of [1, 2, 3, 4, 5])
    L.push({ rtt, jit, loss, venue, seed, points: seed % 2 ? 11 : 21, bestOf: seed === 5 ? 3 : 1 });
  return L;
}
const t00 = Date.now();
console.log('== partidos (' + (FULL ? 'matriz completa' : 'rápida') + ') ==');
for (const cfg of SCEN ? [] : matrix()) {
  idx++;
  if (ONLY > 0 && idx !== ONLY) continue;
  const tag = '[' + idx + ' rtt ' + cfg.rtt + ' jit ' + cfg.jit + ' pérdida ' + cfg.loss + ' ' + cfg.venue + ' s' + cfg.seed + '] ';
  const t0 = Date.now();
  const R = run(Object.assign({ points: 11, bestOf: 1 }, cfg));
  const S = judgeMatch(R, tag);
  S.cpuS = r2((Date.now() - t0) / 1000);
  console.log('       (' + S.secs + ' s de partido, ' + S.cpuS + ' s de CPU, ' + S.points[0] + ' puntos, traspasos ' + S.hand[0] + ', KB/s ' + S.kbps.join('/') + ')');
  if (S.feel) console.log('       sensación ' + JSON.stringify({ feel: S.feel, Dp: [S.fl[0].interpMs, S.fl[1].interpMs], snaps: [S.fl[0].snaps, S.fl[1].snaps], warpP95: S.warpP95 }));
  OUT.matches.push(S);
}

if (ONLY < 0) {
  console.log('== escenarios ==');
  // corte de 3 s a mitad de peloteo: esperando, mi lado sigue, el balón rival se para; acuerdo al final
  {
    const R = run({ rtt: 60, jit: 10, loss: 0, venue: 'hall', seed: 3, points: 11, cut: { at: 20, ms: 3000 } });
    const S = summary(R);
    check('corte de 3 s: sin excepciones', !S.err, S.err || undefined);
    if (!S.err) {
      check('corte de 3 s: los dos pasan a «esperando» y avisan de conexión inestable; sin IA (< 10 s)', R.st.waitAfterCut[0] > 20 && R.st.waitAfterCut[1] > 20 && R.st.unstable[0] > 0 && R.st.canAIat[0] < 0 && R.st.canAIat[1] < 0,
        { esperando: R.st.waitAfterCut, inestable: R.st.unstable, canAI: R.st.canAIat });
      check('corte de 3 s: los dos acaban con el mismo marcador y fin cotejado', S.status.join() === 'over,over' && JSON.stringify(S.setScores[0]) === JSON.stringify(S.setScores[1]) && S.ptsSame && S.result[0] && !S.result[0].unverified && !S.result[1].unverified,
        { status: S.status, setScores: S.setScores, mismos: S.ptsSame, res: S.result });
      check('corte de 3 s: mis jugadores nunca corregidos', S.corr.join() === '0,0', S.corr);
    }
    OUT.scen.cut3 = S;
  }
  // corte de 15 s: a los 10 s IA (el anfitrión), al volver la red rs y acuerdo
  {
    const R = run({ rtt: 60, jit: 10, loss: 0, venue: 'beach', seed: 4, points: 11, cut: { at: 15, ms: 15000, ai: 'host' } });
    const S = summary(R);
    check('corte de 15 s: sin excepciones', !S.err, S.err || undefined);
    if (!S.err) {
      const w = R.st.canAIat[0] >= 0 ? (R.st.canAIat[0] - R.st.cutAt) / 1000 : -1;
      check('corte de 15 s: «Seguir contra la IA» a los ~10 s; el anfitrión la elige; al volver, rs (el invitado lo aplica)', w > 9.5 && w < 12 && R.st.aiSide[0] && R.sB.stats.rsIn >= 1,
        { s: r2(w), ia: R.st.aiSide, rsIn: R.sB.stats.rsIn, resyncs: S.resyncs });
      check('corte de 15 s: después los dos acaban con el mismo marcador', S.status.join() === 'over,over' && JSON.stringify(S.setScores[0]) === JSON.stringify(S.setScores[1]),
        { status: S.status, setScores: S.setScores, res: S.result });
      check('corte de 15 s: el invitado vuelve a mandar en su hueco (deja la IA)', R.sA.g.hum[1].ai === false && R.sB.g.hum[1].ai === false, { a: R.sA.g.hum[1].ai, b: R.sB.g.hum[1].ai });
    }
    OUT.scen.cut15 = S;
  }
  // corte de 70 s: a los 60 s cada lado juzga (anfitrión gana; invitado no cuenta)
  {
    const R = run({ rtt: 60, jit: 0, loss: 0, venue: 'hall', seed: 5, points: 21, cut: { at: 10, ms: 70000, ai: 'host' }, stopAt: 95 });
    const S = summary(R);
    check('corte de 70 s: sin excepciones', !S.err, S.err || undefined);
    if (!S.err) check('corte de 70 s: el anfitrión gana (rivalGone) y el invitado no cuenta (hostGone, no válido)',
      R.sA.result && R.sA.result.why === 'rivalGone' && R.sA.result.win && R.sB.result && R.sB.result.why === 'hostGone' && !R.sB.valid, { a: R.sA.result, b: R.sB.result, validB: R.sB.valid });
    OUT.scen.cut70 = { result: S.result, valid: S.valid };
  }
  // revancha: época 1 sobre el mismo enlace, sin que se cuele nada del partido anterior
  {
    const R = run({ rtt: 60, jit: 10, loss: 2, venue: 'hall', seed: 6, points: 11, rematch: true, secs: 2400 });
    const S = summary(R), F1 = R.st.first;
    check('revancha: sin excepciones', !S.err, S.err || undefined);
    if (!S.err) check('revancha: los dos partidos acaban con el mismo marcador en los dos lados (época 0 y 1)',
      F1 && F1.status.join() === 'over,over' && JSON.stringify(F1.setScores[0]) === JSON.stringify(F1.setScores[1]) && S.status.join() === 'over,over' &&
      JSON.stringify(S.setScores[0]) === JSON.stringify(S.setScores[1]) && R.sA.epoch === 1 && !S.result[0].unverified && !S.result[1].unverified && S.goEv.join() === '1,1',
      { primero: F1 && F1.setScores, segundo: S.setScores, ep: R.sA.epoch, res: S.result });
  }
  // el anfitrión recarga a mitad: adopta la partida del invitado (rs) y siguen hasta el final
  {
    const R = run({ rtt: 60, jit: 10, loss: 0, venue: 'beach', seed: 7, points: 11, reloadHostAt: 25 });
    const S = summary(R);
    check('recarga del anfitrión: sin excepciones', !S.err, S.err || undefined);
    if (!S.err) check('recarga del anfitrión: adopta la partida del invitado (rs) y los dos acaban igual',
      R.sA.stats.rsIn >= 1 && S.status.join() === 'over,over' && JSON.stringify(S.setScores[0]) === JSON.stringify(S.setScores[1]),
      { rsIn: R.sA.stats.rsIn, status: S.status, setScores: S.setScores, res: S.result });
  }
  // el invitado recarga a mitad (4 s): el anfitrión no le manda el rs hasta que el invitado mide su desfase (si no, t0 en el reloj
  // del anfitrión y el invitado congelado); siguen hasta el final con el mismo tic común
  {
    const R = run({ rtt: 60, jit: 10, loss: 0, venue: 'hall', seed: 10, points: 11, reloadGuestAt: 25 });
    const S = summary(R);
    check('recarga del invitado: sin excepciones', !S.err, S.err || undefined);
    if (!S.err) check('recarga del invitado: aplica el rs ya con su reloj medido y los dos acaban igual (mismo tic común)',
      R.st.gReload === 2 && R.sB.stats.rsIn >= 1 && R.sB.ready && S.status.join() === 'over,over' && JSON.stringify(S.setScores[0]) === JSON.stringify(S.setScores[1]) &&
      R.st.skewEnd !== null && Math.abs(R.st.skewEnd) <= 2,
      { rsIn: R.sB.stats.rsIn, ready: R.sB.ready, status: S.status, setScores: S.setScores, skew: R.st.skewEnd, res: S.result });
  }
  // el anfitrión se queda parado 8 s (móvil que cambia de app): rs con el t0 ya movido (el tic común de los dos sigue igual) y sin
  // fotos de la recuperación (el colchón del rival del invitado vuelve en unos segundos, no en minutos)
  {
    const R = run({ rtt: 60, jit: 0, loss: 0, venue: 'hall', seed: 11, points: 11, stallHost: { at: 20, ms: 8000 }, probeAt: 40 });
    const S = summary(R), P = R.st.probe || {};
    check('parón de 8 s del anfitrión: sin excepciones', !S.err, S.err || undefined);
    if (!S.err) check('parón de 8 s del anfitrión: mismo tic común después (± 1,5), colchón del rival < 60 tics a los 12 s y los dos acaban igual',
      R.st.stallDone && R.sB.stats.rsIn >= 1 && Math.abs(P.skew) <= 1.5 && R.st.skewEnd !== null && Math.abs(R.st.skewEnd) <= 1.5 && P.DpB < 60 && P.DpA < 60 &&
      S.status.join() === 'over,over' && JSON.stringify(S.setScores[0]) === JSON.stringify(S.setScores[1]),
      { probe: P, skewEnd: R.st.skewEnd, rsIn: R.sB.stats.rsIn, status: S.status, setScores: S.setScores });
  }
  // pestaña oculta del invitado (avanza cada 1 s con maxCatch 150 y su humano en la IA): el anfitrión no ve el balón parado más de 1,2 s
  {
    const R = run({ rtt: 60, jit: 0, loss: 0, venue: 'hall', seed: 8, points: 11, hidden: { at: 10, until: 60 } });
    const S = summary(R);
    check('pestaña oculta: sin excepciones', !S.err, S.err || undefined);
    // (y sin «Esperando…» en el anfitrión: con el rival ausente el aviso usa el umbral general, no el de 500 ms con su balón)
    if (!S.err) check('pestaña oculta: el balón rival nunca parado más de 1,2 s en el otro lado, sin «esperando» en el anfitrión y el partido acaba igual',
      R.st.frozenMax <= 1200 && R.st.hidWait === 0 && S.status.join() === 'over,over' && JSON.stringify(S.setScores[0]) === JSON.stringify(S.setScores[1]),
      { paradoMaxMs: Math.round(R.st.frozenMax), esperandoFrames: R.st.hidWait, status: S.status, setScores: S.setScores });
  }
  // Precisa contra Fluida: los dos se rechazan con bye 'version' (o 'mismatch'), sin excepciones
  for (const fluidHost of [true, false]) {
    const VA = load(), VBb = load();
    let T = 0;
    const [la, lb] = VA.Net.memPair({ lag: 40, seed: 9, clock: () => T });
    const opts = { online: true, seed: 11, venue: 'hall', bestOf: 1, points: 11, humans: [{}, {}], net: fluidHost ? 'fluida' : undefined };
    const A = fluidHost ? new VA.NetFluid.Session({ slot: 0, link: la, opts, name: 'A' }) : new VA.Net.Session({ slot: 0, link: la, opts, name: 'A' });
    const B = fluidHost ? new VBb.Net.Session({ slot: 1, link: lb, opts: null, name: 'B' }) : new VBb.NetFluid.Session({ slot: 1, link: lb, opts: null, name: 'B' });
    let err = null;
    try { for (; T < 5000; T += 16) { A.advance(T, null); B.advance(T + 1000, null); } } catch (e) { err = e; }
    const nm = fluidHost ? 'anfitrión Fluida contra invitado Precisa' : 'anfitrión Precisa contra invitado Fluida';
    const ok = w => w === 'version' || w === 'mismatch';
    check(nm + ': los dos acaban con bye version/mismatch y sin excepciones', !err && A.status === 'ended' && B.status === 'ended' && A.result && B.result && ok(A.result.why) && ok(B.result.why),
      { err: err && String(err), a: [A.status, A.result], b: [B.status, B.result] });
  }
  // invitado Fluida con una sala anunciada distinta: bye 'mismatch'
  {
    const VA = load(), VBb = load();
    let T = 0;
    const [la, lb] = VA.Net.memPair({ lag: 20, seed: 3, clock: () => T });
    const A = new VA.NetFluid.Session({ slot: 0, link: la, opts: { online: true, seed: 3, venue: 'hall', points: 11, humans: [{}, {}], net: 'fluida' }, name: 'A' });
    const B = new VBb.NetFluid.Session({ slot: 1, link: lb, opts: null, name: 'B', expect: { venue: 'beach', points: 11, net: 'fluida' } });
    for (; T < 3000; T += 16) { A.advance(T, null); B.advance(T, null); }
    check('sala anunciada distinta: el invitado Fluida manda bye mismatch y el anfitrión no empieza', B.status === 'ended' && B.result && B.result.why === 'mismatch' && A.status !== 'playing',
      { a: A.status, b: [B.status, B.result] });
  }
  // endurecimiento 1: una sesión sola (enlace mudo) para los caminos raros que los partidos no provocan
  {
    const VA = load(), S = VA.Sim, mute = { send() { }, poll() { return []; } };
    const mk = () => { const A = new VA.NetFluid.Session({ slot: 0, link: mute, opts: { online: true, seed: 5, venue: 'hall', points: 11, humans: [{}, {}], net: 'fluida' }, name: 'A' }); A.status = 'playing'; A.started = true; A.t0 = 0; return A; };
    const run = (A, from, to) => { for (let t = from; t <= to; t += 16) { A.lastRecv = t; A.advance(t, null); } return to; };
    // (a) con un rs mandado y sin rsok, un pt del rival es de su partida de antes del rs: no se aplica; tras el rsok, sí
    {
      const A = mk(); let t = run(A, 16, 4000); const g = A.g, F = g.fl;
      A._resync(t); const r0 = F.r, sc0 = g.score.join('-');
      const pt = () => ({ k: 'pt', r: F.r, T: A.T, w: 1, reason: 'out', text: 'Fuera', pid: -1, m: S.flBundle(g).m });
      A._onCtl(pt(), t);
      const held = F.r === r0 && g.score.join('-') === sc0;
      A._onCtl({ k: 'rsok', id: A.rsPend ? A.rsPend.m.id : -1 }, t); A._onCtl(pt(), t);
      check('rs sin rsok: el pt del rival de antes del rs no se aplica; después del rsok, sí', held && F.r === r0 + 1 && g.score[1] === +sc0.split('-')[1] + 1,
        { held, r: [r0, F.r], score: [sc0, g.score.join('-')] });
    }
    // (b) bifurcación con mi punto sin confirmar DESPUÉS de preparar el saque siguiente (corte): todo o nada, ya no se deshace (el
    // setupServe movió a mis jugadores y nextSet no se puede deshacer); el que llama lo trata como punto que no cuadra (sb del
    // anfitrión). El punto se queda y el saque siguiente no se atasca. (Antes se deshacía solo el marcador)
    {
      const A = mk(); let t = run(A, 16, 5000); const g = A.g, F = g.fl, mode0 = g.mode;
      const r0 = F.r, sc0 = g.score.join('-');
      F.own = 0; S._fault(g, 1, 'out', 'Fuera', g.teams[1][0]); A._post(t, r0);
      const pend = A.ptPend[r0], hasPre = !!(pend && pend.pre && pend.pre.r === r0);
      for (let t1 = t + 16; t1 <= t + 6000; t1 += 16) A.advance(t1, null);   // (corte: sin noticias, el pt sigue sin pa)
      t += 6000; const srv1 = F.srvR, mode1 = g.mode;
      const undone = A._undoPoint(r0, t);
      const back = !undone && F.r === r0 + 1 && g.score.join('-') !== sc0 && F.srvR === r0 + 1;
      t = run(A, t + 16, t + 3000);
      check('bifurcación tras el tiempo muerto: con el saque siguiente ya preparado el punto no se deshace (todo o nada) y el saque no se atasca',
        mode0 === 'serve' && hasPre && srv1 === r0 + 1 && mode1 !== 'point' && back && F.r === r0 + 1 && F.srvR === r0 + 1 && g.mode !== 'point',
        { mode0, hasPre, srv1, mode1, undone, back, r: [r0, F.r], srvR: F.srvR, score: [sc0, g.score.join('-')], mode: g.mode });
    }
    // (c) resync tras jugar solo con el balón en vuelo: el dueño es quien tocó el último (no el del setupServe)
    {
      const A = mk(); let t = run(A, 16, 5000); const g = A.g, F = g.fl;
      A.status = 'waiting'; A.waitMs = 20000; A.vsAI(true);
      // un peloteo en solitario hasta que el balón vuele tras un toque del rival (equipo 1) sin haber caído
      let found = false;
      for (let k = 0; k < 40000 && !found; k++) { t += 16; A.lastRecv = t; A.advance(t, null); if (g.mode === 'rally' && g.touchTeam === 1 && !g.ball.held && g.ball.z > 1 && g.ball.vx * (g.teams[1][0].x > 0 ? -1 : 1) > 0) found = true; }
      // (equipo 0 en x > 0: si el balón ya cruzó al campo del 0, es del 0)
      const crossed = found && g.ball.x > 0;
      if (found) { F.own = 0; A._resync(t); }
      check('resync tras jugar solo: el balón en vuelo es del equipo que tocó el último', found && F.own === (crossed ? 0 : 1), { found, crossed, own: F.own, touchTeam: g.touchTeam, khAt: F.khAt });
      // ...salvo que ya esté hondo en el campo del otro (lo pasó la zona de traspaso): entonces es del otro y sin traspaso
      let deep = false;
      if (found) { g.mode = 'rally'; F.frozen = false; F.khAt = -1; F.own = 1; g.touchTeam = 1; g.ball.x = 5; g.ball.z = 2; g.ball.vx = Math.abs(g.ball.vx) || 10; A._resync(t); deep = F.own === 0 && F.khAt < 0; }
      check('resync con el balón ya hondo en el campo del otro: es del otro (podrá jugarlo)', deep, { own: F.own, khAt: F.khAt });
    }
    // endurecimiento 2
    // (d) los dos dimos el punto r y yo rechacé el suyo con rb (mi contacto era más nuevo), pero luego llega su tc ganador: deshago mi
    // punto, aplico su tc y su pt rechazado vale (antes: nadie lo volvía a mandar y el rally se quedaba esperando su punto)
    {
      const A = mk(); let t = run(A, 16, 5000); const g = A.g, F = g.fl;
      const r0 = F.r, sc0 = g.score.slice(), Bd = S.flBundle(g);
      F.own = 0; S._fault(g, 1, 'out', 'Fuera', g.teams[1][0]); A._post(t, r0);
      const pp = A.ptPend[r0]; A.myLastS = 3; if (pp) { pp.myS = 3; pp.tc = { k: 'tc', r: r0 }; }
      const rb0 = A.flStats.rb;
      A._onCtl({ k: 'pt', r: r0, T: A.T, w: 1, reason: 'out', text: 'Fuera', pid: -1, m: Bd.m, lt: -1 }, t);
      const rejected = A.flStats.rb === rb0 + 1 && !!A.ptRej[r0] && F.r === r0 + 1 && g.score[0] === sc0[0] + 1;
      // (su tc es ANTERIOR a mi punto: gana lo que pasó antes)
      const tc = Object.assign({}, Bd, { k: 'tc', r: r0, own: 1, kh: -1, khAt: -1, par: F.seq, s: F.seq + 1, T: A.T - 3, h: -1, kind: 'hit' });
      A._onCtl(tc, t);
      check('doble punto con rb: tras el tc ganador del otro, mi punto se deshace y su pt rechazado se aplica',
        rejected && F.r === r0 + 1 && g.score[0] === sc0[0] && g.score[1] === sc0[1] + 1 && !A.ptRej[r0] && !A.ptPend[r0],
        { rejected, r: [r0, F.r], score: [sc0.join('-'), g.score.join('-')], held: !!A.ptRej[r0], pend: !!A.ptPend[r0] });
    }
    // (e) mi punto que cerraba el partido con el final ya presentado (corte largo): ya no se deshace (la hoja final y la celebración ya
    // salieron); el que llama lo trata como punto que no cuadra (no verificado, sb del anfitrión). Nada se retira
    {
      const sent = [], rec = { send(ch, d) { if (ch === 'ctl') sent.push(JSON.parse(d)); }, poll() { return []; } };
      const A = new VA.NetFluid.Session({ slot: 0, link: rec, opts: { online: true, seed: 5, venue: 'hall', points: 11, humans: [{}, {}], net: 'fluida' }, name: 'A' });
      A.status = 'playing'; A.started = true; A.t0 = 0;
      let t = run(A, 16, 5000); const g = A.g, F = g.fl, r0 = F.r;
      const blk = S.flMatch(g); blk.score = [10, 3]; S.flMatch(g, blk); A.pre = S.flMatch(g);
      F.own = 0; S._fault(g, 1, 'out', 'Fuera', g.teams[1][0]); A._post(t, r0);
      for (let k = 0; k < 2000 && A.status !== 'over'; k++) { t += 16; A.advance(t, null); }   // (corte: sin pa, el punto sigue pendiente)
      const over = A.status === 'over' && A.finSent && A.goSeen;
      const undone = A._undoPoint(r0, t);
      const cancel = sent.some(m => m.k === 'fin' && m.x === 1);
      A._onCtl({ k: 'fin', sets: [1, 0], setScores: [[11, 3]], w: 0 }, t); const fin1 = !!A.finIn; A._onCtl({ k: 'fin', x: 1 }, t);
      check('punto que cerraba el partido con el final ya presentado: no se deshace, sigue el final, sin fin retirado',
        over && !undone && A.status === 'over' && A.goSeen && A.finSent && !cancel && g.score.join('-') === '11-3' && fin1 && A.finIn === null,
        { over, undone, status: A.status, goSeen: A.goSeen, finSent: A.finSent, result: A.result, cancel, score: g.score.join('-'), fin1, finIn: A.finIn });
    }
    // endurecimiento 3
    const mkS = (slot) => { const A = new VA.NetFluid.Session({ slot, link: mute, opts: { online: true, seed: 5, venue: 'hall', points: 11, humans: [{}, {}], net: 'fluida' }, name: 'A' }); A.status = 'playing'; A.started = true; A.t0 = 0; return A; };
    const toRally = (A, t) => { for (let k = 0; k < 40000 && A.g.mode !== 'rally'; k++) { t += 16; A.lastRecv = t; A.advance(t, null); } return t; };
    // (f) mi fq llegó al otro cuando el balón ya era mío (fx): la falta la pito yo en cuanto el balón es mío; de otro rally, nada
    {
      const A = mkS(0); let t = toRally(A, 0); const g = A.g, F = g.fl, r0 = F.r, sc0 = g.score.slice(), pid = g.teams[0][0].id;
      g.mode = 'rally'; g.ball.held = null; F.own = 1;   // (enlace mudo: si saca el rival no hay peloteo; se fuerza)
      A._onCtl({ k: 'fx', r: r0 - 1, pid }, t); const old = A.fxHeld.length === 0;
      A._onCtl({ k: 'fx', r: r0, pid }, t); const held = A.fxHeld.length === 1 && F.r === r0;
      F.own = 0; A._fxCheck(t);
      check('fx (fq devuelto tras el traspaso): la falta de mi jugador la doy yo cuando el balón es mío; la de otro rally no',
        old && held && F.r === r0 + 1 && g.score[0] === sc0[0] && g.score[1] === sc0[1] + 1 && !!A.ptPend[r0] && !A.fxHeld.length,
        { old, held, r: [r0, F.r], score: [sc0.join('-'), g.score.join('-')], pend: !!A.ptPend[r0] });
    }
    // (g) el invitado da un punto, el anfitrión ve otro marcador y manda sb y luego pa: tras el sb, el pa no deja cmpBad puesto
    {
      const A = mkS(1); let t = toRally(A, 0); const g = A.g, F = g.fl, r0 = F.r;
      F.own = 1; S._fault(g, 0, 'out', 'Fuera', g.teams[0][0]); A._post(t, r0);
      const pend = !!A.ptDig[r0];
      const blk = S.flMatch(g); blk.score = [blk.score[0] + 1, blk.score[1]];
      A._onCtl({ k: 'sb', blk }, t);
      A._onCtl({ k: 'pa', r: r0, d: S.flDigest(g) }, t);
      check('sb y luego pa: el invitado arreglado no se queda con cmpBad (partido verificable)',
        pend && A.cmpBad === -1 && A.flStats.digestBad === 0 && A.flStats.sbFix === 1 && g.score.join('-') === blk.score.join('-') && !A.ptPend[r0],
        { pend, cmpBad: A.cmpBad, digestBad: A.flStats.digestBad, score: g.score.join('-') });
    }
    // (h) su tc de este rally espera en tcFut (su reloj va por delante) y llega su pt: el golpe se confirma igual
    {
      const A = mkS(0); let t = toRally(A, 0); const g = A.g, F = g.fl, r0 = F.r, Bd = S.flBundle(g);
      A.advance(t += 16, null); A.myLastS = -1; A.myLastTc = null;
      const tc = Object.assign({}, Bd, { k: 'tc', r: r0, own: 1, kh: -1, khAt: -1, par: F.seq, s: F.seq + 1, T: A.T + 6, h: -1, kind: 'hit', ev: [{ type: 'hit', team: 1, _r: r0, _tick: A.T + 6 }] });
      A._onCtl(tc, t); const fut = A.tcFut.length === 1;
      A._onCtl({ k: 'pt', r: r0, T: A.T + 7, w: 1, reason: 'out', text: 'Fuera', pid: -1, m: Bd.m, lt: -1 }, t);
      const hit = A._out.confirmed.some(e => e.type === 'hit' && e._o === 1);
      check('pt con su tc del mismo rally aún en tcFut: el golpe no se pierde (confirmado) y tcFut queda vacío',
        fut && F.r === r0 + 1 && !A.tcFut.length && hit, { fut, r: [r0, F.r], left: A.tcFut.length, hit });
    }
  }
  // endurecimiento 4 (fallos de sesión revisados)
  {
    const VA = load(), S = VA.Sim, OP = { online: true, seed: 5, venue: 'hall', points: 11, humans: [{}, {}], net: 'fluida' };
    const recL = () => { const sent = []; return { sent, send(ch, d) { if (ch === 'ctl') sent.push(JSON.parse(d)); }, poll() { return []; } }; };
    const mkR = (slot, L) => { const A = new VA.NetFluid.Session({ slot, link: L, opts: OP, name: 'A' }); A.status = 'playing'; A.started = true; A.t0 = 0; return A; };
    const adv = (A, from, to, alive) => { for (let t = from; t <= to; t += 16) { if (alive) A.lastRecv = t; A.advance(t, null); } return to; };
    // (i) el invitado siguió contra la IA y vuelve el anfitrión: el rs que le manda cuenta (valid true en los dos), como net.js
    {
      const L = recL(), A = mkR(1, L); adv(A, 16, 3000, true);
      A.valid = false; A.hostBack = true; A._onCtl({ k: 'ready' }, 3000);
      const rs = L.sent.filter(m => m.k === 'rs').pop();
      check('vuelta del anfitrión tras «seguir contra la IA»: el rs manda valid true y el invitado vuelve a contar', !!rs && rs.valid === true && A.valid === true, { rs: !!rs, v: rs && rs.valid, valid: A.valid });
    }
    // (ii) un rs que llega antes de medir el desfase (invitado recién recargado) no se aplica ni se confirma
    {
      const L = recL(), A = new VA.NetFluid.Session({ slot: 1, link: L, opts: OP, name: 'B' });
      A._onCtl({ k: 'rs', id: 1, T: 5000, d: VA.Sim.serialize(A.g), t0: 99999, valid: true, se: 0 }, 100);
      check('rs antes de medir el reloj: no se aplica ni se manda rsok', A.status === 'connecting' && !A.started && A.rsIn === 0 && !L.sent.some(m => m.k === 'rsok'), { status: A.status, rsIn: A.rsIn });
    }
    // (iii) marcador distinto en un punto del invitado: el anfitrión manda sb {t} y el sbok del invitado le borra cmpBad; el rs también
    {
      const L = recL(), A = mkR(0, L); let t = adv(A, 16, 5000, true); const g = A.g, F = g.fl;
      A.myLastS = -1; A.myLastTc = null;
      A._onCtl({ k: 'pt', r: F.r, T: A.T, w: 1, reason: 'out', text: 'Fuera', pid: -1, m: S.flBundle(g).m, d: [999], lt: -1 }, t);
      const sb = L.sent.filter(m => m.k === 'sb').pop(), bad = A.cmpBad >= 0;
      A._onCtl({ k: 'sbok', t: sb ? sb.t : -9 }, t);
      const okSb = A.cmpBad === -1;
      A.cmpBad = A.T; A._resync(t); A._onCtl({ k: 'rsok', id: A.rsPend ? A.rsPend.m.id : -1 }, t);
      check('sb con su sbok (y rs con su rsok) borran cmpBad en el anfitrión: los dos lados juzgan igual el partido', bad && !!sb && typeof sb.t === 'number' && okSb && A.cmpBad === -1,
        { bad, sb: !!sb, t: sb && sb.t, okSb, cmpBad: A.cmpBad });
    }
    // (iv) mi punto cierra el partido y el rival se calla (sin pa): el gameOver se confirma igual tras FIN_TIMEOUT
    {
      const L = recL(), A = mkR(0, L); let t = adv(A, 16, 5000, true); const g = A.g, F = g.fl, r0 = F.r;
      const blk = S.flMatch(g); blk.score = [10, 3]; S.flMatch(g, blk); A.pre = S.flMatch(g);
      F.own = 0; S._fault(g, 1, 'out', 'Fuera', g.teams[1][0]); A._post(t, r0);
      let go = 0;
      for (let k = 0; k < 800; k++) { t += 16; const r = A.advance(t, null); for (const e of r.confirmed) if (e.type === 'gameOver') go++; }
      check('final con el rival callado: el gameOver y el último punto se confirman (sin el pa)', A.status === 'over' && !!A.result && go === 1 && !A.ptPend[r0],
        { status: A.status, result: A.result, go, pend: !!A.ptPend[r0] });
    }
    // (v) salto (WARP_MAX) con el traspaso aún por llegar: solo salta lo que WARP_MAX no absorbe hasta el traspaso y el lag llega a 0
    // en él (antes saltaba entero a 0; y antes aún volvía a subir: media velocidad)
    {
      const A = mkR(0, recL()); adv(A, 16, 3000, true);
      const now = 3000, tf = now / (1000 / 120); A.lag = 20; A.Dp = 20;
      A._lagOnTc({ kh: 6, khAt: Math.round(2 * (tf + 4)), T: Math.floor(tf) - 3, h: -1, kind: 'hit', m: {} }, now);
      const P = A.lagPlan;
      const Th = Math.round(2 * (tf + 4)) / 2, lkMax = (VA.NetFluid.C.WARP_MAX - 1) * (Th - tf);
      check('salto del reloj del balón antes del traspaso: salta solo lo que no se acelera y llega a 0 en el traspaso', A.lag > 0 && A.lag <= lkMax + 1e-9 && A.lag < 20 && !!P && P.l0 === A.lag && P.l1 === 0 && Math.abs(P.t1 - Th) < 1e-9, { lag: A.lag, plan: P });
    }
  }
  // códec de la foto: ida y vuelta
  {
    const VA = load(), cd = VA.NetFluid.codec;
    const o = { ep: 3, T: 123456, r: 17, flags: 2 | 16, seq: 999, pl: [0, 1].map(i => ({ x: 1.234 * (i + 1), y: -2.5, z: 0.75, vx: 3.21, vy: -1.5, vz: 2, jvx: 0.5, jvy: -0.25, anim: 0.3, act: 3, age: 12, shot: 1, grade: 2, bits: 9, down: 0.5, press: 7, sw: 3 })),
      ball: { x: -4.321, y: 2.2, z: 3.3, vx: -25.5, vy: 1.25, vz: -3.5, seq: 5 } };
    const buf = cd.encS(o), d = cd.decS(buf);
    const okc = d && d.T === o.T && d.r === 17 && d.seq === 999 && d.ep === 3 && Math.abs(d.pl[1].x - 2.468) < 0.001 && d.pl[0].act === 3 && Math.abs(d.ball.vx + 25.5) < 0.01 && d.ball.seq === 5 && (d.flags & 1);
    check('códec de la foto: ida y vuelta (' + buf.length + ' B)', !!okc && buf.length === 65, d && { T: d.T, x: d.pl[1].x, vx: d.ball.vx });
    check('códec: un paquete de entradas Precisa (tipo 1) no se lee como foto', cd.decS(new Uint8Array(80).fill(1)) === null);
  }
}

console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t00) / 1000).toFixed(1) + ' s)');
try { fs.mkdirSync(path.join(ROOT, 'tools/out'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'tools/out/fluid-' + OUT.mode + '.json'), JSON.stringify(OUT, null, 1)); } catch (e) { }
process.exit(fails ? 1 : 0);
