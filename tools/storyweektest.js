#!/usr/bin/env node
/* TAKE THE COURT — tools/storyweektest.js (owner: carrera)
 * Prueba de «Tu semana, Ánimo, Forma y Pacto» (js/career-story-week.js, notes/carrera-vida.md §2 S2 y §3 P2), node puro (vm):
 *   1. Tu semana: misma semilla, mismas cartas; 3 cartas con «Descansar» siempre; sin repetir las de la jornada anterior; filtros
 *      only / need; elegir aplica el efecto exacto una sola vez (y la estrella cada 2); act 'st-wk-N' enruta y guarda.
 *   2. Carta no elegida sin efecto y pacto sin elegir no toca c.coach: carrera idéntica con y sin story (playa y pista).
 *   3. Ánimo: siempre en [0,100], tiende a 60 (2 por jornada), porqués (5) y llaves ≤ 30 / ≥ 90 sin repetir en 6 jornadas.
 *   4. Forma: igual que myForm6 de career.js (misma fórmula sobre c.notes) en pista y en playa; gráfica de las 8 últimas notas.
 *   5. Pacto: oferta determinista de 3 (Fácil, Normal, Difícil) en la jornada 1 y a mitad de liga; Fácil cumplido da exactamente
 *      Entrenador +5 (escenario forzado); Difícil fallado −6; cambiar de club lo anula sin efecto.
 *   6. Determinismo eligiendo carta: dos veces la misma carrera, mismo JSON.
 *   7. Textos de todas las cartas, pactos y mensajes (playa y pista) y los pintores sin «{», «undefined», «NaN», «.er» ni «·»;
 *      chips puros; ensure repara un estado roto.
 * Uso: node tools/storyweektest.js [temporadas=3]   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./storyhelp.js');
const SEASONS = Math.max(1, +(process.argv[2] || 3));
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }
const BAD = /\{|\}|undefined|NaN|\.er\b|·/;
const J = x => JSON.stringify(x);

/** Arranca y registra lo que deja onMatch del sistema week en cada jornada (cartas y ánimo). */
function bootLog(log) {
  const B = H.boot({});
  const W = B.S.sys('week'), orig = W.onMatch;
  if (log) W.onMatch = function (c, sum, f, ctx) { orig.apply(this, arguments); log.push({ wk: J(c.story.wk), mood: c.story.mood, mN: c.story.mN, nk: ctx.nk, sponsor: !!(c.life && c.life.sponsor), hall: c.mode === 'hall' }); };
  return B;
}
function newCareer(B, mode, seed) {
  const K = B.C;
  const c = mode === 'hall' ? K.create({ mode: 'hall', name: 'Vida Pista', num: 8, pos: 'OH', seed, now: 1 }) : K.create({ mode: 'beach', name: 'Vida Playa', num: 7, role: 'atk', seed, now: 1 });
  K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  return K.load();
}

