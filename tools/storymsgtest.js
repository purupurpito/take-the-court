#!/usr/bin/env node
/* MAKE THE CUT — tools/storymsgtest.js (owner: carrera)
 * Prueba del paquete P1 de «Carrera con vida» (js/career-story-msgs.js, notes/carrera-vida.md §2 S1 y §3) en node puro (vm, sin DOM):
 *   1. Caducidad: lo que pide respuesta y no se contesta se cierra a las 2 jornadas (ans −2), con línea de cierre, sin efecto en
 *      el núcleo y sin poder contestarlo ya.
 *   2. Tope por «Cuánta vida» (freq 0/1/2 → 1/3/4, menos la decisión de career-life): en ninguna jornada se pasa, playa y pista.
 *   3. Un mismo beat no se repite en 6 jornadas (s.seenB), contando todo lo publicado en varias temporadas.
 *   4. onAnswer (la decisión de career-life) solo escribe en c.story: todas las claves de EVENTS y todas sus opciones.
 *   5. La cadena 'party' (quedarte hasta tarde) sale exactamente 2 jornadas después, con la marca en s.chn.
 *   6. Prensa: nunca junto a una decisión pendiente pressWin/pressLoss (escenario forzado y en las carreras); sin ella, sí sale.
 *   7. Textos de todas las plantillas (todas las variantes, playa y pista) sin «{», «}», «undefined», «NaN», «.er» ni «·», y sin
 *      variables desconocidas; también lo pintado (bandeja, Gente, avisos).
 *   8. Quien te disputa el puesto (pista) y la interfaz no cambian c (JSON antes y después); la bandeja mezcla feed y c.inbox.
 *   9. Contestar por la acción 'st-ans-<id>-<i>' aplica el efecto una vez; la prensa deja la marca y el eco no toca el núcleo.
 * Uso: node tools/storymsgtest.js [temporadas=3]   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const H = require('./storyhelp.js');
const SEASONS = Math.max(1, +(process.argv[2] || 3));
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }
const BAD = /\{|\}|undefined|NaN|\.er\b|·/;
const clone = o => JSON.parse(JSON.stringify(o));
const noStory = c => { const o = clone(c); delete o.story; return JSON.stringify(o); };

/** Como H.autopilot, pero con «Cuánta vida» fijada al crear y una llamada step(c, info) tras cada jornada, ANTES de contestar la
 *  decisión de career-life (info.ev = la decisión que había cuando corrió story). */
function drive(B, o) {
  const K = B.C, L = B.VB.CareerLife, S = B.S, hall = o.mode === 'hall';
  K.create(hall ? { mode: 'hall', name: 'Vida Pista', num: 8, pos: 'OH', seed: o.seed, now: 1 } : { mode: 'beach', name: 'Vida Playa', num: 7, role: 'atk', seed: o.seed, now: 1 });
  K.acceptOffer(K.load().offers.findIndex(x => !x.trial), 2);
  if (o.freq != null) { const c = K.load(); S.ensure(c).freq = o.freq; K.save(c); }
  let played = 0;
  for (let s = 0; s < (o.seasons || 1); s++) {
    let guard = 0;
    while (K.load().phase !== 'off' && guard++ < 90) {
      const key = () => JSON.stringify([K.load().season, K.load().phase, K.load().week, K.load().koI, K.load().cup && K.load().cup.round, K.load().kos && K.load().kos.length]);
      const before = key(), i = played++;
      if (i % 3 === 0) H.playOne(B, hall, (i % 5) !== 0); else { const n = K.next(K.load()); if (n && n.bench) K.benchNext(); else K.simulateNext(); }
      const c = K.load();
      if (o.step) o.step(c, { ev: c.life && c.life.ev ? c.life.ev.key : '' });
      if (L) { const ev = L.pendingEvent(K.load()); if (ev) L.answer(o.evPick ? o.evPick(ev) : 0); }
      if (o.feed) { const st = K.load().story; st.feed.filter(x => x.o && x.ans === -1).map(x => x.id).forEach(id => S.act('st-ans-' + id + '-0')); }
      if (key() === before && K.load().phase !== 'off' && !K.next(K.load())) break;
    }
    K.stay(1);
  }
  return K.load();
}
/** Un 'match' a mano sobre la carrera c (sin pasar por career.js): solo para escenarios forzados de story. */
function fakeMatch(S, c, over) {
  const sum = Object.assign({ season: c.season, phase: c.phase, label: 'Jornada', rival: 0, rivalName: 'Voley Prueba', win: true, sets: [2, 1], setScores: [[21, 17], [18, 21], [15, 12]], sim: true, nota: 6.4, me: Object.assign({}, H.STATS), coach: c.coach, chem: 50 }, over || {});
  S.hook(c, 'match', sum, { kind: 'league', week: c.week | 0, round: 0 });
}

