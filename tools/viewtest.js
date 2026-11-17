#!/usr/bin/env node
/* MAKE THE CUT — tools/viewtest.js  (owner: net)
 * Fase 1b del online (notes/net.md): vista espejo del invitado (js/netview.js), en Node.
 *   - mirror(mirror(g)) = g bit a bit (flip es una involución exacta) en saque, peloteo, punto, revisión y con el hueco en la IA.
 *   - Ningún campo de g, de los jugadores, de los objetos anidados ni de los eventos queda sin clasificar (lista cerrada).
 *   - Lo girado tiene sentido: el invitado es el equipo 0 de la vista (x > 0 al sacar), g.ctrl es su jugador, marcador, sets y
 *     challenges intercambiados, balón y predicciones girados, y su gesto (aim3, hitBuf…) es el del hueco activo.
 *   - Los eventos se remapean (jugador de la vista por id, equipo cambiado, x/y girados, texto del punto visto desde el invitado).
 *   - La entrada del invitado construida en la vista + inputToWorld mueve a su jugador hacia donde apuntaba en pantalla.
 * Uso: node tools/viewtest.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/net.js', 'js/netview.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const VB = ctx.VB, S = VB.Sim, NV = VB.NetView, N = VB.Net, DT = 1 / 120;
let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
}
const _f64 = new Float64Array(1), _u32 = new Uint32Array(_f64.buffer);
function deepHash(g) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { h = Math.imul(h ^ (v >>> 0), 16777619) >>> 0; };
  const str = (s) => { for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i)); mix(0xff); };
  const players = new Set(g.players), SK = { events: 1, opts: 1, replay: 1, rng: 1, stats: 1 }, seen = new Set();
  function walk(v, top) {
    if (typeof v === 'number') { _f64[0] = v; mix(1); mix(_u32[0]); mix(_u32[1]); return; }
    if (typeof v === 'string') { mix(2); str(v); return; }
    if (typeof v === 'boolean') { mix(v ? 3 : 4); return; }
    if (v === undefined) { mix(5); return; }
    if (v === null) { mix(6); return; }
    if (typeof v === 'function') { mix(7); return; }
    if (!top && players.has(v)) { mix(8); mix(v.id); return; }
    if (seen.has(v)) { mix(9); return; }
    seen.add(v);
    if (Array.isArray(v)) { mix(10); mix(v.length); for (const x of v) walk(x, false); }
    else { mix(11); for (const k of Object.keys(v).sort()) { if (top === 'g' && SK[k]) continue; str(k); walk(v[k], false); } }
    seen.delete(v);
  }
  walk(g, 'g');
  for (const p of g.players) walk(p, true);
  return h >>> 0;
}

const unk = { g: new Set(), player: new Set(), nested: new Set(), event: new Set() };
function classify(g, evs) {
  for (const k in g) if (!NV.FIELDS[k]) unk.g.add(k);
  for (const p of g.players) for (const k in p) if (!NV.PLAYER[k]) unk.player.add(k);
  for (const nk in NV.NESTED) {
    const allowed = new Set(NV.NESTED[nk].split(','));
    const objs = nk === 'hum' ? (g.hum || []) : [g[nk]];
    for (const o of objs) if (o && typeof o === 'object') for (const k in o) if (!allowed.has(k)) unk.nested.add(nk + '.' + k);
  }
  for (const e of evs) for (const k in e) if (!NV.EVENT[k]) unk.event.add(e.type + '.' + k);
}

console.log('== (1) involución, clasificación cerrada y eventos, con partidos de bots ==');
let invN = 0, invBad = 0, semBad = [], evN = 0, evBad = [], states = { serve: 0, rally: 0, point: 0, over: 0, review: 0, ai: 0, tmo: 0 };
for (const venue of ['beach', 'hall']) for (let s = 1; s <= 3; s++) {
  const g = S.createGame({ online: true, seed: 40 + s, venue, humans: [{}, { idx: s === 2 ? 1 : 0 }], present: true, stats: true, bestOf: venue === 'hall' ? 1 : 3, timeouts: s === 3, points: venue === 'hall' ? 11 : 21 });
  const view = S.createGame({ online: true, seed: 40 + s, venue, humans: [{}, { idx: s === 2 ? 1 : 0 }], present: true, stats: true, bestOf: venue === 'hall' ? 1 : 3, timeouts: s === 3, points: venue === 'hall' ? 11 : 21 });
  const copy = S.createGame({ online: true, seed: 40 + s, venue, humans: [{}, { idx: s === 2 ? 1 : 0 }], present: true, stats: true, bestOf: venue === 'hall' ? 1 : 3, timeouts: s === 3, points: venue === 'hall' ? 11 : 21 });
  const b0 = N.bot(0, s), b1 = N.bot(1, s + 5), ev = []; let postEnd = 0;
  for (let i = 0; i < 120 * 480; i++) {
    const ins = [b0(g), b1(g)];
    if (i % 2400 === 1300) ins[0].chal = true;
    if (i % 2400 === 2100) ins[1].chal = true;
    if (i % 5000 === 900) ins[0].tmo = true;
    if (i > 15000 && i < 17000) ins[1].ai = true;
    S.step(g, DT, ins);
    ev.length = 0; S.drainEvents(g, ev);
    classify(g, ev);
    // eventos remapeados
    if (ev.length) {
      NV.mirror(view, g, 1);
      for (const e of ev) {
        const m = NV.mapEvent(e, view, 1); evN++;
        if (e.player && typeof e.player === 'object') { if (m.player !== view.players.find(q => q.id === e.player.id) || m.player.team !== 1 - e.player.team) evBad.push('player ' + e.type); }
        if (typeof e.team === 'number' && e.team >= 0 && m.team !== 1 - e.team) evBad.push('team ' + e.type);
        if (typeof e.x === 'number' && !Object.is(m.x, -e.x)) evBad.push('x ' + e.type);
        if (e.score && (m.score[0] !== e.score[1] || m.score[1] !== e.score[0])) evBad.push('score ' + e.type);
        if (e.type === 'point' && (m.text !== e.text1 || m.text1 !== e.text)) evBad.push('text');
        if (e.type === 'point' && e.landSide >= 0 && m.landSide !== 1 - e.landSide) evBad.push('landSide');
        const m0 = NV.mapEvent(e, view, 0);
        if (m0.team !== e.team || (typeof e.x === 'number' && !Object.is(m0.x, e.x))) evBad.push('slot0 ' + e.type);
      }
    }
    if (i % 97 === 0) {
      states[g.mode] = (states[g.mode] || 0) + 1; if (g.review) states.review++; if (g.hum[1].ai) states.ai++; if (g.tmo) states.tmo++;
      S.copyGame(copy, g);
      const h0 = deepHash(g);
      if (deepHash(copy) !== h0) { invBad++; semBad.push('copia'); }
      NV.flip(copy);
      const h1 = deepHash(copy);
      NV.flip(copy);
      invN++;
      if (deepHash(copy) !== h0 || h1 === h0) { invBad++; if (invBad < 4) console.log('    involución mal en', g.mode, 'tic', i); }
      // semántica de la vista
      NV.mirror(view, g, 1);
      const gp = g.hum[1].p, vp = view.ctrl;
      if (vp.id !== gp.id || vp.team !== 0 || !Object.is(vp.x, -gp.x) || !Object.is(vp.y, -gp.y)) semBad.push('ctrl');
      if (view.score[0] !== g.score[1] || view.sets[0] !== g.sets[1] || view.challenges[0] !== g.challenges[1]) semBad.push('marcador');
      if (!Object.is(view.ball.x, -g.ball.x) || !Object.is(view.ball.vy, -g.ball.vy) || view.ball.z !== g.ball.z) semBad.push('balón');
      if (!Object.is(view.pr1.x, -g.pr1.x) || !Object.is(view.pr3.y, -g.pr3.y)) semBad.push('predicción');
      if (view.serving !== 1 - g.serving || view.touchTeam !== (g.touchTeam < 0 ? g.touchTeam : 1 - g.touchTeam)) semBad.push('equipo');
      if (view.teams[0].some(q => q.team !== 0) || view.teams[0][0].id !== g.teams[1][0].id) semBad.push('teams');
      if (view.hitBuf !== S.slotGet(g, 1, 'hitBuf') || view.hum[0].team !== 0 || view.hum[0].p !== vp) semBad.push('hueco');
      if (g.hum[1].aim3.on && !Object.is(view.aim3.x, -g.hum[1].aim3.x)) semBad.push('aim3');
      if (view.players.map(q => q.team).join('') !== '0011') semBad.push('players');
      if (view.server && view.server.id !== g.server.id) semBad.push('server');
      if (g.lastPoint && view.lastPoint.team !== 1 - g.lastPoint.team) semBad.push('lastPoint');
      if (g.mode === 'serve' && g.serveState === 'ready' && g.server === gp && !(vp.x > 0)) semBad.push('invitado en x>0 al sacar');
    }
    if (g.finished && ++postEnd > 400) break;
  }
}
check('mirror(mirror(g)) = g bit a bit (copyGame + flip + flip)', invN > 1000 && invBad === 0, { fotos: invN, mal: invBad, estados: states });
check('la vista tiene sentido (ctrl, marcador, balón, equipos, hueco, aim3, saque del invitado en x > 0)', semBad.length === 0, [...new Set(semBad)].slice(0, 8));
check('ningún campo de g sin clasificar', unk.g.size === 0, [...unk.g]);
check('ningún campo de jugador sin clasificar', unk.player.size === 0, [...unk.player]);
check('ningún campo de objeto anidado sin clasificar', unk.nested.size === 0, [...unk.nested]);
check('ningún campo de evento sin clasificar', unk.event.size === 0, [...unk.event]);
check('eventos remapeados (jugador por id, equipo, x, marcador, texto del punto, slot 0 tal cual)', evN > 500 && evBad.length === 0, { eventos: evN, mal: [...new Set(evBad)].slice(0, 8) });
check('pasa por saque, peloteo, punto, revisión, IA, tiempo muerto y final', states.serve && states.rally && states.point && states.review && states.ai && states.tmo && states.over, states);
// todos los campos de FIELDS existen de verdad en g (lista sin restos)
{
  const g = S.createGame({ online: true, seed: 1, venue: 'hall', humans: [{}, {}] });
  const extra = Object.keys(NV.FIELDS).filter(k => !(k in g) && ['blockBy', 'atkServe', '_digWho', 'antennaHit', '_rc', '_lv', 'lastLand', 'netSince', 'review', 'tmo', 'fl'].indexOf(k) < 0);   // (fl: Online V2 Fluida, solo con Sim.flInit)
  check('FIELDS sin campos que no existen', extra.length === 0, extra);
}

console.log('== (2) entrada del invitado: inputToWorld + espejo = el movimiento que pidió en pantalla ==');
{
  let bad = 0, n = 0;
  for (const dir of [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7, 0.7]]) {
    const g = S.createGame({ online: true, seed: 3, venue: 'hall', humans: [{}, {}] });
    const view = S.createGame({ online: true, seed: 3, venue: 'hall', humans: [{}, {}] });
    for (let i = 0; i < 120 * 30 && !(g.mode === 'rally' && g.lastTouchT > 0); i++) S.step(g, DT, [{ move: [0, 0], hit: g.mode === 'serve' && g.serveState === 'ready' && g.serveT > 1 }, { move: [0, 0] }]);
    NV.mirror(view, g, 1); const x0 = view.ctrl.x, y0 = view.ctrl.y;
    const inV = { move: dir }, inW = NV.inputToWorld(inV, 1);
    for (let i = 0; i < 12; i++) S.step(g, DT, [{ move: [0, 0] }, inW]);
    NV.mirror(view, g, 1);
    const dx = view.ctrl.x - x0, dy = view.ctrl.y - y0, d = Math.hypot(dx, dy);
    n++; if (!(d > 0.01 && (dx * dir[0] + dy * dir[1]) / (d * Math.hypot(dir[0], dir[1])) > 0.9)) { bad++; console.log('    dir', dir, 'movió', dx.toFixed(3), dy.toFixed(3)); }
  }
  check('el jugador del invitado se mueve en la vista hacia donde apunta su entrada', bad === 0, { direcciones: n, mal: bad });
  const w0 = NV.inputToWorld({ move: [0.3, -0.5], hit: true }, 0), w1 = NV.inputToWorld({ move: [0.3, -0.5], hit: true }, 1);
  check('inputToWorld: el anfitrión tal cual, el invitado girado, los botones igual', w0.move[0] === 0.3 && w1.move[0] === -0.3 && w1.move[1] === 0.5 && w1.hit === true);
}
console.log('\n' + oks + ' ok, ' + fails + ' fallos');
process.exit(fails ? 1 : 0);
