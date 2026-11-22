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
 *   (d)-(l) PRECISA-N (P2, adaptador 'precisaN': una plaza por máquina, estrella con el anfitrión de centro que reenvía): 2v2 con 4
 *       humanos a 40/120/200 ms ±15 y 2 % de pérdida (partido entero sin --quick: huellas, oro, marcador, win por equipo, esperas,
 *       profundidad de rollback y CPU), coop de 2 en el mismo equipo, 2 plazas mezcladas con la Session de 1.21.0 en los dos sentidos
 *       (mixA/mixB), plaza que se cae (IA a los 3 s, el partido sigue, seatGone a los 60 s), plaza que vuelve (resync), abandonos
 *       (rivalQuit cuando se va todo el equipo rival) y 'app' reenviado, retraso adaptativo, aiSeats y plaza que llega tarde, códec.
 *       --no-n las salta.
 * AMPLIAR (P2/P5): ADAPTERS[nombre] = {peers(cfg) → cuántas máquinas juegan, make(V, i, M, cfg, log) → sesión con
 *   advance(now, entrada) → {status, events, confirmed, unstable}, gameOf(s) → partida para el bot, slotOf(i) → hueco del bot,
 *   hashLog? (sesión con o.hashLog), rec? (entradas confirmadas, 3 valores por hueco)}. El bot ya es por hueco (VB.Net.bot(slot…)).
 * Uso: node tools/net4test.js [--quick] [--n 4] [--topo mesh|star|both] [--model precisa2|fluida2] [--secs 60] [--no-n]   (código 1 si falla)
 * Como módulo: require('./net4test.js') → {load, makeTopo, probe, runMatch, golden, report, ADAPTERS} (lo usa tools/net12test.js).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/net.js', 'js/netfluid.js', 'js/nettest-links.js', 'js/nethost.js'].map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
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
  },
  /** Precisa-N (P2): una plaza por máquina (máquina i = plaza i), estrella con el anfitrión (máquina 0) en el centro: el anfitrión
   *  tiene un enlace por invitado (M.links[0][k]) y cada invitado solo el suyo con el anfitrión (M.links[i][0]); el reenvío lo hace
   *  la sesión (topología 'star' con relay:false). cfg.seats = [{team, idx?}…] (por defecto 2v2 con 4: plaza s → equipo s % 2),
   *  cfg.coop, cfg.format, cfg.delay, cfg.adaptive, cfg.linkSeats (si no, la plaza la dice el saludo), cfg.aiSeats. */
  precisaN: {
    peers: cfg => (cfg.seats || [0, 0, 0, 0]).length,
    make(V, i, M, cfg, log) {
      const seats = cfg.seats || [{ team: 0 }, { team: 1 }, { team: 0 }, { team: 1 }], n = seats.length;
      const links = i === 0 ? Array.from({ length: n - 1 }, (_, k) => M.links[0][k + 1]) : [M.links[i][0]];
      const o = { slot: i, links, seats, opts: i === 0 ? cfg.opts : null, name: 'Plaza ' + i, names: seats.map((_, k) => 'Plaza ' + k),
        record: i === 0, hashLog: [], log, delay: cfg.delay, adaptive: cfg.adaptive, maxPred: cfg.maxPred, delayK: cfg.delayK, pace: cfg.pace };
      if (i === 0 && cfg.linkSeats) o.linkSeats = cfg.linkSeats;
      if (i === 0 && cfg.aiSeats) o.aiSeats = cfg.aiSeats;
      return new V.Net.Session(o);
    },
    gameOf: s => s.gp, slotOf: i => i, hashLog: s => s.hashLog, rec: s => s.rec, confirmed: s => s.gc
  },
  /** 1 contra 1 MEZCLADO (P2): anfitrión con la Session de siempre e invitado con una SessionN de 2 plazas (el cable de 2 plazas es el
   *  de siempre: un cliente 1.21.0 y uno nuevo juegan juntos). mixB: al revés. */
  mixA: {
    peers: () => 2,
    make(V, i, M, cfg, log) {
      const link = M.links[i][1 - i], o = { slot: i, opts: i === 0 ? cfg.opts : null, name: i ? 'Invitado' : 'Anfitrión', record: i === 0, hashLog: [], log };
      return i === 0 ? new V.Net.Session(Object.assign(o, { link })) : new V.Net.SessionN(Object.assign(o, { links: [link], seats: [{ team: 0 }, { team: 1 }], adaptive: false }));
    },
    gameOf: s => s.gp, slotOf: i => i, hashLog: s => s.hashLog, rec: s => s.rec, confirmed: s => s.gc
  },
  mixB: {
    peers: () => 2,
    make(V, i, M, cfg, log) {
      const link = M.links[i][1 - i], o = { slot: i, opts: i === 0 ? cfg.opts : null, name: i ? 'Invitado' : 'Anfitrión', record: i === 0, hashLog: [], log };
      return i === 1 ? new V.Net.Session(Object.assign(o, { link })) : new V.Net.SessionN(Object.assign(o, { links: [link], seats: [{ team: 0 }, { team: 1 }], adaptive: false }));
    },
    gameOf: s => s.gp, slotOf: i => i, hashLog: s => s.hashLog, rec: s => s.rec, confirmed: s => s.gc
  },
  /** P5: modelo «host» (js/nethost.js), autoridad del anfitrión y tu jugador tuyo. 6v6 con cfg.np humanos (12 por defecto) por la
   *  estrella (sin reenvío: los invitados solo hablan con el anfitrión). Plaza s: equipo s % 2, puesto floor(s / 2). */
  host6: {
    peers: cfg => cfg.np || 12,
    make(V, i, M, cfg, log) { return hostMake(V, i, M, cfg, log, '6v6', cfg.np || 12); },
    gameOf: s => s.g, slotOf: i => i, hashLog: null, rec: null, confirmed: s => s.g
  },
  /** P5: el mismo modelo en 2v2 con 4 humanos (la opción «2v2 × 4» que el lobby puede elegir si mide mejor que Precisa-N). */
  host4: {
    peers: () => 4,
    make(V, i, M, cfg, log) { return hostMake(V, i, M, cfg, log, '2v2', 4); },
    gameOf: s => s.g, slotOf: i => i, hashLog: null, rec: null, confirmed: s => s.g
  }
};
/** P5: sesión nethost de la máquina i (plaza i) con np plazas en formato fmt. */
function hostMake(V, i, M, cfg, log, fmt, np) {
  const seats = []; for (let s = 0; s < np; s++) seats.push({ team: s % 2, idx: s >> 1, name: 'J' + s });
  const opts = Object.assign({}, cfg.opts, { format: fmt, humans: seats.map(h => ({ team: h.team, idx: h.idx })) });
  const links = i === 0 ? Array.from({ length: np - 1 }, (_, k) => M.links[0][k + 1]) : [M.links[i][0]];
  return new V.NetHost.Session({ slot: i, links, seats, names: seats.map(h => h.name), opts: i === 0 ? opts : null, name: seats[i].name, log });
}
/** Opciones de partido para Precisa-N con estas plazas (2v2; coop: todas en el equipo 0; 6v6 con format). */
function optsN(seed, seats, o) {
  o = o || {};
  const r = { online: true, seed: 5000 + seed, venue: o.venue || 'hall', bestOf: 1, points: o.points || 21, humans: seats.map(h => Object.assign({}, h)), present: true, stats: true };
  if (o.coop) r.coop = true;
  if (o.format) r.format = o.format;
  return r;
}

