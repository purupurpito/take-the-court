#!/usr/bin/env node
/* TAKE THE COURT — tools/hosttest.js  (owner: net, P5 del sprint online-multi; notes/online-multi-brief.md §3 rec. 3 y §7)
 * Banco del modelo «host» (js/nethost.js): N máquinas en contextos vm (arnés de tools/net4test.js) sobre una estrella en memoria
 * (VB.Net.memStar, sin reenvío: cada invitado solo habla con el anfitrión), con relojes desfasados, tirones de frame y un bot por
 * plaza (VB.Net.bot). Mide, además de lo de net4test:
 *   - CPU del anfitrión por tic (p50 / p99 / máx.) y de cada invitado por frame
 *   - bytes/s por enlace y por sentido (carga útil), tamaño máximo del paquete de 30 Hz (< 1200 B)
 *   - corrección en los invitados: error de la pose pintada de los demás frente a la del anfitrión en ese tic (media / p95 / máx.),
 *     error del balón pintado frente al del anfitrión en su tic pintado, saltos del balón pintado (> 0,3 m entre frames de más de lo
 *     que se mueve), toques propios aceptados / perdidos / rechazos, rescates de puntos
 *   - marcador: los puntos confirmados (orden y marcador) iguales en las N máquinas; el partido acaba en todas
 * Uso: node tools/hosttest.js [--quick] [--n 12] [--fmt 6v6|2v2] [--secs 0 (= hasta el final)] [--points 15] [--seed 7]
 *      (código 1 si falla). Como módulo: require('./hosttest.js').run(cfg) → métricas (lo usan net12test / net4test).
 */
'use strict';
// (net4test.js puede requerir este archivo siendo él el principal: entonces su module.exports aún está vacío y pasa sus
//  funciones en cfg.H; si no, las de require('./net4test.js'))
const H0 = require('./net4test.js');
let load, mulberry, pct, check;
function useH(H) { H = H && H.load ? H : H0; ({ load, mulberry, pct, check } = H); return H; }
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

/** Plazas del partido: equipo s % 2, puesto floor(s / 2) (6v6: S, OH1, MB1, OPP, OH2, MB2). */
function seatsOf(n) { const a = []; for (let s = 0; s < n; s++) a.push({ team: s % 2, idx: s >> 1, name: 'J' + s }); return a; }

/** Un partido nethost. cfg: {n, fmt, rtt (f(k) del tramo invitado k ↔ anfitrión), jit, loss, seed, secs (0 = hasta el final), points,
 *  prof, hitch, quit: {seat, at (ms)}, stall: {seat, at, ms} (parón de la página: un frame que llega ms tarde)}. → métricas. */
