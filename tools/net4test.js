#!/usr/bin/env node
/* TAKE THE COURT — tools/net4test.js  (owner: net, P0 del sprint online-multi; notes/online-multi-brief.md §7)
 * Banco de pruebas en Node para el online a N PARES (2v2 con hasta 4 humanos). N contextos vm (sim.js + ai.js + ai6.js + net.js +
 * netfluid.js + nettest-links.js, cada uno con su Math), unidos por VB.Net.memMesh (malla) o VB.Net.memStar (estrella por el
 * anfitrión), con relojes desfasados por máquina, frames con tirones y el siguiente frame del par que va más atrás (k = argmin next).
 * Mientras no exista el modelo de plazas (P1) ni Precisa-N (P2), los partidos solo usan el camino de 2 huecos; el resto de
 * máquinas hacen de SONDA (mandan paquetes del tamaño de una entrada a todos y miden latencia, pérdida y orden).
 *   (a) memMesh con n = 2 = memPair: el mismo partido Precisa (semilla, red y bots) da las mismas huellas, el mismo final y el mismo tráfico
 *   (b) capa de enlaces con N máquinas (malla y estrella con reenvío): latencia de ida medida ≈ rttOf/2 por par dirigido (invitado↔invitado
 *       en estrella = suma de los dos tramos), pérdida ≈ la pedida en 'in', 'ctl' sin pérdidas y en orden, tráfico por par
 *   (c) partido con adaptador ('precisa2' / 'fluida2'): 2 sesiones sobre los enlaces 0↔1 de la topología de N y el resto de sonda;
 *       métricas por par: frames esperando, % inestable, histograma de profundidad de rollback, CPU por advance p50/p99, tráfico por
 *       par dirigido, huellas de gc iguales entre los N que juegan y PRUEBA DE ORO (offline con las entradas grabadas = gc del anfitrión)
 * AMPLIAR (P2/P5): ADAPTERS[nombre] = {peers(cfg) → cuántas máquinas juegan, make(V, i, M, cfg, log) → sesión con
 *   advance(now, entrada) → {status, events, confirmed, unstable}, gameOf(s) → partida para el bot, slotOf(i) → hueco del bot,
 *   hashLog? (sesión con o.hashLog), rec? (entradas confirmadas, 3 valores por hueco)}. El bot ya es por hueco (VB.Net.bot(slot…)).
 * Uso: node tools/net4test.js [--quick] [--n 4] [--topo mesh|star|both] [--model precisa2|fluida2] [--secs 60]   (código 1 si falla)
 * Como módulo: require('./net4test.js') → {load, makeTopo, probe, runMatch, golden, report, ADAPTERS} (lo usa tools/net12test.js).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/net.js', 'js/netfluid.js', 'js/nettest-links.js'].map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
const STEP = 1 / 120;

/** Una máquina: su contexto vm con su Math (el ruido o los redondeos de una no tocan a las otras). */
function load() {
  const ctx = { console, TextEncoder, TextDecoder };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.VB = { VERSION: 'test' };
  for (const [f, s] of SRC) vm.runInContext(s, ctx, { filename: f });
  return ctx.VB;
}
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pct = (a, q) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * q))]; };
const r1 = v => Math.round(v * 10) / 10;

let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
}

/** Topología de prueba en el contexto de la máquina 0. cfg: {n, topo:'mesh'|'star'|'pair', rtt (núm. o f(i,j)), jit, loss, seed, relay} */
function makeTopo(V0, cfg, clock) {
  const o = { n: cfg.n, rtt: cfg.rtt, jit: cfg.jit, loss: cfg.loss, seed: cfg.seed, clock, relay: cfg.relay };
  if (cfg.topo === 'pair') { const [a, b] = V0.Net.memPair({ lag: cfg.rtt, jit: cfg.jit, loss: cfg.loss, seed: cfg.seed, clock }); return { n: 2, links: [[null, a], [b, null]], traffic: null, rttOf: () => cfg.rtt }; }
  return cfg.topo === 'star' ? V0.Net.memStar(o) : V0.Net.memMesh(o);
}