// ------------------------------------------------------------------ 1. Tu semana
section('1. Tu semana: cartas deterministas, «Descansar» siempre, sin repetir, efecto exacto al elegir');
for (const mode of ['beach', 'hall']) {
  const la = [], lb = [];
  H.autopilot(bootLog(la), { mode, seasons: SEASONS, seed: 321 });
  H.autopilot(bootLog(lb), { mode, seasons: SEASONS, seed: 321 });
  ok(la.length > 10 && J(la.map(x => x.wk)) === J(lb.map(x => x.wk)), mode + ': misma semilla, mismas cartas en ' + la.length + ' jornadas');
  const decks = la.map(x => Object.assign(JSON.parse(x.wk), { sponsor: x.sponsor }));
  const dealt = decks.filter(d => d.o.length);
  ok(dealt.length > 5, mode + ': hay cartas en ' + dealt.length + ' de ' + decks.length + ' jornadas');
  ok(dealt.every(d => d.o.length === 3 && d.o.indexOf('rest') >= 0 && new Set(d.o).size === 3), mode + ': siempre 3 cartas distintas con «Descansar»');
  let rep = 0; dealt.forEach(d => { d.o.forEach(id => { if (id !== 'rest' && d.prev.indexOf(id) >= 0) rep++; }); });
  ok(rep === 0, mode + ': ninguna carta repite la jornada anterior (repetidas: ' + rep + ')');
  ok(dealt.every(d => mode === 'hall' || d.o.indexOf('cena') < 0), mode + ': «Cena con la plantilla» solo en pista');
  ok(dealt.every(d => d.o.indexOf('fotos') < 0 || d.sponsor), mode + ': «Sesión de fotos» solo con patrocinio');
  ok(dealt.every(d => d.pick === -1), mode + ': sin elegir, ninguna carta queda elegida');
  const pos = new Set(dealt.map(d => d.o.indexOf('rest')));
  ok(pos.size >= 2, mode + ': «Descansar» cambia de sitio (posiciones: ' + Array.from(pos).join(',') + ')');
}
{
  const B = H.boot({}), S = B.S, W = S.sys('week'), T = W._t;
  const c0 = newCareer(B, 'beach', 555);
  const deck = c0.story.wk;
  ok(deck && deck.o.length === 3 && deck.k === B.C._wkKey(c0), 'tras fichar (join) ya hay cartas para la jornada 1');
  // elegir «Descansar»: fatiga −10, ánimo +5, una sola vez
  const c = B.C.load(); c.fatigue = 50; c.story.mood = 60; B.C.save(c);
  const iR = deck.o.indexOf('rest');
  const coach0 = c.coach, r = S.act('st-wk-' + iR), c1 = B.C.load();
  ok(r && r.render && c1.fatigue === 40 && c1.story.mood === 65 && c1.coach === coach0, 'elegir «Descansar»: fatiga 50 → ' + c1.fatigue + ', ánimo 60 → ' + c1.story.mood + ' (guardado por act)');
  ok(c1.story.wk.pick === iR && c1.story.wkN === 1, 'la carta queda elegida (pick ' + c1.story.wk.pick + ', wkN ' + c1.story.wkN + ')');
  const again = S.act('st-wk-' + ((iR + 1) % 3)), c2 = B.C.load();
  ok(again === null && c2.fatigue === 40 && c2.story.mood === 65, 'una segunda carta en la misma jornada se rechaza sin efecto');
  ok(S.act('st-wk-7') === null, 'índice fuera de rango: null');
  // la estrella sale cada 2 cartas (wkN par)
  const cc = B.C.load(); cc.story.wk.pick = -1; cc.story.wkN = 1; const st0 = J(cc.story.pass || null) + cc.story.starQ; B.C.save(cc);
  const rr = S.act('st-wk-' + iR);
  ok(rr && rr.fx.some(t => /estrella/.test(t)), '2ª carta: lleva su estrella (' + rr.fx.join('; ') + ')');
  // determinismo del reparto puro
  ok(J(T.deal(c2, 7777, ['video', 'cafe'])) === J(T.deal(c2, 7777, ['video', 'cafe'])), 'deal(c, k, prev) es puro y determinista');
}

// ------------------------------------------------------------------ 2. contrato
section('2. Sin elegir: carta y pacto sin efecto (carrera idéntica con y sin story)');
for (const mode of ['beach', 'hall']) {
  let same = 0, offers = 0, decks = 0;
  for (const seed of [11, 2024]) {
    const log = [];
    const a = H.autopilot(bootLog(log), { mode, seasons: SEASONS, seed }), b = H.autopilot(H.boot({ story: false }), { mode, seasons: SEASONS, seed });
    if (H.strip(a) === H.strip(b)) same++;
    offers += a.story.pactK ? 1 : 0; decks += log.filter(x => JSON.parse(x.wk).o.length).length;
    ok(a.story.pactLog.length === 0 && !a.story.pact, mode + ' semilla ' + seed + ': sin elegir no hay pacto (pactLog vacío)');
  }
  ok(same === 2, mode + ': idéntica en ' + same + ' de 2 semillas × ' + SEASONS + ' temporadas (cartas repartidas: ' + decks + ', con charla del entrenador: ' + offers + ')');
}
{
  // directo: con la oferta de pacto en la mano y sin elegir, una jornada no toca c.coach
  const B = H.boot({}), S = B.S, W = S.sys('week');
  const c = newCareer(B, 'beach', 99);
  ok(!!c.story.pactOff && c.story.pactOff.o.length === 3, 'al fichar llega la charla con 3 pactos');
  const coach0 = c.coach, js0 = H.strip(c);
  W.onMatch(c, { season: c.season, phase: 'league', win: true, nota: 7, sim: false, me: {} }, { kind: 'league', week: 0, home: c.myClub }, { season: c.season, phase: 'league', mN: 1, nk: B.C._wkKey(c), played: { tag: '', wk: null } });
  ok(c.coach === coach0 && H.strip(c) === js0, 'jornada con la oferta sin elegir: c.coach igual (' + c.coach + ') y nada fuera de story cambia');
}

