#!/usr/bin/env node
/* TAKE THE COURT — tools/storytest.js (owner: carrera)
 * Prueba del núcleo de «Carrera con vida» (js/career-story.js, notes/carrera-vida.md §3, paquete P0) en node puro (vm, sin DOM):
 *   1. Contrato: 3 semillas × 6 temporadas, playa y pista, sin elegir nada en story, con y sin los ficheros story (y con un sistema
 *      de prueba que publica, marca y tira con rng 'st-'): la carrera, fuera de story/inbox/msgN/created/world, idéntica.
 *   2. Determinismo: la misma carrera dos veces contestando el feed y eligiendo la carta 0 → mismo JSON.
 *   3. Ningún Math.random en js/career-story*.js.
 *   4. Crear no gasta tiradas: misma carrera recién creada con y sin story; c.story solo con lo de por defecto y sin despachar.
 *   5. Guardados viejos (v1, v2, v3 de playa; pista) sin story cargan y ensure los repara; con story, migrate/saneDeep lo conservan.
 *   6. Un story corrupto (feed: 'x', flags, rel, mood…) se sanea y la carrera sigue.
 *   7. career-ui.js se carga sin career-story y con él (document falso); chips sin «undefined».
 *   8. API: post (tope por freq y del feed), text (variables, sin «{»), answer (fx al núcleo y a story, una vez), caducidad sin
 *      efecto, flag/flagAt, why, pushWall, cast, ctx de 'match' (played.wk, nk, mN), act ('st-ans', 'st-<sys>') y 'answer'.
 * Uso: node tools/storytest.js [temporadas=6]   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./storyhelp.js');
const SEASONS = Math.max(1, +(process.argv[2] || 6));
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }
const BAD = /\{|\}|undefined|NaN|\.er\b|·/;

/** Sistema de prueba: cumple las reglas (solo story, azar 'st-', efectos solo al contestar). log: lo que recibe. */
function fake(S, log) {
  return {
    id: 'tst', acts: ['tz'],
    tpl: {
      tq: { k: 'agent', t: ['Hola, {yo}', 'Qué tal, {yo}', 'Oye, {yo}'], th: 'En el pabellón, {yo}', x: '{rival} y {club} en {ciudad}. {coach} y {agent} con {mate}.{nada}',
        o: [{ t: 'Sí', e: { coach: 2, ag: 5 }, why: 'Te gusta el plan' }, { t: 'No', e: { mood: -3, star: 1 } }], c: '{agent}: «Vale, lo hablamos otro día»' },
      tn: { k: 'fam', t: 'Tu gente', x: 'Te vimos, {yo}. Ánimo con {sponsor}.' }
    },
    ensure(s) { if (!Array.isArray(s.tst)) s.tst = []; s.tst = s.tst.filter(x => typeof x === 'number').slice(-5); },
    onSetup(c, m, ctx) { if (log) log.push(['setup', ctx.mN]); },
    onMatch(c, sum, f, ctx) {
      if (log) log.push(['match', ctx.mN, ctx.played.wk, ctx.nk, ctx.season, ctx.week, ctx.kind]);
      const r = S.rng(c, 'st-tst', ctx.season, ctx.mN);
      c.story.tst.push(Math.round(r() * 100)); if (c.story.tst.length > 5) c.story.tst.shift();
      if (r() < 0.8) S.post(c, { b: 'tq', o: 1 });
      if (r() < 0.5) S.post(c, { b: 'tn' });
      if (sum.win) S.flag(c, 'win', ctx.mN);
      S.pushWall(c, { a: '@CronistaDeArena', t: 'Partido de ' + (sum.nota != null ? 'nota' : 'banquillo') });
    },
    onSeason(c, ctx) { if (log) log.push(['season', ctx.season]); },
    onNewSeason(c, ctx) { if (log) log.push(['newSeason', ctx.season]); },
    onJoin(c, ctx) { if (log) log.push(['join', !!ctx.offer]); },
    onAnswer(c, k, i) { if (log) log.push(['answer', k, i]); S.flag(c, 'ev-' + k, i); },
    onReply(c, e, i) { if (log) log.push(['reply', e.b, i]); },
    onAct(c, a) { if (log) log.push(['act', a]); return { render: true, a }; },
    chips(c) { return c.story && c.story.feed.some(x => x.o && x.ans === -1) ? [{ p: 2, ic: '✉', t: 'Cris Montoya te ha escrito', tab: 'inbox', s: 'box' }] : []; }
  };
}
const bootF = (story, log) => { const B = H.boot({ story }); if (story && B.S) B.S.use(fake(B.S, log)); return B; };
/** Solo el núcleo (sin los sistemas reales) + el sistema de prueba: para comprobar la API con valores exactos. */
const bootCore = (log) => { const B = H.boot({ files: H.BASE.concat(['js/career-story.js']) }); B.S.use(fake(B.S, log)); return B; };