/** lane B: correcciones VISIBLES en la partida predicha (lo que se pinta antes del suavizado de main.js): cuánto se aparta cada
 *  jugador que no es el tuyo y el balón de seguir con su velocidad (la de antes o la de ahora) entre dos frames. x.pj = desvíos (m). */
const GRAV = 9.81;
function visCorr(x, g, slot, T) {
  const live = g.mode === 'rally' || g.mode === 'serve', P = x.pPrev, mine = g.hum && g.hum[slot] ? g.hum[slot].p : null;
  const cur = live ? { T, mode: g.mode, pl: g.players.map(p => p === mine ? null : [p.x, p.y, p.vx, p.vy]), b: g.ball.held ? null : [g.ball.x, g.ball.y, g.ball.z, g.ball.vx, g.ball.vy, g.ball.vz] } : null;
  if (cur && P && P.mode === cur.mode && T - P.T < 80) {
    const dt = (T - P.T) / 1000;
    for (let i = 0; i < cur.pl.length; i++) {
      const a = P.pl[i], b = cur.pl[i]; if (!a || !b) continue;
      x.pj.push(Math.min(Math.hypot(b[0] - a[0] - a[2] * dt, b[1] - a[1] - a[3] * dt), Math.hypot(b[0] - a[0] - b[2] * dt, b[1] - a[1] - b[3] * dt)));
    }
    if (P.b && cur.b) {
      const a = P.b, b = cur.b;
      const d = Math.min(Math.hypot(b[0] - a[0] - a[3] * dt, b[1] - a[1] - a[4] * dt, b[2] - a[2] - a[5] * dt + 0.5 * GRAV * dt * dt), Math.hypot(b[0] - a[0] - b[3] * dt, b[1] - a[1] - b[4] * dt, b[2] - a[2] - b[5] * dt));
      (x.bj || (x.bj = [])).push(d);
    }
  }
  x.pPrev = cur;
}

