#!/usr/bin/env node
/* TAKE THE COURT — tools/natltest.js (owner: carrera)
 * Prueba de la selección nacional de la Carrera (js/career-natl.js, VB.CareerNatl) en node puro (vm, sin DOM):
 *   1. Contrato: con VB.CareerNatl.OFF = true, 6 temporadas (playa y pista, 3 semillas) dan la misma carrera que sin el fichero.
 *   2. Determinismo: misma semilla → mismo c.natl, mismos trofeos y misma fama (dos veces).
 *   3. Ni Math.random ni Date.now en el código de career-natl.js.
 *   4. Guardado viejo sin c.natl: carga y ensure lo repara; c.natl roto, ventana rota, confianza 500 y estado desconocido: saneados.
 *   5. Medición (10 semillas × 10 temporadas, Normal): temporada de la 1ª convocatoria con España, Filipinas e Italia en la pista y
 *      España en la playa (jugando, sesiones rápidas, puntos en lo más barato y la mejor oferta). Avisa si se sale de lo previsto.
 *   6. Estructura con 16, 8 y 4 selecciones: 3 partidos de grupo por equipo, cuadro coherente, un oro, una plata y un bronce,
 *      ≤ 6 partidos tuyos, y ninguna ventana abierta tras la temporada nueva.
 *   7. Partido jugado: setup (6v6 / 2v2, nombres y dorsales, career.ext 'natl', etiqueta sin «·»), done con un resultado falso
 *      (marca el partido, suma XP, no cuenta en player.matches) y un 2º done del mismo partido da null.
 *   8. Ventana de clasificación (pista): se abre, se simula en la jornada siguiente y su resultado entra en el torneo del verano.
 *   9. Temporada nueva con el verano a medias: se simula entero y los trofeos llevan la temporada anterior y una clave de dificultad.
 *  10. Legado y Vitrina: legacyOf, legacyExtra, caseSlots y el grupo «Selección» de trophyCase.
 *  11. Textos: mensajes, Club › Selección, tarjeta de Partido y Palmarés con 20 semillas en los estados sum, q y done: sin «{»,
 *      «undefined», «NaN», «1.er» ni «·»; botones con data-act 'nt-'.
 *  12. Con «Carrera con vida»: la plantilla 'nt-press' se publica y se contesta con S.answer sin error; avisos de Partido.
 *  13. Correcciones de la revisión: billete de la repesca por la tabla, cuartos por la confianza, bono de la sub-19, lesión en verano
 *      y tras la clasificación, papel con «Sin billete» y textos de la hoja final (título, botón y copa).
 * Uso: node tools/natltest.js   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./storyhelp.js');
const ROOT = H.ROOT, FILE = 'js/career-natl.js';
let fails = 0, passes = 0;
const VERBOSE = !!process.env.VERBOSE;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; if (VERBOSE) console.log('  ok: ' + msg); } }
function warn(msg) { console.log('  AVISO: ' + msg); }
function section(t) { console.log('\n== ' + t); }
const BAD = /\{|\}|undefined|NaN|1\.er|\.er\b|·/;
const txt = (h) => String(h).replace(/<[^>]*>/g, ' ');
const quiet = (fn) => { const e0 = console.error; console.error = () => { }; try { return fn(); } finally { console.error = e0; } };

// ------------------------------------------------------------------ gancho común
{
  const src = fs.readFileSync(path.join(ROOT, 'js/career.js'), 'utf8');
  if (!/concat\(exts\(\)|VB\.CareerExt/.test(src)) { console.log('Falta el gancho VB.CareerExt en career.js life()'); process.exit(1); }
}
// (boot de storyhelp; si un fichero común no carga en vm sin `process` —p. ej. un sim.js a medias de otro lote—, lo repite con un
// `process` mínimo y lo avisa una vez: la prueba de la selección no depende de eso)
let bootNote = false;
function boot0(o) {
  try { return H.boot(o); } catch (e) {
    if (!/process is not defined/.test(String(e && e.message))) throw e;
    if (!bootNote) { bootNote = true; console.log('  (AVISO: un fichero común necesita `process` en vm; se carga con uno mínimo)'); }
    const vm = require('vm'), mem = {};
    const LS = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    const cx = { console, Math, Date, JSON, Set, localStorage: LS, process: { env: {} } }; cx.globalThis = cx; cx.window = cx; vm.createContext(cx);
    const files = (o.files || H.BASE.concat(o.story === false ? [] : H.STORY)).concat(o.extra || []);
    for (const f of files) { const fp = path.isAbsolute(f) ? f : path.join(ROOT, f); if (fs.existsSync(fp)) vm.runInContext(fs.readFileSync(fp, 'utf8'), cx, { filename: f }); }
    return { VB: cx.VB, C: cx.VB.Career, S: cx.VB.CareerStory || null, mem, cx };
  }
}
const bootN = (o) => boot0(Object.assign({ extra: [FILE] }, o || {}));
const N = (B) => B.VB.CareerNatl;
const HLP = { esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]),
  sp: (a) => a.filter((x) => x !== '' && x != null).join(' | '), kitSw: () => '<i class="cr-kit"></i>', q: (t) => '<button class="sp-q" data-q-title="' + t + '">?</button>', ph: () => false };
const HLPph = Object.assign({}, HLP, { ph: () => true });

// Partido «jugado» con estadísticas de un jugador medio (como storyhelp.playOne, más modestas): con 1 de cada 3 jugado y el resto
// simulado, la media sube como la curva medida de notes/carrera.md §Progresión (pista 49 → 53 → 57 → 60 → 62 → 64 → 66 → 68).
const STATS = { kills: 6, aces: 1, blocks: 1, digs: 6, assists: 2, errors: 3 };
function playOne(B, hall, win) {
  const K = B.C, c = K.load(), n = K.next(c);
  if (n && n.bench) return K.benchNext();
  const ms = K.matchSetup(c); if (!ms) return K.simulateNext();
  const sc = hall ? (win ? [[15, 10], [15, 12]] : [[10, 15], [12, 15]]) : (win ? [[21, 17], [18, 21], [15, 12]] : [[17, 21], [19, 21]]);
  const sets = hall ? (win ? [2, 0] : [0, 2]) : (win ? [2, 1] : [0, 2]), all = sc.reduce((s, x) => s + x[0] + x[1], 0);
  let g;
  if (hall) { const t0 = [0, 1, 2, 3, 4, 5].map((i) => ({ team: 0, id: i, num: ms.nums ? ms.nums[0][i] : i + 1 })); g = { career: ms.career, size: 6, teams: [t0, [0, 1, 2, 3, 4, 5].map((i) => ({ team: 1, id: 16 + i }))], ctrl: t0[ms.ctrlIdx | 0], meR: all, rallyN: all, demo: false }; }
  else g = { career: ms.career, teams: [[{}, {}], [{}, {}]], demo: false };
  return K.matchDone({ sets, setScores: sc, win }, Object.assign({}, STATS), g);
}
/** Juega la temporada: 1 de cada 3 partidos jugado (el resto simulado), 3 sesiones rápidas por jornada y puntos en lo más barato. */
function playSeason(B, hall, seed, s) {
  const K = B.C; let g = 0;
  while (K.load().phase !== 'off' && g++ < 90) {
    const c = K.load();
    try { if (K.trainSimDay) K.trainSimDay(); } catch (e) { }
    const n = K.next(c);
    if (n && n.bench) { K.benchNext(); continue; }
    const win = ((seed * 7 + s * 13 + g * 5) % 10) < 7;
    const r = g % 3 === 0 ? playOne(B, hall, win) : K.simulateNext(); if (!r) { if (!K.simulateNext()) break; }
    const Lf = B.VB.CareerLife; if (Lf) { const ev = Lf.pendingEvent(K.load()); if (ev) Lf.answer(0); }
    spend(K);
  }
  spend(K);
}
function spend(K) {
  const c = K.load(), KEYS = ['jump', 'speed', 'react', 'recv', 'dig', 'set', 'spike', 'ctl', 'block', 'serve'];
  let any = true, g = 0;
  while (any && g++ < 400) { any = false; const ks = KEYS.slice().sort((a, b) => c.player.st[a] - c.player.st[b]); for (const k of ks) if (K.bump(k)) { any = true; break; } }
}
function bestOffer(K) {
  const c = K.load(); if (!c.offers || !c.offers.length) { K.stay(1); return; }
  let bi = -1, bo = -1; c.offers.forEach((o, i) => { if (!o.trial && o.ovr > bo) { bo = o.ovr; bi = i; } });
  if (bi < 0) K.stay(1); else K.acceptOffer(bi, 2);
}
function newCareer(B, mode, seed, cc) {
  const K = B.C;
  const c = mode === 'hall' ? K.create({ mode: 'hall', name: 'Selección', num: 9, pos: 'OH', seed, country: cc || 'ES', now: 1 })
    : K.create({ mode: 'beach', name: 'Arena', num: 7, role: 'atk', seed, now: 1 });
  K.acceptOffer(c.offers.findIndex((x) => !x.trial), 2);
  return K.load();
}