// ------------------------------------------------------------------ 3. Ánimo
section('3. Ánimo: [0,100], tiende a 60, porqués y llaves');
for (const mode of ['beach', 'hall']) {
  const log = [];
  const c = H.autopilot(bootLog(log), { mode, seasons: SEASONS, seed: 808 });
  const ms = log.map(x => x.mood);
  ok(ms.every(m => Number.isInteger(m) && m >= 0 && m <= 100), mode + ': ánimo siempre entero en [0,100] (de ' + Math.min.apply(null, ms) + ' a ' + Math.max.apply(null, ms) + ')');
  ok(c.story.moodLog.length <= 5 && c.story.moodLog.every(x => typeof x.t === 'string' && x.t && x.d !== 0 && !BAD.test(x.t)), mode + ': moodLog con ≤ 5 porqués legibles (' + c.story.moodLog.map(x => x.t).join(' | ') + ')');
}
{
  const B = H.boot({}), S = B.S, W = S.sys('week');
  const c = newCareer(B, 'beach', 4321);
  const step = (sum) => { c.story.mN++; W.onMatch(c, Object.assign({ season: c.season, phase: 'league', sim: false, me: {} }, sum), { kind: 'league', week: c.week, home: c.myClub }, { season: c.season, phase: 'league', mN: c.story.mN, nk: B.C._wkKey(c), played: { tag: '', wk: null } }); };
  c.fatigue = 0; c.broken = 0; if (c.life) c.life.streak = 0;
  c.story.mood = 100; step({ win: false, nota: 6.5 });
  ok(c.story.mood === 89, 'desde 100, derrota: 100 − 8 (20 % hacia 60) − 3 = ' + c.story.mood);
  c.story.mood = 20; step({ win: true, nota: 6.5 });
  ok(c.story.mood === 31, 'desde 20, victoria: 20 + 8 (20 % hacia 60) + 3 = ' + c.story.mood);
  c.story.mood = 60; step({ win: false, nota: 6.5 });
  ok(c.story.mood === 57, 'desde 60, derrota: sin tendencia, 60 − 3 = ' + c.story.mood);
  c.story.mood = 61; step({ bench: true, nota: null });
  ok(c.story.mood === 55, 'banquillo: 61 − 1 (hacia 60) − 5 = ' + c.story.mood);
  c.story.mood = 50; step({ win: true, nota: 8 }); ok(c.story.mood === 58, 'victoria con nota ≥ 7,5: 50 + 2 + 3 + 3 = ' + c.story.mood);
  c.story.mood = 50; c.fatigue = 75; step({ win: false, nota: 4 }); ok(c.story.mood === 43, 'derrota, nota < 5 y fatiga ≥ 70: 50 + 2 − 3 − 4 − 2 = ' + c.story.mood);
  c.fatigue = 0; c.broken = c.season; c.story.mood = 60; step({ win: false, nota: 6.5 }); const m1 = c.story.mood; step({ win: false, nota: 6.5 });
  ok(m1 === 49 && c.story.mood === 48, 'promesa incumplida: −8 una sola vez (60 → ' + m1 + ' → ' + c.story.mood + ')');
  c.broken = 0;
  // tiende a 60: jornadas que se compensan (ganar/perder alternos) desde un extremo acaban cerca de 60
  c.story.mood = 100; for (let i = 0; i < 30; i++) step({ win: i % 2 === 0, nota: 6.5 });
  ok(Math.abs(c.story.mood - 60) <= 4, 'desde 100, 30 jornadas alternas: vuelve a ~60 (' + c.story.mood + ')');
  // llave ≤ 30: «Necesitas desconectar» (con hueco), sin repetir en 6 jornadas
  c.life.ev = null; c.story.freq = 2;
  c.story.feed = c.story.feed.filter(x => x.b !== 'wkMoodLow'); delete c.story.flags.wkMoodLow;
  c.story.mood = 25; step({ win: false, nota: 6.5 });
  const low = c.story.feed.filter(x => x.b === 'wkMoodLow');
  c.story.mood = 25; step({ win: false, nota: 6.5 });
  ok(low.length === 1 && c.story.feed.filter(x => x.b === 'wkMoodLow').length === 1 && low[0].o === 1, 'ánimo ≤ 30: llega «Necesitas desconectar» (con respuesta) y no se repite en seguida');
  c.fatigue = 50; const co0 = c.coach, fxr = S.answer(c, low[0].id, 0);
  ok(fxr && c.fatigue === 40 && c.coach === co0 - 1, '«Desconectar»: fatiga −10 y Entrenador −1 (' + fxr.join('; ') + ')');
  c.story.feed = c.story.feed.filter(x => x.b !== 'wkMoodHigh'); delete c.story.flags.wkMoodHigh;
  c.story.mood = 95; step({ win: true, nota: 6.5 });
  ok(c.story.feed.some(x => x.b === 'wkMoodHigh'), 'ánimo ≥ 90: llega «Te ves imparable»');
  c.story.freq = 0; c.life.ev = { key: 'x' }; c.story.mood = 95; delete c.story.flags.wkMoodHigh; const n0 = c.story.feed.length; step({ win: true, nota: 6.5 });
  ok(c.story.feed.filter(x => x.b === 'wkMoodHigh').length === 1 && c.story.feed.length >= n0, 'sin hueco (Poca y decisión pendiente): la llave no publica');
  c.life.ev = null;
}

