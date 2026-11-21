#!/usr/bin/env node
/* TAKE THE COURT — tools/recaptest.js (owner: ui_main)
 * Prueba headless de js/recap.js (VB.Recap, puro): ordinales, movimiento, rasgo, plan de la previa (mini/corta/larga), historial,
 * titular (cada regla y determinismo), frase de la jugada (C1), corte de la clasificación y modelo de la hoja final (bloques, botones,
 * pestañas). Textos: sin «·», sin «1.er», sin «bola de set» y etiquetas ≤ 28 caracteres.
 * Uso: node tools/recaptest.js [-v]   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const verbose = process.argv.includes('-v');
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; if (verbose) console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }
function load(extra) {
  const ctx = { console, Math, JSON }; ctx.globalThis = ctx; ctx.window = ctx;
  if (extra) Object.assign(ctx, extra);
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/recap.js'), 'utf8'), ctx, { filename: 'js/recap.js' });
  return ctx.VB.Recap;
}
const R = load();
// todos los textos de un objeto (recorrido profundo)
function texts(o, out) {
  out = out || [];
  if (typeof o === 'string') out.push(o);
  else if (Array.isArray(o)) o.forEach(x => texts(x, out));
  else if (o && typeof o === 'object') for (const k in o) if (typeof o[k] !== 'function') texts(o[k], out);
  return out;
}
const allTexts = [];
function checkTexts(o, what) {
  const t = texts(o); allTexts.push(...t);
  const bad = t.filter(s => /·|\d\.er|\d\.º|[Bb]ola de (set|partido)|undefined|null|NaN|\{\w+\}/.test(s));
  ok(!bad.length, what + ': textos limpios' + (bad.length ? ' → ' + JSON.stringify(bad) : ''));
}

// ------------------------------------------------------------------ API
section('API');
['ord', 'move', 'trait', 'introPlan', 'history', 'stake', 'headline', 'playPhrase', 'tableSlice', 'endModel'].forEach(k => ok(typeof R[k] === 'function', 'VB.Recap.' + k));
ok(R.DUR.mini === 2.5 && R.DUR.short === 4.5 && R.DUR.long === 6, 'DUR = {mini:2.5, short:4.5, long:6}');
ok(R.END_CELEB === 3, 'END_CELEB = 3');
ok(Array.isArray(R.TRAITS) && R.TRAITS.length === 7 && R.STAKES && R.STAKES.final && R.STAKES.duel, 'TRAITS (7) y STAKES');

// ------------------------------------------------------------------ ord / move
section('ord y move');
ok(R.ord(1) === '1r' && R.ord(2) === '2º' && R.ord(3) === '3r' && R.ord(4) === '4º' && R.ord(11) === '11º' && R.ord(13) === '13º', 'ord 1r 2º 3r 4º 11º 13º');
let anyEr = false; for (let i = 1; i <= 40; i++) if (/\.er|\.º/.test(R.ord(i))) anyEr = true;
ok(!anyEr, 'ningún ordinal con «.er» ni «.º»');
ok(R.ord(0) === '', 'ord(0) vacío');
ok(R.move(5, 3).txt === '▲2' && R.move(5, 3).d === 2, 'move(5,3) → ▲2');
ok(R.move(3, 4).txt === '▼1' && R.move(3, 4).d === -1, 'move(3,4) → ▼1');
ok(R.move(2, 2).txt === '=', 'move(2,2) → =');
ok(R.move(0, 3).txt === '', 'move sin posición previa → sin flecha');

// ------------------------------------------------------------------ trait
section('trait');
const base = { jump: 50, speed: 50, react: 50, recv: 50, dig: 50, set: 50, spike: 50, ctl: 50, block: 50, serve: 50 };
ok(R.trait(Object.assign({}, base, { spike: 80 }), Object.assign({}, base, { spike: 70 })).t === 'Pegan fuerte', 'spike alto → «Pegan fuerte»');
ok(R.trait(Object.assign({}, base, { serve: 70 }), base).t === 'Sacan bien', 'saque → «Sacan bien»');
ok(R.trait(Object.assign({}, base, { dig: 75 }), base).t === 'Defienden todo', 'defensa → «Defienden todo»');
ok(R.trait(Object.assign({}, base, { spike: 70, block: 68 }), Object.assign({}, base, { spike: 70, block: 68 })).t === 'Equilibrados', 'dos primeros a menos de 3 → «Equilibrados»');
ok(R.trait(null, null) === null && R.trait(null) === null, 'sin atributos → null');
ok(R.trait([Object.assign({}, base, { block: 90 }), base, base]).k === 'block', 'array de atletas (6v6) → muro');

// ------------------------------------------------------------------ introPlan
section('introPlan');
function planOk(p, what) {
  ok(p && p.dur <= 6 && p.dur > 0, what + ': dur ≤ 6 (' + (p && p.dur) + ')');
  let sorted = true; for (let i = 1; i < p.beats.length; i++) if (p.beats[i].at < p.beats[i - 1].at) sorted = false;
  ok(sorted && p.beats[0].id === 'A' && p.beats[0].at === 0, what + ': beats ordenados desde A');
  ok(p.b.length <= 2, what + ': beat B con ≤ 2 datos');
  ok(p.dur === R.DUR[p.kind], what + ': dur = DUR[kind]');
  checkTexts(p, what);
}
let p = R.introPlan({ diff: 'normal', diffName: 'Normal', byD: [5, 2], winRun: 0, size: 2 });
planOk(p, 'rápido');
ok(p.kind === 'short' && p.dur === 4.5, 'Partido rápido → short 4,5');
ok(p.b[0] === 'Tu balance en Normal: 5-2', 'beat B: «Tu balance en Normal: 5-2» (' + p.b[0] + ')');
ok(p.t[0].nm === 'TÚ' && p.t[1].nm === 'CPU' && p.t[0].sm === 'N.º 1 y N.º 2' && p.t[1].sm === 'Pareja rival', 'bloques TÚ/CPU con «N.º 1 y N.º 2» y «Pareja rival»');
ok(p.c === null && p.beats.length === 2, 'corta: sin beat C');
p = R.introPlan({ diffName: 'Normal', byD: null, winRun: 3, ctrlOne: true, nums: [7, 3] });
ok(p.b[0] === 'Tu primer partido en Normal' && p.b[1] === 'Llevas 3 victorias seguidas', 'primer partido y racha (' + p.b.join(' / ') + ')');
ok(p.t[0].sm === 'Llevas al n.º 7', 'Control Uno: «Llevas al n.º 7»');
p = R.introPlan({ again: true, diffName: 'Normal' });
planOk(p, 'revancha');
ok(p.kind === 'mini' && p.dur === 2.5 && p.beats.length === 1 && p.b.length === 0, 'again → mini 2,5 solo A');
p = R.introPlan({ size: 6, nums: [7], posName: 'Receptor' });
ok(p.t[0].sm === 'Tú: n.º 7, receptor' && p.t[1].sm === 'Equipo rival', '6v6: «Tú: n.º 7, receptor» / «Equipo rival» (' + p.t[0].sm + ')');

// la situación de la semana: no cuenta en el balance de Partido rápido; el beat B dice el intento de hoy
p = R.introPlan({ diff: 'hard', diffName: 'Difícil', byD: null, winRun: 0, size: 2, sit: { i: 2, tries: 3 } });
ok(p.b.length === 1 && p.b[0] === 'Intento 2 de 3 de hoy', 'situación: beat B «Intento 2 de 3 de hoy», sin balance ni racha (' + p.b.join(' | ') + ')');

const cs0 = { season: 2, phase: 'league', week: 4, round: 0, label: 'Circuito Regional · Jornada 5', me: 'GAN', rival: 'SÓL', meName: 'Voley Gandia', rivalName: 'Voley Sóller',
  player: 'Ares Belmonte', num: 7, mate: 'Iker Sanz', mateNum: 3, pos0: 3, rivalPos: 5, h2h: [3, 2, 1, 5, 3, 1], goal: 'Gana un set a cero' };
p = R.introPlan({ career: cs0, stA: Object.assign({}, base, { spike: 80 }), stA2: base, stB: base });
planOk(p, 'Carrera jornada 5');
ok(p.kind === 'short', 'Carrera jornada 5 → short');
ok(p.b[0] === 'Cara a cara: 2-1' && p.b[1] === 'Reto: gana un set a cero', 'beat B Carrera: cara a cara y reto (' + p.b.join(' / ') + ')');
ok(p.t[0].nm === 'Voley Gandia' && p.t[0].sm === 'Ares Belmonte y Iker Sanz' && p.t[0].pos === '3r' && p.t[1].pos === '5º', 'bloques con nombres, pareja y puesto 3r/5º');
ok(p.t[0].tr && p.t[0].tr.t === 'Pegan fuerte', 'rasgo de tu pareja');
ok(!texts(p).some(s => /CPU/.test(s)), 'Carrera: sin «CPU» en la previa');
p = R.introPlan({ career: Object.assign({}, cs0, { h2h: [0, 0, 0, 0, 0, 0], last: null }) });
ok(p.b[0] === 'Primera vez contra Voley Sóller', 'sin partidos: «Primera vez contra Voley Sóller»');
// 1r designado (career-world: cs.arb.line ≤ 44 letras): con recuerdo va antes del Reto; sin recuerdo, después (y se cae si no cabe)
{ const arbR = { name: 'Nerea Quirada Garbero', line: '1r: Nerea Quirada, te sacó amarilla en la J4', rec: true }, arbF = { name: 'Nerea Quirada Garbero', line: '1r: Nerea Quirada Garbero, fama de mano dura', rec: false };
  let q = R.introPlan({ career: Object.assign({}, cs0, { arb: arbR }) });
  ok(q.b.length === 2 && q.b[0] === 'Cara a cara: 2-1' && q.b[1] === arbR.line, '1r con recuerdo: cara a cara y designación, antes que el Reto (' + q.b.join(' / ') + ')');
  q = R.introPlan({ career: Object.assign({}, cs0, { arb: arbF }) });
  ok(q.b.length === 2 && q.b[1] === 'Reto: gana un set a cero', '1r sin recuerdo: el Reto va antes (' + q.b.join(' / ') + ')');
  q = R.introPlan({ career: Object.assign({}, cs0, { arb: arbF, goal: '' }) });
  ok(q.b[1] === arbF.line, '1r sin recuerdo y sin Reto: sale la designación (' + q.b[1] + ')');
  q = R.introPlan({ career: Object.assign({}, cs0, { arb: arbR }), again: true });
  ok(q.kind === 'mini' && !q.beats.some(b => b.id === 'B'), 'previa mini (reinicio): sin beat B ni designación');
  ok([arbR.line, arbF.line].every(s => s.length <= 44 && !/·/.test(s)), 'líneas de designación ≤ 44 letras y sin «·»');
  const W = (() => { const fs = require('fs'), path = require('path'), vm = require('vm'), cx = { console, Math, Date, JSON }; cx.globalThis = cx; cx.window = cx; vm.createContext(cx);
    for (const f of ['js/career.js', 'js/career-world.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), cx, { filename: f }); return cx.VB.CareerWorld; })();
  const lines = []; for (let s = 1; s <= 60; s++) W.arbPanel({ seed: s }, 'B1').forEach(r => {
    lines.push(W.arbLine({ season: 3 }, { ref: r }, true).t);
    lines.push(W.arbLine({ season: 3, world: { arb: { p: { [r.id]: { m: 3, y: 1, ev: { s: 3, wk: 'J14', k: 'yellow' } } } } } }, { ref: r }, false).t);
    lines.push(W.arbLine({ season: 3, world: { arb: { p: { [r.id]: { m: 3, br: 1, ev: { s: 3, wk: 'J12', k: 'brake', n: 'Maximiliano'.slice(0, 10) } } } } } }, { ref: r }, false).t);
    lines.push(W.arbLine({ season: 3, world: { arb: { p: { [r.id]: { m: 3, r: 1, ev: { s: 2, wk: 'semifinal', k: 'red' } } } } } }, { ref: r }, false).t);
  });
  ok(lines.every(s => /^1r: /.test(s) && s.length <= 44 && !/·/.test(s) && !/undefined/.test(s)), 'arbLine: ' + lines.length + ' líneas ≤ 44 letras, sin «·» (la más larga: ' + Math.max(...lines.map(s => s.length)) + ')'); }
p = R.introPlan({ career: Object.assign({}, cs0, { last: [2, 0] }) });
ok(p.b[0] === 'Cara a cara: 2-1 | el último, 2-0', 'con último resultado (' + p.b[0] + ')');
p = R.introPlan({ career: Object.assign({}, cs0, { week: 0, first: true, league: 'Circuito Regional' }) });
planOk(p, 'Carrera 1ª jornada');
ok(p.kind === 'long' && p.dur === 6 && p.c && p.c.t1 === 'Empieza la temporada 2' && p.c.t2 === 'Circuito Regional', '1ª jornada → long «Empieza la temporada 2»');
ok(p.beats.map(b => b.id).join('') === 'ABC' && p.beats[2].at > p.beats[1].at, 'larga: beats A, B, C');
ok(p.t[0].pos === '', '1ª jornada: sin puesto');
p = R.introPlan({ career: Object.assign({}, cs0, { week: 0 }) });
ok(p.kind === 'long' && p.c.k === 'first', 'sin «first»: se deduce de liga y semana 0');
p = R.introPlan({ career: Object.assign({}, cs0, { week: 0, first: false }) });
ok(p.kind === 'short', 'first:false explícito manda');
p = R.introPlan({ career: Object.assign({}, cs0, { phase: 'cup', label: 'Final del Open', round: 1 }) });
planOk(p, 'final');
ok(p.kind === 'long' && p.c.k === 'final' && p.c.t1 === 'Final del Open' && p.c.t2 === 'Gana y levantas el trofeo', 'final → long «Final del Open»');
p = R.introPlan({ career: Object.assign({}, cs0, { phase: 'cup', label: 'Semifinal del Open', round: 0 }) });
ok(p.kind === 'long' && p.c.k === 'semi' && p.c.t1 === 'Semifinal', 'semifinal → long');
p = R.introPlan({ career: Object.assign({}, cs0, { mode: 'hall', phase: 'ko', label: 'Copa Ibérica · Final' }) });
ok(p.kind === 'long' && p.c.t1 === 'Final: Copa Ibérica', 'final de copa en la pista (' + (p.c && p.c.t1) + ')');
const duelCs = Object.assign({}, cs0, { duel: true, rivalInfo: { name: 'Dani Roca', w: 2, l: 3 } });
p = R.introPlan({ career: duelCs });
planOk(p, 'duelo');
ok(p.kind === 'long' && p.c.k === 'duel' && p.c.t1 === 'Duelo con tu rival' && p.c.t2 === 'Dani Roca | 2-3 en duelos', 'duelo → long (' + JSON.stringify(p.c) + ')');
ok(p.b[0] === 'Duelos con Dani Roca: 2-3', 'duelo: historial de duelos (' + p.b[0] + ')');
ok(p.t[1].sm === 'Con Dani Roca, tu rival', 'duelo: «Con Dani Roca, tu rival»');
p = R.introPlan({ career: Object.assign({}, cs0, { boss: { name: 'Toni Ferrer', nick: 'El Muro', style: 'Muro', num: 4, h2h: [0, 0, 0] } }) });
ok(p.kind === 'long' && p.c.k === 'boss' && p.c.t1 === 'Jefe: El Muro' && p.c.t2 === 'Muro' && p.t[1].tr.t === 'Muro', 'jefe → long «Jefe: El Muro» con su estilo de rasgo');
p = R.introPlan({ career: Object.assign({}, cs0, { week: 0, first: true }), again: true });
ok(p.kind === 'mini' && p.c === null, 'again manda sobre la larga');
p = R.introPlan({ kind: 'long', career: Object.assign({}, cs0, { week: 0, first: true }) });
ok(p.kind === 'long', 'kind forzado');
// «Carrera con vida» (P3): partido marcado → su línea de previa como t1 (con la clave y el t2 de siempre); sin story, como antes
{
  const ln = 'Revancha: la última vez Voley Cádiz os ganó 2-0. Mira que no ha dormido bien desde entonces.';
  const st0 = R.stake({ career: cs0 }), stD = R.stake({ career: duelCs });
  const sA = R.stake({ career: Object.assign({}, cs0, { story: { tag: 'rev', name: 'Revancha', line: ln } }) });
  ok(sA && sA.t1 === ln && sA.k === 'story' && sA.t2 === '', 'stake: career.story.tag → su línea como t1 (' + JSON.stringify(sA) + ')');
  const sD = R.stake({ career: Object.assign({}, duelCs, { story: { tag: 'duel', line: 'Duelo: hoy toca contestar.' } }) });
  ok(sD && sD.k === 'duel' && sD.t1 === 'Duelo: hoy toca contestar.' && sD.t2 === stD.t2, 'stake: con duelo, la línea de story y el t2 del duelo');
  ok(JSON.stringify(R.stake({ career: Object.assign({}, cs0, { story: { tag: '', line: 'x' } }) })) === JSON.stringify(st0) &&
    JSON.stringify(R.stake({ career: Object.assign({}, duelCs, { story: null }) })) === JSON.stringify(stD), 'stake: sin etiqueta (o sin story) queda como antes');
  p = R.introPlan({ career: Object.assign({}, cs0, { story: { tag: 'tv', line: 'Televisado: hoy hay cámaras.' } }) });
  ok(p.kind === 'long' && p.c && p.c.t1 === 'Televisado: hoy hay cámaras.', 'introPlan: partido marcado → previa larga con su línea');
}
for (let s = 0; s < 200; s++) {
  const pp = R.introPlan({ again: s % 7 === 0, career: s % 2 ? Object.assign({}, cs0, { week: s % 5, first: s % 5 === 0, duel: s % 3 === 0, rivalInfo: { name: 'X Y', w: 1, l: 1 } }) : null });
  if (!(pp.dur <= 6)) { ok(false, 'dur > 6 en el caso ' + s); break; }
}
ok(true, '200 planes con dur ≤ 6');

// ------------------------------------------------------------------ headline
section('headline');
const pl0 = [{ num: 1, team: 0, pts: 8, kills: 6, blocks: 1, aces: 1 }, { num: 2, team: 0, pts: 6, kills: 5, blocks: 0, aces: 1 },
  { num: 1, team: 1, pts: 7, kills: 7, blocks: 0, aces: 0 }, { num: 9, team: 1, pts: 5, kills: 4, blocks: 1, aces: 0 }];
const dull = { sets: [2, 1], setScores: [[21, 18], [19, 21], [15, 11]], to: 21, pl: pl0 };
ok(R.headline(dull, 1) === '', 'sin nada destacable → «»');
function H(d, seed) { return R.headline(d, seed == null ? 12345 : seed); }
function twoSeeds(d) { const a = new Set(); for (let s = 0; s < 40; s++) a.add(H(d, s)); return [...a]; }
const cases = {
  spSave: Object.assign({}, dull, { moments: [{ k: 'spSave', team: 0, n: 3, setNo: 2, who: { num: 1, team: 0 }, won: true }] }),
  spSaveMatch: Object.assign({}, dull, { moments: [{ k: 'spSave', team: 0, n: 2, setNo: 3, who: { num: 2, team: 0 }, match: true, won: true }] }),
  spSaveTot: Object.assign({}, dull, { spSaved: [2, 0] }),
  closeAce: Object.assign({}, dull, { close: { how: 'ace', who: { num: 7, team: 0 } } }),
  closeBlock: Object.assign({}, dull, { close: { how: 'block', who: { num: 2, team: 0 } } }),
  comebackSet: Object.assign({}, dull, { setScores: [[18, 21], [21, 19], [15, 12]] }),
  comeback: Object.assign({}, dull, { setScores: [[21, 18], [17, 21], [15, 12]], moments: [{ k: 'comeback', team: 0, n: 6, setNo: 3 }] }),
  aces: Object.assign({}, dull, { pl: pl0.map((p, i) => i === 1 ? Object.assign({}, p, { aces: 4 }) : p) }),
  blocks: Object.assign({}, dull, { pl: pl0.map((p, i) => i === 0 ? Object.assign({}, p, { blocks: 3 }) : p) }),
  rally: Object.assign({}, dull, { moments: [{ k: 'rally', team: 0, n: 22, setNo: 1 }] }),
  rallyNum: Object.assign({}, dull, { longest: 20 }),
  streak: Object.assign({}, dull, { moments: [{ k: 'streak', team: 0, n: 7, setNo: 1 }] }),
  tight: Object.assign({}, dull, { setScores: [[21, 18], [19, 21], [16, 14]] }),
  noChance: Object.assign({}, dull, { sets: [2, 0], setScores: [[21, 12], [21, 10]] })
};
const expect = {
  spSave: [/^¡Tu n\.º 1 salva 3 puntos de set y se lleva el segundo set!$/, /^Tu n\.º 1 salva 3 puntos de set en el segundo set$/],
  spSaveMatch: [/^¡Tu n\.º 2 salva 2 puntos de partido y gana!$/, /^Tu n\.º 2 levanta 2 puntos de partido y gana$/],
  spSaveTot: [/^Tu n\.º 1 salva 2 puntos de set$/],
  closeAce: [/^¡Tu n\.º 7 cierra el partido con un ace!$/, /^Tu n\.º 7 pone el punto final con un ace$/],
  closeBlock: [/^¡Tu n\.º 2 cierra el partido con un muro!$/, /^Tu n\.º 2 cierra el partido con un bloqueo$/],
  comebackSet: [/^Tu pareja remonta un set en contra$/, /^Tu pareja gana tras perder el primer set$/],
  comeback: [/^Remontada de 6 puntos en el tercer set$/, /^Tu pareja remonta 6 puntos en el tercer set$/],
  aces: [/^Tu n\.º 2 firma 4 aces$/, /^Tu n\.º 2 hace daño con el saque: 4 aces$/],
  blocks: [/^Tu n\.º 1 levanta un muro: 3 puntos de bloqueo$/, /^Tu n\.º 1 manda en la red: 3 bloqueos$/],
  rally: [/^Jugada de 22 toques en el primer set, y se la lleva tu pareja$/, /^Una jugada de 22 toques para el recuerdo$/],
  rallyNum: [/^Una jugada de 20 toques para el recuerdo$/],
  streak: [/^Tu pareja enlaza 7 puntos seguidos en el primer set$/, /^Racha de 7 puntos seguidos de tu pareja$/],
  tight: [/^Final apretado en el tercer set \(16-14\)$/, /^Se decide en el tercer set por la mínima: 16-14$/],
  noChance: [/^Sin dar opción: 21-12 y 21-10$/, /^Tu pareja no da opción: 21-12 y 21-10$/]
};
for (const k in cases) {
  const vs = twoSeeds(cases[k]);
  ok(vs.length === expect[k].length && vs.every(v => expect[k].some(re => re.test(v))), 'regla ' + k + ': ' + JSON.stringify(vs));
  ok(H(cases[k], 777) === H(cases[k], 777), 'regla ' + k + ': determinista con la misma semilla');
  checkTexts(vs, 'titular ' + k);
}
// orden de la tabla: spSave gana a todo lo demás; cierre gana a remontada; aces gana a racha
const mix = Object.assign({}, cases.comebackSet, { close: cases.closeAce.close, moments: cases.streak.moments.concat(cases.spSave.moments), pl: cases.aces.pl });
ok(/salva 3 puntos de set/.test(H(mix)), 'orden: puntos de set salvados primero (' + H(mix) + ')');
delete mix.moments; ok(/ace/.test(H(mix)) && /cierra|punto final/.test(H(mix)), 'orden: cierre con ace antes que remontada (' + H(mix) + ')');
delete mix.close; ok(/remonta|primer set/.test(H(mix)), 'orden: remontada antes que aces (' + H(mix) + ')');
// umbrales
ok(H(Object.assign({}, dull, { moments: [{ k: 'spSave', team: 0, n: 1, setNo: 1 }] })) === '', 'spSave con 1 → nada');
ok(H(Object.assign({}, dull, { moments: [{ k: 'rally', team: 0, n: 13, setNo: 1 }] })) === '', 'jugada de 13 → nada');
ok(H(Object.assign({}, dull, { moments: [{ k: 'streak', team: 0, n: 5, setNo: 1 }] })) === '', 'racha de 5 → nada');
ok(H(Object.assign({}, cases.noChance, { setScores: [[21, 13], [21, 10]] })) === '', '2-0 con un set a 13 → no «sin dar opción»');
ok(H(Object.assign({}, dull, { watch: true, close: cases.closeAce.close })) === '', 'espectador 6v6 → sin titular');
// el rival: su nombre en Partido rápido y en la Carrera
const rivalAces = Object.assign({}, dull, { sets: [1, 2], setScores: [[18, 21], [21, 19], [11, 15]], pl: pl0.map((p, i) => i === 3 ? Object.assign({}, p, { aces: 5 }) : p) });
ok(/^El n\.º 9 de la CPU (firma 5 aces|hace daño)/.test(H(rivalAces)), 'rápido: «El n.º 9 de la CPU…» (' + H(rivalAces) + ')');
// Carrera: nombres (apellido), «del {club}» y nunca «CPU»
const csH = { player: 'Ana Belmonte', num: 7, mate: 'Iker Sanz', mateNum: 3, meName: 'Voley Gandia', rival: 'SÓL', rivalName: 'Voley Sóller', rivalNum: 4, rivalP: 'Dani Roca' };
const plC = [{ num: 7, team: 0, pts: 9, kills: 5, aces: 4, blocks: 0 }, { num: 3, team: 0, pts: 5, kills: 4, blocks: 1, aces: 0 }, { num: 4, team: 1, pts: 8, kills: 8 }, { num: 9, team: 1, pts: 4, kills: 4 }];
ok(/^Belmonte (firma 4 aces|hace daño con el saque: 4 aces)$/.test(H({ sets: [2, 0], setScores: [[21, 15], [21, 17]], pl: plC, career: csH })), 'Carrera: apellido de tu jugador');
ok(/^¡?Sanz (salva|levanta)/.test(H({ sets: [2, 1], setScores: [[21, 15], [19, 21], [15, 13]], pl: plC, career: csH, moments: [{ k: 'spSave', team: 0, n: 2, setNo: 3, who: { num: 3, team: 0 }, match: true }] }).replace('¡', '')), 'Carrera: apellido del compañero');
ok(/^¡?Roca /.test(H({ sets: [0, 2], setScores: [[15, 21], [17, 21]], pl: plC, career: csH, close: { how: 'ace', who: { num: 4, team: 1 } } }).replace('¡', '')), 'Carrera: apellido del rival personal en el duelo');
const r9 = H({ sets: [0, 2], setScores: [[15, 21], [17, 21]], pl: plC, career: csH, close: { how: 'block', who: { num: 9, team: 1 } } });
ok(/El n\.º 9 del Voley Sóller cierra el partido/.test(r9), 'Carrera: «El n.º 9 del Voley Sóller» (' + r9 + ')');
let cpuInCareer = []; const careerKs = Object.keys(cases);
for (const k of careerKs) for (let s = 0; s < 6; s++) {
  const d = Object.assign({}, cases[k], { career: csH, pl: plC.map(p => Object.assign({}, p, cases[k].pl && k === 'aces' && p.num === 7 ? { aces: 4 } : {})) });
  const t = H(d, s); if (/CPU/.test(t)) cpuInCareer.push(t);
  checkTexts(t, 'titular Carrera ' + k);
}
ok(!cpuInCareer.length, 'Carrera: ningún titular con «CPU» ' + JSON.stringify(cpuInCareer));
const st1 = H(Object.assign({}, cases.streak, { career: csH }));
ok(/^El Voley Gandia enlaza|^Racha de 7 puntos seguidos del Voley Gandia$/.test(st1), 'Carrera: «El Voley Gandia» / «del Voley Gandia» (' + st1 + ')');
// variantes repartidas
let v0 = 0; for (let s = 0; s < 400; s++) if (/^¡/.test(H(cases.closeAce, s))) v0++;
ok(v0 > 120 && v0 < 280, 'variantes repartidas con h01 (' + v0 + '/400)');

// ------------------------------------------------------------------ playPhrase
section('playPhrase');
ok(R.playPhrase({ how: 'kill', team: 0, who: { num: 7, team: 0 } }, {}) === 'Remate del n.º 7', '«Remate del n.º 7»');
ok(R.playPhrase({ how: 'kill', move: 'roll', who: { num: 7, team: 0 } }, {}) === 'Golpe colocado del n.º 7', 'roll → golpe colocado');
ok(R.playPhrase({ how: 'kill', move: 'feint', who: { num: 7, team: 0 } }, {}) === 'Finta del n.º 7', 'feint → finta');
ok(R.playPhrase({ how: 'tip', who: 2 }, {}) === 'Dejada del n.º 2', 'tip → dejada');
ok(R.playPhrase({ how: 'block', who: { num: 4, team: 1 }, digs: 3 }, {}) === 'Bloqueo del n.º 4 tras 3 defensas', 'bloqueo con defensas');
ok(R.playPhrase({ how: 'ace', who: { num: 1, team: 0 }, savedSetPoint: true }, {}) === 'Ace del n.º 1 salvando un punto de set', 'ace salvando un punto de set (R2)');
ok(R.playPhrase({ how: 'error', rallyHits: 17, digs: 4, savedSetPoint: true }, {}) === 'Peloteo de 17 toques tras 4 defensas, salvando un punto de set', 'error → peloteo con sufijos');
ok(R.playPhrase({ how: 'kill', who: { num: 7, team: 0 }, savedMatchPoint: true }, {}) === 'Remate del n.º 7 salvando un punto de partido', 'punto de partido salvado');
const gC = { career: { player: 'Ares Belmonte', num: 7, mate: 'Iker Sanz', mateNum: 3 } };
ok(R.playPhrase({ how: 'kill', who: { num: 7, team: 0 } }, gC) === 'Remate de Ares Belmonte', 'Carrera: tu nombre');
ok(R.playPhrase({ how: 'ace', who: { num: 3, team: 0 } }, gC) === 'Ace de Iker Sanz', 'Carrera: el compañero');
ok(R.playPhrase({ how: 'ace', who: { num: 7, team: 1 } }, gC) === 'Ace del n.º 7', 'Carrera: el rival con el mismo dorsal no es tú');
checkTexts([R.playPhrase({ how: 'free', rallyHits: 1 }, {})], 'playPhrase free');

// ------------------------------------------------------------------ tableSlice
section('tableSlice');
const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((id, i) => ({ id, pts: 30 - i * 3, pos: i + 1 }));
const shortOf = id => 'C' + id;
let ts = R.tableSlice(rows, 3, 5, shortOf);
ok(ts.rows.length === 3 && ts.rows.map(r => r.id).join() === '2,3,4' && ts.rows[1].me && ts.move.txt === '▲2' && ts.rows[1].posT === '3r' && ts.rows[0].short === 'C2', 'centro: 2º, 3r ▲2, 4º');
ts = R.tableSlice(rows, 1, 1, shortOf); ok(ts.rows.map(r => r.id).join() === '1,2,3' && ts.move.txt === '=', 'primero: 1-3 y «=»');
ts = R.tableSlice(rows, 8, 7, shortOf); ok(ts.rows.map(r => r.id).join() === '6,7,8' && ts.move.txt === '▼1', 'último: 6-8 y ▼1');
ts = R.tableSlice(rows, 4, 0, shortOf); ok(ts.move.txt === '', '1ª jornada (pos0 0): sin flecha');
ts = R.tableSlice(rows.slice(0, 2), 2, 2); ok(ts.rows.length === 2, 'tabla de 2 clubes');
ts = R.tableSlice(rows, 99, 3); ok(ts.rows.length === 0, 'sin tu club → vacío');

// ------------------------------------------------------------------ endModel
section('endModel');
function labelsOk(M, what) {
  const L = [];
  if (M.buttons) { L.push(M.buttons.primary.label); M.buttons.rest.forEach(b => L.push(b.label)); }
  Object.values(M.tabLabels).forEach(t => L.push(t)); Object.values(M.heads).forEach(t => L.push(t));
  if (M.unlocks) M.unlocks.chips.forEach(c => L.push(c));
  const long = L.filter(s => s.length > 28);
  ok(!long.length, what + ': etiquetas ≤ 28 ' + (long.length ? JSON.stringify(long) : ''));
  checkTexts(M, what);
}
// Partido rápido
let M = R.endModel(Object.assign({}, cases.aces, { seed: 5, win: true, kicker: ['Platja Llarga', 'Nivel Normal | Sets a 21'], aw: [{ num: 1, xp: 184, lvl: 7, lvlUp: true, pts: 3, cur: 40, need: 360 }, { num: 2, xp: 150, lvl: 6, cur: 300, need: 320 }], badges: [{ id: 'canon', name: 'Cañón', lvl: 1 }], altDiffName: 'Difícil', plays: 0 }));
labelsOk(M, 'rápido');
ok(M.buttons.primary.id === 'again' && M.buttons.primary.label === 'Revancha', 'rápido: principal «Revancha»');
ok(M.buttons.rest.map(b => b.label).join('|') === 'Revancha en Difícil|Cambiar opciones|Menú principal', 'rápido: secundarios');
ok(M.title === '¡Victoria!' && M.score.a === 'TÚ' && M.score.b === 'CPU', 'título y marcador');
ok(M.tabs.join() === 'sum,stats', 'sin jugadas: sin pestaña «plays»');
ok(M.mvp && M.mvp.name === 'N.º 1' && M.mvp.ptsT === '8 puntos' && M.mvp.parts.join(' | ') === '6 de ataque | 1 de bloqueo | 1 ace', 'MVP rápido «N.º 1», 8 puntos (' + JSON.stringify(M.mvp) + ')');
ok(M.xp.length === 2 && M.xp[0].t === '+184 XP' && M.xp[0].lvlT === '¡Nivel 7! +3 puntos' && Math.abs(M.xp[0].bar - 40 / 360) < 1e-9, 'XP por atleta con nivel y barra');
ok(M.headline && M.blocks[0] === 'headline' && M.blocks.indexOf('mvp') > 0 && M.blocks.indexOf('badges') > M.blocks.indexOf('xp'), 'bloques en orden (' + M.blocks.join() + ')');
ok(M.table === null && M.cup === '' && M.life.length === 0, 'rápido: sin tabla, copa ni vida');
M = R.endModel(Object.assign({}, dull, { sets: [0, 2], setScores: [[15, 21], [16, 21]], win: false, plays: 3, pl: pl0.map((p, i) => i === 2 ? Object.assign({}, p, { pts: 10 }) : p) }));
ok(M.title === 'Gana la CPU' && M.mvp === null && M.mvpRival && M.mvpRival.t === 'MVP rival: N.º 1, 10 puntos', 'derrota: «Gana la CPU» y MVP rival en pequeño (' + (M.mvpRival && M.mvpRival.t) + ')');
ok(M.tabs.join() === 'sum,stats,plays' && M.tabLabels.plays === 'Jugadas (3)', 'con jugadas: pestaña «Jugadas (3)»');
ok(R.endModel(Object.assign({}, dull, { plays: 3, size: 6 })).tabs.length === 2, '6v6: sin pestaña de jugadas');
ok(R.endModel(Object.assign({}, dull, { plays: 3, drill: true })).tabs.length === 2, 'Entrenamiento: sin pestaña de jugadas');
ok(R.endModel(Object.assign({}, dull, { watch: true })).buttons === null, '6v6 espectador: botones de hoy (null)');
M = R.endModel(Object.assign({}, dull, { reto: true }));
ok(M.buttons.primary.label === 'Otra vez' && M.buttons.rest[0].label === 'Retos', 'reto: «Otra vez» y «Retos»');
M = R.endModel(Object.assign({}, dull, { unlocks: ['a', 'b', 'c', 'd'] }));
ok(M.unlocks.t === 'Nuevo en tu vestuario: 4 objetos' && M.unlocks.chips.length === 3 && M.unlocks.more === 1, 'desbloqueos: 4 objetos, 3 chips y +1');
M = R.endModel(Object.assign({}, dull, { unlocks: [{ id: 'x', name: 'Cinta de rizo' }] }));
ok(M.unlocks.t === 'Nuevo en tu vestuario: Cinta de rizo', 'un desbloqueo con nombre');
const RL = load({ VB: { Look: { name: id => id === 'hb1' ? 'Cinta de rizo' : '' } } });
ok(RL.endModel(Object.assign({}, dull, { unlocks: ['hb1'] })).unlocks.t === 'Nuevo en tu vestuario: Cinta de rizo', 'con VB.Look.name (guardado)');
ok(R.endModel(Object.assign({}, dull, { unlocks: ['hb1'] })).unlocks.t === 'Nuevo en tu vestuario: hb1', 'sin VB.Look: el id, sin romper');
M = R.endModel(Object.assign({}, dull, { profile: { xp: 45, lvl: 8, lvlUp: true, prize: 'Manguito de rayas' }, retos: { pills: [{ name: 'Pegada', lvl: 2 }, { name: 'Pared', lvl: 1, nw: true }, { name: 'Red', lvl: 3 }, { name: 'Saque', lvl: 1 }], xp: 30 } }));
ok(M.profile.t === 'Perfil: +45 XP' && M.profile.up === '¡Perfil Nv 8! Premio: Manguito de rayas', 'perfil');
ok(M.retos.pills[0].t === 'Pegada: plata' && M.retos.moreT === 'y 1 más' && M.retos.xpT === '+30 de experiencia por retos', 'retos: pastillas, «y 1 más» y XP');
labelsOk(M, 'rápido con perfil y retos');

// Carrera
const csE = Object.assign({}, cs0, { rivalNum: null });
const plE = [{ num: 7, team: 0, pts: 12, kills: 8, blocks: 2, aces: 2 }, { num: 3, team: 0, pts: 6, kills: 6 }, { num: 4, team: 1, pts: 9, kills: 9 }, { num: 9, team: 1, pts: 5, kills: 5 }];
const sumE = { season: 2, phase: 'league', label: 'Jornada 5', win: true, sets: [2, 0], nota: 7.8, xp: 210, lvlUp: true, lvl: 9, ptsGained: 3, badges: [],
  life: { fans: 1200, ch: { txt: 'Gana un set a cero', ok: true, prog: '2/2' }, duel: null, ach: [{ name: 'Pegada de oro' }, 'Muro'], chemUp: { lv: 2, name: 'Compenetrados', up: true } } };
M = R.endModel({ seed: 9, career: csE, sum: sumE, sets: [2, 0], setScores: [[21, 15], [21, 18]], pl: plE, table: { rows, myId: 3, pos0: 5, shortOf }, bar: { cur: 50, need: 200 }, next: 'league', plays: 2 });
labelsOk(M, 'Carrera');
ok(M.buttons.primary.id === 'next' && M.buttons.primary.label === 'Siguiente jornada' && M.buttons.rest.length === 1 && M.buttons.rest[0].label === 'Menú principal', 'Carrera: «Siguiente jornada» + «Menú principal»');
ok(!texts(M.buttons).some(s => /Revancha/.test(s)), 'Carrera: sin «Revancha»');
ok(M.kicker.join(' | ') === 'Circuito Regional | Jornada 5', 'antetítulo en partes (sin «·»)');
ok(M.mvp && M.mvp.name === 'Ares Belmonte' && M.mvp.nota === 'Nota 7,8' && M.nota === '7,8', 'MVP por nombre con nota 7,8');
ok(M.xp[0].name === 'Ares Belmonte' && M.xp[0].t === '+210 XP' && M.xp[0].lvlT === '¡Nivel 9! +3 puntos' && M.xp[0].bar === 0.25, 'XP de la Carrera con barra');
ok(M.table && M.table.move.txt === '▲2' && M.table.rows.length === 3, 'clasificación con ▲2');
ok(M.life.length === 3 && M.life[0] === '✓ Reto: Gana un set a cero (2/2)' && M.life[1] === '+1.200 seguidores' && M.life[2] === 'Logro: Pegada de oro', 'vida en 3 líneas (' + M.life.join(' / ') + ')');
ok(M.chem && M.chem.t === '▲ Química: Compenetrados', 'química');
ok(M.tabs.join() === 'sum,stats,plays', 'Carrera con jugadas');
ok(!texts(M).some(s => /CPU/.test(s)), 'Carrera: ningún texto con «CPU»');
M = R.endModel({ career: csE, sum: Object.assign({}, sumE, { phase: 'cup', label: 'Semifinal del Open' }), sets: [2, 1], setScores: [[21, 15], [19, 21], [15, 12]], pl: plE, next: 'final' });
ok(M.buttons.primary.label === 'Siguiente: final' && M.cup === 'Pasas a la final' && M.table === null, 'semifinal ganada: «Siguiente: final» y «Pasas a la final»');
M = R.endModel({ career: csE, sum: Object.assign({}, sumE, { phase: 'cup', label: 'Final del Open', review: { pos: 3 } }), sets: [2, 0], setScores: [[21, 15], [21, 12]], pl: plE });
ok(M.buttons.primary.label === 'Fin de temporada' && M.cup === '¡Campeones del Open!', 'final ganada: «Fin de temporada» y «¡Campeones del Open!» (' + M.cup + ')');
M = R.endModel({ career: csE, sum: Object.assign({}, sumE, { phase: 'cup', label: 'Semifinal del Open', win: false }), win: false, sets: [0, 2], setScores: [[15, 21], [18, 21]], pl: plE, phase: 'off' });
ok(M.cup === 'Fuera en semifinales' && M.buttons.primary.label === 'Fin de temporada' && M.title === 'Gana el Voley Sóller', 'semifinal perdida: «Fuera en semifinales», título con el rival');
M = R.endModel({ career: csE, sum: Object.assign({}, sumE, { review: { pos: 3 } }), sets: [2, 0], setScores: [[21, 15], [21, 18]], pl: plE, table: { rows, myId: 3, pos0: 5 } });
ok(M.cup === 'Fin de la liga: 3r' && M.table === null && M.buttons.primary.label === 'Fin de temporada', 'fin de liga: «Fin de la liga: 3r»');
M = R.endModel({ career: csE, sum: sumE, sets: [2, 0], setScores: [[21, 15], [21, 18]], pl: plE, table: { rows, myId: 3, pos0: 0 }, first: true });
ok(M.table && M.table.move.txt === '', '1ª jornada: tabla sin flecha');
// pista: nota null → «s. c.», minutos, MVP del rival con abreviatura
const csHall = { mode: 'hall', season: 1, phase: 'league', week: 3, label: 'Liga Sur · Jornada 4', me: 'GAN', rival: 'PAL', meName: 'Voley Gandia', rivalName: 'Palma Vòlei', player: 'Ares Belmonte', num: 7, posName: 'Receptor', mate: '', mateNum: 0 };
const sumHall = { mode: 'hall', phase: 'league', label: 'Jornada 4', nota: null, bench: true, xp: 30, part: { status: 'sub', started: false, entered: 2, pulled: 0, meR: 9, rallies: 52 }, life: null };
M = R.endModel({ career: csHall, sum: sumHall, size: 6, win: false, sets: [1, 2], setScores: [[25, 20], [21, 25], [12, 15]], pl: [{ num: 7, team: 0, pts: 2, kills: 2 }, { num: 10, team: 1, pts: 14, kills: 12, aces: 2 }], plays: 4, next: 'league' });
labelsOk(M, 'pista');
ok(M.nota === 's. c.', 'pista: nota null → «s. c.»');
ok(M.part && M.part.t === 'Entraste en el 2º set | 9 de 52 puntos', 'pista: línea de minutos (' + (M.part && M.part.t) + ')');
ok(M.mvpRival && M.mvpRival.t === 'MVP rival: N.º 10 (PAL), 14 puntos', 'pista: MVP rival «N.º 10 (PAL)» (' + (M.mvpRival && M.mvpRival.t) + ')');
ok(M.tabs.length === 2, 'pista (6v6): sin «Jugadas»');
ok(M.kicker.join(' | ') === 'Liga Sur | Jornada 4', 'pista: antetítulo');
M = R.endModel({ career: csHall, sum: Object.assign({}, sumHall, { phase: 'ko', label: 'Copa Ibérica · Final' }), size: 6, win: true, sets: [3, 1], setScores: [], pl: [] });
ok(M.cup === '¡Campeones de la Copa Ibérica!', 'pista: copa ganada (' + M.cup + ')');
// jefe (C3) y entreno (T)
M = R.endModel({ career: Object.assign({}, csE, { boss: { name: 'Toni Ferrer', nick: 'El Muro', style: 'Muro' } }), sum: sumE, sets: [2, 0], setScores: [[21, 15], [21, 18]], pl: plE, train: 'Entreno: +12 en saque' });
ok(M.boss && M.boss.t === 'Has tumbado a El Muro' && M.blocks.indexOf('boss') === M.blocks.indexOf('mvp') + 1 && M.train.t === 'Entreno: +12 en saque', 'jefe tumbado (justo tras el MVP, T24) y entreno como bloques');
// duelo en la vida
M = R.endModel({ career: duelCs, sum: Object.assign({}, sumE, { life: { duel: { name: 'Dani Roca', win: true, w: 3, l: 2 } } }), sets: [2, 0], setScores: [[21, 15], [21, 18]], pl: plE });
ok(M.life[0] === 'Duelo con Dani Roca: ganado (3-2)', 'duelo en la vida');

// ------------------------------------------------------------------ textos generales
section('Textos');
const bad = allTexts.filter(s => /·/.test(s));
ok(!bad.length, 'ningún «·» en ' + allTexts.length + ' textos');
ok(!allTexts.some(s => /\d\.er|\d\.º/.test(s)), 'ningún «1.er» ni «2.º»');
ok(!allTexts.some(s => /[Bb]ola de/.test(s)), '«punto de set», nunca «bola de set» (R2)');

console.log('\n' + passes + ' comprobaciones, ' + fails + ' fallos');
if (fails) { console.log('HAY FALLOS'); process.exit(1); }
console.log('TODO OK');
