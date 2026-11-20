#!/usr/bin/env node
/* TAKE THE COURT — tools/storywalltest.js (owner: carrera)
 * Prueba de Redes y partidos marcados de «Carrera con vida» (js/career-story-wall.js, notes/carrera-vida.md §2 S3 y §3 P3), en node
 * puro (vm, sin DOM), con tools/storyhelp.js:
 *   1. Muro de 3-5 entradas por jornada (2 en jornada de banquillo), en playa y en pista, varias temporadas.
 *   2. Ninguna plantilla se repite en 3 jornadas seguidas (ni dentro de la misma página).
 *   3. tagFor puro: dos llamadas iguales y la carrera sin cambios (JSON entero antes y después), para todo el calendario.
 *   4. Prioridad Duelo > Final / Eliminatoria > Jefe > Derbi > Revancha > Televisado; Revancha detectada (y su línea con el
 *      marcador); Televisado solo con fama ≥ 2º escalón y ~1 de cada 5.
 *   5. La etiqueta del partido simulado (ctx.played.tag) coincide con s.mk y con la que tenía el partido antes de jugarse.
 *   6. 'setup' deja m.career.story = {tag, name, line} y recap.stake la usa como t1.
 *   7. Publicar: una vez por jornada, efectos exactos por tono, no gasta tope; sin publicar el núcleo no cambia.
 *   8. pushWall (ecos de otros sistemas): entra en la página de la jornada sin pasar de 5, o en la siguiente.
 *   9. Textos: todas las variantes (playa y pista) y todas las páginas generadas sin «{», «undefined», «NaN», «.er» ni «·»;
 *      autores con nombre; me gusta «1,2 mil»; ui.wall y el sello sin restos.
 *  10. Determinismo (mismo muro dos veces) y sin azar del navegador en el fichero.
 * Uso: node tools/storywalltest.js [temporadas=3]   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./storyhelp.js');
const SEASONS = Math.max(1, +(process.argv[2] || 3));
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }
const BAD = /\{|\}|undefined|NaN|\.er\b|·/;

/** Arranque con un espía que corre DESPUÉS de wall y apunta cada página y el ctx de cada jornada. */
function bootSpy(extraFiles) {
  const B = H.boot({ extra: extraFiles || [] }), S = B.S, log = [];
  S.use({ id: 'spy', onMatch(c, sum, f, ctx) { log.push({ mN: ctx.mN, tag: ctx.played.tag, wk: ctx.played.wk, bench: !!sum.bench, page: JSON.parse(JSON.stringify(c.story.wall || null)), mk: c.story.mk && Object.assign({}, c.story.mk), nk: ctx.nk }); } });
  return { B, S, log, Wl: S.sys('wall'), WS: B.VB.CareerStoryWall };
}
const own = g => g.p.filter(p => !p.x && !p.me);