/* ---------- Sonda: paquetes del tamaño de una entrada por 'in' y un JSON pequeño por 'ctl' de cada máquina a cada otra ---------- */
function Probe(i, M, o) {
  this.i = i; this.M = M; this.seq = 0; this.ctlSeq = 0; this.size = o.size || 31; this.ctlEvery = o.ctlEvery || 100; this.lastCtl = -1e9;
  this.to = o.to || null;   // máquinas a las que manda (por defecto, todas las que tienen enlace)
  this.every = Math.max(1, o.every | 0); this.fr = 0; this.sent = 0;   // manda 'in' uno de cada every frames (30 Hz con every 2)
  this.lat = {}; this.got = {}; this.ctlGot = {}; this.ctlBad = {}; this.ctlLast = {};
}
Probe.prototype.frame = function (T, quiet) {   // (quiet: solo lee; al final, para que lo que va en vuelo no cuente como perdido)
  const row = this.M.links[this.i];
  for (let j = 0; j < row.length; j++) {
    const l = row[j]; if (!l) continue;
    for (const m of l.poll(T)) {
      if (m.ch === 'in') {
        if (!(m.data && m.data.length >= 13)) continue;
        const dv = new DataView(m.data.buffer, m.data.byteOffset, m.data.byteLength);
        const from = dv.getUint8(0), at = dv.getFloat64(5, true), k = from + '>' + this.i;
        (this.lat[k] = this.lat[k] || []).push(T - at); this.got[k] = (this.got[k] || 0) + 1;
      } else {
        let d; try { d = JSON.parse(m.data); } catch (e) { continue; }
        if (!d || d.k !== 'probe') continue;   // (de una sesión que comparte el enlace: no es para la sonda)
        const k = d.f + '>' + this.i;
        this.ctlGot[k] = (this.ctlGot[k] || 0) + 1;
        if (this.ctlLast[k] !== undefined && d.s !== this.ctlLast[k] + 1) this.ctlBad[k] = (this.ctlBad[k] || 0) + 1;
        this.ctlLast[k] = d.s;
      }
    }
    if (quiet || (this.to && this.to.indexOf(j) < 0) || this.fr % this.every) continue;
    const b = new Uint8Array(Math.max(13, this.size)), dv = new DataView(b.buffer);
    dv.setUint8(0, this.i); dv.setUint32(1, this.seq, true); dv.setFloat64(5, T, true);
    l.send('in', b); this.sent++;
    if (T - this.lastCtl >= this.ctlEvery) l.send('ctl', JSON.stringify({ k: 'probe', f: this.i, s: this.ctlSeq }));
  }
  if (quiet) return;
  if (this.fr++ % this.every) return;
  this.seq++;
  if (T - this.lastCtl >= this.ctlEvery) { this.lastCtl = T; this.ctlSeq++; }
};

/** Prueba de la capa de enlaces: N máquinas de sonda durante secs. Devuelve por par dirigido {lat media, p99, esperada, pérdida, ctl}. */
function probe(cfg) {
  const V0 = load(); let T = 0;
  const M = makeTopo(V0, cfg, () => T), n = M.n;
  const P = []; for (let i = 0; i < n; i++) P.push(new Probe(i, M, cfg.role ? cfg.role(i, M) : { size: cfg.size, ctlEvery: cfg.ctlEvery }));   // (cfg.role(i): {size, every, to} por máquina)
  const next = []; for (let i = 0; i < n; i++) next.push(i * 1.37);
  const fr = mulberry(cfg.seed * 31 + 7), END = (cfg.secs || 20) * 1000;
  while (true) {
    let k = 0; for (let i = 1; i < n; i++) if (next[i] < next[k]) k = i;
    T = next[k]; if (T >= END) break;
    next[k] += 16.667 + (fr() * 2 - 1) * 1.5;
    P[k].frame(T, T >= END - 500);
  }
  const out = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j || !M.links[i][j]) continue;
    const k = i + '>' + j, L = P[j].lat[k] || [], sent = P[i].seq;
    out.push({ k, hops: M.links[i][j].hops, exp: M.rttOf(i, j) / 2 + 16.667 / 2,   // (+ medio frame: se lee una vez por frame)
      avg: L.reduce((a, b) => a + b, 0) / (L.length || 1), p99: pct(L, 0.99),
      loss: 100 * (1 - (P[j].got[k] || 0) / Math.max(1, sent)), sent, ctl: P[j].ctlGot[k] || 0, ctlSent: P[i].ctlSeq, ctlBad: P[j].ctlBad[k] || 0 });
  }
  return { pairs: out, traffic: M.traffic(), T, n };
}