// ------------------------------------------------------------------ 1. contrato
section('1. Contrato: misma carrera con y sin los ficheros story (sin elegir nada en story)');
for (const mode of ['beach', 'hall']) {
  let same = 0, mN = 0, posted = 0; const bad = [];
  for (const seed of [97, 1234, 50001]) {
    const a = H.autopilot(bootF(true), { mode, seasons: SEASONS, seed }), b = H.autopilot(bootF(false), { mode, seasons: SEASONS, seed });
    if (H.strip(a) === H.strip(b)) same++; else bad.push(seed);
    mN += a.story ? a.story.mN : 0; posted += a.story ? a.story.n : 0;
  }
  ok(same === 3, mode + ': idéntica en ' + same + ' de 3 semillas × ' + SEASONS + ' temporadas (story: ' + mN + ' jornadas, ' + posted + ' entradas)' + (bad.length ? ' — distintas: ' + bad.join(',') : ''));
}

// ------------------------------------------------------------------ 2. determinismo con elecciones
section('2. Determinismo: dos veces la misma carrera contestando el feed y la carta 0');
for (const mode of ['beach', 'hall']) {
  const run = () => H.autopilot(bootF(true), { mode, seasons: Math.min(3, SEASONS), seed: 4242, feed: true, week: true });
  const a = run(), b = run(), plain = H.autopilot(bootF(true), { mode, seasons: Math.min(3, SEASONS), seed: 4242 });
  const ans = a.story.feed.filter(x => x.ans >= 0).length;
  ok(JSON.stringify(a) === JSON.stringify(b), mode + ': mismo JSON entero (contestadas en el feed que queda: ' + ans + ')');
  ok(ans > 0 && JSON.stringify(a) !== JSON.stringify(plain), mode + ': contestar sí cambia la carrera (la elección es la única puerta al núcleo)');
}

// ------------------------------------------------------------------ 3. sin Math.random
section('3. Sin azar del navegador en js/career-story*.js');
{
  const files = fs.readdirSync(path.join(H.ROOT, 'js')).filter(f => /^career-story.*\.js$/.test(f));
  const hits = files.filter(f => /Math\s*\.\s*random/.test(fs.readFileSync(path.join(H.ROOT, 'js', f), 'utf8')));
  ok(files.length >= 6 && !hits.length, files.length + ' ficheros, ninguno con Math.random' + (hits.length ? ' — ' + hits.join(', ') : ''));
}

// ------------------------------------------------------------------ 4. crear no gasta tiradas
section('4. Crear no gasta tiradas ni despacha');
for (const mode of ['beach', 'hall']) {
  const log = [];
  const mk = (story) => { const B = bootF(story, log); const o = mode === 'hall' ? { mode, name: 'Crear', num: 4, pos: 'MB', seed: 777, now: 1 } : { mode, name: 'Crear', num: 4, role: 'cr', seed: 777, now: 1 }; return B.C.create(o); };
  const a = mk(true), nLog = log.length, b = mk(false);
  ok(H.strip(a) === H.strip(b), mode + ': recién creada, idéntica con y sin story');
  ok(a.story && a.story.v === 1 && a.story.n === 0 && a.story.mN === 0 && a.story.feed.length === 0 && Object.keys(a.story.flags).length === 0 && nLog === 0, mode + ': c.story solo con lo de por defecto y ningún on* en «create» (' + nLog + ')');
  ok(typeof a.story.nk === 'number', mode + ': s.nk calculada al crear (' + a.story.nk + ')');
}