// ------------------------------------------------------------------ 1. contrato
section('1. Contrato: OFF = la carrera de siempre');
{
  for (const mode of ['beach', 'hall']) for (const seed of [11, 202, 3003]) {
    const A = boot0({}), Bn = bootN(); N(Bn).OFF = true;
    const ca = H.autopilot(A, { mode, seasons: 6, seed }), cb = H.autopilot(Bn, { mode, seasons: 6, seed });
    const s = (c) => { const x = JSON.parse(JSON.stringify(c)); delete x.natl; return JSON.stringify(x); };
    ok(s(ca) === s(cb) && !cb.natl, mode + ' semilla ' + seed + ': idéntica con OFF');
  }
}

// ------------------------------------------------------------------ 2. determinismo
section('2. Determinismo');
{
  for (const mode of ['beach', 'hall']) {
    const run = () => { const Bn = bootN(); const c = H.autopilot(Bn, { mode, seasons: 7, seed: 4242 }); return JSON.stringify([c.natl, c.trophies, c.life && c.life.fame, c.player.lvl]); };
    const a = run(), b = run();
    ok(a === b, mode + ': misma semilla, mismo resultado');
    const Bn = bootN(), c = H.autopilot(Bn, { mode, seasons: 7, seed: 4242 });
    ok(c.natl && c.natl.hist.length >= 6 && c.natl.win === null, mode + ': un torneo por verano y ninguna ventana abierta (' + (c.natl && c.natl.hist.length) + ' torneos)');
  }
}