const Bb = H.boot({}), S0 = Bb.S, M0 = S0.sys('msgs');
ok(!!M0 && M0.BEATS.length >= 40, 'el sistema msgs está registrado con ' + (M0 ? M0.BEATS.length : 0) + ' beats y ' + (M0 ? Object.keys(M0.tpl).length : 0) + ' plantillas');
ok(M0 && Object.keys(M0.CH_OF).length >= 10, 'cadenas sobre los EVENTS de career-life: ' + (M0 ? Object.keys(M0.CH_OF).length : 0));
{ const T = M0.tpl, ids = M0.BEATS.map(b => b.id), asks = ids.filter(id => T[id] && T[id].o).length;
  ok(ids.every(id => T[id]), 'cada beat tiene su plantilla');
  ok(asks / ids.length > 0.45 && asks / ids.length < 0.75, 'más o menos el 60 % pide respuesta: ' + asks + ' de ' + ids.length);
  ok(Object.keys(T).filter(k => T[k].o).every(k => T[k].o.length >= 2 && T[k].o.length <= 3 && (T[k].o.length === 2 || T[k].press)), 'mensajes con 2 botones; la prensa, con 3');
  ok(Object.keys(T).filter(k => T[k].o).every(k => T[k].c), 'todo lo que pide respuesta tiene línea de cierre al caducar'); }

// ------------------------------------------------------------------ 1. caducidad
section('1. Caducidad a las 2 jornadas sin efecto');
for (const mode of ['beach', 'hall']) {
  const B = H.boot({}), S = B.S;
  const c = drive(B, { mode, seasons: 1, seed: 31 + (mode === 'hall' ? 1 : 0) }); // carrera hecha (fase off)
  c.life.ev = null; S.ensure(c).freq = 2;
  const e = S.post(c, { b: 'agStreak', o: 1, vars: { rival: 'Voley Prueba' } });
  ok(!!e && e.exp === c.story.mN + 2, mode + ': entrada con respuesta, caduca en mN + 2');
  const core1 = noStory(c);
  fakeMatch(S, c); fakeMatch(S, c);
  ok(e.ans === -1 && c.story.mN === e.exp, mode + ': 2 jornadas después sigue abierta (aún se puede contestar)');
  fakeMatch(S, c);
  ok(e.ans === -2 && e.r === 1, mode + ': sin contestar, a la 3ª jornada queda caducada (ans −2) y leída');
  ok(noStory(c) === core1, mode + ': caducar no toca el núcleo (carrera sin story idéntica)');
  ok(S.answer(c, e.id, 0) === null && noStory(c) === core1, mode + ': lo caducado ya no se puede contestar');
  const tx = S.text(c, e); ok(tx.c && !BAD.test(tx.c), mode + ': línea de cierre «' + tx.c + '»');
}

// ------------------------------------------------------------------ 2 y 3 y 6. tope, sin repetir, prensa (en carreras)
section('2-3. Tope por jornada según «Cuánta vida» y sin repetir beats en 6 jornadas (carreras de ' + SEASONS + ' temporadas)');
const CAP = S0.CAP;
const seenAll = { beach: {}, hall: {} };
for (const mode of ['beach', 'hall']) {
  for (const freq of [0, 1, 2]) {
    const B = H.boot({}), S = B.S, M = S.sys('msgs');
    let over = 0, steps = 0, lastN = 0, rep = [], pressBad = 0, pressN = 0, msgsN = 0, maxJ = 0;
    const last = {};
    drive(B, { mode, seed: 900 + freq * 7 + (mode === 'hall' ? 3 : 0), seasons: SEASONS, freq, feed: freq === 2,
      step(c, info) {
        steps++;
        const s = c.story, now = s.feed.filter(x => x.o && x.mN === s.mN).length, cap = CAP[freq] - (info.ev ? 1 : 0);
        if (now > Math.max(0, cap)) over++;
        maxJ = Math.max(maxJ, now);
        s.feed.filter(x => x.id > lastN).forEach(x => {
          if (x.sys !== 'msgs') return;
          msgsN++;
          if (/^pq\d+$/.test(x.b)) { pressN++; if (x.mN === s.mN && (info.ev === 'pressWin' || info.ev === 'pressLoss')) pressBad++; return; }
          if (x.b === 'seasonEnd' || x.b === 'seasonNew' || x.b === 'welcome' || x.b === 'cClinic') return;
          if (last[x.b] != null && x.mN - last[x.b] < M.SEEN_GAP) rep.push(x.b + '@' + x.mN);
          last[x.b] = x.mN; seenAll[mode][x.b] = (seenAll[mode][x.b] || 0) + 1;
        });
        lastN = s.n;
      } });
    ok(over === 0, mode + ' freq ' + freq + ': ' + steps + ' jornadas, ninguna pasa del tope ' + CAP[freq] + ' (máximo visto ' + maxJ + '; mensajes de msgs ' + msgsN + ', prensa ' + pressN + ')');
    ok(rep.length === 0, mode + ' freq ' + freq + ': ningún beat repetido en menos de 6 jornadas' + (rep.length ? ' — ' + rep.slice(0, 5).join(', ') : ''));
    ok(pressBad === 0, mode + ' freq ' + freq + ': ninguna rueda de prensa junto a una decisión pressWin/pressLoss');
    if (freq === 1) ok(pressN >= SEASONS * 2, mode + ' freq 1: la prensa sale con regularidad (' + pressN + ' en ' + steps + ' jornadas)');
  }
  ok(Object.keys(seenAll[mode]).length >= 12, mode + ': variedad de beats publicados: ' + Object.keys(seenAll[mode]).length);
}