/* ---------- Adaptadores de partido (cómo juega cada máquina que juega) ---------- */
const ADAPTERS = {
  /** Precisa de siempre (rollback, 2 huecos): máquinas 0 (anfitrión, hueco 0) y 1 (invitado, hueco 1) por su enlace directo. */
  precisa2: {
    peers: () => 2,
    make(V, i, M, cfg, log) {
      const opts = cfg.opts;
      return new V.Net.Session({ slot: i, link: M.links[i][1 - i], opts: i === 0 ? opts : null, name: i ? 'Invitado' : 'Anfitrión', record: i === 0, hashLog: [], log });
    },
    gameOf: s => s.gp, slotOf: i => i, hashLog: s => s.hashLog, rec: s => s.rec, confirmed: s => s.gc
  },
  /** Fluida de siempre (propiedad por equipo, 2 huecos). */
  fluida2: {
    peers: () => 2,
    make(V, i, M, cfg, log) {
      const opts = Object.assign({}, cfg.opts, { net: 'fluida' });
      return new V.NetFluid.Session({ slot: i, link: M.links[i][1 - i], opts: i === 0 ? opts : null, name: i ? 'Invitado' : 'Anfitrión', log,
        expect: i ? { even: false, bestOf: opts.bestOf, points: opts.points, venue: opts.venue, net: 'fluida' } : undefined });
    },
    gameOf: s => s.g, slotOf: i => i, hashLog: null, rec: null, confirmed: s => s.g
  }
};

/** Un partido de N máquinas. cfg: {n, topo, rtt, jit, loss, seed, secs, model, opts, prof, offs, hitch}.
 *  Las máquinas 0..peers-1 juegan con el adaptador; las demás hacen de sonda (a todas). */
