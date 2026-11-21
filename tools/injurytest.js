#!/usr/bin/env node
/* MAKE THE CUT — tools/injurytest.js (owner: lesiones)
 * Pruebas de las lesiones de la Carrera (js/career-injury.js, VB.CareerInjury) en node puro (vm, sin DOM):
 *   1. Contrato: con el fichero y Lesiones: No desde el principio, la carrera es idéntica a la de sin fichero (3 semillas × 4
 *      temporadas, playa y pista); careertest.js y storyhelp no cargan el fichero.
 *   2. Determinismo: con lesiones, la misma semilla da el mismo JSON (dos pasadas por modo).
 *   3. Sin Math.random: ni en el código ni durante un autopiloto (Math.random que salta si lo llama career-injury.js).
 *   4. 'create' sin tiradas: c.inj con los valores por defecto y n = 0.
 *   5. Guardados: sin c.inj carga y se repara; c.inj estropeado se sanea; save → load conserva la lesión.
 *   6. Bloqueo (playa y pista): next().bench y n.out, matchSetup null, simulateNext al banquillo, sum.out 'inj', sin nota ni XP,
 *      sin «Promesa incumplida» ni «Esta jornada, al banquillo»; pista: lineup 'out' why 'x', whyText de la lesión, sin «Fuera de la
 *      convocatoria»; también en copa (playa) y eliminatorias (pista); sesiones: solo descansar ('baja').
 *   7. Curación: un partido menos por jornada, «Alta médica», falta de ritmo (−1) y tocado (−2) en 'setup', recaída en la misma zona y
 *      más grave, 6 descansos = un partido menos.
 *   8. Fisio: Volver antes (la mitad, tocado 2 y recaída 4 en el alta, una vez) e intensivo (2 × fisio, −1, una vez, sin dinero no).
 *   9. Verano: cura, carga a 0 y «Recuperado en verano».
 *  10. Calibrado (autopiloto, 40 carreras × 3 temporadas por modo; INJ_N=… para cambiarlo): lesiones por temporada en [0,4; 0,9],
 *      graves ≤ 6 de 120; muy cargado (fatiga 85) ≥ 1,5; cuidadoso (fatiga 20 y Descansar cada 3 jornadas) ≤ 0,45.
 *  11. Textos: mensajes, tarjetas (sano, de baja, confirmación), última jornada y blocked sin «{», «undefined», «NaN», «1.er», «·» ni
 *      correos; data-act válidos.
 *  12. Interfaz (document falso, career-ui de verdad): Jugador › Estado y Partido con y sin lesión, playa y pista, sin errores.
 *  13. Hoja final: una lesión forzada en un partido simulado sale en el Resumen (recap.js endModel: bloque «Lesión», arriba,
 *      textos cortos y sin detalles crudos); sin lesión o en Partido rápido, sin bloque.
 * Uso: node tools/injurytest.js [--fast]   (--fast: calibrado con 12 carreras)   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const H = require('./storyhelp.js');
const FILE = 'js/career-injury.js';
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }
const BAD = /\{|\}|undefined|NaN|1\.er|·|@/;
const txt = (h) => String(h).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
const FAST = process.argv.indexOf('--fast') >= 0;
const bootI = (o) => H.boot(Object.assign({ extra: [FILE] }, o || {}));
const HOOK_MSG = 'falta el gancho CareerExt en career.js';

/** Autopiloto propio (como storyhelp.autopilot) con ganchos: o.off (Lesiones: No al crear), o.before(K, i) antes de cada jornada. */
function run(B, o) {
  o = o || {};
  const K = B.C, L = B.VB.CareerLife, hall = o.mode === 'hall';
  let c = hall ? K.create({ mode: 'hall', name: 'Lesion Pista', num: 8, pos: o.pos || 'OH', seed: o.seed || 1, now: 1 })
    : K.create({ mode: 'beach', name: 'Lesion Playa', num: 7, role: o.role || 'atk', seed: o.seed || 1, now: 1 });
  if (o.off && c.inj) { c.inj.on = 0; K.save(c); }
  K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  let played = 0;
  for (let s = 0; s < (o.seasons || 1); s++) {
    let guard = 0;
    while (K.load().phase !== 'off' && guard++ < 90) {
      const before = JSON.stringify([K.load().season, K.load().phase, K.load().week, K.load().koI, K.load().cup && K.load().cup.round, K.load().kos && K.load().kos.length]);
      const i = played++;
      if (o.before) o.before(K, i);
      let r;
      if (i % 3 === 0 && !o.simOnly) r = H.playOne(B, hall, (i % 5) !== 0); else {
        const n = K.next(K.load());
        r = n && n.bench ? K.benchNext() : K.simulateNext();
      }
      if (o.acc && r && B.VB.CareerInjury) { o.acc.m++; o.acc.e += B.VB.CareerInjury.exposure(r); }
      if (L) { const ev = L.pendingEvent(K.load()); if (ev) L.answer(0); }
      const after = JSON.stringify([K.load().season, K.load().phase, K.load().week, K.load().koI, K.load().cup && K.load().cup.round, K.load().kos && K.load().kos.length]);
      if (after === before && K.load().phase !== 'off' && !K.next(K.load())) break;
    }
    if (o.each) o.each(K.load(), s);
    K.stay(1);
  }
  return K.load();
}
function stripI(c) { const o = JSON.parse(H.strip(c)); delete o.inj; return JSON.stringify(o); }
function newCareer(B, mode, seed) {
  const K = B.C;
  const c = mode === 'hall' ? K.create({ mode: 'hall', name: 'Ana Prueba', num: 8, pos: 'OH', seed: seed || 7, now: 1 }) : K.create({ mode: 'beach', name: 'Ana Prueba', num: 7, role: 'atk', seed: seed || 7, now: 1 });
  K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  return K.load();
}
function setOn(B, v) { const c = B.C.load(); c.inj.on = v; B.C.save(c); }
const msgs = (c, from) => (c.inbox || []).filter(m => m.id > (from | 0));
const lastId = (c) => c.msgN | 0;

