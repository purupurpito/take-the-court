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
 * AMPLIAR (P5): añade el adaptador 'host6' a require('./net4test.js').ADAPTERS (peers: 12; make: la sesión de js/nethost.js para la
 *   máquina i; slotOf(i) = su hueco) y una comprobación de marcador y eventos iguales en las 12 (R.st[i].pts ya guarda los puntos confirmados).
 * Uso: node tools/net12test.js [--quick] [--secs 60] [--bundle 220] [--model precisa2|fluida2]   (código 1 si falla)
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
  const { fails, oks } = H.counts();
  console.log((fails ? 'FALLO: ' + fails + ' de ' + (fails + oks) : 'net12test OK: ' + oks + ' comprobaciones') + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  return fails ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { main };