// ------------------------------------------------------------------ 1-2 y 9 (páginas): autopiloto
const runs = {};
for (const mode of ['beach', 'hall']) {
  section('1-2. Muro en ' + (mode === 'hall' ? 'pista' : 'playa') + ' (' + SEASONS + ' temporadas, 2 semillas)');
  let pages = 0, badN = [], benchN = 0, benchBad = 0, rep = 0, repEx = '', inPage = 0, txtBad = [], noAuthor = 0, tags = {};
  for (const seed of [31, 777]) {
    const X = bootSpy();
    const c = H.autopilot(X.B, { mode, seasons: SEASONS, seed });
    runs[mode + seed] = { X, c };
    const L = X.log;
    for (let j = 0; j < L.length; j++) {
      const g = L[j].page; if (!g) { badN.push('sin página en mN ' + L[j].mN); continue; }
      pages++;
      if (L[j].tag) tags[L[j].tag] = (tags[L[j].tag] || 0) + 1;
      if (g.bench) { benchN++; if (g.p.length !== 2) benchBad++; }
      else if (g.p.length < 3 || g.p.length > 5) badN.push('mN ' + g.mN + ': ' + g.p.length);
      // sin repetir: esta página contra las 3 anteriores (y dentro de ella)
      const keys = own(g).map(p => p.k + '.' + p.i);
      if (new Set(keys).size !== keys.length) inPage++;
      for (let b = Math.max(0, j - 3); b < j; b++) { const pg = L[b].page; if (!pg) continue; own(pg).forEach(p => { if (keys.indexOf(p.k + '.' + p.i) >= 0) { rep++; repEx = p.k + '.' + p.i + ' en mN ' + pg.mN + ' y ' + g.mN; } }); }
      // textos de la página
      g.p.forEach(p => { const t = X.Wl.postText(c, p); if (!t.t || BAD.test(t.t)) txtBad.push(t.t); if (!t.a || BAD.test(t.a)) noAuthor++; });
    }
  }
  ok(pages > 30 && !badN.length, pages + ' páginas con 3-5 entradas' + (badN.length ? ' — mal: ' + badN.slice(0, 5).join('; ') : ''));
  // (el autopiloto casi nunca se queda en el banquillo: se fuerzan jornadas de banquillo con el gancho, como hace benchNext)
  {
    const X = bootSpy(), K = X.B.C;
    H.autopilot(X.B, { mode, seasons: 1, seed: 5150 });
    const c = K.load(); let mN0 = c.story.mN;
    for (let j = 0; j < 6; j++) {
      if (j === 3) c.story.wallIn.push({ a: '@CronistaDeArena', t: 'Eco de prueba para {yo}.', v: {}, mN: c.story.mN });
      const win = j % 2 === 0;
      const sum = { season: c.season, phase: 'league', label: 'Jornada 1', rival: 0, rivalName: 'Rival de Prueba', win, sets: win ? [2, 0] : [0, 2], setScores: win ? [[21, 15], [21, 18]] : [[15, 21], [18, 21]],
        sim: true, bench: true, nota: null, me: { kills: 0, aces: 0, blocks: 0, assists: 0, digs: 0, errors: 0 } };
      X.S.hook(c, 'match', sum, { kind: 'league', week: j });
      const g = c.story.wall; benchN++;
      if (!g.bench || g.p.length !== 2 || g.p.some(p => BAD.test(X.Wl.postText(c, p).t))) benchBad++;
      if (!g.p.some(p => p.k === 'bench')) benchBad++;
    }
    ok(c.story.mN === mN0 + 6, mode + ': 6 jornadas de banquillo forzadas');
  }
  ok(benchN > 0 && benchBad === 0, 'banquillo: ' + benchN + ' páginas, todas con 2 entradas (una «¿Por qué no juega?»)' + (benchBad ? ' — mal: ' + benchBad : ''));
  ok(rep === 0 && inPage === 0, 'ninguna plantilla repetida en 3 jornadas seguidas ni en la misma página' + (rep ? ' — ' + rep + ' (' + repEx + ')' : '') + (inPage ? ' — repetidas en página: ' + inPage : ''));
  ok(!txtBad.length, 'textos de todas las páginas sin restos' + (txtBad.length ? ' — ' + txtBad.slice(0, 3).join(' / ') : ''));
  ok(noAuthor === 0, 'todas las publicaciones con autor (' + noAuthor + ' sin)');
  ok(Object.keys(tags).length > 0, 'partidos marcados jugados: ' + JSON.stringify(tags));
}

// ------------------------------------------------------------------ 3. tagFor puro
section('3. tagFor puro (todo el calendario, playa y pista)');
for (const mode of ['beach', 'hall']) {
  const { X, c } = runs[mode + 31];
  const K = X.B.C, W = X.WS;
  // una carrera a mitad de temporada (la siguiente, con notas y rival)
  const c2 = K.load();
  const k = K.myClub(c2), sched = mode === 'hall' ? K.sched(c2, k.lid) : c2.sched[k.lvl];
  const fx = [];
  sched.forEach((wk, w) => wk.forEach(m => { if (m[0] === k.id || m[1] === k.id) fx.push({ kind: 'league', week: w, home: m[0], away: m[1] }); }));
  fx.push(undefined, null, { kind: mode === 'hall' ? 'ko' : 'cup', round: 1, ko: 0, home: k.id, away: fx[0] ? (fx[0].home === k.id ? fx[0].away : fx[0].home) : 0 });
  const before = JSON.stringify(c2);
  const a = fx.map(f => W.tagFor(c2, f)), b = fx.map(f => W.tagFor(c2, f));
  const st = fx.map(f => W.stamp(c2, f)), ln = fx.map(f => W.line(c2, f));
  ok(JSON.stringify(a) === JSON.stringify(b), mode + ': dos llamadas, mismas etiquetas (' + a.filter(Boolean).join(',') + ')');
  ok(JSON.stringify(c2) === before, mode + ': la carrera no cambia (tagFor, stamp y line sobre ' + fx.length + ' partidos)');
  ok(st.every((s, i) => !a[i] === !s) && ln.every((s, i) => !a[i] === !s && !BAD.test(s)), mode + ': sello y línea solo con etiqueta, sin restos');
}