// ------------------------------------------------------------------ 4. Forma
section('4. Forma: igual que myForm6 (career.js)');
{
  const src = fs.readFileSync(path.join(H.ROOT, 'js/career.js'), 'utf8');
  ok(/function myForm6\(c\) \{ var f = form\(c\); return f == null \? 0 : clamp\(\(f - 6\.5\) \* 2, -FORM_MAX, FORM_MAX\); \}/.test(src) && /var FORM_MAX = 3\b/.test(src),
    'career.js: myForm6 sigue siendo clamp((form − 6,5) × 2, ±FORM_MAX) con FORM_MAX = 3');
  for (const mode of ['hall', 'beach']) {
    const B = H.boot({}), W = B.S.sys('week'), T = W._t;
    let n = 0, same = 0;
    const each = c => { };
    const orig = W.onMatch;
    W.onMatch = function (c) { orig.apply(this, arguments); const K = B.S.K(c), f = K.form(c), ref = f == null ? 0 : Math.max(-3, Math.min(3, (f - 6.5) * 2)); n++; if (Math.abs(T.formOf(c) - ref) < 1e-9) same++; };
    const c = H.autopilot(B, { mode, seasons: Math.min(2, SEASONS), seed: 66, each });
    ok(n > 10 && same === n, mode + ': forma = myForm6 en ' + same + ' de ' + n + ' jornadas');
    const svg = T.formSVG(c);
    ok(c.notes.length === 0 ? svg === '' : (svg.match(/<circle/g) || []).length === Math.min(8, c.notes.length), mode + ': gráfica con ' + Math.min(8, c.notes.length) + ' puntos');
  }
  const B = H.boot({}), T = B.S.sys('week')._t;
  ok(T.formOf({ notes: [] }) === 0 && T.formOf({ notes: [{ nota: 9 }, { nota: 9 }, { nota: 9 }] }) === 3 && T.formOf({ notes: [{ nota: 2 }, { nota: 7 }, { nota: 7 }, { nota: 7 }] }) === 1, 'casos: sin notas 0, tope +3, solo cuentan las 3 últimas');
}

