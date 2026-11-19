#!/usr/bin/env node
/* MAKE THE CUT — tools/arbitrotest.js (owner: sim · Ambiente de Carrera, P3)
 * Prueba de VB.Arbitro (js/arbitro.js): escala FIVB de sanciones, determinismo, detección de disputas y FRECUENCIAS medidas con
 * partidos reales de la sim (autopilot con el error arbitral de cada competición de la Carrera, mitad playa y mitad pista 6v6).
 * En cada partido se alimentan a la vez tres árbitros con los mismos puntos: jugador que siempre «Deja», jugador que siempre
 * protesta y «Tranquilo» (deja siempre). Objetivos (notes/ambiente.md §2C):
 *   deja siempre: tarjetas a tu equipo ≈ 0,08 por partido (casi todas a compañeros/entrenador), a ti ≈ 0; rojas ≈ 1 cada 40
 *   protesta siempre: amarilla cada 3-4 partidos, roja cada 12-40 (como mucho 1 elección por partido desde la crítica del 18-nov)
 *   rival (IA): tarjetas ≈ 0,08 por partido, roja ≈ 1 cada 50; «Tranquilo»: la mitad de protestas automáticas.
 * Uso: node tools/arbitrotest.js [partidos=120] [semilla=1]   (solo node; sale ≠ 0 si algo falla)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const N = Math.max(8, +(process.argv[2] || 120)), SEED0 = +(process.argv[3] || 1);
const ctx = { console, Math, Date }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/arbitro.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const VB = ctx.VB, S = VB.Sim, A = VB.Arbitro, DT = 1 / VB.C.SIM_HZ;
let failures = 0; const fail = m => { failures++; console.error('FALLO:', m); };
const REF = {
  low: { p1: 0.55, p2: 0.40, p3: 0.22, d3: 0.25, chal: 0, judges: false }, mid: { p1: 0.45, p2: 0.25, p3: 0.12, d3: 0.15, chal: 0, judges: false },
  high: { p1: 0.20, p2: 0.08, p3: 0.02, d3: 0.10, chal: 0, judges: true }, top: { p1: 0.20, p2: 0.08, p3: 0.02, d3: 0.10, chal: 2, judges: true } };
const LV = ['low', 'mid', 'high', 'top'];

// ---------------------------------------------------------------- 1) reglas puntuales
{
  const f0 = failures, P = { kind: 'line', team: 0, strength: 0.8, wrong: false, canRed: true };
  // escala: nunca dos amarillas al mismo equipo; roja solo con amarilla previa (o retraso); sin canRed nunca roja
  for (let s = 1; s <= 400; s++) {
    const st = A.create({ seed: s, hall: s % 2 === 0, level: LV[s % 4], heat: (s % 10) / 10 });
    let y = 0, reds = 0, n = 0;
    for (let i = 0; i < 12; i++) {
      const D = Object.assign({}, P, { n: ++n, id: n }), cr = i % 3 !== 0;
      const R = A.protest(st, D, { pid: 1 + (i % 2), role: 'player', num: 7, name: 'Ari' }, i % 2 === 0, cr);
      if (R.res === 'yellow') { y++; if (y > 1) fail('dos amarillas al mismo equipo (semilla ' + s + ')'); }
      if (R.res === 'red' || R.res === 'expel') { reds++; if (!cr) fail('roja sin canRed'); if (!y) fail('roja sin amarilla previa'); }
      if (R.res === 'expel' && s % 2 === 1) fail('expulsión en playa');
      if ((R.res === 'red') !== (R.penalty === 0)) fail('penalty no casa con la roja ' + JSON.stringify(R));
      if (R.card && (R.card.team !== 0 || R.card.num !== 7 || R.card.name !== 'Ari' || R.card.reason !== 'protesta')) fail('tarjeta mal rellena ' + JSON.stringify(R.card));
    }
    const ss = A.state(st); if (ss.yellow[1] || ss.red[1] || ss.verbal[1]) fail('sanción al equipo que no protesta');
  }
  // otra protesta del mismo equipo en el mismo punto: mala conducta reiterada (más severa), nunca «retraso» (el retraso castiga demorar
  // el juego: crítica de juego del 18-nov). Medido: con la segunda protesta del punto salen más tarjetas que con la primera
  { let c1 = 0, c2 = 0;
    for (let s = 1; s <= 600; s++) {
      const a = A.create({ seed: s, hall: true }), b = A.create({ seed: s, hall: true });
      const R1 = A.protest(a, Object.assign({}, P, { n: 5, id: 1 }), { pid: -1, role: 'coach' }, false, true);
      A.protest(b, Object.assign({}, P, { n: 5, id: 1 }), { pid: 2, role: 'captain' }, false, true);
      b.verbal[0] = 0; b.yellow[0] = false; b.byPid = {};
      const R2 = A.protest(b, Object.assign({}, P, { n: 5, id: 1 }), { pid: -1, role: 'coach' }, false, true);
      if (/^delay/.test(R1.res) || /^delay/.test(R2.res)) fail('retraso por protestar ' + JSON.stringify([R1, R2]));
      if (R1.card) c1++; if (R2.card) c2++;
    }
    if (!(c2 > c1)) fail('la segunda protesta del punto no es más severa ' + c1 + ' / ' + c2); }
  // disputas: falta de saque nunca; tocado, red, dobles sí; bote lejos no; bote al límite y mal pitado sí
  { const D = A._disputeOf, g = { call: null };
    if (D({ type: 'point', reason: 'serve', signal: 'delay8' }, g) || D({ type: 'point', reason: 'in', signal: 'serveFault' }, g)) fail('disputa en falta de saque');
    if (!D({ reason: 'out', signal: 'touched', lastKind: 'block' }, g) || !D({ reason: 'net', signal: 'net' }, g) || !D({ reason: 'double', signal: 'double' }, g)) fail('disputa de tocado / red / dobles');
    // «tocado» solo en el bloqueo: la recepción de un ace o la defensa propia que se van fuera no se discuten
    if (D({ reason: 'out', signal: 'touched', lastKind: 'pass' }, g) || D({ reason: 'out', signal: 'touched', lastKind: 'dig' }, g)) fail('disputa de tocado sin bloqueo');
    { const q = D({ reason: 'out', signal: 'out', t: 2 }, { call: { dist: 0.02, wrong: false, t: 2, calledIn: false } }), r = D({ reason: 'in', signal: 'in', t: 2 }, { call: { dist: 0.02, wrong: false, t: 2, calledIn: true } });
      if (!q || q.calledIn !== false || !r || r.calledIn !== true) fail('calledIn de la disputa de bote ' + JSON.stringify([q, r])); }
    if (D({ reason: 'in', signal: 'in', t: 1 }, { call: { dist: 0.5, wrong: false, t: 1 } })) fail('disputa con bote lejos de la línea');
    const a = D({ reason: 'in', signal: 'in', t: 1 }, { call: { dist: 0.03, wrong: false, t: 1 } }), b = D({ reason: 'in', signal: 'in', t: 1 }, { call: { dist: 0.4, wrong: true, t: 1 } });
    if (!a || a.kind !== 'line' || !b || !b.wrong || b.strength < 0.8) fail('disputa de bote ' + JSON.stringify([a, b]));
    if (D({ reason: 'penalty', penalty: true }, g)) fail('disputa en el punto de castigo'); }
  // la oferta al jugador: como mucho 1, solo con bote ajustado o mal pitado, nunca con challenge, nunca en «Tranquilo»; también con «tocado» en el bloqueo
  { const st = A.create({ seed: 4, hall: false, mode: 'full', meTeam: 0, mePid: 1 }), stc = A.create({ seed: 4, mode: 'calm' }), stt = A.create({ seed: 4, mode: 'full', meTeam: 0, mePid: 1 });
    let offers = 0, offc = 0, offt = 0;
    for (let i = 0; i < 60; i++) { const e = { type: 'point', team: 1, reason: 'in', signal: 'in', t: i }, gg = { players: [], call: { dist: 0.03, wrong: false, t: i, calledIn: true } };
      const D = A.feed(st, e, gg); if (D && D.offer) { offers++; } const Dc = A.feed(stc, e, gg); if (Dc && Dc.offer) offc++;
      const Dt = A.feed(stt, { type: 'point', team: 1, reason: 'out', signal: 'touched', lastKind: 'block', t: i }, { players: [] }); if (Dt && Dt.offer) offt++; }
    if (offers !== 1 || offc !== 0 || offt !== 1) fail('ofertas ' + offers + ' / tranquilo ' + offc + ' / tocado ' + offt); }
  // determinismo
  { const run = () => { const st = A.create({ seed: 99, hall: true, heat: 0.7, capt: [3, 20] }); const o = [];
      for (let i = 0; i < 40; i++) { const D = A.feed(st, { type: 'point', team: i % 2, reason: 'net', signal: 'net', t: i }, { players: [{ id: 3, team: 0 }, { id: 4, team: 0 }, { id: 20, team: 1 }] });
        if (D && D.auto) o.push(A.protest(st, D, D.auto, false, true).res); }
      return o.join(','); };
    if (run() !== run()) fail('no determinista'); }
  if (failures === f0) console.log('reglas: escala FIVB, protesta repetida, disputas, ofertas y determinismo OK');
}

// ---------------------------------------------------------------- 2) frecuencias con partidos reales
function newAcc() { return { matches: 0, mine: { y: 0, r: 0, any: 0, me: 0 }, riv: { y: 0, r: 0, any: 0 }, autos: 0, offers: 0, cold: 0, disp: 0, verbal: 0, delay: 0 }; }
const ACC = { drop: newAcc(), protest: newAcc(), calm: newAcc() };
function count(acc, R, mePid) {
  if (R.res === 'verbal') acc.verbal++;
  if (!R.card) return;
  const t = R.card.team, c = R.card.color, o = t === 0 ? acc.mine : acc.riv;
  o.any++; if (c === 'yellow' || c === 'delayY') o.y++; if (c === 'red' || c === 'expel' || c === 'delayR') o.r++;
  if (c === 'delayY' || c === 'delayR') acc.delay++;
  if (t === 0 && R.card.pid === mePid) acc.mine.me++;
}
const t0 = Date.now();
for (let m = 0; m < N; m++) {
  const seed = SEED0 * 1000 + m, hall = m % 2 === 1, level = LV[(m >> 1) % 4], heat = 0.25 + 0.55 * A.hash01(seed, 7, 3);
  const g = S.createGame({ seed, autopilot: true, ref: REF[level], format: hall ? '6v6' : undefined, venue: hall ? undefined : 'beach' });
  const me = g.teams[0][0], capt = hall ? [g.teams[0].find(p => p.role === 'S').id, g.teams[1].find(p => p.role === 'S').id] : [-1, -1];
  const who = { pid: me.id, role: hall ? (me.id === capt[0] ? 'captain' : 'player') : 'player', num: me.num, name: 'Tú' };
  const sts = {}; for (const k in ACC) sts[k] = A.create({ seed, hall, level, heat, mode: k === 'calm' ? 'calm' : 'full', capt, meTeam: 0, mePid: me.id });
  const ev = [];
  for (let i = 0; i < 600 * 120 && !g.finished; i++) {
    S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev);
    for (const e of ev) {
      if (e.type !== 'point' && e.type !== 'challengeResult') continue;
      for (const k in ACC) {
        const acc = ACC[k], st = sts[k], D = A.feed(st, e, g); if (!D) continue;
        acc.disp++;
        if (D.offer) { acc.offers++;
          if (k === 'protest') count(acc, A.protest(st, D, Object.assign({}, who), true, D.canRed), me.id);
          else if (D.wrong) acc.cold++; }
        if (D.auto) { acc.autos++; count(acc, A.protest(st, D, D.auto, false, D.canRed), me.id); }
      }
    }
  }
  for (const k in ACC) ACC[k].matches++;
}
const per = (a, v) => +(v / a.matches).toFixed(3);
const rows = [];
for (const k in ACC) { const a = ACC[k];
  rows.push(`  ${k.padEnd(8)} disputas ${per(a, a.disp)}  ofertas ${per(a, a.offers)}  protestasIA ${per(a, a.autos)}  verbales ${per(a, a.verbal)}  ` +
    `tu equipo: tarjetas ${per(a, a.mine.any)} amarillas ${per(a, a.mine.y)} rojas ${per(a, a.mine.r)} a ti ${per(a, a.mine.me)}  ` +
    `rival: tarjetas ${per(a, a.riv.any)} rojas ${per(a, a.riv.r)}  retraso ${per(a, a.delay)}  cabeza fría ${per(a, a.cold)}`); }
console.log(`frecuencias (${N} partidos, ${((Date.now() - t0) / 1000).toFixed(1)} s; por partido):\n` + rows.join('\n'));
{
  const d = ACC.drop, p = ACC.protest, c = ACC.calm, band = (name, v, lo, hi) => { if (!(v >= lo && v <= hi)) fail(`${name} = ${v} fuera de [${lo}, ${hi}]`); };
  // (autopilot en los dos lados: menos «tocados» que con un humano; el circuito completo de la Carrera es la referencia, notes/ambiente.md §9.2)
  band('deja: tarjetas a tu equipo', per(d, d.mine.any), 0.005, 0.15);
  band('deja: tarjetas a ti', per(d, d.mine.me), 0, 0.02);
  band('deja: rojas a tu equipo', per(d, d.mine.r), 0, 0.05);
  band('protesta: amarillas a tu equipo', per(p, p.mine.y), 0.15, 0.5);   // (≤ 1 elección por partido: amarilla cada 3-4 partidos)
  band('protesta: rojas a tu equipo', per(p, p.mine.r), 0, 0.1);       // (roja solo con amarilla previa del equipo: 1 cada 12-40)
  band('rival: tarjetas', per(d, d.riv.any), 0, 0.15);   // (IA contra IA: desde 1.15.0 hay menos disputas; la referencia es el circuito completo, notes/ambiente.md §9.2)
  band('rival: rojas', per(d, d.riv.r), 0, 0.04);
  band('tranquilo / completo (protestas IA)', +(c.autos / Math.max(1, d.autos)).toFixed(2), 0.35, 0.7);
  band('ofertas por partido', per(d, d.offers), 0.35, 0.9);
}
console.log(failures ? `\n${failures} FALLO(S)` : '\nTODO OK');
process.exit(failures ? 1 : 0);
