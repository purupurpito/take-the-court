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
function seatsOf(n, swap) { const a = []; for (let s = 0; s < n; s++) a.push({ team: (s + (swap ? 1 : 0)) % 2, idx: s >> 1, name: 'J' + s }); return a; }

/** Un partido nethost. cfg: {n, fmt, rtt (f(k) del tramo invitado k ↔ anfitrión), jit, loss, seed, secs (0 = hasta el final), points,
 *  prof, hitch, quit: {seat, at (ms)}, stall: {seat, at, ms} (parón de la página: un frame que llega ms tarde)}. → métricas. */
function run(cfg) {
  useH(cfg.H);
  const n = cfg.n || 12, fmt = cfg.fmt || (n > 4 ? '6v6' : '2v2');
  const V = []; for (let i = 0; i < n; i++) V.push(load());
  if (cfg.C) for (const v of V) Object.assign(v.NetHost.C, cfg.C);   // (ajuste de constantes de nethost para probar)
  let T = 0;
  const M = V[0].Net.memStar({ n, rtt: cfg.rtt || (k => 30 + 15 * k), jit: cfg.jit == null ? 10 : cfg.jit, loss: cfg.loss == null ? 2 : cfg.loss, seed: cfg.seed || 7, clock: () => T, relay: false });
  const seats = seatsOf(n, cfg.swap);   // (swap: el anfitrión en el equipo 1)
  const opts = { online: true, seed: 9000 + (cfg.seed || 7), venue: 'hall', bestOf: 1, points: cfg.points || 15, format: fmt, present: true, stats: true };
  const msgs = [], log = m => { if (process.env.NETLOG) console.log('    ' + (T / 1000).toFixed(2) + ' ' + m); msgs.push(m); };
  const S = [], bots = [];
  for (let i = 0; i < n; i++) {
    const links = i === 0 ? Array.from({ length: n - 1 }, (_, k) => M.links[0][k + 1]) : [M.links[i][0]];
    S.push(new V[i].NetHost.Session({ slot: i, links, seats, names: seats.map(h => h.name), opts: i === 0 ? opts : null, name: seats[i].name, log }));
    bots.push(V[i].Net.bot(i, (cfg.seed || 7) * 13 + i, cfg.prof || 'bueno', { team: seats[i].team }));
    if (process.env.LATEDBG) S[i].lateDbg = [];
    if (process.env.CAPDBG) S[i].capDbg = [];
    if (process.env.RAWDBG) S[i].rawDbg = [];
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
  // L1: continuidad de lo PINTADO en cada máquina (anfitrión incluido), medida desde fuera de nethost: en el peloteo, cuánto se
  // aparta el balón pintado (y el jugador propio de cada invitado) de seguir con su velocidad de antes o con la de ahora en ese frame.
  // Es la «corrección» que se ve: un salto > 0,5 m es un teletransporte; p99 bajo = el balón vuela liso.
  const G = 9.81;
  function dev(P, q, dt) {
    const a = Math.hypot(q.x - (P.x + P.vx * dt), q.y - (P.y + P.vy * dt), q.z - (P.z + P.vz * dt - 0.5 * G * dt * dt));
    const b = Math.hypot(q.x - (P.x + q.vx * dt), q.y - (P.y + q.vy * dt), q.z - (P.z + q.vz * dt));
    return Math.min(a, b);
  }
  function jumpDbg(k, s, x, d, Tn) {
    const h = s.hstats, o = x.dbg || {}, c = s.chain && s.chain.length ? s.chain[s.chain.length - 1] : null;
    console.log('    salto ' + k + ' ' + d.toFixed(2) + ' m T' + s.T + ' late+' + (h.lateC - o.lateC) + ' fs+' + (h.fsIn - o.fsIn) + ' lost+' + (h.tcLost - o.tcLost) + ' resc+' + (h.rescues - o.rescues) +
      ' ch ' + o.ch + '→' + (s.chain ? s.chain.length : 0) + ' lastHs ' + o.last + '→' + (c ? c.hs : -1) + (c ? (c.mine ? ' mío' : '') : '') + ' tau ' + (s.tau / 2).toFixed(1) + ' toMe ' + s.toMe + ' Dp ' + (s.Dp || 0).toFixed(1) + ' r ' + (s._rate || 1).toFixed(2) + ' off ' + Math.hypot(s.bOff.x, s.bOff.y, s.bOff.z).toFixed(2) + ' dtF ' + (Tn - x.bPrev.T).toFixed(0) + ' v ' + Math.hypot(s.g.ball.vx, s.g.ball.vy, s.g.ball.vz).toFixed(1) +
      (s.lateDbg && s.lateDbg.length ? ' ult ' + JSON.stringify(s.lateDbg[s.lateDbg.length - 1]) : ''));
  }
  function contin(k, s, x, Tn) {
    const g = s.g; if (!g) return;
    const b = g.ball, live = (s.status === 'playing' || s.status === 'over') && g.mode === 'rally' && !b.held;
    const pb = x.bPrev, r = g.fl ? g.fl.r : -1;
    if (live && pb && pb.r === r && Tn - pb.T < 80) { const d = dev(pb, b, (Tn - pb.T) / 1000); x.bC.push(d); if (d > 0.5) { x.bBig.push(Math.round(d * 100) / 100); if (process.env.JUMPDBG) jumpDbg(k, s, x, d, Tn); } }
    if (process.env.JUMPDBG) { const h = s.hstats; x.dbg = { lateC: h.lateC, fsIn: h.fsIn, tcLost: h.tcLost, blends: h.blends, rescues: h.rescues, ch: s.chain ? s.chain.length : 0, last: s.chain && s.chain.length ? s.chain[s.chain.length - 1].hs : -1 }; }
    x.bPrev = live ? { T: Tn, r, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz } : null;
    if (k === 0) return;
    // lag del balón pintado cuando toco yo (tics): lo que va por detrás de lo que de verdad golpeo (0 = lo veo donde está)
    const to = s.hstats.tcOut; if (to > (x.tcO | 0)) { x.myLag.push(s.tau >= 0 && s.lastTf >= 0 ? Math.max(0, s.lastTf - s.tau) / 2 : 0); } x.tcO = to;
    const h = g.hum[s.seat], p = h && h.p, ok = p && !h.ai && live && V[k].Sim.nhMine(g, p), po = x.oPrev;
    if (ok && po && po.r === r && po.id === p.id && Tn - po.T < 80) { const d = dev(po, p, (Tn - po.T) / 1000); x.oC.push(d); }
    x.oPrev = ok ? { T: Tn, r, id: p.id, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz } : null;
  }
  const off = []; for (let i = 0; i < n; i++) off.push(i * 123456.7 % 997331);
  const next = []; for (let i = 0; i < n; i++) next.push(i * 1.3);
  const fr = mulberry((cfg.seed || 7) * 31 + 7), END = (cfg.secs ? cfg.secs : 3600) * 1000;
  const st = []; for (let i = 0; i < n; i++) st.push({ frames: 0, cpu: [], status: {}, pts: [], over: false, pErr: [], bErr: [], ev: 0, bC: [], bBig: [], oC: [], myLag: [], bPrev: null, oPrev: null });
  let err = null, quitDone = false, stallDone = false;
  const R0 = { gr: {} };
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
    if (k === 0) for (const e of r.confirmed) if (e.type === 'hit' && e.player) {   // (calidad de los toques por equipo y si era de un invitado)
      const q = R0.gr[e.player.team] || (R0.gr[e.player.team] = {}), key = (e._s > 0 ? 'inv-' : 'anf-') + (e.kind || '') + ':' + (e.grade || e.player.grade || '?');
      q[key] = (q[key] || 0) + 1;
    }
    if (process.env.EVLOG && k === 0) for (const e of r.confirmed) if (e.type !== 'land' && e.type !== 'landPlayer' && e.type !== 'jump' && e.type !== 'swing') console.log('    ' + s.T + ' ' + e.type + (e.player ? ' p' + e.player.id + '/t' + e.player.team : '') + (e.kind ? ' ' + e.kind : '') + (e.reason ? ' ' + e.reason : '') + (e._s !== undefined ? ' plaza' + e._s : ''));
    if (r.status === 'over') x.over = true;
    contin(k, s, x, T);
    // corrección pintada (invitados, en el peloteo)
    if (k > 0 && r.status === 'playing' && s.g && s.g.mode === 'rally') {
      const g = s.g, Tr = Math.round(s.T - s.Dp), tr = truth.get(Tr);
      if (tr && tr.r === g.fl.r) for (const p of g.players) {
        if (V[k].Sim.nhMine(g, p)) continue;
        if (s.pDel && s.pDel[p.id] > 0.5) { x.pDel = (x.pDel | 0) + 1; continue; }   // (L1: el que va a tocar va con el reloj del balón: aparte)
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
  if (process.env.RAWDBG) for (let i = 0; i < n; i++) for (const d of S[i].rawDbg.slice(0, +process.env.RAWDBG)) console.log('    salto crudo ' + i + ' ' + JSON.stringify(d));
  if (process.env.CAPDBG) for (let i = 0; i < n; i++) for (const d of S[i].capDbg.slice(0, +process.env.CAPDBG)) console.log('    sin margen ' + i + ' ' + d);
  if (process.env.LATEDBG) {
    for (let i = 1; i < n; i++) for (const d of S[i].lateDbg.slice(0, +process.env.LATEDBG || 6)) console.log('    tarde ' + i + ' ' + JSON.stringify(d));
    const cat = {};   // (por tipo: viene a mí y toca un compañero / un rival; no viene a mí y el que toca iba (candidato) / no iba)
    for (let i = 0; i < n; i++) for (const d of S[i].lateDbg) {
      const c = (i === 0 ? 'anf ' : '') + (d.toMe ? 'aMi(' + d.why + ')-' + (d.mate ? 'compa' : 'rival') : d.voy ? 'iba' : 'noIba') + '-' + d.kind + (d.src >= 0 ? '-humano' : '-anf');
      const o = cat[c] || (cat[c] = { n: 0, lt: 0, big: 0 }); o.n++; o.lt += d.lt / 2; if (d.lt > 6) o.big++;
    }
    for (const c in cat) cat[c].lt = Math.round(cat[c].lt / cat[c].n * 10) / 10;
    console.log('    tardes por tipo (n, tics de media, > 3 tics): ' + JSON.stringify(cat));
  }
  if (process.env.GRADES) console.log('    calidad de los toques por equipo: ' + JSON.stringify(R0.gr));
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
  if (ref.length) console.log('        ' + tag + ' marcador: ' + ref[ref.length - 1] + ' · puntos por equipo ' + [0, 1].map(t => ref.filter(p => p[0] === String(t)).length).join('-'));
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
    rawJumps: sum('rawJ'), rawJumpMax: r2(mx('rawJMax')), rawRally: sum('rawJR'), rawRallyMax: r2(mx('rawJRMax')),
    rawK: gs.reduce((a, h) => { for (const k in (h.rawK || {})) a[k] = (a[k] || 0) + h.rawK[k]; return a; }, {}), capMiss: sum('capMiss'), warpMin: r2(gs.reduce((a, h) => Math.min(a, h.warpMin === undefined ? 9 : h.warpMin), 9)),
    hostRaw: { n: hs.rawJ | 0, max: r2(hs.rawJMax || 0), lagMaxTicks: r1((hs.lagMax || 0) / 2) },
    late: { n: sum('lateC'), maxTicks: r1(mx('lateMax') / 2), kinds: gs.reduce((a, h) => { for (const k in h.lateK) a[k] = (a[k] || 0) + h.lateK[k]; return a; }, {}) }, blends: sum('blends')
  };
  // L1: continuidad pintada (ver contin en run): invitados, anfitrión y jugador propio de los invitados
  const gC = [].concat(...st.slice(1).map(x => x.bC)), oC = [].concat(...st.slice(1).map(x => x.oC));
  out.paint = {
    guest: { p99: r2(pct(gC, 0.99)), max: r2(pct(gC, 1)), big: st.slice(1).reduce((a, x) => a + x.bBig.length, 0), worstPeer: Math.max(...st.slice(1).map(x => x.bBig.length)), n: gC.length },
    host: { p99: r2(pct(st[0].bC, 0.99)), max: r2(pct(st[0].bC, 1)), big: st[0].bBig.length, n: st[0].bC.length },
    own: { p99: r2(pct(oC, 0.99)), max: r2(pct(oC, 1)), big: oC.filter(d => d > 0.5).length, n: oC.length }
  };
  const ML = [].concat(...st.slice(1).map(x => x.myLag));
  out.myLag = { mean: r1(ML.reduce((a, b) => a + b, 0) / (ML.length || 1)), p90: r1(pct(ML, 0.9)), max: r1(pct(ML, 1)), n: ML.length };
  out.rallyS = r1(secs / Math.max(1, out.points));
  out.byTeam = [0, 1].map(t => { const L = [].concat(...st.filter((x, i) => i > 0 && i % 2 === t).map(x => x.myLag)); return { touches: L.length, lagMean: r1(L.reduce((a, b) => a + b, 0) / (L.length || 1)), lagP90: r1(pct(L, 0.9)) }; });
  console.log('        ' + tag + ' ' + out.points + ' puntos en ' + out.secs + ' s de juego · CPU anfitrión por tic p50 ' + out.hostTickUs.p50 + ' µs p99 ' + out.hostTickUs.p99 + ' µs máx ' + out.hostTickUs.max +
    ' · por frame: anfitrión p50 ' + out.hostFrameUs.p50 + ' µs p99 ' + out.hostFrameUs.p99 + ', invitado p50 ' + out.guestFrameUs.p50 + ' µs p99 ' + out.guestFrameUs.p99);
  console.log('        ' + tag + ' tráfico: subida del anfitrión ' + out.hostUpKBs + ' KB/s (' + out.hostPkS + ' pk/s) · por enlace bajada ' + out.perLinkDownKBs + ' KB/s, subida ' + out.perLinkUpKBs +
    ' KB/s · paquete de 30 Hz ' + out.bundleMax + ' B · fotos ' + out.fsOut + ' (' + out.fsKBs + ' KB/s en total)');
  console.log('        ' + tag + ' corrección: pose de los demás ' + JSON.stringify(out.poseErr) + ' m · balón pintado ' + JSON.stringify(out.ballErr) + ' m · saltos del balón ' + out.ballJumps +
    ' (máx ' + out.ballJumpMax + ' m) · reloj del balón hasta x' + out.warpMax + ', lag máx ' + out.lagMaxTicks + ' tics · colchón ' + out.interpMs.join('/') + ' ms');
  console.log('        ' + tag + ' toques de invitados: ' + JSON.stringify(out.tc) + ' · rescates ' + out.rescues + ' de ' + out.holds + ' retenidos · saques de invitado ' + out.tossIn);
  console.log('        ' + tag + ' contactos que llegan cuando el balón pintado ya pasó: ' + JSON.stringify(out.late) + ' · mezclas del balón ' + out.blends + ' · saltos antes de mezclar ' + out.rawJumps + ' (máx ' + out.rawJumpMax + ' m; en el peloteo ' + out.rawRally + ', máx ' + out.rawRallyMax + ' m; ' + JSON.stringify(out.rawK) + ') · sin margen ' + out.capMiss + ' · reloj desde x' + out.warpMin + ' · anfitrión ' + JSON.stringify(out.hostRaw));
  console.log('        ' + tag + ' continuidad pintada (m por frame; saltos > 0,5 m): invitados ' + JSON.stringify(out.paint.guest) + ' · anfitrión ' + JSON.stringify(out.paint.host) + ' · jugador propio ' + JSON.stringify(out.paint.own));
  console.log('        ' + tag + ' balón pintado cuando toca un invitado (tics por detrás): ' + JSON.stringify(out.myLag) + ' · s por punto ' + out.rallyS + ' · toques de invitado por punto ' + r1(out.tc.ok / Math.max(1, out.points)) + ' · por equipo ' + JSON.stringify(out.byTeam));
  check(tag + ' paquete de 30 Hz < 1200 B', out.bundleMax > 0 && out.bundleMax < 1200, { bytes: out.bundleMax });
  check(tag + ' los invitados tocan y el anfitrión acepta (≥ 80 % de sus toques)', out.tc.out > 10 && out.tc.ok >= 0.8 * out.tc.out, out.tc);
  if (R.cfg.paintCheck) {   // L1: el balón pintado sin teletransportes en ninguna máquina
    check(tag + ' balón pintado continuo: ningún salto > 0,5 m en los invitados ni en el anfitrión', out.paint.guest.big === 0 && out.paint.host.big === 0, { invitados: out.paint.guest, anfitrion: out.paint.host });
    check(tag + ' corrección por frame p99 < 0,25 m (invitados y anfitrión)', out.paint.guest.p99 < 0.25 && out.paint.host.p99 < 0.25, { invitados: out.paint.guest.p99, anfitrion: out.paint.host.p99 });
    check(tag + ' el jugador propio nunca se corrige de golpe (> 0,5 m)', out.paint.own.big === 0, out.paint.own);
  }
  return out;
}

function main() {
  const argv = process.argv, arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
  const QUICK = argv.includes('--quick'), N = +arg('--n', 12), FMT = arg('--fmt', N > 4 ? '6v6' : '2v2');
  const SECS = +arg('--secs', 0), PTS = +arg('--points', QUICK ? 11 : 15), SEED = +arg('--seed', 7);
  const t0 = Date.now();
  console.log('== (a) partido ' + FMT + ' entero, ' + N + ' humanos, estrella 30-200 ms de RTT, ±10 ms, 2 % de pérdida ==');
  const R = run({ n: N, fmt: FMT, rtt: k => 30 + (170 * (k - 1)) / Math.max(1, N - 2), jit: 10, loss: 2, seed: SEED, secs: SECS, points: PTS, paintCheck: true });
  summary(R, FMT + ':', !SECS);
  if (FMT === '6v6' && N === 12) {
    // L1 (sprint online-multi): el escenario objetivo del balón continuo: 11 invitados a 80-150 ms, ±15 ms, 2 % de pérdida
    console.log('== (d) L1: 6v6 con 11 invitados a 80-150 ms, ±15 ms, 2 % de pérdida: balón pintado continuo en todas ==');
    const R4 = run({ n: N, fmt: FMT, rtt: k => 80 + 70 * (k - 1) / 10, jit: 15, loss: 2, seed: SEED + 4, secs: QUICK ? 150 : SECS, points: PTS, paintCheck: true });
    summary(R4, 'L1:', !QUICK && !SECS);
  }
  if (!QUICK) {
    console.log('== (b) un invitado se va a mitad de partido: su plaza la lleva la IA y el partido sigue ==');
    // (L1: 200 s y no 120: con 12 bots los peloteos de 6v6 duran 20-30 s y en 120 s a veces solo cae 1 punto, con este código y el de antes)
    const R2 = run({ n: N, fmt: FMT, rtt: k => 60, jit: 8, loss: 2, seed: SEED + 1, secs: 200, points: 25, quit: { seat: 3, at: 40000 } });
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
    console.log('== (e) un invitado calla más que GONE (app en segundo plano) y vuelve: el anfitrión lo readmite y no acaba en «hostGone» ==');
    // (2v2 de 4 como en el móvil: GONE se acorta a 8 s para no esperar 60; el invitado repite su 'hello' al no oír al anfitrión)
    const R5 = run({ n: 4, fmt: '2v2', rtt: k => 120, jit: 10, loss: 2, seed: SEED + 4, secs: 70, points: 25, C: { GONE: 8000 }, stall: { seat: 3, at: 20000, ms: 9500 } });
    if (!R5.err) {
      const h5 = R5.S[0], p5 = h5.peers.find(p => p.seat === 3), g5 = R5.S[3];
      check('el anfitrión lo dio por ido y lo readmite (foto, «back»)', R5.msgs.some(m => /plaza 3 se va/.test(m)) && R5.msgs.some(m => /plaza 3 vuelve/.test(m)) && p5 && !p5.gone && !h5.seatGone(3),
        R5.msgs.filter(m => /plaza 3/.test(m)));
      check('su plaza vuelve a ser humana y el invitado sigue jugando (sin «hostGone»)', !h5.g.hum[3].ai && g5.status === 'playing' && !g5.result && R5.S.slice(1, 3).every(s => !s.seatGone(3)),
        { ai: h5.g.hum[3].ai, st: g5.status, res: g5.result });
    }
  }
  const { fails, oks } = H0.counts();
  console.log((fails ? 'FALLO: ' + fails + ' de ' + (fails + oks) : 'hosttest OK: ' + oks + ' comprobaciones') + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  return fails ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { run, summary, seatsOf };