// ------------------------------------------------------------------ 5. Pacto
section('5. Pacto con el entrenador');
for (const mode of ['beach', 'hall']) {
  const offers = [];
  const B = H.boot({}), W = B.S.sys('week'), T = W._t, orig = T.offerPact;
  // cuenta las charlas por temporada al publicarse (wkPactOffer): el feed tiene tope 30 y con todos los sistemas las primeras ya
  // no están al acabar la temporada
  const post0 = B.S.post; let nOff = 0;
  B.S.post = function (c, o) { const e = post0.apply(this, arguments); if (e && o && o.b === 'wkPactOffer') nOff++; return e; };
  const c = H.autopilot(B, { mode, seasons: SEASONS, seed: 1357, each: (c, s) => { offers.push(nOff); nOff = 0; } });
  B.S.post = post0;
  ok(offers.length === SEASONS && offers.every(n => n >= 2), mode + ': 2 charlas por temporada (jornada 1 y mitad): ' + offers.join(','));
}
{
  const B1 = H.boot({}), B2 = H.boot({});
  const a = newCareer(B1, 'beach', 2468), b = newCareer(B2, 'beach', 2468);
  ok(J(a.story.pactOff) === J(b.story.pactOff), 'misma semilla, misma oferta de pactos');
  const o = a.story.pactOff.o;
  ok(o.length === 3 && J(o.map(x => x.d)) === '[0,1,2]' && new Set(o.map(x => x.id)).size === 3 && o.every(x => x.goal >= 1), 'oferta: 3 pactos distintos, Fácil/Normal/Difícil, objetivos ≥ 1 (' + o.map(x => x.id + ':' + x.goal).join(', ') + ')');
  const hc = newCareer(H.boot({}), 'hall', 2468), ho = hc.story.pactOff;
  ok(ho && ho.o.every(x => x.id !== 'assists'), 'pista (receptor): sin pactos de asistencias (' + ho.o.map(x => x.id).join(', ') + ')');
}
{
  // Fácil cumplido: exactamente +5 (escenario forzado)
  const B = H.boot({}), S = B.S, W = S.sys('week');
  newCareer(B, 'beach', 97531);
  const r = S.act('st-pact-0'), c = B.C.load(), p = c.story.pact;
  ok(r && p && p.diff === 0 && p.st === 'open' && !c.story.pactOff, 'act st-pact-0: pacto Fácil abierto (' + (r && r.fx ? r.fx.join('') : '') + ')');
  ok(S.act('st-pact-1') === null, 'no se puede abrir un segundo pacto');
  p.id = 'won'; p.goal = 1; p.got = 0;
  const coach0 = c.coach, mood0 = c.story.mood, log0 = c.story.pactLog.length, ctx = { season: c.season, phase: 'league', mN: c.story.mN + 1, nk: B.C._wkKey(c), played: { tag: '', wk: null } };
  c.story.mN++;
  W.onMatch(c, { season: c.season, phase: 'league', win: true, nota: 7, sim: false, me: {} }, { kind: 'league', week: 0, home: c.myClub }, ctx);
  const gap = 60 - mood0, pull = gap > 0 ? Math.min(gap, Math.max(2, Math.round(gap * 0.2))) : gap < 0 ? -Math.min(-gap, Math.max(2, Math.round(-gap * 0.2))) : 0;
  const moodWant = Math.max(0, Math.min(100, mood0 + pull + 3)) + 6;
  ok(c.coach === coach0 + 5, 'Fácil cumplido: Entrenador ' + coach0 + ' → ' + c.coach + ' (exactamente +5)');
  ok(!c.story.pact && c.story.pactLog.length === log0 + 1 && c.story.pactLog[log0].st === 'ok', 'el pacto se cierra como cumplido y va al historial');
  ok(c.story.mood === Math.min(100, moodWant), 'ánimo: victoria y pacto cumplido (+6) → ' + c.story.mood);
  ok(c.story.feed.some(x => x.b === 'wkPactOk' && x.o === 0), 'mensaje de cierre «Lo prometido» (sin respuesta)');
  // Difícil fallado: −6 al acabar el tramo
  c.story.pact = { s: c.season, blk: 1, id: 'won', goal: 99, x: 0, base: c.story.mN, until: c.week, diff: 2, st: 'open', got: 0, n: 0, sum: 0, w: 0 };
  const coach1 = c.coach; c.story.mN++;
  W.onMatch(c, { season: c.season, phase: 'league', win: false, nota: 6, sim: false, me: {} }, { kind: 'league', week: 0, home: c.myClub }, ctx);
  ok(c.coach === coach1 - 6 && c.story.pactLog[c.story.pactLog.length - 1].st === 'ko', 'Difícil fallado al acabar el tramo: Entrenador ' + coach1 + ' → ' + c.coach + ' (−6)');
  // Normal con progreso de una estadística y la nota simulada a mitad de peso
  c.story.pact = { s: c.season, blk: 1, id: 'notaN', goal: 1, x: 7.5, base: c.story.mN, until: 99, diff: 1, st: 'open', got: 0, n: 0, sum: 0, w: 0 };
  W.onMatch(c, { season: c.season, phase: 'league', win: true, nota: 8, sim: true, me: {} }, { kind: 'league', week: 0, home: c.myClub }, ctx);
  ok(c.story.pact && c.story.pact.got === 0.5, 'nota simulada a mitad de peso: un 8 simulado cuenta 0,5 (' + (c.story.pact && c.story.pact.got) + ')');
  const coach2 = c.coach;
  W.onMatch(c, { season: c.season, phase: 'league', win: true, nota: 8, sim: true, me: {} }, { kind: 'league', week: 0, home: c.myClub }, ctx);
  ok(!c.story.pact && c.coach === coach2 + 8, 'dos simulados de 8 cumplen el Normal: Entrenador +8 (' + coach2 + ' → ' + c.coach + ')');
  // cambiar de club: el pacto se anula sin efecto
  c.story.pact = { s: c.season, blk: 1, id: 'won', goal: 9, x: 0, base: c.story.mN, until: 99, diff: 0, st: 'open', got: 0, n: 0, sum: 0, w: 0 };
  const coach3 = c.coach; W.onJoin(c, { season: c.season, phase: c.phase, offer: {} });
  ok(!c.story.pact && c.coach === coach3 && c.story.pactLog[c.story.pactLog.length - 1].st === 'x', 'fichar por otro club: el pacto se anula sin efecto');
}