// ------------------------------------------------------------------ 4. prioridad, Revancha y Televisado
section('4. Prioridad de etiquetas, Revancha y Televisado');
for (const mode of ['beach', 'hall']) {
  const X = bootSpy(), K = X.B.C, W = X.WS;
  const c0 = mode === 'hall' ? K.create({ mode: 'hall', name: 'Tag', num: 8, pos: 'OH', seed: 9, now: 1 }) : K.create({ mode: 'beach', name: 'Tag', num: 7, role: 'atk', seed: 9, now: 1 });
  K.acceptOffer(c0.offers.findIndex(x => !x.trial), 2);
  const base = K.load(), k = K.myClub(base), sched = mode === 'hall' ? K.sched(base, k.lid) : base.sched[k.lvl];
  const fx = [];
  sched.forEach((wk, w) => wk.forEach(m => { if (m[0] === k.id || m[1] === k.id) fx.push({ kind: 'league', week: w, home: m[0], away: m[1] }); }));
  const rid = f => f.home === k.id ? f.away : f.home;
  const cl = () => JSON.parse(JSON.stringify(base));
  const L = X.B.VB.CareerLife;
  // una jornada «limpia» (sin jefe ni derbi) para las pruebas
  let f0 = null;
  for (const f of fx) { const c = cl(); c.life.rival = null; c.life.fame = 0; c.notes = []; if (W.tagFor(c, f) === '') { f0 = f; break; } }
  ok(!!f0, mode + ': hay una jornada sin etiqueta con la carrera recién empezada');
  if (!f0) continue;
  const R = rid(f0);
  // Revancha
  let c = cl(); c.life.rival = null; c.life.fame = 0; c.notes = [{ nota: 5, win: 0, sim: 1, kind: 'league', wk: 0, rival: R, s: [0, 2] }];
  ok(W.tagFor(c, f0) === 'rev', mode + ': perdiste el último contra ese club → Revancha');
  const ln = W.line(c, f0);
  ok(/2-0/.test(ln) && /^Revancha/.test(ln) && !BAD.test(ln), mode + ': línea de Revancha con el marcador (' + ln + ')');
  c.notes.push({ nota: 7, win: 1, sim: 1, kind: 'league', wk: 1, rival: R, s: [2, 1] });
  ok(W.tagFor(c, f0) === '', mode + ': si el último contra ese club lo ganaste, no hay Revancha');
  // Derbi > Revancha
  c = cl(); c.life.rival = null; c.life.fame = 0; c.notes = [{ nota: 5, win: 0, sim: 1, kind: 'league', wk: 0, rival: R, s: [0, 2] }];
  const rk = c.clubs.find(x => x.id === R), mk = c.clubs.find(x => x.id === k.id); rk.city = mk.city = 'Ciudad de Prueba';
  ok(W.tagFor(c, f0) === 'derby', mode + ': misma ciudad → Derbi (por encima de Revancha)');
  // Jefe > Derbi (solo playa)
  if (mode === 'beach') {
    const key = L.bossKey(c); c.life.boss = c.life.boss || {}; c.life.boss[key] = { k: key, name: 'Jefe de Prueba', nick: 'El Muro', style: Object.keys(L.BOSS_STYLES)[0], num: 4, club: R, w: 0, l: 0, beat: 0, seen: 0 };
    ok(W.tagFor(c, f0) === 'boss', 'beach: club del jefe → Jefe (por encima de Derbi)');
    const lb = W.line(c, f0); ok(/El Muro/.test(lb) && !BAD.test(lb), 'beach: línea del jefe con su apodo (' + lb + ')');
  } else {
    c.life.boss = { b0: { club: R, name: 'X', nick: 'Y', style: 'x' } };
    ok(W.tagFor(c, f0) === 'derby', 'hall: en la pista no hay jefe');
  }
  // Final / Eliminatoria > Jefe
  const fCup = mode === 'hall' ? { kind: 'ko', ko: 0, round: 0, home: k.id, away: R } : { kind: 'cup', round: 1, home: k.id, away: R };
  if (mode === 'hall') c.kos = [{ rounds: [[[k.id, R]]], res: [], round: 0, champion: -1, name: 'Copa' }];
  ok(W.tagFor(c, fCup) === 'final', mode + ': final de copa → Final (por encima de Jefe y Derbi)');
  const fSemi = mode === 'hall' ? { kind: 'ko', ko: 0, round: 0, home: k.id, away: R } : { kind: 'cup', round: 0, home: k.id, away: R };
  if (mode === 'hall') c.kos = [{ rounds: [[[k.id, R], [1, 2]], [[k.id, 1]]], res: [], round: 0, champion: -1, name: 'Copa' }];
  ok(W.tagFor(c, fSemi) === 'ko', mode + ': ronda previa → Eliminatoria');
  // Duelo > todo
  c.life.rival = { club: R, name: 'Rival de Prueba', num: 9, w: 1, l: 2 };
  ok(W.tagFor(c, fCup) === 'duel' && W.tagFor(c, f0) === 'duel', mode + ': club de tu rival personal → Duelo (por encima de todo)');
  const ld = W.line(c, f0); ok(/Rival de Prueba/.test(ld) && !BAD.test(ld), mode + ': línea del duelo con tu rival (' + ld + ')');
  // Televisado
  let tv0 = 0, tv1 = 0, n = 0;
  for (const f of fx) {
    const a = cl(); a.life.rival = null; a.notes = []; a.life.fame = 0;
    if (W.tagFor(a, f) === '') { n++; a.life.fame = 2500; if (W.tagFor(a, f) === 'tv') tv1++; a.life.fame = 600; if (W.tagFor(a, f) === 'tv') tv0++; }
  }
  // (más semillas para medir la frecuencia)
  let tvN = 0, tvT = 0;
  for (let sd = 1; sd <= 40; sd++) for (const f of fx) { const a = cl(); a.seed = sd; a.life.rival = null; a.notes = []; a.life.fame = 2500; const t = W.tagFor(a, f); if (t === '' || t === 'tv') { tvT++; if (t === 'tv') tvN++; } }
  ok(tv0 === 0, mode + ': sin el 2º escalón de fama, nunca Televisado (' + n + ' jornadas)');
  ok(tvT > 0 && tvN / tvT > 0.1 && tvN / tvT < 0.32, mode + ': con fama, Televisado en ~1 de cada 5 (' + tvN + ' de ' + tvT + ')');
}