// ------------------------------------------------------------------ 4. onAnswer solo escribe en story
section('4. onAnswer (decisión de career-life) solo escribe en c.story');
for (const mode of ['beach', 'hall']) {
  const B = H.boot({}), S = B.S, EV = B.VB.CareerLife.EVENTS;
  const c = drive(B, { mode, seasons: 1, seed: 77 });
  let bad = [], n = 0;
  Object.keys(EV).forEach(k => EV[k].o.forEach((o, i) => {
    const d = clone(c), before = noStory(d); S.hook(d, 'answer', k, i); n++;
    if (noStory(d) !== before) bad.push(k + ':' + i);
  }));
  ok(bad.length === 0, mode + ': ' + n + ' respuestas, la carrera fuera de story no cambia' + (bad.length ? ' — ' + bad.join(', ') : ''));
  const d = clone(c); S.hook(d, 'answer', 'party', 0);
  ok(d.story.chn.party && d.story.chn.party.i === 0 && d.story.chn.party.mN === d.story.mN, mode + ': la respuesta deja su marca de cadena en s.chn');
}

// ------------------------------------------------------------------ 5. cadena party
section('5. Cadena «party»: 2 jornadas después, con la marca');
for (const mode of ['beach', 'hall']) {
  const B = H.boot({}), S = B.S;
  const c = drive(B, { mode, seasons: 1, seed: 55 });
  c.life.ev = null; S.ensure(c).freq = 2; delete c.story.seenB.cParty;
  const m0 = c.story.mN; S.hook(c, 'answer', 'party', 0);
  const has = () => c.story.feed.filter(x => x.b === 'cParty');
  fakeMatch(S, c, { win: false, sets: [0, 2], setScores: [[17, 21], [19, 21]] });
  ok(has().length === 0, mode + ': 1 jornada después, todavía no');
  fakeMatch(S, c, { win: false, sets: [0, 2], setScores: [[17, 21], [19, 21]] });
  const p = has();
  ok(p.length === 1 && p[0].mN === m0 + 2 && p[0].o === 1, mode + ': a las 2 jornadas llega «' + (p[0] ? S.text(c, p[0]).t : '') + '» con 2 respuestas');
  ok(!c.story.chn.party, mode + ': la marca se consume');
  const c2 = clone(c); S.hook(c2, 'answer', 'party', 1); fakeMatch(S, c2); fakeMatch(S, c2); fakeMatch(S, c2);
  ok(c2.story.feed.filter(x => x.b === 'cParty').length === 1, mode + ': con «Un rato y a casa» no hay foto');
}