// ------------------------------------------------------------------ 6. determinismo eligiendo
section('6. Determinismo eligiendo la carta 0');
for (const mode of ['beach', 'hall']) {
  const run = () => H.autopilot(H.boot({}), { mode, seasons: Math.min(2, SEASONS), seed: 4242, week: true });
  const a = run(), b = run(), plain = H.autopilot(H.boot({}), { mode, seasons: Math.min(2, SEASONS), seed: 4242 });
  ok(J(a) === J(b), mode + ': mismo JSON entero (cartas elegidas: ' + a.story.wkN + ')');
  ok(a.story.wkN > 5 && H.strip(a) !== H.strip(plain), mode + ': elegir carta sí cambia la carrera (es una elección)');
}

// ------------------------------------------------------------------ 7. textos, pintores, chips y ensure
section('7. Textos, pintores, chips y ensure');
{
  let bad = [], n = 0;
  for (const mode of ['beach', 'hall']) {
    const B = H.boot({}), S = B.S, W = S.sys('week'), T = W._t;
    const c = newCareer(B, mode, 1111);
    c.life = c.life || {}; const sp0 = c.life.sponsor; c.life.sponsor = { name: 'Chanclas Voladoras', tier: 1, pay: 10 };
    T.CARDS.forEach(card => { const t = T.cardText(c, card.id, 1001); n++; if (!t.t || !t.x || BAD.test(t.t + t.x)) bad.push(mode + ' carta ' + card.id + ': ' + t.t + ' / ' + t.x); });
    for (let k = 0; k < 6; k++) T.CARDS.forEach(card => { const t = T.cardText(c, card.id, 2000 + k); n++; if (BAD.test(t.t + t.x)) bad.push(mode + ' carta ' + card.id + ' v' + k); });
    c.life.sponsor = sp0;
    T.PACTS.forEach(d => [0, 1, 2].forEach(df => [1, 2].forEach(blk => [1, 2, 5].forEach(goal => {
      const t = T.pactText(c, { id: d.id, goal, x: d.x ? d.x[df] : d.id === 'tidy' ? 1 : 0, blk, until: 7 }); n++;
      if (!t || BAD.test(t) || /\b1 (partidos|retos|errores|victorias)\b/.test(t)) bad.push(mode + ' pacto ' + d.id + ' ' + goal + ': ' + t);
    }))));
    ['wkPactOffer', 'wkPactOk', 'wkPactKo', 'wkMoodLow', 'wkMoodHigh'].forEach(b => {
      for (let v = 0; v < 6; v++) {
        const e = { id: 900 + v, b, k: '', vars: { pacto: 'Ganar 3 partidos antes de la jornada 8' }, o: /Mood/.test(b) ? 1 : 0, ans: v % 2 ? -2 : -1 };
        const t = S.text(c, e); n++;
        const all = [t.t, t.x, t.c].concat(t.o.map(o => o.t)).join(' ');
        if (!t.t || !t.x || BAD.test(all)) bad.push(mode + ' ' + b + ': ' + all);
      }
    });
    // pintores con cartas, con oferta, con pacto abierto y con historial
    const HLP = { esc: s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])) };
    const views = [];
    views.push(W.ui.week(c, HLP), W.ui.state(c, HLP), W.ui.state(c, null));
    S.act('st-pact-1'); const c2 = B.C.load(); views.push(W.ui.state(c2, HLP));
    const chP = W.chips(c2);
    ok(chP.some(x => /^Pacto \d/.test(x.t)), mode + ': chip «Pacto n/m» con el pacto abierto (' + chP.map(x => x.t).join(' | ') + ')');
    S.act('st-wk-0'); const c3 = B.C.load(); views.push(W.ui.week(c3, HLP));
    c3.story.pactLog.push({ s: 1, blk: 1, id: 'won', d: 0, st: 'ok', t: 'Ganar 2 partidos antes de la jornada 8' }); c3.story.pact = null; c3.story.pactOff = null; views.push(W.ui.state(c3, HLP));
    views.forEach((h, i) => { n++; if (BAD.test(h.replace(/style="[^"]*"/g, ''))) bad.push(mode + ' pintor ' + i + ': ' + (h.match(BAD) || [''])[0]); });
    ok(views[0].indexOf('data-act="st-wk-') > 0 && views[1].indexOf('data-act="st-pact-') > 0 && views[3].indexOf('Progreso') > 0, mode + ': pintores con botones st-wk / st-pact y progreso del pacto');
    ok((views[0].match(/data-act="st-wk-/g) || []).length === 3 && (views[1].match(/data-act="st-pact-/g) || []).length === 3, mode + ': 3 cartas y 3 pactos, apilados');
    // chips puros
    const c4 = B.C.load(); const js0 = J(c4); const ch = W.chips(c4), all = S.chipsOf(c4);
    ok(J(c4) === js0 && ch.every(x => typeof x.t === 'string' && x.t && !BAD.test(x.t + (x.x || '')) && typeof x.p === 'number'), mode + ': chips puros y sin «undefined» (' + ch.map(x => x.t).join(' | ') + ')');
  }
  ok(bad.length === 0, 'textos limpios en ' + n + ' casos' + (bad.length ? ': ' + bad.slice(0, 5).join(' || ') : ''));
  // chip «Tu semana» y «Charla» recién fichado
  const B = H.boot({}), c = newCareer(B, 'beach', 1212), ch = B.S.sys('week').chips(c);
  ok(ch.some(x => x.t === 'Tu semana: elige') && ch.some(x => /Charla/.test(x.t)), 'recién fichado: chips «Tu semana: elige» y «Charla con el entrenador»');
}
{
  const B = H.boot({}), S = B.S;
  const c = newCareer(B, 'beach', 31);
  c.story.wk = { k: 'x', o: 'y' }; c.story.pact = { id: 'nope', st: 'open' }; c.story.pactOff = { o: [{ id: 'won' }] }; c.story.pactLog = 'z'; c.story.wkN = -4; c.story.brokenS = 'q';
  S.ensure(c);
  const s = c.story;
  ok(s.wk && Array.isArray(s.wk.o) && s.wk.pick === -1 && s.pact === null && s.pactOff === null && Array.isArray(s.pactLog) && s.wkN === 0 && s.brokenS === 0, 'ensure sanea wk, pact, pactOff, pactLog, wkN y brokenS rotos');
  const s1 = J(c.story); S.ensure(c); ok(J(c.story) === s1, 'ensure es idempotente');
  c.story.pact = { s: c.season, blk: 1, id: 'won', goal: 'x', st: 'open' }; S.ensure(c);
  ok(c.story.pact && c.story.pact.goal === 0 && c.story.pact.got === 0, 'un pacto abierto con números rotos se repara');
}
{
  // sin Math.random en el módulo
  const src = fs.readFileSync(path.join(H.ROOT, 'js/career-story-week.js'), 'utf8');
  ok(!/Math\.random/.test(src), 'sin Math.random en js/career-story-week.js');
}

console.log('\n' + passes + ' comprobaciones bien' + (fails ? ', ' + fails + ' FALLOS' : ''));
console.log(fails ? 'HAY FALLOS' : 'TODO OK');
process.exit(fails ? 1 : 0);
