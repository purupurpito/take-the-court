/* TAKE THE COURT — js/resume.js  (owner: ui_main)
 * «Retomar el partido» (1.22.0, informe de juegos de vóley 4.9): si el sistema mata el navegador (o cierras la pestaña) a mitad de un
 * partido, al volver la portada ofrece «Seguir el partido 18-15 · 2º set» y el partido sigue EXACTAMENTE donde estaba.
 *
 *  - Qué se guarda: al terminar cada punto (evento 'point'), al resolverse un challenge ('challengeResult') y al preparar el saque
 *    siguiente ('serveReady'), una foto de la partida (VB.Sim.serialize: el grafo entero de g con g.rng, las estadísticas de la sim, la
 *    rotación, el líbero, los cambios, la zona, el saque de firma…) más las opciones con las que se creó (las de Sim.createGame tal cual,
 *    así los ajustes que cambies entre medias no la rompen) y lo que cuentan los módulos durante el partido (hoja final de ui.js,
 *    Estadística del partido, insignias y retos). Solo después de un punto: cerrar la pestaña nunca deja repetir un punto.
 *  - Clave make-the-cut.resume (JSON). Sello con VB.VERSION: si la versión cambia, la foto se descarta (la sim puede ser otra).
 *    Al restaurar se comprueba que Sim.stateHash de la partida rehecha sea el de la foto; si no cuadra, se descarta.
 *  - Qué partidos: Partido rápido (2v2, 6v6, playa, cortos, «Jugar ya», reto del día). Nunca el online, la demo, el autopilot, el
 *    espectador, el Entrenamiento, la situación de la semana (22-24) ni las pruebas de fichaje (cerrar a mitad de una prueba sigue
 *    suspendiéndola: decisión de Ferran del 15-nov). Carrera: detrás del interruptor CAREER, APAGADO (notes/resume.md: la nota en
 *    directo, las consignas y el ambiente viven en career.js con funciones dentro y no se pueden guardar aún; ?resumecareer=1 lo
 *    enciende para probar).
 *  - Se borra al acabar el partido (gameOver), al salir al menú a mitad (abandonar) y al empezar cualquier otro partido.
 *
 * API (VB.Resume; main.js la usa, ui.js / menu-jugador.js solo leen peek):
 *   arm(g, meta)          partido g apto: meta = {kind: 'quick'|'career', opts (las de startMatch), gOpts (las de Sim.createGame), map, qs,
 *                         cm (Carrera: firma del partido), played (true = ya lleva puntos: el retomado)}. Sin arm, onFrame no guarda nada.
 *   disarm()              deja de guardar (sin borrar lo guardado).
 *   onFrame(g, events)    main.js, cada frame con eventos, DESPUÉS de UI.update: guarda o borra según los eventos.
 *   save(g) → bool        guarda ya (si g está armado y ya se ha jugado algún punto).
 *   load() → rec | null   lo guardado si es de esta versión y sano (si no, lo borra).
 *   peek() → {kind, score, sets, setNo, one, label, sub} | null   para la portada (sin la foto).
 *   apply(rec, g) → bool  rehace la partida g (creada con rec.gOpts) con la foto; comprueba la huella.
 *   mods(rec, g)          devuelve a los módulos (ui, estadística, insignias, retos) lo que llevaban contado.
 *   clear()               borra lo guardado.
 *   setLabel(n) → '1r set' | '2º set' | '3r set' | '4º set' | '5º set'
 *   CAREER                interruptor de la Carrera (false).
 * Sin DOM ni Three: se prueba en node (tools/resumetest.js).
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var KEY = 'make-the-cut.resume', FMT = 1;
  var Q = {};
  try { (root.location && root.location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); Q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '1' : decodeURIComponent(kv.slice(i + 1)); }); } catch (e) { }

  var armed = null;   // {g, meta, pts}
  var mem = null;     // sin localStorage (node, modo privado que lo bloquea): en memoria

  function store() { try { return root.localStorage || null; } catch (e) { return null; } }
  function getRaw() { var s = store(); if (!s) return mem; try { return s.getItem(KEY); } catch (e) { return null; } }
  function setRaw(v) {
    var s = store(); if (!s) { mem = v; return true; }
    try { s.setItem(KEY, v); return true; } catch (e) { try { s.removeItem(KEY); } catch (e2) { } return false; }   // (cuota llena: mejor nada que una foto vieja)
  }
  function clear() { var s = store(); mem = null; if (s) { try { s.removeItem(KEY); } catch (e) { } } }
  function ver() { return String(VB.VERSION || ''); }

  function setLabel(n) { n = n | 0; return n + (n === 1 || n === 3 ? 'r' : 'º') + ' set'; }

  /** Copia JSON de un objeto de módulo sin referencias a la partida ni a jugadores (los jugadores pasan a {$pid}). */
  function plain(o, g) {
    var seen = [];
    function enc(v) {
      if (v === g) return { $g: 1 };
      if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
      if (v.id != null && g && playerById(g, v.id) === v) return { $pid: v.id };   // jugador de la sim
      if (seen.indexOf(v) >= 0) return null;
      seen.push(v);
      var out = Array.isArray(v) ? [] : {}, k;
      if (Array.isArray(v)) for (var i = 0; i < v.length; i++) out.push(enc(v[i]));
      else for (k in v) { var x = enc(v[k]); if (x !== undefined) out[k] = x; }
      seen.pop();
      return out;
    }
    return enc(o);
  }
  function playerById(g, id) {
    var L = g.players || [], i, t;
    for (i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    if (g.roster) for (t = 0; t < 2; t++) for (i = 0; i < g.roster[t].length; i++) if (g.roster[t][i].id === id) return g.roster[t][i];
    if (g.libero) for (t = 0; t < 2; t++) if (g.libero[t] && g.libero[t].id === id) return g.libero[t];
    return null;
  }
  /** Al revés que plain: {$g} → g y {$pid} → el jugador de g con ese id. */
  function unplain(o, g) {
    if (o === null || typeof o !== 'object') return o;
    if (o.$g === 1) return g;
    if (o.$pid !== undefined) return playerById(g, o.$pid);
    if (Array.isArray(o)) return o.map(function (x) { return unplain(x, g); });
    var out = {}; for (var k in o) out[k] = unplain(o[k], g); return out;
  }

  /** Lo que llevan contado los módulos durante el partido (cada uno da y recibe datos planos). */
  var MODS = [['UI', 'ui'], ['MatchStats', 'ms'], ['Badges', 'bd'], ['Retos', 'rt']];
  function modsGet(g) {
    var o = {};
    for (var i = 0; i < MODS.length; i++) {
      var M = VB[MODS[i][0]]; if (!M || typeof M.resumeGet !== 'function') continue;
      try { var v = M.resumeGet(g); if (v != null) o[MODS[i][1]] = plain(v, g); } catch (e) { }
    }
    return o;
  }
  function mods(rec, g) {
    var o = rec && rec.mods; if (!o) return;
    for (var i = 0; i < MODS.length; i++) {
      var M = VB[MODS[i][0]], v = o[MODS[i][1]]; if (!M || typeof M.resumeSet !== 'function' || v == null) continue;
      try { M.resumeSet(unplain(v, g), g); } catch (e) { try { console.error('[VB][ERROR] Resume.mods ' + MODS[i][0] + ': ' + e); } catch (e2) { } }
    }
  }

  function arm(g, meta) { armed = g && meta ? { g: g, meta: meta, pts: meta.played ? 1 : 0 } : null; }
  function disarm() { armed = null; }
  // (solo cuenta un punto JUGADO aquí: un partido que empieza con marcador —«Final apretado» a 20-20— no se ofrece hasta su primer punto)
  function played() { return armed.pts > 0; }

  function save(g) {
    var S = VB.Sim; if (!armed || armed.g !== g || !S || !S.serialize || g.finished || !played()) return false;
    var m = armed.meta, snap;
    try { snap = S.serialize(g); } catch (e) { return false; }
    var rec = { f: FMT, v: ver(), t: Date.now(), kind: m.kind, opts: m.opts || {}, gOpts: m.gOpts, map: m.map || '', qs: m.qs || null, cm: m.cm || null,
      sc: { score: [g.score[0] | 0, g.score[1] | 0], sets: [g.sets[0] | 0, g.sets[1] | 0], setNo: g.setNo | 0, one: !!g.bo1 || (g.toWin | 0) === 1, size: g.size | 0 },
      h: S.stateHash(g) >>> 0, snap: snap, mods: modsGet(g) };
    var txt; try { txt = JSON.stringify(rec); } catch (e) { return false; }
    return setRaw(txt);
  }

  function onFrame(g, events) {
    if (!armed || armed.g !== g || !events || !events.length) return;
    var want = false;
    for (var i = 0; i < events.length; i++) {
      var t = events[i].type;
      if (t === 'gameOver') { clear(); armed = null; return; }
      if (t === 'point' && !events[i].replay) { armed.pts++; want = true; }
      else if (t === 'challengeResult' || t === 'serveReady') want = true;
    }
    if (want && !g.finished) save(g);
  }

  function load() {
    var raw = getRaw(); if (!raw) return null;
    var r = null; try { r = JSON.parse(raw); } catch (e) { r = null; }
    if (!r || r.f !== FMT || r.v !== ver() || !r.snap || !r.gOpts || !r.sc || (r.kind !== 'quick' && r.kind !== 'career')) { clear(); return null; }
    return r;
  }
  function peek() {
    var r = load(); if (!r) return null;
    if (r.kind === 'career' && !api.CAREER) return null;
    var sc = r.sc, a = sc.score[0] | 0, b = sc.score[1] | 0;
    var sub = a + '-' + b + ' · ' + (sc.one ? 'set único' : setLabel(sc.setNo));
    return { kind: r.kind, score: [a, b], sets: sc.sets.slice(), setNo: sc.setNo, one: sc.one, size: sc.size, label: 'Seguir el partido', sub: sub };
  }
  function apply(rec, g) {
    var S = VB.Sim; if (!rec || !g || !S || !S.deserialize) return false;
    var ok = null; try { ok = S.deserialize(rec.snap, g); } catch (e) { ok = null; }
    if (!ok) return false;
    return (S.stateHash(g) >>> 0) === (rec.h >>> 0);
  }

  var api = VB.Resume = {
    KEY: KEY, CAREER: Q.resumecareer === '1',
    arm: arm, disarm: disarm, armed: function () { return armed ? armed.g : null; }, onFrame: onFrame, save: save, load: load, peek: peek,
    apply: apply, mods: mods, clear: clear, setLabel: setLabel, _plain: plain, _unplain: unplain
  };
})();