// ------------------------------------------------------------------ 3. sin azar del sistema
section('3. Ni Math.random ni Date.now');
{
  const src = fs.readFileSync(path.join(ROOT, FILE), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
  ok(!/Math\.random/.test(src) && !/Date\.now/.test(src), 'el código no usa Math.random ni Date.now');
}

// ------------------------------------------------------------------ 4. guardados viejos y rotos
section('4. Guardados viejos y rotos');
{
  for (const mode of ['beach', 'hall']) {
    const Bn = bootN(), X = N(Bn), K = Bn.C;
    const c = H.autopilot(Bn, { mode, seasons: 1, seed: 77 });
    const key = mode === 'hall' ? 'make-the-cut.career6' : 'make-the-cut.career';
    const raw = JSON.parse(Bn.mem[key]); delete raw.natl; Bn.mem[key] = JSON.stringify(raw); K._reset();
    const c2 = K.get();
    ok(c2 && !c2.natl, mode + ': carga un guardado sin c.natl');
    const n = X.ensure(c2);
    ok(n && n.v === 1 && n.st === 'out' && n.trust === 50 && n.win === null && Array.isArray(n.hist) && n.car.caps === 0, mode + ': ensure crea el estado por defecto');
    const j1 = JSON.stringify(c2.natl); X.ensure(c2); ok(JSON.stringify(c2.natl) === j1, mode + ': ensure es idempotente');
    c2.natl = 'x'; X.ensure(c2); ok(c2.natl && typeof c2.natl === 'object' && c2.natl.v === 1, mode + ': c.natl = «x» se rehace');
    c2.natl.trust = 500; c2.natl.chem = -9; c2.natl.st = 'zz'; c2.natl.cc = 'XX'; c2.natl.rk = { ZZ: 3, ES: 'a', IT: 12 }; c2.natl.hist = [null, { s: 2 }, 'q'];
    c2.natl.win = { kind: 'sum', ev: 'wc', id: 1, s: 1, teams: ['ES', 'IT'], my: 'ES', groups: [['ES', 'IT']], fx: 'roto', stage: 'g1' };
    let thrown = false; try { X.ensure(c2); } catch (e) { thrown = true; }
    const m = c2.natl;
    ok(!thrown && m.trust === 100 && m.chem === 0 && m.st === 'out' && m.win === null && m.rk.IT === 12 && !('ZZ' in m.rk) && !('ES' in m.rk) && m.hist.length === 1,
      mode + ': confianza 500, química −9, estado «zz», ranking y ventana rotos: saneados sin excepción');
    ok(m.cc === (mode === 'hall' ? c2.cc : 'ES'), mode + ': país desconocido → ' + m.cc);
    // ventana con un partido roto
    X._debugSeed(c2, 'sum'); const w = c2.natl.win; w.fx[2].r = 'zz'; X.ensure(c2); ok(c2.natl.win === null, mode + ': ventana con una ronda desconocida → null');
    // la carrera sigue tras la reparación
    let err = null; try { K.save(c2); K._reset(); const c3 = K.get(); X.ensure(c3); H.autopilot; } catch (e) { err = e; }
    ok(!err, mode + ': guarda y vuelve a cargar tras sanear');
  }
}

// ------------------------------------------------------------------ 5. medición
section('5. Medición: temporada de la 1ª convocatoria (Normal)');
{
  const SEEDS = +process.env.NATL_SEEDS || 10, SEAS = 10;
  const cases = [['hall', 'ES', [4, 6]], ['hall', 'PH', [1, 2]], ['hall', 'IT', [8, 99]], ['beach', 'ES', [4, 6]]];
  for (const [mode, cc, rg] of cases) {
    const firsts = [], ovrs = [];
    for (let i = 0; i < SEEDS; i++) {
      const Bn = bootN(), K = Bn.C, seed = 900 + i * 37;
      let c = newCareer(Bn, mode, seed, cc);
      if (mode === 'beach') { c.natl = null; N(Bn).ensure(c).cc = cc; K.save(c); }
      let first = 99;
      for (let s = 1; s <= SEAS; s++) {
        playSeason(Bn, mode === 'hall', seed, s);
        c = K.load();
        if (first === 99 && ['tit', 'conv', 'p1', 'p2'].indexOf(c.natl.st) >= 0 && c.natl.stS === s) first = s;
        if (i === 0) ovrs.push(N(Bn)._K(c).playerOvr(c) + '/' + N(Bn).scoreOf(c) + '/' + N(Bn).Sof(c, c.natl.cc, N(Bn).cycOf(c, s)));
        bestOffer(K);
      }
      firsts.push(first);
    }
    firsts.sort((a, b) => a - b);
    const med = firsts[Math.floor(firsts.length / 2)];
    console.log('  ' + mode + ' ' + cc + ': 1ª convocatoria en ' + firsts.map((x) => x === 99 ? '—' : 'T' + x).join(' ') + ' | mediana ' + (med === 99 ? 'nunca' : 'T' + med) + ' (previsto T' + rg[0] + (rg[1] >= 99 ? ' o más' : '-' + rg[1]) + ')');
    if (VERBOSE) console.log('    media/nota/fuerza (semilla 1): ' + ovrs.join(' '));
    const inR = med >= rg[0] && med <= rg[1], near = med >= rg[0] - 1 && med <= rg[1] + 1;
    if (!inR && near) warn(mode + ' ' + cc + ' fuera de lo previsto por 1 temporada');
    ok(near, mode + ' ' + cc + ': mediana dentro de lo previsto (±1)');
  }
}

// ------------------------------------------------------------------ 6. estructura del torneo
section('6. Estructura con 16, 8 y 4 selecciones');
{
  const Bn = bootN(), X = N(Bn), K = Bn.C;
  let c = H.autopilot(Bn, { mode: 'beach', seasons: 1, seed: 515 });
  const seen = {};
  for (const [cc, want] of [['ES', 'wc'], ['ES', 'games'], ['EG', 'cont'], ['BR', 'cont'], ['ES', 'vbn'], ['JP', 'cont']]) {
    c.natl.cc = cc; c.natl.lock = 0;
    let s = 1; while (X.evOf(c, s) !== want) s++;
    const w = X._openSum(c, s, 'p1');
    if (w.nq) { ok(true, cc + ' ' + want + ': sin billete (se salta)'); c.natl.win = null; continue; }
    const T = w.teams.length; seen[T] = 1;
    ok(new Set(w.teams).size === T && T === w.T, cc + ' ' + w.name + ': ' + T + ' selecciones distintas');
    ok(w.groups.length === T / 4 && w.groups.every((g) => g.length === 4), cc + ': grupos de 4 (' + w.groups.length + ')');
    ok(w.teams.indexOf(w.host) >= 0 && w.groups[0][0] === w.host, cc + ': el anfitrión juega y va en el grupo A');
    X._advance(c, w, true);
    ok(w.stage === 'done', cc + ': torneo cerrado');
    const gc = {}; w.fx.filter((f) => /^g/.test(f.r)).forEach((f) => { gc[f.a] = (gc[f.a] || 0) + 1; gc[f.b] = (gc[f.b] || 0) + 1; });
    ok(w.teams.every((x) => gc[x] === 3), cc + ': cada selección juega 3 partidos de grupo');
    const pl = X.placesOf(c, w);
    ok(pl.length === T && new Set(pl).size === T, cc + ': puestos del 1 al ' + T + ' sin repetir');
    const F = w.fx.filter((f) => f.r === 'f'), Bz = w.fx.filter((f) => f.r === 'b');
    ok(F.length === 1 && Bz.length === 1 && F[0].res && Bz[0].res, cc + ': una final y un partido por el bronce');
    const ko = { 16: ['qf', 4], 8: ['sf', 2], 4: ['f', 1] }[T];
    ok(w.fx.filter((f) => f.r === ko[0]).length === ko[1], cc + ': ' + ko[1] + ' cruces de ' + ko[0]);
    const mine = w.fx.filter((f) => f.a === w.my || f.b === w.my);
    ok(mine.length <= 6 && mine.length >= 3, cc + ': partidos de tu selección ' + mine.length + ' (≤ 6)');
    ok(w.fx.every((f) => f.res && f.res.s[0] !== f.res.s[1] && Math.max(f.res.s[0], f.res.s[1]) === 2), cc + ': todos los partidos al mejor de 3');
    c.natl.win = null;
  }
  ok(seen[16] && seen[8] && seen[4], 'se han visto torneos de 16, 8 y 4 (' + Object.keys(seen).join(', ') + ')');
  // sin ventana tras la temporada nueva
  const B2 = bootN(); let c2 = H.autopilot(B2, { mode: 'hall', seasons: 2, seed: 616, each: (cc) => { if (cc.natl.win) N(B2)._debugSeed(cc, 'sum'); } });
  ok(c2.natl.win === null, 'pista: ninguna ventana abierta tras la temporada nueva');
}

// ------------------------------------------------------------------ 7. partido jugado
section('7. Partido jugado: setup y done');
{
  for (const mode of ['hall', 'beach']) {
    const Bn = bootN(), X = N(Bn), K = Bn.C;
    let c = H.autopilot(Bn, { mode, seasons: 1, seed: 7171 });
    // fase 'off' de verdad: la temporada acaba en autopilot con K.stay; aquí seguimos en la siguiente, a mitad de liga
    X._debugSeed(c, 'sum');
    c = K.load(); const w = c.natl.win, f = X.pendingMine(w);
    ok(w && w.on && f, mode + ': verano convocado con un partido pendiente');
    const m = X.setup({ w: w.id, i: f.i, mode });
    const six = mode === 'hall';
    ok(m && m.attrs.length === 2 && m.attrs[0].length === (six ? 6 : 2) && m.attrs[1].length === (six ? 6 : 2), mode + ': atributos ' + (six ? '2×6' : '2×2'));
    if (six) ok(m.names[0].length === 6 && m.nums[0].length === 6 && m.names[1].length === 6 && new Set(m.nums[0]).size === 6 && m.nums[0].indexOf(13) < 0 && m.nums[0][m.ctrlIdx] === c.player.num && m.format === '6v6' && m.meBench === -1,
      'pista: nombres y dorsales de los 12, tu dorsal en tu hueco, sin el 13');
    else ok(m.career.mate && m.career.mateNum > 0 && m.career.mateNum !== c.player.num, 'playa: pareja nacional con nombre y dorsal (' + m.career.mate + ' ' + m.career.mateNum + ')');
    ok(m.career.ext === 'natl' && m.career.natl === w.id && m.career.fx === f.i && !/·/.test(m.career.label) && /,/.test(m.career.label), mode + ': career.ext natl y etiqueta «' + m.career.label + '»');
    ok(m.kit && m.kit.kitPattern === 'liso' && m.rivalKit && m.kit.kitShirt !== undefined && m.ref && m.ref.chal === 2 && m.difficulty, mode + ': camisetas lisas, árbitro con challenge e IA (' + m.difficulty + ')');
    const m2 = X.setup({ w: w.id, i: f.i, mode });
    ok(JSON.stringify(m2.attrs) === JSON.stringify(m.attrs), mode + ': setup reentrante (Reiniciar)');
    const mt0 = c.player.matches, xp0 = c.player.xp + c.player.lvl * 1000, caps0 = c.natl.car.caps;
    const g = { career: m.career, demo: false, autopilot: false };
    const sum = X.done({ sets: [2, 1], setScores: six ? [[25, 20], [21, 25], [15, 11]] : [[21, 18], [17, 21], [15, 12]], win: true }, g);
    c = K.load();
    ok(sum && sum.kind === 'natl' && sum.nota > 0 && sum.xp > 0 && sum.win === true, mode + ': done → Resumen (nota ' + (sum && sum.nota) + ', ' + (sum && sum.xp) + ' XP)');
    ok(c.player.matches === mt0 && c.player.xp + c.player.lvl * 1000 > xp0 && c.natl.car.caps === caps0 + 1, mode + ': XP sumada, player.matches igual y un partido más con la selección');
    ok(w.fx[f.i].res && w.fx[f.i].res.me.played === 1, mode + ': partido marcado como jugado');
    ok(X.done({ sets: [2, 0], setScores: [[25, 10], [25, 10]], win: true }, g) === null, mode + ': un 2º done del mismo partido da null');
    ok(X.done({ sets: [2, 0] }, { career: { ext: 'otro' } }) === null && X.setup({ w: -1, i: 0 }) === null, mode + ': done y setup con datos ajenos → null');
  }
}

// ------------------------------------------------------------------ 8. ventana de clasificación
section('8. Ventana de clasificación (pista)');
{
  const Bn = bootN(), X = N(Bn), K = Bn.C;
  let c = newCareer(Bn, 'hall', 8181, 'ES');
  ok(X._debugSeed(c, 'q'), 'se abre una ventana de clasificación');
  c = K.load(); const w = c.natl.win;
  ok(w && w.kind === 'q' && w.fx.length === 3 && w.teams.length === 3 && w.exp === c.week + 1, 'repesca de 3: 2 partidos tuyos y el de las otras dos');
  const html = X.card(c, HLP);
  ok(/data-act="nt-play" aria-label="Jugar con la selección">Jugar</.test(html) && /jornada/.test(html), 'tarjeta de Partido con «Jugar» (aria-label «Jugar con la selección»)');
  // siguiente jornada del club: se simula
  for (let g = 0; g < 3 && K.load().natl.win; g++) { const n = K.next(K.load()); if (n && n.bench) K.benchNext(); else K.simulateNext(); }
  c = K.load();
  ok(c.natl.win === null, 'tras la jornada siguiente la ventana se cierra');
  const qs = Object.keys(c.natl.q);
  ok(qs.length === 1 && c.natl.q[qs[0]].ev === w.ev, 'resultado guardado para el verano (' + JSON.stringify(c.natl.q) + ')');
  ok(w.fx.every((f) => f.res), 'los 3 partidos simulados');
  // el torneo del verano usa ese resultado
  const s = +qs[0], q = c.natl.q[s];
  const F = X.fieldOf(c, s);
  if (F.rep && F.rep.indexOf(q.w) >= 0) { const w2 = X._openSum(c, s, 'out'); ok(w2.teams.indexOf(q.w) >= 0 && w2.repW === q.w, 'el ganador de la repesca juega el torneo del verano (' + q.w + ')'); }
  else ok(true, 'la repesca del verano ya no incluye al ganador (ranking cambiado): se usa la simulada');
  // apertura natural en la jornada de mitad de liga: una semilla cuyo 1r verano tenga repesca con un país de liga dentro
  let opened = 0, tried = 0;
  for (let sd = 9000; sd < 9060 && !opened; sd++) {
    const B0 = bootN(), c0 = newCareer(B0, 'hall', sd, 'ES'), F0 = N(B0).fieldOf(c0, c0.season);
    const lc = B0.C.hall.countries().map((x) => x.code), cand = F0.rep ? F0.rep.filter((x) => lc.indexOf(x) >= 0)[0] : null;
    if (!cand) continue;
    tried++;
    const B2 = bootN(), K2 = B2.C; newCareer(B2, 'hall', sd, cand);
    const mw = K2.hall.midWeek(K2.load()); let g = 0;
    while (K2.load().phase === 'league' && K2.load().week <= mw + 1 && g++ < 40) {
      const n = K2.next(K2.load()); if (n && n.bench) K2.benchNext(); else K2.simulateNext();
      const c3 = K2.load(), w3 = c3.natl.win; if ((w3 && w3.kind === 'q') || c3.natl.q[c3.season]) { opened = c3.week >= mw ? 1 : -1; break; }   // (sin convocatoria la repesca se simula al momento)
    }
  }
  if (opened) ok(opened === 1, 'se abre sola en la jornada de mitad de liga cuando tu país está en la repesca');
  else warn('ninguna de ' + tried + ' carreras tenía su país en la repesca del 1r verano (no se comprueba la apertura natural)');
}

// ------------------------------------------------------------------ 9. temporada nueva con el verano a medias
section('9. Temporada nueva con el verano a medias');
{
  for (const mode of ['hall', 'beach']) {
    const Bn = bootN(), X = N(Bn), K = Bn.C;
    let c = newCareer(Bn, mode, 9393, 'ES');
    let g = 0; while (K.load().phase !== 'off' && g++ < 90) { const n = K.next(K.load()); if (n && n.bench) K.benchNext(); else K.simulateNext(); }
    c = K.load(); const s0 = c.season;
    Object.keys(c.player.st).forEach((k) => { c.player.st[k] = 99; });   // (muy fuerte: casi seguro que hay medalla)
    X._debugSeed(c, 'sum');
    c = K.load(); const w = c.natl.win;
    ok(w && w.stage !== 'done' && w.s === s0, mode + ': verano a medias tras la temporada ' + s0);
    const id0 = c.msgN | 0; K.stay(1); c = K.load();
    ok(c.season === s0 + 1 && c.natl.win === null, mode + ': temporada nueva sin ventana abierta');
    const h = c.natl.hist[c.natl.hist.length - 1];
    ok(h && h.s === s0 && w.stage === 'done', mode + ': el torneo acaba y va al historial de la T' + s0 + ' (' + (h && h.res) + ')');
    const tr = c.trophies.filter((t) => /^sel/.test(t.kind));
    ok(tr.length >= 1, mode + ': medalla con la selección (' + tr.map((t) => t.name).join(', ') + ')');
    ok(tr.every((t) => t.season === s0 && K.CDIFF[t.d] && t.club && t.ev), mode + ': trofeos con season ' + s0 + ' y d clave de dificultad');
    const med = c.inbox.filter((m) => m.k === 'natl' && /^¡(Oro|Plata|Bronce) /.test(m.t) && m.id > id0), sinTi = c.inbox.filter((m) => m.k === 'natl' && /sin ti en pantalla/.test(m.t) && m.id > id0);
    ok(med.length ? !sinTi.length && /Firmaste antes del final/.test(med[0].x) : sinTi.length === 1, mode + ': un solo aviso del torneo simulado al fichar (' + (med.length ? 'en el de la medalla' : 'aparte') + ')');
  }
}

// ------------------------------------------------------------------ 10. legado y vitrina
section('10. Legado y Vitrina');
{
  const Bn = bootN(), X = N(Bn), K = Bn.C;
  let c = newCareer(Bn, 'hall', 1010, 'ES');
  ok(X.legacyOf(c, { kind: 'sel', ev: 'wc' }) === 30 && X.legacyOf(c, { kind: 'sel', ev: 'games' }) === 40 && X.legacyOf(c, { kind: 'selm', ev: 'wc', med: 2 }) === 18 &&
    X.legacyOf(c, { kind: 'selm', ev: 'vbn', med: 1 }) === 5 && X.legacyOf(c, { kind: 'selp', name: 'MVP del Mundial VBF' }) === 10 && X.legacyOf(c, { kind: 'selp', name: 'Mejor receptor' }) === 5 &&
    X.legacyOf(c, { kind: 'liga' }) === null, 'legacyOf: oro, plata, bronce, premios y null si no es suyo');
  c.natl.car.caps = 23; ok(X.legacyExtra(c) === 4, 'legacyExtra: 1 punto por cada 5 partidos');
  const sl = X.caseSlots(c);
  ok(sl.length === 4 && sl.every((s) => s.group === 'Selección' && s.kind === 'sel' && /^nt-/.test(s.id) && s.need) && sl.map((s) => s.name).join('|') === 'VBN|Europeo VEC|Mundial VBF|Juegos Cuatrienales', 'caseSlots: 4 huecos (' + sl.map((s) => s.name).join(', ') + ')');
  const L0 = Bn.VB.CareerLife.legacyScore(c);
  c.trophies.push({ season: 1, kind: 'sel', name: 'Mundial VBF', club: 'España', d: 'normal', med: 3, ev: 'wc' });
  ok(Bn.VB.CareerLife.legacyScore(c) === L0 + 30, 'legacyScore suma el oro mundial (' + L0 + ' → ' + Bn.VB.CareerLife.legacyScore(c) + ')');
  const W = Bn.VB.CareerWorld;
  if (W && W.trophyCase) {
    const tc = W.trophyCase(c), sel = tc.slots.filter((s) => s.group === 'Selección');
    ok(sel.length === 4 && sel.some((s) => s.name === 'Mundial VBF' && s.won.length === 1), 'trophyCase: grupo «Selección» con el oro en su hueco');
    const gi = tc.slots.map((s) => s.group), last = gi.lastIndexOf('Selección'), firstP = gi.indexOf('Premios');
    ok(firstP < 0 || last < firstP, 'trophyCase: «Selección» va antes de «Premios»');
    c.trophies.push({ season: 1, kind: 'selm', name: 'Plata en la VBN', club: 'España', d: 'normal', med: 2, ev: 'vbn' });
    ok(W.trophyCase(c).other.some((o) => o.name === 'Plata en la VBN'), 'trophyCase: la plata va a «Otros títulos»');
  } else warn('sin career-world: no se mira la Vitrina');
  const Bb = bootN(); let cb = newCareer(Bb, 'beach', 1011);
  ok(N(Bb).caseSlots(cb).map((s) => s.name).join('|') === 'Circuito de Naciones de Playa|Europeo VEC de Playa|Mundial VBF de Playa|Juegos Cuatrienales', 'playa: nombres de playa');
}

// ------------------------------------------------------------------ 11. textos
section('11. Textos (20 semillas, estados sum, q y done)');
{
  let bad = [], acts = 0, badAct = [], nMsg = 0, cards = 0;
  for (let i = 0; i < 20; i++) {
    const mode = i % 2 ? 'beach' : 'hall', Bn = bootN(), X = N(Bn), K = Bn.C;
    let c = newCareer(Bn, mode, 2000 + i * 11, ['ES', 'PH', 'BR', 'JP', 'EG'][i % 5]);
    const chk = (h, where) => {
      const t = txt(h); if (BAD.test(t)) bad.push(where + ': ' + t.match(BAD)[0] + ' en «' + t.slice(Math.max(0, t.search(BAD) - 40), t.search(BAD) + 30).trim() + '»');
      (h.match(/data-act="[^"]*"/g) || []).forEach((a) => { acts++; if (!/data-act="nt-/.test(a)) badAct.push(a); });
    };
    for (const st of ['sum', 'q', 'done']) {
      c = K.load(); c.natl.win = null; c.natl.qS = 0;
      if (!X._debugSeed(c, st)) continue;
      c = K.load();
      for (const hl of [HLP, HLPph]) { chk(X.page(c, 'natl', hl), mode + ' ' + st + ' página'); const cd = X.card(c, hl); if (cd) cards++; chk(cd, mode + ' ' + st + ' tarjeta'); chk(X.honors(c, hl), mode + ' ' + st + ' palmarés'); }
    }
    // un verano real y los mensajes
    let g = 0; while (K.load().phase !== 'off' && g++ < 90) { const n = K.next(K.load()); if (n && n.bench) K.benchNext(); else K.simulateNext(); }
    c = K.load(); c.natl.win = null; X._openSum(c, c.season, ['tit', 'conv', 'pre', 'out', 'inj'][i % 5]); X.simAll(c);
    c = K.load(); chk(X.page(c, 'natl', HLP), mode + ' cerrado');
    c.inbox.filter((m) => m.k === 'natl').forEach((m) => { nMsg++; chk(m.t + ' ' + m.x, mode + ' mensaje'); });
  }
  ok(bad.length === 0, 'sin «{», «undefined», «NaN», «1.er» ni «·» en ' + nMsg + ' mensajes y las pantallas' + (bad.length ? ': ' + bad.slice(0, 4).join(' || ') : ''));
  ok(acts > 0 && badAct.length === 0, acts + ' botones, todos con data-act «nt-»' + (badAct.length ? ': ' + badAct.slice(0, 3).join(' ') : ''));
  ok(cards > 0, 'la tarjeta de Partido sale con una ventana abierta (' + cards + ')');
  // ordinales y frases
  const Bn = bootN(), X = N(Bn), K = Bn.C; let c = newCareer(Bn, 'hall', 3131, 'ES'); X._debugSeed(c, 'sum'); c = K.load();
  const pg = txt(X.page(c, 'natl', HLP));
  ok(/Seleccionador: /.test(pg) && /Próximos veranos/.test(pg) && /Tu historia con España/.test(pg) && /Grupo [A-D]/.test(pg), 'Club › Selección: parche, cómo entrar, torneo, próximos veranos e historial');
  ok(!/1\.er|2\.º|3\.er/.test(pg) && /1ª jornada|2ª jornada|3ª jornada/.test(pg), 'jornadas con «1ª»/«2ª», sin «1.er»');
  // móvil: el torneo con tu partido pendiente es .x-go (su 1ª .acts, «Jugar» + «Simular partido», va a la barra #crDock); el resto debajo
  // de la tabla; tu país es tr.nt-me (con tr.me el hub bajaría hasta la tabla y dejaría el torneo bajo la cabecera)
  const raw = X.page(c, 'natl', HLPph), tc = raw.slice(raw.indexOf('<div class="card x-go">'));
  const a1 = tc.slice(0, tc.indexOf('</div>', tc.indexOf('<div class="acts">')));
  ok(raw.indexOf('<div class="card x-go">') > 0 && /data-act="nt-play"/.test(a1) && /data-act="nt-sim"/.test(a1) && !/nt-simall|nt-dec/.test(a1), 'móvil: tarjeta del torneo .x-go con «Jugar» y «Simular partido» en su 1ª fila de botones');
  ok(tc.indexOf('nt-simall') > tc.indexOf('</table>') && /tr class="nt-me"/.test(raw) && !/tr class="me"/.test(raw), '«Simular el resto» bajo la tabla; tu país con tr.nt-me');
  ok(/tr\.nt-me td/.test(String(Bn.VB.CareerUIExt.filter((x) => x.id === 'natl')[0].css())), 'CSS propio para tr.nt-me');
  ok(X.dot(c, 'club') === false || X.dot(c, 'natl') === true, 'punto en Club y en la sub-pestaña con una ventana nueva');
  X.page(c, 'natl', HLP); ok(X.dot(K.load(), 'natl') === false, 'abrir la sub-pestaña lo marca como visto');
  const r1 = X.act('nt-go'); ok(r1 && r1.tab === 'club' && r1.s === 'natl', 'nt-go lleva a Club › Selección');
  const r2 = X.act('nt-play'); ok(r2 && r2.play && r2.play.id === 'natl' && r2.play.arg && r2.play.arg.mode === 'hall', 'nt-play pide el partido a main.js');
  const before = K.load().natl.win.fx.filter((f) => f.res).length; const r3 = X.act('nt-sim');
  ok(r3 && r3.render && K.load().natl.win.fx.filter((f) => f.res).length > before, 'nt-sim simula tu partido y el resto de la jornada');
  const r4 = X.act('nt-simall'); ok(r4 && r4.render && K.load().natl.win.stage === 'done', 'nt-simall acaba el torneo');
  // playa: cambiar de país hasta la 1ª convocatoria
  const Bb = bootN(), Xb = N(Bb), Kb = Bb.C; let cb = newCareer(Bb, 'beach', 3132); Xb.ensure(cb);
  ok(Xb.act('nt-cc-next') && Kb.load().natl.cc !== 'ES' && Xb.act('nt-cc-prev') && Kb.load().natl.cc === 'ES', 'playa: «‹ Anterior» y «Siguiente ›» cambian el país');
  cb = Kb.load(); cb.natl.lock = 1; ok(Xb.act('nt-cc-next') === false && /Se fija/.test(txt(Xb.page(cb, 'natl', HLP))) === false, 'playa: con el país fijado ya no se cambia');
  // rechazar la convocatoria
  const Bd = bootN(), Xd = N(Bd), Kd = Bd.C; let cd = newCareer(Bd, 'hall', 3133, 'ES');
  let gg = 0; while (Kd.load().phase !== 'off' && gg++ < 90) { const n = Kd.next(Kd.load()); if (n && n.bench) Kd.benchNext(); else Kd.simulateNext(); }
  cd = Kd.load(); cd.natl.win = null; Xd._openSum(cd, cd.season, 'tit'); Kd.save(cd); const t0 = Kd.load().natl.trust;
  if (Kd.load().natl.win.nq) ok(true, 'rechazar: España sin billete en esa semilla (se salta)');
  else { const rd = Xd.act('nt-dec'); cd = Kd.load(); ok(rd && rd.render && cd.natl.trust === Math.max(0, t0 - 15) && cd.natl.win.stage === 'done' && cd.natl.hist.slice(-1)[0].st === 'Descanso', '«Pedir descanso»: confianza −15, torneo simulado, «Descanso» en el historial'); }
}

