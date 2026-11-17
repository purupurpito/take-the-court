/* MAKE THE CUT — js/acta.js (owner: ui_main)
 * VB.Acta: «Acta del partido». Convierte el registro de un partido 6v6 (VB.MatchStats.data(): plantilla, alineación de cada set,
 * rallies y lo que pasa a balón muerto) en un acta en el formato de emPat ("format": "empat/acta", versión 1), la app del acta
 * electrónica de vóley. emPat nunca guarda el estado: reconstruye el partido con su motor a partir de la lista de jugadas
 * (plays), así que aquí solo se escriben jugadas:
 *   roster (plantilla de cada lado) · toss (sorteo: set 1 y el decisivo) · lineup (seis iniciales de cada set, de la zona 1 a la 6)
 *   · startPeriod · rally {side: quien gana el punto} · substitution · liberoIn / liberoOut · timeout.
 * Equipo 0 = local (home), equipo 1 = visitante (away). Dorsales en texto, como en emPat.
 * El líbero que rota a la delantera sale solo en emPat (salida automática, sin liberoExitConfirm): para no apuntar dos veces esa
 * salida, aquí se sigue la rotación igual que el motor de emPat y la salida del juego se omite cuando emPat ya la ha hecho.
 * Puro: build(data, meta) no toca el DOM ni la sim. Solo 6v6 (emPat es el acta de pista de 6). tools/actatest.js lo comprueba
 * contra el motor de emPat si está al lado (../acta-electronica).
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var SIDE = ['home', 'away'];
  var ROLE_NAME = { S: 'Colocador', OH: 'Receptor', MB: 'Central', OPP: 'Opuesto', L: 'Líbero' };
  var FRONT_ENTRY = 3;   // índice de la zona 4 en la rotación (zona 1 = índice 0): el líbero que llega ahí sale (FIVB 19.3.1.3)

  /** ¿Se puede hacer acta de este registro? (6v6 con plantilla y al menos un set empezado con punto jugado) */
  function available(d) {
    if (!d || d.size !== 6 || !d.sq || !d.lu || !d.lu[1]) return false;
    for (var i = 0; i < d.rallies.length; i++) if (d.rallies[i].w >= 0) return true;
    return false;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoAt(ms) { return new Date(ms).toISOString(); }

  /** Plantilla de un lado en jugada roster. Capitán: el colocador titular (o el primero que no sea líbero). */
  function rosterPlay(sq, t, name) {
    var L = sq[t], cap = -1, i, players = [];
    for (i = 0; i < L.length; i++) if (L[i].ro === 'S') { cap = i; break; }
    if (cap < 0) for (i = 0; i < L.length; i++) if (L[i].ro !== 'L') { cap = i; break; }
    var seen = {};
    for (i = 0; i < L.length; i++) {
      var p = L[i], sh = String(p.n | 0);
      if (seen[sh]) continue; seen[sh] = 1;
      var o = { shirt: sh, name: (p.nm || '').slice(0, 40) || ROLE_NAME[p.ro] || 'Jugador' };   // (sin nombre: el puesto; emPat imprime la última palabra)
      if (i === cap) o.captain = true;
      if (p.ro === 'L') o.libero = true;
      players.push(o);
    }
    return { kind: 'roster', side: SIDE[t], name: name, players: players, staff: [] };
  }

  /**
   * Acta de emPat a partir del registro. meta = {home, away (nombres), competition, category, venue, town, id, now (ms)}.
   * Devuelve null si no hay 6v6 que apuntar.
   */
  function build(d, meta) {
    if (!available(d)) return null;
    meta = meta || {};
    var now = +meta.now || Date.now();
    var names = [String(meta.home || 'Equipo local').slice(0, 60), String(meta.away || 'Equipo visitante').slice(0, 60)];
    var setPts = d.points || 25, sets = [];
    for (var i = 0; i < d.rallies.length; i++) { var s0 = d.rallies[i].s | 0; if (d.rallies[i].w >= 0 && sets.indexOf(s0) < 0) sets.push(s0); }
    var bo1 = !!(d.bo1 || meta.bo1);
    var bestOf = bo1 ? 1 : 3;
    var settings = { bestOf: bestOf, setPoints: setPts, deciderPoints: bo1 ? setPts : Math.min(15, setPts), timeouts: 2, substitutions: 6,
      deciderSwitch: bo1 ? Math.ceil(setPts / 2) : 8, liberoAllowed: true, fullSetRule: false };
    // reloj de las jugadas: el partido «empieza» hace tantos rallies × 25 s como tiene, y cada jugada avanza 25 s (o 3 s a balón muerto)
    var clock = now - (d.rallies.length * 25 + d.ac.length * 3 + sets.length * 180) * 1000;
    var plays = [];
    function push(p, dt) { clock += (dt == null ? 25 : dt) * 1000; p.at = isoAt(clock); plays.push(p); }

    push(rosterPlay(d.sq, 0, names[0]), 0);
    push(rosterPlay(d.sq, 1, names[1]), 0);

    // espejo de la rotación de emPat (para la salida automática del líbero)
    var rot = [[], []], lib = [null, null], serving = 0, setNo = 0, ai = 0, started = false;
    function startSet(s) {
      var lu = d.lu[s] || d.lu[setNo] || d.lu[1];
      setNo = s;
      var decider = s === bestOf;
      if (s === 1 || decider) push({ kind: 'toss', server: SIDE[lu.sv], left: SIDE[0] }, 60);
      for (var t = 0; t < 2; t++) {
        rot[t] = lu.r[t].slice(); lib[t] = null;
        push({ kind: 'lineup', side: SIDE[t], shirts: rot[t].map(String) }, 0);
      }
      serving = lu.sv;
      push({ kind: 'startPeriod' }, 60);
      started = true;
    }
    function action(a) {
      var t = a.t, side = SIDE[t];
      if (a.k === 'tmo') { push({ kind: 'timeout', side: side }, 30); return; }
      if (a.k === 'sub') {
        var z = rot[t].indexOf(a.o);
        if (z >= 0) rot[t][z] = a.n;
        push({ kind: 'substitution', side: side, leaving: String(a.o), entering: String(a.n) }, 3);
        return;
      }
      // líbero: entra (n es el líbero) o sale (o es el líbero)
      var libIn = isLibero(t, a.n), libOut = isLibero(t, a.o);
      if (libIn && !libOut) {
        if (lib[t]) { if (lib[t].rep === a.o) return; push({ kind: 'liberoOut', side: side }, 3); lib[t] = null; }
        if (rot[t].indexOf(a.o) < 0) return;
        lib[t] = { sh: a.n, rep: a.o };
        push({ kind: 'liberoIn', side: side, libero: String(a.n), leaving: String(a.o) }, 3);
      } else if (libOut && !libIn) {
        if (!lib[t]) return;   // emPat ya lo sacó al rotar a la delantera (o al empezar el set)
        lib[t] = null;
        push({ kind: 'liberoOut', side: side }, 3);
      }
    }
    var libSet = [{}, {}];
    for (var tt = 0; tt < 2; tt++) for (var k = 0; k < d.sq[tt].length; k++) if (d.sq[tt][k].ro === 'L') libSet[tt][d.sq[tt][k].n | 0] = 1;
    function isLibero(t, n) { return !!libSet[t][n | 0]; }

    for (var j = 0; j < d.rallies.length; j++) {
      var r = d.rallies[j];
      if (r.w < 0) continue;
      if (!started || (r.s | 0) !== setNo) startSet(r.s | 0);
      while (ai < d.ac.length && d.ac[ai].i <= j) {
        var a = d.ac[ai++];
        if ((a.s | 0) === setNo) action(a);   // (lo de otro set: la limpieza del líbero entre sets, que emPat ya hace)
      }
      push({ kind: 'rally', side: SIDE[r.w] });
      if (r.w !== serving) {
        serving = r.w;
        rot[r.w].push(rot[r.w].shift());
        if (lib[r.w] && rot[r.w].indexOf(lib[r.w].rep) === FRONT_ENTRY) lib[r.w] = null;
      }
    }

    var dt = new Date(now - (d.rallies.length * 25 + sets.length * 180) * 1000);
    var info = {
      competition: String(meta.competition || 'Make the Cut').slice(0, 80),
      category: String(meta.category || 'Sénior').slice(0, 40),
      homeName: names[0], awayName: names[1],
      venue: String(meta.venue || '').slice(0, 80), town: String(meta.town || '').slice(0, 60),
      date: dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate()),
      time: pad2(dt.getHours()) + ':' + pad2(dt.getMinutes())
    };
    var id = meta.id || ('mtc-' + now.toString(36));
    return { format: 'empat/acta', version: 1, id: id, createdAt: isoAt(now), updatedAt: isoAt(now), stage: 'live',
      settings: settings, info: info, plays: plays };
  }

  VB.Acta = { available: available, build: build };
})();