// ------------------------------------------------------------------ 5. guardados viejos
section('5. Guardados viejos sin story cargan y ensure los repara; migrate/saneDeep conservan c.story');
{
  const B = bootF(true), K = B.C, S = B.S;
  const c0 = K.create({ mode: 'beach', name: 'Viejo', num: 9, role: 'atk', seed: 31, now: 1 }); K.acceptOffer(c0.offers.findIndex(x => !x.trial), 2);
  for (let i = 0; i < 4; i++) K.simulateNext();
  const raw = B.mem['make-the-cut.career'];
  for (const v of [1, 2, 3]) {
    const o = JSON.parse(raw); o.v = v; delete o.story; B.mem['make-the-cut.career'] = JSON.stringify(o); K._reset();
    const c = K.load();
    ok(c && !c.story, 'v' + v + ' sin story: carga (sin story hasta el primer gancho)');
    const s = S.ensure(c); K.simulateNext();
    ok(s && s.v === 1 && Array.isArray(s.feed) && K.load().story && K.load().story.mN === 1, 'v' + v + ': ensure lo crea y la jornada siguiente lo usa (mN ' + (K.load().story && K.load().story.mN) + ')');
    const o2 = JSON.parse(raw); o2.v = v; o2.story = { v: 1, n: 3, mN: 7, nk: 1004, freq: 2, feed: [{ id: 3, k: 'agent', b: 'tq', vars: {}, o: 1, ans: -1, exp: 9, mN: 7, s: 1, w: 4, ph: 'league', r: 0 }], flags: { a: { mN: 6, v: 1 } }, tst: [5] };
    const keep = JSON.stringify(o2.story);
    B.mem['make-the-cut.career'] = JSON.stringify(o2); K._reset();
    const c2 = K.load();
    ok(c2 && JSON.stringify(c2.story) === keep, 'v' + v + ' con story: migrate y saneDeep lo dejan intacto');
  }
  // pista (VER6 = 1)
  const c6 = K.create({ mode: 'hall', name: 'Viejo Pista', num: 9, pos: 'OH', seed: 32, now: 1 }); K.acceptOffer(c6.offers.findIndex(x => !x.trial), 2);
  for (let i = 0; i < 3; i++) K.simulateNext();
  const o6 = JSON.parse(B.mem['make-the-cut.career6']); delete o6.story; B.mem['make-the-cut.career6'] = JSON.stringify(o6); K._reset();
  const h = K.load();
  ok(h && h.mode === 'hall' && !h.story && S.ensure(h).v === 1, 'pista sin story: carga y ensure lo repara');
  const o7 = JSON.parse(B.mem['make-the-cut.career6']); o7.story = { v: 1, n: 0, mN: 2, nk: 1003, freq: 0, feed: [], flags: {} }; const k7 = JSON.stringify(o7.story);
  B.mem['make-the-cut.career6'] = JSON.stringify(o7); K._reset();
  ok(JSON.stringify(K.load().story) === k7, 'pista con story: sane6 lo deja intacto');
}

