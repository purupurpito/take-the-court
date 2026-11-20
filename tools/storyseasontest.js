#!/usr/bin/env node
/* TAKE THE COURT — tools/storyseasontest.js (owner: carrera)
 * Prueba del paquete P4 de «Carrera con vida» (js/career-story-season.js, notes/carrera-vida.md §S4 y §3) en node puro (vm, sin DOM):
 *   1. Contrato: misma carrera (fuera de story/inbox/msgN/created/world) con y sin career-story-season.js, y sin ningún story;
 *      dinero, puntos de mejora (player.pts) y c.trophies idénticos. Playa y pista, 3 semillas.
 *   2. Figura de la jornada solo en liga y en partidos jugados (ni simulados, ni banquillo, ni sin nota).
 *   3. Figura del mes: tramos, ≥ 3 jugados, deterministas (dos veces lo mismo), cifras dentro de la fórmula, chip de candidatura
 *      una jornada antes del cierre (puro y sin «undefined»).
 *   4. Camino: estrellas → niveles (20 × 3★), premios cosméticos, se reinicia en la nueva temporada (s.pathHist) y no cambia
 *      dinero, pts, trophies ni nada fuera de story.
 *   5. VB.Look.grant solo con ids que existen en VB.Look.CATALOG (y que no tenías).
 *   6. Textos de todas las plantillas (todas las variantes) y de ui.pass / ui.stats en playa y pista sin «{», «undefined», «NaN»,
 *      «.er» ni «·»; acciones st-season-title/bg/view.
 * Uso: node tools/storyseasontest.js   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const path = require('path');
const H = require('./storyhelp.js');
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }
const BAD = /\{|\}|undefined|NaN|\.er\b|·/;
const NOSEASON = H.BASE.concat(H.STORY.filter(f => !/season/.test(f)));
const LOOK = path.join(H.ROOT, 'js/look.js');
const HLP = { esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])), sp: a => a.filter(x => x !== '' && x != null).join(' | ') };
const plain = html => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

/** Juega TODOS los partidos de una temporada (para tener ≥ 3 jugados por tramo). each(c) tras cada jornada. */
function fullSeason(B, hall, seed, each) {
  const K = B.C, L = B.VB.CareerLife;
  if (!K.load() || K.load().phase === 'off') {
    const c = hall ? K.create({ mode: 'hall', name: 'Temporada Pista', num: 8, pos: 'OH', seed, now: 1 }) : K.create({ mode: 'beach', name: 'Temporada Playa', num: 7, role: 'atk', seed, now: 1 });
    K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  }
  let i = 0, guard = 0;
  while (K.load().phase !== 'off' && guard++ < 90) {
    H.playOne(B, hall, (i++ % 4) !== 3);
    if (L) { const ev = L.pendingEvent(K.load()); if (ev) L.answer(0); }
    if (each) each(K.load());
  }
  return K.load();
}

// ------------------------------------------------------------------ 1. contrato
section('1. Contrato: misma carrera con y sin career-story-season.js');
for (const mode of ['beach', 'hall']) {
  let same = 0, sameNo = 0, core = 0, stars = 0; const bad = [];
  for (const seed of [97, 1234, 50001]) {
    const a = H.autopilot(H.boot({}), { mode, seasons: 3, seed });
    const b = H.autopilot(H.boot({ files: NOSEASON }), { mode, seasons: 3, seed });
    const z = H.autopilot(H.boot({ story: false }), { mode, seasons: 3, seed });
    if (H.strip(a) === H.strip(b)) same++; else bad.push(seed);
    if (H.strip(a) === H.strip(z)) sameNo++;
    if (a.money === z.money && a.player.pts === z.player.pts && JSON.stringify(a.trophies) === JSON.stringify(z.trophies)) core++;
    stars += a.story && a.story.pass ? a.story.pass.st + Object.keys(a.story.pathHist).reduce((s, k) => s + a.story.pathHist[k].st, 0) : 0;
  }
  ok(same === 3, mode + ': idéntica con y sin el módulo en ' + same + ' de 3 semillas × 3 temporadas' + (bad.length ? ' — distintas: ' + bad.join(',') : ''));
  ok(sameNo === 3, mode + ': idéntica también sin ningún fichero story (' + sameNo + ' de 3)');
  ok(core === 3, mode + ': dinero, player.pts y trophies iguales (' + core + ' de 3)');
  ok(stars > 0, mode + ': el Camino sí suma estrellas en el autopiloto (' + stars + ' en total)');
}