// ------------------------------------------------------------------ 12. con «Carrera con vida»
section('12. Con «Carrera con vida»');
{
  const Bn = bootN(), X = N(Bn), K = Bn.C, S = Bn.S;
  ok(!!S, 'career-story cargado');
  let c = newCareer(Bn, 'hall', 1212, 'PH');
  let g = 0; while (K.load().phase !== 'off' && g++ < 90) { const n = K.next(K.load()); if (n && n.bench) K.benchNext(); else K.simulateNext(); }
  c = K.load(); S.ensure(c); c.natl.win = null;
  const fl = c.story.feed.length; X._openSum(c, c.season, 'tit');
  const e = c.story.feed.filter((x) => x.b === 'nt-press').pop();
  if (c.natl.win.nq) ok(true, 'sin billete: no hay rueda de prensa (se salta)');
  else {
    ok(!!e || S.budget(c) <= 0, 'la convocatoria publica la rueda de prensa «nt-press» (' + (c.story.feed.length - fl) + ' entradas nuevas)');
    if (e) { const t = S.text(c, e); ok(t && !BAD.test(t.t + ' ' + t.x + ' ' + t.o.map((o) => o.t).join(' ')), 'texto de la prensa sin variables sueltas: «' + (t && t.t) + '»');
      let res = null, err = null; try { res = S.answer(c, e.id, 1); } catch (er) { err = er; } ok(!err && Array.isArray(res), 'S.answer contesta sin error'); }
    const ch = S.chipsOf ? S.chipsOf(c).filter((x) => /Selección/.test(x.t)) : [];
    ok(ch.length === 1 && ch[0].tab === 'club' && ch[0].s === 'natl', 'aviso en Partido «Selección: partido pendiente»');
  }
  // storytest sin natl: el fichero no está en storyhelp.BASE ni STORY
  ok(H.BASE.concat(H.STORY).indexOf(FILE) < 0, 'storytest y careertest siguen sin cargar career-natl.js');
}