function run(cfg) {
  useH(cfg.H);
  const n = cfg.n || 12, fmt = cfg.fmt || (n > 4 ? '6v6' : '2v2');
  const V = []; for (let i = 0; i < n; i++) V.push(load());
  let T = 0;
  const M = V[0].Net.memStar({ n, rtt: cfg.rtt || (k => 30 + 15 * k), jit: cfg.jit == null ? 10 : cfg.jit, loss: cfg.loss == null ? 2 : cfg.loss, seed: cfg.seed || 7, clock: () => T, relay: false });
  const seats = seatsOf(n);
  const opts = { online: true, seed: 9000 + (cfg.seed || 7), venue: 'hall', bestOf: 1, points: cfg.points || 15, format: fmt, present: true, stats: true };
  const msgs = [], log = m => { if (process.env.NETLOG) console.log('    ' + (T / 1000).toFixed(2) + ' ' + m); msgs.push(m); };
  const S = [], bots = [];
  for (let i = 0; i < n; i++) {
    const links = i === 0 ? Array.from({ length: n - 1 }, (_, k) => M.links[0][k + 1]) : [M.links[i][0]];
    S.push(new V[i].NetHost.Session({ slot: i, links, seats, names: seats.map(h => h.name), opts: i === 0 ? opts : null, name: seats[i].name, log }));
    bots.push(V[i].Net.bot(i, (cfg.seed || 7) * 13 + i, cfg.prof || 'bueno', { team: seats[i].team }));
    if (process.env.LATEDBG) S[i].lateDbg = [];
  }
  // verdad del anfitrión por tic (pelota y jugadores) para medir lo que pintan los invitados
  const truth = new Map(), host = S[0], hk = host._hostTick;
  const tickUs = [];
  host._hostTick = function (t, inp, redo) {
    const h0 = process.hrtime.bigint();
    hk.call(this, t, inp, redo);
    tickUs.push(Number(process.hrtime.bigint() - h0) / 1000);
    const g = this.g, b = g.ball, pl = {};
    for (const p of g.players) pl[p.id] = [p.x, p.y, p.z];
    truth.set(t, { b: [b.x, b.y, b.z], mode: g.mode, r: g.fl.r, pl });
    if (truth.size > 4000) truth.delete(truth.keys().next().value);
  };
  const off = []; for (let i = 0; i < n; i++) off.push(i * 123456.7 % 997331);
  const next = []; for (let i = 0; i < n; i++) next.push(i * 1.3);
  const fr = mulberry((cfg.seed || 7) * 31 + 7), END = (cfg.secs ? cfg.secs : 3600) * 1000;
  const st = []; for (let i = 0; i < n; i++) st.push({ frames: 0, cpu: [], status: {}, pts: [], over: false, pErr: [], bErr: [], ev: 0 });
  let err = null, quitDone = false, stallDone = false;
  while (!err) {
    let k = 0; for (let i = 1; i < n; i++) if (next[i] < next[k]) k = i;
    T = next[k]; if (T >= END) break;
    next[k] += 16.667 + (fr() * 2 - 1) * 1.5 + (fr() < (cfg.hitch == null ? 0.01 : cfg.hitch) ? 35 : 0);
    if (cfg.stall && !stallDone && k === cfg.stall.seat && T >= cfg.stall.at) { stallDone = true; next[k] += cfg.stall.ms; }
    if (cfg.quit && !quitDone && T >= cfg.quit.at && k === cfg.quit.seat) { quitDone = true; S[k].quit(); }
    const s = S[k], x = st[k];
    if (s.status === 'ended' && k !== 0) continue;
    const inp = s.g && (s.status === 'playing' || s.status === 'waiting') ? bots[k](s.g) : null;
    const t0 = process.hrtime.bigint();
    let r;
    try { r = s.advance(T + off[k], inp); } catch (e) { err = e; x.err = e; break; }
    const us = Number(process.hrtime.bigint() - t0) / 1000;
    x.frames++; x.status[r.status] = (x.status[r.status] || 0) + 1;
    if (r.status === 'playing') x.cpu.push(us);
    x.ev += r.events.length;
    for (const e of r.confirmed) if (e.type === 'point' && e.score) x.pts.push(e.team + ':' + e.score.join('-'));
    if (process.env.EVLOG && k === 0) for (const e of r.confirmed) if (e.type !== 'land' && e.type !== 'landPlayer' && e.type !== 'jump' && e.type !== 'swing') console.log('    ' + s.T + ' ' + e.type + (e.player ? ' p' + e.player.id + '/t' + e.player.team : '') + (e.kind ? ' ' + e.kind : '') + (e.reason ? ' ' + e.reason : '') + (e._s !== undefined ? ' plaza' + e._s : ''));
    if (r.status === 'over') x.over = true;
    // corrección pintada (invitados, en el peloteo)
    if (k > 0 && r.status === 'playing' && s.g && s.g.mode === 'rally') {
      const g = s.g, Tr = Math.round(s.T - s.Dp), tr = truth.get(Tr);
      if (tr && tr.r === g.fl.r) for (const p of g.players) {
        if (V[k].Sim.nhMine(g, p)) continue;
        const q = tr.pl[p.id]; if (!q) continue;
        x.pErr.push(Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]));
      }
      if (s.tau >= 0) {
        const tb = truth.get(Math.round(s.tau / 2));
        if (tb && tb.mode === 'rally' && tb.r === g.fl.r) x.bErr.push(Math.hypot(g.ball.x - tb.b[0], g.ball.y - tb.b[1], g.ball.z - tb.b[2]));
      }
    }
    if (!cfg.secs && S.every((q, i) => q.status === 'over' || (i > 0 && q.status === 'ended'))) break;
  }
  if (process.env.LATEDBG) for (let i = 1; i < n; i++) for (const d of S[i].lateDbg.slice(0, 6)) console.log('    tarde ' + i + ' ' + JSON.stringify(d));
  return { cfg, n, fmt, V, M, S, st, T, err, msgs, tickUs };
}