function runMatch(cfg) {
  const AD = ADAPTERS[cfg.model || 'precisa2'], np = AD.peers(cfg);
  const n = Math.max(np, cfg.n || np);
  const V = []; for (let i = 0; i < n; i++) V.push(load());
  let T = 0;
  const M = makeTopo(V[0], Object.assign({}, cfg, { n }), () => T);
  const msgs = [], log = m => { if (process.env.NETLOG) console.log('    ' + (T / 1000).toFixed(2) + ' ' + m); msgs.push(m); };
  cfg.opts = cfg.opts || { online: true, seed: 5000 + cfg.seed, venue: cfg.venue || 'hall', bestOf: 1, points: 21, humans: [{}, {}], present: true, stats: true };
  const S = [], bots = [], P = [];
  for (let i = 0; i < n; i++) {
    if (i < np) { S.push(AD.make(V[i], i, M, cfg, log)); bots.push(V[i].Net.bot(AD.slotOf(i), cfg.seed + i, cfg.prof || 'bueno')); P.push(null); }
    else { S.push(null); bots.push(null); P.push(new Probe(i, M, { size: cfg.probeSize, to: Array.from({ length: n }, (_, j) => j).filter(j => j >= np && j !== i) })); }   // (a las demás sondas: las sesiones no leen sus enlaces)
  }
  // relojes de cada máquina (performance.now de cada página) y siguiente frame
  const off = []; for (let i = 0; i < n; i++) off.push(cfg.offs ? cfg.offs[i] : i * 123456.7 % 997331);
  const next = []; for (let i = 0; i < n; i++) next.push(i * 3.3);
  const fr = mulberry(cfg.seed * 31 + 7), END = (cfg.secs || 60) * 1000;
  const st = [];
  for (let i = 0; i < n; i++) st.push({ frames: 0, wait: 0, unstable: 0, depth: {}, cpu: [], events: 0, conf: 0, status: {}, err: null, pts: [] });
  let err = null;
  while (!err) {
    let k = 0; for (let i = 1; i < n; i++) if (next[i] < next[k]) k = i;
    T = next[k]; if (T >= END) break;
    next[k] += 16.667 + (fr() * 2 - 1) * 1.5 + (fr() < (cfg.hitch == null ? 0.01 : cfg.hitch) ? 35 : 0);
    if (P[k]) { P[k].frame(T); continue; }
    const s = S[k], g = AD.gameOf(s), x = st[k];
    const inp = g ? bots[k](g) : null;
    const t0 = process.hrtime.bigint();
    let r;
    try { r = s.advance(T + off[k], inp); } catch (e) { x.err = err = e; break; }
    const us = Number(process.hrtime.bigint() - t0) / 1000;
    x.frames++; x.status[r.status] = (x.status[r.status] || 0) + 1;
    if (r.status === 'playing' || r.status === 'waiting') x.cpu.push(us);
    if (r.status === 'waiting') x.wait++;
    if (r.unstable) x.unstable++;
    if (s.stats && typeof s.stats.depth === 'number') x.depth[s.stats.depth] = (x.depth[s.stats.depth] || 0) + 1;
    x.events += r.events ? r.events.length : 0; x.conf += r.confirmed ? r.confirmed.length : 0;
    if (r.confirmed) for (const e of r.confirmed) if (e.type === 'point' && e.score) x.pts.push(e.team + ':' + e.score.join('-'));   // (marcador confirmado, para comparar entre máquinas)
    if (S.slice(0, np).every(q => q.status === 'over')) break;
  }
  return { cfg, AD, V, M, S, P, st, np, n, T, err, msgs };
}

/** Huellas de gc de todas las máquinas que juegan, en los tics comunes: {n, bad, firstBad} (sin hashLog: null). */
function cmpHashes(R) {
  if (!R.AD.hashLog) return null;
  const logs = R.S.slice(0, R.np).map(s => { const m = {}; for (const [t, h] of R.AD.hashLog(s)) m[t] = h; return m; });
  let n = 0, bad = 0, firstBad = -1;
  for (const t in logs[0]) {
    if (!logs.every(l => l[t] !== undefined)) continue;
    n++; if (!logs.every(l => l[t] === logs[0][t])) { bad++; if (firstBad < 0) firstBad = +t; }
  }
  return { n, bad, firstBad };
}
/** Prueba de oro: partida offline con las entradas que confirmó el anfitrión (3 valores por hueco), contra sus huellas. */
function golden(R) {
  if (!R.AD.rec) return null;
  const host = R.S[0], rec = R.AD.rec(host), V = R.V[0], Sm = V.Sim, D = V.Net.decode;
  if (!rec) return null;
  const g = Sm.createGame(host.opts), hl = {};
  for (const [t, h] of R.AD.hashLog(host)) hl[t] = h;
  const ins = []; const out = { n: 0, checked: 0, bad: 0 };
  for (let t = 0; t < rec.length; t++) {
    const r = rec[t]; if (!r) break;
    const ns = r.length / 3; while (ins.length < ns) ins.push({ move: [0, 0] });
    for (let s = 0; s < ns; s++) D(r[3 * s], r[3 * s + 1], r[3 * s + 2], ins[s]);
    Sm.step(g, STEP, ins); g.events.length = 0; out.n = t + 1;
    if (hl[t + 1] !== undefined) { out.checked++; if ((Sm.stateHash(g) >>> 0) !== hl[t + 1]) out.bad++; }
  }
  out.finalOk = out.n === host.gcTick ? Sm.stateHash(g) === Sm.stateHash(host.gc) : null;
  return out;
}

