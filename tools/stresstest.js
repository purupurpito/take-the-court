#!/usr/bin/env node
/* TAKE THE COURT — tools/stresstest.js  (sprint online-multi, STRESS: matriz de red dura para el online de varios)
 * Corre los tres modelos del online de varios en Node (arneses de tools/net4test.js y tools/hosttest.js) con redes malas:
 *   modelos: precisaN (2v2 con 4 humanos, Precisa-N), host6 (6v6 con 12 humanos, modelo anfitrión), coop (Precisa-N, 2 humanos en el
 *            mismo equipo contra la IA, el cable de la Carrera coop)
 *   redes:   r60 / r150 / r250 (RTT con el anfitrión, ±40 ms de jitter, 5 % de pérdida aleatoria), burst (150 ms ±15, 2 %, y cortes de
 *            300 ms cada ~10 s en cada enlace por su cuenta), asym (un invitado a 250 ms, los demás a 40, ±15, 2 %), cpu4 (150 ms ±15,
 *            2 %, el invitado 1 en un móvil con la CPU ×4: frame = render 8 ms + sesión × 4; si no cabe, pierde vsyncs), burstcpu (las dos)
 * Métricas por celda: esperas (frames en 'waiting' y micro-esperas en ms), rollback p99 (Precisa-N), saltos > 0,5 m de jugadores y del
 * balón (Precisa-N: corrección de la partida predicha antes del suavizado de main.js; host: lo que pinta nethost, jugadores de los demás
 * y balón), plazas que pasa a la IA, desincronías y reparaciones (huellas distintas, mismatches, resyncs; host: fotos), puntos iguales en
 * todas las máquinas y si el partido acaba.
 *          asym165 / asym240 (un invitado a 300 ms, el anfitrión a 165 / 240 Hz), r250h240 (r250 con el anfitrión a 240 Hz)
 * Uso: node tools/stresstest.js [--models precisaN,host6,coop] [--nets r60,r150,r250,burst,asym,cpu4] [--secs 300] [--points 11]
 *      [--seed 3] [--json salida.json]. Sin comprobaciones de aprobado: es un banco de medida (código 1 solo si algo revienta).
 */
'use strict';
const H = require('./net4test.js'), HT = require('./hosttest.js');
const { runMatch, optsN, cmpHashes, pct } = H;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const argv = process.argv, arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;

/** Redes de la matriz: rtt(k) del tramo invitado k ↔ anfitrión, jit, loss, burst (cortes de 300 ms cada ~10 s), cpu (máquina → ×). */
const NETS = {
  r60: { rtt: () => 60, jit: 40, loss: 5 },
  r150: { rtt: () => 150, jit: 40, loss: 5 },
  r250: { rtt: () => 250, jit: 40, loss: 5 },
  burst: { rtt: () => 150, jit: 15, loss: 2, burst: true },
  asym: { rtt: k => k === 1 ? 250 : 40, jit: 15, loss: 2 },
  cpu4: { rtt: () => 150, jit: 15, loss: 2, cpu: k => k === 1 ? 4 : 0 },
  burstcpu: { rtt: () => 150, jit: 15, loss: 2, burst: true, cpu: k => k === 1 ? 4 : 0 },   // (lo peor junto: cortes y el móvil lento)
  // (anfitrión en una pantalla rápida —165 / 240 Hz— y un invitado a 300 ms: la cuenta de la conexión lenta no debe sumar el redondeo
  //  de los tics por frame; la plaza lenta NO pasa a la IA si la partida no se frena; antes del arreglo, asym240 la pasaba)
  asym165: { rtt: k => k === 1 ? 300 : 40, jit: 15, loss: 2, hostHz: 165 },
  asym240: { rtt: k => k === 1 ? 300 : 40, jit: 15, loss: 2, hostHz: 240 },
  r250h240: { rtt: () => 250, jit: 40, loss: 5, hostHz: 240 }
};

/** Cortes a ráfagas: cada enlace invitado k se corta 300 ms cada 8-12 s (fase propia). */
function burster(n, seed) {
  const rnd = H.mulberry(seed * 977 + 13), nextAt = []; for (let k = 1; k < n; k++) nextAt[k] = 3000 + rnd() * 10000;
  let cuts = 0;
  return { fn(T, M) { for (let k = 1; k < n; k++) if (T >= nextAt[k]) { M.down(300, k); nextAt[k] = T + 8000 + rnd() * 4000; cuts++; } }, cuts: () => cuts };
}

