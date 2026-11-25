#!/usr/bin/env node
/* TAKE THE COURT — tools/netaimtest.js  (owner: net)
 * Controles PC (25-nov-2026): el punto del ratón (input.aim) en el online y en la vista del invitado. Usa el arnés de tools/net4test.js.
 *   (a) códec: aimBits / decode (bits altos de la palabra de botones), paquetes TIPO 1 sin punto (byte a byte como antes) y TIPO 5 con
 *       punto; packN TIPO 2 / 6; -128 = sin punto
 *   (b) Precisa (1 contra 1) con los dos bots apuntando con el «ratón» (VB.Net.bot … {aimPt: true}): huellas iguales, PRUEBA DE ORO
 *       (offline con las entradas confirmadas, punto incluido = gc del anfitrión) y el punto viaja (entradas confirmadas con él)
 *   (c) Precisa-N 2v2 con 4 plazas apuntando: huellas y prueba de oro
 *   (d) 1 contra 1 mezclado (Session + SessionN) con punto: huellas y prueba de oro
 *   (e) Fluida y host (2v2 × 4) con punto: sin excepciones y se juegan puntos
 *   (f) NetView.inputToWorld gira el punto para el equipo 1 (como move)
 * Uso: node tools/netaimtest.js [--quick]   (código 1 si falla)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const H = require('./net4test.js');
const QUICK = process.argv.includes('--quick');
let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
}
const t0 = Date.now();
console.log('netaimtest: el punto del ratón en el online');

console.log('== (a) códec ==');
{
  const V = H.load(), N = V.Net;
  const inp = { move: [0.5, -0.25], hit: true, aim: [-4.3, 2.35] };
  const b = N.bitsOf(inp), d = N.decode(N.q16(0.5), N.q16(-0.25), b);
  check('a1 bitsOf + decode: botones y punto (pasos de 0,1 / 0,05 m)', d.hit && !d.jump && d.aim && Math.abs(d.aim[0] + 4.3) < 1e-9 && Math.abs(d.aim[1] - 2.35) < 1e-9, { aim: d.aim });
  const d2 = N.decode(0, 0, N.bitsOf({ move: [0, 0], aim: [99, -99] }));
  check('a2 punto fuera de rango: se recorta a ±12,7 / ±6,35 m', Math.abs(d2.aim[0] - 12.7) < 1e-9 && Math.abs(d2.aim[1] + 6.35) < 1e-9, { aim: d2.aim });
  const d3 = N.decode(0, 0, N.bitsOf({ move: [0, 0], hit: true }));
  check('a3 sin punto: aim null y los bits de siempre', d3.aim === null && N.bitsOf({ hit: true }) === 1, { b: N.bitsOf({ hit: true }) });
  // anillo de mentira con 3 entradas
  const ring = { X: new Int16Array(4096), Y: new Int16Array(4096), B: new Uint32Array(4096) };
  const put = (t, x, y, bb) => { ring.X[t & 4095] = x; ring.Y[t & 4095] = y; ring.B[t & 4095] = bb; };
  put(10, 100, -200, 1); put(11, 300, 400, 2); put(12, -5, 7, 0);
  const p1 = N.packInputs(ring, 10, 3, 77, 88, 3), u1 = N.unpackInputs(p1);
  check('a4 sin punto en el paquete: TIPO 1 de 14 + 5·n bytes, ida y vuelta', (p1[0] & 15) === 1 && p1.length === 14 + 15 && u1 && u1.v.join() === '100,-200,1,300,400,2,-5,7,0' && u1.ack === 77 && u1.tick === 88 && u1.ep === 3, { len: p1.length });
  put(11, 300, 400, N.bitsOf({ jump: true, aim: [-7.5, -1.2] }));
  const p5 = N.packInputs(ring, 10, 3, 77, 88, 3), u5 = N.unpackInputs(p5);
  const dd = u5 ? N.decode(u5.v[3], u5.v[4], u5.v[5]) : null, d0 = u5 ? N.decode(u5.v[0], u5.v[1], u5.v[2]) : null;
  check('a5 con punto: TIPO 5 de 14 + 7·n bytes; el punto vuelve y las demás entradas siguen sin él', (p5[0] & 15) === 5 && p5.length === 14 + 21 && dd && dd.jump && Math.abs(dd.aim[0] + 7.5) < 1e-9 && Math.abs(dd.aim[1] + 1.2) < 1e-9 && d0.aim === null && d0.hit,
    { len: p5.length, aim: dd && dd.aim });
  const pn = N.packN(1, 500, [10, 20], [{ s: 1, first: 10, n: 3, st: 12, ring }], 2), un = N.unpackN(pn);
  const dn = un ? N.decode(un.bl[0].v[3], un.bl[0].v[4], un.bl[0].v[5]) : null;
  check('a6 packN con punto: TIPO 6 e ida y vuelta', (pn[0] & 15) === 6 && un && un.bl[0].n === 3 && dn && Math.abs(dn.aim[0] + 7.5) < 1e-9, { ty: pn[0] & 15 });
  put(11, 300, 400, 2);
  const pn2 = N.packN(1, 500, [10, 20], [{ s: 1, first: 10, n: 3, st: 12, ring }], 2);
  check('a7 packN sin punto: TIPO 2 de siempre', (pn2[0] & 15) === 2 && N.unpackN(pn2).bl[0].v.join() === '100,-200,1,300,400,2,-5,7,0');
}

const aimRecs = (R) => { const rec = R.AD.rec(R.S[0]); let n = 0, tot = 0; const F = R.V[0].Net.AIM_F; for (const r of rec) { if (!r) break; for (let s = 2; s < r.length; s += 3) { tot++; if (r[s] & F) n++; } } return { n, tot }; };
const errTxt = R => R.err ? String(R.err && R.err.stack || R.err).slice(0, 400) : '';
const pts = R => R.st.map(x => x.pts.length);

console.log('== (b) Precisa 1 contra 1 con punto ==');
{
  const R = H.runMatch({ topo: 'pair', rtt: 120, jit: 15, loss: 3, seed: 21, secs: QUICK ? 30 : 60, model: 'precisa2', botOpts: { aimPt: true } });
  check('b1 sin excepciones y se juegan puntos', !R.err && R.st[0].pts.length > 0, errTxt(R) || pts(R));
  if (!R.err) {
    const c = H.cmpHashes(R); check('b2 huellas de gc iguales', c.n > 5 && c.bad === 0, c);
    const G = H.golden(R); check('b3 PRUEBA DE ORO con el punto', G.checked > 5 && G.bad === 0 && G.finalOk !== false, G);
    const a = aimRecs(R); check('b4 el punto viaja (entradas confirmadas con punto)', a.n > a.tot * 0.3, a);
  }
}

console.log('== (c) Precisa-N 2v2 × 4 con punto ==');
{
  const S4 = [{ team: 0 }, { team: 1 }, { team: 0 }, { team: 1 }], rt = [0, 40, 120, 200];
  const R = H.runMatch({ n: 4, topo: 'star', relay: false, model: 'precisaN', seats: S4, jit: 15, loss: 2, rtt: k => rt[k], seed: 9, secs: QUICK ? 30 : 60, opts: H.optsN(9, S4), botOpts: { aimPt: true } });
  check('c1 sin excepciones y se juegan puntos', !R.err && R.st[0].pts.length > 0, errTxt(R) || pts(R));
  if (!R.err) {
    const c = H.cmpHashes(R); check('c2 huellas de gc iguales en las 4', c.n > 5 && c.bad === 0, c);
    const G = H.golden(R); check('c3 PRUEBA DE ORO con el punto', G.checked > 5 && G.bad === 0 && G.finalOk !== false, G);
    const a = aimRecs(R); check('c4 el punto viaja', a.n > a.tot * 0.3, a);
  }
}

console.log('== (d) 1 contra 1 mezclado (Session + SessionN) con punto ==');
for (const model of ['mixA', 'mixB']) {
  const R = H.runMatch({ topo: 'pair', rtt: 90, jit: 15, loss: 3, seed: 15, secs: QUICK ? 20 : 40, model, botOpts: { aimPt: true } });
  const c = R.err ? null : H.cmpHashes(R), G = R.err ? null : H.golden(R);
  check('d ' + model + ': huellas y prueba de oro', !R.err && c.n > 3 && c.bad === 0 && G.bad === 0, errTxt(R) || { c, G });
}

console.log('== (e) Fluida y host con punto ==');
for (const model of ['fluida2', 'host4']) {
  const R = H.runMatch({ n: model === 'host4' ? 4 : 2, topo: model === 'host4' ? 'star' : 'pair', relay: false, rtt: 80, jit: 10, loss: 1, seed: 33, secs: QUICK ? 25 : 45, model, botOpts: { aimPt: true } });
  const evs = R.st.map(x => x.events);
  check('e ' + model + ': sin excepciones y la partida avanza', !R.err && R.st.every(x => (x.status.playing || 0) > 100) && evs[0] > 10, errTxt(R) || { evs });
}

console.log('== (f) vista del invitado ==');
{
  const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx); ctx.VB = {};
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/netview.js'), 'utf8'), ctx, { filename: 'netview.js' });
  const NV = ctx.VB.NetView, a = [-3.2, 1.5];
  const o0 = NV.inputToWorld({ move: [0.1, 0.2], aim: a }, 0), o1 = NV.inputToWorld({ move: [0.1, 0.2], aim: a }, 1), on = NV.inputToWorld({ move: [0, 0] }, 1);
  check('f inputToWorld: el punto tal cual en el equipo 0, girado en el 1 (copia), null sin punto', o0.aim[0] === -3.2 && o0.aim[1] === 1.5 && o0.aim !== a && o1.aim[0] === 3.2 && o1.aim[1] === -1.5 && on.aim === null,
    { o0: o0.aim, o1: o1.aim });
}

console.log((fails ? 'netaimtest FALLA: ' + fails + ' de ' + (fails + oks) : 'netaimtest OK: ' + oks + ' comprobaciones') + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
process.exit(fails ? 1 : 0);