/** Informe por máquina y por par dirigido (tráfico). */
function report(R, tag) {
  const secs = R.T / 1000;
  for (let i = 0; i < R.n; i++) {
    const x = R.st[i];
    if (!R.S[i]) { console.log('        ' + tag + ' máquina ' + i + ': sin sesión (sonda, ' + R.P[i].sent + ' paquetes mandados)'); continue; }
    const s = R.S[i], dk = Object.keys(x.depth).map(Number).sort((a, b) => a - b);
    const hist = dk.length ? [[0, 0], [1, 4], [5, 12], [13, 24], [25, 999]].map(([a, b]) => { let c = 0; for (const d of dk) if (d >= a && d <= b) c += x.depth[d]; return a + '-' + (b > 99 ? '' : b) + ':' + r1(100 * c / Math.max(1, x.frames)) + '%'; }).join(' ') : '—';
    console.log('        ' + tag + ' máquina ' + i + ' (hueco ' + R.AD.slotOf(i) + '): ' + x.frames + ' frames · esperando ' + x.wait + ' · inestable ' + r1(100 * x.unstable / Math.max(1, x.frames)) + ' %' +
      ' · rollback ' + hist + (s.stats && s.stats.maxDepth != null ? ' (máx ' + s.stats.maxDepth + ')' : '') +
      ' · CPU p50 ' + r1(pct(x.cpu, 0.5)) + ' µs p99 ' + r1(pct(x.cpu, 0.99)) + ' µs · ping ' + Math.round(s.rtt || 0) + ' ms');
  }
  const tr = R.M.traffic && R.M.traffic();
  if (tr) {
    const rows = [];
    for (let i = 0; i < R.n; i++) for (let j = 0; j < R.n; j++) if (i !== j && tr[i][j].pk) rows.push(i + '→' + j + ' ' + r1(tr[i][j].bytes / secs / 1024) + ' KB/s ' + Math.round(tr[i][j].pk / secs) + ' pk/s');
    console.log('        ' + tag + ' tráfico (carga útil por tramo): ' + rows.join(' · '));
  }
}