// ------------------------------------------------------------------ 2. Figura de la jornada
section('2. Figura de la jornada: solo liga y solo partidos jugados');
for (const mode of ['beach', 'hall']) {
  const B = H.boot({}), sys = B.S.sys('season'), orig = sys.onMatch;
  let wrong = 0, made = 0, sk = 0, won = 0, ideal = 0, topOk = 0; const why = [];
  sys.onMatch = function (c, sum, f, ctx) {
    const k0 = JSON.stringify(c.story.fj);
    orig.call(this, c, sum, f, ctx);
    const changed = JSON.stringify(c.story.fj) !== k0;
    const should = (f.kind || 'league') === 'league' && !sum.sim && !sum.bench && sum.nota != null;
    if (changed && !should) { wrong++; why.push(f.kind + (sum.sim ? ' sim' : '') + (sum.bench ? ' bench' : '')); }
    if (!changed && should) { wrong++; why.push('faltó ' + f.kind); }
    if (changed) {
      made++; const fj = c.story.fj;
      if (fj.won) won++; if (fj.ideal) ideal++;
      if (fj.top.length === 3 && fj.top.every(x => x.n && x.club && x.v >= 4.5 && x.v <= 9.9) && fj.top[0].v >= fj.top[2].v && (!!fj.won === fj.me > fj.top[0].v) && (!!fj.ideal === fj.me >= 7.4)) topOk++;
    } else sk++;
  };
  H.autopilot(B, { mode, seasons: 2, seed: 777 });
  ok(wrong === 0, mode + ': la figura solo sale en liga jugada (' + made + ' jornadas con figura, ' + sk + ' sin)' + (why.length ? ' — ' + why.slice(0, 4).join(', ') : ''));
  ok(made > 0 && sk > 0, mode + ': hay jornadas de los dos tipos');
  ok(topOk === made, mode + ': 3 figuras inventadas con nombre, club y nota en rango; won/ideal según la fórmula (' + topOk + '/' + made + ', figura ' + won + ', ideal ' + ideal + ')');
}

