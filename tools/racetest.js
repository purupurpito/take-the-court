/* TAKE THE COURT — tools/racetest.js (owner: carrera)
 * Pruebas de «Carrera por los premios» (js/career-race.js, VB.CareerRace). Node puro (vm, sin DOM): node tools/racetest.js
 *  1. Sin career-race.js no cambia nada (no está en los FILES de careertest ni de storyhelp) y, con él, la temporada va igual jornada a
 *     jornada (partidos, notas, estadísticas, tabla, entrenador) hasta que el corte de mitad da seguidores; si no los da, toda la
 *     temporada. Playa y pista × 3 semillas.
 *  2. Espejo de umbrales: needF ⇔ career-life AWARDS (test / h) para u, L y f variados, con cifras a ±1e-6 del umbral.
 *  3. Ganador = carrera: 3 semillas × 6 temporadas × 2 modos jugándolo todo; por cada premio, ganado ⇔ 1r en la clasificación final
 *     y sin condición que te deje fuera (también los nuevos: joven, receptor y opuesto).
 *  4. Determinismo: la misma semilla da el mismo c.race y las mismas clasificaciones.
 *  5. Ningún Math.random (en el código y con Math.random que lanza).
 *  6. Guardado viejo sin c.race y c.race corrupto: carga, ensure repara y nada lanza.
 *  7. Tendencias: coherentes con la jornada anterior; repintar o recargar no las mueve.
 *  8. Mitad de temporada: una vez por temporada, con mensaje; la fama solo sube si vas 1r (como mucho 2 premios).
 *  9. Gala: líneas por modo, líbero solo en la pista, «tú» ⇔ premio, nombres del pool (no vacíos, sin repetir, distintos al tuyo).
 * 10. Textos: sin «{», «undefined», «NaN», «1.er», «·» ni emojis; ordinales 1r, 2º, 3r.
 * 11. Calibrado (informativo): perfiles de temporada buena; receptor, opuesto y joven ganan entre el 25 y el 60 % de 200 semillas.
 * 12. Bordes: menos de 2 y de 6 partidos, menos del 50 % jugado, 24 años, cambio de liga y de puesto a mitad.
 * 13. Interfaz: page, card y galaCard (con .ph y sin él), registros y acciones rc-*.
 * Salida «TODO OK» o los fallos; process.exit(fails ? 1 : 0).
 */
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./storyhelp');
const RACE = 'js/career-race.js';
const QUICK = process.argv.includes('--quick');
let fails = 0, oks = 0;
function ok(c, what) { if (c) oks++; else { fails++; if (fails < 60) console.log('  FALLO: ' + what); } }
function sec(t) { console.log('§' + t); }
const clone = o => JSON.parse(JSON.stringify(o));

function boot(race) { return H.boot({ story: false, extra: race ? [RACE] : [] }); }
function mk(B, hall, seed) {
  const K = B.C;
  const c = hall ? K.create({ mode: 'hall', name: 'Ares Belmonte', num: 8, pos: 'OH', seed, now: 1 }) : K.create({ mode: 'beach', name: 'Ares Belmonte', num: 7, role: 'atk', seed, now: 1 });
  K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  return K.load();
}
/** Un paso (una jornada): jugado con playOne (play: true) o simulado; contesta la decisión de career-life con 0. */
function step(B, hall, i, play) {
  const K = B.C, L = B.VB.CareerLife, c = K.load(), n = K.next(c);
  if (!n) return false;
  if (play === 'all' || (play === 'third' && i % 3 === 0)) H.playOne(B, hall, (i % 4) !== 0);
  else if (n.bench) K.benchNext(); else K.simulateNext();
  const ev = L && L.pendingEvent(K.load()); if (ev) L.answer(0);
  return true;
}
function nextSeason(B) {
  const K = B.C, c = K.load();
  if (c.phase !== 'off') return;
  K.stay(1);
  if (K.load().phase === 'off') { const i = (K.load().offers || []).findIndex(o => !o.trial); if (i >= 0) K.acceptOffer(i, 1); }
}
const RACE_IDS = ['young', 'rec', 'opp'];
/** Lo que el corte de mitad no debe cambiar (sin vida ni dinero, que dependen de la fama). */
function proj(c) {
  const o = { s: c.season, w: c.week, ph: c.phase, st: c.stats, notes: c.notes, pl: [c.player.st, c.player.xp, c.player.lvl], coach: c.coach, hist: c.history,
    tro: (c.trophies || []).filter(t => t.kind !== 'premio' || !/^(Mejor joven|Mejor receptor|Mejor opuesto) /.test(t.name)), myClub: c.myClub };
  if (c.mode === 'hall') o.tab = (c.clubs || []).map(k => [k.id, k.lid, k.pts, k.w, k.l]); else o.res = c.res;
  return JSON.stringify(o);
}
const TXT = [];   // textos para §10
function grabMsgs(c) { (c.inbox || []).filter(m => m.k === 'race').forEach(m => TXT.push(m.t, m.x)); }

