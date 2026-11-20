/* MAKE THE CUT — tools/allstartest.js (owner: estrellas)
 * Pruebas del Partido de las Estrellas y los concursos de la Carrera (js/contest.js + js/career-allstar.js). Node puro (vm, sin DOM),
 * con tools/storyhelp.js. Sale con «TODO OK» o con código 1.
 *   node tools/allstartest.js            todo
 *   node tools/allstartest.js quick      sin el calibrado largo (§6)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const H = require('./storyhelp');
const ROOT = H.ROOT, EXTRA = ['js/contest.js', 'js/career-allstar.js'], QUICK = process.argv[2] === 'quick';
// todas las extensiones de la Carrera sin interfaz, en el orden de index.html (las que existan): el calibrado se mide como en el juego
const ALLX = ['js/career-injury.js', 'js/career-natl.js', 'js/contest.js', 'js/career-allstar.js', 'js/career-loan.js', 'js/career-race.js', 'js/career-dev.js', 'js/career-prologue.js'];
let fails = 0, oks = 0;
function ok(cond, what) { if (cond) oks++; else { fails++; console.log('  FALLO: ' + what); } }
function sec(t) { console.log('\n' + t); }
/** Como storyhelp.boot (mismos ficheros y localStorage falso), con un process mínimo en el contexto por si algún fichero de la sim lo lee
 *  sin typeof. extra: false = sin los ficheros de las Estrellas; all: true = con todas las extensiones (ALLX). */
function boot(o) {
  o = o || {};
  const mem = {}, LS = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const cx = { console, Math, Date, JSON, Set, localStorage: LS, process: { env: {} } }; cx.globalThis = cx; cx.window = cx; vm.createContext(cx);
  for (const f of H.BASE.concat(H.STORY, o.extra === false ? [] : o.all ? ALLX : EXTRA)) { const fp = path.join(ROOT, f); if (fs.existsSync(fp)) vm.runInContext(fs.readFileSync(fp, 'utf8'), cx, { filename: f }); }
  return { VB: cx.VB, C: cx.VB.Career, S: cx.VB.CareerStory || null, mem, cx };
}

// Autopiloto «realista» para el calibrado: juega 1 de cada 2 (estadísticas fijas de storyhelp), simula el resto, reparte los puntos
// en el atributo más bajo y en verano acepta la oferta de más nivel (como haría un jugador que progresa).
const KEYS = ['spike', 'serve', 'recv', 'jump', 'react', 'dig', 'set', 'block', 'speed', 'ctl'];
function autoReal(B, o) {
  const K = B.C, L = B.VB.CareerLife, hall = o.mode === 'hall';
  const c = hall ? K.create({ mode: 'hall', name: 'Vida Pista', num: 8, pos: 'OH', seed: o.seed, now: 1 }) : K.create({ mode: 'beach', name: 'Vida Playa', num: 7, role: 'atk', seed: o.seed, now: 1 });
  K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  let played = 0;
  for (let s = 0; s < o.seasons; s++) {
    let g = 0;
    while (K.load().phase !== 'off' && g++ < 90) {
      const i = played++;
      if (o.before) o.before(K.load());
      if (o.camp) { const cc = K.load(); if (cc.allstar && cc.allstar.cur && cc.allstar.cur.st === 'vote') B.VB.CareerAllstar.camp(cc); }
      if (i % 2 === 0) H.playOne(B, hall, (i % 5) !== 0); else { const n = K.next(K.load()); if (n && n.bench) K.benchNext(); else K.simulateNext(); }
      if (L) { const ev = L.pendingEvent(K.load()); if (ev) L.answer(0); }
      let q = 0; while (K.load().player.pts > 0 && q++ < 40) { const st = K.load().player.st; const k = KEYS.slice().sort((a, b) => st[a] - st[b])[0]; if (!K.bump(k)) break; }
      if (!K.next(K.load()) && K.load().phase !== 'off') break;
    }
    const c2 = K.load(), off = c2.offers || [];
    let bi = -1, bl = -1; off.forEach((x, j) => { if (x.trial) return; const lv = hall ? (x.ovr || 0) : (x.lvl | 0) * 100 + (x.ovr || 0); if (lv > bl) { bl = lv; bi = j; } });
    if (bi >= 0) K.acceptOffer(bi, 1); else K.stay(1);
  }
  return K.load();
}
/** Carrera nueva (playa o pista) simulada hasta el fin de semana de las Estrellas; force: entra seguro (fama, notas y la media del corte
 *  de su grupo: lejos de esa media, la afición no te ve entre los mejores). */