// ------------------------------------------------------------------ 3. Figura del mes
section('3. Figura del mes: tramos, determinismo y chip de candidatura');
for (const mode of ['beach', 'hall']) {
  const run = () => {
    const B = H.boot({}), S = B.S, sys = S.sys('season'); let chipSeen = '', chipPure = true, chipBad = false, chipWrong = 0;
    const c = fullSeason(B, mode === 'hall', 3131, c => {
      const j0 = JSON.stringify(c), ch = sys.chips(c);
      if (JSON.stringify(c) !== j0) chipPure = false;
      const m = c.story.mt, want = !!(m && c.phase === 'league' && c.week === m.to && m.n >= 2);
      if (want !== (ch.length > 0)) chipWrong++;
      if (ch.length) { chipSeen = ch[0].t; if (BAD.test(ch[0].t) || ch[0].tab !== 'honors' || ch[0].s !== 'stats') chipBad = true; }
      const all = S.chipsOf(c); if (all.some(x => BAD.test(x.t))) chipBad = true;
    });
    return { c, chipSeen, chipPure, chipBad, chipWrong, T: sys.tramos(c) };
  };
  const a = run(), b = run(), s = a.c.story;
  ok(a.T && a.T.ends.length >= 2 && a.T.ends[a.T.ends.length - 1] === a.T.W - 1, mode + ': tramos de liga ' + JSON.stringify(a.T && a.T.ends) + ' (W ' + (a.T && a.T.W) + ')');
  if (mode === 'beach') ok(JSON.stringify(a.T.ends) === '[3,7,13]', 'playa: J1-4, J5-8, J9-14 (el tramo corto final se une)');
  ok(s.mo.length >= 1 && s.mo.every(x => x.n >= 3), mode + ': ' + s.mo.length + ' candidaturas cerradas, todas con ≥ 3 jugados (ganadas: ' + s.mo.filter(x => x.won).length + ', mvpN ' + s.mvpN + ')');
  ok(s.mo.every(x => x.top.length === 2 && x.top.every(f => f.v >= 6.0 && f.v <= 8.6 && f.n && f.club) && (!!x.won === x.me > x.top[0].v)), mode + ': 2 figuras con 6,9 + 0,8·r() ± liga y ganador según la media');
  ok(JSON.stringify([s.mo, s.fjH, s.fj, s.rec, s.pass]) === JSON.stringify([b.c.story.mo, b.c.story.fjH, b.c.story.fj, b.c.story.rec, b.c.story.pass]), mode + ': misma semilla, mismas figuras del mes, de la jornada, récords y Camino');
  ok(a.chipSeen && /^Candidatura a Figura del mes: tu media \d+,\d; .+ \d+,\d$/.test(a.chipSeen), mode + ': chip de candidatura: «' + a.chipSeen + '»');
  ok(a.chipPure && !a.chipBad && a.chipWrong === 0, mode + ': chips puros, sin «undefined» y solo una jornada antes del cierre con ≥ 2 jugados (errores: ' + a.chipWrong + ')');
  ok(s.feed.some(x => x.b === 'seMoWin' || x.b === 'seMoLose'), mode + ': mensaje al cerrar el mes en el feed');
  ok(s.rec.nota && s.rec.kills && s.rec.nota.v > 0 && typeof s.rec.nota.w === 'string' && s.rec.nota.rival, mode + ': récords s.rec con nota, remates y su partido (' + s.rec.nota.v + ', ' + s.rec.nota.w + ')');
}

// ------------------------------------------------------------------ 4. Camino
section('4. Camino: niveles, premios cosméticos, reinicio en la nueva temporada');
for (const mode of ['beach', 'hall']) {
  const B = H.boot({}), K = B.C, S = B.S;
  let pass1 = null;
  H.autopilot(B, { mode, seasons: 2, seed: 2024, each: (c, i) => { if (i === 0) pass1 = JSON.parse(JSON.stringify(c.story.pass)); } });
  const c = K.load(), s = c.story;
  ok(pass1 && pass1.s === 1 && pass1.st > 0 && pass1.lv === Math.floor(pass1.st / 3), mode + ': temporada 1: ' + (pass1 && pass1.st) + ' estrellas, nivel ' + (pass1 && pass1.lv));
  ok(s.pass.s === c.season && s.pathHist[1] && s.pathHist[1].st === pass1.st, mode + ': en la temporada ' + c.season + ' el Camino vuelve a empezar y la 1 queda en pathHist (' + JSON.stringify(s.pathHist[1]) + ')');
  // forzar el Camino entero con una «elección» (fx star) y ver que solo cambia story
  const before = JSON.parse(JSON.stringify(c)), res = S.fx(c, { star: 100 });
  ok(c.story.pass.lv === 20 && c.story.pass.st === 60, mode + ': fx({star}) llena el Camino: nivel ' + c.story.pass.lv + ', ' + c.story.pass.st + ' estrellas (' + res.join(', ') + ')');
  ok(c.story.pass.got.length === 10 && c.story.titles.length >= 4 && c.story.bgs.length >= 3, mode + ': 10 premios (' + c.story.pass.got.map(g => g.lv + ':' + g.k).join(' ') + '), títulos ' + c.story.titles.length + ', fondos ' + c.story.bgs.length);
  ok(H.strip(c) === H.strip(before) && c.money === before.money && c.player.pts === before.player.pts && JSON.stringify(c.trophies) === JSON.stringify(before.trophies), mode + ': el Camino no toca dinero, pts, trophies ni nada fuera de story');
  // nueva temporada a mano: reinicio
  const st0 = c.story.pass.st; c.season++; S.hook(c, 'newSeason');
  ok(c.story.pass.s === c.season && c.story.pass.st === 0 && c.story.pathHist[c.season - 1].st === st0, mode + ': hook newSeason reinicia (pathHist ' + JSON.stringify(c.story.pathHist[c.season - 1]) + ')');
  ok(c.story.titles.length >= 4, mode + ': los títulos ganados se quedan al cambiar de temporada');
  // reparación de un estado roto
  c.story.pass = 'x'; c.story.rec = { nota: 5, raro: 1 }; c.story.mo = 3; c.story.fjH = [null, { s: 1 }]; c.story.title = 'Inventado'; c.story.bg = 'nada'; c.story.mt = { s: 'a' };
  S.ensure(c);
  ok(c.story.pass && c.story.pass.st === 0 && Array.isArray(c.story.pass.got) && c.story.rec.nota === null && !('raro' in c.story.rec) && Array.isArray(c.story.mo) && c.story.fjH.length === 0 && c.story.title === '' && c.story.bg === '' && c.story.mt === null, mode + ': ensure sanea un estado de P4 roto');
}