// ---------------------------------------------------------------- §1
sec('1 sin cambios');
{
  const ct = fs.readFileSync(path.join(H.ROOT, 'tools/careertest.js'), 'utf8');
  const fl = (ct.match(/FILES\s*=\s*\[[^\]]*\]/) || [''])[0];
  ok(fl && fl.indexOf('career-race') < 0, 'careertest FILES no carga career-race.js');
  ok(H.BASE.concat(H.STORY).every(f => f.indexOf('career-race') < 0), 'storyhelp BASE/STORY no cargan career-race.js');
  for (const hall of [false, true]) for (const seed of [1, 7, 23]) {
    const A = boot(false), B = boot(true);
    mk(A, hall, seed); mk(B, hall, seed);
    let i = 0, same = true, faved = false, steps = 0;
    while (A.C.load().phase !== 'off' && i < 120) {
      step(A, hall, i, 'third'); step(B, hall, i, 'third'); i++;
      const cb = B.C.load();
      if (!faved && proj(A.C.load()) !== proj(cb)) { same = false; break; }
      steps++;
      if (cb.race && cb.race.mid && cb.race.mid.fav.length) faved = true;
    }
    ok(same, (hall ? 'pista' : 'playa') + ' semilla ' + seed + ': misma temporada jornada a jornada (' + steps + ' jornadas' + (faved ? ', hasta el corte con fama' : '') + ')');
    ok(B.C.load().race && B.C.load().race.v === 1, 'c.race creado');
    grabMsgs(B.C.load());
  }
}

// ---------------------------------------------------------------- §2
sec('2 espejo de umbrales');
{
  const B = boot(true), R = B.VB.CareerRace, AW = B.VB.CareerLife.AWARDS;
  let n = 0;
  for (const h of [false, true]) for (const id of ['mvp', 'pts', 'ace', 'blk', 'dig', 'set']) {
    const a = AW.filter(x => x.id === id)[0];
    if (!a || (a.only && a.only !== (h ? 'hall' : 'beach'))) continue;
    const key = { ace: 'aces', blk: 'blocks', dig: 'digs', set: 'assists' }[id];
    for (const u of [0, 0.25, 0.5, 0.75, 0.999]) for (let L = 0; L <= 4; L++) for (const f of (h ? [1, 1.4, 25 / 15] : [1])) {
      const need = R._needF(id, u, L, f, h);
      for (const d of [1e-6, -1e-6]) {
        const v = need + d;
        const x = { r: () => u, L, f, nota: id === 'mvp' ? v : 7, pos: 1, pp: id === 'pts' ? v : 0, per: k => (k === key ? v : 0), newLeague: false };
        const cc = { life: { awards: [] }, player: { age: 25 } };
        const got = !!(h && a.h ? a.h(cc, x) : a.test(cc, x));
        n++; ok(got === (v >= need), id + (h ? ' pista' : ' playa') + ' u=' + u + ' L=' + L + ' f=' + f + ' d=' + d);
      }
    }
  }
  ok(n > 300, 'casos del espejo: ' + n);
}