const I0 = bootI().VB.CareerInjury;
ok(!!I0 && typeof I0.hook === 'function' && I0.CAT && I0.CAT.tob2, 'VB.CareerInjury se carga en node (sin DOM)');
const hookOk = (() => {
  const B = bootI(); newCareer(B, 'beach', 3); B.VB.CareerInjury._debugInjure('beach', 'tob2', 3);
  const n = B.C.next(B.C.load()); return !!(n && n.bench && n.out && n.out.id === 'inj');
})();
ok(hookOk, 'career.js consume VB.CareerExt (un partido con lesión forzada va al banquillo)' + (hookOk ? '' : ' — ' + HOOK_MSG));

// ------------------------------------------------------------------ 1. contrato
section('1. Contrato: Lesiones: No desde el principio = sin fichero');
['beach', 'hall'].forEach(mode => {
  [11, 22, 33].forEach(seed => {
    const a = run(H.boot(), { mode, seed, seasons: 4 });
    const b = run(bootI(), { mode, seed, seasons: 4, off: true });
    ok(stripI(a) === stripI(b) && b.inj && b.inj.on === 0 && b.inj.n === 0, mode + ' semilla ' + seed + ': idéntica (4 temporadas)');
  });
});
{
  const ct = fs.readFileSync(path.join(H.ROOT, 'tools/careertest.js'), 'utf8'), sh = fs.readFileSync(path.join(H.ROOT, 'tools/storyhelp.js'), 'utf8');
  ok(ct.indexOf('career-injury') < 0 && sh.indexOf('career-injury') < 0, 'careertest.js y storyhelp.js no cargan career-injury.js (sus cifras no cambian)');
}

// ------------------------------------------------------------------ 2. determinismo
section('2. Determinismo');
['beach', 'hall'].forEach(mode => {
  const a = run(bootI(), { mode, seed: 44, seasons: 3 }), b = run(bootI(), { mode, seed: 44, seasons: 3 });
  ok(JSON.stringify(a) === JSON.stringify(b), mode + ': mismo JSON con la misma semilla (3 temporadas, ' + (a.inj.cnt.reduce((s, x) => s + x, 0)) + ' lesiones, ' + a.inj.n + ' tiradas)');
});

// ------------------------------------------------------------------ 3. sin Math.random
section('3. Sin Math.random');
{
  const src = fs.readFileSync(path.join(H.ROOT, FILE), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/Math\.random/.test(code) && !/g\.rng/.test(code),'el código no usa Math.random ni g.rng');
  const B = bootI(), M0 = B.cx.Math; let bad = 0;
  const fakeM = Object.create(M0); fakeM.random = function () { if (/career-injury\.js/.test(new Error().stack)) bad++; return M0.random(); };
  B.cx.Math = fakeM;
  run(B, { mode: 'beach', seed: 5, seasons: 2 });
  ok(bad === 0, 'durante 2 temporadas de autopiloto career-injury.js no llama a Math.random');
}

// ------------------------------------------------------------------ 4. create
section("4. 'create' sin tiradas");
['beach', 'hall'].forEach(mode => {
  const B = bootI(), K = B.C;
  const c = mode === 'hall' ? K.create({ mode: 'hall', name: 'Nueva Pista', num: 8, pos: 'OH', seed: 9, now: 1 }) : K.create({ mode: 'beach', name: 'Nueva Playa', num: 7, role: 'atk', seed: 9, now: 1 });
  const I = c.inj;
  ok(I && I.on === 1 && I.n === 0 && I.run === 0 && I.cur === null && I.cnt.join() === '0,0,0' && I.hist.length === 0, mode + ': c.inj por defecto (on 1, n 0, sin lesión)');
});

// ------------------------------------------------------------------ 5. guardados
section('5. Guardados');
{
  const B = bootI(), K = B.C, CI = B.VB.CareerInjury;
  let c = newCareer(B, 'beach', 12);
  delete c.inj; K.save(c); K._reset();
  c = K.load();
  ok(c && !c.inj, 'un guardado sin c.inj carga (sin crearlo al cargar)');
  ok(CI.blocked(c, null) === null && CI.risk(c).lv && CI.ui.state(c, {}).indexOf('Estado físico') >= 0 && !c.inj, 'las funciones puras leen sin c.inj y no lo crean');
  K.simulateNext(); c = K.load();
  ok(c.inj && c.inj.on === 1 && c.inj.n >= 0, 'el primer gancho lo crea con los valores por defecto');
  const bads = ['x', { cur: { id: 'zzz', left: 2, tot: 3 } }, { cur: { id: 'tob2', left: NaN, tot: 3 } }, { run: -5, hist: 'a', cnt: 'q', on: 'z', back: 9, re: 3, reZ: 'pie' }, { cur: { id: 'rod2', left: 99, tot: 4, reh: 40 } }];
  const exp = [o => o.cur === null && o.on === 1, o => o.cur === null, o => o.cur === null, o => o.run === 0 && Array.isArray(o.hist) && o.cnt.join() === '0,0,0' && o.on === 1 && o.back === 2 && o.re === 0 && o.reZ === '',
    o => o.cur && o.cur.left === 4 && o.cur.reh === CI.REH_N - 1];
  bads.forEach((v, i) => { const x = { inj: JSON.parse(JSON.stringify(v)) }; const o = CI.ensure(x); ok(exp[i](o) && JSON.stringify(CI.ensure(x)) === JSON.stringify(o), 'c.inj estropeado ' + (i + 1) + ' se sanea (' + JSON.stringify(v).slice(0, 50) + ') y ensure es idempotente'); });
  CI._debugInjure('beach', 'hom2', 3); K._reset(); c = K.load();
  ok(c.inj.cur && c.inj.cur.id === 'hom2' && c.inj.cur.left === 3, 'save → load conserva la lesión');
  const B6 = bootI(); newCareer(B6, 'hall', 12); B6.VB.CareerInjury._debugInjure('hall', 'rod2', 2); B6.C._reset();
  ok(B6.C.load().inj.cur && B6.C.load().inj.cur.id === 'rod2', 'pista: save6 → load6 conserva la lesión (sane6 no la borra)');
}

