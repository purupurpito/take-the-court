#!/usr/bin/env node
/* TAKE THE COURT — tools/net12test.js  (owner: net, P0 del sprint online-multi; notes/online-multi-brief.md §3 A y §7)
 * Banco de pruebas en Node para el online 6v6 a 12 PARES. Usa el arnés de tools/net4test.js (contextos vm, memMesh/memStar, sondas,
 * adaptadores de partido) con n = 12. Hasta que existan el modelo de plazas (P1) y el modelo del 6v6 online (P5, js/nethost.js),
 * el partido es el de 2 huecos y las otras 10 máquinas hacen de sonda; las sondas ya imitan el tráfico del modelo A recomendado
 * (estrella con autoridad del anfitrión): cada invitado manda su entrada (31 B) por frame al anfitrión y el anfitrión manda a cada
 * invitado un paquete de 30 Hz del tamaño del paquete de las 12 poses + balón (BUNDLE bytes; cámbialo cuando P5 fije el formato).
 *   (a) estrella de 12 con reenvío y malla de 12: latencia de ida medida = la de la ruta, pérdida ≈ la pedida, 'ctl' sin pérdidas y en orden
 *   (b) tráfico del modelo A: subida y paquetes por segundo del anfitrión, bajada de un invitado (presupuesto del brief: ~100-110 KB/s
 *       de subida del anfitrión con 11 invitados, contando cabeceras; aquí solo la carga útil)
 *   (c) partido Precisa de 2 huecos sobre los enlaces 0↔1 de la estrella de 12 con 10 sondas de tráfico A a la vez: huellas iguales y
 *       prueba de oro (que el resto de enlaces no estorba), métricas por par
 *   (h) P5: el modelo «host» (js/nethost.js) de verdad, 12 humanos con 30-200 ms de RTT (tools/hosttest.js): CPU del anfitrión por tic,
 *       bytes/s por enlace, corrección pintada de poses y balón, saltos del balón, toques aceptados y puntos iguales en las 12
 *   (i) P5: el adaptador 'host6' de net4test (runMatch) sobre la estrella de 12: marcador confirmado igual en las 12 (--no-host: sin h/i)
 *   (d) Precisa-N (P2) con 12 plazas en 6v6 (estrella, el anfitrión reenvía): huellas, prueba de oro con 12 entradas por tic, marcador;
 *       solo corrección (--no-n la salta)
 * Uso: node tools/net12test.js [--quick] [--secs 60] [--bundle 220] [--model precisa2|fluida2] [--no-n]   (código 1 si falla)
 */
'use strict';
const H = require('./net4test.js');
const { probe, runMatch, cmpHashes, golden, report, check } = H;