// ---------------------------------------------------------------- §3 + §9 + §10
sec('3 ganador = carrera (y 9 gala)');
const WINS = { beach: {}, hall: {} }, LOST = { beach: 0, hall: 0 };
const STATS0 = Object.assign({}, H.STATS);
const PROFS = {
  beach: [{ kills: 10, aces: 2, blocks: 1, digs: 8, assists: 3, errors: 4 }, { kills: 16, aces: 4, blocks: 3, digs: 14, assists: 3, errors: 2 }, { kills: 20, aces: 6, blocks: 4, digs: 22, assists: 3, errors: 1 }],
  hall: [{ kills: 4, aces: 0, blocks: 1, digs: 5, assists: 2, errors: 2 }, { kills: 7, aces: 1, blocks: 1, digs: 7, assists: 3, errors: 1 }, { kills: 12, aces: 2, blocks: 2, digs: 9, assists: 30, errors: 0 }]
};
{
  const SEEDS = QUICK ? [2] : [2, 11, 31], SEAS = QUICK ? 3 : 6;
  for (const hall of [false, true]) for (const seed of SEEDS) {
    const B = boot(true), K = B.C, R = B.VB.CareerRace;
    mk(B, hall, seed);
    for (let s = 0; s < SEAS; s++) {
      // perfiles de partido que rodean los umbrales (flojo, justo, bueno), distintos cada temporada: así salen premios ganados y perdidos
      const P = PROFS[hall ? 'hall' : 'beach'][(seed + s) % 3];
      Object.keys(P).forEach(k => { H.STATS[k] = P[k]; });
      let i = 0;
      while (K.load().phase !== 'off' && i < 140) { if (!step(B, hall, i, 'all')) break; i++; }
      const c = K.load();
      if (c.phase !== 'off') { ok(false, 'temporada sin acabar'); break; }
      const aw = c.life.awards.filter(a => a.season === c.season).map(a => a.id);
      if (!aw.length) LOST[hall ? 'hall' : 'beach']++;
      const ids = R.catsOf(c).filter(id => !R.CATS[id].rivals);
      ids.forEach(id => {
        const st = R.standings(c, id), cond = !!(st.me && st.me.rk === 1 && !st.me.gate);
        ok(aw.includes(id) === cond, (hall ? 'pista' : 'playa') + ' s' + seed + ' T' + c.season + ' ' + id + ': premio ' + aw.includes(id) + ' / carrera ' + cond + (st.me ? ' (' + st.me.rk + ', ' + st.me.v.toFixed(3) + ' vs ' + st.need.toFixed(3) + ', ' + st.me.gate + ')' : ''));
        if (aw.includes(id)) WINS[hall ? 'hall' : 'beach'][id] = (WINS[hall ? 'hall' : 'beach'][id] | 0) + 1;
        if (st.me) TXT.push(st.me.need);
      });
      // §9 gala
      const g = R.gala(c);
      ok(!!g, 'gala de la temporada');
      if (g) {
        const lines = g.it.filter(x => x.id !== 'rook');
        ok(lines.length === (hall ? 10 : 6), 'líneas de la gala: ' + lines.length);
        ok(g.it.some(x => x.id === 'lib') === hall, 'líbero solo en la pista');
        ok(g.it.filter(x => x.me).map(x => x.id).sort().join() === aw.slice().sort().join(), 'gala «tú» ⇔ premio: ' + g.it.filter(x => x.me).map(x => x.id) + ' / ' + aw);
        const pn = c.race.pool.map(p => p.n);
        ok(new Set(pn).size === pn.length && pn.every(x => x && x !== c.player.name), 'pool sin repetir ni tu nombre');
        ok(g.it.every(x => x.n && (x.me ? x.n === c.player.name : pn.includes(x.n))), 'ganadores rivales del pool');
        ok(c.race.hist.length && c.race.hist[c.race.hist.length - 1].s === c.season, 'historial de la temporada');
        g.it.forEach(x => TXT.push(x.n, x.club));
      }
      ok(c.inbox.filter(m => m.k === 'race' && m.t === 'Mitad de temporada: los premios' && m.s === c.season).length <= 1, 'un solo corte por temporada');
      grabMsgs(c);
      nextSeason(B);
    }
  }
  Object.keys(STATS0).forEach(k => { H.STATS[k] = STATS0[k]; });
  console.log('  premios ganados (playa / pista):', JSON.stringify(WINS.beach), JSON.stringify(WINS.hall), '— temporadas sin premio:', LOST.beach, LOST.hall);
  ok(Object.keys(WINS.beach).length >= 2 && Object.keys(WINS.hall).length >= 3, 'se ganan premios de varios tipos en los dos modos');
  ok(LOST.beach > 0 && LOST.hall > 0, 'y hay temporadas sin premio');
}

