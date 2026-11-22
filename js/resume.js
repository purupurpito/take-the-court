/* TAKE THE COURT — js/resume.js  (owner: ui_main)
 * «Retomar el partido» (1.22.0, informe de juegos de vóley 4.9): si el sistema mata el navegador (o cierras la pestaña) a mitad de un
 * partido, al volver la portada ofrece «Seguir el partido 18-15 · 2º set» y el partido sigue EXACTAMENTE donde estaba.
 *
 *  - Qué se guarda: al terminar cada punto (evento 'point'), al resolverse un challenge ('challengeResult') y al preparar el saque
 *    siguiente ('serveReady'), una foto de la partida (VB.Sim.serialize: el grafo entero de g con g.rng, las estadísticas de la sim, la
 *    rotación, el líbero, los cambios, la zona, el saque de firma…) más las opciones con las que se creó (las de Sim.createGame tal cual,
 *    así los ajustes que cambies entre medias no la rompen) y lo que cuentan los módulos durante el partido (hoja final de ui.js,
 *    Estadística del partido, insignias, retos y, en la Carrera, career.js: nota en directo, consignas, ambiente y «Te tienen estudiado»).
 *    Nunca con eventos de la sim sin repartir (g.events: p. ej. el punto de castigo que el ambiente acaba de pitar): se guarda en el
 *    siguiente.
 *  - PUNTO EN JUEGO (22-nov-2026, revisión de la rama): la foto es la de antes del saque, con el mismo g.rng, así que cerrar la pestaña
 *    a mitad de un peloteo y retomar dejaría repetir ese punto (hasta ganarlo). Por eso, en cuanto el punto se pone en juego (lanzamiento
 *    del saque o cualquier golpe después de la foto), la MISMA clave se reescribe con live: 1 (el texto ya guardado con un campo más, sin
 *    serializar otra vez). Partido rápido: retomar una foto con live: 1 se puede, pero ese partido ya NO CUENTA (récord, racha, perfil,
 *    XP, insignias ni retos: g.rsNc, como los partidos cortos) y las fotos siguientes llevan nc: 1. Carrera: ese punto se da por
 *    PERDIDO (main.js, Sim.concede: punto para el rival, sin repetirlo).
 *  - CARRERA (22-nov-2026, decisión de Ferran: «No quiero que sea posible ir reiniciando tu progreso constantemente en los partidos del
 *    modo carrera. Cada vez que se acabe un punto se guarda.»): los partidos de la jornada (2v2 y 6v6) y los de las extensiones (selección,
 *    Estrellas, juvenil) se guardan aparte, en make-the-cut.resume.career, también al preparar el PRIMER saque (sin puntos: el primer
 *    peloteo ya cuenta) y al cerrarse una protesta del ambiente (amb:choiceEnd: su resultado no se puede volver a elegir). Salir al menú no
 *    lo borra (la Carrera queda bloqueada en ese partido hasta acabarlo) y una foto de otra versión no se tira aquí: main.js resuelve el
 *    partido desde el marcador guardado (raw). Todo en notes/resume.md («Carrera»). Las pruebas de fichaje no: cerrar a mitad de una prueba
 *    sigue suspendiéndola (decisión de Ferran del 15-nov). CAREER = true (?resumecareer=0 lo apaga, solo para pruebas).
 *  - Claves make-the-cut.resume (Partido rápido) y make-the-cut.resume.career (JSON; solo en el aparato: account.js no las sube). Sello
 *    con VB.VERSION: Partido rápido de otra versión se descarta. Al restaurar se comprueba que Sim.stateHash de la partida rehecha sea el
 *    de la foto.
 *  - Qué partidos: Partido rápido (2v2, 6v6, playa, cortos, «Jugar ya», reto del día) y la Carrera de arriba. Nunca el online, la demo,
 *    el autopilot, el espectador, el Entrenamiento, la situación de la semana (22-24) ni las pruebas de fichaje.
 *  - Se borra al acabar el partido (gameOver); el de Partido rápido, también al salir al menú a mitad (abandonar) y al empezar otro.
 *
 * API (VB.Resume; main.js la usa, ui.js / menu-jugador.js / career-ui.js solo leen peek):
 *   arm(g, meta)          partido g apto: meta = {kind: 'quick'|'career', opts (las de startMatch), gOpts (las de Sim.createGame), map, qs,
 *                         cm (Carrera: firma del partido), played (true = ya lleva puntos: el retomado), nc (no cuenta)}. Sin arm, onFrame no guarda nada.
 *   disarm()              deja de guardar (sin borrar lo guardado).
 *   onFrame(g, events)    main.js, cada frame con eventos, DESPUÉS de UI.update: guarda o borra según los eventos.
 *   save(g) → bool        guarda ya (si g está armado y ya se ha jugado algún punto; en la Carrera, desde el primer saque).
 *   markLive() → bool     marca la última foto como «punto en juego» (live: 1); onFrame lo hace solo con 'toss' / 'hit'.
 *   noCount(rec) → bool   Partido rápido: la foto es de un punto en juego (live) o de un partido ya retomado así (nc): no cuenta.
 *   lost(rec) → bool      Carrera: la foto es de un punto en juego: al retomarla, ese punto es para el rival.
 *   load(kind) → rec|null lo guardado si es de esta versión y sano ('quick' | 'career'; sin kind, el de la Carrera primero). Un Partido
 *                         rápido que no vale se borra; uno de Carrera, no (raw).
 *   raw(kind) → obj|null  lo guardado tal cual (sin mirar versión ni foto): main.js saca el marcador de una foto de Carrera que no vale.
 *   peek() → {kind, score, sets, setNo, one, label, sub} | null   para la portada (sin la foto; la Carrera primero).
 *   apply(rec, g) → bool  rehace la partida g (creada con rec.gOpts) con la foto; comprueba la huella.
 *   mods(rec, g)          devuelve a los módulos (ui, estadística, insignias, retos, Carrera) lo que llevaban contado.
 *   clear(kind)           borra lo guardado ('quick' | 'career'; sin kind, los dos).
 *   setLabel(n) → '1r set' | '2º set' | '3r set' | '4º set' | '5º set'
 *   CAREER                interruptor de la Carrera (true).
 * Sin DOM ni Three: se prueba en node (tools/resumetest.js).
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var KEY = 'make-the-cut.resume', KEYS = { quick: KEY, career: KEY + '.career' }, FMT = 1;
  var Q = {};
  try { (root.location && root.location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); Q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '1' : decodeURIComponent(kv.slice(i + 1)); }); } catch (e) { }

  var armed = null;   // {g, meta, pts, txt, live, k}
  var mem = { quick: null, career: null };     // sin localStorage (node, modo privado que lo bloquea): en memoria

  function kindOf(k) { return k === 'career' ? 'career' : 'quick'; }
  function store() { try { return root.localStorage || null; } catch (e) { return null; } }
  function getRaw(k) { k = kindOf(k); var s = store(); if (!s) return mem[k]; try { return s.getItem(KEYS[k]); } catch (e) { return null; } }
  function setRaw(k, v) {
    k = kindOf(k); var s = store(); if (!s) { mem[k] = v; return true; }
    try { s.setItem(KEYS[k], v); return true; } catch (e) { try { s.removeItem(KEYS[k]); } catch (e2) { } return false; }   // (cuota llena: mejor nada que una foto vieja)
  }
  function clear1(k) { k = kindOf(k); var s = store(); mem[k] = null; if (s) { try { s.removeItem(KEYS[k]); } catch (e) { } } }
  function clear(k) { if (k === 'quick' || k === 'career') clear1(k); else { clear1('quick'); clear1('career'); } }
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
  /** Como plain pero conservando el grafo (objetos compartidos y ciclos como {$r: i}; -0, NaN, ±Infinity y undefined como en
   *  Sim.serialize; las funciones no van). Para la Carrera: la nota en directo comparte avisos entre st.log y st.sanLog, las consignas
   *  guardan instantáneas, el ambiente lleva eventos con jugadores… → {r, o}. */
  var SKIP = {};
  function pack(v, g) {
    var ids = typeof Map === 'function' ? new Map() : null, objs = [], list = [];
    function idOf(x) { if (ids) return ids.get(x); var i = list.indexOf(x); return i < 0 ? undefined : i; }
    function enc(x) {
      if (typeof x === 'number') return x === 0 && 1 / x < 0 ? { $n: '-0' } : isFinite(x) ? x : { $n: String(x) };
      if (x === undefined) return { $u: 1 };
      if (typeof x === 'function') return SKIP;
      if (x === null || typeof x !== 'object') return x;
      if (g && x === g) return { $g: 1 };
      if (g && x.id != null && playerById(g, x.id) === x) return { $pid: x.id };
      var id = idOf(x); if (id !== undefined) return { $r: id };
      id = objs.length; if (ids) ids.set(x, id); else list.push(x);
      var slot = Array.isArray(x) ? [] : {}, k, e; objs.push(slot);
      if (Array.isArray(x)) for (var i = 0; i < x.length; i++) { e = enc(x[i]); slot.push(e === SKIP ? null : e); }
      else for (k in x) { e = enc(x[k]); if (e !== SKIP) slot[k] = e; }
      return { $r: id };
    }
    var r = enc(v);
    return { r: r === SKIP ? null : r, o: objs };
  }
  function unpack(p, g) {
    if (!p || !Array.isArray(p.o)) return null;
    var O = p.o, out = new Array(O.length), i;
    for (i = 0; i < O.length; i++) out[i] = Array.isArray(O[i]) ? [] : {};
    function dec(v) {
      if (v === null || typeof v !== 'object') return v;
      if (v.$r !== undefined) return out[v.$r];
      if (v.$pid !== undefined) return g ? playerById(g, v.$pid) : null;
      if (v.$g !== undefined) return g || null;
      if (v.$n !== undefined) return v.$n === '-0' ? -0 : Number(v.$n);
      if (v.$u !== undefined) return undefined;
      return v;
    }
    for (i = 0; i < O.length; i++) {
      var o = O[i], t = out[i], k;
      if (Array.isArray(o)) for (var j = 0; j < o.length; j++) t[j] = dec(o[j]);
      else for (k in o) t[k] = dec(o[k]);
    }
    return dec(p.r);
  }

  /** Lo que llevan contado los módulos durante el partido (cada uno da y recibe datos planos; los de grafo, con pack). */
  var MODS = [['UI', 'ui'], ['MatchStats', 'ms'], ['Badges', 'bd'], ['Retos', 'rt'], ['Career', 'cr', 1]];
  function modsGet(g) {
    var o = {};
    for (var i = 0; i < MODS.length; i++) {
      var M = VB[MODS[i][0]]; if (!M || typeof M.resumeGet !== 'function') continue;
      try { var v = M.resumeGet(g); if (v != null) o[MODS[i][1]] = MODS[i][2] ? pack(v, g) : plain(v, g); } catch (e) { }
    }
    return o;
  }
  function mods(rec, g) {
    var o = rec && rec.mods; if (!o) return;
    for (var i = 0; i < MODS.length; i++) {
      var M = VB[MODS[i][0]], v = o[MODS[i][1]]; if (!M || typeof M.resumeSet !== 'function' || v == null) continue;
      try { M.resumeSet(MODS[i][2] ? unpack(v, g) : unplain(v, g), g); } catch (e) { try { console.error('[VB][ERROR] Resume.mods ' + MODS[i][0] + ': ' + e); } catch (e2) { } }
    }
  }

  function arm(g, meta) { armed = g && meta ? { g: g, meta: meta, k: kindOf(meta.kind), pts: meta.played ? 1 : 0, txt: null, live: false } : null; }
  function disarm() { armed = null; }
  // (solo cuenta un punto JUGADO aquí: un partido que empieza con marcador —«Final apretado» a 20-20— no se ofrece hasta su primer
  // punto. En la Carrera, desde el primer saque: cerrar a mitad del primer peloteo tampoco deja repetirlo)
  function played() { return armed.pts > 0 || armed.k === 'career'; }

  function save(g) {
    var S = VB.Sim; if (!armed || armed.g !== g || !S || !S.serialize || g.finished || !played()) return false;
    if (g.events && g.events.length) return false;   // (eventos sin repartir: la foto no los lleva; se guarda en el siguiente)
    var m = armed.meta, snap;
    try { snap = S.serialize(g); } catch (e) { return false; }
    var rec = { f: FMT, v: ver(), t: Date.now(), kind: m.kind, opts: m.opts || {}, gOpts: m.gOpts, map: m.map || '', qs: m.qs || null, cm: m.cm || null,
      sc: { score: [g.score[0] | 0, g.score[1] | 0], sets: [g.sets[0] | 0, g.sets[1] | 0], setNo: g.setNo | 0, one: !!g.bo1 || (g.toWin | 0) === 1, size: g.size | 0,
        ss: (g.setScores || []).map(function (x) { return [x[0] | 0, x[1] | 0]; }), pts: g.points | 0, tw: g.toWin | 0 || 2 },
      h: S.stateHash(g) >>> 0, snap: snap, mods: modsGet(g) };
    if (m.nc && armed.k !== 'career') rec.nc = 1;   // (retomado tras cerrar con el punto en juego: sigue sin contar)
    if (m.ext) rec.ext = m.ext;                   // (Carrera: partido de una extensión {id, arg, mode, cs})
    var txt; try { txt = JSON.stringify(rec); } catch (e) { return false; }
    armed.txt = null; armed.live = false;
    if (!setRaw(armed.k, txt)) return false;
    armed.txt = txt; return true;
  }
  /** El punto se ha puesto en juego después de la última foto: la misma foto con live: 1. Sin foto, nada. */
  function markLive() {
    if (!armed || armed.live || !armed.txt) return false;
    armed.live = true;
    return setRaw(armed.k, '{"live":1,' + armed.txt.slice(1));
  }

  function onFrame(g, events) {
    if (!armed || armed.g !== g || !events || !events.length) return;
    var want = false, live = false, car = armed.k === 'career';
    for (var i = 0; i < events.length; i++) {
      var t = events[i].type;
      if (t === 'gameOver') { clear1(armed.k); armed = null; return; }
      if (t === 'point' && !events[i].replay) { armed.pts++; want = true; live = false; }
      else if (t === 'challengeResult' || t === 'serveReady' || (car && t === 'amb:choiceEnd')) { want = true; if (t !== 'amb:choiceEnd') live = false; }
      else if (t === 'toss' || t === 'hit') live = true;   // (punto en juego: lanzamiento del saque o golpe)
    }
    if (want && !g.finished) save(g);
    if (live && !g.finished) markLive();
  }

  function sane(r) { return !!r && r.f === FMT && r.v === ver() && !!r.snap && !!r.gOpts && !!r.sc && (r.kind === 'quick' || r.kind === 'career'); }
  function raw(kind) {
    var s = getRaw(kind || 'career'); if (!s) return null;
    try { var r = JSON.parse(s); return r && typeof r === 'object' ? r : null; } catch (e) { return null; }
  }
  function load1(k) {
    var r = raw(k); if (!r) { if (getRaw(k)) { if (k === 'quick') clear1(k); } return null; }
    if (!sane(r) || kindOf(r.kind) !== k) { if (k === 'quick') clear1(k); return null; }   // (la de Carrera no se tira: main.js la resuelve)
    return r;
  }
  function load(kind) {
    if (kind === 'quick' || kind === 'career') return load1(kind);
    return (api.CAREER ? load1('career') : null) || load1('quick');
  }
  function peek() {
    var r = load(); if (!r) return null;
    if (r.kind === 'career' && !api.CAREER) return null;
    var sc = r.sc, a = sc.score[0] | 0, b = sc.score[1] | 0;
    var sub = a + '-' + b + ' · ' + (sc.one ? 'set único' : setLabel(sc.setNo));
    return { kind: r.kind, score: [a, b], sets: sc.sets.slice(), setNo: sc.setNo, one: sc.one, size: sc.size, label: 'Seguir el partido', sub: sub, nc: noCount(r), lost: lost(r) };
  }
  /** Partido rápido: ¿lo retomado ya no cuenta? (cerrado con el punto en juego, o retomado así antes). La Carrera nunca (lost). */
  function noCount(rec) { return !!(rec && rec.kind !== 'career' && (rec.live === 1 || rec.nc === 1)); }
  /** Carrera: ¿se cerró con el punto en juego? (al retomar, ese punto es para el rival) */
  function lost(rec) { return !!(rec && rec.kind === 'career' && rec.live === 1); }
  function apply(rec, g) {
    var S = VB.Sim; if (!rec || !g || !S || !S.deserialize) return false;
    var ok = null; try { ok = S.deserialize(rec.snap, g); } catch (e) { ok = null; }
    if (!ok) return false;
    return (S.stateHash(g) >>> 0) === (rec.h >>> 0);
  }

  var api = VB.Resume = {
    KEY: KEY, KEYS: KEYS, CAREER: Q.resumecareer !== '0',
    arm: arm, disarm: disarm, armed: function () { return armed ? armed.g : null; }, armedKind: function () { return armed ? armed.k : ''; },
    onFrame: onFrame, save: save, load: load, raw: raw, peek: peek,
    apply: apply, mods: mods, clear: clear, noCount: noCount, lost: lost, markLive: markLive, setLabel: setLabel,
    _plain: plain, _unplain: unplain, _pack: pack, _unpack: unpack
  };
})();