// ------------------------------------------------------------------ 13. correcciones de la revisión (20-nov-2026)
section('13. Correcciones: repesca, cuartos, sub-19, lesión, papel, hoja final');
{
  // a) repesca: pasa la 1ª de la tabla (España 2-0 a A, 1-2 con B y B gana a A → pasa B, aunque España tenga 1 victoria y +1 en sets)
  {
    const Bn = bootN(), X = N(Bn), K = Bn.C;
    let c = newCareer(Bn, 'hall', 8181, 'ES');
    ok(X._debugSeed(c, 'q'), 'repesca: ventana de muestra');
    c = K.load(); const w = c.natl.win, oth = w.teams.filter((x) => x !== w.my), A = oth[0], Bt = oth[1];
    // r(f, gana, s, sc): resultado del partido f con el ganador dado (s y sc desde el ganador)
    const r = (f, win, s, sc) => { const fromA = f.a === win; f.res = { s: fromA ? s : [s[1], s[0]], sc: fromA ? sc : sc.map((x) => [x[1], x[0]]), me: null }; };
    const vs = (f, x, y) => (f.a === x && f.b === y) || (f.a === y && f.b === x);
    w.fx.forEach((f) => {
      if (vs(f, w.my, A)) r(f, w.my, [2, 0], [[25, 20], [25, 21]]);
      else if (vs(f, w.my, Bt)) r(f, Bt, [2, 1], [[20, 25], [25, 20], [15, 10]]);
      else r(f, Bt, [2, 0], [[25, 19], [25, 18]]);
    });
    X._advance(c, w, true);
    ok(w.stage === 'done' && w.qW === Bt && w.qOk === 0 && c.natl.q[w.s] && c.natl.q[w.s].w === Bt, 'repesca: el billete es de ' + Bt + ' (2 victorias), no de ' + w.my + ' (' + w.qW + ')');
  }
  // b) cuartos: un convocado sin la confianza del seleccionador no juega los cuartos; la clasificación sí
  {
    const Bn = bootN(), X = N(Bn);
    const c = newCareer(Bn, 'hall', 1313, 'ES'); c.natl.trust = 50; c.natl.lastN = 6;
    const w = { on: 1, dec: 0, st: 'conv', my: 'ES', id: 1 };
    ok(X.plays(c, w, { r: 'qf', a: 'ES', b: 'IT' }) === false && X.plays(c, w, { r: 'q1', a: 'ES', b: 'IT' }) === true && X.plays(c, w, { r: 'q2', a: 'IT', b: 'ES' }) === true,
      'cuartos (qf) por la confianza; clasificación (q1, q2) siempre');
    c.natl.trust = 70; ok(X.plays(c, w, { r: 'qf', a: 'ES', b: 'IT' }) === true, 'con confianza 70 juega los cuartos');
    const src = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
    ok(src.indexOf('ko = /^(qf|sf|f|b)$/') >= 0, 'los cuartos cuentan como eliminatoria para la fama');
  }
  // c) sub-19: el prólogo jugado (informe o cerrado) suma; el saltado, no
  {
    const Bn = bootN(), X = N(Bn);
    const c = newCareer(Bn, 'hall', 1414, 'ES');
    c.pro = { st: 'skip', i: 0 }; c.natl.youth = 0; X.ensure(c); ok(c.natl.youth === 0, 'sub-19: prólogo saltado → sin bono');
    const s0 = X.scoreOf(c);
    c.pro = { st: 'scout', i: 5 }; X.ensure(c); const s1 = X.scoreOf(c);
    ok(c.natl.youth === 1 && Math.abs(s1 - s0 - 1) < 0.051, 'sub-19: prólogo jugado → youth 1 y +1 en la nota (' + s0 + ' → ' + s1 + ')');
    c.pro = { st: 'done', i: 5 }; X.ensure(c); ok(c.natl.youth === 1, 'sub-19: se queda tras cerrar el prólogo');
    const c2 = newCareer(Bn, 'hall', 1415, 'ES'); delete c2.pro; c2.natl.youth = 0; X.ensure(c2); ok(c2.natl.youth === 0, 'sub-19: sin prólogo, sin bono');
  }
  // d) lesión: en verano (fase 'off') una baja larga deja fuera; una de 1 partido, no. En la clasificación, tirada tras tu partido.
  {
    const Bn = bootN(), X = N(Bn);
    Bn.VB.CareerInjury = { out: (v) => (v && v.phase !== 'off' && v.inj && v.inj.cur ? { id: 'tob2', left: v.inj.cur.left, sev: v.inj.cur.sev || 1 } : null), roll: () => null };
    const c = newCareer(Bn, 'hall', 1515, 'ES');
    c.phase = 'off'; c.inj = { cur: { left: 4, sev: 1 } };
    ok(X.status(c).st === 'inj', 'verano: baja de 4 partidos → «Lesionado»');
    c.natl.win = null; const w0 = X._openSum(c, c.season);
    ok(w0.st === 'inj' && !w0.on && w0.stage === 'done' && c.natl.hist.slice(-1)[0].st === 'Lesionado', 'verano: convocatoria con «Lesionado» y torneo simulado');
    c.inj = { cur: { left: 1, sev: 1 } }; ok(X.status(c).st !== 'inj', 'verano: baja leve de 1 partido → no cuenta');
    c.inj = { cur: { left: 1, sev: 2 } }; ok(X.status(c).st === 'inj', 'verano: baja seria → «Lesionado»');

    const B2 = bootN(), X2 = N(B2), K2 = B2.C; let r2 = 0;
    B2.VB.CareerInjury = { out: () => null, roll: (c0, e, tag) => { r2++; return tag === 'sel' && e === 1 ? { id: 'tob2', name: 'Esguince', sev: 2, n: 3 } : null; } };
    let c2 = newCareer(B2, 'hall', 8181, 'ES'); X2._debugSeed(c2, 'q'); c2 = K2.load();
    const wq = c2.natl.win; ok(X2.simFx(c2), 'clasificación: 1r partido simulado contigo');
    c2 = K2.load();
    ok(r2 === 1 && wq.st === 'inj' && wq.on === 0 && wq.stage === 'done' && c2.natl.st === 'inj', 'clasificación: lesión tras el 1r partido → fuera del 2º y el resto simulado (' + r2 + ' tirada)');
    const hq = c2.natl.hist.slice(-1)[0]; ok(hq && hq.ev === 'q' && hq.caps === 1 && hq.st === 'Lesionado', 'clasificación: el partido jugado va al historial (' + (hq && hq.st) + ')');
    ok(c2.inbox.some((m) => m.k === 'natl' && /^Baja con /.test(m.t)), 'clasificación: aviso de la baja');
  }
  // e) sin billete: un titular sigue siendo «Titular» en el historial
  {
    const Bn = bootN(), X = N(Bn);
    const c = newCareer(Bn, 'hall', 1616, 'ES'); c.natl.win = null;
    const w = X._openSum(c, c.season, 'tit'); w.nq = 1; w.on = 0; X._advance(c, w, true);
    const h = c.natl.hist.slice(-1)[0]; ok(h && h.res === 'Sin billete' && h.st === 'Titular', 'sin billete: papel «Titular» (' + (h && h.st) + ')');
  }
  // f) hoja final: título sin «el», botón corto y línea de copa
  for (const mode of ['hall', 'beach']) {
    const Bn = bootN(), X = N(Bn), K = Bn.C, six = mode === 'hall';
    let c = H.autopilot(Bn, { mode, seasons: 1, seed: 7171 });
    X._debugSeed(c, 'sum'); c = K.load();
    let w = c.natl.win, f = X.pendingMine(w), m = X.setup({ w: w.id, i: f.i, mode });
    const sum = X.done({ sets: [0, 2], setScores: six ? [[20, 25], [21, 25]] : [[18, 21], [17, 21]], win: false }, { career: m.career, demo: false, autopilot: false });
    ok(sum && sum.title === 'Gana ' + m.career.rivalName && !/Gana el /.test(sum.title), mode + ': derrota → «' + (sum && sum.title) + '»');
    ok(sum && /^(Siguiente: |Volver )/.test(sum.back) && sum.back.length <= 24 && !BAD.test(sum.back), mode + ': botón «' + (sum && sum.back) + '»');
    c = K.load(); w = c.natl.win; f = X.pendingMine(w);
    m = f ? X.setup({ w: w.id, i: f.i, mode }) : null;
    if (m) {
      const s2 = X.done({ sets: [2, 0], setScores: six ? [[25, 20], [25, 21]] : [[21, 18], [21, 17]], win: true }, { career: m.career, demo: false, autopilot: false });
      ok(s2 && /^(Victoria|¡Oro!|¡Bronce!)$/.test(s2.title) && typeof s2.cup === 'string' && !BAD.test(s2.cup), mode + ': victoria → «' + (s2 && s2.title) + '»' + (s2 && s2.cup ? ' | ' + s2.cup : ''));
    }
    // hasta el final: la última hoja trae la línea de copa
    let last = null, g = 0;
    while (g++ < 8) {
      c = K.load(); w = c.natl.win; f = w && X.pendingMine(w); if (!f) break;
      m = X.setup({ w: w.id, i: f.i, mode }); if (!m) { X.simFx(c); continue; }
      last = X.done({ sets: [2, 0], setScores: six ? [[25, 20], [25, 21]] : [[21, 18], [21, 17]], win: true }, { career: m.career, demo: false, autopilot: false });
    }
    if (last) ok(last.cup && !BAD.test(last.cup) && /Volver a la Carrera/.test(last.back), mode + ': última hoja «' + last.title + '» | ' + last.cup + ' | ' + last.back);
  }
  // hoja de muestra para mobaudit (carrera-natl-partido-hoja): los textos más largos, sin tocar ninguna Carrera
  const XD = N(bootN()), dq = XD._endDemo('q'), dl = XD._endDemo('loss');
  ok(dq && dq.kind === 'natl' && /^¡Billete para el /.test(dq.cup) && dq.title === 'Victoria' && dq.back === 'Volver a la Carrera' && !BAD.test(dq.cup + dq.label), '_endDemo q: «' + (dq && dq.cup) + '»');
  ok(dl && dl.win === false && dl.title === 'Gana República Dominicana' && dl.back === 'Siguiente: 3ª jornada' && !dl.cup && !BAD.test(dl.title + dl.back + dl.next), '_endDemo loss: «' + (dl && dl.title) + '» | ' + (dl && dl.back));
}

console.log('\n' + (fails ? fails + ' FALLOS' : 'TODO OK') + ' (' + passes + ' comprobaciones)');
process.exit(fails ? 1 : 0);