/* ---------- Pruebas ---------- */
function main() {
  const argv = process.argv, arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
  const QUICK = argv.includes('--quick'), N = +arg('--n', 4), TOPO = arg('--topo', 'both'), MODEL = arg('--model', 'precisa2');
  const SECS = +arg('--secs', QUICK ? 30 : 90);
  const t0 = Date.now();

  console.log('== (a) memMesh con n = 2 = memPair (mismo partido Precisa, misma red) ==');
  {
    const base = { rtt: 80, jit: 15, loss: 3, seed: 21, secs: QUICK ? 20 : 40, model: 'precisa2' };
    const A = runMatch(Object.assign({}, base, { topo: 'pair' })), B = runMatch(Object.assign({}, base, { topo: 'mesh', n: 2 }));
    check('sin excepciones', !A.err && !B.err, A.err || B.err ? String((A.err || B.err).stack).split('\n').slice(0, 3).join(' | ') : undefined);
    if (!A.err && !B.err) {
      const ha = JSON.stringify(A.S[0].hashLog), hb = JSON.stringify(B.S[0].hashLog);
      const same = ha === hb && A.S[0].gcTick === B.S[0].gcTick && A.S[1].gcTick === B.S[1].gcTick &&
        A.S[0].stats.bytesOut === B.S[0].stats.bytesOut && A.S[1].stats.recv === B.S[1].stats.recv && JSON.stringify(A.st.map(x => x.wait)) === JSON.stringify(B.st.map(x => x.wait));
      check('mismas huellas, mismos tics, mismo tráfico y mismas esperas', same && A.S[0].hashLog.length > 5,
        { huellas: A.S[0].hashLog.length, tics: [A.S[0].gcTick, B.S[0].gcTick], bytes: [A.S[0].stats.bytesOut, B.S[0].stats.bytesOut] });
    }
  }

  const topos = TOPO === 'both' ? ['mesh', 'star'] : [TOPO];
  console.log('== (b) capa de enlaces, ' + N + ' máquinas ==');
  for (const topo of topos) {
    const rtt = topo === 'star' ? (i, j) => 40 + 20 * Math.max(i, j) : (i, j) => 30 + 10 * (i + j);
    const R = probe({ n: N, topo, rtt, jit: 10, loss: 5, seed: 3, secs: QUICK ? 10 : 30 });
    let worst = 0, lossBad = 0, ctlBad = 0, relayed = 0;
    for (const p of R.pairs) {
      worst = Math.max(worst, Math.abs(p.avg - p.exp));
      const expLoss = p.hops === 2 ? 100 * (1 - 0.95 * 0.95) : 5;
      if (Math.abs(p.loss - expLoss) > Math.max(1.5, 400 * Math.sqrt(expLoss / 100 * (1 - expLoss / 100) / Math.max(1, p.sent)))) lossBad++;   // (4 σ de la muestra)
      if (p.ctlBad || p.ctl < p.ctlSent - 2) ctlBad++;
      if (p.hops === 2) relayed++;
    }
    check(topo + ': latencia de ida media = RTT/2 de la ruta + medio frame (±3 ms) en los ' + R.pairs.length + ' pares dirigidos', worst < 3, { peorDesvio: r1(worst) });
    check(topo + ': pérdida en \'in\' ≈ la pedida (5 % por tramo, ±4 σ)', lossBad === 0, R.pairs.map(p => p.k + ':' + r1(p.loss)).join(' '));
    check(topo + ': \'ctl\' sin pérdidas y en orden', ctlBad === 0, { mal: ctlBad });
    if (topo === 'star') check('star: los pares invitado↔invitado van por el anfitrión (2 tramos)', relayed === (N - 1) * (N - 2), { reenviados: relayed });
    const tr = R.traffic, secs = R.T / 1000;
    let up0 = 0; for (let j = 1; j < N; j++) up0 += tr[0][j].bytes;
    console.log('        ' + topo + ': ' + R.pairs.map(p => p.k + ' ' + r1(p.avg) + '/' + r1(p.exp) + ' ms').join(' · ') + ' · subida del anfitrión ' + r1(up0 / secs / 1024) + ' KB/s');
  }

  console.log('== (c) partido ' + MODEL + ' sobre ' + N + ' máquinas (2 juegan; el resto, sonda) ==');
  for (const topo of topos) {
    const R = runMatch({ n: N, topo, rtt: (i, j) => 50 + 10 * (i + j), jit: 10, loss: 3, seed: 31, secs: SECS, model: MODEL });
    const tag = topo + ':';
    check(tag + ' sin excepciones', !R.err, R.err ? String(R.err.stack).split('\n').slice(0, 3).join(' | ') : undefined);
    if (R.err) continue;
    check(tag + ' los que juegan llegan a jugar', R.st.slice(0, R.np).every(x => (x.status.playing || 0) > 100), R.st.slice(0, R.np).map(x => x.status));
    const c = cmpHashes(R);
    if (c) check(tag + ' huellas de gc iguales en los ' + R.np + ' que juegan', c.n > 5 && c.bad === 0, c);
    const G = golden(R);
    if (G) check(tag + ' PRUEBA DE ORO: offline con las entradas confirmadas = gc del anfitrión', G.checked > 5 && G.bad === 0 && G.finalOk === true, G);
    const pr = R.P.filter(Boolean);
    if (pr.length > 1) check(tag + ' las sondas reciben de todas las demás sondas', pr.every(p => Object.keys(p.got).length === pr.length - 1), pr.map(p => Object.keys(p.got).length));
    report(R, tag);
  }
  console.log((fails ? 'FALLO: ' + fails + ' de ' + (fails + oks) : 'net4test OK: ' + oks + ' comprobaciones') + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  return fails ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { load, makeTopo, probe, runMatch, cmpHashes, golden, report, check, ADAPTERS, Probe, mulberry, pct, counts: () => ({ fails, oks }) };