// ---------------------------------------------------------------- §4
sec('4 determinismo');
{
  const run = () => {
    const B = boot(true), K = B.C, R = B.VB.CareerRace; mk(B, true, 5);
    for (let s = 0; s < 2; s++) { let i = 0; while (K.load().phase !== 'off' && i < 140) { if (!step(B, true, i, 'third')) break; i++; } if (s === 0) nextSeason(B); }
    const c = K.load();
    return JSON.stringify(c.race) + '|' + JSON.stringify(R.catsOf(c).map(id => R.standings(c, id)));
  };
  ok(run() === run(), 'misma semilla, mismo c.race y clasificaciones');
}

// ---------------------------------------------------------------- §5
sec('5 sin Math.random');
{
  const src = fs.readFileSync(path.join(H.ROOT, RACE), 'utf8');
  ok(!/Math\.random/.test(src), 'el código no usa Math.random');
  const B = boot(true), K = B.C, R = B.VB.CareerRace; mk(B, false, 9);
  let i = 0; while (K.load().phase === 'league' && i < 9) { step(B, false, i, 'all'); i++; }
  const c = K.load(), orig = Math.random; let threw = '';
  Math.random = () => { throw new Error('Math.random'); };
  try {
    R.catsOf(c).forEach(id => R.standings(c, id)); R._snap(c); R.hook(c, 'match', {});
    const c2 = clone(c); c2.race.gala = null; c2.phase = 'off'; R.hook(c2, 'season'); R.hook(c2, 'newSeason');
    R.ui.page(c, 'race', fakeH(false)); R.ui.card(c, fakeH(true));
  } catch (e) { threw = e.message; }
  Math.random = orig;
  ok(!threw, 'nada llama a Math.random' + (threw ? ' (' + threw + ')' : ''));
}

// ---------------------------------------------------------------- §6
sec('6 guardado viejo y corrupto');
{
  const B = boot(true), K = B.C, R = B.VB.CareerRace; mk(B, true, 12);
  let i = 0; while (K.load().phase === 'league' && i < 6) { step(B, true, i, 'all'); i++; }
  const c = K.load();
  delete c.race; K.save(c); K._reset(); const c1 = K.load();
  ok(!!c1 && c1.race === undefined, 'carga sin c.race');
  let err = ''; try { R.ensure(c1); R.standings(c1, 'mvp'); R.ensure(c1); } catch (e) { err = e.message; }
  ok(!err && c1.race.v === 1 && Array.isArray(c1.race.pool), 'ensure repara un guardado viejo' + (err ? ' (' + err + ')' : ''));
  const e1 = JSON.stringify(R.ensure(c1)); ok(JSON.stringify(R.ensure(c1)) === e1, 'ensure idempotente');
  for (const bad of ['x', 5, [], { pool: {}, gala: 5, prev: 'x', cur: [1], mid: [], ann: 3, hist: 'h', s: 'z', lg: 4 }, { pool: [1, null, { n: 3 }], gala: { s: 1, it: 'no' }, mid: { s: 1 } }]) {
    const cx = clone(c); cx.race = clone(bad);
    let e2 = ''; try { R.ensure(cx); R.catsOf(cx).forEach(id => R.standings(cx, id)); R.hook(cx, 'match', {}); R.ui.page(cx, 'race', fakeH(true)); } catch (e) { e2 = e.message; }
    ok(!e2 && Array.isArray(cx.race.pool) && cx.race.pool.length > 0 && (cx.race.gala === null || Array.isArray(cx.race.gala.it)) && Array.isArray(cx.race.hist), 'c.race corrupto ' + JSON.stringify(bad).slice(0, 40) + (e2 ? ' (' + e2 + ')' : ''));
  }
  const cs = clone(c); cs.race = { pool: {}, gala: 5 }; K.save(cs); K._reset();
  let e3 = ''; try { const c3 = K.load(); R.standings(c3, 'mvp'); } catch (e) { e3 = e.message; }
  ok(!e3, 'recargar un c.race corrupto no lanza');
}

