/* MAKE THE CUT — tools/storyhelp.js (owner: carrera)
 * Ayudas de prueba de «Carrera con vida» (js/career-story*.js, notes/carrera-vida.md) para tools/storytest.js y las pruebas de los
 * paquetes (storymsgtest, storyweektest, storywalltest, storyseasontest). Node puro (vm, sin DOM).
 *  - boot({story, files, extra, ext}) → {VB, C, S, mem, cx}: un contexto nuevo con localStorage falso y los ficheros de careertest
 *    (FILES); story: false los carga SIN career-story*.js; extra: rutas añadidas al final (p. ej. una prueba con su sistema falso);
 *    ext: true añade tras STORY las extensiones de la Carrera (extFiles(), antes de extra). BASE y STORY NO llevan extensiones: las
 *    pruebas de contrato de cada extensión comparan «con y sin» sobre ellos.
 *  - extFiles() → rutas de las extensiones de la Carrera sin interfaz (CONTRACT.md «Extensiones de la Carrera»), leídas de index.html
 *    en su orden: los <script> entre career-story-season.js y career-story-ui.js que no acaban en -ui.js. Así una extensión nueva entra
 *    sola. injOff(VB): deja las lesiones en «No» en todas las carreras de ese contexto (envuelve el gancho de VB.CareerInjury: c.inj.on
 *    = 0 antes de cada evento; CONTRACT: así la Carrera es idéntica a la de sin lesiones).
 *  - autopilot(B, {mode, seasons, seed, feed, week, each, now}) → c: N temporadas de playa ('beach') o pista ('hall'). 1 de cada 3
 *    partidos «jugado» (matchSetup + matchDone con estadísticas falsas deterministas), el resto simulado, banquillos con benchNext;
 *    contesta la decisión de career-life con 0 (como careertest.js:1462). feed: true contesta con 0 cada entrada abierta del feed
 *    (act 'st-ans-<id>-0'); week: true elige la carta 0 ('st-wk-0', si algún sistema atiende 'wk'). each(c, s) al final de cada
 *    temporada.
 *  - strip(c, keep) → texto: la carrera sin story/inbox/msgN/created/world (lo que puede cambiar con y sin los ficheros story).
 *  - fakeDoc() → document mínimo (como careertest.js:2492) y uiCtx(VB, files) → {cx, err}: carga ficheros de interfaz con él.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const BASE = ['js/sim.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/rating.js', 'js/career.js', 'js/career-life.js', 'js/career-world.js'];
const STORY = ['js/career-story.js', 'js/career-story-msgs.js', 'js/career-story-week.js', 'js/career-story-wall.js', 'js/career-story-season.js'];
const STORY_UI = 'js/career-story-ui.js';

/** Extensiones de la Carrera sin interfaz, en el orden de index.html (ver cabecera). */
function extFiles() {
  let html = '';
  try { html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'); } catch (e) { return []; }
  const src = [], re = /<script\s+src="(js\/[^"]+\.js)"/g; let m;
  while ((m = re.exec(html))) src.push(m[1]);
  const a = src.indexOf('js/career-story-season.js'), b = src.indexOf(STORY_UI);
  if (a < 0 || b <= a) return [];
  return src.slice(a + 1, b).filter(f => !/-ui\.js$/.test(f) && fs.existsSync(path.join(ROOT, f)));
}
/** Lesiones en «No» para todas las carreras del contexto (sin VB.CareerInjury no hace nada). Devuelve true si lo ha aplicado. */
function injOff(VB) {
  const I = VB && VB.CareerInjury, X = I && I._ext;
  if (!X || typeof X.hook !== 'function' || X._off) return !!(X && X._off);
  const h = X.hook;
  X.hook = function (c) { if (c && typeof c === 'object') { if (c.inj && typeof c.inj === 'object' && !Array.isArray(c.inj)) c.inj.on = 0; else c.inj = { on: 0 }; } return h.apply(this, arguments); };
  X._off = true;
  return true;
}

function boot(o) {
  o = o || {};
  const mem = {};
  const LS = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const cx = { console, Math, Date, JSON, Set, localStorage: LS }; cx.globalThis = cx; cx.window = cx; vm.createContext(cx);
  const files = (o.files || BASE.concat(o.story === false ? [] : STORY, o.ext ? extFiles() : [])).concat(o.extra || []);
  for (const f of files) {
    const fp = path.isAbsolute(f) ? f : path.join(ROOT, f);
    if (fs.existsSync(fp)) vm.runInContext(fs.readFileSync(fp, 'utf8'), cx, { filename: f });
  }
  return { VB: cx.VB, C: cx.VB.Career, S: cx.VB.CareerStory || null, mem, cx };
}

