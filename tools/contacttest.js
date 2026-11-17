#!/usr/bin/env node
/* MAKE THE CUT — tools/contacttest.js (owner: players)
 * S3-C1 §1.1: holgura mano/antebrazo-balón en cada contacto (hit y block) de partidos autopilot reales (DevTools, tools/cdp.js).
 * Porta la sonda c1probe/contact.js: la página avanza la sim a mano UN paso por frame (1/120 s, como ?slow=0.5 en el juego) y llama
 * a VB.Players.update en cada paso. En cada frame guarda, por jugador, la distancia del centro de la manopla (muñeca + 0,115·escala
 * en la dirección del antebrazo) a la superficie del balón dibujado y la del segmento codo-muñeca. En cada contacto toma el mínimo
 * entre 0,12 s antes y 4 frames después («holgura»: 0 = toca, < 0 = dentro, > 0 = no llega). En los toques de antebrazos
 * (pass/free que no son por arriba) vale el antebrazo o la palma; en el resto, la palma.
 * Umbrales (S3-C1 §3, sobre el total de las partidas): mediana con n >= MIN_N (3); p90 con n >= MIN_N90 (10: con menos, el p90 es el
 * máximo de un puñado de toques raros como pass/shank, que es un toque malo por definición):
 *   - mediana de cada tipo en [-0,03, +0,05] y p90 <= 0,08;
 *   - bloqueo touch/tool/soft: p90 <= 0,10 (en vez de 0,08);
 *   - pass/forearm: < 10 % por debajo de -0,06.
 * Informa además del estirón máximo del brazo (armS) en los contactos frente a ARM_STRETCH (S3-C1: «1,9 frente a 1,405»).
 * Uso: node tools/contacttest.js [s=180] [semillas=7,11] [mapas=hall,beach] [formato=2v2|6v6] [--json=fichero]
 * Sale con 1 si algo falla. Imprime "TODO OK".
 */
'use strict';
const fs = require('fs');
const CDP = require('./cdp.js');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
const [SECS = '180', SEEDS = '7,11', MAPS = 'hall,beach', FMT = '2v2'] = args;
const JSON_OUT = (flags.find(f => f.startsWith('--json=')) || '').slice(7);
const MIN_N = 3, MIN_N90 = 10, MED_LO = -0.03, MED_HI = 0.05, P90 = 0.08, P90_BLK = 0.10, FORE_LO = -0.06, FORE_FRAC = 0.10;