// ---------------------------------------------------------------- §7
sec('7 tendencias');
{
  const B = boot(true), K = B.C, R = B.VB.CareerRace; mk(B, true, 4);
  let i = 0, chk = 0;
  while (K.load().phase === 'league' && i < 30) {
    step(B, true, i, 'all'); i++;
    const c = K.load(); if (!c.race || !c.race.prev) continue;
    R.catsOf(c).forEach(id => {
      const a = R.standings(c, id), b = R.standings(c, id);
      ok(JSON.stringify(a.rows.map(r => r.d)) === JSON.stringify(b.rows.map(r => r.d)), 'repintar no mueve ' + id);
      if (a.me && c.race.prev.me[id]) { chk++; ok(a.me.d === c.race.prev.me[id].r - a.me.rk, 'tu flecha ' + id + ' = puesto anterior − actual'); }
      a.rows.filter(r => !r.me && typeof r.d === 'number').forEach(r => ok(Math.abs(r.d) <= 6, 'flecha rival razonable'));
    });
    const before = JSON.stringify(R.standings(c, 'mvp').rows.map(r => [r.n, r.d]));
    K.save(c); K._reset();
    ok(JSON.stringify(R.standings(K.load(), 'mvp').rows.map(r => [r.n, r.d])) === before, 'recargar no mueve las flechas');
  }
  ok(chk > 10, 'flechas comprobadas: ' + chk);
}

// ---------------------------------------------------------------- §8
sec('8 mitad de temporada');
{
  for (const hall of [false, true]) {
    const B = boot(true), K = B.C, R = B.VB.CareerRace, CL = B.VB.CareerLife; mk(B, hall, 21);
    const mw = hall ? K.hall.midWeek(K.load()) : K.beach.MID_WEEK;
    let i = 0; while (K.load().phase === 'league' && K.load().week < mw - 1 && i < 40) { step(B, hall, i, 'all'); i++; }
    const c = K.load();
    ok(!c.race.mid, 'sin corte antes de la mitad');
    // forzado: jornada de la mitad con tus números por encima de todos en tus carreras (y luego por debajo)
    for (const good of [true, false]) {
      const cx = clone(c); cx.week = mw; cx.race.mid = null; cx.race.cur = null;
      const S = cx.stats, n = Math.max(4, S.played); S.played = n; S.sim = 0;
      const k = good ? 3 : 0.1; S.aces = Math.round(5 * k * n); S.blocks = Math.round(4 * k * n); S.digs = Math.round(20 * k * n); S.pts = Math.round(30 * k * n); S.kills = Math.round(25 * k * n); S.assists = Math.round(40 * k * n); S.errors = 0;
      cx.notes.forEach(x => { x.nota = good ? 10 : 3; });
      const f0 = CL.ensure(cx).fame, m0 = cx.inbox.length;
      R.hook(cx, 'match', {});
      const mid = cx.race.mid, d = CL.ensure(cx).fame - f0, L = CL.lvlOf(cx), mult = [1, 2, 4, 8, 15][L];
      ok(!!mid && mid.s === cx.season, (hall ? 'pista' : 'playa') + ': corte hecho');
      ok(cx.inbox.slice(m0).some(m => m.t === 'Mitad de temporada: los premios'), 'mensaje del corte');
      ok(mid.fav.length <= 2, 'como mucho 2 «Favorito»');
      ok(mid.fav.every(id => mid.r[id] === 1), '«Favorito» solo si vas 1r');
      ok(Math.abs(d - 60 * mult * mid.fav.length) <= mid.fav.length, 'fama del corte = 60 × nivel × favoritos (' + d + ', ' + mid.fav.length + ')');
      if (good) ok(mid.fav.length >= 1, 'yendo 1r hay «Favorito»'); else ok(mid.fav.length === 0 && d === 0, 'sin ir 1r no hay fama');
      const m1 = cx.inbox.length; cx.week = mw + 1; R.hook(cx, 'match', {});
      ok(!cx.inbox.slice(m1).some(m => m.t === 'Mitad de temporada: los premios'), 'el corte no se repite');
      grabMsgs(cx);
    }
  }
}