// ------------------------------------------------------------------ 5. etiqueta del simulado = s.mk
section('5. La etiqueta del partido simulado coincide con s.mk');
for (const mode of ['beach', 'hall']) {
  const X = bootSpy(), K = X.B.C, W = X.WS, L = X.B.VB.CareerLife;
  const c0 = mode === 'hall' ? K.create({ mode: 'hall', name: 'Sim', num: 8, pos: 'OH', seed: 4242, now: 1 }) : K.create({ mode: 'beach', name: 'Sim', num: 7, role: 'atk', seed: 4242, now: 1 });
  K.acceptOffer(c0.offers.findIndex(x => !x.trial), 2);
  let n = 0, same = 0, mkOk = 0, tagged = 0, miss = [];
  for (let s = 0; s < 2; s++) {
    let g = 0;
    while (K.load().phase !== 'off' && g++ < 90) {
      const c = K.load(), nx = K.next(c); if (!nx) break;
      const exp = W.tagFor(c), mk = c.story.mk;
      const mkHit = mk && mk.k === K._wkKey(c) && mk.tag === exp;
      const l0 = X.log.length;
      if (nx.bench) K.benchNext(); else K.simulateNext();
      const ev = L.pendingEvent(K.load()); if (ev) L.answer(0);
      if (X.log.length === l0) break;
      n++; if (mkHit) mkOk++;
      const got = X.log[X.log.length - 1].tag;
      if (got === exp) same++; else miss.push(exp + '≠' + got);
      if (got) tagged++;
    }
    K.stay(1);
  }
  ok(n > 20 && mkOk === n, mode + ': antes de cada jornada s.mk = {k: _wkKey, tag: tagFor} (' + mkOk + ' de ' + n + ')');
  ok(same === n, mode + ': ctx.played.tag del simulado = la etiqueta que tenía (' + same + ' de ' + n + ', marcados ' + tagged + ')' + (miss.length ? ' — ' + miss.slice(0, 4).join(', ') : ''));
  ok(tagged > 0, mode + ': algún partido simulado marcado (' + tagged + ')');
}