// ------------------------------------------------------------------ 6. bloqueo
section('6. Bloqueo de la jornada');
['beach', 'hall'].forEach(mode => {
  const B = bootI(), K = B.C, CI = B.VB.CareerInjury, tag = mode + ': ';
  newCareer(B, mode, 21); K.simulateNext();
  CI._debugInjure(mode, 'tob2', 3);
  let c = K.load(); const n = K.next(c), m0 = lastId(c);
  ok(n && n.bench === true && n.out && n.out.id === 'inj' && /Esguince de tobillo: vuelves en 3 partidos\./.test(n.out.why) && n.out.act === 'inj-go', tag + 'next(): bench y n.out con el texto de la lesión' + (hookOk ? '' : ' — ' + HOOK_MSG));
  ok(K.matchSetup(c) === null, tag + 'matchSetup() es null');
  const inf = K.trainInfo(c);
  ok(inf && inf.can === false && inf.canRest === true && inf.why === 'baja', tag + 'sesiones: can false, canRest true, why «baja»');
  const tq = K.trainSession('serve', 'quick');
  ok(!tq || tq.ok === false, tag + 'un ejercicio se rechaza');
  const tr = K.trainSession('rest', 'rest');
  ok(tr && tr.ok === true, tag + 'Descansar se permite');
  if (mode === 'hall') {
    const L = K.lineup(K.load());
    ok(L && L.stat === 'out' && L.why === 'x', tag + 'lineup: stat «out», why «x»');
    ok(/Esguince de tobillo/.test(K.whyText(K.load())), tag + 'whyText es el de la lesión');
  }
  const sum = K.simulateNext(); c = K.load();
  const nm = msgs(c, m0).map(x => x.t);
  ok(sum && sum.bench && sum.out === 'inj' && (sum.xp | 0) === 0 && sum.nota == null, tag + 'simulateNext acaba en el banquillo: sum.out «inj», sin nota ni XP');
  ok(nm.indexOf('Promesa incumplida') < 0 && nm.indexOf('Esta jornada, al banquillo') < 0 && !nm.some(t => /Fuera de la convocatoria/.test(t)), tag + 'sin «Promesa incumplida», «Esta jornada, al banquillo» ni «Fuera de la convocatoria» (' + (nm.join(' | ') || 'sin mensajes') + ')');
  ok(c.inj.cur && c.inj.cur.left === 2 && c.inj.miss === 1, tag + 'un partido menos (quedan 2) y miss 1');
  ok(c.last && c.last.out === 'inj', tag + 'c.last.out «inj» (tarjeta «De baja»)');
});
{ // copa de playa y eliminatorias de pista
  const tryKO = (mode) => {
    for (let seed = 1; seed < 40; seed++) {
      const B = bootI(), K = B.C, CI = B.VB.CareerInjury; newCareer(B, mode, seed); setOn(B, 0);
      let g = 0;
      while (g++ < 60) {
        const c = K.load(); if (c.phase === 'off') break;
        const n = K.next(c);
        if ((mode === 'beach' && c.phase === 'cup') || (mode === 'hall' && n && n.kind !== 'league')) {
          if (!n) break;
          CI._debugInjure(mode, 'hom1', 2);
          const n2 = K.next(K.load());
          const s = K.simulateNext();
          return { ok: !!(n2 && n2.bench && n2.out && s && s.out === 'inj'), seed, label: s && s.label };
        }
        if (n && n.bench) K.benchNext(); else K.simulateNext();
      }
    }
    return { ok: false, seed: -1 };
  };
  const a = tryKO('beach'); ok(a.ok, 'playa: de baja también en la copa (semilla ' + a.seed + ', ' + a.label + ')');
  const b = tryKO('hall'); ok(b.ok, 'pista: de baja también en una eliminatoria (semilla ' + b.seed + ', ' + b.label + ')');
}