// ------------------------------------------------------------------ 6. story corrupto
section('6. Story corrupto se sanea');
{
  const B = bootCore(), K = B.C, S = B.S;
  const c0 = K.create({ mode: 'beach', name: 'Roto', num: 9, role: 'atk', seed: 33, now: 1 }); K.acceptOffer(c0.offers.findIndex(x => !x.trial), 2);
  K.simulateNext();
  const o = JSON.parse(B.mem['make-the-cut.career']);
  o.story = { v: 1, n: 'a', mN: -4, nk: 'x', freq: 7, feed: 'x', flags: 5, rel: { ag: 400, fam: 'z', why: 3 }, mood: NaN, moodLog: {}, wallQ: [1, null], starQ: -2, tst: 'roto' };
  B.mem['make-the-cut.career'] = JSON.stringify(o); K._reset();
  let c = K.load(), err = '';
  try { K.simulateNext(); } catch (e) { err = e.message; }
  c = K.load(); const s = c.story;
  ok(!err && s && Array.isArray(s.feed) && s.flags && typeof s.flags === 'object' && s.freq === 1 && s.mN === 1 && typeof s.nk === 'number', 'feed, flags, freq, mN y nk saneados y la jornada sigue' + (err ? ' — ' + err : ''));
  ok(s.rel.ag === 100 && s.rel.fam === 70 && s.rel.heat === 0 && typeof s.rel.why === 'object' && s.mood === 60 && Array.isArray(s.moodLog) && s.wallQ.every(x => x && typeof x.t === 'string') && s.starQ === 0, 'rel, ánimo, porqués, cola del muro y estrellas saneados');
  ok(Array.isArray(s.tst), 'el ensure de cada sistema repara lo suyo');
  // con los sistemas reales: el mismo story roto no rompe la jornada y queda en rango
  {
    const BR = bootF(true), KR = BR.C;
    const r0 = KR.create({ mode: 'beach', name: 'Roto', num: 9, role: 'atk', seed: 33, now: 1 }); KR.acceptOffer(r0.offers.findIndex(x => !x.trial), 2);
    KR.simulateNext();
    const oR = JSON.parse(BR.mem['make-the-cut.career']);
    oR.story = JSON.parse(JSON.stringify(o.story)); oR.story.wk = 'x'; oR.story.pact = 7; oR.story.wall = 3; oR.story.pass = 'z'; oR.story.rec = []; oR.story.seenB = 2;
    BR.mem['make-the-cut.career'] = JSON.stringify(oR); KR._reset();
    let errR = ''; try { KR.load(); KR.simulateNext(); KR.simulateNext(); } catch (e) { errR = e.message; }
    const sR = KR.load().story;
    ok(!errR && sR && sR.mood >= 0 && sR.mood <= 100 && sR.rel.ag <= 100 && Array.isArray(sR.feed) && sR.mN === 2, 'con los sistemas reales: story roto saneado y la carrera sigue' + (errR ? ' — ' + errR : ''));
  }
  const c2 = { story: { feed: 'x' } }; S.ensure(c2);
  ok(Array.isArray(c2.story.feed) && c2.story.feed.length === 0, 'ensure suelto: feed «x» → []');
  ok(S.ensure(null) === null && (() => { const z = { story: [] }; S.ensure(z); return !Array.isArray(z.story) && z.story.v === 1; })(), 'ensure(null) y story lista → objeto nuevo');
}

// ------------------------------------------------------------------ 7. career-ui con y sin career-story
section('7. career-ui.js se carga sin career-story y con él; chips sin «undefined»');
{
  const B0 = H.boot({ story: false });
  const u0 = H.uiCtx(B0.VB, ['js/career-world-ui.js', 'js/career-ui.js']);
  ok(!u0.err && B0.VB.CareerUI && typeof B0.VB.CareerUI.heroData === 'function' && !B0.VB.CareerStoryUI, 'sin career-story: career-ui se carga' + (u0.err ? ' — ' + u0.err : ''));
  const B1 = bootF(true);
  const u1 = H.uiCtx(B1.VB, ['js/career-world-ui.js', H.STORY_UI, 'js/career-ui.js']);
  const SU = B1.VB.CareerStoryUI;
  ok(!u1.err && B1.VB.CareerUI && SU, 'con career-story y career-story-ui: career-ui se carga' + (u1.err ? ' — ' + u1.err : ''));
  const K = B1.C, c0 = K.create({ mode: 'beach', name: 'Chips', num: 2, role: 'atk', seed: 34, now: 1 });
  ok(Array.isArray(SU.chips(c0)) && SU.chips(null).length === 0, 'chips en plena elección de club y sin carrera');
  K.acceptOffer(c0.offers.findIndex(x => !x.trial), 2);
  for (let i = 0; i < 3; i++) K.simulateNext();
  const c = K.load(), ch = SU.chips(c);
  ok(Array.isArray(ch) && !/undefined|NaN/.test(JSON.stringify(ch)), 'chips: ' + JSON.stringify(ch));
  ok(B1.VB.CareerUI.heroData(c) && typeof SU.chipsHTML(c, {}) === 'string' && typeof SU.pending(c) === 'number' && SU.pending(c) >= 0 && typeof SU.tagFor(c, null) === 'string', 'heroData, chipsHTML, pending y tagFor de la UI');
  ['inbox', 'wall', 'people', 'state', 'pass', 'stats', 'optsHTML', 'weekCard', 'css'].forEach(k => { if (typeof SU[k] !== 'function') ok(false, 'CareerStoryUI.' + k); });
}