// ------------------------------------------------------------------ 6. setup y recap
section('6. Previa: m.career.story y recap.stake');
for (const mode of ['beach', 'hall']) {
  const X = bootSpy(['js/recap.js']), K = X.B.C, W = X.WS, R = X.B.VB.Recap;
  const c0 = mode === 'hall' ? K.create({ mode: 'hall', name: 'Previa', num: 8, pos: 'OH', seed: 55, now: 1 }) : K.create({ mode: 'beach', name: 'Previa', num: 7, role: 'atk', seed: 55, now: 1 });
  K.acceptOffer(c0.offers.findIndex(x => !x.trial), 2);
  let seen = 0, okN = 0, plain = 0, plainOk = 0, g = 0;
  while (g++ < 60 && K.load().phase !== 'off') {
    const c = K.load(), nx = K.next(c); if (!nx) break;
    if (nx.bench) { K.benchNext(); continue; }
    const exp = W.tagFor(c), ms = K.matchSetup(c);
    if (!ms) { K.simulateNext(); continue; }
    const st = ms.career.story;
    if (exp) {
      seen++;
      const sk = R ? R.stake({ career: ms.career }) : null;
      // (line cabe en el cartel de la previa en el móvil: 40 letras como mucho; la frase entera, en full)
      if (st && st.tag === exp && st.name && st.line && st.line.length <= 40 && st.full && !BAD.test(st.full) && !BAD.test(st.line) && (!R || (sk && sk.t1 === st.line))) okN++;
      else console.log('    previa: ' + JSON.stringify(st) + ' / ' + JSON.stringify(sk));
    } else { plain++; if (!st) plainOk++; }
    // (se simula la jornada: el partido preparado no se juega)
    K.abortMatch && K.abortMatch();
    K.simulateNext();
    const L = X.B.VB.CareerLife, ev = L.pendingEvent(K.load()); if (ev) L.answer(0);
  }
  if (!seen) {   // sin partido marcado en la muestra: se fuerza una Revancha contra el próximo rival
    const c = K.load(), f = W.fixture(c);
    if (f) { c.life.rival = null; c.notes.push({ nota: 5, win: 0, sim: 1, kind: 'league', wk: 0, rival: f.home === c.myClub ? f.away : f.home, s: [0, 2] }); K.save(c);
      const ms = K.matchSetup(K.load()); seen = 1; if (ms && ms.career.story && ms.career.story.tag === W.tagFor(K.load())) okN = 1; }
  }
  ok(seen > 0 && okN === seen, mode + ': partidos marcados con m.career.story {tag, name, line} y stake con esa línea (' + okN + ' de ' + seen + ')');
  ok(plain === plainOk, mode + ': sin etiqueta, m.career sin story (' + plainOk + ' de ' + plain + ')');
}