// ------------------------------------------------------------------ 7. curación
section('7. Curación, falta de ritmo, tocado y recaída');
['beach', 'hall'].forEach(mode => {
  const B = bootI(), K = B.C, CI = B.VB.CareerInjury, tag = mode + ': ';
  newCareer(B, mode, 31);
  CI._debugInjure(mode, 'tob2', 3);
  const m0 = lastId(K.load()), lefts = [];
  for (let i = 0; i < 3; i++) { K.simulateNext(); const c = K.load(); lefts.push(c.inj.cur ? c.inj.cur.left : 0); }
  let c = K.load();
  ok(lefts.join() === '2,1,0' && !c.inj.cur && !K.next(c).out, tag + 'un partido menos por jornada (' + lefts.join(', ') + ') y vuelves a estar disponible');
  ok(msgs(c, m0).some(x => x.t === 'Alta médica' && /falto de ritmo/.test(x.x)) && c.inj.rust === 2 && c.last.injBack, tag + '«Alta médica» con falta de ritmo (−1) 2 partidos y sum.injBack');
  if (mode === 'beach') {
    const st0 = JSON.parse(JSON.stringify(c.player.st)), m = K.matchSetup(c);
    const me = m.attrs[0][0], dd = Object.keys(st0).map(k => st0[k] - me[k]);
    ok(m.injMod && m.injMod.d === 1, tag + "'setup': injMod {rust 2, d 1}");
    // (career-life también pone fatiga/material: miramos la diferencia con rust y sin él)
    const c2 = K.load(); c2.inj.rust = 0; const mB = K.matchSetup(c2); c2.inj.rust = 2;
    ok(Object.keys(st0).every(k => mB.attrs[0][0][k] - me[k] === (mB.attrs[0][0][k] > 1 ? 1 : 0)), tag + "'setup' con falta de ritmo resta 1 a todos tus atributos (" + dd.slice(0, 3).join(',') + '…)');
    c2.inj.back = 2; const mT = K.matchSetup(c2); c2.inj.back = 0;
    ok(Object.keys(st0).every(k => mB.attrs[0][0][k] - mT.attrs[0][0][k] === (mB.attrs[0][0][k] > 2 ? 2 : mB.attrs[0][0][k] - 1)), tag + "'setup' tocado resta 2");
  } else {
    const c2 = K.load(); const m = K.matchSetup(c2);
    if (m) {
      const mine = m.meOn === false ? m.bench[0][m.meBench].st : m.attrs[0][m.ctrlIdx];
      c2.inj.rust = 0; const mB = K.matchSetup(c2); c2.inj.rust = 2;
      const mineB = mB.meOn === false ? mB.bench[0][mB.meBench].st : mB.attrs[0][mB.ctrlIdx];
      ok(m.injMod.d === 1 && Object.keys(mine).every(k => mineB[k] - mine[k] === (mineB[k] > 1 ? 1 : 0)), tag + "'setup' con falta de ritmo resta 1 a tu jugador (hueco " + (m.meOn === false ? 'banquillo' : m.ctrlIdx) + ')');
    } else ok(true, tag + "'setup' (sin partido que preparar esta jornada)");
  }
  // rust baja con los partidos jugados
  K.simulateNext(); K.simulateNext(); c = K.load();
  ok(c.inj.rust === 0 || c.inj.cur, tag + 'la falta de ritmo se acaba en 2 partidos');
  // 6 descansos = un partido menos
  CI._debugInjure(mode, 'rod3', 10, { reh: 0 });
  for (let j = 0; j < 2; j++) { for (let r = 0; r < 3; r++) K.trainSession('rest', 'rest'); K.simulateNext(); }
  c = K.load();
  ok(c.inj.cur && c.inj.cur.left === 7 && c.inj.cur.reh === 0, tag + '6 descansos en 2 jornadas: 3 partidos menos en vez de 2 (quedan ' + (c.inj.cur && c.inj.cur.left) + ')');
  // recaída: zona reZ y más grave
  const x = { seed: 1, mode, season: 1, phase: 'league', week: 3, fatigue: 30, player: { age: 20, roleKey: 'atk' }, inj: { re: 4, reZ: 'esp' } };
  CI.ensure(x);
  const bR = CI._build(x, 0.1, 0.9, 0.5, true, 'esp'), bT = CI._build(x, 0.1, 0.1, 0.5, true, 'tob');
  ok(bR.id === 'esp2' && bT.id === 'tob2', tag + 'recaída: misma zona, un escalón más (leve → media: ' + bR.id + ', ' + bT.id + ')');
  ok(CI._build(x, 0.99, 0.2, 0.5, true, 'tob').id === 'tob3' && CI._build(x, 0.99, 0.2, 0.5, true, 'ded').id === 'ded2', tag + 'recaída grave: tobillo grave; dedos se queda en media (no hay grave)');
});
{ // recaída de verdad: con re > 0 la lesión que salga es en reZ y sube un escalón
  const B = bootI(), K = B.C, CI = B.VB.CareerInjury; newCareer(B, 'beach', 41);
  let got = null, tries = 0;
  while (!got && tries++ < 80) {
    const c = K.load(); if (c.phase === 'off') { K.stay(1); continue; }
    c.inj.cur = null; c.inj.re = 4; c.inj.reZ = 'hom'; c.fatigue = 95; c.inj.run = 12; K.save(c);
    const m0 = lastId(c), s = K.simulateNext();
    if (s && s.inj) got = { s, m: msgs(K.load(), m0) };
  }
  ok(got && /^hom[23]$/.test(got.s.inj.id) && got.s.inj.rl === 1 && got.m.some(x => /^Recaída: /.test(x.t) && /El hombro no estaba del todo/.test(x.x)), 'recaída real: hombro, media o grave, mensaje «Recaída» (' + (got ? got.s.inj.id : 'no salió') + ')');
}

// ------------------------------------------------------------------ 8. fisio
section('8. Decisiones con el fisio');
['beach', 'hall'].forEach(mode => {
  const B = bootI(), K = B.C, CI = B.VB.CareerInjury, tag = mode + ': ';
  newCareer(B, mode, 51); B.C.setMode && B.C.setMode(mode);
  CI._debugInjure(mode, 'rod2', 5);
  let r = CI.act('inj-early'); let c = K.load();
  ok(r && r.render && /¿Volver ya\?/.test(CI.ui.state(c, {})) && c.inj.cur.left === 5, tag + 'Volver antes pide confirmación (sin cambiar nada)');
  r = CI.act('inj-no'); c = K.load();
  ok(!/¿Volver ya\?/.test(CI.ui.state(c, {})), tag + '«Mejor no» cancela');
  CI.act('inj-early'); r = CI.act('inj-early-ok'); c = K.load();
  ok(c.inj.cur.left === 2 && c.inj.cur.early === 1 && (c.inbox || []).some(m => m.t === 'Vuelves antes'), tag + 'Volver antes: la mitad (5 → 2) y mensaje');
  r = CI.act('inj-early-ok');
  ok(r && r.ok === false && K.load().inj.cur.left === 2, tag + 'Volver antes solo una vez');
  const cost = 2 * K.physioCost(K.load());
  c = K.load(); c.money = cost - 1; K.save(c);
  r = CI.act('inj-int'); c = K.load();
  ok(r && r.ok === false && c.inj.cur.left === 2 && c.money === cost - 1, tag + 'Fisio intensivo sin dinero: no (cuesta ' + cost + ')');
  ok(/Fisio intensivo: no te llega el dinero\./.test(CI.ui.state(c, {})), tag + 'el motivo del botón apagado se ve como texto (no solo en title)');
  c.money = cost + 100; K.save(c);
  r = CI.act('inj-int'); c = K.load();
  ok(r && r.ok !== false && c.inj.cur.left === 1 && c.inj.cur.intens === 1 && c.money === 100, tag + 'Fisio intensivo: paga 2 × fisio y −1 partido');
  r = CI.act('inj-int');
  ok(r && r.ok === false && K.load().inj.cur.left === 1, tag + 'Fisio intensivo solo una vez');
  K.simulateNext(); c = K.load();
  ok(!c.inj.cur && c.inj.back === 2 && c.inj.re === 4 && c.inj.reZ === 'rod' && c.inj.rust === 0, tag + 'en el alta: tocado 2, recaída 4 en la rodilla');
  ok(CI.act('inj-go').tab === 'player' && CI.act('inj-go').s === 'train', tag + "'inj-go' lleva a Jugador › Estado");
  CI.act('inj-opt-0'); ok(K.load().inj.on === 0, tag + 'Lesiones: No');
  CI.act('inj-opt-1'); ok(K.load().inj.on === 1, tag + 'Lesiones: Sí');
});