// ------------------------------------------------------------------ 6. prensa forzada
section('6. Prensa nunca junto a pressWin/pressLoss (escenario forzado)');
for (const mode of ['beach', 'hall']) {
  const B = H.boot({}), S = B.S;
  const c = drive(B, { mode, seasons: 1, seed: 66 });
  S.ensure(c).freq = 2;
  const pq = () => c.story.feed.filter(x => /^pq\d+$/.test(x.b) && x.mN === c.story.mN).length;
  for (const k of ['pressWin', 'pressLoss']) {
    c.story.pressNext = c.story.mN + 1; c.life.ev = { key: k, id: 1 };
    fakeMatch(S, c);
    ok(pq() === 0, mode + ': con ' + k + ' pendiente no hay rueda de prensa');
  }
  c.story.pressNext = c.story.mN + 1; c.life.ev = { key: 'party', id: 2 };
  fakeMatch(S, c);
  ok(pq() === 1, mode + ': con otra decisión pendiente y la prensa tocando, sí sale');
  const e = c.story.feed.filter(x => /^pq\d+$/.test(x.b)).pop(), t = S.text(c, e);
  ok(t.o.length === 3 && /^De equipo/.test(t.o[0].t) && /^Humilde/.test(t.o[1].t) && /^Chulería/.test(t.o[2].t), mode + ': 3 respuestas apiladas (equipo, humilde, chulería): ' + t.x);
  c.life.ev = null; c.story.pressNext = c.story.mN + 1;
  const used = c.story.pressQ.slice(); fakeMatch(S, c);
  const e2 = c.story.feed.filter(x => /^pq\d+$/.test(x.b)).pop();
  ok(used.indexOf(+e2.b.slice(2)) < 0, mode + ': la pregunta no se repite entre las 8 últimas');
}

// ------------------------------------------------------------------ 7. textos
section('7. Textos de todas las plantillas (todas las variantes) en playa y pista');
const DEMO = { rival: 'Voley Cádiz', nota: '7,8', n: '4', m: 'Diario La Red', seat: 'Gael Arnedo' };
for (const mode of ['beach', 'hall']) {
  const B = H.boot({}), S = B.S, M = S.sys('msgs');
  const c = drive(B, { mode, seasons: 1, seed: 88 });
  const known = Object.assign({}, S.vars(c), DEMO);
  let n = 0; const bad = [], unk = [];
  const each = (v, f) => (Array.isArray(v) ? v : v == null ? [] : [v]).forEach(f);
  Object.keys(M.tpl).forEach(id => {
    const tp = M.tpl[id], slots = [tp.t, tp.th, tp.x, tp.xh, tp.c, tp.ch];
    (tp.o || []).forEach(o => { slots.push(o.t, o.th); });
    slots.forEach(sl => each(sl, s => {
      n++;
      (String(s).match(/\{(\w+)\}/g) || []).forEach(m => { const k = m.slice(1, -1); if (!(k in known)) unk.push(id + ':' + k); });
      const out = String(s).replace(/\{(\w+)\}/g, (m, k) => known[k] != null ? known[k] : '');
      if (BAD.test(out) || !out.trim()) bad.push(id + ': ' + out);
    }));
  });
  ok(bad.length === 0, mode + ': ' + n + ' variantes sin «{», «undefined», «NaN», «.er» ni «·»' + (bad.length ? ' — ' + bad.slice(0, 3).join(' | ') : ''));
  ok(unk.length === 0, mode + ': ninguna variable desconocida' + (unk.length ? ' — ' + unk.slice(0, 5).join(', ') : ''));
  // lo publicado de verdad, con text() (variante por hash) y en cada estado
  let tn = 0; const tb = [];
  Object.keys(M.tpl).forEach((id, j) => {
    const e = { id: 9000 + j, b: id, k: M.tpl[id].k, vars: DEMO, o: M.tpl[id].o ? 1 : 0, ans: M.tpl[id].o ? -2 : -1, s: 1, w: 3, ph: 'league', r: 0 };
    const t = S.text(c, e); tn++;
    [t.t, t.x, t.c].concat(t.o.map(o => o.t)).forEach(x => { if (BAD.test(x)) tb.push(id + ': ' + x); });
    if (!t.t || !t.x) tb.push(id + ': vacío');
  });
  ok(tb.length === 0, mode + ': text() de las ' + tn + ' plantillas, limpio' + (tb.length ? ' — ' + tb.slice(0, 3).join(' | ') : ''));
  const strip = h => h.replace(/<[^>]*>/g, ' ');
  const ib = M.ui.inbox(c, null, null, {}), pp = M.ui.people(c, null), ch = JSON.stringify(M.chips(c));
  ok(!BAD.test(strip(ib)) && !BAD.test(strip(pp)) && !/undefined|NaN/.test(ch), mode + ': bandeja, Gente y avisos pintados sin restos');
}