/** Continuidad de los jugadores que no son el tuyo en la partida que se pinta (host: s.g): desvío de seguir con su velocidad. */
function plCont(x, g, mine, T) {
  const live = g && g.mode === 'rally';
  const cur = live ? { T, r: g.fl ? g.fl.r : -1, pl: g.players.map(p => p === mine ? null : [p.x, p.y, p.vx, p.vy]) } : null;
  const P = x.plPrev;
  if (cur && P && P.r === cur.r && T - P.T < 80) {
    const dt = (T - P.T) / 1000;
    for (let i = 0; i < cur.pl.length; i++) {
      const a = P.pl[i], b = cur.pl[i]; if (!a || !b) continue;
      const d = Math.min(Math.hypot(b[0] - a[0] - a[2] * dt, b[1] - a[1] - a[3] * dt), Math.hypot(b[0] - a[0] - b[2] * dt, b[1] - a[1] - b[3] * dt));
      x.pj.push(d);
    }
  }
  x.plPrev = cur;
}

const S4 = [{ team: 0 }, { team: 1 }, { team: 0 }, { team: 1 }], SC = [{ team: 0 }, { team: 0 }];
function ptsAgree(st, idx) {
  const ref = st[0].pts; let bad = 0, miss = 0;
  for (const i of idx) { if (!i) continue; const a = st[i].pts, m = Math.min(a.length, ref.length); if (a.slice(0, m).join() !== ref.slice(0, m).join()) bad++; miss = Math.max(miss, ref.length - a.length); }
  return { n: ref.length, bad, miss };
}

/** Precisa-N (2v2 × 4 o coop de 2). */
function runN(model, net, o) {
  const seats = model === 'coop' ? SC : S4, n = seats.length, bu = net.burst ? burster(n, o.seed) : null;
  const cfg = { n, topo: 'star', relay: false, model: 'precisaN', seats, rtt: net.rtt, jit: net.jit, loss: net.loss, seed: o.seed, secs: o.secs,
    opts: optsN(o.seed, seats, { coop: model === 'coop', points: o.points }), visible: true,
    script: bu ? (T, X) => bu.fn(T, X.M) : undefined };
  if (net.cpu) Object.assign(cfg, { cpuOf: net.cpu, renderMs: 8, stepUs: 20, copyUs: 130 });
  if (net.hostHz) cfg.frameOf = i => i === 0 ? 1000 / net.hostHz : 16.667;   // (el anfitrión a hostHz, los invitados a 60 Hz)
  const t0 = Date.now(), R = runMatch(cfg);
  if (R.err) return { err: String(R.err.stack).split('\n').slice(0, 3).join(' | ') };
  const st = R.st, S = R.S, mins = R.T / 60000, G = [...Array(n).keys()].slice(1);
  const depth = []; for (const i of G) for (const d in st[i].depth) for (let c = 0; c < st[i].depth[d]; c++) depth.push(+d);
  const pj = [].concat(...G.map(i => st[i].pj)), bj = [].concat(...G.map(i => st[i].bj || []));
  const hc = cmpHashes(R), pa = ptsAgree(st, [...Array(n).keys()]);
  return {
    wall: r1((Date.now() - t0) / 1000), simS: r1(R.T / 1000),
    waitFr: st.reduce((a, x) => a + x.wait, 0), waitMax: Math.max(...st.map(x => x.wait)), stallMs: Math.round(Math.max(...st.map(x => x.stallMs))),
    rbP99: pct(depth, 0.99), rbMax: Math.max(...S.map(s => s.stats.maxDepth | 0)),
    plBig: pj.filter(d => d > 0.5).length, plBigMin: r1(pj.filter(d => d > 0.5).length / mins / G.length), plP99: r2(pct(pj, 0.99)),
    bBig: bj.filter(d => d > 0.5).length, bBigMin: r1(bj.filter(d => d > 0.5).length / mins / G.length),
    ai: S[0].stats.seatAI | 0, slow: (S[0].slowN || []).reduce((a, b) => a + b, 0),
    desync: hc ? hc.bad : -1, mism: S.reduce((a, s) => a + (s.mismatches | 0), 0), resync: S.reduce((a, s) => a + (s.stats.resyncs | 0), 0),
    pts: pa.n, ptsOk: pa.bad === 0, done: S.every(s => s.status === 'over'), miss: st.reduce((a, x) => a + (x.miss | 0), 0),
    cuts: bu ? bu.cuts() : 0, delay: S[0].delayTo
  };
}