/** Resumen de un partido: métricas y comprobaciones con prefijo tag. strict: comprueba que el partido termina. */
function summary(R, tag, strict) {
  useH(R.cfg.H);
  const { S, st, n } = R, secs = R.T / 1000, host = S[0], hs = host.hstats;
  check(tag + ' sin excepciones', !R.err, R.err ? String(R.err.stack).split('\n').slice(0, 4).join(' | ') : undefined);
  if (R.err) return null;
  const live = S.filter((s, i) => i === 0 || s.status !== 'ended');
  check(tag + ' todas las máquinas llegan a jugar', st.every(x => (x.status.playing || 0) > 100), st.map(x => x.status.playing || 0).join(','));
  if (strict) check(tag + ' el partido acaba (gameOver) en todas las que siguen', live.every((s, i) => s.status === 'over'), S.map(s => s.status).join(','));
  // marcador igual: los puntos confirmados del anfitrión son la verdad; cada invitado ve los mismos en el mismo orden
  const ref = st[0].pts; let bad = 0, worstMiss = 0;
  for (let i = 1; i < n; i++) {
    if (S[i].status === 'ended') continue;
    const a = st[i].pts, m = Math.min(a.length, ref.length);
    if (a.slice(0, m).join() !== ref.slice(0, m).join()) bad++;
    worstMiss = Math.max(worstMiss, ref.length - a.length);
  }
  check(tag + ' puntos confirmados iguales en las ' + live.length + ' máquinas (' + ref.length + ' puntos)', bad === 0 && ref.length >= (strict ? 5 : 2) && worstMiss <= 1, { distintas: bad, faltanComoMucho: worstMiss });
  const tick = R.tickUs;
  const P = [].concat(...st.slice(1).map(x => x.pErr)), B = [].concat(...st.slice(1).map(x => x.bErr));
  const gs = S.slice(1).map(s => s.hstats);
  const sum = k => gs.reduce((a, h) => a + h[k], 0), mx = k => gs.reduce((a, h) => Math.max(a, h[k]), 0);
  const tr = R.M.traffic();
  let up0 = 0, pk0 = 0, dnMax = 0, upMax = 0; for (let j = 1; j < n; j++) { up0 += tr[0][j].bytes; pk0 += tr[0][j].pk; dnMax = Math.max(dnMax, tr[0][j].bytes); upMax = Math.max(upMax, tr[j][0].bytes); }
  const out = {
    points: ref.length, secs: r1(secs),
    hostTickUs: { p50: r1(pct(tick, 0.5)), p99: r1(pct(tick, 0.99)), max: r1(pct(tick, 1)) },
    hostFrameUs: { p50: r1(pct(st[0].cpu, 0.5)), p99: r1(pct(st[0].cpu, 0.99)) },
    guestFrameUs: { p50: r1(pct([].concat(...st.slice(1).map(x => x.cpu)), 0.5)), p99: r1(pct([].concat(...st.slice(1).map(x => x.cpu)), 0.99)) },
    hostUpKBs: r1(up0 / secs / 1024), hostPkS: Math.round(pk0 / secs), perLinkDownKBs: r1(dnMax / secs / 1024), perLinkUpKBs: r1(upMax / secs / 1024),
    bundleMax: hs.bundleMax, fsOut: hs.fsOut, fsKBs: r1(hs.fsBytes / secs / 1024),
    poseErr: { mean: r2(P.reduce((a, b) => a + b, 0) / (P.length || 1)), p95: r2(pct(P, 0.95)), max: r2(pct(P, 1)), n: P.length },
    ballErr: { mean: r2(B.reduce((a, b) => a + b, 0) / (B.length || 1)), p95: r2(pct(B, 0.95)), max: r2(pct(B, 1)), n: B.length },
    ballJumps: sum('bJump'), ballJumpMax: r2(mx('bJumpMax')), warpMax: r2(mx('warpMax')), lagMaxTicks: r1(mx('lagMax') / 2),
    interpMs: gs.map(h => h.interpMs),
    tc: { out: sum('tcOut'), in: hs.tcIn, ok: hs.tcOk, fork: hs.tcFork, rej: hs.tcRej, bad: hs.tcBad, lost: sum('tcLost'), echo: sum('tcEcho') },
    rescues: hs.rescues, holds: hs.holds, tossIn: hs.tossIn,
    late: { n: sum('lateC'), maxTicks: r1(mx('lateMax') / 2), kinds: gs.reduce((a, h) => { for (const k in h.lateK) a[k] = (a[k] || 0) + h.lateK[k]; return a; }, {}) }, blends: sum('blends')
  };
  console.log('        ' + tag + ' ' + out.points + ' puntos en ' + out.secs + ' s de juego · CPU anfitrión por tic p50 ' + out.hostTickUs.p50 + ' µs p99 ' + out.hostTickUs.p99 + ' µs máx ' + out.hostTickUs.max +
    ' · por frame: anfitrión p50 ' + out.hostFrameUs.p50 + ' µs p99 ' + out.hostFrameUs.p99 + ', invitado p50 ' + out.guestFrameUs.p50 + ' µs p99 ' + out.guestFrameUs.p99);
  console.log('        ' + tag + ' tráfico: subida del anfitrión ' + out.hostUpKBs + ' KB/s (' + out.hostPkS + ' pk/s) · por enlace bajada ' + out.perLinkDownKBs + ' KB/s, subida ' + out.perLinkUpKBs +
    ' KB/s · paquete de 30 Hz ' + out.bundleMax + ' B · fotos ' + out.fsOut + ' (' + out.fsKBs + ' KB/s en total)');
  console.log('        ' + tag + ' corrección: pose de los demás ' + JSON.stringify(out.poseErr) + ' m · balón pintado ' + JSON.stringify(out.ballErr) + ' m · saltos del balón ' + out.ballJumps +
    ' (máx ' + out.ballJumpMax + ' m) · reloj del balón hasta x' + out.warpMax + ', lag máx ' + out.lagMaxTicks + ' tics · colchón ' + out.interpMs.join('/') + ' ms');
  console.log('        ' + tag + ' toques de invitados: ' + JSON.stringify(out.tc) + ' · rescates ' + out.rescues + ' de ' + out.holds + ' retenidos · saques de invitado ' + out.tossIn);
  console.log('        ' + tag + ' contactos que llegan cuando el balón pintado ya pasó: ' + JSON.stringify(out.late) + ' · mezclas del balón ' + out.blends);
  check(tag + ' paquete de 30 Hz < 1200 B', out.bundleMax > 0 && out.bundleMax < 1200, { bytes: out.bundleMax });
  check(tag + ' los invitados tocan y el anfitrión acepta (≥ 80 % de sus toques)', out.tc.out > 10 && out.tc.ok >= 0.8 * out.tc.out, out.tc);
  return out;
}