// ------------------------------------------------------------------ 8. solo lectura e interfaz
section('8. Quien te disputa el puesto (pista) e interfaz: no cambian c');
{
  const B = H.boot({}), S = B.S, M = S.sys('msgs');
  let found = null;
  drive(B, { mode: 'hall', seasons: 1, seed: 123, step(c) { if (!found && M.seatRival(c)) found = clone(c); } });
  ok(!!found, 'en una temporada de pista aparece quien te disputa el puesto');
  if (found) {
    const before = JSON.stringify(found), sr = M.seatRival(found);
    const pp = M.ui.people(found, null); M.ui.inbox(found, null, null, {}); M.chips(found); M.seatRival(found);
    ok(JSON.stringify(found) === before, 'seatRival, Gente, bandeja y avisos dejan c idéntica (JSON antes y después)');
    ok(pp.indexOf(sr.name) >= 0 && /Tu media \d+ frente a \d+ de /.test(pp), 'Gente enseña «Tu media X frente a Y de ' + sr.name + '»');
  }
  const cb = drive(H.boot({}), { mode: 'beach', seasons: 1, seed: 124 });
  ok(M.seatRival(cb) === null, 'en playa no hay rival de puesto');
}
{
  const B = H.boot({}), S = B.S, M = S.sys('msgs');
  const c = drive(B, { mode: 'beach', seasons: 1, seed: 125 });
  c.life.ev = null; S.ensure(c).freq = 2;
  const e = S.post(c, { b: 'famVisit', o: 1, vars: {} });
  const h = M.ui.inbox(c, null, (m) => '<div class="msg box-' + m.id + '"></div>', {});
  const nMsg = (h.match(/class="msg/g) || []).length;
  ok(nMsg === c.story.feed.length + c.inbox.length, 'la bandeja mezcla ' + c.story.feed.length + ' del feed y ' + c.inbox.length + ' de c.inbox (' + nMsg + ' tarjetas)');
  ok(h.indexOf('Esperan tu respuesta') >= 0 && h.indexOf('data-act="st-ans-' + e.id + '-0"') >= 0 && h.indexOf('data-act="st-ans-' + e.id + '-1"') >= 0, 'lo que espera respuesta va arriba con sus 2 botones st-ans');
  ok(/data-nav/.test(h) && /▲/.test(h), 'botones dentro de [data-nav] y con su efecto (▲/▼)');
  ok(M.chips(c).some(x => x.tab === 'inbox' && /responder|mensajes/.test(x.t)), 'aviso de Partido: ' + JSON.stringify(M.chips(c).map(x => x.t)));
}

// ------------------------------------------------------------------ 9. contestar por acción, marca de prensa y eco
section('9. Contestar por la acción, marca de prensa y eco sin efectos');
for (const mode of ['beach', 'hall']) {
  const B = H.boot({}), S = B.S, K = B.C;
  drive(B, { mode, seasons: 1, seed: 140 });
  let c = K.load(); c.life.ev = null; S.ensure(c).freq = 2;
  const e = S.post(c, { b: 'famBad', o: 1, vars: {} }); K.save(c);
  const fam0 = c.story.rel.fam, fat0 = c.fatigue | 0;
  const r = S.act('st-ans-' + e.id + '-0'); c = K.load();
  const x = S.entry(c, e.id);
  ok(r && x.ans === 0 && c.story.rel.fam === Math.min(100, fam0 + 6) && (c.fatigue | 0) === Math.min(100, fat0 + 3), mode + ': «Voy» da Tu gente +6 y fatiga +3 (' + (r && r.fx ? r.fx.join(', ') : '') + ')');
  const r2 = S.act('st-ans-' + e.id + '-0'); c = K.load();
  ok(!r2 && c.story.rel.fam === Math.min(100, fam0 + 6), mode + ': contestar dos veces no repite el efecto');
  const p = S.post(c, { b: 'pq0', o: 1, vars: { m: 'Diario La Red', rival: 'Voley Prueba' } }); K.save(c);
  const coach0 = c.coach | 0, heat0 = c.story.rel.heat;
  S.act('st-ans-' + p.id + '-2'); c = K.load();
  ok((c.coach | 0) === Math.max(0, coach0 - 4) && c.story.rel.heat === Math.min(100, heat0 + 20), mode + ': chulería: Entrenador −4 y pique +20');
  ok(c.story.flags.press && c.story.flags.press.v.t === 2, mode + ': la respuesta deja s.flags.press para el eco');
  const core = noStory(c); fakeMatch(S, c, { win: true, sim: false, nota: 7 });
  ok(noStory(c) === core, mode + ': el eco (publicación y mensaje) no toca el núcleo');
  ok(c.story.feed.some(z => z.b === 'pEcoW') && c.story.flags.press.v.done === 1, mode + ': ganando, «Lo dijo y lo cumplió» y Cris escribe');
}

console.log('\n' + passes + ' comprobaciones bien' + (fails ? ', ' + fails + ' FALLOS' : ''));
console.log(fails ? 'HAY FALLOS' : 'TODO OK');
process.exit(fails ? 1 : 0);