function page(SECS, SEED, VENUE, FMT) {
  var ctx = VB.ctx, S = VB.Sim, P = VB.Players, T = ctx.THREE, BR = VB.C.BR, orig = P.__orig || P.update; P.__orig = orig;
  P.update = function () { if (window.__on) return orig.apply(P, arguments); };   // el bucle de main.js no pinta mientras medimos
  ctx.frozen = true;
  P.setVenue(VENUE === 'beach' ? 'beach' : 'hall');
  var o = { demo: false, autopilot: true, seed: SEED, difficulty: 'hard', venue: VENUE === 'beach' ? 'beach' : undefined };
  if (FMT === '6v6') o.format = '6v6';
  var g = S.createGame(o); ctx.game = g;
  ['Arena', 'FX', 'Players'].forEach(function (m) { try { VB[m].onGameStart && VB[m].onGameStart(g); } catch (e) { } });
  var W = new T.Vector3(), E = new T.Vector3(), D = new T.Vector3(), A = new T.Vector3(), B = new T.Vector3();
  var RING = 16, ring = [], ri = 0;
  for (var i = 0; i < RING; i++) ring.push({ t: -1, h: {} });
  function palm(r, k, out) { r.hand[k].getWorldPosition(W); r.el[k].getWorldPosition(E); D.subVectors(W, E).normalize(); return out.copy(W).addScaledVector(D, 0.115 * r.scale); }
  function segDist(px, py, pz, r, k) {
    r.hand[k].getWorldPosition(W); r.el[k].getWorldPosition(E);
    var dx = W.x - E.x, dy = W.y - E.y, dz = W.z - E.z, L = dx * dx + dy * dy + dz * dz, u = L > 0 ? ((px - E.x) * dx + (py - E.y) * dy + (pz - E.z) * dz) / L : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    var qx = E.x + dx * u - px, qy = E.y + dy * u - py, qz = E.z + dz * u - pz; return Math.sqrt(qx * qx + qy * qy + qz * qz);
  }
  function sample() {
    var s = ring[ri]; ri = (ri + 1) % RING; s.t = g.time;
    var b = g.ball, bx = b.x, by = b.z, bz = -b.y;
    for (var i = 0; i < g.players.length; i++) {
      var p = g.players[i], r = P.rigOf(p); if (!r) continue;
      var h = s.h[p.id] || (s.h[p.id] = {});
      palm(r, 0, A); palm(r, 1, B);
      h.p0 = Math.hypot(A.x - bx, A.y - by, A.z - bz) - BR; h.p1 = Math.hypot(B.x - bx, B.y - by, B.z - bz) - BR;
      h.f0 = segDist(bx, by, bz, r, 0) - BR; h.f1 = segDist(bx, by, bz, r, 1) - BR;
      h.mode = r.aMode; h.aE = r.aE; h.aw = Math.max(r.aw0, r.aw1); h.sa = Math.max(r.armS0, r.armS1); h.ok = true;
    }
  }
  function upd(q, f) {
    var h = f.h[q.id]; if (!h || !h.ok) return;
    var pm = Math.min(h.p0, h.p1), fm = Math.min(h.f0, h.f1);
    var use = q.fore ? Math.min(fm, pm) : pm;
    if (use < q.best) { q.best = use; q.mode = h.mode; q.aw = h.aw; q.aE = h.aE; q.dt = f.t - q.t; }
    if (h.sa > q.sa && Math.abs(f.t - q.t) < 0.05) q.sa = h.sa;
  }
  var ev = [], pend = [], res = [], err = '', saMax = 0, saAll = 0;
  try {
    for (var st = 0; st < 120 * SECS && !g.finished; st++) {
      S.step(g, 1 / 120, null); S.drainEvents(g, ev);
      window.__on = true;
      try { orig.call(P, g, 1 / 120, ev); } finally { window.__on = false; }
      for (var j = 0; j < ev.length; j++) {
        var e = ev[j];
        if ((e.type === 'hit' || e.type === 'block') && e.player) {
          var kind = e.type === 'block' ? 'block' : e.kind, shot = e.type === 'block' ? e.result : e.shot;
          pend.push({ id: e.player.id, t: e.t != null ? e.t : g.time, n: 0, best: 9, mode: '', aw: 0, sa: 0, dt: 0, kind: kind, shot: shot,
            fore: (kind === 'pass' || kind === 'free') && shot !== 'overhead' && shot !== 'tip' && shot !== 'dive' });
        }
      }
      ev.length = 0;
      sample();
      for (var k = pend.length - 1; k >= 0; k--) {
        var q = pend[k]; q.n++;
        if (q.n === 1) { for (var m = 0; m < RING; m++) { var f = ring[m]; if (f.t < 0 || f.t < q.t - 0.12 || f.t > g.time + 1e-9) continue; upd(q, f); } }
        else upd(q, ring[(ri + RING - 1) % RING]);
        if (q.n >= 5) {
          res.push({ t: +q.t.toFixed(3), id: q.id, k: q.kind + '/' + q.shot, gap: +q.best.toFixed(3), mode: q.mode, aw: +q.aw.toFixed(2), aE: +(q.aE || 0).toFixed(3), sa: +q.sa.toFixed(3), dt: +q.dt.toFixed(3) });
          if (q.sa > saMax) saMax = q.sa;
          pend.splice(k, 1);
        }
      }
      for (var pi = 0; pi < g.players.length; pi++) { var rr = P.rigOf(g.players[pi]); if (rr) saAll = Math.max(saAll, rr.armS0, rr.armS1); }
    }
  } catch (x) { err = String(x && x.stack || x).slice(0, 400); }
  var dims = P.dims ? P.dims() : {};
  return JSON.stringify({ res: res, err: err, time: +g.time.toFixed(1), score: g.sets, saMax: saMax, saAll: saAll, STRETCH: dims.ARM_STRETCH || 0 });
}

function stats(a) {
  a = a.slice().sort((p, q) => p - q);
  return { n: a.length, med: a[a.length >> 1], p90: a[Math.min(a.length - 1, Math.floor(a.length * 0.9))], max: a[a.length - 1], min: a[0] };
}