// ------------------------------------------------------------------ 8b. jornada de descanso (bye)
section('8b. Jornada de descanso: los Descansar no se pierden');
{
  const B = bootI(), K = B.C, CI = B.VB.CareerInjury, tag = 'hall: ';
  newCareer(B, 'hall', 53); B.C.setMode && B.C.setMode('hall');
  let c = K.load(); CI.ensure(c); c.train = 'hall'; c.inj.run = 7; c.inj.warn = 1;
  CI.sessClose(c, 0, 2, true);
  ok(c.inj.run === 7 && c.inj.rw === 0, tag + 'bye sin descansos: la carga sigue');
  CI.sessClose(c, 1, 2, true);
  ok(c.inj.run === 0 && c.inj.warn === 0 && c.inj.rw === 0, tag + 'bye con un Descansar: carga a 0 (sin tocar rw)');
  c.inj.cur = { id: 'rod2', left: 3, tot: 4, s: 2, at: 'J1', early: 0, intens: 0, reh: 4 };
  CI.sessClose(c, 3, 3, true);
  ok(c.inj.cur.reh === 1 && c.inj.cur.left === 2, tag + 'bye de baja: 4 + 3 descansos = un partido menos (rehab 1)');
  c.inj.cur.left = 1; c.inj.cur.reh = 5;
  CI.sessClose(c, 2, 2, true);
  ok(c.inj.cur.left === 1 && c.inj.cur.reh === 5, tag + 'bye de baja: la vuelta nunca cae en un descanso (left ≥ 1)');
}

// ------------------------------------------------------------------ 9. verano
section('9. Verano');
['beach', 'hall'].forEach(mode => {
  const B = bootI(), K = B.C, CI = B.VB.CareerInjury, tag = mode + ': ';
  newCareer(B, mode, 61); setOn(B, 0);
  let g = 0; while (K.load().phase !== 'off' && g++ < 90) { const n = K.next(K.load()); if (n && n.bench) K.benchNext(); else K.simulateNext(); }
  CI._debugInjure(mode, 'rod3', 9);
  let c = K.load();
  ok(c.phase === 'off' && CI.blocked(c, null) === null && /Se cura en verano/.test(CI.ui.state(c, {})), tag + 'en verano no bloquea y la tarjeta dice «Se cura en verano»');
  c.inj.run = 7; c.inj.rust = 2; K.save(c);
  const m0 = lastId(c); K.stay(1); c = K.load();
  ok(!c.inj.cur && c.inj.run === 0 && c.inj.rust === 0 && msgs(c, m0).some(x => x.t === 'Recuperado en verano') && c.inj.hist.length === 1, tag + 'temporada nueva: sano, carga 0 y «Recuperado en verano»');
});

// ------------------------------------------------------------------ 10. calibrado
section('10. Calibrado');
{
  const NC = +process.env.INJ_N || (FAST ? 12 : 40), rows = [];
  const tally = (mode, opt) => {
    let tot = 0, sev = [0, 0, 0], seasons = 0; const acc = { m: 0, e: 0 };
    for (let s = 1; s <= NC; s++) {
      const c = run(bootI(), Object.assign({ mode, seed: 1000 + s, seasons: 3, acc }, opt));
      tot += c.inj.cnt[0] + c.inj.cnt[1] + c.inj.cnt[2]; sev = sev.map((v, i) => v + c.inj.cnt[i]); seasons += 3;
    }
    // «de titular»: lesiones por partido en pista (exposición) × partidos de tu equipo por temporada
    return { per: tot / seasons, tit: acc.e > 0 ? tot / acc.e * acc.m / seasons : 0, sev, seasons };
  };
  const setF = (v) => (K) => { const c = K.load(); c.fatigue = v; c.coach = Math.max(c.coach, 80); K.save(c); };
  ['beach', 'hall'].forEach(mode => {
    const a = tally(mode, {});
    rows.push([mode, 'autopiloto', a]);
    ok(a.per >= 0.4 && a.per <= 0.9, mode + ': autopiloto ' + a.per.toFixed(2) + ' lesiones por temporada (de 0,4 a 0,9)');
    ok(a.sev[2] <= Math.max(2, Math.round(6 * a.seasons / 120)), mode + ': graves ' + a.sev[2] + ' de ' + a.seasons + ' temporadas');
    const h = tally(mode, { before: (K) => { setF(84)(K); const c = K.load(); if (c.contract) { c.contract.role = K.ROLE_LV[2]; K.save(c); } }, simOnly: true });   // (titular indiscutible: en la pista, con fatiga ≥ 80 el entrenador te sienta salvo así)
    rows.push([mode, 'muy cargado', h]);
    ok(h.tit >= 1.5, mode + ': muy cargado (fatiga 84, titular indiscutible, sin descansar) ' + h.tit.toFixed(2) + ' por temporada de titular (≥ 1,5)');
    const k = tally(mode, { before: (K, i) => { setF(20)(K); if (i === 0) K.setTrainAuto(false); if (i % 3 === 0) K.trainSession('rest', 'rest'); }, simOnly: true });
    rows.push([mode, 'cuidadoso', k]);
    ok(k.tit <= 0.45, mode + ': cuidadoso (fatiga 20, sin entreno automático, Descansar cada 3 jornadas) ' + k.tit.toFixed(2) + ' por temporada de titular (≤ 0,45)');
  });
  console.log('\n  modo   | caso         | temporadas | por temporada | de titular | leves/medias/graves');
  rows.forEach(r => console.log('  ' + r[0].padEnd(6) + ' | ' + r[1].padEnd(12) + ' | ' + String(r[2].seasons).padStart(10) + ' | ' + r[2].per.toFixed(2).padStart(13) + ' | ' + r[2].tit.toFixed(2).padStart(10) + ' | ' + r[2].sev.join('/')));
}