// ---------------------------------------------------------------- §11 (informativo)
sec('11 calibrado (informativo)');
{
  const B = boot(true), R = B.VB.CareerRace, C = B.C.beach;
  // perfiles de «temporada buena» por partido a 15 (career-life.js, comentario de CH6) en L0-L2, con ±12 % de una temporada a otra
  const PROF = { rec: [9.4, 8.3, 11.6], opp: [5.2, 5.9, 6.2], young: [7.6, 7.7, 8.0] };
  for (const id of ['rec', 'opp', 'young']) {
    let w = 0, n = 0;
    for (let s = 1; s <= 200; s++) for (let L = 0; L <= 2; L++) {
      const rr = C._rng(C._hash(s, 'race-aw', 1)), us = { young: rr(), rec: rr(), opp: rr() };
      const nz = C._rng(C._hash(s, 'cal', id, L)), val = PROF[id][L] * (1 + (nz() - 0.5) * 0.24);
      const need = R._needF(id, us[id], L, 1, id !== 'young');
      n++; if (val >= need) w++;
    }
    const pc = Math.round(100 * w / n);
    console.log('  ' + id + ': gana el ' + pc + ' % (' + w + ' de ' + n + ')' + (pc < 25 || pc > 60 ? '  AVISO: fuera de 25-60 %' : ''));
  }
}