function toEvent(B, mode, seed, force) {
  const K = B.C, A = B.VB.CareerAllstar;
  const c0 = mode === 'hall' ? K.create({ mode: 'hall', name: 'Ari Prueba', num: 9, pos: 'OH', seed, now: 1 }) : K.create({ mode: 'beach', name: 'Ari Prueba', num: 9, role: 'atk', seed, now: 1 });
  K.acceptOffer(c0.offers.findIndex(x => !x.trial), 2);
  for (let i = 0; i < 40; i++) {
    const c = K.load(), cur = c.allstar && c.allstar.cur;
    if (cur && cur.st === 'event') return c;
    if (force && cur && cur.st === 'vote') { c.life.fame = 50000; c.notes = c.notes.map(x => Object.assign({}, x, { nota: 8.2, sim: false })); while (c.notes.length < 5) c.notes.push({ nota: 8.2, win: true, sim: false, kind: 'league', wk: 0 }); const gp = A._t.gapOf(c, cur); if (gp > 0) Object.keys(c.player.st).forEach(k => { c.player.st[k] = Math.min(99, c.player.st[k] + gp); }); K.save(c); }
    const n = K.next(c); if (n && n.bench) K.benchNext(); else K.simulateNext();
    if (K.load().phase !== 'league') break;
  }
  const c = K.load(); return c.allstar && c.allstar.cur && c.allstar.cur.st === 'event' ? c : null;
}
const HLP = { esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])), sp: (a) => a.filter(x => x !== '' && x != null).join(' <i>|</i> '), q: (t) => '<button class="sp-q" data-q-title="' + t + '">?</button>', ph: () => false };
const BAD = [/\{/, /undefined/, /NaN/, /1\.er/, /·/, /\b1º/, /\b3º/, /\b2r\b/, /\b[0-9]+\.º/];
function badText(s) { s = String(s).replace(/style="[^"]*"/g, ''); for (const r of BAD) if (r.test(s)) return r.toString(); return ''; }

// ------------------------------------------------------------------ 0. gancho
sec('0. Gancho VB.CareerExt');
{
  const src = fs.readFileSync(path.join(ROOT, 'js/career.js'), 'utf8');
  if (!/VB\.CareerExt/.test(src) || !/function life\([^)]*\)\s*\{[^\n]*exts\(\)/.test(src)) { console.log('falta el gancho VB.CareerExt en career.js life()'); process.exit(1); }
  const B = boot(); ok(!!B.VB.CareerAllstar && B.VB.CareerExt.some(x => x.id === 'allstar'), 'registro en VB.CareerExt');
  ok(B.VB.CareerUIExt && B.VB.CareerUIExt.some(x => x.id === 'allstar' && x.prefix === 'as-'), 'registro en VB.CareerUIExt');
  let called = 0; const A = B.VB.CareerAllstar, h0 = A.hook; B.VB.CareerExt.find(x => x.id === 'allstar').hook = function (c, k) { called++; return h0(c, k); };
  const K = B.C, c = K.create({ mode: 'beach', name: 'Gancho', num: 4, role: 'atk', seed: 3, now: 1 }); K.acceptOffer(c.offers.findIndex(x => !x.trial), 2); K.simulateNext();
  ok(called > 0, 'life() llama al gancho');
}

// ------------------------------------------------------------------ 1. contrato
sec('1. Contrato: con el fichero apagado = sin el fichero');
for (const mode of ['beach', 'hall']) for (const seed of [2, 5, 9]) {
  const B0 = boot({ extra: false }), c0 = H.autopilot(B0, { mode, seasons: 4, seed });
  const B1 = boot(); B1.VB.CareerAllstar.enabled = false; const c1 = H.autopilot(B1, { mode, seasons: 4, seed });
  ok(H.strip(c0) === H.strip(c1), 'idéntica ' + mode + ' semilla ' + seed);
}

// ------------------------------------------------------------------ 2. determinismo
sec('2. Determinismo');
for (const mode of ['beach', 'hall']) {
  const a = JSON.stringify(H.autopilot(boot(), { mode, seasons: 3, seed: 11 })), b = JSON.stringify(H.autopilot(boot(), { mode, seasons: 3, seed: 11 }));
  ok(a === b, 'misma semilla, mismo JSON (' + mode + ')');
  ok(/"allstar":\{"v":1/.test(a), 'hay c.allstar (' + mode + ')');
}

// ------------------------------------------------------------------ 3. sin Math.random
sec('3. Sin Math.random');
for (const f of EXTRA) ok(!/Math\.random/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f + ' sin Math.random');

// ------------------------------------------------------------------ 4. guardados viejos y saneado
sec('4. Guardados viejos y saneado');
{
  const B0 = boot({ extra: false }); H.autopilot(B0, { mode: 'beach', seasons: 1, seed: 4 });
  const B = boot(); Object.keys(B0.mem).forEach(k => B.mem[k] = B0.mem[k]);
  const c = B.C.load(); ok(!!c && c.allstar === undefined, 'guardado viejo carga sin c.allstar');
  const before = JSON.stringify(c), A = B.VB.CareerAllstar;
  A.ensure(c); ok(c.allstar && c.allstar.v === 1 && c.allstar.cur === null && Array.isArray(c.allstar.log), 'ensure lo crea');
  const j1 = JSON.stringify(c); A.ensure(c); A.ensure(c); ok(JSON.stringify(c) === j1, 'ensure idempotente');
  const o = JSON.parse(j1); delete o.allstar; ok(JSON.stringify(o) === before, 'ensure solo toca c.allstar');
  c.allstar = 'x'; A.ensure(c); ok(c.allstar && typeof c.allstar === 'object' && c.allstar.v === 1, "c.allstar = 'x' se rehace");
  c.allstar = { cur: { st: 'zz' }, log: Array.from({ length: 100 }, (_, i) => ({ s: i, m: 'x', ct: null })) }; A.ensure(c);
  ok(c.allstar.cur === null, "cur con st 'zz' → null"); ok(c.allstar.log.length <= 40, 'log de 100 → ≤ 40 (' + c.allstar.log.length + ')');
  ok(c.allstar.log.every(e => e.ct && e.ct.srv && typeof e.ct.srv.rank === 'number' && e.m && Array.isArray(e.m.sc)), 'entradas del log saneadas');
  c.allstar.cur = { st: 'vote', s: c.season, w0: 4, wk: 7, pool: [{ nm: 'A', ovr: NaN }, { nm: 'B', ovr: 50, st: { jump: 'x' } }, { ovr: 40 }], camp: 9 };
  A.ensure(c); const p = c.allstar.cur.pool;
  ok(p.length === 1 && p[0].nm === 'B' && Object.values(p[0].st).every(v => isFinite(v)), 'pool con NaN saneado'); ok(c.allstar.cur.camp === 3, 'camp con tope');
  const hs = JSON.stringify(B.C.load()); A.ensure(B.C.load()); ok(JSON.stringify(B.C.load()) === hs, 'ensure no cambia nada más (sin tiradas)');
}
{
  // fin de semana de otra temporada que se quedó abierto: ensure lo cierra sin tiradas y lo pasa al historial una sola vez
  const B = boot(), A = B.VB.CareerAllstar, c = toEvent(B, 'beach', 21, true);
  ok(!!c, 'fin de semana (guardado raro)');
  if (c) {
    const s0 = c.season, n0 = c.allstar.log.length; c.allstar.cur.srv.best = 12; c.allstar.cur.srv.st = 'live'; c.season = s0 + 1;
    A.ensure(c); const cur = c.allstar.cur, e = c.allstar.log[c.allstar.log.length - 1];
    ok(cur.st === 'done' && c.allstar.log.length === n0 + 1 && e.s === s0, 'de otra temporada: cerrado y al historial');
    ok(cur.m.st === 'gone' && e.m.how === 'gone' && e.ct.srv.how === 'play' && e.ct.srv.s === 12 && e.ct.rcv.how === 'gone' && e.ct.rcv.rank === 6, 'lo pendiente, perdido; la marca hecha, cuenta');
    const j = JSON.stringify(c); A.ensure(c); ok(JSON.stringify(c) === j && !('stale' in cur), 'una sola vez (idempotente)');
  }
}

// ------------------------------------------------------------------ 5. calendario
sec('5. Calendario');
for (const mode of ['beach', 'hall']) {
  const B = boot(), A = B.VB.CareerAllstar, seen = {};
  const X = B.VB.CareerExt.find(x => x.id === 'allstar'), h0 = X.hook;
  X.hook = function (c, k, a, b) {
    h0(c, k, a, b);
    const cur = c.allstar && c.allstar.cur, cal = A._t.calOf(c);
    if (cur && cur.s === c.season) { const s = seen[c.season] = seen[c.season] || {}; if (cur.st === 'vote' && s.open == null) { s.open = c.week; s.mid = cal && cal.mid; } if (cur.st === 'event' && s.ev == null) s.ev = c.week; }
  };
  const c = H.autopilot(B, { mode, seasons: 3, seed: 6 });
  const ss = Object.keys(seen).map(Number);
  ok(ss.length === 3, mode + ': una edición por temporada (' + ss.length + ')');
  ok(ss.every(s => seen[s].open === seen[s].mid - 3 && seen[s].ev === seen[s].mid), mode + ': abre en mid − 3 y el fin de semana en mid ' + JSON.stringify(seen));
  ok(c.allstar.log.length === 3 && c.allstar.log.map(e => e.s).join() === '1,2,3', mode + ': un log por temporada');
}
{
  const B = boot(), A = B.VB.CareerAllstar, K = B.C;
  const c = K.create({ mode: 'hall', name: 'Corta', num: 4, pos: 'OH', seed: 8, now: 1 }); K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  const w0 = K.hall.weeksOf; K.hall.weeksOf = () => 6; A._t.K(null);
  const HV = A._t.K(K.load()); const wsave = HV.weeksOf; HV.weeksOf = () => 6;
  ok(A._t.calOf(K.load()) === null, 'liga de menos de 8 jornadas: sin edición');
  HV.weeksOf = wsave; K.hall.weeksOf = w0;
}
{
  const B = boot(), K = B.C, A = B.VB.CareerAllstar;
  const c0 = K.create({ mode: 'beach', name: 'Cambio', num: 4, role: 'atk', seed: 12, now: 1 }); K.acceptOffer(c0.offers.findIndex(x => !x.trial), 2);
  let c = K.load(); for (let i = 0; i < 30 && !(c.allstar && c.allstar.cur && c.allstar.cur.st === 'vote'); i++) { K.simulateNext(); c = K.load(); }
  ok(c.allstar.cur && c.allstar.cur.st === 'vote', 'votación abierta');
  A.hook(c, 'join', {}); ok(c.allstar.cur === null && c.allstar.skip === c.season, 'cambio de club en votación: descartada');
  K.save(c); for (let i = 0; i < 6; i++) K.simulateNext(); c = K.load();
  ok(!c.allstar.cur || c.allstar.cur.s !== c.season, 'y no vuelve a abrir esa temporada');
}

// ------------------------------------------------------------------ 6. calibrado
sec('6. Calibrado de la votación');
if (QUICK) console.log('  (quick: se salta)');
else for (const mode of ['beach', 'hall']) {
  // 1ª temporada, 24 semillas, todas las extensiones, juega 1 de cada 2, sin pedir el voto: te eligen en ~10-20 % (nunca la mayoría)
  const N1 = 24; let s1 = 0, ask = 0, noSel = 0, inv = 0;
  for (let seed = 1; seed <= N1; seed++) {
    const e = autoReal(boot({ all: true }), { mode, seed: seed * 7 + 1, seasons: 1 }).allstar.log[0];
    if (e && e.sel) s1++; else if (e) { noSel++; if (['srv', 'rcv', 'atk'].some(k => e.ct[k].how !== 'no')) inv++; }
  }
  for (let seed = 1; seed <= 12; seed++) { const e = autoReal(boot({ all: true }), { mode, seed: seed * 7 + 1, seasons: 1, camp: true }).allstar.log[0]; if (e && e.sel) ask++; }
  const r1 = s1 / N1;
  console.log('  ' + mode + ': 1ª temporada ' + s1 + ' de ' + N1 + '; pidiendo el voto ' + ask + ' de 12; invitado sin plaza ' + inv + ' de ' + noSel);
  ok(r1 >= 0.05 && r1 <= 0.25, mode + ': 1ª temporada elegido en ' + Math.round(100 * r1) + ' % de ' + N1 + ' semillas (entre 5 y 25 %)');
  ok(ask / 12 <= 0.6, mode + ': pidiendo el voto 3 veces, ' + Math.round(100 * ask / 12) + ' % (60 % como mucho: cuesta 3 de entrenador)');
  ok(ask / 12 >= r1 - 0.01, mode + ': pedir el voto ayuda');
  // invitación sin plaza: con mérito (playa: no la mayoría); en la pista, el novato no llega (el 8º de 30 va 10 o más por encima)
  const ri = noSel ? inv / noSel : 0;
  ok(mode === 'hall' ? ri <= 0.3 : ri >= 0.1 && ri <= 0.6, mode + ': invitado sin plaza en ' + Math.round(100 * ri) + ' % (' + inv + ' de ' + noSel + ')');
  // 6 temporadas (aceptando la mejor oferta cada verano)
  let tot = 0; const S = 6, SE = 6;
  for (let seed = 1; seed <= S; seed++) { const c = autoReal(boot({ all: true }), { mode, seed: seed * 7 + 1, seasons: SE }); tot += c.allstar.log.filter(e => e.sel).length; }
  const m = tot / S, lo = mode === 'hall' ? 0 : 1, hi = mode === 'hall' ? 5 : 4;
  ok(m >= lo && m <= hi, mode + ': elegido de media ' + m.toFixed(2) + ' de 6 temporadas (entre ' + lo + ' y ' + hi + ')');
  let all = 0;
  for (let seed = 1; seed <= 4; seed++) { const B = boot(), c = toEvent(B, mode, seed * 5 + 2, true); if (c && c.allstar.cur.sel.me) all++; }
  ok(all === 4, mode + ': con fama 50.000 y nota 8,2, elegido siempre (' + all + ' de 4)');
}
// reglas sueltas: técnicos, invitación, fama relativa y media lejos del corte (sin depender del calibrado)
for (const mode of ['beach', 'hall']) {
  const B = boot(), K = B.C, A = B.VB.CareerAllstar, T = A._t, hall = mode === 'hall';
  const c0 = hall ? K.create({ mode, name: 'Regla Uno', num: 3, pos: 'OH', seed: 101, now: 1 }) : K.create({ mode, name: 'Regla Uno', num: 3, role: 'atk', seed: 101, now: 1 });
  K.acceptOffer(c0.offers.findIndex(x => !x.trial), 2);
  for (let i = 0; i < 30; i++) { const c = K.load(); if (c.allstar && c.allstar.cur && c.allstar.cur.st === 'vote') break; K.simulateNext(); }
  const c = K.load(), cur = c.allstar.cur; ok(cur && cur.st === 'vote', mode + ': votación (reglas)');
  if (!cur) continue;
  const edge = T.cmpOvr(c) - T.K(c).playerOvr(c), cut = T.cutOvr(c, cur), st0 = JSON.parse(JSON.stringify(c.player.st));
  ok(hall ? edge > 0 : edge === 0, mode + ': media comparable (ventaja ' + edge + ')');
  // técnicos: sin fama, buenas notas jugadas y la media del corte → por los técnicos
  c.life.fame = 0; Object.keys(c.player.st).forEach(k => { c.player.st[k] = cut - edge; });
  const lo = T.VOTE.notaLo[hall ? 1 : 0] + T.VOTE.tecUp;
  c.notes = [0, 1, 2, 3].map(i => ({ nota: lo + 0.1, win: false, sim: false, kind: 'league', wk: i + 1 }));
  ok(T.gapOf(c, cur) === 0 && T.tecPick(c, cur, T.notaInfo(c)), mode + ': tecPick con nota ' + (lo + 0.1).toFixed(2) + ' y la media del corte');
  const sT = T.selOf(c, cur); ok(sT.me === 'tec' || (sT.me === 'vote' && sT.rank <= sT.cut), mode + ': elegido (' + sT.me + ', ' + sT.rank + 'º en votos)');
  c.notes.forEach(x => { x.nota = lo - 0.3; }); ok(!T.tecPick(c, cur, T.notaInfo(c)), mode + ': con peor nota, los técnicos no');
  c.notes.forEach(x => { x.nota = lo + 0.1; x.sim = true; }); ok(!T.tecPick(c, cur, T.notaInfo(c)), mode + ': con partidos simulados, los técnicos no');
  // media lejos del corte: el voto baja
  c.notes.forEach(x => { x.sim = false; }); const vNear = T.voteOf(c, cur);
  Object.keys(c.player.st).forEach(k => { c.player.st[k] = cut - edge - 16; }); const vFar = T.voteOf(c, cur);
  ok(vFar < vNear * 0.75, mode + ': a 16 de la media del corte, el voto baja (' + vNear + ' → ' + vFar + ')');
  // fama relativa a la liga: la misma fama pesa menos en una liga de más nivel
  ok(T.fameTop(c) === 20000 * [1, 2, 4, 8, 15][B.VB.CareerLife.lvlOf(c)] / 15, mode + ': fama de una figura de la liga ' + T.fameTop(c));
  // invitación: con un golpe del nivel de los mejores del pool, invitado a ese concurso (sin plaza)
  Object.assign(c.player.st, st0); c.life.fame = 0; c.notes = [];
  const sN = T.selOf(c, cur); ok(!sN.me, mode + ': sin fama ni notas, sin plaza');
  ok(T.invBest(c, cur).d > 0 === ['srv', 'rcv', 'atk'].some(k => sN.inv[k]), mode + ': invitado si y solo si llegas a la marca de corte');
  const top = Math.max(...cur.pool.map(x => x.st.serve)); c.player.st.serve = Math.min(99, top - edge + 30);
  const sI = T.selOf(c, cur); ok(!sI.me && sI.inv.srv && !sI.inv.rcv && !sI.inv.atk, mode + ': saque por encima del mejor del pool → invitado al de saques');
  c.player.st.serve = st0.serve;
}

// ------------------------------------------------------------------ 7. concursos
sec('7. Concursos');
{
  const B = boot(), CT = B.VB.Contest, K = B.C;
  ['srv', 'rcv', 'atk'].forEach(k => { const r = K.beach._rng(K.beach._hash(1, 'x', k)); let s = 0; for (let i = 0; i < 3000; i++) s += CT.rivalScore(k, 60, r); const m = s / 3000; ok(Math.abs(m - CT.CONTESTS[k].base) <= 1, k + ': media con 60 = ' + m.toFixed(2) + ' (base ' + CT.CONTESTS[k].base + ')'); });
  const t = CT.rank(20, [{ nm: 'A', s: 20 }, { nm: 'B', s: 25 }]); ok(t[0].nm === 'B' && t[1].me === 1, 'empate a favor tuyo'); ok(CT.placeOf(t) === 2, 'puesto');
  ok(CT.prize(1, 0).fame === 80 && CT.prize(1, 0).money === 300 && CT.prize(4, 2).fame === 0, 'premios por puesto');
}
{
  const B = boot(), K = B.C, A = B.VB.CareerAllstar, granted = [];
  B.VB.Look = { owned: () => false, grant: (id) => { granted.push(id); return true; }, name: id => 'N-' + id };
  const c = toEvent(B, 'beach', 21, true); ok(!!c, 'carrera en el fin de semana');
  if (c) {
    const cur = c.allstar.cur, riv0 = JSON.stringify(cur.srv.riv);
    ok(cur.sel.me && cur.sel.inv.srv && cur.sel.inv.rcv && cur.sel.inv.atk, 'elegido: invitado a los 3');
    ok(cur.srv.riv.length === 5 && cur.srv.riv.every(x => x.nm && x.s >= 0), '5 rivales con marca');
    const s1 = A.drillSetup('srv'); ok(s1 && s1.id === 'serve' && s1.n === 1 && s1.max === 2 && s1.attrs[0].length === 2, 'drillSetup: ejercicio serve, intento 1 de 2');
    ok(JSON.stringify(K.load().allstar.cur.srv.riv) === riv0, 'marcas fijas tras drillSetup');
    const top = Math.max(...cur.srv.riv.map(x => x.s)), money0 = K.load().money, fame0 = K.load().life.fame;
    // intento 1: 3r (por debajo de dos rivales)
    const sorted = cur.srv.riv.map(x => x.s).sort((a, b) => b - a), low = Math.max(0, sorted[2] - 0);
    const r1 = A.drillDone('srv', low, [], { careerExtDrill: { mode: 'beach' } });
    ok(r1 && r1.rank >= 2 && r1.again && r1.again.label === '2º intento' && r1.list.length === 6, 'intento 1: puesto ' + r1.rank + ', queda el 2º');
    const paid1 = K.load().money - money0;
    const r1b = A.drillDone('srv', 30, [], { careerExtDrill: { mode: 'beach' } });
    ok(K.load().money - money0 === paid1 && !r1b.list, 'llamar a drillDone otra vez no paga ni cuenta');
    A.drillSetup('srv');
    const r2 = A.drillDone('srv', top, [], { careerExtDrill: { mode: 'beach' } });
    ok(r2.rank === 1 && !r2.again, 'intento 2 con empate a la mejor marca: 1r');
    const z = B.VB.Contest.prize(1, B.VB.CareerLife.lvlOf(K.load()));
    ok(K.load().money - money0 === z.money, 'el 2º intento paga solo la diferencia (' + (K.load().money - money0) + ' = ' + z.money + ')');
    ok(granted.indexOf('bandana') >= 0 && r2.prize.look, 'prenda la primera vez que ganas (Pañuelo)');
    ok(K.load().life.fame > fame0, 'seguidores');
    ok(A.drillSetup('srv') === null, 'sin 3r intento');
    // forfeit
    const s3 = A.drillSetup('rcv'); ok(!!s3, 'recepción: intento 1');
    ok(A.drillQuit('rcv', 'restart', { careerExtDrill: { mode: 'beach' } }) === true, 'reiniciar: cuenta 0 y queda otro');
    const cr = K.load().allstar.cur.rcv; ok(cr.n === 1 && cr.best === 0 && !cr.at, 'el intento abandonado cuenta');
    A.drillSetup('rcv'); ok(A.drillQuit('rcv', 'restart', { careerExtDrill: { mode: 'beach' } }) === false, 'sin intentos: no deja repetir');
    ok(K.load().allstar.cur.rcv.st === 'gone' && A.drillSetup('rcv') === null, 'recepción abandonada del todo');
    // simular no da prenda
    const g0 = granted.length; const c2 = K.load(); A.simPart(c2, 'atk'); K.save(c2);
    ok(c2.allstar.cur.atk.st === 'sim' && !c2.allstar.cur.atk.look && granted.length === g0, 'simular: sin prenda');
    ok(r2.next === null || r2.next.arg !== 'srv', 'siguiente concurso pendiente');
  }
}

// ------------------------------------------------------------------ 8. montaje del partido
sec('8. Montaje del partido');
for (const mode of ['beach', 'hall']) {
  const B = boot(), K = B.C, A = B.VB.CareerAllstar, c = toEvent(B, mode, 31, true);
  ok(!!c, mode + ': fin de semana');
  if (!c) continue;
  const m = A.setup('m', false), n = mode === 'hall' ? 6 : 2;
  ok(m && m.attrs.length === 2 && m.attrs[0].length === n && m.attrs[1].length === n, mode + ': attrs de ' + n);
  ok(m.career.allstar && m.career.ext === 'allstar' && m.sets === 1 && m.points === 21 && m.career.noAmb, mode + ': career.allstar, set a 21, sin ambiente');
  ok(m.attrs[0][m.ctrlIdx] && JSON.stringify(m.attrs[0][m.ctrlIdx]) === JSON.stringify(K.load().player.st), mode + ': tú en ctrlIdx');
  ok(m.nums.every(t => new Set(t).size === t.length && t.every(x => x !== 13 || mode === 'beach')), mode + ': dorsales únicos por equipo');
  ok(m.kit.kitShirt !== m.rivalKit.kitShirt, mode + ': equipaciones distintas');
  if (mode === 'hall') { const R = K.hall.simRoles(); ok(R[m.ctrlIdx] === m.ctrlRole && m.format === '6v6' && m.meSlot === m.ctrlIdx, 'pista: tu hueco es tu puesto'); ok(m.names[0].length === 6, 'pista: nombres'); }
  const m2 = A.setup('m', false); ok(m2 && JSON.stringify(m2.attrs) === JSON.stringify(m.attrs), mode + ': reentrante (Reiniciar)');
  ok(A.setup('m', true) === null, mode + ': elegido y sano no «mira»');
  ok(K.load().allstar.cur.m.st === 'live', mode + ': partido en marcha');
}

// ------------------------------------------------------------------ 9. cierre del partido
sec('9. Cierre del partido');
for (const mode of ['beach', 'hall']) {
  const B = boot(), K = B.C, A = B.VB.CareerAllstar, R = B.VB.Rating, c = toEvent(B, mode, 41, true);
  if (!c) { ok(false, mode + ': fin de semana'); continue; }
  const m = A.setup('m', false), fat0 = K.load().fatigue | 0, fame0 = K.load().life.fame, money0 = K.load().money;
  const g = { career: m.career, size: mode === 'hall' ? 6 : 4, teams: [[{}, {}], [{}, {}]], demo: false, points: 21, ctrlRole: m.ctrlRole };
  K.ingest([{ type: 'newMatch' }], g);
  const close0 = R.close; R.close = () => ({ nota: 8.2, best: [], worst: [] });
  const res = A.done({ sets: [1, 0], setScores: [[21, 17]], win: true }, g); R.close = close0;
  const cur = K.load().allstar.cur;
  ok(res && res.html && res.title && /Gana/.test(res.title), mode + ': hoja propia');
  ok(cur.m.st === 'play' && cur.m.nota === 8.2 && cur.m.mvpMe, mode + ': nota 8,2 y gana: MVP tú');
  ok(cur.m.w === cur.sel.mine && cur.m.sc[cur.sel.mine] === 21, mode + ': marcador desde tu equipo');
  ok((K.load().fatigue | 0) === Math.min(100, fat0 + 4), mode + ': fatiga +4');
  const lv = B.VB.CareerLife.lvlOf(K.load()), F = A._t.FAME, mult = [1, 2, 4, 8, 15][lv];
  ok(K.load().money - money0 === Math.round(0.25 * [600, 1500, 4000, 9000, 20000][lv] / 10) * 10, mode + ': dinero del MVP');
  ok(Math.round(K.load().life.fame - fame0) >= (F.win + F.mvp) * mult, mode + ': seguidores de ganar y MVP');
  const money1 = K.load().money; A.done({ sets: [1, 0], setScores: [[21, 3]], win: true }, g);
  ok(K.load().money === money1, mode + ': cerrar otra vez no paga');
}
{
  const B = boot(), K = B.C, A = B.VB.CareerAllstar, c = toEvent(B, 'beach', 43, true);
  A.setup('m', false); const fame0 = K.load().life.fame;
  A.quit({ mode: 'beach' }, 'quit', null);
  const m = K.load().allstar.cur.m; ok(m.st === 'gone' && !m.me && m.w >= 0 && !m.mvpMe && m.nota == null, 'salir a medias: se simula sin ti');
  ok(K.load().life.fame === fame0, 'sin premio al salir');
}
{
  const B = boot(), K = B.C, A = B.VB.CareerAllstar;
  let c = null; for (let s = 50; s < 70 && !c; s++) { const B2 = boot(); const cc = toEvent(B2, 'beach', s, false); if (cc && !cc.allstar.cur.sel.me) { c = cc; Object.assign(B, B2); } }
  ok(!!c, 'carrera no elegida');
  if (c) {
    const A2 = B.VB.CareerAllstar, K2 = B.C;
    ok(A2.setup('m', false) === null, 'no elegido: no juega');
    const m = A2.setup('m', true); ok(m && m.career.meOn === false && m.attrs[0].length === 2, 'no elegido: puede mirar');
    const g = { career: m.career, autopilot: true, demo: false };
    const r = A2.done({ sets: [0, 1], setScores: [[15, 21]], win: false }, g);
    const mm = K2.load().allstar.cur.m; ok(mm.st === 'watch' && mm.nota == null && !mm.me && mm.mvp, 'mirar: resultado oficial, MVP por media');
    ok(r && /sin nota/.test(r.html), 'hoja: exhibición sin nota');
  }
}

// ------------------------------------------------------------------ 10. expiración
sec('10. Expiración');
for (const mode of ['beach', 'hall']) {
  const B = boot(), K = B.C, A = B.VB.CareerAllstar, c0 = toEvent(B, mode, 51, true);
  if (!c0) { ok(false, mode + ': fin de semana'); continue; }
  A.drillSetup('srv'); A.setup('m', false);
  const n = K.next(K.load()); if (n && n.bench) K.benchNext(); else K.simulateNext();
  const c = K.load(), cur = c.allstar.cur, e = c.allstar.log[c.allstar.log.length - 1];
  ok(cur.st === 'done', mode + ': cerrado al pasar de jornada');
  ok(cur.srv.st === 'gone' && cur.srv.best === 0 && e.ct.srv.rank === 6, mode + ': concurso empezado y no acabado = abandonado, último');
  ok(cur.m.st === 'gone' && !cur.m.me && cur.m.w >= 0, mode + ': partido a medias simulado sin ti');
  ok(cur.rcv.st === 'sim' && cur.atk.st === 'sim' && e.ct.rcv.rank >= 1, mode + ': lo pendiente se simula');
  ok(e && e.s === c.season && e.sel && e.m.how === 'gone' && e.ct.atk.how === 'sim', mode + ': log completo');
  ok(c.inbox.some(m => m.k === 'allstar' && m.t === 'Fin de semana de las Estrellas'), mode + ': mensaje de cierre');
}

// ------------------------------------------------------------------ 11. textos
sec('11. Textos');
for (const mode of ['beach', 'hall']) {
  const B = boot(), K = B.C, A = B.VB.CareerAllstar, out = [];
  // votación
  const c0 = mode === 'hall' ? K.create({ mode: 'hall', name: 'Texto Uno', num: 3, pos: 'OH', seed: 61, now: 1 }) : K.create({ mode: 'beach', name: 'Texto Uno', num: 3, role: 'atk', seed: 61, now: 1 });
  K.acceptOffer(c0.offers.findIndex(x => !x.trial), 2);
  for (let i = 0; i < 30; i++) { const c = K.load(); if (c.allstar && c.allstar.cur && c.allstar.cur.st === 'vote') break; K.simulateNext(); }
  out.push(['voto', A.cardHTML(K.load(), HLP)]);
  A.camp(K.load()); out.push(['voto pedido', A.cardHTML(K.load(), HLP)]);
  ok(/Ya lo has pedido/.test(out[1][1]), mode + ': petición hecha esta jornada');
  for (let i = 0; i < 30; i++) { const c = K.load(); if (c.allstar.cur && c.allstar.cur.st === 'event') break; K.simulateNext(); }
  out.push(['finde', A.cardHTML(K.load(), HLP)]);
  const c = K.load(); A.simPart(c, 'srv'); A.simPart(c, 'm'); K.save(c);
  A.act('as-more-rcv'); out.push(['finde 2', A.cardHTML(K.load(), HLP)]); A.act('as-more-rcv');
  A.act('as-sim-all'); out.push(['finde fin', A.cardHTML(K.load(), HLP)]);
  K.simulateNext(); out.push(['resumen', A.cardHTML(K.load(), HLP)]);
  ok(/Ver en Palmarés/.test(out[out.length - 1][1]), mode + ': resumen una jornada');
  out.push(['vitrina', A.honorsHTML(K.load(), HLP)]);
  ok(/Estrellas y concursos/.test(out[out.length - 1][1]) && /No son títulos oficiales/.test(out[out.length - 1][1]), mode + ': tarjeta de Palmarés');
  const C2 = toEvent(boot(), mode, 71, true);
  out.push(['hoja partido', A._endDemo('match').html], ['hoja concurso', A._drillDemo('srv').res.html]);
  K.load().inbox.filter(m => m.k === 'allstar').forEach(m => out.push(['msg', m.t + ' ' + m.x]));
  out.forEach(([k, s]) => { const b = badText(s); ok(!b, mode + ' ' + k + ': texto limpio' + (b ? ' (' + b + ') ' + s.slice(0, 300) : '')); });
  ok(out.every(([k, s]) => k === 'resumen' || k === 'vitrina' || k.startsWith('hoja') || k === 'msg' || s.length > 0), mode + ': tarjetas con contenido');
  ok(K.load().inbox.some(m => m.k === 'allstar' && /Votación de las Estrellas/.test(m.t)), mode + ': mensaje de apertura');
}
{
  const B = boot(), A = B.VB.CareerAllstar, K = B.C, c = toEvent(B, 'beach', 81, true);
  const msgs = K.load().inbox.filter(m => m.k === 'allstar').map(m => m.t + ': ' + m.x).join('\n');
  ok(/(¡Eres Estrella!|Te eligen los técnicos)/.test(msgs), 'mensaje de elegido'); ok(!badText(msgs), 'mensajes limpios');
}

// ------------------------------------------------------------------ 12. interfaz
sec('12. Interfaz');
{
  const B = boot(), K = B.C, A = B.VB.CareerAllstar, c = toEvent(B, 'hall', 91, true);
  const h = A.cardHTML(K.load(), HLP), acts = [...h.matchAll(/data-act="([^"]+)"/g)].map(m => m[1]);
  ok(acts.length >= 5 && acts.every(a => a.indexOf('as-') === 0), 'botones as-… (' + acts.join(' ') + ')');
  ok(A.dot(K.load(), 'match') === true && A.dot(K.load(), 'club') === false, 'punto de aviso en Partido');
  const r1 = A.act('as-play-m'), r2 = A.act('as-play-srv'), r3 = A.act('as-watch');
  ok(r1 && r1.play && r1.play.id === 'allstar' && r1.play.arg === 'm' && !r1.play.auto, 'as-play-m → partido');
  ok(r2 && r2.drill && r2.drill.arg === 'srv', 'as-play-srv → concurso'); ok(r3 === false, 'as-watch elegido: no');
  ok(A.act('as-goto-titles').tab === 'honors', 'ir a Palmarés');
  const css = A.css(); const sizes = [...css.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)].map(m => +m[1]);
  ok(sizes.length > 10 && sizes.every(v => v >= 12), 'CSS: letra ≥ 12 px (' + Math.min(...sizes) + ')');
  ok(/as-acts>\.sp-btn[^{]*\{[^}]*min-height:44px/.test(css), 'botones de fila ≥ 44 px');
  ok(/:root\.ph:not\(#_\):not\(#_\):not\(#_\)/.test(css) && /--ph-/.test(css), 'reglas del móvil con el prefijo y tokens');
  // pedir el voto
  const B2 = boot(), K2 = B2.C, A2 = B2.VB.CareerAllstar;
  const c0 = K2.create({ mode: 'beach', name: 'Voto', num: 3, role: 'atk', seed: 95, now: 1 }); K2.acceptOffer(c0.offers.findIndex(x => !x.trial), 2);
  for (let i = 0; i < 30; i++) { const cc = K2.load(); if (cc.allstar && cc.allstar.cur && cc.allstar.cur.st === 'vote') break; K2.simulateNext(); }
  const v0 = A2.state(K2.load()).vote, coach0 = K2.load().coach;
  const ra = A2.act('as-camp'); const v1 = A2.state(K2.load()).vote;
  ok(ra && ra.render && v1.camp === 1 && v1.V > v0.V && K2.load().coach === coach0 - 1, 'pedir el voto: +5 % y entrenador −1');
  ok(A2.act('as-camp') === false, 'una vez por jornada');
  K2.simulateNext(); ok(A2.act('as-camp') && A2.state(K2.load()).vote.camp === 2, 'la jornada siguiente, otra vez');
}

// ------------------------------------------------------------------ 13. contest.js solo
sec('13. contest.js se carga solo');
{
  const cx = { Math, JSON }; cx.globalThis = cx; vm.createContext(cx);
  let err = ''; try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/contest.js'), 'utf8'), cx); } catch (e) { err = e.message; }
  ok(!err && cx.VB && cx.VB.Contest && cx.VB.Contest.ORDER.length === 3 && typeof cx.document === 'undefined', 'sin document' + (err ? ': ' + err : ''));
  const cx2 = { Math, JSON, console }; cx2.globalThis = cx2; vm.createContext(cx2);
  let err2 = ''; try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/career-allstar.js'), 'utf8'), cx2); } catch (e) { err2 = e.message; }
  ok(!err2 && cx2.VB.CareerAllstar && cx2.VB.CareerAllstar.state({ player: {} }) === null, 'career-allstar.js se carga sin Carrera ni DOM' + (err2 ? ': ' + err2 : ''));
}

console.log('\n' + oks + ' comprobaciones, ' + fails + ' fallos');
if (fails) { console.log('HAY FALLOS'); process.exit(1); }
console.log('TODO OK');