// ------------------------------------------------------------------ 5. VB.Look.grant
section('5. VB.Look.grant solo con ids del CATALOG');
for (const mode of ['beach', 'hall']) {
  const B = H.boot({ extra: [LOOK] }), X = B.VB.Look, S = B.S, K = B.C;
  if (!X) { ok(false, 'js/look.js no carga'); continue; }
  const ids = new Set(X.CATALOG.map(x => x.id)), log = [], g0 = X.grant;
  X.grant = function (id, src) { log.push([id, X.owned(id), src]); return g0.apply(this, arguments); };
  const c = H.autopilot(B, { mode, seasons: 1, seed: 99 });
  const before = H.strip(c);
  S.fx(c, { star: 100 });
  const mine = log.filter(x => x[2] === 'carrera' && c.story.pass.got.some(g => g.id === x[0]));
  ok(mine.length === 3, mode + ': 3 prendas del Camino concedidas: ' + mine.map(x => x[0]).join(', '));
  ok(log.every(x => ids.has(x[0])), mode + ': todo lo concedido existe en VB.Look.CATALOG (' + log.length + ' llamadas a grant)');
  ok(mine.every(x => !x[1]) && c.story.pass.got.filter(g => g.k === 'look').every(g => X.owned(g.id)), mode + ': solo lo que no tenías y ahora ya lo tienes');
  ok(H.strip(c) === before, mode + ': conceder prendas no cambia la carrera');
  // segunda vuelta: ya lo tiene todo → no se repite la prenda (fondo de reserva u otra)
  c.season++; S.hook(c, 'newSeason'); const n0 = log.length; S.fx(c, { star: 100 });
  const again = log.slice(n0).filter(x => x[2] === 'carrera');
  ok(again.every(x => !x[1] && ids.has(x[0])), mode + ': en la temporada siguiente no se concede nada que ya tengas (' + again.map(x => x[0]).join(', ') + ')');
}