/** Un partido de N máquinas. cfg: {n, topo, rtt, jit, loss, seed, secs, model, opts, prof, offs, hitch}.
 *  Las máquinas 0..peers-1 juegan con el adaptador; las demás hacen de sonda (a todas).
 *  Ganchos (P2): cfg.script(T, X) antes de cada frame (X = {M, S, V, st, T}: cortar enlaces, abandonar…), cfg.dead(k, T) = la máquina k
 *  no corre (pestaña muerta), cfg.done(S, T) = fin del partido (por defecto: todas las que juegan en 'over'). */
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
  for (let i = 0; i < n; i++) st.push({ frames: 0, wait: 0, unstable: 0, depth: {}, cpu: [], events: 0, conf: 0, status: {}, err: null, pts: [], stall: 0, stallMs: 0, miss: 0, resim: 0, pj: [], pPrev: null });
  let err = null;
  // lane B: frame de cfg.frameMs (16,667 = 60 Hz; 7,9 = 126 fps) o, por máquina, cfg.frameOf(i). Modelo de CPU de móvil (cfg.cpuX):
  // el frame cuesta cfg.renderMs + lo que tarda advance × cpuX; si no cabe en el frame, se pierde la vsync (el siguiente llega tarde).
  const FMs = []; for (let i = 0; i < n; i++) FMs.push(cfg.frameOf ? cfg.frameOf(i) : (cfg.frameMs || 16.667));
  const X = { M, S, V, st, T: 0, bots, off, FMs, AD };
  while (!err) {
    let k = 0; for (let i = 1; i < n; i++) if (next[i] < next[k]) k = i;
    T = next[k]; if (T >= END) break;
    const FM = FMs[k];
    next[k] += FM + (fr() * 2 - 1) * 1.5 * FM / 16.667 + (fr() < (cfg.hitch == null ? 0.01 : cfg.hitch) ? 35 : 0);
    if (cfg.script) { X.T = T; try { cfg.script(T, X); } catch (e) { err = e; break; } }
    if (P[k]) { P[k].frame(T); continue; }
    if (cfg.dead && cfg.dead(k, T)) continue;
    const s = S[k], g = AD.gameOf(s), x = st[k];
    const inp = g ? bots[k](g) : null;
    const t0 = process.hrtime.bigint();
    let r;
    try { r = s.advance(T + off[k], inp); } catch (e) { x.err = err = e; break; }
    const us = Number(process.hrtime.bigint() - t0) / 1000;
    x.frames++; x.status[r.status] = (x.status[r.status] || 0) + 1;
    if (r.status === 'playing' || r.status === 'waiting') x.cpu.push(us);
    const cpuX = cfg.cpuOf ? cfg.cpuOf(k) : cfg.cpuX;   // (estrés: CPU por máquina, p. ej. un invitado a ×4)
    if (cpuX && (r.status === 'playing' || r.status === 'waiting')) {
      // (cfg.stepUs: modelo fijo, sin el ruido del reloj de Node: tics dados en el frame (confirmados + predichos) × stepUs y cada
      //  copia de gc × copyUs, todo × cpuX; sin stepUs, lo que tardó advance de verdad × cpuX)
      let simMs = us * cpuX / 1000;
      if (cfg.stepUs && s.stats) { const st0 = s.stats, dS = (st0.steps | 0) - (x.lSteps | 0), dC = (st0.copies | 0) - (x.lCopies | 0); x.lSteps = st0.steps | 0; x.lCopies = st0.copies | 0; simMs = ((dS + (st0.resim | 0)) * cfg.stepUs + dC * (cfg.copyUs || 130)) * cpuX / 1000; (x.simMs || (x.simMs = [])).push(simMs); }
      const cost = (cfg.renderMs == null ? 8 : cfg.renderMs) + simMs;
      if (cost > FM) { const lost = Math.ceil(cost / FM - 1); x.miss += lost; next[k] += lost * FM; }
    }
    if ((r.status === 'playing' || r.status === 'waiting') && s.waitStart >= 0) { x.stall++; x.stallMs += FM; }   // (micro-esperas: también las de < 100 ms, que no llegan a 'waiting')
    if (s.stats && typeof s.stats.resim === 'number') x.resim += s.stats.resim;
    if (cfg.visible && r.g && (r.status === 'playing' || r.status === 'over')) visCorr(x, r.g, AD.slotOf(k), T);
    if (r.status === 'waiting') x.wait++;
    if (r.unstable) x.unstable++;
    if (s.stats && typeof s.stats.depth === 'number') x.depth[s.stats.depth] = (x.depth[s.stats.depth] || 0) + 1;
    x.events += r.events ? r.events.length : 0; x.conf += r.confirmed ? r.confirmed.length : 0;
    if (r.confirmed) for (const e of r.confirmed) if (e.type === 'point' && e.score) x.pts.push(e.team + ':' + e.score.join('-'));   // (marcador confirmado, para comparar entre máquinas)
    if (r.waitFor && r.waitFor.length) for (const w of r.waitFor) x.waitFor = Object.assign(x.waitFor || {}, { [w]: ((x.waitFor || {})[w] || 0) + 1 });
    x.last = r;
    if (r.app && r.app.length) x.app = (x.app || []).concat(r.app);
    if (cfg.done ? cfg.done(S, T) : S.slice(0, np).every(q => q.status === 'over')) break;
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

/* ---------- Precisa-N (P2): partidos de verdad con 4 plazas (2v2, 2 por equipo) y coop (2 humanos en el mismo equipo) ---------- */
const errTxt = R => R.err ? String(R.err.stack).split('\n').slice(0, 3).join(' | ') : undefined;
/** Huellas iguales en las máquinas `who` en los tics > floor (las de una plaza que llevaba la IA antes de su resync no cuentan). */
function cmpFrom(R, who, floor) {
  const logs = who.map(i => { const m = {}; for (const [t, h] of R.S[i].hashLog) if (t > floor) m[t] = h; return m; });
  let n = 0, bad = 0, firstBad = -1;
  for (const t in logs[0]) { if (!logs.every(l => l[t] !== undefined)) continue; n++; if (!logs.every(l => l[t] === logs[0][t])) { bad++; if (firstBad < 0) firstBad = +t; } }
  return { n, bad, firstBad };
}
function testPrecisaN(QUICK) {
  const S4 = [{ team: 0 }, { team: 1 }, { team: 0 }, { team: 1 }];
  const run = (c) => runMatch(Object.assign({ n: c.seats ? c.seats.length : 4, topo: 'star', relay: false, model: 'precisaN', seats: S4, jit: 15, loss: 2 }, c));

  console.log('== (d) Precisa-N: 2v2 con 4 humanos (2 por equipo), estrella, RTT con el anfitrión 40 / 120 / 200 ms, ±15 ms, 2 % de pérdida ==');
  {
    const rt = [0, 40, 120, 200];
    const R = run({ rtt: k => rt[k], seed: 9, secs: QUICK ? 60 : 900, opts: optsN(9, S4) });
    check('4v: sin excepciones', !R.err, errTxt(R));
    if (!R.err) {
      check('4v: las 4 llegan a jugar', R.st.every(x => (x.status.playing || 0) > 100), R.st.map(x => x.status));
      const c = cmpHashes(R); check('4v: huellas de gc iguales en las 4', c.n > 5 && c.bad === 0, c);
      const G = golden(R); check('4v: PRUEBA DE ORO (offline con las 4 entradas confirmadas = gc del anfitrión)', G.checked > 5 && G.bad === 0 && G.finalOk === true, G);
      check('4v: sin reparaciones ni resync', R.S.every(s => !s.mismatches && !s.stats.resyncs), R.S.map(s => [s.mismatches, s.stats.resyncs]));
      check('4v: el retraso acaba igual en las 4 (lo acuerda el anfitrión) y es el de la fórmula para 120 + 200 ms', R.S.every(s => s.delayTo === R.S[0].delayTo) && R.S[0].delayTo >= 3 && R.S[0].delayTo <= 6, R.S.map(s => s.delayTo));
      check('4v: nadie espera más de 1 s en total', R.st.every(x => x.wait < 60), R.st.map(x => x.wait));
      const m = Math.min(...R.st.map(x => x.pts.length));
      check('4v: marcador confirmado igual en las 4', m > 3 && R.st.every(x => x.pts.slice(0, m).join() === R.st[0].pts.slice(0, m).join()), R.st.map(x => x.pts.length));
      if (!QUICK) {
        const res = R.S.map(s => s.result || {});
        check('4v: final en las 4; win por EQUIPO (los dos de un equipo igual, los dos equipos al revés)', R.S.every(s => s.status === 'over') && res.every(r => r.why === 'over' && !r.unverified) &&
          res[0].win === res[2].win && res[1].win === res[3].win && res[0].win !== res[1].win, res);
      }
      report(R, '4v:');
    }
  }

  console.log('== (e) Precisa-N coop: 2 humanos en el MISMO equipo contra la IA (cable de 2 plazas), RTT 120 ms ±15, 2 % de pérdida ==');
  {
    const SC = [{ team: 0 }, { team: 0 }];
    const R = run({ seats: SC, rtt: () => 120, seed: 12, secs: QUICK ? 50 : 900, opts: optsN(12, SC, { coop: true }) });
    check('coop: sin excepciones', !R.err, errTxt(R));
    if (!R.err) {
      check('coop: las dos plazas en el equipo 0', R.S.every(s => s.gc.hum[0].team === 0 && s.gc.hum[1].team === 0 && s.team === 0), R.S.map(s => s.gc.hum.map(h => h.team)));
      const c = cmpHashes(R); check('coop: huellas iguales', c.n > 5 && c.bad === 0, c);
      const G = golden(R); check('coop: PRUEBA DE ORO', G.checked > 5 && G.bad === 0 && G.finalOk === true, G);
      check('coop: paquetes de tipo 1 (los de 2 plazas de siempre)', R.S.every(s => s.stats.sent > 100), R.S.map(s => s.stats.sent));
      if (!QUICK) check('coop: final con el MISMO resultado para los dos (mismo equipo)', R.S.every(s => s.status === 'over' && s.result && s.result.why === 'over') && R.S[0].result.win === R.S[1].result.win, R.S.map(s => s.result));
      report(R, 'coop:');
    }
  }

  console.log('== (f) 2 plazas mezcladas: la Session del 1 contra 1 (1.21.0) con una SessionN, en los dos sentidos (mismo cable) ==');
  for (const model of ['mixA', 'mixB']) {
    const R = runMatch({ topo: 'pair', rtt: 90, jit: 15, loss: 3, seed: 15, secs: QUICK ? 30 : 60, model });
    check(model + ': sin excepciones', !R.err, errTxt(R));
    if (R.err) continue;
    check(model + ': juegan las dos', R.st.every(x => (x.status.playing || 0) > 100), R.st.map(x => x.status));
    const c = cmpHashes(R); check(model + ': huellas iguales', c.n > 5 && c.bad === 0, c);
    const G = golden(R); check(model + ': PRUEBA DE ORO', G.checked > 5 && G.bad === 0 && G.finalOk === true, G);
  }

  console.log('== (g) una plaza se cae para siempre (su enlace y su página): la lleva la IA a los 3 s y el partido sigue ==');
  {
    let aiAt = -1;
    const R = run({ rtt: () => 60, seed: 21, secs: 85, opts: optsN(21, S4),
      script: (T, X) => { if (T > 12000 && !X.cut) { X.cut = true; X.M.down(1e9, 3); } if (aiAt < 0 && X.S[0].aiHeld[3]) aiAt = T; },
      dead: (k, T) => k === 3 && T > 12000, done: S => S[0].status === 'over' });
    check('caída: sin excepciones', !R.err, errTxt(R));
    if (!R.err) {
      check('caída: el anfitrión pasa la plaza 3 a la IA en ~3 s', aiAt > 12000 && aiAt < 16500, { s: r1((aiAt - 12000) / 1000) });
      check('caída: las otras 3 esperan menos de 4 s en total', R.st.slice(0, 3).every(x => x.wait < 240), R.st.slice(0, 3).map(x => x.wait));
      check('caída: las otras 3 siguen confirmando (> 60 s de partido)', R.S.slice(0, 3).every(s => s.gcTick > 60 * 120), R.S.slice(0, 3).map(s => s.gcTick));
      const c = cmpFrom(R, [0, 1, 2], 0); check('caída: huellas iguales en las 3 que siguen', c.n > 30 && c.bad === 0, c);
      check('caída: los invitados lo saben (r.aiSeats) y a los 60 s se ha ido (seatGone)', R.S.slice(0, 3).every(s => s.seatAI(3)) && R.S.slice(0, 3).every(s => s.seatGone(3)), R.S.slice(0, 3).map(s => [s.seatAI(3), s.seatGone(3)]));
      check('caída: la sim lleva esa plaza con la IA (g.hum[3].ai)', R.S[0].gc.hum[3].ai === true);
      check('caída: nadie da el partido por acabado (un compañero no es el equipo rival entero)', R.S.slice(0, 3).every(s => s.status !== 'ended' && !s.goneFlag), R.S.slice(0, 3).map(s => [s.status, s.result]));
    }
  }

  console.log('== (h) una plaza se corta 6 s y vuelve: IA mientras, y vuelve con resync (foto + entradas de todas) ==');
  {
    const R = run({ rtt: k => 50 + 20 * k, seed: 23, secs: 45, opts: optsN(23, S4), script: (T, X) => { if (T > 12000 && !X.cut) { X.cut = true; X.M.down(6000, 2); } } });
    check('vuelta: sin excepciones', !R.err, errTxt(R));
    if (!R.err) {
      const g2 = R.S[2];
      check('vuelta: el anfitrión la pasó a la IA y le mandó un resync que aplicó', R.S[0].stats.seatAI >= 1 && R.S[0].stats.resyncs >= 1 && g2.stats.rsIn >= 1, { ia: R.S[0].stats.seatAI, rs: R.S[0].stats.resyncs, rsIn: g2.stats.rsIn });
      check('vuelta: al final ninguna plaza la lleva la IA', R.S.every(s => !s._aiList().length) && !R.S[0].gc.hum[2].ai, R.S.map(s => s._aiList()));
      const c = cmpFrom(R, [0, 1, 2, 3], g2.rsT); check('vuelta: huellas iguales en las 4 desde el resync', c.n > 10 && c.bad === 0, Object.assign(c, { rsT: g2.rsT }));
      const G = golden(R); check('vuelta: PRUEBA DE ORO (con las entradas de la IA que escribió el anfitrión)', G.checked > 5 && G.bad === 0 && G.finalOk === true, G);
    }
  }

  console.log('== (i) abandonos: un rival se va (lo lleva la IA, sigue); se va el otro rival → los que quedan ganan (rivalQuit); app reenviado ==');
  {
    const box = {};
    const R = run({ rtt: () => 70, seed: 25, secs: 30, opts: optsN(25, S4),
      script: (T, X) => {
        if (T > 6000 && !X.app) { X.app = true; X.S[1].sendApp({ t: 'hola', s: 1 }); }
        if (T > 10000 && !X.q1) { X.q1 = true; X.S[1].quit(); }
        if (T > 14000 && !X.mid) { X.mid = X.S.map(s => [s.status, s.seatGone(1)]); box.mid = X.mid; }
        if (T > 18000 && !X.q3) { X.q3 = true; X.S[3].quit(); }
      }, done: (S, T) => T > 22000 });
    check('abandono: sin excepciones', !R.err, errTxt(R));
    if (!R.err) {
      const mid = box.mid || [];
      check('abandono: tras irse la plaza 1, las otras 3 siguen y lo saben (seatGone)', mid.length && [0, 2, 3].every(i => (mid[i][0] === 'playing' || mid[i][0] === 'waiting') && mid[i][1]), mid);
      check('abandono: tras irse también la 3 (todo el equipo 1), las plazas 0 y 2 ganan: rivalQuit', [0, 2].every(i => R.S[i].status === 'ended' && R.S[i].result && R.S[i].result.why === 'rivalQuit' && R.S[i].result.win), [0, 2].map(i => R.S[i].result));
      check('abandono: los que se fueron pierden (quit)', [1, 3].every(i => R.S[i].result && R.S[i].result.why === 'quit' && !R.S[i].result.win));
      check('app: el mensaje de la plaza 1 llega a las otras 3 (el anfitrión lo reenvía)', [0, 2, 3].every(i => (R.st[i].app || []).some(a => a && a.t === 'hola' && a.s === 1)), [0, 2, 3].map(i => (R.st[i].app || []).length));
    }
  }

  console.log('== (j) retraso adaptativo: RTT 200 y 220 ms con el anfitrión (camino 420 ms) → 8 tics en todas ==');
  {
    const rt = [0, 200, 220, 40];
    const R = run({ rtt: k => rt[k], jit: 10, seed: 27, secs: QUICK ? 45 : 70, opts: optsN(27, S4) });
    check('retraso: sin excepciones', !R.err, errTxt(R));
    if (!R.err) {
      check('retraso: 8 tics en las 4 (clamp(round(420/2/8,33) - 16, 2, 8))', R.S.every(s => s.delay === 8 && s.delayTo === 8), R.S.map(s => [s.delay, s.delayTo]));
      const c = cmpHashes(R); check('retraso: huellas iguales con el cambio de retraso a mitad', c.n > 5 && c.bad === 0, c);
      const G = golden(R); check('retraso: PRUEBA DE ORO', G.checked > 5 && G.bad === 0 && G.finalOk === true, G);
      report(R, 'retraso:');
    }
  }

  console.log('== (k) plazas que no llegan: o.aiSeats (ya se sabe) y una que llega tarde (entra con resync a mitad de partido) ==');
  {
    const R = run({ rtt: () => 60, seed: 29, secs: 25, aiSeats: [3], opts: optsN(29, S4), dead: k => k === 3, done: (S, T) => T > 20000 });
    check('aiSeats: sin excepciones', !R.err, errTxt(R));
    if (!R.err) {
      check('aiSeats: empieza sin esperar a la plaza 3 (la IA desde el tic 0)', R.S[0].gcTick > 15 * 120 && R.S[0].gc.hum[3].ai, { tics: R.S[0].gcTick });
      const c = cmpFrom(R, [0, 1, 2], 0); check('aiSeats: huellas iguales en las 3', c.n > 5 && c.bad === 0, c);
    }
    const L = run({ rtt: () => 60, seed: 31, secs: 45, opts: optsN(31, S4),
      script: (T, X) => { if (!X.cut) { X.cut = true; X.M.down(25000, 3); } }, dead: (k, T) => k === 3 && T < 25000 });
    check('tarde: sin excepciones', !L.err, errTxt(L));
    if (!L.err) {
      check('tarde: el anfitrión empieza a los 20 s sin ella y la deja entrar con resync', L.S[0].stats.resyncs >= 1 && L.S[3].stats.rsIn >= 1 && L.S[3].status !== 'connecting', { rs: L.S[0].stats.resyncs, st: L.S[3].status });
      const c = cmpFrom(L, [0, 1, 2, 3], L.S[3].rsT); check('tarde: huellas iguales en las 4 desde que entra', c.n > 5 && c.bad === 0, c);
      check('tarde: al final la plaza 3 la lleva su humano', !L.S[0].gc.hum[3].ai && !L.S[0].seatAI(3));
    }
  }

  console.log('== (m) plaza con conexión mala que no se corta (600 ms, 50 % de pérdida, ±200 ms): IA + espectador y vuelve más tarde ==');
  {
    const rt = [0, 50, 80, 600], ls = [0, 2, 2, 50], jt = [0, 10, 10, 200];
    const R = run({ rtt: k => rt[k], loss: (i, j) => ls[i || j], jit: (i, j) => jt[i || j], seed: 33, secs: 60, hitch: 0.03, opts: optsN(33, S4) });
    check('lenta: sin excepciones', !R.err, errTxt(R));
    if (!R.err) {
      const h = R.S[0], g3 = R.S[3], rate = h.gcTick / (R.T / 1000 * 120);
      check('lenta: el anfitrión la pasa a la IA por esperas acumuladas y le manda un resync de espectador', h.slowN[3] >= 1 && g3.stats.rsIn >= 1 && R.msgs.some(m => /espectador/.test(m)), { veces: h.slowN[3], rsIn: g3.stats.rsIn });
      check('lenta: el partido de los demás no va a cámara lenta (≥ 75 % del tiempo real confirmado)', rate >= 0.75, { ritmo: r1(rate * 100) + ' %' });
      // (estrés, tope 60: el anfitrión escribe {ai} en la plaza 3 desde su primer tic que le falta, y la plaza 3 puede haber confirmado
      //  ya esos tics con SU entrada (la que se perdió por el camino) hasta que le llega el resync de espectador, ~300 ms después: es la
      //  carrera de siempre al pasar una plaza a la IA, y el resync la arregla. Las 3 que siguen, iguales siempre; las 4, desde el resync.)
      const m1 = R.msgs.map(m => /\[netN 3\] resync aplicado: tic (\d+)/.exec(m)).find(Boolean), f1 = m1 ? +m1[1] : 0;
      const c3 = cmpFrom(R, [0, 1, 2], 0); check('lenta: huellas iguales en las 3 que siguen', c3.n > 20 && c3.bad === 0, c3);
      const c = cmpFrom(R, [0, 1, 2, 3], f1); check('lenta: huellas iguales en las 4 desde el resync de espectador (el espectador confirma lo mismo que los demás)', f1 > 0 && c.n > 20 && c.bad === 0, Object.assign(c, { desde: f1 }));
      const G = golden(R); check('lenta: PRUEBA DE ORO', G.checked > 5 && G.bad === 0 && G.finalOk === true, G);
      check('lenta: vuelve sola pasados 20 s (resync normal) y, si sigue mala, la IA otra vez con más espera', h.stats.resyncs >= 2, { resyncs: h.stats.resyncs, slowN: h.slowN[3] });
    }
  }

  testPace(QUICK, run);
  testReload(QUICK, run);

  console.log('== (l) códec de varios y bit switchPlayer ==');
  {
    const V = load(), N = V.Net;
    const ring = { X: new Int16Array(8192), Y: new Int16Array(8192), B: new Uint8Array(8192) };
    for (let t = 100; t < 110; t++) { ring.X[t] = t * 3 - 200; ring.Y[t] = -t; ring.B[t] = (t * 37) & 255; }
    const pk = N.packN(2, 123456, [5, 6, 7, 8], [{ s: 1, first: 100, n: 10, st: 99, ring }, { s: 3, first: 105, n: 0, st: 7, ring }], 3), u = N.unpackN(pk);
    check('paquete de varios ida y vuelta', u && u.from === 2 && u.tick === 123456 && u.ep === 3 && u.acks.join() === '5,6,7,8' && u.bl.length === 2 && u.bl[0].s === 1 && u.bl[0].n === 10 &&
      u.bl[0].v[0] === 100 && u.bl[0].v[2] === ((100 * 37) & 255) && u.bl[1].s === 3 && u.bl[1].st === 7 && u.bl[1].n === 0);
    check('paquete de varios corto o de otro tipo: null', N.unpackN(pk.slice(0, pk.length - 3)) === null && N.unpackN(N.packInputs(ring, 100, 2, 0, 0, 0)) === null);
    const b = N.bitsOf({ hit: true, switchPlayer: true }), d = N.decode(0, 0, b), d0 = N.decode(0, 0, N.BITS.hit | N.BITS.ai);
    check('bit switchPlayer: ida y vuelta; sin él, falso (el 1 contra 1 no cambia)', d.switchPlayer === true && d.hit === true && d0.switchPlayer === false && d0.ai === true);
    const s2 = new N.Session({ slot: 1, link: { send() { }, poll: () => [] } }), sN = new N.Session({ slot: 1, links: [{ send() { }, poll: () => [] }], seats: [{}, {}] });
    check('Session: sin plazas, la del 1 contra 1; con plazas (main.js), Precisa-N', !s2.multi && sN.multi === true && sN instanceof N.SessionN);
    check('retraso de la fórmula: 100 ms → 2, 420 ms → 8, 330 ms → 4', N.adaptDelay(100) === 2 && N.adaptDelay(420) === 8 && N.adaptDelay(330) === 4, [N.adaptDelay(100), N.adaptDelay(420), N.adaptDelay(330)]);
  }
}

/* ---------- lane B (22-nov-2026): ritmo de envío, vuelta tras recargar y tope de predicción de Precisa-N ---------- */
const histPct = (h, q) => { const ks = Object.keys(h).map(Number).sort((a, b) => a - b); let tot = 0; for (const k of ks) tot += h[k]; let acc = 0; for (const k of ks) { acc += h[k]; if (acc >= q * tot) return k; } return 0; };
/** Métricas por máquina que juega: paquetes y KB/s por enlace (el anfitrión: media de sus enlaces), rollback, micro-esperas, frames
 *  perdidos (modelo de CPU), tics rehechos por frame y correcciones visibles de la partida predicha. */
function laneStats(R, who) {
  const secs = R.T / 1000, tr = R.M.traffic && R.M.traffic();
  return who.map(i => {
    const x = R.st[i], s = R.S[i], pj = x.pj || [], bj = x.bj || [];
    let pk = 0, by = 0, nl = 0;
    if (tr) { if (i === 0) { for (let j = 1; j < R.np; j++) if (tr[0][j].pk) { pk += tr[0][j].pk; by += tr[0][j].bytes; nl++; } } else { pk = tr[i][0].pk; by = tr[i][0].bytes; nl = 1; } }
    return { i, pkS: Math.round(pk / Math.max(1, nl) / secs), kbS: r1(by / Math.max(1, nl) / secs / 1024),
      d50: histPct(x.depth, 0.5), d95: histPct(x.depth, 0.95), d99: histPct(x.depth, 0.99), dMax: s.stats ? s.stats.maxDepth : 0,
      stall: x.stall, stallMs: Math.round(x.stallMs), waitEp: s.stats ? s.stats.waits : 0, miss: x.miss, resim: r1(x.resim / Math.max(1, x.frames)),
      cpu50: r1(pct(x.cpu, 0.5)), cpu99: r1(pct(x.cpu, 0.99)),
      pj15: pj.filter(d => d > 0.15).length, pj50: pj.filter(d => d > 0.5).length, pj99: Math.round(pct(pj, 0.99) * 100) / 100, bj50: bj.filter(d => d > 0.5).length, bj99: Math.round(pct(bj, 0.99) * 100) / 100,
      delay: s.delayTo, paced: s.stats ? s.stats.paced : 0, frames: x.frames, sim99: r1(pct(x.simMs || [], 0.99)), simMax: r1(pct(x.simMs || [], 1)), pjSum: Math.round(pj.filter(d => d > 0.02).reduce((a, b) => a + b, 0)) };
  });
}
function laneLine(tag, L) {
  for (const m of L) console.log('        ' + tag + ' plaza ' + m.i + ': ' + m.pkS + ' pk/s ' + m.kbS + ' KB/s por enlace · rollback p50/p95/p99/máx ' + m.d50 + '/' + m.d95 + '/' + m.d99 + '/' + m.dMax +
    ' · micro-esperas ' + m.stall + ' frames (' + m.waitEp + ' veces) · frames perdidos ' + m.miss + ' · rehechos/frame ' + m.resim + ' · CPU p50/p99 ' + m.cpu50 + '/' + m.cpu99 + ' µs' +
    ' · saltos visibles jugadores >0,15/>0,5 m ' + m.pj15 + '/' + m.pj50 + ' (p99 ' + m.pj99 + ') balón >0,5 ' + m.bj50 + ' · retraso ' + m.delay);
}
const sumK = (L, k) => L.reduce((a, m) => a + m[k], 0);

/** (n) Ritmo de envío: 2v2 × 4 a 126 fps (pantalla de 120 Hz y algo) con y sin tope de 60 paquetes/s por enlace. */
function testPace(QUICK, run) {
  console.log('== (n) ritmo de envío de Precisa-N: 2v2 × 4 a 126 fps, RTT 150 ms ±15, 2 % de pérdida, sin tope (antes) y con tope de 60 Hz ==');
  const S4 = [{ team: 0 }, { team: 1 }, { team: 0 }, { team: 1 }];
  const base = { rtt: k => k ? 150 : 0, seed: 41, secs: QUICK ? 40 : 90, frameMs: 7.94, visible: true, delay: 4, adaptive: false, opts: optsN(41, S4) };   // (retraso fijo: solo cambia el ritmo)
  const A = run(Object.assign({}, base, { pace: false })), B = run(Object.assign({}, base));
  check('ritmo: sin excepciones', !A.err && !B.err, errTxt(A) || errTxt(B));
  if (A.err || B.err) return;
  const LA = laneStats(A, [0, 1, 2, 3]), LB = laneStats(B, [0, 1, 2, 3]);
  laneLine('antes:', LA); laneLine('ahora:', LB);
  check('ritmo: con el tope, ≤ 62 paquetes/s por enlace en todas (antes ~126)', LB.every(m => m.pkS <= 62) && LA.every(m => m.pkS > 100), { antes: LA.map(m => m.pkS), ahora: LB.map(m => m.pkS) });
  check('ritmo: la subida del anfitrión por enlace baja más de un 30 %', LB[0].kbS < 0.7 * LA[0].kbS, { antes: LA[0].kbS, ahora: LB[0].kbS });
  const c = cmpHashes(B), G = golden(B);
  check('ritmo: huellas iguales y PRUEBA DE ORO con el tope', c.n > 5 && c.bad === 0 && G.checked > 5 && G.bad === 0 && G.finalOk === true, { c, G });
  check('ritmo: sin esperas de más (micro-esperas de los 4 ≤ las de antes + 10 frames; con el tope de predicción de 30, ninguna)', sumK(LB, 'stall') <= sumK(LA, 'stall') + 10, { antes: LA.map(m => m.stall), ahora: LB.map(m => m.stall) });
  // (medio frame más por tramo de media: el p99 de la profundidad sube 1-4 tics; lo que cuesta CPU es solo el frame que rehace)
  check('ritmo: rollback p99 como mucho 4 tics más y por debajo del tope', LB.every((m, i) => m.d99 <= LA[i].d99 + 4 && m.dMax <= 30), { antes: LA.map(m => m.d99), ahora: LB.map(m => m.d99), max: LB.map(m => m.dMax) });
  const C = run(Object.assign({}, base, { frameMs: 16.667, secs: QUICK ? 20 : 40 })), D = run(Object.assign({}, base, { frameMs: 16.667, secs: QUICK ? 20 : 40, pace: false }));
  check('ritmo: a 60 Hz nada cambia (mismos bytes y mismas huellas que sin tope)', !C.err && !D.err && C.S.every((s, i) => s.stats.bytesOut === D.S[i].stats.bytesOut && JSON.stringify(s.hashLog) === JSON.stringify(D.S[i].hashLog)) && C.S.every(s => s.stats.paced === 0),
    C.err || D.err ? errTxt(C) || errTxt(D) : C.S.map((s, i) => [s.stats.bytesOut, D.S[i].stats.bytesOut]));
}

/** (o) Vuelta tras recargar (lane A en el lobby): la página del invitado muere D s y vuelve con una sesión NUEVA (otro contexto, otro
 *  reloj, sin opciones, misma plaza y época) por un enlace nuevo. via 'same': el anfitrión sigue con el mismo objeto de enlace (el
 *  lobby lo renegocia: mxRelinkHost); via 'add': un enlace nuevo con sess.addLink (el del enlace viejo queda sin plaza). */
function reloadRun(run, o) {
  const seats = o.seats || [{ team: 0 }, { team: 1 }, { team: 0 }, { team: 1 }], k = o.seat || 2, at = o.at || 15000, D = o.gap * 1000;
  const box = { back: null };
  const R = run({ seats, n: seats.length, rtt: o.rtt || (q => 60 + 20 * q), seed: o.seed || 51, secs: (at + D) / 1000 + (o.after || 25), opts: optsN(o.seed || 51, seats, { coop: o.coop }),
    dead: (q, T) => q === k && T >= at && T < at + D,
    script: (T, X) => {
      if (T >= at && !X.cut) { X.cut = true; X.M.down(D, k); }   // (la página vieja ya no existe: lo que va o viene se pierde)
      if (T >= at + D && !X.re) {
        X.re = true;
        const V = load(), host = X.S[0];
        let gl;
        if (o.via === 'add') {
          const pr = V.Net.memPair({ lag: 60 + 20 * k, jit: 15, loss: 2, seed: 77 + k, clock: () => X.T });
          X.M.down(1e9, k);   // (el enlace viejo no vuelve)
          host.addLink(pr[0]); gl = pr[1];
        } else { gl = X.M.links[k][0]; gl.flush(); }   // (relink: el mismo objeto en el anfitrión; la página nueva no hereda nada en vuelo)
        X.V[k] = V; X.off[k] = -T + 3000;   // (página nueva: performance.now empieza de cero)
        const old = X.S[k];
        X.S[k] = new V.Net.Session({ slot: k, links: [gl], seats, opts: null, name: 'Plaza ' + k, names: seats.map((_, q) => 'Plaza ' + q), hashLog: [], epoch: old.epoch, back: true });
        X.bots[k] = V.Net.bot(k, 99 + k, 'bueno');
        box.back = { T };
      }
      if (box.back && !box.back.rsT && X.S[k].stats.rsIn > 0) box.back.rsT = T;
    }, done: (S, T) => S.slice(0, seats.length).some(s => s.status === 'over') });
  return { R, back: box.back, k, at, D };
}
function testReload(QUICK, run) {
  console.log('== (o) vuelta tras recargar: la página de un invitado muere 5-40 s y vuelve con sesión y estado nuevos, enlace renegociado o nuevo ==');
  const cases = QUICK ? [[5, 'same'], [40, 'add']] : [[5, 'same'], [12, 'add'], [25, 'same'], [40, 'add']];
  for (const [gap, via] of cases) {
    const X = reloadRun(run, { gap, via, seed: 51 + gap });
    const R = X.R, tag = 'recarga ' + gap + ' s (' + (via === 'add' ? 'addLink' : 'mismo enlace') + '):';
    check(tag + ' sin excepciones', !R.err, errTxt(R));
    if (R.err) continue;
    const g = R.S[X.k], h = R.S[0];
    check(tag + ' la sesión nueva recibe el resync y juega', !!X.back && g.stats.rsIn >= 1 && (g.status === 'playing' || g.status === 'over') && !!g.opts, { st: g.status, rsIn: g.stats.rsIn });
    check(tag + ' su plaza vuelve a ser humana en todas (no se dio por ida)', R.S.every(s => !s.seatAI(X.k) && !s.seatGone(X.k)) && !h.gc.hum[X.k].ai, R.S.map(s => [s.seatAI(X.k), s.seatGone(X.k)]));
    const c = cmpFrom(R, [0, 1, 2, 3], g.rsT); check(tag + ' huellas iguales en las 4 desde el resync', c.n > 5 && c.bad === 0, Object.assign(c, { rsT: g.rsT }));
    const G = golden(R); check(tag + ' PRUEBA DE ORO del anfitrión', G.checked > 5 && G.bad === 0 && G.finalOk === true, G);
    const others = [0, 1, 2, 3].filter(i => i !== X.k);
    check(tag + ' los demás siguen jugando sin esperar (< 4 s en total)', others.every(i => R.S[i].status === 'playing' || R.S[i].status === 'over') && others.every(i => R.st[i].wait < 240), others.map(i => [R.S[i].status, R.st[i].wait]));
    console.log('        ' + tag + ' página nueva a los ' + r1((X.back.T - X.at) / 1000) + ' s; resync aplicado ' + Math.round(X.back.rsT - X.back.T) + ' ms después (tic ' + g.rsT + ')');
  }
  {   // coop de 2 (cable de 2 plazas, el de la Carrera cooperativa)
    const X = reloadRun(run, { gap: 20, via: 'same', seed: 61, coop: true, seats: [{ team: 0 }, { team: 0 }], seat: 1, rtt: () => 120 });
    const R = X.R, tag = 'recarga coop 20 s:';
    check(tag + ' sin excepciones', !R.err, errTxt(R));
    if (!R.err) {
      const g = R.S[1];
      check(tag + ' vuelve con resync y su plaza es humana', g.stats.rsIn >= 1 && !R.S[0].seatAI(1) && !R.S[0].gc.hum[1].ai, { rsIn: g.stats.rsIn, st: g.status });
      const c = cmpFrom(R, [0, 1], g.rsT); check(tag + ' huellas iguales desde el resync', c.n > 5 && c.bad === 0, c);
    }
  }
}

/** Estudio del tope de predicción (lane B, punto 3): 2v2 × 4, invitados a cfg RTT, móvil de 60 Hz con la sim × cpuX (frame = render
 *  + sesión × cpuX), combinaciones de tope y del «- K» del retraso. node tools/net4test.js --lane --maxpred [--secs 90] [--cpu 6]. */
function studyMaxPred(argv, run) {
  const arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
  const SECS = +arg('--secs', 90), CPU = +arg('--cpu', 6), REND = +arg('--render', 7), seeds = String(arg('--seeds', '41,42')).split(',').map(Number);
  const nets = String(arg('--nets', '150,mix')).split(',');
  const combos = String(arg('--combos', '24:16,30:16,36:16,24:14,24:12,30:14')).split(',').map(c => c.split(':').map(Number));
  const S4 = [{ team: 0 }, { team: 1 }, { team: 0 }, { team: 1 }];
  for (const net of nets) {
    const rt = net === 'mix' ? [0, 40, 120, 200] : [0, +net, +net, +net];
    console.log('== tope de predicción: RTT con el anfitrión ' + rt.slice(1).join('/') + ' ms ±15, 2 % de pérdida, móvil 60 Hz (render ' + REND + ' ms + sesión × ' + CPU + '), ' + SECS + ' s × semillas ' + seeds.join(',') + ' ==');
    for (const [mp, dk] of combos) {
      const acc = [];
      for (const seed of seeds) {
        const R = run({ rtt: k => rt[k], seed, secs: SECS, maxPred: mp, delayK: dk, cpuX: CPU, renderMs: REND, stepUs: +arg('--step', 20), copyUs: +arg('--copy', 130), frameMs: +arg('--frame', 16.667), visible: true, opts: optsN(seed, S4) });
        if (R.err) { console.log('   error ' + errTxt(R)); continue; }
        const c = cmpHashes(R); if (c.bad) console.log('   HUELLAS DISTINTAS ' + JSON.stringify(c));
        acc.push(laneStats(R, [0, 1, 2, 3]));
      }
      const G = [1, 2, 3], tot = k => acc.reduce((a, L) => a + G.reduce((b, i) => b + L[i][k], 0), 0), mx = k => Math.max(...acc.map(L => Math.max(...G.map(i => L[i][k]))));
      const fr = tot('frames');
      console.log('   tope ' + mp + ', K ' + dk + ' (retraso ' + acc.map(L => L[0].delay).join('/') + '): invitados · micro-esperas ' + tot('stall') + ' frames (' + (100 * tot('stall') / fr).toFixed(2) + ' %) · frames perdidos por CPU ' + tot('miss') + ' (' + (100 * tot('miss') / fr).toFixed(2) + ' %)' +
        ' · rollback p99 máx ' + mx('d99') + ', máx ' + mx('dMax') + ' · rehechos/frame ' + r1(tot('resim') / acc.length / 3) + ' · sim del móvil p99/máx ' + mx('sim99') + '/' + mx('simMax') + ' ms' +
        ' · saltos visibles >0,15/>0,5 m por minuto ' + r1(tot('pj15') / (SECS / 60) / acc.length / 3) + '/' + r1(tot('pj50') / (SECS / 60) / acc.length / 3) + ' (p99 ' + mx('pj99') + ' m) · corrección total ' + r1(tot('pjSum') / (SECS / 60) / acc.length / 3) + ' m/min · balón >0,5 m ' + tot('bj50') +
        ' · anfitrión micro-esperas ' + acc.reduce((a, L) => a + L[0].stall, 0));
    }
  }
}

/* ---------- Pruebas ---------- */
function main() {
  const argv = process.argv, arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
  const QUICK = argv.includes('--quick'), N = +arg('--n', 4), TOPO = arg('--topo', 'both'), MODEL = arg('--model', 'precisa2');
  const SECS = +arg('--secs', QUICK ? 30 : 90);
  const t0 = Date.now();
  if (argv.includes('--lane')) {   // (lane B: solo (n) ritmo de envío y (o) vuelta tras recargar; con --maxpred, el estudio del tope)
    const S4 = [{ team: 0 }, { team: 1 }, { team: 0 }, { team: 1 }];
    const run = (c) => runMatch(Object.assign({ n: c.seats ? c.seats.length : 4, topo: 'star', relay: false, model: 'precisaN', seats: S4, jit: 15, loss: 2 }, c));
    if (argv.includes('--maxpred')) studyMaxPred(argv, run); else { testPace(QUICK, run); testReload(QUICK, run); }
    console.log((fails ? 'FALLO: ' + fails + ' de ' + (fails + oks) : 'net4test --lane OK: ' + oks + ' comprobaciones') + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    return fails ? 1 : 0;
  }

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
  for (const topo of (ADAPTERS[MODEL] && ADAPTERS[MODEL].peers({}) > 2 ? [] : topos)) {   // (Precisa-N: sus propias pruebas, (d) en adelante)
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
  if (!argv.includes('--no-n')) testPrecisaN(QUICK);
  if (!argv.includes('--no-host')) {   // P5: el modelo «host» en 2v2 × 4 (tools/hosttest.js mide además la corrección pintada)
    console.log('== (h) modelo host (js/nethost.js) en 2v2 con 4 humanos, estrella 40-120 ms, ±10 ms, 2 % de pérdida ==');
    const HT = require('./hosttest.js');
    const R = HT.run({ n: 4, fmt: '2v2', rtt: k => 40 + 40 * (k - 1), jit: 10, loss: 2, seed: 33, secs: QUICK ? 60 : 0, points: 15, H: { load, mulberry, pct, check } });
    HT.summary(R, 'host4:', !QUICK);
  }
  console.log((fails ? 'FALLO: ' + fails + ' de ' + (fails + oks) : 'net4test OK: ' + oks + ' comprobaciones') + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  return fails ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { load, makeTopo, probe, runMatch, cmpHashes, golden, report, check, ADAPTERS, optsN, Probe, mulberry, pct, counts: () => ({ fails, oks }) };