// ---------------------------------------------------------------- §12
sec('12 bordes');
{
  for (const hall of [false, true]) {
    const B = boot(true), K = B.C, R = B.VB.CareerRace; mk(B, hall, 17);
    const c0 = K.load();
    let st = R.standings(c0, 'mvp');
    ok(!st.open && !st.me && st.rows.length >= 4, 'sin jugar: solo favoritos, sin ti');
    ok(R.ui.card(c0, fakeH(false)) === '', 'sin tarjeta en Partido antes de la 2ª jornada');
    step(B, hall, 0, 'all');
    ok(!R.standings(K.load(), 'ace').open, 'con 1 partido aún no hay carrera');
    let i = 1; while (K.load().phase === 'league' && K.load().week < 6 && i < 30) { step(B, hall, i, 'all'); i++; }
    const c = K.load();
    st = R.standings(c, 'ace'); ok(st.open && !!st.me, 'con 2 o más partidos estás en la carrera');
    // menos de 6 al final
    const c6 = clone(c); c6.phase = 'off'; c6.stats.played = 5; c6.stats.sim = 0;
    ok(R._gate(c6, 'ace') === 'pocos', 'menos de 6 partidos al final: fuera de concurso');
    // más de la mitad simulados
    const cv = clone(c); cv.stats.sim = Math.ceil(cv.stats.played * 0.6);
    ok(R._gate(cv, 'pts') === 'visto', 'simulando más de la mitad: «Poco visto»');
    ok(/Te han visto poco/.test(R.standings(cv, 'pts').me.need), 'texto «Te han visto poco»');
    // 24 años
    const ca = clone(c); ca.player.age = 24;
    ok(R.mine(ca).indexOf('young') < 0, 'con 24 años no hay «Joven» en tus carreras');
    ok(!R.standings(ca, 'young').me && R._needText(ca, 'young', R.standings(ca, 'young')) === 'Es para menores de 24. Tú tienes 24.', 'aviso de edad');
    // cambio de liga a mitad (cesión o fichaje): el pool se rehace y no hay flechas viejas
    const cl = clone(c), me = K.load().clubs[cl.myClub];
    const other = cl.clubs.filter(k => hall ? k.lid !== me.lid && cl.leagues.some(l => l.id === k.lid) : k.lvl !== me.lvl)[0];
    if (other) {
      const pool0 = JSON.stringify(cl.race.pool); cl.myClub = other.id;
      const sl = R.standings(cl, 'mvp');
      ok(JSON.stringify(cl.race.pool) !== pool0 && cl.race.lg !== R.ensure(c).lg, 'cambio de liga: candidatos nuevos');
      ok(sl.rows.every(r => r.d == null), 'cambio de liga: sin flechas de la otra liga');
      ok(sl.rows.filter(r => !r.me).every(r => { const k = cl.clubs[r.club]; return k && (hall ? k.lid === other.lid : k.lvl === other.lvl); }), 'candidatos de la liga nueva');
    }
    // cambio de puesto a mitad (pista)
    if (hall) {
      const cp = clone(c); cp.player.roleKey = 'MB';
      ok(R.posCat(cp) === 'blk' && R.mine(cp).indexOf('blk') >= 0 && R.mine(cp).indexOf('rec') < 0, 'cambio de puesto: «Tu puesto» sigue al puesto nuevo');
      ok(!R.standings(cp, 'rec').me, 'cambio de puesto: ya no estás en Mejor receptor');
      cp.player.roleKey = 'S'; ok(R.posCat(cp) === 'set', 'colocador → Mejor colocador');
      cp.player.roleKey = 'OPP'; ok(R.posCat(cp) === 'opp' && !!R.standings(cp, 'opp').me, 'opuesto → Mejor opuesto');
    } else {
      const cp = clone(c); cp.player.roleKey = 'cr'; ok(R.posCat(cp) === 'dig', 'playa defensor → Mejor defensa');
      cp.player.roleKey = 'atk'; ok(R.posCat(cp) === 'blk', 'playa bloqueador → Muro del año');
    }
    // categoría de otro modo: null, sin lanzar (API pública)
    let thr = '';
    try {
      for (const id of hall ? [] : ['set', 'rec', 'opp', 'lib']) ok(R.standings(c, id) === null && R.rankOf(c, id) === 0 && R.leaders(c, id).length === 0, 'playa: ' + id + ' da null');
      ok(R.standings(c, 'nada') === null, 'categoría desconocida: null');
    } catch (e) { thr = e.message; }
    ok(!thr, 'standings de otro modo no lanza ' + thr);
    // el rival personal no cambia al resto de candidatos (va al final, con su tirada)
    {
      const cr = clone(c), lr = cr.life || (cr.life = {});
      cr.race.pool = []; lr.rival = null;
      const p0 = R._pool(cr).map(x => x.n + '|' + x.k + '|' + x.a + '|' + x.p + '|' + x.q);
      const me = cr.clubs[cr.myClub], oc = R._pool(cr)[0].k;
      lr.rival = { name: 'Zoe Rivalta', club: oc };
      const p1 = R._pool(cr).map(x => x.n + '|' + x.k + '|' + x.a + '|' + x.p + '|' + x.q);
      ok(me && p1.length === p0.length + 1 && p1[p1.length - 1].indexOf('Zoe Rivalta|') === 0 && p0.every((x, j) => x === p1[j]), 'el rival se añade al final sin cambiar a los demás');
    }
    // cola separada: el 5º queda lejos del 1º
    {
      const st5 = R.standings(clone(c), 'pts'), rv = st5.rows.filter(r => !r.me).map(r => r.F).sort((x, y) => y - x);
      ok(rv.length >= 5 && rv[4] <= rv[0] * 0.8 && rv[4] >= rv[0] * 0.5, 'cola de recuentos: 5º entre 0,5 y 0,8 × el 1º (' + (rv[4] / rv[0]).toFixed(2) + ')');
      const sn = R.standings(clone(c), 'mvp'), rn = sn.rows.filter(r => !r.me).map(r => r.F).sort((x, y) => y - x);
      ok(rn.length >= 5 && rn[0] - rn[4] >= 0.6 && rn[0] - rn[4] <= 1.6, 'cola de nota: 5º entre 0,6 y 1,6 por debajo (' + (rn[0] - rn[4]).toFixed(2) + ')');
    }
  }
}