// ------------------------------------------------------------------ 6. textos e interfaz
section('6. Textos (todas las variantes) e interfaz en playa y pista');
for (const mode of ['beach', 'hall']) {
  const B = H.boot({}), S = B.S, K = B.C, sys = S.sys('season');
  const c = fullSeason(B, mode === 'hall', 555);
  const vars = { w: 5, nota: '7,8', med: 'Diario La Red', f1: 'Noa Vela', v1: '7,6', c1: 'Voley Puerto', f2: 'Sam Roca', v2: '7,1', avg: '7,4', n: 4, gap: 3, lv: 6, st: 18, prize: 'Fondo Tinta naranja', how: 'Elígelo en Fama › Camino.' };
  let bad = [], n = 0;
  Object.keys(sys.tpl).forEach(b => { for (let id = 1; id <= 60; id++) { const t = S.text(c, { id, b, vars, o: 0, ans: -1 }); n++; if (!t.t || !t.x || BAD.test(t.t + ' ' + t.x)) bad.push(b + '#' + id + ': ' + t.t + ' / ' + t.x); } });
  ok(!bad.length, mode + ': ' + n + ' textos de plantilla sin «{», «undefined», «NaN», «.er» ni «·»' + (bad.length ? ' — ' + bad.slice(0, 2).join(' | ') : ''));
  const mine = c.story.feed.filter(x => x.sys === 'season'), mb = mine.map(x => S.text(c, x)).filter(t => !t.t || BAD.test(t.t + ' ' + t.x));
  ok(mine.length > 0 && !mb.length, mode + ': ' + mine.length + ' entradas reales del feed bien pintadas (' + [...new Set(mine.map(x => x.b))].join(', ') + ')');
  const wall = (c.story.wallQ || []).concat(c.story.wall && c.story.wall.p || []).filter(x => /Figura/.test(x.t));
  ok(wall.every(x => !BAD.test(x.t)), mode + ': publicaciones de figuras sin texto roto (' + wall.length + ')');
  // forzar premios para pintar títulos y fondos
  S.fx(c, { star: 40 }); K.save(c);
  const p = sys.ui.pass(c, HLP), st = sys.ui.stats(c, HLP);
  ok(p.length > 200 && !/undefined|NaN/.test(p) && !BAD.test(plain(p)), mode + ': ui.pass sin texto roto (' + p.length + ' caracteres)');
  ok(st.length > 200 && /<svg/.test(st) && /<polyline/.test(st) && !/undefined|NaN/.test(st) && !BAD.test(plain(st)), mode + ': ui.stats con gráfica SVG y sin texto roto (' + st.length + ' caracteres)');
  ok(/Récords de un partido/.test(st) && /Mejor nota/.test(st) && /Figuras/.test(st) && /Por temporada/.test(st), mode + ': Estadísticas con temporadas, récords y figuras');
  ok(/data-act="st-season-title-0"/.test(p) && /data-act="st-season-bg-0"/.test(p) && (p.match(/class="ss-n/g) || []).length === 20, mode + ': Camino con 20 niveles y botones de título y fondo');
  // acciones (sobre la carrera activa)
  const r1 = S.act('st-season-title-0'), t1 = K.load().story.title;
  const r2 = S.act('st-season-bg-0'), bg = sys.ticketBg(K.load());
  ok(r1 && r1.render && t1 === K.load().story.titles[0] && sys.titleOf(K.load()) === t1, mode + ': st-season-title-0 elige «' + t1 + '»');
  ok(r2 && r2.render && bg && /^#[0-9a-f]{6}$/.test(bg.col), mode + ': st-season-bg-0 elige el fondo del ticket (' + (bg && bg.name) + ')');
  S.act('st-season-title--1'); S.act('st-season-bg--1');
  ok(K.load().story.title === '' && sys.ticketBg(K.load()) === null, mode + ': «Sin título» y «El de siempre» los quitan');
  // temporada pasada en la gráfica
  K.stay(1); const c2 = K.load();
  ok(c2.story.ns[1] && c2.story.ns[1].length > 0, mode + ': notas de la temporada 1 guardadas en s.ns (' + (c2.story.ns[1] || []).length + ')');
  S.act('st-season-view-1'); const st2 = sys.ui.stats(K.load(), HLP);
  ok(/temporada 1/.test(st2) && /<polyline/.test(st2) && !BAD.test(plain(st2)), mode + ': ver la temporada 1 en la gráfica (st-season-view-1)');
  const p2 = sys.ui.pass(K.load(), HLP);
  ok(/Caminos anteriores/.test(p2) && /Nivel 0/.test(p2), mode + ': Camino nuevo en la temporada 2 con el anterior en el historial');
}

console.log('\n' + passes + ' comprobaciones bien' + (fails ? ', ' + fails + ' FALLOS' : ''));
console.log(fails ? 'HAY FALLOS' : 'TODO OK');
process.exit(fails ? 1 : 0);