// ------------------------------------------------------------------ 8. API
section('8. API del núcleo');
{
  const log = [], B = bootCore(log), K = B.C, S = B.S, L = B.VB.CareerLife;
  ok(S && ['hook', 'ensure', 'use', 'ctx', 'rng', 'K', 'cast', 'freq', 'budget', 'post', 'answer', 'fx', 'flag', 'flagAt', 'why', 'pushWall', 'text', 'act'].every(k => typeof S[k] === 'function'), 'VB.CareerStory con toda la API de §3');
  ok(L && typeof L.applyEff === 'function' && typeof L.effHint === 'function', 'career-life exporta applyEff y effHint');
  ok(bootF(true).S.systems().map(y => y.id).join() === 'msgs,week,wall,season,tst', 'orden de use(): msgs, week, wall, season (+ prueba)');
  let c = K.create({ mode: 'beach', name: 'Api Prueba', num: 5, role: 'atk', seed: 35, now: 1 });
  K.acceptOffer(c.offers.findIndex(x => !x.trial), 2); c = K.load();
  ok(log.length && log[0][0] === 'join' && log[0][1], 'onJoin con ctx.offer al firmar (' + JSON.stringify(log[0]) + ')');
  // rng y reparto
  ok(S.rng(c, 'st-a', 1)() === S.rng(c, 'st-a', 1)() && S.rng(c, 'st-a', 1)() !== S.rng(c, 'st-a', 2)() && S.rng(c, 'a', 1)() === S.rng(c, 'st-a', 1)(), 'rng determinista y con prefijo st-');
  const ca = S.cast(c);
  ok(ca.agent === 'Cris Montoya' && S.COACH_N.indexOf(ca.coach) >= 0 && ca.media.radio === 'Radio Litoral' && ca.media.pod === 'La Previa' && ca.acc.cronista === '@CronistaDeArena' && /^@GradaPoli\S+$/.test(ca.acc.pena) && ca.fam === 'Familia' && ca.barrio === 'Los del infantil', 'reparto: ' + ca.coach + ', ' + ca.acc.pena);
  // ctx de 'match'
  const nk0 = c.story.nk; log.length = 0;
  K.simulateNext(); c = K.load();
  const m = log.find(x => x[0] === 'match');
  ok(m && m[1] === 1 && m[2] === nk0 && m[3] === c.story.nk && m[3] === K._wkKey(c) && m[4] === 1 && m[5] === 0 && m[6] === 'league', 'ctx de match: mN 1, played.wk = la clave de antes, nk = la siguiente, season, week 0, league (' + JSON.stringify(m) + ')');
  // tope por freq: Normal = 3 menos la decisión de career-life
  const s = c.story; s.freq = 1;
  const room = S.budget(c);
  let n = 0; for (let i = 0; i < 6; i++) if (S.post(c, { b: 'tq', o: 1 })) n++;
  ok(n === room && S.budget(c) === 0 && room <= 3 - (c.life.ev ? 1 : 0), 'tope: Normal publica ' + n + ' con respuesta (hueco ' + room + ')');
  ok(S.post(c, { b: 'tn' }) !== null, 'lo que no pide respuesta no cuenta en el tope');
  s.freq = 0; ok(S.budget(c) === 0, 'Poca: sin hueco');
  s.freq = 2; ok(S.budget(c) === 1, 'Mucha: un hueco más');
  s.freq = 1;
  // textos
  const e = s.feed.filter(x => x.o && x.ans === -1)[0], tx = S.text(c, e);
  ok(tx.t.indexOf(c.player.name) >= 0 && tx.x.indexOf(K.myClub(c).name) >= 0 && tx.x.indexOf('Cris Montoya') >= 0 && tx.x.indexOf(c.mate.name) >= 0 && !BAD.test(tx.t + tx.x + tx.o.map(o => o.t).join('')), 'text: «' + tx.t + '» «' + tx.x + '»');
  ok(tx.o.length === 2 && tx.o[0].hint.length === 2 && tx.o[0].hint[0][0] === 'Entrenador' && tx.o[0].hint[0][1] === true && tx.o[1].hint.some(h => h[0] === 'Ánimo' && h[1] === false), 'botones con su efecto (▲/▼)');
  // contestar
  const coach0 = c.coach, ag0 = s.rel.ag;
  const r = S.answer(c, e.id, 0);
  ok(r && c.coach === Math.min(100, coach0 + 2) && s.rel.ag === ag0 + 5 && s.rel.why.ag && s.rel.why.ag.d === 5 && s.rel.why.ag.t === 'Te gusta el plan' && e.ans === 0 && e.r === 1, 'answer: Entrenador +2 (núcleo) y Agente +5 con su porqué (' + r.join(', ') + ')');
  ok(S.answer(c, e.id, 1) === null && c.coach === Math.min(100, coach0 + 2), 'no se contesta dos veces');
  ok(log.some(x => x[0] === 'reply' && x[1] === 'tq' && x[2] === 0), 'onReply del sistema dueño');
  const e2 = s.feed.filter(x => x.o && x.ans === -1)[0], md0 = s.mood;
  ok(S.answer(c, e2.id, 1) && s.mood === md0 - 3 && s.moodLog.length === 1 && s.starQ === 1, 'opción 2: Ánimo −3 (moodLog) y estrella sin dueño a s.starQ');
  // caducidad sin efecto
  K.save(c); K._reset(); c = K.load();
  const e3 = c.story.feed.filter(x => x.o && x.ans === -1)[0], id3 = e3 && e3.id;
  const snap = () => { const x = K.load(); return [x.story.rel.ag, x.story.mood, x.story.starQ].join(); };
  const before = snap();
  for (let i = 0; i < 3; i++) K.simulateNext();
  c = K.load(); const x3 = S.entry(c, id3);
  ok(e3 && x3 && x3.ans === -2 && x3.r === 1 && snap() === before, 'caduca en mN + 2 sin efecto (entrada ' + id3 + ', exp ' + (x3 && x3.exp) + ', mN ' + c.story.mN + ')');
  ok(S.text(c, x3).c === 'Cris Montoya: «Vale, lo hablamos otro día»' && S.answer(c, id3, 0) === null, 'línea de cierre y no se contesta tras caducar');
  // flags
  S.flag(c, 'prueba', 'x');
  ok(S.flagAt(c, 'prueba').v === 'x' && S.flagAt(c, 'nada') === null, 'flag / flagAt');
  for (let i = 0; i < 7 && K.load().phase !== 'off'; i++) K.simulateNext();
  c = K.load();
  ok(S.flagAt(c, 'prueba') === null, 'la marca caduca a las ' + S.FLAG_LIFE + ' jornadas');
  ok(Object.keys(c.story.flags).length <= S.FLAG_MAX, 'tope de marcas');
  // feed: tope 30
  c.story.freq = 2; for (let i = 0; i < 40; i++) S.post(c, { b: 'tn' });
  ok(c.story.feed.length === S.FEED_MAX, 'feed con tope ' + S.FEED_MAX);
  // muro sin P3: a la cola
  ok(c.story.wallQ.length > 0 && c.story.wallQ.length <= 10 && c.story.wallQ[0].a === '@CronistaDeArena', 'pushWall sin onWall: a s.wallQ (' + c.story.wallQ.length + ')');
  // acciones
  K.save(c);
  log.length = 0;
  const ra = S.act('st-tst-hola', null), rz = S.act('st-tz-0', null);
  ok(ra && ra.a === 'st-tst-hola' && rz && rz.a === 'st-tz-0' && log.filter(x => x[0] === 'act').length === 2, 'act enruta st-<id>-… y los alias de sys.acts');
  S.act('st-freq-0'); K._reset();
  ok(K.load().story.freq === 0, 'act st-freq-0 cambia «Cuánta vida» y guarda');
  ok(S.act('lf-algo') === null && S.act('st-nadie-1') === null, 'acciones que no son suyas: null');
  // gancho 'answer' desde career-life
  c = K.load();
  const evK = Object.keys(L.EVENTS).find(k => !L.EVENTS[k].only || L.EVENTS[k].only === 'beach');
  c.life.ev = { key: evK, id: 999 }; K.save(c); log.length = 0;
  const fl0 = c.life.evN;
  ok(L.answer(0) && log.some(x => x[0] === 'answer' && x[1] === evK && x[2] === 0) && S.flagAt(K.load(), 'ev-' + evK) && K.load().life.evN === fl0 && !K.load().life.ev, 'career-life answer() llama al gancho «answer» (' + evK + ') sin tocar evN; el sistema marca en story');
  // pista: variables de pabellón
  const c6 = K.create({ mode: 'hall', name: 'Api Pista', num: 5, pos: 'OH', seed: 36, now: 1 }); K.acceptOffer(c6.offers.findIndex(x => !x.trial), 2);
  K.simulateNext(); const h = K.load(); h.story.freq = 2;
  const e6 = S.post(h, { b: 'tq', o: 1, vars: { rival: 'Voley Ejemplo' } }), t6 = S.text(h, e6);
  ok(e6 && t6.t.indexOf('En el pabellón') === 0 && t6.x.indexOf('Voley Ejemplo') === 0 && t6.x.indexOf('quien coloca') >= 0 && S.cast(h).acc.cronista === '@CronistaDePabellón' && !BAD.test(t6.t + t6.x), 'pista: th/xh, vars propias y «quien coloca» (' + t6.x + ')');
}
{
  // 'season' corre dentro de closeMine, antes del 'match' del último partido: el núcleo lo aplaza para que onSeason llegue
  // DESPUÉS de ese 'match' (con la última jornada ya contada: pacto, figura del mes…), una sola vez y con su temporada
  for (const mode of ['beach', 'hall']) {
    const log = [], B = bootCore(log);
    H.autopilot(B, { mode, seasons: 2, seed: 61 });
    const ks = log.map(x => x[0]).filter(k => k === 'match' || k === 'season' || k === 'newSeason');
    const iS = ks.reduce((a, k, i) => (k === 'season' ? a.concat(i) : a), []);
    ok(iS.length === 2 && iS.every(i => ks[i - 1] === 'match' && (i + 1 === ks.length || ks[i + 1] === 'newSeason')), mode + ': onSeason justo después del último match, una vez por temporada (' + iS.join() + ')');
    ok(log.filter(x => x[0] === 'season').map(x => x[1]).join() === '1,2' && B.C.load().story.sP === 0, mode + ': ctx.season de onSeason = la temporada que acaba; s.sP limpio');
  }
}

console.log('\n' + passes + ' comprobaciones bien' + (fails ? ', ' + fails + ' FALLOS' : ''));
if (fails) { console.log('\nHAY FALLOS'); process.exit(1); }
console.log('\nTODO OK');