const STATS = { kills: 12, aces: 2, blocks: 1, digs: 8, assists: 3, errors: 3 };
/** Un partido «jugado» (o el banquillo, o simulado si no hay partido que preparar). win: resultado. */
function playOne(B, hall, win) {
  const K = B.C, c = K.load(), n = K.next(c);
  if (n && n.bench) return K.benchNext();
  const ms = K.matchSetup(c);
  if (!ms) return K.simulateNext();
  const sc = hall ? (win ? [[15, 10], [15, 12]] : [[10, 15], [12, 15]]) : (win ? [[21, 17], [18, 21], [15, 12]] : [[17, 21], [19, 21]]);
  const sets = hall ? (win ? [2, 0] : [0, 2]) : (win ? [2, 1] : [0, 2]);
  const all = sc.reduce((s, x) => s + x[0] + x[1], 0);
  let g;
  if (hall) {
    const team0 = [0, 1, 2, 3, 4, 5].map(i => ({ team: 0, id: i, num: ms.nums ? ms.nums[0][i] : i + 1 }));
    g = { career: ms.career, size: 6, teams: [team0, [0, 1, 2, 3, 4, 5].map(i => ({ team: 1, id: 16 + i }))], ctrl: team0[ms.ctrlIdx | 0], meR: all, rallyN: all, demo: false };
  } else g = { career: ms.career || { season: c.season }, teams: [[{}, {}], [{}, {}]], demo: false };
  return K.matchDone({ sets, setScores: sc, win }, Object.assign({}, STATS), g);
}

function autopilot(B, o) {
  o = o || {};
  const K = B.C, L = B.VB.CareerLife, S = B.VB.CareerStory, hall = o.mode === 'hall';
  const seed = o.seed || 1;
  let c = hall ? K.create({ mode: 'hall', name: 'Vida Pista', num: 8, pos: 'OH', seed, now: o.now || 1 })
    : K.create({ mode: 'beach', name: 'Vida Playa', num: 7, role: 'atk', seed, now: o.now || 1 });
  K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  let played = 0;
  const wkSys = S && S.sys && S.sys('wk');
  for (let s = 0; s < (o.seasons || 1); s++) {
    let guard = 0;
    while (K.load().phase !== 'off' && guard++ < 90) {
      const before = JSON.stringify([K.load().season, K.load().phase, K.load().week, K.load().koI, K.load().cup && K.load().cup.round, K.load().kos && K.load().kos.length]);
      const i = played++;
      if (i % 3 === 0) playOne(B, hall, (i % 5) !== 0); else {
        const n = K.next(K.load());
        if (n && n.bench) K.benchNext(); else K.simulateNext();
      }
      if (L) { const ev = L.pendingEvent(K.load()); if (ev) L.answer(0); }
      if (S && o.feed) { const st = K.load().story; if (st) st.feed.filter(x => x.o && x.ans === -1).map(x => x.id).forEach(id => S.act('st-ans-' + id + '-0')); }
      if (S && o.week && wkSys) S.act('st-wk-0');
      const after = JSON.stringify([K.load().season, K.load().phase, K.load().week, K.load().koI, K.load().cup && K.load().cup.round, K.load().kos && K.load().kos.length]);
      if (after === before && K.load().phase !== 'off' && !K.next(K.load())) break;   // (sin partido: no se queda en bucle)
    }
    if (o.each) o.each(K.load(), s);
    K.stay(1);
  }
  return K.load();
}

function strip(c, keep) {
  const o = JSON.parse(JSON.stringify(c));
  ['story', 'inbox', 'msgN', 'created', 'world'].forEach(k => { if (!keep || keep.indexOf(k) < 0) delete o[k]; });
  return JSON.stringify(o);
}

function fakeEl() { return { style: {}, hidden: true, setAttribute() { }, getAttribute() { return null; }, appendChild() { }, addEventListener() { }, querySelector() { return null; }, querySelectorAll() { return []; }, classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } } }; }
function fakeDoc() { return { readyState: 'complete', getElementById: () => null, createElement: fakeEl, head: fakeEl(), body: fakeEl(), addEventListener() { } }; }
/** Carga ficheros de interfaz en un contexto aparte con document falso que comparte VB (como careertest.js:2492). */
function uiCtx(VB, files) {
  const ux = { console, Math, Date, JSON, VB, document: fakeDoc(), setTimeout: () => 0, clearTimeout() { }, requestAnimationFrame: () => 0, performance: { now: () => 0 }, addEventListener() { } };
  ux.globalThis = ux; ux.window = ux; vm.createContext(ux);
  let err = '';
  for (const f of files) { try { vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ux, { filename: f }); } catch (e) { err += f + ': ' + e.message + ' '; } }
  return { cx: ux, err };
}

module.exports = { ROOT, BASE, STORY, STORY_UI, extFiles, injOff, boot, autopilot, playOne, strip, fakeDoc, uiCtx, STATS };