/** Modelo anfitrión, 6v6 con 12 humanos. */
function runH(net, o) {
  const n = 12, bu = net.burst ? burster(n, o.seed) : null;
  const ext = []; for (let i = 0; i < n; i++) ext.push({ pj: [], plPrev: null });
  let aiOn = 0; const aiPrev = [];
  const cfg = { n, fmt: '6v6', rtt: net.rtt, jit: net.jit, loss: net.loss, seed: o.seed, secs: o.secs, points: o.points,
    cpuOf: net.cpu, renderMs: 8,
    script(T, X) {
      if (bu) bu.fn(T, X.M);
      const s = X.S[X.k];
      if (s && s.g && (s.status === 'playing' || s.status === 'over')) { const g = s.g, h = g.hum && g.hum[s.seat]; plCont(ext[X.k], g, h && !h.ai ? h.p : null, T); }
      const h0 = X.S[0].g; if (X.k === 0 && h0 && h0.hum) for (let q = 1; q < n; q++) { const a = !!h0.hum[q].ai; if (a && aiPrev[q] === false) aiOn++; aiPrev[q] = a; }
    } };
  const t0 = Date.now(), R = HT.run(cfg);
  if (R.err) return { err: String(R.err.stack).split('\n').slice(0, 3).join(' | ') };
  const st = R.st, S = R.S, mins = R.T / 60000, G = [...Array(n).keys()].slice(1);
  const pj = [].concat(...G.map(i => ext[i].pj)), oC = [].concat(...G.map(i => st[i].oC));
  const live = [...Array(n).keys()].filter(i => i === 0 || S[i].status !== 'ended'), pa = ptsAgree(st, live);
  const gs = G.map(i => S[i].hstats);
  return {
    wall: r1((Date.now() - t0) / 1000), simS: r1(R.T / 1000),
    waitFr: st.reduce((a, x) => a + (x.status.waiting || 0), 0), waitMax: Math.max(...st.map(x => x.status.waiting || 0)), stallMs: 0,
    rbP99: '—', rbMax: '—',
    plBig: pj.filter(d => d > 0.5).length, plBigMin: r1(pj.filter(d => d > 0.5).length / mins / G.length), plP99: r2(pct(pj, 0.99)),
    bBig: G.reduce((a, i) => a + st[i].bBig.length, 0), bBigMin: r1(G.reduce((a, i) => a + st[i].bBig.length, 0) / mins / G.length), bHost: st[0].bBig.length,
    bMax: r2(Math.max(0, ...[].concat(...G.map(i => st[i].bBig)))), own: oC.filter(d => d > 0.5).length,
    ai: aiOn, desync: '—', mism: S[0].hstats.fsOut, resync: gs.reduce((a, h) => a + h.fsIn, 0), tcRej: S[0].hstats.tcRej, tcLost: gs.reduce((a, h) => a + h.tcLost, 0),
    pts: pa.n, ptsOk: pa.bad === 0 && pa.miss <= 1, done: live.every(i => S[i].status === 'over'), ended: S.filter(s => s.status === 'ended').length,
    miss: st.reduce((a, x) => a + (x.miss | 0), 0), cuts: bu ? bu.cuts() : 0
  };
}

function main() {
  const models = String(arg('--models', 'precisaN,host6,coop')).split(','), nets = String(arg('--nets', 'r60,r150,r250,burst,asym,cpu4')).split(',');
  const o = { secs: +arg('--secs', 300), points: +arg('--points', 11), seed: +arg('--seed', 3) };
  const out = [], T0 = Date.now(); let bad = 0;
  for (const m of models) for (const nk of nets) {
    const net = NETS[nk]; if (!net) { console.log('red desconocida ' + nk); continue; }
    const r = m === 'host6' ? runH(net, o) : runN(m, net, o);
    r.model = m; r.net = nk; out.push(r);
    if (r.err) { bad++; console.log(m + ' ' + nk + ' EXCEPCIÓN ' + r.err); continue; }
    console.log([m.padEnd(8), nk.padEnd(5), 'sim ' + r.simS + ' s (' + r.wall + ' s)', 'esperas ' + r.waitFr + ' fr (máx ' + r.waitMax + ', micro ' + r.stallMs + ' ms)',
      'rb p99 ' + r.rbP99 + ' máx ' + r.rbMax, 'jug>0,5 ' + r.plBig + ' (' + r.plBigMin + '/min/inv, p99 ' + r.plP99 + ')',
      'balón>0,5 ' + r.bBig + ' (' + r.bBigMin + '/min/inv' + (r.bHost != null ? ', anf ' + r.bHost + ', máx ' + r.bMax + ', propio ' + r.own : '') + ')',
      'IA ' + r.ai + (r.slow ? ' (lentas ' + r.slow + ')' : ''), (r.tcRej != null ? 'fotos ' + r.mism + ' (aplicadas ' + r.resync + ') rechazos ' + r.tcRej + ' perdidos ' + r.tcLost : 'desync ' + r.desync + ' mism ' + r.mism + ' resync ' + r.resync),
      'puntos ' + r.pts + (r.ptsOk ? ' iguales' : ' DISTINTOS'), r.done ? 'acaba' : 'NO acaba', 'vsync perdidas ' + r.miss + (r.cuts ? ' · cortes ' + r.cuts : '') + (r.ended ? ' · ended ' + r.ended : '')].join(' · '));
  }
  if (arg('--json')) require('fs').writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
  console.log('stresstest: ' + out.length + ' celdas, ' + ((Date.now() - T0) / 1000).toFixed(1) + ' s');
  return bad ? 1 : 0;
}
if (require.main === module) process.exit(main());
module.exports = { NETS, runN, runH };