// ---------------------------------------------------------------- §13 (+ §10 con el HTML)
function fakeH(ph) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  return { esc, sp: (a, k) => a.filter(x => x !== '' && x != null).join(' / '), ph: () => ph, q: (t, x) => '<button class="sp-q" data-q-title="' + esc(t) + '">?</button>', kitSw: () => '', crest: () => '' };
}
sec('13 interfaz');
{
  for (const hall of [false, true]) {
    const B = boot(true), K = B.C, R = B.VB.CareerRace; mk(B, hall, 8);
    let i = 0; while (K.load().phase === 'league' && i < 9) { step(B, hall, i, 'all'); i++; }
    const c = K.load();
    const X = B.VB.CareerUIExt.filter(x => x.id === 'race')[0], XC = B.VB.CareerExt.filter(x => x.id === 'race')[0];
    ok(X && X.prefix === 'rc-' && X.subs[0].tab === 'league' && X.subs[0].id === 'race' && X.subs[0].has(c), 'registro de interfaz (Liga › Premios)');
    ok(XC && typeof XC.hook === 'function' && typeof XC._demo === 'function' && XC.caseAwards().length === 3, 'registro del núcleo (hook, caseAwards, _demo)');
    let err = '';
    try {
      for (const ph of [false, true]) {
        for (const s of ['mvp', 'young', 'pos', 'ace', 'oth', 'pts', 'dig']) {
          R._sel(s);
          const h = X.page(c, 'race', fakeH(ph));
          ok(/data-act="rc-cat"/.test(h) && h.indexOf('Carrera por los premios') >= 0, 'página ' + s + (ph ? ' (móvil)' : ''));
          TXT.push(h.replace(/<[^>]+>/g, ' '));
        }
        const cd = X.match(c, fakeH(ph));
        ok(/data-act="rc-open"/.test(cd) && /cpr-st/.test(cd), 'tarjeta de Partido' + (ph ? ' (móvil)' : ''));
        TXT.push(cd.replace(/<[^>]+>/g, ' '));
      }
      ok(X.act('rc-cat', { getAttribute: () => 'ace' }).render === true && R._sel() === 'ace', 'acción rc-cat');
      const ro = X.act('rc-open', null); ok(ro && ro.tab === 'league' && ro.s === 'race', 'acción rc-open');
      ok(X.act('rc-nada', null) === null, 'acción desconocida: null');
      ok(typeof X.css() === 'string' && X.css().indexOf(':root.ph:not(#_):not(#_):not(#_) #career') >= 0, 'CSS con prefijo del móvil');
      ok(!/font-size:(\d|1[01])(\.\d+)?px/.test(X.css().split('\n').filter(l => l.indexOf(':root.ph') === 0).join('\n')), 'móvil: ninguna letra fija < 12 px');
      // gala (fin de temporada)
      while (K.load().phase !== 'off' && i < 160) { step(B, hall, i, 'all'); i++; }
      const co = K.load();
      for (const ph of [false, true]) {
        const g = X.seasonEnd(co, fakeH(ph));
        ok(/Gala de premios/.test(g) && (g.match(/class="cpr-gi/g) || []).length >= (hall ? 10 : 6), 'gala en el fin de temporada' + (ph ? ' (móvil)' : ''));
        TXT.push(g.replace(/<[^>]+>/g, ' '));
        const pg = X.page(co, 'race', fakeH(ph)); ok(/Gala de premios/.test(pg), 'gala arriba en Liga › Premios');
      }
      ok(X.dot(co, 'race') === false || X.dot(co, 'race') === true, 'punto de aviso');
      R.ensure(co).seen = ''; ok(X.dot(co, 'race') === true, 'punto con gala nueva'); X.page(co, 'race', fakeH(false)); ok(X.dot(co, 'race') === false, 'el punto se va al abrir Premios');
      ok(X.match(co, fakeH(false)) === '', 'sin tarjeta en Partido en verano');
    } catch (e) { err = e.stack; }
    ok(!err, 'la interfaz no lanza ' + err);
  }
}

// ---------------------------------------------------------------- §10
sec('10 textos');
{
  const B = boot(true), R = B.VB.CareerRace;
  ok(R.ord(1) === '1r' && R.ord(2) === '2º' && R.ord(3) === '3r' && R.ord(4) === '4º' && R.ord(11) === '11º', 'ordinales 1r, 2º, 3r');
  const all = TXT.filter(x => typeof x === 'string');
  ok(all.length > 50, 'textos revisados: ' + all.length);
  const bad = all.filter(t => /[{]|undefined|NaN|1\.er|·|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t));
  ok(!bad.length, 'textos limpios' + (bad.length ? ': ' + bad[0].slice(0, 160) : ''));
  ok(!all.some(t => /\d\.\d/.test(t.replace(/\d+\.\d{3}/g, ''))), 'cifras con coma decimal');
}

console.log(fails ? '\n' + fails + ' FALLOS (' + oks + ' bien)' : '\nTODO OK (' + oks + ' comprobaciones)');
process.exit(fails ? 1 : 0);