function main() {
  const argv = process.argv, arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
  const QUICK = argv.includes('--quick'), N = +arg('--n', 12), FMT = arg('--fmt', N > 4 ? '6v6' : '2v2');
  const SECS = +arg('--secs', 0), PTS = +arg('--points', QUICK ? 11 : 15), SEED = +arg('--seed', 7);
  const t0 = Date.now();
  console.log('== (a) partido ' + FMT + ' entero, ' + N + ' humanos, estrella 30-200 ms de RTT, ±10 ms, 2 % de pérdida ==');
  const R = run({ n: N, fmt: FMT, rtt: k => 30 + (170 * (k - 1)) / Math.max(1, N - 2), jit: 10, loss: 2, seed: SEED, secs: SECS, points: PTS });
  summary(R, FMT + ':', !SECS);
  if (!QUICK) {
    console.log('== (b) un invitado se va a mitad de partido: su plaza la lleva la IA y el partido sigue ==');
    const R2 = run({ n: N, fmt: FMT, rtt: k => 60, jit: 8, loss: 2, seed: SEED + 1, secs: 120, points: 25, quit: { seat: 3, at: 40000 } });
    if (!R2.err) {
      const g = R2.S[0].g;
      check('la plaza 3 pasa a la IA en el anfitrión', !!(g.hum[3].ai && R2.S[0].seatGone(3)), { ai: g.hum[3].ai });
      check('los demás invitados se enteran (seatGone)', R2.S.slice(1).every((s, i) => i + 1 === 3 || s.seatGone(3)));
    }
    summary(R2, 'abandono:', false);
    console.log('== (c) la página del anfitrión se para 600 ms a mitad de partido: los invitados siguen en su reloj (sin desfase) ==');
    const R3 = run({ n: N, fmt: FMT, rtt: k => 60, jit: 8, loss: 2, seed: SEED + 2, secs: 90, points: 25, stall: { seat: 0, at: 30000, ms: 600 } });
    if (!R3.err) {
      const hs3 = R3.S[0].hstats;
      check('el anfitrión salta T tras el parón (sin mover t0)', (hs3.skips | 0) >= 1, { skips: hs3.skips | 0 });
      check('tras el parón casi ningún toque llega fuera de tiempo (tcBad ≤ 5 %)', hs3.tcBad <= Math.max(2, 0.05 * hs3.tcIn), { bad: hs3.tcBad, in: hs3.tcIn });
    }
    summary(R3, 'parón:', false);
  }
  const { fails, oks } = H0.counts();
  console.log((fails ? 'FALLO: ' + fails + ' de ' + (fails + oks) : 'hosttest OK: ' + oks + ' comprobaciones') + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  return fails ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { run, summary, seatsOf };