// ------------------------------------------------------------------ 7. Publicar
section('7. Publicar (una vez por jornada, como elección)');
for (const mode of ['beach', 'hall']) {
  const X = bootSpy(), K = X.B.C, S = X.S, W = X.WS;
  H.autopilot(X.B, { mode, seasons: 1, seed: 808 });
  // (la temporada se ha cerrado; se juega una jornada más de la siguiente para tener página)
  let c = K.load(); const n = K.next(c); if (n && n.bench) K.benchNext(); else K.simulateNext();
  c = K.load();
  const L = X.B.VB.CareerLife; if (L.pendingEvent(c)) { L.answer(0); c = K.load(); }
  ok(W.canPost(c) && S.chipsOf(c).some(ch => ch.s === 'wall'), mode + ': hay página de la jornada → se puede publicar (y sale el aviso)');
  const b0 = S.budget(c), chem0 = mode === 'hall' ? c.chem : c.mate.chem, coach0 = c.coach, fame0 = c.life.fame;
  const r0 = S.act('st-wall-pub-0');
  c = K.load();
  const chem1 = mode === 'hall' ? c.chem : c.mate.chem;
  ok(r0 && r0.render && chem1 === Math.min(100, chem0 + 3) && c.coach === coach0 && c.story.post === c.story.mN, mode + ': Humilde → química +3 y nada más del núcleo (' + chem0 + '→' + chem1 + ')');
  ok(c.story.wall.p[0].me === 1 && !BAD.test(W.postText(c, c.story.wall.p[0]).t), mode + ': tu publicación arriba del muro (' + W.postText(c, c.story.wall.p[0]).t + ')');
  ok(S.act('st-wall-pub-1') === null && K.load().coach === coach0 && !W.canPost(K.load()), mode + ': segunda publicación en la misma jornada → nada');
  ok(S.budget(K.load()) === b0, mode + ': publicar no gasta tope (' + b0 + ')');
  // chulería en la jornada siguiente
  c = K.load(); const n2 = K.next(c); if (n2 && n2.bench) K.benchNext(); else K.simulateNext();
  c = K.load(); if (L.pendingEvent(c)) { L.answer(0); c = K.load(); }
  const page = c.story.wall, echo = page.p.some(p => /^echo0$/.test(p.k)) || page.bench;
  ok(echo, mode + ': la jornada siguiente, eco de lo que publicaste (o banquillo)');
  const co = c.coach, h0 = c.story.rel.heat, f0 = c.life.fame;
  const r1 = S.act('st-wall-pub-1'); c = K.load();
  ok(r1 && c.coach === Math.max(0, co - 2) && c.story.rel.heat === Math.min(100, h0 + 10) && c.life.fame > f0, mode + ': Chulería → entrenador −2, pique +10 y fama (' + f0 + '→' + c.life.fame + ')');
  ok(S.act('st-wall-pub-7') === null && S.act('st-wall-x') === null, mode + ': acciones desconocidas → nada');
}

// ------------------------------------------------------------------ 8. pushWall
section('8. pushWall de otros sistemas');
{
  const X = bootSpy(), K = X.B.C, S = X.S;
  H.autopilot(X.B, { mode: 'beach', seasons: 1, seed: 66 });
  let c = K.load(); const n = K.next(c); if (n && n.bench) K.benchNext(); else K.simulateNext();
  c = K.load();
  const len0 = c.story.wall.p.length, fill0 = c.story.wall.p.filter(p => p.f).length;
  S.pushWall(c, { a: '@CronistaDeArena', t: 'Lo dijo y lo cumplió: {yo} gana tras su rueda de prensa.' });
  const g = c.story.wall, pushed = g.p.find(p => p.x);
  ok(pushed && g.p.length <= 5 && (fill0 ? g.p.length === len0 : true), 'entra en la página de esta jornada sin pasar de 5 (' + len0 + '→' + g.p.length + ')');
  ok(pushed && /^Lo dijo y lo cumplió: Vida Playa gana/.test(X.Wl.postText(c, pushed).t), 'su texto se rellena con las variables (' + (pushed && X.Wl.postText(c, pushed).t) + ')');
  // de otra jornada (mN distinto): a pendientes y a la página siguiente
  c.story.wall.mN = c.story.mN - 1;
  S.pushWall(c, { a: '@ElOjoDeHalcón', t: 'Premio para {yo}.' });
  ok(c.story.wallIn.length === 1, 'sin página de esta jornada → pendiente (s.wallIn)');
  K.save(c);
  const n2 = K.next(K.load()); if (n2 && n2.bench) K.benchNext(); else K.simulateNext();
  c = K.load();
  ok(c.story.wall.p.some(p => p.x && /Premio para/.test(p.t)) && c.story.wallIn.length === 0 && c.story.wall.p.length <= 5, 'sale en la página siguiente y se vacía la cola');
  // cola del núcleo (s.wallQ) de antes del sistema → pendientes
  c.story.wallQ = [{ a: 'x', t: 'Cola vieja', v: {} }]; X.S.ensure(c);
  ok(c.story.wallQ.length === 0 && c.story.wallIn.some(q => q.t === 'Cola vieja'), 'ensure pasa la cola del núcleo a pendientes');
}