// ------------------------------------------------------------------ 11. textos
section('11. Textos');
{
  const all = [];
  ['beach', 'hall'].forEach(mode => {
    const B = bootI(), K = B.C, CI = B.VB.CareerInjury; newCareer(B, mode, 71); B.C.setMode(mode);
    let seen = lastId(K.load());
    const grab = () => { msgs(K.load(), seen).forEach(m => all.push(['msg ' + m.t, m.t + ' ' + m.x])); seen = lastId(K.load()); };
    const HLP = { q: (t, x) => '<button class="sp-q" data-q-title="' + t + '" data-q-html="' + x + '">?</button>', esc: s => s };
    all.push(['sano ' + mode, CI.ui.state(K.load(), HLP)]);
    Object.keys(CI.CAT).forEach(id => {
      CI._debugInjure(mode, id, 3);
      const c = K.load();
      all.push(['baja ' + id, CI.ui.state(c, HLP)], ['blocked ' + id, Object.values(CI.blocked(c, null)).join(' ')]);
    });
    CI._debugInjure(mode, 'tob2', 4); CI.act('inj-early'); all.push(['confirmación', CI.ui.state(K.load(), HLP)]); CI.act('inj-early-ok'); grab(); all.push(['tras volver antes', CI.ui.state(K.load(), HLP)]);
    CI.act('inj-int');
    for (let i = 0; i < 3; i++) { K.simulateNext(); grab(); }
    all.push(['tocado', CI.ui.state(K.load(), HLP)]);
    // mensajes de lesión de verdad (fatiga alta) y carga
    let g = 0, nInj = 0; while (g++ < 200 && nInj < 6) {   // tiradas forzadas (fatiga 95, carga 12) hasta 6 lesiones, curándolas
      const c = K.load(); if (c.inj.cur) c.inj.cur = null;
      if (CI.roll(c, 1, 'txt', { fat: 95, run: 12, label: 'Jornada 3', season: c.season })) nInj++;
      K.save(c); grab();
    }
    { const c = K.load(); c.inj.cur = null; c.inj.run = 9; c.inj.warn = 0; c.fatigue = 70; c.coach = 100; K.save(c); if (c.phase !== 'off') { K.simulateNext(); grab(); } }
    Object.keys(CI.CAT).forEach(id => { all.push(['última ' + id, CI.ui.last({ last: { inj: { id, n: 3, rl: id === 'tob3' ? 1 : 0 } } })]); });
    all.push(['alta', CI.ui.last({ last: { injBack: { id: 'tob2', rust: 2 } } })], ['alta tocado', CI.ui.last({ last: { injBack: { id: 'tob2', back: 2 } } })]);
    const S = B.VB.CareerStory; if (S && S.text) (K.load().story && K.load().story.feed || []).filter(e => e.sys === 'inj').forEach(e => { const t = S.text(K.load(), e); all.push(['chat ' + e.b, t.t + ' ' + t.x]); });
    CI._story.chips(K.load()).forEach(ch => all.push(['chip', ch.t + ' ' + ch.x]));
  });
  const bad = all.filter(x => BAD.test(txt(x[1].replace(/data-q-html="[^"]*"/g, ''))) || /undefined|NaN/.test(x[1]));
  ok(!bad.length, all.length + ' textos sin «{», «undefined», «NaN», «1.er», «·» ni «@»' + (bad.length ? ' — ' + bad.slice(0, 3).map(x => x[0] + ': ' + txt(x[1]).slice(0, 120)).join(' || ') : ''));
  const acts = [].concat(...all.map(x => (x[1].match(/data-act="([^"]+)"/g) || []).map(s => s.slice(10, -1))));
  const VALID = /^inj-(go|early|early-ok|no|int|opt-[01])$/;
  ok(acts.length > 10 && acts.every(a => VALID.test(a)), 'data-act válidos (' + Array.from(new Set(acts)).join(', ') + ')');
  console.log('  (mensajes: ' + Array.from(new Set(all.filter(x => /^msg /.test(x[0])).map(x => x[0].slice(4)))).join(' | ') + ')');
  ok(all.some(x => /^msg Lesión: /.test(x[0])) && all.some(x => x[0] === 'msg Alta médica') && all.some(x => x[0] === 'msg Vuelves antes'), 'salen los mensajes de lesión, alta y volver antes');
  ok(all.some(x => /^chat inj-/.test(x[0])), 'con «Carrera con vida», ánimo del compañero en el chat');
  const sano = all[0][1];
  ok(/Estado físico/.test(sano) && /data-act="inj-opt-1" aria-pressed="true"/.test(sano) && /Riesgo (Bajo|Normal|Alto|Muy alto)/.test(sano), 'tarjeta sana: «Estado físico», riesgo y Lesiones: Sí pulsado');
  const baja = all.find(x => x[0] === 'baja rod3')[1];
  ok(/De baja/.test(baja) && /inj-doll/.test(baja) && /Recuperación/.test(baja) && /Rehabilitación: /.test(baja) && /Fisio intensivo/.test(baja), 'tarjeta de baja: muñeco, barra, rehabilitación y fisio');
}
{ // avisos de Partido (puros)
  const B = bootI(), K = B.C, CI = B.VB.CareerInjury; newCareer(B, 'beach', 81);
  let c = K.load(); c.fatigue = 90; c.inj.run = 11; K.save(c);
  const j = JSON.stringify(K.load()), ch = CI._story.chips(K.load());
  ok(ch.length === 1 && /Riesgo de lesión muy alto/.test(ch[0].t) && JSON.stringify(K.load()) === j, 'aviso «Riesgo de lesión muy alto» (puro)');
  CI._debugInjure('beach', 'ded2', 2);
  ok(/^De baja: 2 partidos$/.test(CI._story.chips(K.load())[0].t), 'aviso «De baja: 2 partidos»');
  c = K.load(); c.inj.cur = null; c.fatigue = 10; c.inj.run = 0; c.inj.back = 2; K.save(c);
  ok(/Vuelves tocado/.test(CI._story.chips(K.load())[0].t), 'aviso «Vuelves tocado (−2)»');
}

// ------------------------------------------------------------------ 12. interfaz de verdad
section('12. Interfaz (career-ui con document falso)');
function richDoc() {
  const mk = (tag) => {
    const kids = {};
    return {
      tagName: String(tag || 'div').toUpperCase(), style: {}, hidden: true, innerHTML: '', textContent: '', id: '', attrs: {},
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, removeAttribute(k) { delete this.attrs[k]; },
      hasAttribute(k) { return k in this.attrs; }, appendChild(x) { return x; }, removeChild() { }, addEventListener() { }, contains() { return true; }, closest() { return null; },
      querySelector(sel) { if (!kids[sel]) kids[sel] = mk('div'); return kids[sel]; }, querySelectorAll() { return []; },
      classList: { _s: new Set(), add(...a) { a.forEach(x => this._s.add(x)); }, remove(...a) { a.forEach(x => this._s.delete(x)); }, toggle(x, v) { if (v === undefined ? !this._s.has(x) : v) this._s.add(x); else this._s.delete(x); }, contains(x) { return this._s.has(x); } },
      scrollIntoView() { }, focus() { }, blur() { }, scrollWidth: 0, clientWidth: 0, offsetParent: null
    };
  };
  const doc = { readyState: 'complete', hidden: false, activeElement: null, head: mk('head'), body: mk('body'), addEventListener() { }, removeEventListener() { },
    createElement: (t) => mk(t), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  return { doc, mk };
}
['beach', 'hall'].forEach(mode => {
  const B = bootI(), K = B.C, CI = B.VB.CareerInjury; newCareer(B, mode, 91); K.setMode(mode); K.simulateNext();
  const { doc, mk } = richDoc(); let rootEl = null;
  doc.createElement = (t) => { const e = mk(t); if (!rootEl && t === 'div') rootEl = e; return e; };
  const errs = [], con = Object.assign({}, console, { error: (...a) => { errs.push(a.map(String).join(' ')); } });
  const ux = { console: con, Math, Date, JSON, VB: B.VB, document: doc, setTimeout: () => 0, clearTimeout() { }, requestAnimationFrame: () => 0, performance: { now: () => 0 },
    addEventListener() { }, removeEventListener() { }, localStorage: B.cx.localStorage };
  ux.globalThis = ux; ux.window = ux; vm.createContext(ux);
  let err = '';
  for (const f of ['js/career-world-ui.js', H.STORY_UI, 'js/career-ui.js']) { try { vm.runInContext(fs.readFileSync(path.join(H.ROOT, f), 'utf8'), ux, { filename: f }); } catch (e) { err += f + ': ' + e.message + ' '; } }
  const CU = B.VB.CareerUI, tag = mode + ': ';
  try { CU.open('hub', { fresh: true }); } catch (e) { err += 'open: ' + e.message; }
  const body = () => (rootEl ? rootEl.querySelector('.cr-body').innerHTML : '');
  const subs = () => (rootEl ? rootEl.querySelector('.cr-sub').innerHTML : '');
  CU._tab('player', 'train'); let h = body();
  ok(!err && !errs.length && /class="card inj"/.test(h) && /Estado físico/.test(h), tag + 'Jugador › Estado sano con la tarjeta «Estado físico»' + (err || errs.length ? ' — ' + err + errs.join(' | ').slice(0, 300) : ''));
  ok(/>Estado</.test(subs()), tag + 'la sub-pestaña se llama «Estado»');
  CU._tab('match'); h = body();
  ok(!errs.length && /data-act="play"|data-act="bench"/.test(h), tag + 'Partido sano se pinta');
  CI._debugInjure(mode, 'tob2', 3); CU._tab('player', 'train'); h = body();
  ok(!errs.length && /card inj inj-out/.test(h) && /data-act="inj-int"/.test(h) && !/undefined|NaN/.test(h), tag + 'Jugador › Estado de baja');
  CU._tab('match'); h = body();
  ok(!errs.length && /De baja\./.test(h) && /data-act="bench"/.test(h) && /data-act="inj-go"/.test(h) && /De baja: 3 partidos/.test(h), tag + 'Partido de baja: «De baja.», «Ver la jornada», «Ver recuperación» y el aviso' + (errs.length ? ' — ' + errs.join(' | ').slice(0, 200) : ''));
  K.simulateNext(); try { CU.open('hub', { fresh: true }); } catch (e) { } CU._tab('match'); h = body();
  ok(!errs.length && /De baja</.test(h) && /Estabas de baja/.test(h), tag + 'última jornada: «De baja» y «Estabas de baja»');
  ok(CI.ui.css().indexOf(':root.ph:not(#_):not(#_):not(#_) #career') >= 0 && !/font-size:(\d|1[01])px/.test(CI.ui.css()), tag + 'CSS con el prefijo del móvil y sin letra < 12px');
});

// frases de la lesión: valen en la playa (descalzos, arena) y en la pista (zapatillas, parqué)
{
  const L = bootI().VB.CareerInjury.LINES, all = Object.keys(L).reduce((a, k) => a.concat(L[k]), []);
  const bad = all.filter(s => /zapatill|calzad|parqu|tobiller|arena|descalz/i.test(s));
  ok(all.length >= 10 && !bad.length, 'frases de lesión sin calzado ni suelo de un solo modo' + (bad.length ? ' — ' + bad.join(' | ') : ''));
}

// ------------------------------------------------------------------ 13. hoja final (recap.js)
section('13. Hoja final: la lesión del partido en el Resumen (js/recap.js, VB.Recap.endModel)');
['beach', 'hall'].forEach(mode => {
  let B = null, K = null, R = null, sum = null, g = 0, seed = 4040;
  const tag = mode + ': ';
  // lesión forzada: fatiga y carga al máximo antes de cada jornada hasta que un partido simulado devuelva sum.inj (otra semilla si
  // la temporada acaba sin lesión)
  for (; !sum && seed < 4052; seed++) {
    B = bootI({ extra: [FILE, 'js/recap.js'] }); K = B.C; R = B.VB.Recap; g = 0;
    newCareer(B, mode, seed); K.setMode(mode);
    while (!sum && g++ < 80) {
      const c = K.load(); if (c.phase === 'off') break;
      c.fatigue = 100; c.inj.run = 30; K.save(c);
      const n = K.next(K.load()), r = n && n.bench ? K.benchNext() : K.simulateNext();
      if (r && r.inj) sum = r;
    }
  }
  ok(!!sum && !!sum.inj.name && sum.inj.n > 0, tag + 'lesión forzada en un partido (' + (sum ? sum.inj.name + ', fuera ' + sum.inj.n + ', jornada ' + g + ', semilla ' + (seed - 1) : 'ninguna') + ')');
  if (!sum) return;
  // lo que hace ui.js (endData): d.inj = {name, n, rl}
  const cs = { label: sum.label, me: 'TÚ', rival: 'RIV', rivalName: sum.rivalName, num: 7, player: 'Ana Prueba', phase: sum.phase };
  const d = { seed: 7, win: !!sum.win, sets: sum.sets, setScores: sum.setScores, to: 21, size: mode === 'hall' ? 6 : 2, career: cs, cpu: 'la CPU', pl: [], sum,
    inj: { name: String(sum.inj.name), n: sum.inj.n | 0, rl: sum.inj.rl | 0 } };
  const M = R.endModel(d);
  ok(M.inj && M.blocks.indexOf('inj') >= 0 && M.heads.inj === 'Lesión', tag + 'bloque «Lesión» en el Resumen (bloques: ' + M.blocks.join(', ') + ')');
  const iMvp = M.blocks.indexOf('mvp'), iInj = M.blocks.indexOf('inj'), iXp = M.blocks.indexOf('xp');
  ok(iInj > iMvp && (iXp < 0 || iInj < iXp), tag + 'va arriba: después del MVP y antes del progreso');
  ok(M.inj.t === '¡Ay! ' + sum.inj.name && M.inj.parts[0] === 'Fuera ' + sum.inj.n + (sum.inj.n === 1 ? ' partido' : ' partidos'), tag + 'textos: «' + M.inj.t + '» | ' + M.inj.sub);
  ok(!BAD.test(M.inj.t + ' ' + M.inj.sub) && !/sangr|rot[oa]\b|fractur|grit/i.test(M.inj.t + ' ' + M.inj.sub), tag + 'sin «{», «undefined», «NaN», «·» ni detalles crudos');
  ok(M.inj.t.length <= 40 && M.inj.parts.every(p => p.length <= 28), tag + 'cabe en el móvil (título ≤ 40, cada trozo ≤ 28)');
  // sin lesión, o fuera de la Carrera: sin bloque
  const M0 = R.endModel(Object.assign({}, d, { inj: null }));
  ok(!M0.inj && M0.blocks.indexOf('inj') < 0, tag + 'sin lesión, sin bloque');
  const Mq = R.endModel(Object.assign({}, d, { career: null, sum: null }));
  ok(!Mq.inj, tag + 'Partido rápido: nunca bloque de lesión');
});
{
  const R = bootI({ extra: [FILE, 'js/recap.js'] }).VB.Recap;
  const a = R.injModel({ name: 'Esguince de tobillo', n: 3, rl: 1 }), b = R.injModel({ name: 'Dedo torcido', n: 1 }), cc = R.injModel({ name: 'Ligamento de la rodilla', n: 11 });
  ok(a.sub === 'Fuera 3 partidos | Recaída | Toca parar un poco' && b.sub === 'Fuera 1 partido | Hielo, fisio y a volver' && /curarse bien/.test(cc.sub), 'injModel: recaída, singular y grave (' + [a.sub, b.sub, cc.sub].join(' / ') + ')');
  ok(R.injModel(null) === null && R.injModel({ n: 2 }) === null, 'injModel: sin nombre → null');
}

console.log('\n' + passes + ' comprobaciones, ' + fails + ' fallos');
if (!fails) console.log('TODO OK');
process.exit(fails ? 1 : 0);