function main() {
  const argv = process.argv, arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
  const QUICK = argv.includes('--quick'), N = 12, MODEL = arg('--model', 'precisa2');
  const SECS = +arg('--secs', QUICK ? 30 : 90), BUNDLE = +arg('--bundle', 220);
  const t0 = Date.now(), r1 = v => Math.round(v * 10) / 10;
  // RTT de cada invitado con el anfitrión: 30..140 ms (wifi buena a 4G regular)
  const rttStar = k => 30 + 10 * k;

  console.log('== (a) capa de enlaces, 12 máquinas ==');
  for (const topo of ['star', 'mesh']) {
    const R = probe({ n: N, topo, rtt: topo === 'star' ? rttStar : (i, j) => 30 + 5 * (i + j), jit: 8, loss: 3, seed: 5, secs: QUICK ? 8 : 20 });
    let worst = 0, lossBad = 0, ctlBad = 0;
    for (const p of R.pairs) {
      worst = Math.max(worst, Math.abs(p.avg - p.exp));
      const el = p.hops === 2 ? 100 * (1 - 0.97 * 0.97) : 3;
      if (Math.abs(p.loss - el) > Math.max(1.5, 400 * Math.sqrt(el / 100 * (1 - el / 100) / Math.max(1, p.sent)))) lossBad++;
      if (p.ctlBad || p.ctl < p.ctlSent - 2) ctlBad++;
    }
    check(topo + ': latencia de ida media = la de la ruta + medio frame (±3 ms), ' + R.pairs.length + ' pares dirigidos', worst < 3, { peorDesvio: r1(worst) });
    check(topo + ': pérdida en \'in\' ≈ la pedida (±4 σ)', lossBad === 0, { mal: lossBad });
    check(topo + ': \'ctl\' sin pérdidas y en orden', ctlBad === 0, { mal: ctlBad });
    const tr = R.traffic, secs = R.T / 1000; let up0 = 0, pk0 = 0, upMax = 0;
    for (let i = 0; i < N; i++) { let u = 0; for (let j = 0; j < N; j++) if (i !== j) { u += tr[i][j].bytes; if (i === 0) pk0 += tr[i][j].pk; } if (i === 0) up0 = u; else upMax = Math.max(upMax, u); }
    console.log('        ' + topo + ' (todos a todos, 31 B por frame): subida del anfitrión ' + r1(up0 / secs / 1024) + ' KB/s ' + Math.round(pk0 / secs) + ' pk/s · peor invitado ' + r1(upMax / secs / 1024) + ' KB/s');
  }

  console.log('== (b) tráfico del modelo A (estrella; invitado → anfitrión 31 B por frame; anfitrión → cada invitado ' + BUNDLE + ' B a 30 Hz) ==');
  {
    const roleA = i => i === 0 ? { size: BUNDLE, every: 2 } : { size: 31, to: [0] };
    const R = probe({ n: N, topo: 'star', rtt: rttStar, jit: 8, loss: 3, seed: 6, secs: QUICK ? 8 : 20, role: roleA, relay: false });
    const tr = R.traffic, secs = R.T / 1000; let up0 = 0, pk0 = 0;
    for (let j = 1; j < N; j++) { up0 += tr[0][j].bytes; pk0 += tr[0][j].pk; }
    const down1 = tr[0][1].bytes / secs, up1 = tr[1][0].bytes / secs;
    const g2h = R.pairs.filter(p => p.k.endsWith('>0')), h2g = R.pairs.filter(p => p.k.startsWith('0>'));
    check('modelo A: los 11 invitados oyen al anfitrión y el anfitrión a los 11', g2h.length === 11 && h2g.length === 11 && g2h.every(p => p.loss < 10) && h2g.every(p => p.loss < 10));
    check('modelo A: sin enlaces invitado↔invitado (relay:false)', R.pairs.length === 22, { pares: R.pairs.length });
    console.log('        anfitrión: subida ' + r1(up0 / secs / 1024) + ' KB/s de carga útil, ' + Math.round(pk0 / secs) + ' pk/s · invitado: bajada ' + r1(down1 / 1024) + ' KB/s, subida ' + r1(up1 / 1024) + ' KB/s' +
      ' · latencia anfitrión→invitado ' + h2g.map(p => r1(p.avg)).join('/') + ' ms');
  }

  console.log('== (c) partido ' + MODEL + ' (2 huecos) sobre la estrella de 12 (10 máquinas sin sesión) ==');
  {
    const R = runMatch({ n: N, topo: 'star', rtt: rttStar, jit: 10, loss: 3, seed: 41, secs: SECS, model: MODEL, relay: false });
    // (las sondas de runMatch mandan entre sí; sin relay en la estrella no hay enlaces entre invitados: no mandan nada ni estorban;
    //  el tráfico A de verdad lo medirá P5 con su adaptador)
    check('sin excepciones', !R.err, R.err ? String(R.err.stack).split('\n').slice(0, 3).join(' | ') : undefined);
    if (!R.err) {
      check('los que juegan llegan a jugar', R.st.slice(0, R.np).every(x => (x.status.playing || 0) > 100), R.st.slice(0, R.np).map(x => x.status));
      const c = cmpHashes(R); if (c) check('huellas de gc iguales en los ' + R.np + ' que juegan', c.n > 5 && c.bad === 0, c);
      const G = golden(R); if (G) check('PRUEBA DE ORO: offline con las entradas confirmadas = gc del anfitrión', G.checked > 5 && G.bad === 0 && G.finalOk === true, G);
      const a = R.st[0].pts, b = R.st[1].pts, m = Math.min(a.length, b.length);
      check('marcador confirmado igual en los que juegan (puntos comunes)', a.slice(0, m).join() === b.slice(0, m).join(), { puntos: [a.length, b.length] });
      report(R, 'estrella12:');
    }
  }
  if (!argv.includes('--no-n')) {
    // (d) Precisa-N (P2) con 12 plazas en 6v6: SOLO para probar que el rollback de N plazas es correcto con 12 (el 6v6 de verdad va
    //     con el modelo del anfitrión, P5: aquí la subida del anfitrión no es viable y el rollback de 6v6 cuesta demasiado en un móvil)
    console.log('== (d) Precisa-N con 12 plazas (6v6, 6 humanos por equipo), estrella, RTT 40..140 ms ±8, 2 % de pérdida: prueba de corrección ==');
    const seats = Array.from({ length: N }, (_, s) => ({ team: s % 2 }));
    const R = runMatch({ n: N, topo: 'star', relay: false, rtt: rttStar, jit: 8, loss: 2, seed: 43, secs: QUICK ? 20 : 45, model: 'precisaN', seats, opts: H.optsN(43, seats, { format: '6v6' }) });
    check('12: sin excepciones', !R.err, R.err ? String(R.err.stack).split('\n').slice(0, 3).join(' | ') : undefined);
    if (!R.err) {
      check('12: las 12 juegan 6v6 (una plaza por jugador, 6 por equipo)', R.S.every(s => s.gc.size === 6 && s.gc.hum.length === 12 && (s.status === 'playing' || s.status === 'waiting')) &&
        [0, 1].every(t => R.S[0].gc.hum.filter(h => h.team === t).length === 6), R.S.map(s => s.status));
      const c = cmpHashes(R); check('12: huellas de gc iguales en las 12', c.n > 5 && c.bad === 0, c);
      const G = golden(R); check('12: PRUEBA DE ORO (12 entradas por tic)', G.checked > 5 && G.bad === 0 && G.finalOk === true, G);
      check('12: sin reparaciones ni plazas a la IA', R.S.every(s => !s.mismatches && !s.stats.seatAI), R.S.map(s => [s.mismatches, s.stats.seatAI]));
      const m = Math.min(...R.st.map(x => x.pts.length));
      check('12: marcador confirmado igual en las 12', R.st.every(x => x.pts.slice(0, m).join() === R.st[0].pts.slice(0, m).join()), { puntos: m });
      report(R, '12:');
      const tr = R.M.traffic(), secs = R.T / 1000; let up = 0; for (let j = 1; j < N; j++) up += tr[0][j].bytes;
      console.log('        12: subida del anfitrión ' + r1(up / secs / 1024) + ' KB/s de carga útil (Precisa-N no sirve para 12 en producción: modelo del anfitrión, P5)');
    }
  }
  if (!argv.includes('--no-host')) {
    // P5: el modelo del 6v6 online de verdad (js/nethost.js): 12 humanos con 30-200 ms de RTT, variación y 2 % de pérdida
    console.log('== (h) modelo host (js/nethost.js): 6v6 con 12 humanos, estrella 30-200 ms, ±10 ms, 2 % de pérdida ==');
    const HT = require('./hosttest.js');
    const R = HT.run({ n: N, fmt: '6v6', rtt: k => 30 + (170 * (k - 1)) / (N - 2), jit: 10, loss: 2, seed: 41, secs: QUICK ? 90 : 2 * SECS, points: 15 });
    HT.summary(R, 'host6:', false);
    console.log('== (i) host6 con el adaptador de net4test (runMatch, el mismo bucle que los demás modelos) ==');
    const R2 = runMatch({ n: N, topo: 'star', rtt: rttStar, jit: 10, loss: 2, seed: 43, secs: QUICK ? 40 : SECS, model: 'host6', relay: false });
    check('host6: sin excepciones', !R2.err, R2.err ? String(R2.err.stack).split('\n').slice(0, 3).join(' | ') : undefined);
    if (!R2.err) {
      check('host6: las 12 llegan a jugar', R2.st.every(x => (x.status.playing || 0) > 100), R2.st.map(x => x.status.playing || 0).join(','));
      const ref = R2.st[0].pts; let bad = 0;
      for (let i = 1; i < N; i++) { const a = R2.st[i].pts, m = Math.min(a.length, ref.length); if (a.slice(0, m).join() !== ref.slice(0, m).join() || ref.length - a.length > 1) bad++; }
      check('host6: marcador confirmado igual en las 12 (' + ref.length + ' puntos)', bad === 0 && ref.length >= 1, { distintas: bad });
      report(R2, 'host6:');
    }
  }
  const { fails, oks } = H.counts();
  console.log((fails ? 'FALLO: ' + fails + ' de ' + (fails + oks) : 'net12test OK: ' + oks + ' comprobaciones') + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  return fails ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { main };