// ------------------------------------------------------------------ 9. textos, me gusta e interfaz
section('9. Textos, me gusta e interfaz');
{
  const { X, c } = runs.beach31, Wl = X.Wl, WS = X.WS;
  const ch = runs.hall31.c;
  let n = 0, bad = [];
  for (const cc of [c, ch]) {
    for (const k in Wl.W) Wl.W[k].forEach((str, i) => {
      const t = Wl.postText(cc, { a: '', k, i, v: { nota: '7,5', res: '2-1', score: 'A 2-1 B', aces: 3, n: 4, w: 2, l: 1, rp: 'Rival X', played: 9 }, lk: 1 });
      n++; if (!t.t || BAD.test(t.t) || !t.a) bad.push(k + '.' + i + ': ' + t.t);
    });
    for (const tg in Wl.LINE) Wl.LINE[tg].forEach(s => { n++; if (/\{(?!(yo|mate|rival|rp|club|ciudad|sponsor|coach|agent|season|boss|s1|s2)\})/.test(s)) bad.push('línea ' + s); });
  }
  ok(!bad.length, n + ' textos renderizados en playa y pista sin restos' + (bad.length ? ' — ' + bad.slice(0, 3).join(' / ') : ''));
  const sits = Object.keys(Wl.W).filter(k => !/^(win|loss|fan|hater|rumor|press|pub\d|benchW|benchL)$/.test(k));
  ok(sits.length >= 14, sits.length + ' situaciones (sin contar relleno ni Publicar)');
  ok(Object.keys(Wl.W).filter(k => /^(big|low|comeback|sweep|ace|err|streak|duelW|duelL|bench|sign|sponsor|decision|win|loss|fan|hater|rumor|press)$/.test(k)).every(k => Wl.W[k].length >= 6), 'unas 8 variantes por situación principal');
  ok(WS.fmtK(1234) === '1,2 mil' && WS.fmtK(999) === '999' && WS.fmtK(2000) === '2 mil' && WS.fmtK(3450000) === '3,5 M', 'me gusta: 1,2 mil / 999 / 2 mil / 3,5 M');
  const lk = c.story.wall.p.map(p => p.lk), fans = Math.max(c.life.fame, 120);
  ok(lk.every(v => v >= 1 && v <= Math.round(fans * 0.08) + 1), 'me gusta entre 2 % y 8 % de los seguidores (' + lk.join(',') + ' con ' + fans + ')');
  const html = WS.wallHTML(c, null), htmlH = WS.wallHTML(ch, { esc: s => String(s) });
  ok(/Redes/.test(html) && !/undefined|NaN|\{/.test(html) && !/undefined|NaN|\{/.test(htmlH), 'ui.wall pinta sin restos (playa y pista)');
  const cp = JSON.parse(JSON.stringify(c)); cp.story.post = -1; cp.story.wall.mN = cp.story.mN;
  const h2 = WS.wallHTML(cp, null);
  ok((h2.match(/data-act="st-wall-pub-\d"/g) || []).length === 3 && /min-height:44px/.test(h2) && /flex-direction:column/.test(h2), 'con publicación pendiente: 3 botones apilados de 44 px');
  ok(typeof X.S.sys('wall').ui.wall === 'function' && typeof X.S.sys('wall').ui.stamp === 'function', 'sys.ui.wall y sys.ui.stamp');
}

// ------------------------------------------------------------------ 10. determinismo y azar
section('10. Determinismo y azar');
for (const mode of ['beach', 'hall']) {
  const a = H.autopilot(H.boot({}), { mode, seasons: 2, seed: 4040, feed: true }), b = H.autopilot(H.boot({}), { mode, seasons: 2, seed: 4040, feed: true });
  ok(JSON.stringify(a.story) === JSON.stringify(b.story) && a.story.wall, mode + ': mismo muro y mismo story dos veces');
}
{
  const src = fs.readFileSync(path.join(H.ROOT, 'js/career-story-wall.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/Math\.random/.test(src), 'sin Math.random en js/career-story-wall.js');
  const keys = (src.match(/rng\(c, '([^']+)'/g) || []).map(s => s.replace(/rng\(c, '/, '').replace(/'$/, ''));
  ok(keys.length > 0 && keys.every(k => k.indexOf('st-') === 0), 'claves de azar con «st-»: ' + Array.from(new Set(keys)).join(', '));
}

console.log('\n' + passes + ' comprobaciones bien, ' + fails + ' fallos');
if (fails) { console.log('HAY FALLOS'); process.exit(1); }
console.log('TODO OK');