(async () => {
  const pg = await CDP.open({ size: '640x360' });
  let bad = 0;
  const fail = (m) => { bad++; console.log('  FALLO ' + m); };
  const all = [];
  let saMax = 0, saAll = 0, STRETCH = 0;
  for (const map of MAPS.split(',')) for (const sd of SEEDS.split(',')) {
    await pg.navigate('debug=rally&quality=low&nonews=1' + (map === 'beach' ? '&map=beach' : '') + (FMT === '6v6' ? '&format=6v6' : ''));
    await CDP.sleep(2500);
    const t0 = Date.now();
    const raw = await pg.evalJs('(' + page.toString() + `)(${+SECS}, ${+sd}, '${map}', '${FMT}')`);
    let o; try { o = JSON.parse(raw); } catch (e) { fail(`[${map} ${sd}] respuesta: ` + String(raw).slice(0, 200)); continue; }
    if (o.err) fail(`[${map} ${sd}] excepción: ${o.err}`);
    console.log(`[${map} ${FMT} semilla ${sd}] ${o.time} s de juego, ${o.res.length} contactos, sets ${JSON.stringify(o.score)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    for (const x of o.res) { x.map = map; x.sd = +sd; all.push(x); }
    saMax = Math.max(saMax, o.saMax); saAll = Math.max(saAll, o.saAll); STRETCH = o.STRETCH;
  }
  const by = {};
  for (const x of all) (by[x.k] = by[x.k] || []).push(x);
  console.log('tipo                  n   mediana   p90     máx    modos');
  for (const k of Object.keys(by).sort()) {
    const L = by[k], s = stats(L.map(x => x.gap)), modes = [...new Set(L.map(x => x.mode || '-'))].join(',');
    const blkSoft = k === 'block/touch' || k === 'block/tool' || k === 'block/soft';
    const lim = blkSoft ? P90_BLK : P90;
    let tag = '';
    if (s.n >= MIN_N) {
      if (s.med < MED_LO || s.med > MED_HI) tag += ` mediana fuera de [${MED_LO}, ${MED_HI}]`;
      if (s.p90 > lim && (s.n >= MIN_N90 || blkSoft)) tag += ` p90 > ${lim}`;
    }
    if (k === 'pass/forearm') {
      const lo = L.filter(x => x.gap < FORE_LO).length / L.length;
      if (lo >= FORE_FRAC) tag += ` ${(lo * 100).toFixed(0)} % por debajo de ${FORE_LO}`;
      else console.log(`  (pass/forearm por debajo de ${FORE_LO}: ${(lo * 100).toFixed(0)} %)`);
    }
    console.log(k.padEnd(20) + String(s.n).padStart(4) + s.med.toFixed(3).padStart(9) + s.p90.toFixed(3).padStart(8) + s.max.toFixed(3).padStart(8) + '   ' + modes + (s.n < MIN_N ? '  (n < ' + MIN_N + ', sin umbral)' : s.n < MIN_N90 && !blkSoft ? '  (n < ' + MIN_N90 + ': p90 = máx, solo mediana)' : ''));
    if (tag) fail(k + ':' + tag);
  }
  const blk = all.filter(x => /^block\/(touch|tool|soft)$/.test(x.k));
  if (blk.length) { const s = stats(blk.map(x => x.gap)); console.log(`bloqueo touch+tool+soft juntos: n=${s.n} mediana=${s.med.toFixed(3)} p90=${s.p90.toFixed(3)}`); if (s.p90 > P90_BLK) fail(`bloqueo touch/tool/soft juntos p90 ${s.p90.toFixed(3)} > ${P90_BLK}`); }
  console.log(`armS máximo en un contacto: ${saMax.toFixed(3)} · en cualquier frame: ${saAll.toFixed(3)} · ARM_STRETCH (players) ${STRETCH}`);
  if (saAll > STRETCH + 1e-6) fail(`armS ${saAll.toFixed(3)} por encima de ARM_STRETCH ${STRETCH}`);
  else console.log(`  ok armS <= ARM_STRETCH (el «1,9» de la sonda es el ARM_STRETCH del muñeco, d.STRETCH de VB.Doll.dims(); el 1,405 de notes/players.md es del atleta TAJO)`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(all));
  if (pg.errors.length) fail('errores JS: ' + pg.errors.slice(0, 3).join(' | '));
  pg.close();
  console.log(bad ? `== ${bad} FALLOS ==` : 'TODO OK');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
